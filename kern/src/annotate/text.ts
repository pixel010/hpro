/**
 * Text model of an addressed element for anchoring annotations (W3C Web Annotation Data Model,
 * 4.2.4 TextQuoteSelector and 4.2.6 TextPositionSelector: "the text must be normalized before
 * recording" — tags removed, white space normalised).
 *
 * The text of an element is the concatenation of its text nodes in document order (the "raw"
 * text), without `script`, `style`, `template` and elements the reader inserts
 * (`data-hp-reader`). The normalised text collapses every run of ASCII white space (the HTML
 * definition: space, tab, LF, FF, CR — not U+00A0) to one space and drops white space at both
 * ends. Offsets of selectors count UTF-16 code units of the normalised text, like JavaScript
 * strings and the DOM.
 *
 * The functions work on the minimal node shape shared by @xmldom/xmldom (the core) and the
 * browser DOM (the reader marks annotations in its copy of the document with the same code), so
 * both sides compute the same offsets for the same markup, independent of how its source is
 * formatted or how text nodes are split (search marks, earlier annotation marks).
 */

/** Node shape shared by @xmldom/xmldom and the browser DOM. */
export interface NodeLike {
  readonly nodeType: number;
  readonly nodeValue: string | null;
  readonly firstChild: NodeLike | null;
  readonly nextSibling: NodeLike | null;
  readonly parentNode: NodeLike | null;
  readonly localName?: string | null;
  getAttribute?(name: string): string | null;
  hasAttribute?(name: string): boolean;
}

/** A text node and where its data starts in the raw text. */
export interface TextRun {
  readonly node: NodeLike;
  readonly start: number;
}

export interface ElementText {
  /** Concatenated text node data. */
  readonly raw: string;
  /** Normalised text: the basis of all selector offsets. */
  readonly text: string;
  readonly runs: readonly TextRun[];
  /** Raw index of each normalised character. */
  readonly normToRaw: readonly number[];
}

/** A piece of a text node: raw offsets within `node.nodeValue`. */
export interface TextPiece {
  readonly node: NodeLike;
  readonly start: number;
  readonly end: number;
}

const SKIPPED = new Set(['script', 'style', 'template']);
const WS = /[ \t\n\f\r]/;

/** Elements whose text does not count: scripts, styles, templates and reader elements. */
export function isSkipped(n: NodeLike): boolean {
  if (n.nodeType !== 1) return false;
  if (SKIPPED.has((n.localName ?? '').toLowerCase())) return true;
  return n.getAttribute?.('data-hp-reader') != null;
}

/** Text of an element as described in the header. */
export function elementText(el: NodeLike): ElementText {
  const runs: TextRun[] = [];
  let raw = '';
  const walk = (n: NodeLike) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3 || c.nodeType === 4) {
        runs.push({ node: c, start: raw.length });
        raw += c.nodeValue ?? '';
      } else if (c.nodeType === 1 && !isSkipped(c)) walk(c);
    }
  };
  walk(el);
  const normToRaw: number[] = [];
  let text = '';
  let pendingSpace = -1;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (WS.test(ch)) {
      if (pendingSpace < 0 && text.length > 0) pendingSpace = i;
      continue;
    }
    if (pendingSpace >= 0) {
      text += ' ';
      normToRaw.push(pendingSpace);
      pendingSpace = -1;
    }
    text += ch;
    normToRaw.push(i);
  }
  return { raw, text, runs, normToRaw };
}

/** Normalises a string the same way (for quotes typed or copied elsewhere). */
export function normalizeText(s: string): string {
  return s.replace(/[ \t\n\f\r]+/g, ' ').replace(/^ | $/g, '');
}

/** Normalised offset for a raw offset: the number of normalised characters before it. */
export function rawToNorm(t: ElementText, rawOffset: number): number {
  let lo = 0;
  let hi = t.normToRaw.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t.normToRaw[mid]! < rawOffset) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Raw offset of a point inside a text node of the element (for a DOM selection). */
export function rawOffsetOf(t: ElementText, node: NodeLike, offset: number): number | undefined {
  const run = t.runs.find((r) => r.node === node);
  return run ? run.start + Math.min(offset, (node.nodeValue ?? '').length) : undefined;
}

/** Raw range [start, end) covering the normalised range [start, end). */
export function rawRange(t: ElementText, start: number, end: number): { start: number; end: number } {
  if (start >= end) {
    const at = start < t.normToRaw.length ? t.normToRaw[start]! : t.raw.length;
    return { start: at, end: at };
  }
  return { start: t.normToRaw[start]!, end: t.normToRaw[end - 1]! + 1 };
}

/** The text node pieces that make up the normalised range [start, end). */
export function piecesOf(t: ElementText, start: number, end: number): TextPiece[] {
  const r = rawRange(t, start, end);
  const out: TextPiece[] = [];
  for (const run of t.runs) {
    const len = (run.node.nodeValue ?? '').length;
    const s = Math.max(r.start, run.start);
    const e = Math.min(r.end, run.start + len);
    if (e > s) out.push({ node: run.node, start: s - run.start, end: e - run.start });
  }
  return out;
}

/** Length of the common suffix of `a` and `b`. */
function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/**
 * Finds `exact` in `text`. With several occurrences the one whose surroundings agree most with
 * `prefix` and `suffix` wins, then the one closest to `near`. Returns the start offset or -1.
 */
export function findQuote(text: string, exact: string, prefix = '', suffix = '', near?: number): number {
  if (exact === '') return -1;
  let best = -1;
  let bestScore = -1;
  let bestDistance = Infinity;
  for (let i = text.indexOf(exact); i >= 0; i = text.indexOf(exact, i + 1)) {
    const score = commonSuffix(text.slice(Math.max(0, i - prefix.length), i), prefix) + commonPrefix(text.slice(i + exact.length, i + exact.length + suffix.length), suffix);
    const distance = near === undefined ? 0 : Math.abs(i - near);
    if (score > bestScore || (score === bestScore && distance < bestDistance)) {
      best = i;
      bestScore = score;
      bestDistance = distance;
    }
  }
  return best;
}

/** Context kept around a quote (W3C 4.2.4 recommends enough to make it unique). */
export const QUOTE_CONTEXT = 32;

export interface Quote {
  readonly exact: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly start: number;
  readonly end: number;
}

/** Quote with prefix and suffix for the normalised range [start, end) of `t`. */
export function quoteAt(t: ElementText, start: number, end: number): Quote {
  return {
    exact: t.text.slice(start, end),
    prefix: t.text.slice(Math.max(0, start - QUOTE_CONTEXT), start),
    suffix: t.text.slice(end, end + QUOTE_CONTEXT),
    start,
    end,
  };
}
