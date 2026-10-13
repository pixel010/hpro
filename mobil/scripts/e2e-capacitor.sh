#!/usr/bin/env bash
# Criterion 1 for the Capacitor comparison shell (mobil/capacitor): the attack of the Tauri test
# (mode ipc) against Capacitor's bridge, same emulator, same WebView, same web core.
# Usage: mobil/scripts/e2e-capacitor.sh   (builds the debug APK; drivers in mobil/e2e)
# Output: mobil/.tmp/e2e/capacitor-ipc/; check with e2e-android-check.py … capacitor-ipc.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/umgebung.sh
. scripts/emulator.sh
PKG=org.hpro.reader.capacitor
D="$MOBIL/.tmp/e2e/capacitor-ipc"
rm -rf "$D" && mkdir -p "$D"
if [ "${HPRO_SKIP_BUILD:-0}" != 1 ]; then
  (cd capacitor && npx cap sync android >/dev/null && cd android && echo "sdk.dir=$ANDROID_HOME" > local.properties && ./gradlew --no-daemon -q assembleDebug)
fi
APK=capacitor/android/app/build/outputs/apk/debug/app-debug.apk
# Emulator stopped at the end unless HPRO_KEEP_EMU=1 (see e2e-android.sh).
[ "${HPRO_KEEP_EMU:-0}" = 1 ] || trap emu_stop EXIT
emu_start
echo "Boot: $(emu_wait_boot 5400) s"
emu_webview
adb install -r -t "$APK" | tail -1
adb shell am force-stop "$PKG"
adb shell "run-as $PKG sh -c 'rm -rf files/e2e'" || true
adb logcat -c
adb shell am start -W -n "$PKG/.MainActivity" | tr -d '\r' | grep -E "Status|TotalTime" || true
t0=$(date +%s)
until adb shell run-as "$PKG" cat files/e2e/record.jsonl 2>/dev/null | grep -q '"exit"'; do
  [ $(( $(date +%s) - t0 )) -gt 900 ] && { echo "Zeitüberschreitung" >&2; break; }
  sleep 5
done
adb shell run-as "$PKG" cat files/e2e/record.jsonl 2>/dev/null | tr -d '\r' > "$D/record.jsonl" || true
adb logcat -d -v time > "$D/logcat.txt" 2>/dev/null || true
adb shell am force-stop "$PKG"
python3 scripts/e2e-android-check.py "$MOBIL/.tmp/e2e" capacitor-ipc
