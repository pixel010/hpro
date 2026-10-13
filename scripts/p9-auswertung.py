"""P9 measurements (run with dienst/.venv/bin/python):

  p9-auswertung.py ocr <grundwahrheit.txt> <vorher.pdf> <nachher.pdf>
      text layer before and after OCR (pdfium), CER, WER, search hit rate against the ground truth
  p9-auswertung.py import <quelle.pdf> <container.hpro>
      word coverage of the container text against the PDF text layer, element counts
  p9-auswertung.py pdftext <datei.pdf> <wort>...
      page count, page size, and on which pages each word is found (pdfium text)
"""

from __future__ import annotations

import collections
import json
import re
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "dienst"))

import pypdfium2 as pdfium  # noqa: E402
from lxml import etree  # noqa: E402

from hpro_dienst import messung  # noqa: E402


def pdf_text(path: str) -> list[str]:
    doc = pdfium.PdfDocument(path)
    return [doc[i].get_textpage().get_text_range() for i in range(len(doc))]


def ocr(truth_path: str, before: str, after: str) -> None:
    truth = Path(truth_path).read_text("utf-8")
    pages_before = pdf_text(before)
    pages_after = pdf_text(after)
    text_before = "\n".join(pages_before)
    text_after = "\n".join(pages_after)
    hit_before, _ = messung.search_hit_rate(truth, text_before)
    hit_after, misses = messung.search_hit_rate(truth, text_after)
    report = {
        "datei": after,
        "seiten": len(pages_after),
        "zeichen_grundwahrheit": len(messung.normalise(truth)),
        "woerter_grundwahrheit": len(messung.normalise(truth).split(" ")),
        "suchwoerter": len(messung.search_words(truth)),
        "vorher_zeichen_textebene": len(re.sub(r"\s", "", text_before)),
        "vorher_suchtrefferquote": round(hit_before, 4),
        "nachher_zeichen_textebene": len(re.sub(r"\s", "", text_after)),
        "CER": round(messung.cer(truth, text_after), 4),
        "WER": round(messung.wer(truth, text_after), 4),
        "suchtrefferquote": round(hit_after, 4),
        "nicht_gefunden": misses[:25],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


def container_text(path: str) -> tuple[str, collections.Counter, dict]:
    z = zipfile.ZipFile(path)
    manifest = json.loads(z.read("manifest.json"))
    text, counts = [], collections.Counter()
    for item in manifest["readingOrder"]:
        root = etree.fromstring(z.read(item["url"]), etree.XMLParser(resolve_entities=False, no_network=True))
        body = root.find("{http://www.w3.org/1999/xhtml}body")
        text.append(" ".join(body.itertext()))
        for el in body.iter():
            if isinstance(el.tag, str):
                counts[etree.QName(el).localname] += 1
    return "\n".join(text), counts, manifest


def imported(source: str, container: str) -> None:
    pdf_words = messung.search_words("\n".join(pdf_text(source)))
    text, counts, manifest = container_text(container)
    norm = messung.normalise(text)
    missing = [w for w in pdf_words if w not in norm]
    report = {
        "quelle": source,
        "container": container,
        "woerter_pdf_textebene": len(pdf_words),
        "davon_im_container": len(pdf_words) - len(missing),
        "textabdeckung": round((len(pdf_words) - len(missing)) / max(1, len(pdf_words)), 4),
        "fehlend": missing[:40],
        "elemente": {k: counts[k] for k in ("h1", "h2", "h3", "h4", "section", "p", "ul", "ol", "li", "table", "caption", "th", "td", "figure", "img", "figcaption", "aside", "pre") if counts[k]},
        "source": manifest.get("source"),
        "ressourcen": [r["url"] for r in manifest["resources"]],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


def pdftext(path: str, *words: str) -> None:
    doc = pdfium.PdfDocument(path)
    pages = pdf_text(path)
    w, h = doc[0].get_size()
    print(f"{path}: {len(doc)} Seiten (Suche ohne Leerraum), Seite 1: {w / 72 * 25.4:.1f} × {h / 72 * 25.4:.1f} mm")
    # Compared without white space: a line break inside an address ("content/ index.xhtml")
    # or a hyphenation point (U+FFFE from pdfium) must not hide a hit.
    squeeze = lambda t: re.sub(r"[\s\ufffe\u00ad]+", "", t)  # noqa: E731
    for word in words:
        hits = [i + 1 for i, t in enumerate(pages) if squeeze(word) in squeeze(t)]
        print(f"  {word!r}: {'Seite ' + ', '.join(map(str, hits)) if hits else 'nicht im Text'}")


if __name__ == "__main__":
    command, *args = sys.argv[1:]
    {"ocr": ocr, "import": imported, "pdftext": pdftext}[command](*args)
