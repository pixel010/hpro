# Belege S5 – Autorenweg: Dokumente erstellen und migrieren

**Stand:** 13.10.2026 · **Erzeugt mit:** [`scripts/belege-s5.sh`](../../../scripts/belege-s5.sh) (wörtliche Ausgaben mit
Exit-Code; ein Lauf dauert auf dem Testrechner, Intel N100 mit Turbo, rund 12 Minuten, davon 6 Minuten `npm test`)
**Beschreibung und Einordnung:** [`docs/12-autorenweg.md`](../../12-autorenweg.md) · **Code:** [`kern/src/author/`](../../../kern/src/author/),
[`kern/bin/hpro-author.ts`](../../../kern/bin/hpro-author.ts), Einheitstests [`kern/test/author.test.ts`](../../../kern/test/author.test.ts)
· **Eingaben:** [`eingabe/`](eingabe/) aus [`scripts/s5-quellen.py`](../../../scripts/s5-quellen.py) und LibreOffice 26.8;
Vorlagenbeispiele unter [`docs/spezifikation/beispiele/s5-vorlagen/`](../../spezifikation/beispiele/s5-vorlagen/)

Werkzeuge ([00-werkzeuge.txt](00-werkzeuge.txt)): Node 26.5.1, Python 3.13.5 (python-docx 1.2.0, Pillow 12.3.0, Docling 2.138.0),
LibreOffice 26.8.1.1, epubcheck 5.4.0 (Temurin 21), Chromium 156 (Playwright), Konformitätsprüfer `hpro-check` aus S3.

## Abnahmekriterien

| # | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| 1 | Aus einer Markdown-Quelle mit Vorlage entsteht ein konformes Dokument (Prüfbericht mit S3-Werkzeug) | **erfüllt:** Referenzbericht mit Vorlage `bericht`, Beispiele mit `brief`, `angebot` und der eigenen Vorlage `protokoll` aus Datei: `hpro-check` je **0 fatal, 0 Fehler, 0 Warnungen, 0 Hinweise** (Urteil „unbestimmt“ nur wegen der drei Rendering-Regeln und der Redaktionsliste, Rendering in Chromium gegengeprüft: [07](07-darstellung.txt)); epubcheck je 0/0/0/0; JSON-Prüfberichte in [berichte/](berichte/); zwei Läufe byteidentisch; Quelle ohne Pflichtfelder/-abschnitte wird abgelehnt (Exit 1) | [02-markdown-vorlage.txt](02-markdown-vorlage.txt), [berichte/md-*-pruefung.json](berichte/) |
| 2 | Ein Import aus Word und aus PDF erzeugt je ein Dokument, das epubcheck und den Konformitätsprüfer besteht | **erfüllt:** Word (LibreOffice-Export, Vorlage `frei` und `bericht`; Grenzfall aus der Normalvorlage von Word): je 0 Fehler, 0 Warnungen, epubcheck 0/0/0/0. PDF (getaggt, LibreOffice) über Docling: **0 Fehler**, 4 Warnungen (Soll: Überschriftenhierarchie, Tabelle ohne `caption`), epubcheck 0/0/0/0 | [03-word.txt](03-word.txt), [04-pdf.txt](04-pdf.txt) |
| 3 | Verluste beim Import sind gemessen und dokumentiert (Abschnitt, Tabelle, Bild, Fußnote) | **erfüllt:** Messung gegen eine Grundwahrheit je Kategorie für Markdown, Word, PDF und (Vergleich) ODF; Grenzfall-Dokument mit 29 Merkmalen, 29 wie erwartet behandelt, jeder Verlust gemeldet; Herkunft jedes Verlusts in docs/12, Abschnitt 7.3 | [05-messung.txt](05-messung.txt), [05-messung.json](05-messung.json), [06-grenzfaelle.txt](06-grenzfaelle.txt) |
| 4 | Belege unter docs/belege/S5/ | **erfüllt:** diese Dateien; `npm ci && npm test` Exit 0, 584/584 Tests | [09-npm-test.txt](09-npm-test.txt) |

## Verluste in Kürze ([05-messung.txt](05-messung.txt))

| Kategorie | Markdown | Word | PDF | ODF (S7-Konverter) |
|---|---|---|---|---|
| Abschnitt (gefunden · Ebene) | 8/8 · 8/8 | 8/8 · 8/8 | 8/8 · 0/8, 2 zusätzlich | 8/8 · 8/8 |
| Tabelle (Zellen · Kopf · Spannen · Beschriftung) | 33/33 · 7/7 · 0/2 · 2/2 | 33/33 · 7/7 · 2/2 · 2/2 | 33/33 · 7/7 · 1/2 · 1/2 | 33/33 · 7/7 · 2/2 · 2/2 |
| Bild (Datei · identisch · alt · Beschriftung) | 3/3 · 3/3 · 3/3 · 3/3 | 3/3 · 3/3 · 2/3 · 3/3 | 2/3 · 0/3 · 0/3 · 1/3 | 3/3 · 3/3 · 3/3 · 1/3 |
| Fußnote (Text · verknüpft) | 3/3 · 3/3 | 3/3 · 3/3 | 1/3 · 0/3 (2 als Fließtext) | 3/3 · 3/3 |
| Textabdeckung | 1,000 | 1,000 | 1,000 | 1,000 |

Markdown kann keine verbundenen Zellen ausdrücken; LibreOffice schreibt die Markierung „dekorativ“ nicht ins Word-Format
(daher alt 2/3); beim PDF rät Docling die Struktur (Ebenen, Beschriftungen als Überschriften, Fußnoten als Fließtext, Bilder
neu gerastert, Verknüpfungen nicht übernommen). Einzelheiten und Ursachen: [docs/12, Abschnitt 7](../../12-autorenweg.md).

## Dateien

| Datei | Inhalt |
|---|---|
| [00-werkzeuge.txt](00-werkzeuge.txt) | Versionen, Rechner, Prüfsummen aller Eingaben |
| [01-eingaben.txt](01-eingaben.txt) | Eingaben erzeugen, LibreOffice-Umwandlung, Aufbau der Word-Datei und des PDF |
| [02-markdown-vorlage.txt](02-markdown-vorlage.txt) | Abnahme 1: `hpro author vorlagen/neu/md`, Prüfer, epubcheck, Ablehnung, Byte-Vergleich, Manifest und XHTML |
| [03-word.txt](03-word.txt) | Abnahme 2: Word-Import (Referenz, Vorlage `bericht`, Grenzfall mit und ohne `--bild-auslassen`), Prüfer, epubcheck, XHTML |
| [04-pdf.txt](04-pdf.txt) | Abnahme 2: PDF-Import über den Dienst (Docling), Prüfer, epubcheck, XHTML |
| [05-messung.txt](05-messung.txt), [.json](05-messung.json) | Abnahme 3: Verlustmessung je Weg und Kategorie |
| [06-grenzfaelle.txt](06-grenzfaelle.txt), [.json](06-grenzfaelle.json) | Abnahme 3: 29 Merkmale des Grenzfall-Dokuments, Meldungen des Imports |
| [07-darstellung.txt](07-darstellung.txt) | Gegenprobe HPR-INH-004/006/022 in Chromium (320/768/1280 px, Variablen, reduzierte Bewegung) |
| [08-laufzeiten.txt](08-laufzeiten.txt) | Laufzeiten (Markdown ≈ 0,38 s, Word ≈ 0,43–0,53 s je Aufruf einschließlich Node-Start), Größen |
| [09-npm-test.txt](09-npm-test.txt) | `npm ci && npm test` |
| [eingabe/](eingabe/) | Referenz als ODF, Word, PDF, Markdown mit Bildern; Grundwahrheit; Grenzfall-Word-Datei mit Erwartung; unvollständiges Angebot |
| [container/](container/) | alle erzeugten Container |
| [berichte/](berichte/) | Importberichte (`*-import.json`: Inventar der Quelle, Geschriebenes, Meldungen) und Prüfberichte (`*-pruefung.json`, Teil 1, 4.3) |

## Nicht geprüft (mit Grund)

- **Word-Dateien aus Microsoft Word selbst:** kein Word verfügbar; geprüft sind LibreOffice 26.8 und python-docx (Normalvorlage von Word).
- **Diagramme, SmartArt, EMF/WMF-Umwandlung:** nur gemeldete Platzhalter bzw. Abbruch; keine Testdatei mit Diagramm.
- **Reale Dokumente aus dem Zielmarkt:** keine freigegebenen Beispieldateien (wie P9).
- **CommonMark-Vollständigkeit:** gelesen wird eine dokumentierte Teilmenge (docs/12, Abschnitt 3); keine Prüfung gegen die CommonMark-Testsuite.
- **Bedienoberfläche „Neu aus Vorlage“ im Reader:** nicht gebaut; Weg über Kommandozeile und Kern-API.
