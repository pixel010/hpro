#!/usr/bin/env bash
# P13 (CI): fetches the two tools the test suite and the epubcheck job need into the paths the
# tests expect (prototyp/tools/, as prototyp/setup-tools.sh does), with the same SHA-256 sums:
# Temurin JDK 21.0.12.1+1 and EPUBCheck 5.4.0. Everything else of setup-tools.sh (Maven/DSS,
# calibre, veraPDF, LibreOffice) is not fetched; the tests that need it skip with a reason.
set -euo pipefail
cd "$(dirname "$0")/../prototyp"
mkdir -p tools && cd tools

fetch() { # URL FILE SHA256
  [ -f "$2" ] || curl -fsSL --retry 3 -o "$2" "$1"
  echo "$3  $2" | sha256sum -c -
}

if [ ! -x jdk-21.0.12.1+1/bin/java ]; then
  fetch "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_x64_linux_hotspot_21.0.12.1_1.tar.gz" \
        jdk.tar.gz ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94
  tar xzf jdk.tar.gz && rm jdk.tar.gz
fi
if [ ! -f epubcheck-5.4.0/epubcheck.jar ]; then
  fetch https://github.com/w3c/epubcheck/releases/download/v5.4.0/epubcheck-5.4.0.zip \
        epubcheck.zip 33350c61038e71dfb3d45a76aed04bf5481e6d5500cb780f6e98db8bbd15a28c
  python3 -c "import zipfile; zipfile.ZipFile('epubcheck.zip').extractall('.')" && rm epubcheck.zip
fi
jdk-21.0.12.1+1/bin/java -version 2>&1 | head -1
jdk-21.0.12.1+1/bin/java -jar epubcheck-5.4.0/epubcheck.jar --version 2>&1 | head -1
