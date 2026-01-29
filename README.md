# Switch‑2 Performance‑Patches (Nintendo DE Links, Thumbnails)

**Layout**: Dynamischer Header „Performance Patches: <Anzahl> — Stand: <Datum>“
Tabelle: **[Thumbnail | Spiel (Link bevorzugt Nintendo DE) | Kern‑Patch‑Inhalte | Quelle]**

**Regeln**:
- Thumbnails sind immer Pflicht (bevorzugt Nintendo‑EU‑CDN).
- Links gehen vorrangig an den deutschen Nintendo‑Shop (nintendo.de / nintendo.com/de‑de). Amazon.de nur als Fallback.
- Inkrementales Pflegen: Bekannte Titel unverändert lassen, nur neue Spiele ergänzen.

## Lokal ansehen
Öffne `index.html` im Browser. GitHub Pages wird automatisch aktualisiert, wenn du die Datei im Repo ersetzt.

## Mitwirken
Füge neue Zeilen im `<tbody>` hinzu (alphabetisch oder nach Relevanz).

## Ubuntu‑Server: AzerothCore + mod‑playerbots
Dieses Repo enthält nur den Switch‑2‑Scraper. Der folgende Abschnitt ist eine kurze **externe** Anleitung, damit **AzerothCore** und **mod‑playerbots** auf deinem Ubuntu‑Server sauber durchlaufen. Nutze die Playerbot‑Branch und die offiziellen Installer‑Schritte:

1. AzerothCore Playerbot‑Branch klonen:
   `git clone https://github.com/mod-playerbots/azerothcore-wotlk.git --branch Playerbot`
2. Modul hinzufügen:
   `cd azerothcore-wotlk/modules && git clone https://github.com/mod-playerbots/mod-playerbots.git --branch master`
3. Abhängigkeiten installieren (Ubuntu):
   `cd .. && sudo ./acore.sh install-deps`
4. Build/DB‑Setup über `./acore.sh` durchführen. Details:  
   - https://www.azerothcore.org/wiki/installation  
   - https://github.com/mod-playerbots/mod-playerbots?tab=readme-ov-file

Wichtig: **mod‑playerbots benötigt die Playerbot‑Branch** von AzerothCore, nicht den Standard‑`master`.

## Lizenz
MIT
