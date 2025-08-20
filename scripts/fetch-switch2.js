// scripts/fetch-switch2.js
// Quelle: https://www.nintendo.com/us/store/games/nintendo-switch-2-games/#sort=df&p=0
// Ergebnis: new_switch2_games.json [{ name, us, img, img2, price_eur, release_date }]

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const OUT = path.resolve(process.cwd(), "new_switch2_games.json");
const LIST_BASE = "https://www.nintendo.com/us/store/games/nintendo-switch-2-games/";
const PAGE_URL = (p) => `${LIST_BASE}?sort=df&p=${p}`;
const PRODUCT_PREFIX = "/us/store/products/";
const MAX_PAGES = 50;
const CONCURRENCY = 4;

function heroFromSlug(slug){ if(!slug) return ""; const c=slug[0].toLowerCase(); return `https://assets.nintendo.com/image/upload/f_auto/q_auto/ncom/en_US/games/switch/${c}/${slug}/hero`; }
function normDate(s){
  if(!s) return null;
  const m = String(s).trim();
  // handle YYYY-MM-DD, YYYY/MM/DD, "2025-03-14T..." etc.
  const d = new Date(m);
  if (isNaN(d)) return null;
  const y=d.getUTCFullYear(), mo=String(d.getUTCMonth()+1).padStart(2,'0'), da=String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${mo}-${da}`;
}

async function usdToEur(amountUsd){
  try{
    const r = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=EUR");
    const j = await r.json(); const rate = j?.rates?.EUR;
    if(!rate) return null; return Math.round((amountUsd * rate) * 100) / 100;
  }catch{ return null; }
}

async function extractListLinks(page){
  await page.waitForLoadState("domcontentloaded", { timeout: 45000 });
  await page.waitForTimeout(1000);
  const items = await page.evaluate((PRODUCT_PREFIX) => {
    const anchors = Array.from(document.querySelectorAll(`a[href^="${PRODUCT_PREFIX}"]`));
    const map = new Map();
    for(const a of anchors){
      const href = a.getAttribute("href"); if(!href) continue;
      const full = new URL(href, location.origin).toString().replace(/\/+$/, "/");
      const aria = a.getAttribute("aria-label") || "";
      const imgAlt = a.querySelector("img")?.getAttribute("alt") || "";
      const text = (a.textContent || "").replace(/\s+/g, " ").trim();
      const title = aria || imgAlt || text || "";
      if(!map.has(full)) map.set(full, title);
    }
    return Array.from(map, ([us, title]) => ({ us, title }));
  }, PRODUCT_PREFIX);
  return items;
}

async function readProduct(context, url){
  const page = await context.newPage();
  try{
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(600);

    const meta = await page.evaluate(() => {
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content || "";
      const ogImage = document.querySelector('meta[property="og:image"]')?.cont
