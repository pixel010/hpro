#!/usr/bin/env node
/**
 * Mechanical check of the html-Pro specification (docs/spezifikation/00-spezifikation.md).
 *
 * Verifies, for every requirement block
 *   `#### HP-<AREA>-<NNN> · <Muss|Soll|Kann> · <Basis|Lebendig|Signiert|Archiv>`:
 *   - heading format, known area, numbering contiguous from 001 without gaps or duplicates
 *   - the requirement text uses the normative keyword that matches its grade
 *   - a non-empty `*Prüfverfahren:*` line with an explicit "Erwartetes Ergebnis"
 *   - a `*Grundlage:*` line that cites a source `[Qn]` listed in the sources section, or states
 *     an own convention ("eigene …")
 *   - no vendor or product name in requirement text or test procedure
 *   - every cross reference `HP-…` and every `(#hp-…--grad--stufe)` link resolves
 * and, for the whole document
 *   - the conformance table lists every requirement exactly once with matching grade and level
 *   - the per-level summary table and the conformance-class table (producer/reader) match the
 *     computed counts; every subject letter belongs to a class
 *   - the implementability touchstone section exists: scope table naming Basis requirements,
 *     procedure steps 1–6, run table with at least one recorded run
 *   - no unknown `[Qn]` references, no unused sources
 *
 * Usage: node scripts/check-spec.mjs [path] [--json]
 * Exit code 0 when no error was found, 1 otherwise, 2 on usage/IO problems.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SPEC = resolve(HERE, '..', 'docs', 'spezifikation', '00-spezifikation.md');

export const AREAS = ['CONT', 'INH', 'ADR', 'NEST', 'PROF', 'SBX', 'LOCK', 'SIG', 'PRINT', 'META', 'VERS', 'RS', 'MIN'];
export const GRADES = ['Muss', 'Soll', 'Kann'];
export const LEVELS = ['Basis', 'Lebendig', 'Signiert', 'Archiv'];

const HEADING = /^#### (HP-([A-Z]+)-(\d{3})) · (\S+) · (\S+)\s*$/;
const KEYWORDS = {
  Muss: /\b(MUSS|MÜSSEN|DARF NICHT|DÜRFEN NICHT)\b/,
  Soll: /\b(SOLL|SOLLEN|SOLL NICHT|SOLLEN NICHT)\b/,
  Kann: /\b(KANN|KÖNNEN)\b/,
};
/** Product and vendor names that must not appear in normative text or test procedures. */
const VENDOR_WORDS = [
  'Adobe', 'Acrobat', 'Microsoft', 'Google', 'Apple', 'Mozilla', 'Chrome', 'Chromium', 'Firefox', 'Safari',
  'WebKit', 'Tauri', 'Electron', 'WeasyPrint', 'Docling', 'calibre', 'Thorium', 'Readium', 'epubcheck',
  'veraPDF', 'DSS', 'LibreOffice', 'Excel', 'Word', 'InDesign', 'Foxit', 'Paged.js', 'Vivliostyle', 'Prince',
];
const VENDOR_RE = new RegExp(`(^|[^\\p{L}\\p{N}])(${VENDOR_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'u');

export function slug(id, grade, level) {
  return `${id.toLowerCase()}--${grade.toLowerCase()}--${level.toLowerCase()}`;
}

/** Parses the specification into requirements, sources and tables. */
export function parseSpec(text) {
  const lines = text.split(/\r?\n/);
  const requirements = [];
  const problems = [];
  const headingLines = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence || !/^#{1,6} /.test(line)) continue;
    headingLines.push(i);
    if (!line.startsWith('#### ')) continue;
    const m = HEADING.exec(line);
    if (!m) {
      if (/^#### HP-/.test(line)) problems.push({ code: 'heading-format', line: i + 1, text: line });
      continue;
    }
    requirements.push({ id: m[1], area: m[2], number: Number(m[3]), grade: m[4], level: m[5], line: i + 1, start: i });
  }
  // Body of each requirement: lines after the heading up to the next heading of any level.
  for (const req of requirements) {
    const next = headingLines.find((n) => n > req.start) ?? lines.length;
    const body = lines.slice(req.start + 1, next);
    const procIndex = body.findIndex((l) => l.startsWith('*Prüfverfahren:*'));
    const baseIndex = body.findIndex((l) => l.startsWith('*Grundlage:*'));
    const until = (from, to) => body.slice(from, to < 0 ? body.length : to).join('\n').trim();
    req.text = until(0, procIndex >= 0 ? procIndex : baseIndex);
    req.procedure = procIndex >= 0 ? until(procIndex, baseIndex > procIndex ? baseIndex : -1).replace(/^\*Prüfverfahren:\*\s*/, '') : '';
    req.basis = baseIndex >= 0 ? until(baseIndex, -1).replace(/^\*Grundlage:\*\s*/, '') : '';
    req.hasProcedure = procIndex >= 0;
    req.hasBasis = baseIndex >= 0;
  }
  // Sources: lines `- [Qn] …` in the last section.
  const sources = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = /^- \[(Q\d+[a-z]?)\] (.+)$/.exec(lines[i]);
    if (m) sources.set(m[1], { line: i + 1, text: m[2], used: 0 });
  }
  // Conformance table between the markers.
  const tStart = lines.findIndex((l) => l.includes('KONFORMITAETSTABELLE ANFANG'));
  const tEnd = lines.findIndex((l) => l.includes('KONFORMITAETSTABELLE ENDE'));
  const tableRows = [];
  if (tStart >= 0 && tEnd > tStart) {
    for (let i = tStart + 1; i < tEnd; i++) {
      const m = /^\| (HP-[A-Z]+-\d{3}) \| (\S+) \| (\S+) \| ([^|]+) \| (.+) \|\s*$/.exec(lines[i]);
      if (m) tableRows.push({ id: m[1], grade: m[2], level: m[3], subject: m[4].trim(), title: m[5].trim(), line: i + 1 });
      else if (/^\| HP-/.test(lines[i])) problems.push({ code: 'table-row-format', line: i + 1, text: lines[i] });
    }
  } else {
    problems.push({ code: 'table-missing', line: 0, text: 'conformance table markers not found' });
  }
  // Summary table (15.3): rows `| Basis | n | n | n | n |` and `| **alle** | **n** | … |`.
  const summary = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = /^\| \*{0,2}(Basis|Lebendig|Signiert|Archiv|alle)\*{0,2} \| \*{0,2}(\d+)\*{0,2} \| \*{0,2}(\d+)\*{0,2} \| \*{0,2}(\d+)\*{0,2} \| \*{0,2}(\d+)\*{0,2} \|\s*$/.exec(lines[i]);
    if (m) summary.set(m[1], { Muss: +m[2], Soll: +m[3], Kann: +m[4], sum: +m[5], line: i + 1 });
  }
  // Conformance classes (16.4): rows `| <Klasse>-Konformität | D, E, B | n | … |`.
  const classes = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\| ([A-Za-zäöü]+)-Konformität \| ([A-Z, ]+) \| (\d+) \|/.exec(lines[i]);
    if (m) classes.push({ name: m[1], subjects: m[2].split(',').map((x) => x.trim()), count: +m[3], line: i + 1 });
  }
  // Implementability touchstone (17): heading, scope table for the minimal producer, procedure
  // steps 1–6, and the run table between its markers with at least one recorded run.
  const touchstone = { heading: -1, scopeIds: [], steps: new Set(), runs: 0, markers: false };
  const tsHeading = lines.findIndex((l) => /^## \d+\. Prüfstein der Umsetzbarkeit/.test(l));
  if (tsHeading >= 0) {
    touchstone.heading = tsHeading + 1;
    const next = headingLines.find((n) => n > tsHeading && /^## /.test(lines[n])) ?? lines.length;
    for (let i = tsHeading; i < next; i++) {
      if (/^### \d+\.2 /.test(lines[i])) {
        for (let j = i; j < next && !/^### \d+\.3 /.test(lines[j]); j++) {
          for (const m of lines[j].matchAll(/\bHP-[A-Z]+-\d{3}\b/g)) touchstone.scopeIds.push(m[0]);
        }
      }
      const step = /^(\d)\. \*\*/.exec(lines[i]);
      if (step) touchstone.steps.add(+step[1]);
    }
    const rStart = lines.findIndex((l) => l.includes('PRUEFSTEIN-DURCHLAEUFE ANFANG'));
    const rEnd = lines.findIndex((l) => l.includes('PRUEFSTEIN-DURCHLAEUFE ENDE'));
    if (rStart >= 0 && rEnd > rStart) {
      touchstone.markers = true;
      for (let i = rStart + 1; i < rEnd; i++) if (/^\| \d+ \|/.test(lines[i])) touchstone.runs++;
    }
  }
  return { lines, requirements, sources, tableRows, summary, classes, touchstone, problems };
}

export function checkSpec(text) {
  const spec = parseSpec(text);
  const errors = [...spec.problems];
  const warnings = [];
  const err = (code, req, detail) => errors.push({ code, id: req?.id, line: req?.line, detail });
  const byId = new Map();

  for (const req of spec.requirements) {
    if (!AREAS.includes(req.area)) err('unknown-area', req, req.area);
    if (!GRADES.includes(req.grade)) err('unknown-grade', req, req.grade);
    if (!LEVELS.includes(req.level)) err('unknown-level', req, req.level);
    if (byId.has(req.id)) err('duplicate-id', req, `also at line ${byId.get(req.id).line}`);
    byId.set(req.id, req);

    if (!req.text) err('missing-text', req, 'no requirement text before Prüfverfahren');
    const kw = KEYWORDS[req.grade];
    if (kw && req.text && !kw.test(req.text)) err('keyword-mismatch', req, `grade ${req.grade} needs ${kw.source}`);
    if (!req.hasProcedure || req.procedure.length < 20) err('missing-procedure', req, 'no or too short *Prüfverfahren:*');
    else if (!/Erwartetes Ergebnis/.test(req.procedure.replace(/\s+/g, ' '))) err('procedure-without-expectation', req, 'Prüfverfahren names no "Erwartetes Ergebnis"');
    if (!req.hasBasis || req.basis.length < 5) err('missing-basis', req, 'no *Grundlage:*');
    else {
      const refs = [...req.basis.matchAll(/\[(Q\d+[a-z]?)\]/g)].map((m) => m[1]);
      for (const r of refs) {
        if (!spec.sources.has(r)) err('unknown-source', req, r);
      }
      if (refs.length === 0 && !/eigene (Konvention|Festlegung|Einschränkung|Verschärfung|Ergänzung|Teilmenge)/.test(req.basis)) {
        err('basis-without-source', req, 'Grundlage cites no [Qn] and is not declared as own convention');
      }
    }
    for (const field of ['text', 'procedure']) {
      const m = VENDOR_RE.exec(req[field] ?? '');
      if (m) err('vendor-name', req, `"${m[2]}" in ${field}`);
    }
  }

  // Numbering: contiguous from 001 per area, in document order.
  for (const area of AREAS) {
    const nums = spec.requirements.filter((r) => r.area === area).map((r) => r.number);
    if (nums.length === 0) { err('area-empty', undefined, area); continue; }
    const expected = nums.map((_, i) => i + 1);
    if (nums.join(',') !== expected.join(',')) err('numbering', undefined, `${area}: got ${nums.join(',')}, expected ${expected.join(',')}`);
  }

  // Cross references and anchor links in the whole document.
  for (const [i, line] of spec.lines.entries()) {
    for (const m of line.matchAll(/\bHP-([A-Z]+)-(\d{3})\b/g)) {
      if (!byId.has(m[0]) && AREAS.includes(m[1])) err('dangling-reference', { id: m[0], line: i + 1 }, 'referenced requirement does not exist');
    }
    for (const m of line.matchAll(/\(#(hp-[a-z]+-\d{3})--([a-z]+)--([a-z]+)\)/g)) {
      const req = byId.get(m[1].toUpperCase());
      if (!req) err('dangling-anchor', { id: m[1], line: i + 1 }, 'anchor target does not exist');
      else if (slug(req.id, req.grade, req.level) !== `${m[1]}--${m[2]}--${m[3]}`) err('stale-anchor', { id: req.id, line: i + 1 }, `anchor says ${m[2]}/${m[3]}, heading says ${req.grade}/${req.level}`);
    }
  }

  // Conformance table.
  const seen = new Map();
  for (const row of spec.tableRows) {
    const req = byId.get(row.id);
    if (!req) { err('table-unknown-id', { id: row.id, line: row.line }, 'row for a requirement that does not exist'); continue; }
    if (seen.has(row.id)) err('table-duplicate', { id: row.id, line: row.line }, 'listed twice');
    seen.set(row.id, row);
    if (row.grade !== req.grade || row.level !== req.level) err('table-mismatch', { id: row.id, line: row.line }, `table ${row.grade}/${row.level} vs heading ${req.grade}/${req.level}`);
    if (!/^[DEBLP](, [DEBLP])*$/.test(row.subject)) err('table-subject', { id: row.id, line: row.line }, `subject "${row.subject}"`);
  }
  for (const req of spec.requirements) if (!seen.has(req.id)) err('table-missing-id', req, 'requirement not in conformance table');
  const subjectCounts = { D: 0, E: 0, B: 0, L: 0, P: 0 };
  for (const row of spec.tableRows) for (const sub of row.subject.split(',').map((x) => x.trim())) if (sub in subjectCounts) subjectCounts[sub]++;
  if (spec.classes.length === 0) err('class-table-missing', undefined, 'no conformance class table (16.4)');
  const classCovered = new Set();
  for (const c of spec.classes) {
    const computed = spec.tableRows.filter((row) => row.subject.split(',').map((x) => x.trim()).some((sub) => c.subjects.includes(sub))).length;
    if (computed !== c.count) err('class-count-mismatch', { line: c.line }, `${c.name}: table ${c.count}, computed ${computed}`);
    for (const sub of c.subjects) classCovered.add(sub);
  }
  if (spec.classes.length > 0) for (const sub of Object.keys(subjectCounts)) if (!classCovered.has(sub)) err('class-subject-uncovered', undefined, `subject ${sub} belongs to no conformance class`);

  // Implementability touchstone (17): section present, scope lists only existing Basis
  // requirements, procedure has steps 1–6, run table present with at least one run.
  const ts = spec.touchstone;
  if (ts.heading < 0) err('touchstone-missing', undefined, 'no section "Prüfstein der Umsetzbarkeit"');
  else {
    if (ts.scopeIds.length < 10) err('touchstone-scope', { line: ts.heading }, `scope (x.2) names only ${ts.scopeIds.length} requirements`);
    for (const id of new Set(ts.scopeIds)) {
      const req = byId.get(id);
      if (req && req.level !== 'Basis') err('touchstone-scope-level', { id, line: ts.heading }, `minimal producer/reader scope must be Basis, is ${req.level}`);
    }
    for (const n of [1, 2, 3, 4, 5, 6]) if (!ts.steps.has(n)) err('touchstone-procedure', { line: ts.heading }, `procedure step ${n} missing`);
    if (!ts.markers) err('touchstone-runs-missing', { line: ts.heading }, 'run table markers not found');
    else if (ts.runs === 0) err('touchstone-runs-missing', { line: ts.heading }, 'run table has no recorded run');
  }

  // Counts and summary table.
  const counts = {};
  for (const level of LEVELS) counts[level] = { Muss: 0, Soll: 0, Kann: 0, sum: 0 };
  counts.alle = { Muss: 0, Soll: 0, Kann: 0, sum: 0 };
  for (const req of spec.requirements) {
    if (!counts[req.level] || !(req.grade in counts.alle)) continue;
    counts[req.level][req.grade]++; counts[req.level].sum++;
    counts.alle[req.grade]++; counts.alle.sum++;
  }
  for (const key of [...LEVELS, 'alle']) {
    const row = spec.summary.get(key);
    if (!row) { err('summary-missing', undefined, key); continue; }
    for (const g of ['Muss', 'Soll', 'Kann', 'sum']) {
      if (row[g] !== counts[key][g]) err('summary-mismatch', { line: row.line }, `${key} ${g}: table ${row[g]}, computed ${counts[key][g]}`);
    }
  }
  for (const [i, line] of spec.lines.entries()) {
    if (/^- \[Q\d+[a-z]?\] /.test(line)) continue;
    for (const m of line.matchAll(/\[(Q\d+[a-z]?)\]/g)) {
      const s = spec.sources.get(m[1]);
      if (s) s.used++;
      else err('unknown-source', { line: i + 1 }, m[1]);
    }
  }
  for (const [id, s] of spec.sources) if (s.used === 0) warnings.push({ code: 'unused-source', id, line: s.line });

  const perArea = {};
  for (const area of AREAS) perArea[area] = spec.requirements.filter((r) => r.area === area).length;
  return { ok: errors.length === 0, errors, warnings, counts, perArea, subjectCounts, classes: spec.classes.map((c) => ({ name: c.name, subjects: c.subjects, count: c.count })), touchstone: { scope: new Set(ts.scopeIds).size, steps: ts.steps.size, runs: ts.runs }, requirements: spec.requirements.length, sources: spec.sources.size };
}

function main(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const path = args.find((a) => !a.startsWith('--')) ?? DEFAULT_SPEC;
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (e) { console.error(`cannot read ${path}: ${e.message}`); return 2; }
  const result = checkSpec(text);
  if (json) {
    console.log(JSON.stringify({ file: path, ...result }, null, 2));
  } else {
    console.log(`check-spec: ${path}`);
    console.log(`requirements: ${result.requirements}, sources: ${result.sources}`);
    console.log('per area: ' + Object.entries(result.perArea).map(([a, n]) => `${a}=${n}`).join(' '));
    for (const key of [...LEVELS, 'alle']) {
      const c = result.counts[key];
      console.log(`${key.padEnd(9)} Muss=${c.Muss} Soll=${c.Soll} Kann=${c.Kann} sum=${c.sum}`);
    }
    console.log('per subject: ' + Object.entries(result.subjectCounts).map(([k, n]) => `${k}=${n}`).join(' ') + ' | classes: ' + result.classes.map((c) => `${c.name}=${c.count}`).join(' '));
    console.log(`touchstone: scope=${result.touchstone.scope} requirements, procedure steps=${result.touchstone.steps}, recorded runs=${result.touchstone.runs}`);
    for (const e of result.errors) console.log(`ERROR ${e.code}${e.id ? ' ' + e.id : ''}${e.line ? ' (line ' + e.line + ')' : ''}${e.detail ? ': ' + e.detail : ''}${e.text ? ': ' + e.text : ''}`);
    for (const w of result.warnings) console.log(`WARN  ${w.code} ${w.id} (line ${w.line})`);
    console.log(result.ok ? `OK: 0 errors, ${result.warnings.length} warnings` : `FAILED: ${result.errors.length} errors, ${result.warnings.length} warnings`);
  }
  return result.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}
