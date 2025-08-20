// scripts/build-performance-patches.js
// Input:  data/performance_seed.json
// Output: performance_patches.json (von index.html konsumiert)
// Features:
//  - Prüft DE-Link (404 / 404-Redirect) → fallback auf US
//  - Liest og:image + Veröffentlichungsdatum (JSON-LD) von gültiger Seite
//  - Schreibt release_date im ISO-Format YYYY-MM-DD
//  - Sortiert neueste zuerst, fehlende Daten ans Ende

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const IN  = path.resolve(process.cwd(), "data/performance_seed.json");
const OUT = path.resolve(process.cwd(), "performance_patches.json");

function heroFromUS(us){
  if(!us) return "";
  const slug = us.split("/").filter(Boolean).pop();
  if(!slug) return "";
  const c = slug[0].toLowerCase();
  return `https://assets.nintendo.com/image/upload/f_auto/q_auto/ncom/en_US/games/switch/${c}/${slug}/hero`;
}
function normDate(s){
  if(!s) return null;
  const d = new Date(String(s).trim());
  if (isNaN(d)) return null;
  const y=d.getUTCFullYear(), mo=String(d.getUTCMonth()+1).padStart(2,'0'), da=String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${mo}-${da}`;
}

async function is404(page, url){
  try{
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(400);
    const code = resp ? resp.status() : 0;
    const finalUrl = page.url();
    const looks404 = /\/404(\.html)?/i.test(finalUrl) || code >= 400;
    return { looks404, code, finalUrl };
  }catch(e){
    return { looks404: true, code: 0, finalUrl: "" };
  }
}

async function grabMeta(page){
  try{
    const r = await page.evaluate(() => {
      const og = document.querySelector('meta[property="og:image"]')?.content || "";
      const jsons = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => { try{ return JSON.parse(s.textContent); }catch{ return null; } }).filter(Boolean);
      const flat = (x)=> Array.isArray(x)? x.flatMap(flat): (x && typeof x==='object'? [x, ...Object.values(x).flatMap(flat)]: []);
      let release = null;
      for(const obj of flat(jsons)){
        const cand = obj.releaseDate || obj.datePublished || obj.dateCreated;
        if(cand){ release = cand; }
      }
      return { og, release };
    });
    return r || { og:"", release:null };
  }catch{ return { og:"", release:null }; }
}

async function main(){
  const seed = JSON.parse(fs.readFileSync(IN, "utf8"));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });

  const out = [];
  for(const e of seed){
    const page = await context.newPage();

    let de = e.de || "";
    let us = e.us || "";
    let img = "";
    let img2 = e.us_hero || heroFromUS(us);
    let release_date = null;

    // Prüfe DE zuerst
    if(de){
      const { looks404 } = await is404(page, de);
      if(looks404){ de = ""; } 
      else {
        const meta = await grabMeta(page);
        img = meta.og || "";
        release_date = normDate(meta.release);
      }
    }

    // Falls DE nicht ging → US
    if(!de){
      if(us){
        const { looks404 } = await is404(page, us);
        if(!looks404){
          const meta = await grabMeta(page);
          img = img || meta.og || "";
          release_date = release_date || normDate(meta.release);
        } else {
          us = "";
        }
      }
    }

    await page.close();

    out.push({
      name: e.name,
      de,
      us,
      img: img || e.eu || "",
      img2: img2 || "",
      kern: e.kern || "—",
      sources: e.sources || [],
      release_date
    });

    await new Promise(r => setTimeout(r, 80));
  }

  await browser.close();

  // neueste zuerst
  out.sort((a,b)=>{
    const ta = Date.parse(a.release_date||'');
    const tb = Date.parse(b.release_date||'');
    if(isNaN(ta) && isNaN(tb)) return a.name.localeCompare(b.name,"de");
    if(isNaN(ta)) return 1;
    if(isNaN(tb)) return -1;
    return tb - ta;
  });

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");
  console.log(`Wrote ${out.length} items -> ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
