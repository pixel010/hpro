/**
 * Recalculation (part 3, section 11): dependency graph of all formula cells of a content
 * document, complete calculation in topological order (HPF-CALC-002), circular references
 * marked `#CIRC!` together with every cell that depends on them, no iteration
 * (HPF-CALC-004). Graph algorithms are iterative, so chains of any length up to the limits of
 * HPF-CALC-005 need no deep call stack.
 */
import { Evaluator, type EvalContext } from './evaluate.js';
import type { RoundingBasis } from './numbers.js';
import { FUNCTIONS } from './functions.js';
import { TableModel, type CellModel, type CheckRule } from './model.js';
import { FormulaSyntaxError, collectRefs, parseFormula, type Node } from './parser.js';
import { CIRC, NAME, EMPTY, isError, toLogical, type FormulaError, type Scalar } from './values.js';

/** Name, version and specification of this calculator (HPF-STO-006, HPF-FN-004). */
export const CALCULATOR = { name: 'hpro-calc', version: '0.1.0', spec: '0.1' } as const;

export interface RecalcResult {
  /** Formula cells whose value changed in this calculation. */
  readonly changed: readonly CellModel[];
  /** Number of formula cells calculated. */
  readonly formulas: number;
  /** Number of check rules evaluated. */
  readonly checks: number;
  /** Cells on or behind a circular reference. */
  readonly circular: readonly CellModel[];
}

const sameValue = (a: Scalar, b: Scalar) => a === b || (Number.isNaN(a) && Number.isNaN(b));

/** Parses a formula; syntax errors are kept for evaluation as `#NAME?` (HPF-ERR-003). */
export function compile(formula: string): { ast: Node | null; error: FormulaSyntaxError | null } {
  try {
    return { ast: parseFormula(formula), error: null };
  } catch (err) {
    if (err instanceof FormulaSyntaxError) return { ast: null, error: err };
    throw err;
  }
}

export class Workbook {
  readonly byId = new Map<string, TableModel>();
  /** Formula cells in document order. */
  readonly formulaCells: CellModel[] = [];
  readonly checkCells: CellModel[] = [];
  private order: CellModel[] = [];
  private circular = new Set<CellModel>();
  private deps = new Map<CellModel, CellModel[]>();
  private readonly evaluator = new Evaluator(FUNCTIONS);

  constructor(
    readonly tables: readonly TableModel[],
    readonly options: { readonly rounding?: RoundingBasis } = {},
  ) {
    for (const t of tables) if (t.id !== null && !this.byId.has(t.id)) this.byId.set(t.id, t);
    for (const t of tables) {
      const cells = [...t.cells.values()].sort((a, b) => a.row - b.row || a.col - b.col);
      for (const c of cells) {
        if (c.formula !== null) this.formulaCells.push(c);
        if (c.check !== null) this.checkCells.push(c);
      }
    }
    this.analyze();
  }

  table(key: string): TableModel | undefined {
    return this.byId.get(key) ?? this.tables.find((t) => t.key === key);
  }

  /** Cell by address `<table>.<A1>`. */
  cell(address: string): CellModel | undefined {
    const dot = address.lastIndexOf('.');
    if (dot < 0) return undefined;
    const t = this.table(address.slice(0, dot));
    const m = /^([A-Z]+)([1-9][0-9]*)$/.exec(address.slice(dot + 1));
    if (!t || !m) return undefined;
    let col = 0;
    for (const ch of m[1]!) col = col * 26 + (ch.charCodeAt(0) - 64);
    return t.get(Number(m[2]) - 1, col - 1);
  }

  /** Formula cells a formula depends on, including those in branches not taken (HPF-CALC-003). */
  private dependencies(cell: CellModel, ast: Node): CellModel[] {
    const out = new Set<CellModel>();
    for (const ref of collectRefs(ast)) {
      const table = ref.table === null ? cell.table : this.byId.get(ref.table);
      if (!table) continue;
      const rEnd = Math.min(ref.r2, table.rows - 1);
      const cEnd = Math.min(ref.c2, table.cols - 1);
      const area = (rEnd - ref.r1 + 1) * (cEnd - ref.c1 + 1);
      if (area <= 0) continue;
      const formulas = this.formulasOf(table);
      if (area > formulas.length) {
        for (const f of formulas) if (f.row >= ref.r1 && f.row <= rEnd && f.col >= ref.c1 && f.col <= cEnd) out.add(f);
      } else {
        for (let r = ref.r1; r <= rEnd; r++) {
          for (let c = ref.c1; c <= cEnd; c++) {
            const f = table.get(r, c);
            if (f?.formula != null) out.add(f);
          }
        }
      }
    }
    return [...out];
  }

  private formulaIndex = new Map<TableModel, CellModel[]>();
  private formulasOf(t: TableModel): CellModel[] {
    let list = this.formulaIndex.get(t);
    if (!list) {
      list = this.formulaCells.filter((c) => c.table === t);
      this.formulaIndex.set(t, list);
    }
    return list;
  }

  /** Builds the graph, the evaluation order (Tarjan, iterative) and the set of circular cells. */
  private analyze(): void {
    for (const c of this.formulaCells) this.deps.set(c, c.ast ? this.dependencies(c, c.ast) : []);
    const index = new Map<CellModel, number>();
    const low = new Map<CellModel, number>();
    const onStack = new Set<CellModel>();
    const stack: CellModel[] = [];
    const order: CellModel[] = [];
    const cyclic = new Set<CellModel>();
    let counter = 0;
    for (const root of this.formulaCells) {
      if (index.has(root)) continue;
      const frames: Array<{ v: CellModel; i: number }> = [{ v: root, i: 0 }];
      index.set(root, counter);
      low.set(root, counter++);
      stack.push(root);
      onStack.add(root);
      while (frames.length > 0) {
        const frame = frames[frames.length - 1]!;
        const edges = this.deps.get(frame.v)!;
        if (frame.i < edges.length) {
          const w = edges[frame.i++]!;
          if (!index.has(w)) {
            index.set(w, counter);
            low.set(w, counter++);
            stack.push(w);
            onStack.add(w);
            frames.push({ v: w, i: 0 });
          } else if (onStack.has(w)) {
            low.set(frame.v, Math.min(low.get(frame.v)!, index.get(w)!));
          }
          continue;
        }
        frames.pop();
        const parent = frames[frames.length - 1];
        if (parent) low.set(parent.v, Math.min(low.get(parent.v)!, low.get(frame.v)!));
        if (low.get(frame.v) === index.get(frame.v)) {
          const component: CellModel[] = [];
          for (;;) {
            const w = stack.pop()!;
            onStack.delete(w);
            component.push(w);
            if (w === frame.v) break;
          }
          if (component.length > 1 || edges.includes(frame.v)) for (const w of component) cyclic.add(w);
          // Components come out with their dependencies first: that is the evaluation order.
          order.push(...component.reverse());
        }
      }
    }
    // Everything that depends on a circular cell is #CIRC! as well.
    const dependents = new Map<CellModel, CellModel[]>();
    for (const [c, ds] of this.deps) for (const d of ds) (dependents.get(d) ?? dependents.set(d, []).get(d)!).push(c);
    const queue = [...cyclic];
    while (queue.length > 0) {
      const c = queue.pop()!;
      for (const d of dependents.get(c) ?? []) {
        if (!cyclic.has(d)) {
          cyclic.add(d);
          queue.push(d);
        }
      }
    }
    this.order = order;
    this.circular = cyclic;
  }

  private context(cell: CellModel): EvalContext {
    return { table: cell.table, row: cell.row, col: cell.col, resolveTable: (id) => this.byId.get(id), ...(this.options.rounding ? { rounding: this.options.rounding } : {}) };
  }

  /** Evaluates a formula in the context of a cell, without storing anything. */
  evaluateIn(cell: CellModel, ast: Node): Scalar {
    return this.evaluator.evalCell(ast, this.context(cell));
  }

  /** Complete calculation of every formula cell and check rule (HPF-CALC-002). */
  recalc(): RecalcResult {
    const changed: CellModel[] = [];
    for (const cell of this.order) {
      let v: Scalar;
      if (this.circular.has(cell)) v = CIRC;
      else if (!cell.ast) v = NAME;
      else v = this.evaluator.evalCell(cell.ast, this.context(cell));
      if (!sameValue(v, cell.value)) changed.push(cell);
      cell.value = v;
    }
    for (const cell of this.checkCells) evaluateCheck(this, cell, cell.check!);
    return { changed, formulas: this.order.length, checks: this.checkCells.length, circular: [...this.circular] };
  }

  /** Sets the value of a (value) cell; call `recalc` afterwards. */
  setValue(cell: CellModel, value: Scalar): void {
    cell.value = value;
  }

  isCircular(cell: CellModel): boolean {
    return this.circular.has(cell);
  }
}

function evaluateCheck(wb: Workbook, cell: CellModel, rule: CheckRule): void {
  if (!rule.ast) {
    rule.result = NAME.name;
    return;
  }
  const v = toLogical(wb.evaluateIn(cell, rule.ast));
  rule.result = isError(v) ? (v as FormulaError).name : v;
}

/** Value of a formula evaluated on its own (no cells), e.g. for `hpro calc eval` and tests. */
export function evaluateStandalone(formula: string, tables: readonly TableModel[] = []): Scalar {
  const { ast } = compile(formula);
  if (!ast) return NAME;
  const host = tables[0] ?? new TableModel('formel', 0, null);
  const wb = new Workbook(tables);
  wb.recalc();
  return new Evaluator(FUNCTIONS).evalCell(ast, { table: host, row: 0, col: 0, resolveTable: (id) => wb.byId.get(id) });
}

export { EMPTY };
