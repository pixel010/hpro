/**
 * Shared state of one check run: the scanned container, the report builder, the versions
 * ("Fassungen": main version and frozen renditions, part 1 section 3.3) with their parsed
 * documents and stylesheets, and small helpers used by the rule modules.
 */
import type { CssDeclaration, CssReference, CssSheet } from './css.js';
import type { ParseResult, XmlDocument, XmlElement } from './markup.js';
import type { Location, Params, Profile, ReportBuilder } from './report.js';
import type { ScanEntry, ZipScan } from './zipscan.js';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

/** Message of an external validator (EPUB validator), already mapped to the four classes. */
export interface ExternalMessage {
  readonly severity: 'FATAL' | 'ERROR' | 'WARNING' | 'INFO';
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly line?: number;
}

export interface ExternalResult {
  readonly tool: string;
  readonly messages?: readonly ExternalMessage[];
  /** Set when the tool did not run or produced no usable result (`tool-error`). */
  readonly error?: string;
}

export interface CheckOptions {
  /** Shown in the report (`file.name`). */
  readonly fileName: string;
  readonly strict?: boolean;
  /** Levels requested in addition to the claimed ones (`--level`, section 3.2). */
  readonly levels?: readonly ('Basis' | 'Lebendig' | 'Signiert' | 'Archiv')[];
  /** Trust anchors for signature validation, DER. */
  readonly trustAnchors?: readonly Uint8Array[];
  /** ISO 8601 validation time; default now. */
  readonly validationTime?: string;
  /** Redacted strings to search for (HPR-LOCK-005); without them the rule is not checked. */
  readonly redactedTerms?: readonly string[];
  /** EPUB validator (HPR-CONT-024/028); without it the rules are not checked. */
  readonly epubValidator?: (bytes: Uint8Array) => Promise<ExternalResult>;
  /** PDF/A validator for reference renditions (HPR-SIG-020). */
  readonly pdfaValidator?: (bytes: Uint8Array, path: string) => Promise<{ readonly ok: boolean; readonly detail: string; readonly error?: string }>;
  readonly tool?: { readonly name: string; readonly version: string };
  readonly checkedAt?: string;
  /** Function names part 3 supports (`03-funktionen.json`); without them only the deny list of HPR-SBX-014 applies. */
  readonly supportedFunctions?: readonly string[];
}

export interface MarkupDoc {
  readonly path: string;
  readonly kind: 'xhtml' | 'svg';
  readonly text: string;
  readonly doc: XmlDocument;
  readonly root: XmlElement;
}

export interface StyleSource {
  /** File the CSS lives in (stylesheet or XHTML document with `style` element). */
  readonly path: string;
  readonly sheet: CssSheet;
  /** Applies only to print (`link media="print"`). */
  readonly printOnly: boolean;
}

export interface StyleAttribute {
  readonly path: string;
  readonly element: XmlElement;
  readonly line: number | undefined;
  readonly declarations: readonly CssDeclaration[];
  readonly references: readonly CssReference[];
}

export interface Fassung {
  /** `null` for the main version. */
  readonly id: string | null;
  /** `''` or `renditions/<id>/`. */
  readonly prefix: string;
  readonly manifestPath: string;
  readonly manifest: JsonObject;
  profile: Profile;
  /** Container paths of the files of this version (section 3.3), without its manifest.json. */
  readonly paths: readonly string[];
  /** Media types from `resources` and `readingOrder`. */
  readonly types: Map<string, string>;
  readonly readingOrder: string[];
  readonly docs: Map<string, MarkupDoc>;
  readonly svgs: Map<string, MarkupDoc>;
  readonly styles: StyleSource[];
  /** Style sources that apply to each XHTML document (linked stylesheets and `style` elements). */
  readonly docStyles: Map<string, StyleSource[]>;
  readonly styleAttributes: StyleAttribute[];
  /** Parse results of every XHTML/SVG file, also the broken ones (HPR-INH-001). */
  readonly parsed: Map<string, ParseResult & { text?: string }>;
  navPath?: string;
}

export interface Signature {
  readonly file: string;
  readonly id: string;
  readonly element: XmlElement;
  readonly references: ReadonlyArray<{ readonly uri: string; readonly path: string | null; readonly type: string | null; readonly id: string | null }>;
  /** `null` = main version; otherwise the id of a frozen rendition (section 7.1). */
  fassung: string | null;
  /** True when the references mix main-version and rendition files (HPR-PROF-013). */
  mixed: boolean;
  signingTime?: string;
}

export interface Ctx {
  readonly bytes: Uint8Array;
  readonly options: CheckOptions;
  readonly report: ReportBuilder;
  scan: ZipScan;
  /** Readable file entries by path (no directories, no corrupt entries). */
  readonly files: Map<string, Uint8Array>;
  readonly entryByName: Map<string, ScanEntry>;
  main?: Fassung;
  readonly fassungen: Fassung[];
  readonly signatures: Signature[];
}

/** JSON Pointer (RFC 6901) from tokens. */
export function pointer(...tokens: Array<string | number>): string {
  return tokens.map((t) => '/' + String(t).replace(/~/g, '~0').replace(/\//g, '~1')).join('');
}

export const loc = {
  container: (): Location => ({ kind: 'container' }),
  entry: (path: string): Location => ({ kind: 'entry', path }),
  manifest: (path: string, ptr: string): Location => ({ kind: 'manifest', path, pointer: ptr }),
  xml: (path: string, line?: number, column?: number, xpath?: string): Location => ({ kind: 'xml', path, ...(line ? { line } : {}), ...(column ? { column } : {}), ...(xpath ? { xpath } : {}) }),
  css: (path: string, line?: number, selector?: string): Location => ({ kind: 'css', path, ...(line ? { line } : {}), ...(selector ? { selector } : {}) }),
  signature: (path: string, signatureId: string, uri?: string): Location => ({ kind: 'signature', path, signatureId, ...(uri ? { uri } : {}) }),
  rendition: (id: string): Location => ({ kind: 'rendition', id }),
  external: (tool: string, code?: string): Location => ({ kind: 'external', tool, ...(code ? { code } : {}) }),
};

export function isObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

export const PROFILE_RE = /^https:\/\/hpro\.example\/spec\/(\d+)\.(\d+)\/profile\/(static|interactive|signed|archive)$/;
export const CHECKER_VERSION = { major: 0, minor: 1 } as const;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
export const RFC3339_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
/** RFC 3339 date-time with `Z` or a numeric offset. */
export const RFC3339_RE = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;
export const LANG_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/;
export const UUID_URN_RE = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const SRI_RE = /^sha256-[A-Za-z0-9+/]{43}=$/;
export const MEDIA_TYPE_RE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}$/;
export const ID_RE = /^[A-Za-z][A-Za-z0-9_.-]*$/;
export const X_PREFIX_RE = /^x-([a-z0-9]+)-/;

/** Core media types of HP-CONT-015. */
export const CORE_MEDIA_TYPES: ReadonlySet<string> = new Set([
  'application/xhtml+xml', 'text/css', 'image/svg+xml', 'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'audio/mpeg', 'audio/ogg', 'font/woff2', 'application/json',
]);

/** True for a valid timestamp in the strict form `YYYY-MM-DDThh:mm:ssZ`. */
export function isValidUtc(value: unknown, re: RegExp = DATE_RE): value is string {
  if (typeof value !== 'string' || !re.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 19) === value.slice(0, 19);
}

export function isAbsoluteUri(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z][A-Za-z0-9+.-]*:[^\s]*$/.test(v) && !v.startsWith('//');
}

/** True for a reference that leaves the container (HPR-CONT-020). */
export function isExternalRef(value: string): boolean {
  const v = value.trim();
  if (v === '' || v.startsWith('#') || /^data:/i.test(v)) return false;
  return /^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('//');
}

/** Resolves a relative reference against a container path; returns path and fragment. */
export function resolveRef(fromPath: string, ref: string): { path: string; fragment: string } | undefined {
  try {
    const base = 'https://container.invalid/' + fromPath.split('/').map(encodeURIComponent).join('/');
    const url = new URL(ref.trim(), base);
    if (url.host !== 'container.invalid') return undefined;
    return { path: decodeURIComponent(url.pathname.slice(1)), fragment: decodeURIComponent(url.hash.slice(1)) };
  } catch {
    return undefined;
  }
}

/** Guesses the media type of a path from its extension (only used when the manifest has none). */
export function typeByExtension(path: string): string | undefined {
  const ext = /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase();
  const map: Record<string, string> = {
    xhtml: 'application/xhtml+xml', html: 'application/xhtml+xml', htm: 'application/xhtml+xml', css: 'text/css', svg: 'image/svg+xml',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', json: 'application/json',
    js: 'text/javascript', mjs: 'text/javascript', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf', opf: 'application/oebps-package+xml',
    wasm: 'application/wasm', vtt: 'text/vtt',
  };
  return ext ? map[ext] : undefined;
}

export function typeOf(f: Fassung, path: string): string | undefined {
  return f.types.get(path) ?? typeByExtension(path);
}

/** Records a finding for a version (rendition id taken from the version). */
export function finding(ctx: Ctx, rule: string, params: Params, location?: Location, f?: Fassung | null): void {
  ctx.report.finding(rule, params, location, f?.id ?? null);
}

/** True when the container has a file entry at `path`, readable or not (a corrupt entry still exists). */
export function hasEntry(ctx: Ctx, path: string): boolean {
  const e = ctx.entryByName.get(path);
  return !!e && !e.isDirectory;
}

/**
 * True when `path` exists but its content cannot be used: the entry is unreadable (HPR-CONT-002,
 * -003, -027) or an XML file of the version did not parse (HPR-INH-001, HPR-CONT-022). A rule that
 * needs that content is then reported as not checked with reason `fatal` (HPR-CONT-027), instead
 * of a consequential finding such as "target does not exist".
 */
export function contentUnavailable(ctx: Ctx, f: Fassung, path: string, rule: string): boolean {
  if (!hasEntry(ctx, path)) return false;
  const unreadable = !ctx.files.has(path);
  const unparsed = f.parsed.has(path) && !f.docs.has(path) && !f.svgs.has(path);
  if (!unreadable && !unparsed) return false;
  ctx.report.notChecked(rule, 'fatal', `${path} ${unreadable ? 'ist nicht lesbar' : 'ist nicht wohlgeformt'} (Inhalt wird nicht verwendet)`);
  return true;
}

/** Directories whose files are payload, not content of the version (attachments, sources, comments). */
export function isPayloadPath(f: Fassung, path: string): boolean {
  const rel = path.slice(f.prefix.length);
  return rel.startsWith('attachments/') || rel.startsWith('original/') || rel.startsWith('annotations/');
}
