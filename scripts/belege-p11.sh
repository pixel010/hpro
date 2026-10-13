#!/usr/bin/env bash
# Belege P11 (Desktop-Hülle, Tauri 2) nach docs/belege/P11/.
#   00 Werkzeuge und Versionen
#   01 cargo test (Einheitstests der Hülle, u. a. Capability = Befehlsliste)
#   02 Release-Build (tauri build --bundles deb), Auszug
#   03 IPC-Isolation: Dokumentrahmen erreicht keinen Befehl (huelle/scripts/e2e-ipc.sh)
#   04 Dateimanager: Thunar öffnet einen Container mit dem Release-Build (huelle/scripts/dateimanager.sh)
#   05 Signatur mit Systemschlüssel (PKCS#11/SoftHSM) und PDF über den Sidecar (huelle/scripts/e2e-signatur.sh)
#   06 Gegenprüfung der signierten Container: Kern, EU DSS 6.5, epubcheck 5.4.0; PDF mit veraPDF
#   07 Paketgrößen (huelle/scripts/groessen.sh)
#   08 npm test des ganzen Repos (enthält app/test/desktop.test.ts, die Brücke der Web-App)
# Voraussetzungen: huelle/scripts/sysroot.sh (Rust, WebKitGTK-Sysroot), prototyp/setup-tools.sh, dienst/setup-dienst.sh.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT=docs/belege/P11
mkdir -p "$OUT/bilder"
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
VERAPDF=prototyp/tools/verapdf-1.30.3/verapdf
export JAVA_HOME="$ROOT/prototyp/tools/jdk-21.0.12.1+1"
dss() { "$JAVA" -Dorg.slf4j.simpleLogger.defaultLogLevel=warn -cp "prototyp/dss/target/classes:prototyp/dss/target/lib/*" example.hpro.HproDss "$@"; }
stamp() { echo "Stand: $(date -Iseconds) · Rechner: $(uname -srm) · $(nproc) Kerne, max. $(($(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq 2>/dev/null || echo 0)/1000)) MHz"; echo; }
run() { echo "\$ $*"; "$@"; echo "[exit $?]"; echo; }
. huelle/scripts/umgebung.sh

{
  echo "# P11 Werkzeuge"; stamp
  run rustc -V; run cargo -V; run node -v; run npx --prefix huelle tauri --version
  echo "## Crates (Cargo.lock)"; grep -A1 -E '^name = "(tauri|wry|tao|webkit2gtk|tauri-plugin-dialog|tauri-plugin-single-instance|cryptoki)"$' huelle/src-tauri/Cargo.lock | grep -v '^--'
  echo; echo "## WebKitGTK/GTK im Sysroot (Debian 13, nicht auf dem Rechner installiert, kein root)"
  run pkg-config --modversion webkit2gtk-4.1 gtk+-3.0 libsoup-3.0
  run "$JAVA" -version
} > "$OUT/00-werkzeuge.txt" 2>&1

{
  echo "# P11 cargo test (Hülle)"; stamp
  (cd huelle/src-tauri && run cargo test --release --features tauri/custom-protocol 2>&1 | grep -v -E '^\s+(Compiling|Downloaded)')
} > "$OUT/01-cargo-test.txt" 2>&1

{
  echo "# P11 Release-Build Linux (npx tauri build --bundles deb)"; stamp
  cd huelle
  t0=$(date +%s)
  npx tauri build --bundles deb > .tmp/build-belege.log 2>&1
  echo "[exit $?] Dauer $(($(date +%s) - t0)) s"
  grep -v -E '^\s+(Compiling|Downloaded|Downloading)' .tmp/build-belege.log | tail -40
  cd ..
} > "$OUT/02-release-build.txt" 2>&1

{ echo "# P11 IPC-Isolation (huelle/scripts/e2e-ipc.sh)"; stamp; huelle/scripts/e2e-ipc.sh; echo "[exit $?]";
  echo; echo "## Aufzeichnung (record.jsonl)"; cat huelle/.tmp/e2e-ipc/record.jsonl;
  echo; echo "## stderr der Hülle"; cat huelle/.tmp/e2e-ipc/stderr.log; } > "$OUT/03-ipc-isolation.txt" 2>&1
cp huelle/.tmp/e2e-ipc/fenster.png "$OUT/bilder/03-ipc-angriffsseite.png" 2>/dev/null

{ echo "# P11 Dateimanager (huelle/scripts/dateimanager.sh)"; stamp; huelle/scripts/dateimanager.sh; echo "[exit $?]"; } > "$OUT/04-dateimanager.txt" 2>&1
for f in 1-thunar 2-ausgewaehlt 3-reader 4-zweite-datei; do cp "huelle/.tmp/dateimanager/$f.png" "$OUT/bilder/04-$f.png" 2>/dev/null; done

{ echo "# P11 Signatur mit Systemschlüssel und PDF über den Sidecar (huelle/scripts/e2e-signatur.sh)"; stamp; huelle/scripts/e2e-signatur.sh; echo "[exit $?]";
  echo; echo "## Token-Inhalt (p11tool)"; cat huelle/.tmp/e2e-signatur/token-inhalt.txt
  echo; echo "## Aufzeichnung (record.jsonl)"; cat huelle/.tmp/e2e-signatur/record.jsonl;
  echo; echo "## stderr der Hülle"; cat huelle/.tmp/e2e-signatur/stderr.log; } > "$OUT/05-signatur-sidecar.txt" 2>&1
for f in huelle/.tmp/e2e-signatur/dialog-*.png; do [ -f "$f" ] && cp "$f" "$OUT/bilder/05-$(basename "$f")"; done

E=huelle/.tmp/e2e-signatur
mkdir -p "$OUT/container"
{
  echo "# P11 Gegenprüfung der in der Hülle signierten Container"; stamp
  ls -la $E/dok
  for f in $E/dok/*-signiert*.hpro; do
    cp "$f" "$OUT/container/"; cp "$f" "${f%.hpro}.epub"
  done
  cp $E/pki/rsa.pem $E/pki/ec.pem "$OUT/container/"
  for f in $E/dok/*-signiert*.hpro; do
    echo "## $(basename "$f")"
    run node kern/build/bin/hpro.js validate "$f" --trust $E/pki/rsa.pem --trust $E/pki/ec.pem
    run dss validate-ts "${f%.hpro}.epub" - $E/pki/rsa.pem $E/pki/ec.pem
    run "$JAVA" -jar "$EPUBCHECK" "${f%.hpro}.epub"
  done
  echo "## Manipulation nach dem Signieren (Text im ersten Inhaltsdokument ergänzt): Kern und DSS müssen ablehnen"
  m=$(ls $E/dok/*-signiert*.hpro | head -1)
  python3 - "$m" "$E/manipuliert.epub" <<'PY'
import sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(src) as zi, zipfile.ZipFile(dst, "w") as zo:
    done = False
    for info in zi.infolist():
        data = zi.read(info.filename)
        if not done and info.filename.endswith(".xhtml"):
            data = data.replace(b"</p>", " (nachträglich)</p>".encode(), 1); done = True
        zo.writestr(info, data, compress_type=zipfile.ZIP_STORED if info.filename == "mimetype" else zipfile.ZIP_DEFLATED)
print("manipuliert:", done)
PY
  run node kern/build/bin/hpro.js validate $E/manipuliert.epub --trust $E/pki/rsa.pem --trust $E/pki/ec.pem
  run dss validate-ts $E/manipuliert.epub - $E/pki/rsa.pem $E/pki/ec.pem
  echo "## PDF aus dem Sidecar (veraPDF 1.30.3, unabhängig vom Dienstbericht)"
  for p in $E/dok/*.pdf; do
    cp "$p" "$OUT/container/"
    run head -c 8 "$p"; echo
    for flav in 2a ua1; do "$VERAPDF" --flavour $flav --format text "$p" 2>&1 | tail -3; done
  done
} > "$OUT/06-gegenpruefung.txt" 2>&1

{ echo "# P11 Paketgrößen"; stamp; huelle/scripts/groessen.sh; } > "$OUT/07-groessen.txt" 2>&1

# The runner checks the same two commands after the run.
{ echo "# P11 npm ci und npm test (ganzes Repo)"; stamp; run npm ci --no-audit --no-fund; run npm test --if-present; } > "$OUT/08-npm-test.txt" 2>&1
echo "Belege unter $OUT"
grep -h -E "^(ok  |FAIL)" "$OUT/03-ipc-isolation.txt" | sort | uniq -c | sort -rn | head -3
