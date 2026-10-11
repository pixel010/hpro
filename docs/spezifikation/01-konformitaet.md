# html-Pro 0.1 – Spezifikation (Teil 1: Konformität und Prüfregeln)

**Status:** Arbeitsentwurf 0.1 · **Stand:** 11.10.2026 · **Paket:** S2 aus [`docs/08-arbeitsplan.md`](../08-arbeitsplan.md)
**Grundlage:** [Teil 0 (Kern)](00-spezifikation.md) mit seinen 160 Anforderungen; [`docs/10-anspruch-und-funktionsprofil.md`](../10-anspruch-und-funktionsprofil.md) (sieben Zusagen, verbindlich)
**Mechanische Prüfung dieses Dokuments:** [`scripts/check-konformitaet.mjs`](../../scripts/check-konformitaet.mjs) (läuft in `npm test`), Belege in [`docs/belege/S2/`](../belege/S2/README.md)
**Maschinenlesbare Fassung des Regelkatalogs:** [`01-regelkatalog.json`](01-regelkatalog.json) (aus diesem Dokument erzeugt, Gleichstand wird geprüft)
**Befundformat:** [`schema/konformitaetsbericht.schema.json`](schema/konformitaetsbericht.schema.json)

---

## 0. Zweck und Geltungsbereich

Teil 0 ([Q1]) sagt, was ein Dokument, ein Erzeuger, ein Bearbeiter und ein Lesesystem leisten müssen.
Dieser Teil macht daraus ein **Prüfregelwerk**: Er legt fest, wie aus einer Anforderung ein
**Befund** wird, welche **Fehlerklasse** ein Befund hat, wie sich aus den Befunden das **Urteil je
Konformitätsstufe** ergibt, und in welcher Form ein Prüfer das ausgibt. Die Aussage „ist html-Pro
0.1“ ist damit an ein messbares Ergebnis gebunden, so wie es [Q2] Abschnitt 4b verlangt.

Zwei Regelkataloge:

- **Dokumentregeln (`HPR-…`, Abschnitt 5):** werden von einem Prüfprogramm auf eine Datei
  angewendet und erzeugen Befunde. Das ist der Katalog, den der Konformitätsprüfer (Paket S3)
  umsetzt.
- **Lesesystemregeln (`HPL-…`, Abschnitt 9):** werden mit Testdokumenten gegen ein Lesesystem,
  einen Bearbeiter oder einen Erzeuger geprüft. Sie decken vor allem die Sicherheitsregeln der
  Sandbox ab, die sich an einer Datei nicht beobachten lassen.

Dazu die normativen Festlegungen, die Teil 0 an diesen Teil delegiert hat: die Fehlerklassen
([HP-VERS-008](00-spezifikation.md#hp-vers-008--kann--basis), Abschnitt 16.1 in Teil 0), das
Protokoll des Dokumentdaten-Kanals ([HP-SBX-008](00-spezifikation.md#hp-sbx-008--muss--lebendig),
Abschnitt 8), und die Regeln für signierte und eingefrorene Fassungen (Abschnitt 7).

Dieser Teil fügt keine neue Anforderung an Dokumente oder Lesesysteme hinzu. Jede Regel nennt die
Anforderung aus Teil 0, die sie prüft (`*Bezug:*`); wo eine Regel eine Anforderung präzisiert, steht
das in der Regel. Was Teil 0 nicht verlangt, kann hier keinen Fehler ergeben.

---

## 1. Konventionen

### 1.1 Normative Wörter

Wie in Teil 0, Abschnitt 1.1: **MUSS**, **DARF NICHT**, **SOLL**, **SOLL NICHT**, **KANN** nach
RFC 2119 und RFC 8174. Die normativen Sätze dieses Teils richten sich an den **Prüfer**
(Konformitätsprüfer, Subjekt P in Teil 0) und, in Abschnitt 7 und 8, an Bearbeiter und Lesesysteme.

### 1.2 Regelkennungen

| Form | Bedeutung | Beispiel |
|---|---|---|
| `HPR-<BEREICH>-<NNN>` | Dokumentregel (html-Pro Regel), erzeugt Befunde an einer Datei | `HPR-CONT-016` |
| `HPL-<BEREICH>-<NNN>` | Lesesystemregel, geprüft mit Testdokumenten gegen Software | `HPL-SBX-002` |

Bereiche sind die von Teil 0: `CONT`, `INH`, `ADR`, `NEST`, `PROF`, `SBX`, `LOCK`, `SIG`, `PRINT`,
`META`, `VERS`, `MIN`; bei `HPL` zusätzlich `RS`. Die Nummern je Bereich und Katalog sind lückenlos
ab 001. **Eine Kennung ist stabil:** Sie wird nie umgedeutet und nie wiederverwendet. Eine
zurückgezogene Regel bleibt mit dem Vermerk „zurückgezogen“ und ohne Prüfung stehen; ihre Nummer
bleibt belegt. Eine Regel, deren Prüfung sich ändert, bekommt eine neue Kennung, die alte wird
zurückgezogen. Prüfprogramme und Berichte verweisen nur über die Kennung auf eine Regel; der
Meldungstext ist nicht stabil.

### 1.3 Aufbau einer Dokumentregel

```
#### HPR-<BEREICH>-<NNN> · <Klasse> · <Stufe>
<Kurztitel, ein Satz>

*Bezug:* HP-… (eine oder mehrere Anforderungen aus Teil 0)
*Geltung:* Container | Fassung | Hauptfassung
*Mittel:* statisch | rendering | extern | signatur | manuell
*Prüfung:* … (was das Prüfprogramm tut; jede festgestellte Abweichung ist ein Befund)
*Ort:* … (Art der Ortsangabe des Befunds, Abschnitt 4.2)
*Meldung:* … (Vorlage mit Platzhaltern aus Abschnitt 4.6)
*Einstufung:* … (nur wenn die Klasse vom Grad des Bezugs abweicht, Abschnitt 2.3)
*Begründung:* … (Pflicht im Bereich SBX: welche Gefahr die Regel abwehrt)
```

- **Klasse:** `Fatal`, `Fehler`, `Warnung`, `Hinweis` (Abschnitt 2).
- **Stufe:** `Basis`, `Lebendig`, `Signiert`, `Archiv`; sie MUSS mit der Stufe jeder Anforderung
  im Bezug übereinstimmen (mechanisch geprüft, Fehlercode `level-mismatch`).
- **Geltung:** `Container` – einmal je Datei; `Fassung` – einmal je Fassung (Hauptfassung und jede
  eingefrorene Fassung, jeweils mit dem Profil ihres Manifests); `Hauptfassung` – nur für die
  Hauptfassung.
- **Mittel:** `statisch` – Lesen und Parsen der Datei genügt; `rendering` – braucht eine
  Browser-Engine; `extern` – braucht ein externes Werkzeug (EPUB-Validator, PDF/A-Validator);
  `signatur` – braucht eine AdES-Validierung; `manuell` – braucht menschliches Urteil. Ein
  Prüfprogramm, dem ein Mittel fehlt, meldet die Regel als **nicht geprüft** (Abschnitt 2.4), nie
  als bestanden.

Der Aufbau einer Lesesystemregel steht in Abschnitt 9.1.

### 1.4 Begriffe

| Begriff | Bedeutung |
|---|---|
| Prüfgegenstand | die Datei (Container) mit allen Fassungen |
| Fassung | Hauptfassung oder eingefrorene Fassung (Teil 0, 1.4); jede hat ein eigenes Manifest und Profil |
| Prüflauf | eine Anwendung des Regelkatalogs auf einen Prüfgegenstand durch ein Prüfprogramm |
| Befund | eine festgestellte Abweichung: Regel, Klasse, Ort, Meldung (Abschnitt 4.1) |
| Urteil | Ergebnis je Stufe: `bestanden`, `nicht bestanden`, `unbestimmt` (Abschnitt 3.4) |
| beanspruchte Stufe | Stufe, die ein Dokument durch Profil oder Signatur beansprucht (Abschnitt 3.2) |
| Bericht | maschinenlesbares Ergebnis eines Prüflaufs (Abschnitt 4.3) |

---

## 2. Fehlerklassen

### 2.1 Die vier Klassen

| Klasse | Code | Bedeutung | Wirkung auf das Urteil | Wirkung auf den Prüflauf | Grad in Teil 0 |
|---|---|---|---|---|---|
| **Fataler Fehler** | `FATAL` | Der Prüfgegenstand oder eine Fassung ist nicht als html-Pro verarbeitbar (kein ZIP, kein Manifest, verschlüsselt) | alle Stufen des betroffenen Gegenstands `nicht bestanden` | Prüfung des betroffenen Gegenstands bricht ab; abhängige Regeln werden `nicht geprüft` mit Grund `fatal` | Muss |
| **Fehler** | `ERROR` | Eine Muss-Anforderung ist verletzt | die Stufe der Regel (und jede Stufe, die sie enthält) `nicht bestanden` | Prüfung läuft weiter | Muss |
| **Warnung** | `WARNING` | Eine Soll-Anforderung ist verletzt | keine; wird im Bericht geführt | läuft weiter | Soll |
| **Hinweis** | `INFO` | Eine Kann-Anforderung ist ungenutzt oder unvollständig genutzt, oder eine Beobachtung ohne Verstoß (Information) | keine | läuft weiter | Kann |

Die Codes sind die Werte des Feldes `class` im Bericht. Die Zuordnung zu den Graden setzt
Teil 0, Abschnitt 16.1 um: Muss ergibt Fehler, Soll ergibt Warnungen, Kann ergibt Hinweise. Die
vier Stufen entsprechen den Schweregraden `fatal`, `error`, `warning`, `info` des EPUB-Validators
([Q11]), damit dessen Meldungen ohne Umdeutung übernommen werden können (HPR-CONT-024).

### 2.2 Regeln für den Prüfer

- Der Prüfer MUSS jeden Befund mit der Klasse der Regel ausgeben und DARF NICHT eine Klasse
  herabstufen, unterdrücken oder einen Befund mehrfach zählen.
- Der Prüfer KANN eine Betriebsart „streng“ anbieten, in der Warnungen wie Fehler das Urteil
  bestimmen; der Bericht MUSS diese Betriebsart nennen (`strict: true`), und eine
  Konformitätsaussage nach Abschnitt 3.5 wird nur aus der Standardbetriebsart abgeleitet.
- Ein fataler Fehler MUSS als erster Befund des betroffenen Gegenstands stehen; danach folgen nur
  Einträge `nicht geprüft`.
- Fehler und Warnungen MÜSSEN einen Ort nach Abschnitt 4.2 tragen, sobald sich der Befund auf eine
  Datei, ein Element oder ein Manifestfeld bezieht.

### 2.3 Abweichende Einstufung

Die Klasse einer Regel folgt dem Grad ihres Bezugs. Sie DARF davon nur abweichen, wenn die Regel
ein Feld `*Einstufung:*` mit einem dieser Wörter trägt (mechanisch geprüft):

| Einstufung | Bedeutung | Erlaubte Abweichung |
|---|---|---|
| `Teilsatz` | die Regel prüft einen Teilsatz der Anforderung, der einen anderen Grad hat als die Anforderung insgesamt (z. B. „SOLL `urn:uuid:`“ in einer Muss-Anforderung) | Klasse nach dem Grad des Teilsatzes |
| `Nutzung` | der Bezug ist eine Kann- oder Soll-Anforderung, die die Struktur eines optionalen Merkmals festlegt; wird das Merkmal genutzt, ist seine Struktur verbindlich | Fehler statt Hinweis bzw. Warnung |
| `Unbestimmt` | kein Verstoß des Dokuments, aber die Stufe lässt sich nicht bestätigen (z. B. Zertifikatskette ohne Vertrauensanker) | Hinweis; Urteil der Stufe `unbestimmt` |
| `Information` | Beobachtung ohne Verstoß, die ein Lesesystem anzeigen muss (z. B. unsignierte Dateien) | Hinweis |

### 2.4 Nicht geprüft

Eine Regel, die ein Prüfprogramm nicht ausführen kann, MUSS im Bericht unter `notChecked` stehen,
mit der Kennung und einem Grund aus: `missing-means` (Mittel fehlt, z. B. keine Browser-Engine),
`fatal` (abhängig von einem fatalen Fehler), `not-applicable` wird **nicht** verwendet (eine
Regel, deren Voraussetzung nicht vorliegt, gilt als bestanden mit null Befunden), `manual`
(braucht menschliches Urteil), `tool-error` (Werkzeug lief nicht). Nicht geprüfte Muss-Regeln
machen das Urteil der Stufe `unbestimmt` (Abschnitt 3.4).

---

## 3. Konformitätsstufen und Urteil

### 3.1 Stufen

| Stufe | Enthält | Gilt für Dokumente, die … | Regeln dieser Stufe |
|---|---|---|---|
| **Basis** | – | jedes Dokument | Abschnitt 5, Stufe Basis |
| **Lebendig** | Basis | eine Fassung mit Profil `interactive` haben | Stufe Lebendig |
| **Signiert** | Basis | mindestens eine Signatur tragen oder Profil `signed`/`archive` haben | Stufe Signiert |
| **Archiv** | Basis, Signiert | Profil `archive` haben | Stufe Archiv |

Lebendig und Signiert sind unabhängig: ein Dokument mit lebendiger Hauptfassung und signierter
eingefrorener Fassung beansprucht beide (Zusage 5 in [Q2]).

### 3.2 Beanspruchte Stufen

Der Prüfer MUSS die beanspruchten Stufen aus dem Prüfgegenstand ableiten, nicht aus einer
Behauptung des Aufrufers:

| Beobachtung | Beanspruchte Stufen |
|---|---|
| immer | Basis |
| eine Fassung hat Profil `interactive` | Lebendig |
| `META-INF/signatures.xml` oder `META-INF/signatures*.xml` enthält mindestens eine `ds:Signature` | Signiert |
| eine Fassung hat Profil `signed` | Signiert |
| eine Fassung hat Profil `archive` | Signiert, Archiv |

Der Aufrufer KANN zusätzliche Stufen anfordern (`--level`); dann werden deren Regeln ebenfalls
ausgeführt und im Urteil geführt. Er DARF NICHT eine beanspruchte Stufe abwählen.

### 3.3 Prüfgegenstand und Fassungen

1. Regeln mit Geltung `Container` werden einmal ausgeführt.
2. Die Hauptfassung wird mit dem Profil aus `manifest.json#conformsTo` geprüft (Geltung `Fassung`
   und `Hauptfassung`).
3. Jede eingefrorene Fassung aus `manifest.json#renditions` wird mit dem Profil ihres eigenen
   Manifests geprüft (Geltung `Fassung`); ihre Dateimenge sind die Einträge unter
   `renditions/<id>/`. Jeder Befund trägt `rendition: "<id>"`; Befunde der Hauptfassung tragen
   `rendition: null`.
4. Signaturen werden den Fassungen über ihre Referenzen zugeordnet (Abschnitt 7.1): eine Signatur,
   deren Referenzen alle unter `renditions/<id>/` oder auf `META-INF/container.xml` zeigen, gehört
   zu dieser Fassung; jede andere zur Hauptfassung.
5. Anhänge des Typs `application/epub+zip` unter `attachments/` werden NICHT rekursiv geprüft; der
   Prüfer KANN sie auf Verlangen als eigenen Prüfgegenstand prüfen
   ([HP-NEST-004](00-spezifikation.md#hp-nest-004--muss--basis), getrennte Signaturen).

### 3.4 Urteil je Stufe

Für jede beanspruchte Stufe S gilt, mit E(S) = Menge der Stufen, die S enthält, einschließlich S:

```
wenn ein Befund der Klasse FATAL vorliegt                        → nicht bestanden
sonst wenn ein Befund der Klasse ERROR einer Regel mit Stufe ∈ E(S) vorliegt
                                                                   → nicht bestanden
sonst wenn eine Regel der Klasse ERROR oder FATAL mit Stufe ∈ E(S) „nicht geprüft“ ist
   oder ein Befund mit Einstufung „Unbestimmt“ für eine Stufe ∈ E(S) vorliegt
                                                                   → unbestimmt
sonst                                                              → bestanden
```

Warnungen und Hinweise ändern das Urteil nicht. Das Urteil einer Fassung ergibt sich aus den
Befunden ihrer Regeln (Geltung `Fassung`/`Hauptfassung`) und den Container-Befunden; das Urteil
des Dokuments ist das schlechteste Urteil aller Fassungen (`nicht bestanden` < `unbestimmt` <
`bestanden`).

### 3.5 Konformitätsaussage

Eine Konformitätsaussage lautet „html-Pro 0.1, <Klasse>, Stufe <S>“ (Klassen nach Teil 0, 16.4) und
DARF NUR abgegeben werden, wenn das Urteil für S `bestanden` ist, in der Standardbetriebsart, mit
einem Prüfprogramm, das alle Muss-Regeln der Stufe ausführen konnte. Für die
Erzeuger-Konformität eines Dokuments genügt der Dokumentkatalog (`HPR`); für Leser-, Bearbeiter-
und Prüfer-Konformität sind die Lesesystemregeln (`HPL`) mit Testdokumenten zu prüfen. Ein
Prüfer, der die Aussage im Container ablegt, nutzt `data/conformance-report.json` nach
[HP-VERS-008](00-spezifikation.md#hp-vers-008--kann--basis) im Format von Abschnitt 4.3; er MUSS den
Bericht vor dem Ablegen in `manifest.json#resources` eintragen (der Bericht ist eine Ressource) und
MUSS dafür ein Dokument ohne Signatur über die Hauptfassung voraussetzen (Abschnitt 7.2).

### 3.6 Was ein Dateiprüfer beurteilen kann

Der Dokumentkatalog prüft Anforderungen mit Subjekt **D** (Dokument) und solche mit Subjekt E, deren
Ergebnis an der Datei sichtbar ist. Anforderungen an Lesesysteme (L), Bearbeiter (B) und Erzeuger
(E) ohne Spur in der Datei sind nicht Gegenstand eines Dateiprüfers; für sie gilt Abschnitt 9. Die
Abdeckungstabelle in Abschnitt 10 nennt für jede Anforderung aus Teil 0 die Regeln beider Kataloge.
Jede Muss-Anforderung mit Subjekt D hat mindestens eine Dokumentregel (mechanisch geprüft,
`coverage-gap`).

---

## 4. Befundformat

### 4.1 Felder eines Befunds

| Feld | Typ | Pflicht | Inhalt |
|---|---|---|---|
| `rule` | string | ja | Regelkennung, z. B. `HPR-CONT-016` |
| `class` | `FATAL` \| `ERROR` \| `WARNING` \| `INFO` | ja | Klasse der Regel |
| `level` | `Basis` \| `Lebendig` \| `Signiert` \| `Archiv` | ja | Stufe der Regel |
| `rendition` | string \| null | ja | Kennung der eingefrorenen Fassung oder `null` (Hauptfassung/Container) |
| `message` | string | ja | ausgefüllte Meldungsvorlage, deutsch |
| `location` | Objekt | bei Fehler/Warnung | Ort nach 4.2 |
| `params` | Objekt | nein | die Platzhalterwerte der Meldung (für maschinelle Auswertung) |
| `requirements` | string[] | ja | Bezug der Regel (`HP-…`) |

### 4.2 Ortsangaben

`location.kind` nimmt einen dieser Werte; die weiteren Felder hängen von der Art ab:

| `kind` | Felder | Verwendung |
|---|---|---|
| `container` | – | die Datei als Ganzes |
| `entry` | `path` | ein Eintrag des Containers |
| `manifest` | `path`, `pointer` (JSON-Pointer nach RFC 6901 [Q10]) | ein Feld in `manifest.json` oder einem Fassungsmanifest |
| `xml` | `path`, `line`, `column` (1-basiert, optional), `xpath` (optional) | ein Element oder Attribut in XHTML, SVG, OPF, `container.xml` |
| `css` | `path`, `line` (optional), `selector` (optional) | eine Regel in einem Stylesheet |
| `signature` | `path`, `signatureId`, `uri` (optional) | eine Signatur bzw. eine ihrer Referenzen |
| `rendition` | `id` | eine eingefrorene Fassung als Ganzes |
| `external` | `tool`, `code` (optional) | Befund eines externen Werkzeugs |

In den Regeln steht unter `*Ort:*` die Art mit den Platzhaltern, die der Prüfer füllt.

### 4.3 Bericht

Ein Prüflauf erzeugt genau einen Bericht als JSON-Objekt nach
[`schema/konformitaetsbericht.schema.json`](schema/konformitaetsbericht.schema.json)
(JSON Schema 2020-12 [Q9]). Pflichtfelder, zugleich die Felder aus
[HP-VERS-008](00-spezifikation.md#hp-vers-008--kann--basis):

| Feld | Inhalt |
|---|---|
| `spec` | `"https://html-pro.example/spec/0.1"` |
| `catalog` | Kennung und Version des Regelkatalogs: `{ "part": "1", "version": "0.1", "rules": <Anzahl> }` |
| `tool` | `{ "name", "version" }` des Prüfprogramms |
| `checkedAt` | Zeitpunkt UTC, `YYYY-MM-DDThh:mm:ssZ` |
| `file` | `{ "name", "size", "sha256" }` des Prüfgegenstands |
| `strict` | boolesch, Betriebsart (Abschnitt 2.2) |
| `levels` | `{ "claimed": [...], "requested": [...], "verdict": { "<Stufe>": "bestanden" \| "nicht bestanden" \| "unbestimmt" } }` |
| `renditions` | Liste `{ "id", "profile", "verdict": {…} }`; die Hauptfassung hat `"id": null` |
| `summary` | `{ "fatal", "error", "warning", "info", "notChecked" }` als Zahlen |
| `results` | Liste der Befunde nach 4.1 |
| `notChecked` | Liste `{ "rule", "reason", "detail"? }` nach 2.4 |

Ein Beispielbericht liegt in [`docs/belege/S2/`](../belege/S2/README.md).

### 4.4 Textausgabe

Die menschenlesbare Ausgabe hat je Befund eine Zeile:

```
<KLASSE> <Regel> [<Fassung>] <Ort>: <Meldung>
```

mit `KLASSE` ∈ {`FATAL`, `FEHLER`, `WARNUNG`, `HINWEIS`}, `<Fassung>` nur bei eingefrorenen
Fassungen, `<Ort>` als `pfad`, `pfad:zeile:spalte`, `manifest.json#/pointer` oder
`signatur=<Id>`. Danach eine Zeile je nicht geprüfter Regel (`NICHT GEPRÜFT <Regel>: <Grund>`), dann
die Zusammenfassung `Befunde: f fatal, e Fehler, w Warnungen, i Hinweise, n nicht geprüft` und je
Stufe `Stufe <S>: <Urteil>`. Beispiel:

```
FEHLER HPR-CONT-016 content/index.xhtml: Ressource content/index.xhtml: Hash stimmt nicht (Manifest sha256-1dCu…, Datei sha256-qx2d…).
Befunde: 0 fatal, 1 Fehler, 0 Warnungen, 0 Hinweise, 12 nicht geprüft
Stufe Basis: nicht bestanden
```

### 4.5 Rückgabecodes

| Code | Bedeutung |
|---|---|
| 0 | alle beanspruchten und angeforderten Stufen `bestanden` (Warnungen und Hinweise zulässig) |
| 1 | mindestens eine Stufe `nicht bestanden` |
| 2 | Prüfprogramm konnte nicht laufen (Datei nicht lesbar, falscher Aufruf) |
| 3 | keine Stufe `nicht bestanden`, mindestens eine `unbestimmt` |

### 4.6 Platzhalter in Meldungsvorlagen

Meldungsvorlagen verwenden ausschließlich diese Platzhalter (mechanisch geprüft):

<!-- PLATZHALTER ANFANG -->
| Platzhalter | Inhalt |
|---|---|
| `{pfad}` | Containerpfad eines Eintrags oder einer Datei |
| `{zeile}` | Zeilennummer (1-basiert) |
| `{element}` | Elementname, ggf. mit Namensraumpräfix |
| `{attribut}` | Attributname |
| `{wert}` | gefundener Wert |
| `{erwartet}` | erwarteter Wert oder Wertebereich |
| `{kennung}` | `id` eines Elements oder einer Fassung |
| `{fassung}` | Kennung einer eingefrorenen Fassung |
| `{signatur}` | `ds:Signature/@Id` |
| `{uri}` | Referenz-URI oder URL |
| `{feld}` | Manifestfeld als JSON-Pointer |
| `{grund}` | Beschreibung der Abweichung aus dem Parser oder Werkzeug |
| `{methode}` | ZIP-Kompressionsmethode |
| `{anzahl}` | gezählte Menge |
| `{grenze}` | zulässige Grenze |
| `{regel}` | Name einer Sperr- oder Pfadregel |
| `{code}` | Meldungscode eines externen Werkzeugs |
| `{name}` | Name einer Komponente, Erweiterung, Schrift, Funktion |
| `{version}` | Versionsangabe |
| `{typ}` | Media-Type |
| `{profil}` | Profilname (`static`, `interactive`, `signed`, `archive`) |
| `{stufe}` | Stufenname |
| `{indikation}` | Haupt-/Unterindikation einer Signaturprüfung |
<!-- PLATZHALTER ENDE -->

---

## 5. Regelkatalog: Dokumentregeln

Die Regeln sind nach den Bereichen von Teil 0 geordnet. Eine Regel ohne Befund gilt als bestanden.
Alle Regeln schließen die Verzeichnisse `ext/` und `renditions/` ein, soweit ihre Geltung reicht
([HP-VERS-007](00-spezifikation.md#hp-vers-007--muss--basis)). Verweise werden relativ zum Pfad
der verweisenden Datei aufgelöst; ein `base`-Element wird dabei nicht berücksichtigt.

### 5.1 Container (CONT)

#### HPR-CONT-001 · Fatal · Basis
Die Datei ist kein lesbares ZIP-Archiv.

*Bezug:* HP-CONT-001
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* End-of-Central-Directory-Signatur suchen, Zentralverzeichnis lesen, jeden Local-Header mit dem Zentralverzeichnis abgleichen. Fehlt die Signatur, ist das Verzeichnis nicht lesbar oder widersprechen sich Header und Verzeichnis, ist das ein Befund; die Prüfung endet.
*Ort:* `container`
*Meldung:* Die Datei ist kein lesbares ZIP-Archiv: {grund}.

#### HPR-CONT-002 · Fehler · Basis
Ein Eintrag verwendet eine unzulässige Kompressionsmethode.

*Bezug:* HP-CONT-001
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Für jeden Eintrag des Zentralverzeichnisses die Kompressionsmethode lesen; jede Methode außer 0 und 8 ist ein Befund.
*Ort:* `entry` mit `{pfad}`
*Meldung:* Eintrag {pfad}: Kompressionsmethode {methode} ist unzulässig (erlaubt sind 0 und 8).

#### HPR-CONT-003 · Fehler · Basis
Das Archiv nutzt Verschlüsselung, Mehrdatenträger oder ZIP64.

*Bezug:* HP-CONT-001
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Für jeden Eintrag Bit 0 der General-Purpose-Flags, ZIP64-Extra-Feld (ID 0x0001) und Disk-Nummer lesen; End-of-Central-Directory auf ZIP64-Locator prüfen. Jeder Treffer ist ein Befund.
*Ort:* `entry` mit `{pfad}` oder `container`
*Meldung:* Eintrag {pfad}: {grund} (Verschlüsselung, Mehrdatenträger und ZIP64 sind unzulässig).

#### HPR-CONT-004 · Fatal · Basis
Die Datei ist nicht als html-Pro-Dokument erkennbar.

*Bezug:* HP-CONT-002, HP-CONT-005, HP-CONT-013
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Es gibt weder einen Eintrag `mimetype` mit dem Inhalt `application/epub+zip` noch einen Eintrag `manifest.json`. Die Dateiendung wird nicht herangezogen. Trifft das zu, endet die Prüfung.
*Ort:* `container`
*Meldung:* Die Datei ist kein html-Pro-Dokument: weder `mimetype` mit `application/epub+zip` noch `manifest.json` vorhanden.

#### HPR-CONT-005 · Fehler · Basis
Der Eintrag `mimetype` ist nicht erster Eintrag, nicht unkomprimiert oder hat falschen Inhalt.

*Bezug:* HP-CONT-002
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Bytes 0–3 = `PK\x03\x04`; Dateiname im ersten Local-Header = `mimetype`; Methode 0; Extra-Länge 0; Inhalt byteweise `application/epub+zip` (kein Zeilenende, kein BOM). Jede verletzte Bedingung ist ein eigener Befund.
*Ort:* `entry` mit `mimetype`
*Meldung:* `mimetype`: {grund} (erwartet: erster Eintrag an Offset 0, Methode 0, Extra-Länge 0, Inhalt `application/epub+zip`).

#### HPR-CONT-006 · Fehler · Basis
`META-INF/container.xml` fehlt oder entspricht nicht OCF.

*Bezug:* HP-CONT-003
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Datei vorhanden; wohlgeformtes XML; Wurzel `container` im Namensraum `urn:oasis:names:tc:opendocument:xmlns:container`; `rootfiles/rootfile[1]/@full-path` = `package.opf` und `@media-type` = `application/oebps-package+xml`.
*Ort:* `xml` mit `META-INF/container.xml`
*Meldung:* `META-INF/container.xml`: {grund}.

#### HPR-CONT-007 · Fehler · Basis
`package.opf` fehlt oder ist nicht wohlgeformt.

*Bezug:* HP-CONT-004
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Datei `package.opf` vorhanden; wohlgeformtes XML mit Wurzel `package` im Namensraum `http://www.idpf.org/2007/opf` und `version="3.0"`.
*Ort:* `xml` mit `package.opf`
*Meldung:* `package.opf`: {grund}.

#### HPR-CONT-008 · Fehler · Basis
Das Manifest in `package.opf` deckt die Containerdateien nicht genau ab.

*Bezug:* HP-CONT-004
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Menge der aufgelösten `item/@href` mit der Menge der Containerpfade außer `mimetype`, `package.opf` und `META-INF/*` vergleichen. Jede Datei ohne `item` und jedes `item` ohne Datei ist ein Befund.
*Ort:* `entry` mit `{pfad}`
*Meldung:* `package.opf`: {pfad} {grund} (Datei ohne `item` bzw. `item` ohne Datei).

#### HPR-CONT-009 · Fehler · Basis
Der Spine in `package.opf` weicht von `readingOrder` ab.

*Bezug:* HP-CONT-004
*Geltung:* Hauptfassung
*Mittel:* statisch
*Prüfung:* `spine/itemref/@idref` über `manifest/item` auf Pfade abbilden; die Folge MUSS gleich der Folge der `url` in `manifest.json#readingOrder` sein.
*Ort:* `xml` mit `package.opf`
*Meldung:* `package.opf`: Spine stimmt nicht mit `readingOrder` überein ({grund}).

#### HPR-CONT-010 · Fehler · Basis
`package.opf` nennt kein oder mehr als ein Navigationsdokument.

*Bezug:* HP-CONT-004
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Anzahl der `item`, deren `properties` das Token `nav` enthält, MUSS 1 sein; die Datei MUSS existieren.
*Ort:* `xml` mit `package.opf`
*Meldung:* `package.opf`: {anzahl} Einträge mit `properties="nav"` (erwartet: genau einer).

#### HPR-CONT-011 · Fatal · Basis
`manifest.json` fehlt oder ist nicht als JSON-Objekt lesbar.

*Bezug:* HP-CONT-005
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Datei vorhanden (`manifest.json` bzw. `renditions/<id>/manifest.json`); Bytes ohne BOM als UTF-8 dekodierbar; JSON-Parser liefert ein Objekt. Andernfalls endet die Prüfung dieser Fassung.
*Ort:* `entry` mit `{pfad}`
*Meldung:* {pfad}: {grund} (erwartet: UTF-8-JSON ohne BOM, Wurzel ein Objekt).

#### HPR-CONT-012 · Fehler · Basis
Ein Containerpfad verletzt die Pfadregeln.

*Bezug:* HP-CONT-006
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Jeden Eintragsnamen prüfen: relativ (kein führendes `/`), Segmente nicht leer, nicht `.` oder `..`, keine Zeichen `" * : < > ? \`, keine Steuerzeichen (U+0000–U+001F, U+007F), Segment höchstens 255 Bytes UTF-8, Segment endet nicht auf `.`. Verzeichniseinträge (Name endet auf `/`) sind Einträge mit leerem Segment.
*Ort:* `entry` mit `{pfad}`
*Meldung:* Eintrag {pfad}: Pfadregel „{regel}“ verletzt.

#### HPR-CONT-013 · Fehler · Basis
Zwei Containerpfade sind nach Normalisierung gleich.

*Bezug:* HP-CONT-006
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Alle Namen NFC-normalisieren und in Kleinschreibung umwandeln; jede Kollision ist ein Befund (auch byteidentische Doppeleinträge).
*Ort:* `entry` mit `{pfad}`
*Meldung:* Eintrag {pfad}: nicht eindeutig, kollidiert mit {wert}.

#### HPR-CONT-014 · Fehler · Basis
Ein reservierter Pfad ist falsch belegt oder `META-INF/` enthält fremde Dateien.

*Bezug:* HP-CONT-007
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Jeder Pfad unter `META-INF/` MUSS einer von `container.xml`, `signatures.xml`, `signatures*.xml`, `manifest.xml`, `metadata.xml`, `rights.xml` sein; kein Eintrag in `manifest.json#resources`, `#attachments`, `#components`, `#data` oder einem Fassungsmanifest darf `mimetype`, `package.opf`, `manifest.json` heißen oder unter `META-INF/` liegen.
*Ort:* `entry` mit `{pfad}`
*Meldung:* Eintrag {pfad}: {grund} (reservierter Pfad bzw. unzulässige Datei unter `META-INF/`).

#### HPR-CONT-015 · Fehler · Basis
Ein Eintrag in `resources` ist unvollständig oder hat eine ungültige Hashform.

*Bezug:* HP-CONT-008, HP-CONT-015
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jedes Element von `resources` MUSS ein Objekt mit `url` (String, gültiger Containerpfad), `type` (String nach dem Muster `type/subtype` aus RFC 6838) und `integrity` (String nach `^sha256-[A-Za-z0-9+/]{43}=$`) sein.
*Ort:* `manifest` mit `{feld}`
*Meldung:* {feld}: {grund} (erwartet: `url`, `type`, `integrity` in der Form `sha256-<Base64>`).

#### HPR-CONT-016 · Fehler · Basis
Der Hash einer Ressource stimmt nicht mit dem Manifest überein.

*Bezug:* HP-CONT-008
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für jeden `resources`-Eintrag SHA-256 über die unkomprimierten Bytes berechnen, Base64 kodieren und mit `integrity` vergleichen.
*Ort:* `entry` mit `{pfad}`
*Meldung:* Ressource {pfad}: Hash stimmt nicht (Manifest {erwartet}, Datei {wert}).

#### HPR-CONT-017 · Fehler · Basis
Eine Datei der Fassung hat keinen Eintrag in `resources`.

*Bezug:* HP-CONT-008
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jede Datei der Fassung außer `mimetype`, ihrem `manifest.json` und `META-INF/*` MUSS genau einen `resources`-Eintrag haben. Für die Hauptfassung zählen alle Einträge außerhalb `renditions/`; für eine eingefrorene Fassung die Einträge unter `renditions/<id>/`.
*Ort:* `entry` mit `{pfad}`
*Meldung:* Datei {pfad} ist in `resources` nicht verzeichnet (unlisted).

#### HPR-CONT-018 · Fehler · Basis
Ein `resources`-Eintrag zeigt auf eine fehlende Datei.

*Bezug:* HP-CONT-008
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für jeden `resources`-Eintrag MUSS der Eintrag `url` im Container existieren.
*Ort:* `manifest` mit `{feld}`
*Meldung:* {feld}: Datei {pfad} fehlt im Container (missing).

#### HPR-CONT-019 · Fehler · Basis
Ein Pfad ist in `resources` mehrfach verzeichnet.

*Bezug:* HP-CONT-008
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Alle `url`-Werte von `resources` MÜSSEN paarweise verschieden sein.
*Ort:* `manifest` mit `{feld}`
*Meldung:* {feld}: Pfad {pfad} ist mehrfach verzeichnet.

#### HPR-CONT-020 · Fehler · Basis
Ein Ressourcenverweis zeigt nach außen.

*Bezug:* HP-CONT-010
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* In allen XHTML- und SVG-Dateien die Attribute `link/@href`, `img/@src`, `img/@srcset`, `script/@src`, `source/@src`, `source/@srcset`, `audio/@src`, `video/@src`, `video/@poster`, `track/@src`, `iframe/@src`, `embed/@src`, `object/@data`, `base/@href`, `a/@ping`, `meta[@http-equiv="refresh"]/@content` (URL-Teil), SVG `image/@href`, `use/@href`, `xlink:href` sowie in CSS jede `url()` und jedes `@import` sammeln. Ein Wert, der auf `^[a-z][a-z0-9+.-]*:` oder `^//` passt und nicht mit `data:` beginnt und kein reines Fragment ist, ist ein Befund. Hyperlinks `a/@href` und `area/@href` sind ausgenommen.
*Ort:* `xml` oder `css` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Verweis {attribut}="{uri}" zeigt nach außen; Ressourcen müssen im Container liegen.

#### HPR-CONT-021 · Fehler · Basis
Ein Ressourcenverweis zeigt auf eine Datei, die im Container fehlt.

*Bezug:* HP-CONT-010
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jeden Verweis aus HPR-CONT-020, der nicht nach außen zeigt und nicht `data:` ist, relativ zur verweisenden Datei auflösen (Fragment abschneiden); das Ziel MUSS ein Eintrag des Containers sein.
*Ort:* `xml` oder `css` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Verweis {attribut}="{uri}" zeigt auf eine fehlende Datei.

#### HPR-CONT-022 · Fehler · Basis
Der Media-Type einer Ressource widerspricht ihrem Inhalt.

*Bezug:* HP-CONT-015
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für die Kernmedientypen die Signatur der ersten Bytes prüfen: PNG `89 50 4E 47`, JPEG `FF D8 FF`, GIF `GIF8`, WebP `RIFF…WEBP`, WOFF2 `wOF2`; `application/xhtml+xml`, `image/svg+xml`, `application/oebps-package+xml` MÜSSEN wohlgeformtes XML mit dem passenden Wurzelnamensraum sein; `application/json` MUSS als JSON parsen; `text/css` MUSS UTF-8 sein. Eine Abweichung ist ein Befund; unbekannte Typen werden nicht geprüft.
*Ort:* `entry` mit `{pfad}`
*Meldung:* Ressource {pfad}: Inhalt passt nicht zum Media-Type {typ} ({grund}).

#### HPR-CONT-023 · Fehler · Basis
`META-INF/encryption.xml` oder `META-INF/rights.xml` liegt mit Inhalt vor.

*Bezug:* HP-CONT-016
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Die beiden Pfade DÜRFEN NICHT als Einträge mit mehr als 0 Bytes vorhanden sein.
*Ort:* `entry` mit `{pfad}`
*Meldung:* Eintrag {pfad}: Teilverschlüsselung und Rechtedateien sind in 0.1 nicht vorgesehen.

#### HPR-CONT-024 · Fehler · Basis
Der EPUB-Validator meldet einen Fehler.

*Bezug:* HP-CONT-017
*Geltung:* Container
*Mittel:* extern
*Prüfung:* Datei unter der Endung `.epub` mit einem Validator für EPUB 3.3 prüfen. Jede Meldung der Stufen `fatal` und `error` ist ein Befund mit dem Code des Validators (Warnungen und Infos: HPR-CONT-028). Ist kein Validator verfügbar: `nicht geprüft`, Grund `missing-means`.
*Ort:* `external` mit `{code}`, zusätzlich `{pfad}`, `{zeile}` wenn der Validator sie nennt
*Meldung:* EPUB-Validator {code} bei {pfad}:{zeile}: {grund}.

#### HPR-CONT-025 · Warnung · Basis
ZIP-Zeitstempel sind nicht aus `dateModified` abgeleitet.

*Bezug:* HP-CONT-014
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* DOS-Datum und -Zeit jedes Eintrags mit `manifest.json#dateModified` vergleichen (Auflösung 2 Sekunden, in UTC). Ein Eintrag mit anderem Wert ist ein Befund; mehrere Einträge werden zu einem Befund mit Anzahl zusammengefasst.
*Ort:* `container`
*Meldung:* {anzahl} Einträge tragen einen ZIP-Zeitstempel, der nicht `dateModified` ({erwartet}) entspricht; deterministisches Schreiben ist nicht erkennbar.

#### HPR-CONT-026 · Warnung · Basis
Das Dokument überschreitet die Mindestgrenzen für Lesesysteme.

*Bezug:* HP-CONT-012
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Mehr als 10 000 Einträge, ein Eintrag mit mehr als 256 MiB unkomprimiert oder mehr als 1 GiB Gesamtgröße unkomprimiert.
*Ort:* `container` oder `entry` mit `{pfad}`
*Meldung:* {grund}: {wert} überschreitet {grenze}; konforme Lesesysteme dürfen das Dokument ablehnen.

#### HPR-CONT-027 · Fehler · Basis
Die CRC-32-Prüfsumme eines Eintrags stimmt nicht oder die Größenangaben widersprechen dem Inhalt.

*Bezug:* HP-CONT-001, HP-CONT-011
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Jeden Eintrag entpacken; CRC-32 und unkomprimierte Größe MÜSSEN den Angaben des Zentralverzeichnisses entsprechen; das Entpacken endet, sobald mehr Bytes entstehen als angegeben. Der Inhalt eines betroffenen Eintrags wird in keiner weiteren Regel verwendet (abhängige Befunde: `nicht geprüft`, Grund `fatal`).
*Ort:* `entry` mit `{pfad}`
*Meldung:* Eintrag {pfad}: {grund} (CRC-32 oder Größe stimmen nicht; konforme Lesesysteme lehnen die Datei ab).

#### HPR-CONT-028 · Hinweis · Basis
Der EPUB-Validator meldet eine Warnung oder einen Hinweis.

*Bezug:* HP-CONT-017
*Geltung:* Container
*Mittel:* extern
*Prüfung:* Jede Meldung der Stufen `warning` und `info` des EPUB-Validators wird mit ihrem Code übernommen; sie ändert das Urteil nicht (HP-CONT-017 lässt Warnungen zu).
*Ort:* `external` mit `{code}`, zusätzlich `{pfad}`, `{zeile}` wenn der Validator sie nennt
*Meldung:* EPUB-Validator {code} bei {pfad}:{zeile}: {grund}.
*Einstufung:* Information

### 5.2 Inhalt und Darstellung (INH)

#### HPR-INH-001 · Fehler · Basis
Ein Inhaltsdokument ist kein wohlgeformtes XHTML.

*Bezug:* HP-INH-001
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jede Datei mit Media-Type `application/xhtml+xml` mit einem strikten, nicht validierenden XML-Parser lesen; Wurzel MUSS `{http://www.w3.org/1999/xhtml}html` sein; jede undefinierte Entität ist ein Parserfehler.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: {grund} (erwartet: wohlgeformtes XML mit Wurzel `html` im XHTML-Namensraum).

#### HPR-INH-002 · Fehler · Basis
Die Dokumenttypdeklaration verweist nach außen oder deklariert Entitäten.

*Bezug:* HP-INH-001, HP-CONT-017
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* In jeder XML-Datei der Fassung: ein `<!DOCTYPE` mit `SYSTEM` oder `PUBLIC` oder mit internem Subset (`[` … `]`), das `<!ENTITY` enthält, ist ein Befund. Der Prüfer MUSS den Parser so betreiben, dass externe Entitäten und DTDs nie geladen werden. (Präzisierung: EPUB 3.3 §2.1.1 verbietet externe Kennungen und Entitätsdeklarationen in XML-Dokumenten; der EPUB-Validator meldet sie, die Regel macht sie ohne externes Werkzeug prüfbar.)
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Dokumenttypdeklaration mit {grund} ist unzulässig (XXE- und Entitätsexpansions-Schutz).

#### HPR-INH-003 · Fehler · Basis
Das Wurzelelement nennt die Sprache nicht oder nicht gültig.

*Bezug:* HP-INH-002
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* `html/@lang` und `html/@xml:lang` vorhanden, gleich und wohlgeformt nach BCP 47 (`^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$`).
*Ort:* `xml` mit `{pfad}`
*Meldung:* {pfad}: Sprachangabe {grund} (erwartet: `lang` und `xml:lang` gleich und nach BCP 47).

#### HPR-INH-004 · Fehler · Basis
Der Fließtext ist bei 320 CSS-Pixeln nicht ohne waagrechtes Scrollen lesbar.

*Bezug:* HP-INH-003
*Geltung:* Fassung
*Mittel:* rendering
*Prüfung:* Jedes Inhaltsdokument in 320, 768 und 1280 CSS-Pixeln Breite rendern; `document.scrollingElement.scrollWidth` MUSS kleiner oder gleich `clientWidth` sein. Scrollbereiche nach HP-INH-010 (`data-hp-table="scroll"`, `pre`, `figure`) sind ausgenommen.
*Ort:* `xml` mit `{pfad}`
*Meldung:* {pfad}: bei {wert} px Breite entsteht waagrechtes Scrollen des Fließtexts ({grund}).

#### HPR-INH-005 · Fehler · Basis
Autoren-CSS überschreibt die Lesesystem-Variablen auf `:root`.

*Bezug:* HP-INH-004
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Alle Stylesheets und `style`-Attribute parsen; jede Deklaration einer Eigenschaft `--hp-font-size`, `--hp-line-height`, `--hp-letter-spacing`, `--hp-word-spacing`, `--hp-paragraph-spacing`, `--hp-foreground`, `--hp-background` in einem Regelblock mit Selektor `:root`, `html` oder `*` ist ein Befund.
*Ort:* `css` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `{name}` wird auf `{wert}` gesetzt; Lesesystem-Variablen dürfen nicht überschrieben werden.

#### HPR-INH-006 · Fehler · Basis
Der Fließtext folgt den Lesesystem-Variablen nicht.

*Bezug:* HP-INH-004
*Geltung:* Fassung
*Mittel:* rendering
*Prüfung:* Dokument rendern, `--hp-font-size: 200%` und `--hp-line-height: 2` auf dem Rahmen setzen; `font-size` und `line-height` (`getComputedStyle`) jedes `p` MÜSSEN sich gegenüber dem Ausgangswert verdoppeln (Faktor 2 ± 1 %).
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}: Absatz {kennung} folgt den Lesesystem-Variablen nicht (Faktor {wert} statt 2).

#### HPR-INH-007 · Warnung · Basis
CSS verändert die visuelle Reihenfolge gegenüber dem DOM.

*Bezug:* HP-INH-005
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Stylesheets auf `order`, `flex-direction: row-reverse|column-reverse`, `grid-row`, `grid-column`, `grid-area` mit expliziter Platzierung durchsuchen. Jeder Treffer ist ein Befund (Warnung); eine begründete Ausnahme wird nicht maschinell erkannt.
*Ort:* `css` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `{name}: {wert}` kann die Lesereihenfolge gegenüber dem DOM verändern.

#### HPR-INH-008 · Fehler · Basis
Ein Bild hat keinen Alternativtext.

*Bezug:* HP-INH-006
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jedes `img` MUSS ein `alt`-Attribut tragen (auch leer).
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `img` ohne `alt`-Attribut.

#### HPR-INH-009 · Fehler · Basis
Ein informatives SVG hat keinen zugänglichen Namen.

*Bezug:* HP-INH-006
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jedes `svg` mit Text- oder Grafikinhalt (`text`, `path`, `rect`, `circle`, `image`, `use`, …) und ohne `aria-hidden="true"` MUSS `role="img"` und entweder `aria-label` oder `aria-labelledby` auf ein `title` tragen.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `svg` ohne `role="img"` und zugänglichen Namen.

#### HPR-INH-010 · Warnung · Basis
Die Überschriftenhierarchie hat Lücken oder mehr als eine `h1`.

*Bezug:* HP-INH-007
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Überschriftenebenen je Inhaltsdokument in Dokumentreihenfolge sammeln; ein Sprung um mehr als eine Ebene nach unten oder eine Anzahl von `h1` ≠ 1 ist ein Befund.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: {grund} (lückenlose Hierarchie, genau eine `h1` erwartet).

#### HPR-INH-011 · Warnung · Basis
Eine Datentabelle hat keine Kopfzellen oder keine `caption`.

*Bezug:* HP-INH-008
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jede `table` mit mehr als einer Zeile MUSS mindestens ein `th` mit `scope` oder `td`/`th` mit `headers` und eine `caption` haben.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Tabelle {kennung} ohne {grund}.

#### HPR-INH-012 · Warnung · Basis
Eine eingebettete Schrift liegt nicht als WOFF 2.0 vor.

*Bezug:* HP-INH-009
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jede `src`-Quelle einer `@font-face`-Regel MUSS auf eine Ressource mit Media-Type `font/woff2` zeigen.
*Ort:* `css` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Schrift {name} liegt als {typ} vor (erwartet: `font/woff2`).

#### HPR-INH-013 · Warnung · Basis
Eine `font-family`-Deklaration endet nicht mit einer generischen Familie.

*Bezug:* HP-INH-009
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jede `font-family`-Deklaration (außer in `@font-face`) MUSS als letzten Wert `serif`, `sans-serif`, `monospace`, `cursive`, `fantasy` oder `system-ui` haben.
*Ort:* `css` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `font-family: {wert}` endet nicht mit einer generischen Familie.
*Einstufung:* Teilsatz (Muss-Satz in einer Soll-Anforderung; Klasse bleibt die der Anforderung)

#### HPR-INH-014 · Warnung · Basis
Eine Datentabelle nennt keine oder eine unbekannte Strategie für schmale Breiten.

*Bezug:* HP-INH-010
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jede `table` mit mehr als einer Zeile SOLL `data-hp-table` mit einem Wert aus `scroll`, `stack`, `priority` tragen; `priority` verlangt mindestens eine Spalte (`th` oder `col`) mit `data-hp-priority`.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Tabelle {kennung}: {grund} (erwartet `data-hp-table` ∈ {scroll, stack, priority}).

#### HPR-INH-015 · Fehler · Basis
Text ist absolut positioniert oder liegt nur als Bild vor.

*Bezug:* HP-INH-011
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Ein Element innerhalb von `p`, `li`, `td`, `th`, `h1`–`h6` mit `position: absolute` oder `position: fixed` (Stylesheet oder `style`-Attribut) ist ein Befund; ebenso ein `img`, dessen `alt` mehr als 300 Zeichen hat und das nicht in `figure` steht (Indiz für Text als Bild).
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: {grund}; Fließtext muss Text im DOM in Lesereihenfolge sein.

#### HPR-INH-016 · Fehler · Basis
Ein Inhaltsdokument einer nicht lebendigen Fassung enthält ein `script`-Element.

*Bezug:* HP-INH-012
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Nur für Fassungen mit Profil `static`, `signed` oder `archive`: jedes `script`-Element in XHTML und SVG (beliebiger Namensraum) ist ein Befund.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `script`-Element in einer Fassung mit Profil {profil}.

#### HPR-INH-017 · Fehler · Basis
Ein Inhaltsdokument einer nicht lebendigen Fassung enthält Ereignisattribute oder Skript-URLs.

*Bezug:* HP-INH-012
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Nur für Fassungen mit Profil `static`, `signed` oder `archive`: jedes Attribut, dessen Name mit `on` beginnt, jeder Attributwert, der nach Entfernen von Leerraum und Steuerzeichen (ohne Rücksicht auf Groß- und Kleinschreibung) mit `javascript:` beginnt, jedes SVG-`set`/`animate`-Element mit `attributeName="href"` oder Skriptbezug, und jedes MathML-Element mit `href` auf eine `javascript:`-URL ist ein Befund.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: {element}/@{attribut} ist Skript ({grund}) in einer Fassung mit Profil {profil}.

#### HPR-INH-018 · Fehler · Basis
Ein Video hat kein statisches Äquivalent.

*Bezug:* HP-INH-013
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jedes `video` MUSS `poster` auf eine Datei im Container tragen und eine Textbeschreibung haben: `figcaption` im umgebenden `figure` oder `aria-describedby` auf ein Element mit Text.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `video` ohne {grund} (erwartet: `poster` aus dem Container und Textbeschreibung).

#### HPR-INH-019 · Fehler · Basis
Ein Audio-Element hat keine Beschreibung und kein Transkript.

*Bezug:* HP-INH-013
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jedes `audio` MUSS eine Textbeschreibung (`figcaption`, `aria-describedby`) oder ein Transkript haben: `a[href]` innerhalb des umgebenden `figure` auf ein Inhaltsdokument oder einen Abschnitt im Container, oder `track[kind="descriptions"|"captions"]` auf eine Datei im Container.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `audio` ohne Beschreibung oder Transkript.

#### HPR-INH-020 · Fehler · Basis
Ein Medium startet selbsttätig mit Ton.

*Bezug:* HP-INH-013
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jedes `video` oder `audio` mit `autoplay` MUSS `muted` tragen.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `{element}` mit `autoplay` ohne `muted`.

#### HPR-INH-021 · Fehler · Basis
Bewegte Inhalte haben keine Regel für reduzierte Bewegung.

*Bezug:* HP-INH-014
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Wenn ein Stylesheet `animation`, `animation-name` oder `@keyframes` verwendet oder ein Dokument SMIL-Elemente (`animate`, `animateTransform`, `animateMotion`, `set`) enthält, MUSS ein Block `@media (prefers-reduced-motion: reduce)` vorhanden sein, der `animation: none` oder `animation-play-state: paused` für die betroffenen Selektoren setzt; SMIL-Elemente MÜSSEN `begin="indefinite"` tragen oder das Dokument MUSS sie in diesem Block mit `display: none` ausblenden und ein statisches Äquivalent zeigen.
*Ort:* `css` oder `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: {grund}; bewegte Inhalte brauchen eine Regel für `prefers-reduced-motion: reduce`.

#### HPR-INH-022 · Fehler · Basis
Bei reduzierter Bewegung läuft weiterhin Bewegung.

*Bezug:* HP-INH-014
*Geltung:* Fassung
*Mittel:* rendering
*Prüfung:* Dokument mit emulierter Einstellung `prefers-reduced-motion: reduce` rendern, 5 Sekunden warten; `document.getAnimations()` MUSS leer sein, kein Medium darf in Wiedergabe sein.
*Ort:* `xml` mit `{pfad}`
*Meldung:* {pfad}: {anzahl} laufende Animationen bei `prefers-reduced-motion: reduce`.

#### HPR-INH-023 · Hinweis · Basis
MathML ohne `alttext`.

*Bezug:* HP-INH-015
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jedes `math`-Element SOLL `alttext` oder ein `annotation`-Kind tragen; fehlt beides, zeigt ein Lesesystem ohne MathML-Darstellung nichts.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `math` ohne `alttext`; Lesesysteme ohne MathML zeigen keinen Ersatz.

#### HPR-INH-024 · Warnung · Basis
Blöcke, die zusammenbleiben müssen, sind nicht als solche gekennzeichnet.

*Bezug:* HP-INH-016
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Die Stylesheets der Fassung SOLLEN für `figure`, `table`, `pre` eine Deklaration `break-inside: avoid` (oder `page-break-inside: avoid`) und für `h1`–`h6` `break-after: avoid` (oder `page-break-after: avoid`) enthalten. Je fehlender Elementtyp ein Befund.
*Ort:* `css` mit `{pfad}`
*Meldung:* {pfad}: keine Umbruchregel `{wert}` für `{element}`.

### 5.3 Adressierung (ADR)

#### HPR-ADR-001 · Fehler · Basis
Ein adressierbares Element hat keine Kennung.

*Bezug:* HP-ADR-001
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jedes Element `section`, `article`, `aside`, `nav`, `h1`–`h6`, `table`, `figure`, `pre`, `details`, `form` und jedes Element mit `data-hp-priority` MUSS ein `id`-Attribut tragen.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `{element}` ohne `id`.

#### HPR-ADR-002 · Fehler · Basis
Eine Kennung entspricht nicht dem Muster oder ist zu lang.

*Bezug:* HP-ADR-002
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jedes `id`-Attribut MUSS `^[A-Za-z][A-Za-z0-9_.-]*$` entsprechen und höchstens 64 Zeichen lang sein.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Kennung „{kennung}“ ist ungültig ({grund}).

#### HPR-ADR-003 · Fehler · Basis
Eine Kennung kommt in einem Inhaltsdokument mehrfach vor.

*Bezug:* HP-ADR-002
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Alle `id`-Werte je Datei sammeln; jede Dublette ist ein Befund.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Kennung „{kennung}“ ist mehrfach vergeben.

#### HPR-ADR-004 · Fehler · Basis
Das Navigationsdokument verweist auf ein nicht existierendes Ziel.

*Bezug:* HP-ADR-007
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Im Navigationsdokument jeden `nav[@epub:type="toc"]//a/@href` auflösen; Datei und Fragment MÜSSEN existieren.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Verzeichniseintrag zeigt auf „{uri}“, das nicht existiert.

#### HPR-ADR-005 · Fehler · Basis
Ein Abschnitt der obersten Ebene fehlt im Navigationsdokument.

*Bezug:* HP-ADR-007
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jedes `section`/`article` ohne Vorfahren `section`/`article` in einem Inhaltsdokument der `readingOrder` MUSS als Ziel `pfad#kennung` im `toc`-`nav` vorkommen.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Abschnitt {kennung} fehlt im Inhaltsverzeichnis.

#### HPR-ADR-006 · Fehler · Basis
Ein interner Verweis zeigt auf eine nicht existierende Kennung.

*Bezug:* HP-ADR-003, HP-CONT-017
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jeden `a/@href` ohne Schema auflösen; die Datei MUSS im Container liegen und ein Fragment MUSS als `id` in der Zieldatei existieren. (Der EPUB-Validator meldet denselben Sachverhalt als `RSC-012`.)
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Verweis „{uri}“ hat kein Ziel.

#### HPR-ADR-007 · Hinweis · Basis
Ein Wertverweis zeigt auf eine Zelle ohne gespeicherten Wert.

*Bezug:* HP-ADR-008
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jedes `a[@data-hp-ref="value"]` SOLL auf eine Zelle `#<tabelle>.<Spalte><Zeile>` zeigen, deren Tabelle existiert und deren Zelle `data-hp-value` oder Zellinhalt hat.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Wertverweis „{uri}“ hat keinen gespeicherten Zellwert.

### 5.4 Verschachtelte Information (NEST)

#### HPR-NEST-001 · Fehler · Basis
Inhalt ist ausgeblendet, ohne in `details` zu liegen.

*Bezug:* HP-NEST-001
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Ein Element mit Textinhalt, das `hidden` trägt oder per Stylesheet oder `style`-Attribut `display: none` erhält, ohne Vorfahr `details`, `template` oder `dialog` und ohne `data-hp-priority`, `data-hp-redacted` oder `aria-hidden="true"` mit leerem Text, ist ein Befund. Aufklappen MUSS mit `details`/`summary` ausgedrückt sein, damit der Inhalt ohne Skript erreichbar bleibt.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `{element}` ist ausgeblendet ({grund}), ohne `details` ist der Inhalt ohne Skript nicht erreichbar.

#### HPR-NEST-002 · Warnung · Basis
`data-hp-priority` hat einen unzulässigen Wert.

*Bezug:* HP-NEST-002
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jedes `data-hp-priority` MUSS `1`, `2` oder `3` sein.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `data-hp-priority="{wert}"` (erwartet 1, 2 oder 3).

#### HPR-NEST-003 · Fehler · Basis
Ein Anhang ist nicht korrekt verzeichnet.

*Bezug:* HP-NEST-003
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jeder Eintrag in `attachments` MUSS `url` (existierender Containerpfad), `type` und `name` (nicht leer) haben; jede Datei unter `attachments/` MUSS einen Eintrag haben.
*Ort:* `manifest` mit `{feld}` oder `entry` mit `{pfad}`
*Meldung:* Anhang {pfad}: {grund}.

#### HPR-NEST-004 · Fehler · Basis
Ein eingebettetes Unterdokument stammt nicht aus dem Container oder ist nicht verzeichnet.

*Bezug:* HP-NEST-004
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jedes `iframe/@src` und `object/@data` MUSS auf einen Pfad zeigen, der in `readingOrder` oder `resources` der Fassung steht und Media-Type `application/xhtml+xml` oder `image/svg+xml` hat.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `{element}` bindet „{uri}“ ein, das {grund}.

#### HPR-NEST-005 · Warnung · Basis
Ein langes Inhaltsdokument hat keinen Überblick.

*Bezug:* HP-NEST-005
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Wortzahl des `body` je Inhaltsdokument (Leerraum-getrennte Tokens der Textextraktion); bei mehr als 2 000 Wörtern MUSS ein `section[@data-hp-role="summary"]` vorhanden sein, das nicht in `details` liegt.
*Ort:* `xml` mit `{pfad}`
*Meldung:* {pfad}: {anzahl} Wörter ohne Überblicksabschnitt `data-hp-role="summary"`.

### 5.5 Profile und Fassungen (PROF)

#### HPR-PROF-001 · Fehler · Basis
`conformsTo` nennt nicht genau ein Profil.

*Bezug:* HP-PROF-001, HP-VERS-001
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* `conformsTo` MUSS ein String sein, der `^https://html-pro\.example/spec/\d+\.\d+/profile/(static|interactive|signed|archive)$` entspricht. Fehlt er oder ist er ungültig, prüft der Prüfer die Fassung mit dem Profil `static` weiter und meldet diesen Befund.
*Ort:* `manifest` mit `/conformsTo`
*Meldung:* {feld}: „{wert}“ ist kein gültiger Profilpfad.

#### HPR-PROF-002 · Fehler · Basis
Eine nicht lebendige Fassung enthält Komponenten.

*Bezug:* HP-PROF-002
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für Fassungen mit Profil `static`, `signed` oder `archive`: kein Eintrag unter `components/` (bzw. `renditions/<id>/components/`), kein Schlüssel `components` mit Einträgen im Manifest. (Skripte im Inhalt: HPR-INH-016/017.)
*Ort:* `entry` mit `{pfad}` oder `manifest` mit `/components`
*Meldung:* {pfad}: Komponenten sind in einer Fassung mit Profil {profil} unzulässig.

#### HPR-PROF-003 · Fehler · Lebendig
Ein Skript wird nicht aus einer deklarierten Komponente geladen.

*Bezug:* HP-PROF-003, HP-SBX-002
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für Fassungen mit Profil `interactive`: jedes `script/@src` MUSS aufgelöst mit dem `url` eines Eintrags in `components` übereinstimmen.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `script src="{uri}"` ist keine deklarierte Komponente.

#### HPR-PROF-004 · Fehler · Signiert
Eine Fassung mit Profil `signed` oder `archive` trägt keine Signatur.

*Bezug:* HP-PROF-004
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für Fassungen mit Profil `signed` oder `archive` MUSS mindestens eine Signatur (Abschnitt 7.1) dieser Fassung zugeordnet sein.
*Ort:* `rendition` mit `{fassung}` oder `container`
*Meldung:* Fassung {fassung} hat Profil {profil}, aber keine zugeordnete Signatur.

#### HPR-PROF-005 · Fehler · Archiv
Eine Archiv-Fassung bettet verwendete Schriften nicht ein.

*Bezug:* HP-PROF-005
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für Profil `archive`: jede in `font-family` genannte Familie außer den generischen MUSS in einer `@font-face`-Regel mit Quelle im Container deklariert sein.
*Ort:* `css` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Schrift „{name}“ ist nicht eingebettet.

#### HPR-PROF-006 · Fehler · Archiv
Eine Archiv-Fassung enthält eine Ressource außerhalb der Kernmedientypen.

*Bezug:* HP-PROF-005
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für Profil `archive`: jeder `type` in `resources` MUSS einer der Kernmedientypen aus HP-CONT-015 sein; Anhänge (`attachments`) sind ausgenommen.
*Ort:* `manifest` mit `{feld}`
*Meldung:* {feld}: Media-Type {typ} von {pfad} ist kein Kernmedientyp.

#### HPR-PROF-007 · Fehler · Archiv
Ein externer Hyperlink ist in einer Archiv-Fassung die einzige Quelle einer Information.

*Bezug:* HP-PROF-005
*Geltung:* Fassung
*Mittel:* manuell
*Prüfung:* Für Profil `archive`: jeder `a/@href` nach außen wird dem Prüfer zur Beurteilung vorgelegt; er stellt fest, ob Zieltext oder Zusammenfassung im Dokument stehen. Ein Prüfprogramm listet die Verweise und meldet die Regel als `nicht geprüft` (Grund `manual`).
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: externer Verweis „{uri}“ ohne Zieltext oder Zusammenfassung im Dokument.

#### HPR-PROF-008 · Fehler · Archiv
Die Signatur einer Archiv-Fassung erreicht nicht das Langzeitniveau.

*Bezug:* HP-PROF-005, HP-SIG-011
*Geltung:* Fassung
*Mittel:* signatur
*Prüfung:* Für Profil `archive`: jede zugeordnete Signatur MUSS Niveau `XAdES-BASELINE-LT` oder `LTA` haben (`xades:CertificateValues`, `xades:RevocationValues` und ein Signaturzeitstempel vorhanden).
*Ort:* `signature` mit `{signatur}`
*Meldung:* Signatur {signatur}: Niveau {wert} (erwartet mindestens `XAdES-BASELINE-LT`).

#### HPR-PROF-009 · Fehler · Basis
Ein Eintrag in `renditions` ist unvollständig oder zeigt auf eine Fassung mit fremden Pfaden.

*Bezug:* HP-PROF-006
*Geltung:* Hauptfassung
*Mittel:* statisch
*Prüfung:* Jeder Eintrag in `renditions` MUSS `id` (Kennung nach HP-ADR-002), `role: "frozen"`, `url` = `renditions/<id>/manifest.json` (existierend) und `createdAt` (RFC 3339 UTC) haben; jeder Pfad im Fassungsmanifest (`readingOrder`, `resources`, `attachments`, `data`) MUSS mit `renditions/<id>/` beginnen; jede Datei unter `renditions/` MUSS zu einem verzeichneten `<id>` gehören.
*Ort:* `manifest` mit `{feld}`
*Meldung:* {feld}: {grund}.
*Einstufung:* Nutzung (eingefrorene Fassungen sind optional; ihre Struktur ist bei Nutzung verbindlich)

#### HPR-PROF-010 · Fehler · Signiert
Eine eingefrorene Fassung ist nicht in sich geschlossen.

*Bezug:* HP-PROF-007
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für eingefrorene Fassungen: jeder Ressourcenverweis (Attribute wie in HPR-CONT-020) und jeder interne `a/@href` auf eine Datei MUSS auf einen Pfad unter `renditions/<id>/` zeigen.
*Ort:* `xml` oder `css` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Verweis „{uri}“ verlässt die eingefrorene Fassung {fassung}.

#### HPR-PROF-011 · Fehler · Signiert
Eine eingefrorene Fassung enthält Skripte, Komponenten oder nicht ersetzte Komponenten-Elemente.

*Bezug:* HP-PROF-007
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für eingefrorene Fassungen: Profil MUSS `static`, `signed` oder `archive` sein; kein `script`, kein `on*`-Attribut, keine `javascript:`-URL, kein Verzeichnis `components/`; kein Element, dessen Name einen Bindestrich enthält (Komponenten sind durch ihr statisches Äquivalent in einem Element `div`/`span` mit `data-hp-frozen="<komponentenname>"` ersetzt, Abschnitt 7.3).
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: {grund} in der eingefrorenen Fassung {fassung}.

#### HPR-PROF-012 · Fehler · Signiert
Eine eingefrorene Fassung speichert Formelwerte oder Rechnerangaben nicht.

*Bezug:* HP-PROF-007
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für eingefrorene Fassungen: jede Zelle mit `data-hp-formula` MUSS `data-hp-value` und nicht leeren Zellinhalt haben; kommt mindestens eine solche Zelle vor, MUSS das Fassungsmanifest `computedAt` (RFC 3339 UTC) und `calculator` (`{ "name", "version" }`) enthalten.
*Ort:* `xml` mit `{pfad}`, `{zeile}` oder `manifest` mit `{feld}`
*Meldung:* {pfad}: {grund} (eingefrorene Fassung {fassung} muss Wert, `computedAt` und `calculator` tragen).

#### HPR-PROF-013 · Fehler · Signiert
Die Signatur einer eingefrorenen Fassung referenziert falsche Dateien.

*Bezug:* HP-PROF-008, HP-PROF-009
*Geltung:* Fassung
*Mittel:* signatur
*Prüfung:* Jede der Fassung zugeordnete Signatur MUSS genau die Dateien unter `renditions/<id>/` plus `META-INF/container.xml` referenzieren: jede fehlende Datei und jede Referenz außerhalb ist ein Befund. Eine Referenz auf eine Datei der Hauptfassung würde jede Änderung der Hauptfassung zur Manipulation der eingefrorenen Fassung machen (HP-PROF-009).
*Ort:* `signature` mit `{signatur}`, `{uri}`
*Meldung:* Signatur {signatur}: Referenz „{uri}“ {grund} (Fassung {fassung}).

#### HPR-PROF-014 · Warnung · Signiert
Das Manifest einer eingefrorenen Fassung nennt keine Herkunft.

*Bezug:* HP-PROF-011
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Das Fassungsmanifest SOLL `derivedFrom` mit `integrity` (`sha256-…`) und `method` (`author` oder `render`) tragen.
*Ort:* `manifest` mit `/derivedFrom`
*Meldung:* {feld}: {grund} (erwartet `integrity` und `method` ∈ {author, render}).

#### HPR-PROF-015 · Warnung · Signiert
`derivedFrom.integrity` ist nicht nachvollziehbar.

*Bezug:* HP-PROF-011
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Wenn `derivedFrom.integrity` vorhanden ist und `manifest.json#history` Einträge mit `manifestIntegrity` enthält, SOLL der Wert dem aktuellen Hash von `manifest.json` oder einem `manifestIntegrity` aus `history` entsprechen; andernfalls wird „nicht nachprüfbar“ gemeldet.
*Ort:* `manifest` mit `/derivedFrom/integrity`
*Meldung:* {feld}: {wert} entspricht weder dem aktuellen Hauptmanifest noch einem Eintrag im Verlauf (nicht nachprüfbar).

#### HPR-PROF-016 · Warnung · Signiert
Ein signiertes Dokument enthält keinen sichtbaren Signaturhinweis.

*Bezug:* HP-PROF-013
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für Fassungen mit zugeordneter Signatur: das erste Inhaltsdokument der `readingOrder` SOLL ein Element mit `data-hp-role="signature-notice"` und nicht leerem Text enthalten.
*Ort:* `xml` mit `{pfad}`
*Meldung:* {pfad}: kein Element `data-hp-role="signature-notice"`; EPUB-Lesesysteme zeigen keinen Signaturstatus.

### 5.6 Lebendige Inhalte und Sandbox (SBX)

Jede Regel dieses Bereichs trägt eine Begründung: welche Gefahr sie abwehrt. Das Gefahrenmodell
steht in Abschnitt 6.1; die Lesesystemseite der Sandbox in Abschnitt 9.3.

#### HPR-SBX-001 · Fehler · Lebendig
Eine Komponente ist unvollständig oder mit ungültigem Namen deklariert.

*Bezug:* HP-SBX-001
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jeder Eintrag in `components` MUSS `name` (`^(hp|x-[a-z0-9]+)-[a-z0-9-]+$`), `version` (SemVer 2.0.0: `^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$`), `url` und `integrity` (`sha256-…`) haben; `name` MUSS je Fassung eindeutig sein.
*Ort:* `manifest` mit `{feld}`
*Meldung:* {feld}: {grund} (Komponente braucht `name`, `version`, `url`, `integrity`).
*Begründung:* Nur deklarierte, versionierte und gehashte Skripte laufen; ohne vollständige Deklaration kann das Lesesystem weder Hash noch Herkunft prüfen und müsste raten, was es ausführt.

#### HPR-SBX-002 · Fehler · Lebendig
Die Datei einer Komponente liegt nicht am deklarierten Ort oder fehlt.

*Bezug:* HP-SBX-001
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* `url` MUSS mit `components/<name>@<version>/` beginnen (bei eingefrorenen Fassungen nach `renditions/<id>/`) und im Container existieren.
*Ort:* `manifest` mit `{feld}`
*Meldung:* {feld}: Komponente {name}@{version} erwartet unter `components/{name}@{version}/`, gefunden „{uri}“ ({grund}).
*Begründung:* Ein fester Ort je Name und Version macht Austausch und Nachbau einer Komponente erkennbar und verhindert, dass ein Skript unter fremdem Namen geladen wird.

#### HPR-SBX-003 · Fehler · Lebendig
Der Hash einer Komponente stimmt nicht.

*Bezug:* HP-SBX-001
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* SHA-256 der Skriptdatei, Base64 kodiert, MUSS `integrity` entsprechen.
*Ort:* `entry` mit `{pfad}`
*Meldung:* Komponente {name}@{version}: Hash der Datei {pfad} stimmt nicht (Manifest {erwartet}, Datei {wert}).
*Begründung:* Der Hash ist der einzige Nachweis, dass das ausgeführte Skript das deklarierte ist; ein Lesesystem führt eine Komponente mit falschem Hash nicht aus (HP-SBX-010), ein Erzeuger darf sie so nicht ausliefern.

#### HPR-SBX-004 · Fehler · Lebendig
Ein Inhaltsdokument enthält ein Inline-Skript.

*Bezug:* HP-SBX-002
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für Fassungen mit Profil `interactive`: jedes `script` ohne `src` oder mit nicht leerem Inhalt ist ein Befund; ebenso `script` mit `type` außer `module` und JavaScript-Media-Types (JSON-Datenblöcke gehören in `data/`).
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Inline-Skript; Skripte dürfen nur als `script src` aus `components/` geladen werden.
*Begründung:* Inline-Skript ist beliebiger Code im Dokument und von keinem Hash gedeckt; die CSP des Lesesystems (`script-src` nur Hashes) blockiert ihn, die Regel macht den Verstoß schon am Dokument sichtbar.

#### HPR-SBX-005 · Fehler · Lebendig
Ein Element trägt ein Ereignisattribut.

*Bezug:* HP-SBX-002
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für Fassungen mit Profil `interactive`: jedes Attribut, dessen Name (ohne Rücksicht auf Groß- und Kleinschreibung) mit `on` beginnt, in XHTML, SVG und MathML ist ein Befund.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Ereignisattribut `{attribut}` ist unzulässig.
*Begründung:* Ereignisattribute sind Inline-Code mit vollem Zugriff auf das Dokument; sie umgehen die Deklaration und den Hash der Komponenten.

#### HPR-SBX-006 · Fehler · Lebendig
Ein Attributwert ist eine `javascript:`-URL.

*Bezug:* HP-SBX-002
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für Fassungen mit Profil `interactive`: jeder Attributwert, der nach Entfernen von Leerraum und Steuerzeichen mit `javascript:` (ohne Rücksicht auf Groß- und Kleinschreibung) oder mit `data:text/html` beginnt, ist ein Befund.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `{element}/@{attribut}` ist eine Skript-URL.
*Begründung:* `javascript:`-URLs führen Code bei Aktivierung eines Verweises aus; `data:text/html` erzeugt ein neues Dokument mit eigenem Code. Beides unterläuft die Komponentenregel.

#### HPR-SBX-007 · Fehler · Lebendig
Eine SVG-Datei oder ein SVG-Element enthält Skript.

*Bezug:* HP-SBX-002
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für Fassungen mit Profil `interactive`: jedes `script`-Element im SVG-Namensraum (in eigenständigen SVG-Dateien und inline) und jedes `set`/`animate` mit `attributeName="href"` ist ein Befund.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Skript in SVG ({element}).
*Begründung:* SVG ist ein zweiter Skriptträger; Bilder gelten als harmlos und werden seltener geprüft, daher ist SVG ein bevorzugter Weg, Code einzuschleusen.

#### HPR-SBX-008 · Fehler · Lebendig
Ein Element mit Bindestrich im Namen ist keine deklarierte Komponente.

*Bezug:* HP-SBX-003
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für Fassungen mit Profil `interactive`: jeder Elementname im XHTML-Namensraum, der einen Bindestrich enthält, MUSS als `name` in `components` stehen.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Element `{element}` ist keine deklarierte Komponente.
*Begründung:* Ein Custom Element wird durch das Skript definiert, das seinen Namen registriert; ein nicht deklariertes Element könnte von einem fremden, nicht gehashten Skript bedient werden oder bleibt ohne statisches Äquivalent leer.

#### HPR-SBX-009 · Fehler · Lebendig
Ein Komponenten-Element hat kein statisches Äquivalent.

*Bezug:* HP-SBX-004
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jedes Komponenten-Element MUSS im Lichtbaum Text, ein `img`, eine `table` oder eine Liste mit nicht leerer Textextraktion enthalten; ein `template`-Kind zählt nicht.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Komponente `{element}` ({kennung}) hat kein statisches Äquivalent im Lichtbaum.
*Begründung:* Ohne Skript, ohne unterstützte Komponente oder nach Ablauf der Langzeitlesbarkeit bleibt nur das statische Äquivalent; fehlt es, verschwindet Information, und die Zusage „Dokument bleibt lesbar“ ist gebrochen.

#### HPR-SBX-010 · Fehler · Lebendig
Mit Skript sind Inhalte sichtbar, die im statischen Äquivalent fehlen.

*Bezug:* HP-SBX-004
*Geltung:* Fassung
*Mittel:* rendering
*Prüfung:* Dokument einmal mit und einmal ohne Skripte rendern; die Textextraktion jedes Komponenten-Elements mit Skript (ohne Bedienelemente `button`, `input`, `select`, `summary`) MUSS in der Extraktion ohne Skript enthalten sein.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Komponente `{element}` ({kennung}) zeigt mit Skript Inhalt, der im statischen Äquivalent fehlt: „{wert}“.
*Begründung:* Was nur mit Skript sichtbar ist, ist in der eingefrorenen Fassung, im Ausdruck und in Lesesystemen der Stufe Basis nicht vorhanden; das Signierte wäre nicht das Gezeigte.

#### HPR-SBX-011 · Fehler · Lebendig
Ein Formular sendet an ein Ziel außerhalb des Containers.

*Bezug:* HP-SBX-013
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jedes `form` MUSS `action` weglassen oder auf `#` setzen; `button/@formaction` und `input/@formaction` DÜRFEN NICHT vorkommen.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `form action="{uri}"`; Eingaben werden in `data/` gespeichert, nicht gesendet.
*Begründung:* Formularversand ist der einfachste Weg, Eingaben aus einem Dokument an einen fremden Server zu leiten (Phishing in HTML-Anhängen); die Sandbox blockiert ihn (`allow-forms` fehlt, `form-action 'none'`), die Regel verhindert, dass ein Dokument es überhaupt versucht.

#### HPR-SBX-012 · Fehler · Lebendig
Eine Komponente spielt Ton ohne Nutzeraktion oder bewegt sich bei reduzierter Bewegung.

*Bezug:* HP-SBX-014
*Geltung:* Fassung
*Mittel:* rendering
*Prüfung:* Dokument mit emulierter Einstellung `prefers-reduced-motion: reduce` rendern, 10 Sekunden ohne Eingabe warten; `document.getAnimations()` MUSS leer sein, kein Medium darf wiedergegeben werden, kein `AudioContext` darf im Zustand `running` sein.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Komponente `{element}` ({kennung}): {grund} ohne Nutzeraktion.
*Begründung:* Ton und Bewegung ohne Nutzeraktion schließen Menschen mit vestibulären oder kognitiven Einschränkungen aus und sind das Mittel, mit dem Dokumente Aufmerksamkeit erzwingen; die Systemeinstellung ist für Dokumente verbindlich.

#### HPR-SBX-013 · Fehler · Basis
Eine Formelzelle speichert keinen Wert.

*Bezug:* HP-SBX-016
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jede Zelle (`td`, `th`) mit `data-hp-formula` MUSS `data-hp-value` und nicht leeren Zellinhalt haben.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Zelle {kennung} hat eine Formel, aber keinen gespeicherten Wert.
*Begründung:* Ohne gespeicherten Wert zeigt ein Dokument ohne Rechner leere Zellen; Formel und Wert gehören zusammen, damit Lesen und Signieren vom Rechner unabhängig sind.

#### HPR-SBX-014 · Fehler · Basis
Eine Formel nutzt eine verbotene Funktion oder einen Makroaufruf.

*Bezug:* HP-SBX-016
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Der Formeltext jeder Zelle wird tokenisiert; Funktionsnamen `NOW`, `TODAY`, `RAND`, `RANDBETWEEN`, `WEBSERVICE`, `DDE`, `HYPERLINK` mit Ziel außerhalb des Dokuments, `MACRO`, `EXEC`, `CALL`, `REGISTER` und jeder Name, den Teil 3 nicht als unterstützt führt, sind Befunde; bis Teil 3 vorliegt, gilt nur die genannte Verbotsliste.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Zelle {kennung}: Funktion `{name}` ist in Formeln unzulässig.
*Begründung:* Zufall, Uhrzeit, Netz- und Dateizugriff machen Ergebnisse unreproduzierbar und öffnen den Rechner nach außen; Makros sind der klassische Angriffsvektor von Tabellendokumenten.

#### HPR-SBX-015 · Fehler · Lebendig
Eine Komponente verändert Inhalt außerhalb ihres Elements, setzt Fokus oder ist nicht mit Tastatur bedienbar.

*Bezug:* HP-SBX-017
*Geltung:* Fassung
*Mittel:* rendering
*Prüfung:* DOM außerhalb der Komponenten-Elemente vor und 5 Sekunden nach Initialisierung vergleichen (Serialisierung ohne die Komponenten-Teilbäume): MUSS gleich sein; `document.activeElement` MUSS `body` bleiben; Tastaturdurchlauf (Tab, Umschalt+Tab, Enter, Leertaste, Pfeiltasten) MUSS jedes fokussierbare Bedienelement der Komponente erreichen und auslösen.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Komponente `{element}` ({kennung}): {grund}.
*Begründung:* Eine Komponente, die fremden Text ändert, kann das Dokument fälschen, ohne dass es ein Hash erkennt; Fokusraub und Mausabhängigkeit verspielen den Barrierefreiheitsvorsprung von Zusage 5 in [Q2] §3.

#### HPR-SBX-016 · Fehler · Lebendig
Der Quelltext einer Komponente nutzt Speicher-, Netz- oder Hüllenschnittstellen.

*Bezug:* HP-SBX-007
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Die Skriptdatei jeder Komponente wird tokenisiert (JavaScript-Lexer, Strings und Kommentare ausgenommen); die Bezeichner `localStorage`, `sessionStorage`, `indexedDB`, `caches`, `cookie`, `BroadcastChannel`, `SharedWorker`, `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `RTCPeerConnection`, `open` auf `window`, `__TAURI__`, `__TAURI_INTERNALS__`, `ipcRenderer`, `require`, `process`, `eval`, `Function` als Aufruf, `importScripts`, `Worker`, `top`, `parent`, `opener` als Eigenschaftszugriff auf `window`/`globalThis` sind Befunde. Diese Prüfung ist ein Vorfilter: ein Treffer ist ein Verstoß, kein Treffer ist kein Freispruch; die Durchsetzung leistet das Lesesystem (Abschnitt 9.3).
*Ort:* `xml` mit `{pfad}`, `{zeile}` (Skriptdatei)
*Meldung:* {pfad}:{zeile}: Komponente {name}@{version} verwendet `{wert}`; Speichern außerhalb des Dokuments, Netzzugriff und Hüllenzugriff sind unzulässig.
*Begründung:* Komponenten dürfen nichts nach außen senden, nichts nachladen, nichts außerhalb des Dokuments speichern (Zusage 2 in [Q2]); der statische Vorfilter findet die naheliegenden Verstöße vor dem Ausführen und macht Absicht sichtbar, die die Sandbox später nur blockieren würde.

#### HPR-SBX-017 · Fehler · Lebendig
Eine Komponente lädt Module oder Skripte nach, die nicht als Komponente deklariert sind.

*Bezug:* HP-SBX-002
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Im Quelltext jeder Komponente MUSS jede statische `import`-Deklaration und jeder `import()`-Aufruf mit literalem Ziel auf eine Datei zeigen, die als `url` einer Komponente derselben Fassung deklariert ist; `import()` mit nicht literalem Ziel, `new Worker(...)`, `importScripts(...)` und das Anlegen von `script`-Elementen (`createElement("script")`) sind Befunde.
*Ort:* `xml` mit `{pfad}`, `{zeile}` (Skriptdatei)
*Meldung:* {pfad}:{zeile}: Komponente {name}@{version} lädt „{uri}“ nach, das keine deklarierte Komponente ist.
*Begründung:* Nachladen umgeht Deklaration und Hashprüfung; nur Code, dessen Hash im Manifest steht, darf laufen.

#### HPR-SBX-018 · Fehler · Lebendig
Eine Datendatei ist nicht gegen ihr Schema gültig.

*Bezug:* HP-SBX-008
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jeder Eintrag in `data` MUSS `url` (existierende Datei unter `data/` mit Media-Type `application/json`) haben; nennt er `schema`, MUSS die Schemadatei existieren, ein gültiges JSON Schema (Entwurf 2020-12) sein, und die Datendatei MUSS dagegen gültig sein. Das Schema DARF NICHT `$ref` auf Ziele außerhalb des Containers enthalten.
*Ort:* `manifest` mit `{feld}` oder `entry` mit `{pfad}`
*Meldung:* {pfad}: {grund} (Daten müssen gegen das in `manifest.json#data` genannte Schema gültig sein).
*Begründung:* Das Schema ist die Grenze dessen, was eine Komponente schreiben darf; ungültige Daten im Container zeigen, dass diese Grenze nicht eingehalten wurde, und ein externes `$ref` wäre ein Netzzugriff beim Validieren.

### 5.7 Sperren, Rechte und Redaktion (LOCK)

#### HPR-LOCK-001 · Fehler · Basis
Ein Sperreintrag ist ungültig.

*Bezug:* HP-LOCK-001
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jeder Eintrag in `access` MUSS `target` (Adresse `pfad#kennung` oder Containerpfad, auflösbar) und `rules` (nicht leere Liste) haben; jede Regel MUSS `read-only`, `no-print`, `no-export`, `hidden` oder `x-<kennung>-…` sein.
*Ort:* `manifest` mit `{feld}`
*Meldung:* {feld}: {grund} (Sperre braucht auflösbares `target` und Regeln aus read-only, no-print, no-export, hidden, x-…).

#### HPR-LOCK-002 · Fehler · Basis
Das Redaktionsprotokoll ist ungültig.

*Bezug:* HP-LOCK-008
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Wenn `data/redaction-log.json` vorhanden ist: JSON-Liste von Objekten mit `target` (Adresse) und `at` (RFC 3339 UTC); `reason` und `actor` optional als String.
*Ort:* `entry` mit `data/redaction-log.json`
*Meldung:* `data/redaction-log.json`: {grund}.

#### HPR-LOCK-003 · Fehler · Basis
Eine protokollierte Redaktion hat keinen Platzhalter an ihrer Adresse.

*Bezug:* HP-LOCK-008
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für jeden Eintrag des Redaktionsprotokolls MUSS an der Adresse `target` ein Element mit `data-hp-redacted` existieren (als Element mit dieser Kennung oder als Nachfahre des Elements mit dieser Kennung).
*Ort:* `xml` mit `{pfad}`
*Meldung:* Redaktion {uri}: kein Element `data-hp-redacted` an der Adresse.

#### HPR-LOCK-004 · Fehler · Basis
Ein Redaktionsplatzhalter enthält noch Inhalt.

*Bezug:* HP-LOCK-007
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jedes Element mit `data-hp-redacted` MUSS leer sein (kein Text außer Leerraum, keine Kindelemente) und `role="img"` sowie `aria-label` tragen.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Redaktionsplatzhalter enthält Inhalt („{wert}“); Redaktion heißt Löschen.

#### HPR-LOCK-005 · Fehler · Basis
Ein redigierter Begriff ist im Container noch auffindbar.

*Bezug:* HP-LOCK-007
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Nur mit Parameter (Liste redigierter Zeichenketten vom Aufrufer): alle Einträge entpacken; Volltextsuche in Textdateien (XHTML, SVG, CSS, JSON, OPF, XML), in Metadaten von Bildern (EXIF/XMP-Textfelder) und, wenn eine Texterkennung verfügbar ist, in Bildinhalten. Jeder Treffer ist ein Befund. Ohne Parameter: `nicht geprüft`, Grund `missing-means`.
*Ort:* `entry` mit `{pfad}`
*Meldung:* Eintrag {pfad}: redigierter Begriff „{wert}“ ist noch enthalten.

#### HPR-LOCK-006 · Fatal · Basis
Die Datei ist ein verschlüsselter Umschlag.

*Bezug:* HP-LOCK-010
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Beginnt die Datei mit einer DER-SEQUENCE, deren erster Inhalt die OID `1.2.840.113549.1.7.3` (CMS EnvelopedData) ist, endet die Prüfung: der Umschlag MUSS zuerst entschlüsselt werden.
*Ort:* `container`
*Meldung:* Die Datei ist ein CMS-Umschlag (EnvelopedData); erst entschlüsseln, dann prüfen.
*Einstufung:* Nutzung (Verschlüsselung ist optional; ein Umschlag ist kein Prüfgegenstand)

### 5.8 Signaturen und Zeitstempel (SIG)

#### HPR-SIG-001 · Fehler · Signiert
`META-INF/signatures.xml` ist nicht wohlgeformt oder hat nicht die OCF-Wurzel.

*Bezug:* HP-SIG-001
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Wenn vorhanden: wohlgeformtes XML; Wurzel `{urn:oasis:names:tc:opendocument:xmlns:container}signatures`; Kinder nur `{http://www.w3.org/2000/09/xmldsig#}Signature`.
*Ort:* `xml` mit `META-INF/signatures.xml`
*Meldung:* `META-INF/signatures.xml`: {grund} (erwartet OCF-Wurzel `signatures` mit `ds:Signature`-Kindern).

#### HPR-SIG-002 · Fehler · Signiert
Eine Signatur ist keine XAdES-Signatur.

*Bezug:* HP-SIG-001
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Jedes `ds:Signature` MUSS ein `ds:Object` mit `xades:QualifyingProperties/xades:SignedProperties` enthalten, das über eine `ds:Reference` mit `Type="http://uri.etsi.org/01903#SignedProperties"` signiert ist.
*Ort:* `signature` mit `{signatur}`
*Meldung:* Signatur {signatur}: keine XAdES-Signatur ({grund}).

#### HPR-SIG-003 · Fehler · Signiert
Der Container enthält CAdES-Signaturdateien.

*Bezug:* HP-SIG-002
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Jeder Eintrag `META-INF/*signature*.p7s` oder `META-INF/ASiCManifest*.xml` ist ein Befund (Erzeuger-Konformität); ein Lesesystem darf solche Signaturen prüfen und kennzeichnet sie als fremdes Format.
*Ort:* `entry` mit `{pfad}`
*Meldung:* Eintrag {pfad}: CAdES-Signatur; html-Pro-Erzeuger schreiben nur XAdES in `META-INF/signatures.xml`.

#### HPR-SIG-004 · Fehler · Signiert
Eine Signatur verwendet nicht die exklusive Kanonisierung.

*Bezug:* HP-SIG-004
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* `ds:SignedInfo/ds:CanonicalizationMethod/@Algorithm` und die `ds:Transform` der `SignedProperties`-Referenz MÜSSEN `http://www.w3.org/2001/10/xml-exc-c14n#` sein.
*Ort:* `signature` mit `{signatur}`
*Meldung:* Signatur {signatur}: Kanonisierung {wert} (erwartet `xml-exc-c14n#`).

#### HPR-SIG-005 · Fehler · Signiert
Eine Datei der Fassung wird von keiner ihr zugeordneten Signatur referenziert.

*Bezug:* HP-SIG-005, HP-PROF-004
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für jede Fassung mit zugeordneter Signatur: jede Datei der Fassung außer `mimetype` und `META-INF/*` MUSS als `ds:Reference/@URI` (prozentdekodiert) in mindestens einer zugeordneten Signatur vorkommen. Dateien unter `annotations/` sind ausgenommen (zulässig unsigniert, Hinweis HPR-SIG-017).
*Ort:* `signature` mit `{signatur}`, `{uri}`
*Meldung:* Datei {pfad} der Fassung {fassung} ist von keiner Signatur abgedeckt.

#### HPR-SIG-006 · Fehler · Signiert
Eine Signaturreferenz zeigt auf eine fehlende Datei.

*Bezug:* HP-SIG-005
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Jede `ds:Reference/@URI` ohne `#` MUSS prozentdekodiert ein Eintrag des Containers sein.
*Ort:* `signature` mit `{signatur}`, `{uri}`
*Meldung:* Signatur {signatur}: Referenz „{uri}“ zeigt auf keine Datei im Container.

#### HPR-SIG-007 · Fehler · Signiert
Eine Signatur referenziert `META-INF/container.xml` nicht.

*Bezug:* HP-SIG-005
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Jede Signatur MUSS eine Referenz mit `URI="META-INF/container.xml"` haben.
*Ort:* `signature` mit `{signatur}`
*Meldung:* Signatur {signatur}: `META-INF/container.xml` ist nicht referenziert.

#### HPR-SIG-008 · Fehler · Signiert
`DataObjectFormat` fehlt oder nennt einen anderen Media-Type als das Manifest.

*Bezug:* HP-SIG-006
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Für jede Datei-Referenz MUSS ein `xades:DataObjectFormat` mit `ObjectReference` auf diese Referenz existieren; `xades:MimeType` MUSS dem `type` aus dem Manifest der Fassung entsprechen, bzw. `text/xml` für `container.xml`, `application/oebps-package+xml` für `package.opf`, `application/json` für `manifest.json`.
*Ort:* `signature` mit `{signatur}`, `{uri}`
*Meldung:* Signatur {signatur}: Referenz „{uri}“ hat {grund} (erwartet `DataObjectFormat` mit {erwartet}).

#### HPR-SIG-009 · Fehler · Signiert
Signierzeit, Zertifikatsbezug oder Zertifikat fehlen oder passen nicht.

*Bezug:* HP-SIG-007
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* `xades:SigningTime` (RFC 3339, UTC) und `xades:SigningCertificateV2` MÜSSEN vorhanden sein; `ds:KeyInfo` MUSS ein Zertifikat enthalten, dessen Digest dem in `SigningCertificateV2` entspricht; `SigningTime` MUSS zwischen `notBefore` und `notAfter` dieses Zertifikats liegen.
*Ort:* `signature` mit `{signatur}`
*Meldung:* Signatur {signatur}: {grund}.

#### HPR-SIG-010 · Fehler · Signiert
Eine Signatur verwendet einen unzulässigen Algorithmus oder Schlüssel.

*Bezug:* HP-SIG-008
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* `ds:SignatureMethod/@Algorithm` MUSS RSA (mindestens 3072 Bit, PKCS#1 v1.5 oder PSS) oder ECDSA (P-256, P-384, P-521) mit SHA-256/384/512 sein; jede `ds:DigestMethod/@Algorithm` MUSS SHA-256/384/512 sein; MD5, SHA-1, RSA unter 2048 Bit und DSA sind Befunde. Entspricht `CRYPTO_CONSTRAINTS_FAILURE` der Validierung.
*Ort:* `signature` mit `{signatur}`
*Meldung:* Signatur {signatur}: Algorithmus {wert} ist unzulässig ({grund}).

#### HPR-SIG-011 · Fehler · Signiert
`META-INF/manifest.xml` fehlt oder ist unvollständig.

*Bezug:* HP-SIG-009
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* In signierten Containern MUSS `META-INF/manifest.xml` vorhanden und wohlgeformt im Namensraum `urn:oasis:names:tc:opendocument:xmlns:manifest:1.0` sein, mit `file-entry` `full-path="/"` und `media-type="application/epub+zip"` sowie einem `file-entry` je signierter Datei mit ihrem Media-Type.
*Ort:* `xml` mit `META-INF/manifest.xml`
*Meldung:* `META-INF/manifest.xml`: {grund}.

#### HPR-SIG-012 · Warnung · Signiert
Eine Signatur trägt keinen Signaturzeitstempel.

*Bezug:* HP-SIG-010
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Jede Signatur SOLL `xades:SignatureTimeStamp` mit einem RFC-3161-Token enthalten.
*Ort:* `signature` mit `{signatur}`
*Meldung:* Signatur {signatur}: kein Signaturzeitstempel (Niveau {wert}; empfohlen `XAdES-BASELINE-T`).

#### HPR-SIG-013 · Fehler · Archiv
Eine Signatur der Archiv-Fassung hat keine eingebetteten Validierungsdaten.

*Bezug:* HP-SIG-011
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für Fassungen mit Profil `archive`: jede zugeordnete Signatur MUSS `xades:CertificateValues` und `xades:RevocationValues` sowie einen Signaturzeitstempel enthalten (Niveau LT).
*Ort:* `signature` mit `{signatur}`
*Meldung:* Signatur {signatur}: {grund} (Archiv verlangt Niveau `XAdES-BASELINE-LT`).

#### HPR-SIG-014 · Warnung · Archiv
Eine Signatur der Archiv-Fassung hat keinen Archivzeitstempel.

*Bezug:* HP-SIG-011
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Für Fassungen mit Profil `archive`: jede zugeordnete Signatur SOLL `xades:ArchiveTimeStamp` (Niveau LTA) enthalten.
*Ort:* `signature` mit `{signatur}`
*Meldung:* Signatur {signatur}: kein Archivzeitstempel (Niveau {wert}; empfohlen `XAdES-BASELINE-LTA`).
*Einstufung:* Teilsatz (der LTA-Satz der Anforderung ist ein SOLL)

#### HPR-SIG-015 · Fehler · Signiert
Die Signaturprüfung ergibt `TOTAL_FAILED`.

*Bezug:* HP-SIG-012, HP-PROF-010
*Geltung:* Container
*Mittel:* signatur
*Prüfung:* Jede Signatur nach EN 319 102-1 validieren (Referenzen, Signaturwert, Zertifikatsbindung, Algorithmen, Zeit). Hauptindikation `TOTAL_FAILED` ist ein Befund mit der Unterindikation (`HASH_FAILURE`, `SIG_CRYPTO_FAILURE`, `FORMAT_FAILURE`, `CRYPTO_CONSTRAINTS_FAILURE`, …); bei `HASH_FAILURE` nennt der Befund jede nicht intakte Referenz. Die Zuordnung der Indikationen steht in Abschnitt 7.5.
*Ort:* `signature` mit `{signatur}`, `{uri}`
*Meldung:* Signatur {signatur}: {indikation}{grund}.

#### HPR-SIG-016 · Hinweis · Signiert
Die Signaturprüfung ergibt `INDETERMINATE`.

*Bezug:* HP-SIG-012
*Geltung:* Container
*Mittel:* signatur
*Prüfung:* Hauptindikation `INDETERMINATE` (z. B. `NO_CERTIFICATE_CHAIN_FOUND`, `NO_SIGNING_CERTIFICATE_FOUND`, `OUT_OF_BOUNDS_NO_POE`, `TRY_LATER`) ist kein Dokumentfehler, aber die Stufe Signiert kann nicht bestätigt werden.
*Ort:* `signature` mit `{signatur}`
*Meldung:* Signatur {signatur}: {indikation} (Vertrauen nicht feststellbar; Stufe Signiert unbestimmt).
*Einstufung:* Unbestimmt

#### HPR-SIG-017 · Hinweis · Signiert
Der Container enthält Dateien, die von keiner Signatur abgedeckt sind.

*Bezug:* HP-SIG-013
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Jede Datei außer `mimetype`, `META-INF/signatures*.xml`, `META-INF/manifest.xml`, die in keiner Signatur referenziert ist, wird genannt; für Dateien einer signierten Fassung außerhalb `annotations/` gilt zusätzlich HPR-SIG-005.
*Ort:* `entry` mit `{pfad}`
*Meldung:* Datei {pfad} ist nicht signiert.
*Einstufung:* Information

#### HPR-SIG-018 · Fehler · Signiert
Der Container enthält privates Schlüsselmaterial.

*Bezug:* HP-SIG-019
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Alle Einträge auf die Zeichenkette `PRIVATE KEY` und auf DER-Strukturen mit den OIDs `1.2.840.113549.1.12` (PKCS#12) oder PKCS#8-`PrivateKeyInfo` (SEQUENCE, INTEGER 0, AlgorithmIdentifier, OCTET STRING) durchsuchen.
*Ort:* `entry` mit `{pfad}`
*Meldung:* Eintrag {pfad}: enthält privates Schlüsselmaterial ({grund}).

#### HPR-SIG-019 · Hinweis · Signiert
Ein Signaturfeld hat keine zugehörige Signatur.

*Bezug:* HP-SIG-016
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jedes Element mit `data-hp-signature-ref` wird mit den `ds:Signature/@Id` verglichen; ohne Treffer ist das Feld „noch nicht signiert“.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Signaturfeld „{kennung}“ ist noch nicht signiert.

#### HPR-SIG-020 · Fehler · Signiert
Eine Referenzdarstellung ist nicht mitsigniert oder kein gültiges PDF/A.

*Bezug:* HP-SIG-018
*Geltung:* Fassung
*Mittel:* extern
*Prüfung:* Wenn `renditions/<id>/reference.pdf` vorhanden ist oder ein Eintrag `role: "reference-pdf"` existiert: die Datei MUSS von jeder der Fassung zugeordneten Signatur referenziert sein und mit einem offenen PDF/A-Validator bestehen.
*Ort:* `entry` mit `{pfad}`
*Meldung:* Referenzdarstellung {pfad}: {grund}.
*Einstufung:* Nutzung (Referenzdarstellung ist optional; bei Nutzung mitsigniert und gültig)

#### HPR-SIG-021 · Fehler · Signiert
Die Signaturen stehen nicht in zeitlicher Reihenfolge.

*Bezug:* HP-SIG-003
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Die `xades:SigningTime` der `ds:Signature`-Kinder in Dokumentreihenfolge MÜSSEN nicht fallend sein (Toleranz 60 Sekunden); eine frühere Signatur nach einer späteren zeigt, dass nicht am Ende angefügt wurde.
*Ort:* `signature` mit `{signatur}`
*Meldung:* Signatur {signatur} ({wert}) steht nach einer späteren Signatur; neue Signaturen gehören ans Ende.

#### HPR-SIG-022 · Fehler · Signiert
Eine Signatur liegt in einer anderen Datei als `META-INF/signatures.xml`.

*Bezug:* HP-SIG-001
*Geltung:* Container
*Mittel:* statisch
*Prüfung:* Jede Datei `META-INF/signatures*.xml` außer `META-INF/signatures.xml`, die `ds:Signature` enthält, ist ein Befund (Erzeuger-Konformität; Lesesysteme prüfen sie trotzdem, Abschnitt 7.1).
*Ort:* `entry` mit `{pfad}`
*Meldung:* Eintrag {pfad}: Signatur außerhalb von `META-INF/signatures.xml` (fremdes Werkzeug?).

### 5.9 Druckprofil (PRINT)

#### HPR-PRINT-001 · Fehler · Basis
Das Dokument enthält feste Seitengeometrie.

*Bezug:* HP-PRINT-001
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Stylesheets und `style`-Attribute: `position: absolute|fixed` zusammen mit `width`/`height` in `210mm`, `297mm`, `8.5in`, `11in`, `595pt`, `842pt` (± 2 %), oder Elemente mit `class`/`role`, die das Token `page` enthalten und solche Maße tragen; ein `img`/`svg` als einziges Kind des `body` mit Seitenmaßen.
*Ort:* `css` oder `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: feste Seitengeometrie ({grund}); der Ausdruck entsteht aus der fließenden Ansicht.

#### HPR-PRINT-002 · Fehler · Basis
Ein `@page`-Regelwerk des Dokuments unterdrückt Kopf- oder Fußzeile.

*Bezug:* HP-PRINT-002
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* In `@page`-Regeln des Dokuments: `margin` oder `margin-top`/`margin-bottom` unter 15 mm, `@top-*`/`@bottom-*`-Boxen mit `content: none` oder leerem `content`.
*Ort:* `css` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `@page` {grund}; Kopf- und Fußzeile des Lesesystems dürfen nicht unterdrückt werden.

#### HPR-PRINT-003 · Fehler · Basis
Ein Druckstylesheet hebt Druckanforderungen auf.

*Bezug:* HP-PRINT-013
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* In `@media print`-Blöcken und Stylesheets mit `media="print"`: `display: none` oder `visibility: hidden` auf `thead`, `details`, `summary`, `figcaption`, `h1`–`h6`, `nav`; `overflow: hidden` auf `pre`, `table`; `white-space: pre` (ohne `-wrap`) auf `pre`.
*Ort:* `css` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Druckstylesheet setzt `{wert}` auf `{element}` und hebt damit eine Druckanforderung auf.
*Einstufung:* Nutzung (ein Druckstylesheet ist optional; bei Nutzung darf es HP-PRINT-003 bis -010 nicht aufheben)

### 5.10 Metadaten (META)

#### HPR-META-001 · Fehler · Basis
Ein Pflichtfeld des Manifests fehlt oder hat den falschen Typ.

*Bezug:* HP-META-001
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* `@context` (Liste, enthält `https://www.w3.org/ns/pub-context` und einen String, der mit `https://html-pro.example/ns/` beginnt), `conformsTo` (String), `id` (String, absolute URI), `name` (nicht leerer String), `inLanguage` (String), `dateModified` (String), `readingOrder` (Liste), `resources` (Liste). Je Feld ein Befund.
*Ort:* `manifest` mit `{feld}`
*Meldung:* {feld}: {grund}.

#### HPR-META-002 · Fehler · Basis
`dateModified` hat nicht die vorgeschriebene Form.

*Bezug:* HP-META-001
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* `dateModified` MUSS `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$` entsprechen und ein gültiger Zeitpunkt sein.
*Ort:* `manifest` mit `/dateModified`
*Meldung:* {feld}: „{wert}“ (erwartet `YYYY-MM-DDThh:mm:ssZ`).

#### HPR-META-003 · Fehler · Basis
`inLanguage` ist kein gültiges Sprachkürzel.

*Bezug:* HP-META-001
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* `inLanguage` MUSS wohlgeformt nach BCP 47 sein (Muster wie HPR-INH-003).
*Ort:* `manifest` mit `/inLanguage`
*Meldung:* {feld}: „{wert}“ ist kein gültiges BCP-47-Kürzel.

#### HPR-META-004 · Fehler · Basis
`readingOrder` ist leer oder enthält andere Typen als XHTML.

*Bezug:* HP-META-001
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* `readingOrder` MUSS mindestens ein Element haben; jedes MUSS `url` (existierend) und `type` = `application/xhtml+xml` haben.
*Ort:* `manifest` mit `{feld}`
*Meldung:* {feld}: {grund} (readingOrder: nicht leer, nur `application/xhtml+xml`).

#### HPR-META-005 · Warnung · Basis
`id` ist keine UUID-URN.

*Bezug:* HP-META-001
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* `id` SOLL `^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` entsprechen.
*Ort:* `manifest` mit `/id`
*Meldung:* {feld}: „{wert}“ ist keine `urn:uuid:`-Kennung.
*Einstufung:* Teilsatz („SOLL `urn:uuid:`“ in einer Muss-Anforderung)

#### HPR-META-006 · Fehler · Basis
Die Pflichtmetadaten in `package.opf` stimmen nicht mit dem Manifest überein.

*Bezug:* HP-META-002
*Geltung:* Hauptfassung
*Mittel:* statisch
*Prüfung:* `dc:identifier` (das von `unique-identifier` benannte) = `id`; `dc:title[1]` = `name`; `dc:language[1]` = `inLanguage`; `meta[@property="dcterms:modified"]` = `dateModified`.
*Ort:* `xml` mit `package.opf`
*Meldung:* `package.opf`: {feld} ist „{wert}“, Manifest sagt „{erwartet}“.

#### HPR-META-007 · Fehler · Basis
Eine Barrierefreiheitskonformität wird ohne Prüfbericht behauptet.

*Bezug:* HP-META-004
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Wenn `accessibility.conformsTo` gesetzt ist, MUSS `data/accessibility-report.json` existieren, JSON-Objekt mit `date` (RFC 3339), `method` (String) und nicht leerer Liste `results` sein.
*Ort:* `manifest` mit `/accessibility/conformsTo`
*Meldung:* {feld}: Konformität „{wert}“ behauptet, aber {grund}.

#### HPR-META-008 · Warnung · Basis
Barrierefreiheitsmetadaten fehlen.

*Bezug:* HP-META-004
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* `accessibility` SOLL vorhanden sein mit `accessMode` (Liste), `accessModeSufficient` (Liste von Listen), `accessibilityFeature` (Liste), `accessibilityHazard` (Liste), `accessibilitySummary` (String).
*Ort:* `manifest` mit `/accessibility`
*Meldung:* {feld}: {grund} (Barrierefreiheitsmetadaten nach EPUB Accessibility 1.1 empfohlen).
*Einstufung:* Teilsatz („SOLLEN … stehen“ in einer Muss-Anforderung)

#### HPR-META-009 · Warnung · Basis
Herkunftsangaben bei Konvertierung fehlen oder sind unvollständig.

*Bezug:* HP-META-005
*Geltung:* Hauptfassung
*Mittel:* statisch
*Prüfung:* Wenn Dateien unter `original/` liegen, SOLL `source` vorhanden sein; wenn `source` vorhanden ist, SOLL es `url` (existierend), `type`, `tool` (`{ "name", "version" }` oder String) und `date` nennen.
*Ort:* `manifest` mit `/source`
*Meldung:* {feld}: {grund}.

#### HPR-META-010 · Fehler · Basis
Der Verlauf im Manifest ist inkonsistent.

*Bezug:* HP-META-006
*Geltung:* Hauptfassung
*Mittel:* statisch
*Prüfung:* Wenn `history` vorhanden ist: Liste von Objekten mit `version` (ganzzahlig, streng aufsteigend ab 1), `dateModified` (RFC 3339, nicht fallend) und `manifestIntegrity` (`sha256-…`, ab dem zweiten Eintrag).
*Ort:* `manifest` mit `{feld}`
*Meldung:* {feld}: {grund}.
*Einstufung:* Nutzung (Verlauf ist optional; bei Nutzung ist seine Form verbindlich)

#### HPR-META-011 · Fehler · Basis
Das Manifest enthält einen unbekannten Schlüssel ohne Präfix.

*Bezug:* HP-META-008, HP-VERS-005
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jeder Schlüssel auf oberster Ebene und in den Objekten von `readingOrder`, `resources`, `components`, `renditions`, `access`, `attachments`, `data`, `extensions`, `history`, `source`, `derivedFrom`, `accessibility` MUSS in Teil 0 definiert sein oder mit `x-<kennung>-` beginnen (`^x-[a-z0-9]+-`). Schlüssel aus dem Publication Manifest (`author`, `publisher`, `datePublished`, `abridged`, `accessibility*`, `url`, `type`) gelten als definiert.
*Ort:* `manifest` mit `{feld}`
*Meldung:* {feld}: unbekannter Schlüssel „{wert}“ ohne Präfix `x-<kennung>-`.

### 5.11 Versionierung und Erweiterungen (VERS)

#### HPR-VERS-001 · Hinweis · Basis
Das Dokument nennt eine höhere Nebenversion als der Prüfer.

*Bezug:* HP-VERS-002
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Ist die Nebenversion in `conformsTo` größer als die des Prüfers bei gleicher Hauptversion, prüft der Prüfer nach den Regeln seiner Version und meldet dies; eine höhere Hauptversion ist ein Befund nach HPR-PROF-001.
*Ort:* `manifest` mit `/conformsTo`
*Meldung:* {feld}: Dokumentversion {version} ist neuer als der Prüfer ({erwartet}); Prüfung nach den Regeln von {erwartet}.
*Einstufung:* Information

#### HPR-VERS-002 · Fehler · Basis
Eine Erweiterung ist nicht oder falsch deklariert.

*Bezug:* HP-VERS-004
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jeder Eintrag in `extensions` MUSS `id` (absolute URI) und `required` (boolesch) haben; jede Datei unter `ext/<kennung>/` MUSS zu einem Eintrag gehören, dessen `dir` gleich `<kennung>` ist oder dessen `id` auf `/<kennung>` endet.
*Ort:* `manifest` mit `{feld}` oder `entry` mit `{pfad}`
*Meldung:* {pfad}: {grund} (Erweiterung braucht `id`, `required` und ein Verzeichnis `ext/<kennung>/`).

#### HPR-VERS-003 · Fehler · Basis
Ein fremder Name trägt nicht den Präfix `x-<kennung>-`.

*Bezug:* HP-VERS-005
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Attribute `data-*` MÜSSEN `data-hp-` oder `data-x-<kennung>-` tragen; Custom-Element-Namen `hp-` oder `x-<kennung>-`; CSS-Eigenschaften `--*` in Autoren-CSS `--hp-` (nur lesend, HPR-INH-005) oder `--x-<kennung>-`; Sperrregeln die Liste aus HP-LOCK-001 oder `x-<kennung>-`. Namen mit Präfix `hp-`/`data-hp-`/`--hp-`, die Teil 0 nicht definiert, sind ebenfalls Befunde (`hp` ist reserviert).
*Ort:* `xml` oder `css` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Name „{wert}“ ist weder in der Spezifikation definiert noch mit `x-<kennung>-` präfigiert.

#### HPR-VERS-004 · Hinweis · Basis
Eine Erweiterung ist als erforderlich gekennzeichnet.

*Bezug:* HP-VERS-006
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Jeder Eintrag in `extensions` mit `required: true` wird genannt; Lesesysteme ohne diese Erweiterung zeigen einen Hinweis, verweigern aber nicht.
*Ort:* `manifest` mit `{feld}`
*Meldung:* {feld}: Erweiterung „{uri}“ ist als erforderlich deklariert; Lesesysteme ohne sie zeigen das Dokument mit Hinweis.
*Einstufung:* Information

#### HPR-VERS-005 · Fehler · Basis
Eine Erweiterung bringt Skripte, externe Ressourcen oder Netzzugriffe ein.

*Bezug:* HP-VERS-007
*Geltung:* Fassung
*Mittel:* statisch
*Prüfung:* Dateien unter `ext/` werden mit HPR-CONT-020/021, HPR-INH-016/017 und HPR-SBX-004 bis -007 geprüft; zusätzlich ist jede Datei unter `ext/` mit Media-Type `text/javascript`, `application/javascript` oder `application/wasm` ein Befund, ebenso jede Datei, deren erste Bytes eine WebAssembly-Signatur (`\0asm`) tragen.
*Ort:* `entry` mit `{pfad}`
*Meldung:* Erweiterungsdatei {pfad}: {grund}; Erweiterungen heben keine Muss-Anforderung auf.

#### HPR-VERS-006 · Hinweis · Basis
Ein abgelegter Konformitätsbericht ist unvollständig oder meldet Fehler.

*Bezug:* HP-VERS-008
*Geltung:* Hauptfassung
*Mittel:* statisch
*Prüfung:* Wenn `data/conformance-report.json` vorhanden ist: Objekt nach Abschnitt 4.3 mit `spec`, `levels`, `checkedAt`, `tool`, `results`; enthält `results` Einträge der Klasse `ERROR` oder `FATAL`, oder weicht `spec` von `https://html-pro.example/spec/0.1` ab, wird das gemeldet; die Aussage „ist html-Pro 0.1“ gilt dann nicht aus diesem Bericht.
*Ort:* `entry` mit `data/conformance-report.json`
*Meldung:* `data/conformance-report.json`: {grund}.

### 5.12 Mindestprofil für Büroprogramme (MIN)

Die Regeln dieses Bereichs gelten nur, wenn `manifest.json#subset` den Wert
`https://html-pro.example/spec/0.1/subset/office-min` trägt.

#### HPR-MIN-001 · Fehler · Basis
Das Mindestprofil ist mit einem anderen Profil als `static` beansprucht.

*Bezug:* HP-MIN-001
*Geltung:* Hauptfassung
*Mittel:* statisch
*Prüfung:* Ist `subset` gesetzt, MUSS `conformsTo` auf `/profile/static` enden und `subset` MUSS genau den Wert `https://html-pro.example/spec/0.1/subset/office-min` haben.
*Ort:* `manifest` mit `/subset`
*Meldung:* {feld}: Mindestprofil beansprucht, aber {grund}.

#### HPR-MIN-002 · Fehler · Basis
Ein Inhaltsdokument verwendet Elemente oder Attribute außerhalb des Elementbestands.

*Bezug:* HP-MIN-002
*Geltung:* Hauptfassung
*Mittel:* statisch
*Prüfung:* In allen Inhaltsdokumenten außer dem Navigationsdokument jedes Element und Attribut (einschließlich der Werte von `role` und `epub:type`) gegen Tabelle 15.1 in Teil 0 prüfen; `id`, `class`, `lang`, `xml:lang`, `dir` und `data-hp-style` sind überall erlaubt.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `{element}`{attribut} liegt außerhalb des Mindestprofils.

#### HPR-MIN-003 · Fehler · Basis
Eine Fußnote hat keine Kennung.

*Bezug:* HP-MIN-004
*Geltung:* Hauptfassung
*Mittel:* statisch
*Prüfung:* Jedes `aside[@role="doc-footnote"]` und jedes `li` in `section[@role="doc-endnotes"]` MUSS `id` tragen (Überschriften, Tabellen, Abbildungen prüft HPR-ADR-001).
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Notentext ohne `id`.

#### HPR-MIN-004 · Fehler · Basis
Ein Listeneintrag beginnt mit einem Aufzählungszeichen oder einer Nummer aus der Quelle.

*Bezug:* HP-MIN-005
*Geltung:* Hauptfassung
*Mittel:* statisch
*Prüfung:* Der Text jedes `li` DARF NICHT mit `^\s*([•\-–*·]|\d+[.)]|[a-zA-Z][.)])\s` beginnen.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Listeneintrag beginnt mit „{wert}“; Zeichen und Nummern erzeugt die Liste.

#### HPR-MIN-005 · Fehler · Basis
Eine untergeordnete Liste steht nicht im `li` der übergeordneten Ebene.

*Bezug:* HP-MIN-005
*Geltung:* Hauptfassung
*Mittel:* statisch
*Prüfung:* Jedes `ul`/`ol`, dessen Elternelement `ul` oder `ol` ist, ist ein Befund; ein `ol`, das einer Liste mit `start` ≠ 1 folgt, MUSS `start` tragen (nicht maschinell entscheidbar, nur die erste Bedingung wird geprüft).
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `{element}` direkt in einer Liste; verschachtelte Listen gehören in ein `li`.

#### HPR-MIN-006 · Fehler · Basis
Die Spaltenzahl einer Tabelle ist nicht in allen Zeilen gleich.

*Bezug:* HP-MIN-006
*Geltung:* Hauptfassung
*Mittel:* statisch
*Prüfung:* Für jede `table` die Spaltenzahl jeder Zeile mit `colspan` und `rowspan` berechnen; alle MÜSSEN gleich sein.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Tabelle {kennung}: Zeile mit {wert} Spalten, erwartet {erwartet}.

#### HPR-MIN-007 · Fehler · Basis
Eine Kopfzeile hat keine `th scope="col"`.

*Bezug:* HP-MIN-006
*Geltung:* Hauptfassung
*Mittel:* statisch
*Prüfung:* Jede Zelle in `thead` MUSS `th` mit `scope="col"` sein.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Kopfzelle ist `{element}` ohne `scope="col"`.

#### HPR-MIN-008 · Fehler · Basis
Ein Bild steht nicht in `figure` oder hat ein Format außerhalb der Kernmedientypen.

*Bezug:* HP-MIN-007
*Geltung:* Hauptfassung
*Mittel:* statisch
*Prüfung:* Jedes `img` MUSS Kind eines `figure` sein; der Media-Type seiner Ressource MUSS `image/png`, `image/jpeg`, `image/gif`, `image/webp` oder `image/svg+xml` sein.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: `img` {grund}.

#### HPR-MIN-009 · Fehler · Basis
Fußnotenverweise und Notentexte passen nicht zusammen.

*Bezug:* HP-MIN-008
*Geltung:* Hauptfassung
*Mittel:* statisch
*Prüfung:* Jeder `a[@role="doc-noteref"]` MUSS `epub:type="noteref"` und `href="#<kennung>"` auf ein `aside[@role="doc-footnote"][@epub:type="footnote"]` oder ein `li` in `section[@role="doc-endnotes"][@epub:type="endnotes"]` im selben Dokument tragen; jeder Notentext MUSS genau einen Verweis haben.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: {grund} (Fußnote als Paar aus `doc-noteref` und `doc-footnote`).

#### HPR-MIN-010 · Fehler · Basis
Ein Verweistext nennt eine Seitenzahl der Quelle.

*Bezug:* HP-MIN-009
*Geltung:* Hauptfassung
*Mittel:* statisch
*Prüfung:* Der Text eines `a` DARF NICHT `^\s*(Seite|S\.|page|p\.)\s*\d+\s*$` entsprechen; interne Verweise MÜSSEN auflösen (HPR-ADR-006), externe MÜSSEN mit `http:` oder `https:` beginnen.
*Ort:* `xml` mit `{pfad}`, `{zeile}`
*Meldung:* {pfad}:{zeile}: Verweistext „{wert}“ nennt eine Seitenzahl; Adressen ersetzen Seiten.

---

## 6. Sicherheitsregeln für Sandbox und lebendige Inhalte

### 6.1 Gefahrenmodell

html-Pro-Dateien werden wie PDF-Dateien per Mail, Messenger und Behördeneingang weitergegeben und
von Fremden geöffnet. Die Angriffsfläche ist die eines HTML-Anhangs: laut der in [Q4] §2.4
zitierten Erhebung waren im Februar 2025 23 % der HTML-Mailanhänge bösartig, und EPUB-Lesesysteme
hatten reale Lücken bis zur Codeausführung (Thorium 2025, Leuven-Studie 2021, [Q4] §2.4). Daraus
die Gefahren, gegen die das Regelwerk gerichtet ist:

| Nr. | Gefahr | Abwehr im Dokument (HPR) | Abwehr im Lesesystem (HPL) |
|---|---|---|---|
| G1 | Beliebiger Code im Dokument (Inline-Skript, Ereignisattribute, Skript-URLs, SVG-Skript) | HPR-INH-016/017, HPR-SBX-004 bis -007 | HPL-SBX-002 (CSP ohne `unsafe-inline`/`unsafe-eval`) |
| G2 | Ausgetauschter oder nachgeladener Code (Komponente verändert, Modul nachgeladen) | HPR-SBX-001 bis -003, HPR-SBX-017 | HPL-SBX-006 (Hashprüfung vor Ausführung), HPL-SBX-002 (`script-src` nur Hashes) |
| G3 | Abfluss von Daten nach außen (Formularversand, `fetch`, Bilder von fremden Servern, Beacons, DNS-Prefetch) | HPR-CONT-020, HPR-SBX-011, HPR-SBX-016 | HPL-SBX-002 (`connect-src 'none'`, `form-action 'none'`), HPL-SBX-003 (Netzmitschnitt leer) |
| G4 | Ausbruch aus dem Dokumentrahmen (Top-Navigation, Popups, Dialoge, Downloads, gleiche Origin wie das Lesesystem) | – | HPL-SBX-001 (`sandbox` ohne `allow-same-origin` u. a.), HPL-SBX-004 |
| G5 | Zugriff auf die Hülle (Dateisystem, Prozesse, Schlüssel, Zwischenablage, Native-Brücken) | HPR-SBX-016 (Vorfilter) | HPL-SBX-005 |
| G6 | Verfolgung und Zustand außerhalb des Dokuments (Speicher-APIs, Cookies, Kanäle zwischen Dokumenten) | HPR-SBX-016 (Vorfilter) | HPL-SBX-007 (opake Origin, kein Speicher), HPL-SBX-008 (Datenkanal nur auf `data/`) |
| G7 | Fälschung des Dokuments durch Code (Komponente ändert fremden Text; Signiertes ≠ Gezeigtes) | HPR-SBX-009/010, HPR-SBX-015 | HPL-SBX-009 (DOM außerhalb unverändert), Abschnitt 7 (eingefrorene Fassung) |
| G8 | Erschöpfung (ZIP-Bombe, Endlosschleife, riesige Dateien, Entitätsexpansion) | HPR-CONT-027, HPR-CONT-026, HPR-INH-002 | HPL-CONT-002 (Härtung), HPL-SBX-010 (Laufzeitbegrenzung) |
| G9 | Lücken im Parser (XXE, Pfad-Traversal, Doppeleinträge, Type Confusion) | HPR-INH-002, HPR-CONT-012/013, HPR-CONT-022 | HPL-CONT-002 |
| G10 | Täuschung des Nutzers (unsichtbarer Inhalt, Ton, Bewegung, Fokusraub, Links mit fremdem Ziel) | HPR-NEST-001, HPR-INH-020/021, HPR-SBX-012, HPR-SBX-015 | HPL-RS-002 (Links nur nach Anzeige der URL), HPL-SBX-011 (reduzierte Bewegung) |

### 6.2 Grundsätze

1. **Kein freies JavaScript.** Code läuft nur als deklarierte, gehashte Komponente aus
   `components/` ([Q4] §2.4 Punkt 1). Alles andere ist ein Fehler der Stufe Lebendig; in den
   Profilen `static`, `signed`, `archive` ist jeder Code ein Fehler der Stufe Basis.
2. **Zwei Schranken, nicht eine.** Das Dokument wird statisch geprüft (Abschnitt 5.6), und das
   Lesesystem erzwingt die Grenzen zur Laufzeit (Abschnitt 9.3). Keine der beiden Schranken
   verlässt sich auf die andere: Ein Lesesystem MUSS auch ein Dokument sicher anzeigen, das alle
   Dokumentregeln verletzt, und ein Dokument MUSS auch dann regelkonform sein, wenn das Lesesystem
   es nicht erzwingen würde.
3. **Statisches Äquivalent als Rückfall.** Jede Durchsetzung endet darin, dass das statische
   Äquivalent gezeigt wird; nie darin, dass Inhalt verschwindet oder das Dokument nicht lesbar ist
   (Zusage 2 in [Q2]).
4. **Sicherheit im Format, nicht in der Oberfläche** ([Q2] §3 Punkt 4): Die Sandbox-Regeln sind
   Muss-Anforderungen der Spezifikation (HP-SBX-005 bis -011 in Teil 0), nicht Einstellungen eines
   Produkts. Ein Lesesystem, das sie lockert, ist nicht konform, unabhängig davon, ob ein Dokument
   das ausnutzt.

### 6.3 Nicht abgedeckt

- Lücken der Browser-Engine selbst treffen auch den Reader; der Anspruch „sicherer als PDF“ ist
  ohne externe Sicherheitsprüfung nicht belegbar ([Q4] §2.4).
- Ob ein `sandbox`-iframe unter bestimmten Hüllen (Linux, Android) den IPC der Hülle erreicht, ist
  zu messen ([Q5] §3.3); HPL-SBX-005 gilt unabhängig vom Ergebnis.
- Der statische Vorfilter HPR-SBX-016/017 erkennt verschleierten Code nicht; er ersetzt die
  Laufzeitgrenzen nicht.

---

## 7. Regeln für signierte und eingefrorene Fassungen

### 7.1 Zuordnung von Signaturen zu Fassungen

Der Prüfer und das Lesesystem MÜSSEN jede `ds:Signature` aus `META-INF/signatures.xml` (und aus
`META-INF/signatures*.xml`, sofern vorhanden, Kennzeichnung nach HPR-SIG-022) genau einer Fassung
zuordnen:

1. Referenzen (`ds:Reference/@URI` ohne `#`) sammeln, prozentdekodieren, `META-INF/container.xml`
   entfernen.
2. Beginnen alle verbleibenden Referenzen mit `renditions/<id>/` für dasselbe `<id>`, gehört die
   Signatur zur eingefrorenen Fassung `<id>`.
3. Sonst gehört sie zur Hauptfassung. Eine Signatur, die Dateien mehrerer Fassungen mischt oder
   Dateien der Hauptfassung und einer eingefrorenen Fassung zugleich referenziert, gehört zur
   Hauptfassung und ist zusätzlich ein Befund nach HPR-PROF-013, wenn sie `renditions/`-Dateien
   enthält.

Eine Fassung ist **signiert**, wenn ihr mindestens eine Signatur zugeordnet ist; sie ist **gültig
signiert**, wenn mindestens eine zugeordnete Signatur `TOTAL_PASSED` ergibt und alle Dateien der
Fassung nach HPR-SIG-005 abdeckt.

### 7.2 Operationen und ihre Wirkung auf Signaturen

Die Tabelle ist normativ für Bearbeiter: Eine Operation, die eine Signatur ungültig macht, MUSS
vor der Ausführung mit dieser Wirkung angekündigt werden; die Signatur wird nicht entfernt, sie
wird vom Lesesystem als `TOTAL_FAILED / HASH_FAILURE` gezeigt.

| Operation | Signatur der Hauptfassung | Signatur einer eingefrorenen Fassung | Grund |
|---|---|---|---|
| Hauptfassung bearbeiten (Inhalt, Daten, Manifest) | wird ungültig | bleibt gültig | HP-PROF-009; die Fassungssignatur referenziert keine Hauptfassungsdatei |
| Anmerkung unter `annotations/` anlegen oder ändern | bleibt gültig; Datei ist „nicht signiert“ | bleibt gültig | HP-SIG-013, HP-RS-011 |
| Gegenzeichnen (weitere Signatur anfügen) | bleibt gültig | bleibt gültig | HP-SIG-003, HP-SIG-020; nur `signatures.xml` und `manifest.xml` ändern sich |
| Eingefrorene Fassung anlegen | wird ungültig (`manifest.json#renditions` ändert sich) | bleibt gültig | Reihenfolge: erst einfrieren, dann die Hauptfassung signieren, wenn beides gewünscht ist |
| Eingefrorene Fassung signieren | bleibt gültig | – | nur `META-INF/signatures.xml`, `META-INF/manifest.xml` ändern sich |
| Datei einer eingefrorenen Fassung ändern | – | wird ungültig: Manipulation | HP-PROF-010; ein Bearbeiter DARF das NICHT anbieten |
| Eingefrorene Fassung entfernen | wird ungültig | entfällt mit der Fassung; die Signatur MUSS aus `signatures.xml` entfernt werden, sonst HPR-SIG-006 | eigene Festlegung |
| Redaktion in der Hauptfassung | wird ungültig | bleibt gültig, aber Abschnitt 7.4 | HP-LOCK-007 |
| Metadaten bereinigen (HP-META-007) | wird ungültig | bleibt gültig; Bereinigung endet an signierten Fassungen, der Bearbeiter nennt sie | eigene Festlegung |
| `mimetype` tauschen | bleibt gültig (nicht signiert) | bleibt gültig | [Q3] §5.2; Verstoß gegen HP-CONT-002, HPR-CONT-005 |
| Konformitätsbericht unter `data/` ablegen | wird ungültig (Ressource und Manifest ändern sich) | bleibt gültig | Abschnitt 3.5: Bericht vor dem Signieren ablegen |

### 7.3 Einfrieren einer Fassung

Ein Bearbeiter, der eine eingefrorene Fassung erzeugt, MUSS in dieser Reihenfolge vorgehen; jeder
Schritt nennt die Regel, die ihn prüft:

1. **Werte festschreiben.** Alle Formelzellen werden mit dem Rechner (Teil 3) berechnet; `data-hp-value`
   und Zellinhalt tragen das Ergebnis; Formulardaten aus `data/` werden in die statischen
   Äquivalente geschrieben (HPR-PROF-012, HPR-SBX-013).
2. **Komponenten ersetzen.** Jedes Komponenten-Element `<hp-x …>` wird durch ein `div` (bei
   Blockinhalt) oder `span` (bei Zeileninhalt) mit `data-hp-frozen="hp-x"` ersetzt, das den Lichtbaum
   des Elements (ohne `template`-Kinder) enthält; `id` und `data-hp-priority` werden übernommen; die
   Attribute der Komponente werden verworfen (HPR-PROF-011).
3. **Statische Äquivalente der Medien.** `video` und `audio` bleiben; sie haben nach HP-INH-013
   bereits `poster` und Beschreibung. Animationen werden belassen, wenn HPR-INH-021 erfüllt ist;
   `method: "render"` erlaubt stattdessen ein Standbild (offene Frage 1 in [Q2] §5).
4. **Kopieren.** Alle Dateien der Fassung (Inhalt, Stile, Medien, Schriften, `data/`,
   `attachments/`) werden unter `renditions/<id>/` abgelegt, Verweise werden auf diese Pfade
   umgeschrieben (HPR-PROF-010); `components/` wird nicht kopiert.
5. **Fassungsmanifest.** `renditions/<id>/manifest.json` mit Profil `static` (oder `signed`/`archive`,
   wenn anschließend signiert wird), eigenen `resources`-Hashes, `derivedFrom` (`integrity` des
   Hauptmanifests vor Schritt 6, `method`), `computedAt` und `calculator` bei Formeln, und einer
   Kopie von `access` (HPR-PROF-009, -012, -014).
6. **Hauptmanifest.** Eintrag in `manifest.json#renditions` mit `id`, `role: "frozen"`, `url`,
   `createdAt`; `package.opf` wird um die neuen Dateien ergänzt (HPR-CONT-008).
7. **Signieren** (optional, Stufe Signiert): Signatur mit Referenzen auf alle Dateien unter
   `renditions/<id>/` und auf `META-INF/container.xml` (HPR-PROF-013, HPR-SIG-005/007).

Die Kennung `<id>` SOLL Datum und Zweck tragen (`nachweis-2026-10-11`) und MUSS HP-ADR-002
erfüllen. Ein Dokument KANN mehrere eingefrorene Fassungen enthalten; jede ist unabhängig.

### 7.4 Redaktion und eingefrorene Fassungen

Redaktion heißt Löschen (HP-LOCK-007). Enthält eine signierte eingefrorene Fassung den zu
redigierenden Inhalt, MUSS der Bearbeiter die ganze Fassung entfernen (Signatur eingeschlossen,
Abschnitt 7.2) und den Vorgang im Redaktionsprotokoll mit `target` = `renditions/<id>/` vermerken;
er DARF NICHT die Fassung ändern und die gebrochene Signatur stehen lassen. Der Nutzer MUSS vorher
erfahren, dass ein signierter Nachweis entfällt.

### 7.5 Urteil der Signaturprüfung

Die Zuordnung der Indikationen nach EN 319 102-1 ([Q6]) zu Befunden und Anzeige:

| Hauptindikation | Unterindikation (Beispiele) | Befund | Urteil Stufe Signiert | Anzeige im Lesesystem |
|---|---|---|---|---|
| `TOTAL_PASSED` | – | keiner | `bestanden` (wenn sonst nichts dagegen steht) | „gültig signiert von … am …“ |
| `TOTAL_FAILED` | `HASH_FAILURE` | HPR-SIG-015 mit jeder nicht intakten Referenz | `nicht bestanden` | „verändert nach der Signatur: <Dateien>“ |
| `TOTAL_FAILED` | `SIG_CRYPTO_FAILURE`, `FORMAT_FAILURE` | HPR-SIG-015 | `nicht bestanden` | „Signatur ungültig“ |
| `TOTAL_FAILED` | `CRYPTO_CONSTRAINTS_FAILURE` | HPR-SIG-015 (und HPR-SIG-010) | `nicht bestanden` | „unzulässiger Algorithmus“ |
| `TOTAL_FAILED` | `NOT_YET_VALID`, `EXPIRED` (Signierzeit außerhalb Zertifikat) | HPR-SIG-015 (und HPR-SIG-009) | `nicht bestanden` | „Zertifikat zur Signierzeit nicht gültig“ |
| `INDETERMINATE` | `NO_CERTIFICATE_CHAIN_FOUND`, `NO_SIGNING_CERTIFICATE_FOUND` | HPR-SIG-016 | `unbestimmt` | „Signatur kryptografisch gültig, Vertrauen nicht geprüft“ |
| `INDETERMINATE` | `TRY_LATER`, `OUT_OF_BOUNDS_NO_POE`, `REVOKED_NO_POE` | HPR-SIG-016 | `unbestimmt` | „Sperrstatus nicht feststellbar“ |

Ein Dateiprüfer ohne Vertrauensanker kommt bei echten Zertifikaten regelmäßig zu `INDETERMINATE`;
das ist beabsichtigt. Er DARF NICHT eine Signatur als gültig ausweisen, deren Kette er nicht
prüfen konnte (HP-SIG-015), und KANN Vertrauensanker als Parameter annehmen (`--trust`).

### 7.6 Was ein Lesesystem bei Fassungen anzeigen muss

Für jedes Dokument mit mindestens einer Signatur zeigt das Lesesystem (HP-PROF-008, HP-SIG-012,
HP-SIG-013): je Fassung, ob und von wem sie signiert ist, mit Urteil; welche Fassung gerade
angezeigt wird; ausdrücklich, wenn die angezeigte Hauptfassung nicht signiert ist, obwohl eine
signierte eingefrorene Fassung existiert; die Liste der nicht signierten Dateien. Beim Öffnen eines
Dokuments mit signierter eingefrorener Fassung und unsignierter Hauptfassung SOLL das Lesesystem
den Wechsel zur eingefrorenen Fassung anbieten.

---

## 8. Dokumentdaten-Kanal (Protokoll zu HP-SBX-008)

### 8.1 Grundsätze

Komponenten laufen in einem Rahmen mit opaker Origin (HP-SBX-005) und haben keinen Zugriff auf
Dateien. Ihr einziger Weg zu Dokumentdaten ist `postMessage` ([Q12]) zum Lesesystem. Das Lesesystem ist
die Instanz, die Pfade, Größen und Schemas durchsetzt.

- Die Komponente sendet an `window.parent` mit `targetOrigin` `"*"` (bei opaker Origin gibt es
  keinen anderen Wert); das Lesesystem antwortet an `event.source`.
- Das Lesesystem MUSS Nachrichten nur von `event.source === dokumentRahmen.contentWindow`
  annehmen und alle anderen verwerfen.
- Jede Nachricht ist ein JSON-fähiges Objekt (nur Objekte, Listen, Strings, Zahlen, boolesche
  Werte, `null`); andere Werte (Funktionen, DOM-Knoten, Blobs) werden mit `bad-request` abgewiesen.
- Nachrichten mit unbekanntem `hp`-Wert erhalten die Antwort `unknown-message`; das Lesesystem DARF
  NICHT abstürzen oder den Rahmen schließen.

### 8.2 Nachrichten

| Richtung | Nachricht | Felder | Antwort |
|---|---|---|---|
| Lesesystem → Komponente | `ready` | `spec` (`"0.1"`), `readOnly` (boolesch), `reducedMotion` (boolesch), `data` (Liste der Pfade aus `manifest.json#data`) | – (einmal nach dem Laden) |
| Komponente → Lesesystem | `state.get` | `id` (String, von der Komponente vergeben), `path` | `state.result` |
| Komponente → Lesesystem | `state.set` | `id`, `path`, `value` | `state.result` |
| Komponente → Lesesystem | `state.subscribe` | `id`, `path` | `state.result`; danach `state.changed` bei jeder Änderung |
| Lesesystem → Komponente | `state.result` | `id`, `ok` (boolesch), `value` (bei `ok` und `get`), `error` (`{ code, message }` bei `!ok`) | – |
| Lesesystem → Komponente | `state.changed` | `path`, `value`, `origin` (`"component"` \| `"editor"` \| `"load"`) | – |

Alle Nachrichten tragen `hp` mit dem Nachrichtennamen als Wert. Beispiel:

```json
{ "hp": "state.set", "id": "k1", "path": "data/aufmass.json", "value": { "zeilen": [ { "pos": 1, "menge": 12.5 } ] } }
{ "hp": "state.result", "id": "k1", "ok": true }
```

### 8.3 Regeln für das Lesesystem

1. `path` MUSS `^data/[A-Za-z0-9_][A-Za-z0-9_.-]*\.json$` entsprechen und in
   `manifest.json#data` der angezeigten Fassung verzeichnet sein; sonst `path-not-declared`
   (Muster verletzt: `path-invalid`). Pfade außerhalb `data/` werden nie geschrieben.
2. Ist für den Pfad ein `schema` verzeichnet, MUSS `value` dagegen gültig sein; sonst
   `schema-invalid` mit der ersten Abweichung in `message`. Das Schema wird aus dem Container
   geladen; `$ref` nach außen wird nicht aufgelöst (Fehler `schema-invalid`).
3. Die Serialisierung von `value` DARF NICHT 1 MiB überschreiten; sonst `too-large`.
4. In einer eingefrorenen Fassung, in einer signierten Hauptfassung und bei `access`-Regel
   `read-only` auf dem Pfad antwortet `state.set` mit `read-only`; das Lesesystem bietet
   stattdessen das Bearbeiten der Hauptfassung an (Abschnitt 7.2).
5. Ein erfolgreiches `state.set` ist eine Dokumentänderung: Die Datei gilt als geändert, beim
   Speichern werden `integrity` in `resources`, `dateModified` und (falls geführt) `history`
   aktualisiert; der Nutzer sieht den Zustand „geändert“.
6. Nach jedem erfolgreichen `state.set` sendet das Lesesystem `state.changed` an alle
   Abonnenten des Pfads einschließlich des Absenders.
7. Das Lesesystem MUSS Nachrichten je Rahmen auf 100 je Sekunde begrenzen; darüber antwortet es
   mit `rate-limited` und verwirft die Nachricht.
8. Fehlercodes: `bad-request`, `unknown-message`, `path-invalid`, `path-not-declared`,
   `schema-invalid`, `too-large`, `read-only`, `rate-limited`. Andere Codes sind nicht zulässig;
   `message` ist eine deutsche Beschreibung für Protokolle.

### 8.4 Regeln für Komponenten

Eine Komponente MUSS nach `ready` mit `state.get` lesen, bevor sie schreibt; sie DARF NICHT
annehmen, dass `state.set` gelingt (bei `read-only` zeigt sie die Werte des statischen Äquivalents
und sperrt ihre Eingabefelder); sie MUSS auf `state.changed` reagieren, wenn sie abonniert hat; sie
DARF NICHT andere Nachrichten als die aus 8.2 senden. Eine Komponente, die den Kanal nicht nutzt,
ist zulässig (rein darstellende Komponente).

---

## 9. Regelkatalog: Lesesystemregeln

### 9.1 Aufbau einer Lesesystemregel

```
#### HPL-<BEREICH>-<NNN> · <Klasse> · <Stufe>
<Kurztitel>

*Bezug:* HP-… (Anforderung aus Teil 0 mit Subjekt L, B oder E)
*Testfall:* … (Testdokument oder Handlung, mit der die Regel geprüft wird)
*Erwartung:* … (beobachtbares Verhalten, das ein konformes System zeigt)
*Begründung:* … (Pflicht im Bereich SBX)
```

Die Klasse hat hier die Bedeutung für die Leser-, Bearbeiter- oder Erzeuger-Konformität des
geprüften Systems: `Fehler` bedeutet, das System ist auf dieser Stufe nicht konform. Testdokumente
sind Teil der öffentlichen Testsuite (Paket S3, P13); jede Regel nennt, was das Testdokument
enthalten muss. Fehlt ein Testdokument, ist die Regel `nicht geprüft`.

### 9.2 Container und Lesen (CONT, META, VERS)

#### HPL-CONT-001 · Fehler · Basis
Das Lesesystem prüft Hashes vor der Anzeige und nennt veränderte und nicht gelistete Dateien.

*Bezug:* HP-CONT-009
*Testfall:* Beispielcontainer, mit einem fremden ZIP-Werkzeug (a) eine Ressource ersetzt, (b) eine Datei `annotations/notiz.json` ergänzt; beide öffnen.
*Erwartung:* (a) sichtbare Kennzeichnung „verändert“ mit dem Pfad der Ressource vor oder mit der Anzeige; (b) die ergänzte Datei wird namentlich als nicht abgedeckt genannt. Kein stilles Anzeigen.

#### HPL-CONT-002 · Fehler · Basis
Das Lesesystem lehnt präparierte Archive ab.

*Bezug:* HP-CONT-011
*Testfall:* Vier Archive: (a) Eintrag `../x`, (b) zwei Einträge gleichen Namens, (c) falscher CRC-32, (d) deklarierte Größe kleiner als tatsächliche Ausgabe (Dekompressionsbombe); dazu (e) ein Eintrag mit absolutem Pfad und (f) ein Eintrag mit Backslash.
*Erwartung:* In allen Fällen Abbruch mit Fehlermeldung, keine Anzeige, kein Schreiben außerhalb des Zielverzeichnisses, Speicherverbrauch begrenzt durch die deklarierte Größe.

#### HPL-CONT-003 · Warnung · Basis
Das Lesesystem verarbeitet Dokumente bis zu den Mindestgrenzen und bricht darüber mit Nennung der Grenze ab.

*Bezug:* HP-CONT-012
*Testfall:* Container mit 10 000 kleinen Einträgen; Container mit 10 001 Einträgen.
*Erwartung:* Erster wird angezeigt; zweiter bricht ab, die Meldung nennt „Einträge“ und die Grenze.

#### HPL-CONT-004 · Fehler · Basis
Das Lesesystem erkennt das Format am Inhalt, nicht an der Endung.

*Bezug:* HP-CONT-013
*Testfall:* Dieselbe Datei als `a.hpro`, `a.epub`, `a.bin`.
*Erwartung:* Alle drei werden identisch angezeigt und geprüft.

#### HPL-CONT-005 · Fehler · Basis
Das Lesesystem stellt alle Kernmedientypen dar und zeigt für Video ohne Unterstützung das Standbild.

*Bezug:* HP-CONT-015
*Testfall:* Testdokument mit je einer Ressource jedes Kerntyps und einem Video in einem nicht unterstützten Format mit `poster` und Beschreibung.
*Erwartung:* Alle Kerntypen dargestellt bzw. abspielbar; das Video zeigt Standbild und Text.

#### HPL-META-001 · Fehler · Basis
Das Lesesystem verarbeitet das Manifest als einfaches JSON ohne Netzabruf.

*Bezug:* HP-META-003
*Testfall:* Dokument offline öffnen; Netzwerkmitschnitt des Lesesystems.
*Erwartung:* 0 Abrufe der `@context`-URLs; Metadaten korrekt angezeigt.

#### HPL-META-002 · Fehler · Basis
Das Lesesystem ignoriert unbekannte Manifestschlüssel.

*Bezug:* HP-META-008
*Testfall:* Manifest mit zusätzlichem Schlüssel `x-test-foo` und mit unbekanntem Schlüssel `foo`.
*Erwartung:* Beide Dokumente werden angezeigt; der Prüfer meldet `foo` (HPR-META-011), das Lesesystem meldet nichts.

#### HPL-VERS-001 · Fehler · Basis
Das Lesesystem öffnet Dokumente einer höheren Nebenversion.

*Bezug:* HP-VERS-002
*Testfall:* Dokument mit `conformsTo` `…/spec/0.9/…` und einem unbekannten Attribut `data-hp-zukunft`.
*Erwartung:* Anzeige ohne Fehler; Hinweis „neuere Version“ zulässig; das unbekannte Attribut wird ignoriert.

#### HPL-VERS-002 · Fehler · Basis
Das Lesesystem zeigt Dokumente mit unbekannter erforderlicher Erweiterung vollständig an.

*Bezug:* HP-VERS-006
*Testfall:* Dokument mit `extensions: [{ id: "https://example.org/ns/x", required: true }]` und Dateien unter `ext/x/`.
*Erwartung:* Inhalt sichtbar; Hinweis mit der Erweiterungs-`id`; keine Verweigerung.

### 9.3 Sandbox und lebendige Inhalte (SBX)

#### HPL-SBX-001 · Fehler · Lebendig
Der Dokumentrahmen ist ein `iframe` mit `sandbox`, das höchstens `allow-scripts` enthält.

*Bezug:* HP-SBX-005
*Testfall:* Lebendiges Testdokument öffnen; das `sandbox`-Attribut des Dokumentrahmens auslesen; eine Testkomponente ruft `window.top.location = …`, `window.open()`, `alert()`, `form.submit()`, `showModalDialog`-Äquivalente und einen Download (`a[download]`-Klick) auf.
*Erwartung:* `sandbox` vorhanden, Tokenmenge ⊆ {`allow-scripts`}; `allow-same-origin`, `allow-top-navigation`, `allow-top-navigation-by-user-activation`, `allow-popups`, `allow-popups-to-escape-sandbox`, `allow-modals`, `allow-forms`, `allow-downloads`, `allow-pointer-lock`, `allow-presentation`, `allow-orientation-lock` fehlen; alle Aufrufe schlagen fehl, das Lesesystem bleibt bedienbar.
*Begründung:* Ohne `allow-same-origin` hat der Rahmen eine opake Origin und kann weder auf das Lesesystem noch auf dessen Speicher zugreifen; mit beiden Werten könnte das Dokument die Sandbox selbst entfernen ([Q8]). Jedes weitere Token öffnet einen Ausbruchsweg (Navigation, Popups, Dialoge, Downloads, Formularversand).

#### HPL-SBX-002 · Fehler · Lebendig
Der Dokumentrahmen erhält eine Content Security Policy ohne Netz und mit Skripten nur per Hash.

*Bezug:* HP-SBX-006
*Testfall:* Die CSP des Dokumentrahmens auslesen (Antwortkopf oder `meta`); Testkomponente versucht Inline-Skript (`eval`, `new Function`, `setTimeout("…")`), `script`-Element mit fremder URL, `@import` und `@font-face` mit externer URL, `img` mit externer URL.
*Erwartung:* `default-src 'none'`; `connect-src 'none'`; `form-action 'none'`; `base-uri 'none'`; `script-src` enthält nur `'sha256-…'`-Hashes der deklarierten Komponenten (bzw. eine `nonce` je Ladevorgang) und weder `'unsafe-inline'` noch `'unsafe-eval'` noch `*`; `img-src`, `media-src`, `font-src`, `style-src`, `frame-src` enthalten nur die Containerquelle (`blob:`/`data:` der Auslieferung oder eine eigene Scheme-Origin); alle Versuche werden blockiert (CSP-Verstoßberichte oder Fehler in der Konsole).
*Begründung:* Die CSP ([Q7]) ist die zweite Schranke neben der Dokumentprüfung: Sie macht Inline-Code, nachgeladenen Code und Netzzugriffe zur Laufzeit unmöglich, auch wenn die Dokumentprüfung umgangen wurde (Gefahren G1 bis G3). `base-uri 'none'` verhindert, dass ein `base`-Element relative Verweise nach außen lenkt.

#### HPL-SBX-003 · Fehler · Lebendig
Aus dem Dokumentrahmen entsteht keine ausgehende Verbindung.

*Bezug:* HP-SBX-006
*Testfall:* Lebendiges Testdokument mit einer Komponente, die `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, `new Image().src`, `link rel=prefetch/preconnect/dns-prefetch`, `@import` und WebRTC (`RTCPeerConnection`) auf eine Testadresse versucht; Netzwerkmitschnitt des Lesesystems während 60 Sekunden.
*Erwartung:* 0 ausgehende Verbindungen zur Testadresse; keine DNS-Anfrage für deren Namen.
*Begründung:* „Nichts nach außen senden“ ist eine Zusage des Formats (Zusage 2 in [Q2]); nur ein Mitschnitt belegt sie, Konfiguration allein nicht. WebRTC und DNS-Prefetch umgehen `connect-src` in manchen Engines und werden deshalb eigens geprüft.

#### HPL-SBX-004 · Fehler · Lebendig
Das Lesesystem gewährt dem Dokumentrahmen keine Berechtigungen.

*Bezug:* HP-SBX-005
*Testfall:* Das `allow`-Attribut (Permissions Policy) des Dokumentrahmens auslesen; Testkomponente ruft `navigator.geolocation`, `navigator.mediaDevices.getUserMedia`, `navigator.clipboard.readText`, `Notification.requestPermission`, `navigator.usb`, `navigator.bluetooth`, `document.requestFullscreen` auf.
*Erwartung:* `allow` fehlt oder nennt ausschließlich `fullscreen 'none'`-artige Verbote; jeder Aufruf wird abgelehnt oder löst keine Berechtigungsabfrage beim Nutzer aus.
*Begründung:* Ein Dokument ist kein Webangebot; Kamera, Standort, Geräte und Zwischenablage gehören zum Lesesystem, nicht zum Dokument. Eine Berechtigungsabfrage aus einem Dokument wäre Täuschung (G10).

#### HPL-SBX-005 · Fehler · Lebendig
Der Dokumentrahmen erreicht keine Schnittstelle der Hülle.

*Bezug:* HP-SBX-009
*Testfall:* In jeder Hülle (Web, Desktop, Mobil): Testkomponente prüft `typeof` von `window.__TAURI__`, `window.__TAURI_INTERNALS__`, `window.ipc`, `window.electron`, `window.require`, `window.process`, `window.Capacitor`, `window.webkit.messageHandlers`, `window.chrome.webview` und ruft bekannte Befehle (`invoke("fs_read")`, `postMessage` an die Hülle) auf; Protokoll der Hülle.
*Erwartung:* Alle Objekte `undefined`; kein Befehl der Hülle wird ausgeführt; die Hülle protokolliert keine Anfrage aus dem Dokumentrahmen. Unter Hüllen, die Rahmen und Fenster nicht unterscheiden können ([Q5] §3.3), läuft der Dokumentrahmen in einer eigenen Webview ohne jede Capability.
*Begründung:* Die Brücke zur Hülle ist der Weg von „Skript im Dokument“ zu „Codeausführung auf dem Rechner“ (Thorium-Lücke 2025, [Q4] §2.4). Ohne Brücke bleibt ein Ausbruch auf den Rahmen beschränkt.

#### HPL-SBX-006 · Fehler · Lebendig
Das Lesesystem prüft den Hash jeder Komponente vor der Ausführung und zeigt bei Abweichung das statische Äquivalent.

*Bezug:* HP-SBX-010, HP-SBX-011
*Testfall:* (a) Skriptdatei einer Komponente im Container um ein Byte ändern; (b) `components`-Eintrag auf eine nicht existierende Datei zeigen lassen; (c) Komponente mit unbekanntem Namen `hp-unbekannt`; je öffnen.
*Erwartung:* In allen Fällen keine Ausführung; statisches Äquivalent sichtbar; Kennzeichnung „Komponente verändert“ bzw. „nicht ausgeführt“; keine Fehlermeldung, die den Inhalt verdeckt; das Dokument bleibt vollständig lesbar.
*Begründung:* Der Hash im Manifest ist die Zusage, welcher Code läuft; sie gilt nur, wenn das Lesesystem sie vor dem Ausführen prüft. Das statische Äquivalent als Rückfall hält Zusage 2 in [Q2] auch bei Manipulation ein.

#### HPL-SBX-007 · Fehler · Lebendig
Komponenten können nichts außerhalb des Dokuments speichern.

*Bezug:* HP-SBX-007
*Testfall:* Testkomponente schreibt in `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, `document.cookie`, `BroadcastChannel`, `SharedWorker`; Dokument schließen und neu öffnen; Speicherinspektion des Lesesystems.
*Erwartung:* Jeder Zugriff schlägt fehl (`SecurityError` bei opaker Origin) oder liefert nach dem Neuöffnen keinen Wert; die Speicherinspektion zeigt keine Einträge für den Dokumentrahmen; ein zweites, gleichzeitig geöffnetes Dokument empfängt keine Nachricht über `BroadcastChannel`.
*Begründung:* Zustand außerhalb des Dokuments wäre Verfolgung über Dokumente hinweg (G6) und widerspricht „eine Datei, kein Dienst“; alles, was eine Komponente behalten darf, steht in `data/` und reist mit der Datei.

#### HPL-SBX-008 · Fehler · Lebendig
Der Dokumentdaten-Kanal schreibt nur deklarierte Pfade unter `data/`, validiert und begrenzt.

*Bezug:* HP-SBX-008
*Testfall:* Testkomponente sendet nach Abschnitt 8: `state.set` auf `data/form.json` (deklariert, mit Schema) mit gültigem Wert; mit ungültigem Wert; auf `data/fremd.json` (nicht deklariert); auf `content/x.xhtml`; auf `../manifest.json`; mit einem 2-MiB-Wert; 1 000 Nachrichten in einer Sekunde; eine Nachricht mit unbekanntem `hp`; eine Nachricht aus einem zweiten, fremden Rahmen.
*Erwartung:* Erster Fall: `ok: true`, nach dem Speichern neuer Hash in `resources`, Dokument als geändert gekennzeichnet; dann der Reihe nach `schema-invalid`, `path-not-declared`, `path-invalid`, `path-invalid`, `too-large`, `rate-limited` ab der 101. Nachricht, `unknown-message`; die Nachricht aus dem fremden Rahmen bleibt unbeantwortet und wirkungslos.
*Begründung:* Der Kanal ist die einzige Schreibmöglichkeit des Dokuments; Pfadbegrenzung verhindert, dass Code Inhalt oder Manifest umschreibt (G7), das Schema begrenzt die Form der Daten, Größen- und Ratenbegrenzung verhindern Erschöpfung (G8).

#### HPL-SBX-009 · Fehler · Lebendig
Komponenten verändern keinen Inhalt außerhalb ihres Elements und rauben keinen Fokus.

*Bezug:* HP-SBX-017
*Testfall:* Testdokument mit einer absichtlich bösartigen Komponente, die `document.body` manipuliert, einen Absatztext ändert und `focus()` auf ein eigenes Eingabefeld ruft.
*Erwartung:* Das Lesesystem erkennt die Änderung außerhalb des Komponenten-Elements (DOM-Beobachtung) und zeigt das statische Äquivalent mit Kennzeichnung „Komponente beendet“; der Absatztext ist unverändert; der Fokus bleibt, wo der Nutzer ihn hatte. (Ein Lesesystem, das statt Beobachtung jede Komponente in einem eigenen Rahmen isoliert, erfüllt die Regel ebenfalls.)
*Begründung:* Code, der fremden Text ändert, kann ein Dokument fälschen, ohne dass Hash oder Signatur es erkennen (G7); Fokusraub ist Täuschung und Barriere (G10).

#### HPL-SBX-010 · Warnung · Lebendig
Das Lesesystem beendet Komponenten, die den Hauptthread blockieren.

*Bezug:* HP-SBX-015
*Testfall:* Komponente mit Endlosschleife laden.
*Erwartung:* Nach höchstens 10 Sekunden ist der Inhalt wieder bedienbar, die Komponente ist als beendet gekennzeichnet, das statische Äquivalent ist sichtbar.
*Begründung:* Eine blockierende Komponente macht das Dokument unlesbar; das Lesesystem muss den Rückfall auf das statische Äquivalent auch gegen den Code erzwingen (G8).

#### HPL-SBX-011 · Fehler · Lebendig
Das Lesesystem gibt die Systemeinstellung für reduzierte Bewegung an das Dokument weiter.

*Bezug:* HP-SBX-014
*Testfall:* Systemeinstellung „Bewegung reduzieren“ aktivieren; Testdokument mit CSS-Animation und einer bewegten Komponente öffnen; 10 Sekunden warten.
*Erwartung:* `matchMedia("(prefers-reduced-motion: reduce)").matches` ist im Dokumentrahmen `true`; `ready.reducedMotion` ist `true`; keine laufende Animation, kein Ton.
*Begründung:* Die Einstellung wirkt nur, wenn der Rahmen sie sieht; manche Hüllen reichen Systemeinstellungen nicht an eingebettete Rahmen weiter. Ohne Weitergabe bricht HP-INH-014 im Dokument, ohne dass das Dokument etwas falsch macht.

#### HPL-SBX-012 · Fehler · Basis
Komponenten laufen nur im Profil `interactive` und nie in eingefrorenen Fassungen.

*Bezug:* HP-PROF-002, HP-INH-012
*Testfall:* Dokument mit Profil `static`, das trotz Regelverstoß ein `script` und ein `components`-Verzeichnis enthält; Dokument mit eingefrorener Fassung, in deren Dateien ein `script` steht.
*Erwartung:* Kein Skript wird ausgeführt; das Dokument wird mit Kennzeichnung „nicht konform: Skript in Profil static“ angezeigt; die eingefrorene Fassung (HP-PROF-007) wird ohne Skript dargestellt.
*Begründung:* Das Profil ist die Zusage an den Empfänger, ob Code laufen kann; ein Lesesystem, das in `static` Code ausführt, macht die Zusage wertlos und das Signierte unsicher.

### 9.4 Adressen, Verschachtelung, Fassungen (ADR, NEST, PROF)

#### HPL-ADR-001 · Fehler · Basis
Das Lesesystem löst Adressen unabhängig von Breite, Schrift und Gerät auf und bietet beide Adressformen an.

*Bezug:* HP-ADR-003, HP-ADR-005
*Testfall:* Adresse eines Abschnitts in einem zugeklappten `details` in 320 px und 1280 px Breite und mit `--hp-font-size: 200%` öffnen; Adresse kopieren.
*Erwartung:* Das Element liegt im Sichtbereich, das `details` ist geöffnet; die Kopierfunktion liefert `pfad#kennung` und `<manifest.id>!/<pfad>#<kennung>`.

#### HPL-ADR-002 · Fehler · Basis
Der Bearbeiter hält Kennungen stabil.

*Bezug:* HP-ADR-004
*Testfall:* Dokument bearbeiten (Absatz ändern, Abschnitt einfügen, Abschnitt löschen) und speichern; Kennungen beider Fassungen vergleichen.
*Erwartung:* Alle gemeinsamen Abschnitte haben identische Kennungen; die gelöschte Kennung kommt nicht mehr vor; neue Abschnitte haben neue Kennungen.

#### HPL-NEST-001 · Fehler · Basis
Das Lesesystem öffnet Anhänge und eingebettete html-Pro-Dokumente offline.

*Bezug:* HP-NEST-003, HP-NEST-004
*Testfall:* Dokument mit einem PDF- und einem `.hpro`-Anhang, offline öffnen.
*Erwartung:* Beide Anhänge in der Anhangsliste; `.hpro` öffnet sich im Lesesystem; Signaturstatus des Anhangs wird getrennt vom umgebenden Dokument ausgewiesen.

#### HPL-NEST-002 · Warnung · Basis
Das Lesesystem klappt Blöcke der Priorität 3 ein, entfernt sie aber nicht.

*Bezug:* HP-NEST-002
*Testfall:* Dokument mit Blöcken der Priorität 3 in 320 px rendern; Textsuche; Ausdruck.
*Erwartung:* Blöcke eingeklappt, per Bedienelement öffenbar; Textsuche findet sie; der Ausdruck enthält sie.

#### HPL-PROF-001 · Fehler · Signiert
Das Lesesystem zeigt, welche Fassung signiert ist, und erkennt Manipulation der eingefrorenen Fassung.

*Bezug:* HP-PROF-008, HP-PROF-010
*Testfall:* Dokument mit unsignierter Hauptfassung und signierter eingefrorener Fassung öffnen; dann eine Datei unter `renditions/<id>/` mit einem fremden ZIP-Werkzeug ändern und erneut öffnen.
*Erwartung:* Anzeige nennt die signierte Fassung und dass die Hauptfassung nicht signiert ist; nach der Änderung `TOTAL_FAILED / HASH_FAILURE` mit der betroffenen Referenz; Wechsel zur eingefrorenen Fassung wird angeboten (Abschnitt 7.6).

#### HPL-PROF-002 · Warnung · Signiert
Das Lesesystem zeigt Hauptfassung und eingefrorene Fassung und vergleicht sie als Text.

*Bezug:* HP-PROF-012
*Testfall:* Hauptfassung gegenüber eingefrorener Fassung in einem Absatz ändern; Vergleich öffnen.
*Erwartung:* Der Absatz ist als Textänderung (eingefügt/entfernt) markiert, nicht als Bilddifferenz.

### 9.5 Sperren und Redaktion (LOCK)

#### HPL-LOCK-001 · Fehler · Basis
Der Bearbeiter beachtet `read-only`.

*Bezug:* HP-LOCK-002
*Testfall:* Gesperrten Absatz im Bearbeiter ändern und speichern.
*Erwartung:* Änderung abgelehnt, Hinweis auf die Sperre sichtbar, Datei unverändert (gleicher `integrity`-Wert).

#### HPL-LOCK-002 · Fehler · Basis
Das Lesesystem beachtet `no-print` und `no-export` und hinterlässt den Hinweis.

*Bezug:* HP-LOCK-003, HP-LOCK-004
*Testfall:* Dokument mit einem `no-print`- und einem `no-export`-Abschnitt drucken (PDF) und nach HTML exportieren; Textextraktion.
*Erwartung:* Der jeweilige Abschnittstext fehlt; an seiner Stelle „Abschnitt <kennung> nicht zum Druck freigegeben“ bzw. „… nicht zum Export freigegeben“; „Als EPUB weitergeben“ erzeugt dieselben Bytes und ist kein Export.

#### HPL-LOCK-003 · Fehler · Basis
Das Lesesystem blendet `hidden`-Abschnitte aus, kennzeichnet sie und zeigt sie auf Verlangen.

*Bezug:* HP-LOCK-005
*Testfall:* Dokument mit einem `hidden`-Abschnitt öffnen.
*Erwartung:* Abschnitt nicht im Fluss; Kennzeichnung „1 ausgeblendeter Abschnitt“; Einblenden möglich; die Textsuche nennt den Abschnitt als ausgeblendet.

#### HPL-LOCK-004 · Fehler · Basis
Der Bearbeiter redigiert durch Löschen mit Protokoll.

*Bezug:* HP-LOCK-007, HP-LOCK-008
*Testfall:* Eine Zeichenkette in Text, Bild-Alternativtext und `data/` redigieren; Container entpacken; Volltextsuche; eine signierte eingefrorene Fassung mit derselben Zeichenkette ist vorhanden.
*Erwartung:* 0 Treffer in allen Einträgen; `data/redaction-log.json` mit Adresse und Zeit; Platzhalter `data-hp-redacted` an jeder Stelle; die signierte eingefrorene Fassung wurde nach Abschnitt 7.4 entfernt und im Protokoll vermerkt, nach vorheriger Warnung.

#### HPL-LOCK-005 · Warnung · Signiert
Das Lesesystem bezeichnet Sperren nur im signierten Fall als nachweisbar.

*Bezug:* HP-LOCK-006
*Testfall:* Signiertes und unsigniertes Dokument mit Sperren öffnen.
*Erwartung:* „nachweisbar“ nur im signierten Fall; im unsignierten Fall „Sperre nicht signiert“.

### 9.6 Signaturen (SIG)

#### HPL-SIG-001 · Fehler · Signiert
Das Lesesystem prüft jede Signatur vor der Anzeige des Status und zeigt Haupt- und Unterindikation.

*Bezug:* HP-SIG-012
*Testfall:* Gültiges, manipuliertes und mit unbekanntem Zertifikat signiertes Dokument öffnen.
*Erwartung:* `TOTAL_PASSED`; `TOTAL_FAILED / HASH_FAILURE` mit betroffener Datei; `INDETERMINATE / NO_CERTIFICATE_CHAIN_FOUND` (oder `NO_SIGNING_CERTIFICATE_FOUND`); nie „signiert“ ohne Prüfung; das Urteil stimmt mit einem unabhängigen AdES-Validator überein.

#### HPL-SIG-002 · Fehler · Signiert
Das Lesesystem nennt unsignierte Dateien.

*Bezug:* HP-SIG-013
*Testfall:* Signiertes Dokument um `annotations/a.jsonld` ergänzen; öffnen.
*Erwartung:* Signatur `TOTAL_PASSED`; Liste „nicht signiert“ enthält `annotations/a.jsonld`.

#### HPL-SIG-003 · Fehler · Signiert
Das Lesesystem nennt eine Signatur nur nach Vertrauenslistenprüfung „qualifiziert“.

*Bezug:* HP-SIG-015
*Testfall:* Mit Testzertifikat signiertes Dokument offline öffnen.
*Erwartung:* Kryptografie geprüft; Status „Vertrauensstatus nicht geprüft“ oder „nicht qualifiziert“; nie „qualifiziert“.

#### HPL-SIG-004 · Fehler · Signiert
Das Lesesystem kennzeichnet fremde Signaturformate und akzeptiert `application/epub+zip`.

*Bezug:* HP-SIG-002, HP-SIG-014
*Testfall:* Container mit CAdES-Signatur (`.p7s`) und Container mit XAdES und `mimetype` `application/epub+zip` öffnen.
*Erwartung:* CAdES wird, falls geprüft, als „fremdes Signaturformat“ gekennzeichnet; der XAdES-Container erhält keine Warnung und keinen Fehler wegen `mimetype`.

#### HPL-SIG-005 · Fehler · Signiert
Der Erzeuger fügt Signaturen am Ende an und lässt alles andere unverändert.

*Bezug:* HP-SIG-003, HP-SIG-020
*Testfall:* Dokument mit einer Signatur gegenzeichnen; Einträge vorher/nachher vergleichen; beide Signaturen prüfen.
*Erwartung:* Alle Einträge außer `META-INF/signatures.xml` und `META-INF/manifest.xml` byteidentisch; die bisherige `ds:Signature` byteidentisch enthalten, die neue am Ende; `mimetype` bleibt erster Eintrag; 2 × `TOTAL_PASSED`.

#### HPL-SIG-006 · Warnung · Signiert
Das Lesesystem zeigt beim Signieren und Prüfen eine lineare Zusammenfassung.

*Bezug:* HP-SIG-017
*Testfall:* Signaturdialog für ein Dokument mit Formularwerten und Anhängen öffnen.
*Erwartung:* Zusammenfassung mit allen Texten in Lesereihenfolge, allen Formular- und Formelwerten und der Anhangsliste; ihr Text entspricht der Textextraktion der Fassung.

### 9.7 Druck (PRINT)

#### HPL-PRINT-001 · Fehler · Basis
Der Ausdruck entsteht aus der fließenden Ansicht mit A4, Rändern, Kopf- und Fußzeile und Kennungen.

*Bezug:* HP-PRINT-001, HP-PRINT-002, HP-PRINT-003, HP-PRINT-004
*Testfall:* Testdokument mit drei Überschriftenebenen nach PDF drucken; Seitenmaße und Textextraktion je Seite.
*Erwartung:* 210 × 297 mm (± 1 mm), Inhalt innerhalb von Rändern ≥ 15 mm; jede Seite trägt Titel und „Seite n von N“; Seite 1 trägt `id` und `dateModified`; zu jeder `h1`–`h3` steht `#<id>` auf derselben Seite.

#### HPL-PRINT-002 · Fehler · Basis
Der Ausdruck enthält ein Verzeichnis mit Seitenzahlen und Kennungen.

*Bezug:* HP-PRINT-005
*Testfall:* Dokument mit mindestens zwei gedruckten Seiten drucken.
*Erwartung:* Verzeichnis vorangestellt; jeder Eintrag mit Seitenzahl und `#<id>`; die Seitenzahl stimmt mit der Seite der Überschrift überein.

#### HPL-PRINT-003 · Fehler · Basis
Tabellen, Abbildungen, Codeblöcke und breite Inhalte werden korrekt umbrochen und nie abgeschnitten.

*Bezug:* HP-PRINT-006, HP-PRINT-007, HP-PRINT-008
*Testfall:* Dokument mit 200-zeiliger Tabelle, 12-spaltiger Tabelle, breitem Bild, `pre` mit 300-Zeichen-Zeile und Überschriften am Seitenende drucken; Bounding Boxes aller Objekte prüfen.
*Erwartung:* Kopfzeile auf jeder Tabellenseite; keine geteilte Zeile oder Abbildung; keine Überschrift als letzte Zeile; Umbruchmarke oder Fortsetzungseinzug im Codeblock; 0 Objekte außerhalb des Satzspiegels; Bilder mit Seitenverhältnis.

#### HPL-PRINT-004 · Fehler · Lebendig
Lebendige Inhalte erscheinen im Ausdruck als Standbild mit Verweis auf die lebendige Fassung.

*Bezug:* HP-PRINT-009
*Testfall:* Dokument mit Video und Komponente drucken; Textextraktion.
*Erwartung:* Bildunterschrift und „Lebendige Fassung: <pfad>#<kennung>“ je Element; Standbild vorhanden.

#### HPL-PRINT-005 · Fehler · Basis
Aufklappbare Abschnitte und Prioritätsblöcke werden gedruckt; `no-print` wird beachtet.

*Bezug:* HP-PRINT-010
*Testfall:* Dokument mit zugeklappten `details`, Blöcken der Priorität 3 und einem `no-print`-Abschnitt drucken.
*Erwartung:* Text aller `details` und Prioritätsblöcke im PDF; der `no-print`-Abschnitt fehlt mit Hinweis.

#### HPL-PRINT-006 · Warnung · Basis
Der PDF-Export erfüllt PDF/A und PDF/UA und zeigt das Prüfergebnis.

*Bezug:* HP-PRINT-012
*Testfall:* Export; Prüfung mit einem offenen PDF/A- und PDF/UA-Validator.
*Erwartung:* bestanden, oder der Prüfbericht mit Abweichungen wird dem Nutzer gezeigt.

### 9.8 Lesesysteme und Bearbeiter (RS)

#### HPL-RS-001 · Fehler · Basis
Das Lesesystem arbeitet vollständig offline, ohne Konto und ohne Dienst.

*Bezug:* HP-RS-001
*Testfall:* Netzwerk trennen; Dokument öffnen, durchsuchen, drucken; Netzwerkmitschnitt.
*Erwartung:* Alle Funktionen verfügbar; Mitschnitt leer.

#### HPL-RS-002 · Fehler · Basis
Externe Links öffnen außerhalb des Dokumentrahmens erst nach Anzeige der URL; Dienste werden vor der Übertragung genannt.

*Bezug:* HP-RS-009, HP-RS-008
*Testfall:* Externen Link aktivieren; eine Funktion mit Dienstanbindung (Export, Signatur) aufrufen.
*Erwartung:* Dialog mit vollständiger URL, Öffnen erst nach Bestätigung, Dokumentrahmen navigiert nicht; vor der Übertragung Hinweis mit Dienstname, Abbruch möglich.

#### HPL-RS-003 · Fehler · Basis
Das Lesesystem setzt die Nutzervariablen, sucht im Volltext und ist mit Tastatur bedienbar.

*Bezug:* HP-RS-002, HP-RS-003, HP-RS-004, HP-RS-010
*Testfall:* Schriftgröße 200 %, Zeilenhöhe 2, dunkles Schema einstellen; Wort suchen, das nur in einem zugeklappten `details` steht; Tastaturdurchlauf; Fenster auf 320, 768, 1280, 1920 px.
*Erwartung:* Berechnete Werte im Dokument folgen den Einstellungen; Treffer mit Adresse, Sprung öffnet das `details`; alle Funktionen per Tastatur erreichbar, Accessibility-Baum zeigt Überschriften, Verweise, Tabellen; kein waagrechtes Scrollen, keine Gesamtskalierung.

#### HPL-RS-004 · Fehler · Basis
Der Bearbeiter speichert Text als Text und erhält Struktur und Rückfallebene.

*Bezug:* HP-RS-005, HP-RS-006, HP-RS-012
*Testfall:* Dokument mit allen Strukturtypen öffnen, einen Absatz ändern, speichern; Container entpacken; EPUB-Validator.
*Erwartung:* Neuer Text steht im Inhaltsdokument an der Stelle des alten; keine neuen Elemente mit `position: absolute`; Zahl der Strukturelemente unverändert; Validator `0 fatals / 0 errors`.

#### HPL-RS-005 · Warnung · Basis
Der Bearbeiter vergleicht zwei Fassungen und bereinigt Metadaten.

*Bezug:* HP-RS-007, HP-META-007
*Testfall:* Zwei Fassungen mit je einer geänderten Überschrift, einem geänderten Absatz, einer geänderten Tabellenzelle und einem entfernten Bild vergleichen; „Metadaten bereinigen“ ausführen und entpacken.
*Erwartung:* Vier Befunde mit Adressen, keine Bilddifferenz; `author`, `history`, `source`, Anmerkungen und EXIF/XMP entfernt, Liste der entfernten Felder angezeigt.

---

## 10. Abdeckung der Anforderungen aus Teil 0

### 10.1 Regel der Abdeckung

Jede Anforderung aus Teil 0 steht genau einmal in der Tabelle 10.2 mit den Regeln, die sie prüfen.
Verbindlich (mechanisch geprüft, `coverage-gap`): **jede Muss-Anforderung mit Subjekt D hat
mindestens eine Dokumentregel**, und **jede Muss-Anforderung mit Subjekt L im Bereich SBX hat
mindestens eine Lesesystemregel**. Anforderungen an Lesesysteme, Bearbeiter und Erzeuger
außerhalb der Sandbox, die hier noch keine Lesesystemregel haben, werden in den Paketen geprüft,
die das jeweilige Werkzeug bauen (P4, P5, P15 bis P18); die Spalte „Lesesystemregeln“ ist dort
leer. Das ist eine Lücke dieses Teils, keine Lockerung von Teil 0: die Anforderung gilt
unverändert, nur der Testfall ist noch nicht formuliert.

### 10.2 Tabelle

Diese Tabelle wird von `scripts/check-konformitaet.mjs --table` erzeugt und mechanisch mit den
Regeln verglichen.

<!-- ABDECKUNGSTABELLE ANFANG -->
| Anforderung | Grad | Stufe | Subjekt | Dokumentregeln | Lesesystemregeln |
|---|---|---|---|---|---|
| HP-CONT-001 | Muss | Basis | D | HPR-CONT-001, HPR-CONT-002, HPR-CONT-003, HPR-CONT-027 | – |
| HP-CONT-002 | Muss | Basis | D | HPR-CONT-004, HPR-CONT-005 | – |
| HP-CONT-003 | Muss | Basis | D | HPR-CONT-006 | – |
| HP-CONT-004 | Muss | Basis | D | HPR-CONT-007, HPR-CONT-008, HPR-CONT-009, HPR-CONT-010 | – |
| HP-CONT-005 | Muss | Basis | D | HPR-CONT-004, HPR-CONT-011 | – |
| HP-CONT-006 | Muss | Basis | D | HPR-CONT-012, HPR-CONT-013 | – |
| HP-CONT-007 | Muss | Basis | D | HPR-CONT-014 | – |
| HP-CONT-008 | Muss | Basis | D | HPR-CONT-015, HPR-CONT-016, HPR-CONT-017, HPR-CONT-018, HPR-CONT-019 | – |
| HP-CONT-009 | Muss | Basis | L | – | HPL-CONT-001 |
| HP-CONT-010 | Muss | Basis | D | HPR-CONT-020, HPR-CONT-021 | – |
| HP-CONT-011 | Muss | Basis | L | HPR-CONT-027 | HPL-CONT-002 |
| HP-CONT-012 | Soll | Basis | L | HPR-CONT-026 | HPL-CONT-003 |
| HP-CONT-013 | Muss | Basis | D, L | HPR-CONT-004 | HPL-CONT-004 |
| HP-CONT-014 | Soll | Basis | E | HPR-CONT-025 | – |
| HP-CONT-015 | Muss | Basis | D, L | HPR-CONT-015, HPR-CONT-022 | HPL-CONT-005 |
| HP-CONT-016 | Muss | Basis | D | HPR-CONT-023 | – |
| HP-CONT-017 | Muss | Basis | D | HPR-CONT-024, HPR-CONT-028, HPR-INH-002, HPR-ADR-006 | – |
| HP-INH-001 | Muss | Basis | D | HPR-INH-001, HPR-INH-002 | – |
| HP-INH-002 | Muss | Basis | D | HPR-INH-003 | – |
| HP-INH-003 | Muss | Basis | D | HPR-INH-004 | – |
| HP-INH-004 | Muss | Basis | D | HPR-INH-005, HPR-INH-006 | – |
| HP-INH-005 | Soll | Basis | D | HPR-INH-007 | – |
| HP-INH-006 | Muss | Basis | D | HPR-INH-008, HPR-INH-009 | – |
| HP-INH-007 | Soll | Basis | D | HPR-INH-010 | – |
| HP-INH-008 | Soll | Basis | D | HPR-INH-011 | – |
| HP-INH-009 | Soll | Basis | D | HPR-INH-012, HPR-INH-013 | – |
| HP-INH-010 | Soll | Basis | D, L | HPR-INH-014 | – |
| HP-INH-011 | Muss | Basis | D | HPR-INH-015 | – |
| HP-INH-012 | Muss | Basis | D | HPR-INH-016, HPR-INH-017 | HPL-SBX-012 |
| HP-INH-013 | Muss | Basis | D | HPR-INH-018, HPR-INH-019, HPR-INH-020 | – |
| HP-INH-014 | Muss | Basis | D | HPR-INH-021, HPR-INH-022 | – |
| HP-INH-015 | Kann | Basis | D, L | HPR-INH-023 | – |
| HP-INH-016 | Soll | Basis | D | HPR-INH-024 | – |
| HP-ADR-001 | Muss | Basis | D | HPR-ADR-001 | – |
| HP-ADR-002 | Muss | Basis | D | HPR-ADR-002, HPR-ADR-003 | – |
| HP-ADR-003 | Muss | Basis | D, L | HPR-ADR-006 | HPL-ADR-001 |
| HP-ADR-004 | Muss | Basis | B | – | HPL-ADR-002 |
| HP-ADR-005 | Muss | Basis | L | – | HPL-ADR-001 |
| HP-ADR-006 | Kann | Basis | L | – | – |
| HP-ADR-007 | Muss | Basis | D | HPR-ADR-004, HPR-ADR-005 | – |
| HP-ADR-008 | Kann | Basis | D, L | HPR-ADR-007 | – |
| HP-NEST-001 | Muss | Basis | D | HPR-NEST-001 | – |
| HP-NEST-002 | Soll | Basis | D, L | HPR-NEST-002 | HPL-NEST-002 |
| HP-NEST-003 | Muss | Basis | D, L | HPR-NEST-003 | HPL-NEST-001 |
| HP-NEST-004 | Muss | Basis | D, L | HPR-NEST-004 | HPL-NEST-001 |
| HP-NEST-005 | Soll | Basis | D | HPR-NEST-005 | – |
| HP-PROF-001 | Muss | Basis | D | HPR-PROF-001 | – |
| HP-PROF-002 | Muss | Basis | D | HPR-PROF-002 | HPL-SBX-012 |
| HP-PROF-003 | Muss | Lebendig | D | HPR-PROF-003 | – |
| HP-PROF-004 | Muss | Signiert | D | HPR-PROF-004, HPR-SIG-005 | – |
| HP-PROF-005 | Muss | Archiv | D | HPR-PROF-005, HPR-PROF-006, HPR-PROF-007, HPR-PROF-008 | – |
| HP-PROF-006 | Kann | Basis | D | HPR-PROF-009 | – |
| HP-PROF-007 | Muss | Signiert | D | HPR-PROF-010, HPR-PROF-011, HPR-PROF-012 | – |
| HP-PROF-008 | Muss | Signiert | D, L | HPR-PROF-013 | HPL-PROF-001 |
| HP-PROF-009 | Muss | Signiert | D | HPR-PROF-013 | – |
| HP-PROF-010 | Muss | Signiert | L | HPR-SIG-015 | HPL-PROF-001 |
| HP-PROF-011 | Soll | Signiert | E | HPR-PROF-014, HPR-PROF-015 | – |
| HP-PROF-012 | Soll | Signiert | L | – | HPL-PROF-002 |
| HP-PROF-013 | Soll | Signiert | D | HPR-PROF-016 | – |
| HP-SBX-001 | Muss | Lebendig | D | HPR-SBX-001, HPR-SBX-002, HPR-SBX-003 | – |
| HP-SBX-002 | Muss | Lebendig | D | HPR-PROF-003, HPR-SBX-004, HPR-SBX-005, HPR-SBX-006, HPR-SBX-007, HPR-SBX-017 | – |
| HP-SBX-003 | Muss | Lebendig | D | HPR-SBX-008 | – |
| HP-SBX-004 | Muss | Lebendig | D | HPR-SBX-009, HPR-SBX-010 | – |
| HP-SBX-005 | Muss | Lebendig | L | – | HPL-SBX-001, HPL-SBX-004 |
| HP-SBX-006 | Muss | Lebendig | L | – | HPL-SBX-002, HPL-SBX-003 |
| HP-SBX-007 | Muss | Lebendig | D, L | HPR-SBX-016 | HPL-SBX-007 |
| HP-SBX-008 | Muss | Lebendig | D, L | HPR-SBX-018 | HPL-SBX-008 |
| HP-SBX-009 | Muss | Lebendig | L | – | HPL-SBX-005 |
| HP-SBX-010 | Muss | Lebendig | L | – | HPL-SBX-006 |
| HP-SBX-011 | Muss | Lebendig | L | – | HPL-SBX-006 |
| HP-SBX-012 | Kann | Lebendig | L | – | – |
| HP-SBX-013 | Muss | Lebendig | D | HPR-SBX-011 | – |
| HP-SBX-014 | Muss | Lebendig | D | HPR-SBX-012 | HPL-SBX-011 |
| HP-SBX-015 | Soll | Lebendig | L | – | HPL-SBX-010 |
| HP-SBX-016 | Muss | Basis | D | HPR-SBX-013, HPR-SBX-014 | – |
| HP-SBX-017 | Muss | Lebendig | D | HPR-SBX-015 | HPL-SBX-009 |
| HP-LOCK-001 | Muss | Basis | D | HPR-LOCK-001 | – |
| HP-LOCK-002 | Muss | Basis | B | – | HPL-LOCK-001 |
| HP-LOCK-003 | Muss | Basis | L | – | HPL-LOCK-002 |
| HP-LOCK-004 | Muss | Basis | L | – | HPL-LOCK-002 |
| HP-LOCK-005 | Muss | Basis | L | – | HPL-LOCK-003 |
| HP-LOCK-006 | Soll | Signiert | L | – | HPL-LOCK-005 |
| HP-LOCK-007 | Muss | Basis | B | HPR-LOCK-004, HPR-LOCK-005 | HPL-LOCK-004 |
| HP-LOCK-008 | Muss | Basis | B | HPR-LOCK-002, HPR-LOCK-003 | HPL-LOCK-004 |
| HP-LOCK-009 | Soll | Basis | L | – | – |
| HP-LOCK-010 | Kann | Basis | D | HPR-LOCK-006 | – |
| HP-SIG-001 | Muss | Signiert | D | HPR-SIG-001, HPR-SIG-002, HPR-SIG-022 | – |
| HP-SIG-002 | Muss | Signiert | E, L | HPR-SIG-003 | HPL-SIG-004 |
| HP-SIG-003 | Muss | Signiert | E | HPR-SIG-021 | HPL-SIG-005 |
| HP-SIG-004 | Muss | Signiert | D | HPR-SIG-004 | – |
| HP-SIG-005 | Muss | Signiert | D | HPR-SIG-005, HPR-SIG-006, HPR-SIG-007 | – |
| HP-SIG-006 | Muss | Signiert | D | HPR-SIG-008 | – |
| HP-SIG-007 | Muss | Signiert | D | HPR-SIG-009 | – |
| HP-SIG-008 | Muss | Signiert | D, L | HPR-SIG-010 | – |
| HP-SIG-009 | Muss | Signiert | D | HPR-SIG-011 | – |
| HP-SIG-010 | Soll | Signiert | D | HPR-SIG-012 | – |
| HP-SIG-011 | Muss | Archiv | D | HPR-PROF-008, HPR-SIG-013, HPR-SIG-014 | – |
| HP-SIG-012 | Muss | Signiert | L | HPR-SIG-015, HPR-SIG-016 | HPL-SIG-001 |
| HP-SIG-013 | Muss | Signiert | L | HPR-SIG-017 | HPL-SIG-002 |
| HP-SIG-014 | Muss | Signiert | P | – | HPL-SIG-004 |
| HP-SIG-015 | Muss | Signiert | L | – | HPL-SIG-003 |
| HP-SIG-016 | Kann | Signiert | D, L | HPR-SIG-019 | – |
| HP-SIG-017 | Soll | Signiert | L | – | HPL-SIG-006 |
| HP-SIG-018 | Kann | Signiert | D | HPR-SIG-020 | – |
| HP-SIG-019 | Muss | Signiert | D | HPR-SIG-018 | – |
| HP-SIG-020 | Muss | Signiert | E | – | HPL-SIG-005 |
| HP-PRINT-001 | Muss | Basis | D, L | HPR-PRINT-001 | HPL-PRINT-001 |
| HP-PRINT-002 | Muss | Basis | L | HPR-PRINT-002 | HPL-PRINT-001 |
| HP-PRINT-003 | Muss | Basis | L | – | HPL-PRINT-001 |
| HP-PRINT-004 | Muss | Basis | L | – | HPL-PRINT-001 |
| HP-PRINT-005 | Muss | Basis | L | – | HPL-PRINT-002 |
| HP-PRINT-006 | Muss | Basis | L | – | HPL-PRINT-003 |
| HP-PRINT-007 | Muss | Basis | L | – | HPL-PRINT-003 |
| HP-PRINT-008 | Muss | Basis | L | – | HPL-PRINT-003 |
| HP-PRINT-009 | Muss | Lebendig | L | – | HPL-PRINT-004 |
| HP-PRINT-010 | Muss | Basis | L | – | HPL-PRINT-005 |
| HP-PRINT-011 | Soll | Basis | L | – | – |
| HP-PRINT-012 | Soll | Basis | L | – | HPL-PRINT-006 |
| HP-PRINT-013 | Kann | Basis | D | HPR-PRINT-003 | – |
| HP-PRINT-014 | Kann | Basis | L | – | – |
| HP-META-001 | Muss | Basis | D | HPR-META-001, HPR-META-002, HPR-META-003, HPR-META-004, HPR-META-005 | – |
| HP-META-002 | Muss | Basis | D | HPR-META-006 | – |
| HP-META-003 | Muss | Basis | L | – | HPL-META-001 |
| HP-META-004 | Muss | Basis | D | HPR-META-007, HPR-META-008 | – |
| HP-META-005 | Soll | Basis | E | HPR-META-009 | – |
| HP-META-006 | Kann | Basis | D, B | HPR-META-010 | – |
| HP-META-007 | Soll | Basis | B | – | HPL-RS-005 |
| HP-META-008 | Muss | Basis | E, L | HPR-META-011 | HPL-META-002 |
| HP-VERS-001 | Muss | Basis | D | HPR-PROF-001 | – |
| HP-VERS-002 | Muss | Basis | L | HPR-VERS-001 | HPL-VERS-001 |
| HP-VERS-003 | Muss | Basis | P | – | – |
| HP-VERS-004 | Muss | Basis | D | HPR-VERS-002 | – |
| HP-VERS-005 | Muss | Basis | D | HPR-META-011, HPR-VERS-003 | – |
| HP-VERS-006 | Muss | Basis | L | HPR-VERS-004 | HPL-VERS-002 |
| HP-VERS-007 | Muss | Basis | D | HPR-VERS-005 | – |
| HP-VERS-008 | Kann | Basis | P | HPR-VERS-006 | – |
| HP-RS-001 | Muss | Basis | L | – | HPL-RS-001 |
| HP-RS-002 | Muss | Basis | L | – | HPL-RS-003 |
| HP-RS-003 | Muss | Basis | L | – | HPL-RS-003 |
| HP-RS-004 | Muss | Basis | L | – | HPL-RS-003 |
| HP-RS-005 | Muss | Basis | B | – | HPL-RS-004 |
| HP-RS-006 | Muss | Basis | B | – | HPL-RS-004 |
| HP-RS-007 | Soll | Basis | B | – | HPL-RS-005 |
| HP-RS-008 | Muss | Basis | L | – | HPL-RS-002 |
| HP-RS-009 | Muss | Basis | L | – | HPL-RS-002 |
| HP-RS-010 | Muss | Basis | L | – | HPL-RS-003 |
| HP-RS-011 | Soll | Basis | L | – | – |
| HP-RS-012 | Muss | Basis | L | – | HPL-RS-004 |
| HP-MIN-001 | Muss | Basis | D | HPR-MIN-001 | – |
| HP-MIN-002 | Muss | Basis | D, E | HPR-MIN-002 | – |
| HP-MIN-003 | Muss | Basis | E | – | – |
| HP-MIN-004 | Muss | Basis | E | HPR-MIN-003 | – |
| HP-MIN-005 | Muss | Basis | D, E | HPR-MIN-004, HPR-MIN-005 | – |
| HP-MIN-006 | Muss | Basis | D, E | HPR-MIN-006, HPR-MIN-007 | – |
| HP-MIN-007 | Muss | Basis | D, E | HPR-MIN-008 | – |
| HP-MIN-008 | Muss | Basis | D, E | HPR-MIN-009 | – |
| HP-MIN-009 | Muss | Basis | D, E | HPR-MIN-010 | – |
| HP-MIN-010 | Soll | Basis | L | – | – |
| HP-MIN-011 | Soll | Basis | L | – | – |
| HP-MIN-012 | Kann | Basis | E | – | – |
ABDECKUNGSTABELLE ENDE -->

---

## 11. Zusammenfassung

Die Zahlen werden von `scripts/check-konformitaet.mjs` berechnet und mit diesen Tabellen
verglichen (`summary-mismatch`).

### 11.1 Dokumentregeln je Stufe und Klasse

<!-- SUMMENTABELLE-HPR ANFANG -->
| Stufe | Fatal | Fehler | Warnung | Hinweis | Summe |
|---|---|---|---|---|---|
| Basis | 4 | 81 | 14 | 6 | 105 |
| Lebendig | 0 | 17 | 0 | 0 | 17 |
| Signiert | 0 | 21 | 4 | 3 | 28 |
| Archiv | 0 | 5 | 1 | 0 | 6 |
| **alle** | **4** | **124** | **19** | **9** | **156** |
SUMMENTABELLE-HPR ENDE -->

### 11.2 Lesesystemregeln je Stufe und Klasse

<!-- SUMMENTABELLE-HPL ANFANG -->
| Stufe | Fatal | Fehler | Warnung | Hinweis | Summe |
|---|---|---|---|---|---|
| Basis | 0 | 24 | 4 | 0 | 28 |
| Lebendig | 0 | 11 | 1 | 0 | 12 |
| Signiert | 0 | 6 | 3 | 0 | 9 |
| Archiv | 0 | 0 | 0 | 0 | 0 |
| **alle** | **0** | **41** | **8** | **0** | **49** |
SUMMENTABELLE-HPL ENDE -->

### 11.3 Prüfmittel der Dokumentregeln

<!-- MITTELTABELLE ANFANG -->
| Mittel | Regeln |
|---|---|
| statisch | 142 |
| rendering | 6 |
| extern | 3 |
| signatur | 4 |
| manuell | 1 |
MITTELTABELLE ENDE -->

Ein Prüfprogramm, das nur das Mittel `statisch` beherrscht, kann damit den größten Teil des
Dokumentkatalogs ausführen; die übrigen Regeln meldet es als `nicht geprüft`, das Urteil ist dann
`unbestimmt`, sobald eine Muss-Regel darunter ist (Abschnitt 3.4). Für eine Konformitätsaussage
der Stufe Basis sind deshalb auch die Regeln mit Mittel `rendering` und `extern` auszuführen.

---

## 12. Offene Punkte und nicht Geprüftes

1. **Lesesystemregeln außerhalb der Sandbox** sind nicht vollständig: Abschnitt 10.2 zeigt, welche
   L-, B- und E-Anforderungen noch keinen Testfall haben. Sie werden mit den Paketen P4, P5, P15
   bis P18 nachgezogen; die Kennungen der dann ergänzten Regeln schließen an die bestehenden an.
2. **Rendering-Regeln** (Mittel `rendering`) wurden in diesem Paket nicht ausgeführt, weil kein
   Lesesystem existiert (P4). Ihre Prüfung ist beschrieben, nicht belegt.
3. **Regel HPR-SBX-016/017** (statischer Vorfilter über Komponentenquelltext) ist absichtlich ein
   Vorfilter; Grenzen stehen in 6.3.
4. **Verbotsliste der Formelfunktionen** (HPR-SBX-014): Teil 3 ([`03-tabellen-und-formeln.md`](03-tabellen-und-formeln.md),
   Abschnitt 8.2, maschinenlesbar in `03-funktionen.json`) legt die unterstützten Funktionen fest;
   seitdem ist jede nicht unterstützte Funktion ein Befund. Die weiteren Dokumentregeln zu Teil 3
   (Syntax, Wertformen, Zirkel, Importbericht; Teil 3 Abschnitt 17.3) sind nachzutragen, sobald das
   Prüfprogramm (S3) einen Formelparser hat.
5. **Sandbox unter Linux und Android:** HPL-SBX-005 verlangt eine eigene Webview, wenn die Hülle
   Rahmen und Fenster nicht unterscheidet; die Messung steht aus ([Q5] §5, Frage 1).
6. **Beweiswert eingefrorener Fassungen ohne Referenzdarstellung** bleibt eine juristische Frage
   ([Q4] §5.2); dieser Teil regelt nur die technische Prüfung.
7. **Nicht geprüft in diesem Paket:** alle Regeln an realen Dokumenten außer den im Beleg
   gezeigten (Abschnitt 4.3, Beispielbericht): Der Dateiprüfer selbst ist Paket S3. Belegt sind
   die mechanische Prüfung dieses Dokuments, der Gleichstand des JSON-Katalogs, die Befunderzeugung
   nach Abschnitt 4 an Beispielcontainern des Kerns und den signierten Containern aus P3 (mit
   Gegenprobe des unabhängigen AdES-Validators und des EPUB-Validators) sowie der Selbsttest des
   Prüfskripts ([`docs/belege/S2/`](../belege/S2/README.md)).

---

## 13. Quellen

- [Q1] html-Pro, *Spezifikation Teil 0: Kern* – [`00-spezifikation.md`](00-spezifikation.md) (alle `HP-…`-Anforderungen und die dort zitierten Normen)
- [Q2] html-Pro, *10 – Anspruch und Funktionsprofil* (sieben Zusagen; verbindlich) – [`docs/10-anspruch-und-funktionsprofil.md`](../10-anspruch-und-funktionsprofil.md)
- [Q3] html-Pro, *05 – Prototyp-Ergebnisse* (Fälle V0–V11; mimetype nicht signiert, Manipulation nur vom Validator erkannt) – [`docs/05-prototyp-ergebnisse.md`](../05-prototyp-ergebnisse.md)
- [Q4] html-Pro, *03 – Konzept* (§2.4 Sicherheit: HTML-Anhänge, Reader-Lücken, gestaffelte Abwehr; §5.2 Beweiswert) – [`docs/03-konzept.md`](../03-konzept.md)
- [Q5] html-Pro, *06 – Plattform und Funktionsmatrix* (§3.3 Sandbox-Isolation je Plattform) – [`docs/06-plattform-und-funktionsmatrix.md`](../06-plattform-und-funktionsmatrix.md)
- [Q6] ETSI, *EN 319 102-1, Procedures for Creation and Validation of AdES Digital Signatures; Part 1* (Indikationen) – https://www.etsi.org/deliver/etsi_en/319100_319199/31910201/ (403 bei automatisiertem Abruf, wie in Teil 0 vermerkt)
- [Q7] W3C, *Content Security Policy Level 3* – https://www.w3.org/TR/CSP3/
- [Q8] MDN, *`<iframe>`: The Inline Frame element* (Warnung zu `allow-scripts` mit `allow-same-origin`; Sekundärquelle) – https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
- [Q9] *JSON Schema: A Media Type for Describing JSON Documents*, Entwurf 2020-12 – https://json-schema.org/draft/2020-12/json-schema-core
- [Q10] IETF, *RFC 6901, JavaScript Object Notation (JSON) Pointer* – https://www.rfc-editor.org/rfc/rfc6901
- [Q11] W3C, *EPUBCheck* (Vorbild für Meldungscodes und Schweregrade `fatal`/`error`/`warning`/`info`) – https://www.w3.org/publishing/epubcheck/
- [Q12] WHATWG, *HTML Living Standard* (`iframe sandbox`, `postMessage`, Custom Elements) – https://html.spec.whatwg.org/multipage/

