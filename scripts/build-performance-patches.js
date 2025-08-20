// scripts/build-performance-patches.js
// Input:  data/performance_seed.json
// Output: performance_patches.json (von index.html konsumiert)
// Features:
//  - Prüft DE-Link: wenn 404/Weiterleitung auf 404-Seite → DE wird leer, US bleibt (Fallback).
//  - Liest og:image vom gültigen Produktlink (DE bevorzugt, sonst US).
//  - Behält "kern" + Quellen bei.

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

async function readOG(page){
  try{
    const og = await page.evaluate(() => document.querySelector('meta[property="og:image"]')?.content || "");
    return og || "";
  }catch{ return ""; }
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

    // Prüfe DE-Link, falls vorhanden
    if(de){
      const { looks404 } = await is404(page, de);
      if(looks404){ de = ""; } // DE raus, US bleibt als Fallback
      else { img = await readOG(page); } // og:image von DE nehmen
    }

    // Wenn kein DE (oder DE kaputt) → US nehmen
    if(!de){
      if(us){
        const { looks404 } = await is404(page, us);
        if(!looks404){
          img = img || await readOG(page);
        } else {
          // Wenn sogar US kaputt ist: Felder leer lassen; Client zeigt Proxy/SVG
          us = "";
        }
      }
    }

    await page.close();

    out.push({
      name: e.name,
      de,
      us,
      img: img || e.eu || "",    // og:image bevorzugt; EU-Bild als zusätzlicher Fallback
      img2: img2 || "",          // US-Hero
      kern: e.kern || "—",
      sources: e.sources || []
    });

    // sanfte Pause
    await new Promise(r => setTimeout(r, 80));
  }

  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");
  console.log(`Wrote ${out.length} items -> ${OUT}`);
}

main
