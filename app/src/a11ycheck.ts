/**
 * Accessibility check in the reader (package P8): the panel "Prüfen" runs the check of the core
 * (`a11y.auditFiles`) over the main version, lists the findings by category and corrects them
 * one by one or all at once. Corrections are editing operations of the core (`edit.EditSession`),
 * so they show at once in the document frame (a preview of the unsaved state), "Rückgängig" takes
 * them back and "Speichern" writes a new version with a history entry — the same way as editing.
 *
 * Focus management: after a correction the focus moves to the next finding (its input or its
 * button), or to the summary when nothing is left; every result is also announced.
 */
import { a11y, edit } from '@hpro/kern';
import { previewDocument, type LoadedDocument } from './document.js';

export interface CheckHost {
  /** The opened document (saved state) and the path of the shown content document. */
  current(): { doc: LoadedDocument; path: string } | undefined;
  /** Show the unsaved state; `id` is scrolled into view. */
  preview(doc: LoadedDocument, path: string, id?: string): void;
  /** Show an element of a content document. */
  reveal(path: string, id?: string): void;
  /** A new file was written: open it in the reader. */
  saved(bytes: Uint8Array, fileName: string, message: string): Promise<void>;
  download(bytes: Uint8Array, name: string, type: string): void;
  announce(text: string): void;
}

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<Record<string, string>> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v !== undefined) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

/** `dateModified` of the saved version: now, but never before the last one (HP-META-006). */
function timestamp(after: string): string {
  const now = Date.now();
  const min = Date.parse(after) + 1000;
  return new Date(Number.isNaN(min) ? now : Math.max(now, min)).toISOString().slice(0, 19) + 'Z';
}

const SEVERITY: Record<a11y.Severity, string> = { fehler: 'Fehler', warnung: 'Warnung' };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export class CheckPanel {
  private session: edit.EditSession | undefined;
  private opening: Promise<edit.EditSession> | undefined;
  private base: LoadedDocument | undefined;
  private report: a11y.A11yReport | undefined;
  /** Number of editing operations per applied correction, for "Rückgängig". */
  private readonly undoStack: Array<{ ops: number; label: string }> = [];
  private applied = 0;

  constructor(private readonly host: CheckHost) {
    $('a11y-run').addEventListener('click', () => void this.run(true));
    $('a11y-fix-all').addEventListener('click', () => void this.fixAll());
    $('a11y-undo').addEventListener('click', () => this.undo());
    $('a11y-save').addEventListener('click', () => void this.save());
  }

  /** A document was opened: start over (corrections of the previous file are gone). */
  reset(doc: LoadedDocument): void {
    this.base = doc;
    this.session = undefined;
    this.opening = undefined;
    this.report = undefined;
    this.undoStack.length = 0;
    this.applied = 0;
    const main = doc.version.id === null;
    const button = $<HTMLButtonElement>('btn-a11y');
    button.disabled = !main;
    button.title = main ? 'Barrierefreiheit prüfen und korrigieren' : 'Eine eingefrorene Fassung wird nicht geändert';
    $('a11y-list').replaceChildren();
    $('a11y-error').textContent = '';
    $('a11y-summary').textContent = '';
    this.updateButtons();
    if (!$('a11y-panel').hidden && main) void this.show();
  }

  /** The panel was opened: load the session and run the check. */
  async show(): Promise<void> {
    if (!this.base || this.base.version.id !== null) return;
    try {
      await this.ensure();
      if (!this.report) this.check();
      this.render();
    } catch (e) {
      this.error(e);
    }
  }

  private ensure(): Promise<edit.EditSession> {
    if (this.session) return Promise.resolve(this.session);
    if (!this.opening) {
      const base = this.base!;
      this.opening = edit.EditSession.open(base.bytes).then((s) => {
        if (this.base === base) this.session = s;
        return s;
      });
    }
    return this.opening;
  }

  private check(): void {
    this.report = a11y.auditFiles(this.session!.currentFiles());
  }

  /** "Erneut prüfen": a new run over the current (possibly corrected, unsaved) state. */
  private async run(announce: boolean): Promise<void> {
    try {
      await this.ensure();
      this.check();
      this.render();
      if (announce) {
        this.host.announce(this.summaryText());
        $('a11y-summary').focus();
      }
    } catch (e) {
      this.error(e);
    }
  }

  private summaryText(): string {
    const r = this.report;
    if (!r) return '';
    const cats = a11y.CATEGORIES.filter((c) => r.counts[c] > 0).length;
    if (r.findings.length === 0) return `Keine Befunde – alle sieben Kategorien geprüft (${plural(r.documents.length, 'Dokument', 'Dokumente')}, Farbschemata ${r.schemes.join(', ')}).`;
    return `${plural(r.findings.length, 'Befund', 'Befunde')} in ${plural(cats, 'Kategorie', 'Kategorien')}, ${r.findings.filter((f) => f.fix).length} mit Korrekturvorschlag.`;
  }

  private render(): void {
    const r = this.report;
    if (!r) return;
    $('a11y-error').textContent = '';
    $('a11y-summary').textContent = this.summaryText() + (this.applied > 0 ? ` ${plural(this.applied, 'Korrektur', 'Korrekturen')} noch nicht gespeichert.` : '');
    const tbody = $('a11y-counts').querySelector('tbody')!;
    tbody.replaceChildren(
      ...a11y.CATEGORIES.map((c) => {
        const tr = el('tr');
        tr.append(el('th', { scope: 'row' }, a11y.CATEGORY_LABEL[c]), el('td', {}, String(r.counts[c])));
        if (r.counts[c] > 0) tr.className = 'a11y-has';
        return tr;
      }),
    );
    const list = $('a11y-list');
    list.replaceChildren();
    let n = 0;
    for (const c of a11y.CATEGORIES) {
      const fs = r.findings.filter((f) => f.category === c);
      if (fs.length === 0) continue;
      const section = el('section', { class: 'a11y-category', 'aria-labelledby': `a11y-cat-${c}` });
      section.append(el('h3', { id: `a11y-cat-${c}`, class: 'calc-h3' }, `${a11y.CATEGORY_LABEL[c]} (${fs.length})`));
      const ol = el('ol', { class: 'a11y-findings' });
      for (const f of fs) ol.append(this.item(f, n++));
      section.append(ol);
      list.append(section);
    }
    const nc = $('a11y-notchecked-list');
    nc.replaceChildren(...r.notChecked.map((x) => el('li', {}, `${x.what}: ${x.why}`)));
    this.updateButtons();
  }

  private item(f: a11y.Finding, n: number): HTMLLIElement {
    const li = el('li', { class: 'a11y-finding', 'data-id': f.id });
    const msgId = `a11y-msg-${n}`;
    const head = el('p', { class: 'a11y-head', id: msgId });
    head.append(el('span', { class: `a11y-sev ${f.severity}` }, SEVERITY[f.severity]), document.createTextNode(` ${f.message}`));
    li.append(head);
    const where = f.line ? `${f.path}, Zeile ${f.line}` : f.path;
    li.append(el('p', { class: 'a11y-meta' }, `WCAG ${f.wcag.join(', ')}${f.spec ? ` · ${f.spec}` : ''} · ${where}`));
    if (f.excerpt) li.append(el('p', { class: 'a11y-excerpt' }, `„${f.excerpt}“`));
    let input: HTMLInputElement | undefined;
    if (f.fix?.input) {
      const id = `a11y-in-${n}`;
      li.append(el('label', { for: id }, f.fix.input.label));
      input = el('input', { type: 'text', id, 'data-id': f.id, ...(f.fix.input.kind === 'lang' ? { spellcheck: 'false', autocomplete: 'off' } : {}) });
      input.value = f.fix.input.proposal ?? '';
      const hintId = `a11y-hint-${n}`;
      input.setAttribute('aria-describedby', hintId);
      li.append(input);
      const hint = f.fix.input.proposal !== undefined ? `Vorschlag ${f.fix.input.source ?? ''}.` : 'Kein Vorschlag – bitte eintragen.';
      const altHint = f.rule.startsWith('alt-') ? ' Leer lassen = dekoratives Bild.' : '';
      li.append(el('p', { class: 'hint', id: hintId }, hint + altHint));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          void this.fixOne(f.id);
        }
      });
    }
    const buttons = el('div', { class: 'a11y-buttons' });
    if (f.target) {
      const show = el('button', { type: 'button', 'aria-describedby': msgId }, 'Zeigen');
      show.addEventListener('click', () => this.reveal(f));
      buttons.append(show);
    }
    if (f.fix) {
      const fix = el('button', { type: 'button', class: 'primary', 'data-fix': f.id, 'aria-describedby': msgId, title: f.fix.description }, f.fix.label);
      fix.addEventListener('click', () => void this.fixOne(f.id));
      buttons.append(fix);
    }
    li.append(buttons);
    if (f.fix) li.append(el('p', { class: 'hint' }, f.fix.description));
    else li.append(el('p', { class: 'hint' }, `Keine automatische Korrektur: ${f.blocked ?? '–'}`));
    return li;
  }

  private reveal(f: a11y.Finding): void {
    const t = f.target ?? f.path;
    const hash = t.indexOf('#');
    const path = hash < 0 ? t : t.slice(0, hash);
    const id = hash < 0 ? undefined : t.slice(hash + 1).split('/')[0] || undefined;
    if (this.applied > 0) this.preview(path, id);
    else this.host.reveal(path, id);
  }

  private preview(path?: string, id?: string): void {
    const s = this.session;
    const base = this.base;
    if (!s || !base) return;
    const changed = new Map(s.changedDocuments().map((p) => [p, s.xhtml(p)]));
    const files = new Map<string, { data: Uint8Array; type: string }>(s.pendingFiles());
    const enc = new TextEncoder();
    for (const [p, text] of s.changedSheets()) files.set(p, { data: enc.encode(text), type: 'text/css' });
    const doc = previewDocument(base, changed, files, s.removedFiles(), s.currentTitle(), s.navigation());
    this.host.preview(doc, path ?? this.host.current()?.path ?? base.content[0]!.path, id);
  }

  private valueOf(id: string): string | undefined {
    const input = document.querySelector<HTMLInputElement>(`#a11y-list input[data-id="${CSS.escape(id)}"]`);
    return input ? input.value : undefined;
  }

  /** Corrects one finding with the value of its input field. */
  private async fixOne(id: string): Promise<void> {
    const s = await this.ensure();
    const f = this.report?.findings.find((x) => x.id === id);
    if (!f) return;
    const order = this.report!.findings.map((x) => x.id);
    const index = order.indexOf(id);
    try {
      const results = a11y.applyFinding(s, f, this.valueOf(id));
      this.undoStack.push({ ops: results.length, label: f.fix!.label });
      this.applied++;
      this.check();
      const path = f.target?.split('#')[0] ?? f.path;
      this.preview(path.endsWith('.xhtml') ? path : undefined);
      this.render();
      const left = this.report!.findings.length;
      this.host.announce(`Korrigiert: ${f.fix!.label}. ${left === 0 ? 'Keine Befunde mehr.' : `Noch ${plural(left, 'Befund', 'Befunde')}.`}`);
      this.focusAfter(order, index);
    } catch (e) {
      this.error(e);
    }
  }

  /** Focus on the finding that now stands where the corrected one was, else the summary. */
  private focusAfter(order: readonly string[], index: number): void {
    const now = new Set(this.report!.findings.map((x) => x.id));
    const nextId = [...order.slice(index + 1), ...order.slice(0, index)].find((id) => now.has(id)) ?? this.report!.findings[0]?.id;
    const li = nextId ? document.querySelector<HTMLElement>(`#a11y-list li[data-id="${CSS.escape(nextId)}"]`) : null;
    // the input of the next proposal, else its correction button, else "Zeigen"
    const target = li?.querySelector<HTMLElement>('input') ?? li?.querySelector<HTMLElement>('button[data-fix]') ?? li?.querySelector<HTMLElement>('button') ?? $('a11y-summary');
    target.focus();
  }

  /** "Alle Vorschläge übernehmen": every finding with a proposal or an entered value. */
  private async fixAll(): Promise<void> {
    const s = await this.ensure();
    const values = new Map<string, string>();
    for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('#a11y-list input[data-id]'))) {
      // an empty field is not a value here (it would mark an image as decorative): skip it
      if (input.value.trim() !== '') values.set(input.dataset['id']!, input.value);
    }
    try {
      const out = a11y.fixSession(s, { select: 'all', values, useProposals: false });
      for (const a of out.applied) this.undoStack.push({ ops: a.results.length, label: a.finding.fix!.label });
      this.applied += out.applied.length;
      this.report = out.after;
      if (out.applied.length > 0) this.preview();
      this.render();
      const skipped = out.skipped.length > 0 ? ` Nicht korrigiert: ${out.skipped.map((x) => `${x.finding.message.split(':')[0]} (${x.reason})`).join('; ')}.` : '';
      const text = `${plural(out.applied.length, 'Korrektur', 'Korrekturen')} übernommen. ${this.summaryText()}${skipped}`;
      this.host.announce(text);
      if (out.skipped.length > 0) $('a11y-error').textContent = skipped.trim();
      this.focusAfter([], -1);
    } catch (e) {
      this.error(e);
    }
  }

  private undo(): void {
    const s = this.session;
    const last = this.undoStack.pop();
    if (!s || !last) return;
    for (let k = 0; k < last.ops; k++) s.undo();
    this.applied--;
    this.check();
    this.preview();
    this.render();
    this.host.announce(`Rückgängig: ${last.label}. ${this.summaryText()}`);
    $('a11y-summary').focus();
  }

  private stem(): string {
    return (this.base?.fileName ?? 'dokument').replace(/\.[^.]+$/, '').replace(/-(bearbeitet|geschwaerzt|geprueft)(-\d+)?$/, '');
  }

  private async save(): Promise<void> {
    const s = this.session;
    const base = this.base;
    if (!s || !base || this.applied === 0) return;
    try {
      const rules = [...new Set(s.results.map((r) => r.op))];
      const r = await s.save({ at: timestamp(base.modified), note: `Barrierefreiheit: ${plural(this.applied, 'Korrektur', 'Korrekturen')} aus dem Prüflauf (${rules.join(', ')})` });
      const name = `${this.stem()}-geprueft.hpro`;
      this.host.download(r.bytes, name, 'application/epub+zip');
      await this.host.saved(r.bytes, name, `Gespeichert als Fassung ${r.version} (${plural(this.applied, 'Korrektur', 'Korrekturen')}); die Datei „${name}“ wurde heruntergeladen.`);
    } catch (e) {
      this.error(e);
    }
  }

  private updateButtons(): void {
    $<HTMLButtonElement>('a11y-undo').disabled = this.undoStack.length === 0;
    $<HTMLButtonElement>('a11y-save').disabled = this.applied === 0;
    $<HTMLButtonElement>('a11y-fix-all').disabled = !this.report || !this.report.findings.some((f) => f.fix);
  }

  private error(e: unknown): void {
    const text = e instanceof Error ? e.message : String(e);
    $('a11y-error').textContent = text;
    this.host.announce(text);
  }
}
