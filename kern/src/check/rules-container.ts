/**
 * Container rules (part 1, section 5.1 and LOCK-005/006, SIG-018): ZIP structure,
 * `mimetype`, reserved paths, OCF `container.xml`, `package.opf` and its agreement with
 * `manifest.json`.
 */
import { finding, isObject, loc, resolveRef, type Ctx, type Fassung } from './context.js';
import { children, decodeUtf8, lineOf, localName, NS, parseXml, type XmlElement } from './markup.js';
import { dosDateTime } from './zipscan.js';

const EPUB_MIMETYPE = 'application/epub+zip';
const META_INF_ALLOWED = /^META-INF\/(container\.xml|signatures[^/]*\.xml|manifest\.xml|metadata\.xml|rights\.xml)$/;

/** HPR-LOCK-006: a CMS EnvelopedData envelope (DER SEQUENCE whose first element is OID 1.2.840.113549.1.7.3). */
export function isCmsEnvelope(bytes: Uint8Array): boolean {
  if (bytes.length < 13 || bytes[0] !== 0x30) return false;
  let p = 1;
  const len0 = bytes[p++]!;
  if (len0 & 0x80) p += len0 & 0x7f;
  const oid = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x03];
  return oid.every((b, i) => bytes[p + i] === b);
}

/** ZIP-level rules from the scan (HPR-CONT-001…003, -012, -013, -026, -027). Returns false on a fatal error. */
export function checkZip(ctx: Ctx): boolean {
  const { report, scan } = ctx;
  report.ran('HPR-CONT-001', 'HPR-CONT-002', 'HPR-CONT-003', 'HPR-CONT-012', 'HPR-CONT-013', 'HPR-CONT-026', 'HPR-CONT-027');
  if (scan.fatal) {
    report.finding('HPR-CONT-001', { grund: scan.fatal }, loc.container());
    return false;
  }
  for (const i of scan.issues) {
    switch (i.kind) {
      case 'method':
        report.finding('HPR-CONT-002', { pfad: i.path ?? '', methode: i.method ?? '' }, loc.entry(i.path ?? ''));
        break;
      case 'encryption':
      case 'zip64':
      case 'multidisk':
        report.finding('HPR-CONT-003', { pfad: i.path ?? '(Archiv)', grund: i.detail }, i.path ? loc.entry(i.path) : loc.container());
        break;
      case 'path':
        report.finding('HPR-CONT-012', { pfad: i.path ?? '', regel: i.rule ?? i.detail }, loc.entry(i.path ?? ''));
        break;
      case 'crc':
        report.finding('HPR-CONT-027', { pfad: i.path ?? '', grund: i.detail }, loc.entry(i.path ?? ''));
        break;
      case 'limit':
        report.finding('HPR-CONT-026', { grund: i.detail, wert: i.value ?? '', grenze: i.limit ?? '' }, i.path ? loc.entry(i.path) : loc.container());
        break;
    }
  }
  const folded = new Map<string, string>();
  for (const e of scan.entries) {
    const key = e.name.normalize('NFC').toLowerCase();
    const other = folded.get(key);
    if (other !== undefined) report.finding('HPR-CONT-013', { pfad: e.name, wert: other }, loc.entry(e.name));
    else folded.set(key, e.name);
  }
  return true;
}

/** HPR-CONT-004 (fatal) and HPR-CONT-005. Returns false on a fatal error. */
export function checkMimetype(ctx: Ctx): boolean {
  const { report, scan } = ctx;
  report.ran('HPR-CONT-004', 'HPR-CONT-005');
  const entry = ctx.entryByName.get('mimetype');
  const content = entry?.data ? new TextDecoder('latin1').decode(entry.data) : undefined;
  if (content !== EPUB_MIMETYPE && !ctx.files.has('manifest.json')) {
    report.finding('HPR-CONT-004', {}, loc.container());
    return false;
  }
  const problems: string[] = [];
  if (!scan.startsWithLocalHeader) problems.push('Bytes 0–3 sind nicht PK\\x03\\x04');
  if (!entry) problems.push('Eintrag fehlt');
  else {
    if (scan.firstLocalName !== 'mimetype' || entry.localHeaderOffset !== 0) problems.push(`erster Eintrag ist ${JSON.stringify(scan.firstLocalName ?? '')}, nicht mimetype an Offset 0`);
    if (entry.method !== 0) problems.push(`Methode ${entry.method}`);
    if (entry.localExtraLength !== 0) problems.push(`Extra-Länge ${entry.localExtraLength}`);
    if (content !== EPUB_MIMETYPE) problems.push(`Inhalt ${JSON.stringify(content ?? '(unlesbar)')}`);
  }
  for (const p of problems) report.finding('HPR-CONT-005', { grund: p }, loc.entry('mimetype'));
  return true;
}

/** HPR-CONT-014 (META-INF part), HPR-CONT-023. */
export function checkReservedPaths(ctx: Ctx): void {
  ctx.report.ran('HPR-CONT-014', 'HPR-CONT-023');
  for (const e of ctx.scan.entries) {
    if (e.name.startsWith('META-INF/') && !e.isDirectory && !META_INF_ALLOWED.test(e.name)) {
      ctx.report.finding('HPR-CONT-014', { pfad: e.name, grund: 'unzulässige Datei unter META-INF/' }, loc.entry(e.name));
    }
    if ((e.name === 'META-INF/encryption.xml' || e.name === 'META-INF/rights.xml') && e.size > 0) ctx.report.finding('HPR-CONT-023', { pfad: e.name }, loc.entry(e.name));
  }
}

/** HPR-CONT-006: OCF container.xml. */
export function checkContainerXml(ctx: Ctx): void {
  ctx.report.ran('HPR-CONT-006');
  const path = 'META-INF/container.xml';
  const add = (grund: string, line?: number) => ctx.report.finding('HPR-CONT-006', { grund }, loc.xml(path, line));
  const bytes = ctx.files.get(path);
  if (!bytes) return add(ctx.entryByName.has(path) ? 'Eintrag nicht lesbar' : 'Datei fehlt');
  const text = decodeUtf8(bytes);
  if (text === undefined) return add('kein gültiges UTF-8');
  const parsed = parseXml(text);
  if (!parsed.doc) return add(`nicht wohlgeformt: ${parsed.error?.message}`, parsed.error?.line);
  const root = parsed.doc.documentElement!;
  if (localName(root) !== 'container' || root.namespaceURI !== NS.ocf) return add(`Wurzel ist {${root.namespaceURI ?? ''}}${localName(root)}, erwartet OCF container`, lineOf(root));
  const rootfiles = children(root).find((e) => localName(e) === 'rootfiles' && e.namespaceURI === NS.ocf);
  const first = rootfiles ? children(rootfiles).find((e) => localName(e) === 'rootfile' && e.namespaceURI === NS.ocf) : undefined;
  if (!first) return add('kein rootfiles/rootfile', lineOf(root));
  if (first.getAttribute('full-path') !== 'package.opf') add(`rootfile[1]/@full-path ist „${first.getAttribute('full-path') ?? ''}“, erwartet package.opf`, lineOf(first));
  if (first.getAttribute('media-type') !== 'application/oebps-package+xml') add(`rootfile[1]/@media-type ist „${first.getAttribute('media-type') ?? ''}“`, lineOf(first));
}

export interface Opf {
  readonly root: XmlElement;
  readonly items: ReadonlyArray<{ id: string; href: string; path: string | undefined; mediaType: string; properties: string[]; line: number | undefined }>;
  readonly spine: ReadonlyArray<{ idref: string; line: number | undefined }>;
}

/** HPR-CONT-007; returns the parsed package for the following rules. */
export function checkPackageOpf(ctx: Ctx): Opf | undefined {
  ctx.report.ran('HPR-CONT-007');
  const path = 'package.opf';
  const add = (grund: string, line?: number) => ctx.report.finding('HPR-CONT-007', { grund }, loc.xml(path, line));
  const bytes = ctx.files.get(path);
  if (!bytes) {
    add(ctx.entryByName.has(path) ? 'Eintrag nicht lesbar' : 'Datei fehlt');
    return undefined;
  }
  const text = decodeUtf8(bytes);
  if (text === undefined) {
    add('kein gültiges UTF-8');
    return undefined;
  }
  const parsed = parseXml(text);
  if (!parsed.doc) {
    add(`nicht wohlgeformt: ${parsed.error?.message}`, parsed.error?.line);
    return undefined;
  }
  const root = parsed.doc.documentElement!;
  if (localName(root) !== 'package' || root.namespaceURI !== NS.opf) {
    add(`Wurzel ist {${root.namespaceURI ?? ''}}${localName(root)}, erwartet package im OPF-Namensraum`, lineOf(root));
    return undefined;
  }
  if (root.getAttribute('version') !== '3.0') add(`version="${root.getAttribute('version') ?? ''}", erwartet 3.0`, lineOf(root));
  const manifest = children(root).find((e) => localName(e) === 'manifest' && e.namespaceURI === NS.opf);
  const spine = children(root).find((e) => localName(e) === 'spine' && e.namespaceURI === NS.opf);
  const items = (manifest ? children(manifest) : [])
    .filter((e) => localName(e) === 'item' && e.namespaceURI === NS.opf)
    .map((e) => {
      const href = e.getAttribute('href') ?? '';
      return {
        id: e.getAttribute('id') ?? '',
        href,
        path: resolveRef(path, href)?.path,
        mediaType: e.getAttribute('media-type') ?? '',
        properties: (e.getAttribute('properties') ?? '').split(/\s+/).filter(Boolean),
        line: lineOf(e),
      };
    });
  const itemrefs = (spine ? children(spine) : []).filter((e) => localName(e) === 'itemref' && e.namespaceURI === NS.opf).map((e) => ({ idref: e.getAttribute('idref') ?? '', line: lineOf(e) }));
  return { root, items, spine: itemrefs };
}

/** HPR-CONT-008, -009, -010 and HPR-META-006 (needs the main manifest). */
export function checkPackageAgainstContainer(ctx: Ctx, opf: Opf | undefined, main: Fassung | undefined): void {
  ctx.report.ran('HPR-CONT-008', 'HPR-CONT-010');
  if (main) ctx.report.ran('HPR-CONT-009', 'HPR-META-006');
  if (!opf) return; // reported by HPR-CONT-007; nothing to compare
  const containerPaths = ctx.scan.entries.filter((e) => !e.isDirectory && e.name !== 'mimetype' && e.name !== 'package.opf' && !e.name.startsWith('META-INF/')).map((e) => e.name);
  const itemPaths = new Set(opf.items.map((i) => i.path).filter((p): p is string => !!p));
  for (const p of containerPaths) if (!itemPaths.has(p)) ctx.report.finding('HPR-CONT-008', { pfad: p, grund: 'hat kein item' }, loc.entry(p));
  const existing = new Set(containerPaths);
  for (const i of opf.items) if (!i.path || !existing.has(i.path)) ctx.report.finding('HPR-CONT-008', { pfad: i.path ?? i.href, grund: 'item ohne Datei' }, loc.entry(i.path ?? i.href));

  const navItems = opf.items.filter((i) => i.properties.includes('nav'));
  if (navItems.length !== 1 || !navItems[0]!.path || !ctx.files.has(navItems[0]!.path)) {
    ctx.report.finding('HPR-CONT-010', { anzahl: navItems.length }, loc.xml('package.opf', navItems[1]?.line ?? lineOf(opf.root)));
  }

  if (!main) return;
  const byId = new Map(opf.items.map((i) => [i.id, i]));
  const spinePaths = opf.spine.map((s) => byId.get(s.idref)?.path ?? `(idref ${s.idref} ohne item)`);
  const ro = main.readingOrder;
  if (spinePaths.length !== ro.length || spinePaths.some((p, i) => p !== ro[i])) {
    const at = spinePaths.findIndex((p, i) => p !== ro[i]);
    const idx = at < 0 ? Math.min(spinePaths.length, ro.length) : at;
    ctx.report.finding('HPR-CONT-009', { grund: `Position ${idx + 1}: Spine ${spinePaths[idx] ?? '(Ende)'}, readingOrder ${ro[idx] ?? '(Ende)'}` }, loc.xml('package.opf', opf.spine[idx]?.line));
  }

  const metadata = children(opf.root).find((e) => localName(e) === 'metadata' && e.namespaceURI === NS.opf);
  const m = main.manifest;
  const meta = metadata ? children(metadata) : [];
  const uidId = opf.root.getAttribute('unique-identifier') ?? '';
  const identifier = meta.find((e) => e.namespaceURI === NS.dc && localName(e) === 'identifier' && e.getAttribute('id') === uidId);
  const first = (name: string) => meta.find((e) => e.namespaceURI === NS.dc && localName(e) === name);
  const modified = meta.find((e) => localName(e) === 'meta' && e.getAttribute('property') === 'dcterms:modified');
  const compare: Array<[string, XmlElement | undefined, unknown]> = [
    ['dc:identifier', identifier, m.id],
    ['dc:title', first('title'), m.name],
    ['dc:language', first('language'), m.inLanguage],
    ['dcterms:modified', modified, m.dateModified],
  ];
  for (const [feld, el, expected] of compare) {
    const value = el?.textContent?.trim() ?? '(fehlt)';
    if (typeof expected === 'string' && value !== expected) ctx.report.finding('HPR-META-006', { feld, wert: value, erwartet: expected }, loc.xml('package.opf', lineOf(el ?? metadata ?? opf.root)));
  }
}

/** HPR-CONT-025: ZIP timestamps derived from `dateModified`. */
export function checkTimestamps(ctx: Ctx, main: Fassung): void {
  ctx.report.ran('HPR-CONT-025');
  const modified = main.manifest.dateModified;
  if (typeof modified !== 'string') return;
  const date = new Date(modified);
  if (Number.isNaN(date.getTime())) return;
  const expected = dosDateTime(date);
  const differing = ctx.scan.entries.filter((e) => e.dosDate !== expected.date || e.dosTime !== expected.time);
  if (differing.length > 0) ctx.report.finding('HPR-CONT-025', { anzahl: differing.length, erwartet: modified }, loc.container());
}

/** HPR-SIG-018: private key material anywhere in the container. */
export function checkPrivateKeys(ctx: Ctx): void {
  ctx.report.ran('HPR-SIG-018');
  const pkcs12 = [0x06, 0x0a, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x0c];
  for (const [path, data] of ctx.files) {
    let grund: string | undefined;
    const latin = new TextDecoder('latin1').decode(data);
    if (latin.includes('PRIVATE KEY')) grund = 'Zeichenkette „PRIVATE KEY“';
    else if (indexOf(data, pkcs12) >= 0) grund = 'PKCS#12-OID 1.2.840.113549.1.12';
    else if (looksLikePkcs8(data)) grund = 'DER-Struktur PKCS#8 PrivateKeyInfo';
    if (grund) ctx.report.finding('HPR-SIG-018', { pfad: path, grund }, loc.entry(path));
  }
}

function indexOf(data: Uint8Array, needle: number[]): number {
  outer: for (let i = 0; i + needle.length <= data.length; i++) {
    for (let k = 0; k < needle.length; k++) if (data[i + k] !== needle[k]) continue outer;
    return i;
  }
  return -1;
}

/** SEQUENCE { INTEGER 0, SEQUENCE AlgorithmIdentifier, OCTET STRING } at the start of the file. */
function looksLikePkcs8(d: Uint8Array): boolean {
  if (d.length < 16 || d[0] !== 0x30) return false;
  let p = 1;
  const l = d[p++]!;
  if (l & 0x80) p += l & 0x7f;
  if (d[p] !== 0x02 || d[p + 1] !== 0x01 || d[p + 2] !== 0x00) return false;
  p += 3;
  if (d[p] !== 0x30) return false;
  const l2 = d[p + 1]!;
  let len = l2;
  let hdr = 2;
  if (l2 & 0x80) {
    const n = l2 & 0x7f;
    len = 0;
    for (let k = 0; k < n; k++) len = (len << 8) | d[p + 2 + k]!;
    hdr = 2 + n;
  }
  return d[p + hdr + len] === 0x04;
}

/** HPR-LOCK-005: redacted terms still present (only with terms from the caller). */
export function checkRedactedTerms(ctx: Ctx): void {
  const terms = (ctx.options.redactedTerms ?? []).filter((t) => t !== '');
  if (terms.length === 0) {
    ctx.report.notChecked('HPR-LOCK-005', 'missing-means', 'keine Liste redigierter Begriffe übergeben (--redacted)');
    return;
  }
  ctx.report.ran('HPR-LOCK-005');
  const textual = /\.(xhtml|html|svg|css|json|opf|xml|txt|jsonld)$/i;
  for (const [path, data] of ctx.files) {
    // Text files decoded as UTF-8; binary files (images) searched in their raw bytes, which
    // covers EXIF/XMP text fields. Text recognition in image content is not available.
    const content = textual.test(path) ? (decodeUtf8(data) ?? '') : new TextDecoder('latin1').decode(data);
    const utf8InBinary = textual.test(path) ? '' : (decodeUtf8(data) ?? new TextDecoder('utf-8').decode(data));
    for (const t of terms) if (content.includes(t) || utf8InBinary.includes(t)) ctx.report.finding('HPR-LOCK-005', { pfad: path, wert: t }, loc.entry(path));
  }
}

/** HPR-CONT-014 (manifest part): manifest entries naming reserved files. */
export function checkReservedManifestPaths(ctx: Ctx, f: Fassung): void {
  ctx.report.ran('HPR-CONT-014');
  for (const list of ['resources', 'attachments', 'components', 'data'] as const) {
    const v = f.manifest[list];
    if (!Array.isArray(v)) continue;
    v.forEach((item, i) => {
      if (!isObject(item) || typeof item.url !== 'string') return;
      const url = item.url;
      const rel = url.startsWith(f.prefix) ? url.slice(f.prefix.length) : url;
      let grund: string | undefined;
      if (url.startsWith('META-INF/')) grund = `Eintrag in ${list} liegt unter META-INF/`;
      else if (url === 'mimetype' || rel === 'manifest.json') grund = `Eintrag in ${list} heißt wie die reservierte Datei ${url}`;
      // package.opf is a container file that HP-CONT-008 itself requires in `resources`
      // (see docs/belege/S3/README.md, finding on the catalogue); only other uses are a violation.
      else if (url === 'package.opf' && !(list === 'resources' && item.type === 'application/oebps-package+xml' && f.id === null)) grund = `Eintrag in ${list} belegt den reservierten Pfad package.opf`;
      // Location kind `entry` with {pfad} as the catalogue prescribes; the manifest field is named in {grund}.
      if (grund) finding(ctx, 'HPR-CONT-014', { pfad: url, grund: `${grund} (${f.manifestPath}#/${list}/${i})` }, loc.entry(url), f);
    });
  }
}
