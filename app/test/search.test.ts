import { describe, expect, it } from 'vitest';
import { buildTextModel, findMatches, foldQuery, matchPieces, READER_MARK, searchDocuments } from '../src/search.js';

function html(body: string): Document {
  return new DOMParser().parseFromString(`<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`, 'text/html');
}

describe('search (HP-RS-003)', () => {
  it('folds case, combining marks and whitespace in the query', () => {
    expect(foldQuery('  Über   Blick ')).toBe('uber blick');
    expect(foldQuery('Maß')).toBe('maß');
  });

  it('matches across inline markup but not across block boundaries', () => {
    const dom = html('<p>Ein <em>Über</em>blick</p><p>Ende</p><p>Anfang</p>');
    const model = buildTextModel(dom.body);
    const [m] = findMatches(model, foldQuery('uberblick'));
    expect(m).toBeDefined();
    expect(model.text.slice(m!.start, m!.end)).toBe('Überblick');
    expect(matchPieces(model, m!).map((p) => p.node.data.slice(p.start, p.end))).toEqual(['Über', 'blick']);
    expect(findMatches(model, foldQuery('endeanfang'))).toEqual([]);
  });

  it('skips script, style and reader-added elements, but includes collapsed details', () => {
    const dom = html(`<script>var geheim = 1;</script><p ${READER_MARK}="">geheim</p><details><summary>Mehr</summary><p>geheim versteckt</p></details>`);
    const model = buildTextModel(dom.body);
    expect(findMatches(model, foldQuery('geheim'))).toHaveLength(1);
  });

  it('lists hits per document with ordinal, address id and snippet', () => {
    const a = html('<h2 id="leistung">Leistung</h2><p>Die Leistung umfasst die Leistung.</p>');
    const b = html('<section id="anhang"><p>Keine <strong>LEISTUNG</strong> hier?</p></section>');
    const result = searchDocuments(
      [
        { path: 'content/a.xhtml', title: 'A', dom: a },
        { path: 'content/b.xhtml', title: 'B', dom: b },
      ],
      'leistung',
    );
    expect(result.truncated).toBe(false);
    expect(result.hits.map((h) => [h.path, h.ordinal, h.id])).toEqual([
      ['content/a.xhtml', 0, 'leistung'],
      ['content/a.xhtml', 1, 'leistung'],
      ['content/a.xhtml', 2, 'leistung'],
      ['content/b.xhtml', 0, 'anhang'],
    ]);
    expect(result.hits[3]!.snippet).toEqual({ before: 'Keine ', hit: 'LEISTUNG', after: ' hier?' });
  });

  it('reports a truncated list when the hit limit is reached', () => {
    const dom = html('<p>a a a a a</p>');
    const result = searchDocuments([{ path: 'x.xhtml', title: 'X', dom }], 'a', 3);
    expect(result.hits).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it('returns no hits for an empty query', () => {
    expect(searchDocuments([{ path: 'x.xhtml', title: 'X', dom: html('<p>x</p>') }], '   ').hits).toEqual([]);
  });
});
