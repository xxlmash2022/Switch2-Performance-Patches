// scripts/fetch-switch2.js
import { chromium } from "playwright";
import fs from "fs";

async function scrape() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log("Gehe auf Nintendo US Store Seite...");
  await page.goto("https://www.nintendo.com/us/store/games/nintendo-switch-2-games/#sort=df&p=0", {
    waitUntil: "domcontentloaded"
  });

  // Sicherstellen, dass etwas geladen wurde
  await page.waitForTimeout(5000);

  const games = await page.evaluate(() => {
    const results = [];

    // Alle game-card Elemente (mit Shadow-DOM)
    document.querySelectorAll("game-card").forEach(card => {
      try {
        const shadow = card.shadowRoot;
        const title = shadow.querySelector(".title")?.innerText ?? null;
        const link = shadow.querySelector("a")?.href ?? null;
        const img = shadow.querySelector("img")?.src ?? null;
        const price = shadow.innerText.match(/\$\d+(\.\d{2})?/)?.[0] ?? null;
        const release = shadow.innerText.match(/\d{1,2}\/\d{1,2}\/\d{4}/)?.[0] ?? null;

        results.push({ title, link, thumbnail: img, price, release });
      } catch (e) {
        results.push({ title: null, link: null, thumbnail: null, price: null, release: null });
      }
    });

    return results;
  });

  console.log("DEBUG: Anzahl gefundener Spiele:", games.length);
  console.log("DEBUG: Erste 3:", games.slice(0, 3));

  fs.writeFileSync("new_switch2_games.json", JSON.stringify(games, null, 2));
  console.log("✅ JSON gespeichert mit " + games.length + " Spielen");

  await browser.close();
}

scrape().catch(err => {
  console.error("Scraper Fehler:", err);
  process.exit(1);
});
