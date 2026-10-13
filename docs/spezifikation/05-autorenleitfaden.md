# hpro 0.1 – Autorenleitfaden (Teil 5: Mindestprofil für Büroprogramme, Erzeugen aus Textverarbeitung und CMS)

**Status:** Arbeitsentwurf 0.1 · **Stand:** 12.10.2026 · **Paket:** S7 aus [`docs/08-arbeitsplan.md`](../08-arbeitsplan.md)
**Charakter:** informativ. Normativ sind allein die Teile 0 bis 3; jede Aussage dieses Leitfadens
nennt die Anforderung, die sie erklärt (mechanisch geprüft durch
[`scripts/check-handbuch.mjs`](../../scripts/check-handbuch.mjs), läuft in `npm test`). Bei einem
Widerspruch gilt die Spezifikation.
**Zielgruppe:** Entwickler von Textverarbeitungen, Exportfiltern, Content-Management-Systemen und
Fachanwendungen, die hpro erzeugen sollen; der Umsetzer des Dateiformats selbst liest
[Teil 4, das Umsetzer-Handbuch](04-umsetzer-handbuch.md).
**Beispiele:** [`beispiele/s7-buero/`](beispiele/s7-buero/) (Quelle aus einer Textverarbeitung) und
[`beispiele/s7-bericht/`](beispiele/s7-bericht/) (Quelle einer Anwendung); Referenzkonverter
[`scripts/s7-fodt2hpro.mjs`](../../scripts/s7-fodt2hpro.mjs); wörtliche Ausgaben in
[`docs/belege/S7/`](../belege/S7/README.md).

---

## 1. Worum es geht (informativ)

hpro ist für Bildschirme gemacht, nicht für Papier: die fließende Darstellung ist die Wahrheit,
der Ausdruck eine abgeleitete Ausgabe (Zusage 1 und 6 in [docs/10, Anspruch und Funktionsprofil](../10-anspruch-und-funktionsprofil.md)).
Für ein Autorenwerkzeug heißt das: es liefert **Struktur**, keine Seiten. Überschriften bleiben
Überschriften, Listen bleiben Listen, Tabellen bleiben Tabellen, und jeder Abschnitt bekommt eine
stabile Adresse, die Seitenzahlen ersetzt.

Damit Word, LibreOffice, InDesign oder ein CMS das ohne Rückfragen einbauen können, legt Teil 0,
Abschnitt 15 ein **Mindestprofil für Büroprogramme** fest: eine kleine Teilmenge der Stufe Basis
(Überschriften, Absätze, Listen, Tabellen, Bilder, Fußnoten, Verweise) samt einer Zuordnung von
Formatvorlagen auf Struktur. Dieser Leitfaden macht daraus eine Anforderungsliste (Kapitel 2), zeigt
an einer echten Quelldatei aus einer Textverarbeitung, was dabei herauskommt (Kapitel 3), und
beschreibt, wie ein Exportfilter (Kapitel 4) oder eine Anwendung (Kapitel 5) vorgeht.

Der Referenzkonverter wandelt die Beispielquelle in ein Dokument des Mindestprofils um; die
Meldung zum Bild ohne Alternativtext ist beabsichtigt und wird in Kapitel 4.6 erklärt:

```text beleg:01-beispiele-bauen.txt
$ node scripts/s7-fodt2hpro.mjs docs/spezifikation/beispiele/s7-buero/angebot.fodt prototyp/out/s7/buero-a.hpro
Meldung: Bild "Bild3" hat keinen Alternativtext und ist nicht als dekorativ markiert; alt="Bild3" aus dem Rahmennamen gesetzt – bitte nachtragen (HP-MIN-007)
prototyp/out/s7/buero-a.hpro  9374 bytes  sha256=656419ba1437c7458b7d775e28d7f28186171797fdd2ca7e108d7e1ded3763e5
manifest: name="Angebot Dachsanierung Haus Nr. 12" subset=https://hpro.example/spec/0.1/subset/office-min resources=8
[Exit-Code 0]
```

Die Quelle ist ein Flat-XML-ODF-Textdokument, wie es LibreOffice mit „Speichern unter“ schreibt
(Auszug; Anfang der Datei):

```xml aus:docs/spezifikation/beispiele/s7-buero/angebot.fodt
      <text:p text:style-name="Title">Angebot Dachsanierung Haus Nr. 12</text:p>
      <text:p text:style-name="Text_20_body">Angebot nach Besichtigung<text:note text:id="ftn1" text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body><text:p text:style-name="Footnote">Besichtigung am 9. Oktober 2026 mit dem Eigentümer.</text:p></text:note-body></text:note> vom 10. Oktober 2026 für das Objekt <text:span text:style-name="Strong_20_Emphasis">Haus Nr. 12</text:span>.</text:p>
      <text:h text:style-name="Heading_20_1" text:outline-level="1"><text:bookmark text:name="Leistung"/>Leistung</text:h>
```

---

## 2. Das Mindestprofil als Anforderungsliste

### 2.1 Was ein Dokument des Mindestprofils ist

- Ein Dokument des Mindestprofils ist ein Dokument der Stufe Basis mit Profil `static`, das in
  `manifest.json` den Schlüssel `subset` mit dem Wert `https://hpro.example/spec/0.1/subset/office-min`
  trägt; es erfüllt **alle** Muss-Anforderungen der Stufe Basis und zusätzlich HP-MIN-001 bis
  HP-MIN-009 (HP-MIN-001).
- Das Mindestprofil lockert nichts: Container, Manifest, Adressen und Barrierefreiheit gelten
  unverändert; es grenzt nur den Elementbestand ein und legt fest, wie Struktur aus der Quelle
  abgeleitet wird (HP-MIN-001, HP-MIN-002).
- Alles, was über den Elementbestand hinausgeht, ist entweder eine Erweiterung nach HP-VERS-004
  oder ein gewöhnliches Dokument der Stufe Basis ohne `subset`; ein Erzeuger, der mehr schreibt,
  DARF `subset` nicht setzen (HP-MIN-002).
- Die Konformitätsaussage eines solchen Erzeugers lautet „hpro 0.1, Erzeuger-Konformität, Stufe
  Basis, Mindestprofil“ (Teil 0, Abschnitt 16.4).

Der Referenzkonverter ergänzt das vom Kern geschriebene Manifest um genau zwei Schlüssel: `subset`
(HP-MIN-001) und die Herkunftsangabe `source` mit Werkzeug und Datum (HP-META-005):

```js aus:scripts/s7-fodt2hpro.mjs
    manifestAddition: {
      subset: SUBSET_OFFICE_MIN,
      source: { url: `original/${sourceName}`, type: 'application/vnd.oasis.opendocument.text-flat-xml', tool: TOOL, date: modified },
    },
```

So sieht das Manifest eines Dokuments im Mindestprofil aus, das der Referenzkonverter aus der
Beispielquelle geschrieben hat; die Pflichtfelder nach HP-META-001 stehen am Anfang, `subset`
und `source` am Ende (Auszug):

```text beleg:02-container.txt
$ zipcat docs/belege/S7/container/s7-buero.hpro manifest.json
{
  "@context": [
    "https://www.w3.org/ns/pub-context",
    "https://hpro.example/ns/v0"
  ],
  "conformsTo": "https://hpro.example/spec/0.1/profile/static",
  "id": "urn:uuid:5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f",
  "name": "Angebot Dachsanierung Haus Nr. 12",
  "inLanguage": "de-AT",
  "dateModified": "2026-10-12T07:00:00Z",
…
  "subset": "https://hpro.example/spec/0.1/subset/office-min",
  "source": {
    "url": "original/angebot.fodt",
    "type": "application/vnd.oasis.opendocument.text-flat-xml",
    "tool": {
      "name": "s7-fodt2hpro",
      "version": "0.1.0"
    },
    "date": "2026-10-12T07:00:00Z"
  }
}
[Exit-Code 0]
```

### 2.2 Anforderungen an den Erzeuger (Checkliste)

Jede Zeile nennt die Anforderung, das Prüfmittel (Regel des Prüfers aus Teil 1) und was der
Erzeuger konkret tun muss; die Spalte „Prüfer“ nennt die Regel, die `hpro-check` bei einem Verstoß
meldet, weil jede Muss-Anforderung an das Dokument mindestens eine Dokumentregel hat (Teil 1,
Abschnitt 3.6).

| Nr. | Der Erzeuger … | Anforderung | Prüfer |
|---|---|---|---|
| 1 | schreibt einen ZIP-Container mit `mimetype` als erstem, unkomprimiertem Eintrag (`application/epub+zip`), `META-INF/container.xml`, `package.opf`, `manifest.json` (Teil 4, Kapitel 2 erklärt den Aufbau) | HP-CONT-001, HP-CONT-002, HP-CONT-003, HP-CONT-004, HP-CONT-005 | HPR-CONT-001 bis HPR-CONT-011 |
| 2 | trägt jede Datei außer `mimetype`, `manifest.json` und `META-INF/*` mit Media-Type und `sha256-…` in `manifest.json#resources` ein | HP-CONT-008, HP-CONT-015 | HPR-CONT-015 bis HPR-CONT-019 |
| 3 | setzt `conformsTo` auf `…/profile/static` und `subset` auf `…/subset/office-min` | HP-PROF-001, HP-MIN-001 | HPR-PROF-001, HPR-MIN-001 |
| 4 | füllt die Pflichtmetadaten `id` (SOLL `urn:uuid:`), `name`, `inLanguage`, `dateModified` (UTC, `YYYY-MM-DDThh:mm:ssZ`), `readingOrder` und hält `package.opf` dazu konsistent | HP-META-001, HP-META-002 | HPR-META-001 bis HPR-META-006 |
| 5 | schreibt Inhaltsdokumente als wohlgeformtes XHTML mit `lang` und `xml:lang` am Wurzelelement | HP-INH-001, HP-INH-002 | HPR-INH-001, HPR-INH-003 |
| 6 | verwendet nur die Elemente und Attribute der Tabelle in Teil 0, Abschnitt 15.1 (Rahmen, `h1`–`h6`, `p`, `br`, `blockquote`, `pre`, `em`, `strong`, `sub`, `sup`, `code`, `span`, `ul`, `ol`, `li`, Tabelle, `figure`/`img`/`figcaption`, Fußnoten mit `role`/`epub:type`, `a`) | HP-MIN-002 | HPR-MIN-002 |
| 7 | leitet Überschriften, Absätze, Zitate, vorformatierten Text, Zeichenauszeichnung, Listen, Tabellen, Bilder, Fuß- und Endnoten und Verweise aus **Formatvorlage, Gliederungsebene, Listen- oder Tabellendefinition** der Quelle ab, nie aus dem Aussehen (Kapitel 3) | HP-MIN-003 | HPR-MIN-002 (Elementbestand), Stichprobe nach HP-MIN-003 |
| 8 | gibt jeder Überschrift, Tabelle, Abbildung und Fußnote eine Kennung nach `^[A-Za-z][A-Za-z0-9_.-]*$` (höchstens 64 Zeichen, je Dokument eindeutig); übernimmt Textmarkennamen der Quelle als Kennung; erzeugt bei erneuter Umwandlung derselben Quelle dieselben Kennungen | HP-ADR-001, HP-ADR-002, HP-MIN-004 | HPR-ADR-001, HPR-ADR-002, HPR-ADR-003, HPR-MIN-003 |
| 9 | schreibt Listen als `ul`/`ol` mit `li`; Unterebenen als eigene Liste **im** `li` der Oberebene; fortgesetzte oder nicht bei 1 beginnende Nummerierungen mit `start`; keine Aufzählungszeichen oder Nummern als Text | HP-MIN-005 | HPR-MIN-004, HPR-MIN-005 |
| 10 | schreibt Tabellen mit `thead` und `th scope="col"` für wiederholte Kopfzeilen, `colspan`/`rowspan` für verbundene Zellen, `caption` für die Beschriftung, gleiche Spaltenzahl je Zeile, und `data-hp-table="scroll"` (oder `stack`/`priority`) für schmale Bildschirme | HP-MIN-006, HP-INH-008, HP-INH-010 | HPR-MIN-006, HPR-MIN-007, HPR-INH-014 |
| 11 | legt Bilder als Datei im Container ab (PNG, JPEG, GIF, WebP oder SVG; andere Formate vorher umwandeln), in `figure` mit `img` und `alt`; Beschriftung als `figcaption`; `alt=""` nur bei als dekorativ markierten Bildern; fehlenden Alternativtext in der Meldung benennen | HP-MIN-007, HP-INH-006, HP-CONT-015 | HPR-MIN-008, HPR-INH-008 |
| 12 | schreibt Fußnoten als Paar `a role="doc-noteref" epub:type="noteref" href="#id"` und `aside role="doc-footnote" epub:type="footnote" id="…"` im selben Dokument; Endnoten als `li id="…"` in `section role="doc-endnotes" epub:type="endnotes"`; jeder Notentext genau einmal | HP-MIN-008 | HPR-MIN-003, HPR-MIN-009 |
| 13 | schreibt Querverweise als `a href="pfad#kennung"` auf ein existierendes Ziel und externe Links als absolute `http(s)`-URL; ersetzt Seitenverweise durch den Text oder die Nummer des Ziels, nie durch eine Seitenzahl | HP-MIN-009, HP-ADR-003 | HPR-MIN-010, HPR-ADR-006 |
| 14 | liefert ein Navigationsdokument (`nav epub:type="toc"`), das jede `section` der obersten Ebene jedes Inhaltsdokuments nennt | HP-ADR-007 | HPR-ADR-004, HPR-ADR-005 |
| 15 | lädt kein Stylesheet, Bild oder Skript von außen; nur Hyperlinks (`a href`) dürfen nach außen zeigen | HP-CONT-010 | HPR-CONT-020, HPR-CONT-021 |
| 16 | leitet Schriftgröße, Zeilenhöhe, Abstände und Farben im Stylesheet aus den Lesesystem-Variablen `--hp-*` ab (mit Rückfallwert) und setzt diese Variablen nicht auf `:root` | HP-INH-004 | HPR-INH-005 |
| 17 | hält den Fließtext bei 320 CSS-Pixeln ohne waagrechtes Scrollen (`img { max-width: 100% }`, `pre { white-space: pre-wrap }`, Tabellen mit `data-hp-table`) | HP-INH-003, HP-INH-010 | HPR-INH-004 (Rendering), HPR-INH-014 |
| 18 | schreibt kein `script`, keine `on*`-Attribute, keine `javascript:`-URLs | HP-INH-012 | HPR-INH-016, HPR-INH-017 |
| 19 | legt bei einer Konvertierung die Ausgangsdatei unter `original/` ab und nennt sie in `manifest.json#source` mit `url`, `type`, `tool` und `date` (Soll) | HP-META-005 | HPR-META-009 |
| 20 | schreibt deterministisch: gleiche Quelle, gleiche Bytes (Zeitstempel aus `dateModified`, feste Reihenfolge) (Soll) | HP-CONT-014 | HPR-CONT-025 |
| 21 | übernimmt den Vorlagennamen der Quelle KANN als `data-hp-style`, direkte Formatierung KANN als CSS-Klasse; beides ersetzt keine Struktur | HP-MIN-012 | Accessibility-Baum-Vergleich nach HP-MIN-012 |
| 22 | prüft das Ergebnis selbst mit dem Konformitätsprüfer und einem EPUB-Validator (Kapitel 7) | HP-CONT-017, HP-VERS-008 | HPR-CONT-024, HPR-CONT-028 |

### 2.3 Was das Lesesystem für Dokumente des Mindestprofils tut (informativ)

Zur Orientierung, nicht als Pflicht des Erzeugers: Ein Lesesystem SOLL Fußnoten an der Leseposition
einblenden und eine Rückkehr zum Verweis anbieten; ohne diese Funktion MUSS der Verweis zum
Notentext springen (HP-MIN-010). Ein Lesesystem mit Export in ein Büroformat SOLL die Zuordnung aus
Teil 0, Abschnitt 15.2 umgekehrt anwenden, damit Export und erneute Umwandlung dieselbe Struktur
ergeben (HP-MIN-011).

---

## 3. Zuordnung von Formatvorlagen auf Struktur: ein Beispiel aus der Textverarbeitung

### 3.1 Die Quelle

Die Quelle [`beispiele/s7-buero/angebot.fodt`](beispiele/s7-buero/angebot.fodt) ist ein
Flat-XML-ODF-Textdokument nach ODF 1.3 mit den Standardvorlagen einer Textverarbeitung (Titel,
Überschrift 1 und 2, Textkörper, Zitat, Vorformatierter Text, Listen- und Tabellenvorlagen,
Zeichenvorlagen „Betont“, „Stark betont“, „Quelltext“), je einer Fußnote und Endnote, einer
Textmarke mit Querverweis und Seitenverweis, einem Hyperlink und drei Bildern; so könnte sie aus
LibreOffice stammen (Teil 0, Abschnitt 15.2 nennt die ODF-Spalte als Lesehilfe). Die Struktur
ergibt sich ausschließlich aus Vorlagen, Gliederungsebenen, Listen- und Tabellendefinitionen
(HP-MIN-003).

Entscheidend ist die Vorlagenkette: eine automatische Vorlage (hier `P2`) wird über
`style:parent-style-name` bis zu einer Standardvorlage aufgelöst, eine direkte Formatierung ohne
Vorlagenbezug (`P1`, fett und 16 pt auf Basis von „Standard“) bleibt ein Absatz (HP-MIN-003):

```xml aus:docs/spezifikation/beispiele/s7-buero/angebot.fodt
    <!-- P1: direkte Formatierung ohne Vorlage (fett, groß) – bleibt ein Absatz, keine Überschrift. -->
    <style:style style:name="P1" style:family="paragraph" style:parent-style-name="Standard">
      <style:text-properties fo:font-size="16pt" fo:font-weight="bold"/>
    </style:style>
    <!-- P2: automatische Vorlage auf Basis von „Heading 2“ (Überschrift mit Abstandsänderung). -->
    <style:style style:name="P2" style:family="paragraph" style:parent-style-name="Heading_20_2">
      <style:paragraph-properties fo:margin-top="0.6cm"/>
    </style:style>
```

### 3.2 Das Ergebnis

Der Referenzkonverter schreibt daraus genau ein Inhaltsdokument; die folgende Ausgabe ist der
vollständige Inhalt von `content/index.xhtml` im erzeugten Container (HP-MIN-002 für den
Elementbestand, HP-MIN-003 für die Ableitung, HP-MIN-004 für die Kennungen `Leistung` und
`Bedingungen` aus den Textmarken):

```text beleg:02-container.txt
$ zipcat docs/belege/S7/container/s7-buero.hpro content/index.xhtml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="de-AT" lang="de-AT">
<head>
  <meta charset="UTF-8"/>
  <title>Angebot Dachsanierung Haus Nr. 12</title>
  <link rel="stylesheet" type="text/css" href="styles/office.css"/>
</head>
<body>
  <h1 id="angebot-dachsanierung-haus-nr-12" data-hp-style="Title">Angebot Dachsanierung Haus Nr. 12</h1>
  <p data-hp-style="Text body">Angebot nach Besichtigung<a href="#ftn1" role="doc-noteref" epub:type="noteref" id="ftn1-ref">1</a> vom 10. Oktober 2026 für das Objekt <strong>Haus Nr. 12</strong>.</p>
  <aside id="ftn1" role="doc-footnote" epub:type="footnote"><p>Besichtigung am 9. Oktober 2026 mit dem Eigentümer.</p></aside>
  <section id="s-Leistung">
  <h2 id="Leistung" data-hp-style="Heading 1">Leistung</h2>
  <p data-hp-style="Text body">Die Arbeiten umfassen Abdeckung, Lattung und Eindeckung des Satteldachs mit einer Fläche von 120 m<sup>2</sup>; die Eindeckung ist CO<sub>2</sub>-neutral hergestellt.</p>
  <ul>
    <li>Abdeckung
      <ul>
        <li>Ziegel abnehmen</li>
        <li>Lattung prüfen
          <ul>
            <li>Schadhafte Latten ersetzen</li>
          </ul>
        </li>
      </ul>
    </li>
    <li>Eindeckung</li>
  </ul>
  <h3 id="ablauf" data-hp-style="Heading 2">Ablauf</h3>
  <ol>
    <li>Gerüst stellen</li>
    <li>Abdecken und Lattung prüfen</li>
    <li>Eindecken</li>
  </ol>
  <p data-hp-style="Text body">Nach der Abnahme durch den Auftraggeber:</p>
  <ol start="4">
    <li>Gerüst abbauen</li>
    <li>Baustelle räumen</li>
  </ol>
  <h3 id="hinweis-zur-statik" data-hp-style="Heading 2">Hinweis zur Statik</h3>
  <blockquote data-hp-style="Quotations"><p>„Die Sparren sind tragfähig; an der Nordseite gibt es Feuchteschäden.“ (Zustandsbericht vom 9. Oktober 2026)</p></blockquote>
  <pre id="woche-1-abdeckung" data-hp-style="Preformatted Text">Woche 1: Abdeckung
Woche 2: Eindeckung</pre>
  <p data-hp-style="Standard">Dieser Absatz ist nur direkt fett und groß formatiert. Er ist keine Überschrift und bleibt ein Absatz.</p>
  </section>
  <section id="s-positionen">
  <h2 id="positionen" data-hp-style="Heading 1">Positionen</h2>
  <table id="Positionen" data-hp-table="scroll"><caption>Tabelle 1: Positionen mit Mengen und Beträgen</caption>
    <thead>
      <tr><th scope="col">Position</th><th scope="col">Menge</th><th scope="col">Betrag</th></tr>
    </thead>
    <tbody>
      <tr><td>Abdeckung</td><td>120 m²</td><td>2.400,00 EUR</td></tr>
      <tr><td rowspan="2">Eindeckung</td><td>Ziegel 120 m²</td><td>9.600,00 EUR</td></tr>
      <tr><td>Firstziegel 14 m</td><td>560,00 EUR</td></tr>
      <tr><td colspan="2">Summe netto</td><td>12.560,00 EUR</td></tr>
    </tbody>
  </table>
  </section>
  <section id="s-skizze">
  <h2 id="skizze" data-hp-style="Heading 1">Skizze</h2>
  <figure id="bild1"><img src="media/bild1.png" alt="Balkendiagramm: Dachfläche Nord 62,5 m², Dachfläche Süd 57,5 m²"/><figcaption>Abbildung 1: Flächen je Dachseite</figcaption></figure>
  <figure id="zierlinie"><img src="media/zierlinie.png" alt=""/></figure>
  <figure id="bild3"><img src="media/bild3.png" alt="Bild3"/></figure>
  </section>
  <section id="s-Bedingungen">
  <h2 id="Bedingungen" data-hp-style="Heading 1">Bedingungen</h2>
  <p data-hp-style="Text body">Zahlbar binnen 30 Tagen ohne Abzug. Einzelheiten siehe <a href="#Leistung">Leistung</a>, <a href="#Positionen">Tabelle 1</a> und <a href="#bild1">Abbildung 1</a>; die Bedingungen stehen auf Seite <a href="#Bedingungen">Bedingungen</a>. Es gelten unsere <a href="https://example.org/agb">AGB</a>. Prüfbefehl: <code>hpro-check angebot.hpro</code>. <em>Gültig bis 30. November 2026.</em><a href="#edn1" role="doc-noteref" epub:type="noteref" id="edn1-ref">i</a></p>
  </section>
  <section id="endnoten" role="doc-endnotes" epub:type="endnotes">
    <ol>
      <li id="edn1"><p>Alle Preise ohne Umsatzsteuer.</p></li>
    </ol>
  </section>
</body>
</html>
[Exit-Code 0]
```

### 3.3 Die Zuordnung Zeile für Zeile

Die Tabelle liest sich von der Quelle zum Ergebnis; die ODF-Spalte nennt, woran der Konverter die
Zeile erkennt, die Spalte „im Beispiel“ zeigt die Stelle in 3.2. Grundlage ist durchgehend die
Tabelle in Teil 0, Abschnitt 15.2; die Anforderung je Zeile steht rechts.

| Quelle (Textverarbeitung) | Erkennung in ODF | hpro | Im Beispiel | Anforderung |
|---|---|---|---|---|
| Vorlage „Titel“ | `text:p` mit `style-name="Title"` | `h1` am Anfang; Text zugleich `manifest.json#name` | `<h1 id="angebot-…">`, `"name": "Angebot Dachsanierung Haus Nr. 12"` | HP-MIN-003 |
| Überschrift der Gliederungsebene n | `text:h` mit `outline-level`, oder Vorlage mit `style:default-outline-level` in der Vorlagenkette | `h<n+1>`, weil die Quelle eine Titelvorlage nutzt | „Leistung“ (Ebene 1) wird `h2`, „Ablauf“ (Ebene 2) wird `h3`; `P2` erbt von „Heading 2“ und wird ebenfalls `h3` | HP-MIN-003 |
| Textkörper, Standard | `text:p` ohne Gliederungsebene | `p` | alle Absätze mit `data-hp-style="Text body"` | HP-MIN-003 |
| direkte Formatierung ohne Vorlage | automatische Vorlage `P1` mit `fo:font-weight="bold"` auf Basis „Standard“ | `p`, keine Struktur aus dem Aussehen | „Dieser Absatz ist nur direkt fett …“ bleibt `p` | HP-MIN-003 |
| Zitatvorlage | `style-name="Quotations"` | `blockquote` mit `p` | das Zitat aus dem Zustandsbericht | HP-MIN-003 |
| Vorformatierter Text | `style-name="Preformatted_20_Text"`, `text:line-break` | `pre` mit Zeilenumbruch als Zeilenende | `<pre id="woche-1-abdeckung">` | HP-MIN-003, HP-ADR-001 |
| Betont, Stark betont, Quelltext | Zeichenvorlagen `Emphasis`, `Strong_20_Emphasis`, `Source_20_Text` | `em`, `strong`, `code` | „Gültig bis …“, „Haus Nr. 12“, `hpro-check angebot.hpro` | HP-MIN-003 |
| hoch-, tiefgestellt | `style:text-position="super …"`/`"sub …"` in der Zeichenvorlage | `sup`, `sub` | m<sup>2</sup>, CO<sub>2</sub> | HP-MIN-003 |
| Aufzählung, drei Ebenen | `text:list` mit `text:list-level-style-bullet`; Unterliste als `text:list` im `text:list-item` | `ul`/`li`, Unterliste im `li` | die dreistufige Liste unter „Leistung“ | HP-MIN-005 |
| Nummerierung, fortgesetzt | `text:list-level-style-number`; `text:continue-numbering="true"` | `ol`, zweiter Teil mit `start="4"` | „Gerüst abbauen“ als 4. | HP-MIN-005 |
| Tabelle mit wiederholter Kopfzeile | `table:table` mit `table:table-header-rows` | `table`, `thead` mit `th scope="col"`, `tbody` | Kopfzeile Position/Menge/Betrag | HP-MIN-006 |
| verbundene Zellen | `table:number-columns-spanned`, `table:number-rows-spanned`, `table:covered-table-cell` | `colspan`, `rowspan`; überdeckte Zellen entfallen | `rowspan="2"` bei „Eindeckung“, `colspan="2"` bei „Summe netto“ | HP-MIN-006 |
| Tabellenbeschriftung | Absatz mit Vorlage „Table“ und `text:sequence text:name="Table"` unmittelbar nach der Tabelle | `caption` | „Tabelle 1: Positionen mit …“ | HP-MIN-006 |
| Bild mit Beschriftung | `draw:frame` (Textrahmen) mit Absatz „Illustration“, darin `draw:frame`/`draw:image`, `svg:title` als Alternativtext | `figure` mit `img alt` und `figcaption` | `bild1` | HP-MIN-007 |
| dekoratives Bild | `draw:frame draw:decorative="true"` | `img alt=""` in `figure` | `zierlinie` | HP-MIN-007 |
| Bild ohne Alternativtext | weder `svg:title` noch `svg:desc` noch `draw:decorative` | `alt` aus Beschriftung oder Rahmenname **plus Meldung** (Kapitel 4.6) | `bild3`, Meldung in Kapitel 1 | HP-MIN-007 |
| Fußnote | `text:note text:note-class="footnote"` mit `text:note-citation` und `text:note-body` | `a role="doc-noteref" epub:type="noteref"` + `aside role="doc-footnote" epub:type="footnote"` nach dem Absatz | `ftn1` | HP-MIN-008 |
| Endnote | `text:note text:note-class="endnote"` | Eintrag `li` in `section role="doc-endnotes" epub:type="endnotes"` am Ende | `edn1` | HP-MIN-008 |
| Textmarke | `text:bookmark text:name` in der Überschrift | `id` des Zielelements, Name übernommen | `id="Leistung"`, `id="Bedingungen"` | HP-MIN-004 |
| Querverweis auf Textmarke, Tabelle, Abbildung | `text:bookmark-ref`, `text:sequence-ref` mit `text:ref-name` | `a href="#kennung"` | `#Leistung`, `#Positionen`, `#bild1` | HP-MIN-009 |
| Seitenverweis | `text:bookmark-ref text:reference-format="page"` | `a href="#kennung"` mit dem **Text des Ziels** statt der Seitenzahl | „… auf Seite <a>Bedingungen</a>“ statt „Seite 4“ | HP-MIN-009 |
| Hyperlink | `text:a xlink:href` | `a href` mit absoluter URL | `https://example.org/agb` | HP-MIN-009 |
| Vorlagenname | Anzeigename der ersten benannten Vorlage in der Kette | `data-hp-style` (Kann) | `data-hp-style="Heading 1"` auch bei `P2` | HP-MIN-012 |

Beim Seitenverweis bleibt das umgebende Autorenwort „Seite“ stehen („auf Seite Bedingungen“); das
ist unschön, aber korrekt: die Anforderung verbietet die Seitenzahl im Verweistext, nicht das
Wort im Fließtext davor, und ein Konverter darf Autorentext nicht umschreiben (HP-MIN-009,
HP-RS-005). Autoren sollten Seitenverweise deshalb als „siehe Abschnitt …“ formulieren
(Kapitel 8).

### 3.4 Dieselbe Zuordnung für OOXML (informativ)

Für Word-Dokumente (OOXML, ECMA-376 Teil 1) nennt die Tabelle in Teil 0, Abschnitt 15.2 die
Entsprechungen: Gliederungsebene über `w:outlineLvl` (direkt oder in der Vorlage, `w:basedOn`
aufgelöst), Listen über `w:numPr` mit `w:ilvl` und `w:numFmt`, Kopfzeilen über `w:tblHeader`,
verbundene Zellen über `w:gridSpan`/`w:vMerge`, Beschriftungen über das Feld `SEQ`, Fußnoten über
`w:footnoteReference` und den Teil `footnotes`, Textmarken über `w:bookmarkStart`, Querverweise
über `REF`, Seitenverweise über `PAGEREF`, Hyperlinks über `w:hyperlink`. Der Referenzkonverter
dieses Leitfadens deckt nur ODF ab; ein OOXML-Filter nach derselben Tabelle steht seit Paket S5 im
Kern (`kern/src/author/docx.ts`, Kommandozeile `hpro author docx`) und ist an einer Word-Datei aus
LibreOffice 26.8 und an einer aus der Normalvorlage von Word (python-docx) erprobt; Dateien aus
Microsoft Word selbst sind nicht geprüft (`docs/12-autorenweg.md`, Abschnitt 5; HP-MIN-003). Zwei
Befunde daraus stehen als Änderungsantrag HPC-0011 an (Titel ohne Titelvorlage, automatische
Textmarken).

---

## 4. Anleitung für Textverarbeitungen und Exportfilter

### 4.1 Ablauf in zehn Schritten

1. **Metadaten lesen:** Titel (`dc:title` oder Titelvorlage), Sprache (BCP 47), Änderungsdatum
   als UTC `YYYY-MM-DDThh:mm:ssZ`; eine stabile Dokumentkennung `urn:uuid:…` aus den
   Dokumenteigenschaften übernehmen oder deterministisch ableiten (HP-META-001, HP-CONT-014).
2. **Vorlagen auflösen:** jede Absatz- und Zeichenvorlage über ihre Basisvorlage bis zu einer
   Zeile der Zuordnungstabelle verfolgen; trifft keine zu, ist das Ergebnis `p` (HP-MIN-003).
3. **Blöcke in Dokumentreihenfolge ausgeben:** Überschriften mit Ebene, Absätze, Zitate,
   vorformatierten Text, Listen, Tabellen, Abbildungen; jede Überschrift der obersten Ebene öffnet
   eine `section` mit Kennung, damit das Navigationsdokument sie nennen kann (HP-ADR-007,
   HP-INH-005).
4. **Kennungen vergeben:** Textmarkennamen zuerst, sonst ein Slug aus dem Text (ASCII, Umlaute
   umgeschrieben), bei Dubletten `-2`, `-3`; `pre`, `table`, `figure` und alle Überschriften
   brauchen eine Kennung (HP-ADR-001, HP-ADR-002, HP-MIN-004).
5. **Noten ablegen:** Fußnoten als `aside` unmittelbar nach dem Absatz, Endnoten gesammelt in
   einer eigenen `section` am Ende; Verweis und Notentext tragen zusammengehörige Kennungen
   (HP-MIN-008).
6. **Verweise auflösen:** Querverweise auf die Kennung des Ziels, Seitenverweise auf den Text des
   Ziels, Hyperlinks als absolute URL; Verweise ohne Ziel als Text mit Meldung (HP-MIN-009).
7. **Bilder herausschreiben:** eingebettete Bilddaten unter `content/media/` mit Kernmedientyp;
   Alternativtext aus der Quelle, `alt=""` nur bei dekorativen Bildern, fehlenden Alternativtext
   melden (HP-MIN-007, HP-INH-006).
8. **Stylesheet beilegen:** ein Stylesheet, das Schrift, Zeilenhöhe, Abstände und Farben aus
   `--hp-*` mit Rückfallwerten ableitet und Tabellen, Abbildungen, Codeblöcke zusammenhält
   (HP-INH-004, HP-INH-016).
9. **Container schreiben:** `mimetype` zuerst und unkomprimiert, `META-INF/container.xml`,
   `package.opf`, `manifest.json` mit Hashes, `subset`, `source` und Ausgangsdatei unter
   `original/` (HP-CONT-002, HP-CONT-008, HP-MIN-001, HP-META-005).
10. **Selbst prüfen:** Rücklesen mit Hashprüfung, Konformitätsprüfer, EPUB-Validator; erst dann
    „hpro 0.1“ nennen (HP-CONT-009, HP-VERS-008, HP-CONT-017).

### 4.2 Der Referenzkonverter als Vorlage

Der Konverter [`scripts/s7-fodt2hpro.mjs`](../../scripts/s7-fodt2hpro.mjs) setzt diese zehn
Schritte für Flat-ODF um; er nutzt nur die XML-Bibliothek des Kerns und den Kern selbst zum
Schreiben des Containers (HP-MIN-003 für die Ableitung, HP-CONT-002 bis HP-CONT-008 für den
Container über den Kern). Die Vorlagenkette aus Schritt 2 sieht so aus (Auszug):

```js aus:scripts/s7-fodt2hpro.mjs
  /** Walks the parent chain until a row of table 15.2 applies. */
  chain(name) {
    const out = [];
    let n = name;
    for (let i = 0; n && i < 20; i++) {
      const s = this.map.get(n);
      if (!s) break;
      out.push({ name: n, ...s });
      n = s.parent;
    }
    return out;
  }
  paragraphRole(name) {
    for (const s of this.chain(name)) {
      if (PARAGRAPH_ROLES[s.name]) return { role: PARAGRAPH_ROLES[s.name], level: null, style: this.named(name) };
      if (s.outline) return { role: 'heading', level: Number(s.outline), style: this.named(name) };
    }
    return { role: 'p', level: null, style: this.named(name) };
  }
```

Zwei Läufe auf dieselbe Quelle ergeben byteidentische Container, also auch dieselben Kennungen
(HP-MIN-004, HP-CONT-014):

```text beleg:01-beispiele-bauen.txt
$ cmp prototyp/out/s7/buero-a.hpro prototyp/out/s7/buero-b.hpro
[Exit-Code 0]
```

### 4.3 Was der Konverter melden muss

- Fehlender Alternativtext eines nicht dekorativen Bildes: das Bild wird namentlich genannt,
  `alt=""` ist verboten (HP-MIN-007).
- Bild in einem Format außerhalb der Kernmedientypen (EMF, WMF, TIFF, BMP): vor dem Schreiben nach
  PNG oder SVG umwandeln; kann der Filter das nicht, muss er abbrechen und das Bild nennen, statt
  es stillschweigend auszulassen (HP-MIN-007, HP-CONT-015).
- Verweis ohne auflösbares Ziel, Hyperlink ohne `http(s)` (etwa `mailto:`): als Text übernehmen
  und melden, weil der Verweistext sonst eine Muss-Anforderung verletzt (HP-MIN-009).
- Inhalte ohne Entsprechung im Mindestprofil (Textfelder, Formulare, OLE-Objekte, Änderungsverfolgung):
  Text übernehmen und melden; wer die Struktur erhalten will, verlässt das Mindestprofil und
  deklariert eine Erweiterung (HP-MIN-002, HP-VERS-004).
- Änderungsdatum ohne Zeitzone: als UTC lesen und melden, damit `dateModified` dem Muster entspricht
  (HP-META-001).

### 4.4 Kennungen und Wiederholbarkeit

- Ein Textmarkenname, der dem Muster `^[A-Za-z][A-Za-z0-9_.-]*$` entspricht, wird unverändert zur
  Kennung des Zielelements; so bleibt ein Verweis „siehe Leistung“ über Fassungen hinweg gültig
  (HP-MIN-004, HP-ADR-004).
- Ohne Textmarke bildet der Erzeuger die Kennung deterministisch aus dem Text (Slug) und macht sie
  je Inhaltsdokument eindeutig; Zufallswerte oder Zähler über Lauf-Zeitpunkte sind unzulässig,
  weil die erneute Umwandlung dieselben Kennungen ergeben muss (HP-MIN-004, HP-ADR-002).
- Ein Bearbeiter, der ein bestehendes Dokument neu speichert, DARF Kennungen bestehender
  Abschnitte nicht ändern und gelöschte Kennungen nicht neu vergeben (HP-ADR-004).

### 4.5 Listen und Tabellen aus der Quelle

- Aufzählungszeichen und Nummern stehen nie als Text im `li`; der Prüfer erkennt `•`, `-`, `1.`
  oder `a)` am Anfang eines Listeneintrags als Fehler (HP-MIN-005, HPR-MIN-004).
- Eine Unterliste gehört in das `li` des übergeordneten Eintrags, nicht als Geschwister zwischen
  die `li` (HP-MIN-005, HPR-MIN-005).
- Jede Zeile einer Tabelle zählt, mit Spannen gerechnet, gleich viele Spalten; überdeckte Zellen
  der Quelle (`covered-table-cell`, `vMerge`) werden nicht ausgegeben (HP-MIN-006).
- Kopfzeilen der Quelle werden `thead` mit `th scope="col"`; eine Tabelle ohne markierte
  Kopfzeile bekommt kein `thead` (HP-MIN-006).

### 4.6 Bilder und Alternativtexte

Das dritte Bild der Beispielquelle hat weder einen Alternativtext noch die Markierung als
dekorativ. Der Referenzkonverter setzt dann die Beschriftung oder, wie hier, den Rahmennamen als
`alt` und meldet das Bild; die Spezifikation verlangt die Meldung, legt aber nicht fest, welcher
`alt`-Wert dann zu schreiben ist (offene Frage im Prüfbericht, [`docs/belege/S7/pruefbericht.md`](../belege/S7/pruefbericht.md)),
weshalb der Konverter den Autor zum Nachtragen auffordert (HP-MIN-007):

```text beleg:01-beispiele-bauen.txt
$ node scripts/s7-fodt2hpro.mjs docs/spezifikation/beispiele/s7-buero/angebot.fodt prototyp/out/s7/buero-b.hpro
Meldung: Bild "Bild3" hat keinen Alternativtext und ist nicht als dekorativ markiert; alt="Bild3" aus dem Rahmennamen gesetzt – bitte nachtragen (HP-MIN-007)
```

### 4.7 Weitere Festlegungen für Exportfilter (aus dem Prüfbericht)

Die folgenden Punkte hat ein fremder Entwickler beim Lesen als offen gemeldet
([`docs/belege/S7/pruefbericht.md`](../belege/S7/pruefbericht.md)); wo die Spezifikation eine Antwort
hergibt, steht sie hier mit Anforderung, sonst die Annahme des Referenzkonverters mit dem
Vermerk „nicht festgelegt“ (HP-MIN-003 als Grundregel: Struktur nur aus der Quelle).

- **Elemente ohne Zeile in 15.1** (Linie, Unter- und Durchstreichung, Definitionslisten, Fußzeile
  `tfoot`, verschachtelte Tabellen, Nummerierungsart a/i/1.1): Unter- und Durchstreichung werden
  `span` mit `data-hp-style` oder CSS-Klasse, eine Linie entfällt mit Meldung, Definitionslisten
  werden Absätze, Summenzeilen stehen im `tbody`, eine Tabelle in einer Zelle bleibt `table` in
  `td`, die Nummerierungsart geht verloren; alles andere wäre ein Element außerhalb des Bestands
  (HP-MIN-002, HP-MIN-012).
- **Abschnitte je Überschriftenebene:** nur Überschriften der obersten Gliederungsebene öffnen
  eine `section`; tiefere Ebenen bleiben flach, weil das Navigationsdokument nur die oberste
  Ebene nennen muss und tiefere `section`s die Adressen vervielfachen würden; verschachtelte
  `section`s sind ebenso konform (HP-ADR-007, HP-ADR-001).
- **Zwei Kennungen je Abschnitt:** die `section` trägt `s-<kennung der überschrift>`, die
  Überschrift die Textmarke; eine Textmarke mitten im Absatz wird ein leeres `span` mit `id`, eine
  Textmarke über mehrere Absätze markiert den ersten (HP-MIN-004, HP-ADR-001).
- **Slug-Verfahren:** die Spezifikation verlangt Wiederholbarkeit je Werkzeug, nicht
  werkzeugübergreifend gleiche Kennungen; der Referenzkonverter nutzt NFC, ä→ae, ö→oe, ü→ue,
  ß→ss, Kleinschreibung, `[^a-z0-9]+`→`-`, Beschnitt auf 48 Zeichen, Suffix `-2`, `-3`
  (HP-MIN-004, HP-ADR-002).
- **Dokumentkennung:** aus den Dokumenteigenschaften der Quelle (ODF: `meta:user-defined`
  mit Name `hpro:id`; OOXML: eine entsprechende Dokumenteigenschaft), sonst UUIDv5 über die
  Quelldatei, die sich dann mit jeder Bearbeitung ändert; der Filter sollte die Kennung beim ersten
  Export in die Quelle zurückschreiben, damit Fassungsvergleiche möglich bleiben (HP-META-001,
  HP-RS-007).
- **`dateModified` und `source.date`:** beide stammen aus dem Änderungsdatum der Quelle in UTC,
  nicht aus der Exportzeit, sonst sind zwei Läufe nie byteidentisch; die Spezifikation legt die
  Bedeutung von `source.date` nicht fest (HP-CONT-014, HP-META-005).
- **`mailto:` und `tel:`:** Teil 0 verlangt für externe Verweise eine absolute URL, der Prüfer
  (HPR-MIN-010) nur `http` und `https`; bis zur Klärung als Text mit Meldung übernehmen
  (HP-MIN-009, HPR-MIN-010).
- **Fußnoten in Tabellen, Listen, Überschriften:** der Notentext steht nach dem nächsten
  umschließenden Blockelement (`table`, `ul`, Überschrift) innerhalb desselben Abschnitts oder am
  Abschnittsende; beides erlaubt die Anforderung (HP-MIN-008).
- **Ungleiche Zellenzahl:** fehlende Zellen werden als leere `td` ergänzt und gemeldet; eine nur
  fett gesetzte erste Zeile bleibt `tbody`, weil Struktur nicht aus dem Aussehen geraten wird
  (HP-MIN-006, HP-MIN-003).
- **Nicht umwandelbare Bildformate:** Abbruch mit Nennung des Bildes ist die konforme Vorgabe; eine
  Option „Bild auslassen“ erzeugt ein Dokument, das die Quelle nicht vollständig wiedergibt, und
  wird gemeldet; `width`/`height` in CSS-Pixeln (96 dpi) sind nicht festgelegt (HP-MIN-007).
- **Ausgangsdatei unter `original/`:** Soll, aber abwählbar; sie trägt Kommentare und
  Änderungsverfolgung in den später signierten Container, deshalb melden und die Funktion
  „Metadaten bereinigen“ des Bearbeiters nennen (HP-META-005, HP-META-007).
- **Änderungsverfolgung und Kommentare:** der Stand „alle Änderungen angenommen“ wird exportiert,
  Kommentare entfallen mit Meldung; nicht festgelegt (HP-MIN-003).
- **Inhaltsverzeichnis- und Indexfelder, Kopf- und Fußzeilen, Seitenumbrüche:** Verzeichnisfelder
  entfallen, weil das Navigationsdokument sie ersetzt und ihre Seitenzahlen Fehler wären;
  Kopf- und Fußzeilentext wird einmal als Absatz am Ende übernommen und gemeldet; Seitenumbrüche
  entfallen (HP-ADR-007, HP-MIN-009, HP-PRINT-001).
- **OOXML-Vorlagen:** erkannt am sprachneutralen `w:styleId` (`Title`, `Quote`, `HTMLPreformatted`,
  `HTMLCode`) über die `w:basedOn`-Kette und an `w:outlineLvl`; `data-hp-style` trägt den
  Anzeigenamen `w:name`; nicht festgelegt (HP-MIN-003, HP-MIN-012).
- **Mehrere Inhaltsdokumente:** erlaubt, je Kapitel eine Datei in `readingOrder`; Fußnoten bleiben
  im Dokument ihres Verweises, Endnoten im letzten Dokument, Querverweise tragen dann den Pfad
  (HP-META-001, HP-MIN-008, HP-MIN-009).
- **Direkte Formatierung als CSS-Klasse:** nur relative Größen (`em`, `%`), Fett, Kursiv,
  Ausrichtung; feste Schriftgrößen und Farben würden die Ableitung aus den Lesesystem-Variablen
  unterlaufen (HP-MIN-012, HP-INH-004).
- **Lange Dokumente und Überblick:** `data-hp-role="summary"` liegt außerhalb des Elementbestands;
  ein Dokument im Mindestprofil kann HP-NEST-005 (Soll) nicht erfüllen; offener Punkt
  (HP-NEST-005, HP-MIN-002).
- **Signieren eines Dokuments im Mindestprofil:** zulässig, die Stufe Signiert ergibt sich aus der
  Signatur; der Signaturhinweis (`data-hp-role`) liegt aber außerhalb des Elementbestands, der
  Bearbeiter nimmt die Warnung HPR-PROF-016 hin; offener Punkt (HP-PROF-013, HP-MIN-002).

Der Referenzkonverter dokumentiert die eigenen Annahmen im Quelltext; die Behandlung unbekannter
Elemente (HP-MIN-002):

```js aus:scripts/s7-fodt2hpro.mjs
      else {
        say(`Element ${n.prefix}:${n.localName} ohne Entsprechung im Mindestprofil; Textinhalt übernommen`);
        html += esc(textOf(n));
      }
```

---

## 5. Anleitung für CMS und Fachanwendungen

### 5.1 Der kürzeste Weg: Inhalt plus Beschreibung, der Kern schreibt den Container

Eine Anwendung, die ihren Inhalt bereits als XHTML erzeugt (Berichte aus Daten, CMS-Export), muss
keinen eigenen Container-Schreiber bauen: sie legt die Inhaltsdokumente, Stylesheets und Medien in
ein Verzeichnis, beschreibt Metadaten, Lesereihenfolge und Inhaltsverzeichnis in einer kleinen
JSON-Datei und übergibt beides der Referenzimplementierung `@hpro/kern`, die `mimetype`,
`container.xml`, `package.opf`, `manifest.json` mit Hashes und das Navigationsdokument schreibt
(HP-CONT-002 bis HP-CONT-005, HP-CONT-008, HP-ADR-007). So ist das Beispiel
[`beispiele/s7-bericht/`](beispiele/s7-bericht/) gebaut; seine Beschreibung:

```json aus:docs/spezifikation/beispiele/s7-bericht/dokument.json
{
  "id": "urn:uuid:4e0a9c2d-7b31-4f6e-8a5c-2d9e1f0b3c47",
  "title": "Zustandsbericht Dachstuhl Haus Nr. 12",
  "language": "de-AT",
  "modified": "2026-10-12T06:00:00Z",
  "profile": "static",
  "creators": ["Büro Beispiel Bautechnik"],
  "readingOrder": ["content/index.xhtml", "content/anhang.xhtml"],
  "toc": {
    "title": "Inhalt",
    "entries": [
      { "title": "Befund", "href": "content/index.xhtml#befund", "children": [
        { "title": "Feuchteschäden", "href": "content/index.xhtml#feuchte" },
        { "title": "Messwerte", "href": "content/index.xhtml#messwerte" }
      ] },
      { "title": "Empfehlung", "href": "content/index.xhtml#empfehlung" },
      { "title": "Anhang: Messprotokoll", "href": "content/anhang.xhtml#protokoll" }
    ]
  },
```

Der Aufruf der Bibliothek ist eine Funktion, `createContainer`, die den Container schreibt, sofort
zurückliest und jeden Hash prüft; schlägt das fehl, wirft sie, statt eine fehlerhafte Datei
abzuliefern (HP-CONT-008, HP-CONT-009). Der Bauschritt aus
[`scripts/s7-lib.mjs`](../../scripts/s7-lib.mjs):

```js aus:scripts/s7-lib.mjs
  const created = await createContainer({
    id: doc.id,
    title: doc.title,
    language: doc.language,
    modified: doc.modified,
    profile: doc.profile ?? 'static',
    creators: doc.creators ?? [],
    ...(doc.description ? { description: doc.description } : {}),
    readingOrder: doc.readingOrder,
    toc: doc.toc,
    resources,
    ...(doc.accessibility ? { accessibility: doc.accessibility } : {}),
  });
```

Das Ergebnis, zweimal gebaut und verglichen (HP-CONT-014):

```text beleg:01-beispiele-bauen.txt
$ cmp docs/belege/S7/container/s7-bericht.hpro prototyp/out/s7/zweiter-lauf/s7-bericht.hpro
[Exit-Code 0]
```

### 5.2 Was die Anwendung selbst liefern muss

- Inhaltsdokumente als XHTML mit Sprache, Kennungen an allen adressierbaren Elementen und
  `alt`-Texten; der Kern prüft Wohlgeformtheit, Skriptfreiheit und externe Verweise, aber nicht
  die Semantik (HP-INH-001, HP-INH-002, HP-ADR-001, HP-INH-006, HP-INH-012, HP-CONT-010).
- Ein Stylesheet nach dem Muster aus Kapitel 4.1, Schritt 8 (HP-INH-004, HP-INH-016).
- Ein Inhaltsverzeichnis, das jede `section` der obersten Ebene nennt; daraus entsteht das
  Navigationsdokument (HP-ADR-007).
- Barrierefreiheitsmetadaten als Beschreibung, aber keine Konformitätsbehauptung ohne Prüfbericht
  im Container (HP-META-004).
- Anhänge unter `attachments/` mit Eintrag in `manifest.json#attachments` (`url`, `type`, `name`),
  wie der Kalibrierschein im Beispiel (HP-NEST-003).
- Für Formulare, Tabellen mit Formeln oder Komponenten das Profil `interactive` und die Regeln aus
  Teil 4, Kapitel 6; für Dokumente, die nur gelesen werden, bleibt `static` (HP-PROF-001,
  HP-PROF-002).

### 5.3 Andere Programmiersprachen

- Der Kern ist TypeScript; für Java, .NET, Python oder C++ gilt das Dateiformat als Schnittstelle:
  Teil 0 beschreibt jeden Eintrag so, dass ein Erzeuger mit ZIP-, SHA-256-, XML- und JSON-Bibliothek
  der Standardbibliothek auskommt (Teil 0, Abschnitt 17.2).
- Der Prüfstein hat das belegt: [`pruefstein/min_producer.py`](../../pruefstein/min_producer.py)
  schreibt aus einer JSON-Eingabe ein konformes Dokument nur mit der Python-Standardbibliothek;
  sein Fragenprotokoll [`pruefstein/fragen.md`](../../pruefstein/fragen.md) nennt die Stellen, an
  denen Teil 0 noch Spielraum ließ (Teil 0, Abschnitt 17.3).
- Wer eine eigene Umsetzung baut, prüft sie mit denselben Werkzeugen wie der Kern: `hpro inspect`
  (Hash-Manifest), `hpro-check` (Regelkatalog), epubcheck (Rückfallebene) (HP-CONT-009,
  HP-VERS-008, HP-CONT-017).

---

## 6. Über das Mindestprofil hinaus

### 6.1 Erweiterungen deklarieren

- Eigene Attribute, Manifestschlüssel, CSS-Variablen und Elemente tragen den Präfix `x-<kennung>-`
  (`data-x-<kennung>-…`, `--x-<kennung>-…`); `hp` ist dem Standard vorbehalten (HP-VERS-005).
- Jede Erweiterung steht in `manifest.json#extensions` mit `id` (absolute URI des Anbieters),
  `required` und optional `url` und `dir`; Dateien der Erweiterung liegen unter `ext/<kennung>/`
  (HP-VERS-004).
- Eine Erweiterung darf keine Muss-Anforderung aufheben: keine Skripte außerhalb `components/`,
  keine externen Ressourcen, keine Inhalte, die nur mit Erweiterung sichtbar sind (HP-VERS-007,
  HPG-EXT-004).
- Ein Lesesystem ohne die Erweiterung zeigt das Dokument vollständig an; bei `required: true`
  mit Hinweis, nie mit Verweigerung (HP-VERS-006).

Ein vollständiges gültiges und ein ungültiges Beispiel mit Prüfergebnis stehen in Teil 2,
Abschnitt 7.3 und Teil 2, Abschnitt 7.4.

### 6.2 Tabellen mit Formeln

- Eine Formelzelle trägt `data-hp-formula` (OpenFormula-Syntax im Teilumfang von Teil 3),
  `data-hp-value` (zuletzt berechneter Wert in kanonischer Form), `data-hp-type` (Wertart) und als
  Zellinhalt die Anzeige des Werts; der Zellinhalt ist nie die Formel (HP-SBX-016, HPF-STO-001).
- Zahlen, auf die eine Formel zugreift, stehen als Wertzellen mit `data-hp-value` und
  `data-hp-type`; ein Zellinhalt wie `1.234,50` wird nicht als Zahl gelesen (HPF-STO-004).
- Keine Makros, keine Funktionen mit Netz-, Datei-, Zufalls- oder Uhrzeitzugriff (HP-SBX-016).
- Ein Dokument mit Formelzellen ist weiter Stufe Basis; erst eine Komponente, die neu rechnet,
  verlangt das Profil `interactive` (HP-SBX-016, HP-PROF-003).

Das lebendige Beispiel des Umsetzer-Handbuchs zeigt eine solche Tabelle (Auszug; Betrag und
Summe sind Formelzellen):

```xml aus:docs/spezifikation/beispiele/s7-lebendig/content/index.xhtml
            <tr><td>1</td><td>Nord</td>
                <td data-hp-type="float" data-hp-value="62.5" data-hp-input="true">62,5</td>
                <td data-hp-type="currency" data-hp-unit="EUR" data-hp-value="80">80,00 €</td>
                <td data-hp-type="currency" data-hp-unit="EUR" data-hp-formula="=ROUND([.C2]*[.D2];2)" data-hp-value="5000">5.000,00 €</td></tr>
…
            <tr><th scope="row" colspan="4">Summe netto</th>
                <td id="positionen.E4" data-hp-type="currency" data-hp-unit="EUR" data-hp-formula="=SUM([.E2:.E3])" data-hp-value="9600">9.600,00 €</td></tr>
```

### 6.3 Was ein Textprogramm beim Import aus hpro beachtet (informativ)

Ein Lesesystem mit Export in ein Büroformat wendet die Tabelle aus Teil 0, Abschnitt 15.2
umgekehrt an: `h2` nach Titelvorlage wird „Überschrift 1“, `ul` im `li` wird Listenebene 2,
`thead` wird wiederholte Kopfzeile, `figure` mit `figcaption` wird Bild mit Beschriftung,
`aside role="doc-footnote"` wird Fußnote; die Kennung bleibt als Textmarke erhalten, damit der
Rückweg dieselben Adressen ergibt (HP-MIN-011, HP-MIN-004). Der Prüfbefehl des Mindestprofils
auf dem umgewandelten Beispiel:

```text beleg:03-pruefer.txt
$ check docs/belege/S7/container/s7-buero.hpro --json docs/belege/S7/berichte/s7-buero.json
Prüfbericht s7-buero.hpro (9374 Bytes, sha256 656419ba1437c745…), Katalog Teil 1 v0.1 (156 Regeln), hpro-check (hpro Konformitätsprüfer) 0.1.0
Beanspruchte Stufen: Basis
…
Befunde: 0 fatal, 0 Fehler, 0 Warnungen, 0 Hinweise, 4 nicht geprüft
Stufe Basis: unbestimmt
Berichtsschema: gültig
[Exit-Code 3]
```

---

## 7. Prüfen vor der Abgabe

### 7.1 Konformitätsprüfer

- `hpro-check <datei>` prüft gegen den Regelkatalog aus Teil 1 und gibt je Befund Klasse, Regel, Ort
  und Meldung aus; Rückgabe 0 bestanden, 1 nicht bestanden, 2 Prüfer lief nicht, 3 unbestimmt
  (Teil 1, Abschnitt 4.4, Teil 1, Abschnitt 4.5).
- Das Urteil „unbestimmt“ bei einem fehlerfreien Dokument ist kein Mangel des Dokuments: vier
  Regeln brauchen eine Browser-Engine (Reflow bei 320 px, Alternativtexte in SVG, reduzierte
  Bewegung) und stehen ohne sie als „nicht geprüft“; ein Erzeuger prüft diese Punkte mit einem
  Browser nach (Teil 1, Abschnitt 2.4, HP-INH-003, HP-INH-014).
- Die Konformitätsaussage „ist hpro 0.1“ setzt einen Bericht ohne Fehler voraus; der Prüfer
  kann ihn als `data/conformance-report.json` ins Dokument legen, und zwar vor dem Signieren
  (HP-VERS-008, Teil 1, Abschnitt 3.5).

Der Lauf auf dem umgewandelten Beispiel mit EPUB-Validator (die `--json`-Datei ist der
maschinenlesbare Bericht nach Teil 1, Abschnitt 4.3):

```text beleg:03-pruefer.txt
$ check docs/belege/S7/container/s7-buero.hpro --json docs/belege/S7/berichte/s7-buero.json
Prüfbericht s7-buero.hpro (9374 Bytes, sha256 656419ba1437c745…), Katalog Teil 1 v0.1 (156 Regeln), hpro-check (hpro Konformitätsprüfer) 0.1.0
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

### 7.2 EPUB-Validator

Dieselben Bytes unter der Endung `.epub` müssen einen EPUB-3.3-Validator mit 0 Fehlern
bestehen; epubcheck verweigert andere Endungen, deshalb prüft man eine Kopie (HP-CONT-017,
HP-CONT-013):

```text beleg:09-endung.txt
$ prototyp/tools/jdk-21.0.12.1+1/bin/java -jar prototyp/tools/epubcheck-5.4.0/epubcheck.jar prototyp/out/s7/s7-buero.epub
Validating using EPUB version 3.4 rules.
No errors or warnings detected.
Messages: 0 fatals / 0 errors / 0 warnings / 0 infos

EPUBCheck completed
[Exit-Code 0]
```

Das Stylesheet des Mindestprofils, das der Konverter beilegt, erfüllt die Bildschirmregeln ohne
Zutun des Autors (HP-INH-004, HP-INH-016, HP-INH-003):

```js aus:scripts/s7-fodt2hpro.mjs
body {
  font-family: serif;
  font-size: var(--hp-font-size, 1rem);
  line-height: var(--hp-line-height, 1.5);
  letter-spacing: var(--hp-letter-spacing, normal);
  word-spacing: var(--hp-word-spacing, normal);
  color: var(--hp-foreground, #111);
  background: var(--hp-background, #fff);
```

---

## 8. Häufige Fehler und ihre Meldungen

Die öffentliche Testsuite ([`testsuite/`](../../testsuite/)) enthält zu jeder Regel des
Mindestprofils einen Schlechtfall; die Meldungen unten stammen aus Läufen des Prüfers auf diesen
Dateien (Teil 1, Abschnitt 5.12).

| Fehler in der Quelle oder im Filter | Meldung des Prüfers | Anforderung |
|---|---|---|
| Verweistext „Seite 12“ aus einem Seitenverweis übernommen | HPR-MIN-010 „Verweistext „Seite 12“ nennt eine Seitenzahl; Adressen ersetzen Seiten.“ | HP-MIN-009 |
| Kopfzeile als `td` statt `th scope="col"` | HPR-MIN-007 „Kopfzelle ist `td` ohne `scope="col"`.“ | HP-MIN-006 |
| Aufzählungszeichen als Text im Listeneintrag | HPR-MIN-004 „Listeneintrag beginnt mit „•“; Zeichen und Nummern erzeugt die Liste.“ | HP-MIN-005 |
| Unterliste als Geschwister der `li` | HPR-MIN-005 „`ul` direkt in einer Liste; verschachtelte Listen gehören in ein `li`.“ | HP-MIN-005 |
| Bild im Absatz statt in `figure` | HPR-MIN-008 „`img` steht nicht in figure.“ | HP-MIN-007 |
| Fußnotenverweis ohne `epub:type="noteref"` | HPR-MIN-009 (Fußnote als Paar aus `doc-noteref` und `doc-footnote`) | HP-MIN-008 |
| `details`, `main`, `aria-*` oder andere Elemente außerhalb des Bestands bei gesetztem `subset` | HPR-MIN-002 „… liegt außerhalb des Mindestprofils.“ | HP-MIN-002 |
| `subset` gesetzt, aber Profil `interactive` | HPR-MIN-001 | HP-MIN-001 |
| Überschrift aus Fettdruck erraten, Tabelle als Tabulatorabsätze | kein Prüferbefund, aber Verstoß; nur durch Stichprobe nach HP-MIN-003 erkennbar | HP-MIN-003 |

Die Schlechtfälle entstehen aus dem konformen Grunddokument der Testsuite durch genau eine
Änderung; so ist der Befund eindeutig einer Regel zuzuordnen (Teil 1, Abschnitt 5.12). Auszug aus
dem Generator [`scripts/s3-testsuite.mjs`](../../scripts/s3-testsuite.mjs):

```js aus:scripts/s3-testsuite.mjs
minCase('schlecht-min-004-aufzaehlungszeichen', 'Listeneintrag beginnt mit Aufzählungszeichen aus der Quelle', 'HPR-MIN-004', '<li>Eindeckung</li>', '<li>• Eindeckung</li>');
minCase('schlecht-min-005-liste', 'Unterliste direkt in der Liste statt im li', 'HPR-MIN-005', '<li>Eindeckung</li>', '<li>Eindeckung</li>\n      <ul><li>Firstziegel</li></ul>');
minCase('schlecht-min-006-spalten', 'Zeile mit abweichender Spaltenzahl', 'HPR-MIN-006', '<tr><td>Eindeckung</td><td>9.600,00 EUR</td></tr>', '<tr><td>Eindeckung</td><td>9.600,00 EUR</td><td>netto</td></tr>');
minCase('schlecht-min-007-kopfzeile', 'Kopfzeile mit td statt th scope="col"', 'HPR-MIN-007', '<th scope="col">Betrag</th>', '<td>Betrag</td>');
minCase('schlecht-min-008-bild', 'Bild ohne figure', 'HPR-MIN-008', '<p id="verweis">', '<p id="logo"><img src="media/skizze.svg" alt="Logo"/></p>\n    <p id="verweis">');
minCase('schlecht-min-009-fussnote', 'Fußnotenverweis ohne epub:type', 'HPR-MIN-009', ' role="doc-noteref" epub:type="noteref"', ' role="doc-noteref"');
minCase('schlecht-min-010-seitenzahl', 'Verweistext nennt eine Seitenzahl', 'HPR-MIN-010', '<a href="anhang.xhtml#plan">Anhang</a>', '<a href="anhang.xhtml#plan">Seite 12</a>');
```

Zwei dieser Läufe im Wortlaut; die vollständige Ausgabe aller fünf steht in
[`docs/belege/S7/03-pruefer.txt`](../belege/S7/03-pruefer.txt) (Textausgabe nach Teil 1,
Abschnitt 4.4):

```text beleg:03-pruefer.txt
$ check testsuite/dokumente/schlecht-min-010-seitenzahl.hpro --no-epubcheck --no-not-checked
Prüfbericht schlecht-min-010-seitenzahl.hpro (4302 Bytes, sha256 5ecfe4ac6339ab57…), Katalog Teil 1 v0.1 (156 Regeln), hpro-check (hpro Konformitätsprüfer) 0.1.0
Beanspruchte Stufen: Basis
FEHLER HPR-MIN-010 content/index.xhtml:26: content/index.xhtml:26: Verweistext „Seite 12“ nennt eine Seitenzahl; Adressen ersetzen Seiten.
Befunde: 0 fatal, 1 Fehler, 0 Warnungen, 0 Hinweise, 6 nicht geprüft
Stufe Basis: nicht bestanden
Berichtsschema: gültig
[Exit-Code 1]
```

```text beleg:03-pruefer.txt
$ check testsuite/dokumente/schlecht-min-005-liste.hpro --no-epubcheck --no-not-checked
Prüfbericht schlecht-min-005-liste.hpro (4311 Bytes, sha256 8c0f20feb57bc4fc…), Katalog Teil 1 v0.1 (156 Regeln), hpro-check (hpro Konformitätsprüfer) 0.1.0
Beanspruchte Stufen: Basis
FEHLER HPR-MIN-005 content/index.xhtml:19: content/index.xhtml:19: `ul` direkt in einer Liste; verschachtelte Listen gehören in ein `li`.
Befunde: 0 fatal, 1 Fehler, 0 Warnungen, 0 Hinweise, 6 nicht geprüft
Stufe Basis: nicht bestanden
Berichtsschema: gültig
[Exit-Code 1]
```

Hinweise für Autoren, die mit einer Textverarbeitung schreiben, damit der Filter sauber arbeiten
kann: Überschriften über Vorlagen setzen, nicht über Fettdruck (HP-MIN-003); Listen über die
Listenfunktion, nicht über Bindestriche (HP-MIN-005); Tabellen mit markierter Kopfzeile
(HP-MIN-006); jedem Bild einen Alternativtext geben oder es als dekorativ markieren (HP-MIN-007);
Querverweise als Textmarkenverweis mit Text statt „siehe Seite 7“ (HP-MIN-009); Verweise nur auf
Inhaltsdokumente, nie auf eine SVG-Datei, weil solche Ziele in der EPUB-Rückfallebene ungültig
sind (HP-ADR-006, HP-CONT-017).
