/**
 * Export and import of annotations.
 *
 *   JSON-LD   a W3C `AnnotationCollection` with one `AnnotationPage` holding every annotation
 *             unchanged (W3C model, section 5); import reads it back, so a review can travel as a
 *             small file and be merged into another copy of the document without loss
 *   CSV       one row per annotation (RFC 4180, UTF-8 with BOM, `;`-free: comma separated with
 *             quotes) for triage in a spreadsheet: thread, kind, status, author, time, address,
 *             quote, text, answered annotation, anchor
 *   XHTML     a readable report (Kommentarliste) grouped by thread, with status and quote; it can
 *             be printed or archived next to the document
 */
import { utf8 } from '../bytes.js';
import { escapeXml } from '../ocf.js';
import type { AnnotationSet, StoredAnnotation } from './container.js';
import {
  ANNO_CONTEXT,
  AnnotationError,
  CONTEXT,
  KIND_LABEL,
  STATUS_LABEL,
  validateAnnotation,
  type Json,
  type Thread,
  type WebAnnotation,
} from './model.js';

export interface DocumentLabel {
  /** `manifest.json#id` of the document. */
  readonly id: string;
  readonly title: string;
  readonly dateModified?: string;
}

/** Collection id derived from the document id, so the same document always exports the same id. */
function collectionId(doc: DocumentLabel): string {
  return `${doc.id}#annotations`;
}

/** Annotations in a fixed order: threads by time, each root followed by its replies. */
export function orderedItems(set: AnnotationSet): StoredAnnotation[] {
  const byId = new Map(set.items.map((i) => [i.info.id, i]));
  const out: StoredAnnotation[] = [];
  for (const t of set.threads) for (const a of [t.root, ...t.replies]) out.push(byId.get(a.id)!);
  for (const o of set.orphans) out.push(byId.get(o.id)!);
  return out;
}

/** W3C AnnotationCollection (JSON-LD) of all annotations; members keep everything but `@context`. */
export function toCollection(set: AnnotationSet, doc: DocumentLabel, exported: string): Json {
  const items = orderedItems(set).map((s) => {
    const rest: Json = { ...s.json };
    delete rest['@context'];
    return rest;
  });
  return {
    '@context': CONTEXT,
    id: collectionId(doc),
    type: 'AnnotationCollection',
    label: `Anmerkungen zu „${doc.title}“`,
    total: items.length,
    'hp:document': doc.id,
    ...(doc.dateModified ? { 'hp:documentModified': doc.dateModified } : {}),
    'hp:exported': exported,
    first: { id: `${collectionId(doc)}-1`, type: 'AnnotationPage', startIndex: 0, items },
  };
}

export function serializeCollection(c: Json): Uint8Array {
  return utf8(JSON.stringify(c, null, 2) + '\n');
}

/**
 * Annotations of an exported collection (or of a single annotation, or a JSON array of them).
 * Each gets `@context` back; invalid members are reported, not dropped silently.
 */
export function fromCollection(value: unknown): { annotations: WebAnnotation[]; problems: string[]; document?: string } {
  const problems: string[] = [];
  let members: unknown[];
  let document: string | undefined;
  if (Array.isArray(value)) members = value;
  else if (value && typeof value === 'object' && (value as Json).type === 'Annotation') members = [value];
  else if (value && typeof value === 'object' && (value as Json).type === 'AnnotationCollection') {
    const c = value as Json;
    const ctx = c['@context'];
    if (!(ctx === ANNO_CONTEXT || (Array.isArray(ctx) && ctx.includes(ANNO_CONTEXT)))) problems.push(`collection: @context must contain ${ANNO_CONTEXT}`);
    if (typeof c['hp:document'] === 'string') document = c['hp:document'];
    const first = c.first as Json | undefined;
    if (!first || first.type !== 'AnnotationPage' || !Array.isArray(first.items)) throw new AnnotationError('collection: first must be an AnnotationPage with items (one page; next pages are not read)');
    if ('next' in first) throw new AnnotationError('collection: only collections with a single page are supported');
    members = first.items as unknown[];
    if (typeof c.total === 'number' && c.total !== members.length) problems.push(`collection: total ${c.total}, but ${members.length} items`);
  } else throw new AnnotationError('not an annotation, an array of annotations or an AnnotationCollection');
  const annotations: WebAnnotation[] = [];
  members.forEach((m, i) => {
    const withContext = m && typeof m === 'object' && !Array.isArray(m) ? ({ '@context': CONTEXT, ...(m as Json) } as Json) : m;
    const p = validateAnnotation(withContext);
    if (p.length > 0) problems.push(`item ${i + 1}${m && typeof m === 'object' && 'id' in (m as Json) ? ` (${String((m as Json).id)})` : ''}: ${p.join('; ')}`);
    else annotations.push(withContext as unknown as WebAnnotation);
  });
  return { annotations, problems, ...(document ? { document } : {}) };
}

// ---------------------------------------------------------------------------------------------
// CSV

const ANCHOR_LABEL = { exact: 'verankert', moved: 'verschoben', orphaned: 'verwaist' } as const;

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v;
}

const oneLine = (s: string) => s.replace(/[ \t\n\f\r]+/g, ' ').trim();

export const CSV_COLUMNS = ['Thread', 'Nr', 'Kennung', 'Art', 'Status', 'Autor', 'Erstellt', 'Adresse', 'Zitat', 'Text', 'Antwort auf', 'Farbe', 'Verankerung', 'Schutz'] as const;

/** CSV (RFC 4180) of all annotations, UTF-8 with BOM so spreadsheet programs detect the encoding. */
export function toCsv(set: AnnotationSet): Uint8Array {
  const rows: string[][] = [[...CSV_COLUMNS]];
  const byId = new Map(set.items.map((i) => [i.info.id, i]));
  const protection = (s: StoredAnnotation) => (s.signed ? 'signiert' : s.listed ? (s.integrity === 'ok' ? 'im Hash-Manifest' : 'Hash weicht ab') : 'nicht signiert');
  set.threads.forEach((t, ti) => {
    [t.root, ...t.replies].forEach((a, ai) => {
      const s = byId.get(a.id)!;
      const root = byId.get(t.root.id)!;
      rows.push([
        String(ti + 1),
        String(ai),
        a.id,
        KIND_LABEL[a.kind],
        ai === 0 ? STATUS_LABEL[t.status] : a.status ? `setzt ${STATUS_LABEL[a.status]}` : '',
        a.author,
        a.created,
        `${t.root.path}#${t.root.elementId}`,
        ai === 0 ? oneLine(a.quote?.exact ?? '') : '',
        a.text,
        a.replyTo ?? '',
        a.color ?? a.ink?.color ?? '',
        ai === 0 && root.anchor ? ANCHOR_LABEL[root.anchor.state] : '',
        protection(s),
      ]);
    });
  });
  return utf8('\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n');
}

// ---------------------------------------------------------------------------------------------
// XHTML report

function para(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.split('\n').map(escapeXml).join('<br/>')}</p>`)
    .join('');
}

/** Readable report of all threads (XHTML 5, `lang` from `language`). */
export function toXhtml(set: AnnotationSet, doc: DocumentLabel, exported: string, language = 'de'): string {
  const open = set.threads.filter((t) => t.status === 'open').length;
  const byId = new Map(set.items.map((i) => [i.info.id, i]));
  const thread = (t: Thread, n: number) => {
    const root = byId.get(t.root.id)!;
    const anchor = root.anchor;
    const where = `${t.root.path}#${t.root.elementId}`;
    const quote = t.root.quote ? `<blockquote class="zitat"><p>${escapeXml(oneLine(t.root.quote.exact))}</p></blockquote>` : '';
    const status = t.status === 'resolved' ? `erledigt${t.statusBy ? ` (${escapeXml(t.statusBy)}, ${escapeXml(t.statusAt ?? '')})` : ''}` : 'offen';
    const items = t.replies
      .map((r) => `<li id="a-${escapeXml(r.id.slice(9))}"><p class="kopf">${escapeXml(r.author)} · <time datetime="${escapeXml(r.created)}">${escapeXml(r.created)}</time>${r.status ? ` · setzt ${STATUS_LABEL[r.status]}` : ''}</p>${para(r.text)}</li>`)
      .join('');
    return (
      `<section id="t-${n}" class="thread ${t.status}"><h2>${n}. ${KIND_LABEL[t.root.kind]}${t.root.color ? ` (${escapeXml(t.root.color)})` : ''} – ${status}</h2>` +
      `<p class="kopf">${escapeXml(t.root.author)} · <time datetime="${escapeXml(t.root.created)}">${escapeXml(t.root.created)}</time> · Adresse <code>${escapeXml(where)}</code>${anchor && anchor.state !== 'exact' ? ` · <strong>${ANCHOR_LABEL[anchor.state]}</strong>${anchor.reason ? ` (${escapeXml(anchor.reason)})` : ''}` : ''}</p>` +
      quote +
      (t.root.text ? para(t.root.text) : t.root.kind === 'ink' ? '<p><em>Freihandzeichnung ohne Text</em></p>' : '') +
      (items ? `<ol class="antworten">${items}</ol>` : '') +
      '</section>'
    );
  };
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" lang="${escapeXml(language)}" xml:lang="${escapeXml(language)}"><head><meta charset="utf-8"/><title>Anmerkungen zu ${escapeXml(doc.title)}</title>` +
    '<style>body{font-family:system-ui,sans-serif;max-width:48rem;margin:1rem auto;padding:0 1rem;line-height:1.5}.kopf{color:#555;font-size:.9em}.zitat{border-left:4px solid #e0b000;margin:.5em 0;padding:.1em .8em;background:#fffbe6}.thread{border-top:1px solid #ccc;padding-top:.5em}.resolved h2{color:#2e7d32}.antworten{list-style:none;padding-left:1.2em;border-left:2px solid #ddd}</style></head><body>' +
    `<h1>Anmerkungen zu „${escapeXml(doc.title)}“</h1>` +
    `<p>Dokument <code>${escapeXml(doc.id)}</code>${doc.dateModified ? `, Stand ${escapeXml(doc.dateModified)}` : ''}. Exportiert ${escapeXml(exported)}: ${set.threads.length} ${set.threads.length === 1 ? 'Thread' : 'Threads'}, davon ${open} offen, ${set.items.length} Anmerkungen insgesamt.</p>` +
    set.threads.map((t, i) => thread(t, i + 1)).join('') +
    (set.orphans.length > 0 ? `<section><h2>Antworten ohne Thread</h2><ul>${set.orphans.map((o) => `<li>${escapeXml(o.author)}: ${escapeXml(o.text)} (auf ${escapeXml(o.replyTo ?? '')})</li>`).join('')}</ul></section>` : '') +
    '</body></html>\n'
  );
}
