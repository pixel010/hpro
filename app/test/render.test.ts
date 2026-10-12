import { createContainer } from '@html-pro/kern';
import { describe, expect, it } from 'vitest';
import { openContainer, type LoadedDocument } from '../src/document.js';
import { buildFrameHtml, frameCsp, inlineCss, markHits, type FrameState } from '../src/render.js';
import { searchDocuments } from '../src/search.js';

const XHTML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="de-AT" lang="de-AT">
<head>
  <meta charset="UTF-8"/>
  <title>Prüfseite</title>
  <link rel="stylesheet" type="text/css" href="styles/a.css"/>
  <script>window.boese = 1;</script>
</head>
<body>
  <section id="s1" aria-labelledby="h1">
    <h1 id="h1">Prüfseite</h1>
    <p id="p1" onclick="alert(1)">Ein <em>Geheim</em>wort und noch ein geheimwort.</p>
    <p id="p2"><a href="javascript:alert(2)">böser Verweis</a> <a href="#s1">guter Verweis</a></p>
    <figure id="f1"><img src="media/bild.svg" alt="Bild"/><figcaption>Bild</figcaption></figure>
    <p id="p3"><img src="https://example.org/spion.png" alt="extern"/></p>
    <details id="d1"><summary>Mehr</summary><p id="p4">Geheim auch hier.</p></details>
    <table id="t1" data-hp-table="stack">
      <caption>Werte</caption>
      <thead><tr><th scope="col">Name</th><th scope="col">Wert</th></tr></thead>
      <tbody><tr><th scope="row">A</th><td>1</td></tr></tbody>
    </table>
    <script>window.auchBoese = 1;</script>
  </section>
</body>
</html>
`;

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" role="img" aria-label="Quadrat"><rect width="10" height="10"/></svg>';

const CLEAN = XHTML.replace(/<script>[^<]*<\/script>/g, '').replace(' onclick="alert(1)"', '').replace('javascript:alert(2)', '#p1').replace('<img src="https://example.org/spion.png" alt="extern"/>', '');

/**
 * The core refuses to write scripts into a static container, so the container is built clean
 * and the hostile markup (as another producer might write it) is put in after opening.
 */
async function loadFixture(): Promise<LoadedDocument> {
  const created = await createContainer({
    id: 'urn:uuid:00000000-0000-4000-8000-000000000001',
    title: 'Prüfseite',
    language: 'de-AT',
    modified: '2026-10-12T08:00:00Z',
    readingOrder: ['content/index.xhtml'],
    toc: { title: 'Inhalt', entries: [{ title: 'Prüfseite', href: 'content/index.xhtml#s1' }] },
    resources: [
      { path: 'content/index.xhtml', mediaType: 'application/xhtml+xml', data: CLEAN },
      { path: 'content/styles/a.css', mediaType: 'text/css', data: '@import url("b.css") print;\nbody { background: url(../media/bild.svg); }\n.x { background: url(https://example.org/t.png); }' },
      { path: 'content/styles/b.css', mediaType: 'text/css', data: 'h1 { color: red; }' },
      { path: 'content/media/bild.svg', mediaType: 'image/svg+xml', data: SVG },
    ],
  });
  const doc = await openContainer(created.bytes, 'pruef.hpro');
  const hostile = new DOMParser().parseFromString(XHTML, 'application/xhtml+xml');
  expect(hostile.getElementsByTagName('parsererror')).toHaveLength(0);
  return { ...doc, content: [{ ...doc.content[0]!, dom: hostile }] };
}

const STATE: FrameState = { mode: 'flow', zoom: 1.5, title: 'Prüfseite', vars: { 'font-size': '150%', '--hp-font-size': '1rem' }, scheme: 'dark' };

function build(doc: LoadedDocument, query?: string) {
  const content = doc.content[0]!;
  const built = buildFrameHtml(doc, content, { agent: '/* agent */', agentHash: 'sha256-AAAA', css: '/* reader */', state: STATE, ...(query ? { query } : {}) });
  return { built, dom: new DOMParser().parseFromString(built.html, 'text/html') };
}

describe('frame HTML (render.ts)', () => {
  it('starts with a CSP without network sources and allows only the agent script', async () => {
    const { dom } = build(await loadFixture());
    const first = dom.head.firstElementChild;
    expect(first?.getAttribute('charset')).toBe('utf-8');
    const csp = dom.head.querySelector('meta[http-equiv="Content-Security-Policy"]');
    expect(csp?.getAttribute('content')).toBe(frameCsp('sha256-AAAA'));
    expect(frameCsp('sha256-AAAA')).toContain("connect-src 'none'");
    expect(frameCsp('sha256-AAAA')).toContain("script-src 'sha256-AAAA'");
    expect(frameCsp('sha256-AAAA')).not.toMatch(/https?:|'unsafe-eval'|\*/);
    const scripts = Array.from(dom.querySelectorAll('script'));
    expect(scripts.map((s) => s.textContent)).toEqual(['/* agent */']);
  });

  it('removes event handlers and javascript: URLs, keeps fragment links', async () => {
    const { dom } = build(await loadFixture());
    expect(dom.querySelector('[onclick]')).toBeNull();
    const links = Array.from(dom.querySelectorAll('#p2 a'));
    expect(links[0]?.hasAttribute('href')).toBe(false);
    expect(links[1]?.getAttribute('href')).toBe('#s1');
  });

  it('inlines container resources as data: URLs and drops external ones', async () => {
    const { dom } = build(await loadFixture());
    expect(dom.querySelector('#f1 img')?.getAttribute('src')).toMatch(/^data:image\/svg\+xml;base64,/);
    const external = dom.querySelector('#p3 img');
    expect(external?.hasAttribute('src')).toBe(false);
    expect(external?.getAttribute('data-hp-missing')).toBe('https://example.org/spion.png');
    const styles = Array.from(dom.querySelectorAll('head style')).map((s) => s.textContent ?? '');
    expect(styles[0]).toBe('/* reader */');
    const docCss = styles.slice(1).join('\n');
    expect(docCss).toContain('@media print {\nh1 { color: red; }\n}');
    expect(docCss).toMatch(/url\("data:image\/svg\+xml;base64,[^"]+"\)/);
    expect(docCss).toContain('url("data:,")');
    expect(docCss).not.toContain('example.org');
    expect(dom.querySelector('link')).toBeNull();
  });

  it('passes the reader state to the agent and the root element', async () => {
    const { dom } = build(await loadFixture());
    const html = dom.documentElement;
    expect(JSON.parse(html.getAttribute('data-hp-init') ?? '{}')).toEqual(STATE);
    expect(html.getAttribute('lang')).toBe('de-AT');
    expect(html.getAttribute('data-hp-scheme')).toBe('dark');
    expect(html.getAttribute('style')).toBe('font-size: 150%; --hp-font-size: 1rem');
  });

  it('wraps tables in a labelled scroll region and labels cells for "stack"', async () => {
    const { dom } = build(await loadFixture());
    const wrap = dom.querySelector('[data-hp-wrap]');
    expect(wrap?.getAttribute('role')).toBe('region');
    expect(wrap?.getAttribute('aria-label')).toBe('Tabelle: Werte');
    expect(wrap?.firstElementChild?.id).toBe('t1');
    expect(Array.from(dom.querySelectorAll('#t1 tbody [data-hp-label]')).map((c) => c.getAttribute('data-hp-label'))).toEqual(['Name', 'Wert']);
  });

  it('marks exactly the hits the search lists, with the same numbering', async () => {
    const doc = await loadFixture();
    const result = searchDocuments(doc.content, 'geheim');
    const { built, dom } = build(doc, 'geheim');
    expect(result.hits).toHaveLength(3);
    expect(built.hits).toBe(3);
    const ordinals = [...new Set(Array.from(dom.querySelectorAll('mark[data-hp-hit]')).map((m) => m.getAttribute('data-hp-hit')))];
    expect(ordinals).toEqual(['0', '1', '2']);
    // A hit across inline markup is split into pieces with one number.
    expect(Array.from(dom.querySelectorAll('mark[data-hp-hit="0"]')).map((m) => m.textContent)).toEqual(['Geheim']);
    expect(dom.querySelector('mark[data-hp-hit="2"]')?.closest('details')?.id).toBe('d1');
    // The marked frame text is unchanged.
    expect(dom.querySelector('#p1')?.textContent).toBe('Ein Geheimwort und noch ein geheimwort.');
  });
});

describe('markHits', () => {
  it('handles several hits in one text node and hits across nodes', () => {
    const dom = new DOMParser().parseFromString('<p>aXa aXa</p><p>a<b>X</b>a</p>', 'text/html');
    expect(markHits(dom.body, 'axa')).toBe(3);
    expect(dom.body.innerHTML).toBe(
      '<p><mark data-hp-hit="0">aXa</mark> <mark data-hp-hit="1">aXa</mark></p><p><mark data-hp-hit="2">a</mark><b><mark data-hp-hit="2">X</mark></b><mark data-hp-hit="2">a</mark></p>',
    );
  });
});

describe('inlineCss', () => {
  it('keeps fragment and data URLs and stops at absolute imports', () => {
    const resolver = { dataUrl: () => 'data:x', text: () => undefined };
    expect(inlineCss('a.css', 'a { filter: url(#f); b: url(data:abc); } @import "https://example.org/x.css";', resolver)).toBe('a { filter: url(#f); b: url(data:abc); } ');
  });
});
