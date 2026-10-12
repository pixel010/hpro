/**
 * `hpro calc …`: the calculator on the command line (part 3, package P19).
 *
 *   hpro calc functions                         supported functions (list 8.2)
 *   hpro calc eval "<formula>"                  evaluate a formula without cells
 *   hpro calc show <file> [--rendition ID]      tables, formulas, stored and calculated values, checks
 *   hpro calc recalc <in> <out> --time ISO [--set table.A1=value]... [--note TEXT]
 *                                               fill input cells, calculate, write values, computedAt, history
 *   hpro calc check <file> [--rendition ID] [--json]
 *                                               hashes of the version and stored against calculated values
 *   hpro calc freeze <in> <out> --id ID --time ISO [--profile static|signed]
 *                                               add a frozen rendition under renditions/<id>/
 *   hpro calc export <file> --format csv|json|ods|fods [--table ID] [--rendition ID] [--out FILE]
 *   hpro calc import <source.ods|.fods|.xlsx> <out> --time ISO [--title T] [--report FILE]
 *
 * Exit codes: 0 ok, 1 check found deviations or hash failures, 2 usage or format error.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { calc, readContainer } from '../src/index.js';

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

function show(v: calc.Scalar): string {
  if (typeof v === 'number') return calc.canonicalNumber(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (calc.isError(v)) return v.name;
  if (v === calc.EMPTY) return '(leer)';
  return JSON.stringify(v);
}

function options(args: string[], flags: string[], multi: string[] = []): { pos: string[]; opt: Map<string, string>; many: Map<string, string[]>; bool: Set<string> } {
  const pos: string[] = [];
  const opt = new Map<string, string>();
  const many = new Map<string, string[]>();
  const bool = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (multi.includes(a)) (many.get(a) ?? many.set(a, []).get(a)!).push(args[++i]!);
    else if (flags.includes(a)) opt.set(a, args[++i]!);
    else if (a === '--json') bool.add(a);
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else pos.push(a);
  }
  return { pos, opt, many, bool };
}

async function documents(file: string, rendition: string | null): Promise<Array<{ path: string; doc: calc.CalcDocument }>> {
  const c = await readContainer(await readFile(file));
  let readingOrder = c.manifest.readingOrder;
  if (rendition !== null) {
    const m = c.files.get(`renditions/${rendition}/manifest.json`);
    if (!m) throw new Error(`rendition ${rendition} not found`);
    readingOrder = JSON.parse(new TextDecoder().decode(m)).readingOrder;
  }
  const out: Array<{ path: string; doc: calc.CalcDocument }> = [];
  for (const item of readingOrder) {
    const bytes = c.files.get(item.url);
    if (!bytes || item.type !== 'application/xhtml+xml') continue;
    const dom = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xhtml+xml') as unknown as calc.DomDocument;
    out.push({ path: item.url, doc: new calc.CalcDocument(dom) });
  }
  return out;
}

async function showCmd(args: string[]): Promise<number> {
  const { pos, opt } = options(args, ['--rendition']);
  if (pos.length !== 1) return usage();
  const rendition = opt.get('--rendition') ?? null;
  for (const { path, doc } of await documents(pos[0]!, rendition)) {
    if (!doc.hasCalculation) continue;
    const stored = new Map(doc.workbook.formulaCells.map((c) => [c, (c.element as calc.DomElement).getAttribute('data-hp-value')]));
    const r = doc.recalc();
    console.log(`${path}: ${doc.tables.length} Tabellen, ${r.formulas} Formeln, ${r.checks} Prüfregeln${r.circular.length ? `, ${r.circular.length} im Zirkel` : ''}`);
    for (const t of doc.tables) {
      console.log(`  Tabelle ${t.key} (${t.rows} Zeilen × ${t.cols} Spalten)${t.stale ? ' [data-hp-stale]' : ''}`);
      for (const cell of [...t.cells.values()].sort((a, b) => a.row - b.row || a.col - b.col)) {
        if (cell.formula === null && !cell.input && cell.check === null) continue;
        const addr = calc.cellAddress(cell.row, cell.col).padEnd(5);
        if (cell.formula !== null) {
          const s = stored.get(cell) ?? '(fehlt)';
          const now = calc.storedForm(cell.value, cell.declaredType).value;
          console.log(`    ${addr} ${cell.formula}  gespeichert ${s}  berechnet ${now}${s === now ? '' : '  ABWEICHUNG'}`);
        } else if (cell.input) {
          console.log(`    ${addr} Eingabe (${cell.declaredType ?? 'Text'}) = ${show(cell.value)}`);
        }
        if (cell.check) console.log(`    ${addr} Prüfregel ${cell.check.formula} → ${cell.check.result === true ? 'erfüllt' : `nicht erfüllt (${cell.check.message ?? cell.check.result})`}`);
      }
    }
  }
  return 0;
}

async function recalcCmd(args: string[]): Promise<number> {
  const { pos, opt, many } = options(args, ['--time', '--note'], ['--set']);
  if (pos.length !== 2 || !opt.get('--time')) return usage();
  const set = (many.get('--set') ?? []).map((s) => {
    const eq = s.indexOf('=');
    if (eq < 0) throw new Error(`--set needs table.A1=value, got ${s}`);
    return { address: s.slice(0, eq), value: s.slice(eq + 1) };
  });
  const note = opt.get('--note');
  const r = await calc.recalculateContainer(await readFile(pos[0]!), { computedAt: opt.get('--time')!, set, ...(note ? { note } : {}) });
  await writeFile(pos[1]!, r.bytes);
  console.log(`${pos[1]}  ${r.bytes.length} bytes  sha256=${sha256(r.bytes)}`);
  for (const d of r.documents) {
    console.log(`${d.path}: ${d.formulas} Formeln berechnet; Eingaben: [${d.inputs.join(', ')}]; geänderte Formelzellen: [${d.changed.join(', ')}]`);
    for (const x of d.deviations) console.log(`  beim Öffnen abweichend: ${x.address} ${x.formula} gespeichert ${x.stored}, berechnet ${x.computed}`);
    for (const c of d.checks) console.log(`  Prüfregel ${c.address}: ${c.ok ? 'erfüllt' : `NICHT erfüllt – ${c.message}`}`);
    if (d.circular.length) console.log(`  Zirkelbezug (#CIRC!): [${d.circular.join(', ')}]`);
  }
  const m = r.manifest as { computedAt: string; calculator: unknown; history: Array<{ version: number; note: string }> };
  console.log(`manifest: computedAt ${m.computedAt}, calculator ${JSON.stringify(m.calculator)}, history v${m.history.at(-1)!.version}: ${m.history.at(-1)!.note}`);
  return 0;
}

async function checkCmd(args: string[]): Promise<number> {
  const { pos, opt, bool } = options(args, ['--rendition']);
  if (pos.length !== 1) return usage();
  const r = await calc.inspectCalculation(await readFile(pos[0]!), opt.get('--rendition') ?? null);
  const deviations = r.documents.reduce((n, d) => n + d.deviations.length, 0);
  const ok = r.integrity.ok && deviations === 0;
  if (bool.has('--json')) {
    console.log(JSON.stringify(r, null, 2));
    return ok ? 0 : 1;
  }
  console.log(`Fassung: ${r.rendition ?? 'Hauptfassung'} (${r.manifestPath})`);
  console.log(`computedAt: ${r.computedAt ?? '(fehlt)'}  calculator: ${r.calculator ? JSON.stringify(r.calculator) : '(fehlt)'}`);
  const bad = r.integrity.resources.filter((x) => x.status !== 'ok');
  console.log(`Hash-Prüfung: ${r.integrity.ok ? 'OK' : 'FEHLGESCHLAGEN'} (${r.integrity.resources.length} Dateien${bad.length ? `, verändert/fehlend: ${bad.map((b) => `${b.path} [${b.status}]`).join(', ')}` : ''})`);
  for (const d of r.documents) {
    console.log(`${d.path}: ${d.formulas} Formeln, ${d.deviations.length} Abweichungen zwischen gespeichertem und nachgerechnetem Wert`);
    for (const x of d.deviations) console.log(`  ABWEICHUNG ${x.address} ${x.formula}: gespeichert ${x.stored}, nachgerechnet ${x.computed}`);
    if (d.notComputed.length) console.log(`  nicht berechnet: [${d.notComputed.join(', ')}]`);
    if (d.stale.length) console.log(`  möglicherweise veraltet: [${d.stale.join(', ')}]`);
  }
  console.log(`Ergebnis: ${ok ? 'unverändert' : 'VERÄNDERT oder abweichend'}`);
  return ok ? 0 : 1;
}

async function freezeCmd(args: string[]): Promise<number> {
  const { pos, opt } = options(args, ['--id', '--time', '--profile']);
  if (pos.length !== 2 || !opt.get('--id') || !opt.get('--time')) return usage();
  const profile = (opt.get('--profile') ?? 'static') as 'static' | 'signed';
  const r = await calc.freezeContainer(await readFile(pos[0]!), { id: opt.get('--id')!, createdAt: opt.get('--time')!, profile });
  await writeFile(pos[1]!, r.bytes);
  console.log(`${pos[1]}  ${r.bytes.length} bytes  sha256=${sha256(r.bytes)}`);
  console.log(`eingefrorene Fassung ${opt.get('--id')} (Profil ${profile}), ${r.files.length} Dateien:`);
  for (const f of r.files) console.log(`  ${f}`);
  for (const d of r.documents) console.log(`${d.path}: ${d.formulas} Formelwerte festgeschrieben; Prüfregeln ${d.checks.filter((c) => c.ok).length}/${d.checks.length} erfüllt`);
  return 0;
}

async function exportCmd(args: string[]): Promise<number> {
  const { pos, opt } = options(args, ['--format', '--table', '--rendition', '--out', '--doc']);
  const format = opt.get('--format') as calc.ExportFormat | undefined;
  if (pos.length !== 1 || !format || !['csv', 'json', 'ods', 'fods'].includes(format)) return usage();
  const docs = (await documents(pos[0]!, opt.get('--rendition') ?? null)).filter((d) => d.doc.tables.length > 0 && (!opt.get('--doc') || d.path === opt.get('--doc')));
  if (docs.length === 0) throw new Error('no document with tables');
  const { doc } = docs[0]!;
  if (!opt.get('--rendition')) doc.recalc();
  const bytes = await calc.exportTables(doc, format, opt.get('--table'));
  const out = opt.get('--out');
  if (out) {
    await writeFile(out, bytes);
    console.log(`${out}  ${bytes.length} bytes  sha256=${sha256(bytes)}`);
  } else process.stdout.write(bytes);
  return 0;
}

async function importCmd(args: string[]): Promise<number> {
  const { pos, opt } = options(args, ['--time', '--title', '--report', '--lang']);
  if (pos.length !== 2 || !opt.get('--time')) return usage();
  const title = opt.get('--title');
  const lang = opt.get('--lang');
  const r = await calc.importSpreadsheet(await readFile(pos[0]!), { sourceName: basename(pos[0]!), importedAt: opt.get('--time')!, ...(title ? { title } : {}), ...(lang ? { language: lang } : {}) });
  await writeFile(pos[1]!, r.bytes);
  if (opt.get('--report')) await writeFile(opt.get('--report')!, JSON.stringify(r.report, null, 2) + '\n');
  const s = r.report.summary;
  console.log(`${pos[1]}  ${r.bytes.length} bytes  sha256=${sha256(r.bytes)}`);
  console.log(`Quelle ${r.report.source} (${r.report.format}): ${s.tables} Tabellen, ${s.cells} Zellen, ${s.formulas} Formeln, davon ${s.translated} übernommen, ${s.frozen} als Wert eingefroren; ${s.macros} Makroteile nicht übernommen`);
  for (const f of r.report.frozen) console.log(`  eingefroren [${f.reason}] ${f.address}  ${f.formula}  Wert ${f.value}${f.detail ? `  (${f.detail})` : ''}`);
  for (const d of r.report.deviations) console.log(`  Abweichung ${d.address} ${d.formula}: Quelle ${d.source}, hpro ${d.computed}`);
  for (const n of r.report.notes) console.log(`  Hinweis ${n.address}: ${n.note}`);
  return 0;
}

function usage(): number {
  console.error(
    'usage: hpro calc functions | eval "<formula>" | show <file> [--rendition ID] | recalc <in> <out> --time ISO [--set table.A1=value]... | ' +
      'check <file> [--rendition ID] [--json] | freeze <in> <out> --id ID --time ISO [--profile static|signed] | ' +
      'export <file> --format csv|json|ods|fods [--table ID] [--rendition ID] [--out FILE] | import <source> <out> --time ISO [--title T] [--report FILE]',
  );
  return 2;
}

export async function calcCommand(args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'functions':
      console.log(`${calc.SUPPORTED_FUNCTIONS.length} Funktionen (${calc.CALCULATOR.name} ${calc.CALCULATOR.version}, Teil 3 v${calc.CALCULATOR.spec}):`);
      console.log(calc.SUPPORTED_FUNCTIONS.join(' '));
      return 0;
    case 'eval':
      if (rest.length !== 1) return usage();
      console.log(show(calc.evaluateStandalone(rest[0]!)));
      return 0;
    case 'show':
      return showCmd(rest);
    case 'recalc':
      return recalcCmd(rest);
    case 'check':
      return checkCmd(rest);
    case 'freeze':
      return freezeCmd(rest);
    case 'export':
      return exportCmd(rest);
    case 'import':
      return importCmd(rest);
    default:
      return usage();
  }
}
