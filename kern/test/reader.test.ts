// Structural checks and hardening when reading foreign containers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContainer, readContainer, readZip, sampleDocument, writeZip, type ZipEntryInput } from '../src/index.js';
import { assertContainerError } from './helpers.js';

const enc = (s: string) => new TextEncoder().encode(s);

/** Replaces every occurrence of an ASCII string by another of equal length, byte by byte. */
function patchAscii(bytes: Uint8Array, from: string, to: string): Uint8Array {
  assert.equal(from.length, to.length);
  const out = bytes.slice();
  const f = enc(from);
  let hits = 0;
  for (let i = 0; i + f.length <= out.length; i++) {
    if (f.every((b, k) => out[i + k] === b)) {
      out.set(enc(to), i);
      hits++;
    }
  }
  assert.ok(hits >= 2, `expected the name in local and central header, found ${hits}`);
  return out;
}
const modified = new Date('2026-10-11T00:00:00Z');

async function sampleEntries(): Promise<ZipEntryInput[]> {
  const { bytes } = await createContainer(sampleDocument());
  return (await readZip(bytes)).map((e) => ({ name: e.name, data: e.data, compression: e.name === 'mimetype' ? 'store' : 'auto' }));
}

test('wrong mimetype content is rejected', async () => {
  const entries = (await sampleEntries()).map((e) => (e.name === 'mimetype' ? { ...e, data: enc('application/vnd.etsi.asic-e+zip') } : e));
  await assertContainerError(readContainer(await writeZip(entries, { modified })), 'mimetype', /exactly "application\/epub\+zip"/);
});

test('mimetype that is not the first entry is rejected', async () => {
  const entries = await sampleEntries();
  const swapped = [entries[1]!, entries[0]!, ...entries.slice(2)];
  await assertContainerError(readContainer(await writeZip(swapped, { modified })), 'mimetype', /first entry/);
});

test('compressed mimetype is rejected', async () => {
  const entries = (await sampleEntries()).map((e): ZipEntryInput => (e.name === 'mimetype' ? { ...e, compression: 'deflate' } : e));
  await assertContainerError(readContainer(await writeZip(entries, { modified })), 'mimetype', /stored/);
});

test('mimetype with an extra field is rejected', async () => {
  // Build a stored mimetype entry with a 4-byte extra field by hand.
  const base = await writeZip(await sampleEntries(), { modified });
  const name = enc('mimetype');
  const content = enc('application/epub+zip');
  const extra = new Uint8Array([0xfe, 0xca, 0x00, 0x00]);
  const header = new DataView(new ArrayBuffer(30));
  header.setUint32(0, 0x04034b50, true);
  header.setUint16(4, 10, true);
  header.setUint32(14, new DataView(base.buffer).getUint32(14, true), true); // same CRC
  header.setUint32(18, content.length, true);
  header.setUint32(22, content.length, true);
  header.setUint16(26, name.length, true);
  header.setUint16(28, extra.length, true);
  const oldLocalLength = 30 + name.length + content.length;
  const rest = base.subarray(oldLocalLength);
  const patched = new Uint8Array(oldLocalLength + extra.length + rest.length);
  patched.set(new Uint8Array(header.buffer), 0);
  patched.set(name, 30);
  patched.set(extra, 38);
  patched.set(content, 42);
  patched.set(rest, 42 + content.length);
  // Shift all later local header offsets and the central directory offset by 4 bytes.
  const v = new DataView(patched.buffer);
  const eocd = patched.length - 22;
  const cdOffset = v.getUint32(eocd + 16, true) + extra.length;
  v.setUint32(eocd + 16, cdOffset, true);
  for (let p = cdOffset; p < eocd; ) {
    const off = v.getUint32(p + 42, true);
    if (off > 0) v.setUint32(p + 42, off + extra.length, true);
    p += 46 + v.getUint16(p + 28, true) + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  await assertContainerError(readContainer(patched), 'mimetype', /extra field/);
});

test('missing container.xml and missing manifest.json are rejected', async () => {
  const entries = await sampleEntries();
  await assertContainerError(readContainer(await writeZip(entries.filter((e) => e.name !== 'META-INF/container.xml'), { modified })), 'container-xml');
  await assertContainerError(readContainer(await writeZip(entries.filter((e) => e.name !== 'manifest.json'), { modified })), 'manifest');
});

test('container.xml pointing to a missing rootfile is rejected', async () => {
  const entries = (await sampleEntries()).map((e) =>
    e.name === 'META-INF/container.xml' ? { ...e, data: enc(new TextDecoder().decode(e.data).replace('package.opf', 'fehlt.opf')) } : e,
  );
  await assertContainerError(readContainer(await writeZip(entries, { modified })), 'container-xml', /does not exist/);
});

test('path traversal and absolute paths are rejected by writer and reader', async () => {
  await assertContainerError(writeZip([{ name: '../evil.txt', data: enc('x'), compression: 'store' }], { modified }), 'zip-path');
  // Reader: write a harmless name of equal length, then patch it in both headers.
  const zip = await writeZip([{ name: 'aa/evil.txt', data: enc('x'), compression: 'store' }], { modified });
  await assertContainerError(readZip(patchAscii(zip, 'aa/evil.txt', '../evil.txt')), 'zip-path');
});

test('duplicate entry names are rejected by writer and reader', async () => {
  const one = { data: enc('x'), compression: 'store' as const };
  await assertContainerError(writeZip([{ name: 'a.txt', ...one }, { name: 'a.txt', ...one }], { modified }), 'input');
  const zip = await writeZip([{ name: 'a.txt', ...one }, { name: 'b.txt', ...one }], { modified });
  await assertContainerError(readZip(patchAscii(zip, 'b.txt', 'a.txt')), 'zip-structure', /duplicate/);
});

test('entry that inflates beyond its declared size is stopped (ZIP bomb guard)', async () => {
  const zeros = new Uint8Array(1024 * 1024);
  const zip = await writeZip([{ name: 'bomb.bin', data: zeros, compression: 'deflate' }], { modified });
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const cd = v.getUint32(zip.length - 22 + 16, true);
  v.setUint32(cd + 24, 1000, true); // declared uncompressed size in the central directory
  await assertContainerError(readZip(zip), 'zip-limit', /exceeds declared size/);
});

test('configurable size limit rejects large entries before inflating', async () => {
  const zip = await writeZip([{ name: 'big.bin', data: new Uint8Array(4096), compression: 'deflate' }], { modified });
  await assertContainerError(readZip(zip, { maxEntrySize: 1024 }), 'zip-limit');
});

test('not a ZIP file at all is rejected', async () => {
  await assertContainerError(readZip(enc('%PDF-1.7 this is not a zip archive at all')), 'zip-structure');
});
