# 05 – Prototyp-Ergebnisse: EPUB und ASiC-E in einer Datei

**Projekt:** html-Pro · **Phase:** 2 (Machbarkeit) · **Stand:** 11.10.2026
**Auftrag:** [`04-phase2-auftrag.md`](04-phase2-auftrag.md), Abschnitte A und C
**Code und Rohprotokolle:** [`prototyp/`](../prototyp/), wörtliche Ausgaben in
[`prototyp/ergebnisse/`](../prototyp/ergebnisse/)

---

## 1. Ergebnis in fünf Sätzen

1. **Ja, mit Bedingungen:** Eine Datei kann gleichzeitig **gültiges EPUB 3** (epubcheck 5.4.0:
   0 Fehler, 0 Warnungen) und **gültig signierter ASiC-E-Container mit XAdES** (EU DSS 6.5:
   `TOTAL_PASSED`) sein. Das gilt auch mit zwei Signaturen (Fall V11).
2. **Bedingung 1, mimetype:** Die Datei `mimetype` muss `application/epub+zip` enthalten. Die
   ASiC-Norm erlaubt das bei XAdES ausdrücklich („the original media type of the container“,
   EN 319 162-1 §4.4.3.1). DSS meldet mit seiner Standardrichtlinie trotzdem eine **Warnung**, das
   Gesamtergebnis bleibt aber gültig. Mit einer eigenen Richtlinie verschwindet die Warnung, mit
   einer strengen Richtlinie wird daraus `TOTAL_FAILED`.
3. **Bedingung 2, Signaturdatei:** Die Signatur liegt als `META-INF/signatures.xml` mit dem
   OCF-Wurzelelement `<signatures xmlns="urn:oasis:names:tc:opendocument:xmlns:container">` vor. Beide
   Normen sehen genau diese Form vor. Mit der ASiC-Wurzel unter diesem Namen meldet epubcheck einen
   Fehler (`RSC-005`); unter dem Namen `signatures001.xml` bleibt es fehlerfrei.
4. **Rückfallebene heißt nur Lesbarkeit:** EPUB-Reader prüfen keine Signaturen. calibre zeigt eine
   nach dem Signieren manipulierte Datei ohne jeden Hinweis an („9.200,00 EUR“), während DSS
   `TOTAL_FAILED / HASH_FAILURE` meldet.
5. **Am Konzept kippt nichts, es wird präziser:** Signaturformat XAdES (nicht CAdES), mimetype
   `application/epub+zip`, kein eigener Mime-Typ. Die Dateiendung bleibt ein Normkonflikt. html-Pro
   braucht einen eigenen ZIP-Schreiber, weil DSS den EPUB-mimetype nicht selbst setzt. Details in
   Abschnitt 6 und im [Nachtrag zu 03](03-konzept.md#nachtrag-phase-2).

---

## 2. Aufbau

| Datei | Zweck |
|---|---|
| [`prototyp/build_container.py`](../prototyp/build_container.py) | erzeugt den Basis-Container (mimetype unkomprimiert als erste Datei, `META-INF/container.xml`, `package.opf`, `content/index.xhtml`, `content/nav.xhtml`, CSS, `manifest.json` mit SHA-256 je Ressource). Reproduzierbar: zwei Läufe ergeben byte-identische Dateien (`cmp` ohne Abweichung, SHA-256 `ee9b14c8…c044`) |
| [`prototyp/dss/`](../prototyp/dss/) | kleines Java-Werkzeug auf Basis **EU DSS 6.5**: `sign` (Datei signieren), `sign-files` (ASiC-E aus Verzeichnis bauen), `validate` (Bericht inkl. Format-Prüfung FC, optional eigene Richtlinie) |
| [`prototyp/zipedit.py`](../prototyp/zipedit.py) | gezielte Eingriffe für die Kreuzfälle: mimetype tauschen, umbenennen, Inhalt ändern, Datei ergänzen, Signaturwurzel auf OCF umstellen, Signaturen zusammenführen |
| [`prototyp/reader_check.py`](../prototyp/reader_check.py) | öffnet den Container mit EbookLib wie ein Reader (Metadaten, Spine, Text) |
| [`prototyp/setup-tools.sh`](../prototyp/setup-tools.sh) | lädt alle Werkzeuge mit Prüfsumme nach `prototyp/tools/` und baut das DSS-Werkzeug |
| [`prototyp/run_experiment.sh`](../prototyp/run_experiment.sh) | führt alle Fälle aus, schreibt Container nach `ergebnisse/container/` und Protokolle nach `ergebnisse/NN-*.txt` |

**Werkzeuge** (alle im Repo unter `prototyp/tools/` bzw. `prototyp/.venv/`, nicht eingecheckt;
Versionen aus [`00-werkzeuge.txt`](../prototyp/ergebnisse/00-werkzeuge.txt)):

| Werkzeug | Version | Rolle |
|---|---|---|
| Temurin JDK | 21.0.12.1+1 | Laufzeit für epubcheck und DSS. Ein JRE hätte für epubcheck gereicht; das DSS-Werkzeug muss kompiliert werden |
| EPUBCheck (W3C) | 5.4.0 | EPUB-Validierung („Validating using EPUB version 3.4 rules“) |
| EU DSS | 6.5 (Maven Central) | ASiC-E-Signatur und -Validierung |
| Apache Maven | 3.9.16 | nur zum Auflösen der DSS-Abhängigkeiten |
| calibre | 9.16 (portabel, ohne GUI) | Reader-Engine: `ebook-meta` und `ebook-convert` nach TXT |
| EbookLib | 0.18 | zweiter, unabhängiger EPUB-Parser |
| OpenSSL | 3.5.7 | selbstsigniertes Testzertifikat (RSA 3072, keyUsage digitalSignature + nonRepudiation) |

**Testschlüssel:** selbstsigniert, **nicht qualifiziert**. DSS prüft mit diesem Zertifikat als
Vertrauensanker, damit Format und Kryptografie getrennt von Vertrauensketten sichtbar werden.
Signaturniveau ist **XAdES-BASELINE-B** (ohne Zeitstempel). Das öffentliche Zertifikat liegt bei
([`signer.pem`](../prototyp/ergebnisse/container/signer.pem)), der private Schlüssel nicht.

---

## 3. Befehle zum Wiederholen

```sh
cd prototyp
./setup-tools.sh        # einmalig: ca. 1,1 GB nach prototyp/tools/ (JDK, epubcheck, Maven-Cache, calibre)
./run_experiment.sh     # ca. 3 Minuten; erzeugt ergebnisse/*.txt und ergebnisse/container/*
```

Einzelprüfung einer vorhandenen Datei:

```sh
tools/jdk-21.0.12.1+1/bin/java -jar tools/epubcheck-5.4.0/epubcheck.jar ergebnisse/container/zielformat-2sig.epub
tools/jdk-21.0.12.1+1/bin/java -cp "dss/target/classes:dss/target/lib/*" example.htmlpro.HproDss \
    validate ergebnisse/container/zielformat-2sig.epub ergebnisse/container/signer.pem
```

Bei einem neuen Lauf entstehen neue Schlüssel und Signaturen. Signatur-IDs und Zeitstempel in den
Protokollen ändern sich deshalb, die Befunde nicht.

---

## 4. Ergebnisse

### 4.1 Übersicht

„DSS“ = Gesamtergebnis mit DSS-Standardrichtlinie. „Reader“ = calibre 9.16 und EbookLib 0.18
öffnen die Datei und liefern den erwarteten Text.

| Fall | Container | mimetype | epubcheck 5.4.0 | DSS 6.5 | Reader | Protokoll |
|---|---|---|---|---|---|---|
| V0 | Basis, unsigniert | epub | **0 Fehler** | 0 Signaturen | ja | [01](../prototyp/ergebnisse/01-basis.txt) |
| V1 | DSS signiert die EPUB-Datei als Ganzes (Umschlag) | asic-e | 1 fatal, 1 Fehler (`RSC-002`, `PKG-007`) | TOTAL_PASSED | – | [02](../prototyp/ergebnisse/02-umschlag.txt) |
| V2a | DSS mit `setMimeType("application/epub+zip")` | **`application/octet-stream`** | 1 Fehler (`PKG-007`) | TOTAL_PASSED + Warnung | – | [03](../prototyp/ergebnisse/03-dss-mimeparam.txt) |
| V2 | DSS baut ASiC-E/XAdES aus den EPUB-Dateien | asic-e | 1 Fehler (`PKG-007`) | **TOTAL_PASSED**, keine Warnung | ja | [04](../prototyp/ergebnisse/04-asice-xades.txt) |
| **V3** | **V2, mimetype → epub** | epub | **0 Fehler** | **TOTAL_PASSED** + Warnung mimetype | ja | [05](../prototyp/ergebnisse/05-hybrid.txt) |
| V3 | dto., eigene Richtlinie (epub erlaubt) | epub | – | TOTAL_PASSED, **keine Warnung** | – | [05](../prototyp/ergebnisse/05-hybrid.txt) |
| V3 | dto., strenge Richtlinie (mimetype = FAIL) | epub | – | **TOTAL_FAILED / FORMAT_FAILURE** | – | [05](../prototyp/ergebnisse/05-hybrid.txt) |
| V4 | `signatures.xml` mit ASiC-Wurzel | epub | 1 Fehler (`RSC-005`) | TOTAL_PASSED + Warnung | – | [06](../prototyp/ergebnisse/06-signatures-xml.txt) |
| **V5** | **`signatures.xml` mit OCF-Wurzel** | epub | **0 Fehler** | **TOTAL_PASSED** + Warnung | ja | [06](../prototyp/ergebnisse/06-signatures-xml.txt) |
| V6 | ASiC-E/CAdES (`.p7s`), mimetype asic-e | asic-e | 1 Fehler (`PKG-007`) | TOTAL_PASSED | – | [07](../prototyp/ergebnisse/07-cades.txt) |
| V6 | dto., mimetype → epub | epub | 0 Fehler | TOTAL_PASSED + Warnung (**normwidrig**, s. 5.1) | ja | [07](../prototyp/ergebnisse/07-cades.txt) |
| V7 | V3 als `.hpro` / `.asice` | epub | **verweigert** („Mode required for non-epub files“); als Kopie `.epub`: 0 Fehler | TOTAL_PASSED + Warnung | – | [08](../prototyp/ergebnisse/08-endung-mimetype.txt) |
| V7 | eigener mimetype `application/vnd.html-pro+zip` | eigen | 1 Fehler (`PKG-007`) | TOTAL_PASSED + Warnung | EbookLib ja | [08](../prototyp/ergebnisse/08-endung-mimetype.txt) |
| V8 | Inhalt nach Signatur geändert | epub | 0 Fehler | **TOTAL_FAILED / HASH_FAILURE** | calibre zeigt den **manipulierten** Text | [09](../prototyp/ergebnisse/09-manipulation.txt) |
| V9 | Datei nach Signatur ergänzt (`annotations/`) | epub | 0 Fehler | TOTAL_PASSED + Warnung „Not all files are signed!“ | – | [10](../prototyp/ergebnisse/10-nachtrag.txt) |
| V10 | zweite Signatur (DSS erweitert V3 direkt) | epub (bleibt) | 0 Fehler | 2 × TOTAL_PASSED | ja | [11](../prototyp/ergebnisse/11-zweite-signatur.txt) |
| **V11** | **Zielformat:** 2 Signaturen in **einer** `signatures.xml` (OCF-Wurzel) | epub | **0 Fehler** | **2 × TOTAL_PASSED** (eigene Richtlinie: ohne Warnung) | ja | [12](../prototyp/ergebnisse/12-zielformat.txt) |

### 4.2 Wörtliche Kernausgaben

**V3: Hybrid-Container, epubcheck** ([05-hybrid.txt](../prototyp/ergebnisse/05-hybrid.txt))

```
$ epubcheck ergebnisse/container/hybrid.epub
Validating using EPUB version 3.4 rules.
No errors or warnings detected.
Messages: 0 fatals / 0 errors / 0 warnings / 0 infos

EPUBCheck completed
[Exit-Code 0]
```

**V3: derselbe Container, DSS mit Standardrichtlinie** (Auszug: Format-Prüfung gekürzt auf die
abweichende Zeile; vollständig im Protokoll)

```
$ dss_validate ergebnisse/container/hybrid.epub
[main] WARN eu.europa.esig.dss.asic.common.extract.DefaultASiCContainerExtractor - Unsupported files : [Name: META-INF/container.xml / MimeType: text/xml]
Validator: ASiCContainerWithXAdESValidator
Validierungsrichtlinie: DSS-Standard (policy/constraint.xml)
Containertyp: ASiC-E
mimetype-Datei vorhanden: true
mimetype-Inhalt: application/epub+zip
…
Anzahl Signaturen: 1 (gültig: 1)
…
Format: XAdES-BASELINE-B
Indication: TOTAL_PASSED
Signierte Objekte: [META-INF/container.xml, content/index.xhtml, content/nav.xhtml, content/styles/document.css, manifest.json, package.opf]
WARNUNG: The mimetype file content does not correspond to the expected value(s)!
Format-Prüfung (FC): PASSED
…
  Does the mimetype file content correspond to an expected value? -> WARNING [The mimetype file content does not correspond to the expected value(s)!]
```

**V3: strenge Richtlinie** (`AcceptableMimeTypeFileContent Level="FAIL"`)

```
Indication: TOTAL_FAILED / FORMAT_FAILURE
FEHLER: The mimetype file content does not correspond to the expected value(s)!
Format-Prüfung (FC): FAILED
  Does the mimetype file content correspond to an expected value? -> NOT_OK [The mimetype file content does not correspond to the expected value(s)!]
```

Herkunft der Warnung: In der DSS-Standardrichtlinie (`policy/constraint.xml` in
`dss-policy-jaxb-6.5.jar`) stehen nur die beiden ASiC-Werte, auf Stufe WARN (Leerraum
zusammengefasst):

```
<AcceptableMimeTypeFileContent Level="WARN"> <Id>application/vnd.etsi.asic-s+zip</Id> <Id>application/vnd.etsi.asic-e+zip</Id> </AcceptableMimeTypeFileContent>
```

**V4 und V5: Signaturdatei unter dem EPUB-Namen** ([06](../prototyp/ergebnisse/06-signatures-xml.txt))

```
$ epubcheck ergebnisse/container/hybrid-sigxml-asicroot.epub
ERROR(RSC-005): ergebnisse/container/hybrid-sigxml-asicroot.epub/META-INF/signatures.xml(1,124): Error while parsing file: element "asic:XAdESSignatures" not allowed here; expected element "signatures" (with xmlns="urn:oasis:names:tc:opendocument:xmlns:container")

$ epubcheck ergebnisse/container/hybrid-sigxml-ocfroot.epub
Messages: 0 fatals / 0 errors / 0 warnings / 0 infos

$ dss_validate ergebnisse/container/hybrid-sigxml-ocfroot.epub
Dateiname: META-INF/signatures.xml
Format: XAdES-BASELINE-B
Indication: TOTAL_PASSED
```

Dass die Signatur den Wechsel des Wurzelelements übersteht, liegt an der exklusiven
Kanonisierung, die DSS standardmäßig setzt
(`<ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>` in der
erzeugten Signatur). Mit inklusiver Kanonisierung wäre das nicht zu erwarten; **nicht geprüft**.

**V8: Manipulation, Reader gegen Validator** ([09](../prototyp/ergebnisse/09-manipulation.txt))

```
$ epubcheck ergebnisse/container/hybrid-manipuliert.epub
Messages: 0 fatals / 0 errors / 0 warnings / 0 infos

$ dss_validate ergebnisse/container/hybrid-manipuliert.epub
Indication: TOTAL_FAILED / HASH_FAILURE
FEHLER: The reference data object is not intact!

$ calibre_text ergebnisse/container/hybrid-manipuliert.epub
ebook-convert: OK
Prüfdokument html-Pro
Die Parteien vereinbaren eine Lieferung von 12 Stück zum Preis von 9.200,00 EUR.
```

**V2a: DSS kann den EPUB-mimetype nicht selbst setzen** ([03](../prototyp/ergebnisse/03-dss-mimeparam.txt))

```
$ dss_sign_dir out/tmp/inhalt ergebnisse/container/dss-mimeparam.asice xades application/epub+zip
…
mimetype = application/octet-stream
```

**V10: DSS ergänzt eine zweite Signatur und lässt den EPUB-mimetype stehen** ([11](../prototyp/ergebnisse/11-zweite-signatur.txt))

```
$ listing ergebnisse/container/hybrid-2sig-direkt.epub
mimetype                                      stored
content/index.xhtml                           deflated
…
META-INF/signatures001.xml                    deflated
META-INF/signatures002.xml                    deflated
META-INF/manifest.xml                         deflated
META-INF/container.xml                        deflated
mimetype = application/epub+zip
```

Die zweite Signatur deckt dabei `META-INF/container.xml` **nicht** ab
(`Signierte Objekte: [content/index.xhtml, content/nav.xhtml, content/styles/document.css, manifest.json, package.opf]`).

---

## 5. Einordnung

### 5.1 Was die Normen sagen

| Frage | EPUB 3.3 ([W3C](https://www.w3.org/TR/epub-33/)) | ETSI EN 319 162-1 V1.1.1 ([ETSI](https://www.etsi.org/deliver/etsi_en/319100_319199/31916201/01.01.01_60/en_31916201v010101p.pdf)) | Folge |
|---|---|---|---|
| Inhalt `mimetype` | „MUST be … `application/epub+zip`“ (§4.3.3) | XAdES: „a) `application/vnd.etsi.asic-e+zip` … in case the container to be signed does not have a specific media type; or b) **the original media type of the container**. EXAMPLE: One of the ODF media types when signing an ODF container.“ (§4.4.3.1 Nr. 2). CAdES: „shall be `application/vnd.etsi.asic-e+zip`“ (§4.4.4.1 Nr. 2) | `application/epub+zip` ist mit **XAdES** normkonform, mit **CAdES** nicht |
| Signaturdatei | `META-INF/signatures.xml`, Wurzel `signatures` im Namensraum `urn:oasis:names:tc:opendocument:xmlns:container`, 1…n `Signature` (§4.2.6.3.6.1) | `*signatures*.xml` unter `META-INF/`; Wurzel u. a. „c) `signatures` element as specified in OCF“ (§4.4.3.2 Nr. 3) | **eine gemeinsame Form**: `META-INF/signatures.xml` mit OCF-Wurzel |
| `container.xml`, `manifest.xml` | `container.xml` Pflicht; `manifest.xml` nur ODF-Kompatibilität, Reader nutzen es nicht (§4.2.6.3.3) | „`container.xml` if present shall be as specified in OCF“; „`manifest.xml` if present shall be as specified in ODF“ (§4.4.3.2 Nr. 5) | verträglich |
| Signaturen prüfen | „reading systems do not have to check signatures“ (Hinweis in §4.2.6.3.6) | – | EPUB-Rückfallebene zeigt keinen Signaturstatus |
| Dateiendung | Einleitung nennt `.epub` (informativ) | „The file extension shall be either: a) `.asice`; or b) `.sce`“ (§4.4.3.1 Nr. 1) | **Konflikt**: keine Endung erfüllt beide; `.hpro` erfüllt keine (siehe 6.2) |

Die Norm wurde am 11.10.2026 als PDF geladen (SHA-256 `05b434cd…ce87`) und mit pypdf in Text
umgewandelt. Damit ist die in [03, Abschnitt 1.6](03-konzept.md#16-vergleich-mit-epub) offene
Frage nach Abschnitt 4.4.3.1 beantwortet.

### 5.2 Beobachtungen am Rand

- **DSS-Mime-Erkennung:** Beim Signieren meldet DSS für die XHTML-Dateien
  `[Fatal Error] :2:10: DOCTYPE is disallowed …` (XML-Parser mit XXE-Schutz) und trägt für `.xhtml`,
  `.css` und `.opf` im `META-INF/manifest.xml` den Typ `application/octet-stream` ein. Die Signatur
  ist davon nicht betroffen. Ein html-Pro-Signierer sollte die Media-Types selbst setzen
  (umgesetzt in P3: `DataObjectFormat` und `META-INF/manifest.xml` tragen die Typen aus `manifest.json`).
- **`container.xml` als „Unsupported file“:** DSS protokolliert beim Öffnen jedes Containers mit
  `META-INF/container.xml` eine Warnung im Log (`Unsupported files : [Name: META-INF/container.xml …]`),
  signiert und prüft die Datei aber als Datenobjekt mit. Im Prüfbericht erscheint dazu nichts.
- **ZIP-Reihenfolge:** Beim Erweitern (V10) schreibt DSS `META-INF/container.xml` ans Ende. Der
  mimetype bleibt erste Datei; epubcheck stört das nicht.
- **Lockere Reader:** calibre und EbookLib öffnen auch Container mit ASiC-mimetype (V2) und mit
  eigenem mimetype (V7, EbookLib). Für strengere Reader sagt das nichts aus.
- **mimetype ist nicht signiert:** V2 und V3 tragen dieselbe, gültige Signatur. Der mimetype lässt
  sich also nach dem Signieren tauschen, ohne die Signatur zu brechen (so vorgesehen; ASiC signiert
  nur Datenobjekte).

---

## 6. Folgerungen für das Format

### 6.1 Was der Prototyp festlegt (Vorschlag)

| Punkt | Festlegung | Beleg |
|---|---|---|
| mimetype | `application/epub+zip`, kein eigener Mime-Typ | V3, V7; EN 319 162-1 §4.4.3.1 Nr. 2 b |
| Signaturformat | **XAdES** (ASiC-E mit XAdES), **nicht CAdES** | V6 technisch lesbar, aber §4.4.4.1 verlangt bei CAdES den ASiC-mimetype |
| Signaturdatei | `META-INF/signatures.xml`, OCF-Wurzel, alle Signaturen als Geschwister-`ds:Signature`; neue Signatur ans Ende (EPUB „SHOULD add the signature as the last child“) | V5, V11 |
| Kanonisierung | exklusive C14N (`xml-exc-c14n#`) für `SignedInfo` und Referenzen | V5/V11 funktionieren nur deshalb |
| Signierte Objekte | jede Datei außerhalb `META-INF/` **plus** `META-INF/container.xml` ausdrücklich | V10 zeigt, dass DSS beim Erweitern `container.xml` nicht mitsigniert |
| Fremde Signaturdateien | Reader akzeptiert zusätzlich `signaturesNNN.xml` mit ASiC-Wurzel (so schreiben DSS und andere ASiC-Werkzeuge) | V3, V10 |
| Nachträge | unsignierte Dateien (z. B. `annotations/`) sind möglich; der Reader muss sie als „nicht signiert“ ausweisen | V9: DSS nur Warnung |
| Container schreiben | eigener ZIP-Schreiber in html-Pro; DSS (oder eine andere XAdES-Bibliothek) liefert nur die Signatur. **Stand P3:** der TypeScript-Kern erzeugt die XAdES-Signatur selbst (WebCrypto), DSS dient nur noch als Gegenprobe ([Belege P3](belege/P3/README.md)) | V2a: DSS setzt den EPUB-mimetype nicht |
| Validierungsrichtlinie | html-Pro liefert eine DSS-Richtlinie mit, die `application/epub+zip` akzeptiert | V3/V11 mit eigener Richtlinie ohne Warnung |

### 6.2 Dateiendung (Vorschlag, mit offenem Normkonflikt)

- `.hpro` als Endung für die Dateizuordnung des html-Pro-Readers, und **„Als EPUB weitergeben“ =
  dieselben Bytes unter `.epub`**. V7 zeigt: Die Bytes sind identisch, Signatur und EPUB-Gültigkeit
  bleiben erhalten. Die Rückfallebene kostet also keinen Export.
- Weder `.hpro` noch `.epub` erfüllen EN 319 162-1 §4.4.3.1 Nr. 1 (`.asice`/`.sce`). DSS prüft die
  Endung nicht (V7: gleiche Ergebnisse für `.epub`, `.hpro`, `.asice`). epubcheck prüft nur Dateien
  mit Endung `.epub`. Ob ein Prüfdienst oder ein Gericht die Endung beanstandet, ist **OFFENE
  FRAGE**. Dieselbe Spannung besteht beim ODF-Beispiel der Norm selbst, denn ODF-Dateien heißen
  üblicherweise `.odt` und nicht `.asice` (eigene Einordnung).

---

## 7. Nicht geprüft

| Was | Warum nicht | Fehlendes Werkzeug / Nachholen |
|---|---|---|
| **Thorium Reader** (Readium, Electron) | GUI-Anwendung, im Container ohne Bildschirm nicht bedienbar | Thorium ≥ 3.3 auf einem Desktop; `ergebnisse/container/zielformat-2sig.epub` öffnen, Text und Inhaltsverzeichnis prüfen |
| **Apple Books, Adobe Digital Editions, Kobo, Tolino** | Geräte bzw. GUI fehlen | manuell auf Gerät; gleiche Datei |
| **Readium-Toolkits** (go-toolkit, Kotlin, Swift) | go-toolkit ohne Binär-Release, Go-Compiler fehlt | `go install` des Readium-CLI bzw. Testsuite des Mobile-Toolkits |
| **RTR-Prüfdienst**, DSS-Demo-Webapp online | hätte Upload an externe Dienste bedeutet; ohne ausdrückliche Freigabe nicht gemacht | Upload von `zielformat-2sig.epub`; erwartet wird ein Vertrauensfehler wegen des Testzertifikats, interessant ist die Format-Prüfung |
| **Andere ASiC-Validatoren** (DigiDoc4/libdigidocpp, Adobe, Nexus u. a.) | nicht installierbar ohne Systempakete | libdigidocpp aus dem Quellcode im Repo bauen oder unter Windows/macOS testen |
| **Signaturniveaus B-T, B-LT, B-LTA** | kein Zeitstempeldienst, keine Sperrinformationen für das Testzertifikat | DSS mit `OnlineTSPSource` (RFC 3161) und einem Test-QTSP; ändert am Container nichts Grundsätzliches, ASiC-E legt Zeitstempel in die Signatur |
| **Qualifiziertes Zertifikat / QES** | kein QTSP-Zugang | Testzugang A-Trust oder anderer QTSP ([03, 6.4](03-konzept.md#64-empfohlene-nächste-schritte-phase-2)) |
| **Inklusive Kanonisierung**, `ds:Manifest`-Referenzierung | nicht im Zeitrahmen | weitere `sign`-Variante im DSS-Werkzeug |
| **ODF-Gegenprobe** (signiertes `.odt` in DSS) | nicht im Zeitrahmen | LibreOffice-signiertes Dokument mit `dss validate` prüfen, um die Behandlung des ODF-mimetype zu vergleichen |
| **Große Container** (ZIP64, viele Dateien, Schriften, Bilder) | Minimalbeispiel | Container mit 100+ MB und Font-Obfuskation erzeugen |
| **EPUB Accessibility** (Ace by DAISY) | Ace braucht Node und Chromium; nicht Ziel dieses Tests | `npx @daisy/ace` auf `basis.epub` |

---

## 8. Offene Punkte

1. **Endungskonflikt** `.hpro`/`.epub` gegen `.asice` (6.2): bei ETSI ESI bzw. einem Prüfdienst
   nachfragen; juristische Einschätzung zur Beweiskraft.
2. **Fremde Prüfdienste:** Wie reagieren RTR-Prüfdienst, DSS-Demo und DigiDoc auf
   `application/epub+zip`? Die DSS-Warnung ist richtlinienabhängig (V3). Ein strenger Dienst kann
   ablehnen.
3. **EPUB-Reader jenseits von calibre/EbookLib** (Abschnitt 7).
4. **Signaturprüfung ohne Java** (Web, iOS, Android; siehe
   [06, Anmerkung 10](06-plattform-und-funktionsmatrix.md#32-anmerkungen-zur-matrix)): Eine eigene
   XAdES-Prüfung in TypeScript müsste gegen DSS-Ergebnisse dieser Testfälle getestet werden.
   **Stand P2:** umgesetzt im Kern und gegen DSS getestet; alle Container aus Abschnitt 4 und
   22 weitere Fälle mit gleichem Urteil ([Belege P2](belege/P2/README.md)).
   **Stand P3:** auch das Signieren läuft ohne Java im Kern (XAdES-BASELINE-B, Software-Schlüssel
   über WebCrypto, RSA 3072 und ECDSA P-256). Die so signierten Container bestehen epubcheck 5.4.0
   mit 0 Fehlern und 0 Warnungen; DSS 6.5 meldet `TOTAL_PASSED`, nach einer Manipulation
   `HASH_FAILURE` wie die eigene Prüfung ([Belege P3](belege/P3/README.md)).
5. **Darstellung des Signaturstatus** in der EPUB-Rückfallebene ist nicht möglich (V8). Optionen:
   sichtbarer Hinweis im Dokument („Signaturstatus nur im html-Pro-Reader prüfbar“) oder
   PDF/A-Referenzdarstellung.

---

## 9. Aufwand

- **Phase 2 Container-Experiment:** durchgeführt innerhalb eines Arbeitstags, Werkzeugaufbau
  eingeschlossen.
- **Nächste Schritte zum Container** (eigene Schätzung): Prüfung mit Thorium, Apple Books und
  Fremdvalidatoren **0,25–0,5 PM**; B-T/B-LT mit Test-QTSP **0,5–1 PM**; Container-Kern in
  TypeScript (Lesen, Schreiben, Manifest, eigene ZIP-Schreibung, Signatur über DSS-Sidecar oder
  -Dienst) **2–4 PM**. Gesamteinordnung für Phase 3: siehe
  [Nachtrag in 03](03-konzept.md#nachtrag-phase-2).
