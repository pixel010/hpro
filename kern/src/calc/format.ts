/**
 * Stored form and display of cell values.
 *
 * Stored form (`data-hp-value`, `data-hp-type`) is normative (HPF-STO-002, HPF-ERR-001). The
 * display text is presentation (HPF-STO-005: it must round to the stored value); this module
 * derives it from the document language and from the number of decimals the author used in the
 * cell, so a recalculated `803,25 €` stays in that form. The display rules are a convention of
 * this calculator, not part of the specification.
 */
import { clockParts, daysInMonth, durationFromFraction, isValidSerial, isoFromSerial, partsFromSerial, serialFromParts } from './dates.js';
import type { ValueType } from './model.js';
import { roundDecimal } from './numbers.js';
import { EMPTY, canonicalNumber, isError, type Scalar } from './values.js';

export interface StoredValue {
  readonly type: ValueType;
  readonly value: string;
}

/** `data-hp-type` and `data-hp-value` for a computed value; numbers keep the declared display type. */
export function storedForm(v: Scalar, declared: ValueType | null): StoredValue {
  if (isError(v)) return { type: 'error', value: v.name };
  if (typeof v === 'boolean') return { type: 'boolean', value: v ? 'true' : 'false' };
  if (typeof v === 'string') return { type: 'string', value: v };
  if (v === EMPTY) return { type: declared === 'string' ? 'string' : 'float', value: declared === 'string' ? '' : '0' };
  switch (declared) {
    case 'percentage':
    case 'currency':
      return { type: declared, value: canonicalNumber(v) };
    case 'date':
      return isValidSerial(v) ? { type: 'date', value: isoFromSerial(v) } : { type: 'float', value: canonicalNumber(v) };
    case 'time':
      return v >= 0 ? { type: 'time', value: durationFromFraction(v) } : { type: 'float', value: canonicalNumber(v) };
    default:
      return { type: 'float', value: canonicalNumber(v) };
  }
}

/** Number style of a document language. */
export interface NumberStyle {
  readonly decimal: string;
  readonly group: string;
  readonly percentSpace: boolean;
  readonly currencyAfter: boolean;
  readonly dateOrder: 'dmy' | 'iso';
  readonly trueText: string;
  readonly falseText: string;
}

/** U+202F, the group separator of French and other languages. */
const NARROW_NBSP = String.fromCharCode(0x202f);
const COMMA_LANGUAGES = new Set(['de', 'nl', 'it', 'es', 'pt', 'da', 'nb', 'nn', 'no', 'sv', 'fi', 'fr', 'pl', 'cs', 'sk', 'sl', 'hr', 'hu', 'ro', 'tr', 'el', 'ru', 'uk', 'id']);

export function numberStyle(language: string | null | undefined): NumberStyle {
  const primary = (language ?? '').toLowerCase().split('-')[0] ?? '';
  if (primary === 'de') return { decimal: ',', group: '.', percentSpace: true, currencyAfter: true, dateOrder: 'dmy', trueText: 'WAHR', falseText: 'FALSCH' };
  if (COMMA_LANGUAGES.has(primary)) return { decimal: ',', group: NARROW_NBSP, percentSpace: true, currencyAfter: true, dateOrder: 'dmy', trueText: 'TRUE', falseText: 'FALSE' };
  return { decimal: '.', group: ',', percentSpace: false, currencyAfter: false, dateOrder: 'iso', trueText: 'TRUE', falseText: 'FALSE' };
}

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', JPY: '¥', CHF: 'CHF' };

/** Decimals shown in a display text, judged with the document's decimal separator. */
export function decimalsShown(text: string, style: NumberStyle): number | null {
  const digits = text.replace(/[^0-9.,]/g, '');
  if (!/[0-9]/.test(digits)) return null;
  const i = digits.lastIndexOf(style.decimal);
  if (i < 0) return 0;
  const after = digits.slice(i + 1);
  return /^[0-9]+$/.test(after) ? after.length : 0;
}

/** Decimal digits of a non-negative number with grouping, without exponent notation. */
function plainDigits(x: number, decimals: number | null): { int: string; frac: string } {
  const rounded = decimals === null ? x : roundDecimal(x, decimals, 'half-away');
  let s: string;
  if (decimals === null) {
    const c = canonicalNumber(rounded);
    s = /e/.test(c) ? rounded.toFixed(Math.min(20, Math.max(0, 15 - Math.floor(Math.log10(Math.abs(rounded) || 1))))).replace(/\.?0+$/, '') : c;
  } else {
    s = rounded.toFixed(Math.min(100, Math.max(0, decimals)));
  }
  const [int = '0', frac = ''] = s.replace('-', '').split('.');
  return { int, frac };
}

/** Formats a number with the document's separators. */
export function formatNumber(x: number, style: NumberStyle, decimals: number | null): string {
  const negative = x < 0 || Object.is(x, -0) ? x < 0 : false;
  const { int, frac } = plainDigits(Math.abs(x), decimals);
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, style.group);
  return (negative && (/[1-9]/.test(int) || /[1-9]/.test(frac)) ? '-' : '') + grouped + (frac ? style.decimal + frac : '');
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export interface DisplayOptions {
  readonly style: NumberStyle;
  /** Decimals as found in the document; null: as many as the value needs. */
  readonly decimals: number | null;
  readonly unit: string | null;
}

export interface Display {
  readonly text: string;
  /** For dates and times: value of the `datetime` attribute of a `time` element (HPF-DAT-008). */
  readonly datetime?: string;
}

/** Display text of a value of the given stored type. */
export function displayValue(v: Scalar, type: ValueType, o: DisplayOptions): Display {
  if (isError(v)) return { text: v.name };
  if (typeof v === 'boolean') return { text: v ? o.style.trueText : o.style.falseText };
  if (typeof v === 'string') return { text: v };
  if (v === EMPTY) return { text: '' };
  const { style } = o;
  switch (type) {
    case 'currency': {
      const amount = formatNumber(v, style, o.decimals ?? 2);
      const sym = o.unit ? (CURRENCY_SYMBOLS[o.unit] ?? o.unit) : '';
      if (!sym) return { text: amount };
      return { text: style.currencyAfter ? `${amount} ${sym}` : `${sym}${amount}` };
    }
    case 'percentage': {
      const amount = formatNumber(roundDecimal(v * 100, 10, 'half-away'), style, o.decimals);
      return { text: style.percentSpace ? `${amount} %` : `${amount}%` };
    }
    case 'date': {
      if (!isValidSerial(v)) return { text: formatNumber(v, style, o.decimals) };
      const iso = isoFromSerial(v);
      const { y, m, d } = partsFromSerial(v);
      const t = clockParts(v);
      const time = iso.includes('T') ? ` ${pad(t.h)}:${pad(t.min)}` : '';
      const text = style.dateOrder === 'dmy' ? `${pad(d)}.${pad(m)}.${pad(y, 4)}${time}` : `${iso.slice(0, 10)}${time}`;
      return { text, datetime: iso };
    }
    case 'time': {
      if (v < 0) return { text: formatNumber(v, style, o.decimals) };
      const t = clockParts(v);
      const days = Math.floor(v);
      const h = t.h + days * 24;
      const text = t.s === 0 ? `${pad(h)}:${pad(t.min)}` : `${pad(h)}:${pad(t.min)}:${pad(t.s)}`;
      return { text, datetime: durationFromFraction(v) };
    }
    default:
      return { text: formatNumber(v, style, o.decimals) };
  }
}

/**
 * Reads a user's entry in an input cell (HPF-STO-011): canonical form or the user's writing
 * (`42,5`, `1.234,50`, `19 %`, `€ 12`), dates in ISO form. Returns null when the entry does
 * not fit the type.
 */
export function parseUserEntry(raw: string, type: ValueType | null, style: NumberStyle): Scalar | null {
  const text = raw.trim();
  if (text === '') return EMPTY;
  switch (type) {
    case 'string':
      return raw;
    case 'boolean': {
      const t = text.toLowerCase();
      if (['true', 'wahr', 'ja', '1', style.trueText.toLowerCase()].includes(t)) return true;
      if (['false', 'falsch', 'nein', '0', style.falseText.toLowerCase()].includes(t)) return false;
      return null;
    }
    case 'date': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text) ?? null;
      const dmy = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
      let y: number, mo: number, d: number;
      if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      else if (dmy && style.dateOrder === 'dmy') [y, mo, d] = [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])];
      else return null;
      const iso = `${pad(y, 4)}-${pad(mo)}-${pad(d)}`;
      return isoToSerial(iso);
    }
    case 'time': {
      const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
      if (!m) return null;
      const [h, mi, s] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
      if (mi > 59 || s > 59) return null;
      return (h * 3600 + mi * 60 + s) / 86400;
    }
    default: {
      const percent = /%\s*$/.test(text);
      let t = text.replace(/%\s*$/, '').replace(/[€$£¥]|\b[A-Z]{3}\b/g, '').replace(/[\s\u00a0\u202f]/g, '');
      if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) {
        // canonical form: a single dot is the decimal point in every language
      } else {
        const g = style.group === NARROW_NBSP ? '' : style.group;
        if (g && t.split(g).length > 1 && /^[+-]?\d{1,3}(\D\d{3})+/.test(t)) t = t.split(g).join('');
        if (style.decimal !== '.') t = t.replace(style.decimal, '.');
        if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null;
      }
      const n = Number(t);
      if (!Number.isFinite(n)) return null;
      if (type === 'percentage') return n / 100;
      return percent ? n / 100 : n;
    }
  }
}

function isoToSerial(iso: string): number | null {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  const serial = serialFromParts(y, m, d);
  return isValidSerial(serial) ? serial : null;
}
