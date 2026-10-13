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

| Container | Seiten | Stufen | veraPDF im Dienst | veraPDF Kommandozeile (Regeln verletzt) | Besonderheit |
| --- | ---: | --- | --- | --- | --- |
| `druck` | 13 | PDF/A-2a + PDF/UA-1 | bestanden | 0 / 0 | Video, Komponente, Animation als Standbild mit „Lebendige Fassung“; `no-print`-Abschnitt ersetzt; Code mit „↩“ |
| `sperren` | 3 | PDF/A-2a + PDF/UA-1 | bestanden | 0 / 0 | `no-export` und `hidden` ersetzt, Betrag „492.000,00“ nicht im PDF-Text, Siegel bleibt Platzhalter |
| `sperren`, Fassung `nachweis-2026-10-12` | 3 | PDF/A-2a + PDF/UA-1 | bestanden | 0 / 0 | eingefrorene Fassung, im Titelblock genannt |
| `lebendig` | 4 | PDF/A-2a + PDF/UA-1 | bestanden | 0 / 0 | vier lebendige Elemente, Ton als Beschreibung |
| `beispiel` | 6 | PDF/A-2a + PDF/UA-1 | bestanden | 0 / 0 | – |
| `kostenschaetzung` | 3 | PDF/A-2a + PDF/UA-1 | bestanden | 0 / 0 | Tabellenrechner: gespeicherte Werte |
| `antrag` | 5 | PDF/A-2a + PDF/UA-1 | bestanden | 0 / 0 | Formular als Text mit Werten; Deckkraft an 8 Stellen als Farbe |
| `s7-buero` (Büro-Import aus S7) | 3 | PDF/A-2a + PDF/UA-1 | bestanden | 0 / 0 | Zierbild als Artefakt, Endnote, fortgesetzte Nummerierung |
| `druck` als Hybrid | 13 | PDF/A-3a + PDF/UA-1 | bestanden | 0 / 0 | Container als Anhang (28 184 Bytes, `/AFRelationship /Source`) |

Gegenprobe: `--conformance PDF/A-2a,PDF/UA-2` endet mit Exit 2 und der Meldung des Dienstes.
Laufzeit je Export auf dem Testrechner (Intel N100 mit Turbo): 8–22 s einschließlich zweier
veraPDF-Läufe (zwei Läufe); auf 800 MHz begrenzt 43–109 s (Lauf vom Vormittag, Git-Historie).

**Abnahme 1 erfüllt:** Jeder der neun Exporte besteht PDF/A-2a bzw. -3a und PDF/UA-1 in beiden
Prüfungen ([`02-verapdf.txt`](belege/P9/02-verapdf.txt): 18 Profile, 0 verletzte Regeln).

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
   `ocr-used`, `text-missing`, `partial-conversion`, `tags-not-used`, `formula-not-recognized`).
5. Der Kern schreibt das Dokument: ein Inhaltsdokument, Abschnitte mit Kennung aus dem
   Überschriftentext (deterministisch, eindeutig), Überschriften, Tabellen und Code mit eigener
   `id`, Tabellen nach dem Zellraster (Lücken bleiben leere Zellen, Spannen bleiben Spannen),
   `th` nur wo der Dienst Kopfzellen erkannt hat, Abbildungen mit Bildunterschrift als
   Alternativtext (sonst Platzhalter mit Warnung), Fußnoten als `aside role="doc-footnote"`, das
   Original unter `original/`, `manifest.json#source` mit Werkzeug und Datum. Gleiches PDF ergibt
   dieselbe Dokumentkennung (UUIDv8 aus SHA-256).

### 3.2 Ergebnis

Eingabe: `bericht.pdf` (zwei Seiten, Fließtext, Foto mit Bildunterschrift, Liste, nummerierte
Liste, Tabelle mit Kopfzeile, Fußnote, Kopf- und Fußzeilen; ungetaggt) und dieselbe Datei getaggt
(`bericht-getaggt.pdf`).

| Prüfung | `bericht.pdf` | `bericht-getaggt.pdf` |
| --- | --- | --- |
| übernommen | 6 Überschriften, 4 Absätze, 1 Abbildung, 2 Listen, 1 Tabelle, 1 Fußnote | gleich |
| epubcheck 5.4.0 | 0 Fehler, 0 Warnungen | 0 Fehler, 0 Warnungen |
| hpro-check (Stufe Basis) | 0 Fehler, 1 Warnung (Tabelle ohne `caption`), 4 nicht geprüft (Browser-Regeln) → „unbestimmt“ | gleich |
| Textabdeckung (Wörter ≥ 4 Buchstaben der PDF-Textebene im Container) | 0,963 — es fehlen nur „Baubüro“, „Huber“, „Projekt“, „Seite“ aus den entfernten Kopf-/Fußzeilen | gleich |
| Bild | Foto als PNG aus dem Seitenbild, Bildunterschrift als `figcaption` und Alternativtext | gleich |
| Original | `original/bericht.pdf`, `manifest.json#source` | gleich, Warnung `tags-not-used` |

**Abnahme 2 erfüllt:** Das PDF mit Text und Bild wird zu einem Container, der epubcheck ohne
Meldung besteht ([`04-import.txt`](belege/P9/04-import.txt)).

Auch dieser gelungene Import ist nicht fehlerfrei — beide Fehler stehen im Beleg und sind
Beispiele für Abschnitt 5:

- Die Tabellenunterschrift („Tabelle 1: Kostenschätzung netto in Euro“, im Original `caption` über
  der Tabelle) ist mit dem Absatz **nach** der Tabelle zu einem Absatz verschmolzen, der jetzt
  **vor** der Tabelle steht; die Tabelle hat keine `caption` (daher die Warnung des Prüfers).
- Die hochgestellte Fußnotenmarke wird zu Text: „21 Prozent 1 . Über 18 Prozent …“; die Fußnote
  steht als `aside`, aber ohne Verweis.

Zwei Fehler der ersten Fassung sind behoben (Kern, `import-map.ts`): Überschriften in Abschnitten
hatten keine eigene `id` (hpro-check: 5 Fehler HPR-ADR-001, „Stufe Basis: nicht bestanden“), und in
der Summenzeile rückte der Betrag in die Spalte „Menge“, weil Positionen ohne erkannte Zelle
übersprungen statt als leere Zelle geschrieben wurden.

### 3.3 Laufzeit

Auf dem Testrechner (Intel N100, seit 13.10.2026 ohne Turbo auf 800 MHz begrenzt) braucht Docling
für den zweiseitigen Bericht 56–64 s (erster Aufruf, mit Laden der Modelle) bzw. 10–12 s (zweiter
Aufruf), für einseitige Grenzfälle 3–11 s (zwei Läufe mit Turbo). Auf 800 MHz begrenzt waren es 286 s bzw. 35 s und 20–76 s. Der erste Aufruf nach dem Start lädt die Modelle. Für einen Schreibtischrechner
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

Durchsuchbares PDF über den Dienst (`hpro pdf ocr`), Sprache `deu`:

| Scan | Verschlechterung | erkannte Seiten | mittlere Konfidenz | CER | WER | Suchtrefferquote | vorher |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 300 dpi | Rauschen σ 6, Schräglage 0,4°, JPEG 85 | 2 / 2 | 0,960 | **0,05 %** | 0,36 % | **1,000** | 0,0 |
| 200 dpi | σ 14, 1,2°, JPEG 60, Schatten 0,3 | 2 / 2 | 0,960 | **0,05 %** | 0,72 % | **1,000** | 0,0 |
| 150 dpi | σ 22, 2,2°, JPEG 40, Schatten 0,5 | 1 / 2 | 0,833 | 17,8 % | 28,9 % | 0,808 | 0,0 |
| 100 dpi | σ 30, 3,5°, JPEG 30, Schatten 0,6 | 2 / 2 (14 Wörter) | 0,214 | 98,0 % | 100 % | 0,000 | 0,0 |

„vorher“ ist die Suchtrefferquote der Textebene vor der OCR (der Scan hat keine). Bei 150 dpi
findet Tesseract auf Seite 2 kein einziges Wort (Ursache nicht weiter untersucht); bei 100 dpi
bleibt der Scan praktisch unlesbar. Die Konfidenz trennt die Fälle deutlich: Der Bericht meldet sie
je Seite, ein Werkzeug kann unter etwa 0,9 zur erneuten Erfassung raten.

Derselbe 200-dpi-Scan als Container (Import mit OCR): epubcheck 0 Meldungen, hpro-check 0 Fehler,
die Suche im Container findet alle drei Probebegriffe (`hpro lock search`), und der Text des
Containers liegt gegen die Grundwahrheit bei CER 0,68 %, WER 1,08 %, Suchtrefferquote 1,000. Der
Unterschied zum durchsuchbaren PDF (0,05 %) kommt aus Lesereihenfolge und Absatzbildung des
Layoutmodells, nicht aus der Erkennung.

**Abnahme 3 erfüllt:** Der Scan wird durchsuchbar; Qualität als CER, WER und Suchtrefferquote
gegen eine Grundwahrheit ([`05-ocr.txt`](belege/P9/05-ocr.txt)).

---

## 5. Grenzen des Imports: wo die Umwandlung misslingt

Ein PDF beschreibt, **wo** Zeichen auf einer Seite stehen, nicht **was** sie sind. Ohne Tags muss
jede Struktur aus dem Seitenbild erraten werden (Layoutrekonstruktion). Docling rät gut, aber es
rät. Die folgenden Fälle sind gezielt gebaut, damit das Raten sichtbar wird; jeder liegt mit
Quell-PDF, Container, erzeugtem XHTML und Bericht unter `docs/belege/P9/grenzen/`.

Übersicht (Messung: [`06-grenzen.txt`](belege/P9/06-grenzen.txt); „Textabdeckung“ = Anteil der
Wörter mit mindestens vier Buchstaben aus der **Textebene des PDF**, die im Container stehen):

| Fall | Was misslingt | Textabdeckung | Warnung des Dienstes |
| --- | --- | ---: | --- |
| zweispaltig mit Kasten und Randnotiz | Absatz am Spaltenwechsel zerrissen, Kasten verliert seine Form, Randnotiz landet im falschen Abschnitt | 1,000 | nur die allgemeine (`reading-order-guessed`) |
| Tabelle ohne Linien, verbundene Zellen, zweizeiliger Kopf | zwei Zeilen zu einer verschmolzen, zweite Kopfzeile im Tabellenkörper | 1,000 | `table-structure-guessed` |
| Formular (AcroForm) | **alle Feldwerte verloren**, Ankreuzstatus verloren, kein Formular | 1,000 (Werte stehen nicht in der Textebene) | `form-fields-not-converted` |
| Silbentrennung, Formel, Fußnoten | **Formel verloren** (jetzt mit Hinweis statt leer), Fußnotenmarken als Text, keine Verweise | 1,000 | `formula-not-recognized` (seit diesem Lauf) |
| Vektordiagramm | Beschriftungen und Werte nur noch als Pixel | 0,643 | `images-rerendered` |
| Überschriften nur über Schriftgröße | **gelungen** (Gegenprobe) | 1,000 | keine |

Die Textabdeckung ist damit selbst eine Grenze: Sie misst nur, ob Wörter **ankommen**, nicht ob sie
am richtigen Ort und in der richtigen Rolle ankommen, und sie sieht keine Formularwerte und keine
Formeln ohne lange Wörter. Deshalb steht neben jeder Zahl das erzeugte XHTML im Beleg.

#### Fall 1: zwei Spalten, Kasten, Randnotiz (`grenze-zweispaltig.pdf`)

Original: ein Mitteilungsblatt in zwei Spalten. Der erste Absatz endet in Spalte 1, ein grauer
Kasten „Wichtige Termine“ mit zwei Zeilen folgt; der Absatz „Der Winterdienst …“ beginnt unten in
Spalte 1 und läuft mitten im Satz in Spalte 2 weiter („Bitte stellen Sie | Fahrzeuge so ab“).
Daneben, im rechten Rand, eine Randnotiz zum Winterdienst.

Ergebnis (`grenzen/grenze-zweispaltig-index.xhtml`):

```html
<p>Kasten: Wichtige Termine</p>
<p>12. November: Gemeinderatssitzung 3. Dezember: Adventmarkt</p>
<p>Der Winterdienst beginnt am 15. November. Bitte stellen Sie</p>
<p>Fahrzeuge so ab, dass die Räumfahrzeuge durchfahren können. …</p>
…
<section id="bauarbeiten"> …
  <p>Fragen beantwortet das Bauamt unter der Durchwahl 21.</p>
  <p>Randnotiz: Parkplätze beim Feuerwehrhaus nutzen.</p>
```

- Die Spaltenfolge stimmt, aber der Absatz ist am Spaltenwechsel in **zwei Absätze zerrissen** —
  mitten im Satz.
- Der Kasten ist kein Kasten mehr: Titel und Einträge sind gewöhnliche Absätze, die zwei Termine
  stehen in **einer** Zeile.
- Die Randnotiz steht am Ende des Abschnitts **„Bauarbeiten“**, zu dem sie nicht gehört.
- Im ersten Versuch (Generator mit Float, Git-Historie) machte Docling aus dem Kasten eine
  Überschrift h3 und hängte den Winterdienst-Absatz als dessen Unterabschnitt ein — die Gliederung
  war falsch.

#### Fall 2: Tabelle ohne Linien mit verbundenen Zellen (`grenze-tabelle.pdf`)

Original: Leistungsverzeichnis, Kopf über zwei Zeilen („Firma Huber“ über „EP €“ und „GP €“,
„Pos.“ und „Leistung“ über beide Kopfzeilen), Position 03 über zwei Zeilen („Lattung“,
„Unterdach“) mit über beide Zeilen verbundenen Preisen der Firma Gruber, Summenzeile mit Lücken.

Ergebnis:

```html
<tr><td></td><td></td><th scope="col">EP €</th><th scope="col">GP €</th>…</tr>      <!-- im tbody -->
<tr><td>03</td><td>Lattung Unterdach</td><td>21,50 26,70</td><td>3.053,00 3.791,40</td><td>47,00</td><td>6.674,00</td></tr>
<tr><td colspan="2">Summe netto</td><td></td><td>28.589,60</td><td></td><td>27.942,00</td></tr>
```

- Die zwei Zeilen der Position 03 sind **zu einer verschmolzen**; in einer Zelle stehen jetzt zwei
  Preise („21,50 26,70“). Wer mit der Tabelle rechnet (Zusage 7), rechnet falsch.
- Die zweite Kopfzeile steht im Tabellenkörper; „Pos.“ und „Leistung“ verlieren ihr `rowspan`.
- Die Summenzeile ist richtig — erst seit der Korrektur des Kerns (Zellraster mit leeren Zellen);
  vorher stand die Summe unter „EP €“.
- Formeln gibt es im PDF nicht: Summen kommen als Zahl an, nie als Rechnung.

#### Fall 3: Formular (`grenze-formular.pdf`)

Original: AcroForm mit drei ausgefüllten Textfeldern („Maria Beispiel“, „Dorfstraße 12, 6020
Innsbruck“, „8.000,00“), einem angekreuzten und einem leeren Kästchen, Unterschriftslinie.

Ergebnis:

```html
<p>Name der Antragstellerin</p>
<p>Adresse des Objekts</p>
<p>Beantragter Betrag in Euro</p>
<p>vl</p>
<p>Die Sanierung umfasst eine Wärmedämmung.</p>
<p>Das Gebäude steht unter Denkmalschutz.</p>
```

- **Alle drei Werte fehlen** (Auswertung `formularwerte`: `im_container: false` für alle drei),
  obwohl sie auf der Seite sichtbar sind: Docling liest die Erscheinung der Felder nicht.
- Welches Kästchen angekreuzt war, ist verloren; aus dem Häkchen wurde der Absatz „vl“.
- Es entsteht kein hpro-Formular. Der Dienst warnt (`form-fields-not-converted`), das Original
  liegt unter `original/` — die Daten sind nur dort.

#### Fall 4: Silbentrennung, Formel, Fußnoten (`grenze-silben.pdf`)

Original: Blocksatz mit automatischer Silbentrennung, eine Formel
`U = 1 / (R_si + Σ d_i/λ_i + R_se) ≈ 0,18 W/(m²·K)` mit Tief- und Sonderzeichen, zwei hochgestellte
Fußnotenmarken, Fußnoten am Seitenende.

Ergebnis:

```html
<p>… der einzelnen Schichten 1 . Bei Steildachkonstruktionen … zu berücksichtigen 2 .</p>
<p class="hp-formel hp-import-luecke">[Formel nicht als Text übernommen; siehe original/grenze-silben.pdf, Seite 1]</p>
<aside id="fn-1" role="doc-footnote" epub:type="footnote"><p>1 ÖNORM EN ISO 6946.</p></aside>
```

- Die Silbentrennung ist **gelungen** aufgelöst (alle getrennten Wörter ganz, Textabdeckung 1,0).
- Die **Formel ist verloren** — Docling erkennt den Block als Formel, liefert aber keinen Text
  (`do_formula_enrichment` ist in Docling standardmäßig aus und braucht ein weiteres Modell; nicht
  geprüft). Im ersten Lauf stand stumm ein leerer Absatz im Dokument. Jetzt meldet der Dienst
  `formula-not-recognized`, und der Kern setzt einen sichtbaren Hinweis auf Original und Seite —
  die Formel selbst bleibt verloren.
- Fußnotenmarken werden zu „ 1 .“ im Fließtext, die Fußnoten haben keinen Rückverweis.

#### Fall 5: Vektordiagramm (`grenze-diagramm.pdf`)

Original: Balkendiagramm als Vektorgrafik mit Beschriftung (Eindeckung, Lattung, Spengler,
Abtragen, Gerüst) und Werten (14.400 … 3.200), darunter die Bildunterschrift.

Ergebnis: ein PNG, aus dem Seitenbild geschnitten, mit der Bildunterschrift als Alternativtext.
Die Wörter „Abtragen“, „Eindeckung“, „Gerüst“, „Lattung“, „Spengler“ und alle Werte sind **nicht
mehr als Text** im Dokument (Textabdeckung 0,643). Eine Vorleseanwendung liest nur „Abbildung 2:
Kosten je Gewerk“, die Zahlen sind weder durchsuchbar noch auswertbar.

#### Fall 6: Überschriften nur über die Schriftgröße (`grenze-ueberschriften.pdf`) — Gegenprobe

Original: keine echten Überschriften, keine Nummerierung, keine Lesezeichen; „Überschriften“ sind
fett gesetzte Absätze in drei Größen. Ergebnis: h1–h3 in der richtigen Verschachtelung. Docling
erkennt Stufen über die Schriftgröße zuverlässig, solange die Größen deutlich verschieden sind.
Ein Fehlschlag wurde hier erwartet und **nicht** beobachtet; der Fall bleibt als Gegenprobe im
Beleg. Sind alle Überschriften gleich groß, meldet der Dienst `headings-flat`.

### 5.1 Was daraus folgt

1. **Ein importiertes Dokument ist ein Entwurf, kein Ersatz des Originals.** Darum bleibt das
   Original im Container (`original/`), und `manifest.json#source` sagt, womit umgewandelt wurde.
2. **Was der Dienst weiß, sagt er** (Warnungen mit Code). Was er nicht weiß — zerrissene Absätze,
   verschobene Randnotizen, verschmolzene Tabellenzeilen —, meldet er nur pauschal
   (`reading-order-guessed`, `table-structure-guessed`). Ein Bearbeiter muss die Warnungen neben
   dem Original zeigen (Aufgabe für Editor/S5).
3. **Formulare, Formeln und Diagramme brauchen eigene Wege.** AcroForm-Werte lassen sich direkt
   aus dem PDF lesen (`/V`), ohne Layoutmodell — das ist der nächste Schritt für Formulare
   ([03, Abschnitt 4.1](03-konzept.md), offene Frage). Für Formeln und Diagramme hat Docling
   eigene, standardmäßig ausgeschaltete Schritte (`do_formula_enrichment`, `do_chart_extraction`);
   beide sind **nicht geprüft**. Für Vektordiagramme liegt die Beschriftung zudem als Text im PDF
   und ließe sich direkt lesen.
4. **Zahlen aus Tabellen nicht ungeprüft weiterrechnen.** Eine verschmolzene Zeile ergibt eine
   Zelle mit zwei Zahlen; der Tabellenrechner (P19) würde sie als Text behandeln. Importierte
   Tabellen kommen ohne Formeln an.
5. **Getaggte PDF werden heute nicht besser** übernommen als ungetaggte (`tags-not-used`); ein
   Leser für den Tag-Baum würde den Fall „gutes PDF/UA“ deutlich verbessern ([03, Abschnitt 4.1](03-konzept.md)).

**Abnahme 4 erfüllt:** Grenzen mit sechs Fällen, davon fünf mit misslungener Umwandlung, belegt
mit Eingabe, Ergebnis und Messung.

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

Neu erzeugen: `scripts/belege-p9.sh` (Eingaben und alle Teile; auf dem Testrechner mit Turbo
etwa 15 Minuten, auf 800 MHz begrenzt etwa 40 Minuten).
