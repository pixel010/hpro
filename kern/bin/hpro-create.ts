/**
 * `hpro create`: one command that writes an hpro document from the formats office programs and
 * other software produce (S8). The source format follows from the file name or `--from`:
 *
 *   .md .markdown          Markdown with front matter and template (author path, S5)
 *   .docx                  Word (OOXML)
 *   .odt .fodt .ott        OpenDocument text (LibreOffice, Word „OpenDocument-Text“, Google Docs)
 *   .ods .fods .xlsx       spreadsheet: every sheet becomes a calculating table (part 3, P19)
 *   .pdf                   PDF through the hpro service (P9; needs --dienst URL or HPRO_DIENST)
 *
 *   hpro create <quelle> <ziel.hpro> [--from md|docx|odt|ods|xlsx|pdf] [--vorlage NAME|DIR] [--feld k=v]...
 *               [--id URN] [--modified ISO] [--titel TEXT] [--sprache TAG] [--no-original] [--bild-auslassen]
 *               [--json BERICHT] [--dienst URL]
 *
 * Exit codes: 0 written, 1 template rules not met (nothing written), 2 usage or input error,
 * 4 PDF service not available.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { calc } from '../src/index.js';
import { authorCommand } from './hpro-author.js';
import { EXIT, UsageError } from './cli-common.js';

export const CREATE_USAGE =
  'usage: hpro create <quelle> <ziel.hpro> [--from md|docx|odt|ods|xlsx|pdf] [--vorlage NAME|DIR] [--feld k=v]... [--id URN] [--modified ISO] ' +
  '[--titel TEXT] [--sprache TAG] [--no-original] [--bild-auslassen] [--json BERICHT] [--dienst URL]';

type Kind = 'md' | 'docx' | 'odt' | 'ods' | 'xlsx' | 'pdf';

const BY_EXTENSION: Record<string, Kind> = {
  '.md': 'md',
  '.markdown': 'md',
  '.docx': 'docx',
  '.odt': 'odt',
  '.fodt': 'odt',
  '.ott': 'odt',
  '.ods': 'ods',
  '.fods': 'ods',
  '.xlsx': 'xlsx',
  '.pdf': 'pdf',
};

/** Options each kind accepts (values) and flags; everything else is a usage error. */
const TEXT_VALUES = ['--vorlage', '--feld', '--id', '--modified', '--json'];
const TEXT_FLAGS = ['--no-original', '--bild-auslassen'];
const SHEET_VALUES = ['--id', '--modified', '--titel', '--sprache', '--json'];
const PDF_VALUES = ['--dienst', '--modified', '--json', '--ocr', '--languages'];
const PDF_FLAGS = ['--no-original'];

function split(args: string[]): { positional: string[]; values: Array<[string, string]>; flags: string[]; from?: string } {
  const out: { positional: string[]; values: Array<[string, string]>; flags: string[]; from?: string } = { positional: [], values: [], flags: [] };
  const valueOptions = new Set([...TEXT_VALUES, ...SHEET_VALUES, ...PDF_VALUES, '--from']);
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (valueOptions.has(a)) {
      const v = args[++i];
      if (v === undefined) throw new UsageError(`${a} braucht einen Wert`);
      if (a === '--from') out.from = v;
      else out.values.push([a, v]);
    } else if (a.startsWith('--')) out.flags.push(a);
    else out.positional.push(a);
  }
  return out;
}

function allow(kind: Kind, values: Array<[string, string]>, flags: string[], allowedValues: string[], allowedFlags: string[]): void {
  for (const [k] of values) if (!allowedValues.includes(k)) throw new UsageError(`hpro create: Option ${k} gilt nicht für Quellen der Art ${kind}`);
  for (const f of flags) if (!allowedFlags.includes(f)) throw new UsageError(`hpro create: Option ${f} gilt nicht für Quellen der Art ${kind}`);
}

export async function createCommand(args: string[]): Promise<number> {
  try {
    const p = split(args);
    if (p.positional.length !== 2) throw new UsageError(CREATE_USAGE);
    const [input, output] = p.positional as [string, string];
    const kind = (p.from ?? BY_EXTENSION[extname(input).toLowerCase()]) as Kind | undefined;
    if (!kind || !['md', 'docx', 'odt', 'ods', 'xlsx', 'pdf'].includes(kind)) {
      throw new UsageError(`hpro create: Quellformat von „${basename(input)}“ unbekannt; --from md|docx|odt|ods|xlsx|pdf angeben`);
    }
    if (!output.endsWith('.hpro') && !output.endsWith('.epub')) console.error(`Hinweis: Ziel „${output}“ endet nicht auf .hpro (oder .epub für die Weitergabe als EPUB).`);
    const flat = p.values.flatMap(([k, v]) => [k, v]);

    if (kind === 'md' || kind === 'docx' || kind === 'odt') {
      allow(kind, p.values, p.flags, TEXT_VALUES, TEXT_FLAGS);
      return await authorCommand([kind, input, output, ...flat, ...p.flags]);
    }
    if (kind === 'pdf') {
      allow(kind, p.values, p.flags, PDF_VALUES, PDF_FLAGS);
      if (!p.values.some(([k]) => k === '--dienst') && !process.env.HPRO_DIENST) {
        console.error('hpro create: PDF-Quellen brauchen den hpro-Dienst (--dienst URL oder HPRO_DIENST); er ist nicht angegeben.');
        return EXIT.unavailable;
      }
      return await authorCommand(['pdf', input, output, ...flat, ...p.flags]);
    }
    // Spreadsheets: every sheet becomes a calculating table (part 3, section 13).
    allow(kind, p.values, p.flags, SHEET_VALUES, []);
    const opt = new Map(p.values);
    const importedAt = opt.get('--modified') ?? new Date().toISOString().slice(0, 19) + 'Z';
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(importedAt)) throw new UsageError(`--modified ${importedAt}: erwartet YYYY-MM-DDThh:mm:ssZ`);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(input));
    } catch (err) {
      console.error(`hpro create: ${(err as Error).message}`);
      return EXIT.usage;
    }
    let r: Awaited<ReturnType<typeof calc.importSpreadsheet>>;
    try {
      r = await calc.importSpreadsheet(bytes, {
        sourceName: basename(input),
        importedAt,
        ...(opt.get('--titel') ? { title: opt.get('--titel')! } : {}),
        ...(opt.get('--sprache') ? { language: opt.get('--sprache')! } : {}),
        ...(opt.get('--id') ? { id: opt.get('--id')! } : {}),
      });
    } catch (err) {
      console.error(`hpro create: Tabelle nicht lesbar: ${(err as Error).message}`);
      return EXIT.usage;
    }
    await writeFile(output, r.bytes);
    const s = r.report.summary;
    const sha = createHash('sha256').update(r.bytes).digest('hex');
    console.log(`Quelle: ${input} (${r.report.format}) · Tabellenimport (Teil 3, Abschnitt 13)${opt.get('--modified') ? '' : ' · Stand: Uhrzeit des Laufs (--modified für reproduzierbare Dateien)'}`);
    console.log(`${output}: ${r.bytes.length} Bytes, sha256=${sha}`);
    console.log(`  ${s.tables} Tabellen, ${s.cells} Zellen, ${s.formulas} Formeln, davon ${s.translated} übernommen, ${s.frozen} als Wert eingefroren; ${s.macros} Makroteile nicht übernommen`);
    for (const f of r.report.frozen) console.log(`  ERSATZ eingefroren [${f.reason}] ${f.address} ${f.formula} → Wert ${f.value}${f.detail ? ` (${f.detail})` : ''}`);
    for (const d of r.report.deviations) console.log(`  HINWEIS Abweichung ${d.address} ${d.formula}: Quelle ${d.source}, hpro ${d.computed}`);
    if (opt.get('--json')) await writeFile(opt.get('--json')!, JSON.stringify({ quelle: basename(input), format: r.report.format, bericht: r.report, ausgabe: { datei: basename(output), bytes: r.bytes.length, sha256: sha } }, null, 2) + '\n');
    return EXIT.ok;
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(err.message);
      return EXIT.usage;
    }
    console.error(`hpro create: ${(err as Error).message}`);
    return EXIT.usage;
  }
}
