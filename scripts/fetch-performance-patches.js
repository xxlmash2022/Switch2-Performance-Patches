// scripts/fetch-performance-patches.js
// Scraper für Switch 2 Performance-Patches
// Holt Daten aus einer vorbereiteten Quelle (z.B. News/Publisher-Seiten)
// -> Platzhalter-Implementierung, du kannst die Quelle flexibel tauschen

import fs from "fs";

// Hier legen wir unsere bekannten Patches fest (später erweiterbar per Scraper)
const patches = [
  {
    title: "The Legend of Zelda: Breath of the Wild",
    url: "https://www.nintendo.com/us/store/products/the-legend-of-zelda-breath-of-the-wild-switch/",
    thumbnail: "https://www.nintendo.com/us/store/games/assets/hero/ZeldaBOTW.jpg",
    patch_details: "Bezahlbarer Patch: verbesserte Performance & Auflösung",
  },
  {
    title: "The Legend of Zelda: Tears of the Kingdom",
    url: "https://www.nintendo.com/us/store/products/the-legend-of-zelda-tears-of-the-kingdom-switch/",
    thumbnail: "https://www.nintendo.com/us/store/games/assets/hero/ZeldaTOTK.jpg",
    patch_details: "Bezahlbarer Patch: 60 FPS, bessere Sichtweite",
  },
  {
    title: "Kirby and the Forgotten Land",
    url: "https://www.nintendo.com/us/store/products/kirby-and-the-forgotten-land-switch/",
    thumbnail: "https://www.nintendo.com/us/store/games/assets/hero/KirbyFL.jpg",
    patch_details: "Bezahlbarer Patch: 60 FPS, optimierte Ladezeiten",
  }
];

// Speichern als JSON
fs.writeFileSync("performance_patches.json", JSON.stringify(patches, null, 2));
console.log(`✅ ${patches.length} Performance-Patches gespeichert in performance_patches.json`);
