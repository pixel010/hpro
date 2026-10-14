#!/usr/bin/env node
/**
 * P13: epubcheck 5.4.0 over every container the repository ships or builds, as one CI step.
 *
 *   node scripts/p13-epubcheck.mjs [--java BIN] [--jar epubcheck.jar] [--md report.md] [files...]
 *
 * Without file arguments it checks the conforming cases of the test suite (testsuite/faelle.json,
 * art "gut") and the sample containers of the reader build (app/dist/*.hpro, `npm run build`).
 * Defaults for Java and epubcheck are the tool paths of prototyp/setup-tools.sh.
 *
 * Two findings are known and tolerated, everything else fails the run:
 *   RSC-011 for `renditions/<id>/…` in a container with a frozen rendition: the rendition's
 *   documents are not spine items. Change request HPC-0003 (docs/spezifikation) is open; the
 *   finding is reported as "bekannt", never as "0 Fehler".
 *   RSC-005 for `lang`/`xml:lang` in app/dist/pruefen.hpro: the accessibility test document of P8
 *   carries `lang="de_AT"` on purpose (docs/belege/P8, "vorher 2 Fehler RSC-005").
 * Exit code 0 when no container has an unexpected fatal, error or warning, 1 otherwise.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const opts = new Set(['--java', '--jar', '--md']);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const JAVA = flag('--java', join(ROOT, 'prototyp/tools/jdk-21.0.12.1+1/bin/java'));
const JAR = flag('--jar', join(ROOT, 'prototyp/tools/epubcheck-5.4.0/epubcheck.jar'));
const MD = flag('--md', null);

let files = args.filter((a, i) => !a.startsWith('--') && !opts.has(args[i - 1])).map((f) => resolve(f));
if (!files.length) {
  const suite = JSON.parse(readFileSync(join(ROOT, 'testsuite/faelle.json'), 'utf8'));
  files = suite.faelle.filter((f) => f.art === 'gut').map((f) => join(ROOT, 'testsuite', f.datei));
  const dist = join(ROOT, 'app/dist');
  if (existsSync(dist)) files.push(...readdirSync(dist).filter((f) => f.endsWith('.hpro')).sort().map((f) => join(dist, f)));
}
for (const p of [JAVA, JAR]) if (!existsSync(p)) { console.error(`fehlt: ${p}`); process.exit(2); }

const version = spawnSync(JAVA, ['-jar', JAR, '--version'], { encoding: 'utf8' });
const versionLine = `${version.stdout}${version.stderr}`.split('\n').find((l) => /EPUBCheck v/i.test(l))?.trim() ?? '?';
const javaVersion = spawnSync(JAVA, ['-version'], { encoding: 'utf8' }).stderr.split('\n')[0];

const tmp = mkdtempSync(join(tmpdir(), 'p13-epubcheck-'));
const rows = [];
let failed = 0;
for (const file of files) {
  // epubcheck refuses other extensions ("Mode required for non-epub files"), docs/05 V7.
  const epub = join(tmp, 'pruefling.epub');
  const json = join(tmp, 'out.json');
  copyFileSync(file, epub);
  rmSync(json, { force: true });
  const run = spawnSync(JAVA, ['-Xmx512m', '-jar', JAR, epub, '--json', json], { encoding: 'utf8', timeout: 420_000 });
  const report = existsSync(json) ? JSON.parse(readFileSync(json, 'utf8')) : { messages: [] };
  const known = [];
  const unexpected = [];
  for (const m of report.messages ?? []) {
    if (!['FATAL', 'ERROR', 'WARNING'].includes(m.severity)) continue;
    const where = (m.locations ?? []).map((l) => l.path).join(', ');
    const entry = `${m.severity}(${m.ID}) ${where}: ${m.message}`;
    if (m.ID === 'RSC-011' && (m.locations ?? []).every((l) => /^renditions\//.test(l.path ?? ''))) known.push(`${entry} [HPC-0003]`);
    else if (m.ID === 'RSC-005' && /(^|\/)pruefen\.hpro$/.test(file) && /attribute "(xml:)?lang" is invalid/.test(m.message)) known.push(`${entry} [absichtlich, Prüfdokument P8]`);
    else unexpected.push(entry);
  }
  const ok = unexpected.length === 0 && run.status !== null && (run.status === 0 || known.length > 0);
  if (!ok) failed++;
  rows.push({ file: relative(ROOT, file), exit: run.status, known, unexpected, ok });
  const tag = ok ? (known.length ? 'ok (bekannt)' : 'ok') : 'FEHLER';
  console.log(`${tag.padEnd(24)} ${relative(ROOT, file)}  exit=${run.status}  bekannt=${known.length}  unerwartet=${unexpected.length}`);
  for (const u of unexpected) console.log(`    ${u}`);
  if (run.status === null) console.log(`    epubcheck lief nicht zu Ende: ${run.error ?? run.signal}`);
}
rmSync(tmp, { recursive: true, force: true });

const clean = rows.filter((r) => r.ok && !r.known.length).length;
const knownOnly = rows.filter((r) => r.ok && r.known.length).length;
const summary = `${rows.length} Container: ${clean} ohne Befund, ${knownOnly} nur mit bekannten Befunden (RSC-011 HPC-0003, RSC-005 Prüfdokument P8), ${failed} mit unerwarteten Befunden`;
console.log(`\n${versionLine}; ${javaVersion}\n${summary}`);
if (MD) {
  const md = ['# epubcheck über alle Container', '', `${versionLine}; ${javaVersion}`, '', summary, '',
    '| Container | Exit | Ergebnis | Befunde |', '|---|---|---|---|',
    ...rows.map((r) => `| \`${r.file}\` | ${r.exit} | ${r.ok ? (r.known.length ? 'ok, nur bekannte Befunde' : 'ok, 0 Fehler, 0 Warnungen') : '**Fehler**'} | ${[...r.unexpected, ...r.known].map((x) => x.replace(/\|/g, '\\|')).join('<br>') || '–'} |`), ''];
  writeFileSync(MD, md.join('\n'));
}
process.exit(failed ? 1 : 0);
