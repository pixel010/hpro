/**
 * Calculator on whole containers:
 *
 * - `recalculateContainer`: calculate every content document of the main version, optionally
 *   fill input cells first, write formula and value (HPF-STO-001), `computedAt` and
 *   `calculator` (HPF-STO-006) and a history entry naming the changed cells (HPF-FRZ-006).
 * - `freezeContainer`: add a frozen rendition under `renditions/<id>/` (HP-PROF-006/007,
 *   HPF-FRZ-001/002): values of the last complete calculation, formulas kept, no input cells,
 *   no check rules (their result stays as a note), no scripts; own manifest with
 *   `derivedFrom`, `computedAt` and `calculator`.
 * - `inspectCalculation`: what a reading system reports for a version: stored values against
 *   recalculated ones (HPF-STO-009, HPF-FRZ-003) and the hash check of the version manifest
 *   (a changed frozen file is recognisable without signature as well).
 */
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { fromUtf8, utf8 } from '../bytes.js';
import { readContainer, type ReadContainer } from '../container.js';
import { sriSha256 } from '../hash.js';
import { verifyIntegrity, type HproManifest, type IntegrityReport } from '../manifest.js';
import { writeZip, type ZipEntryInput } from '../zip.js';
import { CalcDocument, descendants, type CheckState, type Deviation, type DomDocument, type DomElement } from './dom.js';
import { CALCULATOR } from './engine.js';
import type { RoundingBasis } from './numbers.js';

const XHTML = 'application/xhtml+xml';
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

type Json = Record<string, unknown>;

function parseXhtml(bytes: Uint8Array, path: string): DomDocument {
  const errors: string[] = [];
  const doc = new DOMParser({ onError: (level, msg) => void (level !== 'warning' && errors.push(String(msg))) }).parseFromString(fromUtf8(bytes), XHTML);
  if (errors.length > 0) throw new Error(`${path}: XHTML not well-formed: ${errors[0]}`);
  return doc as unknown as DomDocument;
}

function serializeXhtml(doc: DomDocument, original: string): string {
  const body = new XMLSerializer().serializeToString(doc as never);
  const decl = /^<\?xml[^>]*\?>\s*/.exec(original)?.[0];
  return (decl && !body.startsWith('<?xml') ? decl : '') + body + (original.endsWith('\n') && !body.endsWith('\n') ? '\n' : '');
}

function checkTime(name: string, value: string): void {
  if (!UTC_RE.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${name} must be a UTC timestamp YYYY-MM-DDThh:mm:ssZ, got ${value}`);
}

/** Writes the entries of `c` back with replaced or added files and a new manifest. */
async function rewrite(c: ReadContainer, replace: ReadonlyMap<string, Uint8Array>, manifest: Json, modified: string, add: ReadonlyMap<string, Uint8Array> = new Map()): Promise<Uint8Array> {
  const entries: ZipEntryInput[] = c.entries
    .filter((e) => !e.name.endsWith('/'))
    .map((e) => ({
      name: e.name,
      data: e.name === 'manifest.json' ? utf8(JSON.stringify(manifest, null, 2) + '\n') : (replace.get(e.name) ?? e.data),
      compression: e.name === 'mimetype' ? 'store' : 'auto',
    }));
  for (const [name, data] of [...add].sort(([a], [b]) => (a < b ? -1 : 1))) entries.push({ name, data, compression: 'auto' });
  return writeZip(entries, { modified: new Date(modified) });
}

/** Sets `dcterms:modified` in package.opf (must equal `dateModified`, HPR-CONT-…). */
function opfWithModified(opf: string, modified: string): string {
  return opf.replace(/(<meta[^>]*property="dcterms:modified"[^>]*>)[^<]*(<\/meta>)/, `$1${modified}$2`);
}

async function updateIntegrity(manifest: Json, changed: ReadonlyMap<string, Uint8Array>): Promise<Json> {
  const resources = await Promise.all(
    (manifest.resources as Array<Json & { url: string }>).map(async (r) => (changed.has(r.url) ? { ...r, integrity: await sriSha256(changed.get(r.url)!) } : r)),
  );
  return { ...manifest, resources };
}

export interface CellEntry {
  /** Content document path. */
  readonly document?: string;
  /** `<table>.<A1>` */
  readonly address: string;
  /** Entry as a user would type it (HPF-STO-011). */
  readonly value: string;
}

export interface DocumentCalcReport {
  readonly path: string;
  readonly formulas: number;
  readonly checks: readonly CheckState[];
  /** Stored values that differed from the calculation when the document was opened. */
  readonly deviations: readonly Deviation[];
  /** Addresses of filled input cells. */
  readonly inputs: readonly string[];
  /** Addresses of formula cells whose stored value changed. */
  readonly changed: readonly string[];
  /** Cells on a circular reference. */
  readonly circular: readonly string[];
}

export interface RecalcContainerOptions {
  readonly set?: readonly CellEntry[];
  /** Time of the calculation, also the new `dateModified` (RFC 3339, UTC). */
  readonly computedAt: string;
  readonly note?: string;
  /** Only for measuring change request HPC-0005; default is the rule of part 3 version 0.1. */
  readonly rounding?: RoundingBasis;
}

export interface RecalcContainerResult {
  readonly bytes: Uint8Array;
  readonly documents: readonly DocumentCalcReport[];
  readonly manifest: Json;
}

/** Content documents of the main version that contain tables with formulas or checks. */
function calcDocuments(c: ReadContainer, rounding?: RoundingBasis): Array<{ path: string; text: string; doc: DomDocument; calc: CalcDocument }> {
  const out: Array<{ path: string; text: string; doc: DomDocument; calc: CalcDocument }> = [];
  for (const item of c.manifest.readingOrder) {
    if (item.type !== XHTML) continue;
    const bytes = c.files.get(item.url);
    if (!bytes) continue;
    const text = fromUtf8(bytes);
    const doc = parseXhtml(bytes, item.url);
    out.push({ path: item.url, text, doc, calc: new CalcDocument(doc, rounding ? { rounding } : {}) });
  }
  return out;
}

export async function recalculateContainer(bytes: Uint8Array, options: RecalcContainerOptions): Promise<RecalcContainerResult> {
  checkTime('computedAt', options.computedAt);
  const c = await readContainer(bytes);
  const docs = calcDocuments(c, options.rounding);
  const changedFiles = new Map<string, Uint8Array>();
  const reports: DocumentCalcReport[] = [];
  const pending = [...(options.set ?? [])];
  for (const d of docs) {
    const before = new Map(d.calc.workbook.formulaCells.map((cell) => [cell, (cell.element as DomElement).getAttribute('data-hp-value')]));
    d.calc.recalc();
    const deviations = d.calc.deviations();
    const inputs: string[] = [];
    for (const entry of pending.filter((e) => (e.document ?? d.path) === d.path && d.calc.cell(e.address))) {
      const r = d.calc.setInput(entry.address, entry.value);
      if (!r.ok) throw new Error(`${d.path}#${entry.address}: ${r.message}`);
      inputs.push(entry.address);
      pending.splice(pending.indexOf(entry), 1);
    }
    if (!d.calc.hasCalculation && inputs.length === 0) continue;
    const result = d.calc.recalc();
    d.calc.write();
    const changed = d.calc.workbook.formulaCells.filter((cell) => (cell.element as DomElement).getAttribute('data-hp-value') !== before.get(cell)).map((cell) => cell.table.address(cell.row, cell.col));
    const out = serializeXhtml(d.doc, d.text);
    if (out !== d.text) changedFiles.set(d.path, utf8(out));
    reports.push({
      path: d.path,
      formulas: result.formulas,
      checks: d.calc.checks(),
      deviations,
      inputs,
      changed: [...new Set([...deviations.map((x) => x.address), ...changed])],
      circular: result.circular.map((cell) => cell.table.address(cell.row, cell.col)),
    });
  }
  if (pending.length > 0) throw new Error(`no such cell: ${pending.map((p) => p.address).join(', ')}`);

  const opfText = fromUtf8(c.files.get(c.packagePath)!);
  const opf = opfWithModified(opfText, options.computedAt);
  if (opf !== opfText) changedFiles.set(c.packagePath, utf8(opf));
  const old = JSON.parse(fromUtf8(c.files.get('manifest.json')!)) as Json;
  let manifest = await updateIntegrity({ ...old, dateModified: options.computedAt }, changedFiles);
  const history = Array.isArray(old.history) ? [...(old.history as Json[])] : [];
  const touched = reports.flatMap((r) => [...r.inputs, ...r.changed.filter((a) => !r.inputs.includes(a))]);
  const note = options.note ?? (touched.length > 0 ? `Zellen geändert: ${[...new Set(touched)].join(', ')}` : 'neu berechnet, keine Zelle geändert');
  history.push({
    version: history.length > 0 ? Math.max(...history.map((h) => Number(h.version) || 0)) + 1 : 1,
    dateModified: options.computedAt,
    note,
    manifestIntegrity: await sriSha256(c.files.get('manifest.json')!),
  });
  manifest = { ...manifest, computedAt: options.computedAt, calculator: { ...CALCULATOR }, history };
  const out = await rewrite(c, changedFiles, manifest, options.computedAt);
  return { bytes: out, documents: reports, manifest };
}

export interface FreezeOptions {
  /** Rendition id, e.g. `nachweis-2026-10-12`. */
  readonly id: string;
  /** Creation time of the rendition (RFC 3339, UTC); also `computedAt`. */
  readonly createdAt: string;
  /** Profile of the rendition: `static` (default) or `signed`. */
  readonly profile?: 'static' | 'signed';
  /** Visible notice in each frozen document (HP-PROF-013), default German text. */
  readonly notice?: string;
}

export interface FreezeResult {
  readonly bytes: Uint8Array;
  readonly files: readonly string[];
  readonly documents: readonly DocumentCalcReport[];
}

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Replaces scripts and components by their static equivalent, removes input and check attributes. */
function freezeMarkup(doc: DomDocument, calc: CalcDocument, notice: string): void {
  const root = doc.documentElement as DomElement;
  for (const el of descendants(root)) {
    const name = el.localName ?? '';
    if (name === 'script') {
      el.parentNode && (el.parentNode as unknown as DomElement).removeChild(el);
      continue;
    }
    for (const a of ['data-hp-input', 'data-hp-check', 'data-hp-check-message', 'data-hp-stale']) el.removeAttribute(a);
    if (name.includes('-')) el.setAttribute('data-hp-frozen-name', name);
  }
  // Custom elements become div with data-hp-frozen (part 1, 7.3); their light DOM is the static equivalent.
  for (const el of descendants(root).filter((e) => e.hasAttribute('data-hp-frozen-name'))) {
    const name = el.getAttribute('data-hp-frozen-name')!;
    const div = doc.createElementNS(el.namespaceURI ?? 'http://www.w3.org/1999/xhtml', 'div');
    for (const attr of ['id', 'class', 'lang', 'role', 'aria-label']) {
      const v = el.getAttribute(attr);
      if (v !== null) div.setAttribute(attr, v);
    }
    div.setAttribute('data-hp-frozen', name);
    while (el.childNodes.length > 0) div.appendChild(el.childNodes.item(0)!);
    (el.parentNode as unknown as { replaceChild(a: unknown, b: unknown): void }).replaceChild(div, el);
  }
  // Results of check rules stay as a note after the table (HPF-FRZ-001).
  const checks = calc.checks();
  const byTable = new Map<string, CheckState[]>();
  for (const s of checks) {
    const t = s.address.slice(0, s.address.lastIndexOf('.'));
    (byTable.get(t) ?? byTable.set(t, []).get(t)!).push(s);
  }
  for (const t of calc.tables) {
    const list = byTable.get(t.key);
    if (!list) continue;
    const table = t.element as DomElement;
    const p = doc.createElementNS(table.namespaceURI ?? 'http://www.w3.org/1999/xhtml', 'p');
    p.setAttribute('class', 'hp-check-summary');
    const failed = list.filter((s) => !s.ok);
    p.appendChild(
      doc.createTextNode(
        `Prüfungen bei der Berechnung: ${list.length - failed.length} von ${list.length} erfüllt` +
          (failed.length > 0 ? `; nicht erfüllt: ${failed.map((s) => `${s.address} (${s.message})`).join('; ')}.` : '.'),
      ),
    );
    const parent = table.parentNode as unknown as DomElement & { insertBefore(a: unknown, b: unknown): void };
    const next = (table as unknown as { nextSibling: unknown }).nextSibling;
    if (next) parent.insertBefore(p, next);
    else parent.appendChild(p);
  }
  // Visible notice (HP-PROF-013) at the start of the body.
  const body = descendants(root).find((e) => e.localName === 'body');
  if (body) {
    const p = doc.createElementNS(body.namespaceURI ?? 'http://www.w3.org/1999/xhtml', 'p');
    p.setAttribute('data-hp-role', 'signature-notice');
    p.appendChild(doc.createTextNode(notice));
    const first = (body as unknown as { firstChild: unknown }).firstChild;
    (body as unknown as { insertBefore(a: unknown, b: unknown): void }).insertBefore(p, first);
  }
}

export async function freezeContainer(bytes: Uint8Array, options: FreezeOptions): Promise<FreezeResult> {
  checkTime('createdAt', options.createdAt);
  if (!ID_RE.test(options.id)) throw new Error(`rendition id must match ${ID_RE}`);
  const c = await readContainer(bytes);
  const prefix = `renditions/${options.id}/`;
  if ([...c.files.keys()].some((p) => p.startsWith(prefix))) throw new Error(`rendition ${options.id} exists already`);
  const notice =
    options.notice ??
    `Eingefrorene Fassung vom ${options.createdAt.slice(0, 10)}: Werte der Berechnung festgeschrieben (${CALCULATOR.name} ${CALCULATOR.version}, ${options.createdAt}). Den Signaturstatus zeigt nur ein hpro-Lesesystem an.`;
  const main = c.manifest as HproManifest & Json;
  const files = new Map<string, Uint8Array>();
  const reports: DocumentCalcReport[] = [];
  const reading = new Set(main.readingOrder.map((r) => r.url));
  for (const r of main.resources) {
    const data = c.files.get(r.url);
    if (!data || r.url.startsWith('renditions/') || r.url === c.packagePath || r.url.startsWith('components/')) continue;
    if (r.type === XHTML && reading.has(r.url)) {
      const text = fromUtf8(data);
      const doc = parseXhtml(data, r.url);
      const calc = new CalcDocument(doc);
      const result = calc.recalc();
      const deviations = calc.deviations();
      calc.write();
      freezeMarkup(doc, calc, notice);
      files.set(prefix + r.url, utf8(serializeXhtml(doc, text)));
      if (calc.hasCalculation) {
        reports.push({ path: prefix + r.url, formulas: result.formulas, checks: calc.checks(), deviations, inputs: [], changed: deviations.map((d) => d.address), circular: result.circular.map((x) => x.table.address(x.row, x.col)) });
      }
    } else if (r.type === XHTML) {
      // navigation document and other XHTML: copied, scripts removed
      const doc = parseXhtml(data, r.url);
      for (const el of descendants(doc).filter((e) => e.localName === 'script')) (el.parentNode as unknown as DomElement).removeChild(el);
      files.set(prefix + r.url, utf8(serializeXhtml(doc, fromUtf8(data))));
    } else {
      files.set(prefix + r.url, data);
    }
  }
  const resources: Array<{ url: string; type: string; integrity: string }> = [];
  for (const [path, data] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const type = main.resources.find((r) => prefix + r.url === path)!.type;
    resources.push({ url: path, type, integrity: await sriSha256(data) });
  }
  const renditionManifest: Json = {
    '@context': main['@context'],
    conformsTo: main.conformsTo.replace(/[^/]+$/, options.profile ?? 'static'),
    id: `${main.id}#${options.id}`,
    name: `${main.name} (eingefrorene Fassung)`,
    inLanguage: main.inLanguage,
    dateModified: options.createdAt,
    readingOrder: main.readingOrder.map((l) => ({ url: prefix + l.url, type: l.type })),
    resources,
    derivedFrom: { integrity: await sriSha256(c.files.get('manifest.json')!), method: 'render' },
    computedAt: options.createdAt,
    calculator: { ...CALCULATOR },
    ...(main.accessibility ? { accessibility: main.accessibility } : {}),
  };
  const manifestPath = `${prefix}manifest.json`;
  files.set(manifestPath, utf8(JSON.stringify(renditionManifest, null, 2) + '\n'));

  // package.opf lists every file (HP-CONT-004); rendition files are items, not spine entries.
  const opfText = fromUtf8(c.files.get(c.packagePath)!);
  const items = [...files.keys()]
    .sort()
    .map((p, i) => `    <item id="${options.id}-${i + 1}" href="${p}" media-type="${p === manifestPath ? 'application/json' : resources.find((r) => r.url === p)!.type}"/>`);
  const opf = opfText.replace('  </manifest>', `${items.join('\n')}\n  </manifest>`);
  const changed = new Map([[c.packagePath, utf8(opf)]]);
  let manifest = await updateIntegrity(main as unknown as Json, changed);
  const renditions = Array.isArray(main.renditions) ? [...(main.renditions as Json[])] : [];
  renditions.push({ id: options.id, role: 'frozen', url: manifestPath, createdAt: options.createdAt });
  manifest = { ...manifest, renditions };
  const out = await rewrite(c, changed, manifest, main.dateModified, files);
  return { bytes: out, files: [...files.keys()].sort(), documents: reports };
}

export interface VersionInspection {
  /** null = main version. */
  readonly rendition: string | null;
  readonly manifestPath: string;
  /** Hash check of the version's manifest (rendition files against the rendition manifest). */
  readonly integrity: IntegrityReport;
  readonly computedAt: string | null;
  readonly calculator: Json | null;
  readonly documents: ReadonlyArray<{
    readonly path: string;
    readonly formulas: number;
    /** Stored against recalculated values; the display is not changed (HPF-FRZ-003). */
    readonly deviations: readonly Deviation[];
    readonly notComputed: readonly string[];
    readonly stale: readonly string[];
  }>;
}

/** Checks one version without changing anything: hashes and stored against calculated values. */
export async function inspectCalculation(bytes: Uint8Array, rendition: string | null = null): Promise<VersionInspection> {
  const c = await readContainer(bytes);
  let manifest = c.manifest as HproManifest & Json;
  let manifestPath = 'manifest.json';
  if (rendition !== null) {
    manifestPath = `renditions/${rendition}/manifest.json`;
    const m = c.files.get(manifestPath);
    if (!m) throw new Error(`rendition ${rendition} not found`);
    manifest = JSON.parse(fromUtf8(m)) as HproManifest & Json;
  }
  const integrity = rendition === null ? c.integrity : await verifyIntegrity(manifest, new Map([...c.files].filter(([p]) => p.startsWith(`renditions/${rendition}/`) && p !== manifestPath)));
  const documents = [];
  for (const item of manifest.readingOrder) {
    const data = c.files.get(item.url);
    if (!data || item.type !== XHTML) continue;
    const calc = new CalcDocument(parseXhtml(data, item.url));
    if (!calc.hasCalculation) continue;
    calc.recalc();
    documents.push({
      path: item.url,
      formulas: calc.formulaCount,
      deviations: calc.deviations(),
      notComputed: calc.workbook.formulaCells.filter((x) => x.notComputed).map((x) => x.table.address(x.row, x.col)),
      stale: calc.tables.filter((t) => t.stale).map((t) => t.key),
    });
  }
  return {
    rendition,
    manifestPath,
    integrity,
    computedAt: typeof manifest.computedAt === 'string' ? manifest.computedAt : null,
    calculator: (manifest.calculator as Json | undefined) ?? null,
    documents,
  };
}
