# Recherche C: Papiersimulation, interaktive Dokumentprodukte, Alternativen zu HTML

**Projekt:** html-Pro · **Stand:** 11.10.2026 · **Teil der Recherchephase 1**, Zuarbeit für
`docs/01-stand-der-technik.md`.

**Methode:** Primärquellen, wo es ging: offizielle Websites, Spezifikationen, GitHub-Repos.
Release-Stände kommen direkt aus der GitHub-REST-API (`api.github.com/repos/<repo>/releases`)
bzw. den Registries von npm und PyPI, abgefragt am 11.10.2026. Jede Aussage hat eine Inline-URL.
Sekundärquellen sind als **(sekundär)** gekennzeichnet. Was nicht belegt ist, steht als
**OFFENE FRAGE** im Text und gesammelt am Ende.

**Bewertungsskala „Eignung für html-Pro“:** *trägt* / *teilweise* / *ungeeignet*. In Teil 1 heißt
das konkret: Eignung als **Exportpfad html-Pro → PDF**, nicht als Basis des Formats.

---

## Teil 1 – Papiersimulation (Abgrenzung, keine Lösung)

### 1.0 Grundlage: CSS Paged Media, CSS Fragmentation, CSS GCPM beim W3C

**Status der Spezifikationen** (Statuszeilen der TR-Seiten, abgerufen 11.10.2026):

| Spezifikation | Status | Datum | Quelle |
|---|---|---|---|
| CSS Paged Media Module Level 3 | Working Draft | 14.09.2023 | https://www.w3.org/TR/css-page-3/ |
| CSS Fragmentation Module Level 3 | Candidate Recommendation | 04.12.2018 | https://www.w3.org/TR/css-break-3/ |
| CSS Fragmentation Module Level 4 | First Public Working Draft | 18.12.2018 | https://www.w3.org/TR/css-break-4/ |
| CSS Generated Content for Paged Media (GCPM) | Working Draft | 25.01.2024 | https://www.w3.org/TR/css-gcpm-3/ |
| CSS Page Floats | First Public Working Draft | 15.09.2015 | https://www.w3.org/TR/css-page-floats-3/ |
| CSS Regions Level 1 | (TR-Stand) | 09.10.2014 | https://www.w3.org/TR/css-regions-1/ |

- GCPM sagt über sich selbst: „It is inappropriate to cite this document as other than work in
  progress“. Fußnoten-Layout und mehrspaltige Fußnoten sind noch offene Punkte
  (https://www.w3.org/TR/css-gcpm-3/).
- Die Kernspezifikation für Seiten (`@page`) ist seit 2023 nicht über den Working Draft
  hinausgekommen (https://www.w3.org/TR/css-page-3/). Für Druck ist Paged Media also **kein
  abgeschlossener Standard**.

**Browser-Unterstützung** (MDN browser-compat-data 8.1.5 vom 08.10.2026,
https://github.com/mdn/browser-compat-data, Paket `@mdn/browser-compat-data`):

- `@page` an sich: Chrome 2, Firefox 19, Safari 18.2.
- `@page`-**Seitenrandboxen** (`@top-center`, `@bottom-right` usw.): **nur Chrome ab 131**, Firefox
  und Safari: nein. Google beschreibt das Feature unter
  https://developer.chrome.com/blog/print-margins, Release-Hinweis:
  https://developer.chrome.com/blog/new-in-chrome-131.
- `size` in `@page`: Chrome 15, Firefox 95, Safari 18.2. `page-orientation`: Chrome 85,
  Firefox 122, Safari nein.
- `widows`/`orphans`: Chrome und Safari ja, **Firefox nein** (BCD; ebenso
  https://caniuse.com/css-widows-orphans).
- `break-before`/`break-inside`: alle drei Engines (BCD). caniuse meldet trotzdem nur
  Teilunterstützung, z. B. kein `avoid` bei `page-break-before/after` in Firefox und Safari
  (https://caniuse.com/css-page-break).
- CSS Regions: von keinem aktuellen Browser unterstützt (https://caniuse.com/css-regions).
- Typische GCPM-Features wie `string-set`, `target-counter()`, `leader()` und Fußnoten
  (`float: footnote`) führt MDN BCD **gar nicht**. **OFFENE FRAGE:** ob irgendeine Browser-Engine
  sie implementiert. Nach allem, was die Polyfills zeigen (siehe Paged.js), eher nicht. Sauber
  belegt ist das hier nicht.
- **Tagged PDF aus Chromium:** Puppeteer hat bei `page.pdf()` die Option `tagged`, Default `true`,
  als „Experimental“ markiert („Generate tagged (accessible) PDF“), dazu `outline`, Default
  `false` (https://pptr.dev/api/puppeteer.pdfoptions). **OFFENE FRAGE:** wie gut dieses Tagging
  gegen PDF/UA validiert. Dazu gibt es keinen Prüfbericht.

**Folgerung für html-Pro:** Seitenumbruch-Steuerung in Browsern ist brauchbar. Professionelle
Druckfeatures wie laufende Kopfzeilen mit Kapitelnamen, Querverweise auf Seitenzahlen und
Fußnoten gibt es aber nur über Polyfills (Paged.js, Vivliostyle) oder eigene Engines (WeasyPrint,
Prince). Ein Exportpfad html-Pro → PDF braucht also eine dieser Engines oder Chromium plus
Polyfill.

---

### 1.1 Paged.js

- **Was:** JavaScript-Bibliothek, Polyfill für CSS Paged Media und GCPM. Paginiert HTML im
  Browser, aus dem Ergebnis entstehen Druck-PDFs. Bestandteile: Chunker, Polisher, Modul-System
  (https://github.com/pagedjs/pagedjs; https://pagedjs.org/).
- **Wer:** „Founded by Adam Hyde and maintained by Julien Taquet, Fred Chasen and Gijs de Heij“
  (https://pagedjs.org/). Lange von der Coko Foundation getragen. Laut Projekt-Blog vom
  17.05.2025 ist die finanzielle Unterstützung durch Coko **beendet**. Gijs de Heij kommt als
  Core-Maintainer hinzu, Fred Chasen arbeitet Vollzeit bei Mozilla. Zwei NGI-Zero-Förderungen
  laufen: (1) CSS-Print-Spezifikationen zusammen mit WeasyPrint, (2) Modernisierung zu
  „Paged.js 2.0“: CSSTree wird durch CSSOM ersetzt, Seiten werden Web Components, mit Breaking
  Changes (https://pagedjs.org/posts/en/a-new-chapter-in-paged.js-life/).
- **Reifegrad / Release-Stand:**
  - Keine GitHub-Releases (https://github.com/pagedjs/pagedjs/releases, „There aren't any
    releases here“). Letzter Push ins Repo am 06.10.2026 (GitHub-API).
  - npm: `latest` = **0.4.3 vom 06.07.2023**, `beta` = **0.5.0-beta.2 vom 04.10.2024**
    (https://registry.npmjs.org/pagedjs). Ein stabiles Release gibt es also seit über drei Jahren
    nicht.
  - **OFFENE FRAGE:** Status und Zeitplan von „Paged.js 2.0“. Seit dem Blogpost vom Mai 2025
    wurde kein Release gefunden.
- **Lizenz:** MIT (GitHub-API; npm-Metadaten).
- **CLI:** `pagedjs-cli` 0.4.3 hängt von `puppeteer` ^20.9.0 und `pdf-lib` ab
  (https://registry.npmjs.org/pagedjs-cli/latest). Die PDF-Erzeugung läuft also über Chromium.
- **Stärken:** läuft in jedem Browser und kann daher als **Druckvorschau im Reader** dienen. Setzt
  GCPM-Features um, die Browser nicht haben. Offen lizenziert.
- **Schwächen:** Release-Stillstand seit 2023, Finanzierung im Umbruch. Performance und Robustheit
  bei großen Dokumenten nicht belegt (**OFFENE FRAGE**). Ein Downstream-Ticket bei XWiki meldet beim
  0.5-Beta Konflikte mit Prototype.js und abgeschnittene Bilder am Seitenende **(sekundär,
  Suchergebnis:**
  https://lists.xwiki.org/hyperkitty/list/notifications@xwiki.org/message/JFW7HSJEYKYLROGICDOIGOIWBUHKFTDI/attachment/1/attachment.html**)**.
- **Eignung html-Pro → PDF: teilweise.** Gut für eine clientseitige „Druckansicht“ im Reader ohne
  Server. Als Hauptexportpfad mit PDF/UA-Anspruch zu riskant, weil die Tagging-Qualität an
  Chromium hängt und die Wartung unsicher ist.

### 1.2 Vivliostyle (Viewer, CLI, Core) – Japan

- **Was:** „an open source project for a new typesetting system fitting for digital and web
  publishing based on the latest web standard technology“. Produkte: Vivliostyle Viewer
  (Satzergebnis im Browser), Vivliostyle CLI (HTML → PDF), Vivliostyle Pub (Markdown-Editor,
  Alpha), Vivliostyle Core (Satz-Engine), Vivliostyle Print (https://vivliostyle.org/).
- **Wer:** Vivliostyle Inc. wurde im August 2014 von Shinyu Murakami gegründet, früher
  Lead-Entwickler des Antenna House Formatter **(sekundär:**
  https://internet.watch.impress.co.jp/docs/news/736439.html**)**. Murakami tritt heute mit
  Adresse `@vivliostyle.org` für die Vivliostyle Foundation in W3C-Listen auf
  (https://lists.w3.org/Archives/Public/public-cssprint/2022Nov/0003.html). NLnet fördert
  (https://nlnet.nl/project/Vivliostyle/). **OFFENE FRAGE:** Rechtsform und Finanzierung der
  Foundation heute.
- **Release-Stand** (GitHub-API):
  - `vivliostyle.js` (Core/Viewer) **v2.45.2 vom 23.09.2026**.
  - `vivliostyle-cli` **v11.3.3 vom 12.09.2026** (https://github.com/vivliostyle/vivliostyle-cli/releases).
  - Aktive Entwicklung, letzter Push 11.10.2026.
- **Lizenz:** **AGPL-3.0** für CLI und vivliostyle.js (GitHub-API; npm `@vivliostyle/cli`,
  `@vivliostyle/viewer`). Das zählt für html-Pro: Wer den Viewer in einen eigenen, über das Netz
  angebotenen Reader einbettet, muss mit den AGPL-Pflichten umgehen.
- **Technik:** Die CLI nutzt `puppeteer-core` und `pdf-lib`
  (https://github.com/vivliostyle/vivliostyle-cli/blob/main/package.json). Ausgabeformate `pdf`,
  `epub`, `webpub`. Druckvorstufe über `pdfPostprocess.preflight: "press-ready"` und
  CMYK-Konvertierung
  (https://github.com/vivliostyle/vivliostyle-cli/blob/main/docs/config.md). Seit v11.3.0 gibt es
  Theme-Erstellung und -Validierung (https://github.com/vivliostyle/vivliostyle-cli/releases).
- **Stärken:** gute Unterstützung für japanischen Satz (vertikal, Ruby; **OFFENE FRAGE**: hier nicht
  im Detail geprüft). Druckvorstufe mit Press-Ready/CMYK. Erzeugt neben PDF auch EPUB und
  WebPub.
- **Schwächen:** AGPL. Zu PDF/UA oder Tagged PDF gibt es keine eigene Aussage, es zählt nur, was
  Chromium liefert (**OFFENE FRAGE**). Vergleichsweise kleine Community (236 Stars bei der CLI,
  796 bei vivliostyle.js; GitHub-API).
- **Eignung html-Pro → PDF: teilweise.** Technisch der stärkste offene Browser-basierte
  Seitensatz. Lizenz und PDF/UA-Lücke sprechen gegen ihn als Standard-Exportpfad. Als
  Druckvorstufen-Option (CMYK, PDF/X über press-ready) interessant.

### 1.3 WeasyPrint (CourtBouillon / Kozea, Python)

- **Was:** „a visual rendering engine for HTML and CSS that can export to PDF“, **eigene
  Layout-Engine in Python**, „not on a full rendering engine like WebKit or Gecko“
  (https://github.com/Kozea/WeasyPrint/blob/main/README.rst).
- **Wer:** entwickelt von Kozea, Support und Wartung durch CourtBouillon (README). Laufend von
  NLnet gefördert (Release-Notes v65, v66, v70).
- **Release-Stand** (GitHub-API, https://github.com/Kozea/WeasyPrint/releases):
  - **v70.0 vom 08.09.2026**, v69.0 vom 02.06.2026, v68.0 vom 19.01.2026, v67.0 vom 02.12.2025.
  - v66.0 (24.07.2025): „Improve PDF/UA support, with financial support from NLnet“.
  - v67.0: „Support PDF/A-1a, PDF/A-2a and PDF/A-3a“ und „Support PDF/A-4e and PDF/A-4f“.
  - v69.0: „Add year in PDF/UA-2 metadata“, „Add namespace to Document tag in PDF 2“.
  - v70.0: „initial support of CSS Notes“ (Fußnoten), mit NLnet-Förderung.
  - PyPI: 70.0 (https://pypi.org/pypi/weasyprint/json).
- **Lizenz:** BSD-3-Clause (GitHub-API; README „Free software: BSD license“).
- **PDF-Varianten** (Doku 70.0, https://doc.courtbouillon.org/weasyprint/stable/api_reference.html):
  - PDF/A-1b, 2b, 3b, 2u, 3u, 4u, 1a, 2a, 3a, 4e, 4f
  - **PDF/UA-1, PDF/UA-2**
  - PDF/X-1a, X-3, X-4, X-5g
  - Option `--pdf-tags`.
  - **Wichtiger Vorbehalt** im Wortlaut: „The generation of PDF/A and PDF/UA documents is
    supported. However, the generated documents are not guaranteed to be valid, and users have
    the responsibility to check that they follow the rules listed by the related
    specifications.“ (ebd. und
    https://github.com/Kozea/WeasyPrint/blob/main/docs/api_reference.rst).
- **Kein JavaScript:** „there is no user-interaction, no JavaScript, no live rendering“
  (https://github.com/Kozea/WeasyPrint/blob/main/docs/going_further.rst).
- **Sicherheit:** v68.0, v69.0 und v70.0 sind ausdrücklich Sicherheitsupdates (CVE-2025-68616,
  CVE-2026-49452, CVE-2026-55073; Release-Notes). Wer fremdes HTML serverseitig rendert, muss
  WeasyPrint daher aktuell halten.
- **Stärken:** freie Lizenz. Die breiteste offene PDF/A-, PDF/UA- und PDF/X-Abdeckung im
  HTML-Lager. Deterministisch, weil kein JS. Aktiv gepflegt.
- **Schwächen:**
  - Kein JS: interaktive oder per Skript erzeugte Inhalte von html-Pro müssen **vor** dem Export
    statisch gemacht werden (Snapshot des DOM).
  - Eigene Layout-Engine, daher weicht das CSS-Verhalten zwangsläufig vom Browser ab.
    **OFFENE FRAGE:** wie groß diese Abweichung bei Grid und Flex heute ist.
  - Validität von PDF/UA wird nicht garantiert.
- **Eignung html-Pro → PDF: trägt (mit Vorbehalt).** Bester offener Kandidat für einen
  serverseitigen oder lokal gebündelten PDF/A-/PDF/UA-Exportpfad. Voraussetzungen: (a) das
  html-Pro-Dokument lässt sich in statisches HTML/CSS „einfrieren“; (b) das Ergebnis wird mit
  einem Validator geprüft (veraPDF o. ä., **OFFENE FRAGE**: Validator-Wahl gehört in
  Recherche 01/PDF/UA).

### 1.4 Prince (YesLogic, kommerziell)

- **Was:** kommerzieller HTML/CSS-zu-PDF-Formatierer mit eigener Engine.
- **Release-Stand:** **Prince 17 im September 2026**, Prince 16 im Februar 2025, Prince 15 im
  November 2022 (https://www.princexml.com/releases/).
- Prince 17 bringt u. a. „Support for JavaScript ES6 classes“, „Proxy and Reflect APIs“,
  „Markdown documents as input files“, „fragmented CSS grid layout“, „CSS cascade layers“,
  „nested CSS“, „PDF/X-4p profile“ und Formularfeld-Einstellungen über
  `-prince-pdf-form-field-settings` (https://www.princexml.com/releases/17/).
- **PDF-Profile** (https://www.princexml.com/doc/prince-output/):
  - PDF/A-1a/1b/2a/2b/3a/3b
  - **PDF/UA-1**
  - PDF/X-1a:2001/2003, X-3:2002/2003, X-4, X-4p
  - Kombinationen PDF/A-{1,2,3}a + PDF/UA-1
  - „The PDF/A-[123]a profiles and the PDF/UA-1 profile require tagged PDF, and will
    automatically enable it.“
  - **PDF/UA-2 wird nicht genannt** (**OFFENE FRAGE**, ob geplant).
- **Lizenz / Preise** (https://www.princexml.com/purchase/):
  - Desktop 495 USD einmalig
  - Server ab 3.800 USD je Server (ab 5 Servern 2.660 USD je Server)
  - Academic Server 1.900 USD
  - Support-Verlängerung 950 USD pro Jahr (Server)
  - Cloud-Zugang über DocRaptor und EuroPDF
- Die Non-commercial-Lizenz erlaubt kostenlose Nutzung. Die PDFs tragen dann aber Hinweise auf die
  Software, die nicht entfernt werden dürfen (https://www.princexml.com/license/).
- **Stärken:** ausgereift, unterstützt JavaScript (im Gegensatz zu WeasyPrint), PDF/UA-1 und
  PDF/A gleichzeitig, Formularfelder im PDF.
- **Schwächen:** proprietär und kostenpflichtig. Kein PDF/UA-2 belegt. Für ein offenes
  Standardprojekt eine Abhängigkeit von einem einzelnen Anbieter.
- **Eignung html-Pro → PDF: teilweise.** Als optionaler „Enterprise-Exporter“ und als
  Qualitätsreferenz sinnvoll, als Pflichtbestandteil eines offenen Standards nicht.

### 1.5 Typst (Typst GmbH, Berlin, Rust)

- **Was / Wer:** Satzsprache und Compiler in Rust, dazu die kommerzielle Web-App typst.app.
  Typst GmbH, Berlin, gegründet 2023. Gründer: Martin Haug (CEO) und Laurenz Mädje (CTO)
  (https://typst.app/about/).
- **Lizenz:** Compiler Apache-2.0 (GitHub-API, https://github.com/typst/typst).
- **Release-Stand** (https://github.com/typst/typst/releases):
  - **v0.15.1 vom 17.07.2026**, v0.15.0 vom 15.06.2026
  - v0.14.2 vom 12.12.2025, v0.14.0 vom 24.10.2025, v0.13.0 vom 19.02.2025
- **PDF/A, PDF/UA** (https://typst.app/docs/reference/pdf/):
  - Seit 0.14 schreibt Typst **standardmäßig Tagged PDF** („By default, Typst will always write
    Tagged PDF“).
  - Unterstützt **PDF/UA-1** („only supports part one“) und PDF/A-1b/1a/2b/2u/2a/3b/3u/3a/4/4f/4e.
  - Bei Mathematik muss der Autor Alternativbeschreibungen für PDF/UA-1 selbst liefern.
  - PDF/UA-1 und PDF/A-4 lassen sich nicht kombinieren.
  - Seit 0.15 sind mehrere kompatible Standards gleichzeitig möglich, z. B. PDF/UA-1 + PDF/A-2a
    (https://typst.app/docs/changelog/0.15.0/).
- **HTML-Export:** **weiterhin experimentell** (Stand Doku Oktober 2026), im Wortlaut: „Typst's HTML
  export is currently under active development. The feature is still very incomplete and only
  available for experimentation behind a feature flag. Do not use this feature for production
  use cases.“ Aktivierung mit `--features html`. Typst gibt **kein CSS** aus („does not output CSS
  style sheets, instead focussing on semantic markup“) und erzeugt immer eine eigenständige
  HTML-Datei (https://typst.app/docs/reference/html/).
- Seit 0.15 schreibt der HTML-Export Gleichungen als **MathML**. Neuer **„Bundle“-Export**: ein
  Projekt erzeugt mehrere Ausgaben auf einmal, „any combination of HTML pages, PDFs, PNGs, SVGs,
  and arbitrary assets“ (https://typst.app/docs/changelog/0.15.0/).
- **Stärken:** schnell, modern, starke PDF-Zugänglichkeit (Tagged PDF als Default). Ein Quelltext
  liefert PDF und HTML. Freie Lizenz. Wird auch von Quarto als PDF-Backend genutzt (siehe 2.4).
- **Schwächen:** eigene Auszeichnungssprache, nicht HTML. Der HTML-Export ist nicht produktionsreif
  und liefert kein Layout-CSS. Kein PDF/UA-2.
- **Eignung für html-Pro:**
  - Als **Exportpfad html-Pro → PDF: teilweise**, dafür bräuchte es einen Konverter HTML → Typst
    (**OFFENE FRAGE**: ob es einen belastbaren gibt, z. B. über Pandoc).
  - Als **Vorbild: trägt.** Vorbildlich sind die Trennung von Semantik und Ausgabe, „Bundle“-Export
    und Tagged PDF als Standard.

### 1.6 LaTeX: Tagged-PDF-Projekt und HTML-Wege

**Tagged-PDF-Projekt des LaTeX Project Team**
- Repository/Hub: https://github.com/latex3/tagging-project (Lizenz LPPL-1.3c, keine Releases,
  aktiv: letzter Push 09.10.2026, GitHub-API). Projektseite: https://latex3.github.io/tagging-project/.
  Dort Beispieldokumente für WTPDF/PDF-UA-2 und PDF/UA-1. Die „Tagging Status pages“ erfassen
  „over 1800 contributed packages“.
- **LaTeX News 42** (Release 2025-11-01): Man geht weg davon, es eine „prototype solution“ zu
  nennen, „as by now it can be used in production workflows … as long as one restricts the
  documents to already-supported packages“. Seit Juni 2025 setzt `\DocumentMetadata` die
  Standard-PDF-Version auf **2.0**
  (https://mirrors.ctan.org/macros/latex/base/ltnews42.tex; Ankündigung
  https://latex-project.org/news/2025/11/11/issue42-of-latex2e-released/).
- **LaTeX News 43** (Release 2026-06-01): Die Tagging-Arbeit läuft weiter (Theoreme, Überschriften,
  Templates). „Fake math“ zur reinen Ausrichtung wird zurückgedrängt
  (https://mirrors.ctan.org/macros/latex/base/ltnews43.tex; https://www.latex-project.org/news/).
- Tagging bleibt **opt-in** über `\DocumentMetadata{… tagging=on}` **(sekundär,
  Suchzusammenfassung zu ltnews42; im Quelltext nicht wörtlich verifiziert → OFFENE FRAGE)**.
- Die LaTeX-Projektseite hebt hervor, dass mit PDF 2.0/PDF/UA-2 auch Mathematik wirklich
  zugänglich wird („PDF/UA-1 simply isn't designed for mathematics“,
  https://www.latex-project.org/news/).

**HTML aus LaTeX**
- **arXiv HTML** (ab 18.12.2023): HTML-Fassungen für alle ab 01.12.2023 eingereichten
  TeX/LaTeX-Papers, wenn die Konvertierung gelingt. Grundlage ist **LaTeXML** (NIST), in
  Zusammenarbeit mit dem LaTeX Project. Der Status heißt ausdrücklich „experimental“: Einreichungen
  werden bei fehlgeschlagener HTML-Konvertierung nicht aufgehalten
  (https://blog.arxiv.org/2023/12/21/accessibility-update-arxiv-now-offers-papers-in-html-format/).
  „Not every paper can be successfully converted“, der Bestand wird schrittweise nachkonvertiert
  (https://info.arxiv.org/about/accessible_HTML.html).
- **OFFENE FRAGE:** aktuelle Erfolgsquote der arXiv-HTML-Konvertierung. Ein Paper von 2026 behandelt
  „HTML Conversion and MathML 4“ (https://arxiv.org/pdf/2605.16562), Zahlen wurden hier nicht
  verifiziert.
- **LaTeXML:** Public Domain (NIST-Werk, CC0-äquivalent;
  https://github.com/brucemiller/LaTeXML/blob/master/LICENSE). Letztes Release **v0.8.8 vom
  26.02.2024**, Repo aktiv (Push 20.09.2026; GitHub-API).
- **tex4ht / make4ht:** LPPL 1.3. make4ht Version 0.4e vom 24.02.2026
  (https://ctan.org/pkg/make4ht; https://ctan.org/pkg/tex4ht).
- **Stärken:** riesiger Bestand an wissenschaftlichen Dokumenten. Der Weg zu PDF/UA-2 inkl.
  Mathematik (MathML-Integration) ist der fortschrittlichste aller hier betrachteten Systeme.
- **Schwächen:** HTML ist bei LaTeX ein Konvertierungsziel und kein Primärformat. Die Konvertierung
  bleibt verlustbehaftet (arXiv nennt es „experimental“). Tagging funktioniert nur mit
  unterstützten Paketen.
- **Eignung für html-Pro:**
  - Als **Exportpfad html-Pro → PDF: ungeeignet**, denn der Weg HTML → LaTeX ist nicht der
    Zweck.
  - Als **Importquelle LaTeX → html-Pro: teilweise**, über LaTeXML; arXiv beweist den Maßstab.
  - Als **Lehrstück: trägt.** Selbst mit enormem Aufwand bleibt die Konvertierung von
    Papier-Semantik in HTML unvollständig.

### 1.7 Zwischenfazit Teil 1

| System | Typ | Lizenz | PDF/UA | PDF/A | JS | Eignung als Exportpfad |
|---|---|---|---|---|---|---|
| Paged.js | Browser-Polyfill | MIT | nur via Chromium-Tagging | – | ja | teilweise (Druckvorschau) |
| Vivliostyle | Browser-Engine + CLI | AGPL-3.0 | nicht belegt | nicht belegt (press-ready/PDF/X) | ja | teilweise |
| WeasyPrint | eigene Engine (Python) | BSD-3 | UA-1, UA-2 (ohne Garantie) | 1–4 | nein | **trägt** (mit Validierung) |
| Prince | eigene Engine | proprietär | UA-1 | 1–3 | ja | teilweise (optional) |
| Typst | eigene Sprache | Apache-2.0 | UA-1 (Default-Tagging) | 1–4 | – | teilweise / Vorbild |
| LaTeX | eigene Sprache | LPPL | UA-1/UA-2 (opt-in) | ja | – | ungeeignet (als Import teilweise) |

Quellen: siehe die einzelnen Abschnitte.

---

## Teil 2 – Interaktive Dokumentprodukte

### 2.1 H5P (H5P Group, vormals Joubel; seit 2024 D2L) – **Containervorbild**

- **Was:** „Create, share and reuse interactive HTML5 content in your browser“. H5P ist „an open
  source community driven project“ und laut eigener Aussage „completely free and open
  technology“ unter MIT (https://h5p.org/). „H5P is a registered trademark of H5P Group“ (ebd.).
- **Inhaltstypen:** über 60 (https://h5p.org/content-types-and-applications), u. a. Interactive
  Video, Course Presentation, Interactive Book, Branching Scenario, Question Set, Drag and Drop,
  Image Hotspots, Virtual Tour (360).
- **Integrationen:** Moodle, WordPress, Drupal, Canvas, Brightspace, Blackboard. SaaS-Variante
  H5P.com (https://h5p.org/).
- **Wer / Firmengeschichte:**
  - D2L hat am **09.07.2024** die H5P Group AS gekauft: 25,6 Mio. USD beim Closing plus bis zu
    7,4 Mio. USD Earn-out, rund 30 Mitarbeitende, überwiegend in Norwegen
    (https://newswire.ca/news-releases/d2l-acquires-global-saas-learning-solution-h5p-group-837005041.html;
    https://d2l.com/en-apac/newsroom/d2l-acquires-global-saas-learning-solution-h5p-group).
  - Vorher Joubel AS, Tromsø **(sekundär:** https://karriere.no/jobb/bedrift/joubel-as-26636**)**.
    Die Gründungsjahre widersprechen sich: D2L nennt 2014, andere Quellen 2013 (**OFFENE FRAGE**,
    unwichtig).
- **Lizenz der Kernbibliothek:** Das Repo `h5p/h5p-php-library` meldet **GPL-3.0** (GitHub-API,
  https://github.com/h5p/h5p-php-library). Die Website nennt MIT (https://h5p.org/). **OFFENE
  FRAGE:** welche Komponenten welche Lizenz tragen, ob Kern GPL und Inhaltstypen MIT. Für eine
  Wiederverwendung in html-Pro muss das geklärt werden.
- **Offline-/Standalone-Player:** `h5p-standalone` (MIT), Version 3.8.2 vom 24.03.2026
  (https://registry.npmjs.org/h5p-standalone; https://github.com/tunapanda/h5p-standalone).

**Containerformat .h5p** (https://h5p.org/documentation/developers/h5p-specification)
- „a standard zip file with a specific extension of .h5p“.
- Pflicht: `h5p.json` (Paketdefinition). Optional: Ordner `content/` mit `content.json`
  (Parameter des Inhalts) und Mediendateien. Dazu **Bibliotheksordner**, jeder mit
  `library.json` (Name, Abhängigkeiten, Metadaten). Ausführbare Inhaltstypen brauchen
  zusätzlich `semantics.json`, das „describes the structure of the content“.
- „the content structure is optional, so in essence an .h5p file could be used only to transfer
  libraries between different websites“.
- **Felder in `h5p.json`** (https://h5p.org/documentation/developers/json-file-definitions):
  - Pflicht: `title`, `mainLibrary`, `language` (ISO 639-1), `preloadedDependencies`,
    `embedTypes` (`div` und/oder `iframe`).
  - Optional: `authors`, `source`, `license` (z. B. CC-BY, GPL, PD, MIT), `licenseVersion`,
    `licenseExtras`, `yearFrom`, `yearTo`, `changes` (Änderungsprotokoll), `authorComments`.

**Sicherheitsmodell**
- H5P-Sicherheitsmodell (https://h5p.org/node/16):
  - Jede Datei im Paket wird gegen eine **Whitelist von Dateiendungen** geprüft, sonst wird das
    Paket abgelehnt.
  - „JavaScript files and other problematic files are by default and necessity allowed for H5P
    libraries but not for H5P content.“
  - Nur vertrauenswürdige Nutzer dürfen Bibliotheken aktualisieren. Bei Uploads unprivilegierter
    Nutzer werden mitgelieferte Bibliotheken ignoriert, wenn das System sie schon hat.
  - Antworten werden clientseitig ausgewertet und sind damit manipulierbar.
- Lumi (Node-Implementierung) sagt offen, H5P „deliberately allows Cross-Site-Scripting to some
  users“ und „libraries are a potential security risk by design“
  (https://docs.lumi.education/advanced-usage/security).
- Konkreter Fall: **CVE-2025-7062**, Stored XSS in `h5p-nodejs-library` bis 10.0.4, über
  hochgeladene H5P-Pakete mit bösartigem JavaScript (NVD, veröffentlicht 09.09.2026;
  https://nvd.nist.gov/vuln/detail/CVE-2025-7062).

**Stärken / Schwächen**
- Stärken:
  - Klar dokumentiertes ZIP-Format mit **JSON-Manifest**, deklarierten Abhängigkeiten,
    Lizenzfeldern und Änderungshistorie.
  - Strikte Trennung von **Daten** (`content.json`, gegen `semantics.json` validierbar) und
    **Code** (Bibliotheken).
  - Großes Ökosystem.
- Schwächen:
  - Die Bibliotheken sind ausführbarer Fremdcode. Sicherheit hängt an der **Vertrauensentscheidung
    des Administrators**, nicht an einer technischen Sandbox.
  - Wird primär im LMS gerendert und ist kein eigenständiges Dokument.
  - Lizenzlage uneindeutig. Kommerzieller Eigentümer seit 2024.

**Übertragbar auf html-Pro (trägt als Vorbild):**
1. ZIP + JSON-Manifest mit Pflichtfeldern (Titel, Sprache, Einstiegspunkt, Abhängigkeiten,
   Einbettungsarten) und Lizenz- und Autorfeldern.
2. Trennung **deklarativer Inhalt** ↔ **versionierte Komponentenbibliothek** mit
   `semantics.json`-artigem **Schema**, damit ein Editor Formulare und Eigenschaftsdialoge
   generieren kann.
3. Whitelist von Dateiendungen beim Import.
4. **Negativlehre:** Komponenten-Code im Dokument mitzuliefern verlagert das Sicherheitsproblem
   nur. html-Pro sollte Komponenten **signiert/registriert** führen oder in einer Sandbox
   (iframe/CSP) isolieren, statt auf „trusted admins“ zu setzen.

### 2.2 Ceros

- **Was:** No-Code-Designplattform für interaktive Web-Erlebnisse. Produkte: „Flex“ (Design
  Studio, freie Arbeitsfläche), „Flex AI“, „MarkUp“ (Feedback zu PDFs, Websites, Videos).
  Veröffentlichung unter eigener Vanity-Domain oder per Einbettung ins CMS, mit
  Server-Side-Rendering für SEO (https://www.ceros.com/).
- **Wer:** Ceros, Inc., New York, gegründet 2007 (als Crowd Fusion, später umbenannt)
  **(sekundär:** https://en.wikipedia.org/wiki/Ceros**)**.
- **Export:** Laut Hilfecenter-Artikel gab es zwei Exportwege, beide als Premium-Feature. (a) Eine
  `.cde`-Datei, nur mit der „Ceros Offline Viewer“-App lesbar. (b) Ein `tar.gz` mit `index.html`,
  Assets (inkl. JS), Medien und Seiten zum Selbsthosten **(sekundär, Suchergebnis-Zusammenfassung
  von**
  https://www.ceros.com/educate/help_center/export-and-host-ceros-experience-on-your-own-server/**).**
  Diese URL liefert am 11.10.2026 **HTTP 404** → **OFFENE FRAGE**, ob der Export noch angeboten
  wird.
- **Stärken:** Designfreiheit, Marketing-Workflows, Review-Tool.
- **Schwächen:** proprietär, Cloud-zentriert. Offline nur über proprietäres `.cde` plus eigene
  App, also genau die Abhängigkeit, die html-Pro vermeiden will. Kein offenes Format.
- **Übertragbar: teilweise.** Vorbildlich ist die Gestaltungs-UX (freie Arbeitsfläche, responsives
  Verhalten pro Element), als Format- oder Sicherheitsvorbild taugt Ceros nicht.

### 2.3 Shorthand

- **Was:** Plattform für visuelles Storytelling und Scrollytelling, „drag-and-drop editing“,
  wahlweise mit eigenem Code. Eingesetzt für Feature-Artikel, digitale Magazine, Angebote, interne
  Kommunikation und Geschäftsberichte. Analytics ohne Cookies (https://shorthand.com/).
- **Wer:** Shorthand Pty Ltd, „Born in Brisbane, Australia“ (https://shorthand.com/about/).
- **Export:** Je nach Plan ZIP-Download. Der ZIP ist „a compiled version of a story, consisting
  of only client-side technologies (HTML, CSS, JS and media)“ und „includes everything your story
  requires to render“. Vor dem Download muss die Ziel-URL gesetzt werden, damit die Metadaten
  stimmen (https://support.shorthand.com/en/articles/15203575-export-and-self-host-process, Stand
  29.07.2026). Weitere Wege: Shorthand-Hosting, Embed, S3/Azure/SFTP, WordPress/Drupal-Plugins,
  programmatisches Publizieren (https://support.shorthand.com/en/articles/56-publishing-options).
- **Stärken:** Exporte sind **reines Client-Side-HTML**, selbst hostbar und weiterverarbeitbar.
  Gute Lesbarkeit auf Mobilgeräten.
- **Schwächen:** proprietärer Editor. Export als Website-Bündel, nicht als Dokument mit Manifest,
  Signatur oder Archivprofil. Absolute URLs (Published URL) sind schon beim Export eingebrannt.
- **Übertragbar: teilweise.** Beleg, dass „Story als ZIP mit HTML/CSS/JS“ marktfähig ist.
  html-Pro sollte dagegen **relative, URL-unabhängige** Pakete erzwingen.

### 2.4 Quarto (Posit)

- **Was:** „An open-source scientific and technical publishing system“, „a multi-language, next
  generation version of R Markdown“ auf Basis von Pandoc. Sprachen: Python, R, Julia, Observable
  JS. Ausgabe: „HTML, PDF, MS Word, ePub, and more“ (https://quarto.org/).
- **Lizenz:** MIT, mit Ausnahmen für eingebundene Komponenten
  (https://github.com/quarto-dev/quarto-cli/blob/main/COPYRIGHT). Copyright Posit Software, PBC.
- **Release-Stand** (GitHub-API):
  - Stabil **v1.10.19 vom 06.10.2026**, zuvor v1.10.18 (24.07.2026), v1.9.38 (25.05.2026).
  - Parallel Vorab-Versionen 1.11.x, z. B. v1.11.5 vom 17.09.2026
    (https://github.com/quarto-dev/quarto-cli/releases).
- **Quarto 1.4** (24.01.2024) brachte Dashboards, **Typst-Ausgabe**, Manuscripts und neue
  Cross-References (https://opensource.posit.co/blog/2024-01-24_1.4-release/).
- **Manuscripts:** Projekttyp für wissenschaftliche Artikel. Notebooks dienen als Quelle,
  Ausgaben sind u. a. Journal-LaTeX/PDF, MS Word und **MECA**-Archiv. Es entsteht eine Website,
  auf der der Artikel Hauptinhalt ist und die eingebetteten Notebooks verlinkt sind
  (https://quarto.org/docs/manuscripts/).
- **Self-contained HTML:** `embed-resources: true` bündelt „all of the content required to render
  the article (images generated by plots, required CSS and JavaScript, etc.)“ in **eine** HTML-Datei.
  **Einschränkung:** MathJax/KaTeX werden standardmäßig *nicht* eingebettet, dafür braucht es
  `self-contained-math: true`
  (https://quarto.org/docs/output-formats/html-publishing.html).
- **Stärken:** Ein Quelltext wird zu vielen Zielformaten (HTML, PDF via LaTeX oder Typst, DOCX,
  EPUB, JATS/MECA). Reaktive Teile über Observable JS. Self-contained-HTML ist bereits ein
  „Ein-Datei-Dokument“.
- **Schwächen:**
  - Build-Werkzeug, kein Reader/Editor für Endnutzer.
  - Self-contained-HTML ist eine Inline-Kodierung (Base64/Data-URIs), ohne Manifest, Signatur oder
    Struktur für Teilzugriff.
  - Interaktivität mit Kernel (Shiny) braucht einen Server.
- **Übertragbar (trägt als Vorbild):**
  - Pipeline „ein Quelltext → HTML **und** PDF (Typst/LaTeX)“ als Muster für html-Pro → PDF.
  - Die Option `embed-resources` zeigt die Grenzen echter Selbstständigkeit: große Bibliotheken
    wie Mathe-Fonts sind die Kostentreiber.
  - MECA/JATS als Brücke ins wissenschaftliche Publizieren.

### 2.5 Observable (Notebooks, Framework, Notebooks 2.0 / Desktop)

- **Observable Framework:** „a free, open-source, static site generator for data apps,
  dashboards, reports“, Datenlader berechnen Snapshots zur Build-Zeit
  (https://github.com/observablehq/framework). ISC-Lizenz. Letztes Release **v1.13.4 vom
  02.03.2026**, davor v1.13.3 (16.04.2025) (GitHub-API). Die Release-Frequenz ist deutlich
  gesunken; **OFFENE FRAGE**, ob Framework noch strategisch weiterentwickelt wird.
- **Notebooks 2.0 (Technology Preview):** besteht aus „Observable Notebook Kit“ (offenes
  Dateiformat plus CLI für statische Sites, Vite-Plugin, JS-API) und „Observable Desktop“
  (https://github.com/observablehq/notebook-kit/blob/main/README.md).
  - `@observablehq/notebook-kit` 1.0.0 erschien am **29.07.2025**, 2.0.0 am 02.06.2026, aktuell
    **2.7.0 vom 09.10.2026** (https://registry.npmjs.org/@observablehq/notebook-kit). Lizenz ISC.
  - **Dateiformat = HTML-Dialekt:** „intended to be simple, human-readable, and human-editable.
    It's based on HTML“. Struktur: Wurzelelement `<notebook>`, optional `<title>`, **ein
    `<script>` pro Zelle**. Attribute `type` (u. a. `module`, `text/x-typescript`,
    `text/markdown`, `text/html`, `application/sql`, `application/x-tex`, `text/vnd.graphviz`,
    `application/vnd.observable.javascript`, `text/x-python`, `text/x-r`), `pinned`, `hidden`,
    `output`, `database`, `format`, `id`
    (https://github.com/observablehq/notebook-kit/blob/main/docs/kit.html).
  - **Observable Desktop:** Editor für macOS, „editing notebooks as local files in an open,
    human-readable file format“. Voraussetzungen: macOS 15+, Apple Silicon und **ein
    Observable-Konto** (https://github.com/observablehq/notebook-kit/blob/main/docs/desktop.html).
  - Einordnung von Tom MacWright (Ex-Observable): Tauri-basierte Desktop-App mit iframe-Sandbox.
    Der Wechsel von proprietärem „Observable JavaScript“ zu Vanilla-JS sei die wichtigste Änderung
    („don't mess with language standards folks!“) **(sekundär:**
    https://macwright.com/2025/07/31/observable-notebooks-2**)**.
- **Stärken:**
  - **Reaktivität** (Zellen-Abhängigkeitsgraph).
  - Dateiformat ist **gültiges, diff-bares HTML**: Zellen als `<script type=…>`, damit lesbar
    ohne Laufzeit.
  - Statische Ausgabe.
- **Schwächen:** Technology Preview. Desktop nur für macOS und mit Konto-Pflicht.
  Notebook-Semantik (Code-Zellen) statt Dokument-Semantik. Kein Druck- oder Archivprofil.
- **Übertragbar (trägt als Vorbild):**
  1. **„Dokument = HTML mit deklarierten `<script type=…>`-Blöcken“**, die der Reader
     interpretiert, statt beliebiges JS auszuführen. Das ist ein Muster für Daten- und
     Formelblöcke in html-Pro.
  2. Reaktives Zellmodell für berechnete Werte (Formulare, Rechnungen).
  3. iframe-Sandbox im Desktop-Editor.

### 2.6 Jupyter Notebooks (.ipynb)

- **Format:** JSON-Dictionary mit `metadata`, `nbformat` (4), `nbformat_minor` und `cells`.
  Zelltypen: code, markdown, raw. Ausgaben als **MIME-Bundles** („data keyed by mime-type“)
  (https://nbformat.readthedocs.io/en/latest/format_description.html).
- **Release-Stand Jupyter Notebook:** v7.5.8 vom 05.10.2026, v7.6.3 vom 21.09.2026, Alpha 7.7.0a2;
  Lizenz BSD-3-Clause (GitHub-API, https://github.com/jupyter/notebook).
- **Sicherheitsmodell (vorbildlich):** Beim Speichern wird eine Signatur aus Digest des
  Notebook-Inhalts und einem geheimen Schlüssel berechnet und in einer nutzerlokalen Datenbank
  abgelegt. „Untrusted HTML is always sanitized“, „Untrusted Javascript is never executed“.
  Leitfrage: „Did the current user do this?“ Vertrauen lässt sich mit `jupyter trust` explizit
  erteilen (https://jupyter-server.readthedocs.io/en/latest/operators/security.html).
- **Stärken:** de-facto-Standard, MIME-Bundle-Ausgaben mit Fallbacks, klares Trust-Modell.
- **Schwächen:** JSON statt lesbarem Dokument. Code-zentriert. Kein Layout- oder Druckmodell.
  Interaktivität erfordert einen Kernel.
- **Übertragbar (trägt):**
  - **MIME-Bundle-Prinzip:** dieselbe Ausgabe in mehreren Repräsentationen, z. B. interaktiv,
    SVG und PNG als Fallback für Druck/PDF.
  - **Trust-Modell:** fremde Dokumente zunächst „untrusted“ (nur sanitisiertes HTML, kein JS),
    Freigabe bewusst durch den Nutzer.

### 2.7 Idyll

- **Was:** „a markup language for creating interactive documents“, Markdown-artig mit
  React-Komponenten und reaktiven Variablen. Unterstützt vom Interactive Data Lab der University
  of Washington (https://idyll-lang.org/).
- **Stand:** MIT. Letzter Push ins Repo am **04.02.2023**. npm-Version `6.0.0-alpha.6` vom
  22.04.2022 (GitHub-API; https://registry.npmjs.org/idyll). **Faktisch inaktiv.**
- **Übertragbar: teilweise.** Gute Idee: deklarative Komponenten plus reaktive Variablen in einer
  Autorensprache. Warnsignal: Akademische Projekte ohne Betreiber versanden.

### 2.8 Distill

- **Was:** Journal und Template für interaktive ML-Artikel (https://distill.pub/).
- **Stand:** Seit **02.07.2021 in „Hiatus“**. Gründe: struktureller Aufwand des Journal-Modells,
  Konflikt Mentor/Gutachter, Freiwilligen-Burnout bei „50+ hours per article“
  (https://distill.pub/2021/distill-hiatus/). Das Template `distillpub/template` hat sein letztes
  Release v2.8.0 vom 28.04.2020 (GitHub-API).
- **Übertragbar (Lehre):** Hochwertige interaktive Dokumente sind **teuer in der Herstellung**.
  Ohne Werkzeuge, die den Aufwand senken, bleibt Interaktivität eine Nische. Für html-Pro heißt
  das: Der Editor ist der Engpass, nicht das Format.

### 2.9 MyST Markdown / mystmd / Jupyter Book 2 / Curvenote

- **Was:** MyST ist „an ecosystem of open-source, community-driven tools“. `mystmd` ist Parser
  und CLI. Ausgaben: interaktive Websites (React), PDF/LaTeX mit Vorlagen „for over 400
  journals“, Word, JATS. Kern ist ein **standardisierter AST nach MyST Spec**
  (https://mystmd.org/guide).
- **Stand:** `mystmd` 1.11.0 vom 21.09.2026, MIT (GitHub-API; https://registry.npmjs.org/mystmd).
  **Jupyter Book 2** basiert auf der MyST Document Engine, ist veröffentlicht, aber mit dem
  Hinweis „still has many improvements to be made“ (https://jupyterbook.org/). Auf PyPI
  `jupyter-book` 2.1.7 (https://pypi.org/pypi/jupyter-book/json).
- **Curvenote:** Firma hinter einem „Scientific Content Management System“ für Journals und
  Fachgesellschaften. Beispiel: interaktives Open-Access-Journal der Microscopy Society of America
  (https://curvenote.com/).
- **Stärken:** **formatneutraler Dokument-AST** als Zwischenschicht. Wissenschaftliche Semantik
  (Querverweise, Zitate, Gleichungen). JATS-Export.
- **Übertragbar (trägt):** html-Pro braucht ein **kanonisches, validierbares Inhaltsmodell**
  unterhalb des HTML. Der MyST-AST zeigt, wie das aussehen kann, und ist ein möglicher
  Import-/Exportpartner.

### 2.10 Notion- und Coda-Exporte

- **Notion:** Export als PDF, HTML, Markdown & CSV (Datenbanken als CSV). Form-Ansichten lassen
  sich nicht exportieren. Bei Datenbanken nur aktuelle oder Standardansicht. PDF mit Unterseiten
  nur in Business/Enterprise. Workspace-Export als HTML/Markdown/CSV möglich, „can take up to 30
  hours“ (https://www.notion.com/help/export-your-content).
- **Coda** (Hilfe heute unter Superhuman): Export als PDF und Tabellen als CSV
  (https://help.superhuman.com/hc/en-us/articles/46210158886157-Overview-Export-data-from-Coda).
  Markdown-Export ist laut Community nicht ausgereift **(sekundär:**
  https://connect.superhuman.com/t/export-to-markdown-html/25906**)**. **OFFENE FRAGE:** genaue
  Eigentümerstruktur Coda/Grammarly/Superhuman (nicht primär geprüft).
- **Bewertung:** Diese Exporte **verlieren die Interaktivität** (Datenbankansichten, Formulare,
  Formeln). Die interaktiven Dokumente bleiben an den Cloud-Dienst gebunden.
- **Eignung: ungeeignet als Vorbild für das Format.** Relevant als **Importquelle** und als Beleg
  für den Bedarf: Nutzer wollen ihre Dokumente portabel haben, bekommen aber nur statische
  Abzüge.

### 2.11 Zwischenfazit Teil 2 – was html-Pro übernehmen sollte

| Aspekt | Bestes Vorbild | Quelle |
|---|---|---|
| Container + Manifest | H5P (`.h5p` = ZIP + `h5p.json`, Lizenz-/Autorfelder, Dependencies) | https://h5p.org/documentation/developers/json-file-definitions |
| Inhalt/Code-Trennung + Schema für Editor | H5P `content.json` + `semantics.json` | https://h5p.org/documentation/developers/h5p-specification |
| Self-contained Export | Quarto `embed-resources`, Shorthand-ZIP | https://quarto.org/docs/output-formats/html-publishing.html |
| Reaktivität | Observable (Zellgraph), Idyll (reaktive Variablen) | https://github.com/observablehq/notebook-kit |
| Lesbares HTML-Dateiformat | Observable Notebook Kit (`<notebook>` + `<script type>`) | https://github.com/observablehq/notebook-kit/blob/main/docs/kit.html |
| Fallback-Repräsentationen | Jupyter MIME-Bundles | https://nbformat.readthedocs.io/en/latest/format_description.html |
| Sicherheitsmodell | Jupyter Trust (untrusted = kein JS) **statt** H5P „trusted admins“ | https://jupyter-server.readthedocs.io/en/latest/operators/security.html |
| Kanonisches Inhaltsmodell | MyST-AST | https://mystmd.org/guide |
| Mehrformat-Pipeline inkl. PDF | Quarto (LaTeX/Typst), Typst-Bundle | https://quarto.org/docs/output-formats/typst.html |

---

## Teil 3 – Grundsatzfrage „Ist HTML die richtige Basis?“: weitere Kandidaten und Vorläufer

### 3.1 W3C „Portable Web Publications“ → „Web Publications“ → „Publication Manifest“

- **PWP-Vision** (W3C Interest Group Note, **02.05.2017**): „Books can learn from the Web how to be
  bounded, but open. The Web can learn from books how to be open, but bounded.“ Ziel: Publikationen
  als „first-class citizens of the web“, online und offline, gepackt oder ungepackt
  (https://www.w3.org/TR/pwp/).
- **Web Publications** wurde **13.08.2019 als Working Group Note eingestellt**, im Wortlaut: „Due
  to the lack of practical business cases for Web Publications, and the consequent lack of
  commitment to implement the technology, the Publishing Working Group has chosen to publish this
  document as a Note and focus on other areas of interest, including developing the manifest
  format as a separate specification.“ (https://www.w3.org/TR/wpub/).
- Was davon übrig ist: **Publication Manifest**, W3C Recommendation vom 10.11.2020
  (https://www.w3.org/TR/pub-manifest/), bisher nur genutzt von **Audiobooks**, ebenfalls
  Recommendation vom 10.11.2020 (https://www.w3.org/TR/audiobooks/).
- **Bewertung:** Wichtigste Warnung für html-Pro: Genau die Idee „Dokumente als Web-Pakete“ ist
  beim W3C **an fehlenden Implementierungszusagen gescheitert**, nicht an der Technik. Das
  JSON-Manifest-Format (Publication Manifest) ist aber standardisiert und **direkt
  wiederverwendbar**. **Eignung: teilweise (Manifest trägt, Gesamtansatz gescheitert).**

### 3.2 „Portable EPUBs“ (Will Crichton, Brown University, 25.01.2024)

- Ausdrücklicher Vorschlag, **PDF durch HTML-in-EPUB zu ersetzen** („A proposal for the next
  generation of portable documents“). Das Dokument selbst ist ein EPUB, gelesen im eigenen Reader
  „Bene“ (Tauri, Rust/Wasm) (https://willcrichton.net/notes/portable-epubs/; EPUB-Datei:
  https://willcrichton.net/notes/portable-epubs/epubs/portable-epubs.epub).
- Kernaussagen (aus dem EPUB-Text):
  - PDF ist self-contained, konsistent und stabil, aber „fundamentally unstructured“.
  - HTML hat „almost exactly the inverse advantages and disadvantages“: nicht self-contained,
    nicht konsistent gerendert, nicht voll zeitstabil („living standard“).
  - WARC, webarchive und MHTML sind eher für Website-Snapshots gedacht. Am sinnvollsten sei EPUB.
- Vorgeschlagene Regeln:
  - „Local asset requirement“ (keine externen Assets).
  - „portable HTML“-Teilmenge, für die der Reader vernünftiges Rendering garantiert.
  - Fixed-Layout-Rendition als Fallback.
  - CSS-Kaskade Reader-System < Dokument < Leser.
  - „Structure over scripts“.
  - Interaktive Teile als **Web Components** mit Pflicht-Fallback ohne JS.
  - Blocknummern statt Seitenzahlen zum Zitieren.
  - Web Annotations für Anmerkungen.
  - Kein Tracking.
- **OFFENE FRAGE:** ob das Projekt nach Anfang 2024 weitergeführt wurde (Bene, Nota).
- **Bewertung: trägt (als konzeptionelle Vorarbeit).** Inhaltlich fast deckungsgleich mit
  html-Pro, und das spricht für **EPUB-Container + HTML-Teilmenge + Web Components** statt eines
  völlig neuen Formats.

### 3.3 Microsoft Fluid Framework / Loop

- **Fluid Framework:** Open Source unter **MIT**, Technik-Stack für kollaborative Echtzeit-Apps mit
  verteilten Datenstrukturen. Microsoft Loop, Teams, Whiteboard und Power Apps gehören zu den
  Nutzern (https://fluidframework.com/).
- **Loop-Komponenten / `.loop`-Dateien:** Sie liegen im OneDrive des Erstellers (früher
  `.fluid`). Im Wortlaut: „`.loop` files can only be opened as links in your browser … If
  downloaded, they can't be opened again without first uploading them back to OneDrive or
  SharePoint.“ Nach Verschieben in eine andere Bibliothek laden sie nicht mehr
  (https://learn.microsoft.com/en-us/microsoft-365/loop/loop-components-teams, Stand 14.05.2026).
- **Bewertung: ungeeignet als Format** (keine Portabilität, keine Offline-Datei). Relevant als
  Gegenmodell: „Dokument = Zeiger auf Cloud-Zustand“. Fluid als **Sync-Technik** für
  Ko-Editieren ist **teilweise** übertragbar.

### 3.4 Google Docs `.gdoc`

- `.gdoc` ist nur eine **Verknüpfung** (JSON mit Link), ohne Dokumentinhalt; offline nutzlos
  **(sekundär:** https://www.fileinfo.com/extension/gdoc; https://docs.fileformat.com/web/gdoc**)**.
  Primär belegt ist nur: „Files in Google Docs, Sheets, and Slides open in your web browser“
  (https://support.google.com/drive/answer/10838124). **OFFENE FRAGE:** eine Google-Primärquelle
  zum Inhalt von `.gdoc`.
- **Bewertung: ungeeignet** (wie Loop: Cloud-Zeiger statt Dokument).

### 3.5 Notion / Coda

- Siehe 2.10: Exporte sind statische Abzüge (HTML, Markdown, PDF, CSV), die interaktive
  Semantik geht verloren (https://www.notion.com/help/export-your-content).
- **Bewertung: ungeeignet als Basis.**

### 3.6 Markdown-basierte Formate

- CommonMark, aktuelle Spezifikation **0.31.2 vom 28.01.2024**
  (https://spec.commonmark.org/). Formal ist es weiter eine 0.x-Version.
- Erweiterte Dialekte mit Dokumentsemantik: MyST (siehe 2.9), Quarto/Pandoc-Markdown (2.4).
- **Bewertung: teilweise.** Gut als **Autorenformat und Quelltext**, als Auslieferungsformat
  ungeeignet: kein Layout, keine Interaktivität ohne Erweiterungen, viele inkompatible Dialekte.

### 3.7 OpenDocument Format (ODF / ODT)

- **ODF 1.4** ist seit **06.10.2025 OASIS Standard** („effective October 6, 2025, OpenDocument v1.4
  is now an OASIS Standard“, 10 Ja-Stimmen, keine Einwände;
  https://groups.oasis-open.org/discussion/opendocument-v14-approved-as-an-oasis-standard-1).
  Schwerpunkte laut Berichten: Barrierefreiheit und Rückwärtskompatibilität **(sekundär:**
  https://linuxiac.com/oasis-approves-odf-1-4-advancing-vendor-neutral-document-standards/**)**.
- Aufbau: Teile „Introduction, Packages, OpenDocument Schema, OpenFormula“ **(sekundär, s. o.)**.
  ZIP-Paket mit XML.
- **Bewertung: teilweise.** ODF ist der **etablierte offene Container-Standard** für editierbare
  Dokumente, mit `Packages`-Teil, Manifest und definierter digitaler Signatur. **OFFENE FRAGE:**
  Einzelheiten der ODF-Signatur (XAdES?) sind hier nicht geprüft. Gegen ODF als Basis spricht:
  Layoutmodell seitenorientiert (Textverarbeitung), kein responsives Layout, Interaktivität nur über
  Makros. Als Vorbild für **Paketstruktur und Signaturablage (META-INF)** trägt es.

### 3.8 Office Open XML (OOXML)

- ECMA-376 „Office Open XML file formats“, **5. Ausgabe Dezember 2021**, inhaltlich parallel zu
  ISO/IEC 29500 (https://ecma-international.org/publications-and-standards/standards/ecma-376/).
- **Bewertung: ungeeignet als Basis** (seitenorientiertes Textverarbeitungsmodell, hohe
  Komplexität). Wichtig als **Import-/Exportziel**. OPC (Open Packaging Conventions) ist ein
  weiteres Containervorbild.

### 3.9 XPS / OpenXPS

- ECMA-388 „Open XML Paper Specification (OpenXPS)“, **1. Ausgabe Juni 2009**: „a set of conventions
  for the use of XML … to describe the content and appearance of paginated documents“, auf Basis
  von OPC (https://ecma-international.org/publications-and-standards/standards/ecma-388/).
- Microsoft hat den XPS Viewer ab Windows 10 Version 1803 bei Neuinstallationen aus dem Image
  genommen, er ist nur noch optional installierbar
  (https://learn.microsoft.com/en-us/windows/whats-new/removed-features).
- **Bewertung: ungeeignet.** Lehrstück: Ein technisch solides, standardisiertes „PDF-Ersatz“-Format
  eines großen Herstellers hat sich **nicht durchgesetzt** und wird zurückgebaut. Ein neues Format
  braucht mehr als technische Qualität: Reader-Verbreitung und Rechtsrahmen.

### 3.10 DjVu

- „a digital document format with advanced compression technology“ für hochaufgelöste Scans,
  entstanden 1996 bei AT&T Labs. Die letzten News auf djvu.org stammen von **2013**
  (https://djvu.org/).
- **Bewertung: ungeeignet** (Bildformat für Scans, de facto nicht mehr gepflegt). Relevant höchstens
  als Importquelle.

### 3.11 Typst als Alternative zu HTML

- Siehe 1.5. Typst ist eine **eigene Sprache** mit starkem PDF (Tagged, PDF/UA-1, PDF/A). Das HTML
  ist experimentell und ohne CSS (https://typst.app/docs/reference/html/).
- **Bewertung: ungeeignet als Basis** für ein responsives Format, denn das Seitenmodell steht im
  Zentrum. **Trägt als Exportbackend/Vorbild.**

### 3.12 Single-File-HTML und „local-first“

- **TiddlyWiki:** „A self-contained JavaScript wiki for the browser“, ein Wiki als **eine
  HTML-Datei**. v5.4.1 vom 10.07.2026, BSD-artige Lizenz (Copyright UnaMesa Association;
  https://github.com/TiddlyWiki/TiddlyWiki5; Lizenztext:
  https://github.com/TiddlyWiki/TiddlyWiki5/blob/master/license). Das Speichern hängt von
  Plattform und Browser ab und braucht je nach Umgebung unterschiedliche Methoden
  (https://tiddlywiki.com/static/Saving.html). Belegt, dass Single-File-HTML seit 2004 funktioniert,
  aber auch, dass **das Zurückschreiben im Browser** das Kernproblem ist.
- **SingleFile** (Browser-Erweiterung, „saving a faithful copy of a complete web page in a single
  HTML file“): AGPL-3.0, v1.29.0 vom 10.10.2026 (https://github.com/gildas-lormeau/SingleFile).
  Details zu MHTML, Web Bundles und SingleFile stehen in `01-stand-der-technik.md`.
- **Ink & Switch, „Local-first software“** (April 2019; Kleppmann, Wiggins, van Hardenberg,
  McGranaghan). Sieben Ideale: „No spinners“, „Your work is not trapped on one device“, „The
  network is optional“, „Seamless collaboration“, „The Long Now“, „Security and privacy by
  default“, „You retain ultimate ownership and control“
  (https://www.inkandswitch.com/essay/local-first/).
- **Automerge:** CRDT-basierte „local-first sync engine“, JS und Rust plus Bindings. Von Ink &
  Switch mit festangestellten Maintainern getragen, gefördert u. a. von NLnet. Speichert die
  vollständige Änderungshistorie komprimiert (https://automerge.org/). MIT, js/automerge-3.5.0 vom
  16.09.2026 (GitHub-API, https://github.com/automerge/automerge).
- **Ink & Switch Patchwork:** Forschung zu „universal version control“, zuerst für Prosa:
  Branches, Diff-Visualisierung, Historie (https://www.inkandswitch.com/patchwork/notebook/01;
  https://www.inkandswitch.com/patchwork/notebook/02).
- **OFFENE FRAGE:** Ein Ink-&-Switch-Projekt namens „HTML document“ oder ein expliziter
  Single-File-HTML-Dokumentstandard von Ink & Switch wurde **nicht gefunden**. Die Suche ergab nur
  local-first, Patchwork und Automerge.
- **Bewertung: trägt (als Architekturprinzip).**
  - Local-first-Ideale passen genau zu „PDF-Ersatz“: Datei gehört dem Nutzer, offline, langlebig.
  - Automerge/CRDT ist ein Kandidat für **Kommentare, Review und gleichzeitiges Bearbeiten ohne
    Server**. Die Änderungshistorie im Dokument könnte zugleich einer Revisionsspur dienen
    (**OFFENE FRAGE**: rechtliche Tragfähigkeit, gehört in Recherche „Recht“).

### 3.13 Bewertungsübersicht Teil 3

| Kandidat | Was | Eignung als Basis | Was mitnehmen |
|---|---|---|---|
| W3C PWP / Web Publications | Vision „Publikation = Web-Paket“ | gescheitert (Note 2019) | Publication Manifest (REC 2020); Warnung vor fehlendem Implementierungswillen |
| Portable EPUBs (Crichton) | EPUB + HTML-Teilmenge als PDF-Ersatz | trägt (Konzept) | Asset-Regel, HTML-Subset, Web Components, Blocknummern |
| Fluid/Loop | Cloud-Komponenten | ungeeignet | CRDT/Sync-Idee |
| Google `.gdoc` | Cloud-Link | ungeeignet | – |
| Notion/Coda | Cloud-Docs mit Export | ungeeignet | Importquelle |
| Markdown/CommonMark | Autorenformat | teilweise | Quellformat, nicht Auslieferung |
| ODF 1.4 | offener Office-Container | teilweise | Paket-/Manifest-/Signaturstruktur |
| OOXML | Office-Container | ungeeignet | Import/Export, OPC |
| OpenXPS | fixes Seitenformat | ungeeignet | Lehre: Technik reicht nicht |
| DjVu | Scan-Format | ungeeignet | – |
| Typst | Satzsprache | ungeeignet als Basis | Export/Vorbild |
| TiddlyWiki/SingleFile | Single-File-HTML | teilweise | Beleg für Machbarkeit; Speichern ist Problem |
| Local-first/Automerge | Architektur/CRDT | trägt (Prinzip) | Offline-Kollaboration, Historie |

**Vorläufige Antwort auf die Grundsatzfrage (aus Sicht dieser Teilrecherche):**
- Kein betrachteter Nicht-HTML-Kandidat bietet responsives Layout **und** Interaktivität **und**
  breite Rendering-Basis. HTML/CSS bleibt die einzige realistische **Inhaltsschicht**.
- Ob roh, Single-File oder in einem Container: Das ist durch die Vorläufer nicht entschieden.
- **Teilnahme und Verbreitung** sind das eigentliche Risiko, nicht die Technik: W3C Web
  Publications 2019 eingestellt, XPS zurückgebaut, Distill im Hiatus.
- Die stärksten Bausteine sind vorhanden und standardisiert bzw. offen:
  - EPUB-Container / Publication Manifest
  - Web Components mit Fallback
  - Jupyter-artiges Trust-Modell
  - H5P-artige Inhalt/Code-Trennung mit Schema
  - WeasyPrint/Typst-artiger PDF/UA-Export
  - CRDT für Kollaboration

---

## Quellenliste

### W3C / Standards
- https://www.w3.org/TR/css-page-3/
- https://www.w3.org/TR/css-break-3/
- https://www.w3.org/TR/css-break-4/
- https://www.w3.org/TR/css-gcpm-3/
- https://www.w3.org/TR/css-page-floats-3/
- https://www.w3.org/TR/css-regions-1/
- https://www.w3.org/TR/pwp/
- https://www.w3.org/TR/wpub/
- https://www.w3.org/TR/pub-manifest/
- https://www.w3.org/TR/audiobooks/
- https://groups.oasis-open.org/discussion/opendocument-v14-approved-as-an-oasis-standard-1
- https://ecma-international.org/publications-and-standards/standards/ecma-376/
- https://ecma-international.org/publications-and-standards/standards/ecma-388/
- https://spec.commonmark.org/

### Browser-Unterstützung
- https://github.com/mdn/browser-compat-data (Paket 8.1.5, 08.10.2026)
- https://caniuse.com/css-paged-media
- https://caniuse.com/css-page-break
- https://caniuse.com/css-widows-orphans
- https://caniuse.com/css-regions
- https://developer.chrome.com/blog/print-margins
- https://developer.chrome.com/blog/new-in-chrome-131
- https://pptr.dev/api/puppeteer.pdfoptions

### Paged.js
- https://pagedjs.org/
- https://pagedjs.org/posts/en/a-new-chapter-in-paged.js-life/
- https://github.com/pagedjs/pagedjs
- https://registry.npmjs.org/pagedjs
- https://registry.npmjs.org/pagedjs-cli/latest
- https://lists.xwiki.org/hyperkitty/list/notifications@xwiki.org/message/JFW7HSJEYKYLROGICDOIGOIWBUHKFTDI/attachment/1/attachment.html (sekundär)

### Vivliostyle
- https://vivliostyle.org/
- https://github.com/vivliostyle/vivliostyle-cli/releases
- https://github.com/vivliostyle/vivliostyle-cli/blob/main/docs/config.md
- https://github.com/vivliostyle/vivliostyle-cli/blob/main/package.json
- https://github.com/vivliostyle/vivliostyle.js
- https://nlnet.nl/project/Vivliostyle/
- https://lists.w3.org/Archives/Public/public-cssprint/2022Nov/0003.html
- https://internet.watch.impress.co.jp/docs/news/736439.html (sekundär)

### WeasyPrint
- https://github.com/Kozea/WeasyPrint/releases
- https://github.com/Kozea/WeasyPrint/blob/main/README.rst
- https://github.com/Kozea/WeasyPrint/blob/main/docs/going_further.rst
- https://doc.courtbouillon.org/weasyprint/stable/api_reference.html
- https://pypi.org/pypi/weasyprint/json

### Prince
- https://www.princexml.com/releases/
- https://www.princexml.com/releases/17/
- https://www.princexml.com/doc/prince-output/
- https://www.princexml.com/purchase/
- https://www.princexml.com/license/

### Typst
- https://github.com/typst/typst/releases
- https://typst.app/about/
- https://typst.app/docs/reference/html/
- https://typst.app/docs/reference/pdf/
- https://typst.app/docs/changelog/0.15.0/

### LaTeX / arXiv
- https://github.com/latex3/tagging-project
- https://latex3.github.io/tagging-project/
- https://mirrors.ctan.org/macros/latex/base/ltnews42.tex
- https://mirrors.ctan.org/macros/latex/base/ltnews43.tex
- https://latex-project.org/news/2025/11/11/issue42-of-latex2e-released/
- https://www.latex-project.org/news/
- https://blog.arxiv.org/2023/12/21/accessibility-update-arxiv-now-offers-papers-in-html-format/
- https://info.arxiv.org/about/accessible_HTML.html
- https://arxiv.org/pdf/2605.16562
- https://github.com/brucemiller/LaTeXML
- https://ctan.org/pkg/tex4ht
- https://ctan.org/pkg/make4ht

### H5P
- https://h5p.org/
- https://h5p.org/content-types-and-applications
- https://h5p.org/documentation/developers/h5p-specification
- https://h5p.org/documentation/developers/json-file-definitions
- https://h5p.org/node/16
- https://github.com/h5p/h5p-php-library
- https://github.com/tunapanda/h5p-standalone
- https://docs.lumi.education/advanced-usage/security
- https://nvd.nist.gov/vuln/detail/CVE-2025-7062
- https://newswire.ca/news-releases/d2l-acquires-global-saas-learning-solution-h5p-group-837005041.html
- https://d2l.com/en-apac/newsroom/d2l-acquires-global-saas-learning-solution-h5p-group
- https://karriere.no/jobb/bedrift/joubel-as-26636 (sekundär)

### Ceros / Shorthand
- https://www.ceros.com/
- https://www.ceros.com/educate/help_center/export-and-host-ceros-experience-on-your-own-server/ (am 11.10.2026 HTTP 404)
- https://en.wikipedia.org/wiki/Ceros (sekundär)
- https://shorthand.com/
- https://shorthand.com/about/
- https://support.shorthand.com/en/articles/15203575-export-and-self-host-process
- https://support.shorthand.com/en/articles/56-publishing-options

### Quarto / Observable / Jupyter / MyST / Idyll / Distill
- https://quarto.org/
- https://github.com/quarto-dev/quarto-cli/blob/main/COPYRIGHT
- https://github.com/quarto-dev/quarto-cli/releases
- https://opensource.posit.co/blog/2024-01-24_1.4-release/
- https://quarto.org/docs/manuscripts/
- https://quarto.org/docs/output-formats/html-publishing.html
- https://quarto.org/docs/output-formats/typst.html
- https://github.com/observablehq/framework
- https://github.com/observablehq/notebook-kit
- https://github.com/observablehq/notebook-kit/blob/main/docs/kit.html
- https://github.com/observablehq/notebook-kit/blob/main/docs/desktop.html
- https://registry.npmjs.org/@observablehq/notebook-kit
- https://macwright.com/2025/07/31/observable-notebooks-2 (sekundär)
- https://nbformat.readthedocs.io/en/latest/format_description.html
- https://jupyter-server.readthedocs.io/en/latest/operators/security.html
- https://github.com/jupyter/notebook
- https://idyll-lang.org/
- https://registry.npmjs.org/idyll
- https://distill.pub/2021/distill-hiatus/
- https://github.com/distillpub/template
- https://mystmd.org/guide
- https://jupyterbook.org/
- https://curvenote.com/

### Notion / Coda / Google / Microsoft
- https://www.notion.com/help/export-your-content
- https://help.superhuman.com/hc/en-us/articles/46210158886157-Overview-Export-data-from-Coda
- https://connect.superhuman.com/t/export-to-markdown-html/25906 (sekundär)
- https://support.google.com/drive/answer/10838124
- https://www.fileinfo.com/extension/gdoc (sekundär)
- https://docs.fileformat.com/web/gdoc (sekundär)
- https://fluidframework.com/
- https://learn.microsoft.com/en-us/microsoft-365/loop/loop-components-teams
- https://learn.microsoft.com/en-us/windows/whats-new/removed-features

### Single-File / Local-first / Sonstige
- https://willcrichton.net/notes/portable-epubs/
- https://willcrichton.net/notes/portable-epubs/epubs/portable-epubs.epub
- https://djvu.org/
- https://github.com/TiddlyWiki/TiddlyWiki5
- https://tiddlywiki.com/static/Saving.html
- https://github.com/gildas-lormeau/SingleFile
- https://www.inkandswitch.com/essay/local-first/
- https://automerge.org/
- https://github.com/automerge/automerge
- https://www.inkandswitch.com/patchwork/notebook/01
- https://www.inkandswitch.com/patchwork/notebook/02
- https://linuxiac.com/oasis-approves-odf-1-4-advancing-vendor-neutral-document-standards/ (sekundär)
- https://bfo.com/misc/2025-pdf-days-berlin-presentation/presentation-pdf1.pdf (BFO, „HTML vs PDF“, PDF Days 2025. **Nicht ausgewertet**, Datei > 10 MB, siehe offene Fragen)

---

## Offene Fragen

1. **GCPM in Browsern:** Implementiert irgendeine Browser-Engine `string-set`, `target-counter()`,
   `leader()` oder `float: footnote`? MDN BCD führt diese Features nicht.
2. **Chromium-Tagging:** Wie gut validiert das von Chromium/Puppeteer erzeugte Tagged PDF
   (`tagged: true`) gegen PDF/UA-1/-2? Gibt es Prüfberichte (veraPDF, PAC)?
3. **Paged.js 2.0:** Zeitplan und Stand des Umbaus. Kommt nach 0.5.0-beta.2 (10/2024) ein stabiles
   Release? Finanzierung nach Ende der Coko-Unterstützung?
4. **Vivliostyle:** Rechtsform und Finanzierung der Vivliostyle Foundation. Gibt es Tagged
   PDF/PDF/UA-Unterstützung jenseits von Chromium? Umfang der Unterstützung für japanischen Satz
   (hier nicht geprüft).
5. **WeasyPrint:** Wie weit weicht das CSS-Layout (Grid/Flex) vom Browser ab? Welcher Validator
   soll PDF/UA-Ausgaben in der html-Pro-Pipeline prüfen?
6. **Prince:** Ist PDF/UA-2 geplant?
7. **Typst:** Gibt es einen belastbaren Konverter HTML → Typst (z. B. Pandoc-Writer), damit Typst als
   PDF-Backend für html-Pro dienen kann? Wann wird der HTML-Export stabil?
8. **LaTeX:** Wortlaut zur Opt-in-Aktivierung (`tagging=on`) in ltnews42 nicht direkt im
   Quelltext verifiziert. Aktuelle Erfolgsquote der arXiv-HTML-Konvertierung (Paper
   arXiv:2605.16562 nicht ausgewertet).
9. **H5P-Lizenz:** Website sagt MIT, `h5p-php-library` meldet GPL-3.0. Welche Komponenten
   tragen welche Lizenz? Gründungsjahr Joubel/H5P Group (2013 vs. 2014). Strategie unter D2L.
10. **Ceros-Export:** Hilfeartikel zum Export (`.cde`/`tar.gz`) liefert am 11.10.2026 HTTP 404.
    Gibt es den Export noch?
11. **Observable Framework:** seit 03/2026 kein Release. Noch strategisch gepflegt oder durch Notebook
    Kit abgelöst?
12. **Coda:** Eigentümerstruktur (Grammarly/Superhuman) nicht primär belegt.
13. **Google `.gdoc`:** keine Google-Primärquelle zum Inhalt der Verknüpfungsdatei gefunden.
14. **ODF:** Details der Signatur (XAdES-Profil?) und der Neuerungen in ODF 1.4 aus der
    Spezifikation selbst prüfen.
15. **Portable EPUBs / Bene / Nota:** Wurde das Projekt nach Januar 2024 weitergeführt?
16. **Ink & Switch:** Ein ausdrückliches Projekt „HTML document“ / Single-File-HTML-Dokumentstandard
    wurde nicht gefunden. Falls der Auftraggeber ein bestimmtes Projekt meint, bitte Namen oder
    Link nachliefern.
17. **CRDT-Historie als Revisionsspur:** Ist eine Automerge-Änderungshistorie rechtlich für
    Revisionssicherheit (GoBD/BAO) verwertbar? Gehört zur Recherche „Recht und Vertrauen“.
18. **BFO-Vortrag „HTML vs PDF“ (PDF Days 2025):** nicht ausgewertet (Datei zu groß für das
    Abruf-Werkzeug). Er enthält vermutlich die Gegenposition der PDF-Industrie und sollte für
    `01-stand-der-technik.md` gelesen werden.
