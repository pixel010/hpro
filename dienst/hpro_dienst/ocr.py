"""OCR with Tesseract: page images to text with word boxes, scanned PDFs to searchable PDFs.

A searchable PDF keeps every original page untouched and lays an invisible text layer over it
(Tesseract's text-only PDF renderer, glyphless font, render mode 3), scaled to the page. The
scan stays the visible truth; the text layer only makes it searchable and copyable.
"""

from __future__ import annotations

import csv
import io
import re
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image
from pypdf import PdfReader, PdfWriter, Transformation

from .config import tools

#: BCP 47 primary language → Tesseract model.
LANGUAGES = {"de": "deu", "en": "eng", "fr": "fra", "it": "ita", "es": "spa", "nl": "nld", "pl": "pol", "cs": "ces", "hu": "hun", "sl": "slv", "hr": "hrv"}
#: A page with at least this many non-blank characters counts as having a text layer.
TEXT_PAGE_MIN_CHARS = 20


class OcrError(ValueError):
    pass


def available_models() -> list[str]:
    t = tools()
    return sorted(p.stem for p in Path(t.tessdata).glob("*.traineddata") if p.stem != "osd")


def supported_languages() -> list[str]:
    models = set(available_models())
    return sorted(tag for tag, model in LANGUAGES.items() if model in models)


def tesseract_languages(languages: list[str]) -> str:
    models = set(available_models())
    out = []
    for tag in languages or ["de"]:
        primary = tag.split("-")[0].lower()
        model = LANGUAGES.get(primary, primary if len(primary) == 3 else None)
        if model is None or model not in models:
            raise OcrError(f"Sprache {tag} nicht verfügbar; installiert: {', '.join(sorted(models))}")
        if model not in out:
            out.append(model)
    return "+".join(out)


def version() -> str:
    t = tools()
    run = subprocess.run([str(t.tesseract), "--version"], capture_output=True, text=True, env=t.tesseract_env(), timeout=60)
    match = re.search(r"tesseract (\S+)", run.stdout + run.stderr)
    return match.group(1) if match else "unbekannt"


def _run(image: Path, base: Path, lang: str, dpi: int, outputs: list[str], extra: list[str] | None = None) -> None:
    t = tools()
    if not t.tesseract.exists():
        raise FileNotFoundError(f"Tesseract fehlt: {t.tesseract}")
    cmd = [str(t.tesseract), str(image), str(base), "-l", lang, "--psm", "3", "--dpi", str(dpi), *(extra or []), *outputs]
    run = subprocess.run(cmd, capture_output=True, env=t.tesseract_env(), timeout=900)
    if run.returncode != 0:
        raise OcrError(f"Tesseract Exit {run.returncode}: {run.stderr.decode(errors='replace')[:400]}")


def parse_tsv(text: str) -> dict:
    """Words, lines and mean confidence from Tesseract's TSV output (level 5 = word)."""
    rows = list(csv.DictReader(io.StringIO(text), delimiter="\t", quoting=csv.QUOTE_NONE))
    lines: dict[tuple, dict] = {}
    confidences = []
    for row in rows:
        if row.get("level") != "5":
            continue
        word = (row.get("text") or "").strip()
        conf = float(row.get("conf") or -1)
        if not word or conf < 0:
            continue
        box = {"x": int(row["left"]), "y": int(row["top"]), "width": int(row["width"]), "height": int(row["height"])}
        key = (int(row["page_num"]), int(row["block_num"]), int(row["par_num"]), int(row["line_num"]))
        line = lines.setdefault(key, {"words": []})
        line["words"].append({"text": word, "box": box, "confidence": round(conf / 100, 4)})
        confidences.append(conf / 100)
    out_lines = []
    for key in sorted(lines):
        words = lines[key]["words"]
        x0 = min(w["box"]["x"] for w in words)
        y0 = min(w["box"]["y"] for w in words)
        x1 = max(w["box"]["x"] + w["box"]["width"] for w in words)
        y1 = max(w["box"]["y"] + w["box"]["height"] for w in words)
        out_lines.append({"text": " ".join(w["text"] for w in words), "box": {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0}, "words": words, "_par": key[:3]})
    paragraphs: list[list[str]] = []
    last = None
    for line in out_lines:
        if line["_par"] != last:
            paragraphs.append([])
            last = line["_par"]
        paragraphs[-1].append(line["text"])
        del line["_par"]
    return {
        "text": "\n\n".join("\n".join(p) for p in paragraphs),
        "lines": out_lines,
        "meanConfidence": round(sum(confidences) / len(confidences), 4) if confidences else None,
        "words": len(confidences),
    }


def recognize_image(image_bytes: bytes, languages: list[str], dpi: int | None = None) -> dict:
    """`Ocr.recognize` of the core (kern/src/adapters/capture.ts): text, lines and words with boxes."""
    lang = tesseract_languages(languages)
    with tempfile.TemporaryDirectory(prefix="hpro-ocr-") as tmp:
        image = Image.open(io.BytesIO(image_bytes))
        image.load()
        effective_dpi = dpi or int(round(image.info.get("dpi", (300, 300))[0])) or 300
        path = Path(tmp) / "bild.png"
        image.convert("RGB" if image.mode not in ("L", "1", "RGB") else image.mode).save(path, dpi=(effective_dpi, effective_dpi))
        _run(path, Path(tmp) / "out", lang, effective_dpi, ["tsv"])
        result = parse_tsv((Path(tmp) / "out.tsv").read_text("utf-8"))
    result["engine"] = {"name": "Tesseract", "version": version()}
    result["languages"] = lang
    return result


@dataclass
class PageReport:
    page: int
    ocr: bool
    reason: str
    words: int = 0
    mean_confidence: float | None = None
    text: str = ""
    seconds: float = 0.0

    def to_json(self) -> dict:
        return {"page": self.page, "ocr": self.ocr, "reason": self.reason, "words": self.words, "meanConfidence": self.mean_confidence, "text": self.text, "seconds": round(self.seconds, 2)}


@dataclass
class SearchableResult:
    pdf: bytes
    pages: list[PageReport] = field(default_factory=list)
    engine: dict = field(default_factory=dict)
    languages: str = ""
    dpi: int = 300

    def to_json(self) -> dict:
        ocr_pages = [p for p in self.pages if p.ocr and p.mean_confidence is not None]
        words = sum(p.words for p in ocr_pages)
        mean = sum(p.mean_confidence * p.words for p in ocr_pages) / words if words else None
        return {
            "engine": self.engine,
            "languages": self.languages,
            "dpi": self.dpi,
            "pages": [p.to_json() for p in self.pages],
            "ocrPages": len(ocr_pages),
            "words": words,
            "meanConfidence": round(mean, 4) if mean is not None else None,
        }


def page_has_text(page) -> bool:
    text = page.get_textpage().get_text_range()
    return len(re.sub(r"\s+", "", text)) >= TEXT_PAGE_MIN_CHARS


def searchable_pdf(pdf_bytes: bytes, languages: list[str], mode: str = "auto", dpi: int = 300) -> SearchableResult:
    """Adds a text layer to every page without one (`auto`) or to every page (`force`)."""
    if mode not in ("auto", "force"):
        raise OcrError("mode muss auto oder force sein")
    lang = tesseract_languages(languages)
    rendered = pdfium.PdfDocument(pdf_bytes)
    reader = PdfReader(io.BytesIO(pdf_bytes))
    if reader.is_encrypted:
        raise OcrError("verschlüsselte PDF-Dateien werden nicht verarbeitet")
    writer = PdfWriter(clone_from=reader)
    result = SearchableResult(pdf=b"", engine={"name": "Tesseract", "version": version()}, languages=lang, dpi=dpi)
    with tempfile.TemporaryDirectory(prefix="hpro-ocr-") as tmp:
        for index in range(len(rendered)):
            started = time.monotonic()
            page = rendered[index]
            if mode == "auto" and page_has_text(page):
                result.pages.append(PageReport(index + 1, False, "Textebene vorhanden"))
                continue
            image = page.render(scale=dpi / 72, grayscale=True).to_pil()
            path = Path(tmp) / f"seite-{index + 1}.png"
            image.save(path, dpi=(dpi, dpi))
            base = Path(tmp) / f"seite-{index + 1}"
            _run(path, base, lang, dpi, ["pdf", "tsv"], ["-c", "textonly_pdf=1"])
            parsed = parse_tsv(base.with_suffix(".tsv").read_text("utf-8"))
            overlay = PdfReader(str(base.with_suffix(".pdf"))).pages[0]
            target = writer.pages[index]
            if int(target.get("/Rotate", 0) or 0) % 360:
                target.transfer_rotation_to_content()
            box = target.cropbox
            ow, oh = float(overlay.mediabox.width), float(overlay.mediabox.height)
            sx, sy = float(box.width) / ow, float(box.height) / oh
            target.merge_transformed_page(overlay, Transformation().scale(sx, sy).translate(float(box.left), float(box.bottom)))
            result.pages.append(PageReport(index + 1, True, "Texterkennung" if mode == "auto" else "Texterkennung erzwungen", parsed["words"], parsed["meanConfidence"], parsed["text"], time.monotonic() - started))
    out = io.BytesIO()
    writer.write(out)
    result.pdf = out.getvalue()
    return result
