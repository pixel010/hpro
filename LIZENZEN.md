# Lizenzen in diesem Repository

**Festgelegt mit Paket P14 am 14.10.2026** nach dem Vorschlag in Teil 2 der Spezifikation,
Abschnitt 2.2 ([`docs/spezifikation/02-lizenz-und-governance.md`](docs/spezifikation/02-lizenz-und-governance.md#22-lizenzvorschlag)).
Rechteinhaber ist der Herausgeber Johannes Parchatka, Innsbruck ([`NOTICE`](NOTICE)).
Die Lizenztexte liegen unverändert unter [`LICENSES/`](LICENSES/). Sie stammen von den Seiten der
Lizenzgeber und wurden am 14.10.2026 abgerufen; die Prüfsummen stehen in `docs/belege/P14/`.

| Teil | Pfade | Lizenz (SPDX) | Lizenztext |
|---|---|---|---|
| Referenzimplementierung und Werkzeuge | `kern/`, `app/`, `huelle/`, `mobil/`, `einbau/`, `dienst/`, `pruefstein/`, `prototyp/` (eigene Dateien), `testsuite/` (Programme), `scripts/`, `runner/`, `.github/` | **Apache-2.0** | [`LICENSE`](LICENSE), [`LICENSES/Apache-2.0.txt`](LICENSES/Apache-2.0.txt) |
| Spezifikation und Handbücher | `docs/spezifikation/*.md` (Teile 0–6), `docs/spezifikation/aenderungen/` | **CC-BY-4.0** | [`LICENSES/CC-BY-4.0.txt`](LICENSES/CC-BY-4.0.txt) |
| Testsuite, Beispiel- und Prüfdokumente, Schemata, Registry | `testsuite/dokumente/`, `testsuite/faelle.json`, `docs/spezifikation/beispiele/`, `docs/spezifikation/schema/`, `docs/spezifikation/*.json`, `demo/` | **CC0-1.0** | [`LICENSES/CC0-1.0.txt`](LICENSES/CC0-1.0.txt) |
| Übrige Dokumentation | `docs/*.md`, `docs/belege/`, `README.md`, `BAUEN.md` | **CC-BY-4.0** | [`LICENSES/CC-BY-4.0.txt`](LICENSES/CC-BY-4.0.txt) |

Jedes `package.json` trägt `"license": "Apache-2.0"` (Anforderung HPG-LIC-003). Das npm-Paket
`@hpro/kern` enthält `LICENSE`, das Reader-Archiv zusätzlich `NOTICE` und den Lizenztext der
Fremdbibliothek.

## Was nicht unter diesen Lizenzen steht

- **Fremdsoftware**, die nicht im Repository liegt, sondern installiert oder geladen wird
  (`node_modules/`, `prototyp/tools/`, `dienst/tools/`, `huelle/.werkzeug/`, `mobil/.werkzeug/`): Es
  gelten die Lizenzen ihrer Urheber. In ausgelieferte Pakete gelangt davon nur **@xmldom/xmldom**
  (MIT, Laufzeitabhängigkeit des Kerns, im Reader gebündelt). Alle anderen Abhängigkeiten sind
  Entwicklungswerkzeuge (`devDependencies`) und werden nicht ausgeliefert.
- **Zitierte Quellen** unter `docs/quellen/` (Transkripte, Auszüge): Rechte bei den Urhebern; sie
  stehen dort als Beleg, nicht zur Weitergabe unter einer der Lizenzen oben.
- **Normtexte und Fremdstandards**, auf die die Spezifikation verweist: siehe Fremdrechte-Register,
  Teil 2 Abschnitt 2.5.
- **Testschlüssel:** `demo/schluessel/` und Testzertifikate unter `testsuite/`, `kern/test/` sind
  absichtlich öffentlich und dürfen nie für echte Signaturen verwendet werden.

## Patente

Apache-2.0 enthält eine Patentlizenz für die Referenzimplementierung (§3). CC-BY-4.0 lizenziert
**keine** Patente. Für die Pflichtteile der Spezifikation ist eine eigene royalty-freie
Patentzusage vorgesehen (Teil 2, Abschnitt 2.4). Sie ist **noch nicht abgegeben**, Stand im
Beitragendenverzeichnis: `ausstehend`.

Keine dieser Angaben ist Rechtsberatung. Eine juristische Prüfung der Lizenzkombination steht aus
(Teil 2, Abschnitt 10).
