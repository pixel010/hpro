#!/usr/bin/env node
/**
 * Self-test of scripts/check-konformitaet.mjs: the real rule catalogue must pass, and deliberately
 * broken variants of it must fail with the expected error code. This proves the checker detects
 * what the acceptance criteria of package S2 demand: stable, unique, contiguous rule ids; rules
 * consistent with part 0 (level, grade/class, existing requirements); complete coverage of the
 * Muss/D requirements; vocabularies for scope, means, location and placeholders; security rules
 * with a rationale; generated tables and JSON catalogue in sync.
 *
 * Usage: node scripts/check-konformitaet-selftest.mjs [path] [--spec path]
 * Exit 0 = all cases behave as expected.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { checkCatalog, DEFAULT_DOC, DEFAULT_SPEC } from './check-konformitaet.mjs';

const args = process.argv.slice(2);
const path = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--spec') ?? DEFAULT_DOC;
const specPath = (() => { const i = args.indexOf('--spec'); return i >= 0 ? args[i + 1] : DEFAULT_SPEC; })();
const original = readFileSync(path, 'utf8');
const spec = readFileSync(specPath, 'utf8');

function mustContain(text, needle) {
  if (!text.includes(needle)) throw new Error(`fixture needs "${needle}" in the catalogue`);
  return text;
}
function replaceInRule(text, ruleId, from, to) {
  const i = mustContain(text, `#### ${ruleId}`).indexOf(`#### ${ruleId}`);
  const j = text.indexOf('\n#### ', i + 1);
  const block = text.slice(i, j);
  if (!block.includes(from)) throw new Error(`fixture: "${from}" not in ${ruleId}`);
  return text.slice(0, i) + block.replace(from, to) + text.slice(j);
}

const cases = [
  { name: 'gap in numbering (HPR-CONT-003 renamed to HPR-CONT-099)', mutate: (t) => t.replace('#### HPR-CONT-003 · Fehler · Basis', '#### HPR-CONT-099 · Fehler · Basis'), expect: 'numbering' },
  { name: 'duplicate id (HPR-INH-002 heading repeated as HPR-INH-001)', mutate: (t) => t.replace('#### HPR-INH-002 · Fehler · Basis', '#### HPR-INH-001 · Fehler · Basis'), expect: 'duplicate-id' },
  { name: 'heading without level', mutate: (t) => t.replace('#### HPR-ADR-001 · Fehler · Basis', '#### HPR-ADR-001 · Fehler'), expect: 'heading-format' },
  { name: 'unknown class', mutate: (t) => t.replace('#### HPR-ADR-001 · Fehler · Basis', '#### HPR-ADR-001 · Kritisch · Basis'), expect: 'unknown-class' },
  { name: 'unknown level', mutate: (t) => t.replace('#### HPR-ADR-001 · Fehler · Basis', '#### HPR-ADR-001 · Fehler · Premium'), expect: 'unknown-level' },
  { name: 'level of rule differs from its requirement (HPR-SBX-004 moved to Basis)', mutate: (t) => t.replace('#### HPR-SBX-004 · Fehler · Lebendig', '#### HPR-SBX-004 · Fehler · Basis'), expect: 'level-mismatch' },
  { name: 'class contradicts grade without Einstufung (HPR-CONT-016 as Hinweis)', mutate: (t) => t.replace('#### HPR-CONT-016 · Fehler · Basis', '#### HPR-CONT-016 · Hinweis · Basis'), expect: 'class-grade-mismatch' },
  { name: 'Einstufung with unknown word', mutate: (t) => replaceInRule(t, 'HPR-META-005', '*Einstufung:* Teilsatz', '*Einstufung:* Ausnahme'), expect: 'einstufung-invalid' },
  { name: 'Bezug names a requirement that does not exist', mutate: (t) => replaceInRule(t, 'HPR-CONT-002', '*Bezug:* HP-CONT-001', '*Bezug:* HP-CONT-999'), expect: 'unknown-requirement' },
  { name: 'missing Prüfung field', mutate: (t) => replaceInRule(t, 'HPR-CONT-002', '*Prüfung:*', '*Pruefung:*'), expect: 'missing-field' },
  { name: 'missing Meldung field', mutate: (t) => replaceInRule(t, 'HPR-CONT-002', '*Meldung:*', '*Text:*'), expect: 'missing-field' },
  { name: 'reader rule without Erwartung', mutate: (t) => replaceInRule(t, 'HPL-CONT-001', '*Erwartung:*', '*Ergebnis:*'), expect: 'missing-field' },
  { name: 'security rule without Begründung', mutate: (t) => replaceInRule(t, 'HPR-SBX-004', '*Begründung:*', '*Anmerkung:*'), expect: 'missing-begruendung' },
  { name: 'reader security rule without Begründung', mutate: (t) => replaceInRule(t, 'HPL-SBX-001', '*Begründung:*', '*Anmerkung:*'), expect: 'missing-begruendung' },
  { name: 'unknown Geltung', mutate: (t) => replaceInRule(t, 'HPR-CONT-002', '*Geltung:* Container', '*Geltung:* Welt'), expect: 'unknown-geltung' },
  { name: 'unknown Mittel', mutate: (t) => replaceInRule(t, 'HPR-CONT-002', '*Mittel:* statisch', '*Mittel:* magisch'), expect: 'unknown-mittel' },
  { name: 'Ort without known kind', mutate: (t) => replaceInRule(t, 'HPR-CONT-002', '*Ort:* `entry` mit `{pfad}`', '*Ort:* irgendwo'), expect: 'unknown-ort' },
  { name: 'unknown placeholder in Meldung', mutate: (t) => replaceInRule(t, 'HPR-CONT-002', '{methode}', '{method}'), expect: 'unknown-placeholder' },
  { name: 'dangling rule reference in prose', mutate: (t) => t.replace('Das Gefahrenmodell', 'Das Gefahrenmodell (siehe HPR-CONT-999)'), expect: 'dangling-rule-reference' },
  { name: 'dangling requirement reference in prose', mutate: (t) => t.replace('Das Gefahrenmodell', 'Das Gefahrenmodell (siehe HP-CONT-999)'), expect: 'dangling-requirement-reference' },
  { name: 'coverage gap (only rule for HP-SIG-019 removed)', mutate: (t) => { const i = t.indexOf('#### HPR-SIG-018'); const j = t.indexOf('\n#### ', i + 1); return t.slice(0, i) + t.slice(j + 1); }, expect: 'coverage-gap' },
  { name: 'coverage table row stale (HP-CONT-001 row edited)', mutate: (t) => t.replace(/^\| HP-CONT-001 \| Muss \| Basis \| D \| [^|]+\|/m, '| HP-CONT-001 | Muss | Basis | D | HPR-CONT-001 |'), expect: 'table-mismatch' },
  { name: 'coverage table row missing', mutate: (t) => t.replace(/^\| HP-CONT-002 \| .*\n/m, ''), expect: 'table-missing-id' },
  { name: 'summary table wrong', mutate: (t) => { const s = t.indexOf('SUMMENTABELLE-HPR ANFANG'); const row = t.indexOf('| Basis |', s); return t.slice(0, row) + '| Basis | 0 | 0 | 0 | 0 | 0 |' + t.slice(t.indexOf('\n', row)); }, expect: 'summary-mismatch' },
  { name: 'unknown source', mutate: (t) => t.replace('Das Gefahrenmodell', 'Das Gefahrenmodell [Q99]'), expect: 'unknown-source' },
  { name: 'JSON catalogue stale (title of HPR-CONT-002 changed)', mutate: (t) => replaceInRule(t, 'HPR-CONT-002', 'Ein Eintrag verwendet eine unzulässige Kompressionsmethode.', 'Ein Eintrag verwendet eine andere Kompressionsmethode.'), expect: 'catalog-json-stale' },
];

let failures = 0;
const base = checkCatalog(original, spec, { docPath: path });
if (!base.ok) { console.log('selftest: the real catalogue must pass first'); for (const e of base.errors) console.log(`  ${e.code} ${e.id ?? ''} ${e.detail ?? ''}`); process.exitCode = 1; }
else {
  console.log(`selftest: real catalogue OK (${base.documentRules} document rules, ${base.readerRules} reader rules)`);
  for (const c of cases) {
    let result;
    try { result = checkCatalog(c.mutate(original), spec, { docPath: path }); } catch (e) { console.log(`FAIL  ${c.name}: fixture error ${e.message}`); failures++; continue; }
    const found = result.errors.some((e) => e.code === c.expect);
    console.log(`${found ? 'ok   ' : 'FAIL '} ${c.name} -> expected ${c.expect}, got [${[...new Set(result.errors.map((e) => e.code))].join(', ') || 'no errors'}]`);
    if (!found) failures++;
  }
  console.log(failures === 0 ? `selftest: ${cases.length} broken variants detected` : `selftest: ${failures} of ${cases.length} cases FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}
