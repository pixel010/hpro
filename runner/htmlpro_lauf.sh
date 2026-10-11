#!/bin/bash
# Wrapper für den selbstständigen Arbeitslauf html-Pro (Dauerlauf).
# Arbeitet bis zu HTMLPRO_BUDGET_MIN Minuten Paket für Paket ab: nach jedem Paket startet das
# nächste, solange die Warteschlange offene Pakete hat und das Zeitbudget reicht.
# Ist nichts zu tun oder läuft schon ein Lauf, bleibt die Ausgabe leer (der Cron meldet dann nichts).
export PATH="$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="${HOME:-/home/hermes1}"
cd /opt/data/html-pro || exit 0

BUDGET_MIN="${HTMLPRO_BUDGET_MIN:-150}"
ENDE=$(( $(date +%s) + BUDGET_MIN * 60 ))
GESAMT=""

while [ "$(date +%s)" -lt "$ENDE" ]; do
  AUSGABE="$(timeout 7500 python3 runner/auto_lauf.py 2>&1)"
  RC=$?
  case "$AUSGABE" in
    "Warteschlange leer"*|"Ein Lauf ist bereits aktiv"*)
      break
      ;;
  esac
  case "$AUSGABE" in
    *"BESTAND ROT"*|*"KEIN KONTINGENT"*)
      GESAMT="${GESAMT}${AUSGABE}"$'\n'
      break
      ;;
  esac
  if [ -z "$AUSGABE" ]; then
    break
    fi
  GESAMT="${GESAMT}${AUSGABE}"$'\n'
  if [ "$RC" -eq 124 ]; then
    GESAMT="${GESAMT}Hinweis: Der Lauf wurde nach dem Zeitlimit abgebrochen; das Lock wird nach zwei Stunden frei."$'\n'
  fi
  # Nach einem blockierten Paket das Budget kürzen, damit der Lauf nicht endlos weitermacht.
  case "$AUSGABE" in
    *"BLOCKIERT"*) BUDGET_MIN=$(( BUDGET_MIN / 3 )) ;;
  esac
  if [ "$BUDGET_MIN" -lt 5 ]; then
    break
  fi
done

if [ -n "$GESAMT" ]; then
  printf '%s' "$GESAMT"
fi
exit 0
