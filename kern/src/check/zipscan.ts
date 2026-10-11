/**
 * Tolerant ZIP reader for the conformance checker. Unlike `readZip`, which rejects a file at
 * the first problem (right for a reader), the checker needs every problem with its entry:
 * methods, encryption, ZIP64, paths, duplicates, CRC and sizes (HPR-CONT-001…003, -012,
 * -013, -026, -027). Problems that make the archive unreadable as a whole are returned as
 * `fatal`; everything else as `issues`, and the entries stay usable where their content is
 * intact.
 */
import { crc32, fromUtf8 } from '../bytes.js';
import { inflateRaw } from '../zip.js';

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_EOCD_LOCATOR = 0x07064b50;

/** Limits of HP-CONT-012 (HPR-CONT-026). */
export const LIMITS = { entries: 10_000, entrySize: 256 * 1024 * 1024, totalSize: 1024 * 1024 * 1024 } as const;
/** Entries larger than this are not inflated at all (protection of the checker itself). */
const HARD_INFLATE_LIMIT = 512 * 1024 * 1024;

export interface ScanEntry {
  readonly name: string;
  readonly index: number;
  readonly method: number;
  readonly flags: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly localHeaderOffset: number;
  readonly localExtraLength: number;
  readonly dosTime: number;
  readonly dosDate: number;
  readonly isDirectory: boolean;
  /** Uncompressed content; undefined when it could not be read or failed CRC/size checks. */
  readonly data: Uint8Array | undefined;
}

export type ZipIssueKind = 'method' | 'encryption' | 'zip64' | 'multidisk' | 'path' | 'crc' | 'limit';

export interface ZipIssue {
  readonly kind: ZipIssueKind;
  /** Entry name, absent for archive-wide issues. */
  readonly path?: string;
  readonly detail: string;
  /** Path rule name for `path` issues; compression method for `method` issues. */
  readonly rule?: string;
  readonly method?: number;
  readonly value?: string;
  readonly limit?: string;
}

export interface ZipScan {
  /** Set when the file is not a readable ZIP archive (HPR-CONT-001). */
  readonly fatal?: string;
  readonly entries: readonly ScanEntry[];
  readonly issues: readonly ZipIssue[];
  /** First four bytes are a local file header signature. */
  readonly startsWithLocalHeader: boolean;
  /** Name in the first local header at offset 0, if any. */
  readonly firstLocalName?: string;
  readonly firstLocalMethod?: number;
  readonly firstLocalExtraLength?: number;
}

/** Path rules of HP-CONT-006 (HPR-CONT-012); returns the violated rule names. */
export function pathRuleViolations(name: string): string[] {
  const out: string[] = [];
  if (name.startsWith('/')) out.push('relativ (kein führendes /)');
  const segments = name.split('/');
  const body = name.startsWith('/') ? segments.slice(1) : segments;
  if (body.some((s) => s === '')) out.push('Segmente nicht leer');
  if (body.some((s) => s === '.' || s === '..')) out.push('kein Segment . oder ..');
  if (/["*:<>?\\]/.test(name)) out.push('keine Zeichen " * : < > ? \\');
  if (/[\u0000-\u001f\u007f]/.test(name)) out.push('keine Steuerzeichen');
  const enc = new TextEncoder();
  if (body.some((s) => enc.encode(s).length > 255)) out.push('Segment höchstens 255 Bytes');
  if (body.some((s) => s !== '.' && s !== '..' && s.endsWith('.'))) out.push('Segment endet nicht auf .');
  return out;
}

function findEocd(view: DataView): number {
  const min = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let i = view.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === SIG_EOCD && i + 22 + view.getUint16(i + 20, true) === view.byteLength) return i;
  }
  return -1;
}

function hasZip64Extra(bytes: Uint8Array, start: number, length: number): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = start;
  while (p + 4 <= start + length) {
    const id = view.getUint16(p, true);
    const size = view.getUint16(p + 2, true);
    if (id === 0x0001) return true;
    p += 4 + size;
  }
  return false;
}

export async function scanZip(bytes: Uint8Array): Promise<ZipScan> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const startsWithLocalHeader = bytes.length >= 4 && view.getUint32(0, true) === SIG_LOCAL;
  const issues: ZipIssue[] = [];
  const entries: ScanEntry[] = [];
  const empty = { entries, issues, startsWithLocalHeader };
  if (bytes.length < 22) return { ...empty, fatal: 'Datei kürzer als ein leeres ZIP-Archiv' };
  const eocd = findEocd(view);
  if (eocd < 0) return { ...empty, fatal: 'End-of-Central-Directory-Signatur nicht gefunden' };

  let first: Pick<ZipScan, 'firstLocalName' | 'firstLocalMethod' | 'firstLocalExtraLength'> = {};
  if (startsWithLocalHeader && bytes.length >= 30) {
    const nameLen = view.getUint16(26, true);
    let name: string;
    try {
      name = fromUtf8(bytes.subarray(30, 30 + nameLen));
    } catch {
      name = '(kein UTF-8)';
    }
    first = { firstLocalName: name, firstLocalMethod: view.getUint16(8, true), firstLocalExtraLength: view.getUint16(28, true) };
  }

  if (eocd >= 20 && view.getUint32(eocd - 20, true) === SIG_ZIP64_EOCD_LOCATOR) issues.push({ kind: 'zip64', detail: 'ZIP64-End-of-Central-Directory-Locator vorhanden' });
  const diskNo = view.getUint16(eocd + 4, true);
  const cdDisk = view.getUint16(eocd + 6, true);
  const countDisk = view.getUint16(eocd + 8, true);
  const count = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (diskNo !== 0 || cdDisk !== 0 || countDisk !== count) issues.push({ kind: 'multidisk', detail: 'Mehrdatenträger-Archiv (Disk-Nummern ungleich 0)' });
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    issues.push({ kind: 'zip64', detail: 'ZIP64-Platzhalter im End-of-Central-Directory' });
    return { ...empty, ...first, fatal: 'Zentralverzeichnis nur über ZIP64 auffindbar' };
  }
  if (cdOffset + cdSize > eocd) return { ...empty, ...first, fatal: 'Zentralverzeichnis liegt außerhalb des Archivs' };
  if (count > LIMITS.entries) issues.push({ kind: 'limit', detail: 'Anzahl der Einträge', value: String(count), limit: String(LIMITS.entries) });

  const spans: Array<{ start: number; end: number; name: string }> = [];
  let total = 0;
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cdOffset + cdSize || view.getUint32(p, true) !== SIG_CENTRAL) return { ...empty, ...first, fatal: `Zentralverzeichnis-Eintrag #${i} unlesbar` };
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const dosTime = view.getUint16(p + 12, true);
    const dosDate = view.getUint16(p + 14, true);
    const crc = view.getUint32(p + 16, true);
    const compressedSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const diskStart = view.getUint16(p + 34, true);
    const localOffset = view.getUint32(p + 42, true);
    if (p + 46 + nameLen + extraLen + commentLen > cdOffset + cdSize) return { ...empty, ...first, fatal: `Zentralverzeichnis-Eintrag #${i} überläuft das Verzeichnis` };
    const nameBytes = bytes.subarray(p + 46, p + 46 + nameLen);
    let name: string;
    try {
      name = fromUtf8(nameBytes);
    } catch {
      name = `(Eintrag #${i}, Name kein UTF-8)`;
      issues.push({ kind: 'path', path: name, detail: 'Name ist kein gültiges UTF-8', rule: 'Name in UTF-8' });
    }
    const zip64 = hasZip64Extra(bytes, p + 46 + nameLen, extraLen) || compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff;
    p += 46 + nameLen + extraLen + commentLen;

    for (const rule of pathRuleViolations(name)) issues.push({ kind: 'path', path: name, detail: rule, rule });
    if (flags & 0x0001) issues.push({ kind: 'encryption', path: name, detail: 'Eintrag ist verschlüsselt (Bit 0 der Flags)' });
    if (zip64) issues.push({ kind: 'zip64', path: name, detail: 'Eintrag nutzt ZIP64' });
    if (diskStart !== 0) issues.push({ kind: 'multidisk', path: name, detail: `Eintrag beginnt auf Datenträger ${diskStart}` });
    if (method !== 0 && method !== 8) issues.push({ kind: 'method', path: name, detail: `Methode ${method}`, method });
    if (size > LIMITS.entrySize) issues.push({ kind: 'limit', path: name, detail: `Eintrag ${name} unkomprimiert`, value: `${size} Bytes`, limit: `${LIMITS.entrySize} Bytes` });
    total += size;

    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== SIG_LOCAL) return { ...empty, ...first, fatal: `Local-Header von ${name} fehlt` };
    const localMethod = view.getUint16(localOffset + 8, true);
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const localName = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLen);
    if (localMethod !== method || localNameLen !== nameLen || !localName.every((b, k) => b === nameBytes[k])) {
      return { ...empty, ...first, fatal: `Local-Header und Zentralverzeichnis widersprechen sich bei ${name}` };
    }
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > cdOffset) return { ...empty, ...first, fatal: `Daten von ${name} überlappen das Zentralverzeichnis` };
    spans.push({ start: localOffset, end: dataEnd, name });

    const isDirectory = name.endsWith('/');
    let data: Uint8Array | undefined;
    const encrypted = (flags & 0x0001) !== 0;
    if (!encrypted && (method === 0 || method === 8) && size <= HARD_INFLATE_LIMIT) {
      const raw = bytes.subarray(dataStart, dataEnd);
      if (method === 0) {
        if (compressedSize !== size) issues.push({ kind: 'crc', path: name, detail: `gespeicherter Eintrag mit ungleichen Größen (${compressedSize} gegen ${size})` });
        else data = raw.slice();
      } else {
        try {
          data = await inflateRaw(raw, size);
          if (data.length !== size) {
            issues.push({ kind: 'crc', path: name, detail: `entpackte Größe ${data.length} statt ${size}` });
            data = undefined;
          }
        } catch (err) {
          issues.push({ kind: 'crc', path: name, detail: `Entpacken fehlgeschlagen: ${(err as Error).message}` });
          data = undefined;
        }
      }
      if (data && crc32(data) !== crc) {
        issues.push({ kind: 'crc', path: name, detail: 'CRC-32 stimmt nicht' });
        data = undefined;
      }
    }
    entries.push({ name, index: i, method, flags, crc32: crc, compressedSize, size, localHeaderOffset: localOffset, localExtraLength: localExtraLen, dosTime, dosDate, isDirectory, data });
  }
  if (total > LIMITS.totalSize) issues.push({ kind: 'limit', detail: 'Gesamtgröße unkomprimiert', value: `${total} Bytes`, limit: `${LIMITS.totalSize} Bytes` });
  spans.sort((a, b) => a.start - b.start);
  for (let i = 1; i < spans.length; i++) {
    if (spans[i]!.start < spans[i - 1]!.end) return { ...empty, entries: [], ...first, fatal: `Einträge ${spans[i - 1]!.name} und ${spans[i]!.name} überlappen sich` };
  }
  return { entries, issues, startsWithLocalHeader, ...first };
}

/** DOS date/time of a timestamp in UTC (2-second resolution), as the core writes it. */
export function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1),
    date: ((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}
