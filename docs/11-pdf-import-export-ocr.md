# 11 – PDF-Export, PDF-Import und OCR (P9)

**Stand:** 13.10.2026 · **Paket:** P9 · **Code:** [`dienst/`](../dienst/README.md), Kern-Adapter
`kern/src/pdf/` · **Belege:** [`docs/belege/P9/`](belege/P9/README.md)

Dieses Dokument beschreibt die Brücke zwischen hpro und PDF: was der Dienst tut, was gemessen
wurde und — ausdrücklich — wo die Umwandlung aus PDF misslingt.

---

## 1. Einordnung

PDF ist für hpro eine **Ausgabe und eine Quelle, nicht die Grundlage**
([10, Abschnitt 3](10-anspruch-und-funktionsprofil.md), Punkte 1–3). Daraus folgen drei Regeln, die
der Dienst einhält:

1. **Dienst ist Zusatz, nie Bedingung.** Ein Container bleibt ohne den Dienst lesbar, bearbeitbar,
   prüfbar und signierbar. Der Dienst wird nur für Export, Import und Texterkennung gebraucht. Er
   läuft auf Abruf (`python -m hpro_dienst serve` oder einzelne Kommandozeilenaufrufe), bindet
   standardmäßig `127.0.0.1` und speichert nichts.
2. **Daten verlassen das Gerät sichtbar.** Der Kern kennzeichnet jeden Dienst als
   `remote-service` (Standard) oder `local-sidecar` ([06, Abschnitt 1.1](06-plattform-und-funktionsmatrix.md)).
   Abschnitte mit `no-export` entfernt der **Kern**, bevor ein Container zum Dienst geht
   (HP-LOCK-004, `pdf.exportView`); der Dienst wendet die Sperren zur Sicherheit noch einmal an.
3. **Seiten nur am Ende.** Der Export leitet das PDF aus der fließenden Fassung ab (wie der
   Druckweg aus P18); der Import erzeugt ein fließendes Dokument ohne Seitenbezug und legt das
   Original unter `original/` ab (HP-META-005, GoBD Rz. 135).

| Aufgabe | Werkzeug (Version) | Lizenz | Kern-Adapter | Kommandozeile |
| --- | --- | --- | --- | --- |
| Export Container → PDF | WeasyPrint 70.0, Prüfung veraPDF 1.30.3 | BSD-3 / GPLv3+ bzw. MPLv2+ | `RemoteWeasyPrint` (`PdfExport`) | `hpro pdf export` |
| Import PDF → Container | Docling 2.138.0 (Layoutmodell, Lesereihenfolge, TableFormer) | MIT | `RemoteDocling` (`PdfImport`) + `pdf.importToDocument` | `hpro pdf import` |
| OCR | Tesseract 5.5.0, Modelle `deu`, `eng` (tessdata 4.1.0) | Apache-2.0 | `RemoteTesseractOcr` (`Ocr`) | `hpro pdf ocr` |

Aufteilung der Arbeit: Der Dienst liefert beim Import **Strukturblöcke** (Überschrift mit Ebene,
Absatz, Liste, Tabelle mit Zellen und Spannen, Abbildung, Fußnote …) samt Warnungen; das XHTML
schreibt der **Kern** (`kern/src/pdf/import-map.ts`). So stehen die Regeln des Formats (stabile
Adressen, Sprachangabe, Tabellenköpfe, Alternativtexte) an einer Stelle und gelten für jeden
Konverter, nicht nur für Docling.

---

## 2. Export: Container → PDF/A + PDF/UA

### 2.1 Ableitung

Der Dienst baut aus allen Inhaltsdokumenten der Lesereihenfolge (oder einer eingefrorenen Fassung,
`--rendition`) ein Dokument und lässt es von WeasyPrint setzen. Die Regeln entsprechen dem Druckweg
der Spezifikation (Teil 0, Abschnitt 13) und Zusage 6:

- Titelblock mit Titel, Kennung, `dateModified` und Fassung; Verzeichnis mit Kennung und
  Seitenzahl aus dem echten Umbruch (`target-counter`);
- Kopfzeile (Titel, Stand), Fußzeile „Seite n von N“, Kennung `#…` hinter h1–h3, interne Verweise
  als „(S. n, #kennung)“, externe mit URL;
- Video als Standbild, Ton als Beschreibung, Komponenten als statisches Äquivalent, Animationen
  im Zustand „reduzierte Bewegung“, jeweils mit „Lebendige Fassung: …“;
- `details` offen, Formulare als Text mit ihren Werten, kein Skript, kein Netz (der URL-Abrufer
  liefert nur Container-Einträge und `data:`);
- Sperren: `no-export`/`no-print` durch den Hinweis des Kerns ersetzt, `hidden` entfällt mit
  Hinweis, versiegelte Abschnitte bleiben Platzhalter;
- zu lange Codezeilen mit „↩“ umbrochen, zu breite Tabellen in zwei Stufen kleiner gesetzt
  (gemessen am gesetzten Ergebnis).

Stufen: PDF/A-2a/-2u/-2b, PDF/A-3a/-3u/-3b, PDF/UA-1, PDF/UA-2. Standard ist **PDF/A-2a + PDF/UA-1**;
die PDF/UA-1-Kennung wird als XMP-Erweiterungsschema in das PDF/A eingetragen. PDF/A-3 kann den
Container als Anhang tragen (`AFRelationship /Source`, Muster ZUGFeRD; „Hybrid“). Unzulässige
Kombinationen (PDF/UA-2 = PDF 2.0 mit PDF/A-2/-3 = PDF 1.7) lehnt der Dienst mit 422 ab.
**Jede verlangte Stufe wird mit veraPDF geprüft**, das Ergebnis geht mit dem PDF zurück; die
Kommandozeile endet mit Exit 1, wenn eine Stufe nicht besteht.

### 2.2 Was am Satz für PDF/UA-1 angepasst wird

WeasyPrint erzeugt Tags, aber nicht in jedem Fall regelkonform. Die ersten Läufe dieses Pakets
zeigten drei Fehlerbilder (veraPDF, Belege der Vorfassung in der Git-Historie von
`docs/belege/P9/02-verapdf.txt`); die Ableitung gleicht sie jetzt aus:

| Fehlerbild (ISO 14289-1) | Ursache in WeasyPrint 70 | Ausgleich in der Ableitung |
| --- | --- | --- |
| 7.1-3: Inhalt weder getaggt noch Artefakt (9×, `antrag`) | `opacity < 1` wird als Transparenzgruppe (Form-XObject) gezeichnet; die MCIDs darin verweist der Strukturbaum ohne `/Stm` auf den Seiteninhalt | Deckkraft wird nach dem Layout als Alphawert der Farben gesetzt; Bilder darin bleiben deckend (Hinweis im Bericht) |
| 7.3-1: `Figure` ohne Alternativtext (`s7-buero`) | ein Zierbild (`alt=""`) wird immer als `Figure` getaggt | Zierbilder werden als Hintergrund gesetzt; WeasyPrint zeichnet Hintergründe als Artefakt |
| 7.2-20: `LI` enthält `P` (`s7-buero`, Endnoten) | Absatz direkt im Listenpunkt wird `P` unter `LI` | Absätze im Listenpunkt werden zu Spans mit Zeilenumbruch |

Nebenbei behoben: WeasyPrint wertet `ol@start` und `li@value` nicht aus; die Nummerierung
„4., 5.“ einer fortgesetzten Liste stand als „1., 2.“ im PDF. Die Ableitung setzt jetzt die Zähler.

### 2.3 Ergebnis

Sieben Container aus dem Projekt (Druckbeispiel, Sperren, lebendige Inhalte, Beispiel,
Kostenschätzung, Formular, Büro-Import aus S7), dazu die eingefrorene Fassung und der Hybrid.
Prüfung zweimal: im Dienst und danach unabhängig mit veraPDF auf der Kommandozeile.

ERGEBNISTABELLE_EXPORT

### 2.4 Grenzen des Exports

- **Erscheinung ist nicht die des Bildschirms.** Das PDF ist eine abgeleitete Ausgabe nach den
  Druckregeln; Animation, Video und Interaktion erscheinen als Standbild mit Verweis.
- **CSS-Abdeckung von WeasyPrint.** Grid, Flex und Floats in Mehrspaltensatz setzt WeasyPrint
  nicht immer wie ein Browser (beim Erzeugen der Prüf-PDF selbst beobachtet: ein Float in
  `columns` wurde abgeschnitten). Was über den Satzspiegel ragt, meldet der Bericht (`overflow`).
- **Deckkraft:** halbtransparente Bilder werden deckend (siehe 2.2).
- **PDF/UA ist maschinell nur teilweise prüfbar.** veraPDF prüft die maschinenprüfbaren Regeln
  (Matterhorn-Protokoll); ob Alternativtexte zutreffen und die Lesereihenfolge sinnvoll ist, bleibt
  menschliches Urteil — **nicht geprüft**.
- **Signatur:** ein PAdES-signiertes PDF erzeugt der Dienst nicht; das bleibt dem Signaturweg
  (P3/P10) überlassen — **nicht Teil von P9**.

---

## 3. Import: PDF → Container

### 3.1 Weg

1. Der Dienst liest, was das PDF selbst erklärt (Tags, `/Lang`, Titel, Formularfelder,
   Signaturfelder, JavaScript, Anmerkungen, Verknüpfungen, Lesezeichen, Verschlüsselung).
2. Docling bestimmt aus dem Seitenbild Layout, Lesereihenfolge und Tabellenstruktur; Seiten ohne
   Textebene gehen durch Tesseract (`ocr=auto`).
3. Abbildungen werden aus dem Seitenbild geschnitten (144 dpi), Kopf- und Fußzeilen entfernt.
4. Für jede Annahme, die der Dienst kennt, entsteht eine **Warnung** mit Code (`untagged-pdf`,
   `reading-order-guessed`, `table-structure-guessed`, `images-rerendered`, `alt-text-missing`,
   `headings-flat`, `page-furniture-removed`, `form-fields-not-converted`,
   `signature-not-transferable`, `javascript-dropped`, `annotations-dropped`, `links-dropped`,
   `ocr-used`, `text-missing`, `partial-conversion`, `tags-not-used`).
5. Der Kern schreibt das Dokument: ein Inhaltsdokument, Abschnitte mit Kennung aus dem
   Überschriftentext (deterministisch, eindeutig), Überschriften, Tabellen und Code mit eigener
   `id`, Tabellen nach dem Zellraster (Lücken bleiben leere Zellen, Spannen bleiben Spannen),
   `th` nur wo der Dienst Kopfzellen erkannt hat, Abbildungen mit Bildunterschrift als
   Alternativtext (sonst Platzhalter mit Warnung), Fußnoten als `aside role="doc-footnote"`, das
   Original unter `original/`, `manifest.json#source` mit Werkzeug und Datum. Gleiches PDF ergibt
   dieselbe Dokumentkennung (UUIDv8 aus SHA-256).

### 3.2 Ergebnis

ERGEBNIS_IMPORT

### 3.3 Laufzeit

Auf dem Testrechner (Intel N100, seit 13.10.2026 ohne Turbo auf 800 MHz begrenzt) braucht Docling
LAUFZEIT_IMPORT. Der erste Aufruf nach dem Start lädt die Modelle. Für einen Schreibtischrechner
ist das brauchbar, für ein Telefon nicht — dort bleibt der Dienst-Weg ([06](06-plattform-und-funktionsmatrix.md), A2).

---

## 4. OCR: gescanntes PDF → durchsuchbares PDF

### 4.1 Verfahren

Jede Seite ohne Textebene wird mit 300 dpi gerastert und von Tesseract erkannt. Das durchsuchbare
PDF behält **jede Originalseite unverändert** und legt eine unsichtbare Textebene darüber
(Tesseracts Text-PDF, Schrift ohne Glyphen, Darstellungsmodus 3, auf die Seite skaliert). Der Scan
bleibt die sichtbare Wahrheit; die Textebene macht ihn nur durchsuchbar und kopierbar. Seiten, die
schon Text haben, werden nicht angefasst (`mode=auto`). Der Bericht nennt je Seite Wortzahl und
mittlere Konfidenz.

### 4.2 Messgrößen

Gemessen gegen eine bekannte Grundwahrheit (`docs/belege/P9/eingabe/scan-grundwahrheit.txt`):

- **CER** (Zeichenfehlerrate) = Levenshtein-Abstand der Zeichenfolgen / Länge der Referenz, nach
  Vereinheitlichung des Leerraums und NFC;
- **WER** (Wortfehlerrate) = Levenshtein-Abstand der Wortfolgen / Zahl der Referenzwörter;
- **Suchtrefferquote** = Anteil der verschiedenen Referenzwörter mit mindestens vier Buchstaben,
  die eine einfache Textsuche im PDF findet — das, was „durchsuchbar“ für Nutzer heißt.

Die Scans sind **synthetisch**: ein zweiseitiger Geschäftsbrief, gerendert und dann künstlich
verschlechtert (Auflösung, Rauschen, Unschärfe, Schräglage, JPEG-Qualität, Schatten;
`scan-parameter.json`, deterministisch). Das macht die Grundwahrheit exakt, sagt aber nichts über
echte Scanner, Handschrift, Stempel oder Faxe aus — **nicht geprüft**.

### 4.3 Ergebnis

ERGEBNIS_OCR

---

## 5. Grenzen des Imports: wo die Umwandlung misslingt

Ein PDF beschreibt, **wo** Zeichen auf einer Seite stehen, nicht **was** sie sind. Ohne Tags muss
jede Struktur aus dem Seitenbild erraten werden (Layoutrekonstruktion). Docling rät gut, aber es
rät. Die folgenden Fälle sind gezielt gebaut, damit das Raten sichtbar wird; jeder liegt mit
Quell-PDF, Container, erzeugtem XHTML und Bericht unter `docs/belege/P9/grenzen/`.

GRENZFAELLE

### 5.1 Was daraus folgt

GRENZEN_FOLGERUNG

---

## 6. Nicht geprüft

| Was | Grund |
| --- | --- |
| Reale PDF aus dem Zielmarkt (Behördenbescheide, Angebote, Pläne) | keine freigegebenen Beispieldateien im Projekt; der in [03, Abschnitt 6.4](03-konzept.md) vorgeschlagene Konvertierungstest mit 50–100 echten PDF steht aus |
| Auswertung vorhandener Tags (getaggtes PDF → Struktur aus dem Tag-Baum) | Docling 2.138 wertet Tags nicht aus; der Dienst meldet das (`tags-not-used`); eigener Tag-Leser nicht gebaut |
| AcroForm → hpro-Formular, XFA | nicht gebaut; Felder werden gemeldet, nicht übertragen (Abschnitt 5) |
| Menschliche PDF/UA-Prüfung (Matterhorn, nicht maschinenprüfbare Punkte) | kein Prüfer mit Screenreader in diesem Lauf |
| OCR echter Scans, Handschrift, andere Schriftsysteme | nur synthetische Scans mit Grundwahrheit; nur Modelle `deu` und `eng` installiert |
| Docling im Grundsatz auf Telefon/Browser | Python mit Torch; nur Dienst-Weg ([06](06-plattform-und-funktionsmatrix.md), A2) |

---

## 7. Belege

| Datei | Inhalt |
| --- | --- |
| [`00-werkzeuge.txt`](belege/P9/00-werkzeuge.txt) | Versionen, Rechner, Prüfsummen aller Eingaben, Scan-Parameter |
| [`01-export.txt`](belege/P9/01-export.txt) | Abnahme 1: Export über Kern-Adapter und Dienst, veraPDF im Dienst |
| [`02-verapdf.txt`](belege/P9/02-verapdf.txt) | Abnahme 1: unabhängige veraPDF-Prüfung jedes PDF, XML-Berichte in `verapdf/` |
| [`03-export-inhalt.txt`](belege/P9/03-export-inhalt.txt) | Inhalt der PDF (Sperren, lebendige Elemente, Seitenzahlen, Anhang des Hybrids), Seitenbilder in `seiten/` |
| [`04-import.txt`](belege/P9/04-import.txt) | Abnahme 2: Import, epubcheck, hpro-check, Textabdeckung |
| [`05-ocr.txt`](belege/P9/05-ocr.txt) | Abnahme 3: OCR mit CER/WER/Suchtrefferquote, Scan-Import mit epubcheck und Suche |
| [`06-grenzen.txt`](belege/P9/06-grenzen.txt) | Abnahme 4: Grenzfälle mit Warnungen, Textabdeckung, Formularwerten |
| [`07-dienst-protokoll.txt`](belege/P9/07-dienst-protokoll.txt) | Anfrageprotokoll des Dienstes |

Neu erzeugen: `scripts/belege-p9.sh` (alle Teile, auf dem Testrechner etwa eine Stunde) oder
`P9_TEILE="grenzen" scripts/belege-p9.sh` für einzelne Teile.
