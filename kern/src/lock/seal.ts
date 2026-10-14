/**
 * Sealed sections (proposal HPC-0007): a section of the living document whose content is
 * encrypted inside the container. It is the only lock that protects against reading — every
 * other rule (`read-only`, `no-print`, `no-export`, `hidden`) leaves the text in the container,
 * where any ZIP tool shows it (part 0, section 9; docs/10, promise 5).
 *
 * What sealing does:
 *   1. The element at `path#id` is serialised; images and other media used only inside it are
 *      inlined as `data:` URLs and their files are removed from the container.
 *   2. The serialisation is encrypted as JWE (RFC 7516, A256GCM) for passwords and/or recipient
 *      certificates and stored as `data/sealed/<stem>-<id>.json` (`application/jose+json`). The
 *      protected header names the target (`hp-target`), so an envelope cannot be moved to
 *      another section without the reader noticing.
 *   3. The element is replaced by a placeholder with the same id and
 *      `data-hp-sealed="<relative URL of the envelope>"`, optionally keeping its heading, and a
 *      notice (`data-hp-role="sealed-notice"`).
 *   4. Navigation entries and links to ids inside the section are rewritten to the section.
 *   5. `manifest.json#access` gets the rule `sealed` for the target; hashes, package.opf,
 *      `dateModified` and `history` are updated.
 *   6. The written container is searched (every entry decoded, plus the raw ZIP) for every
 *      text fragment of the section; any hit is a leak and sealing fails.
 *
 * Honest limit: whoever holds a key reads the content and can copy it. Sealing protects the
 * file in transit and at rest, not against an authorised reader.
 */
import { continueJournal, JOURNAL_PATH } from '../edit/journal.js';
import { historyNeedles, scrubHistory } from './history.js';
import type { Document, Element } from '@xmldom/xmldom';
import { fromUtf8, toBase64, utf8 } from '../bytes.js';
import { readContainer, type ReadContainer } from '../container.js';
import { sriSha256 } from '../hash.js';
import { opfWithModified } from '../update.js';
import { writeZip, type ZipEntryInput } from '../zip.js';
import { refreshMachineViews } from '../machine/container.js';
import { LockError, parseAccess, splitTarget, withRules, type AccessEntry } from './access.js';
import { decryptJwe, encryptJwe, parseJwe, type JweGeneral, type Opener, type Recipient } from './jwe.js';
import { searchContainer, type Hit } from './search.js';
import { byId, childElements, descendants, embeddedReferences, isInside, parseXml, relativeHref, resolveHref, serializeNode, serializeXml, textNodes, XHTML_NS, XHTML_TYPE } from './xml.js';

export const SEALED_DIR = 'data/sealed/';
export const ENVELOPE_TYPE = 'application/jose+json';
export const DEFAULT_SEALED_NOTICE = 'Versiegelter Abschnitt: Der Inhalt ist im Dokument verschlüsselt und nur mit dem passenden Schlüssel oder Kennwort lesbar.';
const SEALED_TITLE = 'Versiegelter Abschnitt';
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

type Json = Record<string, unknown>;

export interface SealOptions {
  /** Address `path#id` of the element to seal (main version, XHTML). */
  readonly target: string;
  readonly recipients: readonly Recipient[];
  /** New `dateModified` (UTC, seconds). */
  readonly modified: string;
  /** Keep the first heading of the section visible (default false: the heading is sealed too). */
  readonly keepHeading?: boolean;
  readonly notice?: string;
  /** Minimum length of text fragments the leak check searches for (default 6). */
  readonly minFragment?: number;
}

export interface SealResult {
  readonly bytes: Uint8Array;
  readonly envelopePath: string;
  /** Files that were used only inside the section and now live (inlined) in the envelope. */
  readonly removedFiles: readonly string[];
  /** Links and navigation entries rewritten to the section. */
  readonly rewrittenLinks: number;
  /** Leak check over the written container. */
  readonly check: { readonly fragments: number; readonly entries: number; readonly hits: readonly Hit[] };
}

/** Text fragments of a subtree: trimmed text nodes and text attributes with at least `min` characters. */
export function fragmentsOf(root: Element, min: number, skip?: Element): string[] {
  const out = new Set<string>();
  for (const t of textNodes(root)) {
    if (skip && isInside(t, skip)) continue;
    const v = (t.nodeValue ?? '').replace(/\s+/g, ' ').trim();
    if (v.length >= min) out.add(v);
  }
  for (const el of [root, ...descendants(root)]) {
    if (skip && isInside(el, skip)) continue;
    for (const a of ['alt', 'title', 'aria-label', 'aria-description', 'placeholder', 'value', 'data-hp-value']) {
      const v = (el.getAttribute(a) ?? '').replace(/\s+/g, ' ').trim();
      if (v.length >= min) out.add(v);
    }
  }
  return [...out];
}

function checkTime(value: string): void {
  if (!UTC_RE.test(value) || Number.isNaN(Date.parse(value))) throw new LockError('invalid', `modified must be YYYY-MM-DDThh:mm:ssZ, got ${value}`);
}

function stemOf(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '-');
}

function isHeading(el: Element): boolean {
  return /^h[1-6]$/.test(el.localName ?? '');
}

/** Writes the container with changed, added and removed files, updated manifest and package.opf. */
async function writeChanged(c: ReadContainer, manifest: Json, changed: Map<string, Uint8Array>, added: Map<string, { data: Uint8Array; type: string }>, removed: Set<string>, modified: string): Promise<Uint8Array> {
  // package.opf: remove items of removed files, add items, set dcterms:modified.
  let opf = fromUtf8(changed.get(c.packagePath) ?? c.files.get(c.packagePath)!);
  for (const p of removed) opf = opf.replace(new RegExp(`\\s*<item\\b[^>]*\\bhref="${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`), '');
  const existingIds = new Set([...opf.matchAll(/<item\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]));
  let n = 0;
  const items: string[] = [];
  for (const [p, f] of [...added].sort(([a], [b]) => (a < b ? -1 : 1))) {
    let id: string;
    do id = `sealed-${++n}`;
    while (existingIds.has(id));
    items.push(`    <item id="${id}" href="${p}" media-type="${f.type}"/>`);
  }
  if (items.length > 0) opf = opf.replace('  </manifest>', `${items.join('\n')}\n  </manifest>`);
  changed.set(c.packagePath, utf8(opfWithModified(opf, modified)));

  const resources = [];
  for (const r of manifest.resources as Array<{ url: string; type: string; integrity: string }>) {
    if (removed.has(r.url)) continue;
    const data = changed.get(r.url);
    resources.push(data ? { ...r, integrity: await sriSha256(data) } : r);
  }
  for (const [p, f] of added) resources.push({ url: p, type: f.type, integrity: await sriSha256(f.data) });
  resources.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  const out: Json = { ...manifest, resources };
  const entries: ZipEntryInput[] = c.entries
    .filter((e) => !e.name.endsWith('/') && !removed.has(e.name))
    .map((e) => ({
      name: e.name,
      data: e.name === 'manifest.json' ? utf8(JSON.stringify(out, null, 2) + '\n') : (changed.get(e.name) ?? e.data),
      compression: e.name === 'mimetype' ? 'store' : 'auto',
    }));
  for (const [name, f] of [...added].sort(([a], [b]) => (a < b ? -1 : 1))) entries.push({ name, data: f.data, compression: 'auto' });
  return writeZip(await refreshMachineViews(entries), { modified: new Date(modified) });
}

export { writeChanged as writeChangedContainer };

function historyEntry(manifest: Json, modified: string, note: string, oldManifest: Uint8Array): Promise<Json[]> {
  const history = Array.isArray(manifest.history) ? [...(manifest.history as Json[])] : [];
  return sriSha256(oldManifest).then((manifestIntegrity) => {
    history.push({ version: history.length > 0 ? Math.max(...history.map((h) => Number(h.version) || 0)) + 1 : 1, dateModified: modified, note, manifestIntegrity });
    return history;
  });
}

export async function sealSection(bytes: Uint8Array, options: SealOptions): Promise<SealResult> {
  checkTime(options.modified);
  const c = await readContainer(bytes);
  if (!c.integrity.ok) throw new LockError('invalid', 'the container does not match its manifest; seal only an intact document');
  const { path, id } = splitTarget(options.target);
  if (id === null || id === '') throw new LockError('invalid', 'target must be an address path#id');
  if (path.startsWith('renditions/')) throw new LockError('invalid', 'a frozen version cannot be changed; seal the main version before freezing');
  const manifest = JSON.parse(fromUtf8(c.files.get('manifest.json')!)) as Json;
  const types = new Map((manifest.resources as Array<{ url: string; type: string }>).map((r) => [r.url, r.type]));
  if (types.get(path) !== XHTML_TYPE) throw new LockError('invalid', `${path} is not an XHTML content document of the main version`);
  const access = parseAccess(manifest);
  if (access.some((a) => a.target === options.target && a.rules.includes('sealed'))) throw new LockError('sealed', `${options.target} is sealed already`);

  const text = fromUtf8(c.files.get(path)!);
  const doc = parseXml(text, path);
  const el = byId(doc, id);
  if (!el) throw new LockError('not-found', `no element with id "${id}" in ${path}`);
  if (['html', 'head', 'body'].includes(el.localName ?? '')) throw new LockError('invalid', `<${el.localName}> cannot be sealed; seal a section inside the body`);
  if (descendants(el).some((d) => d.hasAttribute('data-hp-sealed'))) throw new LockError('invalid', 'the section contains a sealed section; nested sealing is not supported');
  if (descendants(el).some((d) => d.localName === 'script' || (d.localName ?? '').includes('-'))) throw new LockError('invalid', 'the section contains scripts or components; seal static content only');

  const heading = options.keepHeading ? childElements(el).find(isHeading) : undefined;
  const minFragment = options.minFragment ?? 6;
  const fragments = fragmentsOf(el, minFragment, heading);
  const innerIds = new Set([el, ...descendants(el)].map((e) => e.getAttribute('id')).filter((x): x is string => !!x && x !== id));
  if (heading) for (const e of [heading, ...descendants(heading)]) e.getAttribute('id') && innerIds.delete(e.getAttribute('id')!);

  // 1. Resources used only inside the section: inline, then remove.
  const inside = embeddedReferences(el, path);
  const usedElsewhere = new Set<string>();
  for (const [p, data] of c.files) {
    if (p.startsWith('renditions/') || p === c.packagePath || p === 'manifest.json' || p.startsWith('META-INF/')) continue;
    const t = types.get(p);
    if (t === XHTML_TYPE || t === 'image/svg+xml') {
      const d = p === path ? doc : parseXml(fromUtf8(data), p, t);
      for (const ref of embeddedReferences(d, p)) if (!(p === path && isInside(ref.el, el))) usedElsewhere.add(ref.target);
    } else if (t === 'text/css') {
      for (const m of fromUtf8(data).matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
        const r = resolveHref(p, m[1]!);
        if (r) usedElsewhere.add(r.path);
      }
    }
  }
  const removed = new Set<string>();
  for (const ref of inside) {
    const data = c.files.get(ref.target);
    if (!data || usedElsewhere.has(ref.target)) continue;
    ref.el.setAttribute(ref.attr, `data:${types.get(ref.target) ?? 'application/octet-stream'};base64,${toBase64(data)}`);
    removed.add(ref.target);
  }

  // 2. Envelope.
  const envelopePath = `${SEALED_DIR}${stemOf(path)}-${id}.json`;
  if (c.files.has(envelopePath)) throw new LockError('invalid', `${envelopePath} exists already`);
  const payload = utf8(serializeNode(el));
  const jwe = await encryptJwe(payload, { cty: XHTML_TYPE, 'hp-target': options.target }, options.recipients);
  const envelope = utf8(JSON.stringify(jwe, null, 2) + '\n');

  // 3. Placeholder.
  const ph = doc.createElementNS(el.namespaceURI ?? XHTML_NS, el.localName ?? 'section');
  for (const a of ['id', 'lang', 'xml:lang', 'dir']) {
    const v = el.getAttribute(a);
    if (v !== null) ph.setAttribute(a, v);
  }
  ph.setAttribute('data-hp-sealed', relativeHref(path, envelopePath));
  if (heading) ph.appendChild(heading.cloneNode(true));
  else if (el.localName === 'section') {
    const h = doc.createElementNS(XHTML_NS, 'h2');
    h.setAttribute('id', `${id}-versiegelt`); // HP-ADR-001: headings are addressable
    h.appendChild(doc.createTextNode(SEALED_TITLE));
    ph.appendChild(h);
  }
  const notice = doc.createElementNS(XHTML_NS, el.localName === 'span' || el.localName === 'a' ? 'span' : 'p');
  notice.setAttribute('data-hp-role', 'sealed-notice');
  notice.appendChild(doc.createTextNode(options.notice ?? DEFAULT_SEALED_NOTICE));
  ph.appendChild(notice);
  el.parentNode!.replaceChild(ph, el);

  // 4. Links and navigation into the section.
  const changed = new Map<string, Uint8Array>();
  let rewrittenLinks = 0;
  const docsToSave = new Map<string, { doc: Document; text: string }>([[path, { doc, text }]]);
  for (const [p, data] of c.files) {
    if (p === path || types.get(p) !== XHTML_TYPE || p.startsWith('renditions/')) continue;
    docsToSave.set(p, { doc: parseXml(fromUtf8(data), p), text: fromUtf8(data) });
  }
  for (const [p, d] of docsToSave) {
    let touched = p === path;
    for (const a of descendants(d.doc).filter((e) => e.localName === 'a' && e.getAttribute('href'))) {
      const r = resolveHref(p, a.getAttribute('href')!);
      if (!r || r.path !== path) continue;
      const isNav = !!descendants(d.doc).find((e) => e.localName === 'nav') && isInside(a, descendants(d.doc).find((e) => e.localName === 'nav')!);
      if (innerIds.has(r.fragment)) {
        const li = a.parentNode && (a.parentNode as Element).localName === 'li' ? (a.parentNode as Element) : undefined;
        if (isNav && li?.parentNode) {
          const list = li.parentNode as Element;
          list.removeChild(li);
          // An empty ol is invalid in the EPUB navigation document: remove it with its white space.
          if (childElements(list).length === 0 && list.parentNode) list.parentNode.removeChild(list);
        }
        else a.setAttribute('href', `${p === path ? '' : relativeHref(p, path)}#${id}`);
        rewrittenLinks++;
        touched = true;
      } else if (r.fragment === id && isNav && !heading) {
        while (a.firstChild) a.removeChild(a.firstChild);
        a.appendChild(d.doc.createTextNode(SEALED_TITLE));
        rewrittenLinks++;
        touched = true;
      }
    }
    if (touched) changed.set(p, utf8(serializeXml(d.doc, d.text)));
  }

  // 5. Manifest.
  let m: Json = { ...manifest, dateModified: options.modified, access: withRules(access, options.target, ['sealed']) as unknown as Json[] };
  m = { ...m, history: await historyEntry(manifest, options.modified, `Abschnitt ${options.target} versiegelt`, c.files.get('manifest.json')!) };
  let out = await writeChanged(c, m, changed, new Map([[envelopePath, { data: envelope, type: ENVELOPE_TYPE }]]), removed, options.modified);
  // History journal (HPC-0008): earlier versions of the section must not stay readable either.
  if (c.files.has(JOURNAL_PATH)) {
    fragments.push(...(await historyNeedles(c, [options.target], minFragment)).filter((f) => !fragments.includes(f)));
    out = await scrubHistory(c, out, { targets: [options.target], needles: fragments, minFragment, mode: 'seal' });
  }

  // 6. Leak check on what was written.
  const result = await searchContainer(out, fragments);
  if (result.hits.length > 0) {
    // The author owns the text, so the message names it (shortened): otherwise the leak cannot be found.
    const list = result.hits.map((h) => `„${fragments[h.needle]!.slice(0, 40)}${fragments[h.needle]!.length > 40 ? '…' : ''}“ in ${h.entry} (${h.reading})`);
    throw new LockError('leak', `sealing would leave text of the section in the container: ${[...new Set(list)].join('; ')}. Rephrase or remove these places (links, captions, a frozen version) and seal again.`);
  }
  const read = await readContainer(out);
  if (!read.integrity.ok) throw new LockError('invalid', 'internal error: sealed container does not verify');
  return { bytes: out, envelopePath, removedFiles: [...removed].sort(), rewrittenLinks, check: { fragments: fragments.length, entries: result.entries, hits: [] } };
}

export interface SealedSection {
  /** Address relative to the version root (`content/index.xhtml#id`), as in the envelope header. */
  readonly target: string;
  /** Container path of the document holding the placeholder. */
  readonly path: string;
  readonly id: string;
  /** Container path of the envelope. */
  readonly envelope: string;
}

/**
 * Sealed sections of a version: `sealed` rules from the version's manifest whose placeholder
 * names an envelope. `prefix` is `renditions/<id>/` for a frozen version, else ''.
 */
export function sealedSections(manifest: unknown, files: ReadonlyMap<string, Uint8Array>, prefix = ''): SealedSection[] {
  const out: SealedSection[] = [];
  for (const a of parseAccess(manifest)) {
    if (!a.rules.includes('sealed')) continue;
    const { path, id } = splitTarget(a.target);
    if (!id) continue;
    const data = files.get(path);
    if (!data) continue;
    const ph = byId(parseXml(fromUtf8(data), path), id);
    const href = ph?.getAttribute('data-hp-sealed');
    const env = href ? resolveHref(path, href) : undefined;
    if (!env) continue;
    out.push({ target: prefix && path.startsWith(prefix) ? `${path.slice(prefix.length)}#${id}` : a.target, path, id, envelope: env.path });
  }
  return out;
}

/** Decrypts one envelope and checks that it belongs to `target`; returns the XHTML of the section. */
export async function openEnvelope(envelope: Uint8Array, target: string, opener: Opener): Promise<string> {
  const jwe: JweGeneral = parseJwe(envelope);
  const { plaintext, header } = await decryptJwe(jwe, opener);
  if (header['hp-target'] !== target) throw new LockError('invalid', `envelope belongs to ${String(header['hp-target'])}, not to ${target}`);
  if (header.cty !== XHTML_TYPE) throw new LockError('invalid', `envelope content type ${String(header.cty)} is not ${XHTML_TYPE}`);
  return fromUtf8(plaintext);
}

/** Opens a sealed section of a container (main version or `rendition`). */
export async function openSealedSection(bytes: Uint8Array, target: string, opener: Opener, rendition: string | null = null): Promise<{ xhtml: string; section: SealedSection }> {
  const c = await readContainer(bytes);
  const prefix = rendition === null ? '' : `renditions/${rendition}/`;
  const manifest = rendition === null ? c.manifest : JSON.parse(fromUtf8(c.files.get(`${prefix}manifest.json`) ?? utf8('{}')));
  const section = sealedSections(manifest, c.files, prefix).find((s) => s.target === target);
  if (!section) throw new LockError('not-found', `${target} is not a sealed section of this version`);
  const env = c.files.get(section.envelope);
  if (!env) throw new LockError('not-found', `envelope ${section.envelope} is missing`);
  return { xhtml: await openEnvelope(env, target, opener), section };
}

/**
 * Lifts the seal permanently (main version): the section is put back as it was sealed (media
 * stay inlined as `data:` URLs), the envelope and the `sealed` rule are removed.
 */
export async function unsealSection(bytes: Uint8Array, target: string, opener: Opener, modified: string): Promise<Uint8Array> {
  checkTime(modified);
  const c = await readContainer(bytes);
  const { xhtml, section } = await openSealedSection(bytes, target, opener);
  const text = fromUtf8(c.files.get(section.path)!);
  const doc = parseXml(text, section.path);
  const ph = byId(doc, section.id)!;
  const frag = parseXml(`<wrapper xmlns="${XHTML_NS}">${xhtml}</wrapper>`, 'envelope');
  const original = childElements(frag.documentElement!)[0];
  if (!original || original.getAttribute('id') !== section.id) throw new LockError('invalid', 'envelope content does not carry the section id');
  ph.parentNode!.replaceChild(doc.importNode(original, true), ph);
  const manifest = JSON.parse(fromUtf8(c.files.get('manifest.json')!)) as Json;
  const access: AccessEntry[] = parseAccess(manifest)
    .map((a) => (a.target === target ? { target: a.target, rules: a.rules.filter((r) => r !== 'sealed') } : a))
    .filter((a) => a.rules.length > 0);
  let m: Json = { ...manifest, dateModified: modified, access };
  if (access.length === 0) delete m.access;
  m = { ...m, history: await historyEntry(manifest, modified, `Versiegelung von ${target} aufgehoben`, c.files.get('manifest.json')!) };
  return continueJournal(c, await writeChanged(c, m, new Map([[section.path, utf8(serializeXml(doc, text))]]), new Map(), new Set([section.envelope]), modified));
}

