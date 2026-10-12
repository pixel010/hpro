# hpro 0.1 – Spezifikation (Teil 3: Tabellen und Formeln)

**Status:** Arbeitsentwurf 0.1 · **Stand:** 11.10.2026 · **Paket:** S6 aus [`docs/08-arbeitsplan.md`](../08-arbeitsplan.md)
**Grundlage:** [Teil 0 (Kern)](00-spezifikation.md), [Teil 1 (Konformität)](01-konformitaet.md); [`docs/10-anspruch-und-funktionsprofil.md`](../10-anspruch-und-funktionsprofil.md), Zusage 7 (verbindlich)
**Formelsprache:** OpenFormula, OASIS Open Document Format 1.3 Teil 4 (= ISO/IEC 26300-2), in dem hier festgelegten Teilumfang
**Mechanische Prüfung dieses Dokuments:** [`scripts/check-formeln.mjs`](../../scripts/check-formeln.mjs) (läuft in `npm test`), Belege in [`docs/belege/S6/`](../belege/S6/README.md)
**Maschinenlesbare Funktionsliste:** [`03-funktionen.json`](03-funktionen.json) (aus Abschnitt 8.2 erzeugt, Gleichstand wird geprüft)

---

## 0. Zweck und Geltungsbereich

Ein hpro-Dokument darf rechnen: Tabellen mit Formeln, die sich beim Ausfüllen neu berechnen,
Summen, Verweise zwischen Tabellen, Prüfungen ([Q2], Zusage 7). Dieser Teil legt fest, **welche**
Formelsprache ein Dokument enthalten darf, **wie** Formel und berechneter Wert gespeichert werden,
**was** ein Rechner liefern muss, damit zwei Rechner aus demselben Dokument dieselben Zahlen
erzeugen, und **wie** sich das in der eingefrorenen, signierten Fassung und beim Import verhält.

Leitentscheidungen, alle aus [Q2]:

1. **Keine eigene Formelsprache.** Syntax und Funktionen sind ein dokumentierter Teilumfang von
   OpenFormula ([Q1]). Wo OpenFormula etwas dem Rechner („evaluator“) oder dem Wirt („host“)
   überlässt, legt dieser Teil es fest, damit das Ergebnis nicht vom Programm abhängt.
2. **Rechnen ist rein.** Keine Uhrzeit, kein Zufall, kein Netz, keine Datei, kein Zustand außerhalb
   des Dokuments. Gleiche Eingaben ergeben bitgleiche Ergebnisse.
3. **Formel und Wert werden beide gespeichert.** Ohne Rechner sieht man die Zahlen der letzten
   Berechnung; die eingefrorene Fassung zeigt genau das, was berechnet wurde.
4. **Keine Makros.** Keine Skripte in Tabellen, keine Funktionen, die Code ausführen.
5. **Grenzen offen benennen.** Was nicht unterstützt wird, wird beim Import als Wert eingefroren und
   gemeldet, nicht stillschweigend verworfen.

Nicht Gegenstand dieses Teils: die Oberfläche eines Tabelleneditors, Diagramme, Pivot-Auswertungen,
Matrixformeln, Datenbankfunktionen, komplexe Zahlen, Formatcodes für die Anzeige. Der Rechner im
Kern und seine Gegenprobe gegen verbreitete Tabellenkalkulationen sind Paket P19.

---

## 1. Konventionen

### 1.1 Normative Wörter

Wie in Teil 0 ([Q3], Abschnitt 1.1): **MUSS**, **DARF NICHT**, **SOLL**, **SOLL NICHT**, **KANN**
nach RFC 2119 und RFC 8174 ([Q7]). Jede Anforderung hat genau einen Grad *Muss*, *Soll* oder *Kann*.

### 1.2 Aufbau einer Anforderung

```
#### HPF-<BEREICH>-<NNN> · <Grad> · <Stufe>
<Subjekt> MUSS/SOLL/KANN … (ein beobachtbares Merkmal)

*Prüfverfahren:* … (wie man das Merkmal beobachtet, mit erwartetem Ergebnis)
*Grundlage:* [Qn] … (Fremdgrundlage mit Quelle, oder „eigene Konvention/Festlegung“)
```

Das Präfix `HPF` unterscheidet die Anforderungen dieses Teils von denen in Teil 0 (`HP`) und den
Prüfregeln in Teil 1 (`HPR`, `HPL`). Bereiche: `SYN` Formelsyntax, `TYP` Werte und Umwandlung,
`NUM` Genauigkeit und Rundung, `DAT` Datum und Zeit, `ERR` Fehlerwerte, `FN` Funktionsumfang, `STO`
Speicherung von Formel und Wert, `ADR` Adressierung von Zellen, `CALC` Neuberechnung, `FRZ`
eingefrorene und signierte Fassung, `IMP` Import und Export, `SEC` Sicherheit. Die Nummern je
Bereich sind lückenlos; eine vergebene Nummer wird nicht wiederverwendet.

Stufen und Subjekte wie in Teil 0: Stufen *Basis*, *Lebendig*, *Signiert*, *Archiv*; Subjekte
**Dokument** (D), **Erzeuger** (E), **Bearbeiter** (B), **Lesesystem** (L), **Prüfer** (P). Der
**Rechner** ist der Teil eines Lesesystems, Bearbeiters oder Erzeugers, der Formeln auswertet; eine
Anforderung an den Rechner gilt für jede Software, die Werte aus Formeln erzeugt.

### 1.3 Stufen in diesem Teil

| Stufe | Was sie hier bedeutet |
|---|---|
| **Basis** | Das Dokument speichert Formel und Wert korrekt; ein Lesesystem zeigt die gespeicherten Werte, auch ohne Rechner. Hat ein Lesesystem einen Rechner, muss er diesem Teil entsprechen |
| **Lebendig** | Das Lesesystem hat einen Rechner, lässt Eingabezellen ausfüllen und berechnet neu, ohne das Dokument neu zu laden |
| **Signiert** | Eingefrorene Fassung: Werte sind festgeschrieben, Rechnerstand und Zeitpunkt stehen im Manifest, das Lesesystem ersetzt nichts |
| **Archiv** | Formeln bleiben auch langfristig lesbar neben den Werten |

### 1.4 Begriffe

| Begriff | Bedeutung |
|---|---|
| Tabelle | ein `table`-Element eines Inhaltsdokuments der Fassung |
| Zelle | ein `td`- oder `th`-Element; seine Rasterposition ergibt sich aus Abschnitt 10 |
| Formelzelle | Zelle mit Attribut `data-hp-formula` |
| Wertzelle | Zelle mit Attribut `data-hp-value` (jede Formelzelle ist eine Wertzelle; Eingabezellen mit Zahlen ebenfalls) |
| Eingabezelle | Zelle, die im lebendigen Dokument ausgefüllt werden darf (`data-hp-input`) |
| Zellwert | der Wert, den die Zelle in Formeln hat: Zahl, Text, Wahrheitswert, Fehlerwert oder *leer* |
| Wertart | Wert von `data-hp-type`: `float`, `percentage`, `currency`, `date`, `time`, `boolean`, `string`, `error` (Namen aus [Q4]) |
| kanonische Zahlform | kürzeste Dezimaldarstellung einer binary64-Zahl, die beim Einlesen denselben Wert ergibt (Abschnitt 5) |
| Datumsserie | Zahl der Tage seit dem 30.12.1899 (Abschnitt 6) |
| Rechner | Software, die Formeln nach diesem Teil auswertet |
| Abhängigkeitsgraph | gerichteter Graph der Formelzellen und der Zellen, auf die sie verweisen |

---

## 2. Übersicht (informativ)

Eine Kostentabelle in einem Inhaltsdokument:

```html
<table id="kosten" data-hp-table="scroll">
  <caption>Kostenschätzung</caption>
  <thead><tr><th>Position</th><th>Menge</th><th>Einheit</th><th>Einzelpreis</th><th>Gesamt</th></tr></thead>
  <tbody>
    <tr><td>Aushub</td>
        <td data-hp-type="float" data-hp-value="42.5" data-hp-input="true">42,5</td>
        <td>m³</td>
        <td data-hp-type="currency" data-hp-unit="EUR" data-hp-value="18.9">18,90 €</td>
        <td data-hp-type="currency" data-hp-unit="EUR" data-hp-formula="=ROUND([.B2]*[.D2];2)" data-hp-value="803.25">803,25 €</td></tr>
    <tr><td>Schotter</td>
        <td data-hp-type="float" data-hp-value="12" data-hp-input="true">12</td>
        <td>t</td>
        <td data-hp-type="currency" data-hp-unit="EUR" data-hp-value="31">31,00 €</td>
        <td data-hp-type="currency" data-hp-unit="EUR" data-hp-formula="=ROUND([.B3]*[.D3];2)" data-hp-value="372">372,00 €</td></tr>
  </tbody>
  <tfoot>
    <tr><th colspan="4">Summe netto</th>
        <td data-hp-type="currency" data-hp-unit="EUR" data-hp-formula="=SUM([.E2:.E3])" data-hp-value="1175.25">1.175,25 €</td></tr>
    <tr><th colspan="4">Umsatzsteuer 20 %</th>
        <td data-hp-type="currency" data-hp-unit="EUR" data-hp-formula="=ROUND([.E4]*[steuer.B1];2)" data-hp-value="235.05">235,05 €</td></tr>
  </tfoot>
</table>
<p>Die Schätzung schließt mit <a href="#kosten.E4" data-hp-ref="value">1.175,25 €</a> netto.</p>
```

Die Formel steht in `data-hp-formula` in OpenFormula-Syntax (Bezüge in eckigen Klammern,
`;` als Parametertrenner, `.` als Dezimaltrenner), der zuletzt berechnete Wert in kanonischer Form
in `data-hp-value`, die Wertart in `data-hp-type`, die Anzeige im Zellinhalt. Die zweite Tabelle
`steuer` liefert den Steuersatz über einen Tabellenbezug `[steuer.B1]`. Ein Lesesystem ohne
Rechner zeigt die Zellinhalte; ein Lesesystem mit Rechner rechnet nach und zeigt nach einer Eingabe
in `B2` sofort die neue Summe. Das Manifest der Fassung nennt Zeitpunkt und Rechner:

```json
{ "computedAt": "2026-10-11T15:04:00Z", "calculator": { "name": "hpro-calc", "version": "0.1.0" } }
```

---

## 3. Formelsyntax

Die Formelsyntax ist die von OpenFormula ([Q1], Kapitel 5), eingeschränkt auf das, was ein
Dokument braucht, das überall gleich rechnen soll. Was OpenFormula für die „Small Group“ ([Q1]
§2.3.2) verlangt, ist hier enthalten, mit den Ausnahmen in [HPF-SYN-009](#hpf-syn-009--muss--basis).

#### HPF-SYN-001 · Muss · Basis
Der Wert von `data-hp-formula` MUSS der Produktion `Formula` aus [Q1] §5.2 entsprechen, mit genau
einem einleitenden `=` (`Intro` ohne `ForceRecalc`); das Namensraumpräfix `of:` aus
OpenDocument-Dateien DARF NICHT enthalten sein.

*Prüfverfahren:* Jeden Formeltext mit einem Parser nach [Q1] §5 einlesen; erstes Zeichen `=`, zweites
Zeichen nicht `=`, Text beginnt nicht mit `of:`. Erwartetes Ergebnis: alle Formeln parsen, keine
Verstöße.
*Grundlage:* [Q1] §5.2 (Formula, Intro); eigene Einschränkung (kein `ForceRecalc`, da die
Neuberechnung nach Abschnitt 11 immer vollständig ist).

#### HPF-SYN-002 · Muss · Basis
Zahlen in Formeln MÜSSEN als `StandardNumber` nach [Q1] §5.3 geschrieben sein: Ziffern, `.` als
Dezimaltrenner, optional `E`/`e` mit Exponent; der Erzeuger DARF NICHT die Kurzform ohne führende
Ziffer (`.5`) und DARF NICHT Tausendertrenner oder `,` schreiben.

*Prüfverfahren:* Zahlliterale aller Formeln gegen die Produktion `StandardNumber` prüfen.
Erwartetes Ergebnis: alle Literale entsprechen ihr.
*Grundlage:* [Q1] §5.3 („Evaluators shall write numbers only using the StandardNumber format“).

#### HPF-SYN-003 · Muss · Basis
Textkonstanten MÜSSEN in doppelten Anführungszeichen stehen, ein Anführungszeichen im Text wird
verdoppelt (`""`); der Erzeuger MUSS die Zeichen `<`, `&` und `"` im Attributwert nach den
XML-Regeln maskieren, sodass der entmaskierte Attributwert die Formel ist.

*Prüfverfahren:* Attributwert entmaskieren, Textkonstanten gegen die Produktion `String` aus [Q1]
§5.4 prüfen. Erwartetes Ergebnis: alle Konstanten gültig; ein Formeltext mit `"a""b"` ergibt die
Textkonstante `a"b`.
*Grundlage:* [Q1] §5.4; [Q9] (Attributwerte in XHTML).

#### HPF-SYN-004 · Muss · Basis
Funktionsaufrufe MÜSSEN Parameter mit `;` trennen; der Erzeuger MUSS Funktionsnamen in
Großbuchstaben schreiben; der Rechner MUSS Funktionsnamen ohne Rücksicht auf Groß- und
Kleinschreibung erkennen; leere Parameter (`;;`) DÜRFEN NICHT vorkommen, außer wo die
Funktionsliste in Abschnitt 8.2 sie ausdrücklich zulässt (`IF`, `INDEX`).

*Prüfverfahren:* Formeln parsen; Trenner und Namen prüfen; Formel `=if([.A1];1;0)` einem Rechner
geben. Erwartetes Ergebnis: Erzeuger schreibt `IF`; der Rechner wertet `if` und `IF` gleich aus;
ein `,` als Trenner ist ein Syntaxfehler.
*Grundlage:* [Q1] §5.6 („Function names are case-insensitive“, `Separator ::= ';'`).

#### HPF-SYN-005 · Muss · Basis
Es DÜRFEN NICHT andere Operatoren vorkommen als: Präfix `+`, `-`; Postfix `%`; Infix `^`, `*`, `/`,
`+`, `-`, `&`, `=`, `<>`, `<`, `<=`, `>`, `>=` und der Bereichsoperator `:` innerhalb eines Bezugs;
Rangfolge und Assoziativität sind die aus [Q1] §5.5 Tabelle 1. Die Bezugsoperatoren `!`
(Schnittmenge) und `~` (Vereinigung) DÜRFEN NICHT vorkommen.

*Prüfverfahren:* Formeln tokenisieren, Operatoren zählen; `=2+3*4^2` und `=-2^2` auswerten.
Erwartetes Ergebnis: nur zugelassene Operatoren; `50` und `4` (Präfix-Minus bindet stärker als `^`,
wie Tabelle 1 festlegt).
*Grundlage:* [Q1] §5.5 Tabelle 1; eigene Einschränkung (keine Bezugsmengen, siehe HPF-SYN-009).

#### HPF-SYN-006 · Muss · Basis
Bezüge MÜSSEN in eckigen Klammern nach [Q1] §5.8 stehen: `[.B7]` (Zelle derselben Tabelle),
`[.B2:.B9]` (Bereich derselben Tabelle), `[kosten.B7]` und `[kosten.B2:.B9]` (Zelle oder Bereich der
Tabelle mit `id="kosten"` im selben Inhaltsdokument). Spaltenbuchstaben sind Großbuchstaben, Zeilen
beginnen bei 1; ein `$` vor Spalte oder Zeile ist zulässig und hat für den Wert keine Bedeutung.

*Prüfverfahren:* Jeden Bezug gegen die Grammatik `'[' (SheetName)? '.' '$'? [A-Z]+ '$'? [1-9][0-9]*
(':' '.' '$'? [A-Z]+ '$'? [1-9][0-9]*)? ']'` prüfen; `SheetName` ist eine Tabellenkennung nach
[HPF-ADR-001](#hpf-adr-001--muss--basis). Erwartetes Ergebnis: alle Bezüge gültig; `[.$B$7]` und
`[.B7]` liefern denselben Wert.
*Grundlage:* [Q1] §5.8 (Reference, RangeAddress, Column, Row); [HP-ADR-008](00-spezifikation.md#hp-adr-008--kann--basis).

#### HPF-SYN-007 · Muss · Basis
Bezüge DÜRFEN NICHT auf Quellen außerhalb des Inhaltsdokuments zeigen: keine `Source`-Angabe
(`'IRI'#`), keine Tabellenkennung, die nicht im selben Inhaltsdokument existiert, keine ganzen
Zeilen oder Spalten (`[.A:.A]`, `[.1:.1]`), keine dreidimensionalen Bereiche über mehrere Tabellen.

*Prüfverfahren:* Bezüge parsen; `Source`, Zeilen-/Spaltenformen und Tabellenkennungen prüfen.
Erwartetes Ergebnis: 0 Verstöße; jede Tabellenkennung löst auf ein `table`-Element der Datei auf.
*Grundlage:* [Q1] §5.8 (Source, whole-row/column); Zusage 7 aus [Q2] (kein Dateizugriff);
eigene Einschränkung (Spalten- und Zeilenbereiche hängen von Rechnergrenzen ab).

#### HPF-SYN-008 · Muss · Basis
Fehlerkonstanten in Formeln MÜSSEN einen der Namen aus Abschnitt 7 tragen; andere Namen nach der
Produktion `Error` aus [Q1] §5.12 DÜRFEN NICHT vorkommen.

*Prüfverfahren:* Fehlerliterale aller Formeln gegen die Tabelle in 7.1 prüfen. Erwartetes
Ergebnis: alle bekannt.
*Grundlage:* [Q1] §5.12 (Error, Tabelle 4); eigene Festlegung der Menge.

#### HPF-SYN-009 · Muss · Basis
Folgende Syntax aus [Q1] DARF NICHT in `data-hp-formula` vorkommen: Inline-Arrays (`{…}`, §5.13),
benannte Ausdrücke (§5.11), Beschriftungsbezüge und automatische Schnittmengen (§5.10),
Bezugslisten (§5.9), Funktionsnamen mit Namensraumpräfix nach §5.7 und jede Funktion, die nicht in
Abschnitt 8.2 steht.

*Prüfverfahren:* Formeln parsen; Vorkommen der genannten Konstrukte und unbekannter Funktionsnamen
zählen. Erwartetes Ergebnis: 0.
*Grundlage:* [Q1] §2.3.2 (Small Group braucht Arrays und `~` nicht); eigene Einschränkung.

#### HPF-SYN-010 · Muss · Basis
Eine Formel DARF NICHT länger als 1024 Zeichen sein (gezählt ohne die eckigen Klammern und den
Punkt eines Bezugs ohne Tabellenkennung), DARF NICHT mehr als 30 Parameter an eine Funktion mit
Parameterliste übergeben, DARF NICHT Funktionsaufrufe tiefer als 7 Ebenen schachteln und DARF NICHT
Textkonstanten länger als 32767 Zeichen enthalten.

*Prüfverfahren:* Länge, Parameterzahl, Schachtelungstiefe und Konstantenlänge je Formel messen.
Erwartetes Ergebnis: alle innerhalb der Grenzen.
*Grundlage:* [Q1] §3.7 (Basic Limits, dort Mindestwerte für Rechner); eigene Verschärfung zu
Höchstwerten für Dokumente, damit jeder Rechner mit Basic Limits ausreicht.

#### HPF-SYN-011 · Muss · Basis
Leerraum (U+0020, U+0009, U+000A, U+000D) außerhalb von Textkonstanten MUSS vom Rechner ignoriert
werden; der Erzeuger SOLL NICHT Leerraum innerhalb von Bezügen oder Zahlen schreiben.

*Prüfverfahren:* `=SUM( [.A1:.A3] )` und `=SUM([.A1:.A3])` auswerten. Erwartetes Ergebnis:
gleicher Wert.
*Grundlage:* [Q1] §5.14.

---

## 4. Werte und Umwandlung

OpenFormula lässt dem Rechner bei Umwandlungen Spielraum (Text zu Zahl, Text zu Wahrheitswert,
Vergleich mit Näherung, Gebietsschema). Jeder Spielraum ist hier geschlossen.

#### HPF-TYP-001 · Muss · Basis
Ein Rechner MUSS genau diese Wertarten unterscheiden: Zahl (binary64), Text, Wahrheitswert (eigener
Typ, nicht Zahl), Fehlerwert und *leer* (leere Zelle); Datum, Uhrzeit, Prozent und Währung sind
Zahlen mit einer Anzeigeart nach [HPF-STO-003](#hpf-sto-003--muss--basis), keine eigenen Typen im
Rechner.

*Prüfverfahren:* `=ISLOGICAL(TRUE())`, `=ISNUMBER(TRUE())`, `=ISNUMBER(DATE(2026;1;1))`,
`=ISBLANK([.Z99])` (leere Zelle) auswerten. Erwartetes Ergebnis: `TRUE`, `FALSE`, `TRUE`, `TRUE`.
*Grundlage:* [Q1] §4.3, §4.5 („Distinct Logical“), §4.6, §4.7; [Q5] (binary64).

#### HPF-TYP-002 · Muss · Basis
Wo eine Zahl erwartet wird, MUSS der Rechner umwandeln: Wahrheitswert → 1 oder 0; leere Zelle → 0;
Text → Fehlerwert `#VALUE!` (auch wenn der Text wie eine Zahl aussieht); Fehlerwert → derselbe
Fehlerwert. Eine stillschweigende Umwandlung von Text in Zahlen DARF NICHT stattfinden; sie ist nur
über `VALUE` möglich.

*Prüfverfahren:* `="3"+4`, `=TRUE()+1`, `=[.Z99]+1` (leer), `=VALUE("3")+4` auswerten. Erwartetes
Ergebnis: `#VALUE!`, `2`, `1`, `7`.
*Grundlage:* [Q1] §6.3.5 (Text-Umwandlung dort „implementation-defined“); eigene Festlegung, damit
das Ergebnis nicht vom Gebietsschema abhängt.

#### HPF-TYP-003 · Muss · Basis
Wo ein Wahrheitswert erwartet wird, MUSS der Rechner umwandeln: Zahl → `TRUE` wenn ungleich 0;
leere Zelle → `FALSE`; Text → `#VALUE!`; Fehlerwert → derselbe Fehlerwert.

*Prüfverfahren:* `=IF(2;"a";"b")`, `=IF([.Z99];"a";"b")` (leer), `=IF("TRUE";"a";"b")` auswerten.
Erwartetes Ergebnis: `a`, `b`, `#VALUE!`.
*Grundlage:* [Q1] §6.3.12 (Text dort „implementation-defined“); eigene Festlegung.

#### HPF-TYP-004 · Muss · Basis
Wo Text erwartet wird, MUSS der Rechner umwandeln: Zahl → kanonische Zahlform nach
[HPF-NUM-002](#hpf-num-002--muss--basis); Wahrheitswert → `TRUE` oder `FALSE`; leere Zelle →
leerer Text; Fehlerwert → derselbe Fehlerwert.

*Prüfverfahren:* `="x"&1.5`, `="x"&TRUE()`, `="x"&[.Z99]`, `="x"&(1/0)` auswerten. Erwartetes
Ergebnis: `x1.5`, `xTRUE`, `x`, `#DIV/0!`.
*Grundlage:* [Q1] §6.3.14.

#### HPF-TYP-005 · Muss · Basis
Der Vergleich `=` zweier Zahlen MUSS exakt auf dem binary64-Wert erfolgen; eine Näherung („nahezu
gleich“) DARF NICHT angewendet werden. Werte verschiedener Art sind ungleich; eine leere Zelle ist
gleich `0`, gleich dem leeren Text und gleich `FALSE`.

*Prüfverfahren:* `=0.1+0.2=0.3`, `=1="1"`, `=[.Z99]=0`, `=[.Z99]=""` (leer) auswerten. Erwartetes
Ergebnis: `FALSE`, `FALSE`, `TRUE`, `TRUE`.
*Grundlage:* [Q1] §6.4.7 (Näherung dort erlaubt, hier ausgeschlossen); eigene Festlegung zur leeren
Zelle (übliche Praxis, dokumentiert in Abschnitt 15).

#### HPF-TYP-006 · Muss · Basis
Textvergleiche (`=`, `<>`, `<`, `<=`, `>`, `>=`, Kriterien, `MATCH`, `VLOOKUP`, `HLOOKUP`,
`SEARCH`) MÜSSEN ohne Rücksicht auf Groß- und Kleinschreibung erfolgen, und zwar durch Vergleich
der Codepunkte nach der Standard-Kleinschreibung (Default Case Folding) von [Q10], ohne
Sortierregeln eines Gebietsschemas; `EXACT` vergleicht Codepunkte ohne Faltung.

*Prüfverfahren:* `="Straße"="STRASSE"`, `="a"<"B"`, `="ä"<"b"`, `=EXACT("a";"A")` auswerten.
Erwartetes Ergebnis: `FALSE` (ß faltet nicht zu ss), `TRUE`, `FALSE` (U+00E4 > U+0062), `FALSE`.
*Grundlage:* [Q1] §3.4 (HOST-CASE-SENSITIVE), §6.4.9; [Q10] §3.13; eigene Festlegung (Codepunkte
statt Sortierregeln).

#### HPF-TYP-007 · Muss · Basis
Bei geordneten Vergleichen verschiedener Wertarten MUSS gelten: jede Zahl ist kleiner als jeder
Text, jeder Text ist kleiner als jeder Wahrheitswert; `FALSE` ist kleiner als `TRUE`; Fehlerwerte
werden weitergereicht.

*Prüfverfahren:* `=1<"a"`, `="a"<TRUE()`, `=FALSE()<TRUE()`, `=1<(1/0)` auswerten. Erwartetes
Ergebnis: `TRUE`, `TRUE`, `TRUE`, `#DIV/0!`.
*Grundlage:* [Q1] §6.14.12 (Sortierordnung Zahl < Text < Wahrheitswert bei `VLOOKUP`); eigene
Festlegung für die Operatoren.

#### HPF-TYP-008 · Muss · Basis
Ein Bereich, der an einer Stelle steht, die einen Einzelwert (`Scalar`) erwartet, MUSS den
Fehlerwert `#VALUE!` ergeben; eine implizite Schnittmenge mit der Position der Formel DARF NICHT
gebildet werden. Bereiche sind nur dort zulässig, wo die Funktionsliste `Reference`,
`NumberSequenceList` oder `Array` nennt.

*Prüfverfahren:* `=[.A1:.A3]+1` und `=SUM([.A1:.A3])` auswerten. Erwartetes Ergebnis: `#VALUE!`
und die Summe.
*Grundlage:* [Q1] §6.3.3 (implizite Schnittmenge); eigene Einschränkung, weil das Ergebnis sonst
von der Formelposition abhängt.

#### HPF-TYP-009 · Muss · Basis
In einer Zahlenfolge aus Bezügen (`NumberSequence`, `NumberSequenceList`) MUSS der Rechner Text,
Wahrheitswerte und leere Zellen übergehen und Fehlerwerte weiterreichen; direkt übergebene
Konstanten werden nach [HPF-TYP-002](#hpf-typ-002--muss--basis) umgewandelt.

*Prüfverfahren:* Bereich `A1:A4` mit `1`, `"x"`, `TRUE`, leer: `=SUM([.A1:.A4])`,
`=COUNT([.A1:.A4])`, `=SUM(1;TRUE())`, `=SUM(1;"x")` auswerten. Erwartetes Ergebnis: `1`, `1`,
`2`, `#VALUE!`.
*Grundlage:* [Q1] §6.3.7, §6.3.8.

#### HPF-TYP-010 · Muss · Basis
Ein Kriterium (`Criterion`, für `SUMIF`, `COUNTIF`, `AVERAGEIF`, `SUMIFS`, `COUNTIFS`) MUSS so
ausgewertet werden: Zahl oder Wahrheitswert → Gleichheit; Text, der mit `<`, `<=`, `>`, `>=`, `=`,
`<>` beginnt → Vergleich mit dem Rest, der als `StandardNumber` oder sonst als Text gelesen wird;
anderer Text → Gleichheit mit dem ganzen Zellinhalt nach [HPF-TYP-006](#hpf-typ-006--muss--basis).
Platzhalter (`*`, `?`) und reguläre Ausdrücke DÜRFEN NICHT ausgewertet werden; sie sind gewöhnliche
Zeichen.

*Prüfverfahren:* Spalte mit `10`, `25`, `abc`, `a*c`: `=COUNTIF([.A1:.A4];">=10")`,
`=COUNTIF([.A1:.A4];"a*c")`, `=COUNTIF([.A1:.A4];"ABC")` auswerten. Erwartetes Ergebnis: `2`, `1`,
`1`.
*Grundlage:* [Q1] §4.11.8, §3.4 (HOST-SEARCH-CRITERIA-MUST-APPLY-TO-WHOLE-CELL, HOST-USE-WILDCARDS,
HOST-USE-REGULAR-EXPRESSIONS); eigene Festlegung der Werte.

#### HPF-TYP-011 · Muss · Basis
Die wirtsdefinierten Eigenschaften aus [Q1] §3.4 MÜSSEN im Rechner die Werte der folgenden Tabelle
haben; ein Dokument DARF NICHT andere Werte verlangen und ein Lesesystem DARF NICHT sie einstellbar
machen.

<!-- HOSTEIGENSCHAFTEN ANFANG -->
| Eigenschaft ([Q1] §3.4) | Wert in hpro | Wirkung |
|---|---|---|
| HOST-CASE-SENSITIVE | `false` | Textvergleiche ohne Groß-/Kleinschreibung (HPF-TYP-006) |
| HOST-PRECISION-AS-SHOWN | `false` | gerechnet wird mit dem gespeicherten binary64-Wert, nie mit dem angezeigten |
| HOST-SEARCH-CRITERIA-MUST-APPLY-TO-WHOLE-CELL | `true` | Kriterien vergleichen den ganzen Zellinhalt (HPF-TYP-010) |
| HOST-AUTOMATIC-FIND-LABELS | `false` | keine Beschriftungsbezüge (HPF-SYN-009) |
| HOST-USE-REGULAR-EXPRESSIONS | `false` | keine regulären Ausdrücke in Kriterien und Suche |
| HOST-USE-WILDCARDS | `false` | keine Platzhalter `*`, `?` |
| HOST-NULL-YEAR | nicht anwendbar | zweistellige Jahre werden nirgends gelesen (HPF-DAT-004) |
| HOST-NULL-DATE | `1899-12-30` | Datumsserie 0 (HPF-DAT-001) |
| HOST-LOCALE | keines | alle Umwandlungen sind gebietsschema-unabhängig (HPF-TYP-002, HPF-DAT-004) |
| HOST-ITERATION-STATUS | `false` | keine iterative Berechnung von Zirkelbezügen (HPF-CALC-004) |
| HOST-ITERATION-MAXIMUM-DIFFERENCE | nicht anwendbar | – |
| HOST-ITERATION-STEPS | nicht anwendbar | – |
<!-- HOSTEIGENSCHAFTEN ENDE -->

*Prüfverfahren:* Die Prüfverfahren der in der Tabelle genannten Anforderungen ausführen; Oberfläche
des Lesesystems auf Einstellungen zu Groß-/Kleinschreibung, Genauigkeit wie angezeigt, Platzhaltern,
regulären Ausdrücken, Nulldatum, Iteration durchsehen. Erwartetes Ergebnis: Verfahren erfüllt; keine
solche Einstellung vorhanden.
*Grundlage:* [Q1] §3.4; eigene Festlegung der Werte.

#### HPF-TYP-012 · Muss · Basis
`UPPER`, `LOWER` und `PROPER` MÜSSEN die Standard-Groß- und Kleinschreibung von [Q10] ohne
Gebietsschema anwenden (keine sprachabhängigen Sonderregeln).

*Prüfverfahren:* `=UPPER("straße")`, `=LOWER("İ")` auswerten. Erwartetes Ergebnis: `STRASSE`;
`i̇` (U+0069 U+0307, Standardabbildung ohne türkische Sonderregel).
*Grundlage:* [Q10] §3.13 (Default Case Conversion); [Q1] §6.20.27, §6.20.14, §6.20.16.

---

## 5. Genauigkeit und Rundung

#### HPF-NUM-001 · Muss · Basis
Der Rechner MUSS Zahlen als binary64 nach [Q5] darstellen und die Operatoren `+`, `-`, `*`, `/`
als die binary64-Grundoperationen mit Rundung zur nächsten darstellbaren Zahl (ties-to-even)
ausführen; erweiterte Zwischengenauigkeit, Dezimalarithmetik oder ein Abschneiden auf 15
signifikante Stellen DÜRFEN NICHT angewendet werden.

*Prüfverfahren:* `=0.1+0.2`, `=1-0.9-0.1`, `=2^53+1` auswerten und kanonisch ausgeben. Erwartetes
Ergebnis: `0.30000000000000004`, `-2.7755575615628914e-17`, `9007199254740992` (Referenzwerte R6,
R8, R25 in Abschnitt 16).
*Grundlage:* [Q5] (IEEE 754, binary64); [Q1] §3.6 (Numerical Models, dort offen); eigene Festlegung.

#### HPF-NUM-002 · Muss · Basis
Die kanonische Zahlform einer Zahl MUSS die kürzeste Dezimaldarstellung sein, die beim Einlesen
denselben binary64-Wert ergibt, in der Schreibweise von Number::toString aus [Q6] (Dezimalpunkt
`.`, kein Vorzeichen `+`, Exponentform `e+21`/`e-7` erst ab 10^21 bzw. unter 10^-6, `-0` wird als
`0` geschrieben); sie wird für `data-hp-value`, für die Umwandlung in Text und für die
Rundungsfunktionen verwendet.

*Prüfverfahren:* Zahlen `100`, `0.1*3`, `1e21`, `1e-7`, `-0` kanonisch schreiben. Erwartetes
Ergebnis: `100`, `0.30000000000000004`, `1e+21`, `1e-7`, `0` (R13, R14, R26, R27).
*Grundlage:* [Q6] (Number::toString, kürzeste Round-Trip-Darstellung); [Q11] (JSON-Zahlen).

#### HPF-NUM-003 · Muss · Basis
Ein Rechenergebnis, das in binary64 unendlich oder keine Zahl (NaN) wäre, MUSS der Fehlerwert
`#NUM!` sein; eine Division durch 0 MUSS `#DIV/0!` ergeben; Unendlich oder NaN DÜRFEN NICHT als
Zellwert gespeichert werden.

*Prüfverfahren:* `=1E308*10`, `=SQRT(-1)`, `=1/0`, `=0/0` auswerten. Erwartetes Ergebnis: `#NUM!`,
`#NUM!`, `#DIV/0!`, `#DIV/0!`.
*Grundlage:* [Q1] §6.4.5, Tabelle 4 (#NUM!, #DIV/0!); [Q5].

#### HPF-NUM-004 · Muss · Basis
`ROUND`, `ROUNDUP`, `ROUNDDOWN` und `TRUNC` MÜSSEN auf der kanonischen Zahlform des Arguments
rechnen: die Dezimalziffern der kanonischen Form werden an der verlangten Stelle gerundet (`ROUND`:
bei genau 5 vom Nullpunkt weg; `ROUNDUP`: vom Nullpunkt weg; `ROUNDDOWN`, `TRUNC`: zum Nullpunkt
hin), das Ergebnis ist die binary64-Zahl, die der gerundeten Dezimalzahl am nächsten liegt.
`INT` rundet zur nächstkleineren ganzen Zahl.

*Prüfverfahren:* `=ROUND(2.675;2)`, `=ROUND(1.005;2)`, `=ROUND(-2.5;0)`, `=ROUND(1234.5678;-2)`,
`=ROUNDDOWN(2.675;2)`, `=INT(-2.5)`, `=TRUNC(-2.5)` auswerten. Erwartetes Ergebnis: `2.68`,
`1.01`, `-3`, `1200`, `2.67`, `-3`, `-2` (R9–R12, R17, R18, R28).
*Grundlage:* [Q1] §6.17.5 („halfway … round away from zero“), §6.17.2, §6.17.8; eigene Festlegung
(Rundung auf der Dezimalform statt auf dem binären Wert, damit `2.675` wie vom Autor geschrieben
gerundet wird).

#### HPF-NUM-005 · Muss · Basis
Summen- und Produktfunktionen (`SUM`, `PRODUCT`, `SUMPRODUCT`, `AVERAGE`, `NPV` und die
`…IF`/`…IFS`-Formen) MÜSSEN die Werte in Dokumentreihenfolge (Parameter von links nach rechts, in
Bereichen zeilenweise von links oben nach rechts unten) mit gewöhnlicher binary64-Addition bzw.
-Multiplikation verknüpfen; kompensierte, paarweise oder umsortierte Summation DARF NICHT verwendet
werden.

*Prüfverfahren:* Bereich mit zehnmal `0.1`: `=SUM([.A1:.A10])` auswerten. Erwartetes Ergebnis:
`0.9999999999999999` (R24).
*Grundlage:* eigene Festlegung (Bitgleichheit zwischen Rechnern, Zusage 7 aus [Q2]).

#### HPF-NUM-006 · Muss · Basis
Der Postfix-Operator `%` MUSS den Operanden durch 100 teilen; eine Zelle der Wertart
`percentage` speichert den Bruchwert (`0.19` für 19 %) in `data-hp-value`.

*Prüfverfahren:* `=19%`, `=[.B1]*2` mit `B1` als `percentage`-Zelle mit `data-hp-value="0.19"`
auswerten. Erwartetes Ergebnis: `0.19`, `0.38`.
*Grundlage:* [Q1] §6.4.14; [Q4] (`office:value` bei `percentage`).

#### HPF-NUM-007 · Soll · Basis
Geldbeträge SOLLEN in der Formel explizit gerundet werden (`ROUND(…;2)` bzw. auf die
Nachkommastellen der Währung), nicht erst in der Anzeige, damit angezeigte Einzelwerte und
angezeigte Summen zusammenpassen.

*Prüfverfahren:* Tabelle mit drei Positionen `1.005`, `1.005`, `1.005` und Summe: Formeln der
Positionszellen prüfen. Erwartetes Ergebnis: Positionszellen runden mit `ROUND`; die Summe der
angezeigten Positionen entspricht der angezeigten Summe.
*Grundlage:* eigene Konvention; Problemlage belegt in [Q14] (Kostenschätzungen, Aufmaße).

---

## 6. Datum und Zeit

#### HPF-DAT-001 · Muss · Basis
Ein Datum MUSS im Rechner eine Datumsserie sein: die ganze Zahl der Tage seit dem 30.12.1899
(Serie 0) im proleptischen gregorianischen Kalender ohne Sonderfälle; eine Uhrzeit ist der
Tagesbruchteil (1 = 24 Stunden); eine Datums-Zeit-Angabe ist die Summe. Die Jahre 1900 und 2100
sind keine Schaltjahre, 2000 ist eines.

*Prüfverfahren:* `=DATE(2026;10;11)`, `=DATE(1900;3;1)`, `=DATE(1900;1;1)`, `=DATE(9999;12;31)`,
`=DATE(2000;2;29)` auswerten. Erwartetes Ergebnis: `46306`, `61`, `2`, `2958465`, `36585` (R1–R5).
*Grundlage:* [Q1] §4.3.2, §4.3.3 („should support dates from 1899-12-30“); §3.4 HOST-NULL-DATE;
eigene Festlegung der Epoche.

#### HPF-DAT-002 · Muss · Basis
Der Rechner MUSS Datumsserien von 0 (30.12.1899) bis 2958465 (31.12.9999) unterstützen;
Datumsfunktionen mit einem Ergebnis außerhalb dieses Bereichs MÜSSEN `#NUM!` ergeben; negative
Datumsserien DÜRFEN NICHT entstehen.

*Prüfverfahren:* `=DATE(10000;1;1)`, `=DATE(1899;12;29)`, `=EDATE(DATE(9999;12;31);1)`
auswerten. Erwartetes Ergebnis: `#NUM!` in allen drei Fällen.
*Grundlage:* [Q1] §4.3.3 (Mindestbereich 1904–9999; positive Serien verpflichtend); eigene
Festlegung der Grenzen.

#### HPF-DAT-003 · Soll · Basis
Ein Erzeuger SOLL NICHT Datumswerte vor dem 01.03.1900 (Serie 61) in Formeln oder Wertzellen
schreiben, weil verbreitete Tabellenkalkulationen diesen Zeitraum mit abweichenden Serien zählen
(Abschnitt 15); ein Lesesystem MUSS sie dennoch nach HPF-DAT-001 berechnen.

*Prüfverfahren:* Wertzellen der Wertart `date` und Ergebnisse von Datumsfunktionen auf Serie < 61
prüfen. Erwartetes Ergebnis: keine Treffer; falls vorhanden, rechnet das Lesesystem nach R2/R3.
*Grundlage:* [Q1] §4.3.3 Note 2 (Jahr 1900 implementierungsabhängig); eigene Konvention.

#### HPF-DAT-004 · Muss · Basis
`DATEVALUE`, `TIMEVALUE` und `VALUE` MÜSSEN Datums- und Zeittext ausschließlich in den Formen
`YYYY-MM-DD`, `YYYY-MM-DDTHH:MM:SS`, `YYYY-MM-DD HH:MM:SS` und `HH:MM:SS` oder `HH:MM` (Ziffern
nach [Q8], Jahr vierstellig, ohne Zeitzone, Sekunden optional mit Bruchteil) lesen; jede andere
Form, insbesondere Formen eines Gebietsschemas oder zweistellige Jahre, MUSS `#VALUE!` ergeben.

*Prüfverfahren:* `=DATEVALUE("2026-10-11")`, `=DATEVALUE("11.10.2026")`, `=DATEVALUE("10/11/26")`,
`=TIMEVALUE("08:30")`, `=DATEVALUE("2026-10-11T08:30:00")` auswerten. Erwartetes Ergebnis:
`46306`, `#VALUE!`, `#VALUE!`, `0.3541666666666667`, `46306` (R1, R15).
*Grundlage:* [Q1] §6.10.4, §6.10.18 („shall accept ISO date format“); [Q8] (`full-date`,
`partial-time`); eigene Einschränkung auf diese Formen.

#### HPF-DAT-005 · Muss · Basis
Es DÜRFEN NICHT Zeitzonen, Sommerzeit oder die Systemuhr in die Berechnung eingehen; die Funktionen
`NOW` und `TODAY` DÜRFEN NICHT vorkommen; ein Stichtag MUSS als Wertzelle der Wertart `date`
gespeichert werden.

*Prüfverfahren:* Formeltexte auf `NOW(` und `TODAY(` durchsuchen; Dokument an zwei Rechnern in
verschiedenen Zeitzonen berechnen. Erwartetes Ergebnis: 0 Treffer; identische Werte.
*Grundlage:* Zusage 7 aus [Q2] („keine Uhrzeit in Formeln“); [HP-SBX-016](00-spezifikation.md#hp-sbx-016--muss--basis).

#### HPF-DAT-006 · Muss · Basis
`DATE` MUSS Monats- und Tagesüberläufe nach [Q1] §6.10.2 durch Weiterzählen auflösen (Bruchteile
werden abgeschnitten); `EDATE` und `EOMONTH` MÜSSEN einen nicht existierenden Monatstag auf den
letzten Tag des Zielmonats setzen.

*Prüfverfahren:* `=DATE(2026;13;1)`, `=DATE(2026;2;30)`, `=EDATE(DATE(2026;1;31);1)`,
`=EOMONTH(DATE(2026;2;10);0)` auswerten. Erwartetes Ergebnis: `46388` (01.01.2027), `46083`
(02.03.2026), `46081` (28.02.2026), `46081` (R19–R21).
*Grundlage:* [Q1] §6.10.2, §6.10.8, §6.10.9.

#### HPF-DAT-007 · Muss · Basis
`WEEKDAY` MUSS die Typen 1, 2, 3 und 11 bis 17 nach [Q1] §6.10.20 unterstützen; `ISOWEEKNUM`
liefert die Kalenderwoche nach ISO 8601 (Woche beginnt Montag, Woche 1 enthält den 4. Januar).

*Prüfverfahren:* `=WEEKDAY(DATE(2026;10;11))`, `=WEEKDAY(DATE(2026;10;11);2)`,
`=ISOWEEKNUM(DATE(2026;10;11))` auswerten. Erwartetes Ergebnis: `1` (Sonntag), `7`, `41`
(R22, R23).
*Grundlage:* [Q1] §6.10.20, §6.10.11.

#### HPF-DAT-008 · Soll · Basis
Eine Wertzelle der Wertart `date`, `time` oder `datetime` SOLL im Zellinhalt ein `time`-Element mit
`datetime`-Attribut im Format nach [Q8] enthalten, damit Datum und Zeit auch ohne Rechner
maschinenlesbar sind.

*Prüfverfahren:* Zellen der Wertart `date` auf ein `time`-Element prüfen; `datetime` mit
`data-hp-value` vergleichen. Erwartetes Ergebnis: vorhanden und gleich.
*Grundlage:* [Q9] (`time`-Element); [Q8].

---

## 7. Fehlerwerte

### 7.1 Fehlernamen

<!-- FEHLERWERTE ANFANG -->
| Fehlerwert | Bedeutung in hpro | Quelle |
|---|---|---|
| `#DIV/0!` | Division durch 0 oder durch eine leere Zelle; `AVERAGE`/`AVERAGEIF` ohne Zahlen | [Q1] Tabelle 4 |
| `#N/A` | Wert nicht verfügbar: `NA()`, erfolglose Suche in `MATCH`, `VLOOKUP`, `HLOOKUP`; Zelle nach Import ohne berechenbaren Wert | [Q1] §4.6, Tabelle 4 |
| `#NAME?` | unbekannter Funktionsname oder Formeltext, der nicht der Grammatik entspricht | [Q1] Tabelle 4; eigene Festlegung für Syntaxfehler |
| `#NUM!` | Ergebnis außerhalb des Zahlbereichs (unendlich, NaN) oder außerhalb der Definitionsmenge (`SQRT(-1)`, Datum außerhalb HPF-DAT-002, `MEDIAN()` ohne Werte) | [Q1] Tabelle 4 |
| `#REF!` | Bezug auf eine Zelle außerhalb der Grenzen aus HPF-ADR-003 oder auf eine gelöschte Zelle/Tabelle | [Q1] §5.8 (ReferenceError), Tabelle 4 |
| `#VALUE!` | falsche Wertart oder falsche Parameterzahl, Text wo Zahl erwartet, Bereich wo Einzelwert erwartet, Suchtext nicht gefunden (`FIND`, `SEARCH`) | [Q1] Tabelle 4 |
| `#NULL!` | reserviert; entsteht in hpro nicht (keine Schnittmengen), wird beim Import erhalten | [Q1] Tabelle 4 |
| `#CIRC!` | Zelle liegt auf einem Zirkelbezug oder hängt von einem ab (HPF-CALC-004) | eigene Ergänzung, Syntax nach [Q1] §5.12 |
<!-- FEHLERWERTE ENDE -->

### 7.2 Anforderungen

#### HPF-ERR-001 · Muss · Basis
Ein Rechner MUSS genau die Fehlerwerte der Tabelle in 7.1 erzeugen und erkennen; ein Fehlerwert
MUSS mit seinem Namen in `data-hp-value` und im Zellinhalt gespeichert werden, mit
`data-hp-type="error"`.

*Prüfverfahren:* Zelle mit `=1/0` berechnen und speichern. Erwartetes Ergebnis:
`data-hp-type="error"`, `data-hp-value="#DIV/0!"`, Zellinhalt `#DIV/0!`.
*Grundlage:* [Q1] §4.6 (Fehler werden „as if it was a string“ gespeichert), Tabelle 4.

#### HPF-ERR-002 · Muss · Basis
Operatoren und Funktionen MÜSSEN einen Fehlerwert aus einem Operanden oder Parameter unverändert
weiterreichen, außer `ISERROR`, `ISERR`, `ISNA`, `IFERROR`, `IFNA`, `COUNT`, `COUNTA`,
`COUNTBLANK`, `ISBLANK`, `ISNUMBER`, `ISTEXT`, `ISLOGICAL`, `ISNONTEXT`, `T`, `N` und `IF`
(Bedingung ausgenommen), die nach Abschnitt 8.2 anders festgelegt sind. Bei mehreren Fehlerwerten
gilt der in Auswertungsreihenfolge erste.

*Prüfverfahren:* `=1+NA()`, `=IFERROR(1/0;"x")`, `=COUNTA(NA();1)`, `=IF(TRUE();1;1/0)`,
`=(1/0)+NA()` auswerten. Erwartetes Ergebnis: `#N/A`, `x`, `2`, `1`, `#DIV/0!`.
*Grundlage:* [Q1] §4.6, §5.12 („Functions shall propagate Errors unless stated otherwise“),
§3.2.3.

#### HPF-ERR-003 · Muss · Basis
Der Rechner MUSS bei unbekanntem Funktionsnamen oder nicht parsbarem Formeltext `#NAME?`, bei
unzulässiger Parameterzahl `#VALUE!` ergeben, und DARF NICHT abbrechen, Zellen leer lassen oder den
gespeicherten Wert unverändert als Ergebnis ausgeben.

*Prüfverfahren:* Zellen mit `=NOW()` (dem Rechner unbekannt), `=SUM(` (unvollständig), `=ABS(1;2)`
berechnen. Erwartetes Ergebnis: `#NAME?`, `#NAME?`, `#VALUE!`; die übrigen Zellen des Dokuments
werden berechnet.
*Grundlage:* [Q1] Tabelle 4; eigene Festlegung.

#### HPF-ERR-004 · Muss · Basis
Ein Lesesystem MUSS Fehlerwerte sichtbar als Fehler darstellen (Name der Tabelle in 7.1, nicht
leer, nicht `0`) und SOLL in der Zugänglichkeitsschicht eine Beschreibung geben.

*Prüfverfahren:* Zelle mit Wert `#DIV/0!` anzeigen; Textextraktion und Accessibility-Baum prüfen.
Erwartetes Ergebnis: `#DIV/0!` sichtbar; Beschreibung vorhanden (Soll).
*Grundlage:* [Q12] Erfolgskriterium 1.3.1; Zusage 7 aus [Q2] („Verhalten bei fehlenden Werten“ offen
benennen).

---

## 8. Funktionsumfang

### 8.1 Anforderungen

#### HPF-FN-001 · Muss · Basis
Ein Rechner MUSS alle Funktionen der Liste in 8.2 mit der dort genannten Signatur nach der
zitierten Stelle in [Q1] auswerten; wo die Spalte „Fehler und Festlegungen“ etwas vorschreibt,
geht sie der Stelle in [Q1] vor.

*Prüfverfahren:* Für jede Funktion der Liste mindestens einen Testfall mit regulärem Ergebnis und
einen mit dem genannten Fehlerfall auswerten (Testsuite P19). Erwartetes Ergebnis: Ergebnisse wie
in [Q1] bzw. in der Spalte festgelegt; keine Funktion fehlt.
*Grundlage:* [Q1] Kapitel 6; eigene Teilmenge.

#### HPF-FN-002 · Muss · Basis
Ein Dokument DARF NICHT Funktionen enthalten, die nicht in 8.2 stehen; das gilt insbesondere für
die Funktionen der Ausschlussliste in 8.3 und für Funktionen mit Namensraumpräfix nach [Q1] §5.7.

*Prüfverfahren:* Funktionsnamen aller Formeln gegen 8.2 prüfen. Erwartetes Ergebnis: alle
enthalten (Regel HPR-SBX-014 in Teil 1 meldet jeden anderen Namen).
*Grundlage:* Zusage 7 aus [Q2]; [HP-SBX-016](00-spezifikation.md#hp-sbx-016--muss--basis).

#### HPF-FN-003 · Muss · Basis
Die Funktionen der Ausschlussliste 8.3 DÜRFEN NICHT von einem Rechner angeboten werden, auch nicht
als Erweiterung; ein Erzeuger, der sie beim Import antrifft, MUSS nach Abschnitt 13 verfahren.

*Prüfverfahren:* Rechner mit `=NOW()`, `=RAND()`, `=INDIRECT("A1")` aufrufen. Erwartetes Ergebnis:
jeweils `#NAME?`.
*Grundlage:* Zusage 7 aus [Q2]; [HP-SBX-016](00-spezifikation.md#hp-sbx-016--muss--basis).

#### HPF-FN-004 · Kann · Basis
Eine spätere Fassung dieses Teils KANN die Liste 8.2 erweitern; ein Dokument, das eine
erweiterte Liste nutzt, MUSS die Teilversion in `manifest.json#calculator.spec` nennen
(`"0.1"` für diese Fassung), damit ein älteres Lesesystem die Funktionen als unbekannt erkennt
und die gespeicherten Werte zeigt.

*Prüfverfahren:* Manifest auf `calculator.spec` prüfen, wenn Formeln vorkommen. Erwartetes
Ergebnis: vorhanden mit `"0.1"`, oder fehlend (dann gilt `"0.1"`).
*Grundlage:* eigene Konvention; [HP-VERS-001](00-spezifikation.md#hp-vers-001--muss--basis).

### 8.2 Unterstützte Funktionen

Signaturen nach [Q1] (Schreibweise: `Typ Name`, `[ … ]` optional, `{ … }+` Wiederholung,
`=` Vorgabewert). Die Spalte „Fehler und Festlegungen“ nennt, welcher Fehlerwert bei verletzten
Vorbedingungen entsteht und wo dieser Teil einen Spielraum von [Q1] schließt. Die letzte Spalte ist
der Abschnitt in [Q1]. Die Liste ist maschinenlesbar in [`03-funktionen.json`](03-funktionen.json).

<!-- FUNKTIONSLISTE ANFANG -->
| Funktion | Signatur | Ergebnis | Fehler und Festlegungen | [Q1] § |
|---|---|---|---|---|
| ABS | `ABS(Number N)` | Number | Fehler werden weitergereicht | 6.16.2 |
| AND | `AND({Logical\|NumberSequenceList L}+)` | Logical | Text als Parameter → `#VALUE!`; Bereiche: nur Zahlen und Wahrheitswerte zählen; ohne Wert → `#VALUE!` | 6.15.2 |
| AVERAGE | `AVERAGE({NumberSequence N}+)` | Number | keine Zahl in N → `#DIV/0!`; Reihenfolge nach HPF-NUM-005 | 6.18.3 |
| AVERAGEIF | `AVERAGEIF(Reference R; Criterion C [; Reference A])` | Number | kein Treffer → `#DIV/0!`; Kriterium nach HPF-TYP-010; A kürzer als R → Ausrichtung an der linken oberen Zelle, fehlende Zellen gelten als leer | 6.18.5 |
| CHOOSE | `CHOOSE(Integer Index; {Any Value}+)` | Any | Index < 1 oder > Anzahl → `#VALUE!`; nur der gewählte Wert wird ausgewertet | 6.14.3 |
| COLUMN | `COLUMN([Reference R])` | Number | ohne R: Spalte der Formelzelle; Bereich → Spalte der linken oberen Zelle | 6.13.4 |
| COLUMNS | `COLUMNS(Reference R)` | Number | – | 6.13.5 |
| CONCATENATE | `CONCATENATE({Text T}+)` | Text | Zahlen nach HPF-TYP-004; Fehler weitergereicht | 6.20.6 |
| COUNT | `COUNT({NumberSequenceList N}+)` | Number | Fehlerwerte werden nicht gezählt und nicht weitergereicht; `COUNT()` → `#VALUE!` | 6.13.6 |
| COUNTA | `COUNTA({Any A}+)` | Number | Fehlerwerte zählen als Wert; leerer Text zählt; `COUNTA()` → `#VALUE!` | 6.13.7 |
| COUNTBLANK | `COUNTBLANK(Reference R)` | Number | nur leere Zellen; leerer Text ist nicht leer | 6.13.8 |
| COUNTIF | `COUNTIF(Reference R; Criterion C)` | Number | Kriterium nach HPF-TYP-010 | 6.13.9 |
| COUNTIFS | `COUNTIFS(Reference R1; Criterion C1 [; Reference R2; Criterion C2]...)` | Number | Bereiche ungleicher Größe → `#VALUE!` | 6.13.10 |
| DATE | `DATE(Integer Year; Integer Month; Integer Day)` | Number (Datum) | Überlauf nach HPF-DAT-006; Ergebnis außerhalb HPF-DAT-002 → `#NUM!`; Year < 1899 → `#NUM!` | 6.10.2 |
| DATEDIF | `DATEDIF(DateParam Start; DateParam End; Text Format)` | Number | Format nur `y`, `m`, `d`, `md`, `ym`, `yd` (ohne Rücksicht auf Schreibung), sonst `#VALUE!`; Start > End → `#NUM!` | 6.10.3 |
| DATEVALUE | `DATEVALUE(Text D)` | Number (Datum) | nur Formen nach HPF-DAT-004, sonst `#VALUE!` | 6.10.4 |
| DAY | `DAY(DateParam D)` | Number | Text nach HPF-DAT-004; negative Serie → `#NUM!` | 6.10.5 |
| DAYS | `DAYS(DateParam End; DateParam Start)` | Number | Text nach HPF-DAT-004 | 6.10.6 |
| EDATE | `EDATE(DateParam Start; Number Months)` | Number (Datum) | Monatsende nach HPF-DAT-006; außerhalb HPF-DAT-002 → `#NUM!` | 6.10.8 |
| EOMONTH | `EOMONTH(DateParam Start; Integer Months)` | Number (Datum) | wie EDATE | 6.10.9 |
| EXACT | `EXACT(Text T1; Text T2)` | Logical | Codepunktvergleich ohne Faltung (HPF-TYP-006) | 6.20.8 |
| EXP | `EXP(Number X)` | Number | Überlauf → `#NUM!` | 6.16.31 |
| FALSE | `FALSE()` | Logical | Parameter → `#VALUE!` | 6.15.3 |
| FIND | `FIND(Text Search; Text T [; Integer Start = 1])` | Number | nicht gefunden → `#VALUE!`; Start < 1 oder > LEN(T)+1 → `#VALUE!`; Positionen zählen Codepunkte ab 1 | 6.20.9 |
| FV | `FV(Number Rate; Number Nper; Number Pmt [; Number Pv = 0 [; Number Type = 0]])` | Number | Formel aus [Q1]; Type ≠ 0 gilt als 1 | 6.12.20 |
| HLOOKUP | `HLOOKUP(Any Lookup; Reference Data; Integer Row [; Logical Sorted = TRUE()])` | Any | kein Treffer → `#N/A`; Row < 1 oder > Zeilen → `#REF!`; Sortierordnung nach HPF-TYP-007 | 6.14.5 |
| HOUR | `HOUR(TimeParam T)` | Number | Text nach HPF-DAT-004 | 6.10.10 |
| IF | `IF(Logical Cond [; Any IfTrue [; Any IfFalse]])` | Any | alle sieben Formen aus [Q1]; nur der gewählte Zweig wird ausgewertet; leere Parameter zulässig | 6.15.4 |
| IFERROR | `IFERROR(Any X; Any Alt)` | Any | X Fehler → Alt, sonst X; Fehler in X wird nicht weitergereicht | 6.15.5 |
| IFNA | `IFNA(Any X; Any Alt)` | Any | nur `#N/A` wird ersetzt | 6.15.6 |
| INDEX | `INDEX(Reference Data [; Integer Row] [; Integer Col])` | Any | Row/Col 0 oder leer → ganze Spalte/Zeile (nur zulässig, wo ein Bereich erwartet wird, sonst `#VALUE!`); außerhalb → `#REF!`; kein `AreaNumber` (keine Bezugslisten) | 6.14.6 |
| INT | `INT(Number N)` | Number | zur nächstkleineren ganzen Zahl (HPF-NUM-004) | 6.17.2 |
| ISBLANK | `ISBLANK(Scalar X)` | Logical | TRUE nur für leere Zelle; Fehler werden nicht weitergereicht | 6.13.14 |
| ISERR | `ISERR(Scalar X)` | Logical | TRUE für jeden Fehler außer `#N/A` | 6.13.15 |
| ISERROR | `ISERROR(Scalar X)` | Logical | TRUE für jeden Fehlerwert | 6.13.16 |
| ISEVEN | `ISEVEN(Number X)` | Logical | Bruchteil wird abgeschnitten; Text → `#VALUE!` | 6.13.17 |
| ISLOGICAL | `ISLOGICAL(Scalar X)` | Logical | – | 6.13.19 |
| ISNA | `ISNA(Scalar X)` | Logical | TRUE nur für `#N/A` | 6.13.20 |
| ISNONTEXT | `ISNONTEXT(Scalar X)` | Logical | leere Zelle → TRUE; Fehler → TRUE | 6.13.21 |
| ISNUMBER | `ISNUMBER(Scalar X)` | Logical | Wahrheitswert → FALSE; Fehler → FALSE | 6.13.22 |
| ISODD | `ISODD(Number X)` | Logical | wie ISEVEN | 6.13.23 |
| ISOWEEKNUM | `ISOWEEKNUM(DateParam D)` | Number | Kalenderwoche nach HPF-DAT-007 | 6.10.11 |
| ISTEXT | `ISTEXT(Scalar X)` | Logical | Fehler → FALSE | 6.13.25 |
| LEFT | `LEFT(Text T [; Integer Length = 1])` | Text | Length < 0 → `#VALUE!`; Codepunkte | 6.20.12 |
| LEN | `LEN(Text T)` | Number | zählt Codepunkte (nicht UTF-16-Einheiten) | 6.20.13 |
| LN | `LN(Number X)` | Number | X ≤ 0 → `#NUM!` | 6.16.39 |
| LOG10 | `LOG10(Number X)` | Number | X ≤ 0 → `#NUM!` | 6.16.41 |
| LOWER | `LOWER(Text T)` | Text | nach HPF-TYP-012 | 6.20.14 |
| MATCH | `MATCH(Scalar Search; Reference Region [; Integer Type = 1])` | Number | kein Treffer → `#N/A`; Type außerhalb −1..1 → `#VALUE!`; Region nicht einzeilig oder einspaltig → `#N/A`; Vergleich nach HPF-TYP-006/007 | 6.14.9 |
| MAX | `MAX({NumberSequenceList N}+)` | Number | ohne Zahlen → 0 | 6.18.45 |
| MEDIAN | `MEDIAN({NumberSequenceList X}+)` | Number | ohne Zahlen → `#NUM!` | 6.18.47 |
| MID | `MID(Text T; Integer Start; Integer Length)` | Text | Start < 1 oder Length < 0 → `#VALUE!`; Start > LEN → leerer Text | 6.20.15 |
| MIN | `MIN({NumberSequenceList N}+)` | Number | ohne Zahlen → 0 | 6.18.48 |
| MINUTE | `MINUTE(TimeParam T)` | Number | – | 6.10.12 |
| MOD | `MOD(Number A; Number B)` | Number | B = 0 → `#DIV/0!`; Vorzeichen von B; berechnet als A − B·INT(A/B) | 6.16.42 |
| MONTH | `MONTH(DateParam D)` | Number | – | 6.10.13 |
| N | `N(Any X)` | Number | Text → 0; leere Zelle → 0; Fehler → derselbe Fehler | 6.13.26 |
| NA | `NA()` | Error | immer `#N/A` | 6.13.27 |
| NOT | `NOT(Logical L)` | Logical | Text → `#VALUE!` | 6.15.7 |
| NPER | `NPER(Number Rate; Number Pmt; Number Pv [; Number Fv = 0 [; Number Type = 0]])` | Number | kein Ergebnis (Logarithmus einer nicht positiven Zahl) → `#NUM!` | 6.12.29 |
| NPV | `NPV(Number Rate; {NumberSequenceList Values}+)` | Number | Rate = −1 → `#DIV/0!`; Reihenfolge nach HPF-NUM-005 | 6.12.30 |
| OR | `OR({Logical\|NumberSequenceList L}+)` | Logical | wie AND | 6.15.8 |
| PI | `PI()` | Number | `3.141592653589793` | 6.16.45 |
| PMT | `PMT(Number Rate; Number Nper; Number Pv [; Number Fv = 0 [; Number Type = 0]])` | Number | Nper = 0 → `#NUM!`; Formel aus [Q1] (R29) | 6.12.36 |
| POWER | `POWER(Number A; Number B)` | Number | `POWER(0;0)` → `#NUM!`; `POWER(0;B<0)` → `#DIV/0!`; A < 0 mit nicht ganzzahligem B → `#NUM!` | 6.16.46 |
| PRODUCT | `PRODUCT({NumberSequenceList N}+)` | Number | ohne Zahlen → 0; Reihenfolge nach HPF-NUM-005 | 6.16.47 |
| PROPER | `PROPER(Text T)` | Text | Wortanfang = erster Buchstabe nach einem Nichtbuchstaben; nach HPF-TYP-012 | 6.20.16 |
| PV | `PV(Number Rate; Number Nper; Number Pmt [; Number Fv = 0 [; Number Type = 0]])` | Number | Formel aus [Q1] | 6.12.41 |
| REPT | `REPT(Text T; Integer Count)` | Text | Count < 0 → `#VALUE!`; Ergebnis länger als 32767 Codepunkte → `#VALUE!` | 6.20.18 |
| RIGHT | `RIGHT(Text T [; Integer Length = 1])` | Text | wie LEFT | 6.20.19 |
| ROUND | `ROUND(Number X [; Integer Digits = 0])` | Number | nach HPF-NUM-004 | 6.17.5 |
| ROUNDDOWN | `ROUNDDOWN(Number X [; Integer Digits = 0])` | Number | nach HPF-NUM-004 | 6.17.6 |
| ROUNDUP | `ROUNDUP(Number X [; Integer Digits = 0])` | Number | nach HPF-NUM-004 | 6.17.7 |
| ROW | `ROW([Reference R])` | Number | wie COLUMN | 6.13.29 |
| ROWS | `ROWS(Reference R)` | Number | – | 6.13.30 |
| SEARCH | `SEARCH(Text Search; Text T [; Integer Start = 1])` | Number | wie FIND, aber Vergleich nach HPF-TYP-006 (ohne Groß-/Kleinschreibung, ohne Platzhalter) | 6.20.20 |
| SECOND | `SECOND(TimeParam T)` | Number | Bruchteile werden abgeschnitten | 6.10.16 |
| SIGN | `SIGN(Number N)` | Number | −1, 0, 1 | 6.16.54 |
| SQRT | `SQRT(Number N)` | Number | N < 0 → `#NUM!` | 6.16.58 |
| SUBSTITUTE | `SUBSTITUTE(Text T; Text Old; Text New [; Integer Which])` | Text | Which < 1 → `#VALUE!`; Vergleich ohne Faltung (Codepunkte); leeres Old → T unverändert | 6.20.21 |
| SUM | `SUM({NumberSequenceList N}+)` | Number | Reihenfolge nach HPF-NUM-005; `SUM()` → `#VALUE!` | 6.16.61 |
| SUMIF | `SUMIF(Reference R; Criterion C [; Reference S])` | Number | Kriterium nach HPF-TYP-010; S wie bei AVERAGEIF; Fehlerzellen in S, die das Kriterium erfüllen, werden weitergereicht | 6.16.62 |
| SUMIFS | `SUMIFS(Reference S; Reference R1; Criterion C1 [; Reference R2; Criterion C2]...)` | Number | Bereiche ungleicher Größe → `#VALUE!` | 6.16.63 |
| SUMPRODUCT | `SUMPRODUCT({Reference\|Array A}+)` | Number | ungleiche Abmessungen → `#VALUE!`; Text, Wahrheitswert und leer zählen als 0; Fehler weitergereicht | 6.16.64 |
| T | `T(Any X)` | Text | Zahl und Wahrheitswert → leerer Text; Fehler → derselbe Fehler | 6.20.22 |
| TIME | `TIME(Number H; Number M; Number S)` | Number (Zeit) | nach [Q1] (Bruchteil eines Tages, Werte dürfen überlaufen); negatives Ergebnis → `#NUM!` | 6.10.17 |
| TIMEVALUE | `TIMEVALUE(Text T)` | Number (Zeit) | nur Formen nach HPF-DAT-004, sonst `#VALUE!` | 6.10.18 |
| TRIM | `TRIM(Text T)` | Text | entfernt U+0020 am Anfang und Ende, fasst Folgen von U+0020 zu einem zusammen; anderer Leerraum bleibt | 6.20.24 |
| TRUE | `TRUE()` | Logical | Parameter → `#VALUE!` | 6.15.9 |
| TRUNC | `TRUNC(Number A [; Integer B = 0])` | Number | nach HPF-NUM-004 | 6.17.8 |
| UPPER | `UPPER(Text T)` | Text | nach HPF-TYP-012 | 6.20.27 |
| VALUE | `VALUE(Text X)` | Number | `StandardNumber` mit optionalem Vorzeichen und optionalem `%`, oder Datum/Zeit nach HPF-DAT-004; alles andere → `#VALUE!`; kein Gebietsschema | 6.13.34 |
| VLOOKUP | `VLOOKUP(Any Lookup; Reference Data; Integer Col [; Logical Sorted = TRUE()])` | Any | kein Treffer → `#N/A`; Col < 1 oder > Spalten → `#REF!`; Sortierordnung nach HPF-TYP-007 | 6.14.12 |
| WEEKDAY | `WEEKDAY(DateParam D [; Integer Type = 1])` | Number | Typen nach HPF-DAT-007, andere → `#VALUE!` | 6.10.20 |
| XOR | `XOR({Logical L}+)` | Logical | wie AND | 6.15.10 |
| YEAR | `YEAR(DateParam D)` | Number | – | 6.10.23 |
<!-- FUNKTIONSLISTE ENDE -->

### 8.3 Ausgeschlossene Funktionen

Nicht unterstützt, mit Grund und Importverhalten nach Abschnitt 13. Die Liste ist nicht
abschließend: jede Funktion, die nicht in 8.2 steht, ist ausgeschlossen. Hier stehen die, nach
denen beim Import am ehesten zu suchen ist.

<!-- AUSSCHLUSSLISTE ANFANG -->
| Funktion | Grund | Beim Import |
|---|---|---|
| NOW, TODAY | Uhrzeit: nicht rein, nicht reproduzierbar (Zusage 7) | Wert einfrieren, Stichtag als Wertzelle |
| RAND, RANDBETWEEN | Zufall | Wert einfrieren |
| DDE, HYPERLINK, WEBSERVICE, FILTERXML, IMPORTXML, IMPORTDATA | Netz, Datei, Fremdprozess | Wert einfrieren; Ziel nicht übernehmen |
| INDIRECT, OFFSET | Bezüge aus Text oder Verschiebung: Abhängigkeiten nicht statisch bestimmbar | Wert einfrieren |
| CELL, INFO, FORMULA, ISFORMULA, SHEET, SHEETS | Auskunft über Rechner, Datei oder Darstellung | Wert einfrieren |
| TEXT, FIXED, DOLLAR, NUMBERVALUE | Formatcodes und Gebietsschema („implementation-defined“ in [Q1]) | Wert einfrieren (als Text) |
| CEILING, FLOOR, MROUND | Rundungsrichtung bei negativen Zahlen und Modus-Parameter unterscheiden sich zwischen verbreiteten Programmen | Wert einfrieren; Autor ersetzt durch `ROUNDUP`/`ROUNDDOWN` |
| RATE, IRR, XIRR, MIRR, YIELD | iterative Näherung, Ergebnis hängt vom Verfahren ab | Wert einfrieren |
| WEEKNUM, NETWORKDAYS, WORKDAY, YEARFRAC, DAYS360 | Typ- und Basisparameter mit abweichender Bedeutung zwischen Programmen | Wert einfrieren |
| ERROR.TYPE | Fehlernummern sind programmabhängig | Wert einfrieren |
| AVERAGEIFS, MAXIFS, MINIFS, IFS, SWITCH, TEXTJOIN, LET, LAMBDA, XLOOKUP, FILTER, SORT, UNIQUE, SEQUENCE | nicht in [Q1] (ODF 1.3) definiert | Wert einfrieren |
| DAVERAGE, DCOUNT, DCOUNTA, DGET, DMAX, DMIN, DPRODUCT, DSTDEV, DSTDEVP, DSUM, DVAR, DVARP | Datenbankfunktionen: Kriterienbereiche, nicht Gegenstand von 0.1 | Wert einfrieren |
| MMULT, MINVERSE, MDETERM, MUNIT, TRANSPOSE, SUMSQ, STDEV, STDEVP, VAR, VARP, RANK, LARGE, SMALL | Matrix- und Statistikfunktionen: nicht Gegenstand von 0.1 | Wert einfrieren |
| COMPLEX und alle IM-Funktionen, BITAND und andere Bitfunktionen, FINDB und andere Bytefunktionen | nicht Gegenstand von 0.1 | Wert einfrieren |
| GETPIVOTDATA, MULTIPLE.OPERATIONS | Pivot und Mehrfachoperationen | Wert einfrieren |
| Makro- und Skriptaufrufe jeder Art (benutzerdefinierte Funktionen, `CALL`, `REGISTER`, `EXEC`, `EVALUATE`) | Codeausführung (Zusage 2 und 7) | Wert einfrieren; Code wird nicht übernommen |
<!-- AUSSCHLUSSLISTE ENDE -->

---

## 9. Speicherung von Formel und Wert

#### HPF-STO-001 · Muss · Basis
Jede Formelzelle MUSS `data-hp-formula` (Formel), `data-hp-value` (zuletzt berechneter Wert in der
Form nach HPF-STO-002), `data-hp-type` (Wertart) und einen nicht leeren Zellinhalt (Anzeige des
Werts) tragen; der Zellinhalt DARF NICHT die Formel sein.

*Prüfverfahren:* Für jede Zelle mit `data-hp-formula` die drei Attribute und den Textinhalt
prüfen; Textinhalt beginnt nicht mit `=`. Erwartetes Ergebnis: erfüllt (Regel HPR-SBX-013 in
Teil 1).
*Grundlage:* [HP-SBX-016](00-spezifikation.md#hp-sbx-016--muss--basis); Zusage 7 aus [Q2].

#### HPF-STO-002 · Muss · Basis
`data-hp-value` MUSS je Wertart diese Form haben: `float`, `percentage`, `currency` → kanonische
Zahlform (HPF-NUM-002); `date` → `YYYY-MM-DD` oder `YYYY-MM-DDTHH:MM:SS`; `time` → Dauer
`PTnHnMnS` (ganze Stunden und Minuten, Sekunden mit optionalem Bruchteil); `boolean` → `true` oder
`false`; `string` → der Text; `error` → Fehlername nach 7.1. Der Rechner MUSS daraus den Zellwert
nach HPF-TYP-001 bilden (Datum und Zeit als Serie bzw. Tagesbruchteil).

*Prüfverfahren:* Alle Wertzellen nach Wertart gegen die Formen prüfen; eine `date`-Zelle
`2026-10-11` in `=[.A1]+1` verwenden. Erwartetes Ergebnis: alle Formen gültig; `46307`.
*Grundlage:* [Q4] (`office:value`, `office:date-value`, `office:time-value`,
`office:boolean-value`, `office:string-value`); [Q8] (Datumsform); eigene Konvention für `error`.

#### HPF-STO-003 · Muss · Basis
`data-hp-type` MUSS einen der Werte `float`, `percentage`, `currency`, `date`, `time`, `boolean`,
`string`, `error` haben; bei `currency` SOLL `data-hp-unit` den Währungscode nach [Q13] nennen.
Eine Zelle ohne `data-hp-value` hat den Zellwert *Text* (Zellinhalt mit zusammengefasstem
Leerraum) oder *leer*, wenn der Inhalt nach dem Zusammenfassen leer ist.

*Prüfverfahren:* Attributwerte prüfen; Zelle ohne Attribute mit Inhalt ` 12 ` in `=[.A1]+1` und
`=[.A1]&"x"` verwenden. Erwartetes Ergebnis: Werte aus der Liste; `#VALUE!` (Text, HPF-TYP-002)
und `12x`.
*Grundlage:* [Q4] (`office:value-type`); [Q13] (Währungscodes); eigene Konvention für Zellen ohne
Wertattribut.

#### HPF-STO-004 · Muss · Basis
Jede Zelle, deren Wert in einer Formel als Zahl, Datum, Zeit oder Wahrheitswert gebraucht wird,
MUSS eine Wertzelle sein (`data-hp-value` und `data-hp-type`); ein Erzeuger DARF NICHT darauf
bauen, dass ein Zellinhalt wie `1.234,50` als Zahl gelesen wird.

*Prüfverfahren:* Abhängigkeitsgraph bilden; jede Zelle, die ein Bezug in Zahlkontext erreicht und
die keine Wertzelle ist, melden. Erwartetes Ergebnis: 0 Treffer, oder die Formel liefert
`#VALUE!` (dann ist das Dokument zwar gültig, aber der Autor hat einen Fehler gemacht).
*Grundlage:* [HPF-TYP-002](#hpf-typ-002--muss--basis); eigene Konvention.

#### HPF-STO-005 · Soll · Basis
Der Zellinhalt einer Wertzelle der Wertart `float`, `percentage` oder `currency` SOLL die Zahl so
anzeigen, dass sie, von Tausendertrennern, Währungszeichen und Prozentzeichen befreit und mit
Dezimalpunkt gelesen, dem auf die angezeigten Stellen gerundeten `data-hp-value` entspricht.

*Prüfverfahren:* Stichprobe von Zellen: Zellinhalt normalisieren, mit `ROUND(value; n)` vergleichen.
Erwartetes Ergebnis: gleich.
*Grundlage:* Zusage 7 aus [Q2] („Zahlen der letzten Berechnung“); eigene Konvention.

#### HPF-STO-006 · Soll · Basis
Das Manifest einer Fassung mit Formelzellen SOLL `computedAt` (RFC-3339-Zeitpunkt, UTC) und
`calculator` (`{ "name", "version", "spec" }`) tragen; ein Erzeuger, der Werte schreibt, MUSS beide
Felder setzen, wenn er sie schreibt, und DARF NICHT einen fremden Rechner eintragen.

*Prüfverfahren:* Manifest prüfen; Werte neu berechnen und speichern. Erwartetes Ergebnis: Felder
vorhanden; `computedAt` liegt nach dem vorherigen Wert, `calculator` nennt den speichernden
Rechner.
*Grundlage:* [HP-PROF-007](00-spezifikation.md#hp-prof-007--muss--signiert) (für eingefrorene
Fassungen Pflicht); [Q8]; eigene Konvention für die Hauptfassung.

#### HPF-STO-007 · Muss · Basis
Ein Bearbeiter ohne Rechner, der eine Wertzelle ändert, von der Formelzellen abhängen, MUSS an
jeder betroffenen Tabelle `data-hp-stale="true"` setzen; ein Rechner, der alle Formelzellen einer
Tabelle neu berechnet und speichert, MUSS das Attribut entfernen.

*Prüfverfahren:* Eingabezelle mit einem Bearbeiter ohne Rechner ändern, speichern, Tabelle prüfen;
dann mit Rechner öffnen, speichern, prüfen. Erwartetes Ergebnis: Attribut gesetzt; danach entfernt
und Werte aktuell.
*Grundlage:* Zusage 7 aus [Q2] („Verhalten bei fehlenden Werten“); eigene Konvention.

#### HPF-STO-008 · Muss · Basis
Ein Lesesystem MUSS die gespeicherten Werte anzeigen, auch ohne Rechner; eine Tabelle mit
`data-hp-stale="true"` MUSS sichtbar als „möglicherweise veraltet“ gekennzeichnet werden; eine
Formelzelle ohne `data-hp-value` MUSS sichtbar als „nicht berechnet“ gekennzeichnet werden und DARF
NICHT als `0` oder leer ohne Kennzeichnung erscheinen.

*Prüfverfahren:* Dokument mit `data-hp-stale="true"` und mit einer Formelzelle ohne Wert in einem
Lesesystem ohne Rechner öffnen. Erwartetes Ergebnis: gespeicherte Werte sichtbar; beide
Kennzeichnungen vorhanden (Text oder beschriftetes Symbol).
*Grundlage:* Zusage 7 aus [Q2]; [Q12] Erfolgskriterium 1.3.1.

#### HPF-STO-009 · Muss · Lebendig
Ein Lesesystem der Stufe Lebendig MUSS beim Öffnen der Hauptfassung alle Formelzellen neu
berechnen und die berechneten Werte anzeigen; weichen sie von `data-hp-value` ab, MUSS es die
berechneten anzeigen und DARF NICHT die Datei ohne Speichervorgang des Nutzers verändern.

*Prüfverfahren:* Dokument mit absichtlich falschem `data-hp-value` (`=1+1`, Wert `3`) öffnen.
Erwartetes Ergebnis: Anzeige `2`; Datei auf der Platte unverändert, bis gespeichert wird.
*Grundlage:* Zusage 7 aus [Q2]; [HP-RS-001](00-spezifikation.md#hp-rs-001--muss--basis).

#### HPF-STO-010 · Muss · Basis
Ein Verweis `a[data-hp-ref="value"]` nach [HP-ADR-008](00-spezifikation.md#hp-adr-008--kann--basis)
MUSS als Inhalt den angezeigten Wert der Zielzelle zum Zeitpunkt des Speicherns tragen; ein
Lesesystem mit Rechner MUSS den Inhalt nach einer Neuberechnung aktualisieren.

*Prüfverfahren:* Verweis auf `#kosten.E4` prüfen; Eingabezelle ändern. Erwartetes Ergebnis:
Inhalt = Zellinhalt der Zielzelle; nach der Änderung aktualisiert.
*Grundlage:* [HP-ADR-008](00-spezifikation.md#hp-adr-008--kann--basis); Zusage 3 und 7 aus [Q2].

#### HPF-STO-011 · Kann · Lebendig
Eine Zelle KANN `data-hp-input="true"` tragen; ein Lesesystem der Stufe Lebendig MUSS genau diese
Zellen zur Eingabe anbieten, die Eingabe nach Wertart prüfen (Zahl in kanonischer Form oder in der
Schreibweise des Nutzers, Datum nach HPF-DAT-004 oder über eine Datumsauswahl), `data-hp-value`
und Zellinhalt setzen und die abhängigen Formelzellen neu berechnen, ohne das Dokument neu zu laden.

*Prüfverfahren:* Eingabezelle `B2` auf `50` setzen. Erwartetes Ergebnis: `data-hp-value="50"`,
abhängige Summen aktualisiert; Zellen ohne `data-hp-input` sind nicht editierbar.
*Grundlage:* Zusage 7 aus [Q2]; [Q14] (Formulare mit Berechnung als Erwartung).

#### HPF-STO-012 · Kann · Lebendig
Eine Zelle KANN eine Prüfregel `data-hp-check` (Formel mit Wahrheitswert als Ergebnis, derselbe
Teilumfang) und `data-hp-check-message` (Text) tragen; ein Lesesystem der Stufe Lebendig MUSS die
Regel wie eine Formelzelle auswerten und die Zelle bei `FALSE` oder Fehlerwert sichtbar und in der
Zugänglichkeitsschicht als ungültig kennzeichnen, DARF NICHT die Eingabe verhindern und DARF NICHT
das Lesen des Dokuments blockieren.

*Prüfverfahren:* Zelle mit `data-hp-check="=[.B2]>=0"` auf `-1` setzen. Erwartetes Ergebnis:
Kennzeichnung mit der Meldung; Wert bleibt gespeichert.
*Grundlage:* Zusage 7 aus [Q2] („Prüfungen“); [Q12] Erfolgskriterium 3.3.1; eigene Konvention.

---

## 10. Adressierung von Zellen

#### HPF-ADR-001 · Muss · Basis
Eine Tabelle, auf die eine Formel einer anderen Tabelle oder ein Verweis `#<kennung>.<Zelle>`
zeigt, MUSS eine Kennung `id` nach [HP-ADR-001](00-spezifikation.md#hp-adr-001--muss--basis)
tragen, die im Inhaltsdokument eindeutig ist; die Kennung DARF NICHT die Zeichen `.`, `[`, `]`,
`'`, `#`, `$`, `:` oder Leerraum enthalten.

*Prüfverfahren:* Tabellenkennungen gegen das Zeichenverbot und auf Eindeutigkeit prüfen.
Erwartetes Ergebnis: erfüllt; `[kosten.B7]` löst auf die Tabelle `kosten` auf.
*Grundlage:* [Q1] §5.8 (`SheetName ::= '$'? [^\]\. #$']+`); [HP-ADR-001](00-spezifikation.md#hp-adr-001--muss--basis).

#### HPF-ADR-002 · Muss · Basis
Das Zellraster einer Tabelle MUSS nach dem Tabellenmodell von [Q9] gebildet werden: Zeilen in
Dokumentreihenfolge über `thead`, `tbody` und `tfoot` hinweg (Zeile 1 ist die erste `tr` der
Tabelle), Spalten ab A; eine Zelle mit `colspan`/`rowspan` hat die Adresse ihrer linken oberen
Rasterposition, die übrigen überspannten Positionen sind leere Zellen.

*Prüfverfahren:* Tabelle mit `thead` (eine Zeile) und `tbody`: Formel `=[.A2]` ergibt die erste
Körperzeile; Zelle mit `colspan="2"` in A3: `=[.B3]` ergibt *leer*. Erwartetes Ergebnis: erfüllt.
*Grundlage:* [Q9] (table processing model); eigene Konvention zur Adresse überspannter Zellen.

#### HPF-ADR-003 · Muss · Basis
Ein Bezug auf eine Rasterposition außerhalb der vorhandenen Zeilen oder Spalten, aber innerhalb von
Spalte `AMJ` (1024) und Zeile `65536`, MUSS als leere Zelle gelten; ein Bezug jenseits dieser
Grenzen MUSS `#REF!` ergeben; eine Tabelle DARF NICHT mehr als 1024 Spalten oder 65536 Zeilen haben.

*Prüfverfahren:* Tabelle mit 5 Zeilen: `=SUM([.B2:.B100])`, `=[.B70000]`, `=[.AMK1]` auswerten.
Erwartetes Ergebnis: Summe der vorhandenen Zellen; `#REF!`; `#REF!`.
*Grundlage:* [Q1] §5.8, Tabelle 4 (#REF!); eigene Festlegung der Grenzen.

#### HPF-ADR-004 · Muss · Basis
Die Dokumentadresse einer Zelle nach [HP-ADR-008](00-spezifikation.md#hp-adr-008--kann--basis)
(`pfad#<tabellen-kennung>.<Spalte><Zeile>`) MUSS auf dieselbe Rasterposition zeigen wie der
Formelbezug `[<tabellen-kennung>.<Spalte><Zeile>]` im selben Inhaltsdokument.

*Prüfverfahren:* `#kosten.E4` und `[kosten.E4]` auflösen. Erwartetes Ergebnis: dieselbe Zelle.
*Grundlage:* [HP-ADR-008](00-spezifikation.md#hp-adr-008--kann--basis); [Q1] §5.8.

#### HPF-ADR-005 · Muss · Basis
Ein Bearbeiter, der Zeilen oder Spalten einfügt, löscht oder verschiebt, MUSS alle Bezüge in
Formeln, Prüfregeln und Wertverweisen des Inhaltsdokuments anpassen; ein Bezug auf eine gelöschte
Zelle oder Tabelle MUSS durch die Fehlerkonstante `#REF!` ersetzt werden; Bereiche, die eine
gelöschte Zeile enthielten, werden verkleinert.

*Prüfverfahren:* Zeile 2 vor `=SUM([.B2:.B4])` und `=[.B3]` löschen. Erwartetes Ergebnis:
`=SUM([.B2:.B3])` und `=[.B2]`; `=[.B2]` wird zu `=#REF!`.
*Grundlage:* [Q1] §5.8 (ReferenceError); Zusage 4 aus [Q2] (Struktur bleibt Struktur).

#### HPF-ADR-006 · Muss · Basis
Ein Bezug auf eine Formelzelle MUSS deren berechneten Wert liefern, nie deren Formeltext; ein
Bezug auf eine Zelle der Wertart `string` liefert den Text.

*Prüfverfahren:* `=[.E2]` mit `E2` als Formelzelle auswerten. Erwartetes Ergebnis: Zahl, nicht der
Text `=ROUND(…)`.
*Grundlage:* [Q1] §4.8 (Reference), §6.3.2.

---

## 11. Neuberechnung

#### HPF-CALC-001 · Muss · Basis
Ein Rechner MUSS deterministisch sein: dieselbe Fassung ergibt auf jedem Rechner, auf jeder
Plattform und zu jeder Zeit für jede Formelzelle denselben Zellwert (Zahlen bitgleich); kein
Ergebnis DARF von Uhrzeit, Zufall, Gebietsschema, Zeitzone, Bildschirm, Nutzer oder Dateisystem
abhängen.

*Prüfverfahren:* Dieselbe Fassung mit zwei unabhängigen Rechnern (z. B. Kern und Gegenprobe aus
P19) berechnen, alle `data-hp-value` vergleichen. Erwartetes Ergebnis: identisch.
*Grundlage:* Zusage 7 aus [Q2].

#### HPF-CALC-002 · Muss · Basis
Ein Rechner MUSS alle Formelzellen und Prüfregeln einer Fassung vollständig in einer Reihenfolge
berechnen, in der jede Zelle erst nach allen Zellen berechnet wird, von denen sie abhängt
(topologische Ordnung des Abhängigkeitsgraphen); eine teilweise oder verzögerte Berechnung DARF
NICHT dazu führen, dass gespeicherte oder angezeigte Werte untereinander unstimmig sind.

*Prüfverfahren:* Kette `A1=1`, `B1==[.A1]+1`, `C1==[.B1]+1` mit falschen gespeicherten Werten
berechnen. Erwartetes Ergebnis: `2`, `3`; Dokument nach dem Speichern ohne Abweichung.
*Grundlage:* [Q1] §3.2.2, §3.5; eigene Festlegung (vollständige Berechnung).

#### HPF-CALC-003 · Muss · Basis
Der Rechner MUSS Parameter eifrig auswerten, außer bei `IF`, `IFERROR`, `IFNA` und `CHOOSE`, die
nur den gewählten Zweig auswerten; die Reihenfolge der Auswertung ist von links nach rechts; der
Abhängigkeitsgraph enthält dennoch alle Bezüge der Formel, auch die nicht gewählter Zweige.

*Prüfverfahren:* `=IF(TRUE();1;[.Z1])` mit `Z1` als Fehlerzelle auswerten; `Z1` ändern.
Erwartetes Ergebnis: `1`; die Formelzelle wird nach der Änderung von `Z1` neu berechnet.
*Grundlage:* [Q1] §3.2.3 (eager evaluation), §6.15.4 (short-circuit).

#### HPF-CALC-004 · Muss · Basis
Ein Dokument DARF NICHT Zirkelbezüge enthalten (ein Pfad im Abhängigkeitsgraphen von einer
Formelzelle zu sich selbst, auch über Prüfregeln); trifft ein Rechner dennoch auf einen Zirkel,
MUSS er alle Zellen des Zirkels und alle davon abhängigen Zellen mit `#CIRC!` belegen und DARF
NICHT iterieren.

*Prüfverfahren:* `A1==[.B1]+1`, `B1==[.A1]+1`, `C1==[.A1]` berechnen. Erwartetes Ergebnis: alle
drei `#CIRC!`; Prüfer meldet den Zirkel.
*Grundlage:* [Q1] §3.4 (HOST-ITERATION-STATUS); eigene Festlegung (`#CIRC!`, Syntax nach §5.12).

#### HPF-CALC-005 · Muss · Basis
Ein Rechner MUSS für jede Fassung mindestens 10000 Formelzellen und Abhängigkeitsketten von
mindestens 1000 Stufen berechnen können; ein Dokument SOLL NICHT mehr als 10000 Formelzellen je
Fassung enthalten.

*Prüfverfahren:* Testdokument mit 10000 Formelzellen und einer Kette von 1000 Stufen berechnen.
Erwartetes Ergebnis: alle Werte korrekt, kein Abbruch.
*Grundlage:* eigene Festlegung (Dokumente, nicht Tabellenkalkulationen als Datenbank).

#### HPF-CALC-006 · Muss · Basis
Ein Rechner MUSS innerhalb einer Berechnung terminieren: Keine Funktion und kein Operator DARF
eine Schleife, Rekursion oder Iteration ausführen, deren Länge nicht aus den Parametern und der
Größe der Bezüge begrenzt ist; die Laufzeit einer vollständigen Berechnung ist durch die Zahl der
Zellen, die Länge der Formeln und die Größe der Bereiche beschränkt.

*Prüfverfahren:* Code-Durchsicht des Rechners (Testsuite P19) und Berechnung des Testdokuments aus
HPF-CALC-005 unter Zeitmessung. Erwartetes Ergebnis: keine unbegrenzten Schleifen; Berechnung
endet.
*Grundlage:* Zusage 2 aus [Q2]; [HP-SBX-015](00-spezifikation.md#hp-sbx-015--soll--lebendig).

#### HPF-CALC-007 · Muss · Lebendig
Nach einer Eingabe in eine Eingabezelle MUSS das Lesesystem alle davon abhängigen Formelzellen,
Prüfregeln und Wertverweise neu berechnen und anzeigen, bevor die nächste Eingabe angenommen wird
oder spätestens innerhalb von 1 Sekunde bei 10000 Formelzellen.

*Prüfverfahren:* Eingabe in Testdokument aus HPF-CALC-005; Zeit bis zur Anzeige messen.
Erwartetes Ergebnis: Werte aktualisiert, ≤ 1 s.
*Grundlage:* Zusage 7 aus [Q2]; eigene Festlegung der Schranke.

#### HPF-CALC-008 · Soll · Basis
Ein Rechner SOLL eine Konformitätsprüfung gegen die Testsuite aus P19 bestehen und seine Version in
`calculator.version` so führen, dass eine Änderung eines Ergebnisses für dieselbe Teilversion
dieses Teils als Fehler des Rechners gilt, nicht als Eigenschaft des Dokuments.

*Prüfverfahren:* Testsuite ausführen; Vergleich der Ergebnisse zweier Rechnerversionen am selben
Dokument. Erwartetes Ergebnis: bestanden; keine Abweichung.
*Grundlage:* eigene Konvention; Zusage 7 aus [Q2] (Gegenprobe).

---

## 12. Eingefrorene und signierte Fassung

#### HPF-FRZ-001 · Muss · Signiert
In einer eingefrorenen Fassung MUSS jede Formelzelle `data-hp-value`, `data-hp-type` und
Zellinhalt mit dem Ergebnis der letzten vollständigen Berechnung tragen, das Fassungsmanifest MUSS
`computedAt` und `calculator` nennen, und `data-hp-stale="true"` DARF NICHT vorkommen;
`data-hp-input` und `data-hp-check` DÜRFEN NICHT vorkommen (Prüfregeln sind vor dem Einfrieren
auszuwerten; ihr Ergebnis steht im Zellinhalt oder in einem Hinweis).

*Prüfverfahren:* Eingefrorene Fassung prüfen: Attribute, Manifestfelder; alle Formelzellen mit
einem Rechner nachrechnen. Erwartetes Ergebnis: Attribute und Felder wie verlangt; Nachrechnung
stimmt mit `data-hp-value` überein (Regel HPR-PROF-012 in Teil 1).
*Grundlage:* [HP-PROF-007](00-spezifikation.md#hp-prof-007--muss--signiert); Zusage 5 und 7 aus [Q2].

#### HPF-FRZ-002 · Soll · Signiert
Eine eingefrorene Fassung SOLL `data-hp-formula` behalten, damit nachvollziehbar bleibt, wie ein
Wert entstanden ist; der Erzeuger DARF NICHT die Formel verändern, wenn er den Wert einfriert.

*Prüfverfahren:* Formeltexte der eingefrorenen Fassung mit denen der Hauptfassung zum Zeitpunkt des
Einfrierens vergleichen. Erwartetes Ergebnis: identisch.
*Grundlage:* Zusage 4 und 5 aus [Q2].

#### HPF-FRZ-003 · Muss · Signiert
Ein Lesesystem MUSS in einer eingefrorenen Fassung die gespeicherten Werte anzeigen und DARF NICHT
sie durch neu berechnete ersetzen; es KANN zur Prüfung nachrechnen und MUSS dann eine Abweichung
als „Abweichung zwischen gespeichertem und nachgerechnetem Wert“ je Zelle melden, ohne die Anzeige
zu ändern und ohne das Signatururteil zu berühren.

*Prüfverfahren:* Eingefrorene Fassung mit absichtlich abweichendem `data-hp-value` (vor dem
Signieren erzeugt) öffnen. Erwartetes Ergebnis: gespeicherter Wert angezeigt; Abweichung gemeldet;
Signatur `TOTAL_PASSED`.
*Grundlage:* Zusage 5 aus [Q2] („zeigt genau das, was berechnet wurde“); [HP-PROF-010](00-spezifikation.md#hp-prof-010--muss--signiert).

#### HPF-FRZ-004 · Muss · Signiert
Die Signatur einer eingefrorenen Fassung deckt die Werte ab, weil sie Teil der Inhaltsdateien sind;
die Zusammenfassung der Erklärung nach [HP-SIG-017](00-spezifikation.md#hp-sig-017--soll--signiert)
MUSS alle Formelwerte in Lesereihenfolge sowie `computedAt` und `calculator` enthalten, wenn
Formelzellen vorkommen.

*Prüfverfahren:* Signaturdialog für eine eingefrorene Fassung mit Formeln öffnen. Erwartetes
Ergebnis: Zusammenfassung nennt die Werte, den Zeitpunkt und den Rechner.
*Grundlage:* [HP-SIG-017](00-spezifikation.md#hp-sig-017--soll--signiert); Zusage 7 aus [Q2].

#### HPF-FRZ-005 · Muss · Signiert
Eine Änderung an `data-hp-value`, `data-hp-formula` oder dem Zellinhalt einer signierten
eingefrorenen Fassung MUSS als Manipulation erkannt werden (`TOTAL_FAILED / HASH_FAILURE`).

*Prüfverfahren:* `data-hp-value` einer Zelle unter `renditions/<id>/` mit einem ZIP-Werkzeug
ändern; Signatur prüfen. Erwartetes Ergebnis: `TOTAL_FAILED / HASH_FAILURE`.
*Grundlage:* [HP-PROF-010](00-spezifikation.md#hp-prof-010--muss--signiert); belegt in [Q15]
(Manipulation einer Inhaltsdatei).

#### HPF-FRZ-006 · Soll · Basis
Ein Bearbeiter SOLL beim Speichern jeden geänderten Zellwert so ablegen, dass der Vergleich zweier
Fassungen nach [HP-RS-008](00-spezifikation.md#hp-rs-008--muss--basis) die Änderung als
Textänderung der Zelle mit ihrer Adresse zeigt, und SOLL im Verlauf nach
[HP-META-006](00-spezifikation.md#hp-meta-006--kann--basis) die geänderten Adressen in `note`
nennen.

*Prüfverfahren:* Eingabezelle ändern, speichern, Fassungen vergleichen. Erwartetes Ergebnis:
Änderung an `kosten.B2` als Textänderung sichtbar; `note` nennt `kosten.B2`.
*Grundlage:* Zusage 4 und 7 aus [Q2] („eine geänderte Zelle ist im Verlauf nachvollziehbar“).

#### HPF-FRZ-007 · Muss · Archiv
In einer Fassung mit Profil `archive` MÜSSEN `data-hp-formula` an jeder Formelzelle und
`calculator` mit `name`, `version` und `spec` im Manifest vorhanden sein, damit die Werte auch
nach Ablauf des Rechners nachvollziehbar bleiben.

*Prüfverfahren:* Archivfassung prüfen. Erwartetes Ergebnis: Formeln und Rechnerangabe vorhanden.
*Grundlage:* [Q2] §4c (Langzeitlesbarkeit); [HP-PROF-005](00-spezifikation.md#hp-prof-005--muss--archiv).

---

## 13. Import und Export

#### HPF-IMP-001 · Muss · Basis
Ein Erzeuger, der eine Tabelle aus einem fremden Format übernimmt, MUSS jede Formel, die nicht in
den Teilumfang dieses Teils übersetzbar ist (Funktion nicht in 8.2, Syntax nach HPF-SYN-009,
Bezug nach HPF-SYN-007, Zirkel), als Wertzelle ohne `data-hp-formula` speichern, mit dem im
Quelldokument gespeicherten Wert, `data-hp-import="frozen"` und `data-hp-import-formula` (der
ursprüngliche Formeltext); die Zelle DARF NICHT stillschweigend verworfen oder geleert werden.

*Prüfverfahren:* Quelldatei mit den Quellformeln `NOW()`, `INDIRECT("A1")`, `SUM(A1:A3)` (jeweils
mit führendem Gleichheitszeichen) importieren. Erwartetes Ergebnis: zwei eingefrorene Wertzellen
mit Attributen und Quellwert; `=SUM([.A1:.A3])` als Formelzelle.
*Grundlage:* Zusage 7 aus [Q2] („beim Import als Wert eingefroren, nicht stillschweigend
verworfen“); eigene Konvention für die Attribute.

#### HPF-IMP-002 · Muss · Basis
Hat die Quelle für eine eingefrorene Zelle keinen gespeicherten Wert, MUSS der Erzeuger
`data-hp-type="error"` und `data-hp-value="#N/A"` schreiben.

*Prüfverfahren:* Quelldatei mit Formel ohne zwischengespeicherten Wert importieren. Erwartetes
Ergebnis: Zelle `#N/A`, `data-hp-import="frozen"`.
*Grundlage:* [Q1] §4.6 (#N/A: „not available“); eigene Konvention.

#### HPF-IMP-003 · Muss · Basis
Der Erzeuger MUSS einen Importbericht unter `data/import-report.json` schreiben, der je
eingefrorener Zelle `address` (Dokumentadresse), `formula` (Quelltext), `reason` (`function`,
`syntax`, `reference`, `circular`, `macro`, `other`) und `value` nennt, und SOLL ihn dem Nutzer
anzeigen; enthält die Quelle Makros oder Skripte, MUSS der Bericht das mit `reason: "macro"`
nennen und der Code DARF NICHT in den Container übernommen werden, auch nicht als Anhang.

*Prüfverfahren:* Import einer Quelle mit Makro und einer nicht unterstützten Funktion; Bericht und
Container prüfen. Erwartetes Ergebnis: zwei Einträge mit Gründen; kein Makrocode im Container.
*Grundlage:* Zusage 7 aus [Q2]; [Q11] (JSON); eigene Konvention.

#### HPF-IMP-004 · Muss · Basis
Beim Übersetzen aus einer Schreibweise mit `A1`-Bezügen ohne Klammern, `,` als Parametertrenner,
`!` als Tabellentrenner oder Gebietsschema-Zahlen MUSS der Erzeuger in die Syntax nach Abschnitt 3
übersetzen; Datumsserien einer Quelle mit Epoche 1904 oder mit dem Schaltjahrfehler 1900 MÜSSEN
über das Kalenderdatum, nicht über die Serie, übernommen werden.

*Prüfverfahren:* Quelle mit den Quellformeln `SUMME(A1:A3)` bzw. `SUM(A1,A3)` (jeweils mit
führendem Gleichheitszeichen) und dem Datum `1900-02-28` in einer 1900-Quelle importieren.
Erwartetes Ergebnis: `=SUM([.A1:.A3])`, `=SUM([.A1];[.A3])`, `data-hp-value="1900-02-28"`.
*Grundlage:* [Q1] §5.6, §5.8; HPF-DAT-001; eigene Konvention.

#### HPF-IMP-005 · Kann · Basis
Ein Lesesystem KANN Tabellen in ein OpenDocument-Tabellendokument ausgeben; dabei MUSS es Formeln
mit dem Präfix `of:` schreiben, Werte als `office:value-type` und zugehörige Wertattribute nach
[Q4] übernehmen und die Nulldatum-Einstellung `1899-12-30` setzen.

*Prüfverfahren:* Export öffnen; `table:formula`, `office:value-type`, `table:null-date` prüfen.
Erwartetes Ergebnis: `of:=SUM([.E2:.E3])`, Wertarten übernommen, Nulldatum gesetzt.
*Grundlage:* [Q4]; [Q1] §2.2.

---

## 14. Sicherheit

#### HPF-SEC-001 · Muss · Basis
Tabellen DÜRFEN NICHT Makros, Skripte, Ereignisattribute oder Funktionen enthalten, die Code
ausführen, Dateien oder Netz erreichen, die Uhr oder Zufall lesen; dies gilt für Formeln,
Prüfregeln und jeden Zellinhalt (Skriptregeln nach [HP-INH-012](00-spezifikation.md#hp-inh-012--muss--basis)).

*Prüfverfahren:* Formeln und Prüfregeln gegen 8.2 prüfen; Skriptprüfung nach HP-INH-012 auf die
Tabellen anwenden. Erwartetes Ergebnis: 0 Befunde.
*Grundlage:* Zusage 2 und 7 aus [Q2]; [HP-SBX-016](00-spezifikation.md#hp-sbx-016--muss--basis).

#### HPF-SEC-002 · Muss · Basis
Ein Rechner MUSS Formeltext ausschließlich mit einem eigenen Parser und Auswerter verarbeiten und
DARF NICHT Formeltext in Code einer Wirtssprache umwandeln oder an einen Code-Interpreter
übergeben; der Rechner benötigt keine Schnittstelle zu Netz, Dateisystem, Uhr oder Zufall und DARF
NICHT eine solche verwenden.

*Prüfverfahren:* Code-Durchsicht und Ausführung des Rechners in einer Umgebung ohne diese
Schnittstellen (Testsuite P19). Erwartetes Ergebnis: keine dynamische Codeausführung; Rechner läuft
ohne die Schnittstellen.
*Grundlage:* Zusage 2 aus [Q2]; [HP-SBX-007](00-spezifikation.md#hp-sbx-007--muss--lebendig).

#### HPF-SEC-003 · Muss · Basis
Ein Lesesystem MUSS Formeltext, Zellwerte und Importberichte als Daten behandeln: Anzeige nur als
Text, kein Einsetzen in HTML ohne Maskierung, keine Auswertung von Zellinhalten als Markup.

*Prüfverfahren:* Zelle mit Text `<img src=x onerror=…>` als Wert und als Formelergebnis
(`=CONCATENATE("<b>";"x")`) anzeigen. Erwartetes Ergebnis: Text wird wörtlich gezeigt; kein
Element entsteht.
*Grundlage:* Zusage 2 aus [Q2]; [HP-SBX-017](00-spezifikation.md#hp-sbx-017--muss--lebendig).

#### HPF-SEC-004 · Muss · Basis
Ein Rechner MUSS die Grenzen aus HPF-SYN-010, HPF-ADR-003 und HPF-CALC-005 beim Einlesen
durchsetzen und bei Überschreitung die betroffene Formel mit `#NAME?` (Syntax- und Längengrenzen)
bzw. `#REF!` (Bereichsgrenzen) belegen, ohne die Berechnung der übrigen Zellen abzubrechen.

*Prüfverfahren:* Dokument mit einer 5000 Zeichen langen Formel und einem Bezug `[.A100000]`
berechnen. Erwartetes Ergebnis: `#NAME?`, `#REF!`; übrige Zellen berechnet.
*Grundlage:* eigene Festlegung; Zusage 2 aus [Q2] (Grenzen für Dokumentinhalte).

---

## 15. Abgrenzung zu verbreiteten Tabellenkalkulationen (informativ)

Die Festlegungen oben weichen bewusst von dem ab, was Microsoft Excel und LibreOffice Calc tun. Die
Zeilen nennen den Unterschied und den Grund. Die Angaben zu den Programmen stammen aus deren
Dokumentation ([Q16]–[Q19]) und eigener Kenntnis; eine Messung an den Programmen war in diesem
Paket nicht möglich (keine Installation im Arbeitscontainer), sie ist Gegenstand von P19.

| Thema | hpro | Excel (1900-System, Standard) | LibreOffice Calc (Standard) | Grund für die Festlegung |
|---|---|---|---|---|
| Epoche | 30.12.1899 = 0, kein Schaltjahr 1900; Serie 1 = 31.12.1899 | 01.01.1900 = 1, 1900 gilt als Schaltjahr (Serie 60 = „29.02.1900“); ab 01.03.1900 (Serie 61) gleich wie hpro ([Q17]) | 30.12.1899 = 0, einstellbar auf 01.01.1900 oder 01.01.1904 ([Q18]) | Serien ab 61 sind in allen drei Welten gleich; HPF-DAT-003 rät von früheren Daten ab |
| Genauigkeit | binary64 exakt; Ausgabe kürzeste Round-Trip-Form (bis 17 Stellen) | binary64, Anzeige und einige Vergleiche auf 15 signifikante Stellen begrenzt; „nahe Null“-Korrekturen bei Subtraktion ([Q16]) | binary64; Vergleiche mit Näherung (`approxEqual`), Anzeige 15 Stellen | Bitgleichheit zwischen Rechnern ist nur ohne Näherungen definierbar |
| `=` bei Zahlen | exakt | ≈ 15 Stellen | Näherung | wie oben; `0.1+0.2=0.3` ist in hpro `FALSE` |
| Text → Zahl | nie implizit (`#VALUE!`), nur `VALUE` mit kanonischer Form | `="3"+4` = 7, nach Gebietsschema | einstellbar: Fehler, Null oder eindeutige Umwandlung ([Q18]) | Gebietsschema darf das Ergebnis nicht ändern |
| Datumstext | nur ISO-Formen | nach Gebietsschema (`11.10.2026`, `10/11/2026`) | nach Gebietsschema, ISO immer | dito |
| Parametertrenner | `;` | `,` in englischen, `;` in deutschen Gebietsschemata | `;` (einstellbar) | OpenFormula-Austauschform |
| Bezüge | `[.B7]`, `[kosten.B7]` | `B7`, `Kosten!B7` | `B7`, `$Kosten.B7` in der Oberfläche, `[.B7]` in der Datei | OpenFormula-Austauschform; Importregel HPF-IMP-004 |
| Wahrheitswerte | eigener Typ, `TRUE()`/`FALSE()` | eigener Typ, Literale `TRUE`/`FALSE` | Zahl 1/0 mit Zahlenformat | OpenFormula lässt beides zu; hpro folgt der Unterscheidung („Distinct Logical“) |
| Rundung | auf der kanonischen Dezimalform, halb vom Nullpunkt weg | `ROUND(2.675;2)` = 2.68 (15-Stellen-Dezimalsicht) | 2.68 (mit Näherung) | gleiches sichtbare Ergebnis, aber mit definierter Regel |
| Platzhalter in Kriterien | keine | `*`, `?` immer | einstellbar: Platzhalter oder reguläre Ausdrücke | Deterministik und Einfachheit |
| Zirkelbezug | `#CIRC!`, keine Iteration | Warnung, Ergebnis 0 oder Iteration (einstellbar) | `Err:522`, Iteration einstellbar ([Q19]) | kein Zustand, keine Einstellung |
| Fehlernamen | 7 aus OpenFormula + `#CIRC!` | dieselben 7 plus weitere (#SPILL!, #CALC! u. a.) | dieselben 7 plus Err:5xx ([Q19]) | Austauschform |
| Rundungsfunktionen `CEILING`/`FLOOR` | nicht enthalten | mehrere Varianten (`CEILING`, `CEILING.MATH`, `CEILING.PRECISE`) mit verschiedener Behandlung negativer Zahlen | OpenFormula-Variante mit Modus | Gefahr stiller Abweichungen; Autor nutzt `ROUNDUP`/`ROUNDDOWN` |
| Ganze Spalten `A:A` | nicht zulässig | zulässig | zulässig | Bereich hängt von Rechnergrenzen ab |
| Makros | ausgeschlossen | VBA | Basic, Python u. a. | Zusage 2 und 7 |
| `NOW`, `TODAY`, `RAND` | ausgeschlossen | vorhanden, flüchtig | vorhanden, flüchtig | Zusage 7 |

**Messung in P19** (LibreOffice 26.8.1.1, Datei ohne zwischengespeicherte Ergebnisse, `calculateAll`;
[`docs/belege/P19/`](../belege/P19/README.md)): Bestätigt sind für LibreOffice die Zeilen
Genauigkeit (`=1-0.9-0.1` ergibt 0), `=` bei Zahlen (`=0.1+0.2=0.3` ergibt WAHR), Text → Zahl
(`="3"+4` ergibt 7), Datumstext (`10/11/26` wird gelesen), Wahrheitswerte (Zahl 1/0), Rundung
(`ROUND(2.675;2)` = 2.68), Fehlernamen (`Err:502`, `Err:504`, `Err:508` u. a.) und `NOW`/`TODAY`/`RAND`.
Zusätzlich gemessen: LibreOffice summiert kompensiert (zehnmal 0.1 ergibt 1, hpro
0.9999999999999999 nach HPF-NUM-005), rechnet `TIME(25;0;0)` modulo 24 Stunden (hpro 25 h nach
[Q1] §6.10.17), und zählt bei `COUNTIF(…;"10")` und `COUNTIF(…;"=10")` die Zahl 10 und den Text
`10` (hpro nach HPF-TYP-010 nur den Text bzw. nur die Zahl). Platzhalter und reguläre Ausdrücke sind
nicht gegen die Voreinstellung von LibreOffice gemessen, weil der Export nach HPF-IMP-005 die
Einstellungen aus HPF-TYP-011 in die Datei schreibt. Excel ist **nicht gemessen** (keine
Installation verfügbar). Abweichungen bei der Rundung von Rechenergebnissen behandelt der
Änderungsantrag [HPC-0005](aenderungen/HPC-0005.md), offene Randfälle
[HPC-0006](aenderungen/HPC-0006.md).

---

## 16. Referenzwerte (mechanisch geprüft)

Diese Werte werden von [`scripts/formeln-referenzwerte.mjs`](../../scripts/formeln-referenzwerte.mjs)
aus den Regeln dieses Teils berechnet (binary64-Arithmetik, kanonische Zahlform, Rundung auf der
Dezimalform, Epoche 30.12.1899) und von `check-formeln.mjs` mit dieser Tabelle verglichen. Die
Belege in [`docs/belege/S6/`](../belege/S6/README.md) enthalten eine zweite, unabhängige Berechnung
in Python.

<!-- REFERENZWERTE ANFANG -->
| Kennung | Ausdruck | Wert (kanonisch) |
|---|---|---|
| R1 | `=DATE(2026;10;11)` | `46306` |
| R2 | `=DATE(1900;3;1)` | `61` |
| R3 | `=DATE(1900;1;1)` | `2` |
| R4 | `=DATE(9999;12;31)` | `2958465` |
| R5 | `=DATE(2000;2;29)` | `36585` |
| R6 | `=0.1+0.2` | `0.30000000000000004` |
| R7 | `=0.1+0.2=0.3` | `FALSE` |
| R8 | `=1-0.9-0.1` | `-2.7755575615628914e-17` |
| R9 | `=ROUND(2.675;2)` | `2.68` |
| R10 | `=ROUND(1.005;2)` | `1.01` |
| R11 | `=ROUND(-2.5;0)` | `-3` |
| R12 | `=ROUND(1234.5678;-2)` | `1200` |
| R13 | kanonische Form von 1e21 | `1e+21` |
| R14 | kanonische Form von 0.1*3 | `0.30000000000000004` |
| R15 | `=TIME(8;30;0)` | `0.3541666666666667` |
| R16 | `=MOD(-7;3)` | `2` |
| R17 | `=INT(-2.5)` | `-3` |
| R18 | `=TRUNC(-2.5)` | `-2` |
| R19 | `=DATE(2026;13;1)` | `46388` |
| R20 | `=DATE(2026;2;30)` | `46083` |
| R21 | `=EDATE(DATE(2026;1;31);1)` | `46081` |
| R22 | `=WEEKDAY(DATE(2026;10;11))` | `1` |
| R23 | `=ISOWEEKNUM(DATE(2026;10;11))` | `41` |
| R24 | `=SUM` über zehnmal 0.1 | `0.9999999999999999` |
| R25 | `=2^53+1` | `9007199254740992` |
| R26 | kanonische Form von 1e-7 | `1e-7` |
| R27 | kanonische Form von -0 | `0` |
| R28 | `=ROUNDDOWN(2.675;2)` | `2.67` |
| R29 | `=PMT(0.05/12;360;200000)` | `-1073.6432460242795` |
| R30 | `=DAYS(DATE(2026;12;31);DATE(2026;1;1))` | `364` |
<!-- REFERENZWERTE ENDE -->

---

## 17. Konformität

### 17.1 Zuordnung der Anforderungen

Subjekte: D Dokument, E Erzeuger, B Bearbeiter, L Lesesystem (einschließlich Rechner), P Prüfer.
Diese Tabelle wird mechanisch gegen die Überschriften der Anforderungen geprüft.

<!-- KONFORMITAETSTABELLE ANFANG -->
| Kennung | Grad | Stufe | Subjekt | Kurztitel |
|---|---|---|---|---|
| HPF-SYN-001 | Muss | Basis | D, E | Formeltext nach OpenFormula mit einem `=` |
| HPF-SYN-002 | Muss | Basis | D, E | Zahlen als StandardNumber |
| HPF-SYN-003 | Muss | Basis | D, E | Textkonstanten und XML-Maskierung |
| HPF-SYN-004 | Muss | Basis | D, E, L | Parametertrenner `;`, Funktionsnamen |
| HPF-SYN-005 | Muss | Basis | D, L | Zugelassene Operatoren und Rangfolge |
| HPF-SYN-006 | Muss | Basis | D, L | Bezüge in eckigen Klammern |
| HPF-SYN-007 | Muss | Basis | D | Keine Bezüge nach außen, keine ganzen Zeilen/Spalten |
| HPF-SYN-008 | Muss | Basis | D | Fehlerkonstanten aus Abschnitt 7 |
| HPF-SYN-009 | Muss | Basis | D | Ausgeschlossene Syntax |
| HPF-SYN-010 | Muss | Basis | D | Längen- und Tiefengrenzen |
| HPF-SYN-011 | Muss | Basis | E, L | Leerraum |
| HPF-TYP-001 | Muss | Basis | L | Wertarten im Rechner |
| HPF-TYP-002 | Muss | Basis | L | Umwandlung zu Zahl, kein Text-zu-Zahl |
| HPF-TYP-003 | Muss | Basis | L | Umwandlung zu Wahrheitswert |
| HPF-TYP-004 | Muss | Basis | L | Umwandlung zu Text |
| HPF-TYP-005 | Muss | Basis | L | Exakter Zahlvergleich, leere Zelle |
| HPF-TYP-006 | Muss | Basis | L | Textvergleich mit Case Folding |
| HPF-TYP-007 | Muss | Basis | L | Ordnung verschiedener Wertarten |
| HPF-TYP-008 | Muss | Basis | L | Bereich im Einzelwertkontext |
| HPF-TYP-009 | Muss | Basis | L | Zahlenfolgen aus Bezügen |
| HPF-TYP-010 | Muss | Basis | L | Kriterien ohne Platzhalter |
| HPF-TYP-011 | Muss | Basis | D, L | Wirtseigenschaften festgelegt |
| HPF-TYP-012 | Muss | Basis | L | Groß-/Kleinschreibung ohne Gebietsschema |
| HPF-NUM-001 | Muss | Basis | L | binary64-Arithmetik |
| HPF-NUM-002 | Muss | Basis | D, E, L | Kanonische Zahlform |
| HPF-NUM-003 | Muss | Basis | L | Unendlich, NaN, Division durch 0 |
| HPF-NUM-004 | Muss | Basis | L | Rundung auf der Dezimalform |
| HPF-NUM-005 | Muss | Basis | L | Summationsreihenfolge |
| HPF-NUM-006 | Muss | Basis | D, L | Prozent |
| HPF-NUM-007 | Soll | Basis | E | Geldbeträge explizit runden |
| HPF-DAT-001 | Muss | Basis | L | Datumsserie, Epoche 1899-12-30 |
| HPF-DAT-002 | Muss | Basis | L | Datumsbereich |
| HPF-DAT-003 | Soll | Basis | E, L | Keine Daten vor 01.03.1900 |
| HPF-DAT-004 | Muss | Basis | L | Nur ISO-Datumstext |
| HPF-DAT-005 | Muss | Basis | D, L | Keine Zeitzone, kein NOW/TODAY |
| HPF-DAT-006 | Muss | Basis | L | Überläufe in DATE, EDATE, EOMONTH |
| HPF-DAT-007 | Muss | Basis | L | WEEKDAY-Typen, ISO-Woche |
| HPF-DAT-008 | Soll | Basis | D, E | `time`-Element in Datumszellen |
| HPF-ERR-001 | Muss | Basis | D, L | Fehlerwerte speichern |
| HPF-ERR-002 | Muss | Basis | L | Fehler weiterreichen |
| HPF-ERR-003 | Muss | Basis | L | Unbekannte Funktion, Syntaxfehler, Parameterzahl |
| HPF-ERR-004 | Muss | Basis | L | Fehler sichtbar darstellen |
| HPF-FN-001 | Muss | Basis | L | Alle Funktionen der Liste |
| HPF-FN-002 | Muss | Basis | D | Keine Funktionen außerhalb der Liste |
| HPF-FN-003 | Muss | Basis | E, L | Ausschlussliste nie anbieten |
| HPF-FN-004 | Kann | Basis | D | Teilversion in `calculator.spec` |
| HPF-STO-001 | Muss | Basis | D | Formelzelle mit Formel, Wert, Wertart, Inhalt |
| HPF-STO-002 | Muss | Basis | D, L | Form von `data-hp-value` je Wertart |
| HPF-STO-003 | Muss | Basis | D, L | Wertarten, Zellen ohne Wertattribut |
| HPF-STO-004 | Muss | Basis | D, E | Eingaben als Wertzellen |
| HPF-STO-005 | Soll | Basis | D, E | Anzeige passt zum Wert |
| HPF-STO-006 | Soll | Basis | D, E | `computedAt` und `calculator` im Manifest |
| HPF-STO-007 | Muss | Basis | B, L | `data-hp-stale` setzen und entfernen |
| HPF-STO-008 | Muss | Basis | L | Gespeicherte Werte, veraltet, nicht berechnet |
| HPF-STO-009 | Muss | Lebendig | L | Neuberechnung beim Öffnen, keine stille Änderung |
| HPF-STO-010 | Muss | Basis | D, L | Wertverweise im Text |
| HPF-STO-011 | Kann | Lebendig | D, L | Eingabezellen |
| HPF-STO-012 | Kann | Lebendig | D, L | Prüfregeln |
| HPF-ADR-001 | Muss | Basis | D | Tabellenkennung |
| HPF-ADR-002 | Muss | Basis | L | Zellraster nach Tabellenmodell |
| HPF-ADR-003 | Muss | Basis | D, L | Bezüge außerhalb der Tabelle, Grenzen |
| HPF-ADR-004 | Muss | Basis | L | Dokumentadresse = Formelbezug |
| HPF-ADR-005 | Muss | Basis | B | Bezüge beim Einfügen und Löschen anpassen |
| HPF-ADR-006 | Muss | Basis | L | Bezug liefert Wert, nicht Formel |
| HPF-CALC-001 | Muss | Basis | L | Determinismus |
| HPF-CALC-002 | Muss | Basis | L | Vollständige Berechnung in Abhängigkeitsordnung |
| HPF-CALC-003 | Muss | Basis | L | Eifrige Auswertung, Kurzschluss bei IF |
| HPF-CALC-004 | Muss | Basis | D, L, P | Zirkelbezüge |
| HPF-CALC-005 | Muss | Basis | D, L | Mindestkapazität |
| HPF-CALC-006 | Muss | Basis | L | Terminierung |
| HPF-CALC-007 | Muss | Lebendig | L | Neuberechnung nach Eingabe |
| HPF-CALC-008 | Soll | Basis | L | Testsuite und Versionsführung |
| HPF-FRZ-001 | Muss | Signiert | D, E | Eingefrorene Werte, Manifestfelder |
| HPF-FRZ-002 | Soll | Signiert | D, E | Formeln bleiben erhalten |
| HPF-FRZ-003 | Muss | Signiert | L | Keine Ersetzung gespeicherter Werte |
| HPF-FRZ-004 | Muss | Signiert | L | Formelwerte in der Signaturzusammenfassung |
| HPF-FRZ-005 | Muss | Signiert | L | Manipulation erkannt |
| HPF-FRZ-006 | Soll | Basis | B | Zelländerung im Vergleich und Verlauf |
| HPF-FRZ-007 | Muss | Archiv | D | Formeln und Rechner im Archivprofil |
| HPF-IMP-001 | Muss | Basis | E | Nicht übersetzbare Formeln einfrieren |
| HPF-IMP-002 | Muss | Basis | E | Fehlender Quellwert |
| HPF-IMP-003 | Muss | Basis | E | Importbericht, keine Makros |
| HPF-IMP-004 | Muss | Basis | E | Syntax- und Datumsübersetzung |
| HPF-IMP-005 | Kann | Basis | L | Export als OpenDocument |
| HPF-SEC-001 | Muss | Basis | D | Keine Makros, kein Code |
| HPF-SEC-002 | Muss | Basis | L | Eigener Parser, keine Schnittstellen |
| HPF-SEC-003 | Muss | Basis | L | Werte als Daten anzeigen |
| HPF-SEC-004 | Muss | Basis | L | Grenzen durchsetzen |
<!-- KONFORMITAETSTABELLE ENDE -->

### 17.2 Summen je Stufe

Die Zahlen werden von `scripts/check-formeln.mjs` berechnet und mit dieser Tabelle verglichen.

| Stufe | Muss | Soll | Kann | Summe |
|---|---|---|---|---|
| Basis | 69 | 7 | 2 | 78 |
| Lebendig | 2 | 0 | 2 | 4 |
| Signiert | 4 | 1 | 0 | 5 |
| Archiv | 1 | 0 | 0 | 1 |
| **alle** | **76** | **8** | **4** | **88** |

### 17.3 Folgen für Teil 1

Teil 1 enthält bereits die Regeln HPR-SBX-013 (Formelzelle ohne Wert), HPR-SBX-014 (verbotene
Funktion; seit diesem Teil ist jeder Name außerhalb von 8.2 ein Befund), HPR-PROF-012 (eingefrorene
Fassung ohne Werte oder Rechnerangabe) und HPR-ADR-… zu Wertverweisen. Regeln zu Syntax
(HPF-SYN-*), Wertformen (HPF-STO-002/003), Tabellenkennungen (HPF-ADR-001), Zirkeln
(HPF-CALC-004) und Importberichten (HPF-IMP-003) sind als Dokumentregeln nachzutragen, sobald das
Prüfprogramm (S3) einen Formelparser hat. Das Manifest erhält die in diesem Teil definierten
Schlüssel `computedAt` und `calculator` (mit `spec`) als bekannte Schlüssel im Sinne von
[HP-META-008](00-spezifikation.md#hp-meta-008--muss--basis).

---

## 18. Offene Punkte und nicht Geprüftes

1. **Gegenprobe gegen Tabellenkalkulationen:** Die Tabelle in Abschnitt 15 beruht auf
   Dokumentation und Kenntnis, nicht auf Messung; Messung mit denselben Testformeln in zwei
   Programmen ist Teil von P19 (Abnahmekriterium „Gegenprobe“). **Stand P19:** gegen LibreOffice
   26.8.1.1 gemessen (Ergebnis unter Abschnitt 15); Excel nicht gemessen.
2. **Benannte Bereiche** (`Mehrwertsteuersatz` statt `[steuer.B1]`) würden Formeln lesbarer machen;
   OpenFormula §5.11 definiert sie. Ausgeschlossen in 0.1, weil die Auflösung eine Namenstabelle im
   Manifest bräuchte; Vorschlag für 0.2.
3. **Bedingte Formatierung** („Formatregeln“ in Zusage 7) ist nicht festgelegt; Prüfregeln
   (HPF-STO-012) decken den Fall „Wert ungültig“ ab. Vorschlag: `data-hp-style-if` in 0.2.
4. **Funktionsbedarf:** Welche Funktionen Aufmaße, Kostenschätzungen und Anträge wirklich brauchen,
   ist eine Erhebung ([Q2] §5 Frage 7). Die Liste 8.2 (96 Funktionen) ist ein Vorschlag; Zu- und
   Abgänge laufen über Teilversionen nach HPF-FN-004.
5. **`TEXT`-Funktion:** Zahlformatierung in Formeln ist ausgeschlossen, weil Formatcodes in [Q1]
   „implementation-defined“ sind. Ein eigener, kleiner Formatcode-Satz wäre möglich, aber eine
   eigene Sprache; offen.
6. **Bereiche über mehrere Inhaltsdokumente:** nicht zulässig (HPF-SYN-007); ob Dokumente mit
   mehreren Dateien Summen über Dateien brauchen, ist offen.
7. **Nicht geprüft in diesem Paket:** alle Prüfverfahren, die einen Rechner, ein Lesesystem, einen
   Bearbeiter oder einen Importer voraussetzen (TYP, NUM-001/003–006, DAT, ERR-002–004, FN-001/003,
   STO-007–012, ADR-002–006, CALC, FRZ-003–006, IMP, SEC-002–004). Sie sind formuliert, die
   Werkzeuge entstehen in P19 und P4. Ausgeführt wurden die mechanische Prüfung dieses Dokuments,
   die Nachrechnung der Referenzwerte in zwei Sprachen und die Gleichstandsprüfung der
   maschinenlesbaren Funktionsliste ([`docs/belege/S6/`](../belege/S6/README.md)). **Stand P19:**
   Rechner, Lesesystem (Ausfüllen im Reader), Speichern und Importer sind gebaut; die
   Prüfverfahren der genannten Anforderungen laufen als Tests
   ([`docs/belege/P19/`](../belege/P19/README.md)), ausgenommen HPF-FRZ-004 (Signaturdialog; die
   Oberfläche signiert noch nicht, Paket P17), HPF-ADR-005 (Zeilen einfügen und löschen; der
   Bearbeiter ist Paket P5) und HPF-FRZ-007 (Einfrieren bietet nur die Profile `static` und
   `signed`). Die Dokumentregeln (HPF-SYN-002/007, HPF-ADR-001, HPF-STO-004/005, HPF-SEC-001,
   HPF-FN-004, HPF-DAT-003/008, HPF-NUM-007) sind noch nicht im Konformitätsprüfer (Abschnitt 17.3).

---

## 19. Quellen

Alle externen Quellen wurden am 11.10.2026 abgerufen, soweit nicht anders vermerkt; der Abruf von
[Q1] (SHA-256 `3470c9d2…c54b`) ist in den Belegen protokolliert.

- [Q1] OASIS, *Open Document Format for Office Applications (OpenDocument) Version 1.3, Part 4: Recalculated Formula (OpenFormula) Format* (= ISO/IEC 26300-2) – https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part4-formula/OpenDocument-v1.3-os-part4-formula.html
- [Q2] hpro, *10 – Anspruch und Funktionsprofil* (sieben Zusagen; verbindlich; Zusage 7) – [`docs/10-anspruch-und-funktionsprofil.md`](../10-anspruch-und-funktionsprofil.md)
- [Q3] hpro, *Spezifikation Teil 0: Kern* (Konventionen, HP-ADR-008, HP-PROF-007, HP-SBX-016 u. a.) – [`00-spezifikation.md`](00-spezifikation.md)
- [Q4] OASIS, *OpenDocument Version 1.3, Part 3: OpenDocument Schema* (`office:value-type`, `office:value`, `office:date-value`, `office:time-value`, `office:boolean-value`, `office:string-value`, `table:formula`, `table:null-date`) – https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part3-schema/OpenDocument-v1.3-os-part3-schema.html
- [Q5] IEEE, *IEEE Std 754-2019, Standard for Floating-Point Arithmetic* (binary64, roundTiesToEven) – https://standards.ieee.org/ieee/754/6210/
- [Q6] Ecma International, *ECMA-262, ECMAScript Language Specification*, Abschnitt Number::toString (kürzeste Round-Trip-Dezimaldarstellung) – https://tc39.es/ecma262/#sec-numeric-types-number-tostring
- [Q7] IETF, *RFC 2119* und *RFC 8174* (Schlüsselwörter) – https://www.rfc-editor.org/rfc/rfc2119 · https://www.rfc-editor.org/rfc/rfc8174
- [Q8] IETF, *RFC 3339, Date and Time on the Internet: Timestamps* (`full-date`, `partial-time`) – https://www.rfc-editor.org/rfc/rfc3339
- [Q9] WHATWG, *HTML Living Standard* (Tabellenmodell, `time`-Element, `data-*`-Attribute, Attributwerte) – https://html.spec.whatwg.org/multipage/
- [Q10] Unicode Consortium, *The Unicode Standard*, Kapitel 3.13 Default Case Algorithms (Case Folding, Case Conversion) – https://www.unicode.org/versions/latest/
- [Q11] IETF, *RFC 8259, The JavaScript Object Notation (JSON) Data Interchange Format* – https://www.rfc-editor.org/rfc/rfc8259
- [Q12] W3C, *Web Content Accessibility Guidelines (WCAG) 2.2* – https://www.w3.org/TR/WCAG22/
- [Q13] ISO, *ISO 4217 Currency codes* – https://www.iso.org/iso-4217-currency-codes.html (403 bei automatisiertem Abruf)
- [Q14] hpro, *07 – Foren und Nutzererwartungen* (§3d Formularlogik mit Berechnung und Validierung; §6 „Formulare … mit Berechnung und Validierung“) – [`docs/07-foren-und-nutzererwartungen.md`](../07-foren-und-nutzererwartungen.md)
- [Q15] hpro, Belege der Pakete P2 und P3 (Manipulation einer Inhaltsdatei → `HASH_FAILURE`) – [`docs/belege/P3/README.md`](../belege/P3/README.md)
- [Q16] Microsoft, *Floating-point arithmetic may give inaccurate results in Excel* (15 signifikante Stellen, Korrektur nahe Null) – https://learn.microsoft.com/en-us/office/troubleshoot/excel/floating-point-arithmetic-inaccurate-result
- [Q17] Microsoft, *Excel incorrectly assumes that the year 1900 is a leap year* – https://learn.microsoft.com/en-us/office/troubleshoot/excel/wrongly-assumes-1900-is-leap-year
- [Q18] The Document Foundation, *LibreOffice Help: Calculate (Options)* (Nulldatum, Groß-/Kleinschreibung, Genauigkeit wie angezeigt, Platzhalter, reguläre Ausdrücke, Iterationen, Text in Zahlen umwandeln) – https://help.libreoffice.org/latest/en-US/text/shared/optionen/01060500.html
- [Q19] The Document Foundation, *LibreOffice Help: Error Codes in LibreOffice Calc* (Err:522 Zirkelbezug) – https://help.libreoffice.org/latest/en-US/text/scalc/05/02140000.html
