// scripts/fetch-switch2.js
// Baut new_switch2_games.json mit { name, us, img, img2, price_eur, release_date }
// Robust: Age-Gate umgehen, NSUID extrahieren, Nintendo-Preis-API nutzen, USD→EUR-Fallback.
// Voraussetzungen: Node 18+ (wegen fetch), Playwright installiert (npm i playwright)

import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const OUT = path.resolve(process.cwd(), 'new_switch2_games.json');
const LIST_BASE = 'https://www.nintendo.com/us/store/games/nintendo-switch-2-games/';
const PAGE_URL  = (p) => `${LIST_BASE}?sort=df&p=${p}`;
const PRODUCT_PREFIX = '/us/store/products/';
const MAX_PAGES = 60;

// --- Helpers --------------------------------------------------------------

function heroFromSlug(slug){
  if(!slug) return '';
  const c = slug[0]?.toLowerCase?.() || 'x';
  return `https://assets.nintendo.com/image/upload/f_auto/q_auto/ncom/en_US/games/switch/${c}/${slug}/hero`;
}
function normDate(s){
  if(!s) return null;
  const d = new Date(String(s).trim());
  if (isNaN(d)) return null;
  const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,'0'), da=String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}
async function usdToEur(amountUsd){
  try{
    const r = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=EUR');
    const j = await r.json();
    const rate = j?.rates?.EUR;
    if(!rate) return null;
    return Math.round((amountUsd * rate) * 100) / 100;
  }catch{ return null; }
}

// ruft Nintendo-Preis-API (2 Varianten) ab und liefert {amount:number,currency:string} oder null
async function fetchNintendoPriceByNsuid(nsuid, country='DE', lang='de'){
  if(!nsuid) return null;

  // 1) Regionale API, z.B. ec.nintendo.com/api/DE/de/price?ids=
  const tryUrls = [
    `https://ec.nintendo.com/api/${country}/${lang}/price?ids=${nsuid}`,
    // 2) Alternative v1-Format
    `https://api.ec.nintendo.com/v1/price?country=${country}&lang=${lang}&ids=${nsuid}`
  ];

  for(const url of tryUrls){
    try{
      const r = await fetch(url, { headers: { 'accept': 'application/json' } });
      if(!r.ok) continue;
      const j = await r.json();

      // Mögliche Formen vereinheitlichen
      const pricesArr = j?.prices || j?.data || j?.items || [];
      const entry = Array.isArray(pricesArr) ? pricesArr.find(p =>
        String(p?.title_id || p?.id || p?.nsuid) === String(nsuid)
      ) : null;

      // Direktes Mapping (häufiges Schema)
      const regular = entry?.regular_price || entry?.price || entry?.regularPrice;
      const amountStr = (regular?.amount || regular?.raw_value || regular?.value || '').toString();
      const currency  = (regular?.currency || regular?.currency_code || '').toString().toUpperCase();

      if(amountStr && !isNaN(parseFloat(amountStr))){
        return { amount: parseFloat(amountStr), currency: currency || (country==='DE'?'EUR':'USD') };
      }

      // Alternatives Schema (manchmal anders benannt)
      const maybeAmount = parseFloat(entry?.amount || entry?.final_price || entry?.base_price);
      if(!isNaN(maybeAmount)){
        const cur = (entry?.currency || entry?.currency_code || '').toString().toUpperCase() || (country==='DE'?'EUR':'USD');
        return { amount: maybeAmount, currency: cur };
      }
    }catch{ /* weiter versuchen */ }
  }
  return null;
}

// extrahiert Links aus der Kategorieseite
async function extractListLinks(page){
  await page.waitForLoadState('domcontentloaded', { timeout: 45000 });
  await page.waitForTimeout(800);
  const items = await page.evaluate((PRODUCT_PREFIX) => {
    const anchors = Array.from(document.querySelectorAll(`a[href^="${PRODUCT_PREFIX}"]`));
    const map = new Map();
    for(const a of anchors){
      const href = a.getAttribute('href'); if(!href) continue;
      const full = new URL(href, location.origin).toString().replace(/\/+$/,'/');
      const aria = a.getAttribute('aria-label') || '';
      const alt  = a.querySelector('img')?.getAttribute('alt') || '';
      const text = (a.textContent || '').replace(/\s+/g,' ').trim();
      const title = aria || alt || text || '';
      if(!map.has(full)) map.set(full, title);
    }
    return Array.from(map, ([us, title]) => ({ us, title }));
  }, PRODUCT_PREFIX);
  return items;
}

// Age-Gate automatisch passieren (best effort)
async function passAgeGate(page){
  try{
    // häufig: Overlay mit DOB-Feldern
    const selYear  = ['select[name="year"]','select#year','select[aria-label*="Year"]'].join(', ');
    const selMonth = ['select[name="month"]','select#month','select[aria-label*="Month"]'].join(', ');
    const selDay   = ['select[name="day"]','select#day','select[aria-label*="Day"]'].join(', ');

    if(await page.locator(selYear).first().isVisible({ timeout: 800 }).catch(()=>false)){
      await page.selectOption(selYear,  '1990');
      await page.selectOption(selMonth, '1');
      await page.selectOption(selDay,   '1');
      const btn = page.getByRole('button', { name: /submit|enter|continue|bestätigen|weiter/i }).first();
      await btn.click({ timeout: 1500 }).catch(()=>{});
      await page.waitForTimeout(800);
      return;
    }

    // manchmal simple Modal-Schaltfläche
    const cont = await page.getByRole('button', { name: /continue|enter|proceed|weiter/i }).first();
    if(await cont.isVisible({ timeout: 500 }).catch(()=>false)){
      await cont.click().catch(()=>{});
      await page.waitForTimeout(600);
    }
  }catch{/* not fatal */}
}

// Produktseite lesen (inkl. NSUID + Preis-Fallback)
async function readProduct(context, url){
  const page = await context.newPage();
  try{
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await passAgeGate(page);
    await page.waitForTimeout(500);

    const meta = await page.evaluate(() => {
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
      const ogImage = document.querySelector('meta[property="og:image"]')?.content || '';

      // JSON-LD sammeln
      const jsons = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .map(s => { try{ return JSON.parse(s.textContent); }catch{ return null; } })
        .filter(Boolean);

      const flat = x => Array.isArray(x)? x.flatMap(flat) : (x && typeof x==='object' ? [x, ...Object.values(x).flatMap(flat)] : []);
      let release = null, price = null, currency = null, nsuid = null;

      // Aus JSON-LD: releaseDate, offers.price, sku/mpn evtl. NSUID
      for(const obj of flat(jsons)){
        const cand = obj.releaseDate || obj.datePublished || obj.dateCreated;
        if(cand) release = cand;

        const offers = obj.offers || obj;
        const p = parseFloat(offers?.price || offers?.priceSpecification?.price);
        const c = (offers?.priceCurrency || offers?.priceSpecification?.priceCurrency || '').toUpperCase();
        if(!isNaN(p)){ price = p; currency = c || currency || null; }

        const sku = obj.sku || obj.mpn || obj.productID || obj.nsuid;
        if(!nsuid && sku && /\b7\d{13}\b/.test(String(sku))) nsuid = String(sku).match(/\b7\d{13}\b/)[0];
      }

      // Aus dem HTML Rohtext einen 14-stelligen 7…-Block ziehen (NSUID)
      if(!nsuid){
        const html = document.documentElement.outerHTML;
        const m = html.match(/\b7\d{13}\b/);
        if(m) nsuid = m[0];
      }

      return { ogTitle, ogImage, price, currency, release, nsuid };
    });

    return meta;
  }catch(e){
    return { ogTitle:'', ogImage:'', price:null, currency:null, release:null, nsuid:null };
  } finally {
    await page.close();
  }
}

// --- Main -----------------------------------------------------------------

async function main(){
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });

  // 1) Alle Produktlinks einsammeln (Pagination bis leer)
  const links = [];
  const seen = new Set();
  for(let p=0; p<MAX_PAGES; p++){
    const page = await context.newPage();
    await page.goto(PAGE_URL(p), { waitUntil:'domcontentloaded', timeout:60000 });
    const batch = await extractListLinks(page);
    await page.close();
    let added = 0;
    for(const it of batch){
      if(seen.has(it.us)) continue;
      seen.add(it.us);
      links.push(it);
      added++;
    }
    if(added === 0) break;
  }

  // 2) Pro Produkt: Meta + NSUID holen, Preis via Nintendo-API ermitteln
  const results = [];
  for(const { us, title } of links){
    const slug = us.split('/').filter(Boolean).pop();
    const hero = heroFromSlug(slug);
    const meta = await readProduct(context, us);

    let name = title || meta.ogTitle || (slug||'').replace(/-/g,' ');
    let img  = meta.ogImage || '';
    let release_date = normDate(meta.release);

    // Preis via Nintendo-Preis-API (DE→US Fallback)
    let price_eur = null;
    if(meta.nsuid){
      // Prefer DE (direkt EUR)
      let pr = await fetchNintendoPriceByNsuid(meta.nsuid, 'DE', 'de');
      if(!pr) pr = await fetchNintendoPriceByNsuid(meta.nsuid, 'US', 'en');

      if(pr){
        if(pr.currency === 'EUR'){ price_eur = Math.round(pr.amount * 100) / 100; }
        else if(pr.currency === 'USD'){
          const eur = await usdToEur(pr.amount);
          if(eur != null) price_eur = eur;
        }
      }
    }

    // Letzter Fallback: Seite selbst (wenn API nix liefert)
    if(price_eur == null && meta.price != null){
      if((meta.currency||'').toUpperCase() === 'EUR') price_eur = Math.round(meta.price * 100) / 100;
      else if((meta.currency||'').toUpperCase() === 'USD'){
        const eur = await usdToEur(meta.price);
        if(eur != null) price_eur = eur;
      }
    }

    results.push({
      name,
      us,
      img,
      img2: hero,
      price_eur,               // Zahl oder null
      release_date: release_date || null
    });

    await new Promise(r=>setTimeout(r, 80)); // etwas Nettikette
  }

  await browser.close();

  // Sortierung: neueste zuerst
  results.sort((a,b)=>{
    const ta=Date.parse(a.release_date||''); const tb=Date.parse(b.release_date||'');
    if(isNaN(ta)&&isNaN(tb)) return a.name.localeCompare(b.name,'de');
    if(isNaN(ta)) return 1; if(isNaN(tb)) return -1; return tb-ta;
  });

  fs.writeFileSync(OUT, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Wrote ${results.length} items -> ${OUT}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
