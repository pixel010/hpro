/**
 * Building blocks of the structured editor: block pointers, new ids, restricted inline markup.
 *
 * Block pointer (an address in the sense of HP-ADR-003, extended by child steps):
 *   `content/index.xhtml#befund`              element with id `befund`
 *   `content/index.xhtml#befund/p[2]`         its second child element `p`
 *   `content/index.xhtml#massnahmen/li[3]`    third list item
 *   `content/index.xhtml#/p[1]`               first `p` child of `body` (no id on the way)
 *   `content/index.xhtml#feuchte-tabelle.B3`  table cell in A1 notation (HP-ADR-008)
 * Without a path (`#befund`) the first document of `readingOrder` is meant.
 */
import { DOMParser, type Document, type Element, type Node } from '@xmldom/xmldom';
import { childElements, descendants, isElement, serializeNode, XHTML_NS } from '../lock/xml.js';

export const EPUB_NS = 'http://www.idpf.org/2007/ops';
export const ID_RE = /^[A-Za-z][A-Za-z0-9_.-]*$/;
const CELL_RE = /^(.+)\.([A-Z]{1,3})([1-9]\d*)$/;

export type EditErrorCode = 'invalid' | 'not-found' | 'read-only' | 'sealed' | 'conflict' | 'calc' | 'redacted';

export class EditError extends Error {
  constructor(
    readonly code: EditErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EditError';
  }
}

export interface Step {
  readonly name: string;
  readonly index: number;
}

export interface Pointer {
  readonly path: string;
  /** Id of the anchor element; '' = `body`. */
  readonly anchor: string;
  readonly steps: readonly Step[];
  readonly cell?: { readonly table: string; readonly col: number; readonly row: number };
}

export function columnNumber(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function columnLetters(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

export function parsePointer(target: string, defaultPath: string): Pointer {
  const hash = target.indexOf('#');
  if (hash < 0) throw new EditError('invalid', `${target}: a pointer needs #id (e.g. content/index.xhtml#befund/p[1])`);
  const path = hash === 0 ? defaultPath : target.slice(0, hash);
  const frag = decodeURIComponent(target.slice(hash + 1));
  const [anchor = '', ...rest] = frag.split('/');
  const steps = rest.map((s) => {
    const m = /^([a-z][a-z0-9]*)\[([1-9]\d*)\]$/.exec(s);
    if (!m) throw new EditError('invalid', `${target}: step "${s}" must look like p[2]`);
    return { name: m[1]!, index: Number(m[2]) };
  });
  if (anchor !== '' && !ID_RE.test(anchor)) throw new EditError('invalid', `${target}: "${anchor}" is not an id`);
  const cell = rest.length === 0 ? CELL_RE.exec(anchor) : null;
  return { path, anchor, steps, ...(cell ? { cell: { table: cell[1]!, col: columnNumber(cell[2]!), row: Number(cell[3]) } } : {}) };
}

export function bodyOf(doc: Document): Element {
  const body = descendants(doc).find((e) => e.localName === 'body');
  if (!body) throw new EditError('invalid', 'document has no body');
  return body;
}

export function elementById(doc: Document, id: string): Element | undefined {
  return descendants(doc).find((e) => e.getAttribute('id') === id);
}

/** Resolves a pointer (cells via the table grid, see table.ts) to an element of `doc`. */
export function resolveSteps(doc: Document, p: Pointer, target: string): Element {
  let el: Element | undefined = p.anchor === '' ? bodyOf(doc) : elementById(doc, p.anchor);
  if (!el) throw new EditError('not-found', `${target}: no element with id "${p.anchor}" in ${p.path}`);
  for (const s of p.steps) {
    const next: Element | undefined = childElements(el).filter((c) => c.localName === s.name)[s.index - 1];
    if (!next) throw new EditError('not-found', `${target}: <${el.localName}> has no ${s.index}. child <${s.name}>`);
    el = next;
  }
  return el;
}

/** Pointer of an element: nearest ancestor-or-self with id, then child steps. */
export function pointerOf(el: Element, path: string): string {
  const steps: string[] = [];
  let cur: Element = el;
  for (;;) {
    const id = cur.getAttribute('id');
    if (id) return `${path}#${id}${steps.length ? '/' + steps.reverse().join('/') : ''}`;
    const parent = cur.parentNode;
    if (!isElement(parent) || cur.localName === 'body') return `${path}#${steps.length ? '/' + steps.reverse().join('/') : ''}`;
    const same = childElements(parent).filter((c) => c.localName === cur.localName);
    steps.push(`${cur.localName}[${same.indexOf(cur) + 1}]`);
    cur = parent;
  }
}

const TRANSLIT: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue' };

/** Readable id stem from a text: lower case, ASCII, hyphens, at most `max` characters. */
export function slug(text: string, max = 32): string {
  const s = text
    .replace(/[äöüßÄÖÜ]/g, (c) => TRANSLIT[c]!)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const cut = s.length > max ? s.slice(0, max).replace(/-[^-]*$/, '') || s.slice(0, max) : s;
  return cut;
}

/**
 * Hands out ids that are new in the document and were never used in any earlier version
 * (HP-ADR-004: "DARF NICHT die Kennung eines gelöschten Abschnitts neu vergeben").
 */
export class IdAllocator {
  private readonly taken: Set<string>;
  constructor(current: Iterable<string>, retired: Iterable<string>) {
    this.taken = new Set([...current, ...retired]);
  }
  isFree(id: string): boolean {
    return !this.taken.has(id);
  }
  reserve(id: string): void {
    this.taken.add(id);
  }
  take(stem: string, prefix: string): string {
    let base = slug(stem);
    if (base === '' || !/^[a-z]/.test(base)) base = base === '' ? prefix : `${prefix}-${base}`;
    base = base.slice(0, 56);
    let id = base;
    for (let n = 2; this.taken.has(id); n++) id = `${base}-${n}`;
    this.taken.add(id);
    return id;
  }
}

// ---------------------------------------------------------------------------------------------
// Inline markup

/** Inline elements the editor accepts, with their allowed attributes (besides lang, dir, class, title). */
const INLINE: Record<string, readonly string[]> = {
  a: ['href', 'hreflang', 'role', 'epub:type', 'id', 'data-hp-ref'],
  em: [], strong: [], b: [], i: [], u: [], s: [], small: [], mark: [], sub: [], sup: [], code: [], kbd: [], samp: [], var: [],
  q: [], cite: [], dfn: [], abbr: [], bdi: [], bdo: [], wbr: [], br: [],
  time: ['datetime'],
  span: ['data-hp-redacted', 'role', 'aria-label'],
};
const GLOBAL = new Set(['lang', 'xml:lang', 'dir', 'class', 'title']);
const SAFE_HREF = /^(https?:|mailto:|tel:)/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Elements the inline editor represents (others inside a text block, e.g. img or math, are kept by refusing a text change). */
export function isInlineElement(el: Element): boolean {
  return el.namespaceURI === XHTML_NS && (el.localName ?? '') in INLINE;
}

export function isNoteRef(el: Element): boolean {
  return el.localName === 'a' && (el.getAttribute('role') === 'doc-noteref' || (el.getAttributeNS(EPUB_NS, 'type') ?? '').split(/\s+/).includes('noteref'));
}

export function isRedactionMark(el: Element): boolean {
  return el.hasAttribute('data-hp-redacted');
}

function checkInlineElement(el: Element, where: string): void {
  const name = el.localName ?? '';
  if (el.namespaceURI !== XHTML_NS || !(name in INLINE)) throw new EditError('invalid', `${where}: <${name}> ist im Fließtext nicht erlaubt (erlaubt: ${Object.keys(INLINE).join(', ')}); Blöcke werden als eigene Struktur eingefügt`);
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes.item(i)!;
    if (a.name.startsWith('xmlns')) continue;
    if (!GLOBAL.has(a.name) && !INLINE[name]!.includes(a.name)) throw new EditError('invalid', `${where}: Attribut ${a.name} an <${name}> ist nicht erlaubt`);
  }
  if (name === 'a') {
    const href = el.getAttribute('href');
    if (href === null || href === '') throw new EditError('invalid', `${where}: <a> braucht href`);
    if (SCHEME.test(href) && !SAFE_HREF.test(href)) throw new EditError('invalid', `${where}: Verweisziel ${href} ist nicht erlaubt (nur https:, http:, mailto:, tel: oder Adressen im Dokument)`);
    if (href.startsWith('//')) throw new EditError('invalid', `${where}: protokollrelative Verweise sind nicht erlaubt`);
    const role = el.getAttribute('role');
    if (role !== null && role !== 'doc-noteref' && role !== 'doc-backlink') throw new EditError('invalid', `${where}: role="${role}" an <a> ist nicht erlaubt`);
  }
  if (name === 'span' && (el.hasAttribute('role') || el.hasAttribute('aria-label')) && !el.hasAttribute('data-hp-redacted')) throw new EditError('invalid', `${where}: role/aria-label nur am Schwärzungsplatzhalter`);
  if (el.hasAttribute('id') && !(name === 'a' && isNoteRef(el))) throw new EditError('invalid', `${where}: id ist im Fließtext nur am Fußnotenverweis erlaubt`);
  for (const c of childElements(el)) checkInlineElement(c, where);
}

/** Parses and checks an inline fragment (well-formed XHTML, whitelist). Returns the wrapper element. */
export function parseInline(fragment: string, where: string): Element {
  const errors: string[] = [];
  const doc = new DOMParser({ onError: (level, msg) => void (level !== 'warning' && errors.push(String(msg))) }).parseFromString(
    `<div xmlns="${XHTML_NS}" xmlns:epub="${EPUB_NS}">${fragment}</div>`,
    'application/xml',
  );
  if (errors.length > 0 || !doc.documentElement) throw new EditError('invalid', `${where}: Inline-Markup ist kein wohlgeformtes XHTML (${errors[0]?.replace(/\s+/g, ' ').slice(0, 160) ?? 'leer'}); Zeichen wie & und < als &amp; und &lt; schreiben`);
  const root = doc.documentElement;
  for (let n = root.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 7 || n.nodeType === 8) throw new EditError('invalid', `${where}: Kommentare und Verarbeitungsanweisungen sind nicht erlaubt`);
    if (isElement(n)) checkInlineElement(n, where);
  }
  for (const el of descendants(root)) for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 7 || n.nodeType === 8) throw new EditError('invalid', `${where}: Kommentare sind nicht erlaubt`);
  return root;
}

/** Copies nodes of `source` (from another document) into `doc`. */
export function importNodes(doc: Document, source: Node): Node[] {
  const out: Node[] = [];
  for (let n = source.firstChild; n; n = n.nextSibling) out.push(copyNode(doc, n));
  return out;
}

function copyNode(doc: Document, n: Node): Node {
  if (n.nodeType === 3 || n.nodeType === 4) return doc.createTextNode(n.nodeValue ?? '');
  const el = n as Element;
  const out = doc.createElementNS(el.namespaceURI ?? XHTML_NS, el.localName ?? 'span');
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes.item(i)!;
    if (a.name.startsWith('xmlns')) continue;
    if (a.namespaceURI === EPUB_NS) out.setAttributeNS(EPUB_NS, `epub:${a.localName}`, a.value);
    else if (a.name === 'xml:lang') out.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:lang', a.value);
    else out.setAttribute(a.name, a.value);
  }
  for (let c = el.firstChild; c; c = c.nextSibling) out.appendChild(copyNode(doc, c));
  return out;
}

/** Inline content of `el` as fragment text (namespace declarations removed), stopping at `stop`. */
export function inlineMarkup(el: Element, stop?: (n: Node) => boolean): string {
  let out = '';
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (stop && stop(n)) break;
    out += serializeNode(n);
  }
  return out.replace(/ xmlns(:epub)?="[^"]*"/g, '');
}

/** Text content with white space collapsed. */
export function textOf(n: Node, stop?: (n: Node) => boolean): string {
  let out = '';
  const walk = (x: Node) => {
    for (let c = x.firstChild; c; c = c.nextSibling) {
      if (stop && stop(c)) continue;
      if (c.nodeType === 3 || c.nodeType === 4) out += c.nodeValue ?? '';
      else if (isElement(c)) {
        if (isRedactionMark(c)) out += '[geschwärzt]';
        else if (isNoteRef(c)) out += `[${(c.textContent ?? '').trim()}]`;
        else walk(c);
      }
    }
  };
  walk(n);
  return out.replace(/\s+/g, ' ').trim();
}

export const BLOCK_CHILDREN = new Set(['ul', 'ol', 'dl', 'p', 'div', 'table', 'figure', 'pre', 'blockquote', 'section', 'aside', 'details', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

export function isBlockChild(n: Node): boolean {
  return isElement(n) && BLOCK_CHILDREN.has(n.localName ?? '');
}

/**
 * Keeps the source readable: a block inserted between indented siblings gets the same line break
 * and indentation as they have (white space between blocks is not content).
 */
export function indentLike(node: Node): void {
  const parent = node.parentNode;
  if (!parent) return;
  const sample = Array.from({ length: parent.childNodes.length }, (_, i) => parent.childNodes.item(i)!).find((n) => n !== node && n.nodeType === 3 && /\n/.test(n.nodeValue ?? '') && (n.nodeValue ?? '').trim() === '' && isElement(n.nextSibling));
  if (!sample) return;
  const ws = () => node.ownerDocument!.createTextNode(sample.nodeValue ?? '');
  if (isElement(node.previousSibling)) parent.insertBefore(ws(), node);
  if (isElement(node.nextSibling)) parent.insertBefore(ws(), node.nextSibling);
}
