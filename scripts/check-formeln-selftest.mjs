#!/usr/bin/env node
/**
 * Self-test of scripts/check-formeln.mjs: the real Teil 3 must pass, and deliberately broken
 * variants must fail with the expected error code. This proves the checker detects what the
 * acceptance criteria of package S6 demand (complete numbering, level and test procedure for every
 * requirement, function list with signature/error behaviour/source, reference values, no forbidden
 * function in the supported list).
 *
 * Usage: node scripts/check-formeln-selftest.mjs [path]   (exit 0 = all cases behave as expected)
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { checkSpec } from './check-formeln.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const path = process.argv[2] ?? resolve(HERE, '..', 'docs', 'spezifikation', '03-tabellen-und-formeln.md');
const original = readFileSync(path, 'utf8');
const teil0Text = readFileSync(resolve(HERE, '..', 'docs', 'spezifikation', '00-spezifikation.md'), 'utf8');
const jsonPath = resolve(HERE, '..', 'docs', 'spezifikation', '03-funktionen.json');
const jsonText = existsSync(jsonPath) ? readFileSync(jsonPath, 'utf8') : undefined;

function mustContain(text, needle) {
  if (!text.includes(needle)) throw new Error(`fixture needs "${needle}" in the specification`);
  return text;
}
function replaceInBlock(t, id, from, to) {
  const i = t.indexOf(`#### ${id}`);
  if (i < 0) throw new Error(`fixture needs ${id}`);
  const j = t.indexOf('\n#### ', i + 1);
  const block = t.slice(i, j);
  if (!block.includes(from)) throw new Error(`fixture needs "${from}" in ${id}`);
  return t.slice(0, i) + block.replace(from, to) + t.slice(j);
}

const cases = [
  { name: 'gap in numbering (HPF-SYN-003 renamed to HPF-SYN-099)', mutate: (t) => mustContain(t, '#### HPF-SYN-003 · Muss · Basis').replace('#### HPF-SYN-003 · Muss · Basis', '#### HPF-SYN-099 · Muss · Basis'), expect: 'numbering' },
  { name: 'duplicate id (HPF-TYP-002 heading repeated as HPF-TYP-001)', mutate: (t) => t.replace('#### HPF-TYP-002 · Muss · Basis', '#### HPF-TYP-001 · Muss · Basis'), expect: 'duplicate-id' },
  { name: 'missing level in heading', mutate: (t) => t.replace('#### HPF-NUM-001 · Muss · Basis', '#### HPF-NUM-001 · Muss'), expect: 'heading-format' },
  { name: 'unknown level', mutate: (t) => t.replace('#### HPF-NUM-001 · Muss · Basis', '#### HPF-NUM-001 · Muss · Premium'), expect: 'unknown-level' },
  { name: 'unknown grade', mutate: (t) => t.replace('#### HPF-NUM-001 · Muss · Basis', '#### HPF-NUM-001 · Darf · Basis'), expect: 'unknown-grade' },
  { name: 'missing Prüfverfahren (HPF-DAT-002)', mutate: (t) => replaceInBlock(t, 'HPF-DAT-002', '*Prüfverfahren:*', '*Pruefung:*'), expect: 'missing-procedure' },
  { name: 'Prüfverfahren without expected result (HPF-ERR-001)', mutate: (t) => replaceInBlock(t, 'HPF-ERR-001', 'Erwartetes Ergebnis', 'Erhofftes Ergebnis'), expect: 'procedure-without-expectation' },
  { name: 'grade keyword mismatch (Soll requirement without SOLL, HPF-NUM-007)', mutate: (t) => replaceInBlock(t, 'HPF-NUM-007', 'SOLLEN', 'sollen'), expect: 'keyword-mismatch' },
  { name: 'vendor name in requirement text', mutate: (t) => replaceInBlock(t, 'HPF-CALC-001', 'Ein Rechner MUSS deterministisch sein', 'Ein Rechner MUSS wie Excel deterministisch sein'), expect: 'vendor-name' },
  { name: 'unknown source [Q999]', mutate: (t) => replaceInBlock(t, 'HPF-SYN-011', '*Grundlage:* [Q1] §5.14.', '*Grundlage:* [Q999] Phantomquelle.'), expect: 'unknown-source' },
  { name: 'Grundlage neither source nor own convention', mutate: (t) => replaceInBlock(t, 'HPF-SYN-011', '*Grundlage:* [Q1] §5.14.', '*Grundlage:* irgendwo gelesen.'), expect: 'basis-without-source' },
  { name: 'dangling reference to HPF-SYN-404', mutate: (t) => t.replace('[HPF-ADR-001](#hpf-adr-001--muss--basis)', '[HPF-SYN-404](#hpf-syn-404--muss--basis)'), expect: 'dangling-reference' },
  { name: 'stale anchor (grade in link differs from heading)', mutate: (t) => t.replace('(#hpf-typ-002--muss--basis)', '(#hpf-typ-002--soll--basis)'), expect: 'stale-anchor' },
  { name: 'dangling reference to Teil 0 (HP-SBX-999)', mutate: (t) => t.replace('[HP-SBX-016](00-spezifikation.md#hp-sbx-016--muss--basis)', '[HP-SBX-999](00-spezifikation.md#hp-sbx-999--muss--basis)'), expect: 'dangling-teil0-reference' },
  { name: 'stale Teil-0 anchor', mutate: (t) => t.replace('(00-spezifikation.md#hp-prof-007--muss--signiert)', '(00-spezifikation.md#hp-prof-007--soll--signiert)'), expect: 'stale-teil0-anchor' },
  { name: 'function row without OpenFormula section', mutate: (t) => mustContain(t, '| 6.16.61 |').replace('| 6.16.61 |', '| irgendwo |'), expect: 'function-source' },
  { name: 'function row with empty error column', mutate: (t) => mustContain(t, '| ABS | `ABS(Number N)` | Number | Fehler werden weitergereicht | 6.16.2 |').replace('| ABS | `ABS(Number N)` | Number | Fehler werden weitergereicht | 6.16.2 |', '| ABS | `ABS(Number N)` | Number |  | 6.16.2 |'), expect: 'function-errors' },
  { name: 'function listed twice', mutate: (t) => t.replace('| SIGN | `SIGN(Number N)`', '| ABS | `ABS(Number N)`'), expect: 'function-duplicate' },
  { name: 'forbidden function (NOW) added to supported list', mutate: (t) => t.replace('| YEAR | `YEAR(DateParam D)` | Number | – | 6.10.23 |', '| YEAR | `YEAR(DateParam D)` | Number | – | 6.10.23 |\n| NOW | `NOW()` | Number | – | 6.10.15 |'), expect: 'forbidden-supported' },
  { name: 'forbidden function (RAND) removed from exclusion list', mutate: (t) => mustContain(t, '| RAND, RANDBETWEEN |').replace('| RAND, RANDBETWEEN |', '| RANDBETWEEN |'), expect: 'forbidden-not-excluded' },
  { name: 'fewer than 40 functions', mutate: (t) => { const s = t.indexOf('<!-- FUNKTIONSLISTE ANFANG -->'); const e = t.indexOf('<!-- FUNKTIONSLISTE ENDE -->'); const rows = t.slice(s, e).split('\n'); return t.slice(0, s) + rows.slice(0, 20).join('\n') + '\n' + t.slice(e); }, expect: 'function-count' },
  { name: 'formula example with unknown function', mutate: (t) => replaceInBlock(t, 'HPF-SYN-011', '`=SUM([.A1:.A3])`', '`=SUMME([.A1:.A3])`'), expect: 'formula-unknown-function' },
  { name: 'formula example with comma separator', mutate: (t) => replaceInBlock(t, 'HPF-TYP-003', '`=IF(2;"a";"b")`', '`=IF(2,"a","b")`'), expect: 'formula-separator' },
  { name: 'formula example with unbracketed reference', mutate: (t) => replaceInBlock(t, 'HPF-SYN-011', '`=SUM([.A1:.A3])`', '`=SUM([A1:A3])`'), expect: 'formula-reference-syntax' },
  { name: 'undeclared error name used', mutate: (t) => replaceInBlock(t, 'HPF-NUM-003', '`#DIV/0!`, `#DIV/0!`', '`#DIV/0!`, `#BOOM!`'), expect: 'unknown-error-name' },
  { name: 'host property row removed', mutate: (t) => t.replace(/^\| HOST-NULL-DATE \|.*\n/m, ''), expect: 'host-property-missing' },
  { name: 'reference value wrong (R6)', mutate: (t) => mustContain(t, '| R6 | `=0.1+0.2` | `0.30000000000000004` |').replace('| R6 | `=0.1+0.2` | `0.30000000000000004` |', '| R6 | `=0.1+0.2` | `0.3` |'), expect: 'reference-value-mismatch' },
  { name: 'reference value row removed (R29)', mutate: (t) => t.replace(/^\| R29 \|.*\n/m, ''), expect: 'reference-value-missing' },
  { name: 'conformance table row with wrong level', mutate: (t) => mustContain(t, '| HPF-FRZ-001 | Muss | Signiert |').replace('| HPF-FRZ-001 | Muss | Signiert |', '| HPF-FRZ-001 | Muss | Basis |'), expect: 'table-mismatch' },
  { name: 'requirement missing from conformance table', mutate: (t) => t.replace(/^\| HPF-SEC-004 \|.*\n/m, ''), expect: 'table-missing-id' },
  { name: 'summary counts wrong', mutate: (t) => t.replace(/^\| Archiv \| 1 \| 0 \| 0 \| 1 \|/m, '| Archiv | 2 | 0 | 0 | 2 |'), expect: 'summary-mismatch' },
  { name: 'machine-readable function list stale', mutate: (t) => t.replace('| ABS | `ABS(Number N)` | Number | Fehler werden weitergereicht |', '| ABS | `ABS(Number N)` | Number | Fehler werden stets weitergereicht |'), expect: 'functions-json-stale' },
];

let failures = 0;
const real = checkSpec(original, { teil0Text, jsonText });
console.log(`real specification: ${real.ok ? 'OK' : 'FAILED'} (${real.errors.length} errors, ${real.requirements} requirements, ${real.functions} functions)`);
if (!real.ok) { failures++; for (const e of real.errors) console.log(`  ${e.code} ${e.id ?? ''} ${e.detail ?? ''}`); }

for (const c of cases) {
  let outcome;
  try {
    const mutated = c.mutate(original);
    if (mutated === original) throw new Error('mutation had no effect');
    const r = checkSpec(mutated, { teil0Text, jsonText });
    const hit = r.errors.some((e) => e.code === c.expect);
    outcome = hit ? `ok   (detected ${c.expect}, ${r.errors.length} error(s))` : `FAIL (expected ${c.expect}, got ${r.errors.map((e) => e.code).join(',') || 'nothing'})`;
    if (!hit) failures++;
  } catch (e) {
    outcome = `FAIL (${e.message})`;
    failures++;
  }
  console.log(`${outcome}  ${c.name}`);
}
console.log(failures === 0 ? `selftest OK: ${cases.length} broken variants detected, real specification passes` : `selftest FAILED: ${failures} problem(s)`);
process.exitCode = failures === 0 ? 0 : 1;
