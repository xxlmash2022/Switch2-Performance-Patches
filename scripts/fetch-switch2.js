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

  console.log("⏳ Warte auf data-grid-item Elemente...");
  await page.waitForSelector("[data-grid-item]", { timeout: 120000 });

  const games = await page.$$eval("[data-grid-item]", items =>
    items.map(item => {
      const title = item.querySelector("h3")?.textContent?.trim() || "Unbekannt";
      const link = item.querySelector("a")?.href || null;

      // Preis
      const price =
        item.querySelector(".msrp, .price, [data-test='price']")?.textContent?.trim() ||
        null;

      // Release
      const release =
        item.querySelector(".release-date")?.textContent?.trim() ||
        item.getAttribute("data-release-date") ||
        null;

      // Thumbnail
      let thumb = item.querySelector("img")?.src || null;

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