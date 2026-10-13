/**
 * Minimal DER writer, the counterpart of `der.ts`.
 *
 * Used for the few structures the signer builds itself: `IssuerSerialV2` in XAdES and the
 * self-signed test certificate. Only definite lengths and the universal types needed there.
 */
import { concat, utf8 } from './bytes.js';
import { DerError, TAG } from './der.js';

function length(n: number): Uint8Array {
  if (n < 0x80) return Uint8Array.of(n);
  const bytes: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff);
  if (bytes.length > 4) throw new DerError('DER value too long');
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

/** One TLV with the given identifier octet; `content` parts are concatenated. */
export function tlv(tag: number, ...content: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const value = concat(content);
  return concat([Uint8Array.of(tag), length(value.length), value]);
}

export const sequence = (...items: readonly Uint8Array[]) => tlv(TAG.SEQUENCE, ...items);
export const set = (...items: readonly Uint8Array[]) => tlv(TAG.SET, ...items);
export const octetString = (data: Uint8Array) => tlv(TAG.OCTET_STRING, data);
export const nullValue = () => tlv(TAG.NULL);
export const utf8String = (s: string) => tlv(TAG.UTF8_STRING, utf8(s));
export const boolean = (v: boolean) => tlv(TAG.BOOLEAN, Uint8Array.of(v ? 0xff : 0));

/** Constructed context-specific tag `[n]` (explicit tagging). */
export const explicit = (n: number, ...content: readonly Uint8Array[]) => tlv(0xa0 | n, ...content);

/** BIT STRING with `unused` padding bits in the last octet. */
export function bitString(data: Uint8Array, unused = 0): Uint8Array<ArrayBuffer> {
  return tlv(TAG.BIT_STRING, Uint8Array.of(unused), data);
}

/** PrintableString; throws on characters outside its repertoire. */
export function printableString(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9 '()+,\-./:=?]*$/.test(s)) throw new DerError(`not a PrintableString: ${s}`);
  return tlv(TAG.PRINTABLE_STRING, utf8(s));
}

/** INTEGER from unsigned big-endian magnitude bytes (minimal encoding, sign octet added). */
export function unsignedInteger(magnitude: Uint8Array): Uint8Array<ArrayBuffer> {
  let start = 0;
  while (start < magnitude.length - 1 && magnitude[start] === 0) start++;
  let v = magnitude.subarray(start);
  if (v.length === 0) v = Uint8Array.of(0);
  return tlv(TAG.INTEGER, (v[0]! & 0x80) !== 0 ? concat([Uint8Array.of(0), v]) : v);
}

export function smallInteger(n: number): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(n) || n < 0 || n > 0x7fffffff) throw new DerError(`integer out of range: ${n}`);
  const bytes: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff);
  return unsignedInteger(Uint8Array.from(bytes));
}

export function objectIdentifier(dotted: string): Uint8Array<ArrayBuffer> {
  const parts = dotted.split('.').map((p) => {
    if (!/^\d+$/.test(p)) throw new DerError(`invalid OID ${dotted}`);
    return Number(p);
  });
  if (parts.length < 2 || parts[0]! > 2) throw new DerError(`invalid OID ${dotted}`);
  const arcs = [parts[0]! * 40 + parts[1]!, ...parts.slice(2)];
  const out: number[] = [];
  for (const arc of arcs) {
    const group = [arc & 0x7f];
    for (let v = Math.floor(arc / 128); v > 0; v = Math.floor(v / 128)) group.unshift(0x80 | (v & 0x7f));
    out.push(...group);
  }
  return tlv(TAG.OID, Uint8Array.from(out));
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** UTCTime for 1950–2049, GeneralizedTime otherwise (RFC 5280, 4.1.2.5). Seconds precision. */
export function time(date: Date): Uint8Array<ArrayBuffer> {
  const y = date.getUTCFullYear();
  const rest = `${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  if (y >= 1950 && y < 2050) return tlv(TAG.UTC_TIME, utf8(pad(y % 100) + rest));
  return tlv(TAG.GENERALIZED_TIME, utf8(pad(y, 4) + rest));
}

/** GeneralizedTime `YYYYMMDDhhmmss[.fff]Z` (RFC 5280 profile; fractions only when non-zero, RFC 3161 §2.4.2). */
export function generalizedTime(date: Date, withMillis = false): Uint8Array<ArrayBuffer> {
  const ms = date.getUTCMilliseconds();
  const frac = withMillis && ms !== 0 ? '.' + String(ms).padStart(3, '0').replace(/0+$/, '') : '';
  const s = `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}${frac}Z`;
  return tlv(TAG.GENERALIZED_TIME, utf8(s));
}

/** Primitive context-specific tag `[n]` (implicit tagging of a primitive type). */
export const implicit = (n: number, value: Uint8Array) => tlv(0x80 | n, value);

/** ECDSA signature r‖s (WebCrypto, XML-DSig) to the DER `ECDSA-Sig-Value` used in X.509. */
export function ecdsaRawToDer(raw: Uint8Array): Uint8Array<ArrayBuffer> {
  if (raw.length === 0 || raw.length % 2 !== 0) throw new DerError('ECDSA signature has odd length');
  const half = raw.length / 2;
  return sequence(unsignedInteger(raw.subarray(0, half)), unsignedInteger(raw.subarray(half)));
}
