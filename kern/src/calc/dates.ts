/**
 * Date and time (part 3, section 6): a date is the number of days since 1899-12-30 (serial 0)
 * in the proleptic Gregorian calendar without special cases (HPF-DAT-001), valid from 0 to
 * 2958465 = 9999-12-31 (HPF-DAT-002). A time is the fraction of a day. Text is read only in ISO
 * forms (HPF-DAT-004). No time zone, no clock (HPF-DAT-005).
 */

export const MAX_SERIAL = 2958465;
/** Days from 1970-01-01 to 1899-12-30. */
const EPOCH_OFFSET = 25569;

/** Days since 1970-01-01 of a valid civil date (month 1–12); algorithm "days_from_civil". */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Civil date of a day count since 1970-01-01 ("civil_from_days"). */
function civilFromDays(z: number): { y: number; m: number; d: number } {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
}

/**
 * Serial of year/month/day with overflow resolved by counting on (HPF-DAT-006): month 13 is
 * January of the next year, day 30 of February is in March, month 0 is December before.
 */
export function serialFromParts(year: number, month: number, day: number): number {
  const total = year * 12 + (month - 1);
  const y = Math.floor(total / 12);
  const m = total - y * 12 + 1;
  return daysFromCivil(y, m, 1) + (day - 1) + EPOCH_OFFSET;
}

/** Civil date of the integer part of a serial. */
export function partsFromSerial(serial: number): { y: number; m: number; d: number } {
  return civilFromDays(Math.floor(serial) - EPOCH_OFFSET);
}

export function isValidSerial(serial: number): boolean {
  return serial >= 0 && serial < MAX_SERIAL + 1;
}

/** Time of day as fraction, the formula of TIME in OpenFormula (R15). */
export function timeFraction(h: number, m: number, s: number): number {
  return (h * 60 * 60 + m * 60 + s) / (24 * 60 * 60);
}

/**
 * Hours, minutes and seconds of the fractional part, from the time rounded to whole
 * milliseconds so that `TIME(8;30;0)` gives 8:30:00 despite binary fractions.
 */
export function clockParts(serial: number): { h: number; min: number; s: number; ms: number } {
  const frac = serial - Math.floor(serial);
  let ms = Math.round(frac * 86400000);
  if (ms >= 86400000) ms = 86400000 - 1;
  const totalSeconds = Math.floor(ms / 1000);
  return { h: Math.floor(totalSeconds / 3600), min: Math.floor(totalSeconds / 60) % 60, s: totalSeconds % 60, ms: ms % 1000 };
}

/**
 * Hours, minutes and whole seconds of the fractional part for HOUR, MINUTE and SECOND: fractions
 * of a second are cut off (8.2 SECOND). A value within 1 µs below a whole second counts as that
 * second, so that `TIME(8;30;0)` gives 8:30:00 despite binary fractions; 59.9999 s stays 59 s.
 */
export function clockFields(serial: number): { h: number; min: number; s: number } {
  const frac = serial - Math.floor(serial);
  let seconds = frac * 86400;
  const whole = Math.round(seconds);
  if (Math.abs(seconds - whole) < 1e-6) seconds = whole;
  const total = Math.min(86399, Math.floor(seconds));
  return { h: Math.floor(total / 3600), min: Math.floor(total / 60) % 60, s: total % 60 };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/;

function validDate(y: number, m: number, d: number): boolean {
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

function validTime(h: number, m: number, s: number): boolean {
  return h <= 23 && m <= 59 && s < 60;
}

export interface IsoParse {
  /** Serial of the date part, or null for a time without date. */
  readonly date: number | null;
  /** Fraction of the day (0 for a plain date). */
  readonly time: number;
}

/** The ISO forms of HPF-DAT-004; anything else (locale forms, two-digit years) is null. */
export function parseIsoDateTime(text: string): IsoParse | null {
  let m = DATE_RE.exec(text);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!validDate(y, mo, d)) return null;
    return { date: serialFromParts(y, mo, d), time: 0 };
  }
  m = DATETIME_RE.exec(text);
  if (m) {
    const [y, mo, d, h, mi] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])];
    const s = m[6] === undefined ? 0 : Number(m[6]);
    if (!validDate(y, mo, d) || !validTime(h, mi, s)) return null;
    return { date: serialFromParts(y, mo, d), time: timeFraction(h, mi, s) };
  }
  m = TIME_RE.exec(text);
  if (m) {
    const [h, mi] = [Number(m[1]), Number(m[2])];
    const s = m[3] === undefined ? 0 : Number(m[3]);
    if (!validTime(h, mi, s)) return null;
    return { date: null, time: timeFraction(h, mi, s) };
  }
  return null;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** `YYYY-MM-DD` of a serial, plus `THH:MM:SS` when the time is not midnight (HPF-STO-002). */
export function isoFromSerial(serial: number): string {
  const { y, m, d } = partsFromSerial(serial);
  const date = `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
  const t = clockParts(serial);
  if (t.h === 0 && t.min === 0 && t.s === 0 && t.ms === 0) return date;
  return `${date}T${pad(t.h)}:${pad(t.min)}:${pad(t.s)}`;
}

const DURATION_RE = /^PT(\d+)H(\d+)M(\d+(?:\.\d+)?)S$/;

/** Time value `PTnHnMnS` (HPF-STO-002) as fraction of a day. */
export function parseDuration(text: string): number | null {
  const m = DURATION_RE.exec(text);
  if (!m) return null;
  return timeFraction(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** Fraction of a day as `PTnHnMnS`, seconds to milliseconds. */
export function durationFromFraction(value: number): string {
  let ms = Math.round(value * 86400000);
  const neg = ms < 0;
  if (neg) ms = -ms;
  const h = Math.floor(ms / 3600000);
  const min = Math.floor(ms / 60000) % 60;
  const sec = (ms % 60000) / 1000;
  return `PT${pad(h)}H${pad(min)}M${sec < 10 ? '0' : ''}${String(sec)}S`;
}

/** Day of week 0 = Sunday … 6 = Saturday; 1899-12-30 was a Saturday. */
export function dayOfWeek(serial: number): number {
  return (((Math.floor(serial) + 6) % 7) + 7) % 7;
}

/** ISO 8601 week number (week starts Monday, week 1 contains 4 January). */
export function isoWeekNumber(serial: number): number {
  const s = Math.floor(serial);
  const mondayBased = (dayOfWeek(s) + 6) % 7; // Monday = 0
  const thursday = s - mondayBased + 3;
  const { y } = partsFromSerial(thursday);
  const jan1 = serialFromParts(y, 1, 1);
  return Math.floor((thursday - jan1) / 7) + 1;
}
