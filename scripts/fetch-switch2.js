// Scraper für https://www.nintendo.com/us/store/games/nintendo-switch-2-games/#sort=df&p=0
// Läuft in GitHub Actions. Ergebnis: new_switch2_games.json (Liste für index.html)

// Robustheits-Ideen:
// - Nintendo lädt die Karten clientseitig; wir nutzen Playwright (Chromium) und lesen nach Render.
// - Paginierung über ?p=0..N; wir stoppen, wenn keine neuen Produkt-Links mehr auftauchen.
// - Thumbnail: hero-URL aus dem Slug (stabil): assets.nintendo.com/.../games/switch/{slug[0]}/{slug}/hero
// - Titel: bevorzugt direkt aus der Karte (aria-label/innerText); Fallback: <meta property="og:title"> der Produktseite (sparsam genutzt).

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-chromium");

const LIST_BASE = "https://www.nintendo.com/us/store/games/nintendo-switch-2-games/";
const PAGE_TEMPLATE = (p) => `${LIST_BASE}?sort=df&p=${p}`;
const PRODUCT_PREFIX = "/us/store/products/";

function heroFromSlug(slug) {
  if (!slug) return "";
  const c = slug[0].toLowerCase();
  return `https://assets.nintendo.com/image/upload/f_auto/q_auto/ncom/en_US/games/switch/${c}/${slug}/hero`;
}

async function extractFromList(page) {
  // Warten, bis irgendwas gerendert ist. 10s Puffer.
  await page.waitForTimeout(1500);
  // Sammle Produkt-Anker, Titel und ggf. img-alt
  const raw = await page.evaluate((PRODUCT_PREFIX) => {
    const items = [];
    const anchors = Array.from(document.querySelectorAll(`a[href^="${PRODUCT_PREFIX}"]`));
    for (const a of anchors) {
      const href = a.getAttribute("href");
      // Titel-Kandidaten
      const aria = a.getAttribute("aria-label") || "";
      const imgAlt = a.querySelector("img")?.getAttribute("alt") || "";
      const text = (a.textContent || "").replace(/\s+/g, " ").trim();
      // nimm den besten verfügbaren Titel
      const title = aria || imgAlt || text;
      items.push({ href, title });
    }
    return items;
  }, PRODUCT_PREFIX);

  // deduplizieren
  const map = new Map();
  for (const it of raw) {
    if (!it.href) continue;
    const full = "https://www.nintendo.com" + it.href.replace(/\/+$/, "/");
    if (!map.has(full)) map.set(full, it.title || "");
  }
  return Array.from(map.entries()).map(([us, title]) => ({ us, title }));
}

async function maybeEnrichTitleFromProduct(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    // Warte kurz auf OG-Titel oder H1
    const title = await page.evaluate(() => {
      const og = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
      const h1 = document.querySelector("h1")?.textContent?.trim();
      return og || h1 || "";
    });
    return title;
  } catch {
    return "";
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });

  const seen = new Set();
  const results = [];

  for (let p = 0; p < 20; p++) {
    const url = PAGE_TEMPLATE(p);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });

    const batch = await extractFromList(page);
    // Ende, wenn nichts kam
    if (!batch.length) break;

    // Titel ggf. anreichern, nur wenn leer/kurz
    for (const { us, title } of batch) {
      if (seen.has(us)) continue;
      seen.add(us);
      const slug = us.split("/").filter(Boolean).pop(); // .../products/{slug}/
      let name = title;
      if (!name || name.length < 3) {
        name = await maybeEnrichTitleFromProduct(page, us);
      }
      const img = heroFromSlug(slug);
      results.push({
        name: name || slug.replace(/-/g, " "),
        us,
        img
      });
    }
  }

  await browser.close();

  // Sortiere alphabetisch (stabil)
  results.sort((a, b) => a.name.localeCompare(b.name, "de"));

  const outPath = path.resolve(process.cwd(), "new_switch2_games.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`Wrote ${results.length} items -> ${outPath}`);
})();
