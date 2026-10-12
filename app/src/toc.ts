/**
 * Table of contents: from the EPUB navigation document (`nav` with `epub:type="toc"`,
 * HP-ADR-007), or — when a container has none — from the headings of the content documents.
 */
import { resolvePath, type Address } from './paths.js';

const OPS_NS = 'http://www.idpf.org/2007/ops';

export interface TocItem {
  readonly label: string;
  readonly target: Address;
  readonly children: readonly TocItem[];
}

function epubType(el: Element): string[] {
  const value = el.getAttributeNS(OPS_NS, 'type') ?? el.getAttribute('epub:type') ?? '';
  return value.split(/\s+/).filter(Boolean);
}

function text(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function childElements(el: Element, localName: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === localName);
}

function readList(list: Element, navPath: string): TocItem[] {
  const items: TocItem[] = [];
  for (const li of childElements(list, 'li')) {
    const link = childElements(li, 'a')[0] ?? childElements(li, 'span')[0];
    const sub = childElements(li, 'ol')[0] ?? childElements(li, 'ul')[0];
    const children = sub ? readList(sub, navPath) : [];
    const href = link?.localName === 'a' ? link.getAttribute('href') : null;
    const resolved = href ? resolvePath(navPath, href) : undefined;
    if (link && resolved) {
      items.push({ label: text(link) || resolved.path, target: { path: resolved.path, id: resolved.fragment }, children });
    } else {
      // Headings without a link (`span`) only group their children.
      items.push(...children);
    }
  }
  return items;
}

export function parseToc(nav: Document, navPath: string): TocItem[] {
  const navs = Array.from(nav.getElementsByTagName('nav'));
  const toc = navs.find((n) => epubType(n).includes('toc')) ?? navs.find((n) => n.getAttribute('role') === 'doc-toc') ?? navs[0];
  if (!toc) return [];
  const list = childElements(toc, 'ol')[0] ?? childElements(toc, 'ul')[0];
  return list ? readList(list, navPath) : [];
}

export function tocFromHeadings(content: ReadonlyArray<{ readonly path: string; readonly title: string; readonly dom: Document }>): TocItem[] {
  const items: TocItem[] = [];
  for (const doc of content) {
    const headings = Array.from(doc.dom.querySelectorAll('h1[id], h2[id], h3[id]'));
    const top: { label: string; target: Address; children: TocItem[] }[] = [];
    for (const h of headings) {
      const entry = { label: text(h), target: { path: doc.path, id: h.id }, children: [] as TocItem[] };
      const parent = top[top.length - 1];
      if (h.localName !== 'h1' && h.localName !== 'h2' && parent) parent.children.push(entry);
      else top.push(entry);
    }
    if (top.length === 0) items.push({ label: doc.title, target: { path: doc.path, id: undefined }, children: [] });
    else items.push(...top);
  }
  return items;
}

/** Depth-first list of all entries, for lookups and "current section" marking. */
export function flattenToc(items: readonly TocItem[]): TocItem[] {
  return items.flatMap((i) => [i, ...flattenToc(i.children)]);
}
