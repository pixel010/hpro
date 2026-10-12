/**
 * Live content (P15): component policy, frame CSP, sandbox tokens, data channel (part 1,
 * section 8; test case of HPL-SBX-008) and saving data changes.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createContainer, live, readContainer, type DocumentInput } from '../src/index.js';
import { nodeSri, text } from './helpers.js';

const SCRIPT = "(function () {\r\n  'use strict';\r\n  customElements.define('hp-chart', class extends HTMLElement {});\r\n})();\r\n";
const SCHEMA = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['ansicht'],
  properties: { ansicht: { enum: ['kosten', 'stunden'] }, sortierung: { enum: ['plan', 'absteigend'] } },
  additionalProperties: false,
});

function input(profile: 'interactive' | 'static' = 'interactive'): DocumentInput {
  return {
    id: 'urn:uuid:00000000-0000-4000-8000-000000000015',
    title: 'Lebendig',
    language: 'de-AT',
    modified: '2026-10-12T12:00:00Z',
    profile,
    readingOrder: ['content/index.xhtml'],
    toc: { title: 'Inhalt', entries: [{ title: 'Start', href: 'content/index.xhtml' }] },
    resources: [
      {
        path: 'content/index.xhtml',
        mediaType: 'application/xhtml+xml',
        data: '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" lang="de-AT" xml:lang="de-AT"><head><meta charset="UTF-8"/><title>Lebendig</title>' +
          (profile === 'interactive' ? '<script src="../components/hp-chart@0.1.0/hp-chart.js"></script>' : '') +
          '</head><body><h1>Lebendig</h1><p>Text.</p></body></html>\n',
      },
      ...(profile === 'interactive' ? [{ path: 'components/hp-chart@0.1.0/hp-chart.js', mediaType: 'text/javascript', data: SCRIPT }] : []),
      { path: 'data/form.json', mediaType: 'application/json', data: '{ "ansicht": "kosten" }\n' },
      { path: 'data/form.schema.json', mediaType: 'application/json', data: SCHEMA },
    ],
    ...(profile === 'interactive' ? { components: [{ name: 'hp-chart', version: '0.1.0', url: 'components/hp-chart@0.1.0/hp-chart.js' }] } : {}),
    data: [{ url: 'data/form.json', schema: 'data/form.schema.json' }],
  };
}

async function manifestOf(bytes: Uint8Array) {
  const c = await readContainer(bytes);
  return { files: c.files, manifest: JSON.parse(text(c.files.get('manifest.json')!)) as Record<string, unknown> };
}

describe('container with components and data (HP-SBX-001, HP-SBX-008)', () => {
  it('writes components with the SHA-256 of the script and the data entries', async () => {
    const created = await createContainer(input());
    const { manifest } = await manifestOf(created.bytes);
    assert.deepEqual(manifest['components'], [{ name: 'hp-chart', version: '0.1.0', url: 'components/hp-chart@0.1.0/hp-chart.js', integrity: nodeSri(new TextEncoder().encode(SCRIPT)) }]);
    assert.deepEqual(manifest['data'], [{ url: 'data/form.json', schema: 'data/form.schema.json' }]);
    assert.ok(created.readBack.integrity.ok);
  });

  it('rejects components outside profile interactive and paths outside components/<name>@<version>/', async () => {
    await assert.rejects(createContainer({ ...input('static'), components: [{ name: 'hp-chart', version: '0.1.0', url: 'data/form.json' }] }), /profile "interactive"/);
    await assert.rejects(createContainer({ ...input(), components: [{ name: 'hp-chart', version: '0.1.0', url: 'data/form.json' }] }), /components\/hp-chart@0\.1\.0\//);
    await assert.rejects(createContainer({ ...input(), components: [{ name: 'chart', version: '0.1.0', url: 'components/hp-chart@0.1.0/hp-chart.js' }] }), /must match/);
    await assert.rejects(createContainer({ ...input(), data: [{ url: 'content/index.xhtml' }] }), /data\/<name>\.json/);
  });
});

describe('component plan (HP-SBX-010, HP-SBX-011, HPL-SBX-006, HPL-SBX-012)', () => {
  it('runs a verified component; script text with LF, CSP hash over exactly that text', async () => {
    const { manifest, files } = await manifestOf((await createContainer(input())).bytes);
    const plan = await live.planComponents(manifest, files);
    assert.equal(plan.live, true);
    const d = plan.decisions[0]!;
    assert.equal(d.state, 'run');
    assert.equal(d.script, SCRIPT.replace(/\r\n/g, '\n'));
    assert.equal(d.cspHash, nodeSri(new TextEncoder().encode(d.script!)));
  });

  it('does not run a changed, missing or invalid component, nor in a frozen version or when switched off', async () => {
    const { manifest, files } = await manifestOf((await createContainer(input())).bytes);
    const url = 'components/hp-chart@0.1.0/hp-chart.js';
    const changed = new Map(files);
    const bytes = new Uint8Array(files.get(url)!);
    bytes[10] = bytes[10]! ^ 1;
    changed.set(url, bytes);
    assert.equal((await live.planComponents(manifest, changed)).decisions[0]!.state, 'modified');
    const missing = new Map(files);
    missing.delete(url);
    assert.equal((await live.planComponents(manifest, missing)).decisions[0]!.state, 'missing');
    const bad = { ...manifest, components: [{ name: 'hp-chart', version: '0.1', url, integrity: 'x' }] };
    assert.equal((await live.planComponents(bad, files)).decisions[0]!.state, 'invalid');
    const frozen = await live.planComponents(manifest, files, { frozen: true });
    assert.equal(frozen.live, false);
    assert.equal(frozen.decisions[0]!.state, 'not-interactive');
    assert.equal((await live.planComponents(manifest, files, { enabled: false })).decisions[0]!.state, 'disabled');
    const asStatic = { ...manifest, conformsTo: 'https://hpro.example/spec/0.1/profile/static' };
    assert.equal((await live.planComponents(asStatic, files)).decisions[0]!.state, 'not-interactive');
  });

  it('refuses scripts that would break out of an inline script element', async () => {
    const { manifest, files } = await manifestOf((await createContainer(input())).bytes);
    const url = 'components/hp-chart@0.1.0/hp-chart.js';
    const evil = new TextEncoder().encode("var s = '</script><p>x</p>';");
    const m = { ...manifest, components: [{ name: 'hp-chart', version: '0.1.0', url, integrity: nodeSri(evil) }] };
    assert.equal((await live.planComponents(m, new Map([...files, [url, evil]]))).decisions[0]!.state, 'not-inlinable');
  });
});

describe('frame CSP and sandbox (HP-SBX-005, HP-SBX-006, HPL-SBX-001, HPL-SBX-002)', () => {
  it('has no network source and scripts only by hash', () => {
    const csp = live.frameCsp({ scriptHashes: ['sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='] });
    const directives = new Map(csp.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k!, v]));
    assert.deepEqual(directives.get('default-src'), ["'none'"]);
    assert.deepEqual(directives.get('connect-src'), ["'none'"]);
    assert.deepEqual(directives.get('form-action'), ["'none'"]);
    assert.deepEqual(directives.get('base-uri'), ["'none'"]);
    assert.deepEqual(directives.get('script-src'), ["'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='"]);
    for (const [, values] of directives) {
      for (const v of values) assert.ok(!/^(https?:|wss?:|\*|'self'|'unsafe-eval'|blob:)/.test(v), `network or unsafe source ${v}`);
    }
    for (const k of ['img-src', 'media-src', 'font-src']) assert.deepEqual(directives.get(k), ['data:']);
    assert.match(live.frameCsp({ scriptHashes: [] }), /script-src 'none'/);
  });

  it('allows only allow-scripts', () => {
    assert.deepEqual(live.checkSandbox('allow-scripts'), []);
    assert.deepEqual(live.checkSandbox(''), []);
    assert.deepEqual(live.checkSandbox(null), ['Attribut sandbox fehlt']);
    assert.deepEqual(live.checkSandbox('allow-scripts allow-same-origin'), ['Token allow-same-origin ist nicht erlaubt']);
    for (const t of live.FORBIDDEN_SANDBOX_TOKENS) assert.equal(live.checkSandbox(`allow-scripts ${t}`).length, 1);
  });
});

describe('data channel (part 1, section 8; HPL-SBX-008)', () => {
  async function channel(readOnly = false, now = () => 0) {
    const { manifest, files } = await manifestOf((await createContainer(input())).bytes);
    return new live.DataChannel({ manifest, files, readOnly, reducedMotion: true, now });
  }
  const code = (out: live.ChannelOutput) => (out.reply?.['ok'] === true ? 'ok' : (out.reply?.['error'] as { code: string }).code);

  it('ready names spec, readOnly, reducedMotion and the data paths', async () => {
    assert.deepEqual((await channel()).ready(), { hp: 'ready', spec: '0.1', readOnly: false, reducedMotion: true, data: ['data/form.json'] });
  });

  it('answers the test case of HPL-SBX-008 in the expected order', async () => {
    let t = 0;
    const ch = await channel(false, () => t);
    const results = [
      ch.handle({ hp: 'state.set', id: 'a', path: 'data/form.json', value: { ansicht: 'stunden' } }),
      ch.handle({ hp: 'state.set', id: 'b', path: 'data/form.json', value: { ansicht: 'geheim' } }),
      ch.handle({ hp: 'state.set', id: 'c', path: 'data/fremd.json', value: {} }),
      ch.handle({ hp: 'state.set', id: 'd', path: 'content/x.xhtml', value: {} }),
      ch.handle({ hp: 'state.set', id: 'e', path: '../manifest.json', value: {} }),
      ch.handle({ hp: 'state.set', id: 'f', path: 'data/form.json', value: { ansicht: 'kosten', fuell: 'x'.repeat(2 * 1024 * 1024) } }),
    ].map(code);
    assert.deepEqual(results, ['ok', 'schema-invalid', 'path-not-declared', 'path-invalid', 'path-invalid', 'too-large']);
    t = 5000;
    const burst = Array.from({ length: 1000 }, (_, i) => code(ch.handle({ hp: 'state.get', id: `r${i}`, path: 'data/form.json' })));
    assert.equal(burst.indexOf('rate-limited'), 100, 'rate-limited from the 101st message');
    assert.ok(burst.slice(100).every((c) => c === 'rate-limited'));
    t = 7000;
    assert.equal(code(ch.handle({ hp: 'x.unbekannt', id: 'u' })), 'unknown-message');
    assert.equal(text(ch.changes().get('data/form.json')!), '{\n  "ansicht": "stunden"\n}\n');
    assert.deepEqual([...ch.changes().keys()], ['data/form.json']);
  });

  it('rejects messages that are not JSON-like, and answers read-only in read-only versions', async () => {
    const ch = await channel();
    assert.equal(code(ch.handle({ hp: 'state.set', id: 'a', path: 'data/form.json', value: new Date() })), 'bad-request');
    assert.equal(code(ch.handle({ hp: 'state.set', id: 'a', path: 'data/form.json', value: Number.NaN })), 'bad-request');
    assert.equal(code(ch.handle('text')), 'bad-request');
    assert.equal(code(ch.handle({ hp: 'state.get', path: 'data/form.json' })), 'bad-request');
    const ro = await channel(true);
    assert.equal(code(ro.handle({ hp: 'state.set', id: 'a', path: 'data/form.json', value: { ansicht: 'kosten' } })), 'read-only');
    assert.equal(ro.dirty, false);
  });

  it('get returns the stored value; subscribers get state.changed after set', async () => {
    const ch = await channel();
    assert.deepEqual(ch.handle({ hp: 'state.get', id: 'g', path: 'data/form.json' }).reply, { hp: 'state.result', id: 'g', ok: true, value: { ansicht: 'kosten' } });
    assert.deepEqual(ch.handle({ hp: 'state.set', id: 's0', path: 'data/form.json', value: { ansicht: 'kosten' } }).broadcast, []);
    ch.handle({ hp: 'state.subscribe', id: 'sub', path: 'data/form.json' });
    const out = ch.handle({ hp: 'state.set', id: 's1', path: 'data/form.json', value: { ansicht: 'stunden', sortierung: 'absteigend' } });
    assert.deepEqual(out.broadcast, [{ hp: 'state.changed', path: 'data/form.json', value: { ansicht: 'stunden', sortierung: 'absteigend' }, origin: 'component' }]);
  });

  it('saves the change as a document change with new integrity and history (8.3 rule 5)', async () => {
    const created = await createContainer(input());
    const { manifest, files } = await manifestOf(created.bytes);
    const ch = new live.DataChannel({ manifest, files, readOnly: false, reducedMotion: false });
    ch.handle({ hp: 'state.set', id: 's', path: 'data/form.json', value: { ansicht: 'stunden' } });
    const saved = await live.saveDataChanges(created.bytes, ch.changes(), { modified: '2026-10-12T13:00:00Z' });
    const back = await readContainer(saved);
    assert.ok(back.integrity.ok, JSON.stringify(back.integrity));
    assert.equal(text(back.files.get('data/form.json')!), '{\n  "ansicht": "stunden"\n}\n');
    const m = JSON.parse(text(back.files.get('manifest.json')!)) as Record<string, unknown>;
    assert.equal(m['dateModified'], '2026-10-12T13:00:00Z');
    assert.equal((m['history'] as Array<Record<string, unknown>>)[0]!['note'], 'Daten geändert: data/form.json');
    assert.match(text(back.files.get('package.opf')!), /dcterms:modified">2026-10-12T13:00:00Z</);
    await assert.rejects(live.saveDataChanges(created.bytes, new Map([['content/index.xhtml', new Uint8Array(1)]]), { modified: '2026-10-12T13:00:00Z' }), /not a declared data file/);
  });
});
