#!/usr/bin/env node
/**
 * Beleg P19, Abnahme 5: Import einer Tabelle aus LibreOffice (ODS) und Excel-Format (XLSX).
 *
 *   node scripts/p19-import-beleg.mjs [outdir]        (Vorgabe docs/belege/P19/import)
 *
 * Voraussetzung: `npm run build:test -w kern`. Die Quellen sind kern/test/fixtures/p19-quelle.ods und
 * .xlsx (erzeugt mit scripts/p19-importquellen.py in LibreOffice). Für jede Quelle: Import in einen
 * hpro-Container, Bericht (Zusammenfassung und jede eingefrorene Zelle mit Grund), Nachweis, dass
 * jede eingefrorene Zelle im Dokument keine Formel mehr trägt und den Wert der Quelle zeigt, und
 * dass der Hinweis im Dokument dieselben Zahlen nennt wie der Bericht. Exit 1 bei einem Widerspruch.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const { calc, readContainer } = await import(resolve(ROOT, 'kern/build/src/index.js'));
const OUT = resolve(process.argv[2] ?? join(ROOT, 'docs/belege/P19/import'));
mkdirSync(OUT, { recursive: true });

let problems = 0;
const fail = (msg) => {
  problems++;
  console.log(`  FEHLER: ${msg}`);
};

for (const source of ['p19-quelle.ods', 'p19-quelle.xlsx']) {
  const bytes = readFileSync(join(ROOT, 'kern/test/fixtures', source));
  const r = await calc.importSpreadsheet(bytes, { sourceName: source, importedAt: '2026-10-12T11:00:00Z' });
  const target = join(OUT, source.replace(/\.(ods|xlsx)$/, '-$1.hpro'));
  writeFileSync(target, r.bytes);
  writeFileSync(target.replace(/\.hpro$/, '-bericht.json'), JSON.stringify(r.report, null, 2) + '\n');
  const s = r.report.summary;
  console.log(`# ${source} → ${target.slice(ROOT.length + 1)} (${r.bytes.length} Bytes)`);
  console.log(`Bericht: ${s.tables} Tabellen, ${s.cells} Zellen, ${s.formulas} Formeln, übernommen ${s.translated}, als Wert eingefroren ${s.frozen}, Makroteile ${s.macros}, Abweichungen ${r.report.deviations.length}`);
  if (s.translated + s.frozen !== s.formulas) fail(`übernommen + eingefroren (${s.translated + s.frozen}) ≠ Formeln (${s.formulas})`);

  const container = await readContainer(r.bytes);
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(container.files.get('content/index.xhtml')), 'application/xhtml+xml');
  const cells = new Map();
  for (const table of Array.from(doc.getElementsByTagName('table'))) {
    const id = table.getAttribute('id');
    const rows = Array.from(table.getElementsByTagName('tr'));
    rows.forEach((tr, ri) => {
      let col = 0;
      for (const td of Array.from(tr.childNodes).filter((n) => n.nodeType === 1)) {
        cells.set(`${id}.${String.fromCharCode(65 + col)}${ri + 1}`, td);
        col += Number(td.getAttribute('colspan') ?? 1);
      }
    });
  }
  const notice = doc.getElementById('import-hinweis')?.textContent ?? '';
  console.log(`Hinweis im Dokument: ${notice}`);
  if (!notice.includes(`${s.frozen} Formeln sind als Wert eingefroren`) || !notice.includes(`${s.macros} Makro- oder Skriptteile`)) fail('Hinweis und Bericht nennen verschiedene Zahlen');
  const reportFile = container.files.get('data/import-report.json');
  if (!reportFile) fail('data/import-report.json fehlt im Container');
  else if (JSON.stringify(JSON.parse(new TextDecoder().decode(reportFile))) !== JSON.stringify(r.report)) fail('Bericht im Container weicht ab');

  console.log('');
  console.log('Eingefroren (Zelle | Formel der Quelle | Grund | Wert im Dokument | Formel im Dokument)');
  for (const f of r.report.frozen) {
    if (f.address === '(Container)') {
      console.log(`  (Container) | – | ${f.reason} | ${f.value} | nicht übernommen`);
      continue;
    }
    const key = f.address.split('#')[1];
    const td = cells.get(key);
    const formula = td?.getAttribute('data-hp-formula');
    const value = td?.getAttribute('data-hp-value');
    console.log(`  ${key} | ${f.formula} | ${f.reason}${f.detail ? ` (${f.detail})` : ''} | ${value} | ${formula ?? 'keine'}`);
    if (!td) fail(`${key} nicht im Dokument`);
    else {
      if (formula) fail(`${key} trägt noch eine Formel`);
      if (td.getAttribute('data-hp-import') !== 'frozen') fail(`${key} ist nicht als eingefroren gekennzeichnet`);
      if (value !== f.value) fail(`${key}: Wert ${value} statt ${f.value}`);
    }
  }
  console.log('');
}
console.log(problems === 0 ? 'Import-Beleg: jede nicht unterstützte Formel ist als Wert eingefroren, gekennzeichnet und im Bericht genannt.' : `Import-Beleg: ${problems} Widerspruch/Widersprüche`);
process.exit(problems === 0 ? 0 : 1);
