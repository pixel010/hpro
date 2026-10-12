/**
 * `hpro edit …`, `hpro history …`, `hpro diff …`: structured editing, history journal and
 * comparison of versions (package P5).
 *
 *   hpro edit blocks <file> [--doc path] [--json]
 *       block outline with pointers (path#id/p[2], table cells path#table.B3)
 *   hpro edit apply <in> <out> <ops.json> --time ISO [--note TEXT] [--no-journal]
 *       apply a list of operations (JSON, see kern/README.md); media as {"name","type","file"}
 *       with `file` relative to the ops file
 *   hpro edit set-text <in> <out> --target POINTER (--text TEXT | --text-file F | --inline-file F) --time ISO
 *       replace the text (or restricted inline XHTML) of one block
 *   hpro history <file>
 *       versions of the file (history + journal), with the result of the hash-chain check
 *   hpro history checkout <file> <version> <out>
 *       write one earlier version as a container of its own
 *   hpro diff <older> <newer> [--html out.xhtml] [--json out.json]
 *   hpro diff <file> --from N --to M [--html …] [--json …]
 *       compare two versions block by block (headings, paragraphs, lists, cells, images …)
 *
 * Exit codes: 0 ok, 1 refused (one line `ERROR [code]: …`), 2 usage or format error.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { edit } from '../src/index.js';

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

interface Args {
  readonly positional: string[];
  readonly options: Map<string, string>;
  readonly flags: Set<string>;
}

const FLAGS = new Set(['--json', '--no-journal']);

function parse(args: string[], valueFlags: ReadonlySet<string> = new Set()): Args {
  const positional: string[] = [];
  const options = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (FLAGS.has(a) && !valueFlags.has(a)) flags.add(a);
    else if (a.startsWith('--')) {
      const v = args[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      options.set(a, v);
    } else positional.push(a);
  }
  return { positional, options, flags };
}

function refused(e: unknown): number {
  if (e instanceof edit.EditError) {
    console.error(`ERROR [${e.code}]: ${e.message}`);
    return 1;
  }
  if (e instanceof edit.JournalError) {
    console.error(`ERROR [journal]: ${e.message}`);
    return 1;
  }
  throw e;
}

async function blocks(a: Args): Promise<number> {
  const [file] = a.positional;
  if (!file) return usage();
  const s = await edit.EditSession.open(await readFile(file));
  const docs = a.options.get('--doc') ? [a.options.get('--doc')!] : s.documents();
  if (a.flags.has('--json')) {
    console.log(JSON.stringify(Object.fromEntries(docs.map((d) => [d, s.outline(d)])), null, 2));
    return 0;
  }
  for (const d of docs) {
    console.log(`# ${d}`);
    for (const r of s.outline(d)) {
      const label = r.kind === 'heading' ? `h${r.level}` : r.kind;
      const text = r.text.length > 70 ? r.text.slice(0, 69) + '…' : r.text;
      const extra = [r.attrs?.src ? `src=${r.attrs.src}` : '', r.attrs?.alt !== undefined ? `alt="${r.attrs.alt.slice(0, 40)}"` : '', r.notes ? `Fußnoten ${r.notes.join(',')}` : '', r.redacted ? 'geschwärzt' : ''].filter(Boolean).join(' ');
      console.log(`${'  '.repeat(r.depth)}${label.padEnd(10)} ${r.pointer}${text ? `  „${text}“` : ''}${extra ? `  [${extra}]` : ''}`);
    }
  }
  return 0;
}

type JsonOp = Record<string, unknown>;

/** Media given as {"file": …} are read relative to the ops file. */
async function loadMedia(value: unknown, base: string): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((v) => loadMedia(v, base)));
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if ('file' in o && 'type' in o && typeof o.file === 'string') return { name: o.name ?? o.file, type: o.type, data: new Uint8Array(await readFile(resolve(base, o.file))) };
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = await loadMedia(v, base);
    return out;
  }
  return value;
}

async function apply(a: Args): Promise<number> {
  const [input, output, opsFile] = a.positional;
  const at = a.options.get('--time');
  if (!input || !output || !opsFile || !at) return usage();
  const ops = (await loadMedia(JSON.parse(await readFile(opsFile, 'utf8')) as JsonOp[], dirname(resolve(opsFile)))) as edit.EditOp[];
  if (!Array.isArray(ops)) throw new Error(`${opsFile}: a JSON list of operations`);
  try {
    const s = await edit.EditSession.open(await readFile(input));
    for (const op of ops) {
      const r = s.apply(op);
      console.log(`ok  ${r.summary}${r.detail ? `  ${r.detail}` : ''}${r.notes?.length ? `  (${r.notes.join('; ')})` : ''}`);
    }
    const saved = await s.save({ at, ...(a.options.get('--note') ? { note: a.options.get('--note')! } : {}), journal: !a.flags.has('--no-journal') });
    await writeFile(output, saved.bytes);
    console.log(`${output}  ${saved.bytes.length} bytes  sha256=${sha256(saved.bytes)}`);
    console.log(`version ${saved.version}; changed: ${saved.changedFiles.join(', ')}${saved.addedFiles.length ? `; added: ${saved.addedFiles.join(', ')}` : ''}${saved.removedFiles.length ? `; removed: ${saved.removedFiles.join(', ')}` : ''}`);
    return 0;
  } catch (e) {
    return refused(e);
  }
}

async function setText(a: Args): Promise<number> {
  const [input, output] = a.positional;
  const at = a.options.get('--time');
  const target = a.options.get('--target');
  if (!input || !output || !at || !target) return usage();
  const op: edit.EditOp = a.options.has('--inline-file')
    ? { op: 'set-text', target, inline: (await readFile(a.options.get('--inline-file')!, 'utf8')).replace(/\r?\n$/, '') }
    : { op: 'set-text', target, text: a.options.has('--text-file') ? (await readFile(a.options.get('--text-file')!, 'utf8')).replace(/\r?\n$/, '') : (a.options.get('--text') ?? '') };
  try {
    const saved = await edit.editContainer(await readFile(input), [op], { at });
    await writeFile(output, saved.bytes);
    console.log(`ok  ${saved.results[0]!.summary}`);
    console.log(`${output}  ${saved.bytes.length} bytes  sha256=${sha256(saved.bytes)}  version ${saved.version}`);
    return 0;
  } catch (e) {
    return refused(e);
  }
}

export async function editCommand(args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  if (sub === 'blocks') return blocks(parse(rest));
  if (sub === 'apply') return apply(parse(rest));
  if (sub === 'set-text') return setText(parse(rest));
  return usage();
}

const STATUS: Record<edit.VersionInfo['status'], string> = { current: 'aktuell', exact: 'byte-genau', redacted: 'redigiert', mismatch: 'ABWEICHUNG', unavailable: 'nicht im Journal' };

export async function historyCommand(args: string[]): Promise<number> {
  const a = parse(args);
  if (a.positional[0] === 'checkout') {
    const [, file, n, out] = a.positional;
    if (!file || !n || !out) return usage();
    try {
      const bytes = await edit.checkoutVersion(await readFile(file), Number(n));
      await writeFile(out, bytes);
      console.log(`${out}  ${bytes.length} bytes  sha256=${sha256(bytes)}  (Fassung ${n})`);
      return 0;
    } catch (e) {
      return refused(e);
    }
  }
  const [file] = a.positional;
  if (!file) return usage();
  const infos = await edit.listVersions(await readFile(file));
  if (a.flags.has('--json')) console.log(JSON.stringify(infos, null, 2));
  else {
    console.log('Fassung  Zeitpunkt             Prüfung           Notiz');
    for (const i of infos) console.log(`${String(i.version).padStart(7)}  ${(i.dateModified ?? '').padEnd(20)}  ${STATUS[i.status].padEnd(16)}  ${i.note ?? ''}${i.problems ? `\n         ${i.problems.join('\n         ')}` : ''}`);
  }
  return infos.some((i) => i.status === 'mismatch') ? 1 : 0;
}

export async function diffCommand(args: string[]): Promise<number> {
  const a = parse(args, new Set(['--json']));
  let result: edit.DiffResult;
  try {
    if (a.options.has('--from') || a.options.has('--to')) {
      const [file] = a.positional;
      if (!file || !a.options.has('--from') || !a.options.has('--to')) return usage();
      result = await edit.diffVersions(await readFile(file), Number(a.options.get('--from')), Number(a.options.get('--to')));
    } else {
      const [older, newer] = a.positional;
      if (!older || !newer) return usage();
      result = await edit.diffContainers(await readFile(older), await readFile(newer), { from: older, to: newer });
    }
  } catch (e) {
    return refused(e);
  }
  process.stdout.write(edit.diffText(result));
  if (a.options.has('--html')) await writeFile(a.options.get('--html')!, edit.diffXhtml(result));
  if (a.options.has('--json')) await writeFile(a.options.get('--json')!, JSON.stringify(result, null, 2) + '\n');
  return 0;
}

function usage(): number {
  console.error(
    'usage: hpro edit blocks <file> [--doc path] [--json] | hpro edit apply <in> <out> <ops.json> --time ISO [--note T] [--no-journal] | hpro edit set-text <in> <out> --target P (--text T | --text-file F | --inline-file F) --time ISO | hpro history <file> [--json] | hpro history checkout <file> <n> <out> | hpro diff <older> <newer> [--html F] [--json F] | hpro diff <file> --from N --to M',
  );
  return 2;
}
