#!/usr/bin/env python3
"""Evaluates talkback-android.sh: accessibility tree against the document text, and the nodes
TalkBack's "next item" navigation put the accessibility focus on.

Usage: talkback-check.py OUTDIR/talkback DOCUMENT.hpro
"""
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

d, doc = sys.argv[1], sys.argv[2]
XHTML = "{http://www.w3.org/1999/xhtml}"
BLOCKS = {"h1", "h2", "h3", "h4", "p", "li", "caption", "th", "td", "figcaption", "dt", "dd", "summary"}


def squash(s):
    return re.sub(r"\s+", "", s or "")


def blocks(name):
    z = zipfile.ZipFile(doc)
    root = ET.fromstring(z.read(name))
    out = []
    for el in root.iter():
        tag = el.tag.replace(XHTML, "")
        if tag in BLOCKS:
            t = " ".join("".join(el.itertext()).split())
            if t and not any(t in o for o in out if len(o) > len(t)):
                out.append(t)
    return out


def tree_nodes():
    try:
        root = ET.parse(f"{d}/baum.xml").getroot()
    except (ET.ParseError, FileNotFoundError) as e:
        print("Accessibility-Baum nicht lesbar:", e)
        return []
    return [n for n in root.iter("node") if n.get("package") == "org.hpro.reader"]


nodes = tree_nodes()
labels = [(n.get("text") or "") + (n.get("content-desc") or "") for n in nodes]
flat = squash("".join(labels))
print("== Kriterium 4 (Android, TalkBack) ==")
print(open(f"{d}/talkback-version.txt").read().strip())
print("Dienste:", open(f"{d}/dienste.txt").read().strip().replace("\n", " | ")[:400])
print(f"Knoten der App im Accessibility-Baum: {len(nodes)}")
web = [n for n in nodes if n.get("class") == "android.webkit.WebView"]
print("WebView-Knoten:", len(web))

doc_blocks = blocks("content/bericht.xhtml")
found = [b for b in doc_blocks if squash(b) in flat]
missing = [b for b in doc_blocks if squash(b) not in flat]
print(f"Dokument bericht.xhtml: {len(found)} von {len(doc_blocks)} Textblöcken im Baum")
for b in missing[:12]:
    print("  fehlt:", b[:110])

clickable = [n for n in nodes if n.get("clickable") == "true"]
unnamed = [n for n in clickable if not (n.get("text") or n.get("content-desc") or "").strip()]
print(f"Bedienelemente (clickable): {len(clickable)}, ohne Namen: {len(unnamed)}")
for n in unnamed[:8]:
    print("  ohne Namen:", n.get("class"), n.get("resource-id"), n.get("bounds"))
named = [(n.get("text") or n.get("content-desc")).strip() for n in clickable if (n.get("text") or n.get("content-desc") or "").strip()]
print("  benannt (Auszug):", named[:25])

# uiautomator events: one line per event, fields separated by "; ".
focus = []
for line in open(f"{d}/ereignisse.txt", encoding="utf-8", errors="replace"):
    if "TYPE_VIEW_ACCESSIBILITY_FOCUSED" in line and "PackageName: org.hpro.reader" in line:
        m = re.search(r"; Text: \[(.*?)\];", line)
        c = re.search(r"; ContentDescription: (.*?);", line)
        t = (m.group(1) if m else "") or (c.group(1) if c and c.group(1) != "null" else "")
        focus.append(t.strip())
print(f"TalkBack-Fokus auf Knoten der App (TYPE_VIEW_ACCESSIBILITY_FOCUSED): {len(focus)}")
for i, t in enumerate(focus):
    print(f"  {i + 1:3d}. {t[:120]}")
fs = squash("".join(focus))
in_doc = [b for b in doc_blocks if squash(b)[:40] and squash(b)[:40] in fs]
print(f"Davon Dokumenttext: {len(in_doc)} der {len(doc_blocks)} Blöcke von bericht.xhtml erreicht (Navigation über die ersten Elemente)")
tb_end = open(f"{d}/dienste-ende.txt").read()
print("TalkBack am Ende noch gebunden:", "ja" if "TalkBack" in tb_end else "nein")
