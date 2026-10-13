/**
 * `hpro pdf …`: PDF export, PDF import and OCR through the hpro service (package P9, dienst/).
 *
 *   hpro pdf status --dienst URL
 *   hpro pdf export <in.hpro> <out.pdf> --dienst URL [--conformance PDF/A-2a,PDF/UA-1] [--rendition ID]
 *                   [--page-size A4] [--embed-container] [--json bericht.json]
 *       the core removes `no-export` sections before the container is sent (HP-LOCK-004);
 *       the service renders with WeasyPrint and checks every level with veraPDF
 *   hpro pdf import <in.pdf> <out.hpro> --dienst URL [--ocr auto|force|off] [--languages de,en]
 *                   [--modified ISO] [--no-original] [--json bericht.json]
 *       Docling finds the structure, the core writes the document (original PDF under original/)
 *   hpro pdf ocr <in.pdf> <out.pdf> --dienst URL [--languages de] [--mode auto|force] [--dpi 300] [--json bericht.json]
 *       scanned PDF → searchable PDF (invisible text layer over the unchanged pages)
 *
 * Exit codes: 0 done (export: every requested level passed), 1 export with failed conformance
 * check, 2 usage, input or service error.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createContainer, pdf, type PdfConformance } from '../src/index.js';

class UsageError extends Error {}

const USAGE =
  'usage: hpro pdf status --dienst URL | hpro pdf export <in.hpro> <out.pdf> --dienst URL [--conformance L1,L2] [--rendition ID] [--page-size A4] [--embed-container] [--json FILE] | ' +
  'hpro pdf import <in.pdf> <out.hpro> --dienst URL [--ocr auto|force|off] [--languages de,en] [--modified ISO] [--no-original] [--json FILE] | ' +
  'hpro pdf ocr <in.pdf> <out.pdf> --dienst URL [--languages de] [--mode auto|force] [--dpi N] [--json FILE]';

interface Parsed {
  positional: string[];
  options: Map<string, string>;
  flags: Set<string>;
}

const VALUE_OPTIONS = new Set(['--dienst', '--conformance', '--rendition', '--page-size', '--json', '--ocr', '--languages', '--modified', '--mode', '--dpi']);

function parse(args: string[]): Parsed {
  const out: Parsed = { positional: [], options: new Map(), flags: new Set() };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (VALUE_OPTIONS.has(a)) {
      const v = args[++i];
      if (v === undefined) throw new UsageError(`${a} needs a value`);
      out.options.set(a, v);
    } else if (a.startsWith('--')) out.flags.add(a);
    else out.positional.push(a);
  }
  return out;
}

const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export async function pdfCommand(args: string[]): Promise<number> {
  try {
    const [sub, ...rest] = args;
    const p = parse(rest);
    const url = p.options.get('--dienst') ?? process.env.HPRO_DIENST;
    if (!url) throw new UsageError('--dienst URL (or HPRO_DIENST) is required');
    const client = new pdf.DienstClient({ url, location: /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(url) ? 'local-sidecar' : 'remote-service' });
    const json = p.options.get('--json');

    if (sub === 'status') {
      console.log(JSON.stringify(await client.status(), null, 2));
      return 0;
    }
    if (p.positional.length !== 2) throw new UsageError(USAGE);
    const [input, output] = p.positional as [string, string];
    const bytes = new Uint8Array(await readFile(input));
    console.log(`Dienst: ${client.url} (${client.location === 'local-sidecar' ? 'auf diesem Gerät' : 'Daten verlassen das Gerät'})`);

    if (sub === 'export') {
      const conformance = list(p.options.get('--conformance') ?? 'PDF/A-2a,PDF/UA-1') as PdfConformance[];
      const r = await new pdf.RemoteWeasyPrint(client).export({
        container: bytes,
        conformance,
        pageSize: (p.options.get('--page-size') ?? 'A4') as 'A4',
        embedContainer: p.flags.has('--embed-container'),
        fileName: basename(input),
        ...(p.options.get('--rendition') ? { rendition: p.options.get('--rendition')! } : {}),
      });
      await writeFile(output, r.pdf);
      console.log(`${output}: ${r.pdf.length} Bytes, ${r.pages} Seiten, ${r.engine.name} ${r.engine.version}, Variante ${r.variant ?? 'PDF ohne Konformitätsanspruch'}`);
      for (const c of r.checks) {
        console.log(`  ${c.conformance}: ${c.passed ? 'bestanden' : 'NICHT bestanden'} (${c.checker})`);
        for (const f of c.failures) console.log(`    ${f}`);
      }
      if (conformance.length === 0) console.log('  keine Konformitätsstufe angefordert: kein PDF/A- oder PDF/UA-Anspruch');
      for (const o of r.omitted) console.log(`  ausgelassen: ${o.target} – ${o.notice}`);
      for (const l of r.live) console.log(`  lebendig: ${l.kind} ${l.address} (${l.still ? 'Standbild' : 'Beschreibung'})`);
      for (const w of r.warnings) console.log(`  Hinweis: ${w}`);
      if (json) await writeFile(json, JSON.stringify({ ...r, pdf: undefined, bytes: r.pdf.length }, null, 2) + '\n');
      return r.checks.every((c) => c.passed) ? 0 : 1;
    }
    if (sub === 'import') {
      const ocr = (p.options.get('--ocr') ?? 'auto') as 'auto' | 'force' | 'off';
      const languages = list(p.options.get('--languages'));
      const r = await new pdf.RemoteDocling(client).import({
        pdf: bytes,
        fileName: basename(input),
        ocr,
        ...(languages.length > 0 ? { languages } : {}),
        ...(p.options.get('--modified') ? { modified: p.options.get('--modified')! } : {}),
        keepOriginal: !p.flags.has('--no-original'),
      });
      const created = await createContainer(r.document);
      await writeFile(output, created.bytes);
      console.log(`${output}: ${created.bytes.length} Bytes, ${r.engine.name} ${r.engine.version}, ${r.raw.pdf.pages} Seiten, ${r.raw.seconds ?? '?'} s im Dienst`);
      console.log(`  Titel: ${r.document.title} · Sprache: ${r.document.language} · id: ${r.document.id}`);
      console.log(`  übernommen: ${Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
      for (const w of r.warnings) console.log(`  Warnung ${w.code}${w.page ? ` (Seite ${w.page})` : ''}: ${w.message}`);
      if (json) await writeFile(json, JSON.stringify({ warnings: r.warnings, counts: r.counts, engine: r.engine, raw: { ...r.raw, blocks: r.raw.blocks.map((b) => ('image' in b ? { ...b, image: `(${b.image?.length ?? 0} Zeichen base64)` } : b)) } }, null, 2) + '\n');
      return 0;
    }
    if (sub === 'ocr') {
      const r = await new pdf.RemoteTesseractOcr(client).searchablePdf(bytes, {
        languages: list(p.options.get('--languages') ?? 'de'),
        mode: (p.options.get('--mode') ?? 'auto') as 'auto' | 'force',
        ...(p.options.get('--dpi') ? { dpi: Number(p.options.get('--dpi')) } : {}),
      });
      await writeFile(output, r.pdf);
      console.log(`${output}: ${r.engine.name} ${r.engine.version}, ${r.ocrPages} von ${r.pages.length} Seiten erkannt, ${r.words} Wörter, mittlere Konfidenz ${r.meanConfidence ?? '–'}`);
      for (const pg of r.pages) console.log(`  Seite ${pg.page}: ${pg.reason}, ${pg.words} Wörter, Konfidenz ${pg.meanConfidence ?? '–'}`);
      if (json) await writeFile(json, JSON.stringify({ ...r, pdf: undefined }, null, 2) + '\n');
      return 0;
    }
    throw new UsageError(USAGE);
  } catch (err) {
    if (err instanceof UsageError) console.error(err.message);
    else console.error(`hpro pdf: ${(err as Error).message}`);
    return 2;
  }
}
