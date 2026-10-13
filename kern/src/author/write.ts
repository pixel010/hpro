/**
 * Writer of the author path (S5): document model + template → container input.
 *
 * The mapping is the one of part 0, section 15 and the author's guide (part 5, chapters 3 and 4.7):
 * - one content document `content/index.xhtml`; the title is `h1`, every `h2` opens a `section`
 *   with kennung `s-<kennung der Überschrift>` (HP-ADR-001, HP-ADR-007), deeper headings stay flat;
 * - kennungen from marks of the source (bookmarks, `{#…}`) when they fit HP-ADR-002, else from the
 *   text; unique and deterministic (HP-MIN-004);
 * - footnotes as `a role="doc-noteref"` + `aside role="doc-footnote"` after the block of the
 *   reference, endnotes in `section role="doc-endnotes"` at the end (HP-MIN-008);
 * - tables with `thead`/`th scope="col"`, spans, `caption`, equal width per row, `data-hp-table`
 *   (HP-MIN-006); figures with `img alt` and `figcaption`, images under `content/media/` (HP-MIN-007);
 * - references resolved to `#kennung`, page references show the target text (HP-MIN-009).
 * The template contributes stylesheet, header lines, required fields and sections, and decides
 * whether the result claims the office minimum profile (HP-MIN-001).
 */
import type { DocumentInput, ResourceInput } from '../container.js';
import { SUBSET_OFFICE_MIN } from '../container.js';
import { escapeXml } from '../ocf.js';
import type { TocEntry } from '../ocf.js';
import { Messages, plain, type AuthorSource, type Block, type Cell, type Inline, type Message } from './model.js';
import type { Template } from './templates.js';

export const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]*$/;
const ID_MAX = 48;

/** Kennung from text: NFC, umlauts transcribed, lower case, `[^a-z0-9]+` → `-`, at most 48 characters. */
export function slugify(text: string, fallback = 'abschnitt'): string {
  let t = text.normalize('NFC').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  t = t.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!t) t = fallback;
  if (!/^[a-z]/.test(t)) t = `${fallback}-${t}`;
  return t.slice(0, ID_MAX).replace(/[-.]+$/, '');
}

export interface WriteOptions {
  /** Source file, kept under `original/` (HP-META-005) and basis of a derived id. */
  readonly sourceBytes?: Uint8Array;
  readonly sourceName?: string;
  /** Keep the source under `original/` (Soll). Default true when `sourceBytes` is given. */
  readonly keepOriginal?: boolean;
  /** Overrides (command line) for the metadata of the source. */
  readonly id?: string;
  readonly modified?: string;
  readonly language?: string;
  /** Field values that override the source's fields. */
  readonly fields?: Readonly<Record<string, string | readonly string[]>>;
}

export interface WriteResult {
  readonly document: DocumentInput;
  /** Messages of reader and writer; `fehler` means the template rules are not met. */
  readonly messages: readonly Message[];
  /** What the document contains after writing (headings, tables, figures, footnotes …). */
  readonly counts: Readonly<Record<string, number>>;
  readonly officeMin: boolean;
  readonly xhtml: string;
}

const MEDIA_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** `YYYY-MM-DD…` → „13. Oktober 2026“ for German, else the date part unchanged. */
export function formatDate(value: string, language: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m || !language.toLowerCase().startsWith('de')) return m ? `${m[1]}-${m[2]}-${m[3]}` : value;
  return `${Number(m[3])}. ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** `YYYY-MM-DD` or an ISO timestamp → `YYYY-MM-DDThh:mm:ssZ` (UTC), or undefined. */
export function normalizeDate(value: string): string | undefined {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? undefined : `${v}T00:00:00Z`;
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 19) + 'Z';
}

async function uuidFromBytes(bytes: Uint8Array): Promise<string> {
  // RFC 9562 UUIDv8 from SHA-256 of the source: the same source gives the same id (HP-CONT-014).
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
  h[6] = (h[6]! & 0x0f) | 0x80;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = [...h.subarray(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `urn:uuid:${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

const normHeading = (s: string) => s.replace(/^\s*(\d+(\.\d+)*\.?|[IVX]+\.)\s+/, '').trim().toLowerCase();

interface Ctx {
  /** Footnotes waiting to be written after the current flow block. */
  pending: string[];
  /** Inside a note: nested notes are not possible. */
  inNote: boolean;
}

/** Writes the document. Never throws for content problems; they are messages. */
export async function writeDocument(source: AuthorSource, template: Template, options: WriteOptions = {}): Promise<WriteResult> {
  const msg = new Messages();
  for (const m of source.messages) for (let i = 0; i < (m.count ?? 1); i++) msg.add(m.code, m.category, m.severity, m.text);
  // Fields of the template from the source's own metadata where the source has no field of that name.
  const fromMeta: Record<string, string | readonly string[]> = {
    ...(source.meta.title ? { titel: source.meta.title } : {}),
    ...(source.meta.creators && source.meta.creators.length > 0 ? { autoren: source.meta.creators } : {}),
    ...(source.meta.modified ? { datum: source.meta.modified } : {}),
  };
  const fields: Record<string, string | readonly string[]> = { ...fromMeta, ...(source.meta.fields ?? {}), ...(options.fields ?? {}) };
  const language = options.language ?? source.meta.language ?? (typeof fields.sprache === 'string' ? fields.sprache : undefined) ?? template.language;
  const counts: Record<string, number> = {};
  const count = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n);

  // ---------------------------------------------------------------- metadata (HP-META-001)
  let modified = options.modified ?? source.meta.modified;
  if (!modified) {
    modified = new Date().toISOString().slice(0, 19) + 'Z';
    msg.add('datum-fehlt', 'metadaten', 'hinweis', 'Kein Änderungsdatum in der Quelle; Uhrzeit des Laufs verwendet – zwei Läufe ergeben dann verschiedene Dateien (HP-CONT-014).');
  }
  let id = options.id ?? source.meta.id;
  if (!id) {
    id = options.sourceBytes ? await uuidFromBytes(options.sourceBytes) : `urn:uuid:${crypto.randomUUID()}`;
    msg.add('kennung-abgeleitet', 'metadaten', 'hinweis', `Keine Dokumentkennung in der Quelle; ${options.sourceBytes ? 'aus dem Inhalt der Quelldatei abgeleitet' : 'zufällig erzeugt'}: ${id}. Eintragen, damit spätere Fassungen dieselbe Kennung tragen (HP-META-001).`);
  } else if (!/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    msg.add('kennung-keine-uuid', 'metadaten', 'hinweis', `Dokumentkennung „${id}“ ist keine UUID-URN (HP-META-001 empfiehlt urn:uuid:).`);
  }
  const fieldText = (k: string): string => {
    const v = fields[k];
    if (v === undefined) return '';
    return typeof v === 'string' ? v.trim() : v.join(', ');
  };
  for (const f of template.fields) {
    if (f.key === 'titel' || f.key === 'datum') continue; // checked below with the source's own metadata
    if (f.required && !fieldText(f.key)) msg.add('feld-fehlt', 'vorlage', 'fehler', `Vorlage „${template.name}“: Pflichtfeld „${f.key}“ (${f.label}) fehlt.`);
  }
  if (template.fields.some((f) => f.key === 'datum' && f.required) && !fieldText('datum') && !source.meta.modified && !options.modified) {
    msg.add('feld-fehlt', 'vorlage', 'fehler', `Vorlage „${template.name}“: Pflichtfeld „datum“ fehlt.`);
  }

  const blocks = [...source.blocks];
  const untitled = source.untitled === true;
  /** Level of the headings that open a section: h2 under a title, h1 without (table 15.2). */
  const top = untitled ? 1 : 2;
  let titleBlock: Extract<Block, { t: 'heading' }> | undefined;
  if (!untitled && blocks[0]?.t === 'heading' && blocks[0].level === 1) titleBlock = blocks.shift() as Extract<Block, { t: 'heading' }>;
  const titleField = template.titleField ?? 'titel';
  const firstHeading = blocks.find((b) => b.t === 'heading') as Extract<Block, { t: 'heading' }> | undefined;
  const title = (fieldText(titleField) || source.meta.title || (titleBlock ? plain(titleBlock.c) : '') || (untitled && firstHeading ? plain(firstHeading.c) : '')).trim();
  if (!title) msg.add('titel-fehlt', 'vorlage', 'fehler', `Kein Titel: weder Feld „${titleField}“ noch Überschrift der Ebene 1 noch Titel in den Dokumenteigenschaften.`);

  // ---------------------------------------------------------------- kennungen
  const used = new Set<string>();
  const marks = new Map<string, { id: string; text: string }>();
  const take = (base: string): string => {
    let c = base.slice(0, 64);
    for (let n = 2; used.has(c); n++) c = `${base.slice(0, ID_MAX - String(n).length - 1)}-${n}`;
    used.add(c);
    return c;
  };
  /** Kennung for a block: first mark that fits HP-ADR-002, else the slug; all marks point to it. */
  const idFor = (blockMarks: readonly string[] | undefined, fallbackBase: string, textValue: string): string => {
    const own = (blockMarks ?? []).find((m) => ID_PATTERN.test(m) && m.length <= 64 && !used.has(m));
    const got = own ? take(own) : take(fallbackBase);
    // A leading U+0001 marks an automatic bookmark of the source program: target name, never kennung.
    for (const m of blockMarks ?? []) if (!marks.has(m.replace(/^\u0001/, ''))) marks.set(m.replace(/^\u0001/, ''), { id: got, text: textValue });
    marks.set(got, { id: got, text: textValue });
    return got;
  };

  // ---------------------------------------------------------------- inline
  const refs: Array<{ placeholder: string; target: string; html: string; page: boolean }> = [];
  const endnotes: string[] = [];
  let footnoteNo = 0;
  let endnoteNo = 0;
  let usedOutsideMin = false;

  const inline = (c: readonly Inline[], ctx: Ctx): string => {
    let h = '';
    for (const i of c) {
      switch (i.t) {
        case 'text':
          h += escapeXml(i.v);
          break;
        case 'em':
        case 'strong':
        case 'sub':
        case 'sup':
          h += `<${i.t}>${inline(i.c, ctx)}</${i.t}>`;
          break;
        case 'span': {
          const inner = inline(i.c, ctx);
          const a = `${i.style ? ` data-hp-style="${escapeXml(i.style)}"` : ''}${i.cls ? ` class="${escapeXml(i.cls)}"` : ''}`;
          h += a ? `<span${a}>${inner}</span>` : inner;
          break;
        }
        case 'code':
          h += `<code>${escapeXml(i.v)}</code>`;
          break;
        case 'br':
          h += '<br/>';
          break;
        case 'link': {
          const inner = inline(i.c, ctx);
          if (/^https?:\/\/\S+$/i.test(i.href)) h += `<a href="${escapeXml(i.href)}">${inner}</a>`;
          else if (i.href.startsWith('#')) {
            const ph = `\u0000REF${refs.length}\u0000`;
            refs.push({ placeholder: ph, target: decodeURIComponent(i.href.slice(1)), html: inner, page: false });
            h += ph;
          } else {
            h += inner;
            msg.add('verweis-kein-http', 'verweis', 'ersatz', `Verweis „${i.href}“ ist weder http(s) noch ein Ziel im Dokument; als Text übernommen (HP-MIN-009).`);
          }
          count('link');
          break;
        }
        case 'ref': {
          const ph = `\u0000REF${refs.length}\u0000`;
          refs.push({ placeholder: ph, target: i.target, html: inline(i.c, ctx), page: i.page === true });
          h += ph;
          count('ref');
          break;
        }
        case 'mark': {
          if (marks.has(i.name.replace(/^\u0001/, ''))) break;
          const mid = idFor([i.name], slugify(i.name, 'marke'), '');
          h += `<span id="${mid}"></span>`;
          break;
        }
        case 'note': {
          if (ctx.inNote) {
            msg.add('notiz-in-notiz', 'fussnote', 'verlust', 'Fußnote in einer Fußnote: innere Fußnote ausgelassen.');
            break;
          }
          const isEnd = i.kind === 'endnote';
          const n = isEnd ? ++endnoteNo : ++footnoteNo;
          const nid = idFor(i.name ? [i.name] : undefined, isEnd ? `en-${n}` : `fn-${n}`, '');
          const label = escapeXml(i.label ?? String(n));
          const noteCtx: Ctx = { pending: [], inNote: true };
          const body = i.blocks.map((b) => renderBlock(b, noteCtx, '').trimEnd()).join('');
          h += `<a href="#${nid}" role="doc-noteref" epub:type="noteref" id="${take(`${nid}-ref`)}">${label}</a>`;
          if (isEnd) endnotes.push(`      <li id="${nid}">${body || '<p></p>'}</li>\n`), count('endnote');
          else ctx.pending.push(`<aside id="${nid}" role="doc-footnote" epub:type="footnote">${body || '<p></p>'}</aside>`), count('footnote');
          break;
        }
      }
    }
    return h;
  };

  // ---------------------------------------------------------------- blocks
  let tableNo = 0;
  let figureNo = 0;
  let preNo = 0;
  const media: ResourceInput[] = [];
  const mediaNames = new Set<string>();
  const styleAttr = (s?: string) => (s ? ` data-hp-style="${escapeXml(s)}"` : '');

  const cellHtml = (cell: Cell, ctx: Ctx): string => {
    if (cell.c.length === 1 && cell.c[0]!.t === 'p') return inline(cell.c[0]!.c, ctx);
    return cell.c.map((b) => renderBlock(b, ctx, '').trimEnd()).join('');
  };

  const listHtml = (b: Extract<Block, { t: 'list' }>, ctx: Ctx, pad: string): string => {
    const tag = b.ordered ? 'ol' : 'ul';
    let h = `${pad}<${tag}${b.ordered && b.start !== undefined && b.start !== 1 ? ` start="${b.start}"` : ''}${styleAttr(b.style)}>\n`;
    for (const item of b.items) {
      const [first, ...rest] = item;
      if (first?.t === 'p' && rest.every((r) => r.t === 'list')) {
        const marksHtml = (first.marks ?? []).filter((m) => !marks.has(m)).map((m) => `<span id="${idFor([m], slugify(m, 'marke'), plain(first.c))}"></span>`).join('');
        h += `${pad}  <li>${marksHtml}${inline(first.c, ctx)}`;
        if (rest.length > 0) h += `\n${rest.map((r) => listHtml(r as Extract<Block, { t: 'list' }>, ctx, pad + '    ')).join('')}${pad}  `;
        h += '</li>\n';
      } else h += `${pad}  <li>${item.map((x) => renderBlock(x, ctx, '').trimEnd()).join('')}</li>\n`;
    }
    count('list');
    return h + `${pad}</${tag}>\n`;
  };

  const tableHtml = (b: Extract<Block, { t: 'table' }>, ctx: Ctx, pad: string): string => {
    tableNo++;
    const captionText = b.caption ? plain(b.caption) : '';
    const tid = idFor(b.marks, `tabelle-${tableNo}`, captionText || `Tabelle ${tableNo}`);
    // Column count with spans; rows that come out narrower get empty cells (HP-MIN-006).
    const rows = [...b.head.map((r) => ({ r, head: true })), ...b.body.map((r) => ({ r, head: false }))];
    const occupied: number[][] = rows.map(() => []);
    const widths: number[] = [];
    rows.forEach(({ r }, ri) => {
      let col = 0;
      for (const cell of r) {
        while (occupied[ri]!.includes(col)) col++;
        const cs = Math.max(1, cell.colspan ?? 1);
        const rs = Math.max(1, cell.rowspan ?? 1);
        for (let dr = 0; dr < rs && ri + dr < rows.length; dr++) for (let dc = 0; dc < cs; dc++) occupied[ri + dr]!.push(col + dc);
        col += cs;
      }
    });
    rows.forEach((_, ri) => widths.push(occupied[ri]!.length === 0 ? 0 : Math.max(...occupied[ri]!) + 1));
    const width = Math.max(1, ...widths);
    const rowHtml = (cells: readonly Cell[], ri: number, head: boolean): string => {
      let h = `${pad}    <tr>`;
      for (const cell of cells) {
        const span = `${(cell.colspan ?? 1) > 1 ? ` colspan="${cell.colspan}"` : ''}${(cell.rowspan ?? 1) > 1 ? ` rowspan="${cell.rowspan}"` : ''}`;
        if (head) h += `<th scope="col"${span}>${cellHtml(cell, ctx)}</th>`;
        else if (cell.rowHeader) h += `<th scope="row"${span}>${cellHtml(cell, ctx)}</th>`;
        else h += `<td${span}>${cellHtml(cell, ctx)}</td>`;
        count('cell');
      }
      const filled = new Set(occupied[ri]).size;
      if (filled < width) {
        h += (head ? '<th scope="col"></th>' : '<td></td>').repeat(width - filled);
        msg.add('tabelle-aufgefuellt', 'tabelle', 'ersatz', `Tabelle ${tid}: Zeile ${ri + 1} hatte ${filled} statt ${width} Spalten; leere Zellen ergänzt (HP-MIN-006).`);
      }
      return h + '</tr>\n';
    };
    let h = `${pad}<table id="${tid}" data-hp-table="scroll"${styleAttr(b.style)}>\n`;
    if (b.caption) h += `${pad}  <caption>${inline(b.caption, ctx)}</caption>\n`;
    else msg.add('tabelle-ohne-beschriftung', 'tabelle', 'hinweis', `Tabelle ${tid} hat in der Quelle keine Beschriftung; ohne caption übernommen (HP-INH-008).`);
    if (b.head.length > 0) h += `${pad}  <thead>\n${b.head.map((r, i) => rowHtml(r, i, true)).join('')}${pad}  </thead>\n`;
    h += `${pad}  <tbody>\n${b.body.map((r, i) => rowHtml(r, i + b.head.length, false)).join('')}${pad}  </tbody>\n${pad}</table>\n`;
    count('table');
    return h;
  };

  const figureHtml = (b: Extract<Block, { t: 'figure' }>, ctx: Ctx, pad: string): string => {
    figureNo++;
    const ext = MEDIA_EXT[b.image.mediaType];
    const captionText = b.caption ? plain(b.caption) : '';
    if (!ext) {
      msg.add('bild-format', 'bild', 'verlust', `Bild „${b.image.name}“ (${b.image.mediaType}) ist kein Kernmedientyp; ausgelassen (HP-MIN-007).`);
      return `${pad}<p class="hp-import-luecke">[Bild „${escapeXml(b.image.name)}“ nicht übernommen${captionText ? `: ${escapeXml(captionText)}` : ''}]</p>\n`;
    }
    const fid = idFor(b.marks, `abbildung-${figureNo}`, captionText || `Abbildung ${figureNo}`);
    let file = slugify(b.image.name.replace(/\.[A-Za-z0-9]+$/, ''), 'bild');
    for (let n = 2; mediaNames.has(`${file}.${ext}`); n++) file = `${slugify(b.image.name.replace(/\.[A-Za-z0-9]+$/, ''), 'bild')}-${n}`;
    mediaNames.add(`${file}.${ext}`);
    media.push({ path: `content/media/${file}.${ext}`, mediaType: b.image.mediaType, data: b.image.data });
    let alt: string;
    if (b.decorative) alt = '';
    else if (b.alt && b.alt.trim()) alt = b.alt.trim();
    else {
      alt = captionText || b.image.name;
      msg.add('bild-ohne-alternativtext', 'bild', 'ersatz', `Bild „${b.image.name}“ hat keinen Alternativtext und ist nicht als dekorativ markiert; alt aus ${captionText ? 'der Beschriftung' : 'dem Namen'} gesetzt – bitte nachtragen (HP-MIN-007).`);
    }
    const size = b.width && b.height ? ` width="${Math.round(b.width)}" height="${Math.round(b.height)}"` : '';
    count('figure');
    return `${pad}<figure id="${fid}"${styleAttr(b.style)}><img src="media/${file}.${ext}" alt="${escapeXml(alt)}"${size}/>${b.caption ? `<figcaption>${inline(b.caption, ctx)}</figcaption>` : ''}</figure>\n`;
  };

  /** One block; footnotes collect in ctx.pending. */
  function renderBlock(b: Block, ctx: Ctx, pad: string): string {
    switch (b.t) {
      case 'heading': {
        const level = Math.min(6, Math.max(top, b.level));
        const t = plain(b.c);
        const hid = idFor(b.marks, slugify(t), t);
        count('heading');
        return `${pad}<h${level} id="${hid}"${styleAttr(b.style)}>${inline(b.c, ctx)}</h${level}>\n`;
      }
      case 'p': {
        const pid = b.marks && b.marks.length > 0 ? idFor(b.marks, slugify(b.marks[0]!, 'marke'), plain(b.c)) : undefined;
        count('paragraph');
        return `${pad}<p${pid ? ` id="${pid}"` : ''}${styleAttr(b.style)}>${inline(b.c, ctx)}</p>\n`;
      }
      case 'quote':
        return `${pad}<blockquote${styleAttr(b.style)}>${b.blocks.map((x) => renderBlock(x, ctx, '').trimEnd()).join('')}</blockquote>\n`;
      case 'pre': {
        preNo++;
        const first = b.text.split('\n')[0] ?? '';
        const pid = idFor(b.marks, slugify(first.slice(0, 40), `code-${preNo}`), first);
        count('pre');
        return `${pad}<pre id="${pid}"${b.lang ? ` class="language-${escapeXml(b.lang.replace(/[^A-Za-z0-9_-]/g, ''))}"` : ''}${styleAttr(b.style)}>${escapeXml(b.text)}</pre>\n`;
      }
      case 'list':
        return listHtml(b, ctx, pad);
      case 'table':
        return tableHtml(b, ctx, pad);
      case 'figure':
        return figureHtml(b, ctx, pad);
      case 'details': {
        usedOutsideMin = true;
        const s = plain(b.summary);
        const did = idFor(b.marks, slugify(s, 'details'), s);
        count('details');
        return `${pad}<details id="${did}"><summary>${inline(b.summary, ctx)}</summary>\n${flow(b.blocks, pad + '  ')}${pad}</details>\n`;
      }
      case 'summary':
        // Only valid as first section; flow() handles it. Here (nested) it is written as plain blocks.
        return flow(b.blocks, pad);
      case 'gap':
        count('gap');
        return `${pad}<p class="hp-import-luecke">[${escapeXml(b.text)}]</p>\n`;
    }
  }

  /** A sequence of blocks with footnotes after each block (HP-MIN-008). */
  function flow(list: readonly Block[], pad: string): string {
    let h = '';
    for (const b of list) {
      const ctx: Ctx = { pending: [], inNote: false };
      h += renderBlock(b, ctx, pad);
      for (const n of ctx.pending) h += `${pad}${n}\n`;
    }
    return h;
  }

  // ---------------------------------------------------------------- document
  const out: string[] = [];
  const sections: Array<{ id: string; title: string; children: TocEntry[] }> = [];
  const titleCtx: Ctx = { pending: [], inNote: false };
  let h1Id = '';
  if (!untitled) {
    h1Id = idFor(titleBlock?.marks, slugify(title || 'dokument', 'titel'), title);
    out.push(`  <h1 id="${h1Id}"${styleAttr(titleBlock?.style)}>${titleBlock ? inline(titleBlock.c, titleCtx) : escapeXml(title)}</h1>\n`);
    for (const n of titleCtx.pending) out.push(`  ${n}\n`);
    count('heading');
  } else {
    msg.add('ohne-titelvorlage', 'abschnitt', 'hinweis', `Die Quelle nutzt keine Titelvorlage: Überschriften der Ebene 1 bleiben h1 und bilden die Abschnitte; der Dokumentname „${title}“ kommt aus den Dokumenteigenschaften (Teil 0, Tabelle 15.2).`);
  }
  if (titleBlock && title && plain(titleBlock.c) !== title) {
    msg.add('titel-abweichend', 'metadaten', 'hinweis', `Titel aus dem Feld „${titleField}“ („${title}“) weicht von der Überschrift „${plain(titleBlock.c)}“ ab; die Überschrift bleibt im Text, der Titel steht im Manifest.`);
  }

  /** A header or closing line; left out when one of its fields is empty. */
  const lineHtml = (line: string): string | null => {
    let complete = true;
    const h = line.replace(/\{\{([a-z0-9_]+)\}\}/g, (_, k: string) => {
      const kind = template.fields.find((f) => f.key === k)?.kind;
      let v = fields[k];
      if (k === 'datum' && (v === undefined || v === '')) v = modified;
      if (v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)) {
        complete = false;
        return '';
      }
      if (kind === 'date' || k === 'datum') return escapeXml(formatDate(String(v), language));
      if (Array.isArray(v)) return escapeXml(v.join(', '));
      return (v as string).trim().split(/\r?\n/).map((x) => escapeXml(x.trim())).join('<br/>');
    });
    return complete ? h : null;
  };
  for (const line of template.head ?? []) {
    const h = lineHtml(line);
    if (h !== null) out.push(`  <p class="hp-kopf">${h}</p>\n`), count('kopf');
  }

  // Overview first (HP-NEST-005): explicit summary block, or a top-level section named like the template's overview.
  const summaryBlock = blocks.find((b) => b.t === 'summary') as Extract<Block, { t: 'summary' }> | undefined;
  let summaryWritten = false;
  if (summaryBlock) {
    blocks.splice(blocks.indexOf(summaryBlock), 1);
    usedOutsideMin = true;
    const stitle = summaryBlock.title || template.summary?.title || 'Überblick';
    const sid = idFor(summaryBlock.marks, slugify(stitle), stitle);
    const hid = take(`${sid}-titel`);
    out.push(`  <section id="${sid}" data-hp-role="summary">\n    <h2 id="${hid}">${escapeXml(stitle)}</h2>\n${flow(summaryBlock.blocks, '    ')}  </section>\n`);
    sections.push({ id: sid, title: stitle, children: [] });
    count('heading');
    count('section');
    summaryWritten = true;
  }

  let open = false;
  let current: { id: string; title: string; children: TocEntry[] } | undefined;
  let pre: Block[] = [];
  const flushPre = () => {
    if (pre.length > 0) out.push(flow(pre, open ? '    ' : '  ')), (pre = []);
  };
  const topLevel: string[] = [];
  for (const b of blocks) {
    if (b.t === 'heading' && b.level <= top) {
      flushPre();
      if (open) out.push('  </section>\n');
      const t = plain(b.c);
      topLevel.push(t);
      const ctx: Ctx = { pending: [], inNote: false };
      const hid = idFor(b.marks, slugify(t), t);
      const sid = take(`s-${hid}`);
      const isSummary = !summaryWritten && template.summary && normHeading(t) === template.summary.title.toLowerCase();
      if (isSummary) {
        usedOutsideMin = true;
        summaryWritten = true;
        if (sections.length > 0) msg.add('ueberblick-nicht-zuerst', 'abschnitt', 'hinweis', `Abschnitt „${t}“ als Überblick markiert, steht aber nicht an erster Stelle (HP-NEST-005).`);
      }
      out.push(`  <section id="${sid}"${isSummary ? ' data-hp-role="summary"' : ''}>\n    <h${top} id="${hid}"${styleAttr(b.style)}>${inline(b.c, ctx)}</h${top}>\n`);
      for (const n of ctx.pending) out.push(`    ${n}\n`);
      current = { id: sid, title: t, children: [] };
      sections.push(current);
      open = true;
      count('heading');
      count('section');
    } else if (b.t === 'heading' && current) {
      flushPre();
      const ctx: Ctx = { pending: [], inNote: false };
      const html = renderBlock(b, ctx, '    ');
      out.push(html);
      for (const n of ctx.pending) out.push(`    ${n}\n`);
      const hid = /id="([^"]+)"/.exec(html)![1]!;
      if (b.level === top + 1) current.children.push({ title: plain(b.c), href: `content/index.xhtml#${hid}` });
    } else pre.push(b);
  }
  flushPre();
  if (open) out.push('  </section>\n');
  if (endnotes.length > 0) {
    const eid = take('endnoten');
    out.push(`  <section id="${eid}" role="doc-endnotes" epub:type="endnotes">\n    <ol>\n${endnotes.join('')}    </ol>\n  </section>\n`);
    sections.push({ id: eid, title: 'Endnoten', children: [] });
  }
  for (const line of template.foot ?? []) {
    const h = lineHtml(line);
    if (h !== null) out.push(`  <p class="hp-schluss">${h}</p>\n`), count('schluss');
  }

  // Template rules: overview and required sections.
  if (template.summary?.required && !summaryWritten) {
    msg.add('ueberblick-fehlt', 'vorlage', 'fehler', `Vorlage „${template.name}“ verlangt einen Überblick: Block „::: zusammenfassung“ oder Abschnitt „${template.summary.title}“ (HP-NEST-005).`);
  }
  for (const s of template.sections ?? []) {
    if (!topLevel.some((t) => normHeading(t) === s.toLowerCase())) msg.add('abschnitt-fehlt', 'vorlage', 'fehler', `Vorlage „${template.name}“ verlangt den Abschnitt „${s}“.`);
  }

  // References (HP-MIN-009): to the kennung of the target; page references show the target text.
  let body = out.join('');
  for (const r of refs) {
    const t = marks.get(r.target) ?? (used.has(r.target) ? { id: r.target, text: '' } : undefined);
    let repl: string;
    if (!t || !t.id) {
      msg.add('verweis-ohne-ziel', 'verweis', 'ersatz', `Verweis auf „${r.target}“ ohne Ziel im Dokument; als Text übernommen (HP-MIN-009).`);
      repl = r.html;
    } else {
      const label = r.page ? escapeXml(t.text || r.target) : r.html;
      repl = `<a href="#${t.id}">${label}</a>`;
      if (r.page) msg.add('seitenverweis', 'verweis', 'ersatz', `Seitenverweis auf „${r.target}“: statt der Seitenzahl steht der Text des Ziels (HP-MIN-009).`);
    }
    body = body.split(r.placeholder).join(repl);
  }

  const stylesheet = `styles/${template.name}.css`;
  const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(title || 'Dokument')}</title>
  <link rel="stylesheet" type="text/css" href="${stylesheet}"/>
</head>
<body>
${body}</body>
</html>
`;
  const keep = options.sourceBytes !== undefined && (options.keepOriginal ?? true);
  const sourceName = (options.sourceName ?? `quelle.${source.format.name}`).split(/[\\/]/).pop()!.normalize('NFC').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '') || `quelle.${source.format.name}`;
  const resources: ResourceInput[] = [
    { path: 'content/index.xhtml', mediaType: 'application/xhtml+xml', data: xhtml },
    { path: `content/${stylesheet}`, mediaType: 'text/css', data: template.css },
    ...media,
    ...(keep ? [{ path: `original/${sourceName}`, mediaType: source.format.mediaType, data: options.sourceBytes! }] : []),
  ];
  const officeMin = template.officeMin && !usedOutsideMin;
  if (template.officeMin && usedOutsideMin) msg.add('kein-mindestprofil', 'vorlage', 'hinweis', 'Das Dokument nutzt Überblick oder aufklappbare Abschnitte; es beansprucht deshalb nicht das Mindestprofil für Büroprogramme, sondern ist ein Dokument der Stufe Basis (HP-MIN-002).');
  const tocEntries: TocEntry[] = sections.length > 0 ? sections.map((s) => (s.children.length > 0 ? { title: s.title, href: `content/index.xhtml#${s.id}` , children: s.children } : { title: s.title, href: `content/index.xhtml#${s.id}` })) : [{ title: title || 'Dokument', href: `content/index.xhtml${h1Id ? `#${h1Id}` : ''}` }];
  const creators = [...(Array.isArray(fields.autoren) ? (fields.autoren as string[]) : typeof fields.autoren === 'string' && fields.autoren ? [fields.autoren] : [])];
  const document: DocumentInput = {
    id,
    title: title || 'Dokument',
    language,
    modified,
    profile: 'static',
    creators: [...new Set(creators)],
    description: source.meta.description ?? (typeof fields.beschreibung === 'string' ? fields.beschreibung : undefined) ?? `Erstellt aus ${source.format.name === 'md' ? 'Markdown' : source.format.name === 'docx' ? 'einem Word-Dokument' : source.format.name} mit der Vorlage „${template.label}“ (${source.format.tool.name} ${source.format.tool.version}).`,
    readingOrder: ['content/index.xhtml'],
    toc: { title: 'Inhalt', entries: tocEntries },
    resources,
    accessibility: {
      accessMode: media.length > 0 ? ['textual', 'visual'] : ['textual'],
      accessModeSufficient: ['textual'],
      accessibilityFeature: ['structuralNavigation', 'tableOfContents', ...(media.length > 0 ? ['alternativeText'] : [])],
      accessibilityHazard: ['none'],
      accessibilitySummary: `Erstellt mit der Vorlage „${template.label}“: Überschriften, Listen, Tabellen mit Kopfzeilen und Fußnoten aus der Struktur der Quelle${media.length > 0 ? '; Bilder mit Alternativtext' : ''}.`,
    },
    ...(officeMin ? { subset: SUBSET_OFFICE_MIN } : {}),
    ...(keep ? { source: { url: `original/${sourceName}`, type: source.format.mediaType, tool: source.format.tool, date: modified } } : {}),
  };
  return { document, messages: msg.all, counts, officeMin, xhtml };
}

/** True when a message list contains template errors (the document must not be written). */
export function hasErrors(messages: readonly Message[]): boolean {
  return messages.some((m) => m.severity === 'fehler');
}
