// The adapter interfaces are types only. This test uses test doubles to check that they
// fit together with the container API (e.g. a PDF import result can be written directly).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContainer, readContainer, sampleDocument, type PdfImport, type PlatformAdapters, type Storage, type StoredFileRef } from '../src/index.js';

test('a PdfImport result is a valid createContainer input', async () => {
  const fakeImport: PdfImport = {
    info: { name: 'FakeImport', location: 'device' },
    availability: async () => ({ available: true }),
    import: async () => ({ document: sampleDocument(), warnings: [{ code: 'untagged-pdf', message: 'test' }], engine: { name: 'fake' } }),
  };
  const result = await fakeImport.import({ pdf: new Uint8Array(), fileName: 'x.pdf' });
  const created = await createContainer(result.document);
  assert.ok(created.readBack.integrity.ok);
});

test('Storage round trip with an in-memory double keeps the container verifiable', async () => {
  const files = new Map<string, Uint8Array>();
  const storage: Storage = {
    info: { name: 'MemoryStorage', location: 'device' },
    availability: async () => ({ available: false, exception: 'A4', reason: 'test double', fallback: 'download' }),
    open: async () => [...files].map(([id, bytes]) => ({ ref: { id, name: id, writableInPlace: true }, bytes })),
    read: async (ref) => ({ ref, bytes: files.get(ref.id)! }),
    save: async (req) => {
      const ref: StoredFileRef = { id: req.target?.id ?? req.suggestedName, name: req.suggestedName, writableInPlace: true };
      files.set(ref.id, req.bytes);
      return ref;
    },
    listLibrary: async () => [...files].map(([id, bytes]) => ({ ref: { id, name: id, writableInPlace: true }, size: bytes.length })),
    removeFromLibrary: async (ref) => void files.delete(ref.id),
  };
  const adapters: PlatformAdapters = { storage, signers: [] };
  const ref = await adapters.storage.save({ bytes: (await createContainer(sampleDocument())).bytes, suggestedName: 'beispiel.hpro' });
  assert.ok(ref);
  const opened = await adapters.storage.read(ref);
  assert.ok((await readContainer(opened.bytes)).integrity.ok);
});
