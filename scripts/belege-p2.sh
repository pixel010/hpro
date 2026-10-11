#!/usr/bin/env bash
# Erzeugt die Belege für Paket P2 (Signaturprüfung ohne Java) unter docs/belege/P2/.
#
#  1. Testschlüssel für neue Fälle (EC P-256, Test-CA mit Unterzeichner, fremdes Zertifikat)
#  2. DSS 6.5 signiert die neuen Fälle N1–N3 (prototyp/dss)
#  3. scripts/p2-faelle.mjs leitet die Manipulationsfälle ab und schreibt faelle.json
#  4. jeder Fall wird mit DSS (Java) und mit dem TypeScript-Kern geprüft, wörtliche Ausgaben
#     unter dss/ und ts/
#  5. scripts/p2-vergleich.mjs stellt beide Urteile gegenüber -> vergleich-dss.json
#  6. npm test (inkl. der P2-Tests) mit wörtlicher Ausgabe
#
# Voraussetzung: prototyp/setup-tools.sh und prototyp/run_experiment.sh wurden ausgeführt
# (JDK 21, DSS-Werkzeug, Richtlinien unter prototyp/out/), Node >= 22, openssl.
# Private Schlüssel bleiben unter prototyp/out/p2/ (nicht im Repo).
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/P2
F=$OUT/faelle
K=prototyp/out/p2
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
mkdir -p "$F" "$K" "$OUT/dss" "$OUT/ts"

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
dss() { "$JAVA" -Dorg.slf4j.simpleLogger.defaultLogLevel=warn -cp "prototyp/dss/target/classes:prototyp/dss/target/lib/*" example.htmlpro.HproDss "$@"; }
hpro() { node kern/build/bin/hpro.js "$@"; }

for f in prototyp/out/policy-hpro.xml prototyp/out/policy-streng.xml prototyp/out/keys/signer.pem; do
  [ -f "$f" ] || { echo "fehlt: $f (prototyp/run_experiment.sh ausführen)"; exit 2; }
done
cp prototyp/out/policy-hpro.xml "$OUT/policy-hpro.xml"
cp prototyp/out/policy-streng.xml "$OUT/policy-streng.xml"

npm run build:test -w kern --silent || exit 2

{
  echo "# P2 Werkzeuge und Testschlüssel"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  run node --version
  run "$JAVA" -version
  run openssl version
  echo "DSS-Version laut Maven-Abhängigkeiten:"
  ls prototyp/dss/target/lib | grep -E '^dss-(xades|cades|asic-xades|validation|policy-jaxb)-[0-9]'
  echo

  # Testschlüssel (nicht qualifiziert). Jeder Lauf erzeugt neue Schlüssel und Signaturen.
  run openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout $K/ec.key -out $F/ec-p256.pem -days 3650 \
    -subj "/C=AT/O=html-Pro Prototyp/CN=Testunterzeichner EC P-256" \
    -addext "keyUsage=critical,digitalSignature,nonRepudiation" -addext "basicConstraints=critical,CA:FALSE"
  run openssl pkcs12 -export -inkey $K/ec.key -in $F/ec-p256.pem -out $K/ec.p12 -passout pass:test -name signer

  run openssl req -x509 -newkey rsa:3072 -nodes -keyout $K/ca.key -out $F/test-ca.pem -days 3650 \
    -subj "/C=AT/O=html-Pro Prototyp/CN=html-Pro Test-CA" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" -addext "basicConstraints=critical,CA:TRUE" -addext "subjectKeyIdentifier=hash"
  run openssl req -new -newkey rsa:3072 -nodes -keyout $K/leaf.key -out $K/leaf.csr -subj "/C=AT/O=html-Pro Prototyp/CN=Testunterzeichner unter Test-CA"
  printf 'keyUsage=critical,digitalSignature,nonRepudiation\nbasicConstraints=critical,CA:FALSE\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n' > $K/leaf.ext
  run openssl x509 -req -in $K/leaf.csr -CA $F/test-ca.pem -CAkey $K/ca.key -CAcreateserial -out $F/ca-unterzeichner.pem -days 3650 -extfile $K/leaf.ext
  run openssl pkcs12 -export -inkey $K/leaf.key -in $F/ca-unterzeichner.pem -certfile $F/test-ca.pem -out $K/leaf.p12 -passout pass:test -name signer

  run openssl req -x509 -newkey rsa:3072 -nodes -keyout $K/fremd.key -out $F/fremd.pem -days 3650 \
    -subj "/C=AT/O=Fremde Stelle/CN=Fremdes Zertifikat (nicht der Unterzeichner)"

  # Inhalt der Basis (ohne mimetype) für DSS sign-files
  rm -rf $K/inhalt
  run python3 -c "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);[z.extract(n,sys.argv[2]) for n in z.namelist() if n!='mimetype']" \
    prototyp/ergebnisse/container/basis.epub $K/inhalt
  run dss sign-files $K/inhalt $K/n1.asice xades $K/ec.p12 test
  run python3 prototyp/zipedit.py set-mimetype $K/n1.asice $F/N1-ec-p256.epub application/epub+zip
  run dss sign-files $K/inhalt $K/n2.asice xades $K/leaf.p12 test
  run python3 prototyp/zipedit.py set-mimetype $K/n2.asice $F/N2-ca-kette.epub application/epub+zip
  run cp $F/N2-ca-kette.epub $F/N3-ca-kette-anker-ist-unterzeichner.epub
} > "$OUT/00-werkzeuge-und-schluessel.txt" 2>&1

run node scripts/p2-faelle.mjs > "$OUT/01-faelle-erzeugen.txt" 2>&1

# Jeder Fall: DSS und TypeScript-Kern, Laufzeit in Millisekunden (Wanduhr, inkl. Prozessstart)
policy_file() { case "$1" in html-pro) echo "$OUT/policy-hpro.xml";; strict) echo "$OUT/policy-streng.xml";; *) echo "";; esac; }
ms() { date +%s%3N; }
node -e 'for (const f of require("./docs/belege/P2/faelle.json")) console.log([f.id, f.container, f.trust, f.policy].join("\t"))' |
while IFS=$'\t' read -r id container trust policy; do
  pf=$(policy_file "$policy")
  t0=$(ms)
  { echo "\$ dss validate $container $trust $pf"; dss validate "$container" "$trust" $pf 2>&1; echo "[Exit-Code $?]"; } > "$OUT/dss/$id.txt"
  t1=$(ms)
  hpro validate "$container" --trust "$trust" --policy "$policy" --json > "$OUT/ts/$id.json" 2> "$OUT/ts/$id.stderr"
  code=$?
  t2=$(ms)
  [ -s "$OUT/ts/$id.stderr" ] || rm -f "$OUT/ts/$id.stderr"
  printf '%s\t%s\t%s\t%s\n' "$id" "$((t1 - t0))" "$((t2 - t1))" "$code"
done > "$OUT/laufzeiten.tsv"

run node scripts/p2-vergleich.mjs > "$OUT/02-vergleich.txt" 2>&1

{
  echo "# P2 Testlauf"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run npm ci --no-audit --no-fund
  run npm test
} > "$OUT/03-npm-test.txt" 2>&1

tail -n 30 "$OUT/02-vergleich.txt"
grep -E "^# (tests|pass|fail|skipped)" "$OUT/03-npm-test.txt"
