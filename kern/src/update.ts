/**
 * Writing a changed container back: replaced and added files, a new manifest with updated
 * `integrity` values, `dcterms:modified` in package.opf. Shared by the calculator (P19) and the
 * document data channel of live content (P15, part 1 section 8.3 rule 5).
 */
import { utf8 } from './bytes.js';
import type { ReadContainer } from './container.js';
import { sriSha256 } from './hash.js';
import { writeZip, type ZipEntryInput } from './zip.js';

type Json = Record<string, unknown>;

/** Writes the entries of `c` back with replaced or added files and a new manifest. */
export async function rewrite(c: ReadContainer, replace: ReadonlyMap<string, Uint8Array>, manifest: Json, modified: string, add: ReadonlyMap<string, Uint8Array> = new Map()): Promise<Uint8Array> {
  const entries: ZipEntryInput[] = c.entries
    .filter((e) => !e.name.endsWith('/'))
    .map((e) => ({
      name: e.name,
      data: e.name === 'manifest.json' ? utf8(JSON.stringify(manifest, null, 2) + '\n') : (replace.get(e.name) ?? e.data),
      compression: e.name === 'mimetype' ? 'store' : 'auto',
    }));
  for (const [name, data] of [...add].sort(([a], [b]) => (a < b ? -1 : 1))) entries.push({ name, data, compression: 'auto' });
  return writeZip(entries, { modified: new Date(modified) });
}

/** Sets `dcterms:modified` in package.opf (must equal `dateModified`, HPR-CONT-…). */
export function opfWithModified(opf: string, modified: string): string {
  return opf.replace(/(<meta[^>]*property="dcterms:modified"[^>]*>)[^<]*(<\/meta>)/, `$1${modified}$2`);
}

/** New `integrity` values in `resources` for every changed file. */
export async function updateIntegrity(manifest: Json, changed: ReadonlyMap<string, Uint8Array>): Promise<Json> {
  const resources = await Promise.all(
    (manifest.resources as Array<Json & { url: string }>).map(async (r) => (changed.has(r.url) ? { ...r, integrity: await sriSha256(changed.get(r.url)!) } : r)),
  );
  return { ...manifest, resources };
}
