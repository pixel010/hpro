# Belege P14 – Release, Paketierung und Demo-Dokumente

**Lauf:** 14.10.2026, Commit-Basis `4f2b4eb` und Folgecommit. Erzeugt mit
[`scripts/belege-p14.sh`](../../../scripts/belege-p14.sh). Jede Datei beginnt mit Zeitpunkt und Commit
und enthält die Befehle mit ihrer wörtlichen Ausgabe und ihrem Exit-Code.
**Umgebung:** Debian 13, Intel N100 bei 3,4 GHz (Takt in `00`), Node 26.5.1, npm 11.17.0,
JDK 21.0.12.1, epubcheck 5.4.0, EU DSS 6.5, Chromium 156 (Playwright).

## Abnahmekriterien

| Nr. | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| 1 | Reproduzierbarer Build mit einer Anleitung, die ein Fremder befolgen kann | **erfüllt** mit benannter Ausnahme: Anleitung [`BAUEN.md`](../../../BAUEN.md), Skript `scripts/release-bauen.sh`. Zwei Läufe im Arbeitsverzeichnis und ein frischer `git clone` (leerer npm-Cache, `npm ci`, Schritte aus BAUEN.md) liefern bytegleich das Kern-Paket, die drei Demo-Dokumente und 22 von 25 Dateien des Reader-Archivs. Die drei übrigen Dateien weichen gewollt ab und werden benannt (siehe unten). | [02](02-release-bau.txt), [07](07-fremder-klon.txt) |
| 2 | Drei Demo-Container im Repo, jeder besteht epubcheck und die eigene Prüfung | **erfüllt**: `demo/hpro-demo-bericht.hpro`, `…-formular.hpro`, `…-nachweis.hpro`. epubcheck 5.4.0 meldet je `0 fatals / 0 errors / 0 warnings / 0 infos`. Die eigene Prüfung (`hpro check`, 164 Regeln, mit epubcheck) ergibt je `0 fatal, 0 Fehler`. Der Nachweis hat eine Warnung (`HPR-SIG-012`, kein Zeitstempel). Die Signatur ist `TOTAL_PASSED`, mit dem eigenen Validator und mit EU DSS. | [03](03-epubcheck.txt), [04](04-eigene-pruefung.txt), [05](05-signatur-dss.txt) |
| 3 | Lizenz festgelegt und im Repo vermerkt | **erfüllt**: [`LICENSE`](../../../LICENSE) (Apache-2.0), [`LICENSES/`](../../../LICENSES/) (Apache-2.0, CC-BY-4.0, CC0-1.0, Originaltexte), [`LIZENZEN.md`](../../../LIZENZEN.md) (Zuordnung je Verzeichnis), [`NOTICE`](../../../NOTICE). `"license": "Apache-2.0"` steht in allen 7 `package.json`. Teil 2 der Spezifikation trägt CC-BY-4.0 in der Kopfzeile, §2.2 ist als wirksam markiert. `gov:check` ist grün. | [01](01-lizenz.txt) |

## Dateien

| Datei | Inhalt |
|---|---|
| [00-werkzeuge.txt](00-werkzeuge.txt) | Versionen, Betriebssystem, CPU-Takt und Last, `hpro version` |
| [01-lizenz.txt](01-lizenz.txt) | Prüfsummen der Lizenztexte, `license`-Felder aller `package.json`, Kopfzeile Teil 2, `gov:check` |
| [02-release-bau.txt](02-release-bau.txt) | `scripts/release-bauen.sh` zweimal (48 s und 51 s), `diff` der `SHA256SUMS`, `scripts/release-vergleichen.sh`, Inhalt beider Pakete |
| [03-epubcheck.txt](03-epubcheck.txt) | epubcheck 5.4.0 auf den drei Demos |
| [04-eigene-pruefung.txt](04-eigene-pruefung.txt) | `demo:check` (Bau = Repo), `hpro check` mit epubcheck und JSON-Bericht, `hpro calc check` (7 Formeln, 0 Abweichungen), `hpro form check` leer (Exit 1: Absenden nicht möglich, so erwartet), `hpro form submit` ausgefüllt mit Datenexport, `hpro validate` |
| [05-signatur-dss.txt](05-signatur-dss.txt) | EU DSS 6.5 auf dem Nachweis (`TOTAL_PASSED`), manipulierte Kopie: „bestanden“ → „nicht bestanden“ (hpro und DSS: `TOTAL_FAILED / HASH_FAILURE`; Prüfer: 4 Fehler) |
| [06-rauchtest.txt](06-rauchtest.txt), [bilder/](bilder/) | Reader aus dem Release-Archiv: drei Demos bei 390, 820 und 1440 px, Titel, kein waagrechtes Scrollen (Dokumentrahmen und Hülle), Öffnen 280 bis 533 ms. Das Formular wurde im Reader ausgefüllt: 22,50 € + 43,00 € + 7,50 € = 73,00 €, Auszahlung 53,00 €. |
| [07-fremder-klon.txt](07-fremder-klon.txt) | BAUEN.md Schritt für Schritt in `git clone` des Commits: `npm ci` (82 Pakete, 9 s), Release-Bau (58 s), Vergleich im Klon und gegen Lauf A, Prüfung der Demos, Paket `hpro-kern-0.1.0.tgz` in ein leeres Projekt installiert, `npx hpro version` und `npx hpro check` |
| [08-npm-test.txt](08-npm-test.txt) | `npm test` nach allen Änderungen, Exit 0 in 457 s: Kern 651 Tests (650 bestanden, 1 übersprungen, 0 fehlgeschlagen), Vitest 55, Playwright 73, alle Prüfer `OK: 0 errors`, neu `demo:check` |
| [SHA256SUMS-release-a.txt](SHA256SUMS-release-a.txt) | Prüfsummen von Lauf A, Referenz für Fremde |

## Was „reproduzierbar“ hier heißt

Bytegleich über zwei Läufe und über den frischen Klon:

- das npm-Paket `hpro-kern-0.1.0.tgz`, sha256 `90c16959…ab3a7`,
- die drei Demo-Dokumente. Ihre Prüfsummen stehen in `demo/README.md`, und `npm test` vergleicht
  sie mit dem Bau aus den Quellen (`demo:check`).
- 22 von 25 Dateien im Reader-Archiv, darunter der gesamte Programmcode (`assets/*.js`, `index.html`,
  `frame.html`).

Gewollt verschieden, von `scripts/release-vergleichen.sh` einzeln geprüft:

- `kostenschaetzung.hpro` und `sperren.hpro` sind eingebaute Beispiele des Readers aus
  `app/scripts/sample.ts`. Sie werden bei jedem Bau mit einem neu erzeugten EC-Testschlüssel signiert;
  ECDSA verwendet einen zufälligen Nonce. `sperren.hpro` hat zusätzlich einen versiegelten Abschnitt
  mit zufälligem Salz und IV. Feste Werte wären bei Verschlüsselung ein Fehler.
- `sw.js` weicht nur in der Cache-Kennung `t` ab. Sie ist ein Hash über die vorgeladenen Dateien und
  schließt die beiden Beispiele ein. Das Skript maskiert `t` und verlangt dann Gleichheit.

Deshalb unterscheidet sich die Prüfsumme des Reader-Archivs als Ganzes (Exit 1 von `diff` in `02`).
Bitgleich würde es nur, wenn die Beispiele mit festem Schlüssel signiert und die
versiegelte Probe aus dem Bau herausgenommen würden. Das ist nicht umgesetzt (offener Punkt 1).

## Demo-Dokumente und Zusagen aus docs/10

| Demo | Zusagen | Was geprüft ist |
|---|---|---|
| Bericht | 1 Bildschirm zuerst, 3 verschachtelt, 6 Druck, 7 Rechnen | Kein waagrechtes Scrollen bei 390/820/1440 px. Verschachtelte `details`, stabile `id` an jedem Abschnitt, 7 Formeln ohne Abweichung, Grafik mit Alternativtext und Wertetabelle. Druckregeln: der Prüfer verlangt `break-inside` für Tabellen (HPR-INH-024). Den A4-Druck dieses Dokuments selbst hat P14 **nicht geprüft**; der Druckweg ist in P18 belegt. |
| Formular | 2 lebendig (ohne Skript), 4 bearbeitbar, 7 Rechnen | Rechnet im Reader und mit `hpro form`. Bedingter Abschnitt erscheint nach der Wahl. Absenden schreibt Daten, die gegen das Schema geprüft sind. |
| Nachweis | 5 sperrbar und vertrauenswürdig | XAdES-B über alle Dateien. hpro-Validator und EU DSS: `TOTAL_PASSED`. Eine Änderung nach der Signatur wird von beiden als `HASH_FAILURE` erkannt. |

Bewusst **nicht** in den Demos:

- Eine eingefrorene Fassung neben der lebendigen (Zusage 5, Profilteilung): Jede eingefrorene Fassung
  bekommt bei epubcheck `RSC-011` (Änderungsantrag HPC-0003, in Frist) und bestünde deshalb Kriterium 2
  nicht. Das Muster zeigen die Beispiele in `docs/belege/S7/` und `P19`.
- Komponenten mit Animation oder Video (Zusage 2 im Vollsinn): Sie liegen in `docs/spezifikation/beispiele/p15-lebendig`.

## Nicht geprüft

- **macOS und Windows als Bauumgebung:** Der Bau ist nur unter Linux x86-64 gelaufen. Das Skript
  braucht GNU tar und sha256sum.
- **Desktop- und Mobil-Hüllen:** Sie sind nicht Teil von 0.1.0 und wurden in P14 nicht neu gebaut.
  Belege dazu: P11, P12.
- **Reader in Firefox und WebKit mit den Demos:** Der Rauchtest lief nur mit Chromium. Die
  Engine-Suite aus P13 umfasst die Demos nicht.
- **Rechtliche Prüfung der Lizenzwahl:** Sie ist keine Rechtsberatung. Die Patentzusage (Teil 2,
  §2.4) ist nicht abgegeben, das kann nur der Herausgeber selbst.
- **Veröffentlichung:** Es gibt kein npm-Publish, kein Git-Tag und keinen Push. Das macht der Läufer
  bzw. der Herausgeber; `kern/package.json` bleibt `"private": true`.

## Offene Punkte

1. Reader-Archiv bitgleich machen: Beispiele mit festem RSA-Testschlüssel signieren, die versiegelte
   Probe nur in Tests erzeugen.
2. Signaturprüfung der Hauptfassung im Reader. Heute prüft er nur eingefrorene Fassungen, die
   Kurzanleitung verweist für alles andere auf `hpro validate`.
3. Demo mit Zeitstempel (XAdES-T) als zusätzliche, nicht reproduzierbare Datei, sobald ein
   Zeitstempeldienst als Teil des Releases feststeht.
4. Demos in die Engine-Suite von P13 und in den CI-Lauf mit epubcheck aufnehmen.
