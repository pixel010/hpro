/**
 * Annotations (package P7, HPC-0010): creating comments, highlights and freehand drawings,
 * answering, resolving and reopening threads, exporting (JSON-LD, CSV, XHTML) and importing,
 * persistence in the container without loss, signed documents, anchoring after edits,
 * redaction, merge and comparison. Uses the example docs/spezifikation/beispiele/p7-review/.
 */
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import {
  annotate,
  createContainer,
  createTestIdentity,
  edit,
  lock,
  readContainer,
  readZip,
  signContainer,
  SoftwareKeySigner,
  validateContainer,
  type DocumentInput,
} from '../src/index.js';
import { REPO_ROOT, nodeSri, text } from './helpers.js';

const EXAMPLE = join(REPO_ROOT, 'docs/spezifikation/beispiele/p7-review');
const I = 'content/index.xhtml';
const T0 = '2026-10-12T09:00:00Z';
const T1 = '2026-10-12T10:00:00Z';
const T2 = '2026-10-12T11:00:00Z';
const T3 = '2026-10-12T12:00:00Z';

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    if ((await stat(full)).isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

let cached: Promise<Uint8Array> | undefined;
/** The P7 example as a container, built like scripts/p7-beispiel.mjs. */
function example(): Promise<Uint8Array> {
  cached ??= (async () => {
    const doc = JSON.parse(await readFile(join(EXAMPLE, 'dokument.json'), 'utf8')) as Omit<DocumentInput, 'resources'>;
    const types: Record<string, string> = { xhtml: 'application/xhtml+xml', css: 'text/css' };
    const files = (await walk(EXAMPLE)).map((f) => relative(EXAMPLE, f)).filter((p) => p !== 'dokument.json').sort();
    const resources = await Promise.all(files.map(async (path) => ({ path, mediaType: types[path.split('.').pop()!]!, data: new Uint8Array(await readFile(join(EXAMPLE, path))) })));
    return (await createContainer({ ...doc, resources })).bytes;
  })();
  return cached;
}

async function index(bytes: Uint8Array): Promise<annotate.DocumentIndex> {
  return new annotate.DocumentIndex((await readContainer(bytes)).files);
}

async function comment(bytes: Uint8Array, address: string, passage: string, textValue: string, author = 'Eva Bauamt', created = T0): Promise<annotate.WebAnnotation> {
  const quote = annotate.quoteOfText(await index(bytes), address, passage);
  return annotate.createAnnotation({ kind: 'comment', address, quote, text: textValue, author, created, id: await annotate.deterministicId(`${address}|${passage}|${textValue}|${created}`), language: 'de' });
}

const save = async (bytes: Uint8Array, changes: annotate.AnnotationChanges, modified: string) => (await annotate.saveAnnotations(bytes, changes, { modified })).bytes;

/** Entries of a ZIP as read by the ZIP reader alone (no container logic). */
async function rawEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  return new Map((await readZip(bytes)).map((e) => [e.name, e.data]));
}

/** A review: a comment with an answer and a resolution, a highlight, a drawing, an open question. */
async function review(): Promise<{ bytes: Uint8Array; ids: Record<string, string> }> {
  let b = await example();
  const c1 = await comment(b, `${I}#anf-laerm`, 'nach 13:00 Uhr', 'Freitags endet die Schule um 12:00 Uhr.\nBitte ergänzen, sonst gibt es Lärm im Unterricht.');
  const hl = annotate.createAnnotation({ kind: 'highlight', address: `${I}#umfang-lueftung`, quote: annotate.quoteOfText(await index(b), `${I}#umfang-lueftung`, '3000 m³/h'), color: 'gelb', text: 'Reicht das für 60 Kinder?', author: 'Schulleitung', created: T0, id: await annotate.deterministicId('hl') });
  const ink = annotate.createAnnotation({ kind: 'ink', address: `${I}#termin-tabelle`, ink: { paths: [annotate.pathFromPoints([[100, 500], [500, 520], [900, 480]]), 'M120 560 L880 580'], color: 'rot' }, author: 'Eva Bauamt', created: T0, id: await annotate.deterministicId('ink') });
  const q = annotate.createAnnotation({ kind: 'comment', address: 'content/anhang.xhtml#bestand-text', text: 'Wer hat begangen? „Bestand“ & <Protokoll> fehlen.', author: 'Max Planer', created: T0, id: await annotate.deterministicId('q') });
  b = await save(b, { add: [c1, hl, ink, q] }, T0);
  const r1 = annotate.createReply({ to: c1.id, text: 'Ergänzt: freitags nach 12:00 Uhr.', author: 'Max Planer', created: T1, id: await annotate.deterministicId('r1') });
  b = await save(b, { add: [r1] }, T1);
  const done = annotate.createReply({ to: c1.id, status: 'resolved', author: 'Eva Bauamt', created: T2, id: await annotate.deterministicId('done') });
  b = await save(b, { add: [done] }, T2);
  return { bytes: b, ids: { c1: c1.id, hl: hl.id, ink: ink.id, q: q.id, r1: r1.id, done: done.id } };
}

describe('text model and anchors', () => {
  it('normalises white space and maps offsets back across split text nodes', () => {
    const doc = new DOMParser().parseFromString('<p xmlns="http://www.w3.org/1999/xhtml" id="x">  Eins\n   <b>zwei</b>drei <span data-hp-reader="x">LESER</span><script>s()</script> vier  </p>', 'application/xhtml+xml');
    const el = doc.documentElement!;
    const t = annotate.elementText(el as unknown as annotate.NodeLike);
    assert.equal(t.text, 'Eins zweidrei vier');
    assert.equal(t.normToRaw.length, t.text.length);
    const pieces = annotate.piecesOf(t, 5, 13); // "zweidrei"
    assert.deepEqual(pieces.map((p) => (p.node.nodeValue ?? '').slice(p.start, p.end)), ['zwei', 'drei']);
    // A raw offset inside collapsed white space maps to the start of the next word.
    const raw = t.raw.indexOf('zwei');
    assert.equal(annotate.rawToNorm(t, raw), 5);
    assert.equal(annotate.normalizeText('  a \n\t b  '), 'a b');
    // U+00A0 is not collapsed (HTML white space is ASCII only).
    assert.equal(annotate.normalizeText('a  b'), 'a  b');
  });

  it('a quote survives reformatting of the source and is found again by its context', async () => {
    const b = await example();
    const a = await comment(b, `${I}#anf-laerm`, 'nach 13:00 Uhr', 'x');
    const info = annotate.describe(a);
    assert.equal(annotate.resolveAnchor(info, await index(b)).state, 'exact');
    // The same document re-indented: other raw text, same normalised text, same offsets.
    const c = await readContainer(b);
    const files = new Map(c.files);
    files.set(I, new TextEncoder().encode(text(c.files.get(I)!).replace(/\n\s+/g, '\n          ')));
    const r = annotate.resolveAnchor(info, new annotate.DocumentIndex(files));
    assert.equal(r.state, 'exact');
  });
});

describe('Abnahme 1: Anlegen', () => {
  it('a comment, a highlight and a drawing are W3C Web Annotations under annotations/ with target.source = Adresse (HP-RS-011)', async () => {
    const { bytes, ids } = await review();
    const raw = await rawEntries(bytes);
    for (const id of [ids.c1, ids.hl, ids.ink, ids.q]) {
      const path = annotate.fileOf(id!);
      assert.ok(raw.has(path), `${path} in the ZIP`);
      const a = JSON.parse(text(raw.get(path)!)) as Record<string, any>;
      assert.ok(Array.isArray(a['@context']) && a['@context'][0] === 'http://www.w3.org/ns/anno.jsonld');
      assert.equal(a.type, 'Annotation');
      assert.equal(a.id, id);
      const source = typeof a.target === 'string' ? a.target : a.target.source;
      assert.match(source, /^content\/(index|anhang)\.xhtml#[a-z-]+$/);
    }
    const c1 = JSON.parse(text(raw.get(annotate.fileOf(ids.c1!))!));
    assert.equal(c1.motivation, 'commenting');
    assert.deepEqual(c1.target.selector[0], { type: 'TextQuoteSelector', exact: 'nach 13:00 Uhr', prefix: ' also werktags vor 7:30 Uhr und ', suffix: '.' });
    assert.equal(c1.target.selector[1].type, 'TextPositionSelector');
    const hl = JSON.parse(text(raw.get(annotate.fileOf(ids.hl!))!));
    assert.equal(hl.motivation, 'highlighting');
    assert.equal(hl.target.styleClass, 'hp-gelb');
    assert.equal(hl.stylesheet.type, 'CssStylesheet');
    const ink = JSON.parse(text(raw.get(annotate.fileOf(ids.ink!))!));
    assert.equal(ink.target.selector.type, 'SvgSelector');
    assert.match(ink.target.selector.value, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1000 1000"/);
    const q = JSON.parse(text(raw.get(annotate.fileOf(ids.q!))!));
    assert.equal(q.target, 'content/anhang.xhtml#bestand-text', 'a comment on the whole element targets the address itself');
  });

  it('listed mode: every annotation file is in the hash manifest and package.opf, with a history entry; epub structure stays valid', async () => {
    const { bytes, ids } = await review();
    const c = await readContainer(bytes);
    assert.equal(c.integrity.ok, true);
    assert.deepEqual(c.integrity.unlisted, []);
    const opf = text(c.files.get('package.opf')!);
    for (const id of Object.values(ids)) {
      const path = annotate.fileOf(id);
      const r = (c.manifest.resources as readonly { url: string; type: string; integrity: string }[]).find((x) => x.url === path);
      assert.ok(r, `${path} listed`);
      assert.equal(r.type, 'application/ld+json');
      assert.equal(r.integrity, nodeSri(c.files.get(path)!), 'hash computed independently with node:crypto');
      assert.match(opf, new RegExp(`<item id="anno-[0-9a-f]{8}" href="${path}" media-type="application/ld\\+json"/>`));
    }
    const history = (c.manifest as unknown as { history: { note: string; dateModified: string }[] }).history;
    assert.deepEqual(history.map((h) => h.note), ['Anmerkungen: 4 neu', 'Anmerkungen: 1 Antwort', 'Anmerkungen: 1 erledigt']);
    assert.equal(c.manifest.dateModified, T2);
    assert.match(opf, new RegExp(`<meta property="dcterms:modified">${T2}</meta>`));
  });

  it('refuses what cannot be anchored or is not this profile', async () => {
    const b = await example();
    const ok = await comment(b, `${I}#anf-laerm`, 'nach 13:00 Uhr', 'x');
    await assert.rejects(annotate.saveAnnotations(b, { add: [{ ...ok, target: { source: `${I}#gibt-es-nicht`, selector: (ok.target as annotate.WebAnnotation['target'] & { selector: unknown }).selector } } as annotate.WebAnnotation] }, { modified: T0 }), /existiert nicht mehr/);
    const wrongQuote = { ...ok, target: { source: `${I}#anf-laerm`, selector: [{ type: 'TextQuoteSelector', exact: 'nach 14:00 Uhr' }] } } as unknown as annotate.WebAnnotation;
    await assert.rejects(annotate.saveAnnotations(b, { add: [wrongQuote] }, { modified: T0 }), /zitierter Text steht nicht mehr/);
    assert.throws(() => annotate.createAnnotation({ kind: 'comment', address: `${I}#x`, author: 'A', created: T0 }), /needs a text/);
    assert.throws(() => annotate.createAnnotation({ kind: 'highlight', address: `${I}#x`, author: 'A', created: T0 }), /needs a text passage/);
    assert.deepEqual(annotate.validateAnnotation({ ...ok, body: { type: 'TextualBody', value: '<b>x</b>', format: 'text/html' } }), ['body must be one TextualBody with format text/plain']);
    assert.deepEqual(annotate.validateAnnotation({ ...ok, id: 'urn:uuid:NOT-A-UUID' }), ['id must be urn:uuid:<uuid> (lower case)']);
    // A drawing with anything but the plain path form is refused (nothing from a file reaches a renderer).
    const evil = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" preserveAspectRatio="none"><script>alert(1)</script></svg>';
    assert.throws(() => annotate.parseInk(evil), /not an hpro drawing/);
    const inkBad = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" preserveAspectRatio="none"><path d="M0 0 L10 10 javascript:x" fill="none" stroke="#d32f2f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
    assert.throws(() => annotate.parseInk(inkBad), /path data/);
    await assert.rejects(annotate.saveAnnotations(b, { add: [ok, ok] }, { modified: T0 }), /exists already/);
    await assert.rejects(annotate.saveAnnotations(b, { add: [ok] }, { modified: '2026-10-11T00:00:00Z' }), /liegt vor dateModified/);
  });
});

describe('Abnahme 1: Beantworten, Erledigen, wieder öffnen', () => {
  it('replies form a thread; resolving is a reply that records who and when', async () => {
    const { bytes, ids } = await review();
    const set = await annotate.readAnnotations(bytes);
    assert.equal(set.threads.length, 4);
    const t = set.threads.find((x) => x.root.id === ids.c1)!;
    assert.deepEqual(t.replies.map((r) => r.id), [ids.r1, ids.done]);
    assert.equal(t.status, 'resolved');
    assert.equal(t.statusBy, 'Eva Bauamt');
    assert.equal(t.statusAt, T2);
    assert.equal(t.replies[1]!.text, 'Als erledigt markiert.');
    assert.deepEqual(set.threads.filter((x) => x.status === 'open').map((x) => x.root.id).sort(), [ids.hl, ids.ink, ids.q].sort());
    const reply = JSON.parse(text((await readContainer(bytes)).files.get(annotate.fileOf(ids.r1!))!));
    assert.equal(reply.motivation, 'replying');
    assert.equal(reply.target, ids.c1);
  });

  it('reopening and answering an answer keep the thread; the latest status wins', async () => {
    let { bytes, ids } = await review();
    const reopen = annotate.createReply({ to: ids.c1!, status: 'open', text: 'Doch noch offen: Samstag fehlt.', author: 'Schulleitung', created: T3, id: await annotate.deterministicId('reopen') });
    const nested = annotate.createReply({ to: ids.r1!, text: 'Danke!', author: 'Eva Bauamt', created: T3, id: await annotate.deterministicId('nested') });
    bytes = await save(bytes, { add: [reopen, nested] }, T3);
    const t = (await annotate.readAnnotations(bytes)).threads.find((x) => x.root.id === ids.c1)!;
    assert.equal(t.status, 'open');
    assert.equal(t.statusBy, 'Schulleitung');
    assert.equal(t.replies.length, 4, 'the answer to an answer belongs to the same thread');
    // A reply to nothing is refused.
    const lost = annotate.createReply({ to: 'urn:uuid:00000000-0000-4000-8000-000000000000', text: 'x', author: 'A', created: T3 });
    await assert.rejects(annotate.saveAnnotations(bytes, { add: [lost] }, { modified: T3 }), /does not exist/);
  });

  it('status set twice within one second: times compare as instants (…:00Z before …:00.400Z), the latest wins', async () => {
    const { bytes, ids } = await review();
    const at = '2026-10-12T13:00:00Z';
    const resolve = annotate.createReply({ to: ids.hl!, status: 'resolved', author: 'A', created: at, id: 'urn:uuid:ffffffff-ffff-4fff-8fff-ffffffffffff' });
    const reopen = annotate.createReply({ to: ids.hl!, status: 'open', author: 'A', created: '2026-10-12T13:00:00.400Z', id: 'urn:uuid:00000000-0000-4000-8000-000000000001' });
    const b = await save(bytes, { add: [resolve, reopen] }, '2026-10-12T13:00:01Z');
    const t = (await annotate.readAnnotations(b)).threads.find((x) => x.root.id === ids.hl)!;
    assert.deepEqual(t.replies.map((r) => r.id), [resolve.id, reopen.id]);
    assert.equal(t.status, 'open');
  });

  it('editing a comment sets modified; deleting a root removes its whole thread', async () => {
    let { bytes, ids } = await review();
    const set = await annotate.readAnnotations(bytes);
    const q = set.items.find((i) => i.info.id === ids.q)!.json;
    bytes = await save(bytes, { replace: [{ ...q, body: { type: 'TextualBody', value: 'Begehung durch wen?', format: 'text/plain' }, modified: T3 }] }, T3);
    const after = await annotate.readAnnotations(bytes);
    assert.equal(after.items.find((i) => i.info.id === ids.q)!.info.text, 'Begehung durch wen?');
    assert.equal(after.items.find((i) => i.info.id === ids.q)!.info.modified, T3);
    const del = await annotate.saveAnnotations(bytes, { remove: [ids.c1!] }, { modified: T3 });
    assert.deepEqual(del.removed, [ids.c1, ids.r1, ids.done].map((id) => annotate.fileOf(id!)).sort());
    const c = await readContainer(del.bytes);
    assert.equal(c.integrity.ok, true);
    assert.deepEqual(c.integrity.unlisted, []);
    for (const id of [ids.c1, ids.r1, ids.done]) {
      assert.equal(c.files.has(annotate.fileOf(id!)), false);
      assert.doesNotMatch(text(c.files.get('package.opf')!), new RegExp(annotate.fileOf(id!)));
    }
  });
});

describe('Abnahme 2: im Container erhalten, ohne Datenverlust lesbar', () => {
  it('every annotation reads back exactly as written (deep equal), also unicode, line breaks and markup characters', async () => {
    let b = await example();
    const weird = 'Zeile 1 – „Zitat“ & <tag> \\ "x"\nZeile 2 😀 ẞ\n\n\tEingerückt';
    const a = await comment(b, `${I}#anf-staub`, 'täglich zu prüfen', weird);
    b = await save(b, { add: [a] }, T0);
    const back = (await annotate.readAnnotations(b)).items[0]!;
    assert.deepEqual(back.json, a);
    assert.equal(back.info.text, weird);
    assert.equal(back.anchor?.state, 'exact');
  });

  it('the whole review survives save → read → save of the document by another writer (editor) unchanged', async () => {
    const { bytes } = await review();
    const before = await annotate.readAnnotations(bytes);
    // The editor (P5) saves a content change; annotations are other files and must stay byte-identical.
    const edited = await edit.editContainer(bytes, [{ op: 'set-text', target: `${I}#anf-abnahme`, text: 'Die Abnahme erfolgt gemeinsam mit der Schulleitung, dem Bauamt und der Planung.' }], { at: T3 });
    const after = await annotate.readAnnotations(edited.bytes);
    assert.equal(after.items.length, before.items.length);
    const [ca, cb] = [await readContainer(bytes), await readContainer(edited.bytes)];
    for (const i of before.items) assert.deepEqual(cb.files.get(i.path), ca.files.get(i.path), `${i.path} unchanged`);
    assert.equal(cb.integrity.ok, true);
  });

  it('the history journal continues through annotation saves; every version rebuilds byte-exact', async () => {
    // A document with a journal (saved by the editor once), then annotated twice.
    const base = (await edit.editContainer(await example(), [{ op: 'set-text', target: `${I}#anf-abnahme`, text: 'Die Abnahme erfolgt gemeinsam mit Schulleitung und Bauamt.' }], { at: '2026-10-12T08:00:00Z' })).bytes;
    let b = await save(base, { add: [await comment(base, `${I}#anf-laerm`, 'nach 13:00 Uhr', 'x')] }, T0);
    b = await save(b, { add: [annotate.createReply({ to: (await annotate.readAnnotations(b)).items[0]!.info.id, status: 'resolved', author: 'A', created: T1, id: await annotate.deterministicId('j') })] }, T1);
    const versions = await edit.listVersions(b);
    assert.deepEqual(versions.map((v) => `${v.version}:${v.status}`), ['3:current', '2:exact', '1:exact', '0:exact']);
    // Version 1 (before any annotation) has no annotation files.
    const v1 = await edit.snapshotAt(b, 1);
    assert.equal([...v1.files.keys()].filter((p) => p.startsWith('annotations/')).length, 0);
  });
});

describe('signed documents', () => {
  const identity = createTestIdentity({ algorithm: 'EC-P256', commonName: 'P7 Test', notBefore: new Date('2026-01-01T00:00:00Z') });
  const sign = async (bytes: Uint8Array) => {
    const id = await identity;
    return (await signContainer(bytes, { signer: await SoftwareKeySigner.fromPkcs8(id.pkcs8, { certificateChain: [id.certificate] }), signingTime: new Date('2026-10-12T09:30:00Z') })).bytes;
  };

  it('a signature over manifest.json stays valid: new annotations are written unlisted and reported as not signed', async () => {
    const { bytes, ids } = await review();
    const signed = await sign(bytes);
    assert.equal((await annotate.readAnnotations(signed)).mode, 'unlisted');
    const note = annotate.createReply({ to: ids.hl!, text: 'Nach der Signatur angemerkt.', author: 'Prüfer', created: T3, id: await annotate.deterministicId('after-sign') });
    const resolve = annotate.createReply({ to: ids.hl!, status: 'resolved', author: 'Prüfer', created: T3, id: await annotate.deterministicId('after-sign-2') });
    const r = await annotate.saveAnnotations(signed, { add: [note, resolve] }, { modified: T3 });
    assert.equal(r.mode, 'unlisted');
    const [a, b] = [await rawEntries(signed), await rawEntries(r.bytes)];
    for (const p of ['manifest.json', 'package.opf', 'META-INF/signatures.xml']) assert.deepEqual(b.get(p), a.get(p), `${p} byte-identical`);
    const id = await identity;
    const report = await validateContainer(r.bytes, { trustAnchors: [id.certificate], validationTime: '2026-10-12T13:00:00Z' });
    assert.deepEqual(report.signatures.map((s) => s.indication), ['TOTAL_PASSED']);
    assert.deepEqual([...report.unsignedPaths].sort(), [annotate.fileOf(note.id), annotate.fileOf(resolve.id)].sort());
    const set = await annotate.readAnnotations(r.bytes);
    assert.equal(set.threads.find((t) => t.root.id === ids.hl)!.status, 'resolved', 'a signed annotation can still be resolved');
    const s = set.items.find((i) => i.info.id === note.id)!;
    assert.deepEqual([s.listed, s.signed, s.integrity], [false, false, 'unlisted']);
    assert.equal(set.items.find((i) => i.info.id === ids.hl)!.signed, true);
  });

  it('signed annotation files cannot be changed or deleted', async () => {
    const { bytes, ids } = await review();
    const signed = await sign(bytes);
    const set = await annotate.readAnnotations(signed);
    const q = set.items.find((i) => i.info.id === ids.q)!.json;
    await assert.rejects(annotate.saveAnnotations(signed, { replace: [{ ...q, modified: T3 }] }, { modified: T3 }), /covered by a signature/);
    await assert.rejects(annotate.saveAnnotations(signed, { remove: [ids.q!] }, { modified: T3 }), /covered by a signature/);
  });
});

describe('Abnahme 1: Export und Import', () => {
  it('JSON-LD collection: export, import into the clean document, all annotations identical (no loss)', async () => {
    const { bytes } = await review();
    const c = await readContainer(bytes);
    const set = await annotate.readAnnotations(bytes);
    const collection = annotate.toCollection(set, { id: c.manifest.id, title: c.manifest.name, dateModified: c.manifest.dateModified }, T3);
    assert.equal(collection.type, 'AnnotationCollection');
    assert.equal(collection.total, 6);
    const json = JSON.parse(text(annotate.serializeCollection(collection)));
    const back = annotate.fromCollection(json);
    assert.deepEqual(back.problems, []);
    assert.equal(back.document, c.manifest.id);
    const merged = await annotate.mergeAnnotations(await example(), back.annotations, { modified: T3 });
    assert.equal(merged.added.length, 6);
    const again = await annotate.readAnnotations(merged.bytes);
    const norm = (s: annotate.AnnotationSet) => s.items.map((i) => i.json).sort((x, y) => (x.id < y.id ? -1 : 1));
    assert.deepEqual(norm(again), norm(set));
    assert.deepEqual(again.threads.map((t) => [t.root.id, t.status, t.replies.length]), set.threads.map((t) => [t.root.id, t.status, t.replies.length]));
    // Importing the same again adds nothing and reports the same ones.
    const twice = await annotate.mergeAnnotations(merged.bytes, back.annotations, { modified: T3 });
    assert.deepEqual([twice.added.length, twice.same.length, twice.conflicts.length], [0, 6, 0]);
    assert.equal(twice.bytes, merged.bytes);
  });

  it('merge reports conflicts and keeps the document version; replies without thread are not taken silently', async () => {
    const { bytes, ids } = await review();
    const set = await annotate.readAnnotations(bytes);
    const q = set.items.find((i) => i.info.id === ids.q)!.json;
    const changed = { ...q, body: { type: 'TextualBody' as const, value: 'andere Fassung', format: 'text/plain' as const } };
    const stray = annotate.createReply({ to: 'urn:uuid:11111111-1111-4111-8111-111111111111', text: 'x', author: 'A', created: T3, id: await annotate.deterministicId('stray') });
    const r = await annotate.mergeAnnotations(bytes, [changed, stray], { modified: T3 });
    assert.deepEqual(r.conflicts, [ids.q]);
    assert.deepEqual(r.skipped.map((s) => s.id), [stray.id]);
    assert.equal((await annotate.readAnnotations(r.bytes)).items.find((i) => i.info.id === ids.q)!.info.text, q.body!.value);
  });

  it('CSV: one row per annotation with status, quote and anchor; RFC 4180 quoting', async () => {
    const { bytes } = await review();
    const data = annotate.toCsv(await annotate.readAnnotations(bytes));
    assert.deepEqual([...data.slice(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 byte order mark');
    const csv = new TextDecoder('utf-8', { ignoreBOM: true }).decode(data);
    assert.ok(csv.startsWith('\uFEFFThread,Nr,Kennung,Art,Status,Autor,Erstellt,Adresse,Zitat,Text,Antwort auf,Farbe,Verankerung,Schutz\r\n'));
    // A small RFC 4180 parser, independent of the writer.
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    const body = csv.slice(1);
    for (let i = 0; i < body.length; i++) {
      const ch = body[i]!;
      if (quoted) {
        if (ch === '"' && body[i + 1] === '"') (cell += '"', i++);
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') (row.push(cell), (cell = ''));
      else if (ch === '\r' && body[i + 1] === '\n') (row.push(cell), rows.push(row), (row = []), (cell = ''), i++);
      else cell += ch;
    }
    assert.equal(rows.length, 7);
    assert.ok(rows.every((r) => r.length === 14));
    const c1 = rows.find((r) => r[3] === 'Kommentar' && r[8] === 'nach 13:00 Uhr')!;
    assert.equal(c1[4], 'erledigt');
    assert.equal(c1[9], 'Freitags endet die Schule um 12:00 Uhr.\nBitte ergänzen, sonst gibt es Lärm im Unterricht.');
    assert.equal(c1[12], 'verankert');
    assert.equal(rows.find((r) => r[5] === 'Max Planer' && r[3] === 'Kommentar')![9], 'Wer hat begangen? „Bestand“ & <Protokoll> fehlen.');
    assert.deepEqual(rows.filter((r) => r[3] === 'Antwort').map((r) => r[4]), ['', 'setzt erledigt']);
  });

  it('XHTML report: well-formed, every thread with status, markup in comments escaped', async () => {
    const { bytes } = await review();
    const c = await readContainer(bytes);
    const x = annotate.toXhtml(await annotate.readAnnotations(bytes), { id: c.manifest.id, title: c.manifest.name }, T3);
    const errors: string[] = [];
    const doc = new DOMParser({ onError: (l, m) => void (l !== 'warning' && errors.push(String(m))) }).parseFromString(x, 'application/xhtml+xml');
    assert.deepEqual(errors, []);
    assert.equal(doc.getElementsByTagName('section').length, 4);
    assert.match(x, /\d\. Kommentar – erledigt \(Eva Bauamt, 2026-10-12T11:00:00Z\)/);
    assert.match(x, /&lt;Protokoll&gt;/);
    assert.doesNotMatch(x, /<Protokoll>/);
    assert.match(x, /4 Threads, davon 3 offen, 6 Anmerkungen insgesamt/);
  });
});

describe('anchoring after edits, comparison, redaction, frozen versions', () => {
  it('after an edit the comparison names the threads at changed places; a moved quote is found, a deleted one is orphaned', async () => {
    const { bytes, ids } = await review();
    const edited = await edit.editContainer(
      bytes,
      [
        { op: 'set-text', target: `${I}#anf-laerm`, text: 'Lärmintensive Arbeiten sind werktags vor 7:30 Uhr und nach 13:00 Uhr zulässig, freitags nach 12:00 Uhr.' },
        { op: 'set-text', target: `${I}#umfang-lueftung`, text: 'Lüftungsanlage mit Wärmerückgewinnung, Luftmenge 3600 m³/h.' },
      ],
      { at: T3 },
    );
    const set = await annotate.readAnnotations(edited.bytes);
    const anchor = (id: string) => set.items.find((i) => i.info.id === id)!.anchor!;
    assert.equal(anchor(ids.c1!).state, 'moved', 'quote still there, at another position');
    assert.equal(anchor(ids.hl!).state, 'orphaned');
    const report = await annotate.reviewReport(bytes, edited.bytes);
    assert.equal(report.content.changes.length, 2);
    assert.deepEqual(report.affected.map((a) => [a.root.id, a.anchor.state, a.changes.length]).sort(), [[ids.c1, 'moved', 1], [ids.hl, 'orphaned', 1]].sort());
    assert.match(annotate.reviewText(report), /\[offen\] Hervorhebung content\/index\.xhtml#umfang-lueftung – orphaned/);
    // Between the clean document and the review only annotations differ.
    const r0 = await annotate.reviewReport(await example(), bytes);
    assert.equal(r0.content.changes.length, 0, 'annotation files are not reported as content changes');
    assert.equal(r0.annotations.added.length, 6);
    assert.deepEqual(r0.annotations.status.map((s) => [s.root.id, s.from, s.to]), [[ids.c1, 'open', 'resolved']]);
  });

  it('redaction removes a term from the annotations too (P5 redaction covers annotations/)', async () => {
    const { bytes } = await review();
    const term = 'Max Planer';
    assert.ok((await lock.searchContainer(bytes, [term])).hits.length > 0);
    const red = await lock.redactContainer(bytes, { terms: [term], at: T3, reason: 'Test P7' });
    assert.deepEqual((await lock.searchContainer(red.bytes, [term])).hits, []);
    const set = await annotate.readAnnotations(red.bytes);
    assert.deepEqual(set.problems, []);
    assert.ok(set.items.some((i) => i.info.author === '[geschwärzt]'));
  });

  it('a frozen rendition does not take the annotations of the working version', async () => {
    const { bytes } = await review();
    const { calc } = await import('../src/index.js');
    const frozen = await calc.freezeContainer(bytes, { id: 'nachweis', createdAt: T3 });
    const c = await readContainer(frozen.bytes);
    assert.deepEqual([...c.files.keys()].filter((p) => p.startsWith('renditions/') && p.includes('annotations/')), []);
    assert.equal((await annotate.readAnnotations(frozen.bytes)).items.length, 6);
  });
});
