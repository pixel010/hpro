#!/usr/bin/env node
/**
 * Mechanical check of the implementer's guide and the author's guide (package S7):
 *
 *   docs/spezifikation/04-umsetzer-handbuch.md
 *   docs/spezifikation/05-autorenleitfaden.md
 *
 * Error codes:
 *   unknown-requirement   a cited `HP-…`, `HPR-…`, `HPL-…`, `HPG-…` or `HPF-…` id does not exist in parts 0–3
 *   unknown-section       a cited "Teil N, Abschnitt X.Y" does not exist in that part
 *   statement-without-reference
 *                         a paragraph, list item or table row outside an informative section names no
 *                         requirement and no section of the specification (acceptance criterion 4)
 *   chapter-without-example
 *                         a `## ` chapter has no fenced block that starts with `$ ` (command plus output)
 *                         or no fenced file excerpt (acceptance criterion 2)
 *   output-not-verbatim   a `$ ` block is not found verbatim in docs/belege/S7/*.txt (`…` lines may stand
 *                         for omitted lines); `beleg:<datei>` in the fence info pins the file
 *   excerpt-mismatch      a fenced block with `aus:<pfad>` in its info string is not a verbatim excerpt
 *                         of that file (`…` lines may stand for omitted lines)
 *   missing-path          a backticked repository path (docs/, scripts/, kern/, testsuite/, pruefstein/,
 *                         prototyp/) does not exist
 *   missing-document      the guide itself is missing
 *
 * Informative text is marked by "(informativ)" in a heading (whole section exempt) or by a paragraph
 * that starts with "*Informativ:*". Lead-ins that end with a colon and are shorter than 120 characters
 * are exempt as well.
 *
 *   node scripts/check-handbuch.mjs [--json] [doc.md ...]
 *
 * Exit 0 when there are no errors; 1 otherwise.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SPEC_DIR = resolve(ROOT, 'docs', 'spezifikation');
export const DEFAULT_DOCS = ['04-umsetzer-handbuch.md', '05-autorenleitfaden.md'].map((f) => join(SPEC_DIR, f));
export const BELEGE_DIR = resolve(ROOT, 'docs', 'belege', 'S7');
const PARTS = { 0: '00-spezifikation.md', 1: '01-konformitaet.md', 2: '02-lizenz-und-governance.md', 3: '03-tabellen-und-formeln.md' };

const ID_RE = /\b(HP|HPR|HPL|HPG|HPF)-[A-Z]+-\d{3}\b/g;
const SECTION_RE = /Teil\s+([0-3])(?:,|\s)\s*(?:Abschnitt|§)\s*(\d+(?:\.\d+)*)/g;
const PATH_RE = /`((?:docs|scripts|kern|testsuite|pruefstein|prototyp)\/[A-Za-z0-9_./@-]+)`/g;

/** Requirement ids and section numbers of the four parts. */
export function loadSpec(specDir = SPEC_DIR) {
  const ids = new Set();
  const sections = new Map(); // part -> Set of "X.Y"
  for (const [part, file] of Object.entries(PARTS)) {
    const text = readFileSync(join(specDir, file), 'utf8');
    for (const m of text.matchAll(/^#### ((?:HP|HPR|HPL|HPG|HPF)-[A-Z]+-\d{3}) ·/gm)) ids.add(m[1]);
    const set = new Set();
    for (const m of text.matchAll(/^#{2,4} (\d+(?:\.\d+)*)\.? /gm)) set.add(m[1]);
    sections.set(part, set);
  }
  return { ids, sections };
}

export function loadBelege(dir = BELEGE_DIR) {
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).sort()) if (f.endsWith('.txt')) out.set(f, readFileSync(join(dir, f), 'utf8'));
  return out;
}

const norm = (s) => s.replace(/[ \t]+$/gm, '');

/** True if the pieces of `block` (split at lines that are only `…`) appear in order in `haystack`. */
export function containsInOrder(haystack, block) {
  const pieces = norm(block)
    .split(/^…\s*$/m)
    .map((p) => p.replace(/^\n+|\n+$/g, ''))
    .filter((p) => p.length > 0);
  const h = norm(haystack);
  let from = 0;
  for (const p of pieces) {
    const i = h.indexOf(p, from);
    if (i < 0) return false;
    from = i + p.length;
  }
  return true;
}

/** Parses markdown into chapters, blocks (statements) and fenced code blocks. */
export function parse(text) {
  const lines = text.split('\n');
  const chapters = []; // { title, line, informative, fences: [] }
  const statements = []; // { line, text, informative }
  const fences = []; // { line, info, body, chapter }
  const paths = []; // { line, path }
  let informativeLevel = Infinity; // heading level that opened an informative section
  let inFence = false;
  let fence = null;
  let para = null;
  let tableHeaderSeen = false;
  const flush = () => {
    if (para) {
      statements.push(para);
      para = null;
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');
    if (inFence) {
      if (/^```/.test(line)) {
        inFence = false;
        fence.body = fence.lines.join('\n');
        delete fence.lines;
        fences.push(fence);
        chapters.at(-1)?.fences.push(fence);
        fence = null;
      } else fence.lines.push(raw);
      continue;
    }
    if (/^```/.test(line)) {
      flush();
      inFence = true;
      fence = { line: i + 1, info: line.slice(3).trim(), lines: [], chapter: chapters.length - 1 };
      continue;
    }
    for (const m of line.matchAll(PATH_RE)) paths.push({ line: i + 1, path: m[1] });
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const level = h[1].length;
      const title = h[2].trim();
      if (level <= informativeLevel) informativeLevel = Infinity;
      if (/\(informativ\)/i.test(title)) informativeLevel = level;
      if (level === 2) chapters.push({ title, line: i + 1, informative: informativeLevel <= 2, fences: [] });
      tableHeaderSeen = false;
      continue;
    }
    // Text before the first `## ` chapter (title block, status line) is front matter, not a statement.
    const informative = informativeLevel !== Infinity || chapters.length === 0;
    if (line.trim() === '' || /^<!--/.test(line.trim()) || /^-->/.test(line.trim()) || /^(-{3,}|\*{3,})$/.test(line.trim())) {
      flush();
      if (line.trim() === '') tableHeaderSeen = false;
      continue;
    }
    if (/^\|/.test(line)) {
      flush();
      if (/^\|\s*-{3,}/.test(line)) continue; // separator
      if (!tableHeaderSeen) {
        tableHeaderSeen = true; // header row
        continue;
      }
      statements.push({ line: i + 1, text: line, informative, kind: 'row' });
      continue;
    }
    const li = /^\s*([-*+]|\d+\.)\s+/.test(line);
    if (li) {
      flush();
      para = { line: i + 1, text: line, informative, kind: 'item' };
      continue;
    }
    if (para) para.text += '\n' + line;
    else para = { line: i + 1, text: line, informative, kind: 'paragraph' };
  }
  flush();
  return { chapters, statements, fences, paths };
}

export function checkDocument(path, text, spec, belege, opts = {}) {
  const findings = [];
  const err = (code, line, detail) => findings.push({ code, file: path, line, detail });
  const { chapters, statements, fences, paths } = parse(text);

  // References
  for (const s of statements) {
    const ids = [...s.text.matchAll(ID_RE)].map((m) => m[0]);
    for (const id of ids) if (!spec.ids.has(id)) err('unknown-requirement', s.line, id);
    const secs = [...s.text.matchAll(SECTION_RE)];
    for (const m of secs) if (!spec.sections.get(m[1])?.has(m[2])) err('unknown-section', s.line, `Teil ${m[1]}, Abschnitt ${m[2]}`);
    if (s.informative) continue;
    if (/^\s*\*?Informativ:/i.test(s.text)) continue;
    const plain = s.text.trim();
    if (plain.endsWith(':') && plain.length < 120) continue; // lead-in to a code block or list
    if (ids.length === 0 && secs.length === 0) err('statement-without-reference', s.line, `${s.kind}: ${plain.slice(0, 70).replace(/\n/g, ' ')}…`);
  }
  // Examples per chapter
  for (const c of chapters) {
    const commands = c.fences.filter((f) => /^\$ /.test(f.body));
    const excerpts = c.fences.filter((f) => !/^\$ /.test(f.body));
    if (commands.length === 0 || excerpts.length === 0) err('chapter-without-example', c.line, `${c.title}: ${commands.length} Befehlsausgabe(n), ${excerpts.length} Datei-/Ausschnittblock(e)`);
  }
  // Outputs verbatim in the evidence files
  for (const f of fences) {
    if (/^\$ /.test(f.body)) {
      const pin = /beleg:(\S+)/.exec(f.info)?.[1];
      const candidates = pin ? [[pin, belege.get(pin)]] : [...belege];
      const ok = candidates.some(([, content]) => content !== undefined && containsInOrder(content, f.body));
      if (!ok) err('output-not-verbatim', f.line, `${f.body.split('\n')[0].slice(0, 80)}${pin ? ` (beleg:${pin})` : ''}`);
    }
    const src = /aus:(\S+)/.exec(f.info)?.[1];
    if (src) {
      const file = resolve(opts.root ?? ROOT, src);
      const content = opts.files?.get(src) ?? (existsSync(file) ? readFileSync(file, 'utf8') : undefined);
      if (content === undefined) err('missing-path', f.line, src);
      else if (!containsInOrder(content, f.body)) err('excerpt-mismatch', f.line, src);
    }
  }
  for (const p of paths) {
    const exists = opts.files?.has(p.path) || existsSync(resolve(opts.root ?? ROOT, p.path));
    if (!exists) err('missing-path', p.line, p.path);
  }
  return { findings, stats: { chapters: chapters.length, statements: statements.length, fences: fences.length, commands: fences.filter((f) => /^\$ /.test(f.body)).length, references: statements.reduce((n, s) => n + [...s.text.matchAll(ID_RE)].length, 0) } };
}

export function checkAll({ docs, spec, belege, opts } = {}) {
  spec ??= loadSpec();
  belege ??= loadBelege();
  const results = [];
  for (const [path, text] of docs) {
    if (text === undefined) {
      results.push({ file: path, findings: [{ code: 'missing-document', file: path, line: 0, detail: 'Datei fehlt' }], stats: {} });
      continue;
    }
    results.push({ file: path, ...checkDocument(path, text, spec, belege, opts) });
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const files = args.filter((a) => !a.startsWith('--'));
  const docs = new Map((files.length ? files.map((f) => resolve(f)) : DEFAULT_DOCS).map((f) => [f.startsWith(ROOT) ? f.slice(ROOT.length + 1) : f, existsSync(f) ? readFileSync(f, 'utf8') : undefined]));
  const results = checkAll({ docs });
  const errors = results.flatMap((r) => r.findings);
  if (json) console.log(JSON.stringify({ results, errors: errors.length }, null, 2));
  else {
    for (const r of results) {
      console.log(`${r.file}: ${r.stats.chapters ?? 0} Kapitel, ${r.stats.statements ?? 0} Aussagen, ${r.stats.references ?? 0} Anforderungsnennungen, ${r.stats.fences ?? 0} Codeblöcke (${r.stats.commands ?? 0} Befehlsausgaben)`);
      for (const f of r.findings) console.log(`  ERROR ${f.code} ${r.file}:${f.line}: ${f.detail}`);
    }
    console.log(errors.length === 0 ? 'OK: 0 errors' : `FAILED: ${errors.length} errors`);
  }
  process.exit(errors.length === 0 ? 0 : 1);
}
