#!/usr/bin/env bash
# P13: unpacks the Debian 13 libraries that Playwright's Firefox and WebKit builds need into
# app/.engine-sysroot (no root access on the test host, `playwright install-deps` needs sudo).
# Only for running on this host; CI uses `playwright install --with-deps` instead.
#
#   scripts/p13-sysroot.sh          # once, ~150 MB
#   . scripts/p13-engines-env.sh    # before running the engine suite locally
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
W="$ROOT/app/.engine-sysroot"
S="$W/root"
mkdir -p "$W/deb" "$S"

# Libraries reported missing by `playwright install webkit firefox` on Debian 13 (Firefox only
# lacks GTK 3), plus the GStreamer plugins WPE needs for <video>/<audio> (without
# autoaudiosink the web process crashes). apt-get -s resolves them against the host.
apt-get -s -o Debug::NoLocking=1 install \
  libgtk-3-0t64 libgtk-4-1 libgstreamer1.0-0 libgraphene-1.0-0 libicu76 libxslt1.1 \
  libevent-2.1-7t64 libgcrypt20 libgpg-error0 libgstreamer-plugins-base1.0-0 \
  libgstreamer-gl1.0-0 libgstreamer-plugins-bad1.0-0 libwebpdemux2 libavif16 libharfbuzz-icu0 \
  libepoxy0 libmanette-0.2-0 libenchant-2-2 libsecret-1-0 libhyphen0 libgles2 \
  gstreamer1.0-plugins-good gstreamer1.0-plugins-base \
  | awk '/^Inst/ {print $2}' \
  | grep -Ev '^(systemd|libsystemd|libnss-systemd|libpam-systemd|dbus|linux-sysctl|libudev1|dmsetup|libdevmapper|libcryptsetup|libkmod|libpam-cap|libcap2-bin)' \
  > "$W/pakete.txt"
(cd "$W/deb" && xargs -a "$W/pakete.txt" apt-get download -o Debug::NoLocking=1 >"$W/download.log" 2>&1)
for f in "$W"/deb/*.deb; do dpkg-deb -x "$f" "$S"; done
/usr/lib/x86_64-linux-gnu/glib-2.0/glib-compile-schemas "$S/usr/share/glib-2.0/schemas" 2>/dev/null || true
echo "Sysroot bereit: $S ($(wc -l < "$W/pakete.txt") Pakete)"
