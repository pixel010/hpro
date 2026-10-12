/**
 * Reading Office Open XML spreadsheets (`.xlsx`) for the import (part 3, HPF-IMP-004):
 * formulas in A1 notation with `,` as separator and `!` as sheet separator are translated into
 * the bracket syntax of part 3; shared formulas are expanded by shifting their relative
 * references; dates of the 1900 system (with its leap-year error) and of the 1904 system are
 * taken over through the calendar date, not the serial. Macro parts (`vbaProject.bin`) are
 * reported, never copied.
 */
import { DOMParser } from '@xmldom/xmldom';
import { fromUtf8 } from '../bytes.js';
import { readZip, type ZipEntry } from '../zip.js';
import { durationFromFraction, isoFromSerial, isValidSerial } from './dates.js';
import type { DomElement } from './dom.js';
import { displayValue, numberStyle } from './format.js';
import { checkTranslated, sheetIds, type ImportReason, type SourceCell, type SourceSheet, type SourceWorkbook } from './import.js';
import { FUNCTIONS } from './functions.js';
import { LIMITS, columnIndex, columnName } from './parser.js';
import { canonicalNumber, isErrorName } from './values.js';

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

type XEl = DomElement & {
  getAttributeNS(ns: string, name: string): string | null;
  getElementsByTagNameNS(ns: string, name: string): { length: number; item(i: number): unknown };
};

function xml(entries: readonly ZipEntry[], name: string): XEl | null {
  const e = entries.find((x) => x.name === name);
  if (!e) return null;
  return new DOMParser().parseFromString(fromUtf8(e.data), 'text/xml').documentElement as unknown as XEl;
}

function all(el: XEl, local: string): XEl[] {
  const list = el.getElementsByTagNameNS(MAIN, local);
  const out: XEl[] = [];
  for (let i = 0; i < list.length; i++) out.push(list.item(i) as XEl);
  return out;
}

function kids(el: XEl, local: string): XEl[] {
  const out: XEl[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes.item(i)!;
    if (n.nodeType === 1 && (n as unknown as XEl).localName === local) out.push(n as unknown as XEl);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Formula translation
// ---------------------------------------------------------------------------------------------

type Tok =
  | { t: 'str'; v: string }
  | { t: 'num'; v: string }
  | { t: 'err'; v: string }
  | { t: 'ref'; sheet: string | null; a: CellRef; b: CellRef | null; external: boolean; whole: boolean; text: string }
  | { t: 'fn'; v: string }
  | { t: 'name'; v: string }
  | { t: 'op'; v: string }
  | { t: 'ws' };

interface CellRef {
  col: number;
  row: number;
  absCol: boolean;
  absRow: boolean;
}

const CELL_RE = /^\$?([A-Z]{1,3})\$?([0-9]+)/;
const SHEET_RE = /^(?:\[\d+\])?('(?:[^']|'')+'|[A-Za-z_À-￿][\w.À-￿]*)(?::('(?:[^']|'')+'|[A-Za-z_À-￿][\w.À-￿]*))?!/;

function readCell(s: string): { ref: CellRef; len: number } | null {
  const m = CELL_RE.exec(s);
  if (!m) return null;
  const head = m[0];
  return { ref: { col: columnIndex(m[1]!), row: Number(m[2]) - 1, absCol: head.startsWith('$'), absRow: /\$[0-9]/.test(head) }, len: head.length };
}

function tokenizeExcel(f: string): Tok[] | string {
  const out: Tok[] = [];
  let i = 0;
  while (i < f.length) {
    const rest = f.slice(i);
    const c = f[i]!;
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t') {
      out.push({ t: 'ws' });
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let v = '';
      while (j < f.length) {
        if (f[j] === '"') {
          if (f[j + 1] === '"') {
            v += '"';
            j += 2;
            continue;
          }
          break;
        }
        v += f[j++];
      }
      out.push({ t: 'str', v });
      i = j + 1;
      continue;
    }
    if (c === '#') {
      const m = /^#(DIV\/0!|N\/A|NAME\?|NUM!|REF!|VALUE!|NULL!|GETTING_DATA|SPILL!|CALC!|FIELD!|BLOCKED!|CONNECT!|BUSY!|UNKNOWN!)/.exec(rest);
      if (!m) return `Fehlerkonstante ${rest.slice(0, 10)}`;
      out.push({ t: 'err', v: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === '{') return 'Matrixkonstante';
    // sheet-qualified reference
    const sm = SHEET_RE.exec(rest);
    if (sm) {
      const after = rest.slice(sm[0].length);
      const a = readCell(after);
      const external = sm[0].startsWith('[');
      const sheet = sm[1]!.startsWith("'") ? sm[1]!.slice(1, -1).replace(/''/g, "'") : sm[1]!;
      if (sm[2]) return `dreidimensionaler Bezug ${sm[0]}`;
      if (!a) {
        const whole = /^\$?([A-Z]{1,3}):\$?([A-Z]{1,3})|^\$?([0-9]+):\$?([0-9]+)/.exec(after);
        if (whole) {
          out.push({ t: 'ref', sheet, a: { col: 0, row: 0, absCol: true, absRow: true }, b: null, external, whole: true, text: sm[0] + whole[0] });
          i += sm[0].length + whole[0].length;
          continue;
        }
        if (/^#REF!/.test(after)) return 'Bezug #REF!';
        return `Bezug ${sm[0]}${after.slice(0, 8)}`;
      }
      let len = sm[0].length + a.len;
      let b: CellRef | null = null;
      if (after[a.len] === ':') {
        const bb = readCell(after.slice(a.len + 1));
        if (bb) {
          b = bb.ref;
          len += 1 + bb.len;
        }
      }
      out.push({ t: 'ref', sheet, a: a.ref, b, external, whole: false, text: rest.slice(0, len) });
      i += len;
      continue;
    }
    // function or name
    const nm = /^[A-Za-z_\\][A-Za-z0-9_.\\]*/.exec(rest);
    if (nm && !/^\$?[A-Z]{1,3}\$?[0-9]+(?![A-Za-z0-9_(])/.test(rest) && !/^[A-Z]{1,3}:[A-Z]{1,3}\b/.test(rest)) {
      const name = nm[0];
      if (f[i + name.length] === '(') {
        out.push({ t: 'fn', v: name });
        i += name.length;
        continue;
      }
      if (f[i + name.length] === '[') return `strukturierter Bezug ${name}[…]`;
      out.push({ t: 'name', v: name });
      i += name.length;
      continue;
    }
    // plain reference
    const a = readCell(rest);
    if (a) {
      let len = a.len;
      let b: CellRef | null = null;
      if (rest[a.len] === ':') {
        const bb = readCell(rest.slice(a.len + 1));
        if (bb) {
          b = bb.ref;
          len += 1 + bb.len;
        }
      }
      out.push({ t: 'ref', sheet: null, a: a.ref, b, external: false, whole: false, text: rest.slice(0, len) });
      i += len;
      continue;
    }
    const whole = /^\$?([A-Z]{1,3}):\$?([A-Z]{1,3})|^\$?([0-9]+):\$?([0-9]+)/.exec(rest);
    if (whole) {
      out.push({ t: 'ref', sheet: null, a: { col: 0, row: 0, absCol: true, absRow: true }, b: null, external: false, whole: true, text: whole[0] });
      i += whole[0].length;
      continue;
    }
    const num = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(rest);
    if (num) {
      out.push({ t: 'num', v: num[0].startsWith('.') ? '0' + num[0] : num[0] });
      i += num[0].length;
      continue;
    }
    const op = /^(<>|<=|>=|[-+*/^&=<>%(),;:])/.exec(rest);
    if (op) {
      out.push({ t: 'op', v: op[0] });
      i += op[0].length;
      continue;
    }
    return `Zeichen ${JSON.stringify(c)}`;
  }
  return out;
}

const shift = (r: CellRef, dr: number, dc: number): CellRef => ({ ...r, row: r.absRow ? r.row : r.row + dr, col: r.absCol ? r.col : r.col + dc });
const a1 = (r: CellRef) => `${r.absCol ? '$' : ''}${columnName(r.col)}${r.absRow ? '$' : ''}${r.row + 1}`;
const plainA1 = (r: CellRef) => `${columnName(r.col)}${r.row + 1}`;

const isOperand = (t: Tok | undefined) => t !== undefined && (t.t === 'ref' || t.t === 'name' || t.t === 'num' || t.t === 'str' || (t.t === 'op' && t.v === ')'));

type Translation = { ok: true; formula: string } | { ok: false; reason: ImportReason; detail: string };

/**
 * Translates an Excel formula (without `=`) of sheet `current`, shifted by (dr, dc) for shared
 * formulas. Returns the source text (as the cell would show it) and the translation.
 */
export function translateExcelFormula(src: string, current: string, ids: ReadonlyMap<string, string>, dr = 0, dc = 0): { source: string; result: Translation } {
  const toks = tokenizeExcel(src);
  if (typeof toks === 'string') return { source: '=' + src, result: { ok: false, reason: toks.includes('Bezug') ? 'reference' : 'syntax', detail: toks } };
  let source = '=';
  let out = '=';
  let fail: Translation | null = null;
  const setFail = (reason: ImportReason, detail: string) => {
    fail ??= { ok: false, reason, detail };
  };
  toks.forEach((t, k) => {
    switch (t.t) {
      case 'ws': {
        source += ' ';
        const prev = toks.slice(0, k).reverse().find((x) => x.t !== 'ws');
        const next = toks.slice(k + 1).find((x) => x.t !== 'ws');
        if (isOperand(prev) && (next?.t === 'ref' || next?.t === 'name' || next?.t === 'fn' || (next?.t === 'op' && next.v === '('))) setFail('syntax', 'Schnittmengenoperator (Leerzeichen)');
        break;
      }
      case 'str':
        source += `"${t.v.replace(/"/g, '""')}"`;
        out += `"${t.v.replace(/"/g, '""')}"`;
        break;
      case 'num':
        source += t.v;
        out += t.v;
        break;
      case 'err':
        source += t.v;
        out += t.v;
        if (!isErrorName(t.v)) setFail('syntax', `Fehlerwert ${t.v}`);
        break;
      case 'ref': {
        if (t.whole) {
          source += t.text;
          setFail('reference', `ganze Zeile oder Spalte: ${t.text}`);
          break;
        }
        const a = shift(t.a, dr, dc);
        const b = t.b ? shift(t.b, dr, dc) : null;
        const sheetPart = t.sheet !== null ? `${/^[A-Za-z_][\w.]*$/.test(t.sheet) ? t.sheet : `'${t.sheet.replace(/'/g, "''")}'`}!` : '';
        source += sheetPart + a1(a) + (b ? ':' + a1(b) : '');
        if (t.external) {
          setFail('reference', `Bezug auf eine andere Datei: ${t.text}`);
          break;
        }
        if ([a, b].some((r) => r && (r.row < 0 || r.col < 0 || r.row >= LIMITS.rows || r.col >= LIMITS.columns))) {
          setFail('reference', `Bezug jenseits der Grenzen: ${t.text}`);
          break;
        }
        const sheet = t.sheet === null || t.sheet === current ? '' : ids.get(t.sheet);
        if (sheet === undefined) {
          setFail('reference', `unbekannte Tabelle ${t.sheet}`);
          break;
        }
        out += `[${sheet}.${plainA1(a)}${b ? ':.' + plainA1(b) : ''}]`;
        break;
      }
      case 'fn': {
        source += t.v;
        let name = t.v.toUpperCase();
        if (name.startsWith('_XLFN.')) name = name.slice(6);
        if (name.startsWith('_XLWS.')) name = name.slice(6);
        if (name.startsWith('_XLUDF.')) setFail('macro', `benutzerdefinierte Funktion ${t.v.slice(7)}`);
        else if (!FUNCTIONS.has(name)) setFail('function', name);
        out += name;
        break;
      }
      case 'name': {
        source += t.v;
        const up = t.v.toUpperCase();
        if (up === 'TRUE' || up === 'FALSE') out += `${up}()`;
        else setFail('syntax', `benannter Bereich ${t.v}`);
        break;
      }
      case 'op':
        source += t.v;
        if (t.v === ',') out += ';';
        else if (t.v === ';' || t.v === ':') setFail('syntax', `Operator ${t.v}`);
        else out += t.v;
        break;
    }
  });
  if (fail) return { source, result: fail };
  return { source, result: checkTranslated(out) };
}

// ---------------------------------------------------------------------------------------------
// Number formats
// ---------------------------------------------------------------------------------------------

type Kind = 'float' | 'percentage' | 'currency' | 'date' | 'time' | 'datetime';

const BUILTIN: Record<number, Kind> = {
  9: 'percentage', 10: 'percentage', 5: 'currency', 6: 'currency', 7: 'currency', 8: 'currency',
  14: 'date', 15: 'date', 16: 'date', 17: 'date', 22: 'datetime', 18: 'time', 19: 'time', 20: 'time', 21: 'time', 45: 'time', 46: 'time', 47: 'time',
};

function formatKind(code: string): { kind: Kind; unit: string | null; decimals: number | null } {
  const bare = code.replace(/"[^"]*"/g, '').replace(/\\./g, '');
  const currencyTag = /\[\$([^\]-]*)(?:-[^\]]*)?\]/.exec(bare);
  const noBrackets = bare.replace(/\[[^\]]*\]/g, '');
  const section = noBrackets.split(';')[0]!;
  const dec = /\.(0+)/.exec(section);
  const decimals = dec ? dec[1]!.length : /[0#]/.test(section) ? 0 : null;
  if (/[yd]/i.test(section) && /[hs]/i.test(section)) return { kind: 'datetime', unit: null, decimals: null };
  if (/[yd]/i.test(section)) return { kind: 'date', unit: null, decimals: null };
  if (/[hs]/i.test(section)) return { kind: 'time', unit: null, decimals: null };
  if (/%/.test(section)) return { kind: 'percentage', unit: null, decimals };
  const sym = currencyTag?.[1] ?? (/€/.test(code) ? '€' : /\$/.test(section) ? '$' : null);
  if (sym) return { kind: 'currency', unit: sym.includes('€') || sym === 'EUR' ? 'EUR' : sym.includes('$') || sym === 'USD' ? 'USD' : sym.includes('£') ? 'GBP' : sym.trim() || null, decimals };
  return { kind: 'float', unit: null, decimals };
}

/** Calendar-correct serial of an Excel serial (1900 system with its leap-year error, or 1904). */
export function serialFromExcel(n: number, date1904: boolean): number | null {
  if (date1904) return n + 1462;
  if (n >= 61) return n;
  if (n >= 1 && n < 60) return n + 1;
  if (n >= 60 && n < 61) return null; // 1900-02-29 does not exist
  if (n >= 0 && n < 1) return n; // time only
  return null;
}

// ---------------------------------------------------------------------------------------------
// Workbook
// ---------------------------------------------------------------------------------------------

export async function readXlsx(bytes: Uint8Array): Promise<SourceWorkbook> {
  const entries = await readZip(bytes);
  const wbXml = xml(entries, 'xl/workbook.xml');
  if (!wbXml) throw new Error('xlsx: xl/workbook.xml missing');
  const rels = xml(entries, 'xl/_rels/workbook.xml.rels');
  const relTarget = new Map<string, string>();
  if (rels) {
    const list = rels.getElementsByTagNameNS(PKG_REL, 'Relationship');
    for (let i = 0; i < list.length; i++) {
      const r = list.item(i) as XEl;
      const target = r.getAttribute('Target') ?? '';
      relTarget.set(r.getAttribute('Id') ?? '', target.startsWith('/') ? target.slice(1) : `xl/${target}`);
    }
  }
  const date1904 = all(wbXml, 'workbookPr').some((e) => ['1', 'true'].includes(e.getAttribute('date1904') ?? ''));
  const sheetEls = all(wbXml, 'sheet');
  const names = sheetEls.map((s) => s.getAttribute('name') ?? 'Tabelle');
  const ids = sheetIds(names);

  const shared: string[] = [];
  const sst = xml(entries, 'xl/sharedStrings.xml');
  if (sst) for (const si of kids(sst, 'si')) shared.push(all(si, 't').map((t) => t.textContent ?? '').join(''));

  const styles = xml(entries, 'xl/styles.xml');
  const customFormats = new Map<number, string>();
  const xfFormat: number[] = [];
  if (styles) {
    for (const nf of all(styles, 'numFmt')) customFormats.set(Number(nf.getAttribute('numFmtId')), nf.getAttribute('formatCode') ?? '');
    const cellXfs = all(styles, 'cellXfs')[0];
    if (cellXfs) for (const xf of kids(cellXfs, 'xf')) xfFormat.push(Number(xf.getAttribute('numFmtId') ?? '0'));
  }
  const kindOf = (s: string | null): { kind: Kind; unit: string | null; decimals: number | null } => {
    const id = xfFormat[Number(s ?? '0')] ?? 0;
    const code = customFormats.get(id);
    if (code !== undefined) return formatKind(code);
    const k = BUILTIN[id];
    if (k) return { kind: k, unit: k === 'currency' ? 'USD' : null, decimals: id === 10 ? 2 : id === 9 ? 0 : k === 'currency' ? (id === 5 || id === 6 ? 0 : 2) : null };
    return { kind: 'float', unit: null, decimals: id === 2 || id === 4 ? 2 : id === 1 || id === 3 ? 0 : null };
  };

  const style = numberStyle('de');
  const sheets: SourceSheet[] = [];
  const notes: Array<{ sheet: string; row: number; col: number; text: string }> = [];
  sheetEls.forEach((sheetEl, si) => {
    const name = names[si]!;
    const rid = sheetEl.getAttributeNS(REL, 'id') ?? sheetEl.getAttribute('r:id') ?? '';
    const path = relTarget.get(rid) ?? `xl/worksheets/sheet${si + 1}.xml`;
    const ws = xml(entries, path);
    const cells: SourceCell[] = [];
    if (!ws) {
      sheets.push({ name, cells });
      return;
    }
    const sharedMasters = new Map<string, { text: string; row: number; col: number }>();
    const merges = new Map<string, { rows: number; cols: number }>();
    const covered = new Set<string>();
    for (const m of all(ws, 'mergeCell')) {
      const [from, to] = (m.getAttribute('ref') ?? '').split(':');
      const a = readCell(from ?? '');
      const b = readCell(to ?? from ?? '');
      if (!a || !b) continue;
      merges.set(`${a.ref.row}:${a.ref.col}`, { rows: b.ref.row - a.ref.row + 1, cols: b.ref.col - a.ref.col + 1 });
      for (let r = a.ref.row; r <= b.ref.row; r++) for (let c = a.ref.col; c <= b.ref.col; c++) if (r !== a.ref.row || c !== a.ref.col) covered.add(`${r}:${c}`);
    }
    for (const c of all(ws, 'c')) {
      const ref = readCell(c.getAttribute('r') ?? '');
      if (!ref) continue;
      const { row, col } = ref.ref;
      if (covered.has(`${row}:${col}`)) continue;
      const t = c.getAttribute('t');
      const v = kids(c, 'v')[0]?.textContent ?? null;
      const fEl = kids(c, 'f')[0] ?? null;
      let formulaSource: string | null = null;
      let translated: SourceCell['translated'] = null;
      if (fEl) {
        const ft = fEl.getAttribute('t');
        const text = fEl.textContent ?? '';
        if (ft === 'array' || ft === 'dataTable') {
          formulaSource = `{=${text}}`;
          translated = { ok: false, reason: 'syntax', detail: ft === 'array' ? 'Matrixformel' : 'Datentabelle (Mehrfachoperation)' };
        } else if (ft === 'shared') {
          const si2 = fEl.getAttribute('si') ?? '';
          if (text !== '') sharedMasters.set(si2, { text, row, col });
          const master = sharedMasters.get(si2);
          if (!master) {
            formulaSource = '=?';
            translated = { ok: false, reason: 'other', detail: 'gemeinsame Formel ohne Grundformel' };
          } else {
            const tr = translateExcelFormula(master.text, name, ids, row - master.row, col - master.col);
            formulaSource = tr.source;
            translated = tr.result;
          }
        } else {
          const tr = translateExcelFormula(text, name, ids);
          formulaSource = tr.source;
          translated = tr.result;
        }
      }
      let type: SourceCell['type'] = null;
      let value: string | null = null;
      let unit: string | null = null;
      let display = '';
      if (t === 's') {
        type = 'string';
        value = shared[Number(v)] ?? '';
        display = value;
      } else if (t === 'inlineStr') {
        type = 'string';
        value = all(c, 't').map((x) => x.textContent ?? '').join('');
        display = value;
      } else if (t === 'str') {
        if (v !== null) {
          type = 'string';
          value = v;
          display = v;
        }
      } else if (t === 'b') {
        if (v !== null) {
          type = 'boolean';
          value = v === '1' ? 'true' : 'false';
          display = v === '1' ? style.trueText : style.falseText;
        }
      } else if (t === 'e') {
        if (v !== null) {
          type = 'error';
          value = isErrorName(v) ? v : '#N/A';
          display = v;
        }
      } else if (v !== null && v !== '' && Number.isFinite(Number(v))) {
        const n = Number(v);
        const k = kindOf(c.getAttribute('s'));
        if (k.kind === 'date' || k.kind === 'datetime' || (k.kind === 'time' && n >= 1)) {
          const s = serialFromExcel(n, date1904);
          if (s !== null && isValidSerial(s)) {
            type = 'date';
            value = isoFromSerial(s);
            display = displayValue(s, 'date', { style, decimals: null, unit: null }).text;
          } else {
            type = 'float';
            value = canonicalNumber(n);
            display = value;
            notes.push({
              sheet: name,
              row,
              col,
              text:
                n >= 60 && n < 61 && !date1904
                  ? 'Datumsserie 60 bedeutet im 1900-System den 29.02.1900, den es nicht gibt; als Zahl übernommen (HPF-IMP-004)'
                  : `Datumsserie ${v} liegt außerhalb des Datumsbereichs; als Zahl übernommen`,
            });
          }
        } else if (k.kind === 'time') {
          type = 'time';
          value = durationFromFraction(n);
          display = displayValue(n, 'time', { style, decimals: null, unit: null }).text;
        } else {
          type = k.kind === 'percentage' ? 'percentage' : k.kind === 'currency' ? 'currency' : 'float';
          unit = k.kind === 'currency' ? k.unit : null;
          value = canonicalNumber(n);
          display = displayValue(n, type, { style, decimals: k.decimals, unit }).text;
        }
      }
      if (formulaSource === null && type === null) continue;
      const span = merges.get(`${row}:${col}`);
      cells.push({ row, col, formula: formulaSource, translated, type, value, unit, text: display, colspan: span?.cols ?? 1, rowspan: span?.rows ?? 1 });
    }
    sheets.push({ name, cells });
  });
  const macros = entries.filter((e) => /vbaProject\.bin$|^xl\/macrosheets\/|^xl\/activeX\//i.test(e.name)).map((e) => e.name);
  return { format: 'xlsx', sheets, macros, notes };
}

