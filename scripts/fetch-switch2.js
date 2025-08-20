// scripts/fetch-switch2.js
// Stabil: sammelt Switch-2 Spiele, indem es Anchors auf /us/store/products/... einsammelt.
// Keine Abhängigkeit von game-card/data-grid-item. Preise optional (zunächst null).
// Benötigt: Playwright (Chromium).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE = "https://www.nintendo.com/us/store/games/nintendo-switch-2-games/";
const PAGE = (p) => `${BASE}?sort=df&p=${p}`;
const PRODUCT_PREFIX = "/us/store/products/";
const OUT = path.join(__dirname, "..", "new_switch2_games.json");

function heroFromSlug(slug) {
  if (!slug) return null;
  const first = slug[0]?.toLowerCase() || "x";
  return `https://assets.nintendo.com/image/upload/f_auto/q_auto/ncom/en_US/games/switch/${first}/${slug}/hero`;
}

async function extractAnchors(page) {
  // Alle Produkt-Anker aus der Seite einsammeln (inkl. aria-label/title/alt als Name)
  return await page.evaluate((PRODUCT_PREFIX) => {
    const A = Array.from(document.querySelectorAll(`a[href^="${PRODUCT_PREFIX}"]`));
    const uniq = new Map();
    for (const a of A) {
      const href = a.getAttribute("href");
      if (!href) continue;
      const url = new URL(href, location.origin).toString().replace(/\/+$/, "/");
      const title =
        a.getAttribute("aria-label") ||
        a.getAttribute("title") ||
        (a.querySelector("img")?.getAttribute("alt") ?? "") ||
        (a.textContent || "").trim();
      // versucht, ein Bild in Linknähe zu finden (lazy-src inkl.)
      const imgEl =
        a.querySelector("img") ||
        a.parentElement?.querySelector("img") ||
        null;
      const img =
        imgEl?.getAttribute("src") ||
        imgEl?.getAttribute("data-src") ||
        null;

      if (!uniq.has(url)) uniq.set(url, { url, title: title || null, img: img || null });
    }
    return Array.from(uniq.values());
  }, PRODUCT_PREFIX);
}

(async () => {
  console.log("🚀 Scraper startet (Anchor-Methode) …");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
    locale: "en-US",
  });

  const all = [];
  const seen = new Set();

  // 1) Über die Seiten p=0..N laufen, bis nichts Neues mehr kommt
  for (let p = 0; p < 50; p++) {
    const page = await context.newPage();
    const url = PAGE(p);
    console.log(`📄 Lade Liste: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    // kurz atmen lassen, bis React/Hydration durch ist
    await page.waitForTimeout(1500);

    const anchors = await extractAnchors(page);
    let added = 0;
    for (const it of anchors) {
      if (seen.has(it.url)) continue;
      seen.add(it.url);

      const slug = it.url.split("/").filter(Boolean).pop(); // …/products/<slug>/
      const hero = heroFromSlug(slug);

      all.push({
        name: (it.title || slug || "Unknown").replace(/\s+/g, " ").trim(),
        us: it.url,
        img: it.img || hero || null,   // zuerst Bild aus der Liste, sonst Hero-Fallback
        img2: hero || null,
        price_eur: null,               // Preise machen wir wieder separat/stabil
        release_date: null
      });
      added++;
    }
    await page.close();

    console.log(`   ➕ neu gefunden: ${added}, gesamt: ${all.length}`);
    if (added === 0) break; // Pagination erschöpft
  }

  // 2) Ergebnis prüfen / debuggen
  if (all.length === 0) {
    const dbg = await context.newPage();
    await dbg.goto(PAGE(0), { waitUntil: "domcontentloaded", timeout: 120000 });
    await dbg.waitForTimeout(1500);
    const html = await dbg.content();
    fs.writeFileSync(path.join(__dirname, "..", "debug_list.html"), html, "utf8");
    await dbg.screenshot({ path: path.join(__dirname, "..", "debug_list.png"), fullPage: true });
    await browser.close();
    console.error("❌ Keine Spiele-Anchors gefunden. debug_list.html & debug_list.png gespeichert.");
    process.exit(2); // lässt die Action den Debug-Artefakt hochladen
  }

  // 3) Sortierung (alphabetisch; Releasedatum kommt später rein)
  all.sort((a, b) => a.name.localeCompare(b.name, "de"));

  fs.writeFileSync(OUT, JSON.stringify(all, null, 2), "utf8");
  console.log(`💾 ${all.length} Spiele → ${OUT}`);
  await browser.close();
})();