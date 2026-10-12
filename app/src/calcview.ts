/**
 * Tables and formulas in the reader (package P19, part 3 of the specification).
 *
 * The calculator of the core runs in the reader shell, never in the document frame. For the
 * main version it calculates every formula when the document is opened and shows the
 * calculated values (HPF-STO-009: the file stays unchanged until the user saves). Entries in
 * input cells arrive from the frame by message; the shell recalculates and sends back the new
 * values, check results and value references (HPF-STO-011, HPF-CALC-007), so the document is
 * never reloaded. A frozen rendition is shown with its stored values and no calculator
 * (HPF-FRZ-003); it is only recalculated on a copy to report deviations.
 */
import { calc } from '@hpro/kern';
import type { ContentDocument, LoadedDocument } from './document.js';

export type CalcMode = 'live' | 'frozen';

export interface CellPatch {
  readonly address: string;
  readonly text: string;
  readonly type: string;
  readonly value: string;
  readonly datetime?: string;
}

export interface CalcUpdate {
  readonly cells: readonly CellPatch[];
  readonly checks: readonly calc.CheckState[];
  readonly refs: ReadonlyArray<{ readonly address: string; readonly text: string }>;
  /** Result of the entry that caused the update. */
  readonly entry?: { readonly address: string; readonly ok: boolean; readonly message?: string };
}

export interface DocumentState {
  readonly path: string;
  readonly formulas: number;
  readonly checks: number;
  readonly inputs: number;
  /** Stored values that differ from the calculation (live: corrected in the display; frozen: reported). */
  readonly deviations: readonly calc.Deviation[];
  readonly notComputed: readonly string[];
  readonly stale: readonly string[];
  readonly circular: readonly string[];
  readonly tables: ReadonlyArray<{ readonly key: string; readonly caption: string; readonly rows: number; readonly cols: number }>;
  /** Time of the calculation at opening, in ms. */
  readonly ms: number;
}

const ERROR_TEXT: Record<string, string> = {
  '#DIV/0!': 'Division durch null',
  '#N/A': 'Wert nicht verfügbar',
  '#NAME?': 'unbekannte Funktion oder fehlerhafte Formel',
  '#NUM!': 'Ergebnis außerhalb des Zahlbereichs',
  '#REF!': 'ungültiger Bezug',
  '#VALUE!': 'falsche Wertart',
  '#NULL!': 'leere Schnittmenge',
  '#CIRC!': 'Zirkelbezug',
};

/** Spoken description of an error value (HPF-ERR-004). */
export function errorDescription(name: string): string {
  return ERROR_TEXT[name] ?? 'Fehler';
}

function captionOf(table: Element): string {
  const cap = Array.from(table.children).find((c) => c.localName === 'caption');
  return (cap?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export class CalcSession {
  private readonly docs = new Map<string, calc.CalcDocument>();
  private readonly states = new Map<string, DocumentState>();
  /** Entries made by the user, for saving (address → entry as typed). */
  private readonly entries = new Map<string, { document: string; address: string; value: string }>();

  constructor(
    readonly doc: LoadedDocument,
    readonly mode: CalcMode,
  ) {
    for (const content of doc.content) this.prepare(content);
  }

  private prepare(content: ContentDocument): void {
    const t0 = performance.now();
    let cd = new calc.CalcDocument(content.dom as unknown as calc.DomDocument, { language: this.doc.language });
    if (cd.tables.length === 0) return;
    const before = new Map(cd.workbook.formulaCells.map((c) => [c, c.notComputed]));
    let deviations: calc.Deviation[];
    let result: calc.RecalcResult;
    if (this.mode === 'live') {
      result = cd.recalc();
      deviations = cd.deviations();
      cd.write();
    } else {
      // Frozen: never replace stored values; recalculate a copy only to report deviations.
      const copy = new calc.CalcDocument((content.dom.cloneNode(true) as Document) as unknown as calc.DomDocument, { language: this.doc.language });
      result = copy.recalc();
      deviations = copy.deviations();
      cd = new calc.CalcDocument(content.dom as unknown as calc.DomDocument, { language: this.doc.language });
    }
    const ms = performance.now() - t0;
    this.docs.set(content.path, cd);
    this.states.set(content.path, {
      path: content.path,
      formulas: cd.formulaCount,
      checks: cd.workbook.checkCells.length,
      inputs: cd.tables.reduce((n, t) => n + [...t.cells.values()].filter((c) => c.input).length, 0),
      deviations,
      notComputed: [...before].filter(([, nc]) => nc).map(([c]) => calc.cellKey(c)),
      stale: cd.tables.filter((t) => t.stale).map((t) => t.key),
      circular: result.circular.map((c) => calc.cellKey(c)),
      tables: cd.tables.map((t) => ({ key: t.key, caption: captionOf(t.element as Element), rows: t.rows, cols: t.cols })),
      ms,
    });
  }

  state(path: string): DocumentState | undefined {
    return this.states.get(path);
  }

  allStates(): DocumentState[] {
    return [...this.states.values()];
  }

  get formulaCount(): number {
    return [...this.states.values()].reduce((n, s) => n + s.formulas, 0);
  }

  get hasTables(): boolean {
    return this.states.size > 0;
  }

  get entryCount(): number {
    return this.entries.size;
  }

  /** Current check results and value references of a document, e.g. after rendering. */
  snapshot(path: string): CalcUpdate {
    const cd = this.docs.get(path);
    if (!cd) return { cells: [], checks: [], refs: [] };
    if (this.mode === 'live') cd.recalc();
    return { cells: [], checks: this.mode === 'live' ? cd.checks() : [], refs: cd.valueRefs().map((r) => ({ address: r.address, text: r.text })) };
  }

  /** An entry in an input cell (HPF-STO-011). Returns the changed cells to show. */
  input(path: string, address: string, raw: string): CalcUpdate & { ms: number } {
    const t0 = performance.now();
    const cd = this.docs.get(path);
    if (!cd || this.mode !== 'live') return { cells: [], checks: [], refs: [], entry: { address, ok: false, message: 'In dieser Fassung wird nicht gerechnet.' }, ms: 0 };
    const r = cd.setInput(address, raw);
    if (!r.ok) return { cells: [], checks: cd.checks(), refs: [], entry: { address, ok: false, ...(r.message ? { message: r.message } : {}) }, ms: performance.now() - t0 };
    this.entries.set(`${path}#${address}`, { document: path, address, value: raw });
    const cells = (r.updates ?? []).map((u) => ({ address: u.address, text: u.text, type: u.type, value: u.value, ...(u.datetime ? { datetime: u.datetime } : {}) }));
    return {
      cells,
      checks: cd.checks(),
      refs: cd.valueRefs().map((x) => ({ address: x.address, text: x.text })),
      entry: { address, ok: true },
      ms: performance.now() - t0,
    };
  }

  /** Data export of a table (CSV, JSON, OpenDocument). */
  async export(path: string, table: string, format: 'csv' | 'json' | 'ods'): Promise<Uint8Array> {
    const cd = this.docs.get(path);
    if (!cd) throw new Error('keine Tabelle');
    return calc.exportTables(cd, format, format === 'ods' ? undefined : table);
  }

  /**
   * The filled-in document as a new container: the same entries are applied by the core to the
   * file as it was opened, values are recalculated and `computedAt`, `calculator` and a history
   * entry naming the changed cells are written (HPF-STO-006, HPF-FRZ-006).
   */
  async save(now: Date): Promise<Uint8Array> {
    const computedAt = new Date(Math.floor(now.getTime() / 1000) * 1000).toISOString().replace('.000Z', 'Z');
    const r = await calc.recalculateContainer(this.doc.bytes, { computedAt, set: [...this.entries.values()] });
    return r.bytes;
  }
}

/** Visible label of an input cell: column heading and the first text cell of its row. */
function inputLabel(grid: Map<string, Element>, row: number, col: number, headRow: number | null): string {
  const head = headRow !== null ? grid.get(`${headRow}:${col}`) : undefined;
  const headText = head ? (head.textContent ?? '').replace(/\s+/g, ' ').trim() : '';
  let rowText = '';
  for (let c = 0; c < 64; c++) {
    if (c === col) continue;
    const el = grid.get(`${row}:${c}`);
    if (!el) continue;
    const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (t && !/^[-+]?[\d.,\s%€]*$/.test(t)) {
      rowText = t;
      break;
    }
  }
  return [headText, rowText].filter(Boolean).join(', ');
}

/**
 * Marks the table cells of the frame copy of a content document (render.ts): addresses for
 * updates (`data-hp-cell`), input controls in input cells of the live version, descriptions of
 * error values, frozen import values and missing values. Works on the copy, never on the source.
 */
export function annotateTables(doc: Document, mode: CalcMode | 'none'): void {
  const tables = calc.documentTables(doc as unknown as calc.DomDocument) as unknown as Element[];
  tables.forEach((table, index) => {
    const id = table.getAttribute('id');
    const key = id && id.trim() !== '' ? id : `#${index + 1}`;
    const grid = calc.tableGrid(table as unknown as calc.DomElement);
    const byPos = new Map(grid.cells.map((g) => [`${g.row}:${g.col}`, g.element as unknown as Element]));
    const thead = Array.from(table.children).find((c) => c.localName === 'thead');
    const headRow = thead ? Array.from(thead.children).filter((r) => r.localName === 'tr').length - 1 : null;
    if (table.getAttribute('data-hp-stale') === 'true' && mode !== 'live') {
      // HPF-STO-008: visibly marked as possibly out of date (a live version recalculates instead)
      const note = table.ownerDocument.createElement('p');
      note.className = 'hp-stale-note';
      note.setAttribute('data-hp-reader', 'stale');
      note.textContent = `Tabelle${captionOf(table) ? ` „${captionOf(table)}“` : ''}: Werte möglicherweise veraltet (seit der letzten Berechnung geändert).`;
      table.before(note);
    }
    for (const g of grid.cells) {
      const el = g.element as unknown as HTMLElement;
      const address = `${key}.${calc.cellAddress(g.row, g.col)}`;
      const formula = el.getAttribute('data-hp-formula');
      const input = el.getAttribute('data-hp-input') === 'true' && formula === null;
      const check = el.getAttribute('data-hp-check');
      const frozenImport = el.getAttribute('data-hp-import') === 'frozen';
      if (formula === null && !input && check === null && !frozenImport && el.getAttribute('data-hp-type') !== 'error') continue;
      el.setAttribute('data-hp-cell', address);
      const d = el.ownerDocument;
      if (formula !== null) {
        el.setAttribute('title', `Formel ${formula}`);
        if (el.getAttribute('data-hp-value') === null && mode !== 'live') {
          // HPF-STO-008: a formula without stored value is marked, never shown as 0 or empty
          el.setAttribute('data-hp-not-computed', '');
          if ((el.textContent ?? '').trim() === '') el.textContent = 'nicht berechnet';
        }
      }
      if (frozenImport) {
        el.setAttribute('title', `Beim Import eingefrorener Wert; ursprüngliche Formel ${el.getAttribute('data-hp-import-formula') ?? ''} wird nicht berechnet`);
      }
      if (el.getAttribute('data-hp-type') === 'error') {
        const sr = d.createElement('span');
        sr.className = 'hp-sr';
        sr.setAttribute('data-hp-reader', 'error');
        sr.textContent = ` (Fehler: ${errorDescription(el.getAttribute('data-hp-value') ?? '')})`;
        el.append(sr);
      }
      if (input && mode === 'live') {
        const type = el.getAttribute('data-hp-type');
        const control = d.createElement('input');
        control.setAttribute('data-hp-cell', address);
        control.setAttribute('aria-label', `${inputLabel(byPos, g.row, g.col, headRow) || address} (${address})`);
        control.setAttribute('autocomplete', 'off');
        control.setAttribute('spellcheck', 'false');
        if (type === 'date') {
          control.type = 'date';
          control.value = (el.getAttribute('data-hp-value') ?? '').slice(0, 10);
        } else if (type === 'boolean') {
          control.type = 'checkbox';
          control.checked = el.getAttribute('data-hp-value') === 'true';
        } else {
          control.type = 'text';
          control.value = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (type === 'float' || type === 'currency' || type === 'percentage') control.setAttribute('inputmode', 'decimal');
          control.size = Math.max(4, Math.min(24, control.value.length + 2));
        }
        el.replaceChildren(control);
        el.setAttribute('data-hp-input-cell', '');
      }
      if (check !== null) {
        const msg = d.createElement('span');
        msg.className = 'hp-check-msg';
        msg.setAttribute('data-hp-reader', 'check');
        msg.id = `hp-check-${address.replace(/[^A-Za-z0-9_-]/g, '_')}`;
        msg.hidden = true;
        msg.textContent = el.getAttribute('data-hp-check-message') ?? 'Prüfung nicht erfüllt';
        el.append(msg);
        const target = el.querySelector('input') ?? el;
        target.setAttribute('aria-describedby', msg.id);
      }
    }
  });
  for (const a of Array.from(doc.querySelectorAll('a[data-hp-ref="value"]'))) {
    const href = a.getAttribute('href') ?? '';
    a.setAttribute('data-hp-ref-cell', href.slice(href.indexOf('#') + 1));
  }
}

/** Bytes as a download (export, saving). */
export function download(bytes: Uint8Array, name: string, type: string): void {
  const blob = new Blob([new Uint8Array(bytes)], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
