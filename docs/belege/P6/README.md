# Belege P6 – Formulare mit Berechnung, Bedingung und Validierung

**Stand:** 12.10.2026 · **Erzeugt mit:** [`scripts/belege-p6.sh`](../../../scripts/belege-p6.sh)
(wörtliche Ausgaben der Prüfbefehle in den Dateien `00` … `11`).

Ziel aus [docs/08](../../08-arbeitsplan.md): Felder anlegen und ausfüllen, Berechnungen, bedingte
Abschnitte, Validierung vor dem Absenden, Datenexport (JSON) und PDF der ausgefüllten Fassung —
der Randfall aus [docs/07, Abschnitt 3d](../../07-foren-und-nutzererwartungen.md) („Finanzformular
an Hunderte Kunden: Berechnungen, bedingte Abschnitte, Validierung vor dem Absenden“) **mit
Web-Standardmitteln**: HTML-Formular, OpenFormula, JSON Schema. Kein Skript im Dokument, kein
Netz, keine Acrobat-API.

## Abnahmekriterien

| # | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| 1 | Tests decken Berechnung, Bedingung und Validierungsfehler ab | **erfüllt** – 14 Kern-Tests (Berechnung in Abhängigkeitsreihenfolge, Tausenderpunkte, Tabellenbezüge, Zirkel/`#NAME?`/`#DIV/0!`; Bedingungen samt Verschachtelung; Typ-, Pflicht-, `pattern`-, E-Mail-, `min`/`max`-, Längen-, Auswahl-, Prüfregel- und Schemafehler; Absenden abgelehnt/angenommen; Export; eingefrorene Fassung), dazu 4 Reader-Unit-Tests und 5 Browser-Tests; zusätzlich Gegenprobe aller Rechenergebnisse, Bedingungen und Prüfregeln in LibreOffice: 36 von 36 Werten gleich | [`01-kern-tests.txt`](01-kern-tests.txt), [`08-reader.txt`](08-reader.txt), [`04-gegenprobe-libreoffice.txt`](04-gegenprobe-libreoffice.txt) |
| 2 | Ein Beispielformular (Finanz-/Antragsformular) liegt als Container in docs/belege/ | **erfüllt** – „Finanzierungsanfrage Wohnungskauf – Selbstauskunft“ (40 Felder, davon 8 berechnet, 3 bedingte Abschnitte, 7 Prüfregeln, JSON-Schema) leer, als Entwurf, abgesendet, als signierte eingefrorene Fassung und wie der Reader es absendet; epubcheck 5.4.0: 0 Fehler, 0 Warnungen (außer dem bekannten RSC-011 der eingefrorenen Fassung, s. u.) | [`container/`](container/), [`02-abnahme-kommandozeile.txt`](02-abnahme-kommandozeile.txt), [`05-epubcheck.txt`](05-epubcheck.txt) |
| 3 | Datenexport ist schema-geprüft; ohne gültige Eingaben kein Absenden | **erfüllt** – Absenden mit Fehlern wird abgelehnt (Kommandozeile Exit 1, keine Datei; Reader: Zusammenfassung, kein Download); Export und Absenden prüfen gegen `data/antrag.schema.json`; 13 Datenobjekte von Kern und **python-jsonschema** (unabhängig) gleich beurteilt; Export bei unbrauchbarem Schema abgelehnt | [`02-abnahme-kommandozeile.txt`](02-abnahme-kommandozeile.txt), [`03-abnahme3-schema.txt`](03-abnahme3-schema.txt), [`08-reader.txt`](08-reader.txt) |

## Was gebaut wurde

**Format (Vorschlag [HPC-0009](../../spezifikation/aenderungen/HPC-0009.md)).** Ein Formular ist
gewöhnliches HTML; die Logik ist Daten, kein Code:

```html
<form id="antrag" action="#" data-hp-form="data/antrag.json">
  <input id="f-kaufpreis" name="kaufpreis" type="text" inputmode="decimal" required="required" data-hp-type="currency" data-hp-unit="EUR"/>
  <output id="f-rate" name="monatsrate" data-hp-formula="=IF(OR(finanzierungsbedarf&lt;=0;laufzeit_jahre&lt;1);0;ROUND(PMT(zinssatz/12;laufzeit_jahre*12;-finanzierungsbedarf);2))"
          data-hp-type="currency" data-hp-unit="EUR" data-hp-value="1787.23">1.787,23 €</output>
  <fieldset id="mitantragsteller" data-hp-when="=mitantrag"> … </fieldset>
  <p id="pruefung-eigenmittel" data-hp-check="=eigenmittelquote&gt;=0.2" data-hp-check-message="Mindestens 20 % …">…</p>
</form>
```

- **Berechnung:** OpenFormula im Teilumfang von Teil 3; Feldnamen sind *benannte Ausdrücke*
  ([Q1] §5.11) — keine eigene Formelsprache. Formel und Wert stehen beide im Dokument.
- **Bedingung:** `data-hp-when`; ein nicht geltender Abschnitt zählt in Formeln als leer, ist in den
  Daten `null` und wird nicht geprüft. Im gespeicherten Markup bleibt er sichtbar (HP-NEST-001:
  ohne Rechner bleibt das ganze Formular lesbar); der Reader blendet ihn aus, die eingefrorene
  Fassung und der Druck ersetzen ihn durch einen Hinweis.
- **Validierung:** HTML-Einschränkungen mit ihrer HTML-Bedeutung (`required`, `pattern` mit Flag
  `v`, `minlength`, `maxlength`, `min`/`max`, E-Mail), Typprüfung der Eingabe, Prüfregeln über
  mehrere Felder (`data-hp-check`), JSON-Schema des Datenobjekts (Draft 2020-12, mit `if`/`then`
  für bedingte Pflichtangaben).
- **Daten:** `data/antrag.json` = `{ form, document, status, submittedAt?, values }`, verzeichnet in
  `manifest.json#data` mit Schema. Ein Entwurf speichert ungültige Eingaben als `null`; die Eingabe
  bleibt im Formular stehen. Absenden setzt `status: "submitted"`.

**Kern** ([`kern/src/form/`](../../../kern/src/form/)): `FormDocument` (lesen, rechnen,
Bedingungen, Prüfen, Datenobjekt, ins Markup schreiben), `fillForms` / `exportFormData` /
`inspectForms` auf Containern, `freezeForms` (statische Form für eingefrorene Fassung und Druck);
Parser und Auswerter des Rechners kennen benannte Ausdrücke nur mit `{ names: true }`
(Tabellenformeln unverändert). Kommandozeile `hpro form show|check|fill|submit|export`.
`package.opf` erhält für Dokumente mit Formular die EPUB-Eigenschaft `scripted` (epubcheck OPF-014).

**Reader** ([`app/src/formview.ts`](../../../app/src/formview.ts), Rahmen-Agent): wie beim
Tabellenrechner (P19) rechnet die Hülle mit dem Kern, nie der Dokumentrahmen; der Agent meldet
Eingaben und zeigt Ergebnisse. Meldungen am Feld nach dem Verlassen (`aria-invalid`,
`aria-describedby`), Zusammenfassung mit Verweisen und Fokus bei abgelehntem Absenden, Knöpfe
„Eingaben prüfen“, „Entwurf speichern“, „Daten exportieren (JSON)“, „Absenden“. Absenden lädt die
abgesendete Datei und die Daten herunter und öffnet die abgesendete Datei; „Drucken“ ergibt die
ausgefüllte Fassung (Felder als Text). Die Sandbox hat kein `allow-forms`: aus dem Rahmen wird nie
etwas gesendet.

## Dateien

| Datei | Inhalt |
|---|---|
| [`00-werkzeuge.txt`](00-werkzeuge.txt) | Node, JDK, epubcheck, DSS, python-jsonschema, pypdf, pypdfium2, LibreOffice; Testschlüssel |
| [`01-kern-tests.txt`](01-kern-tests.txt) | Abnahme 1: `node --test kern/build/test/form.test.js` |
| [`02-abnahme-kommandozeile.txt`](02-abnahme-kommandozeile.txt) | Beispiel als Container, leeres Formular (Exit 1), Entwurf mit Fehlern, Absenden abgelehnt (Exit 1, keine Datei), Korrektur, Absenden mit Export, Export byte-gleich mit der Datendatei, Markup, Verlauf |
| [`03-abnahme3-schema.txt`](03-abnahme3-schema.txt) | 13 Datenobjekte: Kern und python-jsonschema; Reader-Export; Export bei kaputtem Schema abgelehnt |
| [`04-gegenprobe-libreoffice.txt`](04-gegenprobe-libreoffice.txt), [`gegenprobe/`](gegenprobe/) | dieselben Formeln mit benannten Bereichen in LibreOffice, Entwurf und abgesendete Fassung |
| [`05-epubcheck.txt`](05-epubcheck.txt) | epubcheck 5.4.0 über alle Container |
| [`06-hpro-check.txt`](06-hpro-check.txt) | Konformitätsprüfer über alle Container |
| [`07-eingefroren-dss.txt`](07-eingefroren-dss.txt) | signierte eingefrorene Fassung des abgesendeten Antrags, EU DSS 6.5, Manipulation, Weiterbearbeiten der Hauptfassung |
| [`08-reader.txt`](08-reader.txt) | vitest, Playwright `formulare.spec.ts`, Beleglauf `p6-belege.spec.ts` |
| [`09-pdf.txt`](09-pdf.txt) | PDF der ausgefüllten Fassung: A4, jede Angabe als Text, Status, Hinweise; Seitenbilder |
| [`10-messungen.txt`](10-messungen.txt), [`messungen-reader.json`](messungen-reader.json) | Zeiten im Kern und im Reader, Größen, waagrechtes Scrollen, Netzwerk |
| [`11-npm-test.txt`](11-npm-test.txt) | `npm ci` und `npm test` über das ganze Repo, wie der Läufer |
| [`container/`](container/) | `antrag-leer.hpro` (das Beispielformular), `antrag-entwurf.hpro`, `antrag-abgesendet.hpro` + `.json`, `antrag-nachweis.hpro` (signierte eingefrorene Fassung, Zertifikat `sig-cert.pem`), `reader-abgesendet.hpro` + `reader-antrag.json` (vom Reader abgesendet), `antrag-ausgefuellt.pdf` + Druckdokument |
| [`screenshots/`](screenshots/) | Telefon und Desktop: leer, Absenden abgelehnt, Prüfregel nicht erfüllt, ausgefüllt, abgesendet; PDF-Seiten |
| [`eingaben/`](eingaben/) | Eingaben der Kommandozeilen-Läufe |

## Ergebnisse

Alle Zahlen stammen aus dem letzten Lauf von `scripts/belege-p6.sh` (12.10.2026).

- **Kern-Tests** (`01`): 14 von 14 bestanden, 0 fehlgeschlagen.
- **Kommandozeile** (`02`): das leere Formular fällt bei `hpro form check` durch (Exit 1). Der
  Entwurf mit Fehlern wird gespeichert, Absenden lehnt ihn ab (Exit 1), und
  `nicht-geschrieben.hpro` entsteht nicht (`ls` Exit 2). Nach der Korrektur ist Absenden und
  Export erfolgreich (Exit 0). Ein erneuter Export ist mit `cmp` byte-gleich mit dem Export beim
  Absenden und mit `data/antrag.json`.
- **Schema** (`03`): 13 Datenobjekte, davon 0 falsch beurteilt, sowohl vom Kern als auch von
  python-jsonschema 4.26.0 (Draft 2020-12). Auch der Export aus dem Reader ist gültig. Mit
  unbrauchbarem Schema wird der Export abgelehnt (Exit 1), es entsteht keine Datei.
- **LibreOffice-Gegenprobe** (`04`): 36 von 36 Werten sind gleich (berechnete Felder,
  Bedingungen, Prüfregeln; Entwurf und abgesendete Fassung).
- **epubcheck 5.4.0** (`05`): leer, Entwurf, abgesendet und vom Reader abgesendet haben je
  0 Fehler und 0 Warnungen. `antrag-nachweis.hpro` hat 3 Fehler, alle RSC-011 in
  `renditions/nachweis-antrag/content/nav.xhtml` (bekannt, HPC-0003, s. u.). Das RSC-005 eines
  früheren Zwischenstands ist behoben: `label for` auf eingefrorene Felder wird entfernt
  (`kern/src/form/freeze.ts`).
- **hpro-check** (`06`): leer, Entwurf, abgesendet und Reader-Fassung haben 0 Fehler und
  0 Warnungen; 4 Regeln sind nicht geprüft, daher „unbestimmt“. Beim Nachweis gibt es 1 Fehler
  (HPR-CONT-024 = das RSC-011 oben) und 1 Warnung (HPR-SIG-012: kein Zeitstempel, Niveau B).
- **Signatur** (`07`): `hpro lock frozen-check` meldet „gültig signiert“, EU DSS 6.5
  `TOTAL_PASSED`. Nach Manipulation: `TOTAL_FAILED / HASH_FAILURE` in beiden Prüfungen. Die
  Hauptfassung bleibt nach dem Einfrieren ausfüllbar, und die Signatur der eingefrorenen Fassung
  bleibt gültig.
- **Reader** (`08`): vitest 4 von 4, Playwright `formulare.spec.ts` 5 von 5, Beleglauf 3 von 3.
- **PDF** (`09`): A4, 5 Seiten. Alle erwarteten Angaben stehen als Text darin; keine
  Fehlermeldungen, keine Bedienknöpfe.
- **Messungen** (`10`): eine Eingabe (rechnen, Bedingungen, Prüfregeln) braucht im Kern im Median
  0,11 ms. Absenden mit Schemaprüfung braucht im Median 23 ms, im Reader vom Tab bis zur
  geänderten Monatsrate im Rahmen im Median 62 ms. Bei 390, 820 und 1440 px gibt es kein
  waagrechtes Scrollen. Während der Bildschirmfotos gab es 0 Netzwerkanfragen außerhalb des
  Readers.
- **npm ci / npm test** (`11`): beide mit Exit 0. Kern (node:test): 531 bestanden, 0
  fehlgeschlagen; App vitest: 45 von 45; Playwright: 63 bestanden. Vorher und nachher lief kein
  liegengebliebener `vite preview`- oder node_modules-Prozess.

## Nicht geprüft

- **Excel** als zweite Gegenprobe: nicht geprüft, kein Excel in der Umgebung (nur LibreOffice 26.8).
- **Firefox und WebKit:** Browser-Tests und PDF nur mit Chromium (Playwright `chromium-headless-shell`);
  die Cross-Engine-Suite ist Paket P13.
- **Bildschirmleser:** nur axe-core (keine schweren Befunde auf dem Formular mit Meldungen), kein
  Test mit NVDA, VoiceOver oder Orca.
- **Datumsfelder:** das native Datumsfeld zeigt im Headless-Chromium das Muster `mm/dd/yyyy`; die
  Anzeige folgt der Sprache des Browsers, nicht des Dokuments — nicht weiter untersucht.
- **Übernahme aus PDF-Formularen** (AcroForm, XFA), Wiederholgruppen, Mehrfachauswahl,
  Datei-Anhänge als Feld: nicht Teil von P6 (offene Punkte in HPC-0009).
- **Echte Zeitstempel und qualifizierte Signatur:** die eingefrorene Fassung ist mit einem
  selbstsignierten Testschlüssel signiert (XAdES-BASELINE-B, wie P3/P5/P17).

## Bekannte Befunde, nicht aus P6

- **epubcheck RSC-011** in `renditions/<id>/content/nav.xhtml` jeder eingefrorenen Fassung (auch
  in P5 und P17): Verweise auf Dokumente, die nicht im Spine stehen; Änderungsantrag HPC-0003 ist in
  Frist, nicht umgesetzt. Daraus folgt der Prüferbefund HPR-CONT-024 für `antrag-nachweis.hpro`.
- **hpro-check „unbestimmt“** (Exit 3) für Basis/Lebendig: vier Regeln brauchen eine Browser-Engine
  im Prüfer (HPR-INH-004/006/022) bzw. eine Begriffsliste (HPR-LOCK-005) — wie bei allen Paketen.

## Wiederholen

```sh
scripts/belege-p6.sh            # alles, auch npm ci und npm test (rund 15 Minuten)
P6_OHNE_NPM=1 scripts/belege-p6.sh   # ohne den Läufer-Teil
```
