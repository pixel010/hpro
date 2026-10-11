#!/usr/bin/env bash
# Erzeugt die Belege für Paket S4 (Offene Lizenz, Governance, Namensraum und Komponenten-Registry)
# unter docs/belege/S4/.
#
#  1. Mechanische Prüfung von Teil 2 (scripts/check-governance.mjs), Text und JSON: Anforderungen,
#     Änderungsverzeichnis, Beitragende, Fremdrechte-Register, Registry/Tabellen, Namensraum-Muster,
#     Beispielcontainer (gültig: 0 Befunde, ungültig: genau die dokumentierten Befunde)
#  2. Selbsttest des Prüfers: absichtlich kaputte Varianten müssen erkannt werden
#  3. Beispielcontainer bauen (deterministisch, zweimal), Erweiterungsprüfer auf beiden,
#     Gegenprobe mit epubcheck 5.4.0 und hpro inspect
#  4. Dateiendung: dieselben Bytes unter .hpro/.epub/.asice/.sce mit epubcheck, hpro inspect,
#     hpro validate (signierter P3-Container) und DSS 6.5
#  5. Lizenzen: SPDX-Kennungen und Lizenztexte abrufen (SHA-256), license-Felder im Repo
#  6. Quellen: HTTP-Status der externen Quellen aus Abschnitt 12
#  7. npm ci && npm test (schließt alle Spezifikationsprüfungen und Selbsttests ein)
#
# Voraussetzung: prototyp/setup-tools.sh wurde ausgeführt (JDK 21, epubcheck 5.4.0, DSS-Werkzeug),
# Node >= 22, Python 3, curl (Schritte 5 und 6).
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/S4
TMP=prototyp/out/s4
SPEC=docs/spezifikation/02-lizenz-und-governance.md
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
P3=docs/belege/P3/container
mkdir -p "$OUT/container" "$TMP"

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
dss() { "$JAVA" -Dorg.slf4j.simpleLogger.defaultLogLevel=warn -cp "prototyp/dss/target/classes:prototyp/dss/target/lib/*" example.htmlpro.HproDss "$@"; }
hpro() { node kern/build/bin/hpro.js "$@"; }

npm run build -w kern --silent || exit 2
npm run build:test -w kern --silent || exit 2

{
  echo "# S4 Werkzeuge"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  run node --version
  run python3 --version
  run "$JAVA" -version
  run "$JAVA" -jar "$EPUBCHECK" --version
  echo "DSS-Version laut Maven-Abhängigkeiten:"
  ls prototyp/dss/target/lib | grep -E '^dss-(xades|asic-xades|validation)-[0-9]'
  echo
  run wc -l "$SPEC" docs/spezifikation/02-registry.json docs/spezifikation/aenderungen/HPC-0001.md docs/spezifikation/aenderungen/HPC-0002.md scripts/check-governance.mjs scripts/check-governance-selftest.mjs scripts/check-erweiterung.mjs scripts/s4-beispiele.mjs
} > "$OUT/00-werkzeuge.txt" 2>&1

{
  echo "# S4 Mechanische Prüfung von Teil 2 (Abnahmekriterien 1–4)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run node scripts/check-governance.mjs "$SPEC"
} > "$OUT/01-check-governance.txt" 2>&1

node scripts/check-governance.mjs "$SPEC" --json > "$OUT/02-check-governance.json" 2>&1

{
  echo "# S4 Selbsttest des Prüfers: kaputte Varianten von Teil 2, Registry und Beispielen müssen erkannt werden"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run node scripts/check-governance-selftest.mjs "$SPEC"
} > "$OUT/03-selftest.txt" 2>&1

{
  echo "# S4 Beispiel-Erweiterungen (Teil 2 Abschnitt 7): bauen, prüfen, Gegenprobe"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "## Bauen (zweimal, HP-CONT-014: gleiche Eingabe, gleiche Bytes)"
  echo
  run node scripts/s4-beispiele.mjs "$OUT/container"
  run node scripts/s4-beispiele.mjs "$TMP/zweiter-lauf"
  run cmp "$OUT/container/s4-erweiterung-gueltig.hpro" "$TMP/zweiter-lauf/s4-erweiterung-gueltig.hpro"
  run cmp "$OUT/container/s4-erweiterung-ungueltig.hpro" "$TMP/zweiter-lauf/s4-erweiterung-ungueltig.hpro"
  run sha256sum "$OUT/container/s4-erweiterung-gueltig.hpro" "$OUT/container/s4-erweiterung-ungueltig.hpro"
  echo "## Erweiterungsprüfer (HPR-VERS-002/003/005, HPR-META-011, HPR-CONT-020; HPG-EXT-003/006)"
  echo
  run node scripts/check-erweiterung.mjs "$OUT/container/s4-erweiterung-gueltig.hpro"
  run node scripts/check-erweiterung.mjs "$OUT/container/s4-erweiterung-ungueltig.hpro"
  node scripts/check-erweiterung.mjs "$OUT/container/s4-erweiterung-gueltig.hpro" --json > "$OUT/05-erweiterung-gueltig.json" 2>&1
  node scripts/check-erweiterung.mjs "$OUT/container/s4-erweiterung-ungueltig.hpro" --json > "$OUT/06-erweiterung-ungueltig.json" 2>&1
  echo "## Gegenprobe: hpro inspect (Struktur und Hash-Manifest)"
  echo
  run hpro inspect "$OUT/container/s4-erweiterung-gueltig.hpro"
  run hpro inspect "$OUT/container/s4-erweiterung-ungueltig.hpro"
  echo "## Gegenprobe: epubcheck 5.4.0 (als .epub; HP-CONT-017)"
  echo
  cp "$OUT/container/s4-erweiterung-gueltig.hpro" "$TMP/gueltig.epub"
  cp "$OUT/container/s4-erweiterung-ungueltig.hpro" "$TMP/ungueltig.epub"
  run "$JAVA" -jar "$EPUBCHECK" "$TMP/gueltig.epub"
  run "$JAVA" -jar "$EPUBCHECK" "$TMP/ungueltig.epub"
  echo "## Manifest des gültigen Beispiels (Erweiterungsdeklaration)"
  echo
  python3 - "$OUT/container/s4-erweiterung-gueltig.hpro" <<'EOF'
import json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
m = json.loads(z.read('manifest.json'))
print(json.dumps({k: m[k] for k in ('conformsTo', 'extensions', 'x-kalk-version')}, indent=2, ensure_ascii=False))
print("Einträge:", z.namelist())
EOF
} > "$OUT/04-beispiele.txt" 2>&1

{
  echo "# S4 Dateiendung: dieselben Bytes unter .hpro, .epub, .asice, .sce (Teil 2 Abschnitt 6.2)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Datei: docs/belege/P3/container/signiert-2sig.epub (zwei XAdES-Signaturen, P3)"
  echo
  for ext in hpro epub asice sce; do cp "$P3/signiert-2sig.epub" "$TMP/endung.$ext"; done
  run sha256sum "$TMP/endung.hpro" "$TMP/endung.epub" "$TMP/endung.asice" "$TMP/endung.sce"
  echo "## epubcheck 5.4.0 je Endung (erwartet: nur .epub wird geprüft)"
  echo
  for ext in epub hpro asice sce; do run "$JAVA" -jar "$EPUBCHECK" "$TMP/endung.$ext"; done
  echo "## Referenzimplementierung hpro inspect je Endung (erwartet: identisch)"
  echo
  for ext in hpro epub asice sce; do hpro inspect "$TMP/endung.$ext" | grep -E '^(file|mimetype|result)'; echo "[Exit-Code $?]"; done
  echo
  echo "## Referenzimplementierung hpro validate je Endung (erwartet: identisch, TOTAL_PASSED)"
  echo
  for ext in hpro epub asice sce; do echo "\$ hpro validate $TMP/endung.$ext --trust $P3/rsa-unterzeichner.pem --trust $P3/ec-gegenzeichner.pem"; hpro validate "$TMP/endung.$ext" --trust "$P3/rsa-unterzeichner.pem" --trust "$P3/ec-gegenzeichner.pem" | grep -E '^(file|signatures|--- signature|  indication)'; echo "[Exit-Code $?]"; echo; done
  echo "## DSS 6.5 je Endung (erwartet: identisch)"
  echo
  if [ -f prototyp/dss/target/classes/example/htmlpro/HproDss.class ]; then
    for ext in hpro epub asice sce; do echo "\$ dss validate $TMP/endung.$ext $P3/rsa-unterzeichner.pem"; dss validate "$TMP/endung.$ext" "$P3/rsa-unterzeichner.pem" 2>&1 | grep -E 'Containertyp|mimetype-Inhalt|Anzahl Signaturen|Indication|Ergebnis'; echo "[Exit-Code $?]"; echo; done
  else
    echo "DSS-Werkzeug nicht gebaut: nicht geprüft"
  fi
} > "$OUT/07-dateiendung.txt" 2>&1

{
  echo "# S4 Lizenzen: SPDX-Kennungen, Lizenztexte (SHA-256) und Stand im Repository"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  for id in CC-BY-4.0 Apache-2.0 CC0-1.0 OFL-1.1; do
    url="https://spdx.org/licenses/$id.txt"
    code=$(curl -sS -L --max-time 30 -o "$TMP/$id.txt" -w '%{http_code}' "$url" 2>/dev/null || echo FEHLER)
    printf '%s  %s  %s\n' "$code" "$url" "$( [ -f "$TMP/$id.txt" ] && sha256sum "$TMP/$id.txt" | cut -c1-64 || echo '-')"
    [ -f "$TMP/$id.txt" ] && head -c 200 "$TMP/$id.txt" | tr '\n' ' ' && echo && echo
  done
  echo "## license-Felder im Repository (erwartet bis P14: keine; HPG-LIC-003 'ausstehend')"
  echo
  for f in package.json kern/package.json; do printf '%-20s license=%s\n' "$f" "$(python3 -c "import json,sys;print(json.load(open('$f')).get('license','(fehlt)'))")"; done
  echo
  echo "## LICENSE-Dateien im Repository (erwartet bis P14: keine)"
  ls LICENSE* LICENSES 2>/dev/null || echo "keine"
} > "$OUT/08-lizenzen.txt" 2>&1

{
  echo "# S4 Quellen: HTTP-Status der externen Quellen aus Teil 2 Abschnitt 12 (curl -I, 20 s)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "# Platzhalter-Adressen (html-pro.example, *.example.org nach RFC 2606) und Muster sind ausgenommen."
  echo
  grep -oE 'https?://[^ )`"|]+' "$SPEC" | sed 's/[.,;:]*$//' | grep -vE 'html-pro\.example|\.example\.org|<' | sort -u | while read -r url; do
    code=$(curl -sS -o /dev/null -I -L --max-time 20 -w '%{http_code}' "$url" 2>/dev/null || echo "FEHLER")
    printf '%s  %s\n' "$code" "$url"
  done
} > "$OUT/09-quellen.txt" 2>&1

{
  echo "# S4 Testlauf (npm test schließt alle Spezifikationsprüfungen und Selbsttests ein)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run npm ci --no-audit --no-fund
  run npm test
} > "$OUT/10-npm-test.txt" 2>&1

grep -E "^(OK|FAILED)|^requirements|^example" "$OUT/01-check-governance.txt"
grep -E "^selftest|^baseline" "$OUT/03-selftest.txt"
grep -E "^result|^findings|Messages:|Exit-Code [^0]" "$OUT/04-beispiele.txt"
grep -E "Mode required|Messages:|^result|indication" "$OUT/07-dateiendung.txt" | sort | uniq -c
grep -E "^[0-9]{3}  |FEHLER  " "$OUT/08-lizenzen.txt" "$OUT/09-quellen.txt" | sed 's/^docs\/belege\/S4\///'
grep -E "^ℹ (tests|pass|fail)|^(OK|FAILED|selftest)|\[Exit-Code" "$OUT/10-npm-test.txt"
