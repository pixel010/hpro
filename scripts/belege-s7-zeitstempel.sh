#!/usr/bin/env bash
# Ergänzung zu scripts/belege-s7.sh: der Signaturweg mit Zeitstempel (Handbuch Kapitel 8.7).
# Signiert das Beispiel s7-bericht-signierbar.hpro auf Niveau XAdES-BASELINE-T mit einem öffentlichen
# RFC-3161-Dienst (FreeTSA, wie in docs/13), prüft mit dem Kern, dem Konformitätsprüfer und EU DSS 6.5.
# Braucht Netz (FreeTSA); ohne Netz endet der Lauf mit Exit-Code ≠ 0 im Beleg, nicht mit einem Ersatzwert.
# Ausgabe: docs/belege/S7/12-zeitstempel.txt; Container unter docs/belege/S7/container/.
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/S7
C=$OUT/container
TMP=prototyp/out/s7
KEYS=$TMP/keys
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
POLICY=docs/belege/P3/policy-hpro.xml
TSA=https://freetsa.org/tsr
TSA_ROOT=kern/test/fixtures/tsp/freetsa-root.pem
TSA_CRL_URL=https://www.freetsa.org/crl/root_ca.crl
mkdir -p "$TMP" "$C"

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
hpro() { node kern/build/bin/hpro.js "$@"; }
check() { node kern/build/bin/hpro-check.js "$@"; }
dss() { "$JAVA" -Dorg.slf4j.simpleLogger.defaultLogLevel=warn -cp "prototyp/dss/target/classes:prototyp/dss/target/lib/*" example.hpro.HproDss "$@"; }

if [ ! -f "$KEYS/unterzeichner.key.pem" ]; then
  echo "Schlüssel fehlt: zuerst scripts/belege-s7.sh ausführen" >&2; exit 2
fi
[ -f kern/build/bin/hpro.js ] || npm run -s build:test -w kern || exit 2

{
  echo "# S7 Signieren mit Zeitstempel (Handbuch Kapitel 8.7): XAdES-BASELINE-T über einen öffentlichen RFC-3161-Dienst"
  echo "# TSA $TSA, Anker der TSA $TSA_ROOT; Unterzeichner wie in 04-signieren.txt (selbstsigniert, nicht qualifiziert)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  echo "## Signieren mit --tsa: Signatur und Zeitstempel in einem Schritt (HP-SIG-010)"
  echo
  run hpro sign "$C/s7-bericht-signierbar.hpro" "$C/s7-signiert-bt.hpro" --key "$KEYS/unterzeichner.key.pem" --cert "$C/unterzeichner.pem" --id sig-unterzeichner --tsa "$TSA"
  echo "## Prüfen mit dem Kern: Anker für Unterzeichner und TSA, Sperrlisten der TSA-Kette online"
  echo
  run hpro validate "$C/s7-signiert-bt.hpro" --trust "$C/unterzeichner.pem" --trust "$TSA_ROOT" --fetch-crls
  echo "## Ohne Anker der TSA: Signatur bestätigt, Zeitstempel nicht vertrauenswürdig"
  echo
  run hpro validate "$C/s7-signiert-bt.hpro" --trust "$C/unterzeichner.pem"
  echo "## Konformitätsprüfer: die Warnung HPR-SIG-012 (kein Zeitstempel) entfällt"
  echo
  run check "$C/s7-signiert-bt.hpro" --no-epubcheck --trust "$C/unterzeichner.pem" --trust "$TSA_ROOT"
  echo "## Gegenprobe EU DSS 6.5 (validate-ts, Sperrliste der FreeTSA-Wurzel offline)"
  echo
  run curl -sS -o "$TMP/freetsa-root.crl" -w "HTTP %{http_code}, %{size_download} Bytes\n" "$TSA_CRL_URL"
  cp "$C/s7-signiert-bt.hpro" "$TMP/s7-signiert-bt.epub"
  run dss validate-ts "$TMP/s7-signiert-bt.epub" "$POLICY" "$C/unterzeichner.pem" "$TSA_ROOT" "$TMP/freetsa-root.crl"
  echo "## Signatur nachträglich zeitstempeln (vorhandene B-Signatur aus 04-signieren.txt)"
  echo
  run hpro timestamp "$C/s7-signiert.hpro" "$TMP/s7-signiert-nachtraeglich-bt.hpro" --tsa "$TSA" --trust "$C/unterzeichner.pem"
  run hpro validate "$TMP/s7-signiert-nachtraeglich-bt.hpro" --trust "$C/unterzeichner.pem" --trust "$TSA_ROOT" --fetch-crls
} > "$OUT/12-zeitstempel.txt" 2>&1
grep -E "^\[Exit-Code|Indication|Format" "$OUT/12-zeitstempel.txt"
