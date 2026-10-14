# 16 – Testmatrix, Cross-Engine-Suite und CI

**Projekt:** hpro · **Paket:** P13 · **Stand:** 14.10.2026
**Belege:** [`docs/belege/P13/`](belege/P13/README.md) · **Code:** Workflow
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml), Vergleichs-Spec
[`app/e2e/engines.spec.ts`](../app/e2e/engines.spec.ts), Projekte in
[`app/playwright.config.ts`](../app/playwright.config.ts), Skripte
[`scripts/p13-vergleich.mjs`](../scripts/p13-vergleich.mjs),
[`scripts/p13-epubcheck.mjs`](../scripts/p13-epubcheck.mjs),
[`scripts/ci-werkzeuge.sh`](../scripts/ci-werkzeuge.sh),
[`scripts/belege-p13.sh`](../scripts/belege-p13.sh)

---

## 1. Ergebnis

1. **Dieselbe Datei in drei Engines.** Die Suite öffnet vier Beispielcontainer über den Reader in
   Chromium 156, Firefox 157 und WebKit 27.2 (Playwright-Builds 1.64) und misst bei 320, 768 und
   1280 px. Lokal liefen alle 54 Fälle der Vergleichs-Spec grün
   ([01](belege/P13/01-engines-spec.txt)). Der Bericht stellt die Messungen, die Bildschirmfotos
   und die Pixeldifferenzen nebeneinander ([Vergleich](belege/P13/vergleich/vergleich.md),
   [HTML-Ansicht](belege/P13/vergleich/vergleich.html)).
2. **Was das Format zusagt, hält in allen drei Engines.** Bei 320, 768 und 1280 px gibt es kein
   waagrechtes Scrollen (HPR-INH-004, Zusage 1). Die Lesesystem-Variablen verdoppeln Schrift und
   Zeilenhöhe (HPR-INH-006). Der Dokumentrahmen hat die Origin `null`. Die A4-Seite misst 794 × 1123 px.
   Ein Rahmen, der sich selbst wegnavigiert, erreicht in keiner Engine das Netz.
3. **Echte Engine-Unterschiede sind gemessen, nicht nur behauptet** (Abschnitt 4). Der folgenreichste
   ist **U1**: `break-after: avoid` hält in der Spalten-Fragmentierung nur Chromium ein. Darauf baut
   die Druckvorhersage des Readers. In Firefox steht deshalb im Druck eine Überschrift allein am
   Seitenende. Die Seitenansicht (Umbrüche per Skript) bricht dagegen in allen drei Engines an
   denselben Stellen um.
4. **CI.** Der Workflow hat fünf Jobs: Build, `npm test`, epubcheck über 42 Container,
   Engine-Matrix und Vergleichsbericht. actionlint findet keinen Fehler
   ([06](belege/P13/06-actionlint.txt)). Jeder Job-Schritt lief lokal mit denselben Befehlen
   (Abschnitt 5.3). Ein Lauf auf GitHub ist **nicht belegt**, solange der Workflow nicht auf
   GitHub liegt. Der Paketauftrag verbietet das Pushen, das übernimmt der Läufer. Stand der Läufe:
   [07](belege/P13/07-ci-laeufe.txt).

---

## 2. Testmatrix

### 2.1 Jobs des Workflows

| Job | Läuft auf | Was | Werkzeuge | Ergebnis bei Fehler |
|---|---|---|---|---|
| `build` | ubuntu-24.04, Node 26 | `npm ci`, `npm run build` (Kern `tsc`, Reader `typecheck` + `vite build`), lädt `app/dist/*.hpro` als Artefakt `container` hoch | – | rot |
| `test` | ubuntu-24.04, Node 26 | `npm test` wie im Repo: Kern-Tests (`node --test`), Vitest, Chromium-E2E (Projekt `chromium`), Spezifikations-, Konformitäts-, Formel-, Governance- und Handbuch-Prüfer, Dienst-Test | JDK 21.0.12.1+1 und epubcheck 5.4.0 über [`ci-werkzeuge.sh`](../scripts/ci-werkzeuge.sh) mit denselben SHA-256-Summen wie [`prototyp/setup-tools.sh`](../prototyp/setup-tools.sh) | rot |
| `epubcheck` | ubuntu-24.04 | [`p13-epubcheck.mjs`](../scripts/p13-epubcheck.mjs) über die 33 „guten“ Fälle der Testsuite und die 9 Beispielcontainer des Builds; Bericht in die Job-Zusammenfassung | wie `test` | rot bei jedem unerwarteten FATAL, ERROR oder WARNING |
| `engines` (Matrix) | ubuntu-24.04, je Engine ein Job | `playwright install --with-deps <engine>`, dann Projekt `engine-<engine>` (Abschnitt 2.2), Messungen als Artefakt `engine-<engine>` | Playwright 1.64 | rot, Fehlerausgaben als Artefakt `engine-<engine>-fehler` |
| `vergleich` | ubuntu-24.04 | sammelt die drei Artefakte, [`p13-vergleich.mjs`](../scripts/p13-vergleich.mjs) erzeugt den Bericht, Tabellen in die Job-Zusammenfassung, Bericht als Artefakt `engine-vergleich` | Chromium für die Pixeldifferenzen | rot, wenn eine Engine keine Messung geliefert hat |

Auslöser sind Push auf `main`, Pull-Requests und der Start von Hand (`workflow_dispatch`).
Die Rechte stehen auf `contents: read`. Ein neuer Lauf auf demselben Ref bricht den alten ab.

### 2.2 Specs × Engines

„CI“ heißt: Das Projekt `engine-<engine>` läuft im CI-Umfang (Standard von `ENGINE_SPECS` in
[`playwright.config.ts`](../app/playwright.config.ts)). „Vollauf“ heißt: nur mit `P13_VOLL=1`, damit
die bekannten Unterschiede als Fehlschläge sichtbar bleiben, ohne die CI zu blockieren. „chromium“
ist das Projekt aus `npm test`.

| Spec | Fälle | `chromium` (npm test) | Chromium | Firefox | WebKit | Grund für die Einschränkung |
|---|---|---|---|---|---|---|
| `engines.spec.ts` (P13) | 18 | – | CI | CI | CI | – |
| `reader.spec.ts` | 15 | ja | CI | CI | CI | – (Toleranz von 1 px an der Seitenoberkante, U4) |
| `tabellen.spec.ts` | 6 | ja | CI | CI | CI | – |
| `formulare.spec.ts` | 5 | ja | CI | CI | CI | – |
| `sperren.spec.ts` | 4 | ja | CI | CI | CI | – |
| `bearbeiten.spec.ts` | 3 | ja | CI | CI | CI | – |
| `a11y.spec.ts` | 13 | ja | CI | CI | CI | – |
| `druck.spec.ts` | 6 | ja | Vollauf | Vollauf | Vollauf | `page.pdf` gibt es in Playwright nur für Chromium (W1); U1 |
| `lebendig.spec.ts` | 9 | ja | Vollauf | Vollauf | Vollauf | U2 (Firefox), U7 |
| `offline.spec.ts` | 2 | ja | Vollauf | Vollauf | Vollauf | CDP nur in Chromium (W1); W2 |
| `anmerkungen.spec.ts` | 6 | ja | Vollauf | Vollauf | Vollauf | U6 (Firefox) |
| `pruefen.spec.ts` | 4 | ja | Vollauf | Vollauf | Vollauf | U7 (WebKit) |
| `*belege.spec.ts` | – | – | – | – | – | Belegläufe einzelner Pakete, keine Prüfungen |

Die Fallzahlen stammen aus `npx playwright test --list`. Im CI-Umfang sind das 64 Fälle je
Engine.

### 2.3 Was die Vergleichs-Spec misst

| Messung | Dateien | Breiten | Zusicherung (alle Engines) | nur aufgezeichnet |
|---|---|---|---|---|
| Geometrie der fließenden Ansicht | `beispiel`, `lebendig`, `kostenschaetzung`, `druck` | 320, 768, 1280 | `scrollWidth ≤ clientWidth` (HPR-INH-004) | Lage, Höhe und Breite jedes adressierten Blocks (`[id]`), Dokumenthöhe, Bildschirmfoto |
| Lesesystem-Variablen | `beispiel` | 1280 | Schrift × 2 ± 1 %, Zeilenhöhe/Schrift = 2 ± 1 % (HPR-INH-006) | Werte vorher/nachher |
| Seitenansicht | `beispiel`, `druck` | 1440 | Seite 793,7 × 1122,5 px ± 1,5 | Seitenzahl, Umbrüche, Bildschirmfoto |
| Spalten-Fragmentierung | Sonde | 400 | – | Spalte von Überschrift und Folgeabsatz, `break-inside`, `CSS.supports` für `orphans`/`widows` |
| Selbstnavigation des Dokumentrahmens | echter Rahmenwirt `frame.html` | – | 0 Anfragen am Ziel, nichts von außen sichtbar | `load`-Ereignisse, Meldung `left`, Rahmen-URL, sichtbarer Text |
| Schrift und Merkmale im Rahmen | `beispiel` | 1280 | Origin `null` | Schriftfamilie, Breite eines Mustersatzes, 14 CSS-Merkmale, 10 APIs |

---

## 3. Gemessene Engines

| Engine | Lokal (Debian 13, dieser Host) | CI (ubuntu-24.04) | Was es **nicht** ist |
|---|---|---|---|
| Chromium | Chromium Headless Shell 156.0.8078.4 | derselbe Playwright-Build | Edge/WebView2 und Android System WebView ähneln ihm, sind aber eigene Builds |
| Firefox | Firefox 157.0 (Playwright-Build, Juggler) | derselbe Build | – |
| WebKit | WebKit 27.2, Linux-Port WPE (kopflos), User-Agent meldet Safari | derselbe Build, Systempakete über `--with-deps` | **nicht** Safari, nicht WKWebView (macOS, iOS), nicht das WebKitGTK der Tauri-Hülle unter Linux ([14](14-desktop-huelle.md)) |

Ohne Root fehlen auf diesem Host Systembibliotheken für Firefox (GTK 3) und WebKit (GTK 4,
GStreamer, ICU 76 und weitere). [`p13-sysroot.sh`](../scripts/p13-sysroot.sh) entpackt die
Debian-Pakete nach `app/.engine-sysroot/`. [`p13-engines-env.sh`](../scripts/p13-engines-env.sh)
setzt `LD_LIBRARY_PATH`, die EGL-Herstellerdatei und die GStreamer-Pfade.
[`p13-webkit-run.sh`](../scripts/p13-webkit-run.sh) startet WebKit, weil der mitgelieferte Starter
`LD_LIBRARY_PATH` überschreibt. Zwei Fallen haben Zeit gekostet:

- Ohne `__EGL_VENDOR_LIBRARY_DIRS` bricht der Web-Prozess mit „Could not create EGL display“ ab.
- Ohne GStreamer-plugins-good stürzt der Web-Prozess bei jedem `<video>` ab („autoaudiosink not
  found“, danach „Page crashed“). Der erste Vollauf ([09](belege/P13/09-vollauf-erster-lauf.txt))
  enthält diese Abstürze noch; sie liegen an der Umgebung, nicht an der Engine. Mit den Plugins
  laufen die Video-Dokumente in WebKit ([01](belege/P13/01-engines-spec.txt),
  [04](belege/P13/04-vollauf-teil.txt)).

---

## 4. Unterschiede

**U** steht für einen Engine-Unterschied, **W** für eine Grenze des Werkzeugs. Werte aus
[vergleich.md](belege/P13/vergleich/vergleich.md) und den Rohdaten unter
[`vergleich/roh/`](belege/P13/vergleich/roh/).

### U1 – `break-after: avoid` in der Spalten-Fragmentierung (nur Chromium) · belegt

Die Sonde stellt eine Überschrift mit `break-after: avoid` so, dass sie Spalte 1 abschließen würde.

| | Chromium | Firefox | WebKit |
|---|---|---|---|
| Spalte der Überschrift / des Folgeabsatzes | 2 / 2 | **1 / 2** | **1 / 2** |
| `break-after: avoid` eingehalten | ja | **nein** | **nein** |
| `break-inside: avoid` eingehalten | ja | ja | ja |
| `CSS.supports('orphans', '2')` / `widows` | ja / ja | **nein / nein** | ja / ja |

Folge im Reader (`druck.spec.ts`, Prüfdokument `druck.hpro`, Vollauf
[04](belege/P13/04-vollauf-teil.txt)): Die Druckvorhersage meldet Überschriften allein am
Seitenende. In Chromium ist die Liste leer. In Firefox steht dort `h2#zeitraffer-h (Seite 5)`, in
WebKit `h3#plan-tabelle-h (Seite 8)` und `h2#datenexport-h (Seite 9)`.

Die Ursache steht im Code. [`app/src/paginate.ts`](../app/src/paginate.ts) setzt den Text als
Spalten in der Größe des Satzspiegels und liest die Spalte eines Elements als dessen Seite. Das ist
ausdrücklich auf Chromium gebaut („Chromium fragments columns with the same engine as pages“).
Für Zusage 6 heißt das: Der Druck aus Firefox und WebKit hält „Überschrift
bleibt beim nächsten Block“ ([03, 3.1](03-konzept.md#31-absicht-statt-position-beschreiben-vorschlag))
nicht ein. Die Seitenzahlen im Verzeichnis stimmen dann nur für den Druck aus Chromium. Die
fließende Ansicht ist nicht betroffen. Die seitengetreue Ansicht ebenfalls nicht: Sie setzt die
Umbrüche per Skript ([`frame-agent.js`](../app/src/frame-agent.js)). In allen drei Engines liegen
sie an denselben Stellen (`beispiel`: 4 Seiten, `druck`: 11 Seiten, gleiche Umbruchlisten).
**Offen:** Die Druckvorhersage sollte Überschriften selbst an den Folgeblock binden, wie es die
Seitenansicht schon tut, statt sich auf die Engine zu verlassen.

### U2 – Selbstnavigation des Dokumentrahmens · belegt, Sicherheitszusage hält

Der Rahmenwirt (`frame.html`, P15) erhält ein Dokument, das sich nach 400 ms auf einen zählenden
Server (anderer Port) umleitet. Die CSP des Wirts (`frame-src 'none'`) blockiert das in allen drei
Engines, nur auf verschiedene Weise:

| | Chromium | Firefox | WebKit |
|---|---|---|---|
| Anfragen am Ziel | 0 | 0 | 0 |
| `load`-Ereignisse des Rahmens | 2 | **1** | 2 |
| sichtbar danach | Fehlerseite (`chrome-error://chromewebdata/`) | das Dokument (`about:srcdoc`) | das Dokument (`about:srcdoc`) |
| Wirt meldet `left` | ja | **nein** | ja |

Der Reader erkennt den Versuch am zweiten `load`, beendet die Komponente und zeigt das Dokument
mit statischem Äquivalent. In Firefox kommt kein zweites `load`. Die Komponente läuft deshalb
weiter, und die Meldung „Komponente beendet“ erscheint nicht (`lebendig.spec.ts:398` im Vollauf).
Nach außen geht dabei nichts.
Eine Falle bei der Messung: Mit Port 9 als Ziel zeigte Firefox `http://127.0.0.1:9/weg` als
Rahmen-URL. Port 9 steht auf Firefox' Liste gesperrter Ports, das war Firefox' eigene Fehlerseite
und keine erfolgreiche Navigation. Erst mit einem zählenden Server war die Frage beantwortet.

### U3 – Tabellenlayout bei schmaler Breite · belegt, ohne Folgen für Zusage 1

`druck.hpro` bei 320 px: Die Tabelle `table#messwerte` mit 200 Zeilen ist in Chromium 11 481 px
hoch, in Firefox 6 528 px und in WebKit ähnlich wie in Chromium. Firefox bricht die Zellen anders
um. Die Dokumenthöhe sinkt dadurch von 16 108 auf 11 129 px. Bei `kostenschaetzung.hpro` mit 768 px
ist `section#kosten-abschnitt` in Chromium 472 px hoch, in Firefox 566 px und in WebKit 678 px.
Waagrechtes Scrollen entsteht in keiner Engine.

### U4 – Kleine Geometrie- und Schriftunterschiede · belegt

Dieselben Schriften greifen, weil auf diesem Host eine einzige fontconfig gilt. Die Breite des
Mustersatzes ist in allen drei Engines gleich. Die Dokumenthöhe weicht trotzdem um 3 bis 26 px ab
(z. B. `lebendig` bei 1280 px: 2114, 2097, 2088 px). Das kommt von Zeilenhöhe, Medien und
Formularelementen. In der Seitenansicht setzt WebKit einen Block, der eine Seite beginnt, bis zu
0,5 px über die Seitenoberkante (`h2#technik-titel`, Versatz 1153 px bei einem Seitenraster von
1152,76 px). Im ersten Vollauf schlug `reader.spec.ts` deshalb in WebKit fehl. Der Test erlaubt
jetzt an beiden Enden 1 px. `getComputedStyle` liefert in WebKit `24.799999px` statt `24.8px` und die
Familie ohne Anführungszeichen (`Times New Roman`). Wer berechnete Werte als Zeichenkette
vergleicht, bekommt deshalb falsche Unterschiede. Die Prüfer vergleichen Zahlen mit Toleranz.

### U5 – Merkmale · belegt, bestätigt [06, A4](06-plattform-und-funktionsmatrix.md)

| Merkmal | Chromium | Firefox | WebKit |
|---|---|---|---|
| `showSaveFilePicker` | ja | nein | nein |
| `text-wrap: pretty` | ja | nein | ja |
| `interpolate-size` | ja | nein | nein |
| Container Queries, `text-wrap: balance`, `hyphens: auto`, `:has()`, `CompressionStream('deflate-raw')`, `Intl.Segmenter`, Popover, `<dialog>` | ja | ja | ja |

Das Speichern am Ort ist damit wie in docs/06 erwartet Chromium-only. Der Reader lädt in Firefox und
WebKit eine neue Datei herunter. Die Specs `tabellen`, `sperren` und `bearbeiten` laufen auf diesem
Weg in allen drei Engines grün.

### Wie die Suite die Unterschiede sichtbar hält

U1 und U2 werden in jedem CI-Lauf neu gemessen und im Bericht als „Unterschied“ geführt. Die
Zusicherungen gelten für alle drei Engines. Hält eine Engine eine davon nicht mehr ein, wird der
Job rot. Hebt eine Engine einen Unterschied auf, zeigt der Bericht das.

### U6 – Fokus vom Dokumentrahmen ins Bedienfeld (Firefox) · beobachtet, Ursache nicht geklärt

`anmerkungen.spec.ts`: Ein Klick oder Enter auf eine Markierung im Dokumentrahmen soll den Fokus auf
den Kopf des Gesprächsfadens im Bedienfeld setzen (`focusThread`, `el.focus()` in der Hülle). In
Firefox bleibt der Fokus im Rahmen (2 Fälle). Für die Tastaturbedienung zählt das als
Barrierefreiheitsmangel.
**Nicht geprüft:** ob Firefox `focus()` aus einem fremden Fokus-Kontext absichtlich verwirft oder ob
ein `window.focus()` vorher genügt.

### U7 – Weitere Fehlschläge im Vollauf · beobachtet, Ursache nicht geklärt

- WebKit, `pruefen.spec.ts` (2 Fälle, [09](belege/P13/09-vollauf-erster-lauf.txt)): `frame.evaluate`
  scheitert mit „Execution context was destroyed“, und der axe-Lauf liefert einen anderen Befund.
- Firefox, `lebendig.spec.ts:88` „ohne Skripte bleibt das statische Äquivalent vollständig lesbar“:
  Zeitüberschreitung nach 60 s, in [09](belege/P13/09-vollauf-erster-lauf.txt) und
  [04](belege/P13/04-vollauf-teil.txt).
- WebKit, `lebendig.spec.ts:239` „Datenkanal: Ansicht wird nur im Dokument gespeichert“: ein
  abweichender Wert ([04](belege/P13/04-vollauf-teil.txt)).

**Nicht geprüft**, ob diese Fälle an der Engine liegen oder an der Testmechanik (Rahmen werden neu
geladen, Kontexte ohne JavaScript). Bis das geklärt ist, laufen die drei Specs nur im Vollauf.
Die übrigen 8 Fälle von `lebendig.spec.ts` sind in WebKit grün, 7 in Firefox
([04](belege/P13/04-vollauf-teil.txt)).

### W1, W2 – Grenzen des Werkzeugs, keine Engine-Unterschiede

- **W1:** `page.pdf()` und CDP-Sitzungen gibt es in Playwright nur für Chromium. Betroffen sind
  `druck.spec.ts` (3 Fälle mit PDF) und `offline.spec.ts` (Manifest über CDP).
- **W2:** `offline.spec.ts` in Firefox: Nach `context.setOffline(true)` lädt `fetch` eine nicht
  gecachte URL trotzdem. Ob Playwrights Offline-Emulation in Firefox Anfragen über den Service
  Worker abdeckt, ist **nicht geprüft**. Über den Offline-Start in Firefox sagt der Fall deshalb
  nichts aus.

### Widerlegt (für diese drei Builds)

- Engine-abhängiges waagrechtes Scrollen bei 320, 768 und 1280 px: tritt in keinem der
  4 × 3 × 3 Fälle auf.
- Unterschiede bei den Lesesystem-Variablen, bei der Rahmen-Origin, bei der A4-Seitengröße und bei
  der Netzsperre des Rahmens.

---

## 5. Ausführen

### 5.1 Lokal

```sh
scripts/p13-sysroot.sh                        # einmalig, nur ohne Root (≈ 250 MB, app/.engine-sysroot/)
cd app && npx playwright install chromium firefox webkit && cd ..
. scripts/p13-engines-env.sh
npm run engines -w app                        # vite build, drei Engine-Projekte, Bericht
P13_VOLL=1 npx --prefix app playwright test --project=engine-firefox   # Vollauf mit den bekannten Unterschieden
node scripts/p13-vergleich.mjs                # Bericht nach app/test-results/engines/vergleich/
node scripts/p13-epubcheck.mjs --md epubcheck.md
scripts/belege-p13.sh                         # alle Belege nach docs/belege/P13/
```

Playwright leert `app/test-results/` vor jedem Lauf. Den Bericht deshalb direkt nach dem Lauf der
Vergleichs-Spec erzeugen.

### 5.2 CI

Der Workflow läuft bei jedem Push auf `main`. Die Zusammenfassung eines Laufs enthält den
epubcheck-Bericht und die Tabellen des Engine-Vergleichs. Die Bilder liegen im Artefakt
`engine-vergleich`. Stand der Läufe abfragen:

```sh
gh run list --workflow CI --limit 5
gh api repos/pixel010/hpro/actions/runs --jq '.workflow_runs[] | [.id,.status,.conclusion,.head_sha[0:7]] | @tsv'
```

### 5.3 Lokal nachgestellt

| Job | lokal nachgestellt mit | Ergebnis | Beleg |
|---|---|---|---|
| `test` | sauberer Klon des Commits in `.ci-probe/`, JDK und epubcheck frisch über `ci-werkzeuge.sh` geladen (Prüfsummen OK), ohne DSS, veraPDF, calibre, LibreOffice und Dienst-venv, dann `npm ci && npm test` | Exit 0 nach 372 s. Kern: 611 Tests, 605 bestanden, 6 übersprungen, jeweils mit Grund (DSS, veraPDF, Python-venv). Vitest: 55. Chromium-E2E: 73. Prüfer grün, Dienst-Test übersprungen (kein venv) | [08](belege/P13/08-ci-probe-npm-test.txt) |
| `build` | `npm run build` im selben Klon | Exit 0 nach 96 s, 9 Container in `app/dist/` | [08](belege/P13/08-ci-probe-npm-test.txt) |
| `epubcheck` | `node scripts/p13-epubcheck.mjs` | 42 Container: 36 ohne Befund, 6 nur mit bekannten Befunden (5 × RSC-011 aus HPC-0003, 1 × RSC-005 im Prüfdokument, s. u.), 0 mit unerwarteten | [05](belege/P13/05-epubcheck.txt) |
| `engines` | dieselben Projekte mit dem lokalen Sysroot | Exit 0, 192 Fälle grün (64 je Engine) | [03](belege/P13/03-engine-projekte-ci-umfang.txt) |
| `vergleich` | `node scripts/p13-vergleich.mjs` | Bericht mit 15 Bildschirmfotos je Engine | [02](belege/P13/02-vergleich.txt) |

`app/dist/pruefen.hpro` ist das Prüfdokument aus P8. Es enthält mit Absicht ein ungültiges
`lang`-Attribut, das der Barrierefreiheitsprüfer finden soll. epubcheck meldet das als `RSC-005`.
[`p13-epubcheck.mjs`](../scripts/p13-epubcheck.mjs) kennt genau zwei Ausnahmen. Die erste ist
dieses `RSC-005`, nur für `pruefen.hpro` und nur für `lang`/`xml:lang`. Die zweite ist `RSC-011`
für Dateien unter `renditions/`: Das ist der bekannte Befund jeder eingefrorenen Fassung, solange
Änderungsantrag HPC-0003 offen ist. Beide Ausnahmen stehen in der Ausgabe als „bekannt“, nie als
„0 Fehler“. Jeder andere Befund macht den Job rot.

---

## 6. Grenzen

- Nur Linux. Windows- und macOS-Runner fehlen in der Matrix. Damit fehlen auch Edge/WebView2,
  Safari und WKWebView. Für A6 aus [06](06-plattform-und-funktionsmatrix.md) bleibt die
  Engine-Messung auf echten Hüllen offen (WebKitGTK: [14](14-desktop-huelle.md), Android-WebView:
  [15](15-mobil-huelle.md)).
- Ein CI-Lauf auf GitHub ist zum Zeitpunkt dieses Dokuments **nicht geprüft** (Abschnitt 1, Punkt 4).
- Die Schriften in CI (Ubuntu) unterscheiden sich von diesem Host (Debian 13). Die Geometriewerte
  aus CI und von lokal lassen sich deshalb nur innerhalb eines Laufs vergleichen.
- Die Pixeldifferenz zählt nur Pixel, deren Farbe um mehr als 32 abweicht. Sie zeigt, wo sich etwas
  unterscheidet, sagt aber nichts darüber, ob der Unterschied stört.
