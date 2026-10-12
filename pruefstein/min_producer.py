#!/usr/bin/env python3
"""Minimal hpro 0.1 producer (clean-room implementation, spec section 17.2).

Usage:  python3 min_producer.py <input.json> <output.hpro>

Input JSON:
  {
    "title": "...",                 # manifest.json#name, dc:title, h1 of first document
    "language": "de",               # BCP 47, manifest.json#inLanguage, dc:language, html/@lang
    "dateModified": "YYYY-MM-DDThh:mm:ssZ",   # optional; default: now (UTC)
    "id": "urn:uuid:...",           # optional; default: deterministic UUIDv5 from the input
    "blocks": [
      {"type": "heading", "level": 2, "text": "..."},
      {"type": "paragraph", "text": "..."},
      {"type": "list", "ordered": false, "items": ["...", "..."]},
      {"type": "table", "caption": "...", "header": ["A", "B"], "rows": [["1", "2"], ...]}
    ]
  }

Every heading of level 1 starts a new content document (content/<slug>.xhtml);
blocks before the first level-1 heading go into content/index.xhtml whose h1 is
the title.  Only the Python standard library is used.

Profile: static.  Target: all "Muss" requirements of level Basis with subject D or E
listed in spec section 17.2 (column "Durch Tun zu erfüllen").
"""

import datetime as _dt
import hashlib
import json
import re
import sys
import unicodedata
import uuid
import zipfile
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape, quoteattr

SPEC_PROFILE_STATIC = "https://hpro.example/spec/0.1/profile/static"
# The hpro namespace URL is taken from the informative example in spec section 2;
# the normative text (HP-META-001) does not spell it out.  See fragen.md.
HP_CONTEXT = ["https://www.w3.org/ns/pub-context", "https://hpro.example/ns/v0"]

XHTML_NS = "http://www.w3.org/1999/xhtml"
EPUB_NS = "http://www.idpf.org/2007/ops"
OPF_NS = "http://www.idpf.org/2007/opf"
DC_NS = "http://purl.org/dc/elements/1.1/"
OCF_NS = "urn:oasis:names:tc:opendocument:xmlns:container"

MT_XHTML = "application/xhtml+xml"
MT_CSS = "text/css"
MT_OPF = "application/oebps-package+xml"
MT_JSON = "application/json"

ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")

STYLESHEET = """\
/* hpro 0.1 minimal stylesheet.  HP-INH-004: body text derives from the
   reading-system variables --hp-*; the second argument of var() is only the
   fallback.  None of these variables is set on :root here. */
html { font-family: sans-serif; }
body {
  font-size: var(--hp-font-size, 1rem);
  line-height: var(--hp-line-height, 1.5);
  letter-spacing: var(--hp-letter-spacing, normal);
  word-spacing: var(--hp-word-spacing, normal);
  color: var(--hp-foreground, #111111);
  background-color: var(--hp-background, #ffffff);
  margin: 0 auto;
  padding: 1rem;
  max-width: 40rem;
}
p, ul, ol, table, pre, blockquote, figure {
  margin-top: var(--hp-paragraph-spacing, 1em);
  margin-bottom: var(--hp-paragraph-spacing, 1em);
}
h1, h2, h3, h4, h5, h6 { line-height: 1.25; break-after: avoid; }
h1 { font-size: 1.75em; }
h2 { font-size: 1.4em; }
h3 { font-size: 1.15em; }
table, figure, pre { break-inside: avoid; }
table { border-collapse: collapse; }
th, td { border: 1px solid currentColor; padding: 0.25em 0.5em; text-align: left; vertical-align: top; }
th { font-weight: bold; }
pre { white-space: pre-wrap; }
img { max-width: 100%; height: auto; }
"""


class ProducerError(Exception):
    pass


# --------------------------------------------------------------------------- helpers

def slugify(text, fallback="abschnitt"):
    """Deterministic ASCII slug usable as id (HP-ADR-002) and as file name (HP-CONT-006)."""
    t = text.lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        t = t.replace(a, b)
    t = unicodedata.normalize("NFKD", t)
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    if not t:
        t = fallback
    if not t[0].isalpha():
        t = "s-" + t
    return t[:48].rstrip("-.")


class IdPool:
    """Unique ids per content document (HP-ADR-002)."""

    def __init__(self):
        self.used = set()

    def make(self, base):
        cand = base
        n = 1
        while cand in self.used:
            n += 1
            cand = f"{base}-{n}"
        if not ID_RE.match(cand) or len(cand) > 64:
            raise ProducerError(f"generated id violates HP-ADR-002: {cand!r}")
        self.used.add(cand)
        return cand


def sri_sha256(data: bytes) -> str:
    import base64
    return "sha256-" + base64.b64encode(hashlib.sha256(data).digest()).decode("ascii")


def check_xml(name, data: bytes, expected_root):
    """Self-check: well-formed XML with the expected root (HP-INH-001 / CONT-003 / CONT-004)."""
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise ProducerError(f"{name}: generated XML is not well-formed: {exc}")
    if root.tag != expected_root:
        raise ProducerError(f"{name}: unexpected root element {root.tag}")


# --------------------------------------------------------------------------- content model

class Doc:
    def __init__(self, path, title, lang):
        self.path = path          # container path, e.g. content/index.xhtml
        self.title = title
        self.lang = lang
        self.ids = IdPool()
        self.section_id = self.ids.make("s-" + slugify(title))
        self.h1_id = self.ids.make(slugify(title))
        self.body = []            # list of XHTML strings (blocks)
        self.toc = []             # list of (level, id, text) for headings 2..6
        self.table_count = 0


def split_documents(inp):
    """Level-1 headings start new content documents; the first document is content/index.xhtml."""
    title = inp["title"]
    lang = inp["language"]
    blocks = inp.get("blocks", [])
    docs = []
    used_paths = set()

    def new_doc(heading_text):
        if not docs:
            path = "content/index.xhtml"
        else:
            base = slugify(heading_text, "teil")
            path = f"content/{base}.xhtml"
            n = 1
            while path in used_paths or path == "content/index.xhtml" or path == "content/nav.xhtml" or path == "content/style.css":
                n += 1
                path = f"content/{base}-{n}.xhtml"
        used_paths.add(path)
        d = Doc(path, heading_text, lang)
        docs.append(d)
        return d

    cur = None
    for i, blk in enumerate(blocks):
        kind = blk.get("type")
        if kind == "heading" and int(blk.get("level", 2)) == 1:
            # a level-1 heading is the h1 of a (new) content document
            cur = new_doc(blk["text"])
            continue
        if cur is None:
            cur = new_doc(title)
        render_block(cur, blk)
    if not docs:
        new_doc(title)
    return docs


def render_block(doc: Doc, blk):
    kind = blk.get("type")
    if kind == "heading":
        level = int(blk.get("level", 2))
        if level < 2 or level > 6:
            raise ProducerError(f"heading level {level} not supported inside a document (use 2..6)")
        text = str(blk["text"])
        hid = doc.ids.make(slugify(text, "ueberschrift"))
        doc.body.append(f"<h{level} id={quoteattr(hid)}>{escape(text)}</h{level}>")
        doc.toc.append((level, hid, text))
    elif kind == "paragraph":
        doc.body.append(f"<p>{escape(str(blk['text']))}</p>")
    elif kind == "list":
        tag = "ol" if blk.get("ordered") else "ul"
        items = "".join(f"<li>{escape(str(it))}</li>" for it in blk["items"])
        doc.body.append(f"<{tag}>{items}</{tag}>")
    elif kind == "table":
        doc.table_count += 1
        header = [str(c) for c in blk["header"]]
        rows = [[str(c) for c in r] for r in blk["rows"]]
        ncol = len(header)
        for r in rows:
            if len(r) != ncol:                       # HP-MIN-006: equal column count
                raise ProducerError("table rows must all have the same number of columns")
        caption = str(blk.get("caption") or f"Tabelle {doc.table_count}")
        tid = doc.ids.make("t-" + slugify(caption, f"tabelle-{doc.table_count}"))
        head = "".join(f'<th scope="col">{escape(c)}</th>' for c in header)
        body = "".join("<tr>" + "".join(f"<td>{escape(c)}</td>" for c in r) + "</tr>" for r in rows)
        doc.body.append(
            f'<table id={quoteattr(tid)} data-hp-table="scroll">'
            f"<caption>{escape(caption)}</caption>"
            f"<thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"
        )
    else:
        raise ProducerError(f"unknown block type: {kind!r}")


def render_doc(doc: Doc) -> bytes:
    lang = quoteattr(doc.lang)
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>\n',
        "<!DOCTYPE html>\n",
        f'<html xmlns="{XHTML_NS}" lang={lang} xml:lang={lang}>\n',
        "<head>\n",
        '<meta charset="utf-8"/>\n',
        f"<title>{escape(doc.title)}</title>\n",
        '<link rel="stylesheet" type="text/css" href="style.css"/>\n',
        "</head>\n<body>\n",
        f"<section id={quoteattr(doc.section_id)}>\n",
        f"<h1 id={quoteattr(doc.h1_id)}>{escape(doc.title)}</h1>\n",
    ]
    for b in doc.body:
        parts.append(b + "\n")
    parts.append("</section>\n</body>\n</html>\n")
    data = "".join(parts).encode("utf-8")
    check_xml(doc.path, data, f"{{{XHTML_NS}}}html")
    return data


def render_nav(docs, title, lang) -> bytes:
    """EPUB 3 navigation document (HP-CONT-004, HP-ADR-007).

    Hrefs are relative to the navigation document itself (content/nav.xhtml), as
    EPUB/URL resolution requires; after resolution they are the addresses
    `pfad#kennung` of HP-ADR-003.  See fragen.md for this interpretation.
    """
    def rel(path):
        assert path.startswith("content/")
        return path[len("content/"):]

    def render_children(href, items):
        # items: list of (level, id, text); returns nested <ol> or ""
        out = []
        i = 0
        while i < len(items):
            lvl, hid, text = items[i]
            # collect the subtree of this heading
            j = i + 1
            while j < len(items) and items[j][0] > lvl:
                j += 1
            sub = render_children(href, items[i + 1:j])
            out.append(f"<li><a href={quoteattr(href + '#' + hid)}>{escape(text)}</a>{sub}</li>")
            i = j
        return "<ol>" + "".join(out) + "</ol>" if out else ""

    lis = []
    for d in docs:
        href = rel(d.path)
        sub = render_children(href, d.toc)
        lis.append(f"<li><a href={quoteattr(href + '#' + d.section_id)}>{escape(d.title)}</a>{sub}</li>")
    q = quoteattr(lang)
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n'
        f'<html xmlns="{XHTML_NS}" xmlns:epub="{EPUB_NS}" lang={q} xml:lang={q}>\n'
        f'<head>\n<meta charset="utf-8"/>\n<title>{escape(title)} – Inhalt</title>\n'
        '<link rel="stylesheet" type="text/css" href="style.css"/>\n</head>\n<body>\n'
        '<nav epub:type="toc" id="toc" role="doc-toc">\n<h1 id="toc-titel">Inhalt</h1>\n'
        + "<ol>\n" + "\n".join(lis) + "\n</ol>\n</nav>\n</body>\n</html>\n"
    ).encode("utf-8")
    check_xml("content/nav.xhtml", xml, f"{{{XHTML_NS}}}html")
    return xml


def render_opf(meta, items, spine) -> bytes:
    """EPUB 3 package document (HP-CONT-004, HP-META-002)."""
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<package xmlns="{OPF_NS}" version="3.0" unique-identifier="pub-id" xml:lang={quoteattr(meta["inLanguage"])}>',
        f'<metadata xmlns:dc="{DC_NS}">',
        f'<dc:identifier id="pub-id">{escape(meta["id"])}</dc:identifier>',
        f'<dc:title>{escape(meta["name"])}</dc:title>',
        f'<dc:language>{escape(meta["inLanguage"])}</dc:language>',
        f'<meta property="dcterms:modified">{escape(meta["dateModified"])}</meta>',
        "</metadata>",
        "<manifest>",
    ]
    for item_id, href, mt, props in items:
        p = f" properties={quoteattr(props)}" if props else ""
        lines.append(f"<item id={quoteattr(item_id)} href={quoteattr(href)} media-type={quoteattr(mt)}{p}/>")
    lines.append("</manifest>")
    lines.append("<spine>")
    for idref in spine:
        lines.append(f"<itemref idref={quoteattr(idref)}/>")
    lines.append("</spine>")
    lines.append("</package>")
    data = ("\n".join(lines) + "\n").encode("utf-8")
    check_xml("package.opf", data, f"{{{OPF_NS}}}package")
    return data


CONTAINER_XML = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    f'<container version="1.0" xmlns="{OCF_NS}">\n'
    "<rootfiles>\n"
    f'<rootfile full-path="package.opf" media-type="{MT_OPF}"/>\n'
    "</rootfiles>\n</container>\n"
).encode("utf-8")


# --------------------------------------------------------------------------- main build

def build(inp: dict) -> tuple[dict, list]:
    """Return (manifest, entries) where entries = [(path, bytes, media_type_or_None)] in ZIP order."""
    for key in ("title", "language"):
        if not isinstance(inp.get(key), str) or not inp[key].strip():
            raise ProducerError(f"input field {key!r} missing or empty")

    date_modified = inp.get("dateModified")
    if date_modified is None:
        date_modified = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if not DATE_RE.match(date_modified):
        raise ProducerError("dateModified must have the form YYYY-MM-DDThh:mm:ssZ (HP-META-001)")
    _dt.datetime.strptime(date_modified, "%Y-%m-%dT%H:%M:%SZ")  # must be a valid instant

    doc_id = inp.get("id")
    if doc_id is None:
        canon = json.dumps(inp, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        doc_id = "urn:uuid:" + str(uuid.uuid5(uuid.NAMESPACE_URL,
                                              "https://hpro.example/pruefstein/" + hashlib.sha256(canon).hexdigest()))

    docs = split_documents(inp)

    files = []  # (path, bytes, media type) for everything that goes into resources
    files.append(("content/nav.xhtml", render_nav(docs, inp["title"], inp["language"]), MT_XHTML))
    files.append(("content/style.css", STYLESHEET.encode("utf-8"), MT_CSS))
    for d in docs:
        files.append((d.path, render_doc(d), MT_XHTML))

    meta = {
        "id": doc_id,
        "name": inp["title"],
        "inLanguage": inp["language"],
        "dateModified": date_modified,
    }

    # package.opf: manifest lists every file except mimetype, package.opf, META-INF/*
    # (so manifest.json is listed too); spine = readingOrder.  HP-CONT-004.
    opf_items = []
    spine = []
    item_ids = {}
    opf_items.append(("nav", "content/nav.xhtml", MT_XHTML, "nav"))
    opf_items.append(("css", "content/style.css", MT_CSS, None))
    for n, d in enumerate(docs, 1):
        iid = f"doc{n}"
        item_ids[d.path] = iid
        opf_items.append((iid, d.path, MT_XHTML, None))
        spine.append(iid)
    opf_items.append(("hp-manifest", "manifest.json", MT_JSON, None))
    opf = render_opf(meta, opf_items, spine)

    # manifest.json#resources: every file except mimetype, manifest.json, META-INF/*
    # (so package.opf is listed too).  HP-CONT-008.
    resources = [{"url": "package.opf", "type": MT_OPF, "integrity": sri_sha256(opf)}]
    for path, data, mt in files:
        resources.append({"url": path, "type": mt, "integrity": sri_sha256(data)})

    manifest = {
        "@context": HP_CONTEXT,
        "conformsTo": SPEC_PROFILE_STATIC,
        "id": meta["id"],
        "name": meta["name"],
        "inLanguage": meta["inLanguage"],
        "dateModified": meta["dateModified"],
        "readingOrder": [{"url": d.path, "type": MT_XHTML} for d in docs],
        "resources": resources,
    }
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

    entries = [
        ("mimetype", b"application/epub+zip", None),
        ("META-INF/container.xml", CONTAINER_XML, None),
        ("package.opf", opf, MT_OPF),
        ("manifest.json", manifest_bytes, MT_JSON),
    ] + files
    return manifest, entries


def path_ok(path: str) -> bool:
    """HP-CONT-006 path rules."""
    if path.startswith("/") or path.endswith("."):
        return False
    for seg in path.split("/"):
        if seg in ("", ".", ".."):
            return False
        if len(seg.encode("utf-8")) > 255:
            return False
        if any(c in '"*:<>?\\' or ord(c) < 0x20 or ord(c) == 0x7F for c in seg):
            return False
    return True


def write_container(out_path, entries, date_modified):
    # ZIP timestamps derived from dateModified (HP-CONT-014); DOS time has 2 s resolution
    t = _dt.datetime.strptime(date_modified, "%Y-%m-%dT%H:%M:%SZ")
    if t.year < 1980:
        t = t.replace(year=1980)
    date_time = (t.year, t.month, t.day, t.hour, t.minute, t.second - (t.second % 2))

    names = [e[0] for e in entries]
    norm = {unicodedata.normalize("NFC", n).lower() for n in names}
    if len(norm) != len(names):
        raise ProducerError("container paths not unique after NFC + lower-casing (HP-CONT-006)")
    for n in names:
        if not path_ok(n):
            raise ProducerError(f"invalid container path (HP-CONT-006): {n!r}")

    with zipfile.ZipFile(out_path, "w", allowZip64=False) as zf:
        for i, (path, data, _mt) in enumerate(entries):
            zi = zipfile.ZipInfo(path, date_time=date_time)
            zi.external_attr = 0o644 << 16
            zi.create_system = 3
            if i == 0:
                assert path == "mimetype"
                zi.compress_type = zipfile.ZIP_STORED          # HP-CONT-002
            else:
                zi.compress_type = zipfile.ZIP_DEFLATED        # HP-CONT-001 (method 8)
            zf.writestr(zi, data, compresslevel=9)

    # Self-check of HP-CONT-002 on the written bytes.
    with open(out_path, "rb") as f:
        head = f.read(30)
        import struct
        sig, _ver, flags, method, _t, _d, _crc, csize, usize, nlen, xlen = struct.unpack("<4sHHHHHIIIHH", head)
        name = f.read(nlen)
        body = f.read(xlen + usize)
    if not (sig == b"PK\x03\x04" and name == b"mimetype" and method == 0 and xlen == 0
            and flags & 0x1 == 0 and body == b"application/epub+zip"):
        raise ProducerError("self-check failed: first local header does not satisfy HP-CONT-002")


def main(argv):
    if len(argv) != 3:
        print(__doc__.split("\n\n")[0])
        print("usage: python3 min_producer.py <input.json> <output.hpro>")
        return 2
    with open(argv[1], "rb") as f:
        inp = json.loads(f.read().decode("utf-8"))
    try:
        manifest, entries = build(inp)
        write_container(argv[2], entries, manifest["dateModified"])
    except ProducerError as exc:
        print(f"Fehler: {exc}", file=sys.stderr)
        return 1
    print(f"geschrieben: {argv[2]}")
    print(f"  id:           {manifest['id']}")
    print(f"  name:         {manifest['name']}")
    print(f"  inLanguage:   {manifest['inLanguage']}")
    print(f"  dateModified: {manifest['dateModified']}")
    print(f"  conformsTo:   {manifest['conformsTo']}")
    print(f"  Einträge ({len(entries)}):")
    for path, data, _mt in entries:
        print(f"    {path}  ({len(data)} Bytes)")
    print(f"  readingOrder: {', '.join(e['url'] for e in manifest['readingOrder'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
