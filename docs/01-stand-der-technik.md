# 01 – Stand der Technik

**Projekt:** html-Pro · **Phase:** 1 (Recherche) · **Stand:** 11.10.2026
**Auftrag:** [`00-auftrag.md`](00-auftrag.md), Deliverable 1

## Wie dieses Dokument zu lesen ist

- Jede Aussage über Standards, Produkte oder Marktlage trägt eine URL. Was sich nicht belegen
  ließ, ist als **OFFENE FRAGE** markiert und am Ende gesammelt.
- Die ausführlichen Rohnotizen mit Zitaten, Belegqualität und vollständigen Quellenlisten liegen
  in `docs/quellen/`:
  - [`recherche-a-epub-reflow-singlefile-readium.md`](quellen/recherche-a-epub-reflow-singlefile-readium.md)
  - [`recherche-b-recht-vertrauen-barrierefreiheit.md`](quellen/recherche-b-recht-vertrauen-barrierefreiheit.md)
  - [`recherche-c-satz-interaktiv-alternativen.md`](quellen/recherche-c-satz-interaktiv-alternativen.md)
  - [`recherche-d-acrobat-pro-dokumentation.md`](quellen/recherche-d-acrobat-pro-dokumentation.md)
- Dieses Dokument verdichtet die Notizen. Bei Zweifeln gilt die Notiz mit ihrem Zitat.
- **Belegqualität:** `helpx.adobe.com` blockiert automatische Abrufe (HTTP 403). Adobe-Aussagen
  stammen daher teils aus inhaltsgleichen Adobe-Entwicklerseiten, teils nur aus Suchauszügen. Das
  ist in den Notizen je Zitat markiert.
- **Bewertungsskala „Eignung für html-Pro“:**
  - **trägt:** kann Basis oder fester Baustein sein
  - **teilweise:** taugt als Vorbild, Teilbaustein oder Exportpfad
  - **ungeeignet:** weder als Basis noch als Baustein sinnvoll

---

## Überblick

| # | Technologie | Rolle für html-Pro | Eignung |
|---|---|---|---|
| 1 | EPUB 3.3/3.4 (Container, Package, Spine) | Containervorbild | teilweise |
| 1 | EPUB als fertiger PDF-Ersatz | – | ungeeignet |
| 1 | EPUB Fixed Layout | – | ungeeignet |
| 1 | EPUB Accessibility 1.1/1.2 | Barrierefreiheits-Metadaten | **trägt** |
| 2 | Adobe Liquid Mode, Acrobat-Reflow, Foxit, PDF Expert | Bedarfsbeleg, UX-Referenz | ungeeignet |
| 3 | MHTML | – | ungeeignet |
| 3 | Web Bundles / Signed HTTP Exchanges | – | ungeeignet |
| 3 | Signed Web Bundles (Isolated Web Apps) | Vorbild Signaturmodell | teilweise |
| 3 | SingleFile (HTML/ZIP-Polyglot) | Rückfallebene „öffnet im Browser“ | teilweise |
| 3 | WARC / WACZ | Archiv- und Beweisschicht | teilweise |
| 4 | PDF/UA ↔ semantisches HTML + WCAG | Barrierefreiheitsnachweis | siehe Abschnitt 4 |
| 5 | eIDAS-Signaturen (ASiC, XAdES, JAdES), Zeitstempel | Rechtsverbindlichkeit | siehe Abschnitt 5 |
| 5 | C2PA | Herkunftsnachweis, kein Rechtsersatz | siehe Abschnitt 5 |
| 6 | WeasyPrint | Exportpfad html-Pro → PDF/A, PDF/UA | **trägt** (mit Validierung) |
| 6 | Paged.js, Vivliostyle, Prince, Typst | Exportpfad / Druckvorschau / Vorbild | teilweise |
| 6 | LaTeX | Importquelle | teilweise (Export ungeeignet) |
| 7 | H5P | Containervorbild (ZIP + JSON-Manifest) | teilweise (Format trägt, Sicherheitsmodell nicht) |
| 7 | Quarto, Observable, Jupyter, MyST | Vorbilder für Pipeline, Dateiformat, Trust-Modell | teilweise bis trägt (als Vorbild) |
| 7 | Ceros, Shorthand, Notion/Coda | – | ungeeignet bis teilweise |
| 8 | Readium Mobile (Swift/Kotlin) | Reader-Baustein | **trägt** |
| 8 | Readium Web, Readium CSS, Thorium | Bausteine, Erfahrungsschatz | teilweise |
| 9 | Publication Manifest (W3C), Portable EPUBs | Manifest, Konzept | teilweise / trägt (Konzept) |
| 9 | ODF 1.4 | Vorbild Paket- und Signaturstruktur | teilweise |
| 9 | OOXML, OpenXPS, DjVu, Google `.gdoc`, Microsoft Loop | – | ungeeignet |
| 9 | Local-first / Automerge (CRDT) | Offline-Zusammenarbeit | trägt (als Prinzip) |

---

## 1. EPUB 3.3 / 3.4 und EPUB Accessibility

**Was:** ZIP-Container (OCF) mit Package-Dokument (XML), XHTML/SVG-Inhalt, CSS, optional
JavaScript, Medien und Navigation. Die Spezifikation beansprucht ausdrücklich auch „documents“,
nicht nur Bücher ([W3C-Pressemitteilung 2023](https://www.w3.org/press-releases/2023/epub33-rec)).

**Wer:** Ursprünglich IDPF, seit 30.01.2017 mit dem W3C zusammengelegt
([W3C](https://www.w3.org/press-releases/2017/idpf-w3c-combination)). Heute pflegt die
Publishing Maintenance Working Group; Charter bis 05.02.2027
([PMWG-Charter](https://www.w3.org/groups/wg/pm/charters/active/)).

**Reifegrad:**

| Spezifikation | Status | Quelle |
|---|---|---|
| EPUB 3.3 | W3C Recommendation seit 25.05.2023, aktuelle Fassung 13.01.2026 | [EPUB 3.3](https://www.w3.org/TR/epub-33/) |
| EPUB Reading Systems 3.3 | Recommendation, Fassung 17.10.2024 | [RS 3.3](https://www.w3.org/TR/epub-rs-33/) |
| EPUB Accessibility 1.1 | Recommendation, Fassung 17.10.2024 | [A11y 1.1](https://www.w3.org/TR/epub-a11y-11/) |
| EPUB 3.4, RS 3.4, Accessibility 1.2 | Candidate Recommendation seit 21.07.2026, Kommentarfrist bis 19.10.2026 | [W3C-News](https://w3.org/news/2026/w3c-invites-implementations-of-epub-3-4-epub-reading-systems-3-4-and-epub-accessibility-1-2) |

**Wo EPUB für html-Pro scheitert:**

- **Layoutkontrolle:** Reading Systems dürfen Autoren-CSS bei Nutzerinteraktion überschreiben
  („MAY override“), CSS-Unterstützung auf Browserniveau ist nur empfohlen
  ([RS 3.3, §6.3](https://www.w3.org/TR/epub-rs-33/)). Produktionsleute beklagen „the complete
  lack of control over page layout“ und „broken media queries (which makes responsive design
  impossible)“ ([Readium CSS](https://readium.org/css/docs/CSS24-eprdctn_requests.html)).
- **Tabellen:** Die Branche empfiehlt für breite Tabellen horizontale Scroll-Container
  ([EDRLab Qualebook, Regel 78](https://qualebook.edrlab.org/en/rules/078/)); „tables can only be
  compressed so much“ ([DAISY KB](https://kb.daisy.org/publishing/docs/css/reflow.html)).
- **Interaktivität:**
  - Reading Systems „SHOULD support scripting“, müssen aber nicht. Spine-Level-Scripts sollen
    so geschrieben sein, dass das Dokument ohne sie ohne Informationsverlust nutzbar bleibt
    ([EPUB 3.3, §6.3.2.2](https://www.w3.org/TR/epub-33/); [RS 3.3, §6.4](https://www.w3.org/TR/epub-rs-33/)).
  - Im offiziellen W3C-Testbericht bestanden den Test auf eindeutige Script-Origin nachweislich
    nur Apple Books und Thorium ([epub-tests](https://github.com/w3c/epub-tests/tree/main/epub33/reports)).
  - Google Play Books unterstützt keine JavaScript-Interaktivität
    ([Partner-Hilfe](https://support.google.com/books/partner/answer/3316879?hl=en)).
- **Sicherheit:**
  - KU Leuven untersuchte 97 EPUB-Apps: etwa die Hälfte folgte den Sicherheitsempfehlungen
    nicht ([Black Hat EU 2021](https://infocondb.org/con/black-hat/black-hat-europe-2021/how-your-e-book-might-be-reading-you-exploiting-epub-reading-systems)).
  - Thorium Reader 3.3.0 (09.12.2025) schloss eine Lücke, über die JavaScript in einem EPUB
    „escape the web browser sandbox and … run programs on the victim's computer“ konnte
    ([Release-Notes](https://github.com/edrlab/thorium-reader/releases/tag/v3.3.0)).
- **Signaturen:** „reading systems do not have to check signatures“
  ([EPUB 3.3, §4.2.6.3.6](https://www.w3.org/TR/epub-33/)). Der W3C-Testkatalog enthält keinen
  Test für `signatures.xml`; EPUB 3.4 stuft den Linktyp `xml-signature` als „deprecated“ ein
  ([EPUB 3.4](https://www.w3.org/TR/epub-34/)). Das Feature ist praktisch tot.
- **Rechteverwaltung:** `encryption.xml` verschlüsselt Datei für Datei und legt dabei
  Verzeichnisstruktur und Dateinamen offen ([EPUB 3.3, §4.2.6.3.2](https://www.w3.org/TR/epub-33/)).
  Real genutzt wird DRM über Readium LCP (ISO/IEC 23078-2:2024), zugeschnitten auf Verlage und
  Bibliotheken ([EDRLab](https://www.edrlab.org/readium-lcp/)).
- **Druck:** Die Spezifikation regelt keinen Druck; belastbare Vergleiche der Druckfunktionen
  von Readern fehlen (**OFFENE FRAGE**).
- **Syntax:** EPUB 3.4 hatte HTML-Syntax kurz zugelassen und am 11.11.2025 wieder entfernt; EPUB
  bleibt bei XHTML ([EPUB 3.4, Change Log](https://www.w3.org/TR/epub-34/)).
- **Dokumente statt Bücher:** Einen belegten breiten Einsatz für Verträge, Rechnungen oder
  Formulare gibt es nicht (**OFFENE FRAGE**). Fast die Hälfte der Verlage erzeugt neben EPUB
  zusätzlich PDF, vor allem wegen Formatierungsanforderungen
  ([W3C-Umfrage 2020](https://www.w3.org/blog/2020/publishingw3c-epub-survey-results)).
- **Fixed Layout** ist Papiersimulation und laut W3C-Note in vielen Fällen nicht barrierefrei zu
  machen ([EPUB FXL A11y Note 2025](https://www.w3.org/TR/2025/NOTE-epub-fxl-a11y-20250925)).

**Stärken:** offener, gepflegter Standard; erprobtes Container- und Manifestmodell; ausgereiftes
Barrierefreiheitsmodell mit Pflichtmetadaten (`accessMode`, `accessibilityFeature`,
`accessibilityHazard`) und Konformitätsangabe ([A11y 1.1](https://www.w3.org/TR/epub-a11y-11/)),
das ausdrücklich auf den European Accessibility Act Bezug nimmt; offene Infrastruktur (Readium,
Thorium, epubcheck, Ace).

**Eignung:**

| Baustein | Eignung | Begründung |
|---|---|---|
| Container (OCF/ZIP, Package, Spine, Nav) | teilweise | erprobt, aber an XHTML gebunden; Reader würden html-Pro uneinheitlich darstellen |
| EPUB als fertiger PDF-Ersatz | ungeeignet | keine geprüften Signaturen, keine verlässliche Interaktivität, keine Layoutgarantie |
| Fixed Layout | ungeeignet | Papiersimulation, schlecht barrierefrei |
| Accessibility 1.1/1.2 | **trägt** | Metadaten- und Konformitätsmodell fast 1:1 übernehmbar |
| Readium LCP | teilweise | ISO-standardisiert, aber für Verlags-DRM gebaut |

---

## 2. Adobe Liquid Mode und Reflow-Modi

**Liquid Mode** (Adobe, vorgestellt 09/2020) erkennt per Adobe Sensei Überschriften, Absätze,
Listen, Tabellen und Bilder und bricht das PDF mobil um; „This experience does not change any
content“ ([Adobe devnet iOS](https://www.adobe.com/devnet-docs/acrobat/ios/en/lmode.html)).

**Grenzen laut Adobe** ([devnet iOS](https://www.adobe.com/devnet-docs/acrobat/ios/en/lmode.html),
[devnet Android](https://www.adobe.com/devnet-docs/acrobat/android/en/lmode.html)):

- nicht oder eingeschränkt für Dateien mit mehr als **200 Seiten** oder mehr als **10 MB**
- nicht für gescannte, verschlüsselte oder aus Präsentationen konvertierte Dateien
- nicht für „Complex layouts (eg. tickets, statements, invoices, receipts etc.)“
- abgeraten bei Dokumenten aus „mostly tables and charts“ oder „mostly images“
- **Serververarbeitung:** „Files are processed in our secure data servers and immediately
  deleted … after the experience is generated“ (devnet iOS). Serverstandort, DSGVO-Grundlage und
  Trainingsnutzung sind nicht dokumentiert (**OFFENE FRAGE**).
- Barrierefreiheit: Adobe selbst schreibt, Screenreader-Nutzer könnten bei bereits barrierefreien
  Dokumenten das Originallayout besser finden; Formulare lassen sich noch nicht umwandeln
  ([Adobe Blog 12/2020](https://blog.adobe.com/en/publish/2020/12/10/adobe-delivers-enhanced-pdf-reading-experience-for-accessibility)).
- **Plattform:** Belegt sind iOS, Android und Chromebooks
  ([Adobe](https://www.adobe.com/au/acrobat/hub/what-is-adobe-liquid-mode.html)). Ein
  YouTube-Review von 04/2025 behauptet Liquid Mode auf dem Desktop
  ([H1wDqQomoAE](https://www.youtube.com/watch?v=H1wDqQomoAE)); eine Adobe-Quelle dafür wurde nicht
  gefunden (**OFFENE FRAGE**).

**Acrobat-Reflow** (Desktop) zeigt das PDF temporär einspaltig. Formulare, Kommentare und
Signaturfelder fließen nicht um, Speichern, Bearbeiten und Drucken sind im Reflow-Modus nicht
möglich; das Ergebnis hängt an Tags und Lesereihenfolge
([helpx, Suchauszug](https://helpx.adobe.com/acrobat/using/reading-pdfs-reflow-accessibility-features.html);
[Clemson University](https://www.clemson.edu/accessibility/digital/guides/pdf/fundamentals/reflow.html)).

**Foxit Reflow** ist eine reine Ansicht; Kommentare und Formularfelder fließen nicht um
([Foxit-Hilfe](https://resource-cms.foxit.com/foxit-pdf-editor-for-windows/read-pdf-in-reflow-view)).
**PDF Expert Reading Mode** gibt es laut Hilfe nur auf dem iPhone, ebenfalls als temporäre Ansicht
([Readdle](https://support.readdle.com/pdfexpert/en_US/reading-pdfs/reading-mode)). Ob lokal oder
in der Cloud verarbeitet wird, ist bei beiden nicht dokumentiert (**OFFENE FRAGE**).

**Eignung: ungeeignet als Basis.** Aber der wichtigste **Bedarfsbeleg** für html-Pro: Selbst
Adobe muss PDF-Struktur nachträglich per KI und Server rekonstruieren und scheitert dabei genau an
Geschäftsdokumenten (Rechnungen, Formulare, dichte Tabellen). Struktur muss von Anfang an im
Format stecken. Für den Übergang PDF → html-Pro gilt: Gut getaggte PDFs lassen sich strukturiert
überführen, ungetaggte nur heuristisch und mit Verlusten.

---

## 3. Eine Webseite in einer Datei: MHTML, Web Bundles, SingleFile, WARC/WACZ

| Technologie | Stand | Eignung |
|---|---|---|
| **MHTML** (RFC 2557) | Chromium deaktiviert beim Öffnen Scripts und Formularfelder ([Eric Lawrence](https://textslashplain.com/2022/02/09/mhtml-in-chromium/)); Firefox unterstützt MHTML nicht ([Wikipedia](https://en.wikipedia.org/wiki/MHTML)) | ungeeignet |
| **Web Bundles / Signed HTTP Exchanges** | Bundle-Navigation 02/2023 aus Chrome entfernt ([Chrome](https://developer.chrome.com/docs/web-platform/web-bundles)); IETF-WG WPACK beendet ([Datatracker](https://datatracker.ietf.org/wg/wpack/about/)); Mozilla „negative“ ([standards-positions #29](https://github.com/mozilla/standards-positions/issues/29)); Google stellt ab ca. 30.09.2026 keine SXG-Zertifikate mehr aus, weil der Standard „was not widely adopted“ ([Google PKI](https://developers.google.com/public-key-infrastructure/updates/july2026-sxg-deprecation)) | ungeeignet |
| **Signed Web Bundles / Isolated Web Apps** | signiertes Bundle mit „Integrity Block“ (Ed25519/ECDSA), Identität an Schlüssel gebunden; nur für Chrome-Enterprise-verwaltetes ChromeOS ([Chrome IWA](https://developer.chrome.com/docs/iwa/introduction)) | teilweise (Signaturmodell als Vorbild) |
| **SingleFile** | Browsererweiterung, AGPL, v1.29.0 vom 10.10.2026; Format „self-extracting ZIP“: die Datei ist zugleich HTML und gültiges ZIP ([FAQ](https://github.com/gildas-lormeau/SingleFile/blob/master/faq.md)); Scripts werden standardmäßig entfernt | teilweise (Polyglot als Rückfallebene) |
| **WARC / WACZ** | WARC ist ISO 28500; WACZ 1.1.1 packt Web-Archive als eine Datei mit `datapackage.json` ([WACZ](https://specs.webrecorder.net/wacz/1.1.1/)); WACZ-Signing 0.1.0 ist ein Entwurf mit RFC-3161-Zeitstempel ([WACZ-Auth](https://specs.webrecorder.net/wacz-auth/0.1.0/)) | teilweise (Archiv/Beweis) |
| **data:-URIs** | Limit 512 MB in Chromium/Firefox; Top-Level-Navigation zu `data:` überall blockiert ([MDN](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/data)) | teilweise (nur Inline-Technik) |

**Antwort auf die Leitfrage „tragfähig in eine Datei, offline und signierbar?“**

- **Eine Datei, offline, nur ansehen:** ja (SingleFile, mit Einschränkungen MHTML, WACZ mit Viewer).
  Interaktivität geht dabei in der Regel verloren.
- **Signiert und vom normalen Browser geprüft:** **nein.** Ein solches browserübergreifendes
  Format gibt es 2026 nicht. Die web-nativen Versuche (Web Packaging, SXG) sind gescheitert.
- **Folge:** html-Pro braucht einen **eigenen Container und einen eigenen Prüfer** (Reader). Ein
  HTML/ZIP-Polyglot nach SingleFile-Art könnte dafür sorgen, dass die Datei ohne Reader
  wenigstens im Browser lesbar bleibt. Ob sich so eine Datei signieren lässt, ohne die
  Polyglot-Eigenschaft zu brechen, ist ungeprüft (**OFFENE FRAGE**).
- Ergänzend: Aus `file://` geladene Seiten können in Chromium keine ES-Module oder `fetch()` auf
  Nachbardateien nutzen (nur Forenbelege, siehe Notiz A; **OFFENE FRAGE** Primärquelle). Eine
  einzelne HTML-Datei ist im Dateisystem also nur eingeschränkt interaktiv.

---

## 4. Barrierefreiheit: PDF/UA und Tagged PDF vs. semantisches HTML

**PDF-Seite:**

- **PDF/UA-1 = ISO 14289-1:2014**, **PDF/UA-2 = ISO 14289-2:2024** (für PDF 2.0, veröffentlicht
  03/2024; [SCC](https://scc-ccn.ca/standardsdb/standards/8185912)). Die frei verfügbare
  Begleitspezifikation WTPDF 1.0 nennt als Ziel ausdrücklich auch die Wiederverwendung des Inhalts,
  etwa als HTML ([WTPDF](https://pdfa.org/wp-content/uploads/2024/02/Well-Tagged-PDF-WTPDF-1.0.pdf)).
- Tagged PDF trennt Struktur (Tag-Baum) von Darstellung (Seiteninhalt). Tags sind optional und
  fehlen oft; das Ergebnis ist dann „glyph salad“
  ([BFO](https://bfo.com/misc/2025-pdf-days-berlin-presentation/presentation-pdf1.pdf)).
- Das **Matterhorn-Protokoll** (Prüfkatalog für PDF/UA-1) umfasst 136 Fehlerbedingungen; davon
  sind 87 maschinell prüfbar und 47 erfordern menschliches Urteil
  ([PDFlib](https://www.pdflib.com/pdf-knowledge-base/pdfua/matterhorn-protocol)). Gut ein Drittel
  der Konformität ist also nicht automatisch prüfbar.

**HTML-Seite:**

- **WCAG 2.2** ist W3C-Empfehlung seit 10/2023 ([W3C](https://www.w3.org/TR/WCAG22/)) und seit
  21.10.2025 zugleich ISO/IEC 40500:2025 ([W3C WAI](https://www.w3.org/WAI/news/2025-10-21/wcag22-iso)).
  WAI-ARIA 1.2 ist Empfehlung seit 06/2023 ([W3C WAI](https://www.w3.org/WAI/news/2023-06-06/aria-12-rec/)).
- **SC 1.4.10 Reflow (AA)** verlangt Inhalte, die sich auf 320 CSS-Pixel Breite ohne zweidimensionales
  Scrollen darstellen lassen ([Understanding Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)).
  Responsives HTML erfüllt das konstruktiv, festes Seitenlayout nur über Reflow im Reader.
- **EN 301 549** ist die harmonisierte Norm; V4.1.1 (mit WCAG 2.2) liegt seit 02.09.2026 bei ETSI
  ([ETSI](https://www.etsi.org/deliver/etsi_en/301500_301599/301549/04.01.01_60/en_301549v040101p.pdf)),
  die Listung im Amtsblatt steht laut Sekundärquelle noch aus
  ([Pivotal](https://www.pivotalaccessibility.com/2026/09/en-301-549-v4-1-1-is-published-what-it-means-for-digital-accessibility/)).

**Rechtsrahmen:** Der European Accessibility Act (Richtlinie (EU) 2019/882) gilt seit 28.06.2025,
u. a. für Bankdienstleistungen für Verbraucher, E-Commerce und E-Books
([EUR-Lex](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32019L0882)).
Umgesetzt in Deutschland durch das BFSG ([gesetze-im-internet](https://www.gesetze-im-internet.de/bfsg/BJNR297010021.html))
und in Österreich durch das BaFG ([RIS](https://ris.bka.gv.at/eli/bgbl/I/2023/76)).

- Ausgenommen sind „Dateiformate von Büro-Anwendungen, die vor dem 28. Juni 2025 veröffentlicht
  wurden“ (Art. 2 Abs. 4 lit. b). Im Umkehrschluss sind neue Dokumente in erfassten Diensten nicht
  ausgenommen. Ob PDF unter diesen Begriff fällt, ist Praxis, aber nicht legaldefiniert
  (**OFFENE FRAGE**).
- Anhang I Abschnitt III verlangt Informationen „in Textformaten …, die sich zum Generieren
  alternativer assistiver Formate eignen“, und „anpassbaren Abstand zwischen den Buchstaben, Zeilen
  und Absätzen“. Das ist in HTML/CSS nativ, in PDF nur über Tags und Reader-Reflow erreichbar:
  **ein echtes Argument für html-Pro.**
- Bei Bankdienstleistungen und E-Commerce müssen auch **elektronische Signaturen** wahrnehmbar,
  bedienbar, verständlich und robust sein (Anhang I Abschnitt IV). Der Signaturvorgang selbst muss
  also barrierefrei sein.

**Praxis – beide Welten sind schlecht:**

| Befund | Quelle |
|---|---|
| 95,9 % der 1 Mio. meistbesuchten Startseiten haben automatisch erkennbare WCAG-Fehler (2026) | [WebAIM Million](https://webaim.org/projects/million/) |
| Von 69.944 PDFs deutscher öffentlicher Websites sind 9,5 % PAC-konform, 37,4 % gar nicht getaggt | [axes4-Studie 04/2026](https://www.axes4.com/en/blog/post/2026-1/only-9-5-pac-compliant-what-the-new-study-on-pdf-accessibility-in-the-public-sector-reveals) (Sekundärquelle, Anbieterblog) |
| 59 % der pflichtigen PDFs luxemburgischer Behörden-Websites ungetaggt (2023) | [accessibilite.public.lu](https://accessibilite.public.lu/en/news/2023-04-28-des-pdf-majoritairement-inaccessibles.html) |

**Bewertung:** Semantisches HTML ist die bessere Ausgangslage, besonders für Reflow und anpassbare
Darstellung. Barrierefrei wird ein Dokument aber nur, wenn der **Editor** Struktur erzwingt
(Überschriftenhierarchie, Alt-Texte, Sprache, Tabellenköpfe, Formular-Labels, Kontrast). Für den
Nachweis bietet sich das Metadatenmodell von EPUB Accessibility 1.1 an. Wie ein html-Pro-Dokument
nach EN 301 549 einzuordnen ist (Kapitel 9 „Web“ oder Kapitel 10 „Nicht-Web-Dokument“), ist offen
(**OFFENE FRAGE**).

---

## 5. Vertrauen und Recht

Dies ist der härteste Blocker für Papierersatz. Ausführlich mit Normtexten:
[Notiz B](quellen/recherche-b-recht-vertrauen-barrierefreiheit.md). Keine Rechtsberatung.

### 5.1 Kein Gesetz schreibt PDF vor, aber Behörden tun es

- Steuer- und Handelsrecht sind formatneutral: § 147 AO
  ([gesetze-im-internet](https://www.gesetze-im-internet.de/ao_1977/__147.html)), § 257 HGB
  ([gesetze-im-internet](https://www.gesetze-im-internet.de/hgb/__257.html)), § 132 BAO
  ([RIS](https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10003940&Paragraf=132)),
  § 190 UGB ([RIS](https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001702&Paragraf=190)).
- Die harte PDF-Pflicht entsteht dort, wo Behörden Formate per Verordnung festlegen:
  - **Deutsche Gerichte:** „Das elektronische Dokument ist im Dateiformat PDF zu übermitteln“
    (ERVV § 2, [gesetze-im-internet](https://www.gesetze-im-internet.de/ervv/__2.html)). Und:
    „Mehrere elektronische Dokumente dürfen nicht mit einer gemeinsamen qualifizierten
    elektronischen Signatur übermittelt werden“ (ERVV § 4 Abs. 2,
    [gesetze-im-internet](https://www.gesetze-im-internet.de/ervv/__4.html)). Eine Signatur über
    einen ganzen Container ist dort also unzulässig.
  - Die ERVB 2025 lassen laut Sekundärquellen PDF bis 2.0, PDF/A-1/-2 und PDF/UA zu, ohne
    JavaScript und eingebettete Objekte; der Originaltext war nicht extrahierbar (**OFFENE FRAGE**).
  - **Österreichische Justiz (ERV 2021):** Formate regelt eine Schnittstellenbeschreibung; ist eine
    strukturierte Übermittlung nicht möglich, ist ein „PDF-Anhang“ zulässig
    ([RIS](https://www.ris.bka.gv.at/Dokumente/BgblAuth/BGBLA_2021_II_587/BGBLA_2021_II_587.html)).
    Welche Beilagenformate genau zulässig sind, ist offen (**OFFENE FRAGE**).
- **Folge:** html-Pro ist im deutschen Gerichtsverkehr nicht einreichungsfähig. Ein **PDF-Export**
  (PDF/A, PDF/UA, ohne JavaScript, je Dokument einzeln signierbar) ist Pflicht.

### 5.2 Signaturen (eIDAS)

- **Rechtswirkung:** Eine qualifizierte elektronische Signatur (QES) „hat die gleiche Rechtswirkung
  wie eine handschriftliche Unterschrift“ (Art. 25 Abs. 2 eIDAS); keinem elektronischen Dokument
  darf die Rechtswirkung allein wegen der elektronischen Form abgesprochen werden (Art. 46)
  ([eIDAS konsolidiert](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:02014R0910-20240520)).
  Deutschland: § 126a BGB, § 371a ZPO; Österreich: § 4 SVG – eine QES erfüllt die Schriftlichkeit
  nach § 886 ABGB ([RIS](https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR40184733/NOR40184733.html)).
- **Formate:** Für einen ZIP-Container mit HTML gibt es ein fertiges Format: **ASiC-E mit XAdES**
  (ETSI EN 319 162-1). Die Norm baut ausdrücklich auf OCF auf, „originally designed for use by
  eBooks“, und erlaubt, später Dateien, Signaturen und Zeitstempel hinzuzufügen, ohne frühere
  Signaturen zu brechen ([ETSI](https://www.etsi.org/deliver/etsi_en/319100_319199/31916201/01.01.01_60/en_31916201v010101p.pdf)).
  Alternative bei JSON-Manifest: **JAdES**, das über `sigD` mehrere losgelöste Datenobjekte signieren
  kann ([ETSI TS 119 182-1](https://www.etsi.org/deliver/etsi_ts/119100_119199/11918201/01.02.01_60/ts_11918201v010201p.pdf)).
- **Anerkennung:** Die Durchführungsverordnung (EU) 2026/248 verpflichtet öffentliche Stellen ab
  23.02.2027, XAdES, CAdES, PAdES, JAdES und ASiC Baseline anzuerkennen; andere Formate nur, wenn der
  Herkunftsstaat eine kostenlose Online-Validierung anbietet
  ([EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32026R0248)). Ein
  Eigenformat wäre damit praktisch nicht anerkennungsfähig.
- **Validierung:** Die EU-Bibliothek DSS (LGPL) prüft XAdES, CAdES, PAdES, JAdES und ASiC-S/-E
  ([GitHub](https://github.com/esig/dss)); die österreichische RTR-Signaturprüfung nennt „ASiC“,
  aber kein JAdES ([RTR](https://www2.rtr.at/en/vd/Pruefung_Details)).
- **Wer signiert womit:** In Österreich hat die ID Austria am 05.12.2023 die Handy-Signatur abgelöst
  ([BKA](https://www.bundeskanzleramt.gv.at/agenda/digitalisierung/digitales-oesterreich/id-austria.html)).
  QES läuft heute praktisch über Fernsignatur; dafür gibt es die CSC API v2.2
  ([CSC](https://cloudsignatureconsortium.org/resources/csc-api-v2-2/)) und ETSI TS 119 432. Ob
  A-Trust/ID Austria Drittanbietern eine offene CSC-Schnittstelle bietet, ist nicht belegt
  (**OFFENE FRAGE**).
- **EUDI-Wallet:** Jede Wallet muss natürlichen Personen kostenloses QES-Signieren ermöglichen
  (Art. 5a eIDAS); Frist für die Bereitstellung ist der 24.12.2026
  ([DVO 2024/2977](https://eur-lex.europa.eu/eli/reg_impl/2024/2977/oj)). Deutschland plant den Start
  am 02.01.2027, laut Presse zunächst ohne QES
  ([netzpolitik.org](https://netzpolitik.org/2026/faq-zur-eudi-wallet-die-wichtigsten-fragen-und-antworten-zur-digitalen-brieftasche/));
  für Österreich gibt es kein festes Datum (**OFFENE FRAGE**).

### 5.3 Das Kernproblem: „What you see is what you sign“

§ 371a ZPO knüpft die Echtheitsvermutung an eine „Erklärung“, § 126a BGB verlangt bei Verträgen
ein „gleichlautendes Dokument“ ([§ 126a BGB](https://www.gesetze-im-internet.de/bgb/__126a.html)).
Eine Signatur schützt aber nur Bytes. Bei responsivem und skriptgesteuertem Inhalt kann dieselbe
signierte Bytefolge auf zwei Geräten verschieden aussehen, oder ein Skript zeigt nach der Signatur
etwas anderes. BFO formuliert es so: „Zip them and sign the zip? It's not the same.“
([BFO](https://bfo.com/misc/2025-pdf-days-berlin-presentation/presentation-pdf1.pdf)). Das ist
keine Frage der Zulässigkeit, sondern der **Beweis- und Gestaltungsqualität** – und eine
ausdrückliche **Schwäche der Idee**. Rechtsprechung zu signierten dynamischen HTML-Dokumenten wurde
nicht gefunden (**OFFENE FRAGE**).

### 5.4 Zeitstempel und Langzeitvalidierung

- Qualifizierte Zeitstempel genießen die Vermutung der Richtigkeit von Datum und Zeit (Art. 41
  eIDAS). Referenznormen: EN 319 421/422 auf Basis von RFC 3161
  ([DVO 2025/1929](https://eur-lex.europa.eu/eli/reg_impl/2025/1929/oj)).
- Die Baseline-Stufen B-B, B-T, B-LT und **B-LTA** (mit Archivzeitstempeln) sichern die Prüfbarkeit
  über Jahre; sie sind auch für ASiC-E mit XAdES definiert (EN 319 162-1).
- **Beweiswerterhaltung:** ETSI TS 119 511 nennt ASiC-S/-E ausdrücklich als „Preservation Object
  Container“ ([ETSI](https://www.etsi.org/deliver/etsi_ts/119500_119599/119511/01.02.01_60/ts_119511v010201p.pdf));
  die deutsche BSI TR-03125 (TR-ESOR) nutzt mit ASiC-AIP ein ASiC-E-basiertes Archivpaket
  ([BSI](https://www.bsi.bund.de/EN/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/Technische-Richtlinien/TR-nach-Thema-sortiert/tr03125/BSITR03125.html)).
  Ein ASiC-E-konformer html-Pro-Container ließe sich also ohne Umverpackung in solche Archive
  einstellen.
- **eIDAS 2.0** führt die qualifizierte elektronische Archivierung ein (Art. 45i/45j; DVO (EU)
  2025/2532 mit CEN/TS 18170 und OAIS, [EUR-Lex](https://eur-lex.europa.eu/eli/reg_impl/2025/2532/oj)).
  Art. 45j erlaubt ausdrücklich Änderungen „in Bezug auf das … elektronische Format“, also
  Formatmigration.

### 5.5 C2PA (Content Credentials)

- Koalition aus Adobe, Arm, BBC, Intel, Microsoft, Truepic (gegründet 2021), später u. a. Google,
  OpenAI, Meta, Amazon ([C2PA](https://c2pa.org/about/)). Aktuelle Spezifikation **2.4 (04/2026)**
  ([Spec](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html)).
- Unterstützt u. a. PDF, EPUB/OOXML/ODF und „other ZIP-based formats“ (jede Datei einzeln gehasht),
  seit 2.4 auch **HTML** (bevorzugt über `<link rel="c2pa-manifest">`) und unstrukturierten Text
  (ebd., Anhang A).
- Vertrauen läuft über eine **eigene C2PA Trust List**, nicht über die EU-Vertrauenslisten. C2PA
  ist ein **Herkunfts- und Bearbeitungsnachweis** (inkl. KI-Kennzeichnung), **keine eIDAS-Signatur**.
  Ob eine C2PA-Claim-Signatur mit qualifiziertem Zertifikat zugleich eine QES sein kann, ist
  ungeklärt (**OFFENE FRAGE**).

### 5.6 Archivierung: PDF/A vs. HTML/WARC

- PDF/A (ISO 19005-1 bis -4) ist das etablierte Archivformat; PDF/A-3 erlaubt beliebige eingebettete
  Dateien ([LoC](https://www.loc.gov/preservation/digital/formats/fdd/fdd000532.shtml)).
- Die **Library of Congress** führt für digitale Textwerke EPUB 3, PDF/UA und PDF/A als „preferred“,
  HTML/XHTML nur als „acceptable“ ([LoC RFS](https://www.loc.gov/preservation/resources/rfs/text.html));
  für Websites WARC „preferred“, WACZ „acceptable“
  ([LoC RFS](https://www.loc.gov/preservation/resources/rfs/webarchives.html)).
- Die Schweizer **KOST** empfiehlt für Hypertext-Einzeldateien PDF/A-2; HTML nur „als Ersatz für
  Plain Text“ und nur ohne externe Ressourcen, denn „viele Webseiten [sind] nur bei korrekter
  grafischer Darstellung inhaltlich verständlich“ ([KOST](https://kost-ceco.ch/cms/kad_html_de.html)).
- **Folge:** HTML ist als Archivformat nur eingeschränkt akzeptiert. EPUB-Nähe, eine öffentliche
  stabile Spezifikation und ein Archiv-Export (PDF/A, ggf. WARC/WACZ) sind Voraussetzung.

### 5.7 Revisionssicherheit und Aufbewahrung (DE/AT)

| | Deutschland | Österreich |
|---|---|---|
| Fristen | Bücher/Abschlüsse 10 Jahre, **Buchungsbelege 8 Jahre** (seit BEG IV, 2025), Handelsbriefe 6 Jahre (§ 147 AO, § 257 HGB) | **7 Jahre** (§ 132 BAO, § 212 UGB) |
| Wiedergabe | „bildlich“ übereinstimmend für empfangene Briefe und Belege, „inhaltlich“ für andere; maschinell auswertbar (§ 147 Abs. 2 AO) | „vollständige, geordnete, inhaltsgleiche und urschriftgetreue Wiedergabe“; bei rein elektronischen Unterlagen „entfällt das Erfordernis der urschriftgetreuen Wiedergabe“ (§ 132 Abs. 2 BAO) |
| Unveränderbarkeit | § 146 Abs. 4 AO, § 239 Abs. 3 HGB | § 190 Abs. 4 UGB |
| Verwaltungsanweisung | GoBD (2019, geändert 03/2024 und 07/2025, Sekundärquellen, BMF-Server am Recherchetag nicht erreichbar): Bei E-Rechnungen genügt seit 14.07.2025 der strukturierte Teil ([KPMG](https://kpmg.com/de/de/themen/2025/07/bmf-gobd-zweite-aenderung.html)); Konvertierung nur unter den Bedingungen von Rz. 135 | GoBD-Gegenstück nicht gefunden (**OFFENE FRAGE**) |

**Bewertung:** Österreich ist für ein originär elektronisches, responsives Format günstiger als
Deutschland. Die zentrale offene Frage für Deutschland: Was ist bei einem empfangenen responsiven
Geschäftsbrief das „Bild“, mit dem eine Wiedergabe „bildlich übereinstimmen“ muss? Vermutlich
genügt die byte-identische Aufbewahrung des Originalcontainers, belegt ist das nicht
(**OFFENE FRAGE**). Pflicht bleibt in jedem Fall, einen Viewer für die gesamte Frist bereitzustellen
(§ 147 Abs. 5 AO, § 132 Abs. 3 BAO).

### 5.8 Präzedenzfall E-Rechnung

- Deutschland definiert die E-Rechnung über ein **strukturiertes Format nach EN 16931**, eine
  PDF-Rechnung ist seit 2025 eine „sonstige Rechnung“ (§ 14 UStG,
  [gesetze-im-internet](https://www.gesetze-im-internet.de/ustg_1980/__14.html)); Übergangsfristen
  laufen bis Ende 2027 (§ 27 Abs. 38 UStG).
- Der **Hybrid ZUGFeRD/Factur-X** (PDF/A-3 mit eingebetteter XML) war die Brücke für alte Empfänger;
  aktuell ZUGFeRD 2.4 / Factur-X 1.08 ([FeRD](https://www.ferd-net.de/en/downloads/publications/details/zugferd-24-english)).
- Österreich verlangt strukturierte E-Rechnungen an den Bund seit 01.01.2014
  ([USP](https://www.usp.gv.at/themen/steuern-finanzen/umsatzsteuer-ueberblick/weitere-informationen-zur-umsatzsteuer/vorsteuerabzug-und-rechnung/e-rechnung-an-die-oeffentliche-verwaltung.html));
  EU-weit gilt EN 16931 für innergemeinschaftliche B2B-Umsätze ab 01.07.2030 (ViDA,
  [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32025L0516)).
- **Lehren für html-Pro:** (1) Rechtlich zählen **strukturierte Daten**, die Darstellung ist eine
  Sicht darauf. (2) Akzeptanz kam über eine **europäische Norm** und Behördenlisten, nicht über
  Produktqualität. (3) Ein **Hybrid** (PDF/A-3 mit eingebettetem Container) überbrückt den Übergang.
  (4) Übergangsfristen von 3–5 Jahren sind üblich.

### 5.9 Bewertung Vertrauen und Recht

| Baustein | Eignung für html-Pro |
|---|---|
| ASiC-E mit XAdES Baseline (B-LT/B-LTA) | **trägt** (passendes, anerkanntes, prüfbares Containerformat) |
| JAdES | teilweise (passt zu JSON-Manifest; ASiC-mit-JAdES nicht spezifiziert, RTR nennt es nicht) |
| PAdES | teilweise (nur für den PDF-Export) |
| Qualifizierte Zeitstempel, LTV, TR-ESOR/ASiC-AIP | **trägt** |
| C2PA 2.4 | teilweise (Herkunft und KI-Kennzeichnung, keine Unterschrift) |
| PDF/A als Archivziel | **trägt** (als Exportpfad, nicht als Format) |
| WARC/WACZ als Archivziel | teilweise |
| Gerichtsverkehr DE/AT mit nativem html-Pro | ungeeignet (PDF-Export Pflicht) |

---

## 6. Papiersimulation: Paged.js, Vivliostyle, WeasyPrint, Prince, Typst, LaTeX

Diese Werkzeuge sind **keine Lösung** für html-Pro, denn sie bauen Seiten nach. Sie sind aber die
Kandidaten für den **Exportpfad html-Pro → PDF** (Archiv, Druck, Behördenversand).

**Grundlage CSS Paged Media:** Die Kernspezifikation ist seit 2023 Working Draft
([css-page-3](https://www.w3.org/TR/css-page-3/)), GCPM seit 01/2024 Working Draft
([css-gcpm-3](https://www.w3.org/TR/css-gcpm-3/)). Seitenrand-Boxen (`@top-center` usw.) kann nur
Chrome ab 131 ([Chrome](https://developer.chrome.com/blog/print-margins)). Fußnoten, laufende
Kopfzeilen mit Kapitelnamen und Seitenverweise gibt es nur über Polyfills oder eigene Engines.
Chromium erzeugt beim Speichern als PDF seit Version 85 Tagged PDF
([Chromium-Blog](https://blog.chromium.org/2020/07/using-chrome-to-generate-more.html)); wie gut
das gegen PDF/UA validiert, ist nicht belegt (**OFFENE FRAGE**).

| Werkzeug | Wer / Lizenz | Stand (geprüft 11.10.2026) | Stärken | Schwächen | Eignung als Exportpfad |
|---|---|---|---|---|---|
| **WeasyPrint** | Kozea/CourtBouillon, BSD-3 | v70.0 vom 08.09.2026 ([Releases](https://github.com/Kozea/WeasyPrint/releases)) | PDF/A-1…4, **PDF/UA-1 und -2**, PDF/X ([Doku](https://doc.courtbouillon.org/weasyprint/stable/api_reference.html)); deterministisch | kein JavaScript; eigene Layout-Engine weicht vom Browser ab; PDF/UA-Validität „not guaranteed“ (ebd.) | **trägt** (mit Validator) |
| **Paged.js** | Coko-Umfeld, MIT | letztes stabiles npm-Release 0.4.3 von 07/2023; Coko-Finanzierung beendet, „2.0“ angekündigt ([Blog](https://pagedjs.org/posts/en/a-new-chapter-in-paged.js-life/)) | läuft im Browser, ideal als Druckvorschau im Reader | Release-Stillstand, Tagging hängt an Chromium | teilweise |
| **Vivliostyle** | Vivliostyle, AGPL-3.0 | CLI v11.3.3 vom 12.09.2026 ([Releases](https://github.com/vivliostyle/vivliostyle-cli/releases)) | Press-Ready/CMYK, PDF + EPUB | AGPL; PDF/UA nicht belegt | teilweise |
| **Prince** | YesLogic, proprietär | Prince 17 von 09/2026 ([Releases](https://www.princexml.com/releases/)) | PDF/UA-1 + PDF/A kombinierbar, JavaScript ([Doku](https://www.princexml.com/doc/prince-output/)) | ab 495 USD Desktop, Server ab 3.800 USD ([Preise](https://www.princexml.com/purchase/)); kein PDF/UA-2 belegt | teilweise (optional) |
| **Typst** | Typst GmbH Berlin, Apache-2.0 | v0.15.1 vom 17.07.2026 ([Releases](https://github.com/typst/typst/releases)) | Tagged PDF standardmäßig, PDF/UA-1, PDF/A ([Doku](https://typst.app/docs/reference/pdf/)) | eigene Sprache; HTML-Export „experimental“, ohne CSS ([Doku](https://typst.app/docs/reference/html/)) | teilweise; **Vorbild** |
| **LaTeX** | LaTeX Project, LPPL | Tagging gilt seit 11/2025 als produktionsreif für unterstützte Pakete ([LaTeX News 42](https://latex-project.org/news/2025/11/11/issue42-of-latex2e-released/)); arXiv bietet seit 12/2023 HTML über LaTeXML, weiterhin „experimental“ ([arXiv](https://blog.arxiv.org/2023/12/21/accessibility-update-arxiv-now-offers-papers-in-html-format/)) | stärkster Weg zu barrierefreier Mathematik | HTML nur als verlustbehaftetes Konvertierungsziel | Export ungeeignet; Import teilweise |

**Abgrenzung:** Alle sechs denken in Seiten. Sie zeigen, dass HTML+CSS für Druck taugt (Hachette
setzte laut BFO schon 2013 rund 40 % seiner US-Bücher mit HTML+CSS über Prince,
[BFO, PDF Days 2025](https://bfo.com/misc/2025-pdf-days-berlin-presentation/presentation-pdf1.pdf)),
aber nicht, wie ein Dokument ohne Seiten aussehen soll. Typst ist das beste Vorbild für „ein
Quelltext, mehrere Ausgaben, Barrierefreiheit als Standard“.

---

## 7. Interaktive Dokumentprodukte

| Produkt | Was / wer | Übertragbar auf html-Pro | Nicht übertragbar | Eignung |
|---|---|---|---|---|
| **H5P** | interaktive HTML5-Inhalte, >60 Inhaltstypen; H5P Group, seit 07/2024 D2L ([D2L](https://d2l.com/en-apac/newsroom/d2l-acquires-global-saas-learning-solution-h5p-group)) | `.h5p` = ZIP + `h5p.json` mit Titel, Sprache, Abhängigkeiten, Lizenz, Autoren, Änderungsprotokoll; Trennung Inhalt (`content.json`) / Code (Bibliotheken) / Schema (`semantics.json`), aus dem ein Editor Formulare baut ([Spezifikation](https://h5p.org/documentation/developers/h5p-specification)) | Sicherheitsmodell setzt auf vertrauenswürdige Administratoren statt technischer Sandbox ([H5P](https://h5p.org/node/16)); Beispiel CVE-2025-7062, XSS über hochgeladene Pakete ([NVD](https://nvd.nist.gov/vuln/detail/CVE-2025-7062)); Lizenz uneindeutig (Website MIT, Kernbibliothek GPL-3.0; **OFFENE FRAGE**) | Format **trägt** als Vorbild, Sicherheit ungeeignet |
| **Quarto** | Posit, MIT, v1.10.19 vom 06.10.2026 | ein Quelltext → HTML, PDF (LaTeX oder Typst), DOCX, EPUB, JATS; `embed-resources` für Ein-Datei-HTML ([Quarto](https://quarto.org/docs/output-formats/html-publishing.html)) | Build-Werkzeug, kein Reader; Mathe-Bibliotheken werden standardmäßig nicht eingebettet | teilweise (Pipeline-Vorbild) |
| **Observable Notebooks 2.0** | Observable, ISC; Notebook Kit 2.7.0 vom 09.10.2026 | Dateiformat ist lesbares HTML: `<notebook>` mit einem `<script type=…>` pro Zelle ([Kit-Doku](https://github.com/observablehq/notebook-kit/blob/main/docs/kit.html)); reaktiver Zellgraph; Desktop-Editor mit iframe-Sandbox | Technology Preview; Desktop nur macOS mit Konto | trägt (als Vorbild für Daten- und Formelblöcke) |
| **Jupyter** | BSD-3 | MIME-Bundles (eine Ausgabe in mehreren Darstellungen) ([nbformat](https://nbformat.readthedocs.io/en/latest/format_description.html)); Trust-Modell: „Untrusted Javascript is never executed“ ([Jupyter Security](https://jupyter-server.readthedocs.io/en/latest/operators/security.html)) | JSON statt lesbarem Dokument, Kernel nötig | trägt (Trust-Modell, Fallbacks) |
| **MyST / Jupyter Book 2** | MIT | formatneutraler Dokument-AST als kanonisches Inhaltsmodell ([MyST](https://mystmd.org/guide)) | Wissenschaftsfokus | trägt (als Vorbild für Inhaltsmodell) |
| **Shorthand** | Shorthand Pty Ltd | ZIP-Export als reines Client-Side-HTML/CSS/JS ([Support](https://support.shorthand.com/en/articles/15203575-export-and-self-host-process)) | proprietärer Editor; absolute URLs beim Export eingebrannt | teilweise |
| **Ceros** | Ceros Inc. | Gestaltungs-UX (freie Fläche, Verhalten pro Element) ([Ceros](https://www.ceros.com/)) | offline nur über proprietäres Format; Export-Hilfeseite liefert HTTP 404 (**OFFENE FRAGE**) | ungeeignet (Format) |
| **Notion / Coda** | Cloud-Dokumente | Bedarfsbeleg: Exporte als HTML/PDF/Markdown verlieren Datenbankansichten, Formulare, Formeln ([Notion](https://www.notion.com/help/export-your-content)) | Cloud-gebunden | ungeeignet |
| **Distill / Idyll** | akademisch | Distill pausiert seit 2021, u. a. wegen „50+ hours per article“ ([Distill](https://distill.pub/2021/distill-hiatus/)); Idyll seit 2023 inaktiv | – | Lehre: **der Editor ist der Engpass, nicht das Format** |

---

## 8. Readium und das EPUB-Reader-Ökosystem

**Was / wer:** Die Readium Foundation und EDRLab (Paris) entwickeln offene Lese-Toolkits:
Readium Mobile (Swift/Kotlin), Readium Web (TypeScript), Readium Desktop (Electron, Basis von
Thorium), alle BSD-3 ([Readium-Projekte](https://readium.org/development/projects)). Aktuelle
Releases: Swift Toolkit 3.11.0 (07/2026), Kotlin Toolkit 3.4.0 (09/2026), ts-toolkit (10/2026),
Thorium 3.5.1 (09/2026); Daten per GitHub-API geprüft (Notiz A, Abschnitt 4.1).

**Warum EPUB-Reader so oft schlecht wirken (belegte Ursachen):**

1. **Paginierung per CSS-Mehrspaltenlayout als Notlösung:** EDRLab: „we are obliged to use CSS
   multi-columns, the only technology available on all browser engines, but somewhat flawed“
   ([EDRLab 2018](https://www.edrlab.org/?p=9768)).
2. **Zersplitterung und fehlender Anreiz:** Nur 5 von 14 Reader-Herstellern setzen alle
   EPUB-Spezifikationen um, Hauptgrund „lack of ROI“
   ([W3C-Umfrage 2020](https://www.w3.org/blog/2020/publishingw3c-epub-survey-results)).
3. **Veraltete Engines:** Kobo rendert normales EPUB mit Adobe RMSDK. Eine einzige CSS-Zeile mit
   `min()` verhinderte 2026 das Öffnen eines EPUBs, das epubcheck bestand
   ([drweb.de, 16.06.2026](https://www.drweb.de/gueltiges-epub-das-kobo-trotzdem-nicht-oeffnet/));
   RMSDK verwirft das ganze Stylesheet bei `calc()`, `min()`, `var()` u. a.
   ([kobofix](https://pypi.org/project/kobofix/)).
4. **Reader überschreiben Autoren-CSS** ([Readium CSS](https://readium.org/css/docs/CSS24-eprdctn_requests.html)).
5. **Scripting abgeschaltet oder inkonsistent** (siehe Abschnitt 1).
6. **Barrierefreiheit uneinheitlich:** In den Basistests von epubtest.org erreichen Thorium,
   EasyReader und Colibrio 100 %, Adobe Digital Editions auf Android 6,67 %
   ([epubtest.org](https://epubtest.org/results)); Prüfdaten der Einzelergebnisse sind nicht
   angegeben (**OFFENE FRAGE**).

**Was das für einen eigenen Reader heißt:**

- **Nicht paginieren.** Scrollen und responsives Layout sind der Normalfall; Seiten nur für
  Druck und Export.
- **Einen verbindlichen Referenz-Reader** mitliefern. Ein Format ist nur so gut wie der
  schwächste verbreitete Reader (Kobo-Fall).
- **Scripting nur in harter Sandbox** (eigene Origin, CSP, keine Node- oder Electron-Brücke); die
  Thorium-Lücke von 2025 zeigt das Risiko.
- **Wiederverwenden:** Readium-Toolkits für Navigation, Locator- und Annotationsmodell, TTS;
  Readium CSS als Erfahrungsschatz für Nutzereinstellungen; epubtest.org als Vorbild für eine
  öffentliche Konformitäts-Testsuite.

| Baustein | Eignung |
|---|---|
| Readium Mobile (Swift/Kotlin) | **trägt** (als Baustein, muss angepasst werden) |
| Readium Web (ts-toolkit) | teilweise (auf EPUB-Paginierung ausgerichtet) |
| Readium CSS | teilweise (Nutzereinstellungen ja, Multicolumn-Paginierung nein) |
| Readium Web Publication Manifest | teilweise (JSON-Manifest-Vorlage) |
| Thorium Reader | teilweise (Referenz für barrierefreien Desktop-Reader; Electron-Risiko) |
| Apple Books, Google Play Books, Kobo als Zielplattform | ungeeignet |

---

## 9. Weitere Kandidaten zur Grundsatzfrage „Ist HTML die richtige Basis?“

| Kandidat | Befund | Eignung |
|---|---|---|
| **W3C Web Publications** | 2019 eingestellt: „Due to the lack of practical business cases … and the consequent lack of commitment to implement the technology“ ([W3C](https://www.w3.org/TR/wpub/)) | gescheitert; **Warnung** |
| **W3C Publication Manifest** | JSON-Manifest, Recommendation seit 10.11.2020, genutzt von Audiobooks ([W3C](https://www.w3.org/TR/pub-manifest/)) | teilweise (direkt wiederverwendbar) |
| **„Portable EPUBs“** (Will Crichton, 01/2024) | Vorschlag, PDF durch EPUB mit HTML-Teilmenge zu ersetzen: keine externen Assets, „structure over scripts“, Web Components mit Pflicht-Fallback ohne JS, Blocknummern statt Seitenzahlen, Web Annotations ([Crichton](https://willcrichton.net/notes/portable-epubs/)); Fortführung nach 2024 offen (**OFFENE FRAGE**) | trägt (als Konzept, fast deckungsgleich mit html-Pro) |
| **ODF 1.4** | OASIS-Standard seit 06.10.2025 ([OASIS](https://groups.oasis-open.org/discussion/opendocument-v14-approved-as-an-oasis-standard-1)); ZIP + Manifest + Signaturablage in `META-INF` | teilweise (Vorbild Paketstruktur); seitenorientiert |
| **OOXML** (ECMA-376) | seitenorientiert, komplex ([Ecma](https://ecma-international.org/publications-and-standards/standards/ecma-376/)) | ungeeignet (Import/Export-Ziel) |
| **OpenXPS** (ECMA-388) | technisch solider PDF-Konkurrent; XPS Viewer seit Windows 10 1803 nur noch optional ([Microsoft](https://learn.microsoft.com/en-us/windows/whats-new/removed-features)) | ungeeignet; **Lehre: Technik allein setzt sich nicht durch** |
| **Microsoft Loop / Google `.gdoc`** | Zeiger auf Cloud-Zustand; `.loop`-Dateien lassen sich heruntergeladen nicht öffnen ([Microsoft](https://learn.microsoft.com/en-us/microsoft-365/loop/loop-components-teams)) | ungeeignet |
| **Markdown / CommonMark** | gutes Autorenformat, aber kein Layout, viele Dialekte ([CommonMark](https://spec.commonmark.org/)) | teilweise (Quellformat) |
| **Local-first / Automerge** | sieben Ideale u. a. „The network is optional“, „The Long Now“ ([Ink & Switch](https://www.inkandswitch.com/essay/local-first/)); Automerge als CRDT mit vollständiger Historie ([automerge.org](https://automerge.org/)) | trägt (als Prinzip für Offline-Zusammenarbeit) |
| **DjVu** | Scanformat, letzte News 2013 ([djvu.org](https://djvu.org/)) | ungeeignet |

**Die Gegenposition der PDF-Industrie** (Mike Bremford, CTO von BFO und Mitglied der CSS WG,
PDF Days 09/2025, [Folien](https://bfo.com/misc/2025-pdf-days-berlin-presentation/presentation-pdf1.pdf)):

- Bei der Rechnung spricht für PDF: in sich geschlossen, beim Kunden archivierbar,
  „Authenticity from digital signatures“; gegen HTML-Portale: „In ten years time, data is 404“.
  Antwort der Folie: „it depends!“
- „HTML+CSS is the most battle-tested document format in history.“ PDF-Reflow laufe am
  naheliegendsten über eine Umwandlung nach HTML; PDF/UA bringe einen schon „half-way“.
- Grafik, Farbe und Schrift sind zwischen CSS und PDF weitgehend abbildbar. Lücken: CMYK und
  Sonderfarben (DeviceN) gibt es nur in PDF bzw. Print-Engines, `device-cmyk` ist in Browsern nicht
  implementiert.
- Barrierefreiheit: „typical HTML > typical PDF“, aber „good PDF ≥ good HTML“. HTML ist immer
  strukturiert, aber voller nicht-semantischer `<div>`s; CSS-Hintergrundbilder sind unsichtbar für
  Hilfstechnik, während in PDF jedes Element als Inhalt oder Artefakt klassifiziert werden muss.
- Formulare: „Dynamic fields are probably the biggest capability gap between HTML and PDF“, wobei
  HTML hier bei Feldtypen (Datum, Farbe, Datei) mehr kann, PDF dagegen ein eigenes Signaturfeld hat.
- **Signaturen:** „A PDF file is a fixed, self-contained thing so it can be digitally signed. HTML
  is a dynamic collection of many resources from different sources. Zip them and sign the zip?
  It's not the same.“ Das ist der Kern des Problems, den html-Pro lösen muss (siehe
  [`03-konzept.md`](03-konzept.md)).

---

## 10. Fazit: Ist HTML die richtige Basis?

**Ja, als Inhaltsschicht – aber nicht als loses HTML und nicht ohne eigenen Reader.**

1. **Keine Alternative bietet responsives Layout, Interaktivität und breite Rendering-Basis
   zugleich.** OOXML, ODF, OpenXPS, Typst und DjVu denken in Seiten; Markdown hat kein Layout;
   Cloud-Formate (Loop, `.gdoc`, Notion) sind keine Dateien. HTML+CSS ist laut BFO „the most
   battle-tested document format in history“.
2. **Der Container entscheidet, nicht die Inhaltssprache.** Die passenden Bausteine sind
   standardisiert: OCF/EPUB-Container, ASiC-E für Signaturen, Zeitstempel und Bewahrung,
   EPUB-Accessibility-Metadaten, Publication Manifest bzw. H5P-artiges JSON-Manifest, C2PA für
   Herkunft. Ein ZIP-Container, der zugleich EPUB- und ASiC-E-kompatibel ist, nutzt all das.
3. **Web-native Ein-Datei-Formate sind gescheitert.** Web Bundles, SXG und Web Publications
   scheiterten an fehlenden Implementierern, nicht an der Technik. Ein normaler Browser prüft 2026
   keine Dokumentsignatur. html-Pro braucht deshalb einen **eigenen Referenz-Reader**.
4. **CBOR/JSON-Manifest und WASM-Renderer** (in der Auftragsfrage genannt): JSON ist als Manifest
   naheliegend und standardnah (Publication Manifest, H5P, JAdES). Für CBOR spricht nur die
   Kompaktheit; es wäre ein Bruch mit den lesbaren Vorbildern und mit XAdES/ASiC. Ein eigener
   WASM-Renderer würde das stärkste Argument für HTML wegwerfen (vorhandene, barrierefreie
   Browser-Engines); WASM ist eher für Sandboxing von Dokument-Code sinnvoll, wie pdf.js es für
   PDF-JavaScript mit QuickJS tut ([Mozilla Hacks](https://hacks.mozilla.org/2021/10/implementing-form-filling-and-accessibility-in-the-firefox-pdf-viewer/)).
   Eine belastbare Bewertung eines eigenen WASM-Renderers wurde in der Recherche nicht gefunden
   (**OFFENE FRAGE**).
5. **Die Schwächen der Idee, ausdrücklich:**
   - **WYSIWYS:** Responsivität und Interaktivität schwächen den Beweiswert einer Signatur, solange
     kein strenges, signiertes Darstellungsprofil existiert.
   - **Behörden und Gerichte** verlangen PDF; in Deutschland sind Container-Signaturen bei Gericht
     sogar unzulässig. Ein PDF-Export bleibt auf Jahre Pflicht.
   - **Archive** akzeptieren HTML nur eingeschränkt.
   - **Barrierefreiheit** ist in der HTML-Praxis genauso schlecht wie in PDF; der Vorteil entsteht
     nur durch einen Editor, der Struktur erzwingt.
   - **Sicherheit:** Interaktive Dokumente sind Angriffsfläche (Thorium-RCE 2025, Leuven-Studie,
     H5P-XSS). 23 % der HTML-Mailanhänge waren laut Barracuda im Februar 2025 bösartig
     ([Barracuda](https://www.barracuda.com/company/news/2025/barracuda-finds-html-email-attachments-malicious)).
     Ein Dokumentformat, das wie eine HTML-Datei aussieht, erbt dieses Misstrauen.
   - **Adoption:** XPS, Web Publications und Distill zeigen, dass gute Technik ohne Implementierer,
     Normung und Anreize scheitert. Das ist das größte Risiko des Projekts.

Wie aus diesen Befunden ein Format und eine Architektur werden, beschreibt
[`03-konzept.md`](03-konzept.md).

---

## Offene Fragen (gesammelt)

Die vollständigen Listen stehen am Ende der Notizen A–D. Die für Phase 2 wichtigsten:

| # | Frage | Warum wichtig |
|---|---|---|
| 1 | Darf ein ASiC-E-mit-XAdES-Container einen eigenen Mime-Typ tragen und dennoch Baseline-konform sein? (EN 319 162-1, Abschnitt 4.4.3.1 nicht extrahierbar) | entscheidet, ob html-Pro zugleich EPUB- und ASiC-konform sein kann |
| 2 | Was ist bei einem empfangenen responsiven Beleg das „Bild“ nach § 147 Abs. 2 AO? | Aufbewahrung in DE |
| 3 | Gibt es Rechtsprechung zu signierten dynamischen HTML-Dokumenten (WYSIWYS)? | Beweiswert |
| 4 | Welche Beilagenformate erlaubt die ERV-Schnittstellenbeschreibung in AT? Wortlaut ERVB 2025 (DE)? | Justiz-Export |
| 5 | Bietet A-Trust/ID Austria eine offene CSC-Fernsignatur-API? Wann kann die EUDI-Wallet in DE/AT QES? | Signieren im Produkt |
| 6 | Ist ein html-Pro-Dokument nach EN 301 549 Kapitel 9 oder 10 zu prüfen? Fällt es unter „Dateiformate von Büro-Anwendungen“? | Barrierefreiheitsnachweis |
| 7 | Wie gut validiert Chromium-Tagged-PDF gegen PDF/UA? Wie weit weicht WeasyPrint bei Grid/Flex vom Browser ab? | Exportpfad |
| 8 | Lässt sich ein HTML/ZIP-Polyglot signieren, ohne die Polyglot-Eigenschaft zu brechen? | Rückfallebene ohne Reader |
| 9 | Liquid Mode auf dem Desktop 2026? Serverstandort und DSGVO-Grundlage? | Wettbewerb |
| 10 | Schweiz (ZertES, GeBüV, Art. 957a OR, Justitia 4.0) nicht recherchiert | DACH-Markt |
| 11 | Akzeptieren DNB und ÖNB HTML-Container als Ablieferung? Was sagt TR-ESOR Anlage F zu HTML? | Archiv |
| 12 | Ist ISO 22144 (Content Credentials) veröffentlicht? Kann eine C2PA-Signatur zugleich QES sein? | Herkunftsnachweis |
