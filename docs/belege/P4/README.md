# Belege P4 – Reader als Web-App (MVP)

**Stand:** 12.10.2026 · **Code:** [`app/`](../../../app/) (Aufbau und Grenzen in
[`app/README.md`](../../../app/README.md)) · **Browser der Tests:** Chromium Headless Shell
156.0.8078.4 (Playwright 1.64.0) · **Node:** v26.5.1

Alle Dateien in diesem Ordner sind Ausgaben echter Läufe. Die Textdateien enthalten die Ausgaben
wörtlich, mit Befehl und Exit-Code.

| Datei | Inhalt |
| --- | --- |
| [`01-npm-ci.txt`](01-npm-ci.txt) | `npm ci --no-audit --no-fund` im Repository |
| [`02-npm-test.txt`](02-npm-test.txt) | vollständiger `npm test` im Repository (Kern, App mit Unit- und E2E-Tests, alle Prüfskripte) |
| [`03-epubcheck.txt`](03-epubcheck.txt) | epubcheck 5.4.0 auf dem Beispielcontainer, den der Build erzeugt |
| [`04-hpro-check.txt`](04-hpro-check.txt) | Konformitätsprüfer `hpro-check` (S3) auf demselben Container |
| [`05-belege-lauf.txt`](05-belege-lauf.txt) | `npm run belege -w app`: Build und Belegelauf, der die folgenden Dateien schreibt |
| [`screenshots/`](screenshots/) | 19 Bildschirmfotos in drei Breiten, Liste in [`screenshots.json`](screenshots.json) |
| [`messungen.json`](messungen.json) | Umfließen in 7 Breiten, Zoom, Seitengeometrie, Regeln ohne Engine im Prüfer, Ladezeit |
| [`axe-ergebnis.json`](axe-ergebnis.json) | axe-core über 9 Szenarien, mit allen Verstößen jeder Schwere und den unentschiedenen Prüfungen |

## Abnahmekriterien

| Nr. | Kriterium | Ergebnis | Beleg |
| --- | --- | --- | --- |
| 1 | `npm test` grün; Smoke-Test mit Playwright öffnet einen Container und prüft Inhaltsverzeichnis, Suche und Umschaltung der Ansicht | **erfüllt.** `npm test` endet mit Exit-Code 0. App: 29 Unit-Tests (vitest), 26 E2E-Tests (Playwright) bestanden. Der Smoke-Test öffnet `beispiel.hpro` über die Dateiauswahl und prüft Inhaltsverzeichnis (12 Einträge, Sprung in beide Inhaltsdokumente, `aria-current`), Suche (Treffer nur in zugeklapptem `details`, Sprung öffnet es; Treffer über zwei Inhaltsdokumente; kein Treffer) und Umschaltung fließend ↔ Seiten (A4-Seitenboxen, Kopf- und Fußzeile, keine Blöcke im Seitenrand, Rückweg ohne Reste) | [`02-npm-test.txt`](02-npm-test.txt), Zeilen „Test Files 5 passed“, „Tests 29 passed“, „26 passed“; Tests in [`app/e2e/reader.spec.ts`](../../../app/e2e/reader.spec.ts) |
| 2 | Screenshots in drei Breiten (Telefon, Tablet, Desktop) | **erfüllt.** Telefon 390 × 844, Tablet 820 × 1180, Desktop 1440 × 900; je Breite Startseite, fließend, breite Tabelle, Seitenansicht, Suche; Telefon und Tablet zusätzlich Treffer und Inhaltsverzeichnis als Überlagerung | [`screenshots/`](screenshots/) |
| 3 | PWA-Manifest und Service Worker vorhanden; Offline-Start im Test belegt | **erfüllt.** [`manifest.webmanifest`](../../../app/public/manifest.webmanifest) und [`sw.ts`](../../../app/src/sw.ts). Chromium meldet für das Manifest `errors: []` und `installabilityErrors: []` (CDP `Page.getAppManifest`, `Page.getInstallabilityErrors`). Offline-Test: Service Worker aktiv und steuert die Seite, Cache enthält Hülle, Assets und Beispiel; danach `context.setOffline(true)`: eine nicht gecachte URL schlägt fehl, Neuladen und ein neuer Tab kommen aus dem Service Worker (`response.fromServiceWorker() === true`), Beispiel öffnen, suchen, Seitenansicht und Öffnen einer lokalen Datei funktionieren, keine fehlgeschlagene Anfrage | [`02-npm-test.txt`](02-npm-test.txt) (Tests 10 und 11), [`app/e2e/offline.spec.ts`](../../../app/e2e/offline.spec.ts) |
| 4 | Barrierefreiheits-Grundprüfung mit axe-core ohne schwere Verstöße | **erfüllt.** axe-core 4.14 mit den Tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, `best-practice` über Oberfläche **und** Dokumentrahmen, 9 Szenarien: **0 Verstöße jeder Schwere** (kritisch, schwer, mittel, gering). Der Test in `npm test` bricht bei kritischen oder schweren Verstößen ab | [`axe-ergebnis.json`](axe-ergebnis.json), [`02-npm-test.txt`](02-npm-test.txt) (Tests 1–9) |

### axe-core je Szenario

| Szenario | Fenster | bestandene Regeln | Verstöße | von axe nicht entschieden |
| --- | --- | --- | --- | --- |
| Startseite | 390×844 | 38 | 0 | – |
| Dokument, fließend | 390×844 | 55 | 0 | color-contrast (36 Knoten) |
| Dokument, fließend | 1440×900 | 55 | 0 | – |
| Dokument, Seitenansicht | 1440×900 | 55 | 0 | color-contrast (114 Knoten) |
| Suche mit Treffern, aufgeklappte Details | 1440×900 | 59 | 0 | – |
| Inhaltsverzeichnis als Überlagerung | 390×844 | 55 | 0 | color-contrast (36 Knoten) |
| Anhang mit gestapelter Tabelle | 390×844 | 49 | 0 | – |
| Dialog Darstellung, dunkles Schema | 820×1180 | 59 | 0 | – |
| Hoher Kontrast | 820×1180 | 55 | 0 | – |

„Nicht entschieden“ (axe: *incomplete*) betrifft nur den Kontrast. Der Grund laut axe:
„background color could not be determined because it's partially obscured / overlapped by
another element“. Betroffen sind Tabellenzellen außerhalb des sichtbaren Scrollbereichs (Telefon)
und Text über den A4-Seitenboxen, die als eigene Ebene hinter dem Text liegen (Seitenansicht).
Deshalb rechnet der Belegelauf diese Kontraste selbst nach (WCAG-2.2-Formel, Vordergrund gegen den
tatsächlichen Hintergrund; AA verlangt 4,5:1):

| Farbschema | Seitenansicht, 125 Textelemente: kleinstes Verhältnis | Kostentabelle am Telefon, 64 Zellen: kleinstes Verhältnis |
| --- | --- | --- |
| hell | 9,74:1 (Kopf-/Fußzeile #444 auf Weiß) | 16,88:1 |
| dunkel | 13,43:1 | 13,43:1 |
| hoher Kontrast | 19,56:1 | 21:1 |

## Weitere Messungen ([`messungen.json`](messungen.json))

- **Umfließen (HP-RS-010):** in 320, 390, 768, 820, 1280, 1440 und 1920 px für beide
  Inhaltsdokumente `scrollWidth ≤ clientWidth`, sowohl im Dokumentrahmen als auch in der
  Oberfläche (14 von 14 Messungen). Die breite Kostentabelle liegt in einem eigenen Scrollbereich
  (`role="region"`, per Tastatur erreichbar), die Raumliste wird am Telefon gestapelt.
- **Zoom in der fließenden Ansicht:** Absatzschrift 16 → 32 → 48 px bei 100/200/300 %, in 390 px
  Breite weiter ohne waagrechtes Scrollen (390 = 390).
- **Seitenansicht:** 4 Seiten, Seitenbox 794 × 1123 px (Soll A4 bei 96 dpi: 793,7 × 1122,5),
  Kopfzeile mit dem Titel, Fußzeile der letzten Seite „Seite 4 von 4“. Bei 390 px wird die Seite
  auf 0,471 verkleinert. Die Umbrüche sind in jeder Fensterbreite und Scrollposition gleich
  (eigener Test).
- **Regeln, die `hpro-check` mangels Browser-Engine nicht entscheidet**, mit dem Prüfverfahren
  des Regelkatalogs im Dokumentrahmen gemessen:
  - HPR-INH-004: 320/768/1280 px, beide Inhaltsdokumente ohne waagrechtes Scrollen.
  - HPR-INH-006: `--hp-font-size: 200%` und `--hp-line-height: 2` auf dem Rahmen → Schrift aller
    20 Absätze 16 → 32 px (Faktor 2,00); Zeilenhöhe 24,8 → 64 px, also genau 2 × Schriftgröße.
    Gegenüber dem Ausgangswert ist das Faktor 2,58, weil das Dokument vorher 1,55 hatte. Der
    Katalog verlangt „verdoppeln gegenüber dem Ausgangswert“; für die Zeilenhöhe ist das nur
    erfüllbar, wenn die Vorgabe des Dokuments 1 ist. Das ist eine Unschärfe im Prüfverfahren, die
    ich hier nur benenne und nicht entscheide.
  - HPR-INH-022: mit `prefers-reduced-motion: reduce` nach 5 s 0 Animationen, 0 Medien in
    Wiedergabe.
- **Öffnen bis Darstellung** (Dateiauswahl bis Rahmen bereit, 9,8 kB Container, 5 Läufe): Median
  67 ms.

## Container-Prüfungen

```
$ java -jar epubcheck.jar app/.scratch/epub/beispiel.epub      (byte-identische Kopie von app/dist/beispiel.hpro)
Validating using EPUB version 3.4 rules.
No errors or warnings detected.
Messages: 0 fatals / 0 errors / 0 warnings / 0 infos
[Exit-Code 0]

$ npm run -s hpro-check -- app/dist/beispiel.hpro
Befunde: 0 fatal, 0 Fehler, 0 Warnungen, 0 Hinweise, 4 nicht geprüft
Stufe Basis: unbestimmt
[Exit-Code 3]
```

`hpro-check` kann die Stufe Basis nicht feststellen, weil drei Regeln eine Browser-Engine brauchen
(HPR-INH-004, -006, -022; im Reader gemessen, siehe oben) und HPR-LOCK-005 eine Liste redigierter
Begriffe erwartet (das Beispiel hat keine Schwärzungen). Exit-Code 3 bedeutet laut Prüfer „eine
Stufe ist unbestimmt“, nicht „Fehler“. Der Container ist reproduzierbar; der SHA-256 steht in
[`03-epubcheck.txt`](03-epubcheck.txt). Eine erste Fassung des Beispiels hatte 9 Warnungen
HPR-INH-024 (fehlende Umbruchregeln im Stylesheet); die Regeln sind ergänzt.

## Fehler, die die Tests gefunden haben (behoben)

- **Offline-Start:** Der Service Worker fand JS und CSS nicht im Cache, weil der Server
  `Vary: Origin` sendet und Modul-Skripte einen `Origin`-Kopf tragen. Behoben mit `ignoreVary`
  (nur eigene Dateien im Cache).
- **Seitenansicht:** Die Umbrüche hingen von der Scrollposition ab (5 statt 4 Seiten, wenn vor dem
  Umschalten gescrollt war), weil die Scroll-Verankerung des Browsers beim Einfügen der Umbrüche
  den Bezugspunkt verschob. Behoben; ein Test prüft jetzt gleiche Umbrüche in 1440 px, nach
  Scrollen und in 390 px.
- **320 px:** Der lange Titel verbreiterte die Oberfläche auf 559 px (Grid-Spalte mit
  Mindestbreite aus dem Inhalt). Behoben.
- **axe `landmark-unique` (mittel):** zwei unbenannte `main` (Oberfläche und Dokument). Die
  Oberfläche heißt jetzt „Leseansicht“.

## Nicht geprüft

| Was | Grund |
| --- | --- |
| Firefox, Safari/WebKit, echte Mobilgeräte | nur Chromium Headless Shell installiert; Engine-Testsuite ist Paket P13 |
| Screenreader (NVDA, VoiceOver, TalkBack, Orca) | kein Screenreader in der Umgebung; axe-core prüft nur den Accessibility-Baum automatisch |
| Installation als PWA und Öffnen per Doppelklick (`file_handlers`) | kopflose Umgebung ohne Desktop; Chromium meldet aber keine Installierbarkeitsfehler |
| Gleiche Umbrüche in Seitenansicht und PDF-Ausdruck (HP-PRINT-014) | Druckweg ist Paket P18; die Seitenansicht nutzt Seitenbox und Umbruchregeln des Druckprofils, aber keine Druck-Engine |
| Signaturprüfung im Reader | nicht Teil von P4; der Info-Dialog nennt vorhandene Signaturdateien und sagt, dass sie nicht geprüft werden |
| Große Dokumente (Hunderte Seiten, große Medien) | nur das Beispiel mit 9,8 kB gemessen |

## Nebenbefund

`createContainer` aus dem Kern hat im Unit-Test ein Stylesheet mit
`url(https://example.org/t.png)` in einen Container des Profils `static` geschrieben. Externe
Verweise in XHTML lehnt der Kern ab, in CSS nicht. Der Reader lädt solche Ressourcen nicht (CSP
ohne Netzquelle, `url()` wird durch `data:,` ersetzt). Ob `hpro-check` das meldet, habe ich
**nicht geprüft**; das gehört zu P1/S3.

## Hinweis zum Repository

Der Zwischenstand `d5e670f` hatte die Playwright-Browser (`app/.browsers/`, rund 230 MB, darunter
eine 207-MB-Binärdatei) eingecheckt. Sie sind jetzt aus dem Index entfernt und in `.gitignore`
eingetragen; `npm run e2e -w app` installiert sie bei Bedarf neu. In der Git-Historie bleiben sie
erhalten; das ließe sich nur durch Umschreiben der bereits gepushten Historie beheben, was ich
nicht getan habe.

## Wiederholen

```sh
npm ci --no-audit --no-fund
npm test                      # enthält Build und E2E-Tests der App
npm run belege -w app         # schreibt screenshots/, messungen.json, axe-ergebnis.json neu
npm run -s hpro-check -- app/dist/beispiel.hpro
```
