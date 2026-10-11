# html-Pro 0.1 – Spezifikation (Teil 2: Lizenz, Governance, Namensraum und Registry)

**Status:** Arbeitsentwurf 0.1 · **Stand:** 11.10.2026 · **Paket:** S4 aus [`docs/08-arbeitsplan.md`](../08-arbeitsplan.md)
**Grundlage:** [Teil 0 (Kern)](00-spezifikation.md), [Teil 1 (Konformität)](01-konformitaet.md), [Teil 3 (Tabellen und Formeln)](03-tabellen-und-formeln.md); [`docs/10-anspruch-und-funktionsprofil.md`](../10-anspruch-und-funktionsprofil.md) Abschnitt 4 (verbindlich)
**Mechanische Prüfung dieses Teils:** [`scripts/check-governance.mjs`](../../scripts/check-governance.mjs) (läuft in `npm test`), Belege in [`docs/belege/S4/`](../belege/S4/README.md)
**Maschinenlesbare Registry:** [`02-registry.json`](02-registry.json) (Gleichstand mit Abschnitt 8 wird geprüft)
**Erweiterungsprüfer:** [`scripts/check-erweiterung.mjs`](../../scripts/check-erweiterung.mjs) (Teilprüfer für Abschnitt 7; der vollständige Prüfer ist Paket S3)
**Lizenz dieses Dokuments:** Vorschlag CC-BY-4.0 (Abschnitt 2); die Entscheidung des Herausgebers steht aus, bis dahin alle Rechte vorbehalten

---

## 0. Zweck und Geltungsbereich

Teil 0 sagt, was eine Datei ist, Teil 1, wie man das prüft, Teil 3, wie gerechnet wird. Dieser Teil
sagt, **wem der Standard gehört und wie er sich ändert**: unter welcher Lizenz Spezifikation,
Referenzimplementierung und Testsuite stehen, wer Änderungen beschließt, wie Versionen gezählt
werden, welche Namensräume und Dateiendungen gelten, und wie Dritte Erweiterungen und Komponenten
anmelden, ohne dass ein Standardleser daran bricht ([Q1] §4a, §4c).

Er beschreibt den Stand **ehrlich**: Es gibt einen Herausgeber, eine Referenzimplementierung, drei
Spezifikationsteile und noch keinen zweiten Umsetzer. Was für eine Anerkennung bei W3C, OASIS oder
ISO fehlt, steht in Abschnitt 9 als offene Frage; eine solche Anerkennung wird hier nicht
behauptet.

Nicht Gegenstand: Inhalt und Prüfregeln (Teile 0, 1, 3), Werkzeugketten, Oberflächen.

---

## 1. Konventionen

### 1.1 Normative Wörter

Wie in Teil 0 ([Q2], Abschnitt 1.1): **MUSS**, **DARF NICHT**, **SOLL**, **SOLL NICHT**, **KANN**
nach RFC 2119 und RFC 8174 ([Q7]). Jede Anforderung hat genau einen Grad *Muss*, *Soll* oder *Kann*.

### 1.2 Aufbau einer Anforderung

```
#### HPG-<BEREICH>-<NNN> · <Grad> · <Stufe>
<Subjekt> MUSS/SOLL/KANN … (ein beobachtbares Merkmal)

*Prüfverfahren:* … (wie man das Merkmal beobachtet, mit erwartetem Ergebnis)
*Grundlage:* [Qn] … (Fremdgrundlage mit Quelle, oder „eigene Konvention/Festlegung“)
```

Das Präfix `HPG` (Governance) unterscheidet diese Anforderungen von Teil 0 (`HP`), Teil 1 (`HPR`,
`HPL`) und Teil 3 (`HPF`). Bereiche: `LIC` Lizenz und Rechte, `GOV` Governance und
Änderungsverfahren, `VER` Versionsschema, `NS` Namensraum, Media-Type und Dateiendung, `EXT`
Erweiterungen Dritter, `REG` Registry. Die Nummern je Bereich sind lückenlos; eine vergebene Nummer
wird nicht wiederverwendet.

### 1.3 Subjekte und Stufen in diesem Teil

| Subjekt | Kürzel | Bedeutung |
|---|---|---|
| Herausgeber | H | die Person oder Organisation, die den Standard veröffentlicht und Änderungen beschließt (Abschnitt 3.1) |
| Beitragender | B | wer Text, Prüfregeln, Tests oder Code zum Standard beisteuert |
| Registrar | R | wer Registry-Einträge prüft und einträgt (in Phase A der Herausgeber) |
| Anbieter | A | wer eine Erweiterung oder Komponente Dritter veröffentlicht |
| Dokument, Erzeuger, Lesesystem, Prüfer | D, E, L, P | wie in Teil 0 |

Die Stufe ist für alle Anforderungen dieses Teils **Basis**: Sie gelten für den Standard als
Ganzes bzw. für jedes Dokument und jedes Lesesystem, unabhängig von Profil und Signatur. Die
Spalte bleibt erhalten, damit alle Teile dieselbe Form haben und derselbe Prüfer sie liest.

### 1.4 Begriffe

| Begriff | Bedeutung |
|---|---|
| Pflichtteil | jede Muss-Anforderung der Teile 0, 1, 3 und dieses Teils samt den dafür nötigen Formaten und Schlüsseln |
| Referenzimplementierung | `kern/` (`@html-pro/kern`), die Prüfskripte unter `scripts/` und der Referenz-Reader, sobald vorhanden |
| Testsuite | die Prüf- und Beispieldokumente unter `docs/belege/`, `docs/spezifikation/beispiele/` und die Gut-/Schlechtfälle aus Paket S3 |
| Fassung (des Standards) | eine veröffentlichte Version `<major>.<minor>` aller Teile mit Testsuite |
| Änderungsantrag | ein Vorgang `HPC-<NNNN>` nach Abschnitt 3.3 |
| Kennung (Erweiterung) | das `<kennung>` in `x-<kennung>-…` nach [HP-VERS-005](00-spezifikation.md#hp-vers-005--muss--basis) |
| Registry | die Datei [`02-registry.json`](02-registry.json) und die Tabellen in Abschnitt 8 |

---

## 2. Lizenz und Rechte

### 2.1 Grundsätze (aus [Q1] §4a)

1. Royalty-freie Nutzung der Pflichtteile: Wer den Standard umsetzt, zahlt nichts und fragt
   niemanden.
2. Nichts Eigenes, wo ein offener Standard steht: Fremdgrundlagen bleiben bei ihren Urhebern; ihr
   Rechteregime wird offengelegt (2.5), nicht umgedeutet.
3. Keine Anbietersignatur im Pflichtteil: kein Merkmal, das nur ein Hersteller erzeugen oder lesen
   kann; die Referenzimplementierung ist ein Werkzeug, nicht der Standard ([Q1] §3 Punkt 3).
4. Der Name sagt Konformität, nicht Herkunft: „ist html-Pro“ ist an einen Prüfbericht gebunden
   ([HP-VERS-008](00-spezifikation.md#hp-vers-008--kann--basis)), nicht an einen Hersteller.

### 2.2 Lizenzvorschlag

| Gegenstand | Lizenz (SPDX-Kennung, [Q8]) | Warum | Verworfen |
|---|---|---|---|
| Spezifikationstext (Teile 0–3, Umsetzer-Handbuch, Autorenleitfaden) | **CC-BY-4.0** ([Q9]) | erlaubt Kopie, Übersetzung, Einbau in fremde Dokumentation mit Namensnennung; Ableitungen sind erlaubt, damit Umsetzer Auszüge in ihre Handbücher übernehmen können | W3C Document License ([Q29]): verbietet abgeleitete Spezifikationen und ist für W3C-Dokumente gedacht; CC0: ohne Namensnennung ginge die Herkunft verloren |
| Patentzusage für Pflichtteile | **Patentzusage nach dem Muster des W3C Community Final Specification Agreement** ([Q12]) bzw. der OWFa 1.0 ([Q13]); Text in Abschnitt 2.4 | CC-BY-4.0 lizenziert ausdrücklich **keine** Patente ([Q9] §2(b)(2)); eine eigene, royalty-freie Zusage ist nötig; beide Muster binden nur die *eigenen* wesentlichen Ansprüche des Zusagenden, mit Abwehrklausel | FRAND-Zusagen (ETSI-Muster, [Q23]): erlauben Lizenzgebühren und widersprechen [Q1] §4a |
| Referenzimplementierung (`kern/`, `scripts/`, Reader, Prüfer) | **Apache-2.0** ([Q10]) | enthält eine ausdrückliche Patentlizenz mit Abwehrklausel (§3) und erlaubt den Einbau in proprietäre Software (Word, LibreOffice, InDesign, Fachanwendungen, [Q1] §4f) | MIT: keine Patentklausel; GPL/AGPL: hindert den Einbau in fremde Software, den [Q1] §4f ausdrücklich will; MPL-2.0: möglich, aber dateiweises Copyleft erschwert Einbau in Fremdcode |
| Testsuite, Beispiel- und Prüfdokumente, Schemata, Registry | **CC0-1.0** ([Q11]) | jeder Umsetzer soll die Testfälle ohne Hinweispflicht in seine eigene Testsuite kopieren können | CC-BY-4.0: Namensnennung in Testsuiten ist in der Praxis ein Hindernis |
| Schriften in Beispielen | **OFL-1.1** ([Q8]) oder systemeigene Schriften | übliche Lizenz freier Schriften | – |

Die Lizenzwahl ist ein **Vorschlag an den Herausgeber** (Abschnitt 3.1); sie wird mit Paket P14
(„Lizenz festgelegt und im Repo vermerkt“) wirksam. Bis dahin gilt für alle Dateien des
Repositorys: alle Rechte vorbehalten. Die SPDX-Kennungen sind im Lizenzverzeichnis 3.29.0 vorhanden
([Q8], geprüft in [Q33]).

### 2.3 Anforderungen Lizenz

#### HPG-LIC-001 · Muss · Basis
Der Herausgeber MUSS jede veröffentlichte Fassung der Spezifikation (Status „Veröffentlicht“ nach
[HPG-VER-001](#hpg-ver-001--muss--basis)) unter CC-BY-4.0 stellen und die Lizenz in der Kopfzeile
jedes Teils mit SPDX-Kennung nennen.

*Prüfverfahren:* Kopfzeilen aller Teile einer veröffentlichten Fassung lesen; Lizenzdatei
(`LICENSES/CC-BY-4.0.txt` oder `LICENSE`) im Repository vorhanden. Erwartetes Ergebnis: jede
Kopfzeile nennt `CC-BY-4.0`; der Lizenztext liegt bei. Für Arbeitsentwürfe (wie diesen) ist nur
der Vorschlag in der Kopfzeile verlangt.
*Grundlage:* [Q9] CC BY 4.0; [Q8] SPDX; [Q1] §4a (veröffentlichte, versionierte Spezifikation).

#### HPG-LIC-002 · Muss · Basis
Der Herausgeber und jeder Beitragende MÜSSEN vor Aufnahme eines Beitrags in einen Pflichtteil eine
schriftliche, royalty-freie Patentzusage für ihre wesentlichen Ansprüche nach Abschnitt 2.4 abgeben;
das Beitragendenverzeichnis (2.4) MUSS je Beitragenden Name, Datum und Stand der Zusage führen.

*Prüfverfahren:* Für jeden Autor eines Commits, der normativen Text ändert, existiert eine Zeile
im Beitragendenverzeichnis mit Stand `abgegeben`; Zeilen mit Stand `ausstehend` sind nur in
Arbeitsentwürfen zulässig. Erwartetes Ergebnis: in einer veröffentlichten Fassung alle Zeilen
`abgegeben`.
*Grundlage:* [Q12] W3C Community FSA §3.1 (Zusage für Essential Claims, royalty-frei nach §10.7.5); [Q13] OWFa 1.0 §2.1, §3; [Q32] W3C Community CLA §3.1 (Beiträge).

#### HPG-LIC-003 · Muss · Basis
Die Referenzimplementierung MUSS unter Apache-2.0 veröffentlicht werden; jedes Paket (`package.json`)
MUSS das Feld `license` mit dem Wert `Apache-2.0` tragen, sobald der Herausgeber die Lizenz
festgelegt hat.

*Prüfverfahren:* `license`-Feld aller `package.json` im Repository lesen; Datei
`LICENSES/Apache-2.0.txt` oder `LICENSE` vorhanden. Erwartetes Ergebnis: alle Felder `Apache-2.0`;
bis zur Festlegung (P14) ist das Fehlen des Feldes zulässig und wird in [Q33] als „ausstehend“
vermerkt.
*Grundlage:* [Q10] Apache License 2.0 §2 (Urheberrecht), §3 (Patentlizenz mit Abwehrklausel); [Q1] §4b (Referenzimplementierung unter offener Lizenz).

#### HPG-LIC-004 · Muss · Basis
Testsuite, Beispiel- und Prüfdokumente, JSON-Schemata und die Registry MÜSSEN unter CC0-1.0
stehen; eine Datei der Testsuite DARF NICHT Inhalte enthalten, die unter einer anderen Lizenz
stehen (Fremdtexte, Fremdbilder, Fremdschriften außer OFL-1.1).

*Prüfverfahren:* Verzeichnis `docs/spezifikation/beispiele/` und die Prüfdokumente aus S3 auf
Fremdinhalte durchsehen (Bilder, Schriften, längere Zitate); Lizenzvermerk `CC0-1.0` in
`README` bzw. Kopfzeile. Erwartetes Ergebnis: keine Fremdinhalte ohne verträgliche Lizenz; Vermerk
vorhanden.
*Grundlage:* [Q11] CC0 1.0 §2 (Verzicht), §4a (Patente und Marken nicht erfasst); [Q1] §4b (öffentliche Testsuite).

#### HPG-LIC-005 · Muss · Basis
Keine Muss-Anforderung der Teile 0, 1, 3 und dieses Teils DARF von einer Fremdgrundlage abhängen,
deren Rechteregime nicht im Fremdrechte-Register (Abschnitt 2.5) steht; jede Organisation, die in
einer Quelle `[Qn]` der Teile 0, 1 und 3 als Urheber einer Fremdgrundlage genannt ist, MUSS im
Register mit Rechteregime und Quelle stehen.

*Prüfverfahren:* Alle Quellenzeilen `- [Qn] <Organisation>, …` der Teile 0, 1 und 3 sammeln; das
erste Wort der Organisation jeder Zeile muss in der Spalte „Organisation“ des Registers vorkommen
(Zeilen, die mit einem Titel statt einer Organisation beginnen, werden über den Titel zugeordnet);
html-Pro-eigene Dokumente sind ausgenommen. Erwartetes Ergebnis: 0 Organisationen ohne
Registereintrag (mechanisch geprüft, Fehlercode `ipr-register`).
*Grundlage:* [Q1] §4a („Wo fremde Rechte berührt werden könnten, wird das offengelegt“).

#### HPG-LIC-006 · Muss · Basis
Die Spezifikation DARF NICHT eine Technik zum Pflichtteil machen, für die nur eine FRAND- oder
gebührenpflichtige Lizenz bekannt ist; für Grundlagen mit FRAND-Regime (Abschnitt 2.5: ETSI, IETF
ohne RF-Zusage, PKWARE-Patentteile) MUSS die genutzte Teilmenge auf die Teile beschränkt bleiben,
für die keine Ansprüche bekannt sind, und das MUSS im Register vermerkt sein.

*Prüfverfahren:* Registerzeilen mit Regime „FRAND“ oder „gemischt“ tragen in der Spalte „Genutzte
Teilmenge und Einschätzung“ die Angabe, welche Teile html-Pro nutzt und ob Ansprüche bekannt sind.
Erwartetes Ergebnis: jede solche Zeile hat die Angabe; „keine Ansprüche bekannt“ ist eine
Einschätzung des Herausgebers, keine Rechtsauskunft (Abschnitt 10).
*Grundlage:* [Q23] ETSI IPR Policy (FRAND, nicht royalty-frei); [Q24] BCP 79 §7 (IETF ohne RF-Pflicht); [Q35] APPNOTE (Patentvorbehalt für starke Verschlüsselung und Patching).

#### HPG-LIC-007 · Soll · Basis
Der Name „html-Pro“ SOLL nur für Dokumente, Erzeuger und Lesesysteme verwendet werden, die einen
Prüfbericht ohne Fehler nach [HP-VERS-008](00-spezifikation.md#hp-vers-008--kann--basis) vorweisen;
eine abweichende Fassung des Standards (Fork) SOLL NICHT den Namen oder den Namensraum des Standards
führen.

*Prüfverfahren:* Produktangabe „html-Pro“ bzw. `conformsTo` auf den html-Pro-Namensraum nur mit
beigelegtem oder abrufbarem Prüfbericht. Erwartetes Ergebnis: Bericht vorhanden; andernfalls ist die
Angabe eine Bitte des Herausgebers ohne rechtliche Durchsetzung, solange keine Marke eingetragen ist
(Abschnitt 9, Punkt 10).
*Grundlage:* eigene Festlegung; Muster: Namensregeln von W3C ([Q16]: Community-Group-Berichte dürfen nicht wie W3C-Standards aussehen).

### 2.4 Patentzusage und Beitragendenverzeichnis

**Text der Zusage (Vorschlag, deutsch; maßgeblich nach Entscheidung des Herausgebers):**

> Ich sichere jedem, der diese Spezifikation umsetzt, eine unentgeltliche, weltweite, nicht
> ausschließliche, unwiderrufliche Lizenz an allen meinen Patentansprüchen zu, die durch eine
> Umsetzung der Muss-Anforderungen einer veröffentlichten Fassung der Spezifikation „html-Pro“
> notwendig verletzt werden („wesentliche Ansprüche“). Die Lizenz endet gegenüber jedem, der
> seinerseits einen Umsetzer dieser Spezifikation wegen wesentlicher Ansprüche verklagt. Sie
> erfasst keine Ansprüche, die nur durch Erweiterungen Dritter oder durch Soll- und
> Kann-Anforderungen berührt werden, und keine Marken.

Das Muster entspricht in Reichweite (nur wesentliche Ansprüche, royalty-frei, Abwehrklausel) dem
W3C Community Final Specification Agreement ([Q12] §3.1, §10.3, §10.7.5) und der OWFa 1.0 ([Q13]
§2.1, §3). Es ist **keine Rechtsberatung**; vor der Veröffentlichung einer Fassung 1.0 ist eine
juristische Prüfung des Textes vorgesehen (Abschnitt 9, Punkt 9).

<!-- BEITRAGENDE ANFANG -->
| Beitragender | Rolle | Beiträge | Datum | Patentzusage |
|---|---|---|---|---|
| Johannes Parchatka (Auftraggeber, [`docs/00`](../00-auftrag.md)) | Herausgeber | Auftrag, Anspruch ([Q1]), Abnahme aller Pakete | 2026-10-10 | ausstehend |
| Werkzeuggestützte Erarbeitung im Auftrag des Herausgebers (Pakete P1–P3, S1, S2, S4, S6) | Beitragender | Teile 0–3, Referenzimplementierung, Prüfskripte | 2026-10-11 | nicht erforderlich (Auftragsarbeit; Rechte beim Herausgeber) |
<!-- BEITRAGENDE ENDE -->

### 2.5 Fremdrechte-Register

Jede normative Fremdgrundlage der Teile 0, 1 und 3 stammt von einer der folgenden Organisationen.
Das Rechteregime ist das der Organisation; die Spalte „Genutzte Teilmenge und Einschätzung“ ist die
Einschätzung des Herausgebers nach Lektüre der jeweiligen Policy, keine Rechtsauskunft.

<!-- FREMDRECHTE ANFANG -->
| Organisation | Grundlagen (Beispiele) | Rechteregime | Genutzte Teilmenge und Einschätzung | Quelle |
|---|---|---|---|---|
| W3C | EPUB 3.3, EPUB Accessibility 1.1, Publication Manifest, XML-Signatur 1.1, Exclusive C14N, CSP 3, SRI, WCAG 2.2, CSS-Module, Web Annotations, WAI-ARIA, Web Cryptography API, WOFF2, DPUB-ARIA, EPUB SSV | royalty-frei (W3C Patent Policy §5; bindet Working-Group-Teilnehmer; Nichtmitglieder sind nicht gebunden) | Recommendations unter Patent Policy; EPUB 3.3 ist Recommendation vom 13.01.2026 unter Patent Policy; keine Ansprüche bekannt | [Q14], [Q30] |
| WHATWG | HTML Living Standard (iframe sandbox, Custom Elements, details, postMessage, data-*) | royalty-frei für Beiträge und Workstream-Teilnehmer (WHATWG IPR Policy §2.6, §5.1) | Review Drafts des HTML-Standards; keine Ansprüche bekannt | [Q36] |
| IETF | RFC 2119/8174, 3161, 3339, 5646, 5652, 8259, 9562, 6838, 8141, 2606 | FRAND möglich; keine RF-Pflicht, nur Präferenz (BCP 79 §7); Offenlegungspflicht | genutzte RFCs sind Jahrzehnte alt und breit umgesetzt; keine Ansprüche bekannt | [Q24] |
| OASIS | ODF 1.3 Teil 2 (Packages, manifest.xml), Teil 3 (Schema), Teil 4 (OpenFormula) | ODF-TC im Modus „RF on Limited Terms“ | nur Packages-Manifest und Formelteilmenge (Teil 3); keine Ansprüche bekannt | [Q20], [Q37] |
| ETSI | EN 319 162-1 (ASiC), EN 319 132-1 (XAdES), EN 319 102-1, TS 119 312 | FRAND (ETSI IPR Policy); **nicht** royalty-frei | nur Containerregeln und Baseline-Signaturen, die in XML-Signatur (W3C, RF) und CMS (IETF) wurzeln; keine Ansprüche bekannt; Regime offengelegt nach HPG-LIC-006 | [Q23] |
| PKWARE | APPNOTE.TXT (ZIP) | Nutzung zum Lesen/Schreiben von ZIP erlaubt; **Patentvorbehalt** für starke Verschlüsselung und Patching | html-Pro nutzt nur Methoden 0 und 8 ohne Verschlüsselung ([HP-CONT-001](00-spezifikation.md#hp-cont-001--muss--basis)); patentierte Teile ausgeschlossen | [Q35] |
| Ecma International | ECMA-376 (OOXML), nur als Zuordnungstabelle des Mindestprofils (Teil 0 Abschnitt 15.2) | Ecma Code of Conduct in Patent Matters (RAND mit RF-Option); zusätzlich Microsoft Open Specification Promise für OOXML (nicht geprüft) | keine Muss-Anforderung hängt an OOXML; nur Zuordnung für Importer | [Q38] |
| ISO | ISO/IEC 26300 (= ODF), ISO 19005 (PDF/A), ISO 14289 (PDF/UA), ISO 4217 (Währungscodes) | ISO/IEC-Patentpolitik (RAND); Texte kostenpflichtig | OpenFormula wird über die OASIS-Fassung genutzt; PDF/A und PDF/UA nur für den Export; ISO 4217 nur als Codeliste (Teil 3); keine Ansprüche bekannt | [Q22] |
| IEEE | IEEE Std 754-2019 (binary64, Rundung) in Teil 3 | IEEE-SA-Patentpolitik (RAND mit RF-Option) | nur das Zahlformat, das jede Browser-Engine ohnehin umsetzt; keine Ansprüche bekannt | [Q41] |
| Unicode Consortium | Unicode-Standard, Case Folding (Teil 3) | Unicode License (freie Nutzung der Daten und Texte) | nur Case-Folding-Algorithmus; keine Ansprüche bekannt | [Q42] |
| JSON Schema (Internet-Draft, json-schema.org) | JSON Schema 2020-12 (Teil 1, Datenprüfung) | IETF-Internet-Draft (BCP 79, keine RF-Pflicht); Referenzmaterial unter BSD-ähnlicher Lizenz | nur Validierung von `data/`; keine Ansprüche bekannt | [Q24], [Q43] |
| WICG | URL Fragment Text Directives | W3C-Community-Group-Vertragswerk (CLA/FSA, royalty-frei für Teilnehmer) | nur Kann-Anforderung HP-ADR-006; keine Ansprüche bekannt | [Q12], [Q32] |
| schema.org | Barrierefreiheitseigenschaften (`accessMode` u. a.) | CC-BY-SA 3.0 für Vokabular | nur Eigenschaftsnamen; keine Ansprüche bekannt | [Q39] |
| Microsoft, The Document Foundation, MDN | Produktdokumentation (Abgrenzung in Teil 3 §15; Sekundärquelle zu `iframe` in Teil 0) | nur informativ zitiert; keine normative Grundlage | keine Nutzung im Pflichtteil | – |
<!-- FREMDRECHTE ENDE -->

---

## 3. Governance

### 3.1 Rollen und Herausgeber

| Rolle | Wer (Stand 11.10.2026) | Aufgaben |
|---|---|---|
| **Herausgeber** | Johannes Parchatka, Innsbruck (Auftraggeber nach [`docs/00`](../00-auftrag.md)) | veröffentlicht Fassungen, entscheidet Änderungsanträge in Phase A, benennt den Registrar, hält Namensraum und Repository |
| **Registrar** | der Herausgeber (Phase A) | prüft und trägt Registry-Einträge ein (Abschnitt 8) |
| **Beitragende** | jeder, der einen Änderungsantrag stellt oder Text, Tests, Code liefert | Beiträge unter den Lizenzen aus Abschnitt 2 und mit Patentzusage (HPG-LIC-002) |
| **Umsetzer** | Hersteller eines Erzeugers, Lesesystems oder Prüfers, der die Testsuite besteht | Statements of Use, Stimmrecht in Phase B |
| **Umsetzer-Rat** | ab Phase B: je ein Vertreter je unabhängigem Umsetzer plus Herausgeber | entscheidet Änderungsanträge in Phase B |

Kontaktadresse und Repository des Herausgebers werden mit der ersten veröffentlichten Fassung
genannt (HPG-GOV-001); bis dahin gilt das Arbeitsrepository.

### 3.2 Phasen

| Phase | Bedingung | Wer entscheidet | Was sich ändert |
|---|---|---|---|
| **A – Einzelherausgeber** | jetzt | Herausgeber, nach öffentlicher Einspruchsfrist | alles öffentlich, aber ein Entscheider |
| **B – Arbeitsgruppe** | mindestens drei unabhängige Umsetzer haben die Testsuite derselben Fassung bestanden | Umsetzer-Rat im Konsens; bei Dissens Mehrheit der Umsetzer, Herausgeber hat Stichentscheid nur bei Gleichstand | der Herausgeber kann keine Änderung mehr allein beschließen |
| **C – Gremium** | der Umsetzer-Rat beschließt den Gremienweg (Abschnitt 9) | das Gremium nach seinen Regeln | dieser Teil wird durch die Regeln des Gremiums ersetzt |

### 3.3 Änderungsverfahren

Ein Änderungsantrag ist ein Vorgang mit Kennung `HPC-<NNNN>` (html-Pro Change), fortlaufend
nummeriert, im Repository als Datei `docs/spezifikation/aenderungen/HPC-<NNNN>.md` und in der
Tabelle 3.5 geführt. Pflichtfelder:

| Feld | Inhalt |
|---|---|
| Anlass | Problem, Befund, Prüfergebnis oder Bedarf mit Beleg |
| Betroffene Zusage | welche der sieben Zusagen aus [Q1] berührt ist, und ob sie gestärkt oder eingeschränkt wird |
| Betroffene Anforderungen | Kennungen (`HP-…`, `HPR-…`, `HPL-…`, `HPF-…`, `HPG-…`), neue, geänderte, zurückgezogene |
| Änderungstext | der normative Text in der Form von Abschnitt 1.2, mit Prüfverfahren |
| Kompatibilitätsklasse | `Erratum`, `Nebenversion` oder `Hauptversion` nach Abschnitt 4 |
| Auswirkung | je Subjekt (Dokument, Erzeuger, Lesesystem, Prüfer): was sich ändert; bei Hauptversion die Migrationsregel |
| Testsuite | welche Testfälle hinzukommen oder sich ändern |
| Typ | `Änderung`, `Erratum`, `Registrierung` (Abschnitt 8), `Rückzug` |

Ablauf:

1. **Einreichen:** öffentlich, mit allen Pflichtfeldern; unvollständige Anträge werden mit
   Hinweis zurückgegeben, nicht abgelehnt.
2. **Einspruchsfrist:** 14 Tage für Errata und Nebenversion, 28 Tage für Hauptversion und für
   jede Änderung an einer Muss-Anforderung; die Frist beginnt mit der öffentlichen Ankündigung.
3. **Entscheidung:** Phase A: Herausgeber; Phase B: Umsetzer-Rat (3.2). Jede Entscheidung wird
   mit Begründung veröffentlicht, auch Ablehnungen. Einwände, die nicht übernommen werden, werden
   namentlich beantwortet.
4. **Einarbeitung:** Text, Prüfregeln, Testsuite und Registry werden gemeinsam geändert; der
   mechanische Prüfer aller Teile muss grün sein, bevor der Antrag Status `umgesetzt` erhält.
5. **Veröffentlichung:** mit der nächsten Fassung nach Abschnitt 4; die Tabelle 3.5 nennt die
   Fassung.

### 3.4 Anforderungen Governance

#### HPG-GOV-001 · Muss · Basis
Es MUSS genau einen Herausgeber geben, der in Abschnitt 3.1 mit Name und, ab der ersten
veröffentlichten Fassung, mit Kontaktadresse und Repository-Adresse genannt ist.

*Prüfverfahren:* Tabelle 3.1 lesen. Erwartetes Ergebnis: genau eine Zeile „Herausgeber“ mit Name;
in einer veröffentlichten Fassung zusätzlich Kontakt und Repository.
*Grundlage:* eigene Festlegung; Muster: Herausgeber (Editor) und Chair bei W3C ([Q15] §4).

#### HPG-GOV-002 · Muss · Basis
Jede Änderung an normativem Text, an Prüfregeln, an der Testsuite oder an der Registry MUSS über
einen Änderungsantrag `HPC-<NNNN>` mit allen Pflichtfeldern aus Abschnitt 3.3 laufen; Änderungen
ohne Antrag DÜRFEN NICHT in eine veröffentlichte Fassung aufgenommen werden.

*Prüfverfahren:* Für jede veröffentlichte Fassung: Unterschied zur Vorfassung in normativen
Abschnitten; jede geänderte Anforderung ist in der Tabelle 3.5 einem Antrag zugeordnet.
Erwartetes Ergebnis: keine nicht zugeordnete Änderung. Vor der ersten Veröffentlichung (0.1) gilt
das Verfahren erst ab Aufnahme dieses Teils; frühere Änderungen stehen in der Git-Historie.
*Grundlage:* eigene Festlegung; Muster: Änderungsverfahren über Issues und Pull Requests bei W3C-Gruppen ([Q15] §5.2 Konsensfindung).

#### HPG-GOV-003 · Muss · Basis
Vor jeder Entscheidung MUSS die Einspruchsfrist aus Abschnitt 3.3 eingehalten werden (14 Tage;
28 Tage bei Hauptversion oder Muss-Anforderung); die Entscheidung MUSS mit Begründung veröffentlicht
werden, und jeder nicht übernommene Einwand MUSS beantwortet werden.

*Prüfverfahren:* Antragsdatei nennt Datum der Ankündigung, Datum der Entscheidung, Begründung und
die Antworten auf Einwände. Erwartetes Ergebnis: Abstand ≥ 14 bzw. 28 Tage; Begründung vorhanden;
keine unbeantworteten Einwände.
*Grundlage:* [Q15] W3C Process §5.2 (Konsens, Einwände mit Begründung behandeln); Fristen eigene Festlegung (W3C: AC-Review ≥ 28 Tage, §4.4.1).

#### HPG-GOV-004 · Muss · Basis
Das Änderungsverzeichnis (Tabelle 3.5) MUSS jeden Antrag mit Kennung, Datum, Typ, Titel,
betroffenen Kennungen, Kompatibilitätsklasse und Status führen; die Nummern MÜSSEN lückenlos ab
0001 sein, und der Status MUSS einer der Werte `eingereicht`, `in Frist`, `angenommen`,
`abgelehnt`, `umgesetzt`, `zurückgezogen` sein.

*Prüfverfahren:* Tabelle zwischen den Markern `AENDERUNGEN` lesen; Nummern prüfen; Status gegen
die Liste prüfen. Erwartetes Ergebnis: lückenlos, alle Status gültig (mechanisch geprüft,
Fehlercodes `change-numbering`, `change-status`).
*Grundlage:* eigene Festlegung.

#### HPG-GOV-005 · Muss · Basis
Ab Hauptversion 1 DARF NICHT eine neue Muss-Anforderung an Dokumente oder Lesesysteme
veröffentlicht werden, bevor zwei voneinander unabhängige Umsetzungen sie mit der Testsuite
bestanden haben; die Namen der Umsetzungen MÜSSEN im Änderungsantrag stehen.

*Prüfverfahren:* Antragsdatei einer Muss-Anforderung ab 1.0 nennt zwei Umsetzungen mit
Testsuite-Ergebnis. Erwartetes Ergebnis: zwei Einträge, beide bestanden. Für 0.x gilt die
Anforderung nicht; dort ist die Referenzimplementierung die einzige Umsetzung (offen, Abschnitt 9).
*Grundlage:* [Q15] W3C Process §6.3 (Implementation Experience vor Recommendation); [Q19] OASIS: drei Statements of Use für einen OASIS Standard.

#### HPG-GOV-006 · Muss · Basis
Der Wechsel von Phase A nach Phase B MUSS erfolgen, sobald drei unabhängige Umsetzer (verschiedene
Organisationen, keine gemeinsame Codebasis) die Testsuite derselben Fassung bestanden und das dem
Herausgeber mitgeteilt haben; der Herausgeber MUSS den Wechsel innerhalb von 28 Tagen öffentlich
erklären und den Umsetzer-Rat benennen.

*Prüfverfahren:* Liste der Umsetzer mit Testsuite-Ergebnis in Abschnitt 3.1; Datum der dritten
Mitteilung und Datum der Erklärung. Erwartetes Ergebnis: Abstand ≤ 28 Tage; Rat benannt. Stand
11.10.2026: null unabhängige Umsetzer, Phase A.
*Grundlage:* eigene Festlegung; [Q1] §4b (Weiterentwicklung darf nicht an einem Anbieter hängen).

#### HPG-GOV-007 · Muss · Basis
Alle Anträge, Entscheidungen, Fassungen, Prüfskripte und die Registry MÜSSEN öffentlich und ohne
Gebühr zugänglich sein; Beiträge DÜRFEN NICHT von einer Mitgliedschaft oder Zahlung abhängig gemacht
werden.

*Prüfverfahren:* Repository und Antragsverzeichnis ohne Anmeldung abrufbar; keine Gebührenordnung.
Erwartetes Ergebnis: abrufbar, gebührenfrei. (Das Arbeitsrepository ist bis zur Veröffentlichung
nicht öffentlich; siehe Abschnitt 10.)
*Grundlage:* [Q17] W3C Community Groups (keine Gebühr, keine Mitgliedschaft nötig) als Vorbild; [Q1] §4a.

#### HPG-GOV-008 · Soll · Basis
Der Herausgeber SOLL einen vertraulichen Meldeweg für Sicherheitslücken im Standard (Sandbox-Regeln,
Signaturregeln) nennen und eine gemeldete Lücke SOLL innerhalb von 90 Tagen als Erratum oder
Nebenversion mit Regelkennung veröffentlicht werden.

*Prüfverfahren:* Meldeweg in Abschnitt 3.1 bzw. `SECURITY.md`; für jede Meldung Datum der
Meldung und der Veröffentlichung. Erwartetes Ergebnis: Meldeweg genannt; Abstand ≤ 90 Tage.
*Grundlage:* eigene Festlegung; [Q1] §4c (Sicherheitsregeln sind Teil der Spezifikation).

### 3.5 Änderungsverzeichnis

Typen: Änderung, Erratum, Registrierung, Rückzug. Klassen nach Abschnitt 4. Status nach HPG-GOV-004.
Der erste Antrag ist zugleich das Beispiel für das Verfahren: die Empfehlung zur Dateiendung aus
Abschnitt 6.

<!-- AENDERUNGEN ANFANG -->
| Kennung | Datum | Typ | Titel | Betroffen | Klasse | Status |
|---|---|---|---|---|---|---|
| HPC-0001 | 2026-10-11 | Änderung | Dateiendung: `.asice` als dritte zulässige Endung für signierte Fassungen, Erzeuger schreibt `.hpro` | HP-CONT-013, HPR-CONT (neu), HPG-NS-006 | Nebenversion | in Frist |
| HPC-0002 | 2026-10-11 | Registrierung | Kennung `kalk` als Beispiel-Erweiterung dieser Spezifikation reservieren | 02-registry.json | Erratum | umgesetzt |
<!-- AENDERUNGEN ENDE -->

Antrag HPC-0001 im Wortlaut: [`aenderungen/HPC-0001.md`](aenderungen/HPC-0001.md). Die Einspruchsfrist
läuft bis 09.11.2026 (28 Tage, weil HP-CONT-013 eine Muss-Anforderung ist). HPC-0002:
[`aenderungen/HPC-0002.md`](aenderungen/HPC-0002.md).

---

## 4. Versionsschema

### 4.1 Überblick

Die Spezifikation trägt eine Version `<major>.<minor>` ([HP-VERS-001](00-spezifikation.md#hp-vers-001--muss--basis));
sie steht im `conformsTo`-Pfad jedes Dokuments. Das Schema folgt Semantic Versioning ([Q31]) ohne
PATCH-Stelle: Korrekturen ohne normative Wirkung sind Errata und ändern die Nummer nicht.

| Klasse | Was | Nummer | Beispiel |
|---|---|---|---|
| **Erratum** | Tippfehler, tote Verweise, Klarstellung ohne Änderung eines Prüfergebnisses | unverändert | Anker in Teil 1 korrigiert |
| **Nebenversion** | kompatible Ergänzung: neue Soll/Kann-Anforderungen, neue optionale Schlüssel, Attribute, Funktionen (Teil 3), Komponenten; neue Muss-Anforderungen nur an Lesesysteme, wenn alte Dokumente dadurch nicht ungültig werden | `0.1` → `0.2` | `.asice` als dritte Endung (HPC-0001) |
| **Hauptversion** | inkompatible Änderung: bestehende Bedeutung ändert sich, Soll wird Muss, Merkmal entfällt, Profilpfade ändern sich | `0.x` → `1.0` | eigener Namensraum statt Platzhalter |

Status einer Fassung: **Arbeitsentwurf** (kann sich täglich ändern) → **Kandidat** (Text
eingefroren, Testsuite vollständig, Einspruchsfrist läuft) → **Veröffentlicht** → **Ersetzt**
(durch höhere Fassung; bleibt abrufbar) oder **Zurückgezogen** (Sicherheitsgrund; bleibt abrufbar
mit Vermerk).

### 4.2 Anforderungen Versionsschema

#### HPG-VER-001 · Muss · Basis
Jede Fassung MUSS eine Version `<major>.<minor>` und genau einen Status aus `Arbeitsentwurf`,
`Kandidat`, `Veröffentlicht`, `Ersetzt`, `Zurückgezogen` tragen, in der Kopfzeile jedes Teils.

*Prüfverfahren:* Kopfzeilen aller Teile lesen. Erwartetes Ergebnis: gleiche Version und gleicher
Status in allen Teilen (mechanisch geprüft, Fehlercode `version-mismatch`).
*Grundlage:* [Q31] SemVer 2.0.0 (MAJOR/MINOR); [HP-VERS-001](00-spezifikation.md#hp-vers-001--muss--basis); Statusfolge nach dem Muster WD → CR → REC ([Q15] §6.3.1).

#### HPG-VER-002 · Muss · Basis
Eine Nebenversion DARF NICHT die Bedeutung bestehender Schlüssel, Attribute, Elemente, Funktionen
oder Kennungen ändern, DARF NICHT eine Soll- oder Kann-Anforderung zur Muss-Anforderung machen und
DARF NICHT ein Dokument ungültig machen, das nach der vorherigen Nebenversion gültig war.

*Prüfverfahren:* Testsuite der Fassung n.m gegen den Prüfer der Fassung n.(m+1) ausführen; alle
Gutfälle bleiben fehlerfrei. Erwartetes Ergebnis: 0 neue Fehler in alten Gutfällen.
*Grundlage:* [HP-VERS-003](00-spezifikation.md#hp-vers-003--muss--basis); [Q31] (MINOR = abwärtskompatibel).

#### HPG-VER-003 · Muss · Basis
Eine Hauptversion MUSS für jede inkompatible Änderung eine Migrationsregel enthalten (wie ein
Bearbeiter ein Dokument der Vorfassung überführt), und ein Lesesystem der Hauptversion n+1 MUSS
Dokumente der Hauptversion n weiterhin anzeigen können (Lesen bleibt abwärtskompatibel; Schreiben
nicht zwingend).

*Prüfverfahren:* Änderungsantrag der Hauptversion listet je gebrochener Anforderung die
Migrationsregel; Testsuite n gegen Lesesystem n+1: alle Dokumente werden angezeigt. Erwartetes
Ergebnis: Regeln vollständig; Anzeige ohne Verweigerung.
*Grundlage:* [Q1] §4c (alte Dateien bleiben lesbar); [Q31] (MAJOR = inkompatibel).

#### HPG-VER-004 · Muss · Basis
Ein Erratum DARF NICHT ein Prüfergebnis ändern; eine Korrektur, die einen Befund hinzufügt,
entfernt oder seine Fehlerklasse ändert, MUSS als Nebenversion oder Hauptversion laufen.

*Prüfverfahren:* Vor und nach dem Erratum die gesamte Testsuite mit dem Prüfer ausführen und die
Befundlisten vergleichen. Erwartetes Ergebnis: identisch.
*Grundlage:* eigene Festlegung; [Q3] Teil 1 §1.2 (Kennungen stabil, Regel mit geänderter Prüfung bekommt neue Kennung).

#### HPG-VER-005 · Muss · Basis
Kennungen (`HP-`, `HPR-`, `HPL-`, `HPF-`, `HPG-`, `HPC-`, Registry-Kennungen) DÜRFEN NICHT
umgedeutet und DÜRFEN NICHT wiederverwendet werden; eine zurückgezogene Anforderung oder Regel
bleibt mit dem Vermerk „zurückgezogen“ und ohne Prüfverfahren stehen.

*Prüfverfahren:* Zwei Fassungen vergleichen: jede Kennung der alten Fassung existiert in der neuen,
entweder unverändert oder mit Vermerk „zurückgezogen“. Erwartetes Ergebnis: keine verschwundene,
keine umgedeutete Kennung.
*Grundlage:* [Q3] Teil 1 §1.2; [Q2] Teil 0 §1.2 (lückenlose Nummern, keine Wiederverwendung).

#### HPG-VER-006 · Muss · Basis
Ein Merkmal (Schlüssel, Attribut, Element, Funktion, Komponente, Regel) MUSS vor dem Entfernen in
einer Nebenversion als „veraltet“ gekennzeichnet werden und DARF NICHT vor der nächsten
Hauptversion entfallen; ein Lesesystem MUSS veraltete Merkmale seiner eigenen Hauptversion weiter
lesen.

*Prüfverfahren:* Änderungsverzeichnis: für jedes entfernte Merkmal existiert ein früherer Antrag
„veraltet“ in einer Nebenversion derselben Hauptversion. Erwartetes Ergebnis: erfüllt.
*Grundlage:* eigene Festlegung; [Q1] §4c (Langzeitlesbarkeit).

#### HPG-VER-007 · Muss · Basis
Jede veröffentlichte Fassung MUSS dauerhaft unter ihrer versionierten Namensraum-URI (Abschnitt 5)
und als Git-Tag `spec/<major>.<minor>` im Repository abrufbar bleiben, auch nach Status `Ersetzt`
oder `Zurückgezogen`.

*Prüfverfahren:* Für jede Fassung in der Fassungsliste: Tag vorhanden; URI liefert den Text (nach
Ersatz des Platzhalters). Erwartetes Ergebnis: alle Fassungen abrufbar.
*Grundlage:* [Q1] §4a (veröffentlichte, versionierte Spezifikation); Muster: datierte W3C-TR-URIs ([Q15] §6.2).

#### HPG-VER-008 · Muss · Basis
Die Testsuite ist Teil jeder Fassung: Eine Fassung DARF NICHT ohne die Testsuite derselben Version
veröffentlicht werden, und ein Lesesystem, Erzeuger oder Prüfer gilt nur dann als konform zu
Fassung n.m, wenn es die Testsuite n.m besteht.

*Prüfverfahren:* Veröffentlichung enthält `docs/belege/` und die S3-Testsuite mit demselben Tag;
Konformitätsaussage eines Werkzeugs nennt Fassung und Testsuite-Ergebnis. Erwartetes Ergebnis:
vorhanden und genannt.
*Grundlage:* [Q1] §4b („ist html-Pro“ an messbares Ergebnis gebunden); [HPR-VERS-006] in Teil 1 (Konformitätsbericht).

#### HPG-VER-009 · Kann · Basis
Vor Hauptversion 1 (Fassungen `0.x`) KANN eine Nebenversion inkompatible Änderungen enthalten,
wenn jede im Änderungsverzeichnis als `Hauptversion`-Klasse gekennzeichnet ist; ein Lesesystem der
Fassung 1.0 KANN Dokumente der Fassungen `0.x` ablehnen.

*Prüfverfahren:* Änderungsverzeichnis der 0.x-Fassungen; Lesesystem 1.0 mit 0.x-Dokument.
Erwartetes Ergebnis: Kennzeichnung vorhanden; Ablehnung mit Hinweis auf die Fassung zulässig.
*Grundlage:* [Q31] SemVer 2.0.0 §4 (0.y.z: alles kann sich ändern).

---

## 5. Namensraum

### 5.1 Aufbau

Alle URIs des Standards liegen unter einer **Basis** `<basis>`, die der Herausgeber kontrolliert.
Bis zur Entscheidung ist die Basis der Platzhalter `https://html-pro.example` (Domäne `.example`
nach RFC 2606, [Q27]); sie darf nirgends als echte Adresse verstanden werden.

| Zweck | Muster | Beispiel (Platzhalter) | Verwendung |
|---|---|---|---|
| JSON-LD-Kontext im Manifest | `<basis>/ns/v<major>` | `https://html-pro.example/ns/v0` | `manifest.json#@context` ([HP-META-001](00-spezifikation.md#hp-meta-001--muss--basis)) |
| Fassung der Spezifikation | `<basis>/spec/<major>.<minor>` | `https://html-pro.example/spec/0.1` | Konformitätsbericht `spec` (Teil 1 §4.3) |
| Profil | `<basis>/spec/<major>.<minor>/profile/<profil>` | `…/spec/0.1/profile/interactive` | `conformsTo` ([HP-PROF-001](00-spezifikation.md#hp-prof-001--muss--basis)) |
| Teilmenge (Mindestprofil) | `<basis>/spec/<major>.<minor>/subset/<name>` | `…/spec/0.1/subset/office-min` | Teil 0 Abschnitt 15 |
| Registrierte Erweiterung | `<basis>/ext/<kennung>` | `https://html-pro.example/ext/kalk` | nur, wenn der Anbieter keine eigene URI will (Abschnitt 8) |
| Registry | `<basis>/registry/<major>` | `https://html-pro.example/registry/0` | Abruf der Registry (optional) |

URIs sind **Kennungen**, keine Abrufadressen: Lesesysteme und Prüfer rufen sie nicht ab
([HP-META-003](00-spezifikation.md#hp-meta-003--muss--basis)). Ein URN-Namensraum (`urn:html-pro:…`)
wurde erwogen und verworfen: Die formale Registrierung bei der IANA verlangt ein Expertenreview und
eine veröffentlichte Spezifikation ([Q28] §6.2), bringt aber gegenüber einer https-URI unter
eigener Domäne keinen Vorteil, solange der Herausgeber die Domäne hält. Sie bleibt als Option für
Phase C offen (Abschnitt 9).

### 5.2 Anforderungen Namensraum

#### HPG-NS-001 · Muss · Basis
Alle URIs des Standards MÜSSEN den Mustern aus Tabelle 5.1 folgen; `<major>` ist die Hauptversion,
`<minor>` die Nebenversion, `<profil>` einer der vier Profilnamen, `<kennung>` eine
Registry-Kennung nach [HPG-EXT-001](#hpg-ext-001--muss--basis).

*Prüfverfahren:* Alle URIs mit Präfix `<basis>` in den Teilen 0–3, in der Registry und in den
Beispielen sammeln und gegen die Muster prüfen. Erwartetes Ergebnis: 0 Abweichungen (mechanisch
geprüft, Fehlercode `namespace-pattern`).
*Grundlage:* eigene Konvention; [Q2] HP-VERS-001, HP-PROF-001.

#### HPG-NS-002 · Muss · Basis
`https://html-pro.example` ist ein Platzhalter; vor dem Status `Kandidat` einer Fassung MUSS der
Herausgeber eine Basis unter seiner Kontrolle festlegen, und eine veröffentlichte Fassung DARF NICHT
den Platzhalter in `conformsTo`, `@context`, Profilpfaden oder Regelkatalog enthalten.

*Prüfverfahren:* Textsuche nach `html-pro.example` in allen Teilen, im Regelkatalog, in der
Referenzimplementierung und in der Testsuite einer Fassung mit Status `Kandidat` oder höher.
Erwartetes Ergebnis: 0 Treffer. Für Arbeitsentwürfe ist der Platzhalter zulässig (Stand 11.10.2026:
Platzhalter in Teil 0, Teil 1, `kern/src/manifest.ts`).
*Grundlage:* [Q27] RFC 2606 §2 (`.example` für Dokumentation und Beispiele reserviert).

#### HPG-NS-003 · Muss · Basis
Lesesysteme, Erzeuger und Prüfer DÜRFEN NICHT Namensraum-URIs abrufen; der Herausgeber SOLL unter
der Fassungs-URI dennoch den Text der Fassung bereitstellen.

*Prüfverfahren:* Netzwerkmitschnitt beim Öffnen, Erzeugen und Prüfen eines Dokuments ohne
Netzverbindung. Erwartetes Ergebnis: 0 Abrufe; alle Funktionen verfügbar.
*Grundlage:* [HP-META-003](00-spezifikation.md#hp-meta-003--muss--basis); [Q1] §3 Punkt 2 (offline, ohne Server).

#### HPG-NS-004 · Muss · Basis
Die Kennungen der Tabelle „Reservierte Kennungen“ (Abschnitt 8.3) DÜRFEN NICHT an Dritte vergeben
und DÜRFEN NICHT als `x-<kennung>-` in Dokumenten verwendet werden; `hp` ist der Präfix des
Standards.

*Prüfverfahren:* Registry: kein Erweiterungseintrag mit reservierter Kennung außer Status
`beispiel`; Prüfer meldet `x-<reserviert>-`-Namen. Erwartetes Ergebnis: 0 Einträge; Befund
vorhanden (mechanisch geprüft, Fehlercode `reserved-kennung`).
*Grundlage:* [HP-VERS-005](00-spezifikation.md#hp-vers-005--muss--basis); eigene Festlegung.

#### HPG-NS-005 · Muss · Basis
Der Standard DARF NICHT in Fassungen `0.x` einen eigenen Media-Type einführen; der Media-Type für
`mimetype` und für den Transport (HTTP, E-Mail) ist `application/epub+zip`.

*Prüfverfahren:* `mimetype`-Inhalt nach [HP-CONT-002](00-spezifikation.md#hp-cont-002--muss--basis);
Transport-Typ in Referenzimplementierung und Dokumentation. Erwartetes Ergebnis: ausschließlich
`application/epub+zip`. Ein eigener Typ (`application/vnd.html-pro+zip` oder im Standards-Tree)
ist eine Entscheidung für Phase C (Abschnitt 9, Punkt 6).
*Grundlage:* [Q25] IANA-Registrierung `application/epub+zip` (W3C, `.epub`); [Q26] RFC 6838 §3.1/§3.2 (Trees), §4.4 (veröffentlichte Spezifikation nötig); Befund [Q5] §6.1 (eigener Typ bricht EPUB).

#### HPG-NS-006 · Muss · Basis
Der Erzeuger MUSS Dokumente mit der Endung `.hpro` schreiben; das Lesesystem MUSS Dokumente mit
den Endungen `.hpro` und `.epub` öffnen und SOLL Dokumente mit den Endungen `.asice` und `.sce`
öffnen, jeweils ohne die Endung zur Formaterkennung zu nutzen.

*Prüfverfahren:* Dieselbe Datei unter `a.hpro`, `a.epub`, `a.asice`, `a.sce` öffnen.
Erwartetes Ergebnis: `.hpro` und `.epub` identisch angezeigt und geprüft; `.asice`/`.sce` ebenso
oder mit dokumentierter Begründung abgelehnt. Erzeuger: Standarddateiname endet auf `.hpro`.
*Grundlage:* [HP-CONT-013](00-spezifikation.md#hp-cont-013--muss--basis); Empfehlung in Abschnitt 6; Änderungsantrag HPC-0001.

#### HPG-NS-007 · Soll · Basis
Ein Lesesystem SOLL die Dateizuordnung des Betriebssystems nur für `.hpro` übernehmen und SOLL
NICHT die Zuordnung für `.epub` an sich ziehen; die Weitergabe als `.epub` ist Lesbarkeit, nicht
Beweiskraft.

*Prüfverfahren:* Installationsmanifest des Lesesystems (Dateizuordnungen) prüfen. Erwartetes
Ergebnis: nur `.hpro` (und optional `.asice`/`.sce`), nicht `.epub`.
*Grundlage:* Befund [Q5] §4 Fall V8 (EPUB-Leser zeigen Manipulationen kommentarlos); [Q6] N.2 (Rückfallebene = Lesbarkeit, nicht Beweiskraft).

---

## 6. Dateiendung: Normkonflikt und Empfehlung

### 6.1 Der Konflikt (aus [Q5] §5.1 und §6.2)

| Norm | Aussage zur Endung | Aussage zum `mimetype` |
|---|---|---|
| EPUB 3.3 ([Q30]) | `.epub` wird in der Einleitung genannt, **informativ**, nicht normativ | `application/epub+zip` **normativ** (§4.3.3) |
| ETSI EN 319 162-1 §4.4.3.1 Nr. 1 (zitiert in [Q5]) | „The file extension shall be either: a) `.asice`; or b) `.sce`“ — **normativ** | für XAdES: `application/vnd.etsi.asic-e+zip` **oder** „the original media type of the container“ (Nr. 2 b), mit dem Beispiel ODF |
| IANA ([Q25]) | `application/epub+zip` ist mit `.epub` registriert | – |

Ein html-Pro-Container ist beides zugleich: gültiges EPUB 3 und gültiger ASiC-E-Container mit
XAdES ([Q5] Fälle V5, V11; [Q6] N.1). Beim `mimetype` lösen die Normen das selbst: ASiC-E erlaubt
den Original-Typ. Bei der Endung **nicht**: EPUB nennt `.epub` nur informativ, ASiC-E verlangt
`.asice` oder `.sce`. Keine Endung erfüllt beide; `.hpro` erfüllt keine.

### 6.2 Gemessen (Belege [Q33])

| Werkzeug | Endung `.epub` | Endung `.hpro` | Endung `.asice` |
|---|---|---|---|
| epubcheck 5.4.0 | prüft vollständig | **lehnt ab:** „Mode required for non-epub files“; die Datei wird ohne `--mode` nicht als EPUB behandelt | wie `.hpro` |
| Referenzimplementierung `hpro inspect` / `validate` | gleich | gleich | gleich ([Q5] V7: DSS ebenso) |
| EU DSS 6.5 (ASiC-Validator) | gleiches Urteil ([Q5] V7) | gleiches Urteil | gleiches Urteil |

Das heißt: Der verbreitete EPUB-Validator hängt an `.epub`, die ASiC-Validatoren hängen nicht an der
Endung. Nicht gemessen: fremde Prüfdienste (RTR, DSS-Demo, DigiDoc) und die Dateizuordnung mobiler
Systeme ([Q5] §7, [Q40] Frage 4).

### 6.3 Optionen

| Option | EPUB-Norm | ASiC-Norm | Dateizuordnung | Vertrauen | Bewertung |
|---|---|---|---|---|---|
| A: nur `.epub` | erfüllt (informativ) | verletzt | geht an E-Book-Leser, die keine Signatur prüfen ([Q5] V8) | schlecht: ein manipuliertes Dokument öffnet sich kommentarlos | verworfen |
| B: nur `.asice`/`.sce` | nicht verletzt (nur informativ), aber epubcheck prüft nicht | erfüllt | geht an Signaturwerkzeuge (DigiDoc u. a.), die den EPUB-`mimetype` womöglich ablehnen (nicht geprüft) | unklar | verworfen |
| C: nur `.hpro` | nicht verletzt, epubcheck prüft nicht | verletzt | eigene Zuordnung zum html-Pro-Leser | gut | unvollständig |
| **D: `.hpro` kanonisch, `.epub` und `.asice` als Weitergabe-Endungen derselben Bytes** | erfüllt bei Weitergabe als `.epub` | erfüllt bei Weitergabe als `.asice` (nur für Profile `signed`/`archive` sinnvoll) | `.hpro` → html-Pro-Leser; `.epub` → E-Book-Leser (Lesbarkeit); `.asice` → Signaturwerkzeug (Prüfbarkeit) | gut: die Endung sagt dem Empfänger, wofür die Kopie gedacht ist | **empfohlen** |

### 6.4 Empfehlung

1. **`.hpro` ist die kanonische Endung.** Der Erzeuger schreibt sie; das Lesesystem registriert nur
   sie (HPG-NS-006, HPG-NS-007). Begründung: Dateizuordnung und Vertrauen, nicht Branding; die
   Endung `.epub` würde Dokumente in Leser lenken, die Signaturen nicht prüfen.
2. **„Weitergeben als …“ erzeugt dieselben Bytes unter `.epub` oder `.asice`.** Beides ist kein
   Export ([Q5] V7). `.epub` für Empfänger ohne html-Pro-Leser (Lesbarkeit, keine Beweiskraft);
   `.asice` für die Einreichung bei ASiC-Validatoren oder dort, wo EN 319 162-1 wörtlich verlangt
   wird. `.asice` wird `.sce` vorgezogen, weil die verbreiteten Signaturwerkzeuge `.asice` zuordnen
   (eigene Einschätzung; Verhalten mit EPUB-`mimetype` nicht geprüft).
3. **Normkonformität bleibt zweigeteilt und wird so benannt:** Ein `.hpro` erfüllt EN 319 162-1
   §4.4.3.1 Nr. 1 nicht; erst die Kopie unter `.asice` tut es. Die Norm selbst nennt als Beispiel
   für Nr. 2 b ODF-Container, die üblicherweise `.odt` heißen; ob die Endungsregel für Container mit
   Original-Media-Type überhaupt gemeint ist, ist eine **offene Frage an ETSI ESI** ([Q5] §8
   Punkt 1), keine Behauptung.
4. **Umsetzung:** Änderungsantrag HPC-0001 ergänzt [HP-CONT-013](00-spezifikation.md#hp-cont-013--muss--basis)
   um `.asice`/`.sce` (Lesesystem SOLL öffnen) und legt den Erzeuger auf `.hpro` fest; bis zur
   Entscheidung gilt HPG-NS-006 dieses Teils als Soll-Ergänzung. Die Referenzimplementierung
   erkennt das Format bereits ohne Endung ([Q5] V7).

---

## 7. Erweiterungen Dritter

### 7.1 Regeln in Kürze

Teil 0 legt den Mechanismus fest: Deklaration in `manifest.json#extensions`
([HP-VERS-004](00-spezifikation.md#hp-vers-004--muss--basis)), Präfix `x-<kennung>-` für alle
eigenen Namen ([HP-VERS-005](00-spezifikation.md#hp-vers-005--muss--basis)), Anzeige auch ohne
Erweiterung ([HP-VERS-006](00-spezifikation.md#hp-vers-006--muss--basis)), keine Aufhebung von
Muss-Anforderungen ([HP-VERS-007](00-spezifikation.md#hp-vers-007--muss--basis)). Teil 1 prüft das
mit HPR-VERS-002 bis HPR-VERS-005 und HPR-META-011. Dieser Teil ergänzt Kennungssyntax, URI-Regeln,
die Pflicht zur Deklaration verwendeter Kennungen, die Grenzen dessen, was eine Erweiterung tun
darf, und den Weg in den Standard.

Eine Erweiterung **darf**: eigene Attribute `data-x-<kennung>-…`, eigene Manifest-Schlüssel
`x-<kennung>-…`, eigene CSS-Variablen `--x-<kennung>-…` und -Klassen, Dateien ohne Skript unter
`ext/<kennung>/`, eigene Sperrregeln `x-<kennung>-…`, und im Profil `interactive` eigene
Komponenten `x-<kennung>-…` unter `components/` mit statischem Äquivalent. Eine Erweiterung
**darf nicht**: Skripte außerhalb von `components/`, externe Verweise, Netzzugriffe, Namen im
Präfix `hp`, Bedeutungsänderung von `hp`-Namen, Inhalte, die nur mit Erweiterung sichtbar sind.

### 7.2 Anforderungen Erweiterungen

#### HPG-EXT-001 · Muss · Basis
Eine Kennung, die in der Registry eingetragen wird, MUSS dem Muster `^[a-z][a-z0-9]{1,15}$`
entsprechen (2 bis 16 Zeichen, Kleinbuchstabe am Anfang); nicht registrierte Kennungen MÜSSEN
mindestens dem Muster `^[a-z0-9]+$` aus Teil 0 entsprechen.

*Prüfverfahren:* Registry-Einträge gegen das strenge Muster, Namen in Dokumenten gegen das Muster
aus Teil 0 prüfen. Erwartetes Ergebnis: 0 Abweichungen (Registry mechanisch geprüft, Fehlercode
`kennung-pattern`; Dokumente mit HPR-VERS-003).
*Grundlage:* [HP-VERS-005](00-spezifikation.md#hp-vers-005--muss--basis); eigene Verschärfung für die Registry.

#### HPG-EXT-002 · Muss · Basis
Die Erweiterungs-URI (`extensions[].id`) MUSS absolut sein und unter Kontrolle des Anbieters stehen
(https-URI unter seiner Domäne oder `urn:uuid:`); sie DARF NICHT unter `<basis>` des Standards
liegen, außer der Eintrag ist in der Registry eingetragen und die URI ist `<basis>/ext/<kennung>`.

*Prüfverfahren:* Jede `id` gegen `^(https://|urn:uuid:)` prüfen; `id` mit Präfix `<basis>` nur,
wenn Registry-Eintrag mit gleicher Kennung existiert. Erwartetes Ergebnis: erfüllt (Prüfer:
HPR-VERS-002 für absolute URI, dieser Teil für den Namensraum).
*Grundlage:* [HP-VERS-004](00-spezifikation.md#hp-vers-004--muss--basis); eigene Festlegung.

#### HPG-EXT-003 · Soll · Basis
Jede Kennung, die in einem Dokument als `x-<kennung>-`-Name vorkommt, SOLL in
`manifest.json#extensions` deklariert sein (Eintrag mit `dir` gleich Kennung oder `id` endend auf
`/<kennung>`); ein Prüfer SOLL eine verwendete, nicht deklarierte Kennung als Warnung melden.

*Prüfverfahren:* Alle `x-<kennung>-`-Namen in Manifest, XHTML, SVG und CSS sammeln; Menge der
Kennungen mit der Menge der deklarierten vergleichen. Erwartetes Ergebnis: Teilmenge; sonst
Warnung `HPG-EXT-003` ([`scripts/check-erweiterung.mjs`](../../scripts/check-erweiterung.mjs)).
*Grundlage:* eigene Festlegung; [HP-VERS-004](00-spezifikation.md#hp-vers-004--muss--basis).

#### HPG-EXT-004 · Muss · Basis
Ein Dokument mit Erweiterung MUSS ohne die Erweiterung denselben Text in derselben Reihenfolge
liefern wie mit ihr; eine Erweiterung DARF NICHT Inhalte nur über ihre eigenen Mittel sichtbar
machen, DARF NICHT die Bedeutung von `hp`-Namen verändern und DARF NICHT Lesesystem-Variablen
`--hp-*` setzen.

*Prüfverfahren:* Textextraktion des Dokuments in einem Lesesystem ohne die Erweiterung und in
einem mit ihr vergleichen; CSS der Erweiterung auf Deklarationen `--hp-*` prüfen. Erwartetes
Ergebnis: Text identisch; 0 Deklarationen (Prüfer: HPR-VERS-003 meldet `--hp-*` in Autoren-CSS).
*Grundlage:* [HP-VERS-006](00-spezifikation.md#hp-vers-006--muss--basis), [HP-VERS-007](00-spezifikation.md#hp-vers-007--muss--basis), [HP-INH-004](00-spezifikation.md#hp-inh-004--muss--basis).

#### HPG-EXT-005 · Soll · Basis
`required: true` SOLL nur gesetzt werden, wenn das Dokument ohne die Erweiterung seinen Zweck nicht
erfüllt, und dann SOLL `extensions[].url` auf eine Beschreibung zeigen, die sagt, was ohne die
Erweiterung fehlt.

*Prüfverfahren:* Für jeden Eintrag mit `required: true`: `url` vorhanden und Beschreibung
abrufbar (manuell). Erwartetes Ergebnis: vorhanden; andernfalls Hinweis HPR-VERS-004 mit
Nachfrage an den Erzeuger.
*Grundlage:* [HP-VERS-006](00-spezifikation.md#hp-vers-006--muss--basis) (Lesesystem zeigt trotzdem an); eigene Festlegung.

#### HPG-EXT-006 · Soll · Basis
Ein Prüfer SOLL Kennungen, die nicht in der Registry stehen, als Hinweis melden (Klasse
`INFO`), damit Kollisionen zwischen Anbietern sichtbar werden; eine fehlende Registrierung ist kein
Fehler.

*Prüfverfahren:* Dokument mit nicht registrierter Kennung prüfen. Erwartetes Ergebnis: Hinweis
`HPG-EXT-006` mit Kennung; Ergebnis bleibt `OK`.
*Grundlage:* eigene Festlegung; Registry nach Abschnitt 8.

#### HPG-EXT-007 · Muss · Basis
Wird eine Erweiterung in den Standard aufgenommen, MÜSSEN ihre Namen von `x-<kennung>-` nach `hp-`
wechseln, der Registry-Eintrag MUSS den Status `aufgenommen` mit Verweis auf den Änderungsantrag
erhalten, und Lesesysteme SOLLEN die alten `x-<kennung>-`-Namen bis zur nächsten Hauptversion
weiter lesen.

*Prüfverfahren:* Registry-Eintrag mit Status `aufgenommen` nennt `HPC-<NNNN>`; der Antrag nennt
die Abbildung alt → neu. Erwartetes Ergebnis: vorhanden (mechanisch: `extension-adopted-without-change`).
*Grundlage:* eigene Festlegung; Muster: Überführung von `x-`-Präfixen in registrierte Namen ([Q26] Appendix A für Media-Types).

### 7.3 Gültige Drittanbieter-Erweiterung (Beispiel)

Quelle: [`beispiele/s4-erweiterung-gueltig/`](beispiele/s4-erweiterung-gueltig/); Container wird
mit [`scripts/s4-beispiele.mjs`](../../scripts/s4-beispiele.mjs) deterministisch gebaut (Ablage in
[`docs/belege/S4/container/`](../belege/S4/container/)). Fiktiver Anbieter mit Kennung `kalk`.

`manifest.json` (Ausschnitt, von der Referenzimplementierung erzeugt und um die Erweiterung ergänzt):

```json
{
  "conformsTo": "https://html-pro.example/spec/0.1/profile/static",
  "resources": [
    { "url": "ext/kalk/einstellungen.json", "type": "application/json", "integrity": "sha256-…" },
    { "url": "ext/kalk/kalk.css", "type": "text/css", "integrity": "sha256-…" }
  ],
  "extensions": [
    { "id": "https://kalk.example.org/ns/hp-ext/kalk", "dir": "kalk", "required": false,
      "url": "https://kalk.example.org/hp-ext/kalk/1.2/" }
  ],
  "x-kalk-version": "1.2.0"
}
```

`content/index.xhtml` (Ausschnitt):

```xml
<table id="kosten" data-hp-table="scroll" data-x-kalk-satz="0.03" data-x-kalk-waehrung="EUR">
  <caption>Positionen mit Rabattsatz der Erweiterung</caption>
  …
  <tr><td>Dachziegel</td><td>1 200</td><td class="x-kalk-betrag">4 800,00 EUR</td></tr>
</table>
```

`ext/kalk/kalk.css`:

```css
:root { --x-kalk-akzent: #2b6cb0; }
.x-kalk-betrag { color: var(--x-kalk-akzent); font-variant-numeric: tabular-nums; }
```

Warum gültig: Erweiterung deklariert (`id` absolut, `required` boolesch, `dir` = Verzeichnis);
alle eigenen Namen tragen `x-kalk-`; keine Skripte, keine externen Verweise; ohne die Erweiterung
zeigt jedes Lesesystem dieselbe Tabelle mit denselben Beträgen. Ergebnis ([Q33]): Erweiterungsprüfer
0 Befunde; epubcheck 5.4.0 0 Fehler, 0 Warnungen; `hpro inspect` OK.

<!-- BEISPIEL-GUELTIG ANFANG -->
| Prüfung | Erwartung |
|---|---|
| `scripts/check-erweiterung.mjs` | 0 Fehler, 0 Warnungen |
| epubcheck 5.4.0 (als `.epub`) | 0 Fehler |
| `hpro inspect` | OK |
<!-- BEISPIEL-GUELTIG ENDE -->

### 7.4 Ungültige Drittanbieter-Erweiterung (Beispiel)

Quelle: [`beispiele/s4-erweiterung-ungueltig/`](beispiele/s4-erweiterung-ungueltig/). Derselbe
Aufbau mit sieben absichtlichen Verstößen. Der Erweiterungsprüfer meldet jeden mit der Regelkennung
aus Teil 1; die Tabelle wird mechanisch gegen den tatsächlichen Prüflauf abgeglichen (Fehlercode
`example-findings`).

<!-- BEISPIEL-UNGUELTIG ANFANG -->
| Regel | Ort | Verstoß |
|---|---|---|
| HPR-META-011 | manifest.json | Schlüssel `kalkulation` ohne Präfix `x-<kennung>-` |
| HPR-VERS-002 | manifest.json#extensions[0] | `id` „kalk“ ist keine absolute URI; `required` fehlt |
| HPR-VERS-002 | ext/preise/tarife.json | Verzeichnis `ext/preise/` ohne Eintrag in `extensions` |
| HPR-VERS-003 | content/index.xhtml | Attribut `data-kalk-satz` ohne `x-`; Attribut `data-hp-kalk` im reservierten Präfix `hp` |
| HPR-VERS-003 | ext/kalk/kalk.css | Variable `--kalk-akzent` ohne `x-`; Lesesystem-Variable `--hp-font-size` gesetzt |
| HPR-VERS-005 | ext/kalk/kalk.css | `@import url("https://cdn.kalk.example.org/kalk.css")` zeigt nach außen |
| HPR-VERS-005 | ext/kalk/rechner.js | Skriptdatei unter `ext/` (Media-Type `text/javascript`) |
<!-- BEISPIEL-UNGUELTIG ENDE -->

Gegenprobe mit einem unabhängigen Werkzeug ([Q33]): epubcheck 5.4.0 meldet den externen Verweis
ebenfalls (`RSC-006`), die übrigen sechs Verstöße sind html-Pro-Regeln, die ein EPUB-Validator nicht
kennt. Ein Lesesystem zeigt auch dieses Dokument an ([HP-VERS-006](00-spezifikation.md#hp-vers-006--muss--basis)),
aber ein Prüfbericht ohne Fehler ist nicht möglich, also keine Konformitätsaussage.

---

## 8. Registry: Komponenten und Erweiterungen

### 8.1 Zweck und Verfahren

Die Registry hat zwei Listen: die **Komponenten des Standards** (`hp-…`, Teil des Standards,
Status je Komponente) und die **Kennungen Dritter** (`x-<kennung>-…`, freiwillig registriert, um
Kollisionen zu vermeiden). Eine Registrierung ändert nichts an den Rechten: Eine nicht registrierte
Kennung ist zulässig (Teil 0), eine registrierte ist nur bekannt gemacht. Die Registry ist die Datei
[`02-registry.json`](02-registry.json); die Tabellen unten sind daraus abgeleitet und werden
mechanisch abgeglichen (Fehlercodes `registry-*`).

Registrierung: Änderungsantrag vom Typ `Registrierung` mit Kennung, URI, Anbieter, Kontakt,
Beschreibungs-URL. Der Registrar prüft innerhalb von 14 Tagen: Kennung frei und nicht reserviert,
Syntax nach HPG-EXT-001, URI unter Kontrolle des Anbieters (HPG-EXT-002), Beschreibung öffentlich
abrufbar, Beschreibung verspricht nichts, was HP-VERS-007 verletzt. Vergabe nach Eingang; eine
Kennung wird nie neu vergeben (HPG-VER-005). Rückzug auf Wunsch des Anbieters: Status
`zurückgezogen`, Eintrag bleibt.

### 8.2 Anforderungen Registry

#### HPG-REG-001 · Muss · Basis
Die Registry MUSS als Datei `02-registry.json` Teil der Spezifikation sein, und die Tabellen 8.3
bis 8.5 MÜSSEN mit ihr übereinstimmen (gleiche Einträge, gleiche Status).

*Prüfverfahren:* JSON laden; jede Zeile der Tabellen zwischen den Markern `RESERVIERT`,
`REGISTRY-KOMPONENTEN`, `REGISTRY-ERWEITERUNGEN` mit den JSON-Einträgen vergleichen. Erwartetes
Ergebnis: Mengen gleich, Status gleich (mechanisch geprüft).
*Grundlage:* eigene Festlegung; Muster: maschinenlesbare Funktionsliste in Teil 3 ([Q4] §8.2).

#### HPG-REG-002 · Muss · Basis
Jeder Erweiterungseintrag MUSS `kennung`, `id`, `owner`, `contact`, `url`, `status` und
`registered` (Datum) enthalten; `status` MUSS `aktiv`, `aufgenommen`, `zurückgezogen` oder
`beispiel` sein; Kennungen MÜSSEN eindeutig sein und DÜRFEN NICHT reserviert sein (Ausnahme:
Status `beispiel`).

*Prüfverfahren:* JSON-Felder und Werte prüfen; Eindeutigkeit; Abgleich mit der Liste
`reserved`. Erwartetes Ergebnis: 0 Verstöße (mechanisch geprüft, Fehlercodes `registry-field`,
`registry-status`, `registry-duplicate`, `reserved-kennung`).
*Grundlage:* eigene Festlegung.

#### HPG-REG-003 · Muss · Basis
Der Registrar MUSS einen Registrierungsantrag innerhalb von 14 Tagen nach Eingang entscheiden,
Ablehnungen MÜSSEN einen der Gründe aus Abschnitt 8.1 nennen, und die Vergabe MUSS in der
Reihenfolge des Eingangs erfolgen.

*Prüfverfahren:* Antragsdatei nennt Eingang, Entscheidung, Grund. Erwartetes Ergebnis: Abstand
≤ 14 Tage; bei Ablehnung Grund aus der Liste.
*Grundlage:* eigene Festlegung; Muster: Expert Review bei IANA-Registrierungen ([Q28] §6.2, [Q26] §5).

#### HPG-REG-004 · Muss · Basis
Jede Komponente des Standards (`hp-…`) MUSS in der Registry mit `name`, `status` (`vorgesehen`,
`spezifiziert`, `veraltet`, `zurückgezogen`), `since` (Fassung), `spec` (Fundstelle) und
`releases` (Liste von `{version, integrity, url}` je veröffentlichter Fassung der Komponente)
stehen; ein Dokument DARF NICHT eine `hp-`-Komponente verwenden, die nicht mindestens den Status
`spezifiziert` hat.

*Prüfverfahren:* Registry prüfen; Prüfer gleicht `manifest.json#components[].name` mit Präfix
`hp-` gegen die Registry ab. Erwartetes Ergebnis: Felder vollständig; keine Komponente mit Status
`vorgesehen` in Dokumenten (Stand 11.10.2026: alle fünf Komponenten `vorgesehen`, `releases` leer;
keine darf in Dokumenten vorkommen).
*Grundlage:* [HP-SBX-001](00-spezifikation.md#hp-sbx-001--muss--lebendig) (Komponentendeklaration, SemVer, `integrity`); [HP-SBX-012](00-spezifikation.md#hp-sbx-012--kann--lebendig) (eigene Kopie derselben Version, Hash-gleich).

#### HPG-REG-005 · Kann · Basis
Ein Lesesystem KANN die `releases`-Hashes der Registry als Liste bekannter Komponentenfassungen
nutzen, um eine mitgelieferte Komponente gegen eine eigene Kopie zu ersetzen oder eine unbekannte
Fassung zu kennzeichnen; es DARF NICHT eine Komponente allein deshalb ausführen, weil sie in der
Registry steht.

*Prüfverfahren:* Lesesystem mit Registry-Kopie; Dokument mit Komponente, deren Hash in
`releases` steht, und eines mit unbekanntem Hash. Erwartetes Ergebnis: beide laufen nur nach den
Regeln von HP-SBX-010; die unbekannte Fassung ist gekennzeichnet.
*Grundlage:* [HP-SBX-010](00-spezifikation.md#hp-sbx-010--muss--lebendig), [HP-SBX-012](00-spezifikation.md#hp-sbx-012--kann--lebendig).

#### HPG-REG-006 · Kann · Basis
Ein Anbieter KANN eine Komponente `x-<kennung>-…` als Erweiterung registrieren; die Registry
speichert dann nur Kennung und URI, nicht den Code und keine Hashes.

*Prüfverfahren:* Registry-Eintrag mit Beschreibung einer Komponente. Erwartetes Ergebnis:
Eintrag wie jede Erweiterung; keine `releases`.
*Grundlage:* eigene Festlegung; Trennung von Standardkomponenten und Fremdkomponenten.

### 8.3 Reservierte Kennungen

<!-- RESERVIERT ANFANG -->
| Kennung | Grund |
|---|---|
| hp | Präfix dieser Spezifikation (HP-VERS-005) |
| hpro | Dateiendung und Werkzeugname der Referenzimplementierung |
| htmlpro | Name des Standards |
| x | Präfixzeichen der Drittanbieter-Namen; `x-x-…` wäre mehrdeutig |
| epub | Rückfallebene (W3C EPUB), Verwechslungsgefahr |
| ocf | Containerformat der Rückfallebene (W3C OCF) |
| asic | Signaturcontainer nach ETSI EN 319 162-1 |
| asice | Dateiendung nach ETSI EN 319 162-1 |
| xades | Signaturformat nach ETSI EN 319 132-1 |
| test | für Testsuiten reserviert, nie vergeben |
| example | für Beispiele in Dokumentation reserviert, nie vergeben |
| kalk | Beispiel-Erweiterung dieser Spezifikation (Abschnitt 7), nie an Dritte vergeben |
<!-- RESERVIERT ENDE -->

### 8.4 Komponenten des Standards

<!-- REGISTRY-KOMPONENTEN ANFANG -->
| Name | Status | Seit | Fundstelle | Paket |
|---|---|---|---|---|
| hp-table | vorgesehen | 0.1 | Teil 0 Abschnitt 2 (Beispiel), Teil 3 | P19 |
| hp-form | vorgesehen | 0.1 | docs/03 Abschnitt 1.4 | P6 |
| hp-chart | vorgesehen | 0.1 | docs/03 Abschnitt 1.4 | P15 |
| hp-calc | vorgesehen | 0.1 | docs/03 Abschnitt 1.4 | P19 |
| hp-signature-field | vorgesehen | 0.1 | docs/03 Abschnitt 1.5, Teil 0 HP-SIG-012 | P17 |
<!-- REGISTRY-KOMPONENTEN ENDE -->

Keine Komponente ist bisher spezifiziert; die Namen sind aus Teil 0 und [Q6] übernommen und
reserviert, damit Dritte sie nicht als `x-`-Kennung wählen. Die Spezifikation jeder Komponente
(Attribute, statisches Äquivalent, Datenkanal) ist Teil der Pakete P15, P6, P19, P17 und wird als
Nebenversion aufgenommen.

### 8.5 Registrierte Erweiterungen

<!-- REGISTRY-ERWEITERUNGEN ANFANG -->
| Kennung | URI | Anbieter | Status | Registriert |
|---|---|---|---|---|
| kalk | https://kalk.example.org/ns/hp-ext/kalk | fiktiver Anbieter (Beispiel in Teil 2, Abschnitt 7) | beispiel | 2026-10-11 |
<!-- REGISTRY-ERWEITERUNGEN ENDE -->

Es gibt noch keine echte Registrierung; der einzige Eintrag ist das Beispiel aus Abschnitt 7 mit
Status `beispiel` (HPC-0002).

---

## 9. Offene Punkte für eine Standardisierung bei W3C, OASIS oder ISO

Dieser Abschnitt behauptet keine Anerkennung und keinen Weg. Er stellt den gemessenen Stand neben
die veröffentlichten Bedingungen der drei Gremien und nennt, was fehlt. Ob ein Weg beschritten wird,
ist eine Entscheidung des Herausgebers bzw. des Umsetzer-Rats (Phase C).

### 9.1 Bedingungen der Gremien (mit Quelle) und Stand von html-Pro

| Weg | Bedingungen laut Gremium | Stand html-Pro (11.10.2026) | Fehlt |
|---|---|---|---|
| **W3C Community Group** | jeder kann vorschlagen; fünf Unterstützer; keine Gebühr, keine Mitgliedschaft; Teilnehmer unterzeichnen CLA und später FSA; Berichte sind keine W3C-Standards ([Q16], [Q17], [Q12], [Q32]) | ein Herausgeber, null weitere Unterstützer; keine CG gegründet | vier weitere Personen; Entscheidung, die Spezifikation unter CLA/FSA zu stellen (passt zu Abschnitt 2) |
| **W3C Working Group / Recommendation** | Charter mit AC-Review (≥ 28 Tage, [Q15] §4.4.1); Patent Policy für Teilnehmer ([Q14] §3); Wide Review mit horizontalen Gruppen (Barrierefreiheit, i18n, Datenschutz, Sicherheit, TAG) vor CR ([Q15] §6.2.2); Implementierungserfahrung vor Recommendation ([Q15] §6.3); Stufen WD → CR → PR → REC | Arbeitsentwurf 0.1, eine Implementierung (Referenz), keine Reviews | W3C-Mitglieder, die eine Charter tragen; zwei unabhängige Umsetzungen; alle horizontalen Reviews; eine Working Group, in deren Scope das Format passt (Publishing-Gruppen pflegen EPUB; ob sie ein Konkurrenzformat aufnähmen, ist offen) |
| **OASIS Technical Committee / OASIS Standard** | Minimum Membership: fünf Eligible Persons, davon mindestens zwei aus verschiedenen Organisationsmitgliedern ([Q19]); TC-Charter, IPR-Modus (RAND, RF on RAND, RF on Limited Terms, Non-Assertion, [Q20]); Stufen CSD → CS → OASIS Standard; drei Statements of Use, eines von einem Organisationsmitglied ([Q18] §2.8.1) | keine OASIS-Mitgliedschaft; null Statements of Use | fünf Personen aus mindestens zwei Mitgliedsorganisationen; drei Umsetzer mit Statement of Use; Wahl des IPR-Modus (RF on Limited Terms wie ODF wäre konsistent mit Abschnitt 2) |
| **ISO/IEC JTC 1 (SC 34, Dokumentbeschreibung)** | Einreichung über ein nationales Mitglied (für Österreich Austrian Standards; Verfahren nicht geprüft, Abschnitt 10) oder als PAS über einen anerkannten PAS-Submitter (W3C und OASIS sind anerkannt; Einzelpersonen nicht, [Q21]); PAS: Übersetzung 8 Wochen, DIS-Abstimmung 12 Wochen, Systematic Review nach 5 Jahren ([Q21]); EPUB 3.0.1 wurde so zu ISO/IEC 23736 ([Q22]) | nichts davon | zuerst einer der beiden oberen Wege; die PAS-Route setzt eine W3C-Recommendation oder einen OASIS Standard voraus |
| **ETSI** (für den Signaturteil) | Mitgliedschaft; FRAND-Regime ([Q23]) | html-Pro nutzt ASiC/XAdES nur, erweitert sie nicht | kein eigenes ETSI-Ziel; offen ist nur die Anfrage zur Endung (6.4 Punkt 3) |

### 9.2 Was heute für jeden der drei Wege fehlt (als Fragen)

1. **Unabhängige Umsetzungen:** Gibt es außer der Referenzimplementierung einen zweiten Erzeuger
   und ein zweites Lesesystem, die die Testsuite bestehen? (W3C CR, OASIS Statements of Use,
   HPG-GOV-005.) Stand: nein.
2. **Testsuite und Prüfer:** Existiert der Konformitätsprüfer gegen den vollständigen Regelkatalog
   (Paket S3) mit Gut- und Schlechtfällen? Stand: nur Teilprüfer (Spezifikationsstruktur,
   Erweiterungen); der Prüfer gegen Teil 1 ist offen.
3. **Horizontale Reviews:** Barrierefreiheit (EPUB Accessibility, WCAG — Prüflauf P8 offen),
   Internationalisierung (Schreibrichtung rechts-nach-links, vertikaler Text, Zahlformate in
   Teil 3: nicht behandelt), Datenschutz (Metadaten, Verlauf: HP-META-007), Sicherheit (Sandbox-
   Messung unter Linux/Android: [Q40] Frage 1): Wer führt sie durch, und wann?
4. **Träger:** Wer ist die juristische Person als Herausgeber (Einzelperson, Verein, Stiftung), und
   wer trägt Domäne, Repository und Registry dauerhaft? (HPG-GOV-001, HPG-VER-007.)
5. **Mitglieder:** Welche Organisationen würden eine W3C-Charter oder ein OASIS-TC tragen? Stand:
   keine Gespräche geführt.
6. **Media-Type:** Soll ein eigener Media-Type im Standards-Tree registriert werden ([Q26] §3.1,
   braucht eine anerkannte Standardisierungsorganisation oder IESG), oder bleibt
   `application/epub+zip` (HPG-NS-005)? Ein eigener Typ im `mimetype` bricht EPUB ([Q5] V7);
   nur ein Transport-Typ wäre denkbar.
7. **Dateiendung:** Gilt EN 319 162-1 §4.4.3.1 Nr. 1 auch für Container mit Original-Media-Type
   (Abschnitt 6.4 Punkt 3)? Anfrage an ETSI ESI steht aus.
8. **Verhältnis zu EPUB:** Ist html-Pro ein EPUB-Profil (dann wäre der Ort die
   Publishing-Gruppen des W3C) oder ein eigenes Format, das EPUB nur als Rückfallebene nutzt
   ([Q34] §5: „nicht als neuer Standard auftreten“)? Davon hängt der Weg ab.
9. **Rechtsprüfung:** Patentzusage (2.4), Lizenzkombination (2.2) und Beweiswert signierter
   Fassungen ([Q2] §19 Punkt 3) sind nicht juristisch geprüft.
10. **Name und Marke:** Ist „html-Pro“ als Marke frei und eintragbar? Nicht geprüft (Abschnitt 10).
    Ohne Marke ist HPG-LIC-007 eine Bitte.
11. **Finanzierung und Dauer:** W3C-Recommendation-Verfahren dauern erfahrungsgemäß Jahre (EPUB 3.3:
    Working Group ab 2020, Recommendation 2023/2026, [Q30]); wer finanziert Teilnahme, Reviews und
    Testsuite-Pflege?
12. **Sicherheitsmeldeweg:** HPG-GOV-008 ist formuliert, aber kein Kanal ist eingerichtet.

---

## 10. Nicht geprüft und offene Punkte dieses Teils

1. **Lizenz ist nicht festgelegt:** Abschnitt 2 ist ein Vorschlag; `LICENSE`-Dateien und
   `license`-Felder fehlen im Repository (P14). Die Patentzusage in 2.4 ist nicht abgegeben
   (Beitragendenverzeichnis: `ausstehend`).
2. **Rechtsprüfung:** Keine der Aussagen in Abschnitt 2 ist Rechtsberatung; der Text der Patentzusage
   ist ungeprüft. Die Spalte „Einschätzung“ in 2.5 beruht auf Lektüre der Policies, nicht auf einer
   Patentrecherche.
3. **Nicht abrufbar bei der Prüfung:** ISO-Seiten (403), die Originalseite der OWFa (404; Text über
   Lizenzdatenbank gelesen), die Seite von Austrian Standards zum Mitmachen (404); die
   OASIS-Definition „Minimum Membership“ und die IPR-Modi wurden aus den OASIS-Policies gelesen.
   Das Verfahren für eine nationale ISO-Einreichung aus Österreich ist **nicht geprüft**.
4. **Domäne und Marke:** Verfügbarkeit einer Domäne für `<basis>` und Markenfreiheit von „html-Pro“
   nicht geprüft (keine Abfrage von Registern aus dem Arbeitscontainer).
5. **Fremde Signaturwerkzeuge:** Verhalten von DigiDoc, RTR-Prüfdienst, DSS-Demo mit `.asice` und
   EPUB-`mimetype` nicht geprüft ([Q5] §7).
6. **Prüfverfahren, die eine Fassung ≥ Kandidat voraussetzen** (HPG-LIC-001/003, HPG-GOV-002/003/005/006,
   HPG-VER-002/003/006/007/008, HPG-NS-002 für veröffentlichte Fassungen), **oder ein Lesesystem**
   (HPG-NS-003/006/007, HPG-EXT-004, HPG-REG-005) konnten nicht ausgeführt werden; sie sind
   formuliert, die Werkzeuge entstehen in P4 ff. Ausgeführt wurden die mechanische Prüfung dieses
   Teils, der Abgleich Registry/Tabellen, der Erweiterungsprüfer auf beiden Beispielen mit
   Gegenprobe epubcheck und `hpro inspect`, die Endungsmessung mit epubcheck und der
   Referenzimplementierung, und die Erreichbarkeit der Quellen ([Q33]).
7. **Repository ist nicht öffentlich:** HPG-GOV-007 ist bis zur Veröffentlichung nicht erfüllt.

---

## 11. Konformität

### 11.1 Zuordnung der Anforderungen

Subjekte: H Herausgeber, B Beitragender, R Registrar, A Anbieter, D Dokument, E Erzeuger,
L Lesesystem, P Prüfer. Die Tabelle wird mechanisch gegen die Überschriften geprüft.

<!-- KONFORMITAETSTABELLE ANFANG -->
| Kennung | Grad | Stufe | Subjekt | Kurztitel |
|---|---|---|---|---|
| HPG-LIC-001 | Muss | Basis | H | Spezifikationstext unter CC-BY-4.0 |
| HPG-LIC-002 | Muss | Basis | H, B | Patentzusage vor Aufnahme eines Beitrags |
| HPG-LIC-003 | Muss | Basis | H | Referenzimplementierung unter Apache-2.0 |
| HPG-LIC-004 | Muss | Basis | H | Testsuite und Beispiele unter CC0-1.0 |
| HPG-LIC-005 | Muss | Basis | H | Fremdrechte-Register vollständig |
| HPG-LIC-006 | Muss | Basis | H | Keine FRAND-Technik im Pflichtteil |
| HPG-LIC-007 | Soll | Basis | E, L, A | Name nur mit Prüfbericht |
| HPG-GOV-001 | Muss | Basis | H | Genau ein Herausgeber, benannt |
| HPG-GOV-002 | Muss | Basis | H, B | Jede Änderung über Änderungsantrag |
| HPG-GOV-003 | Muss | Basis | H | Einspruchsfrist und begründete Entscheidung |
| HPG-GOV-004 | Muss | Basis | H | Änderungsverzeichnis lückenlos mit Status |
| HPG-GOV-005 | Muss | Basis | H | Zwei Umsetzungen vor neuer Muss-Anforderung ab 1.0 |
| HPG-GOV-006 | Muss | Basis | H | Wechsel in Phase B bei drei Umsetzern |
| HPG-GOV-007 | Muss | Basis | H | Öffentlich und gebührenfrei |
| HPG-GOV-008 | Soll | Basis | H | Sicherheitsmeldeweg, 90 Tage |
| HPG-VER-001 | Muss | Basis | H | Version und Status in jeder Kopfzeile |
| HPG-VER-002 | Muss | Basis | H | Nebenversion bleibt kompatibel |
| HPG-VER-003 | Muss | Basis | H, L | Hauptversion mit Migrationsregel, Lesen abwärtskompatibel |
| HPG-VER-004 | Muss | Basis | H | Erratum ändert kein Prüfergebnis |
| HPG-VER-005 | Muss | Basis | H | Kennungen stabil |
| HPG-VER-006 | Muss | Basis | H, L | Veralten vor Entfernen |
| HPG-VER-007 | Muss | Basis | H | Fassungen dauerhaft abrufbar |
| HPG-VER-008 | Muss | Basis | H, E, L, P | Testsuite ist Teil der Fassung |
| HPG-VER-009 | Kann | Basis | H, L | 0.x darf brechen, gekennzeichnet |
| HPG-NS-001 | Muss | Basis | H, D | URI-Muster |
| HPG-NS-002 | Muss | Basis | H | Platzhalter vor Kandidat ersetzen |
| HPG-NS-003 | Muss | Basis | H, E, L, P | Namensraum-URIs nicht abrufen |
| HPG-NS-004 | Muss | Basis | R, D | Reservierte Kennungen |
| HPG-NS-005 | Muss | Basis | H, E | Kein eigener Media-Type in 0.x |
| HPG-NS-006 | Muss | Basis | E, L | Endungen `.hpro` schreiben, `.hpro`/`.epub` öffnen, `.asice`/`.sce` sollen |
| HPG-NS-007 | Soll | Basis | L | Dateizuordnung nur `.hpro` |
| HPG-EXT-001 | Muss | Basis | R, D | Kennungssyntax |
| HPG-EXT-002 | Muss | Basis | D, A | Erweiterungs-URI unter Kontrolle des Anbieters |
| HPG-EXT-003 | Soll | Basis | D, P | Verwendete Kennung deklariert |
| HPG-EXT-004 | Muss | Basis | D, A | Ohne Erweiterung derselbe Text |
| HPG-EXT-005 | Soll | Basis | E, A | `required` nur mit Begründung |
| HPG-EXT-006 | Soll | Basis | P | Nicht registrierte Kennung als Hinweis |
| HPG-EXT-007 | Muss | Basis | H, L | Aufnahme in den Standard: Namenswechsel |
| HPG-REG-001 | Muss | Basis | H | Registry-Datei und Tabellen synchron |
| HPG-REG-002 | Muss | Basis | R | Pflichtfelder und Status der Einträge |
| HPG-REG-003 | Muss | Basis | R | Entscheidung in 14 Tagen, Reihenfolge des Eingangs |
| HPG-REG-004 | Muss | Basis | H, D | Komponenten des Standards mit Status und `releases` |
| HPG-REG-005 | Kann | Basis | L | `releases`-Hashes als bekannte Fassungen |
| HPG-REG-006 | Kann | Basis | A | Fremdkomponenten als Erweiterung |
<!-- KONFORMITAETSTABELLE ENDE -->

### 11.2 Summen

| Stufe | Muss | Soll | Kann | Summe |
|---|---|---|---|---|
| Basis | 35 | 6 | 3 | 44 |
| Lebendig | 0 | 0 | 0 | 0 |
| Signiert | 0 | 0 | 0 | 0 |
| Archiv | 0 | 0 | 0 | 0 |
| **alle** | **35** | **6** | **3** | **44** |

---

## 12. Quellen

Alle externen Quellen am 11.10.2026 abgerufen, soweit nicht anders vermerkt; HTTP-Status in [Q33].

- [Q1] html-Pro, *10 – Anspruch und Funktionsprofil* (verbindlich; §4 „Der Standard selbst“) – [`docs/10-anspruch-und-funktionsprofil.md`](../10-anspruch-und-funktionsprofil.md)
- [Q2] html-Pro, *Spezifikation Teil 0: Kern* – [`00-spezifikation.md`](00-spezifikation.md)
- [Q3] html-Pro, *Spezifikation Teil 1: Konformität und Prüfregeln* – [`01-konformitaet.md`](01-konformitaet.md)
- [Q4] html-Pro, *Spezifikation Teil 3: Tabellen und Formeln* – [`03-tabellen-und-formeln.md`](03-tabellen-und-formeln.md)
- [Q5] html-Pro, *05 – Prototyp-Ergebnisse* (§5.1 Normauswertung, §6.2 Dateiendung, §7, §8) – [`docs/05-prototyp-ergebnisse.md`](../05-prototyp-ergebnisse.md)
- [Q6] html-Pro, *03 – Konzept* (§1.4 Komponenten, §5.5 Normungsweg, Nachtrag N.1/N.2) – [`docs/03-konzept.md`](../03-konzept.md)
- [Q7] IETF, *RFC 2119* und *RFC 8174* – https://www.rfc-editor.org/rfc/rfc2119 · https://www.rfc-editor.org/rfc/rfc8174
- [Q8] SPDX, *License List* (Version 3.29.0, 2026-09-16; Kennungen Apache-2.0, MIT, MPL-2.0, CC-BY-4.0, CC0-1.0, W3C-20150513, OFL-1.1 vorhanden) – https://spdx.org/licenses/
- [Q9] Creative Commons, *Attribution 4.0 International, Legal Code* (§2(b)(2): keine Patent- und Markenlizenz; §3(a) Namensnennung) – https://creativecommons.org/licenses/by/4.0/legalcode
- [Q10] Apache Software Foundation, *Apache License, Version 2.0* (§2 Urheberrecht, §3 Patentlizenz mit Abwehrklausel, §4 Weitergabe) – https://www.apache.org/licenses/LICENSE-2.0
- [Q11] Creative Commons, *CC0 1.0 Universal, Legal Code* (§2 Verzicht, §4a Patente und Marken nicht erfasst) – https://creativecommons.org/publicdomain/zero/1.0/legalcode
- [Q12] W3C, *Community Final Specification Agreement* (§2.1 Urheberrecht, §3.1 Essential Claims, §10.3 Definition, §10.7.5 royalty-frei) – https://www.w3.org/community/about/process/final/
- [Q13] Open Web Foundation, *OWFa 1.0 Final Specification Agreement* (§2.1 Urheberrecht, §2.2 Namensnennung, §3 Patente) – Originalseite bei Abruf 404; Text gelesen über https://scancode-licensedb.aboutcode.org/owfa-1.0.html
- [Q14] W3C, *Patent Policy* (§3 Pflichten der Working-Group-Teilnehmer, §5 RF-Lizenzbedingungen, §8.1 Essential Claims) – https://www.w3.org/policies/patent-policy/
- [Q15] W3C, *Process Document* (§4 Charter und AC-Review, §5.2 Konsens, §6.2 Wide Review, §6.3 Stufen WD/CR/PR/REC, Implementation Experience) – https://www.w3.org/policies/process/
- [Q16] W3C, *Community and Business Group Process* (Gründung mit fünf Unterstützern, CLA/FSA, Berichte sind keine Standards, Übergang in Working Groups) – https://www.w3.org/community/about/process/
- [Q17] W3C, *Community Groups* (keine Gebühr, keine Mitgliedschaft nötig) – https://www.w3.org/community/
- [Q18] OASIS, *Technical Committee Process* (§1.2 Gründung, §2.5 CSD, §2.7 CS, §2.8 OASIS Standard, §2.8.1 drei Statements of Use) – https://www.oasis-open.org/policies-guidelines/tc-process-2017-05-26/
- [Q19] OASIS, *Defined Terms* („Minimum Membership“: fünf Eligible Persons, mindestens zwei aus verschiedenen Organisationsmitgliedern; „Statement of Use“) – https://www.oasis-open.org/policies-guidelines/oasis-defined-terms-2018-05-22/
- [Q20] OASIS, *Intellectual Property Rights Policy* (Modi RAND, RF on RAND Terms, RF on Limited Terms, Non-Assertion) – https://www.oasis-open.org/policies-guidelines/ipr/
- [Q21] W3C, *PAS transposition process* (ISO/IEC JTC 1: Übersetzung 8 Wochen, DIS-Abstimmung 12 Wochen, Systematic Review; W3C und OASIS als PAS-Submitter) – https://www.w3.org/guide/process/pas-transposition-process.html
- [Q22] ISO, *ISO/IEC 23736-1:2020 Information technology — Digital publishing — EPUB 3.0.1 — Part 1* (JTC 1/SC 34) – https://www.iso.org/standard/76792.html (403 bei automatisiertem Abruf; Angaben aus Suchtreffern)
- [Q23] ETSI, *Intellectual Property Rights* (FRAND-Grundsatz, keine Präferenz für ein Lizenzmodell) – https://www.etsi.org/intellectual-property-rights
- [Q24] IETF, *RFC 8179 / BCP 79, Intellectual Property Rights in IETF Technology* (§5 Offenlegung, §7 Präferenz, keine RF-Pflicht) – https://www.rfc-editor.org/rfc/rfc8179
- [Q25] IANA, *Media Type application/epub+zip* (W3C, EPUB 3, Endung `.epub`, Stand 26.06.2025) – https://www.iana.org/assignments/media-types/application/epub+zip
- [Q26] IETF, *RFC 6838, Media Type Specifications and Registration Procedures* (§3 Trees, §3.4 `x-` veraltet, §4.4 Spezifikation, Appendix A) – https://www.rfc-editor.org/rfc/rfc6838
- [Q27] IETF, *RFC 2606, Reserved Top Level DNS Names* (§2 `.example`) – https://www.rfc-editor.org/rfc/rfc2606
- [Q28] IETF, *RFC 8141, Uniform Resource Names (URNs)* (§5.1 NID-Syntax, §6.2 Registrierung mit Expert Review) – https://www.rfc-editor.org/rfc/rfc8141
- [Q29] W3C, *Document License (2023)* (keine abgeleiteten Spezifikationen) – https://www.w3.org/copyright/document-license-2023/
- [Q30] W3C, *EPUB 3.3*, Recommendation vom 13.01.2026 unter W3C Patent Policy (§1.2 `.epub` informativ, §4.3.3 `mimetype` normativ) – https://www.w3.org/TR/epub-33/
- [Q31] *Semantic Versioning 2.0.0* (MAJOR inkompatibel, MINOR kompatible Ergänzung, PATCH Korrektur; §4 0.y.z) – https://semver.org/
- [Q32] W3C, *Community Contributor License Agreement* (§2.1 Urheberrecht, §3.1 Essential Claims in Beiträgen, §6 Verhältnis zum FSA, §12.8 royalty-frei) – https://www.w3.org/community/about/process/cla/
- [Q33] html-Pro, Belege S4 (Prüfläufe, Endungsmessung, Quellenstatus) – [`docs/belege/S4/README.md`](../belege/S4/README.md)
- [Q34] html-Pro, *07 – Foren und Nutzererwartungen* (§5 Positionierung, §7 Preis und Lizenzform) – [`docs/07-foren-und-nutzererwartungen.md`](../07-foren-und-nutzererwartungen.md)
- [Q35] PKWARE, *APPNOTE.TXT – .ZIP File Format Specification* (Nutzungserlaubnis zum Lesen und Schreiben; Patentvorbehalt für starke Verschlüsselung und Patching) – https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
- [Q36] WHATWG, *Intellectual Property Rights Policy* (§2.6 royalty-frei, §5.1 Beiträge und Workstream-Teilnehmer, §5.4 Review Drafts) – https://whatwg.org/ipr-policy
- [Q37] OASIS, *OpenDocument TC – IPR Statements* („RF on Limited Terms Mode“) – https://www.oasis-open.org/committees/office/ipr.php
- [Q38] Ecma International, *Policies by IPR* (Code of Conduct in Patent Matters, Royalty-Free-Option) – https://ecma-international.org/policies/by-ipr/
- [Q39] schema.org, *accessMode* (Vokabular unter CC-BY-SA 3.0) – https://schema.org/accessMode
- [Q40] html-Pro, *06 – Plattform und Funktionsmatrix* (§5 offene Fragen 1 und 4) – [`docs/06-plattform-und-funktionsmatrix.md`](../06-plattform-und-funktionsmatrix.md)
- [Q41] IEEE SA, *Patent Policy* (RAND; Letter of Assurance kann royalty-frei sein) – https://standards.ieee.org/about/policies/patents/
- [Q42] Unicode Consortium, *Unicode License v3* – https://www.unicode.org/license.txt
- [Q43] JSON Schema, *Specification* (Internet-Draft, Entwurf 2020-12) – https://json-schema.org/specification
