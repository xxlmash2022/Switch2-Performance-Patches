// scripts/fetch-switch2.js
// Scraper für neue Switch 2 Spiele mit US-Preisen + Release-Datum
// Benötigt: playwright (npm i playwright)

import { chromium } from "playwright";
import fs from "fs";

async function scrape() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // US-Store Switch 2 Spiele Seite
  const baseUrl = "https://www.nintendo.com/us/store/games/nintendo-switch-2-games/#sort=df&p=0";
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  // Lade alle Spiele-Karten
  await page.waitForSelector('[data-testid="product-card"]');

  const games = await page.$$eval('[data-testid="product-card"]', (cards) =>
    cards.map((card) => {
      const titleEl = card.querySelector('[data-testid="product-title"]');
      const urlEl = card.querySelector("a");
      const thumbEl = card.querySelector("img");
      const releaseEl = card.querySelector('[data-testid="product-release-date"]');
      const priceEl = card.querySelector('[data-testid="price"]');

      return {
        title: titleEl ? titleEl.textContent.trim() : "Unknown",
        url: urlEl ? urlEl.href : null,
        thumbnail: thumbEl ? thumbEl.src : null,
        release_date: releaseEl ? releaseEl.textContent.trim() : null,
        price_usd: priceEl ? priceEl.textContent.trim() : null,
      };
    })
  );

  await browser.close();

  // Speichere JSON
  fs.writeFileSync("new_switch2_games.json", JSON.stringify(games, null, 2));
  console.log(`✅ ${games.length} Spiele gespeichert in new_switch2_games.json`);
}

scrape().catch((err) => {
  console.error("Scraping-Fehler:", err);
  process.exit(1);
});
