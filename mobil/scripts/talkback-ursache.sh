#!/usr/bin/env bash
# Criterion 4, cause of the stuck TalkBack navigation (docs/15, 2.4): in the reader, TalkBack's
# "next item" stays on the skip link "Zum Inhalt springen" and speaks nothing, while the same
# gesture works in Settings. Three phases of N swipes each, the page changed in between over the
# DevTools protocol of the debug WebView (cdp-eval.mjs), no rebuild:
#   A  reader unchanged
#   B  skip link removed
#   C  page replaced by plain markup (h1, two paragraphs, a button)
# If C stays silent, the cause is the WebView or the emulation; if C speaks and A does not, it is
# the reader's markup. Needs the running emulator with the debug app (e2e-android.sh) and root.
# Usage: talkback-ursache.sh OUTDIR [swipes per phase]
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/umgebung.sh
D="$1/talkback-ursache"
N="${2:-6}"
rm -rf "$D"; mkdir -p "$D"
PKG=org.hpro.reader
TB=com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService
TBP=/data/user_de/0/com.google.android.marvin.talkback/shared_prefs/com.google.android.marvin.talkback_preferences.xml
PORT=9333
stamp() { date '+%H:%M:%S'; }

console() { # emulator console commands from stdin, one session (see talkback-android.sh)
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
cdp() { node scripts/cdp-eval.mjs "$PORT" "$1" 2>&1 | tail -1; }

echo "[$(stamp)] Reader mit Beispiel Bericht.hpro starten"
adb shell am force-stop "$PKG"
adb shell "run-as $PKG sh -c 'rm -rf e2e; mkdir -p e2e && echo launch > e2e/mode'"
adb push ../huelle/dist-web/beispiel.hpro /data/local/tmp/beispiel.hpro >/dev/null
adb shell "cat /data/local/tmp/beispiel.hpro | run-as $PKG sh -c 'cat > cache/beispiel.hpro'; rm /data/local/tmp/beispiel.hpro"
# The first start after a cold boot aborted in the Rust part (SIGABRT, 2026-10-14 14:33), as in
# e2e-android.sh (start_view): the start is repeated while the process is gone, at most three times.
t0=$(date +%s)
for n in 1 2 3; do
  adb shell am start -W -a android.intent.action.VIEW -d "content://$PKG.fileprovider/my_cache_images/beispiel.hpro" -t application/vnd.hpro+zip --grant-read-uri-permission -n "$PKG/.MainActivity" | tr -d '\r' | grep -E "Status|TotalTime" || true
  sleep 20
  until [[ "$(adb shell run-as "$PKG" cat e2e/record.jsonl 2>/dev/null)" == *Projektbericht* ]]; do
    [ -z "$(adb shell pidof "$PKG" | tr -d '\r')" ] && { echo "[$(stamp)] Start $n: Reader beendet"; break; }
    [ $(( $(date +%s) - t0 )) -gt 900 ] && { echo "Dokument nach 900 s nicht angezeigt" >&2; break; }
    sleep 5
  done
  [[ "$(adb shell run-as "$PKG" cat e2e/record.jsonl 2>/dev/null)" == *Projektbericht* ]] && break
  adb shell am force-stop "$PKG"
done
echo "[$(stamp)] Dokument angezeigt nach $(( $(date +%s) - t0 )) s"

# DevTools socket of the reader's WebView (debug build).
pid=$(adb shell pidof "$PKG" | tr -d '\r')
adb forward "tcp:$PORT" "localabstract:webview_devtools_remote_$pid" >/dev/null
echo "DevTools: $(cdp 'document.title + " | Sprunglink: " + !!document.querySelector(".skip-link")')" | tee "$D/devtools.txt"

adb root >/dev/null 2>&1 || true
adb wait-for-device
adb shell am force-stop com.google.android.marvin.talkback
adb shell "[ -f $TBP ] && ! grep -q pref_log_level $TBP && sed -i 's#</map>#    <string name=\"pref_log_level\">2</string>\n</map>#' $TBP" || true
adb shell "grep pref_log_level $TBP" > "$D/protokollstufe.txt" 2>&1 || true
adb shell pm grant com.google.android.marvin.talkback android.permission.POST_NOTIFICATIONS 2>/dev/null || true
echo "[$(stamp)] TalkBack einschalten"
adb shell settings put secure enabled_accessibility_services "$TB"
adb shell settings put secure accessibility_enabled 1
t0=$(date +%s)
until adb shell dumpsys accessibility | tr -d '\r' | grep -q "Bound services:{Service\[label=TalkBack"; do
  [ $(( $(date +%s) - t0 )) -gt 300 ] && break; sleep 5
done
sleep 90
adb shell dumpsys activity activities | tr -d '\r' | grep -m1 topResumedActivity | tee "$D/vorn.txt" || true
adb logcat -c
adb logcat -v time > "$D/logcat-strom.txt" 2>&1 &
LOGPID=$!
sleep 5

phase() { # NAME: N swipes, then utterances and the nodes TalkBack acted on in this phase
  local name="$1" from to i
  from=$(wc -l < "$D/logcat-strom.txt")
  for i in $(seq 1 "$N"); do cswipe; sleep 12; done
  sleep 10
  adb exec-out screencap -p > "$D/bildschirm-$name.png" || true
  to=$(wc -l < "$D/logcat-strom.txt")
  sed -n "$((from + 1)),${to}p" "$D/logcat-strom.txt" | tr -d '\r' > "$D/phase-$name.txt"
  {
    echo "== Phase $name: $N Wischgesten"
    echo "Gesten erkannt: $(grep -ac 'GESTURE_SWIPE_RIGHT detected' "$D/phase-$name.txt" || true)"
    echo "Äußerungen: $(grep -ac 'Attempted to speak' "$D/phase-$name.txt" || true)"
    grep -a 'Attempted to speak' "$D/phase-$name.txt" | sed -E 's/.*\{text:(.*), earcons:.*/  gesprochen: \1/' | cut -c1-140 || true
    grep -a 'perform action=' "$D/phase-$name.txt" | sed -E 's/.*perform action=[0-9]+=([A-Z_]+) returns ([a-z]+).*class="([^"]*)".*(content|text)="([^"]*)".*/  \1 -> \2 auf \3 "\5"/' | sort | uniq -c || true
  } | tee -a "$D/ergebnis.txt"
}

phase A-reader
echo "Eingriff B: $(cdp 'document.querySelector(".skip-link")?.remove(); "Sprunglink entfernt: " + !document.querySelector(".skip-link")')" | tee -a "$D/ergebnis.txt"
phase B-ohne-sprunglink
echo "Eingriff C: $(cdp 'document.body.innerHTML = "<h1>Probe Überschrift</h1><p>Erster Absatz der Probe.</p><p>Zweiter Absatz der Probe.</p><button>Probeknopf</button>"; "Seite ersetzt: " + document.body.children.length + " Elemente"')" | tee -a "$D/ergebnis.txt"
phase C-schlichtes-html

kill "$LOGPID" 2>/dev/null || true
echo "[$(stamp)] TalkBack ausschalten"
adb shell settings put secure enabled_accessibility_services '""'
adb shell settings put secure accessibility_enabled 0
adb forward --remove "tcp:$PORT" || true
adb shell am force-stop "$PKG"
gzip -f "$D/logcat-strom.txt"
