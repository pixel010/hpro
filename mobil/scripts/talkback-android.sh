#!/usr/bin/env bash
# Criterion 4 (docs/06 4.4), Android part: does TalkBack reach the reader's interface and the
# document in the sandboxed document frame? Runs in the emulator of e2e-android.sh (TalkBack
# 14.x is part of the google_apis system image).
#   1. The reader is started with "Beispiel Bericht.hpro" (VIEW intent, e2e mode `launch`).
#   2. TalkBack is switched on (secure settings; the same switch as Settings > Accessibility).
#   3. The accessibility tree as accessibility services see it is dumped (uiautomator) and
#      compared with the text blocks of the document (bericht.xhtml) and the reader's buttons.
#   4. TalkBack's own navigation: "next item" (swipe right on the emulator's touchscreen) is sent
#      N times; what TalkBack speaks comes from its own log. A control run in Settings checks that
#      the gesture reaches TalkBack at all.
# Usage: talkback-android.sh OUTDIR [steps]   (emulator running, debug app installed, documents
# pushed by e2e-android.sh). The verdict lines come from talkback-check.py.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/umgebung.sh
D="$1/talkback"
STEPS="${2:-40}"
rm -rf "$D"; mkdir -p "$D"
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

# TalkBack 14 asks for the notification permission when it starts; its dialog then covered the
# reader and the whole navigation ran in the dialog (2026-10-14). The permission is granted
# beforehand, as a user would have done on first use.
adb shell pm grant com.google.android.marvin.talkback android.permission.POST_NOTIFICATIONS 2>&1 | tr -d '\r' || true
# Brings the reader back in front: Back closes a dialog or tutorial on top (with TalkBack on, a
# plain tap only moves the accessibility focus), then the singleTask activity is started again
# without data; at most six rounds.
reader_front() {
  local f
  for _ in 1 2 3 4 5 6; do
    f=$(adb shell dumpsys activity activities | tr -d '\r' | grep -m1 topResumedActivity || true)
    case "$f" in *"$PKG"*) return 0 ;; esac
    echo "[$(stamp)] vorn: ${f##*u0 }"
    adb shell input keyevent KEYCODE_BACK
    sleep 10
    adb shell am start -n "$PKG/.MainActivity" >/dev/null 2>&1 || true
    sleep 15
  done
  return 1
}

# TalkBack's own log level (developer setting) to VERBOSE, so that it logs every feedback with its
# text (`ttsOutput=`) and the node each navigation step acts on. Needs root (google_apis image).
TBP=/data/user_de/0/com.google.android.marvin.talkback/shared_prefs/com.google.android.marvin.talkback_preferences.xml
if adb root 2>&1 | grep -qE "already running as root|restarting adbd as root"; then
  adb wait-for-device
  adb shell am force-stop com.google.android.marvin.talkback
  adb shell "[ -f $TBP ] && ! grep -q pref_log_level $TBP && sed -i 's#</map>#    <string name=\"pref_log_level\">2</string>\n</map>#' $TBP" || true
  adb shell "grep pref_log_level $TBP" > "$D/protokollstufe.txt" 2>&1 || echo "pref_log_level nicht gesetzt" > "$D/protokollstufe.txt"
fi
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
adb shell dumpsys activity activities | tr -d '\r' | grep topResumedActivity | tee "$D/vorn-1.txt" || true
reader_front || echo "[$(stamp)] Reader nicht nach vorn zu bringen"
adb shell dumpsys activity activities | tr -d '\r' | grep topResumedActivity | tee "$D/vorn-2.txt" || true

adb exec-out screencap -p > "$D/bildschirm-talkback.png" || true

# UiAutomation (uiautomator dump/events) suppresses all accessibility services while it is
# connected: during `uiautomator events` TalkBack was unbound ("Bound services:{}", 2026-10-14).
# So nothing of uiautomator runs during the navigation. What TalkBack speaks is read from its own
# log instead: the system image has no TTS engine, and TalkBack logs every utterance it tries to
# speak ("SpeechControllerImpl: TTS is not ready. Attempted to speak … text:…"); with log level
# VERBOSE (set above) it also logs the node each navigation step acts on.
# The emulator's logd keeps only a few KiB readable ("4 MiB consumed, 8 KiB readable",
# 2026-10-14), so `logcat -d` afterwards misses most of it: the log is streamed to a file instead.
tb_bound() { adb shell dumpsys accessibility | tr -d '\r' | grep -q "Bound services:{Service\[label=TalkBack"; }
spoken() { grep -ac "Attempted to speak" "$D/logcat-strom.txt" || true; }
# "Next item" paths (HPRO_TB_NAV, first that makes TalkBack speak wins):
#   cswipe one-finger swipe to the right on the emulator's touchscreen, all moves in one console
#          session (TalkBack's gesture; GESTURE_SWIPE_RIGHT -> NEXT)
#   emu    Alt+Right from the emulator's hardware keyboard (console `event send`)
#   key    Alt+Right injected by `input keycombination`
#   swipe  `input swipe`
# Events injected by `input` bypass the accessibility input filter: TalkBack never saw them, and
# `input tap` clicked the button under it instead of exploring (2026-10-14). Alt+Right from the
# console keyboard did not reach TalkBack either. The console touchscreen does.
console() { # emulator console commands from stdin, one session; "sleep N" lines pause
  local tok c; tok=$(cat "$HOME/.emulator_console_auth_token")
  exec 3<>"/dev/tcp/127.0.0.1/${HPRO_EMU_PORT:-5560}"
  printf 'auth %s\r\n' "$tok" >&3; sleep 0.3
  while read -r c; do case "$c" in sleep*) $c ;; *) printf '%s\r\n' "$c" >&3 ;; esac; done
  printf 'quit\r\n' >&3; timeout 3 cat <&3 >/dev/null || true; exec 3>&-
}
cswipe() {
  { echo "event mouse 100 700 0 1"; for x in 180 260 340 420 500 580 620; do echo "sleep 0.02"; echo "event mouse $x 700 0 1"; done
    echo "sleep 0.02"; echo "event mouse 620 700 0 0"; } | console
}
nav_step() {
  case "$1" in
    cswipe) cswipe ;;
    emu) adb emu event send EV_KEY:KEY_LEFTALT:1 EV_SYN:0:0 EV_KEY:KEY_RIGHT:1 EV_SYN:0:0 EV_KEY:KEY_RIGHT:0 EV_SYN:0:0 EV_KEY:KEY_LEFTALT:0 EV_SYN:0:0 >/dev/null ;;
    key) adb shell input keycombination KEYCODE_ALT_LEFT KEYCODE_DPAD_RIGHT ;;
    swipe) adb shell input swipe 120 700 600 700 120 ;;
  esac
}
# Navigates N steps on the screen in front; writes "<label>: <utterances>" to navigation.txt.
navigate() {
  local label="$1" n="$2" nav="$3" s0 i
  s0=$(spoken)
  for i in $(seq 1 "$n"); do
    nav_step "$nav" || true
    sleep 12
    if [ $(( i % 10 )) = 0 ]; then adb exec-out screencap -p > "$D/bildschirm-$label-$i.png" || true; fi
  done
  sleep 10
  echo "$label: Weg $nav, $n Schritte, $(( $(spoken) - s0 )) Äußerungen" | tee -a "$D/navigation.txt"
}

# No uiautomator before the navigation (also not anr_wait): with `uiautomator dump` right before
# it, TalkBack's "next item" stayed on the reader's first web element and spoke nothing (13:50 and
# the probe, 2026-10-14); without it, the same reader was read element by element (14:52,
# talkback-ursache.sh). The tree is dumped after the navigation.
echo "[$(stamp)] TalkBack-Navigation: $STEPS x nächstes Element"
reader_front || true
t0=$(date +%s)
until tb_bound; do [ $(( $(date +%s) - t0 )) -gt 300 ] && break; sleep 5; done
sleep 20
adb shell dumpsys accessibility | tr -d '\r' | grep -E "Bound services|touchExplorationEnabled" > "$D/dienste-vor-navigation.txt" || true
adb logcat -c
adb logcat -v time > "$D/logcat-strom.txt" 2>&1 &
LOGPID=$!
sleep 5
: > "$D/navigation.txt"
read -r -a NAVS <<< "${HPRO_TB_NAV:-cswipe}"
for nav in "${NAVS[@]}"; do navigate "reader-$nav" "$STEPS" "$nav"; done
adb exec-out screencap -p > "$D/bildschirm-ende.png" || true
echo "[$(stamp)] Accessibility-Baum (uiautomator dump)"
anr_wait
adb shell uiautomator dump --compressed /sdcard/tb-baum.xml >/dev/null 2>&1 || adb shell uiautomator dump /sdcard/tb-baum.xml >/dev/null 2>&1 || true
adb shell cat /sdcard/tb-baum.xml > "$D/baum.xml" 2>/dev/null || true
adb shell dumpsys accessibility | tr -d '\r' | grep -E "Bound services" > "$D/dienste-ende.txt" || true
# Control: the same gesture in Settings (native views). If TalkBack speaks there but not in the
# reader, the automation works and the gap is in the reader's WebView.
adb shell am start -a android.settings.SETTINGS >/dev/null
sleep 40
navigate kontrolle-einstellungen 4 "${NAVS[0]}"
adb exec-out screencap -p > "$D/bildschirm-kontrolle.png" || true
kill "$LOGPID" 2>/dev/null || true
tr -d '\r' < "$D/logcat-strom.txt" | grep -aE "Attempted to speak|ttsOutput= [^ {]|GESTURE_SWIPE_RIGHT detected|perform action=|TouchExplorationAction" | cut -c1-600 > "$D/sprache.txt" || true
gzip -f "$D/logcat-strom.txt"

echo "[$(stamp)] TalkBack ausschalten"
adb shell settings put secure enabled_accessibility_services '""'
adb shell settings put secure accessibility_enabled 0
adb shell "run-as $PKG sh -c 'echo exit > e2e/mode'" || true
sleep 5
adb shell am force-stop "$PKG"
python3 scripts/talkback-check.py "$D" ../huelle/dist-web/beispiel.hpro
