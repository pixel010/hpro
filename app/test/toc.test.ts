import { describe, expect, it } from 'vitest';
import { flattenToc, parseToc, tocFromHeadings } from '../src/toc.js';

function xhtml(body: string): Document {
  return new DOMParser().parseFromString(
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>t</title></head><body>${body}</body></html>`,
    'application/xhtml+xml',
  );
}

describe('toc', () => {
  it('reads the nav with epub:type="toc" and resolves targets against the nav path (HP-ADR-007)', () => {
    const nav = xhtml(`
      <nav epub:type="landmarks"><ol><li><a href="x.xhtml">Falsch</a></li></ol></nav>
      <nav epub:type="toc"><ol>
        <li><a href="index.xhtml#ueberblick">Überblick</a>
          <ol><li><a href="index.xhtml#leistung">  Leistung
            und Umfang </a></li></ol>
        </li>
        <li><span>Anhang</span><ol><li><a href="anhang/a.xhtml">Anhang A</a></li></ol></li>
      </ol></nav>`);
    const toc = parseToc(nav, 'content/nav.xhtml');
    expect(toc).toEqual([
      {
        label: 'Überblick',
        target: { path: 'content/index.xhtml', id: 'ueberblick' },
        children: [{ label: 'Leistung und Umfang', target: { path: 'content/index.xhtml', id: 'leistung' }, children: [] }],
      },
      // The unlinked `span` heading only groups its children.
      { label: 'Anhang A', target: { path: 'content/anhang/a.xhtml', id: undefined }, children: [] },
    ]);
    expect(flattenToc(toc).map((i) => i.label)).toEqual(['Überblick', 'Leistung und Umfang', 'Anhang A']);
  });

  it('returns an empty list when there is no nav', () => {
    expect(parseToc(xhtml('<p>kein Verzeichnis</p>'), 'content/nav.xhtml')).toEqual([]);
  });

  it('builds a toc from headings with ids when the container has no nav', () => {
    const a = xhtml('<h1 id="a">Erstes</h1><h3 id="a1">Unterpunkt</h3><h2 id="b">Zweites</h2><h2>ohne id</h2>');
    const b = xhtml('<p>nur Text</p>');
    const toc = tocFromHeadings([
      { path: 'content/a.xhtml', title: 'A', dom: a },
      { path: 'content/b.xhtml', title: 'Dokument B', dom: b },
    ]);
    expect(toc).toEqual([
      { label: 'Erstes', target: { path: 'content/a.xhtml', id: 'a' }, children: [{ label: 'Unterpunkt', target: { path: 'content/a.xhtml', id: 'a1' }, children: [] }] },
      { label: 'Zweites', target: { path: 'content/a.xhtml', id: 'b' }, children: [] },
      { label: 'Dokument B', target: { path: 'content/b.xhtml', id: undefined }, children: [] },
    ]);
  });
});
