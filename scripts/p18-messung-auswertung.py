#!/usr/bin/env python3
"""Reads the probe PDFs of scripts/p18-messung.mjs and prints what Chromium did in print."""
import collections
import json
import sys
from pathlib import Path

import pypdf
import pypdfium2 as pdfium

MM = 72 / 25.4
PX = 72 / 96
d = Path(sys.argv[1])
screen = json.loads((d / 'bildschirm.json').read_text())
print(f"Chromium {screen['chromium']}")


def dests(path):
    r = pypdf.PdfReader(str(path))
    return r, {k.lstrip('/'): (r.get_destination_page_number(v) + 1, float(v.top) if v.top is not None else None) for k, v in r.named_destinations.items()}


# 1
doc = pdfium.PdfDocument(str(d / '1-target-counter.pdf'))
text = doc[0].get_textpage().get_text_range()
print('\n1 target-counter()')
print(f"  CSS.supports: {screen['targetCounterSupported']}")
print(f"  gedruckter Text Seite 1: {text!r}")
print(f"  => Seitenzahl gedruckt: {'ja' if any(c.isdigit() for c in text) else 'nein'}")

# 2
r, ds = dests(d / '2-satzspiegel.pdf')
height_pt = float(r.pages[0].mediabox.height)
ys = [ds[f'w{i}'][1] for i in range(1400)]
lines = collections.Counter(round(y, 2) for y in ys)
first_line = lines[max(lines)]
fine = sum(1 for i in range(64) if ds[f'f{i}'][0] == 1)
base = 959 + 2 * len(lines)
print('\n2 Satzspiegel einer gedruckten A4-Seite (Ränder 22/20/20/20 mm)')
print(f"  rechnerisch: 170 × 255 mm = {screen['typeArea']['px'][0]:.2f} × {screen['typeArea']['px'][1]:.2f} px")
print(f"  Breite: {first_line} Kästchen à 0,5 px in der ersten Zeile => {first_line * 0.5:.1f} px (≤ Breite < {first_line * 0.5 + 0.5:.1f})")
print(f"  Höhe: {base} px Grundhöhe ({len(lines)} Kästchenzeilen à 2 px + 959 px) + {fine} von 64 Blöcken à 1/32 px auf Seite 1"
      f" => {base + fine / 32:.4f} px (≤ Höhe < {base + (fine + 1) / 32:.4f})")

# 3
r, ds = dests(d / '3-tabellenkopf.pdf')
col = screen['tableColumns']
page_r60, top_r60 = ds['r60']
from_top_px = (float(r.pages[page_r60 - 1].mediabox.height) - top_r60) / PX
print('\n3 Tabellenkopf (120 Zeilen à 20 px + 2 px Zellabstand, Kopf ebenso)')
print(f"  Mehrspaltensatz: thead-Fragmente {col['theadFragments']}; Zeile 61 in Spalte {col['r60']['column']}, {col['r60']['topPx']:.1f} px unter Spaltenbeginn")
print(f"  Druck: Zeile 61 auf Seite {page_r60}, {from_top_px:.1f} px unter Satzspiegelbeginn (Sprungziel; Chromium bezieht es auf den Satzspiegel, vgl. 04 Prüfung K)")
print(f"  => Unterschied {from_top_px - col['r60']['topPx']:.1f} px = eine Kopfzeile: im Druck wiederholt, im Mehrspaltensatz nicht")

# 4
doc = pdfium.PdfDocument(str(d / '4-aussenabstand.pdf'))
m = screen['marginColumns']
tp = doc[len(doc) - 1].get_textpage()
idx, cnt = tp.search('Abschnitt').get_next()
top = max(tp.get_charbox(j)[3] for j in range(idx, idx + cnt))
glyph_mm = (float(pdfium.PdfDocument(str(d / '4-aussenabstand.pdf'))[0].get_size()[1]) - top) / MM - 22
print('\n4 Außenabstand oben (30 px) nach nicht erzwungenem Umbruch')
print(f"  Mehrspaltensatz: h2 in Spalte {m['column']}, {m['h2TopPx']:.1f} px unter Spaltenbeginn")
print(f"  Druck: {len(doc)} Seiten; Glyphenoberkante „Abschnitt“ auf Seite {len(doc)} {glyph_mm:.2f} mm = {glyph_mm * 96 / 25.4:.1f} px unter Satzspiegelbeginn"
      " (Zeilenhöhe 24 px, Schrift 20 px: ohne Außenabstand etwa 2–5 px)")
