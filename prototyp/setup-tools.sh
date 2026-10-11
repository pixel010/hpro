#!/usr/bin/env bash
# Lädt alle Werkzeuge des Container-Experiments nach prototyp/tools/ (nichts außerhalb des Repos,
# kein sudo, kein Docker) und baut das DSS-Werkzeug. Prüfsummen wie am 11.10.2026 gemessen.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p tools
cd tools

fetch() { # URL DATEI SHA256
  [ -f "$2" ] || curl -fsSL -A "Mozilla/5.0" -o "$2" "$1"
  echo "$3  $2" | sha256sum -c -
}

# Temurin JDK 21 (ein JRE genügt für epubcheck; für das DSS-Werkzeug wird der Compiler gebraucht)
if [ ! -d jdk-21.0.12.1+1 ]; then
  fetch "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_x64_linux_hotspot_21.0.12.1_1.tar.gz" \
        jdk.tar.gz ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94
  tar xzf jdk.tar.gz && rm jdk.tar.gz
fi

# EPUBCheck 5.4.0 (W3C)
if [ ! -d epubcheck-5.4.0 ]; then
  fetch https://github.com/w3c/epubcheck/releases/download/v5.4.0/epubcheck-5.4.0.zip \
        epubcheck.zip 33350c61038e71dfb3d45a76aed04bf5481e6d5500cb780f6e98db8bbd15a28c
  python3 -c "import zipfile; zipfile.ZipFile('epubcheck.zip').extractall('.')" && rm epubcheck.zip
fi

# Apache Maven 3.9.16 (nur zum Auflösen der DSS-Abhängigkeiten; lokales Repository unter tools/m2)
if [ ! -d apache-maven-3.9.16 ]; then
  curl -fsSL -o mvn.tgz https://dlcdn.apache.org/maven/maven-3/3.9.16/binaries/apache-maven-3.9.16-bin.tar.gz
  echo "$(curl -fsSL https://dlcdn.apache.org/maven/maven-3/3.9.16/binaries/apache-maven-3.9.16-bin.tar.gz.sha512)  mvn.tgz" | sha512sum -c -
  tar xzf mvn.tgz && rm mvn.tgz
fi

# calibre 9.16.0 (portabel; ebook-meta/ebook-convert dienen als Reader-Engine ohne GUI)
if [ ! -d calibre ]; then
  fetch https://github.com/kovidgoyal/calibre/releases/download/v9.16.0/calibre-9.16.0-x86_64.txz \
        calibre.txz 03cd4fda43de23d65405a3c90b924bc4a5c84753e388589d4ca343d9ba561a1d
  mkdir -p calibre && tar xJf calibre.txz -C calibre && rm calibre.txz
fi
cd ..

# Python-venv im Repo: EbookLib als zweiter Reader-Parser, pypdf zum Lesen der ETSI-Norm
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q EbookLib==0.18 pypdf

# DSS-Werkzeug (EU DSS 6.5) bauen
(cd dss && JAVA_HOME="$PWD/../tools/jdk-21.0.12.1+1" ../tools/apache-maven-3.9.16/bin/mvn -q -B \
  -Dmaven.repo.local="$PWD/../tools/m2" package -DskipTests)
echo "Werkzeuge bereit."
