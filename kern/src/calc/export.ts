/**
 * Data export of tables: CSV (RFC 4180, canonical values), JSON (typed values with formula and
 * display) and OpenDocument spreadsheet (`.ods` and flat `.fods`, HPF-IMP-005): formulas with
 * the `of:` prefix, value types and values per ODF part 3, null date 1899-12-30 and the host
 * properties of HPF-TYP-011 as calculation settings, so that an office program opening the
 * file calculates under the same rules as far as it supports them.
 */
import { utf8 } from '../bytes.js';
import { writeZip } from '../zip.js';
import { durationFromFraction, isValidSerial, isoFromSerial } from './dates.js';
import type { CalcDocument } from './dom.js';
import { CALCULATOR } from './engine.js';
import { storedForm } from './format.js';
import type { CellModel, TableModel } from './model.js';
import { cellAddress } from './parser.js';
import { EMPTY, canonicalNumber, isError, type Scalar } from './values.js';

export type ExportFormat = 'csv' | 'json' | 'ods' | 'fods';

const ODS_MIMETYPE = 'application/vnd.oasis.opendocument.spreadsheet';

/** Canonical text of a value for CSV: numbers canonical, dates ISO, logical TRUE/FALSE. */
function plain(cell: CellModel | undefined): string {
  if (!cell) return '';
  const v = cell.value;
  if (v === EMPTY) return '';
  const s = storedForm(v, cell.declaredType);
  if (s.type === 'boolean') return s.value === 'true' ? 'TRUE' : 'FALSE';
  return s.value;
}

function csvField(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function tableToCsv(table: TableModel): string {
  const lines: string[] = [];
  for (let r = 0; r < table.rows; r++) {
    const fields: string[] = [];
    for (let c = 0; c < table.cols; c++) fields.push(csvField(plain(table.get(r, c))));
    lines.push(fields.join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

function jsonValue(v: Scalar): unknown {
  if (v === EMPTY) return null;
  if (isError(v)) return { error: v.name };
  return v;
}

export function tablesToJson(calc: CalcDocument, tables: readonly TableModel[], meta: { computedAt?: string } = {}): string {
  const out = {
    calculator: { ...CALCULATOR },
    ...(meta.computedAt ? { computedAt: meta.computedAt } : {}),
    tables: tables.map((t) => ({
      id: t.key,
      rows: t.rows,
      columns: t.cols,
      cells: [...t.cells.values()]
        .sort((a, b) => a.row - b.row || a.col - b.col)
        .filter((c) => c.value !== EMPTY || c.formula !== null)
        .map((c) => {
          const stored = c.value === EMPTY ? null : storedForm(c.value, c.declaredType);
          return {
            address: cellAddress(c.row, c.col),
            ...(stored ? { type: stored.type, value: jsonValue(c.value), stored: stored.value } : { type: null, value: null }),
            ...(c.formula !== null ? { formula: c.formula } : {}),
            ...(c.input ? { input: true } : {}),
            display: calc.display(c).text,
          };
        }),
    })),
  };
  return JSON.stringify(out, null, 2) + '\n';
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Sheet name of a table: its id, or `Tabelle<n>` for tables without id. */
export function sheetName(t: TableModel): string {
  return t.id ?? `Tabelle${t.index + 1}`;
}

function valueAttributes(v: Scalar, cell: CellModel): string {
  if (v === EMPTY || isError(v)) return '';
  if (typeof v === 'boolean') return ` office:value-type="boolean" office:boolean-value="${v}"`;
  if (typeof v === 'string') return ` office:value-type="string" office:string-value="${esc(v)}"`;
  switch (cell.declaredType) {
    case 'percentage':
      return ` office:value-type="percentage" office:value="${canonicalNumber(v)}"`;
    case 'currency':
      return ` office:value-type="currency"${cell.unit ? ` office:currency="${esc(cell.unit)}"` : ''} office:value="${canonicalNumber(v)}"`;
    case 'date':
      if (isValidSerial(v)) return ` office:value-type="date" office:date-value="${isoFromSerial(v)}"`;
      break;
    case 'time':
      if (v >= 0) return ` office:value-type="time" office:time-value="${durationFromFraction(v)}"`;
      break;
    default:
      break;
  }
  return ` office:value-type="float" office:value="${canonicalNumber(v)}"`;
}

function cellXml(calc: CalcDocument, cell: CellModel | undefined): string {
  if (!cell) return '<table:table-cell/>';
  const v = cell.value;
  if (cell.formula !== null) {
    const shown = calc.display(cell).text;
    return `<table:table-cell table:formula="of:${esc(cell.formula)}"${valueAttributes(v, cell)}><text:p>${esc(shown)}</text:p></table:table-cell>`;
  }
  if (isError(v)) return `<table:table-cell table:formula="of:=${esc(v.name)}"><text:p>${esc(v.name)}</text:p></table:table-cell>`;
  if (v === EMPTY) return '<table:table-cell/>';
  return `<table:table-cell${valueAttributes(v, cell)}><text:p>${esc(calc.display(cell).text)}</text:p></table:table-cell>`;
}

const NS =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ' +
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2" ' +
  'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"';

/** Calculation settings carrying the host properties of HPF-TYP-011. */
const CALCULATION_SETTINGS =
  '<table:calculation-settings table:case-sensitive="false" table:precision-as-shown="false" ' +
  'table:search-criteria-must-apply-to-whole-cell="true" table:automatic-find-labels="false" ' +
  'table:use-regular-expressions="false" table:use-wildcards="false">' +
  '<table:null-date table:date-value="1899-12-30"/><table:iteration table:status="disable"/></table:calculation-settings>';

function spreadsheetBody(calc: CalcDocument, tables: readonly TableModel[]): string {
  const sheets = tables.map((t) => {
    const rows: string[] = [];
    for (let r = 0; r < t.rows; r++) {
      const cells: string[] = [];
      for (let c = 0; c < t.cols; c++) cells.push(cellXml(calc, t.get(r, c)));
      rows.push(`<table:table-row>${cells.join('')}</table:table-row>`);
    }
    return `<table:table table:name="${esc(sheetName(t))}"><table:table-column table:number-columns-repeated="${Math.max(1, t.cols)}"/>${rows.join('\n')}</table:table>`;
  });
  return `<office:body><office:spreadsheet>${CALCULATION_SETTINGS}\n${sheets.join('\n')}\n</office:spreadsheet></office:body>`;
}

export function tablesToFods(calc: CalcDocument, tables: readonly TableModel[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<office:document ${NS} office:version="1.3" office:mimetype="${ODS_MIMETYPE}">\n${spreadsheetBody(calc, tables)}\n</office:document>\n`;
}

export async function tablesToOds(calc: CalcDocument, tables: readonly TableModel[], modified = new Date(Date.UTC(2026, 0, 1))): Promise<Uint8Array> {
  const content = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ${NS} office:version="1.3">\n${spreadsheetBody(calc, tables)}\n</office:document-content>\n`;
  const manifest =
    `<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">\n` +
    ` <manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${ODS_MIMETYPE}"/>\n` +
    ` <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>\n</manifest:manifest>\n`;
  return writeZip(
    [
      { name: 'mimetype', data: utf8(ODS_MIMETYPE), compression: 'store' },
      { name: 'META-INF/manifest.xml', data: utf8(manifest), compression: 'auto' },
      { name: 'content.xml', data: utf8(content), compression: 'auto' },
    ],
    { modified },
  );
}

/** Exports the tables of a calculated document (all, or the one with key `table`). */
export async function exportTables(calc: CalcDocument, format: ExportFormat, table?: string, meta: { computedAt?: string } = {}): Promise<Uint8Array> {
  const tables = table === undefined ? calc.tables : calc.tables.filter((t) => t.key === table);
  if (tables.length === 0) throw new Error(table === undefined ? 'document has no tables' : `no table ${table}`);
  switch (format) {
    case 'csv':
      if (tables.length !== 1) throw new Error('CSV holds one table; choose one with its id');
      return utf8(tableToCsv(tables[0]!));
    case 'json':
      return utf8(tablesToJson(calc, tables, meta));
    case 'fods':
      return utf8(tablesToFods(calc, tables));
    case 'ods':
      return tablesToOds(calc, tables);
  }
}
