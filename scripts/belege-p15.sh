#!/usr/bin/env bash
# Erzeugt die Belege für Paket P15 (Interaktive Inhalte und Animation) unter docs/belege/P15/.
#
#  0. Werkzeuge und Versionen
#  1. Kern: Regeln für lebendige Inhalte (kern/test/live.test.ts)
#  2. Reader: Unit-Tests (Rahmen-HTML mit Komponenten, CSP, Autoplay)
#  3. Messung zur Bauentscheidung Rahmenhalter (scripts/p15-rahmen-messung.mjs)
#  4. Browsertests P15 mit Messwerten und Bildern (app/e2e/lebendig.spec.ts; Netz 60 s beobachtet)
#  5. Beispieldokument: Medien, Manifestauszug, Prüfsummen
#  6. hpro-check (Konformitätsprüfer, mit epubcheck) und epubcheck direkt
#  7. npm test (gesamter Bestand)
#
# Voraussetzung: Node >= 22, Java 21 und epubcheck 5.4.0 unter prototyp/tools/ (docs/05),
# Chromium unter app/.browsers/ (npm run e2e -w app installiert ihn), ffprobe für Teil 5.
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/P15
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
SAMPLE=app/dist/lebendig.hpro
export PLAYWRIGHT_BROWSERS_PATH="$PWD/app/.browsers"
mkdir -p "$OUT"
rm -rf "$OUT/messungen" "$OUT/bilder"

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }

{
  echo "# P15 Werkzeuge"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  run node --version
  run npm --version
  run "$JAVA" -version
  run npx --prefix app playwright --version
  run ffprobe -version
} > "$OUT/00-werkzeuge.txt" 2>&1

npm run -s build:test -w kern >/dev/null

{
  echo "# P15 Kern: Komponentenplan, Rahmen-CSP, Sandbox-Token, Datenkanal (Teil 1 Abschnitt 8,"
  echo "# Testfall HPL-SBX-008) und Speichern geänderter Daten"
  echo
  run node --test kern/build/test/live.test.js
} > "$OUT/01-kern-live-tests.txt" 2>&1

{
  echo "# P15 Reader: Unit-Tests des Rahmen-HTML (Komponenten nach dem Agenten, Hashes in der CSP,"
  echo "# veränderte Komponente nur statisch, Autoplay nur stumm und nur über den Agenten)"
  echo
  run npx --prefix app vitest run --root app test/render.test.ts
} > "$OUT/02-reader-unit-tests.txt" 2>&1

{
  echo "# P15 Messung zur Bauentscheidung Rahmenhalter (app/frame.html, app/src/frame-host.ts)"
  echo
  run node scripts/p15-rahmen-messung.mjs
} > "$OUT/03-rahmen-messung.txt" 2>&1

(cd app && npx vite build >/dev/null 2>&1)
{
  echo "# P15 Browsertests (Chromium Headless Shell) mit Messwerten nach messungen/ und Bildern"
  echo "# nach bilder/. Netzbeobachtung: P15_BEOBACHTUNG_S=60 (HPL-SBX-003 verlangt 60 s)."
  echo
  cd app
  run env P15_BELEGE=1 P15_BEOBACHTUNG_S=60 npx playwright test --project=chromium e2e/lebendig.spec.ts
  cd ..
} > "$OUT/04-browsertests.txt" 2>&1

{
  echo "# P15 Beispieldokument lebendig.hpro (Quelle docs/spezifikation/beispiele/p15-lebendig/,"
  echo "# Medien erzeugt mit scripts/p15-medien.sh)"
  echo
  run ls -l "$SAMPLE"
  run sha256sum "$SAMPLE"
  for f in docs/spezifikation/beispiele/p15-lebendig/content/media/zeitraffer.webm docs/spezifikation/beispiele/p15-lebendig/content/media/signal.mp3; do
    run ffprobe -hide_banner -v error -show_entries format=duration,size:stream=codec_name,width,height -of compact "$f"
  done
  run node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const { readContainer } = await import("./kern/build/src/index.js");
    const c = await readContainer(new Uint8Array(readFileSync(process.argv[1])));
    const m = c.manifest;
    console.log(JSON.stringify({ conformsTo: m.conformsTo, components: m.components, data: m.data, integrityOk: c.integrity.ok, resources: m.resources.map((r) => `${r.url} ${r.type}`) }, null, 2));
  ' "$SAMPLE"
} > "$OUT/05-beispieldokument.txt" 2>&1

{
  echo "# P15 Konformitätsprüfer auf dem Beispiel (Stufen Basis und Lebendig, mit epubcheck)"
  echo
  run node kern/build/bin/hpro-check.js "$SAMPLE" --json "$OUT/messungen/hpro-check-lebendig.json"
  echo "# epubcheck direkt (EPUB-Rückfallebene); epubcheck erkennt den Container an der Endung,"
  echo "# daher eine bytegleiche Kopie mit Endung .epub"
  mkdir -p app/.scratch/p15
  cp "$SAMPLE" app/.scratch/p15/lebendig.epub
  run cmp "$SAMPLE" app/.scratch/p15/lebendig.epub
  run "$JAVA" -jar "$EPUBCHECK" app/.scratch/p15/lebendig.epub
} > "$OUT/06-pruefer-epubcheck.txt" 2>&1

{
  echo "# P15 npm test (gesamter Bestand: Kern, Reader mit Playwright, Spezifikationsprüfungen)"
  echo
  run npm test
} > "$OUT/07-npm-test.txt" 2>&1

echo "Belege P15 geschrieben nach $OUT"
grep -h "Exit-Code" "$OUT"/0*.txt | sort | uniq -c
