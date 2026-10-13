"""hpro-dienst: self-hostable service for PDF export, PDF import and OCR (work package P9).

The service is an addition, never a condition (docs/10, section 3, point 2): a container stays
readable without it. It runs on demand (``python -m hpro_dienst serve``) and keeps nothing:
every request works in a temporary directory that is removed afterwards.
"""

import os
from pathlib import Path

NAME = "hpro-dienst"
VERSION = "0.1.0"

# Caches (Docling models from Hugging Face, Torch, fontconfig) stay inside the installation.
_TOOLS = Path(__file__).resolve().parent.parent / "tools"
os.environ.setdefault("HF_HOME", str(_TOOLS / "hf-home"))
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("TORCH_HOME", str(_TOOLS / "torch-home"))
os.environ.setdefault("XDG_CACHE_HOME", str(_TOOLS / "cache"))
os.environ.setdefault("DOCLING_CACHE_DIR", str(_TOOLS / "docling-cache"))
