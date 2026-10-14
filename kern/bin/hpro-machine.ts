/**
 * `hpro machine …`: machine view of a document (package S9, part 0 section 15a).
 *
 *   hpro machine <file> [--fassung ID] [--format json|md] [--out FILE] [--trust cert.pem]... [--time ISO]
 *       the envelope a reading system hands to a language model (HP-MACH-010): status from this
 *       program's own checks (view present and consistent, integrity, signatures and whether they
 *       cover the view), then the view; a deviating stored view is replaced by the derived one.
 *       `--format md` writes the status as a table followed by the Markdown rendering of the view.
 *   hpro machine write <in> <out> [--fassung ID] [--ohne-markdown]
 *       add or refresh machine/document.json (and machine/document.md) of an unsigned container
 *
 * Exit codes: 0 view present and consistent (write: written); 1 view missing or deviating (the
 * envelope is still printed, with the derived view); 2 usage or input error.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { certificatesFromPem, machine } from '../src/index.js';

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

const USAGE = `usage: hpro machine <datei> [--fassung ID] [--format json|md] [--out DATEI] [--trust zert.pem]... [--time ISO]
       hpro machine write <ein> <aus> [--fassung ID] [--ohne-markdown]`;

function parse(args: string[]): { positional: string[]; options: Map<string, string[]>; flags: Set<string> } {
  const positional: string[] = [];
  const options = new Map<string, string[]>();
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--ohne-markdown') flags.add(a);
    else if (a.startsWith('--')) {
      const v = args[++i];
      if (v === undefined) throw new Error(`${a} braucht einen Wert`);
      (options.get(a) ?? options.set(a, []).get(a)!).push(v);
    } else positional.push(a);
  }
  return { positional, options, flags };
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** Status table plus the Markdown rendering of the view. */
export function envelopeMarkdown(env: machine.MachineEnvelope): string {
  const s = env.status;
  const sig = s.signatures.length === 0 ? 'keine' : s.signatures.map((x) => `${x.id}: ${x.indication}${x.subIndication ? '/' + x.subIndication : ''}${x.signer ? `, ${x.signer}` : ''}${x.coversMachineView ? ', erfasst die Maschinensicht' : ', erfasst die Maschinensicht NICHT'}${x.coversContent ? ' und den Inhalt' : ', Inhalt NICHT vollständig'}`).join('; ');
  const lines = [
    `<!-- hpro-Prüfhülle (${env.format}). ${env.notice} -->`,
    '',
    '# Prüfhülle des lesenden Systems',
    '',
    '| Angabe | Wert |',
    '| --- | --- |',
    `| Datei | ${cell(env.file.name)} (${env.file.size} Bytes, SHA-256 ${env.file.sha256}) |`,
    `| Geprüft | ${env.checkedAt} mit ${cell(env.tool.name)} ${env.tool.version} |`,
    `| Fassung | ${env.version ?? 'Hauptfassung'} |`,
    `| Maschinensicht | ${s.machineView}${s.consistent === null ? '' : s.consistent ? ', stimmt mit der Menschenansicht überein' : `, weicht ab (${s.differences.length + s.staleSources.length} Stellen)`} |`,
    `| Verwendete Sicht | ${s.used === 'gespeichert' ? 'gespeicherte Maschinensicht' : 'neu aus der Menschenansicht abgeleitet'} |`,
    `| Integrität | ${s.integrity ? 'alle Dateien wie im Manifest' : 'Dateien weichen vom Manifest ab'} |`,
    `| Signaturen | ${cell(sig)} |`,
    ...(env.unlistedAnnotations.length > 0 ? [`| Unsignierte Anmerkungen | ${env.unlistedAnnotations.length} (nicht Teil der Sicht) |`] : []),
    '',
    '---',
    '',
  ];
  return lines.join('\n') + machine.renderMachineMarkdown(env.view);
}

export async function machineCommand(args: string[]): Promise<number> {
  let a;
  try {
    a = parse(args);
  } catch (err) {
    console.error(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }
  const one = (name: string) => a.options.get(name)?.at(-1);
  if (a.positional[0] === 'write') {
    const [, input, output] = a.positional;
    if (!input || !output) {
      console.error(USAGE);
      return 2;
    }
    try {
      const fassung = one('--fassung');
      const r = await machine.writeMachineView(await readFile(input), { markdown: !a.flags.has('--ohne-markdown'), ...(fassung ? { rendition: fassung } : {}) });
      await writeFile(output, r.bytes);
      console.log(`${output}  ${r.bytes.length} bytes  sha256=${sha256(r.bytes)}`);
      console.log(`Maschinensicht: ${r.view.content.reduce((n, d) => n + d.blocks.length, 0)} Blöcke in ${r.view.content.length} Inhaltsdokument(en), ${r.added.length > 0 ? `neu: ${r.added.join(', ')}` : 'aufgefrischt'}`);
      return 0;
    } catch (err) {
      console.error(err instanceof machine.MachineViewError ? `FEHLER: ${err.message}` : String(err));
      return 2;
    }
  }
  const [file] = a.positional;
  if (!file || a.positional.length > 1) {
    console.error(USAGE);
    return 2;
  }
  const format = one('--format') ?? 'json';
  if (format !== 'json' && format !== 'md') {
    console.error(`--format json|md, nicht ${format}\n${USAGE}`);
    return 2;
  }
  let env: machine.MachineEnvelope;
  try {
    const trustAnchors = [];
    for (const t of a.options.get('--trust') ?? []) trustAnchors.push(...certificatesFromPem(await readFile(t, 'utf8')));
    const fassung = one('--fassung');
    const time = one('--time');
    env = await machine.machineEnvelope(await readFile(file), { fileName: basename(file), trustAnchors, ...(fassung ? { rendition: fassung } : {}), ...(time ? { validationTime: time } : {}) });
  } catch (err) {
    console.error(err instanceof machine.MachineViewError ? `FEHLER: ${err.message}` : String(err));
    return 2;
  }
  const text = format === 'json' ? JSON.stringify(env, null, 2) + '\n' : envelopeMarkdown(env);
  const out = one('--out');
  if (out) await writeFile(out, text);
  else process.stdout.write(text);
  if (out || format === 'json') {
    const s = env.status;
    console.error(`Maschinensicht ${s.machineView}; stimmig: ${s.consistent === null ? '–' : s.consistent ? 'ja' : 'nein'}; verwendet: ${s.used}; Integrität: ${s.integrity ? 'ok' : 'verletzt'}; Signaturen: ${s.signatures.length}`);
    for (const d of [...s.staleSources.map((x) => `veraltet: ${x.url} (${x.reason})`), ...s.differences.map((x) => `abweichend: ${x.pointer}${x.address ? ` (${x.address})` : ''}`)].slice(0, 10)) console.error(`  ${d}`);
  }
  return env.status.consistent ? 0 : 1;
}
