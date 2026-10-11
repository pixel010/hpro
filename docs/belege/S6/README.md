# Belege S6 – Tabellen und Formeln: Spezifikation (OpenFormula-Teilumfang)

**Stand:** 11.10.2026 · **Erzeugt mit:** [`scripts/belege-s6.sh`](../../../scripts/belege-s6.sh)
(wörtliche Ausgaben mit Exit-Code; ca. 2 Minuten inkl. `npm ci && npm test`)
**Gegenstand:** [`docs/spezifikation/03-tabellen-und-formeln.md`](../../spezifikation/03-tabellen-und-formeln.md) (Teil 3),
[`03-funktionen.json`](../../spezifikation/03-funktionen.json) (maschinenlesbare Funktionsliste)
**Prüfer:** [`scripts/check-formeln.mjs`](../../../scripts/check-formeln.mjs) (läuft in `npm test`),
Selbsttest [`scripts/check-formeln-selftest.mjs`](../../../scripts/check-formeln-selftest.mjs),
Referenzwerte [`scripts/formeln-referenzwerte.mjs`](../../../scripts/formeln-referenzwerte.mjs)

Werkzeuge ([00-werkzeuge.txt](00-werkzeuge.txt)): Node 26.5.1, Python 3.13.5. Keine
Tabellenkalkulation im Arbeitscontainer (soffice, gnumeric: nicht gefunden); die Gegenprobe gegen
LibreOffice oder Excel ist Paket P19. epubcheck und DSS wurden nicht gebraucht (kein Container
erzeugt; Teil 3 ist ein Dokument).

## Abnahmekriterien

| # | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| 1 | `docs/spezifikation/03-tabellen-und-formeln.md` liegt vor, mit nummerierten Muss/Soll/Kann-Anforderungen | **erfüllt:** 88 Anforderungen `HPF-…` in 12 Bereichen (SYN 11, TYP 12, NUM 7, DAT 8, ERR 4, FN 4, STO 12, ADR 6, CALC 8, FRZ 7, IMP 5, SEC 4); Grade 76 Muss, 8 Soll, 4 Kann; Stufen Basis 78, Lebendig 4, Signiert 5, Archiv 1; Nummerierung je Bereich lückenlos ab 001 | [01-check-formeln.txt](01-check-formeln.txt), [02-check-formeln.json](02-check-formeln.json) |
| 2 | Funktionsumfang als Liste mit Funktion, Signatur, Verhalten bei Fehlern und Quelle in OpenFormula (mindestens 40) | **erfüllt:** 96 Funktionen in Abschnitt 8.2, jede mit Signatur, Ergebnistyp, Spalte „Fehler und Festlegungen“ und Abschnittsnummer in ODF 1.3 Teil 4; der Prüfer verlangt ≥ 40 (`function-count`), Eindeutigkeit, Signatur, Fehlerspalte und Quelle je Zeile; alle 96 Abschnittsnummern stimmen mit den Überschriften der heruntergeladenen Norm überein (0 Abweichungen); 79 ausgeschlossene Funktionen mit Grund und Importverhalten (8.3), ohne Überschneidung, einschließlich der sieben in Teil 0 verbotenen | [05-funktionsliste.txt](05-funktionsliste.txt), [06-quellen.txt](06-quellen.txt) |
| 3 | Formel und Wert: wie beides gespeichert wird und was gilt, wenn der Wert fehlt oder veraltet ist | **erfüllt:** HPF-STO-001 (Formelzelle mit `data-hp-formula`, `data-hp-value`, `data-hp-type`, Zellinhalt), HPF-STO-002 (Wertform je Wertart, Namen aus ODF `office:value-type`), HPF-STO-006 (`computedAt`, `calculator`), HPF-STO-007 (`data-hp-stale` durch Bearbeiter ohne Rechner), HPF-STO-008 (Lesesystem ohne Rechner: gespeicherte Werte, Kennzeichnung „veraltet“ und „nicht berechnet“), HPF-STO-009 (Lesesystem mit Rechner: neu berechnen, keine stille Änderung der Datei), HPF-FRZ-001/003 (eingefrorene Fassung: Werte festgeschrieben, nie ersetzt, Abweichung gemeldet) | Abschnitte 9 und 12 der Spezifikation; Prüfer: `table-*`, `keyword-mismatch` |
| 4 | Genauigkeit, Rundung, Datumssystem und Fehlerwerte festgelegt und von Excel-/LibreOffice-Verhalten abgegrenzt | **erfüllt:** binary64 exakt ohne 15-Stellen-Abschneiden und ohne Näherungsvergleich (HPF-NUM-001, HPF-TYP-005), kanonische Zahlform (HPF-NUM-002), Rundung auf der Dezimalform halb vom Nullpunkt weg (HPF-NUM-004), Summationsreihenfolge (HPF-NUM-005), Epoche 30.12.1899 ohne Schaltjahrfehler 1900 (HPF-DAT-001), nur ISO-Datumstext (HPF-DAT-004), 7 OpenFormula-Fehlerwerte + `#CIRC!` (7.1), alle 12 wirtsdefinierten Eigenschaften von OpenFormula §3.4 festgelegt (HPF-TYP-011, vom Prüfer erzwungen); Abgrenzung in Abschnitt 15 (15 Zeilen, mit Quellen Microsoft/Document Foundation); 30 Referenzwerte in Abschnitt 16 von Node und unabhängig von Python nachgerechnet: 30 von 30 stimmen überein | [04-referenzwerte.txt](04-referenzwerte.txt), [01-check-formeln.txt](01-check-formeln.txt) |
| 5 | Testskript prüft die Anforderungsliste mechanisch (Nummerierung, jede Anforderung mit Stufe und Prüfverfahren) | **erfüllt:** `node scripts/check-formeln.mjs` (Exit 0 bei 0 Fehlern), eingehängt in `npm test`; der Selbsttest verändert die echte Spezifikation auf 32 Arten und erwartet jeweils den passenden Fehlercode: 32 von 32 erkannt | [03-selftest.txt](03-selftest.txt), [07-npm-test.txt](07-npm-test.txt) |

## Was der Prüfer prüft

| Fehlercode | Bedeutung |
|---|---|
| `heading-format`, `unknown-area`, `unknown-grade`, `unknown-level` | Überschrift nicht `#### HPF-<BEREICH>-<NNN> · <Grad> · <Stufe>` mit bekannten Werten |
| `numbering`, `duplicate-id`, `area-empty` | Nummern je Bereich nicht lückenlos ab 001, doppelt oder Bereich leer |
| `keyword-mismatch` | Anforderungstext ohne das Schlüsselwort seines Grades |
| `missing-procedure`, `procedure-without-expectation` | kein `*Prüfverfahren:*` oder kein „Erwartetes Ergebnis“ |
| `missing-basis`, `unknown-source`, `basis-without-source` | keine `*Grundlage:*`, unbekannte `[Qn]`, weder Quelle noch Teil-0-Bezug noch „eigene Konvention“ |
| `vendor-name` | Produkt- oder Herstellername in Anforderungstext oder Prüfverfahren (Liste aus Teil 0 plus Tabellenkalkulationen) |
| `dangling-reference`, `dangling-anchor`, `stale-anchor` | Verweis auf nicht existierende `HPF-`-Anforderung; Anker mit anderem Grad/Stufe |
| `dangling-teil0-reference`, `dangling-teil0-anchor`, `stale-teil0-anchor` | Verweis auf nicht existierende `HP-`-Anforderung in Teil 0 (Teil 0 wird mit `check-spec.mjs` geparst) |
| `function-count`, `function-name`, `function-duplicate`, `function-signature`, `function-result`, `function-errors`, `function-source`, `function-row-format` | Funktionsliste 8.2: < 40 Funktionen; Name nicht groß; doppelt; Signatur beginnt nicht mit dem Namen; Ergebnis, Fehlerspalte oder Normabschnitt (`6.x.y`) fehlt |
| `excluded-overlap`, `excluded-row-empty`, `forbidden-supported`, `forbidden-not-excluded` | Ausschlussliste 8.3 überschneidet 8.2; Grund/Import leer; eine der sieben in Teil 0 verbotenen Funktionen ist unterstützt oder fehlt in 8.3 |
| `formula-unknown-function`, `formula-separator`, `formula-reference-syntax`, `formula-string` | Formelbeispiel (Code `=…`) nutzt eine Funktion außerhalb 8.2/8.3, `,` als Trenner, einen Bezug ohne Klammersyntax, eine offene Textkonstante |
| `error-name-format`, `error-name-missing`, `unknown-error-name` | Fehlername entspricht nicht der Produktion aus §5.12; einer der sieben Namen aus Tabelle 4 fehlt; ein Fehlername im Text ist nicht in 7.1 erklärt |
| `host-property-missing` | eine der 12 wirtsdefinierten Eigenschaften (§3.4) ist nicht festgelegt |
| `reference-value-mismatch`, `reference-value-missing`, `reference-value-unknown` | Referenzwert in Abschnitt 16 weicht vom berechneten ab, fehlt oder ist unbekannt |
| `table-*`, `summary-*` | Konformitätstabelle 17.1 bzw. Summentabelle 17.2 stimmen nicht mit den Anforderungen überein |
| `functions-json-stale`, `functions-json-missing` (Warnung) | maschinenlesbare Fassung veraltet oder fehlt (`npm run form:export`) |
| `unused-source` (Warnung) | Quelle in Abschnitt 19 wird nirgends zitiert |

## Referenzwerte ([04-referenzwerte.txt](04-referenzwerte.txt))

Die 30 Werte in Abschnitt 16 (Datumsserien, Gleitkomma, Rundung, Zeit, Modulo, Datumsüberläufe,
Wochentag, ISO-Woche, PMT) werden von `formeln-referenzwerte.mjs` berechnet und vom Prüfer mit dem
Dokument verglichen (`reference-value-mismatch`). Die unabhängige Python-Berechnung (`datetime`,
`decimal`, `repr`) stimmt in 30 von 30 Fällen mit dem Dokument überein. Beim ersten Lauf wichen
drei Werte im Entwurf des Dokuments ab (R20, R21 Datumsüberläufe; R29 PMT) und wurden korrigiert;
die Prüfung hat damit ihren Zweck erfüllt.

## Quellen ([06-quellen.txt](06-quellen.txt))

OpenFormula-Norm (ODF 1.3 Teil 4) am 11.10.2026 geladen, SHA-256
`3470c9d23abcb5f9ddf0f7b8fbc642c5f8087b88650010b3bcc95b462489c54b`, 560 Überschriften extrahiert;
die Abschnittsnummern aller 96 Funktionen und die zitierten Abschnitte (2.3.2, 3.4, 3.7, 4.6, 5.8,
5.12) sind in der Norm vorhanden. Externe Quellen: 15 × HTTP 200, 1 × 403 (ISO 4217, automatisierter
Abruf abgewiesen; im Dokument vermerkt).

## Tests ([07-npm-test.txt](07-npm-test.txt))

`npm ci` und `npm test`: 109 Tests im Kern bestanden, danach `spec:check`, `spec:selftest` (21),
`konf:check`, `konf:selftest` (26), `form:check` (`OK: 0 errors, 0 warnings`), `form:selftest`
(32 Varianten), Exit-Code 0.

## Nicht geprüft

| Was | Warum nicht |
|---|---|
| Alle Prüfverfahren, die einen Rechner, ein Lesesystem, einen Bearbeiter oder einen Importer voraussetzen (TYP, NUM-001/003–006, DAT, ERR-002–004, FN-001/003, STO-007–012, ADR-002–006, CALC, FRZ-003–006, IMP, SEC-002–004) | die Werkzeuge entstehen in P19 (Rechner) und P4 (Lesesystem); die Verfahren sind formuliert, nicht ausgeführt |
| Gegenprobe der Abgrenzungstabelle (Abschnitt 15) an Excel und LibreOffice | keine Tabellenkalkulation im Arbeitscontainer; Angaben beruhen auf Herstellerdokumentation ([Q16]–[Q19]) und eigener Kenntnis; Messung ist Abnahmekriterium von P19 |
| Vollständigkeit der Funktionsliste für Aufmaße, Kostenschätzungen und Anträge | Erhebung steht aus (docs/10 §5 Frage 7); Erweiterung über Teilversionen (HPF-FN-004) |
| Regeln in Teil 1 für die neuen Anforderungen (Syntax, Wertformen, Zirkel, Importbericht) | brauchen einen Formelparser im Prüfprogramm (S3); Liste in Teil 3 Abschnitt 17.3 |
