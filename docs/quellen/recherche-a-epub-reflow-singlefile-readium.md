# Recherche A: EPUB, Reflow-Modi, Single-File-HTML, Readium-Ökosystem

**Projekt:** html-Pro – Phase 1 (Recherche)
**Stand:** 11.10.2026
**Zweck:** Rohnotizen als Grundlage für `docs/01-stand-der-technik.md`. Jede Aussage hat eine URL. Was sich nicht belegen ließ, steht als **OFFENE FRAGE** im Text und gesammelt am Ende.

## Methodik und Verlässlichkeit der Zitate

- Recherchiert wurde mit Websuche, Abruf der Seiten und, wo Seiten zu lang oder per Skript gerendert waren, mit direktem Download des HTML/JSON und Volltextsuche darin.
- **[V]** = Zitat wurde per Volltextabgleich direkt aus dem Original (HTML/JSON/Release-Notes) extrahiert und ist wortgetreu.
- **[A]** = Zitat stammt aus einem automatisierten Seitenauszug (WebFetch). Der Wortlaut ist sehr wahrscheinlich korrekt, sollte aber vor einer Veröffentlichung am Original gegengeprüft werden.
- **[S]** = Aussage nur aus dem Snippet einer Suchmaschine; das Original war nicht abrufbar (z. B. blockiert `helpx.adobe.com` automatisierte Abrufe mit HTTP 403). Schwächerer Beleg.
- Wörtliche Zitate stehen in „…“ und bleiben in der Originalsprache (Englisch).
- Fallstrick, der aufgefallen ist: Automatisierte Auszüge von GitHub-Release-Seiten lieferten zweimal falsche Jahreszahlen (2024 statt 2026). Release-Daten unten sind deshalb über die GitHub-API (`gh api`) geprüft.

---

## 1. EPUB 3.3 / 3.4, Reading Systems, Accessibility

### 1.1 Was ist es, wer steckt dahinter

- EPUB ist ein ZIP-Container (OCF) mit Package-Dokument (XML), XHTML/SVG-Inhalten, CSS, optional JavaScript, Medien und Navigation. Selbstbeschreibung: „a distribution and interchange format for digital publications and documents“, das Webinhalte „for distribution in a single-file container“ verpackt ([W3C-Pressemitteilung 2023](https://www.w3.org/press-releases/2023/epub33-rec); [W3C-News EPUB 3.4](https://w3.org/news/2026/w3c-invites-implementations-of-epub-3-4-epub-reading-systems-3-4-and-epub-accessibility-1-2)). [A]
  → Die Spezifikation beansprucht ausdrücklich auch „documents“, nicht nur Bücher.
- Träger: Ursprünglich das IDPF. Seit dem **30.01.2017** ist das IDPF mit dem W3C zusammengelegt, und das IDPF hat seine Tätigkeit als Mitgliederorganisation eingestellt ([W3C-Pressemitteilung 2017](https://www.w3.org/press-releases/2017/idpf-w3c-combination); [IDPF: „IDPF Has Combined With W3C“](https://idpf.org/node/3449)).
- Heute pflegt die **Publishing Maintenance Working Group (PMWG)** des W3C die Spezifikationen. Charter: **11.02.2025 bis 05.02.2027** ([PMWG-Charter](https://www.w3.org/groups/wg/pm/charters/active/)). [A]
- Herausgeber von EPUB 3.3/3.4: Matt Garrish (DAISY Consortium) und Ivan Herman (W3C) ([EPUB 3.3](https://www.w3.org/TR/epub-33/)).

### 1.2 Reifegrad und Stand 2025/2026

| Spezifikation | Status | Datum | Quelle |
|---|---|---|---|
| EPUB 3.3 | W3C Recommendation, erstmals | 25.05.2023 | [W3C-PR](https://www.w3.org/press-releases/2023/epub33-rec), [DAISY](https://daisy.org/?p=5899) |
| EPUB 3.3 (aktuelle Fassung) | Recommendation, „This version“ REC-epub-33-20260113 | 13.01.2026 | [EPUB 3.3](https://www.w3.org/TR/epub-33/) [V] |
| EPUB-3.3-Pflegeupdate | „final update to EPUB 3.3“, ohne neue Features | Blog vom 23.04.2025 | [W3C-Blog](https://w3.org/blog/2025/epub3-3-recommendations-published-work-begins-on-new-features) [A] |
| EPUB Reading Systems 3.3 | Recommendation (REC-epub-rs-33-20241017) | 17.10.2024 | [EPUB RS 3.3](https://www.w3.org/TR/epub-rs-33/) [A] |
| EPUB Accessibility 1.1 | Recommendation (REC-epub-a11y-11-20241017) | 17.10.2024 (Fassung) | [EPUB A11y 1.1](https://www.w3.org/TR/epub-a11y-11/) [A] |
| EPUB 3.4 | Candidate Recommendation Snapshot am 21.07.2026; aktuell CR **Draft** vom 02.10.2026 | frühestens Rec ab 19.10.2026 | [CR 21.07.2026](https://www.w3.org/TR/2026/CR-epub-34-20260721/), [aktuelle Fassung](https://www.w3.org/TR/epub-34/) [V] |
| EPUB Reading Systems 3.4 | Candidate Recommendation | 21.07.2026 | [EPUB RS 3.4](https://www.w3.org/TR/2026/CR-epub-rs-34-20260721/) |
| EPUB Accessibility 1.2 | Candidate Recommendation | 21.07.2026 | [W3C-News](https://w3.org/news/2026/w3c-invites-implementations-of-epub-3-4-epub-reading-systems-3-4-and-epub-accessibility-1-2), [CR](https://www.w3.org/TR/2026/CR-epub-a11y-12-20260721/) |

- Kommentarfrist für EPUB 3.4 / RS 3.4 / A11y 1.2: bis **19.10.2026** ([W3C-News](https://w3.org/news/2026/w3c-invites-implementations-of-epub-3-4-epub-reading-systems-3-4-and-epub-accessibility-1-2)). [A]
- EPUB 3.4 bezeichnet sich als „the fourth major revision of the standard“ (ebd.). [A]

**Inhaltliche Änderungen in EPUB 3.4** (aus dem Change Log der aktuellen Fassung, [EPUB 3.4, Anhang I](https://www.w3.org/TR/epub-34/)) [V]:
- 18.12.2025: „Added support for roll layouts in the new fixed layout section.“ (Webtoons, vertikal scrollende Comics)
- 18.12.2025: `rendition:flow`, `rendition:orientation`, `rendition:spread` (samt Overrides) wurden auf die Liste „outdated features“ gesetzt (Verweis auf Issue 2841 und einen WG-Beschluss). Ein Suchmaschinen-Snippet begründete das mit wenig genutzten, von Reading Systems oft ignorierten Layout-Attributen. Die Originalquelle dieses Snippets ließ sich nicht zuordnen → Begründung als **OFFENE FRAGE** behandeln (Issue 2841 lesen).
- 10.10.2025: Font-Obfuscation wurde als „obsolete but conforming“ eingestuft, dazu „Added caution that SHA-1 is being phased out so other methods of protecting fonts than the font obfuscation are advised.“
- 08.04.2025: „Added early support for HTML syntax.“ Dann 11.11.2025: „Removed support for the HTML syntax.“ → **Für html-Pro wichtig:** EPUB bleibt bei XHTML (XML-Syntax). Der Versuch, normale HTML-Syntax zuzulassen, wurde zurückgenommen.
- 19.02.2025: „Clarified that script modules, such as WebAssembly, fall under the existing exemption for resources not used by reading systems.“
- Neue Bildformate: AVIF (06.10.2025), JPEG XL (23.01.2026).
- 18.06.2026: „Added watermarking to privacy considerations.“
- Laut Charter neu in Arbeit: **EPUB 3.4 Annotations** auf Basis des W3C Web Annotation Data Model, Ziel Februar 2027 ([PMWG-Charter](https://www.w3.org/groups/wg/pm/charters/active/)). [A]
- Laut Charter **ausdrücklich nicht** im Arbeitsumfang: DRM, neue Packaging-Formate sowie Features, die von „Open Web technologies (e.g., HTML, CSS or SVG)“ abweichen (ebd.). [A]

### 1.3 Kann EPUB „Dokumente statt Bücher“?

- Der Anspruch steht in der Spezifikation („digital publications and documents“, s. o.).
- Praxisversuch Behörde: Das EU-Amt für Veröffentlichungen hat 2012 die Konvertierung von PDF nach EPUB ausgeschrieben, um Veröffentlichungen „to the largest number of citizens possible“ zugänglich zu machen ([Ausschreibung AO 10461](https://op.europa.eu/en/web/about-us/ao-10461-conversion-of-publications-from-pdf-to-e-book-epub-format-)). [A] Wie viele EU-Dokumente heute tatsächlich als EPUB erscheinen → **OFFENE FRAGE**.
- Bildungsprofil **EDUPUB** („EPUB for Education“) des IDPF: Das IDPF-Board hob es im Juli 2015 auf Draft-Status. Ein Entwurf ist vom 22.02.2016 ([IDPF EDUPUB](https://idpf.org/edupub); [EDUPUB-Profil](https://idpf.org/epub/profiles/edu/10/)). [S] Ein Abschluss als Standard ist nicht belegt → **OFFENE FRAGE** (vermutlich mit der IDPF-Auflösung 2017 versandet).
- Laut W3C-Umfrage 2020 erstellt „nearly half“ der Verlage zusätzlich zum EPUB ein PDF, vor allem wegen Formatierungsanforderungen ([W3C-Blog, EPUB Survey Results, 25.05.2020](https://www.w3.org/blog/2020/publishingw3c-epub-survey-results)). [A]
- Fazit aus den Belegen: Formal kann EPUB Dokumente transportieren. Es gibt aber keinen belegten breiten Einsatz für Geschäftsdokumente wie Verträge, Rechnungen oder Formulare. Ein solcher Einsatz wäre eine Nischenbehauptung → als **OFFENE FRAGE** behandeln.

### 1.4 Web Publications / Publication Manifest / Audiobooks: warum eingestellt?

- **Web Publications** (W3C, Publishing WG) wurde am **13.08.2019** als Note archiviert: „Due to the lack of practical business cases for Web Publications, and the consequent lack of commitment to implement the technology, the Publishing Working Group has chosen to publish this document as a Note …“ ([Web Publications](https://www.w3.org/TR/wpub/)). [A]
- Begründung im W3C-Blog (Wendy Reid, 07.08.2019): „a lack of implementer and industry resource availability to complete the work in the chartered timeframe. There was not a clear and immediate business case for the specification.“ ([W3C-Blog](https://www.w3.org/blog/2019/08/changes-to-the-publication-schedule-for-the-publishing-working-group)). [A]
- **Packaged Web Publications** wurde ebenfalls nur als Note veröffentlicht (01.10.2020) ([PWPUB-Note](https://www.w3.org/TR/2020/NOTE-pwpub-20201001)).
- **Publication Manifest** (JSON) lief separat weiter. **Audiobooks** wurde am **10.11.2020** W3C Recommendation, als „profile of the Publication Manifest specification“ ([Audiobooks](https://www.w3.org/TR/audiobooks/)). [A]
- Lehre für html-Pro: Ein web-nativer Publikationsstandard scheiterte 2019 nicht an der Technik, sondern an fehlenden Implementierern und fehlendem Geschäftsmodell. **Dieses Risiko trifft html-Pro direkt.**

### 1.5 Grenzen im Detail

#### Layoutkontrolle
- Reading Systems dürfen Autoren-CSS überschreiben. RS 3.3: Reading Systems „SHOULD NOT override the EPUB creator's style sheets“, aber „MAY override parts of the EPUB creator's style sheet because of user interaction“ ([EPUB RS 3.3, §6.3](https://www.w3.org/TR/epub-rs-33/)). [V]
- Die Spezifikation fordert nur eine Empfehlung, keine Pflicht: „Reading system developers should implement CSS support at the level of major browsers and publicly document their user agent style sheets“ (ebd.). [V]
- Klagen aus der E-Book-Produktion, gesammelt im Readium-CSS-Projekt: „the app overriding styles without an explicit demand from the user“, „the complete lack of control over page layout (margins, background, etc.)“, „user overrides which are all or nothing“ ([Readium CSS, #eprdctn requests](https://readium.org/css/docs/CSS24-eprdctn_requests.html)). [A]
- Fixed Layout (`rendition:layout pre-paginated`): genau eine Seite pro Spine-Item, „Reading systems MUST produce exactly one page per spine [itemref]“ ([EPUB RS 3.3](https://www.w3.org/TR/epub-rs-33/)). [A] Das ist Papiersimulation und widerspricht dem Ziel von html-Pro.
- Fixed Layout und Barrierefreiheit (W3C Group Note, 25.09.2025): „making fully accessible fixed layouts presents unique challenges, and may not be possible in many cases“ sowie „EPUB creators who have to meet specific accessibility conformance requirements may find that reflowable publications are the only option at this time.“ ([EPUB FXL A11y Note](https://www.w3.org/TR/2025/NOTE-epub-fxl-a11y-20250925)). [A]
- DAISY Knowledge Base: „the lack of reading system support in EPUB for rerendering fixed layout pages as they scale makes it impossible to author conforming content at this time.“ ([DAISY KB, Reflow](https://kb.daisy.org/publishing/docs/css/reflow.html)). [A]

#### Tabellen
- Empfehlung der Branche für breite Tabellen: Scroll-Container mit `overflow-x: auto` ([EDRLab Qualebook, Regel 78](https://qualebook.edrlab.org/en/rules/078/)). [A]
- DAISY KB: „tables can only be compressed so much, whereas using CSS styling allows authors to change from grid layouts to a single column“ ([DAISY KB, Reflow](https://kb.daisy.org/publishing/docs/css/reflow.html)). [A]
- Readium CSS nennt als größte Produktionsprobleme: „author's sizing is not respected, image is cut-off“ und „broken media queries (which makes responsive design impossible)“ ([Readium CSS, #eprdctn](https://readium.org/css/docs/CSS24-eprdctn_requests.html)). [A]
- Problemberichte zu abgeschnittenen Tabellen beim EPUB-Export aus InDesign: [Adobe Community](https://community.adobe.com/t5/indesign-discussions/large-tables-cut-off-in-flowable-epub-export/td-p/15456042). [S]

#### Scripting
- Die Spezifikation unterscheidet zwei Kontexte, „container constrained“ (Script in einem `iframe`) und „spine level“ (Script direkt im Top-Level-Dokument) ([EPUB 3.3, §6.3.2.2](https://www.w3.org/TR/epub-33/)). [V]
- Wörtlich zu Spine-Level-Scripts: „EPUB creators should note that support for spine-level scripting in reading systems is only recommended in fixed-layout documents and reflowable documents set to scroll … Furthermore, reading system support in all other contexts is optional. Top-level content documents that include spine-level scripting SHOULD remain consumable by the user without any information loss or other significant deterioration when scripting is disabled or not available“ (ebd.). [V]
- Reading Systems: „Reading systems SHOULD support scripting“, also **keine Pflicht**. Sie MÜSSEN eine eindeutige Origin pro Publikation vergeben und „MAY place additional limitations on the capabilities provided to scripts“ ([EPUB RS 3.3, §6.4](https://www.w3.org/TR/epub-rs-33/)). [V]
- Sicherheitsmodell, wörtlich: „Reading systems should treat all scripts as untrusted (and potentially malicious)“ (ebd., Security). [V]
- Interoperabilität aus dem offiziellen W3C-Testbericht für EPUB 3.3 (eigene Auswertung der JSON-Reports, [Repo](https://github.com/w3c/epub-tests/tree/main/epub33/reports), [Ergebnisseite](https://w3c.github.io/epub-tests/epub33/results.html)) [V]:
  - Test `scr-support` („whether a simple inline script is executed at all“, [Testbeschreibung](https://github.com/w3c/epub-tests/blob/main/tests/scr-support/EPUB/package.opf)) bestanden Apple Books (iOS, macOS), Colibrio, Kobo (E-Reader, iOS, Web), Thorium 2.2, Tolino Web, VitalSource (alle Varianten) und PUBLUS Android. **VOYAGER BinB** hat ihn nicht bestanden. Für **Google Play Books** liegen keine Scripting-Ergebnisse vor (alle Felder leer).
  - Fortgeschrittene Tests fallen deutlich schlechter aus. `scr-support_origin_unique` (eindeutige Origin) bestanden nachweislich nur Apple Books (iOS/macOS) und Thorium. `sec-untrusted-consent_scripting` (Zustimmung bei nicht vertrauenswürdigen, seitengeladenen Publikationen) bestand nur Apple Books iOS.
  - Gesamtquote aller EPUB-3.3-Tests (bestanden/getestet): Colibrio 141/164, Thorium 2.2 129/169, Apple Books iOS 106/155, Tolino Web 92/167, Kobo iOS 83/164, Kobo E-Reader 60/111, VOYAGER BinB 25/87, Google Play Books Android 34/43 (nur 43 Tests eingetragen).
  - Hinweis: Die Reports sind Momentaufnahmen. Das Repo wurde am 15.07.2026 auf 3.4 umgestellt („archived 33 test data“). Laut [GitHub-API](https://api.github.com/repos/w3c/epub-tests/contents/reports) liegen für EPUB 3.4 bisher Reports von PUBLUS Android (24.09.2026) und VOYAGER BinB (08.09.2026) vor.
- Plattformen:
  - **Google Play Books**: „Google Play Books doesn't support non-standard audio or video tags, or interactive functionality such as that enabled by JavaScript code.“ ([Google Play Books Partner-Hilfe](https://support.google.com/books/partner/answer/3316879?hl=en)). [A]
  - **Apple Books**: „EPUBs with JavaScript interactivity require Apple Books 1.5.“ ([Apple Books Asset Guide](https://help.apple.com/itc/booksassetguide/en.lproj/itc8f38db680.html)). [A]
  - W3C-Umfrage 2020: Zu den am schwersten umzusetzenden Bereichen zählten Media Overlays, Fixed Layout und „Javascript support“. Nur 5 von 14 Reading-System-Entwicklern implementierten alle EPUB-Spezifikationen, Hauptgrund „lack of ROI“ ([W3C-Blog, 25.05.2020](https://www.w3.org/blog/2020/publishingw3c-epub-survey-results)). [A]
- **Sicherheit in der Praxis:**
  - KU Leuven / imec-DistriNet (Franken, Van Goethem, Joosen; Black Hat Europe 2021): 97 EPUB-Apps auf sieben Plattformen und fünf E-Reader untersucht. Etwa die Hälfte folgte den Sicherheitsempfehlungen der Spezifikation nicht. In 16 Apps konnte ein bösartiges E-Book Informationen über das lokale Dateisystem abgreifen. Es gab praktische Angriffe auf Kindle und Apple Books ([Black-Hat-Abstract](https://infocondb.org/con/black-hat/black-hat-europe-2021/how-your-e-book-might-be-reading-you-exploiting-epub-reading-systems); [Paper-Eintrag imec](https://imec-publications.be/handle/20.500.12860/36715)). [A]
  - **Thorium Reader 3.3.0 (09.12.2025)** schloss eine kritische RCE-Lücke. Wörtlich: „a successful attack would require no user interaction other than opening and reading an EPUB file containing malicious Javascript“ und „The security hole would allow malicious Javascript to escape the web browser sandbox and to run programs on the victim's computer.“ ([Thorium-Release v3.3.0](https://github.com/edrlab/thorium-reader/releases/tag/v3.3.0)). [V]
  - → **Direkt relevant für html-Pro:** Ein Reader für interaktive HTML-Dokumente auf Electron/Chromium-Basis hat genau diese Angriffsfläche.

#### Signaturen (META-INF/signatures.xml, XML-DSig)
- Die Spezifikation sagt wörtlich: „Adding a digital signature is not a guarantee that a malicious actor cannot tamper with an EPUB publication as reading systems do not have to check signatures. The OPTIONAL signatures.xml file in the META-INF directory holds digital signatures for the container and its contents.“ ([EPUB 3.3, §4.2.6.3.6](https://www.w3.org/TR/epub-33/)). [V] Derselbe Wortlaut steht in [EPUB 3.4](https://www.w3.org/TR/epub-34/). [V]
- Signaturformat: Elemente vom Typ `Signature` nach [xmldsig-core1] (ebd.). [V]
- RS 3.3 regelt nur die Reihenfolge von Entschlüsselung und Digest („Before computing the digest … reading systems MUST decrypt any data encrypted after signing“), aber keine Prüfpflicht ([EPUB RS 3.3, §4.1.3](https://www.w3.org/TR/epub-rs-33/)). [V]
- RS 3.3 (Änderung vom 07.06.2022): „Noted that unsigned EPUB publications represent a security risk and added recommendation to treat sideloaded unsigned publications as untrusted.“ (ebd., Change Log). [V]
- EPUB-3-Community-Group, Protokoll vom 17.01.2019: Konsens, dass „the reading system is not obligated to support signatures“ ([Protokoll](https://www.w3.org/2019/01/17-epub3cg-minutes.html)). [A]
- Der offizielle W3C-Testkatalog (211 Tests) enthält **keinen einzigen Test für signatures.xml**. Signaturbezogen finden sich nur die Font-Obfuscation-Tests (eigene Auswertung über die [GitHub-API](https://api.github.com/repos/w3c/epub-tests/contents/tests)). [V]
- EPUB 3.4 stuft den Linktyp `xml-signature` als „deprecated“ ein ([EPUB 3.4, E.2](https://www.w3.org/TR/epub-34/)). [V]
- Leonard Rosenthol (Adobe, C2PA) am 26.11.2023: C2PA 1.4 „includes supports for EPUB“ (Einbettung von Manifesten in ZIP-basierte Formate) ([W3C-Liste public-tdmrep](https://lists.w3.org/Archives/Public/public-tdmrep/2023Nov/0009.html)). [A]
- **Bewertung:** signatures.xml ist ein totes Feature. Kein großes Reading System prüft nachweislich Signaturen. Welcher Reader überhaupt eine Signaturprüfung anbietet, ließ sich nicht belegen → **OFFENE FRAGE**.

#### Verschlüsselung / encryption.xml / Font-Obfuscation
- `encryption.xml` beschreibt verschlüsselte Ressourcen nach XML Encryption. Jede Datei wird einzeln verschlüsselt, wörtlich: „Encryption in this way exposes the directory structure and file naming of the whole package.“ ([EPUB 3.3, §4.2.6.3.2](https://www.w3.org/TR/epub-33/)). [V]
- ZIP-eigene Verschlüsselung ist verboten: Reading Systems „MUST treat any OCF ZIP container that uses [zip] encryption features as in error“ ([EPUB RS 3.3](https://www.w3.org/TR/epub-rs-33/)). [A]
- Font-Obfuscation ist laut Spezifikation keine Verschlüsselung: „This specification does not claim that obfuscation constitutes encryption“ ([EPUB 3.3, §4.4.2](https://www.w3.org/TR/epub-33/)). [V] In 3.4 ist sie als „outdated“ eingestuft (s. o.).

#### DRM: Readium LCP
- „Readium LCP is an ISO International Standard, referenced as ISO/IEC 23078-2:2024.“ Betreiber ist EDRLab (Paris, gemeinnützig, gegründet 2015). Schützt EPUB, PDF und Audiobooks ([EDRLab Readium LCP](https://www.edrlab.org/readium-lcp/); [ISO 84957](https://www.iso.org/standard/84957.html)). [A]
- Verbreitung laut EDRLab: „more than 12 million ebooks in 84 countries“ bzw. „100+ countries“. Die Angaben sind widersprüchlich und stammen vom Hersteller (ebd.). [A]
- LCP ist ein Rechtekontroll- und Leihmodell für Verlage und Bibliotheken (Passphrase, Lizenz). Ob es für Geschäftsdokumente (Vertraulichkeit statt Kopierschutz) passt, ist nicht belegt → **OFFENE FRAGE**.

#### Druck
- EPUB-Spezifikationen regeln keinen Druck. Belege für die Druckunterstützung der Reader sind dünn: Apple Books soll nur PDFs drucken können, nicht EPUB ([Chron, schwache Quelle](https://smallbusiness.chron.com/need-certain-printer-ibooks-64986.html)). [S] → **OFFENE FRAGE**: systematischer Vergleich der Druckfunktionen von Thorium, Apple Books, Kobo und Calibre.

### 1.6 EPUB Accessibility 1.1 und der European Accessibility Act

- Anforderungen: mindestens WCAG 2.0 Level A, „strongly recommended“ Level AA. Pflichtmetadaten sind `accessMode`, `accessibilityFeature` und `accessibilityHazard` (schema.org), empfohlen `accessibilitySummary` und `accessModeSufficient`. Konformitätsangabe über `dcterms:conformsTo` („EPUB Accessibility 1.1 - WCAG 2.x Level AA“) und `a11y:certifiedBy` ([EPUB A11y 1.1](https://www.w3.org/TR/epub-a11y-11/)). [A]
- Die Spezifikation nennt Gesetzgebung als Motiv, unter anderem „Directive 2019/882“, also den EAA (ebd.). [A]
- ISO-Fassung: ISO/IEC 23761:2021 „Digital publishing — EPUB accessibility — Conformance and discoverability requirements for EPUB publications“ ([ISO-Komitee](https://committee.iso.org/standard/76860.html?browse=ics)). [S] Auf welcher Version (1.0 oder 1.1) sie beruht → **OFFENE FRAGE**.
- EAA: anwendbar seit **28.06.2025** auch auf E-Books, die Verbrauchern angeboten werden ([EBSCO-Blog](https://about.ebsco.com/blogs/ebscopost/what-eaa-and-ada-title-ii-mean-accessible-e-books); [IPA-Übersicht, PDF](https://internationalpublishers.org/wp-content/uploads/2024/08/European-Accessibility-Act-EAA-An-overview-of-publishing-industry-standards-for-e-books-e-commerce-platforms-and-accessibility-metadata.pdf)). [S]
- Fondazione LIA (Mussinelli, Pellegrino, Molinari, Audrain, 10.06.2021): „the EPUB format is fully compliant with the Directive“, aber „it is not enough to reach the single A level, as some requirements of the double A level are necessary“ ([Fondazione LIA](https://www.fondazionelia.org/en/research-and-development/european-accessibility-act-requirements-are-publishing-standards-as-epub-onix-and-schema-org-fully-compliant/); [FEP-Bericht, PDF](https://fep-fee.eu/IMG/pdf/20210610_european_accessibility_act_report_on_the_state_of_the_art_of_publishing_standards.pdf)). [A]
- EPUB Accessibility 1.2 (CR 2026): „The accessModeSufficient property is now required and the accessMode property is only recommended.“ ([DAISY KB – What's new](https://kb.daisy.org/publishing/docs/new/index.html)). [A] Welche WCAG-Version 1.2 voraussetzt, sollte am CR-Text geprüft werden → **OFFENE FRAGE** (der Blog von 2025 nennt den geplanten Wechsel „from WCAG 2.0 to 2.1 or 2.2“, [W3C-Blog](https://w3.org/blog/2025/epub3-3-recommendations-published-work-begins-on-new-features)).
- Prüfwerkzeug: Ace by DAISY ([Eden-Übersicht](https://about.eden.co.uk/resources/epub3-accessibility-european-accessibility-act-publishers)). [S]

### 1.7 Stärken / Schwächen (EPUB)

**Stärken**
- Offener W3C-Standard, aktiv gepflegt (3.4 kurz vor Recommendation), ISO-Bezüge (ISO/IEC 23761 für A11y, ISO/IEC 23078-2 für LCP; dass ISO/IEC 23736 EPUB 3.0.1 abbildet, ist hier nicht eigens belegt → prüfen).
- Fertiges Container-Modell (ZIP + Manifest + Spine + Navigation), Metadatenmodell, Media Overlays (Text-Audio-Synchronisation).
- Ein ausgereiftes Barrierefreiheitsmodell inklusive Konformitäts- und Auffindbarkeitsmetadaten, im EAA-Kontext etabliert.
- Große, quelloffene Infrastruktur (Readium, Thorium, epubcheck, Ace).

**Schwächen**
- Scripting ist optional, schlecht interoperabel und sicherheitskritisch (Leuven-Studie, Thorium-RCE).
- Signaturen nicht geprüft und nicht getestet, Verschlüsselung praktisch nur als DRM (LCP).
- Reading Systems überschreiben das Layout. Fixed Layout ist der Ausweg der Branche, aber Papiersimulation und schlecht barrierefrei.
- Nur XHTML-Syntax, der HTML-Syntax-Versuch wurde zurückgenommen.
- Der Ökosystem-Fokus liegt auf Handel, Bibliotheken und Bildung, nicht auf Geschäftsdokumenten. Die web-native Weiterentwicklung (Web Publications) ist 2019 gescheitert.

### 1.8 Eignung für html-Pro

| Baustein | Bewertung | Begründung |
|---|---|---|
| EPUB 3.3/3.4 als **Containerformat** (OCF/ZIP, Package, Spine, Nav) | **teilweise** | Das Container- und Manifestmodell ist erprobt und lässt sich übernehmen oder ableiten. Es ist an XHTML gebunden, Scripting und Signaturen sind nur „SHOULD/optional“, und vorhandene Reader würden html-Pro-Dokumente uneinheitlich darstellen. |
| EPUB als **fertiger Ersatz** für PDF-Geschäftsdokumente | **ungeeignet** | Es gibt keine geprüften Signaturen, keine verlässliche Interaktivität, keine Layoutgarantie und keinen belegten Einsatz für Geschäftsdokumente. |
| EPUB Fixed Layout | **ungeeignet** | Simuliert Papier und ist laut W3C-Note oft nicht barrierefrei zu machen. |
| EPUB Accessibility 1.1/1.2 (Metadaten- und Konformitätsmodell) | **trägt** | Kann fast 1:1 als Barrierefreiheitsschicht übernommen werden und ist im EAA-Umfeld anerkannt. |
| Readium LCP | **teilweise** | Ein ISO-standardisiertes DRM, aber auf das Verlagsgeschäft zugeschnitten. Für vertrauliche Geschäftsdokumente müsste man den Bedarf erst klären. |
| Publication Manifest / Audiobooks (JSON-Manifest) | **teilweise** | Als JSON-Manifest-Vorbild brauchbar. Die eingestellten Web Publications sind eine Warnung vor dem „Implementierer-Problem“. |

---

## 2. Adobe Liquid Mode und Reflow-Modi (Acrobat, Foxit, PDF Expert)

Hinweis: `helpx.adobe.com` blockierte alle automatisierten Abrufe (HTTP 403, auch mit Browser-User-Agent). Adobe-Aussagen stammen deshalb aus den inhaltsgleichen Adobe-Entwicklerseiten (`adobe.com/devnet-docs`, abrufbar) oder aus Such-Snippets der helpx-Seiten [S].

### 2.1 Was ist Liquid Mode, wer steckt dahinter

- Adobe hat Liquid Mode am **23./24.09.2020** vorgestellt. Die Funktion nutzt Adobe Sensei (KI/ML), um Überschriften, Absätze, Listen, Tabellen und Bilder in einem PDF zu erkennen und mobil umzubrechen ([TheNextWeb, 24.09.2020](https://thenextweb.com/news/adobe-pdf-responsive-ai-liquid-mode); [Adobe-Pressemitteilung via CSRwire](https://csrwire.com/press-release/adobe-unveils-ambitious-multi-year-vision-for-pdf-introduces-liquid-mode/)). [S]
- Adobe-Entwicklerdoku: „Liquid Mode is a revolutionary mobile reading experience powered by Adobe Sensei“ mit einem „running layout that is similar to viewing HTML pages on the web“ ([Adobe devnet Android](https://www.adobe.com/devnet-docs/acrobat/android/en/lmode.html)). [A]
- Funktionen: Gliederung, ein- und ausklappbare Abschnitte, Suche, einstellbare Schriftgröße und Abstände; „This experience does not change any content“ (ebd.; [Adobe devnet iOS](https://www.adobe.com/devnet-docs/acrobat/ios/en/lmode.html)). [A]
- Zur Einführung hieß es, Liquid Mode sei „built on top of the rich capabilities of PDF, including the semantics of Tagged PDF“ ([Suchauszug Adobe-PR/3BL](https://app.3blmedia.com/news/adobe-unveils-ambitious-multi-year-vision-pdf-introduces-liquid-mode)). [S]

### 2.2 Plattformen und Reifegrad

- Start nur in Acrobat Reader für iOS und Android (dazu Play-Store-fähige Chromebooks), Desktop „at a later date“ ([TechRadar](https://www.techradar.com/news/adobe-announces-biggest-change-to-the-pdf-in-a-generation); [IDM](https://idm.net.au/node/13128)). [S]
- Adobe-Marketingseite: mobil iOS 14+ und Android 5+, „Desktop: Chromebook devices only“ ([Adobe – What is Liquid Mode](https://www.adobe.com/au/acrobat/hub/what-is-adobe-liquid-mode.html)). [A]
- Liquid Mode gibt es auch in **Acrobat Sign** (mobile Web-Signatur). Erzeugt wird die Ansicht serverseitig, denn bei Fehlern heißt es, die Vereinbarung werde „with the PDF view only“ erstellt ([helpx: Acrobat Sign Liquid Mode, Suchauszug](https://helpx.adobe.com/sign/using/adobe-sign-liquid-mode.html)). [S]
- **OFFENE FRAGE:** Gibt es 2026 Liquid Mode in Acrobat für Windows/macOS? Weder ein Beleg dafür noch einer dagegen ließ sich finden. Seit 2020 heißt es nur „später“.

### 2.3 Grenzen (offizielle Adobe-Angaben)

- Ausdrücklich nicht oder eingeschränkt kompatibel sind laut Adobe: „More than 200 pages“, „More than 10 MB in size“, gescannte Dateien, aus Präsentationen konvertierte Dateien, verschlüsselte oder passwortgeschützte Dateien, nicht unterstützte Sprachen sowie „Complex layouts (eg. tickets, statements, invoices, receipts etc.)“ ([Adobe devnet iOS](https://www.adobe.com/devnet-docs/acrobat/ios/en/lmode.html); [Adobe devnet Android](https://www.adobe.com/devnet-docs/acrobat/android/en/lmode.html)). [A]
- Dieselbe Liste nennt die helpx-Seite, ergänzt um „documents with dense tables or multiple images“ ([helpx Liquid Mode, Suchauszug](https://helpx.adobe.com/acrobat/mobile/view-manage-files/liquid-mode.html); [helpx Technische Anforderungen, Suchauszug](https://helpx.adobe.com/acrobat/mobile/get-started/technical-requirements.html)). [S]
- Tabellen und Bilder: Adobe rät von Liquid Mode bei Dokumenten ab, die „mostly tables and charts, such as spreadsheets“ oder „mostly images, such as illustrations and CAD drawings“ sind ([Adobe devnet Android](https://www.adobe.com/devnet-docs/acrobat/android/en/lmode.html)). [A]
- Hardware: mindestens 1 GB RAM ([helpx Technische Anforderungen, Suchauszug](https://helpx.adobe.com/acrobat/mobile/get-started/technical-requirements.html)). [S]
- Sprachen: iOS-Doku nennt 17 Sprachen (Englisch, Spanisch, Französisch, Deutsch, Niederländisch, Dänisch, Finnisch, Italienisch, Norwegisch, Portugiesisch, Schwedisch, Kroatisch, Ungarisch, Polnisch, Rumänisch, Russisch, Türkisch) ([Adobe devnet iOS](https://www.adobe.com/devnet-docs/acrobat/ios/en/lmode.html)). [A] Die Acrobat-Sign-Doku nennt eine abweichende Liste, u. a. mit Katalanisch, Galicisch, Indonesisch und Malaiisch ([helpx Sign, Suchauszug](https://helpx.adobe.com/sign/using/adobe-sign-liquid-mode.html)). [S]
- Barrierefreiheit: Adobe selbst schreibt: „For documents that have already been made accessible, screen reader users may find the original layout (non-Liquid Mode) a better experience.“ und „Alternative text currently cannot be generated for images and not all document types, such as forms, can be converted yet.“ ([Adobe Blog, 10.12.2020](https://blog.adobe.com/en/publish/2020/12/10/adobe-delivers-enhanced-pdf-reading-experience-for-accessibility)). [A]
- **Inhaltsverlust in der Praxis:** Ein Nutzer meldete am 11.07.2023 „significant parts of input text are not seen“ in Liquid Mode. Adobe fragte nach Beispieldateien, eine Lösung ist nicht dokumentiert ([Adobe Community](https://community.adobe.com/t5/acrobat-reader-mobile-discussions/liquid-mode-errors/td-p/13929562)). [A] Einzelfall, keine Statistik.
- Fachkritik (Harry McCracken, zitiert bei Michael Tsai, 23.09.2020): unterstützt „some of the most familiar types of PDFs, such as forms, slideshows, scans“ nicht ([mjtsai.com](https://mjtsai.com/blog/2020/09/23/pdf-liquid-mode/)). [A]
- The Register (24.09.2020): Liquid Mode „works as advertised, on documents that it supports“, aber „the pain of PDF, especially on mobile, is not altogether over yet“ ([The Register](https://www.theregister.com/2020/09/24/adobe_liquid_mode_pdf_mobile/)). [A]

### 2.4 Cloud-Verarbeitung und Datenschutz

- Adobe, wörtlich: „Files are processed in our secure data servers and immediately deleted from our servers after the experience is generated. Your files are kept private unless you share them with others.“ ([Adobe devnet iOS](https://www.adobe.com/devnet-docs/acrobat/ios/en/lmode.html)). [A]
- The Register: Nutzer müssen sich bei Adobe anmelden, „Liquid Mode sends content to Adobe in order to process it“ ([The Register](https://www.theregister.com/2020/09/24/adobe_liquid_mode_pdf_mobile/)). [A]
- **OFFENE FRAGEN:** Serverstandort (EU?), Rechtsgrundlage nach DSGVO, ob die Daten zum Training genutzt werden, und ob getaggte PDFs lokal ohne Upload umgebrochen werden. Dazu fand sich keine Adobe-Aussage.
- Folgerung für html-Pro: Liquid Mode ist der Beleg, dass nachträgliches Reflow von PDF **KI und Server braucht**, an Seiten- und Größengrenzen stößt und bei Tabellen, Formularen und Rechnungen versagt, also genau bei Geschäftsdokumenten. Das stützt den Ansatz, die Struktur von Anfang an im Format zu haben statt sie zu rekonstruieren.

### 2.5 Acrobat-Reflow (Desktop, „Ansicht > Zoom > Umfließen“)

- Reflow zeigt das PDF „temporarily … as a single column that is the width of the document pane“ ([helpx: Reading PDFs with reflow, Suchauszug](https://helpx.adobe.com/acrobat/using/reading-pdfs-reflow-accessibility-features.html)). [S]
- Laut derselben Seite fließen nicht um: Formulare, Kommentare, Signaturfelder und Seitenartefakte (Seitenzahlen, Kopf- und Fußzeilen). Seiten mit Text **und** Formular- oder Signaturfeldern fließen gar nicht um. **Speichern, Bearbeiten und Drucken sind im Reflow-Modus nicht möglich** (ebd.). [S]
- Tagged PDF: Acrobat taggt ungetaggte Dokumente vor dem Umfließen temporär. Bei getaggten PDFs hängt das Ergebnis von der Inhalts- bzw. Lesereihenfolge ab (ebd.; [helpx: Accessibility features, Suchauszug](https://helpx.adobe.com/acrobat/using/accessibility-features-pdfs.html)). [S]
- Clemson University (Barrierefreiheitsleitfaden): „Reflow is not available for all PDFs. For example, PDFs with forms or digital signature fields may not reflow as expected.“, und „reflow follows a PDF's order“ ([Clemson](https://www.clemson.edu/accessibility/digital/guides/pdf/fundamentals/reflow.html)). [A]

### 2.6 Foxit Reflow

- Desktop (Foxit PDF Editor Windows): „choose Home > Reflow, or choose View > Reflow“. Einschränkungen: „Text in comments and form fields does not reflow“ und „Vertical text reflows horizontally“. Reine Ansicht, das Dokument bleibt unverändert ([Foxit-Hilfe](https://resource-cms.foxit.com/foxit-pdf-editor-for-windows/read-pdf-in-reflow-view)). [A]
- Mobil (Foxit PDF Editor 12): Schriftgröße einstellbar, Bilder lassen sich ein- und ausblenden ([Foxit Mobile Handbuch](https://help.foxit.com/manuals/pdf-editor/mobile/en_us/12.0.0/Adjust_PDF_Views.html)). [A]
- **OFFENE FRAGE:** Ob Foxit Tags auswertet oder heuristisch vorgeht, ob lokal oder in der Cloud verarbeitet wird, und ob es ein KI-gestütztes Reflow wie Liquid Mode gibt. Dazu wurde nichts gefunden.

### 2.7 PDF Expert (Readdle) – Reading Mode

- „With PDF Expert Reading Mode, you don't need to waste time manually zooming through the PDF text just to make it readable.“ Die Ausgabe ist einspaltig, Abbildungen, Tabellen und Formeln werden angepasst. Laut Hilfe gibt es den Modus **nur auf dem iPhone**, und „Your original PDF document isn't being altered in any way, PDF Expert simply creates a temporary new view for it.“ ([Readdle-Support](https://support.readdle.com/pdfexpert/en_US/reading-pdfs/reading-mode); [PDF-Expert-Blog](https://pdfexpert.com/blog/reading-mode)). [A]
- **OFFENE FRAGE:** Ob PDF Expert lokal oder in der Cloud verarbeitet und welche Grenzen gelten (Seiten, Größe). Readdle macht dazu keine Angabe.

### 2.8 Eignung für html-Pro

| Technologie | Bewertung | Begründung |
|---|---|---|
| Adobe Liquid Mode | **ungeeignet** (als Basis) | Proprietär, nur mobil (Desktop unbelegt), Cloud-Pflicht, Grenzen von 200 Seiten und 10 MB, versagt bei Rechnungen, Formularen und Tabellen. Wertvoll als **Bedarfsbeleg** und als Warnung, wie teuer nachträgliches Reflow ist. |
| Acrobat Reflow | **ungeeignet** | Reine Ansicht, kein Speichern, Drucken oder Bearbeiten, keine Formulare oder Signaturfelder, abhängig von Tags. |
| Foxit Reflow / PDF Expert Reading Mode | **ungeeignet** | Reine Ansichtsmodi mit denselben Grundgrenzen. Als UX-Referenz für den „Lesemodus“ des html-Pro-Readers brauchbar. |
| Prinzip „Reflow aus Tagged PDF“ | **teilweise** | Für den Übergang **PDF → html-Pro** relevant: Gut getaggte PDFs lassen sich strukturiert überführen, ungetaggte nur mit KI-Heuristik und Verlusten. |

---

## 3. Single-File-HTML: Eine Webseite in EINER Datei, offline und signierbar?

### 3.1 MHTML

- Standard: RFC 2557 (März 1999, Proposed Standard), MIME `multipart/related` mit `Content-Location`, ursprünglich für E-Mail ([RFC 2557](https://rfc-editor.org/rfc/rfc2557)).
- Browser:
  - Chrome ab Version 86 kann MHTML erzeugen. Firefox unterstützt MHTML nicht, die früheren Erweiterungen funktionieren seit Firefox 57 nicht mehr. Safari hat die native MHTML-Unterstützung aufgegeben und nutzt stattdessen das proprietäre Web-Archive-Format ([Wikipedia: MHTML](https://en.wikipedia.org/wiki/MHTML)). [S]
  - Chromium-Verhalten nach Eric Lawrence (09.02.2022, aktualisiert 21.03.2024): „Reloading a saved MHTML file in Edge/Chrome/Chromium/etc will disable script.“ Chromium entfernt beim Speichern `<script>` und `<noscript>`, Formularfelder sind beim Laden deaktiviert, und „very restrictive rules for Same-Origin-Policy evaluation“ blockieren oft eingebettete Ressourcen ([textslashplain.com](https://textslashplain.com/2022/02/09/mhtml-in-chromium/)). [A]
- Signatur: Im Format nicht vorgesehen. Denkbar wäre S/MIME-Signatur des MIME-Containers, aber kein Browser prüft sie → **OFFENE FRAGE** (nicht belegt).
- **Eignung: ungeeignet.** Kein JavaScript, keine Formulare, keine Firefox/Safari-Unterstützung, keine Signaturprüfung.

### 3.2 Web Bundles / Web Packaging / Signed HTTP Exchanges (SXG)

- Konzept: Web Bundles bündeln HTTP-Ressourcen in einer Datei (CBOR). SXG signiert einzelne HTTP-Antworten im Namen der Origin ([WICG webpackage, Explainer](https://github.com/WICG/webpackage/blob/master/explainers/authoritative-site-sharing.md)). [S]
- Status:
  - Chrome-Doku: „The experimental implementation of navigation to Web Bundles was removed from Chrome in February 2023.“ ([Chrome for Developers: Web Bundles](https://developer.chrome.com/docs/web-platform/web-bundles)). [A]
  - Die IETF-Arbeitsgruppe **WPACK ist „Concluded“** ([IETF Datatracker WPACK](https://datatracker.ietf.org/wg/wpack/about/)). Der Draft `draft-ietf-wpack-bundled-responses` ist abgelaufen, letzte Aktualisierung laut Datatracker-Suchauszug 25.12.2021 ([Datatracker](https://datatracker.ietf.org/doc/draft-ietf-wpack-bundled-responses)). [S]
  - Mozilla stuft Web Packaging/SXG als **„negative“** ein (Label vom 13.09.2024). Martin Thomson (01.02.2018): „This is potentially very harmful“, mit Bedenken zu Origin-Substitution und Vertraulichkeit ([Mozilla standards-positions #29](https://github.com/mozilla/standards-positions/issues/29)). [A]
  - **SXG wird abgekündigt:** Google Trust Services stellt ab etwa **30.09.2026** keine SXG-Zertifikate mehr aus. Begründung: „The Signed HTTP Exchange standard was not widely adopted and it is not being evolved“, außerdem „diverging from the rest of the Web PKI“ (Ankündigung vom 28.07.2026, [Google PKI Updates](https://developers.google.com/public-key-infrastructure/updates/july2026-sxg-deprecation)). [A] Dass Cloudflare und Google Search SXG/AMP ebenfalls 2026 beenden, stammt nur aus einer Sekundärquelle ([issoh.co.jp](https://www.issoh.co.jp/md/column/8049)) [S] → **OFFENE FRAGE**, primär prüfen.
  - Subresource-Bundles (`<script type="webbundle">`) wurden mit Chrome 104 eingeführt (Jeff Kaufman, 30.08.2022). Brave deaktivierte die Funktion wegen möglicher Umgehung von Adblockern ([jefftk.com](https://www.jefftk.com/p/built-in-bundling-for-faster-loading)). [A] Ob das 2026 noch ausgeliefert wird → **OFFENE FRAGE**.
- **Eignung: ungeeignet.** Die Navigation wurde entfernt, die IETF-Gruppe ist beendet, SXG wird abgekündigt, Mozilla ist dagegen.

### 3.3 Isolated Web Apps (IWA) mit Signed Web Bundles

- „Isolated Web Apps (IWAs) provide an isolated, bundled, versioned, signed, and trusted application model built on top of the existing web platform“. Alle Ressourcen liegen in einem **Signed Web Bundle** (`.swbn`). Signiert wird mit Ed25519- oder ECDSA-P-256-Schlüsseln. Das Schema ist `isolated-app://`, die Identität ist an den Schlüssel gebunden ([Chrome for Developers: IWA-Einführung, Stand 06.02.2026](https://developer.chrome.com/docs/iwa/introduction)). [A]
- Aufbau: CBOR-Sequenz aus „Integrity Block“ (Signaturstapel mit Public Keys) plus Web Bundle. Ein Integrity Block v2 existiert, ist aber „hasn't been spec'd yet“ ([Chromium-Doku IWA](https://chromium.googlesource.com/chromium/src/+/a3dafb8/docs/webapps/isolated_web_apps.md)). [S]
- Verfügbarkeit: „will only be available to Chrome Enterprise administered ChromeOS devices and select development partners“ ([IWA-Einführung](https://developer.chrome.com/docs/iwa/introduction)). [A] Intent to Ship vom 12.07.2024 (Ziel Chrome 128). Signale von Gecko und WebKit: „No signal“ ([blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/iMfYonTs414/m/tgT7z51CBAAJ)). [A]
- **Eignung: teilweise, nur als Konzeptvorlage.** Das Signaturmodell (Integrity Block, Ed25519, an den Schlüssel gebundene Identität) ist ein gutes Vorbild für html-Pro-Dokumentsignaturen. Als Laufzeitplattform ist es ungeeignet: nur Chrome, nur ChromeOS-Enterprise, für Apps gedacht, nicht für Dokumente.

### 3.4 SingleFile (Gildas Lormeau)

- Web-Erweiterung plus CLI, „save a complete web page into a single HTML file“. Läuft in Chrome, Firefox (Desktop und Mobil), Edge, Safari, Vivaldi, Brave, Opera u. a. Lizenz AGPL, kommerzielle Lizenz auf Anfrage ([GitHub SingleFile](https://github.com/gildas-lormeau/SingleFile)). [A]
- Aktiv gepflegt: v1.29.0 vom **10.10.2026**, v1.28.1 vom 04.10.2026 (per `gh api` geprüft, [Releases](https://github.com/gildas-lormeau/SingleFile/releases)). [V]
- Das Format „self-extracting ZIP“ (HTML/ZIP-Polyglot): „The self-extracting ZIP files created by SingleFile are essentially regular ZIP files. They take advantage of the flexibility in the ZIP specification, which allows for additional data to be included before and after the ZIP payload.“ ([SingleFile FAQ](https://github.com/gildas-lormeau/SingleFile/blob/master/faq.md)). [A] Die Daten vor dem ZIP bilden den HTML-Anfang, die Daten danach das HTML-Ende. Weil Chromium und WebKit lokale Dateizugriffe sperren, kodiert das „universal“-Format die Seite in windows-1251 und liest die Binärdaten aus dem DOM ([SingleFileZ-FAQ, Suchauszug](https://github.com/gildas-lormeau/SingleFileZ/blob/master/faq.md)). [S]
- SingleFileZ ist inzwischen „completely merged into SingleFile“ ([GitHub SingleFileZ](https://github.com/gildas-lormeau/SingleFileZ)). [A]
- Scripts: „By default, SingleFile removes scripts because they can alter the rendering and there is no guarantee they will work offline.“ ([SingleFile FAQ](https://github.com/gildas-lormeau/SingleFile/blob/master/faq.md)). [A]
- Signatur: Keine Funktion belegt → **OFFENE FRAGE** (eventuell via ZIP-Kommentar oder externe Signatur, nicht recherchiert).
- **Eignung: teilweise.** Der Polyglot-Trick (Datei öffnet sich als HTML im Browser **und** ist ein ZIP-Container) ist eine sehr interessante Option für html-Pro: Ohne Reader fällt die Datei auf eine Browseransicht zurück, mit Reader ist sie ein voller Container. Er beruht aber auf Hacks rund um `file://`-Restriktionen. Interaktivität und Signatur sind nicht gelöst.

### 3.5 WARC / WACZ (Webrecorder)

- WARC ist ISO 28500 (2009, revidiert 2017) und speichert vollständige HTTP-Transaktionen. Gepflegt wird es vom IIPC ([Wikipedia: WARC](https://en.wikipedia.org/wiki/WARC_(file_format)); [ISO 28500:2017 Katalog](https://iteh.es/catalog/standards/iso/c9357a41-7b66-42d9-90b6-cb1010899eec/iso-28500-2017)). [S]
- WACZ 1.1.1: „WACZ is a media type that allows web archive collections to be packaged and shared on the web as a discrete file.“ Bestandteile: `datapackage.json` (Frictionless Data Package), `archive/` (WARC), `indexes/` (CDXJ), `pages/pages.jsonl`. Optional `datapackage-digest.json` mit SHA-256-Hash ([WACZ 1.1.1](https://specs.webrecorder.net/wacz/1.1.1/)). [A]
- **WACZ Signing and Verification 0.1.0** ist „working draft for a proposal“. Varianten: anonym (ECDSA-Schlüssel) oder Domain-Identität (der TLS-Schlüssel der Domain signiert, Prüfung über Certificate Transparency), dazu RFC-3161-Zeitstempel. Grenze, wörtlich: Das Verfahren „requires trusting the client, and possible trusted third party 'observer' that signs the web archive“ ([WACZ-Auth 0.1.0](https://specs.webrecorder.net/wacz-auth/0.1.0/)). [A]
- Wiedergabe: ReplayWeb.page ist „a serverless (client side) replay tool“ mit Optionen für Offline-Betrieb und Desktop-App ([ReplayWeb.page Docs](https://replayweb.page/docs/)). [A] Lizenz AGPL-3.0 ([GitHub-API](https://github.com/webrecorder/replayweb.page)). [V]
- **Eignung: teilweise.** Stark für **Archivierung und Beweissicherung** (ISO-Standard, Signatur- und Zeitstempelentwurf), also für die Archivschicht von html-Pro relevant. Als Autoren- und Austauschformat ungeeignet: Es speichert HTTP-Verkehr statt Dokumentsemantik und braucht einen Replay-Viewer.

### 3.6 data:-URIs

- MDN: „Chromium and Firefox limit data URLs to 512MB, and Safari (WebKit) limits them to 2048MB.“ Firefox hob das Limit in Version 97 von 256 KB auf 32 MB und in Version 136 auf 512 MB an. „top-level navigation to data: URLs is blocked in all modern browsers.“ ([MDN data: URLs](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/data)). [A]
- Base64 bläht Binärdaten um etwa ein Drittel auf (allgemein bekannt, hier nicht eigens belegt → bei Bedarf belegen).
- **Eignung: teilweise.** Eine Technik zum Inlinen kleiner Assets in eine HTML-Datei, aber kein Container- und kein Signaturkonzept.

### 3.7 `file://`-Restriktionen (Querschnitt)

- ES-Module und `fetch()` aus `file://` scheitern in Chrome mit „origin 'null'“ (CORS). Belegt nur durch Entwicklerforen ([Code with Mosh Forum](https://forum.codewithmosh.com/t/es6-module-error/4480); [webOS-Forum](https://forum.webostv.developer.lge.com/t/module-script-loads-blocked-under-file-origin-for-installed-webos-app-no-cors-workaround-found/28351)). [S] → Primärquelle (HTML-Spec bzw. Chromium-Doku) noch nachtragen (**OFFENE FRAGE**).
- Folge: Eine einzelne HTML-Datei kann aus dem Dateisystem nur eingeschränkt interaktiv sein (Inline-Scripts ja, Module und Fetch auf Nachbarressourcen nein). Dasselbe Problem zwingt SingleFile zu seinem Workaround (s. o.).

### 3.8 Antwort auf die Leitfrage

**Kann man eine Webseite heute tragfähig in EINE Datei packen, offline und signierbar?**

- **In eine Datei, offline, nur ansehen:** Ja. SingleFile-HTML (alle Browser), MHTML (nur Chromium), WACZ (mit Viewer). Interaktivität geht dabei in der Regel verloren (MHTML: Scripts deaktiviert, SingleFile: Scripts standardmäßig entfernt).
- **Signierbar und vom Standardbrowser geprüft:** **Nein.** Kein browserübergreifend unterstütztes Format existiert. SXG wird abgekündigt, Web-Bundle-Navigation ist entfernt, Signed Web Bundles gibt es nur für ChromeOS-Enterprise-IWAs. EPUB-Signaturen werden nicht geprüft, WACZ-Signing ist ein Entwurf.
- **Folgerung für html-Pro:** Ein-Datei-Offline-Signatur geht nur mit **eigenem Container und eigenem Prüfer** (Reader). Kandidaten für das Signaturmodell sind der Integrity Block der Signed Web Bundles, WACZ-Signing (mit RFC-3161-Zeitstempel), C2PA (unterstützt laut Rosenthol ZIP-basierte Formate) und für eIDAS-Fragen ASiC bzw. XAdES (nicht Teil dieser Recherche → **OFFENE FRAGE** für Recherche „Vertrauen und Recht“). Ein HTML/ZIP-Polyglot nach SingleFile-Art könnte als Rückfallebene sorgen, dass die Datei auch ohne Reader im Browser lesbar ist.

### 3.9 Eignungstabelle Single-File

| Technologie | Bewertung | Kurzbegründung |
|---|---|---|
| MHTML | ungeeignet | Kein JS, keine Formulare, kein Firefox, keine Signatur |
| Web Bundles / SXG | ungeeignet | Navigation entfernt (2023), WPACK beendet, SXG abgekündigt (2026), Mozilla dagegen |
| Signed Web Bundles / IWA | teilweise (Konzept) | Gutes Signaturmodell, aber nur ChromeOS-Enterprise und für Apps gedacht |
| SingleFile (inkl. HTML/ZIP-Polyglot) | teilweise | Rückfallebene „öffnet im Browser“; Hacks um `file://`, ohne JS, ohne Signatur |
| WARC/WACZ | teilweise | Archivschicht und Beweissicherung; kein Autorenformat |
| data:-URIs | teilweise | Inline-Technik, kein Container |

---

## 4. Readium und das EPUB-Reader-Ökosystem

### 4.1 Readium Foundation, EDRLab, Toolkits

- Readium Foundation: „foster the development of an open and modern collaborative playground for digital reading technologies“ ([readium.org](https://readium.org/)). [A] Mitgliedsorganisation mit Board-Wahlen (ebd.). Vorstand laut Suchauszug u. a. Laurent Le Meur (Präsident) ([blog.readium.org](https://blog.readium.org)). [S]
- Aktive Projekte ([Readium Projects](https://readium.org/development/projects)) [A]:
  - **Readium Mobile**: „the Readium toolkit dedicated to iOS and Android reading apps; written in Swift (iOS) and Kotlin (Android).“
  - **Readium Desktop**: TypeScript, Node.js, Electron (Basis von Thorium).
  - **Readium Web**: „dedicated to Web apps managing Readium Web Publications; written in typescript.“
  - **Readium LCP** sowie die Altprojekte Readium JS und Readium SDK (C++) im Wartungsmodus.
- Aktuelle Releases (per `gh api` geprüft) [V]:
  - Swift Toolkit: 3.11.0 (17.07.2026), 4.0.0-alpha.1 (14.08.2026), 4.0.0-alpha.2 (18.09.2026) ([Releases](https://github.com/readium/swift-toolkit/releases)). 4.0.0-alpha.2 unterstützt Publikationen, die reflowable und fixed-layout Ressourcen mischen [A].
  - Kotlin Toolkit: 3.2.0 (13.05.2026), 3.3.0 (02.06.2026), 3.4.0 (11.09.2026) ([Releases](https://github.com/readium/kotlin-toolkit/releases)).
  - ts-toolkit (Web): navigator 2.12.1 und shared 2.8.0 (09.10.2026) ([GitHub](https://github.com/readium/ts-toolkit)). Selbstbeschreibung: „A toolkit for ebooks, audiobooks and comics written in Typescript.“ [A]
  - Readium CSS: v2.0.5 (13.05.2026).
  - Lizenz aller genannten Readium-Repos und von Thorium: **BSD-3-Clause** ([GitHub-API](https://github.com/readium)). [V]
- Readium Web Publication Manifest (RWPM): „a JSON-based document meant to represent and distribute publications over HTTPS“, Grundlage von OPDS 2.0, mit Profilen für EPUB, Audiobook, DiViNa und PDF. Verpackt wird im Readium Packaging Format (`.webpub`, `.audiobook`) ([GitHub webpub-manifest](https://github.com/readium/webpub-manifest)). [A]

### 4.2 Thorium Reader (EDRLab)

- Kostenloser Desktop-Reader für Windows 10/11, macOS und Linux. Unterstützt EPUB 2/3, EPUB FXL, PDF, DAISY 2.02/3, W3C- und Readium-Audiobooks, DiViNa sowie LCP. Basis: Readium Desktop mit Electron, Node.js, TypeScript und React. „Massive efforts are made to make Thorium Reader highly accessible“ (JAWS, NVDA, VoiceOver) ([EDRLab Thorium](https://www.edrlab.org/software/thorium-reader/)). [A]
- Releases: v3.5.0 (28.08.2026, Electron 41 / Chromium 146), v3.5.1 (02.09.2026) ([Releases](https://github.com/edrlab/thorium-reader/releases); Daten per `gh api` geprüft). [V]
- v3.3.0 (09.12.2025): kritische RCE-Lücke durch JavaScript in EPUB (Zitat in 1.5). [V]
- epubtest.org: Thorium erreicht 100 % in den Basistests zur Barrierefreiheit mit JAWS, NVDA und Narrator ([epubtest.org Results](https://epubtest.org/results)). [A]

### 4.3 Kommerzielle Reader

- **Apple Books:** JavaScript wird unterstützt („EPUBs with JavaScript interactivity require Apple Books 1.5“) ([Apple Books Asset Guide](https://help.apple.com/itc/booksassetguide/en.lproj/itc8f38db680.html)) [A]. Im W3C-Test 106/155 (iOS) bzw. 82/132 (macOS) ([W3C epub-tests](https://github.com/w3c/epub-tests/tree/main/epub33/reports)) [V].
- **Google Play Books:** kein JavaScript bzw. keine Interaktivität. „Individual features of EPUB 3 may not be supported across all the platforms where Google Play Books can be read.“ ([Partner-Hilfe](https://support.google.com/books/partner/answer/3316879?hl=en)) [A]. Im W3C-Bericht nur sehr wenige eingetragene Tests (Android 34/43, Web 6/10, iOS 0/1) [V].
- **Kobo:** zwei Rendering-Engines. Normales EPUB läuft über **Adobe RMSDK**, `.kepub` über eine neuere WebKit-basierte Engine ([drweb.de, Michael Dobler, 16.06.2026](https://www.drweb.de/gueltiges-epub-das-kobo-trotzdem-nicht-oeffnet/); [MobileRead](https://www.mobileread.com/forums/showthread.php?p=4340656)) [A/S].
  - Fallbeispiel 2026: Ein EPUB, das epubcheck 3.3 bestand, öffnete sich auf Kobo nicht. Ursache war **eine** CSS-Zeile `max-width: min(150px, 30vw)`. RMSDK sei auf dem CSS-Stand von etwa 2013 stehengeblieben und kenne weder Flexbox noch Grid noch CSS-Mathefunktionen ([drweb.de](https://www.drweb.de/gueltiges-epub-das-kobo-trotzdem-nicht-oeffnet/); Original: André Klein, „Your EPUB Is Fine. Kobo Disagrees. Blame Adobe“, gespiegelt bei [GIGAZINE](https://gigazine.net/gsc_news/en/20260616-epub-kobo-adobe)). [A]
  - Das Werkzeug **kobofix** entstand als Reaktion: RMSDK „discards the entire stylesheet“, sobald es `calc()`, `min()`, `max()`, `clamp()`, `var()` oder `env()` trifft. Außerdem lehnen strenge Reader ZIP-Packaging-Fehler (mimetype nicht zuerst bzw. komprimiert) als „corrupted“ ab ([PyPI kobofix](https://pypi.org/project/kobofix/)). [A]
- **Calibre:** Kovid Goyal 2012: „calibre does not support epub 3 at all. Features of epub 3 that work, work by accident, not design.“ ([MobileRead, 01.07.2012](https://www.mobileread.com/forums/showthread.php?p=2133536)). [A] **Veraltet.** Der aktuelle EPUB-3-Stand von Calibre wurde nicht recherchiert → **OFFENE FRAGE**.

### 4.4 Warum wirken EPUB-Reader so oft schlecht? (belegte Ursachen)

1. **Paginierung per CSS-Multicolumn, einer Notlösung.**
   - Readium CSS: „Contents are paginated using CSS multicolumns, for several reasons: it's been cross-platform for a long time, it's responsive, it's tried and tested …“ ([Readium CSS, Injection and pagination](https://readium.org/css/docs/CSS03-injection_and_pagination.html)). [A]
   - EDRLab (Laurent Le Meur, 26.09.2018): „we are obliged to use CSS multi-columns, the only technology available on all browser engines, but somewhat flawed“, und „all reading engine developers need browser engines to support a better solution for paginating content on screen“ ([EDRLab, W3C Tokyo Workshop Teil 2](https://www.edrlab.org/?p=9768)). [A]
   - Jiminy Panoz (Readium-CSS-Autor), 03.02.2018: „we have a huge issue right now in EPUB with vertical writing: there's nothing in CSS multicol, CSS overflow, etc. to deal with it.“ ([public-publ-wg](https://lists.w3.org/Archives/Public/public-publ-wg/2018Feb/0023.html)). [A]
   - Readium-CSS-Fortschrittsbericht (16.07.2017): Paged Overflow, Custom Elements, Shadow DOM und CSS Regions wurden geprüft und wegen „terrible or not widespread enough“ Unterstützung verworfen ([EDRLab](https://www.edrlab.org/?p=9254)). [A]
2. **Fragmentierung der Reading Systems und veraltete Engines.**
   - Kobo/RMSDK (s. o.): valide Dateien scheitern an CSS von 2013.
   - W3C-Umfrage 2020: „EPUB is fine, but reading systems limit it's potential“. Nur 5 von 14 RS-Entwicklern implementieren alles, wegen „lack of ROI“. Wunsch nach modernem CSS (Grid, Flexbox) ([W3C-Blog 2020](https://www.w3.org/blog/2020/publishingw3c-epub-survey-results)). [A] Zusätzlich lieferte ein Such-Snippet, dass „67%“ der Verlage uneinheitliche Barrierefreiheitsunterstützung über Reading Systems erleben. Die Herkunft ist unklar (vermutlich [W3C-Webinar 2020, PDF](https://www.w3.org/2020/07/publ-webinar/PublishingJuly2020_Japan.pdf)) [S] → **OFFENE FRAGE**.
   - W3C-Testbericht EPUB 3.3: Gesamtquoten zwischen 25/87 (VOYAGER) und 141/164 (Colibrio), siehe 1.5 [V].
3. **Reader überschreiben Autoren-CSS.** Die Spezifikation erlaubt es bei Nutzerinteraktion („MAY override“) ([RS 3.3](https://www.w3.org/TR/epub-rs-33/)) [V]. In der Praxis überschreiben Apps auch ohne Nutzerwunsch ([Readium CSS #eprdctn](https://readium.org/css/docs/CSS24-eprdctn_requests.html)) [A].
4. **Scripting abgeschaltet oder inkonsistent.** Google Play Books hat kein JS, Apple Books hat JS. Fortgeschrittene Scripting-Tests bestehen fast nur Apple und Thorium (s. 1.5). Das Thema ist sicherheitskritisch (Leuven-Studie, Thorium-RCE).
5. **Fixed-Layout-Probleme.** Kaum barrierefrei (W3C-Note 2025), Zoom skaliert nur die ganze Seite ([DAISY KB](https://kb.daisy.org/publishing/docs/css/reflow.html)). FXL-Steuerattribute wie `rendition:spread` und `rendition:orientation` wurden in 3.4 als „outdated“ eingestuft ([EPUB 3.4 Change Log](https://www.w3.org/TR/epub-34/)) [V]. Die Begründung (geringe Umsetzung?) ist noch offen, siehe 1.2.
6. **Fonts.** Font-Obfuscation „isn't implemented everywhere, which is a huge issue for fixed-layout“ ([Readium CSS #eprdctn](https://readium.org/css/docs/CSS24-eprdctn_requests.html)) [A]. In EPUB 3.4 ist sie abgewertet (SHA-1) [V].
7. **Barrierefreiheit uneinheitlich (epubtest.org, DAISY).** Basistests (Prozent bestanden, je Reader, Hilfstechnik und Plattform): Thorium, EasyReader und Colibrio 100 %, Kobo 53–60 %, Kindle (TalkBack/iOS) 86,67 %, Adobe Digital Editions 33,33 % (iOS) bzw. **6,67 % (Android)**, Google Play Books 73–80 % ([epubtest.org Results](https://epubtest.org/results)). [A] Prüfdaten der einzelnen Ergebnisse sind auf der Übersichtsseite nicht angegeben → **OFFENE FRAGE** (Aktualität).

### 4.5 Was heißt das für einen eigenen Reader (html-Pro)?

- Jeder Reader, der auf Browser-Engines aufsetzt, erbt deren Paginierungsdefizite. html-Pro sollte deshalb **nicht paginieren** (Scrollen und responsives Layout als Normalfall) und Paginierung nur für Druck und Export anbieten. Das deckt sich mit dem Ziel „Papier nicht simulieren“.
- **Kontrolle über die Engine** ist entscheidend: Die Kobo/RMSDK-Erfahrung zeigt, dass ein Format nur so gut ist wie der schwächste verbreitete Reader. Ein Standard ohne eigenen, verlässlichen Referenz-Reader wiederholt das EPUB-Problem.
- **Scripting nur mit hartem Sandbox-Modell** (eindeutige Origin, CSP, keine Node- oder Electron-Brücke). Thorium 3.3.0 zeigt, dass schon ein einzelnes EPUB-Script zur RCE führen kann.
- **Wiederverwendbar:** Readium-Toolkits (BSD-3) für Navigation, Locator- und Annotationsmodell, TTS und LCP; Readium CSS als Erfahrungsschatz für Nutzereinstellungen (Schrift, Abstände, Themen) ohne die Paginierungslogik; das EPUB-A11y-Metadatenmodell; epubtest.org als Vorbild für eine öffentliche Konformitäts-Testsuite.

### 4.6 Eignung für html-Pro

| Baustein | Bewertung | Begründung |
|---|---|---|
| Readium Mobile (Swift/Kotlin) | **trägt** (als Baustein) | BSD-3, aktiv gepflegt (Releases 2026), ausgereifte Navigator- und Locator-Modelle; muss für html-Pro angepasst werden |
| Readium Web (ts-toolkit) | **teilweise** | Aktiv (Release 09.10.2026), web-nativ, aber auf EPUB/RWPM-Paginierung ausgerichtet |
| Readium CSS | **teilweise** | Wissen über Nutzereinstellungen wertvoll, Multicolumn-Paginierung nicht übernehmen |
| Readium Web Publication Manifest | **teilweise** | JSON-Manifest mit Profilen als direkte Vorlage für ein html-Pro-Manifest |
| Thorium Reader | **teilweise** | Referenz für barrierefreie Desktop-Reader (Electron). Die RCE-Historie zeigt das Sicherheitsrisiko der Architektur |
| Apple Books / Google Play Books / Kobo / Calibre als Zielplattform | **ungeeignet** | Proprietäre, fragmentierte Engines, die html-Pro nicht kontrollieren kann |

---

## 5. Querschnitt: Kernaussagen für das Konzept

1. **EPUB ist der nächste Verwandte und zeigt die Fallen.** Ein Container mit HTML-Inhalt funktioniert technisch. Es scheitert an optionalem Scripting, ungeprüften Signaturen, überschriebenem Layout und einer Reader-Landschaft ohne Anreiz zur vollständigen Umsetzung („lack of ROI“).
2. **Web-native Publikationsstandards sind schon einmal gescheitert** (Web Publications 2019, Web Packaging/SXG 2021–2026), jeweils an fehlenden Implementierern oder fehlender Herstellerunterstützung, nicht an der Technik.
3. **Reflow aus PDF ist teuer und begrenzt** (Liquid Mode: Cloud, 200 Seiten, 10 MB, keine Rechnungen, Formulare oder Tabellen). Struktur muss von Anfang an im Format liegen.
4. **Eine Datei, offline, signiert und vom Browser geprüft gibt es 2026 nicht.** html-Pro braucht einen eigenen Prüfer bzw. Reader. Die Polyglot-Datei (HTML + ZIP) ist eine mögliche Rückfallebene.
5. **Sicherheit ist der kritische Pfad** bei interaktiven Dokumenten: Leuven-Studie 2021 und Thorium-RCE 2025.

---

## Quellenliste

### W3C / Standards
- EPUB 3.3: https://www.w3.org/TR/epub-33/ (Fassung https://www.w3.org/TR/2026/REC-epub-33-20260113/)
- EPUB Reading Systems 3.3: https://www.w3.org/TR/epub-rs-33/
- EPUB Accessibility 1.1: https://www.w3.org/TR/epub-a11y-11/
- EPUB 3.4 (CRD 02.10.2026): https://www.w3.org/TR/epub-34/ ; CR 21.07.2026: https://www.w3.org/TR/2026/CR-epub-34-20260721/
- EPUB Reading Systems 3.4: https://www.w3.org/TR/2026/CR-epub-rs-34-20260721/
- EPUB Accessibility 1.2: https://www.w3.org/TR/2026/CR-epub-a11y-12-20260721/
- W3C-News EPUB 3.4 CR: https://w3.org/news/2026/w3c-invites-implementations-of-epub-3-4-epub-reading-systems-3-4-and-epub-accessibility-1-2
- W3C-Blog 2025 (EPUB 3.3 Update / 3.4-Pläne): https://w3.org/blog/2025/epub3-3-recommendations-published-work-begins-on-new-features
- PMWG-Charter: https://www.w3.org/groups/wg/pm/charters/active/
- W3C-Pressemitteilung EPUB 3.3 (2023): https://www.w3.org/press-releases/2023/epub33-rec
- DAISY zu EPUB 3.3: https://daisy.org/?p=5899
- W3C/IDPF-Zusammenschluss: https://www.w3.org/press-releases/2017/idpf-w3c-combination ; https://idpf.org/node/3449
- Web Publications (Note): https://www.w3.org/TR/wpub/
- Packaged Web Publications (Note): https://www.w3.org/TR/2020/NOTE-pwpub-20201001
- Audiobooks (Rec): https://www.w3.org/TR/audiobooks/
- W3C-Blog 2019 Publishing WG: https://www.w3.org/blog/2019/08/changes-to-the-publication-schedule-for-the-publishing-working-group
- W3C-Blog EPUB Survey 2020: https://www.w3.org/blog/2020/publishingw3c-epub-survey-results
- EPUB FXL Accessibility Note 2025: https://www.w3.org/TR/2025/NOTE-epub-fxl-a11y-20250925
- EPUB 3 CG Protokoll 17.01.2019: https://www.w3.org/2019/01/17-epub3cg-minutes.html
- W3C epub-tests (Reports EPUB 3.3): https://github.com/w3c/epub-tests/tree/main/epub33/reports ; https://w3c.github.io/epub-tests/epub33/results.html
- Testbeschreibung scr-support: https://github.com/w3c/epub-tests/blob/main/tests/scr-support/EPUB/package.opf
- public-tdmrep (Rosenthol, C2PA/EPUB): https://lists.w3.org/Archives/Public/public-tdmrep/2023Nov/0009.html
- public-publ-wg (Panoz 2018): https://lists.w3.org/Archives/Public/public-publ-wg/2018Feb/0023.html
- IDPF EDUPUB: https://idpf.org/edupub ; https://idpf.org/epub/profiles/edu/10/
- ISO/IEC 23761: https://committee.iso.org/standard/76860.html?browse=ics
- ISO/IEC 23078-2 (LCP): https://www.iso.org/standard/84957.html
- RFC 2557 (MHTML): https://rfc-editor.org/rfc/rfc2557
- IETF WPACK: https://datatracker.ietf.org/wg/wpack/about/ ; https://datatracker.ietf.org/doc/draft-ietf-wpack-bundled-responses
- ISO 28500:2017 (WARC): https://iteh.es/catalog/standards/iso/c9357a41-7b66-42d9-90b6-cb1010899eec/iso-28500-2017
- WACZ 1.1.1: https://specs.webrecorder.net/wacz/1.1.1/
- WACZ Signing 0.1.0: https://specs.webrecorder.net/wacz-auth/0.1.0/
- MDN data: URLs: https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/data

### EAA / Barrierefreiheit
- Fondazione LIA: https://www.fondazionelia.org/en/research-and-development/european-accessibility-act-requirements-are-publishing-standards-as-epub-onix-and-schema-org-fully-compliant/
- FEP-Bericht: https://fep-fee.eu/IMG/pdf/20210610_european_accessibility_act_report_on_the_state_of_the_art_of_publishing_standards.pdf
- IPA-Übersicht EAA: https://internationalpublishers.org/wp-content/uploads/2024/08/European-Accessibility-Act-EAA-An-overview-of-publishing-industry-standards-for-e-books-e-commerce-platforms-and-accessibility-metadata.pdf
- EBSCO: https://about.ebsco.com/blogs/ebscopost/what-eaa-and-ada-title-ii-mean-accessible-e-books
- Eden: https://about.eden.co.uk/resources/epub3-accessibility-european-accessibility-act-publishers
- DAISY KB Neuerungen: https://kb.daisy.org/publishing/docs/new/index.html
- DAISY KB Reflow: https://kb.daisy.org/publishing/docs/css/reflow.html
- EDRLab Qualebook Regel 78: https://qualebook.edrlab.org/en/rules/078/
- epubtest.org: https://epubtest.org/ ; https://epubtest.org/results

### Adobe / Reflow
- Adobe devnet Liquid Mode iOS: https://www.adobe.com/devnet-docs/acrobat/ios/en/lmode.html
- Adobe devnet Liquid Mode Android: https://www.adobe.com/devnet-docs/acrobat/android/en/lmode.html
- helpx Liquid Mode (403, Suchauszug): https://helpx.adobe.com/acrobat/mobile/view-manage-files/liquid-mode.html
- helpx Technische Anforderungen (403, Suchauszug): https://helpx.adobe.com/acrobat/mobile/get-started/technical-requirements.html
- helpx Acrobat Sign Liquid Mode (403, Suchauszug): https://helpx.adobe.com/sign/using/adobe-sign-liquid-mode.html
- helpx Reflow (403, Suchauszug): https://helpx.adobe.com/acrobat/using/reading-pdfs-reflow-accessibility-features.html
- helpx Accessibility features (Suchauszug): https://helpx.adobe.com/acrobat/using/accessibility-features-pdfs.html
- Adobe Hub „What is Liquid Mode“: https://www.adobe.com/au/acrobat/hub/what-is-adobe-liquid-mode.html
- Adobe Blog 10.12.2020: https://blog.adobe.com/en/publish/2020/12/10/adobe-delivers-enhanced-pdf-reading-experience-for-accessibility
- Adobe-PR via CSRwire/3BL: https://csrwire.com/press-release/adobe-unveils-ambitious-multi-year-vision-for-pdf-introduces-liquid-mode/ ; https://app.3blmedia.com/news/adobe-unveils-ambitious-multi-year-vision-pdf-introduces-liquid-mode
- The Register 24.09.2020: https://www.theregister.com/2020/09/24/adobe_liquid_mode_pdf_mobile/
- TheNextWeb: https://thenextweb.com/news/adobe-pdf-responsive-ai-liquid-mode
- TechRadar: https://www.techradar.com/news/adobe-announces-biggest-change-to-the-pdf-in-a-generation
- IDM: https://idm.net.au/node/13128
- Michael Tsai: https://mjtsai.com/blog/2020/09/23/pdf-liquid-mode/
- Adobe Community (Liquid Mode errors): https://community.adobe.com/t5/acrobat-reader-mobile-discussions/liquid-mode-errors/td-p/13929562
- Clemson Reflow-Leitfaden: https://www.clemson.edu/accessibility/digital/guides/pdf/fundamentals/reflow.html
- Foxit Reflow Desktop: https://resource-cms.foxit.com/foxit-pdf-editor-for-windows/read-pdf-in-reflow-view
- Foxit Mobile: https://help.foxit.com/manuals/pdf-editor/mobile/en_us/12.0.0/Adjust_PDF_Views.html
- PDF Expert Reading Mode: https://support.readdle.com/pdfexpert/en_US/reading-pdfs/reading-mode ; https://pdfexpert.com/blog/reading-mode

### Single-File / Packaging
- Wikipedia MHTML: https://en.wikipedia.org/wiki/MHTML
- Eric Lawrence, MHTML in Chromium: https://textslashplain.com/2022/02/09/mhtml-in-chromium/
- Chrome Web Bundles: https://developer.chrome.com/docs/web-platform/web-bundles
- WICG webpackage Explainer: https://github.com/WICG/webpackage/blob/master/explainers/authoritative-site-sharing.md
- WICG resource-bundles FAQ: https://github.com/WICG/resource-bundles/blob/main/faq.md
- Mozilla standards-positions #29: https://github.com/mozilla/standards-positions/issues/29
- Google PKI SXG-Ende: https://developers.google.com/public-key-infrastructure/updates/july2026-sxg-deprecation
- issoh.co.jp (Sekundärquelle SXG/AMP): https://www.issoh.co.jp/md/column/8049
- Jeff Kaufman, webbundle: https://www.jefftk.com/p/built-in-bundling-for-faster-loading
- Chrome IWA: https://developer.chrome.com/docs/iwa/introduction
- blink-dev Intent to Ship IWA: https://groups.google.com/a/chromium.org/g/blink-dev/c/iMfYonTs414/m/tgT7z51CBAAJ
- Chromium IWA-Doku: https://chromium.googlesource.com/chromium/src/+/a3dafb8/docs/webapps/isolated_web_apps.md
- SingleFile: https://github.com/gildas-lormeau/SingleFile ; FAQ: https://github.com/gildas-lormeau/SingleFile/blob/master/faq.md ; Releases: https://github.com/gildas-lormeau/SingleFile/releases
- SingleFileZ: https://github.com/gildas-lormeau/SingleFileZ ; FAQ: https://github.com/gildas-lormeau/SingleFileZ/blob/master/faq.md
- ReplayWeb.page: https://replayweb.page/docs/ ; https://github.com/webrecorder/replayweb.page
- Wikipedia WARC: https://en.wikipedia.org/wiki/WARC_(file_format)
- Foren zu file://-Modulen: https://forum.codewithmosh.com/t/es6-module-error/4480 ; https://forum.webostv.developer.lge.com/t/module-script-loads-blocked-under-file-origin-for-installed-webos-app-no-cors-workaround-found/28351

### Readium / Reader
- Readium: https://readium.org/ ; Projekte: https://readium.org/development/projects ; Blog: https://blog.readium.org
- Readium CSS Pagination: https://readium.org/css/docs/CSS03-injection_and_pagination.html
- Readium CSS #eprdctn: https://readium.org/css/docs/CSS24-eprdctn_requests.html
- Readium Web Publication Manifest: https://github.com/readium/webpub-manifest
- Swift Toolkit: https://github.com/readium/swift-toolkit/releases
- Kotlin Toolkit: https://github.com/readium/kotlin-toolkit/releases
- ts-toolkit: https://github.com/readium/ts-toolkit
- EDRLab LCP: https://www.edrlab.org/readium-lcp/
- EDRLab Thorium: https://www.edrlab.org/software/thorium-reader/ ; Releases: https://github.com/edrlab/thorium-reader/releases ; v3.3.0: https://github.com/edrlab/thorium-reader/releases/tag/v3.3.0
- EDRLab Tokyo Workshop 2018: https://www.edrlab.org/?p=9768
- EDRLab Readium CSS Fortschritt 2017: https://www.edrlab.org/?p=9254
- Apple Books Asset Guide: https://help.apple.com/itc/booksassetguide/en.lproj/itc8f38db680.html
- Google Play Books Partner: https://support.google.com/books/partner/answer/3316879?hl=en
- drweb.de Kobo: https://www.drweb.de/gueltiges-epub-das-kobo-trotzdem-nicht-oeffnet/
- GIGAZINE Kobo/Adobe: https://gigazine.net/gsc_news/en/20260616-epub-kobo-adobe
- kobofix: https://pypi.org/project/kobofix/
- MobileRead Kobo-Engines: https://www.mobileread.com/forums/showthread.php?p=4340656
- MobileRead Calibre 2012: https://www.mobileread.com/forums/showthread.php?p=2133536
- Black Hat EU 2021 (Franken): https://infocondb.org/con/black-hat/black-hat-europe-2021/how-your-e-book-might-be-reading-you-exploiting-epub-reading-systems
- imec-Paper: https://imec-publications.be/handle/20.500.12860/36715
- EU-Ausschreibung PDF→EPUB: https://op.europa.eu/en/web/about-us/ao-10461-conversion-of-publications-from-pdf-to-e-book-epub-format-
- Adobe Community InDesign-Tabellen: https://community.adobe.com/t5/indesign-discussions/large-tables-cut-off-in-flowable-epub-export/td-p/15456042
- Chron (Apple Books Druck, schwach): https://smallbusiness.chron.com/need-certain-printer-ibooks-64986.html

---

## Offene Fragen

1. **EPUB-Signaturprüfung:** Gibt es überhaupt ein produktives Reading System, das `signatures.xml` prüft und anzeigt? (Kein Beleg gefunden, keine W3C-Tests.)
2. **EPUB für Geschäftsdokumente:** Gibt es belegte produktive Einsätze (Behörden, Unternehmen) jenseits von Verlagen und Bildung? Wie viele EU-Publikationen erscheinen heute als EPUB?
3. **EDUPUB:** Formaler Endstatus nach Auflösung des IDPF 2017?
4. **ISO/IEC 23761:2021:** Beruht sie auf EPUB Accessibility 1.0 oder 1.1? Gibt es eine Revision?
5. **EPUB Accessibility 1.2:** Welche WCAG-Version ist Mindestanforderung (2.1 oder 2.2)? Am CR-Text prüfen.
6. **Druck aus EPUB-Readern:** Systematischer Vergleich (Thorium, Apple Books, Kobo, Calibre, Readium-Apps) fehlt; die bisherige Quelle ist schwach.
7. **Readium LCP für Geschäftsdokumente:** Eignet es sich für Vertraulichkeit statt Kopierschutz (z. B. Empfängerbindung)? Widersprüchliche Verbreitungszahlen des Herstellers (84 vs. 100+ Länder).
8. **Liquid Mode Desktop:** Gibt es 2026 Liquid Mode in Acrobat für Windows/macOS?
9. **Liquid Mode Datenschutz:** Serverstandort, DSGVO-Rechtsgrundlage, Trainingsnutzung, lokale Verarbeitung getaggter PDFs?
10. **Foxit / PDF Expert:** Lokale oder Cloud-Verarbeitung, Tag-Auswertung, Grenzen (Seiten/Größe), KI-Reflow?
11. **Apple-Richtlinie:** Stimmt die ältere Behauptung (Baldur Bjarnason), Apple verbiete Drittanbieter-Readern die JavaScript-Ausführung in EPUB? Quelle war nicht abrufbar (HTTP 403), App-Store-Richtlinien prüfen.
12. **Calibre heute:** Aktueller EPUB-3-Unterstützungsgrad und JavaScript-Verhalten im Viewer (die Quelle von 2012 ist veraltet).
13. **SXG-Ende bei Google Search und Cloudflare 2026:** Primärquellen fehlen (nur Sekundärquelle).
14. **`<script type="webbundle">`:** Wird es 2026 in Chrome noch ausgeliefert?
15. **MHTML und S/MIME-Signatur:** Gibt es eine praktikable Signaturprüfung für MHTML?
16. **SingleFile und Signatur:** Lässt sich ein HTML/ZIP-Polyglot signieren, ohne die Polyglot-Eigenschaft zu brechen (z. B. Signatur im ZIP-Kommentar oder als ZIP-Eintrag)? Technisch prüfen.
17. **`file://`-Restriktionen:** Primärquelle (HTML-Standard bzw. Chromium-Doku) für die Blockade von ES-Modulen und `fetch()` aus `file://` nachtragen.
18. **eIDAS-Containerformate (ASiC-E/XAdES) und C2PA für ZIP/EPUB:** gehört in die Recherche „Vertrauen und Recht“ und ist hier nicht bearbeitet.
19. **epubtest.org:** Prüfdaten und Versionen der einzelnen Barrierefreiheitsergebnisse, also wie aktuell die Prozentwerte sind.
20. **Base64-Overhead bei data:-URIs:** Formale Quelle nachtragen (RFC 4648).
21. **EPUB 3.4 „outdated“ Layout-Properties:** Offizielle Begründung (Issue 2841, WG-Beschluss) lesen.
22. **„67 % der Verlage“ mit uneinheitlicher A11y-Unterstützung:** Herkunft der Zahl klären.
