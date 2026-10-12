/**
 * Full-text search over the content documents (HP-RS-003).
 *
 * Searches the DOM text, not rendered pixels, so collapsed `details`, hidden priority blocks
 * and static equivalents are included. Matching ignores case, diacritics and differences in
 * whitespace ("Mass" finds "Maß"? no — only combining marks are removed: "Uberblick" finds
 * "Überblick"). Matches may cross inline markup (`<em>`, `<a>`), but not block boundaries.
 *
 * The same text model runs on the source DOM (to list hits) and on the rendered frame DOM
 * (to mark them), so hit number n in a document is the same text in both.
 */

/** Elements whose text is not document text. */
const SKIP = new Set(['script', 'style', 'template', 'noscript', 'title']);
const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'caption', 'dd', 'details', 'div', 'dl', 'dt', 'figcaption', 'figure',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre',
  'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul', 'br',
]);
/** Attribute set on elements the reader adds to the rendered copy; their text is skipped. */
export const READER_MARK = 'data-hp-reader';

interface Segment {
  readonly node: Text;
  /** Offset of the node's first character in `TextModel.text`. */
  readonly start: number;
}

export interface TextModel {
  readonly text: string;
  readonly segments: readonly Segment[];
  /** Normalized text and, per normalized character, its index in `text`. */
  readonly folded: string;
  readonly foldedToText: readonly number[];
}

function blockOf(node: Node): Element | null {
  let el = node.parentElement;
  while (el && !BLOCK.has(el.localName)) el = el.parentElement;
  return el;
}

function skipped(node: Node): boolean {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (SKIP.has(el.localName) || el.hasAttribute(READER_MARK)) return true;
  }
  return false;
}

/** Folds one character for matching: lower case, no combining marks, whitespace → space. */
function foldChar(ch: string): string {
  if (/\s/u.test(ch)) return ' ';
  return ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function foldQuery(query: string): string {
  let out = '';
  for (const ch of query.trim()) {
    const f = foldChar(ch);
    if (f === ' ' && out.endsWith(' ')) continue;
    out += f;
  }
  return out;
}

export function buildTextModel(root: Element): TextModel {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const segments: Segment[] = [];
  let text = '';
  let lastBlock: Element | null | undefined;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text;
    if (node.data === '' || skipped(node)) continue;
    const block = blockOf(node);
    // A separator between blocks keeps "…Ende" + "Anfang…" in adjacent cells apart.
    if (lastBlock !== undefined && block !== lastBlock) text += '\n';
    lastBlock = block;
    segments.push({ node, start: text.length });
    text += node.data;
  }
  let folded = '';
  const foldedToText: number[] = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(cp);
    const f = foldChar(ch);
    if (!(f === ' ' && folded.endsWith(' '))) {
      for (const _ of f) {
        folded += _;
        foldedToText.push(i);
      }
    }
    i += ch.length;
  }
  foldedToText.push(text.length);
  return { text, segments, folded, foldedToText };
}

export interface Match {
  /** Range in `TextModel.text`. */
  readonly start: number;
  readonly end: number;
}

export function findMatches(model: TextModel, foldedQuery: string, limit = 1000): Match[] {
  const out: Match[] = [];
  if (foldedQuery === '') return out;
  let from = 0;
  while (out.length < limit) {
    const i = model.folded.indexOf(foldedQuery, from);
    if (i < 0) break;
    const start = model.foldedToText[i] ?? 0;
    const endIndex = i + foldedQuery.length;
    // The end maps to the first text index after the last matched folded character.
    const lastStart = model.foldedToText[endIndex - 1] ?? start;
    const lastChar = String.fromCodePoint(model.text.codePointAt(lastStart) ?? 0);
    const end = Math.max(lastStart + lastChar.length, model.foldedToText[endIndex] === lastStart ? lastStart + lastChar.length : lastStart + lastChar.length);
    out.push({ start, end });
    from = endIndex;
  }
  return out;
}

/** The text nodes and offsets covered by a match, in document order. */
export function matchPieces(model: TextModel, m: Match): { node: Text; start: number; end: number }[] {
  const pieces: { node: Text; start: number; end: number }[] = [];
  for (const seg of model.segments) {
    const segEnd = seg.start + seg.node.data.length;
    if (segEnd <= m.start) continue;
    if (seg.start >= m.end) break;
    pieces.push({ node: seg.node, start: Math.max(0, m.start - seg.start), end: Math.min(seg.node.data.length, m.end - seg.start) });
  }
  return pieces;
}

export function snippet(model: TextModel, m: Match, context = 48): { before: string; hit: string; after: string } {
  const clean = (s: string) => s.replace(/\s+/g, ' ');
  const from = Math.max(0, m.start - context);
  const to = Math.min(model.text.length, m.end + context);
  return {
    before: (from > 0 ? '…' : '') + clean(model.text.slice(from, m.start)).trimStart(),
    hit: clean(model.text.slice(m.start, m.end)),
    after: clean(model.text.slice(m.end, to)).trimEnd() + (to < model.text.length ? '…' : ''),
  };
}

/**
 * The address target for a node: the nearest ancestor with an `id`, else the nearest
 * element with an `id` before it in document order (usually the preceding heading).
 */
export function addressIdFor(node: Node): string | undefined {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (el.id && el.localName !== 'body' && el.localName !== 'html') return el.id;
  }
  const doc = node.ownerDocument;
  if (!doc) return undefined;
  const all = Array.from(doc.querySelectorAll('body [id]'));
  let found: string | undefined;
  for (const el of all) {
    if (el.compareDocumentPosition(node) & 4 /* Node.DOCUMENT_POSITION_FOLLOWING */) found = el.id;
    else break;
  }
  return found;
}

export interface SearchHit {
  readonly path: string;
  readonly documentTitle: string;
  /** Number of the match within its document (0-based), used to mark it in the frame. */
  readonly ordinal: number;
  readonly id: string | undefined;
  readonly snippet: { before: string; hit: string; after: string };
}

export interface SearchResult {
  readonly query: string;
  readonly hits: readonly SearchHit[];
  /** True when the hit limit cut the list short. */
  readonly truncated: boolean;
}

export function searchDocuments(
  docs: ReadonlyArray<{ readonly path: string; readonly title: string; readonly dom: Document }>,
  query: string,
  limit = 500,
): SearchResult {
  const folded = foldQuery(query);
  const hits: SearchHit[] = [];
  let truncated = false;
  if (folded.length === 0) return { query, hits, truncated };
  for (const doc of docs) {
    const body = doc.dom.body ?? doc.dom.documentElement;
    const model = buildTextModel(body);
    const matches = findMatches(model, folded, limit - hits.length + 1);
    for (const [ordinal, m] of matches.entries()) {
      if (hits.length >= limit) {
        truncated = true;
        break;
      }
      const first = matchPieces(model, m)[0];
      hits.push({ path: doc.path, documentTitle: doc.title, ordinal, id: first ? addressIdFor(first.node) : undefined, snippet: snippet(model, m) });
    }
    if (truncated) break;
  }
  return { query, hits, truncated };
}
