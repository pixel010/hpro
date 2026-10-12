/** XHTML helpers for locking, sealing and redaction (@xmldom/xmldom, the core's XML parser). */
import { DOMParser, XMLSerializer, type Document, type Element, type Node } from '@xmldom/xmldom';
import { fromUtf8 } from '../bytes.js';

export const XHTML_NS = 'http://www.w3.org/1999/xhtml';
export const XHTML_TYPE = 'application/xhtml+xml';

export function parseXml(text: string, path: string, type = XHTML_TYPE): Document {
  const errors: string[] = [];
  const doc = new DOMParser({ onError: (level, msg) => void (level !== 'warning' && errors.push(String(msg))) }).parseFromString(text, type as 'application/xhtml+xml');
  if (errors.length > 0 || !doc.documentElement) throw new Error(`${path}: not well-formed XML: ${errors[0] ?? 'no root element'}`);
  return doc;
}

export function parseXmlBytes(bytes: Uint8Array, path: string, type = XHTML_TYPE): Document {
  return parseXml(fromUtf8(bytes), path, type);
}

/** Serialises `doc` and keeps the XML declaration and final newline of the original text. */
export function serializeXml(doc: Document, original: string): string {
  const body = new XMLSerializer().serializeToString(doc);
  const decl = /^<\?xml[^>]*\?>\s*/.exec(original)?.[0];
  return (decl && !body.startsWith('<?xml') ? decl : '') + body + (original.endsWith('\n') && !body.endsWith('\n') ? '\n' : '');
}

export function serializeNode(node: Node): string {
  return new XMLSerializer().serializeToString(node);
}

export function isElement(n: Node | null | undefined): n is Element {
  return !!n && n.nodeType === 1;
}

export function childElements(n: Node): Element[] {
  const out: Element[] = [];
  for (let c = n.firstChild; c; c = c.nextSibling) if (isElement(c)) out.push(c);
  return out;
}

/** All elements below `root` (not `root` itself) in document order. */
export function descendants(root: Node): Element[] {
  const out: Element[] = [];
  const stack = childElements(root).reverse();
  while (stack.length > 0) {
    const el = stack.pop()!;
    out.push(el);
    const kids = childElements(el);
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]!);
  }
  return out;
}

export function byId(doc: Document, id: string): Element | undefined {
  return descendants(doc).find((e) => e.getAttribute('id') === id);
}

/** Text nodes below `root` in document order. */
export function textNodes(root: Node): Node[] {
  const out: Node[] = [];
  const walk = (n: Node) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3 || c.nodeType === 4) out.push(c);
      else if (isElement(c)) walk(c);
    }
  };
  walk(root);
  return out;
}

export function isInside(node: Node, ancestor: Node): boolean {
  for (let p: Node | null = node; p; p = p.parentNode) if (p === ancestor) return true;
  return false;
}

/** Ids of `el` and its ancestors, nearest first. */
export function ancestorIds(el: Node): string[] {
  const out: string[] = [];
  for (let p: Node | null = el; p; p = p.parentNode) if (isElement(p) && p.getAttribute('id')) out.push(p.getAttribute('id')!);
  return out;
}

/** Element/attribute pairs that embed a resource (as opposed to hyperlinks). */
export const EMBEDDING_ATTRIBUTES: ReadonlyArray<readonly [string, string]> = [
  ['img', 'src'],
  ['source', 'src'],
  ['audio', 'src'],
  ['video', 'src'],
  ['video', 'poster'],
  ['track', 'src'],
  ['embed', 'src'],
  ['object', 'data'],
  ['image', 'href'],
  ['use', 'href'],
  ['iframe', 'src'],
];

/** Resolves a relative reference against a container path; undefined for absolute URLs and paths leaving the container. */
export function resolveHref(base: string, href: string): { path: string; fragment: string } | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return undefined;
  const hash = href.indexOf('#');
  const rel = decodeURIComponent(hash < 0 ? href : href.slice(0, hash));
  const fragment = hash < 0 ? '' : href.slice(hash + 1);
  if (rel === '') return { path: base, fragment };
  const parts = rel.startsWith('/') ? [] : base.split('/').slice(0, -1);
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return undefined;
      parts.pop();
    } else parts.push(seg);
  }
  return { path: parts.join('/'), fragment };
}

/** Relative reference from the document at `from` to the container path `to`. */
export function relativeHref(from: string, to: string): string {
  const a = from.split('/').slice(0, -1);
  const b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].map((s) => (s === '..' ? s : encodeURIComponent(s))).join('/');
}

/** Embedded resources referenced below `root`, resolved against `path`. */
export function embeddedReferences(root: Node, path: string): Array<{ el: Element; attr: string; target: string }> {
  const out: Array<{ el: Element; attr: string; target: string }> = [];
  for (const el of [...(isElement(root) ? [root] : []), ...descendants(root)]) {
    for (const [name, attr] of EMBEDDING_ATTRIBUTES) {
      if (el.localName !== name) continue;
      const value = el.getAttribute(attr) ?? (attr === 'href' ? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') : null);
      if (!value) continue;
      const r = resolveHref(path, value);
      if (r && r.path !== path) out.push({ el, attr, target: r.path });
    }
  }
  return out;
}
