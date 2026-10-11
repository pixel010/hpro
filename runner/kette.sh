#!/bin/bash
# Kette: arbeitet Paket für Paket ab, bis die Warteschlange leer ist, das Kontingent erschöpft ist
# oder das Zeitbudget reicht. Wird vom Cron-Einstieg (htmlpro_lauf.sh) abgekoppelt gestartet und
# schreibt ihren Bericht in die Ausgabedatei, damit der Zeitwächter des Cron sie nicht abreißt.
export PATH="$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="${HOME:-/home/hermes1}"
cd /opt/data/html-pro || exit 0

BUDGET_MIN="${HTMLPRO_BUDGET_MIN:-360}"
ENDE=$(( $(date +%s) + BUDGET_MIN * 60 ))

echo "── Lauf gestartet $(date '+%d.%m.%Y %H:%M'), Budget ${BUDGET_MIN} Minuten ──"

while [ "$(date +%s)" -lt "$ENDE" ]; do
  REST=$(( ENDE - $(date +%s) ))
  if [ "$REST" -lt 720 ]; then
    echo "Zeitbudget fast aufgebraucht (${REST}s) – der nächste Anstoß macht weiter."
    break
  fi
  export HTMLPRO_ZEITBUDGET_S=$(( REST - 180 ))
  AUSGABE="$(timeout 14700 python3 runner/auto_lauf.py 2>&1)"
  RC=$?
  case "$AUSGABE" in
    "Ein Lauf ist bereits aktiv"*)
      break
      ;;
    "Warteschlange leer"*)
      echo "$AUSGABE"
      break
      ;;
  esac
  if [ -z "$AUSGABE" ]; then
    break
  fi
  printf '%s\n' "$AUSGABE"
  case "$AUSGABE" in
    *"BESTAND ROT"*|*"KEIN KONTINGENT"*)
      break
      ;;
  esac
  if [ "$RC" -eq 124 ]; then
    echo "Hinweis: Der Lauf wurde nach dem Zeitlimit abgebrochen; das Lock wird nach vier Stunden frei."
  fi
done

echo "── Lauf beendet $(date '+%d.%m.%Y %H:%M') ──"
