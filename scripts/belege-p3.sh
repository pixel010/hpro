#!/usr/bin/env bash
# Erzeugt die Belege für Paket P3 (Signieren im Kern, eigener ZIP-Schreiber) unter docs/belege/P3/.
#
#  1. Testschlüssel und selbstsignierte Testzertifikate mit dem Kern (WebCrypto, kein OpenSSL,
#     kein Java); OpenSSL liest die Zertifikate nur zur unabhängigen Gegenprobe
#  2. Kern erzeugt den Beispielcontainer und signiert ihn (RSA 3072, EC P-256, Gegenzeichnung)
#  3. epubcheck 5.4.0 auf alle erzeugten Container (Abnahmekriterium 1)
#  4. EU DSS 6.5 (prototyp/dss) auf dieselben Container (Abnahmekriterium 2)
#  5. Manipulation mit einem fremden ZIP-Werkzeug (prototyp/zipedit.py, Python zipfile),
#     danach eigene Prüfung und DSS (Abnahmekriterium 3)
#  6. Messung der Signierdauer, npm ci && npm test
#
# Voraussetzung: prototyp/setup-tools.sh und prototyp/run_experiment.sh wurden ausgeführt
# (JDK 21, epubcheck, DSS-Werkzeug, Richtlinie prototyp/out/policy-hpro.xml), Node >= 22.
# Private Schlüssel bleiben unter prototyp/out/p3/ (nicht im Repo).
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/P3
C=$OUT/container
K=prototyp/out/p3
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
mkdir -p "$C" "$K"
rm -f "$C"/*.epub "$C"/*.pem

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
dss() { "$JAVA" -Dorg.slf4j.simpleLogger.defaultLogLevel=warn -cp "prototyp/dss/target/classes:prototyp/dss/target/lib/*" example.hpro.HproDss "$@"; }
hpro() { node kern/build/bin/hpro.js "$@"; }
listing() {
  python3 - "$1" <<'EOF'
import struct, sys, zipfile
p = sys.argv[1]
raw = open(p, 'rb').read()
z = zipfile.ZipFile(p)
print(f"{'offset':>6}  {'methode':<8} {'extra':>5}  name")
for i in z.infolist():
    extra = struct.unpack('<H', raw[i.header_offset + 28:i.header_offset + 30])[0]
    print(f"{i.header_offset:>6}  {'stored' if i.compress_type == 0 else 'deflated':<8} {extra:>5}  {i.filename}")
print('mimetype =', z.read('mimetype').decode())
EOF
}

[ -f prototyp/out/policy-hpro.xml ] || { echo "fehlt: prototyp/out/policy-hpro.xml (prototyp/run_experiment.sh ausführen)"; exit 2; }
cp prototyp/out/policy-hpro.xml "$OUT/policy-hpro.xml"
npm run build:test -w kern --silent || exit 2

{
  echo "# P3 Werkzeuge"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  run node --version
  run "$JAVA" -version
  run "$JAVA" -jar "$EPUBCHECK" --version
  echo "DSS-Version laut Maven-Abhängigkeiten:"
  ls prototyp/dss/target/lib | grep -E '^dss-(xades|asic-xades|validation|policy-jaxb)-[0-9]'
  echo
  run openssl version
  echo "Signierpfad ohne Prozessaufrufe und ohne Node-Module (Exit-Code 1 = kein Treffer):"
  run grep -nE "child_process|from 'node:|spawn\\(|execFile|execSync|require\\(" kern/src/sign.ts kern/src/softkey.ts kern/src/der-write.ts kern/src/c14n.ts kern/src/zip.ts
} > "$OUT/00-werkzeuge.txt" 2>&1

{
  echo "# P3 Testschlüssel und Testzertifikate (Kern, WebCrypto; nicht qualifiziert)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ). Jeder Lauf erzeugt neue Schlüssel."
  echo
  run hpro keygen $K/rsa.key.pem $C/rsa-unterzeichner.pem --alg rsa --cn "hpro Testunterzeichner RSA"
  run hpro keygen $K/ec.key.pem $C/ec-gegenzeichner.pem --alg ec --cn "hpro Gegenzeichner EC"
  echo "## Gegenprobe mit OpenSSL (nur Lesen und Prüfen, nicht Erzeugen)"
  echo
  for c in rsa-unterzeichner ec-gegenzeichner; do
    run openssl x509 -in $C/$c.pem -noout -subject -issuer -serial -dates -ext keyUsage,basicConstraints,subjectKeyIdentifier
    run openssl verify -CAfile $C/$c.pem -check_ss_sig $C/$c.pem
  done
  run openssl pkey -in $K/rsa.key.pem -noout -text_pub
} > "$OUT/01-schluessel.txt" 2>&1

{
  echo "# P3 Container erzeugen und signieren (Kern, ohne Java)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run hpro sample $C/unsigniert.epub
  run hpro sign $C/unsigniert.epub $C/signiert-rsa.epub --key $K/rsa.key.pem --cert $C/rsa-unterzeichner.pem
  run hpro sign $C/unsigniert.epub $C/signiert-ec.epub --key $K/ec.key.pem --cert $C/ec-gegenzeichner.pem
  run hpro sign $C/signiert-rsa.epub $C/signiert-2sig.epub --key $K/ec.key.pem --cert $C/ec-gegenzeichner.pem
  echo "## Teilsignatur (docs/10, Zusage 5): content/anhang.xhtml bleibt unsigniert ('lebendig')"
  echo
  run hpro sign $C/unsigniert.epub $C/teilsigniert.epub --key $K/rsa.key.pem --cert $C/rsa-unterzeichner.pem \
    --only content/index.xhtml --only content/nav.xhtml --only content/media/lieferplan.svg --only content/styles/document.css --only manifest.json --only package.opf
  echo "## ZIP-Aufbau, unabhängig gelesen mit Python zipfile"
  echo
  for f in signiert-rsa signiert-2sig; do
    run listing $C/$f.epub
  done
  run hpro inspect $C/signiert-rsa.epub
  echo "## META-INF/signatures.xml von signiert-rsa.epub (wörtlich)"
  echo
  python3 -c "import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read('META-INF/signatures.xml').decode())" $C/signiert-rsa.epub
  echo
  echo "## META-INF/manifest.xml von signiert-rsa.epub (wörtlich)"
  echo
  python3 -c "import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read('META-INF/manifest.xml').decode())" $C/signiert-rsa.epub
} > "$OUT/02-signieren.txt" 2>&1

# Manipulation mit einem fremden ZIP-Werkzeug (Python), nicht mit dem eigenen Schreiber
python3 prototyp/zipedit.py replace $C/signiert-rsa.epub $C/manipuliert-rsa.epub content/index.xhtml "1.200,00 EUR</strong>" "9.200,00 EUR</strong>" > /dev/null
python3 prototyp/zipedit.py replace $C/teilsigniert.epub $C/teilsigniert-anhang-bearbeitet.epub content/anhang.xhtml "</body>" "<p>Nachtrag in der lebendigen Fassung</p></body>" > /dev/null
python3 prototyp/zipedit.py replace $C/signiert-2sig.epub $C/manipuliert-2sig.epub content/index.xhtml "1.200,00 EUR</strong>" "9.200,00 EUR</strong>" > /dev/null

{
  echo "# P3 epubcheck 5.4.0 (Abnahmekriterium 1)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  for f in unsigniert signiert-rsa signiert-ec signiert-2sig teilsigniert manipuliert-rsa; do
    run "$JAVA" -jar "$EPUBCHECK" $C/$f.epub
  done
} > "$OUT/03-epubcheck.txt" 2>&1

{
  echo "# P3 EU DSS 6.5 (Abnahmekriterium 2)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Das DSS-Werkzeug nimmt genau einen Vertrauensanker; bei zwei Signaturen wird je Anker einmal geprüft."
  echo
  echo "## DSS-Standardrichtlinie"
  echo
  run dss validate $C/signiert-rsa.epub $C/rsa-unterzeichner.pem
  run dss validate $C/signiert-ec.epub $C/ec-gegenzeichner.pem
  run dss validate $C/signiert-2sig.epub $C/rsa-unterzeichner.pem
  run dss validate $C/signiert-2sig.epub $C/ec-gegenzeichner.pem
  echo "## hpro-Richtlinie (application/epub+zip als mimetype zulässig, docs/05 Fall V3)"
  echo
  run dss validate $C/signiert-rsa.epub $C/rsa-unterzeichner.pem $OUT/policy-hpro.xml
  run dss validate $C/signiert-ec.epub $C/ec-gegenzeichner.pem $OUT/policy-hpro.xml
  echo "## Teilsignatur: unverändert und nach Bearbeiten der unsignierten Datei content/anhang.xhtml"
  echo
  run dss validate $C/teilsigniert.epub $C/rsa-unterzeichner.pem $OUT/policy-hpro.xml
  run dss validate $C/teilsigniert-anhang-bearbeitet.epub $C/rsa-unterzeichner.pem $OUT/policy-hpro.xml
} > "$OUT/04-dss.txt" 2>&1

{
  echo "# P3 Manipulation nach dem Signieren (Abnahmekriterium 3)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Änderung mit prototyp/zipedit.py (Python zipfile): content/index.xhtml 1.200,00 EUR -> 9.200,00 EUR"
  echo
  run python3 prototyp/zipedit.py replace $C/signiert-rsa.epub $OUT/tmp-check.epub content/index.xhtml "1.200,00 EUR</strong>" "9.200,00 EUR</strong>"
  run cmp $OUT/tmp-check.epub $C/manipuliert-rsa.epub
  rm -f $OUT/tmp-check.epub
  echo "## Eigene Prüfung (TypeScript-Kern)"
  echo
  run hpro validate $C/manipuliert-rsa.epub --trust $C/rsa-unterzeichner.pem
  run hpro validate $C/manipuliert-2sig.epub --trust $C/rsa-unterzeichner.pem --trust $C/ec-gegenzeichner.pem
  echo "## EU DSS 6.5"
  echo
  run dss validate $C/manipuliert-rsa.epub $C/rsa-unterzeichner.pem
  run dss validate $C/manipuliert-2sig.epub $C/ec-gegenzeichner.pem
} > "$OUT/05-manipulation.txt" 2>&1

{
  echo "# P3 Eigene Prüfung der unveränderten Container (TypeScript-Kern)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run hpro validate $C/signiert-rsa.epub --trust $C/rsa-unterzeichner.pem
  run hpro validate $C/signiert-ec.epub --trust $C/ec-gegenzeichner.pem --policy dss-default
  run hpro validate $C/signiert-2sig.epub --trust $C/rsa-unterzeichner.pem --trust $C/ec-gegenzeichner.pem
  echo "## Teilsignatur nach Bearbeiten der unsignierten Datei (Signatur gültig; Hash-Manifest meldet die Änderung)"
  echo
  run hpro validate $C/teilsigniert-anhang-bearbeitet.epub --trust $C/rsa-unterzeichner.pem
  run hpro inspect $C/teilsigniert-anhang-bearbeitet.epub
} > "$OUT/06-eigene-pruefung.txt" 2>&1

run node scripts/p3-messung.mjs $C/unsigniert.epub $K/rsa.key.pem $C/rsa-unterzeichner.pem $K/ec.key.pem $C/ec-gegenzeichner.pem > "$OUT/07-messung.txt" 2>&1

{
  echo "# P3 Testlauf"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run npm ci --no-audit --no-fund
  run npm test
} > "$OUT/08-npm-test.txt" 2>&1

{
  echo "# P3 Kein privater Schlüssel unter docs/belege/P3 (Exit-Code 1 = kein Treffer)"
  echo
  run grep -rl --exclude=09-kein-privater-schluessel.txt "PRIVATE KEY" $OUT
} > "$OUT/09-kein-privater-schluessel.txt" 2>&1

grep -E "Messages:" "$OUT/03-epubcheck.txt"
grep -E "^\\\$ dss|Indication" "$OUT/04-dss.txt" "$OUT/05-manipulation.txt"
grep -E "^indication" "$OUT/05-manipulation.txt" "$OUT/06-eigene-pruefung.txt"
cat "$OUT/07-messung.txt"
grep -E "^ℹ (tests|pass|fail|skipped)" "$OUT/08-npm-test.txt"
