# @hpro/kern – Container-Kern

**Pakete:** P1 (Container), P2 (Signaturprüfung), P3 (Signieren) aus [`docs/08-arbeitsplan.md`](../docs/08-arbeitsplan.md) · **Stand:** 11.10.2026
**Belege:** [`docs/belege/P1/`](../docs/belege/P1/), [`docs/belege/P2/`](../docs/belege/P2/), [`docs/belege/P3/`](../docs/belege/P3/README.md)

Der Kern liest und schreibt hpro-Container in TypeScript. Er setzt die Regeln um, die der
Prototyp in Phase 2 belegt hat ([`docs/05`](../docs/05-prototyp-ergebnisse.md), Abschnitt 6.1, und
[`prototyp/build_container.py`](../prototyp/build_container.py)). Dazu kommen die
Adapter-Schnittstellen aus [`docs/06`](../docs/06-plattform-und-funktionsmatrix.md), Abschnitt 4.1,
als reine Typen.

## Bauen und testen

```sh
npm ci                      # im Repo-Wurzelverzeichnis
npm test                    # baut kern/ und führt alle Tests aus (node:test)
scripts/belege-p1.sh        # erzeugt die Belege unter docs/belege/P1/
scripts/belege-p2.sh        # Signaturprüfung gegen EU DSS 6.5, Belege unter docs/belege/P2/
scripts/belege-p3.sh        # Signieren im Kern, epubcheck + DSS, Belege unter docs/belege/P3/
```

Die epubcheck- und DSS-Tests brauchen JDK 21, epubcheck 5.4.0 und das kompilierte DSS-Werkzeug
unter `prototyp/` (`prototyp/setup-tools.sh`). Fehlen die Werkzeuge, werden diese Tests mit
Begründung als übersprungen gemeldet, nicht als bestanden.

Kommandozeile (nur Node):

```sh
npm run hpro -w kern -- sample beispiel.epub      # Beispieldokument schreiben
node kern/build/bin/hpro.js inspect datei.epub    # Struktur und Hash-Manifest prüfen (Exit 0/1/2)
node kern/build/bin/hpro.js compare a.epub b.epub # Einträge und Hashes zweier Container vergleichen
node kern/build/bin/hpro.js validate datei.epub --trust signer.pem [--policy hpro|dss-default|strict] [--json]
                                                  # Signaturen prüfen (Exit 0 nur bei allen TOTAL_PASSED)
node kern/build/bin/hpro.js keygen key.pem cert.pem [--alg rsa|ec] [--cn NAME]
                                                  # Testschlüssel + selbstsigniertes TESTzertifikat (WebCrypto)
node kern/build/bin/hpro.js sign ein.epub aus.epub --key key.pem --cert cert.pem [--chain ca.pem] [--time ISO] [--only pfad]...
                                                  # XAdES-BASELINE-B-Signatur ergänzen, ohne Java
```

## Lebendige Inhalte (P15, `live`)

`import { live } from '@hpro/kern'` – die Regeln für Komponenten gehören in den Kern, damit jedes
Lesesystem dieselben Entscheidungen trifft ([`docs/10`](../docs/10-anspruch-und-funktionsprofil.md), Abschnitt 3, Punkt 4):

| Funktion | Inhalt | Anforderung |
| --- | --- | --- |
| `planComponents(manifest, files, { frozen, enabled, stopped })` | je Komponente `run` (mit Skripttext und CSP-Hash) oder der Grund, warum nicht: `not-interactive`, `invalid`, `missing`, `modified`, `not-inlinable`, `disabled`, `stopped` | HP-SBX-001, -010, -011, HPL-SBX-012 |
| `frameCsp({ scriptHashes })` | CSP des Dokumentrahmens ohne Netzquelle, Skripte nur per Hash | HP-SBX-006 |
| `checkSandbox(wert)`, `SANDBOX_TOKENS` | `sandbox` nur mit `allow-scripts` | HP-SBX-005 |
| `DataChannel` | Dokumentdaten-Kanal nach Teil 1 Abschnitt 8 (Pfade, Schema, 1 MiB, Rate, schreibgeschützt, `state.changed`) | HP-SBX-008, HPL-SBX-008 |
| `saveDataChanges(bytes, änderungen, { modified })` | geänderte `data/`-Dateien mit neuem `integrity`, `dateModified`, Verlaufseintrag | Teil 1, 8.3 Regel 5 |

`createContainer` nimmt dazu `components` (Hash wird eingetragen) und `data` an und lehnt
Komponenten außerhalb des Profils `interactive` oder außerhalb von `components/<name>@<version>/`
ab. Tests: `kern/test/live.test.ts`; Belege: [`docs/belege/P15/`](../docs/belege/P15/README.md).

## Sperren, versiegelte Abschnitte, Redaktion, eingefrorene Fassung (P17, `lock`)

`import { lock } from '@hpro/kern'` – Zusage 5 aus [`docs/10`](../docs/10-anspruch-und-funktionsprofil.md).
Belege: [`docs/belege/P17/`](../docs/belege/P17/README.md); Antrag zur Spezifikation:
[`HPC-0007`](../docs/spezifikation/aenderungen/HPC-0007.md).

| Funktion | Inhalt | Anforderung |
| --- | --- | --- |
| `createContainer({ …, access })` | Sperren ins Manifest; Ziele müssen auflösen, nur `read-only`, `no-print`, `no-export`, `hidden`, `x-…` | HP-LOCK-001 |
| `parseAccess`, `checkTargets`, `rulesForDocument`, `rulesAt` | Regeln lesen und je Element auswerten | HP-LOCK-001 |
| `editText(bytes, { target, text, modified })` | Text eines Elements ersetzen; lehnt `read-only`, versiegelte Abschnitte und eingefrorene Fassungen ab (`LockError`) | HP-LOCK-002 |
| `outputView(xhtml, path, access, 'print' \| 'export')` | Druck-/Exportsicht: `no-print`/`no-export` (und `hidden` im Druck) durch den Hinweis ersetzt | HP-LOCK-003, -004, HPC-0007 |
| `sealSection(bytes, { target, recipients, modified })` | Abschnitt als JWE (RFC 7516, `A256GCM`; `PBES2-HS512+A256KW`, `RSA-OAEP-256`, `ECDH-ES+A256KW`) unter `data/sealed/`, Platzhalter mit `data-hp-sealed`, nur intern genutzte Medien eingebettet und entfernt, Navigation/Verweise umgeschrieben, Lecksuche über den geschriebenen Container | HPC-0007 |
| `openSealedSection`, `openEnvelope`, `unsealSection` | öffnen (prüft `hp-target`), dauerhaft entsiegeln | HPC-0007 |
| `redactContainer(bytes, { targets, terms, at, … })` | Löschen an Adressen und von Begriffen in allen Einträgen (Text, Attribute, JSON, Metadaten, Navigation; Binärdateien mit Treffer werden entfernt), betroffene eingefrorene Fassungen samt Signatur nur nach `removeSignedRenditions`, Protokoll `data/redaction-log.json`, Nachprüfung am geschriebenen Container | HP-LOCK-007, -008; Teil 1, 7.4 |
| `searchContainer(bytes, needles)` | Volltextsuche: jeder Eintrag entpackt (UTF-8, Markup ohne Tags, JSON), ZIP roh (UTF-8, UTF-16) | HPR-LOCK-005 |
| `freezeAndSign`, `checkFrozenVersion` | eingefrorene Fassung (`renditions/<id>/`, Kopie von `access`) und Signatur über genau ihre Dateien; Prüfung von Hashes, Signatur und Abdeckung | HP-PROF-006 … 010, HPR-PROF-013 |
| `lockEvidence(bytes, rendition)` | „nachweisbar“ nur, wenn eine `TOTAL_PASSED`-Signatur das Manifest mit den Regeln deckt | HP-LOCK-006 |

Kommandozeile: `node kern/build/bin/hpro.js lock status|seal|open|unseal|redact|search|freeze|frozen-check|edit|view …`
(Kennwörter und Begriffe nur aus Dateien, nie als Argument), `hpro keygen … --usage encryption`
für Empfängerzertifikate, `--not-before` für reproduzierbare Testzertifikate.

**Was technisch nicht schützbar ist:** `read-only`, `no-print`, `no-export` und `hidden` sind
Regeln für hpro-Programme; jedes ZIP-Werkzeug zeigt den Text. Ein versiegelter Abschnitt ist ohne
Schlüssel nicht lesbar, aber sichtbar bleiben seine Existenz, Kennung, ungefähre Länge und die
Empfänger; wer den Schlüssel hat, kann ihn abschreiben. Redaktion löscht aus dem Container, nicht
aus Kopien, die vorher weitergegeben wurden, und nicht aus Bildpixeln (keine Texterkennung).

## Bearbeiten, Verlauf und Vergleich (P5, `edit`)

`import { edit } from '@hpro/kern'` – Zusage 4 aus [`docs/10`](../docs/10-anspruch-und-funktionsprofil.md):
„Bearbeiten heißt ändern, nicht übermalen“. Belege: [`docs/belege/P5/`](../docs/belege/P5/README.md);
Antrag zur Spezifikation: [`HPC-0008`](../docs/spezifikation/aenderungen/HPC-0008.md).

| Funktion | Inhalt |
| --- | --- |
| `EditSession.open(bytes)` → `apply(op)` → `save({ at, note? })` | Sitzung auf der Hauptfassung: jede Operation ändert das XHTML der Inhaltsdokumente selbst, wird geprüft und bei Fehler zurückgerollt; `undo()` nimmt den letzten Schritt zurück; `save` schreibt Hashes, `dateModified`, `package.opf`, einen `history`-Eintrag (Notiz mit Adressen, ohne Inhalt) und das Journal |
| `editContainer(bytes, ops, options)` | dasselbe in einem Schritt |
| `outline(path)` / `blocks(path)` | Blockmodell mit Zeigern: Überschriften, Absätze, Listen und Listenpunkte, Tabellen mit Zellen in A1-Schreibweise, Abbildungen und Bilder, Fußnoten, Abschnitte |
| `listVersions(bytes)`, `checkoutVersion(bytes, n)`, `snapshotAt` | Fassungen aus dem Journal, mit Prüfung der Hashkette: `exact` (byte-gleich), `redacted` (nach Redaktion neu geschrieben), `mismatch` |
| `diffContainers(a, b)`, `diffVersions(bytes, from, to)`, `diffText`, `diffXhtml` | Vergleich zweier Fassungen auf Blockebene mit Wortunterschied; Bericht als Text oder XHTML (mit `del`/`ins`) |
| `recordVersion`, `continueJournal`, `installJournal` | Journal schreiben; `continueJournal` hängen auch Rechner (P19), Datenkanal (P15), `lock.editText`, Versiegeln/Entsiegeln und Einfrieren an |

**Zeiger** (Adresse nach HP-ADR-003 plus Kindschritte): `content/index.xhtml#befund`,
`#befund/p[2]`, `#massnahmen/li[3]/ul[1]/li[1]`, Tabellenzellen `#kosten.B7` (HP-ADR-008); ohne
Pfad gilt das erste Dokument von `readingOrder`.

**Operationen** (`EditOp`): `set-text` (`text` oder eingeschränktes Inline-XHTML `inline`),
`set-heading-level`, `change-type` (Absatz ↔ Überschrift), `insert` (`paragraph`, `heading`,
`section`, `list`, `list-item`, `table`, `figure` mit vorhandener Datei oder neuem Bild, `code`,
`quote`; Position `before`/`after`/`start`/`end`), `delete`, `move`, `set-list-type`, `indent`,
`outdent`, `insert-row`, `delete-row`, `insert-column`, `delete-column` (verbundene Zellen werden
angepasst), `insert-footnote`/`delete-footnote` (Paar aus Verweis und `aside`, Nummern in
Dokumentreihenfolge), `insert-xref` (Ziel muss existieren, Text aus Überschrift/Beschriftung),
`set-image` (Alternativtext, Datei), `set-title`.

**Was der Bearbeiter ablehnt** (`EditError` mit `code`): neue tote Verweise, Fußnoten ohne Paar,
Überschriftensprünge oder zweite `h1`, ungleiche Tabellenzeilen, doppelte/ungültige Kennungen,
Abschnitte ohne Eintrag im Inhaltsverzeichnis (`conflict`); Kennungen, die es gibt oder in einer
früheren Fassung gab (HP-ADR-004, `conflict`); `read-only` (`read-only`), versiegelte Abschnitte
(`sealed`), Schwärzungsplatzhalter und Adressen des Redaktionsprotokolls (`redacted`),
Rechentabellen (`calc`), Fließtext außerhalb der Inline-Liste, Ereignisattribute, `javascript:`
(`invalid`). Mängel, die das Dokument schon hatte, bleiben erlaubt.

**Journal** `data/history.json` (Format `hpro-history/0.1`): je `history`-Schritt ein Eintrag mit
Rückwärts-Deltas (Token-Patches für Textdateien, `absent`/`text`/`blob` für neue, entfernte und
binäre Dateien, Patch für `manifest.json`); entfernte Bilder liegen unter `data/history/blobs/`.
Redaktion und Versiegeln schreiben das Journal aus den bereinigten früheren Fassungen neu
(`lock/history.ts`); eingefrorene Fassungen übernehmen es nicht.

Kommandozeile: `node kern/build/bin/hpro.js edit blocks|apply|set-text …`,
`hpro history <datei>`, `hpro history checkout <datei> <n> <aus>`,
`hpro diff <alt> <neu> [--html f.xhtml] [--json f.json]`, `hpro diff <datei> --from N --to M`.

## Formulare (P6, `form`)

`import { form } from '@hpro/kern'` – Formulare mit Berechnung, Bedingung und Validierung,
ohne Skript im Dokument ([docs/07, Abschnitt 3d](../docs/07-foren-und-nutzererwartungen.md)).
Belege: [`docs/belege/P6/`](../docs/belege/P6/README.md); Antrag zur Spezifikation:
[`HPC-0009`](../docs/spezifikation/aenderungen/HPC-0009.md).

| Funktion | Inhalt |
| --- | --- |
| `new FormDocument(dom)` | liest `form[data-hp-form]` aus jedem W3C-DOM: Felder (`input`, `select`, `textarea`, `output` mit `name`), Bedingungen (`data-hp-when`), Prüfregeln (`data-hp-check`); rechnet sofort |
| `setEntry(form, name, eingabe)` | Eingabe wie getippt (`1.234,50`, `420.000`, `12.10.2026`, `ja`), danach Neuberechnung: berechnete Felder (OpenFormula mit Feldnamen als benannten Ausdrücken, auch `[tabelle.A1]`), Bedingungen, Prüfregeln |
| `validate(form, schema?)` | alles, was das Absenden verhindert: Typfehler, `required`, `pattern` (Flag `v`), `minlength`/`maxlength`, `min`/`max`, E-Mail, Auswahl, Fehlerwerte, Prüfregeln, JSON-Schema |
| `data(form, status)` / `draftData(form, schema)` / `write()` | Datenobjekt `{ form, document, status, submittedAt?, values }`; Entwurf mit `null` für ungültige Werte; Werte ins Markup (bedingte Abschnitte bleiben sichtbar, HP-NEST-001) |
| `inspectForms(bytes)` | Bericht je Formular samt Abgleich Formular ↔ Schema ↔ `manifest.json#data` |
| `fillForms(bytes, { set, submit?, time })` | ausfüllen und speichern; mit `submit` nur, wenn alles gültig ist, sonst `FormRejected` mit den Problemen, nichts geschrieben |
| `exportFormData(bytes, form?)` | Datenexport (JSON), gegen das Schema geprüft; ungültig → `FormRejected` |
| `freezeForms(dom)` | statische Form für eingefrorene Fassung und Druck: Felder als Text, nicht geltende Abschnitte als Hinweis; `calc.freezeContainer` ruft sie auf |

Kommandozeile: `hpro form show|check <datei>`, `hpro form fill|submit <ein> <aus> --time ISO
[--set feld=wert]… [--values-file f.json] [--export daten.json]`, `hpro form export <datei> <aus.json>`.

## Anmerkungen (P7, `annotate`)

`import { annotate } from '@hpro/kern'` – Kommentare, Hervorhebungen, Freihand, Threads mit Status,
Export, Import und Vergleich. Belege: [`docs/belege/P7/`](../docs/belege/P7/README.md); Antrag zur
Spezifikation: [HPC-0010](../docs/spezifikation/aenderungen/HPC-0010.md).

| Funktion | Zweck |
|---|---|
| `createAnnotation({ kind, address, quote?, text?, color?, ink?, author, created })` | W3C Web Annotation: Kommentar (`commenting`), Hervorhebung (`highlighting`, `styleClass` `hp-<farbe>`) oder Freihand (`SvgSelector`, 0–1000 relativ zum Element); Ziel `pfad#kennung`, Textstelle mit `TextQuoteSelector` und `TextPositionSelector` |
| `createReply({ to, text?, status?, … })` | Antwort (`replying`); mit `status` `resolved`/`open` erledigt bzw. öffnet sie den Thread wieder |
| `DocumentIndex`, `quoteOfText`, `quoteFor`, `resolveAnchor` | Textmodell (normalisierter Text des Elements), Zitat aus Text oder Position, Wiederfinden nach einer Bearbeitung: verankert, verschoben, verwaist |
| `readAnnotations(bytes)` | alle Dateien unter `annotations/`: Threads mit Status (späteste Statusangabe gilt), Verankerung, Schutz (signiert, verzeichnet, nicht signiert), Probleme |
| `saveAnnotations(bytes, { add, replace, remove }, { modified })` | ohne Signatur über `manifest.json`: verzeichnet (Hash, `package.opf`, `history`, Journal fortgeführt); mit Signatur: nur die Datei, signierte Dateien nie ändern oder löschen |
| `toCollection` / `serializeCollection` / `fromCollection`, `toCsv`, `toXhtml` | Export als `AnnotationCollection` (Elemente unverändert), CSV (RFC 4180, BOM), Bericht (XHTML, Text nie als Markup) |
| `mergeAnnotations(bytes, incoming, { modified })` | Import: neu übernommen, gleich gezählt, Konflikte gemeldet (Fassung des Dokuments bleibt), Antworten ohne Thread nicht übernommen |
| `reviewReport(older, newer)` / `reviewText` | Vergleich zweier Dateien oder Fassungen: Text- und Strukturänderungen, Änderungen der Anmerkungen, Threads an geänderten oder verschwundenen Stellen |

Kommandozeile: `hpro annotate list|check <datei>`, `hpro annotate add|reply|resolve|reopen|edit|delete
<ein> <aus> …`, `hpro annotate export <datei> <aus.jsonld|.csv|.xhtml>`, `hpro annotate import <ein>
<von.jsonld|von.hpro> <aus> --time ISO`, `hpro annotate compare <älter> <neuer>` bzw.
`hpro annotate compare <datei> --from N --to M`.

## Containeraufbau

```
mimetype                 erste Datei, Offset 0, unkomprimiert, ohne Extra-Feld, "application/epub+zip"
META-INF/container.xml   OCF, verweist auf package.opf
package.opf              generiertes EPUB-3-Package (Metadaten, alle Dateien, Spine = readingOrder)
manifest.json            hpro-Manifest mit SHA-256 je Ressource (maßgeblich)
content/…, data/…        Ressourcen, sortiert nach Pfad
```

| Regel | Umsetzung | Herkunft |
|---|---|---|
| mimetype | Inhalt exakt `application/epub+zip`, Methode 0, kein Extra-Feld, erste Datei | docs/05 §6.1; EPUB 3.3 OCF |
| ZIP-Schreiber | eigener Schreiber ([`src/zip.ts`](src/zip.ts)); Deflate über `CompressionStream('deflate-raw')` | docs/05 §6.1 („DSS setzt den EPUB-mimetype nicht“) |
| Reproduzierbarkeit | alle Einträge mit Zeitstempel `modified` des Dokuments, Unix-Attribute `0644`, feste Reihenfolge, Manifest mit fester Schlüsselreihenfolge | wie `build_container.py` |
| Hash-Manifest | `integrity: "sha256-<base64>"` je Ressource (SRI-Form) | docs/03 §1.3; Prototyp |
| Barrierefreiheit | `accessModeSufficient` in `manifest.json` als Liste von Listen (schema.org ItemList, Teil 1 HPR-META-008), in `package.opf` kommagetrennt; das generierte Navigationsdokument trägt Kennungen an `nav` und Überschrift (HP-ADR-001) | S7 |
| Abdeckung | **jede** Datei außer `mimetype`, `manifest.json` und `META-INF/…` | Prototyp; Signaturen kommen nach dem Manifest |
| Rücklesen | `createContainer` liest das Ergebnis wie einen fremden Container zurück, prüft alle Hashes und vergleicht jeden Eintrag mit der Eingabe; bei Abweichung wird geworfen | Abnahmekriterium 3 |
| Dateinamen | Zeichenregeln aus EPUB 3.3 §4.2.2 (Teilmenge), Eindeutigkeit ohne Groß-/Kleinschreibung nach NFC, UTF-8-Flag bei Nicht-ASCII | EPUB 3.3 |

### Lesen

`readContainer` wirft `ContainerError` bei Strukturfehlern (ZIP, mimetype, `container.xml`,
`manifest.json`). Hash-Abweichungen werfen **nicht**, sondern stehen in `integrity`. So kann ein
Reader ein manipuliertes Dokument noch anzeigen, aber mit deutlicher Warnung:

| `integrity` | Bedeutung |
|---|---|
| `resources[].status = 'hash-mismatch'` | Datei geändert |
| `resources[].status = 'missing'` | Datei fehlt |
| `unlisted` | Datei ohne Hash, z. B. nachträglich ergänzte `annotations/` (docs/05, V9); `ok` bleibt `true`, die Oberfläche muss sie benennen |
| `ok` | alle gelisteten Ressourcen vorhanden und unverändert |

Härtung beim Lesen: Pfad-Traversal, absolute Pfade und Backslashes, doppelte Namen, überlappende
Einträge, Verschlüsselung, ZIP64 und Mehrdatenträger-Archive werden abgelehnt. Beim Entpacken wird
abgebrochen, sobald mehr Bytes entstehen als angegeben (ZIP-Bomben-Schutz); Grenzen für Anzahl,
Einzel- und Gesamtgröße sind einstellbar (`ZipReadOptions`). CRC-32 wird für jeden Eintrag geprüft.

### Schreiben: Prüfung der Eingabe

- XHTML und SVG werden streng als XML geparst (`@xmldom/xmldom`); HTML-Entitäten wie `&nbsp;`
  sind wie in EPUB unzulässig.
- **Profile** (docs/03 §1.4): `static` und `signed` erlauben kein `<script>`; `interactive` erlaubt
  nur `<script src>` aus `components/`. Event-Handler-Attribute (`on…`) und `javascript:`-URLs sind
  in keinem Profil erlaubt, Skripte in SVG-Dateien ebenfalls.
- **Keine externen Ressourcen:** `img`, `link`, `script`, `source`, `audio`, `video`, `track`,
  `iframe`, `embed`, `object`, SVG `image`/`use` dürfen nur auf Dateien im Container zeigen, und
  diese müssen existieren. Hyperlinks (`<a href>`) nach außen sind erlaubt.
- OPF-Eigenschaften `scripted`, `svg`, `mathml` und `nav` werden aus dem Inhalt abgeleitet.

## Signaturprüfung (P2)

`validateContainer(bytes, options)` und der Adapter `TsValidator` prüfen ASiC-E-Container mit
XAdES (hpro-Format) und CAdES (fremde Container) ohne Java, nur mit WebCrypto. Die Urteile
folgen ETSI EN 319 102-1 und sind gegen EU DSS 6.5 abgeglichen: 39 von 39 Fällen, 47 von 47
Signaturen gleich ([`docs/belege/P2/`](../docs/belege/P2/README.md)).

| Modul | Inhalt |
|---|---|
| [`src/validate.ts`](src/validate.ts) | Container lesen (gehärteter ZIP-Leser), Signaturdateien finden (`META-INF/*signatures*.xml`, `*signature*.p7s`), Container-Regeln der DSS-Standardrichtlinie, Richtlinien `hpro` (Vorgabe), `dss-default`, `strict`, unsignierte Dateien |
| [`src/xades.ts`](src/xades.ts) | `ds:Signature` in ASiC-, OCF- oder ODF-Wurzel; Referenzen auf Dateien und auf die eigenen `SignedProperties` (Schutz gegen umgelenkte Referenzen und doppelte Ids); Signaturwert; `SigningCertificateV2` |
| [`src/cades.ts`](src/cades.ts) | CMS SignedData (abgesetzt) über `ASiCManifest*.xml` |
| [`src/c14n.ts`](src/c14n.ts) | exklusive C14N 1.0 und inklusive C14N 1.0/1.1 über einen DOM-Teilbaum |
| [`src/x509.ts`](src/x509.ts), [`src/der.ts`](src/der.ts) | X.509 lesen, Signaturen mit RSA PKCS#1 v1.5 und ECDSA (P-256/384/521) prüfen |
| [`src/sigcommon.ts`](src/sigcommon.ts) | Zertifikatspfad zu den übergebenen Ankern, Reihenfolge der Bausteine (FC, ISC, CV, XCV) und Urteil |

Indikationen wie bei DSS: `TOTAL_PASSED`; `TOTAL_FAILED` mit `HASH_FAILURE`, `SIG_CRYPTO_FAILURE`,
`FORMAT_FAILURE`; `INDETERMINATE` mit `SIGNED_DATA_NOT_FOUND`, `NO_SIGNING_CERTIFICATE_FOUND`,
`NO_CERTIFICATE_CHAIN_FOUND`, `CERTIFICATE_CHAIN_GENERAL_FAILURE`, `OUT_OF_BOUNDS_NO_POE`.
Vertrauen entsteht nur aus übergebenen Ankern; EU-Vertrauenslisten, CRL/OCSP und Zeitstempel
prüft der Kern nicht (Niveau B). Ein Container ohne `META-INF/manifest.xml` ist für DSS und den
Kern ein Formatfehler (Befund M10, wichtig für P3).

## Signieren (P3)

`signContainer(bytes, { signer, key?, signingTime?, signatureId? })` ergänzt eine
**XAdES-BASELINE-B**-Signatur und schreibt den Container mit dem eigenen ZIP-Schreiber. Der
private Schlüssel bleibt im `Signer`-Adapter; der Kern baut die XAdES-Struktur, kanonisiert
`SignedInfo` und lässt nur den Signaturwert erzeugen. Kein Java, kein OpenSSL im Pfad.
Gegenprobe: epubcheck 5.4.0 0 Fehler, EU DSS 6.5 `TOTAL_PASSED`, nach Manipulation eigene
Prüfung und DSS `HASH_FAILURE` ([`docs/belege/P3/`](../docs/belege/P3/README.md)).

| Regel | Umsetzung | Herkunft |
|---|---|---|
| Signaturdatei | `META-INF/signatures.xml` mit OCF-Wurzel; neue Signatur als letztes Kind, vorhandene Signaturen bleiben Byte für Byte erhalten; ASiC-Wurzel unter diesem Namen wird abgelehnt | docs/05 V4/V5/V11; EPUB 3.3 |
| Signierte Objekte | jede Datei außerhalb `META-INF/` **plus** `META-INF/container.xml` | docs/03 N.2; docs/05 V10 |
| Kanonisierung | exklusive C14N für `SignedInfo` und `SignedProperties` | docs/05 §6.1 |
| Algorithmen | RSA PKCS#1 v1.5 mit SHA-256, ECDSA P-256/SHA-256, ECDSA P-384/SHA-384; Referenzen SHA-256 | WebCrypto; DSS-Standardrichtlinie |
| Signierte Eigenschaften | `SigningTime`, `SigningCertificateV2` (Digest + `IssuerSerialV2`), `DataObjectFormat` je Referenz mit **echtem** Media-Type (aus `manifest.json`) | EN 319 132-1 Baseline B; docs/05 §5.2 (DSS schreibt `application/octet-stream`) |
| `META-INF/manifest.xml` | ODF-Manifest wird geschrieben bzw. ersetzt (Wurzeleintrag `application/epub+zip`) | DSS-Standardrichtlinie verlangt es (P2, Befund M10) |
| ZIP | Reihenfolge und Kompression der vorhandenen Einträge bleiben, `mimetype` bleibt erste Datei, unkomprimiert, ohne Extra-Feld | docs/05 §6.1 |
| Teilsignatur | `paths` (CLI `--only`) signiert nur die gewählten Dateien plus `container.xml`; nicht signierte Dateien dürfen sich ändern und werden als unsigniert gemeldet (docs/10, Zusage 5: eingefrorene Fassung signiert, lebendige bearbeitbar). Welche Dateien zu welcher Fassung gehören und wie `manifest.json` damit umgeht, legt das Format noch nicht fest | docs/10 §2; docs/05 V9 |
| Vorbedingungen | kein Signieren, wenn `manifest.json` nicht stimmt oder die Signierzeit außerhalb der Zertifikatsgültigkeit liegt | eigene Festlegung |
| Rücklesen | Ergebnis wird mit `validateContainer` geprüft (Anker: Zertifikat des Unterzeichners): neue Signatur `TOTAL_PASSED`, ältere Signaturen mit unverändertem Urteil, sonst wirft `signContainer` | wie `createContainer` (P1) |

| Modul | Inhalt |
|---|---|
| [`src/sign.ts`](src/sign.ts) | `signContainer`, XAdES-Aufbau, ODF-Manifest, Anhängen an vorhandene `signatures.xml` |
| [`src/softkey.ts`](src/softkey.ts) | `SoftwareKeySigner` (WebCrypto, PKCS#8, nicht exportierbar importiert, prüft Schlüssel gegen Zertifikat), `createTestIdentity` (Schlüsselpaar + selbstsigniertes Testzertifikat), PEM |
| [`src/der-write.ts`](src/der-write.ts) | DER-Schreiber für `IssuerSerialV2` und das Testzertifikat |

`Signer.signDigest` bekommt zusätzlich zum Digest die kanonisierten Bytes (`data`): WebCrypto
hasht selbst und kann keinen vorberechneten Digest signieren. Der `SoftwareKeySigner` prüft,
dass `digest` der Hash von `data` ist; ein Fernsignatur-Adapter (CSC) nutzt nur `digest`.

## Adapter-Schnittstellen (nur Typen)

Nach docs/06 §4.1, in [`src/adapters/`](src/adapters/):

| Schnittstelle | Zweck | Entwurfsentscheidung |
|---|---|---|
| `Storage` | öffnen, speichern, App-Bibliothek | `writableInPlace` bildet Ausnahme A4 ab |
| `Signer` | Signaturwert mit einem Plattformschlüssel | bewusst auf `signDigest` beschränkt: XAdES-Aufbau und `signatures.xml` macht der Kern (docs/05 §6.1); ECDSA-Werte in XML-DSig-Form `r‖s`; umgesetzt: `SoftwareKeySigner` (P3) |
| `Validator` | Signaturen prüfen | Indikationen nach ETSI EN 319 102-1 wie bei DSS; `policy: 'hpro' \| 'dss-default' \| 'strict'` (docs/05, V3); `unsignedPaths` (V9) |
| `Scanner` | Papierseiten als Bild | `null` bei Abbruch |
| `Ocr` | Texterkennung je Seitenbild | Konfidenz 0…1, Zeilen und Wörter mit Rahmen |
| `PdfImport` | PDF → Dokument | Ergebnis ist direkt `DocumentInput` für `createContainer` |
| `PdfExport` | Dokument → PDF | Konformität nur mit Prüfergebnis (`checks`), weil WeasyPrint keine Gültigkeit garantiert |

Gemeinsam: `info.location` (`device`, `local-sidecar`, `remote-service`), damit die Oberfläche
zeigen kann, wenn Daten das Gerät verlassen (docs/06 §1.1, Regel 2), und `availability()` mit
Verweis auf die Ausnahmen A1–A13.

## Konformitätsprüfer (S3)

`checkConformance(bytes, catalog, options)` prüft eine Datei gegen die Dokumentregeln (`HPR-…`)
aus Teil 1 der Spezifikation ([`01-regelkatalog.json`](../docs/spezifikation/01-regelkatalog.json))
und liefert den Bericht nach Teil 1, Abschnitt 4.3 (Regel, Klasse, Stufe, Ort, Meldung aus der
Vorlage des Katalogs, Urteil je Stufe nach 3.4). Regeln, für die ein Mittel fehlt (Browser-Engine,
EPUB-Validator, Liste redigierter Begriffe), stehen als „nicht geprüft“ mit Grund im Bericht und
machen die Stufe `unbestimmt`, nie `bestanden`.

```sh
npm run hpro-check <datei>                                  # Textausgabe (Teil 1, 4.4)
npm run hpro-check -- <datei> --format json                 # JSON-Bericht auf stdout (4.3)
npm run hpro-check -- <datei> --json bericht.json           # Text auf stdout, JSON in Datei
npm run hpro-check -- <datei> --trust anker.pem --time 2026-10-11T09:00:00Z
```

Weitere Optionen: `--level <Stufe>`, `--strict`, `--redacted <text>`, `--no-epubcheck`,
`--epubcheck <jar>`, `--java <bin>`, `--catalog <pfad>`, `--no-not-checked`. Rückgabe nach 4.5:
0 bestanden, 1 nicht bestanden, 2 Prüfer konnte nicht laufen (auch: Bericht verletzt das
Berichtsschema), 3 unbestimmt. Ohne `--no-epubcheck` ruft die Kommandozeile epubcheck 5.4.0 auf
einer Kopie mit Endung `.epub` auf und übernimmt dessen Meldungen als HPR-CONT-024/028.

Aufbau unter `src/check/`: `zipscan` (toleranter ZIP-Leser, jeder Mangel mit Eintrag),
`markup`/`css`/`selector`/`jslex`/`jsonschema` (Leser für XHTML, CSS, Selektoren, JavaScript-Vorfilter,
JSON Schema), `rules-container`, `rules-manifest`, `rules-content`, `rules-live`,
`rules-signature` (Regeln nach Bereichen), `report` (Befunde, Urteil, Text, Rückgabecode),
`checker` (Ablauf, Fassungen). Die Testsuite mit 180 Gut- und Schlechtfällen liegt unter
[`testsuite/`](../testsuite/) und wird von [`scripts/s3-testsuite.mjs`](../scripts/s3-testsuite.mjs)
erzeugt; `npm test` prüft jeden Fall. Belege: [`docs/belege/S3/`](../docs/belege/S3/README.md).

## Grenzen (Stand P1)

- **Plattform:** Der Bibliothekscode nutzt nur Web-Standard-APIs (`crypto.subtle`,
  `CompressionStream`, `TextEncoder`) und wird ohne Node-Typen übersetzt. **Ausgeführt** wurde er
  nur unter Node 26.5.1; im Browser und unter Node 22/24 **nicht geprüft**.
- **Byte-Gleichheit** gilt innerhalb derselben Deflate-Implementierung (gemessen: zwei Node-Prozesse,
  identische SHA-256). Zwischen Browser-Engines kann die komprimierte Form abweichen; Einträge und
  Hashes bleiben gleich. **Nicht geprüft.**
- Kein ZIP64: höchstens 65 535 Einträge und 4 GiB.
- CSS wird nicht ausgewertet: `url(…)` in Stylesheets wird nicht auf externe Ziele oder Existenz
  geprüft.
- `readContainer` duldet `META-INF/signatures.xml`, wertet sie aber nicht aus; dafür gibt es
  `validateContainer` (P2). Signieren: `signContainer` (P3).
- Signieren: nur Niveau B (kein Zeitstempel, P10), kein PKCS#12-Import (WebCrypto kann es nicht
  lesen; PKCS#8 + PEM nötig), kein RSA-PSS; Grenzen in
  [`docs/belege/P3/README.md`](../docs/belege/P3/README.md#nicht-geprüft).
- Signaturprüfung: Grenzen und nicht Geprüftes in [`docs/belege/P2/README.md`](../docs/belege/P2/README.md#nicht-geprüft).
