/**
 * Annotations in the reader (package P7, HPC-0010): comments, highlights, freehand drawings,
 * threads with status, export and import, and the comparison with another file.
 *
 * The core does all the work on the format (`annotate`): it reads the annotation files of the
 * container, anchors them in the text, checks and writes changes, exports and merges. This
 * module keeps the unsaved changes of the session, shows the annotations in the document frame
 * and runs the panel "Anmerkungen".
 *
 * In the frame (render.ts calls `markAnnotationText` and `placeInk` on its copy of the document):
 *   - a passage is wrapped in `<mark data-hp-anno="<id>">`, split over text nodes as needed;
 *   - every thread gets a numbered button (`data-hp-reader="anno-btn"`, like a footnote mark) at
 *     the end of its passage or element: the keyboard way to it, labelled with author and text;
 *   - a drawing is an `svg` over the element box (`data-hp-reader="ink"`), built from the path
 *     data the core has checked (`annotate.parseInk`), never from markup of the file.
 * Comment text only ever reaches `textContent` and attribute values.
 */
import { annotate, edit } from '@hpro/kern';
import type { LoadedDocument } from './document.js';

type StoredAnnotation = annotate.AnnotationSet['items'][number];

/** What the frame needs to show one annotation (one thread root). */
export interface AnnotationMark {
  readonly id: string;
  /** Number of the thread, shown on its button. */
  readonly number: number;
  readonly kind: 'comment' | 'highlight' | 'ink';
  readonly color?: annotate.ColorName;
  readonly elementId: string;
  /** Normalised range in the element text (passages only). */
  readonly start?: number;
  readonly end?: number;
  readonly ink?: annotate.InkDrawing;
  /** Accessible name of the button: number, kind, author, status, text. */
  readonly label: string;
  readonly resolved: boolean;
}

const KIND = annotate.KIND_LABEL;
const GENERATOR = 'hpro Reader 0.1.0';
const AUTHOR_KEY = 'hpro.annotations.author';

/** UTC time in seconds, not before `after` (+1 s), as the core expects for `modified`. */
export function timestamp(after?: string): string {
  const now = Date.now();
  const min = after ? Date.parse(after) + 1000 : NaN;
  return new Date(Number.isNaN(min) ? now : Math.max(now, min)).toISOString().slice(0, 19) + 'Z';
}

const one = (s: string, n = 80) => {
  const t = s.replace(/[ \t\n\f\r]+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

// ---------------------------------------------------------------------------------------------
// Marks in the frame copy

/** Wraps the passages of `marks` and adds the numbered buttons (before sanitising, on the untouched copy). */
export function markAnnotationText(doc: Document, marks: readonly AnnotationMark[]): void {
  for (const m of marks) {
    const el = doc.getElementById(m.elementId);
    if (!el) continue;
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = `hp-anno-btn${m.resolved ? ' hp-anno-erledigt' : ''}`;
    button.setAttribute('data-hp-reader', 'anno-btn');
    button.setAttribute('data-hp-anno-open', m.id);
    button.setAttribute('aria-label', m.label);
    button.textContent = String(m.number);
    if (m.start !== undefined && m.end !== undefined) {
      const t = annotate.elementText(el as unknown as annotate.NodeLike);
      const pieces = annotate.piecesOf(t, m.start, m.end);
      let last: Element | undefined;
      for (const p of pieces) {
        const node = p.node as unknown as Text;
        let mid = node;
        if (p.start > 0) mid = mid.splitText(p.start);
        if (p.end - p.start < mid.data.length) mid.splitText(p.end - p.start);
        const mark = doc.createElement('mark');
        mark.className = `hp-anno hp-anno-${m.kind === 'highlight' ? (m.color ?? 'gelb') : 'kommentar'}${m.resolved ? ' hp-anno-erledigt' : ''}`;
        mark.setAttribute('data-hp-anno', m.id);
        mark.title = m.label;
        mid.replaceWith(mark);
        mark.append(mid);
        last = mark;
      }
      if (last) last.after(button);
      continue;
    }
    // Whole element (comment without passage, drawing): marker at the end of the element.
    el.classList.add('hp-anno-block');
    if (m.resolved) el.classList.add('hp-anno-block-erledigt');
    if (el.localName === 'table' || el.localName === 'tr' || el.localName === 'tbody' || el.localName === 'thead') {
      const caption = el.localName === 'table' ? (el as HTMLTableElement).caption : null;
      if (caption) caption.append(button);
      else el.before(button);
    } else el.append(button);
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Drawings over their elements (after tables got their scroll wrapper, render.ts `wrapTables`). */
export function placeInk(doc: Document, marks: readonly AnnotationMark[]): void {
  for (const m of marks) {
    if (!m.ink) continue;
    const el = doc.getElementById(m.elementId);
    if (!el) continue;
    // A table is measured by its scroll wrapper (frame-agent.js does the same when drawing).
    const host = el.localName === 'table' && el.parentElement?.hasAttribute('data-hp-wrap') ? el.parentElement : el;
    host.classList.add('hp-ink-host');
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', `hp-ink${m.resolved ? ' hp-anno-erledigt' : ''}`);
    svg.setAttribute('data-hp-reader', 'ink');
    svg.setAttribute('data-hp-anno', m.id);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const d of m.ink.paths) {
      const path = doc.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', annotate.COLORS[m.ink.color]);
      path.setAttribute('stroke-width', String(m.ink.width));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(path);
    }
    host.append(svg);
  }
}

// ---------------------------------------------------------------------------------------------
// Session: saved annotations plus unsaved changes

/** A selection reported by the frame agent: raw offsets in the text of element `id`. */
export interface FrameSelection {
  readonly path: string;
  readonly id: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export class AnnotationSession {
  /** New annotations of this session, in order of creation. */
  readonly added: annotate.WebAnnotation[] = [];
  /** Saved annotations deleted in this session. */
  readonly removed = new Set<string>();
  /** Something was imported from another copy (its text may have moved). */
  imported = false;
  private readonly index: annotate.DocumentIndex;
  private readonly anchors = new Map<string, annotate.Anchor>();

  private constructor(
    readonly doc: LoadedDocument,
    readonly saved: annotate.AnnotationSet,
  ) {
    this.index = new annotate.DocumentIndex(doc.files);
    for (const i of saved.items) if (i.anchor) this.anchors.set(i.info.id, i.anchor);
  }

  static async open(doc: LoadedDocument): Promise<AnnotationSession> {
    return new AnnotationSession(doc, await annotate.readAnnotations(doc.bytes));
  }

  get dirty(): boolean {
    return this.added.length > 0 || this.removed.size > 0;
  }

  /** Saved and new annotations, without the deleted ones. */
  items(): StoredAnnotation[] {
    const kept = this.saved.items.filter((i) => !this.removed.has(i.info.id));
    const fresh = this.added.map((json): StoredAnnotation => {
      const info = annotate.describe(json);
      return { path: annotate.fileOf(json.id), json, info, listed: false, signed: false, integrity: 'unlisted', ...(info.kind !== 'reply' ? { anchor: this.anchor(info) } : {}) };
    });
    return [...kept, ...fresh];
  }

  /** The working set in the shape the core exports. */
  set(): annotate.AnnotationSet {
    const items = this.items();
    const { threads, orphans } = annotate.threadsOf(items.map((i) => i.info));
    return { items, threads, orphans, problems: this.saved.problems, mode: this.saved.mode };
  }

  isNew(id: string): boolean {
    return this.added.some((a) => a.id === id);
  }

  private anchor(info: annotate.AnnotationInfo): annotate.Anchor {
    let a = this.anchors.get(info.id);
    if (!a) {
      a = annotate.resolveAnchor(info, this.index);
      this.anchors.set(info.id, a);
    }
    return a;
  }

  /** Marks of the threads anchored in content document `path`. */
  marks(path: string): AnnotationMark[] {
    const set = this.set();
    const byId = new Map(set.items.map((i) => [i.info.id, i]));
    const out: AnnotationMark[] = [];
    set.threads.forEach((t, k) => {
      const r = t.root;
      const a = byId.get(r.id)?.anchor;
      if (!a || a.state === 'orphaned' || a.path !== path || !a.elementId || r.kind === 'reply') return;
      const status = t.status === 'resolved' ? 'erledigt' : 'offen';
      const text = r.text ? `: ${one(r.text, 120)}` : r.quote ? `: „${one(r.quote.exact, 60)}“` : '';
      const replies = t.replies.length > 0 ? `, ${t.replies.length} ${t.replies.length === 1 ? 'Antwort' : 'Antworten'}` : '';
      out.push({
        id: r.id,
        number: k + 1,
        kind: r.kind,
        ...(r.color ? { color: r.color } : {}),
        elementId: a.elementId,
        ...(a.start !== undefined && a.end !== undefined ? { start: a.start, end: a.end } : {}),
        ...(r.ink ? { ink: r.ink } : {}),
        label: `Anmerkung ${k + 1}, ${KIND[r.kind]} von ${r.author}, ${status}${replies}${text}`,
        resolved: t.status === 'resolved',
      });
    });
    return out;
  }

  /**
   * Quote for a selection of the frame: the raw offsets are mapped onto the normalised text of
   * the same element in the file; if the frame text differs there (a calculated cell, a leading
   * line break in `pre`), the selected text is searched instead.
   */
  quoteFromSelection(sel: FrameSelection): annotate.Quote {
    const t = this.index.text(sel.path, sel.id);
    if (!t) throw new annotate.AnnotationError('Diese Stelle hat keine Adresse im Dokument.');
    const wanted = annotate.normalizeText(sel.text);
    if (wanted === '') throw new annotate.AnnotationError('Die Auswahl enthält keinen Text.');
    if (t.raw.slice(sel.start, sel.end) === sel.text) {
      const start = annotate.rawToNorm(t, sel.start);
      let end = annotate.rawToNorm(t, sel.end);
      const q = annotate.quoteAt(t, start, end);
      // Leading/trailing white space of the selection is not part of the quote.
      const trimmed = q.exact.replace(/^ +| +$/g, '');
      if (trimmed !== q.exact) {
        const lead = q.exact.length - q.exact.replace(/^ +/, '').length;
        end = start + lead + trimmed.length;
        return annotate.quoteAt(t, start + lead, end);
      }
      return q;
    }
    const i = t.text.indexOf(wanted);
    if (i < 0) throw new annotate.AnnotationError('Der markierte Text steht so nicht in der Datei (berechneter oder eingefügter Text); diese Stelle lässt sich nicht verankern.');
    return annotate.quoteAt(t, i, i + wanted.length);
  }

  private lastCreated = 0;

  /**
   * Creation time in milliseconds, strictly increasing within the session: a status set twice in
   * one second (resolve, then reopen) must keep its order, the latest status wins.
   */
  private created(): string {
    const t = Math.max(Date.now(), this.lastCreated + 1);
    this.lastCreated = t;
    return new Date(t).toISOString();
  }

  private async push(a: annotate.WebAnnotation): Promise<annotate.WebAnnotation> {
    this.added.push(a);
    return a;
  }

  async comment(address: string, quote: annotate.Quote | undefined, text: string, author: string): Promise<annotate.WebAnnotation> {
    return this.push(annotate.createAnnotation({ kind: 'comment', address, ...(quote ? { quote } : {}), text, author, created: this.created(), language: this.doc.language, generator: GENERATOR }));
  }

  async highlight(address: string, quote: annotate.Quote, color: annotate.ColorName, text: string, author: string): Promise<annotate.WebAnnotation> {
    return this.push(annotate.createAnnotation({ kind: 'highlight', address, quote, color, ...(text ? { text } : {}), author, created: this.created(), language: this.doc.language, generator: GENERATOR }));
  }

  async ink(address: string, paths: readonly string[], color: annotate.ColorName, text: string, author: string): Promise<annotate.WebAnnotation> {
    return this.push(annotate.createAnnotation({ kind: 'ink', address, ink: { paths, color }, ...(text ? { text } : {}), author, created: this.created(), language: this.doc.language, generator: GENERATOR }));
  }

  async reply(to: string, text: string, author: string, status?: annotate.ReviewStatus): Promise<annotate.WebAnnotation> {
    return this.push(annotate.createReply({ to, ...(text ? { text } : {}), ...(status ? { status } : {}), author, created: this.created(), language: this.doc.language, generator: GENERATOR }));
  }

  /** Deletes an annotation with all answers below it; refused for signed files. */
  remove(id: string): number {
    const items = this.items();
    const gone = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const i of items) if (i.info.kind === 'reply' && gone.has(i.info.replyTo!) && !gone.has(i.info.id)) (gone.add(i.info.id), (grew = true));
    }
    const signed = items.filter((i) => gone.has(i.info.id) && i.signed);
    if (signed.length > 0) throw new annotate.AnnotationError('Diese Anmerkung ist von einer Signatur erfasst und kann nicht gelöscht werden; sie lässt sich aber beantworten und als erledigt markieren.');
    for (const g of gone) {
      const k = this.added.findIndex((a) => a.id === g);
      if (k >= 0) this.added.splice(k, 1);
      else this.removed.add(g);
    }
    return gone.size;
  }

  /** Takes over annotations of another copy; returns what happened (nothing is dropped silently). */
  import(incoming: readonly annotate.WebAnnotation[]): { added: number; same: number; conflicts: number; skipped: string[] } {
    const have = new Map(this.items().map((i) => [i.info.id, i.json]));
    let added = 0;
    let same = 0;
    let conflicts = 0;
    const skipped: string[] = [];
    const fresh = new Map<string, annotate.WebAnnotation>();
    for (const a of incoming) {
      const old = have.get(a.id) ?? fresh.get(a.id);
      if (old) {
        if (annotate.canonicalJson(old) === annotate.canonicalJson(a)) same++;
        else conflicts++;
        continue;
      }
      fresh.set(a.id, a);
    }
    // Replies only with their annotation (here or in the import).
    let dropped = true;
    while (dropped) {
      dropped = false;
      for (const [id, a] of fresh) {
        const info = annotate.describe(a);
        if (info.kind === 'reply' && !have.has(info.replyTo!) && !fresh.has(info.replyTo!)) {
          fresh.delete(id);
          skipped.push(id);
          dropped = true;
        }
      }
    }
    for (const a of fresh.values()) {
      this.added.push(a);
      added++;
    }
    if (added > 0) this.imported = true;
    return { added, same, conflicts, skipped };
  }

  /** Writes the changes into a new container (core: `annotate.saveAnnotations`). */
  async save(): Promise<annotate.SaveAnnotationsResult> {
    const remove = [...this.removed].filter((id) => !this.added.some((a) => a.id === id));
    return annotate.saveAnnotations(this.doc.bytes, { add: this.added, remove }, { modified: timestamp(this.doc.modified), accept: this.imported ? 'any' : 'exact' });
  }
}

// ---------------------------------------------------------------------------------------------
// Panel

export interface AnnotationHost {
  /** Opened document (main version or frozen rendition) and the shown content document. */
  current(): { doc: LoadedDocument; path: string; address: string; label: string; mode: 'flow' | 'page' } | undefined;
  /** Show the document again with the current marks, keeping the place; optionally go to an annotation. */
  refresh(focus?: string): void;
  /** Message to the frame agent. */
  post(message: Record<string, unknown>): void;
  /** Shows content document `path` (if needed) and scrolls to the annotation. */
  gotoAnnotation(path: string, id: string): void;
  saved(bytes: Uint8Array, fileName: string, message: string): Promise<void>;
  download(bytes: Uint8Array, name: string, type: string): void;
  announce(text: string): void;
  openPanel(): void;
}

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
}

function button(label: string, onClick: () => void, extra: Record<string, string> = {}): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  for (const [k, v] of Object.entries(extra)) b.setAttribute(k, v);
  b.addEventListener('click', onClick);
  return b;
}

const ANCHOR_TEXT: Record<annotate.AnchorState, string> = { exact: '', moved: 'Text verschoben', orphaned: 'Stelle nicht mehr im Dokument' };
const COLOR_LABEL: Record<string, string> = { gelb: 'gelb', gruen: 'grün', blau: 'blau', rosa: 'rosa', rot: 'rot' };

export class AnnotationPanel {
  private session: AnnotationSession | undefined;
  private loading: Promise<AnnotationSession> | undefined;
  private selection: (FrameSelection & { quote: annotate.Quote }) | undefined;
  private inkOn = false;
  private strokes: { path: string; id: string; paths: string[] } | undefined;
  private confirmDelete = '';
  private lastReview: annotate.ReviewReport | undefined;

  constructor(private readonly host: AnnotationHost) {
    this.bind();
  }

  /** A document was opened: forget the session and load the annotations of the new one. */
  reset(doc: LoadedDocument): void {
    this.session = undefined;
    this.selection = undefined;
    this.strokes = undefined;
    this.setInk(false);
    this.lastReview = undefined;
    this.loading = AnnotationSession.open(doc).then((s) => {
      if (this.host.current()?.doc.bytes === doc.bytes || this.host.current()?.doc === doc) this.session = s;
      this.render();
      return s;
    });
    this.loading.catch((e: unknown) => ($('annot-error').textContent = `Anmerkungen nicht lesbar: ${String(e)}`));
  }

  /** Marks for the frame; empty until the annotations are loaded. */
  marks(path: string): AnnotationMark[] {
    return this.session?.marks(path) ?? [];
  }

  ready(): Promise<unknown> {
    return this.loading ?? Promise.resolve();
  }

  get dirty(): boolean {
    return this.session?.dirty ?? false;
  }

  get inking(): boolean {
    return this.inkOn;
  }

  private author(): string | undefined {
    const name = $<HTMLInputElement>('annot-author').value.trim();
    if (name === '') {
      this.error('Bitte zuerst Ihren Namen angeben; er steht bei jeder Anmerkung.');
      $('annot-author').focus();
      return undefined;
    }
    try {
      window.localStorage.setItem(AUTHOR_KEY, name);
    } catch {
      /* private mode: not remembered */
    }
    return name;
  }

  private error(text: string): void {
    $('annot-error').textContent = text;
    if (text) this.host.announce(text);
  }

  private bind(): void {
    try {
      $<HTMLInputElement>('annot-author').value = window.localStorage.getItem(AUTHOR_KEY) ?? '';
    } catch {
      /* no storage */
    }
    $('annot-comment').addEventListener('click', () => void this.create('comment'));
    $('annot-highlight').addEventListener('click', () => void this.create('highlight'));
    $('annot-section').addEventListener('click', () => void this.create('section'));
    $('annot-ink').addEventListener('click', () => this.setInk(!this.inkOn));
    $('annot-ink-done').addEventListener('click', () => void this.finishInk());
    $('annot-ink-cancel').addEventListener('click', () => {
      this.strokes = undefined;
      this.host.post({ type: 'ink-clear' });
      this.updateInk();
    });
    $('annot-filter').addEventListener('change', () => this.render());
    $('annot-save').addEventListener('click', () => void this.save());
    $('annot-export-jsonld').addEventListener('click', () => this.exportAs('jsonld'));
    $('annot-export-csv').addEventListener('click', () => this.exportAs('csv'));
    $('annot-export-xhtml').addEventListener('click', () => this.exportAs('xhtml'));
    $('annot-import').addEventListener('click', () => $<HTMLInputElement>('annot-import-file').click());
    $<HTMLInputElement>('annot-import-file').addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (file) void file.arrayBuffer().then((b) => this.importFrom(new Uint8Array(b), file.name));
    });
    $('diff-file-run').addEventListener('click', () => $<HTMLInputElement>('diff-file').click());
    $<HTMLInputElement>('diff-file').addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (file) void file.arrayBuffer().then((b) => this.compareWith(new Uint8Array(b), file.name));
    });
    $('diff-review-download').addEventListener('click', () => {
      const r = this.lastReview;
      const doc = this.host.current()?.doc;
      if (r && doc) this.host.download(new TextEncoder().encode(annotate.reviewText(r)), `${this.stem(doc)}-vergleich.txt`, 'text/plain;charset=utf-8');
    });
  }

  private stem(doc: LoadedDocument): string {
    return doc.fileName.replace(/\.[^.]+$/, '').replace(/-anmerkungen(-\d+)?$/, '');
  }

  private async sessionNow(): Promise<AnnotationSession | undefined> {
    if (!this.session && this.loading) await this.loading.catch(() => undefined);
    return this.session;
  }

  // ------------------------------------------------------------------ selection and drawing

  /** The frame reported a selection (or that there is none). */
  onSelection(sel: Omit<FrameSelection, 'path'> | undefined): void {
    const cur = this.host.current();
    const out = $('annot-selection');
    if (!sel || !cur || !this.session) {
      this.selection = undefined;
      out.textContent = 'Text im Dokument markieren, um ihn zu kommentieren oder hervorzuheben.';
      this.updateButtons();
      return;
    }
    try {
      const full = { ...sel, path: cur.path };
      const quote = this.session.quoteFromSelection(full);
      this.selection = { ...full, quote };
      out.textContent = `Markiert in #${sel.id}: „${one(quote.exact, 120)}“`;
      this.error('');
    } catch (e) {
      this.selection = undefined;
      out.textContent = e instanceof Error ? e.message : String(e);
    }
    this.updateButtons();
  }

  private setInk(on: boolean): void {
    const cur = this.host.current();
    if (on && cur?.mode === 'page') {
      this.error('Freihand gibt es in der fließenden Ansicht; bitte zuerst „Fließend“ wählen.');
      return;
    }
    this.inkOn = on;
    if (!on) this.strokes = undefined;
    this.host.post({ type: 'ink-mode', on, color: annotate.COLORS[this.inkColor()] });
    this.updateInk();
  }

  private inkColor(): annotate.ColorName {
    const c = $<HTMLSelectElement>('annot-color').value;
    return c === 'blau' ? 'blau' : 'rot';
  }

  /** The frame reports the agent state again after a new load. */
  frameLoaded(): void {
    if (this.inkOn) this.host.post({ type: 'ink-mode', on: true, color: annotate.COLORS[this.inkColor()] });
  }

  onInkStroke(id: string, d: string): void {
    const cur = this.host.current();
    if (!cur || !this.inkOn) return;
    if (this.strokes && this.strokes.id !== id) {
      $('annot-ink-status').textContent = `Die Zeichnung gehört zu #${this.strokes.id}; bitte zuerst übernehmen oder verwerfen.`;
      return;
    }
    this.strokes ??= { path: cur.path, id, paths: [] };
    this.strokes.paths.push(d);
    this.updateInk();
  }

  private updateInk(): void {
    const b = $<HTMLButtonElement>('annot-ink');
    b.setAttribute('aria-pressed', String(this.inkOn));
    b.textContent = this.inkOn ? 'Freihand beenden' : 'Freihand zeichnen';
    const n = this.strokes?.paths.length ?? 0;
    $('annot-ink-done').hidden = n === 0;
    $('annot-ink-cancel').hidden = n === 0;
    $('annot-ink-status').textContent = this.inkOn ? (n === 0 ? 'Mit Maus, Stift oder Finger auf einen Absatz, eine Liste oder Tabelle zeichnen.' : `${n} ${n === 1 ? 'Strich' : 'Striche'} auf #${this.strokes!.id}`) : '';
  }

  private async finishInk(): Promise<void> {
    const s = await this.sessionNow();
    const strokes = this.strokes;
    if (!s || !strokes) return;
    const author = this.author();
    if (!author) return;
    try {
      const a = await s.ink(`${strokes.path}#${strokes.id}`, strokes.paths, this.inkColor(), $<HTMLTextAreaElement>('annot-text').value.trim(), author);
      $<HTMLTextAreaElement>('annot-text').value = '';
      this.strokes = undefined;
      this.host.post({ type: 'ink-clear' });
      this.changed(`Freihandzeichnung an #${strokes.id} angelegt (nicht gespeichert).`, a.id);
    } catch (e) {
      this.error(e instanceof Error ? e.message : String(e));
    }
    this.updateInk();
  }

  // ------------------------------------------------------------------ creating, answering, status

  private async create(kind: 'comment' | 'highlight' | 'section'): Promise<void> {
    const s = await this.sessionNow();
    const cur = this.host.current();
    if (!s || !cur) return;
    const text = $<HTMLTextAreaElement>('annot-text').value.trim();
    if (kind !== 'highlight' && text === '') {
      this.error('Bitte den Kommentar eingeben.');
      $('annot-text').focus();
      return;
    }
    if (kind !== 'section' && !this.selection) {
      this.error('Bitte zuerst Text im Dokument markieren (oder „Kommentar zum Abschnitt“ wählen).');
      return;
    }
    if (kind === 'section' && !cur.address) {
      this.error('Der aktuelle Abschnitt hat keine Adresse.');
      return;
    }
    const author = this.author();
    if (!author) return;
    try {
      let a: annotate.WebAnnotation;
      if (kind === 'section') a = await s.comment(`${cur.path}#${cur.address}`, undefined, text, author);
      else {
        const sel = this.selection!;
        const address = `${sel.path}#${sel.id}`;
        a = kind === 'comment' ? await s.comment(address, sel.quote, text, author) : await s.highlight(address, sel.quote, $<HTMLSelectElement>('annot-color').value as annotate.ColorName, text, author);
      }
      $<HTMLTextAreaElement>('annot-text').value = '';
      this.selection = undefined;
      $('annot-selection').textContent = 'Text im Dokument markieren, um ihn zu kommentieren oder hervorzuheben.';
      this.changed(`${KIND[annotate.describe(a).kind]} angelegt (nicht gespeichert).`, a.id);
    } catch (e) {
      this.error(e instanceof Error ? e.message : String(e));
    }
  }

  private changed(message: string, focus?: string): void {
    this.error('');
    $('annot-status').textContent = message;
    this.host.announce(message);
    this.render();
    this.host.refresh(focus);
  }

  private async answer(root: string, text: string, status?: annotate.ReviewStatus): Promise<void> {
    const s = await this.sessionNow();
    if (!s) return;
    const author = this.author();
    if (!author) return;
    try {
      await s.reply(root, text, author, status);
      this.changed(status === 'resolved' ? 'Als erledigt markiert (nicht gespeichert).' : status === 'open' ? 'Wieder geöffnet (nicht gespeichert).' : 'Antwort angelegt (nicht gespeichert).', root);
      const focus = document.querySelector<HTMLElement>(`[data-thread="${CSS.escape(root)}"] .annot-thread-head`);
      focus?.focus();
    } catch (e) {
      this.error(e instanceof Error ? e.message : String(e));
    }
  }

  private remove(id: string): void {
    const s = this.session;
    if (!s) return;
    if (this.confirmDelete !== id) {
      this.confirmDelete = id;
      this.render();
      document.querySelector<HTMLElement>(`[data-thread="${CSS.escape(id)}"] .annot-delete`)?.focus();
      return;
    }
    this.confirmDelete = '';
    try {
      const n = s.remove(id);
      this.changed(`${n} ${n === 1 ? 'Anmerkung' : 'Anmerkungen'} gelöscht (nicht gespeichert).`);
    } catch (e) {
      this.error(e instanceof Error ? e.message : String(e));
    }
  }

  /** Opens the panel at a thread (click on a mark or button in the document). */
  focusThread(id: string): void {
    this.host.openPanel();
    $<HTMLSelectElement>('annot-filter').value = 'all';
    this.render();
    const el = document.querySelector<HTMLElement>(`[data-thread="${CSS.escape(id)}"] .annot-thread-head`);
    el?.scrollIntoView({ block: 'nearest' });
    el?.focus();
  }

  // ------------------------------------------------------------------ list

  updateButtons(): void {
    const has = !!this.selection;
    $<HTMLButtonElement>('annot-comment').disabled = !has;
    $<HTMLButtonElement>('annot-highlight').disabled = !has;
    const s = this.session;
    $<HTMLButtonElement>('annot-save').disabled = !s?.dirty;
    $('annot-dirty').textContent = s?.dirty ? `Nicht gespeichert: ${s.added.length} neu, ${s.removed.size} gelöscht.` : '';
  }

  render(): void {
    const s = this.session;
    const list = $('annot-list');
    list.replaceChildren();
    this.updateButtons();
    if (!s) return;
    const set = s.set();
    const filter = $<HTMLSelectElement>('annot-filter').value;
    const byId = new Map(set.items.map((i) => [i.info.id, i]));
    const open = set.threads.filter((t) => t.status === 'open').length;
    $('annot-count').textContent = `${set.threads.length} ${set.threads.length === 1 ? 'Thread' : 'Threads'}, ${open} offen, ${set.threads.length - open} erledigt${set.mode === 'unlisted' ? ' · Dokument signiert: neue Anmerkungen bleiben außerhalb der Signatur („nicht signiert“)' : ''}.`;
    set.threads.forEach((t, k) => {
      if (filter !== 'all' && t.status !== filter) return;
      const root = byId.get(t.root.id)!;
      const li = document.createElement('li');
      li.className = `annot-thread ${t.status}`;
      li.dataset['thread'] = t.root.id;
      const head = document.createElement('p');
      head.className = 'annot-thread-head';
      head.tabIndex = -1;
      const num = document.createElement('span');
      num.className = 'annot-num';
      num.textContent = String(k + 1);
      const kind = document.createElement('strong');
      kind.textContent = `${KIND[t.root.kind]}${t.root.color ? ` (${COLOR_LABEL[t.root.color]})` : ''}${t.root.ink ? ` (${t.root.ink.paths.length} ${t.root.ink.paths.length === 1 ? 'Strich' : 'Striche'})` : ''}`;
      const status = document.createElement('span');
      status.className = `annot-status ${t.status}`;
      status.textContent = t.status === 'resolved' ? `erledigt${t.statusBy ? ` von ${t.statusBy}` : ''}` : 'offen';
      head.append(num, ' ', kind, ' · ', status);
      li.append(head);
      const meta = document.createElement('p');
      meta.className = 'annot-meta';
      const anchor = root.anchor;
      meta.textContent = `${t.root.author} · ${t.root.created.replace('T', ' ').replace('Z', ' UTC')} · #${t.root.elementId}${t.root.path !== this.host.current()?.path ? ` (${t.root.path})` : ''}${anchor && anchor.state !== 'exact' ? ` · ${ANCHOR_TEXT[anchor.state]}` : ''}${root.signed ? ' · signiert' : root.listed ? '' : s.isNew(t.root.id) ? ' · neu' : ' · nicht signiert'}`;
      li.append(meta);
      if (t.root.quote) {
        const q = document.createElement('blockquote');
        q.className = `annot-quote${t.root.color ? ` ${t.root.color}` : ''}`;
        q.textContent = one(t.root.quote.exact, 200);
        li.append(q);
      }
      if (t.root.text) {
        const p = document.createElement('p');
        p.className = 'annot-body';
        p.textContent = t.root.text;
        li.append(p);
      }
      if (t.replies.length > 0) {
        const ol = document.createElement('ol');
        ol.className = 'annot-replies';
        ol.setAttribute('aria-label', `Antworten zu Anmerkung ${k + 1}`);
        for (const r of t.replies) {
          const ri = document.createElement('li');
          const rm = document.createElement('p');
          rm.className = 'annot-meta';
          rm.textContent = `${r.author} · ${r.created.replace('T', ' ').replace('Z', ' UTC')}${r.status ? ` · ${r.status === 'resolved' ? 'markiert als erledigt' : 'wieder geöffnet'}` : ''}${byId.get(r.id)?.signed ? ' · signiert' : s.isNew(r.id) ? ' · neu' : ''}`;
          const rb = document.createElement('p');
          rb.className = 'annot-body';
          rb.textContent = r.text;
          ri.append(rm, rb);
          ol.append(ri);
        }
        li.append(ol);
      }
      const actions = document.createElement('div');
      actions.className = 'annot-actions';
      actions.setAttribute('role', 'group');
      actions.setAttribute('aria-label', `Anmerkung ${k + 1}`);
      const label = `Anmerkung ${k + 1}`;
      if (anchor && anchor.state !== 'orphaned') actions.append(button('Im Dokument zeigen', () => this.show(t.root.id, anchor.path), { 'aria-label': `${label} im Dokument zeigen` }));
      actions.append(
        button(t.status === 'resolved' ? 'Wieder öffnen' : 'Erledigt', () => void this.answer(t.root.id, '', t.status === 'resolved' ? 'open' : 'resolved'), { 'aria-label': `${label} ${t.status === 'resolved' ? 'wieder öffnen' : 'als erledigt markieren'}` }),
      );
      const del = button(this.confirmDelete === t.root.id ? 'Wirklich löschen?' : 'Löschen', () => this.remove(t.root.id), { 'aria-label': this.confirmDelete === t.root.id ? `${label} mit allen Antworten wirklich löschen?` : `${label} löschen`, class: 'annot-delete danger' });
      if (root.signed) del.disabled = true;
      actions.append(del);
      li.append(actions);
      const form = document.createElement('div');
      form.className = 'annot-reply';
      const id = `annot-reply-${k + 1}`;
      const lab = document.createElement('label');
      lab.htmlFor = id;
      lab.textContent = `Antwort auf Anmerkung ${k + 1}`;
      const ta = document.createElement('textarea');
      ta.id = id;
      ta.rows = 2;
      const send = button('Antworten', () => {
        const v = ta.value.trim();
        if (v === '') {
          this.error('Bitte die Antwort eingeben.');
          ta.focus();
          return;
        }
        void this.answer(t.root.id, v);
      }, { 'aria-label': `Antwort auf Anmerkung ${k + 1} senden` });
      form.append(lab, ta, send);
      li.append(form);
      list.append(li);
    });
    for (const o of set.orphans) {
      const li = document.createElement('li');
      li.className = 'annot-thread orphan';
      li.textContent = `Antwort ohne Thread (${o.author}): ${o.text}`;
      list.append(li);
    }
    for (const p of set.problems) {
      const li = document.createElement('li');
      li.className = 'annot-thread problem';
      li.textContent = `Nicht lesbar: ${p.path} – ${p.message}`;
      list.append(li);
    }
  }

  private show(id: string, path: string): void {
    this.host.gotoAnnotation(path, id);
  }

  // ------------------------------------------------------------------ save, export, import

  private async save(): Promise<void> {
    const s = await this.sessionNow();
    const doc = this.host.current()?.doc;
    if (!s || !doc || !s.dirty) return;
    try {
      const r = await s.save();
      const name = `${this.stem(doc)}-anmerkungen.hpro`;
      this.host.download(r.bytes, name, 'application/epub+zip');
      const how = r.mode === 'listed' ? 'im Hash-Manifest verzeichnet, Verlaufseintrag geschrieben' : 'außerhalb der Signatur abgelegt, Signatur unverändert gültig';
      await this.host.saved(r.bytes, name, `Anmerkungen gespeichert (${r.added.length} neu, ${r.removed.length} gelöscht; ${how}); die Datei „${name}“ wurde heruntergeladen.`);
    } catch (e) {
      this.error(`Nicht gespeichert: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private exportAs(format: 'jsonld' | 'csv' | 'xhtml'): void {
    const s = this.session;
    const doc = this.host.current()?.doc;
    if (!s || !doc) return;
    const set = s.set();
    const label = { id: doc.id, title: doc.title, dateModified: doc.modified };
    const now = timestamp();
    const stem = this.stem(doc);
    if (format === 'jsonld') this.host.download(annotate.serializeCollection(annotate.toCollection(set, label, now)), `${stem}-anmerkungen.jsonld`, 'application/ld+json');
    else if (format === 'csv') this.host.download(annotate.toCsv(set), `${stem}-anmerkungen.csv`, 'text/csv;charset=utf-8');
    else this.host.download(new TextEncoder().encode(annotate.toXhtml(set, label, now, doc.language)), `${stem}-anmerkungen.xhtml`, 'application/xhtml+xml');
    $('annot-status').textContent = `Exportiert: ${set.items.length} Anmerkungen (${format === 'jsonld' ? 'JSON-LD' : format === 'csv' ? 'CSV' : 'Bericht XHTML'})${s.dirty ? ', einschließlich der noch nicht gespeicherten' : ''}.`;
  }

  private async importFrom(bytes: Uint8Array, name: string): Promise<void> {
    const s = await this.sessionNow();
    if (!s) return;
    try {
      let incoming: annotate.WebAnnotation[];
      let problems: string[] = [];
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) incoming = (await annotate.readAnnotations(bytes, { anchors: false })).items.map((i) => i.json);
      else {
        const r = annotate.fromCollection(JSON.parse(new TextDecoder().decode(bytes)));
        incoming = r.annotations;
        problems = r.problems;
      }
      const r = s.import(incoming);
      const parts = [`${r.added} übernommen`, `${r.same} schon vorhanden`];
      if (r.conflicts > 0) parts.push(`${r.conflicts} mit anderem Inhalt (Fassung dieses Dokuments behalten)`);
      if (r.skipped.length > 0) parts.push(`${r.skipped.length} Antworten ohne Thread nicht übernommen`);
      if (problems.length > 0) parts.push(`${problems.length} unlesbar`);
      this.changed(`Import aus „${name}“: ${parts.join(', ')} (nicht gespeichert).`);
    } catch (e) {
      this.error(`Import nicht möglich: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ------------------------------------------------------------------ comparison with another file

  private async compareWith(other: Uint8Array, name: string): Promise<void> {
    const doc = this.host.current()?.doc;
    if (!doc) return;
    const otherOlder = $<HTMLSelectElement>('diff-file-role').value !== 'newer';
    const list = $('diff-list');
    const annot = $('diff-annot');
    list.replaceChildren();
    annot.replaceChildren();
    $('diff-download').hidden = true;
    try {
      const [older, newer] = otherOlder ? [other, doc.bytes] : [doc.bytes, other];
      const r = await annotate.reviewReport(older, newer, otherOlder ? { from: name, to: doc.fileName } : { from: doc.fileName, to: name });
      this.lastReview = r;
      $('diff-status').textContent = `Vergleich ${r.content.from.label} → ${r.content.to.label}: ${r.content.changes.length} ${r.content.changes.length === 1 ? 'Änderung' : 'Änderungen'} im Text, ${r.annotations.added.length} neue und ${r.annotations.removed.length} entfernte Anmerkungen, ${r.annotations.status.length} Statuswechsel, ${r.affected.length} Threads an geänderten Stellen.`;
      for (const c of r.content.changes) {
        const li = document.createElement('li');
        li.className = `diff-item ${c.kind}`;
        const head = document.createElement('p');
        const strong = document.createElement('strong');
        strong.textContent = edit.CHANGE_LABEL[c.kind];
        const where = document.createElement('code');
        where.textContent = c.to ?? c.from ?? c.path;
        head.append(strong, ' ', where, c.detail ? ` – ${c.detail}` : '');
        li.append(head);
        if (c.words && c.words.some((w) => w.op !== '=')) {
          const body = document.createElement('p');
          body.className = 'diff-words';
          for (const w of c.words) {
            if (w.op === '=') body.append(w.text);
            else {
              const el = document.createElement(w.op === '-' ? 'del' : 'ins');
              const sr = document.createElement('span');
              sr.className = 'sr-only';
              sr.textContent = w.op === '-' ? 'entfernt: ' : 'eingefügt: ';
              el.append(sr, w.text);
              body.append(el);
            }
          }
          li.append(body);
        }
        list.append(li);
      }
      const add = (text: string) => {
        const li = document.createElement('li');
        li.textContent = text;
        annot.append(li);
      };
      for (const x of r.annotations.added) add(`Neu: ${KIND[x.kind]} von ${x.author}${x.status ? ` (${x.status === 'resolved' ? 'erledigt' : 'wieder geöffnet'})` : ''}: ${one(x.text || x.quote?.exact || '')}`);
      for (const x of r.annotations.removed) add(`Entfernt: ${KIND[x.kind]} von ${x.author}: ${one(x.text || x.quote?.exact || '')}`);
      for (const x of r.affected) add(`Betroffen (${x.status === 'resolved' ? 'erledigt' : 'offen'}): ${KIND[x.root.kind]} an #${x.root.elementId} – ${x.anchor.state === 'exact' ? 'Stelle geändert' : ANCHOR_TEXT[x.anchor.state]}${x.root.quote ? ` „${one(x.root.quote.exact, 50)}“` : ''}`);
      $('diff-review-download').hidden = false;
    } catch (e) {
      $('diff-status').textContent = `Vergleich nicht möglich: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
}
