/**
 * Comparison of two versions of a document (docs/10, promise 4: "der Vergleich zweier Fassungen
 * zeigt die Änderung als Textänderung, nicht als Bilddifferenz").
 *
 * Both versions are read as block models (`model.ts`). Blocks are paired
 *   1. by id — the stable addresses of HP-ADR-004 make this the normal case,
 *   2. for blocks without id: by an alignment of kind and text (Myers), then remaining blocks of
 *      the same kind next to each other count as changed when their words overlap enough,
 *   3. tables row by row (alignment of the row texts), so that an inserted row is one change and
 *      not a shift of every cell below.
 * Reported: changed headings (text, level), paragraphs, list items, cells, captions, footnotes
 * (with a word-level difference), added/removed/moved blocks, added/removed/replaced images
 * (file hash compared), alternative texts, links, list types, rows and columns, documents,
 * other files, metadata, locks and redactions.
 */
import type { Document } from '@xmldom/xmldom';
import { fromUtf8 } from '../bytes.js';
import { readContainer } from '../container.js';
import { parseXml, resolveHref, XHTML_TYPE } from '../lock/xml.js';
import { columnLetters, textOf } from './dom.js';
import { BLOB_DIR, JOURNAL_PATH, snapshotAt, type Snapshot } from './journal.js';
import { extractBlocks, type BlockRecord } from './model.js';
import { diffSequences, wordTokens } from './sequence.js';
import { buildGrid } from './table.js';

type Json = Record<string, unknown>;

export type ChangeKind =
  | 'heading-changed' | 'heading-level-changed' | 'paragraph-changed' | 'list-item-changed' | 'cell-changed' | 'caption-changed' | 'footnote-changed' | 'text-changed'
  | 'block-added' | 'block-removed' | 'block-moved' | 'type-changed'
  | 'image-added' | 'image-removed' | 'image-replaced' | 'alt-changed' | 'link-changed' | 'list-type-changed'
  | 'footnote-added' | 'footnote-removed'
  | 'row-added' | 'row-removed' | 'column-added' | 'column-removed'
  | 'document-added' | 'document-removed' | 'resource-added' | 'resource-removed' | 'resource-changed' | 'metadata-changed' | 'redaction';

export interface WordOp {
  readonly op: '=' | '-' | '+';
  readonly text: string;
}

export interface Change {
  readonly kind: ChangeKind;
  readonly path: string;
  /** Element name in the newer (or, if removed, the older) version. */
  readonly tag?: string;
  /** Pointer in the older version. */
  readonly from?: string;
  /** Pointer in the newer version. */
  readonly to?: string;
  readonly before?: string;
  readonly after?: string;
  readonly words?: readonly WordOp[];
  readonly detail?: string;
}

export interface VersionLabel {
  readonly label: string;
  readonly version?: number;
  readonly dateModified?: string;
  readonly name?: string;
}

export interface DiffResult {
  readonly from: VersionLabel;
  readonly to: VersionLabel;
  readonly changes: readonly Change[];
  readonly counts: Readonly<Record<string, number>>;
}

/** One version: its files and its manifest. */
export interface VersionView {
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly manifest: Json;
}

export const CHANGE_LABEL: Readonly<Record<ChangeKind, string>> = {
  'heading-changed': 'Überschrift geändert',
  'heading-level-changed': 'Überschriftenebene geändert',
  'paragraph-changed': 'Absatz geändert',
  'list-item-changed': 'Listenpunkt geändert',
  'cell-changed': 'Zelle geändert',
  'caption-changed': 'Beschriftung geändert',
  'footnote-changed': 'Fußnote geändert',
  'text-changed': 'Text geändert',
  'block-added': 'Block eingefügt',
  'block-removed': 'Block entfernt',
  'block-moved': 'Block verschoben',
  'type-changed': 'Blockart geändert',
  'image-added': 'Bild eingefügt',
  'image-removed': 'Bild entfernt',
  'image-replaced': 'Bild ersetzt',
  'alt-changed': 'Alternativtext geändert',
  'link-changed': 'Verweis geändert',
  'list-type-changed': 'Listenart geändert',
  'footnote-added': 'Fußnote eingefügt',
  'footnote-removed': 'Fußnote entfernt',
  'row-added': 'Tabellenzeile eingefügt',
  'row-removed': 'Tabellenzeile entfernt',
  'column-added': 'Tabellenspalte eingefügt',
  'column-removed': 'Tabellenspalte entfernt',
  'document-added': 'Inhaltsdokument hinzugefügt',
  'document-removed': 'Inhaltsdokument entfernt',
  'resource-added': 'Datei hinzugefügt',
  'resource-removed': 'Datei entfernt',
  'resource-changed': 'Datei geändert',
  'metadata-changed': 'Metadaten geändert',
  redaction: 'Redaktion',
};

const TEXT_KIND: Partial<Record<string, ChangeKind>> = { heading: 'heading-changed', paragraph: 'paragraph-changed', 'list-item': 'list-item-changed', caption: 'caption-changed', figcaption: 'caption-changed', cell: 'cell-changed' };
const BLOCK_NAME: Record<string, string> = {
  heading: 'Überschrift', paragraph: 'Absatz', list: 'Liste', 'list-item': 'Listenpunkt', table: 'Tabelle', figure: 'Abbildung', figcaption: 'Bildunterschrift', image: 'Bild', media: 'Medium',
  footnote: 'Fußnote', section: 'Abschnitt', aside: 'Randnotiz', details: 'Aufklappbereich', summary: 'Zusammenfassung', blockquote: 'Zitat', code: 'Codeblock', term: 'Begriff', definition: 'Erklärung', container: 'Bereich', endnotes: 'Endnoten', caption: 'Tabellenbeschriftung',
};

export async function viewOf(input: Uint8Array | Snapshot): Promise<VersionView> {
  if (input instanceof Uint8Array) {
    const c = await readContainer(input);
    return { files: c.files, manifest: JSON.parse(fromUtf8(c.files.get('manifest.json')!)) as Json };
  }
  return { files: input.files, manifest: JSON.parse(input.manifest) as Json };
}

async function toView(x: Uint8Array | Snapshot | VersionView): Promise<VersionView> {
  if (x instanceof Uint8Array || typeof x.manifest === 'string') return viewOf(x as Uint8Array | Snapshot);
  return x as VersionView;
}

function labelOf(v: VersionView, fallback: string): VersionLabel {
  const h = Array.isArray(v.manifest.history) ? (v.manifest.history as Json[]) : [];
  const version = h.length > 0 ? Math.max(...h.map((x) => Number(x.version) || 0)) : 0;
  return { label: fallback, version, ...(typeof v.manifest.dateModified === 'string' ? { dateModified: v.manifest.dateModified } : {}), ...(typeof v.manifest.name === 'string' ? { name: v.manifest.name } : {}) };
}

function words(a: string, b: string): WordOp[] {
  const x = wordTokens(a);
  const y = wordTokens(b);
  const out: WordOp[] = [];
  const push = (op: WordOp['op'], text: string) => {
    if (text === '') return;
    const last = out[out.length - 1];
    if (last && last.op === op) out[out.length - 1] = { op, text: last.text + text };
    else out.push({ op, text });
  };
  for (const d of diffSequences(x, y)) {
    if (d.kind === 'equal') push('=', x.slice(d.a, d.a + d.length).join(''));
    else if (d.kind === 'delete') push('-', x.slice(d.a, d.a + d.length).join(''));
    else push('+', y.slice(d.b, d.b + d.length).join(''));
  }
  return out;
}

/** Share of common words (Dice coefficient over word multisets). */
function similarity(a: string, b: string): number {
  const wa = a.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const wb = b.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (wa.length === 0 && wb.length === 0) return 1;
  const count = new Map<string, number>();
  for (const w of wa) count.set(w, (count.get(w) ?? 0) + 1);
  let common = 0;
  for (const w of wb) {
    const n = count.get(w) ?? 0;
    if (n > 0) {
      common++;
      count.set(w, n - 1);
    }
  }
  return (2 * common) / (wa.length + wb.length);
}

function contentDocs(v: VersionView): string[] {
  const order = (Array.isArray(v.manifest.readingOrder) ? (v.manifest.readingOrder as Array<{ url: string }>) : []).map((r) => r.url);
  return order.filter((p) => v.files.has(p));
}

function integrityOf(v: VersionView, path: string): string | undefined {
  const r = (Array.isArray(v.manifest.resources) ? (v.manifest.resources as Array<{ url: string; integrity?: string }>) : []).find((x) => x.url === path);
  return r?.integrity;
}

const short = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Compares two versions; `a` is the older. */
export async function diffContainers(a: Uint8Array | Snapshot | VersionView, b: Uint8Array | Snapshot | VersionView, labels: { from?: string; to?: string } = {}): Promise<DiffResult> {
  const va = await toView(a);
  const vb = await toView(b);
  const changes: Change[] = [];
  const docsA = contentDocs(va);
  const docsB = contentDocs(vb);
  for (const p of docsA) if (!docsB.includes(p)) changes.push({ kind: 'document-removed', path: p });
  for (const p of docsB) if (!docsA.includes(p)) changes.push({ kind: 'document-added', path: p });
  for (const p of docsB) {
    if (!docsA.includes(p)) continue;
    const da = va.files.get(p)!;
    const db = vb.files.get(p)!;
    if (da.length === db.length && da.every((x, i) => x === db[i])) continue;
    changes.push(...compareDocument(p, parseXml(fromUtf8(da), p), parseXml(fromUtf8(db), p), va, vb));
  }
  changes.push(...compareFiles(va, vb, [...docsA, ...docsB]));
  changes.push(...compareMetadata(va, vb));
  const counts: Record<string, number> = {};
  for (const c of changes) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
  return { from: labelOf(va, labels.from ?? 'ältere Fassung'), to: labelOf(vb, labels.to ?? 'neuere Fassung'), changes, counts };
}

/** Compares two versions rebuilt from the journal of one file. */
export async function diffVersions(bytes: Uint8Array, from: number, to: number): Promise<DiffResult> {
  const c = await readContainer(bytes);
  const [a, b] = [await snapshotAt(c, from), await snapshotAt(c, to)];
  return diffContainers(a, b, { from: `Fassung ${from}`, to: `Fassung ${to}` });
}

interface Pair {
  readonly a: BlockRecord;
  readonly b: BlockRecord;
}

function compareDocument(path: string, docA: Document, docB: Document, va: VersionView, vb: VersionView): Change[] {
  const all = { a: extractBlocks(docA, path), b: extractBlocks(docB, path) };
  // Cells and captions are compared table by table.
  const generic = (list: BlockRecord[]) => list.filter((r) => r.kind !== 'cell' && r.kind !== 'caption' && !(r.kind !== 'table' && list.some((t) => t.kind === 'table' && r.parent !== null && isInsideTable(r, t, list))));
  const A = generic(all.a);
  const B = generic(all.b);
  const pairs: Pair[] = [];
  const pairedA = new Set<BlockRecord>();
  const pairedB = new Set<BlockRecord>();
  const byIdB = new Map(B.filter((r) => r.id).map((r) => [r.id!, r]));
  for (const r of A) {
    const m = r.id ? byIdB.get(r.id) : undefined;
    if (m && !pairedB.has(m)) {
      pairs.push({ a: r, b: m });
      pairedA.add(r);
      pairedB.add(m);
    }
  }
  const restA = A.filter((r) => !pairedA.has(r));
  const restB = B.filter((r) => !pairedB.has(r));
  const key = (r: BlockRecord) => `${r.kind}\u0000${r.tag}\u0000${r.text}\u0000${r.attrs?.src ?? ''}`;
  const ops = diffSequences(restA.map(key), restB.map(key));
  let pendingA: BlockRecord[] = [];
  let pendingB: BlockRecord[] = [];
  const flush = () => {
    // Same kind, in order, similar enough → changed; the rest is removed/added.
    const usedB = new Set<BlockRecord>();
    for (const x of pendingA) {
      const y = pendingB.find((c) => !usedB.has(c) && c.kind === x.kind && (x.kind === 'image' ? true : similarity(x.text, c.text) >= 0.3 || (x.text === '' && c.text === '')));
      if (y) {
        usedB.add(y);
        pairs.push({ a: x, b: y });
        pairedA.add(x);
        pairedB.add(y);
      }
    }
    pendingA = [];
    pendingB = [];
  };
  for (const op of ops) {
    if (op.kind === 'equal') {
      flush();
      for (let i = 0; i < op.length; i++) {
        pairs.push({ a: restA[op.a + i]!, b: restB[op.b + i]! });
        pairedA.add(restA[op.a + i]!);
        pairedB.add(restB[op.b + i]!);
      }
    } else if (op.kind === 'delete') pendingA.push(...restA.slice(op.a, op.a + op.length));
    else pendingB.push(...restB.slice(op.b, op.b + op.length));
  }
  flush();

  const changes: Change[] = [];
  const pairOfA = new Map(pairs.map((p) => [p.a, p]));
  const pairOfB = new Map(pairs.map((p) => [p.b, p]));
  const recA = new Map(A.map((r) => [r.pointer, r]));
  const recB = new Map(B.map((r) => [r.pointer, r]));
  const parentA = (r: BlockRecord) => (r.parent ? recA.get(r.parent) : undefined);
  const parentB = (r: BlockRecord) => (r.parent ? recB.get(r.parent) : undefined);

  // Removed blocks: report the outermost one only.
  for (const r of A) {
    if (pairedA.has(r)) continue;
    const p = parentA(r);
    if (p && !pairedA.has(p)) continue;
    changes.push(removedChange(path, r, A, va));
  }
  for (const r of B) {
    if (pairedB.has(r)) continue;
    const p = parentB(r);
    if (p && !pairedB.has(p)) continue;
    changes.push(addedChange(path, r, B, vb));
  }
  // Moves: paired blocks whose order changed (longest increasing subsequence) or whose parent changed.
  const orderB = new Map(B.map((r, i) => [r, i]));
  const seq = A.filter((r) => pairedA.has(r)).map((r) => orderB.get(pairOfA.get(r)!.b)!);
  const keep = lis(seq);
  const movedA = new Set<BlockRecord>();
  A.filter((r) => pairedA.has(r)).forEach((r, i) => {
    const p = pairOfA.get(r)!;
    const pa = parentA(r);
    const pb = parentB(p.b);
    const parentChanged = (pa ? pairOfA.get(pa)?.b : undefined) !== pb;
    if ((!keep.has(i) || parentChanged) && ['section', 'heading', 'paragraph', 'list', 'list-item', 'table', 'figure', 'code', 'blockquote', 'aside', 'details', 'footnote'].includes(r.kind)) {
      if (pa && movedA.has(pa)) return movedA.add(r), undefined;
      if (r.kind === 'footnote') return; // footnotes follow their reference
      movedA.add(r);
      changes.push({ kind: 'block-moved', path, tag: p.b.tag, from: r.pointer, to: p.b.pointer, before: short(r.text || headingOf(r, A)), detail: parentChanged ? 'anderer übergeordneter Block' : 'andere Reihenfolge' });
    }
  });
  for (const { a, b } of pairs) changes.push(...comparePair(path, a, b, A, B, va, vb, all));
  // A removed block is listed where it stood: before the first later block that is still there.
  const removedAt = new Map<string, number>();
  A.forEach((r, i) => {
    if (pairedA.has(r)) return;
    const next = A.slice(i + 1).find((x) => pairedA.has(x));
    removedAt.set(r.pointer, next ? B.indexOf(pairOfA.get(next)!.b) - 0.5 : B.length);
  });
  return sortChanges(changes, B, removedAt);
}

function isInsideTable(r: BlockRecord, table: BlockRecord, list: readonly BlockRecord[]): boolean {
  for (let p: string | null = r.parent; p; p = list.find((x) => x.pointer === p)?.parent ?? null) if (p === table.pointer) return true;
  return false;
}

function headingOf(r: BlockRecord, list: readonly BlockRecord[]): string {
  const h = list.find((x) => x.parent === r.pointer && x.kind === 'heading');
  return h?.text ?? '';
}

function lis(seq: readonly number[]): Set<number> {
  const tails: number[] = [];
  const tailIdx: number[] = [];
  const prev: number[] = new Array(seq.length).fill(-1);
  seq.forEach((v, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid]! < v) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = v;
    tailIdx[lo] = i;
    prev[i] = lo > 0 ? tailIdx[lo - 1]! : -1;
  });
  const out = new Set<number>();
  for (let i = tails.length ? tailIdx[tails.length - 1]! : -1; i >= 0; i = prev[i]!) out.add(i);
  return out;
}

function sortChanges(changes: Change[], B: readonly BlockRecord[], removedAt: ReadonlyMap<string, number>): Change[] {
  const order = new Map(B.map((r, i) => [r.pointer, i]));
  const pos = (c: Change) => order.get(c.to ?? '') ?? (c.to === undefined ? removedAt.get(c.from ?? '') : undefined) ?? order.get(c.from ?? '') ?? -1;
  return changes.map((c, i) => ({ c, i })).sort((x, y) => pos(x.c) - pos(y.c) || x.i - y.i).map((x) => x.c);
}

function imagePath(v: VersionView, docPath: string, src: string | undefined): string | undefined {
  return src ? resolveHref(docPath, src)?.path : undefined;
}

function summarize(r: BlockRecord, list: readonly BlockRecord[]): string {
  const inside = list.filter((x) => isDescendant(x, r, list));
  const n = (k: string) => inside.filter((x) => x.kind === k).length;
  const parts = [
    n('paragraph') ? `${n('paragraph')} Absatz/Absätze` : '',
    n('list') ? `${n('list')} Liste(n)` : '',
    n('table') ? `${n('table')} Tabelle(n)` : '',
    n('image') ? `${n('image')} Bild(er)` : '',
    n('footnote') ? `${n('footnote')} Fußnote(n)` : '',
  ].filter(Boolean);
  return parts.join(', ');
}

function isDescendant(x: BlockRecord, r: BlockRecord, list: readonly BlockRecord[]): boolean {
  for (let p = x.parent; p; p = list.find((y) => y.pointer === p)?.parent ?? null) if (p === r.pointer) return true;
  return false;
}

function removedChange(path: string, r: BlockRecord, list: readonly BlockRecord[], v: VersionView): Change {
  const image = r.kind === 'image' ? r : r.kind === 'figure' ? list.find((x) => x.kind === 'image' && isDescendant(x, r, list)) : undefined;
  if (image) {
    const caption = list.find((x) => x.kind === 'figcaption' && isDescendant(x, r, list));
    const file = imagePath(v, path, image.attrs?.src);
    return { kind: 'image-removed', path, tag: r.tag, from: r.pointer, before: image.attrs?.alt ?? '', detail: [file ? `Datei ${file}` : '', caption ? `Bildunterschrift „${short(caption.text)}“` : ''].filter(Boolean).join('; ') };
  }
  if (r.kind === 'footnote') return { kind: 'footnote-removed', path, tag: r.tag, from: r.pointer, before: textBelow(r, list) };
  const label = r.text || headingOf(r, list) || short(textBelow(r, list), 200);
  const detail = summarize(r, list);
  return { kind: 'block-removed', path, tag: r.tag, from: r.pointer, before: short(label, 200), ...(detail ? { detail: `${BLOCK_NAME[r.kind] ?? r.tag}: ${detail}` } : { detail: BLOCK_NAME[r.kind] ?? r.tag }) };
}

function addedChange(path: string, r: BlockRecord, list: readonly BlockRecord[], v: VersionView): Change {
  const image = r.kind === 'image' ? r : r.kind === 'figure' ? list.find((x) => x.kind === 'image' && isDescendant(x, r, list)) : undefined;
  if (image) {
    const caption = list.find((x) => x.kind === 'figcaption' && isDescendant(x, r, list));
    const file = imagePath(v, path, image.attrs?.src);
    return { kind: 'image-added', path, tag: r.tag, to: r.pointer, after: image.attrs?.alt ?? '', detail: [file ? `Datei ${file}` : '', caption ? `Bildunterschrift „${short(caption.text)}“` : ''].filter(Boolean).join('; ') };
  }
  if (r.kind === 'footnote') return { kind: 'footnote-added', path, tag: r.tag, to: r.pointer, after: textBelow(r, list) };
  const label = r.text || headingOf(r, list) || short(textBelow(r, list), 200);
  const detail = summarize(r, list);
  return { kind: 'block-added', path, tag: r.tag, to: r.pointer, after: short(label, 200), ...(detail ? { detail: `${BLOCK_NAME[r.kind] ?? r.tag}: ${detail}` } : { detail: BLOCK_NAME[r.kind] ?? r.tag }) };
}

function textBelow(r: BlockRecord, list: readonly BlockRecord[]): string {
  return list.filter((x) => isDescendant(x, r, list) && x.text).map((x) => x.text).join(' ');
}

function comparePair(path: string, a: BlockRecord, b: BlockRecord, A: readonly BlockRecord[], B: readonly BlockRecord[], va: VersionView, vb: VersionView, all: { a: BlockRecord[]; b: BlockRecord[] }): Change[] {
  const out: Change[] = [];
  const base = { path, tag: b.tag, from: a.pointer, to: b.pointer };
  if (a.tag !== b.tag) {
    if (a.kind === 'heading' && b.kind === 'heading') out.push({ ...base, kind: 'heading-level-changed', before: a.tag, after: b.tag, detail: `„${short(b.text)}“` });
    else if (a.kind === 'list' && b.kind === 'list') out.push({ ...base, kind: 'list-type-changed', before: a.tag === 'ol' ? 'nummeriert' : 'Aufzählung', after: b.tag === 'ol' ? 'nummeriert' : 'Aufzählung' });
    else out.push({ ...base, kind: 'type-changed', before: BLOCK_NAME[a.kind] ?? a.tag, after: BLOCK_NAME[b.kind] ?? b.tag, detail: `„${short(b.text)}“` });
  } else if (a.kind === 'list' && (a.attrs?.start ?? '1') !== (b.attrs?.start ?? '1')) {
    out.push({ ...base, kind: 'list-type-changed', before: `Beginn ${a.attrs?.start ?? '1'}`, after: `Beginn ${b.attrs?.start ?? '1'}` });
  }
  if (a.text !== b.text && b.kind !== 'table') {
    const inFootnote = B.find((x) => x.pointer === b.parent)?.kind === 'footnote';
    const kind: ChangeKind = inFootnote ? 'footnote-changed' : (TEXT_KIND[b.kind] ?? 'text-changed');
    out.push({ ...base, kind, before: a.text, after: b.text, words: words(a.text, b.text), ...(inFootnote ? { detail: `Fußnote ${b.parent!.replace(/^.*#/, '')}` } : {}) });
  }
  if (b.kind === 'image' || b.kind === 'media') {
    const fa = imagePath(va, path, a.attrs?.src);
    const fb = imagePath(vb, path, b.attrs?.src);
    const ia = fa ? integrityOf(va, fa) : undefined;
    const ib = fb ? integrityOf(vb, fb) : undefined;
    if (fa !== fb || ia !== ib) out.push({ ...base, kind: 'image-replaced', before: fa ?? '', after: fb ?? '', detail: fa === fb ? 'gleicher Dateiname, anderer Inhalt (SHA-256)' : 'andere Datei' });
    if ((a.attrs?.alt ?? '') !== (b.attrs?.alt ?? '')) out.push({ ...base, kind: 'alt-changed', before: a.attrs?.alt ?? '', after: b.attrs?.alt ?? '', words: words(a.attrs?.alt ?? '', b.attrs?.alt ?? '') });
  }
  const la = (a.links ?? []).join(' ');
  const lb = (b.links ?? []).join(' ');
  if (la !== lb) out.push({ ...base, kind: 'link-changed', before: la, after: lb });
  const na = (a.notes ?? []).length;
  const nb = (b.notes ?? []).length;
  if (na !== nb && !out.some((c) => c.words)) out.push({ ...base, kind: 'text-changed', before: `${na} Fußnotenverweis(e)`, after: `${nb} Fußnotenverweis(e)`, detail: 'Fußnotenverweise' });
  if (b.kind === 'table') out.push(...compareTable(path, a, b, all));
  return out;
}

/** A row for the report: cells joined by " | "; an empty row is named as such. */
function rowText(key: string): string {
  const cells = key.split('\u0002').filter((v) => v !== '\u0001');
  return cells.every((c) => c.trim() === '') ? '(leere Zeile)' : cells.join(' | ');
}

function compareTable(path: string, a: BlockRecord, b: BlockRecord, all: { a: BlockRecord[]; b: BlockRecord[] }): Change[] {
  const out: Change[] = [];
  const capA = all.a.find((x) => x.kind === 'caption' && x.parent === a.pointer);
  const capB = all.b.find((x) => x.kind === 'caption' && x.parent === b.pointer);
  if ((capA?.text ?? '') !== (capB?.text ?? '')) out.push({ kind: 'caption-changed', path, tag: 'caption', from: capA?.pointer ?? a.pointer, to: capB?.pointer ?? b.pointer, before: capA?.text ?? '', after: capB?.text ?? '', words: words(capA?.text ?? '', capB?.text ?? '') });
  const ga = buildGrid(a.el);
  const gb = buildGrid(b.el);
  const cellText = (g: ReturnType<typeof buildGrid>, r: number, c: number) => {
    const cell = g.grid[r]?.[c];
    return cell && cell.row === r && cell.col === c ? textOf(cell.el) : cell ? '\u0001' : '';
  };
  // Columns: align the first row when the width changed.
  let colMap: Array<[number | null, number | null]> = [];
  if (ga.width === gb.width) colMap = Array.from({ length: ga.width }, (_, i) => [i, i] as [number, number]);
  else {
    const ha = Array.from({ length: ga.width }, (_, c) => Array.from({ length: ga.grid.length }, (_, r) => cellText(ga, r, c)).join('\u0002'));
    const hb = Array.from({ length: gb.width }, (_, c) => Array.from({ length: gb.grid.length }, (_, r) => cellText(gb, r, c)).join('\u0002'));
    const head = (h: string[], g: ReturnType<typeof buildGrid>) => h.map((_, c) => cellText(g, 0, c));
    for (const d of diffSequences(head(ha, ga), head(hb, gb))) {
      if (d.kind === 'equal') for (let i = 0; i < d.length; i++) colMap.push([d.a + i, d.b + i]);
      else if (d.kind === 'delete') for (let i = 0; i < d.length; i++) colMap.push([d.a + i, null]);
      else for (let i = 0; i < d.length; i++) colMap.push([null, d.b + i]);
    }
  }
  const tid = b.id ?? a.id ?? '';
  for (const [ca, cb] of colMap) {
    if (ca === null) out.push({ kind: 'column-added', path, tag: 'table', to: b.pointer, after: cellText(gb, 0, cb!), detail: `Spalte ${columnLetters(cb! + 1)}` });
    if (cb === null && ca !== null) out.push({ kind: 'column-removed', path, tag: 'table', from: a.pointer, before: cellText(ga, 0, ca), detail: `Spalte ${columnLetters(ca + 1)}` });
  }
  const shared = colMap.filter((m): m is [number, number] => m[0] !== null && m[1] !== null);
  const rowKey = (g: ReturnType<typeof buildGrid>, r: number, side: 0 | 1) => shared.map((m) => cellText(g, r, m[side])).join('\u0002');
  const rowsA = ga.grid.map((_, r) => rowKey(ga, r, 0));
  const rowsB = gb.grid.map((_, r) => rowKey(gb, r, 1));
  const pairsR: Array<[number, number]> = [];
  let pa: number[] = [];
  let pb: number[] = [];
  const flush = () => {
    const n = Math.min(pa.length, pb.length);
    // Rows of a replaced run count as changed when they share cells, else removed/added.
    const used = new Set<number>();
    for (const x of pa) {
      const y = pb.find((k) => !used.has(k) && rowsA[x]!.split('\u0002').filter((v, i) => v !== '' && v === rowsB[k]!.split('\u0002')[i]).length > 0);
      if (y !== undefined) {
        used.add(y);
        pairsR.push([x, y]);
      } else out.push({ kind: 'row-removed', path, tag: 'tr', from: a.pointer, before: rowText(rowsA[x]!), detail: `Zeile ${x + 1}` });
    }
    for (const y of pb) if (!used.has(y)) out.push({ kind: 'row-added', path, tag: 'tr', to: b.pointer, after: rowText(rowsB[y]!), detail: `Zeile ${y + 1}` });
    void n;
    pa = [];
    pb = [];
  };
  for (const d of diffSequences(rowsA, rowsB)) {
    if (d.kind === 'equal') {
      flush();
      for (let i = 0; i < d.length; i++) pairsR.push([d.a + i, d.b + i]);
    } else if (d.kind === 'delete') for (let i = 0; i < d.length; i++) pa.push(d.a + i);
    else for (let i = 0; i < d.length; i++) pb.push(d.b + i);
  }
  flush();
  for (const [ra, rb] of pairsR) {
    for (const [ca, cb] of shared) {
      const x = cellText(ga, ra, ca);
      const y = cellText(gb, rb, cb);
      if (x === y || x === '\u0001' || y === '\u0001') continue;
      const addrA = `${columnLetters(ca + 1)}${ra + 1}`;
      const addrB = `${columnLetters(cb + 1)}${rb + 1}`;
      out.push({ kind: 'cell-changed', path, tag: gb.grid[rb]![cb]!.el.localName ?? 'td', from: tid ? `${path}#${a.id ?? tid}.${addrA}` : a.pointer, to: tid ? `${path}#${tid}.${addrB}` : b.pointer, before: x, after: y, words: words(x, y), detail: `Zelle ${addrB}${addrA !== addrB ? ` (vorher ${addrA})` : ''}` });
    }
  }
  return out;
}

// Annotations are compared on their own (annotate.diffAnnotations), not as files; the machine view
// (S9) is derived from the content documents and changes with them.
const SKIP_FILES = (p: string) => p === JOURNAL_PATH || p.startsWith(BLOB_DIR) || p === 'package.opf' || p === 'data/redaction-log.json' || p.startsWith('annotations/') || p.startsWith('machine/');

function compareFiles(va: VersionView, vb: VersionView, docs: readonly string[]): Change[] {
  const out: Change[] = [];
  const ra = new Map((Array.isArray(va.manifest.resources) ? (va.manifest.resources as Array<{ url: string; type: string; integrity: string }>) : []).map((r) => [r.url, r]));
  const rb = new Map((Array.isArray(vb.manifest.resources) ? (vb.manifest.resources as Array<{ url: string; type: string; integrity: string }>) : []).map((r) => [r.url, r]));
  const isMain = (p: string) => !p.startsWith('renditions/');
  for (const [p, r] of ra) {
    if (SKIP_FILES(p) || docs.includes(p) || !isMain(p) || r.type === XHTML_TYPE) continue;
    const s = rb.get(p);
    if (!s) out.push({ kind: 'resource-removed', path: p, detail: r.type });
    else if (s.integrity !== r.integrity) out.push({ kind: 'resource-changed', path: p, detail: `${r.type}, SHA-256 ${r.integrity.slice(7, 19)}… → ${s.integrity.slice(7, 19)}…` });
  }
  for (const [p, r] of rb) if (!ra.has(p) && !SKIP_FILES(p) && !docs.includes(p) && isMain(p) && r.type !== XHTML_TYPE) out.push({ kind: 'resource-added', path: p, detail: r.type });
  return out;
}

function compareMetadata(va: VersionView, vb: VersionView): Change[] {
  const out: Change[] = [];
  const show = (v: unknown) => (v === undefined ? '–' : typeof v === 'string' ? v : JSON.stringify(v));
  for (const [key, name] of [['name', 'Titel'], ['inLanguage', 'Sprache'], ['author', 'Autor'], ['conformsTo', 'Profil'], ['access', 'Sperren']] as const) {
    const x = va.manifest[key];
    const y = vb.manifest[key];
    if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ kind: 'metadata-changed', path: 'manifest.json', before: show(x), after: show(y), detail: name });
  }
  const rendA = (Array.isArray(va.manifest.renditions) ? (va.manifest.renditions as Json[]) : []).map((r) => String(r.id));
  const rendB = (Array.isArray(vb.manifest.renditions) ? (vb.manifest.renditions as Json[]) : []).map((r) => String(r.id));
  for (const r of rendB) if (!rendA.includes(r)) out.push({ kind: 'metadata-changed', path: `renditions/${r}/`, after: r, detail: 'eingefrorene Fassung hinzugefügt' });
  for (const r of rendA) if (!rendB.includes(r)) out.push({ kind: 'metadata-changed', path: `renditions/${r}/`, before: r, detail: 'eingefrorene Fassung entfernt' });
  const logA = va.files.get('data/redaction-log.json');
  const logB = vb.files.get('data/redaction-log.json');
  const na = logA ? (JSON.parse(fromUtf8(logA)) as unknown[]).length : 0;
  const nb = logB ? (JSON.parse(fromUtf8(logB)) as Array<{ target?: string }>) : [];
  if (nb.length > na) out.push({ kind: 'redaction', path: 'data/redaction-log.json', detail: `${nb.length - na} neue(r) Eintrag/Einträge im Redaktionsprotokoll: ${nb.slice(na).map((e) => e.target ?? '').join(', ')}` });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Reports

function wordDiffText(w: readonly WordOp[]): string {
  return w.map((x) => (x.op === '=' ? x.text : x.op === '-' ? `[-${x.text}-]` : `{+${x.text}+}`)).join('');
}

function versionLine(v: VersionLabel): string {
  return `${v.label}${v.version !== undefined ? ` (Verlauf ${v.version}` : ''}${v.dateModified ? `, ${v.dateModified}` : ''}${v.version !== undefined ? ')' : ''}`;
}

/** Plain-text report: one paragraph per change; word changes as [-entfernt-]{+eingefügt+}. */
export function diffText(r: DiffResult): string {
  const lines = [`Vergleich: ${versionLine(r.from)} → ${versionLine(r.to)}`, `${r.changes.length} Änderung(en)${r.changes.length ? ': ' + Object.entries(r.counts).map(([k, n]) => `${CHANGE_LABEL[k as ChangeKind]} ${n}`).join(', ') : ''}`, ''];
  for (const c of r.changes) {
    const where = c.to ?? c.from ?? c.path;
    lines.push(`* ${CHANGE_LABEL[c.kind]}: ${where}${c.from && c.to && c.from !== c.to ? ` (vorher ${c.from})` : ''}${c.detail ? ` – ${c.detail}` : ''}`);
    if (c.words && c.words.some((w) => w.op !== '=')) {
      if ((c.before ?? '').length + (c.after ?? '').length < 160) {
        lines.push(`    - ${c.before ?? ''}`);
        lines.push(`    + ${c.after ?? ''}`);
      }
      lines.push(`    ~ ${wordDiffText(c.words)}`);
    } else {
      if (c.before !== undefined && c.before !== '') lines.push(`    - ${c.before}`);
      if (c.after !== undefined && c.after !== '') lines.push(`    + ${c.after}`);
    }
  }
  return lines.join('\n') + '\n';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The comparison as standalone XHTML (ins/del with readable labels, no script). */
export function diffXhtml(r: DiffResult, lang = 'de'): string {
  const title = `Vergleich ${r.from.label} → ${r.to.label}`;
  const rows = r.changes
    .map((c, i) => {
      const where = esc(c.to ?? c.from ?? c.path);
      let body = '';
      if (c.words && c.words.some((w) => w.op !== '=')) body = `<p class="words">${c.words.map((w) => (w.op === '=' ? esc(w.text) : w.op === '-' ? `<del><span class="sr">[entfernt: </span>${esc(w.text)}<span class="sr">]</span></del>` : `<ins><span class="sr">[eingefügt: </span>${esc(w.text)}<span class="sr">]</span></ins>`)).join('')}</p>`;
      else {
        if (c.before) body += `<p><del><span class="sr">vorher: </span>${esc(c.before)}</del></p>`;
        if (c.after) body += `<p><ins><span class="sr">nachher: </span>${esc(c.after)}</ins></p>`;
      }
      return `    <section id="c${i + 1}" class="change ${c.kind}">\n      <h2 id="c${i + 1}-h">${esc(CHANGE_LABEL[c.kind])}</h2>\n      <p class="where"><code>${where}</code>${c.from && c.to && c.from !== c.to ? ` (vorher <code>${esc(c.from)}</code>)` : ''}${c.detail ? ` – ${esc(c.detail)}` : ''}</p>\n      ${body}\n    </section>`;
    })
    .join('\n');
  const summary = Object.entries(r.counts)
    .map(([k, n]) => `<tr><td>${esc(CHANGE_LABEL[k as ChangeKind])}</td><td>${n}</td></tr>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${esc(lang)}" lang="${esc(lang)}">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(title)}</title>
  <style>
    body { font: 1rem/1.5 system-ui, sans-serif; max-width: 48rem; margin: 1rem auto; padding: 0 1rem; }
    del { background: #fde2e1; color: #7a1712; text-decoration: line-through; }
    ins { background: #dcf3e3; color: #0f5129; text-decoration: underline; }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .change { border-top: 1px solid #ccc; }
    .change h2 { font-size: 1.05rem; margin: .75rem 0 .25rem; }
    .where code { overflow-wrap: anywhere; }
    table { border-collapse: collapse; } td, th { border: 1px solid #ccc; padding: .2rem .5rem; text-align: left; }
  </style>
</head>
<body>
  <main id="vergleich">
    <h1 id="vergleich-h">${esc(title)}</h1>
    <p id="fassungen">Ältere Fassung: ${esc(versionLine(r.from))}. Neuere Fassung: ${esc(versionLine(r.to))}.</p>
    <table id="zusammenfassung" data-hp-table="scroll"><caption>${r.changes.length} Änderung(en)</caption><thead><tr><th scope="col">Art</th><th scope="col">Anzahl</th></tr></thead><tbody>${summary}</tbody></table>
${rows}
  </main>
</body>
</html>
`;
}
