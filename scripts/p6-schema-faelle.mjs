#!/usr/bin/env node
/**
 * Schemafälle P6: node scripts/p6-schema-faelle.mjs <export.json> <schema.json> <out-dir>
 *
 * Schreibt aus einem gültigen Export (Status submitted) abgewandelte Datenobjekte, je eines mit
 * einem Fehler, den das Schema des Beispiels erkennen muss, dazu den gültigen Export und einen
 * leeren Entwurf, und prüft jedes mit dem JSON-Schema-Prüfer des Kerns (kern/dist, form.validateJson,
 * derselbe Prüfer wie beim Absenden und Exportieren). Die Datei
 * <out-dir>/faelle.txt nennt je Fall die Erwartung; scripts/p6-schema-gegenprobe.py prüft dieselben
 * Dateien unabhängig (python-jsonschema, Draft 2020-12).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { form } from '../kern/dist/index.js';

const [exportFile, schemaFile, dir] = process.argv.slice(2);
if (!dir) {
  console.error('usage: node scripts/p6-schema-faelle.mjs <export.json> <schema.json> <out-dir>');
  process.exit(2);
}
const base = JSON.parse(await readFile(exportFile, 'utf8'));
const schema = JSON.parse(await readFile(schemaFile, 'utf8'));
const clone = () => JSON.parse(JSON.stringify(base));
const cases = [
  ['00-export-abgesendet', 'gueltig', 'der Export des abgesendeten Antrags', (d) => d],
  ['01-entwurf-leer', 'gueltig', 'Entwurf: alle Eingaben leer (null)', (d) => ({ form: d.form, document: d.document, status: 'draft', values: Object.fromEntries(Object.entries(d.values).map(([k, v]) => [k, typeof v === 'boolean' ? false : null])) })],
  ['02-eigenmittel-zu-gering', 'ungueltig', 'abgesendet, Eigenmittelquote 15 %', (d) => ((d.values.eigenmittelquote = 0.15), d)],
  ['03-datenschutz-nicht-bestaetigt', 'ungueltig', 'abgesendet, Datenschutz nicht bestätigt', (d) => ((d.values.datenschutz = false), d)],
  ['04-mitantrag-ohne-einkommen', 'ungueltig', 'abgesendet, gemeinsamer Antrag ohne Einkommen der zweiten Person', (d) => ((d.values.mit_einkommen = null), d)],
  ['05-ohne-absendezeit', 'ungueltig', 'Status submitted ohne submittedAt', (d) => (delete d.submittedAt, d)],
  ['06-unbekanntes-feld', 'ungueltig', 'zusätzliches Feld in values', (d) => ((d.values.bonitaet = 'gut'), d)],
  ['07-pflichtfeld-leer', 'ungueltig', 'abgesendet, Nachname leer', (d) => ((d.values.nachname = null), d)],
  ['08-iban-falsch', 'ungueltig', 'IBAN mit 16 Ziffern', (d) => ((d.values.iban = 'AT61 1904 3002 3457'), d)],
  ['09-selbststaendig-ohne-firma', 'ungueltig', 'abgesendet, selbstständig ohne Firma und Gründungsjahr', (d) => ((d.values.beschaeftigung = 'selbststaendig'), (d.values.firmenname = null), (d.values.gruendungsjahr = null), d)],
  ['10-entwurf-mit-zeit', 'ungueltig', 'Entwurf mit submittedAt', (d) => ((d.status = 'draft'), d)],
  ['11-angestellt-mit-firma', 'ungueltig', 'abgesendet, angestellt, aber Firmenangaben gesetzt (Abschnitt gilt nicht)', (d) => ((d.values.beschaeftigung = 'angestellt'), (d.values.firmenname = 'X'), (d.values.gruendungsjahr = 2019), d)],
  ['12-angestellt-ohne-firma', 'gueltig', 'abgesendet, angestellt, Firmenangaben null', (d) => ((d.values.beschaeftigung = 'angestellt'), (d.values.firmenname = null), (d.values.gruendungsjahr = null), d)],
];
await mkdir(dir, { recursive: true });
const lines = [];
let wrong = 0;
for (const [name, expect, what, change] of cases) {
  const data = change(clone());
  const file = join(dir, `${name}.json`);
  await writeFile(file, JSON.stringify(data, null, 2) + '\n');
  const problems = form.validateJson(data, schema);
  const verdict = problems.length === 0 ? 'gueltig' : 'ungueltig';
  if (verdict !== expect) wrong++;
  lines.push(`${name} ${expect}`);
  console.log(`${name.padEnd(34)} erwartet ${expect.padEnd(9)} Kern: ${verdict.padEnd(9)} ${verdict === expect ? 'ok' : 'FALSCH'}  (${what})${problems.length ? `\n${''.padEnd(36)}${problems.slice(0, 2).map((p) => `${p.path}: ${p.message}`).join(' | ')}` : ''}`);
}
await writeFile(join(dir, 'faelle.txt'), lines.join('\n') + '\n');
console.log(`\n${cases.length} Fälle, ${wrong} falsch beurteilt (Kern).`);
process.exit(wrong === 0 ? 0 : 1);
