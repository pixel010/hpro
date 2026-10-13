#!/usr/bin/env bash
# Acceptance criterion 1 (P11): the Linux release build opens a container from the file manager.
# Installs the contents of the built .deb into a private XDG prefix (desktop entry, MIME type,
# icons, binary, sidecar), registers them like the package scripts do (update-mime-database,
# update-desktop-database), starts Thunar under Xvfb on a folder with a container, double-clicks
# it. Thunar opens it with the default application for application/vnd.hpro+zip –
# the same GIO path as a double click. Then a second file goes to the running instance.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/umgebung.sh
OUT="$HUELLE/.tmp/dateimanager"
DEB=$(ls -t src-tauri/target/release/bundle/deb/*.deb | head -1)
rm -rf "$OUT" && mkdir -p "$OUT/inst" "$OUT/home/.local/share" "$OUT/home/.config" "$OUT/Dokumente" "$OUT/Weitere"
dpkg-deb -x "$DEB" "$OUT/inst"
cp dist-web/beispiel.hpro "$OUT/Dokumente/Beispiel aus dem Dateimanager.hpro"
cp dist-web/kostenschaetzung.hpro "$OUT/Weitere/Kostenschätzung.hpro"
export HOME="$OUT/home" XDG_DATA_HOME="$OUT/home/.local/share" XDG_CONFIG_HOME="$OUT/home/.config" XDG_CACHE_HOME="$OUT/home/.cache"
D="$XDG_DATA_HOME"
mkdir -p "$D/applications" "$D/mime/packages" "$D/icons"
cp "$OUT"/inst/usr/share/applications/*.desktop "$D/applications/"
cp "$OUT"/inst/usr/share/mime/packages/*.xml "$D/mime/packages/"
cp -r "$OUT"/inst/usr/share/icons/hicolor "$D/icons/"
update-mime-database "$D/mime"
update-desktop-database "$D/applications"
export PATH="$OUT/inst/usr/bin:$PATH"
hpro_laufzeit
{
  echo "# Paket: $DEB"
  echo "# Desktop-Eintrag:"; cat "$D"/applications/*.desktop
  echo "# MIME-Typ der Datei (gio info):"; gio info -a standard::content-type "$OUT/Dokumente/Beispiel aus dem Dateimanager.hpro" | grep content-type
  echo "# Standardanwendung (gio mime):"; gio mime application/vnd.hpro+zip
  echo "# mimeinfo.cache:"; cat "$D/applications/mimeinfo.cache"
} > "$OUT/registrierung.txt" 2>&1
set +e
xvfb-run -a -s "-screen 0 1280x860x24" dbus-run-session --config-file="$S/usr/share/dbus-1/session.conf" -- bash -c "
  # Xfce settings daemon (Thunar waits for it on the session bus; its D-Bus service file
  # points to /usr/lib, which does not exist on this host).
  '$L/xfce4/xfconf/xfconfd' > '$OUT/xfconfd.log' 2>&1 &
  sleep 2
  thunar '$OUT/Dokumente' > '$OUT/thunar.log' 2>&1 &
  for i in \$(seq 1 30); do sleep 1; w=\$(xdotool search --onlyvisible --class Thunar 2>/dev/null | head -1); [ -n \"\$w\" ] && break; done
  sleep 4
  import-im7.q16 -window root png:'$OUT/1-thunar.png'
  xdotool windowfocus --sync \$w; sleep 1
  # The only file in the folder: first icon of the icon view (Thunar at 0,0 without a window
  # manager, 640x480). One click selects it, the double click opens it.
  xdotool mousemove 239 105 click 1; sleep 1
  import-im7.q16 -window root png:'$OUT/2-ausgewaehlt.png'
  sleep 1; xdotool mousemove 239 105 click --repeat 2 --delay 120 1
  for i in \$(seq 1 60); do sleep 1; xdotool search --name 'Beispiel aus dem Dateimanager.hpro – hpro Reader' >/dev/null 2>&1 && break; done
  sleep 6
  import-im7.q16 -window root png:'$OUT/3-reader.png'
  {
    echo '# Fenster nach Doppelklick in Thunar:'; for x in \$(xdotool search --name 'hpro Reader'); do xdotool getwindowname \$x; done
    echo '# Prozesse (Elternprozess = Thunar bzw. gio-launch-desktop):'; ps -eo pid,ppid,comm,args | grep -E 'thunar|hpro-reader|gio-launch' | grep -v grep
  } > '$OUT/nach-oeffnen.txt'
  gio open '$OUT/Weitere/Kostenschätzung.hpro'
  for i in \$(seq 1 30); do sleep 1; xdotool search --name 'Kostenschätzung.hpro – hpro Reader' >/dev/null 2>&1 && break; done
  sleep 5
  import-im7.q16 -window root png:'$OUT/4-zweite-datei.png'
  {
    echo '# Fenster nach gio open der zweiten Datei:'; for x in \$(xdotool search --name 'hpro Reader'); do xdotool getwindowname \$x; done
    echo '# Anzahl hpro-reader-Prozesse:'; pgrep -c -x hpro-reader
  } > '$OUT/zweite-datei.txt'
  pkill -x hpro-reader; pkill -x thunar; pkill -x xfconfd; sleep 1"
set -e
cat "$OUT/registrierung.txt" "$OUT/nach-oeffnen.txt" "$OUT/zweite-datei.txt"
grep -q 'Beispiel aus dem Dateimanager.hpro – hpro Reader' "$OUT/nach-oeffnen.txt" && grep -q 'Kostenschätzung.hpro – hpro Reader' "$OUT/zweite-datei.txt" && grep -qx 1 <(tail -1 "$OUT/zweite-datei.txt")
