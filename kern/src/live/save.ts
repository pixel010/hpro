/**
 * Saving data written by components (part 1, section 8.3 rule 5): the changed files under
 * `data/` replace the old ones, `integrity`, `dateModified` and `dcterms:modified` are updated,
 * and a `history` entry names the changed files (HP-META-006).
 */
import { fromUtf8, utf8 } from '../bytes.js';
import { readContainer } from '../container.js';
import { sriSha256 } from '../hash.js';
import { opfWithModified, rewrite, updateIntegrity } from '../update.js';
import { DATA_PATH } from './channel.js';

export interface SaveDataOptions {
  /** New `dateModified`, `YYYY-MM-DDThh:mm:ssZ`. */
  readonly modified: string;
  readonly note?: string;
}

export async function saveDataChanges(bytes: Uint8Array, changes: ReadonlyMap<string, Uint8Array>, options: SaveDataOptions): Promise<Uint8Array> {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(options.modified)) throw new Error(`modified must be YYYY-MM-DDThh:mm:ssZ, got ${options.modified}`);
  const c = await readContainer(bytes);
  const old = JSON.parse(fromUtf8(c.files.get('manifest.json')!)) as Record<string, unknown>;
  const declared = new Set((Array.isArray(old['data']) ? (old['data'] as Array<Record<string, unknown>>) : []).map((d) => d['url']));
  for (const path of changes.keys()) {
    // Never anything outside data/ (8.3 rule 1), even if a caller passes it.
    if (!DATA_PATH.test(path) || !declared.has(path) || !c.files.has(path)) throw new Error(`${path} is not a declared data file of this container`);
  }
  const replace = new Map(changes);
  const opfText = fromUtf8(c.files.get(c.packagePath)!);
  replace.set(c.packagePath, utf8(opfWithModified(opfText, options.modified)));
  let manifest = await updateIntegrity({ ...old, dateModified: options.modified }, replace);
  const history = Array.isArray(old['history']) ? [...(old['history'] as Array<Record<string, unknown>>)] : [];
  history.push({
    version: history.length > 0 ? Math.max(...history.map((h) => Number(h['version']) || 0)) + 1 : 1,
    dateModified: options.modified,
    note: options.note ?? `Daten geändert: ${[...changes.keys()].join(', ')}`,
    manifestIntegrity: await sriSha256(c.files.get('manifest.json')!),
  });
  manifest = { ...manifest, history };
  return rewrite(c, replace, manifest, options.modified);
}
