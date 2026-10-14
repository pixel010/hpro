#!/usr/bin/env bash
# Criterion 5 of docs/06 4.4 (Android part): the store build. Builds the signed release App
# Bundle (AAB, all four ABIs) twice from a clean state and compares the results byte by byte and
# entry by entry; checks the signature (jarsigner) and the bundle (bundletool validate) and
# reports sizes (bundletool get-size for a Pixel-like arm64 device).
# The upload key is a test key made here (mobil/.werkzeug/upload-test.jks), never a real one.
# Output: mobil/.tmp/store/. Runs without a device; meant to run unchanged on a CI runner with
# the same tool versions (mobil/scripts/android-sdk.sh).
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/umgebung.sh
OUT="$MOBIL/.tmp/store"
mkdir -p "$OUT"
KS="$MW/upload-test.jks"
PASS="${HPRO_UPLOAD_PASS:-hpro-nur-test}"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storetype PKCS12 -alias upload -keyalg RSA -keysize 3072 -validity 9000 \
    -storepass "$PASS" -keypass "$PASS" -dname "CN=hpro Testschluessel (P12), O=hpro" >/dev/null 2>&1
fi
cat > src-tauri/gen/android/keystore.properties <<EOF
storeFile=$KS
storePassword=$PASS
keyAlias=upload
keyPassword=$PASS
EOF
BT="$MW/bundletool.jar"
[ -f "$BT" ] || curl -sSLo "$BT" https://github.com/google/bundletool/releases/download/1.18.1/bundletool-all-1.18.1.jar

AAB=src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab
# HPRO_AAB_TARGETS: Rust targets of the bundle (default: all four Tauri targets). One target each
# for arm64 phones is enough for Google Play's 64-bit rule; the four together take hours on the
# test host (two compiler jobs, LTO).
TARGETS="${HPRO_AAB_TARGETS:-aarch64 armv7 i686 x86_64}"
# `tauri android build` compiles the Rust library, then Gradle's rustBuild task (tauri android
# android-studio-script) compiles the final crate a second time with LTO. With the configuration
# cache Gradle runs that task in parallel with the in-process Kotlin compilation; rustc plus the
# daemon exceeded the container's 2.5 GiB and the OOM killer took the daemon, twice (2026-10-14).
# For this build only, the user-level gradle.properties (it wins over the project's) gives the daemon
# a smaller heap and makes Gradle run one task at a time; the daemon is stopped after each run.
GUP="$GRADLE_USER_HOME/gradle.properties"
cat > "$GUP" <<EOF
org.gradle.jvmargs=-Xmx${HPRO_GRADLE_XMX:-768m} -XX:MaxMetaspaceSize=384m -Dfile.encoding=UTF-8
org.gradle.configuration-cache=false
org.gradle.parallel=false
org.gradle.workers.max=1
EOF
trap 'rm -f "$GUP"' EXIT
TARGET_ARGS=()
for t in $TARGETS; do TARGET_ARGS+=(--target "$t"); done
for run in 1 2; do
  echo "== Lauf $run: sauberer Release-Build (AAB, Ziele: $TARGETS) =="
  rm -rf src-tauri/target/{aarch64,armv7,i686,x86_64}-linux-android*/release src-tauri/gen/android/app/build src-tauri/gen/android/.gradle src-tauri/gen/android/buildSrc/build
  t0=$(date +%s)
  rc=0
  npx tauri android build --aab "${TARGET_ARGS[@]}" > "$OUT/build-$run.log" 2>&1 || rc=$?
  src-tauri/gen/android/gradlew --project-dir src-tauri/gen/android --stop >/dev/null 2>&1 || true
  [ "$rc" = 0 ] || { grep -A3 "What went wrong" "$OUT/build-$run.log" | head -8; exit 1; }
  echo "Dauer: $(( $(date +%s) - t0 )) s"
  cp "$AAB" "$OUT/hpro-reader-$run.aab"
  sha256sum "$OUT/hpro-reader-$run.aab" | sed "s#$OUT/##"
  ls -l "$OUT/hpro-reader-$run.aab" | awk '{print "Größe:", $5, "Bytes"}'
done

echo "== Vergleich der beiden Läufe =="
python3 - "$OUT/hpro-reader-1.aab" "$OUT/hpro-reader-2.aab" <<'PY'
import hashlib, sys, zipfile
a, b = (zipfile.ZipFile(p) for p in sys.argv[1:3])
def entries(z):
    return {i.filename: hashlib.sha256(z.read(i)).hexdigest() for i in z.infolist()}
ea, eb = entries(a), entries(b)
same_bytes = open(sys.argv[1], 'rb').read() == open(sys.argv[2], 'rb').read()
diff = sorted(n for n in set(ea) | set(eb) if ea.get(n) != eb.get(n))
print(f"Einträge: {len(ea)} / {len(eb)}; abweichende Einträge: {len(diff)}; Dateien bytegleich: {'ja' if same_bytes else 'nein'}")
for n in diff[:20]:
    print("  abweichend:", n)
unsigned = [n for n in diff if not n.startswith('META-INF/')]
print("Ergebnis: reproduzierbar" if not unsigned else "Ergebnis: NICHT reproduzierbar (Inhalt weicht ab)")
PY

echo "== Signatur und Bundle prüfen =="
jarsigner -verify "$OUT/hpro-reader-1.aab" 2>&1 | tail -1
keytool -printcert -jarfile "$OUT/hpro-reader-1.aab" 2>/dev/null | grep -E "Owner|Eigentümer|SHA256:" | head -2
java -jar "$BT" validate --bundle="$OUT/hpro-reader-1.aab" 2>&1 | grep -E "App Bundle|Error|Valid|ABI" | head -5 || true
python3 - "$OUT/hpro-reader-1.aab" <<'PY'
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
for i in z.infolist():
    if i.filename.endswith('.so') or i.filename.endswith('/assets/index.html'):
        print(f"  {i.filename}: {i.file_size} Bytes (komprimiert {i.compress_size})")
PY
cat > "$OUT/geraet-arm64.json" <<'EOF'
{"supportedAbis": ["arm64-v8a"], "supportedLocales": ["de-AT"], "screenDensity": 420, "sdkVersion": 35}
EOF
rm -f "$OUT/hpro-reader.apks"
java -jar "$BT" build-apks --bundle="$OUT/hpro-reader-1.aab" --output="$OUT/hpro-reader.apks" \
  --ks="$KS" --ks-pass="pass:$PASS" --ks-key-alias=upload --key-pass="pass:$PASS" >/dev/null
echo "Download-Größe (bundletool get-size, arm64-Gerät, MIN,MAX in Bytes):"
java -jar "$BT" get-size total --apks="$OUT/hpro-reader.apks" --device-spec="$OUT/geraet-arm64.json"
