#!/usr/bin/env bash
# Package sizes of the desktop shell (P11, acceptance criterion 3). Bytes from stat, packed sizes
# of the Debian dependencies from apt-cache (Size = download, Installed-Size in KiB).
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(cd .. && pwd)"
b() { stat -c %s "$1"; }
mib() { awk -v n="$1" 'BEGIN { printf "%.2f MiB", n / 1048576 }'; }
row() { printf '| %s | %s | %s |\n' "$1" "$2" "$(mib "$2")"; }
du_b() { du -sb "$1" | cut -f1; }
BIN=src-tauri/target/release/hpro-reader
DEB=$(ls -t src-tauri/target/release/bundle/deb/*.deb | head -1)
echo "| Teil | Bytes | MiB |"
echo "| --- | ---: | ---: |"
row "Programmdatei hpro-reader (release, LTO, opt-level s, strip)" "$(b "$BIN")"
row "Sidecar-Starter hpro-dienst" "$(b src-tauri/target/release/hpro-dienst)"
row "Web-Kern dist-web/ gesamt (im Programm eingebettet)" "$(du_b dist-web)"
row "davon Beispieldokumente (*.hpro)" "$(cat dist-web/*.hpro | wc -c)"
row "davon Quellkarten (*.map)" "$(find dist-web -name '*.map' -exec cat {} + | wc -c)"
row "Debian-Paket $(basename "$DEB")" "$(b "$DEB")"
AI=$(ls -t src-tauri/target/release/bundle/appimage/*.AppImage 2>/dev/null | head -1)
[ -n "$AI" ] && row "AppImage $(basename "$AI") (bündelt WebKitGTK und GTK)" "$(b "$AI")"
row "PWA app/dist/ zum Vergleich" "$(du_b "$ROOT/app/dist")"
echo
echo "Installed-Size laut Paket (KiB): $(dpkg-deb -f "$DEB" Installed-Size)"
echo "Depends laut Paket: $(dpkg-deb -f "$DEB" Depends)"
echo
echo "## Inhalt des Debian-Pakets"
dpkg-deb -c "$DEB" | awk '{ printf "%10s  %s\n", $3, $6 }'
echo
echo "## Laufzeitabhängigkeiten aus Debian 13 (auf einem GNOME- oder Xfce-Desktop meist schon installiert)"
echo "| Paket | Download (Bytes) | Installiert (KiB) |"
echo "| --- | ---: | ---: |"
tot_s=0; tot_i=0
for p in libwebkit2gtk-4.1-0 libjavascriptcoregtk-4.1-0 libgtk-3-0t64 libsoup-3.0-0 libxdo3; do
  s=$(apt-cache show "$p" 2>/dev/null | awk '/^Size:/ {print $2; exit}'); i=$(apt-cache show "$p" 2>/dev/null | awk '/^Installed-Size:/ {print $2; exit}')
  [ -n "$s" ] && { echo "| $p | $s | $i |"; tot_s=$((tot_s + s)); tot_i=$((tot_i + i)); }
done
echo "| Summe | $tot_s ($(mib $tot_s)) | $tot_i |"
echo
echo "## Lokale Dienste (Sidecar-Ziel, getrennt installiert)"
for d in "$ROOT/dienst/.venv" "$ROOT/dienst/tools" "$ROOT/prototyp/tools/verapdf-1.30.3" "$ROOT/prototyp/tools/jdk-21.0.12.1+1"; do
  [ -d "$d" ] && row "${d#$ROOT/}" "$(du_b "$d")"
done
