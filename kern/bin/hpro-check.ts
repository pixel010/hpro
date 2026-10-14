#!/usr/bin/env node
/**
 * hpro-check: conformance checker for hpro files (package S3), Node command line.
 *
 *   hpro-check <datei> [Optionen]
 *
 *   --json <pfad>        JSON report (part 1, section 4.3) to a file
 *   --format text|json   stdout format (default text, section 4.4)
 *   --trust <cert.pem>   trust anchor for signature validation (repeatable)
 *   --level <Stufe>      request a level in addition to the claimed ones (repeatable)
 *   --strict             warnings decide like errors (section 2.2)
 *   --redacted <text>    redacted string to search for (HPR-LOCK-005, repeatable)
 *   --time <ISO>         validation time for signatures (default now)
 *   --epubcheck <jar>    EPUB validator jar (default $HPRO_EPUBCHECK, else prototyp/tools/epubcheck-5.4.0/epubcheck.jar)
 *   --java <bin>         Java runtime (default $HPRO_JAVA, else prototyp/tools/jdk-21.0.12.1+1/bin/java, else `java`)
 *   --no-epubcheck       do not run the EPUB validator (HPR-CONT-024/028 then "not checked")
 *   --catalog <pfad>     rule catalogue (default docs/spezifikation/01-regelkatalog.json, in the package spec/)
 *   --no-not-checked     omit the "NICHT GEPRÜFT" lines in the text output
 *
 * Exit codes (section 4.5): 0 all levels passed, 1 a level failed, 2 checker could not run
 * (also: report does not validate against the report schema), 3 a level is undetermined.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { findAbove, isMain, specFile } from './cli-common.js';
import { certificatesFromPem, checkConformance, exitCode, reportText, validateAgainstSchema, type Catalog, type ExternalMessage, type ExternalResult, type Level } from '../src/index.js';

/**
 * Rule catalogue, report schema and function list come from the specification in the repository
 * or, in an installed package, from its `spec/` copy; epubcheck and Java from `HPRO_EPUBCHECK` /
 * `HPRO_JAVA` or the tools of the repository (prototyp/setup-tools.sh).
 */
const DEFAULTS = {
  catalog: specFile('01-regelkatalog.json'),
  schema: specFile('schema/konformitaetsbericht.schema.json'),
  functions: specFile('03-funktionen.json'),
  epubcheck: process.env.HPRO_EPUBCHECK ?? findAbove('prototyp/tools/epubcheck-5.4.0/epubcheck.jar') ?? 'epubcheck.jar',
  java: process.env.HPRO_JAVA ?? findAbove('prototyp/tools/jdk-21.0.12.1+1/bin/java') ?? 'java',
};
const LEVEL_NAMES: readonly Level[] = ['Basis', 'Lebendig', 'Signiert', 'Archiv'];

interface Args {
  file?: string;
  json?: string;
  format: 'text' | 'json';
  trust: string[];
  levels: Level[];
  strict: boolean;
  redacted: string[];
  time?: string;
  epubcheck?: string;
  java?: string;
  noEpubcheck: boolean;
  catalog: string;
  notChecked: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { format: 'text', trust: [], levels: [], strict: false, redacted: [], noEpubcheck: false, catalog: DEFAULTS.catalog, notChecked: true };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i]!;
    const next = () => {
      const n = argv[++i];
      if (n === undefined) throw new Error(`option ${v} needs a value`);
      return n;
    };
    if (v === '--json') a.json = next();
    else if (v === '--format') {
      const f = next();
      if (f !== 'text' && f !== 'json') throw new Error(`--format ${f}: text or json`);
      a.format = f;
    } else if (v === '--trust') a.trust.push(next());
    else if (v === '--level') {
      const l = next() as Level;
      if (!LEVEL_NAMES.includes(l)) throw new Error(`--level ${l}: one of ${LEVEL_NAMES.join(', ')}`);
      a.levels.push(l);
    } else if (v === '--strict') a.strict = true;
    else if (v === '--redacted') a.redacted.push(next());
    else if (v === '--time') a.time = next();
    else if (v === '--epubcheck') a.epubcheck = next();
    else if (v === '--java') a.java = next();
    else if (v === '--no-epubcheck') a.noEpubcheck = true;
    else if (v === '--catalog') a.catalog = next();
    else if (v === '--no-not-checked') a.notChecked = false;
    else if (v.startsWith('--')) throw new Error(`unknown option ${v}`);
    else if (!a.file) a.file = v;
    else throw new Error(`unexpected argument ${v}`);
  }
  return a;
}

/** EPUB validator adapter: runs epubcheck on a copy named `.epub` (it refuses other extensions, docs/05 V7). */
function epubcheckAdapter(java: string, jar: string): (bytes: Uint8Array) => Promise<ExternalResult> {
  return async (bytes) => {
    const dir = await mkdtemp(join(tmpdir(), 'hpro-check-'));
    const tool = 'epubcheck';
    try {
      const file = join(dir, 'pruefling.epub');
      const out = join(dir, 'epubcheck.json');
      await writeFile(file, bytes);
      try {
        await promisify(execFile)(java, ['-jar', jar, file, '--json', out], { timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
      } catch {
        // exit code 1 means "messages found"; the JSON report decides
      }
      let report: { messages?: Array<{ ID: string; severity: string; message: string; locations?: Array<{ path?: string; line?: number }> }>; checker?: { checkerVersion?: string } };
      try {
        report = JSON.parse(await readFile(out, 'utf8'));
      } catch (err) {
        return { tool, error: `epubcheck lieferte keinen JSON-Bericht (${(err as Error).message})` };
      }
      const messages: ExternalMessage[] = [];
      for (const m of report.messages ?? []) {
        const sev = String(m.severity).toUpperCase();
        const l0 = m.locations?.[0];
        const path = l0?.path ? String(l0.path).replace(/^.*pruefling\.epub\/?/, '') : undefined;
        messages.push({
          severity: sev === 'FATAL' ? 'FATAL' : sev === 'ERROR' ? 'ERROR' : sev === 'WARNING' ? 'WARNING' : 'INFO',
          code: m.ID,
          message: m.message,
          ...(path ? { path } : {}),
          ...(l0?.line && l0.line > 0 ? { line: l0.line } : {}),
        });
      }
      return { tool: `${tool} ${report.checker?.checkerVersion ?? ''}`.trim(), messages };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}

/** `hpro check …` and `hpro-check …`. */
export async function checkCommand(argv: string[]): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`hpro-check: ${(err as Error).message}`);
    return 2;
  }
  if (!args.file) {
    console.error('usage: hpro-check <datei> [--json pfad] [--format text|json] [--trust cert.pem]... [--level Stufe]... [--strict] [--redacted text]... [--time ISO] [--no-epubcheck] [--epubcheck jar --java bin] [--catalog pfad]');
    return 2;
  }
  let bytes: Uint8Array;
  let catalog: Catalog;
  let schema: Record<string, unknown>;
  try {
    bytes = await readFile(args.file);
    catalog = JSON.parse(await readFile(args.catalog, 'utf8')) as Catalog;
    schema = JSON.parse(await readFile(DEFAULTS.schema, 'utf8')) as Record<string, unknown>;
  } catch (err) {
    console.error(`hpro-check: ${(err as Error).message}`);
    return 2;
  }
  const functions = existsSync(DEFAULTS.functions) ? (JSON.parse(await readFile(DEFAULTS.functions, 'utf8')) as { functions: Array<{ name: string }> }).functions.map((f) => f.name) : undefined;
  const trustAnchors: Uint8Array[] = [];
  for (const t of args.trust) trustAnchors.push(...certificatesFromPem(await readFile(t, 'utf8')));
  const jar = args.epubcheck ?? DEFAULTS.epubcheck;
  const java = args.java ?? DEFAULTS.java;
  const useEpubcheck = !args.noEpubcheck && existsSync(jar);

  const report = await checkConformance(bytes, catalog, {
    fileName: basename(args.file),
    strict: args.strict,
    levels: args.levels,
    trustAnchors,
    redactedTerms: args.redacted,
    ...(args.time ? { validationTime: args.time } : {}),
    ...(useEpubcheck ? { epubValidator: epubcheckAdapter(java, jar) } : {}),
    ...(functions ? { supportedFunctions: functions } : {}),
  });
  const problems = validateAgainstSchema(report, schema);
  if (args.json) await writeFile(args.json, JSON.stringify(report, null, 2) + '\n');
  if (args.format === 'json') console.log(JSON.stringify(report, null, 2));
  else {
    const sha = createHash('sha256').update(bytes).digest('hex');
    console.log(`Prüfbericht ${report.file.name} (${report.file.size} Bytes, sha256 ${sha.slice(0, 16)}…), Katalog Teil ${report.catalog.part} v${report.catalog.version} (${report.catalog.rules} Regeln), ${report.tool.name} ${report.tool.version}`);
    console.log(`Beanspruchte Stufen: ${report.levels.claimed.join(', ')}${report.levels.requested.length ? `; angefordert: ${report.levels.requested.join(', ')}` : ''}${report.strict ? '; Betriebsart streng' : ''}`);
    console.log(reportText(report, { notChecked: args.notChecked }));
    console.log(`Berichtsschema: ${problems.length === 0 ? 'gültig' : `UNGÜLTIG (${problems.slice(0, 5).join('; ')})`}`);
  }
  if (problems.length > 0) {
    console.error(`hpro-check: report does not validate against ${DEFAULTS.schema}: ${problems.join('; ')}`);
    return 2;
  }
  return exitCode(report);
}

if (isMain(import.meta.url)) checkCommand(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(`hpro-check: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exit(2);
  },
);

