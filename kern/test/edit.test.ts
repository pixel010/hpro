// Package P5: structured editing, real redaction, history with comparison (docs/10, promise 4 and 5).
//
// Acceptance criteria covered here:
//   1. edited text stands in the container content (not in an overlay layer); proof from the raw
//      ZIP entries of the written file
//   2. after redaction the text is in no entry of the container, in no earlier version of the
//      history journal and not found by the text search; the log is written
//   3. the comparison of two versions finds a changed heading, a changed paragraph and a removed
//      image
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { checkConformance, createContainer, edit, lock, readContainer, readZip, type Catalog, type DocumentInput } from '../src/index.js';
import { DOMParser } from '@xmldom/xmldom';
import { REPO_ROOT, nodeSri } from './helpers.js';

const EXAMPLE = resolve(REPO_ROOT, 'docs/spezifikation/beispiele/p5-bearbeiten');
const TYPES: Record<string, string> = { xhtml: 'application/xhtml+xml', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', json: 'application/json' };
const dec = new TextDecoder();
const catalog = JSON.parse(readFileSync(resolve(REPO_ROOT, 'docs/spezifikation/01-regelkatalog.json'), 'utf8')) as Catalog;
const I = 'content/index.xhtml';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
}

async function example(extra: Partial<DocumentInput> = {}): Promise<Uint8Array> {
  const doc = JSON.parse(readFileSync(join(EXAMPLE, 'dokument.json'), 'utf8')) as Omit<DocumentInput, 'resources'>;
  const resources = walk(EXAMPLE)
    .map((f) => relative(EXAMPLE, f).split('\\').join('/'))
    .filter((p) => p !== 'dokument.json')
    .map((path) => ({ path, mediaType: TYPES[path.split('.').pop()!]!, data: readFileSync(join(EXAMPLE, path)) }));
  return (await createContainer({ ...doc, ...extra, resources })).bytes;
}

/** Raw entries of the ZIP file, decoded independently of the core's reader. */
async function rawEntries(bytes: Uint8Array): Promise<Map<string, string>> {
  return new Map((await readZip(bytes)).filter((e) => !e.name.endsWith('/')).map((e) => [e.name, dec.decode(e.data)]));
}

function byId(xhtml: string, id: string) {
  const doc = new DOMParser().parseFromString(xhtml, 'application/xhtml+xml');
  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) if (all.item(i)!.getAttribute('id') === id) return all.item(i)!;
  return undefined;
}

const textOf = (n: { textContent: string | null } | undefined) => (n?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function errors(bytes: Uint8Array, name: string): Promise<string[]> {
  const r = await checkConformance(bytes, catalog, { fileName: name });
  return r.results.filter((f) => f.class === 'ERROR' || f.class === 'FATAL').map((f) => `${f.rule}: ${f.message}`);
}

async function rejectsWith(f: () => unknown, code: string, pattern?: RegExp): Promise<void> {
  try {
    await f();
  } catch (e) {
    assert.ok(e instanceof edit.EditError, `expected EditError, got ${String(e)}`);
    assert.equal(e.code, code, e.message);
    if (pattern) assert.match(e.message, pattern);
    return;
  }
  assert.fail(`expected EditError ${code}`);
}

// ---------------------------------------------------------------------------------------------

test('sequence diff: edit scripts rebuild the target, token patches round-trip', () => {
  let seed = 7;
  const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
  const words = ['<p id="a">', '</p>', 'Dach', ' ', 'Sparren', '\n  ', '<em>', '</em>', 'Feuchte', '&amp;', '<', 'x>y', '12 %'];
  for (let round = 0; round < 200; round++) {
    const a = Array.from({ length: rnd(40) }, () => words[rnd(words.length)]!).join('');
    const tokens = edit.patchTokens(a);
    assert.equal(tokens.join(''), a, 'tokens cover the text exactly');
    const b = a
      .split('')
      .filter(() => rnd(10) > 0)
      .join('') + (rnd(3) === 0 ? 'Neu' : '');
    const patch = edit.makePatch(b, a);
    assert.equal(edit.applyPatch(b, patch), a, `round ${round}`);
    const x = a.split(' ');
    const y = b.split(' ');
    const rebuilt: string[] = [];
    for (const op of edit.diffSequences(x, y)) {
      if (op.kind === 'equal') rebuilt.push(...x.slice(op.a, op.a + op.length));
      if (op.kind === 'insert') rebuilt.push(...y.slice(op.b, op.b + op.length));
    }
    assert.deepEqual(rebuilt, y);
  }
});

test('outline: headings, list items, cells with A1 address, footnote, images', async () => {
  const s = await edit.EditSession.open(await example());
  const o = s.outline();
  const find = (p: string) => o.find((r) => r.pointer === p);
  assert.equal(find(`${I}#stand-h`)?.kind, 'heading');
  assert.equal(find(`${I}#stand-h`)?.level, 2);
  assert.equal(find(`${I}#punkte/li[2]`)?.text, 'Anschlussdetail Fensterbank klären.');
  assert.equal(find(`${I}#punkte/li[2]/ul[1]/li[1]`)?.text, 'Variante A: Alu-Fensterbank mit Endkappen');
  assert.equal(find(`${I}#termin-tabelle.B3`)?.text, 'Vierte Baubesprechung');
  assert.equal(find(`${I}#fn-1`)?.kind, 'footnote');
  assert.deepEqual(find(`${I}#stand-text`)?.notes, ['fn-1']);
  assert.equal(o.filter((r) => r.kind === 'image').length, 2);
});

test('criterion 1: edited text stands in the content document of the container, no overlay', async () => {
  const before = await example();
  const s = await edit.EditSession.open(before);
  s.apply({ op: 'set-text', target: `${I}#stand-h`, text: 'Stand der Arbeiten am 8. Oktober' });
  s.apply({
    op: 'set-text',
    target: `${I}#stand-text`,
    inline: 'Die Gerüststellung an der Nordfassade ist abgeschlossen. Die Dämmplatten sind <strong>vollständig</strong> versetzt<a id="fnref-1" href="#fn-1" role="doc-noteref" epub:type="noteref">1</a>.',
  });
  s.apply({ op: 'set-text', target: `${I}#termin-tabelle.B3`, text: 'Vierte Baubesprechung (verschoben)' });
  s.apply({ op: 'insert', ref: `${I}#punkte/li[3]`, position: 'after', block: { type: 'list-item', text: 'Schlüsselübergabe Turnsaal regeln.' } });
  const ins = s.apply({ op: 'insert', ref: `${I}#stand-text`, position: 'after', block: { type: 'paragraph', text: 'Neuer Absatz: Kran wird am Freitag abgebaut.' } });
  const saved = await s.save({ at: '2026-10-12T09:00:00Z' });

  const raw = await rawEntries(saved.bytes);
  const NEW = ['Stand der Arbeiten am 8. Oktober', 'vollständig', 'Vierte Baubesprechung (verschoben)', 'Schlüsselübergabe Turnsaal regeln.', 'Neuer Absatz: Kran wird am Freitag abgebaut.'];
  for (const n of NEW) {
    const where = [...raw].filter(([, t]) => t.includes(n)).map(([p]) => p);
    // The text is in the content document (the heading also in the navigation, which lists it); nowhere else.
    assert.ok(where.includes(I), `${n} in ${I}`);
    assert.deepEqual(where.filter((p) => p !== I && p !== 'content/nav.xhtml'), [], `${n} only in content documents, found in ${where.join(', ')}`);
  }
  const index = raw.get(I)!;
  assert.equal(textOf(byId(index, 'stand-h')), 'Stand der Arbeiten am 8. Oktober');
  assert.match(index, /<strong>vollständig<\/strong> versetzt<a id="fnref-1" href="#fn-1" role="doc-noteref" epub:type="noteref">1<\/a>/);
  assert.match(index, /<td>Vierte Baubesprechung \(verschoben\)<\/td>/);
  assert.equal(textOf(byId(index, ins.created![0]!.split('#')[1]!)), 'Neuer Absatz: Kran wird am Freitag abgebaut.');
  assert.ok(!index.includes('zu zwei Dritteln'), 'the old text is replaced in the content document');
  // No new layer: the entry list is the old one plus the history journal.
  const oldNames = [...(await rawEntries(before)).keys()];
  assert.deepEqual([...raw.keys()].filter((p) => !oldNames.includes(p)), [edit.JOURNAL_PATH]);
  // Hashes, navigation and conformance.
  const c = await readContainer(saved.bytes);
  assert.ok(c.integrity.ok);
  assert.equal(c.manifest.resources.find((r) => r.url === I)!.integrity, nodeSri(c.files.get(I)!));
  assert.match(raw.get('content/nav.xhtml')!, /<a href="index.xhtml#stand">Stand der Arbeiten am 8. Oktober<\/a>/);
  assert.deepEqual(await errors(saved.bytes, 'bearbeitet.hpro'), []);
  const history = (JSON.parse(raw.get('manifest.json')!) as { history: Array<{ version: number; note: string }> }).history;
  assert.equal(history.length, 1);
  assert.match(history[0]!.note, /Überschrift .*stand-h geändert/);
});

test('structure: headings, sections and navigation; stable ids (HP-ADR-004)', async () => {
  const s = await edit.EditSession.open(await example());
  await rejectsWith(() => s.apply({ op: 'set-heading-level', target: `${I}#termine-h`, level: 4 }), 'conflict', /Überschriftensprung h2→h4/);
  const sec = s.apply({ op: 'insert', ref: `${I}#termine`, position: 'after', block: { type: 'section', heading: 'Sicherheit auf der Baustelle', blocks: [{ type: 'paragraph', text: 'Helmpflicht im gesamten Hof.' }] } });
  assert.deepEqual(sec.created, [`${I}#sicherheit-auf-der-baustelle`]);
  assert.match(s.xhtml(I), /<section id="sicherheit-auf-der-baustelle"><h2 id="sicherheit-auf-der-baustelle-h">Sicherheit auf der Baustelle<\/h2><p id="helmpflicht-im-gesamten-hof">/);
  assert.match(s.xhtml('content/nav.xhtml'), /index.xhtml#termine">Termine<\/a><\/li>\s*<li><a href="index.xhtml#sicherheit-auf-der-baustelle">Sicherheit auf der Baustelle<\/a><\/li>/);
  s.apply({ op: 'insert', ref: `${I}#sicherheit-auf-der-baustelle`, position: 'end', block: { type: 'section', heading: 'Absturzsicherung' } });
  assert.match(s.xhtml(I), /<section id="absturzsicherung"><h3 id="absturzsicherung-h">/);
  s.apply({ op: 'change-type', target: `${I}#helmpflicht-im-gesamten-hof`, to: 'heading', level: 3 });
  s.apply({ op: 'change-type', target: `${I}#helmpflicht-im-gesamten-hof`, to: 'paragraph' });
  s.apply({ op: 'move', target: `${I}#sicherheit-auf-der-baustelle`, ref: `${I}#teilnehmende`, position: 'after' });
  const nav = s.xhtml('content/nav.xhtml');
  assert.ok(nav.indexOf('#sicherheit-auf-der-baustelle') < nav.indexOf('#stand"'), 'the navigation follows the move');
  // A dangling link is refused: #termine is the target of a link in #einleitung.
  await rejectsWith(() => s.apply({ op: 'delete', target: `${I}#termine` }), 'conflict', /Verweis #termine ohne Ziel/);
  assert.ok(s.xhtml(I).includes('id="termine"'), 'nothing changed after the refused operation');
  s.apply({ op: 'set-text', target: `${I}#einleitung`, inline: 'Dritte Baubesprechung zur Fassadensanierung am 8. Oktober 2026 im Baubüro. Offene Punkte stehen in der <a href="#offene-punkte">Liste der offenen Punkte</a>.' });
  const del = s.apply({ op: 'delete', target: `${I}#termine` });
  assert.match(del.summary, /Abschnitt .*#termine gelöscht/);
  assert.ok(!s.xhtml('content/nav.xhtml').includes('#termine'), 'navigation entry removed');
  await rejectsWith(() => s.apply({ op: 'insert', ref: `${I}#offene-punkte`, position: 'after', block: { type: 'section', heading: 'Termine neu', id: 'termine' } }), 'conflict', /früheren Fassung vergeben|vergeben/);
  const again = s.apply({ op: 'insert', ref: `${I}#offene-punkte`, position: 'after', block: { type: 'section', heading: 'Termine' } });
  assert.notEqual(again.created![0], `${I}#termine`, 'a deleted id is not handed out again');
  const saved = await s.save({ at: '2026-10-12T09:00:00Z' });
  assert.deepEqual(await errors(saved.bytes, 'struktur.hpro'), []);
  // Across saves: the journal remembers ids of earlier versions.
  const s2 = await edit.EditSession.open(saved.bytes);
  await rejectsWith(() => s2.apply({ op: 'insert', ref: `${I}#offene-punkte`, position: 'after', block: { type: 'paragraph', text: 'x', id: 'termin-tabelle' } }), 'conflict');
});

test('structure: lists (type, start, indent, outdent) and tables (rows, columns, spans)', async () => {
  const s = await edit.EditSession.open(await example());
  s.apply({ op: 'set-list-type', target: `${I}#punkte`, ordered: true, start: 4 });
  assert.match(s.xhtml(I), /<ol id="punkte" start="4">/);
  s.apply({ op: 'indent', target: `${I}#punkte/li[3]` });
  assert.equal(s.outline().find((r) => r.pointer === `${I}#punkte/li[2]/ul[1]/li[3]`)?.text, 'Zufahrt für die Anlieferung am Samstag abstimmen.');
  s.apply({ op: 'outdent', target: `${I}#punkte/li[2]/ul[1]/li[1]` });
  const o = s.outline();
  assert.equal(o.find((r) => r.pointer === `${I}#punkte/li[3]`)?.text, 'Variante A: Alu-Fensterbank mit Endkappen');
  assert.equal(o.find((r) => r.pointer === `${I}#punkte/li[3]/ul[1]/li[1]`)?.text, 'Variante B: Steinfensterbank', 'following items become a sub-list');
  await rejectsWith(() => s.apply({ op: 'set-text', target: `${I}#punkte/li[1]`, inline: 'Farbmuster <script>alert(1)</script>' }), 'invalid', /<script> ist im Fließtext nicht erlaubt/);
  await rejectsWith(() => s.apply({ op: 'set-text', target: `${I}#punkte/li[1]`, inline: '<a href="javascript:alert(1)">x</a>' }), 'invalid', /nicht erlaubt/);
  await rejectsWith(() => s.apply({ op: 'set-text', target: `${I}#punkte/li[1]`, inline: '<em onclick="x()">x</em>' }), 'invalid', /onclick/);

  s.apply({ op: 'insert-row', table: `${I}#termin-tabelle`, at: 3, cells: ['19.10.2026', 'Begehung Dach', 'Bauaufsicht'] });
  s.apply({ op: 'insert-column', table: `${I}#termin-tabelle`, at: 2, cells: ['Uhrzeit', '9:00', '10:00', '9:00', '14:00'] });
  assert.equal(s.outline().find((r) => r.pointer === `${I}#termin-tabelle.B1`)?.text, 'Uhrzeit');
  assert.equal(s.outline().find((r) => r.pointer === `${I}#termin-tabelle.C3`)?.text, 'Begehung Dach');
  assert.match(s.xhtml(I), /<th scope="col">Uhrzeit<\/th>/, 'header cell in thead');
  s.apply({ op: 'delete-row', table: `${I}#termin-tabelle`, row: 5 });
  s.apply({ op: 'delete-column', table: `${I}#termin-tabelle`, column: 2 });
  await rejectsWith(() => s.apply({ op: 'delete-row', table: `${I}#termin-tabelle`, row: 1 }), 'invalid', /Kopfzeile/);
  const t = s.apply({ op: 'insert', ref: `${I}#termine-hinweis`, position: 'after', block: { type: 'table', caption: 'Mängel', header: ['Nr.', 'Mangel'], rows: [['1', 'Riss im Sockel'], ['2', 'Fuge offen']] } });
  assert.deepEqual(t.created, [`${I}#tabelle-maengel`]);
  await rejectsWith(() => s.apply({ op: 'insert', ref: `${I}#termine-hinweis`, position: 'after', block: { type: 'table', caption: '', header: ['a'], rows: [] } }), 'invalid', /Beschriftung/);
  const saved = await s.save({ at: '2026-10-12T09:00:00Z' });
  assert.deepEqual(await errors(saved.bytes, 'listen-tabellen.hpro'), []);

  // Spans: the grid stays even after every operation.
  const doc = new DOMParser().parseFromString(
    '<table xmlns="http://www.w3.org/1999/xhtml"><tbody><tr><td rowspan="2">a</td><td colspan="2">b</td></tr><tr><td>c</td><td>d</td></tr><tr><td>e</td><td>f</td><td>g</td></tr></tbody></table>',
    'application/xhtml+xml',
  );
  const table = doc.documentElement!;
  const { insertRow, deleteRow, insertColumn, deleteColumn, gridProblems, buildGrid } = await import('../src/edit/table.js');
  insertRow(doc, table, 2, ['x', 'y']);
  assert.deepEqual(gridProblems(table), []);
  assert.equal(table.getElementsByTagName('td').item(0)!.getAttribute('rowspan'), '3');
  insertColumn(doc, table, 3, ['p', 'q', 'r']);
  assert.deepEqual(gridProblems(table), []);
  deleteRow(doc, table, 1);
  assert.deepEqual(gridProblems(table), []);
  deleteColumn(doc, table, 1);
  assert.deepEqual(gridProblems(table), []);
  assert.equal(buildGrid(table).width, 3);
});

test('structure: footnotes (pair, numbering, deletion) and cross references', async () => {
  const s = await edit.EditSession.open(await example());
  const f2 = s.apply({ op: 'insert-footnote', target: `${I}#termine-hinweis`, after: 'bekannt', text: 'Per E-Mail an alle Teilnehmenden.' });
  assert.deepEqual(f2.created, [`${I}#fn-2`, `${I}#fnref-2`]);
  const f3 = s.apply({ op: 'insert-footnote', target: `${I}#einleitung`, after: 'Baubüro.', text: 'Baubüro im Container an der Westseite.' });
  assert.deepEqual(f3.created, [`${I}#fn-3`, `${I}#fnref-3`]);
  let x = s.xhtml(I);
  // Numbers follow the document order: the note in #einleitung comes first now.
  assert.match(x, /Baubüro\.<a id="fnref-3" href="#fn-3" role="doc-noteref" epub:type="noteref">1<\/a>/);
  assert.match(x, /versetzt<a id="fnref-1" href="#fn-1" role="doc-noteref" epub:type="noteref">2<\/a>/);
  assert.match(x, /bekannt<a id="fnref-2" href="#fn-2" role="doc-noteref" epub:type="noteref">3<\/a>;/);
  assert.match(x, /<\/p>\n\s+<aside id="fn-3" role="doc-footnote" epub:type="footnote"><p>Baubüro im Container an der Westseite.<\/p><\/aside>\n\s+<section id="teilnehmende">/, 'directly after the paragraph, indented like its siblings');
  // Text without the reference would orphan the note.
  await rejectsWith(() => s.apply({ op: 'set-text', target: `${I}#stand-text`, text: 'Ohne Fußnote.' }), 'conflict', /Fußnotenverweis/);
  s.apply({ op: 'set-text', target: `${I}#fn-1`, text: 'Stand laut Bautagebuch, Eintrag 41 und 42.' });
  s.apply({ op: 'delete-footnote', target: `${I}#fn-3` });
  x = s.xhtml(I);
  assert.ok(!x.includes('fn-3'), 'note and reference gone');
  assert.match(x, /versetzt<a id="fnref-1" href="#fn-1" role="doc-noteref" epub:type="noteref">1<\/a>/);
  const xr = s.apply({ op: 'insert-xref', target: `${I}#stand-text`, after: 'abgeschlossen.', to: 'content/anhang.xhtml#kontakte' });
  assert.equal(xr.detail, '„Anhang: Kontakte“');
  assert.ok(!xr.summary.includes('Anhang: Kontakte'), 'history notes carry addresses, not content');
  assert.match(s.xhtml(I), /abgeschlossen\. <a href="anhang.xhtml#kontakte">Anhang: Kontakte<\/a> Die Dämmplatten/, 'a link is a word of its own');
  s.apply({ op: 'insert-xref', target: `${I}#termine-hinweis`, to: '#termin-tabelle' });
  assert.match(s.xhtml(I), /<a href="#termin-tabelle">Nächste Termine<\/a>/);
  await rejectsWith(() => s.apply({ op: 'insert-xref', target: `${I}#termine-hinweis`, to: '#gibt-es-nicht' }), 'not-found');
  const saved = await s.save({ at: '2026-10-12T09:00:00Z' });
  assert.deepEqual(await errors(saved.bytes, 'fussnoten.hpro'), []);
});

test('structure: images added, replaced, removed with their file; title', async () => {
  const s = await edit.EditSession.open(await example());
  const png = readFileSync(join(EXAMPLE, 'content/media/fassade-nord.png'));
  const fig = s.apply({ op: 'insert', ref: `${I}#abb-lageplan`, position: 'after', block: { type: 'figure', media: { name: 'Gerüst Detail.png', type: 'image/png', data: png }, alt: 'Detail der Gerüstverankerung.', caption: 'Gerüstanker' } });
  assert.deepEqual(fig.created, [`${I}#abb-geruestanker`]);
  await rejectsWith(() => s.apply({ op: 'insert', ref: `${I}#abb-lageplan`, position: 'after', block: { type: 'figure', media: { name: 'x.png', type: 'image/png', data: new TextEncoder().encode('kein png') }, alt: 'x' } }), 'invalid', /kein image\/png/);
  await rejectsWith(() => s.apply({ op: 'insert', ref: `${I}#abb-lageplan`, position: 'after', block: { type: 'figure', src: 'media/lageplan.svg', alt: '' } }), 'invalid', /Alternativtext/);
  const del = s.apply({ op: 'delete', target: `${I}#abb-lageplan` });
  assert.deepEqual(del.removed, [`${I}#abb-lageplan`, 'content/media/lageplan.svg']);
  s.apply({ op: 'set-image', target: `${I}#abb-fassade`, alt: 'Nordfassade mit Gerüst.' });
  s.apply({ op: 'set-title', title: 'Protokoll 3. Baubesprechung Schule Nord' });
  const saved = await s.save({ at: '2026-10-12T09:00:00Z' });
  const c = await readContainer(saved.bytes);
  assert.ok(c.files.has('content/media/geruest-detail.png'));
  assert.ok(!c.files.has('content/media/lageplan.svg'), 'the image file left the container');
  assert.ok(!dec.decode(c.files.get('package.opf')!).includes('lageplan.svg'));
  assert.match(dec.decode(c.files.get('package.opf')!), /<dc:title>Protokoll 3\. Baubesprechung Schule Nord<\/dc:title>/);
  assert.equal(c.manifest.name, 'Protokoll 3. Baubesprechung Schule Nord');
  // The removed SVG (a text file) stays in the journal, so version 0 is complete.
  const v0 = await readContainer(await edit.checkoutVersion(saved.bytes, 0));
  assert.deepEqual(v0.files.get('content/media/lageplan.svg'), new Uint8Array(readFileSync(join(EXAMPLE, 'content/media/lageplan.svg'))));
  assert.ok(v0.integrity.ok);
  assert.deepEqual(await errors(saved.bytes, 'bilder.hpro'), []);
});

test('guards: read-only lock, calculator table, sealed section, redaction placeholder', async () => {
  const locked = await example({ access: [{ target: `${I}#teilnehmende`, rules: ['read-only'] }] });
  const s = await edit.EditSession.open(locked);
  await rejectsWith(() => s.apply({ op: 'set-text', target: `${I}#teilnehmende-liste/li[1]`, text: 'x' }), 'read-only', /HP-LOCK-002/);
  await rejectsWith(() => s.apply({ op: 'delete', target: `${I}#teilnehmende` }), 'read-only');
  await rejectsWith(() => s.apply({ op: 'insert', ref: `${I}#teilnehmende-liste`, position: 'end', block: { type: 'list-item', text: 'x' } }), 'read-only');
  s.apply({ op: 'set-text', target: `${I}#stand-h`, text: 'Stand' });

  const calcDoc = readFileSync(join(EXAMPLE, 'content/index.xhtml'), 'utf8').replace('<td>alle</td>', '<td data-hp-formula="=1+1" data-hp-value="2">2</td>');
  const raw = await example();
  const c = await readContainer(raw);
  void c;
  const doc = JSON.parse(readFileSync(join(EXAMPLE, 'dokument.json'), 'utf8')) as Omit<DocumentInput, 'resources'>;
  const resources = walk(EXAMPLE)
    .map((f) => relative(EXAMPLE, f).split('\\').join('/'))
    .filter((p) => p !== 'dokument.json')
    .map((path) => ({ path, mediaType: TYPES[path.split('.').pop()!]!, data: path === I ? calcDoc : readFileSync(join(EXAMPLE, path)) }));
  const calc = await edit.EditSession.open((await createContainer({ ...doc, resources })).bytes);
  await rejectsWith(() => calc.apply({ op: 'set-text', target: `${I}#termin-tabelle.B2`, text: 'x' }), 'calc', /Tabellenrechner/);
  await rejectsWith(() => calc.apply({ op: 'insert-row', table: `${I}#termin-tabelle` }), 'calc');

  const red = await lock.redactContainer(await example(), { terms: ['Max Mustermann'], at: '2026-10-12T08:00:00Z' });
  const r = await edit.EditSession.open(red.bytes);
  await rejectsWith(() => r.apply({ op: 'set-text', target: `${I}#teilnehmende-liste/li[3]`, text: 'Örtliche Bauaufsicht: N. N.' }), 'redacted', /HP-LOCK-008/);
  await rejectsWith(() => r.apply({ op: 'delete', target: `${I}#teilnehmende-liste/li[3]` }), 'redacted');
  r.apply({ op: 'set-text', target: `${I}#teilnehmende-liste/li[3]`, inline: 'Örtliche Bauaufsicht: <span data-hp-redacted="" role="img" aria-label="geschwärzt"/> (vertreten durch das Baubüro)' });

  const sealed = await lock.sealSection(await example(), { target: `${I}#stand`, modified: '2026-10-12T08:00:00Z', recipients: [{ password: 'Bauamt-Beispielort-2026!' }] });
  const z = await edit.EditSession.open(sealed.bytes);
  await rejectsWith(() => z.apply({ op: 'set-text', target: `${I}#stand/p[1]`, text: 'x' }), 'sealed');
});

test('journal: every saved version rebuilds byte for byte; hash chain checked', async () => {
  const v0 = await example();
  const v1 = (await edit.editContainer(v0, [{ op: 'set-text', target: `${I}#stand-h`, text: 'Stand der Arbeiten (Woche 41)' }], { at: '2026-10-12T09:00:00Z' })).bytes;
  const v2 = (await edit.editContainer(v1, [{ op: 'delete', target: `${I}#abb-fassade` }, { op: 'insert', ref: `${I}#punkte`, position: 'end', block: { type: 'list-item', text: 'Gerüstabbau beauftragen.' } }], { at: '2026-10-12T10:00:00Z' })).bytes;
  // Another writer of the core continues the journal (here: the minimal editText of P17).
  const v3 = await lock.editText(v2, { target: `${I}#teilnehmende-h`, text: 'Anwesende', modified: '2026-10-12T11:00:00Z' });
  const infos = await edit.listVersions(v3);
  assert.deepEqual(infos.map((i) => [i.version, i.status]), [[3, 'current'], [2, 'exact'], [1, 'exact'], [0, 'exact']]);
  assert.equal(infos.find((i) => i.version === 0)!.note, 'Ausgangsfassung');
  for (const [n, saved] of [[0, v0], [1, v1], [2, v2]] as const) {
    const back = await rawEntries(await edit.checkoutVersion(v3, n));
    const orig = await rawEntries(saved);
    assert.deepEqual([...back.keys()].sort(), [...orig.keys()].sort(), `entries of version ${n}`);
    for (const [p, t] of orig) assert.equal(back.get(p), t, `version ${n}: ${p}`);
  }
  // The removed PNG comes back from the blob store.
  const c0 = await readContainer(await edit.checkoutVersion(v3, 1));
  assert.deepEqual(c0.files.get('content/media/fassade-nord.png'), new Uint8Array(readFileSync(join(EXAMPLE, 'content/media/fassade-nord.png'))));
  // A manipulated journal is detected by the hash chain.
  const c = await readContainer(v3);
  const journal = edit.parseJournal(c.files.get(edit.JOURNAL_PATH)!);
  const first = journal.entries[0]!.files.find((f) => 'patch' in f) as { path: string; patch: Array<[number, number, string]> };
  first.patch[0]![2] += 'X';
  const j = dec.decode(edit.serializeJournal(journal));
  const { writeZip } = await import('../src/zip.js');
  const tampered = await writeZip(c.entries.filter((e) => !e.name.endsWith('/')).map((e) => ({ name: e.name, data: e.name === edit.JOURNAL_PATH ? new TextEncoder().encode(j) : e.data, compression: e.name === 'mimetype' ? 'store' : 'auto' })), { modified: new Date('2026-10-12T11:00:00Z') });
  const bad = await edit.listVersions(tampered);
  assert.ok(bad.some((i) => i.status === 'mismatch'), JSON.stringify(bad));
});

test('criterion 3: comparison finds a changed heading, a changed paragraph and a removed image', async () => {
  const v0 = await example();
  const r = await edit.editContainer(
    v0,
    [
      { op: 'set-text', target: `${I}#stand-h`, text: 'Stand der Arbeiten und Ausblick' },
      { op: 'set-text', target: `${I}#einleitung`, inline: 'Dritte Baubesprechung zur Fassadensanierung am 9. Oktober 2026 im Baubüro. Offene Punkte stehen in der <a href="#offene-punkte">Liste der offenen Punkte</a>, Termine in der <a href="#termine">Terminübersicht</a>.' },
      { op: 'delete', target: `${I}#abb-fassade` },
    ],
    { at: '2026-10-12T09:00:00Z' },
  );
  for (const d of [await edit.diffContainers(v0, r.bytes), await edit.diffVersions(r.bytes, 0, 1)]) {
    const kinds = d.changes.map((c) => c.kind);
    const heading = d.changes.find((c) => c.kind === 'heading-changed')!;
    assert.equal(heading.to, `${I}#stand-h`);
    assert.equal(heading.before, 'Stand der Arbeiten');
    assert.equal(heading.after, 'Stand der Arbeiten und Ausblick');
    assert.deepEqual(heading.words!.filter((w) => w.op !== '='), [{ op: '+', text: ' und Ausblick' }]);
    const para = d.changes.find((c) => c.kind === 'paragraph-changed')!;
    assert.equal(para.to, `${I}#einleitung`);
    assert.deepEqual(para.words!.filter((w) => w.op !== '='), [{ op: '-', text: '8' }, { op: '+', text: '9' }]);
    const img = d.changes.find((c) => c.kind === 'image-removed')!;
    assert.equal(img.from, `${I}#abb-fassade`);
    assert.equal(img.before, 'Ansicht der Nordfassade mit Gerüst und Fensterband im Obergeschoß.');
    assert.match(img.detail!, /content\/media\/fassade-nord\.png/);
    assert.ok(kinds.includes('resource-removed'));
    // Exactly these changes, nothing invented.
    assert.deepEqual(kinds.sort(), ['heading-changed', 'image-removed', 'paragraph-changed', 'resource-removed']);
  }
  const same = await edit.diffContainers(v0, v0);
  assert.equal(same.changes.length, 0);
  const text = edit.diffText(await edit.diffVersions(r.bytes, 0, 1));
  assert.match(text, /Überschrift geändert: content\/index\.xhtml#stand-h/);
  assert.match(text, /~ Dritte Baubesprechung zur Fassadensanierung am \[-8-\]\{\+9\+\}\. Oktober/);
  assert.match(text, /Bild entfernt: content\/index\.xhtml#abb-fassade/);
  assert.match(edit.diffXhtml(await edit.diffVersions(r.bytes, 0, 1)), /<del><span class="sr">\[entfernt: <\/span>8<span class="sr">\]<\/span><\/del><ins><span class="sr">\[eingefügt: <\/span>9/);
});

test('comparison: blocks without id, moved sections, rows, cells, list items, footnotes, alt text', async () => {
  const v0 = await example();
  const r = await edit.editContainer(
    v0,
    [
      { op: 'set-text', target: `${I}#punkte/li[1]`, text: 'Farbmuster für den Oberputz bis 17. Oktober vorlegen.' },
      { op: 'insert-row', table: `${I}#termin-tabelle`, at: 3, cells: ['19.10.2026', 'Begehung Dach', 'Bauaufsicht'] },
      { op: 'set-text', target: `${I}#termin-tabelle.C5`, text: 'Bauaufsicht und Gerüstbau' },
      { op: 'move', target: `${I}#termine`, ref: `${I}#teilnehmende`, position: 'before' },
      { op: 'set-text', target: `${I}#fn-1`, text: 'Stand laut Bautagebuch, Eintrag 41.' },
      { op: 'set-image', target: `${I}#abb-lageplan`, alt: 'Lageplan mit Zufahrt von Westen.' },
      { op: 'insert', ref: `${I}#punkte`, position: 'end', block: { type: 'list-item', text: 'Neue Zufahrt prüfen.' } },
    ],
    { at: '2026-10-12T09:00:00Z' },
  );
  const d = await edit.diffContainers(v0, r.bytes);
  const k = (kind: string) => d.changes.filter((c) => c.kind === kind);
  assert.deepEqual(k('list-item-changed').map((c) => c.words!.filter((w) => w.op !== '=').map((w) => w.op + w.text).join(' ')), ['-15 +17']);
  assert.deepEqual(k('row-added').map((c) => c.after), ['19.10.2026 | Begehung Dach | Bauaufsicht']);
  assert.deepEqual(k('cell-changed').map((c) => [c.detail, c.before, c.after]), [['Zelle C5 (vorher C4)', 'Bauaufsicht', 'Bauaufsicht und Gerüstbau']]);
  assert.deepEqual(k('block-moved').map((c) => c.from), [`${I}#termine`]);
  assert.deepEqual(k('footnote-changed').map((c) => c.detail), ['Fußnote fn-1']);
  assert.deepEqual(k('alt-changed').map((c) => c.to), [`${I}#abb-lageplan/img[1]`]);
  assert.deepEqual(k('block-added').map((c) => c.after), ['Neue Zufahrt prüfen.']);
  assert.equal(k('paragraph-changed').length, 0, 'unchanged paragraphs are not reported');
});

test('criterion 2: redaction removes the text from the container, every earlier version and the search; the log is written', async () => {
  const TERMS = ['Max Mustermann', '+43 512 123456'];
  const v0 = await example();
  // History with the personal data in several places and versions.
  const v1 = (await edit.editContainer(v0, [{ op: 'set-text', target: 'content/anhang.xhtml#kontakte-text', text: 'Örtliche Bauaufsicht: Max Mustermann, mobil +43 512 123456, Büro im Container.' }], { at: '2026-10-12T09:00:00Z' })).bytes;
  const v2 = (await edit.editContainer(v1, [{ op: 'insert', ref: `${I}#stand-text`, position: 'after', block: { type: 'paragraph', text: 'Rückfragen an Max Mustermann.' } }], { at: '2026-10-12T10:00:00Z' })).bytes;
  const before = await lock.searchContainer(v2, TERMS);
  assert.ok(before.hits.length > 0);
  for (const n of [0, 1, 2]) assert.ok((await lock.searchContainer(await edit.checkoutVersion(v2, n), TERMS)).hits.length > 0, `version ${n} contains the data before`);

  const r = await lock.redactContainer(v2, { targets: ['content/anhang.xhtml#kontakte-text'], terms: TERMS, at: '2026-10-12T11:00:00Z', reason: 'Datenschutz (Test)', actor: 'Prüfung P5' });
  // 1. The container (every entry in every reading, and the raw ZIP).
  const after = await lock.searchContainer(r.bytes, TERMS);
  assert.deepEqual(after.hits, []);
  const raw = await rawEntries(r.bytes);
  for (const [p, t] of raw) for (const term of TERMS) assert.ok(!t.includes(term) && !t.includes('Mustermann'), `${term} in ${p}`);
  // 2. Every earlier version rebuilt from the journal.
  const infos = await edit.listVersions(r.bytes);
  assert.deepEqual(infos.map((i) => [i.version, i.available]), [[3, true], [2, true], [1, true], [0, true]]);
  assert.ok(infos.filter((i) => i.version < 3).every((i) => i.status === 'redacted' || i.status === 'exact'));
  for (const n of [0, 1, 2]) {
    const old = await edit.checkoutVersion(r.bytes, n);
    assert.deepEqual((await lock.searchContainer(old, TERMS)).hits, [], `version ${n}`);
    assert.ok(!dec.decode((await readContainer(old)).files.get('content/anhang.xhtml')!).includes('Büro im Container'), `address emptied in version ${n}`);
  }
  // 3. The log (HP-LOCK-008) with address, time, reason, actor, files and check.
  const log = JSON.parse(raw.get('data/redaction-log.json')!) as lock.RedactionLogEntry[];
  assert.ok(log.some((e) => e.target === 'content/anhang.xhtml#kontakte-text' && e.at === '2026-10-12T11:00:00Z' && e.reason === 'Datenschutz (Test)' && e.actor === 'Prüfung P5'));
  assert.ok(log.every((e) => e.check?.hits === 0 && e.check.entries === raw.size));
  assert.match(raw.get('content/anhang.xhtml')!, /<p id="kontakte-text"><span data-hp-redacted="" role="img" aria-label="geschwärzt"(\/>|><\/span>)<\/p>/);
  // 4. The diff of the redaction step shows the redaction, not the content.
  const d = await edit.diffVersions(r.bytes, 2, 3);
  assert.ok(d.changes.some((c) => c.kind === 'redaction'));
  assert.ok(!JSON.stringify(d).includes('Mustermann'));
  const report = await checkConformance(r.bytes, catalog, { fileName: 'redigiert.hpro', redactedTerms: TERMS });
  assert.deepEqual(report.results.filter((f) => /^HPR-LOCK-00[2-5]$/.test(f.rule) || f.class === 'ERROR').map((f) => `${f.rule}: ${f.message}`), []);
});

test('sealing a section of a journaled document also seals its earlier versions', async () => {
  const v0 = await example();
  const v1 = (await edit.editContainer(v0, [{ op: 'set-text', target: `${I}#abb-lageplan/figcaption[1]`, text: 'Lageplan der Baustelleneinrichtung, Stand Woche 41' }], { at: '2026-10-12T09:00:00Z' })).bytes;
  const sealed = await lock.sealSection(v1, { target: `${I}#stand`, modified: '2026-10-12T10:00:00Z', recipients: [{ password: 'Bauamt-Beispielort-2026!' }] });
  for (const n of [0, 1]) {
    const old = await edit.checkoutVersion(sealed.bytes, n);
    const t = dec.decode((await readContainer(old)).files.get(I)!);
    assert.ok(!t.includes('Gerüststellung') && !t.includes('Lageplan der Baustelleneinrichtung'), `version ${n} sealed`);
    assert.ok(t.includes('[versiegelt]'));
  }
  assert.deepEqual((await lock.searchContainer(sealed.bytes, ['Stand Woche 41', 'Lageplan der Baustelleneinrichtung', 'Gerüststellung', 'Bautagebuch'])).hits, []);
  const infos = await edit.listVersions(sealed.bytes);
  assert.deepEqual(infos.map((i) => [i.version, i.available]), [[2, true], [1, true], [0, true]]);
});

test('undo restores the previous state; deleted ids stay unused after undo', async () => {
  const s = await edit.EditSession.open(await example());
  const before = s.xhtml(I);
  s.apply({ op: 'set-text', target: `${I}#stand-h`, text: 'Zwischenstand' });
  s.apply({ op: 'delete', target: `${I}#abb-lageplan` });
  assert.equal(s.undo()?.op, 'delete');
  assert.ok(s.xhtml(I).includes('id="abb-lageplan"'));
  assert.equal(s.undo()?.op, 'set-text');
  assert.equal(s.xhtml(I), before);
  assert.equal(s.undo(), undefined);
  s.apply({ op: 'delete', target: `${I}#teilnehmende` });
  await rejectsWith(() => s.apply({ op: 'insert', ref: `${I}#stand`, position: 'before', block: { type: 'section', heading: 'x', id: 'teilnehmende' } }), 'conflict');
  const ok = s.apply({ op: 'insert', ref: `${I}#stand`, position: 'before', block: { type: 'section', heading: 'Teilnehmende' } });
  assert.equal(ok.created![0], `${I}#teilnehmende-2`);
});
