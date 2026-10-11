#!/usr/bin/env node
/**
 * Self-test of scripts/check-governance.mjs: the real Teil 2 must pass, and deliberately broken
 * variants (of the text, the registry and the example containers) must fail with the expected
 * error code. This proves the checker detects what the acceptance criteria of package S4 demand:
 * complete numbering with grade/level/procedure, change log with numbering and status, registry
 * in sync with the tables, reserved prefixes, namespace patterns, Fremdrechte-Register, and the
 * valid/invalid extension examples behaving as documented.
 *
 * Usage: node scripts/check-governance-selftest.mjs [path] [--skip-examples]
 * Exit 0 = all cases behave as expected.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { checkSpec, loadOptions, loadExamples } from './check-governance.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const skipExamples = args.includes('--skip-examples');
const path = args.find((a) => !a.startsWith('--')) ?? resolve(HERE, '..', 'docs', 'spezifikation', '02-lizenz-und-governance.md');
const original = readFileSync(path, 'utf8');
const base = loadOptions({ skipExamples });
if (!skipExamples) base.examples = await loadExamples();

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
const withRegistry = (mutate) => ({ ...base, registryText: JSON.stringify(mutate(JSON.parse(base.registryText))) });
const withExamples = (mutate) => ({ ...base, examples: base.examples ? mutate(structuredClone(base.examples)) : base.examples });
const withParts = (name, mutate) => { const parts = new Map(base.partsTexts); parts.set(name, mutate(parts.get(name))); return { ...base, partsTexts: parts }; };

const cases = [
  { name: 'gap in numbering (HPG-LIC-003 renamed to HPG-LIC-099)', mutate: (t) => mustContain(t, '#### HPG-LIC-003 · Muss · Basis').replace('#### HPG-LIC-003 · Muss · Basis', '#### HPG-LIC-099 · Muss · Basis'), expect: 'numbering' },
  { name: 'duplicate id', mutate: (t) => t.replace('#### HPG-GOV-002 · Muss · Basis', '#### HPG-GOV-001 · Muss · Basis'), expect: 'duplicate-id' },
  { name: 'missing level in heading', mutate: (t) => t.replace('#### HPG-VER-001 · Muss · Basis', '#### HPG-VER-001 · Muss'), expect: 'heading-format' },
  { name: 'unknown level', mutate: (t) => t.replace('#### HPG-VER-001 · Muss · Basis', '#### HPG-VER-001 · Muss · Premium'), expect: 'unknown-level' },
  { name: 'unknown grade', mutate: (t) => t.replace('#### HPG-VER-001 · Muss · Basis', '#### HPG-VER-001 · Darf · Basis'), expect: 'unknown-grade' },
  { name: 'missing Prüfverfahren (HPG-NS-003)', mutate: (t) => replaceInBlock(t, 'HPG-NS-003', '*Prüfverfahren:*', '*Pruefung:*'), expect: 'missing-procedure' },
  { name: 'Prüfverfahren without expected result (HPG-REG-003)', mutate: (t) => replaceInBlock(t, 'HPG-REG-003', 'Erwartetes Ergebnis', 'Erhofftes Ergebnis'), expect: 'procedure-without-expectation' },
  { name: 'grade keyword mismatch (Soll without SOLL, HPG-GOV-008)', mutate: (t) => replaceInBlock(t, 'HPG-GOV-008', 'SOLL einen vertraulichen', 'soll einen vertraulichen').replace('SOLL innerhalb von 90 Tagen', 'soll innerhalb von 90 Tagen'), expect: 'keyword-mismatch' },
  { name: 'vendor name in requirement text', mutate: (t) => replaceInBlock(t, 'HPG-LIC-003', 'Die Referenzimplementierung MUSS', 'Die Referenzimplementierung MUSS wie bei Adobe'), expect: 'vendor-name' },
  { name: 'unknown source [Q999]', mutate: (t) => replaceInBlock(t, 'HPG-VER-009', '[Q31] SemVer 2.0.0 §4', '[Q999] Phantomquelle'), expect: 'unknown-source' },
  { name: 'Grundlage neither source nor own convention', mutate: (t) => replaceInBlock(t, 'HPG-VER-009', '*Grundlage:* [Q31] SemVer 2.0.0 §4 (0.y.z: alles kann sich ändern).', '*Grundlage:* irgendwo gelesen.'), expect: 'basis-without-source' },
  { name: 'dangling reference to HPG-GOV-404', mutate: (t) => t.replace('[HPG-VER-001](#hpg-ver-001--muss--basis)', '[HPG-GOV-404](#hpg-gov-404--muss--basis)'), expect: 'dangling-reference' },
  { name: 'stale anchor (grade in link differs from heading)', mutate: (t) => t.replace('(#hpg-ext-001--muss--basis)', '(#hpg-ext-001--soll--basis)'), expect: 'stale-anchor' },
  { name: 'dangling reference to Teil 0 (HP-VERS-999)', mutate: (t) => t.replace('[HP-VERS-004](00-spezifikation.md#hp-vers-004--muss--basis)', '[HP-VERS-999](00-spezifikation.md#hp-vers-999--muss--basis)'), expect: 'dangling-teil0-reference' },
  { name: 'stale Teil-0 anchor', mutate: (t) => t.replace('(00-spezifikation.md#hp-cont-013--muss--basis)', '(00-spezifikation.md#hp-cont-013--soll--basis)'), expect: 'stale-teil0-anchor' },
  { name: 'conformance table row with wrong grade', mutate: (t) => mustContain(t, '| HPG-LIC-001 | Muss | Basis |').replace('| HPG-LIC-001 | Muss | Basis |', '| HPG-LIC-001 | Soll | Basis |'), expect: 'table-mismatch' },
  { name: 'conformance table row missing', mutate: (t) => t.replace(/\| HPG-REG-006 \| Kann \| Basis \|[^\n]*\n/, ''), expect: 'table-missing-id' },
  { name: 'summary with wrong count', mutate: (t) => mustContain(t, '| **alle** | **35** |').replace('| **alle** | **35** |', '| **alle** | **36** |'), expect: 'summary-mismatch' },
  { name: 'change log with gap (HPC-0002 renamed to HPC-0003)', mutate: (t) => mustContain(t, '| HPC-0002 |').replace('| HPC-0002 |', '| HPC-0003 |'), expect: 'change-numbering' },
  { name: 'change log with unknown status', mutate: (t) => mustContain(t, '| Erratum | umgesetzt |').replace('| Erratum | umgesetzt |', '| Erratum | erledigt |'), expect: 'change-status' },
  { name: 'change log with unknown class', mutate: (t) => t.replace('| Erratum | umgesetzt |', '| Patch | umgesetzt |'), expect: 'change-class' },
  { name: 'contributor without Patentzusage state', mutate: (t) => mustContain(t, '| 2026-10-10 | ausstehend |').replace('| 2026-10-10 | ausstehend |', '| 2026-10-10 | vielleicht |'), expect: 'contributors-state' },
  { name: 'Fremdrechte-Register without ETSI row', mutate: (t) => t.replace(/\| ETSI \|[^\n]*\n/, ''), expect: 'ipr-register' },
  { name: 'Teil 0 cites an organisation missing from the register', opts: () => withParts('00-spezifikation.md', (t) => t + '\n- [Q99] Phantom Consortium, *Phantom Spec* – https://phantom.invalid/\n'), expect: 'ipr-register' },
  { name: 'version mismatch between parts', opts: () => withParts('03-tabellen-und-formeln.md', (t) => t.replace('**Status:** Arbeitsentwurf 0.1', '**Status:** Arbeitsentwurf 0.2')), expect: 'version-mismatch' },
  { name: 'registry: extension with reserved kennung (status aktiv)', opts: () => withRegistry((r) => { r.extensions.push({ kennung: 'epub', id: 'https://x.example.org/ns', owner: 'x', contact: 'x', url: 'https://x.example.org/', status: 'aktiv', registered: '2026-10-11' }); return r; }), expect: 'reserved-kennung' },
  { name: 'registry: kennung violating the pattern', opts: () => withRegistry((r) => { r.extensions.push({ kennung: '9x', id: 'https://x.example.org/ns', owner: 'x', contact: 'x', url: 'https://x.example.org/', status: 'aktiv', registered: '2026-10-11' }); return r; }), expect: 'kennung-pattern' },
  { name: 'registry: extension without contact', opts: () => withRegistry((r) => { delete r.extensions[0].contact; return r; }), expect: 'registry-field' },
  { name: 'registry: unknown status', opts: () => withRegistry((r) => { r.extensions[0].status = 'geheim'; return r; }), expect: 'registry-status' },
  { name: 'registry: status aufgenommen without change id', opts: () => withRegistry((r) => { r.extensions[0].status = 'aufgenommen'; return r; }), expect: 'extension-adopted-without-change' },
  { name: 'registry: component removed from JSON but still in table', opts: () => withRegistry((r) => { r.components = r.components.filter((c) => c.name !== 'hp-chart'); return r; }), expect: 'registry-table-extra-row' },
  { name: 'registry: component status differs from table', opts: () => withRegistry((r) => { r.components[0].status = 'spezifiziert'; return r; }), expect: 'registry-table-mismatch' },
  { name: 'registry: reserved kennung missing from table', mutate: (t) => t.replace(/\| xades \|[^\n]*\n/, ''), expect: 'registry-table-missing-row' },
  { name: 'namespace URI outside the patterns', mutate: (t) => t.replace('`https://html-pro.example/ext/kalk`', '`https://html-pro.example/plugins/kalk`'), expect: 'namespace-pattern' },
  { name: 'invalid example table lists a finding the checker does not report', mutate: (t) => mustContain(t, '<!-- BEISPIEL-UNGUELTIG ENDE -->').replace('<!-- BEISPIEL-UNGUELTIG ENDE -->', '| HPR-SBX-004 | content/index.xhtml | Inline-Skript |\n<!-- BEISPIEL-UNGUELTIG ENDE -->'), expect: 'example-findings', needsExamples: true },
  { name: 'checker reports a finding the table does not list', mutate: (t) => t.replace(/\| HPR-VERS-005 \| ext\/kalk\/rechner\.js \|[^\n]*\n/, ''), expect: 'example-findings', needsExamples: true },
  { name: 'valid example with an error finding', opts: () => withExamples((e) => { e.gueltig.findings.push({ rule: 'HPR-VERS-003', class: 'ERROR', location: 'content/index.xhtml:1', message: 'simuliert' }); return e; }), expect: 'example-findings', needsExamples: true },
];

let failed = 0;
const baseline = checkSpec(original, base);
if (!baseline.ok) {
  console.log(`selftest: the unmodified specification must pass, but has ${baseline.errors.length} error(s):`);
  for (const e of baseline.errors) console.log(`  ${e.code} ${e.id ?? ''} ${e.detail ?? ''}`);
  process.exit(1);
}
console.log(`baseline: OK (${baseline.requirements.length} requirements, 0 errors, ${baseline.warnings.length} warnings)`);
let ran = 0;
for (const c of cases) {
  if (c.needsExamples && !base.examples) { console.log(`skip  ${c.name} (examples not built)`); continue; }
  ran++;
  let text = original;
  let opts = base;
  try {
    if (c.mutate) text = c.mutate(original);
    if (c.opts) opts = c.opts();
  } catch (e) { failed++; console.log(`ERROR ${c.name}: fixture problem: ${e.message}`); continue; }
  const result = checkSpec(text, opts);
  const codes = new Set(result.errors.map((e) => e.code));
  if (codes.has(c.expect)) console.log(`ok    ${c.name} -> ${c.expect}`);
  else { failed++; console.log(`FAIL  ${c.name}: expected ${c.expect}, got [${[...codes].join(', ')}]`); }
}
console.log(`selftest: ${ran - failed} of ${ran} cases detected${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
