#!/bin/bash
# Wrapper für den selbstständigen Arbeitslauf html-Pro.
# Startet genau einen Lauf, wenn keiner aktiv ist, und gibt dessen Kurzbericht aus.
# Ist nichts zu tun, bleibt die Ausgabe leer (Cron meldet dann nichts).
export PATH="$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="${HOME:-/home/hermes1}"
cd /opt/data/html-pro || exit 0

AUSGABE="$(timeout 7500 python3 runner/auto_lauf.py 2>&1)"
RC=$?

case "$AUSGABE" in
  "Warteschlange leer"*|"Ein Lauf ist bereits aktiv"*)
    exit 0
    ;;
esac

if [ -z "$AUSGABE" ]; then
  exit 0
fi

echo "$AUSGABE"
if [ "$RC" -eq 124 ]; then
  echo "Hinweis: Der Lauf wurde nach dem Zeitlimit abgebrochen (Lock wird nach zwei Stunden frei)."
fi
exit 0
