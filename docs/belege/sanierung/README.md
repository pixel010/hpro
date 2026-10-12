# Sanierung des Bestands – Spezifikation ohne Bereich MIN und ohne Konformitätsklassen

**Stand:** 11.10.2026 · **Anlass:** Bestandsprüfung `npm test --if-present` (runner/auto_lauf.py) rot

## Befund

`npm test` lief in den Kern-Tests grün (109 von 109), brach aber in `npm run spec:check` ab
([01-check-spec-vorher.txt](01-check-spec-vorher.txt), Spezifikation und Prüfer aus HEAD 62fbe65):

```
ERROR area-empty: MIN
ERROR class-table-missing: no conformance class table (16.4)
FAILED: 2 errors, 0 warnings
```

## Ursache

Inhaltlich, nicht im Prüfer. `scripts/check-spec.mjs` verlangt seit S1 den Bereich `MIN`
(Mindestprofil für Büroprogramme) und eine Konformitätsklassen-Tabelle Erzeuger/Leser; der
Selbsttest prüft deren Zeilen `Leser-Konformität | L` und `Prüfer-Konformität | P`. Beides sind
Abnahmekriterien von S1 (runner/plan.json, docs/10 Abschnitt f), die in der Spezifikation fehlten.
Die Belege unter `docs/belege/S1/` stammen aus einem früheren Stand des Prüfers ohne diese Regeln
(dort `per area` ohne `MIN`, 15 statt 17 Selbsttestfälle) und zeigen deshalb Grün.

## Behebung (nur Inhalt der Spezifikation; Prüfer und Selbsttest unverändert)

| Änderung in `docs/spezifikation/00-spezifikation.md` | Inhalt |
|---|---|
| Neuer Abschnitt 15 „Mindestprofil für Büroprogramme“ | 15.1 Elementbestand; 15.2 Zuordnung von Formatvorlagen auf Struktur (hpro, ODF [Q42], OOXML [Q43]) für Überschriften, Absätze, Listen, Tabellen, Bilder, Fußnoten, Endnoten, Verweise; 15.3 zwölf Anforderungen HP-MIN-001 … HP-MIN-012 (9 Muss, 2 Soll, 1 Kann, alle Basis) mit Prüfverfahren und Grundlage |
| Abschnitt 16 (bisher 15) „Konformität“ | 12 Zeilen HP-MIN in der Tabelle 16.2; Summentabelle 16.3 auf 160 Anforderungen; neue Tabelle 16.4 Konformitätsklassen (Erzeuger D, E = 100; Leser L = 66; Bearbeiter B = 9; Prüfer P = 3) |
| Abschnitte 17–19 (bisher 16–18) | Umsetzungsstand: Zeile MIN (offen, S5); offene Punkte: MIN-Prüfverfahren nicht ausgeführt; Quellen Q42–Q45 (ODF 1.3 Teil 3, ECMA-376, DPUB-ARIA 1.1, EPUB SSV 1.1; am 11.10.2026 mit HTTP 200 erreichbar) |
| 1.2, 1.3, HP-CONT-013 | Bereich `MIN` in der Bereichsliste; Abschnittsverweise auf die neue Nummerierung |
| `README.md` | 160 statt 148 Anforderungen |

Die Zählungen in 16.3 und 16.4 wurden vor dem Eintragen unabhängig vom Prüfer aus der Tabelle 16.2
nachgezählt und stimmen mit der Ausgabe des Prüfers überein.

## Belege (wörtliche Ausgaben mit Exit-Code)

| Datei | Befehl | Ergebnis |
|---|---|---|
| [01-check-spec-vorher.txt](01-check-spec-vorher.txt) | `check-spec.mjs` auf die Spezifikation aus HEAD | 2 Fehler, Exit 1 (Reproduktion) |
| [02-check-spec.txt](02-check-spec.txt) | `node scripts/check-spec.mjs` | 160 Anforderungen, `MIN=12`, Klassen 100/66/9/3, `OK: 0 errors, 0 warnings`, Exit 0 |
| [03-selftest.txt](03-selftest.txt) | `node scripts/check-spec-selftest.mjs` | 17 von 17 kaputten Varianten erkannt, echte Spezifikation besteht, Exit 0 |
| [04-npm-test.txt](04-npm-test.txt) | `npm test --if-present` (voller Prüflauf wie in der Bestandsprüfung) | Kern 109 Tests, 109 bestanden, 0 übersprungen; `spec:check` OK; `spec:selftest` OK; Exit 0 |

## Nicht geprüft

| Was | Warum nicht |
|---|---|
| Prüfverfahren HP-MIN-001 … 012 an echten Umwandlungen | es gibt noch keinen Erzeuger mit Import aus Büroformaten (Paket S5); die Anforderungen legen fest, was er leisten muss |
| Spalten ODF und OOXML der Tabelle 15.2 an Beispieldateien | aus [Q42] und [Q43] abgeleitet, nicht an Dateien erprobt; als informativ gekennzeichnet |
| Neuerzeugung der Belege unter `docs/belege/S1/` | gehört zum Paket S1 (Status offen); diese Sanierung belegt nur den Bestand |
