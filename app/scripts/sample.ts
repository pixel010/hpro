/**
 * Builds the sample container from app/sample/ with the core (createContainer). Used by the
 * build (vite.config.ts emits it as beispiel.hpro) and therefore by the end-to-end tests.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createContainer, type DocumentInput } from '../../kern/src/index.ts';

export const SAMPLE_DIR = fileURLToPath(new URL('../sample/', import.meta.url));

interface SampleDescription extends Omit<DocumentInput, 'resources'> {
  readonly resources: ReadonlyArray<{ readonly path: string; readonly mediaType: string }>;
}

export async function buildSample(): Promise<Uint8Array> {
  const description = JSON.parse(await readFile(`${SAMPLE_DIR}beispiel.json`, 'utf8')) as SampleDescription;
  const resources = await Promise.all(
    description.resources.map(async (r) => ({ path: r.path, mediaType: r.mediaType, data: new Uint8Array(await readFile(`${SAMPLE_DIR}${r.path}`)) })),
  );
  const created = await createContainer({ ...description, resources });
  return created.bytes;
}
