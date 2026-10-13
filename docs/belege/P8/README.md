# Belege P8 – Barrierefreiheits-Prüflauf

**Stand:** 13.10.2026 · **Erzeugt mit:** [`scripts/belege-p8.sh`](../../../scripts/belege-p8.sh)
(wörtliche Ausgaben der Prüfbefehle in den Dateien `00` … `08`; `08` ist die Prüfung wie der
Läufer: `npm ci` Exit 0, `npm test` Exit 0 – Kern 565/565, Reader vitest 51/51, Playwright 73/73,
alle Spezifikationsprüfungen).

Ziel aus [docs/08](../../08-arbeitsplan.md): eingebauter Prüflauf mit direktem Korrekturweg –
Struktur, Lesereihenfolge, Alternativtexte, Kontrast, Sprache, Tabellenköpfe, Fokusführung.
Umgesetzt im Kern (`kern/src/a11y/`, läuft ohne Browser und ohne Netz), auf der Kommandozeile
(`hpro a11y check|fix`) und im Reader (Leiste „Prüfen“). Jede Korrektur ist eine Operation des
strukturierten Editors aus P5: Text bleibt Text, Struktur bleibt Struktur, der Verlauf hält sie fest,
Sperren und versiegelte Abschnitte gelten (docs/10, Zusage 4 und 5; Abschnitt 3 Punkt 5
„Barrierefreiheit ist kein Anhang“).

## Abnahmekriterien

| # | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| 1 | Prüflauf findet in einem absichtlich fehlerhaften Testdokument mindestens fünf Kategorien | **erfüllt** – Das Testdokument [`p8-barrierefreiheit`](../../spezifikation/beispiele/p8-barrierefreiheit/) (zwei Inhaltsdokumente, ein Stylesheet, jede Fehlerstelle im Quelltext kommentiert) ergibt **19 Befunde in allen 7 Kategorien**: Struktur 3, Lesereihenfolge 1, Alternativtexte 3, Kontrast 3, Sprache 3, Tabellenköpfe 2, Fokusführung 4. Gleich im Kern-Test, auf der Kommandozeile und im Reader (Zählungstabelle der Leiste) | [`01-kern-tests.txt`](01-kern-tests.txt), [`02-abnahme-kommandozeile.txt`](02-abnahme-kommandozeile.txt) (erster Lauf), [`05-reader.txt`](05-reader.txt), [`container/pruefen-bericht.json`](container/pruefen-bericht.json), [Bildschirmfoto](screenshots/p8-panel-befunde-desktop.png) |
| 2 | Korrekturvorschläge sind anwendbar und der zweite Lauf ist fehlerfrei | **erfüllt** – Alle 19 Vorschläge angewendet (18 mit vorgeschlagenem Wert, einer – der Alternativtext für ein Bild ohne Bildunterschrift – mit eingegebenem Wert, weil es dafür keine Quelle gibt). Zweiter Lauf über die gespeicherte Datei: **0 Befunde**, `hpro a11y check` Exit 0; im Reader „Keine Befunde – alle sieben Kategorien geprüft“, die heruntergeladene Datei prüft der Kern erneut mit 0 Befunden. Der korrigierte Container: Integrität ok, Fassung 1 mit Verlaufsnotiz, das fehlerhafte Original aus dem Journal byte-genau wiederherstellbar, **epubcheck 5.4.0: 0 Fehler, 0 Warnungen** (vorher 2 Fehler RSC-005 wegen `lang="de_AT"`), Konformitätsprüfer `hpro-check`: 0 Fehler (vorher 6) | [`02-abnahme-kommandozeile.txt`](02-abnahme-kommandozeile.txt), [`03-epubcheck.txt`](03-epubcheck.txt), [`04-hpro-check.txt`](04-hpro-check.txt), [`05-reader.txt`](05-reader.txt), [`container/pruefen-korrigiert.hpro`](container/pruefen-korrigiert.hpro), [Bildschirmfoto](screenshots/p8-panel-nach-korrektur-desktop.png) |
| 3 | axe-core-Prüfung der Oberfläche ohne schwere Verstöße | **erfüllt** – axe-core 4.14 über @axe-core/playwright 4.13 (Regeln WCAG 2.0/2.1/2.2 A und AA, best-practice) über den Reader mit offener Leiste „Prüfen“: mit 19 Befunden bei 1440 px und 390 px, nach allen Korrekturen bei 1440 px – **0 Verstöße der Stufen serious/critical**. Übrig bleibt je `page-has-heading-one` (moderate): die Oberfläche selbst hat keine `h1`, die Hauptüberschrift steht im Dokument, das für diese Messung ausgeschlossen war (das fehlerhafte Testdokument hätte sonst die Oberflächenmessung verfälscht). Im Browser-Test wird nach den Korrekturen zusätzlich mit Dokument gemessen: ebenfalls 0 schwere Verstöße. Die übrigen 13 Szenarien der Grundprüfung aus P4 (`a11y.spec.ts`) laufen weiter in `npm test` | [`05-reader.txt`](05-reader.txt), [`gegenprobe/axe-oberflaeche.json`](gegenprobe/axe-oberflaeche.json), Test `Abnahme 3` in [`app/e2e/pruefen.spec.ts`](../../../app/e2e/pruefen.spec.ts) |

## Was gebaut wurde

**Prüfregeln** (`kern/src/a11y/audit.ts`), je Befund Regel, Schwere (Fehler/Warnung),
WCAG-2.2-Kriterium, Anforderung der Spezifikation, Fundstelle (Zeiger `pfad#kennung/schritte`,
Zeile), Auszug und Vorschlag:

| Kategorie | Regeln | Vorschlag (Bearbeitungsoperation) |
|---|---|---|
| Struktur (1.3.1, 2.4.6; HP-INH-007) | `h1-fehlt`, `h1-mehrfach`, `ueberschrift-sprung`, `ueberschrift-leer`, `pseudo-ueberschrift` (fetter Absatz statt Überschrift), `pseudo-liste` (Absätze mit „•“ oder „1.“) | Ebenen der betroffenen Überschriften samt Unterüberschriften (`set-heading-levels`), Hauptüberschrift einfügen, Absatz → Überschrift der passenden Ebene, Absätze → Liste |
| Lesereihenfolge (1.3.2; HP-INH-005, -011) | `css-reihenfolge` (`order`, `flex-direction: *-reverse`, Rasterplatzierung), `css-position` (`absolute`/`fixed` an Text) – nur wenn die Regel ein Element des Dokuments trifft | Deklaration entfernen (`set-css` bzw. `set-style`) |
| Alternativtexte (1.1.1, 4.1.2; HP-INH-006) | `alt-fehlt`, `alt-dateiname`, `alt-nichtssagend` („Bild“, „Foto“ …), `grafik-ohne-namen` (eingebettetes SVG, `role="img"`) | Alternativtext setzen (Vorschlag aus Bildunterschrift oder `title`, sonst Eingabe; leer = dekorativ, `alt=""`), `role="img"` + `aria-label` |
| Kontrast (1.4.3; HP-INH-004) | `kontrast-text`: statische Kaskade (Spezifität, `!important`, Reihenfolge, Vererbung, `var()` mit Rückfall, Alpha) in **allen drei Farbschemata** des Readers (hell, dunkel, hoher Kontrast); 4,5:1, große Schrift (h1–h3) 3:1; Paare, die ganz vom Lesesystem kommen, sind dessen Sache | je nach Lage: Schriftfarbe `var(--hp-foreground)` (wenn der Hintergrund mit dem Schema wechselt), nächstliegende Farbe gleichen Farbtons mit ausreichendem Kontrast, oder Schriftfarbe am Kasten mit festem Hintergrund |
| Sprache (3.1.1, 3.1.2; HP-INH-002) | `sprache-fehlt`, `sprache-ungueltig` (BCP 47, ISO 639-1), `sprache-widerspruch` (`lang` ≠ `xml:lang`), `sprache-teil-ungueltig`, `sprachwechsel` (Absatz offensichtlich in Deutsch, Englisch, Französisch, Italienisch oder Spanisch, anders als ausgezeichnet; Stoppwörter, nur bei eindeutigem Ergebnis) | `set-lang` (setzt `lang` und `xml:lang`; Vorschlag aus den Metadaten, korrigierter Schreibweise oder erkannter Sprache) |
| Tabellenköpfe (1.3.1; HP-INH-008) | `kopfzellen-fehlen`, `kopfzellen-ohne-bezug` (`th` ohne `scope`), `tabelle-ohne-beschriftung` | erste Zeile (in `thead`, damit der Ausdruck sie wiederholt) und – wenn die erste Spalte Bezeichnungen zu Zahlen enthält – erste Spalte zu `th` mit `scope` (`set-table-headers`); `caption` (Vorschlag aus `aria-label`, einleitendem Absatz mit Doppelpunkt oder Abschnittsüberschrift). Rechentabellen bleiben dem Tabellenrechner vorbehalten |
| Fokusführung (2.4.3, 2.4.4, 2.4.7, 4.1.2) | `tabindex-positiv`, `fokus-ohne-zweck` (`tabindex="0"` an nicht bedienbarem Element), `fokus-versteckt` (`aria-hidden` über Fokussierbarem), `fokus-unsichtbar` (`outline: none` ohne Ersatz), `link-ohne-namen` | `tabindex` entfernen bzw. `0`, `aria-hidden` entfernen, Deklaration entfernen, `aria-label` (Vorschlag aus der Überschrift des Verweisziels) |

**Neue Operationen der Bearbeitungssitzung** (`kern/src/edit/session.ts`): `set-heading-levels`,
`set-lang`, `set-table-headers`, `set-caption`, `set-attribute` (nur `tabindex` `0`/`-1`,
`aria-hidden`, `aria-label`, `role="img"`, `scope` – kein beliebiges Attribut, also keine
Ereignis-Handler), `set-style`, `set-css` (eine Deklaration einer Regel, ohne `url()`, `;{}<>\`;
Kommentare und alles andere bleiben Byte für Byte, siehe `diff -u` in 02); `set-image` kennt
`decorative`. Jede Operation läuft durch dieselben Prüfungen wie das Bearbeiten (Sperren
`read-only` auch für Stylesheets, versiegelte Abschnitte, eingefrorene Fassungen, Rechentabellen,
keine neuen Strukturfehler). Abgelehnte Operationen: Ende von 02 und Kern-Test „Operationen“.

**Korrigieren** (`kern/src/a11y/fix.ts`): ein Vorschlag = Liste von Operationen mit Platzhalter für
den Wert. Mehrere Vorschläge laufen in Durchgängen über ein Prüfergebnis; Vorschläge, deren Adresse
eine vorherige Korrektur verschoben haben kann (gleicher Anker) oder deren Überschriftenebene von
einer geänderten Ebene abhängt, warten auf den nächsten Prüflauf – so werden nie veraltete
Adressen benutzt. Werte ohne Vorschlag werden nicht erfunden: ohne Eingabe bleibt der Befund mit
„Eingabe nötig“ stehen (02, Abschnitt „Ohne Eingabe“).

**Reader** (`app/src/a11ycheck.ts`, Leiste „Prüfen“): Zählung je Kategorie, Befunde mit
WCAG-Kriterium und Fundstelle, „Zeigen“, Eingabefeld mit Vorschlag und dessen Herkunft,
„Korrigieren“ einzeln oder „Alle Vorschläge übernehmen“, „Erneut prüfen“, „Rückgängig“,
„Speichern“ (neue Fassung `…-geprueft.hpro`). Die Vorschau zeigt jede Korrektur sofort im
Dokumentrahmen. Fokusführung der Leiste selbst: nach einer Korrektur springt der Fokus zum
Eingabefeld bzw. Knopf des nächsten Befunds, ohne Befunde zur Zusammenfassung (`role="status"`);
jedes Ergebnis wird angesagt. „Zeigen“ rollt das Dokument, der Fokus bleibt in der Leiste.

## Gegenproben mit unabhängigen Werkzeugen

| Was | Ergebnis | Beleg |
|---|---|---|
| **axe-core über das gerenderte Testdokument** (nur der Dokumentrahmen) | vorher 6 verletzte Regeln: `color-contrast` (serious, 3 Elemente), `heading-order`, `html-lang-valid`, `image-alt` (critical), `link-name`, `tabindex` – dieselben Stellen wie der Prüflauf; nach den Korrekturen: **keine** | [`gegenprobe/axe-dokument.json`](gegenprobe/axe-dokument.json) |
| **Kontrast: Farben, die Chromium berechnet** (`getComputedStyle`, Hintergrund über die Vorfahren, WCAG-Formel) in allen drei Schemata | identisch mit dem Kern bis auf die zweite Nachkommastelle: `.hinweis` 2,81:1 (hell), `.warnung` 1,29:1 (alle), `.box-dunkel` 2,08:1 (hell); wo der Kern nichts meldet, misst Chromium ≥ 6,06:1 | [`gegenprobe/kontrast-chromium.json`](gegenprobe/kontrast-chromium.json) |
| **epubcheck 5.4.0** | vorher 2 Fehler (RSC-005, `lang`/`xml:lang` „de_AT“), nachher 0/0 | [`03-epubcheck.txt`](03-epubcheck.txt) |
| **Konformitätsprüfer hpro-check (S3, eigene Regeln, anderer Code)** | vorher 6 Fehler (HPR-INH-003 ×2, -008, -009, epubcheck ×2) und Warnungen zu Überschriftensprung, Tabellenköpfen, `row-reverse`; nachher 0 Fehler. Zwei Warnungen bleiben, die nicht zu den sieben Kategorien gehören: `HPR-META-008` (Barrierefreiheitsmetadaten im Manifest fehlen) und `HPR-INH-014` (`data-hp-table` fehlt) – siehe „Offen“ | [`04-hpro-check.txt`](04-hpro-check.txt) |

## Prüflauf über die Beispiele des Readers

Neben dem Testdokument (19 Befunde) gibt es acht eingebaute Beispiele; sieben davon ergeben **0 Befunde**; ein versiegelter Abschnitt
(`sperren.hpro`) wird als „nicht geprüft (verschlüsselt)“ ausgewiesen. Im Druckbeispiel
`druck.hpro` (P18) findet der Prüflauf **zwei echte Kontrastfehler**, die nur im dunklen und im
Kontrastschema auftreten: `pre` hat einen festen hellgrauen Hintergrund (#f3f4f5), die Schrift kommt
aber vom Lesesystem (dunkel 1,15:1), und `aside[data-hp-priority]` hat eine feste dunkle Schrift
(#3a3d40) auf dem Hintergrund des Lesesystems (dunkel 1,56:1). Chromium misst dieselben Werte
([`gegenprobe/kontrast-chromium.json`](gegenprobe/kontrast-chromium.json)). Das Beispiel wurde nicht
geändert (es gehört zu P18; Befund für dessen Nacharbeit), siehe [`06-alle-beispiele.txt`](06-alle-beispiele.txt).

## Messungen

Rechner: Intel N100, seit 13.10.2026 auf 800 MHz ohne Turbo ([`00-werkzeuge.txt`](00-werkzeuge.txt)).

| Dokument | Elemente | Befunde | Prüflauf | alle Korrekturen + Speichern |
|---|---|---|---|---|
| Testdokument | 59 | 19 | 46 ms | 227 ms |
| Hauptteil 10× | 509 | 118 | 143 ms | 1,6 s |
| Hauptteil 50× | 2 509 | 558 | 575 ms | 27,1 s |

Im Reader: Öffnen bis zur vollständigen Befundliste 1,7 s, „Alle Vorschläge übernehmen“ 0,4 s
([`07-messungen.txt`](07-messungen.txt), [`messungen-reader.json`](messungen-reader.json)). Die
Korrektur wächst bei sehr vielen Befunden stärker als linear, weil die Bearbeitungssitzung vor jeder
Operation den Zustand sichert und danach die ganze Struktur prüft (P5, gewollt: jede Operation
einzeln zurücknehmbar und geprüft).

## Nicht geprüft (mit Grund)

Der Prüflauf nennt diese Punkte in jedem Bericht selbst („Nicht automatisch prüfbar“):

- **Inhalt der Alternativtexte** – ob ein Text das Bild trifft, kann nur ein Mensch beurteilen;
  geprüft werden Vorhandensein, Dateinamen und Füllwörter. Ein Vorschlag aus der Bildunterschrift
  ist als „bitte prüfen“ gekennzeichnet.
- **Sinnvolle Reihenfolge des Dokuments selbst** – geprüft wird, ob CSS sie verändert.
- **Kontrast von Text in Bildern und von Bedienelementen (WCAG 1.4.11)**; Elemente mit
  Hintergrundbild oder -verlauf werden als „nicht auswertbar“ gezählt, nicht geraten.
- **Sprachwechsel** in anderen Sprachen als den fünf, deren Stoppwörter der Prüflauf kennt.
- **Lebendige Komponenten** (Profil `interactive`) laufen in der Sandbox; ihre Bedienbarkeit ist nur
  im Browser prüfbar – das deckt die axe-Prüfung des Readers (P4/P15) ab, nicht dieser Prüflauf.
- **Untertitel und Audiodeskription** (Inhalt der Medien).
- **Hilfstechnik selbst** (NVDA, JAWS, VoiceOver, TalkBack): nicht geprüft, im Container ohne
  Bildschirm nicht bedienbar. axe-core ersetzt das nicht (findet laut Hersteller im Schnitt 57 % der
  WCAG-Probleme, docs/03 5.4).
- **Andere Browser als Chromium** (Firefox, WebKit: P13).

## Offen

1. **Barrierefreiheitsnachweis im Container** (docs/03, 5.4: `accessibility-report.json`,
   mitsigniert) und die Metadaten nach EPUB Accessibility 1.1 aus dem Prüfergebnis – braucht einen
   Änderungsantrag (Format); hier nicht umgesetzt. Der Bericht liegt nur als JSON der
   Kommandozeile vor (`hpro a11y check --json`).
2. **Tabellenstrategie für schmale Breiten** (`data-hp-table`, HP-INH-010) ist kein Teil der sieben
   Kategorien; der Konformitätsprüfer meldet sie weiter als Warnung.
3. **Befund in `druck.hpro`** (zwei Kontrastfehler im dunklen Schema) an P18 zurückgeben.
4. **Prüfen und Bearbeiten** führen im Reader je eine eigene ungespeicherte Sitzung; vor dem Wechsel
   speichern. Eine gemeinsame Sitzung wäre bequemer.
5. **Zeitgrenzen der Bestandstests:** Beim ersten vollständigen `npm test` dieses Laufs scheiterten
   drei ältere Kern-Tests nur an der Zeit (epubcheck nach 120 s abgebrochen, HPF-CALC-007 1 341 ms
   statt ≤ 1 000 ms, allein 187 ms) – die Testdateien laufen parallel auf dem gedrosselten Rechner.
   Geändert: epubcheck-Aufrufe dürfen 420 s dauern, HPF-CALC-007 misst das Beste aus drei
   Eingaben; die Schranke von 1 s selbst blieb unverändert.
6. Der Vergleich zweier Fassungen (`hpro diff`, P5) zeigt Attributänderungen (`lang`, `scope`,
   `aria-label`, `tabindex`) nicht an; sie stehen im `diff -u` in 02 und im Verlauf.
