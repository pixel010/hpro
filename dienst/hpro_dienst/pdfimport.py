"""PDF → structured blocks with Docling (layout model, reading order, TableFormer, optional OCR).

The service returns structure, not markup: headings with level, paragraphs, lists, tables with
header cells and spans, figures with image and caption, code, formulas, footnotes. The core
(@hpro/kern, `pdf.importToDocument`) turns them into XHTML with stable addresses, so the rules
of the format stay in one place.

Reconstruction is a guess wherever the PDF does not say what it shows. Every guess the
service knows about is reported as a warning (docs/P9: Grenzen des PDF-Imports).
"""

from __future__ import annotations

import base64
import io
import os
import re
import tempfile
import time
from importlib.metadata import version as package_version
from pathlib import Path

import pypdfium2 as pdfium
from pypdf import PdfReader
from pypdf.generic import IndirectObject

from .config import tools
from .ocr import page_has_text, tesseract_languages

_CONVERTERS: dict[tuple, object] = {}
MARKER_AT_END = re.compile(r"\s+([·•▪◦‣∙\-–]|\(?\d{1,3}[.)]|[a-z][.)])$")


def _resolve(obj):
    return obj.get_object() if isinstance(obj, IndirectObject) else obj


def pdf_facts(pdf_bytes: bytes) -> dict:
    """What the PDF itself declares: tags, language, title, forms, scripts, signatures, outline."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    root = _resolve(reader.trailer["/Root"])
    facts = {
        "pages": len(reader.pages),
        "tagged": "/StructTreeRoot" in root,
        "lang": str(root.get("/Lang")) if root.get("/Lang") else None,
        "title": None,
        "formFields": 0,
        "signatureFields": 0,
        "javascript": False,
        "annotations": 0,
        "links": 0,
        "outline": 0,
        "encrypted": reader.is_encrypted,
    }
    try:
        meta = reader.metadata
        if meta and meta.title:
            facts["title"] = str(meta.title)
    except Exception:  # noqa: BLE001 - broken info dictionaries are common
        pass
    fields = reader.get_fields() or {}
    facts["formFields"] = len(fields)
    facts["signatureFields"] = sum(1 for f in fields.values() if f.get("/FT") == "/Sig")
    names = _resolve(root.get("/Names", {})) or {}
    open_action = _resolve(root.get("/OpenAction")) if root.get("/OpenAction") is not None else None
    facts["javascript"] = "/JavaScript" in names or (isinstance(open_action, dict) and open_action.get("/S") == "/JavaScript")
    for page in reader.pages:
        for annot in page.get("/Annots", []) or []:
            a = _resolve(annot)
            subtype = a.get("/Subtype")
            if subtype == "/Link":
                facts["links"] += 1
            elif subtype not in ("/Widget",):
                facts["annotations"] += 1
    try:
        facts["outline"] = len(reader.outline)
    except Exception:  # noqa: BLE001
        pass
    return facts


def _converter(ocr: str, languages: str, tables: bool):
    key = (ocr, languages, tables)
    if key in _CONVERTERS:
        return _CONVERTERS[key]
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import HeadingHierarchyOptions, OcrMode, PdfPipelineOptions, TesseractCliOcrOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption

    t = tools()
    # Docling calls the tesseract binary as a subprocess; it inherits these variables.
    os.environ.update({k: v for k, v in t.tesseract_env().items() if k in ("TESSDATA_PREFIX", "LD_LIBRARY_PATH", "OMP_THREAD_LIMIT")})
    options = PdfPipelineOptions()
    options.do_ocr = ocr != "off"
    options.ocr_options = TesseractCliOcrOptions(
        lang=languages.split("+"),
        tesseract_cmd=str(t.tesseract),
        path=str(t.tessdata),
        mode=OcrMode.FULL_PAGE if ocr == "force" else OcrMode.DEFAULT,
    )
    options.do_table_structure = tables
    options.generate_picture_images = True
    options.images_scale = 2.0
    options.generate_parsed_pages = True
    options.heading_hierarchy_options = HeadingHierarchyOptions(enabled=True)
    options.accelerator_options.num_threads = 2
    converter = DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)})
    _CONVERTERS[key] = converter
    return converter


def _text_of(item) -> str:
    return re.sub(r"[ \t]+", " ", (getattr(item, "text", "") or "")).strip()


def _page(item) -> int | None:
    prov = getattr(item, "prov", None) or []
    return prov[0].page_no if prov else None


def _bbox(item) -> list[float] | None:
    prov = getattr(item, "prov", None) or []
    if not prov:
        return None
    b = prov[0].bbox
    return [round(b.l, 1), round(b.t, 1), round(b.r, 1), round(b.b, 1)]


def _formatting(item) -> dict:
    f = getattr(item, "formatting", None)
    out = {}
    if f is not None:
        for name in ("bold", "italic", "underline", "strikethrough"):
            if getattr(f, name, False):
                out[name] = True
        script = getattr(f, "script", None)
        if script is not None and str(getattr(script, "value", script)) in ("sub", "super"):
            out["script"] = str(getattr(script, "value", script))
    link = getattr(item, "hyperlink", None)
    if link:
        out["href"] = str(link)
    return out


class _Walker:
    def __init__(self, doc):
        from docling_core.types.doc import DocItemLabel

        self.doc = doc
        self.label = DocItemLabel
        self.blocks: list[dict] = []
        self.captions: set[str] = set()
        self.footnote_refs: set[str] = set()
        self.pictures = 0
        self.tables = 0
        for item, _level in doc.iterate_items(with_groups=False):
            for ref in getattr(item, "captions", []) or []:
                self.captions.add(ref.cref)
            for ref in getattr(item, "footnotes", []) or []:
                self.footnote_refs.add(ref.cref)

    def inline_text(self, group) -> tuple[str, list[dict]]:
        spans = []
        for ref in group.children:
            item = ref.resolve(self.doc)
            if hasattr(item, "text"):
                spans.append({"text": _text_of(item), **_formatting(item)})
            elif getattr(item, "children", None):
                text, sub = self.inline_text(item)
                spans.extend(sub)
        return " ".join(s["text"] for s in spans if s["text"]), spans

    def list_block(self, group, ordered: bool) -> dict:
        from docling_core.types.doc import GroupItem, ListItem

        items = []
        for ref in group.children:
            item = ref.resolve(self.doc)
            if isinstance(item, ListItem):
                entry = {"text": _text_of(item), "marker": getattr(item, "marker", "") or "", "children": [], "page": _page(item)}
                for cref in item.children:
                    child = cref.resolve(self.doc)
                    if isinstance(child, GroupItem) and str(child.label.value) in ("list", "ordered_list"):
                        entry["children"].append(self.list_block(child, str(child.label.value) == "ordered_list" or any(getattr(c.resolve(self.doc), "enumerated", False) for c in child.children)))
                    elif hasattr(child, "text"):
                        entry["text"] = (entry["text"] + " " + _text_of(child)).strip()
                items.append(entry)
            elif isinstance(item, GroupItem) and str(item.label.value) in ("list", "ordered_list"):
                nested = self.list_block(item, str(item.label.value) == "ordered_list")
                if items:
                    items[-1]["children"].append(nested)
                else:
                    items.append({"text": "", "marker": "", "children": [nested], "page": None})
            elif hasattr(item, "text"):
                items.append({"text": _text_of(item), "marker": "", "children": [], "page": _page(item)})
        # Some producers draw the list marker after the item text; the text layer then ends with
        # it ("… entsorgen. 1."). Move such trailing markers back when every item has one.
        trailing = [MARKER_AT_END.search(i["text"]) for i in items]
        if items and all(trailing) and not any(i["marker"] for i in items):
            for item, match in zip(items, trailing):
                item["marker"] = match.group(1)
                item["text"] = item["text"][: match.start()].rstrip()
        if not ordered:
            ordered = bool(items) and all(re.match(r"^\(?\d+[.)]", i["marker"] or "") for i in items)
        return {"type": "list", "ordered": ordered, "items": items, "page": items[0]["page"] if items else None}

    def table_block(self, item) -> dict:
        data = item.data
        grid = [[None] * data.num_cols for _ in range(data.num_rows)]
        cells = []
        for cell in data.table_cells:
            r, c = cell.start_row_offset_idx, cell.start_col_offset_idx
            if r >= data.num_rows or c >= data.num_cols or grid[r][c] is not None:
                continue
            entry = {
                "row": r, "col": c, "text": re.sub(r"\s+", " ", cell.text or "").strip(),
                "rowSpan": max(1, cell.row_span), "colSpan": max(1, cell.col_span),
                "columnHeader": bool(cell.column_header), "rowHeader": bool(cell.row_header),
            }
            for rr in range(r, min(data.num_rows, r + entry["rowSpan"])):
                for cc in range(c, min(data.num_cols, c + entry["colSpan"])):
                    grid[rr][cc] = entry
            cells.append(entry)
        self.tables += 1
        return {
            "type": "table", "rows": data.num_rows, "cols": data.num_cols, "cells": cells,
            "caption": item.caption_text(self.doc) or "", "page": _page(item), "bbox": _bbox(item),
        }

    def picture_block(self, item) -> dict:
        image = item.get_image(self.doc)
        block = {"type": "figure", "caption": item.caption_text(self.doc) or "", "page": _page(item), "bbox": _bbox(item)}
        if image is not None:
            buf = io.BytesIO()
            image.convert("RGB").save(buf, format="PNG", optimize=True)
            block.update({"image": base64.b64encode(buf.getvalue()).decode(), "mediaType": "image/png", "width": image.width, "height": image.height})
        self.pictures += 1
        return block

    def walk(self, node) -> None:
        from docling_core.types.doc import (
            CodeItem, FormulaItem, GroupItem, ListItem, PictureItem, SectionHeaderItem, TableItem, TextItem, TitleItem,
        )

        for ref in node.children:
            item = ref.resolve(self.doc)
            if ref.cref in self.captions and not isinstance(item, (TableItem, PictureItem)):
                continue
            if isinstance(item, GroupItem):
                label = str(item.label.value)
                if label in ("list", "ordered_list"):
                    self.blocks.append(self.list_block(item, label == "ordered_list"))
                elif label == "inline":
                    text, spans = self.inline_text(item)
                    if text:
                        self.blocks.append({"type": "paragraph", "text": text, "spans": spans, "page": None})
                else:
                    self.walk(item)
                continue
            if isinstance(item, TitleItem):
                self.blocks.append({"type": "heading", "level": 0, "text": _text_of(item), "page": _page(item)})
            elif isinstance(item, SectionHeaderItem):
                self.blocks.append({"type": "heading", "level": int(item.level or 1), "text": _text_of(item), "page": _page(item)})
            elif isinstance(item, ListItem):
                self.blocks.append({"type": "list", "ordered": bool(item.enumerated), "items": [{"text": _text_of(item), "marker": item.marker or "", "children": [], "page": _page(item)}], "page": _page(item)})
            elif isinstance(item, TableItem):
                self.blocks.append(self.table_block(item))
            elif isinstance(item, PictureItem):
                self.blocks.append(self.picture_block(item))
            elif isinstance(item, CodeItem):
                self.blocks.append({"type": "code", "text": item.text or "", "page": _page(item)})
            elif isinstance(item, FormulaItem):
                self.blocks.append({"type": "formula", "text": _text_of(item), "page": _page(item)})
            elif isinstance(item, TextItem):
                label = str(item.label.value)
                text = _text_of(item)
                if not text:
                    continue
                if label == "footnote":
                    self.blocks.append({"type": "footnote", "text": text, "page": _page(item)})
                elif label in ("page_header", "page_footer"):
                    continue
                else:
                    kind = {"caption": "caption", "reference": "reference", "checkbox_selected": "checkbox", "checkbox_unselected": "checkbox"}.get(label, "paragraph")
                    block = {"type": kind, "text": text, "page": _page(item)}
                    fmt = _formatting(item)
                    if fmt:
                        block["spans"] = [{"text": text, **fmt}]
                    if kind == "checkbox":
                        block["checked"] = label == "checkbox_selected"
                    self.blocks.append(block)
            if getattr(item, "children", None) and not isinstance(item, (ListItem, TableItem, PictureItem)):
                self.walk(item)


def import_pdf(pdf_bytes: bytes, file_name: str = "dokument.pdf", ocr: str = "auto", languages: list[str] | None = None, tables: bool = True) -> dict:
    if ocr not in ("auto", "force", "off"):
        raise ValueError("ocr muss auto, force oder off sein")
    facts = pdf_facts(pdf_bytes)
    if facts["encrypted"]:
        raise ValueError("verschlüsselte PDF-Dateien werden nicht importiert")
    lang = tesseract_languages(languages or ([facts["lang"]] if facts["lang"] else ["de"]))
    rendered = pdfium.PdfDocument(pdf_bytes)
    pages_without_text = [i + 1 for i in range(len(rendered)) if not page_has_text(rendered[i])]
    started = time.monotonic()
    converter = _converter(ocr, lang, tables)
    from docling.datamodel.base_models import ConversionStatus

    with tempfile.TemporaryDirectory(prefix="hpro-import-") as tmp:
        path = Path(tmp) / re.sub(r"[^A-Za-z0-9._-]", "_", file_name or "dokument.pdf")
        path.write_bytes(pdf_bytes)
        result = converter.convert(str(path), raises_on_error=False)
    seconds = time.monotonic() - started
    if result.status not in (ConversionStatus.SUCCESS, ConversionStatus.PARTIAL_SUCCESS):
        raise ValueError(f"Docling: Umwandlung fehlgeschlagen ({result.status}): {[str(e) for e in result.errors][:3]}")
    doc = result.document
    walker = _Walker(doc)
    walker.walk(doc.body)
    furniture = []
    from docling_core.types.doc import ContentLayer

    for item, _level in doc.iterate_items(with_groups=False, included_content_layers={ContentLayer.FURNITURE}):
        if hasattr(item, "text") and _text_of(item):
            furniture.append(_text_of(item))

    warnings = []

    def warn(code, message, page=None):
        warnings.append({"code": code, "message": message, **({"page": page} if page else {})})

    if result.status == ConversionStatus.PARTIAL_SUCCESS:
        warn("partial-conversion", f"Docling meldet nur teilweise Umwandlung: {[str(e) for e in result.errors][:3]}")
    if not facts["tagged"]:
        warn("untagged-pdf", "Das PDF hat keine Tags (Struktur); Überschriften, Absätze, Listen und Tabellen sind aus dem Seitenbild erraten (Layoutmodell).")
        warn("reading-order-guessed", "Lesereihenfolge vom Layoutmodell bestimmt; bei Spalten, Randnotizen und Kästen prüfen.")
    else:
        warn("tags-not-used", "Das PDF ist getaggt, Docling wertet die Tags aber nicht aus; die Struktur ist trotzdem aus dem Seitenbild erraten.")
    if pages_without_text:
        if ocr == "off":
            warn("text-missing", f"Seiten ohne Textebene und OCR ausgeschaltet: {pages_without_text}; ihr Text fehlt.")
        else:
            for p in pages_without_text:
                warn("ocr-used", f"Seite {p} hat keine Textebene; Text durch Texterkennung (Tesseract, {lang}), Fehler möglich.", p)
    elif ocr == "force":
        warn("ocr-used", "Texterkennung auf allen Seiten erzwungen; die vorhandene Textebene wurde nicht verwendet.")
    if walker.tables:
        warn("table-structure-guessed", f"{walker.tables} Tabelle(n): Zellen, Kopfzeilen und Verbindungen vom Tabellenmodell (TableFormer) erkannt; Formeln und Zahlenformate gehen verloren.")
    if walker.pictures:
        warn("images-rerendered", f"{walker.pictures} Abbildung(en) aus dem Seitenbild ausgeschnitten (144 dpi), nicht die Originalbilddaten; Vektorgrafik wird Rastergrafik.")
        uncaptioned = sum(1 for b in walker.blocks if b["type"] == "figure" and not b["caption"])
        if uncaptioned:
            warn("alt-text-missing", f"{uncaptioned} Abbildung(en) ohne Bildunterschrift; der Alternativtext ist ein Platzhalter und muss ergänzt werden.")
    for block in walker.blocks:
        if block["type"] == "formula" and not block["text"].strip():
            warn("formula-not-recognized", "Formel erkannt, aber ohne Text (Formelerkennung aus); im Dokument steht ein Hinweis auf das Original.", block.get("page"))
    headings = [b for b in walker.blocks if b["type"] == "heading"]
    if len({b["level"] for b in headings if b["level"] > 0}) <= 1 and len(headings) > 2:
        warn("headings-flat", "Alle Überschriften auf derselben Ebene; die Gliederungstiefe war nicht erkennbar (keine Lesezeichen, Nummerierung oder Schriftgrößen-Stufen).")
    if furniture:
        warn("page-furniture-removed", f"{len(furniture)} Kopf-/Fußzeilen und Seitenzahlen entfernt (Seitenbezug entfällt im fließenden Dokument).")
    if facts["formFields"] - facts["signatureFields"] > 0:
        warn("form-fields-not-converted", f"{facts['formFields'] - facts['signatureFields']} Formularfeld(er) nicht als Formular übernommen; nur ihr sichtbarer Text, soweit erkannt.")
    if facts["signatureFields"]:
        warn("signature-not-transferable", f"{facts['signatureFields']} Signaturfeld(er): eine PDF-Signatur lässt sich nicht übertragen; das Original-PDF liegt im Container unter original/.")
    if facts["javascript"]:
        warn("javascript-dropped", "Das PDF enthält JavaScript; es wird nicht übernommen.")
    if facts["annotations"]:
        warn("annotations-dropped", f"{facts['annotations']} Anmerkung(en) (Kommentare, Markierungen) nicht übernommen.")
    if facts["links"]:
        linked = sum(1 for b in walker.blocks for s in b.get("spans", []) if s.get("href"))
        if linked < facts["links"]:
            warn("links-dropped", f"{facts['links']} Verknüpfung(en) im PDF, {linked} übernommen.")
    return {
        "engine": {"name": "Docling", "version": package_version("docling"), "core": package_version("docling-core"), "models": package_version("docling-ibm-models")},
        "ocrEngine": {"name": "Tesseract", "languages": lang} if ocr != "off" else None,
        "fileName": file_name,
        "pdf": facts,
        "pagesWithoutText": pages_without_text,
        "title": next((b["text"] for b in walker.blocks if b["type"] == "heading" and b["level"] == 0), None) or facts["title"],
        "language": facts["lang"],
        "blocks": walker.blocks,
        "furniture": furniture,
        "warnings": warnings,
        "seconds": round(seconds, 1),
    }
