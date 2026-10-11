# Belege P1 – Projektgerüst und Container-Kern in TypeScript

**Stand:** 11.10.2026 · **Erzeugt mit:** [`scripts/belege-p1.sh`](../../../scripts/belege-p1.sh)
(wörtliche Ausgaben mit Exit-Code; Wiederholung jederzeit möglich) · **Code:** [`kern/`](../../../kern/)

Werkzeuge ([00-werkzeuge.txt](00-werkzeuge.txt)): Node 26.5.1, npm 11.17.0, Temurin JDK 21.0.12.1+1,
EPUBCheck 5.4.0, Python 3.13.5 (nur für unabhängige Gegenproben).

## Abnahmekriterien

| # | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| 1 | `npm ci && npm test` laufen ohne Fehler | **erfüllt:** `npm ci` Exit 0; `npm test` 50 Tests, 50 bestanden, 0 übersprungen, Exit 0 | [01-npm-ci-test.txt](01-npm-ci-test.txt) |
| 2 | vom Kern erzeugter Container: epubcheck 5.4.0 mit 0 Fehlern, 0 Warnungen | **erfüllt:** `Messages: 0 fatals / 0 errors / 0 warnings / 0 infos`, Exit 0. Zusätzlich im Testlauf: Beispiel im Profil `interactive` mit Komponenten-Skript ebenfalls 0/0/0 | [02-epubcheck.txt](02-epubcheck.txt), Container [beispiel-lauf1.epub](container/beispiel-lauf1.epub) |
| 3 | Hash-Manifest wird nach dem Schreiben rückgelesen und geprüft; Test mit manipulierter Ressource | **erfüllt:** `createContainer` liest jeden geschriebenen Container zurück und wirft, wenn ein Hash oder Eintrag abweicht. Manipulation „1.200,00 EUR → 9.200,00 EUR“ in `content/index.xhtml` ergibt `hash-mismatch` nur für diese Datei | [04-manipulation.txt](04-manipulation.txt); Tests in [`kern/test/integrity.test.ts`](../../../kern/test/integrity.test.ts) |
| 4 | zwei Läufe erzeugen Container mit identischem Inhalt | **erfüllt, sogar byte-identisch:** zwei getrennte Node-Prozesse, alle 9 Einträge gleich in Name, Reihenfolge, Methode und SHA-256; Datei-SHA-256 beider Läufe `7e393c7d…2dc6b9` | [03-determinismus.txt](03-determinismus.txt) |

## Was die Tests abdecken (50 Tests)

| Datei | Inhalt |
|---|---|
| `layout.test.ts` | Rohbytes am Dateianfang (Signatur, Methode 0, Extra-Länge 0, `mimetype` ab Byte 30, Inhalt ab Byte 38), Eintragsreihenfolge, `container.xml`, `package.opf` (alle Dateien deklariert, `nav`, Spine), jeder Hash in `manifest.json` gegen `node:crypto` nachgerechnet |
| `integrity.test.ts` | Rücklesen nach dem Schreiben; manipulierte, fehlende, nachträglich ergänzte Datei; gefälschter Hash im Manifest; gekipptes Byte im Deflate-Strom (CRC/Struktur); Nicht-SHA-256-Werte; **Prototyp-Container** `basis.epub` (Python), `hybrid-manipuliert.epub` (V8), `hybrid-kommentar.epub` (V9), `zielformat-2sig.epub` (V11, von DSS geschrieben) |
| `determinism.test.ts` | gleiche Einträge und Hashes, byte-identisch, unabhängig von der Reihenfolge der Eingabe; eine Inhaltsänderung ändert genau die Datei und `manifest.json` |
| `reader.test.ts` | falscher, komprimierter, nicht erster mimetype, mimetype mit Extra-Feld; fehlende `container.xml`/`manifest.json`; Pfad-Traversal; doppelte Namen; ZIP-Bombe (mehr Bytes als angegeben); Größengrenze |
| `input.test.ts` | Profilregeln für Skripte, Event-Handler, `javascript:`, Skripte in SVG, externe Ressourcen, fehlende Referenzen, nicht wohlgeformtes XHTML, `&nbsp;`, reservierte und unzulässige Pfade, Groß-/Kleinschreibungs-Kollision, ungültige Metadaten, XML-Escaping, UTF-8-Dateinamen |
| `epubcheck.test.ts` | epubcheck 5.4.0 auf zwei erzeugten Containern (static, interactive) |
| `adapters.test.ts` | Schnittstellen mit Testdoubles: `PdfImport`-Ergebnis geht direkt in `createContainer`; `Storage`-Rundreise |

## Gegenproben: greifen die Prüfungen?

Mit Python `zipfile` (unabhängig vom Kern) wurden aus dem Beispiel absichtlich fehlerhafte Container
erzeugt ([05-gegenproben.txt](05-gegenproben.txt)):

| Verstoß | epubcheck 5.4.0 | Kern (`hpro inspect`) |
|---|---|---|
| a) mimetype `application/vnd.etsi.asic-e+zip` | `PKG-007`, Exit 1 | abgelehnt, Exit 2 |
| b) mimetype **komprimiert** (Deflate) | **0 Fehler, 0 Warnungen**, Exit 0 | abgelehnt, Exit 2 |
| c) mimetype mit 4-Byte-Extra-Feld | `PKG-005`, Exit 1 | abgelehnt, Exit 2 |
| d) mimetype nicht erste Datei | `PKG-006`, Exit 1 | abgelehnt, Exit 2 |

**Befund zu b):** In diesem Lauf hat epubcheck 5.4.0 einen Container mit deflate-komprimiertem
`mimetype` ohne Meldung akzeptiert, obwohl EPUB 3.3 die Komprimierung verbietet (die Rohbytes im
Beleg zeigen Methode 8 und komprimierten Inhalt ab Byte 38). Folge: epubcheck allein reicht als
Nachweis für die mimetype-Regel nicht. Der Kern prüft sie deshalb selbst, und der Layout-Test prüft
die Rohbytes. Ob andere Reader einen solchen Container ablehnen, ist **nicht geprüft**.

**Manipulation und epubcheck:** Der manipulierte Container besteht epubcheck weiterhin mit 0 Fehlern
([04-manipulation.txt](04-manipulation.txt)), wie Fall V8 in docs/05. Nur das Hash-Manifest (bzw.
später die Signatur) deckt die Änderung auf.

## Nicht geprüft

| Was | Grund |
|---|---|
| Kern im Browser oder in einer Webview | P1 hat keine App; Code nutzt nur Web-Standard-APIs und wird ohne Node-Typen übersetzt, ausgeführt wurde er nur unter Node 26.5.1 (Browser-Lauf folgt mit P4/P13) |
| Node 22 und 24 (`engines: >=22`) | nur Node 26.5.1 installiert |
| Byte-Gleichheit über verschiedene Deflate-Implementierungen | nur Node/zlib gemessen; Kriterium 4 verlangt sie nicht |
| große Container, ZIP64 | ZIP64 bewusst nicht unterstützt (Fehlermeldung); kein Lasttest |
| `url(…)` in CSS | CSS wird nicht ausgewertet |
| Barrierefreiheit (Ace by DAISY) | nicht Teil von P1; das Beispiel trägt deshalb keine Konformitätsangabe, nur beschreibende Metadaten (P8) |
| Signaturen | P2/P3; `META-INF/signatures.xml` wird geduldet, aber nicht ausgewertet |
