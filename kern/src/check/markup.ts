/**
 * XML helpers for the conformance checker: strict parsing with line numbers, DOCTYPE
 * inspection (HPR-INH-002) and small tree utilities. External entities and DTDs are never
 * loaded (the parser does not support them, and the DOCTYPE is inspected as text first).
 */
import { DOMParser } from '@xmldom/xmldom';

export const NS = {
  xhtml: 'http://www.w3.org/1999/xhtml',
  svg: 'http://www.w3.org/2000/svg',
  mathml: 'http://www.w3.org/1998/Math/MathML',
  xlink: 'http://www.w3.org/1999/xlink',
  epub: 'http://www.idpf.org/2007/ops',
  xml: 'http://www.w3.org/XML/1998/namespace',
  opf: 'http://www.idpf.org/2007/opf',
  dc: 'http://purl.org/dc/elements/1.1/',
  ocf: 'urn:oasis:names:tc:opendocument:xmlns:container',
  odfManifest: 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  xades: 'http://uri.etsi.org/01903/v1.3.2#',
  xades141: 'http://uri.etsi.org/01903/v1.4.1#',
} as const;

export type XmlDocument = ReturnType<DOMParser['parseFromString']>;
export type XmlElement = NonNullable<XmlDocument['documentElement']>;

export interface ParseResult {
  readonly doc?: XmlDocument;
  /** First parser error with its position, if the text is not well-formed. */
  readonly error?: { readonly message: string; readonly line?: number; readonly column?: number };
}

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });

export function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return decoder.decode(bytes);
  } catch {
    return undefined;
  }
}

/** Parses XML strictly: every error (including undefined entities) is reported. */
export function parseXml(text: string): ParseResult {
  let first: ParseResult['error'];
  const parser = new DOMParser({
    onError: (level, message, ...rest) => {
      if (level === 'warning' || first) return;
      const locator = (rest[0] as { lineNumber?: number; columnNumber?: number } | undefined) ?? undefined;
      const text = String(message).replace(/\s+/g, ' ').trim();
      const m = /@#\[line:(\d+),col:(\d+)\]/.exec(text);
      first = {
        message: text.replace(/\s*@#\[line:\d+,col:\d+\]/, ''),
        ...(m ? { line: Number(m[1]), column: Number(m[2]) } : locator?.lineNumber ? { line: locator.lineNumber, ...(locator.columnNumber ? { column: locator.columnNumber } : {}) } : {}),
      };
    },
  });
  let doc: XmlDocument | undefined;
  try {
    doc = parser.parseFromString(text, 'text/xml');
  } catch (err) {
    const e = err as Error & { locator?: { lineNumber?: number; columnNumber?: number } };
    if (!first) {
      first = {
        message: String(e.message).replace(/\s+/g, ' ').trim(),
        ...(e.locator?.lineNumber ? { line: e.locator.lineNumber, ...(e.locator.columnNumber ? { column: e.locator.columnNumber } : {}) } : {}),
      };
    }
  }
  // xmldom reports undefined entities without position; locate the first occurrence in the text.
  const entity = first && first.line === undefined ? /entity not found:\s*(&[^;\s]+;)/.exec(first.message)?.[1] : undefined;
  if (first && entity) {
    const at = text.indexOf(entity);
    if (at >= 0) {
      const before = text.slice(0, at);
      first = { ...first, line: before.split('\n').length, column: at - before.lastIndexOf('\n') };
    }
  }
  if (first || !doc || !doc.documentElement) return { error: first ?? { message: 'kein Wurzelelement' } };
  return { doc };
}

export interface DoctypeInfo {
  readonly line: number;
  readonly external: boolean;
  readonly entities: boolean;
  readonly text: string;
}

/** Finds a DOCTYPE declaration in the prolog and classifies it (HPR-INH-002). */
export function inspectDoctype(text: string): DoctypeInfo | undefined {
  const start = text.search(/<!DOCTYPE/i);
  if (start < 0) return undefined;
  const root = text.search(/<[A-Za-z_]/);
  if (root >= 0 && root < start) return undefined;
  let depth = 0;
  let end = start;
  for (; end < text.length; end++) {
    const c = text[end];
    if (c === '[') depth++;
    else if (c === ']') depth--;
    else if (c === '>' && depth <= 0) break;
  }
  const decl = text.slice(start, end + 1);
  const line = text.slice(0, start).split('\n').length;
  const head = decl.replace(/\[[\s\S]*\]/, '');
  return { line, external: /\b(SYSTEM|PUBLIC)\b/.test(head), entities: /\[[\s\S]*<!ENTITY/i.test(decl), text: decl };
}

export function elements(root: XmlDocument | XmlElement): XmlElement[] {
  const list = root.getElementsByTagName('*');
  const out: XmlElement[] = [];
  for (let i = 0; i < list.length; i++) out.push(list.item(i)!);
  return out;
}

export function children(el: XmlElement): XmlElement[] {
  const out: XmlElement[] = [];
  for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) out.push(c as unknown as XmlElement);
  return out;
}

export function lineOf(node: { lineNumber?: number } | null | undefined): number | undefined {
  const n = node?.lineNumber;
  return typeof n === 'number' && n > 0 ? n : undefined;
}

export function columnOf(node: { columnNumber?: number } | null | undefined): number | undefined {
  const n = node?.columnNumber;
  return typeof n === 'number' && n > 0 ? n : undefined;
}

export function localName(el: XmlElement): string {
  return el.localName ?? el.nodeName;
}

export function isHtml(el: XmlElement, ...names: string[]): boolean {
  return el.namespaceURI === NS.xhtml && (names.length === 0 || names.includes(localName(el)));
}

export function ancestors(el: XmlElement): XmlElement[] {
  const out: XmlElement[] = [];
  for (let p = el.parentNode; p && p.nodeType === 1; p = p.parentNode) out.push(p as unknown as XmlElement);
  return out;
}

export function hasAncestor(el: XmlElement, test: (a: XmlElement) => boolean): boolean {
  return ancestors(el).some(test);
}

export function text(el: XmlElement): string {
  return el.textContent ?? '';
}

/** Text content without `template` subtrees (the light tree of a component, HPR-SBX-009). */
export function lightText(el: XmlElement): string {
  let out = '';
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 3 || c.nodeType === 4) out += c.nodeValue ?? '';
    else if (c.nodeType === 1) {
      const e = c as unknown as XmlElement;
      if (localName(e) !== 'template') out += lightText(e);
    }
  }
  return out;
}

export interface Attr {
  readonly name: string;
  readonly localName: string;
  readonly namespace: string | null;
  readonly value: string;
}

export function attributes(el: XmlElement): Attr[] {
  const out: Attr[] = [];
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes.item(i)!;
    if (a.name === 'xmlns' || a.name.startsWith('xmlns:')) continue;
    out.push({ name: a.name, localName: a.localName ?? a.name, namespace: a.namespaceURI, value: a.value });
  }
  return out;
}

/** Attribute in no namespace, or `null`. */
export function attr(el: XmlElement, name: string): string | null {
  return el.hasAttribute(name) ? el.getAttribute(name) : null;
}

/** Simple XPath-like path for locations (`/html/body/section[2]/p[1]`). */
export function xpathOf(el: XmlElement): string {
  const parts: string[] = [];
  let cur: XmlElement | null = el;
  while (cur && cur.nodeType === 1) {
    const name = localName(cur);
    let index = 1;
    for (let s = cur.previousSibling; s; s = s.previousSibling) if (s.nodeType === 1 && localName(s as unknown as XmlElement) === name) index++;
    parts.unshift(`${name}[${index}]`);
    const parent: Node | null = cur.parentNode as Node | null;
    cur = parent && parent.nodeType === 1 ? (parent as unknown as XmlElement) : null;
  }
  return '/' + parts.join('/');
}
