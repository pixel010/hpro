#!/usr/bin/env bash
# Erzeugt die Belege für Paket S2 (Konformitätsstufen, Prüfregeln, Sicherheitsanforderungen)
# unter docs/belege/S2/.
#
#  1. Mechanische Prüfung des Regelkatalogs (scripts/check-konformitaet.mjs) gegen Teil 0, Text und JSON
#  2. Selbsttest des Prüfers: absichtlich kaputte Varianten müssen erkannt werden
#  3. Gleichstand der maschinenlesbaren Fassung (01-regelkatalog.json) mit dem Dokument
#  4. Befunderzeugung nach Teil 1 Abschnitt 4 mit dem Beispielprüfer (scripts/konformitaet-bericht.mjs)
#     an realen Containern: Beispiel des Kerns, manipulierte Container aus P1 und P3, signierte und
#     teilsignierte Container aus P3, ein Nicht-ZIP, ein ZIP ohne mimetype/manifest; mit und ohne
#     Vertrauensanker; Berichte als JSON und gegen das Schema geprüft
#  5. Gegenprobe mit dem EPUB-Validator (epubcheck 5.4.0, Befunde HPR-CONT-024/028) und dem
#     unabhängigen AdES-Validator (DSS 6.5) für die Signatururteile (HPR-SIG-015/016)
#  6. npm ci && npm test (schließt beide Spezifikationsprüfungen und Selbsttests ein)
#
# Voraussetzung: prototyp/setup-tools.sh wurde ausgeführt (JDK 21, epubcheck 5.4.0, DSS-Werkzeug),
# Node >= 22, Python 3.
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/S2
TMP=prototyp/out/s2
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
P1=docs/belege/P1/container
P3=docs/belege/P3/container
mkdir -p "$OUT/berichte" "$TMP"

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
dss() { "$JAVA" -Dorg.slf4j.simpleLogger.defaultLogLevel=warn -cp "prototyp/dss/target/classes:prototyp/dss/target/lib/*" example.htmlpro.HproDss "$@"; }
hpro() { node kern/build/bin/hpro.js "$@"; }
bericht() { node scripts/konformitaet-bericht.mjs "$@"; }

npm run build:test -w kern --silent || exit 2

{
  echo "# S2 Werkzeuge"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  run node --version
  run python3 --version
  run "$JAVA" -version
  run "$JAVA" -jar "$EPUBCHECK" --version
  echo "DSS-Version laut Maven-Abhängigkeiten:"
  ls prototyp/dss/target/lib | grep -E '^dss-(xades|asic-xades|validation|policy-jaxb)-[0-9]'
  echo
  run wc -l docs/spezifikation/01-konformitaet.md docs/spezifikation/01-regelkatalog.json docs/spezifikation/schema/konformitaetsbericht.schema.json scripts/check-konformitaet.mjs scripts/check-konformitaet-selftest.mjs scripts/konformitaet-bericht.mjs
} > "$OUT/00-werkzeuge.txt" 2>&1

{
  echo "# S2 Mechanische Prüfung des Regelkatalogs gegen Teil 0 (Abnahmekriterien 1–4)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run node scripts/check-konformitaet.mjs docs/spezifikation/01-konformitaet.md
} > "$OUT/01-check-konformitaet.txt" 2>&1

node scripts/check-konformitaet.mjs docs/spezifikation/01-konformitaet.md --json > "$OUT/02-check-konformitaet.json" 2>&1

{
  echo "# S2 Selbsttest des Prüfers: kaputte Varianten des Regelkatalogs müssen erkannt werden"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run node scripts/check-konformitaet-selftest.mjs docs/spezifikation/01-konformitaet.md
} > "$OUT/03-selftest.txt" 2>&1

{
  echo "# S2 Gleichstand der maschinenlesbaren Fassung (01-regelkatalog.json) mit dem Dokument"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run node scripts/check-konformitaet.mjs --export "$TMP/regelkatalog-neu.json"
  run cmp docs/spezifikation/01-regelkatalog.json "$TMP/regelkatalog-neu.json"
  run sha256sum docs/spezifikation/01-regelkatalog.json "$TMP/regelkatalog-neu.json"
  echo "Regeln je Katalog und Klasse (aus der JSON-Fassung, python3):"
  python3 - <<'EOF'
import json, collections
c = json.load(open('docs/spezifikation/01-regelkatalog.json'))
for key in ('rules', 'readerRules'):
    by = collections.Counter((r['level'], r['class']) for r in c[key])
    print(f"{key}: {len(c[key])} Regeln")
    for level in ('Basis', 'Lebendig', 'Signiert', 'Archiv'):
        print(f"  {level:9} " + ' '.join(f"{cls}={by[(level, cls)]}" for cls in ('Fatal', 'Fehler', 'Warnung', 'Hinweis')))
ids = [r['id'] for r in c['rules']] + [r['id'] for r in c['readerRules']]
print(f"Kennungen eindeutig: {len(ids) == len(set(ids))} ({len(ids)} Kennungen)")
print(f"Platzhalter: {len(c['placeholders'])}, Ortsarten: {c['locationKinds']}, Mittel: {c['means']}")
missing = [r['id'] for r in c['rules'] if not all(r.get(k) for k in ('scope', 'means', 'check', 'location', 'message', 'requirements'))]
print(f"Dokumentregeln ohne Pflichtfeld: {missing}")
sbx = [r['id'] for r in c['rules'] + c['readerRules'] if r['area'] == 'SBX' and not r.get('rationale')]
print(f"SBX-Regeln ohne Begründung: {sbx}")
EOF
} > "$OUT/04-regelkatalog-json.txt" 2>&1

{
  echo "# S2 Befunderzeugung nach Teil 1 Abschnitt 4 (Beispielprüfer, nicht das S3-Prüfprogramm)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Jeder Lauf: Textausgabe nach 4.4, Rückgabecode nach 4.5, JSON-Bericht nach Schema 4.3 in $OUT/berichte/."
  echo "# Zeilen 'NICHT GEPRÜFT' sind unterdrückt (Anzahl steht in der Zusammenfassung)."
  echo
  run hpro sample "$TMP/beispiel.hpro"
  # Prüffälle außerhalb des Kerns: kein ZIP; ZIP ohne mimetype und manifest.json; manifest.json kein JSON; mimetype falsch
  python3 - "$TMP" <<'EOF'
import sys, zipfile, shutil
tmp = sys.argv[1]
open(f'{tmp}/kein-zip.hpro', 'wb').write(b'Dies ist kein ZIP-Archiv.\n')
with zipfile.ZipFile(f'{tmp}/fremdes-zip.hpro', 'w') as z:
    z.writestr('readme.txt', 'nur eine Textdatei')
src = f'{tmp}/beispiel.hpro'
with zipfile.ZipFile(src) as z:
    entries = [(i.filename, i.date_time, i.compress_type, z.read(i.filename)) for i in z.infolist()]
def copy_with(out, replace):
    # fresh ZipInfo objects per output file (zipfile mutates ZipInfo on write)
    with zipfile.ZipFile(out, 'w') as w:
        for name, dt, method, data in entries:
            zi = zipfile.ZipInfo(name, dt)
            zi.compress_type = method
            data, zi.compress_type = replace(name, data, method)
            w.writestr(zi, data)
copy_with(f'{tmp}/manifest-kaputt.hpro', lambda n, d, m: (b'{ "name": ' if n == 'manifest.json' else d, m))
copy_with(f'{tmp}/mimetype-falsch.hpro', lambda n, d, m: (b'application/vnd.etsi.asic-e+zip', zipfile.ZIP_DEFLATED) if n == 'mimetype' else (d, m))
for n in ('manifest-kaputt', 'mimetype-falsch'):
    print(n, zipfile.ZipFile(f'{tmp}/{n}.hpro').namelist())
print('Prüffälle geschrieben: kein-zip, fremdes-zip, manifest-kaputt, mimetype-falsch')
EOF
  echo
  for f in "$TMP/beispiel.hpro" "$P1/beispiel-manipuliert.epub" "$TMP/kein-zip.hpro" "$TMP/fremdes-zip.hpro" "$TMP/manifest-kaputt.hpro" "$TMP/mimetype-falsch.hpro"; do
    name=$(basename "$f"); name=${name%.*}
    echo "\$ konformitaet-bericht $f --json $OUT/berichte/$name.json"
    bericht "$f" --json "$OUT/berichte/$name.json" 2>&1 | grep -v '^NICHT GEPRÜFT'; echo "[Exit-Code ${PIPESTATUS[0]}]"; echo
  done
  echo "## Signierte Container aus P3, ohne Vertrauensanker (HPR-SIG-016: unbestimmt) und mit Vertrauensanker"
  echo
  for f in "$P3/signiert-rsa.epub" "$P3/signiert-2sig.epub" "$P3/manipuliert-rsa.epub" "$P3/manipuliert-2sig.epub" "$P3/teilsigniert.epub" "$P3/teilsigniert-anhang-bearbeitet.epub" "$P3/unsigniert.epub"; do
    name=$(basename "$f"); name=${name%.*}
    echo "\$ konformitaet-bericht $f (ohne --trust) --json $OUT/berichte/$name-ohne-anker.json"
    bericht "$f" --json "$OUT/berichte/$name-ohne-anker.json" 2>&1 | grep -v '^NICHT GEPRÜFT'; echo "[Exit-Code ${PIPESTATUS[0]}]"; echo
    echo "\$ konformitaet-bericht $f --trust rsa-unterzeichner.pem --trust ec-gegenzeichner.pem --json $OUT/berichte/$name.json"
    bericht "$f" --trust "$P3/rsa-unterzeichner.pem" --trust "$P3/ec-gegenzeichner.pem" --json "$OUT/berichte/$name.json" 2>&1 | grep -v '^NICHT GEPRÜFT'; echo "[Exit-Code ${PIPESTATUS[0]}]"; echo
  done
  echo "## Schemaprüfung aller JSON-Berichte (python3, unabhängig vom Beispielprüfer: Pflichtfelder, Klassen, Stufen, Urteile)"
  echo
  python3 - "$OUT/berichte" <<'EOF'
import json, os, sys
d = sys.argv[1]
schema = json.load(open('docs/spezifikation/schema/konformitaetsbericht.schema.json'))
req = set(schema['required'])
ok = 0
for n in sorted(os.listdir(d)):
    r = json.load(open(os.path.join(d, n)))
    missing = req - set(r)
    classes = {f['class'] for f in r['results']}
    bad_class = classes - {'FATAL', 'ERROR', 'WARNING', 'INFO'}
    bad_verdict = set(r['levels']['verdict'].values()) - {'bestanden', 'nicht bestanden', 'unbestimmt'}
    bad_rule = [f['rule'] for f in r['results'] if not f['rule'].startswith('HPR-')]
    counts = {k: sum(1 for f in r['results'] if f['class'] == c) for k, c in (('fatal','FATAL'),('error','ERROR'),('warning','WARNING'),('info','INFO'))}
    sum_ok = all(r['summary'][k] == v for k, v in counts.items()) and r['summary']['notChecked'] == len(r['notChecked'])
    status = 'ok' if not missing and not bad_class and not bad_verdict and not bad_rule and sum_ok else 'FEHLER'
    ok += status == 'ok'
    print(f"{status:6} {n}: Befunde={len(r['results'])} nichtGeprüft={len(r['notChecked'])} Urteil={r['levels']['verdict']} fehlend={sorted(missing)} summeStimmt={sum_ok}")
print(f"{ok} von {len(os.listdir(d))} Berichten schemakonform")
EOF
} > "$OUT/05-befunde.txt" 2>&1

{
  echo "# S2 Gegenprobe: EPUB-Validator (HPR-CONT-024/028) und unabhängiger AdES-Validator (HPR-SIG-015/016)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "## Beispielprüfer mit EPUB-Validator: Beispielcontainer (erwartet: 0 Befunde aus HPR-CONT-024) und Container mit falschem mimetype (erwartet: PKG-007 als HPR-CONT-024)"
  echo
  for f in "$TMP/beispiel.hpro" "$TMP/mimetype-falsch.hpro" "$P3/signiert-2sig.epub"; do
    name=$(basename "$f"); name=${name%.*}
    echo "\$ konformitaet-bericht $f --epubcheck ... --java ... --json $OUT/berichte/$name-epubcheck.json"
    bericht "$f" --epubcheck "$EPUBCHECK" --java "$JAVA" --trust "$P3/rsa-unterzeichner.pem" --trust "$P3/ec-gegenzeichner.pem" --json "$OUT/berichte/$name-epubcheck.json" 2>&1 | grep -v '^NICHT GEPRÜFT'; echo "[Exit-Code ${PIPESTATUS[0]}]"; echo
  done
  echo "## Dieselben Dateien direkt mit dem EPUB-Validator (wörtlich)"
  echo
  cp "$TMP/beispiel.hpro" "$TMP/beispiel.epub"; cp "$TMP/mimetype-falsch.hpro" "$TMP/mimetype-falsch.epub"
  run "$JAVA" -jar "$EPUBCHECK" "$TMP/beispiel.epub"
  run "$JAVA" -jar "$EPUBCHECK" "$TMP/mimetype-falsch.epub"
  echo "## Signatururteile des unabhängigen AdES-Validators (DSS 6.5, html-Pro-Richtlinie) zu den Fällen aus 05-befunde.txt"
  echo
  run dss validate "$P3/signiert-2sig.epub" "$P3/rsa-unterzeichner.pem" docs/belege/P3/policy-hpro.xml
  run dss validate "$P3/manipuliert-rsa.epub" "$P3/rsa-unterzeichner.pem" docs/belege/P3/policy-hpro.xml
  run dss validate "$P3/teilsigniert-anhang-bearbeitet.epub" "$P3/rsa-unterzeichner.pem" docs/belege/P3/policy-hpro.xml
} > "$OUT/06-gegenprobe-epubcheck-dss.txt" 2>&1

{
  echo "# S2 Testlauf (npm test schließt beide Spezifikationsprüfungen und Selbsttests ein)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run npm ci --no-audit --no-fund
  run npm test
} > "$OUT/07-npm-test.txt" 2>&1

grep -E "^(OK|FAILED)" "$OUT/01-check-konformitaet.txt"
grep -E "^selftest" "$OUT/03-selftest.txt"
grep -E "Exit-Code|Kennungen eindeutig|ohne Pflichtfeld|ohne Begründung" "$OUT/04-regelkatalog-json.txt"
grep -E "^(FATAL|FEHLER|WARNUNG|HINWEIS|Stufe|Befunde|\[Exit)|Berichten schemakonform" "$OUT/05-befunde.txt" | sort | uniq -c | sort -rn | head -40
grep -E "Messages:|Indication|^(FEHLER|HINWEIS) HPR-(CONT-02[48]|SIG)" "$OUT/06-gegenprobe-epubcheck-dss.txt"
grep -E "^ℹ (tests|pass|fail)|^(OK|FAILED|selftest)|\[Exit-Code" "$OUT/07-npm-test.txt"
