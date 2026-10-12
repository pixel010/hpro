/**
 * `hpro annotate …`: annotations, review threads, export, import and comparison (package P7,
 * HPC-0010).
 *
 *   hpro annotate list <file> [--json] [--status open|resolved]
 *       threads with status, replies, anchor (verankert/verschoben/verwaist) and protection
 *   hpro annotate add <in> <out> --target path#id --author NAME --time ISO
 *                     [--text T] [--quote PASSAGE [--occurrence N] | --range START-END]
 *                     [--highlight gelb|gruen|blau|rosa] [--ink "M x y L x y;M …" [--color rot|blau]]
 *       a comment (text), a highlight (quote + colour, optional text) or a freehand drawing
 *   hpro annotate reply <in> <out> --to ID --text T --author NAME --time ISO
 *   hpro annotate resolve|reopen <in> <out> --to ID --author NAME --time ISO [--text T]
 *       review status as a reply that sets `hp:status`
 *   hpro annotate edit <in> <out> --id ID --text T --time ISO
 *   hpro annotate delete <in> <out> --id ID --time ISO        (replies go with it)
 *   hpro annotate export <file> <out.jsonld|.csv|.xhtml> [--format jsonld|csv|xhtml] [--time ISO]
 *   hpro annotate import <in> <from.jsonld|from.hpro> <out> --time ISO
 *       take over the annotations of an export or of another copy (merge, nothing lost silently)
 *   hpro annotate check <file>
 *       every file under annotations/ against the W3C model and this profile, anchors; exit 1 on problems
 *   hpro annotate compare <older> <newer> | <file> --from N --to M [--json]
 *       text and structure comparison plus annotation changes and affected threads
 *
 * Ids: without `--id` a deterministic UUID (version 8) from kind, target, text, author and time,
 * so evidence runs write identical files; `--random-id` uses a random one like the reader.
 * Exit codes: 0 ok, 1 refused or problems found, 2 usage or format error.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { annotate, edit, readContainer } from '../src/index.js';

const GENERATOR = 'hpro annotate 0.1.0';

function parse(args: string[], flags: string[]): { pos: string[]; opt: Map<string, string>; json: boolean; random: boolean } {
  const pos: string[] = [];
  const opt = new Map<string, string>();
  let json = false;
  let random = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (flags.includes(a)) opt.set(a, args[++i] ?? '');
    else if (a === '--json') json = true;
    else if (a === '--random-id') random = true;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else pos.push(a);
  }
  return { pos, opt, json, random };
}

function need(opt: Map<string, string>, name: string): string {
  const v = opt.get(name);
  if (v === undefined || v === '') throw new UsageError(`${name} is required`);
  return v;
}

class UsageError extends Error {}

async function newId(random: boolean, explicit: string | undefined, seed: unknown): Promise<string> {
  if (explicit) return explicit;
  return random ? annotate.randomId() : annotate.deterministicId(JSON.stringify(seed));
}

const ANCHOR = { exact: 'verankert', moved: 'verschoben', orphaned: 'verwaist' } as const;
const one = (s: string, n = 70) => {
  const t = s.replace(/[ \t\n\f\r]+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

async function list(args: string[]): Promise<number> {
  const { pos, opt, json } = parse(args, ['--status']);
  if (pos.length !== 1) return usage();
  const set = await annotate.readAnnotations(await readFile(pos[0]!));
  const want = opt.get('--status');
  const threads = set.threads.filter((t) => !want || t.status === want);
  if (json) {
    console.log(JSON.stringify({ mode: set.mode, threads, orphans: set.orphans, problems: set.problems, items: set.items.map((i) => ({ path: i.path, id: i.info.id, listed: i.listed, signed: i.signed, integrity: i.integrity, anchor: i.anchor })) }, null, 2));
    return set.problems.length > 0 ? 1 : 0;
  }
  const byId = new Map(set.items.map((i) => [i.info.id, i]));
  const prot = (id: string) => {
    const s = byId.get(id)!;
    return s.signed ? 'signiert' : s.listed ? (s.integrity === 'ok' ? 'Hash ok' : 'HASH WEICHT AB') : 'nicht signiert';
  };
  const open = set.threads.filter((t) => t.status === 'open').length;
  console.log(`${pos[0]}: ${set.items.length} Anmerkungen in ${set.threads.length} Threads (${open} offen, ${set.threads.length - open} erledigt); neue Anmerkungen würden ${set.mode === 'listed' ? 'im Hash-Manifest verzeichnet' : 'unverzeichnet (Signatur über manifest.json bleibt gültig)'}`);
  threads.forEach((t) => {
    const r = t.root;
    const a = byId.get(r.id)!.anchor!;
    console.log(`[${annotate.STATUS_LABEL[t.status]}] ${annotate.KIND_LABEL[r.kind]}${r.color ? ` ${r.color}` : ''}${r.ink ? ` ${r.ink.paths.length} Striche ${r.ink.color}` : ''}  ${r.path}#${r.elementId}  ${ANCHOR[a.state]}${a.state === 'moved' && a.elementId !== r.elementId ? ` → #${a.elementId}` : ''}${a.reason ? ` (${a.reason})` : ''}  [${prot(r.id)}]`);
    console.log(`    ${r.id}  ${r.author}  ${r.created}`);
    if (r.quote) console.log(`    Zitat: „${one(r.quote.exact)}“`);
    if (r.text) console.log(`    ${one(r.text, 100)}`);
    for (const x of t.replies) console.log(`    ↳ ${x.author} ${x.created}${x.status ? ` [setzt ${annotate.STATUS_LABEL[x.status]}]` : ''}: ${one(x.text, 90)}  [${prot(x.id)}]`);
  });
  for (const o of set.orphans) console.log(`Antwort ohne Thread: ${o.id} auf ${o.replyTo}: ${one(o.text)}`);
  for (const p of set.problems) console.log(`PROBLEM ${p.path}: ${p.message}`);
  return set.problems.length > 0 ? 1 : 0;
}

async function save(input: string, out: string, changes: annotate.AnnotationChanges, time: string): Promise<number> {
  const r = await annotate.saveAnnotations(await readFile(input), changes, { modified: time });
  await writeFile(out, r.bytes);
  console.log(`${out}: ${r.bytes.length} Bytes, Modus ${r.mode === 'listed' ? 'verzeichnet (resources, package.opf, history)' : 'unverzeichnet (manifest.json unverändert)'}`);
  for (const p of r.added) console.log(`  + ${p}`);
  for (const p of r.replaced) console.log(`  ~ ${p}`);
  for (const p of r.removed) console.log(`  - ${p}`);
  return 0;
}

async function add(args: string[]): Promise<number> {
  const { pos, opt, random } = parse(args, ['--target', '--author', '--time', '--text', '--quote', '--occurrence', '--range', '--highlight', '--ink', '--color', '--id', '--lang']);
  if (pos.length !== 2) return usage();
  const [input, out] = pos as [string, string];
  const target = need(opt, '--target');
  const author = need(opt, '--author');
  const time = need(opt, '--time');
  const c = await readContainer(await readFile(input));
  const index = new annotate.DocumentIndex(c.files);
  let quote: annotate.Quote | undefined;
  if (opt.has('--quote')) quote = annotate.quoteOfText(index, target, opt.get('--quote')!, Number(opt.get('--occurrence') ?? '1'));
  else if (opt.has('--range')) {
    const m = /^(\d+)-(\d+)$/.exec(opt.get('--range')!);
    if (!m) throw new UsageError('--range expects START-END');
    quote = annotate.quoteFor(index, target, Number(m[1]), Number(m[2]));
  }
  const kind = opt.has('--ink') ? 'ink' : opt.has('--highlight') ? 'highlight' : 'comment';
  const text = opt.get('--text');
  const ink = opt.has('--ink') ? { paths: opt.get('--ink')!.split(';').map((s) => s.trim()).filter(Boolean), color: (opt.get('--color') ?? 'rot') as annotate.ColorName } : undefined;
  const id = await newId(random, opt.get('--id'), { kind, target, quote: quote?.exact, text, author, time, ink: ink?.paths });
  const a = annotate.createAnnotation({
    kind,
    address: target,
    ...(quote ? { quote } : {}),
    ...(text !== undefined ? { text } : {}),
    ...(kind === 'highlight' ? { color: opt.get('--highlight') as annotate.ColorName } : {}),
    ...(ink ? { ink } : {}),
    author,
    created: time,
    id,
    language: opt.get('--lang') ?? 'de',
    generator: GENERATOR,
  });
  console.log(`${annotate.KIND_LABEL[kind]} ${a.id}${quote ? ` auf „${one(quote.exact)}“ (${quote.start}–${quote.end})` : ''}`);
  return save(input, out, { add: [a] }, time);
}

async function reply(args: string[], status: annotate.ReviewStatus | undefined): Promise<number> {
  const { pos, opt, random } = parse(args, ['--to', '--author', '--time', '--text', '--id', '--lang']);
  if (pos.length !== 2) return usage();
  const to = need(opt, '--to');
  const author = need(opt, '--author');
  const time = need(opt, '--time');
  const text = opt.get('--text');
  if (!status && !text) throw new UsageError('--text is required');
  const id = await newId(random, opt.get('--id'), { reply: to, status, text, author, time });
  const a = annotate.createReply({ to, ...(text ? { text } : {}), ...(status ? { status } : {}), author, created: time, id, language: opt.get('--lang') ?? 'de', generator: GENERATOR });
  console.log(`${status ? `Status ${annotate.STATUS_LABEL[status]}` : 'Antwort'} ${a.id} auf ${to}`);
  return save(pos[0]!, pos[1]!, { add: [a] }, time);
}

async function editText(args: string[]): Promise<number> {
  const { pos, opt } = parse(args, ['--id', '--text', '--time']);
  if (pos.length !== 2) return usage();
  const id = need(opt, '--id');
  const time = need(opt, '--time');
  const set = await annotate.readAnnotations(await readFile(pos[0]!), { anchors: false });
  const s = set.items.find((i) => i.info.id === id);
  if (!s) throw new annotate.AnnotationError(`no annotation ${id}`);
  const body = { type: 'TextualBody' as const, value: need(opt, '--text'), format: 'text/plain' as const, ...(s.json.body?.language ? { language: s.json.body.language } : {}) };
  return save(pos[0]!, pos[1]!, { replace: [{ ...s.json, body, modified: time }] }, time);
}

async function del(args: string[]): Promise<number> {
  const { pos, opt } = parse(args, ['--id', '--time']);
  if (pos.length !== 2) return usage();
  return save(pos[0]!, pos[1]!, { remove: [need(opt, '--id')] }, need(opt, '--time'));
}

async function exportCmd(args: string[]): Promise<number> {
  const { pos, opt } = parse(args, ['--format', '--time']);
  if (pos.length !== 2) return usage();
  const [file, out] = pos as [string, string];
  const c = await readContainer(await readFile(file));
  const set = await annotate.readAnnotations(c);
  const format = opt.get('--format') ?? (/\.csv$/i.test(out) ? 'csv' : /\.x?html?$/i.test(out) ? 'xhtml' : 'jsonld');
  const doc = { id: c.manifest.id, title: c.manifest.name, dateModified: c.manifest.dateModified };
  const time = opt.get('--time') ?? c.manifest.dateModified;
  let data: Uint8Array;
  if (format === 'jsonld') data = annotate.serializeCollection(annotate.toCollection(set, doc, time));
  else if (format === 'csv') data = annotate.toCsv(set);
  else if (format === 'xhtml') data = new TextEncoder().encode(annotate.toXhtml(set, doc, time, c.manifest.inLanguage));
  else throw new UsageError(`--format must be jsonld, csv or xhtml, got ${format}`);
  await writeFile(out, data);
  console.log(`${out}: ${format}, ${set.items.length} Anmerkungen in ${set.threads.length} Threads, ${data.length} Bytes`);
  for (const p of set.problems) console.log(`  nicht exportiert (unlesbar): ${p.path}: ${p.message}`);
  return set.problems.length > 0 ? 1 : 0;
}

async function importCmd(args: string[]): Promise<number> {
  const { pos, opt } = parse(args, ['--time']);
  if (pos.length !== 3) return usage();
  const [input, from, out] = pos as [string, string, string];
  const time = need(opt, '--time');
  const source = await readFile(from);
  let incoming: annotate.WebAnnotation[];
  let problems: string[] = [];
  if (source[0] === 0x50 && source[1] === 0x4b) incoming = (await annotate.readAnnotations(source, { anchors: false })).items.map((i) => i.json);
  else {
    const r = annotate.fromCollection(JSON.parse(new TextDecoder().decode(source)));
    incoming = r.annotations;
    problems = r.problems;
  }
  for (const p of problems) console.log(`  Problem im Import: ${p}`);
  const r = await annotate.mergeAnnotations(await readFile(input), incoming, { modified: time });
  await writeFile(out, r.bytes);
  console.log(`${out}: ${incoming.length} gelesen, ${r.added.length} übernommen, ${r.same.length} schon vorhanden (gleich), ${r.conflicts.length} Konflikte (Fassung des Dokuments behalten), ${r.moved.length} verschoben, ${r.orphaned.length} verwaist, ${r.skipped.length} nicht übernommen`);
  for (const id of r.conflicts) console.log(`  Konflikt: ${id}`);
  for (const s of r.skipped) console.log(`  nicht übernommen: ${s.id}: ${s.reason}`);
  return problems.length > 0 || r.skipped.length > 0 ? 1 : 0;
}

async function check(args: string[]): Promise<number> {
  const { pos } = parse(args, []);
  if (pos.length !== 1) return usage();
  const set = await annotate.readAnnotations(await readFile(pos[0]!));
  let bad = set.problems.length + set.orphans.length;
  for (const p of set.problems) console.log(`FEHLER ${p.path}: ${p.message}`);
  for (const o of set.orphans) console.log(`FEHLER ${annotate.fileOf(o.id)}: Antwort auf ${o.replyTo}, das nicht existiert`);
  for (const i of set.items) {
    if (i.integrity === 'mismatch') (bad++, console.log(`FEHLER ${i.path}: Hash weicht vom Manifest ab`));
    if (i.anchor && i.anchor.state !== 'exact') console.log(`HINWEIS ${i.path}: ${ANCHOR[i.anchor.state]}${i.anchor.reason ? ` (${i.anchor.reason})` : ''}`);
    if (!i.listed) console.log(`HINWEIS ${i.path}: nicht im Hash-Manifest, nicht signiert`);
  }
  console.log(`${set.items.length} Anmerkungen geprüft, ${bad} Fehler`);
  return bad > 0 ? 1 : 0;
}

async function compare(args: string[]): Promise<number> {
  const { pos, opt, json } = parse(args, ['--from', '--to']);
  let report: annotate.ReviewReport;
  if (pos.length === 2) {
    const [a, b] = [await readFile(pos[0]!), await readFile(pos[1]!)];
    report = await annotate.reviewReport(a, b, { from: pos[0]!, to: pos[1]! });
  } else if (pos.length === 1 && opt.has('--from') && opt.has('--to')) {
    const bytes = await readFile(pos[0]!);
    const [f, t] = [Number(opt.get('--from')), Number(opt.get('--to'))];
    const [sa, sb] = [await edit.snapshotAt(bytes, f), await edit.snapshotAt(bytes, t)];
    report = await annotate.reviewReport(sa, sb, { from: `Fassung ${f}`, to: `Fassung ${t}` });
  } else return usage();
  if (json) console.log(JSON.stringify(report, null, 2));
  else process.stdout.write(annotate.reviewText(report));
  return 0;
}

function usage(): number {
  console.error(
    'usage: hpro annotate list|check <file> | add <in> <out> --target path#id --author N --time ISO [--text T] [--quote P | --range S-E] [--highlight C] [--ink D] | reply|resolve|reopen <in> <out> --to ID --author N --time ISO [--text T] | edit <in> <out> --id ID --text T --time ISO | delete <in> <out> --id ID --time ISO | export <file> <out> [--format jsonld|csv|xhtml] | import <in> <from> <out> --time ISO | compare <older> <newer> | compare <file> --from N --to M',
  );
  return 2;
}

export async function annotateCommand(args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  try {
    switch (sub) {
      case 'list':
        return await list(rest);
      case 'add':
        return await add(rest);
      case 'reply':
        return await reply(rest, undefined);
      case 'resolve':
        return await reply(rest, 'resolved');
      case 'reopen':
        return await reply(rest, 'open');
      case 'edit':
        return await editText(rest);
      case 'delete':
        return await del(rest);
      case 'export':
        return await exportCmd(rest);
      case 'import':
        return await importCmd(rest);
      case 'check':
        return await check(rest);
      case 'compare':
        return await compare(rest);
      default:
        return usage();
    }
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(err.message);
      return usage();
    }
    if (err instanceof annotate.AnnotationError) {
      console.error(`abgelehnt: ${err.message}`);
      return 1;
    }
    throw err;
  }
}
