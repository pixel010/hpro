/**
 * Values of the calculator (part 3, section 4): number (binary64), text, logical, error and
 * empty. Date, time, percentage and currency are numbers with a display type (HPF-TYP-001).
 *
 * Conversions close every latitude OpenFormula leaves to the evaluator: no implicit text to
 * number (HPF-TYP-002), no locale, exact comparison (HPF-TYP-005), case-insensitive text
 * comparison by simple case folding and code points (HPF-TYP-006), mixed-type ordering
 * number < text < logical (HPF-TYP-007).
 */

/** Error names of part 3, table 7.1. */
export const ERROR_NAMES = ['#DIV/0!', '#N/A', '#NAME?', '#NUM!', '#REF!', '#VALUE!', '#NULL!', '#CIRC!'] as const;
export type ErrorName = (typeof ERROR_NAMES)[number];

/** An error value. One shared instance per name, so `===` compares names. */
export class FormulaError {
  private constructor(readonly name: ErrorName) {}
  static readonly all = new Map<ErrorName, FormulaError>(ERROR_NAMES.map((n) => [n, new FormulaError(n)]));
  static of(name: ErrorName): FormulaError {
    return FormulaError.all.get(name)!;
  }
  toString(): string {
    return this.name;
  }
}

export const DIV0 = FormulaError.of('#DIV/0!');
export const NA = FormulaError.of('#N/A');
export const NAME = FormulaError.of('#NAME?');
export const NUM = FormulaError.of('#NUM!');
export const REF = FormulaError.of('#REF!');
export const VALUE = FormulaError.of('#VALUE!');
export const NULL = FormulaError.of('#NULL!');
export const CIRC = FormulaError.of('#CIRC!');

export function isErrorName(s: string): s is ErrorName {
  return (ERROR_NAMES as readonly string[]).includes(s);
}

/** The value of an empty cell. */
export const EMPTY: unique symbol = Symbol('empty');
export type Empty = typeof EMPTY;

export type Scalar = number | string | boolean | FormulaError | Empty;

export const isError = (v: unknown): v is FormulaError => v instanceof FormulaError;

/** Canonical number form (HPF-NUM-002): shortest round-trip (Number::toString), -0 as 0. */
export function canonicalNumber(x: number): string {
  if (Object.is(x, -0)) return '0';
  return String(x);
}

/** Every computed number passes through here: infinity and NaN become #NUM! (HPF-NUM-003). */
export function num(x: number): number | FormulaError {
  return Number.isFinite(x) ? x : NUM;
}

/** Where a number is expected (HPF-TYP-002). */
export function toNumber(v: Scalar): number | FormulaError {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === EMPTY) return 0;
  if (isError(v)) return v;
  return VALUE;
}

/** Where a logical value is expected (HPF-TYP-003). */
export function toLogical(v: Scalar): boolean | FormulaError {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v === EMPTY) return false;
  if (isError(v)) return v;
  return VALUE;
}

/** Where text is expected (HPF-TYP-004). */
export function toText(v: Scalar): string | FormulaError {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return canonicalNumber(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v === EMPTY) return '';
  return v;
}

/** Code points of a string (positions in LEN, MID, FIND count code points, not UTF-16 units). */
export function codePoints(s: string): string[] {
  return Array.from(s);
}

const SINGLE = (s: string) => {
  const cp = s.codePointAt(0);
  return cp !== undefined && s.length === (cp > 0xffff ? 2 : 1);
};

/**
 * Simple case folding of one code point (Unicode default case folding, status C+S, [Q10]
 * §3.13): one-to-one, so `ß` stays `ß` and `"Straße"="STRASSE"` is FALSE (HPF-TYP-006).
 * Derived from the engine's locale-independent case mappings: upper then lower, which maps
 * ς, ϐ, ſ, K (Kelvin) and title-case letters to their folded forms; mappings that would
 * produce several code points are not simple foldings and leave the character unchanged.
 */
const FOLD_CACHE = new Map<string, string>();
const FOLD_EXCEPTIONS = new Map<string, string>([
  ['İ', 'İ'], // İ: only T/F foldings, none in C+S
  ['ı', 'ı'], // ı: no folding
]);
export function foldChar(c: string): string {
  if (c < '\u0080') return c >= 'A' && c <= 'Z' ? String.fromCharCode(c.charCodeAt(0) + 32) : c;
  const cached = FOLD_CACHE.get(c);
  if (cached !== undefined) return cached;
  let out = FOLD_EXCEPTIONS.get(c);
  if (out === undefined) {
    const upper = c.toUpperCase();
    const lower = SINGLE(upper) ? upper.toLowerCase() : c.toLowerCase();
    out = SINGLE(lower) ? lower : c;
  }
  FOLD_CACHE.set(c, out);
  return out;
}

export function foldText(s: string): string {
  let out = '';
  for (const c of s) out += foldChar(c);
  return out;
}

/** Compares two strings by code points (not UTF-16 code units). */
export function compareCodePoints(a: string, b: string): number {
  if (a === b) return 0;
  const ia = a[Symbol.iterator]();
  const ib = b[Symbol.iterator]();
  for (;;) {
    const x = ia.next();
    const y = ib.next();
    if (x.done) return y.done ? 0 : -1;
    if (y.done) return 1;
    if (x.value !== y.value) return x.value.codePointAt(0)! - y.value.codePointAt(0)! < 0 ? -1 : 1;
  }
}

/** Case-insensitive text comparison (HPF-TYP-006). */
export function compareText(a: string, b: string): number {
  return compareCodePoints(foldText(a), foldText(b));
}

const RANK = (v: number | string | boolean) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);

/**
 * Ordered comparison of two non-error scalars (HPF-TYP-005/007): empty adopts the type of the
 * other side (0, "" or FALSE); number < text < logical; FALSE < TRUE.
 */
export function compareScalars(a: number | string | boolean | Empty, b: number | string | boolean | Empty): number {
  if (a === EMPTY && b === EMPTY) return 0;
  const x = a === EMPTY ? emptyLike(b as number | string | boolean) : a;
  const y = b === EMPTY ? emptyLike(a as number | string | boolean) : b;
  const ra = RANK(x);
  const rb = RANK(y);
  if (ra !== rb) return ra < rb ? -1 : 1;
  if (typeof x === 'number') return x < (y as number) ? -1 : x > (y as number) ? 1 : 0;
  if (typeof x === 'string') return compareText(x, y as string);
  return x === y ? 0 : x ? 1 : -1;
}

function emptyLike(other: number | string | boolean): number | string | boolean {
  return typeof other === 'number' ? 0 : typeof other === 'string' ? '' : false;
}

/** StandardNumber of OpenFormula §5.3, used by VALUE and criteria (HPF-TYP-010). */
export const STANDARD_NUMBER = /^[0-9]+(\.[0-9]*)?([eE][+-]?[0-9]+)?$/;

/** Truncation for parameters of type Integer. */
export function toInteger(v: Scalar): number | FormulaError {
  const n = toNumber(v);
  return typeof n === 'number' ? Math.trunc(n) : n;
}

/** Display name of a value type for messages and JSON export. */
export function scalarKind(v: Scalar): 'number' | 'text' | 'logical' | 'error' | 'empty' {
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'text';
  if (typeof v === 'boolean') return 'logical';
  if (v === EMPTY) return 'empty';
  return 'error';
}
