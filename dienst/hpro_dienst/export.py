"""hpro container → PDF with WeasyPrint, checked with veraPDF (HP-PRINT-012, docs/03 section 4.2).

The PDF is derived from the flowing document, like the reader's print path (P18, Zusage 6):
paper is an output, nothing in the container knows pages. The derivation follows part 0,
section 13 of the specification:

- all content documents of the reading order (or of a frozen rendition) as one document;
- title block with title, `id`, `dateModified`; table of contents with address and page number
  (WeasyPrint resolves `target-counter`, so page numbers come from the real layout);
- running header (title, date) and footer "Seite n von N";
- `#kennung` after headings h1–h3, internal links with "(S. n, #kennung)", external with URL;
- video as still image (poster or fallback image), sound as description, components as their
  static equivalent, animations in the reduced-motion state, each with "Lebendige Fassung: …";
- `details` open, every priority shown, forms as text with their values, no script;
- locks: `no-export` (HP-LOCK-004) and `no-print` (the PDF is printable) replaced by the notice of
  the core, `hidden` dropped with its notice, sealed sections stay sealed placeholders;
- code lines longer than the type area broken with "↩"; tables wider than the type area set
  smaller in two steps (measured on the laid-out pages, like P18 measures in the reader).

Nothing is fetched from the network: the URL fetcher serves container entries and `data:` only.
"""

from __future__ import annotations

import copy
import hashlib
import io
import logging
import posixpath
import re
from dataclasses import dataclass, field
from urllib.parse import quote, unquote, urlsplit

import tinycss2
import weasyprint
from lxml import etree
from weasyprint.urls import URLFetcher, URLFetcherResponse

from . import NAME, VERSION
from . import verapdf
from .container import Container, ContainerError, resolve

XHTML = "http://www.w3.org/1999/xhtml"
SVG = "http://www.w3.org/2000/svg"
EPUB = "http://www.idpf.org/2007/ops"
H = f"{{{XHTML}}}"
ORIGIN = "https://container.hpro.invalid/"
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
BLOCK = {
    "address", "article", "aside", "blockquote", "details", "dl", "fieldset", "figure", "footer", "form", "h1", "h2",
    "h3", "h4", "h5", "h6", "header", "hr", "main", "nav", "ol", "pre", "section", "table", "ul",
}
SMIL = {"animate", "animateTransform", "animateMotion", "animateColor", "set"}

#: Type area of the export stylesheet (mm): A4 minus margins 22/20/20/20, as in the print path (P18).
PAGE = {"A4": (210, 297), "A5": (148, 210), "Letter": (215.9, 279.4)}
MARGIN_TOP, MARGIN_BOTTOM, MARGIN_SIDE = 22, 20, 20
#: Code: 8.5 pt DejaVu Sans Mono, advance 0.602 em → 5.117 pt per character.
CODE_PT = 8.5
CODE_ADVANCE = 0.602

LOG = logging.getLogger("hpro_dienst.export")

#: Requested conformance → WeasyPrint variant. PDF/UA-1 is added to a PDF/A variant by an extra
#: XMP identification (pdfuaid:part=1, declared as extension schema for PDF/A).
A_VARIANTS = {
    "PDF/A-2a": "pdf/a-2a",
    "PDF/A-2u": "pdf/a-2u",
    "PDF/A-2b": "pdf/a-2b",
    "PDF/A-3a": "pdf/a-3a",
    "PDF/A-3u": "pdf/a-3u",
    "PDF/A-3b": "pdf/a-3b",
}
SUPPORTED = (*A_VARIANTS, "PDF/UA-1", "PDF/UA-2")


class ExportError(ValueError):
    """The request cannot be exported (unknown level, conflicting levels, broken container)."""


@dataclass
class LiveItem:
    kind: str
    address: str
    still: bool


@dataclass
class ExportResult:
    pdf: bytes
    checks: list[verapdf.Check]
    engine: dict
    variant: str | None
    omitted: list[dict] = field(default_factory=list)
    live: list[LiveItem] = field(default_factory=list)
    headings: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    pages: int = 0
    html: str = ""
    shrunk_tables: dict[str, int] = field(default_factory=dict)
    code_breaks: int = 0
    overflow: list[str] = field(default_factory=list)

    def to_json(self, with_report: bool = False) -> dict:
        return {
            "checks": [c.to_json(with_report) for c in self.checks],
            "engine": self.engine,
            "variant": self.variant,
            "pages": self.pages,
            "omitted": self.omitted,
            "live": [vars(item) for item in self.live],
            "headings": self.headings,
            "warnings": self.warnings,
            "shrunkTables": self.shrunk_tables,
            "codeBreaks": self.code_breaks,
            "overflow": self.overflow,
        }


# ---------------------------------------------------------------------------------------------- CSS


def css_string(text: str) -> str:
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ").replace("\r", " ") + '"'


def print_media_query(query_list: str) -> str:
    """Resolves a media query list for paper (same rules as app/src/print.ts, printMediaQuery)."""
    out = []
    for raw in query_list.split(","):
        q = raw.strip()
        q = re.sub(r"\(\s*prefers-reduced-motion\s*(:\s*reduce\s*)?\)", "(min-width: 0px)", q, flags=re.I)
        q = re.sub(r"\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)", "(max-width: -1px)", q, flags=re.I)
        q = re.sub(r"\(\s*prefers-color-scheme\s*:\s*light\s*\)", "(min-width: 0px)", q, flags=re.I)
        q = re.sub(r"\(\s*prefers-color-scheme\s*:\s*dark\s*\)", "(max-width: -1px)", q, flags=re.I)
        if re.match(r"^(only\s+)?screen\b", q, re.I):
            q = "not all"
        elif re.match(r"^not\s+screen\b", q, re.I):
            q = "all"
        elif re.match(r"^(only\s+)?print\b", q, re.I):
            q = re.sub(r"^(only\s+)?print\b", "all", q, flags=re.I)
        elif re.match(r"^not\s+print\b", q, re.I):
            q = re.sub(r"^not\s+print\b", "not all", q, flags=re.I)
        out.append(q)
    return ", ".join(out)


def print_media_css(css: str) -> str:
    return re.sub(r"@media\s+([^{;]+)\{", lambda m: f"@media {print_media_query(m.group(1))} {{", css)


def animated_selectors(css: str) -> list[str]:
    """Selectors of style rules that start a CSS animation (any nesting)."""
    found: list[str] = []

    def walk(rules):
        for rule in rules:
            if rule.type == "qualified-rule":
                decls = tinycss2.parse_declaration_list(rule.content, skip_comments=True, skip_whitespace=True)
                for d in decls:
                    if d.type == "declaration" and d.lower_name in ("animation", "animation-name"):
                        value = tinycss2.serialize(d.value).strip().lower()
                        if value and not value.startswith("none"):
                            found.append(tinycss2.serialize(rule.prelude).strip())
                            break
            elif rule.type == "at-rule" and rule.content is not None and rule.lower_at_keyword in ("media", "supports", "layer", "container"):
                walk(tinycss2.parse_rule_list(rule.content, skip_comments=True, skip_whitespace=True))

    walk(tinycss2.parse_stylesheet(css, skip_comments=True, skip_whitespace=True))
    return found


EXPORT_CSS = """
@page {
  size: %(size)s;
  margin: %(top)smm %(side)smm %(bottom)smm %(side)smm;
  @top-left { content: %(title)s; font: 8pt "DejaVu Sans", sans-serif; color: #333; vertical-align: bottom; padding-bottom: 3mm; }
  @top-right { content: %(stand)s; font: 8pt "DejaVu Sans", sans-serif; color: #333; vertical-align: bottom; padding-bottom: 3mm; white-space: nowrap; }
  @bottom-center { content: "Seite " counter(page) " von " counter(pages); font: 8pt "DejaVu Sans", sans-serif; color: #333; vertical-align: top; padding-top: 3mm; }
}
html { font-family: "DejaVu Serif", "Liberation Serif", serif; font-size: 10.5pt; line-height: 1.45; color: #000; background: #fff; }
body { margin: 0; padding: 0; max-width: none; width: auto; }
main, article, section, div, aside, header, footer, nav { max-width: none !important; }
article.hp-doc + article.hp-doc { break-before: page; }
h1, h2, h3, h4, h5, h6, summary, .hp-summary { break-after: avoid; break-inside: avoid; }
h1[data-hp-kennung]::after, h2[data-hp-kennung]::after, h3[data-hp-kennung]::after {
  content: "  #" attr(data-hp-kennung); font: normal 7.5pt "DejaVu Sans Mono", monospace; color: #444;
}
img, svg, video, canvas { max-width: 100%% !important; height: auto; }
figure { break-inside: avoid; margin-left: 0; margin-right: 0; }
figcaption { font-size: 9pt; }
tr, th, td { break-inside: avoid; }
thead { display: table-header-group; }
tfoot { display: table-row-group; }
table { max-width: 100%%; }
table[data-hp-shrink="1"] { font-size: 80%%; }
table[data-hp-shrink="2"] { font-size: 62%%; }
table[data-hp-shrink="2"] td, table[data-hp-shrink="2"] th { padding: 0.1em 0.2em !important; }
pre, code, kbd, samp { font-family: "DejaVu Sans Mono", monospace; }
pre { font-size: %(code_pt)spt; white-space: pre-wrap; overflow: visible !important; break-inside: auto; }
pre[data-hp-pre], pre[data-hp-pre] code { font-family: "DejaVu Sans Mono", monospace !important; white-space: pre !important; }
pre .hp-umbruch { color: #555; }
* { overflow: visible !important; }
a { color: #000; text-decoration: underline; }
a.hp-intern::after { content: " (S. " target-counter(attr(href url), page) ", #" attr(data-hp-kennung) ")"; text-decoration: none; }
a.hp-extern::after { content: " (" attr(data-hp-url) ")"; text-decoration: none; word-break: break-all; }
details, .hp-details { display: block; }
.hp-summary { font-weight: bold; margin: 0.5em 0 0.25em; }
.hp-titelblock { border-bottom: 0.5pt solid #000; padding-bottom: 4mm; margin-bottom: 6mm; }
.hp-titelblock .hp-titel { font: bold 16pt "DejaVu Sans", sans-serif; margin: 0 0 2mm; }
.hp-titelblock p { margin: 0.5mm 0; font-size: 9pt; }
nav.hp-verzeichnis { break-after: page; }
nav.hp-verzeichnis ol { list-style: none; padding: 0; margin: 0; }
nav.hp-verzeichnis li { margin: 0.5mm 0; }
nav.hp-verzeichnis li.hp-ebene-2 { padding-left: 6mm; }
nav.hp-verzeichnis li.hp-ebene-3 { padding-left: 12mm; }
nav.hp-verzeichnis a { text-decoration: none; }
nav.hp-verzeichnis a::after { content: leader(".") " #" attr(data-hp-kennung) "  S. " target-counter(attr(href url), page); }
.hp-sperrhinweis { border: 0.5pt solid #000; padding: 2mm; font-style: italic; }
.hp-live { display: block; font-size: 8.5pt; font-style: italic; }
.hp-formwert { border-bottom: 0.5pt solid #000; padding: 0 1mm; }
"""


# ---------------------------------------------------------------------------------------------- tree helpers


def _local(el) -> str:
    tag = el.tag
    return etree.QName(tag).localname if isinstance(tag, str) else ""


def _ns(el) -> str | None:
    tag = el.tag
    return etree.QName(tag).namespace if isinstance(tag, str) else None


def _text(el) -> str:
    return re.sub(r"\s+", " ", "".join(el.itertext())).strip()


def _new(tag: str, text: str | None = None, **attrs) -> etree._Element:
    el = etree.Element(H + tag, nsmap={None: XHTML})
    for k, v in attrs.items():
        el.set(k.rstrip("_").replace("_", "-"), v)
    if text is not None:
        el.text = text
    return el


def _replace(old, new) -> None:
    parent = old.getparent()
    new.tail = old.tail
    parent.replace(old, new)


def _parse_xhtml(data: bytes, path: str):
    parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False, remove_comments=True)
    try:
        return etree.fromstring(data, parser)
    except etree.XMLSyntaxError as err:
        raise ContainerError(f"{path}: kein wohlgeformtes XHTML ({err})") from err


def _ancestor_id(el) -> str | None:
    e = el
    while e is not None:
        if e.get("id"):
            return e.get("id")
        e = e.getparent()
    return None


def heading_kennung(h) -> str | None:
    """Printed address of a heading (as app/src/print.ts, headingKennung)."""
    parent = h.getparent()
    if parent is not None and _local(parent) in ("section", "article") and parent.get("id"):
        first = next((c for c in parent if re.fullmatch(r"h[1-6]", _local(c))), None)
        if first is h:
            return parent.get("id")
    return h.get("id")


# ---------------------------------------------------------------------------------------------- derivation


@dataclass
class _Doc:
    path: str
    root: etree._Element
    body: etree._Element
    styles: list[tuple[str, str | None]]  # (absolute URL, media)
    inline_styles: list[tuple[str, str | None]]


class Derivation:
    def __init__(self, container: Container, rendition: str | None, page_size: str):
        self.c = container
        self.rendition = rendition
        self.page_size = page_size
        self.omitted: list[dict] = []
        self.live: list[LiveItem] = []
        self.warnings: list[str] = []
        self.code_breaks = 0
        self.code_blocks: list[tuple] = []
        self.id_maps: dict[str, dict[str, str]] = {}
        self.used_ids: set[str] = set()
        self.css_texts: dict[str, str] = {}

    # -- locks (HP-LOCK-003/-004/-005, kern/src/lock/access.ts outputView) -----------------------

    def apply_locks(self, path: str, root) -> None:
        for entry in self.c.access(self.rendition):
            target = entry.get("target", "")
            rules = entry.get("rules", [])
            tpath, _, tid = target.partition("#")
            if tpath != path:
                continue
            if "no-export" in rules:
                notice = f"Abschnitt {tid or path} nicht zum Export freigegeben"
            elif "no-print" in rules:
                notice = f"Abschnitt {tid or path} nicht zum Druck freigegeben"
            elif "hidden" in rules:
                notice = f"Abschnitt {tid or path} ausgeblendet"
            else:
                continue
            p = _new("p", notice, **{"data-hp-role": "lock-notice", "class": "hp-sperrhinweis"})
            if not tid:
                body = root.find(f"{H}body")
                for child in list(body):
                    body.remove(child)
                body.text = None
                body.append(p)
            else:
                el = next(iter(root.xpath("//*[@id=$i]", i=tid)), None)
                if el is None or el.getparent() is None:
                    # The core's export view (HP-LOCK-004) already replaced it before the container left the device.
                    done = root.xpath("//*[@data-hp-role='lock-notice'][starts-with(normalize-space(.), $n)]", n=f"Abschnitt {tid} ")
                    if not done:
                        self.warnings.append(f"Sperrziel {target} nicht gefunden")
                    continue
                _replace(el, p)
            self.omitted.append({"target": target, "notice": notice})

    # -- live content (HP-PRINT-009) -----------------------------------------------------------

    def _address(self, path: str, el) -> str:
        i = _ancestor_id(el)
        return f"{path}#{i}" if i else path

    def _note(self, host, sentence: str) -> None:
        span = _new("span", sentence, **{"class": "hp-live", "data-hp-print-live": ""})
        if _local(host) == "figure":
            caption = next((c for c in host if _local(c) == "figcaption"), None)
            if caption is None:
                caption = _new("figcaption")
                host.append(caption)
            caption.append(span)
        else:
            host.append(span)

    def _figure_for(self, el, description: str):
        e = el.getparent()
        while e is not None:
            if _local(e) == "figure":
                return e
            e = e.getparent()
        figure = _new("figure", **{"class": "hp-print-still"})
        _replace(el, figure)
        el.tail = None
        figure.append(el)
        figure.append(_new("figcaption", description or None))
        return figure

    def _described_by(self, root, el) -> str:
        parts = []
        for ref in (el.get("aria-describedby") or "").split():
            target = next(iter(root.xpath("//*[@id=$i]", i=ref)), None)
            if target is not None:
                parts.append(_text(target))
        return " ".join(p for p in parts if p) or el.get("aria-label") or el.get("title") or ""

    def live_content(self, path: str, root) -> None:
        for el in list(root.iter(H + "video", H + "audio")):
            kind = _local(el)
            address = self._address(path, el)
            description = self._described_by(root, el)
            fallback = [c for c in el if _local(c) not in ("source", "track")]
            still = False
            if kind == "video":
                img = next((c if _local(c) == "img" else c.find(f".//{H}img") for c in fallback if _local(c) == "img" or c.find(f".//{H}img") is not None), None)
                poster = el.get("poster")
                if img is not None:
                    if poster and not img.get("src"):
                        img.set("src", poster)
                    replacement = img
                    still = True
                elif poster:
                    replacement = _new("img", src=poster, alt=description or "Standbild des Videos")
                    for a in ("width", "height"):
                        if el.get(a):
                            replacement.set(a, el.get(a))
                    still = True
                else:
                    replacement = _new("p", "Video ohne Standbild (kein poster und kein Ersatzbild im Dokument).")
            else:
                replacement = _new("div", **{"class": "hp-print-audio"})
                replacement.append(_new("p", "Tonaufnahme – im Ausdruck nicht abspielbar."))
                for c in fallback:
                    replacement.append(c)
            if el.get("id") and not replacement.get("id"):
                replacement.set("id", el.get("id"))
            if replacement.getparent() is not None:
                replacement.getparent().remove(replacement)
            _replace(el, replacement)
            figure = self._figure_for(replacement, description)
            label = "Video, im Ausdruck als Standbild." if kind == "video" else "Tonaufnahme."
            self._note(figure, f"{label} Lebendige Fassung: {address}")
            self.live.append(LiveItem(kind, address, still))

        for el in list(root.iter()):
            name = _local(el)
            if _ns(el) != XHTML or "-" not in name:
                continue
            address = self._address(path, el)
            div = _new("div", **{"class": "hp-print-component", "data-hp-component-name": name})
            if el.get("id"):
                div.set("id", el.get("id"))
            div.text = el.text
            for child in list(el):
                div.append(child)
            _replace(el, div)
            div.append(_new("p", f"Interaktive Komponente {name}, im Ausdruck in der statischen Fassung. Lebendige Fassung: {address}", **{"class": "hp-live"}))
            has_image = any(_local(d) in ("img", "svg", "picture", "canvas") for d in div.iter())
            self.live.append(LiveItem("component", address, has_image))

    def animations(self, path: str, root, css_list: list[str]) -> None:
        hosts = []
        for el in list(root.iter(*(f"{{{SVG}}}{n}" for n in SMIL))):
            hosts.append(el.getparent())
            el.getparent().remove(el)
        selectors = [s for css in css_list for s in animated_selectors(css)]
        if selectors:
            try:
                import cssselect2  # dependency of WeasyPrint

                wrapper = cssselect2.ElementWrapper.from_xml_root(root)
                for selector in selectors:
                    try:
                        compiled = cssselect2.compile_selector_list(re.sub(r"::?[a-z-]+(\([^)]*\))?$", "", selector))
                    except cssselect2.SelectorError:
                        self.warnings.append(f"Animationsselektor nicht auswertbar: {selector}")
                        continue
                    for item in wrapper.iter_subtree():
                        if any(sel.test(item) for sel in compiled):
                            hosts.append(item.etree_element)
            except Exception as err:  # noqa: BLE001 - a failed match must not stop the export
                self.warnings.append(f"Animationen nicht erkannt: {err}")
        done = []
        for el in hosts:
            if el is None:
                continue
            host = el
            e = el
            while e is not None:
                if _local(e) == "figure":
                    host = e
                    break
                e = e.getparent()
            else:
                e = el
                while e is not None and not e.get("id"):
                    e = e.getparent()
                host = e if e is not None else el
            if any(host is d or host in d.iterdescendants() for d in done):
                continue
            done.append(host)
            address = self._address(path, el if _local(host) == "figure" and not host.get("id") else host)
            sentence = f"Animation, im Ausdruck als Standbild (Zustand bei reduzierter Bewegung). Lebendige Fassung: {address}"
            if _local(host) == "figure":
                self._note(host, sentence)
            else:
                p = _new("p", sentence, **{"class": "hp-live"})
                parent = host.getparent()
                if parent is None:
                    continue
                parent.insert(parent.index(host) + 1, p)
            self.live.append(LiveItem("animation", address, True))

    # -- static content ------------------------------------------------------------------------

    def static_content(self, root) -> None:
        for el in list(root.iter(H + "script", H + "noscript", H + "template", H + "iframe", H + "object", H + "embed")):
            if _local(el) == "noscript":  # the reading system without script shows it; keep content
                div = _new("div")
                div.text = el.text
                for child in list(el):
                    div.append(child)
                _replace(el, div)
                continue
            parent = el.getparent()
            if parent is not None:
                if el.tail:
                    prev = el.getprevious()
                    if prev is not None:
                        prev.tail = (prev.tail or "") + el.tail
                    else:
                        parent.text = (parent.text or "") + el.tail
                parent.remove(el)
        for el in list(root.iter(H + "details")):
            el.tag = H + "div"
            el.set("class", ((el.get("class") or "") + " hp-details").strip())
            el.attrib.pop("open", None)
        for el in list(root.iter(H + "summary")):
            el.tag = H + "p"
            el.set("class", ((el.get("class") or "") + " hp-summary").strip())
        for el in root.iter():
            if isinstance(el.tag, str):
                for attr in [a for a in el.attrib if a.startswith("on")]:
                    del el.attrib[attr]
        # Forms: the values as text, no widgets (PDF/UA would need form fields with labels).
        for el in list(root.iter(H + "input", H + "select", H + "textarea", H + "button", H + "output")):
            name = _local(el)
            kind = (el.get("type") or "text").lower()
            if name == "input" and kind == "hidden":
                el.getparent().remove(el)
                continue
            if name == "input" and kind in ("checkbox", "radio"):
                value = "☒" if el.get("checked") is not None else "☐"
            elif name == "select":
                chosen = [o for o in el.iter(H + "option") if o.get("selected") is not None]
                value = ", ".join(_text(o) for o in chosen) or "—"
            elif name in ("textarea", "output", "button"):
                value = _text(el) or "—"
            else:
                value = el.get("value") or "—"
            span = _new("span", value, **{"class": "hp-formwert"})
            if el.get("id"):
                span.set("id", el.get("id"))
            _replace(el, span)
        for el in root.iter(H + "form"):
            el.tag = H + "div"
            for a in ("action", "method", "novalidate"):
                el.attrib.pop(a, None)

    # -- PDF/UA structure (ISO 14289-1, 7.2 and 7.3) ----------------------------------------------

    def tagged_structure(self, path: str, root) -> None:
        """Adapts markup that WeasyPrint would tag against PDF/UA-1.

        - Decorative images (`alt=""`, `role="presentation|none"`, `aria-hidden="true"`) become a
          box with the image as background: WeasyPrint draws backgrounds as artifacts, an `img`
          always as `Figure`, which then lacks the required alternative text (7.3-1).
        - Paragraphs directly in a list item become inline spans separated by line breaks:
          WeasyPrint tags them `P` directly under `LI`, where only `Lbl` and `LBody` are allowed
          (7.2-20); inline content of a list item is tagged as its body.
        """
        for img in list(root.iter(H + "img")):
            decorative = img.get("alt") == "" or (img.get("role") or "").strip() in ("presentation", "none") or img.get("aria-hidden") == "true"
            if not decorative:
                if img.get("alt") is None:
                    self.warnings.append(f"Bild {img.get('src')} in {path} ohne alt: im PDF als Abbildung ohne Alternativtext")
                continue
            src = img.get("src") or ""
            width, height = img.get("width"), img.get("height")
            if not (width and height):
                size = self._image_size(resolve(path, unquote(src))) if src and not re.match(r"^[a-z][a-z0-9+.-]*:", src, re.I) else None
                if size is None:
                    continue
                width, height = size
            style = (
                f"display: inline-block; width: {width}px; height: {height}px; max-width: 100%; "
                f"background: url({css_string(src)}) center / contain no-repeat; {img.get('style') or ''}"
            )
            span = _new("span", **{"class": ((img.get("class") or "") + " hp-zierbild").strip(), "style": style, "aria-hidden": "true"})
            if img.get("id"):
                span.set("id", img.get("id"))
            _replace(img, span)
        # WeasyPrint ignores `ol@start` and `li@value`; as counters the numbers stay those of the source
        # (WeasyPrint applies `counter-set` before the implicit increment of the list item).
        for ol in root.iter(H + "ol"):
            start = (ol.get("start") or "").strip()
            if re.fullmatch(r"-?\d+", start):
                ol.set("style", f"counter-reset: list-item {int(start) - 1}; {ol.get('style') or ''}")
            if ol.get("reversed") is not None:
                self.warnings.append(f"umgekehrt nummerierte Liste in {path} (ol reversed) im PDF aufsteigend nummeriert")
        for li in root.iter(H + "li"):
            value = (li.get("value") or "").strip()
            if re.fullmatch(r"-?\d+", value) and _local(li.getparent()) == "ol":
                li.set("style", f"counter-set: list-item {int(value) - 1}; {li.get('style') or ''}")
        for li in list(root.iter(H + "li")):
            blocks =[c for c in li if _local(c) in ("p", "div")]
            if not blocks or any(_local(c) not in ("p", "div", "ul", "ol") and _local(c) in BLOCK for c in li):
                continue
            first = not (li.text or "").strip()
            for c in list(li):
                if c in blocks:
                    if not first:
                        c.addprevious(_new("br"))
                    c.tag = H + "span"
                    c.set("class", ((c.get("class") or "") + " hp-listenabsatz").strip())
                first = False

    def _image_size(self, path: str) -> tuple[int, int] | None:
        data = self.c.files.get(path)
        if data is None:
            return None
        try:
            from PIL import Image

            with Image.open(io.BytesIO(data)) as image:
                return image.size
        except Exception:  # noqa: BLE001 – SVG or broken image: keep the img
            return None

    def mark_code(self, root) -> None:
        """Marks plain code blocks; their lines are broken after the first layout pass (measured width)."""
        for pre in root.iter(H + "pre"):
            target = pre[0] if len(pre) == 1 and _local(pre[0]) == "code" and not len(pre[0]) and not (pre.text or "").strip() else pre
            if len(target) > 0:
                continue  # highlighted code: left to the engine's wrapping at spaces
            self.code_blocks.append((pre, target, target.text or ""))
            pre.set("data-hp-pre", f"p{len(self.code_blocks)}")

    def break_code(self, columns: dict[str, int]) -> None:
        """Breaks lines longer than the measured width with "↩" and a two-space continuation indent."""
        self.code_breaks = 0
        for index, (pre, target, text) in enumerate(self.code_blocks, start=1):
            n = columns.get(f"p{index}")
            if not n:
                continue
            n = max(n, 12)
            out = []
            for line in text.split("\n"):
                while len(line) > n:
                    cut = n - 1
                    out.append(line[:cut] + "↩")
                    self.code_breaks += 1
                    line = "  " + line[cut:]
                out.append(line)
            target.text = "\n".join(out)

    # -- ids and links -------------------------------------------------------------------------

    def unique_ids(self, path: str, root, index: int) -> None:
        mapping: dict[str, str] = {}
        for el in root.iter():
            if not isinstance(el.tag, str):
                continue
            i = el.get("id")
            if not i:
                continue
            new = i
            if new in self.used_ids:
                new = f"d{index}-{i}"
                n = 2
                while new in self.used_ids:
                    new = f"d{index}-{i}-{n}"
                    n += 1
                el.set("id", new)
            self.used_ids.add(new)
            mapping[i] = new
        self.id_maps[path] = mapping

    def rewrite_references(self, path: str, root, reading_order: list[str]) -> None:
        for el in root.iter():
            if not isinstance(el.tag, str):
                continue
            for attr in ("src", "poster", "href", f"{{http://www.w3.org/1999/xlink}}href"):
                value = el.get(attr)
                if value is None or (_local(el) == "a" and attr == "href"):
                    continue
                if value.startswith(("data:", "#")) or re.match(r"^[a-z][a-z0-9+.-]*:", value, re.I):
                    if re.match(r"^(https?|ftp|file):", value, re.I):
                        el.set(attr, "")  # never fetched
                        self.warnings.append(f"externe Ressource nicht geladen: {value}")
                    continue
                el.set(attr, ORIGIN + quote(resolve(path, unquote(value))))
            if el.get("srcset") is not None:
                del el.attrib["srcset"]
            if el.get("style"):
                el.set("style", self.absolute_css_urls(el.get("style"), path))
        for a in root.iter(H + "a"):
            href = a.get("href")
            if href is None:
                continue
            if re.match(r"^[a-z][a-z0-9+.-]*:", href, re.I):
                a.set("class", ((a.get("class") or "") + " hp-extern").strip())
                text = _text(a)
                if text.rstrip("/") != href.rstrip("/") and not href.startswith("mailto:" + text):
                    a.set("data-hp-url", href)
                else:
                    a.set("class", a.get("class").replace("hp-extern", "").strip() or "hp-extern-sichtbar")
                continue
            target_path, _, frag = href.partition("#")
            target_path = resolve(path, unquote(target_path)) if target_path else path
            if target_path not in self.id_maps:
                a.set("class", ((a.get("class") or "") + " hp-ohne-ziel").strip())
                self.warnings.append(f"Verweis {href} in {path} zeigt nicht in die Lesereihenfolge; ohne Seitenangabe")
                del a.attrib["href"]
                continue
            frag = unquote(frag)
            new_id = self.id_maps[target_path].get(frag) if frag else self.first_id(target_path)
            if not new_id:
                self.warnings.append(f"Verweis {href} in {path}: Ziel fehlt (gesperrt oder nicht vorhanden); ohne Seitenangabe")
                del a.attrib["href"]
                continue
            a.set("href", "#" + new_id)
            a.set("data-hp-kennung", frag or new_id)
            a.set("class", ((a.get("class") or "") + " hp-intern").strip())

    def first_id(self, path: str) -> str | None:
        return next(iter(self.id_maps.get(path, {}).values()), None)

    def absolute_css_urls(self, css: str, base: str) -> str:
        def repl(m):
            url = m.group(2).strip()
            if url.startswith(("data:", "#")) or re.match(r"^[a-z][a-z0-9+.-]*:", url, re.I):
                return m.group(0) if url.startswith(("data:", "#")) else "url()"
            return f'url("{ORIGIN}{quote(resolve(base, unquote(url)))}")'

        return re.sub(r"url\(\s*(['\"]?)([^'\")]*)\1\s*\)", repl, css)

    # -- assembly --------------------------------------------------------------------------------

    def build(self) -> tuple[etree._Element, list[dict], dict]:
        order = self.c.reading_order(self.rendition)
        manifest = self.c.version_manifest(self.rendition)
        docs: list[_Doc] = []
        for index, path in enumerate(order, start=1):
            root = _parse_xhtml(self.c.files[path], path)
            if _local(root) != "html" or _ns(root) != XHTML:
                raise ContainerError(f"{path}: Wurzelelement ist nicht xhtml:html")
            body = root.find(f"{H}body")
            if body is None:
                raise ContainerError(f"{path}: kein body")
            self.apply_locks(path, root)
            styles, inline, css_texts = [], [], []
            head = root.find(f"{H}head")
            for el in list(head) if head is not None else []:
                if _local(el) == "link" and "stylesheet" in (el.get("rel") or "").split() and "alternate" not in (el.get("rel") or "").split():
                    href = el.get("href") or ""
                    if re.match(r"^[a-z][a-z0-9+.-]*:", href, re.I):
                        continue
                    target = resolve(path, unquote(href))
                    if target in self.c.files:
                        styles.append((ORIGIN + quote(target), el.get("media")))
                        css_texts.append(self.c.files[target].decode("utf-8", "replace"))
                elif _local(el) == "style":
                    css = el.text or ""
                    inline.append((self.absolute_css_urls(print_media_css(css), path), el.get("media")))
                    css_texts.append(css)
            self.live_content(path, root)
            self.animations(path, root, css_texts)
            self.static_content(root)
            self.tagged_structure(path, root)
            self.mark_code(root)
            self.unique_ids(path, root, index)
            docs.append(_Doc(path, root, body, styles, inline))
        for d in docs:
            self.rewrite_references(d.path, d.root, order)

        title = manifest.get("name") or self.c.manifest.get("name") or "Dokument"
        lang = manifest.get("inLanguage") or self.c.manifest.get("inLanguage") or "de"
        modified = manifest.get("dateModified") or self.c.manifest.get("dateModified") or ""
        doc_id = manifest.get("id") or self.c.manifest.get("id") or ""
        authors = [a.get("name") for a in manifest.get("author", []) if isinstance(a, dict) and a.get("name")]

        html = _new("html", lang=lang)
        head = etree.SubElement(html, H + "head")
        etree.SubElement(head, H + "meta", charset="utf-8")
        etree.SubElement(head, H + "title").text = title
        for name, content in (
            ("author", ", ".join(authors)),
            ("dcterms.modified", modified),
            ("generator", f"{NAME} {VERSION} (WeasyPrint {weasyprint.__version__})"),
            ("description", f"PDF-Export des hpro-Dokuments {doc_id}" + (f", Fassung {self.rendition}" if self.rendition else "")),
        ):
            if content:
                etree.SubElement(head, H + "meta", name=name, content=content)
        for d in docs:
            for url, media in d.styles:
                link = etree.SubElement(head, H + "link", rel="stylesheet", href=url)
                if media:
                    link.set("media", print_media_query(media))
            for css, media in d.inline_styles:
                style = etree.SubElement(head, H + "style")
                style.text = css
                if media:
                    style.set("media", print_media_query(media))
        body = etree.SubElement(html, H + "body")

        block = etree.SubElement(body, H + "div", **{"class": "hp-titelblock", "role": "doc-prologue"})
        etree.SubElement(block, H + "p", **{"class": "hp-titel"}).text = title
        for line in (
            f"Kennung: {doc_id}",
            f"Stand (dateModified): {modified}",
            f"Fassung: eingefrorene Fassung {self.rendition}" if self.rendition else "Fassung: Hauptfassung (lebendig)",
            f"PDF-Ausgabe aus dem hpro-Container; die lebendige Fassung ist die Quelle. Erzeugt mit {NAME} {VERSION}.",
        ):
            etree.SubElement(block, H + "p").text = line

        headings = []
        for d in docs:
            for h in d.body.iter(H + "h1", H + "h2", H + "h3"):
                k = heading_kennung(h)
                level = int(_local(h)[1])
                if k:
                    h.set("data-hp-kennung", self._original_id(d.path, k))
                    target = k
                    if h.get("id") is None and h.getparent().get("id") == k:
                        target = k
                    headings.append({"level": level, "text": _text(h), "kennung": self._original_id(d.path, k), "anchor": target, "path": d.path})
                else:
                    headings.append({"level": level, "text": _text(h), "kennung": None, "anchor": None, "path": d.path})
        nav = etree.SubElement(body, H + "nav", **{"class": "hp-verzeichnis", "aria-labelledby": "hp-verzeichnis-titel"})
        etree.SubElement(nav, H + "h1", id="hp-verzeichnis-titel").text = "Inhalt"
        ol = etree.SubElement(nav, H + "ol")
        entries = 0
        for h in headings:
            if not h["anchor"]:
                continue
            li = etree.SubElement(ol, H + "li", **{"class": f"hp-ebene-{h['level']}"})
            etree.SubElement(li, H + "a", href="#" + h["anchor"], **{"data-hp-kennung": h["kennung"]}).text = h["text"]
            entries += 1
        if entries == 0:
            body.remove(nav)

        for d in docs:
            article = etree.SubElement(body, H + "article", **{"class": "hp-doc", "data-hp-path": d.path})
            article.text = d.body.text
            for child in list(d.body):
                article.append(child)
            if d.body.get("id"):
                article.set("id", d.body.get("id"))
        for number, table in enumerate(body.iter(H + "table"), start=1):
            table.set("data-hp-table", f"t{number}")
        meta = {"title": title, "lang": lang, "modified": modified, "id": doc_id, "authors": authors}
        return html, headings, meta

    def _original_id(self, path: str, new_id: str) -> str:
        for old, new in self.id_maps.get(path, {}).items():
            if new == new_id:
                return old
        return new_id


# ---------------------------------------------------------------------------------------------- rendering


def serialize(html) -> str:
    """HTML text for WeasyPrint's HTML parser: no self-closing non-void elements."""
    for el in html.iter():
        if isinstance(el.tag, str) and _ns(el) == XHTML and _local(el) not in VOID and len(el) == 0 and el.text is None:
            el.text = ""
    return "<!DOCTYPE html>\n" + etree.tostring(html, method="xml", encoding="unicode")


def _measure(document) -> tuple[dict[str, int], list[str], dict[str, int]]:
    """Overflowing tables (excess in px), other overflowing boxes, and the columns each marked
    code block can hold (content width / advance of DejaVu Sans Mono)."""
    tables: dict[str, int] = {}
    other: list[str] = []
    columns: dict[str, int] = {}

    def walk(box, table_id, right):
        el = getattr(box, "element", None)
        tag = getattr(box, "element_tag", "") or ""
        if tag == "table" and el is not None and el.get("data-hp-table"):
            table_id = el.get("data-hp-table")
        if tag == "pre" and el is not None and el.get("data-hp-pre") and type(box).__name__ == "BlockBox":
            n = int(box.width / (box.style["font_size"] * CODE_ADVANCE))
            key = el.get("data-hp-pre")
            columns[key] = min(columns.get(key, n), n)
        try:
            edge = box.border_box_x() + box.border_width()
        except (AttributeError, TypeError):
            edge = None
        if edge is not None and edge > right and tag not in ("html", "body") and not tag.startswith("@"):
            excess = int(edge - right + 0.999)
            if table_id:
                tables[table_id] = max(tables.get(table_id, 0), excess)
            elif el is not None:
                other.append(f"{tag}#{el.get('id') or ''} (+{excess} px)")
        for child in getattr(box, "children", None) or []:
            walk(child, table_id, right)

    for page in document.pages:
        page_box = page._page_box
        right = page_box.content_box_x() + page_box.width + 0.5
        for child in page_box.children:
            walk(child, None, right)
    return tables, sorted(set(other)), columns


class ContainerFetcher(URLFetcher):
    """Serves container entries and data: URLs; everything else is refused (no network)."""

    def __init__(self, container: Container):
        super().__init__(allowed_protocols={"https", "data"}, allow_redirects=False, timeout=1)
        self.container = container
        self.missing: list[str] = []
        self.refused: list[str] = []

    def fetch(self, url, headers=None):
        if url.startswith("data:"):
            return super().fetch(url, headers)
        if not url.startswith(ORIGIN):
            self.refused.append(url)
            raise ValueError(f"kein Netzzugriff beim Export: {url}")
        path = unquote(urlsplit(url).path.lstrip("/"))
        data = self.container.files.get(path)
        if data is None:
            self.missing.append(path)
            raise ValueError(f"Ressource fehlt im Container: {path}")
        media = self.container.media_type(path) or _guess(path)
        if media == "text/css":
            text = data.decode("utf-8", "replace")
            data = print_media_css(text).encode("utf-8")
        return URLFetcherResponse(url, data, {"Content-Type": media})


def _guess(path: str) -> str:
    ext = posixpath.splitext(path)[1].lower()
    return {
        ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
        ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf",
    }.get(ext, "application/octet-stream")


OPACITY_COLORS = (
    "color", "background_color", "border_top_color", "border_right_color", "border_bottom_color",
    "border_left_color", "text_decoration_color", "outline_color",
)


def _flatten_opacity(document) -> int:
    """Turns `opacity` below 1 into the alpha of the colours of the box and its descendants.

    WeasyPrint draws a box with `opacity < 1` into a transparency group (form XObject) and maps
    its marked content in the structure tree as if it were in the page stream (no `/Stm`), so
    veraPDF reports it as neither tagged nor artifact (ISO 14289-1, 7.1-3). Text and lines with a
    translucent colour look the same on paper; images inside such a box stay opaque.
    Returns the number of boxes changed.
    """
    from tinycss2.color4 import Color

    changed = 0
    done: set[int] = set()

    def walk(box, factor):
        nonlocal changed
        style = box.style
        opacity = style["opacity"]
        if opacity < 1:
            factor *= opacity
            style["opacity"] = 1
            changed += 1
        if factor < 1 and id(style) not in done:
            done.add(id(style))
            for key in OPACITY_COLORS:
                value = style[key]
                if isinstance(value, Color):
                    style[key] = Color(value.space, value.coordinates, value.alpha * factor)
        for child in getattr(box, "children", None) or ():
            walk(child, factor)

    for page in document.pages:
        walk(page._page_box, 1.0)
    return changed


def _variant_for(conformance: list[str]) -> tuple[str | None, bool]:
    """WeasyPrint variant and whether a PDF/UA-1 identification is added to a PDF/A variant."""
    unknown = [c for c in conformance if c not in SUPPORTED]
    if unknown:
        raise ExportError(f"nicht unterstützte Konformitätsstufe: {', '.join(unknown)}; möglich: {', '.join(SUPPORTED)}")
    levels_a = [c for c in conformance if c in A_VARIANTS]
    if len(levels_a) > 1:
        parts = {c[6] for c in levels_a}
        if len(parts) > 1:
            raise ExportError("PDF/A-2 und PDF/A-3 schließen sich aus")
        # a includes u includes b: the strictest level is generated, every requested one is checked.
        levels_a.sort(key=lambda c: "aub".index(c[7]))
    ua1, ua2 = "PDF/UA-1" in conformance, "PDF/UA-2" in conformance
    if ua2 and levels_a:
        raise ExportError("PDF/UA-2 (PDF 2.0) lässt sich nicht mit PDF/A-2/-3 (PDF 1.7) verbinden")
    if ua1 and ua2:
        raise ExportError("PDF/UA-1 und PDF/UA-2 schließen sich aus")
    if levels_a:
        return A_VARIANTS[levels_a[0]], ua1
    if ua1:
        return "pdf/ua-1", False
    if ua2:
        return "pdf/ua-2", False
    return None, False


PDFUA_EXTENSION = b"""<rdf:Description xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#" rdf:about=""><pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource"><pdfaSchema:schema>PDF/UA Universal Accessibility Schema</pdfaSchema:schema><pdfaSchema:namespaceURI>http://www.aiim.org/pdfua/ns/id/</pdfaSchema:namespaceURI><pdfaSchema:prefix>pdfuaid</pdfaSchema:prefix><pdfaSchema:property><rdf:Seq><rdf:li rdf:parseType="Resource"><pdfaProperty:name>part</pdfaProperty:name><pdfaProperty:valueType>Integer</pdfaProperty:valueType><pdfaProperty:category>internal</pdfaProperty:category><pdfaProperty:description>Indicates, which part of ISO 14289 standard is followed</pdfaProperty:description></rdf:li></rdf:Seq></pdfaSchema:property></rdf:li></rdf:Bag></pdfaExtension:schemas></rdf:Description>"""


def _add_pdfua_identification(document) -> None:
    """Adds pdfuaid:part=1 (and its PDF/A extension schema) to the XMP packet of a PDF/A variant."""
    metadata = document.metadata
    original = metadata.generate_rdf_metadata

    def generate(variant, version, conformance):
        xml = original(variant, version, conformance)
        root = etree.fromstring(xml)
        rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
        desc = etree.SubElement(root, f"{{{rdf}}}Description", nsmap={"pdfuaid": "http://www.aiim.org/pdfua/ns/id/"})
        desc.set(f"{{{rdf}}}about", "")
        desc.set("{http://www.aiim.org/pdfua/ns/id/}part", "1")
        root.append(etree.fromstring(PDFUA_EXTENSION))
        return etree.tostring(root, encoding="utf-8")

    metadata.generate_rdf_metadata = generate


def export(
    container_bytes: bytes,
    conformance: list[str],
    page_size: str = "A4",
    embed_container: bool = False,
    rendition: str | None = None,
    check: bool = True,
    file_name: str = "dokument.hpro",
) -> ExportResult:
    if page_size not in PAGE:
        raise ExportError(f"Seitenformat {page_size} nicht unterstützt; möglich: {', '.join(PAGE)}")
    variant, add_ua1 = _variant_for(conformance)
    if embed_container and variant and variant.startswith("pdf/a-2"):
        raise ExportError("Container als Anhang nur mit PDF/A-3 (PDF/A-2 erlaubt nur PDF-Anhänge)")
    container = Container.from_bytes(container_bytes)
    derivation = Derivation(container, rendition, page_size)
    html, headings, meta = derivation.build()

    width, height = PAGE[page_size]
    stylesheet = EXPORT_CSS % {
        "size": f"{width}mm {height}mm",
        "top": MARGIN_TOP,
        "bottom": MARGIN_BOTTOM,
        "side": MARGIN_SIDE,
        "title": css_string(meta["title"]),
        "stand": css_string("Stand " + meta["modified"][:10] if meta["modified"] else ""),
        "code_pt": CODE_PT,
    }
    warnings = list(derivation.warnings)
    if container.integrity_failures:
        warnings.append("Hash-Manifest stimmt nicht: " + "; ".join(container.integrity_failures[:5]))
    fetcher = ContainerFetcher(container)
    shrunk: dict[str, int] = {}
    options = {"pdf_tags": True}
    if variant:
        options["pdf_variant"] = variant
    if variant and variant.startswith("pdf/a"):
        # PDF/A (ISO 19005-2, 6.2.8): images must not request interpolation; WeasyPrint sets
        # Interpolate for `image-rendering: auto`.
        stylesheet += "\nimg, svg, image, video, * { image-rendering: crisp-edges !important; }\n"
    if embed_container:
        options["attachments"] = [
            weasyprint.Attachment(string=container_bytes, name=file_name, description="hpro-Container (Quelle dieses PDF)", relationship="Source", url_fetcher=fetcher)
        ]
    css = weasyprint.CSS(string=stylesheet, url_fetcher=fetcher)
    digest = hashlib.sha256(container_bytes).hexdigest()
    options["pdf_identifier"] = digest[:32].encode()

    overflow_other: list[str] = []
    tables_by_id = {t.get("data-hp-table"): t for t in html.iter(H + "table")}
    for attempt in range(4):
        document = weasyprint.HTML(string=serialize(html), base_url=ORIGIN, url_fetcher=fetcher, media_type="print").render(stylesheets=[css], **options)
        tables, overflow_other, columns = _measure(document)
        changed = False
        if attempt == 0 and derivation.code_blocks:
            derivation.break_code(columns)
            changed = True
        for t in tables:
            if shrunk.get(t, 0) < 2:
                shrunk[t] = shrunk.get(t, 0) + 1
                tables_by_id[t].set("data-hp-shrink", str(shrunk[t]))
                changed = True
        if not changed:
            break
    remaining, overflow_other, _ = _measure(document)
    overflow = [f"Tabelle {t} ragt {px} px über den Satzspiegel" for t, px in remaining.items()] + overflow_other
    if overflow:
        warnings.append(f"{len(overflow)} Inhalte ragen über den Satzspiegel")
    if options.get("pdf_tags"):
        translucent = _flatten_opacity(document)
        if translucent:
            warnings.append(f"Deckkraft (opacity) an {translucent} Stellen als durchscheinende Farbe gesetzt (Bilder darin deckend)")
    if add_ua1:
        _add_pdfua_identification(document)
    write_options = {k: v for k, v in options.items() if k in ("pdf_variant", "pdf_tags", "attachments", "pdf_identifier")}
    pdf = document.write_pdf(**write_options)
    if fetcher.missing:
        warnings.append("fehlende Ressourcen: " + ", ".join(sorted(set(fetcher.missing))))
    if fetcher.refused:
        warnings.append("nicht geladen (kein Netz beim Export): " + ", ".join(sorted(set(fetcher.refused))))

    checks = [verapdf.check(pdf, c) for c in conformance] if check else []
    return ExportResult(
        pdf=pdf,
        checks=checks,
        engine={"name": "WeasyPrint", "version": weasyprint.__version__, "service": f"{NAME} {VERSION}"},
        variant=variant,
        omitted=derivation.omitted,
        live=derivation.live,
        headings=headings,
        warnings=warnings,
        pages=len(document.pages),
        html=serialize(html),
        shrunk_tables={t: lvl for t, lvl in shrunk.items()},
        code_breaks=derivation.code_breaks,
        overflow=overflow,
    )
