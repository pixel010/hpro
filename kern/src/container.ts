/**
 * Creating and reading hpro containers.
 *
 * Layout (docs/05, section 6.1 and docs/03, Nachtrag N.2):
 *   mimetype                 first entry, stored, no extra field, "application/epub+zip"
 *   META-INF/container.xml   OCF, points to package.opf
 *   package.opf              generated EPUB 3 package for EPUB reading systems
 *   manifest.json            hpro manifest with SHA-256 per resource (authoritative)
 *   content/…, data/…        resources in code-unit order of their paths
 */
import { equalBytes, fromUtf8, toBytes, utf8 } from './bytes.js';
import { ContainerError } from './errors.js';
import { buildManifest, parseManifest, serializeManifest, verifyIntegrity, type HproManifest, type IntegrityReport } from './manifest.js';
import {
  CONTAINER_XML_PATH,
  DEFAULT_NAV_PATH,
  EPUB_MIMETYPE,
  MANIFEST_PATH,
  MIMETYPE_PATH,
  PACKAGE_PATH,
  XHTML_MEDIA_TYPE,
  assertOcfPath,
  containerXml,
  navXhtml,
  packageOpf,
  parseContainerXml,
  splitHref,
  type AccessibilityMetadata,
  type OpfItem,
  type TocEntry,
} from './ocf.js';
import { checkTargets, LockError, parseAccess } from './lock/access.js';
import { analyzeMarkup, type Profile } from './xhtml.js';
import { readZip, writeZip, type ZipEntry, type ZipEntryInput, type ZipReadOptions } from './zip.js';

export interface ResourceInput {
  /** Container path, e.g. `content/index.xhtml`. */
  readonly path: string;
  readonly mediaType: string;
  /** Strings are encoded as UTF-8. */
  readonly data: Uint8Array | string;
}

export interface DocumentInput {
  /** Unique identifier, e.g. `urn:uuid:…`. */
  readonly id: string;
  readonly title: string;
  /** BCP 47 language tag, e.g. `de-AT`. */
  readonly language: string;
  /** Last modification, `YYYY-MM-DDThh:mm:ssZ`. Also used as ZIP timestamp of all entries. */
  readonly modified: string;
  /** Default `static`. */
  readonly profile?: Profile;
  readonly creators?: readonly string[];
  readonly description?: string;
  /** Container paths of XHTML content documents in reading order. */
  readonly readingOrder: readonly string[];
  /** Table of contents; the navigation document is generated from it. */
  readonly toc: {
    readonly title: string;
    readonly entries: readonly TocEntry[];
    /** Default `content/nav.xhtml`. */
    readonly path?: string;
  };
  readonly resources: readonly ResourceInput[];
  readonly accessibility?: AccessibilityMetadata;
  /**
   * Components of live content (profile `interactive`, HP-SBX-001): the script lies at `url`
   * under `components/<name>@<version>/` and is one of `resources`; its hash is filled in.
   */
  readonly components?: ReadonlyArray<{ readonly name: string; readonly version: string; readonly url: string }>;
  /** Data files under `data/` with optional JSON schema (HP-SBX-008); both are `resources`. */
  readonly data?: ReadonlyArray<{ readonly url: string; readonly schema?: string }>;
  /**
   * Locks (HP-LOCK-001): `target` is `path#id` or a path, `rules` from read-only, no-print,
   * no-export, hidden or `x-<kennung>-…`. Targets must resolve. `sealed` is not accepted here:
   * a section is sealed afterwards with `lock.sealSection`, which encrypts it.
   */
  readonly access?: ReadonlyArray<{ readonly target: string; readonly rules: readonly string[] }>;
}

export interface ReadContainer {
  /** ZIP entries in central directory order, with structural details. */
  readonly entries: readonly ZipEntry[];
  /** Entry content by path. */
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly mimetype: string;
  /** Rootfile from META-INF/container.xml. */
  readonly packagePath: string;
  readonly manifest: HproManifest;
  /** Result of checking every hash in manifest.json against the entries. */
  readonly integrity: IntegrityReport;
}

export interface CreatedContainer {
  readonly bytes: Uint8Array;
  readonly manifest: HproManifest;
  /** The container as read back after writing; `integrity.ok` is guaranteed to be true. */
  readonly readBack: ReadContainer;
}

const RESERVED = new Set([MIMETYPE_PATH, PACKAGE_PATH, MANIFEST_PATH]);
const MODIFIED_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const LANGUAGE_PATTERN = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/;
const MEDIA_TYPE_PATTERN = /^[a-z]+\/[a-z0-9][a-z0-9.+-]*$/;

function invalid(message: string, path?: string): never {
  throw new ContainerError('input', message, path);
}

function validateMetadata(input: DocumentInput): Date {
  if (input.id.trim() === '') invalid('id must not be empty');
  if (input.title.trim() === '') invalid('title must not be empty');
  if (!LANGUAGE_PATTERN.test(input.language)) invalid(`language "${input.language}" is not a BCP 47 tag`);
  const date = new Date(input.modified);
  if (!MODIFIED_PATTERN.test(input.modified) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 19) + 'Z' !== input.modified) {
    invalid(`modified "${input.modified}" must be a valid UTC timestamp YYYY-MM-DDThh:mm:ssZ`);
  }
  return date;
}

function collectFiles(input: DocumentInput, navPath: string, navBytes: Uint8Array): Map<string, { mediaType: string; data: Uint8Array }> {
  const files = new Map<string, { mediaType: string; data: Uint8Array }>();
  const folded = new Map<string, string>();
  const add = (path: string, mediaType: string, data: Uint8Array) => {
    assertOcfPath(path);
    if (RESERVED.has(path) || path.startsWith('META-INF/')) invalid('path is reserved for container files', path);
    if (!MEDIA_TYPE_PATTERN.test(mediaType)) invalid(`media type "${mediaType}" is not valid`, path);
    // EPUB 3.3, 4.2.2: names must be unique after case folding and NFC normalisation.
    const key = path.normalize('NFC').toLowerCase();
    const other = folded.get(key);
    if (other !== undefined) invalid(`path collides with "${other}" (case-insensitive)`, path);
    folded.set(key, path);
    files.set(path, { mediaType, data });
  };
  for (const r of input.resources) add(r.path, r.mediaType, toBytes(r.data));
  add(navPath, XHTML_MEDIA_TYPE, navBytes);
  return files;
}

const COMPONENT_NAME = /^(hp|x-[a-z0-9]+)-[a-z0-9-]+$/;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const DATA_PATH = /^data\/[A-Za-z0-9_][A-Za-z0-9_.-]*\.json$/;

/** HP-SBX-001 and HP-SBX-008 for what a producer declares; HP-PROF-002 for the profile. */
function checkLive(input: DocumentInput, files: ReadonlyMap<string, { mediaType: string }>, profile: Profile): void {
  const components = input.components ?? [];
  if (components.length > 0 && profile !== 'interactive') invalid(`components require profile "interactive", not "${profile}"`);
  if (profile !== 'interactive' && [...files.keys()].some((p) => p.startsWith('components/'))) invalid('files under components/ require profile "interactive"');
  const names = new Set<string>();
  for (const c of components) {
    if (!COMPONENT_NAME.test(c.name)) invalid(`component name "${c.name}" must match hp-… or x-<id>-…`);
    if (!SEMVER.test(c.version)) invalid(`component ${c.name}: version "${c.version}" is not SemVer`);
    if (!c.url.startsWith(`components/${c.name}@${c.version}/`)) invalid(`component ${c.name}: url must lie under components/${c.name}@${c.version}/`, c.url);
    if (!files.has(c.url)) invalid(`component ${c.name}: file does not exist`, c.url);
    if (names.has(c.name)) invalid(`component ${c.name} declared twice`);
    names.add(c.name);
  }
  for (const d of input.data ?? []) {
    if (!DATA_PATH.test(d.url)) invalid('data file must be data/<name>.json', d.url);
    if (files.get(d.url)?.mediaType !== 'application/json') invalid('data file must exist with media type application/json', d.url);
    if (d.schema !== undefined && files.get(d.schema)?.mediaType !== 'application/json') invalid('schema must exist with media type application/json', d.schema);
  }
}

/**
 * Builds a container from the input, writes it, then reads it back and checks the hash
 * manifest and every entry against the input. Throws `ContainerError` on invalid input or
 * if the read-back check fails, so callers never receive a container that does not verify.
 */
export async function createContainer(input: DocumentInput): Promise<CreatedContainer> {
  const modified = validateMetadata(input);
  const profile: Profile = input.profile ?? 'static';
  const navPath = input.toc.path ?? DEFAULT_NAV_PATH;
  if (input.toc.entries.length === 0) invalid('table of contents must have at least one entry');
  const nav = utf8(navXhtml({ navPath, language: input.language, title: input.toc.title, entries: input.toc.entries }));
  const files = collectFiles(input, navPath, nav);

  if (input.readingOrder.length === 0) invalid('readingOrder must not be empty');
  if (new Set(input.readingOrder).size !== input.readingOrder.length) invalid('readingOrder lists a document twice');
  for (const path of input.readingOrder) {
    const file = files.get(path);
    if (!file) invalid('readingOrder item does not exist', path);
    if (file.mediaType !== XHTML_MEDIA_TYPE) invalid('readingOrder items must be XHTML content documents', path);
  }
  const checkToc = (entries: readonly TocEntry[]) => {
    for (const e of entries) {
      const target = splitHref(e.href).path;
      if (files.get(target)?.mediaType !== XHTML_MEDIA_TYPE) invalid(`table of contents points to "${e.href}", which is not an XHTML document in the container`);
      if (e.children) checkToc(e.children);
    }
  };
  checkToc(input.toc.entries);
  checkLive(input, files, profile);
  if (input.access) {
    let entries;
    try {
      entries = parseAccess({ access: input.access });
    } catch (err) {
      invalid((err as LockError).message);
    }
    if (entries.some((e) => e.rules.includes('sealed'))) invalid('rule "sealed" is set by lock.sealSection, which encrypts the section');
    const problems = checkTargets(entries, new Map([...files].map(([p, f]) => [p, f.data])));
    if (problems.length > 0) invalid(`access: ${problems.join('; ')}`);
  }

  const exists = (p: string) => files.has(p);
  const items: OpfItem[] = [];
  for (const [path, file] of files) {
    let properties: string[] = [];
    if (file.mediaType === XHTML_MEDIA_TYPE || file.mediaType === 'image/svg+xml') {
      let text: string;
      try {
        text = fromUtf8(file.data);
      } catch {
        invalid('markup must be UTF-8', path);
      }
      const kind = file.mediaType === XHTML_MEDIA_TYPE ? 'xhtml' : 'svg';
      const analysis = analyzeMarkup(path, text, kind, profile, exists);
      if (kind === 'xhtml') properties = [...analysis.properties];
    }
    if (path === navPath) properties.push('nav');
    items.push({ path, mediaType: file.mediaType, properties: properties.sort() });
  }
  items.push({ path: MANIFEST_PATH, mediaType: 'application/json', properties: [] });
  items.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const opf = utf8(
    packageOpf({
      id: input.id,
      title: input.title,
      language: input.language,
      modified: input.modified,
      creators: input.creators ?? [],
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.accessibility ? { accessibility: input.accessibility } : {}),
      items,
      spine: input.readingOrder,
    }),
  );
  const covered = new Map(files);
  covered.set(PACKAGE_PATH, { mediaType: 'application/oebps-package+xml', data: opf });
  const manifest = await buildManifest({
    id: input.id,
    title: input.title,
    language: input.language,
    modified: input.modified,
    profile,
    creators: input.creators ?? [],
    readingOrder: input.readingOrder,
    ...(input.accessibility ? { accessibility: input.accessibility } : {}),
    ...(input.components ? { components: input.components } : {}),
    ...(input.data ? { data: input.data } : {}),
    ...(input.access ? { access: input.access } : {}),
    files: covered,
  });
  const manifestBytes = utf8(serializeManifest(manifest));

  const entries: ZipEntryInput[] = [
    { name: MIMETYPE_PATH, data: utf8(EPUB_MIMETYPE), compression: 'store' },
    { name: CONTAINER_XML_PATH, data: utf8(containerXml(PACKAGE_PATH)), compression: 'auto' },
    { name: PACKAGE_PATH, data: opf, compression: 'auto' },
    { name: MANIFEST_PATH, data: manifestBytes, compression: 'auto' },
    ...[...files.keys()].sort().map((path): ZipEntryInput => ({ name: path, data: files.get(path)!.data, compression: 'auto' })),
  ];
  const bytes = await writeZip(entries, { modified });

  // Read back exactly like a foreign container and compare with what was meant to be written.
  const readBack = await readContainer(bytes);
  const failures: string[] = [];
  if (!readBack.integrity.ok) failures.push('hash manifest does not verify');
  if (readBack.integrity.unlisted.length > 0) failures.push(`unlisted entries: ${readBack.integrity.unlisted.join(', ')}`);
  if (readBack.entries.length !== entries.length) failures.push('entry count differs');
  entries.forEach((e, i) => {
    const got = readBack.entries[i];
    if (!got || got.name !== e.name || !equalBytes(got.data, e.data)) failures.push(`entry ${i} (${e.name}) differs after read-back`);
  });
  if (failures.length > 0) throw new ContainerError('write-verification', `container failed read-back check: ${failures.join('; ')}`);
  return { bytes, manifest, readBack };
}

export type ReadOptions = ZipReadOptions;

/**
 * Reads a container, enforces the OCF structure (mimetype, container.xml, manifest.json)
 * and checks the hash manifest. Structural violations throw `ContainerError`; hash
 * mismatches do not throw but are reported in `integrity`, so that a reader can still show
 * a manipulated document together with a clear warning.
 */
export async function readContainer(bytes: Uint8Array, options: ReadOptions = {}): Promise<ReadContainer> {
  const entries = await readZip(bytes, options);
  const first = entries[0];
  if (!first || first.name !== MIMETYPE_PATH) throw new ContainerError('mimetype', 'first entry must be "mimetype"');
  if (first.localHeaderOffset !== 0) throw new ContainerError('mimetype', '"mimetype" must start at offset 0');
  if (first.method !== 'stored') throw new ContainerError('mimetype', '"mimetype" must be stored without compression');
  if (first.localExtraLength !== 0) throw new ContainerError('mimetype', '"mimetype" must not have an extra field in its local header');
  let mimetype: string;
  try {
    mimetype = fromUtf8(first.data);
  } catch {
    throw new ContainerError('mimetype', '"mimetype" is not valid text');
  }
  if (mimetype !== EPUB_MIMETYPE) throw new ContainerError('mimetype', `"mimetype" must contain exactly "${EPUB_MIMETYPE}", found "${mimetype}"`);

  const files = new Map<string, Uint8Array>();
  for (const e of entries) if (!e.name.endsWith('/')) files.set(e.name, e.data);

  const containerXmlBytes = files.get(CONTAINER_XML_PATH);
  if (!containerXmlBytes) throw new ContainerError('container-xml', 'missing', CONTAINER_XML_PATH);
  let containerText: string;
  try {
    containerText = fromUtf8(containerXmlBytes);
  } catch {
    throw new ContainerError('container-xml', 'not valid UTF-8', CONTAINER_XML_PATH);
  }
  const packagePath = parseContainerXml(containerText);
  if (!files.has(packagePath)) throw new ContainerError('container-xml', `rootfile "${packagePath}" does not exist`, CONTAINER_XML_PATH);

  const manifestBytes = files.get(MANIFEST_PATH);
  if (!manifestBytes) throw new ContainerError('manifest', 'missing', MANIFEST_PATH);
  const manifest = parseManifest(manifestBytes);
  const integrity = await verifyIntegrity(manifest, files);
  return { entries, files, mimetype, packagePath, manifest, integrity };
}
