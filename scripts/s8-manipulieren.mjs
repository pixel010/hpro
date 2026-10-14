#!/usr/bin/env node
/**
 * S8 evidence: changes one stored measurement in a signed report (content/index.xhtml, sample P07,
 * 1.100 → 11 KBE/100 ml) without re-signing, to show that the signature check detects it.
 *
 *   node scripts/s8-manipulieren.mjs <signiert.hpro> <manipuliert.hpro>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { readZip, writeZip } from '../kern/dist/index.js';

const [input, output] = process.argv.slice(2);
const entries = await readZip(readFileSync(input));
let changed = false;
const out = entries.map((e) => {
  if (e.name !== 'content/index.xhtml') return { name: e.name, data: e.data, compression: e.name === 'mimetype' ? 'store' : 'auto' };
  const before = new TextDecoder().decode(e.data);
  const after = before.replace('data-hp-value="1100">1.100<', 'data-hp-value="11">11<');
  changed = after !== before;
  return { name: e.name, data: new TextEncoder().encode(after), compression: 'auto' };
});
writeFileSync(output, await writeZip(out, { modified: new Date('2026-10-07T10:00:00Z') }));
console.log(`Messwert der Probe P07 in content/index.xhtml von 1.100 auf 11 KBE/100 ml geändert: ${changed}`);
process.exit(changed ? 0 : 1);
