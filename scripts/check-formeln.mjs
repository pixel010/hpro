#!/usr/bin/env node
/**
 * Mechanical check of Teil 3 of the hpro specification
 * (docs/spezifikation/03-tabellen-und-formeln.md: Tabellen und Formeln).
 *
 * For every requirement block `#### HPF-<AREA>-<NNN> · <Muss|Soll|Kann> · <Stufe>`:
 *   - heading format, known area/grade/level, numbering contiguous from 001 per area
 *   - normative keyword matches the grade; `*Prüfverfahren:*` with "Erwartetes Ergebnis";
 *     `*Grundlage:*` citing a `[Qn]` of the sources section or an own convention
 *   - no vendor or product name in requirement text or test procedure
 *   - cross references: `HPF-…` resolve within this part, `HP-…` resolve in Teil 0
 *     (00-spezifikation.md, parsed with check-spec.mjs), anchors carry the right grade/level
 * For the whole document:
 *   - function list (8.2) between markers: >= 40 rows, unique uppercase names, signature,
 *     result, error column and an OpenFormula section number per row; machine-readable copy
 *     03-funktionen.json in sync
 *   - exclusion list (8.3): no overlap with 8.2; contains every function Teil 0 forbids
 *   - every function used in a formula example (inline code starting with `=`) is listed in 8.2
 *     or 8.3; formula examples use `;` as separator and bracketed references
 *   - error names used anywhere are declared in 7.1; host properties table names all 12
 *     host-defined properties of OpenFormula §3.4
 *   - reference values (16) equal those computed by formeln-referenzwerte.mjs
 *   - conformance table (17.1) and per-level summary (17.2) match the requirements
 *
 * Usage: node scripts/check-formeln.mjs [path] [--json] [--export [file]]
 * Exit 0 when no error, 1 otherwise, 2 on usage/IO problems.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseSpec as parseTeil0, slug } from './check-spec.mjs';
import { referenceValues } from './formeln-referenzwerte.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SPEC = resolve(HERE, '..', 'docs', 'spezifikation', '03-tabellen-und-formeln.md');
const DEFAULT_TEIL0 = resolve(HERE, '..', 'docs', 'spezifikation', '00-spezifikation.md');
const DEFAULT_JSON = resolve(HERE, '..', 'docs', 'spezifikation', '03-funktionen.json');

export const AREAS = ['SYN', 'TYP', 'NUM', 'DAT', 'ERR', 'FN', 'STO', 'ADR', 'CALC', 'FRZ', 'IMP', 'SEC'];
export const GRADES = ['Muss', 'Soll', 'Kann'];
export const LEVELS = ['Basis', 'Lebendig', 'Signiert', 'Archiv'];
/** Functions Teil 0 (HP-SBX-016) forbids; they must appear in the exclusion list. */
export const TEIL0_FORBIDDEN = ['NOW', 'TODAY', 'RAND', 'RANDBETWEEN', 'WEBSERVICE', 'DDE', 'HYPERLINK'];
/** Host-defined properties of OpenFormula 1.3 §3.4. */
export const HOST_PROPERTIES = [
  'HOST-CASE-SENSITIVE', 'HOST-PRECISION-AS-SHOWN', 'HOST-SEARCH-CRITERIA-MUST-APPLY-TO-WHOLE-CELL',
  'HOST-AUTOMATIC-FIND-LABELS', 'HOST-USE-REGULAR-EXPRESSIONS', 'HOST-USE-WILDCARDS', 'HOST-NULL-YEAR',
  'HOST-NULL-DATE', 'HOST-LOCALE', 'HOST-ITERATION-STATUS', 'HOST-ITERATION-MAXIMUM-DIFFERENCE', 'HOST-ITERATION-STEPS',
];
const MIN_FUNCTIONS = 40;

const HEADING = /^#### (HPF-([A-Z]+)-(\d{3})) · (\S+) · (\S+)\s*$/;
const KEYWORDS = {
  Muss: /\b(MUSS|MÜSSEN|DARF NICHT|DÜRFEN NICHT)\b/,
  Soll: /\b(SOLL|SOLLEN|SOLL NICHT|SOLLEN NICHT)\b/,
  Kann: /\b(KANN|KÖNNEN)\b/,
};
const VENDOR_WORDS = [
  'Adobe', 'Acrobat', 'Microsoft', 'Google', 'Apple', 'Mozilla', 'Chrome', 'Chromium', 'Firefox', 'Safari',
  'WebKit', 'Tauri', 'Electron', 'WeasyPrint', 'Docling', 'calibre', 'Thorium', 'Readium', 'epubcheck',
  'veraPDF', 'DSS', 'LibreOffice', 'Excel', 'Word', 'InDesign', 'Foxit', 'Paged.js', 'Vivliostyle', 'Prince',
  'Numbers', 'Sheets', 'Calc', 'Gnumeric', 'OnlyOffice',
];
const VENDOR_RE = new RegExp(`(^|[^\\p{L}\\p{N}])(${VENDOR_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'u');
/** Bracketed reference per HPF-SYN-006 (table id without . [ ] ' # $ : and whitespace). */
const REFERENCE_RE = /^\[(?:[^\]\.\[#$':\s]+)?\.\$?[A-Z]+\$?[1-9][0-9]*(?::\.\$?[A-Z]+\$?[1-9][0-9]*)?\]$/;

function between(lines, startMarker, endMarker) {
  const s = lines.findIndex((l) => l.includes(startMarker));
  const e = lines.findIndex((l) => l.includes(endMarker));
  if (s < 0 || e < 0 || e <= s) return null;
  return { start: s, end: e, rows: lines.slice(s + 1, e).map((text, i) => ({ text, line: s + 2 + i })) };
}

function splitRow(text) {
  // Split a markdown table row on unescaped pipes; `\|` stays a literal pipe.
  const cells = [];
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && text[i + 1] === '|') { cur += '|'; i++; continue; }
    if (ch === '|') { cells.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur);
  return cells.slice(1, -1).map((c) => c.trim());
}

/** Strips code spans and link targets, returns formula examples (inline code starting with `=`). */
function formulaExamples(line) {
  const out = [];
  for (const m of line.matchAll(/`([^`]+)`/g)) if (m[1].startsWith('=')) out.push(m[1]);
  return out;
}

/** Tokenises a formula example: strings removed, returns function names, references, separators outside strings. */
function analyseFormula(f) {
  let s = '';
  let inStr = false;
  for (let i = 0; i < f.length; i++) {
    const ch = f[i];
    if (inStr) { if (ch === '"') { if (f[i + 1] === '"') { i++; continue; } inStr = false; } continue; }
    if (ch === '"') { inStr = true; s += ' '; continue; }
    s += ch;
  }
  const functions = [...s.matchAll(/([A-Za-z][A-Za-z0-9.]*)\s*\(/g)].map((m) => m[1].toUpperCase());
  const references = [...s.matchAll(/\[[^\]]*\]/g)].map((m) => m[0]);
  const commas = (s.match(/,/g) ?? []).length;
  const errors = [...s.matchAll(/#[A-Z0-9/]+[!?]/g)].map((m) => m[0]);
  return { functions, references, commas, errors, unterminated: inStr };
}

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
    if (!m) { if (/^#### HPF-/.test(line)) problems.push({ code: 'heading-format', line: i + 1, text: line }); continue; }
    requirements.push({ id: m[1], area: m[2], number: Number(m[3]), grade: m[4], level: m[5], line: i + 1, start: i });
  }
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
  const sources = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = /^- \[(Q\d+[a-z]?)\] (.+)$/.exec(lines[i]);
    if (m) sources.set(m[1], { line: i + 1, text: m[2], used: 0 });
  }
  // Tables between markers.
  const tables = {};
  for (const [key, a, b] of [
    ['functions', 'FUNKTIONSLISTE ANFANG', 'FUNKTIONSLISTE ENDE'],
    ['excluded', 'AUSSCHLUSSLISTE ANFANG', 'AUSSCHLUSSLISTE ENDE'],
    ['errors', 'FEHLERWERTE ANFANG', 'FEHLERWERTE ENDE'],
    ['host', 'HOSTEIGENSCHAFTEN ANFANG', 'HOSTEIGENSCHAFTEN ENDE'],
    ['reference', 'REFERENZWERTE ANFANG', 'REFERENZWERTE ENDE'],
    ['conformance', 'KONFORMITAETSTABELLE ANFANG', 'KONFORMITAETSTABELLE ENDE'],
  ]) {
    const t = between(lines, a, b);
    if (!t) { problems.push({ code: `${key}-table-missing`, line: 0, text: `markers ${a}/${b} not found` }); tables[key] = null; continue; }
    tables[key] = t.rows.filter((r) => /^\|/.test(r.text) && !/^\|\s*-+/.test(r.text) && !/^\| (Funktion|Fehlerwert|Eigenschaft|Kennung) \|/.test(r.text)).map((r) => ({ cells: splitRow(r.text), line: r.line, text: r.text }));
  }
  const summary = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = /^\| \*{0,2}(Basis|Lebendig|Signiert|Archiv|alle)\*{0,2} \| \*{0,2}(\d+)\*{0,2} \| \*{0,2}(\d+)\*{0,2} \| \*{0,2}(\d+)\*{0,2} \| \*{0,2}(\d+)\*{0,2} \|\s*$/.exec(lines[i]);
    if (m) summary.set(m[1], { Muss: +m[2], Soll: +m[3], Kann: +m[4], sum: +m[5], line: i + 1 });
  }
  return { lines, requirements, sources, tables, summary, problems };
}

/** Machine-readable function list, as written to 03-funktionen.json. */
export function exportFunctions(spec) {
  const functions = (spec.tables.functions ?? []).map((r) => ({
    name: r.cells[0], signature: r.cells[1].replace(/^`|`$/g, ''), result: r.cells[2], errors: r.cells[3], openformula: r.cells[4],
  }));
  const excluded = [];
  for (const r of spec.tables.excluded ?? []) {
    const names = r.cells[0].split(',').map((x) => x.trim().replace(/`/g, '')).filter((x) => /^[A-Z][A-Z0-9.]*$/.test(x));
    for (const n of names) excluded.push({ name: n, reason: r.cells[1], importBehaviour: r.cells[2] });
  }
  const errors = (spec.tables.errors ?? []).map((r) => ({ name: r.cells[0].replace(/`/g, ''), meaning: r.cells[1], source: r.cells[2] }));
  return { spec: 'hpro 0.1 Teil 3', formulaLanguage: 'OpenFormula (OASIS ODF 1.3 Part 4, ISO/IEC 26300-2)', functions, excluded, errors };
}

export function checkSpec(text, { teil0Text, jsonText } = {}) {
  const spec = parseSpec(text);
  const errors = [...spec.problems];
  const warnings = [];
  const err = (code, where, detail) => errors.push({ code, id: where?.id, line: where?.line, detail });
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
      for (const r of refs) if (!spec.sources.has(r)) err('unknown-source', req, r);
      const ownOrTeil0 = /eigene (Konvention|Festlegung|Einschränkung|Verschärfung|Ergänzung|Teilmenge)/.test(req.basis) || /\bHP-[A-Z]+-\d{3}\b/.test(req.basis) || /\bHPF-[A-Z]+-\d{3}\b/.test(req.basis);
      if (refs.length === 0 && !ownOrTeil0) err('basis-without-source', req, 'Grundlage cites no [Qn], no Teil-0 requirement and is not declared as own convention');
    }
    for (const field of ['text', 'procedure']) {
      const m = VENDOR_RE.exec(req[field] ?? '');
      if (m) err('vendor-name', req, `"${m[2]}" in ${field}`);
    }
  }
  for (const area of AREAS) {
    const nums = spec.requirements.filter((r) => r.area === area).map((r) => r.number);
    if (nums.length === 0) { err('area-empty', undefined, area); continue; }
    const expected = nums.map((_, i) => i + 1);
    if (nums.join(',') !== expected.join(',')) err('numbering', undefined, `${area}: got ${nums.join(',')}, expected ${expected.join(',')}`);
  }

  // Cross references to this part and to Teil 0.
  let teil0 = null;
  if (teil0Text) {
    const t0 = parseTeil0(teil0Text);
    teil0 = new Map(t0.requirements.map((r) => [r.id, r]));
  }
  for (const [i, line] of spec.lines.entries()) {
    for (const m of line.matchAll(/\bHPF-([A-Z]+)-(\d{3})\b/g)) {
      if (!byId.has(m[0]) && AREAS.includes(m[1])) err('dangling-reference', { id: m[0], line: i + 1 }, 'referenced requirement does not exist in this part');
    }
    for (const m of line.matchAll(/\(#(hpf-[a-z]+-\d{3})--([a-z]+)--([a-z]+)\)/g)) {
      const req = byId.get(m[1].toUpperCase());
      if (!req) err('dangling-anchor', { id: m[1], line: i + 1 }, 'anchor target does not exist');
      else if (slug(req.id, req.grade, req.level) !== `${m[1]}--${m[2]}--${m[3]}`) err('stale-anchor', { id: req.id, line: i + 1 }, `anchor says ${m[2]}/${m[3]}, heading says ${req.grade}/${req.level}`);
    }
    if (teil0) {
      for (const m of line.matchAll(/\bHP-([A-Z]+)-(\d{3})\b/g)) {
        if (!teil0.has(m[0])) err('dangling-teil0-reference', { id: m[0], line: i + 1 }, 'requirement does not exist in Teil 0');
      }
      for (const m of line.matchAll(/\(00-spezifikation\.md#(hp-[a-z]+-\d{3})--([a-z]+)--([a-z]+)\)/g)) {
        const req = teil0.get(m[1].toUpperCase());
        if (!req) err('dangling-teil0-anchor', { id: m[1], line: i + 1 }, 'anchor target does not exist in Teil 0');
        else if (slug(req.id, req.grade, req.level) !== `${m[1]}--${m[2]}--${m[3]}`) err('stale-teil0-anchor', { id: req.id, line: i + 1 }, `anchor says ${m[2]}/${m[3]}, Teil 0 says ${req.grade}/${req.level}`);
      }
    }
  }

  // Function list (8.2).
  const supported = new Map();
  for (const row of spec.tables.functions ?? []) {
    const c = row.cells;
    if (c.length !== 5) { err('function-row-format', { line: row.line }, `${c.length} columns`); continue; }
    const [name, sig, result, errs, sec] = c;
    if (!/^[A-Z][A-Z0-9.]*$/.test(name)) err('function-name', { line: row.line }, `"${name}" is not an uppercase function name`);
    if (supported.has(name)) err('function-duplicate', { id: name, line: row.line }, 'listed twice');
    supported.set(name, row);
    if (!/^`.+\(.*\)`$/.test(sig) || !sig.slice(1).startsWith(name + '(')) err('function-signature', { id: name, line: row.line }, `signature "${sig}" must be a code span starting with ${name}(`);
    if (!result) err('function-result', { id: name, line: row.line }, 'result column empty');
    if (!errs || errs.length < 1) err('function-errors', { id: name, line: row.line }, 'error-behaviour column empty');
    if (!/^6\.\d+\.\d+$/.test(sec)) err('function-source', { id: name, line: row.line }, `"${sec}" is not an OpenFormula section 6.x.y`);
  }
  if (supported.size < MIN_FUNCTIONS) err('function-count', undefined, `${supported.size} functions, at least ${MIN_FUNCTIONS} required`);
  // Exclusion list (8.3).
  const excluded = new Map();
  for (const row of spec.tables.excluded ?? []) {
    const c = row.cells;
    if (c.length !== 3) { err('excluded-row-format', { line: row.line }, `${c.length} columns`); continue; }
    for (const n of c[0].split(',').map((x) => x.trim())) {
      const name = n.replace(/`/g, '');
      if (!/^[A-Z][A-Z0-9.]*$/.test(name)) continue; // descriptive entries ("Makro- und Skriptaufrufe …")
      if (supported.has(name)) err('excluded-overlap', { id: name, line: row.line }, 'function is both supported and excluded');
      excluded.set(name, row);
    }
    if (!c[1] || !c[2]) err('excluded-row-empty', { line: row.line }, 'reason or import behaviour empty');
  }
  for (const n of TEIL0_FORBIDDEN) {
    if (supported.has(n)) err('forbidden-supported', { id: n }, 'Teil 0 (HP-SBX-016) forbids this function');
    if (!excluded.has(n)) err('forbidden-not-excluded', { id: n }, 'function forbidden by Teil 0 missing from exclusion list');
  }
  // Error names (7.1).
  const errorNames = new Set();
  for (const row of spec.tables.errors ?? []) {
    const name = row.cells[0]?.replace(/`/g, '');
    // OpenFormula §5.12: Error ::= '#' [A-Z0-9]+ ([!?] | ('/' ([A-Z] | ([0-9] [!?]))))
    if (!/^#[A-Z0-9]+([!?]|\/([A-Z]|[0-9][!?]))$/.test(name ?? '')) err('error-name-format', { line: row.line }, `"${name}" does not match the Error production`);
    errorNames.add(name);
  }
  for (const n of ['#DIV/0!', '#N/A', '#NAME?', '#NUM!', '#REF!', '#VALUE!', '#NULL!']) if (!errorNames.has(n)) err('error-name-missing', { id: n }, 'OpenFormula Table 4 error not declared');
  // Host properties (3.4).
  const hostNamed = new Set((spec.tables.host ?? []).map((r) => r.cells[0]));
  for (const h of HOST_PROPERTIES) if (!hostNamed.has(h)) err('host-property-missing', { id: h }, 'host-defined property of OpenFormula §3.4 not fixed');
  // Formula examples anywhere in the document (outside fenced code).
  let inFence = false;
  for (const [i, line] of spec.lines.entries()) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    for (const f of formulaExamples(line)) {
      const a = analyseFormula(f);
      if (a.unterminated) { err('formula-string', { line: i + 1 }, `unterminated string in ${f}`); continue; }
      for (const fn of a.functions) if (!supported.has(fn) && !excluded.has(fn)) err('formula-unknown-function', { id: fn, line: i + 1 }, `in ${f}: not in 8.2 or 8.3`);
      for (const r of a.references) if (!REFERENCE_RE.test(r) && !/^\[#REF!\]$/.test(r)) err('formula-reference-syntax', { line: i + 1 }, `${r} in ${f}`);
      if (a.commas > 0) err('formula-separator', { line: i + 1 }, `"," outside strings in ${f} (OpenFormula uses ";")`);
      for (const e of a.errors) if (!errorNames.has(e)) err('unknown-error-name', { id: e, line: i + 1 }, `in ${f}`);
    }
    for (const m of line.matchAll(/`(#[A-Z0-9]+(?:\/[A-Z0-9]+)?[!?])`/g)) if (!errorNames.has(m[1])) err('unknown-error-name', { id: m[1], line: i + 1 }, 'error name not declared in 7.1');
  }
  // Reference values (16).
  const computed = referenceValues();
  const seenRef = new Set();
  for (const row of spec.tables.reference ?? []) {
    const c = row.cells;
    if (c.length !== 3) { err('reference-row-format', { line: row.line }, `${c.length} columns`); continue; }
    const key = c[0], value = c[2].replace(/^`|`$/g, '');
    if (!(key in computed)) { err('reference-value-unknown', { id: key, line: row.line }, 'no computation for this key'); continue; }
    seenRef.add(key);
    if (computed[key] !== value) err('reference-value-mismatch', { id: key, line: row.line }, `document ${value}, computed ${computed[key]}`);
  }
  for (const key of Object.keys(computed)) if (!seenRef.has(key)) err('reference-value-missing', { id: key }, 'computed value not listed in the document');
  // Conformance table (17.1).
  const seen = new Map();
  for (const row of spec.tables.conformance ?? []) {
    const m = /^\| (HPF-[A-Z]+-\d{3}) \| (\S+) \| (\S+) \| ([^|]+) \| (.+) \|\s*$/.exec(row.text);
    if (!m) { err('table-row-format', { line: row.line }, row.text); continue; }
    const [, id, grade, level, subject] = m;
    const req = byId.get(id);
    if (!req) { err('table-unknown-id', { id, line: row.line }, 'row for a requirement that does not exist'); continue; }
    if (seen.has(id)) err('table-duplicate', { id, line: row.line }, 'listed twice');
    seen.set(id, row);
    if (grade !== req.grade || level !== req.level) err('table-mismatch', { id, line: row.line }, `table ${grade}/${level} vs heading ${req.grade}/${req.level}`);
    if (!/^[DEBLP](, [DEBLP])*$/.test(subject.trim())) err('table-subject', { id, line: row.line }, `subject "${subject.trim()}"`);
  }
  for (const req of spec.requirements) if (!seen.has(req.id)) err('table-missing-id', req, 'requirement not in conformance table');
  // Summary (17.2).
  const counts = {};
  for (const level of LEVELS) counts[level] = { Muss: 0, Soll: 0, Kann: 0, sum: 0 };
  counts.alle = { Muss: 0, Soll: 0, Kann: 0, sum: 0 };
  for (const req of spec.requirements) {
    if (!counts[req.level] || !(req.grade in counts.alle)) continue;
    counts[req.level][req.grade]++; counts[req.level].sum++; counts.alle[req.grade]++; counts.alle.sum++;
  }
  for (const key of [...LEVELS, 'alle']) {
    const row = spec.summary.get(key);
    if (!row) { err('summary-missing', undefined, key); continue; }
    for (const g of ['Muss', 'Soll', 'Kann', 'sum']) if (row[g] !== counts[key][g]) err('summary-mismatch', { line: row.line }, `${key} ${g}: table ${row[g]}, computed ${counts[key][g]}`);
  }
  // Sources used.
  for (const [i, line] of spec.lines.entries()) {
    if (/^- \[Q\d+[a-z]?\] /.test(line)) continue;
    for (const m of line.matchAll(/\[(Q\d+[a-z]?)\]/g)) {
      const s = spec.sources.get(m[1]);
      if (s) s.used++; else err('unknown-source', { line: i + 1 }, m[1]);
    }
  }
  for (const [id, s] of spec.sources) if (s.used === 0) warnings.push({ code: 'unused-source', id, line: s.line });
  // Machine-readable copy.
  const exported = JSON.stringify(exportFunctions(spec), null, 2) + '\n';
  if (jsonText === undefined) warnings.push({ code: 'functions-json-missing', id: '03-funktionen.json', line: 0 });
  else if (jsonText !== exported) err('functions-json-stale', { id: '03-funktionen.json' }, 'does not match the table in 8.2/8.3/7.1; regenerate with --export');

  const perArea = {};
  for (const area of AREAS) perArea[area] = spec.requirements.filter((r) => r.area === area).length;
  return { ok: errors.length === 0, errors, warnings, counts, perArea, requirements: spec.requirements.length, sources: spec.sources.size, functions: supported.size, excluded: excluded.size, errorNames: errorNames.size, referenceValues: seenRef.size, exported };
}

function main(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const exportIdx = args.indexOf('--export');
  const positional = args.filter((a, i) => !a.startsWith('--') && !(exportIdx >= 0 && i === exportIdx + 1));
  const path = positional[0] ?? DEFAULT_SPEC;
  let text, teil0Text, jsonText;
  try { text = readFileSync(path, 'utf8'); } catch (e) { console.error(`cannot read ${path}: ${e.message}`); return 2; }
  try { teil0Text = readFileSync(DEFAULT_TEIL0, 'utf8'); } catch { teil0Text = undefined; }
  if (existsSync(DEFAULT_JSON)) jsonText = readFileSync(DEFAULT_JSON, 'utf8');
  const result = checkSpec(text, { teil0Text, jsonText });
  if (exportIdx >= 0) {
    const out = args[exportIdx + 1] && !args[exportIdx + 1].startsWith('--') ? args[exportIdx + 1] : DEFAULT_JSON;
    writeFileSync(out, result.exported);
    console.log(`exported ${result.functions} functions, ${result.excluded} excluded, ${result.errorNames} error names to ${out}`);
    return 0;
  }
  const { exported, ...rest } = result;
  if (json) { console.log(JSON.stringify({ file: path, ...rest }, null, 2)); }
  else {
    console.log(`check-formeln: ${path}`);
    console.log(`requirements: ${result.requirements}, sources: ${result.sources}, functions: ${result.functions}, excluded: ${result.excluded}, error names: ${result.errorNames}, reference values: ${result.referenceValues}`);
    console.log('per area: ' + Object.entries(result.perArea).map(([a, n]) => `${a}=${n}`).join(' '));
    for (const key of [...LEVELS, 'alle']) { const c = result.counts[key]; console.log(`${key.padEnd(9)} Muss=${c.Muss} Soll=${c.Soll} Kann=${c.Kann} sum=${c.sum}`); }
    for (const e of result.errors) console.log(`ERROR ${e.code}${e.id ? ' ' + e.id : ''}${e.line ? ' (line ' + e.line + ')' : ''}${e.detail ? ': ' + e.detail : ''}${e.text ? ': ' + e.text : ''}`);
    for (const w of result.warnings) console.log(`WARN  ${w.code} ${w.id} (line ${w.line})`);
    console.log(result.ok ? `OK: 0 errors, ${result.warnings.length} warnings` : `FAILED: ${result.errors.length} errors, ${result.warnings.length} warnings`);
  }
  return result.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}
