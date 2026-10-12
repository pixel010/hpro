#!/usr/bin/env bash
# Erzeugt die Belege für Paket P6 (Formulare mit Berechnung, Bedingung und Validierung) unter
# docs/belege/P6/.
#
#  00 Werkzeuge und Versionen
#  01 Abnahme 1: Kern-Tests kern/test/form.test.ts (Berechnung, Bedingung, Validierungsfehler)
#  02 Abnahme 2 und 3 über die Kommandozeile: Beispielformular als Container, Entwurf mit Fehlern,
#     Absenden abgelehnt (keine Datei), Absenden nach Korrektur, Datenexport
#  03 Abnahme 3: Datenexport schemageprüft – Kern und python-jsonschema über 13 Fälle; Export bei
#     unbrauchbarem Schema abgelehnt
#  04 Gegenprobe der Berechnung, Bedingungen und Prüfregeln in LibreOffice (benannte Bereiche)
#  05 epubcheck 5.4.0 über alle Container
#  06 hpro-check (Konformitätsprüfer) über alle Container
#  07 Eingefrorene, signierte Fassung des abgesendeten Antrags: EU DSS 6.5, Manipulation
#  08 Reader: vitest (app/test/formview.test.ts), Playwright (app/e2e/formulare.spec.ts) und der
#     Beleglauf app/e2e/p6-belege.spec.ts (Bildschirmfotos, PDF, Messungen)
#  09 PDF der ausgefüllten Fassung: pypdf und pypdfium2
#  10 Messungen im Kern (Zeiten, Größen) und aus dem Reader
#  11 Prüfung wie der Läufer: npm ci, npm test
#
# Voraussetzung: Node >= 22, JDK 21 und epubcheck 5.4.0 unter prototyp/tools/, das DSS-Werkzeug
# unter prototyp/dss/target/, prototyp/out/policy-hpro.xml, LibreOffice unter prototyp/tools/libreoffice,
# prototyp/.venv mit pypdf, pypdfium2 und jsonschema. Private Testschlüssel bleiben unter
# prototyp/out/p6/ (nicht im Repo).
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/P6
C=$OUT/container
K=prototyp/out/p6
IN=$OUT/eingaben
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
POLICY=$OUT/policy-hpro.xml
PY=prototyp/.venv/bin/python
LOPY=$(ls -d prototyp/tools/libreoffice/opt/libreoffice*/program 2>/dev/null | head -1)/python
SCHEMA=docs/spezifikation/beispiele/p6-antrag/data/antrag.schema.json
R=nachweis-antrag
mkdir -p "$C" "$K"
rm -f "$C"/antrag-*.hpro "$C"/antrag-*.json "$C"/*.pem "$C"/*.xhtml

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
hpro() { node kern/build/bin/hpro.js "$@"; }
dss() { "$JAVA" -Dorg.slf4j.simpleLogger.defaultLogLevel=warn -cp "prototyp/dss/target/classes:prototyp/dss/target/lib/*" example.hpro.HproDss "$@"; }
entry() { python3 -c "import sys,zipfile; sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode())" "$1" "$2"; }
stray() {
  local found
  found=$(ps -eo pid=,comm=,args= | awk '$2 !~ /^(bash|sh|dash|zsh|ps|awk)$/ && /vite preview|\/opt\/data\/html-pro\/(app\/)?node_modules\//')
  echo "${found:-(keine)}"
}

[ -f prototyp/out/policy-hpro.xml ] || { echo "fehlt: prototyp/out/policy-hpro.xml (prototyp/run_experiment.sh ausführen)"; exit 2; }
cp prototyp/out/policy-hpro.xml "$POLICY"
npm run build -w kern --silent && npm run build:test -w kern --silent || exit 2

hpro keygen "$K/sig-key.pem" "$C/sig-cert.pem" --alg ec --cn "Beispielbank Tirol (Testsignatur)" --not-before 2026-10-01T00:00:00Z > "$K/keygen-sig.txt"

{
  echo "# P6 Werkzeuge"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  run node --version
  run "$JAVA" -version
  run "$JAVA" -jar "$EPUBCHECK" --version
  echo "DSS-Version laut Maven-Abhängigkeiten:"
  ls prototyp/dss/target/lib | grep -E '^dss-(xades|asic-xades|validation|enumerations)-[0-9]'
  echo
  run "$PY" -c "from importlib.metadata import version as v; print('python-jsonschema', v('jsonschema')); print('pypdf', v('pypdf')); print('pypdfium2', v('pypdfium2'))"
  run "$LOPY" -c "import sys; print('Python von LibreOffice', sys.version.split()[0])"
  echo "Schlüssel (TEST, selbstsigniert; privater Schlüssel unter $K, nicht im Repo):"
  cat "$K/keygen-sig.txt"
} > "$OUT/00-werkzeuge.txt" 2>&1

{
  echo "# P6 Abnahme 1: Tests für Berechnung, Bedingung und Validierungsfehler (kern/test/form.test.ts)"
  echo
  run node --test kern/build/test/form.test.js
} > "$OUT/01-kern-tests.txt" 2>&1

{
  echo "# P6 Abnahme 2 und 3 über die Kommandozeile"
  echo
  echo "## Beispielformular als Container (Quelle docs/spezifikation/beispiele/p6-antrag/)"
  run node scripts/p6-beispiel.mjs "$C/antrag-leer.hpro"
  run hpro inspect "$C/antrag-leer.hpro"
  echo "## Leeres Formular: Felder, Bedingungen, Prüfregeln; Absenden nicht möglich (Exit 1)"
  run hpro form check "$C/antrag-leer.hpro"
  echo "## Entwurf mit Fehlern (docs/belege/P6/eingaben/01-unvollstaendig.json)"
  cat "$IN/01-unvollstaendig.json"
  echo
  run hpro form fill "$C/antrag-leer.hpro" "$C/antrag-entwurf.hpro" --time 2026-10-12T09:00:00Z --values-file "$IN/01-unvollstaendig.json"
  echo "## Daten des Entwurfs: ungültige Angaben (IBAN) stehen als null, die Eingabe bleibt im Formular"
  entry "$C/antrag-entwurf.hpro" data/antrag.json | python3 -c "import json,sys; d=json.load(sys.stdin); print({k: d['values'][k] for k in ['iban','email','gruendungsjahr','kaufpreis','eigenmittelquote']}, 'status=' + d['status'])"
  entry "$C/antrag-entwurf.hpro" content/index.xhtml | grep -o '<input id="f-iban"[^>]*>'
  echo
  echo "## Absenden ohne Korrektur: abgelehnt (Exit 1), es entsteht keine Datei"
  run hpro form submit "$C/antrag-entwurf.hpro" "$K/nicht-geschrieben.hpro" --time 2026-10-12T09:15:00Z
  run ls -l "$K/nicht-geschrieben.hpro"
  echo "## Korrektur (docs/belege/P6/eingaben/02-korrektur.json) und Absenden mit Datenexport"
  cat "$IN/02-korrektur.json"
  echo
  run hpro form submit "$C/antrag-entwurf.hpro" "$C/antrag-abgesendet.hpro" --time 2026-10-12T09:30:00Z --values-file "$IN/02-korrektur.json" --export "$C/antrag-abgesendet.json"
  run cat "$C/antrag-abgesendet.json"
  echo "## Datenexport aus dem Container ist byte-gleich mit der Datendatei data/antrag.json"
  run hpro form export "$C/antrag-abgesendet.hpro" "$K/export-erneut.json"
  run cmp "$K/export-erneut.json" "$C/antrag-abgesendet.json"
  entry "$C/antrag-abgesendet.hpro" data/antrag.json > "$K/datendatei.json"
  run cmp "$K/datendatei.json" "$C/antrag-abgesendet.json"
  echo "## Gespeichertes Markup: Werte stehen im Dokument, bedingte Abschnitte bleiben ohne hidden lesbar"
  entry "$C/antrag-abgesendet.hpro" content/index.xhtml | grep -oE '<input id="f-(kaufpreis|iban|richtig)"[^>]*>|<output id="f-(rate|bedarf)"[^>]*>[^<]*</output>|<fieldset id="(kredite|mitantragsteller|selbststaendig)"[^>]*>'
  echo
  echo "## Verlauf (manifest.json#history)"
  entry "$C/antrag-abgesendet.hpro" manifest.json | python3 -c "import json,sys; [print(h['version'], h['dateModified'], h['note']) for h in json.load(sys.stdin)['history']]"
} > "$OUT/02-abnahme-kommandozeile.txt" 2>&1

# Der Reader-Lauf kommt vor 03 und 09: sie prüfen seinen Datenexport und sein PDF.
{
  echo "# P6 Reader: Unit-Tests, Browser-Tests und Beleglauf"
  echo
  echo "## vitest app/test/formview.test.ts"
  (cd app && run npx vitest run test/formview.test.ts)
  echo "## Playwright (Chromium) app/e2e/formulare.spec.ts – Teil von npm test"
  (cd app && npx vite build > /dev/null 2>&1; run env PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npx playwright test --project=chromium e2e/formulare.spec.ts)
  echo "## Beleglauf app/e2e/p6-belege.spec.ts (Bildschirmfotos, Container und PDF aus dem Reader, Messungen)"
  (cd app && run npm run -s belege:p6)
} > "$OUT/08-reader.txt" 2>&1

{
  echo "# P6 Abnahme 3: Datenexport schemageprüft"
  echo
  echo "## 13 Datenobjekte gegen data/antrag.schema.json: Prüfer des Kerns (form.validateJson)"
  rm -rf "$K/schema"
  run node scripts/p6-schema-faelle.mjs "$C/antrag-abgesendet.json" "$SCHEMA" "$K/schema"
  echo "## Dieselben Dateien, unabhängig geprüft (python-jsonschema, Draft 2020-12, kein Code aus kern/)"
  run "$PY" scripts/p6-schema-gegenprobe.py "$SCHEMA" "$K/schema"
  echo "## Export aus einem Reader-Lauf (app/e2e/p6-belege.spec.ts) gegen das Schema"
  mkdir -p "$K/schema-reader" && cp "$C/reader-antrag.json" "$K/schema-reader/reader-antrag.json" 2>/dev/null && echo "reader-antrag gueltig" > "$K/schema-reader/faelle.txt"
  run "$PY" scripts/p6-schema-gegenprobe.py "$SCHEMA" "$K/schema-reader"
  echo "## Export bei unbrauchbarem Schema: abgelehnt (Exit 1), keine Datei"
  python3 - "$C/antrag-abgesendet.hpro" "$K/schema-kaputt.hpro" <<'EOF'
import sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
zin = zipfile.ZipFile(src)
zout = zipfile.ZipFile(dst, 'w')
for i in zin.infolist():
    d = zin.read(i.filename)
    if i.filename == 'data/antrag.schema.json':
        d = b'{"type": 5}\n'
    zout.writestr(i, d, compress_type=i.compress_type)
zout.close()
EOF
  run hpro form export "$K/schema-kaputt.hpro" "$K/nicht-exportiert.json"
  run ls -l "$K/nicht-exportiert.json"
} > "$OUT/03-abnahme3-schema.txt" 2>&1

{
  echo "# P6 Gegenprobe: berechnete Felder, Bedingungen und Prüfregeln in LibreOffice"
  echo "# Feldnamen als benannte Bereiche, Formeln wörtlich wie im Dokument (OpenFormula)."
  echo
  rm -rf "$K/lo"
  run node scripts/p6-gegenprobe.mjs fods "$K/lo" "$C/antrag-entwurf.hpro" "$C/antrag-abgesendet.hpro"
  mkdir -p prototyp/out/p19/lo-profile
  run "$LOPY" scripts/p19-lo-werte.py "$K/lo/lo.json" "$K/lo/antrag-entwurf-antrag.fods" "$K/lo/antrag-abgesendet-antrag.fods"
  run node scripts/p6-gegenprobe.mjs compare "$K/lo/lo.json" "$C/antrag-entwurf.hpro" "$C/antrag-abgesendet.hpro"
  mkdir -p "$OUT/gegenprobe" && cp "$K/lo/"*.fods "$K/lo/lo.json" "$OUT/gegenprobe/"
} > "$OUT/04-gegenprobe-libreoffice.txt" 2>&1

{
  echo "# P6 Eingefrorene, signierte Fassung des abgesendeten Antrags (Zusage 5)"
  echo
  run hpro lock freeze "$C/antrag-abgesendet.hpro" "$C/antrag-nachweis.hpro" --id "$R" --time 2026-10-12T10:00:00Z --key "$K/sig-key.pem" --cert "$C/sig-cert.pem"
  run hpro lock frozen-check "$C/antrag-nachweis.hpro" --id "$R" --trust "$C/sig-cert.pem"
  echo "## EU DSS 6.5 (Richtlinie hpro, Vertrauensanker sig-cert.pem)"
  run dss validate "$C/antrag-nachweis.hpro" "$C/sig-cert.pem" "$POLICY"
  echo "## Eingefrorenes Formular: kein Steuerelement, Felder als Text, nicht geltender Abschnitt als Hinweis"
  entry "$C/antrag-nachweis.hpro" "renditions/$R/content/index.xhtml" > "$K/nachweis.xhtml"
  echo "Steuerelemente (input|select|textarea|form) in der Fassung: $(grep -cE '<(input|select|textarea|form)\b' "$K/nachweis.xhtml")"
  grep -oE '<p class="hp-form-status"[^>]*>[^<]*</p>|<span class="hp-field" data-hp-field="(kaufpreis|iban|angaben_richtig)"[^>]*>[^<]*</span>|<p class="hp-form-omitted"[^>]*>[^<]*</p>|<output id="f-rate"[^>]*>[^<]*</output>' "$K/nachweis.xhtml"
  echo
  echo "## Manipulation: Monatsrate in der eingefrorenen Fassung von 1.787,23 € auf 1.287,23 € geändert"
  python3 - "$C/antrag-nachweis.hpro" "$K/nachweis-manipuliert.hpro" "renditions/$R/content/index.xhtml" <<'EOF'
import sys, zipfile
src, dst, target = sys.argv[1:4]
zin = zipfile.ZipFile(src)
zout = zipfile.ZipFile(dst, 'w')
for i in zin.infolist():
    d = zin.read(i.filename)
    if i.filename == target:
        assert '1.787,23 €'.encode() in d
        d = d.replace('1.787,23 €'.encode(), '1.287,23 €'.encode())
    zout.writestr(i, d, compress_type=i.compress_type)
zout.close()
EOF
  run hpro lock frozen-check "$K/nachweis-manipuliert.hpro" --id "$R" --trust "$C/sig-cert.pem"
  run dss validate "$K/nachweis-manipuliert.hpro" "$C/sig-cert.pem" "$POLICY"
  echo "## Hauptfassung weiter ausfüllbar: Änderung nach dem Einfrieren lässt die Signatur der Fassung gültig"
  run hpro form fill "$C/antrag-nachweis.hpro" "$K/nachweis-geaendert.hpro" --time 2026-10-12T11:00:00Z --set telefon="+43 512 654321"
  run hpro lock frozen-check "$K/nachweis-geaendert.hpro" --id "$R" --trust "$C/sig-cert.pem"
} > "$OUT/07-eingefroren-dss.txt" 2>&1


{
  echo "# P6 PDF der ausgefüllten Fassung (Druckweg des Readers, Chromium; geprüft mit pypdf und pypdfium2)"
  echo
  run "$PY" scripts/p6-pdf-pruefung.py "$C/antrag-ausgefuellt.pdf" "$C/reader-antrag.json" "$OUT/screenshots"
} > "$OUT/09-pdf.txt" 2>&1

{
  echo "# P6 Messungen"
  echo
  echo "## Kern: Zeiten je Vorgang (Node $(node --version), Median aus 20 Läufen, nach 3 Aufwärmläufen)"
  node --input-type=module - "$C/antrag-entwurf.hpro" "$IN/02-korrektur.json" <<'EOF'
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { form, readContainer } from './kern/dist/index.js';
const [file, korr] = process.argv.slice(2);
const bytes = readFileSync(file);
const set = Object.entries(JSON.parse(readFileSync(korr, 'utf8'))).map(([field, value]) => ({ field, value }));
const xhtml = new TextDecoder().decode((await readContainer(bytes)).files.get('content/index.xhtml'));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
async function time(name, fn) {
  for (let i = 0; i < 3; i++) await fn();
  const t = [];
  for (let i = 0; i < 20; i++) { const t0 = performance.now(); await fn(); t.push(performance.now() - t0); }
  console.log(`${name.padEnd(64)} Median ${median(t).toFixed(2)} ms, Max ${Math.max(...t).toFixed(2)} ms`);
}
const dom = new DOMParser().parseFromString(xhtml, 'application/xhtml+xml');
const fd = new form.FormDocument(dom);
let k = 0;
await time('Formular lesen und vollständig rechnen (FormDocument, 40 Felder)', () => new form.FormDocument(new DOMParser().parseFromString(xhtml, 'application/xhtml+xml')));
await time('eine Eingabe: rechnen, Bedingungen, Prüfregeln (setEntry)', () => fd.setEntry('antrag', 'kaufpreis', String(400000 + (k++ % 50) * 1000)));
await time('Validierung vor dem Absenden ohne Schema (validate)', () => fd.validate('antrag'));
await time('Entwurf speichern (fillForms, 16 Eingaben)', () => form.fillForms(bytes, { set, time: '2026-10-12T09:30:00Z' }));
await time('Absenden (fillForms submit, 16 Eingaben, Prüfung samt Schema)', () => form.fillForms(bytes, { set, submit: true, time: '2026-10-12T09:30:00Z' }));
const sub = (await form.fillForms(bytes, { set, submit: true, time: '2026-10-12T09:30:00Z' })).bytes;
await time('Datenexport mit Schemaprüfung (exportFormData)', () => form.exportFormData(sub));
EOF
  echo
  echo "## Größen"
  for f in "$C"/antrag-*.hpro "$C"/antrag-*.json "$C"/antrag-ausgefuellt.pdf; do printf '%-48s %8d Bytes\n' "$(basename "$f")" "$(stat -c %s "$f")"; done
  printf '%-48s %8d Bytes\n' "data/antrag.schema.json" "$(stat -c %s "$SCHEMA")"
  echo
  echo "## Reader (docs/belege/P6/messungen-reader.json)"
  python3 - "$OUT/messungen-reader.json" <<'EOF'
import json, sys
m = json.load(open(sys.argv[1]))
e = m['eingabeBisAnzeige']
print('Eingabe bis Anzeige (10 Eingaben Kaufpreis): Hülle Median %.1f ms (max %.1f ms), Tab bis geänderte Monatsrate im Rahmen Median %d ms (max %d ms)' % (e['huelleMedianMs'], e['huelleMaxMs'], e['bisAnzeigeMedianMs'], e['bisAnzeigeMaxMs']))
for k, v in m['waagrechtesScrollen'].items():
    print('Breite %-7s %4d px: Rahmen scrollWidth %d / clientWidth %d, Hülle %d / %d' % (k, v['breite'], v['rahmen']['scrollWidth'], v['rahmen']['clientWidth'], v['huelle']['scrollWidth'], v['huelle']['clientWidth']))
print('Druck: %d Seiten, PDF %d Bytes, Steuerelemente im Druck: %d, ausgelassen: %s' % (m['druck']['seiten'], m['druck']['pdfBytes'], m['druck']['steuerelementeImDruck'], ', '.join(m['druck']['ausgelassen'])))
print('Netzwerkanfragen außerhalb des Readers während aller Bildschirmfotos: %d' % len(m['netzwerkAnfragenAusserhalbDesReaders']))
r = m['readerAbsenden']
print('Absenden im Reader: %s, %d Bytes, integrity %s, Status %s, Probleme %d, Export gleich Datendatei: %s' % (r['container'], r['bytes'], r['integrity'], r['status'], r['probleme'], r['exportGleichDatendatei']))
EOF
} > "$OUT/10-messungen.txt" 2>&1

{
  echo "# P6 epubcheck 5.4.0 über alle Container"
  echo
  for f in "$C"/*.hpro; do
    cp "$f" "$K/check.epub"
    echo "## $(basename "$f")"
    run "$JAVA" -jar "$EPUBCHECK" "$K/check.epub"
  done
} > "$OUT/05-epubcheck.txt" 2>&1

{
  echo "# P6 hpro-check (Konformitätsprüfer) über alle Container"
  echo
  for f in "$C"/*.hpro; do
    echo "## $(basename "$f")"
    run node kern/build/bin/hpro-check.js "$f"
  done
} > "$OUT/06-hpro-check.txt" 2>&1

# Keine Server liegen lassen (vite preview aus Playwright, siehe Läufer-Prüfung mit npm ci).
for p in $(pgrep -f 'vite preview' || true); do [ "$(cat /proc/$p/comm 2>/dev/null)" = node ] && kill "$p"; done

if [ "${P6_OHNE_NPM:-}" != 1 ]; then
{
  echo "# P6 Prüfung wie der Läufer (runner/auto_lauf.py: npm ci, dann npm test --if-present)"
  echo "# davor und danach: Prozesse, die node_modules offen halten könnten"
  echo
  echo "\$ ps -eo pid,comm,args   # Nicht-Shell-Prozesse mit 'vite preview' oder node_modules/, vorher"; stray; echo
  run npm ci --no-audit --no-fund
  run npm test --if-present
  echo "\$ ps -eo pid,comm,args   # Nicht-Shell-Prozesse mit 'vite preview' oder node_modules/, nachher"; stray; echo
} > "$OUT/11-npm-test.txt" 2>&1
fi

echo "Belege P6 geschrieben nach $OUT"
grep -H "Exit-Code" "$OUT"/[01]*.txt | sort | uniq -c
