#!/usr/bin/env bash
# Erzeugt die Medien des Beispieldokuments p15-lebendig (Paket P15) mit ffmpeg:
#   zeitraffer.webm          8 s Zeitraffer der Dacheindeckung (VP9, 640x360, 12 fps, ohne Ton)
#   zeitraffer-standbild.png Standbild bei 6 s (statisches Äquivalent, Poster des Videos)
#   signal.mp3               Warnsignal des Baukrans, drei Töne (MP3, Kernmedientyp audio/mpeg in EPUB
#                            und hpro; audio/ogg verlangt in epubcheck 5.4.0 eine Rückfalldatei, RSC-032)
# Die Dateien sind eingecheckt; der Build braucht ffmpeg nicht. Aufruf: scripts/p15-medien.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=docs/spezifikation/beispiele/p15-lebendig/content/media
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
mkdir -p "$OUT"

# Haus (Wand, Fenster), Dachfläche, neue Ziegelreihen wachsen von links nach rechts; Tageszähler.
# Erst eine PNG-Folge, dann VP9: drawbox wertet w nur beim Start aus, daher je Bild ein eigener Filter.
FRAMES=$(mktemp -d)
for i in $(seq 0 95); do
  W=$(( (i * 440) / 95 ))
  DAY=$(( 1 + (i * 10) / 96 ))
  ffmpeg -hide_banner -loglevel error -y -f lavfi -i "color=c=0x9cc3d5:s=640x360:d=1" -frames:v 1 \
    -vf "drawbox=x=120:y=200:w=400:h=140:color=0xd9c7a3:t=fill,drawbox=x=170:y=240:w=60:h=50:color=0x4a5a6a:t=fill,drawbox=x=410:y=240:w=60:h=50:color=0x4a5a6a:t=fill,drawbox=x=100:y=120:w=440:h=80:color=0x6b4f3a:t=fill,drawbox=x=100:y=120:w=${W}:h=80:color=0xb5452b:t=fill,drawbox=x=100:y=146:w=${W}:h=2:color=0x7a2e1c:t=fill,drawbox=x=100:y=172:w=${W}:h=2:color=0x7a2e1c:t=fill,drawtext=fontfile=${FONT}:text='Tag ${DAY} von 10':x=20:y=20:fontsize=28:fontcolor=0x1d1d1b" \
    "$FRAMES/f$(printf %03d "$i").png"
done
ffmpeg -hide_banner -loglevel error -y -framerate 12 -i "$FRAMES/f%03d.png" -c:v libvpx-vp9 -b:v 0 -crf 40 -pix_fmt yuv420p -an "$OUT/zeitraffer.webm"
cp "$FRAMES/f072.png" "$OUT/zeitraffer-standbild.png"
rm -rf "$FRAMES"

# Drei Töne 880 Hz zu je 0,3 s mit 0,25 s Pause, Gesamtdauer 1,6 s.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "sine=frequency=880:sample_rate=48000:duration=1.6" \
  -af "volume='if(lt(mod(t,0.55),0.3),0.6,0)':eval=frame" -c:a libmp3lame -b:a 48k "$OUT/signal.mp3"

ls -l "$OUT"
