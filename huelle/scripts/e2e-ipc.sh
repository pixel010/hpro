#!/usr/bin/env bash
# IPC isolation test of the desktop shell (P11, acceptance criterion 2), on Linux/WebKitGTK –
# the platform where Tauri cannot tell iframe requests from the window (docs/06, A7).
# Builds the shell with `--features e2e`, starts it under Xvfb with a container as launch
# argument and lets huelle/e2e/ipc-probe.js drive it; then checks the record (e2e-ipc-check.py).
# Output: huelle/.tmp/e2e-ipc/ (record, stderr, screenshot), exit code of the check.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/umgebung.sh
OUT="$HUELLE/.tmp/e2e-ipc"
rm -rf "$OUT" && mkdir -p "$OUT/dok"
[ -f dist-web/beispiel.hpro ] || npm run build:web
(cd src-tauri && cargo build --release --features e2e,tauri/custom-protocol --target-dir target/e2e 2>&1 | tail -3)
BIN="$HUELLE/src-tauri/target/e2e/release/hpro-desktop"
cp dist-web/beispiel.hpro "$OUT/dok/Beispiel Dokument.hpro"
hpro_laufzeit
export HPRO_E2E_OUT="$OUT/record.jsonl" HPRO_E2E_JS="$HUELLE/e2e/ipc-probe.js"
set +e
xvfb-run -a -s "-screen 0 1280x900x24" dbus-run-session --config-file="$S/usr/share/dbus-1/session.conf" -- bash -c "
  timeout 180 '$BIN' '$OUT/dok/Beispiel Dokument.hpro' 2> '$OUT/stderr.log' &
  pid=\$!
  for i in \$(seq 1 90); do sleep 1; grep -q '\"kind\":\"report\".*attack' '$OUT/record.jsonl' 2>/dev/null && break; done
  sleep 1; import-im7.q16 -window root png:'$OUT/fenster.png' 2>/dev/null
  wait \$pid; echo \"exit=\$?\" > '$OUT/exit.txt'"
set -e
cat "$OUT/exit.txt" 2>/dev/null || true
python3 scripts/e2e-ipc-check.py "$OUT"
