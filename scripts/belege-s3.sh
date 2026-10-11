#!/usr/bin/env bash
# Erzeugt die Belege für Paket S3 (Konformitätsprüfer und Testsuite) unter docs/belege/S3/.
#
#  0. Werkzeuge und Umfang
#  1. Testsuite erzeugen (scripts/s3-testsuite.mjs → testsuite/), Prüfsummen der Dokumente
#  2. Testsuite ausführen (scripts/s3-testsuite-lauf.mjs): gefundene Regeln, Urteil, Abdeckung
#  3. Kommandozeile `npm run hpro-check`: Text- und JSON-Ausgabe, Rückgabecodes (Teil 1, 4.4/4.5)
#  4. Prototyp-Dokumente aus Phase 2 (prototyp/ergebnisse/container/) und der Beispielcontainer
#     des Kerns gegen den Katalog, mit EPUB-Validator; Berichte als JSON und Text
#  5. EPUB-Validator (epubcheck 5.4.0) über alle guten Dokumente der Testsuite (HPR-CONT-024/028)
#  6. Gegenprobe der Signatururteile mit EU DSS 6.5 (scripts/s3-dss-vergleich.mjs)
#  7. Messungen: Laufzeit je Dokument und der Kommandozeile
#  8. npm ci && npm test
#
# Voraussetzung: prototyp/setup-tools.sh wurde ausgeführt (JDK 21, epubcheck 5.4.0, DSS-Werkzeug),
# Node >= 22. Temporäre Dateien (epubcheck-Kopien) entstehen unter prototyp/out/s3, nicht in /tmp.
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/S3
TMP=prototyp/out/s3
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
PC=prototyp/ergebnisse/container
SUITE=testsuite
VT=2026-10-11T09:00:00Z
mkdir -p "$OUT/berichte" "$OUT/prototyp" "$TMP"
export TMPDIR="$PWD/$TMP"

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
check() { node kern/build/bin/hpro-check.js "$@"; }

npm run build:test -w kern --silent || exit 2

{
  echo "# S3 Werkzeuge"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  run node --version
  run "$JAVA" -version
  run "$JAVA" -jar "$EPUBCHECK" --version
  echo "DSS-Version laut Maven-Abhängigkeiten:"
  ls prototyp/dss/target/lib | grep -E '^dss-(xades|asic-xades|validation|policy-jaxb)-[0-9]'
  echo
  run wc -l kern/src/check/*.ts kern/bin/hpro-check.ts kern/test/conformance.test.ts scripts/s3-testsuite.mjs scripts/s3-testsuite-lauf.mjs scripts/s3-dss-vergleich.mjs
} > "$OUT/00-werkzeuge.txt" 2>&1

{
  echo "# S3 Testsuite erzeugen (Gut- und Schlechtfälle, testsuite/dokumente/*.hpro, testsuite/faelle.json)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run node scripts/s3-testsuite.mjs
  echo "SHA-256 der Dokumente:"
  (cd "$SUITE" && sha256sum testzertifikat.pem dokumente/*.hpro)
} > "$OUT/01-testsuite-erzeugen.txt" 2>&1

{
  echo "# S3 Testsuite ausführen: jedes Dokument mit dem Prüfer des Kerns, Vergleich mit der Erwartung"
  echo "# (gefundene Regeln exakt, Urteil je Stufe, Zielregeln gelaufen, nur erlaubte Gründe für 'nicht geprüft', Berichtsschema)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run node scripts/s3-testsuite-lauf.mjs --json "$OUT/02-testsuite-lauf.json"
} > "$OUT/02-testsuite-lauf.txt" 2>&1

{
  echo "# S3 Kommandozeile: npm run hpro-check <datei> (Abnahmekriterien 1 und 4)"
  echo "# Textausgabe nach Teil 1, 4.4; JSON-Bericht nach 4.3 (--format json / --json); Rückgabecodes nach 4.5"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run npm run hpro-check "$SUITE/dokumente/schlecht-inh-008-alt.hpro"
  run npm run hpro-check -- "$SUITE/dokumente/schlecht-cont-001-kein-zip.hpro" --no-epubcheck
  run npm run hpro-check -- "$SUITE/dokumente/gut-basis.hpro" --redacted "nicht vorhanden"
  run npm run hpro-check -- "$SUITE/dokumente/schlecht-fassung-manipuliert.hpro" --trust "$SUITE/testzertifikat.pem" --time "$VT" --no-epubcheck --json "$OUT/berichte/schlecht-fassung-manipuliert.json"
  run npm run hpro-check -- "$SUITE/dokumente/gut-fassungen.hpro" --trust "$SUITE/testzertifikat.pem" --time "$VT" --no-epubcheck --no-not-checked --json "$OUT/berichte/gut-fassungen.json"
  echo "## JSON-Ausgabe auf stdout (--format json), gekürzt auf Kopf und Zusammenfassung"
  echo "\$ npm run -s hpro-check -- $SUITE/dokumente/schlecht-meta-002-datum.hpro --format json --no-epubcheck"
  npm run -s hpro-check -- "$SUITE/dokumente/schlecht-meta-002-datum.hpro" --format json --no-epubcheck > "$OUT/berichte/schlecht-meta-002-datum.json"
  echo "[Exit-Code $?]"
  node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(JSON.stringify({spec:r.spec,catalog:r.catalog,tool:r.tool,file:r.file,levels:r.levels,summary:r.summary,results:r.results},null,2))' "$OUT/berichte/schlecht-meta-002-datum.json"
  echo
  echo "## Aufruffehler (Rückgabe 2)"
  run check
  run check "$SUITE/dokumente/gibt-es-nicht.hpro"
} > "$OUT/03-kommandozeile.txt" 2>&1

{
  echo "# S3 Dokumente des Prototyps gegen den Katalog (Abnahmekriterium 3)"
  echo "# prototyp/ergebnisse/container/ aus Phase 2 (build_container.py, DSS-signiert, docs/05) und der"
  echo "# Beispielcontainer des Kerns (P1); Prüfung mit EPUB-Validator; Vertrauensanker des Prototyps"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  for f in basis zielformat-2sig hybrid-manipuliert; do
    run npm run -s hpro-check -- "$PC/$f.epub" --trust "$PC/signer.pem" --json "$OUT/prototyp/$f.json"
  done
  node kern/build/bin/hpro.js sample "$TMP/kern-beispiel.hpro" > /dev/null
  run npm run -s hpro-check -- "$TMP/kern-beispiel.hpro" --json "$OUT/prototyp/kern-beispiel.json"
} > "$OUT/04-prototyp.txt" 2>&1
# Textberichte je Prototyp-Dokument zusätzlich einzeln ablegen
for f in basis zielformat-2sig hybrid-manipuliert; do
  check "$PC/$f.epub" --trust "$PC/signer.pem" > "$OUT/prototyp/$f.txt" 2>&1
done
check "$TMP/kern-beispiel.hpro" > "$OUT/prototyp/kern-beispiel.txt" 2>&1

{
  echo "# S3 EPUB-Validator (epubcheck 5.4.0) über alle guten Dokumente der Testsuite (HPR-CONT-024/028)"
  echo "# hpro-check ruft epubcheck auf einer Kopie mit Endung .epub auf und übernimmt dessen Meldungen"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run "$JAVA" -jar "$EPUBCHECK" "$SUITE/dokumente/gut-basis.hpro" --mode exp
  cp "$SUITE/dokumente/gut-basis.hpro" "$TMP/gut-basis.epub"
  run "$JAVA" -jar "$EPUBCHECK" "$TMP/gut-basis.epub"
  for f in "$SUITE"/dokumente/gut-*.hpro; do
    id=$(basename "$f" .hpro)
    out=$(check "$f" --trust "$SUITE/testzertifikat.pem" --time "$VT" --format json 2>&1)
    echo "$out" | node -e '
      let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        const r=JSON.parse(s);
        const ext=r.results.filter(x=>x.rule==="HPR-CONT-024"||x.rule==="HPR-CONT-028");
        const nc=r.notChecked.filter(x=>x.rule==="HPR-CONT-024").length?"NICHT GEPRÜFT":"geprüft";
        console.log(`${process.argv[1].padEnd(44)} epubcheck ${nc}: ${ext.length?ext.map(x=>`${x.class} ${x.rule} ${x.params.code} ${x.params.pfad}`).join("; "):"keine Meldung"}`);
      });' "$id"
  done
} > "$OUT/05-epubcheck.txt" 2>&1

{
  echo "# S3 Gegenprobe der Signatururteile (HPR-SIG-015/016) mit EU DSS 6.5 an allen signierten Dokumenten der Testsuite"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run node scripts/s3-dss-vergleich.mjs --json "$OUT/06-dss-vergleich.json"
} > "$OUT/06-dss-vergleich.txt" 2>&1

{
  echo "# S3 Messungen"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), $(nproc) CPU-Kerne, $(uname -sr)"
  echo
  echo "## Prüfdauer je Dokument (checkConformance im Kern, ohne externe Werkzeuge), aus 02-testsuite-lauf.json"
  node -e '
    const r=require("./'"$OUT"'/02-testsuite-lauf.json").faelle.map(f=>f.ms).sort((a,b)=>a-b);
    const q=p=>r[Math.min(r.length-1,Math.floor(p*r.length))];
    console.log(`Dokumente: ${r.length}, Minimum ${r[0]} ms, Median ${q(0.5)} ms, 90%-Quantil ${q(0.9)} ms, Maximum ${r[r.length-1]} ms, Summe ${r.reduce((a,b)=>a+b,0)} ms`);'
  echo
  echo "## Dokumentgrößen der Testsuite (Bytes)"
  ls -l "$SUITE"/dokumente/*.hpro | awk '{print $5}' | sort -n | awk '{a[NR]=$1} END {print "Minimum " a[1] ", Median " a[int((NR+1)/2)] ", Maximum " a[NR] ", Anzahl " NR}'
  echo
  echo "## Kommandozeile hpro-check (Node-Start, Katalog laden, Prüfung, Schemaprüfung), je 5 Läufe"
  for f in gut-basis gut-fassungen schlecht-nest-005-ueberblick; do
    for i in 1 2 3 4 5; do
      s=$(date +%s%N); check "$SUITE/dokumente/$f.hpro" --no-epubcheck --trust "$SUITE/testzertifikat.pem" --time "$VT" > /dev/null 2>&1; e=$(date +%s%N)
      echo "$f Lauf $i: $(( (e - s) / 1000000 )) ms"
    done
  done
  echo
  echo "## Mit EPUB-Validator (epubcheck 5.4.0, JVM-Start eingeschlossen), je 2 Läufe"
  for i in 1 2; do
    s=$(date +%s%N); check "$SUITE/dokumente/gut-basis.hpro" > /dev/null 2>&1; e=$(date +%s%N)
    echo "gut-basis mit epubcheck Lauf $i: $(( (e - s) / 1000000 )) ms"
  done
} > "$OUT/07-messung.txt" 2>&1

{
  echo "# S3 Testlauf (npm test: Kern mit Testsuite und Kommandozeilentest, Spezifikationsprüfer und Selbsttests)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run npm ci --no-audit --no-fund
  run npm test
} > "$OUT/08-npm-test.txt" 2>&1

rm -rf "$TMP"
grep -E "Fälle geschrieben" "$OUT/01-testsuite-erzeugen.txt"
grep -E "^(Ergebnis|Regeln)" "$OUT/02-testsuite-lauf.txt"
grep -E "^Stufe|\[Exit-Code" "$OUT/03-kommandozeile.txt"
grep -E "^(Prüfbericht|Befunde|Stufe)|\[Exit-Code" "$OUT/04-prototyp.txt"
grep -E "epubcheck (geprüft|NICHT)|Messages:" "$OUT/05-epubcheck.txt"
grep -E "^Ergebnis" "$OUT/06-dss-vergleich.txt"
grep -E "Dokumente:|Lauf 1" "$OUT/07-messung.txt"
grep -E "^ℹ (tests|pass|fail)|^(OK|FAILED|selftest)|\[Exit-Code" "$OUT/08-npm-test.txt"
