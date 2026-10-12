#!/usr/bin/env python3
"""Rohausgabe eines Containers für P5, Abnahme 1 (nur Python-Standardbibliothek, kein Code aus kern/).

  python3 scripts/p5-rohausgabe.py <vorher.hpro> <nachher.hpro> <texte.txt> [id ...]

- listet die Einträge beider Dateien (Name, Methode, Größe, CRC) und welche Einträge neu sind,
- sucht jede Zeile von texte.txt (die bearbeiteten Texte) in jedem entpackten Eintrag und in
  den Rohbytes der ZIP-Datei und nennt die Einträge, in denen sie stehen,
- zeigt für jede angegebene id das Element im entpackten Inhaltsdokument wörtlich (so, wie es im
  Container liegt), damit sichtbar ist: der Text steht im XHTML des Dokuments, nicht in einer
  zusätzlichen Schicht (Annotation, Overlay, Beilage).
"""
import re, sys, zipfile

before, after, texts_file = sys.argv[1:4]
ids = sys.argv[4:]
texts = [t.rstrip('\n') for t in open(texts_file, encoding='utf-8') if t.strip()]
za, zb = zipfile.ZipFile(before), zipfile.ZipFile(after)
na = [i.filename for i in za.infolist()]
print(f'== Einträge nachher ({after})')
print('  Methode  Größe   CRC32     Name')
for i in zb.infolist():
    m = {0: 'stored', 8: 'deflate'}.get(i.compress_type, str(i.compress_type))
    print(f'  {m:8} {i.file_size:6}  {i.CRC:08x}  {i.filename}{"   (neu)" if i.filename not in na else ""}')
print('  entfernt:', sorted(set(na) - set(i.filename for i in zb.infolist())) or '—')
print()
raw = open(after, 'rb').read()
print('== Wo stehen die bearbeiteten Texte? (entpackt, UTF-8; Rohbytes der ZIP-Datei)')
for t in texts:
    holders = [i.filename for i in zb.infolist() if t in zb.read(i.filename).decode('utf-8', 'replace')]
    stored_raw = t.encode('utf-8') in raw
    old = [i.filename for i in za.infolist() if t in za.read(i.filename).decode('utf-8', 'replace')]
    print(f'  „{t}“')
    print(f'      nachher in: {", ".join(holders) or "—"}')
    print(f'      vorher in:  {", ".join(old) or "—"}')
    print(f'      unkomprimiert in den Rohbytes der ZIP-Datei: {"ja" if stored_raw else "nein (deflate)"}')
print()
doc = zb.read('content/index.xhtml').decode('utf-8')
print('== Elemente im entpackten content/index.xhtml (wörtlich)')
for i in ids:
    m = re.search(r'<([a-z0-9]+)\b[^>]*\bid="' + re.escape(i) + r'"[^>]*>.*?</\1>', doc, re.S)
    print(f'  #{i}:')
    print('    ' + (m.group(0) if m else '(nicht gefunden)').replace('\n', '\n    '))
