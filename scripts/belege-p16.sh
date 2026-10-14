#!/usr/bin/env bash
# Regenerates the evidence of package P16 under docs/belege/P16/.
set -u
cd "$(dirname "$0")/.."
OUT=docs/belege/P16
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
JAR=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
(cd kern && npx tsc -p tsconfig.json && npx tsc -p tsconfig.test.json) || exit 1
mkdir -p kern/build/p16
{
  echo "\$ cd kern && P16_OUT=build/p16 node --test build/test/nest.test.js"
  date -Iseconds; node --version
  (cd kern && P16_OUT="$PWD/build/p16" timeout 300 node --test build/test/nest.test.js 2>&1); echo "exit $?"
} > "$OUT/testlauf-nest.txt"
{
  for v in 1 2; do
    echo "\$ java -jar $JAR kern/build/p16/p16-fassung-$v.epub"
    timeout 300 "$JAVA" -jar "$JAR" "kern/build/p16/p16-fassung-$v.epub" 2>&1; echo "exit $?"
  done
} > "$OUT/epubcheck.txt"
grep -E "^(✔|✖|﹣)|exit" "$OUT/testlauf-nest.txt"; grep -E "Messages|exit" "$OUT/epubcheck.txt"
