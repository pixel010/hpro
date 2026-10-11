/**
 * Rules on `manifest.json` and the manifests of frozen renditions (part 1: CONT-015…019,
 * CONT-022, META-001…011, PROF-001/002/006/009/014/015, SBX-001…003/018, LOCK-001/002,
 * NEST-003, VERS-001/002/004/006, MIN-001).
 */
import { sriSha256 } from '../hash.js';
import {
  CHECKER_VERSION,
  CORE_MEDIA_TYPES,
  DATE_RE,
  ID_RE,
  LANG_RE,
  MEDIA_TYPE_RE,
  PROFILE_RE,
  RFC3339_UTC_RE,
  SRI_RE,
  UUID_URN_RE,
  X_PREFIX_RE,
  finding,
  isAbsoluteUri,
  isNonEmptyString,
  isObject,
  isValidUtc,
  loc,
  pointer,
  typeOf,
  type Ctx,
  type Fassung,
  type Json,
  type JsonObject,
} from './context.js';
import { schemaProblems, validateInstance } from './jsonschema.js';
import { decodeUtf8, elements, localName, NS, parseXml } from './markup.js';
import type { Profile } from './report.js';
import { pathRuleViolations } from './zipscan.js';

/** Manifest keys defined by part 0 (and part 3) plus the Publication Manifest keys HPR-META-011 accepts. */
export const DEFINED_MANIFEST_KEYS: ReadonlySet<string> = new Set([
  '@context', 'conformsTo', 'id', 'name', 'inLanguage', 'dateModified', 'readingOrder', 'resources', 'components', 'renditions',
  'access', 'attachments', 'data', 'extensions', 'history', 'source', 'derivedFrom', 'accessibility', 'subset', 'computedAt', 'calculator',
  'author', 'publisher', 'datePublished', 'abridged', 'url', 'type',
  'accessMode', 'accessModeSufficient', 'accessibilityFeature', 'accessibilityHazard', 'accessibilitySummary',
]);
export const DEFINED_NESTED_KEYS: Readonly<Record<string, readonly string[]>> = {
  readingOrder: ['url', 'type'],
  resources: ['url', 'type', 'integrity'],
  components: ['name', 'version', 'url', 'integrity'],
  renditions: ['id', 'role', 'url', 'createdAt'],
  access: ['target', 'rules'],
  attachments: ['url', 'type', 'name'],
  data: ['url', 'schema'],
  extensions: ['id', 'required', 'url', 'dir'],
  history: ['version', 'dateModified', 'note', 'manifestIntegrity'],
  source: ['url', 'type', 'tool', 'date'],
  derivedFrom: ['integrity', 'method'],
  accessibility: ['conformsTo', 'accessMode', 'accessModeSufficient', 'accessibilityFeature', 'accessibilityHazard', 'accessibilitySummary'],
  calculator: ['name', 'version', 'spec'],
};
export const LOCK_RULES: ReadonlySet<string> = new Set(['read-only', 'no-print', 'no-export', 'hidden']);
const SUBSET_OFFICE_MIN = 'https://html-pro.example/spec/0.1/subset/office-min';
const COMPONENT_NAME_RE = /^(hp|x-[a-z0-9]+)-[a-z0-9-]+$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

const list = (v: Json | undefined): Json[] => (Array.isArray(v) ? v : []);
const describe = (v: unknown): string => (v === undefined ? 'fehlt' : `hat Typ ${v === null ? 'null' : Array.isArray(v) ? 'Liste' : typeof v}`);

/** Profile of a version from `conformsTo` (HPR-PROF-001, HPR-VERS-001); invalid → static. */
export function checkProfile(ctx: Ctx, f: Fassung): Profile {
  ctx.report.ran('HPR-PROF-001', 'HPR-VERS-001');
  const value = f.manifest.conformsTo;
  const m = typeof value === 'string' ? PROFILE_RE.exec(value) : null;
  const where = loc.manifest(f.manifestPath, '/conformsTo');
  if (!m || Number(m[1]) !== CHECKER_VERSION.major) {
    finding(ctx, 'HPR-PROF-001', { feld: '/conformsTo', wert: typeof value === 'string' ? value : JSON.stringify(value ?? null) }, where, f);
    return 'static';
  }
  if (Number(m[2]) > CHECKER_VERSION.minor) {
    finding(ctx, 'HPR-VERS-001', { feld: '/conformsTo', version: `${m[1]}.${m[2]}`, erwartet: `${CHECKER_VERSION.major}.${CHECKER_VERSION.minor}` }, where, f);
  }
  return m[3] as Profile;
}

/** HPR-META-001…005, -007, -008, -011. */
export function checkMetadata(ctx: Ctx, f: Fassung): void {
  const r = ctx.report;
  r.ran('HPR-META-001', 'HPR-META-002', 'HPR-META-003', 'HPR-META-004', 'HPR-META-005', 'HPR-META-007', 'HPR-META-008', 'HPR-META-011');
  const m = f.manifest;
  const at = (ptr: string) => loc.manifest(f.manifestPath, ptr);
  const meta1 = (feld: string, grund: string) => finding(ctx, 'HPR-META-001', { feld, grund }, at(feld), f);

  const context = m['@context'];
  if (!Array.isArray(context)) meta1('/@context', `${describe(context)} (erwartet Liste)`);
  else {
    if (!context.includes('https://www.w3.org/ns/pub-context')) meta1('/@context', 'enthält nicht https://www.w3.org/ns/pub-context');
    if (!context.some((c) => typeof c === 'string' && c.startsWith('https://html-pro.example/ns/'))) meta1('/@context', 'enthält keinen html-Pro-Namensraum https://html-pro.example/ns/…');
  }
  if (typeof m.conformsTo !== 'string') meta1('/conformsTo', `${describe(m.conformsTo)} (erwartet String)`);
  if (typeof m.id !== 'string') meta1('/id', `${describe(m.id)} (erwartet String)`);
  else if (!isAbsoluteUri(m.id)) meta1('/id', `„${m.id}“ ist keine absolute URI`);
  if (!isNonEmptyString(m.name)) meta1('/name', `${typeof m.name === 'string' ? 'ist leer' : describe(m.name)} (erwartet nicht leeren String)`);
  if (typeof m.inLanguage !== 'string') meta1('/inLanguage', `${describe(m.inLanguage)} (erwartet String)`);
  if (typeof m.dateModified !== 'string') meta1('/dateModified', `${describe(m.dateModified)} (erwartet String)`);
  if (!Array.isArray(m.readingOrder)) meta1('/readingOrder', `${describe(m.readingOrder)} (erwartet Liste)`);
  if (!Array.isArray(m.resources)) meta1('/resources', `${describe(m.resources)} (erwartet Liste)`);

  if (typeof m.dateModified === 'string' && !isValidUtc(m.dateModified, DATE_RE)) finding(ctx, 'HPR-META-002', { feld: '/dateModified', wert: m.dateModified }, at('/dateModified'), f);
  if (typeof m.inLanguage === 'string' && !LANG_RE.test(m.inLanguage)) finding(ctx, 'HPR-META-003', { feld: '/inLanguage', wert: m.inLanguage }, at('/inLanguage'), f);
  if (Array.isArray(m.readingOrder)) {
    if (m.readingOrder.length === 0) finding(ctx, 'HPR-META-004', { feld: '/readingOrder', grund: 'Liste ist leer' }, at('/readingOrder'), f);
    m.readingOrder.forEach((item, i) => {
      const feld = pointer('readingOrder', i);
      if (!isObject(item) || typeof item.url !== 'string') return finding(ctx, 'HPR-META-004', { feld, grund: 'Eintrag ohne url' }, at(feld), f);
      if (!ctx.files.has(item.url)) finding(ctx, 'HPR-META-004', { feld, grund: `Datei ${item.url} fehlt` }, at(feld), f);
      if (item.type !== 'application/xhtml+xml') finding(ctx, 'HPR-META-004', { feld, grund: `type ${JSON.stringify(item.type ?? null)}` }, at(feld), f);
    });
  }
  if (typeof m.id === 'string' && !UUID_URN_RE.test(m.id)) finding(ctx, 'HPR-META-005', { feld: '/id', wert: m.id }, at('/id'), f);

  const a11y = m.accessibility;
  if (a11y === undefined) finding(ctx, 'HPR-META-008', { feld: '/accessibility', grund: 'fehlt' }, at('/accessibility'), f);
  else if (!isObject(a11y)) finding(ctx, 'HPR-META-008', { feld: '/accessibility', grund: 'ist kein Objekt' }, at('/accessibility'), f);
  else {
    const isStringList = (v: Json | undefined) => Array.isArray(v) && v.every((x) => typeof x === 'string');
    for (const key of ['accessMode', 'accessibilityFeature', 'accessibilityHazard']) {
      if (!isStringList(a11y[key])) finding(ctx, 'HPR-META-008', { feld: `/accessibility/${key}`, grund: `${describe(a11y[key])} (erwartet Liste)` }, at(`/accessibility/${key}`), f);
    }
    const ams = a11y.accessModeSufficient;
    if (!Array.isArray(ams) || !ams.every((x) => isStringList(x))) {
      finding(ctx, 'HPR-META-008', { feld: '/accessibility/accessModeSufficient', grund: Array.isArray(ams) ? 'ist keine Liste von Listen' : `${describe(ams)} (erwartet Liste von Listen)` }, at('/accessibility/accessModeSufficient'), f);
    }
    if (typeof a11y.accessibilitySummary !== 'string') finding(ctx, 'HPR-META-008', { feld: '/accessibility/accessibilitySummary', grund: `${describe(a11y.accessibilitySummary)} (erwartet String)` }, at('/accessibility/accessibilitySummary'), f);
    if (a11y.conformsTo !== undefined) {
      const reportPath = `${f.prefix}data/accessibility-report.json`;
      const bytes = ctx.files.get(reportPath);
      let grund: string | undefined;
      if (!bytes) grund = `${reportPath} fehlt`;
      else {
        let v: unknown;
        try {
          v = JSON.parse(decodeUtf8(bytes) ?? '');
        } catch {
          v = undefined;
        }
        if (!isObject(v)) grund = `${reportPath} ist kein JSON-Objekt`;
        else if (!isValidUtc(v.date, RFC3339_UTC_RE) && !(typeof v.date === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2})$/.test(v.date))) grund = `${reportPath}: date fehlt oder ist kein RFC-3339-Zeitpunkt`;
        else if (typeof v.method !== 'string') grund = `${reportPath}: method fehlt`;
        else if (!Array.isArray(v.results) || v.results.length === 0) grund = `${reportPath}: results fehlt oder ist leer`;
      }
      if (grund) finding(ctx, 'HPR-META-007', { feld: '/accessibility/conformsTo', wert: String(a11y.conformsTo), grund }, at('/accessibility/conformsTo'), f);
    }
  }

  // HPR-META-011: unknown keys without x-<kennung>- prefix.
  const checkKeys = (obj: JsonObject, base: string[], defined: ReadonlySet<string> | readonly string[]) => {
    for (const key of Object.keys(obj)) {
      const known = defined instanceof Set ? defined.has(key) : (defined as readonly string[]).includes(key);
      if (known || X_PREFIX_RE.test(key)) continue;
      const feld = pointer(...base, key);
      finding(ctx, 'HPR-META-011', { feld, wert: key }, at(feld), f);
    }
  };
  checkKeys(m, [], DEFINED_MANIFEST_KEYS);
  for (const [name, keys] of Object.entries(DEFINED_NESTED_KEYS)) {
    const v = m[name];
    if (Array.isArray(v)) v.forEach((o, i) => isObject(o) && checkKeys(o, [name, String(i)], keys));
    else if (isObject(v)) checkKeys(v, [name], keys);
  }
}

/** HPR-CONT-015…019 and HPR-CONT-022 (resources of a version). */
export async function checkResources(ctx: Ctx, f: Fassung): Promise<void> {
  const r = ctx.report;
  r.ran('HPR-CONT-015', 'HPR-CONT-016', 'HPR-CONT-017', 'HPR-CONT-018', 'HPR-CONT-019', 'HPR-CONT-022');
  const at = (ptr: string) => loc.manifest(f.manifestPath, ptr);
  const resources = f.manifest.resources;
  const listed = new Map<string, number>();
  if (Array.isArray(resources)) {
    for (const [i, item] of resources.entries()) {
      const feld = pointer('resources', i);
      if (!isObject(item)) {
        finding(ctx, 'HPR-CONT-015', { feld, grund: 'Eintrag ist kein Objekt' }, at(feld), f);
        continue;
      }
      const problems: string[] = [];
      if (typeof item.url !== 'string') problems.push('url fehlt');
      else if (pathRuleViolations(item.url).length > 0 || item.url === '') problems.push(`url „${item.url}“ ist kein gültiger Containerpfad`);
      if (typeof item.type !== 'string' || !MEDIA_TYPE_RE.test(item.type)) problems.push(`type ${JSON.stringify(item.type ?? null)} ist kein Media-Type`);
      if (typeof item.integrity !== 'string' || !SRI_RE.test(item.integrity)) problems.push(`integrity ${JSON.stringify(item.integrity ?? null)} hat nicht die Form sha256-<Base64>`);
      for (const p of problems) finding(ctx, 'HPR-CONT-015', { feld, grund: p }, at(feld), f);
      if (typeof item.url !== 'string') continue;
      const url = item.url;
      if (listed.has(url)) finding(ctx, 'HPR-CONT-019', { feld, pfad: url }, at(feld), f);
      else listed.set(url, i);
      const data = ctx.files.get(url);
      if (data === undefined) {
        if (!ctx.entryByName.has(url)) finding(ctx, 'HPR-CONT-018', { feld, pfad: url }, at(feld), f);
        continue;
      }
      if (typeof item.integrity === 'string' && SRI_RE.test(item.integrity)) {
        const actual = await sriSha256(data);
        if (actual !== item.integrity) finding(ctx, 'HPR-CONT-016', { pfad: url, erwartet: item.integrity, wert: actual }, loc.entry(url), f);
      }
      if (typeof item.type === 'string') {
        const grund = contentMismatch(item.type, data);
        if (grund) finding(ctx, 'HPR-CONT-022', { pfad: url, typ: item.type, grund }, loc.entry(url), f);
      }
    }
  }
  for (const p of f.paths) if (!listed.has(p) && ctx.entryByName.get(p)?.isDirectory === false) finding(ctx, 'HPR-CONT-017', { pfad: p }, loc.entry(p), f);
}

const startsWith = (d: Uint8Array, sig: number[], at = 0) => sig.every((b, i) => d[at + i] === b);

/** HPR-CONT-022: content sniffing for the core media types; returns the reason or undefined. */
export function contentMismatch(type: string, data: Uint8Array): string | undefined {
  switch (type) {
    case 'image/png':
      return startsWith(data, [0x89, 0x50, 0x4e, 0x47]) ? undefined : 'keine PNG-Signatur 89 50 4E 47';
    case 'image/jpeg':
      return startsWith(data, [0xff, 0xd8, 0xff]) ? undefined : 'keine JPEG-Signatur FF D8 FF';
    case 'image/gif':
      return startsWith(data, [0x47, 0x49, 0x46, 0x38]) ? undefined : 'keine GIF-Signatur GIF8';
    case 'image/webp':
      return startsWith(data, [0x52, 0x49, 0x46, 0x46]) && startsWith(data, [0x57, 0x45, 0x42, 0x50], 8) ? undefined : 'keine WebP-Signatur RIFF…WEBP';
    case 'font/woff2':
      return startsWith(data, [0x77, 0x4f, 0x46, 0x32]) ? undefined : 'keine WOFF2-Signatur wOF2';
    case 'application/xhtml+xml':
    case 'image/svg+xml':
    case 'application/oebps-package+xml': {
      const text = decodeUtf8(data);
      if (text === undefined) return 'kein gültiges UTF-8';
      const parsed = parseXml(text);
      if (!parsed.doc) return `nicht wohlgeformt: ${parsed.error?.message}`;
      const root = parsed.doc.documentElement!;
      const [name, ns] = type === 'application/xhtml+xml' ? ['html', NS.xhtml] : type === 'image/svg+xml' ? ['svg', NS.svg] : ['package', NS.opf];
      return localName(root) === name && root.namespaceURI === ns ? undefined : `Wurzel {${root.namespaceURI ?? ''}}${localName(root)} statt {${ns}}${name}`;
    }
    case 'application/json': {
      const text = decodeUtf8(data);
      if (text === undefined) return 'kein gültiges UTF-8';
      try {
        JSON.parse(text);
        return undefined;
      } catch (err) {
        return `kein JSON: ${(err as Error).message}`;
      }
    }
    case 'text/css':
      return decodeUtf8(data) === undefined ? 'kein gültiges UTF-8' : undefined;
    default:
      return undefined;
  }
}

/** HPR-PROF-002 and HPR-PROF-006. */
export function checkProfileContents(ctx: Ctx, f: Fassung): void {
  ctx.report.ran('HPR-PROF-002', 'HPR-PROF-006');
  if (f.profile !== 'interactive') {
    for (const p of f.paths) if (p.startsWith(`${f.prefix}components/`)) finding(ctx, 'HPR-PROF-002', { pfad: p, profil: f.profile }, loc.entry(p), f);
    if (Array.isArray(f.manifest.components) && f.manifest.components.length > 0) finding(ctx, 'HPR-PROF-002', { pfad: `${f.manifestPath}#/components`, profil: f.profile }, loc.manifest(f.manifestPath, '/components'), f);
  }
  if (f.profile === 'archive') {
    const attachments = new Set(list(f.manifest.attachments).map((a) => (isObject(a) ? a.url : undefined)));
    list(f.manifest.resources).forEach((item, i) => {
      if (!isObject(item) || typeof item.type !== 'string' || typeof item.url !== 'string') return;
      if (attachments.has(item.url) || item.url.startsWith(`${f.prefix}attachments/`)) return;
      // package.opf is a container file of the EPUB fallback, not content (HP-CONT-004).
      if (item.url === 'package.opf' && item.type === 'application/oebps-package+xml') return;
      if (!CORE_MEDIA_TYPES.has(item.type)) finding(ctx, 'HPR-PROF-006', { feld: pointer('resources', i), typ: item.type, pfad: item.url }, loc.manifest(f.manifestPath, pointer('resources', i)), f);
    });
  }
}

/** HPR-SBX-001…003 (components of a version). */
export async function checkComponents(ctx: Ctx, f: Fassung): Promise<void> {
  ctx.report.ran('HPR-SBX-001', 'HPR-SBX-002', 'HPR-SBX-003');
  const comps = f.manifest.components;
  if (comps === undefined) return;
  const at = (ptr: string) => loc.manifest(f.manifestPath, ptr);
  if (!Array.isArray(comps)) {
    finding(ctx, 'HPR-SBX-001', { feld: '/components', grund: 'ist keine Liste' }, at('/components'), f);
    return;
  }
  const names = new Set<string>();
  for (const [i, c] of comps.entries()) {
    const feld = pointer('components', i);
    if (!isObject(c)) {
      finding(ctx, 'HPR-SBX-001', { feld, grund: 'Eintrag ist kein Objekt' }, at(feld), f);
      continue;
    }
    const problems: string[] = [];
    if (typeof c.name !== 'string' || !COMPONENT_NAME_RE.test(c.name)) problems.push(`name ${JSON.stringify(c.name ?? null)} entspricht nicht ^(hp|x-[a-z0-9]+)-[a-z0-9-]+$`);
    else if (names.has(c.name)) problems.push(`name ${c.name} ist mehrfach deklariert`);
    if (typeof c.version !== 'string' || !SEMVER_RE.test(c.version)) problems.push(`version ${JSON.stringify(c.version ?? null)} ist keine SemVer-Version`);
    if (typeof c.url !== 'string') problems.push('url fehlt');
    if (typeof c.integrity !== 'string' || !SRI_RE.test(c.integrity)) problems.push(`integrity ${JSON.stringify(c.integrity ?? null)} hat nicht die Form sha256-<Base64>`);
    for (const p of problems) finding(ctx, 'HPR-SBX-001', { feld, grund: p }, at(feld), f);
    if (typeof c.name === 'string') names.add(c.name);
    if (typeof c.url !== 'string' || typeof c.name !== 'string' || typeof c.version !== 'string') continue;
    const dir = `${f.prefix}components/${c.name}@${c.version}/`;
    const exists = ctx.files.has(c.url);
    if (!c.url.startsWith(dir) || !exists) {
      finding(ctx, 'HPR-SBX-002', { feld, name: c.name, version: c.version, uri: c.url, grund: !c.url.startsWith(dir) ? 'falsches Verzeichnis' : 'Datei fehlt' }, at(feld), f);
    }
    if (exists && typeof c.integrity === 'string' && SRI_RE.test(c.integrity)) {
      const actual = await sriSha256(ctx.files.get(c.url)!);
      if (actual !== c.integrity) finding(ctx, 'HPR-SBX-003', { name: c.name, version: c.version, pfad: c.url, erwartet: c.integrity, wert: actual }, loc.entry(c.url), f);
    }
  }
}

/** HPR-SBX-018 (data files against their schema). */
export function checkData(ctx: Ctx, f: Fassung): void {
  ctx.report.ran('HPR-SBX-018');
  const data = f.manifest.data;
  if (data === undefined) return;
  const at = (ptr: string) => loc.manifest(f.manifestPath, ptr);
  if (!Array.isArray(data)) {
    finding(ctx, 'HPR-SBX-018', { pfad: `${f.manifestPath}#/data`, grund: 'data ist keine Liste' }, at('/data'), f);
    return;
  }
  const readJson = (path: string): { ok: true; value: unknown } | { ok: false; grund: string } => {
    const bytes = ctx.files.get(path);
    if (!bytes) return { ok: false, grund: `${path} fehlt` };
    const text = decodeUtf8(bytes);
    if (text === undefined) return { ok: false, grund: `${path} ist kein UTF-8` };
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (err) {
      return { ok: false, grund: `${path} ist kein JSON (${(err as Error).message})` };
    }
  };
  data.forEach((d, i) => {
    const feld = pointer('data', i);
    if (!isObject(d) || typeof d.url !== 'string') return finding(ctx, 'HPR-SBX-018', { pfad: feld, grund: 'Eintrag ohne url' }, at(feld), f);
    const url = d.url;
    if (!url.startsWith(`${f.prefix}data/`)) finding(ctx, 'HPR-SBX-018', { pfad: url, grund: 'Datei liegt nicht unter data/' }, at(feld), f);
    if (!ctx.files.has(url)) return finding(ctx, 'HPR-SBX-018', { pfad: url, grund: 'Datei fehlt' }, at(feld), f);
    if (typeOf(f, url) !== 'application/json') finding(ctx, 'HPR-SBX-018', { pfad: url, grund: `Media-Type ${typeOf(f, url) ?? 'unbekannt'} statt application/json` }, at(feld), f);
    const inst = readJson(url);
    if (!inst.ok) return finding(ctx, 'HPR-SBX-018', { pfad: url, grund: inst.grund }, loc.entry(url), f);
    if (d.schema === undefined) return;
    if (typeof d.schema !== 'string') return finding(ctx, 'HPR-SBX-018', { pfad: url, grund: 'schema ist kein Pfad' }, at(feld), f);
    const sch = readJson(d.schema);
    if (!sch.ok) return finding(ctx, 'HPR-SBX-018', { pfad: d.schema, grund: sch.grund }, at(feld), f);
    const structural = schemaProblems(sch.value);
    if (structural.length > 0) return finding(ctx, 'HPR-SBX-018', { pfad: d.schema, grund: `kein gültiges JSON Schema 2020-12: ${structural.map((p) => `${p.path}: ${p.message}`).join('; ')}` }, loc.entry(d.schema), f);
    const problems = validateInstance(inst.value, sch.value as boolean | Record<string, unknown>);
    if (problems.length > 0) finding(ctx, 'HPR-SBX-018', { pfad: url, grund: `ungültig gegen ${d.schema}: ${problems.slice(0, 5).map((p) => `${p.path}: ${p.message}`).join('; ')}${problems.length > 5 ? ` (+${problems.length - 5} weitere)` : ''}` }, loc.entry(url), f);
  });
}

/** Resolves an address `pfad#kennung` or a path within a version; returns a reason when it does not resolve. */
export function unresolvedAddress(ctx: Ctx, f: Fassung, target: string): string | undefined {
  const hash = target.indexOf('#');
  const path = hash < 0 ? target : target.slice(0, hash);
  const fragment = hash < 0 ? '' : target.slice(hash + 1);
  if (path.endsWith('/')) return ctx.scan.entries.some((e) => e.name.startsWith(path)) ? undefined : `Verzeichnis ${path} existiert nicht`;
  if (!ctx.files.has(path)) return `Datei ${path} fehlt`;
  if (!fragment) return undefined;
  const doc = f.docs.get(path) ?? f.svgs.get(path);
  if (!doc) return `${path} ist kein lesbares Inhaltsdokument`;
  return elements(doc.doc).some((e) => e.getAttribute('id') === fragment) ? undefined : `Kennung ${fragment} existiert nicht in ${path}`;
}

/** HPR-LOCK-001 and HPR-LOCK-002. */
export function checkAccess(ctx: Ctx, f: Fassung): void {
  ctx.report.ran('HPR-LOCK-001', 'HPR-LOCK-002');
  const at = (ptr: string) => loc.manifest(f.manifestPath, ptr);
  const access = f.manifest.access;
  if (access !== undefined && !Array.isArray(access)) finding(ctx, 'HPR-LOCK-001', { feld: '/access', grund: 'ist keine Liste' }, at('/access'), f);
  list(access).forEach((a, i) => {
    const feld = pointer('access', i);
    if (!isObject(a)) return finding(ctx, 'HPR-LOCK-001', { feld, grund: 'Eintrag ist kein Objekt' }, at(feld), f);
    if (typeof a.target !== 'string') finding(ctx, 'HPR-LOCK-001', { feld, grund: 'target fehlt' }, at(feld), f);
    else {
      const why = unresolvedAddress(ctx, f, a.target);
      if (why) finding(ctx, 'HPR-LOCK-001', { feld, grund: `target „${a.target}“ nicht auflösbar: ${why}` }, at(feld), f);
    }
    if (!Array.isArray(a.rules) || a.rules.length === 0) finding(ctx, 'HPR-LOCK-001', { feld, grund: 'rules fehlt oder ist leer' }, at(feld), f);
    else for (const rule of a.rules) if (typeof rule !== 'string' || (!LOCK_RULES.has(rule) && !X_PREFIX_RE.test(rule))) finding(ctx, 'HPR-LOCK-001', { feld, grund: `Regel ${JSON.stringify(rule)} ist unzulässig` }, at(feld), f);
  });

  const logPath = `${f.prefix}data/redaction-log.json`;
  const bytes = ctx.files.get(logPath);
  if (!bytes) return;
  const where = loc.entry(logPath);
  let log: unknown;
  try {
    log = JSON.parse(decodeUtf8(bytes) ?? '\u0000');
  } catch (err) {
    finding(ctx, 'HPR-LOCK-002', { grund: `kein JSON (${(err as Error).message})` }, where, f);
    return;
  }
  if (!Array.isArray(log)) {
    finding(ctx, 'HPR-LOCK-002', { grund: 'Wurzel ist keine Liste' }, where, f);
    return;
  }
  log.forEach((e, i) => {
    if (!isObject(e)) return finding(ctx, 'HPR-LOCK-002', { grund: `Eintrag ${i} ist kein Objekt` }, where, f);
    if (typeof e.target !== 'string' || e.target === '') finding(ctx, 'HPR-LOCK-002', { grund: `Eintrag ${i}: target fehlt` }, where, f);
    if (!isValidUtc(e.at, RFC3339_UTC_RE)) finding(ctx, 'HPR-LOCK-002', { grund: `Eintrag ${i}: at ${JSON.stringify(e.at ?? null)} ist kein RFC-3339-Zeitpunkt in UTC` }, where, f);
    for (const k of ['reason', 'actor']) if (e[k] !== undefined && typeof e[k] !== 'string') finding(ctx, 'HPR-LOCK-002', { grund: `Eintrag ${i}: ${k} ist kein String` }, where, f);
  });
}

/** Entries of the redaction log (for HPR-LOCK-003 in the content rules). */
export function redactionTargets(ctx: Ctx, f: Fassung): string[] {
  const bytes = ctx.files.get(`${f.prefix}data/redaction-log.json`);
  if (!bytes) return [];
  try {
    const log: unknown = JSON.parse(decodeUtf8(bytes) ?? '');
    return Array.isArray(log) ? log.flatMap((e) => (isObject(e) && typeof e.target === 'string' ? [e.target] : [])) : [];
  } catch {
    return [];
  }
}

/** HPR-NEST-003 (attachments). */
export function checkAttachments(ctx: Ctx, f: Fassung): void {
  ctx.report.ran('HPR-NEST-003');
  const at = (ptr: string) => loc.manifest(f.manifestPath, ptr);
  const atts = f.manifest.attachments;
  const declared = new Set<string>();
  if (atts !== undefined && !Array.isArray(atts)) finding(ctx, 'HPR-NEST-003', { pfad: '/attachments', grund: 'attachments ist keine Liste' }, at('/attachments'), f);
  list(atts).forEach((a, i) => {
    const feld = pointer('attachments', i);
    if (!isObject(a)) return finding(ctx, 'HPR-NEST-003', { pfad: feld, grund: 'Eintrag ist kein Objekt' }, at(feld), f);
    const url = typeof a.url === 'string' ? a.url : '(ohne url)';
    if (typeof a.url === 'string') declared.add(a.url);
    if (typeof a.url !== 'string' || !ctx.files.has(a.url)) finding(ctx, 'HPR-NEST-003', { pfad: url, grund: 'url fehlt oder Datei nicht im Container' }, at(feld), f);
    if (typeof a.type !== 'string' || !MEDIA_TYPE_RE.test(a.type)) finding(ctx, 'HPR-NEST-003', { pfad: url, grund: 'type fehlt oder ist kein Media-Type' }, at(feld), f);
    if (!isNonEmptyString(a.name)) finding(ctx, 'HPR-NEST-003', { pfad: url, grund: 'name fehlt oder ist leer' }, at(feld), f);
  });
  for (const p of f.paths) if (p.startsWith(`${f.prefix}attachments/`) && !declared.has(p)) finding(ctx, 'HPR-NEST-003', { pfad: p, grund: 'Datei unter attachments/ ohne Eintrag in attachments' }, loc.entry(p), f);
}

/** HPR-VERS-002 and HPR-VERS-004 (extensions). */
export function checkExtensions(ctx: Ctx, f: Fassung): void {
  ctx.report.ran('HPR-VERS-002', 'HPR-VERS-004');
  const at = (ptr: string) => loc.manifest(f.manifestPath, ptr);
  const ext = f.manifest.extensions;
  const dirs = new Set<string>();
  const ids: string[] = [];
  if (ext !== undefined && !Array.isArray(ext)) finding(ctx, 'HPR-VERS-002', { pfad: `${f.manifestPath}#/extensions`, grund: 'extensions ist keine Liste' }, at('/extensions'), f);
  list(ext).forEach((e, i) => {
    const feld = pointer('extensions', i);
    if (!isObject(e)) return finding(ctx, 'HPR-VERS-002', { pfad: feld, grund: 'Eintrag ist kein Objekt' }, at(feld), f);
    if (!isAbsoluteUri(e.id)) finding(ctx, 'HPR-VERS-002', { pfad: feld, grund: `id ${JSON.stringify(e.id ?? null)} ist keine absolute URI` }, at(feld), f);
    if (typeof e.required !== 'boolean') finding(ctx, 'HPR-VERS-002', { pfad: feld, grund: 'required fehlt oder ist nicht boolesch' }, at(feld), f);
    if (typeof e.dir === 'string') dirs.add(e.dir);
    if (typeof e.id === 'string') ids.push(e.id);
    if (e.required === true) finding(ctx, 'HPR-VERS-004', { feld, uri: typeof e.id === 'string' ? e.id : '' }, at(feld), f);
  });
  for (const p of f.paths) {
    if (!p.startsWith(`${f.prefix}ext/`)) continue;
    const kennung = p.slice(f.prefix.length).split('/')[1] ?? '';
    const ok = p.slice(f.prefix.length).split('/').length >= 3 && (dirs.has(kennung) || ids.some((id) => id.replace(/\/+$/, '').endsWith(`/${kennung}`)));
    if (!ok) finding(ctx, 'HPR-VERS-002', { pfad: p, grund: `Datei gehört zu keiner deklarierten Erweiterung ext/${kennung}/` }, loc.entry(p), f);
  }
}

/** HPR-PROF-009 (renditions list of the main manifest). Returns the declared rendition ids with their manifest paths. */
export function checkRenditionList(ctx: Ctx, main: Fassung): Array<{ id: string; url: string }> {
  ctx.report.ran('HPR-PROF-009');
  const at = (ptr: string) => loc.manifest(main.manifestPath, ptr);
  const out: Array<{ id: string; url: string }> = [];
  const rends = main.manifest.renditions;
  if (rends !== undefined && !Array.isArray(rends)) finding(ctx, 'HPR-PROF-009', { feld: '/renditions', grund: 'renditions ist keine Liste' }, at('/renditions'), main);
  list(rends).forEach((r, i) => {
    const feld = pointer('renditions', i);
    if (!isObject(r)) return finding(ctx, 'HPR-PROF-009', { feld, grund: 'Eintrag ist kein Objekt' }, at(feld), main);
    const problems: string[] = [];
    const id = typeof r.id === 'string' ? r.id : undefined;
    if (!id || !ID_RE.test(id) || id.length > 64) problems.push(`id ${JSON.stringify(r.id ?? null)} ist keine gültige Kennung`);
    if (r.role !== 'frozen') problems.push(`role ${JSON.stringify(r.role ?? null)} statt "frozen"`);
    if (id && r.url !== `renditions/${id}/manifest.json`) problems.push(`url ${JSON.stringify(r.url ?? null)} statt renditions/${id}/manifest.json`);
    else if (id && !ctx.files.has(`renditions/${id}/manifest.json`)) problems.push(`renditions/${id}/manifest.json fehlt`);
    if (!isValidUtc(r.createdAt, RFC3339_UTC_RE)) problems.push(`createdAt ${JSON.stringify(r.createdAt ?? null)} ist kein RFC-3339-Zeitpunkt in UTC`);
    for (const p of problems) finding(ctx, 'HPR-PROF-009', { feld, grund: p }, at(feld), main);
    if (id && ID_RE.test(id) && ctx.files.has(`renditions/${id}/manifest.json`)) out.push({ id, url: `renditions/${id}/manifest.json` });
  });
  const declared = new Set(out.map((r) => r.id));
  const strays = new Set<string>();
  for (const e of ctx.scan.entries) {
    if (!e.name.startsWith('renditions/') || e.isDirectory) continue;
    const id = e.name.split('/')[1] ?? '';
    if (!declared.has(id) && !strays.has(id)) {
      strays.add(id);
      finding(ctx, 'HPR-PROF-009', { feld: '/renditions', grund: `Dateien unter renditions/${id}/ gehören zu keiner verzeichneten Fassung (z. B. ${e.name})` }, at('/renditions'), main);
    }
  }
  return out;
}

/** HPR-PROF-009 (paths inside a rendition manifest), HPR-PROF-014, HPR-PROF-015. */
export async function checkRenditionManifest(ctx: Ctx, f: Fassung, main: Fassung): Promise<void> {
  ctx.report.ran('HPR-PROF-014', 'HPR-PROF-015');
  const at = (ptr: string) => loc.manifest(f.manifestPath, ptr);
  for (const key of ['readingOrder', 'resources', 'attachments', 'data']) {
    list(f.manifest[key]).forEach((item, i) => {
      if (isObject(item) && typeof item.url === 'string' && !item.url.startsWith(f.prefix)) {
        finding(ctx, 'HPR-PROF-009', { feld: pointer(key, i), grund: `Pfad ${item.url} liegt nicht unter ${f.prefix}` }, at(pointer(key, i)), main);
      }
    });
  }
  const d = f.manifest.derivedFrom;
  if (!isObject(d)) finding(ctx, 'HPR-PROF-014', { feld: '/derivedFrom', grund: d === undefined ? 'fehlt' : 'ist kein Objekt' }, at('/derivedFrom'), f);
  else {
    if (typeof d.integrity !== 'string' || !SRI_RE.test(d.integrity)) finding(ctx, 'HPR-PROF-014', { feld: '/derivedFrom/integrity', grund: `integrity ${JSON.stringify(d.integrity ?? null)} hat nicht die Form sha256-<Base64>` }, at('/derivedFrom'), f);
    if (d.method !== 'author' && d.method !== 'render') finding(ctx, 'HPR-PROF-014', { feld: '/derivedFrom/method', grund: `method ${JSON.stringify(d.method ?? null)}` }, at('/derivedFrom'), f);
    const history = list(main.manifest.history).flatMap((h) => (isObject(h) && typeof h.manifestIntegrity === 'string' ? [h.manifestIntegrity] : []));
    if (typeof d.integrity === 'string' && history.length > 0) {
      const current = await sriSha256(ctx.files.get('manifest.json') ?? new Uint8Array());
      if (d.integrity !== current && !history.includes(d.integrity)) finding(ctx, 'HPR-PROF-015', { feld: '/derivedFrom/integrity', wert: d.integrity }, at('/derivedFrom/integrity'), f);
    }
  }
}

/** HPR-META-009, HPR-META-010, HPR-VERS-006, HPR-MIN-001 (main version only). */
export function checkMainOnly(ctx: Ctx, main: Fassung): void {
  ctx.report.ran('HPR-META-009', 'HPR-META-010', 'HPR-VERS-006', 'HPR-MIN-001');
  const m = main.manifest;
  const at = (ptr: string) => loc.manifest(main.manifestPath, ptr);
  const hasOriginal = main.paths.some((p) => p.startsWith('original/'));
  if (hasOriginal && m.source === undefined) finding(ctx, 'HPR-META-009', { feld: '/source', grund: 'Dateien unter original/, aber source fehlt' }, at('/source'), main);
  if (m.source !== undefined) {
    const s = m.source;
    if (!isObject(s)) finding(ctx, 'HPR-META-009', { feld: '/source', grund: 'source ist kein Objekt' }, at('/source'), main);
    else {
      if (typeof s.url !== 'string' || !ctx.files.has(s.url)) finding(ctx, 'HPR-META-009', { feld: '/source/url', grund: 'url fehlt oder Datei nicht im Container' }, at('/source'), main);
      if (typeof s.type !== 'string') finding(ctx, 'HPR-META-009', { feld: '/source/type', grund: 'type fehlt' }, at('/source'), main);
      const toolOk = typeof s.tool === 'string' || (isObject(s.tool) && typeof s.tool.name === 'string' && typeof s.tool.version === 'string');
      if (!toolOk) finding(ctx, 'HPR-META-009', { feld: '/source/tool', grund: 'tool fehlt (Name und Version)' }, at('/source'), main);
      if (typeof s.date !== 'string') finding(ctx, 'HPR-META-009', { feld: '/source/date', grund: 'date fehlt' }, at('/source'), main);
    }
  }
  if (m.history !== undefined) {
    if (!Array.isArray(m.history)) finding(ctx, 'HPR-META-010', { feld: '/history', grund: 'history ist keine Liste' }, at('/history'), main);
    else {
      let lastVersion = 0;
      let lastDate = '';
      m.history.forEach((h, i) => {
        const feld = pointer('history', i);
        if (!isObject(h)) return finding(ctx, 'HPR-META-010', { feld, grund: 'Eintrag ist kein Objekt' }, at(feld), main);
        if (!Number.isInteger(h.version) || (h.version as number) !== lastVersion + 1) finding(ctx, 'HPR-META-010', { feld, grund: `version ${JSON.stringify(h.version ?? null)}, erwartet ${lastVersion + 1} (ganzzahlig, streng aufsteigend ab 1)` }, at(feld), main);
        if (Number.isInteger(h.version)) lastVersion = h.version as number;
        if (!isValidUtc(h.dateModified, RFC3339_UTC_RE)) finding(ctx, 'HPR-META-010', { feld, grund: `dateModified ${JSON.stringify(h.dateModified ?? null)} ist kein RFC-3339-Zeitpunkt in UTC` }, at(feld), main);
        else {
          if (lastDate && (h.dateModified as string) < lastDate) finding(ctx, 'HPR-META-010', { feld, grund: `dateModified ${String(h.dateModified)} liegt vor dem vorigen Eintrag` }, at(feld), main);
          lastDate = h.dateModified as string;
        }
        if (i > 0 && (typeof h.manifestIntegrity !== 'string' || !SRI_RE.test(h.manifestIntegrity))) finding(ctx, 'HPR-META-010', { feld, grund: 'manifestIntegrity fehlt oder hat nicht die Form sha256-<Base64>' }, at(feld), main);
      });
    }
  }
  const reportPath = 'data/conformance-report.json';
  const rep = ctx.files.get(reportPath);
  if (rep) {
    let v: unknown;
    try {
      v = JSON.parse(decodeUtf8(rep) ?? '');
    } catch {
      v = undefined;
    }
    const problems: string[] = [];
    if (!isObject(v)) problems.push('kein JSON-Objekt');
    else {
      for (const k of ['spec', 'levels', 'checkedAt', 'tool', 'results']) if (!(k in v)) problems.push(`${k} fehlt`);
      if (v.spec !== undefined && v.spec !== 'https://html-pro.example/spec/0.1') problems.push(`spec „${String(v.spec)}“ weicht ab`);
      const bad = list(v.results).filter((r) => isObject(r) && (r.class === 'ERROR' || r.class === 'FATAL')).length;
      if (bad > 0) problems.push(`${bad} Befunde der Klasse ERROR/FATAL; „ist html-Pro 0.1“ gilt aus diesem Bericht nicht`);
    }
    for (const p of problems) finding(ctx, 'HPR-VERS-006', { grund: p }, loc.entry(reportPath), main);
  }
  if (m.subset !== undefined) {
    const problems: string[] = [];
    if (m.subset !== SUBSET_OFFICE_MIN) problems.push(`subset ist „${String(m.subset)}“ statt ${SUBSET_OFFICE_MIN}`);
    if (typeof m.conformsTo !== 'string' || !m.conformsTo.endsWith('/profile/static')) problems.push(`conformsTo ist „${String(m.conformsTo)}“, nicht …/profile/static`);
    for (const p of problems) finding(ctx, 'HPR-MIN-001', { feld: '/subset', grund: p }, at('/subset'), main);
  }
}

/** True when the version claims the office minimum profile (rules MIN-002…010 apply). */
export function claimsOfficeMin(f: Fassung): boolean {
  return f.id === null && f.manifest.subset === SUBSET_OFFICE_MIN;
}
