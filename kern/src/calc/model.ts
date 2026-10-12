/**
 * Table model of the calculator: tables with a cell grid (HPF-ADR-002), cells with stored
 * value, formula and check rule. Independent of the DOM; `dom.ts` builds it from XHTML and
 * writes results back.
 */
import { LIMITS, cellAddress, type Node, type FormulaSyntaxError } from './parser.js';
import { EMPTY, type Scalar } from './values.js';

/** Value types of `data-hp-type` (HPF-STO-003). */
export const VALUE_TYPES = ['float', 'percentage', 'currency', 'date', 'time', 'boolean', 'string', 'error'] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

export function isValueType(s: string | null): s is ValueType {
  return s !== null && (VALUE_TYPES as readonly string[]).includes(s);
}

export interface CheckRule {
  readonly formula: string;
  readonly ast: Node | null;
  readonly syntaxError: FormulaSyntaxError | null;
  readonly message: string | null;
  /** Result of the last calculation: true = satisfied; false or an error name = violated. */
  result: boolean | string | null;
}

export interface CellModel {
  readonly table: TableModel;
  readonly row: number;
  readonly col: number;
  /** DOM element of the cell (opaque to the calculator), null for covered positions. */
  readonly element: unknown;
  readonly formula: string | null;
  readonly ast: Node | null;
  readonly syntaxError: FormulaSyntaxError | null;
  /** Value as stored in the document (`data-hp-value` or text content). */
  readonly stored: Scalar;
  /** True when a formula cell has no `data-hp-value` ("nicht berechnet", HPF-STO-008). */
  readonly notComputed: boolean;
  /** Declared `data-hp-type`, if any. */
  readonly declaredType: ValueType | null;
  readonly unit: string | null;
  readonly input: boolean;
  readonly check: CheckRule | null;
  /** Current value: stored value for value cells, computed value for formula cells. */
  value: Scalar;
  /** Display text of the cell as found in the document. */
  readonly storedText: string;
}

export class TableModel {
  /** `id` of the table, or `#<n>` (position in the document, 1-based) when it has none. */
  readonly key: string;
  readonly cells = new Map<number, CellModel>();
  rows = 0;
  cols = 0;
  /** `data-hp-stale="true"` was found (HPF-STO-007). */
  stale = false;
  constructor(
    readonly id: string | null,
    readonly index: number,
    readonly element: unknown,
  ) {
    this.key = id ?? `#${index + 1}`;
  }

  static slot(row: number, col: number): number {
    return row * LIMITS.columns + col;
  }

  get(row: number, col: number): CellModel | undefined {
    return this.cells.get(TableModel.slot(row, col));
  }

  /** Value at a grid position; positions without a cell are empty (HPF-ADR-002/003). */
  valueAt(row: number, col: number): Scalar {
    return this.cells.get(TableModel.slot(row, col))?.value ?? EMPTY;
  }

  address(row: number, col: number): string {
    return `${this.key}.${cellAddress(row, col)}`;
  }
}

export function cellKey(cell: CellModel): string {
  return cell.table.address(cell.row, cell.col);
}
