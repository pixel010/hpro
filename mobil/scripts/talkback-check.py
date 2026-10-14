#!/usr/bin/env python3
"""Evaluates talkback-android.sh: accessibility tree against the document text, and what
TalkBack spoke during its "next item" navigation (its own log).

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
    """Text blocks of the document; the second list holds those inside a closed <details> (the
    browser exposes only its <summary> until it is opened)."""
    z = zipfile.ZipFile(doc)
    root = ET.fromstring(z.read(name))
    out, closed = [], []

    def walk(el, in_closed):
        tag = el.tag.replace(XHTML, "")
        if tag in BLOCKS:
            t = " ".join("".join(el.itertext()).split())
            if t and not any(t in o for o in out + closed if len(o) > len(t)):
                (closed if in_closed and tag != "summary" else out).append(t)
        shut = in_closed or (tag == "details" and el.get("open") is None)
        for child in el:
            walk(child, shut)

    walk(root, False)
    return out, closed


def tree_nodes():
    try:
        root = ET.parse(f"{d}/baum.xml").getroot()
    except (ET.ParseError, FileNotFoundError) as e:
        print("Accessibility-Baum nicht lesbar:", e)
        return []
    return [n for n in root.iter("node") if n.get("package") == "org.hpro.reader"]


nodes = tree_nodes()


def label(n):
    # A link is a View with content-desc whose child TextView carries the same text; counting both
    # would break the paragraph around it apart.
    desc = n.get("content-desc") or ""
    if desc and not n.get("text") and any(c.get("text") == desc for c in n.iter("node") if c is not n):
        return ""
    return (n.get("text") or "") + desc


labels = [label(n) for n in nodes]
flat = squash("".join(labels))
print("== Kriterium 4 (Android, TalkBack) ==")
print(open(f"{d}/talkback-version.txt").read().strip())
print("Dienste:", open(f"{d}/dienste.txt").read().strip().replace("\n", " | ")[:400])
print(f"Knoten der App im Accessibility-Baum: {len(nodes)}")
web = [n for n in nodes if n.get("class") == "android.webkit.WebView"]
print("WebView-Knoten:", len(web))

doc_blocks, closed_blocks = blocks("content/bericht.xhtml")
found = [b for b in doc_blocks if squash(b) in flat]
missing = [b for b in doc_blocks if squash(b) not in flat]
print(f"Dokument bericht.xhtml: {len(found)} von {len(doc_blocks)} Textblöcken im Baum")
for b in missing[:12]:
    print("  fehlt:", b[:110])
closed_found = [b for b in closed_blocks if squash(b) in flat]
print(f"In zugeklappten <details> (erst nach dem Aufklappen im Baum): {len(closed_blocks)}, davon trotzdem im Baum: {len(closed_found)}")

clickable = [n for n in nodes if n.get("clickable") == "true"]
unnamed = [n for n in clickable if not (n.get("text") or n.get("content-desc") or "").strip()]
print(f"Bedienelemente (clickable): {len(clickable)}, ohne Namen: {len(unnamed)}")
for n in unnamed[:8]:
    print("  ohne Namen:", n.get("class"), n.get("resource-id"), n.get("bounds"))
named = [(n.get("text") or n.get("content-desc")).strip() for n in clickable if (n.get("text") or n.get("content-desc") or "").strip()]
print("  benannt (Auszug):", named[:25])

# TalkBack's log: one utterance per line ("Attempted to speak … Item: {…fragments:[{text:…, earcons:…").
print(open(f"{d}/navigation.txt").read().strip().replace("\n", " | "))
print("Vor der Navigation:", open(f"{d}/dienste-vor-navigation.txt").read().strip().replace("\n", " | ")[:300])
spoken = []
for line in open(f"{d}/sprache.txt", encoding="utf-8", errors="replace"):
    texts = re.findall(r"\{text:(.*?), earcons:", line)
    if texts:
        spoken.append(" ".join(t.strip() for t in texts))
print(f"TalkBack-Äußerungen während der Navigation: {len(spoken)}")
for i, t in enumerate(spoken):
    print(f"  {i + 1:3d}. {t[:120]}")
ss = squash("".join(spoken))
ui = [n for n in named if squash(n) and squash(n) in ss]
print(f"Davon Bedienelemente des Readers: {len(ui)} von {len(named)} benannten")
in_doc = [b for b in doc_blocks if squash(b)[:40] and squash(b)[:40] in ss]
print(f"Davon Dokumenttext: {len(in_doc)} der {len(doc_blocks)} Blöcke von bericht.xhtml gesprochen (Navigation über die ersten Elemente)")
for b in in_doc[:8]:
    print("  gesprochen:", b[:110])
tb_end = open(f"{d}/dienste-ende.txt").read()
print("TalkBack am Ende noch gebunden:", "ja" if "TalkBack" in tb_end else "nein")
