// scripts/fetch-switch2.js
import { chromium } from "playwright";
import fs from "fs";

const URL = "https://www.nintendo.com/us/store/games/nintendo-switch-2-games/#sort=df&p=0";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Gehe auf die Seite
  await page.goto(URL, { waitUntil: "networkidle" });

  // Warte explizit auf mindestens ein <game-card>
  await page.waitForSelector("game-card", { timeout: 60000 });

  // Scrollt, um lazy-loaded Spiele zu triggern
  let prevHeight = 0;
  while (true) {
    const currentHeight = await page.evaluate("document.body.scrollHeight");
    if (currentHeight === prevHeight) break;
    prevHeight = currentHeight;
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(2000);
  }

  // Extrahiere Spiele
  const games = await page.$$eval("game-card", cards =>
    cards.map(card => {
      const root = card.shadowRoot;
      const title = root?.querySelector(".title")?.textContent ?? null;
      const link = root?.querySelector("a")?.href ?? null;
      const img = root?.querySelector("img")?.src ?? null;
      const price = root?.querySelector(".price")?.textContent ?? null;
      const release = root?.innerText.match(/\d{1,2}\/\d{1,2}\/\d{4}/)?.[0] || null;

      return { title, link, thumbnail: img, price, release };
    })
  );

  fs.writeFileSync("new_switch2_games.json", JSON.stringify(games, null, 2));
  console.log(`✅ ${games.length} Spiele gespeichert nach new_switch2_games.json`);

  await browser.close();
})();
