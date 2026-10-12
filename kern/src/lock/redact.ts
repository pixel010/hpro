/**
 * Redaction as deletion (HP-LOCK-007, HP-LOCK-008; part 1, sections 7.2 and 7.4).
 *
 * Input: addresses (`path#id`) whose content is removed, and/or terms that are removed wherever
 * they occur. Text of a redacted address is treated as a term as well, so a verbatim copy in a
 * data file, the navigation or the metadata goes too.
 *
 * Per entry type:
 *   - XHTML/SVG text: each occurrence becomes `<span data-hp-redacted="" role="img"
 *     aria-label="geschwärzt"/>` (in `title`, `style`, SVG and other text-only places the text
 *     `[geschwärzt]`); attribute values: `[geschwärzt]`; links whose target contains a term lose
 *     the `href`.
 *   - JSON (data, manifest), package.opf, CSS, other text: `[geschwärzt]`.
 *   - Binary files (images, media, fonts, PDF) containing a term (EXIF/XMP text): removed; every
 *     element embedding them becomes a placeholder. Pixels are not searched (no OCR).
 *   - Frozen versions containing redacted content are removed completely, signature included
 *     (7.4); for a signed one only with `removeSignedRenditions: true` (the warning of 7.4).
 *
 * The container is written anew (no old bytes survive, unlike an incremental PDF update), the
 * log `data/redaction-log.json` gets one entry per address, and the written bytes are searched
 * again: every entry decoded in several readings plus the raw ZIP. Any hit → nothing is returned.
 */
import type { Document, Element, Node } from '@xmldom/xmldom';
import { fromUtf8, utf8 } from '../bytes.js';
import { sriSha256 } from '../hash.js';
import { readContainer } from '../container.js';
import { readZip } from '../zip.js';
import { validateContainer } from '../validate.js';
import { LockError, splitTarget } from './access.js';
import { fragmentsOf, writeChangedContainer } from './seal.js';
import { searchContainer, searchEntries } from './search.js';
import { byId, descendants, embeddedReferences, isElement, isInside, parseXml, serializeXml, textNodes, XHTML_NS, XHTML_TYPE } from './xml.js';
import { JOURNAL_PATH } from '../edit/journal.js';
import { historyNeedles, scrubHistory } from './history.js';

export const REDACTION_LOG = 'data/redaction-log.json';
export const REDACTED_TEXT = '[geschwärzt]';
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const TEXT_ONLY_PARENTS = new Set(['title', 'style', 'script', 'option', 'textarea', 'desc']);
const KEEP_ATTRIBUTES = new Set(['id', 'class', 'lang', 'xml:lang', 'dir']);
/** Elements that cannot hold the placeholder: they are replaced by it (the placeholder takes over the id). */
const REPLACED_ELEMENTS = new Set(['img', 'video', 'audio', 'object', 'embed', 'iframe', 'svg', 'picture', 'input', 'source', 'track', 'br', 'hr', 'math']);
const TEXT_TYPES = /^(text\/|application\/(json|jose\+json|ld\+json|xml|xhtml\+xml|oebps-package\+xml|javascript|ecmascript)|image\/svg\+xml)/;

type Json = Record<string, unknown>;

export interface RedactOptions {
  /** Addresses `path#id` of the main version whose content is removed. */
  readonly targets?: readonly string[];
  /** Terms removed wherever they occur (case-insensitive, any white space between words). */
  readonly terms?: readonly string[];
  /** Time of the redaction (UTC, seconds); also the new `dateModified`. */
  readonly at: string;
  readonly reason?: string;
  readonly actor?: string;
  /** Confirms the removal of signed frozen versions that contain the content (part 1, 7.4). */
  readonly removeSignedRenditions?: boolean;
  /** Minimum length of text fragments of an address that are also removed elsewhere (default 10). */
  readonly minFragment?: number;
}

export interface RedactionLogEntry {
  readonly target: string;
  readonly at: string;
  readonly reason?: string;
  readonly actor?: string;
  /** Files changed or removed for this entry (proposal HPC-0007). */
  readonly files?: readonly string[];
  /** How the result was checked (proposal HPC-0007). */
  readonly check?: { readonly method: string; readonly needles: number; readonly entries: number; readonly hits: number };
}

export interface RedactResult {
  readonly bytes: Uint8Array;
  readonly entries: readonly RedactionLogEntry[];
  readonly changedFiles: readonly string[];
  readonly removedFiles: readonly string[];
  readonly removedRenditions: ReadonlyArray<{ readonly id: string; readonly signed: boolean; readonly signatures: readonly string[] }>;
  /** Signatures of the main version that no longer verify (part 1, 7.2: not removed, shown as HASH_FAILURE). */
  readonly invalidatedSignatures: readonly string[];
  /** Replacements per file (counts only, never the content). */
  readonly replacements: Readonly<Record<string, number>>;
  readonly check: { readonly needles: number; readonly entries: number; readonly hits: number };
}

export class RedactionNeedsConfirmation extends LockError {
  constructor(readonly renditions: readonly string[]) {
    super('confirm', `signed frozen version(s) ${renditions.join(', ')} contain the content; redaction removes them with their signature (part 1, 7.4). Repeat with removeSignedRenditions: true to confirm.`);
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive pattern for all needles, white space flexible, longest first. */
export function pattern(needles: readonly string[]): RegExp | null {
  const list = [...new Set(needles.map((n) => n.normalize('NFC').trim()).filter((n) => n !== ''))].sort((a, b) => b.length - a.length);
  if (list.length === 0) return null;
  return new RegExp(list.map((n) => n.split(/\s+/).map(escapeRe).join('\\s+')).join('|'), 'giu');
}

export function placeholder(doc: Document): Element {
  const span = doc.createElementNS(XHTML_NS, 'span');
  span.setAttribute('data-hp-redacted', '');
  span.setAttribute('role', 'img');
  span.setAttribute('aria-label', 'geschwärzt');
  return span;
}

function hasAncestor(node: Node, names: readonly string[]): boolean {
  for (let p: Node | null = node.parentNode; p; p = p.parentNode) if (isElement(p) && names.includes(p.localName ?? '')) return true;
  return false;
}

function nearestAddress(path: string, node: Node): string {
  for (let p: Node | null = node; p; p = p.parentNode) if (isElement(p) && p.getAttribute('id')) return `${path}#${p.getAttribute('id')}`;
  return path;
}

/**
 * Replaces matches in text nodes and attributes of a markup document; returns count and addresses.
 * `replacement` "[versiegelt]" (used for the history of a sealed section) replaces as plain text.
 */
export function redactMarkup(doc: Document, path: string, re: RegExp, svg: boolean, replacement = REDACTED_TEXT): { count: number; addresses: Set<string> } {
  let count = 0;
  const addresses = new Set<string>();
  for (const t of textNodes(doc)) {
    const value = t.nodeValue ?? '';
    re.lastIndex = 0;
    if (!re.test(value)) continue;
    const parent = t.parentNode as Element;
    const inRedacted = isElement(parent) && parent.hasAttribute('data-hp-redacted');
    if (inRedacted) continue;
    addresses.add(nearestAddress(path, parent));
    // Text-only places: SVG, head, title/style/…; navigation labels get the placeholder plus text (EPUB needs text in nav links).
    const textOnly = replacement !== REDACTED_TEXT || svg || !isElement(parent) || parent.namespaceURI !== XHTML_NS || TEXT_ONLY_PARENTS.has(parent.localName ?? '') || hasAncestor(t, ['head']);
    const inNav = hasAncestor(t, ['nav']);
    re.lastIndex = 0;
    if (textOnly) {
      t.nodeValue = value.replace(re, () => (count++, replacement));
      continue;
    }
    const pieces: Node[] = [];
    let last = 0;
    for (const m of value.matchAll(re)) {
      if (m.index! > last) pieces.push(doc.createTextNode(value.slice(last, m.index)));
      pieces.push(placeholder(doc));
      if (inNav) pieces.push(doc.createTextNode(REDACTED_TEXT));
      count++;
      last = m.index! + m[0].length;
    }
    if (last < value.length) pieces.push(doc.createTextNode(value.slice(last)));
    for (const p of pieces) parent.insertBefore(p, t);
    parent.removeChild(t);
  }
  for (const el of [doc.documentElement!, ...descendants(doc)]) {
    for (const attr of Array.from({ length: el.attributes.length }, (_, i) => el.attributes.item(i)!)) {
      re.lastIndex = 0;
      if (!re.test(attr.value)) continue;
      addresses.add(nearestAddress(path, el));
      re.lastIndex = 0;
      if (attr.name === 'href' || attr.name === 'xlink:href') {
        el.removeAttribute(attr.name);
        count++;
      } else if (attr.name === 'id') {
        if (replacement !== REDACTED_TEXT) continue; // history of a sealed section: ids are addresses, not content
        throw new LockError('invalid', `${path}: an id contains a redacted term; redact that element by its parent address`);
      } else {
        el.setAttribute(attr.name, attr.value.replace(re, () => (count++, replacement)));
      }
    }
  }
  return { count, addresses };
}

export function redactJson(value: unknown, re: RegExp, counter: { n: number }, replacement = REDACTED_TEXT): unknown {
  if (typeof value === 'string') {
    re.lastIndex = 0;
    return value.replace(re, () => (counter.n++, replacement));
  }
  if (Array.isArray(value)) return value.map((v) => redactJson(v, re, counter, replacement));
  if (value && typeof value === 'object') {
    const out: Json = {};
    for (const [k, v] of Object.entries(value)) {
      re.lastIndex = 0;
      const key = re.test(k) ? (counter.n++, k.replace(re, replacement)) : k;
      out[key] = redactJson(v, re, counter, replacement);
    }
    return out;
  }
  return value;
}

function assignRendition(signedPaths: readonly string[]): string | null {
  const refs = signedPaths.filter((p) => p !== 'META-INF/container.xml');
  const m = refs[0]?.match(/^renditions\/([^/]+)\//);
  return m && refs.every((p) => p.startsWith(`renditions/${m[1]}/`)) ? m[1]! : null;
}

/** Removes `ds:Signature` elements by Id from signatures.xml text, leaving all other bytes as they are (HP-SIG-003). */
function removeSignatures(xml: string, ids: readonly string[]): string {
  let out = xml;
  for (const id of ids) {
    const re = new RegExp(`\\s*<([A-Za-z_][\\w.-]*:)?Signature\\b[^>]*\\bId="${escapeRe(id)}"[\\s\\S]*?</\\1Signature>`);
    if (!re.test(out)) throw new LockError('invalid', `signature ${id} not found in META-INF/signatures.xml`);
    out = out.replace(re, '');
  }
  return out;
}

export async function redactContainer(bytes: Uint8Array, options: RedactOptions): Promise<RedactResult> {
  if (!UTC_RE.test(options.at) || Number.isNaN(Date.parse(options.at))) throw new LockError('invalid', `at must be YYYY-MM-DDThh:mm:ssZ, got ${options.at}`);
  const targets = options.targets ?? [];
  const terms = (options.terms ?? []).map((t) => t.trim()).filter((t) => t !== '');
  if (targets.length === 0 && terms.length === 0) throw new LockError('invalid', 'nothing to redact: give targets and/or terms');
  const c = await readContainer(bytes);
  const manifest = JSON.parse(fromUtf8(c.files.get('manifest.json')!)) as Json;
  const types = new Map((manifest.resources as Array<{ url: string; type: string }>).map((r) => [r.url, r.type]));
  const isMain = (p: string) => !p.startsWith('renditions/') && !p.startsWith('META-INF/') && p !== 'mimetype';

  const docs = new Map<string, { doc: Document; text: string }>();
  const getDoc = (p: string) => {
    let d = docs.get(p);
    if (!d) {
      const text = fromUtf8(c.files.get(p)!);
      d = { doc: parseXml(text, p, types.get(p) === 'image/svg+xml' ? 'image/svg+xml' : XHTML_TYPE), text };
      docs.set(p, d);
    }
    return d;
  };

  // 1. Addresses: collect their text, empty them, leave the placeholder.
  const needles = [...terms];
  const entryFiles = new Map<string, Set<string>>();
  const touch = (address: string, file: string) => (entryFiles.get(address) ?? entryFiles.set(address, new Set()).get(address)!).add(file);
  const replacements: Record<string, number> = {};
  const count = (file: string, n: number) => n > 0 && (replacements[file] = (replacements[file] ?? 0) + n);
  const orphanCandidates = new Set<string>();
  for (const target of targets) {
    const { path, id } = splitTarget(target);
    if (!id) throw new LockError('invalid', `${target}: an address needs #id (whole files are redacted by terms or removed)`);
    if (!isMain(path) || types.get(path) !== XHTML_TYPE) throw new LockError('invalid', `${target}: not an XHTML document of the main version`);
    const d = getDoc(path);
    const el = byId(d.doc, id);
    if (!el) throw new LockError('not-found', `${target}: no element with this id`);
    if (['html', 'head', 'body'].includes(el.localName ?? '')) throw new LockError('invalid', `${target}: <${el.localName}> cannot be redacted as a whole`);
    needles.push(...fragmentsOf(el, options.minFragment ?? 10));
    for (const ref of embeddedReferences(el, path)) orphanCandidates.add(ref.target);
    if (REPLACED_ELEMENTS.has(el.localName ?? '')) {
      const span = placeholder(d.doc);
      span.setAttribute('id', id);
      el.parentNode!.replaceChild(span, el);
    } else {
      while (el.firstChild) el.removeChild(el.firstChild);
      for (const attr of Array.from({ length: el.attributes.length }, (_, i) => el.attributes.item(i)!)) if (!KEEP_ATTRIBUTES.has(attr.name) && !attr.name.startsWith('xmlns')) el.removeAttribute(attr.name);
      el.appendChild(placeholder(d.doc));
    }
    touch(target, path);
    count(path, 1);
  }
  // Earlier versions in the history journal (HPC-0008): what stood at a redacted address there goes too.
  needles.push(...(await historyNeedles(c, targets, options.minFragment ?? 10)));
  const re = pattern(needles);

  // 2. Every file of the main version.
  const changed = new Map<string, Uint8Array>();
  const removed = new Set<string>();
  const binaryHits: string[] = [];
  let newManifest: Json = manifest;
  for (const [p, data] of c.files) {
    if (!isMain(p) || p === c.packagePath) continue;
    const type = p === 'manifest.json' ? 'application/json' : (types.get(p) ?? 'application/octet-stream');
    if (type === XHTML_TYPE || type === 'image/svg+xml') {
      const d = getDoc(p);
      if (re) {
        const r = redactMarkup(d.doc, p, re, type === 'image/svg+xml');
        count(p, r.count);
        for (const a of r.addresses) touch(a, p);
      }
      continue;
    }
    if (!re) continue;
    if (p === 'manifest.json' || type === 'application/json' || type === 'application/ld+json') {
      const counter = { n: 0 };
      const value = redactJson(JSON.parse(fromUtf8(data)), re, counter);
      if (counter.n === 0) continue;
      count(p, counter.n);
      if (p === 'manifest.json') newManifest = value as Json;
      else changed.set(p, utf8(JSON.stringify(value, null, 2) + '\n'));
      continue;
    }
    if (TEXT_TYPES.test(type)) {
      const text = fromUtf8(data);
      re.lastIndex = 0;
      if (!re.test(text)) continue;
      const counter = { n: 0 };
      re.lastIndex = 0;
      changed.set(p, utf8(text.replace(re, () => (counter.n++, REDACTED_TEXT))));
      count(p, counter.n);
      continue;
    }
    if (searchEntries(new Map([[p, data]]), needles).length > 0) binaryHits.push(p);
  }
  // package.opf: metadata text.
  if (re) {
    const opf = fromUtf8(c.files.get(c.packagePath)!);
    const counter = { n: 0 };
    re.lastIndex = 0;
    const replaced = opf.replace(/>([^<]*)</g, (m, inner: string) => (re.lastIndex = 0, re.test(inner) ? (re.lastIndex = 0, `>${inner.replace(re, () => (counter.n++, REDACTED_TEXT))}<`) : m));
    if (counter.n > 0) {
      changed.set(c.packagePath, utf8(replaced));
      count(c.packagePath, counter.n);
    }
  }

  // 3. Binary files with a term, and media used only by redacted addresses: removed; embedding elements become placeholders.
  const stillUsed = new Set<string>();
  for (const [p] of c.files) {
    if (!isMain(p) || (types.get(p) !== XHTML_TYPE && types.get(p) !== 'image/svg+xml')) continue;
    for (const ref of embeddedReferences(getDoc(p).doc, p)) stillUsed.add(ref.target);
  }
  for (const p of orphanCandidates) if (!stillUsed.has(p) && c.files.has(p) && isMain(p)) removed.add(p);
  for (const p of binaryHits) removed.add(p);
  if (binaryHits.length > 0) {
    for (const [p] of c.files) {
      if (!isMain(p) || (types.get(p) !== XHTML_TYPE && types.get(p) !== 'image/svg+xml')) continue;
      const d = getDoc(p);
      for (const ref of embeddedReferences(d.doc, p)) {
        if (!binaryHits.includes(ref.target)) continue;
        const address = nearestAddress(p, ref.el.parentNode!);
        ref.el.parentNode!.replaceChild(placeholder(d.doc), ref.el);
        touch(address, p);
        touch(address, ref.target);
        count(p, 1);
      }
    }
  }
  for (const [p, d] of docs) {
    const out = serializeXml(d.doc, d.text);
    if (out !== d.text) changed.set(p, utf8(out));
  }

  // 4. Frozen versions containing redacted content (7.4).
  const renditionList = Array.isArray(newManifest.renditions) ? (newManifest.renditions as Json[]) : [];
  const report = c.files.has('META-INF/signatures.xml') ? await validateContainer(bytes, {}) : undefined;
  const sigsByRendition = new Map<string, string[]>();
  for (const s of report?.signatures ?? []) {
    const r = assignRendition(s.signedPaths);
    if (r) (sigsByRendition.get(r) ?? sigsByRendition.set(r, []).get(r)!).push(s.signatureId);
  }
  const removedRenditions: Array<{ id: string; signed: boolean; signatures: string[] }> = [];
  for (const r of renditionList) {
    const id = String(r.id);
    const prefix = `renditions/${id}/`;
    const files = new Map([...c.files].filter(([p]) => p.startsWith(prefix)));
    if (searchEntries(files, needles).length === 0) continue;
    removedRenditions.push({ id, signed: sigsByRendition.has(id), signatures: sigsByRendition.get(id) ?? [] });
  }
  const signedHit = removedRenditions.filter((r) => r.signed).map((r) => r.id);
  if (signedHit.length > 0 && !options.removeSignedRenditions) throw new RedactionNeedsConfirmation(signedHit);
  if (removedRenditions.length > 0) {
    const gone = new Set(removedRenditions.map((r) => r.id));
    newManifest = { ...newManifest, renditions: renditionList.filter((r) => !gone.has(String(r.id))) };
    if ((newManifest.renditions as Json[]).length === 0) delete newManifest.renditions;
    for (const [p] of c.files) for (const id of gone) if (p.startsWith(`renditions/${id}/`)) removed.add(p);
    const sigIds = removedRenditions.flatMap((r) => r.signatures);
    if (sigIds.length > 0) {
      const sigText = removeSignatures(fromUtf8(c.files.get('META-INF/signatures.xml')!), sigIds);
      if (/<([A-Za-z_][\w.-]*:)?Signature\b/.test(sigText)) {
        changed.set('META-INF/signatures.xml', utf8(sigText));
        const odf = c.files.get('META-INF/manifest.xml');
        if (odf) {
          let t = fromUtf8(odf);
          for (const p of removed) t = t.replace(new RegExp(`\\s*<manifest:file-entry\\b[^>]*full-path="${escapeRe(p)}"[^>]*/>`), '');
          changed.set('META-INF/manifest.xml', utf8(t));
        }
      } else {
        removed.add('META-INF/signatures.xml');
        removed.add('META-INF/manifest.xml');
      }
    }
  }
  for (const att of ['attachments', 'data'] as const) {
    if (Array.isArray(newManifest[att])) {
      newManifest = { ...newManifest, [att]: (newManifest[att] as Json[]).filter((a) => !removed.has(String(a.url))) };
      if ((newManifest[att] as Json[]).length === 0) delete newManifest[att];
    }
  }

  // 5. Log, manifest, write.
  const total = [...c.files.keys()].filter((p) => !removed.has(p)).length + (c.files.has(REDACTION_LOG) ? 0 : 1);
  const check = { method: 'Volltextsuche in allen Einträgen (UTF-8, Markup ohne Tags, JSON-Zeichenketten) und in der ZIP-Datei roh (UTF-8, UTF-16); ohne Groß-/Kleinschreibung', needles: [...new Set(needles)].length, entries: total, hits: 0 };
  const entries: RedactionLogEntry[] = [];
  const addresses = [...entryFiles.keys()].sort();
  // Terms and fragments are removed in the whole version, so every entry of this redaction names
  // all files it changed or removed in the main version (data, navigation, metadata included).
  const mainFiles = [...new Set([...changed.keys(), ...removed, ...[...entryFiles.values()].flatMap((x) => [...x])])]
    .filter((p) => (p === c.packagePath ? replacements[p] !== undefined : isMain(p)))
    .sort();
  for (const target of addresses) {
    entries.push({ target, at: options.at, ...(options.reason ? { reason: options.reason } : {}), ...(options.actor ? { actor: options.actor } : {}), files: mainFiles, check });
  }
  for (const r of removedRenditions) {
    entries.push({ target: `renditions/${r.id}/`, at: options.at, reason: `${options.reason ? options.reason + '; ' : ''}eingefrorene Fassung enthielt redigierten Inhalt und wurde entfernt${r.signed ? ` (Signatur ${r.signatures.join(', ')} entfällt)` : ''}`, ...(options.actor ? { actor: options.actor } : {}), check });
  }
  const oldLog: unknown[] = c.files.has(REDACTION_LOG) ? (JSON.parse(fromUtf8(c.files.get(REDACTION_LOG)!)) as unknown[]) : [];
  const history = Array.isArray(newManifest.history) ? [...(newManifest.history as Json[])] : [];
  history.push({
    version: history.length > 0 ? Math.max(...history.map((h) => Number(h.version) || 0)) + 1 : 1,
    dateModified: options.at,
    note: `Redaktion: ${addresses.length} Adresse(n)${removedRenditions.length ? `, ${removedRenditions.length} eingefrorene Fassung(en) entfernt` : ''}; Protokoll ${REDACTION_LOG}`,
    manifestIntegrity: await sriSha256(c.files.get('manifest.json')!),
  });
  newManifest = { ...newManifest, dateModified: options.at, history };
  const journaled = c.files.has(JOURNAL_PATH);
  const write = async () => {
    const logBytes = utf8(JSON.stringify([...oldLog, ...entries], null, 2) + '\n');
    const added = new Map<string, { data: Uint8Array; type: string }>();
    const changedNow = new Map(changed);
    if (c.files.has(REDACTION_LOG)) changedNow.set(REDACTION_LOG, logBytes);
    else added.set(REDACTION_LOG, { data: logBytes, type: 'application/json' });
    let bytes = await writeChangedContainer(c, newManifest, changedNow, added, removed, options.at);
    // The history journal is written anew from the redacted earlier versions (HP-LOCK-007: "Verlauf").
    if (journaled) bytes = await scrubHistory(c, bytes, { targets, needles, minFragment: options.minFragment ?? 10 });
    return bytes;
  };
  let out = await write();
  if (journaled) {
    // Blobs of the journal may come or go: the log names the entry count of the written file.
    const count = (await readZip(out)).filter((e) => !e.name.endsWith('/')).length;
    if (count !== check.entries) {
      check.entries = count;
      out = await write();
    }
  }
  if (c.files.has(REDACTION_LOG)) changed.set(REDACTION_LOG, new Uint8Array());

  // 6. Proof on the written bytes.
  const verify = await searchContainer(out, needles);
  if (verify.hits.length > 0) {
    const where = [...new Set(verify.hits.map((h) => `${h.entry} (${h.reading})`))].join(', ');
    throw new LockError('leak', `redacted content is still present after redaction in: ${where}; nothing was written`);
  }
  if (verify.entries !== check.entries) throw new LockError('invalid', `internal error: expected ${check.entries} entries, wrote ${verify.entries}`);
  const read = await readContainer(out);
  if (!read.integrity.ok) throw new LockError('invalid', 'internal error: redacted container does not verify');
  const invalidated = (report?.signatures ?? []).filter((s) => assignRendition(s.signedPaths) === null).map((s) => s.signatureId);
  return {
    bytes: out,
    entries,
    changedFiles: [...changed.keys()].filter((p) => !removed.has(p)).sort(),
    removedFiles: [...removed].sort(),
    removedRenditions,
    invalidatedSignatures: invalidated,
    replacements,
    check: { needles: check.needles, entries: verify.entries, hits: 0 },
  };
}
