/**
 * Checks on XHTML content documents and SVG files before they are written into a container:
 * well-formedness, no external resources, references resolve inside the container,
 * and the script rules of the document profile (docs/03, section 1.4).
 */
import { ContainerError } from './errors.js';
import { parseXmlStrict } from './ocf.js';

const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const SVG_NS = 'http://www.w3.org/2000/svg';
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

export type Profile = 'static' | 'interactive' | 'signed';

/** Directory reserved for the versioned component library of the interactive profile. */
export const COMPONENTS_DIR = 'components/';

/** Element/attribute pairs that load a resource (as opposed to hyperlinks). */
const RESOURCE_ATTRIBUTES: ReadonlyArray<readonly [string, string]> = [
  ['link', 'href'],
  ['img', 'src'],
  ['script', 'src'],
  ['source', 'src'],
  ['audio', 'src'],
  ['video', 'src'],
  ['video', 'poster'],
  ['track', 'src'],
  ['iframe', 'src'],
  ['embed', 'src'],
  ['object', 'data'],
  ['image', 'href'],
  ['use', 'href'],
];

export interface XhtmlAnalysis {
  /** OPF manifest properties implied by the content (scripted, svg, mathml). */
  readonly properties: readonly string[];
  /** Container paths referenced as resources. */
  readonly references: readonly string[];
}

function isAbsoluteUrl(ref: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(ref) || ref.startsWith('//');
}

/** Resolves a relative reference from a document to a container path. */
export function resolveReference(docPath: string, ref: string): string {
  const url = new URL(ref, 'https://container.invalid/' + docPath.split('/').map(encodeURIComponent).join('/'));
  return decodeURIComponent(url.pathname.slice(1));
}

export type MarkupKind = 'xhtml' | 'svg';

/**
 * Analyses an XHTML content document or a standalone SVG file. Standalone SVG never may
 * contain scripts; XHTML may only in profile "interactive" and only from components/.
 */
export function analyzeMarkup(path: string, text: string, kind: MarkupKind, profile: Profile, exists: (p: string) => boolean): XhtmlAnalysis {
  const doc = parseXmlStrict(text, path);
  const root = doc.documentElement;
  const [rootName, rootNs] = kind === 'xhtml' ? ['html', XHTML_NS] : ['svg', SVG_NS];
  if (!root || root.localName !== rootName || root.namespaceURI !== rootNs) {
    throw new ContainerError('input', `root element must be <${rootName}> in namespace ${rootNs}`, path);
  }
  const properties = new Set<string>();
  const references = new Set<string>();
  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i)!;
    const name = el.localName ?? '';
    if (el.namespaceURI === SVG_NS && name === 'svg') properties.add('svg');
    if (el.namespaceURI === MATHML_NS && name === 'math') properties.add('mathml');

    for (let a = 0; a < el.attributes.length; a++) {
      const attr = el.attributes.item(a)!;
      const attrName = (attr.localName ?? attr.name).toLowerCase();
      if (attrName.startsWith('on') && attr.namespaceURI === null) {
        throw new ContainerError('input', `event handler attribute "${attr.name}" is not allowed in any profile`, path);
      }
      if (/^\s*javascript:/i.test(attr.value)) {
        throw new ContainerError('input', `javascript: URL in attribute "${attr.name}" is not allowed`, path);
      }
    }

    if (name === 'script') {
      properties.add('scripted');
      const src = el.getAttribute('src');
      if (kind === 'svg') throw new ContainerError('input', '<script> is not allowed in SVG files', path);
      if (profile !== 'interactive') {
        throw new ContainerError('input', `<script> is not allowed in profile "${profile}"`, path);
      }
      if (!src || isAbsoluteUrl(src) || !resolveReference(path, src).startsWith(COMPONENTS_DIR)) {
        throw new ContainerError('input', `profile "interactive" only allows <script src> from ${COMPONENTS_DIR}`, path);
      }
    }

    for (const [element, attribute] of RESOURCE_ATTRIBUTES) {
      if (name !== element) continue;
      const ref = el.getAttribute(attribute) ?? (attribute === 'href' ? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') : null);
      if (!ref || ref.startsWith('#')) continue;
      if (ref.startsWith('data:')) continue;
      if (isAbsoluteUrl(ref)) {
        throw new ContainerError('input', `external resource "${ref}" is not allowed; all resources must be inside the container`, path);
      }
      const target = resolveReference(path, ref);
      if (!exists(target)) throw new ContainerError('input', `referenced resource "${ref}" does not exist in the container`, path);
      references.add(target);
    }
  }
  return { properties: [...properties].sort(), references: [...references].sort() };
}
