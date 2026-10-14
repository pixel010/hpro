/**
 * Shared helpers for the S7 examples (implementer's guide and author's guide).
 *
 * `buildFromDir(dir)` is the "CMS path" of the handbook (chapter 9): a directory with content
 * files and a `dokument.json` (metadata, reading order, table of contents, optional manifest
 * additions) becomes a container through the reference implementation `@hpro/kern`.
 * Everything is deterministic (HP-CONT-014): fixed `dateModified`, sorted paths, same bytes.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const EXAMPLES_DIR = resolve(ROOT, 'docs', 'spezifikation', 'beispiele');
export const NS_URI = 'https://hpro.example/ns/v0';
export const PROFILE = (p) => `https://hpro.example/spec/0.1/profile/${p}`;
export const SUBSET_OFFICE_MIN = 'https://hpro.example/spec/0.1/subset/office-min';

/** Media types by file extension (HP-CONT-015). */
export const MEDIA_TYPES = {
  '.xhtml': 'application/xhtml+xml',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
  '.fodt': 'application/vnd.oasis.opendocument.text-flat-xml',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const utf8 = (text) => new TextEncoder().encode(text);
export const text = (bytes) => new TextDecoder().decode(bytes);

/** Loads the built reference implementation (`npm run build -w kern`). */
export async function kern() {
  try {
    return await import(resolve(ROOT, 'kern', 'dist', 'index.js'));
  } catch (err) {
    throw new Error(`kern/dist fehlt (npm run build -w kern): ${err.message}`);
  }
}

export function mediaTypeOf(path) {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  const t = MEDIA_TYPES[ext];
  if (!t) throw new Error(`kein Media-Type für ${path}`);
  return t;
}

/** All files below `dir`, container-relative with `/`, sorted. */
export function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(relative(base, p).split('\\').join('/'));
  }
  return out;
}

/**
 * Replaces `manifest.json` (and optionally other entries) in a container written by the core and
 * rewrites the ZIP with the same timestamp. The manifest itself is not hashed (HP-CONT-008), so
 * adding keys keeps every `integrity` value valid. `extra` entries are appended (sorted by name).
 * Like every write path of the core, the machine view of each version that has one is derived
 * again from the rewritten files, so that it does not go stale (part 0, HP-MACH-013).
 */
export async function rewriteContainer(bytes, { manifest, replace = {}, extra = {}, modified }) {
  const { readZip, writeZip, MANIFEST_PATH, machine } = await kern();
  let entries = (await readZip(bytes)).map((e) => {
    let data = e.data;
    if (e.name === MANIFEST_PATH && manifest) data = utf8(JSON.stringify(manifest, null, 2) + '\n');
    else if (replace[e.name] !== undefined) data = typeof replace[e.name] === 'string' ? utf8(replace[e.name]) : replace[e.name];
    return { name: e.name, data, compression: e.name === 'mimetype' ? 'store' : 'auto' };
  });
  for (const name of Object.keys(extra).sort()) {
    const v = extra[name];
    entries.push({ name, data: typeof v === 'string' ? utf8(v) : v, compression: 'auto' });
  }
  entries = await machine.refreshMachineViews(entries);
  return writeZip(entries, { modified: new Date(modified) });
}

/**
 * Builds a container from a source directory with `dokument.json`:
 *   id, title, language, modified, profile, creators, readingOrder, toc, accessibility,
 *   manifest (object merged into manifest.json after the core has written it; `components`
 *   entries get their `integrity` filled in).
 * Returns { bytes, manifest, sha256, files }.
 */
export async function buildFromDir(dir) {
  const { createContainer, readContainer, sriSha256 } = await kern();
  const doc = JSON.parse(readFileSync(join(dir, 'dokument.json'), 'utf8'));
  const resources = walk(dir)
    .filter((p) => p !== 'dokument.json')
    .map((path) => ({ path, mediaType: mediaTypeOf(path), data: readFileSync(join(dir, path)) }));
  const created = await createContainer({
    id: doc.id,
    title: doc.title,
    language: doc.language,
    modified: doc.modified,
    profile: doc.profile ?? 'static',
    creators: doc.creators ?? [],
    ...(doc.description ? { description: doc.description } : {}),
    readingOrder: doc.readingOrder,
    toc: doc.toc,
    resources,
    ...(doc.accessibility ? { accessibility: doc.accessibility } : {}),
  });
  let bytes = created.bytes;
  let manifest = created.manifest;
  if (doc.manifest) {
    const addition = structuredClone(doc.manifest);
    if (Array.isArray(addition.components)) {
      for (const c of addition.components) {
        const r = resources.find((x) => x.path === c.url);
        if (!r) throw new Error(`Komponente ${c.name}: Datei ${c.url} fehlt`);
        c.integrity = await sriSha256(r.data);
      }
    }
    manifest = { ...manifest, ...addition };
    bytes = await rewriteContainer(bytes, { manifest, modified: doc.modified });
  }
  // Read back like a foreign container: every hash must verify (HP-CONT-008/009).
  const back = await readContainer(bytes);
  if (!back.integrity.ok || back.integrity.unlisted.length > 0) throw new Error(`Rücklesen fehlgeschlagen: ${JSON.stringify(back.integrity)}`);
  // The manifest as written (rewriteContainer may have refreshed the machine view and its hash).
  return { bytes, manifest: back.manifest, sha256: sha256Hex(bytes), files: back.files, modified: doc.modified };
}
