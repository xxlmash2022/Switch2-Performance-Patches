// scripts/build-performance-patches.js
// Input: data/performance_seed.json
// Output: performance_patches.json (für index.html)

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const IN  = path.resolve(process.cwd(), "data/performance_seed.json");
const OUT = path.resolve(process.cwd(), "performance_patches.json");

function heroFromSlug(us){
  if(!us) return "";
  const slug = us.split("/").filter(Boolean).pop();
  if(!slug) return "";
  const c = slug[0].toLowerCase();
  return `https://assets.nintendo.com/image/upload/f_auto/q_auto/ncom/en_US/games/switch/${c}/${slug}/hero`;
}

async function readOG(context, url){
  if(!url) return "";
  const page = await context.newPage();
  try{
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(400);
    const og = await page.evaluate(() => document.querySelector('meta[property="og:image"]')?.content || "");
    return og || "";
  }catch{ return ""; }
  finally{ await page.close(); }
}

async function main(){
  const seed = JSON.parse(fs.readFileSync(IN, "utf8"));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const out = [];
  for (const e of seed){
    const img = await readOG(context, e.de || e.us);
    out.push({
      name: e.name,
      de: e.de || "",
      us: e.us || "",
      img: img || e.eu || "",
      img2: e.us_hero || heroFromSlug(e.us || ""),
      kern: e.kern || "—",
      sources: e.sources || []
    });
    await new Promise(r => setTimeout(r, 60));
  }

  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");
  console.log(`Wrote ${out.length} items -> ${OUT}`);
}
main().catch(e => { console.error(e); process.exit(1); });
