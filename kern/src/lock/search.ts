/**
 * Full-text search over every entry of a container, used to prove that sealed or redacted
 * content is gone (HP-LOCK-007, HPR-LOCK-005, HPC-0007).
 *
 * Each entry is searched in several readings, so that encoding does not hide a hit:
 *   - `text`    the entry decoded as UTF-8 (lossy; binary files too, which finds EXIF/XMP text),
 *   - `markup`  XML/HTML with character references decoded and tags removed (text across
 *               inline elements, `&amp;` written as `&`),
 *   - `json`    every string (keys and values) of a JSON entry with its escapes decoded,
 *   - `zip`     the raw bytes of the whole ZIP file in UTF-8, UTF-16LE and UTF-16BE (stored entries,
 *               file names, comments, anything outside the entries).
 * Matching ignores case and collapses white space; both sides are NFC-normalised.
 */
import { readZip, type ZipEntry } from '../zip.js';

export type Reading = 'text' | 'markup' | 'json' | 'zip';

export interface Hit {
  /** Entry path, or `(zip)` for the raw file. */
  readonly entry: string;
  readonly reading: Reading;
  /** Index of the needle in the list passed in (the needle itself is not repeated, it may be secret). */
  readonly needle: number;
}

const lossy = new TextDecoder('utf-8', { fatal: false });

export function normalize(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').toLowerCase();
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeReferences(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, ref: string) => {
    if (ref[0] === '#') {
      const cp = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[ref] ?? m;
  });
}

function jsonStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) jsonStrings(v, out);
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      jsonStrings(v, out);
    }
}

const XML_LIKE = /\.(xhtml|html|htm|xml|svg|opf|ncx|smil)$/i;

/** The readings of one entry (normalised). */
export function readings(path: string, data: Uint8Array): Array<{ reading: Reading; text: string }> {
  const text = lossy.decode(data);
  const out: Array<{ reading: Reading; text: string }> = [{ reading: 'text', text: normalize(text) }];
  if (XML_LIKE.test(path) || /^\s*</.test(text.slice(0, 64))) {
    const stripped = decodeReferences(text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' '));
    // Attribute values as well (alt, title, aria-label …): references decoded.
    const attrs = [...text.matchAll(/=\s*"([^"]*)"|=\s*'([^']*)'/g)].map((m) => decodeReferences(m[1] ?? m[2] ?? '')).join('\n');
    out.push({ reading: 'markup', text: normalize(stripped + '\n' + attrs) });
  }
  if (/\.json$/i.test(path) || /^\s*[[{]/.test(text.slice(0, 16))) {
    try {
      const strings: string[] = [];
      jsonStrings(JSON.parse(text), strings);
      out.push({ reading: 'json', text: normalize(strings.join('\n')) });
    } catch {
      // not JSON: the text reading covers it
    }
  }
  return out;
}

function utf16(text: string, littleEndian: boolean): string {
  let s = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    s += littleEndian ? String.fromCharCode(c & 0xff, c >> 8) : String.fromCharCode(c >> 8, c & 0xff);
  }
  return s;
}

function latin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
}

/** Searches decoded entries (by path) for every needle. */
export function searchEntries(entries: ReadonlyMap<string, Uint8Array> | readonly ZipEntry[], needles: readonly string[]): Hit[] {
  const list: Array<[string, Uint8Array]> = Array.isArray(entries) ? (entries as readonly ZipEntry[]).map((e) => [e.name, e.data]) : [...(entries as ReadonlyMap<string, Uint8Array>)];
  const norm = needles.map(normalize);
  const hits: Hit[] = [];
  for (const [path, data] of list) {
    if (path.endsWith('/')) continue;
    for (const r of readings(path, data)) {
      norm.forEach((n, i) => {
        if (n.trim() !== '' && r.text.includes(n)) hits.push({ entry: path, reading: r.reading, needle: i });
      });
    }
  }
  return dedupe(hits);
}

/** Searches the raw ZIP bytes (UTF-8, UTF-16LE, UTF-16BE; case-sensitive forms as given and lower-cased). */
export function searchRaw(zip: Uint8Array, needles: readonly string[]): Hit[] {
  const raw = latin1(zip);
  const rawLower = raw.toLowerCase();
  const hits: Hit[] = [];
  needles.forEach((needle, i) => {
    const n = needle.normalize('NFC');
    if (n.trim() === '') return;
    const forms = [latin1(new TextEncoder().encode(n)), utf16(n, true), utf16(n, false)];
    const lowerForms = [latin1(new TextEncoder().encode(n.toLowerCase())), utf16(n.toLowerCase(), true), utf16(n.toLowerCase(), false)];
    if (forms.some((f) => raw.includes(f)) || lowerForms.some((f) => rawLower.includes(f))) hits.push({ entry: '(zip)', reading: 'zip', needle: i });
  });
  return hits;
}

/** Unpacks the container and searches every entry plus the raw file. */
export async function searchContainer(zip: Uint8Array, needles: readonly string[]): Promise<{ entries: number; hits: Hit[] }> {
  const entries = await readZip(zip);
  return { entries: entries.filter((e) => !e.name.endsWith('/')).length, hits: [...searchEntries(entries, needles), ...searchRaw(zip, needles)] };
}

function dedupe(hits: Hit[]): Hit[] {
  const seen = new Set<string>();
  return hits.filter((h) => {
    const k = `${h.entry}\u0000${h.reading}\u0000${h.needle}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
