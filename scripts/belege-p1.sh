#!/usr/bin/env bash
# Erzeugt die Belege für Paket P1 (Container-Kern) unter docs/belege/P1/.
# Jede Datei enthält die Befehle und ihre wörtliche Ausgabe samt Exit-Code.
# Voraussetzung: Werkzeuge aus prototyp/setup-tools.sh (JDK 21, epubcheck 5.4.0), Node >= 22, python3.
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/P1
C=$OUT/container
TMP=kern/build/belege-tmp
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK_JAR=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
mkdir -p "$C"
rm -rf "$TMP"

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
epubcheck() { "$JAVA" -jar "$EPUBCHECK_JAR" "$@"; }
hpro() { node kern/build/bin/hpro.js "$@"; }
zipedit() { python3 prototyp/zipedit.py "$@"; }
zipliste() { python3 - "$1" <<'EOF'
import sys, zipfile
for i in zipfile.ZipFile(sys.argv[1]).infolist():
    method = "stored" if i.compress_type == 0 else "deflated"
    print(f"{i.header_offset:6d}  {method:8s}  extra={len(i.extra)}  {i.filename}")
EOF
}
kopfbytes() { od -A d -c -N 58 "$1"; }
# Schreibt IN nach OUT um; MODUS: deflate-mimetype | extra-mimetype | mimetype-zweiter
umschreiben() { python3 - "$1" "$2" "$3" <<'EOF'
import sys, zipfile
src, dst, mode = sys.argv[1:4]
with zipfile.ZipFile(src) as zi:
    infos = zi.infolist()
    if mode == "mimetype-zweiter":
        infos = [infos[1], infos[0]] + infos[2:]
    with zipfile.ZipFile(dst, "w") as zo:
        for i in infos:
            n = zipfile.ZipInfo(i.filename, date_time=i.date_time)
            n.create_system = 3
            n.external_attr = 0o100644 << 16
            n.compress_type = zipfile.ZIP_STORED if i.filename == "mimetype" else zipfile.ZIP_DEFLATED
            if i.filename == "mimetype" and mode == "deflate-mimetype":
                n.compress_type = zipfile.ZIP_DEFLATED
            if i.filename == "mimetype" and mode == "extra-mimetype":
                n.extra = b"\xfe\xca\x00\x00"
            zo.writestr(n, zi.read(i.filename))
EOF
}

{
  echo "# P1 Werkzeuge"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  run node --version
  run npm --version
  run "$JAVA" -version
  run epubcheck --version
  run python3 --version
} > "$OUT/00-werkzeuge.txt"

{
  echo "# P1 Abnahme 1: npm ci && npm test"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run npm ci
  run npm test
} > "$OUT/01-npm-ci-test.txt"
mkdir -p "$TMP"

{
  echo "# P1 Abnahme 2: vom Kern erzeugter Container gegen epubcheck 5.4.0"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run hpro sample "$C/beispiel-lauf1.epub"
  run epubcheck "$C/beispiel-lauf1.epub"
  echo "# Rohbytes am Dateianfang: Local-Header, Name 'mimetype' ab Byte 30, Inhalt ab Byte 38"
  run kopfbytes "$C/beispiel-lauf1.epub"
  echo "# Unabhängige Auflistung mit Python zipfile"
  run zipliste "$C/beispiel-lauf1.epub"
  echo "# Rücklesen und Hash-Prüfung mit dem Kern"
  run hpro inspect "$C/beispiel-lauf1.epub"
} > "$OUT/02-epubcheck.txt"

{
  echo "# P1 Abnahme 4: zwei getrennte Läufe (eigene Node-Prozesse) erzeugen denselben Inhalt"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run hpro sample "$C/beispiel-lauf2.epub"
  run hpro compare "$C/beispiel-lauf1.epub" "$C/beispiel-lauf2.epub"
  run sha256sum "$C/beispiel-lauf1.epub" "$C/beispiel-lauf2.epub"
  run cmp "$C/beispiel-lauf1.epub" "$C/beispiel-lauf2.epub"
} > "$OUT/03-determinismus.txt"

{
  echo "# P1 Abnahme 3: manipulierte Ressource wird beim Rücklesen erkannt"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Manipulation mit prototyp/zipedit.py (Python zipfile, unabhängig vom Kern; CRCs werden neu berechnet)"
  echo
  run zipedit replace "$C/beispiel-lauf1.epub" "$C/beispiel-manipuliert.epub" content/index.xhtml "1.200,00 EUR" "9.200,00 EUR"
  run hpro inspect "$C/beispiel-manipuliert.epub"
  echo "# epubcheck sieht die Manipulation nicht (wie V8 in docs/05): das Format bleibt gültig"
  run epubcheck "$C/beispiel-manipuliert.epub"
  echo "# Gegenprobe mit dem Prototyp-Container V8 (nach dem Signieren geändert)"
  run hpro inspect prototyp/ergebnisse/container/hybrid-manipuliert.epub
  echo "# Nachträglich ergänzte Datei (Prototyp V9): bleibt gültig, wird aber als unlisted benannt"
  run hpro inspect prototyp/ergebnisse/container/hybrid-kommentar.epub
} > "$OUT/04-manipulation.txt"

{
  echo "# P1 Gegenproben: Container mit verletzten OCF-Regeln, Ergebnis je Werkzeug"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Zweck: zeigen, dass die Prüfungen greifen, und welche Regel welches Werkzeug erkennt."
  echo
  echo "## a) mimetype mit ASiC-Inhalt"
  run zipedit set-mimetype "$C/beispiel-lauf1.epub" "$TMP/falscher-mimetype.epub" application/vnd.etsi.asic-e+zip
  run epubcheck "$TMP/falscher-mimetype.epub"
  run hpro inspect "$TMP/falscher-mimetype.epub"
  echo "## b) mimetype komprimiert (deflate)"
  run umschreiben "$C/beispiel-lauf1.epub" "$TMP/mimetype-komprimiert.epub" deflate-mimetype
  run zipliste "$TMP/mimetype-komprimiert.epub"
  run kopfbytes "$TMP/mimetype-komprimiert.epub"
  run epubcheck "$TMP/mimetype-komprimiert.epub"
  run hpro inspect "$TMP/mimetype-komprimiert.epub"
  echo "## c) mimetype mit Extra-Feld im Local-Header"
  run umschreiben "$C/beispiel-lauf1.epub" "$TMP/mimetype-extra.epub" extra-mimetype
  run zipliste "$TMP/mimetype-extra.epub"
  run epubcheck "$TMP/mimetype-extra.epub"
  run hpro inspect "$TMP/mimetype-extra.epub"
  echo "## d) mimetype nicht erste Datei"
  run umschreiben "$C/beispiel-lauf1.epub" "$TMP/mimetype-zweiter.epub" mimetype-zweiter
  run zipliste "$TMP/mimetype-zweiter.epub"
  run epubcheck "$TMP/mimetype-zweiter.epub"
  run hpro inspect "$TMP/mimetype-zweiter.epub"
} > "$OUT/05-gegenproben.txt"

echo "Belege geschrieben nach $OUT"
