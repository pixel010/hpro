#!/usr/bin/env bash
# Unpacks the Debian 13 packages for building and testing the shell into huelle/.werkzeug/sysroot
# (no root access on the build host). Installs rustup into huelle/.werkzeug as well.
set -euo pipefail
. "$(dirname "$0")/umgebung.sh"
mkdir -p "$W/deb" "$S"
if [ ! -x "$CARGO_HOME/bin/cargo" ]; then
  curl -sSf https://sh.rustup.rs -o "$W/rustup-init.sh"
  sh "$W/rustup-init.sh" -y --no-modify-path --profile minimal --default-toolchain stable
fi
apt-get -s -o Debug::NoLocking=1 install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev libxdo-dev xdotool thunar libglib2.0-bin shared-mime-info \
  desktop-file-utils softhsm2 gnutls-bin x11-utils imagemagick xauth dbus dbus-x11 \
  | awk '/^Inst/ {print $2}' > "$W/pakete.txt"
(cd "$W/deb" && xargs -a "$W/pakete.txt" apt-get download -o Debug::NoLocking=1)
for f in "$W"/deb/*.deb; do dpkg-deb -x "$f" "$S"; done
for pc in $(find "$S/usr" -name '*.pc'); do sed -i "s#^prefix=/usr#prefix=$S/usr#; s#=/usr/#=$S/usr/#g" "$pc"; done
# Symlinks of -dev packages whose runtime library is installed on the host.
find "$S" -xtype l | while read -r l; do
  t=$(readlink "$l")
  if [ "${t#/}" != "$t" ] && [ -e "$S$t" ]; then ln -sf "$S$t" "$l"
  elif [ -e "/usr/lib/x86_64-linux-gnu/$(basename "$t")" ]; then ln -sf "/usr/lib/x86_64-linux-gnu/$(basename "$t")" "$l"; fi
done
# WebKitGTK starts its helper processes from a compiled-in directory. Point it (same length,
# 40 bytes) to a symlink in huelle/.werkzeug. Only for running on this host.
ziel="$W///wk"
[ "${#ziel}" -eq 40 ] || { echo "Pfadlänge ${#ziel} != 40: $ziel" >&2; exit 1; }
ln -sfn "$L/webkit2gtk-4.1" "$W/wk"
real=$(readlink -f "$L/libwebkit2gtk-4.1.so.0")
grep -q "$ziel" "$real" || sed -i "s#/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1#$ziel#g" "$real"
/usr/lib/x86_64-linux-gnu/glib-2.0/glib-compile-schemas "$S/usr/share/glib-2.0/schemas"
update-mime-database "$S/usr/share/mime" >/dev/null 2>&1 || true
echo "Sysroot bereit: $S"
