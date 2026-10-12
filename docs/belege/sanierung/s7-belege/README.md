# Sanierung des Bestands – unvollständige Belege zu S7 (Handbuchprüfer `hb:check`)

**Stand:** 12.10.2026 · **Anlass:** Bestandsprüfung `npm test --if-present` rot nach Commit 686b649 (S7, Status blockiert)

## Befund

`npm test` lief im Kern (291 Tests) und in `spec`, `konf`, `form` und `gov` grün, brach aber in
`npm run hb:check` mit 34 Fehlern `output-not-verbatim` ab
([01-npm-test-vorher.txt](01-npm-test-vorher.txt)). Die Fehler betrafen alle Ausgabeblöcke des
Umsetzer-Handbuchs und des Autorenleitfadens, die aus `docs/belege/S7/03-pruefer.txt` bis
`09-endung.txt` zitieren.

## Ursache

Die Belege waren unvollständig, der Prüfer selbst arbeitet korrekt. In Commit 686b649 lag
`docs/belege/S7/03-pruefer.txt` nur als Bruchstück vor (1058 Bytes, endet nach dem Befehl für
`s7-lebendig.hpro`), und `04-signieren.txt` bis `11-npm-test.txt` fehlten ganz. Ein vollständiger
Lauf von `scripts/belege-s7.sh` um 05:13 Ortszeit hatte die Dateien zwar erzeugt. Ein zweiter
Lauf um 05:26 überschrieb `00` bis `03` und wurde dann während der epubcheck-Prüfung in
Abschnitt 03 abgebrochen (`prototyp/out/s7/belege-lauf-neu.log` ist leer). Die Belege 04 bis 11
aus dem ersten Lauf wurden nie eingecheckt. Die Zitate in den Handbüchern sind korrekt. Ihnen
fehlte nur die Belegdatei, gegen die sie geprüft werden.

## Behebung (nur Belege neu erzeugt; Handbücher, Prüfer und Selbsttest unverändert)

`bash scripts/belege-s7.sh` wurde vollständig neu ausgeführt (Exit 0, etwa 15 Minuten, davon etwa
5 Minuten für Abschnitt 03 mit epubcheck). Die Testschlüssel unter `prototyp/out/s7/keys/` waren
vorhanden und wurden wiederverwendet. Deshalb sind die RSA-Signaturen byteidentisch (`s7-signiert.hpro`
sha256 `0f716ab3…`, wie im Handbuch zitiert). Nur `s7-signiert-2sig.hpro` hat neue Bytes
(10585 → 10587), weil die ECDSA-Gegenzeichnung randomisiert ist. Das Skript kündigt das selbst an.

| Datei unter `docs/belege/S7/` | Änderung |
|---|---|
| `00`–`02`, `berichte/s7-bericht.json` | nur Zeitstempel und Commit-Basis |
| `03-pruefer.txt` | vollständig statt abgebrochen |
| `04`–`11`, `berichte/s7-{lebendig,buero,signiert,fassungen-signiert}.json` | neu (fehlten) |
| `container/s7-signiert-2sig.hpro` | neue ECDSA-Gegenzeichnung (siehe oben) |

## Belege (wörtliche Ausgaben mit Exit-Code)

| Datei | Befehl | Ergebnis |
|---|---|---|
| [01-npm-test-vorher.txt](01-npm-test-vorher.txt) | `npm test` auf HEAD 686b649 | `hb:check`: `FAILED: 34 errors`, Exit 1 (Reproduktion) |
| [02-belege-s7-lauf.txt](02-belege-s7-lauf.txt) | `bash scripts/belege-s7.sh` (Standardausgabe des Skripts: letzte 25 Zeilen von `11-npm-test.txt` und `fertig`) | `hb:check OK: 0 errors`, `hb:selftest` 9 von 9, `fertig: docs/belege/S7` |
| [03-npm-test.txt](03-npm-test.txt) | `npm test --if-present` (voller Prüflauf wie in der Bestandsprüfung) | Kern 291 Tests, 291 bestanden, 0 übersprungen; alle Prüfer und Selbsttests OK; `hb:check OK: 0 errors`; Exit 0 |

## Nicht geprüft

| Was | Warum nicht |
|---|---|
| Ursache des Abbruchs um 05:26 | Das Protokoll des Laufs ist leer. Zeitlich passt der Abbruch zum Ende des Zeitbudgets des Laufs 20261012-0349 (Abschnitt 03 braucht allein etwa 5 Minuten). Belegt ist das nicht. |
| Inhaltliche Durchsicht der Handbücher | nicht Gegenstand der Sanierung. `hb:check` bestätigt, dass jedes Zitat wörtlich in den neuen Belegen steht. |
