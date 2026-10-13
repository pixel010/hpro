# Sanierung des Bestands – verwaister Android-Emulator aus dem abgebrochenen P12-Lauf

**Stand:** 13.10.2026 · **Anlass:** Bestandsprüfung `npm test --if-present` (runner/auto_lauf.py) rot nach
Commit 4dcd1d1 „P12: Zwischenstand (Zeitbudget aufgebraucht)“

## Befund

`npm test --if-present` endete mit Exit 1 ([01-npm-test-vorher.txt](01-npm-test-vorher.txt)). Die
Kern-Tests liefen grün (611 von 611). In `@hpro/app` scheiterten aber zwei Vitest-Fälle **nur an
der Zeitgrenze von 5 s**:

```
× test/editor.test.ts > reader search after redaction (criterion 2) > finds the term before and nothing after … 13436ms
× test/formview.test.ts > FormSession > Absenden: der Kern lehnt ungültige Eingaben ab … 9843ms
Error: Test timed out in 5000ms.
Test Files  2 failed | 8 passed (10) · Tests  2 failed | 53 passed (55) · Duration 123.71s
```

## Ursache

Die Ursache lag in der Umgebung, nicht im Code und nicht in der Spezifikation. Der P12-Lauf (Mobil-Spike) startete
um 16:35:41 den Android-Emulator (`mobil/scripts/emulator.sh`, `emu_start`: `setsid nohup emulator … -accel off`).
Er wurde wegen des Zeitbudgets abgebrochen, bevor `emu_stop` lief. QEMU lief danach verwaist
weiter (PPID 1) und belastete den Container dauerhaft ([02-emulator-stoppen.txt](02-emulator-stoppen.txt)):

| Messgröße (17:55:21) | Wert |
|---|---|
| QEMU (Software-Emulation ohne KVM) | 89,5 % CPU im Mittel über 1 h 19 min, RSS 1,2 GiB |
| Container-Speicher `memory.current` / `memory.max` | 2204 MiB / 2560 MiB |
| Container-Swap `memory.swap.current` | 1793 MiB |
| `memory.events` | `max 8240038`, `oom 21`, `oom_kill 10` |

Mit nur rund 350 MiB Restspeicher lagerte der Prüflauf ständig in den Swap aus. Vitest brauchte 123,7 s,
davon 223 s summiertes Transformieren, und zwei Fälle überschritten 5 s. Die CPU war nicht gedrosselt
(`scaling_max_freq` 3,4 GHz, Kerne bei 2,9 GHz).

## Behebung

Ich habe den verwaisten Emulator mit der Funktion des Repos beendet, `emu_stop` aus `mobil/scripts/emulator.sh`.
Diese Funktion beendet ihn mit `adb emu kill`, danach mit `pkill -x qemu-system-x86` und stoppt den eigenen
adb-Server auf Port 5137. Danach liefen weder `qemu-system-x86`, `netsimd` noch `emulator`, und der
Container-Speicher sank auf 1016 MiB.

Ich habe keine Prüfung, keine Zeitgrenze und keinen Test geändert. Code, Tests und Spezifikation sind unverändert,
der Commit enthält nur diese Belege. Das AVD `hpro35` unter `mobil/.werkzeug/android-user/avd` bleibt erhalten,
ein späterer P12-Lauf startet den Emulator mit `emu_start` neu.

## Belege (wörtliche Ausgaben mit Exit-Code)

| Datei | Befehl | Ergebnis |
|---|---|---|
| [01-npm-test-vorher.txt](01-npm-test-vorher.txt) | `npm test --if-present` mit laufendem Emulator | Kern 611/611; App-Vitest 2 Zeitüberschreitungen, 53/55; Exit 1 (Reproduktion) |
| [02-emulator-stoppen.txt](02-emulator-stoppen.txt) | Zustand vorher, `emu_stop`, Zustand nachher | QEMU-Prozess 549936 (PPID 1, 1,2 GiB) beendet; Container 2204 → 1016 MiB; Exit 0 |
| [03-npm-test.txt](03-npm-test.txt) | `npm test --if-present` (voller Prüflauf wie in der Bestandsprüfung) | Kern 611/611, 0 übersprungen; App-Vitest 55/55 in 24,5 s; Playwright 73 bestanden; spec/konf/form/gov/hb-Prüfer und Selbsttests OK; dienst:test OK; Exit 0 |

In `02-emulator-stoppen.txt` habe ich zwei Ausgaben von `pgrep -af` entfernt. Sie trafen nur die
eigene Shell, deren Befehlszeile die Suchwörter enthielt. Das ist in der Datei vermerkt, die genaue
Nachkontrolle mit `pgrep -x` steht darunter.

## Hinweis für P12

Das Skript startet den Emulator mit `setsid nohup`. Er überlebt deshalb jeden Abbruch des Laufs, auch
eine `trap` im aufrufenden Skript hilft dann nicht. Wer den Emulator startet, muss vor dem Ende des
Laufs `emu_stop` aufrufen. Sonst wird der nächste Bestandstest wieder rot.

## Nicht geprüft

| Was | Warum nicht |
|---|---|
| ob die zwei Fälle auch ohne Emulator unter anderer Fremdlast über 5 s kommen | nicht Teil dieser Sanierung; im Lauf 03 brauchte die ganze Vitest-Stufe 24,5 s |
| Zustand des P12-Emulators (Boot, installierte Apps) für die Fortsetzung von P12 | gehört zum Paket P12 |
