/**
 * html-Pro conformance checker (package S3): applies the document rules (`HPR-…`) of part 1
 * to a file and returns the report of section 4.3. Runs on web-standard APIs only, like the
 * rest of the core; external tools (EPUB validator, PDF/A validator) are passed in as
 * functions by the caller (the CLI in `bin/hpro-check.ts` does that for Node).
 *
 * Order of a run (part 1, sections 2.2 and 3.3): envelope → ZIP → mimetype → container files →
 * main manifest → renditions → rules per version → package.opf against the manifest →
 * signatures → external tools → rules without means. A fatal error stops the affected subject;
 * every rule that did not run is reported as not checked with its reason.
 */
import { sha256Hex } from '../hash.js';
import { parseCss, parseStyleAttribute } from './css.js';
import { CHECKER_VERSION, isExternalRef, isObject, isPayloadPath, loc, resolveRef, typeOf, type CheckOptions, type Ctx, type Fassung, type JsonObject, type StyleSource } from './context.js';
import { attr, decodeUtf8, elements, isHtml, lineOf, localName, NS, parseXml } from './markup.js';
import { ReportBuilder, type Catalog, type ConformanceReport } from './report.js';
import {
  checkContainerXml,
  checkMimetype,
  checkPackageAgainstContainer,
  checkPackageOpf,
  checkPrivateKeys,
  checkRedactedTerms,
  checkReservedManifestPaths,
  checkReservedPaths,
  checkTimestamps,
  checkZip,
  isCmsEnvelope,
} from './rules-container.js';
import { checkMarkup, checkReferences, checkStyles, checkToc, checkWellFormed, resourceReferences } from './rules-content.js';
import { checkComponentScripts, checkInteractiveMarkup, checkNames, checkOfficeMin, checkPrint, checkRedaction, checkRenditionContent, checkScripts, checkSignatureFields } from './rules-live.js';
import {
  checkAccess,
  checkAttachments,
  checkComponents,
  checkData,
  checkExtensions,
  checkMainOnly,
  checkMetadata,
  checkProfile,
  checkProfileContents,
  checkRenditionList,
  checkRenditionManifest,
  checkResources,
  claimsOfficeMin,
} from './rules-manifest.js';
import { checkSignatures, checkSignedFassung, collectSignatures } from './rules-signature.js';
import { scanZip } from './zipscan.js';

export const CHECKER_NAME = 'hpro-check (html-Pro Konformitätsprüfer)';
export const CHECKER_TOOL_VERSION = '0.1.0';

const RENDERING_RULES = ['HPR-INH-004', 'HPR-INH-006', 'HPR-INH-022'] as const;
const RENDERING_COMPONENT_RULES = ['HPR-SBX-010', 'HPR-SBX-012', 'HPR-SBX-015'] as const;
const NO_ENGINE = 'keine Browser-Engine im Prüfer angebunden (Mittel rendering)';

/** HPR-CONT-011: reads a manifest as UTF-8 JSON object without BOM; returns the object or the reason. */
function readManifest(ctx: Ctx, path: string): JsonObject | string {
  const bytes = ctx.files.get(path);
  if (!bytes) return ctx.entryByName.has(path) ? 'Eintrag nicht lesbar' : 'Datei fehlt';
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'beginnt mit einem BOM';
  const text = decodeUtf8(bytes);
  if (text === undefined) return 'kein gültiges UTF-8';
  try {
    const v: unknown = JSON.parse(text);
    return isObject(v) ? (v as JsonObject) : `Wurzel ist ${Array.isArray(v) ? 'eine Liste' : typeof v}`;
  } catch (err) {
    return `kein JSON (${(err as Error).message})`;
  }
}

function loadFassung(ctx: Ctx, id: string | null, manifestPath: string, manifest: JsonObject): Fassung {
  const prefix = id === null ? '' : `renditions/${id}/`;
  const paths = ctx.scan.entries
    .filter((e) => !e.isDirectory && e.name !== 'mimetype' && e.name !== manifestPath && !e.name.startsWith('META-INF/') && (id === null ? !e.name.startsWith('renditions/') : e.name.startsWith(prefix)))
    .map((e) => e.name);
  const types = new Map<string, string>();
  const readingOrder: string[] = [];
  if (Array.isArray(manifest.readingOrder)) {
    for (const item of manifest.readingOrder) {
      if (!isObject(item) || typeof item.url !== 'string') continue;
      readingOrder.push(item.url);
      if (typeof item.type === 'string') types.set(item.url, item.type);
    }
  }
  if (Array.isArray(manifest.resources)) for (const item of manifest.resources) if (isObject(item) && typeof item.url === 'string' && typeof item.type === 'string') types.set(item.url, item.type);
  const f: Fassung = { id, prefix, manifestPath, manifest, profile: 'static', paths, types, readingOrder, docs: new Map(), svgs: new Map(), styles: [], docStyles: new Map(), styleAttributes: [], parsed: new Map() };

  const sheets = new Map<string, StyleSource & { printOnly: boolean }>();
  for (const path of paths) {
    if (isPayloadPath(f, path)) continue;
    const type = typeOf(f, path) ?? '';
    const bytes = ctx.files.get(path);
    if (!bytes) continue;
    if (type === 'application/xhtml+xml' || type === 'image/svg+xml' || type.endsWith('+xml') || type === 'application/xml' || type === 'text/xml') {
      const text = decodeUtf8(bytes);
      if (text === undefined) {
        f.parsed.set(path, {});
        continue;
      }
      const parsed = parseXml(text);
      f.parsed.set(path, { ...parsed, text });
      const root = parsed.doc?.documentElement;
      if (!parsed.doc || !root) continue;
      if (type === 'application/xhtml+xml' && localName(root) === 'html' && root.namespaceURI === NS.xhtml) f.docs.set(path, { path, kind: 'xhtml', text, doc: parsed.doc, root });
      if (type === 'image/svg+xml' && localName(root) === 'svg' && root.namespaceURI === NS.svg) f.svgs.set(path, { path, kind: 'svg', text, doc: parsed.doc, root });
    } else if (type === 'text/css') {
      const text = decodeUtf8(bytes);
      if (text === undefined) continue;
      const source = { path, sheet: parseCss(text), printOnly: false };
      sheets.set(path, source);
      f.styles.push(source);
    }
  }
  const linkMedia = new Map<string, string[]>();
  for (const doc of f.docs.values()) {
    const applying: StyleSource[] = [];
    for (const el of elements(doc.doc)) {
      if (isHtml(el, 'link') && (attr(el, 'rel') ?? '').split(/\s+/).includes('stylesheet')) {
        const href = attr(el, 'href');
        const t = href && !isExternalRef(href) ? resolveRef(doc.path, href) : undefined;
        const sheet = t ? sheets.get(t.path) : undefined;
        if (sheet && t) {
          applying.push(sheet);
          linkMedia.set(t.path, [...(linkMedia.get(t.path) ?? []), (attr(el, 'media') ?? 'all').trim().toLowerCase()]);
        }
      }
      if (isHtml(el, 'style')) {
        const source = { path: doc.path, sheet: parseCss(el.textContent ?? '', lineOf(el) ?? 1), printOnly: /^print$/i.test((attr(el, 'media') ?? '').trim()) };
        f.styles.push(source);
        applying.push(source);
      }
      const style = attr(el, 'style');
      if (style !== null) {
        const parsed = parseStyleAttribute(style, lineOf(el) ?? 1);
        f.styleAttributes.push({ path: doc.path, element: el, line: lineOf(el), ...parsed });
      }
    }
    f.docStyles.set(doc.path, applying);
  }
  for (const [path, media] of linkMedia) {
    const sheet = sheets.get(path);
    if (sheet && media.every((m) => m === 'print')) sheet.printOnly = true;
  }
  return f;
}

async function runFassungRules(ctx: Ctx, f: Fassung, main: Fassung): Promise<void> {
  checkMetadata(ctx, f);
  await checkResources(ctx, f);
  checkReservedManifestPaths(ctx, f);
  checkProfileContents(ctx, f);
  await checkComponents(ctx, f);
  checkData(ctx, f);
  checkAccess(ctx, f);
  checkAttachments(ctx, f);
  checkExtensions(ctx, f);
  checkWellFormed(ctx, f);
  checkReferences(ctx, f, resourceReferences(f));
  checkMarkup(ctx, f);
  checkToc(ctx, f);
  checkStyles(ctx, f);
  checkScripts(ctx, f);
  checkInteractiveMarkup(ctx, f);
  checkComponentScripts(ctx, f);
  checkRenditionContent(ctx, f);
  checkRedaction(ctx, f);
  checkPrint(ctx, f);
  checkNames(ctx, f);
  checkSignatureFields(ctx, f);
  await checkSignedFassung(ctx, f);
  if (f.id !== null) await checkRenditionManifest(ctx, f, main);
}

/** Checks a file against the rule catalogue of part 1 and returns the report (section 4.3). */
export async function checkConformance(bytes: Uint8Array, catalog: Catalog, options: CheckOptions): Promise<ConformanceReport> {
  const report = new ReportBuilder(catalog, {
    file: { name: options.fileName, size: bytes.length, sha256: await sha256Hex(bytes) },
    tool: options.tool ?? { name: CHECKER_NAME, version: CHECKER_TOOL_VERSION },
    strict: options.strict ?? false,
    ...(options.checkedAt ? { checkedAt: options.checkedAt } : {}),
  });
  for (const l of options.levels ?? []) report.request(l);
  const finishAfterFatal = () => {
    report.keepOnlyFatal();
    return report.finish();
  };

  report.ran('HPR-LOCK-006');
  if (isCmsEnvelope(bytes)) {
    report.finding('HPR-LOCK-006', {}, loc.container());
    return finishAfterFatal();
  }
  const scan = await scanZip(bytes);
  const ctx: Ctx = { bytes, options, report, scan, files: new Map(), entryByName: new Map(), fassungen: [], signatures: [] };
  for (const e of scan.entries) {
    ctx.entryByName.set(e.name, e);
    if (!e.isDirectory && e.data) ctx.files.set(e.name, e.data);
  }
  if (!checkZip(ctx)) return finishAfterFatal();
  if (!checkMimetype(ctx)) return finishAfterFatal();
  checkReservedPaths(ctx);
  checkContainerXml(ctx);
  const opf = checkPackageOpf(ctx);
  checkPrivateKeys(ctx);
  checkRedactedTerms(ctx);
  collectSignatures(ctx);

  report.ran('HPR-CONT-011');
  const mainManifest = readManifest(ctx, 'manifest.json');
  if (typeof mainManifest === 'string') {
    report.finding('HPR-CONT-011', { pfad: 'manifest.json', grund: mainManifest }, loc.entry('manifest.json'));
    return finishAfterFatal();
  }
  const main = loadFassung(ctx, null, 'manifest.json', mainManifest);
  main.profile = checkProfile(ctx, main);
  report.rendition(null, main.profile);
  if (opf) {
    const nav = opf.items.find((i) => i.properties.includes('nav'));
    if (nav?.path) main.navPath = nav.path;
  }
  ctx.main = main;
  ctx.fassungen.push(main);

  for (const { id, url } of checkRenditionList(ctx, main)) {
    const m = readManifest(ctx, url);
    if (typeof m === 'string') {
      report.finding('HPR-CONT-011', { pfad: url, grund: m }, loc.entry(url), id);
      continue;
    }
    const f = loadFassung(ctx, id, url, m);
    f.profile = checkProfile(ctx, f);
    report.rendition(id, f.profile);
    ctx.fassungen.push(f);
  }

  for (const f of ctx.fassungen) await runFassungRules(ctx, f, main);
  report.ran('HPR-PROF-014', 'HPR-PROF-015'); // rendition-only rules; without renditions nothing to check
  checkMainOnly(ctx, main);
  checkTimestamps(ctx, main);
  if (claimsOfficeMin(main)) checkOfficeMin(ctx, main);
  else report.ran('HPR-MIN-002', 'HPR-MIN-003', 'HPR-MIN-004', 'HPR-MIN-005', 'HPR-MIN-006', 'HPR-MIN-007', 'HPR-MIN-008', 'HPR-MIN-009', 'HPR-MIN-010');
  checkPackageAgainstContainer(ctx, opf, main);
  await checkSignatures(ctx, ctx.fassungen);

  // External EPUB validator (HPR-CONT-024/028).
  if (options.epubValidator) {
    const res = await options.epubValidator(bytes);
    if (res.error || !res.messages) {
      report.notChecked('HPR-CONT-024', 'tool-error', res.error ?? 'kein Ergebnis');
      report.notChecked('HPR-CONT-028', 'tool-error', res.error ?? 'kein Ergebnis');
    } else {
      report.ran('HPR-CONT-024', 'HPR-CONT-028');
      report.external(res.tool, res.messages.length);
      for (const m of res.messages) {
        const params = { code: m.code, pfad: m.path ?? '(Container)', zeile: m.line ?? '', grund: m.message };
        report.finding(m.severity === 'FATAL' || m.severity === 'ERROR' ? 'HPR-CONT-024' : 'HPR-CONT-028', params, { ...loc.external(res.tool, m.code), ...(m.path ? { path: m.path } : {}), ...(m.line ? { line: m.line } : {}) });
      }
    }
  } else {
    report.notChecked('HPR-CONT-024', 'missing-means', 'kein EPUB-Validator angebunden');
    report.notChecked('HPR-CONT-028', 'missing-means', 'kein EPUB-Validator angebunden');
  }

  // Rules that need a browser engine.
  for (const id of RENDERING_RULES) report.notChecked(id, 'missing-means', NO_ENGINE);
  const liveComponents = ctx.fassungen.some((f) => f.profile === 'interactive' && [...f.docs.values()].some((d) => elements(d.doc).some((e) => e.namespaceURI === NS.xhtml && localName(e).includes('-'))));
  for (const id of RENDERING_COMPONENT_RULES) {
    if (liveComponents) report.notChecked(id, 'missing-means', NO_ENGINE);
    else report.ran(id); // no component element in an interactive version: nothing to render
  }

  // HPR-PROF-007 needs human judgement for external links in archive versions.
  const archiveLinks = ctx.fassungen
    .filter((f) => f.profile === 'archive')
    .flatMap((f) => [...f.docs.values()].flatMap((d) => elements(d.doc).filter((e) => isHtml(e, 'a') && isExternalRef(attr(e, 'href') ?? '')).map((e) => `${d.path}:${lineOf(e) ?? '?'} ${attr(e, 'href')}`)));
  if (archiveLinks.length > 0) report.notChecked('HPR-PROF-007', 'manual', `externe Verweise zur Beurteilung: ${archiveLinks.slice(0, 10).join('; ')}${archiveLinks.length > 10 ? ` (+${archiveLinks.length - 10})` : ''}`);
  else report.ran('HPR-PROF-007');

  return report.finish(`im Prüfer ${CHECKER_TOOL_VERSION} (Katalog ${CHECKER_VERSION.major}.${CHECKER_VERSION.minor}) nicht ausgeführt`);
}
