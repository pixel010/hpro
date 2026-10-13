#!/usr/bin/env bash
# Belege P9 – PDF-Export, PDF-Import und OCR über den hpro-Dienst.
# Voraussetzungen: dienst/setup-dienst.sh, prototyp/setup-tools.sh (JDK, epubcheck, veraPDF),
# npm ci, Beispielcontainer unter app/dist (npm run build -w app).
# Der Dienst wird für die Dauer des Skripts auf einem freien Port gestartet und danach beendet.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
OUT=docs/belege/P9
PY=dienst/.venv/bin/python
JAVA="$ROOT/prototyp/tools/jdk-21.0.12.1+1/bin/java"
EPUBCHECK="$ROOT/prototyp/tools/epubcheck-5.4.0/epubcheck.jar"
VERAPDF="$ROOT/prototyp/tools/verapdf-1.30.3/verapdf"
export JAVA_HOME="$ROOT/prototyp/tools/jdk-21.0.12.1+1"
HPRO="node kern/build/bin/hpro.js"
MOD=2026-10-13T08:00:00Z

mkdir -p "$OUT"/{eingabe,export,import,ocr,grenzen,verapdf,seiten}
run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
timed() { local s=$(date +%s%N); echo "\$ $*"; "$@" 2>&1; local rc=$?; local ms=$(( ($(date +%s%N) - s) / 1000000 )); echo "[Exit-Code $rc, $((ms / 1000)),$(( (ms % 1000) / 100 )) s]"; echo; }

npm run -s build:test -w kern >/dev/null || { echo "kern build fehlgeschlagen"; exit 2; }

# ------------------------------------------------------------------ Eingaben
$PY dienst/testdaten/erzeugen.py "$OUT/eingabe" >/dev/null
for n in druck sperren lebendig beispiel kostenschaetzung antrag; do cp "app/dist/$n.hpro" "$OUT/eingabe/$n.hpro"; done
cp docs/belege/S7/container/s7-buero.hpro "$OUT/eingabe/s7-buero.hpro"

{
  echo "# P9 Werkzeuge und Eingaben"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  run node --version
  run $PY --version
  run $PY -c "from importlib.metadata import version as v; [print(p, v(p)) for p in ('weasyprint','docling','docling-core','docling-ibm-models','torch','pypdf','pypdfium2','lxml','pillow')]"
  run env LD_LIBRARY_PATH=dienst/tools/tesseract/usr/lib/x86_64-linux-gnu TESSDATA_PREFIX=dienst/tools/tesseract/usr/share/tesseract-ocr/5/tessdata dienst/tools/tesseract/usr/bin/tesseract --version
  run "$VERAPDF" --version
  run "$JAVA" -jar "$EPUBCHECK" --version
  run nproc
  run sh -c "grep -m1 'model name' /proc/cpuinfo; grep MHz /proc/cpuinfo | head -4"
  run sha256sum "$OUT"/eingabe/*
  run cat "$OUT/eingabe/scan-parameter.json"
} > "$OUT/00-werkzeuge.txt"

# ------------------------------------------------------------------ Dienst starten
LOG="$(mktemp)"
(cd dienst && exec .venv/bin/python -m hpro_dienst serve --port 0) > "$LOG" 2>&1 &
DPID=$!
trap 'kill $DPID 2>/dev/null; wait $DPID 2>/dev/null; rm -f "$LOG"' EXIT
for _ in $(seq 1 600); do grep -q "bereit auf" "$LOG" && break; sleep 1; done
URL=$(grep -o 'http://[0-9.:]*' "$LOG" | head -1)
[ -n "$URL" ] || { echo "Dienst startet nicht:"; cat "$LOG"; exit 2; }
echo "Dienst: $URL (PID $DPID)"

# ------------------------------------------------------------------ 1 Export
{
  echo "# P9 Abnahme 1: Container → PDF über den Dienst (Kern-Adapter RemoteWeasyPrint → WeasyPrint → veraPDF im Dienst)"
  echo "# Danach unabhängige Gegenprüfung jedes PDF mit veraPDF auf der Kommandozeile (Berichte in verapdf/)."
  echo
  run $HPRO pdf status --dienst "$URL"
  for n in druck sperren lebendig beispiel kostenschaetzung antrag s7-buero; do
    timed $HPRO pdf export "$OUT/eingabe/$n.hpro" "$OUT/export/$n.pdf" --dienst "$URL" --conformance PDF/A-2a,PDF/UA-1 --json "$OUT/export/$n-bericht.json"
  done
  timed $HPRO pdf export "$OUT/eingabe/sperren.hpro" "$OUT/export/sperren-fassung.pdf" --dienst "$URL" --conformance PDF/A-2a,PDF/UA-1 --rendition nachweis-2026-10-12 --json "$OUT/export/sperren-fassung-bericht.json"
  timed $HPRO pdf export "$OUT/eingabe/druck.hpro" "$OUT/export/druck-hybrid.pdf" --dienst "$URL" --conformance PDF/A-3a,PDF/UA-1 --embed-container --json "$OUT/export/druck-hybrid-bericht.json"
  echo "## Gegenprobe: unzulässige Kombination wird abgelehnt (Exit 2)"
  run $HPRO pdf export "$OUT/eingabe/druck.hpro" /dev/null --dienst "$URL" --conformance PDF/A-2a,PDF/UA-2
} > "$OUT/01-export.txt"

{
  echo "# P9 Abnahme 1: unabhängige veraPDF-Prüfung der exportierten PDF (veraPDF 1.30.3, Kommandozeile)"
  echo
  for f in "$OUT"/export/*.pdf; do
    n=$(basename "$f" .pdf)
    flav_a=2a; [ "$n" = druck-hybrid ] && flav_a=3a
    for flav in $flav_a ua1; do
      echo "\$ verapdf --flavour $flav --format xml $f > $OUT/verapdf/$n-$flav.xml"
      "$VERAPDF" --flavour $flav --format xml --maxfailuresdisplayed 3 "$f" > "$OUT/verapdf/$n-$flav.xml" 2>&1
      echo "[Exit-Code $?]"
      $PY - "$OUT/verapdf/$n-$flav.xml" <<'EOF'
import sys
from lxml import etree
r = etree.parse(sys.argv[1]).getroot().find(".//validationReport")
d = r.find("details")
print(f"  {r.get('profileName')}: konform={r.get('isCompliant')}; Regeln bestanden {d.get('passedRules')}, verletzt {d.get('failedRules')}; Prüfungen bestanden {d.get('passedChecks')}, fehlgeschlagen {d.get('failedChecks')}")
for rule in r.iter("rule"):
    if rule.get("status") == "failed":
        print(f"    § {rule.get('clause')}-{rule.get('testNumber')} ({rule.get('failedChecks')}×): {rule.findtext('description')}")
EOF
      echo
    done
  done
} > "$OUT/02-verapdf.txt"

{
  echo "# P9 Export: Inhalt der PDF (pdfium-Text): Sperren, lebendige Elemente, Verzeichnis, Seitenmaß"
  echo
  run $PY scripts/p9-auswertung.py pdftext "$OUT/export/sperren.pdf" "492.000,00" "Abschnitt kalkulation nicht zum Export freigegeben" "Abschnitt intern ausgeblendet" "Versiegelter Abschnitt" "Seite 1 von"
  run $PY scripts/p9-auswertung.py pdftext "$OUT/export/sperren-fassung.pdf" "eingefrorene Fassung nachweis-2026-10-12" "Abschnitt kalkulation nicht zum Export freigegeben"
  run $PY scripts/p9-auswertung.py pdftext "$OUT/export/druck.pdf" "Lebendige Fassung: content/index.xhtml#zeitraffer-video" "Lebendige Fassung: content/index.xhtml#aufwand-diagramm" "Lebendige Fassung: content/index.xhtml#ablauf-abbildung" "Abschnitt preise-intern nicht zum Druck freigegeben" "#messprotokoll" "↩" "Seite 13 von 13"
  run $PY scripts/p9-auswertung.py pdftext "$OUT/export/lebendig.pdf" "Tonaufnahme" "Lebendige Fassung: content/index.xhtml#signal-ton"
  run $PY - "$OUT/export/druck-hybrid.pdf" <<'EOF'
import sys
from pypdf import PdfReader
r = PdfReader(sys.argv[1])
names = r.attachments
print("Anhänge:", {k: [len(x) for x in v] for k, v in names.items()})
af = r.trailer["/Root"].get("/AF")
print("Katalog /AF:", [o.get_object().get("/AFRelationship") for o in af] if af else None)
EOF
  run $PY -c "
import pypdfium2 as p
d = p.PdfDocument('$OUT/export/druck.pdf')
for i in (0, 1, 9, 10):
    d[i].render(scale=100/72).to_pil().save(f'$OUT/seiten/druck-{i+1:02d}.png')
d = p.PdfDocument('$OUT/export/sperren.pdf')
d[0].render(scale=100/72).to_pil().save('$OUT/seiten/sperren-01.png')
d = p.PdfDocument('$OUT/export/antrag.pdf')
d[1].render(scale=100/72).to_pil().save('$OUT/seiten/antrag-02.png')
d = p.PdfDocument('$OUT/export/s7-buero.pdf')
d[2].render(scale=100/72).to_pil().save('$OUT/seiten/s7-buero-03.png')
print('Seitenbilder (100 dpi) geschrieben')"
} > "$OUT/03-export-inhalt.txt"

# ------------------------------------------------------------------ 2 Import
{
  echo "# P9 Abnahme 2: PDF mit Text und Bild → Container (Docling im Dienst, XHTML aus dem Kern), epubcheck und hpro-check"
  echo
  for n in bericht bericht-getaggt; do
    timed $HPRO pdf import "$OUT/eingabe/$n.pdf" "$OUT/import/$n.hpro" --dienst "$URL" --modified $MOD --json "$OUT/import/$n-bericht.json"
    cp "$OUT/import/$n.hpro" "$OUT/import/$n.epub"
    run "$JAVA" -jar "$EPUBCHECK" "$OUT/import/$n.epub"
    rm -f "$OUT/import/$n.epub"
    run node kern/build/bin/hpro-check.js "$OUT/import/$n.hpro"
    run $HPRO inspect "$OUT/import/$n.hpro"
    run $PY scripts/p9-auswertung.py import "$OUT/eingabe/$n.pdf" "$OUT/import/$n.hpro"
    $PY -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); open(sys.argv[2],'wb').write(z.read('content/index.xhtml'))" "$OUT/import/$n.hpro" "$OUT/import/$n-index.xhtml"
  done
} > "$OUT/04-import.txt"

# ------------------------------------------------------------------ 3 OCR
{
  echo "# P9 Abnahme 3: gescanntes PDF → durchsuchbares PDF (Tesseract 5.5.0, deu), Qualität gegen die Grundwahrheit"
  echo "# Messgrößen: CER (Zeichenfehlerrate), WER (Wortfehlerrate), Suchtrefferquote (Anteil der verschiedenen"
  echo "# Wörter mit mindestens 4 Buchstaben, die eine Textsuche im PDF findet); vorher = Textebene vor der OCR."
  echo
  for s in 300 200 150 100; do
    timed $HPRO pdf ocr "$OUT/eingabe/scan-$s.pdf" "$OUT/ocr/scan-$s-durchsuchbar.pdf" --dienst "$URL" --languages de --json "$OUT/ocr/scan-$s-bericht.json"
    run $PY scripts/p9-auswertung.py ocr "$OUT/eingabe/scan-grundwahrheit.txt" "$OUT/eingabe/scan-$s.pdf" "$OUT/ocr/scan-$s-durchsuchbar.pdf"
  done
  echo "## Ein gescanntes PDF als Container (Import mit OCR), epubcheck, Suche im Container (hpro lock search: Exit 1 = Treffer)"
  timed $HPRO pdf import "$OUT/eingabe/scan-200.pdf" "$OUT/ocr/scan-200.hpro" --dienst "$URL" --languages de --modified $MOD --json "$OUT/ocr/scan-200-import.json"
  cp "$OUT/ocr/scan-200.hpro" "$OUT/ocr/scan-200.epub"
  run "$JAVA" -jar "$EPUBCHECK" "$OUT/ocr/scan-200.epub"
  rm -f "$OUT/ocr/scan-200.epub"
  run node kern/build/bin/hpro-check.js "$OUT/ocr/scan-200.hpro"
  printf 'Angebotssumme\nTondachziegeln\nGewährleistung\n' > "$OUT/ocr/suchbegriffe.txt"
  run $HPRO lock search "$OUT/ocr/scan-200.hpro" --terms-file "$OUT/ocr/suchbegriffe.txt"
  run $PY scripts/p9-auswertung.py import "$OUT/eingabe/scan-200.pdf" "$OUT/ocr/scan-200.hpro"
} > "$OUT/05-ocr.txt"

# ------------------------------------------------------------------ 4 Grenzen
{
  echo "# P9 Abnahme 4: Grenzen des Imports – Fälle, an denen die Umwandlung misslingt oder Information verliert"
  echo "# Je Fall: Import über den Dienst, Warnungen, Textabdeckung, erzeugtes XHTML unter grenzen/<fall>-index.xhtml"
  echo
  for n in grenze-zweispaltig grenze-tabelle grenze-formular grenze-silben grenze-diagramm grenze-ueberschriften; do
    timed $HPRO pdf import "$OUT/eingabe/$n.pdf" "$OUT/grenzen/$n.hpro" --dienst "$URL" --modified $MOD --json "$OUT/grenzen/$n-bericht.json"
    run $PY scripts/p9-auswertung.py import "$OUT/eingabe/$n.pdf" "$OUT/grenzen/$n.hpro"
    $PY -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); open(sys.argv[2],'wb').write(z.read('content/index.xhtml'))" "$OUT/grenzen/$n.hpro" "$OUT/grenzen/$n-index.xhtml"
  done
} > "$OUT/06-grenzen.txt"

kill $DPID; wait $DPID 2>/dev/null
{
  echo "# Protokoll des Dienstes (Anfragen; Inhalte werden nicht protokolliert)"
  cat "$LOG"
} > "$OUT/07-dienst-protokoll.txt"
echo "fertig: $OUT"
