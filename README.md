# html-Pro
Reader und Editor für Dokumente jenseits des Papierformats – HTML-basiert, responsiv, interaktiv

## Aufbau

| Pfad | Inhalt |
|---|---|
| [`docs/`](docs/) | Recherche, Konzept, Prototyp-Ergebnisse, Arbeitsplan; Belege je Paket unter `docs/belege/` |
| [`docs/spezifikation/`](docs/spezifikation/) | Spezifikation html-Pro 0.1 (Teil 0: Kern, 160 normative Anforderungen mit Prüfverfahren, Konformitätsstufen, Erzeuger-/Leser-Konformität, Mindestprofil für Büroprogramme, Prüfstein der Umsetzbarkeit; Teil 1 Konformität, Teil 2 Governance, Teil 3 Formeln); mechanisch geprüft durch `npm run spec:check` u. a. Dazu informativ das [Umsetzer-Handbuch](docs/spezifikation/04-umsetzer-handbuch.md) (Teil 4) und der [Autorenleitfaden](docs/spezifikation/05-autorenleitfaden.md) (Teil 5, Mindestprofil, Textverarbeitung und CMS) mit nachbaubaren Beispielen unter `beispiele/s7-*/`; jede Aussage nennt ihre Anforderung, jeder Ausgabeblock steht wörtlich in `docs/belege/S7/` (`npm run hb:check`) |
| [`pruefstein/`](pruefstein/) | Clean-Room-Umsetzung des Prüfsteins (Spezifikation Abschnitt 17): minimaler Erzeuger und Leser in Python, nur aus der Spezifikation gebaut, mit Fragenprotokoll |
| [`prototyp/`](prototyp/) | Container-Experiment aus Phase 2 (Python, EU DSS) |
| [`kern/`](kern/) | `@html-pro/kern`: Container lesen/schreiben, Hash-Manifest, Signaturprüfung XAdES/CAdES und Signieren XAdES-Baseline-B ohne Java, Adapter-Schnittstellen (TypeScript) |
| [`scripts/`](scripts/) | Skripte zum Erzeugen der Belege; `check-spec.mjs` prüft die Spezifikation (Nummerierung, Stufe, Prüfverfahren, Quellen, Konformitätsklassen, Prüfstein), `check-spec-selftest.mjs` prüft den Prüfer, `s1-referenz.mjs` liest einen Container mit dem Kern für die Prüfstein-Auswertung; `s7-beispiele.mjs` baut die Beispiele der Handbücher, `s7-fodt2hpro.mjs` ist der Referenzkonverter Flat-ODF → Mindestprofil, `check-handbuch.mjs` prüft die Handbücher (Anforderungsnennungen, Beispiele je Kapitel, wörtliche Ausgaben) |

## Bauen und testen

Voraussetzung: Node.js ≥ 22 (geprüft mit 26.5.1). Für die epubcheck-Tests zusätzlich die
Werkzeuge aus `prototyp/setup-tools.sh`.

```sh
npm ci
npm test
```
