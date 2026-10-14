# hpro 0.1.0 bauen – Anleitung

Diese Anleitung baut die erste öffentliche Version von hpro aus dem Quell-Repository. Sie setzt
kein Vorwissen über das Projekt voraus. Jeder Schritt nennt das Ergebnis, das Sie sehen sollten.
Wörtliche Ausgaben eines Laufs nach dieser Anleitung in einem frischen Klon stehen in
[`docs/belege/P14/`](docs/belege/P14/README.md).

## Was gebaut wird

| Datei (in `release/`) | Inhalt |
|---|---|
| `hpro-kern-0.1.0.tgz` | npm-Paket `@hpro/kern`: Bibliothek (TypeScript-Typen, ES-Module), Kommandozeile `hpro` und `hpro-check`, Prüfregelkatalog, `LICENSE` |
| `hpro-reader-0.1.0.tar.gz` | Reader als Web-App (statische Dateien, offlinefähig), mit `LICENSE`, `NOTICE`, Lizenztext der Fremdbibliothek |
| `hpro-demo-bericht.hpro` | Demo 1: Bericht mit aufklappbaren Abschnitten, stabilen Adressen, rechnender Tabelle, Grafik und Anhang |
| `hpro-demo-formular.hpro` | Demo 2: Formular (Reisekostenabrechnung), rechnet beim Ausfüllen, mit Prüfregeln und Datenschema |
| `hpro-demo-nachweis.hpro` | Demo 3: signierter Nachweis (XAdES-BASELINE-B, Testzertifikat) |
| `SHA256SUMS` | Prüfsummen der fünf Dateien |

Die Desktop-Hülle (Tauri, [docs/14](docs/14-desktop-huelle.md)) und die Mobil-Hüllen
([docs/15](docs/15-mobil-huelle.md)) gehören **nicht** zu dieser Version; sie haben eigene
Bauanleitungen und brauchen Rust bzw. das Android-SDK.

## 1. Voraussetzungen

| Werkzeug | Version | wofür | geprüft mit |
|---|---|---|---|
| Linux x86-64 | – | Bauen | Debian 13 (Kernel 6.12) |
| Node.js | ≥ 22 | alles | 26.5.1 |
| npm | ≥ 10 | Abhängigkeiten | 11.17.0 |
| git | beliebig | Quellen holen; Zeitstempel der Archive | 2.47.3 |
| GNU tar, gzip, sha256sum | GNU coreutils | Reader-Archiv, Prüfsummen | tar 1.35 |
| Netzzugang | – | nur für `npm ci` (npm-Registry) | – |

Für die **optionale** Gegenprobe mit epubcheck (Abschnitt 5) zusätzlich Java 21 und epubcheck 5.4.0.
`prototyp/setup-tools.sh` lädt beides mit festen Prüfsummen nach `prototyp/tools/` (rund 450 MB, dazu
Maven und das DSS-Werkzeug). Für den Build selbst sind Java und Netz nach `npm ci` nicht nötig.

macOS und Windows sind **nicht geprüft**. Das Bauskript braucht `bash`, GNU `tar` (`--sort=name`)
und `sha256sum`; unter macOS fehlen diese ohne Homebrew-Pakete (`gnu-tar`, `coreutils`).

## 2. Quellen holen und Abhängigkeiten installieren

```sh
git clone <URL des Repositorys> hpro
cd hpro
npm ci
```

`npm ci` installiert genau die Versionen aus `package-lock.json`. Erwartet: am Ende
`added … packages`, kein `ERR!`. Warnungen über veraltete Pakete sind harmlos.

## 3. Release bauen

```sh
scripts/release-bauen.sh
```

Das Skript läuft knapp eine Minute (40 bis 58 s gemessen auf einem Intel N100). Es

1. baut den Kern (`kern/dist`),
2. baut die drei Demo-Dokumente aus `demo/quellen/` und vergleicht sie Byte für Byte mit den Dateien
   in `demo/` (Ausgabe `Alle Demo-Dokumente im Repo entsprechen dem Bau aus den Quellen.`),
3. packt `@hpro/kern` mit `npm pack`,
4. baut den Reader (Typprüfung, `vite build`) und packt ihn ohne Source-Maps als Archiv.

Erwartet am Ende: `== Ergebnis in …/release`, die Dateiliste und `SHA256SUMS`. Die Meldung von Vite
`Some chunks are larger than 500 kB` ist ein Hinweis, kein Fehler.

## 4. Ergebnis prüfen (Reproduzierbarkeit)

Ein zweiter Bau auf demselben Commit muss dasselbe ergeben:

```sh
scripts/release-bauen.sh release-2
scripts/release-vergleichen.sh release release-2
```

Erwartet: `ERGEBNIS: reproduzierbar (bis auf die benannten Zufallswerte)`. Bytegleich sind das
Kern-Paket, die drei Demo-Dokumente und 22 der 25 Dateien des Reader-Archivs. Drei Dateien im Reader-Archiv
weichen **gewollt** ab und werden einzeln benannt:

- `kostenschaetzung.hpro` und `sperren.hpro`, zwei eingebaute Beispiele des Readers. Sie werden bei
  jedem Bau mit einem neu erzeugten Testschlüssel signiert (ECDSA) bzw. mit zufälligem Salz und
  IV verschlüsselt. Feste Zufallswerte wären bei Verschlüsselung ein Sicherheitsfehler.
- `sw.js`: nur die Cache-Kennung `t`, ein Hash über alle vorgeladenen Dateien, also auch über die
  zwei Beispiele.

Die Archive tragen als Zeitstempel die Commit-Zeit (`SOURCE_DATE_EPOCH` aus `git log`), nicht die
Uhrzeit des Baus. Wer gegen den Bau eines anderen vergleicht, nimmt dessen `release/`-Verzeichnis
als zweites Argument.

Die Prüfsummen der Demo-Dokumente stehen auch in [`demo/README.md`](demo/README.md); sie müssen mit
`release/SHA256SUMS` übereinstimmen.

## 5. Demo-Dokumente prüfen

Mit der eigenen Prüfung (Konformitätsprüfer, Teil 1 der Spezifikation):

```sh
npm run -s build:test -w kern
node kern/build/bin/hpro.js check demo/hpro-demo-bericht.hpro --no-epubcheck
node kern/build/bin/hpro.js check demo/hpro-demo-formular.hpro --no-epubcheck
node kern/build/bin/hpro.js check demo/hpro-demo-nachweis.hpro --no-epubcheck \
  --trust demo/schluessel/demo-pruefstelle.cert.pem --time 2026-10-14T09:00:00Z
node kern/build/bin/hpro.js validate demo/hpro-demo-nachweis.hpro \
  --trust demo/schluessel/demo-pruefstelle.cert.pem --time 2026-10-14T09:00:00Z
```

Erwartet: jeweils `Befunde: 0 fatal, 0 Fehler, …`. Beim Nachweis bleibt die Warnung `HPR-SIG-012`
(kein Zeitstempel, siehe [`demo/README.md`](demo/README.md)). Der Exit-Code ist 3, nicht 0, weil vier
Regeln eine Browser-Engine oder eine Begriffsliste brauchen und als „nicht geprüft“ zählen. `validate` endet mit
`indication: TOTAL_PASSED` und `result: OK`.

Ohne `--no-epubcheck` ruft der Prüfer zusätzlich epubcheck auf, wenn `prototyp/tools/` eingerichtet ist.
Direkt mit epubcheck (die Datei braucht dafür die Endung `.epub`):

```sh
prototyp/setup-tools.sh            # einmalig, lädt JDK 21 und epubcheck 5.4.0
cp demo/hpro-demo-bericht.hpro bericht.epub
prototyp/tools/jdk-21.0.12.1+1/bin/java -jar prototyp/tools/epubcheck-5.4.0/epubcheck.jar bericht.epub
```

Erwartet: `Messages: 0 fatals / 0 errors / 0 warnings / 0 infos`.

## 6. Ausprobieren

- **Reader:** `release/hpro-reader-0.1.0.tar.gz` entpacken, im entpackten Verzeichnis
  `python3 -m http.server 8080 --bind 127.0.0.1` starten, `http://127.0.0.1:8080/` öffnen und eine
  Demo-Datei über „Öffnen“ wählen. Aus `file://` startet der Reader nicht (Browser laden dort keine
  Module und keinen Service Worker). Den Server danach mit Strg+C beenden.
- **Kommandozeile ohne Repository:** `npm install ./release/hpro-kern-0.1.0.tgz` in einem leeren
  Verzeichnis, dann `npx hpro version` und `npx hpro check <datei>`.

Bedienung für Anwender: [docs/anwender-kurzanleitung.md](docs/anwender-kurzanleitung.md).

## 7. Vollständige Tests (optional)

```sh
npm test
```

Dauert 6 bis 30 Minuten (je nach Rechner) und lädt beim ersten Mal Chromium Headless Shell nach
`app/.browsers/`. Erwartet: Exit-Code 0. Die Kern-Tests mit epubcheck brauchen
`prototyp/setup-tools.sh`.

## Fehlerbilder

| Meldung | Ursache | Abhilfe |
|---|---|---|
| `node_modules fehlt: zuerst npm ci ausführen` | Schritt 2 ausgelassen | `npm ci` |
| `Node >= 22 nötig` | zu alte Node.js-Version | Node.js 22 oder neuer installieren |
| `ABWEICHUNG hpro-demo-….hpro` beim Bau | Quellen in `demo/quellen/` oder der Kern geändert, Dateien in `demo/` nicht neu gebaut | `node scripts/demo-bauen.mjs`, Änderung prüfen und einchecken |
| `… weicht von den leeren Formulardaten des Kerns ab` | Formular geändert | `node scripts/demo-bauen.mjs --write-data` |
| `npm ci` endet mit `ENOTEMPTY` | ein Prozess aus `node_modules` läuft noch (z. B. ein Vorschau-Server) | Prozess beenden, `npm ci` wiederholen |
