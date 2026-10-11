# Recherche B: Recht, Vertrauen, Barrierefreiheit

**Projekt:** html-Pro (PDF-Ablöse durch responsives, interaktives HTML-basiertes Dokumentformat plus Reader/Editor)
**Stand der Recherche:** 11.10.2026 · **Markt:** DACH, Schwerpunkt Deutschland und Österreich
**Zweck:** Rohnotizen für `docs/01-stand-der-technik.md` und `docs/03-konzept.md`, Abschnitt „Recht und Vertrauen“.

## Vorbemerkung zur Methode und Belastbarkeit

- Jede Aussage hat eine URL. Wo möglich wurde die **Primärquelle im Volltext** gelesen (EUR-Lex, gesetze-im-internet.de, RIS, ETSI-PDFs, W3C, C2PA-Spezifikation, KOST, Library of Congress). Stellen, die nur aus Sekundärquellen stammen (Kanzlei-/Beraterblogs, Presse), sind mit **(Sekundärquelle)** markiert.
- Nicht direkt lesbar waren: pdfa.org (HTTP 403), iso.org (403/Cloudflare), bundesfinanzministerium.de (HTTP 503 am 11.10.2026), der Volltext der ERVB 2025 (PDF mit nicht extrahierbarer Schriftkodierung). Aussagen dazu stützen sich auf Sekundärquellen und sind so gekennzeichnet.
- **OFFENE FRAGE** markiert alles, was nicht belegt werden konnte.
- Dies ist keine Rechtsberatung. Bei Auslegungsfragen, etwa ob „Dateiformate von Büro-Anwendungen“ PDF umfasst, steht hier eine begründete Einschätzung und kein Rechtsgutachten.

## Kurzfazit (die zehn wichtigsten Befunde)

1. **Gesetze schreiben fast nirgends „PDF“ vor.** Steuer- und Handelsrecht in DE und AT sind formatneutral (§ 147 AO, § 257 HGB, § 132 BAO, § 190 UGB). Die harte PDF-Pflicht gibt es dort, wo eine **Behörde Formate per Verordnung festlegt**: Bei deutschen Gerichten (ERVV § 2) sind nur PDF und TIFF zugelassen. Der wahre Blocker sind also Behörden- und Gerichtsschnittstellen, nicht das materielle Recht.
2. **Für einen ZIP-Container mit HTML gibt es ein fertiges, EU-anerkanntes Signaturformat: ASiC-E mit XAdES** (ETSI EN 319 162-1). Es baut ausdrücklich auf dem EPUB-Container OCF auf. Die neue Durchführungsverordnung (EU) 2026/248 nennt ab 23.02.2027 XAdES, CAdES, PAdES, **JAdES** und ASiC-E als Formate, die öffentliche Stellen anerkennen müssen. Signieren lässt sich das Format also. Ob das Signierte auch eindeutig ist, steht auf einem anderen Blatt (siehe 5).
3. **Deutsche Gerichte verbieten Container-Signaturen.** Laut ERVV § 4 Abs. 2 dürfen mehrere Dokumente nicht mit einer gemeinsamen QES übermittelt werden. Ein html-Pro-Dokument kann dort nur als PDF-Export eingereicht werden.
4. **eIDAS 2.0 bringt neue Vertrauensdienste**, die html-Pro direkt betreffen. Die qualifizierte elektronische Archivierung (Art. 45i/45j) ist seit Dezember 2025 normiert (DVO (EU) 2025/2532, CEN/TS 18170, OAIS). Bewahrungsdienste (DVO 2025/1946, ETSI TS 119 511) und qualifizierte Zeitstempel (DVO 2025/1929, EN 319 421/422) sind ebenfalls geregelt. Die EUDI-Wallet muss natürlichen Personen kostenloses QES-Signieren ermöglichen. Frist für die Wallet ist der 24.12.2026; Deutschland plant den Start am 02.01.2027, Österreich hat noch kein fixes Datum.
5. **Das Kernproblem heißt „What you see is what you sign“.** Eine Signatur schützt Bytes. Bei responsivem, interaktivem HTML hängt die Darstellung aber vom Gerät und von Skripten ab. Für die Beweiskraft (§ 371a ZPO, § 4 SVG, Art. 25 eIDAS) muss feststehen, *welche Erklärung* signiert wurde. Rechtlich ist das nicht verboten, technisch und gestalterisch aber ungelöst. html-Pro muss es selbst lösen.
6. **Barrierefreiheit ist ein Argument für HTML, aber kein Selbstläufer.** Der EAA verlangt anpassbare Abstände und Textformate, aus denen sich alternative Darstellungen erzeugen lassen. Das liegt nativem HTML näher als festem PDF-Layout. Die Praxis ist trotzdem schlecht: Der WebAIM Million Report 2026 findet auf **95,9 %** der Startseiten erkennbare WCAG-Fehler. Bei deutschen Behörden-PDFs sind nur **9,5 %** PAC-konform. html-Pro muss Barrierefreiheit beim Erstellen erzwingen, sonst ist der Vorteil Theorie.
7. **EN 301 549 V4.1.1 (WCAG 2.2) ist seit 02.09.2026 veröffentlicht**, aber noch nicht im Amtsblatt gelistet (Sekundärquelle: erwartet Ende November 2026). Für neue Produkte ist WCAG 2.2 AA das Ziel.
8. **C2PA ist ab Version 2.4 (April 2026) in HTML einbettbar.** ZIP-Formate (EPUB, OOXML, ODF), PDF und unstrukturierter Text werden ebenfalls unterstützt. C2PA nutzt aber eine **eigene Trust List** und ist **keine eIDAS-Signatur**. Es taugt als Herkunftsnachweis, nicht als Unterschrift.
9. **Archive akzeptieren HTML nur eingeschränkt.** Die Library of Congress führt EPUB 3, PDF/UA und PDF/A als „preferred“, HTML nur als „acceptable“. Die Schweizer KOST empfiehlt für Einzelseiten PDF/A-2 und HTML nur als Ersatz für Plain Text. Für Websites gelten WARC und WACZ. Ein neues Format braucht einen **Archiv-Exportpfad** (PDF/A und/oder WARC/WACZ) und eine öffentliche, stabile Spezifikation.
10. **Die E-Rechnung ist der lehrreiche Präzedenzfall.** Maßgeblich ist die **strukturierte Datei** (XML), das Bild (PDF) ist Beiwerk. Der hybride Weg ZUGFeRD/Factur-X (PDF/A-3 plus XML) hat den Übergang ermöglicht. Seit 14.07.2025 genügt nach GoBD die Aufbewahrung des XML-Teils. Für html-Pro heißt das: maschinenlesbare Daten als Kern, eine PDF/A-3-Hybridausgabe als Brücke, eine Norm (EN) als Voraussetzung für Akzeptanz und mehrjährige Übergangsfristen.

---

## 1. Barrierefreiheit

### 1.1 PDF-Seite: PDF/UA, Tagged PDF, Matterhorn

- **PDF/UA-1 = ISO 14289-1:2014**, „Use of ISO 32000-1 (PDF/UA-1)“, veröffentlicht 12/2014. Laut ISO-Katalog wurde die Norm 2025 überprüft und bestätigt (Sekundärdarstellung des ISO-Katalogs per Suche; iso.org selbst nicht abrufbar): https://www.iso.org/standard/64599.html
- **PDF/UA-2 = ISO 14289-2:2024** definiert Tagged PDF für PDF 2.0 (ISO 32000-2:2020), veröffentlicht am 13.03.2024: https://scc-ccn.ca/standardsdb/standards/8185912 · https://pdfa.org/iso-14289-2-pdf-ua-2-the-gold-standard-for-accessibility-in-pdf-2-0-has-arrived/ (Inhalt per Suchauszug, Seite 403)
  - Laut PDF Association enthält PDF/UA-2 erstmals umfassende Regeln für Annotationen und Strukturelement-Attribute, die in PDF/UA-1 weitgehend fehlen (ebd.).
  - Die frei verfügbare Begleitspezifikation **WTPDF 1.0 („Well-Tagged PDF“)** erschien 02/2024. Eine Datei, die WTPDF auf Konformitätsstufe „Accessibility“ erfüllt, erfüllt auch PDF/UA-2. „Reuse“ umfasst ausdrücklich die Ausgabe als HTML: https://pdfa.org/wp-content/uploads/2024/02/Well-Tagged-PDF-WTPDF-1.0.pdf · https://pdf-issues.pdfa.org/wtpdf-1/index.html
- **Matterhorn-Protokoll (für PDF/UA-1):** 136 Fehlerbedingungen in 31 Prüfpunkten. 87 sind maschinell prüfbar, 47 erfordern menschliches Urteil, 2 haben keinen spezifischen Test: https://www.pdflib.com/pdf-knowledge-base/pdfua/matterhorn-protocol · Original: https://pdfa.org/download-area/accessibility/MatterhornProtocol_1-02.pdf
  - Konsequenz: Gut ein Drittel der PDF/UA-Konformität ist **nicht automatisch prüfbar**. Das gilt sinngemäß auch für WCAG.
  - Ein „Matterhorn 2.0“ für PDF/UA-2 ist laut PDF Association in Arbeit: https://pdfa.org/tagged-pdf-related-projects/ (Suchauszug). **OFFENE FRAGE:** Ist es inzwischen veröffentlicht?
- Validatoren: veraPDF hat seit Version 1.26 (RC) Prüfungen für PDF/UA-2 und erweitert sie in späteren Versionen, etwa 1.30.1 mit WTPDF-Regeln (Sekundärquelle, Suchauszug pdfa.org): https://pdfa.org/?p=138323

### 1.2 HTML-Seite: WCAG 2.2, WAI-ARIA, EPUB Accessibility

- **WCAG 2.2** ist W3C-Empfehlung seit 05.10.2023, aktualisiert am 12.12.2024: https://www.w3.org/TR/WCAG22/ · https://www.w3.org/WAI/news/2024-12-12/wcag2updates/
- **WCAG 2.2 ist zugleich ISO/IEC 40500:2025**, genehmigt am 21.10.2025: https://www.w3.org/WAI/news/2025-10-21/wcag22-iso
- **WAI-ARIA 1.2** ist W3C-Empfehlung seit 06.06.2023: https://www.w3.org/WAI/news/2023-06-06/aria-12-rec/
- Für ein responsives Format besonders wichtig ist **SC 1.4.10 Reflow (AA)**: Inhalte müssen sich vergrößern lassen, ohne dass die Zeilenlänge wächst (Bezugsbreite 320/256 CSS-px): https://www.w3.org/WAI/WCAG22/Understanding/reflow.html. Bei festem Seitenlayout (PDF) ist das strukturell schwer erreichbar. Responsives HTML erfüllt es konstruktiv.
- **EPUB Accessibility 1.1** (W3C-Empfehlung, aktuelle Fassung 17.10.2024) verlangt mindestens WCAG 2.0 A und empfiehlt dringend die jeweils neueste WCAG-2-Version auf AA-Stufe: https://www.w3.org/TR/epub-a11y-11/. Das ist der nächste Verwandte für ein „HTML im ZIP“-Format mit Barrierefreiheitsnachweis.

### 1.3 EN 301 549

- Kapitel 10 behandelt **Nicht-Web-Dokumente** (z. B. PDF, heruntergeladene Dokumente) und verweist auf WCAG-Erfolgskriterien. V3.2.1 (2021) basiert auf WCAG 2.1 (Sekundärquelle): https://www.disabilityworld.org/articles/en-301-549-explained/ · Beispiel Kap. 10 (DE): https://LBIT.hessen.de/sites/lbit.hessen.de/files/2022-01/en_301_549_kapitel_10.pdf
- **EN 301 549 V4.1.1** liegt auf dem ETSI-Server, Dateistand 02.09.2026: https://www.etsi.org/deliver/etsi_en/301500_301599/301549/04.01.01_60/en_301549v040101p.pdf (Existenz per HTTP-Header geprüft).
  - Laut Sekundärquelle übernimmt V4.1.1 WCAG 2.2 A/AA, aktualisiert die Kapitel 10 und 11 und ergänzt Anhang ZA (Web Accessibility Directive) und **Anhang ZB (Abbildung auf den EAA)**. Die Konformitätsvermutung gilt erst ab Listung im Amtsblatt; die Listung ist vorläufig für den 30.11.2026 erwartet: https://www.pivotalaccessibility.com/2026/09/en-301-549-v4-1-1-is-published-what-it-means-for-digital-accessibility/
  - **OFFENE FRAGE:** Ist V4.1.1 zum Zeitpunkt der html-Pro-Markteinführung im ABl. gelistet? Bis dahin gilt V3.2.1 als harmonisierte Grundlage.
- **OFFENE FRAGE:** Ist ein html-Pro-Dokument nach EN 301 549 „Web-Inhalt“ (Kap. 9) oder „Nicht-Web-Dokument“ (Kap. 10)? Die Antwort hängt wahrscheinlich vom Auslieferungsweg ab: im Browser angezeigt oder als Datei heruntergeladen. Die Prüfpflichten unterscheiden sich im Detail.

### 1.4 European Accessibility Act (Richtlinie (EU) 2019/882)

Volltext: https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32019L0882

- **Anwendungsbereich (Art. 2 Abs. 2):** Dienstleistungen sind u. a. elektronische Kommunikation, Personenverkehr, **Bankdienstleistungen für Verbraucher**, **E-Books und hierfür bestimmte Software** sowie **Dienstleistungen im elektronischen Geschäftsverkehr**. Hinzu kommen Produkte wie Hardware, Betriebssysteme, Selbstbedienungsterminals und E-Book-Lesegeräte.
- **Art. 2 Abs. 4 (Ausnahmen für Website- und App-Inhalte):** „b) Dateiformate von Büro-Anwendungen, die vor dem 28. Juni 2025 veröffentlicht wurden“, außerdem „e) Inhalte …, die als Archive gelten, das heißt deren Inhalte nach dem 28. Juni 2025 weder aktualisiert noch überarbeitet werden“.
  - **Folgerung (Einschätzung):** Im Umkehrschluss sind Dateiformate von Büro-Anwendungen, die **nach** dem 28.06.2025 auf Websites oder in Apps einer erfassten Dienstleistung veröffentlicht werden, **nicht** ausgenommen.
  - **OFFENE FRAGE:** Die Richtlinie definiert „Dateiformate von Büro-Anwendungen“ nicht ausdrücklich. Dass PDF darunter fällt, ist herrschende Praxis, aber keine Legaldefinition. Eine offizielle Kommissions-Leitlinie dazu wurde nicht gefunden.
- **Anhang I Abschnitt III lit. b** (gilt für alle erfassten Dienstleistungen, wörtlich): Informationen werden „iv) … in Textformaten zur Verfügung gestellt, die sich zum Generieren alternativer assistiver Formate eignen“ und „v) … mit ausreichendem Kontrast sowie **anpassbarem Abstand zwischen den Buchstaben, Zeilen und Absätzen** dargestellt“. Lit. c verlangt, dass Websites und Apps „wahrnehmbar, bedienbar, verständlich und robust“ gestaltet werden.
  - **Folgerung:** Anpassbare Abstände und Umfließen sind in HTML/CSS nativ. In PDF gelingen sie nur über Tags und Reflow im Reader. Das ist ein **echtes Argument für html-Pro**.
- **Anhang I Abschnitt IV:** Bei Bankdienstleistungen müssen „elektronische Signaturen“ wahrnehmbar, bedienbar, verständlich und robust sein (lit. e i), ebenso bei E-Commerce (lit. g iii). Bei E-Books dürfen digitale Dateien assistive Technologien nicht behindern, und Barrierefreiheitsmerkmale sind über Metadaten auffindbar zu machen (lit. f). → **Auch der Signatur-Workflow in html-Pro muss barrierefrei sein.**
- **Kleinstunternehmen**, die Dienstleistungen erbringen (< 10 Beschäftigte und ≤ 2 Mio. € Umsatz oder Bilanzsumme), sind ausgenommen (Art. 4 Abs. 5; Art. 3 Nr. 23).
- **Übergang (Art. 32):** Produkte, die vor dem 28.06.2025 rechtmäßig eingesetzt wurden, dürfen bis 28.06.2030 weiter genutzt werden. Altverträge laufen höchstens fünf Jahre weiter.

### 1.5 Umsetzung Deutschland: BFSG und BFSGV

- **Barrierefreiheitsstärkungsgesetz (BFSG)** vom 16.07.2021, in Kraft seit 28.06.2025; die Ausnahmen in § 1 Abs. 4 entsprechen wörtlich dem EAA (Büro-Dateiformate vor dem 28.06.2025, Archive): https://www.gesetze-im-internet.de/bfsg/BJNR297010021.html
- **Bußgelder:** bis 100.000 € (§ 37 Abs. 2 BFSG, ebd.).
- **Übergang:** bis 27.06.2030 (§ 38 BFSG, ebd.).
- **BFSGV** (Verordnung, Anforderungen im Detail; § 19 regelt elektronischen Geschäftsverkehr): https://www.gesetze-im-internet.de/bfsgv/BJNR092800022.html

### 1.6 Umsetzung Österreich: Barrierefreiheitsgesetz (BaFG)

- **BaFG, BGBl. I Nr. 76/2023**, kundgemacht am 19.07.2023: https://www.ris.bka.gv.at/Dokumente/BgblAuth/BGBLA_2023_I_76/BGBLA_2023_I_76.html · ELI: https://ris.bka.gv.at/eli/bgbl/I/2023/76
  - § 2 Abs. 3 enthält dieselben Ausnahmen wie der EAA, darunter „Dateiformate von Büro-Anwendungen, die vor dem 28. Juni 2025 veröffentlicht wurden“.
  - § 37 Abs. 1: in Kraft mit 28.06.2025.
  - § 36: Marktüberwachung und Strafbehörde ist das **Sozialministeriumservice**. Geldstrafen gehen bis 80.000 €, für Kleinst- und KMU-Unternehmen bis 50.000 €.
- Öffentlicher Sektor (EU-weit): Die Web Accessibility Directive (EU) 2016/2102 nimmt Büro-Dateiformate aus, die vor dem 23.09.2018 veröffentlicht wurden, es sei denn, sie werden für aktive Verwaltungsverfahren benötigt (Sekundärdarstellung): https://eur-lex.europa.eu/EN/legal-content/summary/accessibility-of-public-sector-websites-and-mobile-apps.html · Text: https://www.legislation.gov.uk/eudr/2016/2102/article/1

### 1.7 Praxis: Wie barrierefrei sind PDFs und Websites tatsächlich?

- **WebAIM Million 2026:** 95,9 % der 1 Mio. meistbesuchten Startseiten haben automatisch erkennbare WCAG-2-Fehler (2025: 94,8 %). Der jahrelange leichte Abwärtstrend hat sich damit umgekehrt: https://webaim.org/projects/million/ · 2025: https://webaim.org/projects/million/2025
- **Deutsche öffentliche Hand, PDFs (Studie veröffentlicht am 28.04.2026):** 69.944 analysierte PDFs von 76 Websites aus dem Zeitraum 2018 bis 2025. **9,5 % PAC-konform, 53,1 % fehlerhaft, 37,4 % gar nicht getaggt.** Bundesbehörden schnitten am besten ab, Kommunen am schlechtesten (Sekundärquelle, Anbieterblog axes4): https://www.axes4.com/en/blog/post/2026-1/only-9-5-pac-compliant-what-the-new-study-on-pdf-accessibility-in-the-public-sector-reveals · Studie: https://www.digitalaccessibility.report/
- **Luxemburg (2023):** 25.398 PDFs der 17 meistbesuchten öffentlichen Websites. 59 % der pflichtigen PDFs waren ungetaggt, davon 52 % Formulare. Der Anteil fiel von 64 % (2019) auf 53 % (2022): https://accessibilite.public.lu/en/news/2023-04-28-des-pdf-majoritairement-inaccessibles.html
- **Wissenschaftliche PDFs:** Weniger als 3,2 % erfüllen alle geprüften Kriterien, nur 15,5 % sind getaggt (arXiv-Preprint): https://arxiv.org/abs/2410.03022
- **Einschätzung:** Weder HTML noch PDF sind in der Praxis barrierefrei. Der Unterschied liegt im **Werkzeug**: Barrierefreiheit entsteht nur, wenn der Editor Struktur erzwingt (Alt-Texte, Überschriftenhierarchie, Sprachangabe, Lesereihenfolge, Formular-Labels, Kontrast).

---

## 2. Elektronische Signaturen

### 2.1 Rechtsrahmen eIDAS / eIDAS 2.0

Konsolidierter Text inkl. Änderungs-VO (EU) 2024/1183 vom 11.04.2024 (konsolidierte Fassung ab 20.05.2024): https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:02014R0910-20240520 · Änderungs-VO: https://eur-lex.europa.eu/eli/reg/2024/1183/oj

- **Art. 25 Abs. 1:** Einer elektronischen Signatur darf die Rechtswirkung und Zulässigkeit als Beweismittel nicht allein deshalb abgesprochen werden, weil sie elektronisch vorliegt oder keine QES ist.
- **Art. 25 Abs. 2:** „Eine qualifizierte elektronische Signatur hat die gleiche Rechtswirkung wie eine handschriftliche Unterschrift.“
- **Art. 26 (AdES):** Eine fortgeschrittene Signatur ist eindeutig zugeordnet und ermöglicht die Identifizierung. Sie wird mit Daten unter alleiniger Kontrolle erstellt und ist so mit den Daten verbunden, dass **nachträgliche Veränderungen erkannt werden können**. Bis 21.05.2026 sollte die Kommission prüfen, ob Referenzstandards für AdES nötig sind (Art. 26 Abs. 2). **OFFENE FRAGE:** Ergebnis dieser Prüfung.
- **Art. 2 Abs. 3:** Nationale Formvorschriften bleiben unberührt. Ob eine QES die Schriftform ersetzt, regelt also nationales Recht (siehe Abschnitt 7).
- **Art. 46:** Einem elektronischen Dokument darf die Rechtswirkung nicht allein wegen der elektronischen Form abgesprochen werden. Das gilt formatunabhängig, also auch für HTML.
- **Art. 27 Abs. 1:** Verlangt ein Mitgliedstaat für einen öffentlichen Online-Dienst eine AdES, muss er bestimmte Formate anerkennen. Welche, legt eine Durchführungsverordnung fest (siehe 2.3).
- **EUDI-Wallet (Art. 5a):** Jeder Mitgliedstaat stellt innerhalb von 24 Monaten nach Inkrafttreten der Durchführungsrechtsakte eine Wallet bereit (Abs. 1). Die Wallet muss das Unterzeichnen mit QES ermöglichen (Abs. 4 lit. e) und „allen natürlichen Personen die Möglichkeit bieten, mittels qualifizierter elektronischer Signaturen **kostenlos** zu unterzeichnen“. Die Mitgliedstaaten dürfen das auf nichtgewerbliche Zwecke beschränken (Abs. 5 lit. g).
  - Die Durchführungsverordnungen, z. B. (EU) 2024/2977, wurden am 28.11.2024 erlassen, am 04.12.2024 veröffentlicht und traten am **24.12.2024** in Kraft: https://eur-lex.europa.eu/eli/reg_impl/2024/2977/oj. → **Frist für die Wallet-Bereitstellung: 24.12.2026** (Sekundärbestätigung: https://gdprlocal.com/eu-digital-identity-wallet/).
  - **Deutschland:** Die Bundesregierung kündigt den Start der staatlichen Wallet für den 02.01.2027 an (Sekundärquelle): https://netzpolitik.org/2026/faq-zur-eudi-wallet-die-wichtigsten-fragen-und-antworten-zur-digitalen-brieftasche/. Zum Gesetzentwurf: https://www.bundestag.de/1222734. Laut Presse fehlt eine QES-Funktion zum Start. **OFFENE FRAGE:** Ab wann kann die deutsche Wallet QES erzeugen?
  - **Österreich:** Die App ID Austria soll zur EUDI-Wallet weiterentwickelt werden. Ein fixes Startdatum stand im April 2026 nicht fest (Sekundärquelle): https://www.weekend.at/politik/reisepass-digital-eu-eudi-wallet-2027 · BKA-Meldung 10/2025: https://www.bundeskanzleramt.gv.at/bundeskanzleramt/nachrichten-der-bundesregierung/2025/10/id-austria-zukunftsforum-erfolgreicher-auftakt-des-dialogs-ueber-die-digitale-zukunft-oesterreichs.html. Eine Anfragebeantwortung des BKA vom 07.07.2026 existiert, ihr Text war nicht extrahierbar: https://www.parlament.gv.at/dokument/XXVIII/AB/5451/imfname_1769922.pdf. **OFFENE FRAGE.**
- **Neue Vertrauensdienste** (relevant für Archiv und Zeitstempel, siehe Abschnitt 3): qualifizierte elektronische Archivierung (Art. 45i/45j), Bewahrungsdienste (Art. 34), Validierungsdienste (Art. 33).

### 2.2 ETSI-Formatfamilie (AdES)

| Format | Norm (geprüfte Fassung) | Wofür | Eignung für html-Pro |
|---|---|---|---|
| **XAdES** | EN 319 132-1 V1.3.1 (2024-07): https://www.etsi.org/deliver/etsi_en/319100_319199/31913201/01.03.01_60/en_31913201v010301p.pdf | XML-Signaturen, auch detached über beliebige Dateien | **hoch**, Standardsignatur in ASiC-E und EPUB/ODF |
| **CAdES** | EN 319 122-1 V1.3.1 (2023-06): https://www.etsi.org/deliver/etsi_en/319100_319199/31912201/01.03.01_60/en_31912201v010301p.pdf | CMS/PKCS#7-Binärsignaturen | mittel (ASiC-E mit CAdES nach EN 319 162-2) |
| **PAdES** | EN 319 142-1 V1.2.1 (2024-01): https://www.etsi.org/deliver/etsi_en/319100_319199/31914201/01.02.01_60/en_31914201v010201p.pdf | Signaturen in PDF | nur für den **PDF-Export** |
| **JAdES** | TS 119 182-1 V1.2.1 (2024-07): https://www.etsi.org/deliver/etsi_ts/119100_119199/11918201/01.02.01_60/ts_11918201v010201p.pdf | JSON/JWS-Signaturen. Der Header-Parameter `sigD` erlaubt das Signieren **mehrerer losgelöster Datenobjekte** (Quelle: Normtext, Abschnitt 5.2.8) | **hoch**, passt zu einem JSON-Manifest |
| **ASiC** | EN 319 162-1 V1.1.1 (2016-04): https://www.etsi.org/deliver/etsi_en/319100_319199/31916201/01.01.01_60/en_31916201v010101p.pdf · EN 319 162-2: https://www.etsi.org/deliver/etsi_en/319100_319199/31916202/01.01.01_60/en_31916202v010101p.pdf | **ZIP-Container**, der Datendateien mit Signaturen und Zeitstempeln verbindet | **sehr hoch**, das passende Containerformat |

Aussagen aus dem **Normtext EN 319 162-1** (eigene Textextraktion des ETSI-PDFs):

- ASiC baut ausdrücklich auf vorhandenen ZIP-Strukturen auf: „This includes **OCF** [EPUB-Container], which was originally designed for use by eBooks but has been adopted as the basis for other containers, for example **ODF**.“ Ziel ist die Signatur „with any type of data, independent of the needs of any particular document or data type“.
- **ASiC-S** enthält ein einzelnes Datenobjekt. **ASiC-E** enthält mehrere Dateien in beliebiger Ordnerstruktur außerhalb von `META-INF`. Es gibt zwei Varianten: „ASiC-E with XAdES“ (Signaturen in `META-INF/*signatures*.xml`) und „ASiC-E with CAdES – time assertions“ (`META-INF/*.p7s` plus `ASiCManifest`).
- ASiC-E erlaubt, **später Dateien, Signaturen und Zeitstempel hinzuzufügen, ohne frühere Signaturen zu brechen**. Später hinzugefügte Signaturen können frühere mitsignieren. Containerverschachtelung ist zulässig.
- Mime-Typen: `application/vnd.etsi.asic-e+zip`, Dateiendung `.asice`. Für ASiC-E mit CAdES gilt wörtlich: „The ‚mimetype‘ file content shall be ‚application/vnd.etsi.asic-e+zip‘.“ **OFFENE FRAGE:** Darf ein ASiC-E-mit-XAdES-Container einen **eigenen Mime-Typ** tragen, z. B. `application/vnd.htmlpro+zip`, und trotzdem ASiC-konform sein, so wie EPUB und ODF ihre Mime-Typen behalten? Der Abschnitt 4.4.3.1 ließ sich nicht extrahieren.
- Die Baseline-Stufen **B-B, B-T, B-LT, B-LTA** sind für ASiC-S mit CAdES, ASiC-S mit XAdES und **ASiC-E mit XAdES** definiert. ASiC-E mit CAdES ist in Teil 1 nicht als Baseline-Container profiliert.
- `ASiCArchiveManifest` und Evidence Records (RFC 4998/6283) dienen der Langzeitverfügbarkeit (siehe Abschnitt 3).
- **EPUB 3.3** (W3C-Empfehlung, Fassung 13.01.2026) sieht in OCF ebenfalls die optionale Datei `META-INF/signatures.xml` mit XML-Signaturen über beliebige Container-Dateien vor: https://www.w3.org/TR/epub-33/

**Antwort auf die Frage „Welches Format passt zu einem ZIP-Container mit HTML?“**
→ **ASiC-E mit XAdES-Baseline-Signaturen** (B-LT oder B-LTA) ist der naheliegende Kandidat. Das Format ist ETSI-Norm, ab 2027 ausdrücklich EU-anerkannt (siehe 2.3) und von DSS validierbar (siehe 2.5). Strukturell ist es mit dem EPUB/OCF-Muster kompatibel.
→ **JAdES** ist die Alternative, wenn das Manifest JSON ist: Dateien werden über `sigD` detached referenziert.
→ **OFFENE FRAGE:** Gibt es eine ETSI-Spezifikation „ASiC mit JAdES“? Im gelesenen Material wurde keine gefunden. Die DVO 2026/248 nennt JAdES nur als eigenständiges Signaturformat, nicht als ASiC-Variante.

### 2.3 Anerkannte Formate bei öffentlichen Stellen: DVO (EU) 2026/248 (neu)

Volltext: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32026R0248 · ELI: http://data.europa.eu/eli/reg_impl/2026/248/oj

- Durchführungsverordnung vom 02.02.2026. Sie **hebt den Durchführungsbeschluss (EU) 2015/1506 auf** und regelt die Formate fortgeschrittener Signaturen und Siegel, die öffentliche Stellen anerkennen müssen (Art. 27/37 eIDAS).
- **Anhang I (anzuerkennen ab 23.02.2027; Schlussbestimmung: „Article 1(1) and Article 3(1) shall apply from 23 February 2027“):** XAdES Baseline (EN 319 132-1 V1.3.1), CAdES Baseline (EN 319 122-1 V1.3.1), PAdES Baseline (EN 319 142-1 V1.2.1), **JAdES Baseline (TS 119 182-1 V1.2.1, mit Anpassung: Header `x5c` muss vorhanden sein)** und **ASiC Baseline (EN 319 162-1 und -2, für ASiC-E mit CAdES)**.
- **Anhang II (Altformate):** Signaturen, die vor dem 23.02.2028 nach den alten TS-Profilen (TS 103 171/172/173/174) erstellt wurden, sind weiter anzuerkennen.
- **Art. 2:** Andere Formate sind anzuerkennen, wenn der Herkunftsmitgliedstaat eine **kostenlose Online-Validierung** anbietet und diese im Dokument, in der Signatur oder im **Dokumentcontainer** angegeben ist.
- **Bedeutung für html-Pro:** Ein proprietäres Signaturformat wäre bei Behörden nur über eine staatlich angebotene Validierung anerkennungsfähig, also praktisch nicht. **Es müssen ETSI-Baseline-Formate verwendet werden.**

### 2.4 Remote-Signing / Cloud Signature Consortium

- **CSC API v2.2** wurde vom Cloud Signature Consortium veröffentlicht, laut Suchauszug am 06.11.2025: https://cloudsignatureconsortium.org/resources/csc-api-v2-2/
- ETSI TS 119 432 („Protocols for remote digital signature creation“) enthält eine XML-Bindung (OASIS DSS-X) und eine **JSON-Bindung auf Basis der CSC-Spezifikation**: https://www.etsi.org/newsroom/press-releases/1573-2019-04-etsi-releases-three-specifications-for-cloud-based-digital-signatures · aktuelle Fassungen bis V1.3.1: https://www.etsi.org/deliver/etsi_ts/119400_119499/119432/
- Bedeutung: Ein Reader/Editor muss keine Kartenleser unterstützen. QES läuft heute praktisch über Fernsignatur (ID Austria/A-Trust, deutsche QTSP), also über einen Hash, der an den Dienst geschickt wird. Das passt zu detached XAdES/JAdES in ASiC-E.
- **OFFENE FRAGE:** Bietet A-Trust/ID Austria Drittanbietern eine **CSC-konforme API**? A-Trust bewirbt Partnerintegrationen (DocuSign, sproof), eine offene CSC-Schnittstelle wurde nicht belegt (Sekundärquelle): https://www.docusign.com/de-de/blog/partnerschaft-a-trust

### 2.5 Validatoren: Werden ASiC-Container unterstützt?

- **EU DSS (Digital Signature Service)**: Open-Source-Bibliothek der Kommission (LGPL-2.1). Sie unterstützt XAdES, CAdES, PAdES, **JAdES** und **ASiC-S/ASiC-E**: https://github.com/esig/dss · FAQ: https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/880312429/eSignature+FAQ
- **DSS-Demo-Webapp** mit Funktionen „Validate a signature“, „Sign with JAdES“, „Merge containers“ und Trusted-List-Anzeige: https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/validation (am 11.10.2026 abgerufen)
  - Wichtig: Es ist ausdrücklich eine **Demonstration**. Hochgeladene Dateien werden an die Kommission übertragen, die Seite rät von sensiblen Dokumenten ab (Datenschutzhinweis auf der Seite). Ein amtlicher „EU-Validierungsdienst“ mit Rechtswirkung ist das nicht. **OFFENE FRAGE:** Gibt es einen qualifizierten Validierungsdienst (Art. 33 eIDAS), der ASiC-E und JAdES kostenlos prüft?
- **RTR Signaturprüfung (Österreich)** unterstützt laut eigener Beschreibung „X.509 certificates, CAdES, XAdES, PAdES, **ASiC**, CMS, XMLDsig, PDF (Adobe signature), PDF-AS …“. JAdES wird nicht genannt: https://www2.rtr.at/en/vd/Pruefung_Details
- **Folgerung:** ASiC-E/XAdES ist heute prüfbar. JAdES-Container sind beim österreichischen Prüfdienst nicht belegt.

### 2.6 Österreich: ID Austria, Handy-Signatur, A-Trust

- Die **ID Austria hat am 05.12.2023 die Handy-Signatur abgelöst**. Die damit ausgelöste qualifizierte Signatur ist laut BKA „der eigenhändigen Unterschrift EU-weit gleichgestellt“, mit den Ausnahmen nach § 4 SVG: https://www.bundeskanzleramt.gv.at/agenda/digitalisierung/digitales-oesterreich/id-austria.html · https://www.derstandard.at/story/3000000190505/die-handysignatur-wird-am-5-dezember-2023-abgedreht
- **A-Trust** ist ein qualifizierter Vertrauensdiensteanbieter in der EU-Trusted-List. Angeboten werden QES, qualifizierte Siegel und ein qualifizierter Zeitstempeldienst. A-Trust ist laut Presse Launch-Partner der deutschen EUDI-Wallet (Sekundärquellen): https://www.docusign.com/de-de/blog/partnerschaft-a-trust · https://www.trendingtopics.eu/a-trust-wird-launch-partner-der-deutschen-eudi-wallet-d-you/
- Österreich hat eine reife QES-Infrastruktur für Bürger (ID Austria). Das ist ein Standortvorteil für ein Produkt aus Innsbruck. Voraussetzung ist ein **Fernsignatur-Anschluss** (siehe offene Frage in 2.4).

### 2.7 Deutschland: Vertrauensdienstegesetz (VDG)

- Das VDG regelt die „wirksame Durchführung der Vorschriften über Vertrauensdienste in der Verordnung (EU) Nr. 910/2014“ (§ 1), u. a. Aufsicht, Haftung, barrierefreie Dienste (§ 7) und Beendigungspläne (§ 16): https://www.gesetze-im-internet.de/vdg/
- **§ 15 VDG, Langfristige Beweiserhaltung:** Qualifiziert signierte, gesiegelte oder zeitgestempelte Daten sind bei Bedarf „neu zu schützen, bevor der Sicherheitswert … durch Zeitablauf geringer wird“, und zwar nach dem Stand der Technik: https://www.gesetze-im-internet.de/vdg/__15.html

---

## 3. Zeitstempel, Langzeitvalidierung, Beweiswerterhaltung

- **RFC 3161** (Internet X.509 PKI Time-Stamp Protocol, 2001) ist das Basisprotokoll: https://www.rfc-editor.org/rfc/rfc3161
- **ETSI EN 319 422 V1.1.1** („Time-stamping protocol and time-stamp token profiles“, angenommen am 22.02.2016) profiliert RFC 3161 für den eIDAS-Kontext: https://www.etsi.org/deliver/etsi_en/319400_319499/319422/01.01.01_60/en_319422v010101p.pdf
- **eIDAS Art. 41 Abs. 2:** Für qualifizierte Zeitstempel gilt die **Vermutung der Richtigkeit** von Datum und Zeit und der Unversehrtheit der verbundenen Daten (konsolidierter Text, s. o.).
- **DVO (EU) 2025/1929** vom 29.09.2025 nennt als Referenznormen für qualifizierte Zeitstempel **EN 319 421 V1.3.1 und EN 319 422 V1.1.1** (mit Anpassungen): https://eur-lex.europa.eu/eli/reg_impl/2025/1929/oj
- **Baseline-Stufen (LTV):** B-B (Basis), B-T (mit Zeitstempel), B-LT (alle Validierungsdaten eingebettet), **B-LTA** (zusätzliche Archivzeitstempel). Laut PAdES-Norm ist B-LTA „considered an appropriate preservation and transmission technique for signed data“, weil sie die Validierung trotz schwach gewordener Algorithmen oder abgelaufener Validierungsdaten ermöglicht (EN 319 142-1, eigene Extraktion, URL s. o.). Dieselbe Stufenlogik gilt für ASiC-Container (EN 319 162-1, Abschnitt 5.1).
- **ETSI TS 119 511 V1.2.1:** „Policy and security requirements for trust service providers providing long-term preservation of digital signatures or general data using digital signature techniques“: https://www.etsi.org/deliver/etsi_ts/119500_119599/119511/01.02.01_60/ts_119511v010201p.pdf
  - Die Norm nennt als Beispiel eines „Preservation Object Container“ ausdrücklich: „An **ASiC-S or ASiC-E container** is a Preservation Object Container …“ (eigene Extraktion).
- **ETSI TS 119 512 V1.2.1:** „Protocols for trust service providers providing long-term data preservation services“: https://www.etsi.org/deliver/etsi_ts/119500_119599/119512/01.02.01_60/ts_119512v010201p.pdf
- **DVO (EU) 2025/1946** vom 29.09.2025 regelt qualifizierte Bewahrungsdienste für QES und Siegel. Referenznormen sind ETSI **TS 119 511 V1.1.1** und TS 119 172-4 V1.1.1: https://eur-lex.europa.eu/eli/reg_impl/2025/1946/oj
- **DVO (EU) 2025/2532** vom 16.12.2025 regelt **qualifizierte elektronische Archivierungsdienste** (Art. 45j). Referenznorm ist **CEN/TS 18170:2025** mit Verweisen u. a. auf **ISO 14721:2025 (OAIS)** und EN 319 421: https://eur-lex.europa.eu/eli/reg_impl/2025/2532/oj
  - eIDAS **Art. 45i Abs. 2:** Für Daten in einem qualifizierten Archivierungsdienst gilt die **Vermutung der Unversehrtheit und der Richtigkeit der Herkunftsangabe** für die Dauer der Bewahrung.
  - **Art. 45j Abs. 1 lit. c:** Die Daten sind vor Veränderung zu schützen, „mit Ausnahme von Änderungen in Bezug auf das Medium oder das **elektronische Format**“. Formatmigration ist also ausdrücklich vorgesehen.
- **BSI TR-03125 (TR-ESOR) V1.3:** Beweiserhaltende Langzeitspeicherung. Version 1.3 ist seit 12/2022 zertifizierungsfähig. Das Archivpaket **ASiC-AIP** basiert auf ASiC-E (EN 319 162), daneben gibt es XAIP/LXAIP. Evidence Records folgen RFC 4998/6283. TS 119 512 gilt als funktional gleichwertige Schnittstelle: https://www.bsi.bund.de/EN/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/Technische-Richtlinien/TR-nach-Thema-sortiert/tr03125/BSITR03125.html
  - **OFFENE FRAGE:** Welche Dokumentformate empfiehlt TR-ESOR Anlage F? Ist HTML dort als Archivformat zugelassen? Die Anlage wurde nicht gelesen.
- **RFC 4998 (Evidence Record Syntax)**: https://www.rfc-editor.org/rfc/rfc4998 · **RFC 6283 (XML ERS)**: https://www.rfc-editor.org/rfc/rfc6283.html
- **Folgerung:** ASiC-E ist zugleich Signatur-, Zeitstempel- und Bewahrungscontainer und wird von TR-ESOR (ASiC-AIP) sowie TS 119 511 als Paketform verwendet. Ein html-Pro-Container, der ASiC-E-konform ist, ließe sich **ohne Umverpackung** in deutsche Beweiserhaltungs-Archive einstellen. Das wäre ein erheblicher Vorteil gegenüber einem Eigenformat.

---

## 4. C2PA / Content Credentials

- **Organisation:** Die Coalition for Content Provenance and Authenticity ist ein Projekt der Joint Development Foundation (501(c)(6), Washington): https://c2pa.org/about/
  - Gegründet am 22.02.2021 von Adobe, Arm, BBC, Intel, Microsoft und Truepic. Die C2PA vereint die Adobe-geführte Content Authenticity Initiative und das von Microsoft und BBC geführte Project Origin: https://c2pa.org/c2pa-founding-press-release/ · https://www.helpnetsecurity.com/2021/02/23/c2pa-coalition/
  - Später im Steering Committee u. a. Google, Sony, Publicis, OpenAI (05/2024), Meta und Amazon (Sekundär- und Pressemeldungen): https://c2pa.org/openai-joins-c2pa-steering-committee/ · https://www.linuxfoundation.org/press/meta-joins-the-c2pa-steering-committee · https://c2pa.org/amazon-joins-the-c2pa-steering-committee/
- **Versionen** (Versionshistorie der Spezifikation, Abschnitt 5.3): 2.2 (Mai 2025), 2.3 (Dezember 2025), **2.4 (April 2026, aktuell)**: https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html · Index: https://spec.c2pa.org/specifications/specifications/2.4/index.html
- **ISO-Weg:** ISO/DIS 22144 „Authenticity of information – Content Credentials“ im Fast-Track (DIN-Entwurf 2025-01): https://www.iso.org/standard/90726.html · https://www.din.de/en/wdc-proj:din21:385740551. **OFFENE FRAGE:** Ist ISO 22144 inzwischen veröffentlicht? Ebenfalls laut Sekundärquelle in Arbeit: ISO 32008 (Content Credentials für PDF 2.0): https://digitalpreservation.gov/meetings/DSA2025/010303_murray-potter_DSA2025-C2PA-G_LAM.pdf
- **Unterstützte Formate** (Anhang A.1 der Spec 2.4): JPEG, JPEG XL, PNG, SVG, GIF, TIFF/DNG, RIFF (WAV, AVI, WebP), MP3/FLAC (ID3), Fonts, **PDF** (A.4), **EPUB, OOXML, ODF, OpenXPS und „other ZIP-based formats“** (A.6), **HTML** (A.7), **unstrukturierter Text** (A.8), **strukturierter Text** (A.9) sowie MP4/BMFF.
  - **HTML (neu in 2.4):** entweder inline als `<script type="application/c2pa">` mit Base64 im `<head>` oder extern über `<link rel="c2pa-manifest" href="…">`. **Die externe Variante ist bevorzugt.** Pro HTML-Dokument ist höchstens ein Manifest zulässig.
  - **ZIP-basierte Formate:** Es wird jede Datei einzeln gehasht (über Header und komprimierten Inhalt, damit auch verschlüsselte EPUBs prüfbar sind), zusätzlich das Central Directory. Das passt direkt zu einem html-Pro-ZIP-Container.
  - **Unstrukturierter Text:** Einbettung über unsichtbare Unicode-Variation-Selectors. Laut Spec „remains under review and may be subject to change“.
  - **PDF:** Das Manifest wird eingebettet. Die Koexistenz mit PDF-Signaturen ist geregelt (A.4.2.2): Die PDF-Signatur muss über das gesamte PDF inklusive C2PA-Manifest gehen, der Signaturbereich wird aus dem C2PA-Hash ausgenommen.
- **Verhältnis zu eIDAS-Signaturen:**
  - C2PA verweist zwar auf Normen wie CMS, RFC 3161, COSE und auch JAdES (Abschnitt 3.3). Vertrauen bewertet es aber über eine **eigene „C2PA Trust List“** und die Extended Key Usage `c2pa-kp-claimSigning`. Validatoren *sollen* zusätzliche Trust-Anchors konfigurierbar machen (Abschnitt 14.4). Die EU-Trusted-Lists nach eIDAS sind nicht Teil des Vertrauensmodells.
  - Die Spec bewertet nach eigener Aussage nicht, ob Herkunftsdaten „gut“ oder „schlecht“ sind, sondern nur, ob sie valide verbunden, korrekt geformt und unverfälscht sind (Abschnitt 1.2).
  - **Folgerung:** Ein C2PA-Manifest ist **keine AdES oder QES** im Sinne von Art. 25–26 eIDAS und trägt für sich keine Vermutungswirkung. Auf ein Manifest kann eine AdES nach Art. 25 Abs. 1 trotzdem nicht allein wegen ihrer Form abgelehnt werden; als Beweismittel bleibt es also möglich. **OFFENE FRAGE:** Kann eine C2PA-Claim-Signatur mit einem qualifizierten Zertifikat (QSCD/QTSP) erzeugt werden, sodass sie zugleich die Anforderungen an eine QES erfüllt? Eine rechtliche Bewertung dazu wurde nicht gefunden.
- **Rolle für html-Pro:** C2PA eignet sich als Herkunfts- und Bearbeitungsnachweis (Wer hat was mit welchem Werkzeug geändert, KI-Kennzeichnung über `c2pa.ai-disclosure` seit 2.4). Rechtsverbindliches Unterschreiben leistet es nicht. Sinnvoll ist eine **Kombination**: C2PA-Manifest im Container und ASiC-E/XAdES-Signatur über alle Dateien einschließlich Manifest. Die Reihenfolge muss analog zur PDF-Regel A.4.2.2 definiert werden.

---

## 5. Archivierung: PDF/A, Gerichte, Web-Archive, E-Rechnung

### 5.1 PDF/A

- Die Familie ISO 19005: **-1:2005** (PDF 1.4), **-2:2011** (ISO 32000-1), **-3:2012** (wie -2, aber **beliebige eingebettete Dateien** erlaubt), **-4:2020** (auf Basis von PDF 2.0, ISO 32000-2): https://www.loc.gov/preservation/digital/formats/fdd/fdd000532.shtml · https://www.evs.ee/en/iso-19005-4-2020
- PDF/A-3 ist die technische Basis von ZUGFeRD/Factur-X (siehe 5.4).

### 5.2 Gerichte: Deutschland (ERV)

- **§ 130a ZPO:** Elektronische Dokumente müssen „für die Bearbeitung durch das Gericht geeignet“ sein. Die technischen Rahmenbedingungen bestimmt die Bundesregierung per Verordnung. Erforderlich ist eine QES **oder** einfache Signatur plus sicherer Übermittlungsweg (beA, eBO, Nutzerkonto u. a.): https://www.gesetze-im-internet.de/zpo/__130a.html
- **ERVV § 2 Abs. 1:** „Das elektronische Dokument ist im Dateiformat **PDF** zu übermitteln.“ TIFF ist nur ergänzend für Bilder zulässig. Ein **XML-Strukturdatensatz** (XJustiz) soll beigefügt werden (Abs. 3): https://www.gesetze-im-internet.de/ervv/__2.html
- **ERVV § 4 Abs. 2:** „Mehrere elektronische Dokumente dürfen nicht mit einer **gemeinsamen** qualifizierten elektronischen Signatur übermittelt werden.“ Das ist ein **Verbot der Container-Signatur**: https://www.gesetze-im-internet.de/ervv/__4.html
- **ERVV § 5:** Versionen, Größen und technische Eigenschaften werden bekanntgemacht. Dabei ist die Barrierefreiheit zu berücksichtigen: https://www.gesetze-im-internet.de/ervv/__5.html
- **ERVB 2025** (Bundesanzeiger 29.07.2025, gültig seit 30.07.2025): zulässig sind laut Sekundärquellen u. a. **PDF inkl. PDF 2.0, PDF/A-1, PDF/A-2, PDF/UA**. Unzulässig sind eingebettete Objekte und JavaScript; Inline-Signaturen und Formularfelder ohne Skripte sind erlaubt. Original: https://justiz.de/laender-bund-europa/elektronische_kommunikation/bundesanzeiger_29_07_2025.pdf (Text nicht extrahierbar; Inhalt laut Suchauszügen und Kammerinformationen). **OFFENE FRAGE:** Wortlaut und genaue Versionsliste der ERVB 2025.
- **Folgerung:** html-Pro ist im deutschen ERV **nicht einreichungsfähig**. Ein **PDF-Export** ist Pflicht, idealerweise PDF/UA- und PDF/A-konform, ohne JavaScript und je Dokument einzeln signiert.

### 5.3 Gerichte: Österreich (ERV 2021)

- **ERV 2021** (BGBl. II Nr. 587/2021) regelt Eingaben, Beilagen und Erledigungen über Übermittlungsstelle, Direktverkehr, FinanzOnline, JustizOnline oder E-Mail, „entweder als Anhang zu einer Nachricht oder als Referenz“ auf die Justiz-Box. Teilnehmer werden über eine **fortgeschrittene** Signatur authentifiziert (§ 10 Abs. 2). Mahnklagen, Grundbuch- und Firmenbuchgesuche sind **strukturiert** zu übermitteln. Ist eine strukturierte Übermittlung nicht möglich, ist ein „**PDF-Anhang**“ zulässig: https://www.ris.bka.gv.at/Dokumente/BgblAuth/BGBLA_2021_II_587/BGBLA_2021_II_587.html
- **§ 7 ERV 2021:** Die zulässigen Formate und Größen werden in der **Schnittstellenbeschreibung** auf kundmachungen.justiz.gv.at kundgemacht (ebd.).
- **OFFENE FRAGE:** Welche Dateiformate erlaubt die aktuelle Schnittstellenbeschreibung für Beilagen (nur PDF? PDF/A-Pflicht?) und mit welchen Größenlimits? Sie konnte nicht abgerufen werden.

### 5.4 E-Rechnung als Präzedenzfall

**Deutschland**
- **§ 14 Abs. 1 UStG (seit 01.01.2025):** Eine E-Rechnung wird „in einem strukturierten elektronischen Format ausgestellt, übermittelt und empfangen“ und muss **EN 16931** entsprechen oder ein vereinbartes, verlustfrei extrahierbares Format haben. Eine PDF-Rechnung ist eine „**sonstige Rechnung**“: https://www.gesetze-im-internet.de/ustg_1980/__14.html
- **Übergang § 27 Abs. 38 UStG:** Papier und andere elektronische Formate bleiben zulässig bis 31.12.2026 und bis 31.12.2027 für Unternehmer mit Vorjahresumsatz ≤ 800.000 €. EDI ist bis Ende 2027 zulässig. Ab 2028 gilt die volle Pflicht im inländischen B2B-Verkehr: https://www.gesetze-im-internet.de/ustg_1980/__27.html
- **BMF-Schreiben vom 15.10.2024:** **XRechnung** und **ZUGFeRD ab 2.0.1** (ohne die Profile MINIMUM und BASIC-WL) sind zulässig. Bei hybriden Formaten **kommt es auf den maschinenlesbaren Teil an** (Sekundärquelle): https://newsletter.pwc.de/umsatzsteuer/nl0029-2024-10-29/bmf-e-rechnung
- **ZUGFeRD 2.4 / Factur-X 1.08** (04.12.2025, anwendbar ab 15.01.2026) ist ein hybrides PDF/A-3 mit eingebetteter CII-XML und technisch identisch mit Factur-X: https://fnfe-mpe.org/wp-content/uploads/2025/12/2025-12-04_ZUGFeRD_2.4_Factur-X_1.08_Meldung_DE.pdf · https://www.ferd-net.de/en/downloads/publications/details/zugferd-24-english
- **XRechnung 3.0.2** ist gültig. Eine Vorversion 4.0 erschien im September 2026, die finale Fassung ist für Frühjahr 2027 erwartet: https://xeinkauf.de/xrechnung/versionen-und-bundles/

**Österreich**
- Rechnungen an den Bund müssen seit **01.01.2014** strukturiert elektronisch eingebracht werden (ebInterface, UBL/CII, über USP oder PEPPOL): https://www.usp.gv.at/themen/steuern-finanzen/umsatzsteuer-ueberblick/weitere-informationen-zur-umsatzsteuer/vorsteuerabzug-und-rechnung/e-rechnung-an-die-oeffentliche-verwaltung.html · https://www.wko.at/netzwerke/10-jahre-e-rechnung-an-den-bund
- **§ 11 Abs. 2 UStG 1994 (AT)** ist formatneutral: Eine elektronische Rechnung ist eine, die „in einem elektronischen Format ausgestellt und empfangen wird“, wenn der Empfänger zustimmt. Echtheit der Herkunft, Unversehrtheit und Lesbarkeit sind **sieben Jahre** zu gewährleisten: https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10004873&Paragraf=11
- Die E-Rechnung-UStV nennt als Wege zur Sicherung u. a. ein innerbetriebliches Steuerungsverfahren, USP/PEPPOL, **QES** oder EDI (Sekundärquelle): https://www.usp.gv.at/themen/steuern-finanzen/umsatzsteuer-ueberblick/weitere-informationen-zur-umsatzsteuer/vorsteuerabzug-und-rechnung/e-rechnung.html
- Eine allgemeine B2B-E-Rechnungspflicht hat Österreich noch nicht, ein Datum ist nicht bekannt (Sekundärquelle, WKO): https://www.wko.at/aussenwirtschaft/e-rechnung-pflicht

**EU**
- **ViDA, Richtlinie (EU) 2025/516** vom 11.03.2025: Ab **01.07.2030** gelten E-Rechnungen nach **EN 16931** für innergemeinschaftliche B2B-Umsätze. Der neu gefasste Art. 232 MwStSystRL bestimmt, dass die Ausstellung EN-16931-konformer E-Rechnungen grundsätzlich nicht der Zustimmung des Empfängers unterliegt: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32025L0516. **OFFENE FRAGE:** Ab welchem Datum gilt diese Einzeländerung (ViDA staffelt die Anwendungsdaten)?

**Was folgt daraus für ein neues Dokumentformat?**
1. Die Rechtsordnung hat die E-Rechnung **nicht über ein Dateiformat, sondern über ein semantisches Datenmodell (EN 16931)** definiert. Das Bild ist nachrangig. → html-Pro sollte die **strukturierten Daten** (z. B. JSON/XML im Container) zum Kern machen, die Darstellung ist eine Sicht darauf.
2. Akzeptanz kam über eine **europäische Norm** und **behördliche Formatlisten**, nicht über Produktqualität. → Ohne Normungsweg (W3C, ETSI, CEN, ISO) bleibt html-Pro außerhalb von B2G und Justiz.
3. Der **Hybrid PDF/A-3 + XML** war die Brücke, weil alte Empfänger das PDF lesen konnten. → html-Pro braucht eine **PDF/A-3-Hybridausgabe**, also PDF/A mit eingebettetem html-Pro-Container oder strukturierten Daten.
4. Übergangsfristen von 3 bis 5 Jahren und mehr sind üblich (DE 2025–2028, EU-ViDA 2030).

### 5.5 Web-Archivierung, WARC/WACZ, Nationalbibliotheken, Archivformat-Kataloge

- **WARC = ISO 28500:2017** (Nachfolger von 2009): https://www.standards.govt.nz/shop/ISO-285002017 · Formatbeschreibung der LoC: https://www.loc.gov/preservation/digital/formats/fdd/fdd000236.shtml. Ein GSO-Dokument „GSO ISO 28500:2025“ existiert: https://dgsm.gso.org.sa/store/standards/GSO:946563?lang=en. **OFFENE FRAGE:** Ist das nur eine regionale Übernahme der Fassung 2017 oder gibt es eine ISO-Neuausgabe?
- **WACZ 1.1.1** (Webrecorder) ist ein ZIP mit WARC-Dateien, CDXJ-Index, `pages.jsonl` und `datapackage.json`. Version 1.2.0 ist ausdrücklich ein Entwurf „with no official standing“. Signieren ist optional über eine separate Erweiterung möglich: https://specs.webrecorder.net/wacz/1.1.1/ · https://specs.webrecorder.net/wacz/1.2.0/
- **Library of Congress, Recommended Formats Statement 2025–2026:**
  - **Textwerke digital:** *Preferred* sind XML-Markup, **EPUB 3**, TEI/DocBook, **PDF/UA**, **PDF/A** und hochwertiges PDF. **XHTML/HTML** ist nur *Acceptable*: https://www.loc.gov/preservation/resources/rfs/text.html
  - **Websites:** *Preferred* ist WARC. *Acceptable* sind ARC_IA, **WACZ** und CDX: https://www.loc.gov/preservation/resources/rfs/webarchives.html
- **KOST (Koordinationsstelle für die dauerhafte Archivierung, CH), Katalog archivischer Dateiformate V7.1, Mai 2026:**
  - Hypertext-Einzeldatei: Empfohlen ist **PDF/A-2**. „HTML kann eigentlich nur als Archivformat für einzelne Seiten **ohne eingebettete externe Ressourcen** empfohlen werden, als Ersatz für Plain Text.“ MHTML wird nicht akzeptiert: https://kost-ceco.ch/cms/kad_hypertext_intro_de.html
  - Fazit zu HTML: Die Trennung von Inhalt und Darstellung „würde … grundlegende Bedürfnisse der digitalen Archivierung erfüllen“. Es habe sich aber gezeigt, „dass viele Webseiten nur bei korrekter grafischer Darstellung inhaltlich verständlich sind“: https://kost-ceco.ch/cms/kad_html_de.html
  - Webauftritte: Empfohlen sind **WACZ**, WARC und PDF/A-2: https://kost-ceco.ch/cms/kad_webseiten_intro_de.html
- **Deutsche Nationalbibliothek:** Für Netzpublikationen nimmt die DNB grundsätzlich alle gängigen Formate an. Die Ablieferung erfolgt überwiegend als PDF und EPUB, PDF/A wird empfohlen. Quelle ist die Dateiformat-Policy von **2012** (veraltet; Sekundärquelle): https://wiki.bsz-bw.de/download/attachments/3454509/DNB-Datei-Formate_policy_2012_.pdf?api=v2. **OFFENE FRAGE:** Aktuelle DNB-Formatpolicy für Netzpublikationen, akzeptiert sie HTML-Container?
- **Österreichische Nationalbibliothek:** Das Webarchiv Österreich sammelt seit März 2009 auf Basis des Mediengesetzes. Seit 2017 gibt es jährliche Domain-Crawls der .at-Domain sowie selektive und Event-Crawls. Zugriff ist nur vor Ort bzw. in berechtigten Bibliotheken möglich: https://webarchiv.onb.ac.at/web/20250115001533/https://webarchiv.onb.ac.at · https://netpreserve.org/about-us/members/%C3%B6sterreichische-nationalbibliothek-austrian-national-library/
- **Ist HTML als Archivformat akzeptiert?** → **Nur eingeschränkt.** Als einzelne, selbstenthaltene Datei ist HTML „acceptable“ (LoC) bzw. Plain-Text-Ersatz (KOST). Für dynamische, ressourcenabhängige Inhalte verlangen Archive WARC/WACZ oder PDF/A. **EPUB 3**, also HTML im ZIP mit Manifest, ist bei der LoC *preferred*. Das spricht dafür, html-Pro **EPUB-nah** zu bauen.

---

## 6. Revisionssicherheit und Aufbewahrung

### 6.1 Deutschland

- **§ 147 AO** (Fassung nach BEG IV): Bücher, Jahresabschlüsse u. Ä. sind **10 Jahre** aufzubewahren, **Buchungsbelege 8 Jahre**, sonstige Unterlagen (z. B. Handels- und Geschäftsbriefe) **6 Jahre** (Abs. 3): https://www.gesetze-im-internet.de/ao_1977/__147.html
  - **Abs. 2:** Die Aufbewahrung als Wiedergabe auf Bild- oder Datenträgern ist zulässig, wenn die Wiedergabe „mit den empfangenen Handels- oder Geschäftsbriefen und den Buchungsbelegen **bildlich** und mit den anderen Unterlagen **inhaltlich** übereinstimmen“ und die Daten „jederzeit verfügbar sind, unverzüglich lesbar gemacht und **maschinell ausgewertet** werden können“.
  - **Abs. 6:** Datenzugriff der Finanzbehörde, ggf. Übertragung „in einem maschinell auswertbaren Format“.
  - Ein **Dateiformat ist nicht vorgeschrieben.**
- **§ 146 Abs. 4 AO** und **§ 239 Abs. 3 HGB:** Eine Aufzeichnung darf nicht so verändert werden, dass der ursprüngliche Inhalt nicht mehr feststellbar ist (Unveränderbarkeit): https://www.gesetze-im-internet.de/ao_1977/__146.html · https://www.gesetze-im-internet.de/hgb/__239.html
- **§ 257 HGB:** Handelsbücher und Abschlüsse **10 Jahre**, **Buchungsbelege 8 Jahre**, Handelsbriefe 6 Jahre; für Kredit-, Versicherungs- und Wertpapierinstitute bleiben es 10 Jahre für Belege (Abs. 4). Abs. 3 enthält dieselbe Regel „bildlich/inhaltlich“: https://www.gesetze-im-internet.de/hgb/__257.html
- **§ 14b UStG:** Rechnungen **8 Jahre**; die Anforderungen nach § 14 Abs. 3 (Echtheit, Unversehrtheit, Lesbarkeit) gelten für den gesamten Zeitraum: https://www.gesetze-im-internet.de/ustg_1980/__14b.html. Die 8 Jahre gelten für alle Rechnungen, deren Frist am 31.12.2024 noch lief (§ 27 Abs. 40 UStG, s. o.).
- **Viertes Bürokratieentlastungsgesetz (BEG IV), BGBl. 2024 I Nr. 323** (verkündet 29.10.2024): Für Buchungsbelege verkürzt sich die Frist von 10 auf **8 Jahre** ab 01.01.2025, für beaufsichtigte Institute ein Jahr später (Sekundärquelle): https://blogs.pwc.de/en/accounting-and-reporting/article/245790/verkuerzung-der-handelsrechtlichen-aufbewahrungsfrist-von-buchungsbelegen-im-bundesgesetzblatt-verkuendet/. Die Gesetzestexte oben zeigen die 8 Jahre bereits in Kraft.
- **GoBD** (BMF-Schreiben; bundesfinanzministerium.de war am Recherchetag nicht erreichbar, HTTP 503):
  - Neufassung vom **28.11.2019**: https://www.datev.de/web/de/berufsgruppenuebergreifend/gesetzliche-themen/gobd/neufassung-vom-28-november-2019 (Sekundärquelle). BMF-URL (nicht abrufbar): https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Weitere_Steuerthemen/Abgabenordnung/2019-11-28-GoBD.pdf
  - **Erste Änderung vom 11.03.2024** (anzuwenden ab 01.04.2024; betrifft v. a. den Datenzugriff nach § 147 Abs. 6 AO): https://www.lfst.bayern.de/fileadmin/RESSOURCEN/INFORMATIONEN/Steuerinfos/Weitere_Themen/Aussenpruefung/2024-03-11-aenderung-gobd.pdf · https://www.datev.de/web/de/berufsgruppenuebergreifend/gesetzliche-themen/gobd/aenderung-vom-11-maerz-2024
  - **Zweite Änderung vom 14.07.2025**, sofort anwendbar. Geändert wurden die Rz. 76, 118, 119, 121, 125, 127, 131, 133 und 166 (Sekundärquellen): https://kpmg.com/de/de/themen/2025/07/bmf-gobd-zweite-aenderung.html · https://www.datev.de/web/de/berufsgruppenuebergreifend/gesetzliche-themen/gobd/aenderungen-vom-14-Juli-2025 · https://www.deloitte-tax-news.de/steuern/indirekte-steuern-zoll/bmf-aktualisierung-der-gobd-und-entwurf-einer-zweiten-verwaltungsanweisung-zur-e-rechnung.html · BMF-URL (nicht abrufbar): https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Weitere_Steuerthemen/Abgabenordnung/2025-07-14-GoBD-2-aenderung.pdf
    - Bei E-Rechnungen genügt es nach Rz. 119, „wenn nur der **strukturierte Teil** aufbewahrt wird“. Der Bild- bzw. PDF-Teil ist nur aufzubewahren, wenn er zusätzliche oder abweichende steuerrelevante Informationen enthält, etwa Buchungsvermerke oder **qualifizierte elektronische Signaturen** (KPMG, Deloitte).
    - Nach Rz. 76 muss keine bildhafte Kopie der Ausgangsrechnung gespeichert werden, solange ein inhaltlich identisches Mehrstück jederzeit erzeugt werden kann (Deloitte).
    - Nach Rz. 131 ist eine Umwandlung in ein anderes Format, z. B. MSG in PDF, „unter den Voraussetzungen der Rz. 135 zulässig“ (KPMG).
  - **Rz. 135 (Konvertierung, „Inhouse-Format“, Fassung 2019):** Bei Konvertierung sind grundsätzlich **beide Versionen** zu archivieren, derselben Aufzeichnung zuzuordnen und gleich zu indexieren. Die konvertierte Fassung allein genügt, wenn keine bildliche oder inhaltliche Veränderung erfolgt, keine aufbewahrungspflichtigen Informationen verloren gehen und die verlustfreie Konvertierung in der Verfahrensdokumentation dokumentiert ist (Sekundärquellen): https://www.psp.eu/assets/pdfs/gobd_experten_erlaeutern_ersetzendes_konvertieren.pdf · https://blogs.pwc.de/de/steuern-und-recht/article/227626/update-neufassung-der-grundsaetze-zur-ordnungsmaessigen-fuehrung-und-aufbewahrung-von-buechern-aufzeichnungen-und-unterlagen-in-elektronischer-form-sowie-zum-datenzugriff-gobd/
  - **Zur Frage „bildlich vs. maschinell auswertbar“:** Für empfangene Briefe und Belege verlangt § 147 Abs. 2 AO **bildliche** Übereinstimmung. Die GoBD verschieben das Gewicht seit 2025 bei E-Rechnungen ausdrücklich auf die **strukturierten Daten**.
  - **OFFENE FRAGE (zentral):** Was ist bei einem **responsiven** html-Pro-Dokument, das als Handels- oder Geschäftsbrief oder Buchungsbeleg empfangen wird, das „Bild“, mit dem eine Wiedergabe „bildlich übereinstimmen“ muss? Vermutlich genügt die unveränderte Aufbewahrung des Originalcontainers, weil das Original selbst aufbewahrt wird und nicht eine „Wiedergabe“. Belegt ist das nicht. Eine Stellungnahme von BMF oder Fachliteratur zu responsiven bzw. HTML-Belegen wurde nicht gefunden.
- **Folgerung:** Kein Gesetz verlangt PDF. Verlangt werden Unveränderbarkeit, Vollständigkeit, Ordnung, Lesbarmachung, maschinelle Auswertbarkeit und Verfahrensdokumentation. html-Pro kann das erfüllen, wenn das empfangene Original **byte-identisch** aufbewahrt wird (Hash, Signatur, Zeitstempel), **ein Renderer für die gesamte Aufbewahrungsfrist verfügbar** bleibt (§ 147 Abs. 5 AO verpflichtet, „Hilfsmittel zur Verfügung zu stellen“) und strukturierte Daten exportierbar sind.

### 6.2 Österreich

- **§ 132 BAO:** Bücher, Aufzeichnungen und Belege sind **sieben Jahre** aufzubewahren, länger bei anhängigen Verfahren (Abs. 1). Abs. 2 erlaubt die Aufbewahrung auf Datenträgern, „wenn die **vollständige, geordnete, inhaltsgleiche und urschriftgetreue Wiedergabe** bis zum Ablauf der gesetzlichen Aufbewahrungsfrist jederzeit gewährleistet ist. Soweit solche Unterlagen nur auf Datenträgern vorliegen, **entfällt das Erfordernis der urschriftgetreuen Wiedergabe**.“ Nach Abs. 3 sind Hilfsmittel zur Lesbarmachung bereitzustellen: https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10003940&Paragraf=132
- **§ 190 UGB:** Abs. 4 verbietet unerkennbare Veränderungen. Nach Abs. 5 ist elektronische Speicherung zulässig, sofern die Wiedergabe vollständig, geordnet, inhaltsgleich und urschriftgetreu ist; für elektronisch erstellte Unterlagen entfällt das Erfordernis der Urschrifttreue: https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001702&Paragraf=190
- **§ 212 UGB:** Bücher, Abschlüsse, Geschäftsbriefe und Buchungsbelege sind **sieben Jahre** geordnet aufzubewahren: https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001702&Paragraf=212
- **§ 11 Abs. 2 UStG (AT):** Rechnungsdurchschriften sieben Jahre aufbewahren, § 132 Abs. 2 BAO ist anwendbar. Echtheit, Unversehrtheit und Lesbarkeit elektronischer Rechnungen sind sieben Jahre zu gewährleisten (Link s. 5.4).
- **Folgerung:** Das österreichische Recht ist für ein **originär elektronisches**, responsives Format **günstiger** als das deutsche, weil die urschriftgetreue (bildliche) Wiedergabe bei rein elektronischen Unterlagen ausdrücklich entfällt. Inhaltsgleichheit, Vollständigkeit und Ordnung bleiben Pflicht.
- **OFFENE FRAGE:** Gibt es in AT ein Gegenstück zu den GoBD (BMF-Richtlinie oder Erlass zur elektronischen Archivierung), etwa in den Umsatzsteuerrichtlinien zu § 11, mit Formataussagen? Nicht recherchiert bzw. nicht gefunden.

---

## 7. Gerichtliche Beweiskraft

- **Art. 25 eIDAS:** Eine QES hat die Wirkung einer handschriftlichen Unterschrift. Andere Signaturen dürfen nicht allein wegen ihrer Form als Beweis abgelehnt werden. **Art. 35** regelt dasselbe für Siegel; qualifizierte Siegel tragen eine Vermutung der Unversehrtheit und Herkunft. **Art. 41** regelt Zeitstempel, **Art. 46** elektronische Dokumente (Link s. 2.1).
- **§ 371a Abs. 1 ZPO (DE):** Auf private elektronische Dokumente mit **QES** sind die Vorschriften über die Beweiskraft **privater Urkunden** entsprechend anzuwenden. Der „Anschein der Echtheit“, der sich aus der Prüfung der QES nach Art. 32 eIDAS ergibt, „kann nur durch Tatsachen erschüttert werden, die ernstliche Zweifel daran begründen, dass die Erklärung von der verantwortenden Person abgegeben worden ist“. **Abs. 3:** Öffentliche elektronische Dokumente mit QES oder qualifiziertem Siegel einer Behörde haben die Beweiskraft öffentlicher Urkunden: https://www.gesetze-im-internet.de/zpo/__371a.html
- **§ 371b ZPO:** Gescannte öffentliche Urkunden haben mit Bestätigung der bildlichen und inhaltlichen Übereinstimmung die Beweiskraft öffentlicher Urkunden: https://www.gesetze-im-internet.de/zpo/__371b.html
- **§ 126a BGB:** Die elektronische Form ersetzt die Schriftform nur mit Namen und **QES**. Bei Verträgen muss jede Partei ein **gleichlautendes Dokument** signieren: https://www.gesetze-im-internet.de/bgb/__126a.html. **§ 126b BGB (Textform)** verlangt eine lesbare Erklärung auf einem dauerhaften Datenträger, der sie „unverändert wiedergeben“ kann: https://www.gesetze-im-internet.de/bgb/__126b.html
- **§ 4 SVG (AT), Signatur- und Vertrauensdienstegesetz, BGBl. I Nr. 50/2016:** „Eine qualifizierte elektronische Signatur erfüllt das rechtliche Erfordernis der **Schriftlichkeit im Sinne des § 886 ABGB**.“ Andere Formerfordernisse (Notar, Rechtsanwalt) bleiben unberührt. **Letztwillige Verfügungen** können nicht elektronisch errichtet werden. Familien- und erbrechtliche Erklärungen sowie Verbraucherbürgschaften brauchen eine Bestätigung durch Notar oder Rechtsanwalt (Abs. 2). AGB-Klauseln gegen QES gegenüber Verbrauchern sind grundsätzlich unverbindlich (Abs. 3): https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR40184733/NOR40184733.html
- **OFFENE FRAGE:** Wie behandelt die österreichische ZPO (§ 294 ZPO, Privaturkunden, und freie Beweiswürdigung) QES-signierte elektronische Dokumente konkret? Gibt es eine dem § 371a ZPO (DE) entsprechende Echtheitsvermutung? Nicht recherchiert.
- **Bedeutung für html-Pro: WYSIWYS als Beweisproblem.** § 371a ZPO knüpft an eine **„Erklärung“** an, § 126a BGB an ein **„gleichlautendes Dokument“**. Bei responsivem und skriptgesteuertem Inhalt kann dieselbe signierte Bytefolge auf zwei Geräten unterschiedlich aussehen, oder ein Skript zeigt nach der Signatur andere Inhalte. Die Gegenseite könnte dann „ernstliche Zweifel“ am Erklärungsinhalt begründen. Das ist keine Rechtsfrage zur Zulässigkeit, sondern eine **Beweis- und Designfrage**. html-Pro braucht deshalb:
  1. Signatur über **alle** Ressourcen (HTML, CSS, Fonts, Bilder, Skripte, Manifest).
  2. Ein **deterministisches Signaturprofil**: keine externen Ressourcen, keine Netzwerkzugriffe, Skripte deaktiviert oder auf einen deklarierten, signierten Funktionsumfang beschränkt, Formularwerte ausdrücklich mitsigniert.
  3. Optional eine **kanonische Referenzdarstellung** (z. B. eingebettetes PDF/A-Rendering oder definierter Referenz-Viewport), die mitsigniert ist. Das widerspricht teilweise dem Anspruch „kein Papier simulieren“ und ist eine **benennenswerte Schwäche des Konzepts**.

---

## 8. Tabelle: Anforderung → was html-Pro erfüllen müsste

| # | Anforderung (Quelle) | Was html-Pro konkret leisten müsste | Härte |
|---|---|---|---|
| 1 | EAA Anh. I Abschn. III: Textformate für assistive Alternativen, anpassbare Abstände; BFSG/BaFG | Semantisches HTML erzwingen (Überschriften, Listen, Tabellen mit Headern, `lang`, Alt-Texte, Labels). Nutzer müssen Schrift, Abstände und Kontrast anpassen können. Reflow ist Standard | hoch (für erfasste Dienste) |
| 2 | WCAG 2.2 AA / EN 301 549 (V3.2.1 jetzt, V4.1.1 bald) | Integrierter Prüfer im Editor mit Mapping auf WCAG-SC und EN-301-549-Klauseln. Barrierefreiheitsbericht exportieren. Manuelle Prüfschritte führen, da ca. ⅓ nicht automatisierbar ist (Matterhorn-Analogie) | hoch |
| 3 | Interaktive Elemente (WAI-ARIA 1.2) | Nur geprüfte, barrierefreie Komponenten (Formulare, Akkordeons, Tabs) aus einer Bibliothek; freies JS nur sandboxed und ohne Einfluss auf Barrierefreiheit und Signatur | hoch |
| 4 | Barrierefreiheitsmetadaten (EAA E-Books; EPUB A11y 1.1) | Metadaten im Manifest (Konformitätsangabe, Zugriffsmodi, Gefahren), angelehnt an EPUB Accessibility 1.1 / schema.org | mittel |
| 5 | Signaturformate, die Behörden anerkennen müssen (DVO 2026/248, ab 23.02.2027) | Container als **ASiC-E mit XAdES Baseline** (B-LT/B-LTA) bauen. Optional JAdES für JSON-Manifest. Kein Eigenformat | sehr hoch |
| 6 | AdES/QES nach Art. 26/25 eIDAS; Fernsignatur | Signieren über Fernsignatur (CSC API / ETSI TS 119 432), Anbindung ID Austria/A-Trust und deutscher QTSP, später EUDI-Wallet. Mehrfachsignaturen und Gegenzeichnung ohne Bruch früherer Signaturen (ASiC-E erlaubt das) | sehr hoch |
| 7 | Validierbarkeit (DSS, RTR-Prüfdienst) | Container müssen in EU DSS und bei RTR ohne Sonderbehandlung validieren. Eingebauter Validator auf DSS-Basis mit EU-Trusted-Lists (LOTL) | sehr hoch |
| 8 | Beweiskraft § 371a ZPO / § 4 SVG / § 126a BGB („gleichlautendes Dokument“) | WYSIWYS-Profil: alle Ressourcen signiert, keine externen Abrufe, Skripte im Signaturmodus aus, Formularzustand signiert, optional mitsignierte Referenzdarstellung | sehr hoch |
| 9 | Zeitstempel / LTV (EN 319 422, DVO 2025/1929) | Qualifizierte Zeitstempel einholen, Validierungsdaten einbetten (B-LT), Archivzeitstempel nachziehen (B-LTA / `ASiCArchiveManifest`) | hoch |
| 10 | Beweiswerterhaltung (VDG § 15, TR-ESOR, TS 119 511, DVO 2025/1946) | Container direkt als ASiC-AIP bzw. Preservation Object Container einstellbar; Re-Timestamping-Workflow; Export für Bewahrungsdienste | mittel bis hoch |
| 11 | Qualifizierte Archivierung (eIDAS Art. 45i/j, DVO 2025/2532, CEN/TS 18170, OAIS) | OAIS-taugliche Paketierung (SIP/AIP-Mapping), dokumentierte Formatmigration (z. B. → PDF/A) | mittel |
| 12 | Gerichts-ERV DE (ERVV § 2, § 4 Abs. 2; ERVB 2025) | **PDF-Export** (PDF/A-2 bzw. PDF/UA, ohne JS, Schriften eingebettet), **je Dokument einzeln** signierbar (PAdES), XJustiz-Datensatz optional | sehr hoch (sonst kein Justizeinsatz) |
| 13 | ERV AT (ERV 2021, Schnittstellenbeschreibung) | PDF-Export für Beilagen; strukturierte Eingaben bleiben Sache der ERV-Software (Formate: OFFENE FRAGE) | hoch |
| 14 | Steuer/Handel DE (§ 147 AO, § 257 HGB, GoBD) | Originalcontainer byte-identisch aufbewahren, Unveränderbarkeit (Hash und Signatur), Viewer für 8–10 Jahre verfügbar halten, Verfahrensdokumentation, strukturierte Daten maschinell auswertbar exportieren | hoch |
| 15 | Steuer/Handel AT (§ 132 BAO, §§ 190/212 UGB, § 11 UStG) | Wie 14, mit 7-Jahres-Frist; inhaltsgleiche, vollständige, geordnete Wiedergabe sicherstellen | hoch |
| 16 | E-Rechnung (§ 14 UStG DE, EN 16931, ViDA 2030; AT B2G) | html-Pro ist **keine** E-Rechnung. Möglich sind Einbettung bzw. Erzeugung von XRechnung/ZUGFeRD (CII/UBL) und eine PDF/A-3-Hybridausgabe | mittel (Nische, aber Akzeptanzhebel) |
| 17 | Archivformate (LoC RFS, KOST, DNB) | Öffentliche, versionierte Spezifikation; EPUB-Nähe; Export nach PDF/A-2/3 und WARC/WACZ; nur selbstenthaltene Container ohne externe Ressourcen | hoch |
| 18 | Herkunft/KI-Kennzeichnung (C2PA 2.4) | Optional C2PA-Manifest (ZIP-Hashing nach A.6 oder HTML-`link` nach A.7). Reihenfolge mit ASiC-Signatur definieren. Klar kommunizieren: C2PA ist keine Unterschrift | niedrig bis mittel |
| 19 | Barrierefreier Signaturvorgang (EAA Anh. I IV e/g) | Signatur-UI wahrnehmbar, bedienbar, verständlich und robust (Tastatur, Screenreader, verständliche Statusmeldungen der Validierung) | hoch (Banking, E-Commerce) |
| 20 | Sicherheit (implizit: Integrität, Art. 26 lit. d) | Kein aktiver Code, der den signierten Inhalt nachträglich verändert. CSP/Sandbox. Externe Ressourcen standardmäßig verboten | sehr hoch |

---

## 9. Bewertung: Was heißt das für die Grundsatzfrage „HTML als Basis?“

**Für HTML (im ZIP-Container):**
- Es gibt **keine gesetzliche PDF-Pflicht** im Steuer- und Handelsrecht von DE und AT. Österreich verzichtet bei originär elektronischen Unterlagen sogar auf die urschriftgetreue Wiedergabe.
- ASiC-E (ETSI), EPUB/OCF (W3C) und C2PA (ZIP-Hashing, HTML-Einbettung) liefern **fertige, interoperable Bausteine** für Signatur, Container und Herkunft. ASiC-E ist ab 2027 EU-weit anerkannt und von DSS und RTR validierbar.
- Die EAA-Anforderungen (Reflow, anpassbare Abstände) sind mit HTML/CSS **leichter** zu erfüllen als mit festem PDF-Layout.

**Gegen HTML bzw. ungelöste Schwächen:**
- **Gerichte und Behörden** listen PDF (DE ERVV) bzw. strukturierte Formate. Ohne PDF-Export ist html-Pro dort nutzlos. In DE sind **Container-Signaturen bei Gericht sogar verboten** (ERVV § 4 Abs. 2).
- **Das Prinzip „What you see is what you sign“ widerspricht dem Anspruch auf Interaktivität.** Je interaktiver das Dokument, desto schwächer der Beweiswert, sofern kein strenges, signiertes Darstellungsprofil existiert.
- **Archive** stufen HTML nur als „acceptable“ bzw. Plain-Text-Ersatz ein. Bevorzugt sind EPUB 3, PDF/A und PDF/UA sowie WARC/WACZ.
- In der **Praxis** ist HTML genauso schlecht barrierefrei wie PDF (95,9 % fehlerhafte Startseiten). Der Vorteil existiert nur, wenn der Editor ihn erzwingt.
- **Akzeptanz kommt über Normen.** Das zeigt die E-Rechnung (EN 16931) ebenso wie PDF/A und PDF/UA (ISO) und ASiC (ETSI). Ein Format ohne Normungsweg bleibt Insellösung.

**Konsequenz für das Konzept (Vorschlag):** html-Pro als **EPUB/OCF-kompatibler Container, der zugleich ASiC-E-konform ist**: Signaturen als XAdES-Baseline in `META-INF/signatures*.xml`, Zeitstempel und Archivmanifeste nach EN 319 162. Dazu kommen ein strenger **Signatur- bzw. Archivmodus** (statisch, deterministisch, ohne externe Ressourcen), verpflichtende **Exporte nach PDF/A-2/PDF/UA** (Justiz, Archiv) und **PDF/A-3-Hybrid** (Kompatibilität) sowie optional C2PA für Herkunft und KI-Kennzeichnung.

---

## 10. Quellenliste (nach Thema)

**Barrierefreiheit**
- Richtlinie (EU) 2019/882 (EAA), DE: https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32019L0882
- BFSG: https://www.gesetze-im-internet.de/bfsg/BJNR297010021.html
- BFSGV: https://www.gesetze-im-internet.de/bfsgv/BJNR092800022.html
- BaFG (AT), BGBl. I Nr. 76/2023: https://www.ris.bka.gv.at/Dokumente/BgblAuth/BGBLA_2023_I_76/BGBLA_2023_I_76.html · https://ris.bka.gv.at/eli/bgbl/I/2023/76
- Web Accessibility Directive 2016/2102 (Zusammenfassung/Text): https://eur-lex.europa.eu/EN/legal-content/summary/accessibility-of-public-sector-websites-and-mobile-apps.html · https://www.legislation.gov.uk/eudr/2016/2102/article/1
- EN 301 549 V4.1.1 (ETSI): https://www.etsi.org/deliver/etsi_en/301500_301599/301549/04.01.01_60/en_301549v040101p.pdf
- EN 301 549 V4.1.1 Einordnung (Sekundär): https://www.pivotalaccessibility.com/2026/09/en-301-549-v4-1-1-is-published-what-it-means-for-digital-accessibility/
- EN 301 549 Kap. 10 (DE): https://LBIT.hessen.de/sites/lbit.hessen.de/files/2022-01/en_301_549_kapitel_10.pdf
- WCAG 2.2: https://www.w3.org/TR/WCAG22/ · Update 12/2024: https://www.w3.org/WAI/news/2024-12-12/wcag2updates/ · ISO/IEC 40500:2025: https://www.w3.org/WAI/news/2025-10-21/wcag22-iso
- SC 1.4.10 Reflow: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
- WAI-ARIA 1.2: https://www.w3.org/WAI/news/2023-06-06/aria-12-rec/
- EPUB Accessibility 1.1: https://www.w3.org/TR/epub-a11y-11/ · EPUB 3.3: https://www.w3.org/TR/epub-33/
- ISO 14289-1:2014: https://www.iso.org/standard/64599.html
- ISO 14289-2:2024: https://scc-ccn.ca/standardsdb/standards/8185912 · https://pdfa.org/iso-14289-2-pdf-ua-2-the-gold-standard-for-accessibility-in-pdf-2-0-has-arrived/
- WTPDF 1.0: https://pdfa.org/wp-content/uploads/2024/02/Well-Tagged-PDF-WTPDF-1.0.pdf · https://pdf-issues.pdfa.org/wtpdf-1/index.html
- Matterhorn: https://www.pdflib.com/pdf-knowledge-base/pdfua/matterhorn-protocol · https://pdfa.org/download-area/accessibility/MatterhornProtocol_1-02.pdf · https://pdfa.org/tagged-pdf-related-projects/
- veraPDF/PDF-UA-2 (Sekundär): https://pdfa.org/?p=138323
- WebAIM Million 2026: https://webaim.org/projects/million/ · 2025: https://webaim.org/projects/million/2025
- PDF-Studie DE öffentliche Hand 2026: https://www.axes4.com/en/blog/post/2026-1/only-9-5-pac-compliant-what-the-new-study-on-pdf-accessibility-in-the-public-sector-reveals · https://www.digitalaccessibility.report/
- PDF-Studie Luxemburg 2023: https://accessibilite.public.lu/en/news/2023-04-28-des-pdf-majoritairement-inaccessibles.html
- Scholarly PDFs (arXiv): https://arxiv.org/abs/2410.03022

**Signaturen / eIDAS**
- eIDAS konsolidiert (inkl. 2024/1183): https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:02014R0910-20240520
- VO (EU) 2024/1183: https://eur-lex.europa.eu/eli/reg/2024/1183/oj
- DVO (EU) 2024/2977: https://eur-lex.europa.eu/eli/reg_impl/2024/2977/oj
- DVO (EU) 2026/248 (anerkannte AdES-Formate): https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32026R0248
- ETSI XAdES EN 319 132-1: https://www.etsi.org/deliver/etsi_en/319100_319199/31913201/01.03.01_60/en_31913201v010301p.pdf
- ETSI CAdES EN 319 122-1: https://www.etsi.org/deliver/etsi_en/319100_319199/31912201/01.03.01_60/en_31912201v010301p.pdf
- ETSI PAdES EN 319 142-1: https://www.etsi.org/deliver/etsi_en/319100_319199/31914201/01.02.01_60/en_31914201v010201p.pdf
- ETSI JAdES TS 119 182-1: https://www.etsi.org/deliver/etsi_ts/119100_119199/11918201/01.02.01_60/ts_11918201v010201p.pdf
- ETSI ASiC EN 319 162-1/-2: https://www.etsi.org/deliver/etsi_en/319100_319199/31916201/01.01.01_60/en_31916201v010101p.pdf · https://www.etsi.org/deliver/etsi_en/319100_319199/31916202/01.01.01_60/en_31916202v010101p.pdf
- ETSI TS 119 432 (Remote Signing): https://www.etsi.org/deliver/etsi_ts/119400_119499/119432/ · https://www.etsi.org/newsroom/press-releases/1573-2019-04-etsi-releases-three-specifications-for-cloud-based-digital-signatures
- CSC API v2.2: https://cloudsignatureconsortium.org/resources/csc-api-v2-2/
- EU DSS: https://github.com/esig/dss · Demo: https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/validation · FAQ: https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/880312429/eSignature+FAQ
- RTR Signaturprüfung: https://www2.rtr.at/en/vd/Pruefung_Details
- ID Austria (BKA): https://www.bundeskanzleramt.gv.at/agenda/digitalisierung/digitales-oesterreich/id-austria.html
- Handy-Signatur-Ende (Presse): https://www.derstandard.at/story/3000000190505/die-handysignatur-wird-am-5-dezember-2023-abgedreht
- A-Trust (Sekundär): https://www.docusign.com/de-de/blog/partnerschaft-a-trust · https://www.trendingtopics.eu/a-trust-wird-launch-partner-der-deutschen-eudi-wallet-d-you/
- EUDI-Wallet DE (Sekundär): https://netzpolitik.org/2026/faq-zur-eudi-wallet-die-wichtigsten-fragen-und-antworten-zur-digitalen-brieftasche/ · https://www.bundestag.de/1222734
- EUDI-Wallet AT (Sekundär): https://www.weekend.at/politik/reisepass-digital-eu-eudi-wallet-2027 · https://www.bundeskanzleramt.gv.at/bundeskanzleramt/nachrichten-der-bundesregierung/2025/10/id-austria-zukunftsforum-erfolgreicher-auftakt-des-dialogs-ueber-die-digitale-zukunft-oesterreichs.html · https://www.parlament.gv.at/dokument/XXVIII/AB/5451/imfname_1769922.pdf
- EUDI Frist (Sekundär): https://gdprlocal.com/eu-digital-identity-wallet/
- VDG: https://www.gesetze-im-internet.de/vdg/ · § 15: https://www.gesetze-im-internet.de/vdg/__15.html

**Zeitstempel / Beweiswerterhaltung**
- RFC 3161: https://www.rfc-editor.org/rfc/rfc3161 · RFC 4998: https://www.rfc-editor.org/rfc/rfc4998 · RFC 6283: https://www.rfc-editor.org/rfc/rfc6283.html
- ETSI EN 319 422: https://www.etsi.org/deliver/etsi_en/319400_319499/319422/01.01.01_60/en_319422v010101p.pdf
- ETSI TS 119 511: https://www.etsi.org/deliver/etsi_ts/119500_119599/119511/01.02.01_60/ts_119511v010201p.pdf
- ETSI TS 119 512: https://www.etsi.org/deliver/etsi_ts/119500_119599/119512/01.02.01_60/ts_119512v010201p.pdf
- DVO (EU) 2025/1929 (Zeitstempel): https://eur-lex.europa.eu/eli/reg_impl/2025/1929/oj
- DVO (EU) 2025/1946 (Bewahrungsdienste): https://eur-lex.europa.eu/eli/reg_impl/2025/1946/oj
- DVO (EU) 2025/2532 (qualifizierte Archivierung): https://eur-lex.europa.eu/eli/reg_impl/2025/2532/oj
- BSI TR-03125 TR-ESOR: https://www.bsi.bund.de/EN/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/Technische-Richtlinien/TR-nach-Thema-sortiert/tr03125/BSITR03125.html

**C2PA**
- Spezifikation 2.4: https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html · Index: https://spec.c2pa.org/specifications/specifications/2.4/index.html
- C2PA About: https://c2pa.org/about/ · Gründung: https://c2pa.org/c2pa-founding-press-release/ · https://www.helpnetsecurity.com/2021/02/23/c2pa-coalition/
- Steering-Committee-Meldungen: https://c2pa.org/openai-joins-c2pa-steering-committee/ · https://www.linuxfoundation.org/press/meta-joins-the-c2pa-steering-committee · https://c2pa.org/amazon-joins-the-c2pa-steering-committee/
- ISO/DIS 22144: https://www.iso.org/standard/90726.html · https://www.din.de/en/wdc-proj:din21:385740551
- C2PA und ISO 32008 (Sekundär, LoC-Vortrag): https://digitalpreservation.gov/meetings/DSA2025/010303_murray-potter_DSA2025-C2PA-G_LAM.pdf

**Archivierung / Justiz / E-Rechnung**
- PDF/A (LoC): https://www.loc.gov/preservation/digital/formats/fdd/fdd000532.shtml · ISO 19005-4: https://www.evs.ee/en/iso-19005-4-2020
- § 130a ZPO: https://www.gesetze-im-internet.de/zpo/__130a.html
- ERVV § 2/§ 4/§ 5: https://www.gesetze-im-internet.de/ervv/__2.html · https://www.gesetze-im-internet.de/ervv/__4.html · https://www.gesetze-im-internet.de/ervv/__5.html
- ERVB 2025: https://justiz.de/laender-bund-europa/elektronische_kommunikation/bundesanzeiger_29_07_2025.pdf
- ERV 2021 (AT): https://www.ris.bka.gv.at/Dokumente/BgblAuth/BGBLA_2021_II_587/BGBLA_2021_II_587.html
- WARC ISO 28500:2017: https://www.standards.govt.nz/shop/ISO-285002017 · LoC: https://www.loc.gov/preservation/digital/formats/fdd/fdd000236.shtml · GSO 2025: https://dgsm.gso.org.sa/store/standards/GSO:946563?lang=en
- WACZ: https://specs.webrecorder.net/wacz/1.1.1/ · https://specs.webrecorder.net/wacz/1.2.0/
- LoC RFS Text: https://www.loc.gov/preservation/resources/rfs/text.html · Web: https://www.loc.gov/preservation/resources/rfs/webarchives.html
- KOST KaD: https://kost-ceco.ch/cms/kad_hypertext_intro_de.html · https://kost-ceco.ch/cms/kad_html_de.html · https://kost-ceco.ch/cms/kad_webseiten_intro_de.html
- DNB Formatpolicy 2012: https://wiki.bsz-bw.de/download/attachments/3454509/DNB-Datei-Formate_policy_2012_.pdf?api=v2
- ÖNB Webarchiv: https://webarchiv.onb.ac.at/web/20250115001533/https://webarchiv.onb.ac.at · https://netpreserve.org/about-us/members/%C3%B6sterreichische-nationalbibliothek-austrian-national-library/
- § 14, § 14b, § 27 UStG: https://www.gesetze-im-internet.de/ustg_1980/__14.html · https://www.gesetze-im-internet.de/ustg_1980/__14b.html · https://www.gesetze-im-internet.de/ustg_1980/__27.html
- BMF E-Rechnung 15.10.2024 (Sekundär): https://newsletter.pwc.de/umsatzsteuer/nl0029-2024-10-29/bmf-e-rechnung
- ZUGFeRD 2.4 / Factur-X 1.08: https://fnfe-mpe.org/wp-content/uploads/2025/12/2025-12-04_ZUGFeRD_2.4_Factur-X_1.08_Meldung_DE.pdf · https://www.ferd-net.de/en/downloads/publications/details/zugferd-24-english
- XRechnung: https://xeinkauf.de/xrechnung/versionen-und-bundles/
- ViDA (EU) 2025/516: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32025L0516
- AT E-Rechnung: https://www.usp.gv.at/themen/steuern-finanzen/umsatzsteuer-ueberblick/weitere-informationen-zur-umsatzsteuer/vorsteuerabzug-und-rechnung/e-rechnung-an-die-oeffentliche-verwaltung.html · https://www.usp.gv.at/themen/steuern-finanzen/umsatzsteuer-ueberblick/weitere-informationen-zur-umsatzsteuer/vorsteuerabzug-und-rechnung/e-rechnung.html · https://www.wko.at/netzwerke/10-jahre-e-rechnung-an-den-bund · https://www.wko.at/aussenwirtschaft/e-rechnung-pflicht

**Aufbewahrung / Beweiskraft**
- § 146, § 147 AO: https://www.gesetze-im-internet.de/ao_1977/__146.html · https://www.gesetze-im-internet.de/ao_1977/__147.html
- § 239, § 257 HGB: https://www.gesetze-im-internet.de/hgb/__239.html · https://www.gesetze-im-internet.de/hgb/__257.html
- BEG IV (Sekundär): https://blogs.pwc.de/en/accounting-and-reporting/article/245790/verkuerzung-der-handelsrechtlichen-aufbewahrungsfrist-von-buchungsbelegen-im-bundesgesetzblatt-verkuendet/
- GoBD 2019/2024/2025: https://www.datev.de/web/de/berufsgruppenuebergreifend/gesetzliche-themen/gobd/neufassung-vom-28-november-2019 · https://www.lfst.bayern.de/fileadmin/RESSOURCEN/INFORMATIONEN/Steuerinfos/Weitere_Themen/Aussenpruefung/2024-03-11-aenderung-gobd.pdf · https://www.datev.de/web/de/berufsgruppenuebergreifend/gesetzliche-themen/gobd/aenderung-vom-11-maerz-2024 · https://kpmg.com/de/de/themen/2025/07/bmf-gobd-zweite-aenderung.html · https://www.datev.de/web/de/berufsgruppenuebergreifend/gesetzliche-themen/gobd/aenderungen-vom-14-Juli-2025 · https://www.deloitte-tax-news.de/steuern/indirekte-steuern-zoll/bmf-aktualisierung-der-gobd-und-entwurf-einer-zweiten-verwaltungsanweisung-zur-e-rechnung.html
- GoBD Rz. 135 (Sekundär): https://www.psp.eu/assets/pdfs/gobd_experten_erlaeutern_ersetzendes_konvertieren.pdf · https://blogs.pwc.de/de/steuern-und-recht/article/227626/update-neufassung-der-grundsaetze-zur-ordnungsmaessigen-fuehrung-und-aufbewahrung-von-buechern-aufzeichnungen-und-unterlagen-in-elektronischer-form-sowie-zum-datenzugriff-gobd/
- BMF-Originale (am 11.10.2026 nicht erreichbar): https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Weitere_Steuerthemen/Abgabenordnung/2019-11-28-GoBD.pdf · https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Weitere_Steuerthemen/Abgabenordnung/2025-07-14-GoBD-2-aenderung.pdf
- § 132 BAO: https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10003940&Paragraf=132
- § 190, § 212 UGB: https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001702&Paragraf=190 · https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001702&Paragraf=212
- § 11 UStG 1994 (AT): https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10004873&Paragraf=11
- § 371a, § 371b ZPO: https://www.gesetze-im-internet.de/zpo/__371a.html · https://www.gesetze-im-internet.de/zpo/__371b.html
- § 126a, § 126b BGB: https://www.gesetze-im-internet.de/bgb/__126a.html · https://www.gesetze-im-internet.de/bgb/__126b.html
- § 4 SVG (AT): https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR40184733/NOR40184733.html

---

## 11. Offene Fragen

**Barrierefreiheit**
1. Fällt PDF (und künftig ein html-Pro-Container) unter „Dateiformate von Büro-Anwendungen“ im Sinne von Art. 2 Abs. 4 lit. b EAA? Gibt es dazu eine offizielle Leitlinie der Kommission?
2. Ist ein html-Pro-Dokument nach EN 301 549 als Web-Inhalt (Kap. 9) oder als Nicht-Web-Dokument (Kap. 10) zu prüfen?
3. Wann wird EN 301 549 V4.1.1 im Amtsblatt gelistet (laut Sekundärquelle Ziel 30.11.2026)?
4. Ist das Matterhorn-Protokoll 2.0 für PDF/UA-2 veröffentlicht?

**Signaturen**
5. Darf ein ASiC-E-mit-XAdES-Container einen eigenen Mime-Typ tragen, ähnlich wie EPUB und ODF, und dennoch ASiC-Baseline-konform sein? Der Abschnitt 4.4.3.1 von EN 319 162-1 war nicht extrahierbar.
6. Gibt es eine ETSI-Spezifikation für ASiC mit JAdES-Signaturen?
7. Was hat die Prüfung der Kommission nach Art. 26 Abs. 2 eIDAS (Referenzstandards für AdES, Frist 21.05.2026) ergeben?
8. Bietet A-Trust bzw. ID Austria Drittanbietern eine CSC-konforme Fernsignatur-API, und zu welchen Konditionen?
9. Ab wann kann die deutsche EUDI-Wallet (Start 02.01.2027) QES erzeugen? Wann startet die österreichische Wallet? Der Text der BKA-Anfragebeantwortung 5451/AB war nicht lesbar.
10. Gibt es einen kostenlosen, qualifizierten Validierungsdienst nach Art. 33 eIDAS, der ASiC-E und JAdES prüft? Die DSS-Webapp ist nur eine Demo.
11. Unterstützt die RTR-Signaturprüfung ASiC-E mit mehreren HTML/CSS-Dateien ohne Einschränkung? Belegt ist nur „ASiC“ allgemein. Ein Praxistest mit Beispielcontainer steht aus.

**Zeitstempel / Archiv**
12. Welche Dokumentformate empfiehlt TR-ESOR Anlage F? Ist HTML bzw. ein HTML-Container zulässig?
13. Ist ISO 28500 neu aufgelegt worden (2025?) oder ist „GSO ISO 28500:2025“ nur eine Übernahme?
14. Wie lautet die aktuelle Dateiformat-Policy der DNB für Netzpublikationen (die vorliegende Quelle ist von 2012), und akzeptiert die ÖNB abgelieferte HTML-Container?
15. Welche Formate sind laut Schnittstellenbeschreibung zur ERV 2021 (AT) für Beilagen zulässig (PDF, PDF/A?), mit welchen Größenlimits?
16. Wie lauten Wortlaut und vollständige Versionsliste der ERVB 2025 (DE)? Der PDF-Text war nicht extrahierbar.

**C2PA**
17. Ist ISO 22144 (Content Credentials) inzwischen als IS veröffentlicht? Wie ist der Stand von ISO 32008 (C2PA für PDF 2.0)?
18. Kann eine C2PA-Claim-Signatur mit qualifiziertem Zertifikat und QSCD zugleich die Anforderungen an eine QES erfüllen? Gibt es dazu eine rechtliche Bewertung?

**Aufbewahrung / Beweiskraft**
19. Was gilt bei einem responsiven, empfangenen Handelsbrief oder Buchungsbeleg als „Bild“ im Sinne von § 147 Abs. 2 Nr. 1 AO bzw. § 257 Abs. 3 HGB („bildlich übereinstimmen“)? Gibt es BMF-Aussagen oder Fachliteratur zu HTML-Belegen?
20. Gibt es in Österreich eine GoBD-ähnliche Verwaltungsanweisung mit Formataussagen zur elektronischen Archivierung?
21. Wie behandelt die österreichische ZPO QES-signierte elektronische Dokumente beweisrechtlich (§ 294 ZPO)? Gibt es eine Echtheitsvermutung analog zu § 371a ZPO?
22. Gibt es Rechtsprechung zu signierten **dynamischen bzw. HTML-Dokumenten** und zum Einwand, der angezeigte Inhalt weiche vom signierten ab (WYSIWYS)?

**Markt DACH**
23. **Schweiz** (Teil von DACH, nicht EU) wurde nicht recherchiert: ZertES (qualifizierte Signatur), GeBüV und Art. 957a OR (Aufbewahrung), Behindertengleichstellungsrecht, Gerichts-ERV (Justitia 4.0). Das ist für den DACH-Markt nachzuholen.
