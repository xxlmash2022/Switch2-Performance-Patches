// scripts/fetch-switch2.js
import { chromium } from "playwright";
import fs from "fs";

(async () => {
  console.log("🚀 Starte Scraper...");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // US Nintendo Store – Switch 2 Games
  const url =
    "https://www.nintendo.com/us/store/games/nintendo-switch-2-games/#sort=df&p=0";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });

  console.log("🌍 Gehe auf Nintendo US Store Seite...");
  await page.waitForSelector("[data-grid-item]", { timeout: 60000 });
  console.log("✅ Spieleliste gefunden!");

  // Alle Spiele extrahieren
  const games = await page.$$eval("[data-grid-item]", (cards) =>
    cards.map((card) => {
      const title =
        card.querySelector("a[data-qa='product-title']")?.innerText?.trim() ||
        null;

      const price =
        card.querySelector("span[data-qa='product-price']")?.innerText?.trim() ||
        null;

      const release =
        card.querySelector("span[data-qa='product-release-date']")
          ?.innerText?.trim() || null;

      const link =
        card.querySelector("a[data-qa='product-title']")?.href || null;

      const img =
        card.querySelector("img")?.src ||
        "https://via.placeholder.com/270x153?text=No+Image";

      return {
        title,
        price,
        releaseDate: release,
        link,
        thumbnail: img,
      };
    })
  );

  await browser.close();

  console.log(`📦 ${games.length} Spiele gefunden.`);

  // JSON speichern
  const outputPath = "./new_switch2_games.json";
  fs.writeFileSync(outputPath, JSON.stringify(games, null, 2));
  console.log(`💾 Daten gespeichert in ${outputPath}`);
})();
