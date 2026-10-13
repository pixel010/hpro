"""Generates the P9 test PDFs (deterministic): import sources, cases for the limits document and
synthetic scans with known ground truth for the OCR measurement.

    dienst/.venv/bin/python dienst/testdaten/erzeugen.py <ausgabeordner>

Files:
  bericht.pdf             text and image (photo-like PNG), headings 1/1.1/2, lists, table,
                          footnote, running header and page numbers; untagged (the usual case)
  bericht-getaggt.pdf     the same, tagged (PDF/UA-1 variant of WeasyPrint)
  grenze-zweispaltig.pdf  two columns, boxed sidebar, margin note
  grenze-tabelle.pdf      table without rules, merged cells, two-row header
  grenze-formular.pdf     AcroForm fields (text, checkbox) and a signature line
  grenze-silben.pdf       hyphenation across lines, formula, footnotes, superscripts
  grenze-diagramm.pdf     vector bar chart with labels
  grenze-ueberschriften.pdf  headings distinguished only by font size, no numbering
  scan-<n>.pdf            image-only PDF of a two-page letter: 300, 200 and 150 dpi with
                          increasing noise, blur, skew, JPEG artefacts (seeded)
  scan-grundwahrheit.txt  the letter's text in reading order (reference for CER/WER)
"""

from __future__ import annotations

import io
import json
import random
import sys
from pathlib import Path

import pypdfium2 as pdfium
import weasyprint
from PIL import Image, ImageDraw, ImageFilter

BASE_CSS = """
@page { size: A4; margin: 22mm 20mm 20mm 20mm;
  @top-right { content: "Baubüro Huber · Projekt 2026-114"; font: 8pt sans-serif; color: #555; }
  @bottom-center { content: "Seite " counter(page) " von " counter(pages); font: 8pt sans-serif; } }
body { font: 10.5pt/1.45 "DejaVu Serif", serif; }
h1 { font: bold 18pt "DejaVu Sans", sans-serif; margin: 0 0 4mm; }
h2 { font: bold 13pt "DejaVu Sans", sans-serif; margin: 6mm 0 2mm; }
h3 { font: bold 11pt "DejaVu Sans", sans-serif; margin: 4mm 0 1.5mm; }
table { border-collapse: collapse; width: 100%; font-size: 9.5pt; }
th, td { border: 0.6pt solid #000; padding: 1.2mm 2mm; text-align: left; }
td.zahl, th.zahl { text-align: right; }
figure { margin: 4mm 0; } figcaption { font-size: 9pt; font-style: italic; }
.fn { font-size: 8.5pt; border-top: 0.5pt solid #000; margin-top: 6mm; padding-top: 1mm; }
"""


def photo_png() -> bytes:
    """A photo-like picture: sky gradient, house with red roof, scaffold, noise (seeded)."""
    rng = random.Random(7)
    w, h = 960, 600
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            if y < 380:
                t = y / 380
                px[x, y] = (int(110 + 80 * t), int(160 + 60 * t), int(220 + 20 * t))
            else:
                px[x, y] = (70 + rng.randint(-8, 8), 120 + rng.randint(-8, 8), 60 + rng.randint(-8, 8))
    d = ImageDraw.Draw(img)
    d.rectangle([260, 300, 700, 520], fill=(225, 215, 190), outline=(90, 80, 60), width=3)
    d.polygon([(220, 305), (480, 130), (740, 305)], fill=(170, 50, 40), outline=(90, 30, 20))
    for i in range(12):
        y = 300 - i * 14
        d.line([(480 - (y - 130) * 1.49, y), (480 + (y - 130) * 1.49, y)], fill=(130, 35, 30), width=2)
    d.rectangle([330, 380, 400, 450], fill=(80, 110, 140))
    d.rectangle([560, 380, 630, 450], fill=(80, 110, 140))
    d.rectangle([450, 420, 510, 520], fill=(100, 70, 40))
    for x in range(200, 780, 60):
        d.line([(x, 520), (x, 250)], fill=(160, 160, 160), width=4)
    for y in range(280, 520, 60):
        d.line([(200, y), (760, y)], fill=(160, 160, 160), width=3)
    img = img.filter(ImageFilter.GaussianBlur(0.8))
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def bericht_html(photo_uri: str) -> str:
    rows = [
        ("Gerüst", "1", "Pausch.", "3.200,00"),
        ("Altdeckung abtragen und entsorgen", "142", "m²", "4.150,00"),
        ("Lattung und Unterdach", "142", "m²", "6.850,00"),
        ("Eindeckung Tondachziegel", "142", "m²", "14.400,00"),
        ("Spenglerarbeiten Kupfer", "38", "lfm", "5.100,00"),
    ]
    body_rows = "".join(f"<tr><td>{a}</td><td class='zahl'>{b}</td><td>{c}</td><td class='zahl'>{d}</td></tr>" for a, b, c, d in rows)
    return f"""<!DOCTYPE html><html lang="de-AT"><head><meta charset="utf-8"><title>Sanierungsbericht Dach Haus Nr. 12</title>
<style>{BASE_CSS}</style></head><body>
<h1>Sanierungsbericht Dach Haus Nr. 12</h1>
<p>Dieser Bericht fasst den Zustand des Daches nach der Begehung am 9. Oktober 2026 zusammen und
nennt die empfohlenen Maßnahmen. Er richtet sich an die Eigentümergemeinschaft und an die
ausführenden Betriebe.</p>
<h2>1 Bestand</h2>
<p>Das Satteldach hat eine Neigung von 38 Grad und eine Fläche von 142 Quadratmetern. Die
Eindeckung aus Betondachsteinen stammt aus dem Jahr 1978. An mehreren Stellen sind Steine
gebrochen; die Lattung ist im Traufbereich feucht.</p>
<figure><img src="{photo_uri}" style="width: 120mm" alt="Ansicht von Süden">
<figcaption>Abbildung 1: Ansicht von Süden mit eingerüsteter Traufe, Aufnahme vom 9. Oktober 2026.</figcaption></figure>
<h3>1.1 Schäden im Einzelnen</h3>
<ul>
<li>Gebrochene Dachsteine an der Traufe, etwa 40 Stück.</li>
<li>Durchfeuchtete Lattung auf rund 12 Quadratmetern.</li>
<li>Undichte Anschlüsse am Kamin; die Verwahrung ist lose.</li>
</ul>
<h3>1.2 Messungen</h3>
<p>Die Holzfeuchte der Sparren lag zwischen 14 und 21 Prozent<sup>1</sup>. Über 18 Prozent gilt
das Holz als gefährdet; betroffen sind die Sparren 3 bis 7 auf der Nordseite.</p>
<h2>2 Empfohlene Maßnahmen</h2>
<ol>
<li>Altdeckung vollständig abtragen und entsorgen.</li>
<li>Lattung und Unterdach erneuern, Sparren 3 bis 7 prüfen.</li>
<li>Neueindeckung mit Tondachziegeln, Anschlüsse in Kupfer.</li>
</ol>
<h2>3 Kosten</h2>
<table><caption>Tabelle 1: Kostenschätzung netto in Euro</caption>
<thead><tr><th>Leistung</th><th class="zahl">Menge</th><th>Einheit</th><th class="zahl">Betrag</th></tr></thead>
<tbody>{body_rows}</tbody>
<tfoot><tr><td>Summe</td><td></td><td></td><td class="zahl">33.700,00</td></tr></tfoot></table>
<p>Die Ausführung ist für das Frühjahr 2027 vorgesehen. Die Bauzeit beträgt etwa sechs Wochen.</p>
<p class="fn"><sup>1</sup> Widerstandsmessung mit Einschlagelektroden, Holzart Fichte.</p>
</body></html>"""


ZWEISPALTIG = """<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Mitteilungsblatt</title><style>
@page { size: A4; margin: 18mm; } body { font: 10pt/1.4 "DejaVu Serif", serif; }
h1 { font: bold 20pt "DejaVu Sans", sans-serif; column-span: all; }
.spalten { columns: 2; column-gap: 8mm; }
.kasten { border: 1pt solid #000; background: #eee; padding: 3mm; margin: 3mm 0; font-family: "DejaVu Sans"; font-size: 9pt; }
.rand { float: right; width: 30mm; margin-right: -2mm; font-size: 8pt; color: #333; }
</style></head><body><h1>Mitteilungsblatt der Gemeinde</h1><div class="spalten">
<h2>Neue Öffnungszeiten</h2><p>Ab November ist das Gemeindeamt am Montag und Donnerstag bis 18 Uhr geöffnet. Die erste Spalte
endet hier mit einem langen Satz, der in der zweiten Spalte fortgesetzt wird, damit man sieht, ob die Lesereihenfolge die
Spalten richtig verbindet und der Satz nicht mitten im Kasten weitergeht.</p>
<div class="kasten"><strong>Kasten: Wichtige Termine</strong><br>12. November: Gemeinderatssitzung<br>3. Dezember: Adventmarkt</div>
<p><span class="rand">Randnotiz: Parkplätze beim Feuerwehrhaus nutzen.</span>Der Winterdienst beginnt am 15. November. Bitte
stellen Sie Fahrzeuge so ab, dass die Räumfahrzeuge durchfahren können. Die Müllabfuhr verschiebt sich in der Feiertagswoche um
einen Tag. Sperrmüll wird am ersten Samstag im Monat am Bauhof angenommen.</p>
<h2>Bauarbeiten</h2><p>Die Sanierung der Dorfstraße dauert voraussichtlich bis Ende November. Umleitungen sind beschildert.</p>
<p>Fragen beantwortet das Bauamt unter der Durchwahl 21.</p></div></body></html>"""

TABELLE = """<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Leistungsverzeichnis</title><style>
@page { size: A4 landscape; margin: 15mm; } body { font: 9pt "DejaVu Sans", sans-serif; }
table { border-collapse: collapse; } th, td { padding: 1mm 3mm; } th { border-bottom: 0.5pt solid #000; } td.z { text-align: right; }
</style></head><body><h1>Leistungsverzeichnis Dach – Gegenüberstellung der Angebote</h1>
<table><thead><tr><th rowspan="2">Pos.</th><th rowspan="2">Leistung</th><th colspan="2">Firma Huber</th><th colspan="2">Firma Gruber</th></tr>
<tr><th>EP €</th><th>GP €</th><th>EP €</th><th>GP €</th></tr></thead><tbody>
<tr><td>01</td><td>Gerüst</td><td class="z">3.200,00</td><td class="z">3.200,00</td><td class="z">2.950,00</td><td class="z">2.950,00</td></tr>
<tr><td>02</td><td>Abtragen<br>inkl. Entsorgung</td><td class="z">29,20</td><td class="z">4.146,40</td><td class="z">31,00</td><td class="z">4.402,00</td></tr>
<tr><td rowspan="2">03</td><td>Lattung</td><td class="z">21,50</td><td class="z">3.053,00</td><td class="z" rowspan="2">47,00</td><td class="z" rowspan="2">6.674,00</td></tr>
<tr><td>Unterdach</td><td class="z">26,70</td><td class="z">3.791,40</td></tr>
<tr><td>04</td><td>Eindeckung</td><td class="z">101,40</td><td class="z">14.398,80</td><td class="z">98,00</td><td class="z">13.916,00</td></tr>
<tr><td colspan="2">Summe netto</td><td></td><td class="z">28.589,60</td><td></td><td class="z">27.942,00</td></tr>
</tbody></table></body></html>"""

FORMULAR = """<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Antrag Bauförderung</title><style>
@page { size: A4; margin: 20mm; } body { font: 10.5pt "DejaVu Sans", sans-serif; } label { display: block; margin-top: 4mm; }
input[type=text] { width: 120mm; border: 0.5pt solid #000; height: 7mm; }
</style></head><body><h1>Antrag auf Förderung der Dachsanierung</h1>
<label>Name der Antragstellerin<br><input type="text" name="name" value="Maria Beispiel"></label>
<label>Adresse des Objekts<br><input type="text" name="adresse" value="Dorfstraße 12, 6020 Innsbruck"></label>
<label>Beantragter Betrag in Euro<br><input type="text" name="betrag" value="8.000,00"></label>
<label><input type="checkbox" name="energie" checked> Die Sanierung umfasst eine Wärmedämmung.</label>
<label><input type="checkbox" name="denkmal"> Das Gebäude steht unter Denkmalschutz.</label>
<p style="margin-top: 20mm">Ort, Datum, Unterschrift: ______________________________</p></body></html>"""

SILBEN = """<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Bauphysik</title><style>
@page { size: A4; margin: 25mm 55mm 25mm 25mm; } body { font: 11pt/1.4 "DejaVu Serif", serif; hyphens: auto; text-align: justify; }
.formel { text-align: center; font-size: 13pt; margin: 4mm 0; } .fn { font-size: 8.5pt; border-top: 0.5pt solid #000; }
</style></head><body><h1>Wärmedurchgang durch die Dachkonstruktion</h1>
<p>Der Wärmedurchgangskoeffizient einer mehrschichtigen Bauteilkonstruktion berechnet sich aus den
Wärmeübergangswiderständen und den Wärmedurchlasswiderständen der einzelnen Schichten<sup>1</sup>.
Bei Steildachkonstruktionen mit Zwischensparrendämmung ist der Holzanteil gesondert zu berücksichtigen<sup>2</sup>.</p>
<p class="formel">U = 1 / (R<sub>si</sub> + Σ d<sub>i</sub>/λ<sub>i</sub> + R<sub>se</sub>) ≈ 0,18 W/(m²·K)</p>
<p>Für die geplante Dämmstärke von 24 Zentimetern Mineralwolle der Wärmeleitfähigkeitsgruppe 035 ergibt
sich damit ein Wert, der die Anforderungen der Bauordnung unterschreitet.</p>
<p class="fn"><sup>1</sup> ÖNORM EN ISO 6946.<br><sup>2</sup> Holzanteil bei Sparrenabstand 70 cm etwa 12 Prozent.</p></body></html>"""

DIAGRAMM_SVG = """<svg xmlns="http://www.w3.org/2000/svg" width="160mm" height="80mm" viewBox="0 0 640 320" role="img" aria-label="Kosten je Gewerk">
<g font-family="DejaVu Sans" font-size="14">
<line x1="150" y1="20" x2="150" y2="290" stroke="#000"/>
<rect x="150" y="30" width="430" height="34" fill="#a33"/><text x="140" y="52" text-anchor="end">Eindeckung</text><text x="585" y="52">14.400</text>
<rect x="150" y="80" width="205" height="34" fill="#a33"/><text x="140" y="102" text-anchor="end">Lattung</text><text x="360" y="102">6.850</text>
<rect x="150" y="130" width="152" height="34" fill="#a33"/><text x="140" y="152" text-anchor="end">Spengler</text><text x="307" y="152">5.100</text>
<rect x="150" y="180" width="124" height="34" fill="#a33"/><text x="140" y="202" text-anchor="end">Abtragen</text><text x="279" y="202">4.150</text>
<rect x="150" y="230" width="96" height="34" fill="#a33"/><text x="140" y="252" text-anchor="end">Gerüst</text><text x="251" y="252">3.200</text>
</g></svg>"""

DIAGRAMM = f"""<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Kostenübersicht</title>
<style>@page {{ size: A4; margin: 20mm; }} body {{ font: 10.5pt "DejaVu Serif", serif; }}</style></head><body>
<h1>Kostenübersicht</h1><p>Das Diagramm zeigt die Kosten je Gewerk in Euro.</p>{DIAGRAMM_SVG}
<p>Abbildung 2: Kosten je Gewerk (Balkendiagramm, Vektorgrafik).</p></body></html>"""

UEBERSCHRIFTEN = """<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Baubeschreibung</title><style>
@page { size: A4; margin: 20mm; } body { font: 10.5pt "DejaVu Serif", serif; }
.t1 { font: bold 17pt "DejaVu Sans"; margin-top: 6mm; } .t2 { font: bold 13pt "DejaVu Sans"; margin-top: 4mm; } .t3 { font: bold 11pt "DejaVu Sans"; margin-top: 3mm; }
</style></head><body>
<p class="t1">Baubeschreibung</p><p>Allgemeine Angaben zum Vorhaben.</p>
<p class="t2">Dach</p><p>Das Dach wird neu eingedeckt.</p>
<p class="t3">Eindeckung</p><p>Tondachziegel, naturrot.</p>
<p class="t3">Unterdach</p><p>Diffusionsoffene Bahn.</p>
<p class="t2">Fassade</p><p>Die Fassade bleibt unverändert.</p>
<p class="t3">Anstrich</p><p>Silikatfarbe, weiß.</p>
</body></html>"""

BRIEF = [
    ("h", "Baubüro Huber GmbH"),
    ("p", "Dorfstraße 4, 6020 Innsbruck, Telefon 0512 123456"),
    ("p", "Frau Maria Beispiel, Kirchweg 7, 6060 Hall in Tirol"),
    ("p", "Innsbruck, 9. Oktober 2026"),
    ("h", "Angebot Nr. 2026-114: Sanierung des Daches"),
    ("p", "Sehr geehrte Frau Beispiel,"),
    ("p", "vielen Dank für Ihre Anfrage vom 2. Oktober 2026. Nach der Besichtigung Ihres Hauses bieten wir Ihnen die Sanierung des Daches wie folgt an. Die Preise verstehen sich netto zuzüglich 20 Prozent Umsatzsteuer."),
    ("p", "Position 1: Gerüst aufstellen und abbauen, pauschal 3.200,00 Euro."),
    ("p", "Position 2: Altdeckung abtragen und fachgerecht entsorgen, 142 Quadratmeter zu je 29,20 Euro, zusammen 4.146,40 Euro."),
    ("p", "Position 3: Lattung und diffusionsoffenes Unterdach erneuern, 142 Quadratmeter zu je 48,20 Euro, zusammen 6.844,40 Euro."),
    ("p", "Position 4: Eindeckung mit Tondachziegeln, naturrot, 142 Quadratmeter zu je 101,40 Euro, zusammen 14.398,80 Euro."),
    ("p", "Position 5: Spenglerarbeiten in Kupfer an Traufe, Ortgang und Kamin, 38 Laufmeter zu je 134,20 Euro, zusammen 5.099,60 Euro."),
    ("p", "Die Angebotssumme beträgt 33.689,20 Euro netto, mit Umsatzsteuer 40.427,04 Euro. Das Angebot gilt bis zum 31. Dezember 2026."),
    ("p", "Für die Ausführung planen wir sechs Wochen im Frühjahr 2027 ein. Während der Arbeiten bleibt das Haus bewohnbar; bei Regen schützen wir die offenen Flächen mit Planen. Die Zufahrt über den Kirchweg muss für Lieferungen frei bleiben."),
    ("p", "Gewährleistung: Auf die Eindeckung geben wir zehn Jahre, auf die Spenglerarbeiten fünf Jahre Gewährleistung. Schäden durch Sturm über 120 Kilometer pro Stunde sind ausgenommen."),
    ("p", "Zahlungsplan: 30 Prozent bei Auftragserteilung, 40 Prozent nach Fertigstellung der Lattung, 30 Prozent nach Abnahme. Die Rechnungen sind innerhalb von 14 Tagen ohne Abzug zahlbar."),
    ("p", "Wir würden uns freuen, den Auftrag für Sie auszuführen. Für Rückfragen erreichen Sie Herrn Johann Huber unter der oben genannten Nummer oder per E-Mail an office@huber-dach.example."),
    ("p", "Mit freundlichen Grüßen"),
    ("p", "Johann Huber, Geschäftsführer"),
]


def brief_html() -> str:
    parts = []
    for kind, text in BRIEF:
        parts.append(f"<h2>{text}</h2>" if kind == "h" else f"<p>{text}</p>")
    return f"""<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Angebot</title><style>
@page {{ size: A4; margin: 25mm 25mm 25mm 25mm; }} body {{ font: 12pt/1.5 "Liberation Serif", serif; }}
h2 {{ font: bold 13pt "Liberation Sans", sans-serif; margin: 5mm 0 3mm; }} p {{ margin: 0 0 3mm; }}
</style></head><body>{''.join(parts)}</body></html>"""


def degrade(page_img: Image.Image, dpi: int, noise: float, blur: float, angle: float, quality: int, shade: float, rng: random.Random) -> Image.Image:
    img = page_img.convert("L")
    w, h = img.size
    scale = dpi / 300
    img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    if shade:
        grad = Image.linear_gradient("L").resize(img.size).rotate(90, expand=False)
        img = Image.blend(img, Image.eval(grad, lambda v: 255 - int(v * shade)), 0.25)
    if angle:
        img = img.rotate(angle, resample=Image.BICUBIC, expand=False, fillcolor=255)
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    if noise:
        import numpy as np

        arr = np.asarray(img, dtype=np.float32)
        arr = arr + np.random.default_rng(rng.randint(0, 2**31)).normal(0, noise, arr.shape)
        img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return Image.open(io.BytesIO(buf.getvalue()))


SCANS = {
    # name: dpi, noise sigma, blur radius, skew degrees, JPEG quality, shading
    "300": (300, 6, 0.4, 0.4, 85, 0.0),
    "200": (200, 14, 0.7, 1.2, 60, 0.3),
    "150": (150, 22, 1.0, 2.2, 40, 0.5),
}


def write(path: Path, html: str, **options) -> None:
    weasyprint.HTML(string=html).write_pdf(path, pdf_identifier=path.stem.encode().ljust(16, b"0")[:32], **options)


def main(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    import base64

    photo = "data:image/png;base64," + base64.b64encode(photo_png()).decode()
    write(out / "bericht.pdf", bericht_html(photo))
    write(out / "bericht-getaggt.pdf", bericht_html(photo), pdf_variant="pdf/ua-1")
    write(out / "grenze-zweispaltig.pdf", ZWEISPALTIG)
    write(out / "grenze-tabelle.pdf", TABELLE)
    write(out / "grenze-formular.pdf", FORMULAR, pdf_forms=True)
    write(out / "grenze-silben.pdf", SILBEN)
    write(out / "grenze-diagramm.pdf", DIAGRAMM)
    write(out / "grenze-ueberschriften.pdf", UEBERSCHRIFTEN)

    clean = weasyprint.HTML(string=brief_html()).write_pdf()
    doc = pdfium.PdfDocument(clean)
    pages = [doc[i].render(scale=300 / 72, grayscale=True).to_pil() for i in range(len(doc))]
    truth = "\n".join(text for _kind, text in BRIEF)
    (out / "scan-grundwahrheit.txt").write_text(truth + "\n", "utf-8")
    params = {}
    for name, (dpi, noise, blur, angle, quality, shade) in SCANS.items():
        rng = random.Random(int(name))
        imgs = [degrade(p, dpi, noise, blur, angle * (1 if i % 2 == 0 else -1), quality, shade, rng) for i, p in enumerate(pages)]
        imgs[0].save(out / f"scan-{name}.pdf", "PDF", resolution=dpi, save_all=True, append_images=imgs[1:])
        params[f"scan-{name}.pdf"] = {"dpi": dpi, "rauschen_sigma": noise, "unschaerfe_radius_px": blur, "schraeglage_grad": angle, "jpeg_qualitaet": quality, "schattierung": shade, "seiten": len(imgs)}
    (out / "scan-parameter.json").write_text(json.dumps(params, indent=2, ensure_ascii=False) + "\n", "utf-8")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "testdaten-out"))
