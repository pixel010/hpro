/**
 * Table structure for the editor: the cell grid (rows over thead/tbody/tfoot, spans keep the
 * top-left position as in HPF-ADR-002) and row/column insertion and deletion that keep the
 * column count of every row equal (HP-MIN-006) and adjust `colspan`/`rowspan`.
 */
import type { Document, Element } from '@xmldom/xmldom';
import { childElements, XHTML_NS } from '../lock/xml.js';
import { EditError, indentLike } from './dom.js';

export interface GridCell {
  readonly el: Element;
  readonly row: number;
  readonly col: number;
  readonly rowspan: number;
  readonly colspan: number;
}

export interface Grid {
  readonly rows: Element[];
  /** grid[r][c]: the cell covering row r, column c (0-based), or undefined for a hole. */
  readonly grid: Array<Array<GridCell | undefined>>;
  readonly width: number;
}

const span = (el: Element, name: string) => Math.max(1, Number.parseInt(el.getAttribute(name) ?? '1', 10) || 1);

export function tableRows(table: Element): Element[] {
  const out: Element[] = [];
  for (const c of childElements(table)) {
    if (c.localName === 'tr') out.push(c);
    else if (['thead', 'tbody', 'tfoot'].includes(c.localName ?? '')) out.push(...childElements(c).filter((x) => x.localName === 'tr'));
  }
  return out;
}

export function buildGrid(table: Element): Grid {
  const rows = tableRows(table);
  const grid: Array<Array<GridCell | undefined>> = rows.map(() => []);
  rows.forEach((tr, r) => {
    let col = 0;
    for (const el of childElements(tr).filter((c) => c.localName === 'td' || c.localName === 'th')) {
      while (grid[r]![col] !== undefined) col++;
      const cell: GridCell = { el, row: r, col, rowspan: span(el, 'rowspan'), colspan: span(el, 'colspan') };
      for (let dr = 0; dr < cell.rowspan && r + dr < rows.length; dr++) for (let dc = 0; dc < cell.colspan; dc++) grid[r + dr]![col + dc] = cell;
      col += cell.colspan;
    }
  });
  const width = Math.max(0, ...grid.map((g) => g.length));
  return { rows, grid, width };
}

export function cellAt(table: Element, row: number, col: number): Element | undefined {
  const g = buildGrid(table);
  const c = g.grid[row - 1]?.[col - 1];
  return c && c.row === row - 1 && c.col === col - 1 ? c.el : undefined;
}

/** Problems of the grid: rows of different width, holes. */
export function gridProblems(table: Element): string[] {
  const g = buildGrid(table);
  const out: string[] = [];
  g.grid.forEach((r, i) => {
    if (r.length !== g.width) out.push(`Zeile ${i + 1} hat ${r.length} statt ${g.width} Spalten`);
    else if (r.some((c) => c === undefined)) out.push(`Zeile ${i + 1} hat Lücken`);
  });
  return out;
}

function setSpan(el: Element, name: string, n: number): void {
  if (n <= 1) el.removeAttribute(name);
  else el.setAttribute(name, String(n));
}

function newCell(doc: Document, section: string, text: string): Element {
  const th = section === 'thead';
  const el = doc.createElementNS(XHTML_NS, th ? 'th' : 'td');
  if (th) el.setAttribute('scope', 'col');
  if (text !== '') el.appendChild(doc.createTextNode(text));
  return el;
}

function sectionOf(tr: Element): string {
  const p = tr.parentNode as Element | null;
  return p?.localName ?? 'table';
}

/** Inserts a row before grid row `at` (1-based; `rows + 1` = after the last row). */
export function insertRow(doc: Document, table: Element, at: number, texts: readonly string[] = []): Element {
  const g = buildGrid(table);
  if (at < 1 || at > g.rows.length + 1) throw new EditError('invalid', `Zeile ${at} liegt außerhalb der Tabelle (1…${g.rows.length + 1})`);
  const r = at - 1;
  const ref = g.rows[r];
  // New row goes into the section of the row it precedes, or after the last body row.
  const last = g.rows[g.rows.length - 1];
  const parent = (ref ? ref.parentNode : last ? last.parentNode : table) as Element;
  const section = ref ? sectionOf(ref) : last ? sectionOf(last) : 'tbody';
  const tr = doc.createElementNS(XHTML_NS, 'tr');
  const done = new Set<GridCell>();
  let textIndex = 0;
  for (let c = 0; c < g.width; c++) {
    const above = r > 0 ? g.grid[r - 1]![c] : undefined;
    const here = g.grid[r]?.[c];
    // A cell spanning from above across the new row grows by one.
    if (here && above && here === above) {
      if (!done.has(here)) {
        setSpan(here.el, 'rowspan', here.rowspan + 1);
        done.add(here);
      }
      continue;
    }
    tr.appendChild(newCell(doc, section, texts[textIndex++] ?? ''));
  }
  if (texts.length > textIndex) throw new EditError('invalid', `${texts.length} Zellwerte für ${textIndex} freie Zellen der neuen Zeile`);
  if (ref && ref.parentNode === parent) parent.insertBefore(tr, ref);
  else parent.appendChild(tr);
  indentLike(tr);
  return tr;
}

/** Deletes grid row `at` (1-based). Cells starting there with rowspan move down; spans across it shrink. */
export function deleteRow(doc: Document, table: Element, at: number): void {
  const g = buildGrid(table);
  if (at < 1 || at > g.rows.length) throw new EditError('invalid', `Zeile ${at} gibt es nicht (1…${g.rows.length})`);
  const r = at - 1;
  const tr = g.rows[r]!;
  const seen = new Set<GridCell>();
  for (let c = 0; c < g.width; c++) {
    const cell = g.grid[r]![c];
    if (!cell || seen.has(cell)) continue;
    seen.add(cell);
    if (cell.row < r) setSpan(cell.el, 'rowspan', cell.rowspan - 1);
    else if (cell.rowspan > 1) {
      // Moves to the next row, at its column position.
      const next = g.rows[r + 1]!;
      setSpan(cell.el, 'rowspan', cell.rowspan - 1);
      const after = childElements(next).find((x) => {
        const gc = g.grid[r + 1]!.find((k) => k?.el === x);
        return gc !== undefined && gc.col > cell.col;
      });
      tr.removeChild(cell.el);
      if (after) next.insertBefore(cell.el, after);
      else next.appendChild(cell.el);
    }
  }
  tr.parentNode!.removeChild(tr);
  void doc;
}

/** Inserts a column before grid column `at` (1-based; `width + 1` = at the end). */
export function insertColumn(doc: Document, table: Element, at: number, texts: readonly string[] = []): void {
  const g = buildGrid(table);
  if (at < 1 || at > g.width + 1) throw new EditError('invalid', `Spalte ${at} liegt außerhalb der Tabelle (1…${g.width + 1})`);
  const c = at - 1;
  const grown = new Set<GridCell>();
  if (texts.length > g.rows.length) throw new EditError('invalid', `${texts.length} Zellwerte für ${g.rows.length} Zeilen`);
  g.rows.forEach((tr, r) => {
    const left = c > 0 ? g.grid[r]![c - 1] : undefined;
    const here = g.grid[r]![c];
    if (here && left && here === left) {
      if (!grown.has(here)) {
        setSpan(here.el, 'colspan', here.colspan + 1);
        grown.add(here);
      }
      return;
    }
    const cell = newCell(doc, sectionOf(tr), texts[r] ?? '');
    const before = childElements(tr).find((x) => {
      const gc = g.grid[r]!.find((k) => k?.el === x && k.row === r);
      return gc !== undefined && gc.col >= c;
    });
    if (before) tr.insertBefore(cell, before);
    else tr.appendChild(cell);
  });
}

/** Deletes grid column `at` (1-based). Spanning cells shrink, single cells go. */
export function deleteColumn(doc: Document, table: Element, at: number): void {
  const g = buildGrid(table);
  if (at < 1 || at > g.width) throw new EditError('invalid', `Spalte ${at} gibt es nicht (1…${g.width})`);
  if (g.width === 1) throw new EditError('invalid', 'die letzte Spalte einer Tabelle wird nicht gelöscht; die Tabelle als Ganzes löschen');
  const c = at - 1;
  const seen = new Set<GridCell>();
  for (let r = 0; r < g.rows.length; r++) {
    const cell = g.grid[r]![c];
    if (!cell || seen.has(cell)) continue;
    seen.add(cell);
    if (cell.colspan > 1) setSpan(cell.el, 'colspan', cell.colspan - 1);
    else cell.el.parentNode!.removeChild(cell.el);
  }
  void doc;
}
