# shellcheck shell=bash
# Android emulator for the mobile spike (P12). Source after umgebung.sh:
#   emu_start; emu_wait_boot; …; emu_stop
# The test host has no /dev/kvm, so the emulator runs without acceleration (`-accel off`, QEMU
# TCG, one host thread): everything works, but it is many times slower than on a developer
# machine. Android's system_server watchdog then restarts the framework again and again
# (seen 2026-10-13: nine restarts in 49 min); ro.hw_timeout_multiplier stretches its timeouts. The AVD lives
# in mobil/.werkzeug/android-user/avd; logs go to mobil/.tmp/emulator.log.
HPRO_AVD="${HPRO_AVD:-hpro35}"
HPRO_IMAGE="system-images;android-35;google_apis;x86_64"
EMU_LOG="$MOBIL/.tmp/emulator.log"

emu_create() {
  if ! avdmanager list avd 2>/dev/null | grep -q "Name: $HPRO_AVD\$"; then
    echo no | avdmanager create avd -n "$HPRO_AVD" -k "$HPRO_IMAGE" -d pixel_6 --force >/dev/null
  fi
  # 2 cores (QEMU emulates all of them in one thread), 1 GiB (the container of the test host is capped at 2.5 GiB in total, memory.max), keep data between runs (snapshots save the boot time on later starts).
  local cfg="$ANDROID_AVD_HOME/$HPRO_AVD.avd/config.ini"
  # A 720x1280 screen keeps the host-side frame buffers small.
  sed -i -e '/^hw.cpu.ncore/d' -e '/^hw.ramSize/d' -e '/^hw.keyboard/d' -e '/^hw.lcd/d' "$cfg"
  printf 'hw.cpu.ncore=2\nhw.ramSize=%s\nhw.keyboard=yes\nhw.lcd.width=720\nhw.lcd.height=1280\nhw.lcd.density=320\n' "${HPRO_AVD_RAM:-1024}" >> "$cfg"
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
  setsid nohup emulator -avd "$HPRO_AVD" -no-window -no-audio -no-boot-anim -accel off -lowram ${HPRO_EMU_EXTRA:-} \
    -gpu swiftshader_indirect -camera-back none -camera-front none -no-metrics \
    -port 5560 >"$EMU_LOG" 2>&1 < /dev/null &
  echo $! > "$MOBIL/.tmp/emulator.pid"
}

# Waits until Android reports boot completed; prints the seconds it took.
emu_wait_boot() {
  local t0 limit="${1:-3600}"
  t0=$(date +%s)
  # Neither -prop nor the boot option reaches ro.hw_timeout_multiplier on this image; as an
  # unset ro.* property it can be set once by root, then the framework restarts with it.
  until [ "$(adb get-state 2>/dev/null)" = device ]; do sleep 10; done
  if [ -z "$(adb shell getprop ro.hw_timeout_multiplier | tr -d '\r')" ]; then
    adb root >/dev/null 2>&1; sleep 15; adb wait-for-device
    adb shell 'setprop ro.hw_timeout_multiplier 20; stop; start' >/dev/null 2>&1
  fi
  until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do
    if [ $(( $(date +%s) - t0 )) -gt "$limit" ]; then echo "Boot nach ${limit} s nicht fertig" >&2; return 1; fi
    if ! emu_alive && ! emu_running; then
      echo "Emulator beendet:" >&2; tail -20 "$EMU_LOG" >&2; return 1
    fi
    sleep 10
  done
  # Under software emulation the internal storage (FUSE over /data/media) sometimes stays
  # "unmountable" after boot; /sdcard is then a bare tmpfs no app can share files from.
  if adb shell sm list-volumes all | grep -q "emulated;0 unmountable"; then
    adb shell sm mount "emulated\;0" >/dev/null 2>&1; sleep 30
  fi
  # No screen lock, stay awake, no animations (they only cost time without acceleration).
  adb shell 'settings put global window_animation_scale 0; settings put global transition_animation_scale 0; settings put global animator_duration_scale 0; svc power stayon true; locksettings set-disabled true; input keyevent KEYCODE_WAKEUP; wm dismiss-keyguard' >/dev/null 2>&1
  echo $(( $(date +%s) - t0 ))
}

# The WebView 124 of the system image crashes in every renderer under software emulation
# (SIGTRAP in V8, docs/belege/P12/umgebung). The tests use System WebView 158.0.8104.0 from the
# Chromium snapshot build 1717543 (mobil/.werkzeug/SystemWebView-1717543.apk) as provider. After
# an emulator was OOM-killed the data partition came back without it (2026-10-13), so it is
# checked on every run.
emu_webview() {
  local apk="$MW/SystemWebView-1717543.apk"
  if ! adb shell pm list packages | tr -d '\r' | grep -qx "package:com.android.webview"; then
    [ -f "$apk" ] || { echo "WebView-APK fehlt: $apk" >&2; return 1; }
    adb install -r "$apk" | tail -1
  fi
  adb shell cmd webviewupdate set-webview-implementation com.android.webview | tr -d '\r' | tail -1
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
