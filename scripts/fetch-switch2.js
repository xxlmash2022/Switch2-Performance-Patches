// scripts/fetch-switch2.js
// Robust: sammelt Switch-2 Spiele über Anchor-Methode und schreibt NUR in TMP.
// Commit/Promotion macht der Workflow, nur wenn genügend Einträge vorhanden sind.

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

// Schöne, saubere Fallback-Heldengrafik aus dem Slug
function heroFromSlug(slug) {
  if (!slug) return null;
  const first = slug[0]?.toLowerCase() || "x";
  return `https://assets.nintendo.com/image/upload/f_auto/q_auto/ncom/en_US/games/switch/${first}/${slug}/hero`;
}

// Alle Produkt-Anker extrahieren (robust gegen UI/Shadow-DOM)
async function extractAnchors(page) {
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
        a.querySelector("img")?.getAttribute("alt") ||
        (a.textContent || "").trim();

      const imgEl = a.querySelector("img") || a.parentElement?.querySelector("img") || null;
      const img = imgEl?.getAttribute("src") || imgEl?.getAttribute("data-src") || null;

      if (!uniq.has(url)) {
        uniq.set(url, { url, title: (title || "").trim(), img: img || null });
      }
    }
    return Array.from(uniq.values());
  }, PRODUCT_PREFIX);
}

(async () => {
  console.log("🚀 fetch-switch2: starte (Anchor-Methode) …");
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
    locale: "en-US",
  });

  const all = [];
  const seen = new Set();

  for (let p = 0; p < 50; p++) {
    const page = await ctx.newPage();
    const url = PAGE(p);
    console.log("📄 Liste:", url);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(1200);

    const anchors = await extractAnchors(page);
    let added = 0;
    for (const it of anchors) {
      if (seen.has(it.url)) continue;
      seen.add(it.url);
      const slug = it.url.split("/").filter(Boolean).pop();
      const hero = heroFromSlug(slug);
      all.push({
        name: (it.title || slug || "Unknown").replace(/\s+/g, " ").trim(),
        us: it.url,
        img: it.img || hero || null,
        img2: hero || null,
        price_usd: null,
        release_date: null,
      });
      added++;
    }
    await page.close();
    console.log(`   ➕ neu: ${added}, gesamt: ${all.length}`);
    if (added === 0) break;
  }

  // Immer in TMP schreiben
  fs.writeFileSync(OUT_TMP, JSON.stringify(all, null, 2), "utf8");
  console.log(`💾 TMP geschrieben: ${OUT_TMP} (count=${all.length})`);

  // Bei auffällig wenig: Debug-Artefakte erzeugen
  if (all.length < 30) {
    const dbg = await ctx.newPage();
    await dbg.goto(PAGE(0), { waitUntil: "domcontentloaded", timeout: 120000 });
    await dbg.waitForTimeout(1200);
    fs.writeFileSync(path.join(__dirname, "..", "debug_list.html"), await dbg.content(), "utf8");
    await dbg.screenshot({ path: path.join(__dirname, "..", "debug_list.png"), fullPage: true });
    await dbg.close();
    console.warn("⚠️ Weniger als 30 Einträge – Debug-Artefakte erzeugt (HTML+PNG).");
  }

  await browser.close();
})();