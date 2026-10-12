# 02 – Funktionsumfang Adobe Acrobat Pro und Übertragung auf hpro

**Projekt:** hpro · **Phase:** 1 (Recherche) · **Stand:** 11.10.2026
**Auftrag:** [`00-auftrag.md`](00-auftrag.md), Deliverable 2

## Methode

- **Erhebung aus YouTube-Tutorials** (ausdrücklich gewünscht), ergänzt durch die
  Adobe-Dokumentation.
- Transkripte geholt mit `youtube-transcript-api`, abgelegt unter `docs/quellen/youtube-<id>-<kurztitel>.txt`.
  Jede Datei hat einen Kopf mit Titel, Kanal, Upload-Datum, Länge und URL. Die Transkripte sind
  automatische bzw. hochgeladene Untertitel, unredigiert.
- **Adobe-Dokumentation:** [`quellen/recherche-d-acrobat-pro-dokumentation.md`](quellen/recherche-d-acrobat-pro-dokumentation.md).
  `helpx.adobe.com` blockiert automatische Abrufe (HTTP 403). Die Hilfeseiten wurden deshalb über
  Snapshots des Internet Archive (meist Aug.–Okt. 2026) gelesen; zitiert wird die kanonische
  helpx-Adresse. Einzelne Seiten sind nur über ihren Titel im Navigationsbaum belegt, das ist in
  Notiz D mit (N) markiert.
- Abkürzungen in den Tabellen:
  - **D/** = `https://helpx.adobe.com/acrobat/desktop/`
  - **U/** = `https://helpx.adobe.com/acrobat/using/`
  - **W/** = `https://helpx.adobe.com/acrobat/web/`
  - Video-IDs verweisen auf `https://www.youtube.com/watch?v=<ID>` und die gleichnamige Datei in `quellen/`.
- **Spalte „Übertragung auf hpro“** ist ein **Vorschlag** und mit einer Klasse markiert:
  - **[nativ]** – kommt mit HTML/CSS bzw. Browser-Engine weitgehend mit
  - **[neu]** – muss im Reader/Editor gebaut werden
  - **[anders]** – das PDF-Konzept passt nicht; hpro löst das Bedürfnis anders
  - **[Export]** – nur im PDF-Exportpfad relevant
  - **MVP** – gehört zum MVP laut [`03-konzept.md`](03-konzept.md#6-roadmap-mvp)

## Ausgewertete Videos

| Video-ID | Titel (gekürzt) | Kanal | Hochgeladen | Länge | Schwerpunkt | Hinweis |
|---|---|---|---|---|---|---|
| [sd7FIwMiP-4](https://www.youtube.com/watch?v=sd7FIwMiP-4) | How to Use Adobe Acrobat in 2025 – Edit PDFs, Use AI Assistant, and More! | Teacher's Tech | 22.07.2025 | 30:15 | Gesamtüberblick | **von Adobe gesponsert** (im Video gesagt) |
| [fyK5s-_xkgw](https://www.youtube.com/watch?v=fyK5s-_xkgw) | How to Use Adobe Acrobat: A Step-by-Step Guide for Beginners | Howfinity | 15.04.2025 | 8:36 | Überblick | – |
| [Q9nZIYWrMJI](https://www.youtube.com/watch?v=Q9nZIYWrMJI) | Master Adobe Acrobat Pro: A Complete Tutorial for Beginners 2026 | Saad Jee Tabassam | **27.09.2024** | 15:32 | Überblick Bearbeiten | Titel sagt 2026, Upload ist 2024 (Acrobat 2024) |
| [H1wDqQomoAE](https://www.youtube.com/watch?v=H1wDqQomoAE) | Adobe Acrobat Pro Review 2025 – New Features | Digit Wise | 09.04.2025 | 4:08 | Neuerungen | **geringe Verlässlichkeit:** Behauptungen (z. B. Liquid Mode am Desktop) sind durch Adobe-Quellen nicht gedeckt |
| [RZPXDesNZw0](https://www.youtube.com/watch?v=RZPXDesNZw0) | Adobe Acrobat Studio: … Document Review Processes (2026) | Kevin Stratvert | 06.04.2026 | 12:05 | Studio, PDF Spaces, Review | **„in partnership with Adobe“** |
| [bRayNFCsHz4](https://www.youtube.com/watch?v=bRayNFCsHz4) | Acrobat PDF Spaces: Turn Your Files into an AI Knowledge Hub | Kevin Stratvert | 15.12.2025 | 20:49 | PDF Spaces, KI-Personas | – |
| [J8hjqIkngKg](https://www.youtube.com/watch?v=J8hjqIkngKg) | How to Make a PDF Fillable in Adobe Acrobat Pro DC – 2025 | Benzaiten Media | 11.08.2025 | 1:23 | Formular-Felderkennung | – |
| [RtkvHiTFRjw](https://www.youtube.com/watch?v=RtkvHiTFRjw) | How to Redact PDFs in Adobe Acrobat Pro (UPDATED Interface) | Erin Wright Writing | 22.07.2025 | 8:04 | Schwärzen, Bereinigen | – |
| [t6ITOk8_-_c](https://www.youtube.com/watch?v=t6ITOk8_-_c) | How To Add A Digital Signature … With Date And Time (2026) | Just Kristers | 28.02.2026 | 2:48 | Digitale Signatur | – |
| [ck22sJjsk4A](https://www.youtube.com/watch?v=ck22sJjsk4A) | How To Validate All Signatures In A PDF (2026) | Just Kristers | 02.03.2026 | 2:18 | Signaturprüfung | – |
| [7ms9iAE1Q9I](https://www.youtube.com/watch?v=7ms9iAE1Q9I) | Remediate a PDF for accessibility using Adobe's Accessibility Checker | Pope Tech | 30.04.2025 | 4:49 | Barrierefreiheitsprüfung | – |
| [bAi8FFbCsF8](https://www.youtube.com/watch?v=bAi8FFbCsF8) | How to use Adobe Acrobat's Fix reading order tool | Pope Tech | 30.04.2025 | 4:27 | Lesereihenfolge, Tags | – |
| [OzoMoNe6ng0](https://www.youtube.com/watch?v=OzoMoNe6ng0) | How to Use the Preflight Tool … to Fix PDF UA Issues (2025) | Learn with Freddie | 08.04.2025 | 2:34 | Preflight PDF/UA | – |
| [I8Qz-KxNShE](https://www.youtube.com/watch?v=I8Qz-KxNShE) | Stop Guessing Your Colors! Master the Acrobat Output Preview Tool | Mike The Print Man | 06.04.2025 | 17:50 | Druckvorstufe | – |
| [1GYHOSrW40c](https://www.youtube.com/watch?v=1GYHOSrW40c) | How to Preflight PDF in Adobe Acrobat (Print Check) | RDKtutorials | 03.03.2026 | 0:38 | Preflight Druck | sehr kurz |
| [JbJegvLCLbQ](https://www.youtube.com/watch?v=JbJegvLCLbQ) | Tag a PDF automatically – Adobe Acrobat Pro DC | The Accessibility Guy | 27.12.2022 | 1:45 | Autotag | älter als 2025 |
| [BtmxU0ykAbo](https://www.youtube.com/watch?v=BtmxU0ykAbo) | Adobe Acrobat Pro DC Tutorial 15 – Compare Files | Adobe Acrobat Workshop | 25.09.2019 | 2:38 | Dateien vergleichen | **alt**, kein neueres Transkript erhältlich |
| [QBu7zOuy3uM](https://www.youtube.com/watch?v=QBu7zOuy3uM) | How to Work with Batch Processing in Acrobat | Howtech | 03.01.2013 | 1:41 | Action Wizard | **sehr alt** (Acrobat XI), kein neueres Transkript erhältlich |

Upload-Daten, Kanäle und Längen stammen aus den Metadaten der YouTube-Seiten, abgerufen am
11.10.2026. 13 der 18 Videos sind aus 2025/2026.

### Videos ohne Transkript (ersetzt bzw. nicht verwendet)

| Video-ID | Titel | Grund | Ersatz |
|---|---|---|---|
| [uxQb87o6Uy4](https://www.youtube.com/watch?v=uxQb87o6Uy4) | Adobe Acrobat Studio 2025: AI-Powered PDF Spaces … | „This video is unavailable“ | RZPXDesNZw0, bRayNFCsHz4 |
| [wdENhL-FxOs](https://www.youtube.com/watch?v=wdENhL-FxOs) | How to use Adobe Acrobat Pro – Beginners Tutorial | „This video is unavailable“ | fyK5s-_xkgw, sd7FIwMiP-4 |
| [Z28o1cnkCKQ](https://www.youtube.com/watch?v=Z28o1cnkCKQ) | Adobe Acrobat Studio Demo … | „Transcripts are disabled for this video“ | RZPXDesNZw0 |
| [cxfN1GsQZ0s](https://www.youtube.com/watch?v=cxfN1GsQZ0s), [NqTFR9UBzw8](https://www.youtube.com/watch?v=NqTFR9UBzw8) | Acrobat Studio (deutschsprachig) | kein englisches Transkript; deutscher Abruf durch YouTube-Sperre verhindert | – |
| [lu_r3uTtR94](https://www.youtube.com/watch?v=lu_r3uTtR94), [Bc1ZnAxRdWU](https://www.youtube.com/watch?v=Bc1ZnAxRdWU), [QhAJMqIWjOs](https://www.youtube.com/watch?v=QhAJMqIWjOs) | Acrobat Studio 2026: Podcasts, Präsentationen | YouTube blockierte nach rund 20 Abrufen weitere Anfragen von dieser IP („YouTube is blocking requests from your IP“); mehrere Wiederholungen über eine Stunde erfolglos | Adobe-Doku (Notiz D, Abschnitt 11) |
| [h1F3r5RQAa4](https://www.youtube.com/watch?v=h1F3r5RQAa4), [y5eOriGh4Mk](https://www.youtube.com/watch?v=y5eOriGh4Mk) | Scan & OCR (2025/2026) | IP-Sperre wie oben | sd7FIwMiP-4, Q9nZIYWrMJI (OCR-Teile) |
| [iqnNbyOExlU](https://www.youtube.com/watch?v=iqnNbyOExlU), [VBiXdXERI3s](https://www.youtube.com/watch?v=VBiXdXERI3s), [7wP8uQr1LCM](https://www.youtube.com/watch?v=7wP8uQr1LCM) | Liquid Mode, Vorlesen | IP-Sperre wie oben | nur Adobe-Doku |
| [PCt2lLEckCE](https://www.youtube.com/watch?v=PCt2lLEckCE), [rRSYOp7PZzI](https://www.youtube.com/watch?v=rRSYOp7PZzI), [Cqu-e-uXxQo](https://www.youtube.com/watch?v=Cqu-e-uXxQo), [TAHKKl4pMKU](https://www.youtube.com/watch?v=TAHKKl4pMKU) | Vergleichen 2025, Guided Actions 2025/2026, Formularberechnungen | IP-Sperre wie oben | ältere Videos BtmxU0ykAbo, QBu7zOuy3uM; Adobe-Doku |

**Folge:** Für Liquid Mode, Vorlesen, Podcast- und Präsentationserzeugung, Übersetzung,
Formular-JavaScript und Kamera-Scan gibt es **keinen Tutorial-Beleg**, nur die Adobe-Dokumentation.
Vergleichen und Action Wizard sind nur mit alten Videos belegt.

## Produktlinie und Preise (Kontext)

| Plan | Kern laut Adobe | Preis AT (inkl. 20 % USt., Jahresabo monatlich) | Quelle |
|---|---|---|---|
| Reader | ansehen, drucken, teilen, kommentieren | kostenlos | [Vergleich](https://www.adobe.com/acrobat/pricing/compare-versions.html) |
| Standard | erstellen, bearbeiten, konvertieren, E-Signaturen einholen, Passwortschutz | €18,14 | [Pläne](https://www.adobe.com/acrobat/plans.html); Preisdienst, Notiz D §15 |
| **Pro** | dazu u. a. Vergleichen, Schwärzen, Scans editierbar machen, Webformulare, „70+ advanced PDF tools“ | **€23,99** | ebd. |
| **Studio** (seit 19.08.2025) | Pro + AI Assistant, PDF Spaces, Adobe Express Premium | €30,24 | [Adobe News](https://news.adobe.com/news/2025/08/acrobat-studio-delivers-new-ai-powered-home-for-productivity-creativity) |
| Acrobat Express (seit 06.05.2026) | KI, PDF Spaces, Inhaltserzeugung ohne die PDF-Werkzeuge von Pro | US$9,99–10,99 / Monat | [Adobe News](https://news.adobe.com/news/2026/05/adobes-new-productivity-agent) |

Wichtig für die Einordnung: **Die KI-Funktionen sind nicht in Pro enthalten**, sondern nur in Studio,
Express oder per Add-on ([D/use-acrobat-ai/…/acrobat-ai-overview.html](https://helpx.adobe.com/acrobat/desktop/use-acrobat-ai/get-started-with-generative-ai/acrobat-ai-overview.html)).
Das Tutorial bRayNFCsHz4 bestätigt das: Auch mit Creative-Cloud-Abo, das Acrobat Pro enthält,
braucht man für PDF Spaces ein eigenes Studio-Abo.

---

## 1. Anzeigen und Lesen

| Feature | Was es tut (Adobe-Doku) | Im Tutorial | Übertragung auf hpro |
|---|---|---|---|
| Zoom, Seitenansicht, Scrollen | Zoom, Lupe, Pan & Zoom, Ein-/Zweiseitenansicht, Vollbild ([U/adjusting-pdf-views.html](https://helpx.adobe.com/acrobat/using/adjusting-pdf-views.html)) | Q9nZIYWrMJI: Seitenminiaturen, Seitensprung per Nummer, Zwei-Seiten-Ansicht, „Enable scrolling“, Zoom per Strg+Mausrad. sd7FIwMiP-4: Zoom-Leiste, Unterschied Auswahl- und Handwerkzeug | **[anders] MVP:** Zoom heißt Schriftgröße, nicht Seitenvergrößerung; Text fließt neu um (WCAG 1.4.10 Reflow). Seitenansichten entfallen. Inhaltsverzeichnis aus Überschriften, Sprung zu Absatznummern |
| Reflow (Umfließen) | temporäre einspaltige Ansicht; kein Speichern, Bearbeiten, Drucken; Formulare und Signaturfelder fließen nicht um ([U/reading-pdfs-reflow-accessibility-features.html](https://helpx.adobe.com/acrobat/using/reading-pdfs-reflow-accessibility-features.html)) | kein Tutorial-Beleg | **[nativ] MVP:** Umfließen ist der Normalzustand, inklusive Formularen und Signaturfeldern |
| Liquid Mode | KI-Reflow auf Adobe-Servern, nur mobil/Chromebook; ≤ 200 Seiten, ≤ 10 MB; nicht für Rechnungen, dichte Tabellen, Scans ([helpx mobile](https://helpx.adobe.com/acrobat/mobile/view-manage-files/liquid-mode.html); [Adobe devnet](https://www.adobe.com/devnet-docs/acrobat/android/en/lmode.html)) | H1wDqQomoAE behauptet Desktop-Verfügbarkeit 2025, von Adobe nicht belegt; weitere Videos durch IP-Sperre nicht abrufbar | **[anders]:** entfällt, weil die Struktur im Dokument steckt. Lokal, ohne Server, ohne Seitenlimit. Ein Gliederungsmodus mit ein- und ausklappbaren Abschnitten ist als Reader-Ansicht leicht ([neu]) |
| Vorlesen (Read Out Loud) | Systemstimmen, folgt bei getaggten PDFs dem Strukturbaum; „premium online voices“ in der Cloud ([D/whats-new](https://helpx.adobe.com/acrobat/desktop/whats-new/whats-new-acrobat-desktop.html)) | kein Tutorial-Beleg (IP-Sperre) | **[neu] MVP:** Vorlesen über die Sprachausgabe des Systems entlang der DOM-Reihenfolge, mit Mitlesemarkierung. Qualität der Web Speech API ist offen (**OFFENE FRAGE**). Online-Stimmen nur optional |
| Dunkelmodus, Farben ersetzen | Themes System/Hell/Dunkel; „Replace Document Colors“ ([D/…/change-display.html](https://helpx.adobe.com/acrobat/desktop/get-started/preferences-and-settings/change-display.html)) | kein Tutorial-Beleg | **[nativ] MVP:** `prefers-color-scheme` und Reader-Themes über CSS-Variablen; das Dokument muss sie respektieren (Kontrastprüfung im Editor) |
| Messwerkzeug | Distanz, Umfang, Fläche mit Maßstab für CAD-Zeichnungen ([U/grids-guides-measurements-pdfs.html](https://helpx.adobe.com/acrobat/using/grids-guides-measurements-pdfs.html)) | sd7FIwMiP-4 nicht; BtmxU0ykAbo kündigt es nur an | **[neu], spät:** sinnvoll nur für maßstäbliche SVG-Zeichnungen mit deklariertem Maßstab. Kein Kernanwendungsfall eines responsiven Formats (Pläne sind Papierlogik) |
| Ebenen, 3D, Geodaten | OCG-Ebenen, 3D-Modelle (Pro), Geodaten-PDFs ([Notiz D §1](quellen/recherche-d-acrobat-pro-dokumentation.md)) | kein Tutorial-Beleg | **[nativ]/[neu], spät:** ein- und ausblendbare Abschnitte (`details`), 3D über `<model>`/WebGL-Komponente, Karten als Komponente. Nicht im MVP |

## 2. Bearbeiten

| Feature | Was es tut (Adobe-Doku) | Im Tutorial | Übertragung auf hpro |
|---|---|---|---|
| Text bearbeiten | Text ersetzen, einfügen, formatieren; Schrift muss installiert oder eingebettet sein ([D/…/modify-text.html](https://helpx.adobe.com/acrobat/desktop/edit-documents/edit-text-in-pdfs/modify-text.html)) | sd7FIwMiP-4: in Text klicken, Schrift und Farbe werden übernommen, Absatz- und Zeichenabstand. Q9nZIYWrMJI: **Textrahmen seitlich ziehen, „bis es auf einer Zeile ist“**, dann mittig verschieben. fyK5s-_xkgw: jede Seite ist „one giant block of text“ | **[anders] MVP:** semantischer Editor statt Textrahmen-Editor. Das Tutorial zeigt das PDF-Problem: Bearbeiten heißt Kästchen schieben. In hpro fließt Text, Formatierung kommt aus Stilen |
| Bilder und Objekte | zuschneiden, drehen, ersetzen, KI-Bild, „Edit image“ in Adobe Express (Cloud) ([D/…/modify-image.html](https://helpx.adobe.com/acrobat/desktop/edit-documents/edit-images-or-objects/modify-image.html)) | sd7FIwMiP-4: Crop, Bild ersetzen „bleibt an derselben Stelle“, Bearbeiten in Adobe Express (Hintergrund entfernen, Farbe), KI-Bild „Panda eating ice cream“. Q9nZIYWrMJI: Bild exportieren, ersetzen | **[neu] MVP:** Bild einfügen, ersetzen, zuschneiden (CSS `object-fit`/`object-position`), Alt-Text Pflicht. Bildbearbeitung und KI-Bilder **nicht** im MVP |
| Neuer Text, Textfelder | Text hinzufügen | sd7FIwMiP-4: Textrahmen aufziehen, verschieben, drehen | **[anders]:** neue Blöcke im Fluss statt frei positionierter Rahmen. Drehen entfällt |
| Links, Schaltflächen | Links zu Webseiten, Zielen, Dateien; Aktionen ([D/…/link-web-pages.html](https://helpx.adobe.com/acrobat/desktop/edit-documents/use-links-and-attachments/link-web-pages.html)) | sd7FIwMiP-4: Rechteck als Link aufziehen, Stil (sichtbar/unsichtbar), „remove all web links“; Schaltflächen für Datei, Website, Ton | **[nativ] MVP:** `<a>` ist HTML. Externe Links öffnet der Reader nur nach Rückfrage (Sicherheit). Schaltflächen mit Aktionen nur als deklarierte Komponenten |
| Lesezeichen, Miniaturen | Lesezeichen anlegen, Miniaturen zur Navigation ([U/page-thumbnails-bookmarks-pdfs.html](https://helpx.adobe.com/acrobat/using/page-thumbnails-bookmarks-pdfs.html)) | sd7FIwMiP-4 und Q9nZIYWrMJI: Lesezeichen von Hand je Seite anlegen | **[nativ] MVP:** Inhaltsverzeichnis entsteht automatisch aus Überschriften. Nutzerlesezeichen als Annotation |
| Seiten organisieren | löschen, drehen, verschieben, einfügen, extrahieren, ersetzen, teilen ([D/…/split-pdfs.html](https://helpx.adobe.com/acrobat/desktop/edit-documents/organize-pages/split-pdfs.html)) | sd7FIwMiP-4: Seiten ziehen, drehen, zuschneiden, löschen, extrahieren, aus Datei/Zwischenablage/Scanner/Webseite einfügen. Q9nZIYWrMJI: leere Seite einfügen, Dokument und Bild per Drag & Drop einfügen | **[anders] MVP:** „Abschnitte organisieren“: Abschnitte verschieben, aus anderen Dokumenten übernehmen, Dokument in Teile auslagern. Drehen entfällt |
| Zuschneiden, Seitenrahmen | CropBox; Art-, Trim-, BleedBox nur Pro ([D/…/crop-pages.html](https://helpx.adobe.com/acrobat/desktop/edit-documents/organize-pages/crop-pages.html)) | sd7FIwMiP-4: Seite zuschneiden | **[Export]:** nur für Druck-PDF relevant |
| Kopf-/Fußzeilen, Seitenzahlen | Text, Datum, Seitenzahlen, auf mehrere Dateien ([D/…/add-header-footer.html](https://helpx.adobe.com/acrobat/desktop/edit-documents/use-headers-and-footers/add-header-footer.html)) | Q9nZIYWrMJI: sechs Felder, Ränder, gilt für alle Seiten | **[anders]/[Export]:** im Dokument als Kopfbereich/Impressum (Metadaten); auf Seiten nur im PDF-Export (`@page`-Ränder) |
| Wasserzeichen, Hintergrund | Text/Bild, Deckkraft, Drehung ([D/…/add-watermarks.html](https://helpx.adobe.com/acrobat/desktop/edit-documents/add-backgrounds-and-watermarks/add-watermarks.html)) | kein Tutorial-Beleg | **[neu], S:** Status-Banner („Entwurf“, „Vertraulich“) aus Metadaten, vom Reader angezeigt; im Export als Wasserzeichen |
| Bates-Nummerierung (Pro) | eindeutige Kennung pro Seite über Dateisätze ([D/…/add-bates.html](https://helpx.adobe.com/acrobat/desktop/edit-documents/apply-bates-numbering/add-bates.html)) | kein Tutorial-Beleg | **[anders]:** Kennung pro Dokument und pro Absatz (stabile Block-IDs) statt pro Seite; im PDF-Export Bates-Stempel für Gerichtsverfahren |
| Anhänge, Portfolios | Dateien anhängen, PDF-Portfolio ([D/…/add-attachment.html](https://helpx.adobe.com/acrobat/desktop/edit-documents/use-links-and-attachments/add-attachment.html)) | fyK5s-_xkgw: Bild als Anhang hinzufügen und kombinieren | **[nativ]:** Anhänge liegen im Container und sind im Manifest verzeichnet und mitsigniert |
| Metadaten | Eigenschaften, XMP ([Notiz D §2](quellen/recherche-d-acrobat-pro-dokumentation.md)) | I8Qz-KxNShE: Dokumenteigenschaften für Seitengröße, Ersteller, PDF-Version | **[nativ] MVP:** `manifest.json` |
| Text per Chat bearbeiten (KI) | natürlichsprachige Änderungen mit Vorschau ([D/…/edit-pdfs-via-chat-overview.html](https://helpx.adobe.com/acrobat/desktop/use-acrobat-ai/get-started-with-smart-actions/edit-pdfs-via-chat-overview.html)) | kein Tutorial-Beleg | siehe Abschnitt 11 |

## 3. Scannen und OCR

| Feature | Was es tut (Adobe-Doku) | Im Tutorial | Übertragung auf hpro |
|---|---|---|---|
| Scannen vom Scanner | Duplex, OCR beim Scannen, „Make PDF/A-1b compliant“ ([D/…/scan.html](https://helpx.adobe.com/acrobat/desktop/create-documents/scan-documents-to-pdfs/scan.html)) | Q9nZIYWrMJI: „Create“ auch per Scanner | **[anders]:** Scannen ist ein Importweg. hpro übernimmt Scans aus System-Scan-Apps und konvertiert sie (siehe unten) |
| Kamera-Scan (Adobe Scan) | Kantenerkennung, Bereinigung, OCR; Ablage in der Document Cloud ([Adobe Scan](https://www.adobe.com/acrobat/mobile/scanner-app.html)) | kein Tutorial-Beleg (IP-Sperre) | **[neu], spät:** mobile App mit Kamera-Import; MVP nutzt die Scan-Funktionen der Betriebssysteme |
| Text erkennen (OCR) | durchsuchbare Textebene; **nur Pro** erzeugt „Editable Text and Images“ ([D/…/recognize-text.html](https://helpx.adobe.com/acrobat/desktop/create-documents/scan-documents-to-pdfs/recognize-text.html)) | sd7FIwMiP-4: PNG über „Create“ öffnen, Hinweis „scan document identified“, „Enhance“, „Recognize text“; erst beim zweiten Durchlauf editierbar. Q9nZIYWrMJI: im Bearbeiten-Modus „Recognize scan text“; Ergebnis „a bit pixelated“ | **[neu] MVP (über Konverter):** OCR erzeugt in hpro keine unsichtbare Textebene über einem Bild, sondern **echten, strukturierten Text** (Überschriften, Absätze, Tabellen). Werkzeug: Docling mit optionaler OCR, lokal ([Docling](https://github.com/docling-project/docling)). Scan-Bild bleibt als Original im Container |
| Erkannten Text korrigieren | unsichere Wörter prüfen ([D/…/fix-scanned-text.html](https://helpx.adobe.com/acrobat/desktop/create-documents/scan-documents-to-pdfs/fix-scanned-text.html)) | kein Tutorial-Beleg | **[neu]:** Prüfansicht Original-Scan neben erkanntem Text, unsichere Stellen markiert |
| Scan verbessern | Licht, Schatten, Schräglage ([D/…/enhance-images.html](https://helpx.adobe.com/acrobat/desktop/create-documents/scan-documents-to-pdfs/enhance-images.html)) | sd7FIwMiP-4: „Enhance scan file“ | **[neu], spät:** Bildvorverarbeitung im Import |

## 4. Kommentieren und Review

| Feature | Was es tut (Adobe-Doku) | Im Tutorial | Übertragung auf hpro |
|---|---|---|---|
| Kommentare, Notizen | Kommentar an Text oder Bild ([D/…/add-comments.html](https://helpx.adobe.com/acrobat/desktop/share-and-review-documents/review-documents/add-comments.html)) | sd7FIwMiP-4: Text markieren, Kommentar, **Person per @ zuweisen** (wird benachrichtigt). fyK5s-_xkgw: „This is a great section, but make it longer.“ RZPXDesNZw0: Kommentar im PDF Space | **[neu] MVP:** Kommentare als W3C Web Annotations mit `TextQuoteSelector` ([W3C](https://www.w3.org/TR/annotation-model/)), im Container unter `annotations/`. Sie überleben Umbruch und Gerätewechsel, weil sie an Text statt an Koordinaten hängen |
| Markierungen, Redlining | Hervorheben, Unter-/Durchstreichen, Text ersetzen/einfügen ([D/…/add-markups.html](https://helpx.adobe.com/acrobat/desktop/share-and-review-documents/review-documents/add-markups.html)) | sd7FIwMiP-4 und Q9nZIYWrMJI: Highlighter mit Farbwahl, Unterstreichen, Durchstreichen, „Replace selected text“ | **[neu] MVP:** wie oben; „Ersetzen“ als Änderungsvorschlag, den der Autor annimmt (Track Changes) – das kann PDF nicht |
| Zeichnen, Formen, Stempel | Formen, Linien, Freihand; Stempel inkl. dynamischer Datums-/Identitätsstempel ([D/…/add-modify-stamps.html](https://helpx.adobe.com/acrobat/desktop/share-and-review-documents/use-stamps/add-modify-stamps.html)) | Q9nZIYWrMJI: Linie, Pfeil, Rechteck, Kreis, Polygon, Wolke, verbundene Linien, Stempel „Complete“, eigene Stempel, Kreuz/Häkchen/Punkt. sd7FIwMiP-4: Stempel mit Identitätsangaben | **[anders]:** Freihandzeichnung über responsivem Text ist instabil (Text fließt um). Vorschlag: Zeichnungen nur an Bilder und Abbildungen gebunden (SVG-Overlay in Bildkoordinaten); Stempel als Status-Annotationen (Erledigt, Geprüft) mit Person und Zeit |
| Kommentarliste | antworten, Status, filtern ([Notiz D §4](quellen/recherche-d-acrobat-pro-dokumentation.md)) | sd7FIwMiP-4: alle Kommentare im Seitenbereich bearbeiten und beantworten | **[neu] MVP** |
| Import/Export FDF/XFDF | Kommentare austauschen ([U/importing-exporting-comments.html](https://helpx.adobe.com/acrobat/using/importing-exporting-comments.html)) | kein Tutorial-Beleg | **[nativ]:** Web Annotations sind JSON-LD; Export nach XFDF für den PDF-Weg ([Export], spät) |
| Freigabe zur Prüfung per Link | Datei in Adobe-Cloud, Empfänger kommentieren im Browser ohne Anmeldung ([D/…/share-pdfs.html](https://helpx.adobe.com/acrobat/desktop/share-and-review-documents/share-documents/share-pdfs.html)) | Q9nZIYWrMJI: per E-Mail einladen. RZPXDesNZw0: Space-Link öffnen im Inkognito-Fenster ohne Konto; Kommentieren verlangt Adobe-Konto oder Gastnamen | **[anders]:** Grundweg ist **Datei verschicken** (Kommentare im Container, Zusammenführen beim Autor). Cloud-Freigabe optional als Dienst, nicht Voraussetzung. Spät: CRDT-Sync (Automerge) für gleichzeitiges Kommentieren |
| Review-Tracking | Status, Prüferliste ([D/…/track-reviews.html](https://helpx.adobe.com/acrobat/desktop/share-and-review-documents/manage-reviews/track-reviews.html)) | H1wDqQomoAE: Dashboard, wer signiert/geöffnet hat (unverifiziert) | **[neu], L:** nur mit Sync-Dienst; Lesebestätigung nur mit ausdrücklicher Zustimmung (kein Tracking im Dokument) |
| Dateien vergleichen (Pro) | Vergleich zweier Versionen mit Berichtsdokument ([U/compare-documents.html](https://helpx.adobe.com/acrobat/using/compare-documents.html)) | BtmxU0ykAbo (2019): Side-by-Side-Bericht, Einfügungen, Ersetzungen, Annotationen, Filter, Schritt für Schritt | **[neu] MVP (Textebene):** Vergleich auf Struktur- und Textebene (Absätze, Tabellenzellen, Formularwerte) ist mit HTML **viel genauer** als Pixel- oder Glyphenvergleich. Bericht als eigenes hpro-Dokument |

## 5. Formulare

| Feature | Was es tut (Adobe-Doku) | Im Tutorial | Übertragung auf hpro |
|---|---|---|---|
| Formular vorbereiten mit Felderkennung | erkennt Felder in Dokumenten und Scans ([D/…/convert-to-forms.html](https://helpx.adobe.com/acrobat/desktop/work-with-pdf-forms/create-forms/convert-to-forms.html)) | J8hjqIkngKg: „Prepare a form“ → „Create form“ → Felder werden automatisch erkannt → anpassen → Vorschau → speichern. H1wDqQomoAE: erkennt Name, Datum, E-Mail | **[neu] MVP:** im Editor Formularfelder als Blöcke; beim PDF-Import werden AcroForm-Felder übernommen, bei flachen PDFs per Erkennung vorgeschlagen |
| Feldtypen | Text, Kontrollkästchen, Optionsfeld, Liste, Dropdown, Schaltfläche, Bild, Signatur, Barcode ([D/…/field-properties.html](https://helpx.adobe.com/acrobat/desktop/work-with-pdf-forms/customize-form-fields/field-properties.html)) | t6ITOk8_-_c: Feldtyp „Digital signature“ platzieren | **[nativ] MVP:** HTML hat mehr Feldtypen (Datum, Zahl, E-Mail, Datei) und native Validierung; BFO nennt dynamische Felder „the biggest capability gap between HTML and PDF“ ([BFO](https://bfo.com/misc/2025-pdf-days-berlin-presentation/presentation-pdf1.pdf)). Signaturfeld und Barcode als Komponenten ([neu]) |
| Berechnungen, JavaScript | Summe/Produkt, vereinfachte Notation, eigenes JavaScript ([D/…/set-calculation-fields.html](https://helpx.adobe.com/acrobat/desktop/work-with-pdf-forms/customize-form-fields/set-calculation-fields.html)); JavaScript-Editor und Debugger ([U/add-debug-javascript.html](https://helpx.adobe.com/acrobat/using/add-debug-javascript.html)) | kein Tutorial-Beleg (Video TAHKKl4pMKU durch IP-Sperre nicht abrufbar) | **[anders]:** **kein freies JavaScript**. Berechnungen deklarativ in einer `<hp-calc>`-Komponente (Formelsprache, ähnlich Tabellenkalkulation), Validierung über JSON Schema. Sicherer und prüfbar |
| Datensammlung | Rückläufer sammeln, Export CSV/XML, FDF/XFDF ([U/collecting-pdf-form-data.html](https://helpx.adobe.com/acrobat/using/collecting-pdf-form-data.html)) | kein Tutorial-Beleg | **[nativ] MVP (Export):** Formulardaten liegen ohnehin als `data/form.json` im Container; Sammeln heißt JSON-Dateien zusammenführen und als CSV exportieren |
| Verteilen und Tracker | per E-Mail oder Server, Tracker ([D/…/track-forms.html](https://helpx.adobe.com/acrobat/desktop/work-with-pdf-forms/share-forms/track-forms.html)) | kein Tutorial-Beleg | **[neu], L:** optionaler Rücklaufdienst |
| Reader Extended PDF (Pro) | erlaubt Reader-Nutzern Speichern und Kommentieren ([D/…/allow-form-saving.html](https://helpx.adobe.com/acrobat/desktop/work-with-pdf-forms/create-forms/allow-form-saving.html)) | kein Tutorial-Beleg | **[anders]:** entfällt. Der hpro-Reader ist kostenlos und darf immer speichern und kommentieren; künstliche Sperren widersprechen dem offenen Format |
| Webformulare (Acrobat Sign, Pro) | Online-Formulare mit E-Signatur, Cloud ([Pläne](https://www.adobe.com/acrobat/plans.html)) | kein Tutorial-Beleg | **[nativ]:** ein hpro-Formular ist schon HTML; Veröffentlichung als Webseite ist ein Export ([Export], spät) |
| XFA | dynamische XFA-Formulare nur eingeschränkt bearbeitbar ([Notiz D §5](quellen/recherche-d-acrobat-pro-dokumentation.md)) | – | Import nicht untersucht (**OFFENE FRAGE**) |

## 6. Signaturen

| Feature | Was es tut (Adobe-Doku) | Im Tutorial | Übertragung auf hpro |
|---|---|---|---|
| Ausfüllen und Unterschreiben (einfache E-Signatur) | Signatur tippen, zeichnen, als Bild; Sync über Adobe-Cloud ([D/…/add-esign.html](https://helpx.adobe.com/acrobat/desktop/e-sign-documents/fill-sign-documents/add-esign.html)) | sd7FIwMiP-4, fyK5s-_xkgw, Q9nZIYWrMJI: Name tippen, mit Maus zeichnen, Bild importieren; Initialen speichern und wiederverwenden; Datum als Textfeld daneben | **[neu] MVP:** einfache elektronische Signatur als Annotation (Bild + Name + Zeit) – rechtlich schwach, aber verbreitet. Im Reader klar als „einfache Signatur“ gekennzeichnet, nicht mit AdES/QES verwechselbar |
| E-Signaturen anfordern (Acrobat Sign) | Empfänger, Reihenfolge, Felder; Cloud; Unterzeichner brauchen kein Abo ([D/…/send-for-signing.html](https://helpx.adobe.com/acrobat/desktop/e-sign-documents/request-e-signatures/send-for-signing.html)) | sd7FIwMiP-4: mehrere Empfänger, „recipients must sign in order“. fyK5s-_xkgw: Empfänger bekommt Feld, signiert, Dokument kommt zurück | **[neu], L:** Signaturreihenfolge im Manifest; Versand per Datei (MVP) oder über einen Dienst (spät). Mehrfachsignaturen bricht ASiC-E nicht ([ETSI EN 319 162-1](https://www.etsi.org/deliver/etsi_en/319100_319199/31916201/01.01.01_60/en_31916201v010101p.pdf)) |
| Digitale Signatur mit Zertifikat | Digital ID, optional „Lock document after signing“ ([D/…/add-digital-sign.html](https://helpx.adobe.com/acrobat/desktop/e-sign-documents/fill-sign-documents/add-digital-sign.html)) | t6ITOk8_-_c: Signaturfeld über „Prepare a form“ platzieren, Signatur zeichnen, **Passwort der Digital ID** eingeben, Datum und Zeit werden eingebettet | **[neu] MVP:** XAdES-Signatur im ASiC-E-Container über alle Dateien; Signaturfeld als Komponente zeigt den Status. „Lock after signing“ = Profil *Signiert* |
| Zertifizieren | erste Signatur legt erlaubte spätere Änderungen fest ([D/…/certify-pdfs.html](https://helpx.adobe.com/acrobat/desktop/e-sign-documents/manage-digital-signatures/certify-pdfs.html)) | sd7FIwMiP-4 erwähnt „certified copy with an audit trail“ | **[neu]:** Signaturrichtlinie im Manifest (z. B. „nur Formularwerte und Kommentare dürfen sich ändern“); Prüfung durch Vergleich der signierten Dateiliste |
| Zeitstempel, LTV | Zeitstempelserver (RFC 3161), PAdES, LTV ([D/…/add-time-stamps.html](https://helpx.adobe.com/acrobat/desktop/e-sign-documents/fill-sign-documents/add-time-stamps.html)) | t6ITOk8_-_c: „date and time automatically embedded“ (ohne Zeitstempeldienst ist das laut Adobe nur die lokale Uhrzeit) | **[neu] MVP:** qualifizierter Zeitstempel (XAdES B-T), Validierungsdaten einbetten (B-LT), Archivzeitstempel (B-LTA) ([DVO 2025/1929](https://eur-lex.europa.eu/eli/reg_impl/2025/1929/oj)) |
| Signaturen prüfen | Signaturpanel, „Validate all signatures“ ([D/…/validate-digital-sign.html](https://helpx.adobe.com/acrobat/desktop/e-sign-documents/manage-digital-signatures/validate-digital-sign.html)) | ck22sJjsk4A: Signaturpanel → Menü → „Validate all signatures“ → bestätigen → speichern | **[neu] MVP:** Prüfung beim Öffnen automatisch, Ergebnis dauerhaft sichtbar; Validator auf Basis EU DSS ([DSS](https://github.com/esig/dss)) |
| AATL, EUTL | Adobe-Vertrauenslisten inkl. reduzierter EU-Liste ([helpx KB](https://helpx.adobe.com/acrobat/kb/trust-services.html)) | – | **[neu] MVP:** direkt die EU-Vertrauenslisten (LOTL) nutzen; keine eigene Herstellerliste |
| eIDAS-QES, Cloud-Signatur | über Acrobat Sign mit QTSPs, z. B. primesign (Graz) mit ID Austria ([Adobe eIDAS](https://www.adobe.com/acrobat/business/compliance/eidas.html)) | kein Tutorial-Beleg | **[neu] MVP (ein Anbieter):** Fernsignatur über CSC API ([CSC](https://cloudsignatureconsortium.org/resources/csc-api-v2-2/)); später EUDI-Wallet. Ob Acrobat Desktop ohne Acrobat Sign QES per Cloud kann, ist nicht belegt (**OFFENE FRAGE**, Notiz D §19) |

## 7. Sicherheit

| Feature | Was es tut (Adobe-Doku) | Im Tutorial | Übertragung auf hpro |
|---|---|---|---|
| Passwortschutz | Kennwort zum Öffnen oder Bearbeiten ([D/…/add-passwords-to-pdfs.html](https://helpx.adobe.com/acrobat/desktop/protect-documents/protect-with-passwords/add-passwords-to-pdfs.html)) | fyK5s-_xkgw und Q9nZIYWrMJI: Passwort zum Ansehen setzen, beim Öffnen abgefragt | **[neu] MVP:** Verschlüsselung des ganzen Containers (CMS EnvelopedData, [RFC 5652](https://www.rfc-editor.org/rfc/rfc5652)) |
| Berechtigungen (Drucken, Kopieren) | Einschränkungen ([Notiz D §7](quellen/recherche-d-acrobat-pro-dokumentation.md)) | Q9nZIYWrMJI: Passwort „for editing“ | **[anders]:** in einem offenen Format nicht durchsetzbar; ehrlich nur Vertraulichkeit (Verschlüsselung) und Integrität (Signatur) anbieten |
| Zertifikatsverschlüsselung | nur benannte Empfänger öffnen ([D/…/certificate-encrypt.html](https://helpx.adobe.com/acrobat/desktop/protect-documents/encrypt-with-certificates/certificate-encrypt.html)) | kein Tutorial-Beleg | **[neu] MVP:** CMS EnvelopedData für Empfängerzertifikate |
| Schwärzen (Pro) | Text/Bilder markieren, anwenden, Muster suchen, Codes ([D/…/redact.html](https://helpx.adobe.com/acrobat/desktop/protect-documents/redact-pdfs/redact.html)) | RtkvHiTFRjw: Füllfarbe festlegen, markieren, „Apply“; **„Repeat mark across pages“**; ganze Seiten; „Find text & redact“ in Datei oder **Ordner**, Muster (Telefon, Kreditkarte, Sozialversicherungsnummer, E-Mail, Datum); dauerhaft, deshalb Kopie mit „_Redacted“. Q9nZIYWrMJI: 99 Fundstellen auf einmal | **[neu], M:** In HTML ist Schwärzen strukturell einfacher und sicherer: Der Text wird aus DOM, `data/`, Annotationen, Metadaten und Versionshistorie **entfernt** und durch einen Platzhalter mit Schwärzungscode ersetzt. Pflicht: Prüfung, dass der Begriff nirgends im Container mehr vorkommt (inkl. Alt-Texten, Anhängen) |
| Bereinigen (Sanitize, Pro) | Metadaten, Kommentare, verborgene Ebenen, Skripte, Anhänge entfernen ([D/…/sanitize.html](https://helpx.adobe.com/acrobat/desktop/protect-documents/redact-pdfs/sanitize.html)) | RtkvHiTFRjw: Schalter „Sanitize and remove hidden information“ beim Anwenden; entfernt u. a. Anhänge, Links, Lesezeichen, Kommentare, Metadaten, digitale Signaturen | **[neu], S:** „Veröffentlichungskopie“: Annotationen, Historie, Autorenmetadaten, Original-PDF, nicht genutzte Ressourcen entfernen; Bericht, was entfernt wurde |
| Microsoft Purview (MPIP) | Vertraulichkeitsbezeichnungen setzen und lesen ([D/…/mpip-support-acrobat.html](https://helpx.adobe.com/acrobat/desktop/protect-documents/security-policies/mpip-support-acrobat.html)) | kein Tutorial-Beleg | **[neu], L:** Vertraulichkeitsstufe als Manifest-Feld; MPIP-Anbindung erst bei Unternehmenskunden |
| Geschützte Ansicht, Sandbox, JavaScript-Einschränkung | Protected View, Sandbox, JS-API einschränken ([Notiz D §7](quellen/recherche-d-acrobat-pro-dokumentation.md)) | – | **[neu] MVP, Kern der Architektur:** Profile, iframe-Sandbox, CSP, kein freies JavaScript ([03, Abschnitt 2.4](03-konzept.md#24-sicherheit-wie-verhindert-man-dass-dokumente-schadsoftware-werden)) |

## 8. Zusammenführen, Aufteilen, Optimieren, Export/Konvertierung

| Feature | Was es tut (Adobe-Doku) | Im Tutorial | Übertragung auf hpro |
|---|---|---|---|
| Erstellen aus anderen Formaten | aus Office, Bild, HTML, Webseite, Scanner ([Notiz D §2](quellen/recherche-d-acrobat-pro-dokumentation.md)) | sd7FIwMiP-4: „Create“ aus Word, Excel, Text, Webseite, „more formats“. fyK5s-_xkgw: Bild/Word zu PDF | **[neu] MVP (PDF), spät (DOCX/ODT):** Import über Docling (liest PDF, DOCX, PPTX, XLSX, HTML, EPUB, ODF u. a., [Docling](https://github.com/docling-project/docling)) |
| Zusammenführen | mehrere Dateien zu einem PDF; neu: alternativ PDF Space ([D/…/combine-files.html](https://helpx.adobe.com/acrobat/desktop/edit-documents/combine-files/combine-files.html)) | fyK5s-_xkgw: offene Dateien und Bild kombinieren, als neue Datei speichern | **[neu], S:** Dokumente als Abschnitte zusammenführen; Manifest, Daten und Annotationen werden zusammengeführt, Signaturen der Teile bleiben als Anlagen erhalten |
| Aufteilen | nach Seiten, Größe, Lesezeichen ([D/…/split-pdfs.html](https://helpx.adobe.com/acrobat/desktop/edit-documents/organize-pages/split-pdfs.html)) | – | **[anders], S:** nach Abschnitten/Überschriften |
| Größe reduzieren, PDF Optimizer (Pro) | Bilder neu berechnen, Fonts, Objekte verwerfen, Fast Web View ([D/…/advance-size-reduction.html](https://helpx.adobe.com/acrobat/desktop/create-documents/optimize-pdfs/advance-size-reduction.html)) | Q9nZIYWrMJI: „Reduce file size“ beim Speichern unter. QBu7zOuy3uM: Optimizer mit 70 ppi im Stapel | **[neu], S:** Bilder in responsiven Varianten (AVIF/WebP, `srcset`), Font-Subsetting, ungenutzte Ressourcen entfernen. Achtung: ändert signierte Dateien, also nur vor dem Signieren |
| Export Word/Excel/PowerPoint/Bild | ([Notiz D §8](quellen/recherche-d-acrobat-pro-dokumentation.md)) | sd7FIwMiP-4 und Q9nZIYWrMJI: Export als Word, Excel, PowerPoint, Bild | **[Export], spät:** DOCX/ODT (Weg offen, **OFFENE FRAGE**), Tabellen als CSV/XLSX aus `data/` und `<table>` ([nativ]) |
| Export als HTML | einzelne oder mehrere HTML-Seiten, Navigation, Bilder, OCR ([D/…/pdf-to-html.html](https://helpx.adobe.com/acrobat/desktop/save-export-documents/convert-to-other-formats/pdf-to-html.html)); Semantik und Responsivität **nicht dokumentiert**; Adobes PDF Services API kann **aus** HTML erzeugen, aber nicht **nach** HTML exportieren ([Adobe Developer](https://developer.adobe.com/document-services/docs/overview/pdf-services-api/dcserviceslicensing/)) | kein Tutorial-Beleg | **[anders]:** das ist der Kern von hpro (PDF → hpro, [03, Abschnitt 4.1](03-konzept.md#41-pdf--hpro)). Qualität von Acrobats HTML-Export im Vergleich zu Docling ist in Phase 2 zu testen (**OFFENE FRAGE**) |
| PDF/A, PDF/X, PDF/E (Pro) | speichern und prüfen über Preflight ([U/pdf-x-pdf-a-pdf.html](https://helpx.adobe.com/acrobat/using/pdf-x-pdf-a-pdf.html)) | – | **[Export] MVP (PDF/A):** WeasyPrint + veraPDF; PDF/X spät |
| Übersetzen | über Adobe Express in der Cloud ([U/translate-pdf.html](https://helpx.adobe.com/acrobat/using/translate-pdf.html)) | kein Tutorial-Beleg | **[neu], spät:** Übersetzung als neue Sprachfassung im Container (`inLanguage` je Fassung), Struktur bleibt erhalten; Dienstwahl mit Datenschutzabwägung |

## 9. Barrierefreiheit

| Feature | Was es tut (Adobe-Doku) | Im Tutorial | Übertragung auf hpro |
|---|---|---|---|
| Automatisch taggen (Pro) | Autotag, optional in der Cloud (Überschriften, Tabellen, Listen, mehrspaltige Lesereihenfolge) ([U/cloud-auto-tagging-accessibility-pdfs.html](https://helpx.adobe.com/acrobat/using/cloud-auto-tagging-accessibility-pdfs.html)) | JbJegvLCLbQ (2022): ein Klick „Autotag document“, danach Tags-Panel; „important to apply the rest of the accessibility“ | **[nativ] MVP:** entfällt als Schritt. HTML ist von Anfang an strukturiert; der Editor erzeugt nur semantische Elemente. Beim PDF-Import übernimmt der Konverter diese Rolle |
| Lesereihenfolge korrigieren (Pro) | Reading Order Tool ([U/touch-reading-order-tool-pdfs.html](https://helpx.adobe.com/acrobat/using/touch-reading-order-tool-pdfs.html)) | bAi8FFbCsF8: Absatz-Tag in H1 ändern, Tags löschen und neu ziehen, **Tabellenkopf-Zellen per Table Editor**, Reihenfolge im Order-Panel per Drag & Drop, weil zweispaltiges Layout falsch gelesen wird | **[nativ] MVP:** DOM-Reihenfolge ist Lesereihenfolge; zweispaltige Darstellung ist reines CSS und verändert die Lesereihenfolge nicht. Tabellenköpfe (`<th scope>`) erzwingt der Editor |
| Barrierefreiheitsprüfung und Bericht (Pro) | prüft „such as PDF/UA and WCAG 2.0“, Bericht mit Korrekturlinks ([U/create-verify-pdf-accessibility.html](https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html)) | 7ms9iAE1Q9I: sieben Kategorien (Dokument, Seiteninhalt, Formulare, Alternativtext, Tabellen, Listen, Überschriften), pass/fail/manuell; Rechtsklick „Fix“ (Sprache, Titel, Alt-Text), „Skip rule“, „Explain“; **„Adobe can tell if your document is tagged, but not if those tags are correct“** | **[neu] MVP:** Prüfer im Editor (z. B. axe-core, findet im Schnitt 57 % der WCAG-Probleme automatisch, [axe-core](https://github.com/dequelabs/axe-core)) plus **geführte manuelle Prüfschritte**; Bericht mitsigniert im Container; Prüfung gegen WCAG 2.2, nicht 2.0 |
| Tags- und Inhaltspanel (Pro) | Strukturbaum direkt bearbeiten ([U/editing-document-structure-content-tags.html](https://helpx.adobe.com/acrobat/using/editing-document-structure-content-tags.html)) | 7ms9iAE1Q9I: Listenpunkte im Tags-Panel unter das Listen-Tag ziehen, überflüssiges Sect-Tag löschen | **[nativ]:** Strukturansicht = DOM-Gliederung im Editor; kein getrennter Tag-Baum, der vom Inhalt abweichen kann |
| PDF/UA-Prüfung per Preflight (Pro) | Preflight zeigt PDF/UA-Status ([U/analyzing-documents-preflight-tool-acrobat.html](https://helpx.adobe.com/acrobat/using/analyzing-documents-preflight-tool-acrobat.html)) | OzoMoNe6ng0: Print Production → Preflight → „PDF standards“ → „Fix problems in PDF tagging structure“ → „Analyze and fix“ | **[Export] MVP:** PDF/UA-Validierung des Exports mit veraPDF ([GitHub](https://github.com/veraPDF/veraPDF-library)) |
| Lese-Einstellungen | Farben ersetzen, Lesereihenfolge, Screenreader-Präferenzen ([U/reading-pdfs-reflow-accessibility-features.html](https://helpx.adobe.com/acrobat/using/reading-pdfs-reflow-accessibility-features.html)) | – | **[nativ] MVP:** Nutzer stellt Schrift, Abstände, Kontrast ein (EAA Anhang I), Screenreader arbeiten mit dem nativen Accessibility-Baum der Engine |

## 10. Zusammenarbeit und Cloud

| Feature | Was es tut (Adobe-Doku) | Im Tutorial | Übertragung auf hpro |
|---|---|---|---|
| Cloud-Speicher, Teilen per Link | 100 GB mit Abo, AWS (Dublin, Tokio, Virginia); Link-Freigabe ([W/…/cloud-storage-data-centers.html](https://helpx.adobe.com/acrobat/web/manage-cloud-storage/manage-adobe-cloud-files/cloud-storage-data-centers.html)) | sd7FIwMiP-4: in Adobe-Cloud speichern, auf allen Geräten verfügbar. fyK5s-_xkgw: Speichern in der Cloud | **[anders]:** local-first; Datei ist das Dokument. Ablage in beliebigen Speichern (Nextcloud, OneDrive, Dateisystem). Kein Herstellerkonto für Leser |
| **PDF Spaces** (Studio) | KI-Arbeitsraum mit bis zu 100 Dateien, je ≤ 600 Seiten; Notizen, Assistent mit Zitaten ([D/…/supported-formats-limitations.html](https://helpx.adobe.com/acrobat/desktop/explore-pdf-spaces/supported-formats-limitations.html)) | bRayNFCsHz4: 11 Dateien (PDF, Word, PowerPoint, **VTT-Transkript**) per Drag & Drop, automatische Zusammenfassung und „Insights“ mit Zitaten, Notizen. RZPXDesNZw0: Richtlinienprüfung im Space, Dateien von Rechtsabteilung und HR hinzufügen, „100 files of up to 600 pages each“ | **[anders], XL:** hpro ist zuerst ein Format, kein Arbeitsraum. Entsprechung wäre eine **Sammlung** (Container mit mehreren Dokumenten und Notizen). KI darüber nur optional (Abschnitt 11) |
| Spaces teilen, Rollen | Zugriff per Link, Organisation, Eingeladene; Rechte ansehen/kommentieren/hinzufügen ([D/…/share-pdf-spaces.html](https://helpx.adobe.com/acrobat/desktop/explore-pdf-spaces/share-pdf-spaces.html)) | RZPXDesNZw0: Rollen **View only** (ohne Abo), **Reviewer** und **Contributor** (beide mit Abo); Chatverlauf bleibt privat; Persona ist für Empfänger gesperrt. bRayNFCsHz4: „Unshare“, „invited people only“, Empfänger braucht kein Acrobat | **[neu], L:** Rollen als Signatur- und Änderungsrichtlinie im Manifest; Freigabe über optionalen Sync-Dienst |
| Engagement-Tracking | Eigentümer sieht, wann Empfänger öffnen ([D/whats-new](https://helpx.adobe.com/acrobat/desktop/whats-new/whats-new-acrobat-desktop.html)) | – | **[anders]:** bewusst **nicht** im Format (kein Tracking-Pixel, `connect-src 'none'`); Lesebestätigung nur aktiv durch den Leser |
| Integrationen | ChatGPT, Copilot, Teams, SharePoint, Outlook ([W/…/pdf-tasks-in-chatgpt.html](https://helpx.adobe.com/acrobat/web/use-acrobat-extensions/acrobat-for-chatgpt/pdf-tasks-in-chatgpt.html)) | – | **[neu], spät:** Container-Bibliothek als offene Schnittstelle; MCP-Server o. ä. denkbar |

## 11. KI-Funktionen

Alle generativen KI-Funktionen laufen bei Adobe in der Cloud („involves cloud processing of
documents“), über Microsoft Azure OpenAI, mit Zwischenspeicherung bis 12 Stunden; Adobe erklärt,
Kundeninhalte nicht zum Training zu nutzen; Enterprise-Kunden können EU-Rechenzentren festlegen
([D/…/content-usage-handling.html](https://helpx.adobe.com/acrobat/desktop/use-acrobat-ai/understand-usage-policies/content-usage-handling.html)).
Grenzen: < 100 MB, ≤ 600 Seiten, 1.000 Anfragen pro Monat und Nutzer
([D/…/ai-usage-policy-limitations.html](https://helpx.adobe.com/acrobat/desktop/use-acrobat-ai/understand-usage-policies/ai-usage-policy-limitations.html)).

| Feature | Was es tut (Adobe-Doku) | Im Tutorial | Übertragung auf hpro |
|---|---|---|---|
| AI Assistant (Fragen & Antworten) | Fragen mit Zitaten, auch über mehrere Dokumente ([D/…/acrobat-ai-overview.html](https://helpx.adobe.com/acrobat/desktop/use-acrobat-ai/get-started-with-generative-ai/acrobat-ai-overview.html)) | sd7FIwMiP-4: „What is the paradox mentioned in the title“, Zitate springen an die Fundstelle; zweites Dokument hinzufügen, Verbindungen finden. fyK5s-_xkgw: „how many times does PDF appear“ → 22. bRayNFCsHz4: lehnt Frage nach Aktienkurs ab, weil nicht in den Dokumenten; **Zitate erscheinen teils verzögert** | **[neu], XL, nicht MVP:** hpro ist für KI strukturell leichter auswertbar (semantisches HTML, Daten als JSON, stabile Block-IDs als Zitatanker). Vorschlag: offene Schnittstelle, lokales Modell oder vom Nutzer gewählter Dienst; nie ohne ausdrückliche Zustimmung Inhalte versenden |
| Generative Summary | Überblick, Abschnittszusammenfassungen mit Quellen ([D/…/generative-summary-overview.html](https://helpx.adobe.com/acrobat/desktop/use-acrobat-ai/get-started-with-generative-ai/generative-summary-overview.html)) | sd7FIwMiP-4: zitierte Zusammenfassung eines Papers. RZPXDesNZw0: Zusammenfassung beim Hochladen | **[anders]:** Autoren können eine **mitsignierte, menschlich geprüfte Zusammenfassung** im Dokument hinterlegen (Abstract-Block); KI-Zusammenfassung optional und als solche gekennzeichnet (C2PA `c2pa.ai-disclosure`) |
| Personas, eigene Assistenten | Analyst, Entertainer, Instructor, „Create your own“ ([D/…/custom-ai-insights.html](https://helpx.adobe.com/acrobat/desktop/explore-pdf-spaces/custom-ai-insights.html)) | bRayNFCsHz4: Analyst liefert Vergleichstabelle; Instructor erzeugt **Quiz**; eigene Persona „Colvento Coach“ mit generierten Anweisungen. RZPXDesNZw0: Persona „Policy review assistant“ | **[anders], spät:** außerhalb des Formatkerns |
| Podcast generieren | „Highlights“ oder „Deep dive“, Transkript ([D/…/podcasts/create.html](https://helpx.adobe.com/acrobat/desktop/use-acrobat-ai/podcasts/create.html)) | RZPXDesNZw0 erwähnt beim Teilen „two podcasts which it automatically generates“; eigene Podcast-Tutorials durch IP-Sperre nicht abrufbar | **[anders]:** Vorlesen (Abschnitt 1) deckt den barrierefreien Kern ab; generierte Audiofassungen als optionale Anlage mit KI-Kennzeichnung |
| Präsentation generieren (Express) | aus Prompt, Dateien oder Space; Export PPT/PDF ([W/…/generate-presentations.html](https://helpx.adobe.com/acrobat/web/create-pdfs/create-presentations/generate-presentations.html)) | kein Tutorial-Beleg (IP-Sperre) | **[anders], spät:** Präsentationsansicht desselben Dokuments (Abschnitte als Folien, CSS-Ansicht) ist naheliegender als eine zweite Datei |
| Interaktiver Bericht | KI erzeugt aus langen Dokumenten einen interaktiven visuellen Bericht ([W/…/interactive-reports.html](https://helpx.adobe.com/acrobat/web/use-acrobat-ai/read-pdfs/interactive-reports.html)) | – | **Beobachtung:** Adobe selbst baut aus PDFs **interaktive, responsive Ansichten** – das ist der Bedarf, den hpro als Format adressiert |
| Contract Intelligence | Vertragsübersicht, Schlüsselbegriffe, Vergleich bis 10 Verträge (Pressemitteilung 02/2025, nur über Suchergebnis belegt) | – | **[neu], spät:** mit strukturierten Vertragsdaten in `data/` ohne KI auswertbar |
| KI-Schwärzen, Bearbeiten per Chat | ([D/whats-new](https://helpx.adobe.com/acrobat/desktop/whats-new/whats-new-acrobat-desktop.html)) | – | spät; Schwärzungsvorschläge auch regelbasiert (Muster) möglich |

## 12. Automatisierung

| Feature | Was es tut (Adobe-Doku) | Im Tutorial | Übertragung auf hpro |
|---|---|---|---|
| Action Wizard / geführte Aktionen (Pro) | gespeicherte Befehlsfolgen auf Dateien und Ordner ([U/action-wizard-acrobat-pro.html](https://helpx.adobe.com/acrobat/using/action-wizard-acrobat-pro.html)) | QBu7zOuy3uM (2013): neue Aktion, Ordner wählen, Dateinamen-Suffix „-web“, PDF Optimizer (70 ppi), Zielordner, ausführen. Neuere Videos (rRSYOp7PZzI, Cqu-e-uXxQo) durch IP-Sperre nicht abrufbar | **[neu], M:** Kommandozeilenwerkzeug und Bibliothek für dieselben Operationen (konvertieren, prüfen, signieren, exportieren). Weil das Format offen ist, gehen Standard-Werkzeuge (Skripte, CI) |
| Stapel in Einzelwerkzeugen | „Apply to multiple files“ bei Wasserzeichen, OCR, Teilen ([Notiz D §12](quellen/recherche-d-acrobat-pro-dokumentation.md)) | RtkvHiTFRjw: Suchen und Schwärzen über einen ganzen Ordner | **[neu], M:** wie oben |
| JavaScript-Konsole, Acrobat SDK | Debugger, Plug-ins, IAC ([Acrobat SDK](https://opensource.adobe.com/dc-acrobat-sdk-docs/acrobatsdk)) | – | **[anders]:** keine Skripte im Dokument; Erweiterungen auf Ebene der Anwendung (Plug-in-API, spät, XL) |
| PDF Services API (Cloud) | REST: Erstellen aus HTML, Export, OCR, Auto-Tag, Accessibility Check; 500 Transaktionen/Monat frei ([Adobe Developer](https://developer.adobe.com/document-services/docs/overview/pdf-services-api/dcserviceslicensing/)) | – | **[neu], spät:** dieselbe Bibliothek als selbst hostbarer Dienst |

## 13. Druckvorstufe und Produktion

Alle Werkzeuge sind laut Adobe **Pro-only** ([U/print-production-tools-overview-acrobat.html](https://helpx.adobe.com/acrobat/using/print-production-tools-overview-acrobat.html)).

| Feature | Was es tut (Adobe-Doku) | Im Tutorial | Übertragung auf hpro |
|---|---|---|---|
| Output Preview, Separationen | Soft-Proof, Simulationsprofile, Farbwarnungen, Object Inspector ([U/previewing-output-acrobat-pro.html](https://helpx.adobe.com/acrobat/using/previewing-output-acrobat-pro.html)) | I8Qz-KxNShE: Seitengröße mit Anschnitt erkennen (Visitenkarte 3,97 × 2,47 statt 3,5 × 2 Zoll), Simulationsprofil (US Web Coated SWOP), **RGB-Rot aus Canva druckt in CMYK matt**, Dot Gain für Schwarzweißdruck, Anzeige nur CMYK/RGB/Bilder/Verläufe/Text, Object Inspector zeigt DeviceRGB und Überdrucken | **[Export], L, nicht MVP:** hpro ist bildschirmorientiert; CSS kennt `device-cmyk` nur in Print-Engines, nicht in Browsern ([BFO](https://bfo.com/misc/2025-pdf-days-berlin-presentation/presentation-pdf1.pdf)). Druckvorstufe bleibt Aufgabe des PDF/X-Exports (Vivliostyle „press-ready“, Prince) |
| Preflight | über 400 Prüfungen und Korrekturen, Profile, Berichte ([U/analyzing-documents-preflight-tool-acrobat.html](https://helpx.adobe.com/acrobat/using/analyzing-documents-preflight-tool-acrobat.html)) | 1GYHOSrW40c: Print Production → Preflight → Druckprofil → beheben. OzoMoNe6ng0: Preflight für PDF/UA | **[neu] MVP (eigene Form):** „Preflight“ für hpro = Konformitätsprüfung gegen das Format-Profil (keine externen Ressourcen, Hashes, Barrierefreiheit, Signaturprofil). Für den Druckexport: veraPDF/PDF/X-Prüfung |
| Farben konvertieren, Ink Manager, Überfüllung, Haarlinien, Druckmarken, Transparenzreduzierung, Output Intents | ([Notiz D §13](quellen/recherche-d-acrobat-pro-dokumentation.md)) | I8Qz-KxNShE: Überdrucken im Object Inspector | **[Export], spät:** ausschließlich im PDF/X-Exportpfad |

---

## Zusammenfassung: Was heißt das für hpro?

| Klasse | Zeilen (von 90) | Beispiele |
|---|---|---|
| **[nativ]** – HTML bringt es mit | 15 (17 %) | Umfließen, Dunkelmodus, Links, Inhaltsverzeichnis, Lesereihenfolge, Tags, Feldtypen, Formulardaten, Metadaten, Anhänge |
| **[neu]** – muss gebaut werden | 42 (47 %) | Editor, Kommentare (Web Annotations), Vergleich, Signaturen, Validierung, Verschlüsselung, Schwärzen, Barrierefreiheitsprüfung, Vorlesen, Automatisierung |
| **[anders]** – Konzept passt nicht | 23 (26 %) | Seiten organisieren, Liquid Mode, Berechtigungsflags, Reader Extended, freies JavaScript, Engagement-Tracking, Freihandzeichnen über Text |
| **[Export]** – nur PDF-Exportpfad | 6 (7 %) | Seitenrahmen, PDF/A/X/UA, Druckvorstufe |
| ohne Klasse | 4 (4 %) | Verweise auf andere Abschnitte, XFA (offen), Beobachtungen |

Gezählt wurde die jeweils erste Klasse in der Spalte „Übertragung“ jeder Tabellenzeile der
Abschnitte 1–13. Das ist eine grobe Orientierung, keine gewichtete Bewertung: Eine „[neu]“-Zeile
wie der Editor wiegt ein Vielfaches einer „[neu]“-Zeile wie Wasserzeichen.

**Beobachtungen aus den Tutorials:**

1. **Bearbeiten heißt in PDF Kästchen schieben.** Q9nZIYWrMJI zieht einen Textrahmen breiter,
   „bis es auf einer Zeile ist“; fyK5s-_xkgw beschreibt jede Seite als „one giant block of text“.
   Ein semantischer Editor ist hier der größte Nutzengewinn.
2. **Barrierefreiheit ist in Acrobat Nacharbeit.** Die Pope-Tech-Videos zeigen Tags korrigieren,
   Lesereihenfolge per Drag & Drop reparieren und Listen im Tag-Baum umhängen, und halten fest, dass
   die Prüfung nicht erkennt, ob Tags korrekt sind. In hpro entfällt der Großteil davon
   konstruktiv.
3. **Adobe entwickelt Richtung KI-Arbeitsraum, nicht Richtung Format.** Die 2025/2026-Videos
   (Teacher's Tech, Kevin Stratvert) sind gesponsert bzw. in Partnerschaft mit Adobe entstanden und
   drehen sich um AI Assistant und PDF Spaces. Der „interaktive Bericht“ zeigt, dass auch Adobe
   interaktive, responsive Sichten auf PDF-Inhalte baut – serverseitig und nur mit KI-Abo.
4. **Cloud-Bindung nimmt zu:** Teilen, Review-Tracking, E-Signatur-Workflows, Liquid Mode, KI,
   Übersetzung, Express-Bildbearbeitung brauchen Adobe-Server (Notiz D §17). Das ist die
   Positionierungslücke für ein local-first-Format.
5. **Signieren ist in Tutorials meist „Bild einer Unterschrift“.** Nur zwei Videos (Just Kristers)
   zeigen Digital IDs und Validierung. Für hpro heißt das: Die Signatur-UI muss den Unterschied
   zwischen einfacher Signatur, AdES und QES verständlich machen.

## Offene Fragen

1. Qualität von Acrobats HTML-Export im Vergleich zu Docling/Marker (eigener Test mit Referenz-PDFs).
2. Kann Acrobat Desktop ohne Acrobat Sign per Cloud-Signatur (CSC) eine QES erzeugen? (Notiz D §19)
3. Gibt es in Acrobat Pro 2026 ein eigenes PDF/UA-Preflight-Profil, und wird PDF/UA-2 bzw. WCAG 2.2 geprüft?
4. Liquid Mode am Desktop 2026? (Video H1wDqQomoAE behauptet es; keine Adobe-Quelle)
5. Preis des KI-Add-ons (US$1,99 laut Planseite vs. US$4,99 laut Pressemitteilung 2025), EUR-Preise für Teams/Express.
6. Tutorial-Belege für Liquid Mode, Vorlesen, Podcast, Präsentation, Übersetzung, Formular-JavaScript und Kamera-Scan fehlen wegen der YouTube-IP-Sperre; nachholen, sobald Abrufe wieder möglich sind.
7. Qualität der Web Speech API bzw. Systemstimmen für deutschsprachiges Vorlesen im Reader.
