/**
 * Builds the sample container from app/sample/ with the core (createContainer). Used by the
 * build (vite.config.ts emits it as beispiel.hpro) and therefore by the end-to-end tests.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SoftwareKeySigner, calc, createContainer, createTestIdentity, signContainer, type DocumentInput } from '../../kern/src/index.ts';

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

/** Source of the calculating sample (package P19): the example of part 3 in the specification. */
export const CALC_SAMPLE_DIR = fileURLToPath(new URL('../../docs/spezifikation/beispiele/p19-kostenschaetzung/', import.meta.url));
export const CALC_RENDITION = 'nachweis-2026-10-12';

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    if ((await stat(full)).isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/**
 * `kostenschaetzung.hpro`: the cost estimate with formulas (main version, calculates in the
 * reader) plus a frozen rendition signed with a TEST key made at build time (HPF-FRZ-001/005).
 * The key is not kept; the reader checks the signature without trust anchor.
 */
export async function buildCalcSample(): Promise<Uint8Array> {
  const doc = JSON.parse(await readFile(join(CALC_SAMPLE_DIR, 'dokument.json'), 'utf8')) as Omit<DocumentInput, 'resources'>;
  const files = (await walk(CALC_SAMPLE_DIR)).map((f) => relative(CALC_SAMPLE_DIR, f).split('\\').join('/')).filter((p) => p !== 'dokument.json');
  const resources = await Promise.all(
    files.map(async (path) => ({ path, mediaType: path.endsWith('.xhtml') ? 'application/xhtml+xml' : 'text/css', data: new Uint8Array(await readFile(join(CALC_SAMPLE_DIR, path))) })),
  );
  const created = await createContainer({ ...doc, resources });
  const frozen = await calc.freezeContainer(created.bytes, { id: CALC_RENDITION, createdAt: '2026-10-12T10:05:00Z', profile: 'signed' });
  const id = await createTestIdentity({ algorithm: 'EC-P256', commonName: 'hpro Beispiel (Testschlüssel)' });
  const signer = await SoftwareKeySigner.fromPkcs8(id.pkcs8, { certificateChain: [id.certificate] });
  const signed = await signContainer(frozen.bytes, { signer, signingTime: new Date('2026-10-12T10:06:00Z'), signatureId: 'sig-nachweis', paths: [...frozen.files] });
  return signed.bytes;
}
