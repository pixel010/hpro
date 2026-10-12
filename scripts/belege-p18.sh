#!/usr/bin/env bash
# Erzeugt die Belege für Paket P18 (Druckweg nach DIN A4, abgeleitete Ausgabe) unter docs/belege/P18/.
#
#  00 Werkzeuge und Versionen
#  01 Unit-Tests app/test/print.test.ts (Druckfassung, Medienabfragen, Adressen, Sperren)
#  02 Browsertests app/e2e/druck.spec.ts (Reader druckt, PDF-Seiten = vorhergesagte Seiten)
#  03 Beleglauf app/e2e/p18-belege.spec.ts: PDFs, Druckfassungen, Berichte nach pdf/
#  04 Unabhängige PDF-Prüfung (pypdf, pdfium): druck, lebendig, sperren, beispiel, kostenschaetzung; Seitenbilder nach seiten/
#  05 Gegenprobe: dieselbe Prüfung auf einem Ausdruck ohne Druckprofil (muss fehlschlagen)
#  06 veraPDF 1.30.3: PDF/UA-1 und PDF/A-2b (Abweichungsbericht; Berichte nach verapdf/)
#  07 Konformitätsprüfer und epubcheck auf dem Prüfdokument druck.hpro
#  08 Messungen an Chromium, auf denen die Seitenvorhersage beruht (target-counter, Satzspiegel in px,
#     Tabellenkopf im Mehrspaltensatz, Außenabstand nach Umbruch)
#  09 Prüfung wie der Läufer: npm ci, npm test --if-present
#
# Voraussetzung: Node >= 22, Playwright-Chromium unter app/.browsers, JDK 21 und epubcheck 5.4.0
# unter prototyp/tools/ (docs/05), veraPDF 1.30.3 unter prototyp/tools/verapdf-1.30.3 (Installation
# im README dieses Ordners), pypdf, pypdfium2, Pillow und lxml in prototyp/.venv.
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/P18
JAVA_HOME=$PWD/prototyp/tools/jdk-21.0.12.1+1
JAVA=$JAVA_HOME/bin/java
EPUBCHECK=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
VERAPDF=prototyp/tools/verapdf-1.30.3/verapdf
PY=prototyp/.venv/bin/python
export JAVA_HOME PATH="$JAVA_HOME/bin:$PATH" PLAYWRIGHT_BROWSERS_PATH="$PWD/app/.browsers"
mkdir -p "$OUT/pdf" "$OUT/seiten" "$OUT/verapdf"
rm -f "$OUT"/pdf/* "$OUT"/seiten/* "$OUT"/verapdf/*

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }

npm run build -w kern --silent && npm run build:test -w kern --silent || exit 2
(cd app && npx vite build > /dev/null) || exit 2

{
  echo "# P18 Werkzeuge"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  run node --version
  run node -e "const { chromium } = require('./node_modules/playwright'); chromium.launch().then(async (b) => { console.log('Chromium (Playwright headless shell)', b.version()); await b.close(); })"
  run npx --prefix app playwright --version
  run "$PY" -c "import pypdf, PIL, lxml.etree as e, pypdfium2.version as v; print('pypdf', pypdf.__version__, '/ pypdfium2', v.PYPDFIUM_INFO, '/ pdfium', v.PDFIUM_INFO, '/ Pillow', PIL.__version__, '/ lxml', e.__version__)"
  run "$JAVA" -version
  run "$VERAPDF" --version
  run "$JAVA" -jar "$EPUBCHECK" --version
  echo "Prüfdokument: docs/spezifikation/beispiele/p18-druck/ (erzeugt mit scripts/p18-beispiel-quelle.mjs), gebaut als app/dist/druck.hpro"
  run sha256sum app/dist/druck.hpro app/dist/lebendig.hpro app/dist/sperren.hpro app/dist/beispiel.hpro app/dist/kostenschaetzung.hpro
} > "$OUT/00-werkzeuge.txt" 2>&1

{
  echo "# P18 Unit-Tests (Vitest, jsdom): app/test/print.test.ts"
  echo
  (cd app && run npx vitest run test/print.test.ts)
} > "$OUT/01-unit-tests.txt" 2>&1

{
  echo "# P18 Browsertests (Playwright, Chromium): app/e2e/druck.spec.ts – Teil von npm test"
  echo
  (cd app && run npx playwright test --project=chromium e2e/druck.spec.ts)
} > "$OUT/02-browsertests.txt" 2>&1

{
  echo "# P18 Beleglauf: der Reader druckt druck.hpro und die Beispiele lebendig, sperren, beispiel, kostenschaetzung; dazu die Gegenprobe"
  echo "# Ausgaben: $OUT/pdf/<name>.pdf, <name>-druckfassung.html, <name>-bericht.json"
  echo
  (cd app && run npx playwright test --project=belege e2e/p18-belege.spec.ts)
  for f in "$OUT"/pdf/*-bericht.json; do
    echo "--- $f (Bericht des Readers, Auszug)"
    node -e '
      const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const x = r.reader;
      console.log(JSON.stringify({ quelle: r.quelle, status: r.status, seitenVorhergesagt: x.pages, seitenImPdf: r.pdf.pages.length, verzeichnis: x.toc, ziele: x.targets, sprungzieleImPdf: r.pdf.dests, ausserhalbSatzspiegel: x.overflow, ueberschriftAmSeitenende: x.headingsAtPageEnd, codeBloecke: x.codeBlocks, markierteUmbrueche: x.markedWraps, unmarkierteUmbrueche: x.unmarkedWraps, breiteTabellen: x.wideTables, messdurchlaeufe: x.passes, stabil: x.stable, lebendig: x.live, ausgelassen: x.omitted, pdfGetaggt: r.pdf.tagged, pdfLesezeichen: r.pdf.outline, pdfSprache: r.pdf.lang, pdfTitel: r.pdf.title }, null, 1));
    ' "$f"
    echo
  done
} > "$OUT/03-belege-lauf.txt" 2>&1

{
  echo "# P18 Unabhängige Prüfung der PDFs (scripts/p18-pdf-pruefung.py; pypdf und pdfium, ohne Code des Readers)"
  echo
  run "$PY" scripts/p18-pdf-pruefung.py "$OUT" druck lebendig sperren beispiel kostenschaetzung
} > "$OUT/04-pdf-pruefung.txt" 2>&1

{
  echo "# P18 Gegenprobe: dieselbe Druckfassung ohne das Druckprofil des Readers, von Chromium auf A4 ohne Ränder gedruckt."
  echo "# Erwartet: die Prüfung schlägt fehl (Exit-Code 1) – sie erkennt also fehlende Kopf-/Fußzeilen, abgeschnittenen Code"
  echo "# und Inhalt am Papierrand."
  echo
  run "$PY" scripts/p18-pdf-pruefung.py "$OUT" kontrolle
} > "$OUT/05-gegenprobe.txt" 2>&1

{
  echo "# P18 veraPDF 1.30.3 auf den Ausdrucken (Chromium/Skia, getaggt): PDF/UA-1 und PDF/A-2b"
  echo "# HP-PRINT-012 ist eine Soll-Anforderung des PDF-Exports; der Druckweg des Readers beansprucht keine"
  echo "# PDF/A- oder PDF/UA-Konformität. Dieser Teil hält die Abweichungen fest (vollständige Berichte in verapdf/)."
  echo
  for name in druck lebendig sperren; do
    for flavour in ua1 2b; do
      xml="$OUT/verapdf/$name-$flavour.xml"
      echo "\$ verapdf --flavour $flavour --format xml --maxfailuresdisplayed 1 $OUT/pdf/$name.pdf > $xml"
      "$VERAPDF" --flavour "$flavour" --format xml --maxfailuresdisplayed 1 "$OUT/pdf/$name.pdf" > "$xml" 2>&1
      echo "[Exit-Code $?]"
      "$PY" - "$xml" <<'PYEOF'
import sys
from lxml import etree
t = etree.parse(sys.argv[1])
rep = t.find('.//validationReport')
det = rep.find('details')
print(f"  {rep.get('profileName')}: konform={rep.get('isCompliant')}; Regeln bestanden {det.get('passedRules')}, verletzt {det.get('failedRules')}; Prüfungen bestanden {det.get('passedChecks')}, fehlgeschlagen {det.get('failedChecks')}")
for rule in det.findall('rule'):
    if rule.get('status') == 'failed':
        print(f"    § {rule.get('clause')}-{rule.get('testNumber')} ({rule.get('failedChecks')}×): {' '.join(rule.findtext('description').split())}")
PYEOF
      echo
    done
  done
} > "$OUT/06-verapdf.txt" 2>&1

{
  echo "# P18 Konformitätsprüfer (hpro-check, mit epubcheck) auf dem Prüfdokument druck.hpro"
  echo "# Die Regeln HPR-PRINT-001 … 003 (feste Seitengeometrie, @page, Druckstylesheet) gelten für das Dokument."
  echo
  run node kern/build/bin/hpro-check.js app/dist/druck.hpro
  echo "# epubcheck direkt (EPUB-Rückfallebene); bytegleiche Kopie mit Endung .epub"
  mkdir -p app/.scratch/p18
  cp app/dist/druck.hpro app/.scratch/p18/druck.epub
  run cmp app/dist/druck.hpro app/.scratch/p18/druck.epub
  run "$JAVA" -jar "$EPUBCHECK" app/.scratch/p18/druck.epub
} > "$OUT/07-pruefer-epubcheck.txt" 2>&1

{
  echo "# P18 Messungen an Chromium (scripts/p18-messung.mjs, Auswertung scripts/p18-messung-auswertung.py)"
  echo "# Grundlage von app/src/paginate.ts und print.css: warum die Seitenzahlen vorhergesagt werden, mit welchem"
  echo "# Satzspiegel in px gemessen wird und warum Tabellenköpfe beim Messen eingefügt werden."
  echo
  run node scripts/p18-messung.mjs app/.scratch/p18-messung
  run "$PY" scripts/p18-messung-auswertung.py app/.scratch/p18-messung
} > "$OUT/08-messungen-chromium.txt" 2>&1

# The runner checks with `npm ci` followed by `npm test --if-present`. A server left running from
# node_modules keeps the rolldown binary open; on the shfs/FUSE volume `npm ci` then fails.
# Shells are skipped: a calling shell carries the pattern in its own command line.
stray() {
  local found
  found=$(ps -eo pid=,comm=,args= | awk '$2 !~ /^(bash|sh|dash|zsh|ps|awk)$/ && /vite preview|\/opt\/data\/html-pro\/(app\/)?node_modules\//')
  echo "${found:-(keine)}"
}
{
  echo "# P18 Prüfung wie der Läufer (runner/auto_lauf.py: npm ci, dann npm test --if-present)"
  echo "# davor und danach: Prozesse, die node_modules offen halten könnten"
  echo
  echo "\$ ps -eo pid,comm,args   # Nicht-Shell-Prozesse mit 'vite preview' oder node_modules/, vorher"; stray; echo
  run npm ci --no-audit --no-fund
  run npm test --if-present
  echo "\$ ps -eo pid,comm,args   # Nicht-Shell-Prozesse mit 'vite preview' oder node_modules/, nachher"; stray; echo
} > "$OUT/09-laeufer-pruefung.txt" 2>&1

echo "Belege P18 geschrieben nach $OUT"
grep -H "Exit-Code" "$OUT"/0*.txt | sort | uniq -c
