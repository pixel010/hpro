# 08 – Arbeitsplan (selbstständiger Lauf)

Stand: 2026-10-14. Diese Datei wird von `runner/auto_lauf.py` aus `runner/plan.json` erzeugt — nicht von Hand ändern.

Ein Lauf nimmt das erste offene Paket, dessen Abhängigkeiten fertig sind, lässt daran arbeiten, prüft das Ergebnis nach und committet. Scheitert ein Paket zweimal, gilt es als blockiert und wird dem Auftraggeber gemeldet.

| Paket | Titel | Modell | Abhängig von | Status |
| --- | --- | --- | --- | --- |
| P1 | Projektgerüst und Container-Kern in TypeScript | opus | – | fertig |
| P2 | Signaturprüfung ohne Java | opus | P1 | fertig |
| P3 | Signieren im Kern (AdES-Baseline-B) und eigener ZIP-Schreiber | opus | P1, P2 | fertig |
| S1 | Spezifikation hpro 0.1 (normativ) | fable | P1, P2, P3 | fertig |
| S2 | Konformitaetsstufen, Pruefregeln und Sicherheitsanforderungen | fable | S1 | fertig |
| S6 | Tabellen und Formeln: Spezifikation (OpenFormula-Teilumfang) | fable | P1, S1 | fertig |
| S4 | Offene Lizenz, Governance, Namensraum und Komponenten-Registry | fable | S1 | fertig |
| S3 | Konformitaetspruefer und Testsuite zum Standard | opus | S1, S2 | fertig |
| S7 | Umsetzer-Handbuch und Autorenleitfaden | opus | S1, S2, S3 | fertig |
| P4 | Reader als Web-App (MVP) | opus | P1 | fertig |
| P19 | Tabellenrechner im Kern und in der Oberflaeche | opus | P4, S6 | fertig |
| P15 | Interaktive Inhalte und Animation | opus | P4 | fertig |
| P16 | Verschachtelte Information und stabile Adressen | opus | P4 | offen |
| P17 | Sperren, Rechte und eingefrorene Fassung | opus | P4, P3 | fertig |
| P18 | Druckweg nach DIN A4 (abgeleitete Ausgabe) | opus | P4 | fertig |
| P5 | Editor: strukturierte Bearbeitung, echtes Redigieren, Versionierung | opus | P4 | fertig |
| P6 | Formulare mit Berechnung, Bedingung und Validierung | opus | P4 | fertig |
| P7 | Kommentare, Review und Vergleich zweier Fassungen | opus | P4 | offen |
| P8 | Barrierefreiheits-Prüflauf | opus | P4 | fertig |
| P9 | PDF-Import, PDF-Export und OCR | opus | P4 | fertig |
| S5 | Autorenweg: Dokumente erstellen und migrieren | opus | P4 | fertig |
| S8 | Einbau in Fremdsoftware: SDK, Kommandozeile und Office-Export | opus | S5, S7 | offen |
| S9 | KI-lesbare Ebene: strukturierte Maschinensicht je Dokument | opus | S1, S2, S3, P4 | offen |
| P10 | Fernsignatur (CSC) und Zeitstempel (RFC 3161) | opus | P3 | fertig |
| P11 | Desktop-Hülle (Tauri 2) für Windows, macOS und Linux | opus | P4 | fertig |
| P12 | Mobil-Hüllen mit Abbruchkriterien (iOS und Android) | opus | P11 | fertig |
| P13 | Cross-Engine-Testsuite und CI | opus | P4 | fertig |
| P14 | Release, Paketierung und Demo-Dokumente | opus | P4, P5, P6 | offen |

**23 von 28 Paketen fertig.**

## Pakete im Detail

### P1 – Projektgerüst und Container-Kern in TypeScript

*Status:* fertig

**Ziel.** npm-Workspace mit dem Paket kern/ (@hpro/kern) in TypeScript. Der Kern liest und schreibt Container exakt nach den in docs/05 und prototyp/ belegten Regeln: mimetype unkomprimiert als erste Datei mit Inhalt application/epub+zip, META-INF/container.xml, package.opf, XHTML-Inhalt, manifest.json mit SHA-256 je Ressource. Typen und Schnittstellen für Storage/Signer/Validator/Scanner/Ocr/PdfImport/PdfExport wie in docs/06 Abschnitt 4.1, ohne Implementierungen.

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

*Status:* fertig

**Ziel.** Der Kern signiert Container selbst (Software-Schlüssel über WebCrypto, Testzertifikat) und schreibt sie mit korrektem mimetype. Kein Java im Pfad.

**Abnahme.**

- Der erzeugte signierte Container besteht epubcheck 5.4.0 mit 0 Fehlern
- Derselbe Container wird vom Java-Werkzeug prototyp/dss (DSS 6.5) als gültig bestätigt (TOTAL_PASSED), Beleg in docs/belege/
- Nach einer Manipulation meldet die eigene Prüfung HASH_FAILURE und DSS ebenfalls

**Ergebnis.** Lauf 20261011-1421, Versuch 1, Prüfung nachgetragen: Belege unter docs/belege/P3/ (epubcheck 0 Fehler, DSS TOTAL_PASSED, Manipulation erkannt), npm test 109 von 109 grün. Commit 9f34234.

---

### S1 – Spezifikation hpro 0.1 (normativ)

*Status:* fertig

**Ziel.** Die Spezifikation selbst schreiben: normative Anforderungen (Muss/Soll/Kann) fuer Container, Adressierung von Abschnitten, Profile (lebendig, eingefroren, signiert, Archiv), Sandbox-Regeln fuer lebendige Inhalte, Sperren und Rechte, Druckprofil, Metadaten, Versionierung und Erweiterungen. Aufbau auf den belegten Befunden aus docs/05 und den Zusagen aus docs/10, aufbauend auf offenen Standards (ZIP, HTML, CSS, Web Crypto, XML-Signaturen, XAdES, RFC 3161, OCF-Muster). Ziel: PDF abloesen, nicht eine weitere PDF-Variante.

**Abnahme.**

- docs/spezifikation/00-spezifikation.md liegt vor, mit nummerierten normativen Anforderungen (Muss/Soll/Kann) je Abschnitt
- Jede Anforderung ist pruefbar formuliert: sie nennt ein beobachtbares Merkmal und ein Pruefverfahren
- Ein Abschnitt ordnet jede Anforderung einer Konformitaetsstufe zu
- Keine Anforderung haengt an einem Hersteller; jede genutzte Fremdgrundlage ist mit Quelle benannt
- Ein Testskript im Repo prueft die Anforderungsliste mechanisch (Numerierung vollstaendig, jede Anforderung mit Stufe und Pruefverfahren)
- Die Spezifikation trennt Erzeuger-Konformitaet (was ein Autor schreiben muss) von Leser-Konformitaet (was ein Lesesystem annehmen muss), wie bei EPUB
- Pruefstein der Umsetzbarkeit: die Spezifikation wird so geschrieben, dass ein fremder Entwickler daraus ohne Rueckfragen einen minimalen Erzeuger und Leser bauen kann; das Verfahren zur Pruefung dieses Kriteriums ist im Dokument beschrieben
- Ein Mindestprofil fuer Bueroprogramme ist als Teilmenge ausgewiesen (Ueberschriften, Absaetze, Listen, Tabellen, Bilder, Fussnoten, Verweise) samt Zuordnung von Formatvorlagen auf Struktur

**Ergebnis.** Lauf 20261011-1551, Versuch 1, Prüfung: 7 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### S2 – Konformitaetsstufen, Pruefregeln und Sicherheitsanforderungen

*Status:* fertig

**Ziel.** Aus der Spezifikation ein Pruefregelwerk machen: Konformitaetsstufen (Basis, Lebendig, Signiert, Archiv) mit Muss/Soll/Kann, Sicherheitsregeln fuer Sandbox und lebendige Inhalte, Fehlerklassen (fatale Fehler, Fehler, Warnungen, Hinweise) und die Regeln fuer signierte und eingefrorene Fassungen.

**Abnahme.**

- docs/spezifikation/01-konformitaet.md mit Regelkatalog je Stufe und Fehlerklassen
- Regelkennungen sind stabil und in sich widerspruchsfrei (Testskript prueft Eindeutigkeit)
- Die Regelkatalogstruktur ist so angelegt, dass ein Pruefer (S3) daraus Befunde erzeugen kann
- Sicherheitsregeln der Sandbox sind als Muss-Anforderungen formuliert und begruendet

**Ergebnis.** Lauf 20261011-1621, Versuch 1, Prüfung: 32 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### S6 – Tabellen und Formeln: Spezifikation (OpenFormula-Teilumfang)

*Status:* fertig

**Ziel.** Zusage 7 aus docs/10 normativ fassen: Tabellen mit Formeln als Bestandteil des Dokuments. Formelsprache und Funktionen als dokumentierter Teilumfang von OpenFormula (ISO/IEC 26300-2), Speicherung von Formel und berechnetem Wert, Fehlerwerte, Genauigkeit und Datumssystem, Regeln fuer die Neuberechnung, Adressierung von Zellen, Verhalten in der eingefrorenen und der signierten Fassung, Importverhalten fuer nicht unterstuetzte Funktionen. Ausdruecklich keine Makros.

**Abnahme.**

- docs/spezifikation/03-tabellen-und-formeln.md liegt vor, mit nummerierten Muss/Soll/Kann-Anforderungen
- Der unterstuetzte Funktionsumfang ist als Liste mit Funktion, Signatur, Verhalten bei Fehlern und Quelle in OpenFormula dokumentiert (mindestens 40 Funktionen)
- Formel und Wert: die Anforderungen legen fest, wie beides gespeichert wird und was gilt, wenn der Wert fehlt oder veraltet ist
- Genauigkeit, Rundung, Datumssystem und Fehlerwerte sind festgelegt und von Excel-/LibreOffice-Verhalten abgegrenzt
- Ein Testskript prueft die Anforderungsliste mechanisch (Nummerierung, jede Anforderung mit Stufe und Pruefverfahren)

**Ergebnis.** Lauf 20261011-1702, Versuch 1, Prüfung: 9 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### S4 – Offene Lizenz, Governance, Namensraum und Komponenten-Registry

*Status:* fertig

**Ziel.** Den Standard offen halten und regeln: Lizenz fuer Spezifikation und Referenzimplementierung (royalty-frei, Pflichtteile frei nutzbar), Governance (wer aendert den Standard, wie wird versioniert), Namensraum und Dateiendung, Registrierung von Komponenten und Erweiterungen. Offenlegen, was fuer eine Anerkennung bei einem Gremium fehlt — ohne sie zu behaupten.

**Abnahme.**

- docs/spezifikation/02-lizenz-und-governance.md mit Lizenzvorschlag, Aenderungsverfahren und Versionsschema
- Erweiterungs- und Namensraumregeln mit Beispiel fuer eine gueltige und eine ungueltige Drittanbieter-Erweiterung
- Dateiendung: der Normkonflikt aus docs/05 Abschnitt 6.2 wird aufgegriffen und eine begruendete Empfehlung abgegeben
- Liste der offenen Punkte fuer eine Standardisierung bei W3C, ISO oder OASIS — als offene Frage, nicht als Behauptung

**Ergebnis.** Lauf 20261011-2056, Versuch 1, Prüfung: 14 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### S3 – Konformitaetspruefer und Testsuite zum Standard

*Status:* fertig

**Ziel.** Das epubcheck fuer hpro: ein Pruefprogramm im Kern, das eine Datei gegen den Regelkatalog aus S2 prueft und einen Bericht mit Regelkennung, Schweregrad und Ort ausgibt. Dazu eine Testsuite mit guten und absichtlich fehlerhaften Dokumenten.

**Abnahme.**

- npm run hpro-check <datei> prueft gegen den Katalog und gibt Regeln, Schweregrad und Ort aus
- Die Testsuite deckt mindestens 15 Regeln mit Gut- und Schlechtfaellen ab; Ergebnis in docs/belege/S3/
- Ein Dokument, das der Prototyp erzeugt hat, wird gegen den Katalog geprueft und der Bericht abgelegt
- Ausgabe ist maschinenlesbar (JSON) und menschenlesbar (Text)

**Ergebnis.** Lauf 20261012-0139, Versuch 1, Prüfung: 23 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### S7 – Umsetzer-Handbuch und Autorenleitfaden

*Status:* fertig

**Ziel.** Die Spezifikation in eine Form bringen, mit der fremde Entwickler arbeiten koennen: Umsetzer-Handbuch (Implementer's Guide) mit Containeraufbau, Mime-Typ, Adressierung, Sandbox-Regeln, Signaturwegen und nachbaubaren Beispielen; Autorenleitfaden mit dem Mindestprofil fuer Bueroprogramme; Anleitung, wie ein Textprogramm oder CMS den Standard erzeugt; Anleitung fuer Lesesysteme. Ziel: Word, LibreOffice, InDesign oder eine Fachanwendung koennen hpro ohne Rueckfragen einbauen.

**Abnahme.**

- docs/spezifikation/04-umsetzer-handbuch.md und 05-autorenleitfaden.md liegen vor
- Jedes Kapitel enthaelt mindestens ein vollstaendiges, nachvollziehbares Beispiel (Datei oder Ausschnitt plus Befehlsausgabe)
- Das Mindestprofil fuer Bueroprogramme ist als Anforderungsliste ausgewiesen und mit einem Beispiel belegt, das aus einer Textverarbeitung stammen koennte
- Die Dokumentation nennt fuer jede Aussage die normative Anforderung, die sie erklaert
- Ein Pruefbericht haelt fest, welche Fragen ein fremder Entwickler nach dem Lesen noch offen haette; offene Punkte sind behoben oder als offene Frage notiert

**Ergebnis.** Lauf 20261014-1723, Versuch 1, Prüfung: 36 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### P4 – Reader als Web-App (MVP)

*Status:* fertig

**Ziel.** app/ als Vite-TypeScript-Web-App: Dokument öffnen, reflowable Darstellung für kleine Displays, feste Seitenansicht als Alternative, Inhaltsverzeichnis, Suche über den Text, Zoom, Tastaturbedienung, PWA-Manifest und Service Worker für Offlinebetrieb.

**Abnahme.**

- npm test grün; ein Smoke-Test mit Playwright öffnet einen Container und prüft Inhaltsverzeichnis, Suche und Umschaltung der Ansicht
- Screenshots in drei Breiten (Telefon, Tablet, Desktop) in docs/belege/
- PWA-Manifest und Service Worker vorhanden; Offline-Start im Test belegt
- Barrierefreiheits-Grundprüfung mit axe-core ohne schwere Verstöße

**Ergebnis.** Lauf 20261012-0703, Versuch 1, Prüfung: 28 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### P19 – Tabellenrechner im Kern und in der Oberflaeche

*Status:* fertig

**Ziel.** Zusage 7 umsetzen: Formelrechner im Kern nach der Spezifikation aus S6, Tabellen im Dokument bearbeiten und ausfuellen, Neuberechnung, Verweise zwischen Tabellen, Pruefungen, Datenexport. Gegenprobe gegen LibreOffice oder Excel als Messlatte.

**Abnahme.**

- Der Rechner deckt den in S6 festgelegten Funktionsumfang ab; Tests zaehlen die abgedeckten Funktionen
- Gegenprobe: dasselbe Tabellenbeispiel rechnet im Kern und in LibreOffice oder Excel identisch (Beleg mit beiden Ergebnissen)
- Eine Tabelle mit Formeln laesst sich im Dokument ausfuellen und rechnet neu, ohne dass das Dokument neu geladen wird
- Die eingefrorene Fassung zeigt die Werte ohne Rechner; nach einer Aenderung an der eingefrorenen Fassung ist sie als veraendert erkennbar
- Nicht unterstuetzte Funktionen werden beim Import als Wert eingefroren und im Bericht genannt
- Belege unter docs/belege/P19/

**Ergebnis.** Lauf 20261012-0904, Versuch 2, Prüfung: 36 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### P15 – Interaktive Inhalte und Animation

*Status:* fertig

**Ziel.** Zusage 2 aus docs/10 umsetzen: deklarierte Komponenten in der Sandbox, Video und Ton, Animationen, Respekt fuer reduzierte Bewegung, statisches Aequivalent ohne Skripte. Der Kern setzt die Regeln durch (keine Netzwerkzugriffe, kein Nachladen, kein Speichern ausserhalb des Dokuments).

**Abnahme.**

- Ein Test weist nach, dass eine Komponente in der Sandbox keinen Netzwerkzugriff erreicht
- Ein Beispieldokument mit Animation und Video rendert; mit abgeschalteten Skripten bleibt ein statisches Aequivalent vollstaendig lesbar
- Die Systemeinstellung fuer reduzierte Bewegung wird respektiert (Test oder Beleg)
- Belege mit woertlichen Ausgaben unter docs/belege/P15/

**Ergebnis.** Lauf 20261012-1033, Versuch 2, Prüfung: 24 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### P16 – Verschachtelte Information und stabile Adressen

*Status:* offen

**Ziel.** Zusage 3 aus docs/10: aufklappbare Abschnitte, eingebettete Unterdokumente, waehlbare Detailtiefe, Anhaenge als Dokumentteil. Dazu stabile Adressen je Abschnitt als Ersatz fuer Seitenzahlen — zitierbar und unabhaengig von Geraet und Layout.

**Abnahme.**

- Ein Verweis auf einen Abschnitt bleibt gueltig, wenn Fensterbreite und Schriftgroesse wechseln (Test)
- Ein eingebettetes Unterdokument wird mitgeliefert und offline gelesen (Test)
- Adressen bleiben ueber zwei Fassungen des Dokuments stabil (Test)
- Belege unter docs/belege/P16/

**Ergebnis.** Zurückgesetzt 14.10. – frühere Sperre aus altem Stand, Wiederholung

---

### P17 – Sperren, Rechte und eingefrorene Fassung

*Status:* fertig

**Ziel.** Zusage 5 aus docs/10: zwei Profile (lebendig und eingefroren), Sperren von Abschnitten ueber Regeln im Manifest, Redaktion als echtes Loeschen mit Protokoll, signierbare und zeitstempelbare eingefrorene Fassung. Ehrlich dokumentieren, was technisch nicht schuetzbar ist.

**Abnahme.**

- Die eingefrorene Fassung ist signiert und die Signatur wird geprueft; eine spaetere Aenderung daran wird als Manipulation erkannt
- Ein gesperrter Abschnitt ist im lebendigen Dokument nicht auslesbar (Test)
- Redaktion entfernt die Daten nachweislich aus dem Container und fuehrt ein Pruefprotokoll
- Belege unter docs/belege/P17/

**Ergebnis.** Lauf 20261012-1727, Versuch 1, Prüfung: 35 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### P18 – Druckweg nach DIN A4 (abgeleitete Ausgabe)

*Status:* fertig

**Ziel.** Zusage 6 aus docs/10: der Ausdruck entsteht aus dem digitalen Layout. Umbruchregeln, Kopf- und Fusszeile, Seitenzahlen, Verzeichnis, Tabellen mit wiederholter Kopfreile, Codebloecke mit Umbruchmarkierung, interaktive Elemente als Standbild mit Beschreibung und Verweis auf die lebendige Fassung.

**Abnahme.**

- Ein Testdokument mit langer Tabelle, Codeblock und Video druckt auf A4 ohne abgeschnittene Inhalte
- Kopfzeile, Seitenzahlen und Verzeichnis sind im Ausdruck vorhanden
- Video und Animation erscheinen als Standbild mit Bildunterschrift und Verweis auf die lebendige Fassung
- Ergebnis als PDF unter docs/belege/P18/ mit Seitenbildern oder veraPDF-Pruefung

**Ergebnis.** Lauf 20261012-1830, Versuch 2, Prüfung: 72 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### P5 – Editor: strukturierte Bearbeitung, echtes Redigieren, Versionierung

*Status:* fertig

**Ziel.** Bearbeiten auf Strukturebene (Überschriften, Listen, Tabellen, Fußnoten, Querverweise) statt Overlay. Redaktion entfernt Daten wirklich, mit Prüfprotokoll. Änderungsverlauf mit Diff zwischen zwei Fassungen.

**Abnahme.**

- Tests: bearbeiteter Text steht im Containerinhalt (nicht in einer Overlay-Schicht), Beweis über Rohausgabe des Containers
- Redaktion: nach dem Entfernen ist der Text im Container und in der Textsuche nicht mehr auffindbar; Protokoll wird mitgeschrieben
- Diff zwischen zwei Fassungen erkennt eine geänderte Überschrift, einen geänderten Absatz und ein entferntes Bild

**Ergebnis.** Lauf 20261012-1958, Versuch 2, Prüfung: 41 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### P6 – Formulare mit Berechnung, Bedingung und Validierung

*Status:* fertig

**Ziel.** Felder anlegen und ausfüllen, Berechnungen, bedingte Abschnitte, Validierung vor Absenden, Datenexport (JSON) und PDF-Export der ausgefüllten Fassung. Löst den Randfall aus docs/07, Abschnitt 3d, mit Web-Standardmitteln.

**Abnahme.**

- Tests decken Berechnung, Bedingung und Validierungsfehler ab
- Ein Beispielfomular (Finanz-/Antragsformular) liegt als Container in docs/belege/
- Datenexport ist schema-geprüft; ohne gültige Eingaben kein Absenden

**Ergebnis.** Lauf 20261012-2128, Versuch 2, Prüfung: 45 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### P7 – Kommentare, Review und Vergleich zweier Fassungen

*Status:* offen

**Ziel.** Anmerkungen, Hervorhebungen, Freihand, Kommentarthreads mit Status (offen/erledigt), Export der Anmerkungen, Dokumentvergleich.

**Abnahme.**

- Tests für Anlegen, Beantworten, Erledigen und Export von Anmerkungen
- Anmerkungen bleiben im Container erhalten und sind mit dem Reader ohne Datenverlust wieder lesbar

**Ergebnis.** Zurückgesetzt 14.10. – frühere Sperre aus altem Stand, Wiederholung

---

### P8 – Barrierefreiheits-Prüflauf

*Status:* fertig

**Ziel.** Eingebauter Prüflauf mit direktem Korrekturweg: Struktur, Lesereihenfolge, Alternativtexte, Kontrast, Sprache, Tabellenköpfe, Fokusführung.

**Abnahme.**

- Prüflauf findet in einem absichtlich fehlerhaften Testdokument mindestens fünf Kategorien
- Korrekturvorschläge sind anwendbar und der zweite Lauf ist fehlerfrei
- axe-core-Prüfung der Oberfläche ohne schwere Verstöße

**Ergebnis.** Lauf 20261013-0058, Versuch 1, Prüfung: 21 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### P9 – PDF-Import, PDF-Export und OCR

*Status:* fertig

**Ziel.** Selbst hostbarer Dienst (dienst/) für PDF-Export (WeasyPrint + veraPDF), PDF-Import (Docling) und OCR (Tesseract), plus Kern-Adapter. Grenzen des Imports ehrlich dokumentieren (Layoutrekonstruktion).

**Abnahme.**

- Export: ein Container wird zu PDF, das PDF besteht veraPDF-Prüfung; Beleg in docs/belege/
- Import: ein PDF mit Text und Bild wird zu einem Container, der epubcheck besteht
- OCR: gescanntes PDF wird durchsuchbar; Qualitätsangabe mit Messgröße
- Grenzen des Imports in docs/ dokumentiert, mit Beispielen misslungener Umwandlung

**Ergebnis.** Lauf 20261013-0526, Versuch 1, Prüfung: 108 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### S5 – Autorenweg: Dokumente erstellen und migrieren

*Status:* fertig

**Ziel.** Ohne Autorenwerkzeug bleibt ein Standard leer. Ein Weg, aus Markdown, Word und bestehenden PDF-Dateien hpro-Dokumente zu erzeugen, mit Vorlagen und ehrlicher Angabe, was beim Import verloren geht. Loest die offene Frage 5 aus docs/10.

**Abnahme.**

- Aus einer Markdown-Quelle mit Vorlage entsteht ein konformes Dokument (Pruefbericht mit S3-Werkzeug)
- Ein Import aus Word und aus PDF erzeugt je ein Dokument, das epubcheck und den Konformitaetspruefer besteht
- Verluste beim Import sind gemessen und dokumentiert (Abschnitt, Tabelle, Bild, Fussnote)
- Belege unter docs/belege/S5/

**Ergebnis.** Lauf 20261013-0702, Versuch 1, Prüfung: 49 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### S8 – Einbau in Fremdsoftware: SDK, Kommandozeile und Office-Export

*Status:* offen

**Ziel.** Damit der Standard dort entsteht, wo die Leute arbeiten: eine stabile Schnittstelle fuer den Einbau in fremde Software (Kommandozeile und Bibliothek), ein Exportweg aus Textverarbeitungen und Office-Paketen, und eine dokumentierte Anbindung fuer Fachanwendungen. Kein Hersteller soll eine eigene Umsetzung erfinden muessen.

**Abnahme.**

- Kommandozeile mit stabilen Befehlen (erzeugen, pruefen, signieren, nach PDF ausgeben) und dokumentierter Rueckgabecode
- Ein Office-Exportweg (Textverarbeitung oder Tabellenkalkulation) erzeugt ein Dokument, das den Konformitaetspruefer besteht; Beispiel und Beleg unter docs/belege/S8/
- Die Bibliothek ist als Paket nutzbar (Installation, Version, Beispielaufruf) und die API ist dokumentiert
- Ein Beispiel fuer eine Fachanwendung (z. B. Berichtserzeugung aus Daten) ist im Repo lauffaehig
- Anleitung fuer Dritte, wie sie den Standard in ihre Software einbauen, in docs/spezifikation/06-einbau.md

---

### S9 – KI-lesbare Ebene: strukturierte Maschinensicht je Dokument

*Status:* offen

**Ziel.** Jedes hpro-Dokument traegt eine eingebaute, fuer KI-Systeme gut lesbare Maschinensicht, abgeleitet aus denselben Informationen wie die Menschenansicht (keine zweite, abweichende Wahrheit): saubere semantische Struktur (Ueberschriftenhierarchie, stabile Abschnittsadressen), Metadaten, Tabellen und Formelwerte als Daten, Formularfelder mit Typ und Wert, Signatur- und Rechtestatus, Anmerkungen, Alternativtexte. Format: ein normatives Teil der Spezifikation (z. B. machine/document.json bzw. schlankes Markdown/JSON, im Manifest hashgesichert und mitsigniert) plus Erzeuger im Kern, Pruefregel im Konformitaetspruefer und Befehl in der Kommandozeile. Beachten: Konsistenzpruefung Mensch- gegen Maschinensicht, Schutz vor Prompt-Injection (Maschinensicht ist Daten, keine Anweisung; verborgener Text nur wenn auch sichtbar), Redaktion: geschwaerzte Inhalte duerfen nicht in der Maschinensicht stehen.

**Abnahme.**

- Spezifikationskapitel mit Format, Pflichtfeldern und Regeln (Regelkatalog erweitert, check-spec gruen)
- Erzeuger im Kern; Beispiel-Container enthaelt Maschinensicht, im Manifest gehasht und signiert
- Test: Maschinensicht und Menschenansicht sind inhaltsgleich (Text, Tabellen, Formularwerte); redigierte Stellen fehlen in beiden
- Konformitaetspruefer meldet fehlende oder abweichende Maschinensicht
- Beleg: Ein Sprachmodell-Test oder dokumentierte Stichprobe, dass Fragen zum Dokument aus der Maschinensicht richtig beantwortet werden (sonst als nicht geprueft ausweisen)
- Belege unter docs/belege/S9/

---

### P10 – Fernsignatur (CSC) und Zeitstempel (RFC 3161)

*Status:* fertig

**Ziel.** Schnittstelle für Fernsignatur nach CSC (A-Trust als Beispiel) und RFC-3161-Zeitstempel im Kern, mit Mock-Dienst für Tests. Zugangsdaten des Anbieters liegen nicht vor, deshalb Vertrag und Testdoppel.

**Abnahme.**

- Signatur über den Mock-Dienst ist im Kern prüfbar
- Zeitstempel wird gegen einen öffentlichen RFC-3161-Dienst geprüft, Ergebnis in docs/belege/
- Was für den echten Anbieter fehlt, steht als offener Punkt in docs/

**Ergebnis.** Lauf 20261013-0808, Versuch 1, Prüfung: 57 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### P11 – Desktop-Hülle (Tauri 2) für Windows, macOS und Linux

*Status:* fertig

**Ziel.** huelle/ mit Tauri 2 um denselben Web-Kern: Dateizuordnung, Öffnen/Speichern, Sidecar für die lokalen Dienste, Signatur über Systemschlüssel. Rust-Toolchain wird im Arbeitsverzeichnis installiert.

**Abnahme.**

- Release-Build für Linux läuft und öffnet einen Container aus dem Dateimanager (Beleg)
- Tauri-Befehle sind auf das Nötige beschränkt; das Dokument-iframe erreicht keinen Befehl (Test)
- Paketgröße gemessen und in docs/ dokumentiert

**Ergebnis.** Lauf 20261013-1129, Versuch 1, Prüfung: 22 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### P12 – Mobil-Hüllen mit Abbruchkriterien (iOS und Android)

*Status:* fertig

**Ziel.** Spike nach docs/06 Abschnitt 4.4: Tauri 2 auf Android und iOS mit den fünf Abbruchkriterien. Fällt der Spike durch, wird Capacitor vorbereitet.

**Abnahme.**

- Alle fünf Abbruchkriterien einzeln mit Beleg geprüft, Ergebnis je Kriterium ja/nein
- Bei Nein: dokumentierte Empfehlung Capacitor mit Begründung
- Aufwand des Spikes gegen die Schätzung 0,5 bis 1 PM gestellt

**Ergebnis.** Lauf 20261014-1227, Versuch 2, Prüfung: 119 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### P13 – Cross-Engine-Testsuite und CI

*Status:* fertig

**Ziel.** Testsuite, die dieselbe Datei in Chromium, WebKit und Firefox rendert und Unterschiede sichtbar macht; GitHub-Actions-Läufe für Tests, epubcheck und Build.

**Abnahme.**

- CI-Lauf grün, Beleg über die GitHub-API oder den Aktionsverlauf
- Mindestens ein echter Engine-Unterschied ist dokumentiert oder ausdrücklich widerlegt
- Testmatrix in docs/ beschrieben

**Ergebnis.** Lauf 20261014-1541, Versuch 2, Prüfung: 147 Belegdatei(en) vorhanden; ok: npm ci --no-audit --no-fund; ok: npm test --if-present

---

### P14 – Release, Paketierung und Demo-Dokumente

*Status:* offen

**Ziel.** Erste öffentliche Version: Bauanleitung, Pakete, drei Demo-Dokumente (Bericht, Formular, signierter Nachweis), Kurzdokumentation für Anwender, Lizenz.

**Abnahme.**

- Reproduzierbarer Build mit einer Anleitung, die ein Fremder befolgen kann
- Drei Demo-Container im Repo, jeder besteht epubcheck und die eigene Prüfung
- Lizenz festgelegt und im Repo vermerkt

---
