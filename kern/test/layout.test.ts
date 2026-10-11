// Acceptance: the container follows the rules from docs/05 and prototyp/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { createContainer, readZip, sampleDocument, type HproManifest } from '../src/index.js';
import { nodeSri, text } from './helpers.js';

test('mimetype is the first entry, stored, without extra field, at offset 0', async () => {
  const { bytes } = await createContainer(sampleDocument());
  // Raw bytes, as epubcheck and file(1) look at them: local header, then name, then content.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50, 'local file header signature at offset 0');
  assert.equal(view.getUint16(8, true), 0, 'compression method 0 (stored)');
  assert.equal(view.getUint16(26, true), 8, 'name length');
  assert.equal(view.getUint16(28, true), 0, 'extra field length');
  assert.equal(text(bytes.subarray(30, 38)), 'mimetype');
  assert.equal(text(bytes.subarray(38, 58)), 'application/epub+zip');
  assert.equal(view.getUint32(18, true), 20, 'compressed size equals content length');
});

test('entry order: mimetype, container.xml, package.opf, manifest.json, then resources sorted', async () => {
  const { bytes } = await createContainer(sampleDocument());
  const names = (await readZip(bytes)).map((e) => e.name);
  assert.deepEqual(names, [
    'mimetype',
    'META-INF/container.xml',
    'package.opf',
    'manifest.json',
    'content/anhang.xhtml',
    'content/index.xhtml',
    'content/media/lieferplan.svg',
    'content/nav.xhtml',
    'content/styles/document.css',
  ]);
});

test('container.xml points to package.opf', async () => {
  const { readBack } = await createContainer(sampleDocument());
  assert.equal(readBack.packagePath, 'package.opf');
  const xml = text(readBack.files.get('META-INF/container.xml')!);
  assert.match(xml, /<rootfile full-path="package\.opf" media-type="application\/oebps-package\+xml"\/>/);
});

test('package.opf: metadata, manifest items, nav property and spine in reading order', async () => {
  const input = sampleDocument();
  const { readBack } = await createContainer(input);
  const doc = new DOMParser().parseFromString(text(readBack.files.get('package.opf')!), 'text/xml');
  const opf = 'http://www.idpf.org/2007/opf';
  const items = Array.from({ length: doc.getElementsByTagNameNS(opf, 'item').length }, (_, i) => doc.getElementsByTagNameNS(opf, 'item').item(i)!);
  const byHref = new Map(items.map((it) => [it.getAttribute('href'), it]));
  // Every entry except mimetype, META-INF and the OPF itself must be declared.
  const expected = [...readBack.files.keys()].filter((p) => p !== 'mimetype' && !p.startsWith('META-INF/') && p !== 'package.opf').sort();
  assert.deepEqual([...byHref.keys()].sort(), expected);
  assert.equal(byHref.get('content/nav.xhtml')!.getAttribute('properties'), 'nav');
  assert.equal(byHref.get('manifest.json')!.getAttribute('media-type'), 'application/json');
  const idToHref = new Map(items.map((it) => [it.getAttribute('id'), it.getAttribute('href')]));
  const itemrefs = doc.getElementsByTagNameNS(opf, 'itemref');
  const spine = Array.from({ length: itemrefs.length }, (_, i) => idToHref.get(itemrefs.item(i)!.getAttribute('idref')));
  assert.deepEqual(spine, input.readingOrder);
  const dc = 'http://purl.org/dc/elements/1.1/';
  assert.equal(doc.getElementsByTagNameNS(dc, 'identifier').item(0)!.textContent, input.id);
  assert.equal(doc.getElementsByTagNameNS(dc, 'language').item(0)!.textContent, 'de-AT');
});

test('manifest.json lists every covered entry with a SHA-256 that node:crypto confirms', async () => {
  const { readBack } = await createContainer(sampleDocument());
  const manifest = JSON.parse(text(readBack.files.get('manifest.json')!)) as HproManifest;
  const covered = [...readBack.files.keys()].filter((p) => p !== 'mimetype' && p !== 'manifest.json' && !p.startsWith('META-INF/')).sort();
  assert.deepEqual(manifest.resources.map((r) => r.url), covered);
  for (const r of manifest.resources) {
    assert.equal(r.integrity, nodeSri(readBack.files.get(r.url)!), `hash of ${r.url}`);
  }
  assert.equal(manifest.conformsTo, 'https://html-pro.example/spec/0.1/profile/static');
  assert.deepEqual(manifest.readingOrder.map((l) => l.url), ['content/index.xhtml', 'content/anhang.xhtml']);
  assert.ok(readBack.integrity.ok);
  assert.equal(readBack.integrity.resources.length, covered.length);
});

test('navigation document links relative to its own location', async () => {
  const { readBack } = await createContainer(sampleDocument());
  const nav = text(readBack.files.get('content/nav.xhtml')!);
  assert.match(nav, /<nav epub:type="toc" id="toc">/);
  assert.match(nav, /<a href="index\.xhtml#b1">Prüfdokument html-Pro<\/a>/);
  assert.match(nav, /<a href="anhang\.xhtml#c1">Anhang: Lieferplan<\/a>/);
});
