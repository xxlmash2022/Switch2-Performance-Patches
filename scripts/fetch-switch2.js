// scripts/fetch-switch2.js
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

(async () => {
  console.log("🚀 Starte Scraper...");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log("🌍 Gehe auf Nintendo US Store Seite...");
  await page.goto("https://www.nintendo.com/us/store/games/nintendo-switch-2-games/#sort=df&p=0", {
    waitUntil: "domcontentloaded",
    timeout: 180000,
  });

  console.log("⏳ Warte auf mindestens 5 sichtbare Spiele...");
  try {
    await page.waitForFunction(
      () => document.querySelectorAll("game-card").length > 5,
      { timeout: 180000 }
    );
  } catch (err) {
    console.error("❌ Timeout: Keine Spiele gefunden!");
    await page.screenshot({ path: "scraper_debug.png", fullPage: true });
    await browser.close();
    process.exit(1);
  }

  console.log("✅ Spielelemente gefunden, sammle Daten...");

  const games = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll("game-card"));
    return items.map((el) => {
      const title = el.getAttribute("title") || el.querySelector("h3,h2")?.innerText || "Unbekannt";
      const link = el.querySelector("a")?.href || null;
      const img = el.querySelector("img")?.src || null;
      return { title, link, img };
    });
  });

  if (!games.length) {
    console.warn("⚠️ Keine Spiele extrahiert – Screenshot speichern...");
    await page.screenshot({ path: "scraper_debug.png", fullPage: true });
  }

  const filePath = path.join(__dirname, "..", "new_switch2_games.json");
  fs.writeFileSync(filePath, JSON.stringify(games, null, 2));
  console.log(`💾 Gespeichert: ${games.length} Spiele -> ${filePath}`);

  await browser.close();
})();