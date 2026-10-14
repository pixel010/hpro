// Acceptance: two runs produce containers with identical content (entries and hashes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContainer, readZip, sampleDocument } from '../src/index.js';
import { nodeSha256Hex } from './helpers.js';

async function describe(bytes: Uint8Array) {
  return (await readZip(bytes)).map((e) => ({ name: e.name, method: e.method, size: e.size, sha256: nodeSha256Hex(e.data) }));
}

test('two runs give the same entries in the same order with the same hashes', async () => {
  const a = await createContainer(sampleDocument());
  const b = await createContainer(sampleDocument());
  assert.deepEqual(await describe(a.bytes), await describe(b.bytes));
  assert.deepEqual(a.manifest, b.manifest);
});

test('two runs are byte-identical (fixed timestamps, attributes and order)', async () => {
  const a = await createContainer(sampleDocument());
  const b = await createContainer(sampleDocument());
  assert.equal(nodeSha256Hex(a.bytes), nodeSha256Hex(b.bytes));
});

test('resource order in the input does not change the output', async () => {
  const doc = sampleDocument();
  const reversed = { ...doc, resources: [...doc.resources].reverse() };
  const a = await createContainer(doc);
  const b = await createContainer(reversed);
  assert.equal(nodeSha256Hex(a.bytes), nodeSha256Hex(b.bytes));
});

test('a content change changes exactly that hash and the derived files', async () => {
  const doc = sampleDocument();
  const changed = {
    ...doc,
    resources: doc.resources.map((r) => (r.path === 'content/styles/document.css' ? { ...r, data: String(r.data) + 'p { margin: 0; }\n' } : r)),
  };
  const a = await describe((await createContainer(doc)).bytes);
  const b = await describe((await createContainer(changed)).bytes);
  const differing = a.filter((e, i) => e.sha256 !== b[i]!.sha256).map((e) => e.name);
  // The machine view names the stylesheet with its hash in derivedFrom (HP-MACH-005); its Markdown
  // rendering does not show hashes and stays the same.
  assert.deepEqual(differing, ['manifest.json', 'content/styles/document.css', 'machine/document.json']);
});
