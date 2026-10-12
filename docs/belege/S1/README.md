# Belege S1 – Spezifikation hpro 0.1 (normativ)

**Stand:** 11.10.2026 · **Erzeugt mit:** [`scripts/belege-s1.sh`](../../../scripts/belege-s1.sh)
(wörtliche Ausgaben mit Exit-Code; Lauf 2026-10-11T13:09Z, ca. 2 Minuten inkl. `npm ci && npm test`)
**Gegenstand:** [`docs/spezifikation/00-spezifikation.md`](../../spezifikation/00-spezifikation.md)
**Prüfer:** [`scripts/check-spec.mjs`](../../../scripts/check-spec.mjs) (läuft in `npm test`),
Selbsttest [`scripts/check-spec-selftest.mjs`](../../../scripts/check-spec-selftest.mjs)

Werkzeuge ([00-werkzeuge.txt](00-werkzeuge.txt)): Node 26.5.1, Python 3.13.5, Temurin JDK 21.0.12.1+1,
epubcheck 5.4.0, EU DSS 6.5 über [`prototyp/dss`](../../../prototyp/dss/) (nur als Gegenprobe).

## Abnahmekriterien

| # | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| 1 | `docs/spezifikation/00-spezifikation.md` liegt vor, mit nummerierten normativen Anforderungen (Muss/Soll/Kann) je Abschnitt | **erfüllt:** 148 Anforderungen in 12 Bereichen (CONT 17, INH 16, ADR 8, NEST 5, PROF 13, SBX 17, LOCK 10, SIG 20, PRINT 14, META 8, VERS 8, RS 12); Grade: 112 Muss, 24 Soll, 12 Kann; Nummerierung je Bereich lückenlos ab 001 | [01-check-spec.txt](01-check-spec.txt), [02-check-spec.json](02-check-spec.json) |
| 2 | Jede Anforderung ist prüfbar formuliert: beobachtbares Merkmal und Prüfverfahren | **erfüllt:** jede Anforderung hat einen Block `*Prüfverfahren:*` mit ausdrücklichem „Erwartetes Ergebnis“; der Prüfer meldet `missing-procedure` bzw. `procedure-without-expectation`, wenn eines fehlt (Selbsttest: beide Fälle erkannt). Beim ersten Lauf fand der Prüfer 23 Blöcke ohne erkennbares erwartetes Ergebnis und einen fehlenden Grundlagenblock; sie wurden nachgebessert | [01-check-spec.txt](01-check-spec.txt), [03-selftest.txt](03-selftest.txt) |
| 3 | Ein Abschnitt ordnet jede Anforderung einer Konformitätsstufe zu | **erfüllt:** Abschnitt 15.2 listet alle 148 Kennungen mit Grad, Stufe und Subjekt; der Prüfer vergleicht die Tabelle mit den Überschriften (`table-missing-id`, `table-mismatch`, `table-duplicate`) und die Summentabelle 15.3 mit den gezählten Werten (`summary-mismatch`). Stufen: Basis 100, Lebendig 18, Signiert 28, Archiv 2 | [01-check-spec.txt](01-check-spec.txt), [03-selftest.txt](03-selftest.txt) |
| 4 | Keine Anforderung hängt an einem Hersteller; jede Fremdgrundlage ist mit Quelle benannt | **erfüllt:** jede Anforderung hat einen Block `*Grundlage:*`, der eine Quelle `[Qn]` aus Abschnitt 18 (43 Quellen) nennt oder ausdrücklich „eigene Konvention/Festlegung“ sagt; Anforderungstext und Prüfverfahren enthalten keinen der 29 geprüften Produkt- und Herstellernamen (`vendor-name`). 0 unbekannte, 0 ungenutzte Quellen | [01-check-spec.txt](01-check-spec.txt) |
| 5 | Ein Testskript prüft die Anforderungsliste mechanisch (Nummerierung vollständig, jede Anforderung mit Stufe und Prüfverfahren) | **erfüllt:** `node scripts/check-spec.mjs` (Exit 0 bei 0 Fehlern), eingehängt in `npm test`; der Selbsttest verändert die echte Spezifikation auf 15 Arten (Lücke, Dublette, fehlende/unbekannte Stufe, fehlendes Prüfverfahren, fehlendes erwartetes Ergebnis, falsches Schlüsselwort, Herstellername, unbekannte/fehlende Quelle, falsche Tabellenzeile, fehlende Tabellenzeile, falsche Summe, toter Querverweis, veralteter Anker) und erwartet jeweils den passenden Fehlercode: 15 von 15 erkannt | [03-selftest.txt](03-selftest.txt), [05-npm-test.txt](05-npm-test.txt) |

## Was der Prüfer prüft

| Fehlercode | Bedeutung |
|---|---|
| `heading-format`, `unknown-area`, `unknown-grade`, `unknown-level` | Überschrift nicht `#### HP-<BEREICH>-<NNN> · <Grad> · <Stufe>` mit bekannten Werten |
| `numbering`, `duplicate-id`, `area-empty` | Nummern je Bereich nicht lückenlos ab 001, doppelt oder Bereich leer |
| `keyword-mismatch` | Anforderungstext ohne das Schlüsselwort seines Grades (MUSS/DARF NICHT, SOLL, KANN) |
| `missing-procedure`, `procedure-without-expectation` | kein `*Prüfverfahren:*` oder kein „Erwartetes Ergebnis“ |
| `missing-basis`, `unknown-source`, `basis-without-source` | keine `*Grundlage:*`, unbekannte `[Qn]`, weder Quelle noch „eigene Konvention“ |
| `vendor-name` | Produkt- oder Herstellername in Anforderungstext oder Prüfverfahren |
| `dangling-reference`, `dangling-anchor`, `stale-anchor` | Verweis auf nicht existierende Anforderung; Anker-Link mit anderem Grad/Stufe als die Überschrift |
| `table-*`, `summary-*` | Konformitätstabelle 15.2 bzw. Summentabelle 15.3 stimmen nicht mit den Anforderungen überein |
| `unused-source` (Warnung) | Quelle in Abschnitt 18 wird nirgends zitiert |

## Gegenprobe an realen Containern ([04-gegenprobe-container.txt](04-gegenprobe-container.txt))

Die Container-, Metadaten- und Signaturanforderungen wurden am Beispielcontainer des Kerns und an
den signierten Containern aus P3 beobachtet, mit Python `zipfile` (unabhängig vom Kern),
`hpro inspect`/`validate`, epubcheck 5.4.0 und DSS 6.5:

| Anforderung | Beobachtung |
|---|---|
| HP-CONT-001/002 | Methoden `[0, 8]`, keine Verschlüsselung, kein ZIP64; `mimetype` an Offset 0, Methode 0, Extra-Länge 0, Inhalt `application/epub+zip` (3 Container) |
| HP-CONT-006/007 | keine verbotenen Pfade, Eindeutigkeit ohne Groß-/Kleinschreibung; unter `META-INF/` nur `container.xml`, `signatures.xml`, `manifest.xml` |
| HP-CONT-003/004/005/008 | `hpro inspect`: rootfile `package.opf`, alle 6 Ressourcen `ok`, `result: OK` |
| HP-CONT-013 | `.hpro` und `.epub` byteidentisch (`cmp` Exit 0), gleiches Prüfergebnis |
| HP-CONT-017 | epubcheck: `0 fatals / 0 errors / 0 warnings` für Beispiel- und zweifach signierten Container |
| HP-SIG-001/003/004 | Wurzel `signatures` im OCF-Namensraum, 2 `ds:Signature`, nur `xml-exc-c14n#` |
| HP-SIG-005/006/007 | 8 Referenzen inkl. `META-INF/container.xml`; `DataObjectFormat` mit echten Media-Types; `SigningTime` und `SigningCertificateV2` vorhanden |
| HP-SIG-008/009/019 | `rsa-sha256`, `ecdsa-sha256`, `sha256`; ODF-Manifest mit `full-path="/"` und `application/epub+zip`; kein privater Schlüssel |
| HP-SIG-012/014, HP-PROF-010 | Kern: 2 × `TOTAL_PASSED`; manipuliert: 2 × `TOTAL_FAILED / HASH_FAILURE`; DSS mit hpro-Richtlinie: `TOTAL_PASSED`, alle elf Formatprüfungen `OK` (auch mimetype), manipuliert `HASH_FAILURE` |
| HP-SIG-013, HP-PROF-009 | Teilsignatur mit bearbeiteter unsignierter Datei: `TOTAL_PASSED`, `unsigned files: [content/anhang.xhtml]` |

**Befund aus der Gegenprobe:** Der Kern signiert `META-INF/container.xml` mit `DataObjectFormat`
`text/xml`; die Spezifikation nannte zunächst `application/xml`. HP-SIG-006 wurde an die belegte
Umsetzung angepasst (`text/xml`).

## Tests ([05-npm-test.txt](05-npm-test.txt))

`npm ci` und `npm test`: **109 Tests im Kern, 109 bestanden**, danach `spec:check` (`OK: 0 errors,
0 warnings`) und `spec:selftest` (`15 broken variants detected`), Exit-Code 0.

## Nicht geprüft

| Was | Warum nicht |
|---|---|
| Prüfverfahren, die ein Lesesystem, einen Bearbeiter oder einen Druckweg brauchen (Bereiche RS, PRINT, LOCK, NEST, ADR-003 ff., SBX-005 ff., PROF-006 ff.) | diese Werkzeuge existieren noch nicht (Pakete P4, P5, P15–P18); die Spezifikation legt fest, was sie leisten müssen |
| Eingefrorene Fassungen unter `renditions/`, Profil `archive`, Komponenten-Manifest, Sperren | im Kern nicht umgesetzt (P15, P17); Format in Abschnitt 7–9 festgelegt, Gegenprobe nur für die Teilsignatur (P3) |
| Zeitstempel B-T/LT/LTA (HP-SIG-010/011) | kein Zeitstempeldienst (Paket P10) |
| Fremde Validatoren (RTR, DSS-Demo, DigiDoc) | Upload an externe Dienste nicht freigegeben (wie docs/05 §7) |
| ETSI- und pdfa.org-URLs | antworten auf automatisierte Abrufe mit HTTP 403; die Normtexte wurden in docs/05 und docs/quellen bereits ausgewertet, alle anderen 25 externen URLs HTTP 200 |
| Inhaltliche Vollständigkeit gegenüber Teil 1–3 | Prüfregelwerk (S2), Governance (S4) und Formelsprache (S6) sind eigene Pakete; diese Spezifikation verweist auf sie und nennt Abschnitt 17 die offenen Punkte |
