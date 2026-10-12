import { createContainer } from '@hpro/kern';
import { describe, expect, it } from 'vitest';
import { openContainer, type LoadedDocument } from '../src/document.js';
import { accessOf } from '../src/locks.js';
import { animatedSelectors, buildPrintHtml, cssString, headingKennung, PRINT_CSP, printMediaCss, printMediaQuery, TYPE_AREA } from '../src/print.js';

const INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="de-AT" lang="de-AT">
<head><meta charset="UTF-8"/><title>Druckprobe</title><link rel="stylesheet" type="text/css" href="a.css"/></head>
<body>
  <section id="s1">
    <h1 id="s1-h">Druckprobe</h1>
    <p id="p1">Siehe <a href="#s2">Teil zwei</a>, <a href="b.xhtml#s1">Anhang</a> und <a href="https://example.org/x">Quelle</a>.</p>
    <figure id="film"><video id="v1" src="v.webm" poster="still.png" controls="controls" aria-describedby="cap"></video><figcaption id="cap">Ein Film.</figcaption></figure>
    <video id="v2" src="v.webm" poster="still.png" aria-label="Zweiter Film"></video>
    <figure id="bewegt"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect class="dreht" width="5" height="5"/><circle r="2"><animate attributeName="r" from="2" to="4" dur="1s"/></circle></svg><figcaption>Bewegung.</figcaption></figure>
    <details id="d1"><summary>Mehr</summary><p>Eingeklappt.</p></details>
    <p id="prio" data-hp-priority="3" hidden="hidden">Detail.</p>
  </section>
  <section id="s2"><h2 id="s2-h">Teil zwei</h2><p>Text.</p></section>
  <section id="geheim"><h2>Geheim</h2><p>Nicht drucken.</p></section>
</body>
</html>
`;
const ANHANG = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="de-AT" lang="de-AT">
<head><meta charset="UTF-8"/><title>Anhang</title><link rel="stylesheet" type="text/css" href="a.css"/></head>
<body><section id="s1"><h1>Anhang</h1><p><a href="index.xhtml#s2">zurück</a></p></section></body>
</html>
`;
const CSS = `.dreht { animation: drehen 2s infinite; }
@keyframes drehen { to { transform: rotate(1turn); } }
@media screen { body { max-width: 40em; } }
@media print { h1 { color: black; } }
@media (prefers-reduced-motion: reduce) { .dreht { animation: none; } }`;

async function fixture(): Promise<LoadedDocument> {
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
  const created = await createContainer({
    id: 'urn:uuid:00000000-0000-4000-8000-000000000018',
    title: 'Druckprobe "P18"',
    language: 'de-AT',
    modified: '2026-10-12T15:00:00Z',
    readingOrder: ['content/index.xhtml', 'content/b.xhtml'],
    toc: {
      title: 'Inhalt',
      entries: [
        { title: 'Druckprobe', href: 'content/index.xhtml#s1' },
        { title: 'Teil zwei', href: 'content/index.xhtml#s2' },
        { title: 'Geheim', href: 'content/index.xhtml#geheim' },
        { title: 'Anhang', href: 'content/b.xhtml#s1' },
      ],
    },
    access: [{ target: 'content/index.xhtml#geheim', rules: ['no-print'] }],
    resources: [
      { path: 'content/index.xhtml', mediaType: 'application/xhtml+xml', data: INDEX },
      { path: 'content/b.xhtml', mediaType: 'application/xhtml+xml', data: ANHANG },
      { path: 'content/a.css', mediaType: 'text/css', data: CSS },
      { path: 'content/v.webm', mediaType: 'video/webm', data: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]) },
      { path: 'content/still.png', mediaType: 'image/png', data: png },
    ],
  });
  return openContainer(created.bytes, 'druckprobe.hpro');
}

describe('print media queries', () => {
  it('resolves print, screen, reduced motion and colour scheme for paper', () => {
    expect(printMediaQuery('print')).toBe('all');
    expect(printMediaQuery('only print and (min-width: 30em)')).toBe('all and (min-width: 30em)');
    expect(printMediaQuery('screen and (min-width: 30em)')).toBe('not all');
    expect(printMediaQuery('not screen')).toBe('all');
    expect(printMediaQuery('not print')).toBe('not all');
    expect(printMediaQuery('(prefers-reduced-motion: reduce)')).toBe('(min-width: 0px)');
    expect(printMediaQuery('(prefers-reduced-motion: no-preference)')).toBe('(max-width: -1px)');
    expect(printMediaQuery('(prefers-color-scheme: dark), print')).toBe('(max-width: -1px), all');
    expect(printMediaCss('@media screen { a{} } @media print{ b{} }')).toBe('@media not all { a{} } @media all { b{} }');
  });

  it('escapes CSS strings for the running header', () => {
    expect(cssString('Titel "A" \\ B\nC')).toBe('"Titel \\"A\\" \\\\ B C"');
  });

  it('finds the selectors that start an animation', () => {
    expect(animatedSelectors(CSS)).toContain('.dreht');
    expect(animatedSelectors('.a { animation: none; } .b { color: red; }')).toEqual([]);
  });

  it('takes the section id as address of its first heading', () => {
    const doc = new DOMParser().parseFromString('<section id="s"><h2 id="h">A</h2><h3 id="h3">B</h3></section><h2 id="frei">C</h2>', 'text/html');
    expect(headingKennung(doc.getElementById('h')!)).toBe('s');
    expect(headingKennung(doc.getElementById('h3')!)).toBe('h3');
    expect(headingKennung(doc.getElementById('frei')!)).toBe('frei');
  });

  it('measures with the type area of print.css', () => {
    expect(TYPE_AREA).toEqual({ width: 170, height: 255 });
  });
});

describe('buildPrintHtml', () => {
  it('derives the print document: title block, contents, addresses, stills, locks', async () => {
    const doc = await fixture();
    const built = buildPrintHtml(doc, { locks: { access: accessOf(doc.manifest), sealed: [], showHidden: false }, now: new Date('2026-10-12T16:00:00Z') });
    const out = new DOMParser().parseFromString(built.html, 'text/html');
    // Own policy without network, no script, every content document in reading order.
    expect(out.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toBe(PRINT_CSP);
    expect(out.querySelectorAll('script, video, audio')).toHaveLength(0);
    expect(Array.from(out.querySelectorAll('article')).map((a) => a.getAttribute('data-hp-doc'))).toEqual(['content/index.xhtml', 'content/b.xhtml']);
    expect(out.querySelector('article[data-hp-doc="content/b.xhtml"]')?.hasAttribute('data-hp-neue-seite')).toBe(true);
    // Running header with the escaped title; title block with id and dateModified.
    expect(out.querySelector('style[data-hp-reader="print"]')?.textContent).toContain('@top-left { content: "Druckprobe \\"P18\\""; }');
    const title = out.querySelector('.hp-print-titel')?.textContent ?? '';
    expect(title).toContain('urn:uuid:00000000-0000-4000-8000-000000000018');
    expect(title).toContain('2026-10-12T15:00:00Z');
    // Document CSS resolved for paper.
    const css = Array.from(out.querySelectorAll('style[data-hp-source]')).map((s) => s.textContent).join('\n');
    expect(css).toContain('@media not all {');
    expect(css).toContain('@media all {');
    expect(css).toContain('@media (min-width: 0px) {');
    // Table of contents: address and page slot; a locked target says so.
    const toc = Array.from(out.querySelectorAll('.hp-print-toc li')).map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
    expect(toc).toEqual(['Druckprobe#s1S. 000', 'Teil zwei#s2S. 000', 'Geheim#geheimnicht im Ausdruck (Sperre)', 'Anhang#s1S. 000']);
    // Id clash between documents: the second "s1" is renamed in print, the address stays.
    expect(out.querySelector('.hp-print-toc li:nth-child(4) a')?.getAttribute('href')).toBe('#d2-s1');
    expect(out.querySelector('article[data-hp-doc="content/b.xhtml"] section')?.id).toBe('d2-s1');
    // Headings carry their section address.
    expect(out.getElementById('s1-h')?.getAttribute('data-hp-kennung')).toBe('s1');
    expect(built.headings.map((h) => h.kennung)).toEqual(['s1', 's2', 's1']);
    // Links: page slot and address inside; across documents with the path; external keeps href.
    const refs = Array.from(out.querySelectorAll('.hp-verweis')).map((r) => r.textContent?.replace(/ /g, ' '));
    expect(refs).toEqual([' (S. 000, #s2)', ' (S. 000, content/b.xhtml#s1)', ' (S. 000, content/index.xhtml#s2)']);
    expect(out.querySelector('#p1 a[href^="https:"]')?.getAttribute('href')).toBe('https://example.org/x');
    // Video in a figure: poster as still, caption kept, address added; a bare video gets a figure.
    const film = out.getElementById('film')!;
    expect(film.querySelector('img.hp-print-still-img')?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(film.querySelector('figcaption')?.textContent).toContain('Ein Film.');
    expect(film.querySelector('figcaption')?.textContent).toContain('Lebendige Fassung: content/index.xhtml#v1');
    const v2 = out.getElementById('v2')!;
    expect(v2.localName).toBe('img');
    expect(v2.closest('figure')?.querySelector('figcaption')?.textContent).toBe('Zweiter FilmVideo, im Ausdruck als Standbild. Lebendige Fassung: content/index.xhtml#v2');
    // Animation (CSS and SMIL): frozen, noted on its figure; SMIL elements removed.
    expect(out.getElementById('bewegt')?.querySelector('figcaption')?.textContent).toContain('Lebendige Fassung: content/index.xhtml#bewegt');
    expect(out.querySelectorAll('animate')).toHaveLength(0);
    expect(built.live.map((l) => `${l.kind} ${l.address}`)).toEqual(['video content/index.xhtml#v1', 'video content/index.xhtml#v2', 'animation content/index.xhtml#bewegt']);
    // details open, hidden priority block shown, no-print section gone with notice.
    expect(out.getElementById('d1')?.hasAttribute('open')).toBe(true);
    expect(out.getElementById('prio')?.hasAttribute('hidden')).toBe(false);
    expect(out.getElementById('geheim')).toBeNull();
    expect(out.body.textContent).not.toContain('Nicht drucken.');
    expect(out.body.textContent).toContain('Abschnitt geheim nicht zum Druck freigegeben');
    expect(built.omitted).toEqual(['content/index.xhtml#geheim']);
    expect(built.tocEntries).toBe(4);
  });
});
