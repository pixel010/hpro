import { describe, expect, it } from 'vitest';
import { createContainer, edit, lock } from '@hpro/kern';
import { openContainer } from '../src/document.js';
import { fillEditable, readEditable } from '../src/editor.js';
import { searchDocuments } from '../src/search.js';

const page = (id: string, body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="de-AT" lang="de-AT"><head><title>${id}</title></head><body>${body}</body></html>\n`;

/** A small document with personal data in two content documents. */
async function example(): Promise<Uint8Array> {
  const created = await createContainer({
    id: 'urn:uuid:0b6c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3',
    title: 'Protokoll',
    language: 'de-AT',
    modified: '2026-10-12T07:00:00Z',
    readingOrder: ['content/index.xhtml', 'content/anhang.xhtml'],
    toc: { title: 'Inhalt', entries: [{ title: 'Teilnehmende', href: 'content/index.xhtml#teilnehmende' }, { title: 'Kontakte', href: 'content/anhang.xhtml#kontakte' }] },
    resources: [
      { path: 'content/index.xhtml', mediaType: 'application/xhtml+xml', data: page('Protokoll', '<h1 id="titel">Protokoll</h1><section id="teilnehmende"><h2 id="teilnehmende-h">Teilnehmende</h2><p id="bauaufsicht">Bauaufsicht: Max Mustermann</p></section>') },
      { path: 'content/anhang.xhtml', mediaType: 'application/xhtml+xml', data: page('Kontakte', '<section id="kontakte"><h1 id="kontakte-h">Kontakte</h1><p id="kontakte-text">Telefon der Bauaufsicht.</p></section>') },
    ],
  });
  return created.bytes;
}

describe('editable text field (P5)', () => {
  it('copies only whitelisted inline markup from the document into the reader', () => {
    const el = document.createElement('div');
    fillEditable(el, 'Text <em>betont</em> <img src="x" onerror="alert(1)"/><a href="javascript:alert(1)">böse</a> <a href="#ziel" onclick="x()">gut</a><script>alert(2)</script><span style="color:red" data-hp-redacted="" role="img" aria-label="geschwärzt"/>');
    expect(el.querySelector('img, script, [onerror], [onclick], [style]')).toBeNull();
    expect(el.querySelector('a[href^="javascript"]')).toBeNull();
    expect(el.querySelector('a[href="#ziel"]')?.textContent).toBe('gut');
    expect(el.querySelector('em')?.textContent).toBe('betont');
    expect(el.querySelector('[data-hp-redacted]')?.getAttribute('contenteditable')).toBe('false');
  });

  it('writes inline XHTML back; typed blocks become line breaks, editing attributes are dropped', () => {
    const el = document.createElement('div');
    fillEditable(el, 'Satz mit Fußnote<a id="fnref-1" href="#fn-1" role="doc-noteref" epub:type="noteref">1</a> &amp; <strong>fett</strong>');
    expect(readEditable(el)).toBe('Satz mit Fußnote<a id="fnref-1" href="#fn-1" role="doc-noteref" epub:type="noteref">1</a> &amp; <strong>fett</strong>');
    const typed = document.createElement('div');
    typed.innerHTML = 'erste Zeile<div>zweite <b>Zeile</b></div><font color="red">rot</font>';
    expect(readEditable(typed)).toBe('erste Zeile<br/>zweite <b>Zeile</b>rot');
  });
});

describe('reader search after redaction (criterion 2)', () => {
  it('finds the term before and nothing after, in the current and in an earlier version', async () => {
    const v1 = (await edit.editContainer(await example(), [{ op: 'set-text', target: 'content/anhang.xhtml#kontakte-text', text: 'Bauaufsicht: Max Mustermann, Container West.' }], { at: '2026-10-12T09:00:00Z' })).bytes;
    const before = await openContainer(v1, 'v1.hpro');
    expect(searchDocuments(before.content, 'Mustermann').hits.length).toBe(2);
    const r = await lock.redactContainer(v1, { terms: ['Max Mustermann'], at: '2026-10-12T10:00:00Z' });
    const after = await openContainer(r.bytes, 'redigiert.hpro');
    expect(searchDocuments(after.content, 'Mustermann').hits).toEqual([]);
    const v0 = await openContainer(await edit.checkoutVersion(r.bytes, 0), 'v0.hpro');
    expect(searchDocuments(v0.content, 'Mustermann').hits).toEqual([]);
    expect(v0.integrity.ok).toBe(true);
  });
});
