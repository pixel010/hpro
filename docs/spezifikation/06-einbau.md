# hpro 0.1 – Einbau in fremde Software (Teil 6: Kommandozeile, Bibliothek, Office-Export, Fachanwendungen)

**Status:** Arbeitsentwurf 0.1 · **Stand:** 14.10.2026 · **Paket:** S8 aus [`docs/08-arbeitsplan.md`](../08-arbeitsplan.md)
**Charakter:** informativ. Normativ sind allein die Teile 0 bis 3; dieser Teil beschreibt die
Werkzeuge der Referenzimplementierung, mit denen fremde Software den Standard erzeugt, prüft,
signiert und nach PDF ausgibt. Bei einem Widerspruch gilt die Spezifikation.
**Zielgruppe:** Hersteller von Textverarbeitungen, Tabellenkalkulationen, Content-Management-Systemen
und Fachanwendungen, die hpro einbauen wollen, ohne eine eigene Umsetzung zu schreiben. Wer das
Dateiformat selbst umsetzt, liest [Teil 4, das Umsetzer-Handbuch](04-umsetzer-handbuch.md); wer
Dokumente in einer Textverarbeitung schreibt, [Teil 5, den Autorenleitfaden](05-autorenleitfaden.md).
**Geprüft:** jeder Ausgabeblock dieses Teils steht wörtlich in [`docs/belege/S8/`](../belege/S8/README.md),
jeder Dateiauszug in der genannten Datei, jeder Export der Bibliothek und jeder Rückgabecode der
Kommandozeile ist hier genannt – mechanisch geprüft durch [`scripts/check-einbau.mjs`](../../scripts/check-einbau.mjs)
(`npm run einbau:check`, läuft in `npm test`).

---

## 1. Vier Wege in den Standard (informativ)

Kein Hersteller soll das Format neu umsetzen müssen. Die Referenzimplementierung `@hpro/kern`
bietet vier Wege, von „ein Programmaufruf“ bis „eigene Anwendung baut Dokumente“:

| Weg | Für wen | Was man braucht | Kapitel |
| --- | --- | --- | --- |
| **Kommandozeile** `hpro` | jede Sprache und jedes System, das Programme aufrufen kann (Java, .NET, Python, PHP, Shell, Server) | Node.js ≥ 22 und das Paket `@hpro/kern` | 3 |
| **Bibliothek** `@hpro/kern` | Anwendungen in JavaScript/TypeScript: Node, Browser, Tauri-, Electron- oder Capacitor-Hüllen | dasselbe Paket, `import … from '@hpro/kern'` | 4 |
| **Office-Export** | Nutzer von LibreOffice, Word, Google Docs, Calc und Excel | LibreOffice-Erweiterung „Als hpro exportieren“ oder Speichern als ODT/DOCX/ODS/XLSX und `hpro create` | 5 |
| **Fachanwendung** | Programme, die aus Daten Berichte, Bescheide, Prüfprotokolle erzeugen | Bibliothek oder Kommandozeile; Muster und lauffähiges Beispiel | 6 |

Alle vier Wege enden im selben Container (Teil 0, Abschnitt 3) und werden mit demselben
Konformitätsprüfer (Teil 1) geprüft; keiner braucht einen Server, ein Konto oder Netz
([docs/10](../10-anspruch-und-funktionsprofil.md), Abschnitt 3, Punkt 2). Netz brauchen nur die
Zusätze, die es von Natur aus brauchen: Zeitstempel (RFC 3161), Fernsignatur (CSC) und das Laden von
Sperrlisten.

## 2. Installation und Version

Das Paket heißt `@hpro/kern` und enthält Bibliothek, Kommandozeile und den Auszug der Spezifikation,
den der Prüfer braucht (Regelkatalog aus Teil 1, Berichtsschema aus Teil 1, Abschnitt 4.3,
Funktionsliste aus Teil 3):

| Ordner im Paket | Inhalt |
| --- | --- |
| `dist/` | Bibliothek (ES-Module mit Typdeklarationen `.d.ts`), nur Web-Standard-APIs |
| `cli/` | Kommandozeile `hpro` und `hpro-check` (Node) |
| `spec/` | `01-regelkatalog.json`, `03-funktionen.json`, `schema/konformitaetsbericht.schema.json`, als `@hpro/kern/spec/…` importierbar |

**Installieren.** Eine Veröffentlichung in der npm-Registry ist eine Entscheidung des Herausgebers
(Teil 2, HPG-LIC-003: das Lizenzfeld `Apache-2.0` wird mit P14 gesetzt) und ist nicht erfolgt. Bis
dahin wird aus dem Paketarchiv installiert, das `npm pack` im Ordner `kern/` baut (der Schritt
`prepack` baut `dist/`, `cli/` und `spec/` über [`kern/scripts/prepare-package.mjs`](../../kern/scripts/prepare-package.mjs)):

```sh
cd kern && npm pack                       # → hpro-kern-0.1.0.tgz
cd /pfad/zum/projekt && npm install /pfad/zu/hpro-kern-0.1.0.tgz
npx hpro version
```

Im Beleg wird das Paket in ein fremdes Projekt mit eigener `package.json` installiert; einzige
Abhängigkeit ist `@xmldom/xmldom`:

```text beleg:05-paket.txt
$ npm ls --all
fremdes-projekt@1.0.0 /opt/data/html-pro/einbau/.tmp/projekt
└─┬ @hpro/kern@0.1.0
  └── @xmldom/xmldom@0.9.12
…
$ npx hpro version
hpro 0.1.0 (@hpro/kern) · Kommandozeile Schnittstelle 1 · Spezifikation hpro 0.1 · Regelkatalog 0.1 · Node 26.5.1
[Exit-Code 0]
```

**Versionen.** Drei Nummern, alle in der Bibliothek als Konstanten und in `hpro version --json`:

| Konstante | Wert | Bedeutung |
| --- | --- | --- |
| `KERN_VERSION` | `0.1.0` | Version des Pakets (semantische Versionierung; vor 1.0 dürfen sich vorläufige Teile der API in Nebenversionen ändern, siehe 4.3) |
| `SPEC_VERSION` | `0.1` | Version der Spezifikation, die das Paket umsetzt |
| `CLI_INTERFACE_VERSION` | `1` | Version der stabilen Kommandozeile (Kapitel 3); steigt nur, wenn ein Befehl, eine Option, ein Rückgabecode oder ein Feld eines JSON-Berichts entfällt oder seine Bedeutung ändert |

```text beleg:05-paket.txt
$ npx hpro version --json
{
  "package": "@hpro/kern",
  "version": "0.1.0",
  "cliInterface": 1,
  "specification": "0.1",
  "ruleCatalog": "0.1",
  "node": "26.5.1"
}
[Exit-Code 0]
```

**Zusätzliche Werkzeuge** sind optional; fehlen sie, meldet der Befehl das ausdrücklich, er rät nicht:

| Werkzeug | Wofür | Wie gefunden |
| --- | --- | --- |
| epubcheck 5.4.0 mit Java 21 | Regeln HPR-CONT-024/028 des Prüfers (EPUB-Gültigkeit) | `HPRO_EPUBCHECK` (Pfad zur `.jar`) und `HPRO_JAVA`; im Repository `prototyp/tools/` |
| hpro-Dienst (`dienst/`: WeasyPrint, veraPDF, Docling, Tesseract) | `hpro pdf export`, PDF-Import, OCR | `--dienst URL` (HTTP) oder `--lokal` (`HPRO_DIENST_DIR`, `HPRO_DIENST_PYTHON`; im Repository `dienst/`) |
| LibreOffice ≥ 7.0 | die Erweiterung aus Kapitel 5 | Installation in LibreOffice |

## 3. Kommandozeile (Schnittstelle 1)

### 3.1 Befehle

Vier Befehle decken die Aufgaben „erzeugen, prüfen, signieren, nach PDF ausgeben“ ab; dazu
Signaturprüfung und Version. Ihre Namen, Optionen, Rückgabecodes und JSON-Felder sind die
**Schnittstelle 1**: sie wachsen, aber nichts entfällt und nichts ändert seine Bedeutung, solange
`CLI_INTERFACE_VERSION` 1 ist. Alle anderen Befehle von `hpro` (`calc`, `lock`, `edit`, `form`,
`annotate`, `a11y`, `author`, `keygen`, `inspect` …) sind Arbeitswerkzeuge der Pakete und gehören
nicht dazu.

| Befehl | Aufgabe | Wichtige Optionen |
| --- | --- | --- |
| `hpro create <quelle> <ziel.hpro>` | erzeugen aus `.md`, `.docx`, `.odt`/`.fodt`/`.ott`, `.ods`/`.fods`/`.xlsx`, `.pdf` (Format aus der Endung oder `--from md\|docx\|odt\|ods\|xlsx\|pdf`) | `--vorlage NAME\|ORDNER`, `--feld k=v`, `--id URN`, `--modified ISO`, `--titel`, `--sprache` (nur Tabellen), `--no-original`, `--bild-auslassen`, `--json BERICHT`, `--dienst URL` (nur PDF) |
| `hpro check <datei>` | prüfen mit dem Konformitätsprüfer (Teil 1) | `--format text\|json`, `--json DATEI`, `--trust ZERT`, `--time ISO`, `--level STUFE`, `--strict`, `--redacted TEXT`, `--no-epubcheck`, `--epubcheck JAR`, `--java BIN` |
| `hpro sign <ein> <aus>` | signieren, XAdES-BASELINE-B (Teil 0, Abschnitt 10), mit `--tsa` XAdES-BASELINE-T | `--key SCHLÜSSEL.pem --cert ZERT.pem`, `--chain`, `--time`, `--id`, `--only PFAD`, `--tsa URL`, `--json DATEI` |
| `hpro pdf export <ein> <aus.pdf>` | nach PDF ausgeben (PDF/A-2a und PDF/UA-1, mit veraPDF geprüft) als Brücke ([docs/11](../11-pdf-import-export-ocr.md)) | `--dienst URL` oder `--lokal`, `--conformance`, `--rendition ID`, `--embed-container`, `--json DATEI` |
| `hpro validate <datei>` | Signaturen prüfen (ETSI EN 319 102-1, ohne Java) | `--trust ZERT`, `--policy hpro\|dss-default\|strict`, `--time`, `--json`, `--crl`, `--fetch-crls` |
| `hpro version`, `hpro help` | Versionen (Kapitel 2), Überblick | `--json` |

```text beleg:01-kommandozeile.txt
$ hpro help
hpro – Kommandozeile (Schnittstelle 1, siehe docs/spezifikation/06-einbau.md)

  hpro create <quelle> <ziel.hpro> [Optionen]   erzeugen aus .md, .docx, .odt/.fodt, .ods/.fods/.xlsx, .pdf
  hpro check <datei> [Optionen]                 prüfen (Konformitätsprüfer, Teil 1)
  hpro sign <ein> <aus> --key K --cert Z [...]  signieren (XAdES-BASELINE-B, mit --tsa B-T)
  hpro pdf export <ein> <aus.pdf> --dienst URL|--lokal [...]   nach PDF ausgeben (PDF/A-2a, PDF/UA-1)
  hpro validate <datei> --trust Z [...]         Signaturen prüfen
  hpro version [--json]                         Versionen

Rückgabe: 0 erfolgreich, 1 Ergebnis negativ, 2 Aufruf- oder Eingabefehler, 3 unbestimmt (check),
4 Hilfsmittel fehlt (PDF-Dienst).
[Exit-Code 0]
```

### 3.2 Rückgabecodes

Ein aufrufendes Programm entscheidet allein am Rückgabecode; die Textausgabe ist für Menschen und
darf sich ändern. Die Codes gelten für alle Befehle der Schnittstelle 1:

| Code | Bedeutung | Beispiele |
| --- | --- | --- |
| 0 | erfolgreich, bestanden | Dokument geschrieben; alle Stufen bestanden; Signatur `TOTAL_PASSED`; jede verlangte PDF-Stufe bestanden |
| 1 | Ergebnis negativ, Befehl lief | Prüfer: eine Stufe nicht bestanden; Signatur nicht `TOTAL_PASSED`; PDF-Stufe nicht bestanden; Vorlage nicht erfüllt (`create` schreibt dann nichts) |
| 2 | Aufruf- oder Eingabefehler, nichts geschrieben | falsche Argumente, unbekanntes Quellformat, Datei fehlt oder ist kaputt, Option gilt nicht für diese Quelle; Prüfer konnte nicht laufen |
| 3 | unbestimmt (nur `check`) | keine Fehler, aber Regeln ohne Prüfmittel (Teil 1, Abschnitt 3.4); ohne Browser-Engine der **Normalfall**, weil die Darstellungsregeln HPR-INH-004, -006, -022 einen Browser brauchen |
| 4 | Hilfsmittel fehlt, nichts geschrieben | PDF-Dienst nicht erreichbar oder nicht installiert; PDF-Quelle ohne `--dienst` |

Für `check` sind das die Codes aus Teil 1, Abschnitt 4.5. Ein Erzeuger, der seine Ausgabe prüft,
behandelt 0 und 3 als „keine Fehler“ und liest bei 3 die Liste `notChecked` des JSON-Berichts.
Alle Codes sind im Beleg einmal ausgelöst:

```text beleg:01-kommandozeile.txt
$ hpro create docs/belege/S5/eingabe/angebot-unvollstaendig.md prototyp/out/s8/unvollstaendig.hpro --vorlage angebot
…
[Exit-Code 1]
…
$ hpro create docs/belege/S5/eingabe/referenz.md prototyp/out/s8/x.hpro --titel gilt nur für Tabellen
hpro create: Option --titel gilt nicht für Quellen der Art md
[Exit-Code 2]
…
$ hpro check docs/belege/S8/container/cli-odf.hpro
…
Befunde: 0 fatal, 0 Fehler, 0 Warnungen, 0 Hinweise, 4 nicht geprüft
Stufe Basis: unbestimmt
Berichtsschema: gültig
[Exit-Code 3]
…
$ hpro pdf export docs/belege/S8/container/cli-odf.hpro prototyp/out/s8/x.pdf --dienst http://127.0.0.1:47999
Dienst: http://127.0.0.1:47999 (auf diesem Gerät)
hpro pdf: Dienst nicht verfügbar: fetch failed (connect ECONNREFUSED 127.0.0.1:47999)
[Exit-Code 4]
```

Der Vertragstest [`kern/test/cli.test.ts`](../../kern/test/cli.test.ts) löst jeden Code jedes
Befehls aus und läuft in `npm test`; eine Änderung, die ihn bricht, bricht eingebaute Software.

### 3.3 Maschinenlesbare Berichte

| Befehl | Option | Inhalt |
| --- | --- | --- |
| `create` | `--json DATEI` | `quelle`, `format` (Name, Media-Type, Werkzeug), `vorlage`, `mindestprofil`, `inventarQuelle` (was die Quelle enthielt), `geschrieben`, `zusammenfassung` (`verlust`, `ersatz`, `hinweis`, `fehler`), `meldungen` (Code, Kategorie, Schwere, Text), `ausgabe` (`datei`, `bytes`, `sha256`; `null`, wenn nichts geschrieben wurde); bei Tabellen `bericht` mit dem Importbericht aus Teil 3, Abschnitt 13 |
| `check` | `--format json` oder `--json DATEI` | Prüfbericht nach Teil 1, Abschnitt 4.3, gültig gegen `spec/schema/konformitaetsbericht.schema.json` |
| `sign` | `--json DATEI` | `file`, `bytes`, `sha256`, `signatureId`, `level`, `signer`, `signedPaths`, `readBack` (Urteil der eigenen Rückprüfung), bei `--tsa` `timestamp` |
| `pdf export` | `--json DATEI` | `checks` (veraPDF je Stufe), `engine`, `variant`, `pages`, `omitted` (gesperrte Abschnitte, HP-LOCK-004), `live`, `warnings` |
| `validate` | `--json` | Bericht je Signatur mit Indikation und Unterindikation (ETSI EN 319 102-1) |

```text beleg:01-kommandozeile.txt
$ cat docs/belege/S8/berichte/cli-sign.json
{
  "file": "docs/belege/S8/container/cli-odf-signiert.hpro",
…
  "level": "XAdES-BASELINE-B",
…
  "readBack": [
    {
…
      "indication": "TOTAL_PASSED"
    }
  ]
}
[Exit-Code 0]
```

### 3.4 Umgebung

| Variable | Wirkung |
| --- | --- |
| `HPRO_EPUBCHECK`, `HPRO_JAVA` | epubcheck für `check` (sonst HPR-CONT-024/028 „nicht geprüft“) |
| `HPRO_DIENST` | Adresse des hpro-Dienstes, wenn `--dienst` fehlt |
| `HPRO_DIENST_DIR`, `HPRO_DIENST_PYTHON` | Dienst für `pdf export --lokal`: Ordner mit `hpro_dienst/` und dessen Python |

`--lokal` startet den Dienst nicht als Server, sondern ruft dessen Kommandozeile einmal als
Kindprozess auf: kein Port, kein Netz, kein Prozess, der liegen bleibt. Vorher entfernt der Kern
Abschnitte mit `no-export` (HP-LOCK-004), genau wie beim Weg über HTTP:

```text beleg:01-kommandozeile.txt
$ hpro pdf export docs/belege/S8/container/cli-odf.hpro docs/belege/S8/pdf/cli-odf.pdf --lokal --json docs/belege/S8/berichte/cli-pdf.json
Dienst: lokal (/opt/data/html-pro/dienst/.venv/bin/python -m hpro_dienst, auf diesem Gerät, ohne Netz)
…
  PDF/A-2a: bestanden (veraPDF 1.30.3, Regeln verletzt 0, Prüfungen fehlgeschlagen 0)
  PDF/UA-1: bestanden (veraPDF 1.30.3, Regeln verletzt 0, Prüfungen fehlgeschlagen 0)
[Exit-Code 0]
```

## 4. Bibliothek

### 4.1 Beispielaufruf

Das kleinste vollständige Programm: Text → Dokumentmodell → Container → Rücklesen → Prüfung.
Es liegt unter [`einbau/bibliothek/beispiel.mjs`](../../einbau/bibliothek/beispiel.mjs):

```js aus:einbau/bibliothek/beispiel.mjs
import { KERN_VERSION, author, checkConformance, createContainer, readContainer } from '@hpro/kern';
…
// 1. Source → document model (every loss is reported in source.messages).
const source = author.readMarkdown(markdown);
// 2. Model + template → container input (XHTML, navigation, metadata).
const written = await author.writeDocument(source, author.findTemplate('frei'));
// 3. Container: ZIP with mimetype, OCF, package.opf, manifest.json with SHA-256 per file.
const created = await createContainer(written.document);
…
const back = await readContainer(created.bytes);
const catalog = JSON.parse(await readFile(new URL(import.meta.resolve('@hpro/kern/spec/01-regelkatalog.json')), 'utf8'));
const report = await checkConformance(created.bytes, catalog, { fileName: out });
```

Im fremden Projekt gegen das installierte Paket ausgeführt:

```text beleg:05-paket.txt
$ node beispiel.mjs aktennotiz.hpro
@hpro/kern 0.1.0: aktennotiz.hpro (4047 Bytes), Titel „Aktennotiz Besprechung Brandschutz“, Hash-Manifest ok
Meldungen des Autorenwegs: hinweis ebenen-verschoben
Prüfer: 0 fatal, 0 Fehler, 0 Warnungen; Stufen {"Basis":"unbestimmt"}
[Exit-Code 0]
```

### 4.2 Plattform

Die Bibliothek nutzt nur Web-Standard-APIs (`crypto.subtle`, `CompressionStream`, `TextEncoder`)
und wird ohne Node-Typen übersetzt ([`kern/tsconfig.json`](../../kern/tsconfig.json)). Sie läuft
unter Node ≥ 22 und im Browser: die Reader-App ([`app/`](../../app/)) nutzt sie in Chromium, Firefox
und WebKit ([docs/16](../16-testmatrix-und-ci.md)). Nur Node brauchen die Kommandozeile und was
Prozesse startet (epubcheck, `pdf export --lokal`). Netz nutzt die Bibliothek nur dort, wo man es
ausdrücklich übergibt: `HttpTimestampAuthority`, `CscClient`, `fetchCrls`, `pdf.DienstClient`.

### 4.3 Stabile API

Stabil (Schnittstelle 1) sind alle Exporte der obersten Ebene und der Namensraum `author`; aus den
übrigen Namensräumen die unten genannten Funktionen. Stabil heißt: Name, Parameter und Bedeutung
bleiben in allen 0.x-Versionen, neue optionale Felder dürfen hinzukommen. Alles andere ist
**vorläufig**: dokumentiert in [`kern/README.md`](../../kern/README.md), nutzbar, aber in
Nebenversionen änderbar. Die Typen aller Funktionen stehen in `dist/*.d.ts`.

**Container erzeugen und lesen** (Teil 0, Abschnitt 3):

| Export | Zweck |
| --- | --- |
| `createContainer(input)` | `DocumentInput` (Metadaten, Lesereihenfolge, Inhaltsverzeichnis, Ressourcen, optional `accessibility`, `attachments`, `components`, `data`, `access`, `source`, `subset`) → `{ bytes, manifest, readBack }`; prüft die Eingabe (XHTML streng, keine externen Ressourcen, keine Skripte außerhalb des Profils `interactive`), schreibt reproduzierbar und liest das Ergebnis wie eine fremde Datei zurück |
| `readContainer(bytes, options?)` | gehärtetes Lesen (Pfade, Größen, ZIP-Bomben); Hashabweichungen werfen nicht, sondern stehen in `integrity` |
| `sampleDocument()` | Beispielinput für Tests |
| `buildManifest`, `serializeManifest`, `parseManifest`, `verifyIntegrity`, `isManifestCovered`, `manifestAccessibility` | `manifest.json` bauen, schreiben, lesen, Hashes prüfen (HP-CONT-008, -009) |
| `readZip`, `writeZip` | der eigene ZIP-Leser und -Schreiber (mimetype unkomprimiert zuerst, docs/05) |
| `sha256`, `sha256Hex`, `sriSha256` | Hashes in der Form des Manifests |
| `MIMETYPE_PATH`, `CONTAINER_XML_PATH`, `PACKAGE_PATH`, `MANIFEST_PATH`, `DEFAULT_NAV_PATH`, `EPUB_MIMETYPE`, `SUBSET_OFFICE_MIN` | feste Pfade und Werte |
| `ContainerError` | Fehler mit stabilem `code` (`zip-structure`, `zip-unsupported`, `zip-limit`, `zip-crc`, `zip-path`, `mimetype`, `container-xml`, `manifest`, `input`, `write-verification`, `signature`, `timestamp`, `remote-signer`) und `path` |

**Prüfen** (Teil 1):

| Export | Zweck |
| --- | --- |
| `checkConformance(bytes, catalog, options)` | Prüfbericht nach Teil 1, Abschnitt 4.3; `options`: `fileName`, `trustAnchors`, `validationTime`, `levels`, `strict`, `redactedTerms`, `epubValidator` (Adapter für epubcheck), `supportedFunctions` |
| `exitCode(report)`, `reportText(report)`, `formatLocation(loc)`, `validateAgainstSchema(value, schema)` | Rückgabecode nach Teil 1, Abschnitt 4.5, Textform, Fundstelle, Schemaprüfung des Berichts |
| `CHECKER_NAME`, `CHECKER_TOOL_VERSION` | Name und Version des Prüfers |

**Signieren, Zeitstempel, Fernsignatur, Signaturprüfung** (Teil 0, Abschnitt 10; [docs/13](../13-fernsignatur-und-zeitstempel.md)):

| Export | Zweck |
| --- | --- |
| `signContainer(bytes, options)` | XAdES-BASELINE-B, mit `timestamp` B-T; `signer` ist ein Adapter (`Signer`), der private Schlüssel verlässt ihn nie |
| `addSignatureTimestamp(bytes, options)` | vorhandene Signatur von B auf T erweitern |
| `filesToSign`, `SIGNATURES_PATH`, `ODF_MANIFEST_PATH` | signierte Dateien, Pfade |
| `SoftwareKeySigner`, `createTestIdentity`, `pkcs8FromPem`, `toPem`, `algorithmForCertificate` | Software-Schlüssel (WebCrypto) und TEST-Zertifikate |
| `RemoteCscSigner`, `CscClient`, `CscError`, `CscTimestampAuthority`, `algorithmsForCredential`, `CSC_OIDS` | Fernsignatur über die CSC-API (qualifizierte Signatur beim Vertrauensdiensteanbieter) |
| `HttpTimestampAuthority`, `encodeTimeStampRequest`, `parseTimeStampResponse`, `parseTstInfo`, `verifyTimeStampToken`, `tokenFromFile`, `HASH_OIDS`, `TSP_OIDS` | Zeitstempel nach RFC 3161 |
| `validateContainer(bytes, options)`, `TsValidator`, `VALIDATOR_NAME`, `VALIDATOR_VERSION` | Signaturprüfung ohne Java, Urteile wie EU DSS |
| `certificatesFromPem`, `parseCertificate`, `canonicalize`, `C14N` | Zertifikate, Kanonisierung |
| `fetchCrls`, `parseCrl`, `parseCrls`, `revocationStatus` | Sperrlisten (Netz nur in `fetchCrls`) |

**Adressen und Unterdokumente** (Teil 0, Abschnitte 5 und 6):

| Export | Zweck |
| --- | --- |
| `collectAddresses`, `containerAddresses`, `resolveAddress`, `diffAddresses` | stabile Adressen sammeln, auflösen, zwischen Fassungen vergleichen |
| `openSubdocument`, `SUBDOCUMENT_MEDIA_TYPE` | eingebettetes hpro-Dokument öffnen (HP-NEST-004) |

**Versionen:** `KERN_VERSION`, `SPEC_VERSION`, `CLI_INTERFACE_VERSION` (Kapitel 2).

**Namensräume** (`import { author, calc, … } from '@hpro/kern'`):

| Namensraum | Stabil | Vorläufig |
| --- | --- | --- |
| `author` (Autorenweg, S5/S8) | alles: `readMarkdown`, `readDocx`, `readOdf`, `writeDocument`, `findTemplate`, `parseTemplate`, `TEMPLATES`, `hasErrors`, `Messages`, `DocxError`, `OdfError` und die übrigen Exporte | – |
| `calc` (Teil 3) | `importSpreadsheet`, `recalculateContainer`, `freezeContainer`, `inspectCalculation`, `exportTables`, `evaluateStandalone`, `SUPPORTED_FUNCTIONS`, `CALCULATOR` | Formelparser, Auswerter, DOM-Modell |
| `pdf` (P9) | `RemoteWeasyPrint`, `RemoteDocling`, `RemoteTesseractOcr`, `DienstClient`, `DienstError`, `exportView`, `importToDocument` | Hilfsfunktionen |
| `lock` (P17) | `freezeAndSign`, `checkFrozenVersion`, `redactContainer`, `sealSection`, `openSealedSection`, `lockEvidence` | übrige |
| `form` (P6) | `fillForms`, `exportFormData`, `inspectForms` | übrige |
| `edit` (P5) | `editContainer`, `diffContainers`, `listVersions` | übrige |
| `annotate` (P7) | `readAnnotations`, `saveAnnotations`, `toCollection` | übrige |
| `a11y` (P8) | `auditContainer`, `fixContainer` | übrige |
| `live` (P15) | `planComponents`, `frameCsp` | übrige |

### 4.4 Adapter für eigene Schlüssel und Dienste

Die Bibliothek baut XAdES, Zeitstempelanfragen und PDF-Aufträge selbst; was plattformabhängig ist,
steckt hinter Adapter-Schnittstellen aus [docs/06](../06-plattform-und-funktionsmatrix.md),
Abschnitt 4.1. Ein Hersteller mit eigenem Schlüsselspeicher (HSM, Smartcard, Betriebssystem-Schlüssel)
implementiert nur `Signer.signDigest` und übergibt den Adapter an `signContainer`; die Signatur
entsteht dann nach Teil 0, Abschnitt 10 (HP-SIG-001), ohne dass der Schlüssel die Hardware
verlässt. Ebenso `TimestampAuthority` für einen eigenen Zeitstempeldienst und `PdfExport` für
eine eigene PDF-Ausgabe.

```ts aus:kern/README.md
`Signer.signDigest` bekommt zusätzlich zum Digest die kanonisierten Bytes (`data`): WebCrypto
hasht selbst und kann keinen vorberechneten Digest signieren. Der `SoftwareKeySigner` prüft,
dass `digest` der Hash von `data` ist; ein Fernsignatur-Adapter (CSC) nutzt nur `digest`.
```

## 5. Office-Export

### 5.1 Wege nach Programm

Office-Programme schreiben Formatvorlagen, nicht Seiten; daraus entsteht Struktur nach der
Zuordnung aus Teil 0, Abschnitt 15 (Mindestprofil für Büroprogramme, HP-MIN-001 bis HP-MIN-012):

| Programm | Exportweg | Leser im Kern |
| --- | --- | --- |
| LibreOffice / OpenOffice Writer | Erweiterung „Als hpro exportieren…“ (5.2), oder Speichern als `.odt` und `hpro create` | `author.readOdf` (S8) |
| Microsoft Word | Speichern als `.docx` oder „OpenDocument-Text“ (`.odt`), dann `hpro create` | `author.readDocx` (S5) bzw. `author.readOdf` |
| Google Docs | „Herunterladen → Microsoft Word“ oder „OpenDocument-Format“, dann `hpro create` | wie Word |
| LibreOffice Calc | Erweiterung oder Speichern als `.ods`, dann `hpro create` | `calc.importSpreadsheet` (Teil 3, Abschnitt 13) |
| Microsoft Excel | Speichern als `.xlsx` oder `.ods`, dann `hpro create` | `calc.importSpreadsheet` |

Jeder Weg meldet, was nicht übernommen wurde (Verlust, Ersatz, Hinweis), statt es still zu
verwerfen ([docs/10](../10-anspruch-und-funktionsprofil.md), Zusage 7: „wird beim Import als Wert
eingefroren, nicht stillschweigend verworfen“; Teil 0, HP-META-005 für die mitgeführte Quelle unter
`original/`).

### 5.2 LibreOffice-Erweiterung

[`einbau/libreoffice/hpro-export/`](../../einbau/libreoffice/hpro-export/) ist eine
LibreOffice-Erweiterung (`.oxt`, ab LibreOffice 7.0) in Python. Sie trägt den Menüpunkt
„Als hpro exportieren…“ in **Datei** (nach „Exportieren…“) und unter **Extras → Add-ons** ein, für
Text- und Tabellendokumente. Sie wandelt selbst nichts um, sondern ruft die Kommandozeile auf – so
gibt es eine einzige Umsetzung des Formats:

1. Kopie des Dokuments als ODF speichern (`writer8` bzw. `calc8`), das Original bleibt unberührt;
2. `hpro create <kopie> <ziel> --id <hpro:id> --modified <jetzt, UTC> --json <bericht>`;
3. `hpro check <ziel> --format json`;
4. Ergebnis anzeigen: geschrieben, Verluste und Ersatz, Urteil des Prüfers.

Beim ersten Export bekommt das Dokument die benutzerdefinierte Eigenschaft `hpro:id`
(`urn:uuid:…`, Datei → Eigenschaften → Benutzerdefiniert); jeder weitere Export trägt dieselbe
Kennung (HP-META-001). Die Kommandozeile findet die Erweiterung über `HPRO_CLI`
(z. B. `node /pfad/hpro.js`) oder `hpro` im Suchpfad.

```py aus:einbau/libreoffice/hpro-export/hpro_export.py
        doc.storeToURL(uno.systemPathToFileUrl(source), (_prop("FilterName", filter_name),))
        report_file = os.path.join(work, "bericht.json")
        args = cmd + ["create", source, target, "--id", doc_id, "--json", report_file]
```

**Installieren:** Extras → Extension Manager → Hinzufügen → `hpro-export.oxt`, oder
`unopkg add hpro-export.oxt`. Das Archiv baut [`einbau/libreoffice/pruefen.py`](../../einbau/libreoffice/pruefen.py)
aus dem Ordner; der Beleg enthält das gebaute Archiv unter `docs/belege/S8/eingabe/hpro-export.oxt`.

**Automatisieren:** derselbe Befehl ohne Dialoge ist
`service:org.hpro.export.ExportJob?export-to:<Datei-URL des Ziels>`; das Ergebnis steht dann in
`<ziel>.export.json`. So prüft der Beleg die Erweiterung in einem echten LibreOffice ohne
Oberfläche: Erweiterung installieren, Writer- und Calc-Dokument über die Office-API aufbauen wie ein
Nutzer (Titel, Überschriften, Listen, Tabelle mit Wiederholungszeile und Beschriftung, Bild mit
Alternativtext und Beschriftung, Fuß- und Endnote, Textmarke mit Querverweisen, Hyperlink,
Kommentar, Verzeichnis, Kopf- und Fußzeile; Kostentabelle mit Formeln), Menübefehl auslösen:

```text beleg:02-office-export.txt
Office: LibreOffice 26.8.1.1
Komponente org.hpro.export.ExportJob: registriert
…
== writer: Dokument über die Office-API aufgebaut
…
hpro create -> Rückgabe 0
…
  |   Profil static, Mindestprofil für Büroprogramme (subset office-min); Rücklesen: Hash-Manifest ok
…
  |   Meldungen: 1 Verlust, 2 Ersatz, 2 Hinweis
  |   VERLUST kommentare [kommentar]: Kommentar nicht übernommen; Kommentare gehören als Anmerkungen (W3C Web Annotations) in einen eigenen Arbeitsschritt.
…
hpro check -> Rückgabe 3; Stufen {'Basis': 'unbestimmt'}; Befunde {'fatal': 0, 'error': 0, 'warning': 0, 'info': 0, 'notChecked': 4}
…
== calc: Dokument über die Office-API aufgebaut
…
  |   1 Tabellen, 26 Zellen, 7 Formeln, davon 7 übernommen, 0 als Wert eingefroren; 0 Makroteile nicht übernommen
hpro check -> Rückgabe 3; Stufen {'Basis': 'unbestimmt'}; Befunde {'fatal': 0, 'error': 0, 'warning': 0, 'info': 0, 'notChecked': 4}
…
Ergebnis: beide Exporte geschrieben, Prüfer ohne Fehler
```

Die Darstellungsregeln, die der Prüfer ohne Browser offen lässt, sind in Chromium nachgeprüft
(`docs/belege/S8/04-darstellung.txt`): kein waagrechtes Scrollen des Fließtexts bei 320, 768 und
1280 Pixeln (HPR-INH-004), Schrift folgt den Lesesystem-Variablen (HPR-INH-006), keine Animation
(HPR-INH-022).

### 5.3 Was übernommen wird

Die Zuordnung ist die ODF-Spalte der Tabelle 15.2 aus Teil 0, Abschnitt 15; Struktur kommt nur aus
Vorlagen, nie aus dem Aussehen (HP-MIN-003). Für Tabellenkalkulationen gilt Teil 3, Abschnitt 13.

| In der Quelle | Im Dokument | Meldung |
| --- | --- | --- |
| Absatzvorlage „Titel“, Gliederungsebenen 1–6 | `h1`, Abschnitte mit `h2`…`h6`, stabile Kennungen (Textmarken werden Kennungen, HP-ADR-002) | – |
| benannte Zeichenvorlagen „Betont“, „Stark betont“, „Quelltext“ | `em`, `strong`, `code` | – |
| direkte Formatierung fett/kursiv | `span class="hp-fett"`/`"hp-kursiv"` (HP-MIN-012) | – |
| Listen nach Listenvorlage, verschachtelt, fortgesetzte Nummerierung | `ul`/`ol` mit `start` (HP-MIN-005) | Ersatz bei Nummerierungsarten außer 1, 2, 3 |
| Tabelle mit Wiederholungszeile, verbundene Zellen, Beschriftung | `table` mit `thead`, `colspan`/`rowspan`, `caption` (HP-MIN-006) | Hinweis ohne Kopfzeile |
| Bild mit Alternativtext, Beschriftungsrahmen | `figure` mit `img alt` und `figcaption` (HP-MIN-007) | Ersatz ohne Alternativtext; Fehler bei Formaten außer PNG, JPEG, GIF, WebP, SVG (`--bild-auslassen`) |
| Fuß- und Endnoten, Querverweise, Hyperlinks | `doc-footnote`, Endnotenabschnitt, interne und externe Verweise (HP-MIN-008, HP-MIN-009) | Ersatz bei Seitenverweisen (Ziel statt Seitenzahl) |
| Zitat, vorformatierter Text | `blockquote`, `pre` (aufeinanderfolgende Absätze zusammengefasst) | – |
| Kopf- und Fußzeile | einmal am Ende, Seitenzahlen entfallen | Ersatz |
| Kommentare, Verzeichnisse, Felder, Bereiche, Änderungsverfolgung, Textrahmen, Formeln, Diagramme, OLE | Text, wo möglich; sonst sichtbarer Platzhalter | Verlust bzw. Ersatz bzw. Hinweis, immer gemeldet |
| Calc: Wiederholungszeilen, Formeln | `thead` mit `th scope="col"`; Formeln im Teilumfang aus Teil 3, sonst Wert eingefroren | Ersatz je eingefrorener Formel |

```text beleg:03-office-pruefung.txt
$ hpro check docs/belege/S8/container/pruefbericht.hpro --json docs/belege/S8/berichte/pruefbericht.pruefung.json
…
Befunde: 0 fatal, 0 Fehler, 0 Warnungen, 0 Hinweise, 4 nicht geprüft
Stufe Basis: unbestimmt
Berichtsschema: gültig
[Exit-Code 3]

$ epub docs/belege/S8/container/pruefbericht.hpro
Validating using EPUB version 3.4 rules.
No errors or warnings detected.
Messages: 0 fatals / 0 errors / 0 warnings / 0 infos

EPUBCheck completed
[Exit-Code 0]
```

### 5.4 Andere Office-Programme

Ein Exportfilter in einem anderen Programm (InDesign, Scribus, ein Redaktionssystem) hat zwei
Möglichkeiten: Er schreibt ein Format, das `hpro create` liest (ODT, DOCX, Markdown mit Vorlage
nach Teil 5, Kapitel 5), und ruft die Kommandozeile auf – das ist der Weg der LibreOffice-Erweiterung.
Oder er schreibt XHTML nach dem Mindestprofil (Teil 0, Abschnitt 15) und übergibt es an
`createContainer`; den Containeraufbau beschreibt Teil 4, Kapitel 2.

## 6. Anbindung von Fachanwendungen

### 6.1 Muster

Eine Fachanwendung (Prüfprotokoll, Bescheid, Messbericht, Kostenschätzung) erzeugt Struktur aus
Daten. Das Muster in fünf Schritten, jeder mit einer Funktion der stabilen API:

| Schritt | Funktion | Zusage aus [docs/10](../10-anspruch-und-funktionsprofil.md) |
| --- | --- | --- |
| XHTML aus den Daten schreiben: Überblick, Tabellen mit Formeln, aufklappbare Einzelheiten, Kennungen | eigener Code (oder Markdown + `author.readMarkdown`) | 1 Bildschirm zuerst, 3 verschachtelt |
| Container bauen, Daten als Anhang | `createContainer` mit `attachments` (HP-NEST-003) | 3 Anhänge sind Teil des Dokuments |
| rechnen: Formel und Wert speichern | `calc.recalculateContainer` | 7 Rechnen im Dokument |
| signieren, mit Zeitstempel | `signContainer`, `addSignatureTimestamp` (oder `lock.freezeAndSign` für eine eingefrorene Fassung) | 5 sperrbar und vertrauenswürdig |
| prüfen | `checkConformance` mit `@hpro/kern/spec/01-regelkatalog.json` | Prüfbarkeit (docs/10, Abschnitt 4b) |

### 6.2 Beispiel: Prüfbericht aus Messdaten

[`einbau/fachanwendung/bericht.mjs`](../../einbau/fachanwendung/bericht.mjs) macht aus Messdaten
einer Legionellen-Untersuchung ([`daten/legionellen-2026-10.csv`](../../einbau/fachanwendung/daten/legionellen-2026-10.csv))
einen signierten Prüfbericht: Überblick mit Zahlen, die das Dokument aus der Tabelle rechnet
(`data-hp-ref="value"`, HP-ADR-008), Messwerttabelle mit Formeln, je Probe ein aufklappbarer
Abschnitt (HP-NEST-001; Proben mit Maßnahme sind offen), die CSV als Anhang, Signatur über das
ganze Dokument. Die Formeln stehen im Dokument, die Werte rechnet der Kern:

```js aus:einbau/fachanwendung/bericht.mjs
        `<td data-hp-type="string" data-hp-formula="=IF([.D${r}]&gt;=${LIMIT};&quot;Maßnahme&quot;;IF([.C${r}]&lt;55;&quot;Temperatur prüfen&quot;;&quot;in Ordnung&quot;))" data-hp-value="">–</td></tr>`;
```

```js aus:einbau/fachanwendung/bericht.mjs
  // 3: the core calculates every formula and stores value and computedAt (part 3).
  const recalc = await calc.recalculateContainer(created.bytes, { computedAt: at, note: 'Werte aus den Messdaten berechnet' });
```

Im fremden Projekt gegen das installierte Paket:

```text beleg:06-fachanwendung.txt
$ node bericht.mjs daten/legionellen-2026-10.csv wasser-bericht.hpro --zeit 2026-10-07T10:00:00Z
…
  @hpro/kern 0.1.0 · 8 Proben · id urn:uuid:2a2748a9-13f8-8a70-a066-c77b50a5f48c · Stand 2026-10-07T10:00:00Z
  Rechnen: content/index.xhtml: 12 Formeln, 12 Werte gesetzt, 0 Zirkelbezüge
  ganzes Dokument signiert (7 Dateien), Signatur bericht-signatur (XAdES-BASELINE-B, ohne Zeitstempel)
  Hash-Manifest beim Rücklesen: ok; Anhänge: attachments/messwerte.csv
  Konformitätsprüfer (hpro-check (hpro Konformitätsprüfer) 0.1.0, Katalog 0.1): 0 fatal, 0 Fehler, 1 Warnungen, 0 Hinweise, 6 nicht geprüft
…
    WARNING HPR-SIG-012: Signatur bericht-signatur: kein Signaturzeitstempel (Niveau XAdES-BASELINE-B; empfohlen `XAdES-BASELINE-T`).
…
[Exit-Code 0]
```

Mit `--tsa` bekommt die Signatur einen Zeitstempel (XAdES-BASELINE-T); dann bleibt keine Warnung
(HPR-SIG-012). Eine Änderung nach dem Signieren erkennt die Signaturprüfung des Kerns ebenso wie
EU DSS 6.5 (`docs/belege/S8/07-dss.txt`):

```text beleg:06-fachanwendung.txt
$ hpro validate prototyp/out/s8/wasser-manipuliert.hpro --trust docs/belege/S8/container/wasser-bericht.zertifikat.pem --time 2026-10-07T10:00:00Z
…
indication: TOTAL_FAILED / HASH_FAILURE
…
[Exit-Code 1]
```

### 6.3 Signatur in der Fachanwendung

Das Beispiel nutzt eine TEST-Identität aus `createTestIdentity`. Eine echte Anwendung übergibt
ihren eigenen Schlüssel (`--key`/`--cert` bzw. `SoftwareKeySigner.fromPkcs8`), einen Adapter auf
ihr HSM (4.4) oder den Fernsignatur-Adapter `RemoteCscSigner` für eine qualifizierte Signatur
([docs/13](../13-fernsignatur-und-zeitstempel.md)). Ein Bericht einer Fachanwendung ist statisch;
deshalb ist das ganze Dokument die signierte, eingefrorene Fassung (Profil `signed`, Signatur über
alle Dateien, HP-PROF-004)
und trägt den sichtbaren Signaturhinweis für EPUB-Lesesysteme (HP-PROF-013). Soll das Dokument
bearbeitbar bleiben, signiert `--eingefroren` stattdessen eine eingefrorene Fassung unter
`renditions/` (HP-PROF-006); epubcheck 5.4.0 meldet für jede eingefrorene Fassung RSC-011, bis der
Änderungsantrag HPC-0003 entschieden ist (`docs/belege/S8/06-fachanwendung.txt`).

### 6.4 Andere Sprachen

Für Anwendungen in Java, .NET, Python oder PHP ist die Kommandozeile die Schnittstelle: Eingabe als
Markdown mit Vorlage (Teil 5, Kapitel 5) oder als ODT/DOCX, Aufruf von `hpro create` und
`hpro check --format json`, Entscheidung am Rückgabecode (3.2).
[`einbau/python/hpro_bericht.py`](../../einbau/python/hpro_bericht.py) zeigt das in Python mit der
Standardbibliothek:

```py aus:einbau/python/hpro_bericht.py
        made = hpro("create", md, target, "--json", os.path.join(tmp, "bericht.json"))
        print("hpro create -> %d" % made.returncode)
```

```text beleg:06-fachanwendung.txt
hpro create -> 0
…
hpro check -> 3 (keine Fehler, Regeln ohne Prüfmittel offen); Befunde {'fatal': 0, 'error': 0, 'warning': 0, 'info': 0, 'notChecked': 4}; Stufen {'Basis': 'unbestimmt'}
[Exit-Code 0]
```

### 6.5 Betrieb auf einem Server

Die Kommandozeile ist zustandslos: ein Aufruf je Dokument, kein Dienst, der laufen muss. Wer viele
Dokumente erzeugt, nutzt die Bibliothek in einem eigenen Node-Prozess und vermeidet den Start je
Aufruf. Beim Lesen fremder Dateien gelten die Grenzen von `readContainer` (Größe, Anzahl, ZIP-Bomben,
Pfade; `ZipReadOptions`); die Bibliothek öffnet keine Netzverbindung, außer man übergibt einen
Zeitstempel-, Fernsignatur- oder Sperrlisten-Adapter (4.2).

## 7. Die eigene Umsetzung prüfen

Wer hpro einbaut, prüft sein Ergebnis selbst, mit denselben Werkzeugen wie der Beleg:

1. `hpro check <datei>` mit epubcheck (`HPRO_EPUBCHECK`): 0 Fehler; bei Rückgabe 3 die Liste
   `notChecked` lesen (Teil 1, Abschnitt 4.3).
2. Die Darstellungsregeln HPR-INH-004, -006, -022 in einem Browser nachprüfen, z. B. mit
   [`scripts/s5-darstellung.mjs`](../../scripts/s5-darstellung.mjs) (Chromium).
3. Signierte Dateien zusätzlich mit EU DSS prüfen (Teil 4, Kapitel 8.4).
4. Die öffentliche Testsuite [`testsuite/`](../../testsuite/) mit Gut- und Schlechtfällen zu den
   Regeln aus Teil 1, Abschnitt 5 gegen den eigenen Leser oder Prüfer laufen lassen.
5. Zwei Läufe mit derselben Quelle und `--modified` vergleichen: Byte-Gleichheit (HP-CONT-014).

```text beleg:03-office-pruefung.txt
$ cmp docs/belege/S8/container/pruefbericht-aus-odt.hpro prototyp/out/s8/pruefbericht-2.hpro
[Exit-Code 0]
```

## 8. Grenzen und offene Punkte (informativ)

- **Registry:** Das Paket ist nicht in der npm-Registry veröffentlicht; Installation aus dem
  Paketarchiv (Kapitel 2). Das Lizenzfeld fehlt bis zur Festlegung in P14 (HPG-LIC-003).
- **Andere Sprachen:** Es gibt keine Bibliothek für Java, .NET oder Python; diese Sprachen nutzen die
  Kommandozeile und brauchen dafür Node.js.
- **LibreOffice-Erweiterung:** geprüft mit LibreOffice 26.8 unter Linux ohne Oberfläche
  (Installation, Registrierung der Menüeinträge, Menübefehl über die Office-API). **Nicht geprüft:**
  der Klick im Menü einer sichtbaren Oberfläche, der Dateidialog und das Meldungsfenster (keine
  Bildschirmsitzung im Prüflauf); LibreOffice unter Windows und macOS (kein solches System im
  Prüflauf).
- **Microsoft Word, Google Docs, Excel:** **nicht geprüft** mit Dateien dieser Programme (nicht
  verfügbar); geprüft sind DOCX, ODT und ODS, die LibreOffice geschrieben hat, und die DOCX-Fälle aus
  S5. Excel-Dateien (`.xlsx`) bekommen keine Kopfzeile aus Druckwiederholungszeilen; der Prüfer
  meldet dann HPR-INH-011 als Warnung.
- **Prüfer ohne Browser:** die Darstellungsregeln bleiben im Prüfer „nicht geprüft“, die Stufe
  „unbestimmt“ (Rückgabe 3); die Gegenprobe läuft getrennt in Chromium (Kapitel 7).
- **Prüfverfahren von HP-INH-004:** verlangt Faktor 2 auch für die Zeilenhöhe; folgt ein Dokument
  `--hp-line-height: 2` bei doppelter Schrift, ergibt sich rechnerisch 2,667 (16 px × 1,5 → 32 px × 2).
  Die Gegenprobe zeigt das an allen Vorlagen; der Widerspruch gehört als Änderungsantrag in Teil 0.
- **Eingefrorene Fassung:** epubcheck-Fehler RSC-011 bis zur Entscheidung über HPC-0003 (6.3).
