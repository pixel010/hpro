// Package S8: the stable command line (interface version 1, docs/spezifikation/06-einbau.md,
// chapter 3). Every command and every exit code of the contract is exercised here; a change that
// breaks one of these tests breaks software that embeds hpro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CLI_INTERFACE_VERSION, KERN_VERSION, SPEC_VERSION } from '../src/index.js';
import { REPO_ROOT } from './helpers.js';

const CLI = resolve(REPO_ROOT, 'kern/build/bin/hpro.js');
const dir = await mkdtemp(join(tmpdir(), 'hpro-cli-'));
test.after(() => rm(dir, { recursive: true, force: true }));

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}
function hpro(args: string[], env: Record<string, string> = {}): Promise<Run> {
  return new Promise((done) => {
    execFile(process.execPath, [CLI, ...args], { cwd: dir, env: { ...process.env, ...env }, maxBuffer: 32 * 1024 * 1024, timeout: 300_000 }, (err, stdout, stderr) => {
      done({ code: err ? (typeof err.code === 'number' ? err.code : -1) : 0, stdout, stderr });
    });
  });
}
const out = (name: string) => join(dir, name);

test('version: package, interface and specification version; package.json agrees', async () => {
  const pkg = JSON.parse(await readFile(resolve(REPO_ROOT, 'kern/package.json'), 'utf8')) as { version: string; bin: Record<string, string> };
  assert.equal(KERN_VERSION, pkg.version);
  const r = await hpro(['version', '--json']);
  assert.equal(r.code, 0);
  const v = JSON.parse(r.stdout) as Record<string, unknown>;
  assert.deepEqual({ package: v.package, version: v.version, cliInterface: v.cliInterface, specification: v.specification }, { package: '@hpro/kern', version: KERN_VERSION, cliInterface: CLI_INTERFACE_VERSION, specification: SPEC_VERSION });
  assert.match(String(v.ruleCatalog), /^\d+\.\d+/);
  assert.equal(pkg.bin.hpro, 'cli/bin/hpro.js');
  const h = await hpro(['help']);
  assert.equal(h.code, 0);
  for (const c of ['hpro create', 'hpro check', 'hpro sign', 'hpro pdf export', 'hpro version']) assert.ok(h.stdout.includes(c), c);
  assert.equal((await hpro(['gibt-es-nicht'])).code, 2);
});

test('create: Markdown, ODF, Word and spreadsheet; JSON report; exit codes 0, 1, 2, 4', async () => {
  const md = out('notiz.md');
  await writeFile(md, '---\ntitel: Notiz\nkennung: urn:uuid:11111111-2222-4333-8444-555555555555\ndatum: 2026-10-14\nsprache: de\n---\n\n# Anlass\n\nText mit *Betonung*.\n');
  let r = await hpro(['create', md, out('notiz.hpro'), '--json', out('notiz.json')]);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(existsSync(out('notiz.hpro')));
  const report = JSON.parse(await readFile(out('notiz.json'), 'utf8')) as { ausgabe: { sha256: string }; zusammenfassung: Record<string, number> };
  assert.match(report.ausgabe.sha256, /^[0-9a-f]{64}$/);
  // Same source, same bytes (HP-CONT-014).
  r = await hpro(['create', md, out('notiz2.hpro')]);
  assert.deepEqual(await readFile(out('notiz2.hpro')), await readFile(out('notiz.hpro')));

  r = await hpro(['create', resolve(REPO_ROOT, 'docs/spezifikation/beispiele/s7-buero/angebot.fodt'), out('angebot.hpro'), '--modified', '2026-10-14T12:00:00Z']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /hpro-author-odf/);
  r = await hpro(['create', resolve(REPO_ROOT, 'docs/belege/S5/eingabe/referenz.docx'), out('referenz.hpro')]);
  assert.equal(r.code, 0, r.stderr);
  r = await hpro(['create', resolve(REPO_ROOT, 'kern/test/fixtures/p19-quelle.ods'), out('tabelle.hpro'), '--modified', '2026-10-14T12:00:00Z', '--json', out('tabelle.json')]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Formeln/);

  // 1: template rules not met, nothing written.
  r = await hpro(['create', resolve(REPO_ROOT, 'docs/belege/S5/eingabe/angebot-unvollstaendig.md'), out('unvollstaendig.hpro')]);
  assert.equal(r.code, 1);
  assert.equal(existsSync(out('unvollstaendig.hpro')), false);
  // 2: unknown format, option of another kind, missing file, wrong arguments.
  assert.equal((await hpro(['create', out('x.rtf'), out('x.hpro')])).code, 2);
  assert.equal((await hpro(['create', md, out('x.hpro'), '--titel', 'T'])).code, 2);
  assert.equal((await hpro(['create', out('fehlt.md'), out('x.hpro')])).code, 2);
  assert.equal((await hpro(['create', md])).code, 2);
  // 4: PDF needs the service.
  r = await hpro(['create', resolve(REPO_ROOT, 'docs/belege/S5/eingabe/referenz.pdf'), out('pdf.hpro')], { HPRO_DIENST: '' });
  assert.equal(r.code, 4, r.stderr);
});

test('check: 3 (undetermined) without rendering engine, 1 for a broken file, 2 for wrong usage, JSON report', async () => {
  let r = await hpro(['check', out('angebot.hpro'), '--no-epubcheck', '--format', 'json']);
  assert.equal(r.code, 3, r.stderr);
  const report = JSON.parse(r.stdout) as { summary: Record<string, number>; levels: { verdict: Record<string, string> } };
  assert.deepEqual([report.summary.fatal, report.summary.error, report.summary.warning], [0, 0, 0]);
  assert.equal(report.levels.verdict.Basis, 'unbestimmt');
  await writeFile(out('kaputt.hpro'), 'kein Container');
  r = await hpro(['check', out('kaputt.hpro'), '--no-epubcheck']);
  assert.equal(r.code, 1);
  assert.equal((await hpro(['check'])).code, 2);
  assert.equal((await hpro(['check', out('angebot.hpro'), '--gibt-es-nicht'])).code, 2);
});

test('sign and validate: 0 with JSON report, 1 for a foreign trust anchor, 2 without key', async () => {
  assert.equal((await hpro(['keygen', out('key.pem'), out('cert.pem'), '--alg', 'ec', '--cn', 'S8 Test'])).code, 0);
  assert.equal((await hpro(['keygen', out('key2.pem'), out('cert2.pem'), '--alg', 'ec', '--cn', 'Fremd'])).code, 0);
  let r = await hpro(['sign', out('angebot.hpro'), out('angebot-sig.hpro'), '--key', out('key.pem'), '--cert', out('cert.pem'), '--json', out('sign.json')]);
  assert.equal(r.code, 0, r.stderr);
  const s = JSON.parse(await readFile(out('sign.json'), 'utf8')) as { level: string; readBack: Array<{ indication: string }>; signedPaths: string[] };
  assert.equal(s.level, 'XAdES-BASELINE-B');
  assert.equal(s.readBack[0]!.indication, 'TOTAL_PASSED');
  assert.ok(s.signedPaths.includes('content/index.xhtml'));
  assert.equal((await hpro(['validate', out('angebot-sig.hpro'), '--trust', out('cert.pem')])).code, 0);
  assert.equal((await hpro(['validate', out('angebot-sig.hpro'), '--trust', out('cert2.pem')])).code, 1);
  r = await hpro(['sign', out('angebot.hpro'), out('x.hpro'), '--cert', out('cert.pem')]);
  assert.equal(r.code, 2);
});

test('pdf export: 4 when the service is not reachable or not installed, 2 for wrong usage', async () => {
  let r = await hpro(['pdf', 'export', out('angebot.hpro'), out('angebot.pdf'), '--dienst', 'http://127.0.0.1:47999']);
  assert.equal(r.code, 4, r.stderr);
  assert.match(r.stderr, /nicht verfügbar/);
  r = await hpro(['pdf', 'export', out('angebot.hpro'), out('angebot.pdf'), '--lokal'], { HPRO_DIENST_DIR: out('kein-dienst') });
  assert.equal(r.code, 4, r.stderr);
  assert.equal((await hpro(['pdf', 'export', out('angebot.hpro'), '--dienst', 'http://127.0.0.1:47999'])).code, 2);
  assert.equal(existsSync(out('angebot.pdf')), false);
});
