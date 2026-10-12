import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { calc } from '../src/index.js';

/** Cell specification for test tables. */
export type Spec =
  | number
  | string
  | boolean
  | null
  | { f: string; t?: string; v?: string; input?: boolean; check?: string; msg?: string }
  | { v: string; t: string; input?: boolean; text?: string; check?: string; msg?: string }
  | { raw: string };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function td(s: Spec): string {
  if (s === null) return '<td></td>';
  if (typeof s === 'number') return `<td data-hp-type="float" data-hp-value="${calc.canonicalNumber(s)}">${s}</td>`;
  if (typeof s === 'boolean') return `<td data-hp-type="boolean" data-hp-value="${s}">${s ? 'WAHR' : 'FALSCH'}</td>`;
  if (typeof s === 'string') return `<td>${esc(s)}</td>`;
  if ('raw' in s) return s.raw;
  const attrs: string[] = [];
  if ('f' in s) attrs.push(`data-hp-formula="${esc(s.f)}"`);
  if (s.t) attrs.push(`data-hp-type="${s.t}"`);
  if (s.v !== undefined) attrs.push(`data-hp-value="${esc(s.v)}"`);
  if (s.input) attrs.push('data-hp-input="true"');
  if (s.check) attrs.push(`data-hp-check="${esc(s.check)}"`);
  if (s.msg) attrs.push(`data-hp-check-message="${esc(s.msg)}"`);
  const text = 'text' in s && s.text !== undefined ? s.text : s.v ?? '';
  return `<td ${attrs.join(' ')}>${esc(text)}</td>`;
}

/** XHTML table element from rows of cell specs. */
export function tableXml(id: string | null, rows: Spec[][]): string {
  return `<table${id ? ` id="${id}"` : ''}><tbody>${rows.map((r) => `<tr>${r.map(td).join('')}</tr>`).join('')}</tbody></table>`;
}

export function xhtml(body: string, lang = 'de-AT'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}" lang="${lang}"><head><title>Test</title></head><body>${body}</body></html>\n`;
}

export function parse(text: string): calc.DomDocument {
  return new DOMParser().parseFromString(text, 'application/xhtml+xml') as unknown as calc.DomDocument;
}

export function serialize(doc: calc.DomDocument): string {
  return new XMLSerializer().serializeToString(doc as never);
}

/** Calculated document from body markup. */
export function calcDoc(body: string): calc.CalcDocument {
  const d = new calc.CalcDocument(parse(xhtml(body)));
  d.recalc();
  return d;
}

/** Display form used in expectations: canonical numbers, TRUE/FALSE, error names, "text" in quotes. */
export function show(v: calc.Scalar): string {
  if (typeof v === 'number') return calc.canonicalNumber(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (calc.isError(v)) return v.name;
  if (v === calc.EMPTY) return '(leer)';
  return JSON.stringify(v);
}

/** Evaluates a formula in the context of the first table of `tables` (position A1). */
export function evalIn(formula: string, tables: readonly calc.TableModel[] = []): string {
  return show(calc.evaluateStandalone(formula, tables));
}
