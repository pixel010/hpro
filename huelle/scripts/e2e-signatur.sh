#!/usr/bin/env bash
# Signing with a system key (PKCS#11) and PDF export over the sidecar, through the reader's own
# controls (P11). SoftHSM 2 stands in for a smart card or the system key store: one RSA-3072 and
# one ECDSA-P256 key with self-signed certificates. The native dialogs ("Signieren?" and
# "Speichern unter") are real and answered with xdotool. Afterwards the signed containers are
# checked by the core, EU DSS 6.5 and epubcheck (scripts/belege-p11.sh).
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/umgebung.sh
OUT="$HUELLE/.tmp/e2e-signatur"
rm -rf "$OUT" && mkdir -p "$OUT/dok" "$OUT/tokens" "$OUT/pki"
(cd src-tauri && cargo build --release --features e2e,tauri/custom-protocol --target-dir target/e2e 2>&1 | tail -1)
BIN="$HUELLE/src-tauri/target/e2e/release/hpro-desktop"
hpro_laufzeit
export SOFTHSM2_CONF="$OUT/softhsm2.conf"
printf 'directories.tokendir = %s\nobjectstore.backend = file\nlog.level = ERROR\n' "$OUT/tokens" > "$SOFTHSM2_CONF"
MOD="$L/softhsm/libsofthsm2.so"
softhsm2-util --module "$MOD" --init-token --free --label hpro-test --pin 1234 --so-pin 5678 > "$OUT/softhsm.log"
P="$OUT/pki"
openssl req -x509 -newkey rsa:3072 -nodes -keyout "$P/rsa.key" -out "$P/rsa.pem" -days 30 -subj "/CN=hpro P11 RSA-Testschluessel/O=hpro Test" 2>/dev/null
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout "$P/ec.key" -out "$P/ec.pem" -days 30 -subj "/CN=hpro P11 EC-Testschluessel/O=hpro Test" 2>/dev/null
for k in rsa ec; do openssl pkcs8 -topk8 -nocrypt -in "$P/$k.key" -out "$P/$k.p8"; done
softhsm2-util --module "$MOD" --import "$P/rsa.p8" --token hpro-test --label "RSA-Testschluessel" --id 01 --pin 1234 >> "$OUT/softhsm.log"
softhsm2-util --module "$MOD" --import "$P/ec.p8" --token hpro-test --label "EC-Testschluessel" --id 02 --pin 1234 >> "$OUT/softhsm.log"
p11tool --provider "$MOD" --login --set-pin 1234 --write --load-certificate "$P/rsa.pem" --label "RSA-Testschluessel" --id 01 "pkcs11:token=hpro-test" >> "$OUT/softhsm.log" 2>&1
p11tool --provider "$MOD" --login --set-pin 1234 --write --load-certificate "$P/ec.pem" --label "EC-Testschluessel" --id 02 "pkcs11:token=hpro-test" >> "$OUT/softhsm.log" 2>&1
p11tool --provider "$MOD" --list-all "pkcs11:token=hpro-test" > "$OUT/token-inhalt.txt" 2>&1
cp dist-web/druck.hpro "$OUT/dok/Bericht.hpro"
export HPRO_PKCS11_MODULE="$MOD" HPRO_E2E_OUT="$OUT/record.jsonl" HPRO_E2E_JS="$HUELLE/e2e/signatur.js"
export HPRO_DIENST_HOME="$(cd .. && pwd)/dienst"
set +e
xvfb-run -a -s "-screen 0 1280x900x24" dbus-run-session --config-file="$S/usr/share/dbus-1/session.conf" -- bash -c "
  timeout 1200 '$BIN' '$OUT/dok/Bericht.hpro' 2> '$OUT/stderr.log' &
  pid=\$!
  n=0
  while kill -0 \$pid 2>/dev/null; do
    for name in 'Signieren' 'Speichern unter'; do
      # Only mapped windows: GTK hides a used file chooser instead of destroying it.
      for w in \$(xdotool search --onlyvisible --name \"^\$name\\\$\" 2>/dev/null); do
        n=\$((n+1)); sleep 1
        [ \$n -le 2 ] && import-im7.q16 -window root png:'$OUT/dialog-'\$n'.png' 2>/dev/null
        echo \"\$(date +%T) Dialog '\$name' (\$w): Return\" >> '$OUT/dialoge.log'
        xdotool windowfocus --sync \$w 2>/dev/null; xdotool key --clearmodifiers Return; sleep 2
      done
    done
    sleep 0.5
  done
  wait \$pid; echo \"exit=\$?\" > '$OUT/exit.txt'"
set -e
cat "$OUT/exit.txt" "$OUT/dialoge.log" 2>/dev/null || true
ls -la "$OUT/dok"
