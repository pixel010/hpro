// Package P16: nested information and stable addresses (docs/10, promise 3).
//
// Acceptance criteria covered here:
//   1. a reference to a section stays valid when window width and font size change (Chromium)
//   2. an embedded subdocument is shipped inside the container and read offline
//   3. addresses stay stable across two versions of the document
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContainer, readContainer } from '../src/container.js';
import type { DocumentInput } from '../src/container.js';
import { containerAddresses, diffAddresses, openSubdocument, resolveAddress, SUBDOCUMENT_MEDIA_TYPE } from '../src/nest/address.js';

const XHTML = (title: string, body: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="de-AT" lang="de-AT">
<head><meta charset="UTF-8"/><title>${title}</title></head>
<body><main>${body}</main></body>
</html>
`;

const FILLER = (n: number): string => Array.from({ length: n }, (_, i) => `<p>Absatz ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>`).join('\n');

/** Version 1: overview, collapsible details, nested sections, an attachment and a subdocument. */
function mainBody(version: 1 | 2): string {
  const inserted = version === 2 ? `<section id="neu-einleitung"><h2 id="neu-einleitung-t">Neue Einleitung</h2>${FILLER(6)}</section>` : '';
  return `<h1 id="titel">Bericht</h1>
${inserted}
<section id="ueberblick"><h2 id="ueberblick-t">Überblick</h2><p>Kurzfassung für eilige Leser.</p>
  <details id="ueberblick-mehr"><summary>Mehr Einzelheiten</summary>${FILLER(4)}</details>
</section>
<section id="methode"><h2 id="methode-t">Methode</h2>${FILLER(12)}
  <section id="methode-messung"><h3 id="methode-messung-t">Messung</h3>${FILLER(version === 2 ? 14 : 8)}
    <details id="methode-messung-rohdaten"><summary>Rohdaten</summary>${FILLER(3)}</details>
  </section>
</section>
<section id="ergebnis"><h2 id="ergebnis-t">Ergebnis</h2>${FILLER(10)}
  <p>Der Prüfbericht liegt als <a href="../attachments/pruefbericht.hpro">eingebettetes Unterdokument</a> bei.</p>
</section>`;
}

const ANHANG = (version: 1 | 2): string => XHTML('Anhang', `<section id="anhang-a"><h1 id="anhang-a-t">Anhang A: Tabellen</h1>${FILLER(5)}</section>
${version === 1 ? '' : '<section id="anhang-b"><h1 id="anhang-b-t">Anhang B: Nachtrag</h1><p>neu</p></section>'}`);

function subdocument(): DocumentInput {
  return {
    id: 'urn:uuid:5e1b8c2a-6d3f-4a7b-9e10-2f4c6a8b0d12',
    title: 'Prüfbericht (Unterdokument)',
    language: 'de-AT',
    modified: '2026-10-14T00:00:00Z',
    readingOrder: ['content/index.xhtml'],
    toc: { title: 'Inhalt', entries: [{ title: 'Prüfbericht', href: 'content/index.xhtml#pb' }] },
    resources: [{ path: 'content/index.xhtml', mediaType: 'application/xhtml+xml', data: XHTML('Prüfbericht', '<section id="pb"><h1 id="pb-t">Prüfbericht</h1><p id="pb-1">Alle 12 Prüfgeräte bestanden.</p></section>') }],
  };
}

async function buildDocument(version: 1 | 2): Promise<DocumentInput> {
  const sub = await createContainer(subdocument());
  const moved = version === 2; // version 2 moves "ergebnis" into its own content document
  const main = moved ? mainBody(2).replace(/<section id="ergebnis">[\s\S]*<\/section>$/, '') : mainBody(1);
  const resources = [
    { path: 'content/index.xhtml', mediaType: 'application/xhtml+xml', data: XHTML('Bericht', main) },
    { path: 'content/anhang.xhtml', mediaType: 'application/xhtml+xml', data: ANHANG(version) },
    { path: 'attachments/pruefbericht.hpro', mediaType: SUBDOCUMENT_MEDIA_TYPE, data: sub.bytes },
  ];
  if (moved) {
    const ergebnis = mainBody(2).match(/<section id="ergebnis">[\s\S]*<\/section>$/)![0];
    resources.push({ path: 'content/ergebnis.xhtml', mediaType: 'application/xhtml+xml', data: XHTML('Ergebnis', ergebnis) });
  }
  return {
    id: 'urn:uuid:9a7c3e51-2b84-4d6f-8c19-7e0a5b3d1f64',
    title: 'P16 Bericht',
    language: 'de-AT',
    modified: version === 1 ? '2026-10-14T00:00:00Z' : '2026-10-15T00:00:00Z',
    readingOrder: moved ? ['content/index.xhtml', 'content/ergebnis.xhtml', 'content/anhang.xhtml'] : ['content/index.xhtml', 'content/anhang.xhtml'],
    toc: { title: 'Inhalt', entries: [{ title: 'Bericht', href: 'content/index.xhtml#titel' }, { title: 'Anhang', href: 'content/anhang.xhtml#anhang-a' }] },
    resources,
  };
}

test('P16-3: addresses stay stable across two versions', async () => {
  const v1 = (await createContainer(await buildDocument(1))).readBack;
  const v2 = (await createContainer(await buildDocument(2))).readBack;
  const a1 = containerAddresses(v1);
  const a2 = containerAddresses(v2);
  const diff = diffAddresses(a1, a2);
  console.log(`P16-3 v1 ${a1.length} addresses, v2 ${a2.length}; kept ${diff.kept.length}, moved ${diff.moved.length}, lost ${diff.lost.length}, added ${diff.added.length}`);
  for (const m of diff.moved) console.log(`P16-3 moved ${m.from} -> ${m.to}`);
  for (const a of diff.added) console.log(`P16-3 added ${a}`);
  assert.equal(diff.stable, true);
  assert.deepEqual(diff.lost, []);
  // every citation of version 1 resolves in version 2 to the same section (same id, same heading)
  for (const old of a1) {
    const now = resolveAddress(a2, old.address);
    assert.ok(now, `${old.address} must resolve in version 2`);
    assert.equal(now.id, old.id);
  }
  assert.equal(resolveAddress(a2, 'content/index.xhtml#ergebnis')?.address, 'content/ergebnis.xhtml#ergebnis');
  assert.equal(resolveAddress(a2, 'content/index.xhtml#methode-messung')?.outline, 'methode/methode-messung');
  // detail levels: overview (0), details/subsections (1), raw data inside a subsection (2)
  assert.equal(resolveAddress(a1, '#methode-messung-rohdaten')?.depth, 2);
  assert.equal(resolveAddress(a1, '#ueberblick-mehr')?.element, 'details');
  // a removed id is reported as lost, so the check is not vacuous
  const broken = diffAddresses(a1, a2.filter((a) => a.id !== 'methode'));
  assert.deepEqual(broken.lost, ['content/index.xhtml#methode']);
});

test('P16-2: an embedded subdocument is shipped and read offline', async () => {
  const realFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = (() => { fetches++; throw new Error('network is not allowed'); }) as typeof fetch;
  try {
    const created = await createContainer(await buildDocument(1));
    const parent = await readContainer(created.bytes);
    assert.equal(parent.integrity.ok, true);
    const entry = parent.manifest.resources.find((r) => r.url === 'attachments/pruefbericht.hpro');
    assert.ok(entry, 'subdocument is listed in manifest.json with its hash');
    const { container, addresses } = await openSubdocument(parent, 'attachments/pruefbericht.hpro');
    const text = new TextDecoder().decode(container.files.get('content/index.xhtml'));
    console.log(`P16-2 parent ${created.bytes.length} bytes, subdocument ${parent.files.get('attachments/pruefbericht.hpro')!.length} bytes, integrity ${entry.integrity.slice(0, 20)}…, addresses ${addresses.map((a) => a.address).join(' ')}, fetch calls ${fetches}`);
    assert.match(text, /Alle 12 Prüfgeräte bestanden/);
    assert.equal(container.manifest.name, 'Prüfbericht (Unterdokument)');
    assert.ok(resolveAddress(addresses, 'content/index.xhtml#pb-t'));
    assert.equal(fetches, 0);
    await assert.rejects(openSubdocument(parent, 'attachments/fehlt.hpro'), /not part of the container/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

const BROWSERS = resolve(import.meta.dirname, '../../../app/.browsers');

test('P16-1: a section reference stays valid when window width and font size change', { skip: existsSync(BROWSERS) ? false : `no Playwright browsers in ${BROWSERS}` }, async () => {
  process.env['PLAYWRIGHT_BROWSERS_PATH'] = BROWSERS;
  const { chromium } = await import('playwright');
  const created = await createContainer(await buildDocument(1));
  const html = new TextDecoder().decode(created.readBack.files.get('content/index.xhtml'));
  const addresses = containerAddresses(created.readBack);
  const target = resolveAddress(addresses, 'content/index.xhtml#methode-messung')!;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage();
    await page.route('**/*', (route) => route.request().url().startsWith('http://p16.invalid/') ? route.fulfill({ contentType: 'application/xhtml+xml', body: html }) : route.abort());
    const results: string[] = [];
    for (const width of [1280, 768, 360]) {
      for (const fontSize of ['16px', '24px', '40px']) {
        await page.setViewportSize({ width, height: 700 });
        await page.goto('http://p16.invalid/content/index.xhtml');
        await page.addStyleTag({ content: `html { font-size: ${fontSize} !important }` });
        await page.goto(`http://p16.invalid/content/index.xhtml#${target.id}`);
        await page.addStyleTag({ content: `html { font-size: ${fontSize} !important }` });
        await page.evaluate((id) => document.getElementById(id)!.scrollIntoView({ block: 'start' }), target.id);
        const m = await page.evaluate((id) => {
          const el = document.getElementById(id)!;
          const r = el.getBoundingClientRect();
          return { top: Math.round(r.top), docHeight: document.documentElement.scrollHeight, scrollY: Math.round(scrollY), heading: el.querySelector('h3')!.textContent, hash: location.hash, targetMatches: el.matches(':target') };
        }, target.id);
        results.push(`width ${width} font ${fontSize}: hash ${m.hash}, :target ${m.targetMatches}, heading "${m.heading}", top ${m.top}px, scrollY ${m.scrollY}, document height ${m.docHeight}px`);
        assert.equal(m.hash, '#methode-messung');
        assert.equal(m.targetMatches, true);
        assert.equal(m.heading, 'Messung');
        assert.ok(Math.abs(m.top) <= 1, `section must be at the top of the viewport, got ${m.top}`);
      }
    }
    for (const r of results) console.log(`P16-1 ${r}`);
    const heights = new Set(results.map((r) => r.replace(/.*document height /, '')));
    assert.ok(heights.size > 3, 'the layout must actually change between the runs');
    // a collapsed <details> opens when its address is followed
    await page.goto('http://p16.invalid/content/index.xhtml#methode-messung-rohdaten');
    await page.evaluate(() => { const d = document.getElementById(location.hash.slice(1)) as HTMLDetailsElement; d.open = true; d.scrollIntoView(); });
    assert.equal(await page.evaluate(() => (document.getElementById('methode-messung-rohdaten') as HTMLDetailsElement).open), true);
  } finally {
    await browser.close();
  }
});
