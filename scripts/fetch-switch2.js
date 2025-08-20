// scripts/fetch-switch2.js
// Quelle: https://www.nintendo.com/us/store/games/nintendo-switch-2-games/#sort=df&p=0
// Ergebnis: new_switch2_games.json [{ name, us, img, img2, price_eur, release_date }]

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const OUT = path.resolve(process.cwd(), "new_switch2_games.json");
const LIST_BASE = "https://www.nintendo.com/us/store/games/nintendo-switch-2-games/";
const PAGE_URL = (p) => `${LIST_BASE}?sort=df&p=${p}`;
const PRODUCT_PREFIX = "/us/store/products/";
const MAX_PAGES = 50;
const CONCURRENCY = 4;

function heroFromSlug(slug){ if(!slug) return ""; const c=slug[0].toLowerCase(); return `https://assets.nintendo.com/image/upload/f_auto/q_auto/ncom/en_US/games/switch/${c}/${slug}/hero`; }
function normDate(s){
  if(!s) return null;
  const m = String(s).trim();
  // handle YYYY-MM-DD, YYYY/MM/DD, "2025-03-14T..." etc.
  const d = new Date(m);
  if (isNaN(d)) return null;
  const y=d.getUTCFullYear(), mo=String(d.getUTCMonth()+1).padStart(2,'0'), da=String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${mo}-${da}`;
}

async function usdToEur(amountUsd){
  try{
    const r = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=EUR");
    const j = await r.json(); const rate = j?.rates?.EUR;
    if(!rate) return null; return Math.round((amountUsd * rate) * 100) / 100;
  }catch{ return null; }
}

async function extractListLinks(page){
  await page.waitForLoadState("domcontentloaded", { timeout: 45000 });
  await page.waitForTimeout(1000);
  const items = await page.evaluate((PRODUCT_PREFIX) => {
    const anchors = Array.from(document.querySelectorAll(`a[href^="${PRODUCT_PREFIX}"]`));
    const map = new Map();
    for(const a of anchors){
      const href = a.getAttribute("href"); if(!href) continue;
      const full = new URL(href, location.origin).toString().replace(/\/+$/, "/");
      const aria = a.getAttribute("aria-label") || "";
      const imgAlt = a.querySelector("img")?.getAttribute("alt") || "";
      const text = (a.textContent || "").replace(/\s+/g, " ").trim();
      const title = aria || imgAlt || text || "";
      if(!map.has(full)) map.set(full, title);
    }
    return Array.from(map, ([us, title]) => ({ us, title }));
  }, PRODUCT_PREFIX);
  return items;
}

async function readProduct(context, url){
  const page = await context.newPage();
  try{
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(600);

    const meta = await page.evaluate(() => {
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content || "";
      const ogImage = document.querySelector('meta[property="og:image"]')?.content || "";

      // Preis
      let price = null, currency = null;
      const metaPrice = document.querySelector('meta[property="product:price:amount"]')?.content;
      const metaCurr  = document.querySelector('meta[property="product:price:currency"]')?.content;
      if (metaPrice) { price = parseFloat(metaPrice); currency = (metaCurr || "").toUpperCase() || null; }

      // JSON-LD
      const jsons = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => { try{ return JSON.parse(s.textContent); }catch{ return null; } }).filter(Boolean);
      const flat = (x)=> Array.isArray(x)? x.flatMap(flat): (x && typeof x==='object'? [x, ...Object.values(x).flatMap(flat)]: []);
      let release = null;
      for(const obj of flat(jsons)){
        const t = (obj['@type']||'').toString().toLowerCase();
        const cand = obj.releaseDate || obj.datePublished || obj.dateCreated;
        if(cand){ release = cand; }
        if(price==null){
          const off = obj.offers || obj;
          const p = parseFloat(off?.price || off?.priceSpecification?.price);
          const c = (off?.priceCurrency || off?.priceSpecification?.priceCurrency || "").toUpperCase();
          if(!isNaN(p)){ price=p; currency=c||currency; }
        }
      }

      // Fallback: sichtbarer Text
      if(!release){
        const label = Array.from(document.querySelectorAll('*')).find(el => /release date|veröffentlichungsdatum/i.test(el.textContent||''));
        if (label) {
          const next = label.closest('section,div,li')?.textContent || '';
          const m = next.match(/\b(\d{4}-\d{2}-\d{2})\b/);
          if (m) release = m[1];
        }
      }

      return { ogTitle, ogImage, price, currency, release };
    });

    return meta;
  }catch(e){
    return { ogTitle:"", ogImage:"", price:null, currency:null, release:null };
  }finally{
    await page.close();
  }
}

async function main(){
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });

  const links = [];
  const seen = new Set();

  for (let p=0; p<MAX_PAGES; p++){
    const page = await context.newPage();
    await page.goto(PAGE_URL(p), { waitUntil: "domcontentloaded", timeout: 60000 });
    const batch = await extractListLinks(page);
    await page.close();

    let added = 0;
    for (const it of batch) {
      if (seen.has(it.us)) continue;
      seen.add(it.us);
      links.push(it);
      added++;
    }
    if (added === 0) break;
  }

  const results = [];
  let i=0;
  async function worker(){
    while(i < links.length){
      const idx = i++;
      const { us, title } = links[idx];
      const slug = us.split("/").filter(Boolean).pop();
      const hero = heroFromSlug(slug);

      const meta = await readProduct(context, us);
      let name = title || meta.ogTitle || slug.replace(/-/g,' ');
      let img  = meta.ogImage || "";
      let price_eur = null;

      if (meta.price != null) {
        if ((meta.currency || "").toUpperCase() === "EUR") price_eur = Math.round(meta.price * 100) / 100;
        else {
          const eur = await usdToEur(meta.price);
          if (eur != null) price_eur = eur;
        }
      }

      results.push({
        name, us, img, img2: hero,
        price_eur,
        release_date: normDate(meta.release)
      });

      await new Promise(r => setTimeout(r, 80));
    }
  }
  await Promise.all(Array.from({length: CONCURRENCY}, worker));

  await browser.close();

  // Mit Datum (neueste zuerst) sortieren, fehlende nach hinten
  results.sort((a,b)=>{
    const ta = Date.parse(a.release_date||'');
    const tb = Date.parse(b.release_date||'');
    if(isNaN(ta) && isNaN(tb)) return a.name.localeCompare(b.name,"de");
    if(isNaN(ta)) return 1;
    if(isNaN(tb)) return -1;
    return tb - ta;
  });

  fs.writeFileSync(OUT, JSON.stringify(results, null, 2), "utf8");
  console.log(`Wrote ${results.length} items -> ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
