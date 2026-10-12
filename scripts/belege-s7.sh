#!/usr/bin/env bash
# Erzeugt die Belege für Paket S7 (Umsetzer-Handbuch und Autorenleitfaden) unter docs/belege/S7/.
# Jede Datei enthält wörtliche Ausgaben mit Exit-Code; die Handbücher zitieren daraus
# (scripts/check-handbuch.mjs prüft, dass jeder zitierte Ausgabeblock hier wörtlich vorkommt).
#
#  00 Werkzeuge                     06 EU DSS 6.5 als Gegenprobe
#  01 Beispiele bauen (zweimal)     07 Manipulation und Nachträge
#  02 Container von innen           08 Minimaler Leser (Prüfstein) als Lesesystem
#  03 Konformitätsprüfer            09 Dateiendungen
#  04 Signieren mit dem Kern        10 Messungen
#  05 Prüfer auf signierten Dateien 11 npm ci && npm test
#
# Voraussetzung: prototyp/setup-tools.sh (JDK 21, epubcheck 5.4.0, DSS-Werkzeug), Node >= 22, Python 3.
# Schlüssel entstehen unter prototyp/out/s7/keys (nicht eingecheckt); nur Zertifikate werden abgelegt.
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/S7
C=$OUT/container
TMP=prototyp/out/s7
KEYS=$TMP/keys
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
POLICY=docs/belege/P3/policy-hpro.xml
SIGN_TIME=2026-10-12T08:00:00Z
VT=2026-10-12T09:00:00Z
BSP=docs/spezifikation/beispiele
mkdir -p "$OUT/berichte" "$C" "$TMP" "$KEYS"
export TMPDIR="$PWD/$TMP"

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
hpro() { node kern/build/bin/hpro.js "$@"; }
check() { node kern/build/bin/hpro-check.js "$@"; }
dss() { "$JAVA" -Dorg.slf4j.simpleLogger.defaultLogLevel=warn -cp "prototyp/dss/target/classes:prototyp/dss/target/lib/*" example.htmlpro.HproDss "$@"; }
zipedit() { python3 prototyp/zipedit.py "$@"; }
reader() { python3 pruefstein/min_reader.py "$@"; }
ziplist() { python3 - "$1" <<'EOF'
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
print(f"{'offset':>6}  {'methode':8} {'gepackt':>7} {'bytes':>7}  extra  name")
for i in z.infolist():
    m = {0: 'stored', 8: 'deflated'}.get(i.compress_type, str(i.compress_type))
    print(f"{i.header_offset:6}  {m:8} {i.compress_size:7} {i.file_size:7}  {len(i.extra):5}  {i.filename}")
EOF
}
zipcat() { python3 -c 'import sys,zipfile; sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode("utf-8"))' "$1" "$2"; }
ms() { date +%s%N | cut -b1-13; }

npm run -s build -w kern || exit 2
npm run -s build:test -w kern || exit 2

{
  echo "# S7 Werkzeuge"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  run node --version
  run python3 --version
  run "$JAVA" -version
  run "$JAVA" -jar "$EPUBCHECK" --version
  echo "DSS-Version laut Maven-Abhängigkeiten:"
  ls prototyp/dss/target/lib | grep -E '^dss-(xades|asic-xades|validation|policy-jaxb)-[0-9]'
  echo
  run wc -l docs/spezifikation/04-umsetzer-handbuch.md docs/spezifikation/05-autorenleitfaden.md scripts/s7-lib.mjs scripts/s7-beispiele.mjs scripts/s7-fodt2hpro.mjs scripts/check-handbuch.mjs scripts/check-handbuch-selftest.mjs scripts/belege-s7.sh
} > "$OUT/00-werkzeuge.txt" 2>&1

{
  echo "# S7 Beispiele bauen: Quellen unter $BSP/s7-*/ mit der Referenzimplementierung (scripts/s7-beispiele.mjs)"
  echo "# Zweimal gebaut und verglichen (HP-CONT-014: gleiche Eingabe, gleiche Bytes); Konverter zweimal auf dieselbe Quelle (HP-MIN-004)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run node scripts/s7-beispiele.mjs "$C"
  run node scripts/s7-beispiele.mjs "$TMP/zweiter-lauf"
  for f in s7-bericht s7-bericht-signierbar s7-lebendig s7-fassungen s7-buero; do run cmp "$C/$f.hpro" "$TMP/zweiter-lauf/$f.hpro"; done
  run sha256sum "$C/s7-bericht.hpro" "$C/s7-bericht-signierbar.hpro" "$C/s7-lebendig.hpro" "$C/s7-fassungen.hpro" "$C/s7-buero.hpro"
  echo "## Konverter einzeln (Autorenleitfaden): Flat-ODF → Mindestprofil"
  echo
  run node scripts/s7-fodt2hpro.mjs "$BSP/s7-buero/angebot.fodt" "$TMP/buero-a.hpro"
  run node scripts/s7-fodt2hpro.mjs "$BSP/s7-buero/angebot.fodt" "$TMP/buero-b.hpro"
  run cmp "$TMP/buero-a.hpro" "$TMP/buero-b.hpro"
  run cmp "$TMP/buero-a.hpro" "$C/s7-buero.hpro"
} > "$OUT/01-beispiele-bauen.txt" 2>&1

{
  echo "# S7 Container von innen (Handbuch Kapitel 2–4): Einträge, mimetype, container.xml, package.opf, manifest.json, nav"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run hpro inspect "$C/s7-bericht.hpro"
  echo "## ZIP-Einträge, unabhängig vom Kern gelesen (Python zipfile)"
  echo
  run ziplist "$C/s7-bericht.hpro"
  echo "## Die ersten 64 Bytes der Datei (Local-Header von mimetype, HP-CONT-002)"
  echo
  run od -A d -c -N 64 "$C/s7-bericht.hpro"
  for e in mimetype META-INF/container.xml package.opf manifest.json content/nav.xhtml; do
    echo "## $e"
    echo
    run zipcat "$C/s7-bericht.hpro" "$e"
  done
  echo "## Komponenten- und Datendeklaration des lebendigen Beispiels"
  echo
  run zipcat "$C/s7-lebendig.hpro" manifest.json
  echo "## Fassungsmanifest der eingefrorenen Fassung und renditions-Eintrag"
  echo
  run zipcat "$C/s7-fassungen.hpro" renditions/nachweis-2026-10-12/manifest.json
  run ziplist "$C/s7-fassungen.hpro"
  echo "## Mindestprofil: Inhaltsdokument und Manifest, wie der Konverter sie schreibt"
  echo
  run zipcat "$C/s7-buero.hpro" content/index.xhtml
  run zipcat "$C/s7-buero.hpro" manifest.json
  run zipcat "$C/s7-buero.hpro" content/nav.xhtml
} > "$OUT/02-container.txt" 2>&1

{
  echo "# S7 Konformitätsprüfer (hpro-check, Teil 1) auf den unsignierten Beispielen, mit epubcheck 5.4.0"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  for f in s7-bericht s7-lebendig s7-buero; do run check "$C/$f.hpro" --json "$OUT/berichte/$f.json"; done
  echo "## Profil signed ohne Signatur: HPR-PROF-004 (Vorstufe des signierten Beispiels)"
  echo
  run check "$C/s7-bericht-signierbar.hpro" --no-epubcheck --no-not-checked
  echo "## Eingefrorene Fassung, noch unsigniert: HPR-PROF-004 für die Fassung; epubcheck RSC-011 (offener Punkt HPC-0003)"
  echo
  run check "$C/s7-fassungen.hpro" --no-not-checked
  echo "## Versuch zu HPC-0003: Fassungsdokument zusätzlich im Spine mit linear=\"no\""
  echo
  node --input-type=module -e '
import { readZip, writeZip } from "./kern/dist/index.js"; import { readFileSync, writeFileSync } from "node:fs";
const es = await readZip(readFileSync(process.argv[1]));
const dec = new TextDecoder(), enc = new TextEncoder();
const out = es.map((e) => { let data = e.data; if (e.name === "package.opf") { let t = dec.decode(data); const m = t.match(/<item id="(r\d+)" href="renditions\/[^"]*content\/index.xhtml"/); t = t.replace("  </spine>", `    <itemref idref="${m[1]}" linear="no"/>\n  </spine>`); data = enc.encode(t); } return { name: e.name, data, compression: e.name === "mimetype" ? "store" : "auto" }; });
writeFileSync(process.argv[2], await writeZip(out, { modified: new Date("2026-10-12T06:30:00Z") }));
console.log("geschrieben: " + process.argv[2] + " (package.opf: itemref linear=\"no\" für das Fassungsdokument; Hash von package.opf im Manifest absichtlich nicht aktualisiert)");' "$C/s7-fassungen.hpro" "$TMP/versuch-linear-no.hpro"
  run check "$TMP/versuch-linear-no.hpro" --no-not-checked
  cp "$TMP/versuch-linear-no.hpro" "$TMP/versuch-linear-no.epub"
  run "$JAVA" -jar "$EPUBCHECK" "$TMP/versuch-linear-no.epub"
  echo "## Versuch zu HPC-0004: Komponente mit window.parent.postMessage statt parent.postMessage"
  echo
  node --input-type=module -e '
import { readZip, writeZip, sriSha256 } from "./kern/dist/index.js"; import { readFileSync, writeFileSync } from "node:fs";
const es = await readZip(readFileSync(process.argv[1]));
const dec = new TextDecoder(), enc = new TextEncoder();
const js = "components/x-baubuero-aufmass@1.0.0/x-baubuero-aufmass.js";
const src = dec.decode(es.find((e) => e.name === js).data);
if (!src.includes("parent.postMessage(message, \x27*\x27)")) throw new Error("Muster nicht gefunden");
const script = enc.encode(src.replace("parent.postMessage(message, \x27*\x27)", "window.parent.postMessage(message, \x27*\x27)"));
const manifest = JSON.parse(dec.decode(es.find((e) => e.name === "manifest.json").data));
const integrity = await sriSha256(script);
manifest.components[0].integrity = integrity; manifest.resources.find((r) => r.url === js).integrity = integrity;
const out = es.map((e) => ({ name: e.name, data: e.name === js ? script : e.name === "manifest.json" ? enc.encode(JSON.stringify(manifest, null, 2) + "\n") : e.data, compression: e.name === "mimetype" ? "store" : "auto" }));
writeFileSync(process.argv[2], await writeZip(out, { modified: new Date("2026-10-12T06:30:00Z") }));
console.log("geschrieben: " + process.argv[2] + " (Komponente sendet mit window.parent.postMessage, Hashes aktualisiert)");' "$C/s7-lebendig.hpro" "$TMP/versuch-window-parent.hpro"
  run check "$TMP/versuch-window-parent.hpro" --no-epubcheck --no-not-checked
  echo "## Schlechtfälle der Testsuite zum Mindestprofil (Autorenleitfaden, häufige Fehler)"
  echo
  for f in schlecht-min-010-seitenzahl schlecht-min-007-kopfzeile schlecht-min-004-aufzaehlungszeichen schlecht-min-005-liste schlecht-min-008-bild; do
    run check "testsuite/dokumente/$f.hpro" --no-epubcheck --no-not-checked
  done
  echo "## Gutfälle der Testsuite zu Sperren und Redaktion (Handbuch Kapitel 7)"
  echo
  for f in gut-lock-sperre gut-lock-redaktion; do run check "testsuite/dokumente/$f.hpro" --no-epubcheck --no-not-checked; done
  run zipcat testsuite/dokumente/gut-lock-redaktion.hpro data/redaction-log.json
  echo "## JSON-Bericht (Teil 1, 4.3), Kopf und Zusammenfassung von s7-bericht"
  echo
  node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(JSON.stringify({spec:r.spec,catalog:r.catalog,tool:r.tool,file:r.file,levels:r.levels,summary:r.summary,notChecked:r.notChecked},null,2))' "$OUT/berichte/s7-bericht.json"
} > "$OUT/03-pruefer.txt" 2>&1

{
  echo "# S7 Signieren mit dem Kern (Handbuch Kapitel 8): Testschlüssel, Signatur, Prüfung, Gegenzeichnung, eingefrorene Fassung"
  echo "# Signierzeit fest ($SIGN_TIME), Prüfzeit $VT; Zertifikate selbstsigniert, nicht qualifiziert"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  # Schlüssel werden nur beim ersten Lauf erzeugt; so bleiben die RSA-Signaturen über Läufe hinweg
  # byteidentisch (ECDSA ist randomisiert, die Gegenzeichnung daher nicht).
  if [ ! -f "$KEYS/unterzeichner.key.pem" ] || [ ! -f "$C/unterzeichner.pem" ]; then
    run hpro keygen "$KEYS/unterzeichner.key.pem" "$C/unterzeichner.pem" --alg rsa --cn "Beispiel Bautechnik Unterzeichner" --days 400
  else echo "Schlüssel $KEYS/unterzeichner.key.pem vorhanden (wiederverwendet)"; echo; fi
  if [ ! -f "$KEYS/gegenzeichner.key.pem" ] || [ ! -f "$C/gegenzeichner.pem" ]; then
    run hpro keygen "$KEYS/gegenzeichner.key.pem" "$C/gegenzeichner.pem" --alg ec --cn "Beispiel Bautechnik Gegenzeichner" --days 400
  else echo "Schlüssel $KEYS/gegenzeichner.key.pem vorhanden (wiederverwendet)"; echo; fi
  echo "## Schlüsselerzeugung zur Anschauung (Ausgabe des Befehls; diese Schlüssel werden nicht weiterverwendet)"
  echo
  run hpro keygen "$TMP/demo.key.pem" "$TMP/demo.pem" --alg rsa --cn "Beispiel Bautechnik Unterzeichner" --days 400
  echo "## Profil signed, aber noch keine Signatur: die Prüfung nennt jede Datei als unsigniert"
  echo
  run hpro validate "$C/s7-bericht-signierbar.hpro" --time "$VT"
  echo "## Hauptfassung signieren (alle Dateien plus META-INF/container.xml, HP-SIG-005)"
  echo
  run hpro sign "$C/s7-bericht-signierbar.hpro" "$C/s7-signiert.hpro" --key "$KEYS/unterzeichner.key.pem" --cert "$C/unterzeichner.pem" --time "$SIGN_TIME" --id sig-unterzeichner
  run hpro validate "$C/s7-signiert.hpro" --trust "$C/unterzeichner.pem" --time "$VT"
  echo "## Gegenzeichnen: zweite Signatur ans Ende, alles andere byteidentisch (HP-SIG-003, HP-SIG-020)"
  echo
  run hpro sign "$C/s7-signiert.hpro" "$C/s7-signiert-2sig.hpro" --key "$KEYS/gegenzeichner.key.pem" --cert "$C/gegenzeichner.pem" --time "$SIGN_TIME" --id sig-gegenzeichner
  run hpro validate "$C/s7-signiert-2sig.hpro" --trust "$C/unterzeichner.pem" --trust "$C/gegenzeichner.pem" --time "$VT"
  run hpro compare "$C/s7-signiert.hpro" "$C/s7-signiert-2sig.hpro"
  echo "## Eingefrorene Fassung signieren: nur renditions/<id>/ plus container.xml (HP-PROF-008)"
  echo
  ONLY=()
  while IFS= read -r p; do ONLY+=(--only "$p"); done < "$C/s7-fassungen.fassung.txt"
  run hpro sign "$C/s7-fassungen.hpro" "$C/s7-fassungen-signiert.hpro" --key "$KEYS/unterzeichner.key.pem" --cert "$C/unterzeichner.pem" --time "$SIGN_TIME" --id sig-nachweis "${ONLY[@]}"
  run hpro validate "$C/s7-fassungen-signiert.hpro" --trust "$C/unterzeichner.pem" --time "$VT"
  echo "## Signaturdatei (META-INF/signatures.xml) des einfach signierten Dokuments, gekürzt auf Struktur"
  echo
  zipcat "$C/s7-signiert.hpro" META-INF/signatures.xml | python3 -c '
import sys, re
t = sys.stdin.read()
t = re.sub(r"(<ds:DigestValue>)[^<]{12}[^<]*(</ds:DigestValue>)", r"\1…\2", t)
t = re.sub(r"(<ds:SignatureValue[^>]*>)[^<]{16}[^<]*(</ds:SignatureValue>)", r"\1…\2", t)
t = re.sub(r"(<ds:X509Certificate>)[^<]{16}[^<]*(</ds:X509Certificate>)", r"\1…\2", t)
t = re.sub(r"(<ds:Modulus>)[^<]{16}[^<]*(</ds:Modulus>)", r"\1…\2", t)
t = re.sub(r"(<xades:CertDigest>\s*<ds:DigestMethod[^>]*/>\s*<ds:DigestValue>)[^<]{12}[^<]*(</ds:DigestValue>)", r"\1…\2", t)
sys.stdout.write(t)'
  echo
  run zipcat "$C/s7-signiert.hpro" META-INF/manifest.xml
  echo "## Kein privater Schlüssel im Container (HP-SIG-019)"
  echo
  run python3 -c 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); hits=[n for n in z.namelist() if b"PRIVATE KEY" in z.read(n)]; print("Treffer:", hits)' "$C/s7-signiert-2sig.hpro"
} > "$OUT/04-signieren.txt" 2>&1

{
  echo "# S7 Konformitätsprüfer auf den signierten Dateien (Stufe Signiert), mit Vertrauensanker und fester Prüfzeit"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run check "$C/s7-signiert.hpro" --trust "$C/unterzeichner.pem" --time "$VT" --json "$OUT/berichte/s7-signiert.json"
  run check "$C/s7-signiert-2sig.hpro" --trust "$C/unterzeichner.pem" --trust "$C/gegenzeichner.pem" --time "$VT" --no-not-checked
  run check "$C/s7-fassungen-signiert.hpro" --trust "$C/unterzeichner.pem" --time "$VT" --no-epubcheck --no-not-checked --json "$OUT/berichte/s7-fassungen-signiert.json"
  echo "## Ohne Vertrauensanker: Kryptografie geprüft, Vertrauen unbestimmt (HP-SIG-015, HPR-SIG-016)"
  echo
  run check "$C/s7-signiert.hpro" --time "$VT" --no-epubcheck --no-not-checked
} > "$OUT/05-pruefer-signiert.txt" 2>&1

{
  echo "# S7 EU DSS 6.5 als unabhängige Gegenprobe (Richtlinie docs/belege/P3/policy-hpro.xml: application/epub+zip zulässig)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run dss validate "$C/s7-signiert.hpro" "$C/unterzeichner.pem" "$POLICY"
  run dss validate "$C/s7-signiert-2sig.hpro" "$C/gegenzeichner.pem" "$POLICY"
  run dss validate "$C/s7-fassungen-signiert.hpro" "$C/unterzeichner.pem" "$POLICY"
  echo "## Dieselbe Datei mit der DSS-Standardrichtlinie: Warnung zum mimetype, Urteil unverändert (docs/05 V3)"
  echo
  run dss validate "$C/s7-signiert.hpro" "$C/unterzeichner.pem"
} > "$OUT/06-dss.txt" 2>&1

{
  echo "# S7 Manipulation und Nachträge (Handbuch Kapitel 8.5): Änderung nach der Signatur, ergänzte Datei, eingefrorene Fassung"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "## Inhalt nach der Signatur geändert (23 % → 13 %)"
  echo
  run zipedit replace "$C/s7-signiert.hpro" "$C/s7-signiert-manipuliert.hpro" content/index.xhtml "23 %" "13 %"
  run hpro validate "$C/s7-signiert-manipuliert.hpro" --trust "$C/unterzeichner.pem" --time "$VT"
  run dss validate "$C/s7-signiert-manipuliert.hpro" "$C/unterzeichner.pem" "$POLICY"
  run check "$C/s7-signiert-manipuliert.hpro" --trust "$C/unterzeichner.pem" --time "$VT" --no-epubcheck --no-not-checked
  echo "## Datei nach der Signatur ergänzt (Anmerkung): Signatur bleibt gültig, Datei ist unsigniert und nicht gelistet"
  echo
  run zipedit add "$C/s7-signiert.hpro" "$C/s7-signiert-anmerkung.hpro" annotations/notiz.jsonld '{"@context":"http://www.w3.org/ns/anno.jsonld","type":"Annotation","body":{"type":"TextualBody","value":"Bitte Sparren S 4 nachmessen."},"target":{"source":"content/index.xhtml#messwerte"}}'
  run hpro validate "$C/s7-signiert-anmerkung.hpro" --trust "$C/unterzeichner.pem" --time "$VT"
  run hpro inspect "$C/s7-signiert-anmerkung.hpro"
  run check "$C/s7-signiert-anmerkung.hpro" --trust "$C/unterzeichner.pem" --time "$VT" --no-epubcheck --no-not-checked
  echo "## Eingefrorene Fassung: Hauptfassung bearbeiten lässt die Fassungssignatur gültig (HP-PROF-009); Fassung ändern bricht sie (HP-PROF-010)"
  echo
  run zipedit replace "$C/s7-fassungen-signiert.hpro" "$TMP/fassungen-hauptfassung-bearbeitet.hpro" content/index.xhtml "Mengen je Dachfläche." "Mengen je Dachfläche (Entwurf 2)."
  run hpro validate "$TMP/fassungen-hauptfassung-bearbeitet.hpro" --trust "$C/unterzeichner.pem" --time "$VT"
  run zipedit replace "$C/s7-fassungen-signiert.hpro" "$C/s7-fassungen-manipuliert.hpro" renditions/nachweis-2026-10-12/content/index.xhtml "9.600,00" "9.900,00"
  run hpro validate "$C/s7-fassungen-manipuliert.hpro" --trust "$C/unterzeichner.pem" --time "$VT"
} > "$OUT/07-manipulation.txt" 2>&1

{
  echo "# S7 Lesesystem ohne Darstellung: der minimale Leser des Prüfsteins (pruefstein/min_reader.py, Python-Standardbibliothek)"
  echo "# Zeigt Metadaten, Lesereihenfolge, Adressen (HP-ADR-003), Fließtext (HP-INH-011) und Hashprüfung (HP-CONT-009)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run reader "$C/s7-bericht.hpro"
  echo "## Unsigniertes Dokument nach dem Schreiben verändert: Hash-Manifest meldet die Datei (HP-CONT-009)"
  echo
  run zipedit replace "$C/s7-bericht.hpro" "$C/s7-bericht-veraendert.hpro" content/index.xhtml "23 %" "13 %"
  run reader "$C/s7-bericht-veraendert.hpro"
  run hpro inspect "$C/s7-bericht-veraendert.hpro"
  echo "## Nicht gelistete Datei (annotations/) wird namentlich genannt"
  echo
  run zipedit add "$C/s7-bericht.hpro" "$TMP/bericht-ergaenzt.hpro" annotations/notiz.jsonld '{"type":"Annotation"}'
  run reader "$TMP/bericht-ergaenzt.hpro"
  echo "## Erkennung über den Inhalt, nicht die Endung (HP-CONT-013)"
  echo
  cp "$C/s7-bericht.hpro" "$TMP/s7-bericht.bin"
  run reader --json "$TMP/s7-bericht.bin"
} > "$OUT/08-lesesystem.txt" 2>&1

{
  echo "# S7 Dateiendungen: dieselben Bytes als .hpro und .epub (HP-CONT-013); epubcheck 5.4.0 nur auf .epub"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  cp "$C/s7-signiert-2sig.hpro" "$TMP/s7-signiert-2sig.epub"
  run cmp "$C/s7-signiert-2sig.hpro" "$TMP/s7-signiert-2sig.epub"
  run "$JAVA" -jar "$EPUBCHECK" "$TMP/s7-signiert-2sig.epub"
  run "$JAVA" -jar "$EPUBCHECK" "$C/s7-signiert-2sig.hpro"
  cp "$C/s7-buero.hpro" "$TMP/s7-buero.epub"
  run "$JAVA" -jar "$EPUBCHECK" "$TMP/s7-buero.epub"
  cp "$C/s7-lebendig.hpro" "$TMP/s7-lebendig.epub"
  run "$JAVA" -jar "$EPUBCHECK" "$TMP/s7-lebendig.epub"
} > "$OUT/09-endung.txt" 2>&1

{
  echo "# S7 Messungen (Wanduhr, ms; Rechner geteilt, Werte sind obere Grenzen)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Lastmittel: $(uptime | sed 's/.*load average: //')"
  echo
  t0=$(ms); node scripts/s7-beispiele.mjs "$TMP/messung" > /dev/null; t1=$(ms); echo "Beispiele bauen (5 Container, Kern):      $((t1 - t0)) ms"
  t0=$(ms); node scripts/s7-fodt2hpro.mjs "$BSP/s7-buero/angebot.fodt" "$TMP/messung-buero.hpro" > /dev/null; t1=$(ms); echo "Konverter Flat-ODF → Mindestprofil:       $((t1 - t0)) ms"
  t0=$(ms); hpro sign "$C/s7-bericht-signierbar.hpro" "$TMP/messung-signiert.hpro" --key "$KEYS/unterzeichner.key.pem" --cert "$C/unterzeichner.pem" --time "$SIGN_TIME" > /dev/null; t1=$(ms); echo "Signieren (RSA 3072, inkl. Rücklesen):     $((t1 - t0)) ms"
  t0=$(ms); hpro validate "$C/s7-signiert-2sig.hpro" --trust "$C/unterzeichner.pem" --trust "$C/gegenzeichner.pem" --time "$VT" > /dev/null; t1=$(ms); echo "Signaturprüfung (2 Signaturen):           $((t1 - t0)) ms"
  t0=$(ms); check "$C/s7-bericht.hpro" --no-epubcheck > /dev/null; t1=$(ms); echo "hpro-check ohne epubcheck:                $((t1 - t0)) ms"
  t0=$(ms); check "$C/s7-bericht.hpro" > /dev/null; t1=$(ms); echo "hpro-check mit epubcheck (JVM-Start):     $((t1 - t0)) ms"
  t0=$(ms); reader "$C/s7-bericht.hpro" > /dev/null; t1=$(ms); echo "Minimaler Leser (Python):                 $((t1 - t0)) ms"
  echo
  ls -l "$C"/*.hpro | awk '{print $5, $9}'
} > "$OUT/10-messung.txt" 2>&1

{
  echo "# S7 npm ci && npm test (Kern, Spezifikations-, Konformitäts-, Formel-, Governance- und Handbuchprüfer mit Selbsttests)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run npm ci --no-audit --no-fund
  run npm test
} > "$OUT/11-npm-test.txt" 2>&1
tail -n 25 "$OUT/11-npm-test.txt"
echo "fertig: $OUT"
