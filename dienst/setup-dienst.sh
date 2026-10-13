#!/usr/bin/env bash
# Installs the hpro service (P9) into dienst/ – no root, no system packages, nothing outside the
# repository: Python venv (WeasyPrint, Docling, CPU-only Torch) from requirements-lock.txt,
# Tesseract 5.5.0 with German and English models from the Debian packages (unpacked, not installed),
# Docling's layout and table models (Hugging Face) under dienst/tools/hf-home.
#
# Needs: Python 3.13, uv, apt-get (only `apt-get download`, no installation), dpkg-deb, network.
# The system must provide Pango/HarfBuzz/fontconfig for WeasyPrint (Debian: libpango-1.0-0).
# veraPDF and the JDK come from prototyp/setup-tools.sh (prototyp/tools/).
set -euo pipefail
cd "$(dirname "$0")"
DIENST="$PWD"
mkdir -p tools/deb tools/tesseract
export UV_CACHE_DIR="$DIENST/tools/uv-cache"

if [ ! -x .venv/bin/python ]; then
  uv venv --python /usr/bin/python3 .venv
fi
uv pip install --python .venv/bin/python --index-strategy unsafe-best-match \
  --extra-index-url https://download.pytorch.org/whl/cpu -r requirements-lock.txt

# Tesseract 5.5.0 (Debian trixie) plus the libraries the host lacks; checked against fixed hashes.
cd tools/deb
apt-get download tesseract-ocr=5.5.0-1+b1 libtesseract5=5.5.0-1+b1 libleptonica6=1.84.1-4 libicu76=76.1-4 \
  libgif7=5.2.2-1+deb13u1 tesseract-ocr-deu=1:4.1.0-2 tesseract-ocr-eng=1:4.1.0-2 tesseract-ocr-osd=1:4.1.0-2
sha256sum -c - <<'EOF'
619328ccf9ad6c621298f9daf5e695ff50e993a6d45dd0d7f6217e1bd2d1c4ce  libgif7_5.2.2-1+deb13u1_amd64.deb
c1bf762996de9ecba9b9d871e4928a8090f023a3e9e7fa3240b3d90f892a01dc  libicu76_76.1-4_amd64.deb
e1f5fbc6fb616f5912b3cd843031ffe8e3a4fc1d0aa021b5858922c5c3655ac9  libleptonica6_1.84.1-4_amd64.deb
3261b2b3e1d6f5207512b93f531ef4b531f4160890b8e5cf4e65b989f6ba3ceb  libtesseract5_5.5.0-1+b1_amd64.deb
01b50e1211a634b54090c05084d758656c62ff18078698a9b1981097b812fce2  tesseract-ocr-deu_1%3a4.1.0-2_all.deb
9242d054563262398f8cf41fbd96fcc72f9dde70db16de18539882a6cff74f9d  tesseract-ocr-eng_1%3a4.1.0-2_all.deb
72cc0ba5a04e4d38e5d7901ae2f0319f4941fddaa4a77d1a86110909c036bacb  tesseract-ocr-osd_1%3a4.1.0-2_all.deb
9075f944564f5e567f77b218696530125cf2cf70ee64b497df3d5173bf422c7e  tesseract-ocr_5.5.0-1+b1_amd64.deb
EOF
for f in *.deb; do dpkg-deb -x "$f" ../tesseract; done
cd "$DIENST"

# Docling models: one conversion of a small PDF downloads and caches them (about 0.5 GB).
.venv/bin/python - <<'EOF'
import hpro_dienst, weasyprint
from hpro_dienst import pdfimport
pdf = weasyprint.HTML(string="<html lang=de><h1>Probe</h1><p>Modelle laden.</p></html>").write_pdf()
r = pdfimport.import_pdf(pdf, "probe.pdf", ocr="off")
print("Docling bereit:", r["engine"])
EOF
.venv/bin/python -m hpro_dienst status
