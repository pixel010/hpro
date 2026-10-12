#!/usr/bin/env bash
# Erzeugt die Belege für Paket P19 (Tabellenrechner im Kern und in der Oberfläche) unter
# docs/belege/P19/.
#
#  0. Werkzeuge und Versionen
#  1. Tests des Rechners (kern/test/calc-*.test.ts), mit Zählung der abgedeckten Funktionen
#  2. npm ci und npm test (gesamt: Kern, Reader mit Playwright, Spezifikationsprüfungen)
#  3. Gegenprobe gegen LibreOffice (scripts/p19-gegenprobe.mjs)
#  4. Messungen zu den Änderungsanträgen HPC-0005 und HPC-0006 (scripts/p19-antraege.mjs)
#  5. Screenshots und Messungen im Reader (npm run belege:p19 -w app)
#  6. Import mit eingefrorenen Formeln und Bericht (scripts/p19-import-beleg.mjs)
#  7. epubcheck über alle erzeugten Container
#  8. hpro-check (Konformitätsprüfer) über Beispiel, ausgefülltes Beispiel und Import
#
# Voraussetzung: Node >= 22, LibreOffice unter prototyp/tools/libreoffice/, Java 21 und
# epubcheck 5.4.0 unter prototyp/tools/ (docs/05).
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/P19
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
LO=prototyp/tools/libreoffice/opt/libreoffice26.8/program
SCRATCH=app/.scratch/p19-epub
mkdir -p "$OUT"

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }

{
  echo "# P19 Werkzeuge"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  run node --version
  run npm --version
  run "$JAVA" -version
  echo "# soffice --version bricht hier an einer fehlenden X-Bibliothek ab (oosplash: libXinerama.so.1);"
  echo "# gerechnet wird ohne Oberfläche über soffice.bin und das mitgelieferte Python/UNO"
  echo "# (scripts/p19-lo-werte.py). Die Version meldet LibreOffice selbst über UNO, siehe"
  echo "# gegenprobe/libreoffice-werte.json, Feld office, und den Kopf von 03-gegenprobe.txt."
  run ls "$LO/soffice.bin" "$LO/python"
  run wc -l docs/spezifikation/03-funktionen.json kern/src/calc/*.ts
} > "$OUT/00-werkzeuge.txt" 2>&1

npm run -s build:test -w kern >/dev/null

{
  echo "# P19 Abnahme 1: Tests des Rechners; HPF-FN-001 zählt die abgedeckten Funktionen gegen"
  echo "# docs/spezifikation/03-funktionen.json (Liste 8.2 aus S6)"
  echo
  run node -e 'const j=require("./docs/spezifikation/03-funktionen.json"); console.log(`03-funktionen.json: ${j.functions.length} Funktionen, ${j.excluded.length} ausgeschlossen`)'
  run node --test kern/build/test/calc-*.test.js
} > "$OUT/01-rechner-tests.txt" 2>&1

{
  echo "# P19 npm ci und npm test (gesamter Bestand)"
  echo
  run npm ci --no-audit --no-fund
  run npm test
} > "$OUT/02-npm-test.txt" 2>&1

{
  echo "# P19 Abnahme 2: Gegenprobe gegen LibreOffice"
  echo
  run node scripts/p19-gegenprobe.mjs
} > "$OUT/03-gegenprobe.txt" 2>&1

{
  echo "# P19 Messungen zu HPC-0005 (Rundung) und HPC-0006 (Klarstellungen), Kern gegen LibreOffice"
  echo
  run node scripts/p19-antraege.mjs
} > "$OUT/04-antraege.txt" 2>&1

{
  echo "# P19 Abnahme 3 und 4: Screenshots und Messungen im Reader (Chromium, Playwright)"
  echo
  run npm run belege:p19 -w app
} > "$OUT/05-belege-lauf.txt" 2>&1

{
  echo "# P19 Abnahme 5: Import, nicht unterstützte Formeln als Wert eingefroren und im Bericht"
  echo
  run node scripts/p19-import-beleg.mjs
} > "$OUT/06-import.txt" 2>&1

rm -rf "$SCRATCH" && mkdir -p "$SCRATCH"
{
  echo "# P19 epubcheck 5.4.0. epubcheck prüft nur Dateien mit Endung .epub; geprüft werden byte-identische Kopien."
  echo "# app/dist/kostenschaetzung.hpro enthält die signierte eingefrorene Fassung renditions/nachweis-2026-10-12/;"
  echo "# ihr RSC-011 ist der bekannte Widerspruch der Spezifikation (Änderungsantrag HPC-0003, siehe README)."
  echo
  for f in app/dist/kostenschaetzung.hpro "$OUT/gegenprobe/p19-kostenschaetzung.hpro" "$OUT/gegenprobe/p19-kostenschaetzung-ausgefuellt.hpro" "$OUT/import/p19-quelle-ods.hpro" "$OUT/import/p19-quelle-xlsx.hpro"; do
    n=$(basename "$f" .hpro)
    cp "$f" "$SCRATCH/$n.epub"
    run sha256sum "$f" "$SCRATCH/$n.epub"
    run "$JAVA" -jar "$EPUBCHECK" "$SCRATCH/$n.epub"
  done
} > "$OUT/07-epubcheck.txt" 2>&1

{
  echo "# P19 hpro-check (Konformitätsprüfer Teil 1). Exit-Code 3 = keine Fehler, aber Regeln nicht prüfbar"
  echo "# (keine Browser-Engine im Prüfer); Exit-Code 1 = Fehler."
  echo
  for f in app/dist/kostenschaetzung.hpro "$OUT/gegenprobe/p19-kostenschaetzung-ausgefuellt.hpro" "$OUT/import/p19-quelle-ods.hpro"; do
    run npm run -s hpro-check -- "$f"
  done
} > "$OUT/08-hpro-check.txt" 2>&1

grep -H -E "Exit-Code|^ℹ (tests|pass|fail)|Gegenprobe (bestanden|NICHT)|Import-Beleg|passed|failed|Messages:|Befunde:" "$OUT"/0*.txt
