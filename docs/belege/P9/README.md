# Belege P9 – PDF-Export, PDF-Import und OCR

Beschreibung, Messwerte und Grenzen: [`docs/11-pdf-import-export-ocr.md`](../../11-pdf-import-export-ocr.md).
Alle Dateien erzeugt `scripts/belege-p9.sh` (wörtliche Ausgaben der Befehle mit Exit-Code und
Laufzeit).
Das Skript erzeugt bei jedem Lauf auch die Eingaben neu, damit Eingaben und Ergebnisse zusammenpassen.

| Abnahmekriterium | Beleg |
| --- | --- |
| 1 Export: Container → PDF, besteht veraPDF | [`01-export.txt`](01-export.txt) (Prüfung im Dienst), [`02-verapdf.txt`](02-verapdf.txt) (unabhängige Prüfung, XML in `verapdf/`), [`03-export-inhalt.txt`](03-export-inhalt.txt), PDF in `export/`, Seitenbilder in `seiten/` |
| 2 Import: PDF mit Text und Bild → Container, besteht epubcheck | [`04-import.txt`](04-import.txt), Container und XHTML in `import/` |
| 3 OCR: Scan wird durchsuchbar, Qualität mit Messgröße | [`05-ocr.txt`](05-ocr.txt) (CER, WER, Suchtrefferquote je Scanqualität), Ergebnisse in `ocr/` |
| 4 Grenzen des Imports mit misslungenen Beispielen | [`06-grenzen.txt`](06-grenzen.txt), Container, XHTML und Berichte in `grenzen/`, Beschreibung in docs/11, Abschnitt 5 |

Weitere Dateien: [`00-werkzeuge.txt`](00-werkzeuge.txt) (Versionen, Rechner, Prüfsummen der
Eingaben), [`07-dienst-protokoll.txt`](07-dienst-protokoll.txt) (Anfragen an den Dienst),
`eingabe/` (alle Eingaben; die PDF und Scans erzeugt `dienst/testdaten/erzeugen.py` deterministisch,
die Container stammen aus `app/dist` und S7).
