# Sanierung des Bestands – Folgen der Umbenennung auf hpro

**Stand:** 12.10.2026 · **Anlass:** Bestandsprüfung `npm test --if-present` (runner/auto_lauf.py) rot nach Commit 97eed95 („Umbenennung auf hpro …“)

## Befund

`npm test` endete mit Exit-Code 1 ([01-npm-test-vorher.txt](01-npm-test-vorher.txt)). Kern: 458 Tests, 278 bestanden, 180 fehlgeschlagen:

| Tests | Fehlerbild |
|---|---|
| `conformance.test.js` 176 Fälle (33 gut, 143 schlecht) + `hpro-check: text and JSON output` | jedes Dokument der Testsuite meldet zusätzlich `HPR-PROF-001` (`conformsTo: https://html-pro.example/spec/0.1/profile/static ist kein gültiger Profilpfad`) und `HPR-META-001` (`@context enthält keinen hpro-Namensraum https://hpro.example/ns/v<major>`) |
| `sign.test.js` 2 Fälle „EU DSS 6.5 confirms …“ | `ClassNotFoundException: example.hpro.HproDss` |
| `signature.test.js` „signed objects match DSS … (V10/V11)“ | erwartet `CN=Testunterzeichner hpro,O=hpro Prototyp,C=AT`, der Container liefert `CN=Testunterzeichner html-Pro,O=html-Pro Prototyp,C=AT` |

Im selben Lauf schlug außerdem ein E2E-Test einmal fehl (`ENOENT … app/dist/kostenschaetzung.hpro`), obwohl die drei Tests davor dieselbe Datei geöffnet hatten. Im ersten Reproduktionslauf und im Lauf nach der Sanierung bestanden alle 35 E2E-Tests. Die Datei entsteht nur durch `vite build`. Wahrscheinlich hat ein gleichzeitig laufender Build `dist/` geleert; der Fehler ließ sich nicht wiederholen und wurde nicht weiter verfolgt.

## Ursache

Die Umbenennung hat Quelltexte und Generatoren umgestellt, aber die daraus erzeugten bzw. historischen Artefakte nicht nachgezogen:

1. `scripts/s3-testsuite.mjs` schreibt seit 97eed95 den Namensraum `https://hpro.example/ns/v0` und Profile unter `https://hpro.example/spec/…`. Die eingecheckten Dokumente `testsuite/dokumente/*.hpro` waren aber noch mit `html-pro.example` erzeugt. Der Prüfer erkennt den alten Namensraum zu Recht nicht mehr.
2. `HproDss.java` wurde auf `package example.hpro` umgestellt (Aufruf in `kern/test/sign.test.ts` und `prototyp/run_experiment.sh` ebenso). Die Datei lag aber weiter unter `example/htmlpro/`, und das nicht versionierte Kompilat `prototyp/dss/target/classes` enthielt nur die alte Klasse `example.htmlpro.HproDss`.
3. In `kern/test/signature.test.ts` wurde die erwartete Zertifikats-Subject-Zeile per Suchen-und-Ersetzen mit umbenannt. Der geprüfte Container `prototyp/ergebnisse/container/zielformat-2sig.epub` ist ein mit EU DSS signierter Prototyp-Beleg (docs/05). Sein Zertifikat `signer.pem` trägt tatsächlich `Testunterzeichner html-Pro` (siehe [02-behebung.txt](02-behebung.txt)).

## Behebung (keine Prüfung entfernt, abgeschwächt oder übersprungen)

| Änderung | Inhalt |
|---|---|
| `testsuite/dokumente/*.hpro`, `testsuite/faelle.json`, `testsuite/testzertifikat.pem` | mit dem unveränderten Generator `node scripts/s3-testsuite.mjs` neu erzeugt (180 Fälle, 33 gut, 147 schlecht). In `faelle.json` ändern sich nur die SHA-256-Werte. Das Zertifikat ist neu, weil der Generator für die signierten Fälle bei jedem Lauf einen neuen Testschlüssel anlegt. |
| `prototyp/dss/src/main/java/example/hpro/HproDss.java` | per `git mv` in das Verzeichnis verschoben, das zum Paket passt; Werkzeug mit `mvn -o package` neu gebaut, veraltete Klasse aus `target/classes/example/htmlpro/` entfernt (target/ ist nicht versioniert) |
| `kern/test/signature.test.ts` | Erwartung wieder auf das echte Subject des Prototyp-Zertifikats gesetzt, mit Kommentar. Die Prüfung bleibt genauso streng (`strictEqual` auf den vollständigen DN). |

## Belege (wörtliche Ausgaben mit Exit-Code)

| Datei | Befehl | Ergebnis |
|---|---|---|
| [01-npm-test-vorher.txt](01-npm-test-vorher.txt) | `npm test` auf HEAD 97eed95 | Kern 458 Tests, 180 fehlgeschlagen; Exit 1 |
| [02-behebung.txt](02-behebung.txt) | Neubau DSS-Werkzeug, Klassenliste, Aufruf `example.hpro.HproDss`, Subject von `signer.pem`, SHA-256 der neuen Testsuite | Build Exit 0; nur `example/hpro/HproDss.class` |
| [03-npm-test.txt](03-npm-test.txt) | `npm test --if-present` (voller Prüflauf wie in der Bestandsprüfung) | Kern 458/458 bestanden, 0 übersprungen; vitest 29/29; E2E 35/35; alle `*:check`/`*:selftest` OK; Exit 0 |

## Nicht geändert, aber aufgefallen

Commit 97eed95 hat auch wörtliche Laufprotokolle unter `prototyp/ergebnisse/*.txt` umgeschrieben. Ein Beispiel ist `00-werkzeuge.txt`: Dort steht jetzt `subject=… CN=Testunterzeichner hpro`, die abgelegte `signer.pem` sagt aber `html-Pro`. Diese Protokolle geben damit nicht mehr die echte Ausgabe wieder. Sie werden von keiner Prüfung gelesen und gehören nicht zu dieser Sanierung; empfohlen wird, sie aus 91cd00e wiederherzustellen.
