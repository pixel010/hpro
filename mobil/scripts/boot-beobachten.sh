#!/usr/bin/env bash
# Prints one line whenever the emulator's state changes, until Android has booted or QEMU is
# gone (used while waiting on the software-emulated boot, P12).
cd "$(dirname "$0")/.." || exit 1
. scripts/umgebung.sh
t0=$(date +%s)
last=""
n=0
while true; do
  q=$(pgrep -x qemu-system-x86 || echo tot)
  b=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
  s=$(adb get-state 2>&1 | tr -d '\r' | tr ' ' _)
  cur="$s/$b/$q"
  if [ "$cur" != "$last" ]; then
    echo "$(date +%T) +$(( $(date +%s) - t0 ))s state=$s boot=$b qemu=$q"
    last=$cur
  fi
  n=$(( n + 1 ))
  if [ $(( n % 8 )) = 0 ]; then
    echo "$(date +%T) Speicher: QEMU RSS $(ps -o rss= -p "${q%% *}" 2>/dev/null | tr -d ' ') KiB, Container $(( $(cat /sys/fs/cgroup/memory.current) / 1048576 )) MiB von $(( $(cat /sys/fs/cgroup/memory.max) / 1048576 )) MiB, $(grep oom_kill /sys/fs/cgroup/memory.events)"
  fi
  [ "$b" = 1 ] && break
  [ "$q" = tot ] && break
  sleep 15
done
