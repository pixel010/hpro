#!/usr/bin/env python3
"""Minimal html-Pro 0.1 reader (clean-room implementation, spec section 17.2).

Usage:  python3 min_reader.py [--json] <file>

Prints: metadata (id, name, inLanguage, dateModified, conformsTo), reading order,
sections per content document (address `path#id` + heading text), body text in
reading order, and the integrity check (hash-mismatch / missing / unlisted).

Exit codes:  0 = everything OK,  1 = deviations (integrity or document rules),
             2 = structural error / container rejected.

Implements HP-CONT-011 (hardened ZIP reading), HP-CONT-013 (recognition by content,
not by file extension), HP-META-003 (manifest as plain JSON, no @context fetch).
Standard library only.
"""

import base64
import hashlib
import json
import re
import struct
import sys
import unicodedata
import zipfile
import zlib
from xml.etree import ElementTree as ET

XHTML_NS = "http://www.w3.org/1999/xhtml"
XML_NS = "http://www.w3.org/XML/1998/namespace"
OPF_NS = "http://www.idpf.org/2007/opf"
DC_NS = "http://purl.org/dc/elements/1.1/"
OCF_NS = "urn:oasis:names:tc:opendocument:xmlns:container"

MIMETYPE = b"application/epub+zip"
MAX_ENTRIES = 10_000                 # HP-CONT-012
MAX_FILE = 256 * 1024 * 1024
MAX_TOTAL = 1024 * 1024 * 1024

ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
CONFORMS_RE = re.compile(r"^https://html-pro\.example/spec/(\d+)\.(\d+)/profile/(static|interactive|signed|archive)$")
# Syntactic approximation of a BCP 47 language tag (full well-formedness per RFC 5646 §2.2.9 is longer)
LANG_RE = re.compile(r"^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$")
META_INF_ALLOWED = re.compile(r"^META-INF/(container\.xml|signatures.*\.xml|manifest\.xml|metadata\.xml|rights\.xml)$")

ADDRESSABLE = {"section", "article", "aside", "nav", "h1", "h2", "h3", "h4", "h5", "h6",
               "table", "figure", "pre", "details", "form"}
HEADINGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
BLOCKS = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "pre", "blockquote", "figcaption", "caption",
          "dt", "dd", "summary", "address", "div", "section", "article", "aside", "nav", "header",
          "footer", "main", "figure", "details", "table", "thead", "tbody", "tfoot", "tr", "ul", "ol",
          "dl", "hr", "body"}
SKIP = {"script", "style", "head", "template"}


class Rejected(Exception):
    """Container rejected (structural error) -> exit 2."""


class Report:
    def __init__(self, path):
        self.file = path
        self.errors = []        # structural errors (exit 2)
        self.violations = []    # rule deviations (exit 1)
        self.notes = []         # informational
        self.metadata = {}
        self.reading_order = []
        self.sections = {}      # path -> [{"address", "element", "heading"}]
        self.text = {}          # path -> [lines]
        self.integrity = {"checked": 0, "hash-mismatch": [], "missing": [], "unlisted": []}

    def error(self, msg):
        self.errors.append(msg)

    def violate(self, rule, msg):
        self.violations.append(f"{rule}: {msg}")

    @property
    def exit_code(self):
        if self.errors:
            return 2
        integ = self.integrity
        if integ["hash-mismatch"] or integ["missing"] or integ["unlisted"] or self.violations:
            return 1
        return 0


# --------------------------------------------------------------------------- hardened ZIP

def check_path(name):
    """HP-CONT-006 / HP-CONT-011 path rules; returns a reason or None."""
    if name.startswith("/"):
        return "absolute path"
    if "\\" in name:
        return "backslash"
    if name.endswith("."):
        return "path ends with '.'"
    for seg in name.split("/"):
        if seg == "":
            return "empty path segment"
        if seg == "..":
            return "path traversal '..'"
        if seg == ".":
            return "segment '.'"
        if len(seg.encode("utf-8")) > 255:
            return "segment longer than 255 bytes"
        for c in seg:
            if c in '"*:<>?' or ord(c) < 0x20 or ord(c) == 0x7F:
                return f"forbidden character {c!r}"
    return None


def read_eocd(f):
    """Locate the end-of-central-directory record; reject multi-disk and ZIP64 archives."""
    f.seek(0, 2)
    size = f.tell()
    tail_len = min(size, 22 + 65535)
    f.seek(size - tail_len)
    tail = f.read(tail_len)
    pos = tail.rfind(b"PK\x05\x06")
    if pos < 0:
        raise Rejected("no end-of-central-directory record (not a ZIP archive)")
    eocd = struct.unpack("<4sHHHHIIH", tail[pos:pos + 22])
    this_disk, cd_disk, n_this, n_total, cd_size, cd_offset, _clen = eocd[1:]
    if this_disk != 0 or cd_disk != 0 or n_this != n_total:
        raise Rejected("multi-volume archive (HP-CONT-001)")
    if b"PK\x06\x07" in tail[:pos] or b"PK\x06\x06" in tail[:pos]:
        raise Rejected("ZIP64 end-of-central-directory structures present (HP-CONT-001/011)")
    return n_total, cd_size, cd_offset


def has_zip64_extra(extra: bytes) -> bool:
    i = 0
    while i + 4 <= len(extra):
        hid, ln = struct.unpack("<HH", extra[i:i + 4])
        if hid == 0x0001:
            return True
        i += 4 + ln
    return False


def read_entry(f, info: zipfile.ZipInfo) -> bytes:
    """Read one entry with our own bounds: declared sizes, method, CRC-32 (HP-CONT-011)."""
    f.seek(info.header_offset)
    hdr = f.read(30)
    if len(hdr) < 30 or hdr[:4] != b"PK\x03\x04":
        raise Rejected(f"{info.filename}: local file header missing or corrupt")
    (_sig, _ver, flags, method, _t, _d, _crc, _csize, _usize, nlen, xlen) = struct.unpack("<4sHHHHHIIIHH", hdr)
    local_name = f.read(nlen)
    f.read(xlen)
    if flags & 0x0001:
        raise Rejected(f"{info.filename}: encrypted entry (HP-CONT-001/011)")
    if method != info.compress_type:
        raise Rejected(f"{info.filename}: local header and central directory disagree on method")
    try:
        if local_name.decode("utf-8" if flags & 0x0800 else "cp437") != info.filename:
            raise Rejected(f"{info.filename}: local header names a different file")
    except UnicodeDecodeError:
        raise Rejected(f"{info.filename}: undecodable local file name")
    raw = f.read(info.compress_size)
    if len(raw) != info.compress_size:
        raise Rejected(f"{info.filename}: truncated data")
    if method == 0:
        data = raw
    elif method == 8:
        d = zlib.decompressobj(-15)
        data = d.decompress(raw, info.file_size + 1)
        if len(data) > info.file_size:
            raise Rejected(f"{info.filename}: inflated data exceeds the declared size (HP-CONT-011)")
        if d.unconsumed_tail:
            raise Rejected(f"{info.filename}: inflated data exceeds the declared size (HP-CONT-011)")
        data += d.flush()
    else:
        raise Rejected(f"{info.filename}: compression method {method} not allowed (HP-CONT-001)")
    if len(data) != info.file_size:
        raise Rejected(f"{info.filename}: inflated size {len(data)} differs from declared {info.file_size}")
    if zlib.crc32(data) & 0xFFFFFFFF != info.CRC:
        raise Rejected(f"{info.filename}: CRC-32 mismatch (HP-CONT-011)")
    return data


def open_container(path):
    """Return (ordered list of names, dict name->bytes). Raises Rejected."""
    with open(path, "rb") as f:
        head = f.read(4)
        if head != b"PK\x03\x04":
            raise Rejected("file does not start with a ZIP local file header (HP-CONT-002)")
        n_total, _cd_size, _cd_offset = read_eocd(f)
        if n_total > MAX_ENTRIES:
            raise Rejected(f"too many entries: {n_total} > {MAX_ENTRIES} (Grenze: Einträge, HP-CONT-012)")
        try:
            zf = zipfile.ZipFile(f)
        except zipfile.BadZipFile as exc:
            raise Rejected(f"central directory unreadable: {exc}")
        infos = zf.infolist()
        if len(infos) != n_total:
            raise Rejected("central directory entry count does not match the end record")

        names = []
        seen_norm = {}
        total = 0
        for info in infos:
            name = info.filename
            reason = check_path(name)
            if reason:
                raise Rejected(f"entry {name!r}: {reason} (HP-CONT-006/011)")
            if info.compress_type not in (0, 8):
                raise Rejected(f"entry {name!r}: compression method {info.compress_type} (HP-CONT-001)")
            if info.flag_bits & 0x0001:
                raise Rejected(f"entry {name!r}: encryption flag set (HP-CONT-011)")
            if has_zip64_extra(info.extra) or info.file_size >= 0xFFFFFFFF or info.compress_size >= 0xFFFFFFFF:
                raise Rejected(f"entry {name!r}: ZIP64 fields (HP-CONT-011)")
            if info.file_size > MAX_FILE:
                raise Rejected(f"entry {name!r}: larger than 256 MiB (Grenze: Dateigröße, HP-CONT-012)")
            total += info.file_size
            if total > MAX_TOTAL:
                raise Rejected("container larger than 1 GiB uncompressed (Grenze: Gesamtgröße, HP-CONT-012)")
            norm = unicodedata.normalize("NFC", name).lower()
            if norm in seen_norm:
                raise Rejected(f"duplicate entry {name!r} (same as {seen_norm[norm]!r}) (HP-CONT-006/011)")
            seen_norm[norm] = name
            names.append(name)

        # overlapping entries: a file name that is also a directory prefix of another entry
        norm_names = set(seen_norm)
        for n in norm_names:
            parts = n.split("/")
            for k in range(1, len(parts)):
                if "/".join(parts[:k]) in norm_names:
                    raise Rejected(f"overlapping entries: {'/'.join(parts[:k])!r} and {n!r} (HP-CONT-011)")

        # first entry must be mimetype: local header at offset 0, stored, extra length 0 (HP-CONT-002)
        first = infos[0]
        if first.filename != "mimetype" or first.header_offset != 0:
            raise Rejected("first entry is not 'mimetype' at offset 0: not an html-Pro/EPUB container (HP-CONT-002/013)")
        f.seek(26)
        nlen, xlen = struct.unpack("<HH", f.read(4))
        if first.compress_type != 0 or xlen != 0:
            raise Rejected("'mimetype' must be stored with an empty extra field (HP-CONT-002)")

        files = {}
        for info in infos:
            files[info.filename] = read_entry(f, info)
    if files["mimetype"] != MIMETYPE:
        raise Rejected(f"mimetype content is {files['mimetype'][:40]!r}, expected {MIMETYPE!r} (HP-CONT-002/013)")
    return names, files


# --------------------------------------------------------------------------- XML helpers

def local(tag):
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def parse_xml(name, data, rep: Report):
    try:
        return ET.fromstring(data)
    except ET.ParseError as exc:
        rep.error(f"{name}: not well-formed XML ({exc})")
        return None


def norm_ws(s):
    return re.sub(r"\s+", " ", s).strip()


def itertext(el):
    return "".join(t for t in _itertext(el))


def _itertext(el):
    if local(el.tag) in SKIP:
        return
    if el.text:
        yield el.text
    for child in el:
        yield from _itertext(child)
        if child.tail:
            yield child.tail


def extract_text(el, out):
    """Body text in DOM order, one line per block (HP-INH-011)."""
    tag = local(el.tag)
    if tag in SKIP:
        return
    if tag == "tr":
        cells = [norm_ws(itertext(c)) for c in el if local(c.tag) in ("td", "th")]
        if any(cells):
            out.append(" | ".join(cells))
        return
    buf = []

    def flush():
        s = norm_ws("".join(buf))
        buf.clear()
        if s:
            out.append(s)

    if el.text:
        buf.append(el.text)
    for child in el:
        ctag = local(child.tag)
        if ctag in SKIP:
            pass
        elif ctag in BLOCKS:
            flush()
            extract_text(child, out)
        else:
            buf.append(itertext(child))
        if child.tail:
            buf.append(child.tail)
    flush()


def heading_text_for(el):
    tag = local(el.tag)
    if tag in HEADINGS:
        return norm_ws(itertext(el))
    if tag in ("section", "article", "aside", "nav", "form"):
        for d in el.iter():
            if d is not el and local(d.tag) in HEADINGS:
                return norm_ws(itertext(d))
        return ""
    if tag == "table":
        for d in el:
            if local(d.tag) == "caption":
                return norm_ws(itertext(d))
        return ""
    if tag == "figure":
        for d in el.iter():
            if local(d.tag) == "figcaption":
                return norm_ws(itertext(d))
        return ""
    if tag == "details":
        for d in el:
            if local(d.tag) == "summary":
                return norm_ws(itertext(d))
        return ""
    return ""


# --------------------------------------------------------------------------- checks

def check_manifest(manifest, rep: Report):
    """HP-META-001, HP-PROF-001, HP-VERS-001 (plain JSON, HP-META-003)."""
    for key in ("id", "name", "inLanguage", "dateModified", "conformsTo"):
        v = manifest.get(key)
        rep.metadata[key] = v
        if not isinstance(v, str) or not v:
            rep.violate("HP-META-001", f"field {key!r} missing or not a non-empty string")
    ctx = manifest.get("@context")
    if not isinstance(ctx, list) or "https://www.w3.org/ns/pub-context" not in ctx:
        rep.violate("HP-META-001", "@context must be a list containing https://www.w3.org/ns/pub-context")
    elif len(ctx) < 2:
        rep.violate("HP-META-001", "@context lacks the html-Pro namespace entry")
    dm = manifest.get("dateModified")
    if isinstance(dm, str):
        if not DATE_RE.match(dm):
            rep.violate("HP-META-001", f"dateModified {dm!r} not of the form YYYY-MM-DDThh:mm:ssZ")
        else:
            import datetime
            try:
                datetime.datetime.strptime(dm, "%Y-%m-%dT%H:%M:%SZ")
            except ValueError:
                rep.violate("HP-META-001", f"dateModified {dm!r} is not a valid instant")
    lang = manifest.get("inLanguage")
    if isinstance(lang, str) and not LANG_RE.match(lang):
        rep.violate("HP-META-001", f"inLanguage {lang!r} is not a well-formed BCP 47 tag")
    ident = manifest.get("id")
    if isinstance(ident, str) and not ident.lower().startswith("urn:uuid:"):
        rep.notes.append("id is not a urn:uuid: URI (HP-META-001 SOLL)")
    ct = manifest.get("conformsTo")
    if isinstance(ct, str):
        m = CONFORMS_RE.match(ct)
        if not m:
            rep.violate("HP-PROF-001/HP-VERS-001", f"conformsTo {ct!r} does not match the profile pattern")
        else:
            major, minor = int(m.group(1)), int(m.group(2))
            if major != 0:
                rep.violate("HP-VERS-001", f"unsupported major version {major}")
            elif minor > 1:
                rep.notes.append(f"document uses newer minor version 0.{minor}; read as 0.1 (HP-VERS-002)")
            rep.metadata["profile"] = m.group(3)
    ro = manifest.get("readingOrder")
    order = []
    if not isinstance(ro, list) or not ro:
        rep.violate("HP-META-001", "readingOrder missing or empty")
    else:
        for i, e in enumerate(ro):
            if not isinstance(e, dict) or not isinstance(e.get("url"), str):
                rep.violate("HP-META-001", f"readingOrder[{i}] has no url")
                continue
            if e.get("type") != "application/xhtml+xml":
                rep.violate("HP-META-001", f"readingOrder[{i}] type is {e.get('type')!r}, not application/xhtml+xml")
            order.append(e["url"])
    rep.reading_order = order
    return order


def check_integrity(manifest, names, files, rep: Report):
    """HP-CONT-008 / HP-CONT-009: hash manifest over every file except mimetype, manifest.json, META-INF/*."""
    covered = [n for n in names if n not in ("mimetype", "manifest.json") and not n.startswith("META-INF/")]
    resources = manifest.get("resources")
    listed = {}
    if not isinstance(resources, list):
        rep.violate("HP-CONT-008", "resources missing or not a list")
        resources = []
    for i, r in enumerate(resources):
        if not isinstance(r, dict) or not isinstance(r.get("url"), str):
            rep.violate("HP-CONT-008", f"resources[{i}] has no url")
            continue
        url = r["url"]
        if url in listed:
            rep.violate("HP-CONT-008", f"resources lists {url!r} more than once")
            continue
        listed[url] = r
        if not isinstance(r.get("type"), str) or "/" not in r["type"]:
            rep.violate("HP-CONT-015", f"{url}: no media type")
        # package.opf is deliberately tolerated here: HP-CONT-008 requires it to be listed,
        # although HP-CONT-007 calls it a reserved file (see fragen.md).
        if url.startswith("META-INF/") or url in ("mimetype", "manifest.json"):
            rep.violate("HP-CONT-007", f"{url}: resources must not list reserved container files")
    for url, r in listed.items():
        if url not in files:
            rep.integrity["missing"].append(url)
            continue
        if url not in covered:
            continue  # e.g. manifest.json listed: tolerated, see fragen.md
        expected = r.get("integrity")
        digest = hashlib.sha256(files[url]).digest()
        ok = False
        if isinstance(expected, str) and expected.startswith("sha256-"):
            try:
                ok = base64.b64decode(expected[7:], validate=True) == digest
            except Exception:
                ok = False
        else:
            rep.violate("HP-CONT-008", f"{url}: integrity is not of the form sha256-<Base64>")
        rep.integrity["checked"] += 1
        if not ok:
            rep.integrity["hash-mismatch"].append(url)
    for n in covered:
        if n not in listed:
            rep.integrity["unlisted"].append(n)


def check_container_files(names, files, rep: Report):
    """HP-CONT-003, HP-CONT-007, HP-CONT-016, HP-PROF-002 (components/)."""
    for n in names:
        if n.startswith("META-INF/") and not META_INF_ALLOWED.match(n):
            rep.violate("HP-CONT-007", f"unexpected file under META-INF/: {n}")
        if n in ("META-INF/encryption.xml", "META-INF/rights.xml") and files[n]:
            rep.violate("HP-CONT-016", f"{n} present with content")
        if n.startswith("components/") and rep.metadata.get("profile") in ("static", "signed", "archive"):
            rep.violate("HP-PROF-002", f"{n} present in profile {rep.metadata.get('profile')}")
    cx = files.get("META-INF/container.xml")
    if cx is None:
        rep.error("META-INF/container.xml missing (HP-CONT-003)")
        return
    root = parse_xml("META-INF/container.xml", cx, rep)
    if root is None:
        return
    if root.tag != f"{{{OCF_NS}}}container":
        rep.error(f"container.xml root is {root.tag}, expected OCF container (HP-CONT-003)")
        return
    rfs = root.findall(f"{{{OCF_NS}}}rootfiles/{{{OCF_NS}}}rootfile")
    if not rfs or rfs[0].get("full-path") != "package.opf" or rfs[0].get("media-type") != "application/oebps-package+xml":
        rep.error("container.xml: first rootfile does not point to package.opf with media-type application/oebps-package+xml (HP-CONT-003)")


def check_opf(names, files, manifest, rep: Report):
    """HP-CONT-004 and HP-META-002."""
    opf = files.get("package.opf")
    if opf is None:
        rep.error("package.opf missing (HP-CONT-004)")
        return
    root = parse_xml("package.opf", opf, rep)
    if root is None:
        return
    if root.tag != f"{{{OPF_NS}}}package":
        rep.error("package.opf root is not opf:package (HP-CONT-004)")
        return
    items = {}
    nav_items = 0
    for it in root.findall(f"{{{OPF_NS}}}manifest/{{{OPF_NS}}}item"):
        items[it.get("id")] = it.get("href")
        if "nav" in (it.get("properties") or "").split():
            nav_items += 1
    if nav_items != 1:
        rep.violate("HP-CONT-004", f"{nav_items} manifest items with properties 'nav' (expected exactly 1)")
    expected = {n for n in names if n not in ("mimetype", "package.opf") and not n.startswith("META-INF/")}
    hrefs = set(items.values())
    for h in sorted(hrefs - expected):
        rep.violate("HP-CONT-004", f"package.opf lists {h!r}, which is not in the container")
    for h in sorted(expected - hrefs):
        rep.violate("HP-CONT-004", f"package.opf does not list {h!r}")
    spine = [items.get(ir.get("idref")) for ir in root.findall(f"{{{OPF_NS}}}spine/{{{OPF_NS}}}itemref")]
    if spine != rep.reading_order:
        rep.violate("HP-CONT-004", f"spine {spine} differs from readingOrder {rep.reading_order}")
    # HP-META-002
    md = root.find(f"{{{OPF_NS}}}metadata")
    if md is None:
        rep.violate("HP-META-002", "package.opf has no metadata element")
        return
    uid = root.get("unique-identifier")
    ident = None
    for e in md.findall(f"{{{DC_NS}}}identifier"):
        if uid is None or e.get("id") == uid:
            ident = (e.text or "").strip()
            break
    title = (md.findtext(f"{{{DC_NS}}}title") or "").strip()
    lang = (md.findtext(f"{{{DC_NS}}}language") or "").strip()
    modified = None
    for m in md.findall(f"{{{OPF_NS}}}meta"):
        if m.get("property") == "dcterms:modified":
            modified = (m.text or "").strip()
    pairs = (("id", ident, "dc:identifier"), ("name", title, "dc:title"),
             ("inLanguage", lang, "dc:language"), ("dateModified", modified, "dcterms:modified"))
    for key, opf_val, label in pairs:
        if manifest.get(key) != opf_val:
            rep.violate("HP-META-002", f"{label} {opf_val!r} != manifest.json#{key} {manifest.get(key)!r}")


def check_content_doc(path, data, rep: Report):
    """HP-INH-001, HP-INH-002, HP-INH-012, HP-ADR-001, HP-ADR-002; collects sections and text."""
    root = parse_xml(path, data, rep)
    if root is None:
        return
    if root.tag != f"{{{XHTML_NS}}}html":
        rep.error(f"{path}: root element is {root.tag}, expected XHTML html (HP-INH-001)")
        return
    lang = root.get("lang")
    xlang = root.get(f"{{{XML_NS}}}lang")
    if not lang or not xlang:
        rep.violate("HP-INH-002", f"{path}: html element lacks lang and/or xml:lang")
    elif lang != xlang:
        rep.violate("HP-INH-002", f"{path}: lang {lang!r} != xml:lang {xlang!r}")
    elif not LANG_RE.match(lang):
        rep.violate("HP-INH-002", f"{path}: lang {lang!r} is not a well-formed BCP 47 tag")

    ids_seen = {}
    sections = []
    for el in root.iter():
        tag = local(el.tag)
        for attr, val in el.attrib.items():
            a = local(attr)
            if a.lower().startswith("on"):
                rep.violate("HP-INH-012", f"{path}: event handler attribute {a} on <{tag}>")
            if a in ("href", "src") and val.strip().lower().startswith("javascript:"):
                rep.violate("HP-INH-012", f"{path}: javascript: URL on <{tag}>")
        if tag == "script":
            rep.violate("HP-INH-012", f"{path}: script element present outside profile interactive")
        eid = el.get("id")
        if eid is not None:
            if not ID_RE.match(eid) or len(eid) > 64:
                rep.violate("HP-ADR-002", f"{path}: id {eid!r} violates the id pattern or length")
            if eid in ids_seen:
                rep.violate("HP-ADR-002", f"{path}: duplicate id {eid!r}")
            ids_seen[eid] = el
        if tag in ADDRESSABLE or "data-hp-priority" in el.attrib:
            if eid is None:
                rep.violate("HP-ADR-001", f"{path}: <{tag}> without id")
            else:
                sections.append({"address": f"{path}#{eid}", "element": tag, "heading": heading_text_for(el)})
    rep.sections[path] = sections

    body = root.find(f"{{{XHTML_NS}}}body")
    lines = []
    if body is not None:
        extract_text(body, lines)
    rep.text[path] = lines


# --------------------------------------------------------------------------- driver

def analyse(path):
    rep = Report(path)
    try:
        names, files = open_container(path)
    except Rejected as exc:
        rep.error(str(exc))
        return rep
    except OSError as exc:
        rep.error(f"cannot read file: {exc}")
        return rep

    # HP-CONT-005 / HP-CONT-013 / HP-META-003: manifest.json as plain JSON
    raw = files.get("manifest.json")
    if raw is None:
        rep.error("manifest.json missing at the container root: not an html-Pro document (HP-CONT-005/013)")
        return rep
    if raw.startswith(b"\xef\xbb\xbf"):
        rep.error("manifest.json starts with a BOM (HP-CONT-005)")
        return rep
    try:
        manifest = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        rep.error(f"manifest.json is not valid UTF-8 JSON: {exc} (HP-CONT-005)")
        return rep
    if not isinstance(manifest, dict):
        rep.error("manifest.json root is not an object (HP-CONT-005)")
        return rep

    order = check_manifest(manifest, rep)
    check_integrity(manifest, names, files, rep)       # before anything is "shown" (HP-CONT-009)
    check_container_files(names, files, rep)
    check_opf(names, files, manifest, rep)
    for url in order:
        if url not in files:
            rep.error(f"readingOrder entry {url!r} not in container")
            continue
        check_content_doc(url, files[url], rep)
    return rep


def print_text(rep: Report):
    print(f"Datei: {rep.file}")
    if rep.errors and not rep.metadata:
        print("Container ABGELEHNT:")
        for e in rep.errors:
            print(f"  - {e}")
        print(f"Exit-Code: {rep.exit_code}")
        return
    print("Metadaten:")
    for key in ("id", "name", "inLanguage", "dateModified", "conformsTo"):
        print(f"  {key}: {rep.metadata.get(key)}")
    print("Lesereihenfolge:")
    for i, u in enumerate(rep.reading_order, 1):
        print(f"  {i}. {u}")
    print("Abschnitte:")
    for path in rep.reading_order:
        print(f"  [{path}]")
        for s in rep.sections.get(path, []):
            head = f"  {s['heading']}" if s["heading"] else ""
            print(f"    {s['address']}  <{s['element']}>{head}")
    print("Fließtext:")
    for path in rep.reading_order:
        print(f"  [{path}]")
        for line in rep.text.get(path, []):
            print(f"    {line}")
    integ = rep.integrity
    print("Hashprüfung:")
    print(f"  geprüft: {integ['checked']} Ressourcen")
    for kind in ("hash-mismatch", "missing", "unlisted"):
        for p in integ[kind]:
            print(f"  {kind}: {p}")
    if integ["hash-mismatch"] or integ["missing"]:
        print("  Ergebnis: VERÄNDERT")
    elif integ["unlisted"]:
        print("  Ergebnis: OK, aber nicht gelistete Dateien vorhanden")
    else:
        print("  Ergebnis: OK")
    if rep.errors:
        print("Strukturfehler:")
        for e in rep.errors:
            print(f"  - {e}")
    if rep.violations:
        print("Abweichungen:")
        for v in rep.violations:
            print(f"  - {v}")
    if rep.notes:
        print("Hinweise:")
        for n in rep.notes:
            print(f"  - {n}")
    print(f"Exit-Code: {rep.exit_code}")


def to_json(rep: Report):
    integ = rep.integrity
    status = "rejected" if (rep.errors and not rep.metadata) else (
        "changed" if (integ["hash-mismatch"] or integ["missing"]) else "ok")
    return {
        "file": rep.file,
        "status": status,
        "metadata": rep.metadata,
        "readingOrder": rep.reading_order,
        "sections": rep.sections,
        "text": rep.text,
        "integrity": integ,
        "errors": rep.errors,
        "violations": rep.violations,
        "notes": rep.notes,
        "exitCode": rep.exit_code,
    }


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    as_json = "--json" in argv[1:]
    if len(args) != 1:
        print("usage: python3 min_reader.py [--json] <file>", file=sys.stderr)
        return 2
    rep = analyse(args[0])
    if as_json:
        print(json.dumps(to_json(rep), ensure_ascii=False, indent=2))
    else:
        print_text(rep)
    return rep.exit_code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
