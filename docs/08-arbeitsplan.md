# 08 – Arbeitsplan (selbstständiger Lauf)

Stand: 2026-10-11. Diese Datei wird von `runner/auto_lauf.py` aus `runner/plan.json` erzeugt — nicht von Hand ändern.

Ein Lauf nimmt das erste offene Paket, dessen Abhängigkeiten fertig sind, lässt daran arbeiten, prüft das Ergebnis nach und committet. Scheitert ein Paket zweimal, gilt es als blockiert und wird dem Auftraggeber gemeldet.

| Paket | Titel | Modell | Abhängig von | Status |
| --- | --- | --- | --- | --- |
| P1 | Projektgerüst und Container-Kern in TypeScript | opus | – | fertig |
| P2 | Signaturprüfung ohne Java | opus | P1 | fertig |
| P3 | Signieren im Kern (AdES-Baseline-B) und eigener ZIP-Schreiber | opus | P1, P2 | offen |
| P4 | Reader als Web-App (MVP) | opus | P1 | offen |
| P5 | Editor: strukturierte Bearbeitung, echtes Redigieren, Versionierung | opus | P4 | offen |
| P6 | Formulare mit Berechnung, Bedingung und Validierung | opus | P4 | offen |
| P7 | Kommentare, Review und Vergleich zweier Fassungen | sonnet | P4 | offen |
| P8 | Barrierefreiheits-Prüflauf | sonnet | P4 | offen |
| P9 | PDF-Import, PDF-Export und OCR | opus | P4 | offen |
| P10 | Fernsignatur (CSC) und Zeitstempel (RFC 3161) | opus | P3 | offen |
| P11 | Desktop-Hülle (Tauri 2) für Windows, macOS und Linux | opus | P4 | offen |
| P12 | Mobil-Hüllen mit Abbruchkriterien (iOS und Android) | opus | P11 | offen |
| P13 | Cross-Engine-Testsuite und CI | sonnet | P4 | offen |
| P14 | Release, Paketierung und Demo-Dokumente | sonnet | P4, P5, P6 | offen |

**2 von 14 Paketen fertig.**

## Pakete im Detail

### P1 – Projektgerüst und Container-Kern in TypeScript

*Status:* fertig

**Ziel.** npm-Workspace mit dem Paket kern/ (@html-pro/kern) in TypeScript. Der Kern liest und schreibt Container exakt nach den in docs/05 und prototyp/ belegten Regeln: mimetype unkomprimiert als erste Datei mit Inhalt application/epub+zip, META-INF/container.xml, package.opf, XHTML-Inhalt, manifest.json mit SHA-256 je Ressource. Typen und Schnittstellen für Storage/Signer/Validator/Scanner/Ocr/PdfImport/PdfExport wie in docs/06 Abschnitt 4.1, ohne Implementierungen.

**Abnahme.**

- npm ci && npm test laufen im Repo ohne Fehler durch
- Der Kern erzeugt einen Container, der mit prototyp/tools/epubcheck-5.4.0 (JDK 21 aus prototyp/tools/) 0 Fehler und 0 Warnungen bekommt; Ausgabe wird in docs/belege/ abgelegt
- Das Hash-Manifest wird nach dem Schreiben rückgelesen und geprüft (Test deckt eine manipulierte Ressource ab)
- Zwei Läufe erzeugen Container mit identischem Inhalt (Vergleich der Einträge und Hashes, nicht zwingend byte-identisch)

**Ergebnis.** Lauf 20261011-1327, Versuch 1, Prüfung: 10 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### P2 – Signaturprüfung ohne Java

*Status:* fertig

**Ziel.** XAdES-Baseline-B-Prüfung im TypeScript-Kern: Signaturwert, Digest über die signierten Dateien, Bezug zwischen Signatur und Containerinhalt, Manipulationserkennung. Löst offene Frage 12 aus docs/06, Abschnitt 5.

**Abnahme.**

- Der Kern prüft die Container aus prototyp/ergebnisse/container/ und kommt zum selben Urteil wie EU DSS (gültig bzw. HASH_FAILURE)
- Ein Testfall verändert eine Datei im Container und erwartet HASH_FAILURE
- Testergebnis als JSON in docs/belege/, mit Gegenüberstellung zur DSS-Ausgabe

**Ergebnis.** Lauf 20261011-1348, Versuch 1, Prüfung: 113 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### P3 – Signieren im Kern (AdES-Baseline-B) und eigener ZIP-Schreiber

*Status:* offen

**Ziel.** Der Kern signiert Container selbst (Software-Schlüssel über WebCrypto, Testzertifikat) und schreibt sie mit korrektem mimetype. Kein Java im Pfad.

**Abnahme.**

- Der erzeugte signierte Container besteht epubcheck 5.4.0 mit 0 Fehlern
- Derselbe Container wird vom Java-Werkzeug prototyp/dss (DSS 6.5) als gültig bestätigt (TOTAL_PASSED), Beleg in docs/belege/
- Nach einer Manipulation meldet die eigene Prüfung HASH_FAILURE und DSS ebenfalls

---

### P4 – Reader als Web-App (MVP)

*Status:* offen

**Ziel.** app/ als Vite-TypeScript-Web-App: Dokument öffnen, reflowable Darstellung für kleine Displays, feste Seitenansicht als Alternative, Inhaltsverzeichnis, Suche über den Text, Zoom, Tastaturbedienung, PWA-Manifest und Service Worker für Offlinebetrieb.

**Abnahme.**

- npm test grün; ein Smoke-Test mit Playwright öffnet einen Container und prüft Inhaltsverzeichnis, Suche und Umschaltung der Ansicht
- Screenshots in drei Breiten (Telefon, Tablet, Desktop) in docs/belege/
- PWA-Manifest und Service Worker vorhanden; Offline-Start im Test belegt
- Barrierefreiheits-Grundprüfung mit axe-core ohne schwere Verstöße

---

### P5 – Editor: strukturierte Bearbeitung, echtes Redigieren, Versionierung

*Status:* offen

**Ziel.** Bearbeiten auf Strukturebene (Überschriften, Listen, Tabellen, Fußnoten, Querverweise) statt Overlay. Redaktion entfernt Daten wirklich, mit Prüfprotokoll. Änderungsverlauf mit Diff zwischen zwei Fassungen.

**Abnahme.**

- Tests: bearbeiteter Text steht im Containerinhalt (nicht in einer Overlay-Schicht), Beweis über Rohausgabe des Containers
- Redaktion: nach dem Entfernen ist der Text im Container und in der Textsuche nicht mehr auffindbar; Protokoll wird mitgeschrieben
- Diff zwischen zwei Fassungen erkennt eine geänderte Überschrift, einen geänderten Absatz und ein entferntes Bild

---

### P6 – Formulare mit Berechnung, Bedingung und Validierung

*Status:* offen

**Ziel.** Felder anlegen und ausfüllen, Berechnungen, bedingte Abschnitte, Validierung vor Absenden, Datenexport (JSON) und PDF-Export der ausgefüllten Fassung. Löst den Randfall aus docs/07, Abschnitt 3d, mit Web-Standardmitteln.

**Abnahme.**

- Tests decken Berechnung, Bedingung und Validierungsfehler ab
- Ein Beispielfomular (Finanz-/Antragsformular) liegt als Container in docs/belege/
- Datenexport ist schema-geprüft; ohne gültige Eingaben kein Absenden

---

### P7 – Kommentare, Review und Vergleich zweier Fassungen

*Status:* offen

**Ziel.** Anmerkungen, Hervorhebungen, Freihand, Kommentarthreads mit Status (offen/erledigt), Export der Anmerkungen, Dokumentvergleich.

**Abnahme.**

- Tests für Anlegen, Beantworten, Erledigen und Export von Anmerkungen
- Anmerkungen bleiben im Container erhalten und sind mit dem Reader ohne Datenverlust wieder lesbar

---

### P8 – Barrierefreiheits-Prüflauf

*Status:* offen

**Ziel.** Eingebauter Prüflauf mit direktem Korrekturweg: Struktur, Lesereihenfolge, Alternativtexte, Kontrast, Sprache, Tabellenköpfe, Fokusführung.

**Abnahme.**

- Prüflauf findet in einem absichtlich fehlerhaften Testdokument mindestens fünf Kategorien
- Korrekturvorschläge sind anwendbar und der zweite Lauf ist fehlerfrei
- axe-core-Prüfung der Oberfläche ohne schwere Verstöße

---

### P9 – PDF-Import, PDF-Export und OCR

*Status:* offen

**Ziel.** Selbst hostbarer Dienst (dienst/) für PDF-Export (WeasyPrint + veraPDF), PDF-Import (Docling) und OCR (Tesseract), plus Kern-Adapter. Grenzen des Imports ehrlich dokumentieren (Layoutrekonstruktion).

**Abnahme.**

- Export: ein Container wird zu PDF, das PDF besteht veraPDF-Prüfung; Beleg in docs/belege/
- Import: ein PDF mit Text und Bild wird zu einem Container, der epubcheck besteht
- OCR: gescanntes PDF wird durchsuchbar; Qualitätsangabe mit Messgröße
- Grenzen des Imports in docs/ dokumentiert, mit Beispielen misslungener Umwandlung

---

### P10 – Fernsignatur (CSC) und Zeitstempel (RFC 3161)

*Status:* offen

**Ziel.** Schnittstelle für Fernsignatur nach CSC (A-Trust als Beispiel) und RFC-3161-Zeitstempel im Kern, mit Mock-Dienst für Tests. Zugangsdaten des Anbieters liegen nicht vor, deshalb Vertrag und Testdoppel.

**Abnahme.**

- Signatur über den Mock-Dienst ist im Kern prüfbar
- Zeitstempel wird gegen einen öffentlichen RFC-3161-Dienst geprüft, Ergebnis in docs/belege/
- Was für den echten Anbieter fehlt, steht als offener Punkt in docs/

---

### P11 – Desktop-Hülle (Tauri 2) für Windows, macOS und Linux

*Status:* offen

**Ziel.** huelle/ mit Tauri 2 um denselben Web-Kern: Dateizuordnung, Öffnen/Speichern, Sidecar für die lokalen Dienste, Signatur über Systemschlüssel. Rust-Toolchain wird im Arbeitsverzeichnis installiert.

**Abnahme.**

- Release-Build für Linux läuft und öffnet einen Container aus dem Dateimanager (Beleg)
- Tauri-Befehle sind auf das Nötige beschränkt; das Dokument-iframe erreicht keinen Befehl (Test)
- Paketgröße gemessen und in docs/ dokumentiert

---

### P12 – Mobil-Hüllen mit Abbruchkriterien (iOS und Android)

*Status:* offen

**Ziel.** Spike nach docs/06 Abschnitt 4.4: Tauri 2 auf Android und iOS mit den fünf Abbruchkriterien. Fällt der Spike durch, wird Capacitor vorbereitet.

**Abnahme.**

- Alle fünf Abbruchkriterien einzeln mit Beleg geprüft, Ergebnis je Kriterium ja/nein
- Bei Nein: dokumentierte Empfehlung Capacitor mit Begründung
- Aufwand des Spikes gegen die Schätzung 0,5 bis 1 PM gestellt

---

### P13 – Cross-Engine-Testsuite und CI

*Status:* offen

**Ziel.** Testsuite, die dieselbe Datei in Chromium, WebKit und Firefox rendert und Unterschiede sichtbar macht; GitHub-Actions-Läufe für Tests, epubcheck und Build.

**Abnahme.**

- CI-Lauf grün, Beleg über die GitHub-API oder den Aktionsverlauf
- Mindestens ein echter Engine-Unterschied ist dokumentiert oder ausdrücklich widerlegt
- Testmatrix in docs/ beschrieben

---

### P14 – Release, Paketierung und Demo-Dokumente

*Status:* offen

**Ziel.** Erste öffentliche Version: Bauanleitung, Pakete, drei Demo-Dokumente (Bericht, Formular, signierter Nachweis), Kurzdokumentation für Anwender, Lizenz.

**Abnahme.**

- Reproduzierbarer Build mit einer Anleitung, die ein Fremder befolgen kann
- Drei Demo-Container im Repo, jeder besteht epubcheck und die eigene Prüfung
- Lizenz festgelegt und im Repo vermerkt

---
