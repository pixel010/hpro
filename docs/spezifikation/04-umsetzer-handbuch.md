# hpro 0.1 – Umsetzer-Handbuch (Teil 4: Implementer's Guide)

**Status:** Arbeitsentwurf 0.1 · **Stand:** 12.10.2026 · **Paket:** S7 aus [`docs/08-arbeitsplan.md`](../08-arbeitsplan.md)
**Charakter:** informativ. Normativ sind allein die Teile 0 bis 3; jede Aussage dieses Handbuchs
nennt die Anforderung, die sie erklärt (mechanisch geprüft durch
[`scripts/check-handbuch.mjs`](../../scripts/check-handbuch.mjs), läuft in `npm test`). Bei einem
Widerspruch gilt die Spezifikation. Erzeuger aus Textverarbeitung und CMS lesen zuerst
[Teil 5, den Autorenleitfaden](05-autorenleitfaden.md).
**Beispiele:** Quellen unter [`beispiele/s7-bericht/`](beispiele/s7-bericht/),
[`beispiele/s7-lebendig/`](beispiele/s7-lebendig/), [`beispiele/s7-buero/`](beispiele/s7-buero/);
gebaute Container, Schlüssel-Zertifikate und alle wörtlichen Ausgaben in
[`docs/belege/S7/`](../belege/S7/README.md). Jeder Befehlsblock in diesem Handbuch steht wörtlich in
einer dieser Belegdateien; `…` steht für ausgelassene Zeilen.

---

## 1. Was ein Umsetzer bekommt und was er bauen muss

### 1.1 Die Zusagen hinter dem Format (informativ)

hpro ist ein Austauschformat für Information, die für Bildschirme gemacht ist: die fließende
Darstellung ist die Wahrheit, Papier eine Ausgabe
([docs/10, Anspruch und Funktionsprofil](../10-anspruch-und-funktionsprofil.md), Zusage 1 und 6). Die
Datei darf lebendig sein (Komponenten in einer Sandbox, Zusage 2), tief gegliedert mit stabilen
Adressen statt Seitenzahlen (Zusage 3), als Text bearbeitbar (Zusage 4), signierbar in einer
eingefrorenen Fassung (Zusage 5) und rechnend (Zusage 7). Alles ist aus offenen Standards gebaut:
ZIP nach dem OCF-Muster von EPUB, XHTML, CSS, JSON, XAdES-Signaturen im ASiC-E-Container.

Dieses Handbuch übersetzt die Anforderungen der Teile 0 bis 3 in Bauschritte: Kapitel 2 bis 4 den
Container und seinen Inhalt, Kapitel 5 die Fassungen, Kapitel 6 die Sandbox, Kapitel 7 Sperren,
Kapitel 8 Signaturen, Kapitel 9 das Erzeugen aus einer Anwendung, Kapitel 10 das Lesesystem,
Kapitel 11 das Prüfen. Kapitel 12 nennt die offenen Punkte.

### 1.2 Konformitätsklassen und Werkzeuge

- Wer Dateien schreibt, beansprucht **Erzeuger-Konformität**; wer Dateien anzeigt, prüft oder
  druckt, **Leser-Konformität**; ein Bearbeiter beides plus die Bearbeiter-Anforderungen; die
  Aussage nennt Klasse und Stufe, etwa „hpro 0.1, Erzeuger-Konformität, Stufe Basis“ (Teil 0,
  Abschnitt 16.4).
- Die vier Stufen sind Basis (jedes Dokument), Lebendig (Profil `interactive`), Signiert
  (mindestens eine Signatur) und Archiv (Profil `archive`); Lebendig und Signiert sind unabhängig
  (Teil 0, Abschnitt 1.3).
- Die Referenzimplementierung `@hpro/kern` ([`kern/`](../../kern/README.md)) liest, schreibt,
  signiert und prüft Container; ihre Kommandozeile heißt `hpro` (Container) und `hpro-check`
  (Regelkatalog). Jedes Prüfverfahren in Teil 0 ist so formuliert, dass es auch mit anderen
  Werkzeugen gleicher Fähigkeit ausführbar ist (Teil 0, Abschnitt 18).
- Als unabhängige Gegenproben dienen ein EPUB-3.3-Validator (epubcheck 5.4.0) für die
  Rückfallebene und ein AdES-Validator (EU DSS 6.5) für Signaturen (HP-CONT-017, HP-SIG-012).

Die in den Belegen verwendeten Werkzeuge (die Kurzbefehle `hpro`, `check`, `dss`, `zipcat`,
`ziplist`, `reader` sind in [`scripts/belege-s7.sh`](../../scripts/belege-s7.sh) als Funktionen
definiert; HP-CONT-017 und HP-SIG-012 nennen die Fremdwerkzeuge):

```text beleg:00-werkzeuge.txt
$ node --version
v26.5.1
[Exit-Code 0]

$ python3 --version
Python 3.13.5
[Exit-Code 0]
```

Die Beispiele dieses Handbuchs entstehen aus Quellverzeichnissen mit einer Beschreibungsdatei
(Kapitel 9 erklärt den Bau; HP-CONT-014 verlangt deterministisches Schreiben):

```json aus:docs/spezifikation/beispiele/s7-bericht/dokument.json
{
  "id": "urn:uuid:4e0a9c2d-7b31-4f6e-8a5c-2d9e1f0b3c47",
  "title": "Zustandsbericht Dachstuhl Haus Nr. 12",
  "language": "de-AT",
  "modified": "2026-10-12T06:00:00Z",
  "profile": "static",
```

---

## 2. Der Container

### 2.1 Aufbau und Reihenfolge der Einträge

- Der Container ist ein ZIP-Archiv mit den Methoden 0 (stored) und 8 (deflate), ohne
  Verschlüsselung, ohne ZIP64, ohne Mehrdatenträger (HP-CONT-001).
- Der erste Eintrag ist `mimetype`: Local-Header an Offset 0, Methode 0, Extra-Feld der Länge 0,
  Inhalt exakt `application/epub+zip` ohne Zeilenende (HP-CONT-002).
- Nur die Position von `mimetype` ist vorgeschrieben; die Reihenfolge aller übrigen Einträge ist
  frei, und ein Erzeuger SOLL sie deterministisch wählen (der Kern: `META-INF/container.xml`,
  `package.opf`, `manifest.json`, dann die Ressourcen in Code-Unit-Reihenfolge ihrer Pfade;
  Signaturdateien werden beim Signieren angehängt) (HP-CONT-002, HP-CONT-014, HP-SIG-003).
- ZIP-Zeitstempel SOLLEN aus `dateModified` abgeleitet werden: die UTC-Felder werden ohne
  Umrechnung in Ortszeit in die DOS-Felder geschrieben (Sekunden auf gerade gerundet); das
  Extra-Feld muss nur bei `mimetype` leer sein, andere Einträge dürfen Extra-Felder tragen, doch
  der Prüfer vergleicht die Zeitstempel aller Einträge (HP-CONT-014, HP-CONT-002, HPR-CONT-025).
- Bibliotheks-ZIP-Schreiber (Java `ZipOutputStream`, .NET `ZipArchive`) hängen Extra-Felder an und
  rechnen Zeiten in Ortszeit um; für `mimetype` ist deshalb ein eigener Schreibpfad oder das
  Leeren des Extra-Felds nötig (HP-CONT-002).
- Pfade sind relativ, ohne `.`/`..`, ohne `"*:<>?\` und Steuerzeichen, Segmente höchstens 255 Bytes,
  und nach NFC-Normalisierung und Kleinschreibung eindeutig (HP-CONT-006).
- `mimetype`, `package.opf`, `manifest.json` und `META-INF/` sind reserviert; unter `META-INF/`
  liegen nur `container.xml`, `signatures*.xml`, `manifest.xml`, `metadata.xml`, `rights.xml`
  (HP-CONT-007).
- Die Endung ist `.hpro`; dieselben Bytes dürfen als `.epub` weitergegeben werden, und ein
  Lesesystem erkennt das Format an `mimetype` und `manifest.json`, nie an der Endung (HP-CONT-013,
  HPG-NS-006).

Die Aufteilung, wie der Kern sie schreibt (Kopf von [`kern/src/container.ts`](../../kern/src/container.ts);
HP-CONT-002 bis HP-CONT-005):

```ts aus:kern/src/container.ts
 * Layout (docs/05, section 6.1 and docs/03, Nachtrag N.2):
 *   mimetype                 first entry, stored, no extra field, "application/epub+zip"
 *   META-INF/container.xml   OCF, points to package.opf
 *   package.opf              generated EPUB 3 package for EPUB reading systems
 *   manifest.json            hpro manifest with SHA-256 per resource (authoritative)
 *   content/…, data/…        resources in code-unit order of their paths
```

So liegt das Beispiel `s7-bericht` im ZIP; die Spalten `offset`, `method` und `extra` zeigen die
Bedingungen von HP-CONT-002 am ersten Eintrag, die Hashprüfung die Abdeckung nach HP-CONT-008:

```text beleg:02-container.txt
$ hpro inspect docs/belege/S7/container/s7-bericht.hpro
file: docs/belege/S7/container/s7-bericht.hpro (6397 bytes, sha256=b619860a883e0adaa995e8b8f882cf7091dfe75ac2ff47ff7be7242ac38c0ff6)
mimetype: application/epub+zip
rootfile: package.opf
entries:
  offset  method    stored    size  extra  crc32     name
       0  stored        20      20      0  2cab616f  mimetype
      58  deflated     163     246      0  49e960d3  META-INF/container.xml
     273  deflated     733    2008      0  ee32ca25  package.opf
    1047  deflated     956    2375      0  4753907e  manifest.json
    2046  deflated     326     618      0  2f2bbd6b  attachments/kalibrierschein.pdf
    2433  deflated     451     819      0  2ccffbde  content/anhang.xhtml
    2934  deflated    1183    2700      0  7270f495  content/index.xhtml
    4166  deflated     379     752      0  c4bd6c68  content/media/dachstuhl.svg
    4602  deflated     345     711      0  6dfe1cbc  content/nav.xhtml
    4994  deflated     669    1228      0  19e9a68c  content/styles/document.css
manifest.json integrity:
  ok            attachments/kalibrierschein.pdf  sha256-Dyf4F6iIEkRfp//ECnjbjaytJJ43myPJ2kN1l93F2Jc=
  ok            content/anhang.xhtml  sha256-OvAgL8R+h6vvAqEGY9UG6deQOjQqajCfUrtlAjVYNZY=
  ok            content/index.xhtml  sha256-EoqBTOsa0av5ua4BAFqMZYfOBkkHvJk90Pgkvfyvl3I=
  ok            content/media/dachstuhl.svg  sha256-1V42XZ5A4pHmoT9MNQQ7tQtYi8Zcu9ChYR5YXf/tz3Y=
  ok            content/nav.xhtml  sha256-HpgjfduGCHobL0VrhLHFw9Ofpoc1eQiZU5JHd7OmylA=
  ok            content/styles/document.css  sha256-CNUrsVvzibGC+Fa/XJt/dnocs+yZAevdO/JyAozrB/o=
  ok            package.opf  sha256-0ZX/aKJdYCr95MPxGIFKRhZNlNtG0VGrwCcbyp2CYU8=
result: OK
[Exit-Code 0]
```

Die ersten 64 Bytes der Datei, mit einem fremden Werkzeug gelesen: `PK\003\004`, dann der
Local-Header mit Methode 0 (Bytes 8–9 = `\0 \0`), Namenslänge 8 (`\b`), Extra-Länge 0, der Name
`mimetype` und sofort der Inhalt `application/epub+zip` (HP-CONT-002):

```text beleg:02-container.txt
$ od -A d -c -N 64 docs/belege/S7/container/s7-bericht.hpro
0000000   P   K 003 004  \n  \0  \0  \0  \0  \0  \0   0   L   ]   o   a
0000016 253   , 024  \0  \0  \0 024  \0  \0  \0  \b  \0  \0  \0   m   i
0000032   m   e   t   y   p   e   a   p   p   l   i   c   a   t   i   o
0000048   n   /   e   p   u   b   +   z   i   p   P   K 003 004 024  \0
0000064
[Exit-Code 0]
```

### 2.2 `META-INF/container.xml` und `package.opf`: die EPUB-Rückfallebene

- `META-INF/container.xml` ist das OCF-Verzeichnis, dessen erstes `rootfile` mit
  `media-type="application/oebps-package+xml"` auf `package.opf` an der Wurzel zeigt (HP-CONT-003).
- `package.opf` ist ein gültiges EPUB-3-Package: sein Manifest führt jede Datei außer `mimetype`,
  `package.opf` und `META-INF/*` (also auch `manifest.json`); der Spine enthält die
  `readingOrder` in derselben Reihenfolge; genau ein `item` trägt `properties="nav"` (HP-CONT-004).
- Die Pflichtmetadaten `dc:identifier`, `dc:title`, `dc:language`, `dcterms:modified` stimmen mit
  `id`, `name`, `inLanguage`, `dateModified` aus `manifest.json` überein; bei Widerspruch gilt
  `manifest.json` (HP-META-002, HP-CONT-005).
- Inhaltsdokumente mit Skript, MathML oder inline SVG tragen in `package.opf` die Eigenschaften
  `scripted`, `mathml`, `svg`, sonst meldet ein EPUB-Validator Fehler; Dateien eingefrorener
  Fassungen stehen im Manifest, aber nicht im Spine (HP-CONT-017, HP-CONT-004; offener Punkt in
  Kapitel 12).
- Die ganze Datei muss einen EPUB-3.3-Validator mit 0 Fehlern bestehen; Warnungen sind zulässig
  (HP-CONT-017).

```text beleg:02-container.txt
$ zipcat docs/belege/S7/container/s7-bericht.hpro META-INF/container.xml
<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
[Exit-Code 0]
```

```text beleg:02-container.txt
$ zipcat docs/belege/S7/container/s7-bericht.hpro package.opf
<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="de-AT">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:4e0a9c2d-7b31-4f6e-8a5c-2d9e1f0b3c47</dc:identifier>
    <dc:title>Zustandsbericht Dachstuhl Haus Nr. 12</dc:title>
    <dc:language>de-AT</dc:language>
    <dc:creator>Büro Beispiel Bautechnik</dc:creator>
    <meta property="dcterms:modified">2026-10-12T06:00:00Z</meta>
…
  <manifest>
    <item id="r-attachments_kalibrierschein.pdf" href="attachments/kalibrierschein.pdf" media-type="application/pdf"/>
    <item id="r-content_anhang.xhtml" href="content/anhang.xhtml" media-type="application/xhtml+xml"/>
    <item id="r-content_index.xhtml" href="content/index.xhtml" media-type="application/xhtml+xml"/>
    <item id="r-content_media_dachstuhl.svg" href="content/media/dachstuhl.svg" media-type="image/svg+xml"/>
    <item id="r-content_nav.xhtml" href="content/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="r-content_styles_document.css" href="content/styles/document.css" media-type="text/css"/>
    <item id="r-manifest.json" href="manifest.json" media-type="application/json"/>
  </manifest>
  <spine>
    <itemref idref="r-content_index.xhtml"/>
    <itemref idref="r-content_anhang.xhtml"/>
  </spine>
</package>
[Exit-Code 0]
```

### 2.3 `manifest.json`: das maßgebliche Manifest

- `manifest.json` ist UTF-8-JSON ohne BOM mit einem Objekt als Wurzel; ein Lesesystem liest es als
  einfaches JSON, ohne JSON-LD-Expansion und ohne Abruf der `@context`-URLs (HP-CONT-005,
  HP-META-003).
- Pflichtfelder: `@context` (Liste mit `https://www.w3.org/ns/pub-context` und dem
  hpro-Namensraum `https://hpro.example/ns/v0`), `conformsTo`, `id` (URI, SOLL
  `urn:uuid:`), `name`, `inLanguage` (BCP 47), `dateModified` (`YYYY-MM-DDThh:mm:ssZ`),
  `readingOrder` (nur XHTML, nicht leer), `resources` (HP-META-001).
- `resources` enthält für jede Datei außer `mimetype`, `manifest.json` und `META-INF/*` genau einen
  Eintrag mit `url`, `type` und `integrity` in der Form `sha256-<Base64>` über die unkomprimierten
  Bytes; das schließt `package.opf` ein und gilt auch für Inhaltsdokumente der `readingOrder`
  (HP-CONT-008).
- Die Namensraum-URIs sind Kennungen, keine Abrufadressen; `https://hpro.example` ist bis zur
  Festlegung einer echten Basis ein Platzhalter (HPG-NS-002, HPG-NS-003).
- Unbekannte Schlüssel ignoriert ein Lesesystem; eigene Schlüssel eines Erzeugers tragen den Präfix
  `x-<kennung>-` (HP-META-008, HP-VERS-005).
- Barrierefreiheitsmetadaten SOLLEN in `accessibility` nach EPUB Accessibility 1.1 stehen
  (Soll, der Prüfer warnt bei Fehlen); `accessModeSufficient` ist in JSON eine Liste von Listen
  und wird in `package.opf` je innerer Liste kommagetrennt gespiegelt (`textual,visual`);
  `accessibility.conformsTo` DARF NICHT ohne Prüfbericht `data/accessibility-report.json` gesetzt
  sein, und ein automatischer Erzeuger schreibt nur, was er weiß (etwa kein
  `accessibilityHazard`, wenn er Blitzen oder Bewegung nicht erkennt) (HP-META-004,
  HPR-META-008, HP-META-002).
- `manifest.json` nennt das Navigationsdokument nicht; ein Lesesystem findet es über das
  `item` mit `properties="nav"` in `package.opf` oder, ohne OPF-Parser, als das Inhaltsdokument
  mit `nav epub:type="toc"` (HP-CONT-004, HP-ADR-007).
- Die Formen sind fest: `readingOrder` als Liste von `{url, type}`, `conformsTo` als Zeichenkette,
  `@context` als Liste; die Kurzformen des W3C Publication Manifest (Strings, Objekt) sind nicht
  konform, ein Lesesystem darf sie tolerant lesen, muss es aber nicht (HP-META-001, HPR-META-004,
  HP-VERS-002).

```text beleg:02-container.txt
$ zipcat docs/belege/S7/container/s7-bericht.hpro manifest.json
{
  "@context": [
    "https://www.w3.org/ns/pub-context",
    "https://hpro.example/ns/v0"
  ],
  "conformsTo": "https://hpro.example/spec/0.1/profile/static",
  "id": "urn:uuid:4e0a9c2d-7b31-4f6e-8a5c-2d9e1f0b3c47",
  "name": "Zustandsbericht Dachstuhl Haus Nr. 12",
  "inLanguage": "de-AT",
  "dateModified": "2026-10-12T06:00:00Z",
  "author": [
    {
      "name": "Büro Beispiel Bautechnik"
    }
  ],
  "readingOrder": [
    {
      "url": "content/index.xhtml",
      "type": "application/xhtml+xml"
    },
    {
      "url": "content/anhang.xhtml",
      "type": "application/xhtml+xml"
    }
  ],
  "resources": [
    {
      "url": "attachments/kalibrierschein.pdf",
      "type": "application/pdf",
      "integrity": "sha256-Dyf4F6iIEkRfp//ECnjbjaytJJ43myPJ2kN1l93F2Jc="
    },
…
    {
      "url": "package.opf",
      "type": "application/oebps-package+xml",
      "integrity": "sha256-0ZX/aKJdYCr95MPxGIFKRhZNlNtG0VGrwCcbyp2CYU8="
    }
  ],
  "accessibility": {
    "accessMode": [
      "textual",
      "visual"
    ],
    "accessModeSufficient": [
      [
        "textual"
      ]
    ],
…
  "attachments": [
    {
      "url": "attachments/kalibrierschein.pdf",
      "type": "application/pdf",
      "name": "Kalibrierschein Messgerät Nr. 7"
    }
  ]
}
[Exit-Code 0]
```

### 2.4 Media-Types und Grenzen

- Jede Ressource trägt einen Media-Type; Kernmedientypen, die jedes Lesesystem darstellen muss,
  sind `application/xhtml+xml`, `text/css`, `image/svg+xml`, `image/png`, `image/jpeg`,
  `image/gif`, `image/webp`, `audio/mpeg`, `audio/ogg`, `font/woff2`, `application/json`; Video hat
  keinen Kerntyp und braucht immer ein statisches Äquivalent (HP-CONT-015, HP-INH-013).
- Ein Lesesystem SOLL mindestens 10 000 Einträge, 256 MiB je Datei und 1 GiB Gesamtgröße
  (entpackte Bytes) verarbeiten und SOLL darüber mit einer Meldung abbrechen, die die Grenze
  nennt; ein Lesesystem mit höheren Grenzen bleibt konform (HP-CONT-012, HP-CONT-011).
- Beim Lesen prüft ein Lesesystem CRC-32 jedes Eintrags, lehnt Pfad-Traversal, absolute Pfade,
  Backslashes, Doppeleinträge, Verschlüsselung und ZIP64 ab und bricht das Entpacken ab, sobald
  mehr Bytes entstehen als im Zentralverzeichnis angegeben (HP-CONT-011).
- Kein Eintrag `META-INF/encryption.xml` oder `META-INF/rights.xml` mit Inhalt: Vertraulichkeit
  entsteht nur als CMS-Umschlag um die ganze Datei (`.hpro.p7m`) (HP-CONT-016, HP-LOCK-010).

---

## 3. Inhaltsdokumente und Darstellung

### 3.1 XHTML, Sprache, Text

- Jedes Inhaltsdokument ist wohlgeformtes XML mit Wurzel `html` im XHTML-Namensraum, ohne
  undefinierte Entitäten (`&nbsp;` ist unzulässig, `&#160;` erlaubt) (HP-INH-001).
- Das Wurzelelement trägt `lang` und `xml:lang` mit demselben BCP-47-Tag (HP-INH-002).
- Fließtext steht als Text im DOM in Lesereihenfolge, nicht als Bild oder absolut positionierte
  Zeichen; die DOM-Reihenfolge ist die Lesereihenfolge (HP-INH-011, HP-INH-005).
- Außerhalb des Profils `interactive` gibt es kein `script`, keine `on*`-Attribute, keine
  `javascript:`-URLs, keine SVG-Skripte (HP-INH-012).
- Alle Ressourcenverweise (`link`, `img`, `script`, `source`, `audio`, `video`, `track`, `iframe`,
  `object`, SVG `image`/`use`, CSS `url()`/`@import`) zeigen auf existierende Dateien im Container;
  nur `a[href]` darf nach außen zeigen (HP-CONT-010).

Der Kopf und ein Abschnitt des Beispiels (`xmlns:epub` ist für `epub:type` im Navigationsdokument
und bei Fußnoten nötig; HP-INH-001, HP-INH-002, HP-ADR-001):

```xml aus:docs/spezifikation/beispiele/s7-bericht/content/index.xhtml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="de-AT" lang="de-AT">
<head>
  <meta charset="UTF-8"/>
  <title>Zustandsbericht Dachstuhl Haus Nr. 12</title>
  <link rel="stylesheet" type="text/css" href="styles/document.css"/>
</head>
<body>
  <main id="inhalt">
    <h1 id="titel">Zustandsbericht Dachstuhl Haus Nr. 12</h1>
…
      <section id="messwerte">
        <h3 id="messwerte-h">Messwerte</h3>
        <table id="feuchte-tabelle" data-hp-table="scroll">
          <caption>Holzfeuchte je Sparren</caption>
          <thead><tr><th scope="col">Sparren</th><th scope="col">Lage</th><th scope="col">Holzfeuchte</th></tr></thead>
```

### 3.2 Bildschirm zuerst: Variablen, Reflow, Tabellen

- Schriftgröße, Zeilenhöhe, Buchstaben-, Wort- und Absatzabstand sowie Vorder- und Hintergrundfarbe
  des Fließtexts kommen aus den Lesesystem-Variablen `--hp-font-size`, `--hp-line-height`,
  `--hp-letter-spacing`, `--hp-word-spacing`, `--hp-paragraph-spacing`, `--hp-foreground`,
  `--hp-background`; Autoren-CSS setzt sie nie auf `:root`, sondern nutzt sie mit Rückfall
  `var(--hp-font-size, 1rem)` (HP-INH-004).
- Das Lesesystem setzt diese Variablen aus Nutzereinstellungen (Schrift 100–200 %, Zeilenhöhe
  1,0–2,0, Farbschemata hell, dunkel, hoher Kontrast) (HP-RS-002).
- Bei 320 CSS-Pixeln Breite gibt es kein waagrechtes Scrollen des Fließtexts; nur Tabellen,
  Abbildungen und Codeblöcke dürfen einen eigenen Scrollbereich haben (HP-INH-003).
- Jede Datentabelle nennt mit `data-hp-table` eine Strategie für schmale Breiten: `scroll`
  (Vorgabe), `stack` oder `priority`; das Lesesystem erzeugt für `scroll` einen Scrollbereich, der
  den Fließtext nicht verbreitert (HP-INH-010).
- Blöcke, die zusammenbleiben müssen, tragen `break-inside: avoid`, Überschriften
  `break-after: avoid`; Container Queries sind Viewport-Breakpoints vorzuziehen (HP-INH-016).
- Eingebettete Schriften sind WOFF 2.0, jede `font-family` endet mit einer generischen Familie
  (HP-INH-009).

Das Stylesheet des Beispiels erfüllt HP-INH-004 und HP-INH-016 so:

```css aus:docs/spezifikation/beispiele/s7-bericht/content/styles/document.css
body {
  font-family: sans-serif;
  font-size: var(--hp-font-size, 1rem);
  line-height: var(--hp-line-height, 1.5);
  letter-spacing: var(--hp-letter-spacing, normal);
  word-spacing: var(--hp-word-spacing, normal);
  color: var(--hp-foreground, #111);
  background: var(--hp-background, #fff);
  margin: 0 auto;
  max-width: 40em;
  padding: 1em;
}
p, ul, ol, table, pre, blockquote, figure, details {
  margin-top: var(--hp-paragraph-spacing, 1em);
  margin-bottom: var(--hp-paragraph-spacing, 1em);
}
/* HP-INH-016: Zusammenhalt beim Umbruch (Bildschirm-Spalten und Druck). */
h1, h2, h3, h4, h5, h6 { break-after: avoid; }
table, figure, pre { break-inside: avoid; }
```

### 3.3 Bilder, Medien, Bewegung

- Jedes `img` trägt `alt` (`alt=""` nur dekorativ); informationstragendes SVG trägt `role="img"`
  und einen zugänglichen Namen (HP-INH-006).
- `video` hat ein `poster` aus dem Container und eine Beschreibung, `audio` eine Beschreibung oder
  ein Transkript; Autoplay mit Ton ist verboten (HP-INH-013).
- Bewegte Inhalte halten bei `prefers-reduced-motion: reduce` an oder zeigen ihr statisches
  Äquivalent; Animationen über fünf Sekunden sind anhaltbar (HP-INH-014).
- MathML und inline SVG sind erlaubt; ein Lesesystem stellt SVG dar und MathML oder dessen
  `alttext` (HP-INH-015).

Die SVG-Skizze des Beispiels mit `role="img"` und Titel (HP-INH-006):

```xml aus:docs/spezifikation/beispiele/s7-bericht/content/media/dachstuhl.svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120" width="240" height="120" role="img" aria-labelledby="dachstuhl-titel">
  <title id="dachstuhl-titel">Pfettendach, Nordseite links, betroffene Sparren S 3 und S 4 hervorgehoben</title>
```

Der Konformitätsprüfer auf dem Beispiel: keine Befunde; die vier nicht geprüften Regeln brauchen
eine Browser-Engine (Reflow, SVG-Namen, Bewegung) oder eine Liste redigierter Begriffe, deshalb
bleibt das Urteil `unbestimmt` statt `bestanden` (Teil 1, Abschnitt 2.4, Teil 1, Abschnitt 3.4):

```text beleg:03-pruefer.txt
$ check docs/belege/S7/container/s7-bericht.hpro --json docs/belege/S7/berichte/s7-bericht.json
Prüfbericht s7-bericht.hpro (6397 Bytes, sha256 b619860a883e0ada…), Katalog Teil 1 v0.1 (156 Regeln), hpro-check (hpro Konformitätsprüfer) 0.1.0
Beanspruchte Stufen: Basis
NICHT GEPRÜFT HPR-INH-004: missing-means (keine Browser-Engine im Prüfer angebunden (Mittel rendering))
NICHT GEPRÜFT HPR-INH-006: missing-means (keine Browser-Engine im Prüfer angebunden (Mittel rendering))
NICHT GEPRÜFT HPR-INH-022: missing-means (keine Browser-Engine im Prüfer angebunden (Mittel rendering))
NICHT GEPRÜFT HPR-LOCK-005: missing-means (keine Liste redigierter Begriffe übergeben (--redacted))
Befunde: 0 fatal, 0 Fehler, 0 Warnungen, 0 Hinweise, 4 nicht geprüft
Stufe Basis: unbestimmt
Berichtsschema: gültig
[Exit-Code 3]
```

---

## 4. Adressierung, Navigation und verschachtelte Information

### 4.1 Adressen statt Seitenzahlen

- Jedes `section`, `article`, `aside`, `nav`, `h1`–`h6`, `table`, `figure`, `pre`, `details`,
  `form` und jedes Element mit `data-hp-priority` trägt ein `id` (HP-ADR-001).
- Kennungen folgen `^[A-Za-z][A-Za-z0-9_.-]*$`, sind höchstens 64 Zeichen lang und je
  Inhaltsdokument eindeutig (HP-ADR-002).
- Die Adresse eines Abschnitts ist `pfad#kennung` mit dem Containerpfad; die zitierfähige Langform
  ist `<manifest.id>!/<pfad>#<kennung>`; ein Lesesystem bietet beide zum Kopieren an (HP-ADR-003).
- Ein Bearbeiter ändert Kennungen bestehender Abschnitte nicht und vergibt gelöschte nicht neu
  (HP-ADR-004).
- Ein Lesesystem löst eine Adresse unabhängig von Breite, Schrift und Gerät auf, scrollt hin und
  klappt umgebende `details` auf; als Rückfall kann es Textfragmente (`#:~:text=`) nutzen
  (HP-ADR-005, HP-ADR-006).
- Zellen einer Tabelle können als `<tabellen-kennung>.<Spalte><Zeile>` adressiert werden, und ein
  `a` mit `data-hp-ref="value"` zeigt den gespeicherten Zellwert; die Zielzelle trägt die Adresse
  als `id`, sonst ist der Verweis in der EPUB-Rückfallebene ungültig (HP-ADR-008, HP-CONT-017).
- Ein Abschnitt hat zwei Kennungen, weil `section` und seine Überschrift beide adressierbar
  sind: das Navigationsdokument verweist auf die `section`, der Ausdruck druckt die Kennung der
  Überschrift neben ihrem Text; beide Adressen bleiben gültig, Zitate nutzen die der `section`
  (HP-ADR-001, HP-ADR-007, HP-PRINT-004).
- Die Langform `<manifest.id>!/<pfad>#<kennung>` wird am letzten `!/` getrennt; weil `id` SOLL
  `urn:uuid:` sein, enthält sie dann weder `!` noch `#`; ein Lesesystem löst eine Langform nur für
  das geöffnete Dokument (gleiche `id`) auf, für andere Dokumente zeigt es die Kennung an
  (HP-ADR-003, HP-META-001).

Der minimale Leser des Prüfsteins ([`pruefstein/min_reader.py`](../../pruefstein/min_reader.py))
gibt je Inhaltsdokument die Abschnitte mit Adresse und Überschriftentext aus (HP-ADR-003,
Teil 0, Abschnitt 17.2):

```text beleg:08-lesesystem.txt
$ reader docs/belege/S7/container/s7-bericht.hpro
Datei: docs/belege/S7/container/s7-bericht.hpro
Metadaten:
  id: urn:uuid:4e0a9c2d-7b31-4f6e-8a5c-2d9e1f0b3c47
  name: Zustandsbericht Dachstuhl Haus Nr. 12
  inLanguage: de-AT
  dateModified: 2026-10-12T06:00:00Z
  conformsTo: https://hpro.example/spec/0.1/profile/static
Lesereihenfolge:
  1. content/index.xhtml
  2. content/anhang.xhtml
Abschnitte:
  [content/index.xhtml]
    content/index.xhtml#titel  <h1>  Zustandsbericht Dachstuhl Haus Nr. 12
    content/index.xhtml#befund  <section>  Befund
    content/index.xhtml#befund-h  <h2>  Befund
    content/index.xhtml#feuchte  <section>  Feuchteschäden
    content/index.xhtml#feuchte-h  <h3>  Feuchteschäden
    content/index.xhtml#skizze  <figure>  Lage der betroffenen Sparren
    content/index.xhtml#messwerte  <section>  Messwerte
    content/index.xhtml#messwerte-h  <h3>  Messwerte
    content/index.xhtml#feuchte-tabelle  <table>  Holzfeuchte je Sparren
    content/index.xhtml#messmethode  <details>  Messmethode
    content/index.xhtml#empfehlung  <section>  Empfehlung
    content/index.xhtml#empfehlung-h  <h2>  Empfehlung
    content/index.xhtml#hinweis  <aside>
  [content/anhang.xhtml]
    content/anhang.xhtml#protokoll  <section>  Anhang: Messprotokoll
    content/anhang.xhtml#protokoll-h  <h1>  Anhang: Messprotokoll
    content/anhang.xhtml#protokoll-roh  <pre>
…
Hashprüfung:
  geprüft: 7 Ressourcen
  Ergebnis: OK
Exit-Code: 0
[Exit-Code 0]
```

### 4.2 Das Navigationsdokument

- Das Navigationsdokument ist ein XHTML-Dokument mit `nav epub:type="toc"`; seine `href` werden
  relativ zum Navigationsdokument aufgelöst und ergeben Adressen nach HP-ADR-003, deren Ziel
  existiert; es nennt jedes `section`/`article` der obersten Ebene jedes Inhaltsdokuments
  (HP-ADR-007).
- In `package.opf` trägt es `properties="nav"`; es steht nicht in der `readingOrder` und nicht
  im Spine, und sein Text gehört nicht zum Fließtext (HP-CONT-004, Teil 0, Abschnitt 17.2).
- Das Navigationsdokument ist selbst ein Inhaltsdokument: `nav` und seine Überschrift tragen
  Kennungen (HP-ADR-001).
- Aus dem Navigationsdokument erzeugt der Druckweg das Inhaltsverzeichnis mit Seitenzahlen
  (HP-PRINT-005).

```text beleg:02-container.txt
$ zipcat docs/belege/S7/container/s7-bericht.hpro content/nav.xhtml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="de-AT" lang="de-AT">
<head>
  <meta charset="UTF-8"/>
  <title>Inhalt</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1 id="toc-h">Inhalt</h1>
    <ol>
      <li><a href="index.xhtml#befund">Befund</a>
        <ol>
          <li><a href="index.xhtml#feuchte">Feuchteschäden</a></li>
          <li><a href="index.xhtml#messwerte">Messwerte</a></li>
        </ol>
      </li>
      <li><a href="index.xhtml#empfehlung">Empfehlung</a></li>
      <li><a href="anhang.xhtml#protokoll">Anhang: Messprotokoll</a></li>
    </ol>
  </nav>
</body>
</html>
[Exit-Code 0]
```

### 4.3 Aufklappen, Detailtiefe, Anhänge, Unterdokumente

- Aufklappbare Abschnitte sind `details`/`summary`, ihr Inhalt liegt vollständig im DOM und wird
  von der Volltextsuche gefunden (HP-NEST-001, HP-RS-003).
- `data-hp-priority` mit `1`, `2`, `3` gibt Blöcken eine Detailtiefe; Priorität 3 wird auf
  schmalen Breiten eingeklappt, nie entfernt, und im Ausdruck gezeigt; was „schmal“ und
  „mittel“ in Pixeln heißt, legt die Spezifikation nicht fest, das Lesesystem wählt die Grenzen
  (Kapitel 12) (HP-NEST-002, HP-PRINT-010).
- Für Tabellen mit `data-hp-table="priority"` tragen die Spalten (`th` oder `col`) das Attribut
  `data-hp-priority` und damit ein `id`; `stack` stellt jede Zeile als Karte dar, die Beschriftung
  je Zelle kommt aus der Kopfzelle (HP-INH-010, HP-ADR-001).
- Anhänge liegen im Container (Vorgabe `attachments/`) und stehen in `manifest.json#attachments`
  mit `url`, `type`, `name`; ein `.hpro`-Anhang öffnet sich als eingebettetes Dokument mit getrennt
  geprüften Signaturen (HP-NEST-003, HP-NEST-004).
- Unterdokumente im Fluss (`iframe`, `object`) sind Inhaltsdokumente desselben Containers und in
  `readingOrder` oder `resources` verzeichnet (HP-NEST-004).
- Das Öffnen eines Anhangs mit dem Systemprogramm ist keine Übertragung an einen Dienst, braucht
  also keinen Dienst-Hinweis, wohl aber eine Rückfrage wie bei externen Links; ein eingebettetes
  `.hpro` wird erst beim Öffnen gelesen, mit eigener Hash- und Signaturprüfung, eine
  Rekursionstiefe ist nicht festgelegt (HP-NEST-003, HP-RS-008, HP-RS-009).
- Inhaltsdokumente über 2 000 Wörter sollen mit einem Überblick (`section` mit
  `data-hp-role="summary"`) beginnen (HP-NEST-005).

Im Beispiel: ein `details`-Block, ein `aside` mit Priorität 3 und der Anhang aus Kapitel 2.3
(HP-NEST-001, HP-NEST-002, HP-NEST-003):

```xml aus:docs/spezifikation/beispiele/s7-bericht/content/index.xhtml
        <details id="messmethode">
          <summary>Messmethode</summary>
          <p id="messmethode-text">Widerstandsmessung mit Einschlagelektroden, 25 mm Tiefe,
            temperaturkorrigiert.</p>
        </details>
…
      <aside id="hinweis" data-hp-priority="3">
```

---

## 5. Profile und Fassungen

### 5.1 Die vier Profile

- `manifest.json#conformsTo` nennt genau einen Profilpfad
  `https://hpro.example/spec/0.1/profile/{static|interactive|signed|archive}`; die
  Spezifikationsversion steht im Pfad (HP-PROF-001, HP-VERS-001).
- `static`, `signed`, `archive`: keine Dateien unter `components/`, keine Skripte; `interactive`:
  nur deklarierte Komponenten (HP-PROF-002, HP-PROF-003).
- `signed` verlangt mindestens eine Signatur über alle Dateien der Fassung; `archive` zusätzlich
  eingebettete Schriften oder generische Familien, nur Kernmedientypen, statische Äquivalente,
  keine externen Links als einzige Quelle und Signaturniveau B-LT (HP-PROF-004, HP-PROF-005,
  HP-SIG-011).
- Ein Lesesystem höherer Nebenversion öffnet Dokumente derselben Hauptversion; unbekannte
  Schlüssel und `data-hp-*`-Attribute werden ignoriert (HP-VERS-002).

### 5.2 Eingefrorene Fassungen unter `renditions/<id>/`

- Eine eingefrorene Fassung liegt vollständig unter `renditions/<id>/` mit eigenem `manifest.json`
  gleicher Struktur (Pfade relativ zur Containerwurzel) und steht in `manifest.json#renditions`
  mit `id`, `role: "frozen"`, `url`, `createdAt` (HP-PROF-006).
- Sie ist in sich geschlossen: alle Verweise zeigen unter `renditions/<id>/`; Profil `static`,
  `signed` oder `archive`; Komponenten sind durch ihr statisches Äquivalent ersetzt; Formelzellen
  tragen den berechneten Wert; das Manifest nennt `computedAt` und `calculator` (HP-PROF-007).
- Ihr Manifest SOLL `derivedFrom` mit `integrity` des Hauptmanifests zum Zeitpunkt des Einfrierens
  und `method` (`author` oder `render`) tragen (HP-PROF-011).
- Das Einfrieren folgt sieben Schritten: Werte festschreiben, Komponenten durch `div`/`span` mit
  `data-hp-frozen="<name>"` ersetzen, Medien belassen, Dateien kopieren und Verweise umschreiben,
  Fassungsmanifest schreiben, Hauptmanifest und `package.opf` ergänzen, optional signieren
  (Teil 1, Abschnitt 7.3).
- Die Dateien der Fassung stehen in `package.opf` als `item`, aber nicht im Spine; in den
  `resources` der Hauptfassung stehen sie nicht (HP-CONT-004, HPR-CONT-017).

Der Bauschritt aus [`scripts/s7-beispiele.mjs`](../../scripts/s7-beispiele.mjs): Komponente
ersetzen, Signaturhinweis und Inhaltsverzeichnis einfügen (HP-PROF-007, HP-PROF-013):

```js aus:scripts/s7-beispiele.mjs
  let index = text(get('content/index.xhtml'))
    .replace(/\n  <script src="[^"]*"><\/script>/, '')
    .replace(/<x-baubuero-aufmass id="([^"]*)"[^>]*>/, '<div data-hp-frozen="x-baubuero-aufmass" id="$1">')
    .replace('</x-baubuero-aufmass>', '</div>')
```

Das Fassungsmanifest des Beispiels `s7-fassungen` (HP-PROF-006, HP-PROF-007, HP-PROF-011):

```text beleg:02-container.txt
$ zipcat docs/belege/S7/container/s7-fassungen.hpro renditions/nachweis-2026-10-12/manifest.json
{
  "@context": [
    "https://www.w3.org/ns/pub-context",
    "https://hpro.example/ns/v0"
  ],
  "conformsTo": "https://hpro.example/spec/0.1/profile/signed",
  "id": "urn:uuid:c2d4e6f8-0a1b-4c3d-9e5f-7a8b9c0d1e2f",
  "name": "Aufmaß Dachsanierung Haus Nr. 12 (Nachweis)",
  "inLanguage": "de-AT",
  "dateModified": "2026-10-12T06:30:00Z",
  "readingOrder": [
    {
      "url": "renditions/nachweis-2026-10-12/content/index.xhtml",
      "type": "application/xhtml+xml"
    }
  ],
…
  "derivedFrom": {
    "integrity": "sha256-bbskQQ8W92i1ehFTBvMisdWeEQNzmC4XksMEybHVTF8=",
    "method": "author"
  },
  "computedAt": "2026-10-12T06:25:00Z",
  "calculator": {
    "name": "x-baubuero-aufmass",
    "version": "1.0.0"
  },
```

Vor dem Signieren meldet der Prüfer für die Fassung mit Profil `signed` die fehlende Signatur und
für die Rückfallebene `RSC-011`, weil das Fassungsdokument nicht im Spine steht; der zweite Befund
ist ein bekannter Widerspruch der Spezifikation (HP-PROF-004, HP-CONT-017; Änderungsantrag
HPC-0003 in Kapitel 12):

```text beleg:03-pruefer.txt
$ check docs/belege/S7/container/s7-fassungen.hpro --no-not-checked
Prüfbericht s7-fassungen.hpro (11292 Bytes, sha256 edf8ca1d7945ef53…), Katalog Teil 1 v0.1 (156 Regeln), hpro-check (hpro Konformitätsprüfer) 0.1.0
Beanspruchte Stufen: Basis, Lebendig, Signiert
FEHLER HPR-PROF-004 [nachweis-2026-10-12] fassung=nachweis-2026-10-12: Fassung nachweis-2026-10-12 hat Profil signed, aber keine zugeordnete Signatur.
FEHLER HPR-CONT-024 epubcheck 5.4.0:RSC-011: EPUB-Validator RSC-011 bei renditions/nachweis-2026-10-12/content/index.xhtml:13: Found a reference to a resource that is not a spine item..
Befunde: 0 fatal, 2 Fehler, 0 Warnungen, 0 Hinweise, 7 nicht geprüft
```

---

## 6. Lebendige Inhalte und die Sandbox

### 6.1 Was ein lebendiges Dokument enthält

- Jede Komponente steht in `manifest.json#components` mit `name` (Custom-Element-Name mit Präfix
  `hp-` für Komponenten des Standards oder `x-<kennung>-` für Dritte), `version` (SemVer), `url`
  unter `components/<name>@<version>/` und `integrity` über die Skriptdatei (HP-SBX-001,
  HP-VERS-005).
- Skripte werden nur als `<script src>` aus `components/` geladen: kein Inline-Skript, keine
  `on*`-Attribute, keine `javascript:`-URLs, keine SVG-Skripte (HP-SBX-002).
- Ein klassisches Skript, nicht `type="module"`: der EPUB-Validator 5.4.0 zählt Modulskripte nicht
  als Skript und meldet die Eigenschaft `scripted` als überflüssig (HP-CONT-017; Befund in
  [`docs/belege/S3/README.md`](../belege/S3/README.md)).
- Jedes Komponenten-Element ist ein deklariertes Custom Element und enthält im Lichtbaum ein
  statisches Äquivalent, das ohne Skript die zuletzt gespeicherten Werte zeigt (HP-SBX-003,
  HP-SBX-004).
- Komponenten verändern nichts außerhalb ihres Elements, setzen keinen Fokus ohne Nutzeraktion und
  sind mit Tastatur bedienbar; kein Ton ohne Nutzeraktion, Bewegung respektiert
  `prefers-reduced-motion` (HP-SBX-017, HP-SBX-014).
- Formulare haben kein `action` oder `action="#"`; Eingaben landen in `data/` (HP-SBX-013).
- Datendateien stehen in `manifest.json#data` mit `url` unter `data/` und optional `schema`; die
  Datei ist gegen ihr Schema gültig, und das Schema hat keine `$ref` nach außen (HP-SBX-008,
  HPR-SBX-018).
- `hp` ist reserviert; eigene Namen eines Anbieters (`x-baubuero-aufmass`,
  `data-x-baubuero-data`) gehören zu einer Kennung, die in `manifest.json#extensions` deklariert
  wird (HP-VERS-005, HP-VERS-004, HPG-EXT-003).

Das Komponenten-Element im Beispiel `s7-lebendig`; die Tabelle darin ist das statische Äquivalent,
die Formelzellen tragen Formel und Wert (HP-SBX-004, HP-SBX-016):

```xml aus:docs/spezifikation/beispiele/s7-lebendig/content/index.xhtml
  <script src="../components/x-baubuero-aufmass@1.0.0/x-baubuero-aufmass.js"></script>
…
      <x-baubuero-aufmass id="aufmass-komponente" data-x-baubuero-data="data/aufmass.json">
        <table id="positionen" data-hp-table="scroll">
          <caption>Aufmaß und Beträge</caption>
```

Die Deklarationen im Manifest (HP-SBX-001, HP-SBX-008, HP-VERS-004):

```text beleg:02-container.txt
$ zipcat docs/belege/S7/container/s7-lebendig.hpro manifest.json
{
…
  "components": [
    {
      "name": "x-baubuero-aufmass",
      "version": "1.0.0",
      "url": "components/x-baubuero-aufmass@1.0.0/x-baubuero-aufmass.js",
      "integrity": "sha256-CBwy8N+O9vi92cxhPeCcgVRq89Q729DT78weLUqEhPg="
    }
  ],
  "data": [
    {
      "url": "data/aufmass.json",
      "schema": "data/aufmass.schema.json"
    }
  ],
  "extensions": [
    {
      "id": "https://baubuero.example.org/ns/hp-ext/baubuero",
      "dir": "baubuero",
      "required": false,
      "url": "https://baubuero.example.org/hp-ext/aufmass/1.0/"
    }
  ]
}
[Exit-Code 0]
```

### 6.2 Was eine Komponente darf und was nicht

- Kein Speichern außerhalb des Dokuments: `localStorage`, `sessionStorage`, IndexedDB, Cache
  Storage, Cookies, `BroadcastChannel` sind tabu; Zustand liegt nur in `data/` (HP-SBX-007).
- Kein Netz: `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `new Image().src`, `@import` nach
  außen schlagen fehl; das Lesesystem erzwingt das per CSP, der Prüfer findet die naheliegenden
  Verstöße schon im Quelltext (HP-SBX-006, HPR-SBX-016).
- Kein Nachladen: jeder `import` zeigt auf eine deklarierte Komponente derselben Fassung;
  `new Worker`, `importScripts`, erzeugte `script`-Elemente sind Befunde (HPR-SBX-017).
- Keine Brücke zur Hülle: `window.__TAURI__`, `window.ipc`, `require`, `process` sind nicht
  erreichbar (HP-SBX-009).
- Eine Komponente, die den Hauptthread länger als 5 Sekunden blockiert, wird beendet; das statische
  Äquivalent bleibt sichtbar (HP-SBX-015).

Die Beispielkomponente nutzt nur DOM-Zugriffe innerhalb ihres Elements und den Datenkanal; sie
setzt `tabIndex` auf ihre Eingabezellen und lässt `data-hp-formula` unangetastet (HP-SBX-017,
HP-SBX-016):

```js aus:docs/spezifikation/beispiele/s7-lebendig/components/x-baubuero-aufmass@1.0.0/x-baubuero-aufmass.js
    setEditable(on) {
      var cells = this.querySelectorAll('td[data-hp-input="true"]');
      for (var i = 0; i < cells.length; i++) {
        cells[i].contentEditable = on ? 'true' : 'false';
        cells[i].tabIndex = 0; // HP-SBX-017: every control reachable by keyboard
      }
    }
```

Der Prüfer auf dem lebendigen Beispiel: Stufe Lebendig ohne Befund; die neun nicht geprüften Regeln
sind die Rendering-Regeln beider Stufen (HP-PROF-003, HP-SBX-001 bis HP-SBX-004):

```text beleg:03-pruefer.txt
$ check docs/belege/S7/container/s7-lebendig.hpro --json docs/belege/S7/berichte/s7-lebendig.json
Prüfbericht s7-lebendig.hpro (7395 Bytes, sha256 15e858de82be04ed…), Katalog Teil 1 v0.1 (156 Regeln), hpro-check (hpro Konformitätsprüfer) 0.1.0
Beanspruchte Stufen: Basis, Lebendig
…
Befunde: 0 fatal, 0 Fehler, 0 Warnungen, 0 Hinweise, 7 nicht geprüft
Stufe Basis: unbestimmt
Stufe Lebendig: unbestimmt
Berichtsschema: gültig
[Exit-Code 3]
```

### 6.3 Der Dokumentdaten-Kanal

- Komponenten lesen und schreiben Dokumentdaten ausschließlich über `postMessage` an das
  Lesesystem; das Lesesystem begrenzt Schreibzugriffe auf deklarierte Pfade unter `data/`,
  validiert gegen das Schema und behandelt jede Änderung als Dokumentänderung mit neuem
  `integrity` (HP-SBX-008).
- Nachrichten: `ready` (Lesesystem → Komponente, einmal, mit `spec`, `readOnly`, `reducedMotion`,
  `data`), `state.get`, `state.set`, `state.subscribe` (Komponente → Lesesystem, je mit `id` und
  `path`), `state.result` und `state.changed` (Lesesystem → Komponente); alle tragen `hp` mit dem
  Nachrichtennamen (Teil 1, Abschnitt 8.2).
- Fehlercodes des Lesesystems: `bad-request`, `unknown-message`, `path-invalid`,
  `path-not-declared`, `schema-invalid`, `too-large` (über 1 MiB), `read-only`, `rate-limited`
  (über 100 Nachrichten je Sekunde) (Teil 1, Abschnitt 8.3).
- Eine Komponente liest nach `ready` zuerst, nimmt nie an, dass `state.set` gelingt, und sperrt bei
  `read-only` ihre Eingabefelder (Teil 1, Abschnitt 8.4).
- Das Lesesystem nimmt Nachrichten nur von `event.source === dokumentRahmen.contentWindow` an;
  die Komponente sendet mit `targetOrigin "*"`, weil der Rahmen eine opake Origin hat (Teil 1,
  Abschnitt 8.1).

Der Kanal in der Beispielkomponente (Teil 1, Abschnitt 8.2 und Teil 1, Abschnitt 8.4):

```js aus:docs/spezifikation/beispiele/s7-lebendig/components/x-baubuero-aufmass@1.0.0/x-baubuero-aufmass.js
  function send(message, callback) {
    message.id = 'aufmass-' + (++seq);
    if (callback) pending[message.id] = callback;
    parent.postMessage(message, '*');
  }
…
    // Reading system → component: `ready` (8.2). Read before writing (8.4).
    start(ready) {
      var self = this;
      this.readOnly = !!ready.readOnly || ready.data.indexOf(this.path) < 0;
      if (!this.readOnly) {
        send({ hp: 'state.get', path: this.path }, function (result) {
          if (result.ok && result.value) self.apply(result.value);
        });
        send({ hp: 'state.subscribe', path: this.path }, function () {});
      }
      this.setEditable(!this.readOnly);
    }
```

Die Schreibweise `parent.postMessage` ist Absicht: Teil 1, Abschnitt 8.1 spricht von
`window.parent`, aber der Vorfilter HPR-SBX-016 meldet genau diesen Eigenschaftszugriff als
Hüllenzugriff; der Widerspruch ist als Änderungsantrag HPC-0004 eingereicht (Kapitel 12). Der
Versuch mit `window.parent.postMessage` (HPR-SBX-016):

```text beleg:03-pruefer.txt
$ check prototyp/out/s7/versuch-window-parent.hpro --no-epubcheck --no-not-checked
Prüfbericht versuch-window-parent.hpro (7399 Bytes, sha256 447aa6b20e3c8e6a…), Katalog Teil 1 v0.1 (156 Regeln), hpro-check (hpro Konformitätsprüfer) 0.1.0
Beanspruchte Stufen: Basis, Lebendig
FEHLER HPR-SBX-016 components/x-baubuero-aufmass@1.0.0/x-baubuero-aufmass.js:22: components/x-baubuero-aufmass@1.0.0/x-baubuero-aufmass.js:22: Komponente x-baubuero-aufmass@1.0.0 verwendet `window.parent`; Speichern außerhalb des Dokuments, Netzzugriff und Hüllenzugriff sind unzulässig.
Befunde: 0 fatal, 1 Fehler, 0 Warnungen, 0 Hinweise, 9 nicht geprüft
Stufe Basis: unbestimmt
Stufe Lebendig: nicht bestanden
Berichtsschema: gültig
[Exit-Code 1]
```

### 6.4 Was das Lesesystem erzwingt

- Der Dokumentinhalt läuft in einem `iframe` mit `sandbox`, das höchstens `allow-scripts` enthält;
  nie `allow-same-origin`, `allow-top-navigation`, `allow-popups`, `allow-modals`, `allow-forms`,
  `allow-downloads`, `allow-pointer-lock` (HP-SBX-005, HPL-SBX-001).
- Der Rahmen bekommt eine Content Security Policy: `default-src 'none'`, `connect-src 'none'`,
  `form-action 'none'`, `base-uri 'none'`, `script-src` nur die `sha256-…`-Hashes der deklarierten
  Komponenten, `img-src`/`media-src`/`font-src`/`style-src`/`frame-src` nur die Containerquelle
  (HP-SBX-006, HPL-SBX-002).
- Kein `allow`-Attribut (Permissions Policy) mit Berechtigungen; Kamera, Standort, Zwischenablage
  gehören dem Lesesystem (HPL-SBX-004).
- Vor dem Ausführen vergleicht das Lesesystem den SHA-256 der Skriptdatei mit `integrity`; bei
  Abweichung, fehlender oder unbekannter Komponente zeigt es das statische Äquivalent mit
  Kennzeichnung (HP-SBX-010, HP-SBX-011).
- Es darf eine eigene Kopie derselben Komponentenversion ausführen, wenn deren Hash übereinstimmt
  (HP-SBX-012).
- Im Profil `static` und in eingefrorenen Fassungen führt es nie Skript aus, auch wenn das Dokument
  regelwidrig welches enthält (HPL-SBX-012).
- Externe Hyperlinks öffnen außerhalb des Rahmens erst nach Anzeige der Ziel-URL (HP-RS-009).
- Ein Lesesystem, das keine Komponenten ausführt, zeigt lebendige Dokumente mit ihren statischen
  Äquivalenten und der Kennzeichnung „Komponente nicht ausgeführt“ an und beansprucht nur die
  Stufen Basis und Signiert; Stufe Lebendig verlangt den Datenkanal einschließlich `state.set`
  mit Speichern als Dokumentänderung (HP-SBX-011, HP-SBX-008, Teil 0, Abschnitt 1.3).
- Im Profil `static` genügt `sandbox=""` ohne `allow-scripts`; `allow-scripts` kommt nur im
  Profil `interactive` hinzu (HP-SBX-005, HPL-SBX-012).

Die Containerquelle: Das Lesesystem liefert die Einträge des Containers unter einer eigenen
Scheme-Origin aus (Desktop-Hüllen: eigener Scheme-Handler wie `hpro://<dokument>/<pfad>`, der die
Bytes samt Content-Security-Policy-Antwortkopf liefert; im Browser ein Service Worker mit
derselben Rolle), damit relative Verweise wie `styles/document.css` oder `anhang.xhtml#protokoll`
normal aufgelöst werden; `blob:`-URLs taugen dafür nicht, weil relative Verweise darunter nicht
auflösen, und das `csp`-Attribut am `iframe` wird von den Engines nicht mehr unterstützt
(HP-SBX-006, HPL-SBX-002, HP-CONT-010). Ein Rahmen, der HP-SBX-005 erfüllt, und der Antwortkopf,
der HP-SBX-006 erfüllt (die Hashes stammen aus `manifest.json#components`):

```html
<iframe sandbox="allow-scripts" src="hpro://4e0a9c2d/content/index.xhtml"></iframe>
```

```http
Content-Security-Policy: default-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; script-src 'sha256-CBwy8N+O9vi92cxhPeCcgVRq89Q729DT78weLUqEhPg='; img-src hpro:; media-src hpro:; font-src hpro:; style-src hpro:; frame-src hpro:
```

Maßgeblich ist das beobachtbare Ergebnis: null ausgehende Verbindungen im Netzwerkmitschnitt
(HPL-SBX-003). Dieses Handbuch hat kein Lesesystem gerendert; die Lesesystemregeln sind damit
beschrieben, aber in diesem Paket nicht geprüft (Kapitel 12).

---

## 7. Sperren, Rechte und Redaktion

- Sperren stehen in `manifest.json#access` als Liste von `{ "target": "pfad#kennung", "rules": [...] }`
  mit den Regeln `read-only`, `no-print`, `no-export`, `hidden`; andere Regelwörter nur mit
  Präfix `x-<kennung>-` (HP-LOCK-001).
- Ein Bearbeiter lehnt Änderungen an `read-only`-Zielen mit Hinweis ab; ein Lesesystem lässt
  `no-print` beim Drucken und `no-export` beim Export aus und setzt den Hinweis „Abschnitt
  <kennung> nicht zum Druck freigegeben“ (HP-LOCK-002, HP-LOCK-003, HP-LOCK-004).
- `hidden` blendet aus, kennzeichnet aber sichtbar, dass ausgeblendete Abschnitte vorhanden sind,
  und ist keine Vertraulichkeitsmaßnahme (HP-LOCK-005).
- Beweiswert haben Sperren nur, wenn eine gültige Signatur sie abdeckt; das Lesesystem nennt sie
  nur dann „nachweisbar“ (HP-LOCK-006).
- Kopieren und Auswählen von Text ist immer erlaubt; eine Regel „nicht kopieren“ gibt es nicht
  (HP-LOCK-009).
- `target` darf auch ein Pfad sein; dann gilt die Regel für die ganze Datei (ein Inhaltsdokument
  samt seiner Einträge im Navigationsdokument, ein Medium, ein Anhang), und der Hinweis nennt den
  Pfad statt der Kennung (HP-LOCK-001, HP-LOCK-003, HP-LOCK-005).
- Die Hinweistexte der Spezifikation sind deutsch zitiert; ob ein Lesesystem sie in seine
  Oberflächensprache übersetzen darf, ist nicht festgelegt (Kapitel 12) (HP-LOCK-003).
- Redaktion löscht: der Inhalt ist in keinem Eintrag mehr vorhanden; `data/redaction-log.json`
  erhält einen Eintrag mit `target`, `at`, optional `reason` und `actor`; an der Stelle steht
  `<span data-hp-redacted="" role="img" aria-label="geschwärzt"></span>` (HP-LOCK-007, HP-LOCK-008).
- Enthält eine signierte eingefrorene Fassung den Inhalt, wird die ganze Fassung samt Signatur
  entfernt und das im Protokoll vermerkt (Teil 1, Abschnitt 7.4).

Die Testsuite enthält je einen Gutfall; das Redaktionsprotokoll daraus (HP-LOCK-008):

```text beleg:03-pruefer.txt
$ zipcat testsuite/dokumente/gut-lock-redaktion.hpro data/redaction-log.json
[
  {
    "target": "content/index.xhtml#r1",
    "at": "2026-10-11T07:00:00Z",
    "reason": "Vertraulich"
  }
]
[Exit-Code 0]
```

Der Prüfer auf beiden Gutfällen; redigierte Begriffe sucht er nur mit `--redacted <text>`, sonst
bleibt HPR-LOCK-005 „nicht geprüft“ (HP-LOCK-001, HP-LOCK-007):

```text beleg:03-pruefer.txt
$ check testsuite/dokumente/gut-lock-sperre.hpro --no-epubcheck --no-not-checked
Prüfbericht gut-lock-sperre.hpro (4462 Bytes, sha256 5a3d611e197c523f…), Katalog Teil 1 v0.1 (156 Regeln), hpro-check (hpro Konformitätsprüfer) 0.1.0
Beanspruchte Stufen: Basis
Befunde: 0 fatal, 0 Fehler, 0 Warnungen, 0 Hinweise, 6 nicht geprüft
Stufe Basis: unbestimmt
Berichtsschema: gültig
[Exit-Code 3]
```

Der Sperreintrag dieses Gutfalls im Generator der Testsuite (HP-LOCK-001):

```js aus:scripts/s3-testsuite.mjs
  build: () => build(withDoc((d) => (d.extra.access = [{ target: 'content/index.xhtml#positionen', rules: ['read-only', 'no-export'] }]))),
```

---

## 8. Signaturen und Zeitstempel

### 8.1 Die Signaturform

- Signaturen sind XAdES-Signaturen nach EN 319 132-1 (Baseline) in der ASiC-E-Struktur, abgelegt in
  `META-INF/signatures.xml` mit der OCF-Wurzel `signatures` im Namensraum
  `urn:oasis:names:tc:opendocument:xmlns:container` und `ds:Signature`-Kindern (HP-SIG-001).
- Kein CAdES (`*.p7s` mit `ASiCManifest`): die ASiC-Norm verlangt dafür den ASiC-Mime-Typ, der
  die EPUB-Rückfallebene bräche (HP-SIG-002).
- `ds:SignedInfo` und `xades:SignedProperties` werden mit exklusiver XML-Kanonisierung
  (`xml-exc-c14n#`) kanonisiert; nur so übersteht die Signatur den Wechsel des Wurzelelements
  zwischen OCF und ASiC (HP-SIG-004).
- Die Signatur referenziert jede Datei ihrer Fassung außer `mimetype` und `META-INF/*`, dazu
  ausdrücklich `META-INF/container.xml`; bei der Hauptfassung also auch `manifest.json` und
  `package.opf` (HP-SIG-005).
- Jede Referenz hat ein `xades:DataObjectFormat` mit dem Media-Type aus `manifest.json`
  (`text/xml` für `container.xml`, `application/oebps-package+xml` für `package.opf`,
  `application/json` für `manifest.json`) (HP-SIG-006).
- Signierte Eigenschaften: `xades:SigningTime` (UTC) und `xades:SigningCertificateV2`; das
  Zertifikat liegt in `ds:KeyInfo`; die Signierzeit liegt in der Zertifikatsgültigkeit (HP-SIG-007).
- Algorithmen: SHA-256/384/512; RSA ab 3072 Bit oder ECDSA P-256/384/521; MD5, SHA-1, RSA unter
  2048 Bit und DSA sind verboten und ergeben `CRYPTO_CONSTRAINTS_FAILURE` (HP-SIG-008).
- Ein signierter Container enthält `META-INF/manifest.xml` nach ODF mit Wurzeleintrag
  `application/epub+zip` und einem Eintrag je signierter Datei (HP-SIG-009).
- Kein privates Schlüsselmaterial im Container (HP-SIG-019).
- Signaturen SOLLEN einen RFC-3161-Zeitstempel tragen (Baseline-T); Archiv-Fassungen MÜSSEN
  Baseline-LT erreichen; der Kern signiert heute nur Baseline-B, deshalb warnt der Prüfer mit
  HPR-SIG-012 (HP-SIG-010, HP-SIG-011).

Die Signaturdatei des Beispiels, gekürzt auf ihre Struktur (Digests, Signaturwert und Zertifikat
durch `…` ersetzt); zu sehen sind OCF-Wurzel, exklusive Kanonisierung, `rsa-sha256`, eine Referenz
je Datei mit `DataObjectFormat`, `SigningTime` und `SigningCertificateV2` (HP-SIG-001, HP-SIG-004
bis HP-SIG-008):

```xml
<signatures xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="sig-unterzeichner"><ds:SignedInfo><ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><ds:Reference Id="r-sig-unterzeichner-1" URI="META-INF/container.xml"><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>…</ds:DigestValue></ds:Reference>…<ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#xades-sig-unterzeichner"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>…</ds:DigestValue></ds:Reference></ds:SignedInfo><ds:SignatureValue Id="value-sig-unterzeichner">…</ds:SignatureValue><ds:KeyInfo><ds:X509Data><ds:X509Certificate>…</ds:X509Certificate></ds:X509Data></ds:KeyInfo><ds:Object><xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="#sig-unterzeichner"><xades:SignedProperties Id="xades-sig-unterzeichner"><xades:SignedSignatureProperties><xades:SigningTime>2026-10-12T08:00:00Z</xades:SigningTime><xades:SigningCertificateV2>…</xades:SigningCertificateV2></xades:SignedSignatureProperties><xades:SignedDataObjectProperties><xades:DataObjectFormat ObjectReference="#r-sig-unterzeichner-1"><xades:MimeType>text/xml</xades:MimeType></xades:DataObjectFormat>…</xades:SignedDataObjectProperties></xades:SignedProperties></xades:QualifyingProperties></ds:Object></ds:Signature></signatures>
```

Das ODF-Manifest, das der Kern dazu schreibt (HP-SIG-009):

```text beleg:04-signieren.txt
$ zipcat docs/belege/S7/container/s7-signiert.hpro META-INF/manifest.xml
<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/epub+zip"/><manifest:file-entry manifest:full-path="META-INF/container.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="attachments/kalibrierschein.pdf" manifest:media-type="application/pdf"/><manifest:file-entry manifest:full-path="content/anhang.xhtml" manifest:media-type="application/xhtml+xml"/><manifest:file-entry manifest:full-path="content/index.xhtml" manifest:media-type="application/xhtml+xml"/><manifest:file-entry manifest:full-path="content/media/dachstuhl.svg" manifest:media-type="image/svg+xml"/><manifest:file-entry manifest:full-path="content/nav.xhtml" manifest:media-type="application/xhtml+xml"/><manifest:file-entry manifest:full-path="content/styles/document.css" manifest:media-type="text/css"/><manifest:file-entry manifest:full-path="manifest.json" manifest:media-type="application/json"/><manifest:file-entry manifest:full-path="package.opf" manifest:media-type="application/oebps-package+xml"/></manifest:manifest>
[Exit-Code 0]
```

### 8.2 Signieren mit dem Kern: Schlüssel, Signatur, Prüfung

- Ein Dokument mit Profil `signed` trägt im ersten Inhaltsdokument einen sichtbaren Hinweis
  (`data-hp-role="signature-notice"`), dass EPUB-Lesesysteme keine Signaturen prüfen (HP-PROF-013).
- Der Kern signiert mit einem Software-Schlüssel über WebCrypto (`hpro keygen` erzeugt ein
  Testzertifikat; `hpro sign` ergänzt die Signatur, schreibt den Container neu und liest ihn mit
  Prüfung zurück); der private Schlüssel bleibt beim Signer-Adapter, ein Fernsignatur-Adapter
  (CSC) liefert nur den Signaturwert (HP-SIG-003, HP-SIG-019; [`kern/README.md`](../../kern/README.md)).
- Das Ergebnis wird mit `hpro validate` geprüft: Urteil nach EN 319 102-1 mit Haupt- und
  Unterindikation; Vertrauen entsteht nur aus übergebenen Ankern (`--trust`), nie aus der Datei
  selbst (HP-SIG-012, HP-SIG-015).
- Woher ein Lesesystem seine Vertrauensanker nimmt (Systemspeicher, Zwischenspeicher der
  EU-Vertrauenslisten, Nutzerliste), legt die Spezifikation nicht fest; fest steht nur, dass ohne
  Netz oder Zwischenspeicher „Vertrauensstatus nicht geprüft“ angezeigt wird und dass eine
  Sperrabfrage keine Übertragung von Dokumentdaten ist, das Öffnen aber offline funktionieren
  muss (HP-SIG-015, HP-RS-001, HP-RS-008).
- Ein Lesesystem prüft alle zulässigen Verfahren aus HP-SIG-008 (RSA PKCS#1 v1.5 und PSS ab
  3072 Bit, ECDSA P-256/384/521 mit SHA-256/384/512); Referenz-URIs sind je Segment
  prozentkodiert (UTF-8) und werden dekodiert mit der Dateimenge verglichen (HP-SIG-008,
  HP-SIG-005).
- Signaturen in weiteren Dateien `META-INF/signatures*.xml` (wie andere ASiC-Werkzeuge sie
  schreiben) werden vollwertig geprüft, je `ds:Signature` einer Fassung zugeordnet und als
  Signatur außerhalb von `signatures.xml` gekennzeichnet (HPR-SIG-022, Teil 1, Abschnitt 7.1).

Der Signierbefehl auf dem signierbaren Beispiel (Profil `signed`, noch ohne Signatur); die Ausgabe
nennt alle neun signierten Objekte einschließlich `META-INF/container.xml` (HP-SIG-005):

```text beleg:04-signieren.txt
$ hpro sign docs/belege/S7/container/s7-bericht-signierbar.hpro docs/belege/S7/container/s7-signiert.hpro --key prototyp/out/s7/keys/unterzeichner.key.pem --cert docs/belege/S7/container/unterzeichner.pem --time 2026-10-12T08:00:00Z --id sig-unterzeichner
docs/belege/S7/container/s7-signiert.hpro  9970 bytes  sha256=0f716ab334bcf5dadb946babf6e60a4017a57eb1771e565a7607ecbdbd7e855d
signature: sig-unterzeichner  algorithm RSASSA-PKCS1-v1_5-SHA256  signer CN=Beispiel Bautechnik Unterzeichner,O=hpro Test,C=AT
signed objects (9): [META-INF/container.xml, attachments/kalibrierschein.pdf, content/anhang.xhtml, content/index.xhtml, content/media/dachstuhl.svg, content/nav.xhtml, content/styles/document.css, manifest.json, package.opf]
read-back (trust anchor: only the new signer's certificate): sig-unterzeichner=TOTAL_PASSED
…
[Exit-Code 0]
```

Die Prüfung mit dem Zertifikat des Unterzeichners als Vertrauensanker (HP-SIG-012):

```text beleg:04-signieren.txt
$ hpro validate docs/belege/S7/container/s7-signiert.hpro --trust docs/belege/S7/container/unterzeichner.pem --time 2026-10-12T09:00:00Z
file: docs/belege/S7/container/s7-signiert.hpro (9970 bytes)
validator: hpro TsValidator 0.1.0, policy hpro, time 2026-10-12T09:00:00.000Z
mimetype: application/epub+zip  container: ASiC-E
data files: [attachments/kalibrierschein.pdf, content/anhang.xhtml, content/index.xhtml, content/media/dachstuhl.svg, content/nav.xhtml, content/styles/document.css, manifest.json, package.opf]
signatures: 1 (passed: 1)
--- signature sig-unterzeichner
file: META-INF/signatures.xml
level: XAdES-BASELINE-B
indication: TOTAL_PASSED
signed objects: [META-INF/container.xml, attachments/kalibrierschein.pdf, content/anhang.xhtml, content/index.xhtml, content/media/dachstuhl.svg, content/nav.xhtml, content/styles/document.css, manifest.json, package.opf]
signer: CN=Beispiel Bautechnik Unterzeichner,O=hpro Test,C=AT
claimed signing time: 2026-10-12T08:00:00Z
…
result: OK
[Exit-Code 0]
```

Ohne Vertrauensanker bleibt die Kryptografie geprüft, das Vertrauen aber unbestimmt
(`INDETERMINATE / NO_CERTIFICATE_CHAIN_FOUND`); ein Lesesystem zeigt dann „Vertrauensstatus nicht
geprüft“ und nennt eine Signatur nie „qualifiziert“ ohne Prüfung gegen eine EU-Vertrauensliste
(HP-SIG-015, Teil 1, Abschnitt 7.5):

```text beleg:05-pruefer-signiert.txt
$ check docs/belege/S7/container/s7-signiert.hpro --time 2026-10-12T09:00:00Z --no-epubcheck --no-not-checked
Prüfbericht s7-signiert.hpro (9970 Bytes, sha256 0f716ab334bcf5da…), Katalog Teil 1 v0.1 (156 Regeln), hpro-check (hpro Konformitätsprüfer) 0.1.0
Beanspruchte Stufen: Basis, Signiert
WARNUNG HPR-SIG-012 signatur=sig-unterzeichner: Signatur sig-unterzeichner: kein Signaturzeitstempel (Niveau XAdES-BASELINE-B; empfohlen `XAdES-BASELINE-T`).
HINWEIS HPR-SIG-016 signatur=sig-unterzeichner: Signatur sig-unterzeichner: INDETERMINATE / NO_CERTIFICATE_CHAIN_FOUND (Vertrauen nicht feststellbar; Stufe Signiert unbestimmt).
Befunde: 0 fatal, 0 Fehler, 1 Warnungen, 1 Hinweise, 6 nicht geprüft
Stufe Basis: unbestimmt
Stufe Signiert: unbestimmt
Berichtsschema: gültig
[Exit-Code 3]
```

### 8.3 Gegenzeichnen

- Eine weitere Signatur wird als letztes Kind von `signatures` angefügt; alle anderen Einträge und
  alle bisherigen `ds:Signature` bleiben Byte für Byte unverändert, `mimetype` bleibt erster
  Eintrag (HP-SIG-003).
- Nach der Gegenzeichnung ergeben alle früheren Signaturen weiterhin `TOTAL_PASSED` (HP-SIG-020).

`hpro compare` zeigt, dass sich nur `META-INF/signatures.xml` geändert hat (die Hashes der
ECDSA-Signatur sind je Lauf verschieden, HP-SIG-003, HP-SIG-020):

```text beleg:04-signieren.txt
$ hpro compare docs/belege/S7/container/s7-signiert.hpro docs/belege/S7/container/s7-signiert-2sig.hpro
…
  0  yes   stored    e468e350d1143eb648f60c7b0bd6031101ec0544a361ca74ecef256ac901f48b  mimetype
  1  yes   deflated  f38ac769ac74fa8208346d960f0d29e98a7ca41107e8d94c792a019c479d4e25  META-INF/container.xml
  2  yes   deflated  d195ff68a25d602afde4c3f118814a46164d94db46d151abc0271bca9d82614f  package.opf
  3  yes   deflated  50ba29d729ca4daac9e835777d94a351931b854b2d12bcfab01460f8b2fa06c4  manifest.json
…
  9  yes   deflated  08d52bb15bf389b182f856bf5c9b7f767a1cb3ec9901ebdd3bf272028ceb07fa  content/styles/document.css
…
  11  yes   deflated  9c53cc89092aa24cedec1f10767a5b3949ed2dee335fc83cbf54076fb05f34f7  META-INF/manifest.xml
entries and hashes identical: NO
byte-identical: no
[Exit-Code 1]
```

Beide Signaturen prüfen mit beiden Ankern: `signatures: 2 (passed: 2)` (HP-SIG-020):

```text beleg:04-signieren.txt
$ hpro validate docs/belege/S7/container/s7-signiert-2sig.hpro --trust docs/belege/S7/container/unterzeichner.pem --trust docs/belege/S7/container/gegenzeichner.pem --time 2026-10-12T09:00:00Z
…
signatures: 2 (passed: 2)
…
result: OK
[Exit-Code 0]
```

### 8.4 Gegenprobe mit einem unabhängigen Validator

- Ein Validator nach dieser Spezifikation bewertet eine Signatur nicht allein wegen
  `application/epub+zip` im `mimetype` als ungültig; die mitgelieferte Richtlinie für DSS
  ([`docs/belege/P3/policy-hpro.xml`](../belege/P3/policy-hpro.xml)) führt den Wert als zulässig
  (HP-SIG-014).
- Mit der DSS-Standardrichtlinie erscheint eine Warnung zum `mimetype`; das Urteil bleibt
  `TOTAL_PASSED` (HP-SIG-014; Messung in [docs/05, Fall V3](../05-prototyp-ergebnisse.md)).

```text beleg:06-dss.txt
$ dss validate docs/belege/S7/container/s7-signiert.hpro docs/belege/S7/container/unterzeichner.pem docs/belege/P3/policy-hpro.xml
…
Validator: ASiCContainerWithXAdESValidator
Validierungsrichtlinie: docs/belege/P3/policy-hpro.xml
Containertyp: ASiC-E
mimetype-Datei vorhanden: true
mimetype-Inhalt: application/epub+zip
…
Format: XAdES-BASELINE-B
Indication: TOTAL_PASSED
Signierte Objekte: [META-INF/container.xml, attachments/kalibrierschein.pdf, content/anhang.xhtml, content/index.xhtml, content/media/dachstuhl.svg, content/nav.xhtml, content/styles/document.css, manifest.json, package.opf]
Format-Prüfung (FC): PASSED
…
  Does the mimetype file content correspond to an expected value? -> OK
…
[Exit-Code 0]
```

### 8.5 Manipulation, Nachträge, unsignierte Dateien

- Eine Änderung an einer signierten Datei ergibt `TOTAL_FAILED / HASH_FAILURE` mit der betroffenen
  Referenz; das Lesesystem zeigt das Dokument als verändert (HP-PROF-010, HP-SIG-012).
- Dateien, die von keiner gültigen Signatur abgedeckt sind, nennt das Lesesystem namentlich als
  „nicht signiert“ (HP-SIG-013).
- Ein Bearbeiter kündigt vor jeder Operation an, welche Signatur dadurch ungültig wird; er entfernt
  Signaturen nicht, das Lesesystem zeigt sie als gebrochen (Teil 1, Abschnitt 7.2).

Dieselbe Datei nach einer Änderung mit einem fremden ZIP-Werkzeug (`23 %` → `13 %`), geprüft mit
dem Kern und mit DSS (HP-PROF-010):

```text beleg:07-manipulation.txt
$ hpro validate docs/belege/S7/container/s7-signiert-manipuliert.hpro --trust docs/belege/S7/container/unterzeichner.pem --time 2026-10-12T09:00:00Z
…
indication: TOTAL_FAILED / HASH_FAILURE
…
  reference hash-failure file              content/index.xhtml
…
ERROR: The reference data object is not intact! [content/index.xhtml]
result: NOT OK
[Exit-Code 1]
```

```text beleg:07-manipulation.txt
$ dss validate docs/belege/S7/container/s7-signiert-manipuliert.hpro docs/belege/S7/container/unterzeichner.pem docs/belege/P3/policy-hpro.xml
…
Indication: TOTAL_FAILED / HASH_FAILURE
…
FEHLER: The reference data object is not intact!
```

Der Konformitätsprüfer meldet dazu den Hash des Manifests (HPR-CONT-016) und die Signatur
(HPR-SIG-015); beide Stufen sind nicht bestanden (HP-CONT-009, HP-PROF-010):

```text beleg:07-manipulation.txt
$ check docs/belege/S7/container/s7-signiert-manipuliert.hpro --trust docs/belege/S7/container/unterzeichner.pem --time 2026-10-12T09:00:00Z --no-epubcheck --no-not-checked
Prüfbericht s7-signiert-manipuliert.hpro (9985 Bytes, sha256 f6f0c91b18e2972a…), Katalog Teil 1 v0.1 (156 Regeln), hpro-check (hpro Konformitätsprüfer) 0.1.0
Beanspruchte Stufen: Basis, Signiert
FEHLER HPR-CONT-016 content/index.xhtml: Ressource content/index.xhtml: Hash stimmt nicht (Manifest sha256-qwCWlhd7bYgVoKkJqqzTA9hkXHtbpyzvXV8KG2U0duc=, Datei sha256-UpG3gOvg4Jsy1VaQz9iJJrRbJNQ45JCZmrB34Pp/TKM=).
FEHLER HPR-SIG-015 signatur=sig-unterzeichner (content/index.xhtml): Signatur sig-unterzeichner: TOTAL_FAILED / HASH_FAILURE: nicht intakt: content/index.xhtml (hash-failure).
WARNUNG HPR-SIG-012 signatur=sig-unterzeichner: Signatur sig-unterzeichner: kein Signaturzeitstempel (Niveau XAdES-BASELINE-B; empfohlen `XAdES-BASELINE-T`).
Befunde: 0 fatal, 2 Fehler, 1 Warnungen, 0 Hinweise, 6 nicht geprüft
Stufe Basis: nicht bestanden
Stufe Signiert: nicht bestanden
Berichtsschema: gültig
[Exit-Code 1]
```

Wird nach der Signatur eine Anmerkung unter `annotations/` ergänzt, bleibt die Signatur gültig,
die Datei ist unsigniert und im Hash-Manifest nicht gelistet (HP-SIG-013, HP-CONT-009,
HP-RS-011):

```text beleg:07-manipulation.txt
$ hpro validate docs/belege/S7/container/s7-signiert-anmerkung.hpro --trust docs/belege/S7/container/unterzeichner.pem --time 2026-10-12T09:00:00Z
…
indication: TOTAL_PASSED
…
WARNING: Not all files are signed!
unsigned files: [annotations/notiz.jsonld]
result: OK
[Exit-Code 0]
```

Der Konformitätsprüfer wertet dieselbe Datei aber als nicht bestanden, weil `resources` und
`package.opf` die Anmerkung nicht nennen; ein Lesesystem, das sie dort nachträgt, bricht die
Signatur über `manifest.json` (HP-CONT-008, HP-SIG-005). Dieser Zielkonflikt zwischen HP-RS-011
und HP-CONT-008 ist eine offene Frage im Prüfbericht (Kapitel 12):

```text beleg:07-manipulation.txt
$ check docs/belege/S7/container/s7-signiert-anmerkung.hpro --trust docs/belege/S7/container/unterzeichner.pem --time 2026-10-12T09:00:00Z --no-epubcheck --no-not-checked
Prüfbericht s7-signiert-anmerkung.hpro (10254 Bytes, sha256 ea291118865ff201…), Katalog Teil 1 v0.1 (156 Regeln), hpro-check (hpro Konformitätsprüfer) 0.1.0
Beanspruchte Stufen: Basis, Signiert
FEHLER HPR-CONT-017 annotations/notiz.jsonld: Datei annotations/notiz.jsonld ist in `resources` nicht verzeichnet (unlisted).
FEHLER HPR-CONT-008 annotations/notiz.jsonld: `package.opf`: annotations/notiz.jsonld hat kein item (Datei ohne `item` bzw. `item` ohne Datei).
…
HINWEIS HPR-SIG-017 annotations/notiz.jsonld: Datei annotations/notiz.jsonld ist nicht signiert.
Befunde: 0 fatal, 2 Fehler, 2 Warnungen, 1 Hinweise, 6 nicht geprüft
Stufe Basis: nicht bestanden
Stufe Signiert: nicht bestanden
Berichtsschema: gültig
[Exit-Code 1]
```

### 8.6 Die eingefrorene Fassung signieren

- Die Signatur einer eingefrorenen Fassung referenziert alle Dateien unter `renditions/<id>/` und
  `META-INF/container.xml`, keine Datei der Hauptfassung; das Lesesystem zeigt, welche Fassung
  signiert ist und dass die Hauptfassung es nicht ist (HP-PROF-008).
- Eine Änderung an der Hauptfassung berührt diese Signatur nicht; eine Änderung an einer Datei der
  Fassung wird als Manipulation erkannt (HP-PROF-009, HP-PROF-010).
- Reihenfolge, wenn beides gewünscht ist: erst einfrieren, dann die Hauptfassung signieren, weil
  das Anlegen der Fassung `manifest.json#renditions` ändert (Teil 1, Abschnitt 7.2).
- Der Prüfer ordnet jede Signatur über ihre Referenzen einer Fassung zu (Teil 1, Abschnitt 7.1).

Signieren mit `--only` je Datei der Fassung; `META-INF/container.xml` fügt der Kern selbst hinzu
(HP-PROF-008, HP-SIG-005):

```text beleg:04-signieren.txt
$ hpro sign docs/belege/S7/container/s7-fassungen.hpro docs/belege/S7/container/s7-fassungen-signiert.hpro --key prototyp/out/s7/keys/unterzeichner.key.pem --cert docs/belege/S7/container/unterzeichner.pem --time 2026-10-12T08:00:00Z --id sig-nachweis --only renditions/nachweis-2026-10-12/content/index.xhtml --only renditions/nachweis-2026-10-12/content/styles/document.css --only renditions/nachweis-2026-10-12/data/aufmass.json --only renditions/nachweis-2026-10-12/data/aufmass.schema.json --only renditions/nachweis-2026-10-12/manifest.json
docs/belege/S7/container/s7-fassungen-signiert.hpro  14629 bytes  sha256=7e55e4c9cd2d1009f714cee3b8a8d794f6b188d18e34c78366b9e77970485557
signature: sig-nachweis  algorithm RSASSA-PKCS1-v1_5-SHA256  signer CN=Beispiel Bautechnik Unterzeichner,O=hpro Test,C=AT
signed objects (6): [META-INF/container.xml, renditions/nachweis-2026-10-12/content/index.xhtml, renditions/nachweis-2026-10-12/content/styles/document.css, renditions/nachweis-2026-10-12/data/aufmass.json, renditions/nachweis-2026-10-12/data/aufmass.schema.json, renditions/nachweis-2026-10-12/manifest.json]
read-back (trust anchor: only the new signer's certificate): sig-nachweis=TOTAL_PASSED
…
[Exit-Code 0]
```

Hauptfassung bearbeitet, Fassungssignatur bleibt gültig (HP-PROF-009):

```text beleg:07-manipulation.txt
$ hpro validate prototyp/out/s7/fassungen-hauptfassung-bearbeitet.hpro --trust docs/belege/S7/container/unterzeichner.pem --time 2026-10-12T09:00:00Z
…
indication: TOTAL_PASSED
…
unsigned files: [components/x-baubuero-aufmass@1.0.0/x-baubuero-aufmass.js, content/index.xhtml, content/nav.xhtml, content/styles/document.css, data/aufmass.json, data/aufmass.schema.json, manifest.json, package.opf]
result: OK
[Exit-Code 0]
```

Fassung geändert (`9.600,00` → `9.900,00`), Manipulation erkannt (HP-PROF-010):

```text beleg:07-manipulation.txt
$ hpro validate docs/belege/S7/container/s7-fassungen-manipuliert.hpro --trust docs/belege/S7/container/unterzeichner.pem --time 2026-10-12T09:00:00Z
…
indication: TOTAL_FAILED / HASH_FAILURE
…
  reference hash-failure file              renditions/nachweis-2026-10-12/content/index.xhtml
…
ERROR: The reference data object is not intact! [renditions/nachweis-2026-10-12/content/index.xhtml]
…
result: NOT OK
[Exit-Code 1]
```

Der Konformitätsprüfer auf der signierten Fassung: Stufe Signiert für beide Fassungen ohne Fehler;
die unsignierten Dateien der Hauptfassung sind Hinweise, keine Fehler (HP-PROF-008, HP-SIG-013):

```text beleg:05-pruefer-signiert.txt
$ check docs/belege/S7/container/s7-fassungen-signiert.hpro --trust docs/belege/S7/container/unterzeichner.pem --time 2026-10-12T09:00:00Z --no-epubcheck --no-not-checked --json docs/belege/S7/berichte/s7-fassungen-signiert.json
Prüfbericht s7-fassungen-signiert.hpro (14629 Bytes, sha256 7e55e4c9cd2d1009…), Katalog Teil 1 v0.1 (156 Regeln), hpro-check (hpro Konformitätsprüfer) 0.1.0
Beanspruchte Stufen: Basis, Lebendig, Signiert
WARNUNG HPR-SIG-012 signatur=sig-nachweis: Signatur sig-nachweis: kein Signaturzeitstempel (Niveau XAdES-BASELINE-B; empfohlen `XAdES-BASELINE-T`).
HINWEIS HPR-SIG-017 package.opf: Datei package.opf ist nicht signiert.
…
Befunde: 0 fatal, 0 Fehler, 1 Warnungen, 8 Hinweise, 9 nicht geprüft
Stufe Basis: unbestimmt
Stufe Lebendig: unbestimmt
Stufe Signiert: unbestimmt
Fassung Hauptfassung (interactive): Basis unbestimmt, Lebendig unbestimmt, Signiert unbestimmt
Fassung nachweis-2026-10-12 (signed): Basis unbestimmt, Lebendig unbestimmt, Signiert unbestimmt
Berichtsschema: gültig
[Exit-Code 3]
```

---

## 9. Erzeugen aus einer Anwendung

### 9.1 Mit der Referenzimplementierung

- `createContainer(input)` aus `@hpro/kern` nimmt Metadaten, Lesereihenfolge, Inhaltsverzeichnis
  und Ressourcen entgegen, schreibt `mimetype`, `container.xml`, `package.opf`, `manifest.json`
  und das Navigationsdokument, liest das Ergebnis zurück und prüft jeden Hash; bei Abweichung
  wirft es (HP-CONT-002 bis HP-CONT-005, HP-CONT-008, HP-ADR-007; [`kern/README.md`](../../kern/README.md)).
- Die Eingabe wird geprüft: XHTML streng als XML, Skriptregeln je Profil, keine externen
  Ressourcen; die OPF-Eigenschaften `scripted`, `svg`, `mathml`, `nav` leitet der Kern aus dem
  Inhalt ab (HP-INH-001, HP-INH-012, HP-CONT-010, HP-CONT-004).
- Manifestschlüssel, die der Kern nicht selbst schreibt (`components`, `data`, `attachments`,
  `extensions`, `subset`, `source`, `renditions`, `access`), ergänzt die Anwendung nachträglich;
  weil `manifest.json` selbst nicht gehasht wird, bleiben alle `integrity`-Werte gültig
  (HP-CONT-008, HP-META-008).
- Gleiche Eingabe ergibt gleiche Bytes, wenn `dateModified` und die Reihenfolge fest sind
  (HP-CONT-014).

Der Nachtrag der Manifestschlüssel in [`scripts/s7-lib.mjs`](../../scripts/s7-lib.mjs); die ZIP-Datei
wird mit demselben Zeitstempel neu geschrieben (HP-CONT-008, HP-CONT-014):

```js aus:scripts/s7-lib.mjs
export async function rewriteContainer(bytes, { manifest, replace = {}, extra = {}, modified }) {
  const { readZip, writeZip, MANIFEST_PATH } = await kern();
  const entries = (await readZip(bytes)).map((e) => {
    let data = e.data;
    if (e.name === MANIFEST_PATH && manifest) data = utf8(JSON.stringify(manifest, null, 2) + '\n');
    else if (replace[e.name] !== undefined) data = typeof replace[e.name] === 'string' ? utf8(replace[e.name]) : replace[e.name];
    return { name: e.name, data, compression: e.name === 'mimetype' ? 'store' : 'auto' };
  });
```

Alle Beispiele dieses Handbuchs entstehen mit einem Aufruf, zweimal gebaut und byteweise verglichen
(HP-CONT-014):

```text beleg:01-beispiele-bauen.txt
$ node scripts/s7-beispiele.mjs docs/belege/S7/container
s7-bericht    /opt/data/html-pro/docs/belege/S7/container/s7-bericht.hpro  6397 bytes  sha256=b619860a883e0adaa995e8b8f882cf7091dfe75ac2ff47ff7be7242ac38c0ff6
s7-bericht-signierbar /opt/data/html-pro/docs/belege/S7/container/s7-bericht-signierbar.hpro  6486 bytes  sha256=3518d0278a6ec69b86f5f60fc2145761fdf7e61e912fe1ef163269d1d73b2382
s7-lebendig   /opt/data/html-pro/docs/belege/S7/container/s7-lebendig.hpro  7395 bytes  sha256=15e858de82be04ed04a380eb33f8698737b0e6d5df28b511a3c7ea2efd384040
s7-fassungen  /opt/data/html-pro/docs/belege/S7/container/s7-fassungen.hpro  11292 bytes  sha256=edf8ca1d7945ef53cb3bf150a87e473daf86ffdd4d04d266a5e56a935f2ef919
s7-buero: Meldung: Bild "Bild3" hat keinen Alternativtext und ist nicht als dekorativ markiert; alt="Bild3" aus dem Rahmennamen gesetzt – bitte nachtragen (HP-MIN-007)
s7-buero      /opt/data/html-pro/docs/belege/S7/container/s7-buero.hpro  9374 bytes  sha256=656419ba1437c7458b7d775e28d7f28186171797fdd2ca7e108d7e1ded3763e5
[Exit-Code 0]
…
$ cmp docs/belege/S7/container/s7-bericht.hpro prototyp/out/s7/zweiter-lauf/s7-bericht.hpro
[Exit-Code 0]
```

### 9.2 Ohne die Referenzimplementierung

- Ein Erzeuger in einer anderen Sprache braucht nur ZIP, SHA-256, XML und JSON aus der
  Standardbibliothek; der minimale Erzeuger des Prüfsteins
  ([`pruefstein/min_producer.py`](../../pruefstein/min_producer.py)) belegt das in Python (Teil 0,
  Abschnitt 17.2, Teil 0, Abschnitt 17.3).
- Die Liste der Anforderungen, die ein minimaler Erzeuger „durch Tun“ und „durch Weglassen“
  erfüllt, steht in Teil 0, Abschnitt 17.2; die Fragen, die dabei offen blieben, in
  [`pruefstein/fragen.md`](../../pruefstein/fragen.md) (Teil 0, Abschnitt 17.4).
- Ein ZIP-Schreiber aus der Standardbibliothek erfüllt HP-CONT-002 nur, wenn er `mimetype` zuerst,
  ungepackt und ohne Extra-Feld schreibt; Werkzeuge, die den Container „als Ganzes“ signieren,
  setzen den Mime-Typ oft selbst um und zerstören die Rückfallebene (HP-CONT-002, HP-SIG-002;
  Messung in [docs/05, Fall V2a](../05-prototyp-ergebnisse.md)).

Der Eingabeteil des Python-Erzeugers (Teil 0, Abschnitt 17.2):

```python aus:pruefstein/min_producer.py
Input JSON:
  {
    "title": "...",                 # manifest.json#name, dc:title, h1 of first document
    "language": "de",               # BCP 47, manifest.json#inLanguage, dc:language, html/@lang
    "dateModified": "YYYY-MM-DDThh:mm:ssZ",   # optional; default: now (UTC)
    "id": "urn:uuid:...",           # optional; default: deterministic UUIDv5 from the input
```

Zwei Läufe des Konverters aus dem Autorenleitfaden ergeben dieselben Bytes (HP-CONT-014,
HP-MIN-004):

```text beleg:01-beispiele-bauen.txt
$ cmp prototyp/out/s7/buero-a.hpro prototyp/out/s7/buero-b.hpro
[Exit-Code 0]
```

---

## 10. Anleitung für Lesesysteme

### 10.1 Öffnen: in dieser Reihenfolge

1. Datei lesen, ohne die Endung zu beachten; ZIP-Härtung: Pfad-Traversal, absolute Pfade,
   Backslashes, Doppel- und Überlappungseinträge, Verschlüsselung, ZIP64 ablehnen; CRC-32 prüfen;
   Entpacken abbrechen, sobald mehr Bytes entstehen als angegeben (HP-CONT-013, HP-CONT-011).
2. `mimetype` als ersten Eintrag mit `application/epub+zip` erwarten, dann `manifest.json` als
   einfaches JSON lesen, ohne `@context` abzurufen; fehlt eines von beidem, ist es kein
   hpro-Dokument (HP-CONT-002, HP-CONT-005, HP-META-003).
3. Jeden `integrity`-Wert aus `resources` gegen die Datei prüfen; bei Abweichung das Dokument
   sichtbar als „verändert“ kennzeichnen und die Datei nennen; Dateien ohne Eintrag namentlich als
   nicht abgedeckt nennen (HP-CONT-009).
4. Profil aus `conformsTo` lesen; nur im Profil `interactive` Komponenten ausführen, und nur nach
   Hashprüfung in der Sandbox (HP-PROF-001, HP-SBX-010, HP-SBX-005).
5. Signaturen aus `META-INF/signatures.xml` (und `signatures*.xml`, gekennzeichnet) vor der Anzeige
   des Status prüfen, Fassungen zuordnen, unsignierte Dateien nennen; nie „signiert“ ohne Prüfung
   (HP-SIG-012, HP-SIG-013, Teil 1, Abschnitt 7.1).
6. Inhaltsdokumente in `readingOrder` anzeigen, Nutzervariablen `--hp-*` setzen, Adressen
   auflösen, Volltextsuche über alles einschließlich zugeklappter `details` anbieten (HP-RS-002,
   HP-ADR-005, HP-RS-003).
7. Alles ohne Netz, Konto und Dienst; vor jeder Übertragung an einen Dienst Hinweis mit
   Dienstname (HP-RS-001, HP-RS-008).

Fehlerverhalten beim Öffnen: ein gültiges EPUB ohne `manifest.json` oder ein ZIP mit anderem
`mimetype` ist kein hpro-Dokument und wird als solches abgelehnt; ein fataler Strukturfehler
(kein ZIP, Härtung verletzt, Manifest kein Objekt) bricht ab; eine Hash-Abweichung oder fehlende
gelistete Datei, auch bei `package.opf` oder dem Navigationsdokument, führt zur Anzeige mit
dauerhafter Kennzeichnung „verändert“ und Dateiliste, nicht zur Ablehnung (HP-CONT-013,
HP-CONT-011, Teil 1, Abschnitt 2.1, HP-CONT-009).

Der minimale Leser des Prüfsteins tut die Schritte 1 bis 3 und 6 ohne Darstellung. Auf einer nach
dem Schreiben veränderten Datei nennt er die Ressource (HP-CONT-009):

```text beleg:08-lesesystem.txt
$ reader docs/belege/S7/container/s7-bericht-veraendert.hpro
…
Hashprüfung:
  geprüft: 7 Ressourcen
  hash-mismatch: content/index.xhtml
  Ergebnis: VERÄNDERT
Exit-Code: 1
[Exit-Code 1]
```

Dieselbe Datei mit `hpro inspect` (HP-CONT-009):

```text beleg:08-lesesystem.txt
$ hpro inspect docs/belege/S7/container/s7-bericht-veraendert.hpro
…
  hash-mismatch content/index.xhtml  sha256-EoqBTOsa0av5ua4BAFqMZYfOBkkHvJk90Pgkvfyvl3I=  actual sha256-mLzF3bQAmT29Va1GGcBQar40Ubht6eWbmjKEdSbX1sI=
…
result: FAILED
[Exit-Code 1]
```

Eine nachträglich ergänzte, nicht gelistete Datei nennt der Leser namentlich; der Prüfstein-Leser
meldet zusätzlich die fehlende Zeile in `package.opf` (HP-CONT-009, HP-CONT-004):

```text beleg:08-lesesystem.txt
$ reader prototyp/out/s7/bericht-ergaenzt.hpro
…
Hashprüfung:
  geprüft: 7 Ressourcen
  unlisted: annotations/notiz.jsonld
  Ergebnis: OK, aber nicht gelistete Dateien vorhanden
Abweichungen:
  - HP-CONT-004: package.opf does not list 'annotations/notiz.jsonld'
Exit-Code: 1
```

Die Erkennung über den Inhalt: dieselben Bytes unter `.bin` werden identisch gelesen
(HP-CONT-013):

```text beleg:08-lesesystem.txt
$ reader --json prototyp/out/s7/s7-bericht.bin
{
  "file": "prototyp/out/s7/s7-bericht.bin",
  "status": "ok",
  "metadata": {
    "id": "urn:uuid:4e0a9c2d-7b31-4f6e-8a5c-2d9e1f0b3c47",
    "name": "Zustandsbericht Dachstuhl Haus Nr. 12",
    "inLanguage": "de-AT",
    "dateModified": "2026-10-12T06:00:00Z",
    "conformsTo": "https://hpro.example/spec/0.1/profile/static",
    "profile": "static"
  },
…
```

### 10.2 Was ein Lesesystem je Stufe leisten muss

Die Lesesystemregeln aus Teil 1, Abschnitt 9 nennen je Regel Testfall und Erwartung; hier die
Zuordnung zu den Bauteilen eines Lesesystems (Teil 1, Abschnitt 9.1).

| Bauteil | Was es tut | Regeln |
|---|---|---|
| ZIP-Leser | Härtung, CRC, Grenzen mit Meldung, Erkennung über Inhalt | HPL-CONT-002, HPL-CONT-003, HPL-CONT-004 |
| Manifest | einfaches JSON, Hashprüfung vor Anzeige, unbekannte Schlüssel ignorieren, höhere Nebenversion und unbekannte Erweiterung anzeigen | HPL-CONT-001, HPL-META-001, HPL-META-002, HPL-VERS-001, HPL-VERS-002 |
| Darstellung | alle Kernmedientypen, fließend von 320 bis 1920 px, Nutzervariablen, Volltextsuche, Tastatur, Accessibility-Baum | HPL-CONT-005, HPL-RS-003 |
| Adressen | Auflösung unabhängig von Breite und Schrift, beide Adressformen kopierbar, `details` öffnen | HPL-ADR-001 |
| Verschachtelung | Anhänge und eingebettete `.hpro` offline öffnen, Priorität 3 einklappen statt entfernen | HPL-NEST-001, HPL-NEST-002 |
| Sandbox | `iframe sandbox="allow-scripts"`, CSP ohne Netz, keine Berechtigungen, keine Brücke zur Hülle, Hashprüfung, kein Speicher außerhalb, Datenkanal, DOM-Beobachtung, Laufzeitbegrenzung, reduzierte Bewegung, nie Skript in `static` | HPL-SBX-001 bis HPL-SBX-012 |
| Signaturen | Prüfung vor Anzeige mit Haupt- und Unterindikation, unsignierte Dateien, „qualifiziert“ nur nach Vertrauensliste, fremde Formate kennzeichnen, lineare Zusammenfassung | HPL-SIG-001 bis HPL-SIG-006 |
| Fassungen | signierte Fassung nennen, Manipulation erkennen, Textvergleich | HPL-PROF-001, HPL-PROF-002 |
| Sperren | `read-only`, `no-print`, `no-export`, `hidden`, Redaktion durch Löschen, „nachweisbar“ nur signiert | HPL-LOCK-001 bis HPL-LOCK-005 |
| Druck | A4 aus dem Fluss mit Kopf-/Fußzeile, Kennungen, Verzeichnis, Tabellenköpfe, umbrechende Codeblöcke, Standbilder, `details` geöffnet, PDF/A-Prüfung | HPL-PRINT-001 bis HPL-PRINT-006 |
| Bearbeiter | Text bleibt Text, Struktur bleibt Struktur, Rückfallebene bleibt gültig, Vergleich, Metadaten bereinigen | HPL-RS-004, HPL-RS-005 |
| Offline, Links, Dienste | ohne Netz und Konto; externe Links nach Anzeige der URL; Dienste benennen | HPL-RS-001, HPL-RS-002 |

Zum Druck: wie Kopf- und Fußzeile, Seitenzahlen und das Verzeichnis mit Seitenzahlen entstehen,
schreibt die Spezifikation nicht vor; ein Umbruchlauf im Lesesystem oder ein Polyfill für
CSS Paged Media (Margin Boxes, `target-counter`) erfüllt die Anforderungen ebenso wie eine
Druck-Engine; die PDF/A- und PDF/UA-Prüfung gilt für den PDF-Export, nicht für den Druck auf einen
Systemdrucker (HP-PRINT-001, HP-PRINT-003, HP-PRINT-005, HP-PRINT-012).

Die Leser-Konformität wird mit Testdokumenten gegen diese Regeln geprüft; der Dateiprüfer
`hpro-check` deckt sie nicht ab, weil er Dateien prüft, keine Lesesysteme (Teil 1, Abschnitt 3.5).
In diesem Paket wurde kein grafisches Lesesystem gebaut oder geprüft; die Regeln bleiben für die
Pakete P4 und folgende offen (Teil 0, Abschnitt 19).

### 10.3 Weitergabe als `.epub` und `.asice`

- „Als EPUB weitergeben“ erzeugt dieselben Bytes unter `.epub`; das ist kein Export und unterliegt
  nicht `no-export` (HP-CONT-013, HP-LOCK-004).
- Ein Lesesystem registriert nur `.hpro` als Dateizuordnung, nicht `.epub`, damit Dokumente nicht
  in Leser gelangen, die Signaturen nicht prüfen (HPG-NS-007).
- Für signierte Fassungen ist `.asice` als Weitergabe-Endung für ASiC-Validatoren empfohlen; der
  Normkonflikt mit EN 319 162-1 ist offen (Teil 2, Abschnitt 6.4, HPC-0001).

Dieselben Bytes unter `.epub` bestehen den EPUB-Validator; unter `.hpro` verweigert er die Prüfung
(HP-CONT-013, HP-CONT-017):

```text beleg:09-endung.txt
$ cmp docs/belege/S7/container/s7-signiert-2sig.hpro prototyp/out/s7/s7-signiert-2sig.epub
[Exit-Code 0]

$ prototyp/tools/jdk-21.0.12.1+1/bin/java -jar prototyp/tools/epubcheck-5.4.0/epubcheck.jar prototyp/out/s7/s7-signiert-2sig.epub
Validating using EPUB version 3.4 rules.
No errors or warnings detected.
Messages: 0 fatals / 0 errors / 0 warnings / 0 infos

EPUBCheck completed
[Exit-Code 0]
```

Das Navigationsdokument eines EPUB-Lesesystems ist dasselbe wie in Kapitel 4.2; die Signatur zeigt
dort niemand an, deshalb steht der Hinweis im Dokument (HP-PROF-013):

```xml
<p id="signaturhinweis" data-hp-role="signature-notice">Dieses Dokument ist signiert. Den Signaturstatus zeigt nur ein hpro-Lesesystem an; ein EPUB-Lesesystem prüft keine Signaturen.</p>
```

---

## 11. Prüfen und Konformitätsaussage

### 11.1 Der Dateiprüfer

- `hpro-check <datei>` prüft gegen den Regelkatalog aus Teil 1 und leitet die beanspruchten Stufen
  aus der Datei ab (Profil, Signaturen), nie aus einer Behauptung des Aufrufers (Teil 1,
  Abschnitt 3.2).
- Je Befund eine Zeile `<KLASSE> <Regel> [<Fassung>] <Ort>: <Meldung>`; danach die nicht
  geprüften Regeln mit Grund, die Zusammenfassung und das Urteil je Stufe (Teil 1, Abschnitt 4.4).
- Rückgabe 0 bestanden, 1 nicht bestanden, 2 Prüfer lief nicht, 3 unbestimmt (Teil 1,
  Abschnitt 4.5).
- `--format json` oder `--json <datei>` liefert den Bericht nach dem Schema
  [`schema/konformitaetsbericht.schema.json`](schema/konformitaetsbericht.schema.json) (Teil 1,
  Abschnitt 4.3).
- Ohne `--no-epubcheck` ruft der Prüfer epubcheck auf einer Kopie mit Endung `.epub` auf und
  übernimmt dessen Meldungen als HPR-CONT-024 (Fehler) und HPR-CONT-028 (Hinweis) (HP-CONT-017).
- `--trust <pem>` übergibt Vertrauensanker, `--time` die Prüfzeit, `--redacted <text>` die Liste
  redigierter Begriffe (HP-SIG-015, HP-LOCK-007).

Die Konformitätsaussage „ist hpro 0.1“ gilt nur mit einem Bericht ohne Fehler in der
Standardbetriebsart; der Kopf des Berichts zum Beispiel `s7-bericht` (HP-VERS-008, Teil 1,
Abschnitt 3.5):

```json
{
  "spec": "https://hpro.example/spec/0.1",
  "catalog": {
    "part": "1",
    "version": "0.1",
    "rules": 156
  },
  "tool": {
    "name": "hpro-check (hpro Konformitätsprüfer)",
    "version": "0.1.0"
  },
  "file": {
    "name": "s7-bericht.hpro",
    "size": 6397,
    "sha256": "b619860a883e0adaa995e8b8f882cf7091dfe75ac2ff47ff7be7242ac38c0ff6"
  },
  "levels": {
    "claimed": [
      "Basis"
    ],
    "requested": [],
    "verdict": {
      "Basis": "unbestimmt"
    }
  },
  "summary": {
    "fatal": 0,
    "error": 0,
    "warning": 0,
    "info": 0,
    "notChecked": 4
  },
```

Ein Dokument mit Profil `signed` ohne Signatur ist das einfachste Beispiel für ein nicht bestandenes
Urteil (HP-PROF-004):

```text beleg:03-pruefer.txt
$ check docs/belege/S7/container/s7-bericht-signierbar.hpro --no-epubcheck --no-not-checked
Prüfbericht s7-bericht-signierbar.hpro (6486 Bytes, sha256 3518d0278a6ec69b…), Katalog Teil 1 v0.1 (156 Regeln), hpro-check (hpro Konformitätsprüfer) 0.1.0
Beanspruchte Stufen: Basis, Signiert
FEHLER HPR-PROF-004 (Container): Fassung Hauptfassung hat Profil signed, aber keine zugeordnete Signatur.
Befunde: 0 fatal, 1 Fehler, 0 Warnungen, 0 Hinweise, 6 nicht geprüft
Stufe Basis: unbestimmt
Stufe Signiert: nicht bestanden
Berichtsschema: gültig
[Exit-Code 1]
```

### 11.2 Was der Dateiprüfer nicht kann

- Regeln mit Mittel `rendering` (Reflow bei 320 px, zugängliche Namen in SVG, reduzierte Bewegung,
  Sandbox-Verhalten) brauchen eine Browser-Engine und stehen als „nicht geprüft“; ein fehlerfreies
  Dokument erhält deshalb `unbestimmt`, nie fälschlich `bestanden` (Teil 1, Abschnitt 2.4, Teil 1,
  Abschnitt 3.4).
- Lesesystemregeln (`HPL-…`) prüft man mit Testdokumenten gegen das Lesesystem, nicht mit dem
  Dateiprüfer (Teil 1, Abschnitt 9.1).
- Ohne Vertrauensanker ist die Stufe Signiert `unbestimmt`; mit Testzertifikaten als Anker wird
  die Kryptografie bestätigt, nicht die Qualifikation (HP-SIG-015).
- Der Vorfilter für Komponentenquelltext findet verschleierten Code nicht; die Durchsetzung
  bleibt beim Lesesystem (Teil 1, Abschnitt 6.3).

Die öffentliche Testsuite mit 180 Fällen ([`testsuite/`](../../testsuite/)) ist der Maßstab für
jede andere Umsetzung des Prüfers; jeder Fall nennt Zielregeln, erwartete Befunde und Urteil
(Teil 1, Abschnitt 9.1; [`docs/belege/S3/README.md`](../belege/S3/README.md)). Der Prüfer selbst
ist Teil des Kerns:

```ts aus:kern/bin/hpro-check.ts
 * Exit codes (section 4.5): 0 all levels passed, 1 a level failed, 2 checker could not run
 * (also: report does not validate against the report schema), 3 a level is undetermined.
```

---

## 12. Offene Punkte und Prüfbericht (informativ)

Die Fragen, die ein fremder Entwickler nach dem Lesen der Teile 0 bis 3 und dieses Handbuchs noch
hätte, sind im Prüfbericht [`docs/belege/S7/pruefbericht.md`](../belege/S7/pruefbericht.md)
gesammelt: jede Frage mit Fundstelle, Entscheidung (im Handbuch beantwortet, in Kern oder
Spezifikation behoben, als Änderungsantrag eingereicht, bewusst offen) und Beleg. Die wichtigsten
Punkte:

1. **Eingefrorene Fassungen und die EPUB-Rückfallebene:** Verweise innerhalb einer Fassung sind
   EPUB-ungültig (`RSC-011`), weil die Fassungsdokumente nicht im Spine stehen; mit
   `linear="no"`-Einträgen besteht epubcheck, der Prüfer aber nicht. Änderungsantrag
   [HPC-0003](aenderungen/HPC-0003.md), Frist 09.11.2026; bis dahin ist jede eingefrorene Fassung
   mit Verweisen formal nicht HP-CONT-017-konform.
2. **`window.parent` im Datenkanal:** Teil 1 §8.1 und HPR-SBX-016 widersprechen sich;
   Änderungsantrag [HPC-0004](aenderungen/HPC-0004.md), Frist 26.10.2026; bis dahin
   `parent.postMessage` ohne Präfix schreiben.
3. **Anmerkungen nach der Signatur:** HP-RS-011 erlaubt unsignierte Anmerkungen unter
   `annotations/`, HP-CONT-008 verlangt für jede Datei einen `resources`-Eintrag; ein Lesesystem
   kann nur eines von beidem erfüllen, ohne die Signatur über `manifest.json` zu brechen. Offen,
   Entscheidung der Herausgeber nötig (Vorschlag im Prüfbericht).
4. **Alternativtext fehlt in der Quelle:** HP-MIN-007 verlangt eine Meldung, legt den
   `alt`-Wert aber nicht fest; der Referenzkonverter setzt Beschriftung oder Rahmennamen und
   fordert zum Nachtragen auf. Offen.
5. **Reservierte Kennung `example`:** laut Registry „für Beispiele in Dokumentation reserviert“,
   laut HPG-NS-004 aber in Dokumenten verboten; die Beispiele dieses Handbuchs nutzen deshalb die
   fiktive Kennung `baubuero`. Offen.
6. **Nicht geprüft:** Rendering, Sandbox-Verhalten, Druck und alle Lesesystemregeln, weil kein
   Lesesystem existiert; Zeitstempel und Langzeitniveaus, weil kein Zeitstempeldienst angebunden
   ist; fremde Validatoren und EPUB-Leser außer epubcheck.

Der Versuch zu Punkt 1 im Wortlaut (HP-CONT-004, HP-CONT-017):

```text beleg:03-pruefer.txt
$ check prototyp/out/s7/versuch-linear-no.hpro --no-not-checked
Prüfbericht versuch-linear-no.hpro (11303 Bytes, sha256 c4bc733e6ed44029…), Katalog Teil 1 v0.1 (156 Regeln), hpro-check (hpro Konformitätsprüfer) 0.1.0
Beanspruchte Stufen: Basis, Lebendig, Signiert
FEHLER HPR-CONT-016 package.opf: Ressource package.opf: Hash stimmt nicht (Manifest sha256-fCKHic9613xXTyAg6/AYMxvBieRfYPevD2FscRP9BZE=, Datei sha256-jpNkhVMxDT0pZWEwPifw/wIPKl9V8K1G2+kRm7Na5X0=).
FEHLER HPR-PROF-004 [nachweis-2026-10-12] fassung=nachweis-2026-10-12: Fassung nachweis-2026-10-12 hat Profil signed, aber keine zugeordnete Signatur.
FEHLER HPR-CONT-009 package.opf:33: `package.opf`: Spine stimmt nicht mit `readingOrder` überein (Position 2: Spine renditions/nachweis-2026-10-12/content/index.xhtml, readingOrder (Ende)).
…
[Exit-Code 1]

$ prototyp/tools/jdk-21.0.12.1+1/bin/java -jar prototyp/tools/epubcheck-5.4.0/epubcheck.jar prototyp/out/s7/versuch-linear-no.epub
Validating using EPUB version 3.4 rules.
No errors or warnings detected.
Messages: 0 fatals / 0 errors / 0 warnings / 0 infos

EPUBCheck completed
[Exit-Code 0]
```

Der Änderungsantrag dazu (Auszug):

```md aus:docs/spezifikation/aenderungen/HPC-0003.md
- **HP-CONT-004** (Teil 0, Muss, Basis) – geändert: der Spine enthält die `readingOrder` der
  Hauptfassung in derselben Reihenfolge als lineare Einträge und DARF danach die Inhaltsdokumente
  eingefrorener Fassungen als Einträge mit `linear="no"` enthalten.
```
