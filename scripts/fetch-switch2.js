// scripts/fetch-switch2.js
import { chromium } from "playwright";
import fs from "fs";

async function scrape() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log("Gehe auf Nintendo US Store Seite...");
  await page.goto("https://www.nintendo.com/us/store/games/nintendo-switch-2-games/#sort=df&p=0", {
    waitUntil: "networkidle"
  });

  // Versuchen, alle game-card Elemente zu greifen
  console.log("Warte auf game-card Elemente...");
  await page.waitForSelector("game-card", { timeout: 60000 });

  const games = await page.$$eval("game-card", cards =>
    cards.map(card => {
      try {
        const title = card.innerText?.split("\n")[0] ?? null;
        const link = card.querySelector("a")?.href ?? null;
        const img = card.querySelector("img")?.src ?? null;
        const price = card.innerText.match(/\$\d+(\.\d{2})?/)?.[0] ?? null;
        const release = card.innerText.match(/\d{1,2}\/\d{1,2}\/\d{4}/)?.[0] ?? null;

        return { title, link, thumbnail: img, price, release };
      } catch (e) {
        return { title: null, link: null, thumbnail: null, price: null, release: null };
      }
    })
  );

  console.log("DEBUG: Erste 3 Spiele:");
  console.log(games.slice(0, 3));

  fs.writeFileSync("new_switch2_games.json", JSON.stringify(games, null, 2));
  console.log("✅ JSON gespeichert mit " + games.length + " Spielen");

  await browser.close();
}

scrape().catch(err => {
  console.error("Scraper Fehler:", err);
  process.exit(1);
});
