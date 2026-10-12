# Belege P7 – Kommentare, Review und Vergleich zweier Fassungen

**Stand:** 13.10.2026 · **Erzeugt mit:** [`scripts/belege-p7.sh`](../../../scripts/belege-p7.sh)
(wörtliche Ausgaben der Prüfbefehle in den Dateien `00` … `10`).

Ziel aus [docs/08](../../08-arbeitsplan.md): Anmerkungen, Hervorhebungen, Freihand,
Kommentarthreads mit Status (offen/erledigt), Export der Anmerkungen, Dokumentvergleich. Umgesetzt
mit dem **W3C Web Annotation Data Model** im Container (`annotations/`, wie in
[docs/03, 1.2](../../03-konzept.md) vorgesehen), ohne eigenes Anmerkungsformat, ohne Skript im
Dokument und ohne Netz. Format-Vorschlag: [HPC-0010](../../spezifikation/aenderungen/HPC-0010.md)
(in Frist bis 09.11.2026).

## Abnahmekriterien

| # | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| 1 | Tests für Anlegen, Beantworten, Erledigen und Export von Anmerkungen | **erfüllt** – 21 Kern-Tests in 7 Gruppen (Anlegen: Kommentar, Hervorhebung, Freihand, Ablehnungen; Beantworten, Erledigen, Wiederöffnen samt Zeitvergleich; Export JSON-LD/CSV/XHTML, Import mit Konflikten; Signatur, Redaktion, eingefrorene Fassung, Verankerung nach Bearbeitung), 6 Reader-Unit-Tests, 6 Browser-Tests (Anlegen, Beantworten, Erledigen, Wiederöffnen, Löschen, Speichern, Export, Import, Vergleich, axe-core). Dazu die ganze Prüfrunde über die Kommandozeile mit Export und Import ohne Verlust (12 von 12 Dateien byte-gleich) und die unabhängige Gegenprobe gegen die W3C-Testdefinitionen: 53 Anmerkungen, 0 MUST-Verstöße; die Negativprobe scheitert wie erwartet | [`01-kern-tests.txt`](01-kern-tests.txt), [`02-abnahme-kommandozeile.txt`](02-abnahme-kommandozeile.txt), [`07-reader.txt`](07-reader.txt), [`03-w3c-gegenprobe.txt`](03-w3c-gegenprobe.txt) |
| 2 | Anmerkungen bleiben im Container erhalten und sind mit dem Reader ohne Datenverlust wieder lesbar | **erfüllt** – Die mit der Kommandozeile geschriebene Prüfrunde (`container/review.hpro`, 12 Anmerkungen in 5 Threads) im Reader geöffnet; was die Leiste zeigt, wurde aus dem DOM gelesen (`container/reader-anzeige.json`) und **mit Python gegen die rohen JSON-LD-Dateien** geprüft: alle 5 Threads mit Autor, Zeitpunkt, Zitat, Text, Farbe, Status und allen 7 Antworten, 3 Markierungen, 2 Freihandpfade – 0 Abweichungen. Der Reader speichert (`container/review-reader.hpro`): alle 12 vorhandenen Dateien byte-gleich, 3 neue, alle 15 in Hash-Manifest und `package.opf`. Dazu im Kern: Rundreise lesen → schreiben tief gleich (auch Unicode, Zeilenumbrüche, `<`, `&`), Speichern des Dokuments durch den Editor lässt die Anmerkungen unverändert, Verlaufsjournal läuft weiter | [`08-abnahme2-reader.txt`](08-abnahme2-reader.txt), [`07-reader.txt`](07-reader.txt), [`01-kern-tests.txt`](01-kern-tests.txt) |

## Was gebaut wurde

**Format ([HPC-0010](../../spezifikation/aenderungen/HPC-0010.md)).** Jede Anmerkung ist eine
eigene Datei `annotations/<uuid>.jsonld` mit genau einer Web Annotation:

```json
{
  "@context": ["http://www.w3.org/ns/anno.jsonld", { "hp": "https://hpro.example/ns/v0#" }],
  "id": "urn:uuid:9b716bc9-97f5-82b3-bd3b-1e6a06bdf959",
  "type": "Annotation",
  "motivation": "commenting",
  "created": "2026-10-12T08:10:00Z",
  "creator": { "type": "Person", "name": "Eva Berger (Bauamt)" },
  "body": { "type": "TextualBody", "value": "Freitags endet der Unterricht um 12:00 Uhr – bitte ergänzen.", "format": "text/plain" },
  "target": {
    "source": "content/index.xhtml#anf-laerm",
    "selector": [
      { "type": "TextQuoteSelector", "exact": "nach 13:00 Uhr", "prefix": "…", "suffix": "." },
      { "type": "TextPositionSelector", "start": 103, "end": 117 }
    ]
  }
}
```

(gekürzt; die wörtliche Datei steht in [`02-abnahme-kommandozeile.txt`](02-abnahme-kommandozeile.txt)).

- **Ziel = stabile Adresse** `pfad#kennung` (HP-ADR, Zusage 3), Textstelle als Zitat mit Umgebung
  im normalisierten Text des Elements – keine Seitenkoordinaten (Zusage 1). Nach einer Bearbeitung
  wird die Stelle über das Zitat wiedergefunden („verschoben“) oder als „verwaist“ benannt; die
  Anmerkung bleibt erhalten.
- **Hervorhebung:** `motivation: highlighting` mit `styleClass` aus einer festen Palette; der Reader
  wendet kein CSS aus der Datei an.
- **Freihand:** `SvgSelector` mit Pfaddaten in 0–1000 relativ zum Element; der Reader baut das SVG
  aus den Zahlen neu auf, fügt nie Markup aus der Datei ein.
- **Threads und Status:** Antworten zielen auf die `id` der beantworteten Anmerkung;
  „Erledigt“/„Wieder öffnen“ ist eine Antwort mit `hp:status`, die späteste gilt. Geschriebene
  Dateien werden dafür nie geändert – deshalb bleiben sie auch nach einer Signatur beantwortbar.
- **Speichern:** ohne Signatur über `manifest.json` verzeichnet (Hash, `package.opf`, `history`,
  Journal fortgeführt); mit Signatur nur die neue Datei, `manifest.json` und `package.opf`
  byte-gleich, die Signatur bleibt gültig, die Datei heißt „nicht signiert“ (Zusage 5,
  [docs/05 V9](../../05-prototyp-ergebnisse.md)). Signierte Anmerkungen werden nicht geändert oder
  gelöscht.
- **Export:** `AnnotationCollection` (Elemente unverändert), CSV (RFC 4180, mit BOM für
  Tabellenprogramme), Bericht als XHTML. **Import** aus einem Export oder einer zweiten Kopie:
  neu, gleich, Konflikt (die eigene Fassung bleibt), Antworten ohne Thread werden gemeldet.
- **Vergleich zweier Fassungen** (zwei Dateien oder zwei Fassungen aus dem Verlauf): Text- und
  Strukturänderungen als Wortdifferenz (Zusage 4, P5) plus Änderungen der Anmerkungen und die
  Threads an geänderten oder verschwundenen Stellen.

**Kern** ([`kern/src/annotate/`](../../../kern/src/annotate/)), Kommandozeile `hpro annotate
list|check|add|reply|resolve|reopen|edit|delete|export|import|compare`. **Reader**
([`app/src/annotations.ts`](../../../app/src/annotations.ts)): Leiste „Anmerkungen“, Markierungen
und nummerierte Knöpfe im Text, Kommentar zum Abschnitt ohne Maus, Freihand, Speichern als neue
Datei, Export, Import, „Mit anderer Datei vergleichen …“ im Verlauf.

**Änderung in diesem Lauf am Kern:** Beim Speichern neben einer Signatur folgen die
ZIP-Zeitstempel jetzt dem signierten `dateModified` statt der Speicherzeit (vorher meldete
hpro-check dafür die Warnung HPR-CONT-025 über alle 24 Einträge; Testzusicherung in
`kern/test/annotate.test.ts`). Der Vergleichstext nennt die Verankerung auf Deutsch
(„verschoben“, „verwaist“). Fehler beim Wiederherstellen einer Fassung meldet `hpro annotate
compare` mit Exit 1 und Meldung statt mit Stacktrace.

## Dateien

| Datei | Inhalt |
|---|---|
| [`00-werkzeuge.txt`](00-werkzeuge.txt) | Node, JDK, epubcheck, DSS, python-jsonschema, pyld, W3C-Testdefinitionen; Testschlüssel |
| [`01-kern-tests.txt`](01-kern-tests.txt) | `node --test kern/build/test/annotate.test.js` |
| [`02-abnahme-kommandozeile.txt`](02-abnahme-kommandozeile.txt) | Prüfrunde: 5 Anmerkungen (Kommentar mit Zitat, 2 Hervorhebungen, Freihand, Kommentar im Anhang mit `<b> & "…"` und Zeilenumbruch), 3 Antworten (eine auf eine Antwort), erledigt, wieder geöffnet; Inhalt byte-gleich; Bearbeiten, Löschen, 3 Ablehnungen; Export (JSON-LD = Dateien, 12 von 12), Import in den leeren Entwurf (12 von 12 byte-gleich), zweiter Import ohne Dubletten, Konflikt; Vergleich nach Bearbeitung (ein Thread „verschoben“, einer „verwaist“), Vergleich aus dem Verlauf |
| [`03-w3c-gegenprobe.txt`](03-w3c-gegenprobe.txt), [`gegenprobe/negativ.jsonld`](gegenprobe/negativ.jsonld) | web-platform-tests `annotation-model/` (`annotationMusts.test`, 54 Zusicherungen, `collectionMusts.test`) mit python-jsonschema und JSON-LD-Rundreise mit pyld, über 4 Container bzw. Exporte; Negativprobe |
| [`04-epubcheck.txt`](04-epubcheck.txt) | epubcheck 5.4.0 über alle 7 Container: jeweils 0 Fehler, 0 Warnungen |
| [`05-hpro-check.txt`](05-hpro-check.txt) | Konformitätsprüfer über alle Container (s. „Grenzen“) |
| [`06-signiert-dss.txt`](06-signiert-dss.txt) | Signieren der Prüfrunde, Antwort und Kommentar danach, eigene Prüfung und EU DSS 6.5: `TOTAL_PASSED` mit „Not all files are signed!“ für genau die 2 neuen Dateien; Bearbeiten/Löschen signierter Anmerkungen abgelehnt; Manipulation einer signierten Anmerkung → `HASH_FAILURE` in beiden Prüfungen |
| [`07-reader.txt`](07-reader.txt) | vitest `app/test/annotations.test.ts`, Playwright `app/e2e/anmerkungen.spec.ts`, Beleglauf `app/e2e/p7-belege.spec.ts` |
| [`08-abnahme2-reader.txt`](08-abnahme2-reader.txt) | Abnahme 2 unabhängig (Python): Anzeige im Reader gegen die rohen Dateien, gespeicherte Datei des Readers |
| [`09-messungen.txt`](09-messungen.txt), [`messungen-reader.json`](messungen-reader.json) | Zeiten im Kern bei 10/100/1000 Anmerkungen, Größen, Öffnen im Reader, waagrechtes Scrollen, Netzwerk |
| [`10-npm-test.txt`](10-npm-test.txt) | `npm ci` und `npm test` wie der Läufer |
| [`container/`](container/) | alle Container, Exporte (`review-anmerkungen.jsonld/.csv`, `review-bericht.xhtml`), `reader-anzeige.json`, Testzertifikat |
| [`screenshots/`](screenshots/) | Reader: Prüfrunde mit Leiste, Threads und Freihand, Kommentar im Anhang, Telefonbreite, nach dem Bearbeiten im Reader und nach dem Speichern |

## Messungen (Auszug aus [`09-messungen.txt`](09-messungen.txt))

- Kern, Median: 100 Anmerkungen lesen und verankern ≈ 0,1 s, eine neue speichern ≈ 0,2 s;
  bei 1000 Anmerkungen ≈ 0,8 s bzw. ≈ 1,6 s, Vergleich ≈ 3 s. Eine Anmerkungsdatei ist im Mittel
  ≈ 0,8 KB groß (komprimiert gut die Hälfte).
- Reader: Öffnen bis zur vollständigen Leiste ≈ 0,2 s (12 Anmerkungen) bzw. ≈ 0,4 s (312
  Anmerkungen, 155 Threads). Kein waagrechtes Scrollen bei 390, 820 und 1440 px mit offener
  Leiste. 0 Netzwerkanfragen außerhalb des Readers.

## Grenzen und Befunde (ehrlich)

- **hpro-check beim signierten, danach kommentierten Container** (`review-signiert-angemerkt.hpro`):
  FEHLER HPR-CONT-017 und HPR-CONT-008 für die 2 nachträglichen Dateien (nicht in `resources`,
  nicht in `package.opf`), Stufe Basis „nicht bestanden“. Das ist der bekannte Zielkonflikt aus dem
  Prüfbericht S7 (Nr. 41): HP-RS-011 erlaubt unsignierte Anmerkungen, HP-CONT-004/008 verlangen
  jede Datei im Manifest – eine Eintragung bräche die Signatur. HPC-0010 (Punkte 2 und 3) schlägt
  die Ausnahme vor; solange der Antrag in Frist ist, prüft der Prüfer nach geltendem Text und
  wurde **nicht** vorab geändert. epubcheck meldet für dieselbe Datei nichts, DSS `TOTAL_PASSED`.
- **Exit-Code 3 von hpro-check** bei den übrigen Containern heißt „unbestimmt“: 0 Fehler, aber
  4 Regeln brauchen eine Browser-Engine bzw. eine Begriffsliste und sind „nicht geprüft“ (wie in
  allen bisherigen Paketen).
- **W3C-Gegenprobe:** wie gespeichert scheitern Anmerkungen mit Adressziel an `format: uri`, weil
  die Adresse relativ zur Container-Wurzel ist (HP-RS-011, ebenso *EPUB Annotations 1.0*, WD
  20.09.2026). Gegen die Container-Wurzel aufgelöst: 0 Verstöße. Begründung in HPC-0010.
- **Vergleich aus dem Verlauf:** Das Verlaufsjournal beginnt mit der ersten Textbearbeitung (P5);
  Anmerkungsschritte davor stehen im Verlauf, sind aber nicht als Fassung wiederherstellbar. Der
  Befehl sagt das (Exit 1), statt zu raten. Die aktuellen Anmerkungen sind davon nicht betroffen.
- **Freihand im Umfluss:** die Zeichnung streckt sich mit dem Element (bei Tabellen mit dem
  Scrollbereich, sichtbar im Bildschirmfoto: der Strich reicht über die Tabelle hinaus); nach einem
  Umbruch in anderer Breite trifft ein Kreis nicht mehr dasselbe Wort. Für Textstellen ist die
  Hervorhebung der genaue Weg (offener Punkt in HPC-0010).
- **Zeitstempel aus dem Reader** sind die Uhrzeit des Laufs; `review-reader.hpro` und
  `reader-anzeige.json` unterscheiden sich deshalb von Lauf zu Lauf, die Kommandozeilen-Container
  sind reproduzierbar (feste Zeiten, Kennungen nach UUID Version 8).
- **Nicht geprüft:** Firefox und WebKit (Reader nur mit Chromium getestet, P13); Bedienung mit
  Stift/Touch auf echten Geräten (Freihand nur mit Mauszeiger in Playwright); XFDF/FDF-Export für
  den PDF-Weg (nicht umgesetzt, Seitenkoordinaten fehlen im Format); Druck mit Anmerkungsliste
  (nicht umgesetzt); gleichzeitiges Arbeiten mehrerer Personen an einer Datei (nur Import).
