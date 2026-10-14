#!/usr/bin/env bash
# Compares two release directories written by scripts/release-bauen.sh (P14), e.g. two runs on the
# same commit or a stranger's build against the reference:
#
#   scripts/release-vergleichen.sh <release-A> <release-B>
#
# Expected result: kern package and demo documents byte-identical; inside the reader archive every
# file byte-identical except the two bundled sample documents that contain fresh random values on
# each build by design (kostenschaetzung.hpro: ECDSA signature with a test key generated during the
# build; sperren.hpro: sealed section encrypted with a random salt and IV, plus an ECDSA signature)
# and sw.js, whose cache name `t` is a hash over all precached files. sw.js must be identical once
# that hash is masked. Exit 0 when exactly that holds, 1 otherwise.
set -euo pipefail
A=$(realpath "$1"); B=$(realpath "$2")
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
WORK=$(mktemp -d "$PWD/release-tmp.XXXXXX")
trap 'rm -rf "$WORK"' EXIT
fail=0

for f in "hpro-kern-$VERSION.tgz" hpro-demo-bericht.hpro hpro-demo-formular.hpro hpro-demo-nachweis.hpro; do
  ha=$(sha256sum "$A/$f" | cut -d' ' -f1); hb=$(sha256sum "$B/$f" | cut -d' ' -f1)
  if [ "$ha" = "$hb" ]; then echo "bytegleich      $f  $ha"; else echo "ABWEICHUNG      $f  $ha / $hb"; fail=1; fi
done

R="hpro-reader-$VERSION.tar.gz"
if cmp -s "$A/$R" "$B/$R"; then
  echo "bytegleich      $R"
else
  mkdir -p "$WORK/a" "$WORK/b"
  tar -xzf "$A/$R" -C "$WORK/a"; tar -xzf "$B/$R" -C "$WORK/b"
  (cd "$WORK/a" && find . -type f | sort) > "$WORK/liste-a"; (cd "$WORK/b" && find . -type f | sort) > "$WORK/liste-b"
  if ! cmp -s "$WORK/liste-a" "$WORK/liste-b"; then echo "ABWEICHUNG      $R: andere Dateiliste"; diff "$WORK/liste-a" "$WORK/liste-b" || true; fail=1; fi
  same=0; expected=0
  while read -r p; do
    name=${p##*/}
    if cmp -s "$WORK/a/$p" "$WORK/b/$p"; then same=$((same + 1)); continue; fi
    case "$name" in
      kostenschaetzung.hpro|sperren.hpro)
        echo "erwartet anders $R:${p#./} (Zufallswerte aus Signatur bzw. Verschlüsselung)"; expected=$((expected + 1)) ;;
      sw.js)
        if cmp -s <(sed 's/t=`[0-9a-f]*`/t=`…`/' "$WORK/a/$p") <(sed 's/t=`[0-9a-f]*`/t=`…`/' "$WORK/b/$p"); then
          echo "erwartet anders $R:${p#./} (nur die Cache-Kennung t, ein Hash über die vorgeladenen Dateien)"; expected=$((expected + 1))
        else echo "ABWEICHUNG      $R:${p#./} (mehr als die Cache-Kennung)"; fail=1; fi ;;
      *) echo "ABWEICHUNG      $R:${p#./}"; fail=1 ;;
    esac
  done < "$WORK/liste-a"
  echo "Reader-Archiv: $same Dateien bytegleich, $expected erwartet verschieden (von $(wc -l < "$WORK/liste-a"))"
fi
if [ $fail -eq 0 ]; then echo "ERGEBNIS: reproduzierbar (bis auf die benannten Zufallswerte)"; else echo "ERGEBNIS: NICHT reproduzierbar"; fi
exit $fail
