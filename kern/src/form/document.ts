/**
 * A content document with its forms, bound to the calculator (package P6, HPC-0009). Works on any
 * W3C DOM like `calc/dom.ts`: the reader's and @xmldom/xmldom.
 *
 * Calculation: calculated fields (`output[data-hp-formula]`) in dependency order, circular ones
 * `#CIRC!`; field names are named expressions ([Q1] §5.11), table cells of the same document are
 * reachable with the references of part 3 (`[kosten.E7]`). A field inside a section whose
 * condition is false counts as empty. Conditions may depend on calculated fields and those on
 * fields in conditional sections, so calculation and conditions are repeated until nothing
 * changes (at most 8 rounds; the order of the rounds is fixed, so the result is deterministic).
 *
 * Stored markup (`write`) keeps every conditional section visible, so a reader without calculator
 * shows the whole form (HP-NEST-001); only the reading system's copy hides what does not apply.
 *
 * Validation before submitting (`validate`): entries that do not fit the type, the HTML
 * constraints, error values of calculated fields, check rules, and the JSON Schema of the data
 * file. Fields in a section whose condition is false are not validated and are stored as `null`.
 */
import { CalcDocument, XHTML_NS, collapsedText, descendants, documentLanguage, storedValue, type DomDocument, type DomElement } from '../calc/dom.js';
import { isValidSerial, isoFromSerial, parseIsoDateTime } from '../calc/dates.js';
import { compile } from '../calc/engine.js';
import { Evaluator, scalar, type EvalContext } from '../calc/evaluate.js';
import { FUNCTIONS } from '../calc/functions.js';
import { decimalsShown, displayValue, formatNumber, numberStyle, parseUserEntry, type NumberStyle } from '../calc/format.js';
import { TableModel } from '../calc/model.js';
import { collectNames, isFormName, type Node } from '../calc/parser.js';
import { CIRC, EMPTY, NAME, STANDARD_NUMBER, isError, toLogical, type Scalar } from '../calc/values.js';
import { validateInstance } from '../check/jsonschema.js';
import type { CheckModel, ConditionModel, FieldKind, FieldModel, FieldType, FormData, FormModel, FormProblem, FormStatus } from './model.js';

const isHtml = (el: DomElement, ...names: string[]) => (el.namespaceURI === XHTML_NS || el.namespaceURI === null) && names.includes((el.localName ?? '').toLowerCase());

/** Input types a form field may have; others (file, password, hidden, buttons) are not fields. */
const INPUT_KINDS: Record<string, FieldKind> = { '': 'text', text: 'text', search: 'text', email: 'email', tel: 'tel', url: 'url', number: 'number', date: 'date', checkbox: 'checkbox', radio: 'radio' };
const FIELD_TYPES: readonly FieldType[] = ['string', 'float', 'currency', 'percentage', 'date', 'boolean'];
/** HTML: valid e-mail address (HTML Living Standard, 4.10.5.1.5). */
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const MAX_ROUNDS = 8;

const ERROR_TEXT: Record<string, string> = {
  '#DIV/0!': 'Division durch null',
  '#N/A': 'Wert nicht verfügbar',
  '#NAME?': 'unbekannter Name oder fehlerhafte Formel',
  '#NUM!': 'Ergebnis außerhalb des Zahlbereichs',
  '#REF!': 'ungültiger Bezug',
  '#VALUE!': 'falsche Wertart',
  '#NULL!': 'leere Schnittmenge',
  '#CIRC!': 'Zirkelbezug',
};

function children(el: DomElement): DomElement[] {
  const out: DomElement[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes.item(i);
    if (n && n.nodeType === 1) out.push(n as DomElement);
  }
  return out;
}

/** Text of an element without the text of nested controls (option lists, text areas, outputs). */
function labelText(el: DomElement): string {
  let s = '';
  const walk = (n: DomElement) => {
    for (let i = 0; i < n.childNodes.length; i++) {
      const c = n.childNodes.item(i)!;
      if (c.nodeType === 3) s += c.textContent ?? '';
      else if (c.nodeType === 1) {
        const e = c as DomElement;
        if (isHtml(e, 'select', 'textarea', 'output', 'input', 'button') || e.getAttribute('data-hp-reader') !== null) continue;
        walk(e);
      }
    }
  };
  walk(el);
  return s.replace(/[ \t\n\r\f]+/g, ' ').replace(/\s*[:*]\s*$/, '').trim();
}

function intAttr(el: DomElement, name: string): number | null {
  const v = el.getAttribute(name);
  if (v === null || !/^\d+$/.test(v.trim())) return null;
  return Number(v.trim());
}

function typeOf(el: DomElement, kind: FieldKind): FieldType {
  const t = el.getAttribute('data-hp-type');
  if (t !== null && (FIELD_TYPES as readonly string[]).includes(t)) return t as FieldType;
  if (kind === 'checkbox') return 'boolean';
  if (kind === 'number') return 'float';
  if (kind === 'date') return 'date';
  return kind === 'output' ? 'float' : 'string';
}

/** Stored type of a value: the field's type where it fits, else the kind of the value. */
export function valueType(f: Pick<FieldModel, 'type'>, v: Scalar): FieldType | 'error' {
  if (isError(v)) return 'error';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'number') return isNumeric(f.type) || f.type === 'date' ? f.type : 'float';
  return f.type;
}

/** `pattern` as HTML compiles it (whole value, v flag); null when it does not compile. */
export function patternRegExp(pattern: string): RegExp | null {
  try {
    return new RegExp(`^(?:${pattern})$`, 'v');
  } catch {
    return null;
  }
}

const isNumeric = (t: FieldType) => t === 'float' || t === 'currency' || t === 'percentage';

/** Number of a canonical number or ISO date (`min`/`max`). */
function boundOf(value: string | null, kind: FieldKind): number | null {
  if (value === null) return null;
  const v = value.trim();
  if (kind === 'date') {
    const p = parseIsoDateTime(v);
    return p && p.date !== null ? p.date : null;
  }
  return STANDARD_NUMBER.test(v.replace(/^-/, '')) ? Number(v) : null;
}

/** Display of a value in a text field, a calculated field or the frozen form. */
export function fieldText(field: Pick<FieldModel, 'type' | 'unit' | 'decimals' | 'kind'>, value: Scalar, style: NumberStyle, withUnit = false): string {
  if (value === EMPTY) return '';
  if (isError(value)) return value.name;
  if (typeof value === 'boolean') return value ? 'ja' : 'nein';
  if (typeof value === 'string') return value;
  switch (field.type) {
    case 'currency':
      return withUnit ? displayValue(value, 'currency', { style, decimals: field.decimals ?? 2, unit: field.unit }).text : formatNumber(value, style, field.decimals ?? 2);
    case 'percentage':
      return displayValue(value, 'percentage', { style, decimals: field.decimals, unit: null }).text;
    case 'date':
      return displayValue(value, 'date', { style, decimals: null, unit: null }).text;
    default:
      return field.kind === 'number' ? String(value) : formatNumber(value, style, field.decimals);
  }
}

/** JSON value of a field value (data file and export). */
export function jsonValue(field: Pick<FieldModel, 'type'>, value: Scalar): string | number | boolean | null {
  if (value === EMPTY || isError(value)) return null;
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (field.type === 'date') return isValidSerial(value) ? isoFromSerial(value).slice(0, 10) : null;
  return value;
}

/** Message for an entry that does not fit the type. */
function entryHint(type: FieldType): string {
  switch (type) {
    case 'date':
      return 'Bitte ein Datum eingeben (TT.MM.JJJJ oder JJJJ-MM-TT).';
    case 'boolean':
      return 'Bitte ja oder nein angeben.';
    case 'percentage':
      return 'Bitte einen Prozentwert eingeben, z. B. 20 oder 20 %.';
    default:
      return 'Bitte eine Zahl eingeben, z. B. 1.234,50.';
  }
}

export interface FormDocumentOptions {
  readonly language?: string | null;
  /** `id` of the container (manifest.json), written into the data object. */
  readonly documentId?: string;
}

export interface FieldPatch {
  readonly form: string;
  readonly name: string;
  readonly text: string;
  /** Stored form: canonical number, ISO date, `true`/`false`, text; empty for an empty value. */
  readonly value: string;
  readonly type: FieldType | 'error';
}

export interface EntryResult {
  readonly ok: boolean;
  readonly message?: string;
}

/**
 * Forms of one content document. `recalc` calculates, `validate` checks, `data` gives the data
 * object, `write` puts values, displays and conditions into the DOM.
 */
export class FormDocument {
  readonly style: NumberStyle;
  readonly forms: FormModel[] = [];
  private readonly calc: CalcDocument;
  private readonly evaluator = new Evaluator(FUNCTIONS);
  private readonly host = new TableModel('formular', 0, null);

  constructor(
    readonly doc: DomDocument,
    readonly options: FormDocumentOptions = {},
  ) {
    this.style = numberStyle(options.language ?? documentLanguage(doc));
    this.calc = new CalcDocument(doc, { language: options.language ?? documentLanguage(doc) });
    this.calc.recalc();
    for (const el of descendants(doc)) if (isHtml(el, 'form') && el.getAttribute('data-hp-form') !== null) this.forms.push(this.read(el));
    this.recalc();
  }

  get hasForms(): boolean {
    return this.forms.length > 0;
  }

  form(id: string): FormModel | undefined {
    return this.forms.find((f) => f.id === id);
  }

  /** Field by `form.name`, or by name alone when it is unique in the document. */
  field(ref: string): FieldModel | undefined {
    const dot = ref.indexOf('.');
    if (dot > 0) return this.form(ref.slice(0, dot))?.fields.get(ref.slice(dot + 1));
    const found = this.forms.map((f) => f.fields.get(ref)).filter((f): f is FieldModel => f !== undefined);
    return found.length === 1 ? found[0] : undefined;
  }

  // ------------------------------------------------------------------ reading

  private read(formEl: DomElement): FormModel {
    const id = formEl.getAttribute('id') ?? '';
    const markup: string[] = [];
    if (!id) markup.push('Formular ohne id');
    const action = formEl.getAttribute('action');
    if (action !== null && action.trim() !== '' && action.trim() !== '#') markup.push(`action="${action}" zeigt aus dem Container hinaus (HP-SBX-013)`);
    const form: FormModel = { id, element: formEl, dataPath: formEl.getAttribute('data-hp-form') ?? '', fields: new Map(), order: [], conditions: [], checks: [], markup };
    if (!/^data\/[A-Za-z0-9_][A-Za-z0-9_.-]*\.json$/.test(form.dataPath)) markup.push(`data-hp-form="${form.dataPath}" ist kein Pfad data/<name>.json`);
    const byId = new Map<string, DomElement>();
    for (const el of descendants(this.doc)) {
      const i = el.getAttribute('id');
      if (i) byId.set(i, el);
    }
    const labels = descendants(this.doc).filter((el) => isHtml(el, 'label'));
    const conditionOf = new Map<DomElement, ConditionModel>();
    const enclosing = (el: DomElement): ConditionModel | null => {
      for (let p = el.parentNode as DomElement | null; p && p !== formEl; p = p.parentNode as DomElement | null) {
        const c = conditionOf.get(p);
        if (c) return c;
      }
      return null;
    };
    let checkNo = 0;
    for (const el of descendants(formEl)) {
      const when = el.getAttribute('data-hp-when');
      if (when !== null) {
        const cid = el.getAttribute('id') ?? '';
        if (!cid) markup.push(`Bedingung ${when} an einem Element ohne id`);
        const c = compile(when, { names: true });
        if (c.error) markup.push(`Bedingung an #${cid}: ${c.error.message}`);
        const legend = children(el).find((k) => isHtml(k, 'legend', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'));
        const cond: ConditionModel = { id: cid, element: el, formula: when, ast: c.ast, syntaxError: c.error, parent: enclosing(el), result: true, relevant: true, title: legend ? labelText(legend) : cid };
        conditionOf.set(el, cond);
        form.conditions.push(cond);
      }
      const check = el.getAttribute('data-hp-check');
      if (check !== null) {
        checkNo++;
        const c = compile(check, { names: true });
        if (c.error) markup.push(`Prüfregel ${check}: ${c.error.message}`);
        form.checks.push({
          id: el.getAttribute('id') ?? `${id}-pruefung-${checkNo}`,
          element: el,
          formula: check,
          ast: c.ast,
          syntaxError: c.error,
          message: el.getAttribute('data-hp-check-message') ?? 'Prüfung nicht erfüllt.',
          condition: conditionOf.get(el) ?? enclosing(el),
          names: c.ast ? collectNames(c.ast) : new Set(),
          result: null,
        });
      }
      let kind: FieldKind | undefined;
      if (isHtml(el, 'input')) kind = INPUT_KINDS[(el.getAttribute('type') ?? '').trim().toLowerCase()];
      else if (isHtml(el, 'select')) kind = el.hasAttribute('multiple') ? undefined : 'select';
      else if (isHtml(el, 'textarea')) kind = 'textarea';
      else if (isHtml(el, 'output')) kind = 'output';
      if (kind === undefined) continue;
      const name = el.getAttribute('name');
      if (name === null || name === '') {
        if (kind !== 'output') markup.push(`Feld ohne name (${el.localName}${el.getAttribute('id') ? `#${el.getAttribute('id')}` : ''})`);
        continue;
      }
      if (!isFormName(name)) {
        markup.push(`Feldname ${name} ist kein gültiger Name (Buchstaben, Ziffern, _; nicht wie eine Zelle, nicht TRUE/FALSE)`);
        continue;
      }
      const existing = form.fields.get(name);
      if (existing) {
        if (kind === 'radio' && existing.kind === 'radio') (existing.elements as DomElement[]).push(el);
        else markup.push(`Feldname ${name} kommt mehrfach vor`);
        continue;
      }
      const field = this.readField(form, el, name, kind, byId, labels, conditionOf.get(el) ?? enclosing(el));
      if (field.syntaxError) markup.push(`Formel von ${name}: ${field.syntaxError.message}`);
      if (field.pattern !== null && patternRegExp(field.pattern) === null) markup.push(`pattern von ${name} ist kein gültiger regulärer Ausdruck (v-Modus)`);
      form.fields.set(name, field);
      form.order.push(field);
    }
    // Radio groups: label from the enclosing fieldset, options from all buttons, value from the checked one.
    for (const f of form.order) {
      if (f.kind !== 'radio') continue;
      (f as unknown as { options: string[] }).options = f.elements.map((e) => e.getAttribute('value') ?? 'on');
      const checked = f.elements.find((e) => e.hasAttribute('checked'));
      f.value = checked ? (checked.getAttribute('value') ?? 'on') : EMPTY;
      let fs: DomElement | null = f.elements[0]!.parentNode as DomElement | null;
      while (fs && !isHtml(fs, 'fieldset') && fs !== formEl) fs = fs.parentNode as DomElement | null;
      const legend = fs && isHtml(fs, 'fieldset') ? children(fs).find((k) => isHtml(k, 'legend')) : undefined;
      if (legend) (f as { label: string }).label = labelText(legend);
      if (f.elements.some((e) => e.hasAttribute('required'))) (f as { required: boolean }).required = true;
    }
    for (const c of form.checks) for (const n of c.names) if (!form.fields.has(n)) markup.push(`Prüfregel ${c.id}: unbekanntes Feld ${n}`);
    for (const c of form.conditions) if (c.ast) for (const n of collectNames(c.ast)) if (!form.fields.has(n)) markup.push(`Bedingung #${c.id}: unbekanntes Feld ${n}`);
    for (const f of form.order) if (f.ast) for (const n of collectNames(f.ast)) if (!form.fields.has(n)) markup.push(`Formel von ${f.name}: unbekanntes Feld ${n}`);
    return form;
  }

  private readField(form: FormModel, el: DomElement, name: string, kind: FieldKind, byId: Map<string, DomElement>, labels: DomElement[], condition: ConditionModel | null): FieldModel {
    const type = typeOf(el, kind);
    const id = el.getAttribute('id');
    let label = el.getAttribute('aria-label') ?? '';
    if (!label && id) {
      const l = labels.find((x) => x.getAttribute('for') === id);
      if (l) label = labelText(l);
    }
    if (!label) {
      for (let p = el.parentNode as DomElement | null; p && p !== form.element; p = p.parentNode as DomElement | null) {
        if (isHtml(p, 'label')) {
          label = labelText(p);
          break;
        }
      }
    }
    const labelledBy = el.getAttribute('aria-labelledby');
    if (!label && labelledBy) label = labelledBy.split(/\s+/).map((i) => (byId.get(i) ? labelText(byId.get(i)!) : '')).join(' ').trim();
    const formula = kind === 'output' ? el.getAttribute('data-hp-formula') : null;
    const compiled = formula !== null ? compile(formula, { names: true }) : null;
    let options: string[] | null = null;
    if (kind === 'select') options = descendants(el).filter((o) => isHtml(o, 'option')).map((o) => o.getAttribute('value') ?? collapsedText(o));
    const storedText = kind === 'output' ? collapsedText(el) : (el.getAttribute('value') ?? '');
    const field: FieldModel = {
      form,
      name,
      kind,
      type,
      elements: [el],
      label: label || name,
      required: el.hasAttribute('required'),
      pattern: el.getAttribute('pattern'),
      minLength: intAttr(el, 'minlength'),
      maxLength: intAttr(el, 'maxlength'),
      min: kind === 'number' || kind === 'date' ? boundOf(el.getAttribute('min'), kind) : null,
      max: kind === 'number' || kind === 'date' ? boundOf(el.getAttribute('max'), kind) : null,
      message: el.getAttribute('data-hp-message'),
      unit: el.getAttribute('data-hp-unit'),
      options,
      formula,
      ast: compiled?.ast ?? null,
      syntaxError: compiled?.error ?? null,
      condition,
      decimals: isNumeric(type) && kind !== 'number' ? decimalsShown(storedText, this.style) : null,
      value: EMPTY,
      raw: null,
      entryError: null,
    };
    if (field.decimals === null && type === 'currency') (field as { decimals: number | null }).decimals = 2;
    this.readStored(field, el);
    return field;
  }

  /** The value as stored in the markup. */
  private readStored(f: FieldModel, el: DomElement): void {
    switch (f.kind) {
      case 'checkbox':
        f.value = el.hasAttribute('checked');
        return;
      case 'radio':
        return; // after all buttons are known
      case 'select': {
        const opts = descendants(el).filter((o) => isHtml(o, 'option'));
        const sel = opts.find((o) => o.hasAttribute('selected'));
        const v = sel ? (sel.getAttribute('value') ?? collapsedText(sel)) : '';
        f.value = v === '' ? EMPTY : v;
        return;
      }
      case 'textarea': {
        const v = el.textContent ?? '';
        f.value = v === '' ? EMPTY : v;
        return;
      }
      case 'output': {
        const v = el.getAttribute('data-hp-value');
        f.value = v === null ? EMPTY : storedValue(el.getAttribute('data-hp-type'), v);
        return;
      }
      default: {
        const stored = el.getAttribute('data-hp-value');
        if (stored !== null && f.type !== 'string') {
          this.setTyped(f, stored);
          return;
        }
        const raw = el.getAttribute('value') ?? '';
        const r = this.parse(f, raw);
        if (!r.ok) {
          f.value = EMPTY;
          f.raw = raw;
          f.entryError = r.message ?? entryHint(f.type);
        }
      }
    }
  }

  /** Sets a stored (canonical) value: number, ISO date, `true`/`false` or text. */
  private setTyped(f: FieldModel, v: string): void {
    if (v === '') f.value = EMPTY;
    else if (isNumeric(f.type)) f.value = STANDARD_NUMBER.test(v.replace(/^-/, '')) ? Number(v) : EMPTY;
    else if (f.type === 'date') {
      const p = parseIsoDateTime(v);
      f.value = p && p.date !== null ? p.date + p.time : EMPTY;
    } else if (f.type === 'boolean') f.value = v === 'true';
    else f.value = v;
  }

  /** Parses an entry as the user typed it and sets the value; false when it does not fit. */
  private parse(f: FieldModel, raw: string): EntryResult {
    f.raw = null;
    f.entryError = null;
    if (f.kind === 'checkbox') {
      const v = parseUserEntry(raw, 'boolean', this.style);
      if (v === null || v === EMPTY) return v === EMPTY ? ((f.value = false), { ok: true }) : { ok: false, message: entryHint('boolean') };
      f.value = v;
      return { ok: true };
    }
    if (f.type === 'string') {
      f.value = raw === '' ? EMPTY : raw;
      return { ok: true };
    }
    if (f.kind === 'number' && raw.trim() !== '' && !/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(raw.trim())) return { ok: false, message: entryHint(f.type) };
    let text = raw;
    // "420.000" in a language with decimal comma is four hundred and twenty thousand: digits in
    // groups of three after a dot are a grouping, never decimals (the calculator's input cells read
    // a single dot as decimal point, HPF-STO-011; a form speaks the user's language).
    if (this.style.decimal === ',' && /^\s*[+-]?\d{1,3}(\.\d{3})+(,\d*)?\s*(%|€|EUR)?\s*$/.test(raw)) text = raw.replace(/\./g, '');
    const v = parseUserEntry(text, f.type === 'boolean' ? 'boolean' : f.type, this.style);
    if (v === null) return { ok: false, message: entryHint(f.type) };
    f.value = v;
    return { ok: true };
  }

  // ------------------------------------------------------------------ calculation

  /** Value of a field as seen by formulas: empty when its condition is false. */
  private seen(f: FieldModel): Scalar {
    if (f.condition && !f.condition.relevant) return EMPTY;
    return f.value;
  }

  private context(form: FormModel): EvalContext {
    return {
      table: this.host,
      row: 0,
      col: 0,
      resolveTable: (id) => this.calc.workbook.byId.get(id),
      resolveName: (name) => {
        const f = form.fields.get(name);
        return f ? this.seen(f) : undefined;
      },
    };
  }

  private evaluate(ast: Node, form: FormModel): Scalar {
    try {
      const v = scalar(this.evaluator.eval(ast, this.context(form)));
      return v;
    } catch (err) {
      if (err instanceof RangeError) return NAME;
      throw err;
    }
  }

  /** Calculated fields of a form in dependency order; those on a cycle (and behind one) are returned separately. */
  private order(form: FormModel): { order: FieldModel[]; circular: Set<FieldModel> } {
    const calcs = form.order.filter((f) => f.kind === 'output' && f.formula !== null);
    const deps = new Map(calcs.map((f) => [f, f.ast ? [...collectNames(f.ast)].map((n) => form.fields.get(n)).filter((d): d is FieldModel => d !== undefined && d.kind === 'output' && d.formula !== null) : []]));
    const order: FieldModel[] = [];
    const state = new Map<FieldModel, 1 | 2>();
    const circular = new Set<FieldModel>();
    // Iterative depth-first search; a back edge marks every field on the current path from its target.
    for (const root of calcs) {
      if (state.has(root)) continue;
      const stack: Array<{ f: FieldModel; i: number }> = [{ f: root, i: 0 }];
      state.set(root, 1);
      while (stack.length > 0) {
        const top = stack[stack.length - 1]!;
        const ds = deps.get(top.f)!;
        if (top.i < ds.length) {
          const d = ds[top.i++]!;
          if (!state.has(d)) {
            state.set(d, 1);
            stack.push({ f: d, i: 0 });
          } else if (state.get(d) === 1) {
            const at = stack.findIndex((s) => s.f === d);
            for (const s of stack.slice(at)) circular.add(s.f);
          }
          continue;
        }
        state.set(top.f, 2);
        order.push(top.f);
        stack.pop();
      }
    }
    // Everything that depends on a circular field is #CIRC! as well.
    let grew = true;
    while (grew) {
      grew = false;
      for (const [f, ds] of deps) if (!circular.has(f) && ds.some((d) => circular.has(d))) {
        circular.add(f);
        grew = true;
      }
    }
    return { order, circular };
  }

  /** Names of the entry fields a set of names depends on, through calculated fields. */
  inputNames(formId: string, names: Iterable<string>): string[] {
    const form = this.form(formId);
    return form ? this.inputsOf(form, names).map((f) => f.name) : [];
  }

  /** Entry fields a set of names depends on, through calculated fields. */
  private inputsOf(form: FormModel, names: Iterable<string>): FieldModel[] {
    const out = new Set<FieldModel>();
    const seen = new Set<string>();
    const stack = [...names];
    while (stack.length > 0) {
      const n = stack.pop()!;
      if (seen.has(n)) continue;
      seen.add(n);
      const f = form.fields.get(n);
      if (!f) continue;
      if (f.kind === 'output') {
        if (f.ast) stack.push(...collectNames(f.ast));
      } else out.add(f);
    }
    return [...out];
  }

  /** Complete calculation of every form: calculated fields, conditions, check rules. */
  recalc(): { rounds: number } {
    let rounds = 0;
    for (const form of this.forms) {
      const { order, circular } = this.order(form);
      const outputs = () => {
        for (const f of order) f.value = circular.has(f) ? CIRC : f.ast ? this.evaluate(f.ast, form) : NAME;
      };
      for (let round = 1; ; round++) {
        rounds = Math.max(rounds, round);
        outputs();
        let changed = false;
        for (const c of form.conditions) {
          const v = c.ast ? toLogical(this.evaluate(c.ast, form)) : false;
          const r = v === true;
          const relevant = r && (c.parent ? c.parent.relevant : true);
          if (c.result !== r || c.relevant !== relevant) changed = true;
          c.result = r;
          c.relevant = relevant;
        }
        if (!changed) break;
        if (round === MAX_ROUNDS) {
          // conditions that keep switching each other: the last state stands, values follow it
          outputs();
          break;
        }
      }
      for (const c of form.checks) {
        // A rule applies when its section applies and every required field it depends on (also
        // through calculated fields) is filled; until then "Pflichtfeld ist leer" says enough.
        if ((c.condition && !c.condition.relevant) || this.inputsOf(form, c.names).some((f) => f.required && (!f.condition || f.condition.relevant) && f.value === EMPTY)) {
          c.result = null;
          continue;
        }
        if (!c.ast) {
          c.result = NAME.name;
          continue;
        }
        const v = toLogical(this.evaluate(c.ast, form));
        c.result = isError(v) ? v.name : v;
      }
    }
    return { rounds };
  }

  // ------------------------------------------------------------------ entries

  /** An entry as typed by the user (`raw`), e.g. `1.234,50`, `12.10.2026`, `true`. Recalculates. */
  setEntry(formId: string, name: string, raw: string): EntryResult {
    const form = this.form(formId);
    const f = form?.fields.get(name);
    if (!form || !f) return { ok: false, message: `Feld ${formId}.${name} gibt es nicht.` };
    if (f.kind === 'output') return { ok: false, message: `${f.label} wird berechnet und kann nicht eingegeben werden.` };
    let r: EntryResult;
    if ((f.kind === 'select' || f.kind === 'radio') && raw !== '' && !f.options!.includes(raw)) r = { ok: false, message: `„${raw}“ ist keine der Auswahlmöglichkeiten.` };
    else r = this.parse(f, raw);
    if (!r.ok) {
      f.value = EMPTY;
      f.raw = raw;
      f.entryError = f.message ?? r.message ?? entryHint(f.type);
    }
    this.recalc();
    return r.ok ? { ok: true } : { ok: false, message: f.entryError! };
  }

  // ------------------------------------------------------------------ validation and data

  /** The data object of a form (values of fields whose condition is false are null). */
  data(formId: string, status: FormStatus, submittedAt?: string): FormData {
    const form = this.form(formId);
    if (!form) throw new Error(`no form ${formId}`);
    const values: Record<string, string | number | boolean | null> = {};
    for (const f of form.order) values[f.name] = f.condition && !f.condition.relevant ? null : jsonValue(f, f.value);
    return {
      form: form.id,
      ...(this.options.documentId ? { document: this.options.documentId } : {}),
      status,
      ...(status === 'submitted' && submittedAt ? { submittedAt } : {}),
      values,
    };
  }

  private fieldMessage(f: FieldModel, generic: string): string {
    if (f.message) return f.message;
    // A sentence as label (consent check boxes) is quoted rather than followed by a colon.
    if (/[.!?]$/.test(f.label)) return `„${f.label}“ – ${generic}`;
    return `${f.label}: ${generic}`;
  }

  /** A required entry field this field depends on (itself or through formulas) is still empty. */
  private waitsForInput(form: FormModel, f: FieldModel): boolean {
    return this.inputsOf(form, [f.name]).some((i) => i.required && (!i.condition || i.condition.relevant) && i.value === EMPTY);
  }

  /**
   * Everything that prevents submitting the form: entries, constraints, calculated errors, check
   * rules and — with `schema` — the JSON Schema of the data object with status `submitted`.
   */
  validate(formId: string, schema?: unknown, options: { documentTime?: string } = {}): FormProblem[] {
    const form = this.form(formId);
    if (!form) throw new Error(`no form ${formId}`);
    const out: FormProblem[] = form.markup.map((m) => ({ form: form.id, code: 'markup' as const, message: `Formular fehlerhaft: ${m}` }));
    const add = (f: FieldModel, code: FormProblem['code'], generic: string) => out.push({ form: form.id, field: f.name, code, message: this.fieldMessage(f, generic) });
    for (const f of form.order) {
      if (f.condition && !f.condition.relevant) continue;
      if (f.kind === 'output') {
        if (isError(f.value)) out.push({ form: form.id, field: f.name, code: 'formula', message: `${f.label}: Berechnung ergibt ${f.value.name} (${ERROR_TEXT[f.value.name] ?? 'Fehler'}).` });
        continue;
      }
      if (f.entryError !== null) {
        out.push({ form: form.id, field: f.name, code: 'entry', message: f.message ?? `${f.label}: ${f.entryError}` });
        continue;
      }
      const v = f.value;
      if (v === EMPTY || (f.kind === 'checkbox' && v === false)) {
        if (f.required) add(f, 'required', f.kind === 'checkbox' ? 'bitte bestätigen.' : 'Pflichtfeld ist leer.');
        continue;
      }
      if (typeof v === 'string') {
        const len = [...v].length;
        if (f.minLength !== null && len < f.minLength) add(f, 'minlength', `mindestens ${f.minLength} Zeichen.`);
        if (f.maxLength !== null && len > f.maxLength) add(f, 'maxlength', `höchstens ${f.maxLength} Zeichen.`);
        if (f.pattern !== null && f.kind !== 'select' && f.kind !== 'radio') {
          // HTML compiles `pattern` with the v flag and ignores a pattern that does not compile.
          const re = patternRegExp(f.pattern);
          if (re && !re.test(v)) add(f, 'pattern', 'Eingabe hat nicht das verlangte Format.');
        }
        if (f.kind === 'email' && !EMAIL_RE.test(v)) add(f, 'email', 'keine gültige E-Mail-Adresse.');
        if ((f.kind === 'select' || f.kind === 'radio') && f.options && !f.options.includes(v)) add(f, 'option', 'Wert ist keine der Auswahlmöglichkeiten.');
      }
      if (typeof v === 'number') {
        const show = (x: number) => fieldText(f, x, this.style, true);
        if (f.min !== null && v < f.min) add(f, 'min', `mindestens ${show(f.min)}.`);
        if (f.max !== null && v > f.max) add(f, 'max', `höchstens ${show(f.max)}.`);
      }
    }
    for (const c of form.checks) {
      if (c.result === null || c.result === true) continue;
      out.push({ form: form.id, check: c.id, code: 'check', message: typeof c.result === 'string' && c.syntaxError ? `${c.message} (Prüfregel fehlerhaft)` : c.message });
    }
    if (schema !== undefined) {
      const data = this.data(formId, 'submitted', options.documentTime ?? '2000-01-01T00:00:00Z');
      for (const p of validateInstance(data, schema as boolean | Record<string, unknown>)) {
        const m = /^#?\/values\/([^/]+)/.exec(p.path);
        const f = m ? form.fields.get(m[1]!) : undefined;
        if (f && out.some((o) => o.field === f.name)) continue;
        if (f && f.kind === 'output' && this.waitsForInput(form, f)) continue;
        if (f) out.push({ form: form.id, field: f.name, code: 'schema', path: p.path, message: this.fieldMessage(f, `Wert entspricht nicht dem Schema (${p.message}).`) });
        else out.push({ form: form.id, code: 'schema', path: p.path, message: `Daten entsprechen nicht dem Schema: ${p.path} ${p.message}` });
      }
    }
    return out;
  }

  /**
   * Data object of a draft that is valid against `schema`: a value that breaks a rule of its field
   * or the schema is stored as null (the entry stays in the form, HPC-0009). Returns the object
   * and the fields that were set to null; `ok` is false when the object is still invalid (the
   * schema rejects something that is not a field value).
   */
  draftData(formId: string, schema: unknown): { data: FormData; nulled: string[]; ok: boolean } {
    const form = this.form(formId);
    if (!form) throw new Error(`no form ${formId}`);
    const data = this.data(formId, 'draft') as FormData & { values: Record<string, string | number | boolean | null> };
    const nulled = new Set<string>();
    for (const p of this.validate(formId)) if (p.field && p.code !== 'required' && p.code !== 'formula' && data.values[p.field] !== null) nulled.add(p.field);
    for (const n of nulled) data.values[n] = null;
    for (let round = 0; round < 4; round++) {
      const problems = schema === undefined ? [] : validateInstance(data, schema as boolean | Record<string, unknown>);
      if (problems.length === 0) return { data, nulled: [...nulled], ok: true };
      let progress = false;
      for (const p of problems) {
        const m = /^#?\/values\/([^/]+)/.exec(p.path);
        if (m && form.fields.has(m[1]!) && data.values[m[1]!] !== null) {
          data.values[m[1]!] = null;
          nulled.add(m[1]!);
          progress = true;
        }
      }
      if (!progress) return { data, nulled: [...nulled], ok: false };
    }
    return { data, nulled: [...nulled], ok: schema === undefined || validateInstance(data, schema as boolean | Record<string, unknown>).length === 0 };
  }

  // ------------------------------------------------------------------ output

  /** Display and stored form of every field (for the reader and reports). */
  patches(formId?: string): FieldPatch[] {
    const out: FieldPatch[] = [];
    for (const form of this.forms) {
      if (formId !== undefined && form.id !== formId) continue;
      for (const f of form.order) out.push(this.patch(f));
    }
    return out;
  }

  patch(f: FieldModel): FieldPatch {
    const v = f.value;
    const type = valueType(f, v);
    let value = '';
    if (isError(v)) value = v.name;
    else if (v !== EMPTY) {
      const j = jsonValue({ type: type === 'error' ? f.type : type }, v);
      value = j === null ? '' : String(j);
    }
    return { form: f.form.id, name: f.name, text: f.entryError !== null ? (f.raw ?? '') : fieldText(f, v, this.style, f.kind === 'output'), value, type };
  }

  /** Writes values, displays and conditions into the DOM (the stored state of the form). */
  write(): void {
    const doc = this.doc;
    for (const form of this.forms) {
      for (const f of form.order) {
        const el = f.elements[0]!;
        const p = this.patch(f);
        switch (f.kind) {
          case 'checkbox':
            if (f.value === true) el.setAttribute('checked', 'checked');
            else el.removeAttribute('checked');
            break;
          case 'radio':
            for (const r of f.elements) {
              if (f.value !== EMPTY && (r.getAttribute('value') ?? 'on') === f.value) r.setAttribute('checked', 'checked');
              else r.removeAttribute('checked');
            }
            break;
          case 'select':
            for (const o of descendants(el).filter((x) => isHtml(x, 'option'))) {
              if (f.value !== EMPTY && (o.getAttribute('value') ?? collapsedText(o)) === f.value) o.setAttribute('selected', 'selected');
              else o.removeAttribute('selected');
            }
            break;
          case 'textarea':
            while (el.childNodes.length > 0) el.removeChild(el.childNodes.item(0)!);
            if (typeof f.value === 'string') el.appendChild(doc.createTextNode(f.value));
            break;
          case 'output':
            while (el.childNodes.length > 0) el.removeChild(el.childNodes.item(0)!);
            if (f.value === EMPTY) {
              el.removeAttribute('data-hp-value');
            } else {
              el.setAttribute('data-hp-value', p.value);
              el.setAttribute('data-hp-type', p.type);
              el.appendChild(doc.createTextNode(p.text));
            }
            break;
          case 'number':
          case 'date':
            if (f.entryError !== null) el.setAttribute('value', f.raw ?? '');
            else if (f.value === EMPTY) el.removeAttribute('value');
            else el.setAttribute('value', p.value);
            break;
          default:
            if (f.entryError !== null) {
              el.setAttribute('value', f.raw ?? '');
              el.removeAttribute('data-hp-value');
            } else if (f.value === EMPTY) {
              el.removeAttribute('value');
              el.removeAttribute('data-hp-value');
            } else {
              el.setAttribute('value', p.text);
              if (f.type === 'string') el.removeAttribute('data-hp-value');
              else el.setAttribute('data-hp-value', p.value);
            }
        }
      }
      // Conditions are never stored as `hidden`: without a calculator the whole form stays
      // readable (HP-NEST-001); the reading system hides sections in its copy, a frozen version
      // and print replace them by a note (freeze.ts).
      for (const c of form.conditions) c.element.removeAttribute('hidden');
    }
  }

}
