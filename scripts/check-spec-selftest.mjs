#!/usr/bin/env node
/**
 * Self-test of scripts/check-spec.mjs: the real specification must pass, and deliberately
 * broken variants of it must fail with the expected error code. This proves the checker
 * detects what the acceptance criteria of package S1 demand (complete numbering, a level
 * and a test procedure for every requirement, no vendor names, sources resolvable).
 *
 * Usage: node scripts/check-spec-selftest.mjs [path]   (exit 0 = all cases behave as expected)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { checkSpec } from './check-spec.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const path = process.argv[2] ?? resolve(HERE, '..', 'docs', 'spezifikation', '00-spezifikation.md');
const original = readFileSync(path, 'utf8');

function mustContain(text, needle) {
  if (!text.includes(needle)) throw new Error(`fixture needs "${needle}" in the specification`);
  return text;
}

/** Each case mutates the real text and names the error code that must appear. */
const cases = [
  {
    name: 'gap in numbering (HP-CONT-003 renamed to HP-CONT-099)',
    mutate: (t) => mustContain(t, '#### HP-CONT-003 · Muss · Basis').replace('#### HP-CONT-003 · Muss · Basis', '#### HP-CONT-099 · Muss · Basis'),
    expect: 'numbering',
  },
  {
    name: 'duplicate id (HP-INH-002 heading repeated as HP-INH-001)',
    mutate: (t) => t.replace('#### HP-INH-002 · Muss · Basis', '#### HP-INH-001 · Muss · Basis'),
    expect: 'duplicate-id',
  },
  {
    name: 'missing level in heading',
    mutate: (t) => t.replace('#### HP-ADR-001 · Muss · Basis', '#### HP-ADR-001 · Muss'),
    expect: 'heading-format',
  },
  {
    name: 'unknown level',
    mutate: (t) => t.replace('#### HP-ADR-001 · Muss · Basis', '#### HP-ADR-001 · Muss · Premium'),
    expect: 'unknown-level',
  },
  {
    name: 'missing Prüfverfahren (first occurrence after HP-SIG-019 removed)',
    mutate: (t) => {
      const i = t.indexOf('#### HP-SIG-019');
      const j = t.indexOf('*Prüfverfahren:*', i);
      return t.slice(0, j) + '*Pruefung:*' + t.slice(j + '*Prüfverfahren:*'.length);
    },
    expect: 'missing-procedure',
  },
  {
    name: 'Prüfverfahren without expected result',
    mutate: (t) => {
      const i = t.indexOf('#### HP-LOCK-009');
      const j = t.indexOf('Erwartetes', i);
      return t.slice(0, j) + 'Erhofftes' + t.slice(j + 'Erwartetes'.length);
    },
    expect: 'procedure-without-expectation',
  },
  {
    name: 'grade keyword mismatch (Soll requirement without SOLL)',
    mutate: (t) => {
      const i = t.indexOf('#### HP-INH-007');
      const j = t.indexOf('*Prüfverfahren:*', i);
      return t.slice(0, i) + t.slice(i, j).replace(/SOLLEN/g, 'sollen').replace(/SOLL/g, 'soll') + t.slice(j);
    },
    expect: 'keyword-mismatch',
  },
  {
    name: 'vendor name in requirement text',
    mutate: (t) => {
      const i = t.indexOf('#### HP-CONT-001');
      const j = t.indexOf('\n', i) + 1;
      return t.slice(0, j) + 'Das Dokument MUSS mit Acrobat lesbar sein. ' + t.slice(j);
    },
    expect: 'vendor-name',
  },
  {
    name: 'unknown source [Q999]',
    mutate: (t) => {
      const i = t.indexOf('#### HP-CONT-002');
      const j = t.indexOf('*Grundlage:*', i);
      return t.slice(0, j) + '*Grundlage:* [Q999] Phantomquelle.' + t.slice(j + '*Grundlage:*'.length);
    },
    expect: 'unknown-source',
  },
  {
    name: 'Grundlage neither source nor own convention',
    mutate: (t) => {
      const i = t.indexOf('#### HP-CONT-002');
      const j = t.indexOf('*Grundlage:*', i);
      const k = t.indexOf('\n', j);
      return t.slice(0, j) + '*Grundlage:* irgendwo gelesen.' + t.slice(k);
    },
    expect: 'basis-without-source',
  },
  {
    name: 'conformance table row with wrong level',
    mutate: (t) => mustContain(t, '| HP-SIG-001 | Muss | Signiert |').replace('| HP-SIG-001 | Muss | Signiert |', '| HP-SIG-001 | Muss | Basis |'),
    expect: 'table-mismatch',
  },
  {
    name: 'requirement missing from conformance table',
    mutate: (t) => t.replace(/^\| HP-RS-012 \|.*\n/m, ''),
    expect: 'table-missing-id',
  },
  {
    name: 'summary counts wrong',
    mutate: (t) => t.replace(/^\| Archiv \| 2 \| 0 \| 0 \| 2 \|/m, '| Archiv | 3 | 0 | 0 | 3 |'),
    expect: 'summary-mismatch',
  },
  {
    name: 'conformance class count wrong (Leser-Konformität)',
    mutate: (t) => {
      const m = /^\| Leser-Konformität \| L \| (\d+) \|/m.exec(t);
      if (!m) throw new Error('class table row not found');
      return t.replace(m[0], `| Leser-Konformität | L | ${Number(m[1]) + 1} |`);
    },
    expect: 'class-count-mismatch',
  },
  {
    name: 'subject letter outside every conformance class',
    mutate: (t) => t.replace(/^\| Prüfer-Konformität \| P \|.*\n/m, ''),
    expect: 'class-subject-uncovered',
  },
  {
    name: 'touchstone section removed',
    mutate: (t) => t.replace(/^## (\d+)\. Prüfstein der Umsetzbarkeit.*$/m, '## $1. Platzhalter'),
    expect: 'touchstone-missing',
  },
  {
    name: 'touchstone procedure step 3 (Fragenprotokoll) removed',
    mutate: (t) => t.replace(/^3\. \*\*Fragenprotokoll:\*\*/m, '3. Fragenprotokoll:'),
    expect: 'touchstone-procedure',
  },
  {
    name: 'touchstone run table emptied',
    mutate: (t) => t.replace(/(PRUEFSTEIN-DURCHLAEUFE ANFANG -->\n)[\s\S]*?(<!-- PRUEFSTEIN-DURCHLAEUFE ENDE)/, '$1$2'),
    expect: 'touchstone-runs-missing',
  },
  {
    name: 'touchstone scope names a non-Basis requirement',
    mutate: (t) => t.replace('[HP-CONT-001](#hp-cont-001--muss--basis), [HP-CONT-002]', '[HP-SIG-001](#hp-sig-001--muss--signiert), [HP-CONT-002]'),
    expect: 'touchstone-scope-level',
  },
  {
    name: 'dangling cross reference',
    mutate: (t) => t.replace('[HP-SBX-004](#hp-sbx-004--muss--lebendig)', '[HP-SBX-404](#hp-sbx-404--muss--lebendig)'),
    expect: 'dangling-reference',
  },
  {
    name: 'stale anchor (grade in link differs from heading)',
    mutate: (t) => t.replace('(#hp-inh-013--muss--basis)', '(#hp-inh-013--soll--basis)'),
    expect: 'stale-anchor',
  },
];

let failures = 0;
const real = checkSpec(original);
console.log(`real specification: ${real.ok ? 'OK' : 'FAILED'} (${real.errors.length} errors, ${real.requirements} requirements)`);
if (!real.ok) { failures++; for (const e of real.errors) console.log(`  ${e.code} ${e.id ?? ''} ${e.detail ?? ''}`); }

for (const c of cases) {
  let outcome;
  try {
    const mutated = c.mutate(original);
    if (mutated === original) throw new Error('mutation had no effect');
    const r = checkSpec(mutated);
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
