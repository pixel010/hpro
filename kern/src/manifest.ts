/**
 * html-Pro manifest (`manifest.json`): document metadata plus one SHA-256 integrity value
 * per resource (docs/03, section 1.3; format as in prototyp/build_container.py).
 *
 * Coverage rule: every container entry is listed with its hash, except
 *   - `mimetype` (fixed content, checked structurally),
 *   - `manifest.json` itself,
 *   - everything below `META-INF/` (container.xml is generated from fixed rules and checked
 *     on read; signatures are added after the manifest is written).
 * Entries outside this rule that are not listed are reported as `unlisted`, e.g. comments
 * added later under `annotations/` (docs/05, case V9: the reader must name them).
 */
import { fromUtf8 } from './bytes.js';
import { ContainerError } from './errors.js';
import { SRI_SHA256_PATTERN, sriSha256 } from './hash.js';
import { MANIFEST_PATH, MIMETYPE_PATH, type AccessibilityMetadata } from './ocf.js';
import type { Profile } from './xhtml.js';

export const MANIFEST_CONTEXT = ['https://www.w3.org/ns/pub-context', 'https://html-pro.example/ns/v0'] as const;
export const PROFILE_BASE = 'https://html-pro.example/spec/0.1/profile/';

export interface ManifestLink {
  readonly url: string;
  readonly type: string;
}

export interface ManifestResource extends ManifestLink {
  readonly integrity: string;
}

export interface HproManifest {
  readonly '@context': readonly string[];
  readonly conformsTo: string;
  readonly id: string;
  readonly name: string;
  readonly inLanguage: string;
  readonly dateModified: string;
  readonly author?: ReadonlyArray<{ readonly name: string }>;
  readonly readingOrder: readonly ManifestLink[];
  readonly resources: readonly ManifestResource[];
  readonly accessibility?: ManifestAccessibility;
}

/**
 * Accessibility metadata as written to manifest.json: `accessModeSufficient` is a list of
 * sufficient sets (schema.org ItemList, part 1 HPR-META-008), not the comma-separated strings of
 * package.opf.
 */
export interface ManifestAccessibility extends Omit<AccessibilityMetadata, 'accessModeSufficient'> {
  readonly accessModeSufficient: ReadonlyArray<readonly string[]>;
}

/** Converts the OPF form (`"textual,visual"`) to the manifest form (`["textual", "visual"]`). */
export function manifestAccessibility(a: AccessibilityMetadata): ManifestAccessibility {
  return { ...a, accessModeSufficient: a.accessModeSufficient.map((s) => s.split(',').map((m) => m.trim()).filter(Boolean)) };
}

/** True for paths whose hash must appear in the manifest. */
export function isManifestCovered(path: string): boolean {
  return path !== MIMETYPE_PATH && path !== MANIFEST_PATH && !path.startsWith('META-INF/') && !path.endsWith('/');
}

export interface ManifestInput {
  readonly id: string;
  readonly title: string;
  readonly language: string;
  readonly modified: string;
  readonly profile: Profile;
  readonly creators: readonly string[];
  readonly readingOrder: readonly string[];
  readonly accessibility?: AccessibilityMetadata;
  /** Every covered file with its media type and bytes. */
  readonly files: ReadonlyMap<string, { readonly mediaType: string; readonly data: Uint8Array }>;
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export async function buildManifest(input: ManifestInput): Promise<HproManifest> {
  const paths = [...input.files.keys()].sort(compareCodeUnits);
  const resources: ManifestResource[] = [];
  for (const path of paths) {
    const file = input.files.get(path)!;
    resources.push({ url: path, type: file.mediaType, integrity: await sriSha256(file.data) });
  }
  const manifest: HproManifest = {
    '@context': [...MANIFEST_CONTEXT],
    conformsTo: PROFILE_BASE + input.profile,
    id: input.id,
    name: input.title,
    inLanguage: input.language,
    dateModified: input.modified,
    ...(input.creators.length > 0 ? { author: input.creators.map((name) => ({ name })) } : {}),
    readingOrder: input.readingOrder.map((url) => ({ url, type: input.files.get(url)!.mediaType })),
    resources,
    ...(input.accessibility ? { accessibility: manifestAccessibility(input.accessibility) } : {}),
  };
  return manifest;
}

/** Stable serialisation: fixed key order from construction, two-space indent, final newline. */
export function serializeManifest(manifest: HproManifest): string {
  return JSON.stringify(manifest, null, 2) + '\n';
}

function fail(message: string): never {
  throw new ContainerError('manifest', message, MANIFEST_PATH);
}

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/** Parses and shape-checks manifest.json. Unknown extra keys are tolerated. */
export function parseManifest(bytes: Uint8Array): HproManifest {
  let value: unknown;
  try {
    value = JSON.parse(fromUtf8(bytes));
  } catch (err) {
    fail(`not valid UTF-8 JSON: ${(err as Error).message}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('root must be a JSON object');
  const m = value as Record<string, unknown>;
  for (const key of ['conformsTo', 'id', 'name', 'inLanguage', 'dateModified'] as const) {
    if (!isString(m[key])) fail(`"${key}" must be a non-empty string`);
  }
  if (!Array.isArray(m['@context']) || !m['@context'].every(isString)) fail('"@context" must be an array of strings');
  if (!Array.isArray(m.resources)) fail('"resources" must be an array');
  if (!Array.isArray(m.readingOrder)) fail('"readingOrder" must be an array');
  const seen = new Set<string>();
  for (const r of m.resources as unknown[]) {
    const res = r as Record<string, unknown>;
    if (typeof r !== 'object' || r === null || !isString(res.url) || !isString(res.type) || !isString(res.integrity)) {
      fail('every resource needs "url", "type" and "integrity"');
    }
    if (!SRI_SHA256_PATTERN.test(res.integrity)) fail(`unsupported integrity value for ${res.url}: only sha256-<base64> is accepted`);
    if (!isManifestCovered(res.url)) fail(`resource ${res.url} lies outside the manifest coverage rule`);
    if (seen.has(res.url)) fail(`resource ${res.url} listed twice`);
    seen.add(res.url);
  }
  for (const r of m.readingOrder as unknown[]) {
    const link = r as Record<string, unknown>;
    if (typeof r !== 'object' || r === null || !isString(link.url) || !isString(link.type)) fail('every readingOrder item needs "url" and "type"');
  }
  return value as HproManifest;
}

export type ResourceStatus = 'ok' | 'hash-mismatch' | 'missing';

export interface ResourceCheck {
  readonly path: string;
  readonly status: ResourceStatus;
  readonly expected: string;
  /** Integrity value of the actual bytes; absent when the entry is missing. */
  readonly actual?: string;
}

export interface IntegrityReport {
  /** True when every listed resource exists with the listed hash and the reading order is covered. */
  readonly ok: boolean;
  readonly resources: readonly ResourceCheck[];
  /** Entries that the coverage rule includes but the manifest does not list (not integrity-protected). */
  readonly unlisted: readonly string[];
  /** Further manifest consistency problems, e.g. reading order items without a hash. */
  readonly problems: readonly string[];
}

export async function verifyIntegrity(manifest: HproManifest, files: ReadonlyMap<string, Uint8Array>): Promise<IntegrityReport> {
  const resources: ResourceCheck[] = [];
  const listed = new Set<string>();
  for (const r of manifest.resources) {
    listed.add(r.url);
    const data = files.get(r.url);
    if (data === undefined) {
      resources.push({ path: r.url, status: 'missing', expected: r.integrity });
      continue;
    }
    const actual = await sriSha256(data);
    resources.push({ path: r.url, status: actual === r.integrity ? 'ok' : 'hash-mismatch', expected: r.integrity, actual });
  }
  const unlisted = [...files.keys()].filter((p) => isManifestCovered(p) && !listed.has(p)).sort(compareCodeUnits);
  const problems = manifest.readingOrder.filter((l) => !listed.has(l.url)).map((l) => `readingOrder item ${l.url} has no integrity entry`);
  const ok = resources.every((r) => r.status === 'ok') && problems.length === 0;
  return { ok, resources, unlisted, problems };
}
