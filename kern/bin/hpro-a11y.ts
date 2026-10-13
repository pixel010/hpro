/**
 * `hpro a11y …`: accessibility check with direct corrections (package P8).
 *
 *   hpro a11y check <file> [--json]
 *       structure, reading order, alternative texts, contrast (all reader colour schemes),
 *       language, table headers and focus; every finding with WCAG criterion and proposal
 *   hpro a11y fix <in> <out> --at ISO [--only ID]... [--value ID=TEXT]... [--no-proposals] [--json]
 *       applies the proposals (all, or the given ids) as editing operations, checks again after
 *       each one and writes a new version with history entry; `--value` enters the value of a
 *       proposal that needs input (alt text, caption, language), `--no-proposals` uses only
 *       entered values
 *
 * Exit codes: check 0 = no findings, 1 = findings; fix 0 = every selected finding corrected,
 * 1 = some left (listed); 2 usage or format error.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { a11y } from '../src/index.js';

class UsageError extends Error {}

const USAGE = 'usage: hpro a11y check <file> [--json] | hpro a11y fix <in> <out> --at ISO [--only ID]... [--value ID=TEXT]... [--no-proposals] [--json]';

function printReport(r: a11y.A11yReport): void {
  console.log(`checker: ${r.checker}`);
  console.log(`documents: ${r.documents.join(', ')}`);
  console.log(`stylesheets: ${r.stylesheets.join(', ') || '–'}`);
  console.log(`colour schemes: ${r.schemes.join(', ')}`);
  console.log('');
  console.log('Kategorie          Befunde  Regeln');
  for (const c of a11y.CATEGORIES) console.log(`${a11y.CATEGORY_LABEL[c].padEnd(18)} ${String(r.counts[c]).padStart(7)}  ${r.rules[c].join(', ')}`);
  for (const c of a11y.CATEGORIES) {
    const fs = r.findings.filter((f) => f.category === c);
    if (fs.length === 0) continue;
    console.log('');
    console.log(`--- ${a11y.CATEGORY_LABEL[c]} (${fs.length})`);
    for (const f of fs) {
      console.log(`[${f.severity}] ${f.rule}  ${f.target ?? f.path}${f.line ? `  (${f.path}, Zeile ${f.line})` : ''}  WCAG ${f.wcag.join(', ')}${f.spec ? `, ${f.spec}` : ''}`);
      console.log(`  ${f.message}`);
      if (f.excerpt) console.log(`  Auszug: ${f.excerpt}`);
      if (f.fix) {
        console.log(`  Vorschlag: ${f.fix.label} – ${f.fix.description}`);
        if (f.fix.input) console.log(`  Eingabe: ${f.fix.input.label}${f.fix.input.proposal !== undefined ? `; vorgeschlagen „${f.fix.input.proposal}“ (${f.fix.input.source})` : '; kein Vorschlag, Wert nötig (--value)'}`);
        console.log(`  Operationen: ${JSON.stringify(f.fix.ops)}`);
      } else console.log(`  kein Vorschlag: ${f.blocked ?? '–'}`);
      console.log(`  id: ${f.id}`);
    }
  }
  console.log('');
  console.log('Nicht geprüft:');
  for (const n of r.notChecked) console.log(`  - ${n.what}: ${n.why}`);
  const cats = a11y.CATEGORIES.filter((c) => r.counts[c] > 0).length;
  console.log('');
  console.log(`result: ${r.findings.length} Befund${r.findings.length === 1 ? '' : 'e'} in ${cats} Kategorie${cats === 1 ? '' : 'n'}`);
}

async function check(args: string[]): Promise<number> {
  const json = args.includes('--json');
  const pos = args.filter((a) => a !== '--json');
  if (pos.length !== 1 || pos[0]!.startsWith('--')) throw new UsageError(USAGE);
  const bytes = await readFile(pos[0]!);
  const t0 = performance.now();
  const r = await a11y.auditContainer(bytes);
  const ms = performance.now() - t0;
  if (json) console.log(JSON.stringify({ file: pos[0], ...r }, null, 2));
  else {
    console.log(`file: ${pos[0]} (${bytes.length} bytes)`);
    printReport(r);
    console.log(`check took ${ms.toFixed(0)} ms`);
  }
  return r.findings.length === 0 ? 0 : 1;
}

async function fix(args: string[]): Promise<number> {
  const pos: string[] = [];
  const only: string[] = [];
  const values = new Map<string, string>();
  let at: string | undefined;
  let json = false;
  let useProposals = true;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--only') only.push(args[++i] ?? '');
    else if (a === '--value') {
      const v = args[++i] ?? '';
      const eq = v.indexOf('=');
      if (eq <= 0) throw new UsageError('--value ID=TEXT');
      values.set(v.slice(0, eq), v.slice(eq + 1));
    } else if (a === '--at') at = args[++i];
    else if (a === '--json') json = true;
    else if (a === '--no-proposals') useProposals = false;
    else if (a.startsWith('--')) throw new UsageError(`unknown option ${a}\n${USAGE}`);
    else pos.push(a);
  }
  if (pos.length !== 2 || !at) throw new UsageError(USAGE);
  const bytes = await readFile(pos[0]!);
  const out = await a11y.fixContainer(bytes, { select: only.length > 0 ? only : 'all', values, useProposals, at });
  if (out.saved) await writeFile(pos[1]!, out.saved.bytes);
  if (json) {
    console.log(JSON.stringify({ input: pos[0], output: out.saved ? pos[1] : null, version: out.saved?.version ?? null, applied: out.applied.map((a) => ({ id: a.finding.id, rule: a.finding.rule, category: a.finding.category, value: a.value ?? null, results: a.results.map((r) => r.summary) })), skipped: out.skipped.map((s) => ({ id: s.finding.id, reason: s.reason })), before: out.before.counts, after: out.after.counts, remaining: out.after.findings.map((f) => f.id) }, null, 2));
  } else {
    console.log(`input: ${pos[0]}  (${out.before.findings.length} Befunde)`);
    for (const a of out.applied) {
      console.log(`applied ${a.finding.id}${a.value !== undefined ? `  Wert „${a.value}“` : ''}`);
      for (const r of a.results) console.log(`  ${r.summary}`);
    }
    for (const s of out.skipped) console.log(`skipped ${s.finding.id}: ${s.reason}`);
    if (out.saved) console.log(`output: ${pos[1]}  ${out.saved.bytes.length} bytes, Fassung ${out.saved.version}, geändert: ${out.saved.changedFiles.join(', ')}`);
    else console.log('output: nichts geschrieben (keine Korrektur angewendet)');
    console.log(`after: ${out.after.findings.length} Befunde${out.after.findings.length ? ` (${out.after.findings.map((f) => f.id).join(', ')})` : ''}`);
  }
  const selected = only.length > 0 ? new Set(only) : undefined;
  const left = out.after.findings.filter((f) => !selected || selected.has(f.id));
  return left.length === 0 && out.skipped.length === 0 ? 0 : 1;
}

export async function a11yCommand(args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  try {
    if (sub === 'check') return await check(rest);
    if (sub === 'fix') return await fix(rest);
    throw new UsageError(USAGE);
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(e.message);
      return 2;
    }
    throw e;
  }
}
