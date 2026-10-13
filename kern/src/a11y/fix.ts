/**
 * Applying corrections (P8): a proposal is a list of editing operations; the entered value
 * replaces the placeholder. `fixSession` applies a selection of findings to an editing session
 * one after another and checks again after each one, so later corrections are computed on the
 * corrected document (heading levels, list conversions) and nothing is applied twice.
 */
import { EditError } from '../edit/dom.js';
import { EditSession, type EditOp, type OpResult, type SaveResult } from '../edit/session.js';
import { auditFiles, type AuditOptions } from './audit.js';
import { VALUE, type A11yReport, type Finding, type FixSuggestion } from './model.js';

export class FixError extends Error {
  constructor(
    readonly findingId: string,
    message: string,
  ) {
    super(message);
    this.name = 'FixError';
  }
}

/** The operations of a proposal with `value` in place of the placeholder. */
export function opsFor(fix: FixSuggestion, value?: string): EditOp[] {
  const needs = JSON.stringify(fix.ops).includes(JSON.stringify(VALUE));
  if (needs && value === undefined) throw new FixError('', `„${fix.input?.label ?? 'Wert'}“ fehlt`);
  const v = value ?? '';
  const replace = (x: unknown): unknown => {
    if (x === VALUE) return v;
    if (Array.isArray(x)) return x.map(replace);
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, replace(y)]));
    return x;
  };
  return (fix.ops as EditOp[]).map((op) => {
    const out = replace(op) as EditOp;
    // an empty alt text marks a decorative image (HP-INH-006: alt="")
    if (out.op === 'set-image' && out.alt === '' && needs) return { ...out, decorative: true };
    if (needs && v.trim() === '' && !(out.op === 'set-image')) throw new FixError('', `„${fix.input?.label ?? 'Wert'}“ darf nicht leer sein`);
    return out;
  });
}

/** The value a finding gets: entered value, else the proposal (if allowed), else undefined. */
export function valueFor(f: Finding, values: ReadonlyMap<string, string>, useProposals: boolean): string | undefined {
  if (values.has(f.id)) return values.get(f.id);
  if (!f.fix?.input) return undefined;
  return useProposals ? f.fix.input.proposal : undefined;
}

export interface FixOptions extends AuditOptions {
  /** Ids of the findings to correct; `all` = every finding with a proposal. */
  readonly select: readonly string[] | 'all';
  /** Entered values per finding id. */
  readonly values?: ReadonlyMap<string, string>;
  /** Use the proposed value where none was entered (default true). */
  readonly useProposals?: boolean;
  /** Upper bound of corrections (protection against a loop); default 500. */
  readonly limit?: number;
}

export interface FixOutcome {
  readonly applied: ReadonlyArray<{ readonly finding: Finding; readonly value?: string; readonly results: readonly OpResult[] }>;
  /** Findings that were selected but not corrected, with the reason. */
  readonly skipped: ReadonlyArray<{ readonly finding: Finding; readonly reason: string }>;
  readonly before: A11yReport;
  readonly after: A11yReport;
}

/** Applies one finding's proposal to the session; throws FixError (session unchanged) on failure. */
export function applyFinding(session: EditSession, f: Finding, value?: string): OpResult[] {
  if (!f.fix) throw new FixError(f.id, f.blocked ?? 'kein Korrekturvorschlag');
  let ops: EditOp[];
  try {
    ops = opsFor(f.fix, value);
  } catch (e) {
    throw new FixError(f.id, e instanceof Error ? e.message : String(e));
  }
  const done: OpResult[] = [];
  try {
    for (const op of ops) done.push(session.apply(op));
  } catch (e) {
    for (let k = 0; k < done.length; k++) session.undo();
    throw new FixError(f.id, e instanceof EditError ? e.message : e instanceof Error ? e.message : String(e));
  }
  return done;
}

/** Applies the selected proposals to an open session, checking again after each one. */
export function fixSession(session: EditSession, options: FixOptions): FixOutcome {
  const values = options.values ?? new Map<string, string>();
  const useProposals = options.useProposals ?? true;
  const limit = options.limit ?? 500;
  const before = auditFiles(session.currentFiles(), options);
  const wanted = options.select === 'all' ? undefined : new Set(options.select);
  const applied: Array<{ finding: Finding; value?: string; results: OpResult[] }> = [];
  const skipped = new Map<string, { finding: Finding; reason: string }>();
  for (const id of wanted ?? []) if (!before.findings.some((f) => f.id === id)) skipped.set(id, { finding: { id, rule: '', category: 'struktur', severity: 'fehler', wcag: [], path: '', message: 'unbekannter Befund' }, reason: 'kein solcher Befund im Prüfergebnis' });
  const tried = new Set<string>();
  let report = before;
  for (let n = 0; n < limit; n++) {
    const next = report.findings.find((f) => !tried.has(f.id) && (!wanted || wanted.has(f.id)));
    if (!next) break;
    tried.add(next.id);
    if (!next.fix) {
      skipped.set(next.id, { finding: next, reason: next.blocked ?? 'kein Korrekturvorschlag' });
      continue;
    }
    const needs = JSON.stringify(next.fix.ops).includes(JSON.stringify(VALUE));
    const value = needs ? valueFor(next, values, useProposals) : undefined;
    if (needs && value === undefined) {
      skipped.set(next.id, { finding: next, reason: `Eingabe nötig: ${next.fix.input?.label ?? 'Wert'} (kein Vorschlag)` });
      continue;
    }
    try {
      const results = applyFinding(session, next, value);
      applied.push({ finding: next, ...(value !== undefined ? { value } : {}), results });
      skipped.delete(next.id);
    } catch (e) {
      skipped.set(next.id, { finding: next, reason: e instanceof Error ? e.message : String(e) });
      continue;
    }
    report = auditFiles(session.currentFiles(), options);
  }
  const after = auditFiles(session.currentFiles(), options);
  // selected findings that vanished without being applied: an earlier correction moved their
  // address (pointer steps) or corrected them along with its own finding
  for (const f of before.findings) {
    if (!wanted?.has(f.id) || applied.some((a) => a.finding.id === f.id) || skipped.has(f.id)) continue;
    const still = after.findings.find((g) => g.id === f.id);
    skipped.set(f.id, { finding: f, reason: still ? 'nicht angewendet' : 'durch eine vorherige Korrektur mitbehoben oder an eine neue Adresse verschoben; bitte erneut prüfen' });
  }
  return { applied, skipped: [...skipped.values()], before, after };
}

/** Opens a container, applies the selected proposals and saves a new version. */
export async function fixContainer(bytes: Uint8Array, options: FixOptions & { readonly at: string; readonly note?: string }): Promise<FixOutcome & { readonly saved?: SaveResult }> {
  const session = await EditSession.open(bytes);
  const outcome = fixSession(session, options);
  if (outcome.applied.length === 0) return outcome;
  const note = options.note ?? `Barrierefreiheit: ${outcome.applied.length} Korrektur${outcome.applied.length === 1 ? '' : 'en'} (${[...new Set(outcome.applied.map((a) => a.finding.rule))].join(', ')})`;
  const saved = await session.save({ at: options.at, note });
  return { ...outcome, saved };
}
