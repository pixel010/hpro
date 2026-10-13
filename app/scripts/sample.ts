/**
 * Builds the sample container from app/sample/ with the core (createContainer). Used by the
 * build (vite.config.ts emits it as beispiel.hpro) and therefore by the end-to-end tests.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SoftwareKeySigner, annotate, calc, createContainer, createTestIdentity, edit, lock, readContainer, signContainer, type DocumentInput } from '../../kern/src/index.ts';

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
  // The corrected validity start matters: the certificate is made anew on every build, and its
  // default notBefore is "now". The sample signs with a fixed time, so a build after 10:06 UTC
  // produced a certificate that was not yet valid at the signing time and the build failed
  // (HP-SIG-004). A fixed notBefore keeps the sample buildable at any hour.
  const id = await createTestIdentity({ algorithm: 'EC-P256', commonName: 'hpro Beispiel (Testschlüssel)', notBefore: new Date('2026-10-12T00:00:00Z') });
  const signer = await SoftwareKeySigner.fromPkcs8(id.pkcs8, { certificateChain: [id.certificate] });
  const signed = await signContainer(frozen.bytes, { signer, signingTime: new Date('2026-10-12T10:06:00Z'), signatureId: 'sig-nachweis', paths: [...frozen.files] });
  return signed.bytes;
}

/** Source of the live sample (package P15): video, animation, sound and the component hp-chart. */
export const LIVE_SAMPLE_DIR = fileURLToPath(new URL('../../docs/spezifikation/beispiele/p15-lebendig/', import.meta.url));

const LIVE_TYPES: Record<string, string> = {
  xhtml: 'application/xhtml+xml',
  css: 'text/css',
  svg: 'image/svg+xml',
  png: 'image/png',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  json: 'application/json',
  js: 'text/javascript',
};

/**
 * `lebendig.hpro`: profile `interactive` with one declared component and one data file; the
 * core fills in the component hash and checks the declarations (HP-SBX-001, HP-SBX-008).
 */
export async function buildLiveSample(): Promise<Uint8Array> {
  const doc = JSON.parse(await readFile(join(LIVE_SAMPLE_DIR, 'dokument.json'), 'utf8')) as Omit<DocumentInput, 'resources'>;
  const files = (await walk(LIVE_SAMPLE_DIR)).map((f) => relative(LIVE_SAMPLE_DIR, f).split('\\').join('/')).filter((p) => p !== 'dokument.json').sort();
  const resources = await Promise.all(
    files.map(async (path) => {
      const type = LIVE_TYPES[path.slice(path.lastIndexOf('.') + 1)];
      if (!type) throw new Error(`no media type for ${path}`);
      return { path, mediaType: type, data: new Uint8Array(await readFile(join(LIVE_SAMPLE_DIR, path))) };
    }),
  );
  return (await createContainer({ ...doc, resources })).bytes;
}

/** Source of the lock sample (package P17): procurement memo with locks, a sealed section and personal data. */
export const LOCK_SAMPLE_DIR = fileURLToPath(new URL('../../docs/spezifikation/beispiele/p17-sperren/', import.meta.url));
export const LOCK_RENDITION = 'nachweis-2026-10-12';
/** Demo password of the sealed section in `sperren.hpro` (published on purpose: it is a sample). */
export const LOCK_SAMPLE_PASSWORD = 'Bauamt-Beispielort-2026!';
const LOCK_TYPES: Record<string, string> = { xhtml: 'application/xhtml+xml', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', json: 'application/json' };

/**
 * `sperren.hpro`: the P17 example with read-only, no-print/no-export and hidden sections; the
 * section #bewertung sealed for the demo password; a frozen version signed with a TEST key made
 * at build time (fixed validity start, as in buildCalcSample). The key is not kept.
 */
export async function buildLockSample(): Promise<Uint8Array> {
  const doc = JSON.parse(await readFile(join(LOCK_SAMPLE_DIR, 'dokument.json'), 'utf8')) as Omit<DocumentInput, 'resources'>;
  const files = (await walk(LOCK_SAMPLE_DIR)).map((f) => relative(LOCK_SAMPLE_DIR, f).split('\\').join('/')).filter((p) => p !== 'dokument.json');
  const resources = await Promise.all(files.map(async (path) => ({ path, mediaType: LOCK_TYPES[path.split('.').pop()!]!, data: new Uint8Array(await readFile(join(LOCK_SAMPLE_DIR, path))) })));
  const created = await createContainer({ ...doc, resources });
  // The link text in #anlagen names a heading of the section to be sealed; the author rewords it first.
  const reworded = await lock.editText(created.bytes, { target: 'content/index.xhtml#anlagen-hinweis', text: 'Ansprechperson und Bewertung stehen in den Abschnitten oben.', modified: '2026-10-12T08:30:00Z', replaceMarkup: true });
  const sealed = await lock.sealSection(reworded, { target: 'content/index.xhtml#bewertung', modified: '2026-10-12T09:00:00Z', recipients: [{ password: LOCK_SAMPLE_PASSWORD }] });
  const id = await createTestIdentity({ algorithm: 'EC-P256', commonName: 'Bauamt Beispielort (Testschlüssel)', notBefore: new Date('2026-10-01T00:00:00Z') });
  const signer = await SoftwareKeySigner.fromPkcs8(id.pkcs8, { certificateChain: [id.certificate] });
  const frozen = await lock.freezeAndSign(sealed.bytes, { id: LOCK_RENDITION, createdAt: '2026-10-12T10:00:00Z', signer, signatureId: 'sig-nachweis' });
  return frozen.bytes;
}

/** Source of the print test document (package P18): long and wide tables, code, video, animation, component. */
export const PRINT_SAMPLE_DIR = fileURLToPath(new URL('../../docs/spezifikation/beispiele/p18-druck/', import.meta.url));

/**
 * `druck.hpro`: the P18 test document for the derived A4 print (HPL-PRINT-001 … 005): two content
 * documents, profile `interactive` with the component hp-chart, one section with `no-print`.
 */
export async function buildPrintSample(): Promise<Uint8Array> {
  const doc = JSON.parse(await readFile(join(PRINT_SAMPLE_DIR, 'dokument.json'), 'utf8')) as Omit<DocumentInput, 'resources'>;
  const files = (await walk(PRINT_SAMPLE_DIR)).map((f) => relative(PRINT_SAMPLE_DIR, f).split('\\').join('/')).filter((p) => p !== 'dokument.json').sort();
  const resources = await Promise.all(
    files.map(async (path) => {
      const type = LIVE_TYPES[path.slice(path.lastIndexOf('.') + 1)];
      if (!type) throw new Error(`no media type for ${path}`);
      return { path, mediaType: type, data: new Uint8Array(await readFile(join(PRINT_SAMPLE_DIR, path))) };
    }),
  );
  return (await createContainer({ ...doc, resources })).bytes;
}

/** Source of the editing sample (package P5): minutes with headings, lists, a table, a footnote, cross references and two images. */
export const EDIT_SAMPLE_DIR = fileURLToPath(new URL('../../docs/spezifikation/beispiele/p5-bearbeiten/', import.meta.url));
const EDIT_TYPES: Record<string, string> = { xhtml: 'application/xhtml+xml', css: 'text/css', svg: 'image/svg+xml', png: 'image/png' };

/**
 * `bearbeiten.hpro`: the P5 example, saved once with the editor of the core, so that the file
 * carries a history journal with two versions (0: as written, 1: one row and one item added).
 */
export async function buildEditSample(): Promise<Uint8Array> {
  const doc = JSON.parse(await readFile(join(EDIT_SAMPLE_DIR, 'dokument.json'), 'utf8')) as Omit<DocumentInput, 'resources'>;
  const files = (await walk(EDIT_SAMPLE_DIR)).map((f) => relative(EDIT_SAMPLE_DIR, f).split('\\').join('/')).filter((p) => p !== 'dokument.json').sort();
  const resources = await Promise.all(files.map(async (path) => ({ path, mediaType: EDIT_TYPES[path.split('.').pop()!]!, data: new Uint8Array(await readFile(join(EDIT_SAMPLE_DIR, path))) })));
  const created = await createContainer({ ...doc, resources });
  const saved = await edit.editContainer(
    created.bytes,
    [
      { op: 'insert-row', table: 'content/index.xhtml#termin-tabelle', at: 3, cells: ['19.10.2026', 'Begehung Dach', 'Bauaufsicht'] },
      { op: 'insert', ref: 'content/index.xhtml#punkte', position: 'end', block: { type: 'list-item', text: 'Schlüssel für den Turnsaal übergeben.' } },
    ],
    { at: '2026-10-12T08:00:00Z', note: 'Termin Begehung Dach und offener Punkt Schlüssel ergänzt' },
  );
  return saved.bytes;
}

/** Source of the form sample (package P6): the application form of docs/spezifikation/beispiele/p6-antrag/. */
export const FORM_SAMPLE_DIR = fileURLToPath(new URL('../../docs/spezifikation/beispiele/p6-antrag/', import.meta.url));

/**
 * `antrag.hpro`: the financing application with calculation, conditions, check rules and a JSON
 * schema for its data (HPC-0009), as built by scripts/p6-beispiel.mjs.
 */
export async function buildFormSample(): Promise<Uint8Array> {
  const doc = JSON.parse(await readFile(join(FORM_SAMPLE_DIR, 'dokument.json'), 'utf8')) as Omit<DocumentInput, 'resources'>;
  const types: Record<string, string> = { xhtml: 'application/xhtml+xml', css: 'text/css', json: 'application/json' };
  const files = (await walk(FORM_SAMPLE_DIR)).map((f) => relative(FORM_SAMPLE_DIR, f).split('\\').join('/')).filter((p) => p !== 'dokument.json').sort();
  const resources = await Promise.all(files.map(async (path) => ({ path, mediaType: types[path.split('.').pop()!]!, data: new Uint8Array(await readFile(join(FORM_SAMPLE_DIR, path))) })));
  return (await createContainer({ ...doc, resources })).bytes;
}

/** Source of the review sample (package P7): docs/spezifikation/beispiele/p7-review/. */
export const REVIEW_SAMPLE_DIR = fileURLToPath(new URL('../../docs/spezifikation/beispiele/p7-review/', import.meta.url));

/**
 * `anmerkungen.hpro`: the draft specification of P7 with a review in progress (HPC-0010): a
 * comment answered and resolved, an open question with an answer, a highlight with a note, a
 * freehand drawing on the schedule and a comment on a whole paragraph of the annex. Ids are
 * deterministic, so every build writes the same file.
 */
export async function buildReviewSample(): Promise<Uint8Array> {
  const doc = JSON.parse(await readFile(join(REVIEW_SAMPLE_DIR, 'dokument.json'), 'utf8')) as Omit<DocumentInput, 'resources'>;
  const types: Record<string, string> = { xhtml: 'application/xhtml+xml', css: 'text/css' };
  const files = (await walk(REVIEW_SAMPLE_DIR)).map((f) => relative(REVIEW_SAMPLE_DIR, f).split('\\').join('/')).filter((p) => p !== 'dokument.json').sort();
  const resources = await Promise.all(files.map(async (path) => ({ path, mediaType: types[path.split('.').pop()!]!, data: new Uint8Array(await readFile(join(REVIEW_SAMPLE_DIR, path))) })));
  let bytes = (await createContainer({ ...doc, resources })).bytes;
  const I = 'content/index.xhtml';
  const index = async () => new annotate.DocumentIndex((await readContainer(bytes)).files);
  const id = (seed: string) => annotate.deterministicId(`p7-sample|${seed}`);
  const gen = 'hpro Beispiel P7';
  const laerm = annotate.createAnnotation({ kind: 'comment', address: `${I}#anf-laerm`, quote: annotate.quoteOfText(await index(), `${I}#anf-laerm`, 'nach 13:00 Uhr'), text: 'Freitags endet der Unterricht um 12:00 Uhr – bitte ergänzen.', author: 'Eva Berger (Bauamt)', created: '2026-10-12T08:10:00Z', id: await id('laerm'), language: 'de', generator: gen });
  const luft = annotate.createAnnotation({ kind: 'highlight', address: `${I}#umfang-lueftung`, quote: annotate.quoteOfText(await index(), `${I}#umfang-lueftung`, 'Luftmenge 3000 m³/h'), color: 'gelb', text: 'Reicht das für zwei Klassen gleichzeitig (60 Kinder)?', author: 'Schulleitung VS Beispielort', created: '2026-10-12T08:20:00Z', id: await id('luft'), language: 'de', generator: gen });
  const rampe = annotate.createAnnotation({ kind: 'highlight', address: `${I}#umfang-zugang`, quote: annotate.quoteOfText(await index(), `${I}#umfang-zugang`, 'höchstens 6 Prozent'), color: 'gruen', author: 'Eva Berger (Bauamt)', created: '2026-10-12T08:25:00Z', id: await id('rampe'), language: 'de', generator: gen });
  const termine = annotate.createAnnotation({ kind: 'ink', address: `${I}#termin-tabelle`, ink: { paths: ['M80 800 C300 860 700 860 930 790', 'M900 760 L940 800 L890 830'], color: 'rot' }, text: 'Bauzeit mit Schulbeginn abgleichen.', author: 'Schulleitung VS Beispielort', created: '2026-10-12T08:30:00Z', id: await id('termine'), language: 'de', generator: gen });
  const bestand = annotate.createAnnotation({ kind: 'comment', address: 'content/anhang.xhtml#bestand-text', text: 'Fotos der Begehung bitte als Anhang ergänzen.', author: 'Max Huber (Planung)', created: '2026-10-12T08:40:00Z', id: await id('bestand'), language: 'de', generator: gen });
  bytes = (await annotate.saveAnnotations(bytes, { add: [laerm, luft, rampe, termine, bestand] }, { modified: '2026-10-12T08:45:00Z', note: 'Anmerkungen der ersten Prüfrunde' })).bytes;
  const r1 = annotate.createReply({ to: laerm.id, text: 'Ergänzt: freitags ab 12:00 Uhr.', author: 'Max Huber (Planung)', created: '2026-10-12T09:00:00Z', id: await id('r1'), language: 'de', generator: gen });
  const r2 = annotate.createReply({ to: laerm.id, status: 'resolved', text: 'Passt so, danke.', author: 'Eva Berger (Bauamt)', created: '2026-10-12T09:10:00Z', id: await id('r2'), language: 'de', generator: gen });
  const r3 = annotate.createReply({ to: luft.id, text: 'Auslegung erfolgt für 60 Personen, Nachweis folgt mit der Ausschreibung.', author: 'Max Huber (Planung)', created: '2026-10-12T09:15:00Z', id: await id('r3'), language: 'de', generator: gen });
  bytes = (await annotate.saveAnnotations(bytes, { add: [r1, r2, r3] }, { modified: '2026-10-12T09:20:00Z', note: 'Antworten der Planung' })).bytes;
  return bytes;
}

/** Source of the accessibility sample (package P8): deliberately faulty in all seven categories of the check. */
export const CHECK_SAMPLE_DIR = fileURLToPath(new URL('../../docs/spezifikation/beispiele/p8-barrierefreiheit/', import.meta.url));

/** `pruefen.hpro`: the P8 test document (docs/spezifikation/beispiele/p8-barrierefreiheit/), as written. */
export async function buildCheckSample(): Promise<Uint8Array> {
  const doc = JSON.parse(await readFile(join(CHECK_SAMPLE_DIR, 'dokument.json'), 'utf8')) as Omit<DocumentInput, 'resources'>;
  const types: Record<string, string> = { xhtml: 'application/xhtml+xml', css: 'text/css', svg: 'image/svg+xml', png: 'image/png' };
  const files = (await walk(CHECK_SAMPLE_DIR)).map((f) => relative(CHECK_SAMPLE_DIR, f).split('\\').join('/')).filter((p) => p !== 'dokument.json').sort();
  const resources = await Promise.all(files.map(async (path) => ({ path, mediaType: types[path.split('.').pop()!]!, data: new Uint8Array(await readFile(join(CHECK_SAMPLE_DIR, path))) })));
  return (await createContainer({ ...doc, resources })).bytes;
}
