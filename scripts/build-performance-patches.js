name: Update Performance Patches

on:
  workflow_dispatch:
  schedule:
    - cron: "30 */12 * * *"  # alle 12 Stunden

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - name: 📥 Checkout
        uses: actions/checkout@v4

      - name: ⚙️ Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 18

      - name: 📦 Install deps + Playwright
        run: |
          npm install || true
          npx playwright install --with-deps chromium || true

      - name: ▶️ Build patches JSON (dein Skript)
        run: node scripts/fetch-performance-patches.js || true

      - name: 🔎 Validate patches count
        id: validate
        run: |
          COUNT=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('performance_patches.json','utf8')).length)}catch(e){console.log(0)}")
          echo "COUNT=$COUNT"
          if [ "$COUNT" -lt 1 ]; then
            echo "PATCH_TOO_FEW=true" >> $GITHUB_ENV
          fi

      - name: 💾 Commit patches (nur wenn sinnvoll)
        if: env.PATCH_TOO_FEW != 'true'
        run: |
          git config --global user.name  "github-actions[bot]"
          git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add performance_patches.json
          if git diff --cached --quiet; then
            echo "No JSON changes."
          else
            git commit -m "chore: update performance_patches.json (safe)"
            git push
          fi