/**
 * Accessibility check with corrections (package P8, docs/10 section 3 point 5: "Barrierefreiheit
 * ist kein Anhang"): data model. A check run yields findings in seven categories; every finding
 * that can be corrected carries a proposal — a list of editing operations of the structured
 * editor (`edit.EditOp`), so a correction changes the document like any other edit: text stays
 * text, the history journal records it, locks and sealed sections are respected.
 */
import type { EditOp } from '../edit/session.js';

export const CATEGORIES = ['struktur', 'lesereihenfolge', 'alternativtexte', 'kontrast', 'sprache', 'tabellenkoepfe', 'fokus'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  struktur: 'Struktur',
  lesereihenfolge: 'Lesereihenfolge',
  alternativtexte: 'Alternativtexte',
  kontrast: 'Kontrast',
  sprache: 'Sprache',
  tabellenkoepfe: 'Tabellenköpfe',
  fokus: 'Fokusführung',
};

/** `fehler`: a WCAG success criterion is not met; `warnung`: very likely a problem, check it. */
export type Severity = 'fehler' | 'warnung';

/** Placeholder in `ops` for the value the user enters (alt text, caption, language, …). */
export const VALUE = '{{wert}}';

export interface FixInput {
  /** Label of the input field, e.g. "Alternativtext". */
  readonly label: string;
  readonly kind: 'text' | 'lang';
  /** Proposed value; the user checks and may change it. */
  readonly proposal?: string;
  /** Where the proposal comes from, e.g. "aus der Bildunterschrift". */
  readonly source?: string;
}

export interface FixSuggestion {
  /** Button text, e.g. "Alternativtext setzen". */
  readonly label: string;
  /** What the correction does, in one sentence. */
  readonly description: string;
  /** Editing operations; a string equal to `VALUE` is replaced by the entered value. */
  readonly ops: readonly EditOp[];
  readonly input?: FixInput;
}

export interface Finding {
  /** Stable id: rule and address, e.g. `alt-fehlt@content/index.xhtml#abb-1/img[1]`. */
  readonly id: string;
  readonly rule: string;
  readonly category: Category;
  readonly severity: Severity;
  /** WCAG 2.2 success criteria, e.g. `1.1.1`. */
  readonly wcag: readonly string[];
  /** Requirement of the specification, e.g. `HP-INH-006`. */
  readonly spec?: string;
  /** Container path of the document or stylesheet. */
  readonly path: string;
  /** Pointer of the element (`path#id/p[2]`), when the finding is about an element. */
  readonly target?: string;
  readonly line?: number;
  /** German description of the problem. */
  readonly message: string;
  /** Short text excerpt that shows where it is. */
  readonly excerpt?: string;
  /** Proposal; missing when no automatic correction exists (`blocked` says why). */
  readonly fix?: FixSuggestion;
  readonly blocked?: string;
}

export interface NotChecked {
  readonly what: string;
  readonly why: string;
}

export interface A11yReport {
  readonly checker: string;
  readonly documents: readonly string[];
  readonly stylesheets: readonly string[];
  /** Colour schemes the contrast was checked in. */
  readonly schemes: readonly string[];
  readonly findings: readonly Finding[];
  /** Number of findings per category (all seven categories, zeros included). */
  readonly counts: Readonly<Record<Category, number>>;
  /** Rules that ran, per category. */
  readonly rules: Readonly<Record<Category, readonly string[]>>;
  readonly notChecked: readonly NotChecked[];
}

/**
 * A colour scheme of the reading system: the values it gives `--hp-foreground` and
 * `--hp-background` (HP-INH-004), or none (then the document's fallbacks apply), and the colours
 * used when nothing is set at all. The defaults are those of the hpro reader (app/src/settings.ts).
 */
export interface Scheme {
  readonly name: string;
  readonly label: string;
  readonly vars: Readonly<Record<string, string>>;
  readonly foreground: string;
  readonly background: string;
  /** Link colour the reader forces in this scheme (`!important`), if any. */
  readonly link?: string;
}

export const READER_SCHEMES: readonly Scheme[] = [
  { name: 'hell', label: 'hell', vars: {}, foreground: '#000000', background: '#ffffff' },
  { name: 'dunkel', label: 'dunkel', vars: { '--hp-foreground': '#e6e4e0', '--hp-background': '#1b1c1e' }, foreground: '#e6e4e0', background: '#1b1c1e' },
  { name: 'kontrast', label: 'hoher Kontrast', vars: { '--hp-foreground': '#ffffff', '--hp-background': '#000000' }, foreground: '#ffffff', background: '#000000', link: '#ffff00' },
];

export const CHECKER = 'hpro a11y 0.1.0';
