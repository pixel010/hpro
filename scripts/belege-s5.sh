#!/usr/bin/env bash
# Erzeugt die Belege für Paket S5 (Autorenweg: Dokumente erstellen und migrieren) unter docs/belege/S5/.
# Jede Datei enthält wörtliche Ausgaben mit Exit-Code.
#
#  00 Werkzeuge und Eingaben          05 Verlustmessung gegen die Grundwahrheit (Abnahme 3)
#  01 Eingaben erzeugen (LibreOffice) 06 Grenzfälle des Word-Imports (Abnahme 3)
#  02 Markdown mit Vorlage (Abn. 1)   07 Darstellung in Chromium (Gegenprobe der Rendering-Regeln)
#  03 Word-Import (Abnahme 2)         08 Laufzeiten und Größen
#  04 PDF-Import (Abnahme 2)          09 npm ci && npm test
#
# Voraussetzung: prototyp/setup-tools.sh (JDK 21, epubcheck 5.4.0, LibreOffice unter prototyp/tools/libreoffice),
# dienst/setup-dienst.sh (venv mit Docling, python-docx, Pillow), Playwright-Chromium unter app/.browsers, Node >= 22.
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/S5
E=$OUT/eingabe
C=$OUT/container
R=$OUT/berichte
TMP=prototyp/out/s5
B=docs/spezifikation/beispiele/s5-vorlagen
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
LO=prototyp/tools/libreoffice/opt/libreoffice26.8/program
PY=dienst/.venv/bin/python
mkdir -p "$E" "$C" "$R" "$TMP/zweiter-lauf" "$TMP/epub"
export TMPDIR="$PWD/$TMP"
export PLAYWRIGHT_BROWSERS_PATH="$PWD/app/.browsers"

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
hpro() { node kern/build/bin/hpro.js "$@"; }
check() { node kern/build/bin/hpro-check.js "$@"; }
# LibreOffice ohne oosplash (dem fehlt hier libXinerama): soffice.bin direkt, eigenes Profil.
lo() { SAL_USE_VCLPLUGIN=svp timeout 300 "$LO/soffice.bin" --headless --norestore --nologo "-env:UserInstallation=file://$PWD/$TMP/lo-profile" "$@"; }
# epubcheck prüft nur Dateien mit Endung .epub: dieselben Bytes unter .epub (docs/05, V7).
epub() { cp "$1" "$TMP/epub/$(basename "$1" .hpro).epub" && "$JAVA" -jar "$EPUBCHECK" "$TMP/epub/$(basename "$1" .hpro).epub"; }
ms() { date +%s%N | cut -b1-13; }
timed() { local t0; t0=$(ms); run "$@"; echo "Dauer: $(( $(ms) - t0 )) ms"; echo; }

npm run -s build -w kern || exit 2
npm run -s build:test -w kern || exit 2

# ------------------------------------------------------------------ 01 Eingaben
{
  echo "# S5 Eingaben: Referenzbericht (ODF), Markdown-Fassung, Grundwahrheit, Grenzfall-Word-Dokument"
  echo "# scripts/s5-quellen.py schreibt die Quellen; LibreOffice 26.8 wandelt referenz.fodt nach Word (MS Word 2007 XML)"
  echo "# und nach getaggtem PDF. Erster Aufruf legt das LibreOffice-Profil an und wird deshalb wiederholt."
  echo
  run "$PY" scripts/s5-quellen.py "$E"
  rm -f "$E/referenz.docx" "$E/referenz.pdf"
  for i in 1 2; do
    [ -s "$E/referenz.docx" ] || run lo --convert-to 'docx:MS Word 2007 XML' --outdir "$E" "$E/referenz.fodt"
    [ -s "$E/referenz.pdf" ] || run lo --convert-to 'pdf:writer_pdf_Export:{"UseTaggedPDF":{"type":"boolean","value":"true"}}' --outdir "$E" "$E/referenz.fodt"
  done
  run ls -l "$E" "$E/bilder"
  echo "## Aufbau des Word-Dokuments aus LibreOffice (Teile, Vorlagen der Absätze, Felder)"
  run "$PY" - "$E/referenz.docx" <<'EOF'
import re, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
for i in z.infolist(): print(f"{i.file_size:7}  {i.filename}")
d = z.read('word/document.xml').decode()
print('Absatzvorlagen:', sorted(set(re.findall(r'<w:pStyle w:val="([^"]+)"', d))))
print('Felder:', re.findall(r'<w:instrText[^>]*>([^<]+)<', d))
print('Bilder (docPr):', re.findall(r'<wp:docPr [^>]*name="([^"]+)"(?: title="[^"]*")?(?: descr="([^"]*)")?', d))
print('adec:decorative im Dokument:', 'decorative' in d)
EOF
  echo "## Aufbau des PDF aus LibreOffice (pypdf)"
  run "$PY" - "$E/referenz.pdf" <<'EOF'
import sys
from pypdf import PdfReader
r = PdfReader(sys.argv[1])
root = r.trailer['/Root']
print('Seiten:', len(r.pages), '· getaggt (/MarkInfo /Marked):', root.get('/MarkInfo', {}).get('/Marked'), '· /StructTreeRoot:', '/StructTreeRoot' in root, '· /Lang:', root.get('/Lang'))
print('Titel:', r.metadata.title if r.metadata else None)
EOF
} > "$OUT/01-eingaben.txt"

{
  echo "# S5 Werkzeuge und Eingaben"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  run node --version
  run "$PY" --version
  run "$PY" -c "from importlib.metadata import version as v; [print(p, v(p)) for p in ('python-docx','pillow','pypdf','docling','docling-core')]"
  run "$JAVA" -jar "$EPUBCHECK" --version
  run sh -c "'$LO/soffice.bin' --version 2>/dev/null || true"
  run sh -c "grep -m1 'model name' /proc/cpuinfo; cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq; nproc"
  run sh -c "cd '$E' && sha256sum *.* bilder/*"
  run sh -c "sha256sum $B/*.md $B/protokoll/*"
} > "$OUT/00-werkzeuge.txt"

# ------------------------------------------------------------------ 02 Markdown mit Vorlage (Abnahme 1)
{
  echo "# S5 Abnahme 1: Aus einer Markdown-Quelle mit Vorlage entsteht ein konformes Dokument"
  echo "# Prüfung mit dem Konformitätsprüfer aus S3 (hpro-check, mit epubcheck 5.4.0 eingebunden), JSON-Berichte in berichte/"
  echo
  run hpro author vorlagen
  rm -f "$TMP/neu-bericht.md"
  run hpro author neu "$TMP/neu-bericht.md" --vorlage bericht --heute 2026-10-13
  run sed -n 1,12p "$TMP/neu-bericht.md"
  echo "## Referenzbericht mit Vorlage „bericht“ (Überblick, Kopf aus den Feldern, drei Bilder, zwei Tabellen, drei Fußnoten)"
  timed hpro author md "$E/referenz.md" "$C/md-bericht.hpro" --json "$R/md-bericht-import.json"
  timed check "$C/md-bericht.hpro" --json "$R/md-bericht-pruefung.json"
  run epub "$C/md-bericht.hpro"
  echo "## Vorlage „brief“"
  run hpro author md "$B/brief.md" "$C/md-brief.hpro" --json "$R/md-brief-import.json"
  run check "$C/md-brief.hpro" --json "$R/md-brief-pruefung.json"
  run epub "$C/md-brief.hpro"
  echo "## Vorlage „angebot“"
  run hpro author md "$B/angebot.md" "$C/md-angebot.hpro" --json "$R/md-angebot-import.json"
  run check "$C/md-angebot.hpro" --json "$R/md-angebot-pruefung.json"
  run epub "$C/md-angebot.hpro"
  echo "## Eigene Vorlage aus einer Datei (protokoll/vorlage.json + stil.css)"
  run hpro author md "$B/protokoll.md" "$C/md-protokoll.hpro" --vorlage "$B/protokoll" --json "$R/md-protokoll-import.json"
  run check "$C/md-protokoll.hpro" --json "$R/md-protokoll-pruefung.json"
  run epub "$C/md-protokoll.hpro"
  echo "## Gegenprobe: Quelle erfüllt die Vorlage nicht → nichts geschrieben (Exit 1)"
  rm -f "$TMP/unvollstaendig.hpro"
  run hpro author md "$E/angebot-unvollstaendig.md" "$TMP/unvollstaendig.hpro"
  run test -e "$TMP/unvollstaendig.hpro"
  echo "## Zwei Läufe ergeben dieselben Bytes (HP-CONT-014)"
  hpro author md "$E/referenz.md" "$TMP/zweiter-lauf/md-bericht.hpro" > /dev/null
  run cmp "$C/md-bericht.hpro" "$TMP/zweiter-lauf/md-bericht.hpro"
  echo "## Inhalt: Manifest und Inhaltsdokument des Berichts"
  run python3 -c 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(z.read("manifest.json").decode()); print(z.read("content/index.xhtml").decode())' "$C/md-bericht.hpro"
} > "$OUT/02-markdown-vorlage.txt"

# ------------------------------------------------------------------ 03 Word-Import (Abnahme 2)
{
  echo "# S5 Abnahme 2 (Word): Import aus Word besteht epubcheck und den Konformitätsprüfer"
  echo
  echo "## Referenzbericht, Word-Datei aus LibreOffice 26.8, Vorlage „frei“ (Mindestprofil)"
  timed hpro author docx "$E/referenz.docx" "$C/docx-referenz.hpro" --json "$R/docx-referenz-import.json"
  timed check "$C/docx-referenz.hpro" --json "$R/docx-referenz-pruefung.json"
  run epub "$C/docx-referenz.hpro"
  echo "## Derselbe Bericht mit Vorlage „bericht“ (Abschnitt „Zusammenfassung“ wird Überblick; Verfasser fehlt in den Dokumenteigenschaften → per --feld)"
  run hpro author docx "$E/referenz.docx" "$TMP/docx-bericht-ohne-feld.hpro" --vorlage bericht
  run hpro author docx "$E/referenz.docx" "$C/docx-bericht.hpro" --vorlage bericht --feld "autoren=Büro Beispiel Bautechnik" --json "$R/docx-bericht-import.json"
  run check "$C/docx-bericht.hpro" --json "$R/docx-bericht-pruefung.json"
  run epub "$C/docx-bericht.hpro"
  echo "## Grenzfälle aus der Normalvorlage von Word (python-docx): BMP-Bild stoppt den Import (HP-MIN-007)"
  run hpro author docx "$E/grenzfall.docx" "$TMP/grenzfall-abbruch.hpro"
  echo "## Grenzfälle mit --bild-auslassen"
  timed hpro author docx "$E/grenzfall.docx" "$C/docx-grenzfall.hpro" --bild-auslassen --json "$R/docx-grenzfall-import.json"
  run check "$C/docx-grenzfall.hpro" --json "$R/docx-grenzfall-pruefung.json"
  run epub "$C/docx-grenzfall.hpro"
  echo "## Zwei Läufe ergeben dieselben Bytes"
  hpro author docx "$E/referenz.docx" "$TMP/zweiter-lauf/docx-referenz.hpro" > /dev/null
  run cmp "$C/docx-referenz.hpro" "$TMP/zweiter-lauf/docx-referenz.hpro"
  echo "## Inhalt: Inhaltsdokument des Referenzimports"
  run python3 -c 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(z.read("content/index.xhtml").decode())' "$C/docx-referenz.hpro"
  echo "## Inhalt: Inhaltsdokument des Grenzfalls"
  run python3 -c 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(z.read("content/index.xhtml").decode())' "$C/docx-grenzfall.hpro"
} > "$OUT/03-word.txt"

# ------------------------------------------------------------------ 04 PDF-Import (Abnahme 2)
LOG="$TMP/dienst.log"
(cd dienst && exec .venv/bin/python -m hpro_dienst serve --port 0) > "$LOG" 2>&1 &
DPID=$!
trap 'kill $DPID 2>/dev/null; wait $DPID 2>/dev/null' EXIT
for _ in $(seq 1 600); do grep -q "bereit auf" "$LOG" && break; sleep 1; done
URL=$(grep -o 'http://[0-9.:]*' "$LOG" | head -1)
{
  echo "# S5 Abnahme 2 (PDF): Import aus PDF besteht epubcheck und den Konformitätsprüfer"
  echo "# Weg: hpro author pdf → hpro pdf import (P9) → Dienst mit Docling auf 127.0.0.1, nur für die Dauer dieses Laufs"
  echo
  [ -n "$URL" ] || { echo "Dienst startet nicht:"; cat "$LOG"; }
  timed hpro author pdf "$E/referenz.pdf" "$C/pdf-referenz.hpro" --dienst "$URL" --modified 2026-10-13T08:00:00Z --json "$R/pdf-referenz-import.json"
  run check "$C/pdf-referenz.hpro" --json "$R/pdf-referenz-pruefung.json"
  run epub "$C/pdf-referenz.hpro"
  echo "## Inhalt: Inhaltsdokument des PDF-Imports"
  run python3 -c 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(z.read("content/index.xhtml").decode())' "$C/pdf-referenz.hpro"
} > "$OUT/04-pdf.txt"
kill $DPID 2>/dev/null; wait $DPID 2>/dev/null
trap - EXIT

# ------------------------------------------------------------------ 05/06 Verlustmessung (Abnahme 3)
{
  echo "# S5 Abnahme 3: Verluste beim Import, gemessen gegen die Grundwahrheit (eingabe/erwartet.json)"
  echo "# Wege: Markdown (Vorlage bericht), Word aus LibreOffice, PDF aus LibreOffice über Docling, und als Vergleich"
  echo "# der ODF-Referenzkonverter aus S7 (scripts/s7-fodt2hpro.mjs) auf die ODF-Quelle selbst."
  echo
  run node scripts/s7-fodt2hpro.mjs "$E/referenz.fodt" "$C/odf-s7-referenz.hpro"
  run node scripts/s5-messung.mjs "$E/erwartet.json" "$E/bilder" markdown="$C/md-bericht.hpro" word="$C/docx-referenz.hpro" pdf="$C/pdf-referenz.hpro" odf-s7="$C/odf-s7-referenz.hpro" --json "$OUT/05-messung.json"
} > "$OUT/05-messung.txt"
{
  echo "# S5 Abnahme 3: Grenzfälle des Word-Imports (eingabe/grenzfall.docx, Erwartung in eingabe/grenzfall-erwartet.json)"
  echo
  run node scripts/s5-messung.mjs --grenzfall "$E/grenzfall-erwartet.json" "$C/docx-grenzfall.hpro" "$R/docx-grenzfall-import.json" --json "$OUT/06-grenzfaelle.json"
  echo "## Meldungen des Imports (aus berichte/docx-grenzfall-import.json)"
  run node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); for (const m of r.meldungen) console.log(`${m.severity.toUpperCase()} ${m.code} [${m.category}]${m.count>1?` (${m.count}×)`:""}: ${m.text}`)' "$R/docx-grenzfall-import.json"
} > "$OUT/06-grenzfaelle.txt"

# ------------------------------------------------------------------ 07 Darstellung
{
  echo "# S5 Gegenprobe der Rendering-Regeln (HPR-INH-004/006/022), die hpro-check ohne Browser als „nicht geprüft“ führt"
  echo
  run node scripts/s5-darstellung.mjs "$TMP/darstellung" md-bericht="$C/md-bericht.hpro" md-brief="$C/md-brief.hpro" md-angebot="$C/md-angebot.hpro" md-protokoll="$C/md-protokoll.hpro" docx-referenz="$C/docx-referenz.hpro" docx-grenzfall="$C/docx-grenzfall.hpro" pdf-referenz="$C/pdf-referenz.hpro"
} > "$OUT/07-darstellung.txt"

# ------------------------------------------------------------------ 08 Laufzeiten und Größen
{
  echo "# S5 Laufzeiten (je 5 Läufe, ms, Node-Start eingeschlossen) und Größen"
  echo
  for f in "md $E/referenz.md" "docx $E/referenz.docx" "docx $E/grenzfall.docx --bild-auslassen"; do
    set -- $f
    line=""
    for i in 1 2 3 4 5; do t0=$(ms); hpro author "$@" "$TMP/laufzeit.hpro" > /dev/null 2>&1; line="$line $(( $(ms) - t0 ))"; done
    echo "hpro author $*:$line"
  done
  echo
  run sh -c "uptime"
  run sh -c "ls -l $C"
} > "$OUT/08-laufzeiten.txt"

# ------------------------------------------------------------------ 09 npm test
pgrep -af 'hpro_dienst|soffice' | grep -v pgrep && echo "WARNUNG: Prozesse laufen noch"
{
  echo "# S5: npm ci && npm test über das ganze Repository"
  echo
  run npm ci --no-audit --no-fund
  t0=$(ms)
  run npm test --if-present
  echo "Dauer: $(( $(ms) - t0 )) ms"
} > "$OUT/09-npm-test.txt" 2>&1
echo "fertig: $OUT"
