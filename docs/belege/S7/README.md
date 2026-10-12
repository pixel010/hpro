# Belege S7 – Umsetzer-Handbuch und Autorenleitfaden

**Stand:** 12.10.2026 · **Erzeugt mit:** [`scripts/belege-s7.sh`](../../../scripts/belege-s7.sh)
(wörtliche Ausgaben mit Exit-Code; ein Lauf dauert rund 20 Minuten, davon etwa die Hälfte JVM-Starts von epubcheck und DSS)
**Gegenstand:** [`docs/spezifikation/04-umsetzer-handbuch.md`](../../spezifikation/04-umsetzer-handbuch.md) (Teil 4) und
[`05-autorenleitfaden.md`](../../spezifikation/05-autorenleitfaden.md) (Teil 5); Beispielquellen
[`docs/spezifikation/beispiele/s7-bericht/`](../../spezifikation/beispiele/s7-bericht/),
[`s7-lebendig/`](../../spezifikation/beispiele/s7-lebendig/), [`s7-buero/`](../../spezifikation/beispiele/s7-buero/);
Bauskripte [`scripts/s7-beispiele.mjs`](../../../scripts/s7-beispiele.mjs), [`scripts/s7-lib.mjs`](../../../scripts/s7-lib.mjs),
Referenzkonverter [`scripts/s7-fodt2hpro.mjs`](../../../scripts/s7-fodt2hpro.mjs)
**Prüfer der Dokumentation:** [`scripts/check-handbuch.mjs`](../../../scripts/check-handbuch.mjs) (`npm run hb:check`, läuft in
`npm test`), Selbsttest [`scripts/check-handbuch-selftest.mjs`](../../../scripts/check-handbuch-selftest.mjs)
**Prüfbericht (Fragen eines fremden Entwicklers):** [pruefbericht.md](pruefbericht.md)

Werkzeuge ([00-werkzeuge.txt](00-werkzeuge.txt)): Node 26.5.1, Python 3.13.5, Temurin JDK 21.0.12.1+1, epubcheck 5.4.0,
EU DSS 6.5 über [`prototyp/dss`](../../../prototyp/dss/) (Gegenprobe), Referenzimplementierung `@hpro/kern`.

## Abnahmekriterien

| # | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| 1 | `docs/spezifikation/04-umsetzer-handbuch.md` und `05-autorenleitfaden.md` liegen vor | **erfüllt:** Teil 4 mit 12 Kapiteln (Container, Inhalt, Adressierung, Fassungen, Sandbox, Sperren, Signaturen, Erzeugen, Lesesysteme, Prüfen, offene Punkte), Teil 5 mit 8 Kapiteln (Mindestprofil als Anforderungsliste, Zuordnung an einer Quelle aus der Textverarbeitung, Anleitung für Exportfilter, für CMS, über das Mindestprofil hinaus, Prüfen, häufige Fehler) | Dokumente; Zeilenzahlen in [00-werkzeuge.txt](00-werkzeuge.txt) |
| 2 | Jedes Kapitel enthält mindestens ein vollständiges, nachvollziehbares Beispiel (Datei oder Ausschnitt plus Befehlsausgabe) | **erfüllt, mechanisch geprüft:** `check-handbuch.mjs` verlangt je `##`-Kapitel mindestens einen Befehlsblock (`$ …` mit Ausgabe) und einen Datei-/Ausschnittblock; jeder Befehlsblock muss wörtlich in einer Datei dieses Verzeichnisses stehen (`…` für ausgelassene Zeilen), jeder mit `aus:<pfad>` markierte Ausschnitt wörtlich in der Quelldatei. Teil 4: 61 Codeblöcke, davon 41 Befehlsausgaben; Teil 5: 21 Codeblöcke, davon 11 Befehlsausgaben; 0 Abweichungen | [11-npm-test.txt](11-npm-test.txt) (`hb:check`), alle `NN-*.txt` |
| 3 | Mindestprofil als Anforderungsliste, belegt mit einem Beispiel aus einer Textverarbeitung | **erfüllt:** Teil 5, Kapitel 2.2 (22 Zeilen mit Anforderung und Prüferregel); Quelle [`angebot.fodt`](../../spezifikation/beispiele/s7-buero/angebot.fodt) ist ein Flat-XML-ODF-Textdokument mit Standardvorlagen, Listen, Tabelle mit Kopfzeile und Spannen, drei Bildern, Fuß- und Endnote, Textmarken, Quer-, Seiten- und Hyperlink; der Referenzkonverter erzeugt daraus `s7-buero.hpro` mit `subset` und `source`; Konformitätsprüfer 0 Fehler, 0 Warnungen (Basis `unbestimmt` nur wegen Rendering-Regeln), epubcheck 0 Fehler; zwei Läufe byteidentisch (HP-MIN-004, HP-CONT-014); Zuordnung Zeile für Zeile in Teil 5, Kapitel 3.3 | [01-beispiele-bauen.txt](01-beispiele-bauen.txt), [02-container.txt](02-container.txt), [03-pruefer.txt](03-pruefer.txt), [09-endung.txt](09-endung.txt), [container/s7-buero.hpro](container/s7-buero.hpro) |
| 4 | Die Dokumentation nennt für jede Aussage die normative Anforderung | **erfüllt, mechanisch geprüft:** jeder Absatz, Listenpunkt und jede Tabellenzeile außerhalb von Abschnitten mit „(informativ)“ muss eine Kennung `HP-…`/`HPR-…`/`HPL-…`/`HPG-…`/`HPF-…` oder einen Abschnitt „Teil N, Abschnitt X.Y“ nennen; jede Kennung muss in den Teilen 0–3 existieren, jeder Abschnitt in dem genannten Teil. Teil 4: 243 Aussagen, 359 Nennungen; Teil 5: 151 Aussagen, 279 Nennungen; 0 Verstöße. Der Selbsttest erkennt 9 von 9 absichtlich kaputten Varianten | [11-npm-test.txt](11-npm-test.txt) (`hb:check`, `hb:selftest`) |
| 5 | Ein Prüfbericht hält fest, welche Fragen ein fremder Entwickler noch hätte; offene Punkte behoben oder notiert | **erfüllt:** unbeteiligter Prüfer (frischer Agent, Rolle Entwickler mit Java/.NET-Hintergrund, nur die Dokumente) lieferte 38 Fragen; dazu 8 Befunde aus dem Bau der Beispiele; alle 46 einzeln entschieden: 27 im Handbuch beantwortet, 2 im Kern behoben, 2 als Änderungsantrag eingereicht (HPC-0003, HPC-0004), 14 bewusst offen mit Begründung, 1 durch den Laufabschluss erledigt; 12 Rückmeldungen an die Spezifikation gesammelt | [pruefbericht.md](pruefbericht.md), [`aenderungen/HPC-0003.md`](../../spezifikation/aenderungen/HPC-0003.md), [`HPC-0004.md`](../../spezifikation/aenderungen/HPC-0004.md) |

## Dateien

| Datei | Inhalt |
|---|---|
| [00-werkzeuge.txt](00-werkzeuge.txt) | Versionen, Umfang der Dokumente und Skripte |
| [01-beispiele-bauen.txt](01-beispiele-bauen.txt) | fünf Container zweimal gebaut und mit `cmp` verglichen; Konverter zweimal auf dieselbe Quelle |
| [02-container.txt](02-container.txt) | `hpro inspect`, ZIP-Einträge mit Python, erste 64 Bytes, `container.xml`, `package.opf`, `manifest.json`, Navigationsdokument; Manifeste des lebendigen und des Fassungsbeispiels; Inhaltsdokument des Mindestprofils |
| [03-pruefer.txt](03-pruefer.txt) | `hpro-check` auf allen unsignierten Beispielen (mit epubcheck), JSON-Berichte unter [berichte/](berichte/); Versuche zu HPC-0003 (`linear="no"`) und HPC-0004 (`window.parent`); Schlecht- und Gutfälle der Testsuite für Teil 5 und Kapitel 7 |
| [04-signieren.txt](04-signieren.txt) | Schlüssel (Demonstration), Signatur der Hauptfassung, Gegenzeichnung, Signatur der eingefrorenen Fassung mit `--only`, `signatures.xml` (Struktur), ODF-Manifest, kein privater Schlüssel |
| [05-pruefer-signiert.txt](05-pruefer-signiert.txt) | `hpro-check` auf den signierten Dateien mit und ohne Vertrauensanker |
| [06-dss.txt](06-dss.txt) | EU DSS 6.5 mit hpro-Richtlinie und mit Standardrichtlinie |
| [07-manipulation.txt](07-manipulation.txt) | Änderung nach der Signatur (Kern, DSS, Prüfer), ergänzte Anmerkung, Hauptfassung bearbeitet, Fassung manipuliert |
| [08-lesesystem.txt](08-lesesystem.txt) | minimaler Leser des Prüfsteins auf Beispiel, veränderter und ergänzter Datei, `.bin`-Kopie |
| [09-endung.txt](09-endung.txt) | `.hpro` gegen `.epub` (cmp), epubcheck auf drei `.epub`-Kopien und Verweigerung bei `.hpro` |
| [10-messung.txt](10-messung.txt) | Laufzeiten und Dateigrößen |
| [11-npm-test.txt](11-npm-test.txt) | `npm ci && npm test` |
| [container/](container/) | alle gebauten, signierten und manipulierten Container; Zertifikate der Testunterzeichner (nur öffentlich) |
| [berichte/](berichte/) | JSON-Prüfberichte nach Teil 1, Abschnitt 4.3 |

## Ergebnisse in Kürze

| Beispiel | Prüfer (Teil 1) | epubcheck 5.4.0 | DSS 6.5 |
|---|---|---|---|
| `s7-bericht` (Basis, static, mit PDF-Anhang) | 0 Fehler, 0 Warnungen, Basis `unbestimmt` (4 Rendering-Regeln) | 0 Fehler, 0 Warnungen | – |
| `s7-lebendig` (interactive, Komponente, Datendatei mit Schema, Erweiterung) | 0 Fehler, 0 Warnungen, Basis/Lebendig `unbestimmt` | 0 Fehler, 0 Warnungen | – |
| `s7-buero` (Mindestprofil aus Flat-ODF) | 0 Fehler, 0 Warnungen, Basis `unbestimmt` | 0 Fehler, 0 Warnungen | – |
| `s7-signiert` (signed, XAdES-B RSA 3072) | 0 Fehler, 1 Warnung (kein Zeitstempel), Signiert `unbestimmt`; mit Anker Signatur `TOTAL_PASSED` | 0 Fehler, 0 Warnungen (als `.epub`) | `TOTAL_PASSED`, alle elf Formatprüfungen OK |
| `s7-signiert-2sig` (Gegenzeichnung ECDSA P-256) | 0 Fehler, 2 Warnungen; 2 × `TOTAL_PASSED` | 0 Fehler, 0 Warnungen | je Anker `TOTAL_PASSED` |
| `s7-fassungen-signiert` (lebendige Hauptfassung, signierte eingefrorene Fassung) | 0 Fehler, 1 Warnung, 8 Hinweise (unsignierte Hauptfassung) | `RSC-011` (offener Punkt HPC-0003) | `TOTAL_PASSED`, Warnung „Not all files are signed“ |
| `s7-signiert-manipuliert` | HPR-CONT-016, HPR-SIG-015: nicht bestanden | – | `TOTAL_FAILED / HASH_FAILURE` |
| `s7-fassungen-manipuliert` | – (Kern: `TOTAL_FAILED / HASH_FAILURE` an der Fassungsdatei) | – | – |

Messungen ([10-messung.txt](10-messung.txt), Rechner geteilt, Lastmittel über 5): Beispiele bauen 1,3 s; Konverter 0,9 s;
Signieren mit Rücklesen 1,0 s; Signaturprüfung zweier Signaturen 0,9 s; `hpro-check` ohne epubcheck 1,1 s, mit
epubcheck 37 s (JVM-Start); minimaler Leser 0,5 s. Container 6–15 kB.

## Änderungen außerhalb der Dokumentation

- `kern/src/manifest.ts`: `accessModeSufficient` wird in `manifest.json` als Liste von Listen geschrieben (Teil 1,
  HPR-META-008); `package.opf` bleibt kommagetrennt. Neue Export-Funktion `manifestAccessibility`.
- `kern/src/ocf.ts`: generiertes Navigationsdokument trägt `h1 id="toc-h"` (HP-ADR-001). Beide Änderungen sind im
  Prüfbericht als Befund 44 und 45 geführt; `npm test` (Kern 291 Tests) grün.
- `docs/spezifikation/02-lizenz-und-governance.md`, Abschnitt 3.5: Änderungsanträge HPC-0003 und HPC-0004 eingetragen;
  `gov:check` grün.
- `docs/spezifikation/00-spezifikation.md`, Kopf: Verweis auf Teil 4 und 5 (informativ).
- `package.json`: `hb:check`, `hb:selftest`, `hb:beispiele`; `npm test` schließt die Handbuchprüfung ein.

## Nicht geprüft (mit Grund)

- **Rendering, Sandbox-Laufzeit, Druck, alle Lesesystemregeln (`HPL-…`)**: es gibt noch kein Lesesystem (Pakete P4 ff.);
  die CSP- und Rahmen-Skizze in Teil 4, Kapitel 6.4 ist beschrieben, nicht gerendert.
- **Komponente `x-baubuero-aufmass` im Browser**: nur statisch geprüft (HPR-SBX-016/017 ohne Befund); ob sie im
  Datenkanal eines Lesesystems richtig arbeitet, ist ohne Lesesystem nicht prüfbar.
- **Zeitstempel (B-T) und Langzeitniveaus (LT/LTA)**: kein Zeitstempeldienst angebunden (Paket P10); alle Signaturen sind
  XAdES-BASELINE-B, der Prüfer warnt mit HPR-SIG-012.
- **OOXML-Quellen**: der Referenzkonverter deckt nur Flat-ODF ab; die OOXML-Spalte der Tabelle 15.2 ist in Teil 5,
  Kapitel 3.4 beschrieben, aber nicht an einer Word-Datei erprobt. Eine mit LibreOffice gespeicherte `.fodt` wurde
  nicht geprüft (keine Textverarbeitung im Arbeitsverzeichnis); die Quelle ist nach ODF 1.3 von Hand geschrieben.
- **Fremde Validatoren und EPUB-Lesesysteme** außer epubcheck und DSS: wie in docs/05, Abschnitt 7.
- **Gegenzeichnung byteidentisch über Läufe**: ECDSA ist randomisiert; die Belege zur Gegenzeichnung ändern sich je
  Lauf, die RSA-Signaturen nicht (Schlüssel werden ab dem zweiten Lauf wiederverwendet, siehe Skript).
