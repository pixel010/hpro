#!/usr/bin/env bash
# Installs the Android SDK parts for the mobile spike into mobil/.werkzeug (P12): command-line
# tools, platform tools, platform 36, build tools, NDK, emulator and one x86_64 system image, then
# the Rust targets for Android. Idempotent.
set -euo pipefail
. "$(dirname "$0")/umgebung.sh"
mkdir -p "$MW" "$ANDROID_HOME/cmdline-tools" "$ANDROID_USER_HOME"
CT=commandlinetools-linux-16111833_latest.zip
if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  curl -sSLo "$MW/$CT" "https://dl.google.com/android/repository/$CT"
  # no unzip on the host; Python keeps the executable bits
  python3 - "$MW/$CT" "$ANDROID_HOME/cmdline-tools" <<'PY'
import os, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
for i in z.infolist():
    p = z.extract(i, sys.argv[2])
    m = (i.external_attr >> 16) & 0o777
    if m:
        os.chmod(p, m)
PY
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
fi
# sdkmanager 16111833 no longer asks for licences ("--licenses option is no longer needed")
sdkmanager --install \
  "platform-tools" "emulator" "platforms;android-36" "build-tools;36.0.0" \
  "ndk;$HPRO_NDK_VERSION" "system-images;android-35;google_apis;x86_64"
sdkmanager --list_installed
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
