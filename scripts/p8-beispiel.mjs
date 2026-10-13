#!/usr/bin/env node
/**
 * Builds the P8 test document (deliberately faulty in seven accessibility categories) (docs/spezifikation/beispiele/p8-barrierefreiheit/) with the reference
 * implementation: `node scripts/p8-beispiel.mjs <out.hpro>`. Deterministic (fixed `modified`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXAMPLES_DIR, kern, mediaTypeOf, sha256Hex, walk } from './s7-lib.mjs';

const out = process.argv[2];
if (!out) {
  console.error('usage: node scripts/p8-beispiel.mjs <out.hpro>');
  process.exit(2);
}
const dir = join(EXAMPLES_DIR, 'p8-barrierefreiheit');
const { createContainer } = await kern();
const doc = JSON.parse(readFileSync(join(dir, 'dokument.json'), 'utf8'));
const resources = walk(dir)
  .filter((p) => p !== 'dokument.json')
  .map((path) => ({ path, mediaType: mediaTypeOf(path), data: readFileSync(join(dir, path)) }));
const created = await createContainer({ ...doc, resources });
writeFileSync(out, created.bytes);
console.log(`${out}  ${created.bytes.length} bytes  sha256=${sha256Hex(created.bytes)}`);
console.log(`entries: ${created.readBack.entries.map((e) => e.name).join(', ')}`);
