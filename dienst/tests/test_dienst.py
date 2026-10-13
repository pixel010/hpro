"""Unit tests of the service without Docling and without veraPDF (both slow on the test host;
they run in scripts/belege-p9.sh and in kern/test/pdf.test.ts).

    dienst/.venv/bin/python -m unittest discover -s dienst/tests -v
"""

from __future__ import annotations

import io
import json
import re
import sys
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "dienst"))

import pypdfium2 as pdfium  # noqa: E402

from hpro_dienst import export, messung, ocr, pdfimport, server  # noqa: E402
from hpro_dienst.container import Container, ContainerError  # noqa: E402

EXAMPLES = ROOT / "app" / "dist"


def pdf_text(data: bytes) -> str:
    doc = pdfium.PdfDocument(data)
    return "\n".join(doc[i].get_textpage().get_text_range() for i in range(len(doc)))


def container(files: dict[str, bytes | str], manifest: dict) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip")
        z.writestr("manifest.json", json.dumps(manifest))
        for name, data in files.items():
            z.writestr(name, data)
    return buf.getvalue()


XHTML = """<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="de" xml:lang="de"><head><title>T</title>
<style>@media (prefers-reduced-motion: reduce) {{ .a {{ color: red }} }}</style></head>
<body><main><h1 id="t">Titel</h1>
<section id="s1"><h2>Abschnitt</h2><p>Siehe <a href="#geheim">dort</a> und <a href="https://example.org/x">Quelle</a>.</p>
<pre id="code">{code}</pre>
<details><summary>Mehr</summary><p>Zugeklappt</p></details>
<form><input type="checkbox" checked="checked"/><input type="text" value="Wert 42"/></form>
<script>alert(1)</script>
<img src="https://example.org/tracker.png" alt="extern"/></section>
<section id="geheim"><h2>Geheim</h2><p>Darf nicht hinaus</p></section>
</main></body></html>"""


class MediaQueries(unittest.TestCase):
    def test_print_media_query(self):
        self.assertEqual(export.print_media_query("screen and (min-width: 40em)"), "not all")
        self.assertEqual(export.print_media_query("print"), "all")
        self.assertEqual(export.print_media_query("(prefers-reduced-motion: reduce)"), "(min-width: 0px)")
        self.assertEqual(export.print_media_query("(prefers-color-scheme: dark)"), "(max-width: -1px)")

    def test_animated_selectors(self):
        css = ".a { color: red } .b { animation: x 2s } @media (min-width: 1px) { .c { animation-name: y } .d { animation: none } }"
        self.assertEqual(export.animated_selectors(css), [".b", ".c"])


class Variants(unittest.TestCase):
    def test_variant_selection(self):
        self.assertEqual(export._variant_for(["PDF/A-2a", "PDF/UA-1"]), ("pdf/a-2a", True))
        self.assertEqual(export._variant_for(["PDF/A-2b", "PDF/A-2u"]), ("pdf/a-2u", False))
        self.assertEqual(export._variant_for(["PDF/UA-1"]), ("pdf/ua-1", False))
        self.assertEqual(export._variant_for([]), (None, False))
        for bad in (["PDF/A-2a", "PDF/A-3a"], ["PDF/A-2a", "PDF/UA-2"], ["PDF/X-4"]):
            with self.assertRaises(export.ExportError):
                export._variant_for(bad)


class Export(unittest.TestCase):
    def test_derivation_locks_links_forms_script_network(self):
        long_line = "x" * 300
        data = container(
            {"content/index.xhtml": XHTML.format(code=long_line)},
            {"name": "Prüfdokument", "id": "urn:uuid:1", "inLanguage": "de", "dateModified": "2026-10-13T08:00:00Z",
             "readingOrder": [{"url": "content/index.xhtml"}], "resources": [], "access": [{"target": "content/index.xhtml#geheim", "rules": ["no-export"]}]},
        )
        r = export.export(data, [], check=False)
        text = pdf_text(r.pdf)
        self.assertNotIn("Darf nicht hinaus", text)
        self.assertIn("Abschnitt geheim nicht zum Export freigegeben", text)
        self.assertEqual(r.omitted, [{"target": "content/index.xhtml#geheim", "notice": "Abschnitt geheim nicht zum Export freigegeben"}])
        self.assertIn("(https://example.org/x)", text)
        self.assertIn("Zugeklappt", text)
        self.assertIn("Wert 42", text)
        self.assertIn("☒", text)
        self.assertNotIn("alert", r.html)
        self.assertIn("Seite 1 von", text)
        self.assertGreater(r.code_breaks, 2)
        self.assertEqual(r.overflow, [])
        self.assertTrue(any("externe Ressource nicht geladen" in w for w in r.warnings), r.warnings)
        self.assertTrue(any("Verweis #geheim" in w for w in r.warnings), r.warnings)

    @unittest.skipUnless((EXAMPLES / "druck.hpro").exists(), "app/dist/druck.hpro fehlt (npm run build -w app)")
    def test_print_example_live_elements_and_wide_table(self):
        r = export.export((EXAMPLES / "druck.hpro").read_bytes(), ["PDF/A-2a", "PDF/UA-1"], check=False)
        kinds = sorted(i.kind for i in r.live)
        self.assertEqual(kinds, ["animation", "component", "video"])
        text = pdf_text(r.pdf)
        squeezed = re.sub(r"[\s\ufffe]+", "", text)
        for item in r.live:
            self.assertIn(f"LebendigeFassung:{item.address}", squeezed)
        self.assertEqual(r.overflow, [])
        self.assertIn("t3", r.shrunk_tables)
        self.assertGreater(r.pages, 10)

    def test_broken_container(self):
        with self.assertRaises(ContainerError):
            Container.from_bytes(b"not a zip")
        with self.assertRaises(ContainerError):
            Container.from_bytes(container({}, {"readingOrder": []})).reading_order()


class Ocr(unittest.TestCase):
    TSV = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n" \
          "5\t1\t1\t1\t1\t1\t10\t10\t50\t20\t96.5\tSehr\n" \
          "5\t1\t1\t1\t1\t2\t70\t10\t80\t20\t90.0\tgeehrte\n" \
          "5\t1\t1\t2\t1\t1\t10\t50\t40\t20\t50.0\tFrau\n" \
          "4\t1\t1\t2\t1\t0\t10\t50\t40\t20\t-1\t\n"

    def test_parse_tsv(self):
        r = ocr.parse_tsv(self.TSV)
        self.assertEqual(r["text"], "Sehr geehrte\n\nFrau")
        self.assertEqual(r["words"], 3)
        self.assertAlmostEqual(r["meanConfidence"], round((0.965 + 0.9 + 0.5) / 3, 4))
        self.assertEqual(r["lines"][0]["box"], {"x": 10, "y": 10, "width": 140, "height": 20})

    def test_languages(self):
        if "deu" not in ocr.available_models():
            self.skipTest("Tesseract-Modelle fehlen (dienst/setup-dienst.sh)")
        self.assertEqual(ocr.tesseract_languages(["de-AT", "en"]), "deu+eng")
        with self.assertRaises(ocr.OcrError):
            ocr.tesseract_languages(["xx"])


class Messung(unittest.TestCase):
    def test_rates(self):
        self.assertEqual(messung.cer("Haus Nr. 12", "Haus  Nr.\n12"), 0)
        self.assertAlmostEqual(messung.cer("abcd", "abxd"), 0.25)
        self.assertAlmostEqual(messung.wer("ein zwei drei vier", "ein zwei drai vier"), 0.25)
        rate, misses = messung.search_hit_rate("Dachziegel und Lattung", "Dachziegel Latlung")
        self.assertEqual((rate, misses), (0.5, ["Lattung"]))


class ImportHeuristics(unittest.TestCase):
    def test_trailing_markers(self):
        self.assertEqual(pdfimport.MARKER_AT_END.search("Altdeckung entsorgen. 1.").group(1), "1.")
        self.assertEqual(pdfimport.MARKER_AT_END.search("Steine gebrochen ·").group(1), "·")
        self.assertIsNone(pdfimport.MARKER_AT_END.search("Preis 12,50"))


class Server(unittest.TestCase):
    def test_unknown_path_and_bad_input(self):
        with self.assertRaises(LookupError):
            server.handle("/v1/nichts", {}, b"x")
        with self.assertRaises(ValueError):
            server.handle("/v1/export", {"conformance": "PDF/X-4"}, b"x")
        with self.assertRaises(ValueError):
            server.handle("/v1/export", {}, b"kein zip")


if __name__ == "__main__":
    unittest.main()
