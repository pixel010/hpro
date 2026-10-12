/**
 * Editing in the reader (package P5, docs/10 promise 4): the panel "Bearbeiten" works on the
 * structure of the document through the core (`edit.EditSession`) — text is text, structure is
 * structure, nothing is painted over. Every change shows at once in the document frame (a
 * preview of the unsaved state); "Speichern" writes a new file with a history entry and the
 * history journal. "Verlauf" lists the versions of the file and compares two of them;
 * "Schwärzen" deletes content (`lock.redactContainer`) from the file and from every earlier
 * version, with the log.
 *
 * Text from the document never reaches `innerHTML`: inline markup is parsed by DOMParser (inert)
 * and copied element by element through the same whitelist the core applies.
 */
import { edit, lock } from '@hpro/kern';
import { previewDocument, type LoadedDocument } from './document.js';

export interface EditorHost {
  /** The opened document (saved state) and the path of the shown content document. */
  current(): { doc: LoadedDocument; path: string } | undefined;
  /** Show the unsaved state; `id` is scrolled into view. */
  preview(doc: LoadedDocument, path: string, id?: string): void;
  /** A new file was written (save, redaction): open it in the reader. */
  saved(bytes: Uint8Array, fileName: string, message: string): Promise<void>;
  /** Open a file of its own (an earlier version). */
  openOther(bytes: Uint8Array, fileName: string): Promise<void>;
  download(bytes: Uint8Array, name: string, type: string): void;
  announce(text: string): void;
}

type Outline = ReturnType<edit.EditSession['outline']>[number];

const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const EPUB_NS = 'http://www.idpf.org/2007/ops';
/** Inline elements and attributes the editor keeps (the core checks the same list again). */
const INLINE: Record<string, readonly string[]> = {
  a: ['href', 'hreflang', 'role', 'epub:type', 'id', 'data-hp-ref'],
  em: [], strong: [], b: [], i: [], u: [], s: [], small: [], mark: [], sub: [], sup: [], code: [], kbd: [], samp: [], var: [],
  q: [], cite: [], dfn: [], abbr: [], bdi: [], bdo: [], wbr: [], br: [],
  time: ['datetime'],
  span: ['data-hp-redacted', 'role', 'aria-label'],
};
const GLOBAL = ['lang', 'dir', 'title'];
const SAFE_HREF = /^(https?:|mailto:|tel:|#|[^:]*$)/i;
const KIND_LABEL: Record<string, string> = {
  paragraph: 'Absatz', list: 'Liste', 'list-item': 'Listenpunkt', table: 'Tabelle', caption: 'Tabellenbeschriftung', figure: 'Abbildung', figcaption: 'Bildunterschrift',
  image: 'Bild', media: 'Medium', footnote: 'Fußnote', endnotes: 'Endnoten', section: 'Abschnitt', aside: 'Randnotiz', details: 'Aufklappbereich', summary: 'Aufklapptitel',
  blockquote: 'Zitat', code: 'Code', term: 'Begriff', definition: 'Erklärung', container: 'Bereich',
};
const STATUS_LABEL: Record<edit.VersionInfo['status'], string> = { current: 'aktuell', exact: 'byte-genau wiederhergestellt', redacted: 'nach Redaktion neu geschrieben', mismatch: 'ABWEICHUNG', unavailable: 'nicht im Verlauf der Datei' };

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;');
}

/** Builds the editable DOM from inline XHTML through the whitelist (no innerHTML). */
export function fillEditable(target: HTMLElement, inline: string): void {
  target.replaceChildren();
  const parsed = new DOMParser().parseFromString(`<div xmlns="${XHTML_NS}" xmlns:epub="${EPUB_NS}">${inline}</div>`, 'application/xhtml+xml');
  const root = parsed.documentElement;
  if (root.getElementsByTagName('parsererror').length > 0) {
    target.textContent = root.textContent ?? '';
    return;
  }
  const copy = (from: Node, to: Node) => {
    for (const n of Array.from(from.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE || n.nodeType === Node.CDATA_SECTION_NODE) {
        // Line breaks and indentation of the source are not content (HTML collapses them).
        to.appendChild(document.createTextNode((n.nodeValue ?? '').replace(/[ \t\r\n]+/g, ' ')));
        continue;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) continue;
      const el = n as Element;
      const name = el.localName;
      if (!(name in INLINE)) {
        copy(el, to); // unknown wrapper: keep the text
        continue;
      }
      const out = document.createElement(name);
      for (const a of Array.from(el.attributes)) {
        const attr = a.namespaceURI === EPUB_NS ? `epub:${a.localName}` : a.name;
        if (!GLOBAL.includes(attr) && !INLINE[name]!.includes(attr)) continue;
        if (attr === 'href' && !SAFE_HREF.test(a.value)) continue;
        out.setAttribute(attr, a.value);
      }
      // Footnote references and redaction placeholders are moved, not typed into.
      if ((name === 'a' && out.getAttribute('role') === 'doc-noteref') || out.hasAttribute('data-hp-redacted')) out.setAttribute('contenteditable', 'false');
      copy(el, out);
      to.appendChild(out);
    }
  };
  copy(root, target);
}

/** Inline XHTML from the editable DOM; anything outside the whitelist is reduced to its text. */
export function readEditable(source: HTMLElement): string {
  const walk = (n: Node): string => {
    let out = '';
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === Node.TEXT_NODE) {
        out += escapeText(c.nodeValue ?? '');
        continue;
      }
      if (c.nodeType !== Node.ELEMENT_NODE) continue;
      const el = c as HTMLElement;
      const name = el.localName;
      if (name === 'div' || name === 'p') {
        out += (out === '' ? '' : '<br/>') + walk(el); // line breaks typed as blocks
        continue;
      }
      if (!(name in INLINE)) {
        out += walk(el);
        continue;
      }
      const attrs = Array.from(el.attributes)
        .filter((a) => GLOBAL.includes(a.name) || INLINE[name]!.includes(a.name))
        .filter((a) => a.name !== 'href' || SAFE_HREF.test(a.value))
        .map((a) => ` ${a.name}="${escapeAttr(a.value)}"`)
        .join('');
      out += name === 'br' || name === 'wbr' ? `<${name}${attrs}/>` : `<${name}${attrs}>${walk(el)}</${name}>`;
    }
    return out;
  };
  return walk(source).replace(/(<br\/>)+$/, '');
}

function timestamp(after: string): string {
  const now = Date.now();
  const min = Date.parse(after) + 1000;
  return new Date(Number.isNaN(min) ? now : Math.max(now, min)).toISOString().slice(0, 19) + 'Z';
}

export class Editor {
  private session: edit.EditSession | undefined;
  private opening: Promise<edit.EditSession> | undefined;
  private base: LoadedDocument | undefined;
  private path = '';
  private records: Outline[] = [];
  private selected: string | undefined;
  private lastDiff: edit.DiffResult | undefined;

  constructor(private readonly host: EditorHost) {
    this.bind();
  }

  /** A document was opened: start over (edits of the previous file are gone). */
  reset(doc: LoadedDocument): void {
    this.base = doc;
    this.session = undefined;
    this.opening = undefined;
    this.selected = undefined;
    this.records = [];
    const main = doc.version.id === null;
    const edit = $<HTMLButtonElement>('btn-edit');
    edit.disabled = !main;
    edit.title = main ? 'Struktur und Text bearbeiten' : 'Eine eingefrorene Fassung wird nicht bearbeitet';
    $<HTMLButtonElement>('btn-history').disabled = false;
    $('edit-form').hidden = true;
    $('edit-error').textContent = '';
    $('edit-blocks').replaceChildren();
    this.updateStatus();
    if (!$('edit-panel').hidden && main) void this.show();
  }

  /** The panel was opened (or the shown part changed): load the session and list the blocks. */
  async show(): Promise<void> {
    const cur = this.host.current();
    if (!cur || !this.base || this.base.version.id !== null) return;
    try {
      const s = await this.ensure();
      const docs = s.documents();
      this.path = docs.includes(cur.path) ? cur.path : docs[0]!;
      const select = $<HTMLSelectElement>('edit-doc');
      select.replaceChildren(...docs.map((d) => new Option(this.base!.content.find((c) => c.path === d)?.title ?? d, d, false, d === this.path)));
      $('edit-doc-field').hidden = docs.length < 2;
      this.renderBlocks();
      const signed = this.base.signatureFiles.length > 0 && this.base.versions.length < 2;
      $('edit-note').textContent = signed ? 'Hinweis: Das Dokument ist signiert. Eine Änderung der Hauptfassung macht deren Signatur ungültig; eingefrorene Fassungen bleiben gültig.' : '';
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

  // ------------------------------------------------------------------ blocks

  private label(r: Outline): string {
    if (r.kind === 'heading') return `Überschrift ${r.level}`;
    if (r.kind === 'cell') return `Zelle ${r.attrs?.a1 ?? ''}`;
    if (r.kind === 'list') return r.attrs?.type === 'ol' ? 'Nummerierte Liste' : 'Aufzählung';
    return KIND_LABEL[r.kind] ?? r.tag;
  }

  private renderBlocks(): void {
    const s = this.session;
    if (!s) return;
    this.records = s.outline(this.path);
    const list = $('edit-blocks');
    list.replaceChildren();
    for (const r of this.records) {
      if (r.kind === 'container' && !r.id) continue;
      const li = document.createElement('li');
      li.style.paddingInlineStart = `${Math.min(r.depth, 6) * 0.8}rem`;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'edit-block';
      b.dataset['pointer'] = r.pointer;
      const kind = document.createElement('span');
      kind.className = 'edit-kind';
      kind.textContent = this.label(r);
      const text = document.createElement('span');
      text.className = 'edit-excerpt';
      const t = r.kind === 'image' ? (r.attrs?.alt ?? '') : r.text;
      text.textContent = t.length > 80 ? `${t.slice(0, 79)}…` : t;
      b.append(kind, text);
      if (r.pointer === this.selected) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => this.select(r.pointer));
      li.append(b);
      list.append(li);
    }
    if (this.selected && !this.records.some((r) => r.pointer === this.selected)) this.selected = undefined;
    if (this.selected) this.fillForm();
    else $('edit-form').hidden = true;
  }

  private select(pointer: string): void {
    this.selected = pointer;
    for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('#edit-blocks .edit-block'))) {
      if (b.dataset['pointer'] === pointer) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    }
    $('edit-error').textContent = '';
    this.fillForm();
    const r = this.record();
    const id = r ? this.anchorId(r) : undefined;
    if (r && this.base && this.session) this.preview(id);
  }

  private record(): Outline | undefined {
    return this.records.find((r) => r.pointer === this.selected);
  }

  private parentOf(r: Outline): Outline | undefined {
    return r.parent ? this.records.find((x) => x.pointer === r.parent) : undefined;
  }

  /** Id to scroll to: the block's own or its nearest ancestor's. */
  private anchorId(r: Outline): string | undefined {
    for (let x: Outline | undefined = r; x; x = this.parentOf(x)) if (x.id) return x.id;
    return undefined;
  }

  private fillForm(): void {
    const r = this.record();
    const form = $('edit-form');
    if (!r) {
      form.hidden = true;
      return;
    }
    form.hidden = false;
    $('edit-target').textContent = `${this.label(r)} · ${r.pointer}`;
    const textual = r.inline !== undefined;
    $('edit-text-group').hidden = !textual;
    const code = r.kind === 'code';
    $('edit-text').hidden = code;
    $('edit-format').hidden = code;
    $<HTMLTextAreaElement>('edit-code').hidden = !code;
    if (code) $<HTMLTextAreaElement>('edit-code').value = r.text;
    else if (textual) fillEditable($('edit-text'), r.inline ?? '');
    $('edit-level-field').hidden = r.kind !== 'heading';
    if (r.kind === 'heading') $<HTMLSelectElement>('edit-level').value = String(r.level);
    const image = r.kind === 'image' ? r : r.kind === 'figure' ? this.records.find((x) => x.kind === 'image' && x.parent === r.pointer) : undefined;
    $('edit-alt-field').hidden = !image;
    if (image) $<HTMLInputElement>('edit-alt').value = image.attrs?.alt ?? '';
    const cell = r.kind === 'cell';
    for (const id of ['edit-row-add', 'edit-col-add', 'edit-row-del', 'edit-col-del']) $(id).hidden = !cell;
    for (const id of ['edit-indent', 'edit-outdent']) $(id).hidden = r.kind !== 'list-item';
    for (const id of ['edit-up', 'edit-down', 'edit-delete']) $(id).hidden = cell || r.kind === 'caption' || r.kind === 'figcaption' || r.kind === 'summary';
    const noteable = ['paragraph', 'list-item', 'cell'].includes(r.kind);
    $('edit-more').hidden = !noteable;
    if (noteable) this.fillXrefTargets();
    const type = $<HTMLSelectElement>('edit-new-type');
    const li = type.querySelector<HTMLOptionElement>('option[value="list-item"]')!;
    li.disabled = r.kind !== 'list-item' && r.kind !== 'list';
    if (li.disabled && type.value === 'list-item') type.value = 'paragraph';
  }

  private fillXrefTargets(): void {
    const s = this.session!;
    const select = $<HTMLSelectElement>('edit-xref-target');
    const options: HTMLOptionElement[] = [];
    for (const d of s.documents()) {
      for (const r of s.outline(d)) {
        if (!r.id || !['heading', 'table', 'figure'].includes(r.kind)) continue;
        const label = r.kind === 'heading' ? r.text : r.kind === 'table' ? `Tabelle: ${s.outline(d).find((x) => x.kind === 'caption' && x.parent === r.pointer)?.text ?? r.id}` : `Abbildung: ${s.outline(d).find((x) => x.kind === 'figcaption' && x.parent === r.pointer)?.text ?? r.id}`;
        options.push(new Option(label, `${d}#${r.id}`));
      }
    }
    select.replaceChildren(...options);
  }

  // ------------------------------------------------------------------ operations

  private run(op: edit.EditOp, select?: (r: edit.OpResult) => string | undefined): void {
    const s = this.session;
    if (!s) return;
    $('edit-error').textContent = '';
    try {
      const r = s.apply(op);
      const next = select ? select(r) : r.created?.[0] ?? this.selected;
      this.selected = next;
      this.renderBlocks();
      this.updateStatus();
      const rec = this.record();
      this.preview(rec ? this.anchorId(rec) : undefined);
      this.host.announce(`${r.summary}${r.detail ? ` ${r.detail}` : ''}${r.notes?.length ? `. ${r.notes.join('. ')}` : ''}`);
    } catch (e) {
      this.error(e);
    }
  }

  private preview(id?: string): void {
    const s = this.session;
    const base = this.base;
    if (!s || !base) return;
    const changed = new Map(s.changedDocuments().map((p) => [p, s.xhtml(p)]));
    const doc = previewDocument(base, changed, s.pendingFiles(), s.removedFiles(), s.currentTitle(), s.navigation());
    this.host.preview(doc, this.path, id);
  }

  private error(e: unknown): void {
    const msg = e instanceof edit.EditError ? e.message : e instanceof lock.LockError ? e.message : String(e);
    $('edit-error').textContent = `Nicht geändert: ${msg}`;
  }

  private updateStatus(): void {
    const n = this.session?.results.length ?? 0;
    $('edit-status').textContent = n === 0 ? 'Keine ungespeicherten Änderungen.' : `${n} ${n === 1 ? 'Änderung' : 'Änderungen'}, noch nicht gespeichert. Zuletzt: ${this.session!.results[n - 1]!.summary}`;
    $<HTMLButtonElement>('edit-save').disabled = n === 0;
    $<HTMLButtonElement>('edit-undo').disabled = n === 0;
    $<HTMLButtonElement>('edit-redact').disabled = !this.base || this.base.version.id !== null;
  }

  private sibling(r: Outline, step: -1 | 1): Outline | undefined {
    const same = this.records.filter((x) => x.parent === r.parent && x.kind !== 'cell' && x.kind !== 'caption' && !(r.kind === 'list-item') === !(x.kind === 'list-item'));
    return same[same.indexOf(r) + step];
  }

  /** Where a new block goes: after the selected block, or after its list, table, figure or section. */
  private insertRef(r: Outline, type: string): edit.EditOp | undefined {
    let ref: Outline = r;
    const up = (kinds: string[]) => {
      while (kinds.includes(ref.kind) && this.parentOf(ref)) ref = this.parentOf(ref)!;
    };
    const text = $<HTMLInputElement>('edit-new-text').value.trim();
    if (type === 'list-item') {
      if (r.kind === 'list') return { op: 'insert', ref: r.pointer, position: 'end', block: { type: 'list-item', text: text || 'Neuer Punkt' } };
      return { op: 'insert', ref: r.pointer, position: 'after', block: { type: 'list-item', text: text || 'Neuer Punkt' } };
    }
    up(['cell', 'caption', 'figcaption', 'image', 'summary', 'list-item']);
    while (ref.kind === 'list' && this.parentOf(ref)?.kind === 'list-item') {
      ref = this.parentOf(ref)!;
      up(['list-item']);
    }
    if (type === 'section') {
      for (let x: Outline | undefined = ref; x; x = this.parentOf(x)) if (x.kind === 'section') ref = x;
      const parent = this.parentOf(ref);
      if (ref.kind !== 'section' && parent?.kind !== 'container') return undefined;
    }
    const blocks: Record<string, edit.BlockSpec> = {
      paragraph: { type: 'paragraph', text: text || 'Neuer Absatz' },
      heading: { type: 'heading', text: text || 'Neue Überschrift' },
      section: { type: 'section', heading: text || 'Neuer Abschnitt', blocks: [{ type: 'paragraph', text: 'Text des Abschnitts.' }] },
      ul: { type: 'list', items: [text || 'Erster Punkt'] },
      ol: { type: 'list', ordered: true, items: [text || 'Erster Punkt'] },
      table: { type: 'table', caption: text || 'Neue Tabelle', header: ['Spalte 1', 'Spalte 2'], rows: [['', '']] },
    };
    const block = blocks[type];
    return block ? { op: 'insert', ref: ref.pointer, position: 'after', block } : undefined;
  }

  private bind(): void {
    $('edit-doc').addEventListener('change', (e) => {
      this.path = (e.target as HTMLSelectElement).value;
      this.selected = undefined;
      this.renderBlocks();
      this.preview();
    });
    const text = $('edit-text');
    text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        $('edit-apply').click();
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        document.execCommand('insertLineBreak');
      }
    });
    $('edit-bold').addEventListener('click', () => {
      text.focus();
      document.execCommand('bold');
    });
    $('edit-italic').addEventListener('click', () => {
      text.focus();
      document.execCommand('italic');
    });
    $('edit-apply').addEventListener('click', () => {
      const r = this.record();
      if (!r) return;
      if (r.kind === 'code') this.run({ op: 'set-text', target: r.pointer, text: $<HTMLTextAreaElement>('edit-code').value });
      else this.run({ op: 'set-text', target: r.pointer, inline: readEditable(text) });
    });
    $('edit-level').addEventListener('change', (e) => {
      const r = this.record();
      if (r) this.run({ op: 'set-heading-level', target: r.pointer, level: Number((e.target as HTMLSelectElement).value) });
    });
    $('edit-alt-apply').addEventListener('click', () => {
      const r = this.record();
      if (r) this.run({ op: 'set-image', target: r.pointer, alt: $<HTMLInputElement>('edit-alt').value });
    });
    $('edit-up').addEventListener('click', () => {
      const r = this.record();
      const s = r && this.sibling(r, -1);
      if (r && s) this.run({ op: 'move', target: r.pointer, ref: s.pointer, position: 'before' }, () => undefined);
      else $('edit-error').textContent = 'Der Block steht schon am Anfang.';
    });
    $('edit-down').addEventListener('click', () => {
      const r = this.record();
      const s = r && this.sibling(r, 1);
      if (r && s) this.run({ op: 'move', target: r.pointer, ref: s.pointer, position: 'after' }, () => undefined);
      else $('edit-error').textContent = 'Der Block steht schon am Ende.';
    });
    $('edit-delete').addEventListener('click', () => {
      const r = this.record();
      if (r) this.run(r.kind === 'footnote' ? { op: 'delete-footnote', target: r.pointer } : { op: 'delete', target: r.pointer }, () => undefined);
    });
    $('edit-indent').addEventListener('click', () => {
      const r = this.record();
      if (r) this.run({ op: 'indent', target: r.pointer });
    });
    $('edit-outdent').addEventListener('click', () => {
      const r = this.record();
      if (r) this.run({ op: 'outdent', target: r.pointer });
    });
    const cellOp = (kind: 'insert-row' | 'insert-column' | 'delete-row' | 'delete-column') => {
      const r = this.record();
      if (!r || r.kind !== 'cell' || !r.parent) return;
      const m = /^([A-Z]+)(\d+)$/.exec(r.attrs?.a1 ?? '');
      if (!m) return;
      let col = 0;
      for (const ch of m[1]!) col = col * 26 + ch.charCodeAt(0) - 64;
      const row = Number(m[2]);
      const op: edit.EditOp =
        kind === 'insert-row' ? { op: kind, table: r.parent, at: row + 1 } : kind === 'insert-column' ? { op: kind, table: r.parent, at: col + 1 } : kind === 'delete-row' ? { op: kind, table: r.parent, row } : { op: kind, table: r.parent, column: col };
      this.run(op, () => (kind.startsWith('delete') ? undefined : r.pointer));
    };
    $('edit-row-add').addEventListener('click', () => cellOp('insert-row'));
    $('edit-col-add').addEventListener('click', () => cellOp('insert-column'));
    $('edit-row-del').addEventListener('click', () => cellOp('delete-row'));
    $('edit-col-del').addEventListener('click', () => cellOp('delete-column'));
    $('edit-insert').addEventListener('click', () => {
      const r = this.record();
      if (!r) return;
      const op = this.insertRef(r, $<HTMLSelectElement>('edit-new-type').value);
      if (!op) {
        $('edit-error').textContent = 'Ein neuer Abschnitt steht neben einem Abschnitt; einen Abschnitt oder einen Block darin wählen.';
        return;
      }
      this.run(op);
      $<HTMLInputElement>('edit-new-text').value = '';
    });
    $('edit-note-add').addEventListener('click', () => {
      const r = this.record();
      const t = $<HTMLInputElement>('edit-note-text').value.trim();
      if (!r) return;
      if (t === '') {
        $('edit-error').textContent = 'Bitte den Fußnotentext eingeben.';
        return;
      }
      this.run({ op: 'insert-footnote', target: r.pointer, text: t }, () => r.pointer);
      $<HTMLInputElement>('edit-note-text').value = '';
    });
    $('edit-xref').addEventListener('click', () => {
      const r = this.record();
      const to = $<HTMLSelectElement>('edit-xref-target').value;
      if (r && to) this.run({ op: 'insert-xref', target: r.pointer, to }, () => r.pointer);
    });
    $('edit-undo').addEventListener('click', () => {
      const r = this.session?.undo();
      if (!r) return;
      this.renderBlocks();
      this.updateStatus();
      this.preview();
      this.host.announce(`Rückgängig: ${r.summary}`);
    });
    $('edit-save').addEventListener('click', () => void this.save());
    $('edit-redact').addEventListener('click', () => this.openRedact());
    $('redact-form').addEventListener('submit', (e) => {
      e.preventDefault();
      void this.redact();
    });
    $('btn-history').addEventListener('click', () => void this.openHistory());
    $('diff-run').addEventListener('click', () => void this.runDiff());
    $('diff-download').addEventListener('click', () => {
      if (!this.lastDiff || !this.base) return;
      this.host.download(new TextEncoder().encode(edit.diffXhtml(this.lastDiff)), `${this.stem()}-vergleich-${this.lastDiff.from.version ?? 'a'}-${this.lastDiff.to.version ?? 'b'}.xhtml`, 'application/xhtml+xml');
    });
  }

  private stem(): string {
    return (this.base?.fileName ?? 'dokument').replace(/\.[^.]+$/, '').replace(/-(bearbeitet|geschwaerzt)(-\d+)?$/, '');
  }

  private async save(): Promise<void> {
    const s = this.session;
    const base = this.base;
    if (!s || !base) return;
    try {
      const r = await s.save({ at: timestamp(base.modified) });
      const name = `${this.stem()}-bearbeitet.hpro`;
      this.host.download(r.bytes, name, 'application/epub+zip');
      await this.host.saved(r.bytes, name, `Gespeichert als Fassung ${r.version} (${r.results.length} ${r.results.length === 1 ? 'Änderung' : 'Änderungen'}); die Datei „${name}“ wurde heruntergeladen.`);
    } catch (e) {
      this.error(e);
    }
  }

  // ------------------------------------------------------------------ history and comparison

  private async openHistory(): Promise<void> {
    const base = this.base;
    if (!base) return;
    const dialog = $<HTMLDialogElement>('dlg-history');
    $('diff-list').replaceChildren();
    $('diff-status').textContent = '';
    $('diff-download').hidden = true;
    const rows = $('history-rows');
    rows.replaceChildren();
    let infos: edit.VersionInfo[];
    try {
      infos = await edit.listVersions(base.bytes);
    } catch (e) {
      $('diff-status').textContent = `Der Verlauf ist nicht lesbar: ${String(e)}`;
      dialog.showModal();
      return;
    }
    for (const i of infos) {
      const tr = document.createElement('tr');
      const cells = [String(i.version), i.dateModified ?? '–', STATUS_LABEL[i.status], i.note ?? ''];
      for (const c of cells) {
        const td = document.createElement('td');
        td.textContent = c;
        tr.append(td);
      }
      const td = document.createElement('td');
      if (i.available && i.status !== 'current') {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = 'Öffnen';
        b.setAttribute('aria-label', `Fassung ${i.version} als eigene Datei öffnen`);
        b.addEventListener('click', () => {
          void edit.checkoutVersion(base.bytes, i.version).then(async (bytes) => {
            dialog.close();
            await this.host.openOther(bytes, `${this.stem()}-fassung-${i.version}.hpro`);
          }, (e: unknown) => ($('diff-status').textContent = String(e)));
        });
        td.append(b);
      }
      tr.append(td);
      rows.append(tr);
    }
    const available = infos.filter((i) => i.available);
    const fill = (id: string, pick: number | undefined) => {
      const sel = $<HTMLSelectElement>(id);
      sel.replaceChildren(...available.map((i) => new Option(`Fassung ${i.version}${i.dateModified ? ` (${i.dateModified})` : ''}`, String(i.version), false, i.version === pick)));
    };
    fill('diff-from', available[1]?.version ?? available[0]?.version);
    fill('diff-to', available[0]?.version);
    $<HTMLButtonElement>('diff-run').disabled = available.length < 2;
    if (available.length < 2) $('diff-status').textContent = 'Diese Datei enthält nur eine Fassung; nach dem ersten Speichern lassen sich zwei Fassungen vergleichen.';
    dialog.showModal();
  }

  private async runDiff(): Promise<void> {
    const base = this.base;
    if (!base) return;
    const from = Number($<HTMLSelectElement>('diff-from').value);
    const to = Number($<HTMLSelectElement>('diff-to').value);
    const list = $('diff-list');
    list.replaceChildren();
    try {
      const d = await edit.diffVersions(base.bytes, Math.min(from, to), Math.max(from, to));
      this.lastDiff = d;
      $('diff-status').textContent = d.changes.length === 0 ? `Keine Änderungen zwischen Fassung ${Math.min(from, to)} und ${Math.max(from, to)}.` : `${d.changes.length} ${d.changes.length === 1 ? 'Änderung' : 'Änderungen'} von Fassung ${Math.min(from, to)} zu ${Math.max(from, to)}.`;
      for (const c of d.changes) {
        const li = document.createElement('li');
        li.className = `diff-item ${c.kind}`;
        const head = document.createElement('p');
        const strong = document.createElement('strong');
        strong.textContent = edit.CHANGE_LABEL[c.kind];
        const where = document.createElement('code');
        where.textContent = c.to ?? c.from ?? c.path;
        head.append(strong, ' ', where, c.detail ? ` – ${c.detail}` : '');
        li.append(head);
        const body = document.createElement('p');
        body.className = 'diff-words';
        if (c.words && c.words.some((w) => w.op !== '=')) {
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
        } else {
          if (c.before) {
            const del = document.createElement('del');
            del.textContent = c.before;
            body.append(del, ' ');
          }
          if (c.after) {
            const ins = document.createElement('ins');
            ins.textContent = c.after;
            body.append(ins);
          }
        }
        if (body.childNodes.length > 0) li.append(body);
        list.append(li);
      }
      $('diff-download').hidden = false;
    } catch (e) {
      $('diff-status').textContent = `Vergleich nicht möglich: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // ------------------------------------------------------------------ redaction

  private openRedact(): void {
    const r = this.record();
    const checkbox = $<HTMLInputElement>('redact-block');
    const ownId = r?.id ?? undefined;
    checkbox.disabled = !ownId;
    checkbox.checked = false;
    $('redact-block-label').textContent = ownId ? `Ausgewählten Block schwärzen (${this.path}#${ownId})` : 'Ausgewählten Block schwärzen (nur für Blöcke mit eigener Kennung; sonst Begriffe angeben)';
    $('redact-error').textContent = this.session && this.session.results.length > 0 ? 'Es gibt ungespeicherte Änderungen. Bitte zuerst speichern oder rückgängig machen.' : '';
    $<HTMLButtonElement>('redact-run').disabled = !!this.session && this.session.results.length > 0;
    $('redact-confirm-field').hidden = true;
    $<HTMLInputElement>('redact-confirm').checked = false;
    $<HTMLDialogElement>('dlg-redact').showModal();
  }

  private async redact(): Promise<void> {
    const base = this.base;
    if (!base) return;
    const r = this.record();
    const targets = $<HTMLInputElement>('redact-block').checked && r?.id ? [`${this.path}#${r.id}`] : [];
    const terms = $<HTMLTextAreaElement>('redact-terms')
      .value.split('\n')
      .map((t) => t.trim())
      .filter(Boolean);
    const reason = $<HTMLInputElement>('redact-reason').value.trim();
    if (targets.length === 0 && terms.length === 0) {
      $('redact-error').textContent = 'Bitte einen Block wählen oder Begriffe angeben.';
      return;
    }
    $('redact-error').textContent = 'Schwärze und prüfe …';
    try {
      const result = await lock.redactContainer(base.bytes, { targets, terms, at: timestamp(base.modified), ...(reason ? { reason } : {}), removeSignedRenditions: $<HTMLInputElement>('redact-confirm').checked });
      $<HTMLDialogElement>('dlg-redact').close();
      $<HTMLTextAreaElement>('redact-terms').value = '';
      const name = `${this.stem()}-geschwaerzt.hpro`;
      this.host.download(result.bytes, name, 'application/epub+zip');
      await this.host.saved(
        result.bytes,
        name,
        `Geschwärzt: ${result.entries.length} Protokolleintrag/-einträge in data/redaction-log.json; Nachprüfung ${result.check.hits} Treffer in ${result.check.entries} Einträgen und früheren Fassungen. Datei „${name}“ heruntergeladen.`,
      );
    } catch (e) {
      if (e instanceof lock.RedactionNeedsConfirmation) {
        $('redact-confirm-field').hidden = false;
        $('redact-error').textContent = `${e.message} Zum Fortfahren unten bestätigen.`;
        return;
      }
      $('redact-error').textContent = `Nicht geschwärzt: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
}
