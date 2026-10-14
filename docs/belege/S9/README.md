# Belege S9 – KI-lesbare Ebene: strukturierte Maschinensicht je Dokument

Erzeugt mit `scripts/belege-s9.sh` (Dateien 00–06, Container, Prüfhülle), der Sprachmodell-Lauf
getrennt mit `scripts/s9-sprachmodell.mjs` und ausgewertet mit `scripts/belege-s9.sh
--nur-auswertung` (Datei 07), der Gesamttest mit `npm ci && npm test` (Datei 08). Jede Datei
enthält die Befehle und ihre wörtlichen Ausgaben mit Rückgabecode.

| Datei | Inhalt |
|---|---|
| [`00-werkzeuge.txt`](00-werkzeuge.txt) | Node, JDK 21, epubcheck 5.4.0, DSS-Bibliotheken 6.5, Claude Code, `hpro version` |
| [`01-spezifikation.txt`](01-spezifikation.txt) | Abschnitt 15a in Teil 0 (HP-MACH-001 … 015), Regeln 5.13 und Leserregel in Teil 1, Regelkatalog-JSON, Schema, `check-spec`, `check-konformitaet`, `check-governance` mit Selbsttests |
| [`02-beispiel.txt`](02-beispiel.txt) | Beispiel bauen (erzeugen, neu rechnen, schwärzen, Anmerkung, signieren), Hash-Manifest, `package.opf`, eigene Signaturprüfung, entpackte Sicht, Prüfhülle |
| [`03-epubcheck.txt`](03-epubcheck.txt) | epubcheck 5.4.0 auf allen drei Containern; Konformitätsprüfer mit angebundenem epubcheck |
| [`04-dss.txt`](04-dss.txt) | EU DSS 6.5: Sicht ist signiertes Objekt (TOTAL_PASSED); nach Änderung der Summe in der Sicht TOTAL_FAILED / HASH_FAILURE; Gegenprobe Kern und Prüfer |
| [`05-pruefer.txt`](05-pruefer.txt) | Konformitätsprüfer: stimmige, fehlende, abweichende, eingeschleuste, statusbehauptende, Markdown-veränderte und unsignierte Sicht; verborgener Text; Prüfhülle; Nachrüsten |
| [`06-gleichheit.txt`](06-gleichheit.txt) | Einheitstests `kern/test/machine.test.ts` (13) und die 13 Testsuite-Fälle `*-mach-*` |
| [`07-sprachmodell.txt`](07-sprachmodell.txt) | Sprachmodell-Stichprobe: 36 Fragen, Antworten wörtlich, automatische Bewertung |
| [`08-npm-test.txt`](08-npm-test.txt) | `npm ci && npm test` über das ganze Repository |
| `container/` | `s9-maengelbericht.hpro` (unsigniert), `s9-maengelbericht-signiert.hpro` mit Testzertifikat, `s9-maengelbericht-versteckt.hpro` (absichtlich nicht konform), die entpackte Sicht als JSON und Markdown |
| `berichte/` | `pruefhuelle.json` und `.md` (Ausgabe von `hpro machine`), `sprachmodell.json` (Rohdaten des Sprachmodell-Laufs mit SHA-256 der befragten Dateien) |

## Abnahmekriterien

**1. Spezifikationskapitel mit Format, Pflichtfeldern und Regeln — erfüllt.** Teil 0, Abschnitt 15a
„Maschinensicht (KI-lesbare Ebene)“: Ort (`machine/document.json`, je Fassung), Pflichtfelder (13,
Schema JSON Schema 2020-12, alle Objekte geschlossen, `schema/maschinensicht.schema.json`),
Blocktypen, ein deterministisches Ableitungsverfahren (Text T1/T2, Sichtbarkeit V1–V4, Blöcke B1–B8,
Inline I1–I5, Formularfelder F1–F3), Hinweistext und Prüfhülle (Daten, keine Anweisung), Markdown-
Darstellung und 15 Anforderungen HP-MACH-001 … 015. Teil 1, Abschnitt 5.13: HPR-MACH-001 … 008 und
die Leserregel HPL-MACH-001; Regelkatalog-JSON erweitert. Änderungsantrag
[HPC-0012](../../spezifikation/aenderungen/HPC-0012.md). `check-spec`, `check-konformitaet`,
`check-governance` und ihre Selbsttests: `OK: 0 errors, 0 warnings` (01).

**2. Erzeuger im Kern; Beispiel-Container mit Maschinensicht, gehasht und signiert — erfüllt.**
`kern/src/machine/` (Ableitung, Markdown, Schema, Container-Funktionen); jeder Schreibweg des
Kerns (`createContainer`, Neuberechnung, Formulare, Bearbeiten, Schwärzen, Versiegeln, Anmerkungen)
leitet die Sicht im selben Schreibvorgang neu ab (HP-MACH-013). `machine/document.json` und
`machine/document.md` stehen mit SRI-Hash in `manifest.json#resources` und in `package.opf` (02);
die Signatur `sig-hausverwaltung` erfasst beide, eigene Prüfung und EU DSS 6.5 melden TOTAL_PASSED,
eine Änderung der Sicht nach der Signatur ist bei beiden HASH_FAILURE (04). epubcheck 5.4.0 meldet
für alle drei Container 0 Fehler (03). Kommandozeile: `hpro machine <datei>` (Prüfhülle),
`hpro machine write` (Nachrüsten).

**3. Test: Maschinensicht und Menschenansicht inhaltsgleich; Geschwärztes fehlt in beiden — erfüllt.**
`kern/test/machine.test.ts` liest die Menschenansicht unabhängig von der Ableitung des Kerns (DOM
mit den Sichtbarkeitsregeln eines Lesers) und vergleicht Wort für Wort in Reihenfolge, Tabellen
Zelle für Zelle samt Formel und Wert nach Neuberechnung, Formularwerte gegen Inhaltsdokument und
Datendatei nach dem Ausfüllen; nach dem Schwärzen fehlen Name und Telefonnummer in
`content/index.xhtml`, `machine/document.json` und `machine/document.md`, die Zahl der Platzhalter
stimmt mit der Menschenansicht überein. Verborgener Text (hidden, aria-hidden, display:none,
font-size:0, input type=hidden, Kommentar) steht in der Datei, aber in keiner der beiden Sichten.
Ein weiterer Test deckt den Tabellenimport ab (`hpro create *.xlsx`), dessen Manifest nach dem
Erzeugen `data` erhält. 13 von 13 Tests bestanden (06).

**4. Konformitätsprüfer meldet fehlende oder abweichende Maschinensicht — erfüllt.** Fehlende Sicht:
Warnung HPR-MACH-001; abweichender Tabellenwert, eingeschleuster Absatz: HPR-MACH-005 mit
JSON-Pointer, Adresse, gespeichertem und abgeleitetem Wert; Statusfeld: HPR-MACH-002 (Schema) und
-005; veränderte Markdown-Darstellung: HPR-MACH-006; Signatur ohne Sicht: HPR-MACH-008 (05). Die
öffentliche Testsuite hat 13 Fälle dazu, alle bestanden (06). Die Prüfhülle verwendet eine
abweichende Sicht nicht (`status.used: abgeleitet`), der eingeschleuste Satz erreicht sie nicht.

**5. Sprachmodell-Stichprobe — erfüllt (Stichprobe, keine Statistik).** Werkzeug: `claude -p`
(Claude Code 2.1.287, Modell laut Antwort `claude-opus-5-5`), ohne Werkzeuge und ohne Sitzung, jede
Frage einzeln, fester Systemhinweis. Bewertung automatisch über Muster, die Antworten stehen
wörtlich in 07 und `berichte/sprachmodell.json`; die SHA-256 der befragten Dateien stimmen mit den
abgelegten Containern überein (07).

| Material | Fragen | richtig |
|---|---|---|
| A Prüfhülle mit Sicht als Markdown (signiertes Beispiel) | 14 | 14 |
| B Prüfhülle mit Sicht als JSON (signiertes Beispiel) | 14 | 14 |
| C Variante „versteckt“, naive Textextraktion des XHTML | 4 | 2 |
| D Variante „versteckt“, Prüfhülle als Markdown | 4 | 4 |

Die Fragen decken Mängelzahl, Summe und Formel der Kostentabelle, Zusammensetzung eines Betrags,
Frist, Alternativtext der Abbildung, Messwerte, geschwärzte Angaben (das Modell nennt sie als
geschwärzt, keinen Namen), Signaturstatus mit Quelle (aus der Prüfhülle), Exportsperre, Anmerkung
mit Urheberin und eine sichtbare zitierte Aufforderung ab (als Zitat erkannt). Die Kontrolle C zeigt,
wogegen die Sicht schützt: aus der naiven Extraktion übernimmt das Modell verborgenen Text in die
Antwort (den „Kostenrahmen intern 25.000 €“, die verborgene Anweisung wird erwähnt, wenn auch nicht
befolgt); mit der Prüfhülle derselben Datei (D) kommt nichts davon vor, und der fehlende Signatur-
status wird richtig als „nicht signiert“ beantwortet. Grenzen: ein Modell, ein Dokument, je Frage
ein Lauf. Die Stichprobe lief in dieser Sitzung zweimal auf zwei unabhängig gebauten und
signierten Fassungen des Beispiels, beide Male mit demselben Ergebnis; abgelegt ist der zweite Lauf.
Andere Modelle und eine statistische Wiederholung sind nicht geprüft.

**6. Belege unter docs/belege/S9/ — erfüllt** (diese Dateien).

## Rückgabecodes in den Belegen

`hpro check` gibt 3 („unbestimmt“) zurück, wenn keine Befunde vorliegen, aber Regeln mangels
Browser-Engine nicht geprüft werden konnten (HPR-INH-004/006/022); 1 bei Befunden. In 05 sind die
Rückgabecodes 1 gewollt: es sind die absichtlich fehlerhaften Varianten. `grep -c` mit Ergebnis 0
und Rückgabe 1 belegt, dass der verborgene Text nicht in der Prüfhülle steht.
