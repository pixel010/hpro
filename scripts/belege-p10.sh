#!/usr/bin/env bash
# Erzeugt die Belege für Paket P10 (Fernsignatur über CSC, Zeitstempel nach RFC 3161) unter
# docs/belege/P10/.
#
#  1. Werkzeuge, Quellen (CSC-Spezifikation 2.2.0.0 und 2.0.0.2 mit SHA-256)
#  2. Kriterium 1: Signatur über den Mock-Fernsignaturdienst (CSC API v2, HTTP auf 127.0.0.1),
#     Prüfung im Kern; Negativfälle; was der Dienst zu sehen bekommt
#  3. Kommandozeile `hpro csc sign` gegen denselben Mock (PIN und OTP über stdin)
#  4. Kriterium 2: vier öffentliche RFC-3161-Dienste (FreeTSA, DigiCert, DFN, Sectigo qualifiziert),
#     Prüfung im Kern mit veröffentlichter Wurzel und Sperrlisten; Gegenprobe OpenSSL `ts -verify`;
#     Signatur B-T mit öffentlichem Zeitstempel
#  5. epubcheck 5.4.0 auf alle signierten Container
#  6. EU DSS 6.5 (prototyp/dss, Befehl validate-ts) auf dieselben Container
#  7. Messungen, npm ci && npm test
#
# Netz: Schritte 4 und 7 (Messung) sprechen öffentliche Dienste an; gesendet wird nur ein
# SHA-256-Hash. Der Mock-Dienst läuft nur während der Schritte 2, 3 und 7 und wird beendet.
# Voraussetzung: prototyp/setup-tools.sh (JDK, epubcheck, DSS-Werkzeug), Node >= 22.
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/P10
C=$OUT/container
R=prototyp/out/p10/run
Q=prototyp/out/p10/quellen
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
POLICY=docs/belege/P3/policy-hpro.xml
mkdir -p "$OUT" "$C" "$Q"
rm -rf "$R" "$C"/*

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
dss() { "$JAVA" -Dorg.slf4j.simpleLogger.defaultLogLevel=warn -cp "prototyp/dss/target/classes:prototyp/dss/target/lib/*" example.hpro.HproDss "$@"; }
hpro() { node kern/build/bin/hpro.js "$@"; }
stamp() { echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"; echo; }

npm run build -w kern --silent || exit 2
npm run build:test -w kern --silent || exit 2
(cd prototyp/dss && JAVA_HOME="$PWD/../tools/jdk-21.0.12.1+1" ../tools/apache-maven-3.9.16/bin/mvn -o -q -B -Dmaven.repo.local="$PWD/../tools/m2" package -DskipTests) || exit 2

# --- 1 ---------------------------------------------------------------------------------
for u in https://cloudsignatureconsortium.org/wp-content/uploads/2025/11/csc-api.pdf https://cloudsignatureconsortium.org/wp-content/uploads/2023/04/csc-api-v2.0.0.2.pdf; do
  [ -f "$Q/$(basename "$u")" ] || curl -fsSL -m 120 -o "$Q/$(basename "$u")" "$u"
done
{
  echo "# P10 Werkzeuge und Quellen"
  stamp
  run node --version
  run "$JAVA" -version
  run "$JAVA" -jar "$EPUBCHECK" --version
  echo "DSS-Version laut Maven-Abhängigkeiten:"
  ls prototyp/dss/target/lib | grep -E '^dss-(xades|asic-xades|validation|spi)-[0-9]'
  echo
  run openssl version
  echo "CSC-Spezifikation (nicht eingecheckt, nur Prüfsumme; Version laut Titelblatt):"
  for f in "$Q"/csc-api.pdf "$Q"/csc-api-v2.0.0.2.pdf; do
    sha256sum "$f"
    prototyp/.venv/bin/python -c "import pypdf,sys; r=pypdf.PdfReader(sys.argv[1]); t=r.pages[0].extract_text(); print('  Seiten', len(r.pages), '|', ' '.join(t.split())[:120])" "$f"
  done
  echo
  echo "Kernmodule ohne Node-APIs (nur fetch, WebCrypto; Exit-Code 1 = kein Treffer):"
  run grep -nE "child_process|from 'node:|require\\(" kern/src/tsp.ts kern/src/csc.ts kern/src/crl.ts kern/src/sign.ts
} > "$OUT/00-werkzeuge.txt" 2>&1

# --- 2 ---------------------------------------------------------------------------------
{
  echo "# P10 Kriterium 1: Signatur über den Mock-Fernsignaturdienst, Prüfung im Kern"
  stamp
  run node scripts/p10-belege.mjs mock
} > "$OUT/01-mock-csc.txt" 2>&1

# --- 3 ---------------------------------------------------------------------------------
{
  echo "# P10 Kommandozeile: hpro csc info|keys|sign gegen den Mock-Dienst"
  stamp
  run node scripts/p10-csc-cli.mjs $R/unsigniert.epub $R/cli-csc-ec-bt.epub
  run hpro validate $R/cli-csc-ec-bt.epub --trust $R/cli-csc-ec-bt-root.pem --crl $R/cli-csc-ec-bt-root.crl
  echo "## Erweiterung B -> T einer vorhandenen Signatur mit hpro timestamp (FreeTSA)"
  echo
  run hpro timestamp $R/csc-rsa.epub $R/csc-rsa-nachtraeglich-bt.epub --tsa https://freetsa.org/tsr --trust $R/mock-signer-rsa.pem
  run hpro validate $R/csc-rsa-nachtraeglich-bt.epub --trust $R/mock-root.pem --crl $R/crl/mock-root.crl --trust kern/test/fixtures/tsp/freetsa-root.pem --fetch-crls
} > "$OUT/02-csc-kommandozeile.txt" 2>&1

# --- 4 ---------------------------------------------------------------------------------
{
  echo "# P10 Kriterium 2: Zeitstempel gegen öffentliche RFC-3161-Dienste"
  stamp
  run node scripts/p10-belege.mjs public
  echo "## Unabhängige Gegenprobe mit OpenSSL (ts -verify gegen die veröffentlichte Wurzel)"
  echo
  for n in freetsa digicert dfn sectigo-q; do
    run openssl ts -reply -in $R/tsa/$n.tsr -text
    run openssl ts -verify -in $R/tsa/$n.tsr -queryfile $R/tsa/$n.tsq -CAfile $R/tsa/$n-root.pem
    run openssl ts -verify -in $R/tsa/$n.tsr -data $R/unsigniert.epub -CAfile $R/tsa/$n-root.pem
  done
  echo "## Gegenprobe: OpenSSL mit anderen Daten (muss scheitern)"
  echo
  run openssl ts -verify -in $R/tsa/freetsa.tsr -data $R/csc-rsa.epub -CAfile $R/tsa/freetsa-root.pem
  echo "## Kommandozeile hpro tsp request / verify (FreeTSA, CRLs online geholt)"
  echo
  run hpro tsp request $R/unsigniert.epub $R/tsa/cli-freetsa.tsr --tsa https://freetsa.org/tsr
  run hpro tsp verify $R/tsa/cli-freetsa.tsr --data $R/unsigniert.epub --trust $R/tsa/freetsa-root.pem --fetch-crls
  run hpro tsp verify $R/tsa/cli-freetsa.tsr --data $R/unsigniert.epub
} > "$OUT/03-oeffentliche-tsa.txt" 2>&1

# --- 5 ---------------------------------------------------------------------------------
{
  echo "# P10 epubcheck 5.4.0 auf alle signierten Container"
  stamp
  for f in $R/*.epub; do run "$JAVA" -jar "$EPUBCHECK" "$f"; done
} > "$OUT/04-epubcheck.txt" 2>&1

# --- 6 ---------------------------------------------------------------------------------
{
  echo "# P10 EU DSS 6.5: dieselben Container (validate-ts: mehrere Anker, Sperrlisten offline, Zeitstempel)"
  stamp
  echo "## Fernsignatur über den Mock (B), Anker = Signaturzertifikat"
  run dss validate-ts $R/csc-rsa.epub $POLICY $R/mock-signer-rsa.pem
  run dss validate-ts $R/csc-ec.epub $POLICY $R/mock-signer-ec.pem
  echo "## Anker = Test-Wurzel ohne Sperrliste (Kern: INDETERMINATE/CERTIFICATE_CHAIN_GENERAL_FAILURE)"
  run dss validate-ts $R/csc-ec.epub $POLICY $R/mock-root.pem
  echo "## Anker = Test-Wurzel mit Sperrliste (Kern: TOTAL_PASSED)"
  run dss validate-ts $R/csc-rsa.epub $POLICY $R/mock-root.pem $R/crl/mock-root.crl
  run dss validate-ts $R/csc-ec.epub $POLICY $R/mock-root.pem $R/crl/mock-root.crl
  echo "## Sperrliste mit gesperrtem EC-Zertifikat (Kern: INDETERMINATE/REVOKED_NO_POE)"
  run dss validate-ts $R/csc-ec.epub $POLICY $R/mock-root.pem $R/crl-revoked/mock-root-ec-gesperrt.crl
  echo "## Manipulation nach dem Signieren (Kern: TOTAL_FAILED/HASH_FAILURE)"
  run dss validate-ts $R/csc-ec-manipuliert.epub $POLICY $R/mock-root.pem $R/crl/mock-root.crl
  echo "## B-T mit Mock-TSA (Kern: TOTAL_PASSED, Zeitstempel PASSED)"
  run dss validate-ts $R/csc-ec-bt-mocktsa.epub $POLICY $R/mock-root.pem $R/crl/mock-root.crl
  echo "## B-T mit öffentlichem Zeitstempel (Kern: TOTAL_PASSED, Zeitstempel PASSED)"
  run dss validate-ts $R/csc-ec-bt-freetsa.epub $POLICY $R/bt-mock-root.pem $R/tsa/freetsa-root.pem $R/crl/bt-mock-root.crl $R/crl/freetsa-*.crl
  run dss validate-ts $R/csc-ec-bt-sectigo-q.epub $POLICY $R/bt-mock-root.pem $R/tsa/sectigo-q-root.pem $R/crl/bt-mock-root.crl $R/crl/sectigo-q-*.crl
  echo "## Zeitstempel einer anderen Signatur eingesetzt (Kern: Signatur TOTAL_PASSED, Zeitstempel FAILED/HASH_FAILURE)"
  run dss validate-ts $R/csc-ec-bt-freetsa-zeitstempel-getauscht.epub $POLICY $R/bt-mock-root.pem $R/tsa/freetsa-root.pem $R/crl/bt-mock-root.crl $R/crl/freetsa-*.crl
  echo "## Nachträglich mit hpro timestamp auf B-T erweitert (FreeTSA)"
  run dss validate-ts $R/csc-rsa-nachtraeglich-bt.epub $POLICY $R/mock-root.pem $R/tsa/freetsa-root.pem $R/crl/mock-root.crl $R/crl/freetsa-*.crl
  echo "## Über die Kommandozeile signiert (B-T, Mock-TSA)"
  run dss validate-ts $R/cli-csc-ec-bt.epub $POLICY $R/cli-csc-ec-bt-root.pem $R/cli-csc-ec-bt-root.crl
} > "$OUT/05-dss.txt" 2>&1

# --- 7 ---------------------------------------------------------------------------------
{
  echo "# P10 Messungen"
  stamp
  echo "Takt: $(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq 2>/dev/null || echo unbekannt) kHz max, no_turbo=$(cat /sys/devices/system/cpu/intel_pstate/no_turbo 2>/dev/null || echo unbekannt)"
  echo
  run node scripts/p10-belege.mjs measure
} > "$OUT/06-messung.txt" 2>&1

# Öffentliche Ergebnisse und Container für die Nachprüfung (keine privaten Schlüssel).
cp $R/*.epub $R/*.pem $C/ 2>/dev/null
cp $R/cli-csc-ec-bt-root.crl $C/
mkdir -p $C/tsa $C/crl
cp $R/tsa/* $C/tsa/
cp $R/crl/* $R/crl-revoked/* $C/crl/

{
  echo "# P10 Testlauf"
  stamp
  run npm ci --no-audit --no-fund
  run npm test
} > "$OUT/07-npm-test.txt" 2>&1

{
  echo "# P10 Kein privater Schlüssel und kein Zugangsgeheimnis unter docs/belege/P10 (Exit-Code 1 = kein Treffer)"
  echo
  run grep -rlE --exclude=08-kein-geheimnis.txt "PRIVATE KEY|\"SAD\":\"[A-Za-z0-9_-]{20,}|access_token\":\"[A-Za-z0-9_-]{20,}" $OUT
  echo "Laufende Mock-Server nach dem Lauf (Exit-Code 1 = keiner):"
  run pgrep -af "p10-belege|p10-csc-cli"
} > "$OUT/08-kein-geheimnis.txt" 2>&1

grep -E "^\s+\[.*\] .*(TOTAL_|INDETERMINATE)" "$OUT/01-mock-csc.txt" | head -20
grep -E "Kern: |Gegenprobe" "$OUT/03-oeffentliche-tsa.txt"
grep -cE "Verification: OK" "$OUT/03-oeffentliche-tsa.txt"
grep -E "Messages:" "$OUT/04-epubcheck.txt"
grep -E "^\\\$ dss|^Indication|^Format|    Indication" "$OUT/05-dss.txt"
grep -E "median" "$OUT/06-messung.txt"
grep -E "^ℹ (tests|pass|fail|skipped)" "$OUT/07-npm-test.txt"
