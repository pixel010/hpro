/**
 * Locks in the reader (P17; part 0, section 9; HPC-0007 for `sealed`).
 *
 * The decisions come from the core (`lock.parseAccess`, `lock.sealedSections`,
 * `lock.openEnvelope`); this module applies them to the rendered copy of a content document:
 *
 * | rule        | in the reader                                                                  |
 * |-------------|---------------------------------------------------------------------------------|
 * | `hidden`    | out of the flow with a visible note; "Einblenden" shows it (HP-LOCK-005)       |
 * | `no-print`  | left out when printed, the notice takes its place (HP-LOCK-003)                |
 * | `no-export` | marked; the reader has no export yet (P9), `lock.outputView` is the rule       |
 * | `read-only` | input cells inside are not offered for entry (HP-LOCK-002)                     |
 * | `sealed`    | placeholder from the file; decrypted only in memory after a key is given       |
 *
 * Decrypted sections are never written back and never leave the reader's memory; closing the
 * document or opening another version forgets them.
 */
import { lock } from '@hpro/kern';
import { READER_MARK } from './search.js';

export interface LockState {
  readonly access: readonly lock.AccessEntry[];
  readonly sealed: readonly lock.SealedSection[];
  /** Show `hidden` sections (the user asked for it). */
  readonly showHidden: boolean;
}

export function accessOf(manifest: unknown): lock.AccessEntry[] {
  try {
    return lock.parseAccess(manifest);
  } catch {
    return [];
  }
}

function note(doc: Document, text: string, kind: string): HTMLElement {
  const p = doc.createElement('p');
  p.className = `hp-lock-note hp-lock-${kind}`;
  p.setAttribute(READER_MARK, 'lock');
  p.setAttribute('role', 'note');
  p.textContent = text;
  return p;
}

/** Applies the rules of `path` to the rendered body (a copy; the source DOM is untouched). */
export function applyLocks(body: HTMLElement, path: string, state: LockState): void {
  const doc = body.ownerDocument;
  for (const r of lock.rulesForDocument(state.access, path)) {
    const el = r.id === null ? body : doc.getElementById(r.id);
    if (!el) continue;
    const name = r.id ?? path;
    el.setAttribute('data-hp-lock', r.rules.join(' '));
    if (r.rules.includes('read-only')) {
      el.setAttribute('data-hp-readonly', '');
      for (const cell of Array.from(el.querySelectorAll('[data-hp-input]'))) cell.removeAttribute('data-hp-input');
    }
    if (r.rules.includes('no-print') && el !== body) {
      el.setAttribute('data-hp-noprint', '');
      const n = note(doc, lock.lockNotice('print', name), 'print');
      n.setAttribute('data-hp-print-only', '');
      el.after(n);
    }
    if (r.rules.includes('hidden') && el !== body) {
      // Never printed, also when shown on screen (same as lock.outputView).
      const n = note(doc, lock.hiddenNotice(name), 'print');
      n.setAttribute('data-hp-print-only', '');
      el.after(n);
      if (!state.showHidden) {
        el.hidden = true;
        el.before(note(doc, `Ausgeblendeter Abschnitt ${name} (Sperre „hidden“). Einblenden über die Leiste „Sperren“ über dem Dokument; die Sperre ist kein Schutz vor dem Lesen.`, 'hidden'));
      } else {
        el.before(note(doc, `Eingeblendet: Abschnitt ${name} ist im Dokument als ausgeblendet gekennzeichnet.`, 'hidden'));
      }
    }
    if (r.rules.includes('sealed') && el.hasAttribute('data-hp-sealed')) el.setAttribute('data-hp-lock-state', 'sealed');
  }
}

/** True when the element with `id` (or one of its ancestors) carries `hidden` in `path`. */
export function isHidden(state: LockState, path: string, dom: Document, id: string | undefined): boolean {
  const ids: string[] = [];
  for (let el: Element | null = id ? dom.getElementById(id) : null; el; el = el.parentElement) if (el.id) ids.push(el.id);
  return lock.rulesForDocument(state.access, path).some((r) => r.rules.includes('hidden') && (r.id === null || ids.includes(r.id)));
}

export interface UnsealResult {
  readonly opened: string[];
  readonly failed: Array<{ target: string; reason: string }>;
}

/**
 * Opens every sealed section of the shown version with `password` and puts the decrypted
 * section into the source DOM of its content document (memory only).
 */
export async function unsealAll(
  sections: readonly lock.SealedSection[],
  files: ReadonlyMap<string, Uint8Array>,
  content: ReadonlyArray<{ readonly path: string; readonly dom: Document }>,
  password: string,
): Promise<UnsealResult> {
  const opened: string[] = [];
  const failed: Array<{ target: string; reason: string }> = [];
  for (const s of sections) {
    const env = files.get(s.envelope);
    const target = content.find((c) => c.path === s.path);
    const ph = target?.dom.getElementById(s.id);
    if (!env || !target || !ph || !ph.hasAttribute('data-hp-sealed')) continue;
    try {
      const xhtml = await lock.openEnvelope(env, s.target, { password });
      const frag = new DOMParser().parseFromString(`<wrapper xmlns="http://www.w3.org/1999/xhtml">${xhtml}</wrapper>`, 'application/xhtml+xml');
      const section = frag.documentElement.firstElementChild;
      if (frag.getElementsByTagName('parsererror').length > 0 || !section || section.getAttribute('id') !== s.id) throw new Error('Inhalt des Umschlags ist kein Abschnitt mit dieser Kennung');
      const node = target.dom.importNode(section, true) as Element;
      node.setAttribute('data-hp-unsealed', '');
      ph.replaceWith(node);
      opened.push(s.target);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      failed.push({ target: s.target, reason: e.code === 'decrypt' ? 'Kennwort passt nicht' : e.code === 'no-recipient' ? 'nicht für ein Kennwort versiegelt' : (e.message ?? String(err)) });
    }
  }
  return { opened, failed };
}
