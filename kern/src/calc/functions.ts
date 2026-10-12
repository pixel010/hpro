/**
 * The functions of part 3, section 8.2 (96 functions). Each follows the cited section of
 * OpenFormula [Q1]; where the column "Fehler und Festlegungen" prescribes something, that takes
 * precedence (HPF-FN-001). Functions of the exclusion list 8.3 are not offered, not even as an
 * extension (HPF-FN-003): an unknown name evaluates to `#NAME?`.
 *
 * Every loop is bounded by the size of its parameters or ranges (HPF-CALC-006).
 */
import {
  MAX_SERIAL,
  clockFields,
  dayOfWeek,
  daysInMonth,
  isValidSerial,
  isoWeekNumber,
  parseIsoDateTime,
  partsFromSerial,
  serialFromParts,
  timeFraction,
} from './dates.js';
import {
  MISSING,
  forEachCell,
  isRange,
  powerOp,
  rangeCols,
  rangeRows,
  scalar,
  type Arg,
  type ArgIn,
  type EvalContext,
  type FunctionDef,
  type RangeRef,
} from './evaluate.js';
import { roundDecimal, type RoundMode } from './numbers.js';
import {
  DIV0,
  EMPTY,
  NA,
  NUM,
  REF,
  STANDARD_NUMBER,
  VALUE,
  codePoints,
  compareCodePoints,
  compareScalars,
  compareText,
  foldText,
  isError,
  num,
  toInteger,
  toLogical,
  toNumber,
  toText,
  type FormulaError,
  type Scalar,
} from './values.js';

const MAX_TEXT = 32767;

type Num = number | FormulaError;

// ---------------------------------------------------------------------------------------------
// Parameter helpers
// ---------------------------------------------------------------------------------------------

const present = (a: ArgIn | undefined): a is Arg => a !== undefined && a !== MISSING;
const sc = (a: ArgIn | undefined): Scalar => (present(a) ? scalar(a) : EMPTY);
const number = (a: ArgIn | undefined): Num => toNumber(sc(a));
const integer = (a: ArgIn | undefined): Num => toInteger(sc(a));
const text = (a: ArgIn | undefined): string | FormulaError => toText(sc(a));
const logical = (a: ArgIn | undefined): boolean | FormulaError => toLogical(sc(a));
const optNumber = (a: ArgIn | undefined, dflt: number): Num => (present(a) ? number(a) : dflt);
const optInteger = (a: ArgIn | undefined, dflt: number): Num => (present(a) ? integer(a) : dflt);

/** First error among already converted parameters. */
function firstError(...vals: unknown[]): FormulaError | undefined {
  for (const v of vals) if (isError(v)) return v;
  return undefined;
}

/**
 * Numbers of a NumberSequence(List) (HPF-TYP-009): in references text, logical values and
 * empty cells are skipped and errors passed on; direct constants are converted as numbers.
 */
function collectNumbers(args: readonly ArgIn[]): number[] | FormulaError {
  const out: number[] = [];
  for (const a of args) {
    if (a === MISSING) return VALUE;
    if (isRange(a)) {
      let err: FormulaError | undefined;
      forEachCell(a, (v) => {
        if (typeof v === 'number') out.push(v);
        else if (isError(v)) {
          err = v;
          return false;
        }
        return true;
      });
      if (err) return err;
    } else {
      const n = toNumber(a);
      if (isError(n)) return n;
      out.push(n);
    }
  }
  return out;
}

/** DateParam / TimeParam: a number, or text in the ISO forms of HPF-DAT-004. */
function dateParam(a: ArgIn | undefined): Num {
  const v = sc(a);
  if (typeof v === 'string') {
    const p = parseIsoDateTime(v);
    if (!p) return VALUE;
    return (p.date ?? 0) + p.time;
  }
  return toNumber(v);
}

function dateOnly(a: ArgIn | undefined): Num {
  const d = dateParam(a);
  if (isError(d)) return d;
  if (d < 0 || d >= MAX_SERIAL + 1) return NUM;
  return d;
}

function checkSerial(s: number): Num {
  return isValidSerial(s) ? s : NUM;
}

// ---------------------------------------------------------------------------------------------
// Criteria (HPF-TYP-010)
// ---------------------------------------------------------------------------------------------

type Test = (v: Scalar) => boolean;
const SIGNED_NUMBER = /^[+-]?[0-9]+(\.[0-9]*)?([eE][+-]?[0-9]+)?$/;

function applyOp(op: string, c: number): boolean {
  switch (op) {
    case '=':
      return c === 0;
    case '<>':
      return c !== 0;
    case '<':
      return c < 0;
    case '<=':
      return c <= 0;
    case '>':
      return c > 0;
    default:
      return c >= 0;
  }
}

/**
 * Builds the test of a criterion. Number or logical: equality. Text with a leading comparison
 * operator: comparison with the rest, read as StandardNumber if possible, else as text. Other
 * text: equality with the whole cell content as text (HPF-TYP-006), so `"10"` matches the text
 * 10 but not the number 10 (write `10` or `"=10"` for that). No wildcards, no regular
 * expressions. Values of another kind never match, except with `<>`; empty cells match only `=`
 * with an empty rest or `<>` with a non-empty rest.
 */
export function criterion(c: Scalar): Test | FormulaError {
  if (isError(c)) return c;
  if (typeof c === 'number') return (v) => typeof v === 'number' && v === c;
  if (typeof c === 'boolean') return (v) => typeof v === 'boolean' && v === c;
  const s = c === EMPTY ? '' : c;
  const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(s)!;
  const op = m[1] ?? '=';
  const rest = m[2]!;
  if (rest === '') {
    if (op === '=') return (v) => v === EMPTY || v === '';
    if (op === '<>') return (v) => !isError(v) && v !== EMPTY && v !== '';
    return (v) => typeof v === 'string' && applyOp(op, compareText(v, ''));
  }
  // HPF-TYP-010: text without a leading operator is compared as text, never read as a number
  if (m[1] === undefined) return (v) => typeof v === 'string' && compareText(v, rest) === 0;
  if (SIGNED_NUMBER.test(rest) && STANDARD_NUMBER.test(rest.replace(/^[+-]/, ''))) {
    const x = Number(rest);
    return (v) => {
      if (typeof v === 'number') return applyOp(op, v < x ? -1 : v > x ? 1 : 0);
      return op === '<>' && !isError(v);
    };
  }
  return (v) => {
    if (typeof v === 'string') return applyOp(op, compareText(v, rest));
    return op === '<>' && !isError(v);
  };
}

/** Value at offset (i, j) of the area anchored at the top left of `r` (cells outside are empty). */
const at = (r: RangeRef, i: number, j: number): Scalar => r.table.valueAt(r.r1 + i, r.c1 + j);

/** Rows and columns of `r` that lie inside its table; every cell beyond them is empty. */
const rowsIn = (r: RangeRef): number => Math.max(0, Math.min(rangeRows(r), r.table.rows - r.r1));
const colsIn = (r: RangeRef): number => Math.max(0, Math.min(rangeCols(r), r.table.cols - r.c1));

/** Number of rows to scan: beyond the grid all cells are empty and match only if `emptyMatches`. */
function scanRows(r: RangeRef, emptyMatches: boolean): number {
  const rows = rangeRows(r);
  return emptyMatches ? rows : Math.max(0, Math.min(rows, r.table.rows - r.r1));
}
function scanCols(r: RangeRef, emptyMatches: boolean): number {
  const cols = rangeCols(r);
  return emptyMatches ? cols : Math.max(0, Math.min(cols, r.table.cols - r.c1));
}

function asRange(a: ArgIn | undefined): RangeRef | FormulaError {
  if (present(a) && isRange(a)) return a;
  const v = sc(a);
  return isError(v) ? v : VALUE;
}

/** SUMIF / AVERAGEIF: sum and count of the numbers in S where R meets the criterion. */
function conditionalSum(args: ArgIn[]): { sum: number; count: number } | FormulaError {
  const r = asRange(args[0]);
  if (isError(r)) return r;
  const test = criterion(sc(args[1]));
  if (isError(test)) return test;
  let s: RangeRef = r;
  if (present(args[2])) {
    const sr = asRange(args[2]);
    if (isError(sr)) return sr;
    s = sr;
  }
  const emptyMatches = test(EMPTY);
  let sum = 0;
  let count = 0;
  // S is aligned at its top left cell; positions beyond the extent of S are empty (8.2 AVERAGEIF).
  const sRows = rangeRows(s);
  const sCols = rangeCols(s);
  // Where R and S both lie beyond their tables, R is empty and S has no number: no contribution.
  const rows = emptyMatches ? Math.min(rangeRows(r), Math.max(rowsIn(r), Math.min(sRows, rowsIn(s)))) : rowsIn(r);
  const cols = emptyMatches ? Math.min(rangeCols(r), Math.max(colsIn(r), Math.min(sCols, colsIn(s)))) : colsIn(r);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (!test(at(r, i, j))) continue;
      const v = i < sRows && j < sCols ? at(s, i, j) : EMPTY;
      if (typeof v === 'number') {
        sum += v;
        count++;
      } else if (isError(v)) return v;
    }
  }
  return { sum, count };
}

/** SUMIFS / COUNTIFS: pairs of range and criterion of equal size. */
function multiCriteria(pairs: ArgIn[], size: { rows: number; cols: number } | null): { ranges: RangeRef[]; tests: Test[]; rows: number; cols: number } | FormulaError {
  if (pairs.length === 0 || pairs.length % 2 !== 0) return VALUE;
  const ranges: RangeRef[] = [];
  const tests: Test[] = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const r = asRange(pairs[i]);
    if (isError(r)) return r;
    const t = criterion(sc(pairs[i + 1]));
    if (isError(t)) return t;
    ranges.push(r);
    tests.push(t);
  }
  const rows = size?.rows ?? rangeRows(ranges[0]!);
  const cols = size?.cols ?? rangeCols(ranges[0]!);
  if (ranges.some((r) => rangeRows(r) !== rows || rangeCols(r) !== cols)) return VALUE;
  return { ranges, tests, rows, cols };
}

/**
 * Area to scan for SUMIFS/COUNTIFS. A range whose criterion rejects empty cells limits the area to
 * its part inside the table. If every criterion accepts empty cells, every position beyond the
 * parts inside the tables (of all ranges and of `extra`, the sum range) is a match of empty cells
 * only; `outside` is their number, so they need not be visited one by one.
 */
function multiBounds(m: { ranges: RangeRef[]; tests: Test[]; rows: number; cols: number }, extra?: RangeRef): { rows: number; cols: number; outside: number } {
  let rows = m.rows;
  let cols = m.cols;
  let limited = false;
  m.ranges.forEach((r, i) => {
    if (!m.tests[i]!(EMPTY)) {
      limited = true;
      rows = Math.min(rows, scanRows(r, false));
      cols = Math.min(cols, scanCols(r, false));
    }
  });
  if (limited) return { rows, cols, outside: 0 };
  const all = extra ? [...m.ranges, extra] : m.ranges;
  rows = Math.min(m.rows, Math.max(0, ...all.map(rowsIn)));
  cols = Math.min(m.cols, Math.max(0, ...all.map(colsIn)));
  return { rows, cols, outside: m.rows * m.cols - rows * cols };
}

// ---------------------------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------------------------

type Plain = number | string | boolean;
const kindOf = (v: Plain) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);

/** Position (0-based) of `search` in `values` by exact or approximate match (HPF-TYP-006/007). */
function lookupPosition(values: Scalar[], search: Scalar, mode: -1 | 0 | 1): number {
  if (isError(search)) return -1;
  const s: Plain = search === EMPTY ? 0 : search;
  if (mode === 0) {
    for (let i = 0; i < values.length; i++) {
      const v = values[i]!;
      if (isError(v) || v === EMPTY) continue;
      if (kindOf(v) === kindOf(s) && compareScalars(v, s) === 0) return i;
    }
    return -1;
  }
  // Approximate: scan in order among values of the same kind; ascending (1): last value <= search,
  // descending (-1): last value >= search; stop at the first value beyond.
  let found = -1;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (isError(v) || v === EMPTY || kindOf(v) !== kindOf(s)) continue;
    const c = compareScalars(v, s);
    if (mode === 1 ? c <= 0 : c >= 0) found = i;
    else break;
  }
  return found;
}

function vector(r: RangeRef, fixed: number, alongRows: boolean): Scalar[] {
  const out: Scalar[] = [];
  const n = alongRows ? Math.min(rangeRows(r), Math.max(0, r.table.rows - r.r1)) : Math.min(rangeCols(r), Math.max(0, r.table.cols - r.c1));
  for (let i = 0; i < n; i++) out.push(alongRows ? at(r, i, fixed) : at(r, fixed, i));
  return out;
}

function tableLookup(args: ArgIn[], vertical: boolean): Arg {
  const search = sc(args[0]);
  if (isError(search)) return search;
  const data = asRange(args[1]);
  if (isError(data)) return data;
  const index = integer(args[2]);
  if (isError(index)) return index;
  const sorted = present(args[3]) ? logical(args[3]) : true;
  if (isError(sorted)) return sorted;
  const extent = vertical ? rangeCols(data) : rangeRows(data);
  if (index < 1 || index > extent) return REF;
  const keys = vector(data, 0, vertical);
  const pos = lookupPosition(keys, search, sorted ? 1 : 0);
  if (pos < 0) return NA;
  return vertical ? at(data, pos, index - 1) : at(data, index - 1, pos);
}

// ---------------------------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------------------------

function findIn(args: ArgIn[], fold: boolean): Arg {
  const search = text(args[0]);
  const t = text(args[1]);
  const start = optInteger(args[2], 1);
  const e = firstError(search, t, start);
  if (e) return e;
  const hay = codePoints(fold ? foldText(t as string) : (t as string));
  const needle = codePoints(fold ? foldText(search as string) : (search as string));
  const st = start as number;
  if (st < 1 || st > hay.length + 1) return VALUE;
  for (let i = st - 1; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i + 1;
  }
  return VALUE;
}

/**
 * Titlecase mappings of [Q10] that differ from taking the first code point of the uppercase
 * mapping and lowercasing the rest (UnicodeData field 14 and SpecialCasing.txt): the Latin
 * digraphs, ŉ, the Greek letters with ypogegrammeni, and Georgian Mkhedruli, whose titlecase is
 * the letter itself.
 */
const TITLECASE: ReadonlyMap<number, string> = new Map<number, string>([
  [0x01c4, '\u01c5'], [0x01c5, '\u01c5'], [0x01c6, '\u01c5'],
  [0x01c7, '\u01c8'], [0x01c8, '\u01c8'], [0x01c9, '\u01c8'],
  [0x01ca, '\u01cb'], [0x01cb, '\u01cb'], [0x01cc, '\u01cb'],
  [0x01f1, '\u01f2'], [0x01f2, '\u01f2'], [0x01f3, '\u01f2'],
  [0x0149, '\u02bc\u004e'],
  [0x1fb2, '\u1fba\u0345'], [0x1fb3, '\u1fbc'], [0x1fb4, '\u0386\u0345'], [0x1fb7, '\u0391\u0342\u0345'], [0x1fbc, '\u1fbc'],
  [0x1fc2, '\u1fca\u0345'], [0x1fc3, '\u1fcc'], [0x1fc4, '\u0389\u0345'], [0x1fc7, '\u0397\u0342\u0345'], [0x1fcc, '\u1fcc'],
  [0x1ff2, '\u1ffa\u0345'], [0x1ff3, '\u1ffc'], [0x1ff4, '\u038f\u0345'], [0x1ff7, '\u03a9\u0342\u0345'], [0x1ffc, '\u1ffc'],
]);

function titlecase(c: string): string {
  const cp = c.codePointAt(0)!;
  const special = TITLECASE.get(cp);
  if (special !== undefined) return special;
  // ᾀ…ᾯ: lowercase with ypogegrammeni → capital with prosgegrammeni (1F80–87 → 1F88–8F etc.)
  if (cp >= 0x1f80 && cp <= 0x1faf) return String.fromCodePoint(cp | 0x08);
  // Georgian Mkhedruli letters are their own titlecase (uppercase would be Mtavruli)
  if ((cp >= 0x10d0 && cp <= 0x10fa) || (cp >= 0x10fd && cp <= 0x10ff)) return c;
  const upper = c.toUpperCase();
  const first = String.fromCodePoint(upper.codePointAt(0)!);
  // ß → Ss, ﬁ → Fi, ﬃ → Ffi, և → Եւ: first code point upper, the rest lower (SpecialCasing)
  return first + upper.slice(first.length).toLowerCase();
}

/**
 * PROPER (8.2): the first letter of every word (a letter after a non-letter) in titlecase, the
 * other letters of the word in lowercase, both by the default case conversion of [Q10]
 * (HPF-TYP-012). The rest of a word is lowercased as a whole, so a final sigma becomes ς.
 */
function properCase(s: string): string {
  let out = '';
  for (const m of s.matchAll(/(\p{L}+)|(\P{L}+)/gu)) {
    if (m[2] !== undefined) {
      out += m[2];
      continue;
    }
    const word = m[1]!;
    const first = String.fromCodePoint(word.codePointAt(0)!);
    out += titlecase(first) + word.slice(first.length).toLowerCase();
  }
  return out;
}

function limitText(s: string): Arg {
  return codePoints(s).length > MAX_TEXT ? VALUE : s;
}

// ---------------------------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------------------------

function addMonths(start: number, months: number, endOfMonth: boolean): Num {
  const { y, m, d } = partsFromSerial(start);
  const total = y * 12 + (m - 1) + Math.trunc(months);
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  if (ny < 1899 || ny > 9999) return NUM;
  const last = daysInMonth(ny, nm);
  return checkSerial(serialFromParts(ny, nm, endOfMonth ? last : Math.min(d, last)));
}

function dateDif(start: number, end: number, unit: string): Num {
  if (start > end) return NUM;
  const a = partsFromSerial(start);
  const b = partsFromSerial(end);
  const s = Math.floor(start);
  const e = Math.floor(end);
  switch (unit) {
    case 'd':
      return e - s;
    case 'm': {
      let months = (b.y - a.y) * 12 + (b.m - a.m);
      if (b.d < a.d) months--;
      return months;
    }
    case 'y': {
      let years = b.y - a.y;
      if (b.m < a.m || (b.m === a.m && b.d < a.d)) years--;
      return years;
    }
    case 'ym': {
      let months = b.m - a.m;
      if (b.d < a.d) months--;
      return ((months % 12) + 12) % 12;
    }
    case 'md': {
      if (a.d <= b.d) return b.d - a.d;
      // Day of the start date in the month before the end date, overflow rolls on.
      return e - serialFromParts(b.y, b.m - 1, a.d);
    }
    case 'yd': {
      const year = b.m > a.m || (b.m === a.m && b.d >= a.d) ? b.y : b.y - 1;
      const shifted = a.m === 2 && a.d === 29 && daysInMonth(year, 2) === 28 ? serialFromParts(year, 3, 1) : serialFromParts(year, a.m, a.d);
      return e - shifted;
    }
    default:
      return VALUE;
  }
}

const WEEKDAY_START: Record<number, number> = { 11: 1, 12: 2, 13: 3, 14: 4, 15: 5, 16: 6, 17: 0 };

// ---------------------------------------------------------------------------------------------
// Financial (OpenFormula 6.12)
// ---------------------------------------------------------------------------------------------

const typeFlag = (t: number) => (t !== 0 ? 1 : 0);

function finArgs(args: ArgIn[], required: number, optional: number[]): number[] | FormulaError {
  const out: number[] = [];
  for (let i = 0; i < required + optional.length; i++) {
    const v = i < required ? number(args[i]) : present(args[i]) ? number(args[i]) : optional[i - required]!;
    if (isError(v)) return v;
    out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The function table
// ---------------------------------------------------------------------------------------------

const ALL = Infinity;
const defs: FunctionDef[] = [];
function eager(name: string, min: number, max: number, fn: (args: ArgIn[], ctx: EvalContext) => Arg, allowEmpty = false): void {
  defs.push({ name, min, max, fn, ...(allowEmpty ? { allowEmpty } : {}) });
}
function numeric1(name: string, f: (x: number) => Num): void {
  eager(name, 1, 1, (a) => {
    const x = number(a[0]);
    return isError(x) ? x : f(x);
  });
}
function rounding(name: string, mode: RoundMode): void {
  eager(name, 1, 2, (a, ctx) => {
    const x = number(a[0]);
    const d = optInteger(a[1], 0);
    const e = firstError(x, d);
    if (e) return e;
    return num(roundDecimal(x as number, d as number, mode, ctx.rounding));
  });
}
function logicalFold(name: string, combine: (vals: boolean[]) => boolean): void {
  eager(name, 1, ALL, (args) => {
    const vals: boolean[] = [];
    for (const a of args) {
      if (a === MISSING) return VALUE;
      if (isRange(a)) {
        let err: FormulaError | undefined;
        forEachCell(a, (v) => {
          if (typeof v === 'number') vals.push(v !== 0);
          else if (typeof v === 'boolean') vals.push(v);
          else if (isError(v)) {
            err = v;
            return false;
          }
          return true;
        });
        if (err) return err;
      } else {
        const b = toLogical(a);
        if (isError(b)) return b;
        vals.push(b);
      }
    }
    return vals.length === 0 ? VALUE : combine(vals);
  });
}
function predicate(name: string, f: (v: Scalar) => boolean): void {
  eager(name, 1, 1, (a) => f(sc(a[0])));
}
function datePart(name: string, f: (s: number) => number): void {
  eager(name, 1, 1, (a) => {
    const d = dateOnly(a[0]);
    return isError(d) ? d : f(d);
  });
}
function timePart(name: string, f: (p: ReturnType<typeof clockFields>) => number): void {
  eager(name, 1, 1, (a) => {
    const t = dateParam(a[0]);
    if (isError(t)) return t;
    if (t < 0) return NUM;
    return f(clockFields(t));
  });
}

// Mathematical
numeric1('ABS', (x) => Math.abs(x));
numeric1('EXP', (x) => num(Math.exp(x)));
numeric1('INT', (x) => Math.floor(x));
numeric1('LN', (x) => (x <= 0 ? NUM : num(Math.log(x))));
numeric1('LOG10', (x) => (x <= 0 ? NUM : num(Math.log10(x))));
numeric1('SIGN', (x) => (x > 0 ? 1 : x < 0 ? -1 : 0));
numeric1('SQRT', (x) => (x < 0 ? NUM : Math.sqrt(x)));
eager('PI', 0, 0, () => Math.PI);
eager('MOD', 2, 2, (a) => {
  const x = number(a[0]);
  const y = number(a[1]);
  const e = firstError(x, y);
  if (e) return e;
  if (y === 0) return DIV0;
  return num((x as number) - (y as number) * Math.floor((x as number) / (y as number)));
});
eager('POWER', 2, 2, (a) => {
  const x = number(a[0]);
  const y = number(a[1]);
  const e = firstError(x, y);
  return e ?? powerOp(x as number, y as number);
});
rounding('ROUND', 'half-away');
rounding('ROUNDUP', 'up');
rounding('ROUNDDOWN', 'down');
rounding('TRUNC', 'down');
eager('SUM', 1, ALL, (a) => {
  const ns = collectNumbers(a);
  if (isError(ns)) return ns;
  let s = 0;
  for (const n of ns) s += n;
  return num(s);
});
eager('PRODUCT', 1, ALL, (a) => {
  const ns = collectNumbers(a);
  if (isError(ns)) return ns;
  if (ns.length === 0) return 0;
  let p = 1;
  for (const n of ns) p *= n;
  return num(p);
});
eager('SUMIF', 2, 3, (a) => {
  const r = conditionalSum(a);
  return isError(r) ? r : num(r.sum);
});
eager('SUMIFS', 3, ALL, (a) => {
  const s = asRange(a[0]);
  if (isError(s)) return s;
  const m = multiCriteria(a.slice(1), { rows: rangeRows(s), cols: rangeCols(s) });
  if (isError(m)) return m;
  const { rows, cols } = multiBounds(m, s);
  let sum = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (!m.ranges.every((r, k) => m.tests[k]!(at(r, i, j)))) continue;
      const v = at(s, i, j);
      if (typeof v === 'number') sum += v;
      else if (isError(v)) return v;
    }
  }
  return num(sum);
});
eager('SUMPRODUCT', 1, ALL, (args) => {
  let rows = -1;
  let cols = -1;
  const mats: Array<(i: number, j: number) => Scalar> = [];
  for (const a of args) {
    if (a === MISSING) return VALUE;
    let r: number;
    let c: number;
    if (isRange(a)) {
      r = rangeRows(a);
      c = rangeCols(a);
      mats.push((i, j) => at(a, i, j));
    } else {
      r = 1;
      c = 1;
      mats.push(() => a);
    }
    if (rows < 0) {
      rows = r;
      cols = c;
    } else if (r !== rows || c !== cols) return VALUE;
  }
  // Beyond the parts of all ranges inside their tables every factor is an empty cell (0), so the
  // products there are 0 and contain no error: they need not be visited.
  if (args.every((a) => isRange(a))) {
    const ranges = args as RangeRef[];
    rows = Math.min(rows, Math.max(...ranges.map(rowsIn)));
    cols = Math.min(cols, Math.max(...ranges.map(colsIn)));
  }
  let sum = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let p = 1;
      for (const m of mats) {
        const v = m(i, j);
        if (isError(v)) return v;
        p *= typeof v === 'number' ? v : 0;
      }
      sum += p;
    }
  }
  return num(sum);
});

// Statistical
eager('AVERAGE', 1, ALL, (a) => {
  const ns = collectNumbers(a);
  if (isError(ns)) return ns;
  if (ns.length === 0) return DIV0;
  let s = 0;
  for (const n of ns) s += n;
  return num(s / ns.length);
});
eager('AVERAGEIF', 2, 3, (a) => {
  const r = conditionalSum(a);
  if (isError(r)) return r;
  return r.count === 0 ? DIV0 : num(r.sum / r.count);
});
eager('MAX', 1, ALL, (a) => {
  const ns = collectNumbers(a);
  if (isError(ns)) return ns;
  let m = -Infinity;
  for (const n of ns) if (n > m) m = n;
  return ns.length === 0 ? 0 : m;
});
eager('MIN', 1, ALL, (a) => {
  const ns = collectNumbers(a);
  if (isError(ns)) return ns;
  let m = Infinity;
  for (const n of ns) if (n < m) m = n;
  return ns.length === 0 ? 0 : m;
});
eager('MEDIAN', 1, ALL, (a) => {
  const ns = collectNumbers(a);
  if (isError(ns)) return ns;
  if (ns.length === 0) return NUM;
  const s = [...ns].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : num((s[mid - 1]! + s[mid]!) / 2);
});
eager('COUNT', 1, ALL, (args) => {
  let n = 0;
  for (const a of args) {
    if (a === MISSING) return VALUE;
    if (isRange(a)) forEachCell(a, (v) => void (typeof v === 'number' && n++));
    else if (!isError(toNumber(a))) n++;
  }
  return n;
});
eager('COUNTA', 1, ALL, (args) => {
  let n = 0;
  for (const a of args) {
    if (a === MISSING) return VALUE;
    if (isRange(a)) forEachCell(a, (v) => void (v !== EMPTY && n++));
    else if (a !== EMPTY) n++;
  }
  return n;
});
eager('COUNTBLANK', 1, 1, (a) => {
  const r = asRange(a[0]);
  if (isError(r)) return r;
  let filled = 0;
  forEachCell(r, (v) => void (v !== EMPTY && filled++));
  return rangeRows(r) * rangeCols(r) - filled;
});
eager('COUNTIF', 2, 2, (a) => {
  const r = asRange(a[0]);
  if (isError(r)) return r;
  const test = criterion(sc(a[1]));
  if (isError(test)) return test;
  let n = 0;
  let filled = 0;
  forEachCell(r, (v) => {
    if (v !== EMPTY) filled++;
    if (v !== EMPTY && test(v)) n++;
  });
  if (test(EMPTY)) n += rangeRows(r) * rangeCols(r) - filled;
  return n;
});
eager('COUNTIFS', 2, ALL, (a) => {
  const m = multiCriteria(a, null);
  if (isError(m)) return m;
  const { rows, cols, outside } = multiBounds(m);
  let n = outside;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) if (m.ranges.every((r, k) => m.tests[k]!(at(r, i, j)))) n++;
  return n;
});

// Information
predicate('ISBLANK', (v) => v === EMPTY);
predicate('ISERR', (v) => isError(v) && v !== NA);
predicate('ISERROR', (v) => isError(v));
predicate('ISNA', (v) => v === NA);
predicate('ISLOGICAL', (v) => typeof v === 'boolean');
predicate('ISNUMBER', (v) => typeof v === 'number');
predicate('ISTEXT', (v) => typeof v === 'string');
predicate('ISNONTEXT', (v) => typeof v !== 'string');
for (const [name, rem] of [['ISEVEN', 0], ['ISODD', 1]] as const) {
  eager(name, 1, 1, (a) => {
    const x = sc(a[0]);
    if (typeof x === 'string') return VALUE;
    const n = toNumber(x);
    if (isError(n)) return n;
    return Math.abs(Math.trunc(n)) % 2 === rem;
  });
}
eager('N', 1, 1, (a) => {
  const v = sc(a[0]);
  if (typeof v === 'number' || isError(v)) return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return 0;
});
eager('NA', 0, 0, () => NA);
eager('ROW', 0, 1, (a, ctx) => {
  if (!present(a[0])) return ctx.row + 1;
  return isRange(a[0]) ? a[0].r1 + 1 : isError(a[0]) ? a[0] : VALUE;
});
eager('COLUMN', 0, 1, (a, ctx) => {
  if (!present(a[0])) return ctx.col + 1;
  return isRange(a[0]) ? a[0].c1 + 1 : isError(a[0]) ? a[0] : VALUE;
});
eager('ROWS', 1, 1, (a) => (isRange(a[0]) ? rangeRows(a[0]) : isError(a[0]) ? a[0] : 1));
eager('COLUMNS', 1, 1, (a) => (isRange(a[0]) ? rangeCols(a[0]) : isError(a[0]) ? a[0] : 1));

// Logical
eager('TRUE', 0, 0, () => true);
eager('FALSE', 0, 0, () => false);
eager('NOT', 1, 1, (a) => {
  const b = logical(a[0]);
  return isError(b) ? b : !b;
});
logicalFold('AND', (v) => v.every(Boolean));
logicalFold('OR', (v) => v.some(Boolean));
logicalFold('XOR', (v) => v.filter(Boolean).length % 2 === 1);
defs.push({
  name: 'IF',
  min: 1,
  max: 3,
  allowEmpty: true,
  lazy: (args) => {
    const cond = toLogical(scalar(args[0] ? args[0]() : EMPTY));
    if (isError(cond)) return cond;
    const idx = cond ? 1 : 2;
    if (idx >= args.length) return cond; // IF(c) and IF(c;x): missing branch gives TRUE or FALSE
    const branch = args[idx];
    return branch ? branch() : 0; // present but empty: 0
  },
});
defs.push({
  name: 'IFERROR',
  min: 2,
  max: 2,
  lazy: (args) => {
    const x = args[0]!();
    return isError(scalar(x)) && (!isRange(x) || (x.r1 === x.r2 && x.c1 === x.c2)) ? args[1]!() : x;
  },
});
defs.push({
  name: 'IFNA',
  min: 2,
  max: 2,
  lazy: (args) => {
    const x = args[0]!();
    return scalar(x) === NA ? args[1]!() : x;
  },
});
defs.push({
  name: 'CHOOSE',
  min: 2,
  max: ALL,
  lazy: (args) => {
    const i = toInteger(scalar(args[0]!()));
    if (isError(i)) return i;
    if (i < 1 || i >= args.length) return VALUE;
    return args[i]!();
  },
});

// Lookup and reference
eager('VLOOKUP', 3, 4, (a) => tableLookup(a, true));
eager('HLOOKUP', 3, 4, (a) => tableLookup(a, false));
eager('MATCH', 2, 3, (a) => {
  const search = sc(a[0]);
  if (isError(search)) return search;
  const r = asRange(a[1]);
  if (isError(r)) return r;
  const type = optInteger(a[2], 1);
  if (isError(type)) return type;
  if (type < -1 || type > 1) return VALUE;
  let values: Scalar[];
  if (rangeCols(r) === 1) values = vector(r, 0, true);
  else if (rangeRows(r) === 1) values = vector(r, 0, false);
  else return NA;
  const pos = lookupPosition(values, search, type as -1 | 0 | 1);
  return pos < 0 ? NA : pos + 1;
});
eager(
  'INDEX',
  1,
  3,
  (a) => {
    const r = asRange(a[0]);
    if (isError(r)) return r;
    const rows = rangeRows(r);
    const cols = rangeCols(r);
    let row = optInteger(a[1], 0);
    let col = optInteger(a[2], 0);
    const e = firstError(row, col);
    if (e) return e;
    if (a.length < 3 && rows === 1 && cols > 1) {
      col = row;
      row = 0;
    }
    const ri = row as number;
    const ci = col as number;
    if (ri < 0 || ci < 0) return VALUE;
    if (ri > rows || ci > cols) return REF;
    return {
      k: 'range',
      table: r.table,
      r1: ri === 0 ? r.r1 : r.r1 + ri - 1,
      r2: ri === 0 ? r.r2 : r.r1 + ri - 1,
      c1: ci === 0 ? r.c1 : r.c1 + ci - 1,
      c2: ci === 0 ? r.c2 : r.c1 + ci - 1,
    };
  },
  true,
);

// Text
eager('CONCATENATE', 1, ALL, (args) => {
  let s = '';
  for (const a of args) {
    const t = text(a);
    if (isError(t)) return t;
    s += t;
  }
  return limitText(s);
});
eager('EXACT', 2, 2, (a) => {
  const x = text(a[0]);
  const y = text(a[1]);
  const e = firstError(x, y);
  return e ?? compareCodePoints(x as string, y as string) === 0;
});
eager('FIND', 2, 3, (a) => findIn(a, false));
eager('SEARCH', 2, 3, (a) => findIn(a, true));
eager('LEFT', 1, 2, (a) => {
  const t = text(a[0]);
  const n = optInteger(a[1], 1);
  const e = firstError(t, n);
  if (e) return e;
  if ((n as number) < 0) return VALUE;
  return codePoints(t as string).slice(0, n as number).join('');
});
eager('RIGHT', 1, 2, (a) => {
  const t = text(a[0]);
  const n = optInteger(a[1], 1);
  const e = firstError(t, n);
  if (e) return e;
  if ((n as number) < 0) return VALUE;
  const cps = codePoints(t as string);
  return cps.slice(Math.max(0, cps.length - (n as number))).join('');
});
eager('MID', 3, 3, (a) => {
  const t = text(a[0]);
  const st = integer(a[1]);
  const n = integer(a[2]);
  const e = firstError(t, st, n);
  if (e) return e;
  if ((st as number) < 1 || (n as number) < 0) return VALUE;
  return codePoints(t as string).slice((st as number) - 1, (st as number) - 1 + (n as number)).join('');
});
eager('LEN', 1, 1, (a) => {
  const t = text(a[0]);
  return isError(t) ? t : codePoints(t).length;
});
eager('LOWER', 1, 1, (a) => {
  const t = text(a[0]);
  return isError(t) ? t : t.toLowerCase();
});
eager('UPPER', 1, 1, (a) => {
  const t = text(a[0]);
  return isError(t) ? t : t.toUpperCase();
});
eager('PROPER', 1, 1, (a) => {
  const t = text(a[0]);
  return isError(t) ? t : properCase(t);
});
eager('REPT', 2, 2, (a) => {
  const t = text(a[0]);
  const n = integer(a[1]);
  const e = firstError(t, n);
  if (e) return e;
  if ((n as number) < 0) return VALUE;
  if (codePoints(t as string).length * (n as number) > MAX_TEXT) return VALUE;
  return (t as string).repeat(n as number);
});
eager('SUBSTITUTE', 3, 4, (a) => {
  const t = text(a[0]);
  const old = text(a[1]);
  const neu = text(a[2]);
  const which = present(a[3]) ? integer(a[3]) : null;
  const e = firstError(t, old, neu, which);
  if (e) return e;
  const [ts, os, ns] = [t as string, old as string, neu as string];
  if (which !== null && (which as number) < 1) return VALUE;
  if (os === '') return ts;
  if (which === null) return limitText(ts.split(os).join(ns));
  let idx = -1;
  for (let k = 0; k < (which as number); k++) {
    idx = ts.indexOf(os, idx + (k === 0 ? 0 : os.length));
    if (idx < 0) return ts;
  }
  return limitText(ts.slice(0, idx) + ns + ts.slice(idx + os.length));
});
eager('T', 1, 1, (a) => {
  const v = sc(a[0]);
  if (typeof v === 'string' || isError(v)) return v;
  return '';
});
eager('TRIM', 1, 1, (a) => {
  const t = text(a[0]);
  return isError(t) ? t : t.replace(/^ +| +$/g, '').replace(/ {2,}/g, ' ');
});
eager('VALUE', 1, 1, (a) => {
  const t = text(a[0]);
  if (isError(t)) return t;
  const m = /^([+-]?)([0-9]+(?:\.[0-9]*)?(?:[eE][+-]?[0-9]+)?)(%?)$/.exec(t);
  if (m) {
    const n = Number(m[2]) * (m[1] === '-' ? -1 : 1);
    return num(m[3] ? n / 100 : n);
  }
  const p = parseIsoDateTime(t);
  if (!p) return VALUE;
  // HPF-DAT-002: a date outside 0 … 2958465 is #NUM!, also when read by VALUE
  if (p.date !== null && !isValidSerial(p.date)) return NUM;
  return (p.date ?? 0) + p.time;
});

// Date and time
eager('DATE', 3, 3, (a) => {
  const y = integer(a[0]);
  const m = integer(a[1]);
  const d = integer(a[2]);
  const e = firstError(y, m, d);
  if (e) return e;
  // 8.2 DATE: Year < 1899 → #NUM!; otherwise only the result must lie in HPF-DAT-002, so that
  // an overflow such as DATE(10000;-11;1) = 9999-01-01 resolves (HPF-DAT-006).
  if ((y as number) < 1899) return NUM;
  return checkSerial(serialFromParts(y as number, m as number, d as number));
});
eager('DATEVALUE', 1, 1, (a) => {
  const t = text(a[0]);
  if (isError(t)) return t;
  const p = parseIsoDateTime(t);
  if (!p || p.date === null) return VALUE;
  return checkSerial(p.date);
});
eager('TIME', 3, 3, (a) => {
  const h = number(a[0]);
  const m = number(a[1]);
  const s = number(a[2]);
  const e = firstError(h, m, s);
  if (e) return e;
  const t = timeFraction(h as number, m as number, s as number);
  return t < 0 ? NUM : num(t);
});
eager('TIMEVALUE', 1, 1, (a) => {
  const t = text(a[0]);
  if (isError(t)) return t;
  const p = parseIsoDateTime(t);
  return p ? p.time : VALUE;
});
datePart('YEAR', (s) => partsFromSerial(s).y);
datePart('MONTH', (s) => partsFromSerial(s).m);
datePart('DAY', (s) => partsFromSerial(s).d);
timePart('HOUR', (p) => p.h);
timePart('MINUTE', (p) => p.min);
timePart('SECOND', (p) => p.s);
eager('DAYS', 2, 2, (a) => {
  const e1 = dateParam(a[0]);
  const s1 = dateParam(a[1]);
  const e = firstError(e1, s1);
  return e ?? Math.floor(e1 as number) - Math.floor(s1 as number);
});
eager('DATEDIF', 3, 3, (a) => {
  const s = dateOnly(a[0]);
  const en = dateOnly(a[1]);
  const u = text(a[2]);
  const e = firstError(s, en, u);
  if (e) return e;
  const unit = (u as string).toLowerCase();
  if (!['y', 'm', 'd', 'md', 'ym', 'yd'].includes(unit)) return VALUE;
  return dateDif(s as number, en as number, unit);
});
eager('EDATE', 2, 2, (a) => {
  const s = dateOnly(a[0]);
  const m = number(a[1]);
  const e = firstError(s, m);
  return e ?? addMonths(s as number, m as number, false);
});
eager('EOMONTH', 2, 2, (a) => {
  const s = dateOnly(a[0]);
  const m = integer(a[1]);
  const e = firstError(s, m);
  return e ?? addMonths(s as number, m as number, true);
});
eager('WEEKDAY', 1, 2, (a) => {
  const d = dateOnly(a[0]);
  const type = optInteger(a[1], 1);
  const e = firstError(d, type);
  if (e) return e;
  const dow = dayOfWeek(d as number); // 0 = Sunday
  switch (type) {
    case 1:
      return dow + 1;
    case 2:
      return dow === 0 ? 7 : dow;
    case 3:
      return (dow + 6) % 7;
    default: {
      const start = WEEKDAY_START[type as number];
      if (start === undefined) return VALUE;
      return ((dow - start + 7) % 7) + 1;
    }
  }
});
datePart('ISOWEEKNUM', (s) => isoWeekNumber(s));

// Financial
eager('FV', 3, 5, (a) => {
  const v = finArgs(a, 3, [0, 0]);
  if (isError(v)) return v;
  const [rate, nper, pmt, pv, type] = v as [number, number, number, number, number];
  if (rate === 0) return num(-pv - pmt * nper);
  const f = Math.pow(1 + rate, nper);
  return num(-pv * f - (pmt * (1 + rate * typeFlag(type)) * (f - 1)) / rate);
});
eager('PV', 3, 5, (a) => {
  const v = finArgs(a, 3, [0, 0]);
  if (isError(v)) return v;
  const [rate, nper, pmt, fv, type] = v as [number, number, number, number, number];
  if (rate === 0) return num(-fv - pmt * nper);
  const f = Math.pow(1 + rate, nper);
  return num((-fv - (pmt * (1 + rate * typeFlag(type)) * (f - 1)) / rate) / f);
});
eager('PMT', 3, 5, (a) => {
  const v = finArgs(a, 3, [0, 0]);
  if (isError(v)) return v;
  const [rate, nper, pv, fv, type] = v as [number, number, number, number, number];
  if (nper === 0) return NUM;
  if (rate === 0) return num(-(pv + fv) / nper);
  const f = Math.pow(1 + rate, nper);
  return num((-(pv * f + fv) * rate) / ((1 + rate * typeFlag(type)) * (f - 1)));
});
eager('NPER', 3, 5, (a) => {
  const v = finArgs(a, 3, [0, 0]);
  if (isError(v)) return v;
  const [rate, pmt, pv, fv, type] = v as [number, number, number, number, number];
  if (rate === 0) return pmt === 0 ? DIV0 : num(-(pv + fv) / pmt);
  const t = typeFlag(type);
  const x = (pmt * (1 + rate * t) - fv * rate) / (pmt * (1 + rate * t) + pv * rate);
  if (!(x > 0) || !(1 + rate > 0)) return NUM;
  return num(Math.log(x) / Math.log(1 + rate));
});
eager('NPV', 2, ALL, (a) => {
  const rate = number(a[0]);
  if (isError(rate)) return rate;
  if (rate === -1) return DIV0;
  const ns = collectNumbers(a.slice(1));
  if (isError(ns)) return ns;
  let s = 0;
  ns.forEach((v, i) => {
    s += v / Math.pow(1 + rate, i + 1);
  });
  return num(s);
});

/** Functions that treat error values in their parameters themselves (HPF-ERR-002). */
const OWN_ERRORS = new Set(['ISERROR', 'ISERR', 'ISNA', 'IFERROR', 'IFNA', 'COUNT', 'COUNTA', 'COUNTBLANK', 'ISBLANK', 'ISNUMBER', 'ISTEXT', 'ISLOGICAL', 'ISNONTEXT', 'T', 'N', 'IF']);
/** Functions with Reference, NumberSequence(List) or Array parameters (list 8.2). */
const REFERENCE_PARAMS = new Set([
  'AND', 'AVERAGE', 'AVERAGEIF', 'COLUMN', 'COLUMNS', 'COUNTIF', 'COUNTIFS', 'HLOOKUP', 'INDEX', 'MATCH', 'MAX', 'MEDIAN', 'MIN',
  'NPV', 'OR', 'PRODUCT', 'ROW', 'ROWS', 'SUM', 'SUMIF', 'SUMIFS', 'SUMPRODUCT', 'VLOOKUP', 'XOR',
]);

/** The function table of the calculator, keyed by upper-case name. */
export const FUNCTIONS: ReadonlyMap<string, FunctionDef> = new Map(
  defs.map((d) => [d.name, { ...d, ...(OWN_ERRORS.has(d.name) ? { ownErrors: true } : {}), ...(REFERENCE_PARAMS.has(d.name) ? { referenceParams: true } : {}) }]),
);

/** Names of all supported functions, sorted. */
export const SUPPORTED_FUNCTIONS: readonly string[] = [...FUNCTIONS.keys()].sort();
