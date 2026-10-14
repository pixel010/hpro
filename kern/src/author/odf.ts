/**
 * ODF reader of the author path (S8): an OpenDocument text document (ISO/IEC 26300, `.odt` as
 * package or `.fodt` as flat XML) becomes the document model. This is the export path from word
 * processors: LibreOffice and OpenOffice save ODT natively, Microsoft Word („Speichern unter →
 * OpenDocument-Text“) and Google Docs („Herunterladen → OpenDocument“) write it as well.
 *
 * The mapping is the ODF column of part 0, table 15.2, as in the reference converter of the
 * author's guide (`scripts/s7-fodt2hpro.mjs`, part 5, chapter 4):
 *
 * - structure only from paragraph styles (through `style:parent-style-name`), outline levels,
 *   list and table definitions, never from appearance (HP-MIN-003); direct bold/italic in
 *   automatic styles become a CSS class, not `strong`/`em` (HP-MIN-012);
 * - title style → h1; outline level n → h<n+1> with a title, h<n> without;
 * - `text:list` → ul/ol by the list style of the level, `start` for continued numbering;
 * - tables with `table:table-header-rows` → thead, spanned cells → colspan/rowspan;
 * - captions are paragraphs with a caption style or a `text:sequence` next to a table or picture
 *   (LibreOffice puts a captioned picture into a frame with a text box);
 * - pictures with `svg:title`/`svg:desc` as alternative text and the decorative flag;
 * - footnotes and endnotes, bookmarks and reference marks as kennungen, reference fields and
 *   internal hyperlinks as references.
 *
 * Everything else — comments, tracked changes, text boxes, charts, formulas, OLE objects, shapes,
 * fields, indexes, headers and footers, page breaks, hidden text — is carried over as text where
 * possible and always reported.
 */
import { DOMParser } from '@xmldom/xmldom';
import { base64Decode } from '../x509.js';
import { readZip } from '../zip.js';
import { sniffImage } from './docx.js';
import { Messages, text, type AuthorSource, type Block, type Cell, type Inline, type SourceMeta } from './model.js';
import { normalizeDate } from './write.js';

export const ODF_TOOL = { name: 'hpro-author-odf', version: '0.1.0' } as const;
export const ODT_MEDIA_TYPE = 'application/vnd.oasis.opendocument.text';
export const FODT_MEDIA_TYPE = 'application/vnd.oasis.opendocument.text-flat-xml';

export interface OdfOptions {
  /** As `DocxOptions.omitUnsupportedImages`: placeholder instead of an error for EMF, WMF, TIFF, BMP, SVM. */
  readonly omitUnsupportedImages?: boolean;
}

/** Thrown when the input is not an ODF text document or a picture cannot be converted. */
export class OdfError extends Error {}

const NS = {
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  xlink: 'http://www.w3.org/1999/xlink',
  dc: 'http://purl.org/dc/elements/1.1/',
  meta: 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0',
  loext: 'urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0',
  manifest: 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0',
} as const;
type Prefix = keyof typeof NS;

interface XNode {
  readonly nodeType: number;
  readonly nodeValue: string | null;
  readonly namespaceURI: string | null;
  readonly localName: string | null;
  readonly textContent: string | null;
  readonly childNodes: ArrayLike<XNode>;
  readonly parentNode: XNode | null;
}
interface XEl extends XNode {
  getAttributeNS(ns: string, name: string): string | null;
  hasAttributeNS(ns: string, name: string): boolean;
  getElementsByTagNameNS(ns: string, name: string): ArrayLike<XEl>;
}

const is = (n: XNode | undefined | null, p: Prefix, local: string): boolean => !!n && n.nodeType === 1 && n.namespaceURI === NS[p] && n.localName === local;
const kids = (el: XNode): XEl[] => Array.from(el.childNodes).filter((n): n is XEl => n.nodeType === 1);
const child = (el: XNode | undefined, p: Prefix, local: string): XEl | undefined => (el ? kids(el).find((c) => is(c, p, local)) : undefined);
const attr = (el: XEl | undefined, p: Prefix, name: string): string | null => (el && el.hasAttributeNS(NS[p], name) ? el.getAttributeNS(NS[p], name) : null);
const all = (el: XEl, p: Prefix, local: string): XEl[] => Array.from(el.getElementsByTagNameNS(NS[p], local));
const flat = (el: XNode): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

function parseXml(data: Uint8Array | undefined, name: string): XEl | undefined {
  if (!data) return undefined;
  const errors: string[] = [];
  const dom = new DOMParser({ onError: (level: string, m: string) => void (level !== 'warning' && errors.push(m)) }).parseFromString(new TextDecoder().decode(data), 'text/xml');
  if (errors.length > 0) throw new OdfError(`${name}: kein wohlgeformtes XML (${errors[0]})`);
  return (dom.documentElement ?? undefined) as unknown as XEl | undefined;
}

// ------------------------------------------------------------------------------------ styles

/** Paragraph style roles of table 15.2 (ODF column), by internal style name. */
const PARAGRAPH_ROLES: Record<string, 'title' | 'quote' | 'pre' | 'caption'> = {
  Title: 'title',
  Quotations: 'quote',
  Preformatted_20_Text: 'pre',
  Table: 'caption',
  Illustration: 'caption',
  Figure: 'caption',
  Drawing: 'caption',
  Caption: 'caption',
  Text: 'caption',
};
/** Kind of a caption style when it has no sequence field. */
const CAPTION_KIND: Record<string, 'figure' | 'table'> = { Table: 'table', Illustration: 'figure', Figure: 'figure', Drawing: 'figure' };
/** Character style roles of table 15.2. */
const TEXT_ROLES: Record<string, 'em' | 'strong' | 'code'> = { Emphasis: 'em', Strong_20_Emphasis: 'strong', Source_20_Text: 'code', Teletype: 'code' };
const FIGURE_SEQ = /^(abbildung|abb|figure|fig|bild|illustration|grafik|drawing|zeichnung)/i;
const TABLE_SEQ = /^(tabelle|tab|table)/i;

interface StyleInfo {
  readonly name: string;
  readonly family: string | null;
  readonly parent: string | null;
  readonly display: string;
  readonly automatic: boolean;
  readonly outline: number | null;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strike: boolean;
  readonly position: 'sup' | 'sub' | null;
  readonly hidden: boolean;
  readonly pageBreak: boolean;
}

class Styles {
  readonly map = new Map<string, StyleInfo>();
  readonly lists = new Map<string, Map<number, { ordered: boolean; start: number; format: string }>>();
  language: string | undefined;

  add(root: XEl | undefined, automatic: boolean): void {
    if (!root) return;
    for (const el of kids(root)) {
      if (is(el, 'style', 'style')) {
        const name = attr(el, 'style', 'name') ?? '';
        const tp = child(el, 'style', 'text-properties');
        const pp = child(el, 'style', 'paragraph-properties');
        const underline = attr(tp, 'style', 'text-underline-style');
        const strike = attr(tp, 'style', 'text-line-through-style');
        const pos = attr(tp, 'style', 'text-position') ?? '';
        const outline = attr(el, 'style', 'default-outline-level');
        this.map.set(name, {
          name,
          family: attr(el, 'style', 'family'),
          parent: attr(el, 'style', 'parent-style-name'),
          display: attr(el, 'style', 'display-name') ?? name.replace(/_20_/g, ' '),
          automatic,
          outline: outline && /^\d+$/.test(outline) ? Number(outline) : null,
          bold: attr(tp, 'fo', 'font-weight') === 'bold' || Number(attr(tp, 'fo', 'font-weight')) >= 600,
          italic: attr(tp, 'fo', 'font-style') === 'italic' || attr(tp, 'fo', 'font-style') === 'oblique',
          underline: !!underline && underline !== 'none',
          strike: !!strike && strike !== 'none',
          position: textPosition(pos),
          hidden: attr(tp, 'text', 'display') === 'none',
          pageBreak: attr(pp, 'fo', 'break-before') === 'page' || attr(pp, 'fo', 'break-after') === 'page',
        });
      } else if (is(el, 'text', 'list-style')) {
        const levels = new Map<number, { ordered: boolean; start: number; format: string }>();
        for (const l of kids(el)) {
          const lv = Number(attr(l, 'text', 'level') ?? '1');
          const ordered = l.localName === 'list-level-style-number';
          const format = ordered ? attr(l, 'style', 'num-format') ?? '1' : l.localName === 'list-level-style-bullet' ? 'bullet' : 'image';
          levels.set(lv, { ordered: ordered && format !== '', start: Number(attr(l, 'text', 'start-value') ?? '1'), format });
        }
        this.lists.set(attr(el, 'style', 'name') ?? '', levels);
      } else if (is(el, 'style', 'default-style') && attr(el, 'style', 'family') === 'paragraph') {
        const tp = child(el, 'style', 'text-properties');
        const lang = attr(tp, 'fo', 'language');
        const country = attr(tp, 'fo', 'country');
        if (lang && lang !== 'none') this.language = country && country !== 'none' ? `${lang}-${country}` : lang;
      }
    }
  }

  chain(name: string | null): StyleInfo[] {
    const out: StyleInfo[] = [];
    let n = name;
    for (let i = 0; n && i < 30; i++) {
      const s = this.map.get(n);
      if (!s) break;
      out.push(s);
      n = s.parent;
    }
    return out;
  }

  paragraphRole(name: string | null): { role: 'p' | 'heading' | 'title' | 'quote' | 'pre' | 'caption'; level?: number; captionKind?: 'figure' | 'table' } {
    for (const s of this.chain(name)) {
      const r = PARAGRAPH_ROLES[s.name];
      if (r) return r === 'caption' ? { role: r, ...(CAPTION_KIND[s.name] ? { captionKind: CAPTION_KIND[s.name]! } : {}) } : { role: r };
      if (s.outline !== null && s.outline > 0) return { role: 'heading', level: s.outline };
    }
    return { role: 'p' };
  }

  /** Display name of the first non-automatic style in the chain (`data-hp-style`, HP-MIN-012). */
  named(name: string | null): string | undefined {
    for (const s of this.chain(name)) if (!s.automatic) return s.display;
    return undefined;
  }

  /** Formatting of a text span: role from a named character style, direct formatting from automatic styles. */
  textFormat(name: string | null): { role?: 'em' | 'strong' | 'code'; position?: 'sup' | 'sub'; cls: string[]; style?: string; hidden: boolean } {
    const chain = this.chain(name);
    const out: { role?: 'em' | 'strong' | 'code'; position?: 'sup' | 'sub'; cls: string[]; style?: string; hidden: boolean } = { cls: [], hidden: chain.some((s) => s.hidden) };
    for (const s of chain) {
      if (TEXT_ROLES[s.name]) {
        out.role = TEXT_ROLES[s.name]!;
        break;
      }
    }
    const position = chain.find((s) => s.position)?.position;
    if (position) out.position = position;
    const auto = chain.filter((s) => s.automatic);
    if (!out.role) {
      if (auto.some((s) => s.bold)) out.cls.push('hp-fett');
      if (auto.some((s) => s.italic)) out.cls.push('hp-kursiv');
    }
    if (auto.some((s) => s.underline)) out.cls.push('hp-unterstrichen');
    if (auto.some((s) => s.strike)) out.cls.push('hp-durchgestrichen');
    if (!out.role) {
      const named = chain.find((s) => !s.automatic && s.family === 'text');
      if (named) out.style = named.display;
    }
    return out;
  }

  listLevel(styleName: string | null, level: number): { ordered: boolean; start: number; format: string } {
    const lv = styleName ? this.lists.get(styleName) : undefined;
    return lv?.get(level) ?? lv?.get(1) ?? { ordered: false, start: 1, format: 'bullet' };
  }
}

// ------------------------------------------------------------------------------------ reader

type Raw =
  | { readonly t: 'block'; readonly block: Block }
  | { readonly t: 'caption'; readonly kind: 'figure' | 'table' | 'unknown'; readonly c: Inline[]; readonly marks: string[] };

interface ParaCtx {
  marks: string[];
  seq?: string;
  frames: XEl[];
  pre: boolean;
}

/** Reads an ODF text document (package or flat XML). */
export async function readOdf(bytes: Uint8Array, options: OdfOptions = {}): Promise<AuthorSource> {
  const msg = new Messages();
  const inv: Record<string, number> = {};
  const seen = (k: string, n = 1) => (inv[k] = (inv[k] ?? 0) + n);

  // ---------------------------------------------------------------- package or flat XML
  let content: XEl | undefined;
  let stylesRoot: XEl | undefined;
  let metaRoot: XEl | undefined;
  let files = new Map<string, Uint8Array>();
  let flatXml = false;
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip) {
    let entries;
    try {
      entries = await readZip(bytes);
    } catch (err) {
      throw new OdfError(`kein lesbares ZIP-Archiv: ${(err as Error).message}`);
    }
    files = new Map(entries.map((e) => [e.name, e.data]));
    const mime = files.get('mimetype') ? new TextDecoder().decode(files.get('mimetype')).trim() : undefined;
    if (mime && mime !== ODT_MEDIA_TYPE && mime !== 'application/vnd.oasis.opendocument.text-template') {
      throw new OdfError(`kein ODF-Textdokument (mimetype ${mime}); Tabellen (.ods) liest „hpro calc import“`);
    }
    const encrypted = parseXml(files.get('META-INF/manifest.xml'), 'META-INF/manifest.xml');
    if (encrypted && all(encrypted, 'manifest', 'encryption-data').length > 0) throw new OdfError('das Dokument ist mit einem Kennwort verschlüsselt; bitte unverschlüsselt speichern');
    content = parseXml(files.get('content.xml'), 'content.xml');
    stylesRoot = parseXml(files.get('styles.xml'), 'styles.xml');
    metaRoot = parseXml(files.get('meta.xml'), 'meta.xml');
    if (!content || !is(content, 'office', 'document-content')) throw new OdfError('content.xml fehlt oder ist kein ODF-Inhalt (office:document-content)');
  } else {
    content = parseXml(bytes, 'Flat-ODF');
    if (!content || !is(content, 'office', 'document')) throw new OdfError('weder ODF-Paket (.odt) noch Flat-XML-ODF (office:document)');
    stylesRoot = content;
    metaRoot = content;
    flatXml = true;
  }
  const officeBody = child(content, 'office', 'body');
  const body = child(officeBody, 'office', 'text');
  if (!body) {
    const other = officeBody ? kids(officeBody)[0]?.localName : undefined;
    throw new OdfError(`kein Textdokument (office:text fehlt${other ? `, enthalten ist office:${other}` : ''})`);
  }

  // Body styles: common + automatic styles of the content; page furniture: common + automatic styles of styles.xml.
  const common = child(stylesRoot, 'office', 'styles');
  const styles = new Styles();
  styles.add(common, false);
  styles.add(child(content, 'office', 'automatic-styles'), true);
  const furnitureStyles = new Styles();
  furnitureStyles.add(common, false);
  furnitureStyles.add(child(stylesRoot, 'office', 'automatic-styles'), true);
  if (flatXml) furnitureStyles.add(child(content, 'office', 'automatic-styles'), true);

  // ---------------------------------------------------------------- metadata
  const officeMeta = child(metaRoot, 'office', 'meta');
  const metaText = (p: Prefix, local: string): string | undefined => {
    const el = officeMeta ? child(officeMeta, p, local) : undefined;
    const v = el ? flat(el) : '';
    return v || undefined;
  };
  let customId: string | undefined;
  for (const u of officeMeta ? kids(officeMeta).filter((c) => is(c, 'meta', 'user-defined')) : []) if (attr(u, 'meta', 'name') === 'hpro:id') customId = flat(u) || undefined;
  const modifiedRaw = metaText('dc', 'date') ?? metaText('meta', 'creation-date');
  const modified = modifiedRaw ? normalizeDate(modifiedRaw) : undefined;
  if (modifiedRaw && !/[Zz]|[+-]\d\d:\d\d$/.test(modifiedRaw)) msg.add('datum-ohne-zone', 'metadaten', 'hinweis', `dc:date „${modifiedRaw}“ ohne Zeitzone; als UTC gelesen.`);
  const creator = metaText('meta', 'initial-creator') ?? metaText('dc', 'creator');

  // ---------------------------------------------------------------- inline content
  const hasTitle = all(body, 'text', 'p').some((p) => styles.paragraphRole(attr(p, 'text', 'style-name')).role === 'title' && flat(p) !== '' && !insideNote(p));
  let noteDepth = 0;
  const imageNames = new Set<string>();
  const counters = new Map<string, number>();

  function inlines(nodes: readonly XNode[], out: Inline[], ctx: ParaCtx, st: Styles): void {
    for (const n of nodes) {
      if (n.nodeType === 3 || n.nodeType === 4) {
        const v = (n.nodeValue ?? '').replace(/[\r\n\t]+/g, ' ');
        if (v) out.push(text(ctx.pre ? v : v.replace(/ {2,}/g, ' ')));
        continue;
      }
      if (n.nodeType !== 1) continue;
      const el = n as XEl;
      if (is(el, 'text', 'span')) {
        const f = st.textFormat(attr(el, 'text', 'style-name'));
        if (f.hidden) {
          seen('versteckt');
          msg.add('versteckter-text', 'text', 'verlust', 'Ausgeblendeter Text (text:display="none") nicht übernommen.');
          continue;
        }
        if (f.role === 'code') {
          out.push({ t: 'code', v: (el.textContent ?? '').replace(/\s+/g, ' ') });
          continue;
        }
        const inner: Inline[] = [];
        inlines(Array.from(el.childNodes), inner, ctx, st);
        if (inner.length === 0) continue;
        let node: Inline[] = inner;
        if (f.position) node = [{ t: f.position, c: node }];
        if (f.role) node = [{ t: f.role, c: node }];
        if (f.cls.length > 0 || f.style) {
          if (f.cls.length > 0) seen('direktformat');
          node = [{ t: 'span', c: node, ...(f.cls.length > 0 ? { cls: f.cls.join(' ') } : {}), ...(f.style ? { style: f.style } : {}) }];
        }
        out.push(...node);
      } else if (is(el, 'text', 's')) out.push(text(' '.repeat(ctx.pre ? Number(attr(el, 'text', 'c') ?? '1') : 1)));
      else if (is(el, 'text', 'tab')) out.push(text(ctx.pre ? '\t' : ' '));
      else if (is(el, 'text', 'line-break')) out.push({ t: 'br' });
      else if (is(el, 'text', 'soft-page-break')) continue;
      else if (is(el, 'text', 'bookmark') || is(el, 'text', 'bookmark-start') || is(el, 'text', 'reference-mark') || is(el, 'text', 'reference-mark-start')) {
        const name = attr(el, 'text', 'name');
        if (!name) continue;
        // Bookmarks LibreOffice writes for its own index (`__RefHeading___Toc…`) are targets, not names chosen by the author.
        const automatic = /^__|^_Toc|^_Ref/.test(name);
        if (!automatic) seen('textmarke');
        ctx.marks.push(automatic ? `\u0001${name}` : name);
      } else if (is(el, 'text', 'bookmark-end') || is(el, 'text', 'reference-mark-end')) continue;
      else if (is(el, 'text', 'a')) {
        const href = attr(el, 'xlink', 'href') ?? '';
        const inner: Inline[] = [];
        inlines(Array.from(el.childNodes), inner, ctx, st);
        seen('hyperlink');
        if (/^(https?:|mailto:)/i.test(href)) out.push({ t: 'link', href, c: inner });
        else if (href.startsWith('#')) out.push({ t: 'ref', target: decodeURIComponent(href.slice(1)), c: inner });
        else {
          msg.add('verweis-als-text', 'verweis', 'ersatz', `Hyperlink „${href}“ ist weder http(s), mailto noch ein Ziel im Dokument; als Text übernommen (HP-MIN-009).`);
          out.push(...inner);
        }
      } else if (is(el, 'text', 'bookmark-ref') || is(el, 'text', 'reference-ref') || is(el, 'text', 'sequence-ref') || is(el, 'text', 'note-ref')) {
        const target = attr(el, 'text', 'ref-name') ?? '';
        const format = attr(el, 'text', 'reference-format') ?? 'text';
        const shown = (el.textContent ?? '').replace(/\s+/g, ' ');
        seen('querverweis');
        out.push({ t: 'ref', target, c: [text(shown || target)], ...(format === 'page' ? { page: true } : {}) });
      } else if (is(el, 'text', 'sequence')) {
        ctx.seq = attr(el, 'text', 'name') ?? 'Text';
        const ref = attr(el, 'text', 'ref-name');
        if (ref) ctx.marks.push(`\u0001${ref}`);
        out.push(text((el.textContent ?? '').trim()));
      } else if (is(el, 'text', 'note')) {
        const kind = attr(el, 'text', 'note-class') === 'endnote' ? 'endnote' : 'footnote';
        seen(kind === 'endnote' ? 'endnote' : 'fussnote');
        const label = flat(child(el, 'text', 'note-citation') ?? el);
        const noteBody = child(el, 'text', 'note-body');
        noteDepth++;
        const blocksOfNote = noteBody ? group(blockList(kids(noteBody), st)) : [];
        noteDepth--;
        const id = attr(el, 'text', 'id');
        out.push({ t: 'note', kind, ...(id ? { name: `\u0001${id}` } : {}), ...(label ? { label } : {}), blocks: blocksOfNote });
      } else if (is(el, 'draw', 'frame') || is(el, 'draw', 'a')) {
        if (is(el, 'draw', 'a')) ctx.frames.push(...kids(el).filter((c) => is(c, 'draw', 'frame')));
        else ctx.frames.push(el);
      } else if (is(el, 'office', 'annotation')) {
        seen('kommentar');
        msg.add('kommentare', 'kommentar', 'verlust', 'Kommentar nicht übernommen; Kommentare gehören als Anmerkungen (W3C Web Annotations) in einen eigenen Arbeitsschritt.');
      } else if (is(el, 'office', 'annotation-end')) continue;
      else if (is(el, 'text', 'change-start') || is(el, 'text', 'change-end') || is(el, 'text', 'change')) {
        seen('aenderung');
        msg.add('aenderungen', 'text', 'hinweis', 'Änderungsverfolgung: Einfügungen und Löschungen gelten als angenommen; der Verlauf der Änderungen wird nicht übernommen.');
      } else if (is(el, 'text', 'page-number') || is(el, 'text', 'page-count') || is(el, 'text', 'page-continuation')) {
        seen('feld-seite');
        msg.add('feld-seite', 'feld', 'verlust', `Seitenzahlfeld text:${el.localName} im Text entfällt (hpro hat keine Seiten).`);
      } else if (is(el, 'text', 'hidden-text') || is(el, 'text', 'hidden-paragraph')) {
        seen('versteckt');
        msg.add('versteckter-text', 'text', 'verlust', `Bedingt ausgeblendeter Text (text:${el.localName}) nicht übernommen.`);
      } else if (el.namespaceURI === NS.text && FIELD_ELEMENTS.has(el.localName ?? '')) {
        seen('feld');
        msg.add('feld-als-text', 'feld', 'ersatz', `Feld text:${el.localName} als zuletzt berechneter Text übernommen; die Feldfunktion entfällt.`);
        const v = (el.textContent ?? '').replace(/\s+/g, ' ');
        if (v) out.push(text(v));
      } else if (is(el, 'text', 'ruby')) {
        msg.add('ruby', 'text', 'ersatz', 'Ruby-Text: nur der Grundtext übernommen.');
        const base = child(el, 'text', 'ruby-base');
        if (base) inlines(Array.from(base.childNodes), out, ctx, st);
      } else if (is(el, 'text', 'meta') || is(el, 'text', 'meta-field')) inlines(Array.from(el.childNodes), out, ctx, st);
      else {
        seen('unbekannt');
        msg.add('element-unbekannt', 'text', 'verlust', `Element ${el.localName ? `${prefixOf(el)}:${el.localName}` : '?'} im Absatz ohne Entsprechung; Textinhalt übernommen.`);
        const v = flat(el);
        if (v) out.push(text(v));
      }
    }
  }

  // ---------------------------------------------------------------- frames (pictures, text boxes, objects)
  function frame(fr: XEl, out: Raw[], st: Styles, caption?: { c: Inline[]; marks: string[] }): void {
    const name = attr(fr, 'draw', 'name') ?? 'Bild';
    const titleText = flat(child(fr, 'svg', 'title') ?? ({ textContent: '' } as XNode));
    const descText = flat(child(fr, 'svg', 'desc') ?? ({ textContent: '' } as XNode));
    const image = child(fr, 'draw', 'image');
    const textBox = child(fr, 'draw', 'text-box');
    const object = child(fr, 'draw', 'object') ?? child(fr, 'draw', 'object-ole');
    if (attr(fr, 'text', 'anchor-type') && !['as-char', 'paragraph', 'char'].includes(attr(fr, 'text', 'anchor-type')!)) seen('bild-schwebend');
    if (textBox) {
      // LibreOffice: a captioned picture is a frame whose text box holds the picture and the caption.
      for (const p of kids(textBox)) {
        if (!(is(p, 'text', 'p') || is(p, 'text', 'h'))) {
          out.push(...blockList([p], st));
          continue;
        }
        const ctx: ParaCtx = { marks: [], frames: [], pre: false };
        const c: Inline[] = [];
        inlines(Array.from(p.childNodes), c, ctx, st);
        trim(c);
        const role = st.paragraphRole(attr(p, 'text', 'style-name'));
        const hasText = c.some((i) => !(i.t === 'text' && !i.v.trim()));
        const pictures = ctx.frames.filter((f) => child(f, 'draw', 'image'));
        if (pictures.length === 1 && hasText && (role.role === 'caption' || ctx.seq)) {
          seen('beschriftung');
          frame(pictures[0]!, out, st, { c, marks: ctx.marks });
          for (const f of ctx.frames) if (f !== pictures[0]) frame(f, out, st);
          continue;
        }
        if (hasText) {
          seen('textfeld');
          msg.add('textfeld', 'objekt', 'ersatz', 'Textrahmen aufgelöst: sein Text steht als gewöhnlicher Absatz an seiner Stelle; Lage und Rahmen gehen verloren.');
          out.push(...paragraph(p, st));
        } else for (const f of ctx.frames) frame(f, out, st);
      }
      return;
    }
    if (image) {
      seen('bild');
      const href = attr(image, 'xlink', 'href') ?? '';
      const binary = child(image, 'office', 'binary-data');
      let data: Uint8Array | undefined;
      let problem: string | undefined;
      if (binary) data = base64Decode(binary.textContent ?? '');
      else if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('/') || href.startsWith('../')) problem = `nur verknüpft (${href}), nicht eingebettet`;
      else {
        data = files.get(href.replace(/^\.\//, ''));
        if (!data) problem = `Bilddatei ${href || '(ohne Verweis)'} fehlt im Paket`;
      }
      let mediaType: string | undefined;
      if (data && !problem) {
        const sniff = sniffImage(data);
        if (sniff.mediaType) mediaType = sniff.mediaType;
        else problem = `Format ${sniff.label === 'unbekannt' ? attr(image, 'draw', 'mime-type') ?? 'unbekannt (z. B. SVM)' : sniff.label} ist kein Kernmedientyp`;
      }
      if (problem || !data || !mediaType) {
        if (!options.omitUnsupportedImages) throw new OdfError(`Bild „${name}“: ${problem}; vor dem Export nach PNG oder SVG umwandeln oder mit --bild-auslassen ersetzen (HP-MIN-007)`);
        msg.add('bild-ausgelassen', 'bild', 'verlust', `Bild „${name}“: ${problem}; durch einen Platzhalter ersetzt (--bild-auslassen).`);
        out.push({ t: 'block', block: { t: 'gap', text: `Bild „${name}“ nicht übernommen${titleText || descText ? `: ${titleText || descText}` : ''}` } });
        return;
      }
      let imgName = name.replace(/[\\/]/g, '_');
      for (let n = 2; imageNames.has(imgName); n++) imgName = `${name}-${n}`;
      imageNames.add(imgName);
      const decorative = attr(fr, 'draw', 'decorative') === 'true' || attr(fr, 'loext', 'decorative') === 'true';
      const w = toPx(attr(fr, 'svg', 'width'));
      const h = toPx(attr(fr, 'svg', 'height'));
      out.push({
        t: 'block',
        block: {
          t: 'figure',
          image: { data, mediaType, name: imgName },
          alt: decorative ? '' : titleText || descText || null,
          ...(decorative ? { decorative: true } : {}),
          ...(w && h ? { width: w, height: h } : {}),
          ...(caption ? { caption: caption.c, marks: caption.marks } : {}),
        },
      });
      return;
    }
    if (object) {
      const kind = objectKind(object, files);
      seen(kind === 'formel' ? 'formel' : kind === 'diagramm' ? 'diagramm' : 'ole-objekt');
      const label = kind === 'formel' ? 'Formel' : kind === 'diagramm' ? 'Diagramm' : 'Eingebettetes Objekt';
      const mathText = kind === 'formel' ? mathAnnotation(object, files) : undefined;
      if (mathText) {
        msg.add('formel', 'formel', 'ersatz', 'Formel (MathML) als linearer Text übernommen (StarMath-Notation der Quelle); die Formel selbst entfällt.');
        out.push({ t: 'block', block: { t: 'p', c: [{ t: 'code', v: mathText }] } });
        return;
      }
      msg.add(kind === 'formel' ? 'formel' : kind === 'diagramm' ? 'diagramm' : 'ole-objekt', kind === 'formel' ? 'formel' : 'objekt', 'verlust', `${label} „${name}“ nicht übernommen${kind === 'diagramm' ? ' (nur der Name bleibt); Werte stehen in der Quelle' : ''}.`);
      out.push({ t: 'block', block: { t: 'gap', text: `${label} „${name}“ nicht übernommen${titleText || descText ? `: ${titleText || descText}` : ''}` } });
      return;
    }
    seen('zeichnung');
    msg.add('zeichnung', 'objekt', 'verlust', `Rahmen „${name}“ ohne Bild oder Text nicht übernommen.`);
  }

  // ---------------------------------------------------------------- paragraphs
  function paragraph(p: XEl, st: Styles, inList = false): Raw[] {
    const styleName = attr(p, 'text', 'style-name');
    let role = st.paragraphRole(styleName);
    if (is(p, 'text', 'h') && (role.role === 'p' || role.role === 'caption')) role = { role: 'heading', level: Number(attr(p, 'text', 'outline-level') ?? role.level ?? 1) };
    else if (is(p, 'text', 'h') && role.role === 'heading' && attr(p, 'text', 'outline-level')) role = { role: 'heading', level: Number(attr(p, 'text', 'outline-level')) };
    if (st.chain(styleName).some((s) => s.pageBreak)) {
      seen('seitenumbruch');
      msg.add('seitenumbruch', 'format', 'hinweis', 'Seiten- und Spaltenumbrüche entfallen (hpro ist fließend; der Druck setzt Umbrüche selbst, HP-PRINT-001).');
    }
    const ctx: ParaCtx = { marks: [], frames: [], pre: role.role === 'pre' };
    const c: Inline[] = [];
    inlines(Array.from(p.childNodes), c, ctx, st);
    if (role.role !== 'pre') trim(c);
    const style = st.named(styleName);
    const hasText = c.some((i) => !(i.t === 'text' && !i.v.trim()));
    const out: Raw[] = [];
    if ((role.role === 'heading' || role.role === 'title') && (noteDepth > 0 || inList)) {
      if (inList) msg.add('ueberschrift-in-liste', 'abschnitt', 'ersatz', 'Überschrift in einer nummerierten Liste als Listenpunkt übernommen.');
      role = { role: 'p' };
    }
    const pictures = ctx.frames.filter((f) => child(f, 'draw', 'image'));
    if ((role.role === 'caption' || ctx.seq) && hasText && noteDepth === 0 && pictures.length === 0) {
      const kind = ctx.seq ? (FIGURE_SEQ.test(ctx.seq) ? 'figure' : TABLE_SEQ.test(ctx.seq) ? 'table' : 'unknown') : role.captionKind ?? 'unknown';
      out.push({ t: 'caption', kind, c, marks: ctx.marks });
      for (const f of ctx.frames) frame(f, out, st);
      return out;
    }
    if ((role.role === 'caption' || ctx.seq) && hasText && pictures.length === 1 && noteDepth === 0) {
      // Picture and caption in one paragraph (as-char picture followed by the caption text).
      seen('beschriftung');
      frame(pictures[0]!, out, st, { c, marks: ctx.marks });
      for (const f of ctx.frames) if (f !== pictures[0]) frame(f, out, st);
      return out;
    }
    const marks = ctx.marks.length > 0 ? { marks: ctx.marks } : {};
    if (role.role === 'title' && hasText) out.push({ t: 'block', block: { t: 'heading', level: 1, c, ...marks, ...(style ? { style } : {}) } });
    else if (role.role === 'heading' && hasText) {
      seen('ueberschrift');
      const srcLevel = role.level ?? 1;
      const level = srcLevel + (hasTitle ? 1 : 0);
      if (level > 6) msg.add('ebene-zu-tief', 'abschnitt', 'ersatz', `Überschrift der Gliederungsebene ${srcLevel} als h6 übernommen.`);
      // Internal links of LibreOffice to a heading name it by text (`#Text|outline`).
      const outline = `\u0001${plainOf(c)}|outline`;
      out.push({ t: 'block', block: { t: 'heading', level: Math.min(6, level), c, marks: [...ctx.marks, outline], ...(style ? { style } : {}) } });
    } else if (role.role === 'quote' && hasText) out.push({ t: 'block', block: { t: 'quote', blocks: [{ t: 'p', c }], ...marks, ...(style ? { style } : {}) } });
    else if (role.role === 'pre') {
      const t = c.map((i) => (i.t === 'br' ? '\n' : i.t === 'text' || i.t === 'code' ? i.v : plainOf([i]))).join('');
      out.push({ t: 'block', block: { t: 'pre', text: t, ...marks, ...(style ? { style } : {}) } });
    } else if (hasText) out.push({ t: 'block', block: { t: 'p', c, ...marks, ...(style ? { style } : {}) } });
    else if (ctx.marks.length > 0 && ctx.frames.length > 0) {
      const extra: Raw[] = [];
      for (const f of ctx.frames) frame(f, extra, st);
      const first = extra.find((r): r is Extract<Raw, { t: 'block' }> => r.t === 'block');
      if (first) extra[extra.indexOf(first)] = { t: 'block', block: { ...first.block, marks: [...(first.block.marks ?? []), ...ctx.marks] } as Block };
      out.push(...extra);
      return out;
    }
    if (ctx.frames.length > 0 && hasText && pictures.length > 0) msg.add('bild-im-text', 'bild', 'ersatz', 'Bild im Textabsatz als eigene Abbildung nach dem Absatz gesetzt (Bilder stehen im Mindestprofil in figure).');
    for (const f of ctx.frames) frame(f, out, st);
    return out;
  }

  // ---------------------------------------------------------------- lists
  function list(el: XEl, st: Styles, inherited: string | null, level: number): Block {
    const styleName = attr(el, 'text', 'style-name') ?? inherited;
    const def = st.listLevel(styleName, level);
    const items = kids(el).filter((c) => is(c, 'text', 'list-item') || is(c, 'text', 'list-header'));
    const key = `${styleName ?? ''}@${level}`;
    let start: number | undefined;
    if (def.ordered) {
      const first = items[0] ? attr(items[0], 'text', 'start-value') : null;
      if (first && /^\d+$/.test(first)) start = Number(first);
      else if ((attr(el, 'text', 'continue-numbering') === 'true' || attr(el, 'text', 'continue-list')) && counters.has(key)) start = counters.get(key)! + 1;
      else start = def.start;
      counters.set(key, start + items.filter((i) => is(i, 'text', 'list-item')).length - 1);
      if (!['1', 'bullet', ''].includes(def.format)) msg.add('nummerierungsart', 'liste', 'ersatz', `Nummerierungsart „${def.format}“ als 1, 2, 3 übernommen; das Mindestprofil kennt nur start (HP-MIN-005).`);
    }
    const out: Block[][] = [];
    for (const item of items) {
      seen('listeneintrag');
      const blocks: Block[] = [];
      for (const c of kids(item)) {
        if (is(c, 'text', 'list')) blocks.push(list(c, st, styleName, level + 1));
        else blocks.push(...group(blockList([c], st, true)));
      }
      if (is(item, 'text', 'list-header') && blocks.length === 0) continue;
      out.push(blocks);
    }
    return { t: 'list', ordered: def.ordered, ...(def.ordered && start !== undefined ? { start } : {}), items: out };
  }

  // ---------------------------------------------------------------- tables
  function table(el: XEl, st: Styles): Block {
    seen('tabelle');
    if (noteDepth > 0 || el.parentNode && is(el.parentNode, 'table', 'table-cell')) seen('tabelle-verschachtelt');
    const head: Cell[][] = [];
    const bodyRows: Cell[][] = [];
    const rows = (container: XEl, target: Cell[][]) => {
      for (const r of kids(container)) {
        if (is(r, 'table', 'table-row')) {
          const repeat = Math.min(Number(attr(r, 'table', 'number-rows-repeated') ?? '1'), 1000);
          for (let k = 0; k < repeat; k++) target.push(row(r));
        } else if (is(r, 'table', 'table-rows') || is(r, 'table', 'table-row-group')) rows(r, target);
        else if (is(r, 'table', 'table-header-rows')) rows(r, head);
      }
    };
    const row = (r: XEl): Cell[] => {
      const cells: Cell[] = [];
      for (const c of kids(r)) {
        if (is(c, 'table', 'covered-table-cell')) continue;
        if (!is(c, 'table', 'table-cell')) continue;
        seen('tabelle-zelle');
        const repeat = Math.min(Number(attr(c, 'table', 'number-columns-repeated') ?? '1'), 1000);
        const cs = Number(attr(c, 'table', 'number-columns-spanned') ?? '1');
        const rs = Number(attr(c, 'table', 'number-rows-spanned') ?? '1');
        const contentBlocks = group(blockList(kids(c), st));
        for (let k = 0; k < repeat; k++) cells.push({ c: contentBlocks, ...(cs > 1 ? { colspan: cs } : {}), ...(rs > 1 ? { rowspan: rs } : {}) });
      }
      return cells;
    };
    rows(el, bodyRows);
    if (head.length === 0) msg.add('tabelle-ohne-kopf', 'tabelle', 'hinweis', `Tabelle „${attr(el, 'table', 'name') ?? '?'}“ ohne Wiederholungszeile (Tabellenüberschrift); ohne Kopfzeile übernommen (HP-MIN-006).`);
    const name = attr(el, 'table', 'name');
    return { t: 'table', head, body: bodyRows, ...(name && !/^(Tabelle|Table)\d+$/.test(name) ? { marks: [name] } : name ? { marks: [`\u0001${name}`] } : {}) };
  }

  // ---------------------------------------------------------------- blocks
  function blockList(nodes: readonly XEl[], st: Styles, inList = false): Raw[] {
    const out: Raw[] = [];
    for (const n of nodes) {
      if (is(n, 'text', 'p') || is(n, 'text', 'h')) out.push(...paragraph(n, st, inList));
      else if (is(n, 'text', 'list')) out.push({ t: 'block', block: list(n, st, null, 1) });
      else if (is(n, 'table', 'table')) out.push({ t: 'block', block: table(n, st) });
      else if (is(n, 'text', 'section')) {
        seen('bereich');
        msg.add('bereich', 'abschnitt', 'hinweis', 'Bereiche (text:section) haben keine Entsprechung; ihr Inhalt steht als Fließtext an seiner Stelle.');
        out.push(...blockList(kids(n), st, inList));
      } else if (TOC_ELEMENTS.has(n.localName ?? '') && n.namespaceURI === NS.text) {
        seen('verzeichnis');
        msg.add('verzeichnis', 'feld', 'hinweis', `Verzeichnis text:${n.localName} entfällt; das Navigationsdokument ersetzt das Inhaltsverzeichnis, Seitenzahlen gibt es nicht (HP-ADR-007).`);
      } else if (is(n, 'text', 'tracked-changes')) {
        msg.add('aenderungen', 'text', 'hinweis', 'Änderungsverfolgung: Einfügungen und Löschungen gelten als angenommen; der Verlauf der Änderungen wird nicht übernommen.');
      } else if (is(n, 'draw', 'frame')) frame(n, out, st);
      else if (n.namespaceURI === NS.draw) {
        seen('zeichnung');
        msg.add('zeichnung', 'objekt', 'verlust', `Zeichnungsobjekt draw:${n.localName} nicht übernommen.`);
      } else if (n.namespaceURI === NS.text && DECL_ELEMENTS.has(n.localName ?? '')) continue;
      else if (is(n, 'office', 'forms') || is(n, 'text', 'soft-page-break')) continue;
      else if (is(n, 'office', 'annotation')) {
        seen('kommentar');
        msg.add('kommentare', 'kommentar', 'verlust', 'Kommentar nicht übernommen; Kommentare gehören als Anmerkungen (W3C Web Annotations) in einen eigenen Arbeitsschritt.');
      } else {
        seen('unbekannt');
        msg.add('element-unbekannt', 'text', 'verlust', `Element ${prefixOf(n)}:${n.localName} auf Blockebene nicht übernommen.`);
      }
    }
    return out;
  }

  /** Merges consecutive code and quote paragraphs and attaches captions to their table or picture. */
  function group(raw: readonly Raw[]): Block[] {
    const merged: Raw[] = [];
    for (const r of raw) {
      const prev = merged[merged.length - 1];
      if (r.t === 'block' && prev?.t === 'block' && r.block.t === 'pre' && prev.block.t === 'pre' && !r.block.marks && r.block.style === prev.block.style) {
        merged[merged.length - 1] = { t: 'block', block: { ...prev.block, text: `${prev.block.text}\n${r.block.text}` } };
      } else if (r.t === 'block' && prev?.t === 'block' && r.block.t === 'quote' && prev.block.t === 'quote' && r.block.style === prev.block.style) {
        merged[merged.length - 1] = { t: 'block', block: { ...prev.block, blocks: [...prev.block.blocks, ...r.block.blocks], ...(r.block.marks ? { marks: [...(prev.block.marks ?? []), ...r.block.marks] } : {}) } };
      } else merged.push(r);
    }
    const result: Block[] = [];
    for (let k = 0; k < merged.length; k++) {
      const b = merged[k]!;
      if (b.t !== 'caption') {
        result.push(b.block);
        continue;
      }
      const fits = (x: Block | undefined) => !!x && ((x.t === 'figure' && b.kind !== 'table' && !x.caption) || (x.t === 'table' && b.kind !== 'figure' && !x.caption));
      const attach = (x: Block): Block => ({ ...x, caption: b.c, marks: [...(x.marks ?? []), ...b.marks] }) as Block;
      const prev = result[result.length - 1];
      const next = merged[k + 1];
      seen('beschriftung');
      if (fits(prev)) result[result.length - 1] = attach(prev!);
      else if (next?.t === 'block' && fits(next.block)) merged[k + 1] = { t: 'block', block: attach(next.block) };
      else {
        msg.add('beschriftung-allein', 'text', 'hinweis', 'Beschriftung ohne benachbarte Tabelle oder Abbildung als Absatz übernommen.');
        result.push({ t: 'p', c: b.c, ...(b.marks.length > 0 ? { marks: b.marks } : {}) });
      }
    }
    return result;
  }

  const blocks = group(blockList(kids(body), styles));

  // Headers and footers: text once at the end, page numbers left out (part 5, chapter 4.7).
  const furniture: Block[] = [];
  const seenFurniture = new Set<string>();
  const masters = child(stylesRoot, 'office', 'master-styles');
  for (const mp of masters ? kids(masters).filter((m) => is(m, 'style', 'master-page')) : []) {
    for (const part of kids(mp)) {
      const kind = part.localName?.startsWith('header') ? 'Kopfzeile' : part.localName?.startsWith('footer') ? 'Fußzeile' : null;
      if (!kind || part.namespaceURI !== NS.style || attr(part, 'style', 'display') === 'false') continue;
      for (const p of kids(part).filter((x) => is(x, 'text', 'p') || is(x, 'text', 'h'))) {
        const pageOnly = all(p, 'text', 'page-number').length > 0 || all(p, 'text', 'page-count').length > 0;
        if (pageOnly) {
          msg.add('seitenzahl', 'feld', 'hinweis', 'Seitenzahlen aus Kopf- oder Fußzeile entfallen (hpro hat keine Seiten; der Druck setzt sie neu, HP-PRINT-001).');
          continue;
        }
        const c: Inline[] = [];
        inlines(Array.from(p.childNodes), c, { marks: [], frames: [], pre: false }, furnitureStyles);
        trim(c);
        const key = `${kind}|${plainOf(c)}`;
        if (!plainOf(c) || seenFurniture.has(key)) continue;
        seenFurniture.add(key);
        seen(kind === 'Kopfzeile' ? 'kopfzeile' : 'fusszeile');
        furniture.push({ t: 'p', c, style: kind });
      }
    }
  }
  if (furniture.length > 0) {
    msg.add('kopf-fusszeile', 'format', 'ersatz', 'Kopf- und Fußzeilen: ihr Text steht einmal als Absatz am Ende; Seitenzahlen und Wiederholung je Seite entfallen (Teil 5, Kapitel 4.7).');
    blocks.push(...furniture);
  }
  if (styles.map.size === 0) msg.add('ohne-vorlagen', 'abschnitt', 'hinweis', 'Das Dokument hat keine Formatvorlagen; Überschriften und Listen lassen sich nur aus Vorlagen ableiten (HP-MIN-003).');

  const title = metaText('dc', 'title');
  const language = metaText('dc', 'language') ?? styles.language;
  const meta: SourceMeta = {
    ...(title ? { title } : {}),
    ...(language ? { language } : {}),
    ...(modified ? { modified } : {}),
    ...(customId ? { id: customId } : {}),
    ...(creator ? { creators: creator.split(/\s*;\s*/).filter(Boolean) } : {}),
    ...(metaText('dc', 'description') ? { description: metaText('dc', 'description')! } : {}),
  };
  return {
    meta,
    blocks,
    messages: msg.all,
    inventory: inv,
    format: { name: flatXml ? 'fodt' : 'odt', mediaType: flatXml ? FODT_MEDIA_TYPE : ODT_MEDIA_TYPE, tool: ODF_TOOL },
    ...(hasTitle ? {} : { untitled: true }),
  };
}

// ------------------------------------------------------------------------------------ helpers

const FIELD_ELEMENTS = new Set([
  'date', 'time', 'title', 'subject', 'description', 'keywords', 'author-name', 'author-initials', 'initial-creator', 'creator', 'creation-date', 'creation-time', 'modification-date', 'modification-time',
  'chapter', 'file-name', 'template-name', 'sender-firstname', 'sender-lastname', 'sender-company', 'user-defined', 'variable-get', 'variable-set', 'user-field-get', 'expression', 'text-input',
  'database-display', 'database-name', 'placeholder', 'conditional-text', 'drop-down', 'word-count', 'character-count', 'paragraph-count', 'table-count', 'image-count', 'object-count', 'printed-by', 'print-date', 'print-time', 'editing-cycles', 'editing-duration', 'sequence-ref', 'sheet-name', 'script', 'execute-macro', 'bibliography-mark', 'alphabetical-index-mark', 'alphabetical-index-mark-start', 'toc-mark', 'user-index-mark',
]);
const TOC_ELEMENTS = new Set(['table-of-content', 'alphabetical-index', 'bibliography', 'illustration-index', 'table-index', 'object-index', 'user-index']);
const DECL_ELEMENTS = new Set(['sequence-decls', 'variable-decls', 'user-field-decls', 'dde-connection-decls', 'alphabetical-index-auto-mark-file']);

/** `style:text-position`: `super 58%`, `33% 58%` → sup; `sub 58%`, `-33% 58%` → sub. */
function textPosition(value: string): 'sup' | 'sub' | null {
  const first = value.trim().split(/\s+/)[0] ?? '';
  if (first === 'super') return 'sup';
  if (first === 'sub') return 'sub';
  const n = Number.parseFloat(first);
  return Number.isFinite(n) && n !== 0 ? (n > 0 ? 'sup' : 'sub') : null;
}

function insideNote(n: XNode): boolean {
  for (let p = n.parentNode; p; p = p.parentNode) if (is(p, 'text', 'note') || is(p, 'draw', 'text-box') || is(p, 'table', 'table-cell') || is(p, 'style', 'master-page')) return true;
  return false;
}

function prefixOf(el: XEl): string {
  const ns = el.namespaceURI;
  return (Object.keys(NS) as Prefix[]).find((p) => NS[p] === ns) ?? 'ns';
}

function plainOf(c: readonly Inline[]): string {
  let s = '';
  for (const i of c) {
    if (i.t === 'text' || i.t === 'code') s += i.v;
    else if (i.t === 'br') s += ' ';
    else if (i.t === 'note' || i.t === 'mark') continue;
    else s += plainOf(i.c);
  }
  return s.replace(/\s+/g, ' ').trim();
}

function trim(c: Inline[]): void {
  const blank = (i: Inline | undefined) => !!i && (i.t === 'br' || (i.t === 'text' && !i.v.trim()));
  while (blank(c[0])) c.shift();
  while (blank(c[c.length - 1])) c.pop();
  const f = c[0];
  if (f?.t === 'text') c[0] = text(f.v.replace(/^\s+/, ''));
  const l = c[c.length - 1];
  if (l?.t === 'text') c[c.length - 1] = text(l.v.replace(/\s+$/, ''));
}

/** ODF length (`2.5cm`, `1in`, `12pt`, `30mm`) in CSS pixels at 96 dpi. */
function toPx(v: string | null): number | undefined {
  const m = v ? /^([\d.]+)(cm|mm|in|pt|pc|px)$/.exec(v.trim()) : null;
  if (!m) return undefined;
  const n = Number(m[1]);
  const f: Record<string, number> = { cm: 96 / 2.54, mm: 96 / 25.4, in: 96, pt: 96 / 72, pc: 16, px: 1 };
  const px = Math.round(n * f[m[2]!]!);
  return px > 0 ? px : undefined;
}

function objectKind(obj: XEl, files: Map<string, Uint8Array>): 'formel' | 'diagramm' | 'objekt' {
  if (child(obj, 'office', 'document')) {
    const root = child(obj, 'office', 'document')!;
    const mime = attr(root, 'office', 'mimetype') ?? '';
    return mime.includes('formula') ? 'formel' : mime.includes('chart') ? 'diagramm' : 'objekt';
  }
  if (kids(obj).some((c) => c.localName === 'math')) return 'formel';
  const href = (attr(obj, 'xlink', 'href') ?? '').replace(/^\.\//, '').replace(/\/$/, '');
  const content = files.get(`${href}/content.xml`);
  if (content) {
    const head = new TextDecoder().decode(content.subarray(0, 2048));
    if (/<math[\s>:]|xmlns(:\w+)?="http:\/\/www\.w3\.org\/1998\/Math\/MathML"/.test(head)) return 'formel';
    if (/office:chart|chart:chart/.test(head)) return 'diagramm';
  }
  return 'objekt';
}

/** The StarMath annotation LibreOffice stores with a formula (`<annotation encoding="StarMath 5.0">`). */
function mathAnnotation(obj: XEl, files: Map<string, Uint8Array>): string | undefined {
  let xml: string | undefined;
  const href = (attr(obj, 'xlink', 'href') ?? '').replace(/^\.\//, '').replace(/\/$/, '');
  const content = files.get(`${href}/content.xml`);
  if (content) xml = new TextDecoder().decode(content);
  else {
    const math = kids(obj).find((c) => c.localName === 'math');
    if (math) xml = math.textContent ?? undefined;
    if (math) {
      const ann = Array.from((math as XEl).getElementsByTagNameNS('http://www.w3.org/1998/Math/MathML', 'annotation'))[0];
      return ann ? flat(ann) || undefined : undefined;
    }
  }
  const m = xml ? /<(?:\w+:)?annotation[^>]*encoding="StarMath[^"]*"[^>]*>([^<]*)</.exec(xml) : null;
  return m ? m[1]!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim() || undefined : undefined;
}
