/**
 * HPF-FN-001: every function of list 8.2 with at least one regular case and one case of the
 * error behaviour named in the column "Fehler und Festlegungen". The test counts the covered
 * functions against docs/spezifikation/03-funktionen.json and fails when one is missing.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { calc } from '../src/index.js';
import { CASES, DATA, type Case } from './calc-cases.js';
import { calcDoc, evalIn, tableXml } from './calc-helpers.js';
import { REPO_ROOT } from './helpers.js';

const spec = JSON.parse(readFileSync(resolve(REPO_ROOT, 'docs/spezifikation/03-funktionen.json'), 'utf8')) as {
  functions: Array<{ name: string }>;
  excluded: Array<{ name: string }>;
};

const isErrorCase = (c: Case) => c[2] === 'F' || c[1].startsWith('#');

for (const [name, cases] of Object.entries(CASES)) {
  test(`Funktion ${name}`, () => {
    const d = calcDoc(tableXml('d', DATA));
    for (const [formula, expected] of cases) assert.equal(evalIn(formula, d.tables), expected, formula);
  });
}

test('HPF-FN-001: Abdeckung der Funktionsliste 8.2 (gezählt)', (t) => {
  const listed = spec.functions.map((f) => f.name).sort();
  const implemented = [...calc.SUPPORTED_FUNCTIONS].sort();
  const tested = Object.keys(CASES).sort();
  assert.deepEqual(implemented, listed, 'Rechner = Liste 8.2');
  assert.deepEqual(tested, listed, 'Testfälle = Liste 8.2');
  const regular = tested.filter((n) => CASES[n]!.some((c) => !isErrorCase(c)));
  const error = tested.filter((n) => CASES[n]!.some(isErrorCase));
  const total = Object.values(CASES).reduce((n, c) => n + c.length, 0);
  assert.equal(regular.length, listed.length, `ohne regulären Fall: ${listed.filter((n) => !regular.includes(n))}`);
  assert.equal(error.length, listed.length, `ohne Fehlerfall: ${listed.filter((n) => !error.includes(n))}`);
  t.diagnostic(`Funktionen in Liste 8.2: ${listed.length}; implementiert: ${implemented.length}; mit regulärem Fall: ${regular.length}; mit Fehlerfall: ${error.length}; Testfälle: ${total}`);
  console.log(`P19 Funktionsabdeckung: ${regular.length}/${listed.length} regulär, ${error.length}/${listed.length} Fehlerfall, ${total} Testfälle`);
});

test('HPF-FN-002/003: ausgeschlossene Funktionen ergeben #NAME?', () => {
  const names = spec.excluded.map((f) => f.name).filter((n) => /^[A-Z][A-Z0-9.]*$/.test(n));
  assert.ok(names.length >= 70, `${names.length}`);
  for (const n of names) {
    assert.equal(calc.FUNCTIONS.has(n), false, n);
    assert.equal(evalIn(`=${n}(1)`), '#NAME?', n);
  }
});
