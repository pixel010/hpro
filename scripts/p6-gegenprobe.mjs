#!/usr/bin/env node
/**
 * Gegenprobe P6: berechnete Felder, Bedingungen und Prüfregeln eines Formulars in LibreOffice.
 *
 *   node scripts/p6-gegenprobe.mjs fods <out-dir> <container.hpro>...
 *       je Container eine Tabelle <name>.fods: Spalte A Feldname, Spalte B Wert (Eingabefeld, wie
 *       der Kern ihn liest; Felder in nicht geltenden Abschnitten leer) oder dieselbe Formel wie im
 *       Dokument (berechnete Felder, Bedingungen, Prüfregeln). Jeder Feldname ist ein benannter
 *       Bereich auf seine Zelle in Spalte B; die Formeln stehen wörtlich wie in data-hp-formula,
 *       data-hp-when und data-hp-check (OpenFormula, Namespace of:).
 *   node scripts/p6-gegenprobe.mjs compare <lo.json> <container.hpro>...
 *       vergleicht die Werte, die LibreOffice berechnet hat (scripts/p19-lo-werte.py), mit denen
 *       des Kerns; Exit 1 bei einer Abweichung.
 *
 * Verwendet kern/dist (npm run build -w kern).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { calc, form, readContainer } from '../kern/dist/index.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function forms(file) {
  const c = await readContainer(await readFile(file));
  const out = [];
  for (const item of c.manifest.readingOrder) {
    const bytes = c.files.get(item.url);
    if (!bytes || item.type !== 'application/xhtml+xml') continue;
    const dom = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xhtml+xml');
    const fd = new form.FormDocument(dom, { documentId: c.manifest.id });
    for (const f of fd.forms) out.push({ fd, f });
  }
  return out;
}

/** Rows of the sheet: fields, then conditions and rules (with a name each for the comparison). */
function rows(fd, f) {
  const list = [];
  for (const field of f.order) {
    const relevant = !field.condition || field.condition.relevant;
    if (field.kind === 'output') list.push({ name: field.name, kind: 'output', formula: field.formula, ours: field.value });
    else list.push({ name: field.name, kind: 'input', type: field.type, value: relevant ? field.value : calc.EMPTY });
  }
  for (const c of f.conditions) list.push({ name: `bedingung_${c.id}`, kind: 'condition', formula: c.formula, ours: c.result });
  for (const c of f.checks) list.push({ name: `regel_${c.id.replace(/-/g, '_')}`, kind: 'check', formula: c.formula, ours: c.result });
  return list;
}

function cell(r) {
  if (r.kind !== 'input') return `<table:table-cell table:formula="of:${esc(r.formula)}"/>`;
  const v = r.value;
  if (v === calc.EMPTY) return '<table:table-cell/>';
  if (typeof v === 'boolean') return `<table:table-cell office:value-type="boolean" office:boolean-value="${v}"><text:p>${v ? 'WAHR' : 'FALSCH'}</text:p></table:table-cell>`;
  if (typeof v === 'string') return `<table:table-cell office:value-type="string"><text:p>${esc(v)}</text:p></table:table-cell>`;
  if (r.type === 'date') return `<table:table-cell office:value-type="date" office:date-value="${calc.isoFromSerial(v).slice(0, 10)}"><text:p>${calc.isoFromSerial(v).slice(0, 10)}</text:p></table:table-cell>`;
  return `<table:table-cell office:value-type="float" office:value="${calc.canonicalNumber(v)}"><text:p>${calc.canonicalNumber(v)}</text:p></table:table-cell>`;
}

function fods(list) {
  const body = list.map((r) => `<table:table-row><table:table-cell office:value-type="string"><text:p>${esc(r.name)}</text:p></table:table-cell>${cell(r)}</table:table-row>`).join('\n');
  const names = list.map((r, i) => `<table:named-range table:name="${esc(r.name)}" table:base-cell-address="$Formular.$A$1" table:cell-range-address="$Formular.$B$${i + 1}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2" office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.spreadsheet">
<office:body><office:spreadsheet>
<table:table table:name="Formular">
<table:table-column table:number-columns-repeated="2"/>
${body}
</table:table>
<table:named-expressions>
${names}
</table:named-expressions>
</office:spreadsheet></office:body></office:document>
`;
}

function show(v) {
  if (v === null) return 'nicht anwendbar';
  if (v === calc.EMPTY) return '(leer)';
  if (typeof v === 'number') return calc.canonicalNumber(v);
  if (typeof v === 'boolean') return v ? 'WAHR' : 'FALSCH';
  return String(v);
}

const [mode, ...args] = process.argv.slice(2);
if (mode === 'fods') {
  const [dir, ...files] = args;
  await mkdir(dir, { recursive: true });
  for (const file of files) {
    for (const { fd, f } of await forms(file)) {
      const out = join(dir, `${basename(file, '.hpro')}-${f.id}.fods`);
      await writeFile(out, fods(rows(fd, f)));
      console.log(`${out}: ${rows(fd, f).length} Zeilen (${f.order.length} Felder, ${f.conditions.length} Bedingungen, ${f.checks.length} Prüfregeln)`);
    }
  }
} else if (mode === 'compare') {
  const [loFile, ...files] = args;
  const lo = JSON.parse(await readFile(loFile, 'utf8'));
  console.log(`LibreOffice: ${lo.office}`);
  let deviations = 0;
  let compared = 0;
  for (const file of files) {
    for (const { fd, f } of await forms(file)) {
      const key = `${basename(file, '.hpro')}-${f.id}.fods`;
      const cells = lo.files[key]?.cells ?? [];
      const list = rows(fd, f);
      console.log(`\n${key} (${cells.length} Formelzellen in LibreOffice neu berechnet in ${lo.files[key]?.calculateAllMs} ms)`);
      console.log(`${'Name'.padEnd(34)} ${'Kern'.padEnd(16)} ${'LibreOffice'.padEnd(16)} Ergebnis`);
      list.forEach((r, i) => {
        if (r.kind === 'input') return;
        const c = cells.find((x) => x.address === `B${i + 1}`);
        let theirs = '(fehlt)';
        let same = false;
        const ours = r.ours;
        if (c?.errorName) {
          theirs = c.errorName;
          same = calc.isError(ours) && ours.name === c.errorName;
        } else if (c?.value !== undefined) {
          const v = Number(c.value);
          if (r.kind === 'output') {
            theirs = calc.canonicalNumber(v);
            same = typeof ours === 'number' && ours === v;
          } else {
            theirs = v !== 0 ? 'WAHR' : 'FALSCH';
            same = ours === null ? true : (ours === true) === (v !== 0);
          }
        } else if (c?.string !== undefined) {
          theirs = JSON.stringify(c.string);
          same = ours === c.string;
        }
        if (r.kind === 'check' && ours === null) theirs += ' (nicht verglichen)';
        else compared++;
        if (!same) deviations++;
        console.log(`${r.name.padEnd(34)} ${show(ours).padEnd(16)} ${theirs.padEnd(16)} ${same ? 'gleich' : 'ABWEICHUNG'}`);
      });
    }
  }
  console.log(`\n${compared} Werte verglichen, ${deviations} Abweichungen.`);
  process.exit(deviations === 0 ? 0 : 1);
} else {
  console.error('usage: node scripts/p6-gegenprobe.mjs fods <out-dir> <container>... | compare <lo.json> <container>...');
  process.exit(2);
}
