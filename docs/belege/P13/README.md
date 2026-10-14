# Belege P13 – Cross-Engine-Testsuite und CI

**Stand:** 14.10.2026 · **Host:** Debian 13, Intel N100, ohne Root · **Node** 26.5.1 ·
**Playwright** 1.64.0 (Chromium 156.0.8078.4, Firefox 157.0, WebKit 27.2) · Beschreibung und
Einordnung: [docs/16](../../16-testmatrix-und-ci.md)

Erzeugt mit [`scripts/belege-p13.sh`](../../../scripts/belege-p13.sh). Ausnahmen: 08, 08a und 09
sind wörtliche Protokolle der Läufe, die in der jeweiligen Kopfzeile genannt sind.

## Abnahmekriterien

| Nr. | Kriterium | Stand | Beleg |
|---|---|---|---|
| 1 | CI-Lauf grün, Beleg über die GitHub-API oder den Aktionsverlauf | **nicht erfüllt in diesem Lauf.** Der Workflow ist fertig und geprüft (actionlint ohne Befund). Jeder Job ist lokal mit denselben Befehlen nachgestellt und grün, siehe unten. Auf GitHub lief er noch nie: Der Paketauftrag verbietet das Pushen, und ohne Push gibt es keinen Lauf. Die API meldet für das Repository **0 Läufe** | [06](06-actionlint.txt), [07](07-ci-laeufe.txt), [08](08-ci-probe-npm-test.txt), [03](03-engine-projekte-ci-umfang.txt), [05](05-epubcheck.txt) |
| 2 | Mindestens ein echter Engine-Unterschied dokumentiert oder ausdrücklich widerlegt | **erfüllt.** Fünf Unterschiede sind gemessen und belegt (U1–U5), zwei weitere beobachtet (U6, U7). U1: `break-after: avoid` hält in Spalten nur Chromium ein, deshalb steht im Druck aus Firefox eine Überschrift allein am Seitenende. U2: Die Selbstnavigation des Dokumentrahmens wird überall blockiert, aber nur Chromium und WebKit melden sie dem Reader. Widerlegt sind engine-abhängiges waagrechtes Scrollen (36 Fälle) und Unterschiede bei den Lesesystem-Variablen, der Rahmen-Origin, der A4-Seite und der Netzsperre | [vergleich/vergleich.md](vergleich/vergleich.md), [01](01-engines-spec.txt), [09](09-vollauf-erster-lauf.txt), [docs/16 Abschnitt 4](../../16-testmatrix-und-ci.md#4-unterschiede) |
| 3 | Testmatrix in docs/ beschrieben | **erfüllt** | [docs/16 Abschnitt 2](../../16-testmatrix-und-ci.md#2-testmatrix) |

## Dateien

| Datei | Inhalt |
|---|---|
| [01-engines-spec.txt](01-engines-spec.txt) | `e2e/engines.spec.ts` in Chromium, Firefox und WebKit (18 Fälle je Engine) |
| [02-vergleich.txt](02-vergleich.txt) | Ausgabe von `scripts/p13-vergleich.mjs`: Liste aller gefundenen Unterschiede |
| [vergleich/vergleich.md](vergleich/vergleich.md) | Bericht: Versionen, Geometrie je Datei und Breite, Seitenumbrüche, Variablen, Merkmale, Sonden, Pixeldifferenzen |
| [vergleich/vergleich.html](vergleich/vergleich.html) | Bildschirmfotos der drei Engines nebeneinander, mit Differenzbildern |
| [vergleich/vergleich.json](vergleich/vergleich.json) | dasselbe als Daten |
| `vergleich/bilder/` | 15 Bildschirmfotos je Engine, Differenzbilder gegen Chromium (rot = verschieden) |
| `vergleich/roh/<engine>/` | Rohmessungen der Spec (`engine.json`, `messung/*.json`) |
| [03-engine-projekte-ci-umfang.txt](03-engine-projekte-ci-umfang.txt) | die drei Engine-Projekte im CI-Umfang (Specs `engines`, `reader`, `tabellen`, `formulare`, `sperren`, `bearbeiten`, `a11y`) |
| [04-vollauf-teil.txt](04-vollauf-teil.txt) | `P13_VOLL=1`: `druck.spec.ts` und `lebendig.spec.ts` in Firefox und WebKit mit vollständigem Sysroot. 17 grün, 13 rot: 8 × `page.pdf` nur in Chromium (W1), 2 × U1 (Überschrift am Seitenende im Druck, Firefox und WebKit), 1 × U2 (Firefox), 2 × U7 |
| [05-epubcheck.txt](05-epubcheck.txt), [epubcheck.md](epubcheck.md) | epubcheck 5.4.0 über 42 Container (33 Testsuite „gut“, 9 Beispielcontainer des Builds) |
| [06-actionlint.txt](06-actionlint.txt) | actionlint 1.7.7 über `.github/workflows/ci.yml` |
| [07-ci-laeufe.txt](07-ci-laeufe.txt) | GitHub-API: Läufe des Repositorys zum Zeitpunkt des Belegs |
| [08-ci-probe-npm-test.txt](08-ci-probe-npm-test.txt) | Jobs `build` und `test` nachgestellt: sauberer Klon von `aa375f3` in `.ci-probe/`, `npm run build`, dann `npm test` (Exit 0, 372 s; Kern 611 Tests, 605 bestanden, 6 begründet übersprungen; Vitest 55; Chromium-E2E 73) |
| [08a-ci-werkzeuge.txt](08a-ci-werkzeuge.txt) | `scripts/ci-werkzeuge.sh` im leeren Klon: JDK und epubcheck geladen, SHA-256 OK |
| [09-vollauf-erster-lauf.txt](09-vollauf-erster-lauf.txt) | erster Vollauf aller Funktions-Specs in Firefox und WebKit (146 Fälle, 30 rot): Grundlage für die Einteilung in CI-Umfang und Vollauf. In WebKit stürzten noch die Video-Dokumente ab, weil im Sysroot GStreamer-plugins-good fehlte. Das liegt an der Umgebung, siehe docs/16 Abschnitt 3 |

## Nicht geprüft

- **Ein Lauf auf GitHub Actions** (Kriterium 1), Grund siehe oben. Nach dem Push durch den Läufer
  liefert `scripts/belege-p13.sh` bzw. `gh run list --workflow CI` den Beleg.
- **WebKitGTK, WKWebView, Safari, Edge/WebView2, Android-WebView.** Gemessen sind nur die drei
  Playwright-Builds unter Linux.
- **Ursachen von U6 und U7** (Fokus in Firefox, Prüfen-Panel in WebKit) und **W2** (Offline-Emulation
  in Firefox).
- **Vollauf aller Specs mit vollständigem Sysroot.** 09 lief, bevor die GStreamer-Plugins da waren.
  Wiederholt sind nur `druck.spec.ts` und `lebendig.spec.ts` (04). `anmerkungen`, `pruefen` und
  `offline` stammen aus 09.
