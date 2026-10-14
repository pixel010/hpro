#!/usr/bin/env bash
# P13 evidence: cross-engine suite, comparison report, epubcheck, workflow lint and CI state into
# docs/belege/P13/. Needs app/.browsers with chromium, firefox and webkit (npx playwright install)
# and, on a host without root, the libraries of scripts/p13-sysroot.sh.
#
#   scripts/belege-p13.sh            # engines spec, comparison, CI scope of the engine projects,
#                                    # epubcheck, actionlint, CI runs (gh api)
#   P13_VOLL=1 scripts/belege-p13.sh # additionally the full functional run in all engines (~45 min)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
B="$ROOT/docs/belege/P13"
mkdir -p "$B"
. "$ROOT/scripts/p13-engines-env.sh"
cd "$ROOT/app"

run() { # FILE TITLE COMMAND...
  local f="$1" t="$2"; shift 2
  { echo "# $t"; echo "# $(date -Iseconds) · $(uname -sr) · node $(node -v)"; echo "\$ $*"; echo; } > "$B/$f"
  local s; s=$(date +%s)
  "$@" >> "$B/$f" 2>&1
  local rc=$?
  { echo; echo "# exit=$rc, $(( $(date +%s) - s )) s"; } >> "$B/$f"
  echo "$f: exit=$rc"
  return 0
}

npx vite build > /dev/null 2>&1 || { echo "vite build fehlgeschlagen"; exit 1; }

# 1. The comparison spec in the three engines, then the report (Playwright empties test-results/
#    at the start of every run, so the report is made right after).
run 01-engines-spec.txt "Cross-Engine-Spec (e2e/engines.spec.ts) in Chromium, Firefox, WebKit" \
  npx playwright test e2e/engines.spec.ts --project=engine-chromium --project=engine-firefox --project=engine-webkit --reporter=list
rm -rf "$B/vergleich"
run 02-vergleich.txt "Engine-Vergleich (scripts/p13-vergleich.mjs)" \
  node "$ROOT/scripts/p13-vergleich.mjs" --out "$B/vergleich"
for e in chromium firefox webkit; do
  mkdir -p "$B/vergleich/roh/$e"
  cp -r "test-results/engines/$e/engine.json" "test-results/engines/$e/messung" "$B/vergleich/roh/$e/" 2>/dev/null
done

# 2. What CI runs in the engine matrix (default ENGINE_SPECS of playwright.config.ts).
run 03-engine-projekte-ci-umfang.txt "Engine-Projekte im CI-Umfang (Chromium, Firefox, WebKit)" \
  npx playwright test --project=engine-chromium --project=engine-firefox --project=engine-webkit --reporter=list

# 3. Optional: everything, with the known differences failing visibly.
if [ "${P13_VOLL:-}" = "1" ]; then
  run 04-vollauf.txt "Vollauf aller Funktions-Specs (P13_VOLL=1) in Firefox und WebKit" \
    env P13_VOLL=1 npx playwright test --project=engine-firefox --project=engine-webkit --reporter=list
fi

cd "$ROOT"
run 05-epubcheck.txt "epubcheck 5.4.0 über alle Container (scripts/p13-epubcheck.mjs)" \
  node scripts/p13-epubcheck.mjs --md "$B/epubcheck.md"
if [ -x app/.tmp/actionlint ]; then
  run 06-actionlint.txt "actionlint $(app/.tmp/actionlint -version | head -1) über .github/workflows/ci.yml" \
    app/.tmp/actionlint -shellcheck= -verbose .github/workflows/ci.yml
fi
run 07-ci-laeufe.txt "GitHub-Actions-Läufe des Workflows CI (gh api)" \
  gh api "repos/pixel010/hpro/actions/runs?per_page=10" --jq '.total_count as $n | "Läufe insgesamt: \($n)", (.workflow_runs[] | "\(.id) \(.name) \(.head_branch) \(.head_sha[0:7]) \(.event) \(.status) \(.conclusion) \(.created_at) \(.html_url)")'
echo "Belege: $B"
