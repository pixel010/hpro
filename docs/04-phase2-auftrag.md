# Phase 2 — Machbarkeit und Plattform

**Stand:** 11.10.2026. Aufbauend auf `01-stand-der-technik.md`, `02-acrobat-pro-funktionsumfang.md`
und `03-konzept.md`.

Zwei Fragen entscheiden, ob hpro weitergebaut wird:

1. **Container:** Kann eine Datei **gleichzeitig** als EPUB gelesen und als ASiC-E signiert/geprüft
   werden? Das entscheidet, ob hpro ohne eigenen Reader auskommt (Rückfallebene: jeder
   EPUB-Reader) und trotzdem rechtssicher signierbar ist.
2. **Plattform:** Ein Codekern, **alle Plattformen, gleicher Funktionsumfang** — was geht wirklich?

## A. Container-Experiment (Kernstück)

1. Baue einen minimalen Container nach dem OCF-Muster: `mimetype` (erste Datei, **unkomprimiert**
   gespeichert), `META-INF/container.xml`, OPF-Manifest, XHTML-Inhalt, CSS. Ein Skript im Repo
   (`prototyp/`) erzeugt ihn reproduzierbar, mit Manifest als JSON.
2. Dann die Messungen, jeweils mit **wörtlicher Ausgabe** im Ergebnisdokument:
   - Ist der Container als EPUB gültig? (`epubcheck`, aktuelle Version)
   - Lässt er sich als ASiC-E signieren und validiert die Signatur anschließend?
   - **Die eigentliche Frage:** Stören sich beide? Prüfe die Kreuzfälle:
     - ASiC-E-Signaturdateien (`META-INF/signatures.xml`, `META-INF/*.p7s`) im EPUB — was sagt
       epubcheck, was sagt ein EPUB-Reader?
     - EPUB-`mimetype`-Datei im ASiC-E — was sagt die Signaturprüfung?
     - Ändert der Mime-Typ des Containers etwas (Dateiendung `.hpro` vs. `.epub` vs. `.asice`)?
3. **Werkzeuge:** Java fehlt im Container, `epubcheck` braucht es. Ein JRE (z. B. Temurin) als
   Tarball **ins Arbeitsverzeichnis** laden ist in Ordnung, ebenso das epubcheck-JAR und
   Python-Pakete in eine venv **im Repo**. Keine Docker-Operationen, keine Installationen außerhalb
   des Repos, kein `sudo`.
4. **Keine erfundenen Testergebnisse.** Was nicht prüfbar war, wird als **nicht geprüft** ausgewiesen
   — mit Angabe, welches Werkzeug gefehlt hätte und wie man es nachholt.

## B. `docs/06-plattform-und-funktionsmatrix.md`

Zielbild des Auftraggebers: **ein Codekern, alle Plattformen, gleicher Funktionsumfang** — Web/PWA,
Windows, macOS, Linux, iOS, Android.

- Technologien vergleichen und bewerten (mit Belegen): Tauri 2 (Desktop und mobil), Electron,
  Capacitor, PWA, React Native, Flutter. Kriterien: Funktionsumfang je Plattform, Paketgröße,
  Systemzugriff, Signaturfähigkeit, Wartbarkeit, Auslieferung über Stores (Apple, Google, Microsoft),
  Barrierefreiheit der Hülle.
- **Funktionsmatrix:** die Funktionsgruppen aus `02-acrobat-pro-funktionsumfang.md` × Plattform, je
  Zelle *verfügbar / eingeschränkt / nicht möglich* **mit Begründung**. Ehrlich sein bei:
  qualifizierter Signatur (Secure Element, ID Austria, Kartenleser), Kamera-Scan, OCR (lokal vs.
  Server), Druck, Dateisystemzugriff, Hintergrund- und Stapelverarbeitung, Zwischenablage,
  Barrierefreiheits-APIs.
- Klar ausformulieren, was „gleicher Funktionsumfang" realistisch heißt: identischer Kern auf allen
  Plattformen, dokumentierte Ausnahmen nur dort, wo die Plattform es technisch nicht hergibt — jede
  Ausnahme mit Beleg.

## C. `docs/05-prototyp-ergebnisse.md`

Aufbau, Befehle, wörtliche Ausgaben, Ergebnis, offene Punkte. Kurz genug, dass der Auftraggeber es
in fünf Minuten liest, vollständig genug, dass ein zweiter Entwickler die Messungen wiederholen kann.

## D. `docs/03-konzept.md` nachziehen

Wenn der Prototyp etwas am Format oder an der Architektur ändert: Abschnitt „Nachtrag Phase 2" am
Ende ergänzen — was sich ändert und warum. Wenn nichts kippt, das ausdrücklich festhalten.

## E. Abschluss

Alles committen (klare deutsche Commit-Nachricht), **nicht pushen**. Kurze Zusammenfassung ausgeben:
Dateien, Befehle, Ergebnisse, offene Punkte, Aufwandsklasse für die nächste Phase (Bandbreite).

## Arbeitsregeln

Deutsch, Markdown, Tabellen wo sie helfen. Jede Aussage belegbar oder als offene Frage markiert.
Aufwand und Kosten als Bandbreite. Keine Docker-Operationen.
