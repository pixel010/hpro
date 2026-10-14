# hpro 0.1 – Spezifikation (Teil 0: Kern)

**Status:** Arbeitsentwurf 0.1 · **Stand:** 11.10.2026 · **Paket:** S1 aus [`docs/08-arbeitsplan.md`](../08-arbeitsplan.md)
**Verbindliche Grundlage:** [`docs/10-anspruch-und-funktionsprofil.md`](../10-anspruch-und-funktionsprofil.md) (sieben Zusagen)
**Belegte Befunde:** [`docs/05-prototyp-ergebnisse.md`](../05-prototyp-ergebnisse.md), [`docs/belege/P1–P3`](../belege/)
**Mechanische Prüfung dieses Dokuments:** [`scripts/check-spec.mjs`](../../scripts/check-spec.mjs) (läuft in `npm test`), Belege in [`docs/belege/S1/`](../belege/S1/README.md)

Weitere Teile: **Teil 1 Konformität und Prüfregeln** ([`01-konformitaet.md`](01-konformitaet.md),
S2: Fehlerklassen, Regelkatalog, Sicherheitsregeln, Fassungsregeln, Dokumentdaten-Kanal,
Befundformat); **Teil 3 Tabellen und Formeln** ([`03-tabellen-und-formeln.md`](03-tabellen-und-formeln.md),
S6: OpenFormula-Teilumfang, Formel und Wert, Genauigkeit, Datumssystem, Fehlerwerte,
Neuberechnung, eingefrorene Fassung, Import); **Teil 2 Lizenz, Governance, Namensraum und
Registry** ([`02-lizenz-und-governance.md`](02-lizenz-und-governance.md), S4: Lizenzvorschlag,
Änderungsverfahren, Versionsschema, Namensraum, Dateiendung, Erweiterungs- und Registry-Regeln,
offene Punkte für Gremien). Wo dieser Teil auf einen noch fehlenden Teil verweist, gilt bis zu dessen
Erscheinen nur, was hier steht. Informativ, nicht normativ: **Teil 4 Umsetzer-Handbuch**
([`04-umsetzer-handbuch.md`](04-umsetzer-handbuch.md), S7: Containeraufbau, Adressierung,
Sandbox, Signaturwege, Lesesysteme, mit nachbaubaren Beispielen) und **Teil 5 Autorenleitfaden**
([`05-autorenleitfaden.md`](05-autorenleitfaden.md), S7: Mindestprofil als Anforderungsliste,
Erzeugen aus Textverarbeitung und CMS) sowie **Teil 6 Einbau in fremde Software**
([`06-einbau.md`](06-einbau.md), S8: Kommandozeile mit Rückgabecodes, Bibliothek und API,
Office-Export, Anbindung von Fachanwendungen).

---

## 0. Zweck und Geltungsbereich

hpro ist ein Datei-Austauschformat für Information, die für Bildschirme gemacht ist. Es
ersetzt die Nachahmung des Papiers, nicht das Papier: die fließende Darstellung ist die Wahrheit,
der Ausdruck eine Ausgabe. Diese Spezifikation legt fest, was eine Datei enthalten muss, damit sie
„hpro 0.1“ ist, und was ein Lesesystem, ein Bearbeiter und ein Prüfer mit ihr tun müssen.

Sie baut ausschließlich auf offenen Standards auf: ZIP mit dem OCF-Muster von EPUB, XHTML, CSS,
SVG, JSON, XML-Signaturen in der Form XAdES im ASiC-E-Container, RFC-3161-Zeitstempel, Web
Cryptography API, Content Security Policy, W3C Web Annotations, OpenFormula. Nichts Eigenes, wo ein
offener Standard schon steht. Wo hpro eine eigene Konvention einführt, ist sie als solche
gekennzeichnet.

Nicht Gegenstand dieses Teils: Oberflächen, Werkzeugketten, Serverdienste, die konkrete Formelsprache
(Teil 3), das Prüfregelwerk mit Fehlerklassen (Teil 1), Lizenz und Gremienweg (Teil 2).

---

## 1. Konventionen

### 1.1 Normative Wörter

Die Wörter **MUSS**, **DARF NICHT**, **SOLL**, **SOLL NICHT** und **KANN** sind normativ, wenn sie
in Großbuchstaben stehen, in der Bedeutung von RFC 2119 und RFC 8174 ([Q24]): MUSS/DARF NICHT =
absolute Anforderung bzw. absolutes Verbot; SOLL/SOLL NICHT = Empfehlung, von der nur mit
dokumentiertem Grund abgewichen werden darf; KANN = optional. Jede Anforderung hat genau einen
dieser drei **Grade**: *Muss* (MUSS, DARF NICHT), *Soll* (SOLL, SOLL NICHT), *Kann* (KANN).

### 1.2 Aufbau einer Anforderung

Jede Anforderung hat diese Form und wird von [`scripts/check-spec.mjs`](../../scripts/check-spec.mjs)
mechanisch geprüft:

```
#### HP-<BEREICH>-<NNN> · <Grad> · <Stufe>
<Subjekt> MUSS/SOLL/KANN … (ein beobachtbares Merkmal)

*Prüfverfahren:* … (wie man das Merkmal beobachtet, mit erwartetem Ergebnis)
*Grundlage:* [Qn] … (Fremdgrundlage mit Quelle, oder „eigene Konvention“)
```

Bereiche: `CONT` Container, `INH` Inhalt und Darstellung, `ADR` Adressierung, `NEST`
verschachtelte Information, `PROF` Profile und Fassungen, `SBX` lebendige Inhalte und Sandbox,
`LOCK` Sperren, Rechte und Redaktion, `SIG` Signaturen und Zeitstempel, `PRINT` Druckprofil, `META`
Metadaten, `VERS` Versionierung und Erweiterungen, `RS` Lesesysteme und Bearbeiter, `MIN`
Mindestprofil für Büroprogramme. Die Nummern je
Bereich sind lückenlos; eine einmal vergebene Nummer wird nicht wiederverwendet (zurückgezogene
Anforderungen bleiben mit dem Vermerk „zurückgezogen“ stehen).

Subjekte: **Dokument** (die Datei), **Erzeuger** (Software, die Dateien schreibt), **Bearbeiter**
(Software, die Dateien ändert), **Lesesystem** (Software, die Dateien anzeigt, druckt, prüft),
**Prüfer** (Konformitätsprüfer). Ein Bearbeiter ist zugleich Erzeuger und Lesesystem.

### 1.3 Konformitätsstufen

| Stufe | Gilt für | Enthält |
|---|---|---|
| **Basis** | jedes Dokument, jedes Lesesystem | alle Anforderungen der Stufe Basis |
| **Lebendig** | Dokumente mit Profil `interactive`; Lesesysteme, die Komponenten ausführen | Basis + Lebendig |
| **Signiert** | Dokumente mit mindestens einer Signatur; Lesesysteme, die Signaturen prüfen und anzeigen | Basis + Signiert |
| **Archiv** | Dokumente mit Profil `archive`; Lesesysteme für Langzeitprüfung | Basis + Signiert + Archiv |

Lebendig und Signiert sind unabhängig voneinander; ein Dokument kann beide Stufen zugleich
erfüllen (lebendige Fassung plus signierte eingefrorene Fassung, Zusage 5). Abschnitt 16 ordnet jede
Anforderung genau einer Stufe zu; die Zuordnung in der Überschrift der Anforderung und in der Tabelle
in Abschnitt 16 müssen übereinstimmen (mechanisch geprüft).

Eine Anforderung an ein Lesesystem auf Stufe X ist nur für Lesesysteme verbindlich, die diese Stufe
beanspruchen. Ein Lesesystem der Stufe Basis darf ein Dokument der Stufe Lebendig öffnen; es zeigt
dann die statischen Äquivalente ([HP-SBX-004](#hp-sbx-004--muss--lebendig)).

### 1.4 Begriffe

| Begriff | Bedeutung |
|---|---|
| Container | die ZIP-Datei nach Abschnitt 3 |
| Hauptfassung | Inhalt und Daten, auf die `manifest.json` an der Containerwurzel zeigt |
| Fassung | Hauptfassung oder eine eingefrorene Fassung unter `renditions/<id>/` |
| eingefrorene Fassung | Fassung ohne Skripte, mit festgeschriebenen Werten und statischen Äquivalenten (Abschnitt 7) |
| Komponente | deklariertes, versioniertes Skriptmodul unter `components/`, das Custom Elements mit Präfix `hp-` bereitstellt (Abschnitt 8) |
| statisches Äquivalent | der Inhalt eines Komponenten-Elements, der ohne Skript sichtbar ist |
| Abschnitt | Element mit stabiler Kennung nach Abschnitt 5 |
| Adresse | `pfad#kennung`, containerrelativ (Abschnitt 5) |
| Hash-Manifest | `manifest.json` mit `integrity` je Ressource |
| Profil | Wert von `conformsTo` im Manifest: `static`, `interactive`, `signed`, `archive` |

---

## 2. Übersicht des Containers (informativ)

```
dokument.hpro                     ZIP, identische Bytes auch als dokument.epub lesbar
├── mimetype                      erste Datei, unkomprimiert, "application/epub+zip"
├── META-INF/
│   ├── container.xml             OCF-Verweis auf package.opf; wird mitsigniert
│   ├── signatures.xml            OCF-Wurzel <signatures>, 1…n XAdES-Signaturen (Stufe Signiert)
│   └── manifest.xml              ODF-Manifest (Stufe Signiert)
├── package.opf                   EPUB-3-Package (Rückfallebene, generiert)
├── manifest.json                 hpro-Manifest: Metadaten, Hashes, Profile, Komponenten, Sperren
├── content/                      XHTML, CSS, SVG, Medien, Schriften; nav.xhtml
├── data/                         Formular- und Fachdaten (JSON), Redaktionsprotokoll
├── components/<name>@<version>/  Komponentenbibliothek (nur Profil interactive)
├── annotations/                  W3C Web Annotations (unsigniert zulässig)
├── attachments/                  Anhänge (beliebige Dateien, auch .hpro)
├── renditions/<id>/              eingefrorene Fassungen mit eigenem manifest.json
├── ext/<kennung>/                Erweiterungen Dritter
└── original/                     Ausgangsdatei bei Konvertierung
```

Beispiel `manifest.json` (Ausschnitt; informativ):

```json
{
  "@context": ["https://www.w3.org/ns/pub-context", "https://hpro.example/ns/v0"],
  "conformsTo": "https://hpro.example/spec/0.1/profile/interactive",
  "id": "urn:uuid:5b0c3f9e-1b7a-4d0e-9a2b-7c1e2f3a4b5c",
  "name": "Kostenschätzung Dachsanierung",
  "inLanguage": "de-AT",
  "dateModified": "2026-10-11T09:00:00Z",
  "readingOrder": [{ "url": "content/index.xhtml", "type": "application/xhtml+xml" }],
  "resources": [{ "url": "content/index.xhtml", "type": "application/xhtml+xml", "integrity": "sha256-…" }],
  "components": [{ "name": "hp-table", "version": "1.0.0", "url": "components/hp-table@1.0.0/hp-table.js", "integrity": "sha256-…" }],
  "renditions": [{ "id": "nachweis-2026-10-11", "role": "frozen", "url": "renditions/nachweis-2026-10-11/manifest.json", "createdAt": "2026-10-11T09:00:00Z" }],
  "access": [{ "target": "content/index.xhtml#preise", "rules": ["read-only"] }],
  "extensions": [{ "id": "https://example.org/ns/hp-ext/kalkulation", "required": false }]
}
```

---

## 3. Container

#### HP-CONT-001 · Muss · Basis
Das Dokument MUSS ein ZIP-Archiv nach APPNOTE sein, das ausschließlich die Kompressionsmethoden 0
(stored) und 8 (deflate) verwendet, keine Verschlüsselung, keine Mehrdatenträger-Archive und kein
ZIP64 nutzt (höchstens 65 535 Einträge und 4 GiB).

*Prüfverfahren:* Zentralverzeichnis lesen; für jeden Eintrag Methode ∈ {0, 8}, Bit 0 der
General-Purpose-Flags = 0, keine ZIP64-Erweiterungsfelder, Disk-Nummer 0. Erwartetes Ergebnis: alle
Bedingungen erfüllt, sonst Fehler „Containerstruktur“.
*Grundlage:* [Q11] APPNOTE; [Q1] EPUB 3.3 §4.2 (OCF ZIP-Container).

#### HP-CONT-002 · Muss · Basis
Der erste Eintrag des Archivs MUSS die Datei `mimetype` sein: Local-Header an Offset 0, Methode 0,
Extra-Feld der Länge 0, Inhalt exakt die Bytes `application/epub+zip` ohne Zeilenende und ohne BOM.

*Prüfverfahren:* Bytes 0–3 = `PK\x03\x04`; Dateiname im ersten Local-Header = `mimetype`;
Extra-Länge = 0; dekomprimierter Inhalt byteweise gleich `application/epub+zip`. Erwartetes
Ergebnis: alle vier Bedingungen erfüllt. Gegenprobe: ein EPUB-Validator meldet keinen Fehler
`PKG-005/PKG-006/PKG-007`.
*Grundlage:* [Q1] EPUB 3.3 §4.3.3; [Q4] EN 319 162-1 §4.4.3.1 Nr. 2 b („original media type of the container“); belegt in [Q31] Fall V3/V7.

#### HP-CONT-003 · Muss · Basis
Das Dokument MUSS `META-INF/container.xml` nach OCF enthalten, dessen erstes `rootfile` mit
`media-type="application/oebps-package+xml"` auf `package.opf` an der Containerwurzel zeigt.

*Prüfverfahren:* Datei vorhanden, wohlgeformtes XML im Namensraum
`urn:oasis:names:tc:opendocument:xmlns:container`, `rootfiles/rootfile[1]/@full-path = "package.opf"`.
Erwartetes Ergebnis: genau so, sonst Fehler „Containerstruktur“.
*Grundlage:* [Q1] EPUB 3.3 §4.2.6.3.1.

#### HP-CONT-004 · Muss · Basis
Das Dokument MUSS mit `package.opf` ein gültiges EPUB-3-Package-Dokument enthalten, dessen Manifest
jede Datei außer `mimetype`, `package.opf` und `META-INF/*` aufführt, dessen Spine die Einträge von
`readingOrder` in derselben Reihenfolge enthält und das ein Navigationsdokument (`properties="nav"`)
nennt.

*Prüfverfahren:* `package.opf` parsen; Menge der `item/@href` = Menge der Containerpfade außer den
drei Ausnahmen; Spine-`idref` in Reihenfolge auf die Pfade aus `manifest.json#readingOrder`
abbilden; genau ein `item` mit `properties` enthält `nav`. Erwartetes Ergebnis: Mengen gleich,
Reihenfolge gleich, nav vorhanden.
*Grundlage:* [Q1] EPUB 3.3 §5 (Package Document), §7 (Navigation Document).

#### HP-CONT-005 · Muss · Basis
Das Dokument MUSS `manifest.json` an der Containerwurzel enthalten: UTF-8-kodiertes JSON ohne BOM,
Wurzel ein Objekt. `manifest.json` ist maßgeblich; bei Widerspruch zu `package.opf` gilt
`manifest.json`.

*Prüfverfahren:* Datei vorhanden; Bytes als UTF-8 dekodierbar; JSON-Parser liefert ein Objekt.
Erwartetes Ergebnis: Parser ohne Fehler, Typ Objekt.
*Grundlage:* [Q35] RFC 8259; [Q3] Publication Manifest (Vorbild der Struktur).

#### HP-CONT-006 · Muss · Basis
Jeder Containerpfad MUSS relativ sein, aus Segmenten ohne `.`, `..` und Leerstring bestehen, keine
der Zeichen `"`, `*`, `:`, `<`, `>`, `?`, `\` und keine Steuerzeichen enthalten, je Segment höchstens
255 Bytes UTF-8 lang sein, nicht auf `.` enden, und alle Pfade MÜSSEN nach NFC-Normalisierung und
Kleinschreibung eindeutig sein.

*Prüfverfahren:* Jeden Eintragsnamen gegen die Regeln prüfen; Menge der normalisierten,
kleingeschriebenen Namen hat dieselbe Größe wie die Menge der Namen. Erwartetes Ergebnis: keine
Verletzung.
*Grundlage:* [Q1] EPUB 3.3 §4.2.2 (Dateinamen); eigene Teilmenge.

#### HP-CONT-007 · Muss · Basis
Die Pfade `mimetype`, `package.opf`, `manifest.json` und das Verzeichnis `META-INF/` sind für
Containerdateien reserviert; Inhalte, Daten und Erweiterungen DÜRFEN NICHT dort liegen. Unter
`META-INF/` DÜRFEN NICHT andere Dateien als `container.xml`, `signatures.xml`,
`signatures*.xml`, `manifest.xml`, `metadata.xml` und `rights.xml` liegen.

*Prüfverfahren:* Eintragsliste filtern: jeder Pfad unter `META-INF/` ist in der Liste; kein in
`manifest.json#resources` genannter Pfad liegt unter `META-INF/` oder heißt wie eine reservierte
Datei. Erwartetes Ergebnis: keine Treffer.
*Grundlage:* [Q1] EPUB 3.3 §4.2.6.3 (reservierte Dateien); [Q4] EN 319 162-1 §4.4.3.2.

#### HP-CONT-008 · Muss · Basis
`manifest.json#resources` MUSS für jede Datei außer `mimetype`, `manifest.json` und `META-INF/*`
genau einen Eintrag mit `url` (Containerpfad), `type` (Media-Type) und `integrity` in der Form
`sha256-<Base64>` über die unkomprimierten Bytes enthalten.

*Prüfverfahren:* Für jede Datei der Abdeckungsregel SHA-256 berechnen, Base64 kodieren, mit
`integrity` vergleichen; keine Datei ohne Eintrag, kein Eintrag ohne Datei, kein Pfad doppelt.
Erwartetes Ergebnis: alle gleich; Abweichung = „hash-mismatch“, fehlender Eintrag = „unlisted“,
fehlende Datei = „missing“.
*Grundlage:* [Q14] Subresource Integrity (Wertform); belegt in [Q32] (P1, Rücklesen).

#### HP-CONT-009 · Muss · Basis
Das Lesesystem MUSS vor der Anzeige alle `integrity`-Werte prüfen und das Dokument bei einer
Abweichung als „verändert“ kennzeichnen; Dateien ohne Eintrag (`unlisted`) MUSS es dem Nutzer
namentlich nennen.

*Prüfverfahren:* Container nach dem Schreiben mit einem fremden ZIP-Werkzeug ändern (eine Ressource
ersetzen, eine Datei ergänzen); öffnen. Erwartetes Ergebnis: sichtbare Kennzeichnung „verändert“ mit
Pfad der geänderten Ressource; ergänzte Datei namentlich als nicht abgedeckt genannt.
*Grundlage:* eigene Festlegung; Anlass [Q31] Fall V8/V9 (EPUB-Lesesysteme zeigen Manipulationen kommentarlos).

#### HP-CONT-010 · Muss · Basis
Alle Ressourcenverweise in XHTML, SVG und CSS (`link`, `img`, `script`, `source`, `audio`, `video`,
`track`, `iframe`, `embed`, `object`, SVG `image`/`use`, CSS `url()` und `@import`) MÜSSEN auf
Dateien im Container zeigen, die existieren; absolute URLs und protokollrelative URLs DÜRFEN NICHT
als Ressourcenverweis vorkommen. Hyperlinks (`a[href]`) nach außen sind erlaubt.

*Prüfverfahren:* Alle genannten Attribute und CSS-Verweise sammeln, relativ zum Dokumentpfad
auflösen, Existenz im Container prüfen; Treffer auf `^[a-z][a-z0-9+.-]*:` oder `^//` sind Fehler
(außer `data:` und `#`). Erwartetes Ergebnis: null externe Verweise, null fehlende Ziele.
*Grundlage:* [Q1] EPUB 3.3 §3.3 (Publication Resources); eigene Verschärfung (keine Remote Resources).

#### HP-CONT-011 · Muss · Basis
Das Lesesystem MUSS Container ablehnen, deren Einträge Pfad-Traversal (`..`), absolute Pfade,
Backslashes, doppelte oder überlappende Einträge, Verschlüsselungsflags oder ZIP64-Felder
enthalten; es MUSS CRC-32 jedes Eintrags prüfen und das Entpacken abbrechen, sobald mehr Bytes
entstehen als im Zentralverzeichnis angegeben.

*Prüfverfahren:* Je ein präpariertes Archiv mit (a) `../x`, (b) zwei Einträgen gleichen Namens,
(c) falschem CRC, (d) deklarierter Größe kleiner als tatsächliche Ausgabe („ZIP-Bombe“) öffnen.
Erwartetes Ergebnis: in allen vier Fällen Abbruch mit Fehlermeldung, keine Anzeige.
*Grundlage:* eigene Festlegung; [Q11] APPNOTE (CRC, Größenfelder).

#### HP-CONT-012 · Soll · Basis
Das Lesesystem SOLL Container mit bis zu 10 000 Einträgen, 256 MiB je Datei und 1 GiB Gesamtgröße
verarbeiten und SOLL darüber hinaus mit einer Fehlermeldung abbrechen, die die überschrittene Grenze
nennt.

*Prüfverfahren:* Container mit 10 000 kleinen Einträgen öffnen; Container mit 10 001 Einträgen
öffnen. Erwartetes Ergebnis: erster wird angezeigt; zweiter bricht ab, die Meldung nennt „Einträge“.
*Grundlage:* eigene Festlegung (Vorgaben der Referenzimplementierung, [Q32]).

#### HP-CONT-013 · Muss · Basis
Die Dateiendung des Dokuments ist `.hpro`; dieselben Bytes DÜRFEN unter `.epub` weitergegeben
werden. Das Lesesystem MUSS beide Endungen öffnen und DARF NICHT die Endung zur Erkennung des
Formats verwenden, sondern `mimetype` und `manifest.json`.

*Prüfverfahren:* Dieselbe Datei als `a.hpro`, `a.epub` und `a.bin` öffnen. Erwartetes Ergebnis:
alle drei werden identisch angezeigt und geprüft.
*Grundlage:* belegt in [Q31] Fall V7; Normkonflikt mit [Q4] §4.4.3.1 Nr. 1 (`.asice`) bleibt offen, siehe Abschnitt 19.

#### HP-CONT-014 · Soll · Basis
Der Erzeuger SOLL deterministisch schreiben: gleiche Eingabe ergibt gleiche Eintragsnamen in
gleicher Reihenfolge, gleiche unkomprimierte Bytes und gleiche `integrity`-Werte; ZIP-Zeitstempel
SOLLEN aus `dateModified` abgeleitet werden.

*Prüfverfahren:* Dasselbe Dokument zweimal erzeugen; Eintragslisten und SHA-256 jedes Eintrags
vergleichen. Erwartetes Ergebnis: keine Abweichung.
*Grundlage:* eigene Festlegung; belegt in [Q32] (P1, zwei Läufe).

#### HP-CONT-015 · Muss · Basis
Jede Ressource MUSS in `manifest.json` einen Media-Type tragen. Das Lesesystem MUSS mindestens die
Kernmedientypen darstellen: `application/xhtml+xml`, `text/css`, `image/svg+xml`, `image/png`,
`image/jpeg`, `image/gif`, `image/webp`, `audio/mpeg`, `audio/ogg`, `font/woff2`,
`application/json`. Für Video gibt es keinen Kernmedientyp; jedes Video MUSS ein statisches
Äquivalent nach [HP-INH-013](#hp-inh-013--muss--basis) haben.

*Prüfverfahren:* Testdokument mit je einer Ressource jedes Kerntyps öffnen. Erwartetes Ergebnis:
alle werden dargestellt bzw. abgespielt; ein Video im nicht unterstützten Format zeigt Standbild und
Beschreibung.
*Grundlage:* [Q1] EPUB 3.3 §3.2 (Core Media Types, ohne Video); eigene Ergänzung `application/json`.

#### HP-CONT-016 · Muss · Basis
Das Dokument DARF NICHT `META-INF/encryption.xml` oder `META-INF/rights.xml` mit Inhalt enthalten;
Vertraulichkeit wird in 0.1 ausschließlich als Umschlag um den ganzen Container hergestellt
([HP-LOCK-010](#hp-lock-010--kann--basis)).

*Prüfverfahren:* Eintragsliste auf die beiden Pfade prüfen. Erwartetes Ergebnis: nicht vorhanden.
*Grundlage:* [Q1] EPUB 3.3 §4.2.6.3.2 (Verschlüsselung legt Dateinamen offen); Begründung [Q33] §1.5.

#### HP-CONT-017 · Muss · Basis
Das Dokument MUSS ein gültiges EPUB 3 sein: ein EPUB-Validator, der die Regeln von EPUB 3.3
umsetzt, meldet 0 Fehler (Warnungen sind zulässig).

*Prüfverfahren:* Datei als `.epub` mit einem EPUB-3.3-Validator prüfen. Erwartetes Ergebnis:
`0 fatals / 0 errors`.
*Grundlage:* [Q1] EPUB 3.3; belegt in [Q31] Fälle V3, V5, V11 und [Q32] (P1, P3).

---

## 4. Inhalt und Darstellung

#### HP-INH-001 · Muss · Basis
Jedes Inhaltsdokument MUSS ein wohlgeformtes XML-Dokument mit Wurzelelement `html` im Namensraum
`http://www.w3.org/1999/xhtml` sein (XHTML-Serialisierung), ohne undefinierte Entitäten.

*Prüfverfahren:* Mit einem strikten XML-Parser lesen; Wurzel prüfen. Erwartetes Ergebnis: kein
Parserfehler, Wurzel `{http://www.w3.org/1999/xhtml}html`.
*Grundlage:* [Q1] EPUB 3.3 §6.1 (XHTML Content Documents); [Q12] HTML (XML-Syntax).

#### HP-INH-002 · Muss · Basis
Das Wurzelelement jedes Inhaltsdokuments MUSS die Sprache mit `xml:lang` und `lang` als BCP-47-Tag
angeben; Textteile in anderer Sprache SOLLEN ein eigenes `lang` tragen.

*Prüfverfahren:* `html/@lang` und `html/@xml:lang` vorhanden, gleich, gültig nach BCP 47.
Erwartetes Ergebnis: beide vorhanden und gültig.
*Grundlage:* [Q25] BCP 47; [Q15] WCAG 2.2 Erfolgskriterium 3.1.1.

#### HP-INH-003 · Muss · Basis
Das Dokument MUSS bei einer Darstellungsbreite von 320 CSS-Pixeln ohne waagrechtes Scrollen des
Fließtexts lesbar sein; Ausnahmen sind nur Tabellen, Abbildungen und Codeblöcke in einem eigenen
Scrollbereich nach [HP-INH-010](#hp-inh-010--soll--basis).

*Prüfverfahren:* Dasselbe Dokument in 320, 768 und 1280 CSS-Pixeln rendern;
`document.scrollingElement.scrollWidth <= clientWidth` je Inhaltsdokument. Erwartetes Ergebnis: in
allen drei Breiten erfüllt.
*Grundlage:* [Q15] WCAG 2.2 Erfolgskriterium 1.4.10 (Reflow); Zusage 1 aus [Q34].

#### HP-INH-004 · Muss · Basis
Das Dokument MUSS Schriftgröße, Zeilenhöhe, Buchstaben-, Wort- und Absatzabstand sowie Vorder- und
Hintergrundfarbe des Fließtexts aus den Lesesystem-Variablen `--hp-font-size`, `--hp-line-height`,
`--hp-letter-spacing`, `--hp-word-spacing`, `--hp-paragraph-spacing`, `--hp-foreground`,
`--hp-background` ableiten und DARF NICHT diese Variablen in Autoren-CSS auf `:root` überschreiben;
eigene Vorgabewerte stehen als Rückfall (`var(--hp-font-size, 1rem)`).

*Prüfverfahren:* Lesesystem setzt `--hp-font-size: 200%` und `--hp-line-height: 2`; berechnete
`font-size` und `line-height` eines Absatzes (`getComputedStyle`) verdoppeln sich gegenüber dem
Ausgangswert. Erwartetes Ergebnis: Faktor 2 ± 1 %.
*Grundlage:* [Q19] CSS Custom Properties; Pflicht zu anpassbaren Abständen aus dem EAA, zitiert in [Q33] §3.1; eigene Variablennamen (Konvention).

#### HP-INH-005 · Soll · Basis
Die DOM-Reihenfolge SOLL der Lesereihenfolge entsprechen; CSS, das die visuelle Reihenfolge
gegenüber dem DOM ändert (`order`, explizite Grid-Platzierung, `flex-direction: *-reverse`), SOLL
NICHT verwendet werden, wenn dadurch die Bedeutung wechselt.

*Prüfverfahren:* Stylesheets auf die genannten Eigenschaften durchsuchen; Treffer manuell gegen die
Lesereihenfolge prüfen. Erwartetes Ergebnis: keine Treffer oder dokumentierte Begründung je Treffer.
*Grundlage:* [Q15] WCAG 2.2 Erfolgskriterium 1.3.2.

#### HP-INH-006 · Muss · Basis
Jedes `img`-Element MUSS ein `alt`-Attribut tragen; dekorative Bilder tragen `alt=""`. Jedes
`svg`-Element, das Information trägt, MUSS `role="img"` und einen zugänglichen Namen (`title` mit
`aria-labelledby` oder `aria-label`) haben.

*Prüfverfahren:* Alle `img` ohne `alt` zählen; alle `svg` mit Text- oder Grafikinhalt ohne
zugänglichen Namen zählen. Erwartetes Ergebnis: beide Zählungen 0.
*Grundlage:* [Q15] WCAG 2.2 Erfolgskriterium 1.1.1; [Q36] WAI-ARIA 1.2.

#### HP-INH-007 · Soll · Basis
Überschriften SOLLEN eine lückenlose Hierarchie bilden (nach `h1` folgt höchstens `h2`, usw.), und
jedes Inhaltsdokument SOLL mit genau einer `h1` beginnen.

*Prüfverfahren:* Überschriftenebenen in Dokumentreihenfolge sammeln; kein Sprung um mehr als eine
Ebene nach unten; Anzahl `h1` = 1. Erwartetes Ergebnis: erfüllt.
*Grundlage:* [Q15] WCAG 2.2 Erfolgskriterium 1.3.1; [Q2] EPUB Accessibility 1.1.

#### HP-INH-008 · Soll · Basis
Datentabellen SOLLEN Kopfzellen `th` mit `scope` oder `headers`-Bezügen und eine `caption` haben.

*Prüfverfahren:* Jede `table` mit mehr als einer Zeile prüfen: `th` vorhanden, `scope` oder
`headers` gesetzt, `caption` vorhanden. Erwartetes Ergebnis: erfüllt oder begründete Ausnahme
(Layouttabellen sind verboten, siehe [HP-INH-005](#hp-inh-005--soll--basis)).
*Grundlage:* [Q15] WCAG 2.2 Erfolgskriterium 1.3.1.

#### HP-INH-009 · Soll · Basis
Eingebettete Schriften SOLLEN im Format WOFF 2.0 vorliegen; jede `font-family` MUSS mit einer
generischen Familie (`serif`, `sans-serif`, `monospace`) als Rückfall enden.

*Prüfverfahren:* Alle `@font-face`-Quellen auf Media-Type `font/woff2` prüfen; alle
`font-family`-Deklarationen enden mit generischer Familie. Erwartetes Ergebnis: erfüllt.
*Grundlage:* [Q29] WOFF2; [Q1] EPUB 3.3 §3.2 (Schriften als Kernmedientyp).

#### HP-INH-010 · Soll · Basis
Jede Datentabelle SOLL mit `data-hp-table` eine Strategie für schmale Breiten angeben: `scroll`
(eigener waagrechter Scrollbereich, Vorgabe), `stack` (Zeilen als Karten), `priority` (Spalten mit
`data-hp-priority` werden eingeklappt). Das Lesesystem MUSS für `scroll` einen Scrollbereich
erzeugen, der den Fließtext nicht verbreitert.

*Prüfverfahren:* Tabelle mit 12 Spalten in 320 px rendern. Erwartetes Ergebnis: Fließtext ohne
waagrechtes Scrollen, Tabelle in eigenem Scrollbereich oder gestapelt.
*Grundlage:* eigene Konvention; Problemlage belegt in [Q33] §3.1 (Tabellen).

#### HP-INH-011 · Muss · Basis
Fließtext MUSS als Text im DOM stehen, nicht als Bild oder als absolut positionierte
Einzelzeichen; die Textextraktion eines Inhaltsdokuments MUSS den sichtbaren Fließtext in
Lesereihenfolge liefern.

*Prüfverfahren:* `textContent` des `body` mit dem sichtbaren Text vergleichen (Stichprobe von
Absätzen, Wortreihenfolge); keine Elemente mit `position: absolute` innerhalb von Absätzen.
Erwartetes Ergebnis: Wortfolge identisch; null absolut positionierte Textfragmente.
*Grundlage:* Zusage 4 aus [Q34]; Befund in [Q37] §3a (Overlay-Bearbeitung).

#### HP-INH-012 · Muss · Basis
Außerhalb des Profils `interactive` DARF NICHT im Dokument vorkommen: `script`-Elemente,
Attribute, deren Name mit `on` beginnt, `javascript:`-URLs, SVG-Skripte, `svg:set`/`animate` mit
Skriptbezug, MathML mit `href`-Skripten.

*Prüfverfahren:* Alle XHTML- und SVG-Dateien parsen; Zählung der genannten Konstrukte. Erwartetes
Ergebnis: 0.
*Grundlage:* [Q33] §1.4 (Profile); belegt in [Q32] (P1, Eingabeprüfung).

#### HP-INH-013 · Muss · Basis
Jedes `video`- und `audio`-Element MUSS ein statisches Äquivalent haben: `video` ein `poster` aus
dem Container und eine Textbeschreibung in `figcaption` oder `aria-describedby`; `audio` eine
Textbeschreibung oder ein Transkript im Container. Autoplay mit Ton DARF NICHT verwendet werden.

*Prüfverfahren:* Alle `video` haben `poster` auf eine existierende Datei und eine Beschreibung;
alle `audio` haben eine Beschreibung; kein `autoplay` ohne `muted`. Erwartetes Ergebnis: erfüllt.
Darstellung ohne Skripte und ohne Medienunterstützung zeigt Standbild und Text.
*Grundlage:* [Q12] HTML (`video`, `poster`); [Q15] WCAG 2.2 Erfolgskriterien 1.2.1, 1.4.2; Zusage 2 aus [Q34].

#### HP-INH-014 · Muss · Basis
Bewegte Inhalte (CSS-Animationen, SMIL, Autoplay-Video) MÜSSEN bei `prefers-reduced-motion: reduce`
angehalten oder durch ihr statisches Äquivalent ersetzt werden; dauerhaft laufende Animationen über
fünf Sekunden MÜSSEN vom Nutzer anhaltbar sein.

*Prüfverfahren:* Rendern mit emulierter Einstellung `prefers-reduced-motion: reduce`; laufende
Animationen zählen (`document.getAnimations()`, Wiedergabestatus der Medien). Erwartetes Ergebnis: 0
laufende Animationen, kein Autoplay.
*Grundlage:* [Q18] Media Queries 5 (`prefers-reduced-motion`); [Q15] WCAG 2.2 Erfolgskriterium 2.2.2.

#### HP-INH-015 · Kann · Basis
Das Dokument KANN MathML (Namensraum `http://www.w3.org/1998/Math/MathML`) und SVG inline
verwenden; das Lesesystem MUSS SVG darstellen und SOLL MathML darstellen, andernfalls den
`alttext` zeigen.

*Prüfverfahren:* Testdokument mit inline SVG und MathML öffnen. Erwartetes Ergebnis: SVG
gerendert; MathML gerendert oder `alttext` sichtbar.
*Grundlage:* [Q1] EPUB 3.3 §6.1.2 (SVG, MathML in XHTML).

#### HP-INH-016 · Soll · Basis
Blöcke, die zusammenbleiben müssen (Tabellen, Abbildungen, Codeblöcke, Überschrift mit erstem
Absatz), SOLLEN mit `break-inside: avoid` bzw. `break-after: avoid` gekennzeichnet sein; Container
Queries SOLLEN Viewport-Breakpoints vorgezogen werden, damit Komponenten sich ihrem Platz anpassen.

*Prüfverfahren:* Stylesheets durchsuchen: `figure, table, pre` tragen `break-inside: avoid`;
`h1–h6` tragen `break-after: avoid`. Erwartetes Ergebnis: vorhanden.
*Grundlage:* [Q17] CSS Fragmentation 3; [Q38] CSS Containment 3 (Container Queries).

---

## 5. Adressierung von Abschnitten

Papier hat Seitenzahlen, hpro hat Adressen. Die Adresse ist geräte- und layoutunabhängig; der
Ausdruck leitet daraus Seitenzahlen ab (Abschnitt 11).

#### HP-ADR-001 · Muss · Basis
Jedes Element der Typen `section`, `article`, `aside`, `nav`, `h1`–`h6`, `table`, `figure`, `pre`,
`details`, `form` und jedes Element mit `data-hp-priority` MUSS ein `id`-Attribut tragen.

*Prüfverfahren:* Alle Elemente der genannten Typen ohne `id` zählen. Erwartetes Ergebnis: 0.
*Grundlage:* eigene Konvention; Zusage 3 aus [Q34].

#### HP-ADR-002 · Muss · Basis
Jede Kennung (`id`) MUSS dem Muster `^[A-Za-z][A-Za-z0-9_.-]*$` entsprechen, höchstens 64 Zeichen
lang sein und innerhalb ihres Inhaltsdokuments eindeutig sein.

*Prüfverfahren:* Alle `id` gegen das Muster und die Länge prüfen; Duplikate je Dokument zählen.
Erwartetes Ergebnis: alle gültig, 0 Duplikate.
*Grundlage:* [Q32a] XML 1.0 (Name-Produktion, Teilmenge); eigene Einschränkung für URL- und Drucktauglichkeit.

#### HP-ADR-003 · Muss · Basis
Die Adresse eines Abschnitts ist `pfad#kennung`, wobei `pfad` der Containerpfad des
Inhaltsdokuments ist. Die zitierfähige Langform ist `<manifest.id>!/<pfad>#<kennung>` (eigene
Konvention nach dem Muster der `jar:`-URLs). Das Lesesystem MUSS für jeden Abschnitt beide Formen
zum Kopieren anbieten.

*Prüfverfahren:* Abschnitt wählen, Adresse kopieren, in die Adresseingabe des Lesesystems
einfügen. Erwartetes Ergebnis: das Lesesystem springt zum Abschnitt; Langform enthält `manifest.id`,
`!/`, Pfad und `#`-Fragment.
*Grundlage:* eigene Konvention; `jar:`-Muster als Vorbild (informativ).

#### HP-ADR-004 · Muss · Basis
Der Bearbeiter DARF NICHT die Kennung eines bestehenden Abschnitts ändern, solange der Abschnitt
bestehen bleibt, und DARF NICHT die Kennung eines gelöschten Abschnitts neu vergeben; neue
Abschnitte erhalten neue Kennungen.

*Prüfverfahren:* Dokument bearbeiten (Absatz ändern, Abschnitt einfügen, Abschnitt löschen) und
speichern; Kennungen der verbliebenen Abschnitte beider Fassungen vergleichen. Erwartetes Ergebnis:
alle gemeinsamen Abschnitte haben identische Kennungen; die gelöschte Kennung kommt nicht mehr vor.
*Grundlage:* eigene Festlegung; Zusage 3 aus [Q34].

#### HP-ADR-005 · Muss · Basis
Das Lesesystem MUSS eine Adresse unabhängig von Fensterbreite, Schriftgröße und Gerät zum selben
Abschnitt auflösen und ihn sichtbar machen (Scrollen, Aufklappen umgebender `details`).

*Prüfverfahren:* Adresse in 320 px und 1280 px sowie mit `--hp-font-size: 200%` öffnen; Element
mit der Kennung liegt im Sichtbereich (`getBoundingClientRect()` innerhalb des Viewports).
Erwartetes Ergebnis: in allen Fällen sichtbar.
*Grundlage:* Zusage 3 aus [Q34]; [Q12] HTML (Fragment-Navigation).

#### HP-ADR-006 · Kann · Basis
Das Lesesystem KANN Textfragment-Verweise (`#:~:text=`) als Rückfall auflösen, wenn eine Kennung
nicht mehr existiert; W3C-Web-Annotation-Selektoren (`TextQuoteSelector`) KÖNNEN zusätzlich zur
Adresse gespeichert werden.

*Prüfverfahren:* Adresse mit gelöschter Kennung und angehängtem Textfragment öffnen. Erwartetes
Ergebnis: der Text wird gefunden und hervorgehoben, oder das Lesesystem meldet „Abschnitt nicht
gefunden“ (beides konform).
*Grundlage:* [Q21] Text Fragments; [Q20] Web Annotation Data Model.

#### HP-ADR-007 · Muss · Basis
Das Navigationsdokument (`nav` mit `epub:type="toc"`) MUSS auf Adressen nach
[HP-ADR-003](#hp-adr-003--muss--basis) verweisen, deren Ziel existiert, und MUSS jedes Element
`section`/`article` der obersten Ebene jedes Inhaltsdokuments enthalten.

*Prüfverfahren:* Alle `nav//a/@href` auflösen; Ziel-`id` existiert; jede `section`/`article` ohne
Vorfahren `section`/`article` ist referenziert. Erwartetes Ergebnis: keine toten Verweise, keine
fehlenden Abschnitte.
*Grundlage:* [Q1] EPUB 3.3 §7.2 (toc nav).

#### HP-ADR-008 · Kann · Basis
Zellen einer Tabelle KÖNNEN mit `<tabellen-kennung>.<Spalte><Zeile>` in A1-Schreibweise adressiert
werden (`#kosten.B7`); Text im Dokument KANN mit `<a href="#kosten.B7" data-hp-ref="value">` den
berechneten Wert dieser Zelle anzeigen. Einzelheiten regelt Teil 3.

*Prüfverfahren:* Verweis mit `data-hp-ref="value"` auf eine Zelle mit Wert öffnen. Erwartetes
Ergebnis: der Verweistext zeigt den gespeicherten Zellwert; ohne Rechner den zuletzt gespeicherten.
*Grundlage:* [Q23] OpenFormula (Zelladressierung); Zusage 7 aus [Q34].

---

## 6. Verschachtelte Information

#### HP-NEST-001 · Muss · Basis
Aufklappbare Abschnitte MÜSSEN mit `details`/`summary` ausgedrückt werden, nicht mit Skripten;
der Inhalt liegt vollständig im DOM, auch wenn er zugeklappt ist.

*Prüfverfahren:* Alle aufklappbaren Bereiche sind `details`; mit deaktivierten Skripten lassen sie
sich öffnen; Textsuche findet Text in zugeklappten Bereichen. Erwartetes Ergebnis: erfüllt.
*Grundlage:* [Q12] HTML (`details`).

#### HP-NEST-002 · Soll · Basis
Blöcke SOLLEN mit `data-hp-priority` (Werte `1`, `2`, `3`) eine Detailtiefe tragen: `1` immer
sichtbar, `2` auf mittleren Breiten sichtbar, `3` auf schmalen Breiten eingeklappt. Das Lesesystem
DARF NICHT Blöcke der Priorität 3 entfernen, sondern MUSS sie aufklappbar halten und im Ausdruck
zeigen.

*Prüfverfahren:* Dokument mit Blöcken der Priorität 3 in 320 px rendern. Erwartetes Ergebnis:
Blöcke eingeklappt, aber per Bedienelement öffenbar; Textsuche findet sie; Ausdruck enthält sie.
*Grundlage:* eigene Konvention aus [Q33] §3.1.

#### HP-NEST-003 · Muss · Basis
Anhänge MÜSSEN im Container liegen (Vorgabe `attachments/`) und in `manifest.json#attachments`
mit `url`, `type` und `name` verzeichnet sein; das Lesesystem MUSS sie anzeigen oder speichern
lassen und MUSS Anhänge des Typs `application/epub+zip` als eingebettetes hpro-Dokument öffnen
können.

*Prüfverfahren:* Dokument mit einem PDF- und einem `.hpro`-Anhang öffnen. Erwartetes Ergebnis:
beide Anhänge in der Anhangsliste; `.hpro` öffnet sich im Lesesystem; Container ist offline
vollständig.
*Grundlage:* eigene Konvention; Zusage 3 aus [Q34] („Anhänge sind Teil des Dokuments“).

#### HP-NEST-004 · Muss · Basis
Unterdokumente, die im Fluss erscheinen (`iframe`, `object`), MÜSSEN Inhaltsdokumente desselben
Containers sein und MÜSSEN in `readingOrder` oder `resources` verzeichnet sein; Signaturen eines
eingebetteten `.hpro`-Anhangs werden getrennt geprüft und berühren die Signaturen des umgebenden
Dokuments nicht.

*Prüfverfahren:* Alle `iframe/@src` und `object/@data` zeigen auf Containerpfade aus
`manifest.json`. Erwartetes Ergebnis: erfüllt; Signaturstatus des Anhangs wird getrennt
ausgewiesen.
*Grundlage:* [Q1] EPUB 3.3 §3.3; eigene Festlegung zur Signaturtrennung.

#### HP-NEST-005 · Soll · Basis
Jedes Inhaltsdokument mit mehr als 2 000 Wörtern SOLL einen Überblick (erster `section`-Block mit
`data-hp-role="summary"`) enthalten, der ohne Aufklappen lesbar ist.

*Prüfverfahren:* Wortzahl je Inhaltsdokument; bei > 2 000 Wörtern Element mit
`data-hp-role="summary"` vorhanden. Erwartetes Ergebnis: vorhanden oder begründete Ausnahme.
*Grundlage:* eigene Konvention; Zusage 3 aus [Q34] („vom Überblick bis zur Einzelheit“).

---

## 7. Profile und Fassungen

Die vier Profile sind Eigenschaften einer Fassung. Ein Dokument trägt in `manifest.json#conformsTo`
das Profil seiner Hauptfassung; eingefrorene Fassungen tragen ihr eigenes Profil in ihrem eigenen
`manifest.json`.

| Profil (`conformsTo`-Pfad) | Deutsch | Skripte | Signatur |
|---|---|---|---|
| `…/profile/static` | statisch bzw. eingefroren | nein | möglich |
| `…/profile/interactive` | lebendig | nur Komponenten (Abschnitt 8) | nur der Struktur, nicht der Erscheinung; vollwertig nur über eine eingefrorene Fassung |
| `…/profile/signed` | signiert | nein | mindestens eine gültige Signatur über alle Dateien |
| `…/profile/archive` | Archiv | nein | wie signiert, zusätzlich Langzeitniveau (Abschnitt 10) |

#### HP-PROF-001 · Muss · Basis
`manifest.json#conformsTo` MUSS genau einen der vier Profilpfade
`https://hpro.example/spec/0.1/profile/{static|interactive|signed|archive}` nennen.

*Prüfverfahren:* Wert gegen die vier Pfade vergleichen. Erwartetes Ergebnis: genau ein Treffer.
*Grundlage:* [Q3] Publication Manifest (`conformsTo`); eigene Profilpfade (Platzhalter-Namensraum, Teil 2).

#### HP-PROF-002 · Muss · Basis
Eine Fassung mit Profil `static`, `signed` oder `archive` DARF NICHT Dateien unter `components/`
enthalten und DARF NICHT Skripte nach [HP-INH-012](#hp-inh-012--muss--basis) enthalten.

*Prüfverfahren:* Pfade der Fassung auf Präfix `components/` prüfen; Skriptprüfung nach HP-INH-012.
Erwartetes Ergebnis: 0 Treffer.
*Grundlage:* [Q33] §1.4.

#### HP-PROF-003 · Muss · Lebendig
Eine Fassung mit Profil `interactive` MUSS für jede Komponente einen Eintrag in
`manifest.json#components` haben und DARF NICHT Skripte außerhalb von `components/` laden
(Abschnitt 8).

*Prüfverfahren:* Jedes `script/@src` löst auf einen Pfad unter `components/` auf, der als `url`
eines `components`-Eintrags vorkommt. Erwartetes Ergebnis: erfüllt.
*Grundlage:* [Q33] §1.4; belegt in [Q32] (P1, Profil `interactive`).

#### HP-PROF-004 · Muss · Signiert
Eine Fassung mit Profil `signed` MUSS mindestens eine Signatur nach Abschnitt 10 tragen, deren
Referenzen alle Dateien der Fassung außer `mimetype` und `META-INF/*` sowie
`META-INF/container.xml` abdecken.

*Prüfverfahren:* Signatur prüfen; Menge der referenzierten URIs mit der Dateimenge vergleichen.
Erwartetes Ergebnis: Urteil `TOTAL_PASSED`, Mengen gleich.
*Grundlage:* [Q4] EN 319 162-1; belegt in [Q31] V3/V11 und [Q32] (P3).

#### HP-PROF-005 · Muss · Archiv
Eine Fassung mit Profil `archive` MUSS zusätzlich zu `signed`: alle verwendeten Schriften
einbetten oder ausschließlich generische Familien verwenden; ausschließlich Kernmedientypen nach
[HP-CONT-015](#hp-cont-015--muss--basis) enthalten; für jedes Medium ein statisches Äquivalent
nach [HP-INH-013](#hp-inh-013--muss--basis) enthalten; keine Hyperlinks auf Ressourcen außerhalb
des Containers als einzige Quelle einer Information haben (`a[href]` nach außen MUSS den Zieltext
oder eine Zusammenfassung im Dokument haben); und eine Signatur mit Langzeitniveau nach
[HP-SIG-011](#hp-sig-011--muss--archiv) tragen.

*Prüfverfahren:* Media-Types gegen die Kernliste; `@font-face` vorhanden für jede nicht-generische
Familie; Signaturniveau ≥ B-LT. Erwartetes Ergebnis: alle Bedingungen erfüllt.
*Grundlage:* [Q33] §5.3 (Archivierbarkeit); Anforderungen der Archivpraxis an selbstgenügsame Inhalte, zitiert in [Q33] §3.2 (KOST).

#### HP-PROF-006 · Kann · Basis
Ein Dokument KANN neben der Hauptfassung eingefrorene Fassungen enthalten. Jede liegt vollständig
unter `renditions/<id>/` mit eigenem `renditions/<id>/manifest.json` (gleiche Struktur wie das
Hauptmanifest, Pfade relativ zur Containerwurzel) und ist in `manifest.json#renditions` mit `id`,
`role: "frozen"`, `url` (Pfad des Fassungsmanifests) und `createdAt` verzeichnet.

*Prüfverfahren:* Für jeden `renditions`-Eintrag: Manifest existiert, ist gültig nach Abschnitt 12,
alle darin genannten Pfade beginnen mit `renditions/<id>/`. Erwartetes Ergebnis: erfüllt.
*Grundlage:* eigene Konvention; Zusage 5 aus [Q34] (zwei Profile in einer Datei).

#### HP-PROF-007 · Muss · Signiert
Eine eingefrorene Fassung MUSS in sich geschlossen sein: alle Ressourcenverweise ihrer Dateien
zeigen auf Pfade unter `renditions/<id>/`; sie erfüllt Profil `static`, `signed` oder `archive`;
Komponenten sind durch ihr statisches Äquivalent ersetzt; Formelzellen enthalten den zuletzt
berechneten Wert; ihr Manifest nennt `computedAt` (Zeitpunkt der Berechnung) und `calculator`
(Kennung und Version des Rechners), wenn Formeln vorkommen.

*Prüfverfahren:* Verweisprüfung nach HP-CONT-010 mit Wurzel `renditions/<id>/`; Skriptprüfung
nach HP-INH-012; bei Tabellen mit `data-hp-formula` ist `data-hp-value` gesetzt und
`computedAt`/`calculator` vorhanden. Erwartetes Ergebnis: erfüllt.
*Grundlage:* Zusage 5 und 7 aus [Q34]; eigene Konvention.

#### HP-PROF-008 · Muss · Signiert
Die Signatur einer eingefrorenen Fassung MUSS alle Dateien unter `renditions/<id>/` und
`META-INF/container.xml` referenzieren und DARF NICHT Dateien der Hauptfassung referenzieren;
das Lesesystem MUSS anzeigen, welche Fassung signiert ist und dass die Hauptfassung nicht signiert
ist.

*Prüfverfahren:* Referenz-URIs der Signatur auflisten; alle beginnen mit `renditions/<id>/` oder
sind `META-INF/container.xml`; Anzeige nennt die Fassung und die unsignierten Dateien. Erwartetes
Ergebnis: erfüllt.
*Grundlage:* [Q4] EN 319 162-1 (Signatur über Datenobjekte); belegt in [Q32] (P3, Teilsignatur).

#### HP-PROF-009 · Muss · Signiert
Eine Änderung an der Hauptfassung DARF NICHT die Signatur einer eingefrorenen Fassung berühren.

*Prüfverfahren:* Dokument mit signierter eingefrorener Fassung: eine Datei der Hauptfassung ändern,
`manifest.json` der Hauptfassung aktualisieren; Signatur prüfen. Erwartetes Ergebnis: weiterhin
`TOTAL_PASSED`; das Hash-Manifest der Hauptfassung ist konsistent.
*Grundlage:* Zusage 5 aus [Q34]; belegt in [Q32] (P3, `teilsigniert-anhang-bearbeitet.epub`).

#### HP-PROF-010 · Muss · Signiert
Eine Änderung an einer Datei der eingefrorenen Fassung MUSS vom Lesesystem als Manipulation
erkannt werden (Urteil `TOTAL_FAILED`, Unterindikation `HASH_FAILURE`).

*Prüfverfahren:* Eine Datei unter `renditions/<id>/` mit einem fremden ZIP-Werkzeug ändern;
Signatur prüfen. Erwartetes Ergebnis: `TOTAL_FAILED / HASH_FAILURE`, betroffene Referenz genannt.
*Grundlage:* [Q6] EN 319 102-1 (Indikationen); belegt in [Q31] V8 und [Q32] (P2, P3).

#### HP-PROF-011 · Soll · Signiert
Das Manifest einer eingefrorenen Fassung SOLL `derivedFrom` tragen: `integrity` des
Hauptmanifests zum Zeitpunkt des Einfrierens und `method` (`"author"` oder `"render"`, siehe
offene Frage 1 in [Q34] §5).

*Prüfverfahren:* Feld vorhanden; `integrity` entspricht dem SHA-256 der damaligen `manifest.json`
(aus dem Verlauf nach [HP-META-006](#hp-meta-006--kann--basis), falls vorhanden). Erwartetes
Ergebnis: vorhanden; Wert nachvollziehbar oder als „nicht nachprüfbar“ gemeldet.
*Grundlage:* eigene Konvention.

#### HP-PROF-012 · Soll · Signiert
Das Lesesystem SOLL bei einem Dokument mit Hauptfassung und eingefrorener Fassung beide anzeigen
können und die Unterschiede als Textvergleich (eingefügt/entfernt je Absatz) darstellen.

*Prüfverfahren:* Hauptfassung gegenüber eingefrorener Fassung in einem Absatz ändern; Vergleich
öffnen. Erwartetes Ergebnis: der Absatz ist als Textänderung markiert, nicht als Bilddifferenz.
*Grundlage:* Zusage 4 und 5 aus [Q34].

#### HP-PROF-013 · Soll · Signiert
Ein signiertes Dokument SOLL im ersten Inhaltsdokument einen sichtbaren Hinweis enthalten, dass
der Signaturstatus nur in einem hpro-Lesesystem geprüft wird (EPUB-Lesesysteme prüfen keine
Signaturen).

*Prüfverfahren:* Erstes Inhaltsdokument enthält ein Element mit `data-hp-role="signature-notice"`
und Text. Erwartetes Ergebnis: vorhanden.
*Grundlage:* [Q1] EPUB 3.3 §4.2.6.3.6 („reading systems do not have to check signatures“); belegt in [Q31] V8.

---

## 8. Lebendige Inhalte und Sandbox

Grenzen, damit aus einem Dokument kein Webangebot und keine Schadsoftware wird (Zusage 2):
deklarierte Komponenten statt freiem Code, keine Verbindung nach außen, kein Nachladen, kein
Speichern außer im Dokument, statisches Äquivalent ohne Skript.

#### HP-SBX-001 · Muss · Lebendig
Jede Komponente MUSS in `manifest.json#components` mit `name` (Custom-Element-Name mit Präfix
`hp-` oder `x-<kennung>-`), `version` (SemVer), `url` (Pfad unter `components/<name>@<version>/`)
und `integrity` (`sha256-…` über die Skriptdatei) deklariert sein.

*Prüfverfahren:* Für jeden Eintrag: `url` existiert, beginnt mit `components/<name>@<version>/`,
SHA-256 der Datei entspricht `integrity`, `name` entspricht `^(hp|x-[a-z0-9]+)-[a-z0-9-]+$`.
Erwartetes Ergebnis: erfüllt.
*Grundlage:* [Q12] HTML (Custom Elements, Namensregeln); [Q14] SRI (Wertform); eigene Konvention.

#### HP-SBX-002 · Muss · Lebendig
Skripte DÜRFEN NICHT anders als durch `<script src="…">` aus `components/` eingebunden werden:
kein Inline-Skript, keine `on*`-Attribute, keine `javascript:`-URLs, keine Skripte in SVG, kein
`eval`-Äquivalent über CSP erlaubt.

*Prüfverfahren:* Zählung von `script` ohne `src` oder mit `src` außerhalb `components/`, von
`on*`-Attributen und `javascript:`-URLs in allen XHTML- und SVG-Dateien. Erwartetes Ergebnis: 0.
*Grundlage:* [Q13] CSP Level 3 (`script-src` ohne `'unsafe-inline'`/`'unsafe-eval'`); [Q33] §2.4.

#### HP-SBX-003 · Muss · Lebendig
Jedes Komponenten-Element im Inhalt MUSS ein Custom Element sein, dessen Name in
`manifest.json#components` deklariert ist; nicht deklarierte Elemente mit Bindestrich DÜRFEN NICHT
vorkommen.

*Prüfverfahren:* Alle Elementnamen mit `-` sammeln, gegen die `name`-Liste prüfen. Erwartetes
Ergebnis: alle deklariert.
*Grundlage:* [Q12] HTML (Custom Elements); eigene Konvention.

#### HP-SBX-004 · Muss · Lebendig
Jedes Komponenten-Element MUSS im Lichtbaum ein statisches Äquivalent enthalten (Text, Bild,
Tabelle oder Liste), das ohne Skript vollständig sichtbar ist und die zuletzt gespeicherten Werte
zeigt; Komponenten DÜRFEN NICHT Inhalte zeigen, die im statischen Äquivalent fehlen, außer
Bedienelementen.

*Prüfverfahren:* Dokument mit deaktivierten Skripten rendern; Textextraktion jedes
Komponenten-Elements ist nicht leer und enthält die Werte, die mit Skripten angezeigt werden
(Stichprobe). Erwartetes Ergebnis: erfüllt; Dokument bleibt vollständig lesbar.
*Grundlage:* Zusage 2 aus [Q34]; Muster „Pflicht-Fallback ohne JavaScript“, zitiert in [Q33] §1.4.

#### HP-SBX-005 · Muss · Lebendig
Das Lesesystem MUSS den Dokumentinhalt in einem `iframe` mit `sandbox`-Attribut ausführen, das
höchstens `allow-scripts` enthält und DARF NICHT `allow-same-origin`, `allow-top-navigation`,
`allow-popups`, `allow-modals`, `allow-forms`, `allow-downloads` oder `allow-pointer-lock` setzen.

*Prüfverfahren:* Attribut des Dokument-iframes auslesen. Erwartetes Ergebnis: `sandbox` vorhanden,
Tokenmenge ⊆ {`allow-scripts`}. Komponente ruft `window.top.location`, `window.open`, `alert`,
`form.submit()` auf; alle Aufrufe schlagen fehl.
*Grundlage:* [Q12] HTML (`iframe sandbox`); Warnung zu `allow-scripts` + `allow-same-origin` in [Q41].

#### HP-SBX-006 · Muss · Lebendig
Das Lesesystem MUSS dem Dokumentrahmen eine Content Security Policy geben, die jeden Netzzugriff
unterbindet und Skripte auf die deklarierten Komponenten begrenzt: `default-src 'none'`,
`connect-src 'none'`, `form-action 'none'`, `frame-src` nur Containerquelle, `script-src` nur die
`integrity`-Hashes der Komponenten (ohne `'unsafe-inline'`, `'unsafe-eval'`), `img-src`,
`media-src`, `font-src`, `style-src` nur Containerquelle (`blob:`/`data:` der Containerauslieferung).

*Prüfverfahren:* Komponente versucht `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`,
`new Image().src`, `@import` und `font-face` mit externer URL; Netzwerkmitschnitt des Lesesystems.
Erwartetes Ergebnis: 0 ausgehende Verbindungen; alle Versuche durch CSP blockiert.
*Grundlage:* [Q13] CSP Level 3; [Q14] SRI (Hashes); Zusage 2 aus [Q34].

#### HP-SBX-007 · Muss · Lebendig
Komponenten DÜRFEN NICHT außerhalb des Dokuments speichern: kein `localStorage`,
`sessionStorage`, IndexedDB, Cache Storage, Cookies, `BroadcastChannel`; Zustand wird ausschließlich
über den Dokumentdaten-Kanal nach [HP-SBX-008](#hp-sbx-008--muss--lebendig) in `data/` gehalten.

*Prüfverfahren:* Komponente ruft die genannten Schnittstellen auf. Erwartetes Ergebnis: Zugriff
schlägt fehl (opake Origin) oder liefert nach Neuöffnen keinen Wert; Speicherinspektion des
Lesesystems zeigt keine Einträge für den Dokumentrahmen.
*Grundlage:* [Q12] HTML (opake Origin in Sandbox); Zusage 2 aus [Q34].

#### HP-SBX-008 · Muss · Lebendig
Komponenten lesen und schreiben Dokumentdaten ausschließlich über `postMessage` an das Lesesystem
mit Nachrichten `{ "hp": "state.get" | "state.set", "path": "data/<name>.json", ... }`; das Lesesystem
MUSS Schreibzugriffe auf `data/` begrenzen, JSON validieren (gegen ein in `manifest.json#data`
genanntes JSON-Schema, falls vorhanden) und Änderungen als Dokumentänderung behandeln
(`integrity` aktualisieren). Einzelheiten des Protokolls legt Teil 1 fest.

*Prüfverfahren:* Komponente schreibt `data/form.json` über den Kanal und versucht, `content/x.xhtml`
zu schreiben. Erwartetes Ergebnis: erstes gelingt und ist nach Speichern im Container mit neuem
Hash; zweites wird abgelehnt.
*Grundlage:* [Q12] HTML (`postMessage`); [Q33] §1.2 (`data/` mit Schema).

#### HP-SBX-009 · Muss · Lebendig
Der Dokumentrahmen DARF NICHT Zugriff auf privilegierte Schnittstellen der Hülle haben
(Dateisystem, Prozesse, Schlüsselspeicher, Drucken, Zwischenablage, Native-Brücken).

*Prüfverfahren:* Komponente prüft `typeof` der bekannten Brückenobjekte und ruft sie auf;
Lesesystem-Protokoll. Erwartetes Ergebnis: keine Brücke erreichbar, kein privilegierter Befehl
ausgeführt.
*Grundlage:* [Q33] §2.4 Punkt 4; Befund zu Hüllen in [Q39] §3.3.

#### HP-SBX-010 · Muss · Lebendig
Das Lesesystem MUSS vor dem Ausführen einer Komponente den SHA-256 der Skriptdatei mit
`integrity` vergleichen und bei Abweichung die Komponente nicht ausführen, sondern das statische
Äquivalent zeigen und die Abweichung kennzeichnen.

*Prüfverfahren:* Skriptdatei im Container um ein Byte ändern, öffnen. Erwartetes Ergebnis: keine
Ausführung; statisches Äquivalent sichtbar; Kennzeichnung „Komponente verändert“.
*Grundlage:* [Q14] SRI; Zusage 2 aus [Q34].

#### HP-SBX-011 · Muss · Lebendig
Das Lesesystem MUSS bei fehlender oder nicht unterstützter Komponente das statische Äquivalent
zeigen und kennzeichnen, dass die Komponente nicht ausgeführt wurde; das Dokument bleibt
vollständig lesbar.

*Prüfverfahren:* `components`-Eintrag auf eine nicht existierende Datei zeigen lassen; öffnen.
Erwartetes Ergebnis: statisches Äquivalent sichtbar, Kennzeichnung vorhanden, keine Fehlermeldung,
die den Inhalt verdeckt.
*Grundlage:* Zusage 2 aus [Q34]; Langzeitlesbarkeit [Q34] §4c.

#### HP-SBX-012 · Kann · Lebendig
Das Lesesystem KANN statt der im Container mitgelieferten Komponentendatei eine eigene Kopie
derselben Version ausführen, wenn deren SHA-256 mit `integrity` übereinstimmt.

*Prüfverfahren:* Lesesystem mit lokaler Bibliothek; Container ohne Änderung öffnen. Erwartetes
Ergebnis: Komponente läuft; bei abweichendem Hash der lokalen Kopie wird die Containerdatei
verwendet oder das statische Äquivalent gezeigt.
*Grundlage:* [Q39] §2.4 (Bibliothek im App-Paket); [Q14] SRI.

#### HP-SBX-013 · Muss · Lebendig
Formulare DÜRFEN NICHT ein `action`-Ziel außerhalb des Containers haben; Eingaben werden in `data/`
gespeichert, nicht gesendet. Ein `form`-Element MUSS `action` weglassen oder auf `#` setzen.

*Prüfverfahren:* Alle `form/@action` prüfen. Erwartetes Ergebnis: leer, fehlend oder `#`.
*Grundlage:* [Q13] CSP (`form-action 'none'`); Zusage 2 aus [Q34].

#### HP-SBX-014 · Muss · Lebendig
Komponenten DÜRFEN NICHT Ton ohne Nutzeraktion abspielen und MÜSSEN bei
`prefers-reduced-motion: reduce` Bewegung unterlassen ([HP-INH-014](#hp-inh-014--muss--basis)
gilt auch für skriptgesteuerte Bewegung).

*Prüfverfahren:* Dokument mit emulierter Einstellung öffnen, 10 s warten, `getAnimations()` und
Medienwiedergabestatus abfragen. Erwartetes Ergebnis: keine laufende Bewegung, kein Ton.
*Grundlage:* [Q18] Media Queries 5; [Q15] WCAG 2.2 Erfolgskriterien 1.4.2, 2.2.2.

#### HP-SBX-015 · Soll · Lebendig
Das Lesesystem SOLL eine Komponente, die den Hauptthread des Dokumentrahmens länger als 5 Sekunden
blockiert, beenden und das statische Äquivalent zeigen.

*Prüfverfahren:* Komponente mit Endlosschleife laden. Erwartetes Ergebnis: nach höchstens 10 s ist
der Inhalt wieder bedienbar und die Komponente als beendet gekennzeichnet.
*Grundlage:* eigene Festlegung.

#### HP-SBX-016 · Muss · Basis
Tabellen mit Formeln MÜSSEN Formel (`data-hp-formula`, OpenFormula-Syntax im Teilumfang von
Teil 3) und zuletzt berechneten Wert (`data-hp-value`, Zellinhalt) gemeinsam speichern; Makros,
Skripte oder Funktionen mit Netz-, Datei-, Zufalls- oder Uhrzeitzugriff DÜRFEN NICHT in Formeln
vorkommen.

*Prüfverfahren:* Jede Zelle mit `data-hp-formula` hat Zellinhalt und `data-hp-value`; Formeltext
enthält keine der Funktionen `NOW`, `TODAY`, `RAND`, `RANDBETWEEN`, `WEBSERVICE`, `DDE`,
`HYPERLINK`-Aufrufe mit externem Ziel oder Makroaufrufe. Erwartetes Ergebnis: erfüllt; ohne
Rechner zeigt das Dokument die gespeicherten Werte.
*Grundlage:* [Q23] OpenFormula; Zusage 7 aus [Q34].

#### HP-SBX-017 · Muss · Lebendig
Komponenten DÜRFEN NICHT die Reihenfolge, Sichtbarkeit oder den Text von Inhalten außerhalb ihres
eigenen Elements verändern; sie DÜRFEN NICHT Fokus ohne Nutzeraktion setzen; jede Bedienung MUSS mit
Tastatur möglich sein.

*Prüfverfahren:* DOM-Vergleich außerhalb der Komponenten-Elemente vor/nach Initialisierung;
Tastaturdurchlauf (Tab, Enter, Pfeiltasten) über alle Bedienelemente. Erwartetes Ergebnis: DOM
außerhalb unverändert; alle Bedienelemente erreichbar und auslösbar.
*Grundlage:* [Q15] WCAG 2.2 Erfolgskriterien 2.1.1, 3.2.1; [Q34] §3 Punkt 5.

---

## 9. Sperren, Rechte und Redaktion

Ehrliche Grenze: Gegen Kopieren gibt es keinen technischen Schutz. Sperren sind Regeln im Manifest,
die konforme Werkzeuge befolgen; Beweiswert haben sie nur in einer signierten Fassung. Redaktion
heißt Löschen, nicht Überdecken.

#### HP-LOCK-001 · Muss · Basis
Sperren MÜSSEN in `manifest.json#access` als Liste von Objekten mit `target` (Adresse `pfad#kennung`
oder Pfad) und `rules` (Teilmenge von `read-only`, `no-print`, `no-export`, `hidden`) stehen;
andere Regelwörter DÜRFEN NICHT verwendet werden, Erweiterungen nutzen `x-<kennung>-…`.

*Prüfverfahren:* Jeden Eintrag prüfen: `target` löst auf ein existierendes Element oder eine Datei
auf; jede Regel ist in der Liste oder mit `x-` präfigiert. Erwartetes Ergebnis: erfüllt.
*Grundlage:* eigene Konvention; Zusage 5 aus [Q34].

#### HP-LOCK-002 · Muss · Basis
Der Bearbeiter DARF NICHT Inhalte ändern, deren Adresse oder Datei die Regel `read-only` trägt, und
MUSS den Versuch mit Hinweis auf die Sperre ablehnen.

*Prüfverfahren:* Gesperrten Absatz im Bearbeiter ändern und speichern. Erwartetes Ergebnis:
Änderung abgelehnt, Hinweis sichtbar, Datei unverändert (gleicher `integrity`-Wert).
*Grundlage:* eigene Festlegung.

#### HP-LOCK-003 · Muss · Basis
Das Lesesystem MUSS beim Drucken Abschnitte mit `no-print` auslassen und an ihrer Stelle den
Hinweis „Abschnitt <kennung> nicht zum Druck freigegeben“ ausgeben.

*Prüfverfahren:* Dokument mit `no-print`-Abschnitt drucken (PDF); Textextraktion. Erwartetes
Ergebnis: Text des Abschnitts fehlt, Hinweis mit Kennung vorhanden.
*Grundlage:* eigene Festlegung.

#### HP-LOCK-004 · Muss · Basis
Das Lesesystem MUSS beim Export in andere Formate (PDF, HTML, EPUB-Kopie ohne Sperren) Abschnitte
mit `no-export` auslassen und den Hinweis wie in [HP-LOCK-003](#hp-lock-003--muss--basis) ausgeben;
„Als EPUB weitergeben“ mit identischen Bytes ist kein Export.

*Prüfverfahren:* Export nach PDF und HTML; Textextraktion. Erwartetes Ergebnis: Abschnitt fehlt,
Hinweis vorhanden.
*Grundlage:* eigene Festlegung.

#### HP-LOCK-005 · Muss · Basis
Das Lesesystem MUSS Abschnitte mit `hidden` standardmäßig nicht anzeigen, MUSS aber sichtbar
kennzeichnen, dass ausgeblendete Abschnitte vorhanden sind, und sie auf Verlangen zeigen. `hidden`
ist keine Vertraulichkeitsmaßnahme: der Inhalt liegt im Container.

*Prüfverfahren:* Dokument mit `hidden`-Abschnitt öffnen. Erwartetes Ergebnis: Abschnitt nicht im
Fluss; Kennzeichnung „1 ausgeblendeter Abschnitt“; Einblenden möglich.
*Grundlage:* eigene Festlegung; Grenze aus [Q34] Zusage 5.

#### HP-LOCK-006 · Soll · Signiert
Das Lesesystem SOLL anzeigen, ob die Sperren (`access`) von einer gültigen Signatur abgedeckt sind;
nur dann SOLL es sie als „nachweisbar“ bezeichnen.

*Prüfverfahren:* Signiertes Dokument mit Sperren und unsigniertes Dokument mit Sperren öffnen.
Erwartetes Ergebnis: „nachweisbar“ nur im signierten Fall.
*Grundlage:* eigene Festlegung; offene Frage 2 in [Q34] §5.

#### HP-LOCK-007 · Muss · Basis
Redigierter Inhalt DARF NICHT mehr im Container vorhanden sein: weder im Inhaltsdokument noch in
Medien, Daten, Anmerkungen, Verlauf, Metadaten oder eingefrorenen Fassungen, die mit redigiert
wurden.

*Prüfverfahren:* Zeichenkette redigieren; alle Einträge entpacken, Volltextsuche (auch in Bildern
per Textextraktion/OCR, in JSON, in `package.opf`). Erwartetes Ergebnis: 0 Treffer.
*Grundlage:* Zusage 5 aus [Q34]; Befund in [Q37] §3b.

#### HP-LOCK-008 · Muss · Basis
Jede Redaktion MUSS ein Protokoll in `data/redaction-log.json` fortschreiben (Einträge mit `target`
Adresse, `at` Zeitpunkt, `reason` optional, `actor` optional) und an der Stelle des entfernten
Inhalts ein Element `<span data-hp-redacted="" role="img" aria-label="geschwärzt">` hinterlassen.

*Prüfverfahren:* Nach Redaktion: Protokolldatei vorhanden, Eintrag mit Adresse und Zeit; Element
mit `data-hp-redacted` an der Adresse. Erwartetes Ergebnis: erfüllt.
*Grundlage:* eigene Konvention.

#### HP-LOCK-009 · Soll · Basis
Das Lesesystem SOLL Auswahl und Kopieren von Text immer erlauben; eine Regel „nicht kopieren“ gibt
es nicht.

*Prüfverfahren:* Text in einem Dokument mit allen Sperrarten auswählen und kopieren. Erwartetes
Ergebnis: Kopieren möglich.
*Grundlage:* [Q34] Zusage 5 (ehrliche Grenze); [Q37] §6 („Kopierschutz erzeugt nur Ärger“).

#### HP-LOCK-010 · Kann · Basis
Vertraulichkeit KANN durch Verschlüsselung des gesamten Containers als CMS `EnvelopedData` (RFC
5652) für Empfängerzertifikate oder Passwort (PBES2) hergestellt werden; die verschlüsselte Datei
trägt die Endung `.hpro.p7m`. Teilverschlüsselung im Container ist nicht vorgesehen.

*Prüfverfahren:* Datei entschlüsseln; Ergebnis ist byteidentisch mit dem Original; ohne Schlüssel
ist kein Dateiname und kein Inhalt lesbar. Erwartetes Ergebnis: erfüllt.
*Grundlage:* [Q10] RFC 5652.

---

## 10. Signaturen und Zeitstempel

#### HP-SIG-001 · Muss · Signiert
Signaturen MÜSSEN XAdES-Signaturen nach EN 319 132-1 (Baseline-Profile) in der ASiC-E-Struktur nach
EN 319 162-1 sein, abgelegt in `META-INF/signatures.xml` mit dem OCF-Wurzelelement `signatures`
im Namensraum `urn:oasis:names:tc:opendocument:xmlns:container`, darin ein oder mehrere
`ds:Signature` als Kindelemente.

*Prüfverfahren:* Datei vorhanden; Wurzel `{urn:oasis:names:tc:opendocument:xmlns:container}signatures`;
Kinder `{http://www.w3.org/2000/09/xmldsig#}Signature` mit `xades:QualifyingProperties`.
EPUB-Validator: 0 Fehler. Unabhängiger ASiC-Validator: Containertyp ASiC-E, Format
XAdES-BASELINE-*. Erwartetes Ergebnis: alles erfüllt.
*Grundlage:* [Q5] EN 319 132-1; [Q4] EN 319 162-1 §4.4.3.2 Nr. 3 c; [Q1] EPUB 3.3 §4.2.6.3.6; belegt in [Q31] V5/V11.

#### HP-SIG-002 · Muss · Signiert
Der Erzeuger DARF NICHT CAdES-Signaturen (`*.p7s` mit `ASiCManifest`) in hpro-Dokumente
schreiben; das Lesesystem KANN fremde CAdES-Signaturen prüfen und MUSS sie dann als „fremdes
Signaturformat“ kennzeichnen.

*Prüfverfahren:* Von einem konformen Erzeuger signiertes Dokument: keine Datei
`META-INF/*signature*.p7s`, kein `META-INF/ASiCManifest*.xml`. Erwartetes Ergebnis: nicht
vorhanden.
*Grundlage:* [Q4] EN 319 162-1 §4.4.4.1 (CAdES verlangt den ASiC-mimetype); belegt in [Q31] V6.

#### HP-SIG-003 · Muss · Signiert
Eine neue Signatur MUSS als letztes Kind von `signatures` angefügt werden; bestehende
`ds:Signature`-Elemente und alle anderen Einträge des Containers MÜSSEN Byte für Byte unverändert
bleiben; `mimetype` bleibt erster Eintrag.

*Prüfverfahren:* Vor und nach dem Gegenzeichnen: alle Einträge außer `META-INF/signatures.xml` und
`META-INF/manifest.xml` byteidentisch; in `signatures.xml` sind die bisherigen `ds:Signature`
byteidentisch enthalten und die neue steht am Ende. Erwartetes Ergebnis: erfüllt; alle Signaturen
`TOTAL_PASSED`.
*Grundlage:* [Q1] EPUB 3.3 §4.2.6.3.6 („SHOULD add the signature as the last child“); belegt in [Q31] V11, [Q32] (P3).

#### HP-SIG-004 · Muss · Signiert
`ds:SignedInfo` und `xades:SignedProperties` MÜSSEN mit exklusiver XML-Kanonisierung 1.0
(`http://www.w3.org/2001/10/xml-exc-c14n#`) kanonisiert werden.

*Prüfverfahren:* `ds:CanonicalizationMethod/@Algorithm` und die Transformation der
`SignedProperties`-Referenz lesen. Erwartetes Ergebnis: beide `xml-exc-c14n#`. Gegenprobe: Wechsel
des Wurzelelements (OCF ↔ ASiC) lässt die Signatur gültig.
*Grundlage:* [Q8] Exclusive XML Canonicalization; [Q7] XML Signature 1.1; belegt in [Q31] §4.2 (V4/V5).

#### HP-SIG-005 · Muss · Signiert
Die Signatur MUSS jede Datei ihrer Fassung außer `mimetype` und `META-INF/*` sowie zusätzlich
`META-INF/container.xml` als `ds:Reference` mit `URI` = Containerpfad (Segmente prozentkodiert)
referenzieren; bei der Hauptfassung schließt das `manifest.json` und `package.opf` ein.

*Prüfverfahren:* Menge der Referenz-URIs (dekodiert) mit der Dateimenge der Fassung plus
`META-INF/container.xml` vergleichen. Erwartetes Ergebnis: Mengen gleich; Validator meldet keine
Warnung „Not all files are signed“ (bei Hauptfassung ohne lebendige Dateien).
*Grundlage:* [Q4] EN 319 162-1 §4.4.3.2; belegt in [Q31] V10 (fehlende `container.xml` beim Erweitern), [Q32] (P3).

#### HP-SIG-006 · Muss · Signiert
Für jede Datei-Referenz MUSS `xades:DataObjectFormat` mit dem Media-Type aus `manifest.json`
(bzw. `text/xml` für `container.xml`, `application/oebps-package+xml` für `package.opf`,
`application/json` für `manifest.json`) vorhanden sein.

*Prüfverfahren:* Anzahl `DataObjectFormat` = Anzahl Datei-Referenzen; `MimeType` je Referenz
gleich dem Manifestwert. Erwartetes Ergebnis: erfüllt; kein `application/octet-stream` für
Dateien mit bekanntem Typ.
*Grundlage:* [Q5] EN 319 132-1 (DataObjectFormat); Anlass [Q31] §5.2 (Validator schreibt `octet-stream`).

#### HP-SIG-007 · Muss · Signiert
Die signierten Eigenschaften MÜSSEN mindestens `xades:SigningTime` (UTC, RFC 3339) und
`xades:SigningCertificateV2` (Digest und `IssuerSerialV2` des Signaturzertifikats) enthalten; das
Zertifikat MUSS in `ds:KeyInfo` liegen; die Signierzeit MUSS innerhalb der Gültigkeit des
Zertifikats liegen.

*Prüfverfahren:* Elemente vorhanden; Digest des Zertifikats in `KeyInfo` entspricht
`SigningCertificateV2`; `SigningTime` zwischen `notBefore` und `notAfter`. Erwartetes Ergebnis:
erfüllt.
*Grundlage:* [Q5] EN 319 132-1 §6.3 (Baseline B); [Q26] RFC 3339.

#### HP-SIG-008 · Muss · Signiert
Zulässige Algorithmen: Digest SHA-256, SHA-384 oder SHA-512; Signatur RSA mit mindestens 3072 Bit
(PKCS#1 v1.5 oder RSASSA-PSS) oder ECDSA mit P-256, P-384 oder P-521, jeweils mit einem zulässigen
Digest. MD5, SHA-1, RSA unter 2048 Bit und DSA DÜRFEN NICHT verwendet werden; das Lesesystem MUSS
Signaturen mit unzulässigen Algorithmen als `TOTAL_FAILED` mit Unterindikation
`CRYPTO_CONSTRAINTS_FAILURE` bewerten.

*Prüfverfahren:* `ds:SignatureMethod/@Algorithm`, `ds:DigestMethod/@Algorithm` und
Schlüssellänge des Zertifikats auslesen. Erwartetes Ergebnis: in der Liste; Testsignatur mit
`rsa-sha1` ergibt `TOTAL_FAILED / CRYPTO_CONSTRAINTS_FAILURE`.
*Grundlage:* [Q40] ETSI TS 119 312 (Kryptografische Suiten); [Q7] XML Signature 1.1 (Algorithmus-URIs); [Q28] Web Cryptography API (Verfügbarkeit).

#### HP-SIG-009 · Muss · Signiert
Ein signierter Container MUSS `META-INF/manifest.xml` nach ODF 1.3 Teil 2 enthalten, mit einem
Eintrag `full-path="/"` und `media-type="application/epub+zip"` sowie je einem Eintrag pro
signierter Datei mit ihrem Media-Type.

*Prüfverfahren:* Datei vorhanden, wohlgeformt im Namensraum
`urn:oasis:names:tc:opendocument:xmlns:manifest:1.0`; Wurzeleintrag und Dateieinträge vorhanden.
Erwartetes Ergebnis: erfüllt; unabhängiger ASiC-Validator meldet keinen Formatfehler wegen
fehlendem Manifest.
*Grundlage:* [Q22] ODF 1.3 Teil 2 §3.2; [Q4] EN 319 162-1 §4.4.3.2 Nr. 5; Befund M10 in [Q32] (P2).

#### HP-SIG-010 · Soll · Signiert
Signaturen SOLLEN einen Signaturzeitstempel (XAdES-Baseline-T, `xades:SignatureTimeStamp` mit
einem RFC-3161-Zeitstempel) tragen.

*Prüfverfahren:* `xades:SignatureTimeStamp` vorhanden; Zeitstempeltoken nach RFC 3161 prüfbar;
Validator meldet Niveau `XAdES-BASELINE-T` oder höher. Erwartetes Ergebnis: erfüllt.
*Grundlage:* [Q9] RFC 3161; [Q5] EN 319 132-1 §6.3 (Baseline T).

#### HP-SIG-011 · Muss · Archiv
Signaturen einer Archiv-Fassung MÜSSEN Niveau XAdES-Baseline-LT erreichen (Zeitstempel,
eingebettete Zertifikate und Sperrinformationen in `xades:CertificateValues` und
`xades:RevocationValues`) und SOLLEN Niveau LTA mit `xades:ArchiveTimeStamp` erreichen.

*Prüfverfahren:* Validator ohne Netzzugang: Niveau ≥ `XAdES-BASELINE-LT`, Urteil `TOTAL_PASSED`
oder `INDETERMINATE` nur wegen fehlender Vertrauensanker, nie wegen fehlender Sperrinformationen.
Erwartetes Ergebnis: erfüllt.
*Grundlage:* [Q5] EN 319 132-1 §6.3 (Baseline LT/LTA); [Q33] §5.1.

#### HP-SIG-012 · Muss · Signiert
Das Lesesystem MUSS vor der Anzeige des Signaturstatus jede Signatur prüfen und das Urteil nach
EN 319 102-1 mit Hauptindikation (`TOTAL_PASSED`, `TOTAL_FAILED`, `INDETERMINATE`) und
Unterindikation anzeigen; es DARF NICHT ein Dokument als „signiert“ darstellen, dessen Signatur
nicht geprüft wurde.

*Prüfverfahren:* Gültiges, manipuliertes und mit unbekanntem Zertifikat signiertes Dokument
öffnen. Erwartetes Ergebnis: `TOTAL_PASSED`; `TOTAL_FAILED / HASH_FAILURE`;
`INDETERMINATE / NO_CERTIFICATE_CHAIN_FOUND` (bzw. `NO_SIGNING_CERTIFICATE_FOUND`), jeweils
sichtbar.
*Grundlage:* [Q6] EN 319 102-1; belegt in [Q32] (P2, 39 von 39 Fälle wie der Referenzvalidator).

#### HP-SIG-013 · Muss · Signiert
Das Lesesystem MUSS Dateien des Containers, die von keiner gültigen Signatur abgedeckt sind,
namentlich als „nicht signiert“ ausweisen.

*Prüfverfahren:* Signiertes Dokument um `annotations/a.jsonld` ergänzen; öffnen. Erwartetes
Ergebnis: Signatur `TOTAL_PASSED`; Liste „nicht signiert“ enthält `annotations/a.jsonld`.
*Grundlage:* belegt in [Q31] V9 (Validator meldet nur eine Warnung); eigene Verschärfung.

#### HP-SIG-014 · Muss · Signiert
Ein Validator, der diese Spezifikation umsetzt, DARF NICHT eine Signatur allein deshalb als
ungültig bewerten, weil `mimetype` den Wert `application/epub+zip` trägt; die mitgelieferte
Validierungsrichtlinie MUSS diesen Wert als zulässigen Containertyp führen.

*Prüfverfahren:* Konformen Container prüfen. Erwartetes Ergebnis: keine Format-Warnung oder
-Fehler wegen `mimetype`.
*Grundlage:* [Q4] EN 319 162-1 §4.4.3.1 Nr. 2 b; belegt in [Q31] V3 (Richtlinie ohne Warnung).

#### HP-SIG-015 · Muss · Signiert
Das Lesesystem DARF NICHT eine Signatur als „qualifiziert“ bezeichnen, ohne das Zertifikat gegen
eine EU-Vertrauensliste geprüft zu haben; ohne Netz oder Zwischenspeicher MUSS es „Vertrauensstatus
nicht geprüft“ anzeigen.

*Prüfverfahren:* Mit Testzertifikat signiertes Dokument offline öffnen. Erwartetes Ergebnis:
Kryptografie geprüft, Status „Vertrauensstatus nicht geprüft“ oder „nicht qualifiziert“, nie
„qualifiziert“.
*Grundlage:* [Q33] §5.1 (Prüfen); eigene Festlegung.

#### HP-SIG-016 · Kann · Signiert
Das Dokument KANN Signaturfelder als Elemente mit `data-hp-signature-ref="<ds:Signature/@Id>"`
enthalten; das Lesesystem zeigt dort den Status der zugehörigen Signatur (Unterzeichner, Zeit,
Urteil).

*Prüfverfahren:* Element mit gültiger `Id`-Referenz öffnen. Erwartetes Ergebnis: Status sichtbar;
bei fehlender Signatur „noch nicht signiert“.
*Grundlage:* eigene Konvention; [Q7] XML Signature (`Signature/@Id`).

#### HP-SIG-017 · Soll · Signiert
Das Lesesystem SOLL beim Signieren und beim Prüfen eine lineare Zusammenfassung der signierten
Fassung zeigen (alle Texte in Lesereihenfolge, alle Formular- und Formelwerte, Liste der Anhänge),
damit das Signierte unabhängig von Gerät und Layout erkennbar ist.

*Prüfverfahren:* Signaturdialog öffnen. Erwartetes Ergebnis: Zusammenfassung vorhanden; ihr Text
entspricht der Textextraktion der Fassung.
*Grundlage:* [Q33] §5.2 („What you see is what you sign“).

#### HP-SIG-018 · Kann · Signiert
Eine eingefrorene Fassung KANN eine Referenzdarstellung als PDF/A (`role: "reference-pdf"`) unter
`renditions/<id>/reference.pdf` enthalten, die mitsigniert wird.

*Prüfverfahren:* Datei vorhanden und in den Signaturreferenzen enthalten; PDF/A-Prüfung mit einem
offenen Validator. Erwartetes Ergebnis: referenziert; PDF/A gültig.
*Grundlage:* [Q30] PDF/A (ISO 19005); [Q33] §5.2 Punkt 4.

#### HP-SIG-019 · Muss · Signiert
Der Container DARF NICHT privates Schlüsselmaterial enthalten.

*Prüfverfahren:* Alle Einträge entpacken; Suche nach `PRIVATE KEY`, PKCS#8-/PKCS#12-Strukturen
(DER-Tag `0x30` mit OID `1.2.840.113549.1.12`). Erwartetes Ergebnis: 0 Treffer.
*Grundlage:* eigene Festlegung; belegt in [Q32] (P3, Beleg 09).

#### HP-SIG-020 · Muss · Signiert
Nach dem Anfügen einer weiteren Signatur (Gegenzeichnung) MÜSSEN alle früheren Signaturen
weiterhin `TOTAL_PASSED` ergeben; eine Gegenzeichnung DARF NICHT die signierten Dateien ändern.

*Prüfverfahren:* Dokument mit einer Signatur gegenzeichnen; beide prüfen. Erwartetes Ergebnis: 2 ×
`TOTAL_PASSED`; Dateimenge außer `META-INF/signatures.xml` und `META-INF/manifest.xml`
byteidentisch.
*Grundlage:* [Q4] EN 319 162-1 (mehrere Signaturen); belegt in [Q31] V11, [Q32] (P3).

---

## 11. Druckprofil (abgeleiteter A4-Druck)

#### HP-PRINT-001 · Muss · Basis
Der Ausdruck MUSS aus dem Inhaltsdokument durch Seitenumbruch nach CSS Paged Media erzeugt werden;
das Dokument DARF NICHT feste Seitengeometrie enthalten (keine Elemente mit fester Seitengröße,
keine absolute Positionierung ganzer Seiten, keine vorgefertigten Seitenbilder als Hauptinhalt).

*Prüfverfahren:* Stylesheets auf `position: absolute`/`fixed` mit Seitenmaßen (`210mm`, `297mm`,
`8.5in`) und auf Elemente mit Klasse/Rolle „page“ durchsuchen. Erwartetes Ergebnis: 0 Treffer;
Ausdruck entsteht aus der fließenden Ansicht.
*Grundlage:* [Q16] CSS Paged Media 3; [Q34] §3 Punkt 1.

#### HP-PRINT-002 · Muss · Basis
Das Lesesystem MUSS als Vorgabe `@page { size: A4 }` mit Rändern von mindestens 15 mm verwenden
und KANN andere Formate anbieten; ein `@page`-Regelwerk des Dokuments DARF NICHT die Kopf- und
Fußzeile des Lesesystems unterdrücken.

*Prüfverfahren:* Druck nach PDF; Seitenmaß 210 × 297 mm (± 1 mm); Inhaltsbox liegt innerhalb
der Ränder. Erwartetes Ergebnis: erfüllt.
*Grundlage:* [Q16] CSS Paged Media 3 (`size`, Ränder).

#### HP-PRINT-003 · Muss · Basis
Jede gedruckte Seite MUSS eine Kopfzeile mit dem Dokumenttitel (`manifest.json#name`) und eine
Fußzeile mit „Seite n von N“ tragen; die erste Seite MUSS zusätzlich die Dokumentkennung
(`manifest.json#id`) und `dateModified` zeigen.

*Prüfverfahren:* PDF-Textextraktion je Seite enthält Titel und „Seite n von N“ mit korrekten
Werten; Seite 1 enthält `id` und Datum. Erwartetes Ergebnis: erfüllt auf allen Seiten.
*Grundlage:* [Q16] CSS Paged Media 3 (Margin Boxes, `counter(page)`, `counter(pages)`); Zusage 6 aus [Q34].

#### HP-PRINT-004 · Muss · Basis
Im Ausdruck MUSS jede Überschrift der Ebenen 1–3 ihre Abschnittskennung sichtbar tragen (z. B. am
Rand oder nach dem Text, in der Form `#kennung`), und das gedruckte Inhaltsverzeichnis MUSS je
Eintrag Seitenzahl und Kennung ausgeben.

*Prüfverfahren:* PDF-Textextraktion: zu jeder `h1`–`h3` steht `#<id>` auf derselben Seite; jeder
Verzeichniseintrag enthält Seitenzahl und `#<id>`. Erwartetes Ergebnis: erfüllt.
*Grundlage:* Zusage 3 und 6 aus [Q34]; [Q16] CSS Paged Media 3 (`target-counter`).

#### HP-PRINT-005 · Muss · Basis
Der Ausdruck MUSS ein aus dem Navigationsdokument erzeugtes Inhaltsverzeichnis mit Seitenzahlen
voranstellen, wenn das Dokument mehr als eine gedruckte Seite ergibt.

*Prüfverfahren:* PDF mit ≥ 2 Seiten: Verzeichnis vorhanden; die Seitenzahl jedes Eintrags stimmt
mit der Seite der Überschrift überein (Stichprobe aller Einträge). Erwartetes Ergebnis: erfüllt.
*Grundlage:* [Q1] EPUB 3.3 §7 (Navigationsdokument); Zusage 6 aus [Q34].

#### HP-PRINT-006 · Muss · Basis
Beim Seitenumbruch MÜSSEN Tabellenköpfe (`thead`) auf jeder Folgeseite wiederholt werden, Zeilen
(`tr`), Abbildungen (`figure`) und Überschriften mit ihrem ersten Absatz DÜRFEN NICHT getrennt
werden, soweit sie auf eine Seite passen.

*Prüfverfahren:* Testdokument mit 200-zeiliger Tabelle, Abbildungen und Überschriften am
Seitenende drucken. Erwartetes Ergebnis: Kopfzeile auf jeder Tabellenseite; keine geteilte Zeile
oder Abbildung; keine Überschrift als letzte Zeile einer Seite.
*Grundlage:* [Q17] CSS Fragmentation 3 (`break-inside`, `break-after`); [Q12] HTML (`thead`); Zusage 6 aus [Q34].

#### HP-PRINT-007 · Muss · Basis
Codeblöcke (`pre`) MÜSSEN im Ausdruck umbrechen (`white-space: pre-wrap`) und jeden erzwungenen
Umbruch sichtbar markieren (z. B. `↩` am Zeilenende oder Einzug der Fortsetzung).

*Prüfverfahren:* `pre` mit 300 Zeichen langer Zeile drucken. Erwartetes Ergebnis: kein
abgeschnittener Text; Umbruchmarke oder Fortsetzungseinzug vorhanden.
*Grundlage:* Zusage 6 aus [Q34]; [Q12] HTML (`pre`).

#### HP-PRINT-008 · Muss · Basis
Inhalt DARF NICHT im Ausdruck abgeschnitten werden: Inhalte breiter als der Satzspiegel werden
umgebrochen, gestapelt oder skaliert; Bilder behalten ihr Seitenverhältnis.

*Prüfverfahren:* Dokument mit 12-spaltiger Tabelle, breitem Bild und langem Codeblock drucken;
PDF auf Inhalte außerhalb der Seitenbox prüfen (Bounding Boxes aller Textobjekte und Bilder
innerhalb des Satzspiegels). Erwartetes Ergebnis: 0 Objekte außerhalb.
*Grundlage:* Zusage 6 aus [Q34].

#### HP-PRINT-009 · Muss · Lebendig
Komponenten, Video und Animationen MÜSSEN im Ausdruck als Standbild (statisches Äquivalent bzw.
`poster`) mit Bildunterschrift erscheinen, ergänzt um den Satz „Lebendige Fassung: <Adresse>“ mit
der Adresse des Elements.

*Prüfverfahren:* Dokument mit Video und Komponente drucken; Textextraktion. Erwartetes Ergebnis:
Bildunterschrift und „Lebendige Fassung: <pfad>#<kennung>“ je Element; Bild vorhanden.
*Grundlage:* Zusage 6 aus [Q34].

#### HP-PRINT-010 · Muss · Basis
Aufklappbare Abschnitte (`details`) und Blöcke jeder Priorität MÜSSEN im Ausdruck geöffnet und
vollständig enthalten sein, soweit keine Sperre `no-print` gilt.

*Prüfverfahren:* Dokument mit zugeklappten `details` und Blöcken der Priorität 3 drucken;
Textextraktion. Erwartetes Ergebnis: Text aller Blöcke im PDF.
*Grundlage:* Zusage 3 und 6 aus [Q34].

#### HP-PRINT-011 · Soll · Basis
Externe Hyperlinks SOLLEN im Ausdruck ihre URL in Klammern ausgeben; interne Verweise SOLLEN
Seitenzahl und Kennung des Ziels ausgeben.

*Prüfverfahren:* Dokument mit beiden Verweisarten drucken. Erwartetes Ergebnis:
URL bzw. „S. n, #kennung“ sichtbar.
*Grundlage:* [Q16] CSS Paged Media 3 (`target-counter`); eigene Konvention.

#### HP-PRINT-012 · Soll · Basis
Der PDF-Export SOLL PDF/A-2 und PDF/UA erfüllen (getaggt, Lesereihenfolge aus dem DOM,
Alternativtexte übernommen); die Konformität MUSS mit einem offenen Validator geprüft und das
Ergebnis dem Nutzer gezeigt werden, weil kein Erzeugungsweg sie garantiert.

*Prüfverfahren:* Export; Prüfung mit einem offenen PDF/A- und PDF/UA-Validator. Erwartetes
Ergebnis: bestanden oder Prüfbericht mit Abweichungen sichtbar.
*Grundlage:* [Q30] PDF/A (ISO 19005) und PDF/UA (ISO 14289); [Q33] §4.2.

#### HP-PRINT-013 · Kann · Basis
Das Dokument KANN ein eigenes `@media print`-Stylesheet mitliefern; es DARF NICHT die
Anforderungen HP-PRINT-003 bis HP-PRINT-010 aufheben (z. B. `display: none` auf `thead` oder
`details`).

*Prüfverfahren:* Druckstylesheet durchsuchen: kein `display: none` auf `thead`, `details`,
`figcaption`, `h1`–`h6`; kein `overflow: hidden` auf `pre`/`table`. Erwartetes Ergebnis: 0 Treffer.
*Grundlage:* [Q16] CSS Paged Media 3; eigene Festlegung.

#### HP-PRINT-014 · Kann · Basis
Das Lesesystem KANN eine seitengetreue Bildschirmansicht anbieten, die aus dem Druckprofil
abgeleitet ist (gleiche Umbrüche wie der Ausdruck); die fließende Ansicht bleibt Vorgabe beim
Öffnen.

*Prüfverfahren:* Dokument öffnen: fließende Ansicht aktiv; seitengetreue Ansicht umschalten;
Seitenzahl eines Abschnitts stimmt mit dem PDF-Ausdruck überein. Erwartetes Ergebnis: erfüllt.
*Grundlage:* Zusage 1 aus [Q34].

---

## 12. Metadaten

#### HP-META-001 · Muss · Basis
`manifest.json` MUSS enthalten: `@context` (Liste mit `https://www.w3.org/ns/pub-context` und dem
hpro-Namensraum), `conformsTo`, `id` (URI, SOLL `urn:uuid:`), `name`, `inLanguage` (BCP 47),
`dateModified` (UTC in der Form `YYYY-MM-DDThh:mm:ssZ`), `readingOrder` (Liste von `{url, type}`,
nicht leer, nur `application/xhtml+xml`) und `resources` nach
[HP-CONT-008](#hp-cont-008--muss--basis).

*Prüfverfahren:* Jedes Feld vorhanden und typgerecht; `dateModified` entspricht dem Muster und
ist ein gültiger Zeitpunkt; `inLanguage` nach BCP 47; `readingOrder` nicht leer. Erwartetes
Ergebnis: erfüllt.
*Grundlage:* [Q3] Publication Manifest; [Q25] BCP 47; [Q26] RFC 3339; [Q27] RFC 9562 (UUID-URN).

#### HP-META-002 · Muss · Basis
Die Pflichtmetadaten in `package.opf` (`dc:identifier`, `dc:title`, `dc:language`,
`dcterms:modified`) MÜSSEN mit `id`, `name`, `inLanguage` und `dateModified` aus `manifest.json`
übereinstimmen.

*Prüfverfahren:* Beide Dateien parsen, vier Werte vergleichen. Erwartetes Ergebnis: gleich.
*Grundlage:* [Q1] EPUB 3.3 §5.5 (Pflichtmetadaten).

#### HP-META-003 · Muss · Basis
Das Lesesystem MUSS `manifest.json` als einfaches JSON verarbeiten, ohne JSON-LD-Expansion und ohne
Abruf der `@context`-URLs.

*Prüfverfahren:* Lesesystem ohne Netz öffnet ein Dokument; Netzwerkmitschnitt. Erwartetes
Ergebnis: 0 Abrufe der Kontext-URLs; Metadaten korrekt angezeigt.
*Grundlage:* [Q3] Publication Manifest §2 (Verarbeitung als JSON zulässig); Offline-Grundsatz [Q34] §3 Punkt 2.

#### HP-META-004 · Muss · Basis
Barrierefreiheitsmetadaten SOLLEN in `manifest.json#accessibility` nach EPUB Accessibility 1.1
stehen (`accessMode`, `accessModeSufficient`, `accessibilityFeature`, `accessibilityHazard`,
`accessibilitySummary`); `accessibility.conformsTo` DARF NICHT gesetzt sein, ohne dass ein
Prüfbericht `data/accessibility-report.json` mit Datum, Verfahren und Ergebnis je Prüfkriterium im
Container liegt.

*Prüfverfahren:* Wenn `accessibility.conformsTo` vorhanden: Bericht vorhanden, enthält
`date`, `method` und eine nicht leere Liste `results`. Erwartetes Ergebnis: erfüllt oder
`conformsTo` fehlt.
*Grundlage:* [Q2] EPUB Accessibility 1.1 §3; [Q33a] schema.org-Barrierefreiheitseigenschaften; Begründung [Q33] §5.4.

#### HP-META-005 · Soll · Basis
Bei Konvertierung aus einem anderen Format SOLL die Ausgangsdatei unter `original/` liegen und
`manifest.json#source` SOLL `url`, `type`, `tool` (Name und Version) und `date` nennen.

*Prüfverfahren:* Feld vorhanden; `url` existiert im Container. Erwartetes Ergebnis: erfüllt.
*Grundlage:* [Q33] §4.1 (Aufbewahrung beider Fassungen bei Konvertierung).

#### HP-META-006 · Kann · Basis
`manifest.json#history` KANN eine Liste von Fassungsständen enthalten, je Eintrag `version`
(ganzzahlig aufsteigend), `dateModified`, `note` (optional) und `manifestIntegrity` (SHA-256 des
vorherigen `manifest.json`); der Bearbeiter SOLL beim Speichern einen Eintrag anfügen.

*Prüfverfahren:* Nach zwei Speichervorgängen: zwei Einträge mit aufsteigender `version` und
Zeitpunkten; `manifestIntegrity` des zweiten Eintrags entspricht dem Hash des ersten Manifests.
Erwartetes Ergebnis: erfüllt.
*Grundlage:* eigene Konvention; Zusage 4 aus [Q34].

#### HP-META-007 · Soll · Basis
Der Bearbeiter SOLL eine Funktion „Metadaten bereinigen“ anbieten, die `author`, `history`,
`source`, Anmerkungen und eingebettete Metadaten in Medien (EXIF, XMP) entfernt und das Ergebnis
auflistet.

*Prüfverfahren:* Funktion ausführen; Container entpacken; Felder und EXIF-Daten prüfen.
Erwartetes Ergebnis: entfernt; Liste der entfernten Felder angezeigt.
*Grundlage:* eigene Festlegung; Funktionsgruppe 7 in [Q33] (Metadaten entfernen).

#### HP-META-008 · Muss · Basis
Unbekannte Schlüssel in `manifest.json` MÜSSEN vom Lesesystem ignoriert werden; der Erzeuger DARF
NICHT eigene Schlüssel ohne das Präfix `x-<kennung>-` nach
[HP-VERS-005](#hp-vers-005--muss--basis) schreiben.

*Prüfverfahren:* Manifest mit zusätzlichem Schlüssel `x-test-foo` und mit unbekanntem Schlüssel
`foo` öffnen. Erwartetes Ergebnis: beide Dokumente werden angezeigt; Prüfer meldet `foo` als
Verstoß, `x-test-foo` nicht.
*Grundlage:* [Q3] Publication Manifest (Erweiterbarkeit); eigene Konvention.

---

## 13. Versionierung und Erweiterungen

#### HP-VERS-001 · Muss · Basis
Die Spezifikationsversion MUSS im Pfad von `conformsTo` stehen
(`https://hpro.example/spec/<major>.<minor>/profile/<profil>`); die Hauptversion ändert sich nur
bei inkompatiblen Änderungen, die Nebenversion bei kompatiblen Ergänzungen.

*Prüfverfahren:* `conformsTo` gegen das Muster `^https://hpro\.example/spec/\d+\.\d+/profile/(static|interactive|signed|archive)$`
prüfen. Erwartetes Ergebnis: Treffer.
*Grundlage:* eigene Konvention (Namensraum Platzhalter bis Teil 2).

#### HP-VERS-002 · Muss · Basis
Das Lesesystem MUSS Dokumente derselben Hauptversion mit höherer Nebenversion öffnen und
anzeigen; unbekannte Schlüssel, Attribute (`data-hp-*`) und Elemente mit deklarierter Komponente
werden ignoriert bzw. durch ihr statisches Äquivalent dargestellt.

*Prüfverfahren:* Dokument mit `conformsTo` `…/spec/0.9/…` und einem unbekannten
`data-hp-zukunft`-Attribut in einem Lesesystem für 0.1 öffnen. Erwartetes Ergebnis: Anzeige ohne
Fehler; Hinweis „neuere Version“ zulässig.
*Grundlage:* [Q34] §4c (Aufwärtskompatibilität).

#### HP-VERS-003 · Muss · Basis
Eine neue Nebenversion dieser Spezifikation DARF NICHT die Bedeutung bestehender Schlüssel,
Attribute oder Regelkennungen ändern und DARF NICHT eine bestehende Soll- oder Kann-Anforderung zur
Muss-Anforderung machen; die Testsuite der vorherigen Nebenversion MUSS gegen ein Lesesystem der
neuen Nebenversion bestehen.

*Prüfverfahren:* Testsuite der Version n.m gegen Lesesystem n.(m+1) ausführen. Erwartetes
Ergebnis: alle Tests bestanden.
*Grundlage:* eigene Festlegung (Governance in Teil 2).

#### HP-VERS-004 · Muss · Basis
Erweiterungen MÜSSEN in `manifest.json#extensions` mit `id` (URI des Erweiterungsnamensraums),
`required` (boolesch) und optional `url` (Beschreibung) deklariert sein; Dateien einer Erweiterung
liegen unter `ext/<kennung>/`.

*Prüfverfahren:* Jede Datei unter `ext/<kennung>/` gehört zu einem Eintrag mit passender
`kennung` (letztes Pfadsegment der `id` oder explizites Feld `dir`). Erwartetes Ergebnis: erfüllt.
*Grundlage:* eigene Konvention; [Q34] §4a (Erweiterungsmechanismus).

#### HP-VERS-005 · Muss · Basis
Eigene Namen von Dritten MÜSSEN einen Kennungs-Präfix tragen: JSON-Schlüssel `x-<kennung>-…`,
HTML-Attribute `data-x-<kennung>-…`, Custom Elements `x-<kennung>-…`, CSS-Variablen
`--x-<kennung>-…`, Sperrregeln `x-<kennung>-…`; `hp` ist für diese Spezifikation reserviert.

*Prüfverfahren:* Alle Schlüssel, Attribute, Elementnamen und Variablen mit Bindestrich sammeln;
jeder ist entweder in dieser Spezifikation definiert (`hp-`, `data-hp-`, `--hp-`) oder trägt
`x-<kennung>-`. Erwartetes Ergebnis: 0 undeklarierte Namen.
*Grundlage:* eigene Konvention; [Q12] HTML (`data-*`, Custom-Element-Namen).

#### HP-VERS-006 · Muss · Basis
Das Lesesystem MUSS ein Dokument mit unbekannter Erweiterung vollständig anzeigen; bei
`required: true` MUSS es einen Hinweis zeigen, dass eine Erweiterung fehlt, DARF aber NICHT die
Anzeige verweigern.

*Prüfverfahren:* Dokument mit unbekannter Erweiterung (`required: true`) öffnen. Erwartetes
Ergebnis: Inhalt sichtbar; Hinweis mit der Erweiterungs-`id`.
*Grundlage:* [Q34] §4a („ein Standardleser bricht daran nicht“).

#### HP-VERS-007 · Muss · Basis
Erweiterungen DÜRFEN NICHT Muss-Anforderungen dieser Spezifikation aufheben, insbesondere nicht
Skripte außerhalb von `components/`, externe Ressourcen oder Netzzugriffe einführen.

*Prüfverfahren:* Prüfungen nach HP-CONT-010, HP-INH-012 und HP-SBX-002 schließen `ext/` ein.
Erwartetes Ergebnis: 0 Verstöße.
*Grundlage:* eigene Festlegung.

#### HP-VERS-008 · Kann · Basis
Ein Prüfer KANN seine Konformitätsaussage als `data/conformance-report.json` ablegen (`spec`,
`levels`, `checkedAt`, `tool`, `results`); die Aussage „ist hpro 0.1“ gilt nur mit einem solchen
Bericht ohne Fehler.

*Prüfverfahren:* Bericht vorhanden, `results` ohne Einträge der Klasse Fehler. Erwartetes
Ergebnis: Stufen in `levels` entsprechen den bestandenen Regeln.
*Grundlage:* [Q34] §4b; Fehlerklassen in Teil 1.

---

## 14. Lesesysteme und Bearbeiter

#### HP-RS-001 · Muss · Basis
Das Lesesystem MUSS ein Dokument ohne Netzwerkverbindung, ohne Konto und ohne Serverdienst
vollständig öffnen, anzeigen, durchsuchen und drucken.

*Prüfverfahren:* Netzwerk trennen; Dokument öffnen, suchen, drucken. Erwartetes Ergebnis: alle
Funktionen verfügbar; Netzwerkmitschnitt leer.
*Grundlage:* [Q34] §3 Punkt 2 („Eine Datei, kein Dienst“).

#### HP-RS-002 · Muss · Basis
Das Lesesystem MUSS die Nutzervariablen nach [HP-INH-004](#hp-inh-004--muss--basis) setzen können:
Schriftgröße (mindestens 100–200 %), Zeilenhöhe (1,0–2,0), Buchstaben- und Wortabstand,
Absatzabstand, Farbschema (hell, dunkel, hoher Kontrast).

*Prüfverfahren:* Jede Einstellung ändern; berechnete Werte im Dokument ändern sich entsprechend.
Erwartetes Ergebnis: erfüllt.
*Grundlage:* [Q15] WCAG 2.2 Erfolgskriterien 1.4.4, 1.4.12; EAA-Pflicht aus [Q33] §3.1.

#### HP-RS-003 · Muss · Basis
Das Lesesystem MUSS Volltextsuche über alle Inhaltsdokumente einschließlich zugeklappter
`details`, eingeklappter Prioritätsblöcke und statischer Äquivalente anbieten und Treffer mit
Adresse ausgeben.

*Prüfverfahren:* Wort suchen, das nur in einem zugeklappten `details` vorkommt. Erwartetes
Ergebnis: Treffer mit Adresse; Sprung öffnet das `details`.
*Grundlage:* Zusage 3 aus [Q34]; [Q37] §6 („Suchen über Text, nicht über Pixel“).

#### HP-RS-004 · Muss · Basis
Lesesystem und Dokument MÜSSEN vollständig mit Tastatur bedienbar sein; der Dokumentinhalt MUSS
im Accessibility-Baum der Plattform erreichbar sein.

*Prüfverfahren:* Tastaturdurchlauf (Tab, Umschalt+Tab, Enter, Pfeiltasten) über Oberfläche und
Dokument; Accessibility-Inspektor zeigt Überschriften, Verweise, Tabellen des Dokuments. Erwartetes
Ergebnis: alle Funktionen erreichbar, Baum vorhanden.
*Grundlage:* [Q15] WCAG 2.2 Erfolgskriterium 2.1.1; [Q34] §3 Punkt 5.

#### HP-RS-005 · Muss · Basis
Der Bearbeiter MUSS Änderungen am Text als Änderung des XHTML-Quelltexts speichern (Text bleibt
Text); er DARF NICHT Änderungen als Overlay, als Bild oder als absolut positionierte Ersetzung
ablegen.

*Prüfverfahren:* Absatz ändern, speichern, Container entpacken. Erwartetes Ergebnis: neuer Text
steht im Inhaltsdokument an der Stelle des alten; keine neuen Elemente mit `position: absolute`;
Textextraktion zeigt den neuen Text einmal.
*Grundlage:* Zusage 4 aus [Q34]; Befund [Q37] §3a.

#### HP-RS-006 · Muss · Basis
Der Bearbeiter MUSS Struktur erhalten: Überschriften bleiben `h1`–`h6`, Listen `ul`/`ol`, Tabellen
`table` mit `th`, Verweise `a`; er DARF NICHT Struktur durch formatierte Absätze ersetzen.

*Prüfverfahren:* Dokument mit allen Strukturtypen öffnen, trivial ändern, speichern; Anzahl der
Strukturelemente vor/nach vergleichen. Erwartetes Ergebnis: gleich.
*Grundlage:* Zusage 4 aus [Q34]; [Q15] WCAG 2.2 Erfolgskriterium 1.3.1.

#### HP-RS-007 · Soll · Basis
Der Bearbeiter SOLL zwei Fassungen desselben Dokuments (gleiche `id`) auf Text- und Strukturebene
vergleichen und geänderte Überschriften, Absätze, Tabellenzellen und entfernte Bilder je Adresse
ausweisen.

*Prüfverfahren:* Zwei Fassungen mit je einer Änderung dieser vier Arten vergleichen. Erwartetes
Ergebnis: vier Befunde mit Adressen; keine Bilddifferenz.
*Grundlage:* Zusage 4 aus [Q34]; [Q37] §6 (Versionierung mit Diff).

#### HP-RS-008 · Muss · Basis
Das Lesesystem MUSS vor jeder Übertragung von Dokumentdaten an einen Dienst (Export, Import,
Validierung, Signatur) den Nutzer darauf hinweisen, dass Daten das Gerät verlassen, und den Dienst
nennen.

*Prüfverfahren:* Funktion mit Dienstanbindung aufrufen. Erwartetes Ergebnis: Hinweis mit
Dienstname vor der Übertragung; Abbruch möglich.
*Grundlage:* [Q39] §1.1 Regel 2; [Q37] §2 (Datenschutz).

#### HP-RS-009 · Muss · Basis
Externe Hyperlinks MÜSSEN außerhalb des Dokumentrahmens geöffnet werden (Systembrowser oder
Lesesystem-Dialog) und erst nach Anzeige der Ziel-URL.

*Prüfverfahren:* Externen Link aktivieren. Erwartetes Ergebnis: Dialog mit vollständiger URL;
Öffnen erst nach Bestätigung; Dokumentrahmen navigiert nicht.
*Grundlage:* [Q33] §2.4 Punkt 3.

#### HP-RS-010 · Muss · Basis
Das Lesesystem MUSS die fließende Darstellung bei Fensterbreiten von 320 bis 1920 CSS-Pixeln
ohne waagrechtes Scrollen des Fließtexts und ohne Skalierung des Gesamtdokuments („Zoom auf ein
Blatt“) anbieten.

*Prüfverfahren:* Fenster auf 320, 768, 1280, 1920 px setzen; `scrollWidth` des Dokumentrahmens
und Zeilenlänge prüfen (Fließtext bricht um, keine einheitliche Skalierung). Erwartetes Ergebnis:
erfüllt in allen Breiten.
*Grundlage:* Zusage 1 aus [Q34]; [Q15] WCAG 2.2 Erfolgskriterium 1.4.10.

#### HP-RS-011 · Soll · Basis
Das Lesesystem SOLL Anmerkungen als W3C Web Annotations (JSON-LD) in `annotations/` speichern,
mit `target.source` = Adresse und optional `TextQuoteSelector`; Anmerkungen DÜRFEN unsigniert
bleiben und werden nach [HP-SIG-013](#hp-sig-013--muss--signiert) als nicht signiert ausgewiesen.

*Prüfverfahren:* Anmerkung anlegen, speichern, Container entpacken. Erwartetes Ergebnis: Datei
unter `annotations/` mit `@context` `http://www.w3.org/ns/anno.jsonld`, `target.source` = Adresse.
*Grundlage:* [Q20] Web Annotation Data Model.

#### HP-RS-012 · Muss · Basis
Das Lesesystem MUSS die EPUB-Rückfallebene unangetastet lassen: Speichern ohne inhaltliche
Änderung erzeugt einen Container, der weiterhin [HP-CONT-017](#hp-cont-017--muss--basis) erfüllt.

*Prüfverfahren:* Dokument öffnen und ohne Änderung speichern; EPUB-Validator. Erwartetes
Ergebnis: 0 Fehler.
*Grundlage:* [Q1] EPUB 3.3.

---

## 15. Mindestprofil für Büroprogramme

Das Mindestprofil ist eine kleine, klar abgegrenzte Teilmenge der Stufe Basis im Profil `static`,
die ein Textprogramm sicher erzeugen kann: Überschriften, Absätze, Listen, Tabellen, Bilder,
Fußnoten und Verweise, dazu die Zuordnung von Formatvorlagen auf Struktur ([Q34] Abschnitt f). Es
lockert keine Anforderung: ein Dokument des Mindestprofils erfüllt alle Muss-Anforderungen der Stufe
Basis und zusätzlich die Anforderungen dieses Abschnitts. Alles, was darüber hinausgeht, ist
optional und wird als Erweiterung deklariert ([HP-VERS-004](#hp-vers-004--muss--basis)).

### 15.1 Elementbestand

| Baustein | XHTML-Elemente | Zulässige Attribute (zusätzlich `id`, `class`, `lang`, `xml:lang`, `dir`) |
|---|---|---|
| Rahmen | `html`, `head`, `title`, `meta`, `link` (nur `rel="stylesheet"` auf eine Datei im Container), `body`, `section` | `charset`, `rel`, `href`, `type` |
| Überschrift | `h1`–`h6` | – |
| Absatz und Zeichen | `p`, `br`, `blockquote`, `pre`, `em`, `strong`, `sub`, `sup`, `code`, `span` | – |
| Liste | `ul`, `ol`, `li` | `start`, `reversed` (nur `ol`) |
| Tabelle | `table`, `caption`, `thead`, `tbody`, `tr`, `th`, `td` | `colspan`, `rowspan`, `scope`, `headers`, `data-hp-table` |
| Bild | `figure`, `img`, `figcaption` | `src`, `alt`, `width`, `height` |
| Fußnote, Endnote | `a`, `aside`, `section`, `ol`, `li` | `href`, `role` (`doc-noteref`, `doc-footnote`, `doc-endnotes`, `doc-backlink`), `epub:type` (`noteref`, `footnote`, `endnotes`) |
| Verweis | `a` | `href` |
| Vorlagenname | alle Elemente dieser Tabelle | `data-hp-style` ([HP-MIN-012](#hp-min-012--kann--basis)) |

Das Attribut `epub:type` steht im Namensraum `http://www.idpf.org/2007/ops` ([Q45]); die Werte von
`role` stammen aus [Q44]. Ausgenommen vom Elementbestand ist das Navigationsdokument
([HP-ADR-007](#hp-adr-007--muss--basis)), das nach [Q1] aufgebaut ist.

### 15.2 Zuordnung von Formatvorlagen auf Struktur

Die Struktur ergibt sich aus der Formatvorlage, der Gliederungsebene oder der Listen- bzw.
Tabellendefinition der Quelle, nie aus dem bloßen Aussehen (Schriftgröße, Fettdruck, Einzug). Eine
eigene Vorlage wird über ihre Basisvorlage aufgelöst (ODF `style:parent-style-name`, OOXML
`w:basedOn`), bis eine Zeile dieser Tabelle zutrifft; trifft keine zu, ist das Ergebnis `p`.
Spalten ODF nach [Q42], OOXML nach [Q43] Teil 1 (beide informativ, als Lesehilfe für Erzeuger).

| Formatvorlage / Merkmal der Quelle | hpro | ODF | OOXML |
|---|---|---|---|
| Dokumenttitel (Titelvorlage) | `h1` am Anfang des ersten Inhaltsdokuments; Text zugleich `manifest.json#name`, sofern nicht anders gesetzt | Absatzvorlage „Titel“ des Programms | Absatzvorlage „Titel“ des Programms |
| Überschrift der Gliederungsebene *n* | `h<n+1>`, wenn die Quelle eine Titelvorlage nutzt, sonst `h<n>`; Ebenen jenseits von `h6` werden `h6` | `text:h` mit `text:outline-level="n"` bzw. Vorlage mit `style:default-outline-level` | Absatz mit `w:outlineLvl w:val="n−1"` (direkt oder über die Vorlage) |
| Standardabsatz, Textkörper | `p` | `text:p` | `w:p` ohne Gliederungsebene |
| Zitatvorlage | `blockquote` mit `p` | Absatzvorlage „Zitat“ des Programms | Absatzvorlage „Zitat“ des Programms |
| Vorformatierter Text, Quelltext | `pre` (Absatz) bzw. `code` (Zeichen) | Vorlage „Vorformatierter Text“ / „Quelltext“ | Vorlage „Quelltext“ / „HTML-Code“ |
| Hervorhebung, starke Hervorhebung | `em`, `strong` | Zeichenvorlagen „Betont“, „Stark betont“ | Zeichenvorlagen „Hervorhebung“, „Fett“ |
| Hochgestellt, tiefgestellt | `sup`, `sub` | `style:text-position` | `w:vertAlign` |
| Aufzählung (Ebene *k*) | `ul`/`li`, Ebene *k* als verschachtelte Liste im `li` der Ebene *k−1* | `text:list` mit `text:list-level-style-bullet` | `w:numPr` mit `w:ilvl="k−1"`, `w:numFmt="bullet"` |
| Nummerierung (Ebene *k*) | `ol`/`li`, `start` bei Beginn ≠ 1 oder fortgesetzter Zählung | `text:list` mit `text:list-level-style-number`, `text:start-value`, `text:continue-numbering` | `w:numPr`, `w:numFmt` ≠ `bullet`, `w:start`, `w:startOverride` |
| Tabelle | `table`, `tbody`, `tr`, `td` | `table:table`, `table:table-row`, `table:table-cell` | `w:tbl`, `w:tr`, `w:tc` |
| Wiederholte Kopfzeile | `thead` mit `th scope="col"` | `table:table-header-rows` | `w:tblHeader` in `w:trPr` |
| Verbundene Zellen | `colspan` / `rowspan` | `table:number-columns-spanned` / `table:number-rows-spanned` | `w:gridSpan` / `w:vMerge` |
| Beschriftung einer Tabelle | `caption` | Beschriftungsabsatz mit `text:sequence` an der Tabelle | Beschriftungsabsatz mit Feld `SEQ` an der Tabelle |
| Bild mit Beschriftung | `figure` mit `img` und `figcaption` | `draw:frame` mit `draw:image`; Beschriftungsabsatz mit `text:sequence` | `w:drawing`; Beschriftungsabsatz mit Feld `SEQ` |
| Alternativtext eines Bildes | `img/@alt` | `svg:title` / `svg:desc` am `draw:frame` | `wp:docPr/@descr` |
| Fußnote | `a role="doc-noteref" epub:type="noteref"` + `aside role="doc-footnote" epub:type="footnote"` | `text:note text:note-class="footnote"` | `w:footnoteReference` + Teil `footnotes` |
| Endnote | `a role="doc-noteref" epub:type="noteref"` + Eintrag `li` in `section role="doc-endnotes" epub:type="endnotes"` | `text:note text:note-class="endnote"` | `w:endnoteReference` + Teil `endnotes` |
| Textmarke | `id` am Zielelement | `text:bookmark`, `text:bookmark-start` | `w:bookmarkStart w:name` |
| Querverweis auf Überschrift, Textmarke, Tabelle, Bild | `a href="pfad#kennung"` | `text:bookmark-ref`, `text:reference-ref`, `text:sequence-ref` | Feld `REF` |
| Seitenverweis („siehe Seite 7“) | `a href="pfad#kennung"` mit dem Text des Ziels statt der Seitenzahl | Verweis mit `text:reference-format="page"` | Feld `PAGEREF` |
| Hyperlink | `a href` mit absoluter URL | `text:a xlink:href` | `w:hyperlink r:id` (extern) bzw. `w:anchor` (intern) |
| Direkte Formatierung ohne Vorlage | keine Struktur; KANN als CSS-Klasse übernommen werden | automatische Vorlagen | `w:rPr` / `w:pPr` im Absatz |

### 15.3 Anforderungen

#### HP-MIN-001 · Muss · Basis
Ein Dokument, das das Mindestprofil beansprucht, MUSS das Profil `static` haben, in
`manifest.json` den Schlüssel `subset` mit dem Wert
`https://hpro.example/spec/0.1/subset/office-min` tragen und alle Muss-Anforderungen der Stufe
Basis erfüllen; das Mindestprofil DARF NICHT als Begründung für eine Abweichung von einer
Basis-Anforderung dienen.

*Prüfverfahren:* `manifest.json` lesen; `conformsTo` endet auf `/profile/static`, `subset` hat den
genannten Wert; danach alle Muss-Anforderungen der Stufe Basis prüfen. Erwartetes Ergebnis: beide
Werte wie angegeben, 0 Verstöße gegen Basis-Muss-Anforderungen.
*Grundlage:* eigene Konvention; [Q34] Abschnitt f (Mindestprofil als Teilmenge).

#### HP-MIN-002 · Muss · Basis
Inhaltsdokumente eines Dokuments im Mindestprofil MÜSSEN sich auf die Elemente und Attribute der
Tabelle in 15.1 beschränken; ein Erzeuger, der darüber hinaus etwas schreibt, MUSS es als
Erweiterung nach [HP-VERS-004](#hp-vers-004--muss--basis) deklarieren und DARF dann `subset` nicht
setzen.

*Prüfverfahren:* In allen Inhaltsdokumenten außer dem Navigationsdokument jedes Element und
Attribut sammeln und gegen die Tabelle in 15.1 abgleichen (Werte von `role` und `epub:type`
eingeschlossen). Erwartetes Ergebnis: 0 Elemente oder Attribute außerhalb des Bestands.
*Grundlage:* eigene Teilmenge von [Q12] HTML und [Q1] EPUB 3.3; [Q34] Abschnitt f.

#### HP-MIN-003 · Muss · Basis
Der Erzeuger MUSS Überschriften, Absätze, Zitate, vorformatierten Text, Zeichenauszeichnung,
Listen, Tabellen, Bilder, Fußnoten, Endnoten und Verweise nach der Tabelle in 15.2 aus Formatvorlage,
Gliederungsebene, Listen- oder Tabellendefinition der Quelle ableiten; er DARF NICHT Struktur aus dem
bloßen Aussehen erraten und DARF NICHT eine Überschrift, Liste oder Tabelle der Quelle als
formatierten Absatz schreiben.

*Prüfverfahren:* Eine Quelldatei mit je einem Exemplar jeder Zeile der Tabelle in 15.2 und einem
fett gesetzten, vergrößerten Standardabsatz umwandeln; Elemente zählen. Erwartetes Ergebnis: jede
Zeile ergibt genau das Element der Spalte „hpro“; die Gliederungsebenen erscheinen mit der dort
genannten Verschiebung; der vergrößerte Standardabsatz ist ein `p`.
*Grundlage:* [Q42] ODF 1.3 Teil 3; [Q43] ECMA-376 Teil 1; [Q15] WCAG 2.2 Erfolgskriterium 1.3.1.

#### HP-MIN-004 · Muss · Basis
Der Erzeuger MUSS jede Überschrift, Tabelle, Abbildung und Fußnote mit einer Kennung nach
[HP-ADR-002](#hp-adr-002--muss--basis) versehen; ein Textmarkenname der Quelle, der das Muster
erfüllt, MUSS als Kennung des Zielelements übernommen werden; die erneute Umwandlung derselben,
unveränderten Quelldatei MUSS dieselben Kennungen ergeben.

*Prüfverfahren:* Quelldatei mit einer Textmarke `Kostenstand` an einer Überschrift zweimal
umwandeln; die `id`-Listen beider Ergebnisse vergleichen. Erwartetes Ergebnis: die Überschrift trägt
`id="Kostenstand"`; beide Listen sind gleich und vollständig.
*Grundlage:* eigene Festlegung; stabile Adressen nach Zusage 3 aus [Q34].

#### HP-MIN-005 · Muss · Basis
Listen MÜSSEN als `ul` bzw. `ol` mit `li` geschrieben werden; eine untergeordnete Listenebene MUSS
als eigene Liste innerhalb des `li` der übergeordneten Ebene stehen; eine Nummerierung, die nicht
bei 1 beginnt oder eine frühere Liste fortsetzt, MUSS ihren ersten Wert in `start` tragen.
Aufzählungszeichen und Nummern DÜRFEN NICHT als Text im `li` stehen.

*Prüfverfahren:* Quelldatei mit einer dreistufigen gemischten Liste und einer Nummerierung, die
nach einem Absatz bei 4 fortsetzt, umwandeln. Erwartetes Ergebnis: verschachtelte `ul`/`ol` in drei
Ebenen; die fortgesetzte Liste ist `ol start="4"`; kein `li` beginnt mit einem Aufzählungszeichen
oder einer Zahl mit Punkt aus der Quelle.
*Grundlage:* [Q12] HTML (`ol`, `start`); [Q15] WCAG 2.2 Erfolgskriterium 1.3.1.

#### HP-MIN-006 · Muss · Basis
Tabellen MÜSSEN als `table` mit `tr` und `td` geschrieben werden; als wiederholte Kopfzeile
markierte Zeilen MÜSSEN `thead` mit `th scope="col"` ergeben, verbundene Zellen `colspan` bzw.
`rowspan`, eine Tabellenbeschriftung `caption`. Die Zahl der Spalten jeder Zeile, mit Spannen
gezählt, MUSS gleich sein.

*Prüfverfahren:* Quelltabelle mit 4 Zeilen und 3 Spalten, wiederholter Kopfzeile, einer waagrecht
und einer senkrecht verbundenen Zelle und Beschriftung umwandeln. Erwartetes Ergebnis: ein `thead`
mit 3 `th scope="col"`; `colspan="2"` und `rowspan="2"` an den Zellen der Quelle; `caption` mit dem
Beschriftungstext; jede Zeile zählt 3 Spalten.
*Grundlage:* [Q12] HTML (Tabellenmodell); [Q15] WCAG 2.2 Erfolgskriterium 1.3.1; [HP-INH-008](#hp-inh-008--soll--basis).

#### HP-MIN-007 · Muss · Basis
Bilder MÜSSEN als Datei im Container mit einem Kernmedientyp nach
[HP-CONT-015](#hp-cont-015--muss--basis) in `figure` mit `img` stehen; Formate außerhalb der
Kernmedientypen MÜSSEN in PNG oder SVG umgewandelt werden. Der Alternativtext der Quelle MUSS als
`alt`, eine Bildbeschriftung als `figcaption` übernommen werden; fehlt der Alternativtext, MUSS der
Erzeuger das Bild in seiner Meldung benennen und DARF `alt=""` nur setzen, wenn die Quelle das Bild
als dekorativ markiert.

*Prüfverfahren:* Quelldatei mit drei Bildern umwandeln: mit Alternativtext und Beschriftung; als
dekorativ markiert; ohne Alternativtext in einem Vektorformat außerhalb der Kernmedientypen.
Erwartetes Ergebnis: erstes `img` mit übernommenem `alt` und `figcaption`; zweites `alt=""`; drittes
als PNG oder SVG im Container und in der Meldung des Erzeugers benannt; alle `src` zeigen auf
Dateien im Container.
*Grundlage:* [Q15] WCAG 2.2 Erfolgskriterium 1.1.1; [HP-INH-006](#hp-inh-006--muss--basis); [Q42]; [Q43].

#### HP-MIN-008 · Muss · Basis
Fußnoten MÜSSEN als Paar geschrieben werden: Verweis `a` mit `role="doc-noteref"`,
`epub:type="noteref"` und `href="#<kennung>"`, Notentext `aside` mit `role="doc-footnote"`,
`epub:type="footnote"` und dieser `id` im selben Inhaltsdokument, nach dem Absatz des Verweises oder
am Ende des Abschnitts. Endnoten MÜSSEN als `li` mit `id` in einer `section` mit
`role="doc-endnotes"` und `epub:type="endnotes"` stehen. Jeder Notentext MUSS genau einmal vorkommen.

*Prüfverfahren:* Quelldatei mit drei Fußnoten und einer Endnote umwandeln. Erwartetes Ergebnis:
drei Verweise, deren `href` auf ein `aside` mit `role="doc-footnote"` im selben Dokument zeigt; ein
Verweis auf ein `li` in `section role="doc-endnotes"`; Zahl der Verweise = Zahl der Notentexte;
die Textextraktion enthält jeden Notentext genau einmal.
*Grundlage:* [Q44] DPUB-ARIA 1.1 (`doc-noteref`, `doc-footnote`, `doc-endnotes`); [Q45] EPUB 3 Structural Semantics Vocabulary 1.1 (`noteref`, `footnote`, `endnotes`).

#### HP-MIN-009 · Muss · Basis
Verweise MÜSSEN als `a` mit `href` geschrieben werden: Querverweise und Seitenverweise innerhalb
des Dokuments als Adresse `pfad#kennung` nach [HP-ADR-003](#hp-adr-003--muss--basis) auf ein
existierendes Zielelement, externe Hyperlinks als absolute URL. Der Verweistext DARF NICHT eine
Seitenzahl der Quelle enthalten; ein Seitenverweis zeigt stattdessen den Text oder die Nummer des
Ziels.

*Prüfverfahren:* Quelldatei mit je einem Querverweis auf Überschrift, Textmarke, Tabelle und Bild,
einem Seitenverweis und einem externen Hyperlink umwandeln. Erwartetes Ergebnis: sechs `a`; die fünf
internen lösen auf eine existierende `id` auf; der externe beginnt mit `https:` oder `http:`; kein
Verweistext der Form „Seite <Zahl>“.
*Grundlage:* [Q12] HTML (`a`, Fragmente); eigene Festlegung (Adressen statt Seitenzahlen, Abschnitt 5).

#### HP-MIN-010 · Soll · Basis
Das Lesesystem SOLL den Notentext einer Fußnote beim Aktivieren des Verweises an der Leseposition
einblenden, ohne die Leseposition zu verlassen, und eine Rückkehr zum Verweis anbieten; ohne diese
Funktion MUSS der Verweis zum Notentext springen.

*Prüfverfahren:* Fußnotenverweis mit Maus und mit Tastatur aktivieren, dann schließen bzw.
zurückspringen. Erwartetes Ergebnis: Notentext sichtbar, Leseposition unverändert; Fokus kehrt zum
Verweis zurück.
*Grundlage:* [Q44] DPUB-ARIA 1.1; [Q15] WCAG 2.2 Erfolgskriterium 2.4.3.

#### HP-MIN-011 · Soll · Basis
Ein Lesesystem mit Export in ein Büroformat SOLL die Tabelle in 15.2 umgekehrt anwenden, sodass
Export und erneute Umwandlung eines Dokuments im Mindestprofil dieselben Strukturelemente ergeben.

*Prüfverfahren:* Ein Dokument im Mindestprofil mit allen Bausteinen aus 15.1 nach ODF exportieren
und wieder umwandeln; Strukturelemente und Fließtext vergleichen. Erwartetes Ergebnis: gleiche Zahl
und Art der Strukturelemente, gleicher Fließtext.
*Grundlage:* [Q42] ODF 1.3 Teil 3; eigene Festlegung.

#### HP-MIN-012 · Kann · Basis
Der Erzeuger KANN den Namen der Formatvorlage der Quelle in `data-hp-style` und direkte
Formatierung als CSS-Klasse übernehmen; beides DARF NICHT die Struktur nach 15.2 ersetzen.

*Prüfverfahren:* Ergebnis einer Umwandlung einmal mit und einmal ohne alle Stylesheets und
`data-hp-style` rendern; Accessibility-Baum vergleichen. Erwartetes Ergebnis: gleiche Überschriften,
Listen, Tabellen, Abbildungen und Verweise in beiden Fassungen.
*Grundlage:* eigene Konvention; [Q15] WCAG 2.2 Erfolgskriterium 1.3.1.

---

## 16. Konformität

### 16.1 Konformitätsaussage

Ein Dokument ist „hpro 0.1, Stufe Basis“, wenn es alle Muss-Anforderungen der Stufe Basis
erfüllt. Es ist zusätzlich „Stufe Lebendig“, „Stufe Signiert“ bzw. „Stufe Archiv“, wenn es alle
Muss-Anforderungen dieser Stufe (und der enthaltenen Stufen) erfüllt. Soll-Anforderungen erzeugen
Warnungen, Kann-Anforderungen Hinweise (Fehlerklassen in Teil 1). Für Lesesysteme und Bearbeiter
gilt dasselbe für die an sie gerichteten Anforderungen.

### 16.2 Zuordnung jeder Anforderung zu einer Stufe

Diese Tabelle wird aus den Überschriften der Anforderungen erzeugt und mechanisch gegen sie
geprüft (`node scripts/check-spec.mjs`). Spalte „Subjekt“: D = Dokument, E = Erzeuger,
B = Bearbeiter, L = Lesesystem, P = Prüfer.

<!-- KONFORMITAETSTABELLE ANFANG -->
| Kennung | Grad | Stufe | Subjekt | Kurztitel |
|---|---|---|---|---|
| HP-CONT-001 | Muss | Basis | D | ZIP mit Methoden 0 und 8, ohne Verschlüsselung und ZIP64 |
| HP-CONT-002 | Muss | Basis | D | `mimetype` erste Datei, unkomprimiert, `application/epub+zip` |
| HP-CONT-003 | Muss | Basis | D | `META-INF/container.xml` nach OCF |
| HP-CONT-004 | Muss | Basis | D | `package.opf` als gültiges EPUB-3-Package |
| HP-CONT-005 | Muss | Basis | D | `manifest.json` maßgeblich, UTF-8-JSON |
| HP-CONT-006 | Muss | Basis | D | Pfadregeln und Eindeutigkeit |
| HP-CONT-007 | Muss | Basis | D | Reservierte Pfade und `META-INF/` |
| HP-CONT-008 | Muss | Basis | D | Hash-Manifest mit `sha256-` je Ressource |
| HP-CONT-009 | Muss | Basis | L | Hashprüfung vor Anzeige, `unlisted` benennen |
| HP-CONT-010 | Muss | Basis | D | Keine externen Ressourcen |
| HP-CONT-011 | Muss | Basis | L | Härtung des ZIP-Lesers |
| HP-CONT-012 | Soll | Basis | L | Mindestgrenzen und Abbruchmeldung |
| HP-CONT-013 | Muss | Basis | D, L | Endung `.hpro`/`.epub`, Erkennung über Inhalt |
| HP-CONT-014 | Soll | Basis | E | Deterministisches Schreiben |
| HP-CONT-015 | Muss | Basis | D, L | Media-Types und Kernmedientypen |
| HP-CONT-016 | Muss | Basis | D | Keine Teilverschlüsselung im Container |
| HP-CONT-017 | Muss | Basis | D | Gültiges EPUB 3 (0 Fehler) |
| HP-INH-001 | Muss | Basis | D | XHTML-Serialisierung |
| HP-INH-002 | Muss | Basis | D | Sprache am Wurzelelement |
| HP-INH-003 | Muss | Basis | D | Lesbar bei 320 px ohne waagrechtes Scrollen |
| HP-INH-004 | Muss | Basis | D | Nutzervariablen `--hp-*` respektieren |
| HP-INH-005 | Soll | Basis | D | DOM-Reihenfolge = Lesereihenfolge |
| HP-INH-006 | Muss | Basis | D | Alternativtexte für Bilder und SVG |
| HP-INH-007 | Soll | Basis | D | Überschriftenhierarchie |
| HP-INH-008 | Soll | Basis | D | Tabellenköpfe und `caption` |
| HP-INH-009 | Soll | Basis | D | Schriften WOFF2 mit generischem Rückfall |
| HP-INH-010 | Soll | Basis | D, L | Tabellenstrategie für schmale Breiten |
| HP-INH-011 | Muss | Basis | D | Text ist Text |
| HP-INH-012 | Muss | Basis | D | Keine Skripte außerhalb `interactive` |
| HP-INH-013 | Muss | Basis | D | Statisches Äquivalent für Video und Audio |
| HP-INH-014 | Muss | Basis | D | Reduzierte Bewegung |
| HP-INH-015 | Kann | Basis | D, L | MathML und inline SVG |
| HP-INH-016 | Soll | Basis | D | Zusammenhalt und Container Queries |
| HP-ADR-001 | Muss | Basis | D | Kennung je Abschnitt |
| HP-ADR-002 | Muss | Basis | D | Syntax und Eindeutigkeit der Kennung |
| HP-ADR-003 | Muss | Basis | D, L | Adresse `pfad#kennung` und Langform |
| HP-ADR-004 | Muss | Basis | B | Kennungen bleiben stabil |
| HP-ADR-005 | Muss | Basis | L | Adresse unabhängig von Breite und Schrift auflösen |
| HP-ADR-006 | Kann | Basis | L | Textfragmente als Rückfall |
| HP-ADR-007 | Muss | Basis | D | Navigationsdokument verweist auf Adressen |
| HP-ADR-008 | Kann | Basis | D, L | Zelladressen und Wertverweise |
| HP-NEST-001 | Muss | Basis | D | Aufklappen mit `details` |
| HP-NEST-002 | Soll | Basis | D, L | Detailtiefe `data-hp-priority` |
| HP-NEST-003 | Muss | Basis | D, L | Anhänge im Container |
| HP-NEST-004 | Muss | Basis | D, L | Unterdokumente aus dem Container |
| HP-NEST-005 | Soll | Basis | D | Überblick bei langen Dokumenten |
| HP-PROF-001 | Muss | Basis | D | Genau ein Profil in `conformsTo` |
| HP-PROF-002 | Muss | Basis | D | Keine Komponenten in statischen Profilen |
| HP-PROF-003 | Muss | Lebendig | D | Komponenten deklariert |
| HP-PROF-004 | Muss | Signiert | D | Signatur über alle Dateien |
| HP-PROF-005 | Muss | Archiv | D | Archiv: selbstgenügsam, Langzeitniveau |
| HP-PROF-006 | Kann | Basis | D | Eingefrorene Fassungen unter `renditions/` |
| HP-PROF-007 | Muss | Signiert | D | Eingefrorene Fassung in sich geschlossen |
| HP-PROF-008 | Muss | Signiert | D, L | Signatur der eingefrorenen Fassung |
| HP-PROF-009 | Muss | Signiert | D | Hauptfassung ändern berührt Signatur nicht |
| HP-PROF-010 | Muss | Signiert | L | Manipulation der eingefrorenen Fassung erkannt |
| HP-PROF-011 | Soll | Signiert | E | `derivedFrom` im Fassungsmanifest |
| HP-PROF-012 | Soll | Signiert | L | Beide Fassungen anzeigen, Textvergleich |
| HP-PROF-013 | Soll | Signiert | D | Sichtbarer Signaturhinweis für EPUB-Lesesysteme |
| HP-SBX-001 | Muss | Lebendig | D | Komponenten im Manifest deklariert |
| HP-SBX-002 | Muss | Lebendig | D | Skripte nur aus `components/` |
| HP-SBX-003 | Muss | Lebendig | D | Nur deklarierte Custom Elements |
| HP-SBX-004 | Muss | Lebendig | D | Statisches Äquivalent je Komponente |
| HP-SBX-005 | Muss | Lebendig | L | Sandbox-iframe ohne `allow-same-origin` |
| HP-SBX-006 | Muss | Lebendig | L | CSP ohne Netzzugriff |
| HP-SBX-007 | Muss | Lebendig | D, L | Kein Speichern außerhalb des Dokuments |
| HP-SBX-008 | Muss | Lebendig | D, L | Dokumentdaten-Kanal für `data/` |
| HP-SBX-009 | Muss | Lebendig | L | Keine Brücke zur Hülle |
| HP-SBX-010 | Muss | Lebendig | L | Hashprüfung vor Ausführung |
| HP-SBX-011 | Muss | Lebendig | L | Statisches Äquivalent bei fehlender Komponente |
| HP-SBX-012 | Kann | Lebendig | L | Eigene Kopie der Komponente bei gleichem Hash |
| HP-SBX-013 | Muss | Lebendig | D | Formulare senden nicht |
| HP-SBX-014 | Muss | Lebendig | D | Kein Ton ohne Nutzeraktion, reduzierte Bewegung |
| HP-SBX-015 | Soll | Lebendig | L | Laufzeitbegrenzung |
| HP-SBX-016 | Muss | Basis | D | Formel und Wert gespeichert, keine Makros |
| HP-SBX-017 | Muss | Lebendig | D | Komponenten verändern nichts außerhalb, Tastatur |
| HP-LOCK-001 | Muss | Basis | D | Sperren in `manifest.json#access` |
| HP-LOCK-002 | Muss | Basis | B | `read-only` beachten |
| HP-LOCK-003 | Muss | Basis | L | `no-print` beachten |
| HP-LOCK-004 | Muss | Basis | L | `no-export` beachten |
| HP-LOCK-005 | Muss | Basis | L | `hidden` beachten und kennzeichnen |
| HP-LOCK-006 | Soll | Signiert | L | Sperren nur signiert „nachweisbar“ |
| HP-LOCK-007 | Muss | Basis | B | Redaktion löscht |
| HP-LOCK-008 | Muss | Basis | B | Redaktionsprotokoll und Platzhalter |
| HP-LOCK-009 | Soll | Basis | L | Kopieren immer möglich |
| HP-LOCK-010 | Kann | Basis | D | Umschlagverschlüsselung CMS |
| HP-SIG-001 | Muss | Signiert | D | XAdES in `META-INF/signatures.xml` mit OCF-Wurzel |
| HP-SIG-002 | Muss | Signiert | E, L | Kein CAdES |
| HP-SIG-003 | Muss | Signiert | E | Neue Signatur ans Ende, Rest unverändert |
| HP-SIG-004 | Muss | Signiert | D | Exklusive Kanonisierung |
| HP-SIG-005 | Muss | Signiert | D | Signierte Objekte vollständig plus `container.xml` |
| HP-SIG-006 | Muss | Signiert | D | `DataObjectFormat` mit echten Media-Types |
| HP-SIG-007 | Muss | Signiert | D | `SigningTime`, `SigningCertificateV2`, Gültigkeit |
| HP-SIG-008 | Muss | Signiert | D, L | Zulässige Algorithmen |
| HP-SIG-009 | Muss | Signiert | D | ODF-Manifest `META-INF/manifest.xml` |
| HP-SIG-010 | Soll | Signiert | D | Signaturzeitstempel (B-T) |
| HP-SIG-011 | Muss | Archiv | D | Langzeitniveau B-LT, SOLL B-LTA |
| HP-SIG-012 | Muss | Signiert | L | Prüfen und Urteil anzeigen |
| HP-SIG-013 | Muss | Signiert | L | Unsignierte Dateien benennen |
| HP-SIG-014 | Muss | Signiert | P | `application/epub+zip` zulässig |
| HP-SIG-015 | Muss | Signiert | L | „Qualifiziert“ nur nach Vertrauenslistenprüfung |
| HP-SIG-016 | Kann | Signiert | D, L | Signaturfelder |
| HP-SIG-017 | Soll | Signiert | L | Lineare Zusammenfassung beim Signieren |
| HP-SIG-018 | Kann | Signiert | D | Referenzdarstellung PDF/A mitsigniert |
| HP-SIG-019 | Muss | Signiert | D | Kein privates Schlüsselmaterial |
| HP-SIG-020 | Muss | Signiert | E | Gegenzeichnung lässt frühere Signaturen gültig |
| HP-PRINT-001 | Muss | Basis | D, L | Druck aus dem Fluss, keine feste Seitengeometrie |
| HP-PRINT-002 | Muss | Basis | L | A4 mit Rändern als Vorgabe |
| HP-PRINT-003 | Muss | Basis | L | Kopf- und Fußzeile mit Seitenzahlen |
| HP-PRINT-004 | Muss | Basis | L | Abschnittskennung im Ausdruck |
| HP-PRINT-005 | Muss | Basis | L | Verzeichnis mit Seitenzahlen |
| HP-PRINT-006 | Muss | Basis | L | Tabellenköpfe wiederholen, Zusammenhalt |
| HP-PRINT-007 | Muss | Basis | L | Codeblöcke umbrechen mit Markierung |
| HP-PRINT-008 | Muss | Basis | L | Nichts abgeschnitten |
| HP-PRINT-009 | Muss | Lebendig | L | Standbild mit Verweis auf lebendige Fassung |
| HP-PRINT-010 | Muss | Basis | L | `details` und Prioritätsblöcke gedruckt |
| HP-PRINT-011 | Soll | Basis | L | URLs und Zielseiten ausgeben |
| HP-PRINT-012 | Soll | Basis | L | PDF/A und PDF/UA mit Prüfung |
| HP-PRINT-013 | Kann | Basis | D | Eigenes Druckstylesheet ohne Aufhebung |
| HP-PRINT-014 | Kann | Basis | L | Seitengetreue Ansicht abgeleitet |
| HP-META-001 | Muss | Basis | D | Pflichtfelder in `manifest.json` |
| HP-META-002 | Muss | Basis | D | `package.opf` stimmt mit Manifest überein |
| HP-META-003 | Muss | Basis | L | Manifest als einfaches JSON |
| HP-META-004 | Muss | Basis | D | Barrierefreiheitsmetadaten, Konformität nur mit Bericht |
| HP-META-005 | Soll | Basis | E | Herkunft bei Konvertierung |
| HP-META-006 | Kann | Basis | D, B | Verlauf im Manifest |
| HP-META-007 | Soll | Basis | B | Metadaten bereinigen |
| HP-META-008 | Muss | Basis | E, L | Unbekannte Schlüssel ignorieren, eigene präfigieren |
| HP-VERS-001 | Muss | Basis | D | Version im `conformsTo`-Pfad |
| HP-VERS-002 | Muss | Basis | L | Höhere Nebenversion lesbar |
| HP-VERS-003 | Muss | Basis | P | Nebenversionen bleiben kompatibel |
| HP-VERS-004 | Muss | Basis | D | Erweiterungen deklariert, `ext/` |
| HP-VERS-005 | Muss | Basis | D | Präfix `x-<kennung>-` für Fremdnamen |
| HP-VERS-006 | Muss | Basis | L | Unbekannte Erweiterung bricht nicht |
| HP-VERS-007 | Muss | Basis | D | Erweiterungen heben keine Muss-Regel auf |
| HP-VERS-008 | Kann | Basis | P | Konformitätsbericht im Container |
| HP-RS-001 | Muss | Basis | L | Offline, ohne Konto, ohne Dienst |
| HP-RS-002 | Muss | Basis | L | Nutzervariablen einstellbar |
| HP-RS-003 | Muss | Basis | L | Volltextsuche mit Adressen |
| HP-RS-004 | Muss | Basis | L | Tastatur und Accessibility-Baum |
| HP-RS-005 | Muss | Basis | B | Text bleibt Text beim Bearbeiten |
| HP-RS-006 | Muss | Basis | B | Struktur bleibt Struktur |
| HP-RS-007 | Soll | Basis | B | Vergleich zweier Fassungen |
| HP-RS-008 | Muss | Basis | L | Hinweis, wenn Daten das Gerät verlassen |
| HP-RS-009 | Muss | Basis | L | Externe Links außerhalb des Rahmens |
| HP-RS-010 | Muss | Basis | L | Fließend von 320 bis 1920 px |
| HP-RS-011 | Soll | Basis | L | Anmerkungen als Web Annotations |
| HP-RS-012 | Muss | Basis | L | Rückfallebene bleibt gültig |
| HP-MIN-001 | Muss | Basis | D | Mindestprofil deklariert, Basis vollständig |
| HP-MIN-002 | Muss | Basis | D, E | Elementbestand nach 15.1 |
| HP-MIN-003 | Muss | Basis | E | Struktur aus Formatvorlagen nach 15.2 |
| HP-MIN-004 | Muss | Basis | E | Kennungen aus Textmarken, wiederholbar |
| HP-MIN-005 | Muss | Basis | D, E | Listen verschachtelt, `start` |
| HP-MIN-006 | Muss | Basis | D, E | Tabellen mit Kopfzeile, Spannen, `caption` |
| HP-MIN-007 | Muss | Basis | D, E | Bilder im Container mit `alt` und `figcaption` |
| HP-MIN-008 | Muss | Basis | D, E | Fußnoten und Endnoten als Verweis und Notentext |
| HP-MIN-009 | Muss | Basis | D, E | Verweise als Adressen, keine Seitenzahlen |
| HP-MIN-010 | Soll | Basis | L | Fußnote an der Leseposition einblenden |
| HP-MIN-011 | Soll | Basis | L | Rückweg ins Büroformat |
| HP-MIN-012 | Kann | Basis | E | Vorlagenname und direkte Formatierung |
<!-- KONFORMITAETSTABELLE ENDE -->

### 16.3 Mindestumfang je Stufe (Zusammenfassung)

| Stufe | Muss | Soll | Kann | Summe |
|---|---|---|---|---|
| Basis | 83 | 19 | 10 | 112 |
| Lebendig | 16 | 1 | 1 | 18 |
| Signiert | 20 | 6 | 2 | 28 |
| Archiv | 2 | 0 | 0 | 2 |
| **alle** | **121** | **26** | **13** | **160** |

Die Zahlen werden von `scripts/check-spec.mjs` ausgegeben und müssen mit dieser Tabelle
übereinstimmen (Beleg: [`docs/belege/S1/01-check-spec.txt`](../belege/S1/01-check-spec.txt)).

### 16.4 Konformitätsklassen: Erzeuger und Leser

Wie bei EPUB (Autorenwerkzeuge gegenüber Lesesystemen) trennt hpro, was ein Erzeuger schreiben
muss, von dem, was ein Lesesystem annehmen und leisten muss ([Q34] Abschnitt f). Jede Anforderung
gehört über ihr Subjekt in Abschnitt 16.2 zu mindestens einer Konformitätsklasse; eine Anforderung
mit mehreren Subjekten (etwa „D, L“) zählt in jeder betroffenen Klasse, daher ist die Summe der
Spalte „Anforderungen“ größer als die Zahl der Anforderungen.

| Klasse | Subjekte | Anforderungen | Wer sie beansprucht und was sie bedeutet |
|---|---|---|---|
| Erzeuger-Konformität | D, E | 100 | Software, die Dateien schreibt (Autorenwerkzeug, Exportfilter, Konverter): jedes geschriebene Dokument erfüllt die Dokument-Anforderungen (D) der beanspruchten Stufe, und der Erzeuger erfüllt die an ihn gerichteten Anforderungen (E) |
| Leser-Konformität | L | 66 | Lesesysteme: nehmen jedes konforme Dokument der beanspruchten Stufe an und erfüllen die Lesesystem-Anforderungen (L) dieser Stufe; fehlerhafte Dokumente werden nach den L-Anforderungen behandelt, nicht stillschweigend repariert |
| Bearbeiter-Konformität | B | 9 | Bearbeiter: erfüllen die Bearbeiter-Anforderungen (B) und zusätzlich Erzeuger- und Leser-Konformität, weil ein Bearbeiter zugleich liest und schreibt (Abschnitt 1.2) |
| Prüfer-Konformität | P | 3 | Konformitätsprüfer: erfüllen die Prüfer-Anforderungen (P) und melden jede verletzte Anforderung der geprüften Klasse und Stufe mit ihrer Kennung |

Eine Konformitätsaussage nennt Klasse und Stufe, zum Beispiel „hpro 0.1, Erzeuger-Konformität,
Stufe Signiert“. Ein Erzeuger des Mindestprofils (Abschnitt 15) beansprucht „Erzeuger-Konformität,
Stufe Basis, Mindestprofil“. Die Zahlen der Spalte „Anforderungen“ werden von
`scripts/check-spec.mjs` aus Abschnitt 16.2 berechnet und mit dieser Tabelle verglichen.

---

## 17. Prüfstein der Umsetzbarkeit: minimaler Erzeuger und minimaler Leser

### 17.1 Zweck

Ein Standard lebt davon, dass ihn andere einbauen. Der Prüfstein dieser Spezifikation ist deshalb
([Q34] Abschnitt f): **ein fremder Entwickler baut aus diesem Dokument allein einen minimalen
Erzeuger und einen minimalen Leser, ohne Rückfragen an die Herausgeber. Was dabei unklar bleibt,
ist ein Fehler der Dokumentation, nicht des Entwicklers.** Dieser Abschnitt legt fest, was
„minimal“ heißt, wie der Prüfstein durchgeführt wird und wann er bestanden ist. Er ist für die
Herausgeber dieser Spezifikation verbindlich; auf Dokumente, Erzeuger und Lesesysteme richtet er
keine zusätzliche Anforderung.

### 17.2 Umfang „minimal“

**Minimaler Erzeuger** (Klasse Erzeuger-Konformität, Stufe Basis, Profil `static`): Software, die aus
einer einfachen Eingabe (Titel, Sprache, Überschriften, Absätze, eine Liste, eine Tabelle) ein
Dokument schreibt, das alle Muss-Anforderungen der Stufe Basis mit Subjekt D oder E erfüllt. Bei
einem solchen Dokument ohne Medien, Komponenten, Signaturen, Sperren, eingefrorene Fassungen und
Erweiterungen sind das:

| Durch Tun zu erfüllen | Durch Weglassen erfüllt (Prüfer muss das Weglassen trotzdem feststellen) |
|---|---|
| [HP-CONT-001](#hp-cont-001--muss--basis), [HP-CONT-002](#hp-cont-002--muss--basis), [HP-CONT-003](#hp-cont-003--muss--basis), [HP-CONT-004](#hp-cont-004--muss--basis), [HP-CONT-005](#hp-cont-005--muss--basis), [HP-CONT-006](#hp-cont-006--muss--basis), [HP-CONT-008](#hp-cont-008--muss--basis), [HP-CONT-015](#hp-cont-015--muss--basis) (Media-Type je Ressource), [HP-CONT-017](#hp-cont-017--muss--basis) | [HP-CONT-007](#hp-cont-007--muss--basis), [HP-CONT-010](#hp-cont-010--muss--basis), [HP-CONT-016](#hp-cont-016--muss--basis) |
| [HP-INH-001](#hp-inh-001--muss--basis), [HP-INH-002](#hp-inh-002--muss--basis), [HP-INH-003](#hp-inh-003--muss--basis), [HP-INH-004](#hp-inh-004--muss--basis), [HP-INH-011](#hp-inh-011--muss--basis) | [HP-INH-006](#hp-inh-006--muss--basis), [HP-INH-012](#hp-inh-012--muss--basis), [HP-INH-013](#hp-inh-013--muss--basis), [HP-INH-014](#hp-inh-014--muss--basis) |
| [HP-ADR-001](#hp-adr-001--muss--basis), [HP-ADR-002](#hp-adr-002--muss--basis), [HP-ADR-007](#hp-adr-007--muss--basis) | [HP-NEST-001](#hp-nest-001--muss--basis), [HP-NEST-003](#hp-nest-003--muss--basis), [HP-NEST-004](#hp-nest-004--muss--basis) |
| [HP-PROF-001](#hp-prof-001--muss--basis), [HP-META-001](#hp-meta-001--muss--basis), [HP-META-002](#hp-meta-002--muss--basis), [HP-VERS-001](#hp-vers-001--muss--basis) | [HP-PROF-002](#hp-prof-002--muss--basis), [HP-SBX-016](#hp-sbx-016--muss--basis), [HP-LOCK-001](#hp-lock-001--muss--basis), [HP-META-008](#hp-meta-008--muss--basis), [HP-VERS-004](#hp-vers-004--muss--basis), [HP-VERS-005](#hp-vers-005--muss--basis), [HP-VERS-007](#hp-vers-007--muss--basis) |

Soll- und Kann-Anforderungen ([HP-CONT-014](#hp-cont-014--soll--basis) deterministisches Schreiben,
[HP-INH-007](#hp-inh-007--soll--basis), [HP-INH-008](#hp-inh-008--soll--basis)) sind für den
Prüfstein erwünscht, aber nicht Bedingung.

**Minimaler Leser** (Klasse Leser-Konformität, Stufe Basis, ohne Darstellung): Software, die ein
Dokument öffnet und auf einer Kommandozeile oder in einer Protokolldatei ausgibt: die Metadaten
`id`, `name`, `inLanguage`, `dateModified`, `conformsTo`; die Lesereihenfolge; je Inhaltsdokument
die Abschnitte mit Adresse `pfad#kennung` nach [HP-ADR-003](#hp-adr-003--muss--basis) und
Überschriftentext; den Fließtext in Lesereihenfolge ([HP-INH-011](#hp-inh-011--muss--basis)); das
Ergebnis der Hashprüfung mit Pfad jeder veränderten, fehlenden und nicht gelisteten Datei
([HP-CONT-009](#hp-cont-009--muss--basis)). Er erfüllt dabei [HP-CONT-011](#hp-cont-011--muss--basis)
(Härtung), [HP-CONT-013](#hp-cont-013--muss--basis) (Erkennung über Inhalt, nicht Endung) und
[HP-META-003](#hp-meta-003--muss--basis) (Manifest als einfaches JSON, kein Abruf von `@context`).
Anforderungen, die eine Bildschirmdarstellung, einen Druckweg oder Bedienung voraussetzen (RS,
PRINT, LOCK, SBX, ADR-005, NEST-002), gehören nicht zum minimalen Leser; der Prüfstein misst die
Beschreibung des Dateiformats, nicht die einer Oberfläche.

### 17.3 Verfahren

1. **Teilnehmer:** eine Person oder ein Werkzeug, die an dieser Spezifikation, der
   Referenzimplementierung und den Belegen nicht beteiligt war und keinen Zugriff darauf hat.
   Zur Verfügung stehen ausschließlich dieses Dokument und die in Abschnitt 20 zitierten offenen
   Standards. Rückfragen an die Herausgeber sind nicht zulässig; der Teilnehmer entscheidet
   jede Unklarheit selbst und protokolliert sie.
2. **Aufgabe:** minimaler Erzeuger und minimaler Leser nach 17.2 in einer beliebigen
   Programmiersprache, nur mit deren Standardbibliothek (ZIP, SHA-256, XML, JSON). Richtwert für
   den Zeitaufwand: höchstens ein Arbeitstag.
3. **Fragenprotokoll:** Der Teilnehmer führt eine Liste mit je einer Zeile pro Stelle, an der er
   raten musste: Kennung der Anforderung (oder Abschnittsnummer), Frage, getroffene Annahme.
   Diese Liste ist das Hauptergebnis des Prüfsteins.
4. **Auswertung durch die Herausgeber**, nach Abgabe:
   a. Der Container des fremden Erzeugers wird mit dem Referenzprüfer, einem EPUB-3.3-Validator
      und dem Referenz-Lesesystem geprüft. Erwartetes Ergebnis: Hash-Manifest `OK`, Struktur
      ohne Fehler, `0 fatals / 0 errors`, Textextraktion des Referenz-Lesesystems gleich dem
      Eingabetext.
   b. Der fremde Leser öffnet den Beispielcontainer der Referenzimplementierung, einen signierten
      Container aus den Belegen, einen nach dem Schreiben veränderten Container und einen um eine
      Datei ergänzten Container. Erwartetes Ergebnis: Metadaten und Lesereihenfolge wie im
      Referenzprüfer; die veränderte Datei wird als verändert, die ergänzte als nicht gelistet
      namentlich genannt.
   c. Kreuzprobe: der fremde Leser liest den Container des fremden Erzeugers; der Referenzprüfer
      liest ihn ebenfalls. Erwartetes Ergebnis: gleiche Metadaten, gleiche Abschnittsadressen.
   d. Jede Zeile des Fragenprotokolls wird einzeln entschieden: entweder die Spezifikation wird an
      der genannten Anforderung geändert (die Änderung nennt die Kennung), oder die Frage wird mit
      Begründung als bewusst offen in Abschnitt 19 aufgenommen. Eine dritte Möglichkeit gibt es
      nicht; „der Entwickler hätte es wissen müssen“ ist kein zulässiger Ausgang.
5. **Bestanden** ist der Prüfstein für eine Fassung dieser Spezifikation, wenn 4a bis 4c ohne
   Abweichung erfüllt sind. Die Zahl der Zeilen im Fragenprotokoll ist das Maß der
   Dokumentationsqualität; sie wird je Durchlauf in 17.4 festgehalten. Ein Durchlauf mit
   Abweichungen in 4a bis 4c oder mit offenen Fragen, die nicht nach 4d behandelt wurden, gilt
   als nicht bestanden.
6. **Wiederholung:** vor jeder Nebenversion mit einem neuen Teilnehmer, und immer dann, wenn
   Abschnitt 3 bis 5 oder 12 inhaltlich geändert wurden.

### 17.4 Durchläufe

<!-- PRUEFSTEIN-DURCHLAEUFE ANFANG -->
| Durchlauf | Fassung | Teilnehmer | Sprache | 4a | 4b | 4c | Fragen (4d) | Beleg |
|---|---|---|---|---|---|---|---|---|
| 1 | 0.1, Stand 11.10.2026 | siehe Beleg | siehe Beleg | siehe Beleg | siehe Beleg | siehe Beleg | siehe Beleg | [`docs/belege/S1/README.md`](../belege/S1/README.md) |
<!-- PRUEFSTEIN-DURCHLAEUFE ENDE -->

---

## 18. Umsetzungsstand und Prüfwerkzeuge (informativ)

| Bereich | Stand in `kern/` (P1–P3) | Offen (Paket) |
|---|---|---|
| CONT 001–008, 010–011, 013–017 | umgesetzt und belegt (P1: Container, Hash-Manifest, Härtung; P3: ZIP-Schreiber) | CONT-009 Anzeige, CONT-012 Grenzenmeldung (P4) |
| INH-001, 012; CONT-010 | Eingabeprüfung im Kern (strikter XML-Parser, Skriptregeln, externe Verweise) | CSS-`url()`-Prüfung, Reflow-Tests (P4, P13) |
| SIG 001–009, 013, 014, 019, 020 | umgesetzt und gegen einen unabhängigen Validator belegt (P2, P3) | SIG-010 Zeitstempel umgesetzt und gegen DSS belegt (P10, `docs/13`); SIG-011 Archivniveau LT/LTA, SIG-012/015 Anzeige und Vertrauenslisten (P4, offen) |
| PROF 001–004, 009, 010 | Profile `static`/`interactive`/`signed` im Kern; Teilsignatur belegt (P3) | `renditions/`, `archive`, Fassungsmanifest (P17) |
| SBX, LOCK, PRINT, NEST, ADR, RS | nicht umgesetzt | P15, P17, P18, P16, P4, P5 |
| MIN | nicht umgesetzt (kein Import aus Büroformaten im Kern) | Autorenweg und Import (S5) |
| Prüfer | `hpro inspect`/`validate` prüfen Container und Signaturen; Regelkatalog mit Fehlerklassen und Befundformat in Teil 1 (S2) | Prüfprogramm gegen den Katalog (S3) |

Referenzwerkzeuge für die Prüfverfahren (keine normative Bindung): EPUB-Validator des W3C
(epubcheck 5.4.0), unabhängiger AdES-Validator der EU (DSS 6.5), offener PDF/A- und PDF/UA-Validator
(veraPDF), Referenzimplementierung `@hpro/kern`. Jedes Prüfverfahren ist so formuliert, dass es
auch mit anderen Werkzeugen gleicher Fähigkeit ausführbar ist.

---

## 19. Offene Punkte und nicht Geprüftes

1. **Dateiendung:** `.hpro`/`.epub` erfüllen EN 319 162-1 §4.4.3.1 Nr. 1 (`.asice`/`.sce`) nicht
   ([Q31] §6.2). Empfehlung in Teil 2 Abschnitt 6 (S4): `.hpro` kanonisch, `.epub` und `.asice`
   als Weitergabe-Endungen derselben Bytes; Änderungsantrag HPC-0001 zu HP-CONT-013 läuft (Frist
   bis 09.11.2026). Bis zur Entscheidung gilt HP-CONT-013 unverändert; ob die Endungsregel der Norm
   für Container mit Original-Media-Type gilt, bleibt offene Frage an ETSI ESI.
2. **Fremde Validatoren:** Verhalten von RTR-Prüfdienst, DSS-Demo und DigiDoc mit
   `application/epub+zip` nicht geprüft (Upload nicht freigegeben).
3. **Beweiswert ohne Referenzdarstellung** (HP-SIG-017/018): juristische Prüfung steht aus
   ([Q33] §5.2).
4. **Sandbox unter Linux und Android:** ob ein `sandbox`-iframe den IPC der Hülle erreicht, ist zu
   messen ([Q39] §3.3); HP-SBX-009 gilt unabhängig vom Ergebnis.
5. **Eingefrorene Fassung erzeugen:** automatisch (Rendering zum Zeitpunkt) oder durch den Autor
   ([Q34] §5 Frage 1); `derivedFrom.method` hält beides offen.
6. **Größe:** Obergrenzen für Medien, Verweise auf abgelegte Medien ([Q34] §5 Frage 3) nicht
   festgelegt; HP-CONT-012 nennt nur Lesesystem-Grenzen.
7. **Formelumfang:** Teil 3 ([`03-tabellen-und-formeln.md`](03-tabellen-und-formeln.md), S6) legt
   Funktionen (96), Genauigkeit, Datumssystem und Fehlerwerte fest; HP-SBX-016 nennt nur die
   Ausschlüsse. Offen bleibt die Gegenprobe gegen verbreitete Tabellenkalkulationen (P19).
8. **Nicht geprüft in diesem Paket:** Alle Prüfverfahren, die ein Lesesystem, einen Bearbeiter oder
   einen Druckweg voraussetzen (RS, PRINT, LOCK, SBX-005 ff., NEST, ADR-003 ff.), konnten nicht
   ausgeführt werden, weil diese Werkzeuge noch nicht existieren (Pakete P4 ff.). Ebenso die
   Prüfverfahren des Mindestprofils (MIN), die einen Erzeuger mit Import aus Büroformaten
   voraussetzen (S5); die Spalten ODF und OOXML der Tabelle in 15.2 sind aus [Q42] und [Q43]
   abgeleitet, aber noch nicht an Beispieldateien erprobt. Ausgeführt wurden
   die mechanische Prüfung dieses Dokuments und die Gegenprobe der Container-Anforderungen am
   Beispielcontainer des Kerns ([`docs/belege/S1/`](../belege/S1/README.md)).

---

## 20. Quellen

Alle externen Quellen wurden am 11.10.2026 auf Erreichbarkeit geprüft (HTTP 200), soweit nicht
anders vermerkt. ETSI- und pdfa.org-Adressen beantworten automatisierte Abrufe mit 403; die
ETSI-Dokumente wurden in [Q31] und [Q33] bereits ausgewertet.

- [Q1] W3C, *EPUB 3.3*, Recommendation – https://www.w3.org/TR/epub-33/
- [Q2] W3C, *EPUB Accessibility 1.1* – https://www.w3.org/TR/epub-a11y-11/
- [Q3] W3C, *Publication Manifest* – https://www.w3.org/TR/pub-manifest/
- [Q4] ETSI, *EN 319 162-1 V1.1.1, Associated Signature Containers (ASiC); Part 1* – https://www.etsi.org/deliver/etsi_en/319100_319199/31916201/01.01.01_60/en_31916201v010101p.pdf (403 bei automatisiertem Abruf; ausgewertet in [Q31] §5.1)
- [Q5] ETSI, *EN 319 132-1 V1.3.1, XAdES digital signatures; Part 1: Building blocks and XAdES baseline signatures* – https://www.etsi.org/deliver/etsi_en/319100_319199/31913201/01.03.01_60/en_31913201v010301p.pdf (403 bei automatisiertem Abruf)
- [Q6] ETSI, *EN 319 102-1, Procedures for Creation and Validation of AdES Digital Signatures; Part 1* – https://www.etsi.org/deliver/etsi_en/319100_319199/31910201/ (Verzeichnis; 403 bei automatisiertem Abruf)
- [Q7] W3C, *XML Signature Syntax and Processing Version 1.1* – https://www.w3.org/TR/xmldsig-core1/
- [Q8] W3C, *Exclusive XML Canonicalization Version 1.0* – https://www.w3.org/TR/xml-exc-c14n/
- [Q9] IETF, *RFC 3161, Time-Stamp Protocol (TSP)* – https://www.rfc-editor.org/rfc/rfc3161
- [Q10] IETF, *RFC 5652, Cryptographic Message Syntax (CMS)* – https://www.rfc-editor.org/rfc/rfc5652
- [Q11] PKWARE, *APPNOTE.TXT – .ZIP File Format Specification* – https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
- [Q12] WHATWG, *HTML Living Standard* (iframe sandbox, details, Custom Elements, postMessage, data-*) – https://html.spec.whatwg.org/multipage/
- [Q13] W3C, *Content Security Policy Level 3* – https://www.w3.org/TR/CSP3/
- [Q14] W3C, *Subresource Integrity* – https://www.w3.org/TR/SRI/
- [Q15] W3C, *Web Content Accessibility Guidelines (WCAG) 2.2* – https://www.w3.org/TR/WCAG22/
- [Q16] W3C, *CSS Paged Media Module Level 3* – https://www.w3.org/TR/css-page-3/
- [Q17] W3C, *CSS Fragmentation Module Level 3* – https://www.w3.org/TR/css-break-3/
- [Q18] W3C, *Media Queries Level 5* (`prefers-reduced-motion`) – https://www.w3.org/TR/mediaqueries-5/
- [Q19] W3C, *CSS Custom Properties for Cascading Variables Module Level 1* – https://www.w3.org/TR/css-variables-1/
- [Q20] W3C, *Web Annotation Data Model* – https://www.w3.org/TR/annotation-model/
- [Q21] WICG, *URL Fragment Text Directives* – https://wicg.github.io/scroll-to-text-fragment/
- [Q22] OASIS, *Open Document Format 1.3, Part 2: Packages* (manifest.xml) – https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part2-packages/OpenDocument-v1.3-os-part2-packages.html
- [Q23] OASIS, *Open Document Format 1.3, Part 4: Recalculated Formula (OpenFormula)* (= ISO/IEC 26300-2) – https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part4-formula/OpenDocument-v1.3-os-part4-formula.html
- [Q24] IETF, *RFC 2119* und *RFC 8174* (Schlüsselwörter) – https://www.rfc-editor.org/rfc/rfc2119 · https://www.rfc-editor.org/rfc/rfc8174
- [Q25] IETF, *BCP 47 / RFC 5646, Tags for Identifying Languages* – https://www.rfc-editor.org/rfc/rfc5646
- [Q26] IETF, *RFC 3339, Date and Time on the Internet: Timestamps* – https://www.rfc-editor.org/rfc/rfc3339
- [Q27] IETF, *RFC 9562, Universally Unique IDentifiers (UUIDs)* – https://www.rfc-editor.org/rfc/rfc9562
- [Q28] W3C, *Web Cryptography API* – https://www.w3.org/TR/WebCryptoAPI/
- [Q29] W3C, *WOFF File Format 2.0* – https://www.w3.org/TR/WOFF2/
- [Q30] ISO 19005 (PDF/A) und ISO 14289 (PDF/UA), Übersichten der PDF Association – https://pdfa.org/resource/iso-19005-pdfa/ · https://pdfa.org/resource/iso-14289-pdfua/ (403 bei automatisiertem Abruf)
- [Q31] hpro, *05 – Prototyp-Ergebnisse: EPUB und ASiC-E in einer Datei* (Fälle V0–V11, Normauswertung) – [`docs/05-prototyp-ergebnisse.md`](../05-prototyp-ergebnisse.md)
- [Q32] hpro, Belege der Pakete P1–P3 (Container, Signaturprüfung, Signieren) – [`docs/belege/P1/`](../belege/P1/), [`docs/belege/P2/README.md`](../belege/P2/README.md), [`docs/belege/P3/README.md`](../belege/P3/README.md)
- [Q32a] W3C, *Extensible Markup Language (XML) 1.0 (Fifth Edition)* (Name-Produktion) – https://www.w3.org/TR/xml/
- [Q33] hpro, *03 – Konzept* (Formatvorschlag, Sicherheit, Recht, Nachtrag Phase 2) – [`docs/03-konzept.md`](../03-konzept.md)
- [Q33a] schema.org, Barrierefreiheitseigenschaften (`accessMode` u. a.) – https://schema.org/accessMode
- [Q34] hpro, *10 – Anspruch und Funktionsprofil* (sieben Zusagen; verbindlich) – [`docs/10-anspruch-und-funktionsprofil.md`](../10-anspruch-und-funktionsprofil.md)
- [Q35] IETF, *RFC 8259, The JavaScript Object Notation (JSON) Data Interchange Format* – https://www.rfc-editor.org/rfc/rfc8259
- [Q36] W3C, *Accessible Rich Internet Applications (WAI-ARIA) 1.2* – https://www.w3.org/TR/wai-aria-1.2/
- [Q37] hpro, *07 – Foren und Nutzererwartungen* – [`docs/07-foren-und-nutzererwartungen.md`](../07-foren-und-nutzererwartungen.md)
- [Q38] W3C, *CSS Containment Module Level 3* (Container Queries) – https://www.w3.org/TR/css-contain-3/
- [Q39] hpro, *06 – Plattform und Funktionsmatrix* – [`docs/06-plattform-und-funktionsmatrix.md`](../06-plattform-und-funktionsmatrix.md)
- [Q40] ETSI, *TS 119 312, Cryptographic Suites* – https://www.etsi.org/deliver/etsi_ts/119300_119399/119312/ (Verzeichnis; 403 bei automatisiertem Abruf)
- [Q41] MDN, *`<iframe>`: The Inline Frame element* (Warnung zu `allow-scripts` mit `allow-same-origin`; Sekundärquelle) – https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
- [Q42] OASIS, *Open Document Format 1.3, Part 3: OpenDocument Schema* (Überschriften, Listen, Tabellen, Notizen, Rahmen, Vorlagen) – https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part3-schema/OpenDocument-v1.3-os-part3-schema.html
- [Q43] Ecma International, *ECMA-376, Office Open XML File Formats*, Teil 1 (WordprocessingML: Absätze, Nummerierung, Tabellen, Fuß- und Endnoten, Felder) – https://ecma-international.org/publications-and-standards/standards/ecma-376/
- [Q44] W3C, *Digital Publishing WAI-ARIA Module 1.1* (`doc-noteref`, `doc-footnote`, `doc-endnotes`, `doc-backlink`) – https://www.w3.org/TR/dpub-aria-1.1/
- [Q45] W3C, *EPUB 3 Structural Semantics Vocabulary 1.1* (`noteref`, `footnote`, `endnotes`) – https://www.w3.org/TR/epub-ssv-11/
