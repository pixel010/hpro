# 07 – Foren ausgewertet: Was Nutzer von einem Dokumentprogramm erwarten

**Erhebung:** 11.10.2026. **Frage des Auftraggebers:** Was erwarten Nutzer von einem
Dokument-Bearbeitungsprogramm? Worüber wird in Foren gestritten, was fehlt, was nervt?

**Methode:** Foren- und Community-Quellen gesucht und ausgewertet, Schwerpunkt auf Threads, in denen
Nutzer selbst Wünsche, Fehler und Grenzen beschreiben. Zitate sind gekürzt und übersetzt, die
Fundstelle ist jeweils angegeben. Keine Vollerhebung: Reddit liefert beim Abruf nur die
Top-Kommentare, Adobe UserVoice nur die obersten Ideen. Was das für die Belastbarkeit bedeutet,
steht in Abschnitt 8.

---

## 1. Welche Foren ausgewertet wurden

| Forum / Quelle | Was dort zu finden ist | Belege |
| --- | --- | --- |
| r/pdf | Wunschlisten, Alternativensuche, Entwickler-Selbstauskünfte | 4 Threads, s. Abschnitt 3 |
| r/Acrobat | Warum Profis bei Acrobat bleiben, wo Alternativen scheitern | 1 Thread, 20 Kommentare |
| r/FuckAdobe | Preiswut, Abo-Ablehnung, Randfälle (Formular-Automatik) | 1 Thread |
| r/software | Betriebliche Ablösung von Acrobat, gescheiterte Umstellungen | 1 Thread |
| Adobe UserVoice (Acrobat Win/Mac) | Offizielle Wunschliste, **14.347 Ideen** | Top-Ideen |
| Adobe Community (Feature Requests) | Wünsche und Fehlerberichte | Kategorie |
| Hacker News | Grundsatzdebatten „warum noch PDF" | 2 Threads |
| UX Stack Exchange | Formatvergleich HTML/PDF, Integrität, Self-Contained | 1 Thread |
| W3C public-digipub-ig | Die Fachdebatte „PDF-Ersatz per HTML/ZIP" | Thread Februar 2016 |
| GOV.UK (GDS-Blog + Kommentare) | Staatlicher Praxisfall HTML statt PDF | Artikel 2018, 58 Kommentare |
| GitHub (SumatraPDF-Diskussion) | Funktionswünsche freier Reader | 1 Diskussion |
| PDF Association, Karlen Communications | Gegenseite und Barrierefreiheits-Erhebung | 2 Fachtexte |

---

## 2. Die Erwartungsliste – was ein Dokumentprogramm können muss

Aus den Wunschlisten (r/pdf 07.08.2026 und 2026; r/pdf „Looking for a PDF Editor/Viewer").
Ein Nutzer hat die Liste selbst zusammengestellt und zur Diskussion gestellt:

> Anmerkungen hinzufügen oder ändern · Formularfelder anlegen · Formularfelder ausfüllen ·
> Hyperlinks hinzufügen oder ändern · Lesezeichen verwalten · Seiten umsortieren, einfügen,
> löschen · teilen und zusammenführen · signieren, verschlüsseln, Passwortschutz · Bilder
> hinzufügen, entfernen, extrahieren · Schriften ersetzen oder ergänzen · Textinhalt bearbeiten
> (r/pdf, 07.08.2026)

Dazu aus weiteren Threads:

- **Scannen im Programm** („in-app scan to pdf") — „die Zukunft, die nur Acrobat hat".
- **OCR mit Zeichengenauigkeit**, auch für Schriften außerhalb des lateinischen Alphabets, und
  Übersetzung großer Dokumente.
- **Wasserzeichen entfernen**, ohne den Text darunter zu zerstören.
- **Kein Absturz bei großen Dateien.**
- **Reihenfolge der Genannten:** zusammenführen, Text bearbeiten, OCR, flatten, Seiten organisieren
  und einzeln exportieren, komprimieren (r/pdf, Post 1t56tug).
- **Aus dem Produktionsumfeld:** Vorstufenprüfung (Preflight), Farbmanagement, JavaScript,
  Barrierefreiheit, sehr große Dokumente (r/Acrobat, 18.07.2026).

### Das Preismodell ist ein eigener Funktionswunsch

Abo-Ablehnung ist in allen Threads die stärkste gemeinsame Kraft: „Adobe Acrobat kostet rund 300
Dollar im Jahr, Microsoft 365 rund 100 mit allen Programmen" (r/pdf). Genannt werden als Ersatz
meist: PDF-XChange Editor (Einmallizenz), PDF24, Foxit, PDFgear, OnlyOffice, SumatraPDF,
PDF Arranger. Ein Nutzer beschreibt den Ablöseversuch in der Firma ernüchternd: Alternative fehlte
eine Kommentarart, eine andere speicherte Einstellungen in `ProgramData` und war damit im
Mehrbenutzerbetrieb unbrauchbar (r/software). **Lehre: der Umstieg scheitert selten an einem
Kernfeature, sondern an Kleinigkeiten, die den Arbeitsablauf brechen.**

### Datenschutz und KI-Abwehr

Im Adobe-UserVoice steht eine Idee mit **230 Stimmen** gegen KI in Acrobat: man wolle die
KI-Option nicht auf dem Bildschirm sehen, es gebe „keinen legitimen Grund, dass KI unsere
persönlichen Dokumente durchsucht". Parallel werben PDF-Tools in r/pdf damit, dass „nichts
hochgeladen wird" und alles offline im Browser läuft. Wer ein Dokumentprogramm baut, muss
**lokale Verarbeitung als Standard** setzen und Cloud/KI als ausdrückliche Entscheidung.

---

## 3. Wo alle Werkzeuge scheitern – die ungelösten Probleme

Das ist der wertvollste Teil der Forenrecherche, denn hier liegt die Lücke für hpro.

**a) „Text bearbeiten" ist bei fast allen Werkzeugen gefälscht.** Ein Entwickler schreibt offen:

> „Wenn du in den meisten kostenlosen PDF-Werkzeugen ‚Text bearbeitest', bearbeitest du nicht die
> Textobjekte des PDF. Du bekommst ein Overlay, das an die Originalschrift angepasst wird, damit es
> nativ aussieht." (r/pdf, 2026)

Er sagt dazu selbst, dass er es lieber offenlegt, als dass „jemand es nach dem Bearbeiten eines
Vertrags entdeckt". **Für hpro ist das der strukturelle Vorteil: die Quelle ist Text.**
Bearbeiten ist keine Rekonstruktion, sondern eine Änderung am Dokument.

**b) Echtes Redigieren im Browser ist ungelöst.** In einem Thread über den Überfluss an
KI-erzeugten PDF-Apps (17 Kommentare, 06.07.2026):

> „Es gibt noch ungelöste Probleme. Echtes Redigieren im Browser zum Beispiel — ohne
> Rasterisierung. Löse das, und du bekommst Nutzer." (r/pdf)

Auch im Profi-Thread kommen genau hier die schlimmsten Erfahrungen: „Warte, bis du 100+ Seiten mit
Acrobat redigieren musst. Manchmal klappt es, manchmal nicht — in meiner Erfahrung scheitert es,
wenn morgen die Frist ist und rechtliche Konsequenzen drohen" (r/Acrobat).
**Für hpro trivial und dennoch die wichtigste Verkaufsaussage: Redaktion ist Löschen der Daten,
nicht Überdecken.**

**c) Große Dateien und Produktion.** Ein Nutzer sucht verzweifelt eine Alternative: „jede andere
Software ist ein Lesegerät, das sich als Pro-Werkzeug ausgibt". Die Antwort aus der Community
erklärt den Graben nüchtern:

> „‚PDF-Editor' deckt einen riesigen Bereich ab. Die meisten Alternativen sind für Anmerkungen,
> Formulare oder leichtes Bearbeiten gebaut, während Acrobat über Jahrzehnte Funktionen für
> Druckproduktion, Vorstufe, Barrierefreiheit, JavaScript, Farbmanagement, Preflight und sehr große
> Dokumente angesammelt hat." (r/Acrobat, 19.07.2026)

**d) Formular-Automatik ist ein Randfall, aber ein harter.** Ein Nutzer verteilt ein
Finanzformular an Hunderte Kunden: Berechnungen, bedingte Abschnitte, Validierung vor dem Absenden.
„PDFgear kann das nicht; nur Acrobat Pro hat die JavaScript-Konsole und die Acrobat-JS-API dafür."
Die Antwort: „Du bist der eine Prozent, der die Acrobat-Suite wirklich braucht." (r/FuckAdobe,
13.04.2026) — **Für hpro ist genau dieser „eine Prozent" der Normalfall**: Formularlogik ist im
Web-Standard nichts Besonderes.

**e) OCR bleibt nötig.** Papiereingang, Scan, Kamera — ohne OCR kommt kein Dokumentprogramm aus,
und die Qualitätsansprüche in den Foren sind hoch (zeichengenau, auch fremde Schriftsysteme).

**f) Der Import ist der Engpass.** Aus der Fachdebatte: automatische Umwandlung von PDF oder LaTeX
nach HTML ergibt „crappy layout" (Hacker News), und PDF ist in seinem Kern „ein Bündel
seitenweise gesetzter Grafik" — Text und Struktur müssen heuristisch rekonstruiert werden.

---

## 4. Warum PDF bleibt – was kein Formatwechsel löst

Diese Argumente sind der Grund, warum EPUB und XPS PDF nicht verdrängt haben. Sie stehen alle in
den Foren:

- **Zitierbarkeit:** „Man kann niemandem ein EPUB geben und sagen: lies Seite 197." Seitenzahlen
  sind ein stabiler Bezugspunkt, auch in Bibliografien (Hacker News, 08.03.2023).
- **Drucken:** „Man druckt ein PDF und bekommt genau das, was auf dem Bildschirm war. Beim Web
  versucht der Browser es irgendwie auf die Seite zu quetschen, und es sieht meist schrecklich aus."
- **Ein einziges File:** „Ich kann jemandem das Ganze als eine Datei schicken. Für eine Webseite
  müsste ich ein ZIP schicken, das er erst entpacken muss." (Hacker News, 2020)
- **Statik ist ein Feature, kein Fehler:** Autoren wollen teils gerade nicht, dass Inhalte
  einzeln herausziehbar sind; Layout ist Teil der Aussage.
- **Vertrautheit und Tooling:** „PDF ist ein Format; der Inhalt ist die Wahl des Autors."
- **Der Gegenseite zufolge:** „PDFs Zweck ist, die Rolle ‚Dokument' zu erfüllen. HTML ist kein
  Dokument, HTML ist ein Erlebnis." (PDF Association)
- **Lehre aus XPS:** Der direkte PDF-Nachfolger war technisch sauber (XML-Toolchain, Struktur) und
  hat sich trotzdem nicht durchgesetzt, weil „es nie ein zwingendes Argument für den Wechsel gab".
  **Ein Format gewinnt nicht durch Technik, sondern durch Notwendigkeit.**

Der stärkste Einwand gegen den HTML-Weg kam 2016 in der W3C-Debatte von einem Nutzer, der genau
unser Problem schildert (Prüfbericht an eine Behörde):

> „Idealerweise würde ich eine HTML-Datei erstellen, sie in ein ZIP packen und abschicken. Aber
> wegen der Sicherheitsbedenken würden sie die HTML-Datei nicht öffnen." (W3C public-digipub-ig,
> Februar 2016)

Genau diese Wand adressiert hpro nicht durch ein Format, sondern durch **Programme**: der Reader
macht aus einer fremden ZIP-Datei eine vertrauenswürdige Ansicht. Das ist derselbe Weg, den PDF
über den Acrobat Reader gegangen ist.

---

## 5. Der wichtigste Befund: EPUB ist die Antwort, die es schon gibt

Im W3C-Thread von 2016 wurde ein Vorschlag „PDF-Ersatz per HTML im ZIP" diskutiert. Die Antwort
eines Mitdiskutanten war kurz und vernichtend:

> „Wir haben bereits einen ‚PDF-Ersatz per HTML (ZIP/GZIP)'. Er heißt EPUB, wird breit genutzt
> und dehnt sich in neue Bereiche aus." (W3C public-digipub-ig, Februar 2016)

Zehn Jahre später ist daraus EPUB 3.3 (W3C) geworden — technisch genau das, was der Auftraggeber
beschreibt: HTML im Container, reflowable, barrierefrei, über dreißig Reader-Programme, ein
validierbarer Standard. Es hat PDF trotzdem nicht verdrängt, aus den Gründen in Abschnitt 4.

**Konsequenz für die Positionierung (mein Fazit aus der Recherche):**

1. **Nicht als „neuer Standard" auftreten** — das ist der Weg, der bei XPS und EPUB/PWP gescheitert
   ist. Sondern als **Reader und Bearbeiter**, der auf dem vorhandenen Standard aufsetzt (EPUB-OCF
   als Container) und ihn für Arbeitsdokumente öffnet.
2. **Nicht gegen PDF im Allgemeinen antreten**, sondern gegen PDF für Dokumente, die ohnehin nicht
   gedruckt werden: Formulare, Verträge mit variablen Daten, interaktive Anträge, Berichte mit
   Live-Zahlen, Prüf- und Nachweisbelege.
3. **PDF bleibt Import und Export.** Jedes Dokument muss verlustarm als PDF herauskommen, sonst
   bricht der Geschäftsverkehr — das fordern die Foren an jeder Stelle.
4. **Die drei Fähigkeiten aus Abschnitt 3 sind die Verkaufsargumente**: echtes Bearbeiten ohne
   Overlay, echtes Redigieren ohne Rasterisierung, Formularlogik ohne Sonderweg. Alle drei sind im
   Web-Standard Grundlagen und im PDF-Standard Handarbeit.

---

## 6. Funktionsumfang: Muss, Soll, Nicht

Abgeleitet aus den Foren, sortiert nach der Häufigkeit, mit der Nutzer danach fragen. „Soll" und
„Nicht" sind meine Priorisierung, nicht die der Foren.

**Muss (ohne das gilt ein Programm als unvollständig):**

- Anzeigen: flüssiges Blättern, Zoom, Doppelseite — und ausdrücklich **Reflow für kleine Displays**
- Suchen und Kopieren über Text, nicht über Pixel
- Anmerkungen, Kommentare, Markierungen, Freihand
- Formulare ausfüllen und **anlegen**, mit Berechnung und Validierung
- Seiten organisieren: umsortieren, einfügen, löschen, teilen, zusammenführen, extrahieren
- Export nach PDF, Drucken; Import aus PDF und Scan
- OCR (lokal, mit optionalen Sprachpaketen)
- Signieren (einfach und zertifikatsbasiert), Passwortschutz, Verschlüsselung
- Offline-Betrieb, keine Zwangscloud, keine Zwangskonten
- Lesezeichen, Hyperlinks, Inhaltsverzeichnis, Seitenzahlen und — für Zitate — **stabile
  Abschnittsadressen** als Ersatz für „Seite 197"

**Soll (Differenzierung):**

- Strukturierte Bearbeitung: Überschriften, Listen, Tabellen, Fußnoten, Querverweise pflegen
- Barrierefreiheit als eingebauter Prüflauf mit direkter Korrekturmöglichkeit
- Redaktion, die Daten löscht, mit Prüfprotokoll
- Versionierung mit Änderungsverlauf und Diff — ausdrücklich als Wunsch aus dem Behördenumfeld
- Stapelverarbeitung, Vorlagen, Serienbriefe
- Seitengetreue Ausgabe (feste Seitenansicht) als Alternative zum Reflow
- Bilder und Schriften verwalten, Dokumente komprimieren
- Vergleich zweier Dokumente
- Freie Felder/`<nav>`-Struktur, damit Assistenzsysteme nicht den ganzen Inhalt parsen müssen

**Nicht (bewusst auslassen, mit Begründung):**

- **Druckvorstufe, Preflight-Profile, Farbmanagement, PDF/X, Ausgabe-Vorschau.** Das ist der Graben,
  den Acrobat über Jahrzehnte aufgeschüttet hat, und der Aufwand steht in keinem Verhältnis zum
  Nutzen für Dokumente, die nicht gedruckt werden. Wer das braucht, arbeitet weiter mit Acrobat.
- **Eigener Renderer.** Der Web-Browser ist der Renderer. Das war EPUBs Stärke und ist die
  Voraussetzung für „auf allen Geräten verfügbar".
- **Acrobat-JavaScript nachbauen.** Formularlogik wird im hpro-Format mit normalem Web-JavaScript
  geschrieben, nicht mit einer nachgebauten Acrobat-API.
- **Cloudzwang, Anmeldung, Telemetrie, KI im Standardweg** — die Foren sind hier eindeutig.
- **Sicherheitsversprechen gegenüber dem Leser.** Inhalte sind immer extrahierbar; „Kopierschutz"
  erzeugt nur Ärger.

---

## 7. Was die Foren über den Markt sagen

- Der Markt ist **überschwemmt** von billigen PDF-Steckbriefen auf gleicher Bibliotheksbasis:
  „man kann hunderte identische Werkzeuge bauen, wenn man PDF.js und jsPDF nimmt" (r/pdf). Die
  Foren nehmen diese Welle ausdrücklich als „vibecoded" wahr und sehen nur bei echter Tiefe einen
  Nutzen.
- Deshalb ist **Tiefe statt Breite** die Strategie: die drei ungelösten Probleme besetzen, statt die
  fünfzehnte Seitenanordnungs-App zu bauen.
- **Preis und Lizenzform sind Kaufentscheidung.** Einmalzahlung oder kostenlos, ohne Abo — und der
  Umstieg muss die Kleinigkeiten im Arbeitsablauf mitnehmen (Tastenkürzel, Kommentararten,
  Mehrbenutzerbetrieb), sonst kehren Nutzer zurück.
- **Eine Lehre aus GOV.UK:** Verlage und Behörden wollten HTML, aber die Umsetzung hapert an
  Werkzeugen — „das Speichern als HTML könnte besser unterstützt werden und ist nicht das Einfachste
  der Welt", schreibt das Government Digital Service. Genau dort beginnt der Markt für hpro:
  nicht als Formatprediger, sondern als das fehlende Werkzeug für den Wechsel, der längst gewollt
  ist.

---

## 8. Grenzen dieser Erhebung (was ich nicht behaupte)

- Reddit wurde über die Abrufschnittstelle gelesen. Sie liefert **nur die angezeigten
  Top-Kommentare** — bei 20 Kommentaren also einen Ausschnitt, nicht die Debatte.
- Adobe UserVoice enthält 14.347 Ideen; die Seiten sind stark geskriptet und lieferten beim Abruf
  nur die obersten Einträge. Eine Auszählung der meistgewählten Ideen ist damit **nicht** belegt.
- Zwei ältere Grundsatzdebatten (2016 W3C, 2020 Hacker News) sind bewusst zitiert, weil sie die
  strukturellen Einwände enthalten, die bis heute gelten — sie sind aber **nicht** Belege für die
  Stimmung von 2026.
- Einzelmeinungen sind keine Mehrheiten. Ich schreibe daher nirgends „die Nutzer wollen X", sondern
  nenne die Quelle und die Anzahl der Kommentare.
- Zwei Threads (r/pdf „Looking for a PDF Editor/Viewer", r/software) lieferten über den Abruf kein
  Datum; beide wirken anhand des Inhalts (Abo-Ablösung, PDFgear) aktuell, **belegt ist der Stand
  nicht**.
- Nicht recherchiert: nicht-englischsprachige Foren außer deutschsprachigen Suchen (die ergaben
  nichts Brauchbares), Fachverbände außer der PDF Association, und die chinesischen/japanischen
  Märkte, die bei Dokumentstandards eine eigene Dynamik haben.

---

## Quellen

1. r/pdf – „What features are most important to you?", u/matsnorberg, 07.08.2026 – https://www.reddit.com/r/pdf/comments/1vhu62v/
2. r/pdf – „Can anyone tell me what is so lacking in free pdf apps…", u/wittor, 06.07.2026, 17 Kommentare – https://www.reddit.com/r/pdf/comments/1up95s5/
3. r/pdf – „Looking for a PDF Editor/Viewer with the below functions", Post 1t56tug – https://www.reddit.com/r/pdf/comments/1t56tug/
4. r/pdf – „Most free PDF editors fake text editing… honest breakdown", Post 1uuqe04 – https://www.reddit.com/r/pdf/comments/1uuqe04/
5. r/pdf – „What's the best alternative for Adobe Acrobat?", Post 1ugyrdh – https://www.reddit.com/r/pdf/comments/1ugyrdh/
6. r/Acrobat – „Why does every pdf editor besides acrobat pro fail at heavy duty tasks", u/Asleep-Hyena7401, 18.07.2026, 20 Kommentare – https://www.reddit.com/r/Acrobat/comments/1v099mx/
7. r/FuckAdobe – „I need Acrobat alternative", u/TheDeep3M9, 13.04.2026 – https://www.reddit.com/r/FuckAdobe/comments/1sk9y61/
8. r/software – „What alternatives for Acrobat Pro do you recommend?", Post 11wzngz – https://www.reddit.com/r/software/comments/11wzngz/
9. Adobe UserVoice – Acrobat for Windows and Mac, 14.347 Ideen, Stand 11.10.2026 – https://acrobat.uservoice.com/forums/590923-acrobat-for-windows-and-mac?filter=top
10. Adobe Community – Feature Requests – https://community.adobe.com/p/feature-requests
11. Hacker News – „Ask HN: Why are PDFs still heavily used?", 08.03.2023 – https://news.ycombinator.com/item?id=35072266
12. Hacker News – „PDF: Still unfit for human consumption, 20 years later", 10.08.2020 – https://news.ycombinator.com/item?id=24108950
13. User Experience Stack Exchange – „HTML vs. PDF — What are the Pros and Cons of PDF?", 20.04.2015 – https://ux.stackexchange.com/questions/76627/
14. W3C public-digipub-ig – „Re: Proposal: PDF alternative using HTML (ZIP/GZIP)", Februar 2016 – https://lists.w3.org/Archives/Public/public-digipub-ig/2016Feb/0011.html
15. W3C public-html – „Is HTML a final form medium like PDF?", März 2007 – https://lists.w3.org/Archives/Public/public-html/2007Mar/0312.html
16. GOV.UK Government Digital Service – „Why GOV.UK content should be published in HTML and not PDF", 16.07.2018, 58 Kommentare – https://gds.blog.gov.uk/2018/07/16/why-gov-uk-content-should-be-published-in-html-and-not-pdf/
17. PDF Association – „The only digital document format" – https://pdfa.org/the-only-digital-document-format
18. Karlen Communications – „PDF and the User Experience Survey Results 2015" – https://www.karlencommunications.com/adobe/PDF-AndTheUserExperience2015.pdf
19. GitHub – sumatrapdfreader/sumatrapdf, „Vote for features!", Discussion #2562 – https://github.com/sumatrapdfreader/sumatrapdf/discussions/2562
20. W3C – EPUB 3 Multiple Renditions / Web Publications (EPUB als HTML-Container) – https://www.w3.org/publishing/epub3/epub-multiple-renditions.html
