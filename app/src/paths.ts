/**
 * Container paths and section addresses.
 *
 * Address forms (part 0, HP-ADR-003):
 *   short  `content/index.xhtml#leistung`
 *   long   `<manifest.id>!/content/index.xhtml#leistung`
 */

/** Matches a URL with a scheme (`https:`, `mailto:`, `data:`, …) or a protocol-relative URL. */
const ABSOLUTE = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/)/;

export function isAbsoluteUrl(href: string): boolean {
  return ABSOLUTE.test(href.trim());
}

export function splitFragment(href: string): { path: string; fragment: string | undefined } {
  const i = href.indexOf('#');
  return i < 0 ? { path: href, fragment: undefined } : { path: href.slice(0, i), fragment: href.slice(i + 1) };
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/**
 * Resolves a relative reference from the document at `basePath` to a container path.
 * Returns `undefined` for absolute URLs and for references that leave the container root.
 * A reference that is only a fragment resolves to `basePath` itself.
 */
export function resolvePath(basePath: string, href: string): { path: string; fragment: string | undefined } | undefined {
  const trimmed = href.trim();
  if (trimmed === '' || isAbsoluteUrl(trimmed)) return undefined;
  const { path: rawPath, fragment } = splitFragment(trimmed);
  const withoutQuery = rawPath.split('?')[0] ?? '';
  if (withoutQuery === '') return { path: basePath, fragment: fragment === undefined ? undefined : decode(fragment) };
  if (withoutQuery.startsWith('/')) return undefined;
  const parts = basePath.split('/');
  parts.pop();
  for (const segment of withoutQuery.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length === 0) return undefined;
      parts.pop();
    } else {
      parts.push(decode(segment));
    }
  }
  return { path: parts.join('/'), fragment: fragment === undefined ? undefined : decode(fragment) };
}

export interface Address {
  readonly path: string;
  readonly id: string | undefined;
}

export function shortAddress(a: Address): string {
  return a.id === undefined ? a.path : `${a.path}#${a.id}`;
}

export function longAddress(documentId: string, a: Address): string {
  return `${documentId}!/${shortAddress(a)}`;
}

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]*$/;

/**
 * Parses a short or long address typed or pasted by the user. The long form must name the
 * open document (`documentId`); otherwise the address belongs to another document.
 */
export function parseAddress(input: string, documentId: string): Address | undefined {
  let text = input.trim();
  const bang = text.indexOf('!/');
  if (bang >= 0) {
    if (text.slice(0, bang) !== documentId) return undefined;
    text = text.slice(bang + 2);
  }
  const { path, fragment } = splitFragment(text);
  if (!/\.x?html?$/i.test(path) || path.includes(' ')) return undefined;
  if (fragment !== undefined && !ID_PATTERN.test(fragment)) return undefined;
  return { path: decode(path), id: fragment };
}
