/**
 * Static form (package P6, HPC-0009): the form as text, for a frozen rendition (part 1, 7.3) and for
 * print (P18). Every control becomes a `span.hp-field` with the value as shown, a section whose
 * condition is false is replaced by a note, and a line after the heading of the form names the
 * data file, its status and the result of validation. There is no control, no condition and no
 * check rule left; calculated fields keep formula and value (HPF-FRZ: formula stays traceable).
 *
 * Works on any W3C DOM (reader and @xmldom/xmldom).
 */
import { XHTML_NS, descendants, type DomDocument, type DomElement } from '../calc/dom.js';
import { EMPTY } from '../calc/values.js';
import { FormDocument, fieldText } from './document.js';
import type { FieldModel, FormData } from './model.js';

interface TreeNode {
  readonly parentNode: (TreeNode & { insertBefore(n: unknown, r: unknown): unknown; replaceChild(n: unknown, o: unknown): unknown; removeChild(n: unknown): unknown }) | null;
  readonly nextSibling: unknown;
}

export interface FreezeFormsOptions {
  /** Data file content by container path (status and submission time for the note). */
  readonly data?: (path: string) => FormData | undefined;
  /** JSON schema by data path, to report validation in the note. */
  readonly schema?: (path: string) => unknown;
  /** Where the form is used: `rendition` (frozen version) or `print`. */
  readonly purpose?: 'rendition' | 'print';
  readonly language?: string | null;
}

export interface FrozenForm {
  readonly id: string;
  readonly fields: number;
  readonly omitted: readonly string[];
  readonly problems: number;
  readonly status: string;
}

function el(doc: DomDocument, name: string, attrs: Record<string, string>, text?: string): DomElement {
  const e = doc.createElementNS(XHTML_NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.appendChild(doc.createTextNode(text));
  return e;
}

function replace(node: DomElement, by: DomElement): void {
  (node as unknown as TreeNode).parentNode!.replaceChild(by, node);
}

function remove(node: DomElement): void {
  (node as unknown as TreeNode).parentNode?.removeChild(node);
}

function after(node: DomElement, add: DomElement): void {
  const parent = (node as unknown as TreeNode).parentNode!;
  parent.insertBefore(add, (node as unknown as TreeNode).nextSibling);
}

function statusText(data: FormData | undefined): string {
  if (!data) return 'keine Formulardaten';
  if (data.status === 'submitted') return `abgesendet am ${data.submittedAt ? `${data.submittedAt.slice(8, 10)}.${data.submittedAt.slice(5, 7)}.${data.submittedAt.slice(0, 4)} ${data.submittedAt.slice(11, 16)} UTC` : '(Zeit unbekannt)'}`;
  return 'Entwurf, nicht abgesendet';
}

/** Text of one field for the static form. */
function shown(f: FieldModel, fd: FormDocument): string {
  if (f.entryError !== null) return `${f.raw ?? ''} (ungültige Eingabe)`;
  if (f.kind === 'checkbox') return f.value === true ? '☒ ja' : '☐ nein';
  if (f.value === EMPTY) return '–';
  if (f.kind === 'select') {
    const opt = descendants(f.elements[0]!).find((o) => (o.localName ?? '') === 'option' && (o.getAttribute('value') ?? (o.textContent ?? '').trim()) === f.value);
    if (opt) return (opt.textContent ?? '').replace(/\s+/g, ' ').trim();
  }
  return fieldText(f, f.value, fd.style, true);
}

/** Replaces the forms of a document by their static form; returns what was frozen. */
export function freezeForms(doc: DomDocument, options: FreezeFormsOptions = {}): FrozenForm[] {
  const fd = new FormDocument(doc, { language: options.language ?? null });
  const out: FrozenForm[] = [];
  for (const form of fd.forms) {
    const data = options.data?.(form.dataPath);
    const problems = fd.validate(form.id, options.schema?.(form.dataPath));
    const omitted: string[] = [];
    // Radio buttons: a mark per button, the label stays.
    for (const f of form.order) {
      if (f.kind === 'radio') {
        for (const r of f.elements) {
          const on = f.value !== EMPTY && (r.getAttribute('value') ?? 'on') === f.value;
          replace(r, el(doc, 'span', { class: 'hp-field hp-field-choice', 'data-hp-field': f.name }, on ? '◉' : '○'));
        }
        continue;
      }
      const control = f.elements[0]!;
      if (f.kind === 'output') {
        // keeps formula and value; only the class marks it as a field
        control.setAttribute('class', `${control.getAttribute('class') ?? ''} hp-field`.trim());
        if (f.value === EMPTY) control.appendChild(doc.createTextNode('–'));
        continue;
      }
      const attrs: Record<string, string> = { class: f.kind === 'textarea' ? 'hp-field hp-field-text' : 'hp-field', 'data-hp-field': f.name };
      const id = control.getAttribute('id');
      if (id) attrs.id = id;
      replace(control, el(doc, 'span', attrs, shown(f, fd)));
    }
    // Sections whose condition is false: a note in their place.
    for (const c of form.conditions) {
      if (c.relevant) {
        c.element.removeAttribute('hidden');
        continue;
      }
      if (c.parent && !c.parent.relevant) continue; // removed with its parent
      omitted.push(c.id);
      replace(c.element, el(doc, 'p', { class: 'hp-form-omitted', id: c.id }, `Abschnitt „${c.title}“ entfällt: Bedingung nicht erfüllt.`));
    }
    // A label may only point at a control (HTML: labelable element); the fields are text now.
    const labelable = new Set(['button', 'input', 'meter', 'output', 'progress', 'select', 'textarea']);
    const byId = new Map(descendants(doc).filter((e) => e.getAttribute('id')).map((e) => [e.getAttribute('id')!, e]));
    for (const l of descendants(form.element).filter((e) => (e.localName ?? '') === 'label' && e.hasAttribute('for'))) {
      const target = byId.get(l.getAttribute('for')!);
      if (!target || !labelable.has(target.localName ?? '')) l.removeAttribute('for');
    }
    for (const e of descendants(form.element)) {
      for (const a of ['data-hp-when', 'data-hp-check', 'data-hp-check-message', 'data-hp-message', 'required', 'pattern', 'minlength', 'maxlength']) e.removeAttribute(a);
      if ((e.localName ?? '') === 'button') remove(e);
    }
    const fields = form.order.length;
    const status = statusText(data);
    const failed = problems.length;
    const note = el(
      doc,
      'p',
      { class: 'hp-form-status', 'data-hp-role': 'form-status' },
      `Formular „${form.id}“ (${options.purpose === 'print' ? 'Ausdruck' : 'eingefrorene Fassung'}): ${fields} Felder, Daten in ${form.dataPath}, ${status}; ` +
        (failed === 0 ? 'alle Prüfungen erfüllt.' : `${failed} Prüfung${failed === 1 ? '' : 'en'} nicht erfüllt: ${problems.map((p) => p.message).join(' ')}`),
    );
    // A div with the form's id and class replaces the form element: no form is left in the frozen text.
    const div = el(doc, 'div', { id: form.id, class: `${form.element.getAttribute('class') ?? ''} hp-form`.trim(), 'data-hp-frozen': 'form' });
    const lang = form.element.getAttribute('lang');
    if (lang) div.setAttribute('lang', lang);
    while (form.element.childNodes.length > 0) div.appendChild(form.element.childNodes.item(0)!);
    replace(form.element, div);
    const heading = descendants(div).find((e) => /^h[1-6]$/.test(e.localName ?? ''));
    if (heading) after(heading, note);
    else (div as unknown as { insertBefore(n: unknown, r: unknown): unknown }).insertBefore(note, (div as unknown as { firstChild: unknown }).firstChild);
    out.push({ id: form.id, fields, omitted, problems: failed, status });
  }
  return out;
}
