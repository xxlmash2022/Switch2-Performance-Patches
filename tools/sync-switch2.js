// tools/sync-switch2.js
// Holt die US-Store-Liste "Nintendo Switch 2 games" via Puppeteer
// und schreibt new_switch2_games.json (nur Felder name, us, img).
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  const OUT = path.join(__dirname, '..', 'new_switch2_games.json');
  const url = 'https://www.nintendo.com/us/store/games/nintendo-switch-2-games/';
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 180000 });

  const items = await page.evaluate(() => {
    const seen = new Set(); const out = [];
    const html = document.documentElement.innerHTML;
    const re = /"title":"([^"]+?)","url":"(\\/us\\/store\\/products\\/[^"]+?)"/g;
    let m;
    while ((m = re.exec(html))) {
      const title = m[1];
      const path = m[2];
      const slug  = path.split('/').filter(Boolean).pop();
      const hero  = `https://assets.nintendo.com/image/upload/f_auto/q_auto/ncom/en_US/games/switch/${slug[0]}/${slug}/hero`;
      const usUrl = 'https://www.nintendo.com' + path;
      if (seen.has(usUrl)) continue; seen.add(usUrl);
      out.push({ name: title, us: usUrl, img: hero });
    }
    return out;
  });

  fs.writeFileSync(OUT, JSON.stringify(items, null, 2), 'utf8');
  console.log('Wrote', OUT, items.length, 'items');
  await browser.close();
})().catch(err => { console.error(err); process.exit(1); });
