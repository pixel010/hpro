#!/usr/bin/env node
/**
 * Mechanical check of the html-Pro conformance rule catalogue
 * (docs/spezifikation/01-konformitaet.md, part 1) against the core specification (part 0).
 *
 * For every rule block
 *   `#### HPR-<AREA>-<NNN> · <Fatal|Fehler|Warnung|Hinweis> · <Basis|Lebendig|Signiert|Archiv>`
 *   (document rules) and `#### HPL-…` (reading-system rules) it verifies
 *   - heading format, known area, class and level; ids unique; numbering contiguous per area
 *   - required fields present (document: Bezug, Geltung, Mittel, Prüfung, Ort, Meldung;
 *     reader: Bezug, Testfall, Erwartung); Begründung mandatory in area SBX
 *   - every `HP-…` in Bezug exists in part 0, has the same level as the rule, and the rule class
 *     matches the requirement grade (Muss→Fatal/Fehler, Soll→Warnung, Kann→Hinweis) unless an
 *     explicit `*Einstufung:*` (Teilsatz | Nutzung | Unbestimmt | Information) justifies it
 *   - Geltung, Mittel, location kind and message placeholders come from the vocabularies of the
 *     document (section 4)
 *   - every HPR-/HPL-/HP- reference anywhere in the document resolves
 * and for the whole document
 *   - coverage: every Muss requirement of part 0 with subject D has a document rule; every Muss
 *     requirement with subject L in area SBX has a reader rule
 *   - the coverage table (10.2), the summary tables (11.1–11.3) and the exported JSON catalogue
 *     (01-regelkatalog.json) match the computed values
 *   - sources `[Qn]` resolve; the report schema file exists and parses
 *
 * Usage: node scripts/check-konformitaet.mjs [path] [--spec path] [--json] [--table]
 *        node scripts/check-konformitaet.mjs --export [path-of-json]
 * Exit code 0 when no error was found, 1 otherwise, 2 on usage/IO problems.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';
import { parseSpec, AREAS as SPEC_AREAS, LEVELS } from './check-spec.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
export const DEFAULT_DOC = resolve(ROOT, 'docs', 'spezifikation', '01-konformitaet.md');
export const DEFAULT_SPEC = resolve(ROOT, 'docs', 'spezifikation', '00-spezifikation.md');
export const DEFAULT_JSON = resolve(ROOT, 'docs', 'spezifikation', '01-regelkatalog.json');
export const DEFAULT_SCHEMA = resolve(ROOT, 'docs', 'spezifikation', 'schema', 'konformitaetsbericht.schema.json');

export const CLASSES = ['Fatal', 'Fehler', 'Warnung', 'Hinweis'];
export const CLASS_CODES = { Fatal: 'FATAL', Fehler: 'ERROR', Warnung: 'WARNING', Hinweis: 'INFO' };
export const CLASS_GRADE = { Fatal: 'Muss', Fehler: 'Muss', Warnung: 'Soll', Hinweis: 'Kann' };
export const SCOPES = ['Container', 'Fassung', 'Hauptfassung'];
export const MEANS = ['statisch', 'rendering', 'extern', 'signatur', 'manuell'];
export const LOCATION_KINDS = ['container', 'entry', 'manifest', 'xml', 'css', 'signature', 'rendition', 'external'];
export const CLASSIFICATIONS = ['Teilsatz', 'Nutzung', 'Unbestimmt', 'Information'];
const READER_AREAS = [...SPEC_AREAS];
const DOC_FIELDS = ['Bezug', 'Geltung', 'Mittel', 'Prüfung', 'Ort', 'Meldung'];
const READER_FIELDS = ['Bezug', 'Testfall', 'Erwartung'];
const HEADING = /^#### ((HPR|HPL)-([A-Z]+)-(\d{3})) · (\S+) · (\S+)\s*$/;

/** Parses part 1 into rules, tables and sources. */
export function parseCatalog(text) {
  const lines = text.split(/\r?\n/);
  const rules = [];
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
      if (/^#### HP[RL]-/.test(line)) problems.push({ code: 'heading-format', line: i + 1, text: line });
      continue;
    }
    rules.push({ id: m[1], catalog: m[2] === 'HPR' ? 'document' : 'reader', prefix: m[2], area: m[3], number: Number(m[4]), class: m[5], level: m[6], line: i + 1, start: i, fields: {}, title: '' });
  }
  for (const rule of rules) {
    const next = headingLines.find((n) => n > rule.start) ?? lines.length;
    const body = lines.slice(rule.start + 1, next);
    let current = null;
    for (const raw of body) {
      const line = raw.trimEnd();
      if (!line.trim()) { current = null; continue; }
      const f = /^\*([^*:]+):\*\s*(.*)$/.exec(line);
      if (f) { current = f[1]; rule.fields[current] = (rule.fields[current] ? rule.fields[current] + '\n' : '') + f[2].trim(); continue; }
      if (current) { rule.fields[current] += ' ' + line.trim(); continue; }
      if (!rule.title && !line.startsWith('<!--') && !line.startsWith('|')) rule.title = line.trim();
    }
  }
  const sources = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = /^- \[(Q\d+[a-z]?)\] (.+)$/.exec(lines[i]);
    if (m) sources.set(m[1], { line: i + 1, text: m[2], used: 0 });
  }
  const between = (startMarker, endMarker) => {
    const s = lines.findIndex((l) => l.includes(startMarker));
    const e = lines.findIndex((l) => l.includes(endMarker));
    if (s < 0 || e < s) return null;
    return { start: s, end: e, rows: lines.slice(s + 1, e) };
  };
  const placeholders = new Set();
  const ph = between('PLATZHALTER ANFANG', 'PLATZHALTER ENDE');
  if (ph) for (const row of ph.rows) { const m = /^\| `\{([a-z]+)\}` \|/.exec(row); if (m) placeholders.add(m[1]); }
  const coverage = between('ABDECKUNGSTABELLE ANFANG', 'ABDECKUNGSTABELLE ENDE');
  const summaryDoc = between('SUMMENTABELLE-HPR ANFANG', 'SUMMENTABELLE-HPR ENDE');
  const summaryReader = between('SUMMENTABELLE-HPL ANFANG', 'SUMMENTABELLE-HPL ENDE');
  const means = between('MITTELTABELLE ANFANG', 'MITTELTABELLE ENDE');
  return { lines, rules, sources, placeholders, coverage, summaryDoc, summaryReader, means, problems };
}

function splitRefs(value) {
  return (value ?? '').split(/[,;]\s*/).map((s) => s.trim()).filter((s) => /^HP-[A-Z]+-\d{3}$/.test(s));
}

function ruleToJson(rule) {
  const f = rule.fields;
  const base = {
    id: rule.id,
    catalog: rule.catalog,
    area: rule.area,
    number: rule.number,
    class: rule.class,
    classCode: CLASS_CODES[rule.class] ?? null,
    level: rule.level,
    title: rule.title,
    requirements: splitRefs(f.Bezug),
  };
  if (rule.catalog === 'document') {
    return {
      ...base,
      scope: f.Geltung ?? null,
      means: f.Mittel ?? null,
      check: f['Prüfung'] ?? null,
      location: f.Ort ?? null,
      locationKind: locationKinds(f.Ort ?? '')[0] ?? null,
      message: f.Meldung ?? null,
      placeholders: [...(f.Meldung ?? '').matchAll(/\{([a-z]+)\}/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i),
      classification: f.Einstufung ? f.Einstufung.split(/\s*\(/)[0].trim() : null,
      rationale: f['Begründung'] ?? null,
    };
  }
  return { ...base, testCase: f.Testfall ?? null, expectation: f.Erwartung ?? null, classification: f.Einstufung ? f.Einstufung.split(/\s*\(/)[0].trim() : null, rationale: f['Begründung'] ?? null };
}

function locationKinds(ort) {
  return [...ort.matchAll(/`([a-z]+)`/g)].map((m) => m[1]).filter((k) => LOCATION_KINDS.includes(k));
}

/** Builds the machine-readable catalogue (deterministic, no timestamps). */
export function buildCatalog(cat, specPath) {
  return {
    spec: 'https://html-pro.example/spec/0.1',
    part: '1',
    version: '0.1',
    source: relative(ROOT, specPath ?? DEFAULT_DOC).split('\\').join('/'),
    classes: CLASSES.map((c) => ({ name: c, code: CLASS_CODES[c], grade: CLASS_GRADE[c] })),
    levels: LEVELS.map((l) => ({ name: l, includes: l === 'Archiv' ? ['Basis', 'Signiert'] : l === 'Basis' ? [] : ['Basis'] })),
    scopes: SCOPES,
    means: MEANS,
    locationKinds: LOCATION_KINDS,
    placeholders: [...cat.placeholders],
    rules: cat.rules.filter((r) => r.catalog === 'document').map(ruleToJson),
    readerRules: cat.rules.filter((r) => r.catalog === 'reader').map(ruleToJson),
  };
}

function coverageRows(spec, cat) {
  const byReq = new Map();
  for (const req of spec.requirements) byReq.set(req.id, { doc: [], reader: [] });
  for (const rule of cat.rules) for (const ref of splitRefs(rule.fields.Bezug)) {
    const e = byReq.get(ref);
    if (e) e[rule.catalog === 'document' ? 'doc' : 'reader'].push(rule.id);
  }
  const subjects = new Map(spec.tableRows.map((r) => [r.id, r.subject]));
  return spec.requirements.map((req) => {
    const e = byReq.get(req.id);
    return { id: req.id, grade: req.grade, level: req.level, subject: subjects.get(req.id) ?? '?', doc: e.doc, reader: e.reader };
  });
}

function formatCoverage(rows) {
  const out = ['| Anforderung | Grad | Stufe | Subjekt | Dokumentregeln | Lesesystemregeln |', '|---|---|---|---|---|---|'];
  for (const r of rows) out.push(`| ${r.id} | ${r.grade} | ${r.level} | ${r.subject} | ${r.doc.join(', ') || '–'} | ${r.reader.join(', ') || '–'} |`);
  return out;
}

function countsFor(rules) {
  const counts = {};
  for (const level of [...LEVELS, 'alle']) counts[level] = { Fatal: 0, Fehler: 0, Warnung: 0, Hinweis: 0, sum: 0 };
  for (const r of rules) {
    if (!counts[r.level] || !(r.class in counts.alle)) continue;
    counts[r.level][r.class]++; counts[r.level].sum++;
    counts.alle[r.class]++; counts.alle.sum++;
  }
  return counts;
}

function formatSummary(counts) {
  const out = ['| Stufe | Fatal | Fehler | Warnung | Hinweis | Summe |', '|---|---|---|---|---|---|'];
  for (const level of LEVELS) { const c = counts[level]; out.push(`| ${level} | ${c.Fatal} | ${c.Fehler} | ${c.Warnung} | ${c.Hinweis} | ${c.sum} |`); }
  const a = counts.alle;
  out.push(`| **alle** | **${a.Fatal}** | **${a.Fehler}** | **${a.Warnung}** | **${a.Hinweis}** | **${a.sum}** |`);
  return out;
}

function meansCounts(rules) {
  const counts = {};
  for (const m of MEANS) counts[m] = 0;
  for (const r of rules) if (r.fields.Mittel in counts) counts[r.fields.Mittel]++;
  return counts;
}

function formatMeans(counts) {
  const out = ['| Mittel | Regeln |', '|---|---|'];
  for (const m of MEANS) out.push(`| ${m} | ${counts[m]} |`);
  return out;
}

function parseSummary(rows) {
  const map = new Map();
  for (const row of rows) {
    const m = /^\| \*{0,2}(Basis|Lebendig|Signiert|Archiv|alle)\*{0,2} \| \*{0,2}(\d+)\*{0,2} \| \*{0,2}(\d+)\*{0,2} \| \*{0,2}(\d+)\*{0,2} \| \*{0,2}(\d+)\*{0,2} \| \*{0,2}(\d+)\*{0,2} \|\s*$/.exec(row);
    if (m) map.set(m[1], { Fatal: +m[2], Fehler: +m[3], Warnung: +m[4], Hinweis: +m[5], sum: +m[6] });
  }
  return map;
}

export function checkCatalog(text, specText, options = {}) {
  const cat = parseCatalog(text);
  const spec = parseSpec(specText);
  const errors = [...cat.problems];
  const warnings = [];
  const err = (code, where, detail) => errors.push({ code, id: where?.id, line: where?.line, detail });
  const reqById = new Map(spec.requirements.map((r) => [r.id, r]));
  const subjects = new Map(spec.tableRows.map((r) => [r.id, r.subject]));
  const byId = new Map();

  for (const rule of cat.rules) {
    const areas = rule.catalog === 'document' ? SPEC_AREAS : READER_AREAS;
    if (!areas.includes(rule.area)) err('unknown-area', rule, rule.area);
    if (!CLASSES.includes(rule.class)) err('unknown-class', rule, rule.class);
    if (!LEVELS.includes(rule.level)) err('unknown-level', rule, rule.level);
    if (byId.has(rule.id)) err('duplicate-id', rule, `also at line ${byId.get(rule.id).line}`);
    byId.set(rule.id, rule);
    if (!rule.title) err('missing-title', rule, 'no title line after heading');
    const required = rule.catalog === 'document' ? DOC_FIELDS : READER_FIELDS;
    for (const field of required) if (!rule.fields[field] || rule.fields[field].length < 3) err('missing-field', rule, field);
    if (rule.area === 'SBX' && !(rule.fields['Begründung']?.length > 20)) err('missing-begruendung', rule, 'security rules must state the threat they avert');
    const refs = splitRefs(rule.fields.Bezug);
    if (rule.fields.Bezug && refs.length === 0) err('missing-field', rule, 'Bezug names no HP-… requirement');
    let gradeMismatch = false;
    for (const ref of refs) {
      const req = reqById.get(ref);
      if (!req) { err('unknown-requirement', rule, ref); continue; }
      if (req.level !== rule.level) err('level-mismatch', rule, `${ref} is ${req.level}, rule is ${rule.level}`);
      if (CLASS_GRADE[rule.class] && req.grade !== CLASS_GRADE[rule.class]) gradeMismatch = true;
    }
    const einstufung = rule.fields.Einstufung ? rule.fields.Einstufung.split(/\s*\(/)[0].trim() : null;
    if (einstufung && !CLASSIFICATIONS.includes(einstufung)) err('einstufung-invalid', rule, `"${einstufung}" not in ${CLASSIFICATIONS.join('|')}`);
    if (gradeMismatch && !einstufung) err('class-grade-mismatch', rule, `class ${rule.class} does not match the grade of ${refs.join(', ')} and no *Einstufung:* given`);
    if (einstufung === 'Unbestimmt' || einstufung === 'Information') { if (rule.class !== 'Hinweis') err('einstufung-invalid', rule, `${einstufung} requires class Hinweis`); }
    if (einstufung === 'Nutzung' && !['Fehler', 'Fatal'].includes(rule.class)) err('einstufung-invalid', rule, 'Nutzung requires class Fehler or Fatal');
    if (rule.catalog === 'document') {
      if (rule.fields.Geltung && !SCOPES.includes(rule.fields.Geltung)) err('unknown-geltung', rule, rule.fields.Geltung);
      if (rule.fields.Mittel && !MEANS.includes(rule.fields.Mittel)) err('unknown-mittel', rule, rule.fields.Mittel);
      if (rule.fields.Ort && locationKinds(rule.fields.Ort).length === 0) err('unknown-ort', rule, `Ort names no kind from ${LOCATION_KINDS.join('|')}`);
      for (const field of ['Meldung', 'Ort']) {
        for (const m of (rule.fields[field] ?? '').matchAll(/\{([a-z]+)\}/g)) if (!cat.placeholders.has(m[1])) err('unknown-placeholder', rule, `{${m[1]}} in ${field}`);
      }
    }
  }

  for (const prefix of ['HPR', 'HPL']) {
    const areas = prefix === 'HPR' ? SPEC_AREAS : READER_AREAS;
    for (const area of areas) {
      const nums = cat.rules.filter((r) => r.prefix === prefix && r.area === area).map((r) => r.number);
      if (nums.length === 0) continue;
      const expected = nums.map((_, i) => i + 1);
      if (nums.join(',') !== expected.join(',')) err('numbering', undefined, `${prefix}-${area}: got ${nums.join(',')}, expected ${expected.join(',')}`);
    }
  }
  if (cat.rules.filter((r) => r.catalog === 'document').length === 0) err('catalog-empty', undefined, 'no document rules');
  if (cat.rules.filter((r) => r.catalog === 'reader').length === 0) err('catalog-empty', undefined, 'no reader rules');

  for (const [i, line] of cat.lines.entries()) {
    for (const m of line.matchAll(/\bHP[RL]-([A-Z]+)-(\d{3})\b/g)) if (!byId.has(m[0])) err('dangling-rule-reference', { id: m[0], line: i + 1 }, 'referenced rule does not exist');
    for (const m of line.matchAll(/\bHP-([A-Z]+)-(\d{3})\b/g)) if (!reqById.has(m[0]) && SPEC_AREAS.includes(m[1])) err('dangling-requirement-reference', { id: m[0], line: i + 1 }, 'requirement does not exist in part 0');
    if (/^- \[Q\d+[a-z]?\] /.test(line)) continue;
    for (const m of line.matchAll(/\[(Q\d+[a-z]?)\]/g)) { const s = cat.sources.get(m[1]); if (s) s.used++; else err('unknown-source', { line: i + 1 }, m[1]); }
  }
  for (const [id, s] of cat.sources) if (s.used === 0) warnings.push({ code: 'unused-source', id, line: s.line });

  // Coverage of part 0.
  const rows = coverageRows(spec, cat);
  for (const row of rows) {
    const subj = row.subject.split(',').map((s) => s.trim());
    if (row.grade === 'Muss' && subj.includes('D') && row.doc.length === 0) err('coverage-gap', { id: row.id }, 'Muss requirement with subject D has no document rule');
    if (row.grade === 'Muss' && subj.includes('L') && row.id.startsWith('HP-SBX-') && row.reader.length === 0) err('coverage-gap', { id: row.id }, 'Muss sandbox requirement with subject L has no reader rule');
    if (row.grade !== 'Muss' && subj.includes('D') && row.doc.length === 0) warnings.push({ code: 'coverage-gap-soft', id: row.id, line: 0 });
  }
  const expectedTable = formatCoverage(rows).slice(2);
  if (!cat.coverage) err('table-missing', undefined, 'coverage table markers not found');
  else {
    const actual = cat.coverage.rows.filter((l) => /^\| HP-/.test(l));
    const actualById = new Map(actual.map((l) => [l.split('|')[1].trim(), l]));
    for (const line of expectedTable) {
      const id = line.split('|')[1].trim();
      const have = actualById.get(id);
      if (!have) err('table-missing-id', { id, line: cat.coverage.start + 1 }, 'requirement missing in coverage table');
      else if (have.trim() !== line.trim()) err('table-mismatch', { id, line: cat.coverage.start + 1 }, `table row differs from computed row: ${line}`);
    }
    for (const id of actualById.keys()) if (!reqById.has(id)) err('table-unknown-id', { id, line: cat.coverage.start + 1 }, 'coverage row for unknown requirement');
  }

  // Summary tables.
  const docCounts = countsFor(cat.rules.filter((r) => r.catalog === 'document'));
  const readerCounts = countsFor(cat.rules.filter((r) => r.catalog === 'reader'));
  for (const [name, block, counts] of [['HPR', cat.summaryDoc, docCounts], ['HPL', cat.summaryReader, readerCounts]]) {
    if (!block) { err('summary-missing', undefined, name); continue; }
    const have = parseSummary(block.rows);
    for (const key of [...LEVELS, 'alle']) {
      const row = have.get(key);
      if (!row) { err('summary-missing', { line: block.start + 1 }, `${name} ${key}`); continue; }
      for (const g of ['Fatal', 'Fehler', 'Warnung', 'Hinweis', 'sum']) if (row[g] !== counts[key][g]) err('summary-mismatch', { line: block.start + 1 }, `${name} ${key} ${g}: table ${row[g]}, computed ${counts[key][g]}`);
    }
  }
  const mCounts = meansCounts(cat.rules.filter((r) => r.catalog === 'document'));
  if (!cat.means) err('summary-missing', undefined, 'Mittel');
  else {
    const have = new Map();
    for (const row of cat.means.rows) { const m = /^\| (\w+) \| (\d+) \|/.exec(row); if (m) have.set(m[1], +m[2]); }
    for (const m of MEANS) if (have.get(m) !== mCounts[m]) err('summary-mismatch', { line: cat.means.start + 1 }, `Mittel ${m}: table ${have.get(m)}, computed ${mCounts[m]}`);
  }

  // Exported JSON catalogue and report schema.
  const catalogJson = buildCatalog(cat, options.docPath);
  if (options.jsonPath !== null) {
    const jsonPath = options.jsonPath ?? DEFAULT_JSON;
    if (!existsSync(jsonPath)) err('catalog-json-missing', undefined, relative(ROOT, jsonPath));
    else {
      let current;
      try { current = readFileSync(jsonPath, 'utf8'); } catch (e) { current = ''; }
      if (current.trim() !== JSON.stringify(catalogJson, null, 2).trim()) err('catalog-json-stale', undefined, `${relative(ROOT, jsonPath)} differs from the catalogue in the document; run --export`);
    }
  }
  if (options.schemaPath !== null) {
    const schemaPath = options.schemaPath ?? DEFAULT_SCHEMA;
    try { const s = JSON.parse(readFileSync(schemaPath, 'utf8')); if (!s.$schema || !s.properties?.results) err('schema-invalid', undefined, 'report schema lacks $schema or properties.results'); } catch (e) { err('schema-missing', undefined, `${relative(ROOT, schemaPath)}: ${e.message}`); }
  }

  const perArea = {};
  for (const prefix of ['HPR', 'HPL']) for (const area of READER_AREAS) { const n = cat.rules.filter((r) => r.prefix === prefix && r.area === area).length; if (n) perArea[`${prefix}-${area}`] = n; }
  const uncovered = rows.filter((r) => r.doc.length === 0 && r.reader.length === 0).map((r) => r.id);
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    rules: cat.rules.length,
    documentRules: cat.rules.filter((r) => r.catalog === 'document').length,
    readerRules: cat.rules.filter((r) => r.catalog === 'reader').length,
    perArea,
    docCounts,
    readerCounts,
    meansCounts: mCounts,
    requirements: spec.requirements.length,
    covered: rows.length - uncovered.length,
    uncovered,
    sources: cat.sources.size,
    coverageTable: formatCoverage(rows),
    summaryDoc: formatSummary(docCounts),
    summaryReader: formatSummary(readerCounts),
    meansTable: formatMeans(mCounts),
    catalogJson,
  };
}

function main(argv) {
  const args = argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const json = args.includes('--json');
  const table = args.includes('--table');
  const exportIdx = args.indexOf('--export');
  const positional = args.filter((a, i) => !a.startsWith('--') && !['--spec', '--export', '--json-file'].includes(args[i - 1]));
  const docPath = positional[0] ?? DEFAULT_DOC;
  const specPath = flag('--spec') ?? DEFAULT_SPEC;
  const jsonPath = flag('--json-file') ?? DEFAULT_JSON;
  let text, specText;
  try { text = readFileSync(docPath, 'utf8'); specText = readFileSync(specPath, 'utf8'); } catch (e) { console.error(`cannot read: ${e.message}`); return 2; }
  if (exportIdx >= 0) {
    const out = args[exportIdx + 1] && !args[exportIdx + 1].startsWith('--') ? args[exportIdx + 1] : jsonPath;
    const result = checkCatalog(text, specText, { docPath, jsonPath: null, schemaPath: null });
    writeFileSync(out, JSON.stringify(result.catalogJson, null, 2) + '\n');
    console.log(`exported ${result.documentRules} document rules and ${result.readerRules} reader rules to ${out}`);
    return 0;
  }
  if (args.includes('--write-tables')) {
    // Rewrites the generated tables (10.2, 11.1–11.3) between their markers in the document.
    const result = checkCatalog(text, specText, { docPath, jsonPath: null, schemaPath: null });
    const replace = (src, startMarker, endMarker, rows) => {
      const s = src.indexOf(startMarker); const e = src.indexOf(endMarker);
      if (s < 0 || e < s) throw new Error(`markers ${startMarker}/${endMarker} not found`);
      const lineEnd = src.indexOf('\n', s);
      return src.slice(0, lineEnd + 1) + rows.join('\n') + '\n' + src.slice(e);
    };
    let out = text;
    out = replace(out, 'ABDECKUNGSTABELLE ANFANG', 'ABDECKUNGSTABELLE ENDE', result.coverageTable);
    out = replace(out, 'SUMMENTABELLE-HPR ANFANG', 'SUMMENTABELLE-HPR ENDE', result.summaryDoc);
    out = replace(out, 'SUMMENTABELLE-HPL ANFANG', 'SUMMENTABELLE-HPL ENDE', result.summaryReader);
    out = replace(out, 'MITTELTABELLE ANFANG', 'MITTELTABELLE ENDE', result.meansTable);
    writeFileSync(docPath, out);
    console.log(`tables written to ${docPath}`);
    return 0;
  }
  const result = checkCatalog(text, specText, { docPath, jsonPath });
  if (table) {
    console.log(result.coverageTable.join('\n'));
    console.log('\n' + result.summaryDoc.join('\n'));
    console.log('\n' + result.summaryReader.join('\n'));
    console.log('\n' + result.meansTable.join('\n'));
    return 0;
  }
  if (json) {
    const { coverageTable, summaryDoc, summaryReader, meansTable, catalogJson, ...rest } = result;
    console.log(JSON.stringify({ file: docPath, spec: specPath, ...rest }, null, 2));
  } else {
    console.log(`check-konformitaet: ${docPath} (against ${relative(ROOT, specPath)})`);
    console.log(`rules: ${result.rules} (document ${result.documentRules}, reader ${result.readerRules}), requirements in part 0: ${result.requirements}, sources: ${result.sources}`);
    console.log('per area: ' + Object.entries(result.perArea).map(([a, n]) => `${a}=${n}`).join(' '));
    for (const [name, counts] of [['HPR', result.docCounts], ['HPL', result.readerCounts]]) {
      for (const key of [...LEVELS, 'alle']) { const c = counts[key]; console.log(`${name} ${key.padEnd(9)} Fatal=${c.Fatal} Fehler=${c.Fehler} Warnung=${c.Warnung} Hinweis=${c.Hinweis} sum=${c.sum}`); }
    }
    console.log('means: ' + Object.entries(result.meansCounts).map(([k, n]) => `${k}=${n}`).join(' '));
    console.log(`coverage: ${result.covered} of ${result.requirements} requirements have at least one rule; without rule: ${result.uncovered.length}${result.uncovered.length ? ' (' + result.uncovered.join(', ') + ')' : ''}`);
    for (const e of result.errors) console.log(`ERROR ${e.code}${e.id ? ' ' + e.id : ''}${e.line ? ' (line ' + e.line + ')' : ''}${e.detail ? ': ' + e.detail : ''}${e.text ? ': ' + e.text : ''}`);
    for (const w of result.warnings) console.log(`WARN  ${w.code} ${w.id}${w.line ? ' (line ' + w.line + ')' : ''}`);
    console.log(result.ok ? `OK: 0 errors, ${result.warnings.length} warnings` : `FAILED: ${result.errors.length} errors, ${result.warnings.length} warnings`);
  }
  return result.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}
