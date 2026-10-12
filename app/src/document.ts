/**
 * Opening a container: structure and integrity via the core (`readContainer`), then the
 * parts the reader needs: content documents in reading order, table of contents, metadata.
 */
import { ContainerError, readContainer, type IntegrityReport } from '@html-pro/kern';
import { resolvePath } from './paths.js';
import { parseToc, tocFromHeadings, type TocItem } from './toc.js';

export const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const OPF_NS = 'http://www.idpf.org/2007/opf';

export interface ContentDocument {
  readonly path: string;
  readonly title: string;
  /** Parsed source; never rendered directly (see render.ts). */
  readonly dom: Document;
  /** Set when the file is not well-formed XHTML and was read with the HTML parser instead. */
  readonly parseWarning?: string;
}

export interface LoadedDocument {
  readonly fileName: string;
  readonly byteLength: number;
  readonly id: string;
  readonly title: string;
  readonly language: string;
  readonly modified: string;
  readonly profile: string;
  readonly authors: readonly string[];
  readonly content: readonly ContentDocument[];
  readonly toc: readonly TocItem[];
  /** Where the table of contents came from. */
  readonly tocSource: 'nav' | 'headings';
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly mediaTypes: ReadonlyMap<string, string>;
  readonly integrity: IntegrityReport;
  readonly signatureFiles: readonly string[];
  /** Raw container bytes, kept for the signature check. */
  readonly bytes: Uint8Array;
}

/** Error shown to the user when a file cannot be opened at all. */
export class OpenError extends Error {
  readonly detail: string;
  constructor(message: string, detail: string) {
    super(message);
    this.name = 'OpenError';
    this.detail = detail;
  }
}

const REASONS: Record<string, string> = {
  'zip-structure': 'Die Datei ist kein lesbares ZIP-Archiv oder ist beschädigt.',
  'zip-unsupported': 'Das Archiv nutzt ZIP-Funktionen, die html-Pro nicht erlaubt (ZIP64, Verschlüsselung, mehrere Teile).',
  'zip-limit': 'Das Archiv überschreitet eine Größengrenze (Einträge, Dateigröße oder Gesamtgröße).',
  'zip-crc': 'Eine Datei im Archiv ist beschädigt (Prüfsumme CRC-32 stimmt nicht).',
  'zip-path': 'Das Archiv enthält unzulässige Pfade (z. B. „..“, absolute Pfade oder doppelte Einträge).',
  mimetype: 'Die Datei ist kein html-Pro-Container (die Datei „mimetype“ fehlt oder ist falsch).',
  'container-xml': 'META-INF/container.xml fehlt oder ist fehlerhaft.',
  manifest: 'manifest.json fehlt oder ist fehlerhaft.',
};

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function parseXhtml(path: string, bytes: Uint8Array): { dom: Document; parseWarning?: string } {
  const text = decodeText(bytes);
  const xml = new DOMParser().parseFromString(text, 'application/xhtml+xml');
  if (xml.getElementsByTagName('parsererror').length === 0 && xml.documentElement.namespaceURI === XHTML_NS) return { dom: xml };
  // Readable beats exact: show the content with the HTML parser and say so (HP-INH-001 is a
  // producer requirement; the reader still names the defect).
  const html = new DOMParser().parseFromString(text, 'text/html');
  return { dom: html, parseWarning: `${path} ist kein wohlgeformtes XHTML und wurde mit dem HTML-Parser gelesen.` };
}

function documentTitle(dom: Document, fallback: string): string {
  const title = dom.querySelector('title')?.textContent?.trim();
  if (title) return title;
  const h1 = dom.querySelector('h1')?.textContent?.trim();
  return h1 || fallback;
}

/** Container path of the EPUB navigation document, from the package document. */
function findNavPath(packagePath: string, files: ReadonlyMap<string, Uint8Array>): string | undefined {
  const opf = files.get(packagePath);
  if (!opf) return undefined;
  const dom = new DOMParser().parseFromString(decodeText(opf), 'application/xml');
  for (const item of Array.from(dom.getElementsByTagNameNS(OPF_NS, 'item'))) {
    const props = (item.getAttribute('properties') ?? '').split(/\s+/);
    const href = item.getAttribute('href');
    if (props.includes('nav') && href) return resolvePath(packagePath, href)?.path;
  }
  return undefined;
}

export async function openContainer(bytes: Uint8Array, fileName: string): Promise<LoadedDocument> {
  let container;
  try {
    container = await readContainer(bytes);
  } catch (err) {
    if (err instanceof ContainerError) {
      throw new OpenError(REASONS[err.code] ?? 'Die Datei verletzt die Containerregeln von html-Pro.', `${err.code}: ${err.message}`);
    }
    throw new OpenError('Die Datei konnte nicht gelesen werden.', String(err));
  }
  const { manifest, files } = container;
  const mediaTypes = new Map<string, string>();
  for (const r of manifest.resources) mediaTypes.set(r.url, r.type);
  for (const r of manifest.readingOrder) if (!mediaTypes.has(r.url)) mediaTypes.set(r.url, r.type);

  const content: ContentDocument[] = [];
  for (const item of manifest.readingOrder) {
    const data = files.get(item.url);
    if (!data) continue;
    const { dom, parseWarning } = parseXhtml(item.url, data);
    content.push({ path: item.url, title: documentTitle(dom, item.url), dom, ...(parseWarning ? { parseWarning } : {}) });
  }
  if (content.length === 0) {
    throw new OpenError('Das Dokument hat keinen lesbaren Inhalt.', 'readingOrder in manifest.json nennt keine vorhandene Datei.');
  }

  let toc: TocItem[] = [];
  let tocSource: 'nav' | 'headings' = 'nav';
  const navPath = findNavPath(container.packagePath, files);
  const navBytes = navPath ? files.get(navPath) : undefined;
  if (navPath && navBytes) toc = parseToc(parseXhtml(navPath, navBytes).dom, navPath);
  if (toc.length === 0) {
    toc = tocFromHeadings(content);
    tocSource = 'headings';
  }

  const profile = manifest.conformsTo.split('/').pop() ?? manifest.conformsTo;
  return {
    fileName,
    byteLength: bytes.byteLength,
    id: manifest.id,
    title: manifest.name,
    language: manifest.inLanguage,
    modified: manifest.dateModified,
    profile,
    authors: (manifest.author ?? []).map((a) => a.name),
    content,
    toc,
    tocSource,
    files,
    mediaTypes,
    integrity: container.integrity,
    signatureFiles: [...files.keys()].filter((p) => /^META-INF\/[^/]*signature[^/]*\.(xml|p7s)$/.test(p)).sort(),
    bytes,
  };
}
