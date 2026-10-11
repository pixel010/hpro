# @html-pro/kern – Container-Kern

**Paket:** P1 aus [`docs/08-arbeitsplan.md`](../docs/08-arbeitsplan.md) · **Stand:** 11.10.2026
**Belege:** [`docs/belege/P1/`](../docs/belege/P1/)

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
```

Die beiden epubcheck-Tests brauchen JDK 21 und epubcheck 5.4.0 unter `prototyp/tools/`
(`prototyp/setup-tools.sh`). Fehlen die Werkzeuge, werden diese zwei Tests mit Begründung als
übersprungen gemeldet, nicht als bestanden.

Kommandozeile (nur Node):

```sh
npm run hpro -w kern -- sample beispiel.epub      # Beispieldokument schreiben
node kern/build/bin/hpro.js inspect datei.epub    # Struktur und Hash-Manifest prüfen (Exit 0/1/2)
node kern/build/bin/hpro.js compare a.epub b.epub # Einträge und Hashes zweier Container vergleichen
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

## Adapter-Schnittstellen (nur Typen)

Nach docs/06 §4.1, in [`src/adapters/`](src/adapters/):

| Schnittstelle | Zweck | Entwurfsentscheidung |
|---|---|---|
| `Storage` | öffnen, speichern, App-Bibliothek | `writableInPlace` bildet Ausnahme A4 ab |
| `Signer` | Signaturwert mit einem Plattformschlüssel | bewusst auf `signDigest` beschränkt: XAdES-Aufbau und `signatures.xml` macht der Kern (docs/05 §6.1); ECDSA-Werte in XML-DSig-Form `r‖s` |
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
- Signieren und Signaturprüfung sind nicht Teil von P1 (Pakete P2 und P3); `META-INF/signatures.xml`
  wird beim Lesen geduldet, aber nicht ausgewertet.
