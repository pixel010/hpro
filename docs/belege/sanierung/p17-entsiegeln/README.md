# Sanierung des Bestands – Entsiegeln im Browser dauert länger als die Wartezeit des Tests

**Stand:** 13.10.2026 · **Anlass:** Bestandsprüfung `npm test --if-present` (runner/auto_lauf.py) rot
nach P7 (Lauf 20261012-2319, Versuch 2) und P8 (Lauf 20261013-0058)

## Befund

`npm test` lief im Kern grün (552 von 552, 0 übersprungen) und in den App-Unit-Tests grün (51 von
51), brach aber in den Playwright-Tests der App ab, 68 bestanden, 1 fehlgeschlagen
([01-npm-test-vorher.txt](01-npm-test-vorher.txt), HEAD a154f60):

```
✘  60 [chromium] › e2e/sperren.spec.ts:39:3 › Sperren und versiegelte Abschnitte (P17) › Abnahme 2: …
Error: expect(locator).toHaveText(expected) failed
Locator:  locator('#unseal-status')
Expected: "Nicht geöffnet: Kennwort passt nicht."
Received: "Wird entschlüsselt …"
Timeout:  10000ms
```

Danach liefen `spec:check`, `konf:check`, `form:check`, `gov:check`, `hb:check` und ihre
Selbsttests nicht mehr. Code von Reader, Kern und Test ist seit P17/P5 unverändert; derselbe Test lief
in den Läufen P17 bis P7 grün in 5,9–6,6 s (Protokolle unter `/opt/data/html-pro-lauf/`), im Lauf
20261012-2319 (P7) zuerst noch grün, danach und im Lauf 20261013-0058 (P8) rot nach 11,8–12,4 s.

## Ursache

Umgebung, nicht Code. Der Prüfrechner (Intel N100) läuft seither ohne Turbo, fest auf 800 MHz
(`no_turbo` = 1, `scaling_max_freq` = `cpuinfo_max_freq` = 800000, Governor `powersave`;
[03-pbkdf2-messung.txt](03-pbkdf2-messung.txt)). Jeder Entsiegelungsversuch rechnet vor der Antwort
PBKDF2-HMAC-SHA-512 mit 600 000 Iterationen (HPC-0007, Beispiel `sperren.hpro`, P17-Beleg 68). In
Chromium braucht das bei 800 MHz **9 975 ms**, in Node 1 415 ms (WebCrypto in Chromium ist für SHA-512
hier rund siebenmal langsamer, für SHA-256 gleich schnell). Die Erwartung „Kennwort passt nicht“ wartet
mit der Voreinstellung von 10 000 ms; die Ableitung allein füllt diese Zeit aus. Der Reader verhält sich
richtig: nach rund 11 s zeigt er „Nicht geöffnet: Kennwort passt nicht.“ (mit einem Diagnoseskript
gegen `vite preview` beobachtet; dessen Ausgabe ist nicht abgelegt).

Die Frequenz des Hosts lässt sich aus dem Arbeitsverzeichnis heraus nicht ändern (kein sudo); die
Iterationszahl ist eine festgelegte Eigenschaft des Verfahrens und wird nicht gesenkt.

## Behebung

| Datei | Änderung |
|---|---|
| `app/e2e/sperren.spec.ts` | Konstante `UNSEAL_TIMEOUT` = 45 000 ms mit Begründung; nur die zwei Erwartungen, die auf eine Schlüsselableitung warten (falsches Kennwort → „Nicht geöffnet: Kennwort passt nicht.“; richtiges Kennwort → entsiegelter Abschnitt mit „Kalkulationsblatt K7“), warten so lange; Testzeit dafür 2 × 45 s + 60 s |
| `app/e2e/p17-belege.spec.ts` | dieselbe Änderung (Projekt `belege`, nicht Teil von `npm test`, hätte denselben Fehler) |

Keine Prüfung entfernt, abgeschwächt oder übersprungen: alle Erwartungen und erwarteten Texte sind
unverändert, die Datei `sperren.hpro` und ihre 600 000 Iterationen ebenso. Geändert ist nur, wie lange
auf das Ergebnis der absichtlich teuren Ableitung gewartet wird. Im Lauf danach braucht der Test
23,6 s (vorher, bei voller Taktung, 6,5 s).

## Belege (wörtliche Ausgaben mit Exit-Code)

| Datei | Befehl | Ergebnis |
|---|---|---|
| [01-npm-test-vorher.txt](01-npm-test-vorher.txt) | `npm ci`, `npm test --if-present` auf HEAD a154f60 | 1 Playwright-Test fehlgeschlagen, Exit 1 (Reproduktion) |
| [02-npm-test.txt](02-npm-test.txt) | `npm ci --no-audit --no-fund`, `npm test --if-present` (voller Prüflauf wie in der Bestandsprüfung) | Kern 552/552, 0 übersprungen; App-Unit 51/51; Playwright 69 bestanden; alle `*:check` und `*:selftest` OK; Exit 0 |
| [03-pbkdf2-messung.txt](03-pbkdf2-messung.txt) | Taktung des Prozessors; [`messung-pbkdf2.mjs`](messung-pbkdf2.mjs) | 800 MHz ohne Turbo; PBKDF2-SHA-512 600 000: Node 1 415 ms, Chromium 9 975 ms |

## Nicht geprüft

| Was | Warum nicht |
|---|---|
| warum der Host seit der Nacht zum 13.10.2026 ohne Turbo läuft | Einstellung des Hosts (Unraid), aus dem Container nicht einsehbar; sollte dort zurückgesetzt werden, sonst laufen auch alle anderen Prüfungen etwa viermal langsamer |
| Projekt `belege` (`npm run belege:p17`) mit der geänderten `p17-belege.spec.ts` | gehört nicht zum Prüflauf und würde die Belege unter `docs/belege/P17` neu schreiben |
| Wartezeit beim Entsiegeln für Nutzer | 10 s je Versuch auf langsamer Hardware ohne Fortschrittsanzeige ist ein Bedienungsthema für den Reader, keine Frage dieser Sanierung |
