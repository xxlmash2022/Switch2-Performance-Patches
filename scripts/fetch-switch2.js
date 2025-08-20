// scripts/fetch-switch2.js
import { chromium } from "playwright";
import fs from "fs";

const URL = "https://www.nintendo.com/us/store/games/nintendo-switch-2-games/#sort=df&p=0";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded" });

  // Warte bis Karten sichtbar sind
  await page.waitForSelector("[data-grid-item]");

  const games = await page.$$eval("[data-grid-item]", cards =>
    cards.map(card => {
      const linkEl = card.querySelector("a[href]");
      const imgEl = card.querySelector("img");
      const priceEl = card.querySelector("[data-price]");
      const title = card.innerText.split("\n")[0];

      return {
        title: title.trim(),
        link: linkEl ? linkEl.href : null,
        thumbnail: imgEl ? imgEl.src : null,
        price: priceEl ? priceEl.textContent.trim() : null,
        release: card.innerText.match(/\d{1,2}\/\d{1,2}\/\d{4}/)?.[0] || null
      };
    })
  );

  fs.writeFileSync("new_switch2_games.json", JSON.stringify(games, null, 2));
  console.log(`✅ ${games.length} Spiele gespeichert nach new_switch2_games.json`);

  await browser.close();
})();
