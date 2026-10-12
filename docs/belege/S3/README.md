# Belege S3 – Konformitätsprüfer und Testsuite zum Standard

**Stand:** 12.10.2026 · **Erzeugt mit:** [`scripts/belege-s3.sh`](../../../scripts/belege-s3.sh)
(wörtliche Ausgaben mit Exit-Code; Lauf 2026-10-12T00:42Z bis 01:40Z, Commit-Basis 875b1ea plus die Änderungen dieses Commits)
**Gegenstand:** Prüfer im Kern [`kern/src/check/`](../../../kern/src/check/), Kommandozeile
[`kern/bin/hpro-check.ts`](../../../kern/bin/hpro-check.ts) (`npm run hpro-check`), Testsuite
[`testsuite/`](../../../testsuite/) (erzeugt von [`scripts/s3-testsuite.mjs`](../../../scripts/s3-testsuite.mjs),
ausgeführt von [`scripts/s3-testsuite-lauf.mjs`](../../../scripts/s3-testsuite-lauf.mjs) und in `npm test`
von [`kern/test/conformance.test.ts`](../../../kern/test/conformance.test.ts))
**Prüfgrundlage:** [Teil 1](../../spezifikation/01-konformitaet.md) mit
[`01-regelkatalog.json`](../../spezifikation/01-regelkatalog.json) (156 Dokumentregeln) und
[`schema/konformitaetsbericht.schema.json`](../../spezifikation/schema/konformitaetsbericht.schema.json)

Werkzeuge ([00-werkzeuge.txt](00-werkzeuge.txt)): Node 26.5.1, Temurin JDK 21.0.12.1+1,
epubcheck 5.4.0, EU DSS 6.5 über [`prototyp/dss`](../../../prototyp/dss/) (nur Gegenprobe).

## Abnahmekriterien

| # | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| 1 | `npm run hpro-check <datei>` prüft gegen den Katalog und gibt Regeln, Schweregrad und Ort aus | **erfüllt:** je Befund eine Zeile `<KLASSE> <Regel> [<Fassung>] <Ort>: <Meldung>` nach Teil 1, 4.4 (z. B. `FEHLER HPR-INH-008 content/index.xhtml:27: …`), Orte als `pfad:zeile`, `manifest.json#/pointer`, `signatur=<Id>`, `(Container)`; Meldung aus der Vorlage des Katalogs; Rückgabecodes 0/1/2/3 nach 4.5 an echten Aufrufen belegt (1 nicht bestanden, 3 unbestimmt, 2 bei fehlendem Argument und fehlender Datei) | [03-kommandozeile.txt](03-kommandozeile.txt) |
| 2 | Testsuite deckt mindestens 15 Regeln mit Gut- und Schlechtfällen ab | **erfüllt:** 180 Fälle (33 gut, 147 schlecht), **180 von 180 wie erwartet**; **141 Regeln** mit Gut- und Schlechtfall (Bereiche: CONT 25, INH 21, SIG 18, SBX 15, PROF 14, META 11, MIN 10, ADR 7, LOCK 6, VERS 6, NEST 5, PRINT 3), 2 nur mit Schlechtfall, 13 ohne Fall (Gründe unten). Verglichen wird je Fall die exakte Menge der Regeln mit Befund, das Urteil je Stufe, dass jede Zielregel gelaufen ist, und die Schemagültigkeit des Berichts | [02-testsuite-lauf.txt](02-testsuite-lauf.txt), [02-testsuite-lauf.json](02-testsuite-lauf.json), [01-testsuite-erzeugen.txt](01-testsuite-erzeugen.txt), [08-npm-test.txt](08-npm-test.txt) |
| 3 | Ein Dokument des Prototyps wird gegen den Katalog geprüft, Bericht abgelegt | **erfüllt:** drei Container aus Phase 2 (`prototyp/ergebnisse/container/`, mit DSS signiert, [docs/05](../../05-prototyp-ergebnisse.md)) und der Beispielcontainer des Kerns (P1), je mit EPUB-Validator; Berichte als JSON und Text. Ergebnis siehe unten: keines besteht die Stufe Basis | [04-prototyp.txt](04-prototyp.txt), [prototyp/](prototyp/) |
| 4 | Ausgabe maschinenlesbar (JSON) und menschenlesbar (Text) | **erfüllt:** Text auf stdout (Standard), JSON mit `--format json` auf stdout oder mit `--json <pfad>` in eine Datei; jeder Bericht wird vor der Ausgabe gegen das Berichtsschema aus S2 geprüft (`Berichtsschema: gültig`, sonst Rückgabe 2) | [03-kommandozeile.txt](03-kommandozeile.txt), [berichte/](berichte/), [prototyp/](prototyp/) |

## Dateien

| Datei | Inhalt |
|---|---|
| [00-werkzeuge.txt](00-werkzeuge.txt) | Versionen, Umfang des Codes |
| [01-testsuite-erzeugen.txt](01-testsuite-erzeugen.txt) | Erzeugen der 180 Dokumente, SHA-256 je Dokument |
| [02-testsuite-lauf.txt](02-testsuite-lauf.txt), [.json](02-testsuite-lauf.json) | Lauf der Testsuite: je Fall Befunde, Urteil, Abweichungen; Abdeckung |
| [03-kommandozeile.txt](03-kommandozeile.txt) | `npm run hpro-check` mit Text- und JSON-Ausgabe, Rückgabecodes |
| [04-prototyp.txt](04-prototyp.txt), [prototyp/](prototyp/) | Prototyp-Dokumente gegen den Katalog (Text und JSON je Dokument) |
| [05-epubcheck.txt](05-epubcheck.txt) | epubcheck 5.4.0 über alle 33 Gutfälle, über `hpro-check` eingebunden |
| [06-dss-vergleich.txt](06-dss-vergleich.txt), [.json](06-dss-vergleich.json) | Gegenprobe der Signatururteile mit EU DSS 6.5 |
| [07-messung.txt](07-messung.txt) | Prüfdauer je Dokument und für die Kommandozeile |
| [08-npm-test.txt](08-npm-test.txt) | `npm ci && npm test` |

## Prototyp-Dokumente gegen den Katalog (Kriterium 3)

| Dokument | Urteil | Regeln mit Befund |
|---|---|---|
| `basis.epub` (Phase 2) | Basis nicht bestanden (6 Fehler, 10 Warnungen) | ADR-001, ADR-005, INH-005, META-007; Warnungen INH-014, INH-024, META-008 |
| `zielformat-2sig.epub` (Phase 2, zwei DSS-Signaturen) | Basis und Signiert nicht bestanden (20 Fehler, 14 Warnungen) | zusätzlich SIG-007, SIG-008, SIG-011; Warnungen SIG-012, CONT-025, PROF-016 |
| `hybrid-manipuliert.epub` (Phase 2, nach dem Signieren geändert) | Basis und Signiert nicht bestanden (18 Fehler, 13 Warnungen) | darunter **CONT-016** (Hash) und **SIG-015** `TOTAL_FAILED/HASH_FAILURE` |
| `kern-beispiel.hpro` (`hpro sample`, P1) | Basis nicht bestanden (7 Fehler, 9 Warnungen) | ADR-001, ADR-005, INH-005; Warnungen INH-014, INH-024, META-008 |

Das ist ein Befund, kein Fehler des Prüfers: die Dokumente sind älter als der Regelkatalog aus S2.
Sie haben Abschnitte ohne `id` (stabile Adressen, Zusage 3), setzen die Lesesystem-Variablen
`--hp-font-size`/`--hp-line-height` im eigenen CSS (Bildschirm zuerst, Zusage 1), behaupten
WCAG-Konformität ohne Bericht und tragen DSS-Signaturen mit `application/octet-stream` statt der
Media-Types (SIG-008/011). Die Manipulation in `hybrid-manipuliert.epub` erkennt der Prüfer wie
DSS in P2. epubcheck lief bei allen vier und meldete nichts (HPR-CONT-024/028 ohne Befund).

## Testsuite (Kriterium 2)

Jeder Fall in [`testsuite/faelle.json`](../../../testsuite/faelle.json) nennt Zielregeln, die exakt
erwartete Menge der Regeln mit Befund und das erwartete Urteil je Stufe. Ein Gutfall gilt nur,
wenn die Zielregel gelaufen ist und keinen Befund hat; ein Schlechtfall, wenn sie einen Befund hat.
„Nicht geprüft“ ist nur mit einem der erlaubten Gründe aus `fehlendeMittel` zulässig. Gutfälle
enden meist mit Urteil `unbestimmt`, weil drei Regeln eine Browser-Engine brauchen
(HPR-INH-004/006/022) — der Prüfer meldet das ehrlich, statt `bestanden` zu behaupten.

Regeln ohne Gut- und Schlechtfall und warum:

| Regel | Grund |
|---|---|
| HPR-INH-004, -006, -022, HPR-SBX-010, -012, -015 | Mittel `rendering`: keine Browser-Engine im Prüfer; stehen im Bericht als „nicht geprüft“ |
| HPR-CONT-024, -028 | Mittel `extern` (EPUB-Validator): eigener Beleg [05-epubcheck.txt](05-epubcheck.txt) statt Testsuite |
| HPR-SIG-012, -014, HPR-PROF-008, HPR-SIG-013 | brauchen Signaturzeitstempel bzw. LT/LTA-Niveau; der Kern signiert nur XAdES-BASELINE-B, ein Zeitstempeldienst ist nicht angebunden (Netzwerk). SIG-012 tritt in 35 Fällen (29 schlecht, 6 gut) als erwartete Warnung auf, ist aber nirgends Zielregel; PROF-008 und SIG-013 haben einen Schlechtfall |
| HPR-SIG-020 | Mittel `extern` (PDF/A-Validator, z. B. veraPDF): nicht vorhanden |
| HPR-PROF-007 | Mittel `manuell`: der Prüfer listet externe Verweise, ein Mensch beurteilt sie |
| HPR-CONT-026 | Grenzwerte (10 000 Einträge, 256 MiB, 1 GiB): kein Testdokument dieser Größe im Repository |

## epubcheck an den Gutfällen und Rückmeldungen an die Spezifikation

Teil 0 verlangt ein gültiges EPUB-3-Package ([HP-CONT-004](../../spezifikation/00-spezifikation.md#hp-cont-004--muss--basis)).
Der Lauf mit epubcheck über alle Gutfälle hat in diesem Paket sieben Gutfälle aufgedeckt, die
epubcheck ablehnte, mit sechs Ursachen. Vier waren Fehler der Testsuite, eine ist eine Fehlmeldung
von epubcheck; diese fünf sind umgangen bzw. behoben. Die sechste ist ein Widerspruch in der
Spezifikation:

| epubcheck | Ursache | Maßnahme |
|---|---|---|
| OPF-014 (`gut-inh-023-mathml`) | Generator setzte die OPF-Eigenschaft `mathml` nicht | Generator setzt `mathml` und `svg` |
| RSC-011 (`gut-adr-006-svg-fragment`) | Verweis in eine SVG-Datei: `readingOrder` enthält nur XHTML (HPR-META-004), der Spine gleicht ihr (HPR-CONT-009), EPUB erlaubt Verweise nur auf Spine-Einträge. **Ein Verweis auf eine SVG-Datei ist in hpro also nie EPUB-gültig** | Gutfall verweist jetzt auf eine Kennung in eingebettetem SVG |
| RSC-012 (`gut-sbx-013-formel`) | Wertverweis `#positionen.C4` nach HP-ADR-008 ohne Element mit dieser `id` | Zielzelle trägt `id="positionen.C4"` |
| RSC-032 (`gut-inh-019-audio`) | `audio/ogg` ist für EPUB 3.3 kein Kernmedientyp (nur `audio/ogg; codecs=opus`), HP-CONT-015 nennt es aber als Kerntyp | Gutfall nutzt MP3 (`audio/mpeg`) |
| OPF-015 (`gut-fassungen`, `-hauptfassung-bearbeitet`) | **epubcheck 5.4.0 zählt `<script type="module">` nicht als Skript** und meldet die Eigenschaft `scripted` als überflüssig. Belegt mit zwei Varianten desselben Dokuments: `type="module"` → OPF-015, `type="text/javascript"` → keine Meldung | Komponente als klassisches Skript (`<script src>`, Teil 0 verlangt nichts anderes) |
| RSC-011 (`gut-fassungen`, `gut-fassungen-hauptfassung-bearbeitet`, `gut-prof-015-verlauf`) | **Widerspruch in der Spezifikation:** Dateien eingefrorener Fassungen stehen nicht im Spine (HPR-CONT-009 vergleicht den Spine mit der `readingOrder` der Hauptfassung); Verweise zwischen ihren Dokumenten und ihr Inhaltsverzeichnis sind deshalb EPUB-ungültig | **offen**, siehe Vorschläge |

Rückmeldungen an Teil 0/1/3 (nicht in diesem Paket umgesetzt, weil sie normativ sind):

1. **Eingefrorene Fassungen im Spine:** HP-CONT-004/HPR-CONT-009 sollten Spine-Einträge mit
   `linear="no"` für die Inhaltsdokumente unter `renditions/<id>/` nach den Einträgen der
   `readingOrder` zulassen und nur die linearen Einträge vergleichen. Bis dahin meldet der Prüfer
   mit epubcheck bei jedem Dokument mit eingefrorener Fassung HPR-CONT-024; die Testsuite prüft
   diese drei Gutfälle gegen den Katalog ohne EPUB-Validator.
2. **Wertverweise (HP-ADR-008, Teil 3):** die Zielzelle eines `a[data-hp-ref="value"]` sollte die
   Zelladresse als `id` tragen müssen (`<td id="kosten.E4">`), sonst ist jedes Dokument mit
   Wertverweis EPUB-ungültig (RSC-012). Das Beispiel in Teil 3, Abschnitt 2 hat diese `id` nicht.
3. **`audio/ogg` (HP-CONT-015):** als `audio/ogg; codecs=opus` schreiben oder streichen; der
   Media-Type in `manifest.json` lässt heute keine Parameter zu (Muster `type/subtype` in HPR-CONT-015).
4. **Verweise auf SVG-Dateien (HP-ADR-006):** im Autorenleitfaden (S7) festhalten, dass Verweise
   nur auf Inhaltsdokumente der `readingOrder` zeigen dürfen.
5. **Hinweis für S7/P-Pakete:** Komponenten als klassisches Skript einbinden, solange epubcheck
   `type="module"` nicht erkennt.

## Gegenprobe Signatur mit DSS

An allen 35 signierten Dokumenten der Testsuite vergleicht
[`scripts/s3-dss-vergleich.mjs`](../../../scripts/s3-dss-vergleich.mjs) die Hauptindikation je Signatur
des Prüfers (HPR-SIG-015 = `TOTAL_FAILED`, HPR-SIG-016 = `INDETERMINATE`, kein Befund =
`TOTAL_PASSED`) mit EU DSS 6.5 (Richtlinie aus P3): **33 von 35 gleich, 2 erklärte, 0 unerklärte
Abweichungen** ([06-dss-vergleich.txt](06-dss-vergleich.txt)). Die beiden Abweichungen lehnen
beide Seiten ab, nur mit anderer Indikation: `schlecht-sig-011-odf-manifest` (DSS verlangt
`META-INF/manifest.xml` schon in der Formatprüfung, der Prüfer meldet es als HPR-SIG-011) und
`schlecht-sig-002-ohne-xades` (DSS findet ohne `SigningCertificateV2` kein Signaturzertifikat, der
Prüfer meldet `FORMAT_FAILURE`). Stufe Signiert ist in beiden Fällen `nicht bestanden`.

## Messungen

Rechner mit 4 Kernen, während des Laufs durch andere Prozesse ausgelastet (Lastmittel 7–9,
gemessen mit `uptime`); die Zeiten sind deshalb obere Werte ([07-messung.txt](07-messung.txt)).

| Messung | Ergebnis |
|---|---|
| `checkConformance` je Dokument, 180 Dokumente (19 B – 12,7 kB) | Median 27 ms, 90 %-Quantil 56 ms, Maximum 251 ms, Summe 6,0 s |
| `hpro-check` ohne epubcheck (Node-Start, Katalog, Prüfung, Schemaprüfung), 15 Läufe | 1 423 – 1 946 ms |
| `hpro-check` mit epubcheck 5.4.0 (JVM-Start eingeschlossen), 2 Läufe | 52 308 und 53 905 ms |
| `npm ci && npm test` | 291 Tests, 291 bestanden, 0 fehlgeschlagen; Spezifikations-, Konformitäts-, Formel- und Governance-Prüfer mit Selbsttests OK ([08-npm-test.txt](08-npm-test.txt)) |

## Was nicht geprüft wurde

- **Regeln mit Mittel `rendering`** (HPR-INH-004/006/022, HPR-SBX-010/012/015): keine
  Browser-Engine angebunden; sie erscheinen in jedem Bericht als „nicht geprüft“ und halten das
  Urteil auf `unbestimmt`.
- **HPR-SIG-020** (Referenz-PDF als PDF/A): kein PDF/A-Validator vorhanden.
- **Signaturen mit Zeitstempel und LT/LTA** als Gutfall: der Kern erzeugt nur Baseline-B, kein
  Zeitstempeldienst ohne Netzwerk.
- **Lesesystemregeln (`HPL-…`)**: nicht Gegenstand des Prüfers (er prüft Dateien, nicht Lesesysteme).
- Der Prüfer läuft nur mit Web-Standard-APIs, **ausgeführt** wurde er nur unter Node 26.5.1; im
  Browser **nicht geprüft**.
