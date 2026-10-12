/**
 * Structured editing of the main version (docs/10, promise 4; package P5): every operation
 * changes the XHTML of the content documents themselves — text stays text, structure stays
 * structure, there is no overlay layer. A session is opened on a container, operations are
 * applied one by one (each is checked and rolled back on error) and `save` writes a new container
 * with updated hashes, `dateModified`, a `history` entry (HP-META-006) and the history journal
 * (`journal.ts`).
 *
 * Rules the session enforces:
 *   - locks: `read-only` (HP-LOCK-002), sealed sections, frozen versions, redaction placeholders
 *     (HP-LOCK-008), calculator tables (formulas are changed by the calculator, part 3);
 *   - stable addresses: ids of existing elements never change, ids of deleted elements and ids
 *     of any earlier version are never handed out again (HP-ADR-004); new headings, sections,
 *     tables, figures, footnotes get ids (HP-ADR-001/002);
 *   - integrity: no operation may add a dangling link, an unpaired footnote (HP-MIN-008), a
 *     heading jump or second h1 (HPR-INH-010), an uneven table (HP-MIN-006), a duplicate id or a
 *     top-level section missing from the navigation (HP-ADR-007); problems the document had
 *     before are tolerated, new ones are refused;
 *   - navigation: heading text, inserted, moved and deleted sections are carried into nav.xhtml.
 */
import type { Document, Element, Node } from '@xmldom/xmldom';
import { fromUtf8, utf8 } from '../bytes.js';
import { readContainer, type ReadContainer } from '../container.js';
import { sriSha256 } from '../hash.js';
import { assertEditable, LockError, parseAccess, splitTarget, type AccessEntry } from '../lock/access.js';
import { childElements, descendants, embeddedReferences, isElement, parseXml, relativeHref, resolveHref, serializeXml, XHTML_NS, XHTML_TYPE } from '../lock/xml.js';
import { opfWithModified } from '../update.js';
import { writeZip, type ZipEntryInput } from '../zip.js';
import {
  EditError,
  elementById,
  EPUB_NS,
  ID_RE,
  IdAllocator,
  importNodes,
  isBlockChild,
  isNoteRef,
  isRedactionMark,
  parseInline,
  parsePointer,
  pointerOf,
  resolveSteps,
  slug,
  textOf,
} from './dom.js';
import { recordVersion, reconstructAll } from './journal.js';
import { extractBlocks, isFootnote, outline, TEXT_BLOCKS, type BlockRecord } from './model.js';
import { buildGrid, cellAt, deleteColumn, deleteRow, gridProblems, insertColumn, insertRow } from './table.js';

type Json = Record<string, unknown>;
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const IMAGE_TYPES: Record<string, { ext: string; magic?: number[] }> = {
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  'image/gif': { ext: 'gif', magic: [0x47, 0x49, 0x46, 0x38] },
  'image/webp': { ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46] },
  'image/svg+xml': { ext: 'svg' },
};
/** Parents that take flow blocks (sections, headings, tables, figures). */
const FLOW_PARENTS = new Set(['body', 'main', 'section', 'article', 'aside', 'div', 'details', 'blockquote', 'header', 'footer']);
/** Parents that take paragraphs and lists, too. */
const PARA_PARENTS = new Set([...FLOW_PARENTS, 'li', 'dd', 'td', 'th', 'figure']);

export type Position = 'before' | 'after' | 'start' | 'end';

export interface MediaInput {
  /** File name stem, e.g. `grundriss.png`. */
  readonly name: string;
  readonly type: string;
  readonly data: Uint8Array;
}

export type ListItemSpec = string | { readonly text?: string; readonly inline?: string; readonly items?: readonly ListItemSpec[]; readonly ordered?: boolean };

export type BlockSpec =
  | { readonly type: 'paragraph'; readonly text?: string; readonly inline?: string; readonly id?: string }
  | { readonly type: 'heading'; readonly level?: number; readonly text?: string; readonly inline?: string; readonly id?: string }
  | { readonly type: 'section'; readonly heading: string; readonly level?: number; readonly id?: string; readonly blocks?: readonly BlockSpec[] }
  | { readonly type: 'list'; readonly ordered?: boolean; readonly start?: number; readonly items: readonly ListItemSpec[]; readonly id?: string }
  | { readonly type: 'list-item'; readonly text?: string; readonly inline?: string }
  | { readonly type: 'table'; readonly caption: string; readonly header: readonly string[]; readonly rows: readonly (readonly string[])[]; readonly id?: string; readonly strategy?: 'scroll' | 'stack' }
  | { readonly type: 'figure'; readonly alt: string; readonly caption?: string; readonly src?: string; readonly media?: MediaInput; readonly id?: string; readonly decorative?: boolean }
  | { readonly type: 'code'; readonly text: string; readonly id?: string }
  | { readonly type: 'quote'; readonly text?: string; readonly inline?: string; readonly id?: string };

export type EditOp =
  | { readonly op: 'set-text'; readonly target: string; readonly text?: string; readonly inline?: string }
  | { readonly op: 'set-heading-level'; readonly target: string; readonly level: number }
  | { readonly op: 'change-type'; readonly target: string; readonly to: 'paragraph' | 'heading'; readonly level?: number }
  | { readonly op: 'insert'; readonly ref: string; readonly position: Position; readonly block: BlockSpec }
  | { readonly op: 'delete'; readonly target: string }
  | { readonly op: 'move'; readonly target: string; readonly ref: string; readonly position: Position }
  | { readonly op: 'set-list-type'; readonly target: string; readonly ordered: boolean; readonly start?: number | null }
  | { readonly op: 'indent'; readonly target: string }
  | { readonly op: 'outdent'; readonly target: string }
  | { readonly op: 'insert-row'; readonly table: string; readonly at?: number; readonly cells?: readonly string[] }
  | { readonly op: 'delete-row'; readonly table: string; readonly row: number }
  | { readonly op: 'insert-column'; readonly table: string; readonly at?: number; readonly cells?: readonly string[] }
  | { readonly op: 'delete-column'; readonly table: string; readonly column: number }
  | { readonly op: 'insert-footnote'; readonly target: string; readonly after?: string; readonly text?: string; readonly inline?: string }
  | { readonly op: 'delete-footnote'; readonly target: string }
  | { readonly op: 'insert-xref'; readonly target: string; readonly to: string; readonly after?: string; readonly text?: string }
  | { readonly op: 'set-image'; readonly target: string; readonly alt?: string; readonly src?: string; readonly media?: MediaInput }
  | { readonly op: 'set-title'; readonly title: string };

export interface OpResult {
  readonly op: string;
  /** German one-line description with addresses only (goes into the history note; no content, see redaction). */
  readonly summary: string;
  /** Content of the change for display (old/new text); not stored in the file. */
  readonly detail?: string;
  readonly target?: string;
  /** Pointers of new elements. */
  readonly created?: readonly string[];
  /** Pointers or paths that were removed. */
  readonly removed?: readonly string[];
  readonly notes?: readonly string[];
}

export interface SaveOptions {
  /** `dateModified` and history time, `YYYY-MM-DDThh:mm:ssZ`. */
  readonly at: string;
  /** History note; default: the summaries of the operations. */
  readonly note?: string;
  /** Keep the history journal (default true; HPC-0008). */
  readonly journal?: boolean;
  /** Keep removed images in the journal (default true). */
  readonly keepMedia?: boolean;
}

export interface SaveResult {
  readonly bytes: Uint8Array;
  readonly version: number;
  readonly results: readonly OpResult[];
  readonly changedFiles: readonly string[];
  readonly addedFiles: readonly string[];
  readonly removedFiles: readonly string[];
}

interface LoadedDoc {
  doc: Document;
  readonly text: string;
  dirty: boolean;
}

function toEditError(e: unknown): never {
  if (e instanceof LockError) throw new EditError(e.code === 'sealed' ? 'sealed' : e.code === 'not-found' ? 'not-found' : e.code === 'read-only' ? 'read-only' : 'invalid', e.message);
  throw e;
}

export class EditSession {
  readonly results: OpResult[] = [];
  private readonly docs = new Map<string, LoadedDoc>();
  private readonly added = new Map<string, { data: Uint8Array; type: string }>();
  private readonly removed = new Set<string>();
  private readonly access: AccessEntry[];
  private readonly types: Map<string, string>;
  private readonly readingOrder: string[];
  private readonly navPath: string | null;
  private readonly allocators = new Map<string, IdAllocator>();
  private baseline = new Map<string, number>();
  private title: string;
  private titleChanged = false;
  private readonly redactedTargets: Set<string>;

  private constructor(
    readonly container: ReadContainer,
    private readonly manifest: Json,
    private readonly retired: ReadonlyMap<string, ReadonlySet<string>>,
  ) {
    this.types = new Map((manifest.resources as Array<{ url: string; type: string }>).map((r) => [r.url, r.type]));
    this.readingOrder = (manifest.readingOrder as Array<{ url: string }>).map((r) => r.url);
    this.access = parseAccess(manifest);
    const opf = fromUtf8(container.files.get(container.packagePath)!);
    const nav = /<item\b[^>]*\bproperties="[^"]*\bnav\b[^"]*"[^>]*>/.exec(opf)?.[0];
    const href = nav ? /\bhref="([^"]+)"/.exec(nav)?.[1] : undefined;
    this.navPath = href ? (resolveHref(container.packagePath, decodeURIComponent(href))?.path ?? null) : null;
    this.title = String(manifest.name ?? '');
    const log = container.files.get('data/redaction-log.json');
    this.redactedTargets = new Set(log ? (JSON.parse(fromUtf8(log)) as Array<{ target?: string }>).map((e) => String(e.target ?? '')) : []);
  }

  /** Opens a container for editing; ids of earlier versions (from the journal) count as used. */
  static async open(bytes: Uint8Array): Promise<EditSession> {
    const c = await readContainer(bytes);
    if (!c.integrity.ok) throw new EditError('invalid', 'the container does not match its manifest hashes (changed outside a conforming tool); not edited');
    const manifest = JSON.parse(fromUtf8(c.files.get('manifest.json')!)) as Json;
    const retired = new Map<string, Set<string>>();
    try {
      const { snapshots } = await reconstructAll(c);
      for (const s of snapshots.slice(1)) {
        for (const [p, d] of s.files) {
          if (!p.endsWith('.xhtml') || p.startsWith('renditions/')) continue;
          const ids = retired.get(p) ?? retired.set(p, new Set()).get(p)!;
          for (const m of fromUtf8(d).matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]!);
        }
      }
    } catch {
      // A broken journal does not block editing; ids are then protected for this session only.
    }
    const s = new EditSession(c, manifest, retired);
    s.baseline = s.problemCounts();
    return s;
  }

  /** Content documents of the main version in reading order. */
  documents(): string[] {
    return [...this.readingOrder];
  }

  /** Block outline of a document (default: first in reading order). */
  outline(path = this.readingOrder[0]!): ReturnType<typeof outline> {
    return outline(this.doc(path), path);
  }

  blocks(path = this.readingOrder[0]!): BlockRecord[] {
    return extractBlocks(this.doc(path), path);
  }

  /** Current XHTML of a document (for previews). */
  xhtml(path: string): string {
    const d = this.loaded(path);
    return serializeXml(d.doc, d.text);
  }

  /** Applies one operation; on any error the documents are left as they were. */
  apply(op: EditOp): OpResult {
    const before = new Map([...this.docs].map(([p, d]) => [p, { xml: serializeXml(d.doc, d.text), dirty: d.dirty }]));
    const addedBefore = new Map(this.added);
    const removedBefore = new Set(this.removed);
    const titleBefore = [this.title, this.titleChanged] as const;
    const allocBefore = new Map(this.allocators);
    try {
      const r = this.run(op);
      this.checkNewProblems();
      this.results.push(r);
      return r;
    } catch (e) {
      for (const [p, b] of before) {
        const d = this.docs.get(p)!;
        d.doc = parseXml(b.xml, p);
        d.dirty = b.dirty;
      }
      for (const p of [...this.docs.keys()]) if (!before.has(p)) this.docs.delete(p);
      this.added.clear();
      for (const [k, v] of addedBefore) this.added.set(k, v);
      this.removed.clear();
      for (const p of removedBefore) this.removed.add(p);
      [this.title, this.titleChanged] = titleBefore;
      this.allocators.clear();
      for (const [k, v] of allocBefore) this.allocators.set(k, v);
      if (e instanceof EditError) throw e;
      toEditError(e);
    }
  }

  applyAll(ops: readonly EditOp[]): OpResult[] {
    return ops.map((op) => this.apply(op));
  }

  // -------------------------------------------------------------------------------------------
  // Documents and checks

  private loaded(path: string): LoadedDoc {
    let d = this.docs.get(path);
    if (!d) {
      if (path.startsWith('renditions/')) throw new EditError('read-only', 'eine eingefrorene Fassung wird nicht bearbeitet (Teil 1, 7.2: das wäre eine Manipulation)');
      const data = this.container.files.get(path);
      if (!data || this.types.get(path) !== XHTML_TYPE) throw new EditError('not-found', `${path} ist kein Inhaltsdokument der Hauptfassung`);
      const text = fromUtf8(data);
      d = { doc: parseXml(text, path), text, dirty: false };
      this.docs.set(path, d);
    }
    return d;
  }

  private doc(path: string): Document {
    return this.loaded(path).doc;
  }

  private touch(path: string): Document {
    const d = this.loaded(path);
    d.dirty = true;
    return d.doc;
  }

  private contentPaths(): string[] {
    return [...this.types].filter(([p, t]) => t === XHTML_TYPE && !p.startsWith('renditions/') && !this.removed.has(p)).map(([p]) => p);
  }

  private allocator(path: string): IdAllocator {
    let a = this.allocators.get(path);
    if (!a) {
      const current = descendants(this.doc(path)).map((e) => e.getAttribute('id')).filter((x): x is string => !!x);
      a = new IdAllocator(current, this.retired.get(path) ?? []);
      this.allocators.set(path, a);
    }
    return a;
  }

  private explicitId(path: string, id: string | undefined): string | undefined {
    if (id === undefined) return undefined;
    if (!ID_RE.test(id) || id.length > 64) throw new EditError('invalid', `Kennung "${id}" entspricht nicht ^[A-Za-z][A-Za-z0-9_.-]*$ (höchstens 64 Zeichen, HP-ADR-002)`);
    const a = this.allocator(path);
    if (!a.isFree(id)) throw new EditError('conflict', `Kennung "${id}" ist in ${path} vergeben oder war in einer früheren Fassung vergeben (HP-ADR-004)`);
    a.reserve(id);
    return id;
  }

  /** Problems as a multiset of descriptions (stable across edits that do not touch them). */
  private problemCounts(): Map<string, number> {
    const out = new Map<string, number>();
    const add = (s: string) => out.set(s, (out.get(s) ?? 0) + 1);
    const docs = this.contentPaths();
    const idsOf = new Map<string, Set<string>>();
    for (const p of docs) idsOf.set(p, new Set(descendants(this.doc(p)).map((e) => e.getAttribute('id')).filter((x): x is string => !!x)));
    for (const p of docs) {
      const doc = this.doc(p);
      const seen = new Set<string>();
      let h1 = 0;
      let last = 0;
      for (const el of descendants(doc)) {
        const id = el.getAttribute('id');
        if (id !== null) {
          if (seen.has(id)) add(`${p}: Kennung ${id} doppelt`);
          seen.add(id);
          if (!ID_RE.test(id) || id.length > 64) add(`${p}: Kennung ${id} ungültig`);
        }
        const name = el.localName ?? '';
        if (el.namespaceURI === XHTML_NS && ['section', 'article', 'aside', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'figure', 'pre', 'details'].includes(name) && id === null && !el.hasAttribute('data-hp-redacted')) add(`${p}: <${name}> ohne Kennung (HP-ADR-001)`);
        if (/^h[1-6]$/.test(name) && !isInsideNav(el)) {
          const level = Number(name[1]);
          if (level === 1) h1++;
          if (last > 0 && level > last + 1) add(`${p}: Überschriftensprung h${last}→h${level}`);
          last = level;
        }
        if (name === 'table') for (const g of gridProblems(el)) add(`${p}: Tabelle ${id ?? ''}: ${g}`);
        if (name === 'a' && el.getAttribute('href') !== null) {
          const href = el.getAttribute('href')!;
          if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue;
          const t = resolveHref(p, href);
          if (!t) {
            add(`${p}: Verweis ${href} verlässt den Container`);
            continue;
          }
          const targetIds = idsOf.get(t.path);
          const exists = this.container.files.has(t.path) && !this.removed.has(t.path) || this.added.has(t.path);
          if (!exists) add(`${p}: Verweis ${href} ohne Ziel`);
          else if (t.fragment && targetIds && !targetIds.has(decodeURIComponent(t.fragment)) && !this.isCellAddress(t.path, decodeURIComponent(t.fragment))) add(`${p}: Verweis ${href} ohne Ziel`);
          if (isNoteRef(el)) {
            const note = t.path === p ? elementById(doc, decodeURIComponent(t.fragment)) : undefined;
            if (!note || !(isFootnote(note) || note.localName === 'li')) add(`${p}: Fußnotenverweis ${href} ohne Notentext`);
          }
        }
        if (isFootnote(el)) {
          const refs = descendants(doc).filter((a) => isNoteRef(a) && (a.getAttribute('href') ?? '').replace(/^[^#]*#/, '') === id);
          if (refs.length === 0) add(`${p}: Fußnote ${id ?? ''} ohne Verweis`);
        }
      }
      if (this.readingOrder.includes(p) && h1 !== 1) add(`${p}: ${h1} Überschriften h1`);
    }
    // HP-ADR-007: every top-level section/article is in the navigation.
    if (this.navPath && this.container.files.has(this.navPath)) {
      const targets = this.navTargets();
      for (const p of this.readingOrder) {
        for (const el of descendants(this.doc(p))) {
          if (!['section', 'article'].includes(el.localName ?? '') || isFootnote(el)) continue;
          if (ancestorElements(el).some((a) => ['section', 'article'].includes(a.localName ?? ''))) continue;
          const id = el.getAttribute('id');
          if (id && !targets.has(`${p}#${id}`)) add(`${p}: Abschnitt ${id} fehlt im Inhaltsverzeichnis`);
        }
      }
    }
    return out;
  }

  private isCellAddress(path: string, fragment: string): boolean {
    const m = /^(.+)\.([A-Z]{1,3})([1-9]\d*)$/.exec(fragment);
    if (!m) return false;
    const table = elementById(this.doc(path), m[1]!);
    if (!table || table.localName !== 'table') return false;
    let col = 0;
    for (const ch of m[2]!) col = col * 26 + ch.charCodeAt(0) - 64;
    return buildGrid(table).grid[Number(m[3]) - 1]?.[col - 1] !== undefined;
  }

  private checkNewProblems(): void {
    const now = this.problemCounts();
    const fresh: string[] = [];
    for (const [k, n] of now) if (n > (this.baseline.get(k) ?? 0)) fresh.push(k);
    if (fresh.length > 0) throw new EditError('conflict', `Die Änderung würde die Struktur beschädigen: ${fresh.join('; ')}`);
  }

  private navTargets(): Set<string> {
    const out = new Set<string>();
    if (!this.navPath) return out;
    const nav = this.navDoc();
    for (const a of descendants(nav).filter((e) => e.localName === 'a')) {
      const t = resolveHref(this.navPath, a.getAttribute('href') ?? '');
      if (t) out.add(`${t.path}#${decodeURIComponent(t.fragment)}`);
    }
    return out;
  }

  private navDoc(): Document {
    const d = this.docs.get(this.navPath!);
    if (d) return d.doc;
    const text = fromUtf8(this.container.files.get(this.navPath!)!);
    const ld = { doc: parseXml(text, this.navPath!), text, dirty: false };
    this.docs.set(this.navPath!, ld);
    return ld.doc;
  }

  // -------------------------------------------------------------------------------------------
  // Resolving and guarding targets

  private resolve(target: string): { path: string; el: Element; doc: Document } {
    const p = parsePointer(target, this.readingOrder[0]!);
    if (this.navPath && p.path === this.navPath) throw new EditError('invalid', 'das Inhaltsverzeichnis wird aus den Überschriften geführt und nicht direkt bearbeitet');
    const doc = this.doc(p.path);
    if (p.cell && !elementById(doc, p.anchor)) {
      const table = elementById(doc, p.cell.table);
      if (!table || table.localName !== 'table') throw new EditError('not-found', `${target}: keine Tabelle mit der Kennung ${p.cell.table}`);
      const el = cellAt(table, p.cell.row, p.cell.col);
      if (!el) throw new EditError('not-found', `${target}: Zelle gibt es nicht (oder sie ist Teil einer verbundenen Zelle)`);
      return { path: p.path, el, doc };
    }
    return { path: p.path, el: resolveSteps(doc, p, target), doc };
  }

  /** Locks and protected content at and above `el` (and below it for whole-block operations). */
  private guard(path: string, el: Element, what: string, subtree = false): void {
    try {
      assertEditable(this.access, path, el, what);
      if (subtree) for (const d of descendants(el)) if (d.getAttribute('id')) assertEditable(this.access, path, d, what);
    } catch (e) {
      toEditError(e);
    }
    for (let p: Node | null = el; p; p = p.parentNode) {
      if (isElement(p) && p.hasAttribute('data-hp-sealed')) throw new EditError('sealed', `${what} liegt in einem versiegelten Abschnitt`);
    }
    const ids = [el, ...ancestorElements(el)].map((e) => e.getAttribute('id')).filter((x): x is string => !!x);
    if (this.access.some((a) => a.rules.includes('sealed') && splitTarget(a.target).path === path && ids.includes(splitTarget(a.target).id ?? ''))) throw new EditError('sealed', `${what} ist versiegelt`);
    const table = el.localName === 'table' ? el : ancestorElements(el).find((a) => a.localName === 'table');
    if (table && descendants(table).some((d) => d.hasAttribute('data-hp-formula') || d.hasAttribute('data-hp-input'))) {
      throw new EditError('calc', `${what} gehört zu einer Rechentabelle (${table.getAttribute('id') ?? 'ohne Kennung'}); Werte und Formeln ändert der Tabellenrechner (hpro calc, Teil 3), damit Formel und Wert zusammenpassen`);
    }
  }

  private guardRemoval(path: string, el: Element, what: string): void {
    this.guard(path, el, what, true);
    if ([el, ...descendants(el)].some((d) => isRedactionMark(d))) throw new EditError('redacted', `${what} enthält eine Schwärzung; der Platzhalter bleibt an seiner Adresse (HP-LOCK-008, Redaktionsprotokoll)`);
    const ids = [el, ...descendants(el)].map((d) => d.getAttribute('id')).filter((x): x is string => !!x);
    for (const id of ids) if (this.redactedTargets.has(`${path}#${id}`)) throw new EditError('redacted', `${path}#${id} ist Ziel eines Eintrags im Redaktionsprotokoll und bleibt bestehen`);
  }

  // -------------------------------------------------------------------------------------------
  // Operations

  private run(op: EditOp): OpResult {
    switch (op.op) {
      case 'set-text':
        return this.setText(op.target, op);
      case 'set-heading-level':
        return this.setHeadingLevel(op.target, op.level);
      case 'change-type':
        return this.changeType(op.target, op.to, op.level);
      case 'insert':
        return this.insert(op.ref, op.position, op.block);
      case 'delete':
        return this.remove(op.target);
      case 'move':
        return this.move(op.target, op.ref, op.position);
      case 'set-list-type':
        return this.setListType(op.target, op.ordered, op.start);
      case 'indent':
        return this.indent(op.target);
      case 'outdent':
        return this.outdent(op.target);
      case 'insert-row':
      case 'delete-row':
      case 'insert-column':
      case 'delete-column':
        return this.tableOp(op);
      case 'insert-footnote':
        return this.insertFootnote(op.target, op.after, op);
      case 'delete-footnote':
        return this.deleteFootnote(op.target);
      case 'insert-xref':
        return this.insertXref(op.target, op.to, op.after, op.text);
      case 'set-image':
        return this.setImage(op.target, op);
      case 'set-title':
        return this.setTitle(op.title);
      default:
        throw new EditError('invalid', `unknown operation ${(op as { op?: unknown }).op as string}`);
    }
  }

  /** Inline nodes for `text` or `inline`, created in `doc`. */
  private inlineNodes(doc: Document, input: { text?: string; inline?: string }, where: string): Node[] {
    if ((input.text === undefined) === (input.inline === undefined)) throw new EditError('invalid', `${where}: genau eines von text oder inline angeben`);
    if (input.text !== undefined) return input.text === '' ? [] : [doc.createTextNode(input.text)];
    return importNodes(doc, parseInline(input.inline!, where));
  }

  private setText(target: string, input: { text?: string; inline?: string }): OpResult {
    let { path, el, doc } = this.resolve(target);
    // A footnote, quote or definition with a single paragraph: edit that paragraph.
    if (!TEXT_BLOCKS.has(el.localName ?? '')) {
      const ps = childElements(el).filter((c) => TEXT_BLOCKS.has(c.localName ?? ''));
      if (ps.length === 1 && childElements(el).length === 1) el = ps[0]!;
      else throw new EditError('invalid', `${target}: <${el.localName}> ist kein Textblock (Absatz, Überschrift, Listenpunkt, Zelle, Beschriftung); Zeiger auf den Textblock verwenden`);
    }
    this.guard(path, el, target);
    doc = this.touch(path);
    const name = el.localName ?? '';
    const blockKids = childElements(el).filter(isBlockChild);
    if (blockKids.length > 0 && name !== 'li') throw new EditError('invalid', `${target}: <${name}> enthält Blöcke (${blockKids.map((b) => b.localName).join(', ')}); Zeiger auf den inneren Block verwenden`);
    if (name === 'pre') {
      if (input.text === undefined) throw new EditError('invalid', `${target}: Codeblöcke nehmen nur text`);
      while (el.firstChild) el.removeChild(el.firstChild);
      el.appendChild(doc.createTextNode(input.text));
      return { op: 'set-text', target, summary: `Code ${pointerOf(el, path)} geändert` };
    }
    const oldText = textOf(el, isBlockChild);
    const inlineOld = inlineChildren(el);
    const protectedOld = inlineOld.flatMap((n) => (isElement(n) ? [n, ...descendants(n)] : [])).filter((n) => isNoteRef(n) || isRedactionMark(n));
    const nodes = this.inlineNodes(doc, input, target);
    if (protectedOld.length > 0) {
      const kept = nodes.flatMap((n) => (isElement(n) ? [n, ...descendants(n)] : [])).filter((n) => isNoteRef(n) || isRedactionMark(n));
      const notesOld = protectedOld.filter(isNoteRef).map((n) => n.getAttribute('href'));
      const notesNew = kept.filter(isNoteRef).map((n) => n.getAttribute('href'));
      const marksOld = protectedOld.filter(isRedactionMark).length;
      const marksNew = kept.filter(isRedactionMark).length;
      if (marksNew < marksOld) throw new EditError('redacted', `${target}: enthält ${marksOld} Schwärzung(en); der Platzhalter <span data-hp-redacted="" role="img" aria-label="geschwärzt"/> muss bleiben (HP-LOCK-008)`);
      const lost = notesOld.filter((h) => !notesNew.includes(h));
      if (lost.length > 0) throw new EditError('conflict', `${target}: der Text enthält Fußnotenverweis(e) ${lost.join(', ')}; mit inline-Markup setzen, das den Verweis übernimmt, oder die Fußnote zuerst löschen (delete-footnote)`);
    }
    for (const n of inlineOld) el.removeChild(n);
    const firstBlock = childElements(el).find(isBlockChild) ?? null;
    for (const n of nodes) el.insertBefore(n, firstBlock);
    const newText = textOf(el, isBlockChild);
    if (newText === '' && ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'caption', 'figcaption', 'summary', 'dt'].includes(name)) throw new EditError('invalid', `${target}: ${blockName(name)} darf nicht leer werden; leere Blöcke löschen (delete)`);
    const notes: string[] = [];
    if (/^h[1-6]$/.test(name)) {
      notes.push(...this.syncNavText(path, el, oldText, newText));
      return { op: 'set-text', target, summary: `Überschrift ${pointerOf(el, path)} geändert`, detail: `„${short(oldText)}“ → „${short(newText)}“`, ...(notes.length ? { notes } : {}) };
    }
    if (/^\s*([•\-–*·]|\d+[.)])\s/.test(newText) && name === 'li') notes.push('Listenpunkt beginnt mit einem Aufzählungszeichen; die Nummerierung kommt aus der Liste (HP-MIN-005)');
    return { op: 'set-text', target, summary: `${blockName(name)} ${pointerOf(el, path)} geändert`, ...(notes.length ? { notes } : {}) };
  }

  private setHeadingLevel(target: string, level: number): OpResult {
    const { path, el } = this.resolve(target);
    if (!/^h[1-6]$/.test(el.localName ?? '')) throw new EditError('invalid', `${target} ist keine Überschrift`);
    if (!Number.isInteger(level) || level < 1 || level > 6) throw new EditError('invalid', `Ebene ${level}: erlaubt sind 1…6`);
    this.guard(path, el, target);
    const doc = this.touch(path);
    const old = el.localName!;
    this.rename(doc, el, `h${level}`);
    return { op: 'set-heading-level', target, summary: `Überschrift ${target}: Ebene ${old.slice(1)} → ${level}` };
  }

  private changeType(target: string, to: 'paragraph' | 'heading', level?: number): OpResult {
    const { path, el } = this.resolve(target);
    const name = el.localName ?? '';
    this.guard(path, el, target);
    const doc = this.touch(path);
    if (to === 'heading') {
      if (name !== 'p') throw new EditError('invalid', `${target}: nur ein Absatz wird zur Überschrift`);
      if (!FLOW_PARENTS.has((el.parentNode as Element).localName ?? '')) throw new EditError('invalid', `${target}: Überschriften stehen nur in Abschnitten, nicht in <${(el.parentNode as Element).localName}>`);
      const lv = level ?? this.levelIn(el.parentNode as Element);
      const h = this.rename(doc, el, `h${lv}`);
      if (!h.getAttribute('id')) h.setAttribute('id', this.allocator(path).take(textOf(h), 'h'));
      return { op: 'change-type', target, summary: `Absatz ${target} → Überschrift h${lv} (#${h.getAttribute('id')})`, created: [pointerOf(h, path)] };
    }
    if (!/^h[1-6]$/.test(name)) throw new EditError('invalid', `${target}: nur eine Überschrift wird zum Absatz`);
    const p = this.rename(doc, el, 'p');
    this.removeNavEntries(path, [p.getAttribute('id') ?? '']);
    return { op: 'change-type', target, summary: `Überschrift ${target} → Absatz` };
  }

  private rename(doc: Document, el: Element, name: string): Element {
    const n = doc.createElementNS(XHTML_NS, name);
    for (let i = 0; i < el.attributes.length; i++) {
      const a = el.attributes.item(i)!;
      if (a.name.startsWith('xmlns')) continue;
      if (a.namespaceURI) n.setAttributeNS(a.namespaceURI, a.name, a.value);
      else n.setAttribute(a.name, a.value);
    }
    while (el.firstChild) n.appendChild(el.firstChild);
    el.parentNode!.replaceChild(n, el);
    return n;
  }

  /** Level of a heading placed directly in `parent`: 1 + number of enclosing sections (at least 2). */
  private levelIn(parent: Element): number {
    const sections = [parent, ...ancestorElements(parent)].filter((a) => ['section', 'article', 'aside'].includes(a.localName ?? '')).length;
    return Math.min(6, Math.max(2, sections + 1));
  }

  private place(ref: { path: string; el: Element }, position: Position, node: Element): void {
    const parent = position === 'start' || position === 'end' ? ref.el : (ref.el.parentNode as Element);
    if (position === 'before') parent.insertBefore(node, ref.el);
    else if (position === 'after') parent.insertBefore(node, ref.el.nextSibling);
    else if (position === 'end') parent.appendChild(node);
    else {
      // After a leading heading, caption or summary.
      let first = parent.firstChild;
      while (first && (!isElement(first) || /^h[1-6]$/.test(first.localName ?? '') || ['caption', 'summary', 'legend'].includes(first.localName ?? ''))) first = first.nextSibling;
      parent.insertBefore(node, first);
    }
  }

  private parentFor(ref: { el: Element }, position: Position): Element {
    return position === 'start' || position === 'end' ? ref.el : (ref.el.parentNode as Element);
  }

  private insert(refTarget: string, position: Position, spec: BlockSpec): OpResult {
    const ref = this.resolve(refTarget);
    const parent = this.parentFor(ref, position);
    this.guard(ref.path, parent, `Einfügen bei ${refTarget}`);
    const doc = this.touch(ref.path);
    const pname = parent.localName ?? '';
    if (spec.type === 'list-item') {
      if (pname !== 'ul' && pname !== 'ol') throw new EditError('invalid', `ein Listenpunkt gehört in eine Liste, nicht in <${pname}>`);
      const li = doc.createElementNS(XHTML_NS, 'li');
      for (const n of this.inlineNodes(doc, spec, refTarget)) li.appendChild(n);
      this.place(ref, position, li);
      return { op: 'insert', target: refTarget, summary: `Listenpunkt eingefügt in ${pointerOf(parent, ref.path)}`, created: [pointerOf(li, ref.path)] };
    }
    const allowed = spec.type === 'paragraph' || spec.type === 'list' || spec.type === 'code' || spec.type === 'quote' ? PARA_PARENTS : FLOW_PARENTS;
    if (!allowed.has(pname) || isFootnote(parent)) throw new EditError('invalid', `${spec.type} kann nicht in <${pname}> stehen`);
    const el = this.build(doc, ref.path, spec, parent);
    this.place(ref, position, el);
    const created = [pointerOf(el, ref.path)];
    const notes: string[] = [];
    if (spec.type === 'section') notes.push(...this.addNavEntry(ref.path, el));
    return { op: 'insert', target: refTarget, summary: `${blockName(el.localName ?? '')} eingefügt: ${created[0]}`, ...(spec.type === 'section' ? { detail: `„${short(spec.heading)}“` } : {}), created, ...(notes.length ? { notes } : {}) };
  }

  private build(doc: Document, path: string, spec: BlockSpec, parent: Element): Element {
    const ids = this.allocator(path);
    const mk = (name: string) => doc.createElementNS(XHTML_NS, name);
    switch (spec.type) {
      case 'paragraph': {
        const p = mk('p');
        for (const n of this.inlineNodes(doc, spec, 'Absatz')) p.appendChild(n);
        const id = this.explicitId(path, spec.id) ?? ids.take(textOf(p), 'p');
        p.setAttribute('id', id);
        return p;
      }
      case 'heading': {
        const level = spec.level ?? this.levelIn(parent);
        if (!Number.isInteger(level) || level < 1 || level > 6) throw new EditError('invalid', `Ebene ${level}: erlaubt sind 1…6`);
        const h = mk(`h${level}`);
        for (const n of this.inlineNodes(doc, spec, 'Überschrift')) h.appendChild(n);
        h.setAttribute('id', this.explicitId(path, spec.id) ?? ids.take(textOf(h), 'h'));
        return h;
      }
      case 'section': {
        if (spec.heading.trim() === '') throw new EditError('invalid', 'ein Abschnitt braucht eine Überschrift');
        const s = mk('section');
        const id = this.explicitId(path, spec.id) ?? ids.take(spec.heading, 's');
        s.setAttribute('id', id);
        const depth = [parent, ...ancestorElements(parent)].filter((a) => ['section', 'article'].includes(a.localName ?? '')).length + 1;
        const level = spec.level ?? Math.min(6, depth + 1);
        const h = mk(`h${level}`);
        h.setAttribute('id', ids.isFree(`${id}-h`) ? (ids.reserve(`${id}-h`), `${id}-h`) : ids.take(`${id}-h`, 'h'));
        h.appendChild(doc.createTextNode(spec.heading));
        s.appendChild(h);
        for (const b of spec.blocks ?? []) s.appendChild(this.build(doc, path, b, s));
        return s;
      }
      case 'list': {
        if (spec.items.length === 0) throw new EditError('invalid', 'eine Liste braucht mindestens einen Punkt');
        const list = this.buildList(doc, spec.ordered ?? false, spec.items);
        if (spec.start !== undefined) {
          if (!spec.ordered || !Number.isInteger(spec.start)) throw new EditError('invalid', 'start nur bei nummerierten Listen (ganzzahlig)');
          if (spec.start !== 1) list.setAttribute('start', String(spec.start));
        }
        const id = this.explicitId(path, spec.id);
        if (id) list.setAttribute('id', id);
        return list;
      }
      case 'table': {
        if (spec.caption.trim() === '') throw new EditError('invalid', 'eine Tabelle braucht eine Beschriftung (caption, HP-MIN-006)');
        if (spec.header.length === 0) throw new EditError('invalid', 'eine Tabelle braucht eine Kopfzeile');
        for (const [i, r] of spec.rows.entries()) if (r.length !== spec.header.length) throw new EditError('invalid', `Zeile ${i + 1} hat ${r.length} statt ${spec.header.length} Zellen`);
        const t = mk('table');
        t.setAttribute('id', this.explicitId(path, spec.id) ?? ids.take(`tabelle-${spec.caption}`, 'tabelle'));
        t.setAttribute('data-hp-table', spec.strategy ?? 'scroll');
        const cap = mk('caption');
        cap.appendChild(doc.createTextNode(spec.caption));
        t.appendChild(cap);
        const thead = mk('thead');
        const htr = mk('tr');
        for (const h of spec.header) {
          const th = mk('th');
          th.setAttribute('scope', 'col');
          th.appendChild(doc.createTextNode(h));
          htr.appendChild(th);
        }
        thead.appendChild(htr);
        t.appendChild(thead);
        const tbody = mk('tbody');
        for (const r of spec.rows) {
          const tr = mk('tr');
          for (const v of r) {
            const td = mk('td');
            if (v !== '') td.appendChild(doc.createTextNode(v));
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        }
        t.appendChild(tbody);
        return t;
      }
      case 'figure': {
        if (!spec.decorative && spec.alt.trim() === '') throw new EditError('invalid', 'ein Bild braucht einen Alternativtext (HP-INH-006); nur dekorative Bilder haben alt=""');
        const src = this.mediaSource(path, spec.src, spec.media);
        const f = mk('figure');
        f.setAttribute('id', this.explicitId(path, spec.id) ?? ids.take(`abb-${spec.caption ?? spec.alt}`, 'abb'));
        const img = mk('img');
        img.setAttribute('src', src);
        img.setAttribute('alt', spec.decorative ? '' : spec.alt);
        f.appendChild(img);
        if (spec.caption) {
          const fc = mk('figcaption');
          fc.appendChild(doc.createTextNode(spec.caption));
          f.appendChild(fc);
        }
        return f;
      }
      case 'code': {
        const pre = mk('pre');
        pre.setAttribute('id', this.explicitId(path, spec.id) ?? ids.take(`code-${spec.text.split('\n')[0] ?? ''}`, 'code'));
        const code = mk('code');
        code.appendChild(doc.createTextNode(spec.text));
        pre.appendChild(code);
        return pre;
      }
      case 'quote': {
        const q = mk('blockquote');
        const id = this.explicitId(path, spec.id);
        if (id) q.setAttribute('id', id);
        const p = mk('p');
        for (const n of this.inlineNodes(doc, spec, 'Zitat')) p.appendChild(n);
        q.appendChild(p);
        return q;
      }
      default:
        throw new EditError('invalid', `unbekannter Blocktyp ${(spec as { type?: unknown }).type as string}`);
    }
  }

  private buildList(doc: Document, ordered: boolean, items: readonly ListItemSpec[]): Element {
    const list = doc.createElementNS(XHTML_NS, ordered ? 'ol' : 'ul');
    for (const item of items) {
      const li = doc.createElementNS(XHTML_NS, 'li');
      const spec = typeof item === 'string' ? { text: item } : item;
      for (const n of this.inlineNodes(doc, { ...(spec.inline !== undefined ? { inline: spec.inline } : { text: spec.text ?? '' }) }, 'Listenpunkt')) li.appendChild(n);
      if (typeof item !== 'string' && item.items && item.items.length > 0) li.appendChild(this.buildList(doc, item.ordered ?? ordered, item.items));
      list.appendChild(li);
    }
    return list;
  }

  /** Relative `src` for an image: an existing file of the container, or new media added under content/media/. */
  private mediaSource(docPath: string, src: string | undefined, media: MediaInput | undefined): string {
    if ((src === undefined) === (media === undefined)) throw new EditError('invalid', 'Bild: genau eines von src (Datei im Container) oder media (neue Datei) angeben');
    if (src !== undefined) {
      const r = resolveHref(docPath, src);
      const t = r ? this.types.get(r.path) ?? this.added.get(r.path)?.type : undefined;
      if (!r || !t || !t.startsWith('image/') || this.removed.has(r.path)) throw new EditError('not-found', `Bild ${src}: keine Bilddatei im Container`);
      return src;
    }
    const m = media!;
    const info = IMAGE_TYPES[m.type];
    if (!info) throw new EditError('invalid', `Bildtyp ${m.type} ist kein Kernmedientyp (PNG, JPEG, GIF, WebP, SVG; HP-CONT-015)`);
    if (info.magic && !info.magic.every((b, i) => m.data[i] === b)) throw new EditError('invalid', `${m.name}: Inhalt ist kein ${m.type}`);
    if (m.type === 'image/svg+xml') {
      const text = fromUtf8(m.data);
      if (/<script\b|\son[a-z]+\s*=|javascript:|<foreignObject\b/i.test(text)) throw new EditError('invalid', `${m.name}: SVG mit Skript, Ereignisattribut oder foreignObject wird nicht übernommen`);
      parseXml(text, m.name, 'image/svg+xml');
    }
    const dir = docPath.includes('/') ? docPath.slice(0, docPath.lastIndexOf('/') + 1) : '';
    const stem = slug(m.name.replace(/\.[^.]+$/, ''), 40) || 'bild';
    let path = `${dir}media/${stem}.${info.ext}`;
    for (let n = 2; this.container.files.has(path) || this.added.has(path); n++) path = `${dir}media/${stem}-${n}.${info.ext}`;
    this.added.set(path, { data: m.data, type: m.type });
    return relativeHref(docPath, path);
  }

  private remove(target: string): OpResult {
    const { path, el } = this.resolve(target);
    const name = el.localName ?? '';
    if (['body', 'html', 'head', 'main'].includes(name)) throw new EditError('invalid', `<${name}> wird nicht gelöscht`);
    if (['td', 'th', 'tr', 'thead', 'tbody', 'caption'].includes(name)) throw new EditError('invalid', `${target}: Tabellenteile mit delete-row/delete-column ändern; die Beschriftung ist Pflicht`);
    if (name === 'figcaption' || name === 'summary') throw new EditError('invalid', `${target}: <${name}> wird mit set-text geändert`);
    if (isFootnote(el)) return this.deleteFootnote(target);
    this.guardRemoval(path, el, target);
    const doc = this.touch(path);
    const ids = [el, ...descendants(el)].map((d) => d.getAttribute('id')).filter((x): x is string => !!x);
    const media = embeddedReferences(el, path).map((r) => r.target);
    // Footnotes referenced only from the removed block go with it.
    const notes = [el, ...descendants(el)].filter(isNoteRef).map((a) => decodeURIComponent((a.getAttribute('href') ?? '').replace(/^[^#]*#/, '')));
    const parent = el.parentNode as Element;
    if ((name === 'li' && childElements(parent).filter((c) => c.localName === 'li').length === 1)) throw new EditError('invalid', `${target}: der letzte Listenpunkt; die Liste als Ganzes löschen`);
    parent.removeChild(el);
    const removedNotes: string[] = [];
    for (const id of notes) {
      const fn = elementById(doc, id);
      if (!fn || !isFootnote(fn)) continue;
      const still = descendants(doc).some((a) => isNoteRef(a) && decodeURIComponent((a.getAttribute('href') ?? '').replace(/^[^#]*#/, '')) === id);
      if (!still) {
        fn.parentNode!.removeChild(fn);
        removedNotes.push(id);
        ids.push(id);
      }
    }
    this.renumberNotes(doc);
    for (const id of ids) this.allocator(path).reserve(id);
    this.removeNavEntries(path, ids);
    const gone = this.dropUnusedMedia(media);
    const removed = [target, ...removedNotes.map((n) => `${path}#${n}`), ...gone];
    return { op: 'delete', target, summary: `${blockName(name)} ${target} gelöscht${gone.length ? `, Datei ${gone.join(', ')} entfernt` : ''}${removedNotes.length ? `, Fußnote ${removedNotes.join(', ')} entfernt` : ''}`, removed };
  }

  /** Files no longer embedded by any content document of the main version (nor named in CSS) are removed. */
  private dropUnusedMedia(candidates: readonly string[]): string[] {
    const out: string[] = [];
    for (const p of new Set(candidates)) {
      if (!this.container.files.has(p) && !this.added.has(p)) continue;
      const used = this.contentPaths().some((d) => embeddedReferences(this.doc(d), d).some((r) => r.target === p));
      const name = p.split('/').pop()!;
      const inCss = [...this.types].some(([q, t]) => t === 'text/css' && fromUtf8(this.container.files.get(q) ?? new Uint8Array()).includes(name));
      const listed = (['attachments', 'data'] as const).some((k) => Array.isArray(this.manifest[k]) && (this.manifest[k] as Json[]).some((a) => a.url === p));
      if (used || inCss || listed) continue;
      if (this.added.has(p)) this.added.delete(p);
      else this.removed.add(p);
      out.push(p);
    }
    return out;
  }

  private move(target: string, refTarget: string, position: Position): OpResult {
    const src = this.resolve(target);
    const ref = this.resolve(refTarget);
    if (src.path !== ref.path) throw new EditError('invalid', 'verschieben nur innerhalb eines Dokuments');
    if (src.el === ref.el || isWithin(ref.el, src.el)) throw new EditError('invalid', 'ein Block wird nicht in sich selbst verschoben');
    const name = src.el.localName ?? '';
    this.guard(src.path, src.el, target, true);
    const parent = this.parentFor(ref, position);
    this.guard(ref.path, parent, refTarget);
    const allowed = name === 'li' ? new Set(['ul', 'ol']) : ['p', 'ul', 'ol', 'pre', 'blockquote', 'dl'].includes(name) ? PARA_PARENTS : FLOW_PARENTS;
    if (!allowed.has(parent.localName ?? '')) throw new EditError('invalid', `<${name}> kann nicht in <${parent.localName}> stehen`);
    this.touch(src.path);
    const oldParent = src.el.parentNode as Element;
    if (name === 'li' && childElements(oldParent).filter((c) => c.localName === 'li').length === 1 && oldParent !== parent) throw new EditError('invalid', `${target}: der letzte Listenpunkt; die Liste würde leer`);
    oldParent.removeChild(src.el);
    this.place(ref, position, src.el);
    const notes: string[] = [];
    if (name === 'section' || name === 'article') {
      const ids = [src.el.getAttribute('id') ?? ''];
      const texts = this.navTextsFor(src.path, ids);
      this.removeNavEntries(src.path, [src.el, ...descendants(src.el)].map((d) => d.getAttribute('id') ?? '').filter(Boolean));
      notes.push(...this.addNavEntry(src.path, src.el, texts.get(ids[0]!)));
    }
    return { op: 'move', target, summary: `${blockName(name)} ${target} verschoben (${position} ${refTarget})`, ...(notes.length ? { notes } : {}) };
  }

  private setListType(target: string, ordered: boolean, start?: number | null): OpResult {
    const { path, el } = this.resolve(target);
    if (el.localName !== 'ul' && el.localName !== 'ol') throw new EditError('invalid', `${target} ist keine Liste`);
    this.guard(path, el, target);
    const doc = this.touch(path);
    const n = el.localName === (ordered ? 'ol' : 'ul') ? el : this.rename(doc, el, ordered ? 'ol' : 'ul');
    if (!ordered) n.removeAttribute('start');
    else if (start === null) n.removeAttribute('start');
    else if (start !== undefined) {
      if (!Number.isInteger(start)) throw new EditError('invalid', 'start muss ganzzahlig sein');
      if (start === 1) n.removeAttribute('start');
      else n.setAttribute('start', String(start));
    }
    return { op: 'set-list-type', target, summary: `Liste ${target}: ${ordered ? `nummeriert${n.getAttribute('start') ? ` ab ${n.getAttribute('start')}` : ''}` : 'Aufzählung'}` };
  }

  private indent(target: string): OpResult {
    const { path, el } = this.resolve(target);
    if (el.localName !== 'li') throw new EditError('invalid', `${target} ist kein Listenpunkt`);
    this.guard(path, el, target);
    const doc = this.touch(path);
    const list = el.parentNode as Element;
    const prev = childElements(list).filter((c) => c.localName === 'li');
    const i = prev.indexOf(el);
    if (i === 0) throw new EditError('invalid', `${target}: der erste Punkt einer Liste kann nicht eingerückt werden`);
    const host = prev[i - 1]!;
    let sub = childElements(host).filter((c) => c.localName === 'ul' || c.localName === 'ol').pop();
    if (!sub) {
      sub = doc.createElementNS(XHTML_NS, list.localName ?? 'ul');
      host.appendChild(sub);
    }
    list.removeChild(el);
    sub.appendChild(el);
    return { op: 'indent', target, summary: `Listenpunkt ${target} eingerückt`, created: [pointerOf(el, path)] };
  }

  private outdent(target: string): OpResult {
    const { path, el } = this.resolve(target);
    if (el.localName !== 'li') throw new EditError('invalid', `${target} ist kein Listenpunkt`);
    const list = el.parentNode as Element;
    const host = list.parentNode as Element;
    if (host.localName !== 'li') throw new EditError('invalid', `${target} liegt auf der obersten Ebene`);
    this.guard(path, host, target);
    this.touch(path);
    // Following siblings become a sub-list of the moved item (keeps the order).
    const items = childElements(list).filter((c) => c.localName === 'li');
    const following = items.slice(items.indexOf(el) + 1);
    list.removeChild(el);
    if (following.length > 0) {
      const sub = el.ownerDocument!.createElementNS(XHTML_NS, list.localName ?? 'ul');
      for (const f of following) {
        list.removeChild(f);
        sub.appendChild(f);
      }
      el.appendChild(sub);
    }
    if (childElements(list).length === 0) host.removeChild(list);
    (host.parentNode as Element).insertBefore(el, host.nextSibling);
    return { op: 'outdent', target, summary: `Listenpunkt ${target} ausgerückt`, created: [pointerOf(el, path)] };
  }

  private tableOp(op: Extract<EditOp, { op: 'insert-row' | 'delete-row' | 'insert-column' | 'delete-column' }>): OpResult {
    const { path, el } = this.resolve(op.table);
    if (el.localName !== 'table') throw new EditError('invalid', `${op.table} ist keine Tabelle`);
    this.guard(path, el, op.table, true);
    const doc = this.touch(path);
    const g = buildGrid(el);
    switch (op.op) {
      case 'insert-row': {
        const at = op.at ?? g.rows.length + 1;
        insertRow(doc, el, at, op.cells ?? []);
        return { op: op.op, target: op.table, summary: `Tabelle ${op.table}: Zeile ${at} eingefügt` };
      }
      case 'delete-row': {
        const tr = g.rows[op.row - 1];
        if (tr && (tr.parentNode as Element).localName === 'thead' && g.rows.filter((r) => (r.parentNode as Element).localName === 'thead').length === 1) throw new EditError('invalid', `${op.table}: die einzige Kopfzeile bleibt (HP-MIN-006); die Tabelle als Ganzes löschen`);
        if (tr && [tr, ...descendants(tr)].some(isRedactionMark)) throw new EditError('redacted', `${op.table}: Zeile ${op.row} enthält eine Schwärzung`);
        deleteRow(doc, el, op.row);
        return { op: op.op, target: op.table, summary: `Tabelle ${op.table}: Zeile ${op.row} gelöscht` };
      }
      case 'insert-column': {
        const at = op.at ?? g.width + 1;
        insertColumn(doc, el, at, op.cells ?? []);
        return { op: op.op, target: op.table, summary: `Tabelle ${op.table}: Spalte ${at} eingefügt` };
      }
      case 'delete-column': {
        deleteColumn(doc, el, op.column);
        return { op: op.op, target: op.table, summary: `Tabelle ${op.table}: Spalte ${op.column} gelöscht` };
      }
    }
  }

  /** Inserts `node` into the own inline content of `el`, after the first occurrence of `after` (default: at the end). */
  private insertInline(el: Element, node: Node, after: string | undefined, where: string): void {
    const firstBlock = childElements(el).find(isBlockChild) ?? null;
    if (after === undefined || after === '') {
      el.insertBefore(node, firstBlock);
      return;
    }
    const texts: Node[] = [];
    const walk = (n: Node) => {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (isBlockChild(c)) continue;
        if (c.nodeType === 3) texts.push(c);
        else if (isElement(c) && c.localName !== 'a') walk(c);
      }
    };
    walk(el);
    for (const t of texts) {
      const v = t.nodeValue ?? '';
      const i = v.indexOf(after);
      if (i < 0) continue;
      const end = i + after.length;
      const rest = v.slice(end);
      t.nodeValue = v.slice(0, end);
      const parent = t.parentNode!;
      const next = t.nextSibling;
      parent.insertBefore(node, next);
      if (rest !== '') parent.insertBefore(el.ownerDocument!.createTextNode(rest), node.nextSibling);
      return;
    }
    throw new EditError('not-found', `${where}: Text „${after}“ kommt im Block nicht (innerhalb eines Textstücks) vor`);
  }

  private insertFootnote(target: string, after: string | undefined, input: { text?: string; inline?: string }): OpResult {
    const { path, el } = this.resolve(target);
    if (!TEXT_BLOCKS.has(el.localName ?? '') || /^h[1-6]$/.test(el.localName ?? '') || el.localName === 'pre') throw new EditError('invalid', `${target}: Fußnoten stehen in Absätzen, Listenpunkten oder Zellen`);
    if (ancestorElements(el).some(isFootnote)) throw new EditError('invalid', `${target}: keine Fußnote in einer Fußnote`);
    this.guard(path, el, target);
    const doc = this.touch(path);
    const ids = this.allocator(path);
    let n = 1;
    while (!ids.isFree(`fn-${n}`) || !ids.isFree(`fnref-${n}`)) n++;
    const fnId = `fn-${n}`;
    const refId = `fnref-${n}`;
    ids.reserve(fnId);
    ids.reserve(refId);
    const a = doc.createElementNS(XHTML_NS, 'a');
    a.setAttribute('id', refId);
    a.setAttribute('href', `#${fnId}`);
    a.setAttribute('role', 'doc-noteref');
    a.setAttributeNS(EPUB_NS, 'epub:type', 'noteref');
    a.appendChild(doc.createTextNode(String(descendants(doc).filter(isNoteRef).length + 1)));
    this.insertInline(el, a, after, target);
    const aside = doc.createElementNS(XHTML_NS, 'aside');
    aside.setAttribute('id', fnId);
    aside.setAttribute('role', 'doc-footnote');
    aside.setAttributeNS(EPUB_NS, 'epub:type', 'footnote');
    const p = doc.createElementNS(XHTML_NS, 'p');
    for (const node of this.inlineNodes(doc, input, `Fußnote zu ${target}`)) p.appendChild(node);
    if (textOf(p) === '') throw new EditError('invalid', 'eine Fußnote braucht Text');
    aside.appendChild(p);
    // After the flow block holding the reference, behind footnotes already there (HP-MIN-008).
    let block: Element = el;
    while (block.parentNode && isElement(block.parentNode) && !FLOW_PARENTS.has(block.parentNode.localName ?? '')) block = block.parentNode;
    let last: Node = block;
    for (let n = block.nextSibling; n; n = n.nextSibling) {
      if (n.nodeType === 3 && (n.nodeValue ?? '').trim() === '') continue;
      if (isElement(n) && isFootnote(n)) last = n;
      else break;
    }
    (block.parentNode as Element).insertBefore(aside, last.nextSibling);
    this.renumberNotes(doc);
    return { op: 'insert-footnote', target, summary: `Fußnote ${fnId} zu ${target} eingefügt`, created: [`${path}#${fnId}`, `${path}#${refId}`] };
  }

  private deleteFootnote(target: string): OpResult {
    const { path, el } = this.resolve(target);
    const fn = isFootnote(el) ? el : ancestorElements(el).find(isFootnote);
    if (!fn) throw new EditError('invalid', `${target} ist keine Fußnote`);
    const id = fn.getAttribute('id') ?? '';
    const doc = this.doc(path);
    const refs = descendants(doc).filter((a) => isNoteRef(a) && decodeURIComponent((a.getAttribute('href') ?? '').replace(/^[^#]*#/, '')) === id);
    this.guardRemoval(path, fn, target);
    for (const r of refs) this.guard(path, r, target);
    this.touch(path);
    for (const r of refs) {
      const rid = r.getAttribute('id');
      if (rid) this.allocator(path).reserve(rid);
      r.parentNode!.removeChild(r);
    }
    fn.parentNode!.removeChild(fn);
    this.allocator(path).reserve(id);
    this.renumberNotes(doc);
    return { op: 'delete-footnote', target, summary: `Fußnote ${id} gelöscht (${refs.length} Verweis${refs.length === 1 ? '' : 'e'})`, removed: [`${path}#${id}`] };
  }

  /** Numeric noteref labels follow document order (1, 2, 3 …); non-numeric labels stay. */
  private renumberNotes(doc: Document): void {
    const refs = descendants(doc).filter(isNoteRef);
    if (!refs.every((r) => /^\s*\d*\s*$/.test(textOf(r)))) return;
    const order = new Map<string, number>();
    for (const r of refs) {
      const id = (r.getAttribute('href') ?? '').replace(/^[^#]*#/, '');
      if (!order.has(id)) order.set(id, order.size + 1);
      while (r.firstChild) r.removeChild(r.firstChild);
      r.appendChild(doc.createTextNode(String(order.get(id))));
    }
  }

  private insertXref(target: string, to: string, after: string | undefined, text: string | undefined): OpResult {
    const { path, el } = this.resolve(target);
    if (!TEXT_BLOCKS.has(el.localName ?? '') || el.localName === 'pre') throw new EditError('invalid', `${target}: Querverweise stehen in Textblöcken`);
    this.guard(path, el, target);
    const dest = parsePointer(to, path);
    if (dest.steps.length > 0) throw new EditError('invalid', `${to}: Querverweise zeigen auf eine Kennung (HP-MIN-009), nicht auf einen Kindschritt`);
    const destDoc = this.doc(dest.path);
    const destEl = elementById(destDoc, dest.anchor);
    const cell = !destEl && dest.cell ? (() => {
      const t = elementById(destDoc, dest.cell!.table);
      return t ? cellAt(t, dest.cell!.row, dest.cell!.col) : undefined;
    })() : undefined;
    if (!destEl && !cell) throw new EditError('not-found', `${to}: kein Ziel mit dieser Kennung`);
    const label = text ?? xrefLabel(destEl ?? cell!);
    if (label.trim() === '') throw new EditError('invalid', `${to}: Ziel ohne Text; text angeben`);
    if (/\bSeite\s+\d+/i.test(label)) throw new EditError('invalid', 'Verweistext ohne Seitenzahl (HP-MIN-009): Adressen statt Seiten');
    const doc = this.touch(path);
    const a = doc.createElementNS(XHTML_NS, 'a');
    a.setAttribute('href', `${dest.path === path ? '' : relativeHref(path, dest.path)}#${dest.anchor}`);
    a.appendChild(doc.createTextNode(label));
    this.insertInline(el, a, after, target);
    return { op: 'insert-xref', target, summary: `Querverweis in ${target} auf ${dest.path}#${dest.anchor}`, detail: `„${short(label)}“` };
  }

  private setImage(target: string, op: { alt?: string; src?: string; media?: MediaInput }): OpResult {
    const { path, el } = this.resolve(target);
    const img = el.localName === 'img' ? el : descendants(el).find((d) => d.localName === 'img');
    if (!img) throw new EditError('invalid', `${target} enthält kein Bild`);
    this.guard(path, img, target);
    this.touch(path);
    const parts: string[] = [];
    if (op.src !== undefined || op.media !== undefined) {
      const old = resolveHref(path, img.getAttribute('src') ?? '')?.path;
      img.setAttribute('src', this.mediaSource(path, op.src, op.media));
      parts.push('Bilddatei ersetzt');
      if (old) parts.push(...this.dropUnusedMedia([old]).map((p) => `${p} entfernt`));
    }
    if (op.alt !== undefined) {
      if (op.alt.trim() === '' && img.getAttribute('alt') !== '') throw new EditError('invalid', 'Alternativtext darf nicht leer werden (HP-INH-006)');
      img.setAttribute('alt', op.alt);
      parts.push('Alternativtext geändert');
    }
    if (parts.length === 0) throw new EditError('invalid', 'set-image: alt, src oder media angeben');
    return { op: 'set-image', target, summary: `Bild ${target}: ${parts.join(', ')}` };
  }

  private setTitle(title: string): OpResult {
    if (title.trim() === '') throw new EditError('invalid', 'der Titel darf nicht leer sein');
    const old = this.title;
    this.title = title;
    this.titleChanged = true;
    for (const p of [...this.contentPaths(), ...(this.navPath ? [this.navPath] : [])]) {
      const doc = this.doc(p);
      for (const t of descendants(doc).filter((e) => e.localName === 'title')) {
        if (textOf(t) === old.replace(/\s+/g, ' ').trim()) {
          while (t.firstChild) t.removeChild(t.firstChild);
          t.appendChild(doc.createTextNode(title));
          this.touch(p);
        }
      }
    }
    return { op: 'set-title', summary: 'Titel geändert', detail: `„${short(old)}“ → „${short(title)}“` };
  }

  // -------------------------------------------------------------------------------------------
  // Navigation

  private navLinks(path: string, ids: readonly string[]): Element[] {
    if (!this.navPath) return [];
    const nav = this.navDoc();
    return descendants(nav).filter((a) => {
      if (a.localName !== 'a') return false;
      const t = resolveHref(this.navPath!, a.getAttribute('href') ?? '');
      return !!t && t.path === path && ids.includes(decodeURIComponent(t.fragment));
    });
  }

  private navTextsFor(path: string, ids: readonly string[]): Map<string, string> {
    const out = new Map<string, string>();
    for (const a of this.navLinks(path, ids)) {
      const t = resolveHref(this.navPath!, a.getAttribute('href') ?? '');
      if (t) out.set(decodeURIComponent(t.fragment), textOf(a));
    }
    return out;
  }

  private syncNavText(path: string, heading: Element, oldText: string, newText: string): string[] {
    const ids = [heading.getAttribute('id') ?? ''];
    const section = heading.parentNode as Element;
    if (['section', 'article'].includes(section.localName ?? '') && childElements(section).find((c) => /^h[1-6]$/.test(c.localName ?? '')) === heading) ids.push(section.getAttribute('id') ?? '');
    const links = this.navLinks(path, ids.filter(Boolean));
    const notes: string[] = [];
    for (const a of links) {
      if (textOf(a) !== oldText) {
        notes.push(`Inhaltsverzeichnis-Eintrag „${short(textOf(a))}“ weicht von der Überschrift ab und bleibt`);
        continue;
      }
      while (a.firstChild) a.removeChild(a.firstChild);
      a.appendChild(a.ownerDocument!.createTextNode(newText));
      this.touch(this.navPath!);
      notes.push('Inhaltsverzeichnis nachgeführt');
    }
    return notes;
  }

  private removeNavEntries(path: string, ids: readonly string[]): void {
    for (const a of this.navLinks(path, ids)) {
      const li = a.parentNode as Element;
      if (li.localName !== 'li') continue;
      const list = li.parentNode as Element;
      // Child entries of a removed entry move up when their target still exists.
      const sub = childElements(li).find((c) => c.localName === 'ol');
      if (sub) for (const c of childElements(sub)) list.insertBefore(c, li);
      list.removeChild(li);
      if (childElements(list).length === 0 && list.parentNode && (list.parentNode as Element).localName === 'li') list.parentNode.removeChild(list);
      this.touch(this.navPath!);
    }
  }

  /** Adds a navigation entry for a section: top-level always (HP-ADR-007), nested when its parent has one. */
  private addNavEntry(path: string, section: Element, label?: string): string[] {
    if (!this.navPath || !this.container.files.has(this.navPath)) return [];
    const id = section.getAttribute('id');
    if (!id) return [];
    const parentSection = ancestorElements(section).find((a) => ['section', 'article'].includes(a.localName ?? ''));
    const nav = this.navDoc();
    const toc = descendants(nav).find((e) => e.localName === 'nav' && (e.getAttributeNS(EPUB_NS, 'type') ?? '').split(/\s+/).includes('toc'));
    if (!toc) return [];
    let list: Element | undefined;
    if (parentSection) {
      const parentLink = this.navLinks(path, [parentSection.getAttribute('id') ?? '']).find(Boolean);
      if (!parentLink) return [];
      const li = parentLink.parentNode as Element;
      list = childElements(li).find((c) => c.localName === 'ol');
      if (!list) {
        list = nav.createElementNS(XHTML_NS, 'ol');
        li.appendChild(list);
      }
    } else list = childElements(toc).find((c) => c.localName === 'ol');
    if (!list) return [];
    const heading = childElements(section).find((c) => /^h[1-6]$/.test(c.localName ?? ''));
    const li = nav.createElementNS(XHTML_NS, 'li');
    const a = nav.createElementNS(XHTML_NS, 'a');
    a.setAttribute('href', `${relativeHref(this.navPath, path)}#${id}`);
    a.appendChild(nav.createTextNode(label ?? (heading ? textOf(heading) : id)));
    li.appendChild(a);
    // Position: after the entry of the previous sibling section, else before the next one, else at the end of the document's entries.
    const siblings = childElements(section.parentNode as Element).filter((c) => ['section', 'article'].includes(c.localName ?? '') && c.getAttribute('id'));
    const i = siblings.indexOf(section);
    const entryOf = (s: Element) => childElements(list!).find((x) => childElements(x).some((y) => y.localName === 'a' && this.navLinks(path, [s.getAttribute('id')!]).includes(y)));
    const prev = siblings.slice(0, i).reverse().map(entryOf).find(Boolean);
    const next = siblings.slice(i + 1).map(entryOf).find(Boolean);
    if (prev) list.insertBefore(li, prev.nextSibling);
    else if (next) list.insertBefore(li, next);
    else {
      const sameDoc = childElements(list).filter((x) => childElements(x).some((y) => y.localName === 'a' && resolveHref(this.navPath!, y.getAttribute('href') ?? '')?.path === path));
      const last = sameDoc[sameDoc.length - 1];
      list.insertBefore(li, last ? last.nextSibling : null);
    }
    this.touch(this.navPath);
    return ['Inhaltsverzeichnis ergänzt'];
  }

  // -------------------------------------------------------------------------------------------
  // Saving

  async save(options: SaveOptions): Promise<SaveResult> {
    if (!UTC_RE.test(options.at) || Number.isNaN(Date.parse(options.at))) throw new EditError('invalid', `at must be YYYY-MM-DDThh:mm:ssZ, got ${options.at}`);
    if (this.results.length === 0) throw new EditError('invalid', 'nichts geändert');
    const prev = typeof this.manifest.dateModified === 'string' ? Date.parse(this.manifest.dateModified) : NaN;
    if (!Number.isNaN(prev) && Date.parse(options.at) < prev) throw new EditError('invalid', `at ${options.at} liegt vor dateModified ${String(this.manifest.dateModified)}`);
    this.checkNewProblems();
    const c = this.container;
    const changed = new Map<string, Uint8Array>();
    for (const [p, d] of this.docs) {
      if (!d.dirty) continue;
      const out = serializeXml(d.doc, d.text);
      if (out !== d.text) changed.set(p, utf8(out));
    }
    // package.opf: items for added and removed files, title, dcterms:modified.
    let opf = fromUtf8(c.files.get(c.packagePath)!);
    for (const p of this.removed) opf = opf.replace(new RegExp(`\\s*<item\\b[^>]*\\bhref="${escapeRe(encodeURI(p))}"[^>]*/>`), '').replace(new RegExp(`\\s*<item\\b[^>]*\\bhref="${escapeRe(p)}"[^>]*/>`), '');
    const itemIds = new Set([...opf.matchAll(/<item\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]));
    const items: string[] = [];
    let k = 0;
    for (const [p, f] of [...this.added].sort(([a], [b]) => (a < b ? -1 : 1))) {
      let id: string;
      do id = `edit-${++k}`;
      while (itemIds.has(id));
      items.push(`    <item id="${id}" href="${p}" media-type="${f.type}"/>`);
    }
    if (items.length > 0) {
      const close = opf.lastIndexOf('</manifest>');
      const lineStart = opf.lastIndexOf('\n', close) + 1;
      opf = opf.slice(0, lineStart) + items.join('\n') + '\n' + opf.slice(lineStart);
    }
    if (this.titleChanged) opf = opf.replace(/(<dc:title\b[^>]*>)[^<]*(<\/dc:title>)/, `$1${escapeXml(this.title)}$2`);
    changed.set(c.packagePath, utf8(opfWithModified(opf, options.at)));

    const history = Array.isArray(this.manifest.history) ? [...(this.manifest.history as Json[])] : [];
    const version = history.length > 0 ? Math.max(...history.map((h) => Number(h.version) || 0)) + 1 : 1;
    const note = options.note ?? noteOf(this.results);
    history.push({ version, dateModified: options.at, note, manifestIntegrity: await sriSha256(c.files.get('manifest.json')!) });
    const resources: Json[] = [];
    for (const r of this.manifest.resources as Json[]) {
      const url = String(r.url);
      if (this.removed.has(url)) continue;
      resources.push(changed.has(url) ? { ...r, integrity: await sriSha256(changed.get(url)!) } : r);
    }
    for (const [p, f] of this.added) resources.push({ url: p, type: f.type, integrity: await sriSha256(f.data) });
    resources.sort((a, b) => (String(a.url) < String(b.url) ? -1 : String(a.url) > String(b.url) ? 1 : 0));
    const manifest: Json = { ...this.manifest, ...(this.titleChanged ? { name: this.title } : {}), resources, dateModified: options.at, history };
    const entries: ZipEntryInput[] = c.entries
      .filter((e) => !e.name.endsWith('/') && !this.removed.has(e.name))
      .map((e) => ({ name: e.name, data: e.name === 'manifest.json' ? utf8(JSON.stringify(manifest, null, 2) + '\n') : (changed.get(e.name) ?? e.data), compression: e.name === 'mimetype' ? 'store' : 'auto' }));
    for (const [p, f] of [...this.added].sort(([a], [b]) => (a < b ? -1 : 1))) entries.push({ name: p, data: f.data, compression: 'auto' });
    let bytes: Uint8Array = await writeZip(entries, { modified: new Date(options.at) });
    if (options.journal !== false) bytes = await recordVersion(c, bytes, { create: true, keepMedia: options.keepMedia ?? true });
    else bytes = await recordVersion(c, bytes, {});
    const back = await readContainer(bytes);
    if (!back.integrity.ok) throw new EditError('invalid', 'internal error: written container does not verify');
    return {
      bytes,
      version,
      results: [...this.results],
      changedFiles: [...changed.keys()].sort(),
      addedFiles: [...this.added.keys()].sort(),
      removedFiles: [...this.removed].sort(),
    };
  }
}

/** Opens, applies `ops` and saves in one step. */
export async function editContainer(bytes: Uint8Array, ops: readonly EditOp[], options: SaveOptions): Promise<SaveResult> {
  const s = await EditSession.open(bytes);
  s.applyAll(ops);
  return s.save(options);
}

function ancestorElements(el: Node): Element[] {
  const out: Element[] = [];
  for (let p = el.parentNode; p && isElement(p); p = p.parentNode) out.push(p);
  return out;
}

function isInsideNav(el: Element): boolean {
  return ancestorElements(el).some((a) => a.localName === 'nav');
}

function isWithin(node: Node, ancestor: Node): boolean {
  for (let p: Node | null = node; p; p = p.parentNode) if (p === ancestor) return true;
  return false;
}

/** Inline (non-block) children of a text block. */
function inlineChildren(el: Element): Node[] {
  const out: Node[] = [];
  for (let c = el.firstChild; c; c = c.nextSibling) if (!isBlockChild(c)) out.push(c);
  return out;
}

function xrefLabel(el: Element): string {
  const name = el.localName ?? '';
  if (/^h[1-6]$/.test(name)) return textOf(el);
  if (name === 'section' || name === 'article') {
    const h = childElements(el).find((c) => /^h[1-6]$/.test(c.localName ?? ''));
    return h ? textOf(h) : '';
  }
  if (name === 'table') {
    const cap = childElements(el).find((c) => c.localName === 'caption');
    return cap ? textOf(cap) : '';
  }
  if (name === 'figure') {
    const cap = childElements(el).find((c) => c.localName === 'figcaption');
    return cap ? textOf(cap) : '';
  }
  return textOf(el).slice(0, 60);
}

function blockName(tag: string): string {
  if (/^h[1-6]$/.test(tag)) return 'Überschrift';
  return (
    { p: 'Absatz', li: 'Listenpunkt', ul: 'Liste', ol: 'Liste', table: 'Tabelle', td: 'Zelle', th: 'Kopfzelle', caption: 'Tabellenbeschriftung', figure: 'Abbildung', figcaption: 'Bildunterschrift', img: 'Bild', section: 'Abschnitt', article: 'Abschnitt', aside: 'Randnotiz', pre: 'Codeblock', blockquote: 'Zitat', summary: 'Zusammenfassung', details: 'Aufklappbereich', dt: 'Begriff', dd: 'Erklärung' } as Record<string, string>
  )[tag] ?? `<${tag}>`;
}

function short(s: string, n = 60): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

function noteOf(results: readonly OpResult[]): string {
  const parts = results.map((r) => r.summary);
  let s = `Bearbeitet (${results.length} Änderung${results.length === 1 ? '' : 'en'}): ${parts.join('; ')}`;
  if (s.length > 600) s = s.slice(0, 599) + '…';
  return s;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

