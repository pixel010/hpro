/**
 * Annotations in the reader (P7): marks in the frame copy (passages over several text nodes,
 * numbered buttons, drawings built from checked path data), and the session: selection → quote,
 * new annotations, deletion with answers, import without silent loss, saving through the core.
 */
import { annotate, createContainer } from '@hpro/kern';
import { describe, expect, it } from 'vitest';
import { openContainer, type LoadedDocument } from '../src/document.js';
import { AnnotationSession, markAnnotationText, placeInk, type AnnotationMark } from '../src/annotations.js';

const XHTML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="de-AT" lang="de-AT">
<head><meta charset="UTF-8"/><title>Prüfung</title></head>
<body>
  <section id="s">
    <h2 id="s-h">Anforderungen</h2>
    <p id="p">Arbeiten sind <em>nur</em> außerhalb
      der Unterrichtszeit zulässig.</p>
    <table id="t"><caption>Termine</caption><tbody><tr><td>Bauzeit</td></tr></tbody></table>
  </section>
</body>
</html>
`;

async function doc(): Promise<LoadedDocument> {
  const created = await createContainer({
    id: 'urn:uuid:5a6b7c8d-1e2f-4a3b-9c4d-5e6f7a8b9c0d',
    title: 'Prüfung',
    language: 'de-AT',
    modified: '2026-10-12T09:00:00Z',
    readingOrder: ['content/index.xhtml'],
    toc: { title: 'Inhalt', entries: [{ title: 'Anforderungen', href: 'content/index.xhtml#s' }] },
    resources: [{ path: 'content/index.xhtml', mediaType: 'application/xhtml+xml', data: XHTML }],
  });
  return openContainer(created.bytes, 'pruefung.hpro');
}

function htmlCopy(): Document {
  const d = document.implementation.createHTMLDocument('');
  d.body.innerHTML = '<section id="s"><h2 id="s-h">Anforderungen</h2><p id="p">Arbeiten sind <em>nur</em> außerhalb\n      der Unterrichtszeit zulässig.</p><div data-hp-wrap=""><table id="t"><caption>Termine</caption><tbody><tr><td>Bauzeit</td></tr></tbody></table></div></section>';
  return d;
}

describe('marks in the frame copy', () => {
  it('wraps a passage across an inline element and line break, adds the numbered button, keeps the text', () => {
    const d = htmlCopy();
    const p = d.getElementById('p')!;
    const t = annotate.elementText(p as unknown as annotate.NodeLike);
    const start = t.text.indexOf('nur außerhalb der');
    const mark: AnnotationMark = { id: 'urn:uuid:00000000-0000-4000-8000-000000000001', number: 3, kind: 'comment', elementId: 'p', start, end: start + 'nur außerhalb der'.length, label: 'Anmerkung 3, Kommentar von A, offen: x', resolved: false };
    markAnnotationText(d, [mark]);
    const marks = Array.from(p.querySelectorAll('mark[data-hp-anno]'));
    expect(marks.map((m) => m.textContent)).toEqual(['nur', ' außerhalb\n      der']);
    expect(marks.every((m) => m.className === 'hp-anno hp-anno-kommentar')).toBe(true);
    const button = p.querySelector('button[data-hp-reader="anno-btn"]')!;
    expect(button.textContent).toBe('3');
    expect(button.getAttribute('aria-label')).toBe('Anmerkung 3, Kommentar von A, offen: x');
    expect(button.previousElementSibling).toBe(marks[1]);
    // The document text (without the reader's button) is unchanged.
    const copy = p.cloneNode(true) as HTMLElement;
    copy.querySelector('button')!.remove();
    expect(annotate.normalizeText(copy.textContent!)).toBe('Arbeiten sind nur außerhalb der Unterrichtszeit zulässig.');
    // The text model skips the reader's button: offsets stay the same for a second mark.
    expect(annotate.elementText(p as unknown as annotate.NodeLike).text).toBe(t.text);
  });

  it('a drawing over a table goes onto its scroll wrapper; path elements built one by one', () => {
    const d = htmlCopy();
    const ink = annotate.parseInk(annotate.inkSvg(['M0 0 L1000 1000', 'M10 990 C200 900 800 900 990 990'], 'blau'));
    placeInk(d, [{ id: 'urn:uuid:00000000-0000-4000-8000-000000000002', number: 1, kind: 'ink', elementId: 't', ink, label: 'x', resolved: true }]);
    const wrap = d.querySelector('[data-hp-wrap]')!;
    expect(wrap.classList.contains('hp-ink-host')).toBe(true);
    const svg = wrap.querySelector('svg.hp-ink')!;
    expect(svg.getAttribute('data-hp-reader')).toBe('ink');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('class')).toContain('hp-anno-erledigt');
    expect(Array.from(svg.querySelectorAll('path')).map((p) => [p.getAttribute('d'), p.getAttribute('stroke')])).toEqual([
      ['M0 0 L1000 1000', annotate.COLORS.blau],
      ['M10 990 C200 900 800 900 990 990', annotate.COLORS.blau],
    ]);
  });

  it('a comment on a whole table puts its button into the caption', () => {
    const d = htmlCopy();
    markAnnotationText(d, [{ id: 'urn:uuid:00000000-0000-4000-8000-000000000003', number: 2, kind: 'comment', elementId: 't', label: 'y', resolved: false }]);
    expect(d.querySelector('#t caption button.hp-anno-btn')?.textContent).toBe('2');
    expect(d.getElementById('t')!.classList.contains('hp-anno-block')).toBe(true);
  });
});

describe('session', () => {
  it('maps a frame selection (raw offsets) to a quote with context; refuses text that is not in the file', async () => {
    const s = await AnnotationSession.open(await doc());
    // The raw text as the frame agent counts it (same markup, parsed by the browser).
    const t = annotate.elementText(new DOMParser().parseFromString(XHTML, 'application/xhtml+xml').getElementById('p') as unknown as annotate.NodeLike);
    const rawStart = t.raw.indexOf('außerhalb');
    const rawEnd = t.raw.indexOf('Unterrichtszeit') + 'Unterrichtszeit'.length;
    const q = s.quoteFromSelection({ path: 'content/index.xhtml', id: 'p', start: rawStart, end: rawEnd, text: t.raw.slice(rawStart, rawEnd) });
    expect(q.exact).toBe('außerhalb der Unterrichtszeit');
    expect(q.prefix).toBe('Arbeiten sind nur ');
    expect(q.suffix).toBe(' zulässig.');
    // Different frame text (e.g. a calculated value): found by searching the text instead.
    const q2 = s.quoteFromSelection({ path: 'content/index.xhtml', id: 'p', start: 0, end: 3, text: 'zulässig' });
    expect(q2.exact).toBe('zulässig');
    expect(() => s.quoteFromSelection({ path: 'content/index.xhtml', id: 'p', start: 0, end: 3, text: 'Wochenende' })).toThrow(/nicht verankern/);
  });

  it('creates, answers, resolves and deletes; saving goes through the core and reads back unchanged', async () => {
    const d = await doc();
    const s = await AnnotationSession.open(d);
    const quote = annotate.quoteOfText(new annotate.DocumentIndex(d.files), 'content/index.xhtml#p', 'zulässig');
    const c = await s.comment('content/index.xhtml#p', quote, 'Gilt das auch samstags?', 'A');
    const h = await s.highlight('content/index.xhtml#s-h', annotate.quoteOfText(new annotate.DocumentIndex(d.files), 'content/index.xhtml#s-h', 'Anforderungen'), 'rosa', '', 'B');
    const r = await s.reply(c.id, 'Ja.', 'B');
    await s.reply(c.id, '', 'A', 'resolved');
    expect(s.marks('content/index.xhtml').map((m) => [m.number, m.kind, m.resolved])).toEqual([
      [1, 'comment', true],
      [2, 'highlight', false],
    ]);
    expect(s.set().threads[0]!.replies.map((x) => x.id)[0]).toBe(r.id);
    // Deleting the highlight; the comment thread stays.
    expect(s.remove(h.id)).toBe(1);
    const saved = await s.save();
    expect(saved.mode).toBe('listed');
    const back = await annotate.readAnnotations(saved.bytes);
    expect(back.items.map((i) => i.json).sort((a, b) => (a.id < b.id ? -1 : 1))).toEqual(s.added.slice().sort((a, b) => (a.id < b.id ? -1 : 1)));
    expect(back.threads[0]!.status).toBe('resolved');
  });

  it('import takes new annotations, counts identical and conflicting ones, skips answers without thread', async () => {
    const d = await doc();
    const s = await AnnotationSession.open(d);
    const c = await s.comment('content/index.xhtml#p', undefined, 'Absatz prüfen', 'A');
    const other = annotate.createAnnotation({ kind: 'comment', address: 'content/index.xhtml#s-h', text: 'Titel?', author: 'C', created: '2026-10-12T10:00:00Z' });
    const stray = annotate.createReply({ to: 'urn:uuid:99999999-9999-4999-8999-999999999999', text: 'x', author: 'C', created: '2026-10-12T10:00:00Z' });
    const conflict = { ...c, body: { type: 'TextualBody' as const, value: 'anders', format: 'text/plain' as const } };
    expect(s.import([c, other, stray, conflict])).toEqual({ added: 1, same: 1, conflicts: 1, skipped: [stray.id] });
    expect(s.imported).toBe(true);
  });
});
