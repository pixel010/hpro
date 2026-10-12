#!/usr/bin/env python3
"""Unabhängige Volltextsuche P17 (nur Python-Standardbibliothek, kein Code aus kern/):
entpackt jeden Eintrag eines Containers und sucht die Zeilen einer Begriffsdatei

  - im Eintrag als UTF-8 (fehlertolerant),
  - im Eintrag mit aufgelösten Zeichenreferenzen und ohne Tags (html.unescape, Regex),
  - in allen Zeichenketten eines JSON-Eintrags,
  - in den Rohbytes der ZIP-Datei als UTF-8, UTF-16LE und UTF-16BE,

jeweils ohne Groß-/Kleinschreibung und mit zusammengefasstem Leerraum. Ausgegeben wird je Treffer
die Nummer des Begriffs und der Eintrag, nicht der Begriff. Exit 0 = kein Treffer.

  python3 scripts/p17-zipscan.py <container> <begriffe.txt>
"""
import html, json, re, sys, unicodedata, zipfile

def norm(s):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', s)).lower()

def strings(v, out):
    if isinstance(v, str): out.append(v)
    elif isinstance(v, list):
        for x in v: strings(x, out)
    elif isinstance(v, dict):
        for k, x in v.items(): out.append(k); strings(x, out)

path, terms_file = sys.argv[1], sys.argv[2]
terms = [t.strip() for t in open(terms_file, encoding='utf-8') if t.strip()]
z = zipfile.ZipFile(path)
hits = []
names = [i.filename for i in z.infolist() if not i.filename.endswith('/')]
for name in names:
    data = z.read(name)
    text = data.decode('utf-8', errors='replace')
    views = {'utf8': norm(text), 'ohne-tags': norm(html.unescape(re.sub(r'<[^>]*>', ' ', text)) + ' ' + ' '.join(html.unescape(m) for m in re.findall(r'"([^"]*)"', text)))}
    try:
        out = []; strings(json.loads(text), out); views['json'] = norm('\n'.join(out))
    except Exception:
        pass
    for i, t in enumerate(terms):
        for k, v in views.items():
            if norm(t) in v: hits.append((i + 1, name, k))
raw = open(path, 'rb').read()
for i, t in enumerate(terms):
    for enc in ('utf-8', 'utf-16-le', 'utf-16-be'):
        for form in (t, t.lower()):
            if form.encode(enc) in raw or form.encode(enc) in raw.lower():
                hits.append((i + 1, '(ZIP roh)', enc))
hits = sorted(set(hits))
print(f'{path}: {len(names)} Einträge entpackt (zipfile, Python {sys.version.split()[0]}), {len(terms)} Begriffe (nicht ausgegeben)')
for n, name, k in hits:
    print(f'  TREFFER Begriff #{n} in {name} ({k})')
print(f'Treffer: {len(hits)}')
sys.exit(0 if not hits else 1)
