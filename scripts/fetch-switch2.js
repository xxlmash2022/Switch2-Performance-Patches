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
    await page.waitForTimeout(
