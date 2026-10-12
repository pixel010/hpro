/**
 * Rounding on the canonical decimal form (HPF-NUM-004): the digits of Number::toString are
 * rounded at the requested place, and the result is the binary64 number nearest to the rounded
 * decimal. So `ROUND(2.675;2)` is 2.68, as the author wrote it, although the binary value of
 * 2.675 lies slightly below.
 */
import { canonicalNumber } from './values.js';

export type RoundMode = 'half-away' | 'up' | 'down';

/**
 * Decimal form the rounding functions start from. `canonical` is the rule of part 3 version 0.1
 * (HPF-NUM-004, shortest round-trip form). `significant15` is the proposal of change request
 * HPC-0005 (first round to 15 significant digits, as common spreadsheet programs do); it is not
 * the default and exists so that the proposal can be measured against them.
 */
export type RoundingBasis = 'canonical' | 'significant15';

/** Sign, integer digits and fraction digits of the canonical form, exponent expanded. */
function decimalDigits(x: number): { negative: boolean; int: string; frac: string } {
  let s = canonicalNumber(x);
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);
  let mant = s;
  let exp = 0;
  const e = s.indexOf('e');
  if (e >= 0) {
    mant = s.slice(0, e);
    exp = Number(s.slice(e + 1));
  }
  const dot = mant.indexOf('.');
  let int = dot >= 0 ? mant.slice(0, dot) : mant;
  let frac = dot >= 0 ? mant.slice(dot + 1) : '';
  if (exp > 0) {
    const move = Math.min(exp, frac.length);
    int += frac.slice(0, move) + '0'.repeat(exp - move);
    frac = frac.slice(move);
  } else if (exp < 0) {
    const move = Math.min(-exp, int.length);
    frac = '0'.repeat(-exp - move) + int.slice(int.length - move) + frac;
    int = int.slice(0, int.length - move);
  }
  int = int.replace(/^0+(?=\d)/, '');
  return { negative, int: int === '' ? '0' : int, frac };
}

/** Rounds `x` to `digits` decimal places (negative: to tens, hundreds …). */
export function roundDecimal(x: number, digits: number, mode: RoundMode, basis: RoundingBasis = 'canonical'): number {
  if (x === 0 || !Number.isFinite(x)) return x === 0 ? 0 : x;
  if (basis === 'significant15') x = Number(x.toPrecision(15));
  if (digits > 400) return x;
  if (digits < -400) return 0;
  const { negative, int, frac } = decimalDigits(x);
  const all = int + frac;
  const keep = int.length + digits;
  let kept: string;
  let rest: string;
  if (keep <= 0) {
    kept = '';
    rest = '0'.repeat(-keep) + all;
  } else if (keep >= all.length) {
    kept = all;
    rest = '';
  } else {
    kept = all.slice(0, keep);
    rest = all.slice(keep);
  }
  let n = BigInt(kept === '' ? '0' : kept);
  if (mode === 'half-away') {
    if (rest !== '' && rest[0]! >= '5') n += 1n;
  } else if (mode === 'up') {
    if (/[1-9]/.test(rest)) n += 1n;
  }
  let str = n.toString();
  if (digits > 0) {
    // `kept` holds int.length + digits digits; with fewer fraction digits in `all` it is shorter.
    const fracDigits = Math.min(digits, Math.max(0, all.length - int.length));
    if (fracDigits > 0) {
      str = str.padStart(fracDigits + 1, '0');
      str = str.slice(0, str.length - fracDigits) + '.' + str.slice(str.length - fracDigits);
    }
  } else if (digits < 0) {
    str += '0'.repeat(-digits);
  }
  const v = Number(str);
  return negative ? -v : v;
}
