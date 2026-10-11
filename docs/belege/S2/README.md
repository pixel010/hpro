# Belege S2 – Konformitätsstufen, Prüfregeln und Sicherheitsanforderungen

**Stand:** 11.10.2026 · **Erzeugt mit:** [`scripts/belege-s2.sh`](../../../scripts/belege-s2.sh)
(wörtliche Ausgaben mit Exit-Code; Lauf 2026-10-11T14:56Z, ca. 2 Minuten inkl. `npm ci && npm test`)
**Gegenstand:** [`docs/spezifikation/01-konformitaet.md`](../../spezifikation/01-konformitaet.md) (Teil 1),
[`01-regelkatalog.json`](../../spezifikation/01-regelkatalog.json) (maschinenlesbar),
[`schema/konformitaetsbericht.schema.json`](../../spezifikation/schema/konformitaetsbericht.schema.json) (Befundformat)
**Prüfer:** [`scripts/check-konformitaet.mjs`](../../../scripts/check-konformitaet.mjs) (läuft in `npm test`),
Selbsttest [`scripts/check-konformitaet-selftest.mjs`](../../../scripts/check-konformitaet-selftest.mjs),
Befunderzeugung [`scripts/konformitaet-bericht.mjs`](../../../scripts/konformitaet-bericht.mjs)

Werkzeuge ([00-werkzeuge.txt](00-werkzeuge.txt)): Node 26.5.1, Python 3.13.5, Temurin JDK 21.0.12.1+1,
epubcheck 5.4.0, EU DSS 6.5 über [`prototyp/dss`](../../../prototyp/dss/) (nur als Gegenprobe).

## Abnahmekriterien

| # | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| 1 | `docs/spezifikation/01-konformitaet.md` mit Regelkatalog je Stufe und Fehlerklassen | **erfüllt:** 156 Dokumentregeln (`HPR-…`) und 49 Lesesystemregeln (`HPL-…`) in 12 bzw. 13 Bereichen; vier Fehlerklassen Fatal/Fehler/Warnung/Hinweis mit Wirkung auf Urteil und Prüflauf (Abschnitt 2); Stufen Basis 105, Lebendig 17, Signiert 28, Archiv 6 Dokumentregeln; Urteilsregel je Stufe (3.4) | [01-check-konformitaet.txt](01-check-konformitaet.txt), [02-check-konformitaet.json](02-check-konformitaet.json) |
| 2 | Regelkennungen stabil und widerspruchsfrei, Testskript prüft Eindeutigkeit | **erfüllt:** `node scripts/check-konformitaet.mjs` prüft Eindeutigkeit (`duplicate-id`), lückenlose Nummerierung je Bereich (`numbering`), Stufe der Regel = Stufe jeder Bezugsanforderung in Teil 0 (`level-mismatch`), Klasse = Grad des Bezugs oder erklärte Einstufung (`class-grade-mismatch`, `einstufung-invalid`), existierende Bezüge und Querverweise (`unknown-requirement`, `dangling-*`), Vokabulare für Geltung, Mittel, Ort, Platzhalter; Ergebnis `OK: 0 errors, 0 warnings`. Der Selbsttest verändert den echten Katalog auf 26 Arten und erwartet je den passenden Fehlercode: 26 von 26 erkannt. 205 Kennungen eindeutig (Gegenzählung mit Python aus der JSON-Fassung) | [01-check-konformitaet.txt](01-check-konformitaet.txt), [03-selftest.txt](03-selftest.txt), [04-regelkatalog-json.txt](04-regelkatalog-json.txt) |
| 3 | Regelkatalogstruktur so angelegt, dass ein Prüfer (S3) daraus Befunde erzeugen kann | **erfüllt:** jede Dokumentregel trägt Geltung, Mittel, Prüfung, Ortsart und Meldungsvorlage mit festen Platzhaltern; Befundformat (4.1), Ortsangaben (4.2), Bericht (4.3, JSON Schema), Textausgabe (4.4), Rückgabecodes (4.5) sind festgelegt; der Katalog liegt maschinenlesbar vor und wird auf Gleichstand geprüft (`catalog-json-stale`). Nachweis der Ausführbarkeit: der Beispielprüfer liest den JSON-Katalog, erzeugt aus Beobachtungen des Kerns Befunde (Meldung aus der Vorlage, Klasse/Stufe/Bezug aus dem Katalog) und berechnet das Urteil nach 3.4; 20 Berichte an 13 realen Containern, alle schemakonform; Fälle: kein ZIP (FATAL HPR-CONT-001), fremdes ZIP (FATAL HPR-CONT-004), kaputtes Manifest (FATAL HPR-CONT-011), falscher mimetype (HPR-CONT-005 ×2 und HPR-CONT-024 aus dem EPUB-Validator), manipulierter Inhalt (HPR-CONT-016; mit Signatur zusätzlich HPR-SIG-015 `HASH_FAILURE`), ohne Vertrauensanker HPR-SIG-016 → Stufe Signiert `unbestimmt`, teilsignierte Hauptfassung HPR-SIG-005 + HPR-SIG-017 | [05-befunde.txt](05-befunde.txt), [berichte/](berichte/), [06-gegenprobe-epubcheck-dss.txt](06-gegenprobe-epubcheck-dss.txt) |
| 4 | Sicherheitsregeln der Sandbox als Muss-Anforderungen formuliert und begründet | **erfüllt:** 18 Dokumentregeln HPR-SBX (alle Klasse Fehler: 16 Lebendig, 2 Basis für Formeln) und 12 Lesesystemregeln HPL-SBX (11 Fehler, 1 Warnung für die Laufzeitbegrenzung, die in Teil 0 ein SOLL ist) tragen je eine `*Begründung:*`; der Prüfer erzwingt sie (`missing-begruendung`, Selbsttest für beide Kataloge); Gefahrenmodell G1–G10 mit Zuordnung der Regeln (Abschnitt 6.1); jede Muss-Anforderung HP-SBX-* mit Subjekt L hat eine Lesesystemregel (`coverage-gap`); 0 SBX-Regeln ohne Begründung in der JSON-Gegenzählung | [01-check-konformitaet.txt](01-check-konformitaet.txt), [04-regelkatalog-json.txt](04-regelkatalog-json.txt), [03-selftest.txt](03-selftest.txt) |

## Was der Prüfer prüft

| Fehlercode | Bedeutung |
|---|---|
| `heading-format`, `unknown-area`, `unknown-class`, `unknown-level` | Überschrift nicht `#### HPR-<BEREICH>-<NNN> · <Klasse> · <Stufe>` mit bekannten Werten |
| `numbering`, `duplicate-id`, `catalog-empty` | Nummern je Katalog und Bereich nicht lückenlos ab 001, doppelt, Katalog leer |
| `missing-title`, `missing-field`, `missing-begruendung` | Kurztitel, Pflichtfeld (Bezug, Geltung, Mittel, Prüfung, Ort, Meldung bzw. Bezug, Testfall, Erwartung) oder Begründung im Bereich SBX fehlt |
| `unknown-requirement`, `level-mismatch`, `class-grade-mismatch`, `einstufung-invalid` | Bezug existiert nicht in Teil 0; Stufe weicht ab; Klasse passt nicht zum Grad ohne erklärte Einstufung; Einstufung unbekannt oder zur Klasse unpassend |
| `unknown-geltung`, `unknown-mittel`, `unknown-ort`, `unknown-placeholder` | Wert außerhalb des Vokabulars aus Abschnitt 1.3 und 4 |
| `dangling-rule-reference`, `dangling-requirement-reference`, `unknown-source` | Verweis auf nicht existierende Regel, Anforderung oder Quelle |
| `coverage-gap` | Muss-Anforderung mit Subjekt D ohne Dokumentregel; Muss-Anforderung HP-SBX mit Subjekt L ohne Lesesystemregel |
| `table-*`, `summary-*` | Abdeckungstabelle 10.2 bzw. Summentabellen 11.1–11.3 stimmen nicht mit den Regeln überein |
| `catalog-json-missing`, `catalog-json-stale`, `schema-missing`, `schema-invalid` | maschinenlesbare Fassung fehlt oder ist veraltet; Berichtsschema fehlt oder ist unbrauchbar |
| `coverage-gap-soft`, `unused-source` (Warnungen) | Soll-/Kann-Anforderung mit Subjekt D ohne Regel; Quelle ungenutzt |

Abdeckung ([01-check-konformitaet.txt](01-check-konformitaet.txt)): 149 von 160 Anforderungen aus
Teil 0 haben mindestens eine Regel. Ohne Regel bleiben 11 Anforderungen, keine davon Muss mit
Subjekt D: HP-ADR-006 (Kann, L), HP-SBX-012 (Kann, L), HP-LOCK-009 (Soll, L), HP-PRINT-011 (Soll, L),
HP-PRINT-014 (Kann, L), HP-VERS-003 (Muss, P: Governance, Teil 2), HP-RS-011 (Soll, L), HP-MIN-003
(Muss, E: Umwandlungstest, Paket S5), HP-MIN-010/011 (Soll, L), HP-MIN-012 (Kann, E). Sie stehen in
Abschnitt 10.2 mit „–“.

## Befunderzeugung ([05-befunde.txt](05-befunde.txt), [berichte/](berichte/))

Der Beispielprüfer ist **nicht** das Prüfprogramm aus Paket S3. Er setzt nur die Regeln um, die der
Kern aus P1–P3 bereits beobachten kann (ZIP-Struktur, `mimetype`, Hash-Manifest, Manifestfelder,
Signaturen über die eigene XAdES-Prüfung, optional der EPUB-Validator), und meldet alle anderen
Regeln als `nicht geprüft` mit Grund `missing-means`. Damit zeigt er, dass Katalogstruktur,
Meldungsvorlagen, Urteilsregel, Rückgabecodes und Berichtsschema zusammenpassen:

| Prüffall | Befunde | Urteil | Rückgabe |
|---|---|---|---|
| Beispielcontainer des Kerns | 0 | Basis `unbestimmt` (131 Regeln nicht geprüft) | 3 |
| kein ZIP | FATAL HPR-CONT-001 | Basis `nicht bestanden` | 1 |
| ZIP ohne `mimetype`/`manifest.json` | FATAL HPR-CONT-004 | Basis `nicht bestanden` | 1 |
| `manifest.json` kein JSON | FATAL HPR-CONT-011 | Basis `nicht bestanden` | 1 |
| `mimetype` deflated mit ASiC-Wert | 2 × HPR-CONT-005; mit EPUB-Validator zusätzlich HPR-CONT-024 `PKG-007` | Basis `nicht bestanden` | 1 |
| P1 manipuliert | HPR-CONT-016 | Basis `nicht bestanden` | 1 |
| P3 signiert (RSA, 2 Signaturen), mit Vertrauensankern | 0 | Basis, Signiert `unbestimmt` | 3 |
| dieselben ohne Vertrauensanker | HPR-SIG-016 je Signatur (`INDETERMINATE / NO_CERTIFICATE_CHAIN_FOUND`) | Signiert `unbestimmt` | 3 |
| P3 manipuliert (RSA, 2 Signaturen) | HPR-CONT-016 + HPR-SIG-015 je Signatur (`TOTAL_FAILED / HASH_FAILURE`, nicht intakt `content/index.xhtml`) | Basis, Signiert `nicht bestanden` | 1 |
| P3 teilsigniert | HPR-SIG-005 (Datei der Hauptfassung nicht abgedeckt) + HPR-SIG-017 (Hinweis) | Signiert `nicht bestanden` | 1 |
| P3 teilsigniert, unsignierte Datei bearbeitet | zusätzlich HPR-CONT-016 | Basis, Signiert `nicht bestanden` | 1 |

Alle 20 JSON-Berichte wurden unabhängig vom Beispielprüfer mit Python gegen Pflichtfelder,
Klassen, Urteile, Regelkennungen und Summen geprüft: 20 von 20 schemakonform.

## Gegenprobe ([06-gegenprobe-epubcheck-dss.txt](06-gegenprobe-epubcheck-dss.txt))

- EPUB-Validator 5.4.0: Beispielcontainer `0 fatals / 0 errors`; `mimetype`-Fall `1 error` (`PKG-007`),
  im Bericht als `FEHLER HPR-CONT-024 external: EPUB-Validator PKG-007 …` übernommen.
- DSS 6.5 mit html-Pro-Richtlinie: `signiert-2sig.epub` → `TOTAL_PASSED` (RSA) und
  `INDETERMINATE / NO_CERTIFICATE_CHAIN_FOUND` (EC, nur RSA-Anker übergeben); `manipuliert-rsa.epub`
  → `TOTAL_FAILED / HASH_FAILURE`; `teilsigniert-anhang-bearbeitet.epub` → `TOTAL_PASSED` mit
  unsignierter Datei. Die Urteile des Beispielprüfers (HPR-SIG-015/016) stimmen mit diesen überein.

## Tests ([07-npm-test.txt](07-npm-test.txt))

`npm ci` und `npm test`: **109 Tests im Kern, 109 bestanden**, danach `spec:check` (Teil 0,
`OK: 0 errors, 0 warnings`), `spec:selftest` (21 Varianten), `konf:check` (Teil 1, `OK: 0 errors,
0 warnings`) und `konf:selftest` (26 Varianten), Exit-Code 0.

## Nicht geprüft

| Was | Warum nicht |
|---|---|
| Regeln mit Mittel `rendering` (6), `manuell` (1) und die meisten mit `statisch` (Inhalt, Adressen, Verschachtelung, Sperren, Druck, Mindestprofil) an realen Dokumenten | das Prüfprogramm, das sie ausführt, ist Paket S3; dieser Beleg zeigt die Befunderzeugung nur für die Regeln, die der Kern heute beobachten kann |
| Lesesystemregeln (`HPL-…`) | kein Lesesystem vorhanden (P4, P15 ff.); die Testfälle sind formuliert, nicht ausgeführt |
| Dokumentdaten-Kanal (Abschnitt 8) | kein Lesesystem; Protokoll normativ festgelegt, Testfall HPL-SBX-008 beschrieben |
| Eingefrorene Fassungen (Abschnitt 7.3, HPR-PROF-009 ff.) | im Kern nicht umgesetzt (P17); Regeln und Vorgehen festgelegt, Signaturzuordnung (7.1) am Teilsignatur-Fall aus P3 nur für die Hauptfassung beobachtet |
| Sandbox unter Linux/Android (HPL-SBX-005) | Messung steht aus (docs/06 §5); Regel gilt unabhängig davon |
| Fremde Validatoren (RTR, DSS-Demo) | Upload nicht freigegeben (wie docs/05 §7) |
