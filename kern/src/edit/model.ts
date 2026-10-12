/**
 * Block model of a content document: the structure the editor works on and the comparison
 * (`diff.ts`) compares. One record per structural block in document order:
 *
 *   heading (h1–h6), paragraph (p), list (ul/ol), list-item (li, own text without nested lists),
 *   table, caption, cell (td/th, addressed `<table>.<A1>` when the table has an id), figure,
 *   figcaption, image (img; also inline images), media (video/audio), footnote (aside
 *   doc-footnote), endnotes, section/article/aside/details/summary/blockquote/pre/dt/dd/div/nav.
 *
 * `text` is the block's own text (white space collapsed, redaction placeholders as
 * "[geschwärzt]"); container blocks have the text of their direct text children only.
 */
import type { Document, Element, Node } from '@xmldom/xmldom';
import { childElements, isElement } from '../lock/xml.js';
import { bodyOf, columnLetters, EPUB_NS, inlineMarkup, isBlockChild, isNoteRef, pointerOf, textOf } from './dom.js';
import { buildGrid } from './table.js';

export type BlockKind =
  | 'heading' | 'paragraph' | 'list' | 'list-item' | 'table' | 'caption' | 'row' | 'cell' | 'figure' | 'figcaption' | 'image' | 'media'
  | 'footnote' | 'endnotes' | 'section' | 'aside' | 'details' | 'summary' | 'blockquote' | 'code' | 'term' | 'definition' | 'container';

export interface BlockRecord {
  /** Pointer for the editor (`path#id/…`, cells `path#table.B3`). */
  readonly pointer: string;
  readonly id: string | null;
  readonly tag: string;
  readonly kind: BlockKind;
  /** Heading level 1–6. */
  readonly level?: number;
  /** Nesting depth below body (for an outline). */
  readonly depth: number;
  readonly text: string;
  /** Inline markup (text blocks only), for an editing UI. */
  readonly inline?: string;
  /** Pointer of the enclosing block record (null at the top). */
  readonly parent: string | null;
  /** src/alt/poster of images and media, href of a link block, start/type of lists, A1 of cells. */
  readonly attrs?: Readonly<Record<string, string>>;
  /** Internal and external link targets inside the block's own inline content. */
  readonly links?: readonly string[];
  /** Ids of footnotes referenced from the block's own inline content. */
  readonly notes?: readonly string[];
  /** The block contains a redaction placeholder. */
  readonly redacted?: boolean;
  /** Element (not serialisable; for the editor). */
  readonly el: Element;
}

const KIND: Record<string, BlockKind> = {
  h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
  p: 'paragraph', ul: 'list', ol: 'list', li: 'list-item', table: 'table', caption: 'caption', tr: 'row', td: 'cell', th: 'cell',
  figure: 'figure', figcaption: 'figcaption', img: 'image', video: 'media', audio: 'media',
  section: 'section', article: 'section', aside: 'aside', details: 'details', summary: 'summary', blockquote: 'blockquote', pre: 'code',
  dt: 'term', dd: 'definition', dl: 'list', div: 'container', nav: 'container', main: 'container', header: 'container', footer: 'container',
};
/** Blocks whose inline content is edited as text. */
export const TEXT_BLOCKS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'td', 'th', 'caption', 'figcaption', 'summary', 'dt', 'dd', 'pre']);
const SKIP = new Set(['script', 'style', 'template', 'head']);

export function isFootnote(el: Element): boolean {
  return el.localName === 'aside' && (el.getAttribute('role') === 'doc-footnote' || (el.getAttributeNS(EPUB_NS, 'type') ?? '').split(/\s+/).includes('footnote'));
}

function isEndnotes(el: Element): boolean {
  return el.localName === 'section' && (el.getAttribute('role') === 'doc-endnotes' || (el.getAttributeNS(EPUB_NS, 'type') ?? '').split(/\s+/).includes('endnotes'));
}

function kindOf(el: Element): BlockKind | undefined {
  if (isFootnote(el)) return 'footnote';
  if (isEndnotes(el)) return 'endnotes';
  return KIND[el.localName ?? ''];
}

function ownInline(el: Element): { links: string[]; notes: string[]; redacted: boolean } {
  const links: string[] = [];
  const notes: string[] = [];
  let redacted = false;
  const walk = (n: Node) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (!isElement(c) || isBlockChild(c)) continue;
      if (c.hasAttribute('data-hp-redacted')) redacted = true;
      if (c.localName === 'a' && c.getAttribute('href') !== null) {
        if (isNoteRef(c)) notes.push((c.getAttribute('href') ?? '').replace(/^.*#/, ''));
        else links.push(c.getAttribute('href')!);
      }
      walk(c);
    }
  };
  walk(el);
  return { links, notes, redacted };
}

/** Block records of `doc` in document order. */
export function extractBlocks(doc: Document, path: string): BlockRecord[] {
  const out: BlockRecord[] = [];
  const children = (el: Element, depth: number, parent: string | null) => {
    for (const c of childElements(el)) visit(c, depth, parent);
  };
  const visit = (c: Element, depth: number, parent: string | null): void => {
    const name = c.localName ?? '';
    if (SKIP.has(name)) return;
    const kind = kindOf(c);
    if (!kind || kind === 'row') return children(c, depth, parent);
    const pointer = pointerOf(c, path);
    if (name === 'table') {
      out.push(record(c, path, 'table', depth, parent, pointer));
      const caption = childElements(c).find((x) => x.localName === 'caption');
      if (caption) out.push(record(caption, path, 'caption', depth + 1, pointer, pointerOf(caption, path)));
      const g = buildGrid(c);
      const tid = c.getAttribute('id');
      g.grid.forEach((row, r) =>
        row.forEach((cell, col) => {
          if (!cell || cell.row !== r || cell.col !== col) return;
          const a1 = `${columnLetters(col + 1)}${r + 1}`;
          const cp = tid ? `${path}#${tid}.${a1}` : pointerOf(cell.el, path);
          out.push(record(cell.el, path, 'cell', depth + 1, pointer, cp, { a1 }));
          for (const sub of childElements(cell.el)) if (isBlockChild(sub)) visit(sub, depth + 2, cp);
        }),
      );
      return;
    }
    const extra: Record<string, string> = {};
    if (name === 'img') for (const a of ['src', 'alt']) if (c.getAttribute(a) !== null) extra[a] = c.getAttribute(a)!;
    if (name === 'video' || name === 'audio') for (const a of ['src', 'poster']) if (c.getAttribute(a) !== null) extra[a] = c.getAttribute(a)!;
    if (name === 'ol' || name === 'ul') {
      extra.type = name;
      if (c.getAttribute('start')) extra.start = c.getAttribute('start')!;
    }
    out.push(record(c, path, kind, depth, parent, pointer, extra));
    if (TEXT_BLOCKS.has(name)) {
      // Inline images inside a text block are blocks of their own for the comparison.
      for (const img of descendantsInline(c)) {
        const attrs = Object.fromEntries(['src', 'alt'].filter((a) => img.getAttribute(a) !== null).map((a) => [a, img.getAttribute(a)!]));
        out.push(record(img, path, 'image', depth + 1, pointer, pointerOf(img, path), attrs));
      }
      // Nested blocks of list items (sub-lists, paragraphs).
      for (const sub of childElements(c)) if (isBlockChild(sub)) visit(sub, depth + 1, pointer);
      return;
    }
    children(c, depth + 1, pointer);
  };
  children(bodyOf(doc), 0, null);
  return out;
}

function descendantsInline(el: Element): Element[] {
  const out: Element[] = [];
  const walk = (n: Element) => {
    for (const c of childElements(n)) {
      if (isBlockChild(c)) continue;
      if (c.localName === 'img') out.push(c);
      else walk(c);
    }
  };
  walk(el);
  return out;
}

function record(el: Element, path: string, kind: BlockKind, depth: number, parent: string | null, pointer: string, attrs: Record<string, string> = {}): BlockRecord {
  const name = el.localName ?? '';
  const textBlock = TEXT_BLOCKS.has(name);
  const stop = (n: Node) => isBlockChild(n);
  const text = textBlock ? textOf(el, stop) : directText(el);
  const own = textBlock ? ownInline(el) : { links: [], notes: [], redacted: false };
  return {
    pointer,
    id: el.getAttribute('id'),
    tag: name,
    kind,
    ...(kind === 'heading' ? { level: Number(name[1]) } : {}),
    depth,
    text: name === 'pre' ? (el.textContent ?? '') : text,
    ...(textBlock ? { inline: name === 'pre' ? (el.textContent ?? '') : inlineMarkup(el, stop) } : {}),
    parent,
    ...(Object.keys(attrs).length ? { attrs } : {}),
    ...(own.links.length ? { links: own.links } : {}),
    ...(own.notes.length ? { notes: own.notes } : {}),
    ...(own.redacted || (!textBlock && el.hasAttribute('data-hp-redacted')) ? { redacted: true } : {}),
    el,
  };
}

/** Text of direct text children (containers rarely have any). */
function directText(el: Element): string {
  let s = '';
  for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 || c.nodeType === 4) s += c.nodeValue ?? '';
  return s.replace(/\s+/g, ' ').trim();
}

/** Serialisable outline (without elements), e.g. for the command line and the reader. */
export function outline(doc: Document, path: string): Array<Omit<BlockRecord, 'el'>> {
  return extractBlocks(doc, path).map(({ el, ...rest }) => (void el, rest));
}
