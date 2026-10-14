/**
 * Rules of area MACH (part 1, section 5.13; part 0, section 15a): the machine view of each
 * version is present (main version), readable, closed against the schema, hash-protected,
 * derived from the current files, equal to a fresh derivation from the human view, its Markdown
 * rendering equal to the rendering of the JSON, and inside the signature scope of a signed
 * version. Invisible control characters in content documents are reported as a warning.
 */
import { validateInstance } from './jsonschema.js';
import { compareMachineView, staleSources } from '../machine/container.js';
import { MACHINE_MARKDOWN_PATH, MACHINE_VIEW_PATH, MachineViewError, deriveMachineView, type MachineView } from '../machine/derive.js';
import { renderMachineMarkdown } from '../machine/markdown.js';
import { MACHINE_VIEW_SCHEMA } from '../machine/schema.js';
import { decodeUtf8 } from './markup.js';
import { finding, loc, type Ctx, type Fassung, type JsonObject } from './context.js';

/** Unicode tag characters and explicit bidi overrides (HP-MACH-011). */
const SMUGGLING = /[\u{E0000}-\u{E007F}‭‮]/u;

function describe(ch: string): string {
  const cp = ch.codePointAt(0)!;
  return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

/** HPR-MACH-001 … 008 for one version. */
export async function checkMachineView(ctx: Ctx, f: Fassung): Promise<void> {
  const r = ctx.report;
  r.ran('HPR-MACH-001', 'HPR-MACH-002', 'HPR-MACH-003', 'HPR-MACH-004', 'HPR-MACH-005', 'HPR-MACH-006', 'HPR-MACH-007');
  checkInvisible(ctx, f);
  const viewPath = f.prefix + MACHINE_VIEW_PATH;
  const mdPath = f.prefix + MACHINE_MARKDOWN_PATH;
  const bytes = ctx.files.get(viewPath);
  if (!bytes) {
    if (f.id === null) finding(ctx, 'HPR-MACH-001', { pfad: viewPath }, loc.container(), f);
    if (ctx.files.has(mdPath)) finding(ctx, 'HPR-MACH-006', { pfad: mdPath, grund: 'Darstellung ohne machine/document.json' }, loc.entry(mdPath), f);
    return;
  }

  // HPR-MACH-003: listed in the version's resources as application/json (Markdown as text/markdown).
  const listed = new Map<string, string>();
  if (Array.isArray(f.manifest.resources)) for (const item of f.manifest.resources) if (item && typeof item === 'object' && !Array.isArray(item) && typeof item.url === 'string') listed.set(item.url, typeof item.type === 'string' ? item.type : '');
  for (const [path, type] of [[viewPath, 'application/json'], [mdPath, 'text/markdown']] as const) {
    if (!ctx.files.has(path)) continue;
    if (!listed.has(path)) finding(ctx, 'HPR-MACH-003', { pfad: path, grund: 'nicht in resources der Fassung, also nicht hashgesichert' }, loc.entry(path), f);
    else if (listed.get(path) !== type) finding(ctx, 'HPR-MACH-003', { pfad: path, grund: `Media-Type ${listed.get(path) || '(fehlt)'} statt ${type}` }, loc.entry(path), f);
  }

  // HPR-MACH-002: UTF-8 JSON without BOM, closed against the schema.
  let stored: unknown;
  const text = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? undefined : decodeUtf8(bytes);
  if (text === undefined) {
    finding(ctx, 'HPR-MACH-002', { pfad: viewPath, grund: 'kein UTF-8 ohne BOM' }, loc.entry(viewPath), f);
    return;
  }
  try {
    stored = JSON.parse(text);
  } catch (err) {
    finding(ctx, 'HPR-MACH-002', { pfad: viewPath, grund: `kein JSON (${(err as Error).message})` }, loc.entry(viewPath), f);
    return;
  }
  const problems = validateInstance(stored, MACHINE_VIEW_SCHEMA as unknown as JsonObject);
  for (const p of problems.slice(0, 10)) finding(ctx, 'HPR-MACH-002', { pfad: viewPath, grund: `${p.path || '/'}: ${p.message}` }, loc.manifest(viewPath, p.path || ''), f);

  // HPR-MACH-005: equal to a fresh derivation from the human view.
  let derived: MachineView | undefined;
  try {
    derived = await deriveMachineView({ files: ctx.files, manifest: f.manifest as Record<string, unknown>, prefix: f.prefix });
  } catch (err) {
    if (!(err instanceof MachineViewError)) throw err;
    r.notChecked('HPR-MACH-005', 'fatal', `Ableitung nicht möglich: ${err.message}`);
    r.notChecked('HPR-MACH-006', 'fatal', `Ableitung nicht möglich: ${err.message}`);
  }

  // HPR-MACH-004: every source named in derivedFrom still has the recorded hash, and the list
  // names exactly the files a fresh derivation reads.
  for (const s of await staleSources(stored, ctx.files, derived)) finding(ctx, 'HPR-MACH-004', { pfad: viewPath, uri: s.url, grund: s.reason }, loc.entry(viewPath), f);

  if (derived) {
    const diffs = compareMachineView(stored, derived, 10);
    for (const d of diffs) finding(ctx, 'HPR-MACH-005', { pfad: viewPath, feld: d.pointer, kennung: d.address ?? '–', wert: d.stored, erwartet: d.derived }, loc.manifest(viewPath, d.pointer), f);
    // HPR-MACH-006: the Markdown rendering equals the rendering of the stored JSON.
    const md = ctx.files.get(mdPath);
    if (md && problems.length === 0) {
      const expected = renderMachineMarkdown(stored as MachineView);
      const actual = decodeUtf8(md);
      if (actual !== expected) {
        const a = (actual ?? '').split('\n');
        const e = expected.split('\n');
        let line = 0;
        while (line < Math.max(a.length, e.length) && a[line] === e[line]) line++;
        finding(ctx, 'HPR-MACH-006', { pfad: mdPath, grund: `Zeile ${line + 1} weicht von der Darstellung der JSON-Sicht ab` }, loc.entry(mdPath), f);
      }
    }
  }
}

/** HPR-MACH-007: tag characters and bidi overrides in the content documents of a version. */
function checkInvisible(ctx: Ctx, f: Fassung): void {
  for (const path of f.readingOrder) {
    const doc = f.docs.get(path);
    if (!doc) continue;
    const lines = doc.text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = SMUGGLING.exec(lines[i]!);
      if (m) {
        finding(ctx, 'HPR-MACH-007', { pfad: path, zeile: i + 1, wert: describe(m[0]) }, { kind: 'xml', path, line: i + 1 }, f);
        break;
      }
    }
  }
}

/** HPR-MACH-008: in a signed version the view is a signed reference of a signature of that version. */
export function checkMachineSignature(ctx: Ctx): void {
  ctx.report.ran('HPR-MACH-008');
  for (const f of ctx.fassungen) {
    const sigs = ctx.signatures.filter((s) => s.fassung === f.id);
    if (sigs.length === 0) continue;
    for (const path of [f.prefix + MACHINE_VIEW_PATH, f.prefix + MACHINE_MARKDOWN_PATH]) {
      if (!ctx.files.has(path)) continue;
      if (!sigs.some((s) => s.references.some((ref) => ref.path === path))) finding(ctx, 'HPR-MACH-008', { pfad: path, signatur: sigs.map((s) => s.id).join(', ') }, loc.entry(path), f);
    }
  }
}
