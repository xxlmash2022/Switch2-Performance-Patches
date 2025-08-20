import { chromium } from "playwright";
import fs from "fs";

(async () => {
  console.log("Starte Scraper...");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto("https://www.nintendo.com/us/store/games/nintendo-switch-2-games/#sort=df&p=0", {
    waitUntil: "networkidle"
  });

  // Auto-scroll, bis keine neuen Elemente mehr geladen werden
  let previousHeight;
  while (true) {
    previousHeight = await page.evaluate("document.body.scrollHeight");
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(1500); // kurz warten
    const newHeight = await page.evaluate("document.body.scrollHeight");
    if (newHeight === previousHeight) break;
  }

  console.log("Seite fertig geladen, lese Spiele...");

  const games = await page.$$eval("[data-grid-item]", items =>
    items.map(item => {
      const linkEl = item.querySelector("a[href]");
      const imgEl = item.querySelector("img");
      const titleEl = item.querySelector("h3, .title, .ProductTile__Title");

      return {
        title: titleEl?.innerText?.trim() || "Unbekannt",
        link: linkEl ? linkEl.href : null,
        thumbnail: imgEl ? imgEl.src : null,
        price: item.innerText.match(/\$\d+(\.\d{2})?/)?.[0] || null,
        releaseDate: item.innerText.match(/\w+ \d{1,2}, \d{4}/)?.[0] || null
      };
    })
  );

  console.log(`Gefundene Spiele: ${games.length}`);

  fs.writeFileSync("new_switch2_games.json", JSON.stringify(games, null, 2));

  await browser.close();
})();
