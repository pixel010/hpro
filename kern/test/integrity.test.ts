// Acceptance: the hash manifest is read back after writing and checked; manipulated
// resources are detected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createContainer, readContainer, readZip, sampleDocument, writeZip, type ZipEntry } from '../src/index.js';
import { PROTOTYPE_CONTAINERS, assertContainerError, nodeSri, text } from './helpers.js';

/** Re-packs entries like zipedit.py in the prototype: same order, one change applied. */
async function repack(entries: readonly ZipEntry[], change: (e: ZipEntry) => Uint8Array | null | undefined, extra: Array<{ name: string; data: Uint8Array }> = []) {
  const out = [];
  for (const e of entries) {
    const replaced = change(e);
    if (replaced === null) continue;
    out.push({ name: e.name, data: replaced ?? e.data, compression: e.name === 'mimetype' ? ('store' as const) : ('auto' as const) });
  }
  for (const x of extra) out.push({ ...x, compression: 'auto' as const });
  return writeZip(out, { modified: new Date('2026-10-11T00:00:00Z') });
}

test('createContainer reads its output back and reports a verified manifest', async () => {
  const created = await createContainer(sampleDocument());
  assert.equal(created.readBack.integrity.ok, true);
  assert.deepEqual(created.readBack.integrity.unlisted, []);
  assert.ok(created.readBack.integrity.resources.every((r) => r.status === 'ok'));
  assert.deepEqual(created.readBack.manifest, created.manifest);
});

test('manipulated resource: changed price in content/index.xhtml is reported as hash-mismatch', async () => {
  const { bytes } = await createContainer(sampleDocument());
  const entries = await readZip(bytes);
  const manipulated = await repack(entries, (e) =>
    e.name === 'content/index.xhtml' ? new TextEncoder().encode(text(e.data).replace('1.200,00 EUR', '9.200,00 EUR')) : undefined,
  );
  // The ZIP itself is perfectly valid (CRCs are recomputed), only the manifest can tell.
  const read = await readContainer(manipulated);
  assert.equal(read.integrity.ok, false);
  const bad = read.integrity.resources.filter((r) => r.status !== 'ok');
  assert.deepEqual(bad.map((r) => [r.path, r.status]), [['content/index.xhtml', 'hash-mismatch']]);
  assert.equal(bad[0]!.actual, nodeSri(read.files.get('content/index.xhtml')!));
  assert.notEqual(bad[0]!.actual, bad[0]!.expected);
  assert.match(text(read.files.get('content/index.xhtml')!), /9\.200,00 EUR/);
});

test('removed resource is reported as missing', async () => {
  const { bytes } = await createContainer(sampleDocument());
  const stripped = await repack(await readZip(bytes), (e) => (e.name === 'content/media/lieferplan.svg' ? null : undefined));
  const read = await readContainer(stripped);
  assert.equal(read.integrity.ok, false);
  assert.deepEqual(
    read.integrity.resources.filter((r) => r.status !== 'ok').map((r) => [r.path, r.status]),
    [['content/media/lieferplan.svg', 'missing']],
  );
});

test('file added after writing is reported as unlisted, listed resources stay verified', async () => {
  const { bytes } = await createContainer(sampleDocument());
  const added = await repack(await readZip(bytes), () => undefined, [
    { name: 'annotations/annotations.jsonld', data: new TextEncoder().encode('{"type":"Annotation"}') },
    { name: 'META-INF/signatures.xml', data: new TextEncoder().encode('<signatures xmlns="urn:oasis:names:tc:opendocument:xmlns:container"/>') },
  ]);
  const read = await readContainer(added);
  assert.equal(read.integrity.ok, true);
  assert.deepEqual(read.integrity.unlisted, ['annotations/annotations.jsonld']);
});

test('changed hash value inside manifest.json is reported as hash-mismatch', async () => {
  const { bytes } = await createContainer(sampleDocument());
  const forged = await repack(await readZip(bytes), (e) => {
    if (e.name !== 'manifest.json') return undefined;
    const m = JSON.parse(text(e.data));
    m.resources.find((r: { url: string }) => r.url === 'content/styles/document.css').integrity = 'sha256-' + 'A'.repeat(43) + '=';
    return new TextEncoder().encode(JSON.stringify(m, null, 2) + '\n');
  });
  const read = await readContainer(forged);
  assert.equal(read.integrity.ok, false);
  assert.deepEqual(read.integrity.resources.filter((r) => r.status !== 'ok').map((r) => r.path), ['content/styles/document.css']);
});

test('flipped byte inside a compressed entry is caught by the ZIP layer', async () => {
  const { bytes } = await createContainer(sampleDocument());
  const entry = (await readZip(bytes)).find((e) => e.name === 'content/index.xhtml')!;
  assert.equal(entry.method, 'deflated');
  const copy = bytes.slice();
  const dataStart = entry.localHeaderOffset + 30 + 'content/index.xhtml'.length;
  copy[dataStart + Math.floor(entry.compressedSize / 2)]! ^= 0xff;
  try {
    await readContainer(copy);
    assert.fail('manipulated archive was accepted');
  } catch (err) {
    assert.ok(['zip-crc', 'zip-structure', 'zip-limit'].includes((err as { code?: string }).code ?? ''), String(err));
  }
});

test('manifest.json with a non-SHA-256 integrity value is rejected', async () => {
  const { bytes } = await createContainer(sampleDocument());
  const forged = await repack(await readZip(bytes), (e) =>
    e.name === 'manifest.json' ? new TextEncoder().encode(text(e.data).replace(/"sha256-/, '"md5-')) : undefined,
  );
  await assertContainerError(readContainer(forged), 'manifest', /only sha256/);
});

// Cross-check against containers written by the Python prototype and by EU DSS (docs/05).
test('prototype V0 basis.epub (Python writer) verifies', async () => {
  const read = await readContainer(await readFile(resolve(PROTOTYPE_CONTAINERS, 'basis.epub')));
  assert.equal(read.integrity.ok, true);
  assert.deepEqual(read.integrity.unlisted, []);
  assert.equal(read.integrity.resources.length, 4);
});

test('prototype V8 hybrid-manipuliert.epub (changed after signing) shows hash-mismatch on index.xhtml', async () => {
  const read = await readContainer(await readFile(resolve(PROTOTYPE_CONTAINERS, 'hybrid-manipuliert.epub')));
  assert.equal(read.integrity.ok, false);
  assert.deepEqual(read.integrity.resources.filter((r) => r.status !== 'ok').map((r) => [r.path, r.status]), [['content/index.xhtml', 'hash-mismatch']]);
});

test('prototype V9 hybrid-kommentar.epub (file added after signing) lists the addition as unlisted', async () => {
  const read = await readContainer(await readFile(resolve(PROTOTYPE_CONTAINERS, 'hybrid-kommentar.epub')));
  assert.equal(read.integrity.ok, true);
  assert.equal(read.integrity.unlisted.length, 1);
  assert.match(read.integrity.unlisted[0]!, /^annotations\//);
});

test('prototype V11 zielformat-2sig.epub (written by DSS, two signatures) verifies', async () => {
  const read = await readContainer(await readFile(resolve(PROTOTYPE_CONTAINERS, 'zielformat-2sig.epub')));
  assert.equal(read.integrity.ok, true);
  assert.ok(read.files.has('META-INF/signatures.xml'));
});
