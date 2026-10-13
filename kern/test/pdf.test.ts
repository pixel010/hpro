// Package P9: PDF export, PDF import and OCR through the self-hosted service (dienst/).
//
// Without the service: the mapping of import blocks to an hpro document (createContainer,
// read-back, epubcheck when the tools exist), the export view that removes `no-export` before a
// container leaves the device, and the adapters against a scripted fetch.
// With the service (dienst/.venv and the tools present): a real export with veraPDF and a real
// text recognition, the service started on a free port and stopped afterwards. Docling (slow on
// the throttled test host) runs in scripts/belege-p9.sh, not here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createContainer, pdf, readContainer, sampleDocument, type DocumentInput } from '../src/index.js';
import { REPO_ROOT } from './helpers.js';

const dec = new TextDecoder();
const JAVA = resolve(REPO_ROOT, 'prototyp/tools/jdk-21.0.12.1+1/bin/java');
const EPUBCHECK = resolve(REPO_ROOT, 'prototyp/tools/epubcheck-5.4.0/epubcheck.jar');
const DIENST_PY = resolve(REPO_ROOT, 'dienst/.venv/bin/python');
const VERAPDF = resolve(REPO_ROOT, 'prototyp/tools/verapdf-1.30.3/verapdf');
const TESSERACT = resolve(REPO_ROOT, 'dienst/tools/tesseract/usr/bin/tesseract');
const P17 = resolve(REPO_ROOT, 'docs/spezifikation/beispiele/p17-sperren');
const TYPES: Record<string, string> = { xhtml: 'application/xhtml+xml', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', json: 'application/json' };

/** 2×2 PNG (red, green, blue, white). */
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DA0MDAyMDw//9/BgAafwR+0m7d1wAAAABJRU5ErkJggg==';

const SAMPLE: pdf.DienstImportResult = {
  engine: { name: 'Docling', version: '2.138.0' },
  fileName: 'bericht.pdf',
  pdf: { pages: 2, tagged: false, lang: null, title: null },
  title: 'Sanierungsbericht Dach',
  language: null,
  warnings: [{ code: 'untagged-pdf', message: 'ohne Tags' }],
  blocks: [
    { type: 'heading', level: 0, text: 'Sanierungsbericht Dach', page: 1 },
    { type: 'paragraph', text: 'Dieser Bericht fasst den Zustand zusammen.', page: 1 },
    { type: 'heading', level: 1, text: '1 Bestand', page: 1 },
    { type: 'paragraph', text: 'Satteldach, 38 Grad & 142 m².', spans: [{ text: 'Satteldach, 38 Grad & 142 m².', bold: true }], page: 1 },
    { type: 'figure', caption: 'Abbildung 1: Ansicht von Süden', image: PNG_B64, mediaType: 'image/png', width: 2, height: 2, page: 1 },
    { type: 'figure', caption: '', image: PNG_B64, mediaType: 'image/png', width: 2, height: 2, page: 2 },
    { type: 'heading', level: 2, text: '1.1 Schäden', page: 1 },
    { type: 'list', ordered: false, items: [{ text: 'Steine gebrochen', children: [{ type: 'list', ordered: true, items: [{ text: 'Traufe', marker: '1.', children: [] }], page: 1 }] }, { text: 'Lattung feucht', children: [] }], page: 1 },
    { type: 'heading', level: 1, text: '2 Kosten', page: 2 },
    {
      type: 'table', rows: 3, cols: 2, caption: 'Tabelle 1: Kosten', page: 2,
      cells: [
        { row: 0, col: 0, text: 'Leistung', rowSpan: 1, colSpan: 1, columnHeader: true, rowHeader: false },
        { row: 0, col: 1, text: 'Betrag', rowSpan: 1, colSpan: 1, columnHeader: true, rowHeader: false },
        { row: 1, col: 0, text: 'Gerüst', rowSpan: 1, colSpan: 1, columnHeader: false, rowHeader: false },
        { row: 1, col: 1, text: '3.200,00', rowSpan: 1, colSpan: 1, columnHeader: false, rowHeader: false },
        { row: 2, col: 0, text: 'Summe', rowSpan: 1, colSpan: 2, columnHeader: false, rowHeader: false },
      ],
    },
    { type: 'table', rows: 1, cols: 2, caption: '', page: 2, cells: [{ row: 0, col: 0, text: 'a', rowSpan: 1, colSpan: 1, columnHeader: false, rowHeader: false }, { row: 0, col: 1, text: 'b', rowSpan: 1, colSpan: 1, columnHeader: false, rowHeader: false }] },
    { type: 'footnote', text: '1 Widerstandsmessung', page: 2 },
  ],
};
const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n% Testbytes, kein echtes PDF\n%%EOF\n');

test('importToDocument: structure, addresses, original under original/ and manifest source (HP-META-005)', async () => {
  const mapped = await pdf.importToDocument(SAMPLE, { pdf: PDF_BYTES, fileName: 'Bericht Dach.pdf', modified: '2026-10-13T08:00:00Z' });
  const created = await createContainer(mapped.document);
  assert.equal(created.readBack.integrity.ok, true);
  const xhtml = dec.decode(created.readBack.files.get('content/index.xhtml')!);
  assert.match(xhtml, /<h1 id="sanierungsbericht-dach">Sanierungsbericht Dach<\/h1>/);
  assert.match(xhtml, /<section id="s-1-bestand">\s*<h2>1 Bestand<\/h2>/);
  assert.match(xhtml, /<section id="s-1-1-schaeden">\s*<h3>1.1 Schäden<\/h3>/, 'level 2 nests below level 1');
  assert.match(xhtml, /<strong>Satteldach, 38 Grad &amp; 142 m²\.<\/strong>/);
  assert.match(xhtml, /<li>Steine gebrochen\s*<ol>\s*<li>Traufe<\/li>/);
  assert.match(xhtml, /<thead>\s*<tr><th scope="col">Leistung<\/th><th scope="col">Betrag<\/th><\/tr>/);
  assert.match(xhtml, /<td colspan="2">Summe<\/td>/);
  assert.match(xhtml, /<caption>Tabelle 1: Kosten<\/caption>/);
  assert.match(xhtml, /<img src="images\/abbildung-1.png" alt="Abbildung 1: Ansicht von Süden"/);
  assert.match(xhtml, /alt="Abbildung 2 aus dem PDF, Seite 2, ohne Beschreibung im Original"/);
  assert.match(xhtml, /<aside id="fn-1" role="doc-footnote" epub:type="footnote">/);
  assert.ok(created.readBack.files.has('original/Bericht_Dach.pdf'));
  assert.deepEqual(created.manifest.source, { url: 'original/Bericht_Dach.pdf', type: 'application/pdf', tool: { name: 'hpro-dienst/Docling', version: '2.138.0' }, date: '2026-10-13T08:00:00Z' });
  assert.equal(created.manifest.inLanguage, 'de');
  const codes = mapped.warnings.map((w) => w.code);
  assert.ok(codes.includes('table-without-header'), codes.join());
  assert.deepEqual(mapped.counts, { heading: 4, paragraph: 2, figure: 2, list: 1, table: 2, footnote: 1 });
  // Same PDF → same id (HP-CONT-014).
  const again = await pdf.importToDocument(SAMPLE, { pdf: PDF_BYTES, fileName: 'x.pdf' });
  assert.equal(again.document.id, mapped.document.id);
  assert.match(mapped.document.id, /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('createContainer refuses a source that is not a resource', async () => {
  const doc = sampleDocument();
  await assert.rejects(createContainer({ ...doc, source: { url: 'original/fehlt.pdf', type: 'application/pdf', tool: { name: 't', version: '1' }, date: doc.modified } }), /source.url must be a resource/);
});

const epubSkip = [JAVA, EPUBCHECK].some((p) => !existsSync(p)) ? 'epubcheck tools missing (prototyp/setup-tools.sh)' : false;
test('epubcheck 5.4.0: an imported document has 0 errors and 0 warnings', { skip: epubSkip, timeout: 480_000 }, async () => {
  const mapped = await pdf.importToDocument(SAMPLE, { pdf: PDF_BYTES, fileName: 'bericht.pdf', modified: '2026-10-13T08:00:00Z' });
  const dir = await mkdtemp(join(tmpdir(), 'hpro-p9-'));
  try {
    const file = join(dir, 'import.epub');
    await writeFile(file, (await createContainer(mapped.document)).bytes);
    const out = await promisify(execFile)(JAVA, ['-jar', EPUBCHECK, file], { timeout: 420_000 }).catch((e: { stdout?: string; stderr?: string }) => ({ stdout: e.stdout ?? '', stderr: e.stderr ?? '' }));
    assert.match(out.stdout + out.stderr, /Messages: 0 fatals \/ 0 errors \/ 0 warnings/, out.stdout + out.stderr);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
}

async function lockedExample(): Promise<Uint8Array> {
  const doc = JSON.parse(readFileSync(join(P17, 'dokument.json'), 'utf8')) as Omit<DocumentInput, 'resources'>;
  const resources = walk(P17)
    .map((f) => relative(P17, f).split('\\').join('/'))
    .filter((p) => p !== 'dokument.json')
    .map((path) => ({ path, mediaType: TYPES[path.split('.').pop()!]!, data: readFileSync(join(P17, path)) }));
  return (await createContainer({ ...doc, resources })).bytes;
}

test('exportView: no-export sections never leave the device (HP-LOCK-004), the copy stays consistent', async () => {
  const bytes = await lockedExample();
  assert.ok(dec.decode((await readContainer(bytes)).files.get('content/index.xhtml')!).includes('492.000,00'));
  const view = await pdf.exportView(bytes);
  assert.deepEqual(view.omitted, [{ target: 'content/index.xhtml#kalkulation', notice: 'Abschnitt kalkulation nicht zum Export freigegeben' }]);
  const back = await readContainer(view.bytes);
  assert.equal(back.integrity.ok, true);
  const text = dec.decode(back.files.get('content/index.xhtml')!);
  assert.ok(!text.includes('492.000,00'));
  assert.ok(text.includes('Abschnitt kalkulation nicht zum Export freigegeben'));
  // Without export locks the bytes are passed on unchanged.
  const plain = (await createContainer(sampleDocument())).bytes;
  assert.equal((await pdf.exportView(plain)).bytes, plain);
});

/** Scripted fetch: records requests, answers from a table. */
function fakeFetch(answers: Record<string, (body: Uint8Array, url: URL) => { status?: number; json: unknown }>) {
  const calls: Array<{ url: URL; body: Uint8Array }> = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = init?.body ? new Uint8Array(init.body as Uint8Array) : new Uint8Array();
    calls.push({ url, body });
    const answer = answers[url.pathname];
    if (!answer) throw new TypeError('fetch failed');
    const a = answer(body, url);
    return new Response(JSON.stringify(a.json), { status: a.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { impl, calls };
}

test('RemoteWeasyPrint sends the export view and passes the veraPDF checks on unchanged', async () => {
  const bytes = await lockedExample();
  const f = fakeFetch({
    '/v1/export': () => ({
      json: {
        pdf: btoa('%PDF-1.7 fake'),
        checks: [{ conformance: 'PDF/A-2a', passed: true, checker: 'veraPDF 1.30.3', failures: [], failedRules: 0 }, { conformance: 'PDF/UA-1', passed: false, checker: 'veraPDF 1.30.3', failures: ['§ 7.1-3'], failedRules: 1 }],
        engine: { name: 'WeasyPrint', version: '70.0', service: 'hpro-dienst 0.1.0' },
        variant: 'pdf/a-2a', pages: 3, omitted: [{ target: 'content/index.xhtml#intern', notice: 'Abschnitt intern ausgeblendet' }], live: [], warnings: [], overflow: [],
      },
    }),
  });
  const exporter = new pdf.RemoteWeasyPrint(new pdf.DienstClient({ url: 'http://dienst.test/', fetch: f.impl }));
  assert.equal(exporter.info.location, 'remote-service');
  const r = await exporter.export({ container: bytes, conformance: ['PDF/A-2a', 'PDF/UA-1'], rendition: 'nachweis' });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0]!.url.searchParams.get('conformance'), 'PDF/A-2a,PDF/UA-1');
  assert.equal(f.calls[0]!.url.searchParams.get('rendition'), 'nachweis');
  const sent = await readContainer(f.calls[0]!.body);
  assert.ok(!dec.decode(sent.files.get('content/index.xhtml')!).includes('492.000,00'), 'no-export content was sent');
  assert.equal(dec.decode(r.pdf), '%PDF-1.7 fake');
  assert.deepEqual(r.checks.map((c) => [c.conformance, c.passed]), [['PDF/A-2a', true], ['PDF/UA-1', false]]);
  assert.deepEqual(r.omitted.map((o) => o.target), ['content/index.xhtml#kalkulation', 'content/index.xhtml#intern']);
});

test('DienstClient: service errors become DienstError, an unreachable service is "not available" with fallback', async () => {
  const f = fakeFetch({ '/v1/import': () => ({ status: 422, json: { error: 'verschlüsselte PDF-Dateien werden nicht importiert' } }) });
  const importer = new pdf.RemoteDocling(new pdf.DienstClient({ url: 'http://dienst.test', fetch: f.impl, location: 'local-sidecar' }));
  assert.equal(importer.info.location, 'local-sidecar');
  await assert.rejects(importer.import({ pdf: PDF_BYTES, fileName: 'x.pdf' }), (err: Error) => err instanceof pdf.DienstError && /verschlüsselte/.test(err.message) && (err as pdf.DienstError).status === 422);
  const a = await importer.availability();
  assert.equal(a.available, false);
  if (!a.available) assert.match(a.fallback ?? '', /keine Bedingung/);
});

test('RemoteDocling maps the answer with the core and keeps the raw blocks', async () => {
  const f = fakeFetch({ '/v1/import': () => ({ json: SAMPLE }) });
  const importer = new pdf.RemoteDocling(new pdf.DienstClient({ url: 'http://dienst.test', fetch: f.impl }));
  const r = await importer.import({ pdf: PDF_BYTES, fileName: 'bericht.pdf', ocr: 'force', languages: ['de-AT'], modified: '2026-10-13T08:00:00Z' });
  assert.equal(f.calls[0]!.url.searchParams.get('ocr'), 'force');
  assert.equal(f.calls[0]!.url.searchParams.get('languages'), 'de-AT');
  assert.equal(r.document.language, 'de-AT');
  assert.equal(r.engine.name, 'Docling');
  assert.equal(r.raw.blocks.length, SAMPLE.blocks.length);
  assert.equal((await createContainer(r.document)).readBack.integrity.ok, true);
});

// ------------------------------------------------------------------------------------------ real service

const serviceMissing = [DIENST_PY, VERAPDF, TESSERACT, JAVA].filter((p) => !existsSync(p));
const serviceSkip = serviceMissing.length > 0 ? `service or tools missing (dienst/setup-dienst.sh, prototyp/setup-tools.sh): ${serviceMissing.join(', ')}` : false;

async function withService<T>(fn: (client: pdf.DienstClient) => Promise<T>): Promise<T> {
  const child = spawn(DIENST_PY, ['-m', 'hpro_dienst', 'serve', '--port', '0'], { cwd: resolve(REPO_ROOT, 'dienst'), stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const url = await new Promise<string>((ok, fail) => {
      let out = '';
      const timer = setTimeout(() => fail(new Error(`service did not start: ${out}`)), 300_000);
      child.stdout.on('data', (d: Buffer) => {
        out += d.toString();
        const m = /bereit auf (http:\/\/\S+)/.exec(out);
        if (m) clearTimeout(timer), ok(m[1]!);
      });
      child.stderr.on('data', (d: Buffer) => (out += d.toString()));
      child.on('exit', (code) => fail(new Error(`service exited with ${code}: ${out}`)));
    });
    return await fn(new pdf.DienstClient({ url, location: 'local-sidecar' }));
  } finally {
    child.kill('SIGTERM');
    await new Promise((ok) => (child.exitCode !== null ? ok(null) : child.on('exit', ok)));
  }
}

test('service: a container becomes a PDF that passes veraPDF (PDF/A-2a, PDF/UA-1); OCR reads a rendered page', { skip: serviceSkip, timeout: 1_200_000 }, async () => {
  await withService(async (client) => {
    const status = await client.status();
    assert.ok(status.conformance.includes('PDF/UA-1'));
    const exporter = new pdf.RemoteWeasyPrint(client);
    const bytes = await lockedExample();
    const r = await exporter.export({ container: bytes, conformance: ['PDF/A-2a', 'PDF/UA-1'] });
    assert.equal(dec.decode(r.pdf.subarray(0, 5)), '%PDF-');
    for (const c of r.checks) assert.equal(c.passed, true, `${c.conformance}: ${c.failures.join('; ')}`);
    assert.ok(r.omitted.some((o) => o.target === 'content/index.xhtml#kalkulation'));
    assert.ok(r.omitted.some((o) => o.target === 'content/index.xhtml#intern'), 'hidden is dropped by the service');

    // OCR: the service renders nothing itself here; we send a page image of known text.
    const ocr = new pdf.RemoteTesseractOcr(client);
    assert.ok((await ocr.supportedLanguages()).includes('de'));
    const page = await renderTextPng(client);
    const result = await ocr.recognize({ image: { bytes: page, mediaType: 'image/png', widthPx: 0, heightPx: 0, dpi: 150 }, languages: ['de-AT'] });
    assert.match(result.text, /Dachsanierung/);
    assert.ok((result.meanConfidence ?? 0) > 0.8, String(result.meanConfidence));
  });
});

/** A page image of the export of the sample document (the service exports, pdfium renders). */
async function renderTextPng(client: pdf.DienstClient): Promise<Uint8Array> {
  const exporter = new pdf.RemoteWeasyPrint(client);
  const doc = sampleDocument();
  const r = await exporter.export({ container: (await createContainer({ ...doc, title: 'Dachsanierung Haus Nr. 12' })).bytes, conformance: [] });
  const dir = await mkdtemp(join(tmpdir(), 'hpro-p9-ocr-'));
  try {
    await writeFile(join(dir, 'a.pdf'), r.pdf);
    await promisify(execFile)(DIENST_PY, ['-c', 'import sys,pypdfium2 as p; p.PdfDocument(sys.argv[1])[0].render(scale=150/72).to_pil().save(sys.argv[2], dpi=(150,150))', join(dir, 'a.pdf'), join(dir, 'a.png')]);
    return readFileSync(join(dir, 'a.png'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
