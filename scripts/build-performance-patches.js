// scripts/build-performance-patches.js
// Inkrementelles Bauen der Performance-Patch-Liste (nie auf 0)
// Läuft auf GitHub Actions (Node 18+, Playwright installiert)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const OUT_TMP = path.join(__dirname, "..", "performance_patches.tmp.json");
const OUT_FIN = path.join(__dirname, "..", "performance_patches.json");
const GAMES   = path.join(__dirname, "..", "new_switch2_games.json");
const SEEDS   = path.join(__dirname, "..", "seeds", "perfpatch_sources.json");

const PRODUCT_PREFIX = "https://www.nintendo.com/us/store/products/";

function heroFromSlug(slug){
  if(!slug) return null;
  const c = (slug[0]||"x").toLowerCase();
  return `https://assets.nintendo.com/image/upload/f_auto/q_auto/ncom/en_US/games/switch/${c}/${slug}/hero`;
}

function normUrl(u){
  try { return new URL(u).toString().replace(/\/+$/,"/"); } catch { return null; }
}

function boolFrom(text, ...patterns){
  const t = text.toLowerCase();
  return patterns.some(p => (typeof p==="string" ? t.includes(p.toLowerCase()) : p.test(t)));
}

function extractHints(text){
  const hints = [];
  const t = text.toLowerCase();

  if (/\b60\s*fps\b|\b120\s*fps\b|higher frame|improved frame|framerate\b/.test(t)) hints.push("bis zu 60 FPS");
  if (/\b4k\b|ultra hd|higher resolution|upscaled|fsr|dlss/.test(t)) hints.push("höhere Auflösung");
  if (/reduced loading|faster loading|ladezeiten|load time/.test(t)) hints.push("kürzere Ladezeiten");
  if (/visual improvements|improved visuals|graphics|texturen/.test(t)) hints.push("Grafik-Verbesserungen");
  if (/performance mode|quality mode|modus/.test(t)) hints.push("Performance-/Qualitätsmodus");
  if (/ray tracing/.test(t)) hints.push("Raytracing (wenn aktiv)");
  if (/haptics|rumble/.test(t)) hints.push("verbessertes Rumble/Haptik");

  if (/switch\s*2|nintendo\s*switch\s*2|next\-gen/.test(t) && !hints.length) {
    hints.push("Switch-2-optimiert");
  }
  return Array.from(new Set(hints)).slice(0,5).join(", ") || null;
}

function isPaid(text){
  return boolFrom(
    text,
    /paid\s*(upgrade|patch|update)/,
    /upgrade\s*fee|pay\s*to\s*upgrade|kostenpflichtig|bezahl(?:t|bar)/,
    /deluxe\s*upgrade|expansion\s*upgrade/
  );
}

async function passAgeGate(page){
  try{
    await page.waitForTimeout(400);
    const selYear  = 'select[name="year"], select#year';
    const selMonth = 'select[name="month"], select#month';
    const selDay   = 'select[name="day"], select#day';

    if (await page.locator(selYear).first().isVisible({ timeout: 800 }).catch(()=>false)){
      await page.selectOption(selYear,  '1990').catch(()=>{});
      await page.selectOption(selMonth, '1').catch(()=>{});
      await page.selectOption(selDay,   '1').catch(()=>{});
      const btn = page.getByRole("button", { name: /continue|enter|submit|weiter|bestätigen/i }).first();
      await btn.click().catch(()=>{});
      await page.waitForTimeout(600);
    } else {
      const cont = page.getByRole("button", { name: /continue|enter|proceed|weiter/i }).first();
      if (await cont.isVisible({ timeout: 600 }).catch(()=>false)){
        await cont.click().catch(()=>{});
        await page.waitForTimeout(500);
      }
    }
  }catch{/* ignore */}
}

async function readPage(context, url){
  const page = await context.newPage();
  try{
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await passAgeGate(page);
    await page.waitForTimeout(400);

    const info = await page.evaluate(() => {
      const get = (sel, attr="content") => document.querySelector(sel)?.getAttribute(attr) || null;

      const ogTitle = get('meta[property="og:title"]') || document.querySelector("h1,h2,h3")?.textContent?.trim() || null;
      const ogImage = get('meta[property="og:image"]');

      const alternates = Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]'))
        .map(l => ({ lang: l.getAttribute("hreflang"), href: l.getAttribute("href") }))
        .filter(x => x.href);

      const deAlt = alternates.find(a => /(^de$)|de-?de/i.test(a.lang||""));
      const text  = document.body?.innerText || "";

      return { ogTitle, ogImage, alternates, deHref: deAlt?.href || null, text };
    });

    return info;
  }catch(e){
    return { ogTitle: null, ogImage: null, alternates: [], deHref: null, text: "" };
  } finally {
    await page.close();
  }
}

function upsert(list, entry){
  const byKey = new Map(list.map(e => [normUrl(e.us) || e.us, e]));
  const k = normUrl(entry.us) || entry.us;
  const old = byKey.get(k);
  if (!old){
    list.push(entry);
    return { added: 1, updated: 0 };
  }
  let changed = 0;
  for (const [key, val] of Object.entries(entry)){
    if (val == null || val === "") continue;
    if (old[key] == null || old[key] === ""){
      old[key] = val; changed++;
    } else if (["name","img","img2","de","link","core_patch","paid","source","last_checked"].includes(key)){
      old[key] = val; changed++;
    }
  }
  return { added: 0, updated: changed ? 1 : 0 };
}

async function main(){
  const base = fs.existsSync(OUT_FIN)
    ? JSON.parse(fs.readFileSync(OUT_FIN, "utf8"))
    : [];
  const list = Array.isArray(base) ? base : [];

  const candidates = new Set();

  if (fs.existsSync(SEEDS)){
    try{
      const seedList = JSON.parse(fs.readFileSync(SEEDS, "utf8"));
      for (const u of seedList){
        const nu = normUrl(u);
        if (nu) candidates.add(nu);
      }
    }catch{/* ignore */}
  }

  if (fs.existsSync(GAMES)){
    try{
      const games = JSON.parse(fs.readFileSync(GAMES, "utf8"));
      for (const g of games){
        const nu = normUrl(g?.us || g?.link);
        if (nu && nu.startsWith(PRODUCT_PREFIX)) candidates.add(nu);
      }
    }catch{/* ignore */}
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
    locale: "en-US",
  });

  let added=0, updated=0, scanned=0;
  for (const usUrl of candidates){
    scanned++;
    if (!usUrl.startsWith(PRODUCT_PREFIX)) continue;

    const slug = usUrl.split("/").filter(Boolean).pop();
    const hero = heroFromSlug(slug);

    const meta = await readPage(ctx, usUrl);
    const text = meta.text || "";

    const looksLikePatch =
      boolFrom(text,
        /switch\s*2\s*(edition|update|patch)/i,
        /performance\s*(patch|update|mode)/i,
        /enhanced|improved|upgrade|remaster/i,
        /frame\s*rate|fps|resolution|visuals|graphics/i
      );
    if (!looksLikePatch) continue;

    const name = (meta.ogTitle || slug || "Unbekannt").replace(/\s+/g," ").trim();
    const img  = meta.ogImage || hero || null;
    const de   = normUrl(meta.deHref);
    const link = de || usUrl;

    const core = extractHints(text);
    const paid = isPaid(text);

    const entry = {
      name,
      link,     // DE bevorzugt, sonst US
      de: de || null,
      us: usUrl,
      img,
      img2: hero || null,
      core_patch: core,
      paid,
      source: usUrl,
      last_checked: new Date().toISOString().slice(0,10)
    };

    const res = upsert(list, entry);
    added   += res.added;
    updated += res.updated;

    await new Promise(r=>setTimeout(r,120));
  }

  await browser.close();

  fs.writeFileSync(OUT_TMP, JSON.stringify(list, null, 2), "utf8");
  console.log(`✅ build-performance-patches: scanned=${scanned} added=${added} updated=${updated} total=${list.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });