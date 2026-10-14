#!/usr/bin/env bash
# Erzeugt die Belege für Paket S8 (Einbau in Fremdsoftware: SDK, Kommandozeile und Office-Export)
# unter docs/belege/S8/. Jede Datei enthält wörtliche Ausgaben mit Exit-Code.
#
#  00 Werkzeuge                              05 Paket: packen, in fremdes Projekt installieren, aufrufen (Abnahme 3)
#  01 Kommandozeile, Rückgabecodes (Abn. 1)  06 Fachanwendung und Python-Anbindung (Abnahme 4)
#  02 Office-Export in LibreOffice (Abn. 2)  07 EU DSS 6.5 als Gegenprobe der Signatur der Fachanwendung
#  03 Prüfung der Office-Exporte (Abn. 2)    08 PDF-Ausgabe lokal mit veraPDF
#  04 Darstellung in Chromium                09 Anleitung mechanisch geprüft (einbau:check, Abnahme 5)
#                                            10 npm ci && npm test (getrennt, siehe README.md dort)
#
# Voraussetzung: prototyp/setup-tools.sh (JDK 21, epubcheck 5.4.0, LibreOffice, DSS-Werkzeug),
# dienst/setup-dienst.sh (WeasyPrint, veraPDF), Playwright-Chromium unter app/.browsers, Node >= 22,
# Netz nur für den Zeitstempel (FreeTSA) in 06.
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/S8
C=$OUT/container
E=$OUT/eingabe
R=$OUT/berichte
P=$OUT/pdf
TMP=prototyp/out/s8
PROJ=einbau/.tmp/projekt
JAVA=$PWD/prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK=$PWD/prototyp/tools/epubcheck-5.4.0/epubcheck.jar
LO=prototyp/tools/libreoffice/opt/libreoffice26.8/program
POLICY=docs/belege/P3/policy-hpro.xml
rm -rf "$C" "$E" "$R" "$P" "$TMP" einbau/.tmp
mkdir -p "$C" "$E" "$R" "$P" "$TMP/epub" "$PROJ"
export TMPDIR="$PWD/$TMP"
export PLAYWRIGHT_BROWSERS_PATH="$PWD/app/.browsers"
# epubcheck für jeden `hpro check` (auch aus dem installierten Paket und aus LibreOffice heraus)
export HPRO_EPUBCHECK="$EPUBCHECK" HPRO_JAVA="$JAVA"

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
hpro() { node kern/build/bin/hpro.js "$@"; }
epub() { cp "$1" "$TMP/epub/$(basename "$1" .hpro).epub" && "$JAVA" -jar "$EPUBCHECK" "$TMP/epub/$(basename "$1" .hpro).epub"; }
dss() { "$JAVA" -Dorg.slf4j.simpleLogger.defaultLogLevel=warn -cp "prototyp/dss/target/classes:prototyp/dss/target/lib/*" example.hpro.HproDss "$@"; }
ms() { date +%s%N | cut -b1-13; }

npm run -s build -w kern || exit 2
npm run -s build:test -w kern || exit 2

# ------------------------------------------------------------------ 00 Werkzeuge
{
  echo "# S8 Werkzeuge"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  run node --version
  run npm --version
  run "$JAVA" -version
  run "$JAVA" -jar "$EPUBCHECK" --version
  run dienst/.venv/bin/python -c "import weasyprint; print('WeasyPrint', weasyprint.__version__)"
  run ls prototyp/tools/verapdf-1.30.3
  echo "LibreOffice: Version meldet das Office selbst über UNO, siehe 02-office-export.txt (Zeile „Office:“)."
  echo "DSS-Version laut Maven-Abhängigkeiten:"
  ls prototyp/dss/target/lib | grep -E '^dss-(xades|asic-xades|validation)-[0-9]'
  run python3 --version
  run cat /sys/fs/cgroup/memory.max
} > "$OUT/00-werkzeuge.txt" 2>&1

# ------------------------------------------------------------------ 05 Paket (zuerst: das installierte Paket nutzen 02 und 06)
{
  echo "# S8 Abnahme 3: die Bibliothek als Paket – packen, in ein fremdes Projekt installieren, Version, Beispielaufruf"
  echo "# Das fremde Projekt liegt unter $PROJ (eigene package.json, eigenes node_modules, nicht Teil des Workspace)."
  echo
  echo "## Packen (prepack: kern/scripts/prepare-package.mjs baut dist/, cli/ und spec/)"
  (cd kern && npm pack --pack-destination "../einbau/.tmp" > "../$TMP/pack.log" 2>&1; echo "[Exit-Code $?]")
  grep -E "Tarball Details|name:|version:|filename:|package size|unpacked size|total files|spec/|cli/bin/hpro.js|dist/index.js$|dist/index.d.ts|package.json" "$TMP/pack.log" | sed 's/^npm notice //'
  echo
  echo "## Installieren in ein fremdes Projekt"
  printf '{\n  "name": "fremdes-projekt",\n  "version": "1.0.0",\n  "private": true,\n  "type": "module"\n}\n' > "$PROJ/package.json"
  (cd "$PROJ" && run npm install ../hpro-kern-0.1.0.tgz --prefer-offline --no-audit --no-fund)
  (cd "$PROJ" && run npm ls --all)
  run cat "$PROJ/package.json"
  run ls "$PROJ/node_modules/.bin" "$PROJ/node_modules/@hpro/kern"
  echo "## Version: Kommandozeile und Bibliothek"
  (cd "$PROJ" && run npx hpro version)
  (cd "$PROJ" && run npx hpro version --json)
  (cd "$PROJ" && run node -e "import('@hpro/kern').then((k) => console.log('KERN_VERSION', k.KERN_VERSION, '· SPEC_VERSION', k.SPEC_VERSION, '· CLI_INTERFACE_VERSION', k.CLI_INTERFACE_VERSION, '·', Object.keys(k).length, 'Exporte'))")
  (cd "$PROJ" && run node -e "console.log(import.meta.resolve('@hpro/kern/spec/01-regelkatalog.json'))" --input-type=module)
  echo "## Beispielaufruf der Bibliothek (einbau/bibliothek/beispiel.mjs, unverändert kopiert)"
  cp einbau/bibliothek/beispiel.mjs "$PROJ/"
  (cd "$PROJ" && run node beispiel.mjs aktennotiz.hpro)
  echo "## Dieselbe Datei mit der Kommandozeile des Pakets geprüft (epubcheck über HPRO_EPUBCHECK/HPRO_JAVA)"
  (cd "$PROJ" && run npx hpro check aktennotiz.hpro --json aktennotiz.pruefung.json)
  cp "$PROJ/aktennotiz.hpro" "$C/"
  cp "$PROJ/aktennotiz.pruefung.json" "$R/"
  run ls -l einbau/.tmp/hpro-kern-0.1.0.tgz
  run sha256sum einbau/.tmp/hpro-kern-0.1.0.tgz
} > "$OUT/05-paket.txt" 2>&1
PKG_CLI="node $PWD/$PROJ/node_modules/@hpro/kern/cli/bin/hpro.js"

# ------------------------------------------------------------------ 01 Kommandozeile
{
  echo "# S8 Abnahme 1: stabile Befehle (erzeugen, prüfen, signieren, nach PDF ausgeben) und Rückgabecodes"
  echo "# Rückgabe: 0 erfolgreich, 1 Ergebnis negativ, 2 Aufruf- oder Eingabefehler, 3 unbestimmt (check), 4 Hilfsmittel fehlt"
  echo
  run hpro help
  run hpro version
  echo "## erzeugen: hpro create (Markdown, ODF, Word, Tabelle)"
  run hpro create einbau/fachanwendung/daten/legionellen-2026-10.csv "$TMP/x.hpro"
  run hpro create docs/belege/S5/eingabe/referenz.md "$C/cli-markdown.hpro" --vorlage bericht --modified 2026-10-14T12:00:00Z --json "$R/cli-markdown.create.json"
  run hpro create docs/spezifikation/beispiele/s7-buero/angebot.fodt "$C/cli-odf.hpro" --modified 2026-10-14T12:00:00Z
  run hpro create docs/belege/S5/eingabe/referenz.docx "$C/cli-word.hpro" --modified 2026-10-14T12:00:00Z
  run hpro create kern/test/fixtures/p19-quelle.ods "$C/cli-tabelle.hpro" --modified 2026-10-14T12:00:00Z --titel "Tabellenimport"
  run hpro create docs/belege/S5/eingabe/angebot-unvollstaendig.md "$TMP/unvollstaendig.hpro" --vorlage angebot
  run hpro create docs/belege/S5/eingabe/referenz.md "$TMP/x.hpro" --titel "gilt nur für Tabellen"
  env -u HPRO_DIENST node kern/build/bin/hpro.js create docs/belege/S5/eingabe/referenz.pdf "$TMP/x.hpro" > "$TMP/pdf-ohne-dienst.txt" 2>&1; code=$?
  echo "\$ hpro create docs/belege/S5/eingabe/referenz.pdf $TMP/x.hpro   (ohne HPRO_DIENST)"; cat "$TMP/pdf-ohne-dienst.txt"; echo "[Exit-Code $code]"; echo
  echo "## prüfen: hpro check (ohne Browser-Engine bleibt die Stufe „unbestimmt“, Rückgabe 3)"
  run hpro check "$C/cli-odf.hpro"
  printf 'kein Container' > "$TMP/kaputt.hpro"
  run hpro check "$TMP/kaputt.hpro" --no-epubcheck
  run hpro check
  echo "## signieren: hpro sign (Testschlüssel aus hpro keygen) und hpro validate"
  run hpro keygen "$TMP/key.pem" "$TMP/cert.pem" --alg ec --cn "S8 Beleg (TEST)"
  run hpro sign "$C/cli-odf.hpro" "$C/cli-odf-signiert.hpro" --key "$TMP/key.pem" --cert "$TMP/cert.pem" --json "$R/cli-sign.json"
  run cat "$R/cli-sign.json"
  run hpro validate "$C/cli-odf-signiert.hpro" --trust "$TMP/cert.pem"
  run hpro sign "$C/cli-odf.hpro" "$TMP/x.hpro" --cert "$TMP/cert.pem"
  echo "## nach PDF ausgeben: hpro pdf export (lokal, ohne Netzdienst; WeasyPrint + veraPDF)"
  run hpro pdf export "$C/cli-odf.hpro" "$P/cli-odf.pdf" --lokal --json "$R/cli-pdf.json"
  run hpro pdf export "$C/cli-odf.hpro" "$TMP/x.pdf" --dienst http://127.0.0.1:47999
  HPRO_DIENST_DIR="$TMP/kein-dienst" node kern/build/bin/hpro.js pdf export "$C/cli-odf.hpro" "$TMP/x.pdf" --lokal > "$TMP/lokal-fehlt.txt" 2>&1; code=$?
  echo "\$ HPRO_DIENST_DIR=$TMP/kein-dienst hpro pdf export $C/cli-odf.hpro $TMP/x.pdf --lokal"; cat "$TMP/lokal-fehlt.txt"; echo "[Exit-Code $code]"; echo
  echo "## Vertragstest der Kommandozeile (kern/test/cli.test.ts)"
  run node --test kern/build/test/cli.test.js
} > "$OUT/01-kommandozeile.txt" 2>&1

# ------------------------------------------------------------------ 02 Office-Export
{
  echo "# S8 Abnahme 2: Office-Exportweg – LibreOffice-Erweiterung „Als hpro exportieren“"
  echo "# einbau/libreoffice/pruefen.py: Erweiterung packen und installieren, LibreOffice ohne Oberfläche starten,"
  echo "# Writer- und Calc-Dokument über die Office-API aufbauen, Menübefehl der Erweiterung auslösen."
  echo "# Die Erweiterung ruft die Kommandozeile des installierten Pakets auf (HPRO_CLI, siehe 05)."
  echo
  t0=$(ms)
  run timeout 1200 "$LO/python" einbau/libreoffice/pruefen.py "$TMP/lo" "$PKG_CLI"
  echo "Dauer gesamt: $(( $(ms) - t0 )) ms"
  run pgrep -af soffice.bin
} > "$OUT/02-office-export.txt" 2>&1
cp "$TMP/lo/pruefbericht.odt" "$TMP/lo/pruefbericht.docx" "$TMP/lo/kostenschaetzung.ods" "$TMP/lo/befunde.png" "$TMP/lo/hpro-export.oxt" "$E/"
cp "$TMP/lo/pruefbericht.hpro" "$TMP/lo/kostenschaetzung.hpro" "$C/"
cp "$TMP/lo/export-ergebnisse.json" "$R/office-export-ergebnisse.json"

# ------------------------------------------------------------------ 03 Prüfung der Office-Exporte
{
  echo "# S8 Abnahme 2: die Office-Exporte bestehen den Konformitätsprüfer (mit epubcheck) und epubcheck"
  echo
  for f in pruefbericht kostenschaetzung; do
    run hpro check "$C/$f.hpro" --json "$R/$f.pruefung.json"
    run epub "$C/$f.hpro"
    run hpro inspect "$C/$f.hpro"
  done
  echo "## Dieselben Office-Dateien ohne Erweiterung: hpro create aus den vom Nutzer gespeicherten Dateien"
  run hpro create "$E/pruefbericht.docx" "$C/pruefbericht-aus-word.hpro" --modified 2026-10-14T12:00:00Z
  run hpro check "$C/pruefbericht-aus-word.hpro"
  run hpro create "$E/pruefbericht.odt" "$C/pruefbericht-aus-odt.hpro" --modified 2026-10-14T12:00:00Z
  run hpro check "$C/pruefbericht-aus-odt.hpro"
  echo "## Zwei Läufe aus derselben Datei sind byte-gleich (HP-CONT-014)"
  run hpro create "$E/pruefbericht.odt" "$TMP/pruefbericht-2.hpro" --modified 2026-10-14T12:00:00Z
  run cmp "$C/pruefbericht-aus-odt.hpro" "$TMP/pruefbericht-2.hpro"
  echo "## Tabelle: Formeln im Dokument nachgerechnet (hpro calc check)"
  run hpro calc check "$C/kostenschaetzung.hpro"
  echo "## Unit-Tests des ODF-Lesers (kern/test/odf.test.ts)"
  run node --test kern/build/test/odf.test.js
} > "$OUT/03-office-pruefung.txt" 2>&1

# ------------------------------------------------------------------ 06 Fachanwendung
{
  echo "# S8 Abnahme 4: Fachanwendung – Prüfbericht Trinkwasserhygiene aus Messdaten (einbau/fachanwendung/bericht.mjs)"
  echo
  echo "## Im fremden Projekt gegen das installierte Paket (ganzes Dokument signiert, B: ohne Zeitstempel, Testidentität)"
  cp -r einbau/fachanwendung/bericht.mjs einbau/fachanwendung/daten "$PROJ/"
  (cd "$PROJ" && run node bericht.mjs daten/legionellen-2026-10.csv wasser-bericht.hpro --zeit 2026-10-07T10:00:00Z)
  cp "$PROJ/wasser-bericht.hpro" "$PROJ/wasser-bericht.zertifikat.pem" "$C/"
  echo "## Im Repository mit Zeitstempel (XAdES-BASELINE-T, FreeTSA; einziger Netzzugriff)"
  (cd einbau/fachanwendung && run node bericht.mjs daten/legionellen-2026-10.csv "../../$C/wasser-bericht-bt.hpro" --zeit 2026-10-07T10:00:00Z --tsa https://freetsa.org/tsr)
  echo "## Variante: Dokument bleibt bearbeitbar, signiert wird eine eingefrorene Fassung (--eingefroren)"
  (cd einbau/fachanwendung && run node bericht.mjs daten/legionellen-2026-10.csv "../../$C/wasser-bericht-fassung.hpro" --zeit 2026-10-07T10:00:00Z --eingefroren)
  echo "## Prüfung mit der Kommandozeile (Vertrauensanker = Zertifikat der Anwendung, epubcheck)"
  run hpro check "$C/wasser-bericht.hpro" --trust "$C/wasser-bericht.zertifikat.pem" --time 2026-10-07T10:00:00Z --json "$R/wasser-bericht.pruefung.json"
  run hpro check "$C/wasser-bericht-bt.hpro" --trust "$C/wasser-bericht-bt.zertifikat.pem" --json "$R/wasser-bericht-bt.pruefung.json"
  run epub "$C/wasser-bericht.hpro"
  run epub "$C/wasser-bericht-bt.hpro"
  run hpro validate "$C/wasser-bericht.hpro" --trust "$C/wasser-bericht.zertifikat.pem" --time 2026-10-07T10:00:00Z
  run hpro calc show "$C/wasser-bericht.hpro"
  echo "## Variante eingefrorene Fassung: Signatur der Fassung, epubcheck meldet RSC-011 (bekannt, Änderungsantrag HPC-0003)"
  run hpro lock frozen-check "$C/wasser-bericht-fassung.hpro" --id nachweis --trust "$C/wasser-bericht-fassung.zertifikat.pem" --time 2026-10-07T10:00:00Z
  run hpro check "$C/wasser-bericht-fassung.hpro" --trust "$C/wasser-bericht-fassung.zertifikat.pem" --time 2026-10-07T10:00:00Z --no-not-checked
  echo "## Manipulation nach dem Signieren wird erkannt (Zusage 5)"
  run node scripts/s8-manipulieren.mjs "$C/wasser-bericht.hpro" "$TMP/wasser-manipuliert.hpro"
  run hpro validate "$TMP/wasser-manipuliert.hpro" --trust "$C/wasser-bericht.zertifikat.pem" --time 2026-10-07T10:00:00Z
  echo "## Andere Sprache über die Kommandozeile: Python (einbau/python/hpro_bericht.py)"
  run env HPRO_CLI="$PKG_CLI" python3 einbau/python/hpro_bericht.py einbau/fachanwendung/daten/legionellen-2026-10.csv "$C/kurzbericht-python.hpro"
} > "$OUT/06-fachanwendung.txt" 2>&1

# ------------------------------------------------------------------ 07 DSS
{
  echo "# S8 EU DSS 6.5 als unabhängige Gegenprobe der Signatur der Fachanwendung"
  echo "# (Richtlinie docs/belege/P3/policy-hpro.xml: application/epub+zip zulässig)"
  echo
  run dss validate "$C/wasser-bericht.hpro" "$C/wasser-bericht.zertifikat.pem" "$POLICY"
  run dss validate "$C/cli-odf-signiert.hpro" "$TMP/cert.pem" "$POLICY"
  run dss validate "$TMP/wasser-manipuliert.hpro" "$C/wasser-bericht.zertifikat.pem" "$POLICY"
} > "$OUT/07-dss.txt" 2>&1
cp "$TMP/cert.pem" "$C/cli-odf-signiert.zertifikat.pem"

# ------------------------------------------------------------------ 08 PDF
{
  echo "# S8 nach PDF ausgeben: hpro pdf export --lokal (Dienst als Kindprozess, kein Port) mit veraPDF-Prüfung"
  echo
  for f in pruefbericht wasser-bericht; do
    t0=$(ms)
    run hpro pdf export "$C/$f.hpro" "$P/$f.pdf" --lokal --json "$R/$f.pdf.json"
    echo "Dauer: $(( $(ms) - t0 )) ms"; echo
  done
  run dienst/.venv/bin/python -c "
import sys
from pypdf import PdfReader
for f in sys.argv[1:]:
    r = PdfReader(f)
    t = ' '.join((p.extract_text() or '') for p in r.pages)
    print(f, '·', len(r.pages), 'Seiten · Titel:', r.metadata.title if r.metadata else None, '· enthält „Befunde je Geschoß“:', 'Befunde je Geschoß' in t, '· „Maßnahme“:', 'Maßnahme' in t)
" "$P/pruefbericht.pdf" "$P/wasser-bericht.pdf"
} > "$OUT/08-pdf.txt" 2>&1

# ------------------------------------------------------------------ 04 Darstellung
{
  echo "# S8 Gegenprobe der Rendering-Regeln (HPR-INH-004, -006, -022), die hpro check ohne Browser als „nicht geprüft“ führt"
  echo "# scripts/s5-darstellung.mjs in Chromium (Playwright der Reader-App)"
  echo
  run node scripts/s5-darstellung.mjs "$TMP/darstellung" pruefbericht="$C/pruefbericht.hpro" kostenschaetzung="$C/kostenschaetzung.hpro" wasser-bericht="$C/wasser-bericht.hpro" aktennotiz="$C/aktennotiz.hpro" kurzbericht-python="$C/kurzbericht-python.hpro"
} > "$OUT/04-darstellung.txt" 2>&1

# ------------------------------------------------------------------ 09 Anleitung
{
  echo "# S8 Abnahme 5: docs/spezifikation/06-einbau.md mechanisch geprüft"
  run node scripts/check-einbau.mjs
  run node scripts/check-einbau-selftest.mjs
} > "$OUT/09-einbau-check.txt" 2>&1

pgrep -af 'hpro_dienst|soffice' | grep -v pgrep && echo "WARNUNG: Prozesse laufen noch"
ls -l "$OUT" "$C" "$E" "$R" "$P"
