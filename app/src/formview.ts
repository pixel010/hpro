/**
 * Forms in the reader (package P6, HPC-0009).
 *
 * Like tables (calcview.ts) the form logic of the core runs in the reader shell, never in the
 * document frame: the frame agent sends each entry, the shell calculates, evaluates conditions and
 * validates with the core and answers with the new displays, the sections that apply and the
 * messages to show. The values are also written into the shell's copy of the content document, so
 * that print (P18) shows what was entered. Nothing leaves the reader: "Absenden" validates, and only
 * when everything is valid the core writes the submitted container and the data export, which the
 * user saves and passes on (HP-SBX-013: forms do not send).
 *
 * Messages appear for a field once it was left after typing, and for every field after "Prüfen"
 * or a refused "Absenden" — never while the user is still typing the first time.
 */
import { form } from '@hpro/kern';
import type { ContentDocument, LoadedDocument } from './document.js';

export type FormMode = 'live' | 'readonly';

export interface FormMessage {
  readonly form: string;
  /** Field name, or empty for a rule or a form-wide problem. */
  readonly field: string;
  /** Id of the check rule element. */
  readonly check: string;
  readonly message: string;
  /** Id of the element to jump to (control of the field, rule element, form). */
  readonly target: string;
}

export interface FormUpdate {
  readonly forms: ReadonlyArray<{
    readonly id: string;
    readonly fields: readonly form.FieldPatch[];
    readonly sections: ReadonlyArray<{ readonly id: string; readonly relevant: boolean }>;
    /** Messages to show now (touched fields, or all after an attempt). */
    readonly messages: readonly FormMessage[];
    /** Rules that are satisfied or not applicable: their message is hidden. */
    readonly passed: readonly string[];
    /** All problems, shown as summary after "Prüfen"/"Absenden". */
    readonly summary: readonly FormMessage[] | null;
    readonly status: string;
  }>;
  /** Field whose entry caused the update, with its result. */
  readonly entry?: { readonly field: string; readonly ok: boolean; readonly message?: string };
  /** Move the focus to the summary of this form (after a refused attempt). */
  readonly focusSummary?: string;
  readonly ms?: number;
}

interface Bound {
  readonly content: ContentDocument;
  readonly fd: form.FormDocument;
}

/** Id given to a control without one in the frame copy (same rule in annotateForms and messages). */
export function controlId(formId: string, name: string): string {
  return `hp-feld-${formId}-${name}`.replace(/[^A-Za-z0-9_-]/g, '_');
}

function firstId(f: form.FieldModel): string {
  return f.elements[0]!.getAttribute('id') ?? controlId(f.form.id, f.name);
}

export class FormSession {
  private readonly bound = new Map<string, Bound>();
  private readonly schemas = new Map<string, unknown>();
  private readonly schemaErrors = new Map<string, string>();
  /** Entries as typed, for saving with the core (key form.field). */
  private readonly entries = new Map<string, form.FormEntry>();
  private readonly touched = new Map<string, Set<string>>();
  private readonly attempted = new Set<string>();
  /** Data files as stored in the opened file (status, submission time). */
  private readonly stored = new Map<string, form.FormData>();

  constructor(
    readonly doc: LoadedDocument,
    readonly mode: FormMode,
  ) {
    const manifest = doc.manifest as unknown as Record<string, unknown>;
    const declared = new Map<string, string>();
    for (const d of Array.isArray(manifest['data']) ? (manifest['data'] as Array<Record<string, unknown>>) : []) {
      if (typeof d['url'] === 'string' && typeof d['schema'] === 'string') declared.set(d['url'], d['schema']);
    }
    for (const content of doc.content) {
      if (!content.dom.querySelector('form[data-hp-form]')) continue;
      const fd = new form.FormDocument(content.dom as unknown as import('@hpro/kern').calc.DomDocument, { language: doc.language, documentId: doc.id });
      if (!fd.hasForms) continue;
      this.bound.set(content.path, { content, fd });
      for (const f of fd.forms) {
        const schemaPath = declared.get(f.dataPath);
        if (schemaPath) {
          const s = form.loadSchema(doc.files, schemaPath);
          if (s.error) this.schemaErrors.set(f.dataPath, s.error);
          else this.schemas.set(f.dataPath, s.schema);
        } else this.schemaErrors.set(f.dataPath, `${f.dataPath} hat kein Schema in manifest.json#data`);
        const bytes = doc.files.get(f.dataPath);
        if (bytes) {
          try {
            this.stored.set(f.dataPath, JSON.parse(new TextDecoder().decode(bytes)) as form.FormData);
          } catch {
            /* unreadable data file: status unknown */
          }
        }
      }
      // The shell's copy holds what the reader shows and prints.
      if (mode === 'live') fd.write();
    }
  }

  get hasForms(): boolean {
    return this.bound.size > 0;
  }

  get entryCount(): number {
    return this.entries.size;
  }

  formsOf(path: string): form.FormModel[] {
    return this.bound.get(path)?.fd.forms ?? [];
  }

  /** Every form id with its content document. */
  allForms(): Array<{ path: string; id: string; dataPath: string }> {
    return [...this.bound].flatMap(([path, b]) => b.fd.forms.map((f) => ({ path, id: f.id, dataPath: f.dataPath })));
  }

  /** Sections whose condition is false (hidden in the frame copy). */
  hiddenSections(path: string): Set<string> {
    const out = new Set<string>();
    for (const f of this.formsOf(path)) for (const c of f.conditions) if (!c.relevant) out.add(c.id);
    return out;
  }

  statusText(dataPath: string): string {
    const d = this.stored.get(dataPath);
    const changed = [...this.entries.values()].some((e) => this.allForms().some((f) => f.dataPath === dataPath && f.id === e.form));
    if (d?.status === 'submitted' && !changed) return `abgesendet am ${d.submittedAt ? `${d.submittedAt.slice(8, 10)}.${d.submittedAt.slice(5, 7)}.${d.submittedAt.slice(0, 4)}` : '?'}`;
    return changed ? 'Entwurf, ungespeicherte Eingaben' : 'Entwurf';
  }

  /** Data status for print: the stored data, or a draft when there are unsaved entries. */
  dataFor(dataPath: string): form.FormData | undefined {
    const forms = this.allForms().filter((f) => f.dataPath === dataPath);
    const changed = [...this.entries.values()].some((e) => forms.some((f) => f.id === e.form));
    const stored = this.stored.get(dataPath);
    if (!changed) return stored;
    return { form: forms[0]?.id ?? '', status: 'draft', values: {} };
  }

  schemaFor(dataPath: string): unknown {
    return this.schemas.get(dataPath);
  }

  /** Problems of a form as messages, in document order. */
  problems(path: string, formId: string): FormMessage[] {
    const b = this.bound.get(path);
    const f = b?.fd.form(formId);
    if (!b || !f) return [];
    const list = b.fd.validate(formId, this.schemas.get(f.dataPath));
    const err = this.schemaErrors.get(f.dataPath);
    if (err) list.push({ form: formId, code: 'schema', message: `Schema unbrauchbar: ${err}` });
    return list.map((p) => {
      const field = p.field ? f.fields.get(p.field) : undefined;
      const target = field ? firstId(field) : p.check ? p.check : formId;
      return { form: formId, field: p.field ?? '', check: p.check ?? '', message: p.message, target };
    });
  }

  private formUpdate(path: string, formId: string, all: boolean): FormUpdate['forms'][number] {
    const b = this.bound.get(path)!;
    const f = b.fd.form(formId)!;
    const touched = this.touched.get(formId) ?? new Set<string>();
    const attempted = this.attempted.has(formId) || all;
    const problems = this.problems(path, formId);
    const messages = problems.filter((m) => {
      if (attempted) return true;
      if (m.field) return touched.has(m.field);
      if (m.check) {
        // a rule speaks once the user left one of the entry fields it depends on (also through formulas)
        const rule = f.checks.find((c) => c.id === m.check);
        return rule ? b.fd.inputNames(formId, rule.names).some((n) => touched.has(n)) : false;
      }
      return false;
    });
    const failed = new Set(problems.filter((m) => m.check).map((m) => m.check));
    return {
      id: formId,
      fields: b.fd.patches(formId),
      sections: f.conditions.map((c) => ({ id: c.id, relevant: c.relevant })),
      messages,
      passed: f.checks.filter((c) => !failed.has(c.id)).map((c) => c.id),
      summary: attempted ? problems : null,
      status: this.statusText(f.dataPath),
    };
  }

  /** Complete state of the forms of a content document (after rendering). */
  snapshot(path: string): FormUpdate {
    return { forms: this.formsOf(path).map((f) => this.formUpdate(path, f.id, false)) };
  }

  /**
   * An entry (`field` = `form.name`). `final` when the user left the field or changed a choice;
   * from then on its messages are shown.
   */
  input(path: string, field: string, raw: string, final: boolean): FormUpdate {
    const t0 = performance.now();
    const b = this.bound.get(path);
    const dot = field.indexOf('.');
    const formId = field.slice(0, dot);
    const name = field.slice(dot + 1);
    if (!b || this.mode !== 'live' || !b.fd.form(formId)?.fields.has(name)) return { forms: [], entry: { field, ok: false, message: 'Dieses Formular ist schreibgeschützt.' } };
    const r = b.fd.setEntry(formId, name, raw);
    this.entries.set(field, { form: formId, field: name, value: raw });
    if (final) (this.touched.get(formId) ?? this.touched.set(formId, new Set()).get(formId)!).add(name);
    b.fd.write();
    const update = this.formUpdate(path, formId, false);
    return { forms: [update], entry: { field, ok: r.ok, ...(r.message ? { message: r.message } : {}) }, ms: performance.now() - t0 };
  }

  /** "Prüfen": show every problem, with summary. */
  check(path: string, formId: string): FormUpdate {
    this.attempted.add(formId);
    const u = this.formUpdate(path, formId, true);
    return { forms: [u], ...(u.summary && u.summary.length > 0 ? { focusSummary: formId } : {}) };
  }

  /** Problems that prevent submitting, after marking the form as attempted. */
  attempt(path: string, formId: string): FormMessage[] {
    this.attempted.add(formId);
    return this.problems(path, formId);
  }

  private static stamp(now: Date): string {
    return new Date(Math.floor(now.getTime() / 1000) * 1000).toISOString().replace('.000Z', 'Z');
  }

  /** The filled-in document as a new container (draft); the core applies the same entries. */
  async save(now: Date): Promise<form.FillResult> {
    return form.fillForms(this.doc.bytes, { set: [...this.entries.values()], time: FormSession.stamp(now) });
  }

  /** Submits one form: the core validates again and refuses (FormRejected) unless valid. */
  async submit(formId: string, now: Date): Promise<{ result: form.FillResult; exported: form.ExportResult }> {
    const result = await form.fillForms(this.doc.bytes, { set: [...this.entries.values()], submit: true, forms: [formId], time: FormSession.stamp(now) });
    const exported = await form.exportFormData(result.bytes, formId);
    return { result, exported };
  }

  /**
   * Data export of the current entries (status draft unless unchanged since submitting),
   * validated against the schema by the core; FormRejected when invalid.
   */
  async exportData(formId: string, now: Date): Promise<form.ExportResult> {
    const bytes = this.entries.size > 0 ? (await this.save(now)).bytes : this.doc.bytes;
    return form.exportFormData(bytes, formId);
  }
}

const SUMMARY_TITLE = 'Das Formular kann noch nicht abgesendet werden:';

/**
 * Marks the forms of the frame copy of a content document (render.ts): field addresses for the
 * agent, ids for controls without one, a message element per field, the summary at the start and
 * the action buttons at the end of each live form, sections that do not apply hidden. Works on the
 * copy, never on the source; the stored markup keeps every section visible (HP-NEST-001).
 */
export function annotateForms(doc: Document, mode: FormMode | 'none', hidden: ReadonlySet<string> = new Set()): void {
  if (mode === 'none') return;
  for (const formEl of Array.from(doc.querySelectorAll('form[data-hp-form]'))) {
    const formId = formEl.getAttribute('id') ?? '';
    if (!formId) continue;
    formEl.setAttribute('data-hp-form-id', formId);
    formEl.setAttribute('novalidate', '');
    const seen = new Set<string>();
    for (const el of Array.from(formEl.querySelectorAll('input[name], select[name], textarea[name], output[name]'))) {
      const name = el.getAttribute('name')!;
      el.setAttribute('data-hp-field', `${formId}.${name}`);
      if (!el.id) el.id = controlId(formId, name);
      if (el.localName === 'output') continue;
      if (mode === 'readonly') {
        el.setAttribute('disabled', '');
        continue;
      }
      if (seen.has(name)) continue; // radio group: one message for the group
      seen.add(name);
      const msg = doc.createElement('span');
      msg.className = 'hp-field-msg';
      msg.setAttribute('data-hp-reader', 'form-msg');
      msg.setAttribute('data-hp-msg-for', `${formId}.${name}`);
      msg.id = `hp-msg-${formId}-${name}`.replace(/[^A-Za-z0-9_-]/g, '_');
      msg.hidden = true;
      const group = el.getAttribute('type') === 'radio' ? el.closest('fieldset') : null;
      if (group && formEl.contains(group)) group.append(msg);
      else el.parentElement?.append(msg);
      const radios = el.getAttribute('type') === 'radio' ? Array.from(formEl.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)) : [el];
      for (const r of radios) r.setAttribute('aria-describedby', `${r.getAttribute('aria-describedby') ?? ''} ${msg.id}`.trim());
      if (el.hasAttribute('required')) for (const r of radios) r.setAttribute('aria-required', 'true');
    }
    for (const rule of Array.from(formEl.querySelectorAll('[data-hp-check]'))) {
      if (!rule.id) continue;
      const msg = doc.createElement('span');
      msg.className = 'hp-check-msg';
      msg.setAttribute('data-hp-reader', 'form-check');
      msg.hidden = true;
      msg.textContent = rule.getAttribute('data-hp-check-message') ?? 'Prüfung nicht erfüllt.';
      rule.append(msg);
    }
    for (const id of hidden) {
      const section = formEl.querySelector(`#${CSS.escape(id)}`);
      if (section) section.setAttribute('hidden', '');
    }
    if (mode === 'readonly') continue;
    const summary = doc.createElement('div');
    summary.className = 'hp-form-summary';
    summary.setAttribute('data-hp-reader', 'form-summary');
    summary.setAttribute('data-hp-summary-for', formId);
    summary.setAttribute('role', 'alert');
    summary.tabIndex = -1;
    summary.hidden = true;
    const heading = formEl.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading && heading.parentElement === formEl) heading.after(summary);
    else formEl.prepend(summary);
    const bar = doc.createElement('p');
    bar.className = 'hp-form-actions';
    bar.setAttribute('data-hp-reader', 'form-actions');
    const status = doc.createElement('span');
    status.className = 'hp-form-state';
    status.setAttribute('data-hp-state-for', formId);
    status.setAttribute('role', 'status');
    for (const [action, label] of [
      ['check', 'Eingaben prüfen'],
      ['save', 'Entwurf speichern'],
      ['export', 'Daten exportieren (JSON)'],
      ['submit', 'Absenden'],
    ] as const) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = action === 'submit' ? 'hp-form-button primary' : 'hp-form-button';
      button.setAttribute('data-hp-form-action', action);
      button.setAttribute('data-hp-form', formId);
      button.textContent = label;
      bar.append(button, ' ');
    }
    bar.append(status);
    formEl.append(bar);
  }
}

export { SUMMARY_TITLE };
