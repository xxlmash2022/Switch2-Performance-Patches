// scripts/fetch-switch2.js
import { chromium } from "playwright";
import fs from "fs";

(async () => {
  console.log("🚀 Starte Scraper...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log("🌍 Gehe auf Nintendo US Store Seite...");
  await page.goto("https://www.nintendo.com/us/store/games/nintendo-switch-2-games/#sort=df&p=0", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });

  console.log("⏳ Warte auf game-card Elemente...");
  try {
    await page.waitForSelector(".game-card, [data-grid-item]", { timeout: 120000 });
  } catch (err) {
    console.error("❌ Fehler: Keine game-cards gefunden!", err);
    await page.screenshot({ path: "debug_no_games.png", fullPage: true });
    await browser.close();
    process.exit(1);
  }

  console.log("📦 Extrahiere Spiele...");
  const games = await page.$$eval(".game-card, [data-grid-item]", cards =>
    cards.map(card => {
      const title = card.querySelector("h3,h2")?.innerText?.trim() || "Unknown";
      const link = card.querySelector("a")?.href || "";
      const img = card.querySelector("img")?.src || "";
      // Preis optional – kein Abbruch wenn nicht da
      const price = card.querySelector(".msrp, .price, [data-test='price']")?.innerText?.trim() || null;

      return { title, link, img, price };
    })
  );

  console.log(`✅ Gefundene Spiele: ${games.length}`);

  // Debug falls wieder 0 Spiele
  if (games.length === 0) {
    console.warn("⚠️ Keine Spiele gefunden, Screenshot speichern...");
    await page.screenshot({ path: "debug_empty.png", fullPage: true });
  }

  fs.writeFileSync("new_switch2_games.json", JSON.stringify(games, null, 2));
  console.log("💾 Spiele gespeichert in new_switch2_games.json");

  await browser.close();
})();