# shellcheck shell=bash
# Android emulator for the mobile spike (P12). Source after umgebung.sh:
#   emu_start; emu_wait_boot; …; emu_stop
# The test host has no /dev/kvm, so the emulator runs without acceleration (`-accel off`, QEMU
# TCG): everything works, but it is many times slower than on a developer machine. The AVD lives
# in mobil/.werkzeug/android-user/avd; logs go to mobil/.tmp/emulator.log.
HPRO_AVD="${HPRO_AVD:-hpro35}"
HPRO_IMAGE="system-images;android-35;google_apis;x86_64"
EMU_LOG="$MOBIL/.tmp/emulator.log"

emu_create() {
  if ! avdmanager list avd 2>/dev/null | grep -q "Name: $HPRO_AVD\$"; then
    echo no | avdmanager create avd -n "$HPRO_AVD" -k "$HPRO_IMAGE" -d pixel_6 --force >/dev/null
  fi
  # 4 cores, 3 GiB, keep data between runs (snapshots save the boot time on later starts).
  local cfg="$ANDROID_AVD_HOME/$HPRO_AVD.avd/config.ini"
  sed -i -e '/^hw.cpu.ncore/d' -e '/^hw.ramSize/d' -e '/^hw.keyboard/d' "$cfg"
  printf 'hw.cpu.ncore=4\nhw.ramSize=3072\nhw.keyboard=yes\n' >> "$cfg"
}

# The launcher starts QEMU as a child and may exit; the process name is truncated to 15 chars.
emu_alive() {
  pgrep -x qemu-system-x86 >/dev/null
}

emu_running() {
  adb devices 2>/dev/null | grep -q '^emulator-[0-9]*[[:space:]]*device'
}

emu_start() {
  mkdir -p "$MOBIL/.tmp"
  emu_create
  adb start-server >/dev/null 2>&1
  if emu_running; then return 0; fi
  setsid nohup emulator -avd "$HPRO_AVD" -no-window -no-audio -no-boot-anim -accel off \
    -gpu swiftshader_indirect -camera-back none -camera-front none -no-metrics \
    -port 5560 >"$EMU_LOG" 2>&1 < /dev/null &
  echo $! > "$MOBIL/.tmp/emulator.pid"
}

# Waits until Android reports boot completed; prints the seconds it took.
emu_wait_boot() {
  local t0 limit="${1:-3600}"
  t0=$(date +%s)
  until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do
    if [ $(( $(date +%s) - t0 )) -gt "$limit" ]; then echo "Boot nach ${limit} s nicht fertig" >&2; return 1; fi
    if ! emu_alive && ! emu_running; then
      echo "Emulator beendet:" >&2; tail -20 "$EMU_LOG" >&2; return 1
    fi
    sleep 10
  done
  # No screen lock, stay awake, no animations (they only cost time without acceleration).
  adb shell 'settings put global window_animation_scale 0; settings put global transition_animation_scale 0; settings put global animator_duration_scale 0; svc power stayon true; locksettings set-disabled true; input keyevent KEYCODE_WAKEUP; wm dismiss-keyguard' >/dev/null 2>&1
  echo $(( $(date +%s) - t0 ))
}

emu_stop() {
  adb emu kill >/dev/null 2>&1 || true
  for _ in $(seq 1 30); do
    emu_alive || break
    sleep 2
  done
  pkill -x qemu-system-x86 2>/dev/null || true
  adb kill-server >/dev/null 2>&1 || true
}
