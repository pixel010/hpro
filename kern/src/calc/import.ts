/**
 * Import of spreadsheets into an hpro container (part 3, section 13).
 *
 * Supported sources: OpenDocument spreadsheet (`.ods`, flat `.fods`) and Office Open XML
 * (`.xlsx`, see `import-xlsx.ts`). Each sheet becomes a table with an id. A formula is taken
 * over when it translates into the subset of part 3 (HPF-IMP-004); otherwise the cell becomes
 * a value cell with the value stored in the source, `data-hp-import="frozen"` and
 * `data-hp-import-formula`, and is listed in `data/import-report.json` with its reason
 * (HPF-IMP-001/003). Without a stored value the cell gets `#N/A` (HPF-IMP-002). Macros and
 * scripts of the source are reported and never copied (HPF-IMP-003, HPF-SEC-001).
 *
 * Taken-over formulas are calculated by this calculator; where the source's stored value
 * differs, the report lists the difference (it is no reason to freeze).
 */
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { fromUtf8, utf8 } from '../bytes.js';
import { createContainer, readContainer } from '../container.js';
import { sriSha256 } from '../hash.js';
import { writeZip, readZip, type ZipEntryInput } from '../zip.js';
import { durationFromFraction, isoFromSerial, parseDuration, parseIsoDateTime } from './dates.js';
import { CalcDocument, descendants, type DomDocument, type DomElement } from './dom.js';
// import-xlsx.ts imports helpers from this module; both use each other only inside functions.
import { readXlsx } from './import-xlsx.js';
import { CALCULATOR, compile } from './engine.js';
import { FUNCTIONS } from './functions.js';
import { columnIndex, collectFunctions, cellAddress, LIMITS, parseFormula } from './parser.js';
import { canonicalNumber, isErrorName } from './values.js';

export type ImportReason = 'function' | 'syntax' | 'reference' | 'circular' | 'macro' | 'other';

export interface ImportReportEntry {
  /** Document address `content/index.xhtml#<table>.<A1>` (HP-ADR-008); `(Container)` for macros. */
  readonly address: string;
  /** Formula text of the source. */
  readonly formula: string;
  readonly reason: ImportReason;
  /** Value stored in the source, as written into `data-hp-value` (or the macro files). */
  readonly value: string;
  /** Unsupported function names, when the reason is `function`. */
  readonly functions?: readonly string[];
  readonly detail?: string;
}

/** Number of frozen cells; macro parts of the container (`(Container)`) are counted as `macros`. */
const frozenCells = (frozen: readonly ImportReportEntry[]): number => frozen.filter((f) => f.address !== '(Container)').length;

/** The notice at the top of the imported document; it counts what the report lists (HPF-IMP-001/003). */
function importNotice(sourceName: string, frozen: readonly ImportReportEntry[]): string {
  if (frozen.length === 0) return `Importiert aus ${sourceName}; alle Formeln wurden übernommen.`;
  const macros = frozen.length - frozenCells(frozen);
  return `Importiert aus ${sourceName}. ${frozenCells(frozen)} Formeln sind als Wert eingefroren (hinterlegt), weil hpro sie nicht berechnet; ${macros} Makro- oder Skriptteile wurden nicht übernommen. Einzelheiten: data/import-report.json.`;
}


export interface ImportDeviation {
  readonly address: string;
  readonly formula: string;
  readonly source: string;
  readonly computed: string;
}

export interface ImportReport {
  readonly source: string;
  readonly format: 'ods' | 'fods' | 'xlsx';
  readonly importedAt: string;
  readonly calculator: typeof CALCULATOR;
  readonly summary: { readonly tables: number; readonly cells: number; readonly formulas: number; readonly translated: number; readonly frozen: number; readonly macros: number };
  readonly frozen: readonly ImportReportEntry[];
  readonly deviations: readonly ImportDeviation[];
  readonly notes: ReadonlyArray<{ readonly address: string; readonly note: string }>;
  readonly tables: ReadonlyArray<{ readonly id: string; readonly sheet: string }>;
}

/** A cell of a source sheet, independent of the source format. */
export interface SourceCell {
  readonly row: number;
  readonly col: number;
  /** Formula as written in the source (with leading `=`), or null. */
  readonly formula: string | null;
  /** Formula translated into part 3 syntax, or the reason why not. */
  readonly translated: { ok: true; formula: string } | { ok: false; reason: ImportReason; detail: string } | null;
  readonly type: 'float' | 'percentage' | 'currency' | 'date' | 'time' | 'boolean' | 'string' | 'error' | null;
  /** Value in the stored form of HPF-STO-002, or null when the source has none. */
  readonly value: string | null;
  readonly unit: string | null;
  readonly text: string;
  readonly colspan: number;
  readonly rowspan: number;
}

export interface SourceSheet {
  readonly name: string;
  readonly cells: SourceCell[];
  /**
   * Leading rows the source declares as header rows (ODF `table:table-header-rows`, in Calc
   * „Wiederholungszeilen“); they become `thead` with `th scope="col"` (HP-INH-010).
   */
  readonly headerRows?: number;
}

export interface SourceWorkbook {
  readonly format: 'ods' | 'fods' | 'xlsx';
  readonly sheets: SourceSheet[];
  /** Macro or script parts found in the source (never copied). */
  readonly macros: string[];
  /** Names of functions defined by macros of the source (user-defined functions). */
  readonly macroFunctions?: string[];
  /** Remarks on values that could not be taken over as they were (e.g. 1900-02-29). */
  readonly notes?: Array<{ sheet: string; row: number; col: number; text: string }>;
}

const ODS_NS = {
  calcext: 'urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0',
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
};

/** Table ids from sheet names: allowed characters only (HPF-ADR-001), unique. */
export function sheetIds(names: readonly string[]): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const name of names) {
    let base = name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!/^[a-z]/.test(base)) base = `t-${base}`.replace(/-$/, '');
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    out.set(name, id);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// OpenDocument formula translation (references `[$Sheet.A1]` to `[id.A1]`)
// ---------------------------------------------------------------------------------------------

const ODF_REF_PART = /^(?:\$?('(?:[^']|'')+'|[^.'$\]:][^.\]:]*))?\.(\$?[A-Z]+)?(\$?[0-9]+)?$/;

function unquote(s: string): string {
  return s.startsWith("'") ? s.slice(1, -1).replace(/''/g, "'") : s;
}

type Translation = { ok: true; formula: string } | { ok: false; reason: ImportReason; detail: string };

/** Translates an OpenFormula reference body (inside brackets) of sheet `current`. */
function translateOdfRef(inner: string, current: string, ids: ReadonlyMap<string, string>): Translation {
  if (inner.includes('#') && /^'[^']*'#/.test(inner)) return { ok: false, reason: 'reference', detail: `Bezug auf eine andere Datei: [${inner}]` };
  const parts = inner.split(':');
  if (parts.length > 2) return { ok: false, reason: 'syntax', detail: `Bezug [${inner}]` };
  const parsed = parts.map((p) => ODF_REF_PART.exec(p));
  if (parsed.some((m) => !m)) return { ok: false, reason: 'syntax', detail: `Bezug [${inner}] nicht lesbar` };
  const sheets = parsed.map((m) => (m![1] ? unquote(m![1]) : null));
  if (parsed.some((m) => !m![2] || !m![3])) return { ok: false, reason: 'reference', detail: `ganze Zeile oder Spalte: [${inner}]` };
  const first = sheets[0] ?? current;
  const second = sheets[1] ?? first;
  if (second !== first) return { ok: false, reason: 'reference', detail: `Bereich über mehrere Tabellen: [${inner}]` };
  const id = first === current ? '' : ids.get(first);
  if (id === undefined) return { ok: false, reason: 'reference', detail: `unbekannte Tabelle ${first}` };
  const cell = (m: RegExpExecArray) => `${m[2]!.replace('$', '')}${m[3]!.replace('$', '')}`;
  for (const m of parsed) {
    if (columnIndex(m![2]!.replace('$', '')) >= LIMITS.columns || Number(m![3]!.replace('$', '')) > LIMITS.rows) {
      return { ok: false, reason: 'reference', detail: `Bezug jenseits der Grenzen: [${inner}]` };
    }
  }
  const a = `${id}.${cell(parsed[0]!)}`;
  return { ok: true, formula: parsed.length === 2 ? `[${a}:.${cell(parsed[1]!)}]` : `[${a}]` };
}

/** Checks a formula in part 3 syntax: parses, functions supported. */
export function checkTranslated(formula: string): Translation {
  const c = compile(formula);
  if (!c.ast && c.error?.kind === 'name') {
    // the formula parses, but uses functions outside list 8.2: name them (reason `function`)
    const unknown = [...collectFunctions(parseFormula(formula))].filter((f) => !FUNCTIONS.has(f));
    return { ok: false, reason: 'function', detail: unknown.join(', ') };
  }
  if (!c.ast) return { ok: false, reason: c.error?.kind === 'limit' ? 'other' : 'syntax', detail: c.error?.message ?? 'nicht lesbar' };
  return { ok: true, formula };
}

/** Translates an ODF `table:formula` (`of:=…`) of sheet `current`. */
export function translateOdfFormula(source: string, current: string, ids: ReadonlyMap<string, string>): Translation {
  let f = source;
  const ns = /^([a-z]+):(?==)/.exec(f);
  if (ns) {
    if (ns[1] !== 'of') return { ok: false, reason: 'syntax', detail: `Formelsprache ${ns[1]}` };
    f = f.slice(ns[0].length);
  }
  if (!f.startsWith('=')) return { ok: false, reason: 'syntax', detail: 'Formel ohne =' };
  let out = '';
  let i = 0;
  while (i < f.length) {
    const ch = f[i]!;
    if (ch === '"') {
      let j = i + 1;
      while (j < f.length && !(f[j] === '"' && f[j + 1] !== '"')) j += f[j] === '"' ? 2 : 1;
      out += f.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '[') {
      let j = i + 1;
      let quoted = false;
      while (j < f.length && (quoted || f[j] !== ']')) {
        if (f[j] === "'") quoted = !quoted;
        j++;
      }
      const t = translateOdfRef(f.slice(i + 1, j), current, ids);
      if (!t.ok) return t;
      out += t.formula;
      i = j + 1;
    } else {
      out += ch;
      i++;
    }
  }
  return checkTranslated(out);
}

// ---------------------------------------------------------------------------------------------
// OpenDocument reading
// ---------------------------------------------------------------------------------------------

type XEl = DomElement & {
  getAttributeNS(ns: string, name: string): string | null;
  getElementsByTagNameNS(ns: string, name: string): { length: number; item(i: number): unknown };
};

function elementChildren(el: XEl): XEl[] {
  const out: XEl[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes.item(i)!;
    if (n.nodeType === 1) out.push(n as unknown as XEl);
  }
  return out;
}

function odfText(cell: XEl): string {
  const paras: string[] = [];
  const walk = (el: XEl, acc: string[]): void => {
    for (let i = 0; i < el.childNodes.length; i++) {
      const n = el.childNodes.item(i)!;
      if (n.nodeType === 3) acc.push(n.textContent ?? '');
      else if (n.nodeType === 1) {
        const e = n as unknown as XEl;
        if (e.namespaceURI === ODS_NS.office && e.localName === 'annotation') continue;
        if (e.localName === 's') acc.push(' '.repeat(Number(e.getAttributeNS(ODS_NS.text, 'c') ?? '1')));
        else if (e.localName === 'tab') acc.push('\t');
        else if (e.localName === 'line-break') acc.push('\n');
        else walk(e, acc);
      }
    }
  };
  for (const p of elementChildren(cell)) {
    if (p.namespaceURI === ODS_NS.text && (p.localName === 'p' || p.localName === 'h')) {
      const acc: string[] = [];
      walk(p, acc);
      paras.push(acc.join(''));
    }
  }
  return paras.join('\n');
}

function odfValue(cell: XEl): { type: SourceCell['type']; value: string | null; unit: string | null } {
  const a = (n: string) => cell.getAttributeNS(ODS_NS.office, n);
  // LibreOffice stores error results as empty text with calcext:value-type="error" and the error in the text.
  if (cell.getAttributeNS(ODS_NS.calcext, 'value-type') === 'error') {
    const shown = odfText(cell).trim();
    return { type: 'error', value: isErrorName(shown) ? shown : null, unit: null };
  }
  const type = a('value-type');
  switch (type) {
    case 'float':
    case 'percentage':
    case 'currency': {
      const v = a('value');
      return { type, value: v !== null && Number.isFinite(Number(v)) ? canonicalNumber(Number(v)) : null, unit: type === 'currency' ? a('currency') : null };
    }
    case 'date': {
      const v = a('date-value');
      const p = v ? parseIsoDateTime(v.replace(/\.\d+$/, '')) : null;
      return { type: 'date', value: p && p.date !== null ? isoFromSerial(p.date + p.time) : null, unit: null };
    }
    case 'time': {
      const v = a('time-value');
      const t = v ? parseDuration(v) : null;
      return { type: 'time', value: t === null ? null : durationFromFraction(t), unit: null };
    }
    case 'boolean':
      return { type: 'boolean', value: a('boolean-value') === 'true' ? 'true' : 'false', unit: null };
    case 'string':
      return { type: 'string', value: a('string-value'), unit: null };
    default:
      return { type: null, value: null, unit: null };
  }
}

const MAX_REPEAT_MATERIALIZED = 1024;

function readOdsSheets(root: XEl): SourceSheet[] {
  const sheets: SourceSheet[] = [];
  const tables: XEl[] = [];
  const findTables = (el: XEl) => {
    for (const c of elementChildren(el)) {
      if (c.namespaceURI === ODS_NS.table && c.localName === 'table') tables.push(c);
      else findTables(c);
    }
  };
  findTables(root);
  const names = tables.map((t) => t.getAttributeNS(ODS_NS.table, 'name') ?? `Tabelle${sheets.length + 1}`);
  const ids = sheetIds(names);
  tables.forEach((t, ti) => {
    const name = names[ti]!;
    const cells: SourceCell[] = [];
    const rows: XEl[] = [];
    const headerRowElements = new Set<XEl>();
    const collectRows = (el: XEl, header = false) => {
      for (const c of elementChildren(el)) {
        if (c.namespaceURI !== ODS_NS.table) continue;
        if (c.localName === 'table-row') {
          rows.push(c);
          if (header) headerRowElements.add(c);
        } else if (['table-header-rows', 'table-rows', 'table-row-group'].includes(c.localName ?? '')) collectRows(c, header || c.localName === 'table-header-rows');
      }
    };
    collectRows(t);
    let r = 0;
    let headerRows = 0;
    for (const row of rows) {
      // Header rows count only as a block at the top of the sheet.
      if (headerRowElements.has(row) && r === headerRows) headerRows += Math.max(1, Number(row.getAttributeNS(ODS_NS.table, 'number-rows-repeated') ?? '1') || 1);
      const repeat = Math.max(1, Number(row.getAttributeNS(ODS_NS.table, 'number-rows-repeated') ?? '1') || 1);
      const rowCells: SourceCell[] = [];
      let c = 0;
      for (const cell of elementChildren(row)) {
        if (cell.namespaceURI !== ODS_NS.table || (cell.localName !== 'table-cell' && cell.localName !== 'covered-table-cell')) continue;
        const crep = Math.max(1, Number(cell.getAttributeNS(ODS_NS.table, 'number-columns-repeated') ?? '1') || 1);
        const formula = cell.localName === 'table-cell' ? cell.getAttributeNS(ODS_NS.table, 'formula') : null;
        const v = odfValue(cell);
        const text = odfText(cell);
        const empty = formula === null && v.type === null && text === '';
        if (!empty && cell.localName === 'table-cell') {
          const n = Math.min(crep, MAX_REPEAT_MATERIALIZED);
          for (let k = 0; k < n; k++) {
            const shown = formula?.replace(/^[a-z]+:(?==)/, '') ?? null;
            rowCells.push({
              row: r,
              col: c + k,
              formula: shown,
              translated: formula === null ? null : translateOdfFormula(formula, name, ids),
              type: v.type,
              value: v.value,
              unit: v.unit,
              text,
              colspan: Math.max(1, Number(cell.getAttributeNS(ODS_NS.table, 'number-columns-spanned') ?? '1') || 1),
              rowspan: Math.max(1, Number(cell.getAttributeNS(ODS_NS.table, 'number-rows-spanned') ?? '1') || 1),
            });
          }
        }
        c += crep;
      }
      // Repeated rows: materialise only rows with content (trailing empty rows are format only).
      const n = rowCells.length > 0 ? Math.min(repeat, MAX_REPEAT_MATERIALIZED) : repeat;
      if (rowCells.length > 0) for (let k = 0; k < n; k++) for (const cell of rowCells) cells.push({ ...cell, row: r + k });
      r += repeat;
    }
    sheets.push({ name, cells, ...(headerRows > 0 ? { headerRows } : {}) });
  });
  return sheets;
}

function parseXml(text: string, what: string): XEl {
  const errors: string[] = [];
  const doc = new DOMParser({ onError: (level, msg) => void (level !== 'warning' && errors.push(String(msg))) }).parseFromString(text, 'text/xml');
  if (errors.length > 0 || !doc.documentElement) throw new Error(`${what}: XML not well-formed: ${errors[0] ?? ''}`);
  return doc.documentElement as unknown as XEl;
}

/** Reads an OpenDocument spreadsheet (zip or flat XML). */
export async function readOds(bytes: Uint8Array): Promise<SourceWorkbook> {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) {
    const root = parseXml(fromUtf8(bytes), 'fods');
    const macros: string[] = [];
    const scripts = root.getElementsByTagNameNS(ODS_NS.office, 'scripts');
    if (scripts.length > 0 && elementChildren(scripts.item(0) as XEl).length > 0) macros.push('office:scripts');
    return { format: 'fods', sheets: readOdsSheets(root), macros };
  }
  const entries = await readZip(bytes);
  const content = entries.find((e) => e.name === 'content.xml');
  if (!content) throw new Error('ods: content.xml missing');
  const root = parseXml(fromUtf8(content.data), 'content.xml');
  const macroEntries = entries.filter((e) => /^(Basic|Scripts)\//.test(e.name) && !e.name.endsWith('/'));
  const macros = macroEntries.map((e) => e.name);
  const scripts = root.getElementsByTagNameNS(ODS_NS.office, 'scripts');
  if (scripts.length > 0 && elementChildren(scripts.item(0) as XEl).length > 0) macros.push('content.xml: office:scripts');
  const macroFunctions = [...new Set(macroEntries.flatMap((e) => [...fromUtf8(e.data).matchAll(/\b(?:Function|Sub)\s+([A-Za-z_][A-Za-z0-9_]*)/gi)].map((m) => m[1]!.toUpperCase())))];
  return { format: 'ods', sheets: readOdsSheets(root), macros, macroFunctions };
}

// ---------------------------------------------------------------------------------------------
// Building the hpro document
// ---------------------------------------------------------------------------------------------

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;');

export interface ImportOptions {
  /** File name of the source, for the report and the title. */
  readonly sourceName: string;
  /** Import time (RFC 3339, UTC), also `dateModified` and `computedAt`. */
  readonly importedAt: string;
  readonly language?: string;
  readonly title?: string;
  readonly id?: string;
}

export interface ImportResult {
  readonly bytes: Uint8Array;
  readonly report: ImportReport;
  readonly xhtml: string;
}

const CONTENT_PATH = 'content/index.xhtml';
const REPORT_PATH = 'data/import-report.json';

// Text follows the reading-system variables (HP-INH-004); the values after the comma are fallbacks.
const STYLE = `body { font-family: system-ui, sans-serif; font-size: var(--hp-font-size, 1rem); line-height: var(--hp-line-height, 1.5);
  letter-spacing: var(--hp-letter-spacing, normal); word-spacing: var(--hp-word-spacing, normal);
  color: var(--hp-foreground, #111); background: var(--hp-background, #fff); margin: 0 auto; max-width: 60rem; padding: 1rem; }
p, table { margin-top: var(--hp-paragraph-spacing, 1em); margin-bottom: var(--hp-paragraph-spacing, 1em); }
table { border-collapse: collapse; margin: 1rem 0; }
th, td { border: 1px solid #999; padding: 0.2rem 0.5rem; vertical-align: top; }
td[data-hp-type="float"], td[data-hp-type="currency"], td[data-hp-type="percentage"] { text-align: right; }
td[data-hp-import="frozen"] { background: #fff4d6; }
h1, h2, h3, h4, h5, h6 { break-after: avoid; }
table, figure, pre { break-inside: avoid; }
`;

/** Builds the content document and the report from a source workbook. */
export function buildImportDocument(wb: SourceWorkbook, options: ImportOptions): { xhtml: string; report: ImportReport } {
  const ids = sheetIds(wb.sheets.map((s) => s.name));
  const frozen: ImportReportEntry[] = [];
  let cells = 0;
  let formulas = 0;
  let translated = 0;
  const sections: string[] = [];
  const title = options.title ?? options.sourceName.replace(/\.[^.]+$/, '');
  for (const sheet of wb.sheets) {
    const id = ids.get(sheet.name)!;
    const rows = sheet.cells.reduce((m, c) => Math.max(m, c.row + c.rowspan), 0);
    const cols = sheet.cells.reduce((m, c) => Math.max(m, c.col + c.colspan), 0);
    const byPos = new Map(sheet.cells.map((c) => [c.row * LIMITS.columns + c.col, c]));
    const covered = new Set<number>();
    for (const c of sheet.cells) for (let i = 0; i < c.rowspan; i++) for (let j = 0; j < c.colspan; j++) if (i || j) covered.add((c.row + i) * LIMITS.columns + c.col + j);
    const trs: string[] = [];
    for (let r = 0; r < rows; r++) {
      const tds: string[] = [];
      for (let c = 0; c < cols; c++) {
        const key = r * LIMITS.columns + c;
        if (covered.has(key)) continue;
        const cell = byPos.get(key);
        if (!cell) {
          tds.push('<td></td>');
          continue;
        }
        cells++;
        const span = (cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '') + (cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : '');
        const attrs: string[] = [];
        const address = `${CONTENT_PATH}#${id}.${cellAddress(r, c)}`;
        let type = cell.type;
        let value = cell.value;
        let shown = cell.text;
        if (cell.formula !== null) {
          formulas++;
          const t = cell.translated!;
          if (t.ok) {
            translated++;
            attrs.push(`data-hp-formula="${escAttr(t.formula)}"`);
          } else {
            if (value === null) {
              type = 'error';
              value = '#N/A'; // HPF-IMP-002
              shown = '#N/A';
            }
            attrs.push('data-hp-import="frozen"', `data-hp-import-formula="${escAttr(cell.formula)}"`);
            const fns = t.reason === 'function' ? t.detail.split(', ') : undefined;
            // A function defined by a macro of the source is a macro call (HPF-IMP-003).
            const viaMacro = fns?.some((f) => wb.macroFunctions?.includes(f)) ?? false;
            const reason: ImportReason = viaMacro ? 'macro' : t.reason;
            const detail = viaMacro ? `Aufruf einer Makrofunktion: ${t.detail}` : t.detail + (cell.value === null && cell.type === 'error' ? '; Quelle ohne gültigen Wert' : '');
            frozen.push({ address, formula: cell.formula, reason, value: value!, ...(fns ? { functions: fns } : {}), detail });
          }
        }
        if (type !== null && value !== null) {
          if (type === 'error' && !isErrorName(value)) value = '#N/A';
          attrs.push(`data-hp-type="${type}"`, `data-hp-value="${escAttr(value)}"`);
          if (cell.unit) attrs.push(`data-hp-unit="${escAttr(cell.unit)}"`);
        } else if (type !== null && cell.formula !== null) {
          attrs.push(`data-hp-type="${type}"`);
        }
        const body = type === 'date' && value !== null ? `<time datetime="${escAttr(value)}">${escText(shown)}</time>` : escText(shown);
        // A text cell of a declared header row is a column header (HP-INH-010).
        const header = r < (sheet.headerRows ?? 0) && cell.formula === null && (type === null || type === 'string');
        tds.push(header ? `<th scope="col"${span}${attrs.length ? ' ' + attrs.join(' ') : ''}>${body}</th>` : `<td${span}${attrs.length ? ' ' + attrs.join(' ') : ''}>${body}</td>`);
      }
      trs.push(`<tr>${tds.join('')}</tr>`);
    }
    const headCount = Math.min(sheet.headerRows ?? 0, trs.length);
    const head = headCount > 0 ? `<thead>\n${trs.slice(0, headCount).join('\n')}\n</thead>\n` : '';
    sections.push(
      `<section id="s-${id}" aria-labelledby="h-${id}">\n<h2 id="h-${id}">${escText(sheet.name)}</h2>\n<table id="${id}" data-hp-table="scroll">\n<caption>${escText(sheet.name)}</caption>\n${head}<tbody>\n${trs.slice(headCount).join('\n')}\n</tbody>\n</table>\n</section>`,
    );
  }
  for (const m of wb.macros) frozen.push({ address: '(Container)', formula: '', reason: 'macro', value: m, detail: 'Makro- oder Skriptteil der Quelle, nicht übernommen' });
  const lang = options.language ?? 'de';
  const notice = `<p id="import-hinweis">${escText(importNotice(options.sourceName, frozen))}</p>`;
  const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}" lang="${lang}">
<head>
<meta charset="utf-8"/>
<title>${escText(title)}</title>
<link rel="stylesheet" href="styles/import.css"/>
</head>
<body>
<h1 id="titel">${escText(title)}</h1>
${notice}
${sections.join('\n')}
</body>
</html>
`;
  const report: ImportReport = {
    source: options.sourceName,
    format: wb.format,
    importedAt: options.importedAt,
    calculator: CALCULATOR,
    summary: { tables: wb.sheets.length, cells, formulas, translated, frozen: frozenCells(frozen), macros: wb.macros.length },
    frozen,
    deviations: [],
    notes: (wb.notes ?? []).map((n) => ({ address: `${CONTENT_PATH}#${ids.get(n.sheet)}.${cellAddress(n.row, n.col)}`, note: n.text })),
    tables: wb.sheets.map((s) => ({ id: ids.get(s.name)!, sheet: s.name })),
  };
  return { xhtml, report };
}

function parseDoc(xhtml: string): DomDocument {
  return new DOMParser().parseFromString(xhtml, 'application/xhtml+xml') as unknown as DomDocument;
}

/**
 * Calculates the imported document: cells on circular references are frozen as well (reason
 * `circular`); values differing from the source are reported as deviations.
 */
function calculateImport(xhtml: string, report: ImportReport): { xhtml: string; report: ImportReport } {
  let doc = parseDoc(xhtml);
  let calc = new CalcDocument(doc);
  const first = calc.recalc();
  const frozen = [...report.frozen];
  if (first.circular.length > 0) {
    for (const cell of first.circular) {
      const el = cell.element as DomElement;
      const formula = el.getAttribute('data-hp-formula')!;
      el.removeAttribute('data-hp-formula');
      el.setAttribute('data-hp-import', 'frozen');
      el.setAttribute('data-hp-import-formula', formula);
      if (el.getAttribute('data-hp-value') === null) {
        el.setAttribute('data-hp-type', 'error');
        el.setAttribute('data-hp-value', '#N/A');
      }
      frozen.push({ address: `${CONTENT_PATH}#${cell.table.key}.${cellAddress(cell.row, cell.col)}`, formula, reason: 'circular', value: el.getAttribute('data-hp-value')!, detail: 'Zirkelbezug' });
    }
    // The notice was written before the circular cells were known.
    const notice = descendants(doc).find((el) => el.getAttribute('id') === 'import-hinweis');
    if (notice) notice.textContent = importNotice(report.source, frozen);
    doc = parseDoc(new XMLSerializer().serializeToString(doc as never));
    calc = new CalcDocument(doc);
    calc.recalc();
  }
  const deviations: ImportDeviation[] = calc.deviations().map((d) => ({ address: `${CONTENT_PATH}#${d.address}`, formula: d.formula, source: d.stored, computed: d.computed }));
  calc.write();
  const out = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(doc as never).replace(/^<\?xml[^>]*\?>\s*/, '') + '\n';
  return {
    xhtml: out,
    report: { ...report, frozen, deviations, summary: { ...report.summary, frozen: frozenCells(frozen), translated: report.summary.translated - first.circular.length } },
  };
}


/** Imports a spreadsheet and writes a complete hpro container. */
export async function importSpreadsheet(bytes: Uint8Array, options: ImportOptions): Promise<ImportResult> {
  const isXlsx = /\.xlsx$/i.test(options.sourceName);
  const wb = isXlsx ? await readXlsx(bytes) : await readOds(bytes);
  const built = buildImportDocument(wb, options);
  const { xhtml, report } = calculateImport(built.xhtml, built.report);
  const reportJson = JSON.stringify(report, null, 2) + '\n';
  const title = options.title ?? options.sourceName.replace(/\.[^.]+$/, '');
  const created = await createContainer({
    id: options.id ?? `urn:uuid:${await uuidFrom(bytes)}`,
    title,
    language: options.language ?? 'de',
    modified: options.importedAt,
    profile: 'static',
    readingOrder: [CONTENT_PATH],
    toc: { title: 'Inhalt', entries: report.tables.map((t) => ({ title: t.sheet, href: `${CONTENT_PATH}#s-${t.id}` })) },
    resources: [
      { path: CONTENT_PATH, mediaType: 'application/xhtml+xml', data: xhtml },
      { path: 'content/styles/import.css', mediaType: 'text/css', data: STYLE },
      { path: REPORT_PATH, mediaType: 'application/json', data: reportJson },
    ],
    accessibility: {
      accessMode: ['textual'],
      accessModeSufficient: ['textual'],
      accessibilityFeature: ['structuralNavigation', 'tableOfContents'],
      accessibilityHazard: ['none'],
      accessibilitySummary: 'Aus einer Tabellenkalkulation importierte Tabellen mit Formeln und gespeicherten Werten.',
    },
  });
  // computedAt and calculator in the manifest (HPF-STO-006), the report as data file.
  const c = await readContainer(created.bytes);
  const manifest = { ...(JSON.parse(fromUtf8(c.files.get('manifest.json')!)) as Record<string, unknown>), data: [{ url: REPORT_PATH }], computedAt: options.importedAt, calculator: { ...CALCULATOR } };
  const entries: ZipEntryInput[] = c.entries.map((e) => ({
    name: e.name,
    data: e.name === 'manifest.json' ? utf8(JSON.stringify(manifest, null, 2) + '\n') : e.data,
    compression: e.name === 'mimetype' ? 'store' : 'auto',
  }));
  const out = await writeZip(entries, { modified: new Date(options.importedAt) });
  return { bytes: out, report, xhtml };
}

/** Deterministic UUID (version 8 layout) from the source bytes, so repeated imports are equal. */
async function uuidFrom(bytes: Uint8Array): Promise<string> {
  const h = (await sriSha256(bytes)).slice(7);
  const hex = Array.from(atob(h), (ch) => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
