// scripts/enrich-prices-from-list.js
// Ergänzt price_usd & release_date aus den Listen-Seiten p=0..N in die TMP-JSON.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE = "https://www.nintendo.com/us/store/games/nintendo-switch-2-games/";
const PAGE = (p) => `${BASE}?sort=df&p=${p}`;
const PRODUCT_PREFIX = "/us/store/products/";
const OUT_TMP = path.join(__dirname, "..", "new_switch2_games.tmp.json");

const usdRe = /\$\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?/; // $59.99 etc.
const relRe = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}\b/i;

function toISODate(s) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d)) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

async function extractFromList(page) {
  return await page.evaluate(({ PRODUCT_PREFIX, usdRe, relRe }) => {
    const pricePattern = new RegExp(usdRe);
    const relPattern = new RegExp(relRe);
    const result = [];

    const anchors = Array.from(document.querySelectorAll(`a[href^="${PRODUCT_PREFIX}"]`));
    const seen = new Set();

    function findContainer(el) {
      let cur = el;
      for (let i = 0; i < 6 && cur; i++) {
        const t = (cur.innerText || "").trim();
        if (pricePattern.test(t) || relPattern.test(t)) return cur;
        cur = cur.parentElement;
      }
      return el;
    }

    for (const a of anchors) {
      const hrefRaw = a.getAttribute("href");
      if (!hrefRaw) continue;
      const href = new URL(hrefRaw, location.origin).toString().replace(/\/+$/, "/");
      if (seen.has(href)) continue;
      seen.add(href);

      const cont = findContainer(a);
      const text = (cont?.innerText || "").replace(/\s+/g, " ").trim();
      const priceMatch = text.match(pricePattern);
      const relMatch = text.match(relPattern);

      result.push({
        us: href,
        price_usd_text: priceMatch ? priceMatch[0] : null,
        release_text: relMatch ? relMatch[0] : null,
      });
    }
    return result;
  }, { PRODUCT_PREFIX, usdRe: usdRe.source, relRe: relRe.source });
}

function parseUsd(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^0-9.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

(async () => {
  if (!fs.existsSync(OUT_TMP)) {
    console.error("❌ TMP fehlt. Erst fetch-switch2.js ausführen.");
    process.exit(2);
  }
  const base = JSON.parse(fs.readFileSync(OUT_TMP, "utf8"));
  const byUrl = new Map(base.map(e => [e.us, e]));

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
    locale: "en-US",
  });

  for (let p = 0; p < 50; p++) {
    const page = await ctx.newPage();
    await page.goto(PAGE(p), { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(1000);
    const rows = await extractFromList(page);
    await page.close();
    if (!rows.length) break;

    for (const r of rows) {
      const e = byUrl.get(r.us);
      if (!e) continue;
      const price = parseUsd(r.price_usd_text);
      const dateISO = toISODate(r.release_text);
      if (price != null) e.price_usd = price;
      if (dateISO) e.release_date = dateISO;
    }
  }

  // zurück in TMP schreiben (nicht final!)
  fs.writeFileSync(OUT_TMP, JSON.stringify(Array.from(byUrl.values()), null, 2), "utf8");
  console.log("💾 Preise/Release in TMP aktualisiert.");
  await browser.close();
})();