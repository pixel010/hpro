#!/usr/bin/env bash
# Criterion 4 (docs/06 4.4), Android part: does TalkBack reach the reader's interface and the
# document in the sandboxed document frame? Runs in the emulator of e2e-android.sh (TalkBack
# 14.x is part of the google_apis system image).
#   1. The reader is started with "Beispiel Bericht.hpro" (VIEW intent, e2e mode `launch`).
#   2. TalkBack is switched on (secure settings; the same switch as Settings > Accessibility).
#   3. The accessibility tree as accessibility services see it is dumped (uiautomator) and
#      compared with the text blocks of the document (bericht.xhtml) and the reader's buttons.
#   4. TalkBack's own navigation: "next item" (Alt+Right, TalkBack's default keymap; the AVD has
#      a hardware keyboard) is sent N times; what TalkBack speaks comes from its own log.
# Usage: talkback-android.sh OUTDIR [steps]   (emulator running, debug app installed, documents
# pushed by e2e-android.sh). The verdict lines come from talkback-check.py.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/umgebung.sh
D="$1/talkback"
STEPS="${2:-90}"
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

anr_wait
echo "[$(stamp)] Accessibility-Baum (uiautomator dump)"
adb shell uiautomator dump --compressed /sdcard/tb-baum.xml >/dev/null 2>&1 || adb shell uiautomator dump /sdcard/tb-baum.xml >/dev/null 2>&1 || true
adb shell cat /sdcard/tb-baum.xml > "$D/baum.xml" 2>/dev/null || true
adb exec-out screencap -p > "$D/bildschirm-talkback.png" || true

# UiAutomation (uiautomator dump/events) suppresses all accessibility services while it is
# connected: during `uiautomator events` TalkBack was unbound ("Bound services:{}", 2026-10-14).
# So nothing of uiautomator runs during the navigation. What TalkBack speaks is read from its own
# log instead: the system image has no TTS engine, and TalkBack logs every utterance it tries to
# speak ("SpeechControllerImpl: TTS is not ready. Attempted to speak … text:…").
tb_bound() { adb shell dumpsys accessibility | tr -d '\r' | grep -q "Bound services:{Service\[label=TalkBack"; }
spoken() { adb logcat -d -s talkback:V | tr -d '\r' | grep -c "text:" || true; }
echo "[$(stamp)] TalkBack-Navigation: $STEPS x nächstes Element (Alt+Rechts, sonst Wischen nach rechts)"
anr_wait
reader_front || true
t0=$(date +%s)
until tb_bound; do [ $(( $(date +%s) - t0 )) -gt 300 ] && break; sleep 5; done
sleep 20
adb shell dumpsys accessibility | tr -d '\r' | grep -E "Bound services|touchExplorationEnabled" > "$D/dienste-vor-navigation.txt" || true
# The default ring buffer kept only about 58 KiB readable under the emulator's log volume; an
# utterance from minute 8 was gone at minute 20 (2026-10-14).
adb logcat -G 16M >/dev/null 2>&1 || true
adb logcat -c
# "Next item" is tried on three input paths, in this order (HPRO_TB_NAV):
#   emu    Alt+Right from the emulator's hardware keyboard (console `event send`, a real input device)
#   key    Alt+Right injected by `input keycombination` (virtual device of the shell)
#   swipe  one-finger swipe to the right (TalkBack's gesture under touch exploration)
# A path is given up when five steps on it make TalkBack say nothing new; navigation.txt records
# which paths were tried and how many utterances each produced.
nav_step() {
  case "$1" in
    emu) adb emu event send EV_KEY:KEY_LEFTALT:1 EV_KEY:KEY_RIGHT:1 EV_SYN:0:0 EV_KEY:KEY_RIGHT:0 EV_KEY:KEY_LEFTALT:0 EV_SYN:0:0 >/dev/null ;;
    key) adb shell input keycombination KEYCODE_ALT_LEFT KEYCODE_DPAD_RIGHT ;;
    swipe) adb shell input swipe 120 700 600 700 120 ;;
  esac
}
read -r -a NAVS <<< "${HPRO_TB_NAV:-emu key swipe}"
k=0; nav="${NAVS[0]}"; n_mode=0; said0=0
: > "$D/navigation.txt"
for i in $(seq 1 "$STEPS"); do
  nav_step "$nav" || true
  sleep 4
  n_mode=$(( n_mode + 1 ))
  if [ "$n_mode" = 5 ]; then
    said=$(spoken)
    echo "Weg $nav: $(( said - said0 )) Äußerungen in den ersten 5 Schritten" | tee -a "$D/navigation.txt"
    if [ "$said" = "$said0" ] && [ $(( k + 1 )) -lt ${#NAVS[@]} ]; then
      k=$(( k + 1 )); nav="${NAVS[$k]}"; n_mode=0; said0=$said
    fi
  fi
  if [ $(( i % 20 )) = 0 ]; then
    adb exec-out screencap -p > "$D/bildschirm-schritt-$i.png" || true
    adb shell dumpsys accessibility | tr -d '\r' | grep -E "Bound services" > "$D/dienste-schritt-$i.txt" || true
  fi
done
echo "Navigation: $nav (Schritte gesamt $STEPS, Äußerungen gesamt $(spoken))" | tee -a "$D/navigation.txt"
sleep 10
adb logcat -d -v time | tr -d '\r' > "$D/logcat-navigation.txt" || true
grep -E " talkback ?\(|talkback:" "$D/logcat-navigation.txt" > "$D/sprache.txt" || true
adb exec-out screencap -p > "$D/bildschirm-ende.png" || true
adb shell dumpsys accessibility | tr -d '\r' | grep -E "Bound services" > "$D/dienste-ende.txt" || true

echo "[$(stamp)] TalkBack ausschalten"
adb shell settings put secure enabled_accessibility_services '""'
adb shell settings put secure accessibility_enabled 0
adb shell "run-as $PKG sh -c 'echo exit > e2e/mode'" || true
sleep 5
adb shell am force-stop "$PKG"
python3 scripts/talkback-check.py "$D" ../huelle/dist-web/beispiel.hpro
