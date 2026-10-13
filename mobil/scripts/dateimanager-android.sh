#!/usr/bin/env bash
# Criterion 2 (docs/06 4.4), file manager: opens the system's Files app (DocumentsUI) on the
# Download folder, finds "Beispiel Bericht.hpro" in the UI tree (uiautomator) and taps it like a
# user. Records which activity is in front afterwards, the UI tree and a screenshot. A second
# round long-presses nothing and uses "Open with" only if Files offers it.
# Usage (from e2e-android.sh): dateimanager-android.sh OUTDIR   (emulator running, app installed)
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/umgebung.sh
D="$1/dateimanager"
mkdir -p "$D"
PKG=org.hpro.reader
NAME="${HPRO_FM_FILE:-Beispiel Bericht.hpro}"

dump() { # file
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
  adb shell cat /sdcard/ui.xml > "$1" 2>/dev/null || true
}
center_of() { # xmlfile text -> "x y"
  python3 - "$1" "$2" <<'PY'
import re, sys, xml.etree.ElementTree as ET
try:
    root = ET.parse(sys.argv[1]).getroot()
except Exception:
    sys.exit(1)
for n in root.iter('node'):
    if n.get('text') == sys.argv[2] or n.get('content-desc') == sys.argv[2]:
        x1, y1, x2, y2 = map(int, re.findall(r'\d+', n.get('bounds')))
        print((x1 + x2) // 2, (y1 + y2) // 2)
        sys.exit(0)
sys.exit(1)
PY
}
front() { adb shell dumpsys activity activities | tr -d '\r' | grep -m1 "topResumedActivity" | sed 's/^ *//'; }

adb shell am force-stop "$PKG"
adb shell "run-as $PKG sh -c 'rm -rf e2e; mkdir -p e2e && echo launch > e2e/mode'"
adb shell am force-stop com.google.android.documentsui || true
# Files app, Download root (DocumentsUI handles BROWSE for a root URI).
adb shell am start -W -a android.provider.action.BROWSE -d content://com.android.providers.downloads.documents/root/downloads | tr -d '\r' | grep -E "Status|Activity" > "$D/start-dateien.txt" || true
pos=""
for i in $(seq 1 30); do
  sleep 5
  dump "$D/ui-dateien.xml"
  if pos=$(center_of "$D/ui-dateien.xml" "$NAME"); then break; fi
  pos=""
done
{
  echo "Dateimanager: $(front)"
  echo "Eintrag \"$NAME\": ${pos:-nicht gefunden}"
} | tee "$D/ergebnis.txt"
adb exec-out screencap -p > "$D/1-dateien.png" || true
if [ -n "$pos" ]; then
  # shellcheck disable=SC2086
  adb shell input tap $pos
  for i in $(seq 1 60); do
    sleep 5
    f=$(front)
    case "$f" in *"$PKG"*) break ;; esac
    # A chooser or an error toast/dialog stays in DocumentsUI or the resolver.
    case "$f" in *ResolverActivity*|*ChooserActivity*) break ;; esac
  done
  sleep 30
  dump "$D/ui-nach-tippen.xml"
  adb exec-out screencap -p > "$D/2-nach-tippen.png" || true
  echo "Nach dem Tippen vorn: $(front)" | tee -a "$D/ergebnis.txt"
  adb shell "run-as $PKG cat e2e/record.jsonl" 2>/dev/null | tr -d '\r' > "$D/record.jsonl" || true
  grep -h '"report"' "$D/record.jsonl" | sed 's/^/  /' | tee -a "$D/ergebnis.txt" || true
  # Which intent DocumentsUI sent (ActivityTaskManager logs every start).
  adb logcat -d -v time | tr -d '\r' | grep -E "START u0 .*(VIEW|documentsui|$PKG)" | tail -5 | tee -a "$D/ergebnis.txt" || true
fi
adb shell "run-as $PKG sh -c 'echo exit > e2e/mode'" || true
sleep 3
adb shell am force-stop "$PKG"
