# Belege P15 – Interaktive Inhalte und Animation

**Stand:** 12.10.2026 · **Erzeugt mit:** `scripts/belege-p15.sh` (alle Dateien dieses Ordners
außer dieser) · **Ziel:** Zusage 2 aus [`docs/10`](../../10-anspruch-und-funktionsprofil.md):
deklarierte Komponenten in der Sandbox, Video und Ton, Animation, reduzierte Bewegung,
statisches Äquivalent ohne Skripte; der Kern setzt die Regeln durch.

## Was gebaut wurde

| Teil | Ort | Inhalt |
| --- | --- | --- |
| Regeln im Kern | `kern/src/live/` | `planComponents` (welche Komponente läuft, sonst warum nicht), `frameCsp` (CSP ohne Netzquelle, Skripte nur per Hash), `checkSandbox`, `DataChannel` (Teil 1 Abschnitt 8), `saveDataChanges`; `createContainer` nimmt `components` und `data` an |
| Reader | `app/frame.html`, `app/src/frame-host.ts`, `render.ts`, `frame-agent.js`, `main.ts` | Rahmenhalter mit Dokumentrahmen (`sandbox="allow-scripts"`), geprüfte Komponenten als Inline-Skript mit Hash in der CSP, privater Port für den Agenten, Datenkanal, „Daten speichern“, Bewegungssteuerung, Einstellungen „Bewegung“ und „Lebendige Inhalte ausführen“, Abbruch bei Verlassen des Rahmens |
| Beispiel | `docs/spezifikation/beispiele/p15-lebendig/` → `app/dist/lebendig.hpro` | Zeitraffer-Video (WebM/VP9, 8 s) mit Standbild und Beschreibung, CSS-animierter Ablaufplan mit Regel für reduzierte Bewegung, Ton (MP3, 1,6 s) mit Beschreibung, Komponente `hp-chart@0.1.0` mit Bild und Tabelle als statischem Äquivalent und Datei `data/diagramm.json` mit Schema |
| Medien | `scripts/p15-medien.sh` | erzeugt Video, Standbild und Ton mit ffmpeg (eingecheckt; der Build braucht ffmpeg nicht) |

## Abnahmekriterien

| # | Kriterium | Ergebnis | Beleg |
| --- | --- | --- | --- |
| 1 | Ein Test weist nach, dass eine Komponente in der Sandbox keinen Netzwerkzugriff erreicht | **erfüllt** | `04-browsertests.txt` (Test 9), `messungen/08-netz.json` |
| 2 | Beispieldokument mit Animation und Video rendert; ohne Skripte bleibt ein statisches Äquivalent vollständig lesbar | **erfüllt** | `04-browsertests.txt` (Tests 1–3), `messungen/01-darstellung.json`, `messungen/02-ohne-skript.json`, `bilder/01…04`, `06-pruefer-epubcheck.txt` |
| 3 | Systemeinstellung für reduzierte Bewegung wird respektiert | **erfüllt** | `04-browsertests.txt` (Tests 4–6), `messungen/03-reduziert-system.json`, `04-kontrolle-und-anhalten.json`, `05-reduziert-reader.json`, `bilder/05-reduziert-system.png` |
| 4 | Belege mit wörtlichen Ausgaben unter `docs/belege/P15/` | **erfüllt** | dieser Ordner; Prüfung wie der Läufer in `08-laeufer-pruefung.txt` |

### 1 – Kein Netz aus der Sandbox

Eine Testkomponente `x-pruef-netz` (deklariert, Hash geprüft, läuft im Reader) versucht `fetch`,
`XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, Bild, Skript, Stylesheet, Prefetch,
`@import`, `@font-face`, eingebetteten Rahmen, Formularversand, neues Fenster, Navigation der
Hülle und zuletzt das Wegnavigieren des eigenen Rahmens. Ziel ist ein zählender HTTP-Server auf
127.0.0.1 (anderer Port als der Reader), beobachtet 60 Sekunden.

- **Positive Kontrolle:** derselbe Code in einer gewöhnlichen Seite erreicht den Server
  (`kontrolle.anfragen: 14`, `verbindungen: 7` – darunter `GET /fetch`, `UPGRADE /ws`,
  `POST /beacon`, `POST /formular`). Die Messung sieht also Anfragen, wenn es welche gibt.
- **In der Sandbox:** `anfragenAmZiel: 0`, `verbindungenAmZiel: 0`,
  `abgeschlosseneAnfragenDesBrowsers: []`, `popups: []`. Chromium legt für einige Versuche ein
  Anfrageobjekt an und bricht es vor dem Senden ab; diese stehen mit Grund in
  `abgebrocheneAnfragenDesBrowsers` (alle `→ csp`). Die Konsolenmeldungen in `cspMeldungen`
  nennen die greifende Direktive (`connect-src 'none'`, `img-src data:`, `frame-src 'none'`, …)
  bzw. die Sandbox (`allow-forms`, `allow-popups`, `allow-top-navigation` fehlen).
- Speicher außerhalb des Dokuments: `localStorage`, `indexedDB` → `SecurityError` (auch in
  `messungen/06-datenkanal.json`: `localStorage`, `sessionStorage`, `indexedDB`, `cookie`
  blockiert).
- **Befund und Abhilfe:** Ein Sandbox-Rahmen darf sich selbst navigieren. Die Navigation wird
  blockiert (kein Netz), aber der Rahmen zeigt dann eine Fehlerseite statt des Dokuments. Der
  Rahmenhalter meldet jedes weitere `load` des Dokumentrahmens; der Reader beendet daraufhin
  die Komponenten und zeigt das Dokument statisch (`danach: "Komponente beendet, statische
  Fassung"`). Der Test prüft das.

Dazu im Kern (`01-kern-live-tests.txt`): die CSP enthält keine Netzquelle und keine
`'unsafe-eval'`; `sandbox` mit jedem weiteren Token wird abgelehnt; der Datenkanal beantwortet
den Testfall von HPL-SBX-008 in der erwarteten Reihenfolge (`ok`, `schema-invalid`,
`path-not-declared`, `path-invalid`, `path-invalid`, `too-large`, `rate-limited` ab der 101.
Nachricht, `unknown-message`).

### 2 – Darstellung und statisches Äquivalent

- Mit Skripten (`messungen/01-darstellung.json`): Komponente läuft (`status: bereit`), Video
  spielt stumm, 5 CSS-Animationen laufen, der Ton steht (`paused: true`, kein Autoplay mit Ton),
  das Diagramm zeigt die Tabellenwerte. Rahmen: `sandbox: "allow-scripts"`, CSP mit genau zwei
  Hashes (Agent, `hp-chart`).
- Ohne Skripte (`messungen/02-ohne-skript.json`): derselbe Container entpackt und in Chromium mit
  abgeschaltetem JavaScript geöffnet, ohne Reader. `scriptsRan: false`; alle 18 Werte und
  Bezeichnungen, die das Diagramm mit Skript in beiden Ansichten zeigt, stehen im statischen
  Äquivalent (`missingInStatic: []`); alle 15 Textblöcke (Überschriften, Absätze,
  Bildunterschriften) der lebendigen Fassung sind vorhanden (`textBlocksLost: []`); das statische
  Diagrammbild ist geladen, das Video hat sein Standbild. Ganzseitenbild:
  `bilder/03-ohne-skript-ganzseite.png`.
- Im Reader mit „Lebendige Inhalte ausführen“ aus: statisches Äquivalent mit Hinweis
  „Komponente hp-chart nicht ausgeführt (lebendige Inhalte sind im Reader abgeschaltet)“
  (`bilder/04-reader-statisch.png`).
- Veränderte Komponente (ein Kommentar im Skript ergänzt): läuft nicht, Hinweis „Komponente
  verändert: SHA-256 der Skriptdatei weicht von integrity ab“, Tabelle sichtbar
  (`messungen/07-komponente-veraendert.json`).
- Konformitätsprüfer (`06-pruefer-epubcheck.txt`): 0 Fehler, 0 Warnungen; Exit-Code 3
  („unbestimmt“), weil 7 Regeln eine Browser-Engine brauchen, die der Prüfer nicht hat (u. a.
  HPR-INH-022, HPR-SBX-012, HPR-SBX-015). epubcheck 5.4.0: keine Fehler oder Warnungen.

### 3 – Reduzierte Bewegung

Emuliert wird die Systemeinstellung mit Playwright (`reducedMotion: 'reduce'`, CDP-Emulation der
Media-Query); 10 Sekunden warten wie in HPR-SBX-012.

| Fall | `prefers-reduced-motion` im Rahmen | `ready.reducedMotion` (Komponente) | Animationen | Video | Beleg |
| --- | --- | --- | --- | --- | --- |
| System „reduzieren“ | `true` | `reduziert` | 0 (`getAnimations()` leer) | steht bei 0 s | `03-reduziert-system.json` |
| Kontrolle ohne Einstellung | `false` | `erlaubt` | 5 laufend | spielt | `04-kontrolle-und-anhalten.json` |
| „Bewegung anhalten“ (WCAG 2.2.2) | `false` | – | 0 laufend (5 pausiert) | angehalten | `04-kontrolle-und-anhalten.json` |
| Reader-Einstellung „immer reduzieren“ | `false` | `reduziert` | 0 | steht bei 0 s | `05-reduziert-reader.json` |

## Bauentscheidung Rahmenhalter (`03-rahmen-messung.txt`)

Gemessen in Chromium 156: `srcdoc`-, `data:`- und `blob:`-Rahmen erben die CSP der Hülle (ein
per Hash erlaubtes Skript wird blockiert, weil die Hülle nur `'self'` erlaubt); ein navigierter
Rahmen nicht. Ein navigierter Rahmen mit `sandbox="allow-scripts"` wird offline nicht vom Service
Worker bedient, einer ohne `sandbox` schon. Daraus der Aufbau: Hülle → Rahmenhalter `frame.html`
(gleiche Herkunft, vom Service Worker offline geliefert, CSP ohne Netzquelle, aber ohne
Einschränkung von Inline-Skripten) → Dokumentrahmen (`srcdoc`, Sandbox, CSP nur mit Hashes).
Die beiden Richtlinien gelten zusammen; die Konsole in `messungen/08-netz.json` zeigt beide
greifen (`script-src 'self' 'unsafe-inline'` und `script-src 'sha256-…'`). Die bestehenden
Tests von P4 und P19 (Offline-Start eingeschlossen) laufen mit dem neuen Aufbau
(`07-npm-test.txt`).

## Mechanische Prüfung des Läufers (`08-laeufer-pruefung.txt`)

Der vorige Versuch fiel bei der Nachprüfung durch: `npm ci` endete mit Exit 217
(`ENOTEMPTY: directory not empty, rmdir '…/node_modules/@rolldown/binding-linux-x64-gnu'`),
danach fehlte `tsc` und `npm test` endete mit Exit 127. Ursache war kein Fehler im Code: ein
während der Arbeit von Hand gestarteter `vite preview` (Port 4318) lief weiter und hielt die
native rolldown-Bibliothek offen. Auf dem Volume `/opt/data` (`fuse.shfs`) wird eine gelöschte,
noch geöffnete Datei zu `.fuse_hidden…`, also bleibt das Verzeichnis nicht leer. Nach dem Beenden
des Prozesses verschwand die Datei.

`scripts/belege-p15.sh` führt deshalb als Teil 8 die Prüfung des Läufers wörtlich aus
(`npm ci --no-audit --no-fund`, dann `npm test --if-present`) und listet davor und danach
Prozesse, die `node_modules` offen halten könnten. Ergebnis: vorher und nachher „(keine)“,
`npm ci` Exit 0, `npm test` Exit 0 (Kern 486/486, Vitest 32/32, Playwright 45 bestanden).

## Nicht geprüft

- **WebRTC und DNS-Vorabauflösung** (HPL-SBX-003 nennt beide): nicht in diesem Paket geprüft.
  CSP regelt WebRTC nicht; ob ein Sandbox-Rahmen darüber Pakete senden kann, ist offen und muss
  mit einer eigenen Maßnahme (z. B. Webview-Einstellung der Hülle, P11) und einem Test geklärt
  werden.
- **Echte Betriebssystem-Einstellung** „Bewegung reduzieren“: geprüft ist die emulierte
  Media-Query (headless Chromium hat keine Systemeinstellung); dass Hüllen die Einstellung an
  eingebettete Rahmen weitergeben (HPL-SBX-011, Begründung), ist für Tauri/WebView2/WebKit nicht
  geprüft (P11, P13).
- **Firefox und WebKit:** nur Chromium (P13).
- **HPL-SBX-009** (DOM-Änderung außerhalb der Komponente, Fokusraub) und **HPL-SBX-010**
  (blockierender Hauptthread): nicht umgesetzt; geschützt ist nur der Fall „Rahmen verlassen“.
  Der Agent und die Komponenten teilen sich ein Fenster; eine Komponente kann Text außerhalb
  ihres Elements ändern. Das Sicherheitsmodell trägt das bisher nur über die Signatur der
  eingefrorenen Fassung, in der keine Komponente läuft.
- **HPL-SBX-004/-005** (Berechtigungen, Hüllenbrücken) und **HPL-SBX-001** mit allen Aufrufen
  der Liste: nur teilweise (Popup, Formular, Navigation der Hülle im Netztest); die Web-App hat
  keine Brücke, die Hüllen kommen mit P11/P12.
- **Ohne Reader geöffnet** startet das stumme Video in einem gewöhnlichen Browser von selbst
  (Autoplay des Browsers); reduzierte Bewegung durchzusetzen ist dort Sache des Browsers bzw.
  des EPUB-Lesesystems.
- Speichern, wenn in derselben Sitzung Tabelleneingaben (P19) **und** Datenänderungen (P15)
  vorliegen: beide Wege speichern getrennt; der jeweils andere Stand geht dabei verloren.
- Die Komponente `hp-chart` ist im Register (Teil 2) noch ohne Release-Eintrag; die
  Veröffentlichung von `hp-chart@0.1.0` mit Hash ist eine Governance-Entscheidung.
