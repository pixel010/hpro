# Belege S4 – Offene Lizenz, Governance, Namensraum und Komponenten-Registry

**Stand:** 11.10.2026 · **Erzeugt mit:** [`scripts/belege-s4.sh`](../../../scripts/belege-s4.sh)
(wörtliche Ausgaben mit Exit-Code; ca. 2,5 Minuten inkl. `npm ci && npm test`)
**Gegenstand:** [`docs/spezifikation/02-lizenz-und-governance.md`](../../spezifikation/02-lizenz-und-governance.md) (Teil 2),
[`02-registry.json`](../../spezifikation/02-registry.json) (Registry), [`aenderungen/HPC-0001.md`](../../spezifikation/aenderungen/HPC-0001.md) und [`HPC-0002.md`](../../spezifikation/aenderungen/HPC-0002.md) (Änderungsanträge),
[`beispiele/s4-erweiterung-gueltig/`](../../spezifikation/beispiele/s4-erweiterung-gueltig/) und [`…-ungueltig/`](../../spezifikation/beispiele/s4-erweiterung-ungueltig/) (Beispielquellen)
**Prüfer:** [`scripts/check-governance.mjs`](../../../scripts/check-governance.mjs) (läuft in `npm test`),
Selbsttest [`scripts/check-governance-selftest.mjs`](../../../scripts/check-governance-selftest.mjs),
Erweiterungsprüfer [`scripts/check-erweiterung.mjs`](../../../scripts/check-erweiterung.mjs),
Beispielbau [`scripts/s4-beispiele.mjs`](../../../scripts/s4-beispiele.mjs)

Werkzeuge ([00-werkzeuge.txt](00-werkzeuge.txt)): Node 26.5.1, Python 3.13.5, Temurin JDK 21.0.12.1+1,
epubcheck 5.4.0, EU DSS 6.5 über [`prototyp/dss`](../../../prototyp/dss/) (Gegenprobe), Referenzimplementierung `@hpro/kern` (P1–P3).

## Abnahmekriterien

| # | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| 1 | `docs/spezifikation/02-lizenz-und-governance.md` mit Lizenzvorschlag, Änderungsverfahren und Versionsschema | **erfüllt:** Teil 2 mit 44 Anforderungen `HPG-…` in 6 Bereichen (LIC 7, GOV 8, VER 9, NS 7, EXT 7, REG 6; 35 Muss, 6 Soll, 3 Kann), Nummerierung lückenlos. Lizenzvorschlag Abschnitt 2.2 (CC-BY-4.0 Text, Apache-2.0 Code, CC0-1.0 Testsuite, Patentzusage nach W3C-CG-FSA/OWFa-Muster, Text in 2.4); Fremdrechte-Register 2.5 deckt alle 13 Organisationen ab, die in den Quellen der Teile 0, 1, 3 vorkommen (mechanisch: `ipr-register`). Änderungsverfahren 3.3 mit Pflichtfeldern, Fristen und Phasen; Änderungsverzeichnis 3.5 mit zwei echten Anträgen (HPC-0001 Dateiendung „in Frist“, HPC-0002 Registrierung „umgesetzt“). Versionsschema Abschnitt 4 (`major.minor`, Errata, Status, Kennungen stabil, Veralten, Testsuite je Fassung). Die vier Teile tragen dieselbe Version und denselben Status (`version-mismatch` geprüft). Die Lizenz ist ein **Vorschlag**: `license`-Felder und `LICENSE`-Dateien fehlen bis P14 (bewusst, siehe 08-lizenzen.txt) | [01-check-governance.txt](01-check-governance.txt), [02-check-governance.json](02-check-governance.json), [08-lizenzen.txt](08-lizenzen.txt) |
| 2 | Erweiterungs- und Namensraumregeln mit Beispiel für eine gültige und eine ungültige Drittanbieter-Erweiterung | **erfüllt:** Regeln in Abschnitt 5 (URI-Muster, Platzhalter, reservierte Kennungen) und 7 (HPG-EXT-001 bis -007). Beide Beispiele liegen als Quellen im Repository und werden deterministisch gebaut (zwei Läufe byte-identisch, `cmp` Exit 0; SHA-256 gültig `22fda1ad…`, ungültig `e33bd548…`). Gültig: Erweiterungsprüfer 0 Befunde, epubcheck 0 Fehler/0 Warnungen, `hpro inspect` OK. Ungültig: 9 Fehler mit Regelkennungen aus Teil 1 (HPR-META-011 ×1, HPR-VERS-002 ×2, HPR-VERS-003 ×4, HPR-VERS-005 ×2); der Prüfer gleicht die dokumentierte Befundtabelle (Teil 2 §7.4) gegen den tatsächlichen Lauf ab (`example-findings`, Selbsttest in drei Richtungen). Unabhängige Gegenprobe: epubcheck meldet den externen Verweis als `RSC-006`; die übrigen sechs Verstöße sind hpro-Regeln | [04-beispiele.txt](04-beispiele.txt), [05-erweiterung-gueltig.json](05-erweiterung-gueltig.json), [06-erweiterung-ungueltig.json](06-erweiterung-ungueltig.json), [container/](container/) |
| 3 | Dateiendung: Normkonflikt aus docs/05 §6.2 aufgegriffen, begründete Empfehlung | **erfüllt:** Abschnitt 6 mit Normlage (6.1), Messung (6.2), vier Optionen (6.3) und Empfehlung (6.4): `.hpro` kanonisch, `.epub`/`.asice` als Weitergabe-Endungen derselben Bytes; Änderungsantrag HPC-0001 zu HP-CONT-013 eingereicht (Frist bis 09.11.2026); Anforderungen HPG-NS-005/006/007. Messung mit dem signierten P3-Container unter vier Endungen (identische SHA-256): epubcheck 5.4.0 prüft nur `.epub` („Mode required for non-epub files“, Exit 1 bei `.hpro`/`.asice`/`.sce`); `hpro inspect` und `hpro validate` liefern bei allen vier dasselbe Ergebnis (2 Signaturen, beide bestanden); DSS 6.5 ebenso (Containertyp ASiC-E, `mimetype` `application/epub+zip`, gleiche Indications bei allen vier; „gültig: 1“ nur, weil nur der RSA-Vertrauensanker übergeben wurde). Die Frage, ob EN 319 162-1 §4.4.3.1 Nr. 1 für Container mit Original-Media-Type gilt, bleibt **offen** (Anfrage an ETSI ESI), nicht behauptet | [07-dateiendung.txt](07-dateiendung.txt), Teil 0 §19 Punkt 1 aktualisiert |
| 4 | Liste der offenen Punkte für eine Standardisierung bei W3C, ISO oder OASIS — als offene Frage | **erfüllt:** Abschnitt 9: Tabelle 9.1 stellt je Weg die veröffentlichten Bedingungen (W3C CG: 5 Unterstützer, CLA/FSA; W3C WG: Charter, AC-Review, Patent Policy, Wide Review, Implementierungserfahrung; OASIS: 5 Eligible Persons aus ≥ 2 Organisationsmitgliedern, IPR-Modus, 3 Statements of Use; ISO/IEC JTC 1: PAS nur über anerkannte Submitter, DIS 12 Wochen) dem Stand gegenüber (ein Herausgeber, eine Implementierung, keine Reviews, keine Mitgliedschaften); 9.2 nennt zwölf offene Fragen. Keine Anerkennung wird behauptet; alle Aussagen mit Quelle, 33 von 35 externen Quellen erreichbar (HTTP 200), ETSI und ISO antworten mit 403 (in Teil 2 vermerkt) | [09-quellen.txt](09-quellen.txt), Teil 2 §9 und §10 |

Belege: Testlauf `npm ci && npm test` grün (Kern 109/109 Tests; Prüfer der Teile 0, 1, 3 und 2
mit Selbsttests 21/26/32/37 erkannte Varianten) in [10-npm-test.txt](10-npm-test.txt).

## Was der Prüfer prüft ([`check-governance.mjs`](../../../scripts/check-governance.mjs))

| Fehlercode | Bedeutung |
|---|---|
| `heading-format`, `unknown-area`, `unknown-grade`, `unknown-level`, `numbering`, `duplicate-id`, `area-empty` | Überschrift nicht `#### HPG-<BEREICH>-<NNN> · <Grad> · <Stufe>`; Nummern nicht lückenlos |
| `keyword-mismatch`, `missing-procedure`, `procedure-without-expectation`, `missing-basis`, `unknown-source`, `basis-without-source`, `vendor-name` | wie in Teil 0/3: Schlüsselwort, Prüfverfahren mit „Erwartetes Ergebnis“, Grundlage mit Quelle, keine Herstellernamen |
| `dangling-reference`, `dangling-anchor`, `stale-anchor`, `dangling-teil0-reference`, `stale-teil0-anchor` | Querverweise auf `HPG-…` und auf `HP-…` in Teil 0 (Teil 0 mit `check-spec.mjs` geparst) |
| `version-mismatch` | Kopfzeilen der vier Teile nennen verschiedene Version oder Status |
| `change-numbering`, `change-date`, `change-type`, `change-class`, `change-status`, `change-file-missing` | Änderungsverzeichnis 3.5: `HPC-0001…` lückenlos, gültige Typen/Klassen/Status, Antragsdatei vorhanden |
| `contributors-state` | Beitragendenverzeichnis ohne Stand der Patentzusage |
| `ipr-register` | eine Organisation aus den Quellen der Teile 0, 1, 3 fehlt im Fremdrechte-Register (HPG-LIC-005) |
| `registry-json`, `registry-field`, `registry-status`, `registry-duplicate`, `registry-uri`, `registry-component-name`, `kennung-pattern`, `reserved-kennung`, `extension-adopted-without-change` | `02-registry.json` ungültig (HPG-REG-002/004, HPG-EXT-001/002/007, HPG-NS-004) |
| `registry-table-missing-row`, `registry-table-extra-row`, `registry-table-mismatch` | Tabellen 8.3–8.5 nicht synchron mit der Registry (HPG-REG-001) |
| `namespace-pattern` | eine `https://hpro.example…`-URI in Teilen, Registry, Beispielen oder Kern folgt nicht den Mustern aus 5.1 (HPG-NS-001) |
| `example-findings` | gültiges Beispiel hat Fehler/Warnung; ungültiges Beispiel liefert andere Befunde als Tabelle 7.4 |
| `table-*`, `summary-*` | Konformitätstabelle 11.1 bzw. Summen 11.2 stimmen nicht mit den Anforderungen überein |
| `unused-source` (Warnung) | Quelle in Abschnitt 12 wird nirgends zitiert |

Der Selbsttest ([03-selftest.txt](03-selftest.txt)) verändert Teil 2, die Registry, Teil 0/3 und
die Beispielbefunde auf 37 Arten und erwartet jeweils den passenden Fehlercode: 37 von 37 erkannt.

## Erweiterungsprüfer ([`check-erweiterung.mjs`](../../../scripts/check-erweiterung.mjs))

Teilprüfer für die Erweiterungs- und Namensregeln (Teil 1: HPR-VERS-002/003/004/005, HPR-META-011,
HPR-CONT-020; Teil 2: HPG-EXT-003 als Warnung, HPG-EXT-006 als Hinweis). Er liest den Container mit
der Referenzimplementierung, prüft `manifest.json#extensions`, Dateien unter `ext/`, `data-*`-Attribute
und Custom-Element-Namen in XHTML/SVG, `--*`-Variablen und externe `url()`/`@import` in CSS, Manifest-
Schlüssel und Sperrregeln. Ausgabe wie der Befundkatalog (Regel, Klasse, Ort, Meldung), Exit 0 nur ohne
Fehler. Der vollständige Prüfer gegen den gesamten Katalog ist Paket S3.

## Nicht geprüft (mit Grund)

- **Prüfverfahren, die eine veröffentlichte Fassung, ein Lesesystem oder einen Bearbeiter voraussetzen**
  (HPG-LIC-001/003 im Endzustand, HPG-GOV-002/003/005/006, HPG-VER-002/003/006/007/008, HPG-NS-003/006/007,
  HPG-EXT-004, HPG-REG-005): Werkzeuge entstehen in P4 ff.; Fassung 0.1 ist Arbeitsentwurf.
- **Lizenzentscheidung und Patentzusage:** Vorschlag; Entscheidung des Herausgebers (P14). Keine Rechtsprüfung.
- **ISO-Seiten und ETSI-IPR-Seite:** 403 bei automatisiertem Abruf; Inhalte aus Suchtreffern bzw. der
  bereits in docs/05 ausgewerteten Norm. OWFa-Originalseite 404, Text über Lizenzdatenbank gelesen.
  Verfahren einer nationalen ISO-Einreichung (Austrian Standards) nicht geprüft (404).
- **Fremde Signaturwerkzeuge** (DigiDoc, RTR-Prüfdienst, DSS-Demo) mit `.asice` und EPUB-`mimetype`:
  kein Upload an externe Dienste ohne Freigabe (wie docs/05 §7).
- **Domäne und Marke:** Verfügbarkeit einer Basis-Domäne und Markenfreiheit von „hpro“ nicht geprüft.
