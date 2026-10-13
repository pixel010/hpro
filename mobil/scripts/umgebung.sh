# shellcheck shell=bash
# Build and test environment of the mobile spike (P12). Source it:
#   . mobil/scripts/umgebung.sh
# Everything lives inside the repository: the Android SDK (cmdline-tools, platform, NDK, emulator,
# system image) under mobil/.werkzeug/android-sdk, AVDs and adb keys under mobil/.werkzeug/android-user,
# Gradle caches under mobil/.werkzeug/gradle. Rust comes from the desktop shell (huelle/.werkzeug, P11).
MOBIL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$MOBIL/.." && pwd)"
MW="$MOBIL/.werkzeug"
export MOBIL REPO MW
export JAVA_HOME="$REPO/prototyp/tools/jdk-21.0.12.1+1"
export ANDROID_HOME="$MW/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_USER_HOME="$MW/android-user"
export ANDROID_AVD_HOME="$ANDROID_USER_HOME/avd"
export ANDROID_EMULATOR_HOME="$ANDROID_USER_HOME"
export GRADLE_USER_HOME="$MW/gradle"
export HPRO_NDK_VERSION="30.0.16248370"
export NDK_HOME="$ANDROID_HOME/ndk/$HPRO_NDK_VERSION"
export RUSTUP_HOME="$REPO/huelle/.werkzeug/rustup" CARGO_HOME="$REPO/huelle/.werkzeug/cargo"
export PATH="$JAVA_HOME/bin:$CARGO_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
# adb server port of its own, so that no other adb on the host is touched.
export ANDROID_ADB_SERVER_PORT=5137
# The one emulator of the tests (emulator.sh starts it on console port 5560).
export ANDROID_SERIAL=emulator-5560
# Temporary files of Gradle, Kotlin and Cargo stay in the repository too.
export TMPDIR="$MOBIL/.tmp/tmp"
mkdir -p "$TMPDIR"
# The host is shared and has 15 GiB: two compiler jobs, one Gradle daemon with a small heap
# (gen/android/gradle.properties); a Gradle daemon died with more (2026-10-13).
export CARGO_BUILD_JOBS=2
