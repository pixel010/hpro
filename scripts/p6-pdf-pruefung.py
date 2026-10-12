"""
PDF-Prüfung P6: die ausgefüllte Fassung des Antrags, gedruckt über den Druckweg des Readers.

    prototyp/.venv/bin/python scripts/p6-pdf-pruefung.py PDF EXPORT.json BILDER-ORDNER

Prüft mit pypdf (Text) und pypdfium2 (Seitenbilder), ohne Code aus kern/ oder app/:
Seitenformat A4, jede Eingabe des Datenexports als Text im PDF, die berechneten Werte, der
Status „abgesendet“, die Hinweise für nicht geltende Abschnitte, keine Fehlermeldung des
Formulars. Schreibt je Seite ein PNG. Exit 0, wenn alles erfüllt ist.
"""
import json
import os
import re
import sys
from importlib.metadata import version

import pypdfium2 as pdfium
from pypdf import PdfReader


def fmt_money(x):
    s = '{:,.2f}'.format(x).replace(',', 'X').replace('.', ',').replace('X', '.')
    return s + ' €'


def main():
    pdf_file, export_file, out_dir = sys.argv[1:4]
    os.makedirs(out_dir, exist_ok=True)
    with open(export_file, encoding='utf-8') as fh:
        data = json.load(fh)
    reader = PdfReader(pdf_file)
    print('pypdf %s, pypdfium2 %s' % (version('pypdf'), version('pypdfium2')))
    print('%s: %d Seiten' % (pdf_file, len(reader.pages)))
    ok = True
    for i, page in enumerate(reader.pages, 1):
        w, h = float(page.mediabox.width), float(page.mediabox.height)
        a4 = abs(w - 595.28) < 1 and abs(h - 841.89) < 1
        ok &= a4
        print('  Seite %d: %.2f × %.2f pt %s' % (i, w, h, 'A4' if a4 else 'NICHT A4'))
    text = '\n'.join(p.extract_text() or '' for p in reader.pages)
    flat = re.sub(r'\s+', ' ', text)
    v = data['values']
    expected = [
        ('Vorname', v['vorname']), ('Nachname', v['nachname']), ('E-Mail', v['email']), ('Telefon', v['telefon']),
        ('IBAN', v['iban']), ('Kontoinhaber', v['kontoinhaber']), ('Ort', v['ort']),
        ('Mitantragsteller', v['mit_vorname']),
        ('Geburtsdatum', '14.03.1988'), ('Antragsdatum', '12.10.2026'),
        ('Familienstand', 'verheiratet'),
        ('Kaufpreis', fmt_money(v['kaufpreis'])), ('Eigenmittel', fmt_money(v['eigenmittel'])),
        ('Einnahmen gesamt', fmt_money(v['einnahmen_gesamt'])), ('Ausgaben gesamt', fmt_money(v['ausgaben_gesamt'])),
        ('Nebenkosten', fmt_money(v['nebenkosten'])), ('Finanzierungsbedarf', fmt_money(v['finanzierungsbedarf'])),
        ('Monatsrate', fmt_money(v['monatsrate'])), ('Eigenmittelquote', '23 %'), ('Belastungsquote', '32 %'),
        ('Bestätigung', '☒ ja'),
        ('Status', 'abgesendet am'), ('Prüfungen', 'alle Prüfungen erfüllt'),
        ('nicht geltender Abschnitt', 'entfällt: Bedingung nicht erfüllt'),
    ]
    print('\nErwartete Texte im PDF (Werte aus %s):' % export_file)
    for label, needle in expected:
        found = needle in flat
        ok &= found
        print('  %-28s %-34s %s' % (label, json.dumps(needle, ensure_ascii=False), 'gefunden' if found else 'FEHLT'))
    print('\nTexte, die nicht vorkommen dürfen:')
    for needle in ['Pflichtfeld ist leer', 'Das Formular kann noch nicht abgesendet werden', '#DIV/0!', '#NAME?', '#VALUE!', 'Entwurf, nicht abgesendet', 'Eingaben prüfen', 'Entwurf speichern', 'Daten exportieren (JSON)']:
        found = needle in flat
        ok &= not found
        print('  %-48s %s' % (json.dumps(needle, ensure_ascii=False), 'VORHANDEN' if found else 'nicht vorhanden'))
    pdf = pdfium.PdfDocument(pdf_file)
    for i in range(len(pdf)):
        image = pdf[i].render(scale=100 / 72).to_pil()
        name = os.path.join(out_dir, 'pdf-seite-%d.png' % (i + 1))
        image.save(name)
        print('Seitenbild %s (%d × %d px, 100 dpi)' % (name, image.width, image.height))
    print('\nErgebnis: %s' % ('alle Prüfungen erfüllt' if ok else 'NICHT erfüllt'))
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
