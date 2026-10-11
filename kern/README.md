# @html-pro/kern – Container-Kern

**Pakete:** P1 (Container), P2 (Signaturprüfung), P3 (Signieren) aus [`docs/08-arbeitsplan.md`](../docs/08-arbeitsplan.md) · **Stand:** 11.10.2026
**Belege:** [`docs/belege/P1/`](../docs/belege/P1/), [`docs/belege/P2/`](../docs/belege/P2/), [`docs/belege/P3/`](../docs/belege/P3/README.md)

Der Kern liest und schreibt html-Pro-Container in TypeScript. Er setzt die Regeln um, die der
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
node kern/build/bin/hpro.js validate datei.epub --trust signer.pem [--policy html-pro|dss-default|strict] [--json]
                                                  # Signaturen prüfen (Exit 0 nur bei allen TOTAL_PASSED)
node kern/build/bin/hpro.js keygen key.pem cert.pem [--alg rsa|ec] [--cn NAME]
                                                  # Testschlüssel + selbstsigniertes TESTzertifikat (WebCrypto)
node kern/build/bin/hpro.js sign ein.epub aus.epub --key key.pem --cert cert.pem [--chain ca.pem] [--time ISO] [--only pfad]...
                                                  # XAdES-BASELINE-B-Signatur ergänzen, ohne Java
```

## Containeraufbau

```
mimetype                 erste Datei, Offset 0, unkomprimiert, ohne Extra-Feld, "application/epub+zip"
META-INF/container.xml   OCF, verweist auf package.opf
package.opf              generiertes EPUB-3-Package (Metadaten, alle Dateien, Spine = readingOrder)
manifest.json            html-Pro-Manifest mit SHA-256 je Ressource (maßgeblich)
content/…, data/…        Ressourcen, sortiert nach Pfad
```

| Regel | Umsetzung | Herkunft |
|---|---|---|
| mimetype | Inhalt exakt `application/epub+zip`, Methode 0, kein Extra-Feld, erste Datei | docs/05 §6.1; EPUB 3.3 OCF |
| ZIP-Schreiber | eigener Schreiber ([`src/zip.ts`](src/zip.ts)); Deflate über `CompressionStream('deflate-raw')` | docs/05 §6.1 („DSS setzt den EPUB-mimetype nicht“) |
| Reproduzierbarkeit | alle Einträge mit Zeitstempel `modified` des Dokuments, Unix-Attribute `0644`, feste Reihenfolge, Manifest mit fester Schlüsselreihenfolge | wie `build_container.py` |
| Hash-Manifest | `integrity: "sha256-<base64>"` je Ressource (SRI-Form) | docs/03 §1.3; Prototyp |
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
XAdES (html-Pro-Format) und CAdES (fremde Container) ohne Java, nur mit WebCrypto. Die Urteile
folgen ETSI EN 319 102-1 und sind gegen EU DSS 6.5 abgeglichen: 39 von 39 Fällen, 47 von 47
Signaturen gleich ([`docs/belege/P2/`](../docs/belege/P2/README.md)).

| Modul | Inhalt |
|---|---|
| [`src/validate.ts`](src/validate.ts) | Container lesen (gehärteter ZIP-Leser), Signaturdateien finden (`META-INF/*signatures*.xml`, `*signature*.p7s`), Container-Regeln der DSS-Standardrichtlinie, Richtlinien `html-pro` (Vorgabe), `dss-default`, `strict`, unsignierte Dateien |
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
| `Validator` | Signaturen prüfen | Indikationen nach ETSI EN 319 102-1 wie bei DSS; `policy: 'html-pro' \| 'dss-default' \| 'strict'` (docs/05, V3); `unsignedPaths` (V9) |
| `Scanner` | Papierseiten als Bild | `null` bei Abbruch |
| `Ocr` | Texterkennung je Seitenbild | Konfidenz 0…1, Zeilen und Wörter mit Rahmen |
| `PdfImport` | PDF → Dokument | Ergebnis ist direkt `DocumentInput` für `createContainer` |
| `PdfExport` | Dokument → PDF | Konformität nur mit Prüfergebnis (`checks`), weil WeasyPrint keine Gültigkeit garantiert |

Gemeinsam: `info.location` (`device`, `local-sidecar`, `remote-service`), damit die Oberfläche
zeigen kann, wenn Daten das Gerät verlassen (docs/06 §1.1, Regel 2), und `availability()` mit
Verweis auf die Ausnahmen A1–A13.

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
