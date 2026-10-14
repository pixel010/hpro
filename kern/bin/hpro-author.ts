/**
 * `hpro author …`: the author path (S5) — create documents from Markdown with a template, import
 * Word documents, import PDF through the service of P9; every run says what was not carried over.
 *
 *   hpro author vorlagen
 *       list the templates (fields, required sections, minimum profile)
 *   hpro author neu <datei.md> [--vorlage NAME] [--heute YYYY-MM-DD]
 *       write a Markdown starter of the template with a fresh document id
 *   hpro author md <in.md> <out.hpro> [--vorlage NAME|VERZEICHNIS] [--feld key=wert]... [--modified ISO] [--id URN]
 *                  [--no-original] [--json bericht.json]
 *   hpro author docx <in.docx> <out.hpro> [--vorlage NAME|VERZEICHNIS] [--bild-auslassen] [--feld key=wert]...
 *                  [--modified ISO] [--id URN] [--no-original] [--json bericht.json]
 *   hpro author odt <in.odt|in.fodt> <out.hpro> [same options as docx]
 *       ODF text document (S8: export path of LibreOffice, Word „OpenDocument-Text“, Google Docs)
 *   hpro author pdf <in.pdf> <out.hpro> --dienst URL [Optionen von hpro pdf import]
 *
 * A template directory holds `vorlage.json` (see `author.parseTemplate`) and `stil.css`.
 * Messages: VERLUST (content not in the document), ERSATZ (weaker form), HINWEIS, FEHLER (template).
 * Exit codes: 0 written, 1 template rules not met (nothing written), 2 usage or input error.
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { author, createContainer } from '../src/index.js';
import { pdfCommand } from './hpro-pdf.js';

class UsageError extends Error {}

const USAGE =
  'usage: hpro author vorlagen | hpro author neu <datei.md> [--vorlage NAME] | ' +
  'hpro author md <in.md> <out.hpro> [--vorlage NAME|DIR] [--feld k=v]... [--modified ISO] [--id URN] [--no-original] [--json FILE] | ' +
  'hpro author docx <in.docx> <out.hpro> [--vorlage NAME|DIR] [--bild-auslassen] [--feld k=v]... [--modified ISO] [--id URN] [--no-original] [--json FILE] | ' +
  'hpro author odt <in.odt|in.fodt> <out.hpro> [wie docx] | ' +
  'hpro author pdf <in.pdf> <out.hpro> --dienst URL [...]';

const VALUE_OPTIONS = new Set(['--vorlage', '--feld', '--modified', '--id', '--json', '--heute']);

interface Parsed {
  positional: string[];
  options: Map<string, string>;
  fields: Record<string, string>;
  flags: Set<string>;
}

function parse(args: string[]): Parsed {
  const out: Parsed = { positional: [], options: new Map(), fields: {}, flags: new Set() };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (VALUE_OPTIONS.has(a)) {
      const v = args[++i];
      if (v === undefined) throw new UsageError(`${a} needs a value`);
      if (a === '--feld') {
        const eq = v.indexOf('=');
        if (eq < 1) throw new UsageError(`--feld ${v}: erwartet key=wert`);
        out.fields[v.slice(0, eq)] = v.slice(eq + 1);
      } else out.options.set(a, v);
    } else if (a.startsWith('--')) out.flags.add(a);
    else out.positional.push(a);
  }
  return out;
}

function loadTemplate(spec: string): author.Template {
  const builtIn = author.findTemplate(spec);
  if (builtIn) return builtIn;
  if (existsSync(spec) && statSync(spec).isDirectory()) {
    const json = JSON.parse(readFileSync(join(spec, 'vorlage.json'), 'utf8')) as unknown;
    const cssPath = join(spec, 'stil.css');
    return author.parseTemplate(json, existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '');
  }
  throw new UsageError(`Vorlage „${spec}“ unbekannt (eingebaut: ${author.TEMPLATES.map((t) => t.name).join(', ')}; oder Verzeichnis mit vorlage.json)`);
}

const LABEL: Record<author.Severity, string> = { verlust: 'VERLUST', ersatz: 'ERSATZ', hinweis: 'HINWEIS', fehler: 'FEHLER' };

function printMessages(messages: readonly author.Message[]): void {
  const order: author.Severity[] = ['fehler', 'verlust', 'ersatz', 'hinweis'];
  for (const sev of order) {
    for (const m of messages.filter((x) => x.severity === sev)) console.log(`  ${LABEL[sev]} ${m.code} [${m.category}]${(m.count ?? 1) > 1 ? ` (${m.count}×)` : ''}: ${m.text}`);
  }
}

function summary(messages: readonly author.Message[]): Record<author.Severity, number> {
  const s: Record<author.Severity, number> = { verlust: 0, ersatz: 0, hinweis: 0, fehler: 0 };
  for (const m of messages) s[m.severity] += m.count ?? 1;
  return s;
}

async function convert(kind: 'md' | 'docx' | 'odt', p: Parsed): Promise<number> {
  if (p.positional.length !== 2) throw new UsageError(USAGE);
  const [input, output] = p.positional as [string, string];
  const bytes = new Uint8Array(readFileSync(input));
  let source: author.AuthorSource;
  if (kind === 'md') {
    const baseDir = resolve(dirname(input));
    source = author.readMarkdown(new TextDecoder('utf-8', { fatal: true }).decode(bytes), {
      loadFile: (rel) => {
        const full = resolve(baseDir, rel);
        if (full !== baseDir && !full.startsWith(baseDir + sep)) return undefined;
        return existsSync(full) && statSync(full).isFile() ? new Uint8Array(readFileSync(full)) : undefined;
      },
    });
  } else {
    try {
      const omitUnsupportedImages = p.flags.has('--bild-auslassen');
      source = kind === 'docx' ? await author.readDocx(bytes, { omitUnsupportedImages }) : await author.readOdf(bytes, { omitUnsupportedImages });
    } catch (err) {
      if (err instanceof author.DocxError || err instanceof author.OdfError) {
        console.error(`hpro author ${kind}: ${err.message}`);
        return 2;
      }
      throw err;
    }
  }
  const front = source.meta.fields?.vorlage;
  const templateName = p.options.get('--vorlage') ?? (typeof front === 'string' ? front : undefined) ?? 'frei';
  const template = loadTemplate(templateName);
  const result = await author.writeDocument(source, template, {
    sourceBytes: bytes,
    sourceName: basename(input),
    keepOriginal: !p.flags.has('--no-original'),
    fields: p.fields,
    ...(p.options.get('--modified') ? { modified: p.options.get('--modified')! } : {}),
    ...(p.options.get('--id') ? { id: p.options.get('--id')! } : {}),
  });
  const s = summary(result.messages);
  const report: Record<string, unknown> = {
    quelle: basename(input),
    format: source.format,
    vorlage: template.name,
    mindestprofil: result.officeMin,
    inventarQuelle: source.inventory,
    geschrieben: result.counts,
    zusammenfassung: s,
    meldungen: result.messages,
  };
  console.log(`Quelle: ${input} (${source.format.tool.name} ${source.format.tool.version}) · Vorlage: ${template.name} (${template.label})`);
  if (author.hasErrors(result.messages)) {
    console.log(`Nicht geschrieben: die Vorlage „${template.name}“ ist nicht erfüllt.`);
    printMessages(result.messages);
    if (p.options.get('--json')) await writeFile(p.options.get('--json')!, JSON.stringify({ ...report, ausgabe: null }, null, 2) + '\n');
    return 1;
  }
  const created = await createContainer(result.document);
  await writeFile(output, created.bytes);
  const sha = createHash('sha256').update(created.bytes).digest('hex');
  console.log(`${output}: ${created.bytes.length} Bytes, sha256=${sha}`);
  console.log(`  Titel: ${result.document.title} · Sprache: ${result.document.language} · id: ${result.document.id} · Stand: ${result.document.modified}`);
  console.log(`  Profil static${result.officeMin ? ', Mindestprofil für Büroprogramme (subset office-min)' : ''}; Rücklesen: Hash-Manifest ok`);
  console.log(`  Quelle enthielt: ${Object.entries(source.inventory).map(([k, v]) => `${k} ${v}`).join(', ') || '–'}`);
  console.log(`  geschrieben: ${Object.entries(result.counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`  Meldungen: ${s.verlust} Verlust, ${s.ersatz} Ersatz, ${s.hinweis} Hinweis`);
  printMessages(result.messages);
  if (p.options.get('--json')) await writeFile(p.options.get('--json')!, JSON.stringify({ ...report, ausgabe: { datei: basename(output), bytes: created.bytes.length, sha256: sha } }, null, 2) + '\n');
  return 0;
}

export async function authorCommand(args: string[]): Promise<number> {
  try {
    const [sub, ...rest] = args;
    if (sub === 'pdf') {
      console.log('PDF-Import über den hpro-Dienst (P9); Verluste meldet der Dienst als Warnungen.');
      return await pdfCommand(['import', ...rest]);
    }
    const p = parse(rest);
    if (sub === 'vorlagen') {
      for (const t of author.TEMPLATES) {
        console.log(`${t.name} – ${t.label}${t.officeMin ? ' (Mindestprofil, solange der Inhalt darin bleibt)' : ' (Stufe Basis)'}`);
        console.log(`  ${t.description}`);
        console.log(`  Felder: ${t.fields.map((f) => `${f.key}${f.required ? '*' : ''}`).join(', ')}${t.sections ? ` · Pflichtabschnitte: ${t.sections.join(', ')}` : ''}${t.summary?.required ? ` · Überblick „${t.summary.title}“ Pflicht` : ''}`);
      }
      console.log('(* = Pflichtfeld)');
      return 0;
    }
    if (sub === 'neu') {
      if (p.positional.length !== 1) throw new UsageError(USAGE);
      const file = p.positional[0]!;
      if (existsSync(file)) {
        console.error(`hpro author neu: ${file} existiert schon; nichts überschrieben`);
        return 2;
      }
      const t = loadTemplate(p.options.get('--vorlage') ?? 'frei');
      const today = p.options.get('--heute') ?? new Date().toISOString().slice(0, 10);
      const text = t.skeleton.replace(/\{\{id\}\}/g, `urn:uuid:${randomUUID()}`).replace(/\{\{heute\}\}/g, today);
      const withTemplate = text.startsWith('---\n') ? `---\nvorlage: ${t.name}\n${text.slice(4)}` : text;
      await writeFile(file, withTemplate);
      console.log(`${file}: Gerüst der Vorlage „${t.name}“ geschrieben (${withTemplate.length} Zeichen); weiter mit: hpro author md ${file} ${file.replace(/\.md$/, '')}.hpro`);
      return 0;
    }
    if (sub === 'md' || sub === 'docx' || sub === 'odt') return await convert(sub, p);
    throw new UsageError(USAGE);
  } catch (err) {
    if (err instanceof UsageError) console.error(err.message);
    else console.error(`hpro author: ${(err as Error).message}`);
    return 2;
  }
}
