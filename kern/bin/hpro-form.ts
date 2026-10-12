/**
 * `hpro form …`: forms with calculation, conditions and validation (package P6, HPC-0009).
 *
 *   hpro form show <file> [--json]
 *       forms, fields with values, calculated fields, conditions, check rules, what prevents submitting
 *   hpro form fill <in> <out> --time ISO [--set [form.]field=value]... [--values-file F]
 *       entries as typed (1.234,50 · 12.10.2026 · ja), recalculated, saved as draft
 *   hpro form submit <in> <out> --time ISO [--set …]... [--values-file F] [--form ID]... [--export data.json]
 *       validate and submit; refused (exit 1, nothing written) unless every check passes
 *   hpro form check <file> [--json]
 *       validate as for submitting, without writing; exit 1 when something prevents submitting
 *   hpro form export <file> <out.json> [--form ID]
 *       data object as JSON, validated against the schema of the data file; refused when invalid
 *
 * `--values-file` holds a JSON object `{ "field": "entry", … }` (or `"form.field"` keys); values
 * that are not strings are written in canonical form. Exit codes: 0 ok, 1 refused or problems
 * found, 2 usage or format error.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { form } from '../src/index.js';

function parse(args: string[], flags: string[], multi: string[]): { pos: string[]; opt: Map<string, string>; many: Map<string, string[]>; json: boolean } {
  const pos: string[] = [];
  const opt = new Map<string, string>();
  const many = new Map<string, string[]>();
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (multi.includes(a)) (many.get(a) ?? many.set(a, []).get(a)!).push(args[++i] ?? '');
    else if (flags.includes(a)) opt.set(a, args[++i] ?? '');
    else if (a === '--json') json = true;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else pos.push(a);
  }
  return { pos, opt, many, json };
}

function entry(key: string, value: string): form.FormEntry {
  const dot = key.indexOf('.');
  return dot > 0 ? { form: key.slice(0, dot), field: key.slice(dot + 1), value } : { field: key, value };
}

async function entries(many: Map<string, string[]>, opt: Map<string, string>): Promise<form.FormEntry[]> {
  const out: form.FormEntry[] = [];
  const file = opt.get('--values-file');
  if (file) {
    const obj = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) out.push(entry(k, typeof v === 'string' ? v : v === null ? '' : String(v)));
  }
  for (const s of many.get('--set') ?? []) {
    const eq = s.indexOf('=');
    if (eq <= 0) throw new Error(`--set expects [form.]field=value, got ${s}`);
    out.push(entry(s.slice(0, eq), s.slice(eq + 1)));
  }
  return out;
}

function printProblems(problems: readonly form.FormProblem[]): void {
  for (const p of problems) console.log(`  ✗ [${p.code}] ${p.field ? `${p.form}.${p.field}` : p.check ? `${p.form}#${p.check}` : p.form}: ${p.message}`);
}

function printReport(r: form.FormReport): void {
  console.log(`Formular ${r.id} in ${r.document}: Daten ${r.dataPath}, Schema ${r.schemaPath ?? '(keins)'}, Status ${r.status ?? '(keine Daten)'}${r.submittedAt ? ` (${r.submittedAt})` : ''}`);
  for (const f of r.fields) {
    const flags = [f.required ? 'Pflicht' : '', f.relevant ? '' : 'entfällt', f.formula ? `= ${f.formula}` : ''].filter(Boolean).join(', ');
    console.log(`  ${f.name.padEnd(22)} ${f.kind.padEnd(8)} ${f.type.padEnd(10)} ${JSON.stringify(f.value)}${f.text && f.text !== String(f.value ?? '') ? `  „${f.text}“` : ''}${flags ? `  [${flags}]` : ''}`);
  }
  for (const c of r.conditions) console.log(`  Bedingung #${c.id} ${c.formula} → ${c.relevant ? 'gilt' : 'gilt nicht (Abschnitt entfällt)'}`);
  for (const c of r.checks) console.log(`  Prüfregel #${c.id} ${c.formula} → ${c.result === null ? 'nicht anwendbar' : c.result === true ? 'erfüllt' : `NICHT erfüllt (${c.result === false ? c.message : c.result})`}`);
  for (const c of r.consistency) console.log(`  ! ${c}`);
  if (r.problems.length === 0) console.log('  Absenden möglich: alle Prüfungen erfüllt.');
  else {
    console.log(`  Absenden nicht möglich: ${r.problems.length} Problem${r.problems.length === 1 ? '' : 'e'}`);
    printProblems(r.problems);
  }
}

async function show(args: string[], check: boolean): Promise<number> {
  const { pos, json } = parse(args, [], []);
  if (pos.length !== 1) return usage();
  const reports = await form.inspectForms(await readFile(pos[0]!));
  if (json) console.log(JSON.stringify(reports, null, 2));
  else for (const r of reports) printReport(r);
  if (reports.length === 0) console.log('keine Formulare (form[data-hp-form])');
  return check && reports.some((r) => r.problems.length > 0 || r.consistency.length > 0) ? 1 : 0;
}

async function fill(args: string[], submit: boolean): Promise<number> {
  const { pos, opt, many } = parse(args, ['--time', '--values-file', '--export', '--note'], ['--set', '--form']);
  const time = opt.get('--time');
  if (pos.length !== 2 || !time) return usage();
  const set = await entries(many, opt);
  try {
    const r = await form.fillForms(await readFile(pos[0]!), { set, submit, time, ...(many.get('--form') ? { forms: many.get('--form')! } : {}), ...(opt.get('--note') ? { note: opt.get('--note')! } : {}) });
    await writeFile(pos[1]!, r.bytes);
    console.log(`${pos[1]}: ${r.bytes.length} Bytes, ${set.length} Eingaben, ${submit ? 'abgesendet' : 'als Entwurf gespeichert'}`);
    for (const rep of r.forms) printReport(rep);
    const out = opt.get('--export');
    if (out) {
      const ids = submit ? [...r.data.values()].map((d) => d.form) : [];
      const e = await form.exportFormData(r.bytes, ids.length === 1 ? ids[0] : (many.get('--form')?.[0] ?? undefined));
      await writeFile(out, e.json);
      console.log(`Datenexport ${out}: Formular ${e.form}, Status ${e.data.status}, geprüft gegen ${e.schemaPath}`);
    }
    return 0;
  } catch (err) {
    if (err instanceof form.FormRejected) {
      console.log(`ERROR [${submit ? 'abgelehnt' : 'ungültig'}]: ${err.message}; ${pos[1]} wurde nicht geschrieben`);
      printProblems(err.problems);
      return 1;
    }
    throw err;
  }
}

async function exportCmd(args: string[]): Promise<number> {
  const { pos, opt } = parse(args, ['--form'], []);
  if (pos.length !== 2) return usage();
  try {
    const e = await form.exportFormData(await readFile(pos[0]!), opt.get('--form'));
    await writeFile(pos[1]!, e.json);
    console.log(`${pos[1]}: Formular ${e.form}, Status ${e.data.status}, ${Object.keys(e.data.values).length} Werte, geprüft gegen ${e.schemaPath}`);
    return 0;
  } catch (err) {
    if (err instanceof form.FormRejected) {
      console.log(`ERROR [schema]: Export abgelehnt, ${pos[1]} wurde nicht geschrieben`);
      printProblems(err.problems);
      return 1;
    }
    throw err;
  }
}

function usage(): number {
  console.error('usage: hpro form show|check <file> [--json] | fill|submit <in> <out> --time ISO [--set [form.]field=value]... [--values-file F] [--export out.json] | export <file> <out.json> [--form ID]');
  return 2;
}

export async function formCommand(args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'show':
      return show(rest, false);
    case 'check':
      return show(rest, true);
    case 'fill':
      return fill(rest, false);
    case 'submit':
      return fill(rest, true);
    case 'export':
      return exportCmd(rest);
    default:
      return usage();
  }
}
