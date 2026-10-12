/**
 * Opening a container: structure and integrity via the core (`readContainer`), then the
 * parts the reader needs: content documents in reading order, table of contents, metadata.
 */
import { ContainerError, readContainer, verifyIntegrity, type HproManifest, type IntegrityReport, type ReadContainer } from '@hpro/kern';
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

/** A version of the document: the main version or a frozen rendition (HP-PROF-006). */
export interface VersionInfo {
  /** null = main version. */
  readonly id: string | null;
  readonly label: string;
  /** Last path segment of `conformsTo`, e.g. `static`, `signed`. */
  readonly profile: string;
  readonly manifestPath: string;
  readonly createdAt?: string;
  /** `computedAt` and `calculator` of the version manifest (HPF-STO-006, HPF-FRZ-001). */
  readonly computedAt?: string;
  readonly calculator?: string;
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
  /** All versions of the document; `version` is the one shown. */
  readonly versions: readonly VersionInfo[];
  readonly version: VersionInfo;
  /** `manifest.json` of the shown version (components, data; P15). */
  readonly manifest: HproManifest;
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
  'zip-unsupported': 'Das Archiv nutzt ZIP-Funktionen, die hpro nicht erlaubt (ZIP64, Verschlüsselung, mehrere Teile).',
  'zip-limit': 'Das Archiv überschreitet eine Größengrenze (Einträge, Dateigröße oder Gesamtgröße).',
  'zip-crc': 'Eine Datei im Archiv ist beschädigt (Prüfsumme CRC-32 stimmt nicht).',
  'zip-path': 'Das Archiv enthält unzulässige Pfade (z. B. „..“, absolute Pfade oder doppelte Einträge).',
  mimetype: 'Die Datei ist kein hpro-Container (die Datei „mimetype“ fehlt oder ist falsch).',
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

function calculatorLabel(m: Record<string, unknown>): string | undefined {
  const c = m['calculator'] as { name?: unknown; version?: unknown; spec?: unknown } | undefined;
  if (!c || typeof c.name !== 'string') return undefined;
  return `${c.name}${typeof c.version === 'string' ? ' ' + c.version : ''}${typeof c.spec === 'string' ? ` (Teil 3 v${c.spec})` : ''}`;
}

function versionsOf(container: ReadContainer): VersionInfo[] {
  const main = container.manifest as HproManifest & Record<string, unknown>;
  const profileOf = (m: { conformsTo?: unknown }) => (typeof m.conformsTo === 'string' ? (m.conformsTo.split('/').pop() ?? m.conformsTo) : '?');
  const out: VersionInfo[] = [
    {
      id: null,
      label: 'Hauptfassung',
      profile: profileOf(main),
      manifestPath: 'manifest.json',
      ...(typeof main['computedAt'] === 'string' ? { computedAt: main['computedAt'] } : {}),
      ...(calculatorLabel(main) ? { calculator: calculatorLabel(main)! } : {}),
    },
  ];
  const list = Array.isArray(main['renditions']) ? (main['renditions'] as Array<Record<string, unknown>>) : [];
  for (const r of list) {
    const id = typeof r['id'] === 'string' ? r['id'] : undefined;
    const url = typeof r['url'] === 'string' ? r['url'] : undefined;
    const bytes = url ? container.files.get(url) : undefined;
    if (!id || !url || !bytes) continue;
    let m: Record<string, unknown> = {};
    try {
      m = JSON.parse(decodeText(bytes)) as Record<string, unknown>;
    } catch {
      /* listed but unreadable: shown with what the main manifest says */
    }
    out.push({
      id,
      label: `Eingefrorene Fassung ${id}`,
      profile: profileOf(m),
      manifestPath: url,
      ...(typeof r['createdAt'] === 'string' ? { createdAt: r['createdAt'] } : {}),
      ...(typeof m['computedAt'] === 'string' ? { computedAt: m['computedAt'] } : {}),
      ...(calculatorLabel(m) ? { calculator: calculatorLabel(m)! } : {}),
    });
  }
  return out;
}

/**
 * Opens a container and shows one of its versions: the main version (default) or the frozen
 * rendition `versionId`. For a rendition the reading order, the hashes and the table of contents
 * come from its own manifest under `renditions/<id>/` (HP-PROF-006).
 */
export async function openContainer(bytes: Uint8Array, fileName: string, versionId: string | null = null): Promise<LoadedDocument> {
  let container: ReadContainer;
  try {
    container = await readContainer(bytes);
  } catch (err) {
    if (err instanceof ContainerError) {
      throw new OpenError(REASONS[err.code] ?? 'Die Datei verletzt die Containerregeln von hpro.', `${err.code}: ${err.message}`);
    }
    throw new OpenError('Die Datei konnte nicht gelesen werden.', String(err));
  }
  const { files } = container;
  const versions = versionsOf(container);
  const version = versions.find((v) => v.id === versionId) ?? versions[0]!;
  let manifest: HproManifest = container.manifest;
  let integrity = container.integrity;
  if (version.id !== null) {
    try {
      manifest = JSON.parse(decodeText(files.get(version.manifestPath)!)) as HproManifest;
    } catch (err) {
      throw new OpenError('Das Manifest der eingefrorenen Fassung ist fehlerhaft.', String(err));
    }
    const prefix = `renditions/${version.id}/`;
    integrity = await verifyIntegrity(manifest, new Map([...files].filter(([p]) => p.startsWith(prefix) && p !== version.manifestPath)));
  }
  const mediaTypes = new Map<string, string>();
  for (const r of manifest.resources ?? []) mediaTypes.set(r.url, r.type);
  for (const r of manifest.readingOrder ?? []) if (!mediaTypes.has(r.url)) mediaTypes.set(r.url, r.type);

  const content: ContentDocument[] = [];
  for (const item of manifest.readingOrder ?? []) {
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
  const navPath = version.id === null ? findNavPath(container.packagePath, files) : [...mediaTypes.keys()].find((p) => /(^|\/)nav\.xhtml$/.test(p));
  const navBytes = navPath ? files.get(navPath) : undefined;
  if (navPath && navBytes) toc = parseToc(parseXhtml(navPath, navBytes).dom, navPath);
  if (toc.length === 0) {
    toc = tocFromHeadings(content);
    tocSource = 'headings';
  }

  const profile = manifest.conformsTo?.split('/').pop() ?? manifest.conformsTo ?? '?';
  return {
    fileName,
    byteLength: bytes.byteLength,
    id: container.manifest.id,
    title: manifest.name ?? container.manifest.name,
    language: manifest.inLanguage ?? container.manifest.inLanguage,
    modified: manifest.dateModified ?? container.manifest.dateModified,
    profile,
    authors: (container.manifest.author ?? []).map((a) => a.name),
    content,
    toc,
    tocSource,
    files,
    mediaTypes,
    integrity,
    signatureFiles: [...files.keys()].filter((p) => /^META-INF\/[^/]*signature[^/]*\.(xml|p7s)$/.test(p)).sort(),
    bytes,
    versions,
    version,
    manifest,
  };
}
