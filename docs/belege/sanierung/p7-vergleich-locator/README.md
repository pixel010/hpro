# Sanierung des Bestands – mehrdeutiger Knopf „Vergleichen“ nach P7

**Stand:** 12.10.2026 · **Anlass:** Bestandsprüfung `npm test --if-present` (runner/auto_lauf.py) rot

## Befund

`npm test` lief im Kern grün (552 von 552) und in den App-Unit-Tests grün (51 von 51), brach aber
in den Playwright-Tests der App ab, 68 bestanden, 1 fehlgeschlagen
([01-npm-test-vorher.txt](01-npm-test-vorher.txt), HEAD 59e336d):

```
✘ e2e/bearbeiten.spec.ts:50:3 › Bearbeiten, Verlauf und Schwärzen (P5) › Abnahme 1 und 3 …
Error: locator.click: Error: strict mode violation: locator('#dlg-history').getByRole('button', { name: 'Vergleichen' }) resolved to 2 elements:
    1) <button type="button" id="diff-run">Vergleichen</button>
    2) <button type="button" id="diff-file-run">Mit anderer Datei vergleichen …</button>
```

Weil der Workspace-Test abbrach, liefen `spec:check`, `konf:check`, `form:check`, `gov:check`,
`hb:check` und ihre Selbsttests gar nicht erst.

## Ursache

P7 hat im Verlaufsdialog (`app/index.html`) den Knopf „Mit anderer Datei vergleichen …“ ergänzt.
Playwright vergleicht `getByRole(..., { name })` ohne `exact` als Teilzeichenkette ohne Beachtung
der Groß-/Kleinschreibung; der Locator des P5-Tests trifft deshalb seither beide Knöpfe. Die App
verhält sich richtig, der Locator ist mehrdeutig geworden.

## Behebung

| Datei | Änderung |
|---|---|
| `app/e2e/bearbeiten.spec.ts:96` | `{ name: 'Vergleichen', exact: true }` – trifft nur noch `#diff-run` |
| `app/e2e/p5-belege.spec.ts:46` | dieselbe Änderung (Projekt `belege`, nicht Teil von `npm test`, hätte denselben Fehler) |

Keine Prüfung entfernt, abgeschwächt oder übersprungen; der Locator ist strenger als vorher, alle
Erwartungen des Tests sind unverändert.

## Belege (wörtliche Ausgaben mit Exit-Code)

| Datei | Befehl | Ergebnis |
|---|---|---|
| [01-npm-test-vorher.txt](01-npm-test-vorher.txt) | `npm test` auf HEAD 59e336d | 1 Playwright-Test fehlgeschlagen, Exit 1 (Reproduktion) |
| [02-npm-test.txt](02-npm-test.txt) | `npm test --if-present` (voller Prüflauf wie in der Bestandsprüfung) | Kern 552/552, 0 übersprungen; App-Unit 51/51; Playwright 69 bestanden; alle `*:check` und `*:selftest` OK; Exit 0 |

## Nicht geprüft

| Was | Warum nicht |
|---|---|
| Projekt `belege` (`npm run belege`) mit der geänderten `p5-belege.spec.ts` | gehört nicht zum Prüflauf und würde die Belege unter `docs/belege/P4`/`P5` neu schreiben |
