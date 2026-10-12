#!/usr/bin/env bash
# Erzeugt die Belege für Paket S1 (Spezifikation hpro 0.1) unter docs/belege/S1/.
#
#  1. Mechanische Prüfung der Spezifikation (scripts/check-spec.mjs), Text und JSON
#  2. Selbsttest des Prüfers: absichtlich kaputte Varianten müssen erkannt werden
#  3. Gegenprobe der Container-Anforderungen am Beispielcontainer des Kerns und an den
#     signierten Containern aus P3 (mimetype, Hash-Manifest, signatures.xml, Signaturprüfung,
#     EPUB-Validator, unabhängiger AdES-Validator)
#  4. npm ci && npm test (schließt die Spezifikationsprüfung ein)
#  5. Prüfstein der Umsetzbarkeit (Spezifikation Abschnitt 17.3, Schritte 4a–4c): Container des
#     fremden Erzeugers (pruefstein/) mit Kern, EPUB-Validator und Kern-Textextraktion prüfen;
#     fremder Leser auf Kern-Beispiel, P3-Container, manipulierte und ergänzte Variante
#  6. Erreichbarkeit der externen Quellen (HTTP-Statuscodes)
#
# Voraussetzung: prototyp/setup-tools.sh wurde ausgeführt (JDK 21, epubcheck 5.4.0, DSS-Werkzeug),
# Node >= 22, Python 3.
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/S1
TMP=prototyp/out/s1
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
P3=docs/belege/P3/container
mkdir -p "$OUT" "$TMP"

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
dss() { "$JAVA" -Dorg.slf4j.simpleLogger.defaultLogLevel=warn -cp "prototyp/dss/target/classes:prototyp/dss/target/lib/*" example.hpro.HproDss "$@"; }
hpro() { node kern/build/bin/hpro.js "$@"; }

npm run build:test -w kern --silent || exit 2

{
  echo "# S1 Werkzeuge"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  run node --version
  run python3 --version
  run "$JAVA" -version
  run "$JAVA" -jar "$EPUBCHECK" --version
  echo "DSS-Version laut Maven-Abhängigkeiten:"
  ls prototyp/dss/target/lib | grep -E '^dss-(xades|asic-xades|validation|policy-jaxb)-[0-9]'
  echo
  run wc -l docs/spezifikation/00-spezifikation.md scripts/check-spec.mjs scripts/check-spec-selftest.mjs
} > "$OUT/00-werkzeuge.txt" 2>&1

{
  echo "# S1 Mechanische Prüfung der Spezifikation (Abnahmekriterien 1–5)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run node scripts/check-spec.mjs docs/spezifikation/00-spezifikation.md
} > "$OUT/01-check-spec.txt" 2>&1

node scripts/check-spec.mjs docs/spezifikation/00-spezifikation.md --json > "$OUT/02-check-spec.json" 2>&1

{
  echo "# S1 Selbsttest des Prüfers: kaputte Varianten der Spezifikation müssen erkannt werden"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run node scripts/check-spec-selftest.mjs docs/spezifikation/00-spezifikation.md
} > "$OUT/03-selftest.txt" 2>&1

{
  echo "# S1 Gegenprobe der Container-Anforderungen an realen Containern"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Beispielcontainer des Kerns (P1) und signierte Container aus docs/belege/P3/container (P3)."
  echo "# Jede Prüfung nennt die Anforderung, die sie beobachtet."
  echo
  run hpro sample "$TMP/beispiel.hpro"
  cp "$TMP/beispiel.hpro" "$TMP/beispiel.epub"
  echo "## HP-CONT-001/002/006/007: ZIP-Methoden, mimetype an Offset 0, Pfade (Python zipfile, unabhängig vom Kern)"
  echo
  python3 - "$TMP/beispiel.hpro" "$P3/signiert-rsa.epub" "$P3/signiert-2sig.epub" <<'EOF'
import struct, sys, zipfile
for p in sys.argv[1:]:
    raw = open(p, 'rb').read()
    z = zipfile.ZipFile(p)
    infos = z.infolist()
    first = infos[0]
    extra = struct.unpack('<H', raw[first.header_offset + 28:first.header_offset + 30])[0]
    methods = sorted({i.compress_type for i in infos})
    flags_enc = [i.filename for i in infos if i.flag_bits & 1]
    bad = [i.filename for i in infos if i.filename.startswith('/') or '..' in i.filename.split('/') or '\\' in i.filename]
    folded = {i.filename.lower() for i in infos}
    print(f"{p}")
    print(f"  HP-CONT-001 methods={methods} encrypted={flags_enc} entries={len(infos)} zip64={'yes' if any(i.file_size >= 0xFFFFFFFF for i in infos) else 'no'}")
    print(f"  HP-CONT-002 first={first.filename!r} offset={first.header_offset} method={first.compress_type} extra_len={extra} content={z.read('mimetype')!r}")
    print(f"  HP-CONT-006 bad_paths={bad} unique_case_insensitive={len(folded) == len(infos)}")
    meta = [i.filename for i in infos if i.filename.startswith('META-INF/')]
    print(f"  HP-CONT-007 META-INF={meta}")
    print()
EOF
  echo "## HP-CONT-003/004/005/008, HP-META-001/002: Struktur und Hash-Manifest (hpro inspect)"
  echo
  run hpro inspect "$TMP/beispiel.hpro"
  echo "## HP-CONT-013: dieselben Bytes als .hpro und .epub"
  echo
  run cmp "$TMP/beispiel.hpro" "$TMP/beispiel.epub"
  run hpro inspect "$TMP/beispiel.epub"
  echo "## HP-CONT-017: gültiges EPUB 3 (EPUB-Validator des W3C)"
  echo
  run "$JAVA" -jar "$EPUBCHECK" "$TMP/beispiel.epub"
  run "$JAVA" -jar "$EPUBCHECK" "$P3/signiert-2sig.epub"
  echo "## HP-SIG-001/003/004/009: signatures.xml mit OCF-Wurzel, exklusive C14N, ODF-Manifest (P3-Container, Python zipfile)"
  echo
  python3 - "$P3/signiert-2sig.epub" <<'EOF'
import re, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
sig = z.read('META-INF/signatures.xml').decode()
root = re.search(r'<(\w+)\s+xmlns="([^"]+)"', sig)
print("HP-SIG-001 root element:", root.group(1), "namespace:", root.group(2))
print("HP-SIG-001/003 ds:Signature count:", sig.count('<ds:Signature '))
print("HP-SIG-004 CanonicalizationMethod:", sorted(set(re.findall(r'CanonicalizationMethod Algorithm="([^"]+)"', sig))))
print("HP-SIG-008 SignatureMethod:", sorted(set(re.findall(r'SignatureMethod Algorithm="([^"]+)"', sig))))
print("HP-SIG-008 DigestMethod:", sorted(set(re.findall(r'DigestMethod Algorithm="([^"]+)"', sig))))
print("HP-SIG-005 Reference URIs (signature 1):", re.findall(r'<ds:Reference[^>]*URI="([^"#][^"]*)"', sig.split('</ds:Signature>')[0]))
print("HP-SIG-006 DataObjectFormat MimeTypes:", sorted(set(re.findall(r'<xades:MimeType>([^<]+)', sig))))
print("HP-SIG-007 SigningTime present:", '<xades:SigningTime>' in sig, "| SigningCertificateV2 present:", '<xades:SigningCertificateV2>' in sig)
man = z.read('META-INF/manifest.xml').decode()
print("HP-SIG-009 ODF manifest root entry:", re.search(r'full-path="/"[^>]*', man).group(0))
print("HP-SIG-019 'PRIVATE KEY' in any entry:", any(b'PRIVATE KEY' in z.read(n) for n in z.namelist()))
EOF
  echo
  echo "## HP-SIG-012/013/014, HP-PROF-009/010: Prüfung im Kern und mit dem unabhängigen Validator"
  echo
  run hpro validate "$P3/signiert-2sig.epub" --trust "$P3/rsa-unterzeichner.pem" --trust "$P3/ec-gegenzeichner.pem"
  run hpro validate "$P3/manipuliert-2sig.epub" --trust "$P3/rsa-unterzeichner.pem" --trust "$P3/ec-gegenzeichner.pem"
  run hpro validate "$P3/teilsigniert-anhang-bearbeitet.epub" --trust "$P3/rsa-unterzeichner.pem"
  run dss validate "$P3/signiert-rsa.epub" "$P3/rsa-unterzeichner.pem" docs/belege/P3/policy-hpro.xml
  run dss validate "$P3/manipuliert-rsa.epub" "$P3/rsa-unterzeichner.pem" docs/belege/P3/policy-hpro.xml
} > "$OUT/04-gegenprobe-container.txt" 2>&1

{
  echo "# S1 Testlauf (npm test schließt die Spezifikationsprüfung und den Selbsttest ein)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run npm ci --no-audit --no-fund
  run npm test
} > "$OUT/05-npm-test.txt" 2>&1

{
  echo "# S1 Prüfstein der Umsetzbarkeit (Spezifikation 17.3, Auswertung 4a–4c)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Fremder Erzeuger/Leser: pruefstein/min_producer.py, pruefstein/min_reader.py (Clean-Room, nur die Spezifikation gelesen)."
  echo "# Referenz: @hpro/kern (hpro), EPUB-Validator 5.4.0."
  echo
  PS=pruefstein
  mkdir -p "$TMP/pruefstein"
  echo "## 4a: Container des fremden Erzeugers -> Referenzprüfer, EPUB-Validator, Textextraktion"
  echo
  run python3 "$PS/min_producer.py" "$PS/beispiel-eingabe.json" "$TMP/pruefstein/fremd.hpro"
  cp "$TMP/pruefstein/fremd.hpro" "$TMP/pruefstein/fremd.epub"
  run hpro inspect "$TMP/pruefstein/fremd.hpro"
  run "$JAVA" -jar "$EPUBCHECK" "$TMP/pruefstein/fremd.epub"
  run node scripts/s1-referenz.mjs "$TMP/pruefstein/fremd.hpro" --text
  echo "## 4b: fremder Leser -> Kern-Beispiel, signierter P3-Container, veränderte und ergänzte Variante"
  echo
  run node scripts/s1-referenz.mjs "$TMP/beispiel.hpro"
  run python3 "$PS/min_reader.py" "$TMP/beispiel.hpro"
  run node scripts/s1-referenz.mjs "$P3/signiert-2sig.epub"
  run python3 "$PS/min_reader.py" "$P3/signiert-2sig.epub"
  python3 - "$TMP/beispiel.hpro" "$TMP/pruefstein" <<'EOF2'
import sys, zipfile, shutil
src, out = sys.argv[1], sys.argv[2]
# changed: replace the bytes of the first content document
with zipfile.ZipFile(src) as z:
    infos = z.infolist()
    with zipfile.ZipFile(out + '/beispiel-veraendert.hpro', 'w') as w:
        for i in infos:
            data = z.read(i.filename)
            if i.filename == 'content/index.xhtml':
                data = data.replace(b'1.200,00', b'9.200,00')
            w.writestr(i, data, compress_type=i.compress_type)
# added: one extra unsigned, unlisted file
shutil.copy(src, out + '/beispiel-ergaenzt.hpro')
with zipfile.ZipFile(out + '/beispiel-ergaenzt.hpro', 'a') as w:
    w.writestr('annotations/notiz.json', '{"note":"nachtraeglich"}')
print('variants written')
EOF2
  run python3 "$PS/min_reader.py" "$TMP/pruefstein/beispiel-veraendert.hpro"
  run python3 "$PS/min_reader.py" "$TMP/pruefstein/beispiel-ergaenzt.hpro"
  echo "## 4c: Kreuzprobe – fremder Leser liest fremden Erzeuger; Referenzprüfer dasselbe (JSON)"
  echo
  run python3 "$PS/min_reader.py" "$TMP/pruefstein/fremd.hpro" --json
  run node scripts/s1-referenz.mjs "$TMP/pruefstein/fremd.hpro"
  echo "## Fragenprotokoll des fremden Entwicklers (Zeilen)"
  echo
  run grep -c '^| [0-9]' "$PS/fragen.md"
  cp "$TMP/pruefstein/fremd.hpro" "$OUT/pruefstein-fremd.hpro"
} > "$OUT/06-pruefstein.txt" 2>&1

{
  echo "# S1 Erreichbarkeit der externen Quellen (Abschnitt 20), HTTP-Statuscode je URL"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  grep -oE 'https?://[^ )>]+' docs/spezifikation/00-spezifikation.md | sed 's/[.,;]$//' | sort -u | while read -r url; do
    code=$(curl -s -o /dev/null -L --max-time 20 -A "hpro-spec-check" -w '%{http_code}' "$url" || echo "000")
    echo "$code $url"
  done
} > "$OUT/07-quellen-urls.txt" 2>&1

grep -E "^(OK|FAILED)" "$OUT/01-check-spec.txt"
grep -E "^selftest" "$OUT/03-selftest.txt"
grep -E "Messages:|^indication|Indication|HP-CONT-002|HP-SIG-001 root" "$OUT/04-gegenprobe-container.txt"
grep -E "^ℹ (tests|pass|fail|skipped)|^(OK|FAILED|selftest)" "$OUT/05-npm-test.txt"
grep -E "Messages:|result:|\[Exit-Code" "$OUT/06-pruefstein.txt" | sort | uniq -c
cut -c1-3 "$OUT/07-quellen-urls.txt" | grep -E '^[0-9]' | sort | uniq -c
