/**
 * XML canonicalization of an element subtree, as needed by XML-DSig.
 *
 * Implemented:
 * - Exclusive XML Canonicalization 1.0 (`xml-exc-c14n#`, with and without comments), including
 *   the `InclusiveNamespaces PrefixList` parameter. This is what EU DSS writes and what the
 *   hpro format prescribes (docs/05, 6.1).
 * - Canonical XML 1.0 and 1.1 (inclusive), for signatures from other producers. Ancestor
 *   `xml:*` attributes are inherited as the specifications require; an ancestor `xml:base`
 *   under C14N 1.1 needs URI fix-up and is rejected as unsupported.
 *
 * Input is a DOM element from `@xmldom/xmldom`. The parser has already normalized line ends
 * and attribute values and expanded character and entity references, which C14N presupposes.
 */

import type { Attr, Element, Node, ProcessingInstruction } from '@xmldom/xmldom';

export const C14N = {
  exclusive: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  exclusiveWithComments: 'http://www.w3.org/2001/10/xml-exc-c14n#WithComments',
  inclusive10: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  inclusive10WithComments: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315#WithComments',
  inclusive11: 'http://www.w3.org/2006/12/xml-c14n11',
  inclusive11WithComments: 'http://www.w3.org/2006/12/xml-c14n11#WithComments',
} as const;

export const SUPPORTED_C14N: readonly string[] = Object.values(C14N);

const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;
const PROCESSING_INSTRUCTION_NODE = 7;
const COMMENT_NODE = 8;

export class C14nError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'C14nError';
  }
}

export interface C14nOptions {
  /** Prefixes from `ec:InclusiveNamespaces/@PrefixList`; `#default` stands for the default namespace. */
  readonly inclusivePrefixes?: readonly string[];
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/\t/g, '&#x9;')
    .replace(/\n/g, '&#xA;')
    .replace(/\r/g, '&#xD;');
}

const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function isNsDecl(attr: Attr): boolean {
  return attr.namespaceURI === XMLNS_NS || attr.name === 'xmlns' || attr.name.startsWith('xmlns:');
}

function declaredPrefix(attr: Attr): string {
  return attr.name === 'xmlns' ? '' : attr.name.slice('xmlns:'.length);
}

function attributesOf(el: Element): Attr[] {
  const out: Attr[] = [];
  for (let i = 0; i < el.attributes.length; i++) out.push(el.attributes.item(i)!);
  return out;
}

/** All namespace bindings in scope at `el`, nearest declaration wins. */
function inScopeNamespaces(el: Element): Map<string, string> {
  const chain: Element[] = [];
  for (let n: Node | null = el; n && n.nodeType === ELEMENT_NODE; n = n.parentNode) chain.unshift(n as Element);
  const ns = new Map<string, string>();
  for (const e of chain) for (const a of attributesOf(e)) if (isNsDecl(a)) ns.set(declaredPrefix(a), a.value);
  return ns;
}

function sortAttributes(attrs: Attr[]): Attr[] {
  return attrs.sort((a, b) => byCodeUnits(a.namespaceURI ?? '', b.namespaceURI ?? '') || byCodeUnits(a.localName ?? a.name, b.localName ?? b.name));
}

function renderAttributes(attrs: readonly Attr[]): string {
  return attrs.map((a) => ` ${a.name}="${escapeAttr(a.value)}"`).join('');
}

function renderNs(decls: [string, string][]): string {
  return decls
    .sort((a, b) => byCodeUnits(a[0], b[0]))
    .map(([p, uri]) => (p === '' ? ` xmlns="${escapeAttr(uri)}"` : ` xmlns:${p}="${escapeAttr(uri)}"`))
    .join('');
}

class Writer {
  readonly parts: string[] = [];
  constructor(readonly withComments: boolean) {}

  children(node: Node, visit: (child: Element) => void): void {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      switch (c.nodeType) {
        case ELEMENT_NODE:
          visit(c as Element);
          break;
        case TEXT_NODE:
        case CDATA_SECTION_NODE:
          this.parts.push(escapeText(c.nodeValue ?? ''));
          break;
        case PROCESSING_INSTRUCTION_NODE: {
          const pi = c as ProcessingInstruction;
          this.parts.push(`<?${pi.target}${pi.data ? ' ' + pi.data : ''}?>`);
          break;
        }
        case COMMENT_NODE:
          if (this.withComments) this.parts.push(`<!--${c.nodeValue ?? ''}-->`);
          break;
        default:
          break;
      }
    }
  }
}

function exclusive(el: Element, rendered: ReadonlyMap<string, string>, w: Writer, inclusive: ReadonlySet<string>): void {
  const attrs = attributesOf(el);
  const scope = inclusive.size > 0 ? inScopeNamespaces(el) : undefined;
  const utilized = new Map<string, string>();
  utilized.set(el.prefix ?? '', el.namespaceURI ?? '');
  for (const a of attrs) {
    if (isNsDecl(a) || !a.prefix || a.prefix === 'xml') continue;
    utilized.set(a.prefix, a.namespaceURI ?? '');
  }
  if (scope) for (const p of inclusive) if (scope.has(p) && !utilized.has(p)) utilized.set(p, scope.get(p)!);

  const next = new Map(rendered);
  const decls: [string, string][] = [];
  for (const [p, uri] of utilized) {
    if (p === 'xml') continue;
    const current = rendered.get(p) ?? '';
    if (p === '' ? uri === current : rendered.get(p) === uri) continue;
    decls.push([p, uri]);
    next.set(p, uri);
  }
  const own = sortAttributes(attrs.filter((a) => !isNsDecl(a)));
  w.parts.push(`<${el.tagName}${renderNs(decls)}${renderAttributes(own)}>`);
  w.children(el, (child) => exclusive(child, next, w, inclusive));
  w.parts.push(`</${el.tagName}>`);
}

function inclusiveC14n(el: Element, rendered: ReadonlyMap<string, string>, w: Writer, apexXmlAttrs: readonly Attr[] | undefined): void {
  const attrs = attributesOf(el);
  const scope = inScopeNamespaces(el);
  const next = new Map(rendered);
  const decls: [string, string][] = [];
  for (const [p, uri] of scope) {
    if (p === 'xml') continue;
    const current = rendered.get(p);
    if (p === '' && uri === '' && (current === undefined || current === '')) continue;
    if (current === uri) continue;
    decls.push([p, uri]);
    next.set(p, uri);
  }
  let own = attrs.filter((a) => !isNsDecl(a));
  if (apexXmlAttrs) {
    const present = new Set(own.filter((a) => a.namespaceURI === XML_NS).map((a) => a.localName));
    own = own.concat(apexXmlAttrs.filter((a) => !present.has(a.localName)));
  }
  w.parts.push(`<${el.tagName}${renderNs(decls)}${renderAttributes(sortAttributes(own))}>`);
  w.children(el, (child) => inclusiveC14n(child, next, w, undefined));
  w.parts.push(`</${el.tagName}>`);
}

/** `xml:*` attributes an apex inherits from its ancestors (nearest wins). */
function inheritedXmlAttributes(el: Element, version: '1.0' | '1.1'): Attr[] {
  const found = new Map<string, Attr>();
  for (let n = el.parentNode; n && n.nodeType === ELEMENT_NODE; n = n.parentNode) {
    for (const a of attributesOf(n as Element)) {
      if (a.namespaceURI !== XML_NS || found.has(a.localName!)) continue;
      if (version === '1.1') {
        if (a.localName === 'id') continue;
        if (a.localName === 'base') throw new C14nError('C14N 1.1 xml:base fix-up is not supported');
      }
      found.set(a.localName!, a);
    }
  }
  return [...found.values()];
}

/** Canonicalizes `el` and its descendants with the given algorithm URI. */
export function canonicalize(el: Element, algorithm: string, options: C14nOptions = {}): string {
  switch (algorithm) {
    case C14N.exclusive:
    case C14N.exclusiveWithComments: {
      const w = new Writer(algorithm === C14N.exclusiveWithComments);
      const inclusive = new Set((options.inclusivePrefixes ?? []).map((p) => (p === '#default' ? '' : p)));
      exclusive(el, new Map(), w, inclusive);
      return w.parts.join('');
    }
    case C14N.inclusive10:
    case C14N.inclusive10WithComments:
    case C14N.inclusive11:
    case C14N.inclusive11WithComments: {
      const version = algorithm.startsWith(C14N.inclusive11) ? '1.1' : '1.0';
      const w = new Writer(algorithm.endsWith('#WithComments'));
      inclusiveC14n(el, new Map(), w, inheritedXmlAttributes(el, version));
      return w.parts.join('');
    }
    default:
      throw new C14nError(`unsupported canonicalization algorithm: ${algorithm}`);
  }
}
