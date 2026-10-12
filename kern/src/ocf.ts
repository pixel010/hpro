/**
 * OCF/EPUB package files: container.xml, package.opf and the navigation document.
 * The rules follow docs/05 (prototype) and EPUB 3.3.
 */
import { DOMParser } from '@xmldom/xmldom';
import { ContainerError } from './errors.js';

export const EPUB_MIMETYPE = 'application/epub+zip';
export const MIMETYPE_PATH = 'mimetype';
export const CONTAINER_XML_PATH = 'META-INF/container.xml';
export const PACKAGE_PATH = 'package.opf';
export const MANIFEST_PATH = 'manifest.json';
export const DEFAULT_NAV_PATH = 'content/nav.xhtml';
export const OPF_MEDIA_TYPE = 'application/oebps-package+xml';
export const XHTML_MEDIA_TYPE = 'application/xhtml+xml';

const OCF_NS = 'urn:oasis:names:tc:opendocument:xmlns:container';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

/** Percent-encodes each path segment so that a container path can be used as a URL. */
export function pathToHref(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/** Relative URL from the document at `fromPath` to `toPath` (both container paths). */
export function relativeHref(fromPath: string, toPath: string): string {
  const from = fromPath.split('/').slice(0, -1);
  const to = toPath.split('/');
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
  const up = from.slice(common).map(() => '..');
  return pathToHref([...up, ...to.slice(common)].join('/'));
}

/**
 * File and path name rules from EPUB 3.3, section 4.2.2 "File names" (subset that can be
 * checked without Unicode property tables): forbidden characters, trailing full stop,
 * private use and specials ranges, segment length. Case-insensitive uniqueness is checked
 * by the caller over the whole set of paths.
 */
export function assertOcfPath(path: string): void {
  if (path.length === 0 || path.startsWith('/') || path.endsWith('/')) {
    throw new ContainerError('input', 'path must be relative and name a file', path);
  }
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') throw new ContainerError('input', 'empty or relative path segment', path);
    if (new TextEncoder().encode(segment).length > 255) throw new ContainerError('input', 'path segment longer than 255 bytes', path);
    if (segment.endsWith('.')) throw new ContainerError('input', 'file name must not end with a full stop', path);
    for (const ch of segment) {
      const cp = ch.codePointAt(0)!;
      const forbidden =
        cp <= 0x1f ||
        (cp >= 0x7f && cp <= 0x9f) ||
        '"*:<>?\\'.includes(ch) ||
        (cp >= 0xe000 && cp <= 0xf8ff) ||
        (cp >= 0xfdd0 && cp <= 0xfdef) ||
        (cp >= 0xfff0 && cp <= 0xffff) ||
        (cp >= 0xe0000 && cp <= 0xe0fff) ||
        cp >= 0xf0000 ||
        (cp & 0xfffe) === 0xfffe;
      if (forbidden) throw new ContainerError('input', `character U+${cp.toString(16).toUpperCase().padStart(4, '0')} not allowed in OCF file names`, path);
    }
  }
}

export function containerXml(packagePath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="${OCF_NS}">
  <rootfiles>
    <rootfile full-path="${escapeXml(packagePath)}" media-type="${OPF_MEDIA_TYPE}"/>
  </rootfiles>
</container>
`;
}

type XmlDocument = ReturnType<DOMParser['parseFromString']>;

/**
 * Parses XML strictly: every warning or error from the parser is fatal. XHTML is parsed as
 * plain XML on purpose, so that HTML entities such as `&nbsp;` are rejected as in EPUB.
 */
export function parseXmlStrict(text: string, path: string): XmlDocument {
  const messages: string[] = [];
  const parser = new DOMParser({ onError: (level, message) => void messages.push(`${level}: ${String(message).trim()}`) });
  let doc: XmlDocument | undefined;
  try {
    doc = parser.parseFromString(text, 'text/xml');
  } catch (err) {
    if (messages.length === 0) messages.push((err as Error).message);
  }
  if (!doc || messages.length > 0) {
    throw new ContainerError(path === CONTAINER_XML_PATH ? 'container-xml' : 'input', `XML not well-formed: ${messages[0]}`, path);
  }
  return doc;
}

/** Returns the full-path of the first OPF rootfile, as EPUB reading systems do. */
export function parseContainerXml(text: string): string {
  const doc = parseXmlStrict(text, CONTAINER_XML_PATH);
  const root = doc.documentElement;
  if (!root || root.localName !== 'container' || root.namespaceURI !== OCF_NS) {
    throw new ContainerError('container-xml', 'root element must be OCF <container>', CONTAINER_XML_PATH);
  }
  const rootfiles = doc.getElementsByTagNameNS(OCF_NS, 'rootfile');
  for (let i = 0; i < rootfiles.length; i++) {
    const rf = rootfiles.item(i)!;
    if (rf.getAttribute('media-type') === OPF_MEDIA_TYPE) {
      const fullPath = rf.getAttribute('full-path');
      if (!fullPath) break;
      return fullPath;
    }
  }
  throw new ContainerError('container-xml', 'no rootfile with media-type application/oebps-package+xml', CONTAINER_XML_PATH);
}

export interface TocEntry {
  readonly title: string;
  /** Container path, optionally with fragment, e.g. `content/index.xhtml#b1`. */
  readonly href: string;
  readonly children?: readonly TocEntry[];
}

export interface NavInput {
  readonly navPath: string;
  readonly language: string;
  readonly title: string;
  readonly entries: readonly TocEntry[];
}

export function splitHref(href: string): { path: string; fragment: string } {
  const hash = href.indexOf('#');
  return hash < 0 ? { path: href, fragment: '' } : { path: href.slice(0, hash), fragment: href.slice(hash) };
}

export function navXhtml(input: NavInput): string {
  const list = (entries: readonly TocEntry[], depth: number): string => {
    const pad = '  '.repeat(depth);
    const items = entries.map((e) => {
      const { path, fragment } = splitHref(e.href);
      const link = `<a href="${escapeXml(relativeHref(input.navPath, path) + fragment)}">${escapeXml(e.title)}</a>`;
      const sub = e.children && e.children.length > 0 ? `\n${list(e.children, depth + 2)}\n${pad}  ` : '';
      return `${pad}  <li>${link}${sub}</li>`;
    });
    return `${pad}<ol>\n${items.join('\n')}\n${pad}</ol>`;
  };
  const lang = escapeXml(input.language);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="${XHTML_NS}" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(input.title)}</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1 id="toc-h">${escapeXml(input.title)}</h1>
${list(input.entries, 2)}
  </nav>
</body>
</html>
`;
}

export interface AccessibilityMetadata {
  /** e.g. "EPUB Accessibility 1.1 - WCAG 2.2 Level AA". Only claim this after an audit. */
  readonly conformsTo?: string;
  readonly accessMode: readonly string[];
  /** Each item is one sufficient set, comma separated, e.g. "textual" or "textual,visual". */
  readonly accessModeSufficient: readonly string[];
  readonly accessibilityFeature: readonly string[];
  readonly accessibilityHazard: readonly string[];
  readonly accessibilitySummary?: string;
}

export interface OpfItem {
  readonly path: string;
  readonly mediaType: string;
  readonly properties: readonly string[];
}

export interface OpfInput {
  readonly id: string;
  readonly title: string;
  readonly language: string;
  readonly modified: string;
  readonly creators: readonly string[];
  readonly description?: string;
  readonly accessibility?: AccessibilityMetadata;
  /** All manifest items, already sorted by the caller. */
  readonly items: readonly OpfItem[];
  readonly spine: readonly string[];
}

function itemIds(paths: readonly string[]): Map<string, string> {
  const ids = new Map<string, string>();
  const used = new Set<string>();
  for (const path of paths) {
    const base = 'r-' + path.replace(/[^A-Za-z0-9_.-]/g, '_');
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    ids.set(path, id);
  }
  return ids;
}

export function packageOpf(input: OpfInput): string {
  const ids = itemIds(input.items.map((i) => i.path));
  const meta: string[] = [
    `    <dc:identifier id="uid">${escapeXml(input.id)}</dc:identifier>`,
    `    <dc:title>${escapeXml(input.title)}</dc:title>`,
    `    <dc:language>${escapeXml(input.language)}</dc:language>`,
    ...input.creators.map((c) => `    <dc:creator>${escapeXml(c)}</dc:creator>`),
  ];
  if (input.description !== undefined) meta.push(`    <dc:description>${escapeXml(input.description)}</dc:description>`);
  meta.push(`    <meta property="dcterms:modified">${escapeXml(input.modified)}</meta>`);
  const a11y = input.accessibility;
  if (a11y) {
    const prop = (name: string, values: readonly string[]) => values.map((v) => `    <meta property="schema:${name}">${escapeXml(v)}</meta>`);
    meta.push(
      ...prop('accessMode', a11y.accessMode),
      ...prop('accessModeSufficient', a11y.accessModeSufficient),
      ...prop('accessibilityFeature', a11y.accessibilityFeature),
      ...prop('accessibilityHazard', a11y.accessibilityHazard),
    );
    if (a11y.accessibilitySummary !== undefined) meta.push(...prop('accessibilitySummary', [a11y.accessibilitySummary]));
    if (a11y.conformsTo !== undefined) meta.push(`    <meta property="dcterms:conformsTo">${escapeXml(a11y.conformsTo)}</meta>`);
  }
  const items = input.items.map((i) => {
    const props = i.properties.length > 0 ? ` properties="${escapeXml(i.properties.join(' '))}"` : '';
    return `    <item id="${ids.get(i.path)}" href="${escapeXml(pathToHref(i.path))}" media-type="${escapeXml(i.mediaType)}"${props}/>`;
  });
  const spine = input.spine.map((p) => `    <itemref idref="${ids.get(p)}"/>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${escapeXml(input.language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
${meta.join('\n')}
  </metadata>
  <manifest>
${items.join('\n')}
  </manifest>
  <spine>
${spine.join('\n')}
  </spine>
</package>
`;
}
