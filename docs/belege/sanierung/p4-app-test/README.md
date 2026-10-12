# Sanierung des Bestands – Workspace `app` ohne Testskript

**Stand:** 12.10.2026 · **Anlass:** Bestandsprüfung `npm test --if-present` (runner/auto_lauf.py) rot nach Commit d5e670f (P4, Zwischenstand)

## Befund

`npm test` lief im Kern grün (291 Tests, 291 bestanden, 0 übersprungen), brach dann aber im
zweiten Workspace ab, bevor `spec:check` und die übrigen Prüfungen überhaupt liefen
([01-npm-test-vorher.txt](01-npm-test-vorher.txt)):

```
npm error Lifecycle script `test` failed with error:
npm error workspace @hpro/app@0.1.0
npm error location /opt/data/html-pro/app
npm error Missing script: "test"
```

## Ursache

Commit d5e670f (P4, abgebrochen mit „Kontingent erschöpft“) hat `app` in die `workspaces` der
Wurzel-`package.json` eingetragen. `app/package.json` hatte aber nur `dev` und `build`, kein `test`.
Das Wurzelskript `test` beginnt mit `npm test --workspaces`, und das verlangt in jedem Workspace ein
Skript `test`. Das `--if-present` der Bestandsprüfung gilt nur für die Wurzel und wird nicht an die
Workspaces weitergegeben. Das Verzeichnis `app/test/` war leer.

## Behebung (keine Prüfung entfernt oder abgeschwächt)

| Änderung | Inhalt |
|---|---|
| `app/package.json` | Skript `"test": "tsc --noEmit && vitest run"`: Typprüfung wie im Skript `build`, danach die Unit-Tests (vitest mit jsdom, Konfiguration stand schon in `app/vite.config.ts`) |
| `app/test/paths.test.ts` | 6 Tests: absolute URLs, Fragment, Auflösung relativer Verweise, Abweisung von Wurzel- und Ausbruchspfaden, kurze und lange Adressen (HP-ADR-003) |
| `app/test/toc.test.ts` | 3 Tests: Inhaltsverzeichnis aus `nav epub:type="toc"` (HP-ADR-007) mit Gruppen ohne Verweis, leeres Verzeichnis, Ersatzverzeichnis aus Überschriften |
| `app/test/search.test.ts` | 6 Tests: Faltung der Suchanfrage, Treffer über Inline-Auszeichnung, aber nicht über Blockgrenzen, Auslassen von Skript und Leseransicht, Einschluss von `details`, Treffer mit Nummer, Adresse und Ausschnitt, Trefferlimit (HP-RS-003) |

Das Wurzelskript `test`, der Kern und alle Prüfer sind unverändert. Die Tests decken nur die Module,
die im Zwischenstand von P4 schon vorhanden sind (`paths.ts`, `toc.ts`, `search.ts`).

## Belege (wörtliche Ausgaben mit Exit-Code)

| Datei | Befehl | Ergebnis |
|---|---|---|
| [01-npm-test-vorher.txt](01-npm-test-vorher.txt) | `npm test --if-present` auf dem Stand von HEAD d5e670f (Änderungen unter `app/` beiseitegelegt) | Kern 291 von 291, dann `Missing script: "test"` im Workspace `@hpro/app`, Exit 1 (Reproduktion) |
| [02-npm-ci.txt](02-npm-ci.txt) | `npm ci --no-audit --no-fund` | Exit 0 |
| [03-npm-test.txt](03-npm-test.txt) | `npm test --if-present` (voller Prüflauf wie in der Bestandsprüfung) | Kern 291 Tests, 291 bestanden, 0 übersprungen; App 3 Testdateien, 15 Tests bestanden; `spec`, `konf`, `form`, `gov`, `hb` Prüfung und Selbsttest OK; Exit 0 |

## Nicht geprüft

| Was | Warum nicht |
|---|---|
| `app/src/document.ts` | braucht einen geladenen Container. Das gehört zum Smoke-Test von P4 (Paket offen) |
| `app/src/sw.ts` | ist aus `app/tsconfig.json` ausgenommen. `tsc -p app/tsconfig.sw.json` meldet im Zwischenstand 11 Typfehler. Das Skript `build` prüft diese Konfiguration nicht, und sie ist nicht Teil von `npm test`. Bleibt für P4 offen |
| `npm run build -w app` | `app/index.html` fehlt im Zwischenstand. Der Build ist nicht Teil von `npm test`, gehört zu P4 |
