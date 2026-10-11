#!/usr/bin/env node
/**
 * Reference values for Teil 3 (docs/spezifikation/03-tabellen-und-formeln.md, Abschnitt 16).
 *
 * Computes, from first principles and the rules of Teil 3 (binary64 arithmetic, canonical number
 * form = ECMAScript Number::toString, rounding on the canonical decimal form, epoch 1899-12-30),
 * the values the specification lists as R1…Rn. check-formeln.mjs compares the table in the
 * document against these values; this file is deliberately not a formula evaluator.
 *
 * Usage: node scripts/formeln-referenzwerte.mjs   (prints the values; exit 0)
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/** Canonical number form (HPF-NUM-002): shortest round-trip, -0 written as 0. */
export function canonical(x) {
  if (Object.is(x, -0)) return '0';
  return String(x);
}

/** Days since 1899-12-30 for a proleptic Gregorian date (HPF-DAT-001). */
export function serial(year, month, day) {
  const ms = Date.UTC(year, month - 1, day); // Date.UTC rolls over months and days (HPF-DAT-006)
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((ms - epoch) / 86400000);
}

/** Expands the canonical form into sign, integer digits and fraction digits (exact decimal). */
function decimalDigits(x) {
  let s = canonical(x);
  let sign = '';
  if (s.startsWith('-')) { sign = '-'; s = s.slice(1); }
  let mant = s, exp = 0;
  const e = s.indexOf('e');
  if (e >= 0) { mant = s.slice(0, e); exp = Number(s.slice(e + 1)); }
  let [int, frac = ''] = mant.split('.');
  // shift decimal point by exp
  if (exp > 0) { const move = Math.min(exp, frac.length); int += frac.slice(0, move); frac = frac.slice(move); int += '0'.repeat(exp - move); }
  if (exp < 0) { const move = Math.min(-exp, int.length); frac = int.slice(int.length - move) + frac; int = int.slice(0, int.length - move); frac = '0'.repeat(-exp - move) + frac; }
  return { sign, int: int.replace(/^0+(?=\d)/, ''), frac };
}

/** ROUND / ROUNDUP / ROUNDDOWN on the canonical decimal form (HPF-NUM-004). */
export function roundDecimal(x, digits = 0, mode = 'half-away') {
  const { sign, int, frac } = decimalDigits(x);
  const all = int + frac;                 // digit string
  const point = int.length;               // position of the decimal point in `all`
  const keep = point + digits;            // number of digits to keep
  let kept, rest;
  if (keep <= 0) { kept = ''; rest = '0'.repeat(-keep) + all; }
  else if (keep >= all.length) { kept = all; rest = ''; }
  else { kept = all.slice(0, keep); rest = all.slice(keep); }
  let n = BigInt(kept === '' ? '0' : kept);
  const restNonZero = /[1-9]/.test(rest);
  if (mode === 'half-away') { if (rest !== '' && rest[0] >= '5') n += 1n; }
  else if (mode === 'up') { if (restNonZero) n += 1n; }
  // mode 'down': truncate
  let str = n.toString();
  // reinsert the decimal point: `keep` digits before point when keep>0
  if (digits > 0) {
    str = str.padStart(digits + 1, '0');
    str = str.slice(0, str.length - digits) + '.' + str.slice(str.length - digits);
  } else if (digits < 0) {
    str = str + '0'.repeat(-digits);
  }
  const v = Number(str);
  return sign === '-' ? -v : v;
}

export function intFloor(x) { return Math.floor(x); }
export function trunc(x) { return roundDecimal(x, 0, 'down'); }
export function mod(a, b) { return a - b * Math.floor(a / b); }
export function time(h, m, s) { return ((h * 60 * 60) + (m * 60) + s) / (24 * 60 * 60); }

export function weekday(serialNo, type = 1) {
  // 1899-12-30 was a Saturday. Type 1: Sunday=1…Saturday=7
  const dow = (6 + serialNo) % 7; // 0=Sunday
  if (type === 1) return dow + 1;
  if (type === 2 || type === 11) return dow === 0 ? 7 : dow;
  if (type === 3) return (dow + 6) % 7;
  throw new Error('type');
}

export function isoWeekNum(serialNo) {
  const d = new Date(Date.UTC(1899, 11, 30) + serialNo * 86400000);
  const target = new Date(d.getTime());
  const dayNr = (d.getUTCDay() + 6) % 7; // Monday=0
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target - firstThursday;
  return 1 + Math.round((diff / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

export function edate(serialNo, months) {
  const d = new Date(Date.UTC(1899, 11, 30) + serialNo * 86400000);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  const total = y * 12 + m + Math.trunc(months);
  const ny = Math.floor(total / 12), nm = total - ny * 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return serial(ny, nm + 1, Math.min(day, last));
}

export function pmt(rate, nper, pv, fv = 0, type = 0) {
  if (rate === 0) return -(pv + fv) / nper;
  const f = (1 + rate) ** nper;
  return -(pv * f + fv) * rate / ((1 + rate * type) * (f - 1));
}

/** The reference values, keyed like the table in Abschnitt 16. */
export function referenceValues() {
  const tenTenths = Array(10).fill(0.1).reduce((a, b) => a + b, 0);
  const r = {
    R1: canonical(serial(2026, 10, 11)),
    R2: canonical(serial(1900, 3, 1)),
    R3: canonical(serial(1900, 1, 1)),
    R4: canonical(serial(9999, 12, 31)),
    R5: canonical(serial(2000, 2, 29)),
    R6: canonical(0.1 + 0.2),
    R7: (0.1 + 0.2) === 0.3 ? 'TRUE' : 'FALSE',
    R8: canonical(1 - 0.9 - 0.1),
    R9: canonical(roundDecimal(2.675, 2)),
    R10: canonical(roundDecimal(1.005, 2)),
    R11: canonical(roundDecimal(-2.5, 0)),
    R12: canonical(roundDecimal(1234.5678, -2)),
    R13: canonical(1e21),
    R14: canonical(0.1 * 3),
    R15: canonical(time(8, 30, 0)),
    R16: canonical(mod(-7, 3)),
    R17: canonical(intFloor(-2.5)),
    R18: canonical(trunc(-2.5)),
    R19: canonical(serial(2026, 13, 1)),
    R20: canonical(serial(2026, 2, 30)),
    R21: canonical(edate(serial(2026, 1, 31), 1)),
    R22: canonical(weekday(serial(2026, 10, 11), 1)),
    R23: canonical(isoWeekNum(serial(2026, 10, 11))),
    R24: canonical(tenTenths),
    R25: canonical(2 ** 53 + 1),
    R26: canonical(1e-7),
    R27: canonical(-0),
    R28: canonical(roundDecimal(2.675, 2, 'down')),
    R29: canonical(pmt(0.05 / 12, 360, 200000)),
    R30: canonical(serial(2026, 12, 31) - serial(2026, 1, 1)),
  };
  return r;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = referenceValues();
  for (const [k, v] of Object.entries(r)) console.log(`${k.padEnd(4)} ${v}`);
  console.log(`${Object.keys(r).length} reference values`);
}
