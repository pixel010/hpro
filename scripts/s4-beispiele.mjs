#!/usr/bin/env node
/**
 * Builds the two example containers of Teil 2 (docs/spezifikation/02-lizenz-und-governance.md,
 * Abschnitt 7): a valid and a deliberately invalid third-party extension.
 *
 * Sources: docs/spezifikation/beispiele/s4-erweiterung-{gueltig,ungueltig}/
 *   content/**            content documents and stylesheets
 *   ext/<kennung>/**      extension files
 *   manifest-ergaenzung.json  keys merged into manifest.json after the core has written it
 *
 * The core (@html-pro/kern) writes the container; manifest.json is then extended with the
 * `extensions` declaration and the third-party keys, and the ZIP is rewritten with the same
 * timestamp, so two builds are byte-identical (HP-CONT-014).
 *
 * Usage: node scripts/s4-beispiele.mjs [outdir]   (default docs/belege/S4/container)
 *        import { buildExample, EXAMPLES } from './s4-beispiele.mjs'
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SOURCES = resolve(ROOT, 'docs', 'spezifikation', 'beispiele');

export const EXAMPLES = {
  gueltig: {
    dir: 's4-erweiterung-gueltig',
    id: 'urn:uuid:7c1e2f3a-4b5c-4d0e-9a2b-5b0c3f9e1b7a',
    title: 'Kostenschätzung mit Drittanbieter-Erweiterung „kalk“ (gültig)',
  },
  ungueltig: {
    dir: 's4-erweiterung-ungueltig',
    id: 'urn:uuid:9a2b7c1e-2f3a-4b5c-8d0e-3f9e1b7a5b0c',
    title: 'Kostenschätzung mit Drittanbieter-Erweiterung (absichtlich ungültig)',
  },
};

const MEDIA_TYPES = {
  '.xhtml': 'application/xhtml+xml',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.png': 'image/png',
};

async function kern() {
  try {
    return await import(resolve(ROOT, 'kern', 'dist', 'index.js'));
  } catch (err) {
    throw new Error(`kern/dist fehlt (npm run build -w kern): ${err.message}`);
  }
}

function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(relative(base, p).split('\\').join('/'));
  }
  return out;
}

/** Returns { name, bytes, manifest, sha256 } for one example. */
export async function buildExample(key) {
  const ex = EXAMPLES[key];
  if (!ex) throw new Error(`unbekanntes Beispiel ${key}`);
  const { createContainer, readZip, writeZip, MANIFEST_PATH } = await kern();
  const src = resolve(SOURCES, ex.dir);
  const resources = walk(src)
    .filter((p) => p !== 'manifest-ergaenzung.json')
    .map((path) => {
      const ext = path.slice(path.lastIndexOf('.'));
      const mediaType = MEDIA_TYPES[ext];
      if (!mediaType) throw new Error(`kein Media-Type für ${path}`);
      return { path, mediaType, data: readFileSync(join(src, path)) };
    });
  const modified = '2026-10-11T00:00:00Z';
  const created = await createContainer({
    id: ex.id,
    title: ex.title,
    language: 'de-AT',
    modified,
    profile: 'static',
    creators: ['html-Pro Beispiel S4'],
    readingOrder: ['content/index.xhtml'],
    toc: { title: 'Inhalt', entries: [{ title: 'Kostenschätzung Dachsanierung', href: 'content/index.xhtml#k1' }] },
    resources,
  });
  // Merge the third-party keys into manifest.json (the manifest itself is not hashed, HP-CONT-008).
  const addition = JSON.parse(readFileSync(join(src, 'manifest-ergaenzung.json'), 'utf8'));
  const manifest = { ...created.manifest, ...addition };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2) + '\n');
  const entries = (await readZip(created.bytes)).map((e) => ({
    name: e.name,
    data: e.name === MANIFEST_PATH ? manifestBytes : e.data,
    compression: e.name === 'mimetype' ? 'store' : 'auto',
  }));
  const bytes = await writeZip(entries, { modified: new Date(modified) });
  return { name: `${ex.dir}.hpro`, bytes, manifest, sha256: createHash('sha256').update(bytes).digest('hex') };
}

export async function buildAll() {
  const out = {};
  for (const key of Object.keys(EXAMPLES)) out[key] = await buildExample(key);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = resolve(process.argv[2] ?? resolve(ROOT, 'docs', 'belege', 'S4', 'container'));
  mkdirSync(outDir, { recursive: true });
  const built = await buildAll();
  for (const [key, b] of Object.entries(built)) {
    const file = join(outDir, b.name);
    writeFileSync(file, b.bytes);
    console.log(`${key.padEnd(10)} ${file}  ${b.bytes.length} bytes  sha256=${b.sha256}`);
  }
}
