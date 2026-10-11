/**
 * Minimal ZIP reader and writer for OCF containers.
 *
 * Written in-house rather than taken from a library because the container rules need
 * byte-level control (docs/05, section 6.1: DSS cannot set the EPUB mimetype, so html-Pro
 * writes the ZIP itself): `mimetype` stored at offset 0 without extra field, fixed
 * timestamps, fixed attributes and a fixed entry order so that equal input gives equal
 * output.
 *
 * Supported: methods 0 (stored) and 8 (deflated), data descriptors on read, UTF-8 names.
 * Not supported (rejected with an error): ZIP64, encryption, multi-disk archives.
 * Compression uses CompressionStream/DecompressionStream ('deflate-raw').
 */
import { concat, crc32, fromUtf8, utf8 } from './bytes.js';
import { ContainerError } from './errors.js';

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_EOCD_LOCATOR = 0x07064b50;

const METHOD_STORED = 0;
const METHOD_DEFLATED = 8;
const FLAG_ENCRYPTED = 0x0001;
const FLAG_UTF8 = 0x0800;
/** Version made by: 3 = Unix (attributes are host independent), 20 = ZIP 2.0. */
const VERSION_MADE_BY = (3 << 8) | 20;
/** Regular file, rw-r--r--. */
const EXTERNAL_ATTR = (0o100644 << 16) >>> 0;
const MAX_U16 = 0xffff;
const MAX_U32 = 0xffffffff;

export type Compression = 'store' | 'deflate' | 'auto';

export interface ZipEntryInput {
  readonly name: string;
  readonly data: Uint8Array;
  /** `auto` deflates and falls back to storing when deflate does not shrink the data. */
  readonly compression: Compression;
}

export interface ZipWriteOptions {
  /** Timestamp written for every entry (UTC components, 2-second resolution). */
  readonly modified: Date;
}

export interface ZipEntry {
  readonly name: string;
  readonly method: 'stored' | 'deflated';
  readonly flags: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly localHeaderOffset: number;
  readonly localExtraLength: number;
  readonly centralExtraLength: number;
  /** Uncompressed content, CRC-checked. */
  readonly data: Uint8Array;
}

export interface ZipReadOptions {
  readonly maxEntries?: number;
  readonly maxEntrySize?: number;
  readonly maxTotalSize?: number;
}

export const DEFAULT_READ_LIMITS = {
  maxEntries: 10_000,
  maxEntrySize: 256 * 1024 * 1024,
  maxTotalSize: 1024 * 1024 * 1024,
} as const;

/** Rejects names that could escape an extraction directory or are ambiguous. */
export function assertSafeZipPath(name: string): void {
  const bad =
    name.length === 0 ||
    name.startsWith('/') ||
    name.includes('\\') ||
    name.includes('\0') ||
    /^[A-Za-z]:/.test(name) ||
    name.split('/').some((seg, i, all) => seg === '..' || seg === '.' || (seg === '' && i < all.length - 1));
  if (bad) throw new ContainerError('zip-path', 'unsafe path in ZIP entry', name);
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = date.getUTCFullYear();
  if (year < 1980 || year > 2107) throw new ContainerError('input', `timestamp outside ZIP range: ${date.toISOString()}`);
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

async function pump(input: Uint8Array, transform: CompressionStream | DecompressionStream, limit?: number): Promise<Uint8Array<ArrayBuffer>> {
  const writer = transform.writable.getWriter();
  const written = writer.write(new Uint8Array(input)).then(() => writer.close());
  // Errors surface through the reader; keep the write side from becoming an unhandled rejection.
  written.catch(() => undefined);
  const reader = transform.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (limit !== undefined && total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new ContainerError('zip-limit', `inflated data exceeds declared size of ${limit} bytes`);
    }
    chunks.push(value);
  }
  await written;
  return concat(chunks);
}

export function deflateRaw(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  return pump(data, new CompressionStream('deflate-raw'));
}

export function inflateRaw(data: Uint8Array, maxSize: number): Promise<Uint8Array<ArrayBuffer>> {
  return pump(data, new DecompressionStream('deflate-raw'), maxSize);
}

/** Writes entries in the given order. The caller decides order and compression. */
export async function writeZip(entries: readonly ZipEntryInput[], options: ZipWriteOptions): Promise<Uint8Array<ArrayBuffer>> {
  if (entries.length > MAX_U16) throw new ContainerError('zip-unsupported', 'more than 65535 entries would need ZIP64');
  const { time, date } = dosDateTime(options.modified);
  const seen = new Set<string>();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    assertSafeZipPath(entry.name);
    if (seen.has(entry.name)) throw new ContainerError('input', 'duplicate ZIP entry', entry.name);
    seen.add(entry.name);

    const nameBytes = utf8(entry.name);
    const flags = /^[\x20-\x7e]*$/.test(entry.name) ? 0 : FLAG_UTF8;
    const crc = crc32(entry.data);
    let method = METHOD_STORED;
    let payload: Uint8Array = entry.data;
    if (entry.compression !== 'store') {
      const deflated = await deflateRaw(entry.data);
      if (entry.compression === 'deflate' || deflated.length < entry.data.length) {
        method = METHOD_DEFLATED;
        payload = deflated;
      }
    }
    const versionNeeded = method === METHOD_DEFLATED ? 20 : 10;
    if (payload.length >= MAX_U32 || entry.data.length >= MAX_U32 || offset >= MAX_U32) {
      throw new ContainerError('zip-unsupported', 'entry or archive larger than 4 GiB would need ZIP64', entry.name);
    }

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, SIG_LOCAL, true);
    local.setUint16(4, versionNeeded, true);
    local.setUint16(6, flags, true);
    local.setUint16(8, method, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, payload.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true); // no extra field, required for mimetype by OCF
    locals.push(new Uint8Array(local.buffer), nameBytes, payload);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, SIG_CENTRAL, true);
    central.setUint16(4, VERSION_MADE_BY, true);
    central.setUint16(6, versionNeeded, true);
    central.setUint16(8, flags, true);
    central.setUint16(10, method, true);
    central.setUint16(12, time, true);
    central.setUint16(14, date, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, payload.length, true);
    central.setUint32(24, entry.data.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint16(30, 0, true); // extra
    central.setUint16(32, 0, true); // comment
    central.setUint16(34, 0, true); // disk number start
    central.setUint16(36, 0, true); // internal attributes
    central.setUint32(38, EXTERNAL_ATTR, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), nameBytes);

    offset += 30 + nameBytes.length + payload.length;
  }

  const centralDir = concat(centrals);
  if (offset + centralDir.length >= MAX_U32) throw new ContainerError('zip-unsupported', 'archive larger than 4 GiB would need ZIP64');
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, SIG_EOCD, true);
  eocd.setUint16(4, 0, true);
  eocd.setUint16(6, 0, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralDir.length, true);
  eocd.setUint32(16, offset, true);
  eocd.setUint16(20, 0, true);
  return concat([...locals, centralDir, new Uint8Array(eocd.buffer)]);
}

function findEocd(view: DataView): number {
  const min = Math.max(0, view.byteLength - 22 - MAX_U16);
  for (let i = view.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === SIG_EOCD && i + 22 + view.getUint16(i + 20, true) === view.byteLength) return i;
  }
  throw new ContainerError('zip-structure', 'end of central directory not found');
}

/** Reads all entries, checks structure, sizes and CRC. Entries are returned in central directory order. */
export async function readZip(bytes: Uint8Array, options: ZipReadOptions = {}): Promise<ZipEntry[]> {
  const limits = { ...DEFAULT_READ_LIMITS, ...options };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22) throw new ContainerError('zip-structure', 'file too short for a ZIP archive');
  const eocd = findEocd(view);
  if (eocd >= 20 && view.getUint32(eocd - 20, true) === SIG_ZIP64_EOCD_LOCATOR) {
    throw new ContainerError('zip-unsupported', 'ZIP64 archives are not supported');
  }
  const diskNo = view.getUint16(eocd + 4, true);
  const cdDisk = view.getUint16(eocd + 6, true);
  const countDisk = view.getUint16(eocd + 8, true);
  const count = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (diskNo !== 0 || cdDisk !== 0 || countDisk !== count) throw new ContainerError('zip-unsupported', 'multi-disk archives are not supported');
  if (count === MAX_U16 || cdSize === MAX_U32 || cdOffset === MAX_U32) throw new ContainerError('zip-unsupported', 'ZIP64 archives are not supported');
  if (count > limits.maxEntries) throw new ContainerError('zip-limit', `too many entries: ${count} > ${limits.maxEntries}`);
  if (cdOffset + cdSize > eocd) throw new ContainerError('zip-structure', 'central directory outside archive');

  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  const spans: Array<{ start: number; end: number; name: string }> = [];
  let total = 0;
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cdOffset + cdSize || view.getUint32(p, true) !== SIG_CENTRAL) {
      throw new ContainerError('zip-structure', `bad central directory header #${i}`);
    }
    const flags = view.getUint16(p + 8, true);
    const methodCode = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const compressedSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    if (p + 46 + nameLen + extraLen + commentLen > cdOffset + cdSize) throw new ContainerError('zip-structure', `central directory header #${i} overruns`);
    const nameBytes = bytes.subarray(p + 46, p + 46 + nameLen);
    let name: string;
    try {
      name = fromUtf8(nameBytes);
    } catch {
      throw new ContainerError('zip-path', `entry name #${i} is not valid UTF-8`);
    }
    p += 46 + nameLen + extraLen + commentLen;

    assertSafeZipPath(name);
    if (names.has(name)) throw new ContainerError('zip-structure', 'duplicate entry name', name);
    names.add(name);
    if (flags & FLAG_ENCRYPTED) throw new ContainerError('zip-unsupported', 'encrypted entries are not supported', name);
    if (methodCode !== METHOD_STORED && methodCode !== METHOD_DEFLATED) {
      throw new ContainerError('zip-unsupported', `compression method ${methodCode} is not supported`, name);
    }
    if (compressedSize === MAX_U32 || size === MAX_U32 || localOffset === MAX_U32) {
      throw new ContainerError('zip-unsupported', 'ZIP64 entries are not supported', name);
    }
    if (size > limits.maxEntrySize) throw new ContainerError('zip-limit', `entry larger than ${limits.maxEntrySize} bytes`, name);
    total += size;
    if (total > limits.maxTotalSize) throw new ContainerError('zip-limit', `archive content larger than ${limits.maxTotalSize} bytes`);

    if (localOffset + 30 > cdOffset || view.getUint32(localOffset, true) !== SIG_LOCAL) {
      throw new ContainerError('zip-structure', 'bad local file header', name);
    }
    const localMethod = view.getUint16(localOffset + 8, true);
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const localName = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLen);
    if (localMethod !== methodCode || localNameLen !== nameLen || !localName.every((b, k) => b === nameBytes[k])) {
      throw new ContainerError('zip-structure', 'local header does not match central directory', name);
    }
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > cdOffset) throw new ContainerError('zip-structure', 'entry data overruns central directory', name);
    spans.push({ start: localOffset, end: dataEnd, name });

    const raw = bytes.subarray(dataStart, dataEnd);
    let data: Uint8Array;
    if (methodCode === METHOD_STORED) {
      if (compressedSize !== size) throw new ContainerError('zip-structure', 'stored entry with differing sizes', name);
      data = raw.slice();
    } else {
      try {
        data = await inflateRaw(raw, size);
      } catch (err) {
        if (err instanceof ContainerError) throw new ContainerError(err.code, err.message, name);
        throw new ContainerError('zip-structure', `cannot inflate: ${(err as Error).message}`, name);
      }
      if (data.length !== size) throw new ContainerError('zip-structure', `inflated size ${data.length} differs from declared ${size}`, name);
    }
    if (crc32(data) !== crc) throw new ContainerError('zip-crc', 'CRC-32 mismatch', name);

    entries.push({
      name,
      method: methodCode === METHOD_STORED ? 'stored' : 'deflated',
      flags,
      crc32: crc,
      compressedSize,
      size,
      localHeaderOffset: localOffset,
      localExtraLength: localExtraLen,
      centralExtraLength: extraLen,
      data,
    });
  }

  // Overlapping entries are a known ZIP-bomb technique and never produced by honest writers.
  spans.sort((a, b) => a.start - b.start);
  for (let i = 1; i < spans.length; i++) {
    if (spans[i]!.start < spans[i - 1]!.end) throw new ContainerError('zip-structure', 'overlapping entries', spans[i]!.name);
  }
  return entries;
}
