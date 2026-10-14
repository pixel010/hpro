#!/usr/bin/env bash
# Copies the results of the P12 test runs from mobil/.tmp into docs/belege/P12 (evidence of the
# spike). Large files stay out: logcat goes in as a filtered excerpt, AABs as hashes only.
# Usage: belege-p12.sh LOGFILE-OF-E2E-RUN [LOGFILE-OF-STORE-BUILD]
set -euo pipefail
cd "$(dirname "$0")/.."
B="$(cd .. && pwd)/docs/belege/P12"
E=.tmp/e2e
excerpt() { # logcat -> excerpt with the reader's lines, ANRs, crashes and the print spooler
  grep -aE "org\.hpro\.reader|HproPlugin|hpro-mobil|ANR in|Application Not Responding|FATAL|lowmemorykiller|printspooler|PrintManager|TalkBack|wry|tauri" "$1" | cut -c1-400 | tail -400 || true
}

if [ -n "${1:-}" ] && [ -f "$1" ]; then
  for s in launch read print; do
    [ -d "$E/$s" ] || continue
    d="$B/k$( [ $s = launch ] && echo 2 || echo 3 )-$s"
    rm -rf "$d"; mkdir -p "$d"
    cp "$E/$s"/*.txt "$E/$s"/*.jsonl "$E/$s"/*.png "$E/$s"/*.xml "$d"/ 2>/dev/null || true
    rm -f "$d/logcat.txt"
    [ -f "$E/$s/logcat.txt" ] && excerpt "$E/$s/logcat.txt" > "$d/logcat-auszug.txt"
    [ -d "$E/$s/dateimanager" ] && cp -r "$E/$s/dateimanager" "$d/"
  done
  # Files-app scenario on its own (e2e-android.sh files)
  if [ -d "$E/files/dateimanager" ]; then
    rm -rf "$B/k2-dateimanager"; mkdir -p "$B/k2-dateimanager"
    cp "$E/files/dateimanager"/* "$B/k2-dateimanager/"
  fi
  if [ -d "$E/talkback" ]; then
    rm -rf "$B/k4-talkback"; mkdir -p "$B/k4-talkback"
    cp "$E/talkback"/* "$B/k4-talkback/"
    # The full logcat stays out; sprache.txt holds TalkBack's lines from it.
    rm -f "$B/k4-talkback/logcat-navigation.txt"
  fi
  cp "$1" "$B/$(basename "$1" .log).txt"
fi
if [ -n "${2:-}" ] && [ -f "$2" ]; then
  rm -rf "$B/k5-store"; mkdir -p "$B/k5-store"
  cp "$2" "$B/k5-store/lauf.txt"
  for f in .tmp/store/build-*.log; do
    [ -f "$f" ] && tail -40 "$f" > "$B/k5-store/$(basename "$f" .log)-ende.txt"
  done
  (cd .tmp/store && sha256sum hpro-reader-*.aab) > "$B/k5-store/sha256.txt" 2>/dev/null || true
fi
ls -R "$B" | head -80
