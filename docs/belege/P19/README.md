# Belege P19 – Tabellenrechner im Kern und in der Oberfläche

Stand: 12.10.2026. Alle Textdateien hier sind wörtliche Ausgaben der Prüfbefehle. Erzeugt mit

```
bash scripts/belege-p19.sh
```

Das Skript baut den Kern, führt die Prüfbefehle aus und schreibt die Dateien `00-…` bis `08-…`.
Auch die Unterordner `gegenprobe/` und `import/`, die Screenshots und die JSON-Messungen entstehen
dabei neu. Laufzeit hier etwa 6 Minuten (4 Kerne, Last um 3).

| Datei | Inhalt |
|---|---|
| [`00-werkzeuge.txt`](00-werkzeuge.txt) | Node, npm, Java, LibreOffice-Programme, Umfang des Rechners |
| [`01-rechner-tests.txt`](01-rechner-tests.txt) | Tests des Rechners mit Zählung der Funktionen (Abnahme 1) |
| [`02-npm-test.txt`](02-npm-test.txt) | `npm ci` und `npm test` des gesamten Bestands |
| [`03-gegenprobe.txt`](03-gegenprobe.txt), [`gegenprobe/`](gegenprobe/) | Gegenprobe gegen LibreOffice 26.8.1.1 (Abnahme 2) |
| [`04-antraege.txt`](04-antraege.txt) | Messungen zu den Änderungsanträgen HPC-0005 und HPC-0006 |
| [`05-belege-lauf.txt`](05-belege-lauf.txt), [`screenshots/`](screenshots/), [`messungen-reader.json`](messungen-reader.json), [`ohne-rechner.json`](ohne-rechner.json) | Ausfüllen im Reader, eingefrorene Fassung, Messung mit 10 000 Formelzellen (Abnahme 3, 4) |
| [`06-import.txt`](06-import.txt), [`import/`](import/) | Import aus ODS und XLSX mit Bericht (Abnahme 5) |
| [`07-epubcheck.txt`](07-epubcheck.txt) | epubcheck 5.4.0 über alle erzeugten Container |
| [`08-hpro-check.txt`](08-hpro-check.txt) | Konformitätsprüfer `hpro-check` über Beispiel, ausgefülltes Beispiel und Import |

## Was gebaut ist

- **Rechner im Kern** (`kern/src/calc/`, `hpro-calc` 0.1.1, Teil 3 v0.1): Parser für die
  OpenFormula-Teilmenge, Auswertung, Abhängigkeiten, Zirkelerkennung, Datums- und Zahlregeln,
  96 Funktionen der Liste 8.2, Prüfregeln, Wertverweise im Text. Außerdem Speichern mit
  `computedAt`/`calculator`/Verlauf, Einfrieren, Import aus ODS/FODS/XLSX und Export als CSV und
  OpenDocument-Tabelle.
- **Reader** (`app/src/calcview.ts`, `app/src/frame-agent.js`): Eingabezellen im Dokument
  ausfüllen; abhängige Zellen, Prüfregeln und Wertverweise rechnen ohne Neuladen neu. Der Dialog
  „Tabellen“ bietet Speichern des ausgefüllten Dokuments und Datenexport (CSV, ODS). Die eingefrorene
  Fassung wird mit Hinweisband angezeigt: Prüfsummen, Nachrechnung und Signatur.
- **Beispiel** `docs/spezifikation/beispiele/p19-kostenschaetzung` (Aufmaß, Preisliste, Kosten,
  Kennzahlen; Verweise zwischen Tabellen, Prüfregeln, Wertverweise im Text) und darin die signierte
  eingefrorene Fassung `nachweis-2026-10-12`.

## Abnahmekriterien

### 1. Funktionsumfang aus S6, Tests zählen die abgedeckten Funktionen – erfüllt

[`01-rechner-tests.txt`](01-rechner-tests.txt): Der Test `HPF-FN-001` zählt gegen
`docs/spezifikation/03-funktionen.json` (die maschinenlesbare Liste 8.2 aus S6, 96 Funktionen,
9 ausgeschlossen):

```
P19 Funktionsabdeckung: 96/96 regulär, 96/96 Fehlerfall, 281 Testfälle
```

Für jede Funktion gibt es einen eigenen Test (`✔ Funktion ABS` … ). Dazu kommen die Prüfverfahren
der Anforderungen aus Teil 3 (HPF-ADR, -CALC, -STO, -SEC, -IMP, -FRZ), die Referenzwerte R1–R30 aus
Abschnitt 16, Determinismus und Regressionen. Ergebnis: 183 Tests, 183 bestanden. Ausgeschlossene
Funktionen (`NOW`, `RAND`, `INDIRECT` …) ergeben `#NAME?` (HPF-FN-003).

### 2. Gegenprobe gegen LibreOffice – erfüllt (Excel nicht geprüft)

[`03-gegenprobe.txt`](03-gegenprobe.txt), Einzelwerte in
[`gegenprobe/vergleich-beispiel.txt`](gegenprobe/vergleich-beispiel.txt) (Kern und LibreOffice je
Zelle nebeneinander), Rohwerte in [`gegenprobe/libreoffice-werte.json`](gegenprobe/libreoffice-werte.json)
und [`gegenprobe/vergleich.json`](gegenprobe/vergleich.json).

Verfahren: Der Kern rechnet das Beispiel und exportiert es als `.fods`. LibreOffice bekommt eine
Kopie **ohne** die vom Kern zwischengespeicherten Ergebnisse (3298 Formelzellen geleert), lädt sie
ohne Oberfläche, rechnet mit `calculateAll` neu und gibt jeden Wert exakt aus (`repr` des binary64).
Der Vergleich läuft Zelle für Zelle.

| Fall | Formelzellen | gleich | abweichend |
|---|---|---|---|
| Beispiel wie gespeichert | 55 | 55 (davon 17 Wahrheitswerte: Kern `TRUE`, LibreOffice `1`) | 0 |
| Beispiel nach dem Ausfüllen (8 Eingaben wie im Reader-Test) | 55 | 55 | 0 |
| 25 deterministisch variierte Ausfüllungen | 1375 | 1371 | 4 (in 1 Datei, 1 Cent) |
| dieselben 25 mit Rundung nach Änderungsantrag HPC-0005 | 1375 | 1375 | 0 |
| alle Funktionstestfälle (Randfälle) | 371 | 290 | 81, alle eingeordnet |

LibreOffice hat keinen eigenen Typ für Wahrheitswerte; es speichert sie als Zahl 1/0 (Teil 3
Abschnitt 15). Darum zählen `TRUE` gegen `1` als gleich. Die eine abweichende Variante:
`ROUND(452,09 × 68,50; 2)`. Das Produkt ist binär `30968.164999999997`. Teil 3 0.1 (HPF-NUM-004)
rundet das auf 30 968,16, LibreOffice und das Rechnen auf Papier ergeben 30 968,17. Daraus ist der
Änderungsantrag [HPC-0005](../../spezifikation/aenderungen/HPC-0005.md) entstanden (Messung in
[`04-antraege.txt`](04-antraege.txt)). Die 81 Abweichungen bei den Randfällen hat das Skript nach
Art eingeordnet: Fehlercode 37 (LibreOffice `Err:502` statt `#VALUE!` u. a.), Festlegung Teil 3 19,
Text und Gebietsschema 7, Wahrheitswert 5, Genauigkeit 4, ausgeschlossene Funktion 9. Jede ist in
[`gegenprobe/vergleich-funktionen.txt`](gegenprobe/vergleich-funktionen.txt) mit Begründung
aufgeführt. Ungeklärt ist keine; bei einer ungeklärten Abweichung bricht das Skript mit Exit 1 ab.

**Excel: nicht geprüft.** Im Arbeitscontainer gibt es keine Excel-Installation, und das Kriterium
verlangt „LibreOffice oder Excel“. Die XLSX-Quelle für den Import ist mit LibreOffice erzeugt.

### 3. Ausfüllen im Dokument und Neuberechnung ohne Neuladen – erfüllt

Playwright-Test `Abnahme 3: ausfüllen und neu rechnen, ohne das Dokument neu zu laden`
(`app/e2e/tabellen.spec.ts`, Teil von `npm test`, [`02-npm-test.txt`](02-npm-test.txt)). Er füllt
acht Eingabezellen in drei Tabellen aus. Dabei prüft er, dass der Dokumentrahmen derselbe bleibt
(eine Marke im Rahmen überlebt alle Eingaben) und dass abhängige Zellen, Verweise zwischen Tabellen
(`kosten.C2 = [aufmass.F6]`) und Wertverweise im Text neu angezeigt werden. Gemessen:

```
P19 E2E Ausfüllen: aufmass.C2=13,10: Neu berechnet in 5,2 ms: 13 Zellen aktualisiert. | …
```

Screenshots: [`01`](screenshots/01-hauptfassung-vor-dem-ausfuellen-1440.png) vor dem Ausfüllen,
[`02`](screenshots/02-ausgefuellt-aufmass-1440.png)/[`03`](screenshots/03-ausgefuellt-kosten-1440.png)
ausgefüllt (1440 px und 390 px), [`04`](screenshots/04-pruefregel-nicht-erfuellt-1440.png) Prüfregel
nicht erfüllt (gekennzeichnet, nicht verhindert), [`05`](screenshots/05-dialog-tabellen-1440.png)
Dialog mit Speichern und Export. Speichern und Datenexport (CSV, ODS) prüft der Test
`Speichern des ausgefüllten Dokuments und Datenexport`.

**Last (HPF-CALC-007, ≤ 1 s bei 10 000 Formelzellen):** Im Kern dauern Eingabe, Neuberechnung und
Schreiben 81,1 ms (`02-npm-test.txt`). Im Reader vergehen von der Eingabe bis zur Anzeige der
letzten Zelle 588–626 ms, die Rechnung selbst braucht 60–76 ms
([`05-belege-lauf.txt`](05-belege-lauf.txt), [`messungen-reader.json`](messungen-reader.json)).
Gemessen wird mit einer Abfrage je Bildaufbau im Dokumentrahmen. Der Rest der Zeit geht auf das
Einsetzen der 10 000 Werte im Rahmen. Der Spielraum zur Grenze ist auf dieser Maschine kleiner als
der Faktor 2. In einem früheren Lauf hatte Playwrights gestufte Abfrage (100/250/500/1000 ms) bis zu
1337 ms gemeldet; das war ein Fehler der Messmethode, kein Rechenzeitproblem.

### 4. Eingefrorene Fassung ohne Rechner; Änderung erkennbar – erfüllt

- **Ohne Rechner:** [`ohne-rechner.json`](ohne-rechner.json) und
  [`screenshots/08-eingefroren-ohne-javascript-1440.png`](screenshots/08-eingefroren-ohne-javascript-1440.png).
  Chromium mit **abgeschaltetem JavaScript** öffnet das Dokument der eingefrorenen Fassung direkt aus
  dem Container. Ergebnis: 0 Skripte, 0 Eingabefelder, und jede Formelzelle zeigt den gespeicherten
  Wert (`"stored": "84.94"`, `"shown": "84,94"` …). Im Reader zeigt die Fassung die gespeicherten
  Werte mit dem Band „in dieser Fassung wird nicht gerechnet“
  ([`06`](screenshots/06-eingefroren-unveraendert-1440.png); Test `Abnahme 4: eingefrorene Fassung
  zeigt die gespeicherten Werte ohne Rechner`).
- **Änderung erkennbar:** Im Container wird ein Wert der eingefrorenen Fassung geändert (12 525,40
  statt 21 525,40). Der Reader meldet dann: „Achtung, diese eingefrorene Fassung wurde verändert …
  Dateien VERÄNDERT … Signatur: ungültig – Inhalt nach dem Signieren verändert
  (TOTAL_FAILED/HASH_FAILURE) · Nachrechnung: 1 Abweichung(en) …“
  ([`07`](screenshots/07-eingefroren-veraendert-1440.png), Wortlaut in `messungen-reader.json`;
  Test `Abnahme 4: eine Änderung an der eingefrorenen Fassung ist als verändert erkennbar`). Im Kern
  prüfen dasselbe `HPF-FRZ-005, HP-PROF-010` und `HP-PROF-009` (Ausfüllen der Hauptfassung berührt
  die Signatur der Fassung nicht).

### 5. Nicht unterstützte Funktionen beim Import eingefroren und im Bericht – erfüllt

[`06-import.txt`](06-import.txt), Container und Berichte in [`import/`](import/). Importiert werden
eine ODS- und eine XLSX-Datei aus LibreOffice (`kern/test/fixtures/p19-quelle.*`, erzeugt mit
`scripts/p19-importquellen.py`). Die ODS-Datei: 19 Formeln, davon 8 übernommen und 11 als Wert
eingefroren. Gründe: `NOW`, `INDIRECT`, `RAND`, `TEXT`, `CEILING`, `XLOOKUP` (Funktion nicht im
Umfang), `SUM(B:B)` (ganze Spalte), Matrixkonstante, Aufruf einer Basic-Funktion und zwei
Zirkelbezüge. Drei Makroteile werden nicht übernommen. Für jede eingefrorene Zelle prüft das
Skript: keine Formel mehr im Dokument, Kennzeichnung `data-hp-import="frozen"`, Wert wie in der
Quelle, Eintrag im Bericht `data/import-report.json`. Außerdem prüft es, dass der Hinweis oben im
Dokument dieselben Zahlen nennt wie der Bericht. Die übernommenen Formeln rechnen wie die Quelle
(0 Abweichungen).

Befund und Korrektur in diesem Lauf: Der Hinweis im Dokument hatte die Zirkelbezüge nicht
mitgezählt („8 Formeln“ statt 11), weil diese erst nach der Nachrechnung eingefroren werden. Er wird
jetzt nach dem Einfrieren neu gesetzt; der Test `HPF-IMP-001/002/003` prüft das.

### 6. Belege unter docs/belege/P19/ – erfüllt

Diese Datei und die oben verlinkten Dateien.

## Validatoren

- **epubcheck 5.4.0** ([`07-epubcheck.txt`](07-epubcheck.txt)): Beispiel als Container, ausgefülltes
  Beispiel und beide Importe ohne Befund. `app/dist/kostenschaetzung.hpro` mit eingefrorener Fassung:
  6 × `RSC-011` für Verweise **innerhalb** der Fassung. Das ist der bekannte Widerspruch der
  Spezifikation: Fassungsdokumente dürfen nach HPR-CONT-009 nicht im Spine stehen, EPUB erlaubt
  Verweise nur auf Spine-Einträge. Offen über den Änderungsantrag
  [HPC-0003](../../spezifikation/aenderungen/HPC-0003.md), siehe auch `docs/belege/S3/README.md`.
  In diesem Lauf behoben: `RSC-012` für die Wertverweise `#kosten.F11` und `#aufmass.F6`. Die
  Zielzellen tragen jetzt diese `id`, wie in S3 für Gutfälle festgelegt.
- **hpro-check** ([`08-hpro-check.txt`](08-hpro-check.txt)): Ausgefülltes Beispiel 0 Fehler,
  0 Warnungen. Import 0 Fehler, 1 Warnung (die Quelle hat keine Kopfzellen; der Importer erfindet
  keine). Beispiel mit Fassung: 1 Fehler, das ist `RSC-011` (wie oben); dazu 1 Warnung (Signatur
  ohne Zeitstempel, Niveau B; Fernsignatur und Zeitstempel sind Paket P10) und Hinweise zur nur
  teilweise signierten Datei. Behoben in diesem Lauf: Kopfzellen mit `scope` im Beispiel,
  Umbruchregeln im Stylesheet und eine eigene `urn:uuid:`-Kennung für das Manifest der eingefrorenen
  Fassung (HPR-META-005; vorher `urn:uuid:…#nachweis-…`).

## Nicht geprüft und offen

- **Excel:** nicht geprüft, keine Installation verfügbar (siehe Kriterium 2).
- **HPF-FRZ-004** (Signaturdialog in der Oberfläche): nicht geprüft; die Oberfläche signiert noch
  nicht (Paket P17). Die Fassung im Beispiel ist mit dem Kern signiert (Testschlüssel).
- **HPF-ADR-005** (Zeilen einfügen und löschen): nicht gebaut; der Bearbeiter ist Paket P5.
- **HPF-FRZ-007:** Einfrieren bietet nur die Profile `static` und `signed`, nicht `archive`.
- Die Dokumentregeln aus Teil 3 (HPF-SYN-002/007, HPF-ADR-001 …) stehen noch nicht im
  Konformitätsprüfer `hpro-check` (Teil 3, Abschnitt 17.3).
- Änderungsanträge aus diesem Paket: [HPC-0005](../../spezifikation/aenderungen/HPC-0005.md)
  (Rundung auf 15 signifikante Stellen) und [HPC-0006](../../spezifikation/aenderungen/HPC-0006.md)
  (Klarstellungen aus der Umsetzung), beide mit Frist bis 09.11.2026. Der Kern rechnet nach Teil 3
  0.1; die Rundung nach HPC-0005 ist als Option `rounding: 'significant15'` gebaut, aber nicht
  voreingestellt.
- `soffice --version` scheitert an einer fehlenden X-Bibliothek. Die Gegenprobe ist davon nicht
  betroffen, weil sie über `soffice.bin --headless` und UNO läuft; die Version meldet LibreOffice
  dort selbst.
