#!/usr/bin/env node
/**
 * Self-test of scripts/check-handbuch.mjs: deliberately broken variants of the real guides must be
 * detected with the expected error code; the unmodified guides must pass.
 *
 *   node scripts/check-handbuch-selftest.mjs
 */
import { readFileSync } from 'node:fs';
import { checkAll, DEFAULT_DOCS, loadBelege, loadSpec, ROOT } from './check-handbuch.mjs';

const spec = loadSpec();
const belege = loadBelege();
const docs = new Map(DEFAULT_DOCS.map((f) => [f.slice(ROOT.length + 1), readFileSync(f, 'utf8')]));
const [mainPath, mainText] = [...docs][0];

function run(name, mutate, expected) {
  const d = new Map(docs);
  const variant = mutate(mainText);
  if (variant === mainText) throw new Error(`${name}: Variante unverändert`);
  d.set(mainPath, variant);
  const codes = new Set(checkAll({ docs: d, spec, belege }).flatMap((r) => r.findings.map((f) => f.code)));
  const ok = codes.has(expected);
  console.log(`${ok ? 'erkannt   ' : 'NICHT erkannt'}  ${name} → ${expected}${ok ? '' : ` (gemeldet: ${[...codes].join(', ') || 'nichts'})`}`);
  return ok;
}

const firstStatementWithId = (t) => {
  const m = /^(?!#|\||```|<!--)([^\n]*\b(?:HP|HPR|HPL|HPG|HPF)-[A-Z]+-\d{3}\b[^\n]*)$/m.exec(t);
  if (!m) throw new Error('keine Aussage mit Kennung gefunden');
  return m[1];
};
const firstCommandBlock = (t) => {
  const m = /```[^\n]*\n(\$ [^\n]*\n[\s\S]*?)```/.exec(t);
  if (!m) throw new Error('kein Befehlsblock gefunden');
  return m[1];
};
const firstExcerptFence = (t) => {
  const m = /```([^\n]*aus:[^\n]*)\n([\s\S]*?)```/.exec(t);
  if (!m) throw new Error('kein Ausschnittblock gefunden');
  return m;
};

const baseline = checkAll({ docs, spec, belege }).flatMap((r) => r.findings);
console.log(`Ausgangszustand: ${baseline.length} Fehler`);
if (baseline.length > 0) {
  for (const f of baseline) console.log(`  ${f.code} ${f.file}:${f.line}: ${f.detail}`);
  process.exit(1);
}

const results = [
  run('Kennung durch unbekannte ersetzt', (t) => t.replace(/\bHP-CONT-002\b/, 'HP-CONT-999'), 'unknown-requirement'),
  run('Abschnittsverweis auf nicht existierenden Abschnitt', (t) => t.replace(/Teil 1, Abschnitt 8\.2/, 'Teil 1, Abschnitt 99.9'), 'unknown-section'),
  run('Aussage ohne Anforderungsnennung', (t) => {
    const s = firstStatementWithId(t);
    return t.replace(s, s.replace(/\b(?:HP|HPR|HPL|HPG|HPF)-[A-Z]+-\d{3}\b/g, 'XX').replace(/Teil\s+[0-3],?\s*(?:Abschnitt|§)\s*[\d.]+/g, 'dort'));
  }, 'statement-without-reference'),
  run('Befehlsausgabe verändert', (t) => {
    const b = firstCommandBlock(t);
    return t.replace(b, b.replace(/\n([^\n…]+)\n/, '\n$1 [verändert]\n'));
  }, 'output-not-verbatim'),
  run('Befehlsausgabe auf falsche Belegdatei festgelegt', (t) => t.replace(/```text beleg:0\d-[a-z-]+\.txt/, '```text beleg:gibt-es-nicht.txt'), 'output-not-verbatim'),
  run('Dateiausschnitt verändert', (t) => {
    const m = firstExcerptFence(t);
    return t.replace(m[0], m[0].replace(m[2], m[2].replace(/\S/, 'Ж')));
  }, 'excerpt-mismatch'),
  run('Kapitel ohne Befehlsausgabe', (t) => t.replace(/```[^\n]*\n\$ [^\n]*\n[\s\S]*?```/, '```text\n(entfernt)\n```'), 'chapter-without-example'),
  run('Toter Repository-Pfad', (t) => t.replace(/`docs\/belege\/S3\/README\.md`/, '`docs/belege/S99/README.md`'), 'missing-path'),
];
const missing = checkAll({ docs: new Map([['docs/spezifikation/99-fehlt.md', undefined]]), spec, belege }).flatMap((r) => r.findings.map((f) => f.code));
const okMissing = missing.includes('missing-document');
console.log(`${okMissing ? 'erkannt   ' : 'NICHT erkannt'}  fehlendes Dokument → missing-document`);
results.push(okMissing);

const n = results.filter(Boolean).length;
console.log(`${n} von ${results.length} kaputten Varianten erkannt`);
process.exit(n === results.length ? 0 : 1);
