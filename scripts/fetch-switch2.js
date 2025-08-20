// scripts/fetch-switch2.js
// Quelle: https://www.nintendo.com/us/store/games/nintendo-switch-2-games/#sort=df&p=0
// Ergebnis: new_switch2_games.json [{ name, us, img, img2, price_eur }]

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright"); // volle playwright
const OUT = path.resolve(process.cwd(), "new_switch2_games.json");
const LIST_BASE = "https://www.nintendo.com/us/store/games/nintendo-switch-2-games/";
const PAGE_URL = (p) => `${LIST_BASE}?sort=df&p=${p}`;
const PRODUCT_PREFIX = "/us/store/products/";
const MAX_PAGES = 50;
const CONCURRENCY = 4;

function heroFromSlug(slug){ if(!slug) return ""; const c=slug[0].toLowerCase(); return `https://assets.nintendo.com/image/upload/f_auto/q_auto/ncom/en_US/games/switch/${c}/${slug}/hero`; }

async function usdToEur(amountUsd){
  try{
    const r = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=EUR");
    const j = await r.json();
    const rate = j && j.rates && j.rates.EUR;
    if(!rate) return null;
    return Math.round((amountUsd * rate) * 100) / 100;
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
      // Preis aus metas / JSON-LD
      let price = null, currency = null;

      const metaPrice = document.querySelector('meta[property="product:price:amount"]')?.content;
      const metaCurr  = document.querySelector('meta[property="product:price:currency"]')?.content;
      if (metaPrice) { price = parseFloat(metaPrice); currency = (metaCurr || "").toUpperCase() || null; }

      // JSON-LD fallback
      if (price == null) {
        const blocks = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
          .map(s => { try { return JSON.parse(s.textContent); } catch { return null; } })
          .filter(Boolean);
        const flatten = (x) => Array.isArray(x) ? x.flatMap(flatten) : (x && typeof x === 'object' ? [x, ...Object.values(x).flatMap(flatten)] : []);
        for (const obj of flatten(blocks)) {
          if (obj && (obj['@type'] === 'Product' || obj['@type'] === 'Offer' || obj.offers)) {
            const off = obj.offers || obj;
            const p = parseFloat(off.price || off.priceSpecification?.price);
            const c = (off.priceCurrency || off.priceSpecification?.priceCurrency || "").toUpperCase();
            if (!isNaN(p)) { price = p; currency = c || null; break; }
          }
        }
      }

      return { ogTitle, ogImage, price, currency };
    });

    return meta;
  }catch(e){
    return { ogTitle:"", ogImage:"", price:null, currency:null };
  }finally{
    await page.close();
  }
}

async function main(){
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });

  const links = [];
  const seen = new Set();

  // Alle Seiten ablaufen
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

  // Produkte lesen (concurrency)
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
        if ((meta.currency || "").toUpperCase() === "EUR") {
          price_eur = Math.round(meta.price * 100) / 100;
        } else if (meta.currency) {
          const eur = await usdToEur(meta.price); // wenn USD o. a., konvertiere via USD→EUR
          if (eur != null) price_eur = eur;
        }
      }

      results.push({ name, us, img, img2: hero, price_eur });
      await new Promise(r => setTimeout(r, 80));
    }
  }
  await Promise.all(Array.from({length: CONCURRENCY}, worker));

  await browser.close();

  // Sort stabil
  results.sort((a,b) => a.name.localeCompare(b.name, "de"));
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2), "utf8");
  console.log(`Wrote ${results.length} items -> ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
