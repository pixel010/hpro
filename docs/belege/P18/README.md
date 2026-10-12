# Belege P18 – Druckweg nach DIN A4 (abgeleitete Ausgabe)

**Stand:** 12.10.2026 · **Erzeugt mit:** `scripts/belege-p18.sh` (alle Dateien dieses Ordners außer
dieser) · **Ziel:** Zusage 6 aus [`docs/10`](../../10-anspruch-und-funktionsprofil.md): der Ausdruck
entsteht aus dem digitalen Layout – Umbruchregeln, Kopf- und Fußzeile, Seitenzahlen, Verzeichnis,
Tabellen mit wiederholtem Kopf, Codeblöcke mit Umbruchmarke, bewegte und interaktive Elemente als
Standbild mit Beschreibung und Verweis auf die lebendige Fassung. Normativ: Teil 0 Abschnitt 13
(HP-PRINT-001 … 014), Prüffälle HPL-PRINT-001 … 006.

## Was gebaut wurde

| Teil | Ort | Inhalt |
| --- | --- | --- |
| Druckfassung | `app/src/print.ts`, `app/src/print.css` | eigenständiges HTML aus **allen** Inhaltsdokumenten in Lesereihenfolge, ohne Skript, eigene CSP ohne Netzquelle; Titelblock (Titel, Kennung, dateModified, Fassung); Verzeichnis aus dem Navigationsdokument mit `#kennung` und Seite; Überschriften h1–h3 mit `#kennung` (als erzeugter Text, Lesezeichen bleiben sauber); interne Verweise „(S. n, #kennung)“, externe mit URL; Video → Standbild (`poster` bzw. Ersatzbild), Ton → Beschreibung, Komponente → statische Fassung, CSS-/SMIL-Animation → angehalten im Zustand für reduzierte Bewegung, jeweils mit „Lebendige Fassung: pfad#kennung“ in der Bildunterschrift; `details` offen, alle Prioritäten sichtbar; `no-print`/`hidden` entfernt, Hinweis des Kerns an ihrer Stelle; Medienabfragen des Dokuments für Papier aufgelöst (`print` gilt, `screen` nicht, reduzierte Bewegung gilt) |
| Seitenlayout | `print.css` | `@page` A4, Ränder 22/20/20/20 mm (≥ 15 mm), Kopfzeile Titel und Stand, Fußzeile „Seite n von N“ (Randfelder, `counter(pages)`); Überschriften und `summary` bleiben beim Folgetext, Abbildungen und Zeilen ungeteilt, `thead` auf jeder Seite, `tfoot` nur am Ende, nichts mit `overflow: hidden` |
| Umbruch und Seitenzahlen | `app/src/paginate.ts` | im verborgenen Druckrahmen (Satzbreite 643 px): Codezeilen an der letzten passenden Spalte umbrochen mit „↩“ und Fortsetzungseinzug; zu breite Tabellen in zwei Stufen kleiner gesetzt; Prüfung auf Inhalt außerhalb des Satzspiegels; Seitenvorhersage im Mehrspaltensatz (643 × 964 px je Spalte = Seite, Tabellenköpfe beim Messen eingefügt), Seitenzahlen eingetragen und nachgemessen |
| Reader | `app/src/main.ts`, `index.html`, `shortcuts.ts`, `frame-agent.js` | Schaltfläche „Drucken“, Taste `p`, Strg+P (auch im Dokumentrahmen abgefangen); Rahmen `sandbox="allow-same-origin allow-modals"` ohne Skripte; Statuszeile nennt Seiten und lebendige Elemente |
| Prüfdokument | `docs/spezifikation/beispiele/p18-druck/` (aus `scripts/p18-beispiel-quelle.mjs`) → `app/dist/druck.hpro` | Messprotokoll mit 200 Zeilen, Bauzeitenplan mit 12 Spalten, Tagesgang mit 25 Spalten, Bild 2400 px breit, CSV-Kopfzeile mit 300 Zeichen im `pre`, Video mit `poster`, CSS-Animation, Komponente `hp-chart`, zugeklapptes `details`, Block der Priorität 3, Abschnitt mit `no-print`, zweites Inhaltsdokument, interne und externe Verweise |
| Prüfwerkzeuge | `app/e2e/druck.spec.ts` (in `npm test`), `app/e2e/pdf.ts`, `app/e2e/p18-belege.spec.ts`, `scripts/p18-pdf-pruefung.py`, `scripts/p18-messung.mjs` | Browsertests mit PDF-Leser (Seiten, Seitenmaß, benannte Sprungziele); unabhängige PDF-Prüfung mit pypdf und pdfium; Messungen an Chromium |

## Abnahmekriterien

| # | Kriterium | Ergebnis | Beleg |
| --- | --- | --- | --- |
| 1 | Testdokument mit langer Tabelle, Codeblock und Video druckt auf A4 ohne abgeschnittene Inhalte | **erfüllt** | `04-pdf-pruefung.txt` (druck: A, E, F, G, H), `pdf/druck.pdf`, `seiten/druck-*.png`, `02-browsertests.txt` |
| 2 | Kopfzeile, Seitenzahlen und Verzeichnis sind im Ausdruck vorhanden | **erfüllt** | `04-pdf-pruefung.txt` (B, C, D, K), `seiten/druck-01.png` |
| 3 | Video und Animation erscheinen als Standbild mit Bildunterschrift und Verweis auf die lebendige Fassung | **erfüllt** | `04-pdf-pruefung.txt` (I), `seiten/druck-10.png`, `seiten/lebendig-*.png`, `02-browsertests.txt` |
| 4 | Ergebnis als PDF unter `docs/belege/P18/` mit Seitenbildern oder veraPDF-Prüfung | **erfüllt** (beides) | `pdf/*.pdf`, `seiten/*.png` (100 dpi), `06-verapdf.txt` mit `verapdf/*.xml` – veraPDF meldet Abweichungen, siehe unten |

### 1 – A4 ohne abgeschnittene Inhalte

Unabhängig vom Reader geprüft (`scripts/p18-pdf-pruefung.py`, pypdf 6.20 und pdfium 156) an
`pdf/druck.pdf`:

- **A** alle Seiten 209,89 × 297,01 mm (A4 ± 1 mm); Seitenzahl wie vom Reader vorhergesagt.
- **E** Grenzen aller Seitenobjekte (Text, Pfade, Bilder, Formulare): **0 Objekte außerhalb des
  Satzspiegels** 20 … 190 mm × 20 … 275 mm; in Kopf- und Fußzeile nur deren Text.
- **F** Randstreifen links und rechts (je 19 mm) auf den Seitenbildern ohne ein dunkles Pixel.
- **G** jeder Textblock der Druckfassung (Absatz, Listenpunkt, Zelle, Bildunterschrift, Überschrift)
  steht im PDF-Text; der Codeblock steht vollständig im PDF, wenn man die Marken „↩“ entfernt; die
  Zahl der Marken im PDF = Zahl der eingefügten Marken.
- **H** jede Tabelle: jede Zeile steht ganz auf einer Seite, der Kopf steht auf jeder Seite mit
  Zeilen (Messprotokoll: Seiten 2 bis 8), jede der 200 Messzeilen genau einmal.

Die **Gegenprobe** (`05-gegenprobe.txt`) zeigt, dass diese Prüfung Fehler findet: dieselbe
Druckfassung ohne das Druckprofil des Readers, von Chromium auf A4 ohne Ränder gedruckt, fällt bei
9 Prüfungen durch – keine Kopf- und Fußzeile, Seitenzahlen im Verzeichnis falsch, Codezeile
abgeschnitten (`overflow-x: auto` des Dokuments), Inhalt bis an den Papierrand (E, F).

### 2 – Kopfzeile, Seitenzahlen, Verzeichnis

- **B** jede Seite trägt den Titel (Kopfzeile) und „Seite n von N“ mit richtigen Werten; Seite 1
  trägt Kennung `urn:uuid:8d41f0b2-…` und dateModified `2026-10-12T15:00:00Z` (Titelblock).
- **C** Verzeichnis auf Seite 1: jeder Eintrag „#kennung S. n“ zeigt auf die Seite, auf der Chromium
  das benannte Sprungziel derselben Kennung abgelegt hat (13 Einträge); ebenso die drei Verweise
  „(S. n, #kennung)“ im Text.
- **D** jede Überschrift h1–h3 steht mit ihrem „#kennung“ auf derselben Seite.
- **K** die vom Reader gemessene Lage jedes Ziels weicht von der Lage des Sprungziels im PDF um
  höchstens wenige Zehntelmillimeter ab (Streuung siehe `04`).

**Warum eine Vorhersage:** Chromium nimmt `target-counter()` an (`CSS.supports` = true), druckt aber
nichts (`08-messungen-chromium.txt`, Teil 1). Der Reader rechnet die Seitenzahlen deshalb selbst:
der Druckrahmen wird als Mehrspaltensatz mit dem Satzspiegel gesetzt; Chromium bricht Spalten mit
derselben Fragmentierung um wie Seiten. Zwei Unterschiede wurden gemessen und werden ausgeglichen
(`08`, Teile 2 und 3): Chromium rundet den Satzspiegel beim Drucken auf ganze Pixel
(**643 × 964 px** statt 642,52 × 963,78 px), und es wiederholt den Tabellenkopf nur auf Seiten, nicht
in Spalten (Unterschied genau eine Kopfzeile je Folgeseite). Ohne diese Korrekturen lag die Messung
am Prüfdokument bis Seite 8 um 46 mm vor dem Druck. Der gekürzte Außenabstand am Seitenanfang
verhält sich in beiden gleich (Teil 4).

Zusätzlich zum Prüfdokument wurden alle Beispieldokumente des Readers gedruckt und geprüft
(`lebendig`, `sperren`, `beispiel`, `kostenschaetzung`): überall stimmen Seitenzahl, alle
Verzeichnis- und Verweisseiten und die Lage der Ziele mit dem PDF überein (`03`, `04`), und
`e2e/druck.spec.ts` prüft das bei jedem `npm test`.

### 3 – Video und Animation als Standbild mit Bildunterschrift und Verweis

- Druckfassung (`02-browsertests.txt`, Test 1): im Druck kein `video`, `audio`, `script`, keine
  Komponente; das Standbild des Videos ist geladen; die Bildunterschrift des Dokuments steht, ergänzt
  um „Video, im Ausdruck als Standbild. Lebendige Fassung: content/index.xhtml#zeitraffer-video“; der
  animierte Ablaufplan hat 0 laufende Animationen, steht im Zustand für reduzierte Bewegung (alle
  Schritte deckend) und trägt „Animation, im Ausdruck als Standbild (Zustand bei reduzierter
  Bewegung). Lebendige Fassung: content/index.xhtml#ablauf-abbildung“; die Komponente zeigt ihre
  statische Fassung mit „Lebendige Fassung: content/index.xhtml#aufwand-diagramm“.
- PDF (`04`, I): jeder dieser Sätze steht im PDF-Text, auf derselben Seite ein Bildobjekt (Video)
  bzw. sichtbare Vektorpfade (Animation und Diagramm sind SVG). Im P15-Beispiel zusätzlich die
  Tonaufnahme mit Beschreibung und Adresse.
- Seitenbilder: `seiten/druck-10.png` (Video und Ablaufplan), `seiten/druck-11.png` (Diagramm).

### 4 – PDF, Seitenbilder, veraPDF

- `pdf/druck.pdf` (Prüfdokument), `pdf/lebendig.pdf`, `pdf/sperren.pdf`, `pdf/beispiel.pdf`,
  `pdf/kostenschaetzung.pdf`, je mit `-druckfassung.html` (genau das gedruckte HTML) und
  `-bericht.json` (Bericht des Readers und Eckdaten des PDF); `pdf/kontrolle.*` ist die Gegenprobe.
- `seiten/<name>-NN.png`: jede Seite mit 100 dpi, gerendert mit pdfium.
- **veraPDF 1.30.3** (`06-verapdf.txt`, Berichte `verapdf/*.xml`): **nicht konform**, weder PDF/UA-1
  noch PDF/A-2b. PDF/A-2b scheitert an drei Regeln (Datei-ID im Trailer, Farbraum DeviceRGB ohne
  OutputIntent, XMP-Metadaten fehlen); PDF/UA-1 an sieben (u. a. Inhalt weder getaggt noch als
  Artefakt markiert, Verweise ohne Alternativtext, Listenstruktur, fehlende XMP-Metadaten). Das ist
  der Stand des Chromium-PDF (getaggt, mit Lesezeichen und Sprache, aber ohne PDF/A- oder
  PDF/UA-Anspruch). Der Druckweg beansprucht beides nicht; HP-PRINT-012 (Soll) gehört zum
  PDF-Export (Paket P9, WeasyPrint und veraPDF). Eine Abweichung wurde behoben, weil sie ein
  Strukturfehler der Druckfassung war: das Verzeichnis begann mit einer h2 vor dem ersten h1
  (§ 7.4.2) – die Überschrift „Inhalt“ ist jetzt h1.

## Weitere Prüfungen

- `01-unit-tests.txt`: Vitest (jsdom) für `print.ts` – Medienabfragen für Papier, CSS-Zeichenketten,
  Erkennung von Animationen, Kennung von Überschriften, die Druckfassung eines Containers mit zwei
  Inhaltsdokumenten (gleiche `id` in beiden, Sperre, Video mit und ohne `figure`, SMIL).
- `07-pruefer-epubcheck.txt`: das Prüfdokument besteht epubcheck 5.4.0 ohne Meldung und den
  Konformitätsprüfer `hpro-check` (Stufen Basis und Lebendig) ohne Fehler; der Prüfer hatte im ersten
  Lauf zwei Mängel am Prüfdokument gefunden (SVG ohne `role="img"`, keine Umbruchregeln im
  Dokument-CSS), beide behoben.
- `09-laeufer-pruefung.txt`: `npm ci` und `npm test --if-present` wie der Läufer; davor und danach
  keine Prozesse, die `node_modules` offen halten.

## Befunde während der Arbeit

- Der erste Lauf von `npm test` scheiterte am bestehenden P17-Test „no-print im Druck“: die neue
  Druckregel der Readeroberfläche blendete beim Drucken des Fensters den Dokumentrahmen aus. Jetzt
  werden nur Leisten und Seitenfelder ausgeblendet, und über dem Dokument steht ein Hinweis auf
  „Drucken“.
- Ein `details` wurde zwischen `summary` und Inhalt umbrochen (`beispiel`, U-Werte):
  `summary` bleibt jetzt beim Folgetext, und die Messung meldet auch `summary` am Seitenende.
- Chromium zeichnet auf jeder Seite Teile anderer Seiten außerhalb des Seitenformats, wo sie
  weggeschnitten werden (gepunktete Führungslinien des Verzeichnisses: 27 819 Objekte). Die
  Prüfung E zählt solche Objekte getrennt; die Führungslinien sind jetzt durchgezogen (eine Linie
  statt hunderter Punkte).

## Nicht geprüft

- **Andere Engines:** nur Chromium 156 (Playwright, Headless Shell). Ob Firefox und WebKit die
  Randfelder für Kopf- und Fußzeile drucken und gleich umbrechen, ist nicht geprüft (P13). Die
  Seitenvorhersage beruht auf Chromiums Mehrspaltensatz; in einem anderen Browser können die
  Seitenzahlen abweichen.
- **Druckdialog und Papier:** geprüft ist das PDF, das Chromium aus der Druckfassung erzeugt
  (`page.pdf`, derselbe Druckweg wie „Als PDF speichern“). Ein echter Drucker, Druckerränder
  und die Skalierungsoptionen des Druckdialogs („An Seite anpassen“) sind nicht geprüft.
- **Überschrift am Seitenende im PDF:** gemessen nur im Reader (`headingsAtPageEnd`, überall leer)
  und an den Seitenbildern angesehen, nicht mechanisch am PDF.
- **PDF/A, PDF/UA:** nicht erfüllt (siehe oben); Export mit Konformität ist Paket P9.
- **Ungespeicherte Tabelleneingaben** (P19): gedruckt werden die gespeicherten Werte; der Titelblock
  nennt die Zahl der nicht enthaltenen Eingaben. Nicht im Browser getestet.
- **Seitenansicht des Readers (P4)** ist nicht aus dem Druckweg abgeleitet (eigene Ränder 15 mm,
  eigener Umbruch); HP-PRINT-014 (Kann) bleibt offen.
- **Rechts-nach-links-Schrift, CJK, sehr lange Wörter in Tabellenzellen:** Code für breite Zeichen
  und Tabellenzellen ist da, an Dokumenten nicht geprüft.
