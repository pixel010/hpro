#!/usr/bin/env node
/**
 * Messungen zu den Änderungsanträgen aus P19:
 *
 *   node scripts/p19-antraege.mjs [workdir]         (Vorgabe prototyp/out/p19/antraege)
 *
 * HPC-0005 (Rundung auf 15 signifikante Stellen vor ROUND & Co.):
 * 1. Alle Funktionsfälle (kern/test/calc-cases.ts) einmal nach Teil 3 0.1 (HPF-NUM-004, kürzeste
 *    Dezimalform) und einmal nach HPC-0005 berechnen; jede Änderung wird ausgegeben.
 * 2. Randfälle der Rundung im Kern (beide Regeln) und in LibreOffice (Datei ohne zwischengespeicherte
 *    Ergebnisse, calculateAll über scripts/p19-lo-werte.py) nebeneinander.
 *
 * HPC-0006 (Klarstellungen aus der Umsetzung des Rechners):
 * 3. Die Fälle, die Teil 3 offenlässt, im Kern und in LibreOffice.
 *
 * Voraussetzungen wie scripts/p19-gegenprobe.mjs. Exit 0, wenn beide Teile gelaufen sind.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const { calc } = await import(resolve(ROOT, 'kern/build/src/index.js'));
const { CASES, DATA, SPEC_CASES } = await import(resolve(ROOT, 'kern/build/test/calc-cases.js'));
const { tableXml, xhtml, parse, show } = await import(resolve(ROOT, 'kern/build/test/calc-helpers.js'));
const OUT = resolve(process.argv[2] ?? join(ROOT, 'prototyp/out/p19/antraege'));
const LO_PYTHON = join(ROOT, 'prototyp/tools/libreoffice/opt/libreoffice26.8/program/python');
mkdirSync(OUT, { recursive: true });

const compute = (body, rounding) => {
  const d = new calc.CalcDocument(parse(xhtml(body)), rounding ? { rounding } : {});
  d.recalc();
  return d;
};

// 1. Funktionsfälle
const rows = [];
for (const [n, cs] of Object.entries(CASES)) for (const [f] of cs) rows.push([n, f.replace(/\[\./g, '[d.')]);
for (const [n, cs] of Object.entries(SPEC_CASES)) for (const [f] of cs) rows.push([n, f]);
const caseBody = tableXml('d', DATA) + tableXml('f', rows.map(([n, f]) => [n, { f, t: 'float' }]));
const values = (d) => d.workbook.formulaCells.filter((c) => c.table.key === 'f').map((c) => show(c.value));
const a = values(compute(caseBody));
const b = values(compute(caseBody, 'significant15'));
console.log('## 1. Funktionsfälle nach Teil 3 0.1 und nach HPC-0005');
let changed = 0;
rows.forEach(([n, f], i) => {
  if (a[i] === b[i]) return;
  changed++;
  console.log(`${n}: ${f}  Teil 3 0.1: ${a[i]}  HPC-0005: ${b[i]}`);
});
console.log(`Fälle: ${rows.length}; durch HPC-0005 verändert: ${changed}`);
console.log();

// 2. Randfälle gegen LibreOffice
const EDGE = [
  '=13.1*1.95',
  '=ROUND(13.1*1.95;2)',
  '=ROUND(-13.1*1.95;2)',
  '=ROUND(1.15*3;1)',
  '=ROUND(0.285*100;0)',
  '=ROUNDUP(0.1*3;1)',
  '=ROUND(1234567.8949999999;2)',
  '=ROUND(2.675;2)',
  '=ROUND(1.005;2)',
  '=ROUND(-2.5;0)',
  '=ROUND(1234.5678;-2)',
  '=INT(-2.5)',
  '=TRUNC(-2.5)',
  '=ROUNDDOWN(2.675;2)',
  '=TRUNC(3-4E-16)',
  '=ROUNDDOWN(3-4E-16;0)',
  '=INT(3-4E-16)',
];
const edgeBody = tableXml('h', EDGE.map((f) => [{ f, t: 'float' }]));
const k01 = compute(edgeBody);
const k15 = compute(edgeBody, 'significant15');
const fods = calc
  .tablesToFods(k01, k01.tables)
  .replace(/<table:table-cell table:formula="([^"]*)"[^>]*>(?:<text:p>[\s\S]*?<\/text:p>)?<\/table:table-cell>/g, '<table:table-cell table:formula="$1"/>');
writeFileSync(join(OUT, 'rundung.fods'), fods);
execFileSync(LO_PYTHON, [join(ROOT, 'scripts/p19-lo-werte.py'), join(OUT, 'rundung-lo.json'), join(OUT, 'rundung.fods')], { stdio: 'inherit' });
const lo = JSON.parse(readFileSync(join(OUT, 'rundung-lo.json'), 'utf8'));
const cells = lo.files['rundung.fods'].cells;
console.log('## 2. Randfälle: Kern nach Teil 3 0.1, Kern nach HPC-0005, LibreOffice (ohne Zwischenwerte, calculateAll)');
console.log(`${'Formel'.padEnd(30)} ${'Teil 3 0.1'.padEnd(20)} ${'HPC-0005'.padEnd(20)} ${lo.office}`);
let same01 = 0;
let same15 = 0;
EDGE.forEach((f, i) => {
  const l = cells.find((c) => c.address === `A${i + 1}`);
  const lv = l.error ? l.errorName : calc.canonicalNumber(Number(l.value));
  const v01 = show(k01.workbook.formulaCells[i].value);
  const v15 = show(k15.workbook.formulaCells[i].value);
  if (v01 === lv) same01++;
  if (v15 === lv) same15++;
  console.log(`${f.padEnd(30)} ${v01.padEnd(20)} ${v15.padEnd(20)} ${lv}`);
});
console.log(`gleich mit LibreOffice: Teil 3 0.1 ${same01} von ${EDGE.length}, HPC-0005 ${same15} von ${EDGE.length}`);

// 3. Klärungsfälle (HPC-0006). Spalte B: Daten; Spalte A: Formeln.
const DATA_B = [10, { v: '10', t: 'string' }, 1, 2, 3, 'a', 'b', true];
const OPEN = [
  ['Kriterium Text ohne Operator', '=COUNTIF([.B1:.B2];"10")'],
  ['Kriterium mit =', '=COUNTIF([.B1:.B2];"=10")'],
  ['Kriterium Zahl', '=COUNTIF([.B1:.B2];10)'],
  ['Kriterium mit Vorzeichen', '=COUNTIF([.B3:.B5];">-1")'],
  ['ungefähre Suche, Wertarten gemischt', '=VLOOKUP("0";[.B3:.B8];1)'],
  ['ungefähre Suche, Wahrheitswert', '=MATCH(FALSE();[.B3:.B8])'],
  ['Fehlerreihenfolge Text vor Fehler', '="a"+NA()'],
  ['Fehlerreihenfolge Fehler vor Text', '=NA()+"a"'],
  ['Fehlerreihenfolge in Funktion', '=ROUND("x";NA())'],
  ['Fehlerreihenfolge Datum', '=WEEKDAY(-1;NA())'],
  ['DATEDIF md über Monatsende', '=DATEDIF(DATE(2026;1;31);DATE(2026;3;1);"md")'],
  ['Textlänge mit &', '=LEN(REPT("a";20000)&REPT("a";20000))'],
  ['Textlänge mit CONCATENATE', '=LEN(CONCATENATE(REPT("a";20000);REPT("a";20000)))'],
  ['unbekannte Funktion im nicht gewählten Zweig', '=IF(TRUE();1;NOW())'],
  ['Zahlliteral jenseits binary64', '=ISNUMBER(1E999)'],
];
const openRows = OPEN.map(([, f], i) => [{ f, t: 'float' }, i < DATA_B.length ? DATA_B[i] : null]);
const openBody = tableXml('o', openRows);
const kOpen = compute(openBody);
const openFods = calc
  .tablesToFods(kOpen, kOpen.tables)
  .replace(/<table:table-cell table:formula="([^"]*)"[^>]*>(?:<text:p>[\s\S]*?<\/text:p>)?<\/table:table-cell>/g, '<table:table-cell table:formula="$1"/>');
writeFileSync(join(OUT, 'klaerungen.fods'), openFods);
execFileSync(LO_PYTHON, [join(ROOT, 'scripts/p19-lo-werte.py'), join(OUT, 'klaerungen-lo.json'), join(OUT, 'klaerungen.fods')], { stdio: 'inherit' });
const loOpen = JSON.parse(readFileSync(join(OUT, 'klaerungen-lo.json'), 'utf8')).files['klaerungen.fods'].cells;
console.log();
console.log('## 3. Klärungsfälle HPC-0006: Kern (heute) und LibreOffice (ohne Zwischenwerte, calculateAll)');
console.log('Daten in Spalte B: B1 = Zahl 10, B2 = Text "10", B3…B8 = 1, 2, 3, "a", "b", TRUE');
console.log(`${'Fall'.padEnd(46)} ${'Formel'.padEnd(52)} ${'Kern'.padEnd(10)} ${lo.office}`);
const kCells = kOpen.workbook.formulaCells;
OPEN.forEach(([label, f], i) => {
  const l = loOpen.find((c) => c.address === `A${i + 1}`);
  const lv = !l ? '(fehlt)' : l.error ? l.errorName : l.kind === 'string' ? JSON.stringify(l.string) : calc.canonicalNumber(Number(l.value));
  console.log(`${label.padEnd(46)} ${f.padEnd(52)} ${show(kCells[i].value).padEnd(10)} ${lv}`);
});
