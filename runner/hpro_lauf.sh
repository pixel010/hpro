#!/bin/bash
# Cron-Einstieg für den selbstständigen Arbeitslauf hpro.
#
# Der Zeitwächter des Cron reißt dieses Skript nach etwa 60 Minuten ab. Deshalb startet dieser
# Einstieg die eigentliche Arbeit (runner/kette.sh) ABGEKOPPELT und kehrt sofort zurück; die Kette
# läuft dann bis zu ihrem eigenen Budget (Standard 360 Minuten) weiter und reißt nicht ab.
# Die Berichte der Kette landen in einer Ausgabedatei; dieser Einstieg gibt sie beim nächsten Tick
# weiter und leert sie danach.
#
# Ausgabe:
#   - Berichtstext  → wurde gerade geliefert (die Kette hat gearbeitet oder ist fertig)
#   - "Lauf gestartet ..."  → die Kette läuft jetzt, Bericht kommt beim nächsten Anstoß
#   - leer          → nichts zu tun und nichts zu berichten (der Cron meldet dann nichts)
export PATH="$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="${HOME:-/home/hermes1}"
cd /opt/data/html-pro || exit 0

BERICHT="/opt/data/html-pro-bericht.txt"
LOCK="/opt/data/html-pro-lauf.lock"

bericht_ausgeben() {
  if [ -s "$BERICHT" ]; then
    cat "$BERICHT"
    : > "$BERICHT"
    return 0
  fi
  return 1
}

# 1. Läuft schon eine Kette? Dann nur einen vorliegenden Bericht weitergeben.
if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  bericht_ausgeben || exit 0
  exit 0
fi

# 2. Keine Kette aktiv: erst den Bericht der letzten Runde liefern, dann neu starten.
bericht_ausgeben

setsid nohup bash runner/kette.sh >> "$BERICHT" 2>&1 < /dev/null &
sleep 5

if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  echo "Lauf gestartet $(date '+%d.%m.%Y %H:%M'), PID $(cat "$LOCK"). Bericht kommt beim nächsten Anstoß."
else
  echo "Lauf konnte nicht gestartet werden – Protokoll unter /opt/data/html-pro-lauf/."
  [ -s "$BERICHT" ] && cat "$BERICHT"
fi
exit 0
