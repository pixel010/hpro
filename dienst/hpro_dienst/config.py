"""Paths of the external tools. Defaults point into the repository (dienst/tools, prototyp/tools);
environment variables override them for a self-hosted installation."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

DIENST_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = DIENST_DIR.parent
TOOLS = DIENST_DIR / "tools"


def _path(env: str, default: Path) -> Path:
    value = os.environ.get(env)
    return Path(value) if value else default


@dataclass(frozen=True)
class Tools:
    tesseract: Path
    tesseract_lib: Path
    tessdata: Path
    verapdf: Path
    java_home: Path

    def tesseract_env(self) -> dict[str, str]:
        env = dict(os.environ)
        env["TESSDATA_PREFIX"] = str(self.tessdata)
        if self.tesseract_lib.is_dir():
            env["LD_LIBRARY_PATH"] = os.pathsep.join(p for p in (str(self.tesseract_lib), env.get("LD_LIBRARY_PATH", "")) if p)
        # One thread per process: the service runs pages one after another and must not starve the host.
        env.setdefault("OMP_THREAD_LIMIT", "1")
        return env

    def verapdf_env(self) -> dict[str, str]:
        env = dict(os.environ)
        if self.java_home.is_dir():
            env["JAVA_HOME"] = str(self.java_home)
            env["PATH"] = os.pathsep.join((str(self.java_home / "bin"), env.get("PATH", "")))
        return env


def tools() -> Tools:
    tess_root = TOOLS / "tesseract"
    return Tools(
        tesseract=_path("HPRO_TESSERACT", tess_root / "usr/bin/tesseract"),
        tesseract_lib=_path("HPRO_TESSERACT_LIB", tess_root / "usr/lib/x86_64-linux-gnu"),
        tessdata=_path("HPRO_TESSDATA", tess_root / "usr/share/tesseract-ocr/5/tessdata"),
        verapdf=_path("HPRO_VERAPDF", REPO_ROOT / "prototyp/tools/verapdf-1.30.3/verapdf"),
        java_home=_path("HPRO_JAVA_HOME", REPO_ROOT / "prototyp/tools/jdk-21.0.12.1+1"),
    )

