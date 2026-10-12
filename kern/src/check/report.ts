/**
 * Conformance report of hpro 0.1, part 1 (docs/spezifikation/01-konformitaet.md):
 * findings (4.1), locations (4.2), report object (4.3), text output (4.4), exit codes (4.5)
 * and the verdict per level (3.4).
 *
 * The rule catalogue is data (`01-regelkatalog.json`); class, level, requirements and the
 * message template of every finding come from it, never from the checker code.
 */

export type ClassCode = 'FATAL' | 'ERROR' | 'WARNING' | 'INFO';
export type Level = 'Basis' | 'Lebendig' | 'Signiert' | 'Archiv';
export type Verdict = 'bestanden' | 'nicht bestanden' | 'unbestimmt';
export type NotCheckedReason = 'missing-means' | 'fatal' | 'manual' | 'tool-error';
export type Profile = 'static' | 'interactive' | 'signed' | 'archive';

export interface CatalogRule {
  readonly id: string;
  readonly class: string;
  readonly classCode: ClassCode;
  readonly level: Level;
  readonly title: string;
  readonly requirements: readonly string[];
  readonly scope: 'Container' | 'Fassung' | 'Hauptfassung';
  readonly means: 'statisch' | 'rendering' | 'extern' | 'signatur' | 'manuell';
  readonly locationKind: string;
  readonly message: string;
  readonly placeholders: readonly string[];
  readonly classification: string | null;
}

export interface Catalog {
  readonly spec: string;
  readonly part: string;
  readonly version: string;
  readonly rules: readonly CatalogRule[];
}

export type LocationKind = 'container' | 'entry' | 'manifest' | 'xml' | 'css' | 'signature' | 'rendition' | 'external';

export interface Location {
  readonly kind: LocationKind;
  readonly path?: string;
  readonly pointer?: string;
  readonly line?: number;
  readonly column?: number;
  readonly xpath?: string;
  readonly selector?: string;
  readonly signatureId?: string;
  readonly uri?: string;
  readonly id?: string;
  readonly tool?: string;
  readonly code?: string;
}

export type Params = Record<string, string | number | boolean | null>;

export interface Finding {
  readonly rule: string;
  readonly class: ClassCode;
  readonly level: Level;
  readonly rendition: string | null;
  readonly message: string;
  readonly location?: Location;
  readonly params?: Params;
  readonly requirements: readonly string[];
}

export interface NotChecked {
  readonly rule: string;
  readonly reason: NotCheckedReason;
  readonly detail?: string;
}

export type VerdictMap = Partial<Record<Level, Verdict>>;

export interface ConformanceReport {
  readonly spec: string;
  readonly catalog: { readonly part: string; readonly version: string; readonly rules: number };
  readonly tool: { readonly name: string; readonly version: string };
  readonly checkedAt: string;
  readonly file: { readonly name: string; readonly size: number; readonly sha256: string };
  readonly strict: boolean;
  readonly levels: { readonly claimed: Level[]; readonly requested: Level[]; readonly verdict: VerdictMap };
  readonly renditions: Array<{ readonly id: string | null; readonly profile: Profile | null; readonly verdict: VerdictMap }>;
  readonly summary: { readonly fatal: number; readonly error: number; readonly warning: number; readonly info: number; readonly notChecked: number };
  readonly results: Finding[];
  readonly notChecked: NotChecked[];
}

export const SPEC_URI = 'https://hpro.example/spec/0.1';
export const LEVELS: readonly Level[] = ['Basis', 'Lebendig', 'Signiert', 'Archiv'];
/** E(S) of section 3.4: the levels a level contains, including itself. */
export const INCLUDES: Readonly<Record<Level, readonly Level[]>> = {
  Basis: ['Basis'],
  Lebendig: ['Basis', 'Lebendig'],
  Signiert: ['Basis', 'Signiert'],
  Archiv: ['Basis', 'Signiert', 'Archiv'],
};
const CLASS_TEXT: Record<ClassCode, string> = { FATAL: 'FATAL', ERROR: 'FEHLER', WARNING: 'WARNUNG', INFO: 'HINWEIS' };
const SUMMARY_KEY: Record<ClassCode, 'fatal' | 'error' | 'warning' | 'info'> = { FATAL: 'fatal', ERROR: 'error', WARNING: 'warning', INFO: 'info' };

/** Fills a message template; missing placeholders become empty and the punctuation is tidied. */
export function renderMessage(template: string, params: Params): string {
  return template
    .replace(/\{([a-z]+)\}/g, (_m, key: string) => (params[key] === undefined || params[key] === null ? '' : String(params[key])))
    .replace(/\s+:/g, ':')
    .replace(/\(\s*\)/g, '')
    .replace(/:\s*:/g, ':')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;])/g, '$1')
    .trim();
}

export interface ReportOptions {
  readonly file: ConformanceReport['file'];
  readonly tool: ConformanceReport['tool'];
  readonly strict?: boolean;
  readonly checkedAt?: string;
}

/**
 * Collects findings and rule states during a check run. Rules record that they ran
 * (`ran`); at the end every rule that neither ran nor was marked `notChecked` is listed as
 * not checked, so that no rule is silently counted as passed.
 */
export class ReportBuilder {
  readonly #rules: ReadonlyMap<string, CatalogRule>;
  readonly #results: Finding[] = [];
  readonly #notChecked = new Map<string, NotChecked>();
  readonly #ran = new Set<string>();
  readonly #claimed = new Set<Level>(['Basis']);
  readonly #requested = new Set<Level>();
  readonly #renditions = new Map<string | null, Profile | null>([[null, null]]);
  readonly #seen = new Set<string>();
  #fatal: string | null = null;
  /** External tools that ran, with their message count (shown in the text output only). */
  readonly externalTools: Array<{ tool: string; messages: number }> = [];

  constructor(
    readonly catalog: Catalog,
    readonly options: ReportOptions,
  ) {
    this.#rules = new Map(catalog.rules.map((r) => [r.id, r]));
  }

  rule(id: string): CatalogRule {
    const r = this.#rules.get(id);
    if (!r) throw new Error(`unknown rule ${id}`);
    return r;
  }

  /** Marks rules as executed (with or without findings). */
  ran(...ids: string[]): void {
    for (const id of ids) {
      this.rule(id);
      this.#ran.add(id);
    }
  }

  hasRun(id: string): boolean {
    return this.#ran.has(id);
  }

  claim(level: Level): void {
    for (const l of INCLUDES[level]) this.#claimed.add(l);
  }

  request(level: Level): void {
    this.#requested.add(level);
  }

  /** Registers a version; `profile` is null when its manifest could not be read (HPR-CONT-011). */
  rendition(id: string | null, profile: Profile | null): void {
    this.#renditions.set(id, profile);
    if (profile === 'interactive') this.claim('Lebendig');
    if (profile === 'signed') this.claim('Signiert');
    if (profile === 'archive') this.claim('Archiv');
  }

  /** Records a finding. Identical findings (same rule, rendition, location and message) count once (2.2). */
  finding(ruleId: string, params: Params, location?: Location, rendition: string | null = null): void {
    const rule = this.rule(ruleId);
    this.#ran.add(ruleId);
    const message = renderMessage(rule.message, params);
    const key = JSON.stringify([ruleId, rendition, location ?? null, message]);
    if (this.#seen.has(key)) return;
    this.#seen.add(key);
    const cleanParams: Params = {};
    for (const [k, v] of Object.entries(params)) if (v !== undefined) cleanParams[k] = v;
    this.#results.push({
      rule: ruleId,
      class: rule.classCode,
      level: rule.level,
      rendition,
      message,
      ...(location ? { location } : {}),
      ...(Object.keys(cleanParams).length > 0 ? { params: cleanParams } : {}),
      requirements: rule.requirements,
    });
    if (rule.classCode === 'FATAL' && this.#fatal === null) this.#fatal = ruleId;
  }

  external(tool: string, messages: number): void {
    this.externalTools.push({ tool, messages });
  }

  notChecked(ruleId: string, reason: NotCheckedReason, detail?: string): void {
    this.rule(ruleId);
    if (!this.#notChecked.has(ruleId)) this.#notChecked.set(ruleId, { rule: ruleId, reason, ...(detail ? { detail } : {}) });
  }

  get fatal(): string | null {
    return this.#fatal;
  }

  /**
   * Drops every finding except the fatal ones (2.2: after a fatal error only "not checked"
   * follows). Rules that ran before the fatal error are reset, so that `finish` lists them as
   * not checked with reason `fatal` instead of counting them as passed.
   */
  keepOnlyFatal(): void {
    const keep = this.#results.filter((f) => f.class === 'FATAL');
    this.#results.length = 0;
    this.#results.push(...keep);
    const fatalRules = new Set(keep.map((f) => f.rule));
    for (const id of [...this.#ran]) if (!fatalRules.has(id)) this.#ran.delete(id);
  }

  findings(ruleId?: string): readonly Finding[] {
    return ruleId ? this.#results.filter((f) => f.rule === ruleId) : this.#results;
  }

  #verdict(level: Level, rendition: string | null | undefined, notChecked: readonly NotChecked[]): Verdict {
    const strict = this.options.strict ?? false;
    // 3.4: a version is judged by its own findings and the container findings (scope `Container`).
    const inSubject = (f: Finding) => rendition === undefined || f.rendition === rendition || (f.rendition === null && this.rule(f.rule).scope === 'Container');
    const inLevel = (f: Finding) => INCLUDES[level].includes(f.level);
    const effective = (f: Finding): ClassCode => (strict && f.class === 'WARNING' ? 'ERROR' : f.class);
    if (this.#results.some((f) => f.class === 'FATAL' && inSubject(f))) return 'nicht bestanden';
    if (this.#results.some((f) => inSubject(f) && inLevel(f) && effective(f) === 'ERROR')) return 'nicht bestanden';
    const unchecked = notChecked.some((n) => {
      const r = this.rule(n.rule);
      return INCLUDES[level].includes(r.level) && (r.classCode === 'ERROR' || r.classCode === 'FATAL' || (strict && r.classCode === 'WARNING'));
    });
    const indeterminate = this.#results.some((f) => inSubject(f) && inLevel(f) && this.rule(f.rule).classification === 'Unbestimmt');
    return unchecked || indeterminate ? 'unbestimmt' : 'bestanden';
  }

  /**
   * Completes the run: rules that did not run become "not checked" (`fatal` after a fatal
   * error, otherwise `missing-means` with the given detail), then summary and verdicts.
   */
  finish(unrunDetail = 'im Prüfprogramm nicht ausgeführt'): ConformanceReport {
    for (const r of this.catalog.rules) {
      if (this.#ran.has(r.id) || this.#notChecked.has(r.id)) continue;
      if (this.#fatal) this.notChecked(r.id, 'fatal', `abhängig vom fatalen Fehler ${this.#fatal}`);
      else this.notChecked(r.id, r.means === 'manuell' ? 'manual' : 'missing-means', unrunDetail);
    }
    // A rule that produced findings has run; drop a stale "not checked" entry for it.
    for (const f of this.#results) if (this.#notChecked.get(f.rule)?.reason === 'fatal') this.#notChecked.delete(f.rule);
    const notChecked = [...this.#notChecked.values()].sort((a, b) => a.rule.localeCompare(b.rule));
    const levels = LEVELS.filter((l) => this.#claimed.has(l) || this.#requested.has(l));
    const verdict: VerdictMap = {};
    for (const l of levels) verdict[l] = this.#verdict(l, undefined, notChecked);
    const renditions = [...this.#renditions].map(([id, profile]) => {
      const v: VerdictMap = {};
      for (const l of levels) v[l] = this.#verdict(l, id, notChecked);
      return { id, profile, verdict: v };
    });
    const summary = { fatal: 0, error: 0, warning: 0, info: 0, notChecked: notChecked.length };
    for (const f of this.#results) summary[SUMMARY_KEY[f.class]]++;
    const order: Record<ClassCode, number> = { FATAL: 0, ERROR: 1, WARNING: 2, INFO: 3 };
    const results = [...this.#results].sort((a, b) => (a.class === 'FATAL' ? 0 : 1) - (b.class === 'FATAL' ? 0 : 1) || order[a.class] - order[b.class] || 0);
    return {
      spec: SPEC_URI,
      catalog: { part: this.catalog.part, version: this.catalog.version, rules: this.catalog.rules.length },
      tool: this.options.tool,
      checkedAt: this.options.checkedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      file: this.options.file,
      strict: this.options.strict ?? false,
      levels: { claimed: LEVELS.filter((l) => this.#claimed.has(l)), requested: LEVELS.filter((l) => this.#requested.has(l)), verdict },
      renditions,
      summary,
      results,
      notChecked,
    };
  }
}

/** Location in the text form of section 4.4. */
export function formatLocation(loc: Location | undefined): string {
  if (!loc) return '-';
  switch (loc.kind) {
    case 'manifest':
      return `${loc.path ?? 'manifest.json'}#${loc.pointer ?? ''}`;
    case 'signature':
      return `signatur=${loc.signatureId ?? '?'}${loc.uri ? ` (${loc.uri})` : ''}`;
    case 'external':
      return `${loc.tool ?? 'extern'}${loc.code ? `:${loc.code}` : ''}`;
    case 'rendition':
      return `fassung=${loc.id ?? '?'}`;
    case 'container':
      return '(Container)';
    default:
      return (loc.path ?? '?') + (loc.line ? `:${loc.line}${loc.column ? `:${loc.column}` : ''}` : '');
  }
}

/** Human-readable output, section 4.4. */
export function reportText(report: ConformanceReport, { notChecked = true } = {}): string {
  const lines: string[] = [];
  for (const f of report.results) {
    lines.push(`${CLASS_TEXT[f.class]} ${f.rule}${f.rendition ? ` [${f.rendition}]` : ''} ${formatLocation(f.location)}: ${f.message}`);
  }
  if (notChecked) for (const n of report.notChecked) lines.push(`NICHT GEPRÜFT ${n.rule}: ${n.reason}${n.detail ? ` (${n.detail})` : ''}`);
  const s = report.summary;
  lines.push(`Befunde: ${s.fatal} fatal, ${s.error} Fehler, ${s.warning} Warnungen, ${s.info} Hinweise, ${s.notChecked} nicht geprüft`);
  for (const [level, verdict] of Object.entries(report.levels.verdict)) lines.push(`Stufe ${level}: ${verdict}`);
  if (report.renditions.length > 1) {
    for (const r of report.renditions) {
      lines.push(`Fassung ${r.id ?? 'Hauptfassung'} (${r.profile ?? '?'}): ${Object.entries(r.verdict).map(([l, v]) => `${l} ${v}`).join(', ')}`);
    }
  }
  return lines.join('\n');
}

/** Exit code, section 4.5 (2 is reserved for "could not run" and set by the caller). */
export function exitCode(report: ConformanceReport): 0 | 1 | 3 {
  const verdicts = Object.values(report.levels.verdict);
  if (verdicts.includes('nicht bestanden')) return 1;
  if (verdicts.includes('unbestimmt')) return 3;
  return 0;
}

type Schema = Record<string, unknown>;

/**
 * Validator for the JSON Schema 2020-12 subset used by `konformitaetsbericht.schema.json`
 * (type, const, enum, pattern, minLength, minimum, required, properties,
 * additionalProperties, propertyNames, items, minItems, uniqueItems, local `$ref`).
 * Returns the list of problems; empty means valid.
 */
export function validateAgainstSchema(value: unknown, schema: Schema, root: Schema = schema, path = '$', problems: string[] = []): string[] {
  const fail = (msg: string) => void problems.push(`${path}: ${msg}`);
  if (typeof schema.$ref === 'string') {
    const target = schema.$ref
      .replace(/^#\//, '')
      .split('/')
      .reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Schema)[k] : undefined), root);
    if (!target || typeof target !== 'object') {
      fail(`unresolvable $ref ${schema.$ref}`);
      return problems;
    }
    return validateAgainstSchema(value, target as Schema, root, path, problems);
  }
  if ('const' in schema && value !== schema.const) {
    fail(`expected const ${JSON.stringify(schema.const)}`);
    return problems;
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    fail(`not in enum ${JSON.stringify(schema.enum)}`);
    return problems;
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
    if (!types.some((t) => t === actual || (t === 'number' && actual === 'integer'))) {
      fail(`type ${actual}, expected ${types.join('|')}`);
      return problems;
    }
  }
  if (typeof value === 'string') {
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(value)) fail(`"${value}" does not match ${schema.pattern}`);
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) fail('too short');
  }
  if (typeof value === 'number' && typeof schema.minimum === 'number' && value < schema.minimum) fail(`below minimum ${schema.minimum}`);
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) fail(`fewer than ${schema.minItems} items`);
    if (schema.uniqueItems === true && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) fail('items not unique');
    if (schema.items && typeof schema.items === 'object') value.forEach((v, i) => validateAgainstSchema(v, schema.items as Schema, root, `${path}[${i}]`, problems));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const key of (schema.required as string[] | undefined) ?? []) if (!(key in obj)) fail(`missing required "${key}"`);
    const props = (schema.properties as Record<string, Schema> | undefined) ?? undefined;
    for (const [key, v] of Object.entries(obj)) {
      if (schema.propertyNames && typeof schema.propertyNames === 'object') validateAgainstSchema(key, schema.propertyNames as Schema, root, `${path}.${key}(name)`, problems);
      if (props && key in props) validateAgainstSchema(v, props[key]!, root, `${path}.${key}`, problems);
      else if (schema.additionalProperties === false) fail(`unexpected property "${key}"`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') validateAgainstSchema(v, schema.additionalProperties as Schema, root, `${path}.${key}`, problems);
    }
  }
  return problems;
}
