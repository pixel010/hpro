#!/usr/bin/env bash
# Android tests of the Tauri mobile shell (P12, docs/06 4.4) in the emulator:
#   ipc     criterion 1 – attack page in the document frame against the Tauri IPC
#   launch  criterion 2 – which apps' intents reach the reader; file manager (DocumentsUI) tap;
#           mail-style VIEW and SEND intents; cold start and onNewIntent
#   read    criterion 3 – 24 MiB document through the Kotlin plugin, frame stalls, ANR check
#   print   A10 + criterion 3 – window.print() vs. the reader's print button (PrintManager)
# Usage: mobil/scripts/e2e-android.sh [ipc|launch|read|print]...   (default: all four)
# Builds the debug APK with `--features e2e` (drivers compiled in), starts the emulator if
# needed (no KVM on the test host: software emulation) and writes everything to
# mobil/.tmp/e2e/<scenario>/. The checks are in e2e-android-check.py.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/umgebung.sh
. scripts/emulator.sh
PKG=org.hpro.reader
OUT="$MOBIL/.tmp/e2e"
SCENARIOS=("$@")
[ ${#SCENARIOS[@]} -gt 0 ] || SCENARIOS=(ipc launch read print)
mkdir -p "$OUT"

stamp() { date '+%H:%M:%S'; }

build_apk() {
  echo "[$(stamp)] Debug-APK mit --features e2e bauen"
  local t0; t0=$(date +%s)
  npx tauri android build --debug --apk --target x86_64 --features e2e 2>&1 | grep -E "Finished|error|Error|warning: unused|apk" | tail -8
  echo "[$(stamp)] Build: $(( $(date +%s) - t0 )) s"
}
APK=src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk

rec() { adb shell run-as "$PKG" cat e2e/record.jsonl 2>/dev/null | tr -d '\r'; }
set_mode() { adb shell "run-as $PKG sh -c 'mkdir -p e2e && echo $1 > e2e/mode'"; }

# Fresh record and mode; app stopped.
prepare() {
  adb shell am force-stop "$PKG"
  adb shell "run-as $PKG sh -c 'rm -rf e2e; mkdir -p e2e && echo $1 > e2e/mode'"
  adb logcat -c
}

wait_record() { # pattern, seconds
  local t0; t0=$(date +%s)
  until rec | grep -q "$1"; do
    if [ $(( $(date +%s) - t0 )) -gt "$2" ]; then echo "[$(stamp)] Zeitüberschreitung beim Warten auf $1" >&2; return 1; fi
    sleep 3
  done
}

finish() { # dir
  rec > "$1/record.jsonl" || true
  adb logcat -d -v time > "$1/logcat.txt" 2>/dev/null || true
  adb exec-out screencap -p > "$1/bildschirm.png" 2>/dev/null || true
}

# content:// URI of a file in Download (MediaStore, as the Files app would hand it over).
media_uri() {
  local id
  id=$(adb shell content query --uri content://media/external/file --projection _id --where "\"_display_name='$1'\"" | tr -d '\r' | sed -n 's/.*_id=\([0-9]*\).*/\1/p' | head -1)
  [ -n "$id" ] && echo "content://media/external/file/$id"
}

push_docs() {
  adb shell 'rm -f /sdcard/Download/*.hpro /sdcard/Download/*.bin'
  adb push ../huelle/dist-web/beispiel.hpro "/sdcard/Download/Beispiel Bericht.hpro" >/dev/null
  adb push ../huelle/dist-web/kostenschaetzung.hpro "/sdcard/Download/Kostenschätzung.hpro" >/dev/null
  adb push ../huelle/dist-web/druck.hpro "/sdcard/Download/Druckprobe.hpro" >/dev/null
  head -c $((24 * 1024 * 1024)) /dev/urandom > "$OUT/gross.hpro"
  adb push "$OUT/gross.hpro" "/sdcard/Download/Gross.hpro" >/dev/null
  # MediaProvider indexes pushed files on a scan of the volume.
  adb shell content call --uri content://media/none --method scan_volume --arg external_primary >/dev/null 2>&1 || true
  sleep 5
  for f in "Beispiel Bericht.hpro" "Kostenschätzung.hpro" "Druckprobe.hpro" "Gross.hpro"; do
    echo "  $f -> $(media_uri "$f")"
  done
}

view() { # uri [mime]
  adb shell am start -W -a android.intent.action.VIEW -d "'$1'" -t "${2:-application/vnd.hpro+zip}" --grant-read-uri-permission -n "$PKG/.MainActivity" | tr -d '\r' | grep -E "Status|LaunchState|TotalTime|Error" || true
}

run_ipc() {
  local d="$OUT/ipc"; rm -rf "$d"; mkdir -p "$d"
  prepare ipc
  echo "[$(stamp)] ipc: Start mit Dokument (VIEW)"
  view "$(media_uri 'Beispiel Bericht.hpro')"
  wait_record '"exit"' 900 || true
  finish "$d"
}

run_launch() {
  local d="$OUT/launch"; rm -rf "$d"; mkdir -p "$d"
  local u1 u2; u1=$(media_uri 'Beispiel Bericht.hpro'); u2=$(media_uri 'Kostenschätzung.hpro')
  {
    echo "== Welche Activities nehmen welche Intents an (cmd package query-activities) =="
    for t in application/vnd.hpro+zip application/octet-stream application/zip; do
      for a in VIEW SEND; do
        local extra=""; [ "$a" = SEND ] && extra="--eu android.intent.extra.STREAM $u1"
        local data="-d $u1"; [ "$a" = SEND ] && data=""
        echo "-- $a type=$t"
        # shellcheck disable=SC2086
        adb shell cmd package query-activities --brief -a "android.intent.action.$a" -t "$t" $data $extra | tr -d '\r' | grep -v '^$' || true
      done
    done
  } > "$d/intents.txt"
  cat "$d/intents.txt"

  prepare launch
  echo "[$(stamp)] launch: Kaltstart mit VIEW (wie Dateimanager, Typ application/vnd.hpro+zip)"
  view "$u1" | tee "$d/start1.txt"
  wait_record 'Projektbericht\|"shown"\|error-shown' 600 || true
  echo "[$(stamp)] launch: zweites Dokument an die laufende App (onNewIntent), Typ application/octet-stream wie ein Mail-Anhang"
  view "$u2" application/octet-stream | tee "$d/start2.txt"
  sleep 20
  echo "[$(stamp)] launch: Teilen (SEND mit EXTRA_STREAM)"
  adb shell am start -W -a android.intent.action.SEND -t application/octet-stream --eu android.intent.extra.STREAM "'$(media_uri 'Druckprobe.hpro')'" --grant-read-uri-permission -n "$PKG/.MainActivity" | tr -d '\r' | grep -E "Status|Error" | tee "$d/start3.txt" || true
  sleep 20
  adb exec-out screencap -p > "$d/nach-senden.png" 2>/dev/null || true
  set_mode exit
  wait_record '"exit"' 120 || true
  finish "$d"
  "$MOBIL/scripts/dateimanager-android.sh" "$d" || true
}

run_read() {
  local d="$OUT/read"; rm -rf "$d"; mkdir -p "$d"
  prepare read
  echo "[$(stamp)] read: 24 MiB über das Kotlin-Plugin"
  view "$(media_uri 'Gross.hpro')"
  wait_record '"step":"read"' 900 || true
  set_mode exit
  wait_record '"exit"' 120 || true
  finish "$d"
  adb shell dumpsys activity anr > "$d/anr.txt" 2>&1 || true
  adb shell ls -l /data/anr > "$d/anr-dateien.txt" 2>&1 || true
}

run_print() {
  local d="$OUT/print"; rm -rf "$d"; mkdir -p "$d"
  prepare print
  echo "[$(stamp)] print: Druckprobe öffnen, window.print(), danach Knopf Drucken"
  view "$(media_uri 'Druckprobe.hpro')"
  wait_record 'window-print-returned' 900 || true
  sleep 15
  adb shell dumpsys activity activities | tr -d '\r' | grep -E "topResumedActivity|ResumedActivity" > "$d/nach-window-print.txt" || true
  adb shell dumpsys print > "$d/dumpsys-print-1.txt" 2>&1 || true
  adb exec-out screencap -p > "$d/nach-window-print.png" 2>/dev/null || true
  set_mode print-button
  wait_record '"step":"print-button"' 900 || true
  local t0; t0=$(date +%s)
  until adb shell dumpsys activity activities | tr -d '\r' | grep -q "topResumedActivity.*printspooler"; do
    [ $(( $(date +%s) - t0 )) -gt 300 ] && break
    sleep 5
  done
  sleep 20
  adb shell dumpsys activity activities | tr -d '\r' | grep -E "topResumedActivity|ResumedActivity" > "$d/nach-druckknopf.txt" || true
  adb shell dumpsys print > "$d/dumpsys-print-2.txt" 2>&1 || true
  adb shell uiautomator dump /sdcard/ui-druck.xml >/dev/null 2>&1 && adb shell cat /sdcard/ui-druck.xml > "$d/ui-druck.xml" || true
  adb exec-out screencap -p > "$d/druckdialog.png" 2>/dev/null || true
  adb shell input keyevent KEYCODE_BACK || true
  set_mode exit
  wait_record '"exit"' 120 || true
  finish "$d"
}

if [ "${HPRO_SKIP_BUILD:-0}" != 1 ]; then build_apk; fi
emu_start
echo "[$(stamp)] Emulator bootet (ohne KVM) …"
echo "Boot: $(emu_wait_boot 5400) s"
adb shell getprop ro.build.version.release | tr -d '\r' | sed 's/^/Android /'
adb shell dumpsys webviewupdate | tr -d '\r' | grep -E "Current WebView package" || true
adb install -r -t "$APK" | tail -1
push_docs
for s in "${SCENARIOS[@]}"; do "run_$s"; done
adb shell am force-stop "$PKG"
python3 scripts/e2e-android-check.py "$OUT" "${SCENARIOS[@]}"
