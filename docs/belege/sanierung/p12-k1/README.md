# Sanierung des Bestands: Emulator und E2E-Skript nach dem P12-Lauf verwaist, Bestandstest über der Zeitgrenze

**Stand:** 13.10.2026 · **Anlass:** Der Läufer hat die Bestandsprüfung `npm test --if-present`
(`runner/auto_lauf.py`, Zeitgrenze `PRUEF_TIMEOUT` = 1800 s) um 21:43 gestartet und als rot gemeldet.
Das geschah nach dem P12-Lauf 20261013-1738, Commit 22d316d.

## Befund

Kein Test war rot. Die Bestandsprüfung hat die **Zeitgrenze von 1800 s überschritten** und endete
deshalb mit Exit 124 („Zeitüberschreitung“). `subprocess.run` beendete nur den obersten `npm`-Prozess.
Der eigentliche Prüflauf lief verwaist weiter (PPID 1) und schrieb noch bis 22:29:19 in das Protokoll
`/opt/data/html-pro-lauf/20261013-2143-P12.log`. Am Ende war er inhaltlich grün: Kern 611/611,
Vitest 55/55, Playwright 73/73, alle Prüfer OK. Er brauchte aber rund 46 Minuten.

## Ursache

Die Ursache lag in der Umgebung, nicht im Code und nicht in der Spezifikation. Es ist derselbe Mechanismus wie in
[../p12-bestand/](../p12-bestand/README.md). Der P12-Lauf 20261013-1738 hat um 19:05 den Android-Emulator
gestartet (`mobil/.tmp/emulator.pid` = 569820). Danach lief das Testskript `e2e-android.sh`
(`mobil/.tmp/lauf-lrp-3.log`). Der Lauf wurde gegen 21:43 abgebrochen, weil das Zeitbudget aufgebraucht war.
Dabei wurde `emu_stop` nicht aufgerufen. Emulator (QEMU ohne KVM, `-accel off`) und Skript liefen während der
ganzen Bestandsprüfung weiter:

| Zeit | Beleg ([02-zustand-und-aufraeumen.txt](02-zustand-und-aufraeumen.txt)) |
|---|---|
| 21:49:49, 21:53:06 | `lauf-lrp-3.log`: das verwaiste Skript wartet weiter auf die App im Emulator |
| 22:15:25 | letzte Zeile von `emulator.log`: `ERROR | detected a hanging thread 'QEMU2 CPU0 thread'` |
| 22:15:38 | `lauf-lrp-3.log`: `adb: device 'emulator-5560' not found`, `rc=1` |
| 22:29:57 | `memory.events`: `oom 23`, `oom_kill 12` (nach der letzten Sanierung um 17:55: 21 / 10) |

Zur selben Zeit hat die Bestandsprüfung CPU und die 2,5 GiB des Containers mit QEMU geteilt. Sie wurde
dadurch etwa siebenmal langsamer: 46 min statt 6,5 min ohne Emulator, siehe unten.
Der Emulator endete um 22:15. Das war erst nach Ablauf der Zeitgrenze, wahrscheinlich durch den OOM-Killer
(`oom_kill` +2). Den genauen Grund belegt das Kernel-Protokoll nicht, `dmesg` ist im Container nicht lesbar.
Die CPU war nicht gedrosselt (`scaling_max_freq` 3,4 GHz).

## Behebung

1. Ich habe gewartet, bis der verwaiste Bestandslauf zu Ende war. Ein eigener Lauf parallel dazu
   ([01-npm-test-vorher.txt](01-npm-test-vorher.txt), Exit 1) ist unbrauchbar. Seine 15 Playwright-Fälle
   scheiterten mit `net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4317/`. Er hatte den Preview-Server des
   verwaisten Laufs mitbenutzt (`reuseExistingServer`), und dieser Server endete mit jenem Lauf.
   Dieses Ergebnis zeigt die gegenseitige Störung, aber keinen Fehler im Bestand.
2. Ich habe die Reste mit der Funktion des Repos beendet, `emu_stop` aus `mobil/scripts/emulator.sh`. Dabei
   wurde der verwaiste adb-Server auf Port 5137 gestoppt. Danach liefen weder `qemu-system-x86`, `emulator`
   noch `adb`, und es lief kein Playwright- oder Preview-Prozess von html-pro mehr.
3. Danach habe ich den vollen Prüflauf allein ausgeführt ([03-npm-test.txt](03-npm-test.txt)).

Ich habe keine Prüfung, keine Zeitgrenze und keinen Test geändert. Code, Tests und Spezifikation sind unverändert.
Der Commit enthält nur diese Belege. Die offenen, nicht committeten P12-Änderungen unter `mobil/` und
`docs/belege/P12/` bleiben unberührt.

## Belege (wörtliche Ausgaben mit Exit-Code)

| Datei | Befehl | Ergebnis |
|---|---|---|
| [01-npm-test-vorher.txt](01-npm-test-vorher.txt) | `npm test --if-present`, parallel zum verwaisten Bestandslauf | Kern 611/611, Vitest 55/55, Playwright 58 bestanden / 15 `ERR_CONNECTION_REFUSED`, Exit 1 |
| [02-zustand-und-aufraeumen.txt](02-zustand-und-aufraeumen.txt) | Zustand, `emu_stop`, Nachkontrolle | Emulator-Spuren bis 22:15, adb-Server beendet, Exit 0 |
| [03-npm-test.txt](03-npm-test.txt) | `npm test --if-present` (voller Prüflauf wie in der Bestandsprüfung) | Kern 611 bestanden, 0 fehlgeschlagen, 0 übersprungen; Vitest 55/55; Playwright 73/73; alle `*:check`/`*:selftest` OK; `dienst:test` OK; **Exit 0 nach 391 s** (Grenze 1800 s) |

## Offen (nicht Teil dieser Sanierung)

Dasselbe Muster ist heute zum zweiten Mal aufgetreten: Ein P12-Lauf wird am Zeitbudget abgebrochen und hinterlässt
den Emulator. Dann überschreitet der nächste Bestandstest die Zeitgrenze. Dauerhaft helfen würde,
die Reste beim Abbruch zu beenden. Möglich wäre, dass der Läufer bei einer Zeitüberschreitung die ganze
Prozessgruppe beendet oder vor dem Bestandstest `emu_stop` aufruft. Möglich wäre auch eine Höchstlaufzeit
in `emu_start`. Das betrifft den Läufer bzw. das Paket P12 und wurde hier nicht geändert.
