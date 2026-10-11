#!/usr/bin/env python3
"""Erzeugt einen minimalen html-Pro-Container nach dem OCF-Muster (EPUB 3.3).

Reproduzierbar: feste Zeitstempel, feste Dateireihenfolge, feste Dateirechte.
Zwei Läufe mit denselben Parametern ergeben byte-identische Dateien.

Aufruf:
    python3 build_container.py OUT [--mimetype MIME] [--manifest-out PFAD]

Der Inhalt (XHTML, CSS, OPF, container.xml) steht unten im Skript, damit der
Prototyp ohne weitere Dateien nachvollziehbar ist. manifest.json (html-Pro-
Manifest, angelehnt an das W3C Publication Manifest) wird aus den Inhalten
berechnet und enthält SHA-256-Hashes jeder Ressource.
"""
import argparse
import base64
import hashlib
import json
import sys
import zipfile

EPUB_MIME = "application/epub+zip"
FIXED_DATE = (2026, 10, 11, 0, 0, 0)  # ZIP-Zeitstempel für alle Einträge
MODIFIED = "2026-10-11T00:00:00Z"
DOC_ID = "urn:uuid:6f1c2a52-3d8e-4b8c-9a51-0c2b7f2e9d10"

CONTAINER_XML = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""

INDEX_XHTML = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="de-AT" lang="de-AT">
<head>
  <meta charset="UTF-8"/>
  <title>Prüfdokument html-Pro Phase 2</title>
  <link rel="stylesheet" type="text/css" href="styles/document.css"/>
</head>
<body>
  <main>
    <h1 id="b1">Prüfdokument html-Pro</h1>
    <p id="b2">Dieses Dokument prüft, ob ein Container zugleich als EPUB lesbar und als
      ASiC-E signierbar ist.</p>
    <section aria-labelledby="b3">
      <h2 id="b3">Vereinbarung</h2>
      <p id="b4">Die Parteien vereinbaren eine Lieferung von <strong>12 Stück</strong> zum Preis
        von <strong>1.200,00 EUR</strong>.</p>
      <table id="b5">
        <caption>Positionen</caption>
        <thead><tr><th scope="col">Position</th><th scope="col">Menge</th><th scope="col">Betrag</th></tr></thead>
        <tbody><tr><td>Prüfgerät</td><td>12</td><td>1.200,00 EUR</td></tr></tbody>
      </table>
    </section>
  </main>
</body>
</html>
"""

NAV_XHTML = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="de-AT" lang="de-AT">
<head>
  <meta charset="UTF-8"/>
  <title>Inhalt</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Inhalt</h1>
    <ol>
      <li><a href="index.xhtml#b1">Prüfdokument html-Pro</a></li>
      <li><a href="index.xhtml#b3">Vereinbarung</a></li>
    </ol>
  </nav>
</body>
</html>
"""

DOCUMENT_CSS = """:root { --hp-font-size: 1rem; --hp-line-height: 1.5; }
body { font-family: sans-serif; font-size: var(--hp-font-size); line-height: var(--hp-line-height); margin: 0 auto; max-width: 40em; padding: 1em; }
table { border-collapse: collapse; break-inside: avoid; }
th, td { border: 1px solid #555; padding: 0.25em 0.5em; text-align: left; }
"""

PACKAGE_OPF = """<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="de-AT">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">{doc_id}</dc:identifier>
    <dc:title>Prüfdokument html-Pro Phase 2</dc:title>
    <dc:language>de-AT</dc:language>
    <meta property="dcterms:modified">{modified}</meta>
    <meta property="schema:accessMode">textual</meta>
    <meta property="schema:accessModeSufficient">textual</meta>
    <meta property="schema:accessibilityFeature">structuralNavigation</meta>
    <meta property="schema:accessibilityFeature">tableOfContents</meta>
    <meta property="schema:accessibilityHazard">none</meta>
    <meta property="schema:accessibilitySummary">Rein textuelles Dokument mit Überschriften und einer Tabelle mit Kopfzeilen.</meta>
    <link rel="dcterms:conformsTo" href="http://www.idpf.org/epub/a11y/accessibility-20170105.html#wcag-aa"/>
  </metadata>
  <manifest>
    <item id="nav" href="content/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="index" href="content/index.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="content/styles/document.css" media-type="text/css"/>
    <item id="hpro-manifest" href="manifest.json" media-type="application/json"/>
  </manifest>
  <spine>
    <itemref idref="index"/>
  </spine>
</package>
"""


def sri(data: bytes) -> str:
    return "sha256-" + base64.b64encode(hashlib.sha256(data).digest()).decode("ascii")


def build_manifest(resources: dict) -> dict:
    """html-Pro-Manifest (Vorschlag aus 03-konzept.md, Abschnitt 1.3)."""
    return {
        "@context": ["https://www.w3.org/ns/pub-context", "https://html-pro.example/ns/v0"],
        "conformsTo": "https://html-pro.example/spec/0.1/profile/static",
        "id": DOC_ID,
        "name": "Prüfdokument html-Pro Phase 2",
        "inLanguage": "de-AT",
        "dateModified": MODIFIED,
        "readingOrder": [{"url": "content/index.xhtml", "type": "application/xhtml+xml"}],
        "resources": [
            {"url": path, "type": mtype, "integrity": sri(data)}
            for path, (mtype, data) in sorted(resources.items())
        ],
        "accessibility": {
            "conformsTo": "EPUB Accessibility 1.1 - WCAG 2.2 Level AA",
            "accessMode": ["textual"],
            "accessModeSufficient": ["textual"],
            "accessibilityFeature": ["structuralNavigation", "tableOfContents"],
            "accessibilityHazard": ["none"],
            "accessibilitySummary": "Rein textuelles Dokument mit Überschriften und einer Tabelle mit Kopfzeilen.",
        },
    }


def zinfo(name: str, compress: int) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, date_time=FIXED_DATE)
    info.compress_type = compress
    info.create_system = 3  # Unix, damit external_attr unabhängig vom Host ist
    info.external_attr = 0o100644 << 16
    return info


def build(out: str, mimetype: str, manifest_out: str | None) -> dict:
    content = {
        "content/index.xhtml": ("application/xhtml+xml", INDEX_XHTML.encode("utf-8")),
        "content/nav.xhtml": ("application/xhtml+xml", NAV_XHTML.encode("utf-8")),
        "content/styles/document.css": ("text/css", DOCUMENT_CSS.encode("utf-8")),
        "package.opf": (
            "application/oebps-package+xml",
            PACKAGE_OPF.format(doc_id=DOC_ID, modified=MODIFIED).encode("utf-8"),
        ),
    }
    manifest = build_manifest(content)
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

    with zipfile.ZipFile(out, "w") as z:
        # OCF: mimetype als erste Datei, unkomprimiert, ohne Extra-Feld
        z.writestr(zinfo("mimetype", zipfile.ZIP_STORED), mimetype.encode("ascii"))
        z.writestr(zinfo("META-INF/container.xml", zipfile.ZIP_DEFLATED), CONTAINER_XML.encode("utf-8"))
        z.writestr(zinfo("manifest.json", zipfile.ZIP_DEFLATED), manifest_bytes)
        for path, (_mtype, data) in sorted(content.items()):
            z.writestr(zinfo(path, zipfile.ZIP_DEFLATED), data)

    if manifest_out:
        with open(manifest_out, "wb") as f:
            f.write(manifest_bytes)
    return manifest


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out", help="Zieldatei (.epub, .hpro, .asice …)")
    ap.add_argument("--mimetype", default=EPUB_MIME, help=f"Inhalt der mimetype-Datei (Standard: {EPUB_MIME})")
    ap.add_argument("--manifest-out", help="manifest.json zusätzlich als Datei ablegen")
    args = ap.parse_args(argv)
    build(args.out, args.mimetype, args.manifest_out)
    with open(args.out, "rb") as f:
        print(f"{args.out}  sha256={hashlib.sha256(f.read()).hexdigest()}  mimetype={args.mimetype}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
