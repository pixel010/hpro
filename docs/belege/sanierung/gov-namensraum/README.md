# Sanierung des Bestands – Namensraum-URI außerhalb der Muster im Prüfer-Kern

**Stand:** 11.10.2026 · **Anlass:** `npm test` rot auf HEAD c223896

## Befund

`npm test` lief in den Kern-Tests (109 von 109), `spec:*`, `konf:*` und `form:*` grün, brach aber in
`npm run gov:check` ab ([01-gov-check-vorher.txt](01-gov-check-vorher.txt)):

```
ERROR namespace-pattern kern/src/check/rules-manifest.ts (line 95): https://hpro.example/ns/…
FAILED: 1 errors, 0 warnings
```

## Ursache

`scripts/check-governance.mjs` prüft (Regel `namespace-pattern`), dass jede URI unter
`https://hpro.example` in den Teilen der Spezifikation, der Registry, den Beispielen und in
`kern/src` einem Muster aus Teil 2, Abschnitt 5.1 folgt. Mit Commit 9f928e3 kam der Prüfer
`kern/src/check/` in den Bestand; dessen Befundtext zu HPR-META-001 nannte den Namensraum als
`https://hpro.example/ns/…`. Die Auslassung `…` ist weder ein gültiger Namensraum (`/ns/v<major>`)
noch die in der Spezifikation übliche Platzhalter-Schreibweise `<…>`, die der Prüfer als
Dokumentation erkennt. Der Fehler liegt also im neuen Kern-Text, nicht im Prüfer.

## Behebung

| Datei | Änderung |
|---|---|
| `kern/src/check/rules-manifest.ts` Zeile 95 | Befundtext nennt den Namensraum in der Schreibweise von Teil 2, Tabelle in Abschnitt 5.1: `https://hpro.example/ns/v<major>` statt `https://hpro.example/ns/…` |

Die Prüflogik (`startsWith('https://hpro.example/ns/')`) ist unverändert; kein Test und keine
Spezifikation hängen vom Wortlaut des Befundtexts ab. Prüfer, Selbsttests und Muster sind unverändert.

## Belege (wörtliche Ausgaben mit Exit-Code)

| Datei | Befehl | Ergebnis |
|---|---|---|
| [01-gov-check-vorher.txt](01-gov-check-vorher.txt) | `node scripts/check-governance.mjs` auf HEAD c223896 | 1 Fehler `namespace-pattern`, Exit 1 (Reproduktion) |
| [02-gov-check.txt](02-gov-check.txt) | `node scripts/check-governance.mjs` nach der Behebung | `OK: 0 errors, 0 warnings`, Exit 0 |
| [03-npm-test.txt](03-npm-test.txt) | `npm test` (voller Prüflauf) | Kern 109 Tests, 109 bestanden, 0 übersprungen; spec, konf, form, gov jeweils Check und Selbsttest OK; Exit 0 |
