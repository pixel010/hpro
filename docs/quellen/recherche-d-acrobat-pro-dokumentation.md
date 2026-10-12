# Recherche D: Feature-Inventar Adobe Acrobat Pro / Acrobat Studio laut Adobe-Dokumentation

**Projekt:** hpro – Recherchephase 1
**Stand der Recherche:** 11.10.2026
**Zweck:** Belegtes Feature-Inventar von Acrobat Pro (inkl. Acrobat Studio, PDF Spaces, AI Assistant) als Grundlage für `docs/02-acrobat-pro-funktionsumfang.md`. Die Spalte „Übertragung auf hpro“ kommt erst dort; dieses Dokument enthält nur, was Adobe selbst dokumentiert.

---

## 0. Methodik und Einschränkungen (bitte zuerst lesen)

1. **Primärquelle:** Adobe Help Center (`helpx.adobe.com/acrobat/...`), adobe.com-Produkt- und Preisseiten, news.adobe.com, Adobe-Entwicklerdokumentation (developer.adobe.com, opensource.adobe.com).
2. **Zugriffsproblem:** `helpx.adobe.com` hat direkte Abrufe (WebFetch und curl) mit **HTTP 403 (Akamai „Access Denied“)** abgelehnt. Die helpx-Seiten wurden deshalb über **Snapshots des Internet Archive** (`web.archive.org/web/2026id_/<URL>`) gelesen. Fast alle Snapshots stammen aus **Aug.–Okt. 2026**. In den Tabellen steht jeweils die **kanonische helpx-URL**, also das Weiterleitungsziel. Viele alte `/acrobat/using/…`-URLs leiten inzwischen auf `/acrobat/desktop/…` um. Das Datum „Last updated“ der Seite steht dabei, wenn es erfasst wurde.
3. **(N)** hinter einer URL heißt: Die Seite steht im offiziellen Navigationsbaum der Acrobat-Desktop-Hilfe (Stand Snapshot 30.09.2026), ihr Inhalt wurde aber nicht einzeln abgerufen. Die Kurzbeschreibung stützt sich dann nur auf den Seitentitel.
4. **„Pro-only?“** steht nur auf **„ja“**, wenn Adobe die Funktion im Seitentitel oder Text ausdrücklich als „Acrobat Pro“ kennzeichnet oder eine Adobe-Plan-Seite sie als Pro-Mehrwert listet. **„nein“** heißt: Adobe nennt sie auch für Standard/Reader. **„nicht gekennzeichnet“** heißt: Die Doku sagt nichts dazu. Das ist **keine** Bestätigung, dass die Funktion auch in Standard enthalten ist.
5. **„Cloud-pflichtig?“** steht nur auf **„ja“**, wenn die Doku Cloud-Verarbeitung, Adobe-Cloud-Speicher, Acrobat Sign oder Adobe Express ausdrücklich nennt. **„nein (lokal)“** heißt: Die Doku beschreibt einen lokalen Desktop-Ablauf ohne Cloud-Erwähnung.
6. Preise in EUR für Österreich wurden über den Adobe-Commerce-Endpunkt `www.adobe.com/web_commerce_artifact` abgefragt, der die Preiskarten auf adobe.com speist. Die Angebots-IDs stammen aus Adobes eigenem Preis-Fragment (`odin.adobe.com/adobe/sites/fragments/…`). Siehe Abschnitt 15.

Abkürzungen: **D/** = `https://helpx.adobe.com/acrobat/desktop/`, **U/** = `https://helpx.adobe.com/acrobat/using/`, **W/** = `https://helpx.adobe.com/acrobat/web/`.

---

## 1. Anzeigen und Lesen

| Feature | Was es tut | Beleg-URL | Pro-only? | Cloud-pflichtig? |
|---|---|---|---|---|
| Zoom-Werkzeuge (Zoom in/out, Pan & Zoom, Loupe/Lupe) | Vergrößerung über Schaltflächen im rechten Bereich. „Pan & zoom“-Fenster mit verschiebbarem Rahmen. Lupenwerkzeug (Loupe) mit eigenem Vergrößerungsregler. | U/adjusting-pdf-views.html (Snapshot 01.09.2026) | nicht gekennzeichnet | nein (lokal) |
| Vollbildmodus, Seitenanzeige, Touch-Modus | Vollbild blendet Menüs und Bedienfelder aus (Strg+L), auch für Präsentationen mit automatischem Seitenwechsel. Einstellbare Seitenlayouts. Touch-Lesemodus für Touch-Geräte. | U/viewing-pdfs-viewing-preferences.html | nicht gekennzeichnet | nein (lokal) |
| Anzeigegröße/Skalierung | Laut What's New übernimmt Acrobat automatisch die Skalierung des Systems und merkt sich die gewählte Anzeigegröße. | D/whats-new/whats-new-acrobat-desktop.html (Stand 16.09.2026) | nein | nein |
| **Reflow (Umfließen)** | Zeigt das PDF **vorübergehend** einspaltig in Fensterbreite an. In dieser Ansicht kann man nicht speichern, bearbeiten oder drucken. Formulare, Kommentare, Signaturfelder und Artefakte (Kopf-/Fußzeilen, Seitenzahlen) werden nicht umbrochen. Seiten mit Text **und** Formular-/Signaturfeldern werden gar nicht umbrochen. Ungetaggte PDFs taggt Acrobat vorher temporär. | U/reading-pdfs-reflow-accessibility-features.html (Last updated 26.02.2026) | nein | nein (lokal) |
| **Liquid Mode** | KI-basierte („Adobe Sensei“) responsive Leseansicht für Smartphones und Tablets. Erzeugt eine Gliederung mit auf- und zuklappbaren Abschnitten sowie einstellbarer Schriftgröße und Zeichen-/Zeilenabstand. Das Original bleibt unverändert. Grenzen: siehe Abschnitt 17. | https://helpx.adobe.com/acrobat/mobile/view-manage-files/liquid-mode.html (Last updated 18.08.2026); https://www.adobe.com/devnet-docs/acrobat/android/en/lmode.html | nein (auch im kostenlosen Reader-Mobile) | **ja** („processed in our secure data servers and immediately deleted … after the experience is generated“, lmode.html) |
| Read Out Loud (Vorlesen, Desktop) | Liest Text, Kommentare und Alternativtexte vor. Bei getaggten PDFs folgt die Reihenfolge dem Strukturbaum, bei ungetaggten wird sie erschlossen. Nutzt die Systemstimmen (SAPI 4/5). Ausdrücklich „kein Screenreader“. | U/reading-pdfs-reflow-accessibility-features.html | nein | nein (lokal, Systemstimmen) |
| Read out loud mit „premium online voices“ | Natürlichere Online-Stimmen | D/whats-new/whats-new-acrobat-desktop.html („Hear text read aloud with natural voices“) | nicht gekennzeichnet | **ja** (laut Text „online voices“) |
| Read aloud (Acrobat Web) | Vorlesen im Browser mit Tempo- und Stimmenwahl sowie Absatzsprung | W/share-review-and-export/review-pdfs/read-aloud.html (14.10.2025) | nein | ja (Web-App) |
| Dark Mode / Display-Themes (Desktop) | Themes „System“, „Light grey“, „Dark grey“. Dunkelgrau gilt für die ganze Oberfläche inklusive Kommentarbereich. | D/get-started/preferences-and-settings/change-display.html (23.09.2025) | nein | nein |
| Dark Mode (Web) | Darstellung „System“, „Light“ oder „Dark“ | W/get-set-up/preferences-settings/set-light-dark-mode.html (01.04.2026) | nein | ja (Web-App) |
| Dokumentfarben ersetzen (Hochkontrast) | Barrierefreiheits-Einstellung „Replace Document Colors“ für Text- und Hintergrundfarben | U/reading-pdfs-reflow-accessibility-features.html | nein | nein |
| Automatisches Scrollen | Freihändiges Scrollen mit Tempo-Tasten 0–9, gedacht vor allem für reflowte Dokumente | U/reading-pdfs-reflow-accessibility-features.html | nein | nein |
| Messwerkzeug („Measure object“) | Werkzeuge für Distanz, Umfang und Fläche mit Maßstab, Fang an Pfaden und Info-Panel. Ergebnisse werden als Kommentare eingefügt. Gedacht u. a. für CAD-Zeichnungen. | U/grids-guides-measurements-pdfs.html (Snapshot 13.06.2026) | nicht gekennzeichnet (für Reader-Nutzer über „Reader Extended PDF“ aus Acrobat Pro freischaltbar, siehe Abschnitt 5) | nein |
| Raster, Hilfslinien, Lineale | Raster mit Fangfunktion, Lineale, Hilfslinien z. B. zum Ausrichten von Formularfeldern | U/grids-guides-measurements-pdfs.html | nicht gekennzeichnet | nein |
| Geodaten-PDFs | Geodaten-PDFs erstellen, Shapefiles importieren, Orte finden, Distanzen und Flächen messen, Markierungen exportieren | D/edit-documents/geospatial-pdfs/geospatial-pdfs.html (N) | nicht gekennzeichnet | nicht dokumentiert |
| Ebenen (OCG) | PDF-Ebenen verwalten, umordnen, zusammenführen, reduzieren, Ebenen-Navigation | D/edit-documents/pdf-layers/pdf-layers.html (N) | nicht gekennzeichnet | nein |
| 3D/Multimedia | 3D-Modelle hinzufügen und messen, Audio/Video einbetten, Videos kommentieren | U/reading-pdfs-reflow-accessibility-features.html (Navigation: „Adding 3D models to PDFs (Acrobat Pro)“, „Add comments to videos“) | 3D hinzufügen: ja (laut Titel) | nein |
| **Dateien vergleichen (Compare Files)** | Vergleicht zwei PDF-Versionen. Modi: Autodetect, „Reports/Spreadsheets/Magazine“ (Fließtext), „Presentation Decks“ (Folien-Matching), „Scanned Documents/Drawings“ (Pixelvergleich). Option „nur Text“. Ergebnis ist ein Berichtsdokument mit Zusammenfassung und Side-by-Side-Ansicht. Die Textoption ist für große Dokumente (250+ Seiten) gedacht. | U/compare-documents.html („Compare two versions of a PDF file (Acrobat Pro)“, 26.02.2026) | **ja** | nein (lokal) |
| Signierte Versionen vergleichen | Vergleich von Dokumentständen vor und nach Signaturen | D/e-sign-documents/manage-digital-signatures/compare-versions.html (N) | nicht gekennzeichnet | nein |

## 2. Bearbeiten

| Feature | Was es tut | Beleg-URL | Pro-only? | Cloud-pflichtig? |
|---|---|---|---|---|
| Text bearbeiten | Bestehenden Text ersetzen, neuen Text einfügen, löschen, formatieren (Schrift, Größe, Farbe, Ausrichtung). Zum Bearbeiten in einer bestimmten Schrift muss diese installiert oder eingebettet sein. | D/edit-documents/edit-text-in-pdfs/modify-text.html (31.08.2026) | nein (Standard: „Edit text and images“) | nein |
| Listen und Rechtschreibung | Nummerierte und Aufzählungslisten bearbeiten, Rechtschreibprüfung | D/edit-documents/edit-text-in-pdfs/edit-lists.html (N); …/spell-check.html (N) | nicht gekennzeichnet | nein |
| Text per Chat bearbeiten (KI) | Text in natürlicher Sprache ersetzen, umschreiben, umformatieren, hervorheben oder schwärzen. Vorschau und Bestätigung vor dem Anwenden. | D/use-acrobat-ai/get-started-with-smart-actions/edit-pdfs-via-chat-overview.html (09.09.2026) | KI-Plan erforderlich (siehe Abschnitt 11) | **ja** |
| Bilder und Objekte bearbeiten | Spiegeln, drehen, zuschneiden, ersetzen (auch durch KI-generiertes Bild), ausrichten, Stapelreihenfolge. „Edit image“ öffnet den Adobe-Express-Editor. | D/edit-documents/edit-images-or-objects/modify-image.html (05.12.2025) | nein | einfache Bearbeitung: nein; Express-Bearbeitung: **ja** |
| Bildbearbeitung und KI-Bilder über Adobe Express | Bilder in Express bearbeiten, Bilder aus Text generieren, Adobe-Stock-Vorschläge | D/edit-documents/enhance-pdfs-with-adobe-express/edit-images-express.html (N); …/get-ai-images.html (N) | nicht gekennzeichnet | **ja** (Adobe Express) |
| PDFs mit Express-Vorlagen gestalten, Deckblatt generieren | Wendet Express-Designvorlagen auf das PDF an (Aug. 2026). Erzeugt ein Deckblatt aus dem Dokumentinhalt (Juli 2026). | D/whats-new/whats-new-acrobat-desktop.html; D/edit-documents/enhance-pdfs-with-adobe-express/create-cover-pages.html (N) | nicht gekennzeichnet | **ja** |
| Seiten organisieren | Löschen, verschieben/kopieren, drehen, ersetzen, extrahieren, teilen, einfügen | D/edit-documents/organize-pages/… (N: delete, rotate, replace, extract); Teilen: D/edit-documents/organize-pages/split-pdfs.html (04.12.2025) | nein | nein |
| Seitenbeschriftungen (Page labels) | Eigene Seitennummerierung (römisch, Präfixe wie 1-1) für Navigation und Miniaturen | D/edit-documents/organize-pages/renumber-pages.html (05.12.2025) | nicht gekennzeichnet | nein |
| PDF teilen (Split) | Aufteilen nach Seitenzahl, Dateigröße oder Lesezeichen der obersten Ebene, auch für mehrere Dateien | D/edit-documents/organize-pages/split-pdfs.html | nicht gekennzeichnet | nein |
| Zuschneiden (Crop) | CropBox für alle Nutzer. **ArtBox, TrimBox und BleedBox nur in Acrobat Pro.** „Remove White Margins“. | D/edit-documents/organize-pages/crop-pages.html (27.05.2026) | Basis: nein; Seitenrahmen: **ja** | nein |
| Kopf- und Fußzeilen, Seitenzahlen | Text, Datum, Seitenzahlen. Einstellungen speicherbar, „Apply to Multiple Files“. | D/edit-documents/use-headers-and-footers/add-header-footer.html (05.12.2025); …/add-numbers.html (N) | nicht gekennzeichnet | nein |
| Wasserzeichen | Text oder Bild (PDF/JPEG/BMP), Deckkraft, Drehung, Position, Stapel über mehrere Dateien | D/edit-documents/add-backgrounds-and-watermarks/add-watermarks.html (21.01.2026) | nicht gekennzeichnet | nein |
| Hintergründe | Hintergrund hinzufügen, entfernen, aktualisieren | D/edit-documents/add-backgrounds-and-watermarks/add-background.html (N) | nicht gekennzeichnet | nein |
| **Bates-Nummerierung** | Eindeutige Kennung pro Seite (3–15 Ziffern, Präfix/Suffix) über Dateisätze. Nicht-PDFs werden vorher konvertiert. Geschützte Dateien werden nicht unterstützt. | D/edit-documents/apply-bates-numbering/add-bates.html („…in Acrobat Pro“, 23.09.2025) | **ja** | nein |
| Links | Links auf Webseiten oder Ziele anlegen, formatieren, verschieben | D/edit-documents/use-links-and-attachments/link-web-pages.html (N); …/link-destinations.html (N) | nicht gekennzeichnet | nein |
| Anhänge | Beliebige Dateien (Office, Audio, Video …) anhängen, mit Beschreibung | D/edit-documents/use-links-and-attachments/add-attachment.html (27.05.2026) | nicht gekennzeichnet | nein |
| Lesezeichen und Miniaturen | Seitenminiaturen zur Navigation und Seitenmanipulation, Lesezeichen anlegen und verwalten | U/page-thumbnails-bookmarks-pdfs.html (26.02.2026) | nicht gekennzeichnet | nein |
| Aktionen (PDF actions) | Aktionen an Elemente oder Seitenminiaturen binden | D/edit-documents/apply-pdf-actions/pdf-actions.html (N) | nicht gekennzeichnet | nein |
| Dokumenteigenschaften und Metadaten | Eigenschaften und XMP-Metadaten anzeigen und bearbeiten | D/edit-documents/edit-pdf-properties/pdf-properties.html (N) | nicht gekennzeichnet | nein |
| PDF-Erstellung | Aus Office-, Bild- und HTML-Dateien, Webseiten, Zwischenablage, leerer Seite, Druckertreiber, Distiller (PostScript) | D/create-documents/create-pdfs/… (N); Navigationsbaum der Desktop-Hilfe | nein | nein (Desktop); Online-Konvertierung im Web: ja |
| PDF-Portfolios | Mehrere Dateien in einem PDF-Container | U/reading-pdfs-reflow-accessibility-features.html (Navigation „Overview of PDF Portfolios“) | nicht gekennzeichnet | nein |

## 3. Scannen und OCR

| Feature | Was es tut | Beleg-URL | Pro-only? | Cloud-pflichtig? |
|---|---|---|---|---|
| Scannen vom Scanner („Create > Scanner“) | Scannereinstellungen (Duplex, Qualität), Ausgabe (neues PDF, anhängen, mehrere Dateien), OCR während des Scans, Metadaten, **„Make PDF/A-1b compliant“**. Unter Windows WIA-Scan-Taste. | D/create-documents/scan-documents-to-pdfs/scan.html (30.04.2026) | nicht gekennzeichnet | nein |
| Werkzeug „Scan & OCR“ / Text erkennen | OCR für eine Datei oder Stapel („In multiple files“) mit Seitenbereich und Sprache. Erzeugt eine durchsuchbare Textebene. | D/create-documents/scan-documents-to-pdfs/recognize-text.html (23.09.2025) | teilweise: Standard kann „Searchable Image“ und „Searchable Image and Text“, **nur Pro „Editable Text and Images“** | nein (lokal laut Doku) |
| OCR-Modi Standard vs. Pro | Adobe-KB: Standard unterstützt keine OCR-Variante „Editable Text and Images“ | https://helpx.adobe.com/acrobat/kb/is-ocr-or-text-recognition-available-in-acrobat-std-dc.html (24.05.2023, älter!) | siehe links | – |
| Erkannten Text korrigieren | „Correct recognized text“: Unsichere Wörter werden markiert und einzeln geprüft | D/create-documents/scan-documents-to-pdfs/fix-scanned-text.html (23.09.2025) | nicht gekennzeichnet | nein |
| Gescannte PDFs bearbeiten | Beim Öffnen von „Edit“ wird automatisch OCR angewendet und eine editierbare Kopie erzeugt. Neuer Text übernimmt die Originalschrift. | D/create-documents/scan-documents-to-pdfs/edit-scans.html (23.09.2025) | Plan-Seite: „Turn scans into editable PDFs“ als **Pro**-Mehrwert | nein |
| Gescannte PDFs verbessern („Enhance scanned file“) | Bildqualität, Filter, OCR in einem Schritt | D/create-documents/scan-documents-to-pdfs/enhance-scans.html (23.09.2025) | nicht gekennzeichnet | nein |
| Kamerabilder verbessern („Enhance camera image“) | Korrigiert Licht, Schatten, Schräglage und Hintergrund bei Handyfotos von Dokumenten | D/create-documents/scan-documents-to-pdfs/enhance-images.html (23.09.2025) | nicht gekennzeichnet | nein |
| Optimierung gescannter PDFs | „Scanned PDF settings“ und PDF Optimizer (siehe Abschnitt 8) | D/create-documents/scan-documents-to-pdfs/… (N „Scanned PDF settings“) | nicht gekennzeichnet | nein |
| OCR-Sprachen (Acrobat Web) | Liste u. a. EN, DA, NL, ES, FR, JA, RU, IT, ZH-Trad., NO, PT, FI, SV. **Deutsch ist in dieser Web-Liste nicht aufgeführt.** | W/share-review-and-export/export-and-print/ocr-supported-languages.html (01.04.2026) | – | ja (Web) |
| **Adobe Scan** (Mobile-App) | Kostenlose Scan-App mit Kantenerkennung, Bereinigung, OCR, Visitenkarten und Whiteboards. Scans werden in der Adobe Document Cloud gespeichert. iOS 15+, Android 8.0+. | https://www.adobe.com/acrobat/mobile/scanner-app.html | nein (kostenlos) | **ja** (Speicherung in Document Cloud) |
| KI in Adobe Scan | AI Assistant und Generative Summary in Adobe Scan (Android) | D/use-acrobat-ai/get-started-with-generative-ai/acrobat-ai-overview.html (31.08.2026) | KI-Plan | ja |

## 4. Kommentieren und Review

| Feature | Was es tut | Beleg-URL | Pro-only? | Cloud-pflichtig? |
|---|---|---|---|---|
| Kommentare an Text oder Bild | Über die schwebende Werkzeugleiste „Add a comment“ | D/share-and-review-documents/review-documents/add-comments.html (31.08.2026) | nein (Reader: „View, print, share, and comment“) | nein |
| Notizen und Sprechblasen, Textfelder, Callouts | Haftnotizen, Chat-Bubbles, Textfeld- und Legenden-Kommentare | D/share-and-review-documents/review-documents/add-stickynotes-bubbles.html (N), …/add-textbox-comments.html (N), …/add-callouts.html (N) | nein | nein |
| Markierungen und Textänderungen | Hervorheben, Unter- und Durchstreichen, Text einfügen und ersetzen (Redlining), Farben ändern | D/share-and-review-documents/review-documents/add-markups.html (N), …/insert-text.html (N), …/replace-text.html (N) | nein | nein |
| Zeichnen | Formen, Linien, Freihand | D/share-and-review-documents/review-documents/add-shapes-drawings.html (N) | nein | nein |
| Stempel | Vordefinierte, eigene und dynamische Stempel (Datum/Zeit, Identität) | D/share-and-review-documents/use-stamps/add-modify-stamps.html (05.12.2025); …/create-custom-stamps.html (N); …/automate-date-time.html (N) | nicht gekennzeichnet | nein |
| Kommentare zu Videos | Kommentare an Videoinhalten | D/share-and-review-documents/review-documents/comments-to-video.html (N, Titel „…in Acrobat Pro“) | **ja** | nein |
| Kommentarverwaltung | Antworten, Reaktionen, Status (gelesen/erledigt), Suche, Rechtschreibprüfung, Gruppieren | D/share-and-review-documents/manage-reviews/… (N: reply, add-reactions, unread-resolve, find) | nein | Reaktionen/Status bei geteilten Dateien vermutlich Cloud – OFFENE FRAGE |
| Kommentare importieren/exportieren | Import aus PDF, **FDF** oder **XFDF**. Export als FDF oder XFDF. Export nach Word (Windows) oder AutoCAD **mit Acrobat Pro unter Windows**. | U/importing-exporting-comments.html (26.02.2026) | Word/AutoCAD-Export: **ja** | nein |
| **Zur Überprüfung teilen (Link)** | „Share“ erzeugt einen Link zum Ansehen und Kommentieren. Die Datei liegt im Adobe-Cloud-Speicher. Empfänger kommentieren im Browser ohne Anmeldung. Zugriffsstufen (jeder mit Link / Organisation / eingeladene Personen), Aufrufe nachverfolgen. | D/share-and-review-documents/share-documents/share-pdfs.html (05.12.2025) | nein | **ja** |
| Zugriffsanfragen verwalten | Eigentümer nimmt Zugriffsanfragen an oder lehnt sie ab | D/share-and-review-documents/share-documents/manage-access.html (23.09.2025) | nein | ja |
| Review-Tracking | Home > Adobe cloud storage > „Shared by you / by others“ mit Status und Prüferliste | D/share-and-review-documents/manage-reviews/track-reviews.html (23.09.2025) | nein | **ja** |
| Review über interne Server | Review über eigene Server (Netzwerkordner/SharePoint) statt Adobe-Cloud | D/share-and-review-documents/share-documents/via-internal-servers.html (N); U/host-shared-reviews-on-sharepoint-office-365-sites.html (laut Wayback-Liste vorhanden, nicht abgerufen) | nicht gekennzeichnet | nein (eigener Server) |
| Kommentieren für Reader-Nutzer freischalten | „Reader Extended PDF“ mit „Enable Commenting & Measuring“ | D/share-and-review-documents/share-documents/reader-users-commenting.html (N, „…in Acrobat Pro“); D/work-with-pdf-forms/create-forms/allow-form-saving.html | **ja** | nein |
| Review-Grenzen (Web) | Max. 1.000 Kommentare, 2.500 Zeichen pro Kommentar, 250 Prüfer, 50 MB Download | W/share-review-and-export/review-pdfs/review-pdf-limitations.html (11.12.2025) | – | ja |
| Dateien vergleichen | siehe Abschnitt 1 | U/compare-documents.html | **ja** | nein |
| KI-gestütztes Review (Web) | „AI-powered PDF review“ | W/share-review-and-export/review-pdfs/review-pdfs-with-ai.html (abgerufen, nicht ausgewertet) | KI-Plan | ja |

## 5. Formulare

| Feature | Was es tut | Beleg-URL | Pro-only? | Cloud-pflichtig? |
|---|---|---|---|---|
| **„Prepare a form“ mit automatischer Felderkennung** | Wandelt ein bestehendes Dokument oder einen Scan in ein Formular um. Acrobat erkennt statische Felder automatisch als Textfelder. Option „This document requires signatures“. | D/work-with-pdf-forms/create-forms/convert-to-forms.html (23.09.2025) | nein (Standard: „Create, fill out, sign, and send forms“) | nicht dokumentiert |
| Formular von leerer Seite | Leeres PDF, Formularkomponenten hinzufügen, Vorschau | D/work-with-pdf-forms/create-forms/create.html (23.09.2025) | nein | nein |
| Feldtypen und Feldeigenschaften | Textfeld, Kontrollkästchen, Optionsfeld, Liste, Dropdown, Schaltfläche, Bildfeld, Signaturfeld, **Barcode** (PDF417, QR, Data Matrix) mit Fehlerkorrektur | D/work-with-pdf-forms/customize-form-fields/field-properties.html (23.09.2025); D/work-with-pdf-forms/insert-barcodes/barcodes.html (N) | nicht gekennzeichnet | nein |
| Berechnungen | „Value is the“ (Summe, Produkt, Durchschnitt …), „Simplified field notation“, „Custom calculation script“ (JavaScript), Berechnungsreihenfolge | D/work-with-pdf-forms/customize-form-fields/set-calculation-fields.html (05.12.2025) | nicht gekennzeichnet | nein |
| JavaScript in Formularen und Dokumenten | „Use JavaScript“: Document JavaScripts, Editor, Document Actions, Debugger | U/add-debug-javascript.html (26.02.2026); U/applying-actions-scripts-pdfs.html (Snapshot fehlerhaft, HTTP 500) | nicht gekennzeichnet – OFFENE FRAGE | nein |
| Datensammlung | Rückläufer in eine Antwortdatei (PDF-Portfolio) übernehmen. Daten als **CSV oder XML** exportieren, Formulardaten importieren und exportieren (**FDF/XFDF/XML/TXT**), Datendateien zu Tabellen zusammenführen. | U/collecting-pdf-form-data.html (26.02.2026) | nicht gekennzeichnet | nein |
| Formularverteilung und Tracker | Formular per E-Mail oder internem Server verteilen. „Tracker“ zeigt Antworten, Erinnerungen, weitere Empfänger. | D/work-with-pdf-forms/share-forms/track-forms.html (23.09.2025); U/send-pdf-forms.html (laut Wayback-Liste) | nicht gekennzeichnet | nicht dokumentiert |
| Formular zum E-Signieren senden | Übergabe an Acrobat-Sign-Workflow | D/work-with-pdf-forms/share-forms/… (N „Send PDF forms for e-signature“) | nein | **ja** |
| **Reader Extended PDF** | Erlaubt Reader-Nutzern, Formulare auszufüllen und zu **speichern** sowie zu kommentieren und zu messen | D/work-with-pdf-forms/create-forms/allow-form-saving.html (23.09.2025) | **ja** („In Acrobat Pro …“) | nein |
| Automatisch ausfüllen | Autofill aus gespeicherten Angaben | D/work-with-pdf-forms/fill-sign-forms/auto-fill-forms.html (N) | nicht gekennzeichnet | OFFENE FRAGE |
| Ausfüllen und Unterschreiben (Fill & Sign) | Text, Häkchen und Kreuze, Signatur und Initialen in beliebige (auch flache) Formulare. Verbesserte Felderkennung (April 2026). | D/work-with-pdf-forms/fill-sign-forms/fill-sign.html (23.09.2025); What's New April 2026 | nein (auch Reader) | Signatur-Sync: ja |
| **Webformulare** (Acrobat Sign) | Online-Formulare mit E-Signatur, verwaltet in Acrobat Sign | W/e-sign-documents/work-with-webforms/create-web-forms.html (laut Wayback-Liste); Plan-Seite „Create web forms“ | **ja** (Plan-Seite: Pro-Mehrwert) | **ja** |
| XFA-Formulare | Dynamische XFA-Formulare (LiveCycle) sind in Acrobat nur eingeschränkt bearbeitbar | D/troubleshoot/pdf-viewing-editing-issues/cannot-edit-xfa-forms.html (N) | – | – |
| Formulare in Acrobat Pro 2024 / Zahlungen | Zahlungen über Braintree in Sign-Formularen | W/e-sign-documents/collect-online-payments/… (laut Wayback-Liste, nicht abgerufen) | OFFENE FRAGE | ja |

## 6. Signaturen

| Feature | Was es tut | Beleg-URL | Pro-only? | Cloud-pflichtig? |
|---|---|---|---|---|
| Fill & Sign / Signatur hinzufügen | Signatur tippen, zeichnen, als Bild oder per Handy-Foto. Wird im Adobe-Cloud-Speicher synchronisiert. | D/e-sign-documents/fill-sign-documents/add-esign.html (05.12.2025); D/e-sign-documents/learn-about-signatures/e-sign-overview.html (23.09.2025) | nein | Sync: **ja** |
| **E-Signaturen anfordern (Request e-signatures)** | Empfänger, Reihenfolge, Felder platzieren. Nutzt „Adobe Acrobat Sign cloud services“. Unterzeichner brauchen kein Abo. Unterstützt auch DOC(X), XLS(X), PPT(X), TXT, CSV, **HTML/HTM** und Bilder. | D/e-sign-documents/request-e-signatures/send-for-signing.html (30.07.2026); e-sign-overview.html | nein (Standard: „Collect e-signatures“) | **ja** |
| Massenversand (Send in bulk) | Unabhängige Vereinbarungen mit eigenem Audit-Bericht, bis 50 Empfänger, Weiterleitung zu Acrobat Sign | D/e-sign-documents/request-e-signatures/request-in-bulk.html (23.09.2025: „only available for … Acrobat Pro or Acrobat Pro for teams“) | **ja** | **ja** |
| Branding, Vorlagen | Logo und eigene URL in Vereinbarungen, wiederverwendbare Vorlagen | https://www.adobe.com/acrobat/plans.html; W/e-sign-documents/add-e-sign-branding/… (laut Wayback-Liste) | **ja** (Plan- und Produktseite) | ja |
| **Digitale Signatur mit Zertifikat** | „Use a certificate > Digitally sign“: Rechteck ziehen, Digital ID wählen, optional „Lock document after signing“ | D/e-sign-documents/fill-sign-documents/add-digital-sign.html (23.09.2025) | nicht gekennzeichnet | nein (lokal; Validierungslisten werden online geladen) |
| Digital IDs | Selbstsignierte IDs oder IDs von einer CA. Speicherort: Datei, Roaming-ID (Server), Gerät oder Token. | D/protect-documents/manage-digital-ids/digital-ids.html (04.12.2025); D/e-sign-documents/fill-sign-documents/set-roaming-id.html (N) | nicht gekennzeichnet | Roaming-ID: Server |
| **Zertifizieren** | Zertifizierungssignatur (sichtbar oder unsichtbar) als erste Signatur, legt erlaubte spätere Änderungen fest | D/e-sign-documents/manage-digital-signatures/certify-pdfs.html (23.09.2025) | nicht gekennzeichnet | nein |
| **Zeitstempel** | Zeitstempelserver konfigurieren (Import oder URL, ggf. Benutzer/Passwort). Dokument-Zeitstempel. Laut Adobe unterstützt das PAdES (ETSI 102 778). Ohne Server gilt die lokale Zeit. Zeitstempel später über LTV nachrüstbar. | D/e-sign-documents/fill-sign-documents/add-time-stamps.html (23.09.2025) | nicht gekennzeichnet | Zeitstempelserver: online |
| LTV/Verifikationsinformationen | Sperrinformationen einbetten (Long-Term Validation) | D/e-sign-documents/fill-sign-documents/add-verification.html (N); https://www.adobe.com/devnet-docs/acrobatetk/tools/DigSigDC/planning.html | nicht gekennzeichnet | Abruf von OCSP/CRL: online |
| Signaturen validieren | Signaturpanel > „Validate Signatures“, Zertifikatskette, Prüfung des Zeitstempels | D/e-sign-documents/manage-digital-signatures/validate-digital-sign.html (23.09.2025) | nein | Trust-Listen-Update online |
| **AATL** | Adobe Approved Trust List. CAs und TSPs, deren Zertifikate in Acrobat und Reader automatisch als vertrauenswürdig gelten. Acrobat und Reader laden die Liste regelmäßig von einem Adobe-Dienst. Die Mitgliederliste markiert „Cloud Signature Consortium TSP“. | https://helpx.adobe.com/acrobat/kb/approved-trust-list1.html (28.09.2026); https://helpx.adobe.com/acrobat/kb/trust-services.html (24.04.2026) | nein (auch Reader) | Download: **ja** |
| **EUTL** | „Adobe European Union Trust List“: reduzierte Fassung der Trusted Lists aller EU/EWR-Staaten, nur qualifizierte Dienste (Art. 3(16) eIDAS). Wird wie die AATL periodisch geladen. | https://helpx.adobe.com/acrobat/kb/trust-services.html; https://www.adobe.com/devnet-docs/acrobatetk/tools/DigSigDC/planning.html | nein | Download: **ja** |
| Standards | PAdES (ETSI 102 778 Teile 1–4, „especially LTV“), CAdES-detached, RFC 3161, ISO 32000-1 | https://www.adobe.com/devnet-docs/acrobatetk/tools/DigSigDC/standards.html; D/e-sign-documents/learn-about-signatures/digital-sign-overview.html („Compliance with ETSI, PAdES, and CAdES“) | – | – |
| **Cloud-Signatur / CSC** | Adobe führt das Cloud Signature Consortium (CSC). Cloud-Signaturen in **Acrobat Sign** mit QTSPs. Beispiel primesign (Graz, AT) mit QES über „primesign MOBILE“, Identifizierung u. a. über ID Austria oder Handy-Signatur. | https://www.adobe.com/acrobat/business/compliance/eidas.html; https://helpx.adobe.com/document-cloud/digital-identity/primesign.html (05.06.2023) | Acrobat-Sign-Funktion | **ja** |
| **eIDAS QES** | Acrobat Sign unterstützt SES, AdES und QES. In Europa werden qualifizierte Zeitstempel automatisch angefügt. Adobe betreibt einen EUTL-zertifizierten qualifizierten Zeitstempeldienst. | https://www.adobe.com/acrobat/business/compliance/eidas.html; W/e-sign-documents/fill-and-sign/types-of-signatures.html (01.04.2026) | Sign | **ja** |
| QES in **Acrobat Desktop** (lokal) | Signieren mit QES-Token oder Smartcard über „Signature Creation Device“ (PKCS#11) | Andeutung: D/e-sign-documents/learn-about-signatures/setup-certified-signing.html (Suchtreffer, nicht abgerufen) | – | OFFENE FRAGE (siehe Abschnitt 19) |

## 7. Sicherheit

| Feature | Was es tut | Beleg-URL | Pro-only? | Cloud-pflichtig? |
|---|---|---|---|---|
| Passwortschutz | Kennwort für Öffnen oder Bearbeiten. Erweitert: Verschlüsselung mit Passwort oder Zertifikat. | D/protect-documents/protect-with-passwords/add-passwords-to-pdfs.html (05.12.2025) | nein (Standard: „password-protect“) | nein |
| Berechtigungen | Drucken, Bearbeiten, Kopieren einschränken | D/protect-documents/protect-with-passwords/restrict-printing-editing-and-copying-pdfs.html (N) | nein | nein |
| **Schwärzen (Redact)** | Text oder Bilder markieren, „Apply“, optional gleichzeitig bereinigen. Suchen und schwärzen, Schwärzungscodes und Code-Sets, Erscheinungsbild. | D/protect-documents/redact-pdfs/redact.html (31.08.2026); …/redact-text.html (N); …/create-codes.html (N) | **ja** (Titel „…in Acrobat Pro“; Plan-Seite) | nein |
| Schwärzen per KI | AI Assistant schlägt zu schwärzende Inhalte vor (Aug. 2026) | D/whats-new/whats-new-acrobat-desktop.html | KI-Plan | **ja** |
| **Bereinigen (Sanitize)** | Entfernt verborgene Informationen (Metadaten, Kommentare, verborgene Ebenen, Skripte, eingebettete Inhalte), „Remove all“ oder „Selectively remove“ | D/protect-documents/redact-pdfs/sanitize.html (23.09.2025); …/redacting-sanitizing.html (23.09.2025) | **ja** | nein |
| Zertifikatsverschlüsselung | Nur benannte Empfänger öffnen das PDF, Rechte pro Empfängergruppe. Zertifikate aus Trusted Identities, Datei, LDAP oder Windows-Store. | D/protect-documents/encrypt-with-certificates/certificate-encrypt.html (05.12.2025) | nicht gekennzeichnet | nein |
| Sicherheitsrichtlinien | Passwort-, Zertifikats- und Anhang-Richtlinien; serverbasierte Richtlinien (Adobe Experience Manager); Widerruf | D/protect-documents/security-policies/security-policy.html (N); …/server-based-policies.html (N) | nicht gekennzeichnet | serverbasiert: ja (AEM) |
| **Microsoft Purview Information Protection (MPIP)** | Reader, Standard und Pro zeigen MPIP-geschützte PDFs an. **Acrobat Pro/Standard** (Desktop) setzen und bearbeiten Sensitivity Labels nativ. Inhaltsmarkierungen werden als Form XObject mit `/ADBE_MIP`-Dictionary gespeichert. | D/protect-documents/security-policies/mpip-support-acrobat.html (15.09.2026); …/mpip-content-markings-pdf.html (11.08.2026) | nein (Standard und Pro) | Microsoft-Dienst: ja |
| Protected View / Sandbox / Enhanced Security | Geschützte Ansicht, Sandbox, vertrauenswürdige Speicherorte | D/protect-documents/use-protected-view/protect-view-mode.html (N); D/protect-documents/enhanced-security/enable-security.html (N) | nein | nein |
| JavaScript-API-Zugriff einschränken, Links/Anhänge sperren | Sicherheitswarnungen, Blocklisten | D/protect-documents/mitigate-security-risks/restrict-javascript-api.html (N) | nein | nein |

## 8. Zusammenführen, Aufteilen, Optimieren, Export/Konvertierung

| Feature | Was es tut | Beleg-URL | Pro-only? | Cloud-pflichtig? |
|---|---|---|---|---|
| Dateien zusammenführen | PDF, Word, Excel, PowerPoint, Audio, Video, Web-Dateien zu einem PDF. Neu: Beim Kombinieren alternativ einen PDF Space anlegen. | D/edit-documents/combine-files/combine-files.html (20.01.2026); What's New | nein | nein (PDF-Space-Option: ja) |
| Aufteilen | siehe Abschnitt 2 | D/edit-documents/organize-pages/split-pdfs.html | nein | nein |
| Größe reduzieren | „Save as Other > Reduced size PDF“, auch für mehrere Dateien | D/create-documents/optimize-pdfs/reduce-file-size.html (23.09.2025) | nicht gekennzeichnet | nein |
| **PDF Optimizer** | „Save as Other > Optimized PDF“ mit Panels Images, Fonts, Transparency, Discard Objects, Discard User Data, Clean Up (inkl. Fast Web View), Kompatibilität. Speicherplatz-Audit. | D/create-documents/optimize-pdfs/advance-size-reduction.html (23.09.2025, Seitentitel „PDF compatibility settings in Acrobat Pro“); …/audit-space.html (N) | **ja** (laut Seitentitel) | nein |
| Komprimieren (Web) | Grenze 2 GB | W/manage-cloud-storage/manage-adobe-cloud-files/file-size-storage-limitations.html (10.12.2024) | – | ja |
| Export nach Word, Excel (XLSX/XML), PowerPoint, RTF, Text | „Convert“-Werkzeug | D/save-export-documents/convert-to-other-formats/pdf-to-word.html, …/pdf-to-excel.html, …/pdf-to-ppt.html, …/pdf-to-text.html (alle N) | nein (Standard: „convert, export“) | Desktop: nicht dokumentiert – OFFENE FRAGE |
| Export als Bild | JPEG, JPEG 2000, PNG, TIFF. Alternativ nur eingebettete Rasterbilder exportieren („Export all Images“, keine Vektoren). | D/save-export-documents/convert-to-other-formats/pdfs-to-image-formats.html (23.09.2025); U/exporting-pdfs-file-formats.html (26.02.2026) | nein | nein |
| **Export als HTML** | „Convert > Other format > HTML“. Optionen: **Single HTML Page** (optional mit Navigations-Frame nach Überschriften oder Lesezeichen) oder **Multiple HTML Pages** (Aufteilung nach Überschriften oder Lesezeichen), „Include Images“, „Detect and Remove Headers and Footers“, OCR bei Bedarf mit Sprachwahl. Qualität: siehe Abschnitt 16. | D/save-export-documents/convert-to-other-formats/pdf-to-html.html (23.09.2025); Detailoptionen: U/file-format-options-pdf-export.html (Snapshot 12.01.2025, Last updated 21.11.2024) | nicht gekennzeichnet | nicht dokumentiert |
| Barrierefreier Text | „Export a PDF > Text (Accessible)“ für Braille-Übersetzer | U/reading-pdfs-reflow-accessibility-features.html | nein | nein |
| **PDF/A, PDF/X, PDF/E** (Konvertieren und Prüfen) | Speichern als PDF/A, PDF/X oder PDF/E über „Apply PDF standards“ oder Preflight-Profil („Analyze And Fix“). Prüfung gegen PDF/X, PDF/A, **PDF/VT**, PDF/E. Standards-Assistent. Bei Bedarf ICC-Ausgabeprofil einbetten. | U/pdf-x-pdf-a-pdf.html („…(Adobe Acrobat Pro)“, 26.02.2026) | **ja** | nein |
| Druckfertiges PDF (PDF/X) | „Save as other > Press-ready PDF (PDF/X)“, Empfehlung PDF/X-4 | D/print-documents/set-up-and-print-pdfs/print-ready.html (07.06.2026) | **ja** | nein |
| Distiller und Watched Folders | PostScript zu PDF; überwachte Ordner mit eigenen .joboptions | D/create-documents/explore-advanced-conversion-settings/set-watched-folders.html („…in Acrobat Pro“, 21.11.2025) | **ja** (Watched Folders) | nein |
| Übersetzen | „Convert > Translate this PDF“ öffnet **Adobe Express**: Zielsprachen, Tonalität, Ergebnis als PDF herunterladen. Wird ggf. übersprungen bei gescannten, gesicherten, großen oder komplexen PDFs. | U/translate-pdf.html (07.08.2026) | nicht gekennzeichnet | **ja** |

## 9. Barrierefreiheit

| Feature | Was es tut | Beleg-URL | Pro-only? | Cloud-pflichtig? |
|---|---|---|---|---|
| „Prepare for accessibility“ (geführte Aktion) | Automatisiert viele Schritte, prüft und gibt Anleitungen für manuelle Korrekturen. Nicht für XFA-Formulare und Portfolios. | U/create-verify-pdf-accessibility.html („…Acrobat Pro“, 26.02.2026) | **ja** | nein |
| **Autotag (automatisch taggen), Cloud-Variante** | „Prepare for accessibility > Autotag document“. Opt-in für **cloudbasiertes Auto-Tagging**: Überschriftenebenen, Tabellen (auch ohne Rahmen), verschachtelte Listen, mehrspaltige Lesereihenfolge. „doesn't save your PDF on the cloud“. Nicht geeignete Dateien werden lokal getaggt. Per Präferenz abschaltbar. | U/cloud-auto-tagging-accessibility-pdfs.html (26.02.2026) | **ja** (Werkzeug Pro) | **ja** (optional, Fallback lokal) |
| Formularfelder automatisch taggen | „Automatically tag form fields“ | U/creating-accessible-pdfs.html (26.02.2026) | **ja** | nein |
| **Accessibility Check** (früher „Full Check“) | Prüft gegen Standards „such as PDF/UA and WCAG 2.0“. Seit Mai 2020 heißt „Full Check“ „Accessibility Check“. | U/create-verify-pdf-accessibility.html; U/creating-accessible-pdfs.html | **ja** | nein |
| Accessibility Report | Zusammenfassung der Prüfergebnisse mit Links zu Korrekturwerkzeugen | U/create-verify-pdf-accessibility.html | **ja** | nein |
| **Reading Order Tool** | Lesereihenfolge visuell prüfen und korrigieren, Formularfelder taggen, Alternativtexte, einfache Tabellen, Artefakte. Gedacht für in Acrobat getaggte PDFs. Undo wird nicht für alle Operationen unterstützt. | U/touch-reading-order-tool-pdfs.html („…(Adobe Acrobat Pro)“, 26.02.2026) | **ja** | nein |
| Tags- und Content-Panel | Strukturbaum und Inhaltsobjekte direkt bearbeiten (komplexe Tabellen, Reflow-Probleme) | U/editing-document-structure-content-tags.html (26.02.2026) | **ja** | nein |
| **PDF/UA-Validierung via Preflight** | Preflight zeigt u. a., ob eine Datei als PDF/X, PDF/A, PDF/VT, **PDF/UA** oder PDF/E verifiziert ist. Ob es ein eigenes PDF/UA-Prüfprofil gibt, sagen die abgerufenen Seiten nicht wörtlich. | U/analyzing-documents-preflight-tool-acrobat.html (24.05.2023); U/pdf-x-pdf-a-pdf.html | **ja** | nein |
| Accessibility Setup Assistant und Lese-Präferenzen | Lesereihenfolge-Ableitung, Seiten- oder Dokument-Lieferung an Screenreader, Tab-Reihenfolge nach Struktur | U/reading-pdfs-reflow-accessibility-features.html | nein | nein |
| MathML in LaTeX-getaggten PDFs | NVDA liest MathML aus LaTeX-getaggten PDFs (Juni 2026) | U/accessibility-features-pdfs.html#mathML (Snapshot 01.10.2026); What's New | nein | nein |

## 10. Zusammenarbeit und Cloud

| Feature | Was es tut | Beleg-URL | Pro-only? | Cloud-pflichtig? |
|---|---|---|---|---|
| Teilen per Link, Ansehen und Kommentieren | siehe Abschnitt 4 | D/share-and-review-documents/share-documents/share-pdfs.html | nein | **ja** |
| Adobe-Cloud-Speicher | 5 GB kostenlos, **100 GB** mit Acrobat-Pro-Abo (Plan-Seite: alle Abos 100 GB). Läuft auf AWS mit Rechenzentren Dublin (EU), Tokio, Virginia. Speicherort nach Region. | W/manage-cloud-storage/manage-adobe-cloud-files/file-size-storage-limitations.html; W/manage-cloud-storage/manage-adobe-cloud-files/cloud-storage-data-centers.html (10.10.2025) | – | ja |
| Drittspeicher | Box, Dropbox, OneDrive, SharePoint, Google Drive | Navigationsbaum „Working with online storage accounts“ (U/reading-pdfs-…) | nein | ja |
| **PDF Spaces** | KI-Arbeitsbereich mit bis zu **100 Dateien** (PDF, DOCX, PPTX, XLSX, TXT, RTF, VTT), Text, Web-Links, Google Drive/OneDrive (Dropbox/Box nur Desktop). Pro Datei max. 100 MB und 600 Seiten. Nicht unterstützt: passwortgeschützte Dateien, Videos, komplexe Vektorgrafiken, Handschrift. Notizen, KI-Assistent, Zitate. | D/explore-pdf-spaces/supported-formats-limitations.html (21.09.2026); D/explore-pdf-spaces/pdf-spaces-faq.html (06.05.2026) | Studio, Express oder KI-Add-on | **ja** |
| PDF Spaces teilen („guided experience“) | Overview, komplette Dateiliste oder einzelne Datei teilen. Zugriff: jeder mit Link / Organisation / Eingeladene. Rechte: ansehen, kommentieren, hinzufügen/entfernen. Laut Adobe-Pressemitteilung können geteilte Spaces ohne Konto angesehen werden. | D/explore-pdf-spaces/share-pdf-spaces.html (18.09.2026); https://news.adobe.com/news/2026/05/adobes-new-productivity-agent | s. o. | **ja** |
| Engagement-Tracking in PDF Spaces | Eigentümer sehen, wann Empfänger den Space öffnen. Kommentare. | D/whats-new/whats-new-acrobat-desktop.html (April 2026) | s. o. | ja |
| PDF Spaces anpassen | Overview arrangieren, generierte Texte und Audio-Zusammenfassungen editieren, Themes, Thumbnails, Branding | What's New Juni/Aug. 2026; W/explore-pdf-spaces/share-as-experience.html (Link aus What's New) | s. o. | ja |
| PDF Space aus Word erstellen (Windows), SharePoint-Anbindung | Word-Dokument direkt in einen Space; Ordner aus Adobe Cloud; SharePoint | What's New („Previous releases“) | s. o. | ja |
| Integrationen | Acrobat für ChatGPT (Mergen, Komprimieren, Datenextraktion aus Scans im Chat), Copilot, Microsoft Teams, SharePoint/OneDrive, Outlook, WhatsApp, Power Automate (PDF Services Connector) | W/use-acrobat-extensions/acrobat-for-chatgpt/pdf-tasks-in-chatgpt.html (05.08.2026); W/use-acrobat-extensions/… (laut Wayback-Liste) | nein | **ja** |
| „Analyzer in Acrobat“ / Collections | Sammlungen von Dokumenten mit Vergleichsfunktion und Service-Limits; Doku nur fragmentarisch | W/analyzer-in-acrobat/user-guide/collections/collections-overview.html (24.08.2026) | OFFENE FRAGE | ja |

## 11. KI-Funktionen

| Feature | Was es tut | Beleg-URL | Pro-only? | Cloud-pflichtig? |
|---|---|---|---|---|
| **AI Assistant** (Q&A) | Fragen zum Dokument mit Zitaten und Quellen-Links, Folgefragen, Umschreiben. Über mehrere Dokumente hinweg. Inklusive Webseiten (nur englisch, Edge/Chrome). | D/use-acrobat-ai/get-started-with-generative-ai/acrobat-ai-overview.html (31.08.2026); D/use-acrobat-ai/generative-ai-features/ai-get-answers.html (N) | **nicht in Pro enthalten**: Studio, Express, AI-Assistant-Add-on; Gratis-Nutzer bekommen eine begrenzte Zahl Requests | **ja** („involves cloud processing of documents“) |
| **Generative Summary** | Überblick, abschnittsweise Zusammenfassungen, Schlüsselaussagen, Quellen-Links. Fortlaufende Generierung bei langen PDFs. Overview-Banner mit 60–70 Wörtern bei Dateien über 3 Seiten. | D/use-acrobat-ai/get-started-with-generative-ai/generative-summary-overview.html (07.06.2026); What's New | wie oben | ja |
| Fragen über mehrere Dokumente | In PDF Spaces über bis zu 100 Dateien | D/explore-pdf-spaces/pdf-spaces-faq.html | wie oben | ja |
| Personalisierte Assistenten / Rollen | Vordefiniert: AI Assistant, Analyst, Entertainer, Instructor, dazu „Create your own“. Diagramme aus Dokumentdaten. | D/explore-pdf-spaces/custom-ai-insights.html (03.04.2026) | wie oben | ja |
| **Podcast generieren** | „Listen to this document“ in den Formaten „Highlights“ oder „Deep dive“. Transkript, Tempo, Mini-Player, QR-Code fürs Handy. Auch für PDF Spaces. | D/use-acrobat-ai/podcasts/create.html (08.04.2026); D/use-acrobat-ai/podcasts/about-podcasts.html (N) | wie oben | ja |
| **Präsentation generieren** (Adobe Express) | Aus Prompt, Dateien oder PDF Space. Folienanzahl und Zielgruppe einstellbar, Vorlagen, Brand-Kits, Export als PPT oder PDF. Sprachen: EN, FR, DE, ES, PT, IT, JA (KO laut Tabelle der Tech-Requirements). Laut What's New zeitweise für alle Acrobat-Nutzer inkl. Reader, Enterprise nur mit AI-Add-on. | W/create-pdfs/create-presentations/generate-presentations.html (09.09.2026); D/use-acrobat-ai/get-started-with-generative-ai/ai-tech-requirements.html (01.09.2026) | widersprüchlich, siehe Abschnitt 19 | **ja** |
| Interaktiver Bericht | KI erzeugt aus langen Dokumenten einen interaktiven visuellen Bericht mit Navigation, Diagrammen und Bildern. Studio, AI Assistant Plus oder Acrobat Express. | W/use-acrobat-ai/read-pdfs/interactive-reports.html (12.09.2026) | KI-Plan | ja |
| PDF per Chat bearbeiten („smart actions“) | Mehrstufige Werkzeug-Abläufe per Sprache (z. B. „komprimieren und teilen“, Wasserzeichen auf Preisseiten), Seiten umstellen nach Inhalt | D/use-acrobat-ai/get-started-with-smart-actions/edit-pdfs-via-chat-overview.html (09.09.2026) | KI-Plan; Plan-Seite: „Ask AI to edit, convert, or compress PDFs“ als Studio-Funktion | ja |
| Übersetzung | via Adobe Express (Abschnitt 8). Reader fragt bei abweichender Sprache nach (Juni 2026). | U/translate-pdf.html | nicht gekennzeichnet | ja |
| Meeting-Transkripte zusammenfassen | Teams- und Zoom-Transkripte | D/use-acrobat-ai/generative-ai-features/summarize-meeting-transcripts.html (N); acrobat-ai-overview.html | KI-Plan | ja |
| KI-Bilder, Deckblatt, Express-Styling | siehe Abschnitt 2 | – | – | ja |
| Vorgeschlagene Hervorhebungen | KI hebt Kerninhalte anhand des Leseverhaltens hervor | What's New (Previous releases) | KI-Plan | ja |
| **Contract Intelligence** | Erkennt Verträge (auch Scans), Vertragsübersicht, Schlüsselbegriffe (Gebühren, Fristen, Strafen) mit Zitaten, Vergleich von **bis zu 10 Verträgen**. Angekündigt am 04.02.2025, damals Add-on **US$4.99/Monat**, Desktop, Web und Mobile, „worldwide English“. | https://news.adobe.com/news/2025/02/acrobat-ai-assistant-contracts (über Suchergebnis; Seite selbst nicht abgerufen) | KI-Add-on | ja |
| Productivity Agent | 06.05.2026: agentische Oberfläche, die Präsentationen, Podcasts, Blogs und Social Posts erzeugt, konversationelles Bearbeiten und Publizieren über PDF Spaces. Verfügbar in **Acrobat Express** (neues Angebot) und Acrobat Studio. | https://news.adobe.com/news/2026/05/adobes-new-productivity-agent | Express/Studio | ja |
| Prompt Bar (Studio Home) | Werkzeuge, Dateien, Bildgenerierung, Vorlagen und KI-Antworten aus einer Eingabezeile | D/get-started/learn-the-basics/prompt-bar-studio.html (N); What's New | Studio | ja |

**Datei- und Sprachgrenzen (AI Assistant):** < 100 MB, ≤ 600 Seiten, keine passwortgeschützten Dateien oder Portfolios. Prompts < 500 Zeichen, Textauswahl < 8.000 Zeichen auf einer Seite, keine Bilder oder komplexen Vektorgrafiken. Dateisprachen: EN, FR, DE, ES, IT, PT-BR, JA, KO, DA, NO, FI, SV, NL. Quelle: D/use-acrobat-ai/get-started-with-generative-ai/ai-tech-requirements.html (01.09.2026).

**Kontingente:** Individual und Teams mit AI Assistant: **1.000 Requests pro Monat und Nutzer**, danach Drosselung möglich. Enterprise: „full access … subject to throttling“. Adobe behält sich vor, künftig Generative Credits zu verrechnen. Quelle: D/use-acrobat-ai/understand-usage-policies/ai-usage-policy-limitations.html (15.04.2026).

**Datenschutz-Aussagen (Adobe):**
- „Adobe does not train any LLMs on your content concurrent to your interactions …“; „Your content will not be used to train any LLMs that deliver Acrobat's generative AI capability.“
- „We have currently integrated the Microsoft Azure OpenAI Service with our proprietary technologies …“
- Verarbeitete Daten werden „temporarily cached for up to 12 hours“. Inhalte werden „split and encrypted before being sent to Microsoft Azure OpenAI“. Dokumente werden nicht in Azure OpenAI gespeichert.
- **Regional Data Center Pinning** für Enterprise-Kunden in EU und US.
- Manuelle Sichtung nur bei gemeldeten Inhalten oder freiwillig geteiltem Feedback. Gemeldete Inhalte werden 30 Tage aufbewahrt. Feedback-Inhalte werden per Named Entity Recognition maskiert.
- Quellen: D/use-acrobat-ai/understand-usage-policies/content-usage-handling.html (24.09.2025); W/manage-cloud-storage/manage-adobe-cloud-files/cloud-storage-data-centers.html (10.10.2025).
- Adobe-Marketing: „never used to train Adobe's AI models“ (https://www.adobe.com/acrobat/generative-ai-pdf.html).

**Regionale Sperren:** u. a. Belarus, China, Kuba, Iran, Nordkorea, Russland, Syrien, Krim, DPR/LPR (D/explore-pdf-spaces/pdf-spaces-faq.html).

## 12. Automatisierung

| Feature | Was es tut | Beleg-URL | Pro-only? | Cloud-pflichtig? |
|---|---|---|---|---|
| **Action Wizard / „Use guided actions“** | Gespeicherte Befehlsfolgen auf ein oder viele Dokumente bzw. Ordner. Vordefinierte und eigene Aktionen, Import/Export. Ersetzt den früheren Batch-Modus; Acrobat-XI-Batch-Skripte sind meist importierbar. | U/action-wizard-acrobat-pro.html („Adobe Acrobat Pro Action Wizard“, 26.02.2026) | **ja** | nein |
| Stapelverarbeitung in Einzelwerkzeugen | „Apply to Multiple Files“ bei Wasserzeichen, Kopf-/Fußzeile, Reduce Size, OCR „In multiple files“, Split „multiple files“ | jeweilige Seiten in Abschnitt 2, 3, 8 | nicht gekennzeichnet | nein |
| Preflight-Droplets und Preflight-Aktionen | Kleine Programme oder Aktionen, die Preflight auf hineingezogene Dateien anwenden, Erfolg und Fehler trennen, Berichte erzeugen | U/automating-document-analysis-droplets-or.html (26.02.2026) | **ja** | nein |
| Watched Folders (Distiller) | Automatische PS-zu-PDF-Konvertierung | D/create-documents/explore-advanced-conversion-settings/set-watched-folders.html | **ja** | nein |
| JavaScript-Debugger und -Konsole | Debugger mit Breakpoints und Variablen (Präferenz „Enable JavaScript debugger“). Document JavaScripts, Editor, Document Actions. Konsole für interaktive Ausführung. | U/add-debug-javascript.html (26.02.2026); https://opensource.adobe.com/dc-acrobat-sdk-docs/library/jsdevguide/JS_Dev_Tools.html | nicht gekennzeichnet | nein |
| **Acrobat SDK** | JavaScript, Plug-ins (C/C++), IAC (DDE, OLE, Apple Events, AppleScript), PDF Library. SDK 2021 mit Windows-64-Bit-Unterstützung. | https://opensource.adobe.com/dc-acrobat-sdk-docs/acrobatsdk; JS-Referenz: https://opensource.adobe.com/dc-acrobat-sdk-docs/library/jsapiref/ | – | nein |
| **PDF Services API** (Cloud) | REST-Operationen: Create (u. a. **aus HTML**), Export (Office/Bild), Combine, OCR, Compress, Protect, Remove Password, Linearize, Split, Seiten einfügen/ersetzen/löschen/drehen/umordnen, Properties, **Accessibility Auto-Tag** (10 Transaktionen pro Seite), **Accessibility Checker**, Electronic Seal, Document Generation, Extract/PDF→Markdown, Watermark, Formulardaten Import/Export. Free Tier: 500 Transaktionen pro Monat. **Kein HTML-Export** in der Operationsliste. | https://developer.adobe.com/document-services/docs/overview/pdf-services-api/dcserviceslicensing/; https://developer.adobe.com/document-services/apis/pdf-accessibility-auto-tag/ | eigenes Produkt | **ja** |
| Power Automate / Power Apps Connector | Adobe PDF Services Connector | W/use-acrobat-extensions/adobe-pdf-services-connector/… (laut Wayback-Liste) | eigenes Produkt | ja |

## 13. Druckvorstufe und Produktion

Alle Werkzeuge liegen unter „All tools > Use print production“. Die helpx-Seiten tragen durchgehend den Zusatz **„(Acrobat Pro)“**. Quelle der Übersicht: U/print-production-tools-overview-acrobat.html (26.02.2026).

| Feature | Was es tut | Beleg-URL | Pro-only? | Cloud-pflichtig? |
|---|---|---|---|---|
| Output Preview | Separationsvorschau, Soft-Proof, Farbwarnungen, Simulationsprofile, Zugang zum Ink Manager und Object Inspector | U/previewing-output-acrobat-pro.html (26.02.2026) | **ja** | nein |
| Overprint Preview | „Simulate Overprinting“ im Output-Preview-Dialog | D/print-documents/color-print-quality/preview-overprint.html (07.06.2026) | **ja** | nein |
| Preflight | „more than 400 predefined checks“ und Fixups. Profile, Bibliotheken, Variablen, Berichte, PDF-Syntax-Prüfung, Standardkonformität | U/print-production-tools-overview-acrobat.html; U/analyzing-documents-preflight-tool-acrobat.html | **ja** | nein |
| Convert Colors | Farbräume in einen Ziel-Farbraum konvertieren | U/color-conversion-ink-management-acrobat.html (26.02.2026) | **ja** | nein |
| Ink Manager | Behandlung von Druckfarben (Spot-Farben umleiten) für Vorschau und Druck | ebd. | **ja** | nein |
| Trap Presets | Trapping-Einstellungen für Adobe-RIPs mit In-RIP-Trapping | U/trapping-color-acrobat-pro.html (26.02.2026); D/print-documents/color-print-quality/specify-trapping.html (N) | **ja** | nein |
| Fix Hairlines | Haarlinien durch dickere Linien ersetzen | U/print-production-tools-overview-acrobat.html; U/printer-marks-hairlines-acrobat-pro.html (30.10.2023) | **ja** | nein |
| Add Printer Marks | Schneide-, Passer- und Farbkontrollmarken dauerhaft (optional als Ebene) einbetten | U/printer-marks-hairlines-acrobat-pro.html | **ja** | nein |
| Flattener Preview / Transparenzreduzierung | Reduzierungsvorgaben mit Vorschau. Nicht rückgängig zu machen. | U/transparency-flattening-acrobat-pro.html (26.02.2026) | **ja** | nein |
| Set Page Boxes, Edit Object, Add Article Box | Seitenrahmen, Objektbearbeitung (Farbraum, Rendering Intent), Artikelrahmen | U/print-production-tools-overview-acrobat.html | **ja** | nein |
| Output Intents | Zielgerät-Profil (z. B. für PDF/X) | U/output-intents-pdfs-acrobat-pro.html (26.02.2026) | **ja** | nein |
| Farbseparationen und Composite-Druck | Separationen drucken, Farbmanagement beim Druck | D/print-documents/color-print-quality/print-color-separations.html (N); …/print-color-composite.html (N) | **ja** | nein |

---

## 14. Abgrenzung Reader / Standard / Pro / Studio / Express

**Laut Adobe-Plan- und Vergleichsseiten (abgerufen 11.10.2026):**

| Plan | Was Adobe hervorhebt | Quelle |
|---|---|---|
| Reader (kostenlos) | Ansehen, Drucken, Teilen, Kommentieren | https://www.adobe.com/acrobat/pricing/compare-versions.html |
| **Standard** | „Create, edit, convert, export, and organize PDFs“, „Collect e-signatures and track responses“, „Fill, sign, and password-protect PDFs“ | https://www.adobe.com/acrobat/plans.html |
| **Pro** | Alles aus Standard, dazu: „Compare versions of a PDF“, „Redact sensitive information“, „Turn scans into editable PDFs“, „Create web forms“, Bulk-Signaturen, Branding und Vorlagen in Sign, „70+ advanced PDF tools“. Laut Vergleichsseite außerdem „AI editing, conversion, compression“ (Zeile „Ask AI to edit, convert, or compress PDFs“ bei Pro abgehakt; die Plan-Seite listet es dagegen unter Studio, siehe Abschnitt 19). | plans.html; compare-versions.html; https://www.adobe.com/acrobat/acrobat-pro.html |
| **Studio** | Alles aus Pro, dazu AI Assistant, PDF Spaces, Content-Erstellung (Präsentationen, Flyer, Social), **Adobe Express Premium**. Gestartet am **19.08.2025**. | plans.html; https://news.adobe.com/news/2025/08/acrobat-studio-delivers-new-ai-powered-home-for-productivity-creativity |
| **Acrobat Express** (neu 2026) | „AI-powered document insights, premium content generation and information sharing“. PDF Spaces und KI, laut Pressemitteilung aber ohne die „AI PDF tools“ aus Studio. | https://news.adobe.com/news/2026/05/adobes-new-productivity-agent; https://www.adobe.com/acrobat/generative-ai-pdf.html |
| AI Assistant Plus | Paket aus AI Assistant, PDF Spaces und Adobe Express | D/use-acrobat-ai/ai-assistant-plus-acrobat.html (18.08.2026) |
| Acrobat Pro 2024 | 3-Jahres-Termlizenz, nur Desktop, Einmalkauf, „does not include ongoing … feature enhancements“ und keine Document-Cloud-Dienste über Web oder Mobile. Acrobat 2020 ist seit 30.11.2025 End of Support. | https://helpx.adobe.com/acrobat/kb/acrobat-perpetual-eos.html (05.01.2026) |

**Pro-only laut helpx-Titeln (Auswahl):** Compare Files, Bates-Nummerierung, Redact und Sanitize, PDF Optimizer, Preflight, PDF/A-/X-/E-Konvertierung, Print-Production-Tools, Accessibility (Prepare/Check/Report/Reading Order/Tags), Action Wizard, Watched Folders, Reader Extended PDF, Kommentare zu Videos, Kommentar-Export nach Word/AutoCAD, Send in bulk, erweiterte Seitenrahmen beim Zuschneiden, 3D-Modelle hinzufügen, OCR-Modus „Editable Text and Images“.

## 15. Preise

**USA (adobe.com/acrobat/plans.html, abgerufen 11.10.2026), Individual:**

| Plan | Jahresabo, monatlich | Jahresabo, vorausbezahlt | Monatsabo |
|---|---|---|---|
| Standard | US$14.99 | US$179.88 | US$24.99 |
| Pro | US$19.99 | US$239.88 | US$29.99 |
| Studio | US$24.99 | US$299.88 | US$34.99 |

Teams (pro Lizenz, Jahresabo monatlich): Standard US$16.99, Pro US$23.99, Studio US$29.99. Studio Teams zum Launch ebenfalls US$29.99 (news.adobe.com, 19.08.2025). Acrobat Express: US$9.99 bzw. US$10.99/Monat, US$109.99/Jahr (generative-ai-pdf.html, über WebFetch-Zusammenfassung). AI-Assistant-Add-on: plans.html nennt wörtlich „Add AI Assistant to your Acrobat plan for US$1.99/mo“ bzw. „US$19.99/yr“. Die Contract-Pressemitteilung vom Feb. 2025 nannte US$4.99/Monat. **Widerspruch, siehe Abschnitt 19.**

**Österreich (EUR, inkl. 20 % USt.)**, abgefragt am 11.10.2026 über `https://www.adobe.com/web_commerce_artifact?offer_selector_ids=<OSI>&country=AT&locale=de_AT&…`. Die OSI-Kennungen stammen aus Adobes Preis-Fragmenten „DC Plans: Acrobat Individuals ABM / PUF / M2M“ (odin.adobe.com):

| Plan (Produktcode) | Jahresabo, monatlich (ABM) | Jahresabo, vorausbezahlt (PUF) | Monatsabo (M2M) |
|---|---|---|---|
| Standard (ACRO) | **€18,14**/Monat (netto €15,12) | **€214,78**/Jahr (netto €178,98) | **€30,24** (netto €25,20) |
| Pro (APCC) | **€23,99**/Monat (netto €19,99) | **€286,42**/Jahr (netto €238,68) | **€35,99** (netto €29,99) |
| Studio (PA-1806) | **€30,24**/Monat (netto €25,20) | **€359,99**/Jahr (netto €299,99) | **€42,34** (netto €35,28) |

Vorbehalt: Das sind die Werte des Preisdienstes, nicht ein Screenshot der gerenderten AT-Seite. Die Seite www.adobe.com/at/acrobat/pricing.html liefert die Preise nur per JavaScript. Aktionspreise sind nicht ausgeschlossen. AT-Teams-Preise und das AT-AI-Add-on wurden nicht abgefragt (OFFENE FRAGE).

## 16. Plattformen

| Plattform | Belegter Stand | Quelle |
|---|---|---|
| Windows | Windows 11/10 (64-bit, 10 ab v1809), Windows Server 2016/2019/2022. 2 GB RAM, 4,5 GB Speicher. Seit Jan. 2023 keine 32-Bit-OS. | D/get-started/learn-the-basics/tech-requirements.html (16.06.2026) |
| macOS | macOS 13, 14, 15, 26 (Tahoe), Intel und Apple Silicon M1–M4, 2,75 GB | ebd. |
| Web (Acrobat on the web) | Edge, Firefox und Chrome unter Win 10/11; Safari 15.2+, Firefox und Chrome ab macOS 11.7.10; mobil Safari (iOS) und Chrome (Android). AES-256 und TLS 1.2. | W/get-set-up/learn-the-basics/technical-requirements.html (10.09.2025); W/get-set-up/learn-the-basics/overview.html (01.04.2026) |
| iOS / Android | Acrobat mobile (Liquid Mode: iOS 14+, Android 5.0+, ≥ 1 GB RAM, kein x86, Chromebooks). Adobe Scan: iOS 15+, Android 8.0+. | https://helpx.adobe.com/acrobat/mobile/get-started/technical-requirements.html (01.06.2026); scanner-app.html |
| Browser-Erweiterungen | Acrobat-Erweiterung für Chrome und Edge (auch mit KI-Funktionen) | D/use-acrobat-ai/get-started-with-generative-ai/acrobat-ai-overview.html |
| Desktop-Sprachen | u. a. Deutsch, Englisch, Japanisch …; Slowakisch und Slowenisch nur unter Windows | D/get-started/learn-the-basics/tech-requirements.html |
| Aktuelle Version | Continuous Track 26.002.21931 (17.09.2026); geplantes Update 26.002.2xxxx (06.10.2026) | https://www.adobe.com/devnet-docs/acrobatetk/tools/ReleaseNotesDC/index.html |

## 17. Funktionen, die nur online bzw. in der Cloud laufen (belegt)

- Liquid Mode (Serververarbeitung, danach sofortige Löschung laut Adobe)
- Alle generativen KI-Funktionen: AI Assistant, Generative Summary, PDF Spaces, Podcasts, Präsentationen, interaktive Berichte, Chat-Bearbeitung, KI-Schwärzung. Adobe: „The use of generative AI features in Acrobat involves cloud processing of documents.“
- Cloudbasiertes Auto-Tagging (optional, Fallback lokal)
- Übersetzen, Express-Bildbearbeitung, Express-Styling, Deckblatt (alles über Adobe Express)
- Teilen per Link, Cloud-Review, Review-Tracking, Zugriffsanfragen
- E-Signaturen anfordern, Bulk-Send, Webformulare, Branding (Acrobat Sign); Signatur-Sync
- Premium-Online-Stimmen für Read out loud
- Acrobat on the web, Integrationen (ChatGPT, Copilot, Teams …), PDF Services API
- Online-abhängig, aber lokal nutzbar: Aktualisierung von AATL und EUTL; Zeitstempelserver; OCSP/CRL für LTV

**Lokal belegt (Desktop):** Bearbeiten, Seiten organisieren, OCR, Compare Files, Redact/Sanitize, Preflight/Print Production, Action Wizard, digitale Signatur und Zertifizierung, Passwort- und Zertifikatsverschlüsselung, Accessibility Check und Reading Order, PDF Optimizer, PDF/A-/X-/E-Konvertierung.

## 18. Schwerpunktfragen

### 18.1 Acrobat „PDF to HTML“-Export: Qualität

**Was Adobe dokumentiert:** Optionen Single oder Multiple HTML Pages, Navigations-Frames nach Überschriften oder Lesezeichen, Bilder ein/aus, Kopf- und Fußzeilen entfernen, OCR bei Bedarf (D/save-export-documents/convert-to-other-formats/pdf-to-html.html; U/file-format-options-pdf-export.html, Stand 21.11.2024).

Ein Adobe-Blog (Indien) empfiehlt, „to maintain formatting, use the Multiple HTML Pages option“ und CSS-Styles zu aktivieren. Links bleiben erhalten. Formulare, Buttons und JavaScript seien „manually“ nachzurüsten (https://www.adobe.com/in/acrobat/roc/blog/convert-pdf-to-html).

**Was Adobe nicht dokumentiert:** Ob das Ergebnis semantisches oder responsives HTML ist, absolut positioniert ist, wie Tabellen umgesetzt werden, ob Tags bzw. Strukturbaum genutzt werden, Barrierefreiheit des Outputs, Umgang mit Formularfeldern und Signaturen. Die PDF Services API bietet „Create“ **aus** HTML, aber **keinen HTML-Export**. → **OFFENE FRAGE:** Die Qualität lässt sich nur durch einen eigenen Test mit Referenz-PDFs belegen (getaggt/ungetaggt, mehrspaltig, Tabellen, Formulare). Drittquellen (macmyths.com, itechguides.com) raten, den Export „as a starting point“ zu behandeln. Sie sind keine Adobe-Quellen und wurden nicht verifiziert.

**Relevanz für hpro:** Adobe selbst bietet nur einen Einweg-Export ohne dokumentierte Responsivitäts- oder Semantikgarantie an. Die Lücke „PDF → gutes HTML“ ist also nicht durch Acrobat geschlossen. Das ist eine Beobachtung, keine Bewertung der Ausgabequalität.

### 18.2 Liquid Mode: Grenzen (belegt)

- **Nur mobil:** iOS 14+, Android 5.0+ und Play-Store-fähige Chromebooks; „As of now, Adobe Liquid Mode only works on Chromebook desktop devices“ (https://www.adobe.com/acrobat/hub/what-is-adobe-liquid-mode.html). Desktop-Acrobat hat stattdessen das klassische Reflow (Abschnitt 1).
- **Dateigrenzen:** über **200 Seiten** oder über **10 MB** werden nicht unterstützt.
- **Ausgeschlossen:** Scans, aus PowerPoint oder Keynote konvertierte Dateien, verschlüsselte oder passwortgeschützte Dateien, nicht unterstützte Sprachen, komplexe Layouts (Belege, Tickets, Rechnungen, Kontoauszüge), dichte Tabellen oder viele Bilder.
- Quellen: helpx mobile tech requirements (01.06.2026); lmode.html.
- **Hardware:** mindestens 1 GB RAM, kein x86 (Android).
- **Sprachen:** helpx listet 16 (u. a. Deutsch). Die Android-Doku spricht von 24 Sprachen, inklusive z. B. Tschechisch, Polnisch, Russisch, Türkisch. **Widerspruch.**
- **Datenschutz:** Verarbeitung auf Adobe-Servern, „immediately deleted … after the experience is generated“. Also keine Offline-Nutzung belegt.
- **Funktional:** ändert weder Inhalt noch Dateiformat. Funktioniert laut Android-FAQ **nicht im Dark Mode**. Screenreader (TalkBack) werden unterstützt.
- **Rolle getaggter PDFs** für Liquid Mode ist in den abgerufenen Adobe-Quellen **nicht** dokumentiert → OFFENE FRAGE.

---

## 19. Offene Fragen

1. **AI-Assistant-Add-on-Preis:** plans.html sagt US$1.99/Monat bzw. US$19.99/Jahr (wörtlich zitiert), die Pressemitteilung vom Feb. 2025 US$4.99. Für welche Pläne und Regionen gilt welcher Preis, und gibt es ein EUR-Pendant?
2. **„AI editing, conversion, compression“:** Die Vergleichsseite zeigt diese Zeile bei Pro abgehakt, plans.html listet „Ask AI to edit, convert, or compress PDFs“ als Studio-Zusatz. Was genau bekommt ein reiner Pro-Kunde an KI?
3. **„Collect signatures“-Limit:** Die WebFetch-Auswertung der Vergleichsseite nennt „2 documents per month“ für alle Pläne, eine zweite Auswertung zeigte Reader ohne Haken. Nicht verifiziert.
4. **Präsentationen generieren:** What's New sagt „available to … Pro, Standard, Trial, and free users, as well as Reader users“. Die Hilfeseite verlangt teils Studio. Aktueller Stand?
5. **QES/Cloud-Signatur direkt in Acrobat Desktop**, also ohne Acrobat Sign (CSC-API in „Configure New Digital ID“): In den abgerufenen Seiten nicht belegt. PKCS#11-Token und Smartcards („Signature Creation Device“) sind wahrscheinlich, aber nicht wörtlich belegt.
6. **PDF/UA-Preflight-Profil:** Gibt es ein ausdrückliches „Verify compliance with PDF/UA-1/-2“-Profil in Acrobat Pro 2026? Belegt ist nur, dass Preflight den PDF/UA-Status anzeigt und der Accessibility Check „such as PDF/UA“ prüft. Unterstützung für PDF/UA-2 bzw. WCAG 2.2: nicht belegt.
7. **Messwerkzeug und JavaScript-Bearbeitung:** in Standard enthalten oder Pro-only? Die Doku kennzeichnet es nicht.
8. **Desktop-Export nach Word/Excel/PPT:** lokal oder Cloud? Nicht dokumentiert.
9. **OCR-Sprachen Desktop vs. Web:** Die Web-Liste nennt kein Deutsch. Gilt das nur für Acrobat Web?
10. **Liquid Mode:** Sprachliste (16 vs. 24); Rolle von Tags; Desktop- oder Web-Verfügbarkeit 2026.
11. **HTML-Export-Qualität:** muss empirisch getestet werden (siehe 18.1).
12. **Österreich:** Teams-Preise, Express-Preis und Studio-Aktionspreise in EUR; ob die über den Preisdienst ermittelten Werte 1:1 auf www.adobe.com/at angezeigt werden.
13. **„Analyzer in Acrobat“ (Collections):** Produktumfang und Plan-Zuordnung unklar.
14. Seite U/applying-actions-scripts-pdfs.html war im Archiv defekt (HTTP 500), die Details zu Aktionen und Skripten sind daher nicht vollständig.
15. Contract Intelligence: Die Adobe-Newsroom-Seite wurde nur über ein Suchergebnis zitiert. Die Inhalte (bis 10 Verträge, US$4.99) stammen aus der Suchzusammenfassung und sollten direkt verifiziert werden.

---

## 20. Quellenliste

### Adobe Help Center (gelesen über web.archive.org, Snapshots 2025–2026)
- What's New Desktop: https://helpx.adobe.com/acrobat/desktop/whats-new/whats-new-acrobat-desktop.html (Last updated 16.09.2026)
- Reflow, Read Out Loud, Barrierefreiheits-Präferenzen: https://helpx.adobe.com/acrobat/using/reading-pdfs-reflow-accessibility-features.html
- Ansicht und Präferenzen: https://helpx.adobe.com/acrobat/using/viewing-pdfs-viewing-preferences.html; https://helpx.adobe.com/acrobat/using/adjusting-pdf-views.html
- Messen und Raster: https://helpx.adobe.com/acrobat/using/grids-guides-measurements-pdfs.html
- Compare: https://helpx.adobe.com/acrobat/using/compare-documents.html
- Liquid Mode: https://helpx.adobe.com/acrobat/mobile/view-manage-files/liquid-mode.html; https://helpx.adobe.com/acrobat/mobile/get-started/technical-requirements.html
- Themes: https://helpx.adobe.com/acrobat/desktop/get-started/preferences-and-settings/change-display.html; https://helpx.adobe.com/acrobat/web/get-set-up/preferences-settings/set-light-dark-mode.html
- Bearbeiten: …/desktop/edit-documents/edit-text-in-pdfs/modify-text.html; …/edit-images-or-objects/modify-image.html; …/organize-pages/renumber-pages.html; …/organize-pages/crop-pages.html; …/organize-pages/split-pdfs.html; …/use-headers-and-footers/add-header-footer.html; …/add-backgrounds-and-watermarks/add-watermarks.html; …/apply-bates-numbering/add-bates.html; …/use-links-and-attachments/add-attachment.html; https://helpx.adobe.com/acrobat/using/page-thumbnails-bookmarks-pdfs.html; …/combine-files/combine-files.html
- Scan/OCR: …/desktop/create-documents/scan-documents-to-pdfs/scan.html, recognize-text.html, fix-scanned-text.html, edit-scans.html, enhance-scans.html, enhance-images.html; https://helpx.adobe.com/acrobat/kb/is-ocr-or-text-recognition-available-in-acrobat-std-dc.html; https://helpx.adobe.com/acrobat/web/share-review-and-export/export-and-print/ocr-supported-languages.html
- Review: …/desktop/share-and-review-documents/review-documents/add-comments.html; …/use-stamps/add-modify-stamps.html; …/share-documents/share-pdfs.html; …/share-documents/manage-access.html; …/manage-reviews/track-reviews.html; https://helpx.adobe.com/acrobat/using/importing-exporting-comments.html; https://helpx.adobe.com/acrobat/web/share-review-and-export/review-pdfs/review-pdf-limitations.html; …/web/share-review-and-export/review-pdfs/read-aloud.html
- Formulare: …/desktop/work-with-pdf-forms/create-forms/convert-to-forms.html, create.html, allow-form-saving.html; …/customize-form-fields/field-properties.html, set-calculation-fields.html; …/share-forms/track-forms.html; …/fill-sign-forms/fill-sign.html; https://helpx.adobe.com/acrobat/using/collecting-pdf-form-data.html; https://helpx.adobe.com/acrobat/using/add-debug-javascript.html
- Signaturen: …/desktop/e-sign-documents/learn-about-signatures/digital-sign-overview.html, e-sign-overview.html; …/request-e-signatures/send-for-signing.html, request-in-bulk.html; …/fill-sign-documents/add-esign.html, add-digital-sign.html, add-time-stamps.html; …/manage-digital-signatures/certify-pdfs.html, validate-digital-sign.html, set-certificate-trust.html; …/protect-documents/manage-digital-ids/digital-ids.html; https://helpx.adobe.com/acrobat/kb/approved-trust-list1.html; https://helpx.adobe.com/acrobat/kb/trust-services.html; https://helpx.adobe.com/acrobat/web/e-sign-documents/fill-and-sign/digital-identity-overview.html; https://helpx.adobe.com/acrobat/web/e-sign-documents/fill-and-sign/types-of-signatures.html; https://helpx.adobe.com/document-cloud/digital-identity/primesign.html
- Sicherheit: …/desktop/protect-documents/protect-with-passwords/add-passwords-to-pdfs.html; …/redact-pdfs/redact.html, sanitize.html, redacting-sanitizing.html; …/encrypt-with-certificates/certificate-encrypt.html; …/security-policies/mpip-support-acrobat.html, mpip-content-markings-pdf.html
- Optimieren/Export: …/desktop/create-documents/optimize-pdfs/reduce-file-size.html, advance-size-reduction.html; …/save-export-documents/convert-to-other-formats/pdf-to-html.html, pdfs-to-image-formats.html; https://helpx.adobe.com/acrobat/using/exporting-pdfs-file-formats.html; https://helpx.adobe.com/acrobat/using/file-format-options-pdf-export.html (Snapshot 12.01.2025); https://helpx.adobe.com/acrobat/using/pdf-x-pdf-a-pdf.html; …/desktop/print-documents/set-up-and-print-pdfs/print-ready.html; https://helpx.adobe.com/acrobat/using/translate-pdf.html
- Barrierefreiheit: https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html; …/creating-accessible-pdfs.html; …/touch-reading-order-tool-pdfs.html; …/cloud-auto-tagging-accessibility-pdfs.html; …/editing-document-structure-content-tags.html; …/accessibility-features-pdfs.html
- PDF Spaces/KI: …/desktop/explore-pdf-spaces/supported-formats-limitations.html, pdf-spaces-faq.html, custom-ai-insights.html, share-pdf-spaces.html; https://helpx.adobe.com/acrobat/using/pdf-spaces-faq.html (Stand 19.08.2025, historisch); …/desktop/use-acrobat-ai/get-started-with-generative-ai/acrobat-ai-overview.html, generative-summary-overview.html, ai-tech-requirements.html; …/understand-usage-policies/ai-usage-policy-limitations.html, content-usage-handling.html; …/podcasts/create.html; …/get-started-with-smart-actions/edit-pdfs-via-chat-overview.html; …/ai-assistant-plus-acrobat.html; …/set-up-acrobat-generative-ai/acrobat-studio-enterprise.html; https://helpx.adobe.com/acrobat/web/create-pdfs/create-presentations/generate-presentations.html; https://helpx.adobe.com/acrobat/web/use-acrobat-ai/read-pdfs/interactive-reports.html; https://helpx.adobe.com/acrobat/web/use-acrobat-extensions/acrobat-for-chatgpt/pdf-tasks-in-chatgpt.html; https://helpx.adobe.com/acrobat/web/analyzer-in-acrobat/user-guide/collections/collections-overview.html
- Automatisierung/Druck: https://helpx.adobe.com/acrobat/using/action-wizard-acrobat-pro.html; …/automating-document-analysis-droplets-or.html; …/desktop/create-documents/explore-advanced-conversion-settings/set-watched-folders.html; https://helpx.adobe.com/acrobat/using/print-production-tools-overview-acrobat.html; …/previewing-output-acrobat-pro.html; …/analyzing-documents-preflight-tool-acrobat.html; …/color-conversion-ink-management-acrobat.html; …/trapping-color-acrobat-pro.html; …/printer-marks-hairlines-acrobat-pro.html; …/transparency-flattening-acrobat-pro.html; …/output-intents-pdfs-acrobat-pro.html; …/desktop/print-documents/color-print-quality/preview-overprint.html
- Plattform/Lizenz: …/desktop/get-started/learn-the-basics/tech-requirements.html; …/products-versions.html; https://helpx.adobe.com/acrobat/web/get-set-up/learn-the-basics/overview.html; …/web/get-set-up/learn-the-basics/technical-requirements.html; …/web/manage-cloud-storage/manage-adobe-cloud-files/cloud-storage-data-centers.html; …/file-size-storage-limitations.html; https://helpx.adobe.com/acrobat/kb/acrobat-perpetual-eos.html; https://helpx.adobe.com/acrobat/using/whats-new-acrobat-pro-2024.html

### adobe.com / news.adobe.com / Entwicklerdoku (direkt abgerufen)
- https://www.adobe.com/acrobat/pricing/compare-versions.html
- https://www.adobe.com/acrobat/plans.html
- https://www.adobe.com/acrobat/acrobat-pro.html
- https://www.adobe.com/acrobat/acrobat-studio.html
- https://www.adobe.com/acrobat/generative-ai-pdf.html
- https://www.adobe.com/acrobat/hub/what-is-adobe-liquid-mode.html
- https://www.adobe.com/devnet-docs/acrobat/android/en/lmode.html
- https://www.adobe.com/acrobat/mobile/scanner-app.html
- https://www.adobe.com/acrobat/business/compliance/eidas.html
- https://www.adobe.com/devnet-docs/acrobatetk/tools/DigSigDC/planning.html und …/standards.html
- https://www.adobe.com/devnet-docs/acrobatetk/tools/ReleaseNotesDC/index.html
- https://www.adobe.com/in/acrobat/roc/blog/convert-pdf-to-html
- https://news.adobe.com/news/2025/08/acrobat-studio-delivers-new-ai-powered-home-for-productivity-creativity
- https://news.adobe.com/news/2026/05/adobes-new-productivity-agent
- https://news.adobe.com/news/2025/02/acrobat-ai-assistant-contracts (nur über Suchergebnis)
- https://developer.adobe.com/document-services/docs/overview/pdf-services-api/dcserviceslicensing/
- https://developer.adobe.com/document-services/apis/pdf-accessibility-auto-tag/ (Suchergebnis)
- https://opensource.adobe.com/dc-acrobat-sdk-docs/acrobatsdk; https://opensource.adobe.com/dc-acrobat-sdk-docs/library/jsapiref/; https://opensource.adobe.com/dc-acrobat-sdk-docs/library/jsdevguide/JS_Dev_Tools.html (Suchergebnis)
- Preisdienst (AT): https://www.adobe.com/web_commerce_artifact?offer_selector_ids=… (OSI-Werte aus https://odin.adobe.com/adobe/sites/fragments/2e80cd08-290d-4b9e-bb20-993a539c33a8, …/ce527a09-52c8-4d72-9bee-2635bcf21466, …/df6364da-99eb-4d9f-bdc6-86e7d737b09f)
