#!/usr/bin/env node
/**
 * Gegenprobe P19: dieselben Tabellen rechnen im Kern (hpro-calc) und in LibreOffice.
 *
 *   node scripts/p19-gegenprobe.mjs [outdir] [workdir]
 *       outdir  Vorgabe docs/belege/P19/gegenprobe (Beispiel, Funktionsfälle, Werte, Vergleiche)
 *       workdir Vorgabe prototyp/out/p19/gegenprobe-arbeit (Varianten und LibreOffice-Eingabe, reproduzierbar)
 *
 * Voraussetzungen: `npm run build:test -w kern` (der Kern und die Testfälle unter kern/build/) und
 * LibreOffice unter prototyp/tools/libreoffice/ (siehe docs/belege/P19/README.md).
 *
 * Ablauf:
 *  1. Beispiel docs/spezifikation/beispiele/p19-kostenschaetzung als Container bauen; der Kern
 *     berechnet es und schreibt es als OpenDocument-Tabelle (`beispiel.fods`), dazu eine Tabelle
 *     `pruefungen` mit den Prüfregeln als Formeln.
 *  2. Dasselbe Dokument im Kern ausfüllen (Eingabezellen ändern, `recalculateContainer`) und
 *     ebenfalls ausgeben (`beispiel-ausgefuellt.fods`).
 *  3. Alle Funktionstestfälle (kern/test/calc-cases.ts) als Tabelle `f` über der Datentabelle `d`
 *     (`funktionen.fods`).
 *  4. LibreOffice lädt Kopien dieser Dateien ohne die vom Kern zwischengespeicherten Ergebnisse
 *     (libreoffice-eingabe/), berechnet alles neu (calculateAll) und gibt die exakten Werte aus
 *     (scripts/p19-lo-werte.py); der Vergleich steht in vergleich-*.txt und vergleich.json.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const kern = await import(resolve(ROOT, 'kern/build/src/index.js'));
const { CASES, DATA, SPEC_CASES } = await import(resolve(ROOT, 'kern/build/test/calc-cases.js'));
const { tableXml, xhtml } = await import(resolve(ROOT, 'kern/build/test/calc-helpers.js'));
const { buildFromDir } = await import(resolve(ROOT, 'scripts/s7-lib.mjs'));
const { calc } = kern;

const OUT = resolve(process.argv[2] ?? join(ROOT, 'docs/belege/P19/gegenprobe'));
const WORK = resolve(process.argv[3] ?? join(ROOT, 'prototyp/out/p19/gegenprobe-arbeit'));
const LO_PYTHON = join(ROOT, 'prototyp/tools/libreoffice/opt/libreoffice26.8/program/python');
mkdirSync(OUT, { recursive: true });
mkdirSync(WORK, { recursive: true });

const parse = (text) => new DOMParser().parseFromString(text, 'application/xhtml+xml');
const text = (bytes) => new TextDecoder().decode(bytes);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Kern values of all formula cells as `sheet!A1` → { formula, kind, value }. */
function kernValues(doc, extra = []) {
  const out = new Map();
  for (const t of doc.tables) {
    for (const c of doc.workbook.formulaCells.filter((x) => x.table === t)) {
      out.set(`${calc.sheetName(t)}!${calc.cellAddress(c.row, c.col)}`, { formula: c.formula, value: c.value });
    }
  }
  for (const e of extra) out.set(e.key, e);
  return out;
}

/** Check rules as an extra sheet `pruefungen`: one formula per rule, references made absolute to the table. */
function checksSheet(doc) {
  const rows = [];
  const extra = [];
  doc.workbook.checkCells.forEach((cell, i) => {
    const formula = cell.check.formula.replace(/\[\./g, `[${cell.table.key}.`).replace(/:\./g, ':.');
    const value = cell.check.result === true ? true : cell.check.result === false ? false : calc.FormulaError.of(cell.check.result);
    rows.push(`<table:table-row><table:table-cell office:value-type="string" office:string-value="${esc(cell.table.address(cell.row, cell.col))}"><text:p>${esc(cell.table.address(cell.row, cell.col))}</text:p></table:table-cell><table:table-cell table:formula="of:${esc(formula)}"/></table:table-row>`);
    extra.push({ key: `pruefungen!B${i + 1}`, formula, value });
  });
  return { xml: `<table:table table:name="pruefungen">${rows.join('')}</table:table>`, extra };
}

function withSheet(fods, sheetXml) {
  return fods.replace('\n</office:spreadsheet>', `\n${sheetXml}\n</office:spreadsheet>`);
}


// 1. Beispiel
const built = await buildFromDir(join(ROOT, 'docs/spezifikation/beispiele/p19-kostenschaetzung'));
writeFileSync(join(OUT, 'p19-kostenschaetzung.hpro'), built.bytes);
const exDoc = new calc.CalcDocument(parse(text(built.files.get('content/index.xhtml'))));
exDoc.recalc();
const exChecks = checksSheet(exDoc);
writeFileSync(join(OUT, 'beispiel.fods'), withSheet(calc.tablesToFods(exDoc, exDoc.tables), exChecks.xml));
const kernExample = kernValues(exDoc, exChecks.extra);

// 2. ausgefüllt
const FILL = [
  { address: 'aufmass.C2', value: '13,10' },
  { address: 'aufmass.D4', value: '1,95' },
  { address: 'aufmass.E5', value: '-4' },
  { address: 'kosten.A4', value: 'D02' },
  { address: 'kosten.C4', value: '31,5' },
  { address: 'kosten.C6', value: '4' },
  { address: 'kosten.E8', value: '5 %' },
  { address: 'kennzahlen.B4', value: '2026-12-30' },
];
const filled = await calc.recalculateContainer(built.bytes, { computedAt: '2026-10-12T10:00:00Z', set: FILL });
writeFileSync(join(OUT, 'p19-kostenschaetzung-ausgefuellt.hpro'), filled.bytes);
const filledContainer = await kern.readContainer(filled.bytes);
const fillDoc = new calc.CalcDocument(parse(text(filledContainer.files.get('content/index.xhtml'))));
fillDoc.recalc();
const fillChecks = checksSheet(fillDoc);
writeFileSync(join(OUT, 'beispiel-ausgefuellt.fods'), withSheet(calc.tablesToFods(fillDoc, fillDoc.tables), fillChecks.xml));
const kernFilled = kernValues(fillDoc, fillChecks.extra);

// 3. Funktionsfälle
const caseRows = [];
for (const [name, cases] of Object.entries(CASES)) {
  for (const [formula, expected] of cases) {
    const f = formula.replace(/\[\./g, '[d.');
    caseRows.push([name, { f, t: 'float' }, expected]);
  }
}
for (const [req, cases] of Object.entries(SPEC_CASES)) for (const [formula, expected] of cases) caseRows.push([req, { f: formula, t: 'float' }, expected]);
// HPF-NUM-005 (R24): ten times 0.1, summed in document order
const SUMMATION = [...Array.from({ length: 10 }, () => [0.1]), [{ f: '=SUM([.A1:.A10])', t: 'float' }]];
const sweepBody = tableXml('d', DATA) + tableXml('f', caseRows.map(([n, c]) => [n, c])) + tableXml('n', SUMMATION);
const sweepDoc = new calc.CalcDocument(parse(xhtml(sweepBody)));
sweepDoc.recalc();
writeFileSync(join(OUT, 'funktionen.fods'), calc.tablesToFods(sweepDoc, sweepDoc.tables));
const kernSweep = kernValues(sweepDoc);

// 3b. 25 deterministisch variierte Ausfüllungen, jeweils dreifach: das Beispiel wie es ist (Summen auf
// Cent gerundet, HPF-NUM-007), dasselbe Dokument mit ungerundeten Summen, und das Beispiel mit der
// Rundung nach Änderungsantrag HPC-0005 (15 signifikante Stellen vor dem Runden).
const UNROUNDED = [
  ['=ROUND(SUM([.F2:.F5]);2)', '=SUM([.F2:.F5])'],
  ['=ROUND(SUM([.F2:.F6]);2)', '=SUM([.F2:.F6])'],
  ['=ROUND([.F7]+[.F8];2)', '=[.F7]+[.F8]'],
  ['=ROUND([.F9]+[.F10];2)', '=[.F9]+[.F10]'],
];
async function unroundedContainer(bytes) {
  const c = await kern.readContainer(bytes);
  let x = text(c.files.get('content/index.xhtml'));
  for (const [a, b] of UNROUNDED) x = x.split(`data-hp-formula="${a}"`).join(`data-hp-formula="${b}"`);
  const { readZip, writeZip, sriSha256 } = kern;
  const entries = await readZip(bytes);
  const data = new TextEncoder().encode(x);
  const m = JSON.parse(text(c.files.get('manifest.json')));
  for (const r of m.resources) if (r.url === 'content/index.xhtml') r.integrity = await sriSha256(data);
  return writeZip(
    entries.map((e) => ({ name: e.name, data: e.name === 'content/index.xhtml' ? data : e.name === 'manifest.json' ? new TextEncoder().encode(JSON.stringify(m, null, 2) + '\n') : e.data, compression: e.name === 'mimetype' ? 'store' : 'auto' })),
    { modified: new Date(m.dateModified) },
  );
}
const unroundedBytes = await unroundedContainer(built.bytes);
let seed = 20261012;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const dec = (lo, hi, d) => (lo + rnd() * (hi - lo)).toFixed(d).replace('.', ',');
const VARIANTS = [];
for (let v = 1; v <= 25; v++) {
  const set = [];
  for (const r of [2, 3, 4, 5]) {
    set.push({ address: `aufmass.C${r}`, value: dec(0.5, 20, 2) }, { address: `aufmass.D${r}`, value: dec(0.5, 9, 2) });
    set.push({ address: `aufmass.E${r}`, value: String(r === 5 ? -Math.ceil(rnd() * 4) : Math.ceil(rnd() * 3)) });
  }
  for (const r of [2, 3, 4, 5, 6]) set.push({ address: `kosten.A${r}`, value: pick(['D01', 'D02', 'D03', 'D04', 'D05']) });
  for (const r of [4, 5, 6]) set.push({ address: `kosten.C${r}`, value: dec(0, 60, 1) });
  set.push({ address: 'kosten.E8', value: `${Math.floor(rnd() * 11)} %` });
  set.push({ address: 'kennzahlen.B4', value: `2026-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}` });
  for (const [style, source, rounding] of [['gerundet', built.bytes, undefined], ['ungerundet', unroundedBytes, undefined], ['hpc-0005', built.bytes, 'significant15']]) {
    const r = await calc.recalculateContainer(source, { computedAt: '2026-10-12T10:00:00Z', set, ...(rounding ? { rounding } : {}) });
    const c = await kern.readContainer(r.bytes);
    const d = new calc.CalcDocument(parse(text(c.files.get('content/index.xhtml'))), rounding ? { rounding } : {});
    d.recalc();
    const chk = checksSheet(d);
    const file = `variante-${String(v).padStart(2, '0')}-${style}.fods`;
    writeFileSync(join(WORK, file), withSheet(calc.tablesToFods(d, d.tables), chk.xml));
    VARIANTS.push({ file, style, set, kern: kernValues(d, chk.extra) });
  }
}

// 4. LibreOffice. The exported files carry the kern results as cached values (office:value, text:p).
// LibreOffice gets copies without them, so every value it reports comes from its own engine; the
// export with cached values is loaded as well (`beispiel-mit-zwischenwerten.fods`) to show that it opens.
const FORMULA_CELL = /<table:table-cell table:formula="([^"]*)"[^>]*>(?:<text:p>[\s\S]*?<\/text:p>)?<\/table:table-cell>/g;
const LO_IN = join(WORK, 'libreoffice-eingabe');
mkdirSync(LO_IN, { recursive: true });
const loFiles = ['beispiel.fods', 'beispiel-ausgefuellt.fods', 'funktionen.fods', ...VARIANTS.map((v) => v.file)];
let stripped = 0;
for (const f of loFiles) {
  const src = readFileSync(join(VARIANTS.some((v) => v.file === f) ? WORK : OUT, f), 'utf8');
  const bare = src.replace(FORMULA_CELL, (_, formula) => {
    stripped++;
    return `<table:table-cell table:formula="${formula}"/>`;
  });
  if (/table:formula="[^"]*"[^/>]*office:value|table:formula="[^"]*"[^/>]*>\s*<text:p>/.test(bare)) throw new Error(`cached value left in ${f}`);
  writeFileSync(join(LO_IN, f), bare);
}
writeFileSync(join(LO_IN, 'beispiel-mit-zwischenwerten.fods'), readFileSync(join(OUT, 'beispiel.fods')));
console.log(`LibreOffice-Eingabe: ${loFiles.length} Dateien ohne Zwischenwerte (${stripped} Formelzellen geleert), dazu beispiel-mit-zwischenwerten.fods`);
const loJson = join(OUT, 'libreoffice-werte.json');
execFileSync(LO_PYTHON, [join(ROOT, 'scripts/p19-lo-werte.py'), loJson, ...loFiles.map((f) => join(LO_IN, f)), join(LO_IN, 'beispiel-mit-zwischenwerten.fods')], { stdio: 'inherit' });
const lo = JSON.parse(readFileSync(loJson, 'utf8'));

function showKern(v) {
  if (typeof v === 'number') return calc.canonicalNumber(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (calc.isError(v)) return v.name;
  return JSON.stringify(v);
}
function showLo(e) {
  if (!e) return '(fehlt)';
  if (e.error) return e.errorName;
  if (e.kind === 'string') return JSON.stringify(e.string);
  return calc.canonicalNumber(Number(e.value));
}

/**
 * Classification: `gleich` (bitgleich bzw. gleicher Text/Fehler), `gleich-logisch` (Wahrheitswert im
 * Kern, 1/0 in LibreOffice: LibreOffice kennt keinen eigenen Typ, Teil 3 Abschnitt 15), `abweichend`.
 */
function classify(k, e) {
  if (!e) return 'fehlt';
  const v = k.value;
  if (calc.isError(v)) return e.error && e.errorName === v.name ? 'gleich' : 'abweichend';
  if (e.error) return 'abweichend';
  if (typeof v === 'number') return e.kind === 'value' && calc.canonicalNumber(Number(e.value)) === calc.canonicalNumber(v) ? 'gleich' : 'abweichend';
  if (typeof v === 'boolean') return e.kind === 'value' && Number(e.value) === (v ? 1 : 0) ? 'gleich-logisch' : 'abweichend';
  if (typeof v === 'string') return e.kind === 'string' && e.string === v ? 'gleich' : v === '' && e.kind === 'value' && Number(e.value) === 0 ? 'abweichend' : 'abweichend';
  return 'abweichend';
}

const B = ['Wahrheitswert', 'LibreOffice hat keinen eigenen Wahrheitswert-Typ, TRUE ist dort die Zahl 1 (Teil 3 Abschnitt 15, Zeile Wahrheitswerte; HPF-TYP-001)'];
const C = (why) => ['Festlegung Teil 3', why];
const D = (why) => ['Genauigkeit', why];
const E = (why) => ['ausgeschlossen', why];
const F = (why) => ['Text und Gebietsschema', why];
/** Curated explanation of every known deviation; anything else is `ungeklärt` and fails the run. */
const EXPLAIN = new Map([
  ['=CONCATENATE("a";1;TRUE())', B],
  ['=ISNUMBER([d.C1])', B],
  ['=ISNUMBER(TRUE())', B],
  ['="x"&TRUE()', B],
  ['="a"<TRUE()', ['Wahrheitswert', 'HPF-TYP-007: Text < Wahrheitswert; LibreOffice vergleicht Text mit der Zahl 1 (Text > Zahl)']],
  ['=COUNT()', C('8.2 COUNT: ohne Parameter #VALUE!; LibreOffice 0')],
  ['=COUNTA()', C('8.2 COUNTA: ohne Parameter #VALUE!; LibreOffice 0')],
  ['=SUM()', C('8.2 SUM: ohne Parameter #VALUE!; LibreOffice 0')],
  ['=DATE(1898;1;1)', C('8.2 DATE: Jahr < 1899 → #NUM!; LibreOffice rechnet die negative Serie')],
  ['=DATE(10000;1;1)', C('HPF-DAT-002: Ergebnis nach 9999-12-31 → #NUM!; LibreOffice rechnet weiter')],
  ['=DATE(1899;12;29)', C('HPF-DAT-002: keine negativen Serien; LibreOffice -1')],
  ['=EDATE(DATE(9999;12;31);1)', C('HPF-DAT-002: Datumsbereich; LibreOffice liefert ein Datum im Jahr 10000')],
  ['=EOMONTH(DATE(9999;12;1);1)', C('HPF-DAT-002: Datumsbereich; LibreOffice liefert ein Datum im Jahr 10000')],
  ['=DAY(-1)', C('8.2 DAY: negative Serie → #NUM!; LibreOffice rechnet den 29.12.1899')],
  ['=MONTH(-1)', C('HPF-DAT-002: negative Serie → #NUM!; LibreOffice 12')],
  ['=HOUR(-1)', C('negative Zeit → #NUM! (wie DAY); LibreOffice 0')],
  ['=MEDIAN([d.B1:.B2])', C('8.2 MEDIAN: ohne Zahlen #NUM!; LibreOffice #VALUE!')],
  ['=NPV(-1;1)', C('8.2 NPV: Rate = −1 → #DIV/0!; LibreOffice #NUM!')],
  ['=POWER(0;0)', C('8.2 POWER: POWER(0;0) → #NUM!; LibreOffice 1')],
  ['=POWER(0;-1)', C('8.2 POWER: POWER(0;B<0) → #DIV/0!; LibreOffice #NUM!')],
  ['=POWER(-8;1/3)', C('8.2 POWER: negative Basis mit nicht ganzzahligem Exponenten → #NUM!; LibreOffice zieht die ungerade Wurzel (−2)')],
  ['=REPT("ab";20000)', C('8.2 REPT: Ergebnis über 32767 Codepunkte → #VALUE!; LibreOffice liefert 40000 Zeichen')],
  ['=SECOND(TIME(0;0;1.9))', C('8.2 SECOND: Bruchteile werden abgeschnitten (1); LibreOffice rundet (2)')],
  ['=TIME(25;0;0)', C('8.2 TIME nach [Q1] §6.10.17: ((H·60·60)+(M·60)+S)/(24·60·60), Stunden „shall not be limited to the ranges 0..24“, also 25 h = 1,0417; LibreOffice rechnet modulo 24 h (0,0417) und weicht damit von [Q1] ab')],
  ['=PMT(0.05/12;360;200000)', D('R29 ist mit der Formel aus Teil 3 berechnet; LibreOffice ordnet die Rechnung anders und weicht in der 14. Stelle ab (Unterschied 1,4e-12). Gerundet auf Cent gleich')],
  ['=SUM([.A1:.A10])', D('HPF-NUM-005 (R24): Summe in Dokumentreihenfolge ohne Kompensation 0.9999999999999999; LibreOffice summiert kompensiert und liefert 1')],
  ['=0.1+0.2=0.3', D('HPF-TYP-005: exakter Vergleich; LibreOffice vergleicht mit Näherung (Abschnitt 15 bestätigt)')],
  ['=1-0.9-0.1', D('HPF-NUM-001: binary64 exakt; LibreOffice setzt das Ergebnis nahe 0 auf 0 (Abschnitt 15 bestätigt)')],
  ['="3"+4', F('HPF-TYP-002: kein Text → Zahl; LibreOffice wandelt „eindeutigen“ Text um (Abschnitt 15 bestätigt)')],
  ['=IF("TRUE";"a";"b")', F('HPF-TYP-003: Text als Bedingung → #VALUE!; LibreOffice liest „TRUE“')],
  ['="ä"<"b"', F('HPF-TYP-006: Codepunkte (U+00E4 > U+0062); LibreOffice nutzt Sortierregeln der Sprache')],
  ['=UPPER("straße")', F('HPF-TYP-012: Standard-Großschreibung ß → SS; LibreOffice schreibt ẞ (U+1E9E)')],
  ['=LOWER("İ")', F('HPF-TYP-012: Standard-Kleinschreibung İ → i̇; LibreOffice lässt İ stehen')],
  ['=DATEVALUE("10/11/26")', F('HPF-DAT-004: nur ISO-Formen; LibreOffice liest das Datum nach Gebietsschema (en-US)')],
  ['=TIMEVALUE("8:30")', F('HPF-DAT-004: Stunde zweistellig (HH:MM); LibreOffice liest auch H:MM')],
  ['=[.A1]~[.A2]', E('HPF-SYN-005: kein Vereinigungsoperator ~ → #NAME?; LibreOffice kennt ihn')],
  ['={1;2}', E('HPF-SYN-009: keine Inline-Arrays → #NAME?; LibreOffice kennt sie')],
  ['=SUM(', E('HPF-ERR-003: unvollständige Formel → #NAME?; LibreOffice ergänzt die Klammer')],
  ['=NOW()', E('8.3 / HPF-FN-003: NOW ausgeschlossen (Uhrzeit) → #NAME?; LibreOffice rechnet')],
  ['=TODAY()', E('8.3 / HPF-FN-003: TODAY ausgeschlossen (Uhrzeit) → #NAME?; LibreOffice rechnet')],
  ['=RAND()', E('8.3 / HPF-FN-003: RAND ausgeschlossen (Zufall) → #NAME?; LibreOffice rechnet')],
  ['=INDIRECT("A1")', E('8.3 / HPF-FN-003: INDIRECT ausgeschlossen → #NAME?; LibreOffice löst den Bezug auf')],
]);

function explain(row) {
  if (row.result !== 'abweichend') return null;
  if (row.libreoffice.startsWith('Err:') && row.kern.startsWith('#')) return ['Fehlercode', `beide liefern einen Fehlerwert; LibreOffice nennt ihn ${row.libreoffice} (eigener Code), der Kern ${row.kern} (Name nach Teil 3 Abschnitt 7.1; Abschnitt 15, Zeile Fehlernamen)`];
  return EXPLAIN.get(row.formula) ?? ['ungeklärt', ''];
}

function compare(name, file, kernMap, labels = new Map()) {
  const loCells = new Map(lo.files[file].cells.map((c) => [`${c.sheet}!${c.address}`, c]));
  const rows = [];
  for (const [key, k] of kernMap) {
    const e = loCells.get(key);
    const row = { key, label: labels.get(key) ?? '', formula: k.formula, kern: showKern(k.value), libreoffice: showLo(e), loFormula: e?.formula ?? null, result: classify(k, e) };
    const why = explain(row);
    rows.push(why ? { ...row, category: why[0], why: why[1] } : row);
  }
  const count = (r) => rows.filter((x) => x.result === r).length;
  const categories = {};
  for (const x of rows) if (x.category) categories[x.category] = (categories[x.category] ?? 0) + 1;
  return { name, file, total: rows.length, gleich: count('gleich'), gleichLogisch: count('gleich-logisch'), abweichend: count('abweichend'), fehlt: count('fehlt'), categories, calculateAllMs: lo.files[file].calculateAllMs, rows };
}

const sweepLabels = new Map(caseRows.map(([n, c, exp], i) => [`f!B${i + 1}`, `${n} (erwartet ${exp})`]));
const results = [compare('Beispiel (wie gespeichert)', 'beispiel.fods', kernExample), compare('Beispiel ausgefüllt', 'beispiel-ausgefuellt.fods', kernFilled), compare('Funktionsfälle', 'funktionen.fods', kernSweep, sweepLabels)];
const withCached = compare('Beispiel, Export mit Zwischenwerten geladen', 'beispiel-mit-zwischenwerten.fods', kernExample);

/** Distance in units in the last place between two finite doubles. */
function ulps(a, b) {
  const buf = new DataView(new ArrayBuffer(16));
  buf.setFloat64(0, a);
  buf.setFloat64(8, b);
  const ia = buf.getBigInt64(0);
  const ib = buf.getBigInt64(8);
  const ord = (x) => (x < 0n ? -(x & 0x7fffffffffffffffn) : x);
  const d = ord(ia) - ord(ib);
  return Number(d < 0n ? -d : d);
}
const variantResults = VARIANTS.map((v) => {
  const r = compare(`Variante ${v.file}`, v.file, v.kern);
  for (const x of r.rows) {
    if (x.result !== 'abweichend') continue;
    const a = Number(x.kern);
    const b = Number(x.libreoffice);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      x.ulps = ulps(a, b);
      x.category = 'Genauigkeit';
      x.why =
        x.ulps <= 4
          ? `${x.ulps} Einheit(en) der letzten Stelle; ${/SUM\(/.test(x.formula) ? 'LibreOffice summiert kompensiert (HPF-NUM-005)' : 'Folge einer kompensierten Summe in einer Vorgängerzelle'}`
          : `${Math.abs(a - b).toFixed(2)} Unterschied; ${/^=ROUND\(\[\.C\d\]\*\[\.E\d\];2\)$/.test(x.formula) ? 'Rundung des Produkts: binär knapp unter ,xx5, HPF-NUM-004 rundet die kürzeste Dezimalform ab, LibreOffice rundet über 15 Stellen auf (siehe HPC-0005)' : 'Folge der abweichenden Rundung in einer Vorgängerzelle (HPF-NUM-004, HPC-0005)'}`;
    } else {
      x.category = 'ungeklärt';
    }
  }
  return r;
});
const vStats = (style) => {
  const rs = variantResults.filter((r, i) => VARIANTS[i].style === style);
  return {
    style,
    files: rs.length,
    cells: rs.reduce((n, r) => n + r.total, 0),
    same: rs.reduce((n, r) => n + r.gleich + r.gleichLogisch, 0),
    differences: rs.flatMap((r) => r.rows.filter((x) => x.result === 'abweichend').map((x) => ({ file: r.file, ...x }))),
    filesWithDifferences: rs.filter((r) => r.abweichend > 0).length,
  };
};
const vRounded = vStats('gerundet');
const vUnrounded = vStats('ungerundet');
const vProposal = vStats('hpc-0005');
const vDiff = [...vRounded.differences, ...vUnrounded.differences, ...vProposal.differences];

writeFileSync(join(OUT, 'vergleich.json'), JSON.stringify({ office: lo.office, kern: calc.CALCULATOR, fill: FILL, strippedFormulaCells: stripped, results, withCachedValues: withCached, variants: { rounded: vRounded, unrounded: vUnrounded, proposalHpc0005: vProposal, sets: VARIANTS.filter((v) => v.style === 'gerundet').map((v) => ({ file: v.file, set: v.set })) } }, null, 1) + '\n');

function report(r) {
  const lines = [`# ${r.name}: ${r.file}`, `Kern ${calc.CALCULATOR.name} ${calc.CALCULATOR.version} gegen ${lo.office} (calculateAll ${r.calculateAllMs} ms)`, `Formelzellen: ${r.total}; gleich: ${r.gleich}; gleich (Wahrheitswert als 1/0): ${r.gleichLogisch}; abweichend: ${r.abweichend}; fehlt: ${r.fehlt}`, ''];
  const w = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
  if (r.abweichend > 0) lines.push(`Abweichungen nach Art: ${Object.entries(r.categories).map(([k, v]) => `${k} ${v}`).join(', ')}`, '');
  lines.push(`${w('Zelle', 18)} ${w('Ergebnis', 15)} ${w('Kern', 28)} ${w('LibreOffice', 28)} Formel`);
  for (const x of r.rows) {
    lines.push(`${w(x.key, 18)} ${w(x.result, 15)} ${w(x.kern, 28)} ${w(x.libreoffice, 28)} ${x.formula}${x.label ? `   [${x.label}]` : ''}`);
    if (x.category) lines.push(`${' '.repeat(19)}→ ${x.category}: ${x.why}`);
  }
  return lines.join('\n') + '\n';
}
writeFileSync(join(OUT, 'vergleich-beispiel.txt'), report(results[0]) + '\n' + report(results[1]) + '\n' + report(withCached));
writeFileSync(join(OUT, 'vergleich-funktionen.txt'), report(results[2]));
const vLines = [
  `# 25 variierte Ausfüllungen des Beispiels (Eingaben deterministisch aus Startwert 20261012), je in zwei Schreibweisen und mit der Rundung nach HPC-0005`,
  `Kern ${calc.CALCULATOR.name} ${calc.CALCULATOR.version} gegen ${lo.office}`,
  '',
  ...[vRounded, vUnrounded, vProposal].map((x) => `${{ gerundet: 'Beispiel wie veröffentlicht (Summen auf Cent gerundet, HPF-NUM-007), Rundung nach Teil 3 0.1', ungerundet: 'dasselbe mit ungerundeten Summen, Rundung nach Teil 3 0.1                  ', 'hpc-0005': 'Beispiel wie veröffentlicht, Rundung nach Vorschlag HPC-0005 (15 Stellen)  ' }[x.style]}: ${x.files} Dateien, ${x.cells} Zellen, gleich ${x.same}, abweichend ${x.differences.length} (in ${x.filesWithDifferences} Dateien)`),
  '',
  ...variantResults.map((r) => `${r.file}: ${r.total} Zellen, gleich ${r.gleich + r.gleichLogisch}, abweichend ${r.abweichend}`),
  '',
  'Abweichungen:',
  ...(vDiff.length === 0 ? ['(keine)'] : vDiff.map((x) => `${x.file} ${x.key}: Kern ${x.kern}, LibreOffice ${x.libreoffice}, ${x.formula} → ${x.category}: ${x.why}`)),
  '',
  'Eingaben je Variante (für alle drei Rechnungen gleich):',
  ...VARIANTS.filter((v) => v.style === 'gerundet').map((v) => `${v.file.replace('-gerundet', '')}: ${v.set.map((e) => `${e.address}=${e.value}`).join(' ')}`),
];
writeFileSync(join(OUT, 'vergleich-varianten.txt'), vLines.join('\n') + '\n');
for (const r of [...results, withCached]) {
  console.log(`${r.name}: ${r.total} Formelzellen, gleich ${r.gleich}, gleich-logisch ${r.gleichLogisch}, abweichend ${r.abweichend}, fehlt ${r.fehlt}`);
  if (r.abweichend > 0) console.log(`  Abweichungen nach Art: ${Object.entries(r.categories).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}
for (const x of [vRounded, vUnrounded, vProposal]) console.log(`Varianten ${x.style}: ${x.files} Ausfüllungen, ${x.cells} Zellen, gleich ${x.same}, abweichend ${x.differences.length} in ${x.filesWithDifferences} Dateien${x.differences.length ? ` (${[...new Set(x.differences.map((d) => d.category))].join(', ')})` : ''}`);
const failures = [results[0].abweichend + results[0].fehlt + withCached.abweichend + withCached.fehlt, results[1].abweichend + results[1].fehlt, (results[2].categories['ungeklärt'] ?? 0) + vDiff.filter((x) => x.category === 'ungeklärt').length, results[2].fehlt];
if (failures.some((n) => n > 0)) {
  console.error(`Gegenprobe NICHT bestanden: Beispiel ${failures[0]}, ausgefüllt ${failures[1]}, ungeklärte Abweichungen ${failures[2]}, fehlende Zellen ${failures[3]}`);
  process.exit(1);
}
console.log(`Gegenprobe bestanden: Beispiel und ausgefülltes Beispiel identisch; Varianten nach Teil 3 0.1: ${vRounded.files - vRounded.filesWithDifferences} von ${vRounded.files} identisch, mit Vorschlag HPC-0005: ${vProposal.files - vProposal.filesWithDifferences} von ${vProposal.files}; jede Abweichung ist eingeordnet.`);
