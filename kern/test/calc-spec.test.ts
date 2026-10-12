/**
 * The test procedures ("Prüfverfahren") of part 3 that need a calculator, with the expected
 * results written in the specification, and the reference values of section 16 read from the
 * document itself (so the test fails when document and calculator drift apart).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { calc } from '../src/index.js';
import { SPEC_CASES } from './calc-cases.js';
import { calcDoc, evalIn, show, tableXml } from './calc-helpers.js';
import { REPO_ROOT } from './helpers.js';

const SPEC = readFileSync(resolve(REPO_ROOT, 'docs/spezifikation/03-tabellen-und-formeln.md'), 'utf8');

for (const [req, cases] of Object.entries(SPEC_CASES)) {
  test(`${req}: Prüfverfahren aus Teil 3`, () => {
    for (const [formula, expected] of cases) assert.equal(evalIn(formula), expected, formula);
  });
}

test('HPF-SYN-001: genau ein einleitendes =, kein of:', () => {
  assert.equal(evalIn('==1'), '#NAME?');
  assert.equal(evalIn('of:=1'), '#NAME?');
  assert.equal(evalIn('1+1'), '#NAME?');
  assert.equal(evalIn('=1+1'), '2');
});

test('HPF-SYN-006/011: Bezüge mit und ohne $, Leerraum', () => {
  const d = calcDoc(tableXml('t', [[1, 2], [3, 4], [5, 6]]));
  assert.equal(evalIn('=[.$B$3]', d.tables), '6');
  assert.equal(evalIn('=[.B3]', d.tables), '6');
  assert.equal(evalIn('=SUM( [.A1:.A3] )', d.tables), evalIn('=SUM([.A1:.A3])', d.tables));
  assert.equal(evalIn('=SUM([.A1:.A3])', d.tables), '9');
  assert.equal(evalIn('=[.b3]', d.tables), '#NAME?', 'column letters are upper case');
  assert.equal(evalIn('=[.A:.A]', d.tables), '#NAME?', 'no whole columns (SYN-007)');
  assert.equal(evalIn("=['file:///x.ods'#$t.A1]", d.tables), '#NAME?', 'no source (SYN-007)');
});

test('HPF-SYN-010 / HPF-SEC-004: Längen-, Parameter- und Tiefengrenzen', () => {
  const long = '=' + Array(600).fill('1').join('+');
  assert.ok(long.length > 1024);
  assert.equal(evalIn(long), '#NAME?');
  assert.equal(evalIn('=' + Array(500).fill('1').join('+')), '500');
  assert.equal(evalIn(`=SUM(${Array(30).fill('1').join(';')})`), '30');
  assert.equal(evalIn(`=SUM(${Array(31).fill('1').join(';')})`), '#NAME?');
  assert.equal(evalIn('=ABS(ABS(ABS(ABS(ABS(ABS(ABS(-1)))))))'), '1');
  assert.equal(evalIn('=ABS(ABS(ABS(ABS(ABS(ABS(ABS(ABS(-1))))))))'), '#NAME?');
  // A string constant may have 32767 characters, but the formula may not exceed 1024: the
  // constant limit is never reached on its own (noted as a finding of P19).
  assert.equal(evalIn(`=LEN("${'x'.repeat(1000)}")`), '1000');
  assert.equal(evalIn(`=LEN("${'x'.repeat(32768)}")`), '#NAME?');
  // a reference counts without brackets and without the dot of a reference without table id
  assert.equal(calc.formulaLength('=[.A1]+[t.B2:.C3]'), '=A1+t.B2:C3'.length);
});

test('HPF-TYP-001/002/003/005: leere Zelle', () => {
  const d = calcDoc(tableXml('t', [[1]]));
  assert.equal(evalIn('=ISBLANK([.Z99])', d.tables), 'TRUE');
  assert.equal(evalIn('=[.Z99]+1', d.tables), '1');
  assert.equal(evalIn('=IF([.Z99];"a";"b")', d.tables), '"b"');
  assert.equal(evalIn('="x"&[.Z99]', d.tables), '"x"');
  assert.equal(evalIn('=[.Z99]=0', d.tables), 'TRUE');
  assert.equal(evalIn('=[.Z99]=""', d.tables), 'TRUE');
  assert.equal(evalIn('=[.Z99]=FALSE()', d.tables), 'TRUE');
});

test('HPF-TYP-008: Bereich im Einzelwertkontext, keine implizite Schnittmenge', () => {
  const d = calcDoc(tableXml('t', [[1], [2], [3]]));
  assert.equal(evalIn('=[.A1:.A3]+1', d.tables), '#VALUE!');
  assert.equal(evalIn('=SUM([.A1:.A3])', d.tables), '6');
});

test('HPF-TYP-009: Zahlenfolgen aus Bezügen', () => {
  const d = calcDoc(tableXml('t', [[1], ['x'], [true], [null]]));
  assert.equal(evalIn('=SUM([.A1:.A4])', d.tables), '1');
  assert.equal(evalIn('=COUNT([.A1:.A4])', d.tables), '1');
  assert.equal(evalIn('=SUM(1;TRUE())', d.tables), '2');
  assert.equal(evalIn('=SUM(1;"x")', d.tables), '#VALUE!');
});

test('HPF-TYP-010: Kriterien ohne Platzhalter', () => {
  const d = calcDoc(tableXml('t', [[10], [25], ['abc'], ['a*c']]));
  assert.equal(evalIn('=COUNTIF([.A1:.A4];">=10")', d.tables), '2');
  assert.equal(evalIn('=COUNTIF([.A1:.A4];"a*c")', d.tables), '1');
  assert.equal(evalIn('=COUNTIF([.A1:.A4];"ABC")', d.tables), '1');
});

test('HPF-TYP-011: wirtsdefinierte Eigenschaften sind fest (Tabelle in Teil 3)', () => {
  const block = SPEC.slice(SPEC.indexOf('<!-- HOSTEIGENSCHAFTEN ANFANG -->'), SPEC.indexOf('<!-- HOSTEIGENSCHAFTEN ENDE -->'));
  const rows = [...block.matchAll(/^\| (HOST-[A-Z-]+) \| ([^|]+) \|/gm)].map((m): [string, string] => [m[1]!, m[2]!.trim()]);
  assert.equal(rows.length, 12);
  const d = calcDoc(tableXml('t', [['abc'], ['a*c'], ['a.c']]));
  const checks: Record<string, () => void> = {
    'HOST-CASE-SENSITIVE': () => assert.equal(evalIn('="A"="a"'), 'TRUE'),
    'HOST-PRECISION-AS-SHOWN': () => assert.equal(evalIn('=0.1+0.2=0.3'), 'FALSE'),
    'HOST-SEARCH-CRITERIA-MUST-APPLY-TO-WHOLE-CELL': () => assert.equal(evalIn('=COUNTIF([.A1:.A3];"ab")', d.tables), '0'),
    'HOST-AUTOMATIC-FIND-LABELS': () => assert.equal(evalIn('=Spalte1'), '#NAME?'),
    'HOST-USE-REGULAR-EXPRESSIONS': () => assert.equal(evalIn('=COUNTIF([.A1:.A3];"a.c")', d.tables), '1'),
    'HOST-USE-WILDCARDS': () => assert.equal(evalIn('=COUNTIF([.A1:.A3];"a*c")', d.tables), '1'),
    'HOST-NULL-YEAR': () => assert.equal(evalIn('=DATEVALUE("26-10-11")'), '#VALUE!'),
    'HOST-NULL-DATE': () => assert.equal(evalIn('=DATE(1899;12;30)'), '0'),
    'HOST-LOCALE': () => assert.equal(evalIn('=VALUE("1,5")'), '#VALUE!'),
    'HOST-ITERATION-STATUS': () => {
      const c = calcDoc(tableXml('z', [[{ f: '=[.B1]+1' }, { f: '=[.A1]+1' }]]));
      assert.equal(show(c.cell('z.A1')!.value), '#CIRC!');
    },
    'HOST-ITERATION-MAXIMUM-DIFFERENCE': () => {},
    'HOST-ITERATION-STEPS': () => {},
  };
  for (const [name] of rows) {
    assert.ok(checks[name], `no check for ${name}`);
    checks[name]!();
  }
});

test('HPF-NUM-002: kanonische Zahlform', () => {
  assert.deepEqual([100, 0.1 * 3, 1e21, 1e-7, -0].map(calc.canonicalNumber), ['100', '0.30000000000000004', '1e+21', '1e-7', '0']);
});

test('HPF-NUM-005: Summationsreihenfolge in Dokumentreihenfolge', () => {
  const d = calcDoc(tableXml('t', Array.from({ length: 10 }, () => [0.1])));
  assert.equal(evalIn('=SUM([.A1:.A10])', d.tables), '0.9999999999999999');
});

test('HPF-NUM-006: Prozentzelle speichert den Bruchwert', () => {
  const d = calcDoc(tableXml('t', [[{ v: '0.19', t: 'percentage', text: '19 %' }]]));
  assert.equal(evalIn('=[.A1]*2', d.tables), '0.38');
});

test('HPF-STO-002: Datumszelle wird zur Serie', () => {
  const d = calcDoc(tableXml('t', [[{ v: '2026-10-11', t: 'date', text: '11.10.2026' }, { v: 'PT08H30M00S', t: 'time', text: '08:30' }]]));
  assert.equal(evalIn('=[.A1]+1', d.tables), '46307');
  assert.equal(evalIn('=[.B1]', d.tables), '0.3541666666666667');
  assert.equal(evalIn('=HOUR([.B1])*60+MINUTE([.B1])', d.tables), '510');
});

test('HPF-STO-003: Zelle ohne Wertattribut ist Text', () => {
  const d = calcDoc(tableXml('t', [[' 12 ']]));
  assert.equal(evalIn('=[.A1]+1', d.tables), '#VALUE!');
  assert.equal(evalIn('=[.A1]&"x"', d.tables), '"12x"');
});

test('HPF-ERR-001: Fehlerwert wird mit Namen gespeichert', () => {
  const d = calcDoc(tableXml('t', [[{ f: '=1/0', t: 'float', v: '0', text: '0' }]]));
  d.write();
  const el = d.cell('t.A1')!.element as calc.DomElement;
  assert.equal(el.getAttribute('data-hp-type'), 'error');
  assert.equal(el.getAttribute('data-hp-value'), '#DIV/0!');
  assert.equal(calc.collapsedText(el), '#DIV/0!');
});

test('Abschnitt 16: alle Referenzwerte R1–R30 aus dem Dokument', () => {
  const block = SPEC.slice(SPEC.indexOf('<!-- REFERENZWERTE ANFANG -->'), SPEC.indexOf('<!-- REFERENZWERTE ENDE -->'));
  const rows = [...block.matchAll(/^\| (R\d+) \| (.+?) \| `([^`]+)` \|$/gm)];
  assert.equal(rows.length, 30);
  const tenth = calcDoc(tableXml('t', Array.from({ length: 10 }, () => [0.1])));
  const special: Record<string, () => string> = {
    'kanonische Form von 1e21': () => calc.canonicalNumber(1e21),
    'kanonische Form von 0.1*3': () => evalIn('=0.1*3'),
    'kanonische Form von 1e-7': () => calc.canonicalNumber(1e-7),
    'kanonische Form von -0': () => evalIn('=-0'),
    '`=SUM` über zehnmal 0.1': () => evalIn('=SUM([.A1:.A10])', tenth.tables),
  };
  for (const row of rows) {
    const [id, expr, expected] = [row[1]!, row[2]!, row[3]!];
    const formula = /^`(=.*)`$/.exec(expr)?.[1];
    const got = formula ? evalIn(formula) : special[expr]?.();
    assert.ok(got !== undefined, `${id}: no evaluation for ${expr}`);
    assert.equal(got, expected, `${id} ${expr}`);
  }
});
