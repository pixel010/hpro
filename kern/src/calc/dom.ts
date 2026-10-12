/**
 * Binding between content documents and the calculator. Works on any W3C DOM: the browser's
 * (reader) and @xmldom/xmldom (Node, command line, tests); only childNodes, attributes,
 * textContent and createElementNS are used.
 *
 * - Cell grid after the HTML table model: rows in document order across thead, tbody and
 *   tfoot, `colspan`/`rowspan` covering positions that count as empty (HPF-ADR-002).
 * - Stored values per value type (HPF-STO-002/003), formula and value written back together
 *   (HPF-STO-001, HPF-ERR-001), value references in the text updated (HPF-STO-010),
 *   `data-hp-stale` removed after a complete calculation (HPF-STO-007).
 * - Values are set as text, never as markup (HPF-SEC-003).
 */
import { parseDuration, parseIsoDateTime } from './dates.js';
import { CALCULATOR, Workbook, compile, type RecalcResult } from './engine.js';
import { decimalsShown, displayValue, numberStyle, parseUserEntry, storedForm, type Display, type NumberStyle } from './format.js';
import { TableModel, cellKey, isValueType, type CellModel, type CheckRule, type ValueType } from './model.js';
import type { RoundingBasis } from './numbers.js';
import { LIMITS, parseAddress } from './parser.js';
import { EMPTY, FormulaError, STANDARD_NUMBER, VALUE, isError, isErrorName, type Scalar } from './values.js';

export const XHTML_NS = 'http://www.w3.org/1999/xhtml';

/** Minimal structural view of a DOM node, satisfied by browser DOM and xmldom. */
interface DomNode {
  readonly nodeType: number;
  readonly childNodes: { readonly length: number; item(i: number): DomNode | null };
  readonly parentNode: DomNode | null;
  textContent: string | null;
}
export interface DomElement extends DomNode {
  readonly localName: string | null;
  readonly namespaceURI: string | null;
  readonly ownerDocument: DomDocument;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  hasAttribute(name: string): boolean;
  appendChild(node: DomNode): DomNode;
  removeChild(node: DomNode): DomNode;
}
export interface DomDocument extends DomNode {
  readonly documentElement: DomElement | null;
  createElementNS(ns: string, name: string): DomElement;
  createTextNode(text: string): DomNode;
}

const isElement = (n: DomNode | null): n is DomElement => n !== null && n.nodeType === 1;
const isHtml = (el: DomElement, ...names: string[]) => (el.namespaceURI === XHTML_NS || el.namespaceURI === null) && names.includes((el.localName ?? '').toLowerCase());

function children(el: DomNode): DomElement[] {
  const out: DomElement[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes.item(i);
    if (isElement(n)) out.push(n);
  }
  return out;
}

/** All elements below `root` in document order (iterative). */
export function descendants(root: DomNode): DomElement[] {
  const out: DomElement[] = [];
  const stack: DomElement[] = children(root).reverse();
  while (stack.length > 0) {
    const el = stack.pop()!;
    out.push(el);
    const kids = children(el);
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]!);
  }
  return out;
}

/** Text with collapsed white space (HPF-STO-003). */
export function collapsedText(el: DomNode): string {
  return (el.textContent ?? '').replace(/[ \t\n\r\f]+/g, ' ').trim();
}

/** Rows of a table in document order across thead, tbody and tfoot (not those of nested tables). */
export function tableRows(table: DomElement): DomElement[] {
  const rows: DomElement[] = [];
  for (const c of children(table)) {
    if (isHtml(c, 'tr')) rows.push(c);
    else if (isHtml(c, 'thead', 'tbody', 'tfoot')) for (const r of children(c)) if (isHtml(r, 'tr')) rows.push(r);
  }
  return rows;
}

export interface GridCell {
  readonly element: DomElement;
  readonly row: number;
  readonly col: number;
}

/** Grid positions of the cells of a table (HPF-ADR-002); covered positions have no entry. */
export function tableGrid(table: DomElement): { cells: GridCell[]; rows: number; cols: number } {
  const rows = tableRows(table);
  const occupied = new Set<number>();
  const cells: GridCell[] = [];
  let cols = 0;
  rows.forEach((tr, r) => {
    let c = 0;
    for (const cell of children(tr)) {
      if (!isHtml(cell, 'td', 'th')) continue;
      while (occupied.has(TableModel.slot(r, c))) c++;
      const span = (name: string) => {
        const v = Number.parseInt(cell.getAttribute(name) ?? '1', 10);
        return Number.isFinite(v) && v >= 1 ? Math.min(v, LIMITS.columns) : 1;
      };
      const cs = span('colspan');
      const rs = Math.min(span('rowspan'), rows.length - r);
      cells.push({ element: cell, row: r, col: c });
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) occupied.add(TableModel.slot(r + i, c + j));
      c += cs;
      cols = Math.max(cols, c);
    }
  });
  return { cells, rows: rows.length, cols };
}

/** Every `table` element of a document, in document order. */
export function documentTables(doc: DomDocument): DomElement[] {
  return descendants(doc).filter((el) => isHtml(el, 'table'));
}

/** Value of a stored cell per value type (HPF-STO-002); malformed forms are #VALUE!. */
export function storedValue(type: string | null, value: string): Scalar {
  switch (type) {
    case 'float':
    case 'percentage':
    case 'currency':
      return STANDARD_NUMBER.test(value.replace(/^-/, '')) ? Number(value) : VALUE;
    case 'date': {
      const p = parseIsoDateTime(value);
      return p && p.date !== null ? p.date + p.time : VALUE;
    }
    case 'time': {
      const t = parseDuration(value);
      return t === null ? VALUE : t;
    }
    case 'boolean':
      return value === 'true' ? true : value === 'false' ? false : VALUE;
    case 'string':
      return value;
    case 'error':
      return isErrorName(value) ? FormulaError.of(value) : VALUE;
    default:
      return STANDARD_NUMBER.test(value.replace(/^-/, '')) ? Number(value) : value;
  }
}

function readCell(table: TableModel, g: GridCell, style: NumberStyle): CellModel {
  const el = g.element;
  const formula = el.getAttribute('data-hp-formula');
  const valueAttr = el.getAttribute('data-hp-value');
  const typeAttr = el.getAttribute('data-hp-type');
  const declaredType: ValueType | null = isValueType(typeAttr) ? typeAttr : null;
  const storedText = collapsedText(el);
  let stored: Scalar;
  if (valueAttr !== null) stored = storedValue(typeAttr, valueAttr);
  else if (formula !== null) stored = EMPTY;
  else stored = storedText === '' ? EMPTY : storedText;
  const compiled = formula !== null ? compile(formula) : null;
  const checkText = el.getAttribute('data-hp-check');
  let check: CheckRule | null = null;
  if (checkText !== null) {
    const c = compile(checkText);
    check = { formula: checkText, ast: c.ast, syntaxError: c.error, message: el.getAttribute('data-hp-check-message'), result: null };
  }
  const cell: CellModel = {
    table,
    row: g.row,
    col: g.col,
    element: el,
    formula,
    ast: compiled?.ast ?? null,
    syntaxError: compiled?.error ?? null,
    stored,
    notComputed: formula !== null && valueAttr === null,
    declaredType,
    unit: el.getAttribute('data-hp-unit'),
    input: el.getAttribute('data-hp-input') === 'true',
    check,
    value: stored,
    storedText,
  };
  displayHints.set(cell, decimalsShown(storedText, style));
  return cell;
}

const displayHints = new WeakMap<CellModel, number | null>();

/** Builds the table models of a document. */
export function readTables(doc: DomDocument, style: NumberStyle): TableModel[] {
  return documentTables(doc).map((el, index) => {
    const id = el.getAttribute('id');
    const t = new TableModel(id && id.trim() !== '' ? id : null, index, el);
    const grid = tableGrid(el);
    t.rows = grid.rows;
    t.cols = grid.cols;
    t.stale = el.getAttribute('data-hp-stale') === 'true';
    for (const g of grid.cells) t.cells.set(TableModel.slot(g.row, g.col), readCell(t, g, style));
    return t;
  });
}

/** Language of a document: `xml:lang` or `lang` of the root element. */
export function documentLanguage(doc: DomDocument): string | null {
  const root = doc.documentElement;
  if (!root) return null;
  return root.getAttribute('xml:lang') ?? root.getAttribute('lang');
}

/** Writes a display into a cell: text, or a `time` element for dates and times (HPF-DAT-008). */
function writeContent(el: DomElement, d: Display): void {
  // Keep a single wrapping element such as <strong> or <span>; replace everything below it.
  let target = el;
  for (;;) {
    const kids = children(target);
    let hasText = false;
    for (let i = 0; i < target.childNodes.length; i++) {
      const n = target.childNodes.item(i)!;
      if (n.nodeType === 3 && (n.textContent ?? '').trim() !== '') hasText = true;
    }
    if (kids.length === 1 && !hasText && !isHtml(kids[0]!, 'time', 'input', 'br')) target = kids[0]!;
    else break;
  }
  while (target.childNodes.length > 0) target.removeChild(target.childNodes.item(0)!);
  const doc = el.ownerDocument;
  if (d.datetime !== undefined) {
    const time = doc.createElementNS(el.namespaceURI ?? XHTML_NS, 'time');
    time.setAttribute('datetime', d.datetime);
    time.appendChild(doc.createTextNode(d.text));
    target.appendChild(time);
  } else {
    target.appendChild(doc.createTextNode(d.text));
  }
}

export interface CellUpdate {
  /** `<table>.<A1>` */
  readonly address: string;
  readonly type: ValueType;
  readonly value: string;
  readonly text: string;
  readonly datetime?: string;
}

export interface CheckState {
  readonly address: string;
  readonly ok: boolean;
  readonly message: string;
}

export interface Deviation {
  readonly address: string;
  readonly formula: string;
  /** Stored `data-hp-value` (or `(fehlt)`). */
  readonly stored: string;
  readonly computed: string;
}

export interface InputResult {
  readonly ok: boolean;
  readonly message?: string;
}

/**
 * A content document with its tables, bound to the calculator. `recalc` calculates; `write`
 * puts values, types and displays into the DOM.
 */
export class CalcDocument {
  readonly style: NumberStyle;
  readonly tables: TableModel[];
  readonly workbook: Workbook;
  private last: RecalcResult | null = null;

  constructor(
    readonly doc: DomDocument,
    options: { readonly language?: string | null; readonly rounding?: RoundingBasis } = {},
  ) {
    this.style = numberStyle(options.language ?? documentLanguage(doc));
    this.tables = readTables(doc, this.style);
    this.workbook = new Workbook(this.tables, options.rounding ? { rounding: options.rounding } : {});
  }

  get formulaCount(): number {
    return this.workbook.formulaCells.length;
  }

  get hasCalculation(): boolean {
    return this.workbook.formulaCells.length > 0 || this.workbook.checkCells.length > 0;
  }

  recalc(): RecalcResult {
    this.last = this.workbook.recalc();
    return this.last;
  }

  /** Stored values that differ from the calculated ones (HPF-STO-009, HPF-FRZ-003). */
  deviations(): Deviation[] {
    const out: Deviation[] = [];
    for (const cell of this.workbook.formulaCells) {
      const computed = storedForm(cell.value, cell.declaredType);
      const el = cell.element as DomElement;
      const storedAttr = el.getAttribute('data-hp-value');
      const sameType = el.getAttribute('data-hp-type') === computed.type || computed.type === 'error';
      if (storedAttr === null || storedAttr !== computed.value || !sameType) {
        out.push({ address: cellKey(cell), formula: cell.formula!, stored: storedAttr ?? '(fehlt)', computed: computed.value });
      }
    }
    return out;
  }

  display(cell: CellModel, type?: ValueType): Display {
    const t = type ?? storedForm(cell.value, cell.declaredType).type;
    const decimals = cell.input && cell.formula === null ? null : (displayHints.get(cell) ?? null);
    return displayValue(cell.value, t, { style: this.style, decimals, unit: cell.unit });
  }

  /** Writes value, type and display of one cell into the DOM; returns the update. */
  writeCell(cell: CellModel, force = true): CellUpdate {
    const el = cell.element as DomElement;
    const address = cellKey(cell);
    if (cell.value === EMPTY && cell.formula === null) {
      el.removeAttribute('data-hp-value');
      writeContent(el, { text: '' });
      return { address, type: cell.declaredType ?? 'string', value: '', text: '' };
    }
    const stored = storedForm(cell.value, cell.declaredType);
    const d = this.display(cell, stored.type);
    // Unchanged value and type with a display present: leave the author's text alone, so that a
    // comparison of two versions shows only real changes (HPF-FRZ-006).
    if (!force && el.getAttribute('data-hp-value') === stored.value && el.getAttribute('data-hp-type') === stored.type && collapsedText(el) !== '') {
      return { address, type: stored.type, value: stored.value, text: collapsedText(el), ...(d.datetime !== undefined ? { datetime: d.datetime } : {}) };
    }
    el.setAttribute('data-hp-value', stored.value);
    el.setAttribute('data-hp-type', stored.type);
    writeContent(el, d);
    return { address, type: stored.type, value: stored.value, text: d.text, ...(d.datetime !== undefined ? { datetime: d.datetime } : {}) };
  }

  /**
   * Writes every formula cell (or only `cells`) and the value references; removes
   * `data-hp-stale` (HPF-STO-007). Returns the updates of the written cells.
   */
  write(cells?: readonly CellModel[]): CellUpdate[] {
    const list = cells ?? this.workbook.formulaCells;
    const updates = list.map((c) => this.writeCell(c, false));
    if (!cells) for (const t of this.tables) (t.element as DomElement).removeAttribute('data-hp-stale');
    this.writeValueRefs();
    return updates;
  }

  /** State of all check rules after the last calculation (HPF-STO-012). */
  checks(): CheckState[] {
    return this.workbook.checkCells.map((c) => {
      const r = c.check!.result;
      return { address: cellKey(c), ok: r === true, message: c.check!.message ?? (typeof r === 'string' ? `Prüfung ergibt ${r}` : 'Prüfung nicht erfüllt') };
    });
  }

  /** Value references `a[data-hp-ref="value"]` (HPF-STO-010): new text per link. */
  valueRefs(): Array<{ element: DomElement; address: string; text: string }> {
    const out: Array<{ element: DomElement; address: string; text: string }> = [];
    for (const a of descendants(this.doc)) {
      if (!isHtml(a, 'a') || a.getAttribute('data-hp-ref') !== 'value') continue;
      const href = a.getAttribute('href') ?? '';
      const fragment = href.slice(href.indexOf('#') + 1);
      const cell = this.workbook.cell(fragment);
      if (!cell) continue;
      out.push({ element: a, address: cellKey(cell), text: collapsedText(cell.element as DomElement) });
    }
    return out;
  }

  writeValueRefs(): void {
    for (const r of this.valueRefs()) {
      while (r.element.childNodes.length > 0) r.element.removeChild(r.element.childNodes.item(0)!);
      r.element.appendChild(this.doc.createTextNode(r.text));
    }
  }

  /** Cell by address `<table>.<A1>`. */
  cell(address: string): CellModel | undefined {
    return this.workbook.cell(address);
  }

  /**
   * Fills an input cell (HPF-STO-011): checks the entry against the value type, stores value
   * and display, recalculates and writes the dependent cells. Only cells with
   * `data-hp-input="true"` accept entries.
   */
  setInput(address: string, raw: string): InputResult & { updates?: CellUpdate[] } {
    const cell = this.cell(address);
    if (!cell) return { ok: false, message: `Zelle ${address} gibt es nicht.` };
    if (!cell.input || cell.formula !== null) return { ok: false, message: `Zelle ${address} ist keine Eingabezelle.` };
    const value = parseUserEntry(raw, cell.declaredType, this.style);
    if (value === null) return { ok: false, message: entryHint(cell.declaredType) };
    this.workbook.setValue(cell, value);
    const result = this.recalc();
    const changed = new Set(result.changed.map((c) => cellKey(c)));
    // write everything (keeps the DOM consistent), report only what changed
    const updates = [this.writeCell(cell), ...this.write().filter((u) => changed.has(u.address))];
    return { ok: true, updates };
  }
}

function entryHint(type: ValueType | null): string {
  switch (type) {
    case 'date':
      return 'Bitte ein Datum eingeben (JJJJ-MM-TT oder TT.MM.JJJJ).';
    case 'time':
      return 'Bitte eine Uhrzeit eingeben (HH:MM).';
    case 'boolean':
      return 'Bitte ja oder nein eingeben.';
    default:
      return 'Bitte eine Zahl eingeben.';
  }
}

/** Parses an address `<table>.<A1>` into table key and position. */
export function splitAddress(address: string): { table: string; row: number; col: number } | null {
  const dot = address.lastIndexOf('.');
  if (dot <= 0) return null;
  const pos = parseAddress(address.slice(dot + 1));
  return pos ? { table: address.slice(0, dot), ...pos } : null;
}

export { CALCULATOR, isError };
