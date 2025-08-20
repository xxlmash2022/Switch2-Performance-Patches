// scripts/fetch-switch2.js
import { chromium } from "playwright";
import fs from "fs";

(async () => {
  console.log("🚀 Starte Scraper...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const url = "https://www.nintendo.com/us/store/games/nintendo-switch-2-games/#sort=df&p=0";
  console.log("🌍 Gehe auf Nintendo US Store Seite...");
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForLoadState("domcontentloaded");

  console.log("⏳ Warte auf game-card Elemente...");
  await page.waitForSelector("game-card", { timeout: 120000 });

  const games = await page.$$eval("game-card", cards =>
    cards.map(card => {
      const title = card.querySelector(".game-title")?.textContent?.trim() || "Unbekannt";
      const link = card.querySelector("a")?.href || null;

      // Preis – Nintendo US hat meist data-price oder innerhalb price-text
      const price =
        card.querySelector(".price")?.textContent?.trim() ||
        card.getAttribute("data-price") ||
        null;

      // Release-Datum
      const release =
        card.querySelector(".release-date")?.textContent?.trim() ||
        card.getAttribute("data-release-date") ||
        null;

      // Thumbnail (Hero-Image)
      let thumb =
        card.querySelector("img")?.src ||
        card.querySelector("source")?.srcset ||
        null;

      return {
        title,
        link,
        price,
        release,
        thumb,
      };
    })
  );

  console.log(`✅ ${games.length} Spiele gefunden`);
  fs.writeFileSync("new_switch2_games.json", JSON.stringify(games, null, 2));
  console.log("💾 JSON gespeichert: new_switch2_games.json");

  await browser.close();
})();
