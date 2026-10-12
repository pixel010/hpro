/**
 * Forms (package P6, change request HPC-0009): the model a form is read into. A form is plain
 * HTML in the content document — `form`, `input`, `select`, `textarea`, `output`, `fieldset`,
 * `label` — plus a few `data-hp-*` attributes; there is no script in the document:
 *
 *   form[data-hp-form]          data file under `data/` that holds the entries (manifest.json#data)
 *   output[data-hp-formula]     calculated field, OpenFormula with field names as named expressions
 *   *[data-hp-when]             condition: the element (with `id`) and its fields apply only when true
 *   *[data-hp-check]            check rule across fields, message in `data-hp-check-message`
 *   field[data-hp-type]         value type as in part 3 (`currency`, `float`, `percentage`, `date`, …)
 *   field[data-hp-message]      the author's error text for this field
 *
 * HTML constraint attributes keep their meaning: `required`, `pattern`, `minlength`, `maxlength`,
 * `min`/`max` (number and date fields), `type="email"`.
 */
import type { FormulaSyntaxError, Node } from '../calc/parser.js';
import type { Scalar } from '../calc/values.js';
import type { DomElement } from '../calc/dom.js';

/** Kind of control. */
export type FieldKind = 'text' | 'email' | 'tel' | 'url' | 'number' | 'date' | 'checkbox' | 'radio' | 'select' | 'textarea' | 'output';
/** Value type of a field (the value types of part 3 that make sense for an entry). */
export type FieldType = 'string' | 'float' | 'currency' | 'percentage' | 'date' | 'boolean';

export interface ConditionModel {
  /** `id` of the element with `data-hp-when`. */
  readonly id: string;
  readonly element: DomElement;
  readonly formula: string;
  readonly ast: Node | null;
  readonly syntaxError: FormulaSyntaxError | null;
  /** Enclosing condition inside the same form. */
  readonly parent: ConditionModel | null;
  /** Result of the last evaluation of this condition alone (error = false). */
  result: boolean;
  /** This condition and every enclosing one are true. */
  relevant: boolean;
  /** Heading of the element (legend, first heading or id), for notes and reports. */
  readonly title: string;
}

export interface CheckModel {
  /** `id` of the element, or `<form>-pruefung-<n>`. */
  readonly id: string;
  readonly element: DomElement;
  readonly formula: string;
  readonly ast: Node | null;
  readonly syntaxError: FormulaSyntaxError | null;
  readonly message: string;
  readonly condition: ConditionModel | null;
  /** Field names the rule uses. */
  readonly names: ReadonlySet<string>;
  /** true = satisfied; false or an error name = violated; null = not applicable (condition false). */
  result: boolean | string | null;
}

export interface FieldModel {
  readonly form: FormModel;
  readonly name: string;
  readonly kind: FieldKind;
  readonly type: FieldType;
  /** Controls of the field: one, or every radio button of a group. */
  readonly elements: readonly DomElement[];
  /** Visible label text (label, legend of a radio group, aria-label) or the name. */
  readonly label: string;
  readonly required: boolean;
  readonly pattern: string | null;
  readonly minLength: number | null;
  readonly maxLength: number | null;
  /** `min`/`max` of number fields (number) and date fields (serial). */
  readonly min: number | null;
  readonly max: number | null;
  readonly message: string | null;
  readonly unit: string | null;
  /** Allowed values of select and radio fields. */
  readonly options: readonly string[] | null;
  /** Calculated fields. */
  readonly formula: string | null;
  readonly ast: Node | null;
  readonly syntaxError: FormulaSyntaxError | null;
  readonly condition: ConditionModel | null;
  /** Decimals of the stored display (calculated and typed text fields), null = as needed. */
  readonly decimals: number | null;
  /** Current value; `EMPTY` for an empty field. */
  value: Scalar;
  /** The entry as typed when it did not fit the type (the value is then empty). */
  raw: string | null;
  /** Message for an entry that does not fit the type. */
  entryError: string | null;
}

export interface FormModel {
  readonly id: string;
  readonly element: DomElement;
  /** `data-hp-form`: container path of the data file. */
  readonly dataPath: string;
  readonly fields: Map<string, FieldModel>;
  /** Fields in document order. */
  readonly order: FieldModel[];
  readonly conditions: ConditionModel[];
  readonly checks: CheckModel[];
  /** Problems of the markup itself (duplicate names, invalid names, missing ids, formula syntax). */
  readonly markup: string[];
}

/** Codes of validation problems. */
export type ProblemCode = 'entry' | 'required' | 'pattern' | 'minlength' | 'maxlength' | 'min' | 'max' | 'email' | 'option' | 'formula' | 'check' | 'schema' | 'markup';

export interface FormProblem {
  readonly form: string;
  /** Field name, for problems of one field. */
  readonly field?: string;
  /** Id of the check rule, for `check`. */
  readonly check?: string;
  readonly code: ProblemCode;
  /** German text for the user. */
  readonly message: string;
  /** JSON pointer into the data object (schema problems). */
  readonly path?: string;
}

/** Status of the data in the data file. */
export type FormStatus = 'draft' | 'submitted';

/** The data object of a form as stored in `data/<name>.json` and exported. */
export interface FormData {
  readonly form: string;
  readonly document?: string;
  readonly status: FormStatus;
  readonly submittedAt?: string;
  readonly values: Record<string, string | number | boolean | null>;
}
