#!/usr/bin/env bash
# Erzeugt die Belege für Paket P17 (Sperren, Rechte und eingefrorene Fassung) unter docs/belege/P17/.
#
#  00 Werkzeuge und Versionen
#  01 Kern-Tests kern/test/lock.test.ts (wörtlich)
#  02 Sperren im Manifest, Bearbeiter mit read-only, Druck-/Exportsicht
#  03 Versiegeln (Abnahme 2): Lecksuche, Öffnen mit jedem Schlüssel, Volltextsuche (Kern und unabhängig)
#  04 Gegenprobe JWE mit jwcrypto (unabhängige Implementierung)
#  05 Eingefrorene Fassung (Abnahme 1): signieren, prüfen (Kern und EU DSS 6.5), Hauptfassung
#     bearbeiten, eingefrorene Fassung manipulieren (zwei Arten)
#  06 Redaktion (Abnahme 3): Warnung, Löschen, Protokoll, Volltextsuche (Kern und unabhängig),
#     Konformitätsprüfer mit --redacted, neu eingefroren und signiert
#  07 epubcheck 5.4.0 über alle erzeugten Container
#  08 hpro-check (Konformitätsprüfer, Katalog 0.1) über alle erzeugten Container
#  09 Reader: Playwright-Tests e2e/sperren.spec.ts
#
# Voraussetzung: Node >= 22, JDK 21 und epubcheck 5.4.0 unter prototyp/tools/, das DSS-Werkzeug
# unter prototyp/dss/target/ (docs/05), jwcrypto in prototyp/.venv. Private Schlüssel bleiben unter
# prototyp/out/p17/ (nicht im Repo); die Zertifikate liegen in docs/belege/P17/container/.
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/P17
C=$OUT/container
K=prototyp/out/p17
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
PY=prototyp/.venv/bin/python
POLICY=$OUT/policy-hpro.xml
R=nachweis-2026-10-12
T='content/index.xhtml#bewertung'
mkdir -p "$C" "$K"
rm -f "$C"/*.hpro "$C"/*.pem "$C"/*.xhtml

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
hpro() { node kern/build/bin/hpro.js "$@"; }
dss() { "$JAVA" -Dorg.slf4j.simpleLogger.defaultLogLevel=warn -cp "prototyp/dss/target/classes:prototyp/dss/target/lib/*" example.hpro.HproDss "$@"; }
entry() { python3 -c "import sys,zipfile; sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode())" "$1" "$2"; }

[ -f prototyp/out/policy-hpro.xml ] || { echo "fehlt: prototyp/out/policy-hpro.xml (prototyp/run_experiment.sh ausführen)"; exit 2; }
cp prototyp/out/policy-hpro.xml "$POLICY"
npm run build -w kern --silent && npm run build:test -w kern --silent || exit 2

# Schlüssel (TEST): Signatur mit festem Gültigkeitsbeginn, zwei Empfänger für versiegelte Abschnitte.
printf 'Bauamt-Beispielort-2026!\n' > "$K/kennwort.txt"
printf 'falsches-Kennwort-123\n' > "$K/falsch.txt"
hpro keygen "$K/sig-key.pem" "$C/sig-cert.pem" --alg ec --cn "Bauamt Beispielort (Testsignatur)" --not-before 2026-10-01T00:00:00Z > "$K/keygen-sig.txt"
hpro keygen "$K/rsa-key.pem" "$C/rsa-empfaenger-cert.pem" --alg rsa --cn "Gemeindevorstand (Testempfänger)" --usage encryption --not-before 2026-10-01T00:00:00Z > "$K/keygen-rsa.txt"
hpro keygen "$K/ec-key.pem" "$C/ec-empfaenger-cert.pem" --alg ec --cn "Prüfstelle (Testempfänger)" --usage encryption --not-before 2026-10-01T00:00:00Z > "$K/keygen-ec.txt"
# Begriffe für die Volltextsuchen (Inhalt des Beispiels, liegt ohnehin in docs/spezifikation/beispiele/p17-sperren/).
printf '%s\n' 'Kalkulationsblatt K7' '3,1 Prozent unter den eigenen' 'Vollwärmeschutz' 'Bieter B minus 11,8 Prozent' 'Preisprüfung' > "$OUT/begriffe-versiegelt.txt"
printf '%s\n' 'Max Mustermann' 'AT61 1904 3002 3457 3201' '+43 512 123456' > "$OUT/begriffe-redaktion.txt"
printf 'Ansprechperson und Bewertung stehen in den Abschnitten oben.\n' > "$K/hinweis.txt"
printf 'Zuschlag an Bieter A nach Abschluss der vertieften Angebotsprüfung empfohlen.\n' > "$K/ergebnis.txt"
printf 'Bieter A 999.999,99\n' > "$K/angebot.txt"

{
  echo "# P17 Werkzeuge"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  run node --version
  run "$JAVA" -version
  run "$JAVA" -jar "$EPUBCHECK" --version
  echo "DSS-Version laut Maven-Abhängigkeiten:"
  ls prototyp/dss/target/lib | grep -E '^dss-(xades|asic-xades|validation|enumerations)-[0-9]'
  echo
  run "$PY" -c "from importlib.metadata import version; print('jwcrypto', version('jwcrypto'), '/ cryptography', version('cryptography'))"
  run python3 --version
  echo "Schlüssel (TEST, selbstsigniert; private Schlüssel unter $K, nicht im Repo):"
  cat "$K/keygen-sig.txt" "$K/keygen-rsa.txt" "$K/keygen-ec.txt"
} > "$OUT/00-werkzeuge.txt" 2>&1

{
  echo "# P17 Kern-Tests (kern/test/lock.test.ts)"
  echo
  run node --test kern/build/test/lock.test.js
} > "$OUT/01-kern-tests.txt" 2>&1

{
  echo "# P17 Sperren als Regeln im Manifest (HP-LOCK-001 … 005)"
  echo
  echo "## Beispiel bauen (docs/spezifikation/beispiele/p17-sperren/, Sperren aus dokument.json)"
  run node scripts/p17-beispiel.mjs "$C/01-vergabe.hpro"
  run hpro lock status "$C/01-vergabe.hpro"
  echo "## Bearbeiter: read-only wird abgelehnt, Datei unverändert (HP-LOCK-002, HPL-LOCK-001; Exit 4 = abgelehnt)"
  run hpro lock edit "$C/01-vergabe.hpro" "$K/nicht-geschrieben.hpro" --target 'content/index.xhtml#angebotsliste' --text-file "$K/angebot.txt" --time 2026-10-12T08:20:00Z
  run ls "$K/nicht-geschrieben.hpro"
  run sha256sum "$C/01-vergabe.hpro"
  echo "## Druck- und Exportsicht (HP-LOCK-003/004): ausgelassene Abschnitte und Hinweis"
  echo "\$ hpro lock view 01-vergabe.hpro --doc content/index.xhtml --purpose print > container/druckansicht.xhtml"
  hpro lock view "$C/01-vergabe.hpro" --doc content/index.xhtml --purpose print 2> "$K/view.err" > "$C/druckansicht.xhtml"; echo "[Exit-Code $?]"
  cat "$K/view.err"
  python3 -c "import re,sys; t=open(sys.argv[1]).read(); print('Kalkulation im Druck enthalten:', 'Kostenkennwert' in t); print('Interne Notiz im Druck enthalten:', 'Gemeindevorstand' in t); print('Hinweise:', re.findall(r'<p data-hp-role=\"lock-notice\">([^<]*)</p>', t))" "$C/druckansicht.xhtml"
  echo
  echo "\$ hpro lock view 01-vergabe.hpro --doc content/index.xhtml --purpose export > /dev/null"
  hpro lock view "$C/01-vergabe.hpro" --doc content/index.xhtml --purpose export 2>&1 >/dev/null; echo "[Exit-Code $?]"
  echo
  echo "## Ehrliche Grenze: hidden/no-print/no-export liegen als Text im Container (Volltextsuche findet sie)"
  printf '%s\n' 'Kostenkennwert 1.180' 'Rückfrage beim Gemeindevorstand' > "$K/regeln.txt"
  run hpro lock search "$C/01-vergabe.hpro" --terms-file "$K/regeln.txt"
} > "$OUT/02-sperren-regeln.txt" 2>&1

{
  echo "# P17 Abnahme 2: versiegelter Abschnitt im lebendigen Dokument nicht auslesbar"
  echo
  echo "## Vorher: der Abschnitt steht im Klartext im Container"
  run hpro lock search "$C/01-vergabe.hpro" --terms-file "$OUT/begriffe-versiegelt.txt"
  echo "## Lecksuche: der Verweistext in #anlagen wiederholt eine Überschrift des Abschnitts -> Versiegeln bricht ab"
  run hpro lock seal "$C/01-vergabe.hpro" "$K/nicht-geschrieben.hpro" --target "$T" --time 2026-10-12T09:00:00Z --password-file "$K/kennwort.txt"
  echo "## Verweistext ändern (bewusst mit --replace-markup), dann versiegeln für Kennwort, RSA- und EC-Empfänger"
  run hpro lock edit "$C/01-vergabe.hpro" "$C/02-vergabe-bearbeitet.hpro" --target 'content/index.xhtml#anlagen-hinweis' --text-file "$K/hinweis.txt" --time 2026-10-12T08:30:00Z --replace-markup
  run hpro lock seal "$C/02-vergabe-bearbeitet.hpro" "$C/03-versiegelt.hpro" --target "$T" --time 2026-10-12T09:00:00Z --password-file "$K/kennwort.txt" --recipient "$C/rsa-empfaenger-cert.pem" --recipient "$C/ec-empfaenger-cert.pem"
  run hpro lock status "$C/03-versiegelt.hpro"
  echo "## Platzhalter im Inhaltsdokument und Navigation"
  entry "$C/03-versiegelt.hpro" content/index.xhtml | grep -n 'id="bewertung"'
  entry "$C/03-versiegelt.hpro" content/nav.xhtml | grep -n 'bewertung\|preispruefung'
  echo
  echo "## Umschlag (JWE, General JSON Serialization; gekürzt)"
  entry "$C/03-versiegelt.hpro" data/sealed/index-bewertung.json | python3 -c "import json,sys; j=json.load(sys.stdin); [j.__setitem__(k, j[k][:24]+'…') for k in ('ciphertext','iv','tag')]; [r.__setitem__('encrypted_key', r['encrypted_key'][:24]+'…') for r in j['recipients']]; print(json.dumps(j, indent=2, ensure_ascii=False))"
  echo
  echo "## Nachher: Volltextsuche des Kerns (alle Einträge entpackt, Markup, JSON, ZIP roh)"
  run hpro lock search "$C/03-versiegelt.hpro" --terms-file "$OUT/begriffe-versiegelt.txt"
  echo "## Nachher: unabhängige Volltextsuche (Python zipfile, kein Kern-Code)"
  run python3 scripts/p17-zipscan.py "$C/03-versiegelt.hpro" "$OUT/begriffe-versiegelt.txt"
  echo "## Öffnen: ohne Schlüssel nicht, mit jedem Empfänger derselbe Inhalt (SHA-256)"
  run hpro lock open "$C/03-versiegelt.hpro" --target "$T" --password-file "$K/falsch.txt"
  run hpro lock open "$C/03-versiegelt.hpro" --target "$T" --key "$K/sig-key.pem" --cert "$C/sig-cert.pem"
  echo "\$ hpro lock open 03-versiegelt.hpro --target $T --password-file kennwort.txt | sha256sum"
  hpro lock open "$C/03-versiegelt.hpro" --target "$T" --password-file "$K/kennwort.txt" | sha256sum
  echo "\$ hpro lock open … --key rsa-key.pem --cert rsa-empfaenger-cert.pem | sha256sum"
  hpro lock open "$C/03-versiegelt.hpro" --target "$T" --key "$K/rsa-key.pem" --cert "$C/rsa-empfaenger-cert.pem" | sha256sum
  echo "\$ hpro lock open … --key ec-key.pem --cert ec-empfaenger-cert.pem | sha256sum"
  hpro lock open "$C/03-versiegelt.hpro" --target "$T" --key "$K/ec-key.pem" --cert "$C/ec-empfaenger-cert.pem" | sha256sum
  echo
  echo "## Geöffneter Abschnitt (Kennwort), erste Zeilen"
  hpro lock open "$C/03-versiegelt.hpro" --target "$T" --password-file "$K/kennwort.txt" | head -c 400 | sed 's/base64,[A-Za-z0-9+\/=]*/base64,…/'
  echo
} > "$OUT/03-versiegeln.txt" 2>&1

{
  echo "# P17 Gegenprobe JWE: jwcrypto öffnet den Umschlag aus dem Container"
  echo
  run "$PY" scripts/p17-jwe-gegenprobe.py "$C/03-versiegelt.hpro" data/sealed/index-bewertung.json --password-file "$K/kennwort.txt" --key "$K/rsa-key.pem" --key "$K/ec-key.pem"
  echo "## Kern zum Vergleich (SHA-256 des Klartexts)"
  hpro lock open "$C/03-versiegelt.hpro" --target "$T" --password-file "$K/kennwort.txt" | python3 -c "import sys,hashlib; b=sys.stdin.buffer.read(); print(len(b.rstrip(b'\n')), 'Bytes, sha256=' + hashlib.sha256(b.rstrip(b'\n')).hexdigest())"
  echo
  echo "## Grenze von jwcrypto: Vorgabe für PBES2-Iterationen"
  run "$PY" -c "import jwcrypto.jwa as j; print('default_max_pbkdf2_iterations =', j.default_max_pbkdf2_iterations)"
} > "$OUT/04-gegenprobe-jwe.txt" 2>&1

{
  echo "# P17 Abnahme 1: eingefrorene Fassung signiert, geprüft, Änderung als Manipulation erkannt"
  echo
  echo "## Einfrieren (Profil signed) und genau die Dateien der Fassung signieren"
  run hpro lock freeze "$C/03-versiegelt.hpro" "$C/04-nachweis.hpro" --id "$R" --time 2026-10-12T10:00:00Z --key "$K/sig-key.pem" --cert "$C/sig-cert.pem"
  run hpro lock frozen-check "$C/04-nachweis.hpro" --id "$R" --trust "$C/sig-cert.pem"
  run hpro validate "$C/04-nachweis.hpro" --trust "$C/sig-cert.pem"
  echo "## Sperren der Fassung sind von der Signatur gedeckt (HP-LOCK-006), die der Hauptfassung nicht"
  run hpro lock status "$C/04-nachweis.hpro" --rendition "$R" --trust "$C/sig-cert.pem"
  run hpro lock status "$C/04-nachweis.hpro" --trust "$C/sig-cert.pem"
  echo "## EU DSS 6.5 (Richtlinie hpro, Vertrauensanker sig-cert.pem)"
  run dss validate "$C/04-nachweis.hpro" "$C/sig-cert.pem" "$POLICY"
  echo "## Lebendige Fassung bearbeiten (HP-PROF-009): Signatur der eingefrorenen bleibt gültig"
  run hpro lock edit "$C/04-nachweis.hpro" "$C/05-nachweis-hauptfassung-bearbeitet.hpro" --target 'content/index.xhtml#ergebnis-text' --text-file "$K/ergebnis.txt" --time 2026-10-12T11:00:00Z
  run hpro lock frozen-check "$C/05-nachweis-hauptfassung-bearbeitet.hpro" --id "$R" --trust "$C/sig-cert.pem"
  run dss validate "$C/05-nachweis-hauptfassung-bearbeitet.hpro" "$C/sig-cert.pem" "$POLICY"
  echo "## Bearbeiter lehnt Änderungen an der eingefrorenen Fassung ab"
  run hpro lock edit "$C/05-nachweis-hauptfassung-bearbeitet.hpro" "$K/nicht-geschrieben.hpro" --target "renditions/$R/content/index.xhtml#ergebnis-text" --text-file "$K/ergebnis.txt" --time 2026-10-12T11:05:00Z
  echo "## Manipulation 1: Datei der eingefrorenen Fassung mit Python zipfile geändert (Angebotspreis)"
  python3 - "$C/05-nachweis-hauptfassung-bearbeitet.hpro" "$C/06-manipuliert-preis.hpro" "$R" <<'EOF'
import sys, zipfile
src, dst, r = sys.argv[1:4]
zin = zipfile.ZipFile(src); zout = zipfile.ZipFile(dst, 'w')
for i in zin.infolist():
    d = zin.read(i.filename)
    if i.filename == f'renditions/{r}/content/index.xhtml':
        d = d.replace('433.900,00 €'.encode(), '413.900,00 €'.encode()); print('geändert:', i.filename, '433.900,00 € -> 413.900,00 €')
    zout.writestr(i, d, compress_type=i.compress_type)
zout.close()
EOF
  run hpro lock frozen-check "$C/06-manipuliert-preis.hpro" --id "$R" --trust "$C/sig-cert.pem"
  run dss validate "$C/06-manipuliert-preis.hpro" "$C/sig-cert.pem" "$POLICY"
  echo "## Manipulation 2: zusätzlich den Hash im Fassungsmanifest nachgetragen (Hash-Manifest passt, Signatur nicht)"
  python3 - "$C/06-manipuliert-preis.hpro" "$C/07-manipuliert-preis-und-manifest.hpro" "$R" <<'EOF'
import base64, hashlib, json, sys, zipfile
src, dst, r = sys.argv[1:4]
zin = zipfile.ZipFile(src); zout = zipfile.ZipFile(dst, 'w')
f = f'renditions/{r}/content/index.xhtml'
h = 'sha256-' + base64.b64encode(hashlib.sha256(zin.read(f)).digest()).decode()
for i in zin.infolist():
    d = zin.read(i.filename)
    if i.filename == f'renditions/{r}/manifest.json':
        m = json.loads(d)
        for res in m['resources']:
            if res['url'] == f: res['integrity'] = h
        d = (json.dumps(m, indent=2, ensure_ascii=False) + '\n').encode(); print('Hash nachgetragen in', i.filename)
    zout.writestr(i, d, compress_type=i.compress_type)
zout.close()
EOF
  run hpro lock frozen-check "$C/07-manipuliert-preis-und-manifest.hpro" --id "$R" --trust "$C/sig-cert.pem"
  run dss validate "$C/07-manipuliert-preis-und-manifest.hpro" "$C/sig-cert.pem" "$POLICY"
} > "$OUT/05-eingefrorene-fassung.txt" 2>&1

{
  echo "# P17 Abnahme 3: Redaktion löscht nachweislich und führt ein Prüfprotokoll"
  echo
  echo "## Vorher: Personendaten in Text, Alternativtext, JSON, PNG-Metadaten, eingefrorener Fassung"
  run hpro lock search "$C/05-nachweis-hauptfassung-bearbeitet.hpro" --terms-file "$OUT/begriffe-redaktion.txt"
  echo "## Ohne Bestätigung: Warnung, weil eine signierte eingefrorene Fassung betroffen ist (Teil 1, 7.4; Exit 3)"
  run hpro lock redact "$C/05-nachweis-hauptfassung-bearbeitet.hpro" "$K/nicht-geschrieben.hpro" --time 2026-10-12T12:00:00Z --target 'content/index.xhtml#kontakt' --terms-file "$OUT/begriffe-redaktion.txt" --reason 'Personenbezogene Daten (DSGVO Art. 5 Abs. 1 lit. c)' --actor 'Bauamt Beispielort'
  echo "## Mit Bestätigung"
  run hpro lock redact "$C/05-nachweis-hauptfassung-bearbeitet.hpro" "$C/08-redigiert.hpro" --time 2026-10-12T12:00:00Z --target 'content/index.xhtml#kontakt' --terms-file "$OUT/begriffe-redaktion.txt" --reason 'Personenbezogene Daten (DSGVO Art. 5 Abs. 1 lit. c)' --actor 'Bauamt Beispielort' --confirm-remove-signed
  echo "## Nachher: Volltextsuche des Kerns"
  run hpro lock search "$C/08-redigiert.hpro" --terms-file "$OUT/begriffe-redaktion.txt"
  echo "## Nachher: unabhängige Volltextsuche (Python zipfile)"
  run python3 scripts/p17-zipscan.py "$C/08-redigiert.hpro" "$OUT/begriffe-redaktion.txt"
  echo "## Einträge vorher und nachher"
  python3 -c "import zipfile,sys; a=set(zipfile.ZipFile(sys.argv[1]).namelist()); b=set(zipfile.ZipFile(sys.argv[2]).namelist()); print('entfernt:', sorted(a-b)); print('neu:', sorted(b-a))" "$C/05-nachweis-hauptfassung-bearbeitet.hpro" "$C/08-redigiert.hpro"
  echo
  echo "## Prüfprotokoll data/redaction-log.json"
  entry "$C/08-redigiert.hpro" data/redaction-log.json
  echo
  echo "## Platzhalter und geschwärzte Daten"
  entry "$C/08-redigiert.hpro" content/index.xhtml | grep -n 'data-hp-redacted'
  entry "$C/08-redigiert.hpro" data/kontakt.json
  entry "$C/08-redigiert.hpro" content/nav.xhtml | grep -n 'kontakt'
  echo
  echo "## Verlauf im Manifest (nennt keinen Inhalt)"
  entry "$C/08-redigiert.hpro" manifest.json | python3 -c "import json,sys; [print(h) for h in json.load(sys.stdin)['history']]"
  echo
  echo "## Konformitätsprüfer mit den redigierten Begriffen (HPR-LOCK-002 … 005)"
  run node kern/build/bin/hpro-check.js "$C/08-redigiert.hpro" --no-epubcheck --redacted 'Max Mustermann' --redacted 'AT61 1904 3002 3457 3201' --redacted '+43 512 123456' --json "$K/check-redigiert.json"
  python3 -c "import json,sys; r=json.load(open(sys.argv[1])); f=[x for x in r['results'] if x['rule'].startswith('HPR-LOCK')]; print('HPR-LOCK-Befunde:', [(x['rule'], x['message']) for x in f]); print('nicht geprüft (LOCK):', [x for x in r.get('notChecked', []) if x['rule'].startswith('HPR-LOCK')])" "$K/check-redigiert.json"
  echo
  echo "## Neu einfrieren und signieren: der Nachweis enthält jetzt das Redaktionsprotokoll"
  run hpro lock freeze "$C/08-redigiert.hpro" "$C/09-redigiert-nachweis.hpro" --id nachweis-2026-10-12-redigiert --time 2026-10-12T12:30:00Z --key "$K/sig-key.pem" --cert "$C/sig-cert.pem"
  run hpro lock frozen-check "$C/09-redigiert-nachweis.hpro" --id nachweis-2026-10-12-redigiert --trust "$C/sig-cert.pem"
  run dss validate "$C/09-redigiert-nachweis.hpro" "$C/sig-cert.pem" "$POLICY"
  run python3 scripts/p17-zipscan.py "$C/09-redigiert-nachweis.hpro" "$OUT/begriffe-redaktion.txt"
} > "$OUT/06-redaktion.txt" 2>&1

{
  echo "# P17 epubcheck 5.4.0 über alle erzeugten Container"
  echo
  for f in "$C"/*.hpro; do
    cp "$f" "$K/check.epub"
    echo "## $(basename "$f")"
    run "$JAVA" -jar "$EPUBCHECK" "$K/check.epub"
  done
} > "$OUT/07-epubcheck.txt" 2>&1

{
  echo "# P17 hpro-check (Katalog Teil 1 v0.1) über die erzeugten Container"
  echo "# Erwartet: versiegelte Dokumente melden die Regel \"sealed\" (HPR-LOCK-001) und das Attribut"
  echo "# data-hp-sealed als nicht definiert, bis HPC-0007 entschieden ist."
  echo
  for f in 01-vergabe 03-versiegelt 04-nachweis 08-redigiert 09-redigiert-nachweis; do
    run node kern/build/bin/hpro-check.js "$C/$f.hpro" --no-epubcheck --no-not-checked --trust "$C/sig-cert.pem" --time 2026-10-12T13:00:00Z
  done
} > "$OUT/08-hpro-check.txt" 2>&1

{
  echo "# P17 Reader: Playwright-Tests e2e/sperren.spec.ts (Build mit sperren.hpro)"
  echo
  (cd app && run npx vite build --logLevel warn && PLAYWRIGHT_BROWSERS_PATH=$PWD/.browsers run npx playwright test --project=chromium e2e/sperren.spec.ts)
  echo "## Bildschirmfotos (docs/belege/P17/screenshots/)"
  (cd app && PLAYWRIGHT_BROWSERS_PATH=$PWD/.browsers run npx playwright test --project=belege e2e/p17-belege.spec.ts)
  ls docs/belege/P17/screenshots/
} > "$OUT/09-reader.txt" 2>&1

echo "Belege unter $OUT:"
ls -la "$OUT" "$C"
grep -H "Exit-Code" "$OUT"/0*.txt | sort | uniq -c | sort -rn | head -40
