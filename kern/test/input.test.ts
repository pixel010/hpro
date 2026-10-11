// Input validation: the core refuses to write containers that break the format rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContainer, sampleDocument, type DocumentInput, type ResourceInput } from '../src/index.js';
import { assertContainerError, text } from './helpers.js';

const XHTML = (body: string, head = '') => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="de" lang="de">
<head><meta charset="UTF-8"/><title>T</title>${head}</head>
<body>${body}</body>
</html>
`;

function withIndex(body: string, extra: ResourceInput[] = [], overrides: Partial<DocumentInput> = {}): DocumentInput {
  const doc = sampleDocument();
  return {
    ...doc,
    resources: [...doc.resources.map((r) => (r.path === 'content/index.xhtml' ? { ...r, data: XHTML(body) } : r)), ...extra],
    ...overrides,
  };
}

test('script in profile static is rejected', async () => {
  await assertContainerError(createContainer(withIndex('<p>a</p><script>alert(1)</script>')), 'input', /not allowed in profile "static"/);
});

test('event handler attributes are rejected in every profile', async () => {
  await assertContainerError(createContainer(withIndex('<p onclick="x()">a</p>', [], { profile: 'interactive' })), 'input', /event handler/);
});

test('javascript: URLs are rejected', async () => {
  await assertContainerError(createContainer(withIndex('<p><a href="javascript:alert(1)">a</a></p>')), 'input', /javascript:/);
});

test('profile interactive allows scripts only from components/ and marks the item as scripted', async () => {
  const component = { path: 'components/hp-components@0.1.0/form.js', mediaType: 'application/javascript', data: '// component\n' };
  await assertContainerError(
    createContainer(withIndex('<p>a</p><script>alert(1)</script>', [component], { profile: 'interactive' })),
    'input',
    /only allows <script src>/,
  );
  const ok = await createContainer(withIndex('<p>a</p><script src="../components/hp-components@0.1.0/form.js"></script>', [component], { profile: 'interactive' }));
  const opf = text(ok.readBack.files.get('package.opf')!);
  assert.match(opf, /href="content\/index\.xhtml" media-type="application\/xhtml\+xml" properties="scripted"/);
  assert.equal(ok.manifest.conformsTo, 'https://html-pro.example/spec/0.1/profile/interactive');
});

test('script inside an SVG file is rejected', async () => {
  const doc = sampleDocument();
  const evil = doc.resources.map((r) =>
    r.path.endsWith('.svg') ? { ...r, data: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' } : r,
  );
  await assertContainerError(createContainer({ ...doc, resources: evil }), 'input', /SVG/);
});

test('external resources are rejected, external hyperlinks are allowed', async () => {
  await assertContainerError(createContainer(withIndex('<p><img src="https://example.org/x.png" alt="x"/></p>')), 'input', /external resource/);
  const ok = await createContainer(withIndex('<p><a href="https://example.org/">Verweis</a></p>'));
  assert.ok(ok.readBack.integrity.ok);
});

test('reference to a resource that is not in the container is rejected', async () => {
  await assertContainerError(createContainer(withIndex('<p><img src="media/fehlt.png" alt="x"/></p>')), 'input', /does not exist/);
});

test('inline SVG in XHTML sets the svg property', async () => {
  const ok = await createContainer(withIndex('<p>a</p><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>'));
  assert.match(text(ok.readBack.files.get('package.opf')!), /href="content\/index\.xhtml" media-type="application\/xhtml\+xml" properties="svg"/);
});

test('malformed XHTML and HTML-only entities are rejected', async () => {
  await assertContainerError(createContainer(withIndex('<p>offen</div>')), 'input', /not well-formed/);
  await assertContainerError(createContainer(withIndex('<p>a&nbsp;b</p>')), 'input', /entity/);
});

test('reserved and invalid paths are rejected', async () => {
  const add = (path: string): DocumentInput => withIndex('<p>a</p>', [{ path, mediaType: 'text/plain', data: 'x' }]);
  await assertContainerError(createContainer(add('manifest.json')), 'input', /reserved/);
  await assertContainerError(createContainer(add('META-INF/foo.xml')), 'input', /reserved/);
  await assertContainerError(createContainer(add('content/a:b.txt')), 'input', /not allowed in OCF/);
  await assertContainerError(createContainer(add('content/datei.')), 'input', /full stop/);
  await assertContainerError(createContainer(add('content/Index.XHTML')), 'input', /collides/);
  await assertContainerError(createContainer(add('../x.txt')), 'input');
});

test('invalid metadata is rejected', async () => {
  await assertContainerError(createContainer({ ...sampleDocument(), modified: '2026-10-11' }), 'input', /modified/);
  await assertContainerError(createContainer({ ...sampleDocument(), modified: '2026-02-30T00:00:00Z' }), 'input', /modified/);
  await assertContainerError(createContainer({ ...sampleDocument(), language: 'deutsch österreich' }), 'input', /language/);
  await assertContainerError(createContainer({ ...sampleDocument(), readingOrder: ['content/styles/document.css'] }), 'input', /XHTML/);
  await assertContainerError(createContainer({ ...sampleDocument(), readingOrder: ['content/fehlt.xhtml'] }), 'input', /does not exist/);
});

test('table of contents must point into the container', async () => {
  const doc = sampleDocument();
  await assertContainerError(createContainer({ ...doc, toc: { title: 'Inhalt', entries: [{ title: 'x', href: 'content/fehlt.xhtml' }] } }), 'input', /table of contents/);
});

test('XML special characters in metadata are escaped', async () => {
  const ok = await createContainer({ ...sampleDocument(), title: 'Angebot <Nr. 7> & "Anhang"' });
  const opf = text(ok.readBack.files.get('package.opf')!);
  assert.match(opf, /<dc:title>Angebot &lt;Nr\. 7&gt; &amp; &quot;Anhang&quot;<\/dc:title>/);
  assert.equal(ok.manifest.name, 'Angebot <Nr. 7> & "Anhang"');
});

test('non-ASCII file names are written as UTF-8 and read back', async () => {
  const doc = sampleDocument();
  const ok = await createContainer({ ...doc, resources: [...doc.resources, { path: 'data/größen.json', mediaType: 'application/json', data: '{"a":1}\n' }] });
  assert.ok(ok.readBack.files.has('data/größen.json'));
  assert.ok(ok.readBack.integrity.resources.some((r) => r.path === 'data/größen.json' && r.status === 'ok'));
  assert.match(text(ok.readBack.files.get('package.opf')!), /href="data\/gr%C3%B6%C3%9Fen\.json"/);
});
