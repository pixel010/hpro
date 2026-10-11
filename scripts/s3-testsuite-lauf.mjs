#!/usr/bin/env node
// Führt die Testsuite zum Konformitätsprüfer aus (Paket S3): prüft jedes Dokument aus
// testsuite/faelle.json mit dem Prüfer des Kerns und vergleicht die gefundenen Regeln und das
// Urteil mit der Erwartung. Gibt eine Tabelle aus; mit --json <pfad> zusätzlich das Ergebnis als JSON.
//
// Aufruf: node scripts/s3-testsuite-lauf.mjs [--json pfad]   (nach `npm run build:test -w kern`)
// Rückgabe: 0 alle Fälle wie erwartet, 1 mindestens eine Abweichung.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { certificatesFromPem, checkConformance, validateAgainstSchema } from '../kern/build/src/index.js';

const ROOT = resolve(import.meta.dirname, '..');
const SUITE = resolve(ROOT, 'testsuite');
const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : undefined;

const catalog = JSON.parse(await readFile(resolve(ROOT, 'docs/spezifikation/01-regelkatalog.json'), 'utf8'));
const schema = JSON.parse(await readFile(resolve(ROOT, 'docs/spezifikation/schema/konformitaetsbericht.schema.json'), 'utf8'));
const functions = JSON.parse(await readFile(resolve(ROOT, 'docs/spezifikation/03-funktionen.json'), 'utf8')).functions.map((f) => f.name);
const suite = JSON.parse(await readFile(resolve(SUITE, 'faelle.json'), 'utf8'));
const ruleIds = new Set(catalog.rules.map((r) => r.id));

const results = [];
for (const f of suite.faelle) {
  const bytes = await readFile(resolve(SUITE, f.datei));
  const trustAnchors = f.vertrauensanker ? certificatesFromPem(await readFile(resolve(SUITE, f.vertrauensanker), 'utf8')) : [];
  const t0 = performance.now();
  const report = await checkConformance(bytes, catalog, {
    fileName: f.datei.split('/').pop(),
    trustAnchors,
    validationTime: suite.pruefzeitpunktSignaturen,
    redactedTerms: f.redigiert ?? [],
    supportedFunctions: functions,
    checkedAt: '2026-10-11T12:00:00Z',
  });
  const ms = performance.now() - t0;
  const found = [...new Set(report.results.map((r) => r.rule))].sort();
  const expected = f.erwarteteBefunde;
  const problems = [];
  for (const id of [...f.regeln, ...expected]) if (!ruleIds.has(id)) problems.push(`unbekannte Regel ${id}`);
  const missing = expected.filter((id) => !found.includes(id));
  const extra = found.filter((id) => !expected.includes(id));
  if (missing.length) problems.push(`fehlt: ${missing.join(', ')}`);
  if (extra.length) problems.push(`zusätzlich: ${extra.join(', ')}`);
  for (const [level, v] of Object.entries(f.erwartetesUrteil)) {
    if (report.levels.verdict[level] !== v) problems.push(`Urteil ${level}: ${report.levels.verdict[level] ?? '–'} statt ${v}`);
  }
  // Every targeted rule must have run: a good case proves "no finding", a bad case "finding".
  const notChecked = new Set(report.notChecked.map((n) => n.rule));
  for (const id of f.regeln) if (notChecked.has(id)) problems.push(`${id} nicht geprüft (${report.notChecked.find((n) => n.rule === id).reason})`);
  const fatalRun = report.results.some((r) => r.class === 'FATAL');
  for (const n of report.notChecked) if (!fatalRun && n.reason !== 'fatal' && !(n.rule in suite.fehlendeMittel)) problems.push(`${n.rule} nicht geprüft ohne erlaubten Grund (${n.reason}: ${n.detail ?? ''})`);
  if (f.art === 'schlecht') for (const id of f.regeln) if (!found.includes(id)) problems.push(`Zielregel ${id} ohne Befund`);
  if (f.art === 'gut') for (const id of f.regeln) if (found.includes(id)) problems.push(`Zielregel ${id} mit Befund`);
  const schemaProblems = validateAgainstSchema(report, schema);
  if (schemaProblems.length) problems.push(`Berichtsschema: ${schemaProblems.slice(0, 3).join('; ')}`);
  results.push({
    id: f.id,
    art: f.art,
    regeln: f.regeln,
    erwartet: expected,
    gefunden: found,
    befunde: report.results.map((r) => ({ rule: r.rule, class: r.class, message: r.message })),
    urteil: report.levels.verdict,
    erwartetesUrteil: f.erwartetesUrteil,
    nichtGeprueft: report.notChecked.map((n) => n.rule),
    ms: Math.round(ms),
    ok: problems.length === 0,
    probleme: problems,
  });
}

// Coverage: a rule counts when it has a good case (targeted, ran, no finding) and a bad case (finding).
const coverage = new Map();
for (const r of results) {
  if (!r.ok) continue;
  for (const id of r.regeln) {
    const c = coverage.get(id) ?? { gut: [], schlecht: [] };
    c[r.art].push(r.id);
    coverage.set(id, c);
  }
}
const both = [...coverage].filter(([, c]) => c.gut.length && c.schlecht.length).map(([id]) => id).sort();
const onlyBad = [...coverage].filter(([, c]) => !c.gut.length && c.schlecht.length).map(([id]) => id).sort();
const onlyGood = [...coverage].filter(([, c]) => c.gut.length && !c.schlecht.length).map(([id]) => id).sort();

const pad = (s, n) => String(s).padEnd(n);
console.log(`Testsuite ${suite.faelle.length} Fälle, Katalog ${catalog.rules.length} Dokumentregeln`);
console.log(`${pad('Fall', 44)} ${pad('Art', 8)} ${pad('Ergebnis', 9)} ${pad('ms', 5)} Befunde (Regeln) / Urteil`);
for (const r of results) {
  const verdict = Object.entries(r.urteil).map(([l, v]) => `${l}=${v}`).join(', ');
  console.log(`${pad(r.id, 44)} ${pad(r.art, 8)} ${pad(r.ok ? 'ok' : 'ABWEICHUNG', 9)} ${pad(r.ms, 5)} ${r.gefunden.join(' ') || '–'} / ${verdict}`);
  for (const p of r.probleme) console.log(`    ! ${p}`);
}
const failed = results.filter((r) => !r.ok);
console.log('');
console.log(`Ergebnis: ${results.length - failed.length} von ${results.length} Fällen wie erwartet (${results.filter((r) => r.art === 'gut').length} gut, ${results.filter((r) => r.art === 'schlecht').length} schlecht)`);
console.log(`Regeln mit Gut- und Schlechtfall: ${both.length}`);
console.log(`  ${both.join(' ')}`);
console.log(`Regeln nur mit Schlechtfall: ${onlyBad.length}${onlyBad.length ? `\n  ${onlyBad.join(' ')}` : ''}`);
console.log(`Regeln nur mit Gutfall: ${onlyGood.length}${onlyGood.length ? `\n  ${onlyGood.join(' ')}` : ''}`);
const covered = new Set([...coverage.keys()]);
console.log(`Regeln ohne Fall: ${catalog.rules.length - covered.size} von ${catalog.rules.length}`);
if (jsonOut) {
  await writeFile(resolve(process.cwd(), jsonOut), JSON.stringify({ faelle: results, abdeckung: { gutUndSchlecht: both, nurSchlecht: onlyBad, nurGut: onlyGood, ohneFall: catalog.rules.map((r) => r.id).filter((id) => !covered.has(id)) } }, null, 2) + '\n');
}
process.exit(failed.length ? 1 : 0);
