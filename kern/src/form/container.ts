/**
 * Forms on whole containers (package P6, HPC-0009):
 *
 * - `inspectForms`: every form of the main version with fields, values, conditions, check rules,
 *   the problems that would prevent submitting, the status of the data file and whether markup,
 *   manifest and schema fit together.
 * - `fillForms`: entries as typed, optionally submitting. Submitting is refused (`FormRejected`)
 *   unless every form concerned is valid — entries, constraints, check rules and JSON Schema.
 *   The result is a new container: values in the markup (the static equivalent shows them), the
 *   data object in the data file (validated against its schema), `integrity`, `dateModified`, a
 *   history entry and the history journal.
 * - `exportFormData`: the data object of one form as JSON, validated against the schema; an
 *   invalid object is never exported.
 */
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { fromUtf8, utf8 } from '../bytes.js';
import type { DomDocument } from '../calc/dom.js';
import { inlineRelativeRefs, schemaProblems, validateInstance } from '../check/jsonschema.js';
import { readContainer, type ReadContainer } from '../container.js';
import { continueJournal } from '../edit/journal.js';
import { sriSha256 } from '../hash.js';
import { opfWithModified, rewrite, updateIntegrity } from '../update.js';
import { FormDocument } from './document.js';
import type { FieldKind, FieldType, FormData, FormProblem, FormStatus } from './model.js';

const XHTML = 'application/xhtml+xml';
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
type Json = Record<string, unknown>;

/** Submitting was refused: the problems say why. Nothing was written. */
export class FormRejected extends Error {
  constructor(readonly problems: readonly FormProblem[]) {
    super(`Absenden abgelehnt: ${problems.length} Problem${problems.length === 1 ? '' : 'e'}`);
    this.name = 'FormRejected';
  }
}

export interface FormEntry {
  /** Form id; may be left out when the field name is unique in the container. */
  readonly form?: string;
  readonly field: string;
  /** Entry as a user would type it (`1.234,50`, `12.10.2026`, `ja`). */
  readonly value: string;
}

export interface FieldReport {
  readonly name: string;
  readonly kind: FieldKind;
  readonly type: FieldType;
  readonly label: string;
  readonly required: boolean;
  readonly relevant: boolean;
  readonly formula: string | null;
  /** Display text. */
  readonly text: string;
  readonly value: string | number | boolean | null;
}

export interface FormReport {
  readonly id: string;
  readonly document: string;
  readonly dataPath: string;
  readonly schemaPath: string | null;
  readonly status: FormStatus | null;
  readonly submittedAt: string | null;
  readonly fields: readonly FieldReport[];
  readonly conditions: ReadonlyArray<{ readonly id: string; readonly formula: string; readonly relevant: boolean }>;
  readonly checks: ReadonlyArray<{ readonly id: string; readonly formula: string; readonly result: boolean | string | null; readonly message: string }>;
  /** What prevents submitting (empty = could be submitted). */
  readonly problems: readonly FormProblem[];
  /** Markup, manifest and schema do not fit together. */
  readonly consistency: readonly string[];
}

function checkTime(name: string, value: string): void {
  if (!UTC_RE.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${name} must be a UTC timestamp YYYY-MM-DDThh:mm:ssZ, got ${value}`);
}

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

interface Loaded {
  readonly c: ReadContainer;
  readonly docs: Array<{ path: string; text: string; doc: DomDocument; forms: FormDocument }>;
  /** Data path → schema path (manifest.json#data). */
  readonly declared: Map<string, string | null>;
}

async function load(bytes: Uint8Array): Promise<Loaded> {
  const c = await readContainer(bytes);
  const manifest = c.manifest as unknown as Json;
  const declared = new Map<string, string | null>();
  for (const d of Array.isArray(manifest.data) ? (manifest.data as Json[]) : []) if (typeof d.url === 'string') declared.set(d.url, typeof d.schema === 'string' ? d.schema : null);
  const docs: Loaded['docs'] = [];
  for (const item of c.manifest.readingOrder) {
    if (item.type !== XHTML) continue;
    const data = c.files.get(item.url);
    if (!data) continue;
    const text = fromUtf8(data);
    if (!text.includes('data-hp-form')) continue;
    const doc = parseXhtml(data, item.url);
    const forms = new FormDocument(doc, { documentId: c.manifest.id });
    if (forms.hasForms) docs.push({ path: item.url, text, doc, forms });
  }
  return { c, docs, declared };
}

/** Schema of a data file with relative `$ref` inlined; `error` when it cannot be used. */
export function loadSchema(files: ReadonlyMap<string, Uint8Array>, schemaPath: string): { schema?: unknown; error?: string } {
  const json = (p: string): { ok: true; value: unknown } | { ok: false; grund: string } => {
    const b = files.get(p);
    if (!b) return { ok: false, grund: `${p} fehlt im Container` };
    try {
      return { ok: true, value: JSON.parse(fromUtf8(b)) as unknown };
    } catch {
      return { ok: false, grund: `${p} ist kein JSON` };
    }
  };
  const loaded = json(schemaPath);
  if (!loaded.ok) return { error: loaded.grund };
  const problems = schemaProblems(loaded.value);
  if (problems.length > 0) return { error: `${schemaPath}: ${problems[0]!.message}` };
  const inlined = inlineRelativeRefs(loaded.value, schemaPath, json);
  return inlined.ok ? { schema: inlined.value } : { error: inlined.grund };
}

function readData(files: ReadonlyMap<string, Uint8Array>, path: string): FormData | undefined {
  const b = files.get(path);
  if (!b) return undefined;
  try {
    return JSON.parse(fromUtf8(b)) as FormData;
  } catch {
    return undefined;
  }
}

function schemaFor(l: Loaded, dataPath: string): { path: string | null; schema?: unknown; error?: string } {
  const path = l.declared.get(dataPath) ?? null;
  if (path === null) return { path };
  return { path, ...loadSchema(l.c.files, path) };
}

function report(l: Loaded, docPath: string, fd: FormDocument, formId: string): FormReport {
  const form = fd.form(formId)!;
  const s = schemaFor(l, form.dataPath);
  const consistency: string[] = [];
  if (!l.declared.has(form.dataPath)) consistency.push(`${form.dataPath} ist nicht in manifest.json#data verzeichnet`);
  if (!l.c.files.has(form.dataPath)) consistency.push(`${form.dataPath} fehlt im Container`);
  if (l.declared.has(form.dataPath) && s.path === null) consistency.push(`${form.dataPath} hat kein Schema (manifest.json#data[].schema)`);
  if (s.error) consistency.push(`Schema unbrauchbar: ${s.error}`);
  if (s.schema && typeof s.schema === 'object') {
    const deref = (x: unknown): Json | undefined => {
      let v = x as Json | undefined;
      for (let i = 0; i < 8 && v && typeof v.$ref === 'string' && v.$ref.startsWith('#/'); i++) {
        v = v.$ref
          .slice(2)
          .split('/')
          .reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Json)[k.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined), s.schema) as Json | undefined;
      }
      return v;
    };
    const valuesSchema = deref(((s.schema as Json).properties as Json | undefined)?.values);
    const props = valuesSchema && typeof valuesSchema.properties === 'object' ? Object.keys(valuesSchema.properties as Json) : null;
    if (props) {
      for (const f of form.order) if (!props.includes(f.name)) consistency.push(`Feld ${f.name} fehlt im Schema`);
      for (const p of props) if (!form.fields.has(p)) consistency.push(`Schema nennt ${p}, das Formular hat kein solches Feld`);
    } else consistency.push('Schema beschreibt properties.values.properties nicht');
  }
  const data = readData(l.c.files, form.dataPath);
  const values = fd.data(formId, 'draft').values;
  const problems = fd.validate(formId, s.schema);
  if (s.error) problems.push({ form: formId, code: 'schema', message: `Schema unbrauchbar: ${s.error}` });
  return {
    id: form.id,
    document: docPath,
    dataPath: form.dataPath,
    schemaPath: s.path,
    status: data?.status ?? null,
    submittedAt: data?.submittedAt ?? null,
    fields: form.order.map((f) => {
      const p = fd.patch(f);
      const relevant = !f.condition || f.condition.relevant;
      return { name: f.name, kind: f.kind, type: f.type, label: f.label, required: f.required, relevant, formula: f.formula, text: p.text, value: values[f.name] ?? null };
    }),
    conditions: form.conditions.map((c) => ({ id: c.id, formula: c.formula, relevant: c.relevant })),
    checks: form.checks.map((c) => ({ id: c.id, formula: c.formula, result: c.result, message: c.message })),
    problems,
    consistency,
  };
}

/** Every form of the main version (see module comment). */
export async function inspectForms(bytes: Uint8Array): Promise<FormReport[]> {
  const l = await load(bytes);
  return l.docs.flatMap((d) => d.forms.forms.map((f) => report(l, d.path, d.forms, f.id)));
}

export interface FillOptions {
  readonly set?: readonly FormEntry[];
  /** Submit the forms concerned (all forms when `forms` is not given and nothing is set). */
  readonly submit?: boolean;
  /** Restrict submitting to these form ids. */
  readonly forms?: readonly string[];
  /** Time of the change, also `dateModified` and `submittedAt` (RFC 3339, UTC). */
  readonly time: string;
  readonly note?: string;
}

export interface FillResult {
  readonly bytes: Uint8Array;
  readonly forms: readonly FormReport[];
  /** Data objects written, by data path (exactly the stored file content). */
  readonly data: ReadonlyMap<string, FormData>;
}

function validateData(l: Loaded, dataPath: string, data: FormData): FormProblem[] {
  const s = schemaFor(l, dataPath);
  if (s.path === null) return [{ form: data.form, code: 'schema', message: `${dataPath} hat kein Schema; ungeprüfte Daten werden nicht geschrieben.` }];
  if (s.error) return [{ form: data.form, code: 'schema', message: `Schema unbrauchbar: ${s.error}` }];
  return validateInstance(data, s.schema as boolean | Json).map((p) => ({ form: data.form, code: 'schema' as const, path: p.path, message: `Daten entsprechen nicht dem Schema: ${p.path} ${p.message}` }));
}

/** Fills and optionally submits forms (see module comment). */
export async function fillForms(bytes: Uint8Array, options: FillOptions): Promise<FillResult> {
  checkTime('time', options.time);
  const l = await load(bytes);
  if (l.docs.length === 0) throw new Error('the container has no form (form[data-hp-form])');
  const touched = new Set<string>();
  for (const e of options.set ?? []) {
    const hits = l.docs.flatMap((d) => d.forms.forms.filter((f) => (e.form === undefined || f.id === e.form) && f.fields.has(e.field)).map((f) => ({ d, f })));
    if (hits.length === 0) throw new Error(`no such field: ${e.form ? `${e.form}.` : ''}${e.field}`);
    if (hits.length > 1) throw new Error(`field ${e.field} is ambiguous; name the form (${hits.map((h) => h.f.id).join(', ')})`);
    const { d, f } = hits[0]!;
    // An entry that does not fit stays as typed (null in the data); submitting reports it below.
    d.forms.setEntry(f.id, e.field, e.value);
    touched.add(f.id);
  }
  const targets = l.docs.flatMap((d) => d.forms.forms.map((f) => ({ d, f })));
  const submitting = new Set(options.submit ? (options.forms ?? (touched.size > 0 ? [...touched] : targets.map((t) => t.f.id))) : []);
  for (const id of submitting) if (!targets.some((t) => t.f.id === id)) throw new Error(`no such form: ${id}`);

  // Validation before anything is written: submitting needs every concerned form valid.
  const problems: FormProblem[] = [];
  for (const { d, f } of targets) {
    if (!submitting.has(f.id)) continue;
    problems.push(...d.forms.validate(f.id, schemaFor(l, f.dataPath).schema, { documentTime: options.time }));
    const s = schemaFor(l, f.dataPath);
    if (s.path === null) problems.push({ form: f.id, code: 'schema', message: `${f.dataPath} hat kein Schema; ohne Schema wird nicht abgesendet.` });
    if (s.error) problems.push({ form: f.id, code: 'schema', message: `Schema unbrauchbar: ${s.error}` });
  }
  if (problems.length > 0) throw new FormRejected(problems);

  const changed = new Map<string, Uint8Array>();
  const written = new Map<string, FormData>();
  for (const { d, f } of targets) {
    if (!touched.has(f.id) && !submitting.has(f.id)) continue;
    const old = readData(l.c.files, f.dataPath);
    const status: FormStatus = submitting.has(f.id) ? 'submitted' : 'draft';
    const data = status === 'submitted' ? d.forms.data(f.id, status, options.time) : d.forms.draftData(f.id, schemaFor(l, f.dataPath).schema).data;
    // A draft keeps the status "submitted" only if nothing changed since submitting.
    const same = old && JSON.stringify(old.values) === JSON.stringify(data.values);
    const stored: FormData = status === 'draft' && same && old.status === 'submitted' ? old : data;
    const bad = validateData(l, f.dataPath, stored);
    if (bad.length > 0) throw new FormRejected(bad);
    if (!l.declared.has(f.dataPath) || !l.c.files.has(f.dataPath)) throw new Error(`${f.dataPath} is not a declared data file of this container`);
    changed.set(f.dataPath, utf8(JSON.stringify(stored, null, 2) + '\n'));
    written.set(f.dataPath, stored);
  }
  for (const d of l.docs) {
    d.forms.write();
    const out = serializeXhtml(d.doc, d.text);
    if (out !== d.text) changed.set(d.path, utf8(out));
  }
  const opfText = fromUtf8(l.c.files.get(l.c.packagePath)!);
  const opf = opfWithModified(opfText, options.time);
  if (opf !== opfText) changed.set(l.c.packagePath, utf8(opf));
  const old = JSON.parse(fromUtf8(l.c.files.get('manifest.json')!)) as Json;
  let manifest = await updateIntegrity({ ...old, dateModified: options.time }, changed);
  const history = Array.isArray(old.history) ? [...(old.history as Json[])] : [];
  const fields = (options.set ?? []).map((e) => (e.form ? `${e.form}.${e.field}` : e.field));
  const note =
    options.note ??
    (submitting.size > 0
      ? `Formular ${[...submitting].join(', ')} abgesendet${fields.length > 0 ? `; Felder: ${fields.join(', ')}` : ''}`
      : `Formular ausgefüllt: ${fields.join(', ') || 'keine Felder'}`);
  history.push({
    version: history.length > 0 ? Math.max(...history.map((h) => Number(h.version) || 0)) + 1 : 1,
    dateModified: options.time,
    note,
    manifestIntegrity: await sriSha256(l.c.files.get('manifest.json')!),
  });
  manifest = { ...manifest, history };
  const out = await continueJournal(l.c, await rewrite(l.c, changed, manifest, options.time));
  const after = await load(out);
  return { bytes: out, forms: after.docs.flatMap((d) => d.forms.forms.map((f) => report(after, d.path, d.forms, f.id))), data: written };
}

export interface ExportResult {
  readonly form: string;
  readonly data: FormData;
  /** Exactly the bytes to hand over: two-space JSON with final newline. */
  readonly json: string;
  readonly schemaPath: string;
}

/**
 * The data object of a form as JSON (status from the data file; `draft` when the markup holds
 * other values than the submitted data). Throws `FormRejected` when it is not valid against the
 * schema or when there is no schema.
 */
export async function exportFormData(bytes: Uint8Array, formId?: string): Promise<ExportResult> {
  const l = await load(bytes);
  const all = l.docs.flatMap((d) => d.forms.forms.map((f) => ({ d, f })));
  const hit = formId === undefined ? (all.length === 1 ? all[0] : undefined) : all.find((t) => t.f.id === formId);
  if (!hit) throw new Error(formId === undefined ? `name the form (${all.map((t) => t.f.id).join(', ') || 'none'})` : `no such form: ${formId}`);
  const { d, f } = hit;
  const stored = readData(l.c.files, f.dataPath);
  const current = d.forms.draftData(f.id, schemaFor(l, f.dataPath).schema).data;
  const data: FormData = stored && stored.status === 'submitted' && JSON.stringify(stored.values) === JSON.stringify(current.values) ? stored : current;
  const s = schemaFor(l, f.dataPath);
  if (s.path === null) throw new FormRejected([{ form: f.id, code: 'schema', message: `${f.dataPath} hat kein Schema; ungeprüfte Daten werden nicht exportiert.` }]);
  const bad = validateData(l, f.dataPath, data);
  if (bad.length > 0) throw new FormRejected(bad);
  return { form: f.id, data, json: JSON.stringify(data, null, 2) + '\n', schemaPath: s.path };
}
