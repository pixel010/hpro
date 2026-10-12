# Auftrag: Recherchephase hpro

**Auftraggeber:** Johannes Parchatka, Innsbruck. **Sprache:** Deutsch.
**Stand:** 10.10.2026, Phase 1 (Recherche). Es gibt noch keinen Code.

## Die Idee

PDF ablösen. Ein Dokumentstandard, der Papier **nicht simuliert**: responsiv statt feste Seiten,
interaktiv statt gedruckte Statik, auf jedem Gerät passend formatiert. Dazu ein **Reader und
Bearbeiter** mit dem Funktionsumfang von Adobe Acrobat Pro — aber für diesen neuen Standard.

Offene Grundsatzfrage, die die Recherche beantworten soll: **Ist HTML die richtige Basis, oder gibt
es etwas Sinnvolleres?** (z. B. EPUB-Container, Web Bundles, ein eigenes Containerformat mit
HTML-Inhalt, CBOR/JSON-Manifest, WASM-Renderer.)

## Arbeitsregeln

- **Keine Erfindungen.** Jede Aussage über Standards, Produkte oder Marktlage braucht eine Quelle
  (URL). Nicht Belegbares wird als offene Frage markiert.
- **Bandbreiten statt Punktwerte** bei Aufwands- und Kostenschätzungen.
- Keine Docker-Operationen. Keine Installationen außerhalb des Repos.
- Markdown, deutsch, Tabellen wo sie helfen. Kein Marketing-Ton — Schwächen der eigenen Idee
  ausdrücklich benennen.

## Deliverables

### 1. `docs/01-stand-der-technik.md` — Was es schon gibt

Recherchiere den Stand der Technik und bewerte ihn. Mindestens zu prüfen:

- **EPUB 3.3 / EPUB Accessibility 1.1** (W3C): HTML in einem ZIP-Container — der nächste Verwandte
  der Idee. Kann es Dokumente, nicht nur Bücher? Wo scheitert es (Layoutkontrolle, Tabellen,
  Interaktivität, Signaturen, Rechteverwaltung, Druck)?
- **Adobes Liquid Mode** und Reflow-Modi in Acrobat/Foxit/PDF Expert: Was leisten sie, wo sind die
  Grenzen (Seitenzahl-Limits, Verlust von Bildern, serverseitige Verarbeitung, Datenschutz)?
- **Single-File-HTML / Web Bundles / MHTML / SingleFile**: Kann man eine Webseite heute tragfähig in
  *eine* Datei packen, offline und signierbar?
- **Barrierefreiheit**: PDF/UA (ISO 14289), Tagged PDF vs. semantisches HTML.
- **Vertrauen und Recht**: eIDAS-qualifizierte Signaturen, C2PA (Content Credentials), Archivierung
  (PDF/A vs. HTML/WARC), Revisionssicherheit, GoBD in Deutschland bzw. österreichische
  Aufbewahrungspflichten. Das ist erfahrungsgemäß der harte Blocker für Papierersatz — belastbar
  recherchieren.
- **Papiersimulation, die es gibt**: Paged.js, Vivliostyle, WeasyPrint, Prince, Typst, LaTeX — als
  Abgrenzung, nicht als Lösung.
- **Interaktive Dokumentprodukte**: H5P, Ceros, Shorthand, Quarto, Observable — was davon ist
  übertragbar?
- **Readium / EPUB-Reader-Ökosystem**: Warum wirken EPUB-Reader so oft schlecht, und was heißt das
  für einen eigenen Reader?

Jede Technologie: Was ist es, wer steckt dahinter, Reifegrad, Stärken, Schwächen, **Eignung für
hpro** (Skala: trägt / teilweise / ungeeignet) — mit Quellenangabe.

### 2. `docs/02-acrobat-pro-funktionsumfang.md` — Was Acrobat Pro kann

**Erhebung aus YouTube-Tutorials** (ausdrücklich gewünscht), ergänzt durch die Adobe-Dokumentation.
Transkripte der Videos nach `docs/quellen/` legen (Dateiname: `youtube-<video-id>-<kurztitel>.txt`).
Geeignete Videos suchen (Suchbegriffe: „Adobe Acrobat Pro tutorial", „Acrobat Pro complete guide",
„Acrobat Pro DC tutorial"), mindestens drei Stück, möglichst aus 2025/2026. Wenn ein Video kein
Transkript hat, ein anderes nehmen und das im Dokument vermerken.

Feature-Inventar, gruppiert und **mit Spalte „Übertragung auf hpro"**:

1. Anzeigen und Lesen (Zoom, Reflow, Liquid Mode, Vorlesen, Nachtmodus, Messen)
2. Bearbeiten (Text, Bilder, Objekte, Seiten organisieren, Zuschneiden)
3. Scannen und OCR (Kamera-Scan, Texterkennung, Aufräumen)
4. Kommentieren und Review (Notizen, Markierungen, Zeichnen, Freigabe-Workflows, Versionsvergleich)
5. Formulare (Felder erkennen, erstellen, ausfüllen, JavaScript, Datensammlung)
6. Signaturen (elektronisch, digital, Zeitstempel, Zertifikate, eIDAS)
7. Sicherheit (Passwort, Rechte, Schwärzen, Metadaten entfernen)
8. Zusammenführen, Aufteilen, Optimieren, Export/Konvertierung
9. Barrierefreiheit (Tagging, Prüfung, Bericht)
10. Zusammenarbeit und Cloud (Freigaben, PDF Spaces, Kommentar-Tracking)
11. KI-Funktionen (Assistent, Zusammenfassungen, Übersetzungen, Podcast, Präsentationen)
12. Automatisierung (Action Wizard, Batch, Skripting)
13. Druckvorstufe und Produktion (Farben, Preflight, Überdrucken)

Je Feature: **was es tut**, **wie es im Tutorial benutzt wird** (mit Video-ID als Beleg), und
**wie die Entsprechung in hpro aussähe**.

### 3. `docs/03-konzept.md` — Konzept

- **Formatvorschlag**: Container (ZIP?), Manifest (JSON), Inhalt (HTML/CSS/JS/SVG), Assets,
  Metadaten, Optionen für Signaturen und Verschlüsselung. Vor- und Nachteile gegenüber EPUB.
- **Reader/Editor-Architektur**: Web-App plus Desktop-Hülle? Was geht ohne Server? Wie sieht
  Offline-Nutzung aus? Wie wird Interaktivität sicher (Sandbox, CSP) und wie wird verhindert, dass
  Dokumente zu Schadsoftware werden?
- **Responsives Layout als Gestaltungsauftrag**: Wie beschreibt man Absicht (Betonung, Reihenfolge,
  Umbruchregeln) so, dass sie auf jeder Größe sinnvoll bleibt? Was geht dabei verloren?
- **Übergang**: PDF → hpro und hpro → PDF, damit die bestehende Welt weiter bedient wird.
- **Recht und Vertrauen**: Signaturen, Zeitstempel, Archivierbarkeit, Barrierefreiheitsnachweis.
- **Roadmap MVP**: kleinster sinnvoller Umfang, grobe Aufwandsklassen als Bandbreite.

## Abschluss

Am Ende: alles committen (klare Commit-Nachricht auf Deutsch). **Nicht pushen** — das übernimmt
der Auftraggeber nach der Prüfung.
