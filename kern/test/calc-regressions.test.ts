/**
 * Deviations from part 3 found by an independent review of the calculator in package P19, each
 * with the requirement it violated. They were not covered by calc-functions/calc-spec before.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcDoc, evalIn, show, tableXml, type Spec } from './calc-helpers.js';

function values(rows: Spec[][]): string[] {
  const d = calcDoc(tableXml('t', rows));
  return d.workbook.formulaCells.map((c) => show(c.value));
}

test('8.2 SUMIF/AVERAGEIF: a shorter sum range is aligned at its top left, the rest is empty', () => {
  const d = calcDoc(tableXml('t', [[1, 100], [2, 200], [3, 300], [4, 400]]));
  assert.equal(evalIn('=SUMIF([.A1:.A4];">0";[.B1:.B1])', d.tables), '100');
  assert.equal(evalIn('=AVERAGEIF([.A1:.A4];">0";[.B1:.B2])', d.tables), '150');
  assert.equal(evalIn('=SUMIF([.A1:.A4];">0";[.B1:.B4])', d.tables), '1000');
});

test('HPF-TYP-010: text without operator is compared as text, never read as a number', () => {
  const d = calcDoc(tableXml('t', [[10], [{ v: '10', t: 'string' }]]));
  assert.equal(evalIn('=COUNTIF([.A2];"10")', d.tables), '1');
  assert.equal(evalIn('=COUNTIF([.A1];"10")', d.tables), '0');
  assert.equal(evalIn('=COUNTIF([.A1];"=10")', d.tables), '1');
  assert.equal(evalIn('=COUNTIF([.A1];10)', d.tables), '1');
  assert.equal(evalIn('=COUNTIF([.A1:.A2];">=10")', d.tables), '1');
});

test('HPF-TYP-012: PROPER with titlecase and final sigma of the default case conversion', () => {
  assert.equal(evalIn('=PROPER("ΟΔΟΣ")'), '"Οδος"');
  assert.equal(evalIn('=PROPER("ßa")'), '"Ssa"');
  assert.equal(evalIn('=PROPER("ǆemal")'), '"ǅemal"');
  assert.equal(evalIn('=PROPER("ﬁx")'), '"Fix"');
  assert.equal(evalIn('=PROPER("ᾳδη")'), '"ᾼδη"');
  assert.equal(evalIn('=PROPER("hallo welt-weit 3d")'), '"Hallo Welt-Weit 3D"');
});

test('HPF-DAT-002: VALUE does not create negative date serials', () => {
  assert.equal(evalIn('=VALUE("1800-01-01")'), '#NUM!');
  assert.equal(evalIn('=VALUE("0000-01-01")'), '#NUM!');
  assert.equal(evalIn('=VALUE("2026-10-11")'), '46306');
  assert.equal(evalIn('=VALUE("08:30")'), '0.3541666666666667');
});

test('8.2 DATE: only the result must lie in the date range, not the year argument', () => {
  assert.equal(evalIn('=DATE(10000;-11;1)'), '2958101');
  assert.equal(evalIn('=DATE(10000;1;1)'), '#NUM!');
  assert.equal(evalIn('=DATE(1898;13;1)'), '#NUM!');
});

test('8.2 SECOND/MINUTE: fractions of a second are cut off', () => {
  assert.equal(evalIn('=SECOND(TIME(0;0;59.9999))'), '59');
  assert.equal(evalIn('=MINUTE(TIME(0;0;59.9999))'), '0');
  assert.equal(evalIn('=SECOND(TIME(0;0;1.9))'), '1');
  assert.equal(evalIn('=HOUR(TIME(8;30;0))'), '8');
  assert.equal(evalIn('=MINUTE(TIME(8;30;0))'), '30');
  assert.equal(evalIn('=SECOND(TIME(8;30;0))'), '0');
  assert.equal(evalIn('=SECOND(TIME(0;0;0.1)*3)'), '0');
});

test('HPF-SYN-011: whitespace inside a reference is ignored', () => {
  const d = calcDoc(tableXml('t', [[1], [2], [3]]));
  assert.equal(evalIn('=SUM([ .A1:.A3 ])', d.tables), '6');
  assert.equal(evalIn('=SUM([.A1 :.A3])', d.tables), '6');
  assert.equal(evalIn('=SUM([.A1:.A3])', d.tables), '6');
});

test('HPF-FN-003/HPF-ERR-003: an unknown function is #NAME?, also in a branch not chosen', () => {
  assert.equal(evalIn('=IF(TRUE();1;NOW())'), '#NAME?');
  assert.equal(evalIn('=IFERROR(1;RAND())'), '#NAME?');
  assert.equal(evalIn('=IF(TRUE();1;ABS(1;2))'), '1'); // parameter count stays an evaluation error
});

test('HPF-NUM-003: a number literal beyond binary64 is #NUM!', () => {
  assert.equal(evalIn('=1E999'), '#NUM!');
  assert.equal(evalIn('=ISNUMBER(1E999)'), 'FALSE');
  assert.equal(evalIn('=ISERROR(1E999)'), 'TRUE');
  assert.equal(evalIn('=1E308'), '1e+308');
});

test('HPF-SEC-004: text results over 32767 code points are #VALUE!, the other cells are calculated', () => {
  assert.equal(evalIn('=LEN(REPT("a";20000)&REPT("a";20000))'), '#VALUE!');
  assert.equal(evalIn('=LEN(REPT("a";16000)&REPT("a";16000))'), '32000');
  const rows: Spec[][] = [['x']];
  for (let r = 2; r <= 40; r++) rows.push([{ f: `=[.A${r - 1}]&[.A${r - 1}]`, t: 'string' }]);
  rows.push([{ f: '=1+1', t: 'float' }]);
  const v = values(rows);
  assert.equal(v[13], JSON.stringify('x'.repeat(2 ** 14)));
  assert.equal(v[14], '#VALUE!');
  assert.equal(v.at(-2), '#VALUE!');
  assert.equal(v.at(-1), '2');
});

test('HPF-CALC-006/007: criteria over the whole grid do not visit every empty cell', () => {
  const d = calcDoc(tableXml('t', [[1, 5], [null, 7], [3, null]]));
  const t0 = performance.now();
  assert.equal(evalIn('=SUMIF([.A1:.AMJ65536];"";[.B1:.AMJ65536])', d.tables), '7');
  assert.equal(evalIn('=COUNTIF([.A1:.AMJ65536];"")', d.tables), String(1024 * 65536 - 4));
  assert.equal(evalIn('=COUNTIFS([.A1:.AMJ65536];"";[.A1:.AMJ65536];"")', d.tables), String(1024 * 65536 - 4));
  assert.equal(evalIn('=SUMIFS([.B1:.AMJ65536];[.A1:.AMI65536];"")', d.tables), '7');
  assert.equal(evalIn('=SUMPRODUCT([.A1:.AMI65536];[.B1:.AMJ65536])', d.tables), '5');
  // ranges of unequal size stay #VALUE! (8.2 SUMIFS, SUMPRODUCT)
  assert.equal(evalIn('=SUMPRODUCT([.A1:.AMJ65536];[.B1:.AMJ65536])', d.tables), '#VALUE!');
  assert.equal(evalIn('=AVERAGEIF([.A1:.AMJ65536];"";[.B1:.AMJ65536])', d.tables), '7');
  const ms = performance.now() - t0;
  assert.ok(ms < 1000, `${ms.toFixed(0)} ms`);
});

test('HPF-ERR-002: an error value of an operand or parameter comes before a conversion error', () => {
  const d = calcDoc(tableXml('t', [[{ v: '#N/A', t: 'error' }, 5], [2, 'x']]));
  assert.equal(evalIn('="a"+NA()', d.tables), '#N/A');
  assert.equal(evalIn('=NA()+"a"', d.tables), '#N/A');
  assert.equal(evalIn('=ROUND("x";NA())', d.tables), '#N/A');
  assert.equal(evalIn('=WEEKDAY(-1;NA())', d.tables), '#N/A');
  assert.equal(evalIn('=ROUND("x";[.A1])', d.tables), '#N/A');
  assert.equal(evalIn('=(1/0)+NA()', d.tables), '#DIV/0!'); // the first of several, in evaluation order
  // exceptions and functions that take references keep their own rules
  assert.equal(evalIn('=COUNTA(NA();1)', d.tables), '2');
  assert.equal(evalIn('=ISNA([.A1])', d.tables), 'TRUE');
  assert.equal(evalIn('=ROWS([.A1])', d.tables), '1');
  // the error in R does not meet the criterion; the matching row has text in S, which is skipped
  assert.equal(evalIn('=SUMIF([.A1:.A2];">0";[.B1:.B2])', d.tables), '0');
});

test('HPC-0006 Nr. 4–7: approximate lookup by kind, DATEDIF md, signed criterion, as measured in LibreOffice', () => {
  const d = calcDoc(tableXml('t', [[1], [2], [3], ['a'], ['b'], [true]]));
  assert.equal(evalIn('=VLOOKUP("0";[.A1:.A6];1)', d.tables), '#N/A');
  assert.equal(evalIn('=MATCH(FALSE();[.A1:.A6])', d.tables), '#N/A');
  assert.equal(evalIn('=VLOOKUP("az";[.A1:.A6];1)', d.tables), '"a"');
  assert.equal(evalIn('=MATCH(2.5;[.A1:.A6])', d.tables), '2');
  assert.equal(evalIn('=DATEDIF(DATE(2026;1;31);DATE(2026;3;1);"md")'), '-2');
  assert.equal(evalIn('=COUNTIF([.A1:.A3];">-1")', d.tables), '3');
  assert.equal(evalIn('=COUNTIF([.A1:.A3];"<+2")', d.tables), '1');
});
