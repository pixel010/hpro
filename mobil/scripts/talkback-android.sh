#!/usr/bin/env bash
# Criterion 4 (docs/06 4.4), Android part: does TalkBack reach the reader's interface and the
# document in the sandboxed document frame? Runs in the emulator of e2e-android.sh (TalkBack
# 14.x is part of the google_apis system image).
#   1. The reader is started with "Beispiel Bericht.hpro" (VIEW intent, e2e mode `launch`).
#   2. TalkBack is switched on (secure settings; the same switch as Settings > Accessibility).
#   3. The accessibility tree as accessibility services see it is dumped (uiautomator) and
#      compared with the text blocks of the document (bericht.xhtml) and the reader's buttons.
#   4. TalkBack's own navigation: "next item" (Alt+Right, TalkBack's default keymap; the AVD has
#      a hardware keyboard) is sent N times while `uiautomator events` records which node gets the
#      accessibility focus and what text it carries – the text TalkBack speaks.
# Usage: talkback-android.sh OUTDIR [steps]   (emulator running, debug app installed, documents
# pushed by e2e-android.sh). The verdict lines come from talkback-check.py.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/umgebung.sh
D="$1/talkback"
STEPS="${2:-60}"
mkdir -p "$D"
PKG=org.hpro.reader
TB=com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService
stamp() { date '+%H:%M:%S'; }

adb shell pm list packages --show-versioncode com.google.android.marvin.talkback | tr -d '\r' > "$D/talkback-version.txt"
adb shell am force-stop "$PKG"
adb shell "run-as $PKG sh -c 'rm -rf e2e; mkdir -p e2e && echo launch > e2e/mode'"
# Handed over through the app's own FileProvider, as in e2e-android.sh (app_uri): the shell holds
# no read grant for MediaStore files it could pass on.
adb push ../huelle/dist-web/beispiel.hpro /data/local/tmp/beispiel.hpro >/dev/null
adb shell "cat /data/local/tmp/beispiel.hpro | run-as $PKG sh -c 'cat > cache/beispiel.hpro'; rm /data/local/tmp/beispiel.hpro"
echo "[$(stamp)] Reader mit Beispiel Bericht.hpro starten"
adb shell am start -W -a android.intent.action.VIEW -d "content://$PKG.fileprovider/my_cache_images/beispiel.hpro" -t application/vnd.hpro+zip --grant-read-uri-permission -n "$PKG/.MainActivity" | tr -d '\r' | grep -E "Status|TotalTime" || true
t0=$(date +%s)
until [[ "$(adb shell run-as "$PKG" cat e2e/record.jsonl 2>/dev/null)" == *Projektbericht* ]]; do
  [ $(( $(date +%s) - t0 )) -gt 900 ] && { echo "Dokument nach 900 s nicht angezeigt" >&2; break; }
  sleep 5
done
echo "[$(stamp)] Dokument angezeigt nach $(( $(date +%s) - t0 )) s"

echo "[$(stamp)] TalkBack einschalten"
adb shell settings put secure enabled_accessibility_services "$TB"
adb shell settings put secure accessibility_enabled 1
t0=$(date +%s)
until [[ "$(adb shell dumpsys accessibility)" == *"Bound services:{"*TalkBack* ]]; do
  [ $(( $(date +%s) - t0 )) -gt 300 ] && break
  sleep 5
done
sleep 60
adb shell dumpsys accessibility | tr -d '\r' | grep -E "Bound services|Enabled services|touchExplorationEnabled|isTouchExplorationEnabled" > "$D/dienste.txt" || true
cat "$D/dienste.txt"
# TalkBack's first-run tutorial may cover the app; Back closes it.
adb shell dumpsys activity activities | tr -d '\r' | grep topResumedActivity | tee "$D/vorn-1.txt" || true
if grep -q talkback "$D/vorn-1.txt"; then adb shell input keyevent KEYCODE_BACK; sleep 20; fi

echo "[$(stamp)] Accessibility-Baum (uiautomator dump)"
adb shell uiautomator dump --compressed /sdcard/tb-baum.xml >/dev/null 2>&1 || adb shell uiautomator dump /sdcard/tb-baum.xml >/dev/null 2>&1 || true
adb shell cat /sdcard/tb-baum.xml > "$D/baum.xml" 2>/dev/null || true
adb exec-out screencap -p > "$D/bildschirm-talkback.png" || true

echo "[$(stamp)] TalkBack-Navigation: $STEPS x nächstes Element (Alt+Rechts)"
adb shell "uiautomator events > /sdcard/tb-events.txt 2>&1 & echo \$! > /sdcard/tb-events.pid"
sleep 10
for i in $(seq 1 "$STEPS"); do
  adb shell input keycombination KEYCODE_ALT_LEFT KEYCODE_DPAD_RIGHT
  sleep 4
done
sleep 10
adb shell 'kill $(cat /sdcard/tb-events.pid)' || true
adb shell cat /sdcard/tb-events.txt > "$D/ereignisse.txt" 2>/dev/null || true
adb exec-out screencap -p > "$D/bildschirm-ende.png" || true
adb shell dumpsys accessibility | tr -d '\r' | grep -E "Bound services" > "$D/dienste-ende.txt" || true

echo "[$(stamp)] TalkBack ausschalten"
adb shell settings put secure enabled_accessibility_services '""'
adb shell settings put secure accessibility_enabled 0
adb shell "run-as $PKG sh -c 'echo exit > e2e/mode'" || true
sleep 5
adb shell am force-stop "$PKG"
python3 scripts/talkback-check.py "$D" ../huelle/dist-web/beispiel.hpro
