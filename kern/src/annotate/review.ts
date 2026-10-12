/**
 * Review across copies and versions: merging the annotations of a reviewer's copy into the
 * document, and comparing two versions of a document together with their annotations
 * (docs/10, promise 4: "Vergleich zweier Fassungen").
 */
import { readContainer } from '../container.js';
import { CHANGE_LABEL, diffContainers, type Change, type DiffResult } from '../edit/diff.js';
import type { Snapshot } from '../edit/journal.js';
import { DocumentIndex, resolveAnchor, type Anchor } from './anchor.js';
import { readAnnotations, saveAnnotations, type AnnotationSet } from './container.js';
import { describe, KIND_LABEL, STATUS_LABEL, validateAnnotation, type AnnotationInfo, type ReviewStatus, type WebAnnotation } from './model.js';

/** JSON with sorted keys, for comparing annotations independent of member order. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as Record<string, unknown>)
      .filter((k) => k !== '@context')
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

export interface MergeResult {
  /** The merged container; the input bytes when nothing was new. */
  readonly bytes: Uint8Array;
  readonly added: readonly string[];
  /** Ids already present with the same content. */
  readonly same: readonly string[];
  /** Ids present with different content: the document's version is kept. */
  readonly conflicts: readonly string[];
  /** New annotations whose text has moved or is gone in this document (taken over, marked). */
  readonly moved: readonly string[];
  readonly orphaned: readonly string[];
  /** Replies to annotations that exist neither here nor in the import: not taken over. */
  readonly skipped: readonly { readonly id: string; readonly reason: string }[];
}

/**
 * Takes over the annotations of another copy (an exported collection or the annotations of a
 * reviewer's file). Nothing is lost silently: identical ones are counted, differing ones are
 * reported as conflicts, annotations whose text moved or vanished are taken over and reported.
 */
export async function mergeAnnotations(bytes: Uint8Array, incoming: readonly WebAnnotation[], options: { modified: string; note?: string }): Promise<MergeResult> {
  const c = await readContainer(bytes);
  const set = await readAnnotations(c, { anchors: false });
  const existing = new Map(set.items.map((i) => [i.info.id, i.json]));
  const index = new DocumentIndex(c.files);
  const same: string[] = [];
  const conflicts: string[] = [];
  const moved: string[] = [];
  const orphaned: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const fresh = new Map<string, WebAnnotation>();
  for (const a of incoming) {
    const p = validateAnnotation(a);
    if (p.length > 0) {
      skipped.push({ id: String(a.id), reason: p.join('; ') });
      continue;
    }
    const old = existing.get(a.id);
    if (old) {
      (canonicalJson(old) === canonicalJson(a) ? same : conflicts).push(a.id);
      continue;
    }
    if (fresh.has(a.id)) {
      if (canonicalJson(fresh.get(a.id)) !== canonicalJson(a)) conflicts.push(a.id);
      continue;
    }
    fresh.set(a.id, a);
  }
  // Replies need their annotation, here or in the import (also through a chain of replies).
  let dropped = true;
  while (dropped) {
    dropped = false;
    for (const [id, a] of fresh) {
      const info = describe(a);
      if (info.kind === 'reply' && !existing.has(info.replyTo!) && !fresh.has(info.replyTo!)) {
        fresh.delete(id);
        skipped.push({ id, reason: `beantwortet ${info.replyTo}, das weder im Dokument noch im Import steht` });
        dropped = true;
      }
    }
  }
  for (const a of fresh.values()) {
    const info = describe(a);
    if (info.kind === 'reply') continue;
    const anchor = resolveAnchor(info, index);
    if (anchor.state === 'moved') moved.push(a.id);
    if (anchor.state === 'orphaned') orphaned.push(a.id);
  }
  const add = [...fresh.values()];
  const result = { same, conflicts, moved, orphaned, skipped };
  if (add.length === 0) return { bytes, added: [], ...result };
  const saved = await saveAnnotations(bytes, { add }, { modified: options.modified, accept: 'any', note: options.note ?? `Anmerkungen übernommen: ${add.length}` });
  return { bytes: saved.bytes, added: add.map((a) => a.id), ...result };
}

// ---------------------------------------------------------------------------------------------
// Comparison

export interface AnnotationDiff {
  readonly added: readonly AnnotationInfo[];
  readonly removed: readonly AnnotationInfo[];
  readonly changed: readonly AnnotationInfo[];
  readonly status: ReadonlyArray<{ readonly root: AnnotationInfo; readonly from: ReviewStatus; readonly to: ReviewStatus; readonly by?: string; readonly at?: string }>;
}

export function diffAnnotations(older: AnnotationSet, newer: AnnotationSet): AnnotationDiff {
  const a = new Map(older.items.map((i) => [i.info.id, i]));
  const b = new Map(newer.items.map((i) => [i.info.id, i]));
  const added = newer.items.filter((i) => !a.has(i.info.id)).map((i) => i.info);
  const removed = older.items.filter((i) => !b.has(i.info.id)).map((i) => i.info);
  const changed = newer.items.filter((i) => a.has(i.info.id) && canonicalJson(a.get(i.info.id)!.json) !== canonicalJson(i.json)).map((i) => i.info);
  const before = new Map(older.threads.map((t) => [t.root.id, t]));
  const status = newer.threads
    .filter((t) => (before.get(t.root.id)?.status ?? 'open') !== t.status)
    .map((t) => ({ root: t.root, from: before.get(t.root.id)?.status ?? ('open' as ReviewStatus), to: t.status, ...(t.statusBy ? { by: t.statusBy } : {}), ...(t.statusAt ? { at: t.statusAt } : {}) }));
  return { added, removed, changed, status };
}

export interface AffectedThread {
  readonly root: AnnotationInfo;
  readonly status: ReviewStatus;
  readonly anchor: Anchor;
  /** Content changes at the annotated element (pointer `path#id` or below it). */
  readonly changes: readonly Change[];
}

export interface ReviewReport {
  readonly content: DiffResult;
  readonly annotations: AnnotationDiff;
  /** Threads of the newer version whose place changed or whose text moved or vanished. */
  readonly affected: readonly AffectedThread[];
  readonly counts: { readonly threads: number; readonly open: number; readonly resolved: number };
}

function touches(c: Change, path: string, id: string): boolean {
  const key = `${path}#${id}`;
  return [c.from, c.to].some((p) => p !== undefined && (p === key || p.startsWith(`${key}/`)));
}

/**
 * Compares two versions (two files, or two versions rebuilt from one file's history) as text and
 * structure (edit.diffContainers) and their annotations: which were added, answered, resolved,
 * removed, and which open threads point at a changed or vanished passage.
 */
export async function reviewReport(older: Uint8Array | Snapshot, newer: Uint8Array | Snapshot, labels: { from?: string; to?: string } = {}): Promise<ReviewReport> {
  const content = await diffContainers(older, newer, labels);
  const asSet = async (x: Uint8Array | Snapshot): Promise<AnnotationSet> => {
    if (x instanceof Uint8Array) return readAnnotations(x);
    // A version from the journal: its files, without integrity (the journal checked them).
    const files = x.files;
    const fake = { files, entries: [], mimetype: '', packagePath: 'package.opf', manifest: JSON.parse(x.manifest), integrity: { ok: true, resources: [], unlisted: [], problems: [] } };
    return readAnnotations(fake as unknown as Parameters<typeof readAnnotations>[0]);
  };
  const [sa, sb] = [await asSet(older), await asSet(newer)];
  const annotations = diffAnnotations(sa, sb);
  const byId = new Map(sb.items.map((i) => [i.info.id, i]));
  const affected: AffectedThread[] = [];
  for (const t of sb.threads) {
    const anchor = byId.get(t.root.id)?.anchor;
    if (!anchor) continue;
    const changes = content.changes.filter((c) => touches(c, t.root.path!, t.root.elementId!));
    if (changes.length > 0 || anchor.state !== 'exact') affected.push({ root: t.root, status: t.status, anchor, changes });
  }
  const resolved = sb.threads.filter((t) => t.status === 'resolved').length;
  return { content, annotations, affected, counts: { threads: sb.threads.length, open: sb.threads.length - resolved, resolved } };
}

const short = (s: string, n = 60) => {
  const one = s.replace(/[ \t\n\f\r]+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

/** Plain text of a review report (command line). */
export function reviewText(r: ReviewReport): string {
  const lines: string[] = [];
  const label = (v: DiffResult['from']) => `${v.label}${v.version !== undefined ? ` (Fassung ${v.version}` : ''}${v.dateModified ? `, ${v.dateModified}` : ''}${v.version !== undefined ? ')' : ''}`;
  lines.push(`Vergleich ${label(r.content.from)} → ${label(r.content.to)}`);
  lines.push(`Inhalt: ${r.content.changes.length} ${r.content.changes.length === 1 ? 'Änderung' : 'Änderungen'}`);
  for (const c of r.content.changes) lines.push(`  ${CHANGE_LABEL[c.kind]}  ${c.to ?? c.from ?? c.path}${c.before !== undefined || c.after !== undefined ? `  „${short(c.before ?? '')}“ → „${short(c.after ?? '')}“` : c.detail ? `  ${c.detail}` : ''}`);
  const a = r.annotations;
  lines.push(`Anmerkungen: ${a.added.length} neu, ${a.removed.length} entfernt, ${a.changed.length} geändert, ${a.status.length} Statuswechsel; jetzt ${r.counts.threads} Threads, ${r.counts.open} offen, ${r.counts.resolved} erledigt`);
  for (const x of a.added) lines.push(`  + ${KIND_LABEL[x.kind]} ${x.author} ${x.created}${x.kind === 'reply' ? ` auf ${x.replyTo}` : ` ${x.path}#${x.elementId}`}${x.status ? ` (setzt ${STATUS_LABEL[x.status]})` : ''}: ${short(x.text || x.quote?.exact || '')}`);
  for (const x of a.removed) lines.push(`  - ${KIND_LABEL[x.kind]} ${x.author} ${x.created}: ${short(x.text || x.quote?.exact || '')}`);
  for (const x of a.changed) lines.push(`  ~ ${KIND_LABEL[x.kind]} ${x.author}: ${short(x.text)}`);
  for (const s of a.status) lines.push(`  Status ${STATUS_LABEL[s.from]} → ${STATUS_LABEL[s.to]}: ${KIND_LABEL[s.root.kind]} ${s.root.path}#${s.root.elementId}${s.by ? ` (${s.by}, ${s.at})` : ''}`);
  lines.push(`Betroffene Threads (Stelle geändert, verschoben oder verwaist): ${r.affected.length}`);
  for (const t of r.affected) {
    lines.push(`  [${STATUS_LABEL[t.status]}] ${KIND_LABEL[t.root.kind]} ${t.root.path}#${t.root.elementId} – ${t.anchor.state}${t.anchor.state === 'moved' && t.anchor.elementId !== t.root.elementId ? ` nach #${t.anchor.elementId}` : ''}${t.anchor.reason ? ` (${t.anchor.reason})` : ''}${t.root.quote ? ` „${short(t.root.quote.exact, 40)}“` : ''}`);
    for (const c of t.changes) lines.push(`      ${CHANGE_LABEL[c.kind]}${c.words ? `: ${c.words.map((w) => (w.op === '=' ? w.text : w.op === '-' ? `[-${w.text}-]` : `{+${w.text}+}`)).join('')}` : ''}`);
  }
  return lines.join('\n') + '\n';
}
