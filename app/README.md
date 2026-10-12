# hpro Reader (Web-App, Paket P4)

Clientseitige Web-App (Vite, TypeScript), die hpro-Container öffnet und liest. Sie läuft ohne
Server und ohne Konto; nach dem ersten Aufruf startet sie auch offline (PWA mit Service Worker).

## Befehle

```sh
npm run dev -w app        # Entwicklungsserver (ohne CSP und ohne Service Worker)
npm run build -w app      # Typprüfung und Produktionsbuild nach app/dist/
npm test -w app           # Typprüfung, Unit-Tests (vitest), Build, E2E-Tests (Playwright)
npm run belege -w app     # Screenshots, Messungen und axe-Ergebnis nach docs/belege/P4/
npm run belege:p18 -w app # Ausdrucke (PDF, Druckfassung, Bericht) nach docs/belege/P18/pdf/
npm run icons -w app      # PNG-Icons aus public/icons/icon.svg neu rendern
```

Die E2E-Tests laufen gegen den Produktionsbuild (`vite preview` auf 127.0.0.1:4317, Playwright
startet und beendet den Server selbst). Der Browser liegt unter `app/.browsers/` (nicht
eingecheckt); `npm run e2e` installiert dort Chromium Headless Shell, falls er fehlt.

## Funktionen

| Funktion | Umsetzung | Anforderung |
| --- | --- | --- |
| Öffnen | Dateiauswahl, Ziehen und Ablegen, „Beispiel öffnen“, installierte PWA über `file_handlers` (Chrome/Edge) | HP-RS-001 |
| Fließende Ansicht (Vorgabe) | Dokument passt sich der Breite an; Tabellen in eigenem Scrollbereich oder gestapelt (`data-hp-table`) | HP-RS-010, HP-INH-010 |
| Seitenansicht | A4, 15 mm Rand, Kopfzeile mit Titel, Fußzeile „Seite n von N“, Umbrüche zwischen Blöcken, Tabellenkopf wiederholt; auf schmalen Bildschirmen verkleinert | HP-PRINT-002/-003/-006, HP-PRINT-014 |
| Inhaltsverzeichnis | aus dem Navigationsdokument, sonst aus den Überschriften; aktueller Abschnitt markiert | HP-ADR-007 |
| Suche | Volltext über alle Inhaltsdokumente, auch in zugeklappten `details`; Treffer mit Adresse, Sprung öffnet das `details` | HP-RS-003 |
| Zoom | fließend: Textgröße 50–300 % über `--hp-font-size`; Seitenansicht: Skalierung der Seite | HP-RS-002, HP-INH-004 |
| Darstellung | Zeilenhöhe, Buchstaben-, Wort- und Absatzabstand, Farbschema hell/dunkel/hoher Kontrast | HP-RS-002 |
| Adressen | Kurz- und Langform des aktuellen Abschnitts kopieren, Adresse eingeben und anspringen | HP-ADR-003, HP-ADR-005 |
| Verweise | interne Verweise im Reader, externe erst nach Anzeige der URL in neuem Fenster | HP-RS-009 |
| Tastatur | alle Funktionen per Tastatur; Einzeltasten-Kürzel abschaltbar (`?` zeigt die Liste) | HP-RS-004, WCAG 2.1.4 |
| Lebendige Inhalte (P15) | geprüfte Komponenten in der Sandbox, Datenkanal, „Daten speichern“; abschaltbar unter „Darstellung“ | HP-SBX-001 bis -008, -010, -011, -013, -014 |
| Bewegung (P15) | reduzierte Bewegung nach System oder Einstellung, „Bewegung anhalten“ in der Statusleiste | HP-INH-014, HP-SBX-014 |
| Sperren (P17) | Leiste „Sperren“: Regeln der angezeigten Fassung und ob eine gültige Signatur sie deckt; `hidden` ausgeblendet mit Hinweis und „Einblenden“, Suche nennt ausgeblendete Treffer; `no-print` und `hidden` werden nicht gedruckt (Hinweis an ihrer Stelle); in `read-only`-Abschnitten keine Eingabezellen | HP-LOCK-003, -005, -006, HPL-LOCK-003 |
| Drucken (P18) | „Drucken“, Taste `p` oder Strg+P: Druckfassung aller Inhaltsdokumente aus der fließenden Ansicht (`print.ts`), in einem verborgenen Rahmen auf Satzbreite gesetzt, Seitenzahlen per Mehrspaltensatz vorhergesagt (`paginate.ts`), dann Druckdialog des Browsers. A4, Ränder 22/20/20 mm, Kopfzeile Titel und Stand, Fußzeile „Seite n von N“; Titelblock mit Kennung und dateModified; Verzeichnis mit `#kennung` und Seite; Überschriften h1–h3 mit `#kennung`; interne Verweise „(S. n, #kennung)“, externe mit URL; Tabellenkopf auf jeder Seite, Zeilen ungeteilt; Codezeilen umbrochen mit „↩“; Video, Ton, Animation und Komponenten als Standbild bzw. statische Fassung mit „Lebendige Fassung: pfad#kennung“; `details` offen, alle Prioritäten; `no-print`/`hidden` weggelassen mit Hinweis | HP-PRINT-001 bis -011, HP-LOCK-003 |
| Versiegelte Abschnitte (P17) | Platzhalter aus der Datei; „Entsiegeln …“ fragt das Kennwort und entschlüsselt nur im Speicher (nichts wird gespeichert, nach erneutem Öffnen wieder versiegelt) | Antrag HPC-0007 |
| Bearbeiten (P5) | Leiste „Bearbeiten“: Blockstruktur des Dokuments; Text und Auszeichnung (fett, kursiv; Fußnotenverweise und Schwärzungen bleiben unantastbar), Überschriftenebene, neuer Block danach (Absatz, Überschrift, Abschnitt, Listen, Listenpunkt, Tabelle), verschieben, löschen, einrücken/ausrücken, Tabellenzeilen und -spalten, Fußnote, Querverweis, Alternativtext; jede Änderung sofort im Dokumentrahmen, „Rückgängig“; „Speichern“ lädt eine neue Datei mit Verlaufseintrag herunter und öffnet sie. Abgelehnte Änderungen (toter Verweis, Überschriftensprung, Sperre) mit Begründung | Zusage 4, Antrag HPC-0008 |
| Verlauf (P5) | Dialog „Verlauf“: Fassungen der Datei mit Prüfung der Hashkette (byte-genau, nach Redaktion neu geschrieben, Abweichung), frühere Fassung als eigene Datei öffnen, zwei Fassungen vergleichen (Wortunterschied mit `del`/`ins`), Vergleich als XHTML herunterladen | HPC-0008 |
| Schwärzen (P5) | „Schwärzen …“: gewählter Block und/oder Begriffe werden aus der Datei und allen früheren Fassungen gelöscht, Grund ins Protokoll `data/redaction-log.json`; Nachprüfung mit 0 Treffern ist Bedingung; Platzhalter erscheinen als Balken (auch im Druck) | HP-LOCK-007, -008 |
| Formulare (P6) | Formulare des Dokuments ausfüllen: berechnete Felder rechnen beim Tippen, Abschnitte erscheinen nach ihrer Bedingung, Meldungen am Feld nach dem Verlassen, „Eingaben prüfen“ mit Zusammenfassung; „Absenden“ nur ohne Fehler: lädt die abgesendete Datei und die Daten (JSON, gegen das Schema geprüft) herunter und öffnet die abgesendete Datei; „Entwurf speichern“, „Daten exportieren (JSON)“; „Drucken“ zeigt die Felder als Text | Antrag HPC-0009 |
| Anmerkungen (P7) | Leiste „Anmerkungen“: Kommentar zu einer markierten Textstelle oder zum aktuellen Abschnitt (ohne Maus), Hervorhebung in vier Farben, Freihand am Element (Koordinaten relativ zum Element, mit der Maus oder dem Stift), Threads mit Antworten, „Erledigt“/„Wieder öffnen“ (als Antwort mit `hp:status`), Filter offen/erledigt, Löschen in zwei Schritten; Markierungen und nummerierte Knöpfe im Text, Klick öffnet den Thread; verschobene und verwaiste Anmerkungen werden benannt. „Speichern“ lädt eine neue Datei herunter (vorhandene Anmerkungsdateien bleiben byte-gleich; bei signiertem `manifest.json` außerhalb der Signatur als „nicht signiert“); Export JSON-LD, CSV, Bericht (XHTML); Import aus einem Export oder einer zweiten Kopie; im Verlauf „Mit anderer Datei vergleichen …“ mit Textänderungen und betroffenen Threads | Antrag HPC-0010 |

## Aufbau und Sicherheitsmodell

```
src/main.ts          Oberfläche: Öffnen, Inhaltsverzeichnis, Suche, Ansicht, Zoom, Dialoge, Tastatur
src/document.ts      Container öffnen über den Kern (readContainer), Inhaltsdokumente, Inhaltsverzeichnis
src/render.ts        HTML des Dokumentrahmens (srcdoc): CSP, Ressourcen als data:-URLs, Suchmarken
src/frame-agent.js   einziges Skript im Dokumentrahmen: Position, Sprünge, Seitenansicht, Verweise, Tasten
src/frame.css        Stil im Rahmen: Umfließen, Treffer, gestapelte Tabellen, A4-Seiten
src/search.ts        Textmodell und Suche (gleiche Zählung im Quell-DOM und im Rahmen)
src/locks.ts         Sperren im Rahmen anwenden, versiegelte Abschnitte im Speicher öffnen (P17)
src/editor.ts        Bearbeiten, Verlauf/Vergleich, Schwärzen über den Kern (edit, lock); Eingabefeld nur über Positivliste (P5)
src/formview.ts      Formulare über den Kern (form): Sitzung in der Hülle, Markierung der Rahmenkopie (P6)
src/annotations.ts   Anmerkungen über den Kern (annotate): Sitzung, Leiste, Speichern, Export/Import, Vergleich (P7)
src/settings.ts      Leseeinstellungen und Zoomstufen
src/shortcuts.ts     Tastenkürzel
src/sw.ts            Service Worker: hält die App-Hülle im Cache (Liste wird beim Build eingesetzt)
frame.html           Rahmenhalter (P15): gleiche Herkunft, enthält den Dokumentrahmen
src/frame-host.ts    leitet Nachrichten zwischen Hülle und Dokumentrahmen weiter, meldet Verlassen
sample/              Quelle des Beispieldokuments; der Build erzeugt daraus dist/beispiel.hpro
```

Weitere Beispiele des Builds: `dist/kostenschaetzung.hpro` (P19), `dist/lebendig.hpro` (P15,
Quelle `docs/spezifikation/beispiele/p15-lebendig/`: Video, Animation, Ton, Komponente `hp-chart`)
und `dist/sperren.hpro` (P17, Quelle `docs/spezifikation/beispiele/p17-sperren/`: Sperren,
Abschnitt `#bewertung` versiegelt mit dem Beispielkennwort `Bauamt-Beispielort-2026!`, signierte
eingefrorene Fassung mit einem beim Build erzeugten Testschlüssel) und `dist/bearbeiten.hpro`
(P5, Quelle `docs/spezifikation/beispiele/p5-bearbeiten/`, einmal mit dem Kern gespeichert, also mit
Verlaufsjournal und zwei Fassungen) sowie `dist/antrag.hpro` (P6, Quelle
`docs/spezifikation/beispiele/p6-antrag/`: Finanzierungsanfrage mit Berechnung, Bedingungen,
Prüfregeln und JSON-Schema) und `dist/anmerkungen.hpro` (P7, Quelle
`docs/spezifikation/beispiele/p7-review/`: Leistungsbeschreibung mit einer Prüfrunde aus Kommentaren,
Hervorhebungen, Freihand, Antworten und einem erledigten Thread).

- Das Dokument läuft in einem `iframe` mit `sandbox="allow-scripts"` ohne `allow-same-origin`,
  also mit opaker Herkunft (HP-SBX-005). Dieser Dokumentrahmen liegt im Rahmenhalter
  `frame.html` (P15). Grund: Ein `srcdoc`-, `data:`- oder `blob:`-Rahmen erbt die CSP der Hülle,
  und die kann die Hashes der Komponenten eines später geöffneten Dokuments nicht kennen; ein
  navigierter Rahmen mit opaker Herkunft wird dagegen offline nicht vom Service Worker bedient
  (gemessen: `scripts/p15-rahmen-messung.mjs`, `docs/belege/P15/03-rahmen-messung.txt`). Der
  Rahmenhalter hat gleiche Herkunft, enthält keinen Dokumentinhalt und sperrt selbst schon jede
  Netzquelle; nur Inline-Skripte schränkt er nicht ein, das tut die CSP des Dokumentrahmens.
- Der Dokumentrahmen bekommt eine eigene CSP ohne jede Netzquelle (`default-src 'none'`,
  `connect-src 'none'`, Kern: `live.frameCsp`); Bilder, Medien und Schriften kommen als
  `data:`-URLs aus dem Container. Erlaubt sind per SHA-256-Hash der Frame-Agent und die
  Komponenten, deren Skript der Kern geprüft hat (`live.planComponents`: Profil `interactive`,
  gültiger Manifesteintrag, Hash wie `integrity`; HP-SBX-010). Beide Richtlinien gelten.
- Skripte, Ereignis-Attribute, `javascript:`-URLs, `base` und `meta refresh` des Dokuments werden
  vor der Darstellung entfernt; geprüfte Komponenten kommen als Inline-Skript mit genau dem
  geprüften Text hinter den Agenten. Komponenten, die nicht laufen (verändert, fehlend, nicht
  deklariert, abgeschaltet, Profil `static`, eingefrorene Fassung), zeigen ihr statisches
  Äquivalent mit einem Hinweis (HP-SBX-011).
- Der Agent spricht mit der Hülle über einen privaten `MessagePort`, den er vor allen Komponenten
  mit einem Ladetoken übergibt; Komponenten können nicht in seinem Namen sprechen. Ihre
  Nachrichten an `parent` gehen an den Dokumentdaten-Kanal des Kerns (`live.DataChannel`,
  Teil 1 Abschnitt 8): nur deklarierte Pfade unter `data/`, Schema, 1 MiB, 100 Nachrichten je
  Sekunde, schreibgeschützt in eingefrorenen und signierten Fassungen. „Daten speichern“ schreibt
  die Änderung mit neuem `integrity` und Verlaufseintrag (`live.saveDataChanges`).
- Lädt der Dokumentrahmen etwas anderes als den übergebenen Inhalt (eine Komponente navigiert
  ihn weg; die Navigation selbst ist blockiert), beendet der Reader alle Komponenten des Dokuments
  und zeigt es statisch mit „Komponente beendet“.
- Bewegung: der Agent setzt `data-hp-motion` (`reduce` bei Systemeinstellung oder
  Reader-Einstellung „immer reduzieren“, `paused` nach „Bewegung anhalten“, sonst `run`); CSS-
  Animationen und Übergänge entfallen bzw. pausieren, Skriptanimationen werden beendet bzw.
  angehalten, Autoplay gibt es nur stumm und nur bei `run`, Medien ohne Nutzeraktion mit Ton
  werden angehalten (HP-INH-013, HP-INH-014, HP-SBX-014). `ready.reducedMotion` geht an die
  Komponenten (HPL-SBX-011).

## Grenzen dieser Version

- Signaturen werden nicht geprüft; der Info-Dialog nennt nur vorhandene Signaturdateien.
  Die Integrität (SHA-256 aus `manifest.json`) wird geprüft und angezeigt.
- Die Seitenansicht (P4) ist noch nicht aus dem Druckweg (P18) abgeleitet: sie hat 15 mm Rand,
  zeigt ein Inhaltsdokument und bricht selbst um; der Ausdruck hat 22/20/20 mm, alle
  Inhaltsdokumente und die Umbrüche von Chromium. Gleiche Umbrüche wie der Ausdruck (HP-PRINT-014,
  Kann) liefert die Seitenansicht deshalb nicht. Blöcke, die höher als eine Seite und weder
  Tabelle noch Liste sind, laufen dort über den Seitenrand hinaus (im Ausdruck nicht).
- Drucken (P18): geprüft nur mit Chromium. Chromium druckt `target-counter()` nicht; die
  Seitenzahlen im Verzeichnis sind deshalb eine Vorhersage über den Mehrspaltensatz derselben
  Engine, mit dem Satzspiegel, den Chromium beim Drucken wirklich nutzt (643 × 964 px), und mit
  eingefügten Tabellenköpfen, weil nur gedruckte Seiten sie wiederholen (Messungen in
  docs/belege/P18/08). In den Tests stimmen alle Seitenzahlen und die Lage aller Ziele (±0,4 mm)
  mit den Sprungzielen des PDF überein; was der Mehrspaltensatz sonst anders umbricht als der
  Druck, ist nicht ausgeschlossen. Ein anderer Browser (Firefox, Safari) kann anders umbrechen; ob er die Randfelder
  (`@top-left`, `@bottom-right`) für Kopf- und Fußzeile druckt, ist nicht geprüft (P13). Der Ausdruck nimmt die
  gespeicherten Tabellenwerte, nicht ungespeicherte Eingaben (der Titelblock sagt das). Der
  Druckweg beansprucht kein PDF/A oder PDF/UA (veraPDF-Abweichungen in docs/belege/P18/);
  das ist Sache des PDF-Exports (P9).
- Je Ansicht wird ein Inhaltsdokument gezeigt; Seitenzahlen zählen je Inhaltsdokument.
- Prioritätsblöcke (`data-hp-priority`), Anhänge (`manifest.json#attachments`) und Vorlesen fehlen
  noch (Paket P16). Anmerkungen (P7): Freihand streckt sich mit dem Element und trifft nach einem
  Umbruch in anderer Breite nicht mehr genau dasselbe Wort; gleichzeitiges Arbeiten mehrerer
  Personen an einer Datei geht nur über Import (HPC-0010, offene Punkte).
- Getestet ist nur Chromium; Firefox und WebKit folgen mit P13.
