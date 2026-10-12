/**
 * Anchoring: where an annotation belongs in a (possibly changed) document.
 *
 *   exact     the element exists and the quote stands at the stored position (or there is no
 *             quote: a comment on the whole element, a drawing)
 *   moved     the quote was found elsewhere — in the element (text before it changed) or, when the
 *             element is gone, in another element of the same document; the new place is given
 *   orphaned  the element is gone and the quote is nowhere, or the quote is no longer in the text
 *
 * The quote decides, the position only chooses between several occurrences (W3C 4.2.4/4.2.6:
 * a position alone breaks as soon as text before it changes).
 */
import type { Document, Element } from '@xmldom/xmldom';
import { fromUtf8 } from '../bytes.js';
import { descendants, parseXml } from '../lock/xml.js';
import { AnnotationError, splitAddress, type AnnotationInfo } from './model.js';
import { elementText, findQuote, quoteAt, type ElementText, type NodeLike, type Quote } from './text.js';

export type AnchorState = 'exact' | 'moved' | 'orphaned';

export interface Anchor {
  readonly state: AnchorState;
  readonly path: string;
  /** Element the annotation is shown at (the stored one, or the new one when moved). */
  readonly elementId?: string;
  /** Normalised range in that element's text, when there is a quote. */
  readonly start?: number;
  readonly end?: number;
  readonly reason?: string;
}

/** Parsed XHTML documents of a container with an index of their ids. */
export class DocumentIndex {
  private readonly docs = new Map<string, { doc: Document; ids: Map<string, Element> } | null>();

  constructor(private readonly files: ReadonlyMap<string, Uint8Array>) {}

  get(path: string): { doc: Document; ids: Map<string, Element> } | null {
    if (this.docs.has(path)) return this.docs.get(path)!;
    const bytes = this.files.get(path);
    let entry: { doc: Document; ids: Map<string, Element> } | null = null;
    if (bytes && /\.x?html?$/i.test(path)) {
      try {
        const doc = parseXml(fromUtf8(bytes), path);
        const ids = new Map<string, Element>();
        for (const el of descendants(doc)) {
          const id = el.getAttribute('id');
          if (id && !ids.has(id)) ids.set(id, el);
        }
        entry = { doc, ids };
      } catch {
        entry = null;
      }
    }
    this.docs.set(path, entry);
    return entry;
  }

  element(path: string, id: string): Element | undefined {
    return this.get(path)?.ids.get(id);
  }

  text(path: string, id: string): ElementText | undefined {
    const el = this.element(path, id);
    return el ? elementText(el as unknown as NodeLike) : undefined;
  }
}

/**
 * The innermost element with an id whose text contains the whole quote that starts at the
 * normalised offset `at` of `body`'s text, and the quote's offset in that element's text.
 */
function innermostWithId(body: Element, bt: ElementText, at: number, exact: string, prefix: string, suffix: string): { el: Element; start: number } | undefined {
  const raw = bt.normToRaw[at]!;
  const run = [...bt.runs].reverse().find((r) => r.start <= raw);
  for (let n = run?.node.parentNode as unknown as Element | null; n && n !== body.parentNode; n = n.parentNode as unknown as Element | null) {
    if (n.nodeType !== 1 || !n.getAttribute('id')) continue;
    const t = elementText(n as unknown as NodeLike);
    const i = findQuote(t.text, exact, prefix, suffix);
    if (i >= 0) return { el: n, start: i };
  }
  return undefined;
}

/** Where an annotation (not a reply) belongs in the documents of `index`. */
export function resolveAnchor(a: AnnotationInfo, index: DocumentIndex): Anchor {
  if (a.kind === 'reply' || !a.path || !a.elementId) throw new AnnotationError('replies have no anchor of their own');
  const path = a.path;
  const t = index.text(path, a.elementId);
  if (!a.quote) {
    return t ? { state: 'exact', path, elementId: a.elementId } : { state: 'orphaned', path, reason: `#${a.elementId} existiert nicht mehr` };
  }
  const { exact, prefix, suffix } = a.quote;
  if (t) {
    if (a.position && t.text.slice(a.position.start, a.position.end) === exact) return { state: 'exact', path, elementId: a.elementId, start: a.position.start, end: a.position.end };
    const i = findQuote(t.text, exact, prefix, suffix, a.position?.start);
    if (i >= 0) return { state: a.position ? 'moved' : 'exact', path, elementId: a.elementId, start: i, end: i + exact.length };
  }
  // Elsewhere in the same document: an element that was split, renamed or moved.
  const body = index.get(path)?.doc.getElementsByTagName('body')[0];
  if (body) {
    const bt = elementText(body as unknown as NodeLike);
    const i = findQuote(bt.text, exact, prefix, suffix);
    const found = i >= 0 ? innermostWithId(body, bt, i, exact, prefix, suffix) : undefined;
    if (found) {
      const id = found.el.getAttribute('id');
      if (id) return { state: 'moved', path, elementId: id, start: found.start, end: found.start + exact.length, reason: t ? 'Text steht an anderer Stelle' : `#${a.elementId} existiert nicht mehr, Text gefunden in #${id}` };
    }
  }
  return { state: 'orphaned', path, ...(t ? { elementId: a.elementId } : {}), reason: t ? 'zitierter Text steht nicht mehr im Element' : `#${a.elementId} existiert nicht mehr` };
}

/**
 * Quote for a new annotation: the normalised range [start, end) of `path#id` (from a selection),
 * checked against the document. Throws if the element does not exist or the range is empty.
 */
export function quoteFor(index: DocumentIndex, address: string, start: number, end: number): Quote {
  const a = splitAddress(address);
  if (!a) throw new AnnotationError(`not an address: ${address}`);
  const t = index.text(a.path, a.id);
  if (!t) throw new AnnotationError(`${address}: no such element`);
  if (!(Number.isInteger(start) && Number.isInteger(end) && 0 <= start && start < end && end <= t.text.length)) throw new AnnotationError(`${address}: range ${start}–${end} is not inside the text (length ${t.text.length})`);
  return quoteAt(t, start, end);
}

/** Quote for a passage given as text: its first occurrence (or the n-th) in `path#id`. */
export function quoteOfText(index: DocumentIndex, address: string, passage: string, occurrence = 1): Quote {
  const a = splitAddress(address);
  if (!a) throw new AnnotationError(`not an address: ${address}`);
  const t = index.text(a.path, a.id);
  if (!t) throw new AnnotationError(`${address}: no such element`);
  const exact = passage.replace(/[ \t\n\f\r]+/g, ' ').trim();
  let i = -1;
  for (let n = 0; n < occurrence; n++) {
    i = t.text.indexOf(exact, i + 1);
    if (i < 0) throw new AnnotationError(`${address}: "${exact}" does not occur ${occurrence === 1 ? '' : `${occurrence} times `}in the text`);
  }
  return quoteAt(t, i, i + exact.length);
}
