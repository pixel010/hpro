/**
 * Minimal DER reader for X.509 certificates and CMS structures.
 *
 * Only what signature validation needs: TLV parsing with definite lengths, OIDs, integers,
 * times and strings. Indefinite lengths (BER) are rejected because DER forbids them and
 * every structure checked here is DER by specification.
 */
import { toHex } from './bytes.js';

export class DerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DerError';
  }
}

export const TAG = {
  BOOLEAN: 0x01,
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  NULL: 0x05,
  OID: 0x06,
  UTF8_STRING: 0x0c,
  SEQUENCE: 0x30,
  SET: 0x31,
  PRINTABLE_STRING: 0x13,
  T61_STRING: 0x14,
  IA5_STRING: 0x16,
  UTC_TIME: 0x17,
  GENERALIZED_TIME: 0x18,
  BMP_STRING: 0x1e,
} as const;

export interface Der {
  /** Full identifier octet (class, constructed bit, tag number < 31). */
  readonly tag: number;
  /** The complete TLV encoding. */
  readonly raw: Uint8Array;
  /** The value octets. */
  readonly value: Uint8Array;
  readonly constructed: boolean;
}

/** Parses exactly one TLV at `offset`; returns it and the offset after it. */
export function readTlv(bytes: Uint8Array, offset = 0): { node: Der; end: number } {
  if (offset + 2 > bytes.length) throw new DerError('truncated TLV');
  const tag = bytes[offset]!;
  if ((tag & 0x1f) === 0x1f) throw new DerError('high tag numbers are not supported');
  let pos = offset + 1;
  let length = bytes[pos++]!;
  if (length === 0x80) throw new DerError('indefinite length is not DER');
  if (length > 0x80) {
    const n = length & 0x7f;
    if (n > 4 || pos + n > bytes.length) throw new DerError('unsupported length');
    length = 0;
    for (let i = 0; i < n; i++) length = length * 256 + bytes[pos++]!;
  }
  const end = pos + length;
  if (end > bytes.length) throw new DerError('TLV exceeds input');
  return { node: { tag, raw: bytes.subarray(offset, end), value: bytes.subarray(pos, end), constructed: (tag & 0x20) !== 0 }, end };
}

/** Parses a buffer that must hold exactly one TLV. */
export function parseDer(bytes: Uint8Array): Der {
  const { node, end } = readTlv(bytes, 0);
  if (end !== bytes.length) throw new DerError('trailing data after DER structure');
  return node;
}

export function children(node: Der): Der[] {
  if (!node.constructed) throw new DerError(`tag 0x${node.tag.toString(16)} is not constructed`);
  const out: Der[] = [];
  let pos = 0;
  while (pos < node.value.length) {
    const { node: child, end } = readTlv(node.value, pos);
    out.push(child);
    pos = end;
  }
  return out;
}

export function expect(node: Der | undefined, tag: number, what: string): Der {
  if (!node) throw new DerError(`missing ${what}`);
  if (node.tag !== tag) throw new DerError(`${what}: expected tag 0x${tag.toString(16)}, found 0x${node.tag.toString(16)}`);
  return node;
}

export function oid(node: Der): string {
  expect(node, TAG.OID, 'OID');
  const v = node.value;
  if (v.length === 0) throw new DerError('empty OID');
  const parts: number[] = [];
  let acc = 0;
  for (const b of v) {
    acc = acc * 128 + (b & 0x7f);
    if ((b & 0x80) === 0) {
      parts.push(acc);
      acc = 0;
    }
  }
  const first = parts.shift()!;
  const a = first < 80 ? Math.floor(first / 40) : 2;
  return [a, first - a * 40, ...parts].join('.');
}

/** Integer as lowercase hex without leading zero padding beyond DER's sign octet. */
export function integerHex(node: Der): string {
  expect(node, TAG.INTEGER, 'INTEGER');
  return toHex(node.value);
}


/** UTCTime or GeneralizedTime in the DER profile (`Z`, seconds present). */
export function time(node: Der): Date {
  const s = new TextDecoder().decode(node.value);
  let m: RegExpMatchArray | null;
  if (node.tag === TAG.UTC_TIME && (m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/))) {
    const yy = Number(m[1]);
    return new Date(Date.UTC(yy >= 50 ? 1900 + yy : 2000 + yy, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
  }
  if (node.tag === TAG.GENERALIZED_TIME && (m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?Z$/))) {
    // Fractions occur in RFC 3161 genTime; Date keeps milliseconds, finer digits are cut.
    const ms = m[7] ? Number(m[7].slice(0, 3).padEnd(3, '0')) : 0;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]), ms));
  }
  throw new DerError(`unsupported time encoding: ${s}`);
}

export function string(node: Der): string {
  switch (node.tag) {
    case TAG.UTF8_STRING:
    case TAG.PRINTABLE_STRING:
    case TAG.IA5_STRING:
    case TAG.T61_STRING:
      return new TextDecoder().decode(node.value);
    case TAG.BMP_STRING: {
      let s = '';
      for (let i = 0; i + 1 < node.value.length; i += 2) s += String.fromCharCode((node.value[i]! << 8) | node.value[i + 1]!);
      return s;
    }
    default:
      return `#${toHex(node.raw)}`;
  }
}

/** Content of a BIT STRING without unused bits. */
export function bitStringBytes(node: Der): Uint8Array {
  expect(node, TAG.BIT_STRING, 'BIT STRING');
  if (node.value[0] !== 0) throw new DerError('BIT STRING with unused bits');
  return node.value.subarray(1);
}

/** Context-specific tag number of a node, or -1. */
export function contextTag(node: Der): number {
  return (node.tag & 0xc0) === 0x80 ? node.tag & 0x1f : -1;
}

