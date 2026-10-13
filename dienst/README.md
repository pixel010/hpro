# hpro-Dienst – PDF-Export, PDF-Import und OCR (P9)

**Stand:** 13.10.2026 · **Beschreibung, Messwerte und Grenzen:** [`docs/11-pdf-import-export-ocr.md`](../docs/11-pdf-import-export-ocr.md)
· **Belege:** [`docs/belege/P9/`](../docs/belege/P9/README.md)

Selbst hostbarer Zusatzdienst für die Brücke zur PDF-Welt ([docs/10](../docs/10-anspruch-und-funktionsprofil.md),
Abschnitt 3, Punkte 2 und 3): Ein hpro-Container bleibt ohne diesen Dienst vollständig lesbar,
bearbeitbar und prüfbar; der Dienst wird nur für Export, Import und Texterkennung gebraucht.

| Aufgabe | Werkzeug | Ergebnis |
| --- | --- | --- |
| Export Container → PDF | WeasyPrint 70.0, Prüfung mit veraPDF 1.30.3 | PDF/A-2a + PDF/UA-1 (Standard), PDF/A-3a mit eingebettetem Container, PDF/UA-1/-2 allein; jede verlangte Stufe wird geprüft und das Ergebnis zurückgegeben |
| Import PDF → Struktur | Docling 2.138.0 (Layoutmodell, Lesereihenfolge, TableFormer) | Strukturblöcke; das XHTML schreibt der Kern (`pdf.importToDocument`) |
| OCR | Tesseract 5.5.0 (deu, eng) | durchsuchbares PDF (unsichtbare Textebene über den unveränderten Seiten); Text mit Wortboxen und Konfidenz |

## Einrichten und starten

```sh
dienst/setup-dienst.sh                                # venv (WeasyPrint, Docling, Torch CPU), Tesseract, Modelle – alles unter dienst/
prototyp/setup-tools.sh                               # JDK 21 und veraPDF (falls noch nicht vorhanden)
dienst/.venv/bin/python -m hpro_dienst status         # Versionen, Sprachen, Stufen
cd dienst && .venv/bin/python -m hpro_dienst serve --port 8790   # nur auf Abruf, bindet 127.0.0.1
```

Der Dienst ist kein Daemon: Er läuft, solange der Aufruf läuft, und speichert nichts (Anfragen im
Speicher und in einem temporären Verzeichnis, das danach gelöscht wird). Wer ihn außerhalb des
eigenen Rechners anbietet, entscheidet selbst über TLS und Zugriffsschutz; der Kern kennzeichnet
ihn dann als `remote-service` (Daten verlassen das Gerät).

## Schnittstelle

| Aufruf | Inhalt | Antwort (JSON) |
| --- | --- | --- |
| `GET /v1/status` | – | Name, Version, Stufen, Seitenformate, OCR-Sprachen, Werkzeugversionen |
| `POST /v1/export?conformance=PDF/A-2a,PDF/UA-1&pageSize=A4&embedContainer=0&rendition=<id>` | Container | `pdf` (Base64), `checks` (veraPDF je Stufe), `omitted`, `live`, `warnings`, `pages` |
| `POST /v1/import?ocr=auto\|force\|off&languages=de,en&fileName=x.pdf` | PDF | `blocks`, `warnings`, `pdf` (Tags, Formulare, Signaturfelder …), `engine`, `seconds` |
| `POST /v1/ocr/pdf?languages=de&mode=auto\|force&dpi=300` | PDF | `pdf` (Base64, durchsuchbar), `pages` (Wörter, Konfidenz, Text) |
| `POST /v1/ocr/image?languages=de&dpi=300` | PNG/JPEG/TIFF | `text`, `lines` mit Wörtern und Boxen, `meanConfidence` |

Fehler: 422 bei unbrauchbarer Eingabe oder unzulässiger Stufenkombination, 404 bei unbekanntem Pfad,
413 über 200 MiB. Anfragen werden nacheinander bearbeitet.

Kommandozeile ohne HTTP: `python -m hpro_dienst export|import|ocr …` (siehe `hpro_dienst/__main__.py`).
Aus dem Kern: `node kern/build/bin/hpro.js pdf export|import|ocr|status … --dienst http://127.0.0.1:8790`.

## Tests

```sh
npm run dienst:test                 # Python-Einheitstests (ohne Docling und veraPDF), Teil von npm test
node --test kern/build/test/pdf.test.js   # Kern: Abbildung, Exportsicht, Adapter, echter Dienst (Export + veraPDF, OCR)
scripts/belege-p9.sh                # alle Belege unter docs/belege/P9 (Docling-Läufe: auf dem Testrechner ca. 1 h)
```

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `hpro_dienst/container.py` | Container lesen (Grenzen gegen ZIP-Bomben, Pfadprüfung, Hash-Abgleich), Lesereihenfolge und Sperren je Fassung |
| `hpro_dienst/export.py` | Ableitung der Druckfassung (Sperren, lebendige Elemente, Verweise, Formulare, Code), WeasyPrint mit Messdurchgängen, PDF/UA-Kennung in PDF/A |
| `hpro_dienst/verapdf.py` | veraPDF-Aufruf und Auswertung des XML-Berichts |
| `hpro_dienst/pdfimport.py` | Docling-Aufruf, Strukturblöcke, Warnungen zu allem, was erraten oder verloren ist |
| `hpro_dienst/ocr.py` | Tesseract: Bild → Text mit Boxen; PDF → durchsuchbares PDF |
| `hpro_dienst/messung.py` | CER, WER, Suchtrefferquote |
| `hpro_dienst/server.py`, `__main__.py` | HTTP-Schnittstelle und Kommandozeile |
| `testdaten/erzeugen.py` | Prüf-PDF und synthetische Scans mit Grundwahrheit |
| `requirements-lock.txt` | genaue Paketstände der venv |
