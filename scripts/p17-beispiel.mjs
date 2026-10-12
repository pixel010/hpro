#!/usr/bin/env node
/**
 * Builds the P17 example (docs/spezifikation/beispiele/p17-sperren/) with the reference
 * implementation: `node scripts/p17-beispiel.mjs <out.hpro>`. Locks (`access`) and the data
 * file come from dokument.json; the result is deterministic (fixed `modified`).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXAMPLES_DIR, kern, mediaTypeOf, sha256Hex, walk } from './s7-lib.mjs';
import { readFileSync } from 'node:fs';

const out = process.argv[2];
if (!out) {
  console.error('usage: node scripts/p17-beispiel.mjs <out.hpro>');
  process.exit(2);
}
const dir = join(EXAMPLES_DIR, 'p17-sperren');
const { createContainer } = await kern();
const doc = JSON.parse(readFileSync(join(dir, 'dokument.json'), 'utf8'));
const resources = walk(dir)
  .filter((p) => p !== 'dokument.json')
  .map((path) => ({ path, mediaType: mediaTypeOf(path), data: readFileSync(join(dir, path)) }));
const created = await createContainer({ ...doc, resources });
writeFileSync(out, created.bytes);
console.log(`${out}  ${created.bytes.length} bytes  sha256=${sha256Hex(created.bytes)}`);
console.log(`access: ${created.manifest.access.map((a) => `${a.target} [${a.rules.join(', ')}]`).join('; ')}`);
