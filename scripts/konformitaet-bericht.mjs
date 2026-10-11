#!/usr/bin/env node
/**
 * Report builder for the html-Pro conformance rule catalogue (part 1, section 4) plus a small
 * example checker that proves the catalogue structure yields findings.
 *
 * Library (import { loadCatalog, createReport } …):
 *   - loadCatalog(): reads docs/spezifikation/01-regelkatalog.json
 *   - createReport(catalog, { file, tool, strict }): returns a builder with
 *       finding(ruleId, params, location, rendition?)  – adds a finding; message rendered from
 *                                                         the rule's template, class/level/
 *                                                         requirements taken from the catalogue
 *       notChecked(ruleId, reason, detail?)
 *       claim(level) / request(level)
 *       rendition(id, profile)
 *       finish()  – computes summary and verdicts (section 3.4), returns the JSON report
 *       text()    – human-readable form (section 4.4)
 *       exitCode()– section 4.5
 *   - validateReport(report, schema): tiny JSON-Schema subset validator (required, type, enum,
 *     const, pattern, properties, additionalProperties, propertyNames, items, minItems, minimum,
 *     uniqueItems, local $ref)
 *
 * Example checker (CLI; NOT the conformance checker of package S3, only a demonstration that the
 * catalogue is executable): applies the rules the container core can already observe
 * (ZIP structure, mimetype, hash manifest, manifest fields, signatures) and, optionally, the
 * EPUB validator; every other rule is reported as not checked.
 *
 *   node scripts/konformitaet-bericht.mjs <container> [--trust cert.pem]... [--epubcheck jar --java bin]
 *                                        [--json out.json] [--quiet]
 * Exit codes as in part 1, section 4.5.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
export const CATALOG_PATH = resolve(ROOT, 'docs', 'spezifikation', '01-regelkatalog.json');
export const SCHEMA_PATH = resolve(ROOT, 'docs', 'spezifikation', 'schema', 'konformitaetsbericht.schema.json');
const LEVELS = ['Basis', 'Lebendig', 'Signiert', 'Archiv'];
const INCLUDES = { Basis: ['Basis'], Lebendig: ['Basis', 'Lebendig'], Signiert: ['Basis', 'Signiert'], Archiv: ['Basis', 'Signiert', 'Archiv'] };
const CLASS_DE = { FATAL: 'FATAL', ERROR: 'FEHLER', WARNING: 'WARNUNG', INFO: 'HINWEIS' };
const VERDICT_RANK = { 'nicht bestanden': 0, unbestimmt: 1, bestanden: 2 };

export function loadCatalog(path = CATALOG_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function render(template, params) {
  return template.replace(/\{([a-z]+)\}/g, (m, key) => (params[key] === undefined || params[key] === null ? '' : String(params[key])))
    .replace(/\s+:\s*/g, ': ').replace(/\s{2,}/g, ' ').replace(/\(\s*\)/g, '').replace(/::+/g, ':').replace(/:\s*:/g, ':').trim();
}

export function createReport(catalog, { file, tool, strict = false, checkedAt } = {}) {
  const rules = new Map(catalog.rules.map((r) => [r.id, r]));
  const results = [];
  const notChecked = [];
  const claimed = new Set(['Basis']);
  const requested = new Set();
  const renditions = new Map([[null, { id: null, profile: null }]]);
  let finished = null;

  const api = {
    rule: (id) => rules.get(id),
    claim(level) { claimed.add(level); for (const l of INCLUDES[level]) claimed.add(l); return api; },
    request(level) { requested.add(level); return api; },
    rendition(id, profile) { renditions.set(id, { id, profile }); if (profile === 'interactive') api.claim('Lebendig'); if (profile === 'signed') api.claim('Signiert'); if (profile === 'archive') api.claim('Archiv'); return api; },
    finding(ruleId, params = {}, location = undefined, rendition = null) {
      const rule = rules.get(ruleId);
      if (!rule) throw new Error(`unknown rule ${ruleId}`);
      const f = { rule: ruleId, class: rule.classCode, level: rule.level, rendition, message: render(rule.message, params), requirements: rule.requirements };
      if (location) f.location = location;
      if (Object.keys(params).length) f.params = params;
      results.push(f);
      return f;
    },
    notChecked(ruleId, reason, detail) {
      if (!rules.has(ruleId)) throw new Error(`unknown rule ${ruleId}`);
      const e = { rule: ruleId, reason };
      if (detail) e.detail = detail;
      notChecked.push(e);
      return e;
    },
    /** Marks every rule without finding and without explicit status as not checked. */
    fillNotChecked(reason, detail, { touched = new Set() } = {}) {
      const done = new Set([...results.map((r) => r.rule), ...notChecked.map((n) => n.rule), ...touched]);
      for (const r of catalog.rules) if (!done.has(r.id)) api.notChecked(r.id, r.means === 'manuell' ? 'manual' : reason, r.means === 'manuell' ? undefined : detail);
      return api;
    },
    verdictFor(level, rendition) {
      const inScope = (r) => INCLUDES[level].includes(r.level) && (rendition === undefined || r.rendition === rendition || r.rendition === null);
      const effectiveClass = (r) => (strict && r.class === 'WARNING' ? 'ERROR' : r.class);
      if (results.some((r) => r.class === 'FATAL' && (rendition === undefined || r.rendition === rendition || r.rendition === null))) return 'nicht bestanden';
      if (results.some((r) => inScope(r) && effectiveClass(r) === 'ERROR')) return 'nicht bestanden';
      const unchecked = notChecked.some((n) => { const rule = rules.get(n.rule); return INCLUDES[level].includes(rule.level) && ['ERROR', 'FATAL'].includes(rule.classCode); });
      const indeterminate = results.some((r) => inScope(r) && rules.get(r.rule).classification === 'Unbestimmt');
      if (unchecked || indeterminate) return 'unbestimmt';
      return 'bestanden';
    },
    finish() {
      const levels = [...LEVELS].filter((l) => claimed.has(l) || requested.has(l));
      const verdict = {};
      for (const l of levels) verdict[l] = api.verdictFor(l);
      const rend = [...renditions.values()].map((r) => { const v = {}; for (const l of levels) v[l] = api.verdictFor(l, r.id); return { id: r.id, profile: r.profile, verdict: v }; });
      const summary = { fatal: 0, error: 0, warning: 0, info: 0, notChecked: notChecked.length };
      for (const r of results) summary[{ FATAL: 'fatal', ERROR: 'error', WARNING: 'warning', INFO: 'info' }[r.class]]++;
      finished = {
        spec: 'https://html-pro.example/spec/0.1',
        catalog: { part: '1', version: catalog.version, rules: catalog.rules.length },
        tool,
        checkedAt: checkedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        file,
        strict,
        levels: { claimed: LEVELS.filter((l) => claimed.has(l)), requested: LEVELS.filter((l) => requested.has(l)), verdict },
        renditions: rend,
        summary,
        results: [...results].sort((a, b) => (a.class === 'FATAL' ? -1 : b.class === 'FATAL' ? 1 : 0)),
        notChecked,
      };
      return finished;
    },
    text() {
      const r = finished ?? api.finish();
      const lines = [];
      for (const f of r.results) {
        const loc = f.location ? (f.location.kind === 'manifest' ? `${f.location.path ?? 'manifest.json'}#${f.location.pointer ?? ''}` : f.location.kind === 'signature' ? `signatur=${f.location.signatureId}` : f.location.path ? f.location.path + (f.location.line ? `:${f.location.line}` + (f.location.column ? `:${f.location.column}` : '') : '') : f.location.kind) : '-';
        lines.push(`${CLASS_DE[f.class]} ${f.rule}${f.rendition ? ` [${f.rendition}]` : ''} ${loc}: ${f.message}`);
      }
      for (const n of r.notChecked) lines.push(`NICHT GEPRÜFT ${n.rule}: ${n.reason}${n.detail ? ` (${n.detail})` : ''}`);
      const s = r.summary;
      lines.push(`Befunde: ${s.fatal} fatal, ${s.error} Fehler, ${s.warning} Warnungen, ${s.info} Hinweise, ${s.notChecked} nicht geprüft`);
      for (const [l, v] of Object.entries(r.levels.verdict)) lines.push(`Stufe ${l}: ${v}`);
      return lines.join('\n');
    },
    exitCode() {
      const r = finished ?? api.finish();
      const vs = Object.values(r.levels.verdict);
      if (vs.includes('nicht bestanden')) return 1;
      if (vs.includes('unbestimmt')) return 3;
      return 0;
    },
    get results() { return results; },
    get notCheckedList() { return notChecked; },
  };
  return api;
}

/** Minimal JSON-Schema (2020-12 subset) validator; returns a list of problems. */
export function validateReport(value, schema, root = schema, path = '$', problems = []) {
  const fail = (msg) => { problems.push(`${path}: ${msg}`); return problems; };
  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, '').split('/').reduce((o, k) => o?.[k], root);
    if (!target) return fail(`unresolvable $ref ${schema.$ref}`);
    return validateReport(value, target, root, path, problems);
  }
  if ('const' in schema && value !== schema.const) return fail(`expected const ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) return fail(`not in enum ${JSON.stringify(schema.enum)}`);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
    const ok = types.some((t) => t === actual || (t === 'number' && actual === 'integer'));
    if (!ok) return fail(`type ${actual}, expected ${types.join('|')}`);
  }
  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail(`"${value}" does not match ${schema.pattern}`);
    if (schema.minLength !== undefined && value.length < schema.minLength) fail('too short');
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) fail(`below minimum ${schema.minimum}`);
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(`fewer than ${schema.minItems} items`);
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) fail('items not unique');
    if (schema.items) value.forEach((v, i) => validateReport(v, schema.items, root, `${path}[${i}]`, problems));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required ?? []) if (!(key in value)) fail(`missing required "${key}"`);
    for (const [key, v] of Object.entries(value)) {
      if (schema.propertyNames) validateReport(key, schema.propertyNames, root, `${path}.${key}(name)`, problems);
      if (schema.properties && key in schema.properties) validateReport(v, schema.properties[key], root, `${path}.${key}`, problems);
      else if (schema.additionalProperties === false) fail(`unexpected property "${key}"`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') validateReport(v, schema.additionalProperties, root, `${path}.${key}`, problems);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Example checker

const PROFILE_RE = /^https:\/\/html-pro\.example\/spec\/\d+\.\d+\/profile\/(static|interactive|signed|archive)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const LANG_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/;
const UUID_RE = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const META_INF_ALLOWED = /^META-INF\/(container\.xml|signatures.*\.xml|manifest\.xml|metadata\.xml|rights\.xml)$/;

async function loadKern() {
  const candidates = [resolve(ROOT, 'kern', 'build', 'src', 'index.js'), resolve(ROOT, 'kern', 'dist', 'index.js')];
  for (const c of candidates) { try { return await import(c); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; } }
  throw new Error('kern not built: run `npm run build:test -w kern`');
}

/** Applies the rules the core can observe; returns the finished report. */
export async function exampleCheck(filePath, { trust = [], epubcheck, java, catalog = loadCatalog(), tool = { name: 'html-pro Beispielprüfer (S2)', version: '0.1.0' } } = {}) {
  const kern = await loadKern();
  const bytes = readFileSync(filePath);
  const report = createReport(catalog, { file: { name: basename(filePath), size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }, tool });
  const touched = new Set();
  const touch = (...ids) => ids.forEach((id) => touched.add(id));
  const entryLoc = (path) => ({ kind: 'entry', path });
  const manifestLoc = (pointer, path = 'manifest.json') => ({ kind: 'manifest', path, pointer });

  // CMS envelope? (HPR-LOCK-006)
  touch('HPR-LOCK-006');
  if (bytes[0] === 0x30 && bytes.includes(Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x03]).toString('binary'), 0, 'binary')) {
    report.finding('HPR-LOCK-006', {}, { kind: 'container' });
    return finishAll(report, catalog, touched);
  }

  // ZIP structure and container reading (HPR-CONT-001/004/005/006/011/012/027).
  let entries;
  touch('HPR-CONT-001', 'HPR-CONT-012', 'HPR-CONT-013', 'HPR-CONT-027', 'HPR-CONT-003', 'HPR-CONT-002', 'HPR-CONT-026');
  try {
    entries = await kern.readZip(bytes);
  } catch (e) {
    const code = e.code ?? 'zip-structure';
    if (code === 'zip-path') report.finding('HPR-CONT-012', { pfad: e.path ?? '?', regel: e.message }, entryLoc(e.path ?? '?'));
    else if (code === 'zip-crc') report.finding('HPR-CONT-027', { pfad: e.path ?? '?', grund: e.message }, entryLoc(e.path ?? '?'));
    else if (code === 'zip-unsupported') report.finding('HPR-CONT-003', { pfad: e.path ?? '?', grund: e.message }, e.path ? entryLoc(e.path) : { kind: 'container' });
    else if (code === 'zip-limit') report.finding('HPR-CONT-026', { grund: e.message, wert: '', grenze: '' }, { kind: 'container' });
    else report.finding('HPR-CONT-001', { grund: e.message }, { kind: 'container' });
    return finishAll(report, catalog, touched, 'fatal');
  }
  for (const e of entries) if (!['stored', 'deflated'].includes(e.method)) report.finding('HPR-CONT-002', { pfad: e.name, methode: e.method }, entryLoc(e.name));
  const names = entries.map((e) => e.name);
  const folded = new Map();
  for (const n of names) { const k = n.normalize('NFC').toLowerCase(); if (folded.has(k)) report.finding('HPR-CONT-013', { pfad: n, wert: folded.get(k) }, entryLoc(n)); else folded.set(k, n); }
  const first = entries[0];
  const mimetypeEntry = entries.find((e) => e.name === 'mimetype');
  const mimetypeText = mimetypeEntry ? Buffer.from(mimetypeEntry.data).toString('latin1') : undefined;
  touch('HPR-CONT-004', 'HPR-CONT-005', 'HPR-CONT-011');
  if (mimetypeText !== 'application/epub+zip' && !names.includes('manifest.json')) {
    report.finding('HPR-CONT-004', {}, { kind: 'container' });
    return finishAll(report, catalog, touched, 'fatal');
  }
  const mimetypeProblems = [];
  if (!mimetypeEntry) mimetypeProblems.push('Eintrag fehlt');
  else {
    if (first.name !== 'mimetype' || first.localHeaderOffset !== 0) mimetypeProblems.push('nicht erster Eintrag an Offset 0');
    if (mimetypeEntry.method !== 'stored') mimetypeProblems.push(`Methode ${mimetypeEntry.method}`);
    if (mimetypeEntry.localExtraLength !== 0) mimetypeProblems.push(`Extra-Länge ${mimetypeEntry.localExtraLength}`);
    if (mimetypeText !== 'application/epub+zip') mimetypeProblems.push(`Inhalt ${JSON.stringify(mimetypeText)}`);
  }
  for (const p of mimetypeProblems) report.finding('HPR-CONT-005', { grund: p }, entryLoc('mimetype'));
  touch('HPR-CONT-014', 'HPR-CONT-023');
  for (const n of names) {
    if (n.startsWith('META-INF/') && !META_INF_ALLOWED.test(n)) report.finding('HPR-CONT-014', { pfad: n, grund: 'unzulässige Datei unter META-INF/' }, entryLoc(n));
    if ((n === 'META-INF/encryption.xml' || n === 'META-INF/rights.xml') && entries.find((e) => e.name === n).size > 0) report.finding('HPR-CONT-023', { pfad: n }, entryLoc(n));
  }

  let container;
  touch('HPR-CONT-006', 'HPR-CONT-007', 'HPR-CONT-015', 'HPR-CONT-016', 'HPR-CONT-017', 'HPR-CONT-018', 'HPR-CONT-019');
  try {
    container = await kern.readContainer(bytes);
  } catch (e) {
    const code = e.code ?? '';
    if (code === 'container-xml') { report.finding('HPR-CONT-006', { grund: e.message }, { kind: 'xml', path: 'META-INF/container.xml' }); }
    else if (code === 'manifest') { report.finding('HPR-CONT-011', { pfad: 'manifest.json', grund: e.message }, entryLoc('manifest.json')); return finishAll(report, catalog, touched, 'fatal'); }
    else if (code === 'mimetype') { /* already reported above */ }
    else { report.finding('HPR-CONT-001', { grund: e.message }, { kind: 'container' }); return finishAll(report, catalog, touched, 'fatal'); }
  }
  if (container) {
    const m = container.manifest;
    for (const r of container.integrity.resources) {
      if (r.status === 'hash-mismatch') report.finding('HPR-CONT-016', { pfad: r.path, erwartet: r.expected, wert: r.actual }, entryLoc(r.path));
      if (r.status === 'missing') report.finding('HPR-CONT-018', { feld: `/resources/${r.index ?? '?'}`, pfad: r.path }, manifestLoc(`/resources`));
    }
    for (const u of container.integrity.unlisted) report.finding('HPR-CONT-017', { pfad: u }, entryLoc(u));
    const seen = new Set();
    for (const [i, r] of m.resources.entries()) {
      if (seen.has(r.url)) report.finding('HPR-CONT-019', { feld: `/resources/${i}`, pfad: r.url }, manifestLoc(`/resources/${i}`));
      seen.add(r.url);
      if (!/^sha256-[A-Za-z0-9+/]{43}=$/.test(r.integrity ?? '')) report.finding('HPR-CONT-015', { feld: `/resources/${i}`, grund: `integrity "${r.integrity}" hat nicht die Form sha256-<Base64>` }, manifestLoc(`/resources/${i}`));
    }
    // Profile and manifest fields (HPR-PROF-001, HPR-META-002..005).
    touch('HPR-PROF-001', 'HPR-META-002', 'HPR-META-003', 'HPR-META-004', 'HPR-META-005');
    const pm = PROFILE_RE.exec(m.conformsTo ?? '');
    const profile = pm ? pm[1] : 'static';
    if (!pm) report.finding('HPR-PROF-001', { feld: '/conformsTo', wert: m.conformsTo }, manifestLoc('/conformsTo'));
    report.rendition(null, profile);
    if (!DATE_RE.test(m.dateModified ?? '')) report.finding('HPR-META-002', { feld: '/dateModified', wert: m.dateModified }, manifestLoc('/dateModified'));
    if (!LANG_RE.test(m.inLanguage ?? '')) report.finding('HPR-META-003', { feld: '/inLanguage', wert: m.inLanguage }, manifestLoc('/inLanguage'));
    if (!m.readingOrder?.length) report.finding('HPR-META-004', { feld: '/readingOrder', grund: 'leer' }, manifestLoc('/readingOrder'));
    for (const [i, ro] of (m.readingOrder ?? []).entries()) if (ro.type !== 'application/xhtml+xml') report.finding('HPR-META-004', { feld: `/readingOrder/${i}`, grund: `type ${ro.type}` }, manifestLoc(`/readingOrder/${i}`));
    if (!UUID_RE.test(m.id ?? '')) report.finding('HPR-META-005', { feld: '/id', wert: m.id }, manifestLoc('/id'));
  }

  // Signatures (HPR-SIG-005/007/015/016/017, HPR-PROF-004).
  const signatureFiles = names.filter((n) => /^META-INF\/signatures.*\.xml$/.test(n));
  if (signatureFiles.length > 0) {
    report.claim('Signiert');
    touch('HPR-SIG-005', 'HPR-SIG-007', 'HPR-SIG-015', 'HPR-SIG-016', 'HPR-SIG-017', 'HPR-PROF-004', 'HPR-SIG-022');
    for (const f of signatureFiles) if (f !== 'META-INF/signatures.xml') report.finding('HPR-SIG-022', { pfad: f }, entryLoc(f));
    const trustAnchors = trust.flatMap((pem) => kern.certificatesFromPem(readFileSync(pem, 'utf8')));
    const v = await kern.validateContainer(bytes, { trustAnchors, policy: 'html-pro' });
    const covered = new Set();
    for (const s of v.signatures) {
      const loc = { kind: 'signature', path: s.file, signatureId: s.signatureId };
      if (s.indication === 'TOTAL_FAILED') {
        const bad = (s.references ?? []).filter((r) => r.status !== 'intact' && r.status !== 'ok').map((r) => r.uri);
        report.finding('HPR-SIG-015', { signatur: s.signatureId, indikation: `${s.indication} / ${s.subIndication ?? '?'}`, grund: bad.length ? `: nicht intakt: ${bad.join(', ')}` : '' }, { ...loc, ...(bad.length ? { uri: bad[0] } : {}) });
      } else if (s.indication === 'INDETERMINATE') {
        report.finding('HPR-SIG-016', { signatur: s.signatureId, indikation: `${s.indication} / ${s.subIndication ?? '?'}` }, loc);
      }
      for (const p of s.signedPaths) covered.add(p);
      if (!s.signedPaths.includes('META-INF/container.xml')) report.finding('HPR-SIG-007', { signatur: s.signatureId }, loc);
    }
    const dataFiles = names.filter((n) => n !== 'mimetype' && !n.startsWith('META-INF/'));
    for (const p of dataFiles) if (!covered.has(p)) {
      report.finding('HPR-SIG-017', { pfad: p }, entryLoc(p));
      if (!p.startsWith('annotations/') && !p.startsWith('renditions/') && container && (PROFILE_RE.exec(container.manifest.conformsTo ?? '')?.[1] === 'signed' || v.signatures.some((s) => s.signedPaths.some((sp) => !sp.startsWith('renditions/') && sp !== 'META-INF/container.xml')))) {
        report.finding('HPR-SIG-005', { pfad: p, fassung: 'Hauptfassung', signatur: '', uri: p }, { kind: 'signature', path: 'META-INF/signatures.xml', signatureId: v.signatures[0]?.signatureId ?? '?', uri: p });
      }
    }
  } else if (container && ['signed', 'archive'].includes(PROFILE_RE.exec(container.manifest.conformsTo ?? '')?.[1])) {
    report.claim('Signiert');
    touch('HPR-PROF-004');
    report.finding('HPR-PROF-004', { fassung: 'Hauptfassung', profil: PROFILE_RE.exec(container.manifest.conformsTo)[1] }, { kind: 'container' });
  }

  // EPUB validator (HPR-CONT-024/028), optional.
  if (epubcheck && java) {
    touch('HPR-CONT-024', 'HPR-CONT-028');
    const dir = mkdtempSync(join(tmpdir(), 'hpro-s2-'));
    try {
      const epub = join(dir, 'pruefling.epub');
      const out = join(dir, 'epubcheck.json');
      copyFileSync(filePath, epub);
      const run = spawnSync(java, ['-jar', epubcheck, epub, '--json', out], { encoding: 'utf8' });
      let messages = [];
      try { messages = JSON.parse(readFileSync(out, 'utf8')).messages ?? []; } catch (e) { report.notChecked('HPR-CONT-024', 'tool-error', `EPUB-Validator lieferte keinen Bericht: ${(run.stderr || run.stdout || '').trim().slice(0, 200)}`); }
      for (const msg of messages) {
        const sev = String(msg.severity).toUpperCase();
        const loc0 = msg.locations?.[0] ?? {};
        const p = loc0.path ? String(loc0.path).replace(/^.*pruefling\.epub\/?/, '') : '';
        const params = { code: msg.ID, pfad: p || '(Container)', zeile: loc0.line > 0 ? loc0.line : '', grund: msg.message };
        const location = { kind: 'external', tool: 'epubcheck', code: msg.ID };
        if (sev === 'FATAL' || sev === 'ERROR') report.finding('HPR-CONT-024', params, location);
        else report.finding('HPR-CONT-028', params, location);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }

  return finishAll(report, catalog, touched);
}

function finishAll(report, catalog, touched, reason = 'missing-means') {
  report.fillNotChecked(reason, reason === 'fatal' ? 'abhängig von einem fatalen Fehler' : 'nicht im Beispielprüfer umgesetzt', { touched });
  report.finish();
  return report;
}

async function main(argv) {
  const args = argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const file = args.find((a, i) => !a.startsWith('--') && !['--trust', '--epubcheck', '--java', '--json'].includes(args[i - 1]));
  if (!file) { console.error('usage: konformitaet-bericht.mjs <container> [--trust cert.pem]... [--epubcheck jar --java bin] [--json out.json] [--quiet]'); return 2; }
  const trust = args.flatMap((a, i) => (a === '--trust' ? [args[i + 1]] : []));
  let report;
  try {
    report = await exampleCheck(file, { trust, epubcheck: flag('--epubcheck'), java: flag('--java') });
  } catch (e) { console.error(`cannot check ${file}: ${e.message}`); return 2; }
  const json = report.finish();
  const problems = validateReport(json, JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')));
  const out = flag('--json');
  if (out) writeFileSync(out, JSON.stringify(json, null, 2) + '\n');
  if (!args.includes('--quiet')) {
    console.log(`Bericht für ${json.file.name} (${json.file.size} Bytes, sha256=${json.file.sha256.slice(0, 16)}…), Katalog Teil 1 v${json.catalog.version} (${json.catalog.rules} Regeln)`);
    console.log(report.text());
    console.log(`Schemaprüfung des Berichts: ${problems.length === 0 ? 'gültig' : 'UNGÜLTIG: ' + problems.join('; ')}`);
  }
  if (problems.length) return 2;
  return report.exitCode();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv).then((code) => { process.exitCode = code; });
}
