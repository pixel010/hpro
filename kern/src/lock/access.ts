/**
 * Locks as rules in the manifest (part 0, section 9): `manifest.json#access` is a list of
 * `{ target, rules }`. `target` is an address `path#id` or a container path.
 *
 * | rule        | who enforces it      | protection                                                         |
 * |-------------|----------------------|--------------------------------------------------------------------|
 * | `read-only` | editor (HP-LOCK-002) | none against other tools; provable only if a signature covers it  |
 * | `no-print`  | reader (HP-LOCK-003) | none: the text is in the container                                 |
 * | `no-export` | reader (HP-LOCK-004) | none: the text is in the container                                 |
 * | `hidden`    | reader (HP-LOCK-005) | none, by definition                                                |
 * | `sealed`    | cryptography         | content encrypted (JWE); unreadable without a key (HPC-0007)       |
 *
 * These functions are pure: they take the manifest and content documents and return
 * decisions, so that every reading system decides the same way (docs/10, section 3, point 4).
 */
import type { Document, Element } from '@xmldom/xmldom';
import { fromUtf8, utf8 } from '../bytes.js';
import { ancestorIds, byId, descendants, parseXml, serializeXml, XHTML_NS } from './xml.js';

/** Rules of part 0 (HP-LOCK-001) plus `sealed` (HPC-0007, proposal for 0.2). */
export const ACCESS_RULES = ['read-only', 'no-print', 'no-export', 'hidden', 'sealed'] as const;
export type AccessRule = (typeof ACCESS_RULES)[number];
const EXTENSION_RULE = /^x-[a-z0-9]+-[a-z0-9-]+$/;

export interface AccessEntry {
  readonly target: string;
  readonly rules: readonly string[];
}

export class LockError extends Error {
  constructor(
    readonly code: 'read-only' | 'invalid' | 'sealed' | 'confirm' | 'leak' | 'not-found',
    message: string,
  ) {
    super(message);
    this.name = 'LockError';
  }
}

export function splitTarget(target: string): { path: string; id: string | null } {
  const hash = target.indexOf('#');
  return hash < 0 ? { path: target, id: null } : { path: target.slice(0, hash), id: target.slice(hash + 1) };
}

/** `access` of a manifest, shape-checked (HP-LOCK-001); throws `LockError('invalid')`. */
export function parseAccess(manifest: unknown): AccessEntry[] {
  const access = (manifest as { access?: unknown } | null)?.access;
  if (access === undefined) return [];
  if (!Array.isArray(access)) throw new LockError('invalid', 'manifest.json#access must be a list');
  return access.map((a: unknown, i) => {
    const e = a as { target?: unknown; rules?: unknown };
    if (!e || typeof e !== 'object' || typeof e.target !== 'string' || e.target === '') throw new LockError('invalid', `access[${i}]: target missing`);
    if (!Array.isArray(e.rules) || e.rules.length === 0) throw new LockError('invalid', `access[${i}]: rules missing or empty`);
    for (const r of e.rules) {
      if (typeof r !== 'string' || (!(ACCESS_RULES as readonly string[]).includes(r) && !EXTENSION_RULE.test(r))) throw new LockError('invalid', `access[${i}]: rule ${JSON.stringify(r)} is not allowed`);
    }
    return { target: e.target, rules: e.rules as string[] };
  });
}

/**
 * Checks that every target resolves (HP-LOCK-001): the path exists, and for `path#id` the
 * document has an element with that id. Returns the problems (empty = valid).
 */
export function checkTargets(entries: readonly AccessEntry[], files: ReadonlyMap<string, Uint8Array>): string[] {
  const problems: string[] = [];
  const docs = new Map<string, Document>();
  for (const e of entries) {
    const { path, id } = splitTarget(e.target);
    const data = files.get(path);
    if (!data) {
      problems.push(`${e.target}: file ${path} does not exist`);
      continue;
    }
    if (id === null) continue;
    let doc = docs.get(path);
    if (!doc) {
      try {
        doc = parseXml(fromUtf8(data), path);
      } catch (err) {
        problems.push(`${e.target}: ${(err as Error).message}`);
        continue;
      }
      docs.set(path, doc);
    }
    if (!byId(doc, id)) problems.push(`${e.target}: no element with id "${id}" in ${path}`);
  }
  return problems;
}

/** Merges rules into `access` (new entry or extended existing entry with the same target). */
export function withRules(access: readonly AccessEntry[], target: string, rules: readonly string[]): AccessEntry[] {
  const out = access.map((a) => ({ target: a.target, rules: [...a.rules] }));
  const hit = out.find((a) => a.target === target);
  if (hit) for (const r of rules) !hit.rules.includes(r) && hit.rules.push(r);
  else out.push({ target, rules: [...rules] });
  return out;
}

/** Rules in force for the document at `path`: `null` id = whole file. `prefix` maps a rendition's targets (`renditions/<id>/…`). */
export function rulesForDocument(entries: readonly AccessEntry[], path: string): Array<{ id: string | null; rules: readonly string[] }> {
  return entries.flatMap((e) => {
    const t = splitTarget(e.target);
    return t.path === path ? [{ id: t.id, rules: e.rules }] : [];
  });
}

/** All rules that apply to an element: those of the file and those of every ancestor with an id. */
export function rulesAt(entries: readonly AccessEntry[], path: string, ids: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const r of rulesForDocument(entries, path)) if (r.id === null || ids.includes(r.id)) for (const x of r.rules) out.add(x);
  return out;
}

/** HP-LOCK-002 for an editor: throws `LockError('read-only')` when the element lies under a `read-only` target. */
export function assertEditable(entries: readonly AccessEntry[], path: string, element: Element, what = 'Inhalt'): void {
  const ids = ancestorIds(element);
  const hit = rulesForDocument(entries, path).find((r) => r.rules.includes('read-only') && (r.id === null || ids.includes(r.id)));
  if (hit) throw new LockError('read-only', `${what} ist gesperrt: ${hit.id === null ? path : `${path}#${hit.id}`} trägt die Regel read-only (HP-LOCK-002)`);
}

/** Notice text that replaces a section in print or export (HP-LOCK-003, HP-LOCK-004). */
export function lockNotice(purpose: 'print' | 'export', name: string): string {
  return `Abschnitt ${name} nicht zum ${purpose === 'print' ? 'Druck' : 'Export'} freigegeben`;
}

export interface ViewResult {
  readonly xhtml: string;
  /** Targets left out, with the notice that replaced them. */
  readonly omitted: ReadonlyArray<{ readonly target: string; readonly notice: string }>;
}

/**
 * The content document as it may leave the reader for printing or export: every element with
 * `no-print` (or `no-export`) is replaced by a `p` with the notice; `sealed` placeholders stay
 * placeholders; `hidden` is dropped from print as well (it is not shown). A whole-file rule
 * empties the body.
 */
export function outputView(xhtml: string, path: string, entries: readonly AccessEntry[], purpose: 'print' | 'export'): ViewResult {
  const rule = purpose === 'print' ? 'no-print' : 'no-export';
  const doc = parseXml(xhtml, path);
  const omitted: Array<{ target: string; notice: string }> = [];
  const notice = (name: string) => {
    const p = doc.createElementNS(XHTML_NS, 'p');
    p.setAttribute('data-hp-role', 'lock-notice');
    const text = lockNotice(purpose, name);
    p.appendChild(doc.createTextNode(text));
    return { p, text };
  };
  for (const r of rulesForDocument(entries, path)) {
    const drop = r.rules.includes(rule) || (purpose === 'print' && r.rules.includes('hidden'));
    if (!drop) continue;
    if (r.id === null) {
      const body = descendants(doc).find((e) => e.localName === 'body');
      if (!body) continue;
      while (body.firstChild) body.removeChild(body.firstChild);
      const n = notice(path);
      body.appendChild(n.p);
      omitted.push({ target: path, notice: n.text });
      continue;
    }
    const el = byId(doc, r.id);
    if (!el || !el.parentNode) continue;
    const n = notice(r.id);
    el.parentNode.replaceChild(n.p, el);
    omitted.push({ target: `${path}#${r.id}`, notice: n.text });
  }
  return { xhtml: serializeXml(doc, xhtml), omitted };
}

/** UTF-8 helper for callers working on bytes. */
export function outputViewBytes(bytes: Uint8Array, path: string, entries: readonly AccessEntry[], purpose: 'print' | 'export'): { bytes: Uint8Array; omitted: ViewResult['omitted'] } {
  const r = outputView(fromUtf8(bytes), path, entries, purpose);
  return { bytes: utf8(r.xhtml), omitted: r.omitted };
}
