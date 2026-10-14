#!/usr/bin/env node
/**
 * Builds the example containers of the implementer's guide and the author's guide (S7):
 *
 *   s7-bericht     static document, level Basis (chapters 2–5 of the guide)
 *   s7-lebendig    interactive document with one component and a data file (chapter 6)
 *   s7-fassungen   s7-lebendig plus a frozen rendition under renditions/<id>/ (chapter 7);
 *                  signing the rendition is done with the command line in scripts/belege-s7.sh
 *   s7-buero       office minimum profile, converted from a Flat-ODF source (author's guide)
 *
 * Sources: docs/spezifikation/beispiele/s7-<name>/ . Output is deterministic (HP-CONT-014).
 *
 *   node scripts/s7-beispiele.mjs [outdir]        (default docs/belege/S7/container)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES_DIR, NS_URI, PROFILE, ROOT, buildFromDir, kern, mediaTypeOf, rewriteContainer, sha256Hex, text, utf8 } from './s7-lib.mjs';
import { fodtToHpro } from './s7-fodt2hpro.mjs';

const RID = 'nachweis-2026-10-12';
const RP = `renditions/${RID}/`;

/**
 * Frozen rendition after part 1, section 7.3: values fixed (already in data-hp-value), component
 * replaced by `div data-hp-frozen`, files copied under renditions/<id>/, own manifest with
 * derivedFrom/computedAt/calculator, entry in the main manifest, package.opf extended.
 * The rendition is a single content document with its table of contents inside (see guide 7.3).
 */
async function buildFassungen(live) {
  const { readContainer, readZip, sriSha256 } = await kern();
  const entries = await readZip(live.bytes);
  const get = (n) => entries.find((e) => e.name === n).data;
  const mainManifestBefore = get('manifest.json');

  let index = text(get('content/index.xhtml'))
    .replace(/\n  <script src="[^"]*"><\/script>/, '')
    .replace(/<x-baubuero-aufmass id="([^"]*)"[^>]*>/, '<div data-hp-frozen="x-baubuero-aufmass" id="$1">')
    .replace('</x-baubuero-aufmass>', '</div>')
    .replace(
      '<p id="einleitung">',
      '<p id="signaturhinweis" data-hp-role="signature-notice">Eingefrorene Fassung vom 12.10.2026, Werte festgeschrieben. Den Signaturstatus zeigt nur ein hpro-Lesesystem an.</p>\n    <nav epub:type="toc" id="toc"><h2 id="toc-h">Inhalt</h2><ol><li><a href="#aufmass">Aufmaß</a></li><li><a href="#ergebnis">Ergebnis</a></li></ol></nav>\n    <p id="einleitung">',
    );
  const files = new Map([
    [RP + 'content/index.xhtml', utf8(index)],
    [RP + 'content/styles/document.css', get('content/styles/document.css')],
    [RP + 'data/aufmass.json', get('data/aufmass.json')],
    [RP + 'data/aufmass.schema.json', get('data/aufmass.schema.json')],
  ]);
  const resources = [];
  for (const [path, data] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) resources.push({ url: path, type: mediaTypeOf(path), integrity: await sriSha256(data) });
  const renditionManifest = {
    '@context': ['https://www.w3.org/ns/pub-context', NS_URI],
    conformsTo: PROFILE('signed'),
    id: 'urn:uuid:c2d4e6f8-0a1b-4c3d-9e5f-7a8b9c0d1e2f',
    name: `${live.manifest.name} (Nachweis)`,
    inLanguage: live.manifest.inLanguage,
    dateModified: live.modified,
    readingOrder: [{ url: RP + 'content/index.xhtml', type: 'application/xhtml+xml' }],
    resources,
    data: [{ url: RP + 'data/aufmass.json', schema: RP + 'data/aufmass.schema.json' }],
    derivedFrom: { integrity: await sriSha256(mainManifestBefore), method: 'author' },
    computedAt: '2026-10-12T06:25:00Z',
    calculator: { name: 'x-baubuero-aufmass', version: '1.0.0' },
    accessibility: live.manifest.accessibility,
  };
  files.set(RP + 'manifest.json', utf8(JSON.stringify(renditionManifest, null, 2) + '\n'));

  // package.opf lists every file (HP-CONT-004); rendition files are items, not spine entries.
  const items = [...files.keys()].sort().map((p, i) => `    <item id="r${i + 1}" href="${p}" media-type="${mediaTypeOf(p)}"/>`);
  const opf = text(get('package.opf')).replace('  </manifest>', `${items.join('\n')}\n  </manifest>`);
  // package.opf is a resource of the main version: its hash changes with it (HP-CONT-008).
  const opfIntegrity = await sriSha256(utf8(opf));
  const mainManifest = {
    ...live.manifest,
    resources: live.manifest.resources.map((r) => (r.url === 'package.opf' ? { ...r, integrity: opfIntegrity } : r)),
    renditions: [{ id: RID, role: 'frozen', url: RP + 'manifest.json', createdAt: live.modified }],
  };
  const bytes = await rewriteContainer(live.bytes, { manifest: mainManifest, replace: { 'package.opf': opf }, extra: Object.fromEntries(files), modified: live.modified });
  return { bytes, manifest: (await readContainer(bytes)).manifest, sha256: sha256Hex(bytes), renditionFiles: [...files.keys()].sort() };
}

/**
 * s7-bericht prepared for signing (chapter 8): profile `signed` (HP-PROF-004) and the visible
 * signature notice (HP-PROF-013). The signature itself is added with `hpro sign` in
 * scripts/belege-s7.sh, so this container is "profile signed, not yet signed".
 */
async function buildSigniert(bericht) {
  const { readContainer, readZip, sriSha256 } = await kern();
  const entries = await readZip(bericht.bytes);
  const index = text(entries.find((e) => e.name === 'content/index.xhtml').data).replace(
    '<p id="einleitung">',
    '<p id="signaturhinweis" data-hp-role="signature-notice">Dieses Dokument ist signiert. Den Signaturstatus zeigt nur ein hpro-Lesesystem an; ein EPUB-Lesesystem prüft keine Signaturen.</p>\n    <p id="einleitung">',
  );
  const integrity = await sriSha256(utf8(index));
  const manifest = {
    ...bericht.manifest,
    conformsTo: PROFILE('signed'),
    resources: bericht.manifest.resources.map((r) => (r.url === 'content/index.xhtml' ? { ...r, integrity } : r)),
  };
  const bytes = await rewriteContainer(bericht.bytes, { manifest, replace: { 'content/index.xhtml': index }, modified: bericht.modified });
  return { bytes, manifest: (await readContainer(bytes)).manifest, sha256: sha256Hex(bytes) };
}

export async function buildAll() {
  const out = {};
  out['s7-bericht'] = await buildFromDir(join(EXAMPLES_DIR, 's7-bericht'));
  out['s7-bericht-signierbar'] = await buildSigniert(out['s7-bericht']);
  out['s7-lebendig'] = await buildFromDir(join(EXAMPLES_DIR, 's7-lebendig'));
  out['s7-fassungen'] = await buildFassungen(out['s7-lebendig']);
  const fodt = readFileSync(join(EXAMPLES_DIR, 's7-buero', 'angebot.fodt'));
  const buero = await fodtToHpro(fodt, { sourceName: 'angebot.fodt' });
  out['s7-buero'] = { bytes: buero.bytes, manifest: buero.manifest, sha256: sha256Hex(buero.bytes), messages: buero.messages };
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = resolve(process.argv[2] ?? resolve(ROOT, 'docs', 'belege', 'S7', 'container'));
  mkdirSync(outDir, { recursive: true });
  const built = await buildAll();
  for (const [key, b] of Object.entries(built)) {
    const file = join(outDir, `${key}.hpro`);
    writeFileSync(file, b.bytes);
    for (const m of b.messages ?? []) console.log(`${key}: Meldung: ${m}`);
    console.log(`${key.padEnd(13)} ${file}  ${b.bytes.length} bytes  sha256=${b.sha256}`);
    if (b.renditionFiles) writeFileSync(join(outDir, `${key}.fassung.txt`), b.renditionFiles.join('\n') + '\n');
  }
}
