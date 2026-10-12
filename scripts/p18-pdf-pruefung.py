#!/usr/bin/env python3
"""
Independent check of the P18 print PDFs (docs/belege/P18/pdf/<name>.pdf), without the reader's
code: pypdf for structure (page boxes, named destinations, outline, tags), pdfium (the PDF
engine of Chromium, via pypdfium2) for text, object bounds and page images.

    prototyp/.venv/bin/python scripts/p18-pdf-pruefung.py docs/belege/P18 druck lebendig sperren

Per PDF (HPL-PRINT-001 ... 005, HP-PRINT-002 ... 011):
  A  every page 210 x 297 mm (+/- 1 mm)
  B  header with the title and footer "Seite n von N" on every page; page 1 with id and dateModified
  C  table of contents: every entry "#kennung S. n" points to the page of its named destination
  D  every heading h1-h3 is followed by its "#kennung" on the same page
  E  nothing outside the type area: bounds of all page objects (text, paths, images, forms) inside
     20 ... 190 mm horizontally; outside 20 ... 275 mm vertically only header/footer text
  F  margin strips left and right (0 ... 19 mm, 191 ... 210 mm) without a single dark pixel
  G  every text block of the print document (p, li, td, th, caption, figcaption, h1-h6, dt, dd)
     appears in the PDF text; code blocks complete without the break marks; marks counted
  H  tables: the head on every page that has rows, every row on one page, each row exactly once
  I  live content: "Lebendige Fassung: <address>" in the PDF, with an image on the same page
     for video and component
  J  locks: no sentence of a no-print section in the PDF, the notice instead; details and blocks
     of priority 3 printed
Page images (100 dpi) go to <dir>/seiten/<name>-NN.png. Exit code 1 if any check fails.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import pypdf
import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c
from lxml import html as lxml_html

MM = 72 / 25.4
SOURCES = {
    'druck': 'docs/spezifikation/beispiele/p18-druck',
    'lebendig': 'docs/spezifikation/beispiele/p15-lebendig',
    'sperren': 'docs/spezifikation/beispiele/p17-sperren',
    'kontrolle': 'docs/spezifikation/beispiele/p18-druck',
}
BLOCKS = '//p|//li|//td|//th|//caption|//figcaption|//h1|//h2|//h3|//h4|//h5|//h6|//dt|//dd'


def ws(text):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', text or '').replace('­', '')).strip()


def flat(text):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', text or '').replace('­', ''))


class Report:
    def __init__(self, name):
        self.name = name
        self.failed = 0

    def check(self, label, ok, detail=''):
        if not ok:
            self.failed += 1
        print(f"  [{'ok' if ok else 'FEHLER'}] {label}{(' – ' + detail) if detail else ''}")
        return ok


def pdf_texts(doc):
    return [doc[i].get_textpage().get_text_range() for i in range(len(doc))]


def object_bounds(page):
    """Top-level page objects with type and bounds in mm (pdfium computes form bounds from their content)."""
    out = []
    kinds = {pdfium_c.FPDF_PAGEOBJ_TEXT: 'text', pdfium_c.FPDF_PAGEOBJ_PATH: 'path', pdfium_c.FPDF_PAGEOBJ_IMAGE: 'image',
             pdfium_c.FPDF_PAGEOBJ_SHADING: 'shading', pdfium_c.FPDF_PAGEOBJ_FORM: 'form'}
    for obj in page.get_objects(max_depth=0):
        left, bottom, right, top = obj.get_bounds()
        out.append((kinds.get(obj.type, str(obj.type)), left / MM, bottom / MM, right / MM, top / MM, obj))
    return out


def count_paths(page):
    """Vector paths that intersect the page box (drawings of other pages lie completely outside)."""
    out = 0
    for o in page.get_objects(max_depth=0):
        if o.type not in (pdfium_c.FPDF_PAGEOBJ_PATH, pdfium_c.FPDF_PAGEOBJ_FORM):
            continue
        left, bottom, right, top = (v / MM for v in o.get_bounds())
        if right > 0 and left < 210 and top > 0 and bottom < 297:
            out += 1
    return out


def count_images(page):
    return sum(1 for o in page.get_objects(max_depth=15) if o.type == pdfium_c.FPDF_PAGEOBJ_IMAGE)


def check_pdf(base, name):
    path = base / 'pdf' / f'{name}.pdf'
    rep_json = json.loads((base / 'pdf' / f'{name}-bericht.json').read_text(encoding='utf-8'))
    reader = rep_json['reader']
    printed = lxml_html.fromstring((base / 'pdf' / f'{name}-druckfassung.html').read_text(encoding='utf-8'))
    title = ws(printed.findtext('.//title'))
    doc_id = printed.xpath('//meta[@name="dcterms.identifier"]/@content')[0]
    modified = printed.xpath('//meta[@name="dcterms.modified"]/@content')[0]
    r = pypdf.PdfReader(str(path))
    doc = pdfium.PdfDocument(str(path))
    n = len(r.pages)
    rep = Report(name)
    print(f'\n== {name}.pdf: {n} Seiten, {path.stat().st_size} Bytes, Titel „{title}“, Kennung {doc_id}')
    meta = r.metadata or {}
    print(f'  PDF {r.pdf_header}, Producer {meta.get("/Producer")}, Creator {meta.get("/Creator")}, Title „{meta.get("/Title")}“')
    root = r.trailer['/Root']
    print(f"  getaggt: {'/StructTreeRoot' in root and bool(root.get("/MarkInfo", {}).get("/Marked"))}, Lang {root.get('/Lang')}, "
          f"Lesezeichen: {len(r.outline)} auf oberster Ebene")

    # A
    sizes = [(float(p.mediabox.width) / MM, float(p.mediabox.height) / MM) for p in r.pages]
    bad = [f'S. {i + 1}: {w:.2f} x {h:.2f} mm' for i, (w, h) in enumerate(sizes) if abs(w - 210) > 1 or abs(h - 297) > 1]
    rep.check('A  Seitenmaß 210 × 297 mm (± 1 mm) auf allen Seiten', not bad, f'gemessen {sizes[0][0]:.2f} × {sizes[0][1]:.2f} mm' if not bad else '; '.join(bad))
    rep.check('A  Seitenzahl wie vom Reader vorhergesagt', n == reader['pages'], f'PDF {n}, Reader {reader["pages"]}')

    texts = pdf_texts(doc)
    norm = [ws(t) for t in texts]
    flats = [flat(t) for t in texts]
    all_flat = ''.join(flats)

    # B
    missing_head = [i + 1 for i, t in enumerate(flats) if flat(title) not in t]
    rep.check('B  Kopfzeile mit Titel auf jeder Seite', not missing_head, f'fehlt auf {missing_head}' if missing_head else f'„{title}“')
    wrong_foot = [i + 1 for i, t in enumerate(norm) if f'Seite {i + 1} von {n}' not in t]
    rep.check('B  Fußzeile „Seite n von N“ auf jeder Seite, Werte richtig', not wrong_foot, f'falsch auf {wrong_foot}' if wrong_foot else f'„Seite 1 von {n}“ … „Seite {n} von {n}“')
    rep.check('B  Seite 1 trägt Kennung und dateModified', doc_id in norm[0] and modified in norm[0], f'{doc_id}, {modified}')

    # C
    dests = {}
    for key, dest in r.named_destinations.items():
        dests[key.lstrip('/')] = r.get_destination_page_number(dest) + 1
    toc_pages = [i for i in range(min(3, n)) if len(re.findall(r'#[\w.-]+\s*S\.\s*\d+', norm[i])) >= 3]
    if reader.get('toc'):
        entries = [(m.group(1), int(m.group(2))) for i in toc_pages for m in re.finditer(r'#([\w.-]+)\s*S\.\s*(\d+)', norm[i])]
        wrong = [f'#{k}: Verzeichnis S. {p}, Ziel S. {dests.get(k)}' for k, p in entries if dests.get(k) != p]
        rep.check('C  Verzeichnis vorhanden, jede Seitenzahl = Seite des Sprungziels im PDF', bool(entries) and not wrong,
                  f'{len(entries)} Einträge auf Seite(n) {[p + 1 for p in toc_pages]} geprüft' if not wrong else '; '.join(wrong))
        print('     ' + ', '.join(f'#{k} S. {p}' for k, p in entries))
    else:
        rep.check('C  kein Verzeichnis, weil einseitig (HP-PRINT-005)', n == 1, f'{n} Seite(n)')
    refs = [(m.group(1), m.group(2)) for i, t in enumerate(norm) if i not in toc_pages for m in re.finditer(r'\(S\.\s*(\d+),\s*[^)]*?#([\w.-]+)\)', t)]
    wrong_refs = [f'#{k}: S. {p}, Ziel S. {dests.get(k)}' for p, k in refs if dests.get(k) != int(p)]
    if refs:
        rep.check('C  Verweise im Text „(S. n, #kennung)“ zeigen auf die richtige Seite', not wrong_refs, f'{len(refs)} Verweise' if not wrong_refs else '; '.join(wrong_refs))

    # D
    first_content = (max(toc_pages) + 2) if toc_pages else 1
    bad_h = []
    for h in reader['headings']:
        if h['level'] > 3:
            continue
        if not h['kennung']:
            bad_h.append(f'„{h["text"]}“ ohne Kennung')
            continue
        needle = flat(h['text'] + '#' + h['kennung'])
        pages = [i + 1 for i in range(first_content - 1, n) if needle in flats[i]]
        if not pages:
            bad_h.append(f'„{h["text"]}“ #{h["kennung"]} nicht gefunden')
    rep.check('D  jede Überschrift h1–h3 mit „#kennung“ auf derselben Seite', not bad_h, f'{len(reader["headings"])} Überschriften' if not bad_h else '; '.join(bad_h))

    # E and F. Chromium paints each page with a clip; drawings of neighbouring pages (e.g. the dotted
    # leaders of the table of contents) end up as objects completely outside the page box, where
    # they are invisible. They are counted, not judged: content cut at an edge intersects the page.
    outside = []
    margin_text = 0
    invisible = 0
    checked = 0
    for i in range(n):
        page = doc[i]
        for kind, left, bottom, right, top, obj in object_bounds(page):
            if right - left <= 0 and top - bottom <= 0:
                continue
            if right <= 0 or left >= 210 or top <= 0 or bottom >= 297:
                invisible += 1
                continue
            checked += 1
            horiz = left < 20 - 0.5 or right > 190 + 0.5
            body = bottom >= 20 - 0.5 and top <= 275 + 0.5
            if not body and kind == 'text' and not horiz and (top > 275 or bottom < 20):
                margin_text += 1
                continue
            if horiz or not body:
                outside.append(f'S. {i + 1} {kind} [{left:.1f}, {bottom:.1f}, {right:.1f}, {top:.1f}] mm')
    rep.check('E  0 Objekte außerhalb des Satzspiegels (170 × 255 mm; in Kopf- und Fußzeile nur Text)', not outside,
              (f'{checked} Objekte auf den Seiten geprüft, davon {margin_text} Textobjekte in Kopf- und Fußzeile; '
               f'{invisible} Objekte vollständig außerhalb des Seitenformats (von Chromium beschnitten, unsichtbar)') if not outside
              else '; '.join(outside[:12]) + (f' … (+{len(outside) - 12})' if len(outside) > 12 else ''))
    img_dir = base / 'seiten'
    img_dir.mkdir(exist_ok=True)
    dark = []
    for i in range(n):
        bitmap = doc[i].render(scale=100 / 72)
        img = bitmap.to_pil().convert('L')
        img.save(img_dir / f'{name}-{i + 1:02d}.png', optimize=True)
        w, h = img.size
        px = img.load()
        x_left = int(19 / 210 * w)
        x_right = int(191 / 210 * w) + 1
        count = sum(1 for y in range(h) for x in list(range(0, x_left)) + list(range(x_right, w)) if px[x, y] < 200)
        if count:
            dark.append(f'S. {i + 1}: {count} Pixel')
    rep.check('F  Randstreifen links und rechts (je 19 mm) ohne dunkles Pixel (Seitenbilder 100 dpi)', not dark, f'{n} Seitenbilder in {img_dir.relative_to(base.parent.parent.parent)}' if not dark else '; '.join(dark))

    # G
    # Generated text of print.css: external links show their URL after the link text.
    for a in printed.xpath('//a[starts-with(@href, "http:") or starts-with(@href, "https:") or starts-with(@href, "mailto:")]'):
        if 'hp-url-sichtbar' not in (a.get('class') or ''):
            a.tail = f' ({a.get("href")})' + (a.tail or '')
    missing = []
    blocks = 0
    for el in printed.xpath(BLOCKS):
        if el.xpath('ancestor::pre') or el.xpath('ancestor::*[contains(concat(" ", @class, " "), " hp-print-toc ")]'):
            continue
        t = flat(el.text_content())
        if not t:
            continue
        blocks += 1
        if t not in all_flat:
            missing.append(ws(el.text_content())[:60])
    rep.check('G  jeder Textblock der Druckfassung steht im PDF (nichts abgeschnitten)', not missing, f'{blocks} Blöcke' if not missing else f'{len(missing)} fehlen: ' + ' | '.join(missing[:5]))
    for pre in printed.xpath('//pre'):
        marks = len(pre.xpath('.//*[contains(@class, "hp-umbruch")]'))
        for el in pre.xpath('.//*[contains(@class, "hp-umbruch") or contains(@class, "hp-fortsetzung")]'):
            el.drop_tree()
        code = flat(pre.text_content())
        pdf_code = all_flat.replace('↩', '')
        found_marks = sum(t.count('↩') for t in texts)
        rep.check(f'G  Codeblock #{pre.get("id")}: vollständig im PDF ohne die Umbruchmarken, Marken sichtbar',
                  code in pdf_code and found_marks >= marks and (marks > 0 or not reader['markedWraps']),
                  f'{len(ws(pre.text_content()))} Zeichen, {marks} Marken „↩“ in der Druckfassung, {found_marks} im PDF-Text, längste Quellzeile {max(len(l) for l in pre.text_content().split(chr(10)))} Zeichen')

    # H
    for table in printed.xpath('//table'):
        tid = table.get('id') or '(ohne id)'
        head = flat(' '.join(th.text_content() for th in table.xpath('./thead//th')))
        rows = [flat(tr.text_content()) for tr in table.xpath('./tbody/tr')]
        if not rows:
            continue
        row_pages = []
        split = []
        for k, row in enumerate(rows):
            pages = [i + 1 for i, t in enumerate(flats) if row in t]
            if not pages:
                split.append(k + 1)
            row_pages.append(pages)
        pages_with_rows = sorted({p for ps in row_pages for p in ps})
        no_head = [p for p in pages_with_rows if head and head not in flats[p - 1]]
        rep.check(f'H  Tabelle #{tid}: {len(rows)} Zeilen je auf einer Seite, Kopf auf allen {len(pages_with_rows)} Seiten {pages_with_rows}',
                  not split and not no_head, ('geteilte/fehlende Zeilen ' + str(split[:10]) if split else '') + (f' ohne Kopf: {no_head}' if no_head else ''))
        if tid == 'messwerte':
            counts = {f'M-{k:03d}': len(re.findall(rf'M-{k:03d}(?![;\d])', ' '.join(norm))) for k in range(1, 201)}
            off = {k: v for k, v in counts.items() if v != 1}
            rep.check('H  Messprotokoll: jede der 200 Zeilen genau einmal im PDF', not off, str(off)[:200] if off else 'M-001 … M-200')

    # I
    for item in reader['live']:
        sentence = flat(f'Lebendige Fassung: {item["address"]}')
        pages = [i + 1 for i in range(n) if sentence in flats[i]]
        found = [(count_images(doc[p - 1]), count_paths(doc[p - 1])) for p in pages]
        if item['kind'] == 'audio':
            ok = bool(pages)
            detail = f'Seite {pages}, Beschreibung statt Standbild'
        else:
            ok = bool(pages) and any(img > 0 or paths > 0 for img, paths in found)
            detail = f'Seite {pages}, Bildobjekte/Vektorpfade auf der Seite: {found}'
        rep.check(f'I  {item["kind"]}: Standbild und „Lebendige Fassung: {item["address"]}“', ok, detail)

    # J
    src = Path(SOURCES[name])
    access = json.loads((src / 'dokument.json').read_text(encoding='utf-8')).get('access', [])
    for addr in rep_json['reader'].get('omitted', []):
        file, _, frag = addr.partition('#')
        tree = lxml_html.fromstring((src / file).read_bytes())
        el = tree.get_element_by_id(frag) if frag else tree
        sentences = [s for s in re.split(r'(?<=[.!?])\s+', ws(el.text_content())) if len(s) >= 25]
        leaked = [s for s in sentences if flat(s) in all_flat]
        rules = next((a['rules'] for a in access if a['target'] == addr), [])
        text_notice = f'Abschnitt {frag} ausgeblendet' if 'hidden' in rules else f'Abschnitt {frag} nicht zum Druck freigegeben'
        notice = flat(text_notice) in all_flat
        rep.check(f'J  {addr} (Sperre {", ".join(rules)}): kein Satz im PDF, Hinweis „{text_notice}“', not leaked and notice,
                  f'{len(sentences)} Sätze geprüft' if not leaked else f'{len(leaked)} Sätze im PDF: {leaked[:2]}')
    for file in sorted(src.glob('content/*.xhtml')):
        tree = lxml_html.fromstring(file.read_bytes())
        for el in tree.xpath('//details|//*[@data-hp-priority]'):
            t = flat(el.text_content())
            rep.check(f'J  {el.tag}#{el.get("id")} ({"zugeklappt" if el.tag == "details" else "Priorität " + el.get("data-hp-priority")}) vollständig gedruckt', t in all_flat)
    print(f'  => {name}: {"alle Prüfungen bestanden" if not rep.failed else f"{rep.failed} Prüfung(en) fehlgeschlagen"}')
    return rep.failed


def main():
    base = Path(sys.argv[1])
    names = sys.argv[2:] or ['druck']
    print(f'pypdf {pypdf.__version__}, pypdfium2 {pdfium.PYPDFIUM_INFO if hasattr(pdfium, "PYPDFIUM_INFO") else ""}'.strip())
    import pypdfium2.version as v
    print(f'pypdfium2 {v.PYPDFIUM_INFO}, pdfium {v.PDFIUM_INFO}')
    failed = sum(check_pdf(base, n) for n in names)
    print(f'\nGesamt: {"bestanden" if not failed else f"{failed} Prüfung(en) fehlgeschlagen"}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
