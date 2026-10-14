#!/usr/bin/env node
/**
 * Builds the three demo documents of the first public version (P14) from demo/quellen/:
 *
 *   hpro-demo-bericht.hpro     report: collapsible sections, stable addresses, calculating table, figure, appendix
 *   hpro-demo-formular.hpro    form: OpenFormula fields, conditional section, checks, form data with JSON schema
 *   hpro-demo-nachweis.hpro    signed evidence: profile signed, XAdES-BASELINE-B over every file (demo TEST key)
 *
 *   node scripts/demo-bauen.mjs [outdir]       write the containers (default demo/)
 *   node scripts/demo-bauen.mjs --vergleichen  build in memory and compare with the files in demo/
 *                                               byte for byte (exit 1 on any difference)
 *   node scripts/demo-bauen.mjs --write-data   also rewrite the blank form data in the sources
 *
 * The build is deterministic: fixed dateModified, sorted paths, fixed ZIP time, fixed signing time
 * and an RSA key (PKCS#1 v1.5 signatures carry no randomness), so two runs give the same bytes.
 * Uses kern/dist (npm run build -w kern).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { ROOT, kern, mediaTypeOf, walk } from './s7-lib.mjs';

const DEMO = resolve(ROOT, 'demo');
const SOURCES = join(DEMO, 'quellen');
const KEY = join(DEMO, 'schluessel', 'demo-pruefstelle.key.pem');
const CERT = join(DEMO, 'schluessel', 'demo-pruefstelle.cert.pem');
export const SIGNING_TIME = '2026-10-14T08:30:00Z';
export const SIGNATURE_ID = 'sig-demo-pruefstelle';
export const DEMOS = ['bericht', 'formular', 'nachweis'];
export const fileName = (name) => `hpro-demo-${name}.hpro`;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function readSource(name) {
  const dir = join(SOURCES, name);
  const doc = JSON.parse(readFileSync(join(dir, 'dokument.json'), 'utf8'));
  const resources = walk(dir)
    .filter((p) => p !== 'dokument.json')
    .map((path) => ({ path, mediaType: mediaTypeOf(path), data: new Uint8Array(readFileSync(join(dir, path))) }));
  return { dir, doc, resources };
}

/** Blank form data as the core computes it from the markup (status draft, like scripts/p6-beispiel.mjs). */
async function blankFormData(dir, doc) {
  const { form } = await kern();
  const xhtml = readFileSync(join(dir, 'content', 'index.xhtml'), 'utf8');
  const dom = new DOMParser().parseFromString(xhtml, 'application/xhtml+xml');
  const fd = new form.FormDocument(dom, { documentId: doc.id });
  return `${JSON.stringify(fd.data('abrechnung', 'draft'), null, 2)}\n`;
}

async function create(name, { writeData }) {
  const { createContainer } = await kern();
  if (name === 'formular') {
    const dir = join(SOURCES, name);
    const doc = JSON.parse(readFileSync(join(dir, 'dokument.json'), 'utf8'));
    const blank = await blankFormData(dir, doc);
    const dataPath = join(dir, 'data', 'abrechnung.json');
    const stored = existsSync(dataPath) ? readFileSync(dataPath, 'utf8') : null;
    if (writeData) writeFileSync(dataPath, blank);
    else if (stored !== blank) throw new Error(`${dataPath} weicht von den leeren Formulardaten des Kerns ab; mit --write-data neu schreiben`);
  }
  const { doc, resources } = readSource(name);
  const created = await createContainer({ ...doc, resources });
  if (name !== 'nachweis') return created.bytes;
  const { SoftwareKeySigner, certificatesFromPem, pkcs8FromPem, signContainer } = await kern();
  const signer = await SoftwareKeySigner.fromPkcs8(pkcs8FromPem(readFileSync(KEY, 'utf8')), { certificateChain: certificatesFromPem(readFileSync(CERT, 'utf8')) });
  const signed = await signContainer(created.bytes, { signer, signingTime: new Date(SIGNING_TIME), signatureId: SIGNATURE_ID });
  const verdict = signed.readBack.signatures.map((s) => s.indication);
  if (verdict.length !== 1 || verdict[0] !== 'TOTAL_PASSED') throw new Error(`Rücklesen der Signatur: ${JSON.stringify(verdict)}`);
  return signed.bytes;
}

export async function buildAll({ writeData = false } = {}) {
  const out = {};
  for (const name of DEMOS) out[name] = await create(name, { writeData });
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const compare = args.includes('--vergleichen');
  const writeData = args.includes('--write-data');
  const outDir = resolve(args.find((a) => !a.startsWith('--')) ?? DEMO);
  const built = await buildAll({ writeData });
  let differences = 0;
  for (const name of DEMOS) {
    const file = join(compare ? DEMO : outDir, fileName(name));
    const bytes = built[name];
    if (compare) {
      const stored = existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
      const same = stored !== null && sha256(stored) === sha256(bytes);
      if (!same) differences++;
      console.log(`${same ? 'gleich   ' : 'ABWEICHUNG'} ${fileName(name).padEnd(24)} gebaut ${sha256(bytes)}  im Repo ${stored ? sha256(stored) : 'fehlt'}`);
    } else {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(file, bytes);
      console.log(`${fileName(name).padEnd(24)} ${String(bytes.length).padStart(6)} Bytes  sha256=${sha256(bytes)}`);
    }
  }
  if (compare) {
    console.log(differences === 0 ? 'Alle Demo-Dokumente im Repo entsprechen dem Bau aus den Quellen.' : `${differences} Demo-Dokument(e) weichen ab: node scripts/demo-bauen.mjs`);
    process.exitCode = differences === 0 ? 0 : 1;
  }
}
