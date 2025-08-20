// scripts/fetch-switch2.js
// Scraper für https://www.nintendo.com/us/store/games/nintendo-switch-2-games/#sort=df&p=0
// Läuft in GitHub Actions. Ergebnis: new_switch2_games.json (im Repo-Root).
//
// Strategie:
// - Paginierung über ?sort=df&p=0..N (wir laufen bis keine neuen Produkte mehr kommen).
// - Pro Karte holen wir den Produkt-Link (/us/store/products/…/).
// - Für jeden Produkt-Link öffnen wir die Seite (sanfte Parallelität) und lesen:
//     * og:title  -> name
//     * og:image  -> img (bevorzugtes Thumbnail)
//   Zusätzlich berechnen wir ein robustes hero-Fallback (img2) aus dem Slug.
// - Ausgabeformat für index.html: [{ name, us, img, img2 }]
//
// Hinweise:
// - Playwright Chromium wird in der Action installiert (mit --with-deps).
// - Rate-Limit freundlich: concurrency 4 und kurze Pausen.

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright"); // volle playwright-Version

const LIST_BASE = "https://www.nintendo.com/us/store/games/nintendo-switch-2-games/";
const PAGE_URL = (p) => `${LIST_BASE}?sort=df&p=${p}`;
const PRODUCT_PREFIX = "/us/store/products/";
const OUT = path.resolve(process.cwd(), "new_switch2_games.json");
const MAX_PAGES = 50;
const CONCURRENCY = 4;

function heroFromSlug(slug) {
  if (!slug) return "";
  const c = slug[0].toLowerCase();
  return `https://assets.nintendo.com/image/upload/f_auto/q_auto/ncom/en_US/games/switch/${c}/${slug}/hero`;
}

async function extractProductLinksFromList(page) {
  // Warten bis DOM steht, dann kurz Puffer
  await page.waitForLoadState("domcontentloaded", { timeout: 45000 });
  await page.waitForTimeout(1000);
  // Sammle Produktlinks + evtl. Titles aus Kacheln
  const items = await page.evaluate((PRODUCT_PREFIX) => {
    const anchors = Array.from(document.querySelectorAll(`a[href^="${PRODUCT_PREFIX}"]`));
    const map = new Map();
    for (const a of anchors) {
      const href = a.getAttribute("href");
      if (!href) continue;
      const full = new URL(href, location.origin).toString().replace(/\/+$/, "/");
      if (!full.startsWith(location.origin + PRODUCT_PREFIX)) continue;
      const aria = a.getAttribute("aria-label") || "";
      const imgAlt = a.querySelector("img")?.getAttribute("alt") || "";
      const text = (a.textContent || "").replace(/\s+/g, " ").trim();
      const title = aria || imgAlt || text || "";
      if (!map.has(full)) map.set(full, title);
    }
    return Array.from(map, ([us, title]) => ({ us, title }));
  }, PRODUCT_PREFIX);
  return items;
}

async function readProductMeta(context, url) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(500);
    const meta = await page.evaluate(() => {
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content || "";
      const ogImage = document.querySelector('meta[property="og:image"]')?.content || "";
      return { ogTitle, ogImage };
    });
    return meta;
  } catch (e) {
    return { ogTitle: "", ogImage: "" };
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });

  const seen = new Set();
  const products = [];

  for (let p = 0; p < MAX_PAGES; p++) {
    const listPage = await context.newPage();
    const url = PAGE_URL(p);
    await listPage.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    const batch = await extractProductLinksFromList(listPage);
    await listPage.close();

    // Abbruch wenn nichts Neues
    const before = products.length;
    for (const it of batch) {
      if (seen.has(it.us)) continue;
      seen.add(it.us);
      products.push(it);
    }
    if (products.length === before) break; // keine neuen
  }

  // Meta lesen mit Limit CONCURRENCY
  const results = [];
  let i = 0;
  async function worker() {
    while (i < products.length) {
      const idx = i++; const { us, title } = products[idx];
      const slug = us.split("/").filter(Boolean).pop();
      const hero = heroFromSlug(slug);
      let name = title;
      let img = "";

      const meta = await readProductMeta(context, us);
      if (!name || name.length < 3) name = meta.ogTitle || slug.replace(/-/g, " ");
      if (meta.ogImage) img = meta.ogImage;

      results.push({
        name: name || slug.replace(/-/g, " "),
        us,
        img,   // bevorzugtes og:image
        img2: hero // hero-Fallback
      });

      // sanfte Pause
      await new Promise(r => setTimeout(r, 100));
    }
  }
  const workers = Array.from({ length: CONCURRENCY }, worker);
  await Promise.all(workers);

  await browser.close();

  // Sortieren (stabil)
  results.sort((a, b) => a.name.localeCompare(b.name, "de"));

  fs.writeFileSync(OUT, JSON.stringify(results, null, 2), "utf8");
  console.log(`Wrote ${results.length} items -> ${OUT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
