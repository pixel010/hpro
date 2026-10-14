// Package P16: stable addresses and nested information (docs/10, promise 3).
//
// An address is `<container path>#<id>`: the path of the content document plus the `id` of a
// section, heading, collapsible block or embedded subdocument. It never depends on pages, window
// width or font size, because it names an element, not a position. The outline path (ids of the
// enclosing addressable elements, joined with `/`) is reported for display and citation only;
// resolution uses the id, which is unique per container, so a section that moves keeps its id.
import type { Element as XmlElement, Node as XmlNode } from '@xmldom/xmldom';
import type { ReadContainer } from '../container.js';
import { XHTML_MEDIA_TYPE, parseXmlStrict, splitHref } from '../ocf.js';
import { readContainer } from '../container.js';

/** Elements that carry an address when they have an `id`. */
const ADDRESSABLE = new Set(['section', 'article', 'aside', 'details', 'figure', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'object', 'iframe']);

export interface SectionAddress {
  /** `content/index.xhtml#b3` */
  readonly address: string;
  readonly path: string;
  readonly id: string;
  readonly element: string;
  /** Ids of the enclosing addressable elements and this one, e.g. `b1/b3`. */
  readonly outline: string;
  /** Detail level: 0 for top-level elements, +1 per enclosing `section`/`details`. */
  readonly depth: number;
  /** First 80 characters of the text content, whitespace collapsed. */
  readonly label: string;
}

export interface AddressDiff {
  /** Addresses of the old version that resolve unchanged in the new one. */
  readonly kept: readonly string[];
  /** Old address → new address when the id now lives in another content document. */
  readonly moved: ReadonlyArray<{ readonly from: string; readonly to: string }>;
  /** Old addresses whose id no longer exists anywhere in the new version. */
  readonly lost: readonly string[];
  readonly added: readonly string[];
  /** True when every old address still resolves (kept or moved). */
  readonly stable: boolean;
}

function elementChildren(node: XmlNode): XmlElement[] {
  const out: XmlElement[] = [];
  for (let c = node.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) out.push(c as XmlElement);
  return out;
}

/** Addressable elements of one XHTML content document, in document order. */
export function collectAddresses(xhtml: string, path: string): SectionAddress[] {
  const doc = parseXmlStrict(xhtml, path);
  const out: SectionAddress[] = [];
  const walk = (el: XmlElement, outline: readonly string[], depth: number): void => {
    const name = el.localName ?? el.nodeName;
    const id = el.getAttribute('id');
    let nextOutline = outline;
    let nextDepth = depth;
    if (id && ADDRESSABLE.has(name)) {
      nextOutline = [...outline, id];
      const label = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
      out.push({ address: `${path}#${id}`, path, id, element: name, outline: nextOutline.join('/'), depth, label });
    }
    if (name === 'section' || name === 'details') nextDepth = depth + 1;
    for (const child of elementChildren(el)) walk(child, nextOutline, nextDepth);
  };
  if (doc.documentElement) walk(doc.documentElement as unknown as XmlElement, [], 0);
  return out;
}

/** Addresses of all XHTML content documents of a container (navigation document excluded). */
export function containerAddresses(container: ReadContainer): SectionAddress[] {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const out: SectionAddress[] = [];
  const ids = new Map<string, string>();
  for (const [path, bytes] of container.files) {
    if (!path.endsWith('.xhtml') || path.endsWith('/nav.xhtml')) continue;
    for (const a of collectAddresses(decoder.decode(bytes), path)) {
      const prior = ids.get(a.id);
      if (prior) throw new Error(`address id "${a.id}" is not unique: ${prior} and ${a.address}`);
      ids.set(a.id, a.address);
      out.push(a);
    }
  }
  return out;
}

/** Resolves `path#id` (or a bare `#id`) against a list of addresses; follows moved ids. */
export function resolveAddress(addresses: readonly SectionAddress[], address: string): SectionAddress | undefined {
  const { path, fragment: hash } = splitHref(address);
  const fragment = hash.slice(1);
  if (!fragment) return undefined;
  const exact = addresses.find((a) => a.id === fragment && (address.startsWith('#') || a.path === path));
  return exact ?? addresses.find((a) => a.id === fragment);
}

/** Compares the addresses of two versions of a document. */
export function diffAddresses(before: readonly SectionAddress[], after: readonly SectionAddress[]): AddressDiff {
  const afterById = new Map(after.map((a) => [a.id, a] as const));
  const beforeIds = new Set(before.map((a) => a.id));
  const kept: string[] = [];
  const moved: Array<{ from: string; to: string }> = [];
  const lost: string[] = [];
  for (const a of before) {
    const b = afterById.get(a.id);
    if (!b) lost.push(a.address);
    else if (b.path === a.path) kept.push(a.address);
    else moved.push({ from: a.address, to: b.address });
  }
  const added = after.filter((a) => !beforeIds.has(a.id)).map((a) => a.address);
  return { kept, moved, lost, added, stable: lost.length === 0 };
}

/** Media type of an hpro container embedded as a subdocument. */
export const SUBDOCUMENT_MEDIA_TYPE = 'application/epub+zip';

/**
 * Opens a subdocument embedded in a container (`attachments/<name>.hpro`). The bytes come from
 * the parent container only; nothing is fetched. Returns the read container and its addresses.
 */
export async function openSubdocument(parent: ReadContainer, path: string): Promise<{ container: ReadContainer; addresses: SectionAddress[] }> {
  const bytes = parent.files.get(path);
  if (!bytes) throw new Error(`subdocument ${path} is not part of the container`);
  const entry = parent.manifest.resources.find((r) => r.url === path);
  if (!entry) throw new Error(`subdocument ${path} is not listed in manifest.json`);
  const container = await readContainer(bytes);
  if (!container.integrity.ok) throw new Error(`subdocument ${path} fails its integrity check`);
  return { container, addresses: containerAddresses(container) };
}

export { XHTML_MEDIA_TYPE };
