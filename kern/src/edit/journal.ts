/**
 * History journal (proposal HPC-0008): every version of the main document stays reconstructable
 * from the one file, so that two versions can be compared (docs/10, promise 4: "Verlauf,
 * Vergleich zweier Fassungen") without a server and without a second file.
 *
 * `data/history.json` holds one entry per step of `manifest.json#history`. Entry `N` turns the
 * files of version `N` back into version `N - 1` (reverse delta):
 *   - text files: token patches (tags, words, white space; see `sequence.ts`),
 *   - a file that did not exist in `N - 1`: `absent`,
 *   - a text file that was removed in `N`: its full `text`,
 *   - a binary file that was removed or replaced in `N`: `blob`, a copy kept under
 *     `data/history/blobs/<sha256>.<ext>` (listed in the manifest like any resource),
 *   - `manifest`: a patch from the normalised manifest of `N` to the exact bytes of `N - 1`.
 * Not journaled: `mimetype`, `META-INF/*` (signatures belong to the file, not to a version),
 * `manifest.json` (patched separately) and the journal itself (its earlier state is its prefix).
 *
 * Reconstruction checks itself: the SHA-256 of the rebuilt `manifest.json` of `N - 1` must equal
 * `history[N].manifestIntegrity`, and every rebuilt file must match the `integrity` listed in that
 * manifest. After a redaction the earlier versions are rewritten without the redacted content
 * (HP-LOCK-007 names the history), so they are reconstructable but no longer byte-identical;
 * the result says so ("redacted").
 */
import { fromUtf8, utf8 } from '../bytes.js';
import { readContainer, type ReadContainer } from '../container.js';
import { sha256Hex, sriSha256 } from '../hash.js';
import { writeZip, type ZipEntryInput } from '../zip.js';
import { refreshMachineViews } from '../machine/container.js';
import { applyPatch, makePatch, type Hunk } from './sequence.js';

export const JOURNAL_PATH = 'data/history.json';
/** Format identifier (not a namespace URI: Teil 2, Abschnitt 5 registers no URI form for it). */
export const JOURNAL_FORMAT = 'hpro-history/0.1';
export const BLOB_DIR = 'data/history/blobs/';
const REDACTION_LOG = 'data/redaction-log.json';
const TEXT_TYPES = /^(text\/|application\/(json|jose\+json|ld\+json|xml|xhtml\+xml|oebps-package\+xml|javascript|ecmascript|smil\+xml)|image\/svg\+xml)/;
const strict = new TextDecoder('utf-8', { fatal: true });

type Json = Record<string, unknown>;

export type FileChange =
  | { readonly path: string; readonly patch: readonly Hunk[] }
  | { readonly path: string; readonly absent: true }
  | { readonly path: string; readonly text: string }
  | { readonly path: string; readonly blob: string }
  /** The bytes of `N - 1` are not kept (a later redaction removed the copy). */
  | { readonly path: string; readonly lost: true };

export interface JournalEntry {
  /** Version of `manifest.json#history` this entry leads to; it reconstructs `version - 1`. */
  readonly version: number;
  readonly manifest: readonly Hunk[];
  readonly files: readonly FileChange[];
}

export interface Journal {
  readonly format: string;
  readonly entries: readonly JournalEntry[];
}

/** All files of one version, as the container held them. */
export interface Snapshot {
  readonly version: number;
  /** Every entry except `mimetype`, `manifest.json`, `META-INF/*` and the journal itself. */
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly manifest: string;
}

export interface VersionInfo {
  readonly version: number;
  readonly dateModified?: string;
  readonly note?: string;
  /** Rebuildable from the journal of this file. */
  readonly available: boolean;
  /**
   * `exact`: rebuilt bytes match the hash chain; `redacted`: rebuilt after a redaction, hashes
   * differ by design; `current`: the version in the file; `mismatch`: journal inconsistent;
   * `unavailable`: not in the journal.
   */
  readonly status: 'current' | 'exact' | 'redacted' | 'mismatch' | 'unavailable';
  readonly problems?: readonly string[];
}

export class JournalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JournalError';
  }
}

export function isTextType(type: string | undefined, data: Uint8Array): boolean {
  if (type !== undefined && !TEXT_TYPES.test(type)) return false;
  try {
    strict.decode(data);
    return true;
  } catch {
    return false;
  }
}

export function serializeJournal(j: Journal): Uint8Array {
  const lines = j.entries.map((e) => JSON.stringify(e));
  return utf8(`{\n"format": ${JSON.stringify(j.format)},\n"entries": [${lines.length > 0 ? '\n' + lines.join(',\n') + '\n' : ''}]\n}\n`);
}

export function parseJournal(bytes: Uint8Array): Journal {
  let v: unknown;
  try {
    v = JSON.parse(fromUtf8(bytes));
  } catch (e) {
    throw new JournalError(`${JOURNAL_PATH}: not JSON (${(e as Error).message})`);
  }
  const j = v as Journal;
  if (!j || typeof j !== 'object' || j.format !== JOURNAL_FORMAT || !Array.isArray(j.entries)) throw new JournalError(`${JOURNAL_PATH}: format must be ${JOURNAL_FORMAT} with a list "entries"`);
  let last = 0;
  for (const e of j.entries) {
    if (!Number.isInteger(e.version) || e.version <= last) throw new JournalError(`${JOURNAL_PATH}: versions must ascend (found ${String(e.version)} after ${last})`);
    if (!Array.isArray(e.manifest) || !Array.isArray(e.files)) throw new JournalError(`${JOURNAL_PATH}: entry ${e.version} needs "manifest" and "files"`);
    last = e.version;
  }
  return j;
}

function isJournaled(path: string): boolean {
  return path !== 'mimetype' && path !== 'manifest.json' && path !== JOURNAL_PATH && !path.startsWith(BLOB_DIR) && !path.startsWith('META-INF/') && !path.endsWith('/');
}

/** The manifest as patch base: resource integrity of the journal blanked, serialised with 2 spaces. */
export function manifestBase(manifest: Json): string {
  const resources = Array.isArray(manifest.resources) ? (manifest.resources as Json[]).map((r) => (r.url === JOURNAL_PATH ? { ...r, integrity: '' } : r)) : manifest.resources;
  return JSON.stringify({ ...manifest, resources }, null, 2) + '\n';
}

function typesOf(manifest: Json): Map<string, string> {
  return new Map((Array.isArray(manifest.resources) ? (manifest.resources as Array<{ url: string; type: string }>) : []).map((r) => [r.url, r.type]));
}

function lastVersion(manifest: Json): number {
  const h = Array.isArray(manifest.history) ? (manifest.history as Json[]) : [];
  return h.length > 0 ? Math.max(...h.map((x) => Number(x.version) || 0)) : 0;
}

function historyEntry(manifest: Json, version: number): Json | undefined {
  return (Array.isArray(manifest.history) ? (manifest.history as Json[]) : []).find((h) => h.version === version);
}

function extension(path: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(path);
  return m ? `.${m[1]!.toLowerCase()}` : '';
}

/** The journaled files of a container (no blobs, no journal, no manifest, no META-INF). */
export function snapshotOf(c: ReadContainer, version: number): Snapshot {
  const files = new Map<string, Uint8Array>();
  for (const [p, d] of c.files) if (isJournaled(p)) files.set(p, d);
  return { version, files, manifest: fromUtf8(c.files.get('manifest.json')!) };
}

/** Blob store of a container: the kept copies of binary files, shared by all versions. */
export function blobStore(c: ReadContainer): Map<string, Uint8Array> {
  return new Map([...c.files].filter(([p]) => p.startsWith(BLOB_DIR)));
}

/** The journal of a container, or null. */
export function journalOf(c: ReadContainer): Journal | null {
  const data = c.files.get(JOURNAL_PATH);
  return data ? parseJournal(data) : null;
}

type BlobSink = Map<string, { data: Uint8Array; type: string }>;

/** Reverse delta from `newer` (version N) to `older` (N − 1); binary files of `older` go to `blobs`. */
async function entryBetween(newer: { files: ReadonlyMap<string, Uint8Array>; manifest: Json | null }, older: Snapshot, version: number, blobs: BlobSink, keepMedia: boolean): Promise<JournalEntry> {
  const olderManifest = JSON.parse(older.manifest) as Json;
  const olderTypes = typesOf(olderManifest);
  const files: FileChange[] = [];
  const paths = [...new Set([...newer.files.keys(), ...older.files.keys()])].filter(isJournaled).sort();
  for (const p of paths) {
    const a = newer.files.get(p);
    const b = older.files.get(p);
    if (b === undefined) {
      files.push({ path: p, absent: true });
      continue;
    }
    if (a !== undefined && a.length === b.length && a.every((x, i) => x === b[i])) continue;
    const type = olderTypes.get(p) ?? (p.endsWith('.opf') ? 'application/oebps-package+xml' : undefined);
    if (isTextType(type, b)) {
      const olderText = fromUtf8(b);
      if (a !== undefined && isTextType(undefined, a)) files.push({ path: p, patch: makePatch(fromUtf8(a), olderText) });
      else files.push({ path: p, text: olderText });
      continue;
    }
    if (!keepMedia) {
      files.push({ path: p, lost: true });
      continue;
    }
    const blob = `${BLOB_DIR}${await sha256Hex(b)}${extension(p)}`;
    if (!blobs.has(blob)) blobs.set(blob, { data: b, type: type ?? 'application/octet-stream' });
    files.push({ path: p, blob });
  }
  const manifest = newer.manifest ? makePatch(manifestBase(newer.manifest), older.manifest) : [];
  return { version, manifest, files };
}

/** Applies entry `e` to the snapshot of its version, giving version `e.version - 1`. */
export function applyEntry(newer: Snapshot, e: JournalEntry, journalPrefix: Journal, store: ReadonlyMap<string, Uint8Array>): Snapshot & { journal?: Uint8Array } {
  const files = new Map(newer.files);
  for (const f of e.files) {
    if ('absent' in f) files.delete(f.path);
    else if ('text' in f) files.set(f.path, utf8(f.text));
    else if ('patch' in f) {
      const cur = newer.files.get(f.path);
      if (!cur) throw new JournalError(`version ${e.version}: ${f.path} is missing, the patch cannot be applied`);
      files.set(f.path, utf8(applyPatch(fromUtf8(cur), f.patch)));
    } else if ('blob' in f) {
      const data = store.get(f.blob);
      if (data) files.set(f.path, data);
      else files.delete(f.path);
    } else files.delete(f.path);
  }
  const manifestText = applyPatch(manifestBase(JSON.parse(newer.manifest) as Json), e.manifest);
  const m = JSON.parse(manifestText) as Json;
  const out: Snapshot & { journal?: Uint8Array } = { version: e.version - 1, files, manifest: manifestText };
  if (typesOf(m).has(JOURNAL_PATH)) out.journal = serializeJournal(journalPrefix);
  return out;
}

/** Hash checks of a rebuilt version against its manifest and the hash chain of the newer manifest. */
async function verifySnapshot(s: Snapshot & { journal?: Uint8Array }, chainIntegrity: string | undefined, store: ReadonlyMap<string, Uint8Array>): Promise<string[]> {
  const problems: string[] = [];
  const integrity = await sriSha256(utf8(s.manifest));
  if (chainIntegrity !== undefined && integrity !== chainIntegrity) problems.push(`manifest.json: SHA-256 ${integrity} ≠ history.manifestIntegrity ${chainIntegrity}`);
  const m = JSON.parse(s.manifest) as Json;
  for (const r of (Array.isArray(m.resources) ? m.resources : []) as Array<{ url: string; integrity: string }>) {
    const data = r.url === JOURNAL_PATH ? s.journal : r.url.startsWith(BLOB_DIR) ? store.get(r.url) : s.files.get(r.url);
    if (!data) problems.push(`${r.url}: fehlt`);
    else if ((await sriSha256(data)) !== r.integrity) problems.push(`${r.url}: Hash weicht ab`);
  }
  return problems;
}

/**
 * Every version the file can rebuild, newest first: the current one, then one per journal entry
 * as long as the chain holds.
 */
export async function reconstructAll(bytes: Uint8Array | ReadContainer): Promise<{ snapshots: Array<Snapshot & { journal?: Uint8Array }>; infos: VersionInfo[]; store: Map<string, Uint8Array> }> {
  const c = bytes instanceof Uint8Array ? await readContainer(bytes) : bytes;
  const manifest = JSON.parse(fromUtf8(c.files.get('manifest.json')!)) as Json;
  const current = lastVersion(manifest);
  const journal = journalOf(c);
  const store = blobStore(c);
  const redactions = c.files.has(REDACTION_LOG) ? (JSON.parse(fromUtf8(c.files.get(REDACTION_LOG)!)) as Array<{ at?: string }>) : [];
  const lastRedaction = redactions.map((r) => Date.parse(r.at ?? '')).filter((t) => !Number.isNaN(t)).reduce((a, b) => Math.max(a, b), -Infinity);
  const snapshots: Array<Snapshot & { journal?: Uint8Array }> = [snapshotOf(c, current)];
  const history = (Array.isArray(manifest.history) ? (manifest.history as Json[]) : []).slice();
  const infos: VersionInfo[] = [{ version: current, ...meta(historyEntry(manifest, current) ?? (current === 0 ? { dateModified: manifest.dateModified, note: 'Ausgangsfassung' } : undefined)), available: true, status: 'current' }];
  if (journal) {
    let snap = snapshots[0]!;
    let newerManifest = manifest;
    for (let i = journal.entries.length - 1; i >= 0; i--) {
      const e = journal.entries[i]!;
      if (e.version !== snap.version) break; // gap: a version step without a journal entry
      let older: Snapshot & { journal?: Uint8Array };
      try {
        older = applyEntry(snap, e, { format: journal.format, entries: journal.entries.slice(0, i) }, store);
      } catch (err) {
        infos.push({ version: e.version - 1, available: false, status: 'mismatch', problems: [(err as Error).message] });
        break;
      }
      const chain = historyEntry(newerManifest, e.version)?.manifestIntegrity as string | undefined;
      const problems = await verifySnapshot(older, chain, store);
      const olderManifest = JSON.parse(older.manifest) as Json;
      const h = e.version - 1 === 0 ? { dateModified: olderManifest.dateModified, note: 'Ausgangsfassung' } : historyEntry(olderManifest, e.version - 1);
      const t = Date.parse(String(historyEntry(manifest, e.version)?.dateModified ?? ''));
      const redactedLater = Number.isFinite(lastRedaction) && !Number.isNaN(t) && t <= lastRedaction;
      infos.push({ version: e.version - 1, ...meta(h as Json | undefined), available: true, status: problems.length === 0 ? 'exact' : redactedLater ? 'redacted' : 'mismatch', ...(problems.length ? { problems } : {}) });
      snapshots.push(older);
      snap = older;
      newerManifest = olderManifest;
    }
  }
  const have = new Set(infos.map((i) => i.version));
  for (const h of history.sort((a, b) => Number(b.version) - Number(a.version))) {
    if (!have.has(Number(h.version))) infos.push({ version: Number(h.version), ...meta(h), available: false, status: 'unavailable' });
  }
  if (!have.has(0) && current > 0) infos.push({ version: 0, note: 'Ausgangsfassung', available: false, status: 'unavailable' });
  infos.sort((a, b) => b.version - a.version);
  return { snapshots, infos, store };
}

function meta(h: Json | undefined): { dateModified?: string; note?: string } {
  if (!h) return {};
  return { ...(typeof h.dateModified === 'string' ? { dateModified: h.dateModified } : {}), ...(typeof h.note === 'string' ? { note: h.note } : {}) };
}

export async function listVersions(bytes: Uint8Array | ReadContainer): Promise<VersionInfo[]> {
  return (await reconstructAll(bytes)).infos;
}

export async function snapshotAt(bytes: Uint8Array | ReadContainer, version: number): Promise<Snapshot & { journal?: Uint8Array }> {
  const { snapshots, infos, store } = await reconstructAll(bytes);
  const s = snapshots.find((x) => x.version === version);
  if (!s) {
    const info = infos.find((i) => i.version === version);
    throw new JournalError(info ? `Fassung ${version} ist aus dieser Datei nicht wiederherstellbar (${info.status}${info.problems ? ': ' + info.problems.join('; ') : ''})` : `Fassung ${version} gibt es nicht`);
  }
  // Blobs listed in that version belong to its files.
  const m = JSON.parse(s.manifest) as Json;
  const files = new Map(s.files);
  for (const r of (Array.isArray(m.resources) ? m.resources : []) as Array<{ url: string }>) if (r.url.startsWith(BLOB_DIR) && store.has(r.url)) files.set(r.url, store.get(r.url)!);
  return { ...s, files };
}

/**
 * A container holding exactly version `version` (as a separate file, e.g. for the reader or for
 * `diff`). Exact versions are byte-identical in every listed file; redacted ones get fresh hashes.
 */
export async function checkoutVersion(bytes: Uint8Array, version: number): Promise<Uint8Array> {
  const c = await readContainer(bytes);
  const s = await snapshotAt(c, version);
  const manifest = JSON.parse(s.manifest) as Json;
  let manifestBytes = utf8(s.manifest);
  const all = new Map(s.files);
  if (s.journal) all.set(JOURNAL_PATH, s.journal);
  const listed = (Array.isArray(manifest.resources) ? manifest.resources : []) as Array<{ url: string; type: string; integrity: string }>;
  let stale = false;
  for (const r of listed) if (!all.has(r.url) || (await sriSha256(all.get(r.url)!)) !== r.integrity) stale = true;
  if (stale) {
    const resources = [];
    for (const r of listed) if (all.has(r.url)) resources.push({ ...r, integrity: await sriSha256(all.get(r.url)!) });
    manifestBytes = utf8(JSON.stringify({ ...manifest, resources }, null, 2) + '\n');
  }
  const entries: ZipEntryInput[] = [{ name: 'mimetype', data: c.files.get('mimetype')!, compression: 'store' }];
  entries.push({ name: 'META-INF/container.xml', data: c.files.get('META-INF/container.xml')!, compression: 'auto' });
  entries.push({ name: c.packagePath, data: all.get(c.packagePath)!, compression: 'auto' });
  entries.push({ name: 'manifest.json', data: manifestBytes, compression: 'auto' });
  for (const [p, d] of [...all].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) if (p !== c.packagePath) entries.push({ name: p, data: d, compression: 'auto' });
  const modified = typeof manifest.dateModified === 'string' ? manifest.dateModified : '1980-01-01T00:00:00Z';
  return writeZip(await refreshMachineViews(entries), { modified: new Date(modified) });
}

export interface RecordOptions {
  /** Create the journal if the earlier version has none (the editor does; other writers only continue one). */
  readonly create?: boolean;
  /** Keep removed or replaced binary files as blobs (default true). */
  readonly keepMedia?: boolean;
}

/** Adds items to package.opf for new files and removes items of removed files. */
function opfWithItems(opf: string, added: ReadonlyMap<string, string>, removed: ReadonlySet<string> = new Set()): string {
  let out = opf;
  for (const p of removed) out = out.replace(new RegExp(`\\s*<item\\b[^>]*\\bhref="${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`), '');
  const existingIds = new Set([...out.matchAll(/<item\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]));
  const existingHrefs = new Set([...out.matchAll(/<item\b[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]));
  const items: string[] = [];
  let n = 0;
  for (const [p, type] of [...added].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (existingHrefs.has(p)) continue;
    let id: string;
    do id = `history-${++n}`;
    while (existingIds.has(id));
    items.push(`    <item id="${id}" href="${p}" media-type="${type}"/>`);
  }
  if (items.length === 0) return out;
  const close = out.lastIndexOf('</manifest>');
  if (close < 0) throw new JournalError('package.opf has no </manifest>');
  const lineStart = out.lastIndexOf('\n', close) + 1;
  return out.slice(0, lineStart) + items.join('\n') + '\n' + out.slice(lineStart);
}

function blobRefs(entries: readonly JournalEntry[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) for (const f of e.files) if ('blob' in f) out.add(f.blob);
  return out;
}

/**
 * Writes `bytes` (version N, the newest) again with a journal made of `prefix` (kept entries) and
 * one entry per step down through `older` (snapshots N − 1, N − 2 …, newest first). The blob
 * store afterwards holds exactly the blobs the journal refers to.
 */
export async function installJournal(bytes: Uint8Array, older: readonly Snapshot[], prefix: readonly JournalEntry[], keepMedia = true): Promise<Uint8Array> {
  const c = await readContainer(bytes);
  const manifest = JSON.parse(fromUtf8(c.files.get('manifest.json')!)) as Json;
  const version = lastVersion(manifest);
  const store = blobStore(c);
  const newest = snapshotOf(c, version);
  const chain = [newest, ...older];
  for (let i = 1; i < chain.length; i++) if (chain[i]!.version !== chain[i - 1]!.version - 1) throw new JournalError(`snapshots must step down by one (got ${chain[i]!.version} after ${chain[i - 1]!.version})`);
  // Pass 1: which binary files of older versions need a blob.
  const sink: BlobSink = new Map();
  for (let i = 1; i < chain.length; i++) await entryBetween({ files: chain[i - 1]!.files, manifest: null }, chain[i]!, chain[i - 1]!.version, sink, keepMedia);
  const needed = new Map<string, { data: Uint8Array; type: string }>();
  for (const p of blobRefs(prefix)) {
    const data = store.get(p);
    if (data) needed.set(p, { data, type: typesOf(manifest).get(p) ?? 'application/octet-stream' });
  }
  for (const [p, f] of sink) needed.set(p, f);
  const oldBlobs = new Set(store.keys());
  const removedBlobs = new Set([...oldBlobs].filter((p) => !needed.has(p)));
  const addedFiles = new Map<string, string>();
  for (const [p, f] of needed) if (!oldBlobs.has(p)) addedFiles.set(p, f.type);
  const hadJournal = c.files.has(JOURNAL_PATH);
  if (!hadJournal) addedFiles.set(JOURNAL_PATH, 'application/json');
  const opf = utf8(opfWithItems(fromUtf8(c.files.get(c.packagePath)!), addedFiles, removedBlobs));
  const files = new Map(newest.files);
  files.set(c.packagePath, opf);
  const resources: Json[] = [];
  for (const r of manifest.resources as Json[]) {
    const url = String(r.url);
    if (removedBlobs.has(url)) continue;
    resources.push(url === JOURNAL_PATH ? { ...r, integrity: '' } : files.has(url) ? { ...r, integrity: await sriSha256(files.get(url)!) } : { ...r });
  }
  for (const [p, f] of needed) if (!oldBlobs.has(p)) resources.push({ url: p, type: f.type, integrity: await sriSha256(f.data) });
  if (!hadJournal) resources.push({ url: JOURNAL_PATH, type: 'application/json', integrity: '' });
  resources.sort((x, y) => (String(x.url) < String(y.url) ? -1 : String(x.url) > String(y.url) ? 1 : 0));
  const draft: Json = { ...manifest, resources };
  // Pass 2: the entries, the newest against the final manifest.
  const entries: JournalEntry[] = [...prefix];
  const steps: JournalEntry[] = [];
  const top = { ...newest, files };
  for (let i = 1; i < chain.length; i++) {
    const newer = i === 1 ? { files: top.files, manifest: draft } : { files: chain[i - 1]!.files, manifest: JSON.parse(chain[i - 1]!.manifest) as Json };
    steps.push(await entryBetween(newer, chain[i]!, chain[i - 1]!.version, new Map(), keepMedia));
  }
  entries.push(...steps.reverse());
  const journalBytes = serializeJournal({ format: JOURNAL_FORMAT, entries });
  const integrity = await sriSha256(journalBytes);
  const manifestOut: Json = { ...draft, resources: resources.map((r) => (r.url === JOURNAL_PATH ? { ...r, integrity } : r)) };
  const out: ZipEntryInput[] = [];
  const written = new Set<string>();
  for (const e of c.entries) {
    if (e.name.endsWith('/') || removedBlobs.has(e.name)) continue;
    const data = e.name === 'manifest.json' ? utf8(JSON.stringify(manifestOut, null, 2) + '\n') : e.name === JOURNAL_PATH ? journalBytes : (files.get(e.name) ?? e.data);
    out.push({ name: e.name, data, compression: e.name === 'mimetype' ? 'store' : 'auto' });
    written.add(e.name);
  }
  for (const p of [...addedFiles.keys()].sort()) {
    if (written.has(p)) continue;
    out.push({ name: p, data: p === JOURNAL_PATH ? journalBytes : needed.get(p)!.data, compression: 'auto' });
  }
  const modified = typeof manifest.dateModified === 'string' ? manifest.dateModified : '1980-01-01T00:00:00Z';
  return writeZip(await refreshMachineViews(out), { modified: new Date(modified) });
}

/**
 * Records the step from `before` to `after` in the journal of `after`: `after` must carry one
 * more `history` entry than `before` (the writer of `after` added it). If `before` has no journal
 * and `create` is not set, `after` is returned unchanged.
 */
export async function recordVersion(before: Uint8Array | ReadContainer, after: Uint8Array, options: RecordOptions = {}): Promise<Uint8Array> {
  const b = before instanceof Uint8Array ? await readContainer(before) : before;
  const prior = journalOf(b);
  if (!prior && !options.create) return after;
  const a = await readContainer(after);
  const beforeManifest = JSON.parse(fromUtf8(b.files.get('manifest.json')!)) as Json;
  const afterManifest = JSON.parse(fromUtf8(a.files.get('manifest.json')!)) as Json;
  const from = lastVersion(beforeManifest);
  const version = lastVersion(afterManifest);
  if (version !== from + 1) throw new JournalError(`history must advance by one version (before ${from}, after ${version})`);
  const chain = historyEntry(afterManifest, version)?.manifestIntegrity;
  if (chain !== (await sriSha256(b.files.get('manifest.json')!))) throw new JournalError(`history[${version}].manifestIntegrity does not match the manifest of version ${from}`);
  // A gap (a writer without journal in between) starts the journal anew: earlier entries cannot be chained.
  const prefix = prior && (prior.entries.length === 0 || prior.entries[prior.entries.length - 1]!.version === from) ? prior.entries : [];
  return installJournal(after, [snapshotOf(b, from)], prefix, options.keepMedia ?? true);
}

/** `recordVersion` without `create`: continues an existing journal, otherwise returns `after`. */
export function continueJournal(before: Uint8Array | ReadContainer, after: Uint8Array): Promise<Uint8Array> {
  return recordVersion(before, after, {});
}
