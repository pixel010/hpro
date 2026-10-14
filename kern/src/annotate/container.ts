/**
 * Annotations in the container: reading them with their status of protection, and writing
 * changes (package P7, HPC-0010).
 *
 * Where a new annotation file goes depends on whether a signature covers the main manifest:
 *
 *   listed    (no signature over `manifest.json`): the file gets a `resources` entry with its
 *             `integrity` (HP-CONT-008) and an `item` in package.opf (EPUB), `dateModified` and a
 *             `history` entry are written and the history journal is continued (HPC-0008), like
 *             every other writer of the container. The annotation is then protected by the hash
 *             manifest and by any later signature.
 *   unlisted  (a signature covers `manifest.json`): only the file is added; manifest and
 *             package.opf stay byte-identical, so the signature stays valid and the file is shown
 *             as "nicht signiert" (HP-RS-011, HP-SIG-013). The conformance checker reports such
 *             files as unlisted (HPR-CONT-017/008) — the open conflict HPC-0010 resolves.
 *
 * Files covered by a signature are never changed or removed (the signature would break);
 * because status changes are replies (model.ts), a signed annotation can still be answered and
 * marked as resolved.
 */
import { fromUtf8, utf8 } from '../bytes.js';
import { readContainer, type ReadContainer } from '../container.js';
import { continueJournal } from '../edit/journal.js';
import { sriSha256 } from '../hash.js';
import { escapeXml } from '../ocf.js';
import { opfWithModified } from '../update.js';
import { writeZip, type ZipEntryInput } from '../zip.js';
import { refreshMachineViews } from '../machine/container.js';
import { DocumentIndex, resolveAnchor, type Anchor } from './anchor.js';
import {
  ANNOTATION_MEDIA_TYPE,
  ANNOTATIONS_DIR,
  AnnotationError,
  CONTEXT,
  describe,
  fileOf,
  isUtc,
  threadsOf,
  validateAnnotation,
  type AnnotationInfo,
  type Json,
  type Thread,
  type WebAnnotation,
} from './model.js';

export type SaveMode = 'listed' | 'unlisted';

export interface StoredAnnotation {
  readonly path: string;
  readonly json: WebAnnotation;
  readonly info: AnnotationInfo;
  /** Listed in `manifest.json#resources`. */
  readonly listed: boolean;
  /** Referenced by a signature in META-INF/signatures.xml. */
  readonly signed: boolean;
  /** Hash check of a listed file; `unlisted` for files the manifest does not name. */
  readonly integrity: 'ok' | 'mismatch' | 'unlisted';
  /** Anchor in the documents of this container (roots only). */
  readonly anchor?: Anchor;
}

export interface AnnotationProblem {
  readonly path: string;
  readonly message: string;
}

export interface AnnotationSet {
  readonly items: readonly StoredAnnotation[];
  readonly threads: readonly Thread[];
  /** Replies whose thread root is missing. */
  readonly orphans: readonly AnnotationInfo[];
  /** Files under annotations/ that are not readable annotations; they are kept, never shown. */
  readonly problems: readonly AnnotationProblem[];
  /** How a change would be written (see header). */
  readonly mode: SaveMode;
}

/** Container paths referenced by `ds:Reference/@URI` in META-INF/signatures.xml. */
export function signedPaths(files: ReadonlyMap<string, Uint8Array>): Set<string> {
  const xml = files.get('META-INF/signatures.xml');
  const out = new Set<string>();
  if (!xml) return out;
  for (const m of fromUtf8(xml).matchAll(/<(?:[A-Za-z_][\w.-]*:)?Reference\b[^>]*\bURI="([^"#][^"]*)"/g)) {
    let uri = m[1]!.replace(/&amp;/g, '&');
    try {
      uri = decodeURIComponent(uri);
    } catch {
      /* keep */
    }
    out.add(uri);
  }
  return out;
}

export function saveModeOf(files: ReadonlyMap<string, Uint8Array>): SaveMode {
  return signedPaths(files).has('manifest.json') ? 'unlisted' : 'listed';
}

function parseFile(path: string, data: Uint8Array): { json: WebAnnotation } | { problem: string } {
  let value: unknown;
  try {
    value = JSON.parse(fromUtf8(data));
  } catch (e) {
    return { problem: `kein JSON: ${(e as Error).message}` };
  }
  const problems = validateAnnotation(value);
  if (problems.length > 0) return { problem: problems.join('; ') };
  const json = value as WebAnnotation;
  if (!('@context' in json)) return { problem: '@context fehlt (eine einzelne Anmerkung braucht ihn)' };
  if (fileOf(json.id) !== path) return { problem: `Dateiname passt nicht zur Kennung ${json.id} (erwartet ${fileOf(json.id)})` };
  return { json };
}

/** Reads the annotations of a container; with `anchors` also where each root belongs. */
export async function readAnnotations(input: Uint8Array | ReadContainer, options: { anchors?: boolean } = {}): Promise<AnnotationSet> {
  const c = input instanceof Uint8Array ? await readContainer(input) : input;
  const listed = new Map(c.integrity.resources.map((r) => [r.path, r.status]));
  const signed = signedPaths(c.files);
  const index = options.anchors === false ? undefined : new DocumentIndex(c.files);
  const items: StoredAnnotation[] = [];
  const problems: AnnotationProblem[] = [];
  for (const [path, data] of [...c.files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!path.startsWith(ANNOTATIONS_DIR) || path.endsWith('/')) continue;
    if (!path.endsWith('.jsonld')) {
      problems.push({ path, message: 'keine Anmerkungsdatei (.jsonld erwartet)' });
      continue;
    }
    const r = parseFile(path, data);
    if ('problem' in r) {
      problems.push({ path, message: r.problem });
      continue;
    }
    const status = listed.get(path);
    const info = describe(r.json);
    items.push({
      path,
      json: r.json,
      info,
      listed: status !== undefined,
      signed: signed.has(path),
      integrity: status === undefined ? 'unlisted' : status === 'ok' ? 'ok' : 'mismatch',
      ...(index && info.kind !== 'reply' ? { anchor: resolveAnchor(info, index) } : {}),
    });
  }
  const { threads, orphans } = threadsOf(items.map((i) => i.info));
  return { items, threads, orphans, problems, mode: saveModeOf(c.files) };
}

export interface AnnotationChanges {
  readonly add?: readonly WebAnnotation[];
  /** Annotations with an existing id and new content (an edited comment). */
  readonly replace?: readonly WebAnnotation[];
  /** Ids to delete; their replies go with them. */
  readonly remove?: readonly string[];
}

export interface SaveAnnotationsOptions {
  /** New `dateModified`, `YYYY-MM-DDThh:mm:ssZ` (listed mode). */
  readonly modified: string;
  readonly note?: string;
  /**
   * Which anchors new annotations may have: `exact` (default: what a client creates on the
   * current text), `moved` or `any` (taken over from another copy whose text has changed since;
   * an orphaned one is listed but not marked in the text).
   */
  readonly accept?: 'exact' | 'moved' | 'any';
}

export interface SaveAnnotationsResult {
  readonly bytes: Uint8Array;
  readonly mode: SaveMode;
  readonly added: readonly string[];
  readonly replaced: readonly string[];
  readonly removed: readonly string[];
}

const serialize = (a: WebAnnotation) => utf8(JSON.stringify(a, null, 2) + '\n');

function opfItems(opf: string, added: readonly string[], removed: ReadonlySet<string>): string {
  let out = opf;
  for (const p of removed) out = out.replace(new RegExp(`\\s*<item\\b[^>]*\\bhref="${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`), '');
  const ids = new Set([...out.matchAll(/<item\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]));
  const hrefs = new Set([...out.matchAll(/<item\b[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]));
  const items: string[] = [];
  for (const p of [...added].sort()) {
    if (hrefs.has(p)) continue;
    const base = `anno-${p.slice(ANNOTATIONS_DIR.length, ANNOTATIONS_DIR.length + 8)}`;
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    items.push(`    <item id="${id}" href="${escapeXml(p)}" media-type="${ANNOTATION_MEDIA_TYPE}"/>`);
  }
  if (items.length === 0) return out;
  const close = out.lastIndexOf('</manifest>');
  if (close < 0) throw new AnnotationError('package.opf has no </manifest>');
  const lineStart = out.lastIndexOf('\n', close) + 1;
  return out.slice(0, lineStart) + items.join('\n') + '\n' + out.slice(lineStart);
}

function noteOf(added: number, replaced: number, removed: number, kinds: readonly AnnotationInfo[]): string {
  const parts: string[] = [];
  const replies = kinds.filter((k) => k.kind === 'reply');
  const resolved = replies.filter((r) => r.status === 'resolved').length;
  const reopened = replies.filter((r) => r.status === 'open').length;
  const roots = added - replies.length;
  if (roots > 0) parts.push(`${roots} neu`);
  if (replies.length - resolved - reopened > 0) parts.push(`${replies.length - resolved - reopened} ${replies.length - resolved - reopened === 1 ? 'Antwort' : 'Antworten'}`);
  if (resolved > 0) parts.push(`${resolved} erledigt`);
  if (reopened > 0) parts.push(`${reopened} wieder geöffnet`);
  if (replaced > 0) parts.push(`${replaced} geändert`);
  if (removed > 0) parts.push(`${removed} gelöscht`);
  return `Anmerkungen: ${parts.join(', ') || 'unverändert'}`;
}

/**
 * Writes added, replaced and removed annotations into the container (see the header for the two
 * modes). New annotations must be valid, their ids new, their target element must exist and a
 * quote must stand where it says (`allowMoved` relaxes the last point); replies need an existing
 * annotation. Throws `AnnotationError` and writes nothing on the first problem.
 */
export async function saveAnnotations(bytes: Uint8Array, changes: AnnotationChanges, options: SaveAnnotationsOptions): Promise<SaveAnnotationsResult> {
  if (!isUtc(options.modified) || options.modified.includes('.')) throw new AnnotationError(`modified must be YYYY-MM-DDThh:mm:ssZ, got ${options.modified}`);
  const c = await readContainer(bytes);
  const before = await readAnnotations(c, { anchors: false });
  const existing = new Map(before.items.map((i) => [i.info.id, i]));
  const mode = before.mode;
  const index = new DocumentIndex(c.files);
  const add = changes.add ?? [];
  const replace = changes.replace ?? [];
  const removeIds = new Set(changes.remove ?? []);
  if (add.length + replace.length + removeIds.size === 0) throw new AnnotationError('nothing to save');

  const check = (a: WebAnnotation, what: string) => {
    const problems = validateAnnotation(a);
    if (problems.length > 0) throw new AnnotationError(`${what} ${String(a.id)}: ${problems.join('; ')}`);
    const info = describe(a);
    if (info.kind !== 'reply') {
      const anchor = resolveAnchor(info, index);
      const accept = options.accept ?? 'exact';
      if ((anchor.state === 'orphaned' && accept !== 'any') || (anchor.state === 'moved' && accept === 'exact')) throw new AnnotationError(`${what} ${a.id}: ${anchor.reason ?? 'Text steht nicht an der angegebenen Stelle'} (${info.path}#${info.elementId})`);
    }
    return info;
  };

  // Removal cascades to every reply below a removed annotation.
  for (const id of removeIds) if (!existing.has(id)) throw new AnnotationError(`remove: no annotation ${id}`);
  let grew = true;
  while (grew) {
    grew = false;
    for (const i of before.items) if (i.info.kind === 'reply' && removeIds.has(i.info.replyTo!) && !removeIds.has(i.info.id)) (removeIds.add(i.info.id), (grew = true));
  }
  const removedPaths = new Set<string>();
  for (const id of removeIds) {
    const s = existing.get(id)!;
    if (s.signed) throw new AnnotationError(`remove: ${s.path} is covered by a signature and cannot be deleted`);
    removedPaths.add(s.path);
  }
  const written = new Map<string, Uint8Array>();
  const addedInfos: AnnotationInfo[] = [];
  const replaced: string[] = [];
  for (const a of replace) {
    const s = existing.get(a.id);
    if (!s) throw new AnnotationError(`replace: no annotation ${a.id}`);
    if (removeIds.has(a.id)) throw new AnnotationError(`replace: ${a.id} is also removed`);
    if (s.signed) throw new AnnotationError(`replace: ${s.path} is covered by a signature and cannot be changed`);
    const info = check(a, 'replace');
    if (info.kind !== s.info.kind || (info.kind === 'reply' && info.replyTo !== s.info.replyTo)) throw new AnnotationError(`replace: ${a.id} must keep its kind and target`);
    written.set(s.path, serialize(a));
    replaced.push(s.path);
  }
  const newIds = new Set<string>();
  for (const a of add) {
    if (existing.has(a.id) || newIds.has(a.id)) throw new AnnotationError(`add: id ${a.id} exists already`);
    newIds.add(a.id);
  }
  const known = (id: string) => (existing.has(id) && !removeIds.has(id)) || newIds.has(id);
  const added: string[] = [];
  for (const a of add) {
    const info = check(a, 'add');
    if (info.kind === 'reply' && !known(info.replyTo!)) throw new AnnotationError(`add: reply ${a.id} answers ${info.replyTo}, which does not exist`);
    const path = fileOf(a.id);
    if (c.files.has(path)) throw new AnnotationError(`add: ${path} exists already`);
    written.set(path, serialize({ '@context': a['@context'] ?? CONTEXT, ...a } as WebAnnotation));
    added.push(path);
    addedInfos.push(info);
  }

  let manifestBytes = c.files.get('manifest.json')!;
  let opfBytes = c.files.get(c.packagePath)!;
  if (mode === 'listed') {
    const old = JSON.parse(fromUtf8(manifestBytes)) as Json;
    const prev = typeof old.dateModified === 'string' ? Date.parse(old.dateModified) : NaN;
    if (!Number.isNaN(prev) && Date.parse(options.modified) < prev) throw new AnnotationError(`modified ${options.modified} liegt vor dateModified ${String(old.dateModified)}`);
    const resources: Json[] = [];
    for (const r of old.resources as Json[]) {
      const url = String(r.url);
      if (removedPaths.has(url)) continue;
      resources.push(written.has(url) ? { ...r, integrity: await sriSha256(written.get(url)!) } : r);
    }
    for (const p of added) resources.push({ url: p, type: ANNOTATION_MEDIA_TYPE, integrity: await sriSha256(written.get(p)!) });
    resources.sort((a, b) => (String(a.url) < String(b.url) ? -1 : String(a.url) > String(b.url) ? 1 : 0));
    opfBytes = utf8(opfWithModified(opfItems(fromUtf8(opfBytes), added, removedPaths), options.modified));
    // package.opf is a listed resource too.
    const opfIndex = resources.findIndex((r) => r.url === c.packagePath);
    if (opfIndex >= 0) resources[opfIndex] = { ...resources[opfIndex], integrity: await sriSha256(opfBytes) };
    const history = Array.isArray(old.history) ? [...(old.history as Json[])] : [];
    history.push({
      version: history.length > 0 ? Math.max(...history.map((h) => Number(h.version) || 0)) + 1 : 1,
      dateModified: options.modified,
      note: options.note ?? noteOf(added.length, replaced.length, removedPaths.size, addedInfos),
      manifestIntegrity: await sriSha256(manifestBytes),
    });
    manifestBytes = utf8(JSON.stringify({ ...old, resources, dateModified: options.modified, history }, null, 2) + '\n');
  }

  const entries: ZipEntryInput[] = c.entries
    .filter((e) => !e.name.endsWith('/') && !removedPaths.has(e.name))
    .map((e) => ({
      name: e.name,
      data: e.name === 'manifest.json' ? manifestBytes : e.name === c.packagePath ? opfBytes : (written.get(e.name) ?? e.data),
      compression: e.name === 'mimetype' ? 'store' : 'auto',
    }));
  for (const p of [...added].sort()) entries.push({ name: p, data: written.get(p)!, compression: 'auto' });
  // Unlisted: manifest.json (and its dateModified) must stay as signed, so the ZIP timestamps keep
  // following dateModified (HPR-CONT-025); the save time is in the annotation itself (`created`).
  const signedTime = mode === 'unlisted' ? (JSON.parse(fromUtf8(manifestBytes)) as Json).dateModified : undefined;
  const zipTime = typeof signedTime === 'string' && isUtc(signedTime) ? signedTime : options.modified;
  let out: Uint8Array = await writeZip(mode === 'listed' ? await refreshMachineViews(entries) : entries, { modified: new Date(zipTime) });
  if (mode === 'listed') out = await continueJournal(c, out);
  return { bytes: out, mode, added, replaced, removed: [...removedPaths].sort() };
}
