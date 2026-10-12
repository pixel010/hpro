# Prüfbericht S7 – Welche Fragen ein fremder Entwickler nach dem Lesen noch hätte

**Stand:** 12.10.2026 · **Gegenstand:** [`docs/spezifikation/04-umsetzer-handbuch.md`](../../spezifikation/04-umsetzer-handbuch.md)
(Teil 4) und [`05-autorenleitfaden.md`](../../spezifikation/05-autorenleitfaden.md) (Teil 5) im Stand vor diesem Bericht,
zusammen mit den normativen Teilen 0 bis 3.
**Verfahren:** Ein an der Erstellung unbeteiligter Prüfer (Claude-Agent mit frischem Kontext, Rolle: Entwickler mit
Java/.NET-Hintergrund, Auftrag: Exportfilter einer Textverarbeitung und einfaches Lesesystem bauen, keine Rückfragen
möglich) hat die beiden Handbücher vollständig und die Teile 0–3 zum Nachschlagen gelesen und ein Fragenprotokoll
abgegeben (38 Fragen, dazu eine Liste dessen, was klar genug war). Dazu kommen 8 Befunde, die beim Bau der Beispiele
selbst aufgefallen sind (Nr. 39–46). Jede Frage wurde einzeln entschieden, nach dem Muster von Teil 0, Abschnitt 17.3
Punkt 4d: entweder **im Handbuch beantwortet** (mit Anforderung), **im Kern behoben**, als **Änderungsantrag**
eingereicht oder als **offene Frage** mit Begründung stehen gelassen. „Der Entwickler hätte es wissen müssen“ kommt
nicht vor.

**Ergebnis in Zahlen:** 46 Punkte; 27 im Handbuch beantwortet, 2 im Kern behoben, 2 als Änderungsantrag eingereicht
(HPC-0003, HPC-0004), 14 bewusst offen (davon 9 Lücken der Spezifikation, die eine Entscheidung der Herausgeber
brauchen, 5 Angaben, die ein Werkzeug selbst festlegt), 1 erledigt durch den Abschluss des Laufs. Die Zahl der
offenen Spezifikationslücken ist das Maß der Dokumentationsqualität; sie geht als Rückmeldung an die Pakete S1/S2.

## Fragenprotokoll des fremden Entwicklers

| Nr. | Fundstelle | Frage (gekürzt) | Entscheidung | Wo |
|---|---|---|---|---|
| 1 | T4 2.1, 8.3; HP-CONT-014 | Welche Eintragsreihenfolge ist verlangt? Der Text widersprach sich („feste Reihenfolge“ / „nicht vorgeschrieben“). | **beantwortet:** nur `mimetype` zuerst ist Muss; Rest frei, deterministisch SOLL; Reihenfolge des Kerns genannt | T4 2.1 |
| 2 | T4 2.1; HP-CONT-014, HPR-CONT-025 | DOS-Zeitstempel in UTC? Extra-Felder in allen Einträgen verboten? | **beantwortet:** UTC-Felder ohne Umrechnung; Extra-Feld nur bei `mimetype` leer; Hinweis auf Java/.NET-Schreiber | T4 2.1 |
| 3 | T4 2.3; HP-META-004 | Ist `accessibility` Pflicht, welche Werte sind ehrlich, Spiegelung in OPF? | **beantwortet:** Metadaten Soll, `conformsTo` ohne Bericht verboten, nur Bekanntes schreiben, OPF-Spiegelung kommagetrennt. Die Überschrift von HP-META-004 sagt „Muss“, der Text „SOLLEN“ für die Metadaten: **offen (Spezifikation)**, Rückmeldung an S1 | T4 2.3 |
| 4 | T4 4.3; HP-NEST-005 vs HP-MIN-002 | Wie erfüllt ein Mindestprofil-Dokument über 2 000 Wörter den Überblick, wenn `data-hp-role` außerhalb des Elementbestands liegt? | **offen (Spezifikation):** Soll-Anforderung ist im Mindestprofil nicht erfüllbar; Vorschlag: `data-hp-role` in 15.1 aufnehmen oder HP-NEST-005 für `subset` aussetzen | T5 4.7 |
| 5 | T4 8.2, 10.3; HP-PROF-013 vs HP-MIN-002 | Darf ein Mindestprofil-Dokument signiert werden, und woher kommt der Signaturhinweis? | **offen (Spezifikation):** Signieren ist zulässig, der Hinweis verletzt den Elementbestand; Bearbeiter nimmt HPR-PROF-016 hin; Vorschlag wie Nr. 4 | T5 4.7 |
| 6 | T5 2.2, 4.3; HP-MIN-002 | Was wird aus `hr`, Unter-/Durchstreichung, Definitionslisten, `tfoot`, verschachtelten Tabellen, Nummerierungsart? | **beantwortet:** Zuordnung je Baustein mit Meldung, alles andere verlässt das Mindestprofil | T5 4.7 |
| 7 | T5 4.1, 3.2 vs `s7-bericht` | Verschachtelte `section`s für Unterüberschriften oder flach? | **beantwortet:** beides konform; Nav muss nur die oberste Ebene nennen; Konverter bleibt flach | T5 4.7 |
| 8 | T5 3.3; HP-MIN-004, HP-PRINT-004 | Welche der zwei Kennungen ist „die“ Adresse; wohin gehört eine Textmarke mitten im Absatz? | **beantwortet:** `section` für Nav und Zitate, Überschrift im Ausdruck; Textmarke im Absatz → `span` mit `id` | T4 4.1, T5 4.7 |
| 9 | T5 4.1, 4.4 | Ist der Slug-Algorithmus festgelegt? | **offen (Werkzeug):** Spezifikation verlangt Wiederholbarkeit je Werkzeug; Algorithmus des Konverters dokumentiert | T5 4.7 |
| 10 | T5 4.1 Schritt 1; HP-ADR-004, HP-RS-007 | Woraus wird die `id` abgeleitet, wenn DOCX/ODF keine Kennung tragen? | **beantwortet (mit Empfehlung):** Dokumenteigenschaft `html-pro:id`, sonst UUIDv5 über die Quelle; Rückschreiben empfohlen. **Offen (Spezifikation):** keine Vorgabe für Quellformate | T5 4.7 |
| 11 | T5 2.1, 4.3; HP-META-005 | Bedeutet `source.date` Quelldatum oder Konvertierungszeit; darf `dateModified` vom Quelldatum stammen? | **beantwortet:** beide aus dem Quelldatum (sonst kein Determinismus). **Offen (Spezifikation):** Bedeutung von `source.date` nicht festgelegt | T5 4.7 |
| 12 | T5 4.3; HP-MIN-009 vs HPR-MIN-010 | Sind `mailto:`/`tel:` im Mindestprofil verboten, obwohl Teil 0 nur „absolute URL“ sagt? | **offen (Spezifikation):** Widerspruch Teil 0 („absolute URL“) gegen Teil 1 („http/https“); bis zur Klärung Text mit Meldung; Erratum empfohlen | T5 4.7 |
| 13 | T5 4.1 Schritt 5; HP-MIN-008 | Wo steht das `aside` bei Fußnoten in Tabelle, Liste, Überschrift? | **beantwortet:** nach dem umschließenden Block oder am Abschnittsende; beides erlaubt | T5 4.7 |
| 14 | T5 4.5; HP-MIN-006 | Tabellen mit ungleicher Zellenzahl; nur fette erste Zeile? | **beantwortet:** leere `td` ergänzen und melden; kein `thead` aus Aussehen | T5 4.7 |
| 15 | T5 4.3; HP-MIN-007 | Abbruch wegen eines WMF-ClipArts? Pixelmaße? | **beantwortet:** Abbruch ist die konforme Vorgabe, Auslassen nur mit Meldung. **Offen (Spezifikation):** Pixelmaße nicht festgelegt | T5 4.7 |
| 16 | T5 2.2, 4.1; HP-META-005 | Ausgangsdatei standardmäßig einbetten trotz Kommentaren und Größe? | **beantwortet:** Soll, abwählbar, Meldung, Verweis auf HP-META-007 | T5 4.7 |
| 17 | T5 4.3 | Welcher Textstand bei Änderungsverfolgung; Kommentare? | **beantwortet (Annahme des Konverters):** angenommene Änderungen, Kommentare entfallen. **Offen (Spezifikation):** nicht festgelegt | T5 4.7 |
| 18 | T5 3/4 | Inhaltsverzeichnisfelder, Kopf-/Fußzeilen, Seitenumbrüche? | **beantwortet:** Verzeichnisfelder entfallen (Nav ersetzt sie, Seitenzahlen wären Fehler); Kopf-/Fußzeilentext einmal übernehmen und melden; Umbrüche entfallen | T5 4.7 |
| 19 | T0 §15.2; T5 3.4 | OOXML-Vorlagen am `styleId` oder am lokalisierten Namen erkennen? | **beantwortet (Empfehlung):** `styleId` über `basedOn`; `data-hp-style` = `w:name`. **Offen (Spezifikation):** 15.2 nennt nur Anzeigenamen | T5 4.7 |
| 20 | T5 3.2; HP-MIN-008 | Darf der Filter in mehrere Inhaltsdokumente teilen; wohin Noten und Verweise? | **beantwortet:** ja; Fußnoten im Dokument des Verweises, Endnoten im letzten, Verweise mit Pfad | T5 4.7 |
| 21 | T5 2.2, T0 §15.2; HP-INH-004 | Dürfen CSS-Klassen aus direkter Formatierung feste Größen und Farben setzen? | **beantwortet:** nur relative Werte, Fett, Kursiv, Ausrichtung | T5 4.7 |
| 22 | T4 2.3, 10.1; HP-META-001 | Muss ein Leser die W3C-Kurzformen des Manifests annehmen? | **beantwortet:** Formen sind fest; Toleranz erlaubt, nicht verlangt | T4 2.3 |
| 23 | T4 4.2, 10.1; HP-CONT-004 | Wie findet ein Leser das Navigationsdokument, wenn `manifest.json` es nicht nennt? | **beantwortet:** `item` mit `properties="nav"` in `package.opf` oder Suche nach `nav epub:type="toc"`. **Offen (Spezifikation):** ein Manifestschlüssel für das Navigationsdokument fehlt; Vorschlag für S1 | T4 2.3 |
| 24 | T4 10.1; HP-CONT-009, HP-CONT-013 | Fehlerverhalten bei EPUB ohne Manifest, `missing`, Hash-Fehler in OPF/Nav? | **beantwortet:** Ablehnung nur ohne Manifest/mimetype oder bei fatalen Strukturfehlern; sonst Anzeige mit Kennzeichnung | T4 10.1 |
| 25 | T4 2.4; HP-CONT-012 | Ist der Abbruch über den Grenzen Pflicht; gepackte oder entpackte Bytes? | **beantwortet:** Soll, entpackte Bytes; Handbuchtext korrigiert | T4 2.4 |
| 26 | T4 6.4; HP-SBX-005/006 | `blob:`-URLs lösen relative Verweise nicht auf; `csp`-Attribut gibt es nicht mehr | **beantwortet (Handbuch korrigiert):** eigene Scheme-Origin mit CSP-Antwortkopf; `sandbox=""` bei `static` | T4 6.4 |
| 27 | T4 6.3/6.4; HP-SBX-008 | Darf ein Lesesystem ohne Schreibweg Stufe Lebendig beanspruchen? | **beantwortet:** nein; mit statischen Äquivalenten nur Basis und Signiert | T4 6.4 |
| 28 | T4 8.2/8.5; HP-SIG-015, HP-RS-001/008 | Woher Vertrauensanker; ist OCSP/CRL eine Übertragung von Dokumentdaten? | **beantwortet:** Sperrabfrage überträgt keine Dokumentdaten; offline muss das Öffnen funktionieren. **Offen (Spezifikation):** Herkunft der Anker nicht festgelegt | T4 8.2 |
| 29 | T4 8.2/8.3; HP-SIG-005/008 | Welche Verfahren muss der Leser prüfen; Prozentkodierung der URIs? | **beantwortet:** alle Verfahren aus HP-SIG-008; URIs je Segment UTF-8-prozentkodiert, dekodiert verglichen | T4 8.2 |
| 30 | T4 10.1; HPR-SIG-022 | Signaturen aus `signatures2.xml` vollwertig prüfen; Zuordnung? | **beantwortet:** vollwertig, je `ds:Signature`, mit Kennzeichnung | T4 8.2 |
| 31 | T4 7, 10.2; HP-LOCK-003, HP-PRINT-003 | Sind die deutschen Hinweistexte wörtlich vorgeschrieben oder übersetzbar? | **offen (Spezifikation):** nicht festgelegt; Vorschlag: Struktur und Kennung normativ, Sprache frei | T4 7 |
| 32 | T4 3.2, 4.3; HP-INH-010, HP-NEST-002 | Pixelgrenzen für „schmal“/„mittel“; Markup für `priority` und `stack`? | **beantwortet** für Markup (`th`/`col` mit `data-hp-priority` und `id`, `stack` als Karten). **Offen (Spezifikation):** Pixelgrenzen nicht festgelegt | T4 4.3 |
| 33 | T4 10.2; HP-PRINT-003/005/012 | Polyfill für Margin Boxes erlaubt; PDF/A-Prüfung auch ohne PDF-Export? | **beantwortet:** Verfahren frei; PDF/A-Prüfung nur beim PDF-Export | T4 10.2 |
| 34 | T4 7; HP-LOCK-001/005 | Wie wirkt eine Sperre mit Pfad als Ziel? | **beantwortet:** ganze Datei, Hinweis nennt den Pfad | T4 7 |
| 35 | T4 4.3; HP-NEST-003, HP-RS-008 | Ist das Öffnen eines Anhangs im Systemprogramm eine Dienstübertragung; Rekursionstiefe? | **beantwortet:** kein Dienst, aber Rückfrage wie bei externen Links; Tiefe nicht festgelegt (**offen, Werkzeug**) | T4 4.3 |
| 36 | T4 4.1; HP-ADR-003 | Kodierung von `!`/`#` in der Langform; Auflösung für fremde Dokumente? | **beantwortet:** Trennung am letzten `!/`, `urn:uuid:` vermeidet Sonderzeichen; Auflösung nur für das geöffnete Dokument. **Offen (Spezifikation):** Kodierung für andere `id`-Formen | T4 4.1 |
| 37 | T4 2.3 | Serialisierung mehrelementiger `accessModeSufficient`-Listen in `package.opf`? | **beantwortet:** kommagetrennt je innerer Liste (so schreibt der Kern) | T4 2.3 |
| 38 | T4 Kopf, 8.1, 12 | Belegdateien 04–09, README und Prüfbericht fehlten zum Zeitpunkt des Lesens | **erledigt:** der Prüfer las während des laufenden Belege-Laufs; alle Dateien liegen jetzt vor, `npm run hb:check` prüft jeden Befehlsblock gegen sie | dieses Verzeichnis |

## Befunde beim Bau der Beispiele (Nr. 39–46)

| Nr. | Fundstelle | Befund | Entscheidung | Wo |
|---|---|---|---|---|
| 39 | HP-CONT-004, HPR-CONT-009 vs HP-CONT-017 | Dokumente eingefrorener Fassungen stehen nicht im Spine; jeder interne Verweis darin ist EPUB-ungültig (`RSC-011`). Mit `linear="no"` besteht epubcheck, der Prüfer meldet HPR-CONT-009 | **Änderungsantrag [HPC-0003](../../spezifikation/aenderungen/HPC-0003.md)** (Frist 09.11.2026); bis dahin im Handbuch als bekannter Widerspruch | T4 5.2, 12; [03-pruefer.txt](03-pruefer.txt) |
| 40 | Teil 1 §8.1 vs HPR-SBX-016 | `window.parent.postMessage` nach dem Wortlaut von §8.1 ist ein Prüferfehler; nur `parent.postMessage` besteht | **Änderungsantrag [HPC-0004](../../spezifikation/aenderungen/HPC-0004.md)** (Frist 26.10.2026); Beispielkomponente nutzt die bestehende Schreibweise | T4 6.3; [03-pruefer.txt](03-pruefer.txt) |
| 41 | HP-RS-011 vs HP-CONT-008, HP-SIG-005 | Eine nach der Signatur ergänzte Anmerkung lässt die Signatur gültig, verletzt aber HPR-CONT-017/HPR-CONT-008 (nicht gelistet); ein Nachtrag in `resources`/`package.opf` bräche die Signatur über `manifest.json` | **offen (Spezifikation):** Vorschlag: `annotations/` von der Abdeckungsregel HP-CONT-008 und von HP-CONT-004 ausnehmen und im Hash-Manifest nur als „unsigniert“ führen; Entscheidung der Herausgeber | T4 8.5; [07-manipulation.txt](07-manipulation.txt) |
| 42 | HP-MIN-007 | Fehlt der Alternativtext und ist das Bild nicht dekorativ, verlangt die Anforderung eine Meldung, sagt aber nicht, welcher `alt`-Wert zu schreiben ist | **offen (Spezifikation):** Konverter schreibt Beschriftung oder Rahmenname und fordert zum Nachtragen auf | T5 4.6 |
| 43 | Teil 2 §8.3 vs HPG-NS-004 | Kennung `example` ist „für Beispiele in Dokumentation reserviert“, darf aber in Dokumenten nicht als `x-example-` vorkommen | **offen (Spezifikation):** Beispiele nutzen die fiktive Kennung `baubuero`; Klärung an S4 | T4 12 |
| 44 | `kern/src/manifest.ts`, HPR-META-008 | Der Kern schrieb `accessModeSufficient` als Liste von Strings; der Prüfer verlangt eine Liste von Listen | **im Kern behoben:** `manifestAccessibility()` wandelt die OPF-Form in die Manifestform; 291 Kern-Tests grün | [`kern/src/manifest.ts`](../../../kern/src/manifest.ts) |
| 45 | `kern/src/ocf.ts`, HP-ADR-001 | Die Überschrift des generierten Navigationsdokuments trug keine Kennung; jeder mit dem Kern gebaute Container verletzte HPR-ADR-001 | **im Kern behoben:** `h1 id="toc-h"` | [`kern/src/ocf.ts`](../../../kern/src/ocf.ts) |
| 46 | HP-ADR-007, HPR-ADR-005 für eingefrorene Fassungen | Eine Fassung ohne eigenes Navigationsdokument verletzt HPR-ADR-005; ein eigenes Navigationsdokument der Fassung erzeugt zwei nicht im Spine stehende Dokumente mit Verweisen (Nr. 39) | **beantwortet (Umgehung):** das Inhaltsverzeichnis steht als `nav epub:type="toc"` im einzigen Inhaltsdokument der Fassung; mit HPC-0003 entfällt die Umgehung | T4 5.2 |

## Was dem Prüfer klar genug war (unverändert übernommen)

Containerschicht (Methoden, `mimetype`, `container.xml`, Pfadregeln), `manifest.json` mit Hash-Manifest und
Fehlerwörtern, `package.opf` (Manifestmenge, Spine, `nav`, Eigenschaften, epubcheck-Pflicht), XHTML-Regeln,
Stylesheet-Muster mit `--hp-*`, Zuordnungstabelle 15.2 für ODF samt Prüfermeldungen, Sandbox-Attribute, CSP, Datenkanal
mit Fehlercodes und Grenzen, Signaturform einschließlich Fassungszuordnung und Anzeige-Tabelle, Druckanforderungen als
Liste, Rückgabecodes und „unbestimmt“ bei `hpro-check`.

## Rückmeldungen an die Spezifikation (Sammlung für S1/S2/S4)

1. HP-META-004: Grad in der Überschrift („Muss“) und im Text („SOLLEN“ für die Metadaten) angleichen (Nr. 3).
2. Mindestprofil: `data-hp-role` (`summary`, `signature-notice`) in 15.1 aufnehmen oder HP-NEST-005/HP-PROF-013 für
   `subset` aussetzen (Nr. 4, 5).
3. HP-MIN-009 gegen HPR-MIN-010: „absolute URL“ oder nur `http(s)` (Nr. 12).
4. HP-META-005: Bedeutung von `source.date` festlegen (Nr. 11).
5. Navigationsdokument im `manifest.json` benennen, damit ein Leser ohne OPF-Parser auskommt (Nr. 23).
6. HP-NEST-002/HP-INH-010: Pixelgrenzen für „schmal“ und „mittel“ (Nr. 32).
7. Hinweistexte: Sprache freigeben, Struktur normieren (Nr. 31).
8. HP-ADR-003: Kodierung der Langform für `id`-Werte mit `!` oder `#` (Nr. 36).
9. Anmerkungen nach der Signatur: HP-RS-011 gegen HP-CONT-008 (Nr. 41).
10. HP-MIN-007: `alt`-Wert bei fehlendem Alternativtext (Nr. 42).
11. Teil 2 §8.3: Zweck der reservierten Kennung `example` (Nr. 43).
12. HPC-0003 und HPC-0004 (Nr. 39, 40).
