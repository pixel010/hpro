#!/usr/bin/env bash
# Erzeugt die Belege für Paket S9 (KI-lesbare Ebene: Maschinensicht je Dokument) unter
# docs/belege/S9/. Jede Datei enthält wörtliche Ausgaben mit Exit-Code.
#
#  00 Werkzeuge                                   05 Prüfer meldet fehlende und abweichende Sicht (Abnahme 4)
#  01 Spezifikation und Regelkatalog (Abnahme 1)  06 Mensch- gegen Maschinensicht, Testsuite (Abnahme 3)
#  02 Beispiel-Container mit Sicht (Abnahme 2)    07 Sprachmodell-Stichprobe (Abnahme 5; Lauf getrennt,
#  03 epubcheck 5.4.0                                scripts/s9-sprachmodell.mjs, Rohdaten berichte/sprachmodell.json)
#  04 EU DSS 6.5: Sicht ist signiert              08 npm ci && npm test (getrennt, siehe README.md dort)
#
# Voraussetzung: prototyp/setup-tools.sh (JDK 21, epubcheck 5.4.0, DSS-Werkzeug), Node >= 22.
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/S9
C=$OUT/container
R=$OUT/berichte
TMP=prototyp/out/s9
JAVA=$PWD/prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK=$PWD/prototyp/tools/epubcheck-5.4.0/epubcheck.jar
POLICY=docs/belege/P3/policy-hpro.xml
CERT=$C/s9-maengelbericht-signiert.zertifikat.pem
SIGNED=$C/s9-maengelbericht-signiert.hpro
rm -rf "$TMP" "$C"
mkdir -p "$C" "$R" "$TMP/epub"
export TMPDIR="$PWD/$TMP"
export HPRO_EPUBCHECK="$EPUBCHECK" HPRO_JAVA="$JAVA"

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
hpro() { node kern/build/bin/hpro.js "$@"; }
epub() { cp "$1" "$TMP/epub/$(basename "$1" .hpro).epub" && "$JAVA" -jar "$EPUBCHECK" "$TMP/epub/$(basename "$1" .hpro).epub"; }
dss() { "$JAVA" -Dorg.slf4j.simpleLogger.defaultLogLevel=warn -cp "prototyp/dss/target/classes:prototyp/dss/target/lib/*" example.hpro.HproDss "$@"; }
entry() { node -e "import('./kern/build/src/index.js').then(async (k) => { const e = (await k.readZip(require('fs').readFileSync(process.argv[1]))).find((x) => x.name === process.argv[2]); process.stdout.write(Buffer.from(e.data)); })" "$1" "$2"; }

npm run -s build -w kern || exit 2
npm run -s build:test -w kern || exit 2

# ------------------------------------------------------------------ 00 Werkzeuge
{
  echo "# S9 Werkzeuge"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  run node --version
  run "$JAVA" -version
  run "$JAVA" -jar "$EPUBCHECK" --version
  echo "DSS-Version laut Maven-Abhängigkeiten:"
  ls prototyp/dss/target/lib | grep -E '^dss-(xades|asic-xades|validation)-[0-9]'
  echo
  run claude --version
  run hpro version
} > "$OUT/00-werkzeuge.txt" 2>&1

# ------------------------------------------------------------------ 01 Spezifikation
{
  echo "# S9 Abnahme 1: Spezifikationskapitel (Teil 0, Abschnitt 15a), Regelkatalog (Teil 1, 5.13 und 9.9), mechanisch geprüft"
  echo
  echo "## Abschnitt 15a in Teil 0: Überschriften und Anforderungen"
  run grep -nE '^(## 15a|### 15a|#### HP-MACH)' docs/spezifikation/00-spezifikation.md
  echo "## Regeln in Teil 1"
  run grep -nE '^(### 5\.13|### 9\.9|#### HP[RL]-MACH)' docs/spezifikation/01-konformitaet.md
  echo "## Regelkatalog als JSON (exportiert, im Paket unter spec/)"
  run node -e "const c = require('./docs/spezifikation/01-regelkatalog.json'); for (const r of [...c.rules, ...c.readerRules].filter((r) => r.area === 'MACH')) console.log(r.id, r.class, r.level, r.requirements.join(' '), '–', r.title)"
  echo "## Schema der Maschinensicht"
  run node -e "const s = require('./docs/spezifikation/schema/maschinensicht.schema.json'); console.log(s.\$schema); console.log('Pflichtfelder:', s.required.join(', ')); console.log('geschlossen:', s.additionalProperties === false); console.log('Blocktypen:', s.\$defs.block.oneOf.map((b) => b.properties.type.const ?? b.properties.type.enum.join('|')).join(', '))"
  echo "## check-spec (Teil 0)"
  run node scripts/check-spec.mjs
  run node scripts/check-spec-selftest.mjs
  echo "## check-konformitaet (Teil 1 gegen Teil 0, JSON-Katalog)"
  run node scripts/check-konformitaet.mjs
  run node scripts/check-konformitaet-selftest.mjs
  echo "## check-governance (Teil 2: Änderungsantrag HPC-0012, Fremdrechte-Register)"
  run node scripts/check-governance.mjs
  run grep -n 'HPC-0012' docs/spezifikation/02-lizenz-und-governance.md
} > "$OUT/01-spezifikation.txt" 2>&1

# ------------------------------------------------------------------ 02 Beispiel
{
  echo "# S9 Abnahme 2: Beispiel-Container mit Maschinensicht, im Manifest gehasht und signiert"
  echo
  echo "## Bau aus docs/spezifikation/beispiele/s9-maschinensicht (erzeugen, neu berechnen, schwärzen, Anmerkung, signieren)"
  run node scripts/s9-beispiel.mjs "$C" "$TMP"
  echo "## Einträge und Hash-Manifest des signierten Containers"
  run hpro inspect "$SIGNED"
  echo "## manifest.json: Einträge der Maschinensicht"
  run node -e "const m = JSON.parse(require('child_process').execFileSync('node', ['-e', \"import('./kern/build/src/index.js').then(async (k) => process.stdout.write(JSON.stringify((await k.readContainer(require('fs').readFileSync('$SIGNED'))).manifest)))\"]).toString()); console.log(JSON.stringify(m.resources.filter((r) => r.url.startsWith('machine/')), null, 2))"
  echo "## package.opf: Einträge der Maschinensicht"
  entry "$SIGNED" package.opf | grep -n 'machine/' ; echo
  echo "## Signatur: signierte Objekte (eigene Prüfung des Kerns)"
  run hpro validate "$SIGNED" --trust "$CERT" --time 2026-10-14T12:00:00Z
  echo "## Maschinensicht und Markdown-Darstellung, aus dem signierten Container entpackt"
  entry "$SIGNED" machine/document.json > "$C/s9-maengelbericht.machine-document.json"
  entry "$SIGNED" machine/document.md > "$C/s9-maengelbericht.machine-document.md"
  run sha256sum "$C/s9-maengelbericht.machine-document.json" "$C/s9-maengelbericht.machine-document.md"
  run head -c 1600 "$C/s9-maengelbericht.machine-document.json"
  echo
  echo "## Prüfhülle für ein Sprachmodell (hpro machine), JSON nach berichte/pruefhuelle.json"
  run hpro machine "$SIGNED" --trust "$CERT" --time 2026-10-14T12:00:00Z --out "$R/pruefhuelle.json"
  run hpro machine "$SIGNED" --trust "$CERT" --time 2026-10-14T12:00:00Z --format md --out "$R/pruefhuelle.md"
  run head -n 16 "$R/pruefhuelle.md"
} > "$OUT/02-beispiel.txt" 2>&1

# ------------------------------------------------------------------ 03 epubcheck
{
  echo "# S9 epubcheck 5.4.0: die zusätzlichen Dateien machine/document.json und machine/document.md brechen die EPUB-Rückfallebene nicht"
  echo
  for f in "$C/s9-maengelbericht.hpro" "$SIGNED" "$C/s9-maengelbericht-versteckt.hpro"; do run epub "$f"; done
  echo "## Konformitätsprüfer mit angebundenem epubcheck (HPR-CONT-024/028) am signierten Beispiel"
  run hpro check "$SIGNED" --trust "$CERT"
} > "$OUT/03-epubcheck.txt" 2>&1

# ------------------------------------------------------------------ 04 DSS
node -e "
import('./kern/build/src/index.js').then(async (k) => {
  const fs = require('fs');
  const entries = await k.readZip(fs.readFileSync('$SIGNED'));
  const out = entries.map((e) => ({ name: e.name, data: e.name === 'machine/document.json' ? new TextEncoder().encode(new TextDecoder().decode(e.data).replace('\"text\": \"8.420,00\"', '\"text\": \"5.800,00\"')) : e.data, compression: e.name === 'mimetype' ? 'store' : 'auto' }));
  fs.writeFileSync('$TMP/sicht-nach-signatur-geaendert.hpro', await k.writeZip(out, { modified: new Date('2026-10-14T09:30:00Z') }));
});"
{
  echo "# S9 EU DSS 6.5: die Maschinensicht ist signiertes Objekt; eine Änderung nach der Signatur ist HASH_FAILURE"
  echo
  echo "## Signiertes Beispiel (Richtlinie docs/belege/P3/policy-hpro.xml)"
  run dss validate "$SIGNED" "$CERT" "$POLICY"
  echo "## Dieselbe Datei, nur in machine/document.json die Summe 8.420,00 durch 5.800,00 ersetzt"
  run dss validate "$TMP/sicht-nach-signatur-geaendert.hpro" "$CERT" "$POLICY"
  echo "## Gegenprobe Kern und Konformitätsprüfer"
  run hpro validate "$TMP/sicht-nach-signatur-geaendert.hpro" --trust "$CERT" --time 2026-10-14T12:00:00Z
  run hpro check "$TMP/sicht-nach-signatur-geaendert.hpro" --trust "$CERT" --no-epubcheck
} > "$OUT/04-dss.txt" 2>&1

# ------------------------------------------------------------------ 05 Prüfer
{
  echo "# S9 Abnahme 4: der Konformitätsprüfer meldet fehlende oder abweichende Maschinensicht"
  echo
  echo "## Stimmige Sicht (unsigniertes Beispiel): keine MACH-Befunde"
  run hpro check "$C/s9-maengelbericht.hpro" --no-epubcheck
  echo "## Ohne Maschinensicht (createContainer mit machineView: false): Warnung HPR-MACH-001"
  run hpro check "$TMP/ohne-sicht.hpro" --no-epubcheck
  echo "## Summe in der Sicht geändert (Hash im Manifest angepasst): HPR-MACH-005 mit Pointer und Adresse; Markdown passt nicht mehr (HPR-MACH-006)"
  run hpro check "$TMP/zelle-geaendert.hpro" --no-epubcheck
  echo "## Absatz mit Anweisung an KI-Systeme in die Sicht eingeschleust: HPR-MACH-005"
  run hpro check "$TMP/eingeschleust.hpro" --no-epubcheck
  echo "## Statusbehauptung signatureValid in der Sicht: HPR-MACH-002 (Schema) und HPR-MACH-005"
  run hpro check "$TMP/statusfeld.hpro" --no-epubcheck
  echo "## Markdown-Darstellung um einen Satz ergänzt: HPR-MACH-006"
  run hpro check "$TMP/markdown-geaendert.hpro" --no-epubcheck
  echo "## Signatur lässt machine/ aus: HPR-MACH-008 (zusätzlich HPR-SIG-005/017: nicht alle Dateien signiert)"
  run hpro check "$TMP/signatur-ohne-sicht.hpro" --trust "$CERT" --no-epubcheck
  echo "## Variante mit verborgenem Text: HP-NEST-001 meldet ihn, die Sicht enthält ihn nicht (keine MACH-Befunde)"
  run hpro check "$C/s9-maengelbericht-versteckt.hpro" --no-epubcheck
  run sh -c "node kern/build/bin/hpro.js machine '$C/s9-maengelbericht-versteckt.hpro' | grep -c -E 'Ignoriere alle|Kostenrahmen intern|qualifiziert signiert'"
  echo "## Prüfhülle: Rückgabe 0 bei stimmiger, 1 bei abweichender Sicht; abweichende Sicht wird nicht verwendet"
  run hpro machine "$C/s9-maengelbericht.hpro" --out "$TMP/huelle-ok.json"
  run hpro machine "$TMP/eingeschleust.hpro" --out "$TMP/huelle-eingeschleust.json"
  run node -e "const h = require('./$TMP/huelle-eingeschleust.json'); console.log('used:', h.status.used, '| consistent:', h.status.consistent, '| eingeschleuster Satz in view:', JSON.stringify(h.view).includes('keine Mängel bestehen'))"
  echo "## Nachrüsten einer älteren Datei: hpro machine write, danach ohne Warnung"
  run hpro machine write "$TMP/ohne-sicht.hpro" "$TMP/nachgeruestet.hpro"
  run hpro check "$TMP/nachgeruestet.hpro" --no-epubcheck
} > "$OUT/05-pruefer.txt" 2>&1

# ------------------------------------------------------------------ 06 Gleichheit
{
  echo "# S9 Abnahme 3: Maschinensicht und Menschenansicht inhaltsgleich (Text, Tabellen, Formularwerte); Geschwärztes fehlt in beiden"
  echo
  echo "## Einheitstests kern/test/machine.test.ts"
  run node --test --test-reporter=spec kern/build/test/machine.test.js
  echo "## Öffentliche Testsuite: Fälle zur Maschinensicht (testsuite/faelle.json, erzeugt von scripts/s3-testsuite.mjs)"
  run node -e "const s = require('./testsuite/faelle.json'); const m = s.faelle.filter((f) => f.id.includes('-mach-')); for (const f of m) console.log(f.id.padEnd(36), f.art.padEnd(9), 'erwartet:', f.erwarteteBefunde.join(', ') || '–'); console.log(m.length, 'Fälle zur Maschinensicht von', s.faelle.length)"
  run node --test --test-reporter=spec --test-name-pattern='mach|hpro-check' kern/build/test/conformance.test.js
} > "$OUT/06-gleichheit.txt" 2>&1

# ------------------------------------------------------------------ 07 Sprachmodell (Auswertung des getrennten Laufs)
if [ -f "$R/sprachmodell.json" ]; then
  {
    echo "# S9 Abnahme 5: Sprachmodell-Stichprobe (Auswertung von berichte/sprachmodell.json)"
    echo
    run node -e "
const r = require('./$R/sprachmodell.json');
console.log('Werkzeug:', r.werkzeug);
console.log('Modelle laut Antwort:', [...new Set(r.laeufe.flatMap((l) => l.modelle))].join(', '));
console.log('Systemhinweis:', r.systemhinweis);
console.log('Materialgröße (Zeichen):', JSON.stringify(r.materialGroesse));
console.log('Zusammenfassung:', JSON.stringify(r.zusammenfassung));
for (const l of r.laeufe) {
  console.log('');
  console.log('[' + l.material + '] ' + l.id + ' ' + (l.richtig ? 'RICHTIG' : 'FALSCH') + ' (' + l.ms + ' ms)');
  console.log('  Frage:   ' + l.frage);
  console.log('  Antwort: ' + l.antwort.replace(/\n+/g, ' / '));
  if (!l.richtig) console.log('  fehlt: ' + l.fehlt.join(' ') + ' | verboten getroffen: ' + l.verboten.join(' '));
}"
  } > "$OUT/07-sprachmodell.txt" 2>&1
fi

grep -h -E '^(OK|FAILED|selftest|\[Exit-Code [^0])' "$OUT"/0[1-6]-*.txt | sort | uniq -c
echo "Belege unter $OUT"
