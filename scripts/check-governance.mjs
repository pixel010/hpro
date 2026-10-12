#!/usr/bin/env node
/**
 * Mechanical check of Teil 2 of the hpro specification
 * (docs/spezifikation/02-lizenz-und-governance.md: Lizenz, Governance, Namensraum, Registry).
 *
 * Requirements `#### HPG-<AREA>-<NNN> · <Grad> · <Stufe>`: same structural rules as Teil 0/3
 * (heading, numbering, keyword, Prüfverfahren with "Erwartetes Ergebnis", Grundlage with [Qn] or
 * own convention, no vendor names, cross references to HPG-/HP- requirements and anchors).
 *
 * Whole document:
 *   - version-mismatch: all parts carry the same `**Status:** <status> <version>`
 *   - change-*: Änderungsverzeichnis (markers AENDERUNGEN) numbered HPC-0001…, valid type/class/status
 *   - contributors-*: Beitragendenverzeichnis with a Patentzusage state per row
 *   - ipr-register: every source organisation of Teil 0, 1, 3 appears in the Fremdrechte-Register
 *   - registry-*, kennung-pattern, reserved-kennung, extension-adopted-without-change:
 *     02-registry.json valid and in sync with the tables (RESERVIERT, REGISTRY-KOMPONENTEN,
 *     REGISTRY-ERWEITERUNGEN)
 *   - namespace-pattern: every `https://hpro.example…` URI in the parts, registry, examples
 *     and core follows the patterns of Abschnitt 5.1
 *   - example-findings: the invalid example container yields exactly the (rule, file) pairs of
 *     the table BEISPIEL-UNGUELTIG; the valid example yields 0 errors and 0 warnings
 *     (containers built in memory with scripts/s4-beispiele.mjs; needs kern/dist)
 *   - table-*, summary-*: conformance table and sums match the requirements
 *
 * Usage: node scripts/check-governance.mjs [path] [--json] [--skip-examples]
 * Exit 0 when no error, 1 otherwise, 2 on usage/IO problems.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { parseSpec as parseTeil0, slug } from './check-spec.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SPEC_DIR = resolve(ROOT, 'docs', 'spezifikation');
const DEFAULT_SPEC = resolve(SPEC_DIR, '02-lizenz-und-governance.md');
const DEFAULT_REGISTRY = resolve(SPEC_DIR, '02-registry.json');
const PARTS = ['00-spezifikation.md', '01-konformitaet.md', '02-lizenz-und-governance.md', '03-tabellen-und-formeln.md'];
const SOURCE_PARTS = ['00-spezifikation.md', '01-konformitaet.md', '03-tabellen-und-formeln.md'];

export const AREAS = ['LIC', 'GOV', 'VER', 'NS', 'EXT', 'REG'];
export const GRADES = ['Muss', 'Soll', 'Kann'];
export const LEVELS = ['Basis', 'Lebendig', 'Signiert', 'Archiv'];
export const CHANGE_TYPES = ['Änderung', 'Erratum', 'Registrierung', 'Rückzug'];
export const CHANGE_CLASSES = ['Erratum', 'Nebenversion', 'Hauptversion'];
export const CHANGE_STATUSES = ['eingereicht', 'in Frist', 'angenommen', 'abgelehnt', 'umgesetzt', 'zurückgezogen'];
export const CONTRIBUTOR_STATES = /^(abgegeben|ausstehend|nicht erforderlich\b.*)$/;
export const BASIS = 'https://hpro.example';
/** Patterns of Abschnitt 5.1 (relative to <basis>). */
export const NAMESPACE_PATTERNS = [
  /^$/, // the bare basis (as text)
  /^\/ns\/v\d+$/,
  /^\/ns\/$/, // prose: "<basis>/ns/" in Teil 0 explanations
  /^\/spec\/\d+\.\d+\/?$/,
  /^\/spec\/\d+\.\d+\/profile\/(static|interactive|signed|archive)$/,
  /^\/spec\/\d+\.\d+\/profile\/?$/, // prose: the profile base
  /^\/spec\/\d+\.\d+\/subset\/[a-z][a-z0-9-]*$/,
  /^\/ext\/[a-z][a-z0-9]{1,15}$/,
  /^\/registry\/\d+$/,
];

const HEADING = /^#### (HPG-([A-Z]+)-(\d{3})) · (\S+) · (\S+)\s*$/;
const KEYWORDS = {
  Muss: /\b(MUSS|MÜSSEN|DARF NICHT|DÜRFEN NICHT)\b/,
  Soll: /\b(SOLL|SOLLEN|SOLL NICHT|SOLLEN NICHT)\b/,
  Kann: /\b(KANN|KÖNNEN)\b/,
};
const VENDOR_WORDS = [
  'Adobe', 'Acrobat', 'Microsoft', 'Google', 'Apple', 'Mozilla', 'Chrome', 'Chromium', 'Firefox', 'Safari',
  'WebKit', 'Tauri', 'Electron', 'WeasyPrint', 'Docling', 'calibre', 'Thorium', 'Readium', 'epubcheck',
  'veraPDF', 'DSS', 'LibreOffice', 'Excel', 'Word', 'InDesign', 'Foxit', 'Paged.js', 'Vivliostyle', 'Prince',
];
const VENDOR_RE = new RegExp(`(^|[^\\p{L}\\p{N}])(${VENDOR_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'u');

function between(lines, marker) {
  const s = lines.findIndex((l) => l.includes(`${marker} ANFANG`));
  const e = lines.findIndex((l) => l.includes(`${marker} ENDE`));
  if (s < 0 || e < 0 || e <= s) return null;
  return { start: s, end: e, rows: lines.slice(s + 1, e).map((text, i) => ({ text, line: s + 2 + i })).filter((r) => /^\| /.test(r.text) && !/^\|\s*-+/.test(r.text) && !/^\| (Kennung|Regel|Prüfung|Name|Beitragender|Organisation) \|/.test(r.text)) };
}
function cells(text) {
  return text.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
}

export function parseSpec(text) {
  const lines = text.split('\n');
  const problems = [];
  const requirements = [];
  const headingLines = [];
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    if (/^#{1,4} /.test(line)) headingLines.push(i);
    if (!line.startsWith('#### ')) continue;
    const m = HEADING.exec(line);
    if (!m) { if (/^#### HPG-/.test(line)) problems.push({ code: 'heading-format', line: i + 1, text: line }); continue; }
    requirements.push({ id: m[1], area: m[2], number: +m[3], grade: m[4], level: m[5], line: i + 1, start: i });
  }
  for (const [idx, req] of requirements.entries()) {
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
    req.index = idx;
  }
  const sources = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = /^- \[(Q\d+[a-z]?)\] (.+)$/.exec(lines[i]);
    if (m) sources.set(m[1], { line: i + 1, text: m[2], used: 0 });
  }
  const table = between(lines, 'KONFORMITAETSTABELLE');
  const tableRows = [];
  if (table) {
    for (const r of table.rows) {
      const m = /^\| (HPG-[A-Z]+-\d{3}) \| (\S+) \| (\S+) \| ([^|]+) \| (.+) \|\s*$/.exec(r.text);
      if (m) tableRows.push({ id: m[1], grade: m[2], level: m[3], subject: m[4].trim(), title: m[5].trim(), line: r.line });
      else problems.push({ code: 'table-row-format', line: r.line, text: r.text });
    }
  } else problems.push({ code: 'table-missing', line: 0, text: 'conformance table markers not found' });
  const summary = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = /^\| \*{0,2}(Basis|Lebendig|Signiert|Archiv|alle)\*{0,2} \| \*{0,2}(\d+)\*{0,2} \| \*{0,2}(\d+)\*{0,2} \| \*{0,2}(\d+)\*{0,2} \| \*{0,2}(\d+)\*{0,2} \|\s*$/.exec(lines[i]);
    if (m) summary.set(m[1], { Muss: +m[2], Soll: +m[3], Kann: +m[4], sum: +m[5], line: i + 1 });
  }
  const status = /^\*\*Status:\*\* (\S+) (\d+\.\d+)/m.exec(text);
  return { lines, requirements, sources, tableRows, summary, problems, status: status ? { status: status[1], version: status[2] } : null };
}

function walkFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

/**
 * @param {string} text  Teil 2
 * @param {object} opts  { registryText, partsTexts: Map<name,text>, teil0Text, extraFiles: Map<path,text>, examples: {gueltig, ungueltig} | null }
 */
export function checkSpec(text, opts = {}) {
  const spec = parseSpec(text);
  const errors = [...spec.problems];
  const warnings = [];
  const err = (code, req, detail) => errors.push({ code, id: req?.id, line: req?.line, detail });
  const warn = (code, req, detail) => warnings.push({ code, id: req?.id, line: req?.line, detail });
  const byId = new Map();
  // The text under check replaces the on-disk copy of Teil 2 in all cross-part checks.
  if (opts.partsTexts) { opts = { ...opts, partsTexts: new Map(opts.partsTexts) }; opts.partsTexts.set('02-lizenz-und-governance.md', text); }
  const teil0 = opts.teil0Text ? parseTeil0(opts.teil0Text) : null;
  const teil0ById = new Map((teil0?.requirements ?? []).map((r) => [r.id, r]));

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
        else spec.sources.get(r).used++;
      }
      const ownOrTeil = /eigene (Konvention|Festlegung|Einschränkung|Verschärfung|Ergänzung|Teilmenge)|\[HP-[A-Z]+-\d{3}\]|\[HPG-[A-Z]+-\d{3}\]|\[HPR-[A-Z]+-\d{3}\]/.test(req.basis);
      if (refs.length === 0 && !ownOrTeil) err('basis-without-source', req, 'Grundlage cites no [Qn], no requirement of another part and is not declared as own convention');
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
  // Cross references and anchors (HPG within this part, HP in Teil 0).
  for (const [i, line] of spec.lines.entries()) {
    for (const m of line.matchAll(/\bHPG-([A-Z]+)-(\d{3})\b/g)) {
      if (!byId.has(m[0]) && AREAS.includes(m[1])) err('dangling-reference', { id: m[0], line: i + 1 }, 'referenced requirement does not exist');
    }
    for (const m of line.matchAll(/\(#(hpg-[a-z]+-\d{3})--([a-z]+)--([a-z]+)\)/g)) {
      const req = byId.get(m[1].toUpperCase());
      if (!req) err('dangling-anchor', { id: m[1], line: i + 1 }, 'anchor target does not exist');
      else if (slug(req.id, req.grade, req.level).replace(/^hp-/, 'hpg-') !== `${m[1]}--${m[2]}--${m[3]}`) err('stale-anchor', { id: req.id, line: i + 1 }, `anchor says ${m[2]}/${m[3]}, heading says ${req.grade}/${req.level}`);
    }
    if (teil0) {
      for (const m of line.matchAll(/\bHP-([A-Z]+)-(\d{3})\b/g)) {
        if (!teil0ById.has(m[0])) err('dangling-teil0-reference', { id: m[0], line: i + 1 }, 'referenced Teil-0 requirement does not exist');
      }
      for (const m of line.matchAll(/\(00-spezifikation\.md#(hp-[a-z]+-\d{3})--([a-z]+)--([a-z]+)\)/g)) {
        const req = teil0ById.get(m[1].toUpperCase());
        if (!req) err('dangling-teil0-anchor', { id: m[1], line: i + 1 }, 'Teil-0 anchor target does not exist');
        else if (slug(req.id, req.grade, req.level) !== `${m[1]}--${m[2]}--${m[3]}`) err('stale-teil0-anchor', { id: req.id, line: i + 1 }, `anchor says ${m[2]}/${m[3]}, Teil 0 says ${req.grade}/${req.level}`);
      }
    }
  }
  // Sources used anywhere in the text count as used.
  for (const [q, s] of spec.sources) {
    const uses = (text.match(new RegExp(`\\[${q}\\]`, 'g')) ?? []).length - 1;
    if (uses <= 0) warn('unused-source', { id: q, line: s.line }, 'source is never cited');
  }
  // Conformance table and summary.
  const seen = new Map();
  for (const row of spec.tableRows) {
    if (seen.has(row.id)) err('table-duplicate', { id: row.id, line: row.line }, 'listed twice');
    seen.set(row.id, row);
    const req = byId.get(row.id);
    if (!req) err('table-unknown-id', { id: row.id, line: row.line }, 'table lists a requirement that does not exist');
    else if (req.grade !== row.grade || req.level !== row.level) err('table-mismatch', { id: row.id, line: row.line }, `table ${row.grade}/${row.level}, heading ${req.grade}/${req.level}`);
  }
  for (const req of spec.requirements) if (!seen.has(req.id)) err('table-missing-id', req, 'requirement missing from conformance table');
  const counts = {};
  for (const l of LEVELS) counts[l] = { Muss: 0, Soll: 0, Kann: 0, sum: 0 };
  counts.alle = { Muss: 0, Soll: 0, Kann: 0, sum: 0 };
  for (const req of spec.requirements) {
    if (!counts[req.level] || !GRADES.includes(req.grade)) continue;
    counts[req.level][req.grade]++; counts[req.level].sum++; counts.alle[req.grade]++; counts.alle.sum++;
  }
  for (const key of [...LEVELS, 'alle']) {
    const got = spec.summary.get(key);
    if (!got) { err('summary-missing', undefined, key); continue; }
    for (const g of ['Muss', 'Soll', 'Kann', 'sum']) if (got[g] !== counts[key][g]) err('summary-mismatch', { id: key, line: got.line }, `${g}: table ${got[g]}, counted ${counts[key][g]}`);
  }
  // Version/status across parts.
  if (opts.partsTexts) {
    const statuses = [];
    for (const [name, t] of opts.partsTexts) {
      const m = /^\*\*Status:\*\* (\S+) (\d+\.\d+)/m.exec(t);
      statuses.push({ name, status: m?.[1], version: m?.[2] });
    }
    const ref = statuses[0];
    for (const s of statuses) if (!s.status || s.status !== ref.status || s.version !== ref.version) err('version-mismatch', { id: s.name }, `${s.status} ${s.version} differs from ${ref.name}: ${ref.status} ${ref.version}`);
  }
  // Änderungsverzeichnis.
  const changes = between(spec.lines, 'AENDERUNGEN');
  const changeIds = new Set();
  if (!changes) err('change-table-missing', undefined, 'markers AENDERUNGEN not found');
  else {
    changes.rows.forEach((r, i) => {
      const c = cells(r.text);
      const [id, date, type, , , cls, status] = c;
      if (c.length !== 7) { err('change-row-format', { line: r.line }, r.text); return; }
      if (id !== `HPC-${String(i + 1).padStart(4, '0')}`) err('change-numbering', { id, line: r.line }, `expected HPC-${String(i + 1).padStart(4, '0')}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) err('change-date', { id, line: r.line }, date);
      if (!CHANGE_TYPES.includes(type)) err('change-type', { id, line: r.line }, type);
      if (!CHANGE_CLASSES.includes(cls)) err('change-class', { id, line: r.line }, cls);
      if (!CHANGE_STATUSES.includes(status)) err('change-status', { id, line: r.line }, status);
      changeIds.add(id);
      const file = resolve(SPEC_DIR, 'aenderungen', `${id}.md`);
      if (opts.changeFiles ? !opts.changeFiles.has(id) : !existsSync(file)) err('change-file-missing', { id, line: r.line }, `aenderungen/${id}.md`);
    });
  }
  // Beitragendenverzeichnis.
  const contributors = between(spec.lines, 'BEITRAGENDE');
  if (!contributors) err('contributors-missing', undefined, 'markers BEITRAGENDE not found');
  else for (const r of contributors.rows) {
    const c = cells(r.text);
    if (c.length !== 5) err('contributors-row-format', { line: r.line }, r.text);
    else if (!CONTRIBUTOR_STATES.test(c[4])) err('contributors-state', { line: r.line }, c[4]);
  }
  // Fremdrechte-Register vs. source organisations of Teil 0, 1, 3.
  const register = between(spec.lines, 'FREMDRECHTE');
  if (!register) err('ipr-register-missing', undefined, 'markers FREMDRECHTE not found');
  else if (opts.partsTexts) {
    const orgCells = register.rows.map((r) => cells(r.text)[0].toLowerCase());
    const orgText = orgCells.join(' | ');
    for (const [name, t] of opts.partsTexts) {
      if (!SOURCE_PARTS.includes(name)) continue;
      for (const [i, line] of t.split('\n').entries()) {
        const m = /^- \[(Q\d+[a-z]?)\] ([^,]+),/.exec(line);
        if (!m) continue;
        let org = m[2].trim();
        if (org === 'hpro') continue;
        if (org.startsWith('*')) org = org.replace(/^\*/, '').split(':')[0]; // title instead of organisation
        const key = org.split(/[\s(]/)[0].toLowerCase();
        if (!orgText.includes(key)) err('ipr-register', { id: `${name} ${m[1]}`, line: i + 1 }, `organisation "${org}" not in Fremdrechte-Register`);
      }
    }
  }
  // Registry JSON and tables.
  let registry = null;
  if (opts.registryText !== undefined) {
    try { registry = JSON.parse(opts.registryText); } catch (e) { err('registry-json', undefined, e.message); }
  }
  if (registry) {
    const kennungRe = new RegExp(registry.kennungPattern ?? '^[a-z][a-z0-9]{1,15}$');
    const reserved = new Set((registry.reserved ?? []).map((r) => r.kennung));
    const extStatuses = registry.statuses?.extensions ?? [];
    const compStatuses = registry.statuses?.components ?? [];
    const seenK = new Set();
    for (const e of registry.extensions ?? []) {
      for (const f of ['kennung', 'id', 'owner', 'contact', 'url', 'status', 'registered']) if (!e[f]) err('registry-field', { id: e.kennung }, `extension entry lacks ${f}`);
      if (e.kennung && !kennungRe.test(e.kennung)) err('kennung-pattern', { id: e.kennung }, `does not match ${kennungRe.source}`);
      if (seenK.has(e.kennung)) err('registry-duplicate', { id: e.kennung }, 'kennung listed twice');
      seenK.add(e.kennung);
      if (!extStatuses.includes(e.status)) err('registry-status', { id: e.kennung }, e.status);
      if (reserved.has(e.kennung) && e.status !== 'beispiel') err('reserved-kennung', { id: e.kennung }, 'reserved kennung registered to a third party');
      if (e.status === 'aufgenommen' && !/^HPC-\d{4}$/.test(e.change ?? '')) err('extension-adopted-without-change', { id: e.kennung }, 'status aufgenommen needs `change: HPC-NNNN`');
      if (e.id && !/^(https:\/\/|urn:uuid:)/.test(e.id)) err('registry-uri', { id: e.kennung }, `id ${e.id}`);
      if (e.id && e.id.startsWith(BASIS) && e.id !== `${BASIS}/ext/${e.kennung}`) err('registry-uri', { id: e.kennung }, `id under <basis> must be ${BASIS}/ext/${e.kennung}`);
    }
    for (const r of registry.reserved ?? []) if (!r.kennung || !r.reason) err('registry-field', { id: r.kennung }, 'reserved entry lacks kennung or reason');
    const seenC = new Set();
    for (const c of registry.components ?? []) {
      for (const f of ['name', 'status', 'since', 'spec']) if (!c[f]) err('registry-field', { id: c.name }, `component entry lacks ${f}`);
      if (!Array.isArray(c.releases)) err('registry-field', { id: c.name }, 'component entry lacks releases[]');
      else for (const rel of c.releases) for (const f of ['version', 'integrity', 'url']) if (!rel[f]) err('registry-field', { id: c.name }, `release lacks ${f}`);
      if (c.name && !/^hp-[a-z0-9-]+$/.test(c.name)) err('registry-component-name', { id: c.name }, 'component name must be hp-…');
      if (seenC.has(c.name)) err('registry-duplicate', { id: c.name }, 'component listed twice');
      seenC.add(c.name);
      if (!compStatuses.includes(c.status)) err('registry-status', { id: c.name }, c.status);
    }
    // Tables in sync.
    const syncTable = (marker, expected, keyName) => {
      const t = between(spec.lines, marker);
      if (!t) { err('registry-table-missing', undefined, marker); return; }
      const rows = new Map(t.rows.map((r) => { const c = cells(r.text); return [c[0], { cells: c, line: r.line }]; }));
      for (const [key, exp] of expected) {
        const row = rows.get(key);
        if (!row) { err('registry-table-missing-row', { id: key }, `${marker}: ${keyName} ${key} missing in table`); continue; }
        for (const [col, value] of Object.entries(exp)) if (row.cells[col] !== value) err('registry-table-mismatch', { id: key, line: row.line }, `${marker} column ${col}: table "${row.cells[col]}", json "${value}"`);
      }
      for (const key of rows.keys()) if (!expected.has(key)) err('registry-table-extra-row', { id: key }, `${marker}: ${keyName} ${key} not in 02-registry.json`);
    };
    syncTable('RESERVIERT', new Map((registry.reserved ?? []).map((r) => [r.kennung, { 1: r.reason }])), 'kennung');
    syncTable('REGISTRY-KOMPONENTEN', new Map((registry.components ?? []).map((c) => [c.name, { 1: c.status, 2: c.since, 3: c.spec, 4: c.package ?? '–' }])), 'component');
    syncTable('REGISTRY-ERWEITERUNGEN', new Map((registry.extensions ?? []).map((e) => [e.kennung, { 1: e.id, 2: e.owner, 3: e.status, 4: e.registered }])), 'kennung');
  }
  // Namespace patterns across parts, registry, examples, core.
  const scan = new Map();
  if (opts.partsTexts) for (const [n, t] of opts.partsTexts) scan.set(n, t);
  if (opts.registryText) scan.set('02-registry.json', opts.registryText);
  if (opts.extraFiles) for (const [n, t] of opts.extraFiles) scan.set(n, t);
  for (const [name, t] of scan) {
    for (const [i, line] of t.split('\n').entries()) {
      for (const m of line.matchAll(/https:\/\/hpro\.example([^\s)`"'|,;>]*)/g)) {
        const rest = m[1].replace(/[.:]+$/, '');
        if (/[<{]/.test(rest)) continue; // documentation placeholders like <major> or {static|…}
        if (!NAMESPACE_PATTERNS.some((p) => p.test(rest))) err('namespace-pattern', { id: name, line: i + 1 }, `${BASIS}${rest}`);
      }
    }
  }
  // Example containers.
  if (opts.examples) {
    const { gueltig, ungueltig } = opts.examples;
    const bad = gueltig.findings.filter((f) => f.class === 'ERROR' || f.class === 'FATAL' || f.class === 'WARNING');
    if (bad.length) err('example-findings', { id: 'gueltig' }, `valid example has ${bad.length} error/warning finding(s): ${bad.map((f) => `${f.rule}@${f.location}`).join(', ')}`);
    const t = between(spec.lines, 'BEISPIEL-UNGUELTIG');
    if (!t) err('example-table-missing', undefined, 'markers BEISPIEL-UNGUELTIG not found');
    else {
      const expected = new Set(t.rows.map((r) => { const c = cells(r.text); return `${c[0]}@${c[1].split(':')[0]}`; }));
      const actual = new Set(ungueltig.findings.filter((f) => f.class === 'ERROR' || f.class === 'FATAL').map((f) => `${f.rule}@${f.location.split(':')[0]}`));
      for (const e of expected) if (!actual.has(e)) err('example-findings', { id: 'ungueltig' }, `table expects ${e}, checker did not report it`);
      for (const a of actual) if (!expected.has(a)) err('example-findings', { id: 'ungueltig' }, `checker reports ${a}, not in table`);
      if (ungueltig.findings.every((f) => f.class !== 'ERROR')) err('example-findings', { id: 'ungueltig' }, 'invalid example has no error');
    }
  }
  return { ok: errors.length === 0, errors, warnings, requirements: spec.requirements, counts };
}

export async function loadExamples() {
  const { buildAll } = await import('./s4-beispiele.mjs');
  const { checkExtensions, loadRegistry } = await import('./check-erweiterung.mjs');
  const { readContainer } = await import(resolve(ROOT, 'kern', 'dist', 'index.js'));
  const built = await buildAll();
  const registry = loadRegistry();
  const out = {};
  for (const [key, b] of Object.entries(built)) {
    const c = await readContainer(b.bytes);
    out[key] = { ...checkExtensions({ files: c.files, manifest: c.manifest }, registry), sha256: b.sha256, bytes: b.bytes.length };
  }
  return out;
}

export function loadOptions({ skipExamples = false } = {}) {
  const partsTexts = new Map(PARTS.filter((p) => existsSync(resolve(SPEC_DIR, p))).map((p) => [p, readFileSync(resolve(SPEC_DIR, p), 'utf8')]));
  const extraFiles = new Map();
  for (const f of [...walkFiles(resolve(SPEC_DIR, 'beispiele')), ...walkFiles(resolve(ROOT, 'kern', 'src'))]) {
    if (/\.(xhtml|css|json|ts|md)$/.test(f)) extraFiles.set(f.slice(ROOT.length + 1), readFileSync(f, 'utf8'));
  }
  return {
    registryText: existsSync(DEFAULT_REGISTRY) ? readFileSync(DEFAULT_REGISTRY, 'utf8') : undefined,
    partsTexts,
    teil0Text: partsTexts.get('00-spezifikation.md'),
    extraFiles,
    skipExamples,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const skipExamples = args.includes('--skip-examples');
  const path = args.find((a) => !a.startsWith('--')) ?? DEFAULT_SPEC;
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (e) { console.error(`cannot read ${path}: ${e.message}`); process.exit(2); }
  const opts = loadOptions({ skipExamples });
  if (!skipExamples) {
    try { opts.examples = await loadExamples(); } catch (e) { console.error(`cannot build/check example containers (needs kern/dist, npm run build -w kern): ${e.message}`); process.exit(2); }
  }
  const result = checkSpec(text, opts);
  const byArea = {};
  for (const r of result.requirements) byArea[r.area] = (byArea[r.area] ?? 0) + 1;
  if (json) {
    console.log(JSON.stringify({ file: path, ok: result.ok, requirements: result.requirements.length, byArea, counts: result.counts, examples: opts.examples ? Object.fromEntries(Object.entries(opts.examples).map(([k, v]) => [k, { sha256: v.sha256, bytes: v.bytes, findings: v.findings }])) : null, errors: result.errors, warnings: result.warnings }, null, 2));
  } else {
    console.log(`${path}`);
    console.log(`requirements: ${result.requirements.length} (${Object.entries(byArea).map(([a, n]) => `${a} ${n}`).join(', ')})`);
    console.log(`grades: ${GRADES.map((g) => `${g} ${result.counts.alle[g]}`).join(', ')}; levels: ${LEVELS.map((l) => `${l} ${result.counts[l].sum}`).join(', ')}`);
    if (opts.examples) for (const [k, v] of Object.entries(opts.examples)) console.log(`example ${k}: ${v.bytes} bytes sha256=${v.sha256} findings=${v.findings.length} (${v.findings.filter((f) => f.class === 'ERROR').length} error)`);
    for (const e of result.errors) console.log(`ERROR ${e.code}${e.id ? ` ${e.id}` : ''}${e.line ? ` (line ${e.line})` : ''}: ${e.detail ?? e.text ?? ''}`);
    for (const w of result.warnings) console.log(`WARN  ${w.code}${w.id ? ` ${w.id}` : ''}${w.line ? ` (line ${w.line})` : ''}: ${w.detail ?? ''}`);
    console.log(result.ok ? `OK: 0 errors, ${result.warnings.length} warnings` : `FAILED: ${result.errors.length} errors, ${result.warnings.length} warnings`);
  }
  process.exit(result.ok ? 0 : 1);
}
