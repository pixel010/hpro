#!/usr/bin/env node
/**
 * Builds the form example of package P6 (docs/spezifikation/beispiele/p6-antrag/) as a container:
 * node scripts/p6-beispiel.mjs <out.hpro> [--write-data]
 *
 * The data file data/antrag.json of the blank form is what the core computes from the markup
 * (status draft, empty values as null, calculated fields as calculated); with --write-data it is
 * written into the source directory, otherwise the script fails when the stored file differs.
 * Uses kern/dist (npm run build -w kern).
 */
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { createContainer, form, readContainer } from '../kern/dist/index.js';

const DIR = fileURLToPath(new URL('../docs/spezifikation/beispiele/p6-antrag/', import.meta.url));
const TYPES = { '.xhtml': 'application/xhtml+xml', '.css': 'text/css', '.json': 'application/json' };

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    if ((await stat(full)).isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

export async function blankData(doc) {
  const xhtml = await readFile(join(DIR, 'content/index.xhtml'), 'utf8');
  const dom = new DOMParser().parseFromString(xhtml, 'application/xhtml+xml');
  const fd = new form.FormDocument(dom, { documentId: doc.id });
  return `${JSON.stringify(fd.data('antrag', 'draft'), null, 2)}\n`;
}

export async function buildFormExample({ writeData = false } = {}) {
  const doc = JSON.parse(await readFile(join(DIR, 'dokument.json'), 'utf8'));
  const blank = await blankData(doc);
  const dataPath = join(DIR, 'data/antrag.json');
  const stored = await readFile(dataPath, 'utf8').catch(() => null);
  if (writeData) await writeFile(dataPath, blank);
  else if (stored !== blank) throw new Error('data/antrag.json differs from the blank form computed by the core; run with --write-data');
  const files = (await walk(DIR)).map((f) => relative(DIR, f).split('\\').join('/')).filter((p) => p !== 'dokument.json');
  const resources = await Promise.all(
    files.sort().map(async (path) => ({ path, mediaType: TYPES[path.slice(path.lastIndexOf('.'))], data: new Uint8Array(await readFile(join(DIR, path))) })),
  );
  const created = await createContainer({ ...doc, resources });
  return created.bytes;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2];
  if (!out) {
    console.error('usage: node scripts/p6-beispiel.mjs <out.hpro> [--write-data]');
    process.exit(2);
  }
  const bytes = await buildFormExample({ writeData: process.argv.includes('--write-data') });
  await writeFile(out, bytes);
  const c = await readContainer(bytes);
  console.log(`${out}: ${bytes.length} Bytes, ${c.entries.length} Einträge, integrity ok=${c.integrity.ok}`);
}
