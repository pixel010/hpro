#!/usr/bin/env node
/**
 * Mechanical check of part 6, docs/spezifikation/06-einbau.md (package S8).
 *
 * From the checker of the guides (scripts/check-handbuch.mjs, S7):
 *   unknown-requirement, unknown-section   cited ids and sections exist in parts 0–3
 *   output-not-verbatim                    every `$ ` block stands verbatim in docs/belege/S8/*.txt
 *   excerpt-mismatch                       every `aus:<pfad>` block is a verbatim excerpt of that file
 *   missing-path                           backticked repository paths exist (here also einbau/,
 *                                          app/, dienst/ and mobil/, which the guides do not cite)
 * (The rules „every statement names a requirement“ and „every chapter has an example“ of the guides
 * do not apply: part 6 describes tools, not the format.)
 *
 * Own rules:
 *   api-missing        a runtime export of @hpro/kern (top level or namespace name) is not named in backticks
 *   stable-unknown     a function listed as stable in the namespace table does not exist in that namespace
 *   exit-codes         the exit code table of chapter 3.2 differs from EXIT in kern/bin/cli-common.ts
 *   command-missing    a command of table 3.1 is not in the help text of kern/bin/hpro.ts
 *   version-mismatch   KERN_VERSION / SPEC_VERSION / CLI_INTERFACE_VERSION differ from kern/src/version.ts
 *
 *   node scripts/check-einbau.mjs [--json] [doc.md]
 *
 * Needs kern/dist (npm run build -w kern). Exit 0 without errors, 1 otherwise.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkDocument, loadBelege, loadSpec } from './check-handbuch.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_DOC = resolve(ROOT, 'docs', 'spezifikation', '06-einbau.md');
export const BELEGE_DIR = resolve(ROOT, 'docs', 'belege', 'S8');
const IGNORED = new Set(['statement-without-reference', 'chapter-without-example']);
// Path roots the checker of the guides does not look at.
const EXTRA_PATH_RE = /`((?:einbau|app|dienst|mobil)\/[A-Za-z0-9_./@-]+)`/g;

/** Identifiers at the start of every backticked span: `createContainer(input)` → createContainer, `calc.x` → calc.x. */
export function namedInBackticks(text) {
  const out = new Set();
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const id = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)/.exec(m[1]);
    if (id) {
      out.add(id[1]);
      out.add(id[1].split('.')[0]);
    }
  }
  return out;
}

/** Rows of the first Markdown table after the heading that starts with `heading`. */
export function tableAfter(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start < 0) return [];
  const rows = [];
  let i = start + 1;
  while (i < lines.length && !lines[i].startsWith('|')) {
    if (/^#{1,6} /.test(lines[i])) return [];
    i++;
  }
  for (; i < lines.length && lines[i].startsWith('|'); i++) {
    if (/^\|\s*-{3,}/.test(lines[i])) continue;
    rows.push(lines[i].split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim()));
  }
  return rows.slice(1); // without the header row
}

/**
 * @param {string} path
 * @param {string} text
 * @param {{ spec, belege, exports: string[], namespaces: Record<string, string[]>, exitCodes: number[], help: string, versions: Record<string, string> }} ctx
 */
export function checkEinbau(path, text, ctx) {
  const base = checkDocument(path, text, ctx.spec, ctx.belege, { root: ROOT });
  const findings = base.findings.filter((f) => !IGNORED.has(f.code));
  const err = (code, detail) => findings.push({ code, file: path, line: 0, detail });
  const named = namedInBackticks(text);
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(EXTRA_PATH_RE)) if (!existsSync(resolve(ROOT, m[1]))) findings.push({ code: 'missing-path', file: path, line: i + 1, detail: m[1] });
  });
  for (const e of ctx.exports) if (!named.has(e)) err('api-missing', e);

  // Namespace table of chapter 4.3: column 2 lists stable members.
  const nsRows = tableAfter(text, '**Namensräume**');
  if (nsRows.length === 0) err('stable-unknown', 'Tabelle „Namensräume“ fehlt');
  for (const row of nsRows) {
    const ns = /`([a-z0-9]+)`/.exec(row[0] ?? '')?.[1];
    if (!ns || !ctx.namespaces[ns]) {
      err('stable-unknown', `Namensraum ${row[0]}`);
      continue;
    }
    for (const m of (row[1] ?? '').matchAll(/`([A-Za-z_$][\w$]*)`/g)) if (!ctx.namespaces[ns].includes(m[1])) err('stable-unknown', `${ns}.${m[1]}`);
  }
  for (const ns of Object.keys(ctx.namespaces)) if (!nsRows.some((r) => r[0]?.includes(`\`${ns}\``))) err('api-missing', `Namensraum ${ns} fehlt in der Tabelle`);

  // Exit codes of chapter 3.2.
  const codes = tableAfter(text, '### 3.2').map((r) => Number(r[0])).filter((n) => Number.isInteger(n));
  const want = [...ctx.exitCodes].sort((a, b) => a - b);
  if (JSON.stringify([...codes].sort((a, b) => a - b)) !== JSON.stringify(want)) err('exit-codes', `Tabelle ${JSON.stringify(codes)} statt ${JSON.stringify(want)}`);

  // Commands of chapter 3.1.
  const commands = tableAfter(text, '### 3.1').map((r) => /`(hpro [a-z]+(?: [a-z]+)?)/.exec(r[0] ?? '')?.[1]).filter(Boolean);
  if (commands.length === 0) err('command-missing', 'Befehlstabelle 3.1 fehlt');
  for (const c of commands) if (!ctx.help.includes(c)) err('command-missing', c);

  // Versions in chapter 2.
  for (const row of tableAfter(text, '**Versionen.**')) {
    const k = /`([A-Z_]+)`/.exec(row[0] ?? '')?.[1];
    const v = /`([^`]+)`/.exec(row[1] ?? '')?.[1];
    if (k && k in ctx.versions && String(ctx.versions[k]) !== v) err('version-mismatch', `${k}: ${v} statt ${ctx.versions[k]}`);
  }
  for (const k of Object.keys(ctx.versions)) if (!named.has(k)) err('version-mismatch', `${k} nicht genannt`);
  return { findings, stats: base.stats };
}

/** Facts from the code: exports of kern/dist, exit codes, help text, versions. */
export async function loadContext() {
  const kern = await import(pathToFileURL(resolve(ROOT, 'kern/dist/index.js')).href);
  const exports = Object.keys(kern).sort();
  const namespaces = {};
  for (const k of exports) if (kern[k] && typeof kern[k] === 'object' && Object.getPrototypeOf(kern[k]) === null) namespaces[k] = Object.keys(kern[k]);
  const common = readFileSync(resolve(ROOT, 'kern/bin/cli-common.ts'), 'utf8');
  const exit = /export const EXIT = \{([^}]+)\}/.exec(common)?.[1] ?? '';
  const exitCodes = [...exit.matchAll(/:\s*(\d+)/g)].map((m) => Number(m[1]));
  const help = /const HELP = `([\s\S]*?)`;/.exec(readFileSync(resolve(ROOT, 'kern/bin/hpro.ts'), 'utf8'))?.[1] ?? '';
  const versions = { KERN_VERSION: kern.KERN_VERSION, SPEC_VERSION: kern.SPEC_VERSION, CLI_INTERFACE_VERSION: kern.CLI_INTERFACE_VERSION };
  return { spec: loadSpec(), belege: loadBelege(BELEGE_DIR), exports, namespaces, exitCodes, help, versions };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--')) ?? DEFAULT_DOC;
  const rel = file.startsWith(ROOT) ? file.slice(ROOT.length + 1) : file;
  if (!existsSync(resolve(ROOT, 'kern/dist/index.js'))) {
    console.error('check-einbau: kern/dist fehlt (npm run build -w kern)');
    process.exit(2);
  }
  const ctx = await loadContext();
  const text = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  const r = text === undefined ? { findings: [{ code: 'missing-document', file: rel, line: 0, detail: 'Datei fehlt' }], stats: {} } : checkEinbau(rel, text, ctx);
  if (args.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    const nsMembers = Object.values(ctx.namespaces).reduce((n, l) => n + l.length, 0);
    console.log(`${rel}: ${r.stats.chapters ?? 0} Kapitel, ${r.stats.fences ?? 0} Codeblöcke (${r.stats.commands ?? 0} Befehlsausgaben), ${ctx.exports.length} Exporte der Bibliothek (davon ${Object.keys(ctx.namespaces).length} Namensräume mit ${nsMembers} Mitgliedern), Rückgabecodes ${ctx.exitCodes.join(', ')}`);
    for (const f of r.findings) console.log(`  ERROR ${f.code} ${f.file}:${f.line}: ${f.detail}`);
    console.log(r.findings.length === 0 ? 'OK: 0 errors' : `FAILED: ${r.findings.length} errors`);
  }
  process.exit(r.findings.length === 0 ? 0 : 1);
}
