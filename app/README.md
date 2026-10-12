# html-Pro Reader (Web-App, Paket P4)

Clientseitige Web-App (Vite, TypeScript), die html-Pro-Container öffnet und liest. Sie läuft ohne
Server und ohne Konto; nach dem ersten Aufruf startet sie auch offline (PWA mit Service Worker).

## Befehle

```sh
npm run dev -w app        # Entwicklungsserver (ohne CSP und ohne Service Worker)
npm run build -w app      # Typprüfung und Produktionsbuild nach app/dist/
npm test -w app           # Typprüfung, Unit-Tests (vitest), Build, E2E-Tests (Playwright)
npm run belege -w app     # Screenshots, Messungen und axe-Ergebnis nach docs/belege/P4/
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

## Aufbau und Sicherheitsmodell

```
src/main.ts          Oberfläche: Öffnen, Inhaltsverzeichnis, Suche, Ansicht, Zoom, Dialoge, Tastatur
src/document.ts      Container öffnen über den Kern (readContainer), Inhaltsdokumente, Inhaltsverzeichnis
src/render.ts        HTML des Dokumentrahmens (srcdoc): CSP, Ressourcen als data:-URLs, Suchmarken
src/frame-agent.js   einziges Skript im Dokumentrahmen: Position, Sprünge, Seitenansicht, Verweise, Tasten
src/frame.css        Stil im Rahmen: Umfließen, Treffer, gestapelte Tabellen, A4-Seiten
src/search.ts        Textmodell und Suche (gleiche Zählung im Quell-DOM und im Rahmen)
src/settings.ts      Leseeinstellungen und Zoomstufen
src/shortcuts.ts     Tastenkürzel
src/sw.ts            Service Worker: hält die App-Hülle im Cache (Liste wird beim Build eingesetzt)
sample/              Quelle des Beispieldokuments; der Build erzeugt daraus dist/beispiel.hpro
```

- Das Dokument läuft in einem `iframe` mit `sandbox="allow-scripts"` ohne `allow-same-origin`,
  also mit opaker Herkunft (HP-SBX-005). Die Oberfläche greift nicht auf sein DOM zu, sondern
  spricht mit dem Rahmen nur über `postMessage`.
- Der Rahmen bekommt eine eigene CSP ohne jede Netzquelle (`default-src 'none'`,
  `connect-src 'none'`); Bilder, Medien und Schriften kommen als `data:`-URLs aus dem Container.
  Erlaubt ist genau ein Skript: der Frame-Agent, per SHA-256-Hash. Die Hülle trägt denselben
  Hash in ihrer CSP, weil `srcdoc`-Rahmen die Richtlinie der Hülle erben.
- Skripte, Ereignis-Attribute, `javascript:`-URLs, `base` und `meta refresh` des Dokuments werden
  vor der Darstellung entfernt. Komponenten des Profils „Lebendig“ werden in dieser Version
  **nicht** ausgeführt; sichtbar ist ihr statisches Äquivalent.

## Grenzen dieser Version

- Signaturen werden nicht geprüft; der Info-Dialog nennt nur vorhandene Signaturdateien.
  Die Integrität (SHA-256 aus `manifest.json`) wird geprüft und angezeigt.
- Die Seitenansicht verwendet dieselbe Seitenbox und dieselben Umbruchregeln wie das
  Druckprofil, aber keine Druck-Engine; dass ihre Umbrüche mit einem PDF-Ausdruck übereinstimmen
  (HP-PRINT-014), ist nicht geprüft (Druckweg ist Paket P18). Blöcke, die höher als eine Seite
  und weder Tabelle noch Liste sind, laufen über den Seitenrand hinaus.
- Je Ansicht wird ein Inhaltsdokument gezeigt; Seitenzahlen zählen je Inhaltsdokument.
- Prioritätsblöcke (`data-hp-priority`), Anhänge (`manifest.json#attachments`), Anmerkungen und
  Vorlesen fehlen noch (Pakete P16, P7).
- Getestet ist nur Chromium; Firefox und WebKit folgen mit P13.
