/**
 * Expression evaluation (part 3, sections 4, 5 and 11): eager, left to right, except for the
 * functions that evaluate only the chosen branch (HPF-CALC-003). References stay references
 * until a single value is needed; a range where a single value is expected is `#VALUE!` without
 * implicit intersection (HPF-TYP-008).
 */
import type { RoundingBasis } from './numbers.js';
import type { TableModel } from './model.js';
import { LIMITS, type Node } from './parser.js';
import {
  DIV0,
  EMPTY,
  NAME,
  NUM,
  REF,
  VALUE,
  compareScalars,
  isError,
  FormulaError,
  num,
  toNumber,
  toText,
  type Scalar,
} from './values.js';

/** A rectangular reference into a table, zero-based and inclusive. */
export interface RangeRef {
  readonly k: 'range';
  readonly table: TableModel;
  readonly r1: number;
  readonly c1: number;
  readonly r2: number;
  readonly c2: number;
}

/** An empty parameter (`IF(c;;x)`), allowed only where the function list says so. */
export const MISSING: unique symbol = Symbol('missing');
export type Arg = Scalar | RangeRef;
export type ArgIn = Arg | typeof MISSING;

export const isRange = (v: unknown): v is RangeRef => typeof v === 'object' && v !== null && (v as RangeRef).k === 'range';

export interface EvalContext {
  /** Table of the formula (target of `[.A1]`). */
  readonly table: TableModel;
  readonly row: number;
  readonly col: number;
  resolveTable(id: string): TableModel | undefined;
  /** Rounding basis of ROUND, ROUNDUP, ROUNDDOWN, TRUNC (default: part 3 version 0.1). */
  readonly rounding?: RoundingBasis;
}

export interface FunctionDef {
  readonly name: string;
  readonly min: number;
  readonly max: number;
  /** Empty parameters allowed (IF, INDEX; HPF-SYN-004). */
  readonly allowEmpty?: boolean;
  /** Eager functions get evaluated arguments. */
  readonly fn?: (args: ArgIn[], ctx: EvalContext) => Arg;
  /** Short-circuit functions get thunks (IF, IFERROR, IFNA, CHOOSE). */
  readonly lazy?: (args: Array<(() => Arg) | null>, ctx: EvalContext) => Arg;
}

/** The single value of an argument (HPF-TYP-008). */
export function scalar(a: Arg): Scalar {
  if (!isRange(a)) return a;
  if (a.r1 !== a.r2 || a.c1 !== a.c2) return VALUE;
  return a.table.valueAt(a.r1, a.c1);
}

export function rangeRows(r: RangeRef): number {
  return r.r2 - r.r1 + 1;
}
export function rangeCols(r: RangeRef): number {
  return r.c2 - r.c1 + 1;
}

/**
 * Calls `visit` for every cell of the range that exists in the grid, row by row from top left
 * (document order, HPF-NUM-005). Positions outside the table are empty and not visited.
 */
export function forEachCell(r: RangeRef, visit: (v: Scalar, row: number, col: number) => boolean | void): void {
  const rEnd = Math.min(r.r2, r.table.rows - 1);
  const cEnd = Math.min(r.c2, r.table.cols - 1);
  for (let row = r.r1; row <= rEnd; row++) {
    for (let col = r.c1; col <= cEnd; col++) {
      const cell = r.table.get(row, col);
      if (cell === undefined) continue;
      if (visit(cell.value, row, col) === false) return;
    }
  }
}

function power(a: number, b: number): number | FormulaError {
  if (a === 0 && b === 0) return NUM;
  if (a === 0 && b < 0) return DIV0;
  if (a < 0 && !Number.isInteger(b)) return NUM;
  return num(Math.pow(a, b));
}

export { power as powerOp };

function arithmetic(op: string, a: Scalar, b: Scalar): Scalar {
  const x = toNumber(a);
  if (isError(x)) return x;
  const y = toNumber(b);
  if (isError(y)) return y;
  switch (op) {
    case '+':
      return num(x + y);
    case '-':
      return num(x - y);
    case '*':
      return num(x * y);
    case '/':
      return y === 0 ? DIV0 : num(x / y);
    default:
      return power(x, y);
  }
}

function comparison(op: string, a: Scalar, b: Scalar): Scalar {
  if (isError(a)) return a;
  if (isError(b)) return b;
  const c = compareScalars(a as Exclude<Scalar, FormulaError>, b as Exclude<Scalar, FormulaError>);
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

export class Evaluator {
  constructor(private readonly functions: ReadonlyMap<string, FunctionDef>) {}

  /** Evaluates a node; the result may be a reference. */
  eval(node: Node, ctx: EvalContext): Arg {
    switch (node.k) {
      case 'num':
        return node.v;
      case 'str':
        return node.v;
      case 'err':
        return FormulaError.of(node.v);
      case 'ref': {
        const table = node.table === null ? ctx.table : ctx.resolveTable(node.table);
        if (!table) return REF;
        if (node.r2 >= LIMITS.rows || node.c2 >= LIMITS.columns) return REF;
        return { k: 'range', table, r1: node.r1, c1: node.c1, r2: node.r2, c2: node.c2 };
      }
      case 'neg': {
        const n = toNumber(scalar(this.eval(node.x, ctx)));
        return isError(n) ? n : num(-n);
      }
      case 'pos':
        return scalar(this.eval(node.x, ctx));
      case 'pct': {
        const n = toNumber(scalar(this.eval(node.x, ctx)));
        return isError(n) ? n : num(n / 100);
      }
      case 'bin': {
        const a = scalar(this.eval(node.a, ctx));
        const b = scalar(this.eval(node.b, ctx));
        switch (node.op) {
          case '&': {
            const x = toText(a);
            if (isError(x)) return x;
            const y = toText(b);
            if (isError(y)) return y;
            return x + y;
          }
          case '=':
          case '<>':
          case '<':
          case '<=':
          case '>':
          case '>=':
            return comparison(node.op, a, b);
          default:
            return arithmetic(node.op, a, b);
        }
      }
      case 'call': {
        const def = this.functions.get(node.name);
        if (!def) return NAME;
        const n = node.args.length;
        if (n < def.min || n > def.max) return VALUE;
        if (!def.allowEmpty && node.args.some((a) => a === null)) return VALUE;
        if (def.lazy) {
          return def.lazy(
            node.args.map((a) => (a === null ? null : () => this.eval(a, ctx))),
            ctx,
          );
        }
        const args: ArgIn[] = node.args.map((a) => (a === null ? MISSING : this.eval(a, ctx)));
        return def.fn!(args, ctx);
      }
    }
  }

  /** Evaluates to the value a cell stores: references resolved, empty becomes 0. */
  evalCell(node: Node, ctx: EvalContext): Scalar {
    const v = scalar(this.eval(node, ctx));
    if (v === EMPTY) return 0;
    if (typeof v === 'number') return num(v);
    return v;
  }
}

