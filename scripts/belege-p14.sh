#!/usr/bin/env bash
# Evidence of package P14 (release, packaging, demo documents) into docs/belege/P14/:
#
#   00 Werkzeuge            04 eigene Prüfung (hpro check, calc, form, validate)
#   01 Lizenz               05 Signatur: EU DSS 6.5 und Manipulation
#   02 Release-Bau ×2       06 Rauchtest: Demos im Reader des Release-Archivs (Chromium)
#   03 epubcheck            07 Fremder Klon: BAUEN.md Schritt für Schritt in einem frischen git clone
#                           08 npm test
#
#   scripts/belege-p14.sh [teil ...]     teile: werkzeuge lizenz release epubcheck pruefung signatur
#                                        rauchtest fremd test (default: alle)
#
# Prerequisites: npm ci, prototyp/setup-tools.sh (JDK 21, epubcheck 5.4.0, DSS tool), app/.browsers
# (npm run e2e -w app installs it). Part "fremd" clones the committed HEAD, so commit first; it
# needs the npm registry and uses an npm cache inside the repository (prototyp/out/p14/npm-cache).
set -uo pipefail
cd "$(dirname "$0")/.."
OUT=docs/belege/P14
TMP=prototyp/out/p14
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
POLICY=docs/belege/P3/policy-hpro.xml
CERT=demo/schluessel/demo-pruefstelle.cert.pem
VT=2026-10-14T09:00:00Z
VERSION=$(node -p "require('./package.json').version")
mkdir -p "$OUT" "$TMP/tmp"
export TMPDIR="$PWD/$TMP/tmp"

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
hpro() { node kern/build/bin/hpro.js "$@"; }
dss() { "$JAVA" -Dorg.slf4j.simpleLogger.defaultLogLevel=warn -cp "prototyp/dss/target/classes:prototyp/dss/target/lib/*" example.hpro.HproDss "$@"; }
zipedit() { python3 prototyp/zipedit.py "$@"; }
stamp() { echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit: $(git rev-parse --short HEAD)$(git diff --quiet HEAD -- . ':!docs/belege/P14' ':!docs/09-arbeitsprotokoll.md' || echo ' (mit nicht eingecheckten Änderungen)')"; }
PARTS=("$@")
part() { [ ${#PARTS[@]} -eq 0 ] && return 0; local p; for p in "${PARTS[@]}"; do [ "$p" = "$1" ] && return 0; done; return 1; }

npm run -s build -w kern || exit 2
npm run -s build:test -w kern || exit 2

if part werkzeuge; then {
  echo "# P14 Werkzeuge und Umgebung"; stamp; echo
  run node --version
  run npm --version
  run git --version
  run bash -c 'tar --version | head -1'
  run bash -c '. /etc/os-release; echo "$PRETTY_NAME"; uname -srm'
  run bash -c 'echo "CPU-Takt max: $(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq 2>/dev/null) kHz, Last: $(cat /proc/loadavg)"'
  run "$JAVA" -version
  run "$JAVA" -jar "$EPUBCHECK" --version
  echo "DSS-Version laut Maven-Abhängigkeiten:"
  ls prototyp/dss/target/lib | grep -E '^dss-(xades|asic-xades|validation)-[0-9]'
  echo
  run hpro version
} > "$OUT/00-werkzeuge.txt" 2>&1; fi

if part lizenz; then {
  echo "# P14 Lizenz: Dateien, Prüfsummen, Felder in package.json, Prüfer Teil 2"; stamp; echo
  echo "Lizenztexte abgerufen am 14.10.2026 von https://www.apache.org/licenses/LICENSE-2.0.txt,"
  echo "https://creativecommons.org/licenses/by/4.0/legalcode.txt, https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt"
  echo
  run sha256sum LICENSE LICENSES/Apache-2.0.txt LICENSES/CC-BY-4.0.txt LICENSES/CC0-1.0.txt NOTICE
  run cmp LICENSE LICENSES/Apache-2.0.txt
  run bash -c 'head -4 LICENSES/Apache-2.0.txt; head -1 LICENSES/CC-BY-4.0.txt; sed -n 3p LICENSES/CC0-1.0.txt'
  echo "## license-Feld jedes package.json im Repository (ohne node_modules, Werkzeug- und Probenverzeichnisse)"
  echo
  run bash -c 'for f in $(git ls-files "*package.json" | grep -v "^\.ci-probe/"); do node -e "const p=require(\"./$f\"); console.log(\"$f\".padEnd(36), (p.name??\"\").padEnd(28), p.license ?? \"FEHLT\")"; done'
  echo "## Teil 2 der Spezifikation: Kopfzeile und Prüfer"
  echo
  run bash -c 'grep -n "^\*\*Lizenz dieses Dokuments" docs/spezifikation/02-lizenz-und-governance.md'
  run npm run -s gov:check
} > "$OUT/01-lizenz.txt" 2>&1; fi

if part release; then {
  echo "# P14 Release-Bau: scripts/release-bauen.sh zweimal auf demselben Stand, dann Vergleich"; stamp; echo
  rm -rf "$TMP/release-a" "$TMP/release-b"
  t0=$(date +%s); run scripts/release-bauen.sh "$TMP/release-a"; t1=$(date +%s)
  echo "Dauer Lauf A: $((t1 - t0)) s"; echo
  t0=$(date +%s); run scripts/release-bauen.sh "$TMP/release-b"; t1=$(date +%s)
  echo "Dauer Lauf B: $((t1 - t0)) s"; echo
  run diff "$TMP/release-a/SHA256SUMS" "$TMP/release-b/SHA256SUMS"
  run scripts/release-vergleichen.sh "$TMP/release-a" "$TMP/release-b"
  echo "## Inhalt der Pakete"
  echo
  run bash -c "tar -tzf $TMP/release-a/hpro-kern-$VERSION.tgz | grep -v -E '^package/(dist|cli)/' ; echo \"… dazu \$(tar -tzf $TMP/release-a/hpro-kern-$VERSION.tgz | grep -c -E '^package/(dist|cli)/') Dateien unter dist/ und cli/\""
  run tar -tzvf "$TMP/release-a/hpro-reader-$VERSION.tar.gz"
} > "$OUT/02-release-bau.txt" 2>&1
cp "$TMP/release-a/SHA256SUMS" "$OUT/SHA256SUMS-release-a.txt"; fi

if part epubcheck; then {
  echo "# P14 epubcheck 5.4.0 auf den drei Demo-Dokumenten (Kopie mit Endung .epub, Inhalt bytegleich)"; stamp; echo
  for n in bericht formular nachweis; do
    cp "demo/hpro-demo-$n.hpro" "$TMP/hpro-demo-$n.epub"
    run cmp "demo/hpro-demo-$n.hpro" "$TMP/hpro-demo-$n.epub"
    run "$JAVA" -jar "$EPUBCHECK" "$TMP/hpro-demo-$n.epub"
  done
} > "$OUT/03-epubcheck.txt" 2>&1; fi

if part pruefung; then {
  echo "# P14 Eigene Prüfung der Demo-Dokumente: Konformitätsprüfer (Teil 1, mit epubcheck), Rechner, Formular, Signatur"; stamp; echo
  run node scripts/demo-bauen.mjs --vergleichen
  run hpro check demo/hpro-demo-bericht.hpro --json "$TMP/pruefbericht-bericht.json"
  run hpro check demo/hpro-demo-formular.hpro --json "$TMP/pruefbericht-formular.json"
  run hpro check demo/hpro-demo-nachweis.hpro --trust "$CERT" --time "$VT" --json "$TMP/pruefbericht-nachweis.json"
  echo "## Nachweis ohne Vertrauensanker: Signatur rechnerisch intakt, Vertrauen nicht feststellbar (Hinweis, kein Fehler)"
  echo
  run hpro check demo/hpro-demo-nachweis.hpro --no-epubcheck --no-not-checked
  echo "## Rechnende Tabelle des Berichts"
  echo
  run hpro calc check demo/hpro-demo-bericht.hpro
  echo "## Formular: leer (Absenden nicht möglich, Exit 1 erwartet), dann ausgefüllt und abgesendet"
  echo
  run hpro form check demo/hpro-demo-formular.hpro
  run hpro form submit demo/hpro-demo-formular.hpro "$TMP/formular-abgesendet.hpro" --time 2026-10-14T10:00:00Z \
    --set "name=Maria Muster" --set personalnummer=04711 --set abteilung=wasser --set "zweck=Schulung Trinkwasserhygiene" \
    --set ziel=Innsbruck --set reisetag=2026-10-13 --set dauer_stunden=9 --set anreise=pkw --set kennzeichen=I-12345X \
    --set kilometer=86 --set parken=7,50 --set vorschuss=20 --set "iban=AT61 1904 3002 3457 3201" --set angaben_richtig=true \
    --export "$TMP/formular-abgesendet.json"
  run cat "$TMP/formular-abgesendet.json"
  run hpro check "$TMP/formular-abgesendet.hpro" --no-epubcheck --no-not-checked
  echo "## Signatur des Nachweises"
  echo
  run hpro validate demo/hpro-demo-nachweis.hpro --trust "$CERT" --time "$VT"
} > "$OUT/04-eigene-pruefung.txt" 2>&1; fi

if part signatur; then {
  echo "# P14 Signatur des Nachweises: EU DSS 6.5 als unabhängige Gegenprobe, Manipulation nach der Signatur"; stamp
  echo "# Richtlinie $POLICY (wie S7/P3: application/epub+zip als mimetype zulässig); Vertrauensanker: Demo-Zertifikat"; echo
  run dss validate demo/hpro-demo-nachweis.hpro "$CERT" "$POLICY"
  echo "## Ergebnis nach der Signatur geändert („bestanden“ → „nicht bestanden“ in Zeile 1)"
  echo
  run zipedit replace demo/hpro-demo-nachweis.hpro "$TMP/nachweis-manipuliert.hpro" content/index.xhtml "<td>0,05 bar</td><td>bestanden</td>" "<td>0,05 bar</td><td>nicht bestanden</td>"
  run hpro validate "$TMP/nachweis-manipuliert.hpro" --trust "$CERT" --time "$VT"
  run dss validate "$TMP/nachweis-manipuliert.hpro" "$CERT" "$POLICY"
  run hpro check "$TMP/nachweis-manipuliert.hpro" --trust "$CERT" --time "$VT" --no-epubcheck --no-not-checked
} > "$OUT/05-signatur-dss.txt" 2>&1; fi

if part rauchtest; then {
  echo "# P14 Rauchtest: Reader aus dem Release-Archiv (statischer Server im Testprozess), drei Demos in drei Breiten"; stamp; echo
  [ -f "$TMP/release-a/hpro-reader-$VERSION.tar.gz" ] || scripts/release-bauen.sh "$TMP/release-a" >/dev/null 2>&1
  rm -rf "$TMP/reader" && mkdir -p "$TMP/reader"
  tar -xzf "$TMP/release-a/hpro-reader-$VERSION.tar.gz" -C "$TMP/reader"
  rm -rf "$OUT/bilder"
  run env PLAYWRIGHT_BROWSERS_PATH="$PWD/app/.browsers" node scripts/p14-rauchtest.mjs "$TMP/reader/hpro-reader-$VERSION" "$OUT/bilder"
} > "$OUT/06-rauchtest.txt" 2>&1; fi

if part fremd; then {
  echo "# P14 Fremder Klon: BAUEN.md Schritt für Schritt in einem frischen git clone des eingecheckten Stands"; stamp
  echo "# npm-Cache im Repository ($TMP/npm-cache, anfangs leer), damit nichts aus früheren Läufen hilft"; echo
  F="$PWD/$TMP/fremd"
  rm -rf "$F" "$TMP/npm-cache" "$TMP/fremd-paket"
  export npm_config_cache="$PWD/$TMP/npm-cache"
  run git clone --quiet "$PWD" "$F"
  run git -C "$F" log -1 --format='%h %ci %s'
  echo "## Schritt 2: npm ci"
  echo
  t0=$(date +%s); (cd "$F" && run npm ci --no-audit --no-fund); t1=$(date +%s); echo "Dauer npm ci: $((t1 - t0)) s"; echo
  echo "## Schritt 3: scripts/release-bauen.sh"
  echo
  t0=$(date +%s); (cd "$F" && run scripts/release-bauen.sh); t1=$(date +%s); echo "Dauer Release-Bau: $((t1 - t0)) s"; echo
  echo "## Schritt 4: zweiter Bau im Klon und Vergleich; dann Vergleich mit dem Bau im Arbeitsverzeichnis (Lauf A)"
  echo
  (cd "$F" && run scripts/release-bauen.sh release-2 >/dev/null && run scripts/release-vergleichen.sh release release-2)
  run scripts/release-vergleichen.sh "$TMP/release-a" "$F/release"
  echo "## Schritt 5: Demo-Dokumente im Klon prüfen"
  echo
  (cd "$F" && npm run -s build:test -w kern >/dev/null 2>&1 \
    && run node kern/build/bin/hpro.js check demo/hpro-demo-bericht.hpro --no-epubcheck \
    && run node kern/build/bin/hpro.js check demo/hpro-demo-formular.hpro --no-epubcheck \
    && run node kern/build/bin/hpro.js check demo/hpro-demo-nachweis.hpro --no-epubcheck --trust demo/schluessel/demo-pruefstelle.cert.pem --time 2026-10-14T09:00:00Z \
    && run node kern/build/bin/hpro.js validate demo/hpro-demo-nachweis.hpro --trust demo/schluessel/demo-pruefstelle.cert.pem --time 2026-10-14T09:00:00Z)
  echo "## Schritt 6: Kommandozeile aus dem Paket, ohne Repository"
  echo
  mkdir -p "$TMP/fremd-paket"
  (cd "$TMP/fremd-paket" && run npm init -y >/dev/null && run npm install --no-audit --no-fund "$F/release/hpro-kern-$VERSION.tgz" \
    && run npx --no-install hpro version && run npx --no-install hpro check "$F/demo/hpro-demo-bericht.hpro" --no-epubcheck --no-not-checked \
    && run bash -c 'ls node_modules/@hpro/kern; node -p "require(\"./node_modules/@hpro/kern/package.json\").license"')
  rm -rf "$F/node_modules" "$TMP/npm-cache"
} > "$OUT/07-fremder-klon.txt" 2>&1; fi

if part test; then {
  echo "# P14 npm test (Bestandstest: Kern, Reader mit Vitest und Playwright, alle Prüfer)"; stamp; echo
  t0=$(date +%s); run npm test; t1=$(date +%s); echo "Dauer: $((t1 - t0)) s"
} > "$OUT/08-npm-test.txt" 2>&1; fi
echo "fertig: $OUT"
