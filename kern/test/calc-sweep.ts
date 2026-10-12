/**
 * All function cases of list 8.2 as one document; `sweep()` returns every formula result in
 * order (numbers canonical, with the sign of zero). Run directly (`node calc-sweep.js`) it prints
 * the results as JSON, so that a test can compare them across processes (HPF-CALC-001).
 */
import { fileURLToPath } from 'node:url';
import { calc } from '../src/index.js';
import { CASES, DATA, SPEC_CASES } from './calc-cases.js';
import { parse, show, tableXml, xhtml, type Spec } from './calc-helpers.js';

export function sweep(): string[] {
  const rows: Spec[][] = [];
  for (const cases of Object.values(CASES)) for (const [f] of cases) rows.push([{ f: f.replace(/\[\./g, '[d.'), t: 'float' }]);
  for (const cases of Object.values(SPEC_CASES)) for (const [f] of cases) rows.push([{ f, t: 'float' }]);
  const d = new calc.CalcDocument(parse(xhtml(tableXml('d', DATA) + tableXml('f', rows))));
  d.recalc();
  return d.workbook.formulaCells.filter((c) => c.table.key === 'f').map((c) => (typeof c.value === 'number' ? `${show(c.value)}|${Object.is(c.value, -0)}` : show(c.value)));
}

export const SWEEP_SCRIPT = fileURLToPath(import.meta.url);

if (process.argv[1] === SWEEP_SCRIPT) process.stdout.write(JSON.stringify(sweep()));
