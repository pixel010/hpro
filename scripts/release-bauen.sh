#!/usr/bin/env bash
# Builds the release artefacts of hpro (P14) into release/ (or the directory given as $1):
#
#   hpro-kern-<v>.tgz           npm package @hpro/kern: library, command line hpro/hpro-check, spec files, LICENSE
#   hpro-reader-<v>.tar.gz      reader web app (static files, PWA), with LICENSE, NOTICE and third-party licence texts
#   hpro-demo-bericht.hpro      demo documents (built from demo/quellen/, compared with the files in demo/)
#   hpro-demo-formular.hpro
#   hpro-demo-nachweis.hpro
#   SHA256SUMS                  checksums of all of the above
#
# Prerequisite: `npm ci` in the repository root (Node >= 22). No network, no Java needed.
# Every step is deterministic, so two runs on the same commit give the same SHA256SUMS
# (checked in docs/belege/P14, scripts/belege-p14.sh). Archives get the commit time as mtime.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
OUT=$(realpath -m "${1:-release}")
VERSION=$(node -p "require('./package.json').version")
# Fixed time for archive entries: the commit time of HEAD (reproducible, no wall clock).
EPOCH=$(git log -1 --format=%ct 2>/dev/null || echo 1791936000)
export SOURCE_DATE_EPOCH=$EPOCH

step() { printf '\n== %s\n' "$*"; }

node -e 'const [maj]=process.versions.node.split(".").map(Number); if (maj < 22) { console.error("Node >= 22 nötig, gefunden " + process.version); process.exit(2); }'
[ -d node_modules ] || { echo "node_modules fehlt: zuerst npm ci ausführen" >&2; exit 2; }

rm -rf "$OUT"
mkdir -p "$OUT"
WORK=$(mktemp -d "$ROOT/release-tmp.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

step "1/4 Kern bauen (kern/dist)"
npm run -s build -w kern

step "2/4 Demo-Dokumente aus demo/quellen/ bauen und mit demo/ vergleichen"
node scripts/demo-bauen.mjs "$OUT"
node scripts/demo-bauen.mjs --vergleichen

step "3/4 npm-Paket @hpro/kern packen"
npm pack -w kern --pack-destination "$OUT" --silent >/dev/null
ls "$OUT"/hpro-kern-"$VERSION".tgz >/dev/null

step "4/4 Reader (Web-App) bauen und als Archiv packen"
npm run -s build -w app >/dev/null
R="$WORK/hpro-reader-$VERSION"
mkdir -p "$R/third-party"
cp -r app/dist/. "$R/"
# Source maps stay out of the release archive (they contain absolute build paths only in name, but
# double the size and are not needed to run the reader).
find "$R" -name '*.map' -delete
cp LICENSE NOTICE "$R/"
cp node_modules/@xmldom/xmldom/LICENSE "$R/third-party/xmldom-LICENSE.txt"
cat > "$R/LIESMICH.txt" <<EOF
hpro Reader $VERSION (Web-App)

Statische Dateien: mit einem beliebigen Webserver ausliefern und index.html im Browser öffnen,
zum Beispiel lokal:   python3 -m http.server 8080 --bind 127.0.0.1   und dann http://127.0.0.1:8080/
Direkt aus dem Dateisystem (file://) startet die App nicht, weil Browser dort keine Module und
keinen Service Worker laden. Kurzanleitung: docs/anwender-kurzanleitung.md im Quell-Repository.

Lizenz: Apache-2.0 (LICENSE). Enthaltene Fremdbibliothek: @xmldom/xmldom (MIT, third-party/).
EOF
tar --sort=name --mtime="@$EPOCH" --owner=0 --group=0 --numeric-owner --format=gnu \
  -C "$WORK" -cf - "hpro-reader-$VERSION" | gzip -n -9 > "$OUT/hpro-reader-$VERSION.tar.gz"

(cd "$OUT" && sha256sum hpro-kern-"$VERSION".tgz hpro-reader-"$VERSION".tar.gz hpro-demo-*.hpro > SHA256SUMS)
step "Ergebnis in $OUT"
ls -l "$OUT"
cat "$OUT/SHA256SUMS"
