# 12 – Autorenweg: Dokumente erstellen und migrieren (S5)

**Stand:** 13.10.2026 · **Paket:** S5 · **Code:** [`kern/src/author/`](../kern/src/author/),
Kommandozeile [`kern/bin/hpro-author.ts`](../kern/bin/hpro-author.ts) (`hpro author …`) ·
**Belege:** [`docs/belege/S5/`](belege/S5/README.md) · **Beantwortet:** offene Frage 5 aus
[docs/10](10-anspruch-und-funktionsprofil.md)

Ohne Autorenwerkzeug bleibt ein Standard leer. Dieses Dokument beschreibt die drei Wege zu einem
hpro-Dokument — **Markdown mit Vorlage**, **Import aus Word**, **Import aus PDF** — und misst, was auf
jedem Weg verloren geht.

---

## 1. Antwort auf Frage 5

> „Womit erstellt ein Autor solche Dokumente — hpro selbst, Word/InDesign mit Export, Markdown mit
> Vorlage?“

| Weg | Wofür | Was ankommt (gemessen, Abschnitt 6) | Einordnung |
| --- | --- | --- | --- |
| **Markdown mit Vorlage** (`hpro author md`) | neue Dokumente, Berichte aus Fachanwendungen, alles, was heute schon als Text entsteht | Abschnitte, Tabellen, Bilder, Fußnoten vollständig; nur verbundene Tabellenzellen kann Markdown nicht ausdrücken | **Hauptweg für neue Dokumente.** Die Vorlage liefert Kopf, Pflichtfelder, Pflichtabschnitte und Stylesheet |
| **Word** (`hpro author docx`) | vorhandene Dokumente aus Textverarbeitungen | alles, was über Formatvorlagen, Nummerierung und Tabellendefinition ausgedrückt ist; Verluste nur dort, wo die Quelle die Information nicht trägt | **Hauptweg für den Bestand.** Gut, wenn die Quelle mit Formatvorlagen geschrieben ist; direkt formatierte „Überschriften“ bleiben Absätze |
| **PDF** (`hpro author pdf` → P9-Dienst) | Altbestand ohne Quelldatei | Text vollständig, Struktur erraten: Ebenen falsch, Fußnoten als Fließtext, Bilder neu gerastert ohne Alternativtext, keine Verweise | **Entwurf, kein Ersatz.** Original bleibt unter `original/`; Nacharbeit ist nötig |

Ein eigener grafischer Editor ist nicht Teil dieses Pakets; der Reader kann seit P5 strukturiert
bearbeiten, und jedes hier erzeugte Dokument lässt sich dort weiterbearbeiten. Ein **Export aus**
Word oder LibreOffice heraus (Filter im Büroprogramm selbst) ist Paket S8; der Word-Leser dieses
Pakets ist dafür die Zuordnungsgrundlage.

Grundsätze aller drei Wege:

1. **Struktur nur aus der Quelle.** Überschriften, Listen und Tabellen kommen aus Markdown-Syntax
   bzw. aus Formatvorlagen, Gliederungsebenen, Nummerierung und Tabellendefinitionen, nie aus dem
   Aussehen (HP-MIN-003). Eine Vorlage fügt nur Titel und Kopfzeilen aus Feldern hinzu, die der
   Autor ausgefüllt hat.
2. **Was nicht ankommt, wird gemeldet** — mit Code, Kategorie und Schwere (`verlust`, `ersatz`,
   `hinweis`, bei Vorlagen `fehler`), auf der Kommandozeile und als JSON-Bericht (`--json`). Nichts
   wird stillschweigend verworfen; wo Inhalt fehlt, steht ein sichtbarer Platzhalter.
3. **Die Quelle bleibt im Container** (`original/`, `manifest.json#source`, HP-META-005), damit ein
   Import nie das Original ersetzt.
4. **Wiederholbar:** gleiche Quelle, gleiche Bytes (HP-CONT-014); Kennungen aus Textmarken bzw.
   `{#…}`, sonst deterministisch aus dem Text (HP-MIN-004).
5. **Kein Dienst für Markdown und Word.** Beide laufen im Kern (TypeScript, auch im Browser
   lauffähig); nur PDF braucht den Dienst aus P9 (Docling).

## 2. Werkzeug

```
hpro author vorlagen                                   Vorlagen mit Feldern und Pflichtabschnitten
hpro author neu <datei.md> [--vorlage NAME]            Markdown-Gerüst der Vorlage mit neuer Dokumentkennung
hpro author md <in.md> <out.hpro> [--vorlage NAME|VERZEICHNIS] [--feld k=v]… [--json bericht.json]
hpro author docx <in.docx> <out.hpro> [--vorlage …] [--bild-auslassen] [--feld k=v]… [--json …]
hpro author pdf <in.pdf> <out.hpro> --dienst URL [Optionen von hpro pdf import]
```

Rückgabecodes: 0 geschrieben, 1 Vorlage nicht erfüllt (nichts geschrieben), 2 Aufruf- oder
Eingabefehler (z. B. ein Bild im BMP-Format ohne `--bild-auslassen`). Weitere Optionen:
`--modified`, `--id`, `--no-original`. Im Kern: `author.readMarkdown`, `author.readDocx`,
`author.writeDocument`, `author.TEMPLATES`, `author.parseTemplate`; `createContainer` schreibt.
`manifest.json#subset` (Mindestprofil, HP-MIN-001) kann der Kern jetzt selbst setzen.

Aufbau im Kern: Leser (Markdown, Word) → gemeinsames Dokumentmodell
([`model.ts`](../kern/src/author/model.ts)) → Schreiber mit Vorlage
([`write.ts`](../kern/src/author/write.ts)). Der Schreiber setzt die Regeln des Mindestprofils an
einer Stelle um: `section` je Überschrift der obersten Ebene mit Kennung `s-<kennung>`,
Fußnoten als `a role="doc-noteref"` + `aside role="doc-footnote"` nach dem Block, Tabellen mit
`thead`/`th scope="col"`, Spannen, `caption`, gleich breiten Zeilen und `data-hp-table="scroll"`,
Bilder in `figure` unter `content/media/`, Verweise auf Kennungen, Seitenverweise mit dem Text des
Ziels (HP-MIN-005 … HP-MIN-009).

## 3. Markdown

Gelesen wird eine dokumentierte Teilmenge; alles andere wird gemeldet.

| Markdown | hpro | Hinweis |
| --- | --- | --- |
| Kopf `---` mit `titel`, `datum`, `kennung`, `autoren`, `sprache`, `beschreibung`, `vorlage` und Feldern der Vorlage | `manifest.json` (`name`, `dateModified`, `id`, `author`, `inLanguage`), Kopfzeilen der Vorlage | YAML-Teilmenge: `k: wert`, Anführungszeichen, `k: \|`-Blöcke, `- eintrag`-Listen, `[a, b]` |
| `# Titel` als erster Block | `h1` | mehrere `#` → Titel aus dem Kopf, alle Überschriften eine Ebene tiefer (Hinweis) |
| `##`, `###` …, auch Setext; `{#kennung}` | `section` + `h2`, `h3` …; Kennung aus `{#…}` | |
| Absatz, `*betont*`, `**stark**`, `` `code` ``, `H~2~O`, `m^2^`, harter Umbruch | `p`, `em`, `strong`, `code`, `sub`, `sup`, `br` | |
| `-`/`*`/`+`-Liste, `1.`-Liste (verschachtelt) | `ul`/`ol` mit `start`, Unterliste im `li` | |
| GFM-Tabelle, danach `Table: Beschriftung {#kennung}` | `table` mit `thead`, `caption` | **keine verbundenen Zellen** — Markdown kann sie nicht ausdrücken |
| `![Alternativtext](bild.png "Beschriftung"){#k .dekorativ}` | `figure` mit `img alt`, `figcaption`; `.dekorativ` → `alt=""` | nur relative Pfade im Quellverzeichnis; Netzbilder werden nicht geladen (HP-CONT-010) |
| `[^1]` + `[^1]: Text`, `^[Text]` | Fußnote | |
| `[Text](#kennung)`, `[Text](https://…)`, `<https://…>`, Referenzlinks | `a href` | `mailto:` nur als Text (HPR-MIN-010) |
| ```` ``` ````-Block, eingerückter Code | `pre` mit Kennung | |
| `> Zitat` | `blockquote` | |
| `::: zusammenfassung` … `:::` | `section data-hp-role="summary"` (HP-NEST-005) | verlässt das Mindestprofil |
| `::: details Kurztext` … `:::` | `details`/`summary` (HP-NEST-001) | verlässt das Mindestprofil |
| HTML-Block, HTML im Text, `---`-Trennlinie, `$Formel$`, `~~gestrichen~~` | Text ohne HTML; entfällt; `code`; CSS-Klasse | gemeldet als `verlust` bzw. `ersatz` — HTML kann Skripte enthalten (HP-INH-012) |

## 4. Vorlagen

| Vorlage | Pflichtfelder | Pflichtabschnitte | Kopf / Schluss | Ergebnis |
| --- | --- | --- | --- | --- |
| `frei` | Titel | – | – | Mindestprofil (Standard für Word) |
| `bericht` | Titel, Datum, Verfasser | Überblick „Zusammenfassung“ | „Stand …“, „Verfasst von …“, Auftraggeber, Geschäftszahl | Stufe Basis mit Überblick, `details` erlaubt |
| `brief` | Absender, Empfänger, Ort, Datum, Betreff | – | Adressen mit Zeilenumbruch, „Ort, Datum“; Gruß, Unterschrift | Mindestprofil, Betreff = Titel |
| `angebot` | Titel, Nummer, Datum, Anbieter, Kunde | Leistung, Positionen, Bedingungen | Nummer, Anbieter, Kunde, Gültigkeit | Mindestprofil |
| eigene Vorlage | frei definierbar | frei definierbar | frei definierbar | `vorlage.json` + `stil.css`, Beispiel [`protokoll/`](spezifikation/beispiele/s5-vorlagen/protokoll/) |

Jedes Stylesheet leitet Größe, Abstände und Farben aus den Lesesystem-Variablen `--hp-*` ab
(HP-INH-004), hält Tabellen, Abbildungen und Code zusammen und lässt Tabellenzellen umbrechen,
damit auch ohne Reader bei 320 px nichts waagrecht scrollt. Eigene Vorlagen werden beim Laden
geprüft: kein Setzen von `--hp-*` auf `:root`, kein `@import`, keine fremden URLs. Eine Quelle, die
ihre Vorlage nicht erfüllt, wird **nicht geschrieben** (Rückgabe 1, Meldung je fehlendem Feld und
Abschnitt).

**Abnahme 1 erfüllt** ([`02-markdown-vorlage.txt`](belege/S5/02-markdown-vorlage.txt), JSON-Berichte
in [`berichte/`](belege/S5/berichte/)): Der Referenzbericht in Markdown mit Vorlage `bericht` und die
Beispiele `brief`, `angebot` und `protokoll` (eigene Vorlage aus Datei) ergeben im
Konformitätsprüfer aus S3 je **0 Fehler, 0 Warnungen, 0 Hinweise**; epubcheck 5.4.0 meldet je
**0 fatals / 0 errors / 0 warnings / 0 infos**. Das Urteil „Stufe Basis: unbestimmt“ kommt allein
von den Regeln, für die der Prüfer eine Browser-Engine bräuchte (HPR-INH-004/006/022) und der
Redaktionsliste (HPR-LOCK-005); die drei Rendering-Regeln sind in Chromium gegengeprüft
(Abschnitt 8). Zwei Läufe ergeben dieselben Bytes (`cmp`, Exit 0). Ein Angebot ohne Pflichtfelder
und -abschnitte wird abgelehnt (Exit 1, vier Fehlermeldungen, keine Datei).

## 5. Word

Gelesen wird WordprocessingML (ECMA-376 Teil 1, Transitional) nach der OOXML-Spalte von Teil 0,
Tabelle 15.2:

| Word | hpro | Hinweis |
| --- | --- | --- |
| Vorlage „Titel“ (über `w:basedOn` aufgelöst) | `h1` | ohne Titelvorlage: Ebene 1 bleibt `h1` (Tabelle 15.2), siehe Abschnitt 7 |
| `w:outlineLvl` direkt oder in der Vorlagenkette, „heading N“ | `h<n+2>` mit Titel | eigene Vorlagen auf Basis „Überschrift 1“ werden Überschriften |
| `w:numPr` (direkt oder Vorlage), `numFmt` `bullet` / sonst | `ul` / `ol`, Ebenen verschachtelt, `start` bei fortgesetzter Zählung | „List Bullet 2“ … tragen ihre Ebene im Vorlagennamen; Zählart a/i geht verloren (gemeldet) |
| Zeichenvorlagen „Strong“, „Emphasis“, „HTML Code“; `w:vertAlign` | `strong`, `em`, `code`, `sup`/`sub` | |
| direkt fett / kursiv / unterstrichen | `span class="hp-fett"` … | keine Struktur aus dem Aussehen (HP-MIN-012) |
| Zitatvorlage, „HTML Preformatted“ | `blockquote`, `pre` | |
| `w:tbl`, `w:tblHeader`, `w:gridSpan`, `w:vMerge` | `table`, `thead`, `colspan`, `rowspan`; verschachtelte Tabelle in `td` | |
| Absatz mit `SEQ`-Feld (oder Vorlage „Beschriftung“) neben Tabelle/Bild | `caption` / `figcaption` | Zuordnung zum vorherigen, sonst nächsten Objekt |
| `w:drawing` mit `pic:pic`, `wp:docPr/@descr`, `adec:decorative` | `figure`, `img alt`, `alt=""` | PNG/JPEG/GIF/WebP/SVG; EMF/WMF/TIFF/BMP: Abbruch mit Nennung, `--bild-auslassen` → Platzhalter |
| `w:footnoteReference`, `w:endnoteReference` | Fußnote, Endnote | |
| `w:bookmarkStart` | Kennung | automatische Textmarken (`_Ref…`, LibreOffice `Ref_…_label_and_number`) nur als Verweisziel |
| Felder `REF`, `PAGEREF`, `HYPERLINK`, `w:hyperlink` | `a href="#…"`, Seitenverweis mit Zieltext, externe URL | `mailto:` als Text |
| `TOC`, `INDEX`; `PAGE` | entfällt (Navigationsdokument); entfällt | gemeldet |
| andere Felder (`DATE` …), Inhaltssteuerelemente | letztes Ergebnis als Text | gemeldet |
| Änderungsverfolgung | angenommener Stand | gemeldet |
| Kommentare | entfallen | gemeldet (`verlust`) |
| Formel (OMML) | linearer Text in `code`, z. B. `U=1/R` | gemeldet |
| Textfeld | Absätze nach dem Ankerabsatz | gemeldet |
| Diagramm, SmartArt, OLE-Objekt | sichtbarer Platzhalter | gemeldet (`verlust`) |
| Kopf- und Fußzeile | Text einmal als Absatz am Ende; Seitenzahlzeilen entfallen | Teil 5, Kapitel 4.7 |
| Seiten-/Abschnittsumbruch, ausgeblendeter Text | entfällt | gemeldet |

Kennung aus der Dokumenteigenschaft `hpro:id` (sonst `dc:identifier` als UUID-URN, sonst aus der
Datei abgeleitet), Datum aus `dcterms:modified`, Sprache aus `dc:language` oder den
Standardeinstellungen der Vorlagen.

**Abnahme 2 (Word) erfüllt** ([`03-word.txt`](belege/S5/03-word.txt)): Der Referenzbericht als
Word-Datei aus LibreOffice 26.8 (Vorlage `frei`, Mindestprofil), derselbe mit Vorlage `bericht`
und das Grenzfall-Dokument aus der Normalvorlage von Word ergeben je **0 Fehler, 0 Warnungen** im
Konformitätsprüfer und **0/0/0/0** in epubcheck. Ohne `--bild-auslassen` bricht der Grenzfall mit
Nennung des BMP-Bildes ab (Exit 2, HP-MIN-007). Zwei Läufe ergeben dieselben Bytes. Ohne Verfasser
in den Dokumenteigenschaften lehnt die Vorlage `bericht` ab (Exit 1); `--feld autoren=…` ergänzt ihn.

## 6. PDF

Der PDF-Weg ist der Import aus P9 ([docs/11](11-pdf-import-export-ocr.md)); `hpro author pdf` ruft
ihn auf. **Abnahme 2 (PDF) erfüllt** ([`04-pdf.txt`](belege/S5/04-pdf.txt)): Der Referenzbericht als
getaggtes PDF aus LibreOffice wird in 61 s (davon 58 s Docling) zu einem Container mit **0 Fehlern**
im Prüfer und **0/0/0/0** in epubcheck. Der Prüfer gibt 4 **Warnungen** (Soll-Anforderungen):
dreimal HPR-INH-010 (sechs `h1`, Sprünge h1→h4 und h2→h4, weil Docling Beschriftungen als
Überschriften liest) und einmal HPR-INH-011 (Tabelle ohne `caption`). Der Dienst meldet selbst:
Tags nicht genutzt, Tabellenstruktur erraten, Bilder neu gerastert, Alternativtext fehlt,
10 Verknüpfungen nicht übernommen.

## 7. Verluste, gemessen

### 7.1 Verfahren

Eine Quelle, vier Formen ([`scripts/s5-quellen.py`](../scripts/s5-quellen.py)): ein zweiseitiger
Prüfbericht als ODF-Textdokument mit Standardvorlagen (8 Überschriften in zwei Ebenen, eine
Tabelle 4×5 mit Kopfzeile, eine Tabelle 3×5 mit waagrecht und senkrecht verbundener Zelle, beide
mit Beschriftung, drei Bilder — Foto, Diagramm, dekorative Linie — mit Alternativtext und
Beschriftung, drei Fußnoten, zwei Listen, drei Querverweise, ein Link). LibreOffice 26.8 macht
daraus die Word-Datei und das getaggte PDF; die Markdown-Fassung ist von Hand gleichwertig
geschrieben. Die Grundwahrheit ([`erwartet.json`](belege/S5/eingabe/erwartet.json)) nennt jeden
Abschnitt, jede Zelle mit Zeile, Spalte und Spanne, jedes Bild und jede Fußnote.
[`scripts/s5-messung.mjs`](../scripts/s5-messung.mjs) liest jeden Container und vergleicht
(Text nach Vereinheitlichung des Leerraums exakt):

- **Abschnitt:** Überschrift mit gleichem Text, gleiche Ebene, Kennung, Reihenfolge;
- **Tabelle:** Zelle mit gleichem Text an gleicher Stelle im Raster, Kopfzellen als `th` in
  `thead`, Spannen, Beschriftung als `caption`;
- **Bild:** Datei vorhanden, Bilddaten identisch (SHA-256), Alternativtext, `figcaption`,
  dekoratives Bild mit `alt=""`;
- **Fußnote:** Notentext als `aside`/Endnote, mit Verweis verknüpft;
- dazu Textabdeckung (Anteil der Wörter mit mindestens vier Buchstaben, wie in P9).

Als Vergleich läuft der ODF-Referenzkonverter aus S7 auf die ODF-Quelle selbst.

### 7.2 Ergebnis ([`05-messung.txt`](belege/S5/05-messung.txt))

| | Markdown | Word | PDF | ODF (S7-Konverter) |
| --- | --- | --- | --- | --- |
| **Abschnitt**: gefunden / richtige Ebene | 8/8 · 8/8 | 8/8 · 8/8 | 8/8 · **0/8**, 2 zusätzliche | 8/8 · 8/8 |
| **Tabelle**: Zellen richtig | 33/33 | 33/33 | 33/33 | 33/33 |
| Kopfzellen | 7/7 | 7/7 | 7/7 | 7/7 |
| Spannen | **0/2** (Quelle kann es nicht) | 2/2 | **1/2** | 2/2 |
| Beschriftung | 2/2 | 2/2 | **1/2** | 2/2 |
| **Bild**: Datei | 3/3 | 3/3 | **2/3** | 3/3 |
| Bilddaten identisch | 3/3 | 3/3 | **0/3** (neu gerastert) | 3/3 |
| Alternativtext | 3/3 | **2/3** | **0/3** | 3/3 |
| Beschriftung | 3/3 | 3/3 | **1/3** | **1/3** |
| **Fußnote**: Notentext / verknüpft | 3/3 · 3/3 | 3/3 · 3/3 | **1/3 · 0/3**, 2 als Fließtext | 3/3 · 3/3 |
| Listen (Unterliste) | 2 (ja) | 2 (ja) | 2 (**nein**, 5 flache Einträge) | 2 (ja) |
| Querverweise mit Ziel / Link | 3/3 · 1/1 | 3/3 · 1/1 | **0/3 · 0/1** | **2/3** · 1/1 |
| Textabdeckung | 1,000 | 1,000 | 1,000 | 1,000 |

### 7.3 Woher jeder Verlust kommt

- **Markdown, Spannen 0/2:** keine Schwäche des Imports, sondern der Quelle — GFM-Tabellen kennen
  keine verbundenen Zellen; die Tabelle steht mit einer leeren Zelle und „Summe netto“ ohne
  Spanne da. Wer Spannen braucht, schreibt die Tabelle in Word oder ergänzt sie im Editor.
- **Word, Alternativtext 2/3:** die dekorative Linie. LibreOffice 26.8 schreibt die Markierung
  „dekorativ“ beim Word-Export nicht (`adec:decorative im Dokument: False` in
  [`01-eingaben.txt`](belege/S5/01-eingaben.txt)); der Import setzt den Bildnamen „Zierlinie“ als
  Alternativtext und meldet das (`bild-ohne-alternativtext`). Trägt die Word-Datei die Markierung,
  wird `alt=""` daraus (Grenzfall, Abschnitt 7.4). Verlust der Quelle, nicht des Imports.
- **PDF:** jeder Verlust ist ein Rateschritt von Docling (siehe auch [docs/11, Abschnitt 5](11-pdf-import-export-ocr.md)):
  Docling liefert alle Überschriften als eine Ebene und keinen Titel, also werden sie `h1`/`h2`;
  zwei Beschriftungen werden Überschriften (h4); die verbundene Zelle „Spengler“ wird nicht
  erkannt; die dekorative Linie entfällt, die zwei anderen Bilder kommen aus dem Seitenbild (keine
  Originaldaten, kein Alternativtext — einmal steht die Beschriftung als Alternativtext); zwei
  Fußnoten stehen als Absatz „1Messung …“ im Text, die dritte als `aside` ohne Verweis; die
  Unterliste wird flach; Querverweise und Link gehen verloren, weil P9 Verknüpfungen des PDF nicht
  überträgt (der Dienst meldet „10 Verknüpfung(en) … 0 übernommen“). Der Text kommt vollständig
  an. Dass das PDF getaggt ist, hilft heute nicht (`tags-not-used`).
- **ODF über den S7-Konverter, Beschriftung 1/3 und Verweis 2/3:** der Referenzkonverter erkennt
  Bildbeschriftungen nur in einem Rahmen mit Textfeld (so wie im S7-Beispiel), nicht als eigenen
  Absatz unter dem Bild; damit fehlt auch das Ziel des Verweises „Abbildung 1“. Offener Punkt für
  den Referenzkonverter, kein Teil dieses Pakets.

### 7.4 Grenzfälle des Word-Imports ([`06-grenzfaelle.txt`](belege/S5/06-grenzfaelle.txt))

Ein Word-Dokument aus der Normalvorlage von Word mit 29 Merkmalen, die das Mindestprofil nicht oder
nur teilweise abbilden kann. **29 von 29 werden wie erwartet behandelt**; der Import meldet
2 Verluste, 8 Ersatzformen, 7 Hinweise:

| Merkmal | Ergebnis | Verloren |
| --- | --- | --- |
| Kommentar | entfällt, gemeldet | ja |
| BMP-Bild | Abbruch; mit `--bild-auslassen` Platzhalter, gemeldet | ja |
| Formel (OMML) | linearer Text `U=1/R`, gemeldet | Formelsatz |
| Textfeld | Absatz nach dem Anker, gemeldet | Lage |
| Änderungsverfolgung | angenommener Stand, gemeldet | Verlauf |
| `DATE`-Feld, Inhaltssteuerelement | letzter Wert als Text, gemeldet | Funktion |
| `PAGEREF` | Verweis mit Zieltext statt Seitenzahl, gemeldet | Seitenzahl (gewollt) |
| `mailto:`-Link | Text, gemeldet | Verknüpfung |
| Bild ohne Alternativtext | Name als `alt`, gemeldet | Beschreibung (fehlte in der Quelle) |
| direkt fett/kursiv | CSS-Klasse | Bedeutung „stark“ (fehlte in der Quelle) |
| Kopf-/Fußzeile | Kopfzeilentext einmal am Ende, Seitenzahl entfällt, gemeldet | Wiederholung je Seite |
| Inhaltsverzeichnisfeld, Seitenumbruch | entfallen, gemeldet | nein (Navigationsdokument, fließend) |
| Überschrift mit Textmarke, Strong, hochgestellt, Fußnote, Listen über Vorlagen inkl. „List Bullet 2“, Zitat, `REF`, https-Link, dekoratives Bild, Tabelle mit Kopf/Spannen/Beschriftung, verschachtelte Tabelle | übernommen | nein |
| getippter Spiegelstrich, groß-fett formatierter Absatz | bleiben Absätze | nein (keine Struktur aus dem Aussehen) |

## 8. Darstellung (Gegenprobe)

Die drei Regeln, die der Prüfer ohne Browser als „nicht geprüft“ führt, sind mit
[`scripts/s5-darstellung.mjs`](../scripts/s5-darstellung.mjs) in Chromium nach den Prüfverfahren
des Regelkatalogs gemessen ([`07-darstellung.txt`](belege/S5/07-darstellung.txt)):
HPR-INH-004 (kein waagrechtes Scrollen bei 320, 768, 1280 px), HPR-INH-006 (Lesesystem-Variablen),
HPR-INH-022 (reduzierte Bewegung). Alle sieben Ergebnisse aus Markdown und Word scrollen in
keiner der drei Breiten waagrecht; beim PDF-Import steht bei 320 px eine Tabelle über (390 px), die
nach der Regel als Scrollbereich ausgenommen ist, weil der Reader sie in einen eigenen Scrollbereich
setzt (HP-INH-010). Nach 5 s mit reduzierter Bewegung laufen keine Animationen. Während der
Entwicklung scrollten das Markdown- und das Word-Ergebnis bei 320 px ebenfalls um 70 px (dieselbe
vierspaltige Tabelle; Messung nicht im Beleg, Vorfassung der Stylesheets): ohne Reader — etwa in
einem EPUB-Lesesystem — hätte die Seite gescrollt. Seitdem brechen Tabellenzellen in allen Vorlagen
um. Zu HPR-INH-006: die Schriftgröße folgt `--hp-font-size` mit Faktor 2,000; die
Zeilenhöhe in Pixeln steigt mit `--hp-line-height: 2` auf das 2,667-Fache (1,5 → 2 bei doppelter
Schrift). Die Regel verlangt „Faktor 2“ für beide; bei einem Ausgangswert von 1,5 ist das nicht
erreichbar, ohne die Variable zu ignorieren — das betrifft das Prüfverfahren, nicht die Vorlagen,
und ist hier nur festgehalten.

## 9. Rückmeldungen an die Spezifikation

**HPC-0011** ([`aenderungen/HPC-0011.md`](spezifikation/aenderungen/HPC-0011.md), in Frist):

1. Ohne Titelvorlage verlangt Tabelle 15.2 (über HP-MIN-003, Muss) mehrere `h1`, HP-INH-007 (Soll)
   genau eine; der Prüfer warnt (HPR-INH-010). Vorschlag: Titel aus den Dokumenteigenschaften als
   `h1`. Der Word-Filter folgt bis zur Entscheidung dem geltenden Wortlaut.
2. HP-MIN-004 macht auch automatisch angelegte Textmarken (LibreOffice
   `Ref_Tabelle0_label_and_number`) zu Kennungen; sie sind keine stabilen Adressen. Der Word-Filter
   nutzt sie schon nur als Verweisziel.

Außerdem (kein Antrag): Tabelle 15.2 hat keine Spalte für Markdown; die Zuordnung in Abschnitt 3
könnte als informative Spalte aufgenommen werden. Die Prüfregel HPR-INH-006 ist für die
Zeilenhöhe nicht erfüllbar formuliert (Abschnitt 8).

## 10. Nicht geprüft

| Was | Grund |
| --- | --- |
| Word-Dateien aus **Microsoft Word** selbst | kein Word im Arbeitsverzeichnis; geprüft sind LibreOffice 26.8 (Export „MS Word 2007 XML“) und python-docx 1.2 (Normalvorlage von Word). Word schreibt dieselben Elemente, aber z. B. Bildbeschriftungen oft über der Tabelle und SVG-Bilder mit PNG-Ersatz; beides behandelt der Leser, erprobt ist es nicht |
| Strict-OOXML, `.doc`, `.rtf`, `.odt` (gepackt) | nicht gebaut; Strict-OOXML und `.doc` werden mit Meldung abgelehnt |
| Diagramme mit Datenzwischenspeicher, SmartArt | nur als gemeldeter Platzhalter; keine Testdatei mit Diagramm (python-docx kann keine erzeugen) |
| EMF/WMF in PNG umwandeln | der Kern hat dafür keinen Renderer; Abbruch oder Platzhalter |
| Reale Dokumente aus dem Zielmarkt | wie in docs/11: keine freigegebenen Beispieldateien |
| Markdown-Varianten jenseits der Teilmenge (Pandoc-Attribute an Absätzen, Definitionslisten, Mathe-Satz) | gemeldet bzw. als Text; keine Vollständigkeit gegenüber CommonMark behauptet, keine Prüfung gegen die CommonMark-Testsuite |
| PDF mit Tag-Auswertung | Docling nutzt die Tags nicht (P9); ein eigener Tag-Leser würde den PDF-Weg deutlich verbessern |
| Bedienoberfläche „Neues Dokument aus Vorlage“ im Reader | nicht gebaut; der Weg ist Kommandozeile und Kern-API |
