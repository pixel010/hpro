/**
 * Word reader of the author path (S5): an OOXML text document (ECMA-376 part 1, `.docx`) becomes
 * the document model. The mapping is the OOXML column of part 0, table 15.2, with the decisions of
 * the author's guide (part 5, chapter 4.7):
 *
 * - structure only from styles (`w:pStyle` through `w:basedOn`), outline levels (`w:outlineLvl`),
 *   numbering (`w:numPr`, `numbering.xml`) and table definitions, never from appearance
 *   (HP-MIN-003); direct bold/italic become a CSS class, not `strong`/`em` (HP-MIN-012);
 * - title style → h1; outline level n → h<n+2> with a title, h<n+1> without;
 * - lists from `w:numPr` (`bullet` → ul, other formats → ol, `start` for continued numbering);
 * - tables with `w:tblHeader` rows → thead, `w:gridSpan` → colspan, `w:vMerge` → rowspan;
 * - captions are paragraphs with a `SEQ` field (or a caption style) next to a table or picture;
 * - pictures (`w:drawing` with `pic:pic`) with `wp:docPr/@descr` as alternative text and the
 *   decorative flag of Office 2019 (`adec:decorative`);
 * - footnotes and endnotes from their parts, bookmarks as kennungen, `REF`/`PAGEREF`/`HYPERLINK`
 *   fields and `w:hyperlink` as references.
 *
 * Everything else — comments, tracked changes, text boxes, charts, formulas, OLE objects, content
 * controls, other fields, headers and footers, page and section breaks — is carried over as text
 * where possible and always reported.
 */
import { DOMParser } from '@xmldom/xmldom';
import { readZip } from '../zip.js';
import { Messages, text, type AuthorSource, type Block, type Cell, type Inline, type SourceMeta } from './model.js';
import { normalizeDate } from './write.js';

export const DOCX_TOOL = { name: 'hpro-author-docx', version: '0.1.0' } as const;
export const DOCX_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface DocxOptions {
  /**
   * Pictures in formats outside the core media types (EMF, WMF, TIFF, BMP) cannot be converted by
   * the core. Default: stop with an error naming the picture (HP-MIN-007). With this option the
   * picture is replaced by a visible placeholder and reported as lost.
   */
  readonly omitUnsupportedImages?: boolean;
}

/** Thrown when the input is not a Word document or a picture cannot be converted. */
export class DocxError extends Error {}

const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  v: 'urn:schemas-microsoft-com:vml',
  m: 'http://schemas.openxmlformats.org/officeDocument/2006/math',
  wps: 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  cp: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
  custom: 'http://schemas.openxmlformats.org/officeDocument/2006/custom-properties',
  vt: 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes',
  adec: 'http://schemas.microsoft.com/office/drawing/2017/decorative',
  asvg: 'http://schemas.microsoft.com/office/drawing/2016/SVG/main',
} as const;
type Prefix = keyof typeof NS;

// xmldom node types used here (structural, to avoid depending on DOM lib typings).
interface XNode {
  readonly nodeType: number;
  readonly childNodes: ArrayLike<XNode>;
  readonly textContent: string | null;
  readonly parentNode: XNode | null;
}
interface XEl extends XNode {
  readonly namespaceURI: string | null;
  readonly localName: string;
  getAttributeNS(ns: string | null, local: string): string | null;
  getAttribute(name: string): string | null;
  hasAttributeNS(ns: string | null, local: string): boolean;
}

const isEl = (n: XNode): n is XEl => n.nodeType === 1;
const kids = (el: XNode): XEl[] => Array.from(el.childNodes).filter(isEl);
const is = (n: XNode, p: Prefix, local: string): boolean => isEl(n) && n.namespaceURI === NS[p] && n.localName === local;
const child = (el: XEl, p: Prefix, local: string): XEl | undefined => kids(el).find((c) => is(c, p, local));
const wAttr = (el: XEl | undefined, local: string): string | null => (el ? el.getAttributeNS(NS.w, local) : null);
const val = (el: XEl | undefined): string | null => wAttr(el, 'val');
/** `w:b`, `w:i` …: on unless `w:val` is false/0/off. */
const on = (el: XEl | undefined): boolean => !!el && !['false', '0', 'off', 'none'].includes((val(el) ?? 'true').toLowerCase());

function descendants(el: XEl, p: Prefix, local: string): XEl[] {
  const out: XEl[] = [];
  const walk = (n: XEl) => {
    for (const c of kids(n)) {
      if (is(c, p, local)) out.push(c);
      walk(c);
    }
  };
  walk(el);
  return out;
}

function parseXml(data: Uint8Array | undefined, path: string): XEl | undefined {
  if (!data) return undefined;
  const problems: string[] = [];
  const doc = new DOMParser({
    onError: (level: string, message: string) => {
      if (level !== 'warning') problems.push(message);
    },
  }).parseFromString(new TextDecoder().decode(data), 'text/xml') as unknown as { documentElement: XEl | null };
  if (problems.length > 0 || !doc.documentElement) throw new DocxError(`${path}: kein wohlgeformtes XML (${problems[0] ?? 'leer'})`);
  return doc.documentElement;
}

export function sniffImage(data: Uint8Array): { mediaType?: string; label: string } {
  const hex = [...data.subarray(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.startsWith('89504e47')) return { mediaType: 'image/png', label: 'PNG' };
  if (hex.startsWith('ffd8ff')) return { mediaType: 'image/jpeg', label: 'JPEG' };
  if (hex.startsWith('47494638')) return { mediaType: 'image/gif', label: 'GIF' };
  if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return { mediaType: 'image/webp', label: 'WebP' };
  const head = new TextDecoder().decode(data.subarray(0, 512));
  if (/<svg[\s>]/.test(head)) return { mediaType: 'image/svg+xml', label: 'SVG' };
  if (hex.startsWith('424d')) return { label: 'BMP' };
  if (hex.startsWith('49492a00') || hex.startsWith('4d4d002a')) return { label: 'TIFF' };
  if (hex.startsWith('01000000') && hex.slice(80, 88) === '20454d46') return { label: 'EMF' };
  if (hex.startsWith('01000000')) return { label: 'EMF' };
  if (hex.startsWith('d7cdc69a') || hex.startsWith('01000900')) return { label: 'WMF' };
  return { label: 'unbekannt' };
}

// ------------------------------------------------------------------------------------ styles

interface StyleInfo {
  readonly type: string;
  readonly name: string;
  readonly basedOn: string | null;
  readonly outline: number | null;
  readonly numId: string | null;
  readonly ilvl: number | null;
  readonly vertAlign: string | null;
}

type ParaRole = { role: 'title' | 'quote' | 'pre' | 'caption' | 'p' } | { role: 'heading'; level: number };

const PARA_ROLE_BY_ID: Record<string, 'title' | 'quote' | 'pre' | 'caption'> = {
  title: 'title', quote: 'quote', intensequote: 'quote', quotations: 'quote', htmlpreformatted: 'pre', preformattedtext: 'pre', caption: 'caption',
};
const PARA_ROLE_BY_NAME: Record<string, 'title' | 'quote' | 'pre' | 'caption'> = {
  title: 'title', quote: 'quote', 'intense quote': 'quote', quotations: 'quote', 'html preformatted': 'pre', 'preformatted text': 'pre', caption: 'caption',
};
const CHAR_ROLE_BY_ID: Record<string, 'strong' | 'em' | 'code'> = { strong: 'strong', strongemphasis: 'strong', emphasis: 'em', htmlcode: 'code', sourcetext: 'code', htmlkeyboard: 'code' };
const CHAR_ROLE_BY_NAME: Record<string, 'strong' | 'em' | 'code'> = { strong: 'strong', 'strong emphasis': 'strong', emphasis: 'em', 'html code': 'code', 'source text': 'code' };

class Styles {
  readonly map = new Map<string, StyleInfo>();
  defaultParagraph: string | null = null;
  language: string | null = null;
  constructor(root: XEl | undefined) {
    if (!root) return;
    const lang = descendants(root, 'w', 'docDefaults')[0];
    if (lang) this.language = wAttr(descendants(lang, 'w', 'lang')[0], 'val');
    for (const s of kids(root).filter((c) => is(c, 'w', 'style'))) {
      const id = wAttr(s, 'styleId');
      if (!id) continue;
      const pPr = child(s, 'w', 'pPr');
      const rPr = child(s, 'w', 'rPr');
      const numPr = pPr ? child(pPr, 'w', 'numPr') : undefined;
      const outline = pPr ? val(child(pPr, 'w', 'outlineLvl')) : null;
      const type = wAttr(s, 'type') ?? 'paragraph';
      if (type === 'paragraph' && wAttr(s, 'default') && ['1', 'true'].includes(wAttr(s, 'default')!)) this.defaultParagraph = id;
      this.map.set(id, {
        type,
        name: val(child(s, 'w', 'name')) ?? id,
        basedOn: val(child(s, 'w', 'basedOn')),
        outline: outline !== null && /^\d$/.test(outline) && Number(outline) < 9 ? Number(outline) : null,
        numId: numPr ? val(child(numPr, 'w', 'numId')) : null,
        ilvl: numPr && val(child(numPr, 'w', 'ilvl')) !== null ? Number(val(child(numPr, 'w', 'ilvl'))) : null,
        vertAlign: rPr ? val(child(rPr, 'w', 'vertAlign')) : null,
      });
    }
  }
  chain(id: string | null): Array<StyleInfo & { id: string }> {
    const out: Array<StyleInfo & { id: string }> = [];
    let cur = id ?? this.defaultParagraph;
    for (let i = 0; cur && i < 30; i++) {
      const s = this.map.get(cur);
      if (!s) break;
      out.push({ ...s, id: cur });
      cur = s.basedOn;
    }
    return out;
  }
  /** Role of a paragraph style (table 15.2): the first matching style in the basedOn chain. */
  paraRole(id: string | null): ParaRole {
    for (const s of this.chain(id)) {
      const byId = PARA_ROLE_BY_ID[s.id.toLowerCase()];
      const byName = PARA_ROLE_BY_NAME[s.name.toLowerCase()];
      if (byId || byName) return { role: (byId ?? byName)! };
      if (s.outline !== null) return { role: 'heading', level: s.outline };
      const h = /^heading ([1-9])$/i.exec(s.name);
      if (h) return { role: 'heading', level: Number(h[1]) - 1 };
    }
    return { role: 'p' };
  }
  charRole(id: string | null): { role?: 'strong' | 'em' | 'code'; vertAlign?: string } {
    for (const s of this.chain(id)) {
      const r = CHAR_ROLE_BY_ID[s.id.toLowerCase()] ?? CHAR_ROLE_BY_NAME[s.name.toLowerCase()];
      if (r) return { role: r };
      if (s.vertAlign === 'superscript' || s.vertAlign === 'subscript') return { vertAlign: s.vertAlign };
    }
    return {};
  }
  numbering(id: string | null): { numId: string; ilvl: number; depth?: number } | null {
    for (const s of this.chain(id)) {
      if (s.numId === null) continue;
      // Word's built-in „List Bullet 2“, „List Number 3“ … carry their level in the style, not in w:ilvl.
      const byName = /^list (bullet|number) ([2-9])$/i.exec(this.chain(id)[0]!.name);
      return { numId: s.numId, ilvl: s.ilvl ?? 0, ...(!s.ilvl && byName ? { depth: Number(byName[2]) - 1 } : {}) };
    }
    return null;
  }
  /** Display name of the style for `data-hp-style` (HP-MIN-012). */
  displayName(id: string | null): string | undefined {
    const s = this.chain(id)[0];
    return s ? s.name.replace(/^heading (\d)$/i, 'Heading $1').replace(/^title$/i, 'Title') : undefined;
  }
}

// ------------------------------------------------------------------------------------ numbering

class Numbering {
  private readonly nums = new Map<string, { abstract: string; overrides: Map<number, number> }>();
  private readonly abstracts = new Map<string, Map<number, { fmt: string; start: number }>>();
  constructor(root: XEl | undefined) {
    if (!root) return;
    for (const a of kids(root).filter((c) => is(c, 'w', 'abstractNum'))) {
      const lv = new Map<number, { fmt: string; start: number }>();
      for (const l of kids(a).filter((c) => is(c, 'w', 'lvl'))) {
        lv.set(Number(wAttr(l, 'ilvl') ?? 0), { fmt: val(child(l, 'w', 'numFmt')) ?? 'decimal', start: Number(val(child(l, 'w', 'start')) ?? 1) });
      }
      this.abstracts.set(wAttr(a, 'abstractNumId') ?? '', lv);
    }
    for (const n of kids(root).filter((c) => is(c, 'w', 'num'))) {
      const overrides = new Map<number, number>();
      for (const o of kids(n).filter((c) => is(c, 'w', 'lvlOverride'))) {
        const so = val(child(o, 'w', 'startOverride'));
        if (so !== null) overrides.set(Number(wAttr(o, 'ilvl') ?? 0), Number(so));
      }
      this.nums.set(wAttr(n, 'numId') ?? '', { abstract: val(child(n, 'w', 'abstractNumId')) ?? '', overrides });
    }
  }
  level(numId: string, ilvl: number): { fmt: string; start: number } | undefined {
    const n = this.nums.get(numId);
    if (!n) return undefined;
    const l = this.abstracts.get(n.abstract)?.get(ilvl);
    if (!l) return undefined;
    return { fmt: l.fmt, start: n.overrides.get(ilvl) ?? l.start };
  }
}

// ------------------------------------------------------------------------------------ reader

/** Intermediate blocks before lists and captions are grouped. */
type Raw =
  | { readonly t: 'block'; readonly block: Block }
  /** `ilvl`: nesting depth; `fmtLevel`: level of the numbering definition (differs for „List Bullet 2“). */
  | { readonly t: 'li'; readonly numId: string; readonly ilvl: number; readonly fmtLevel: number; readonly ordered: boolean; readonly p: Block & { t: 'p' } }
  | { readonly t: 'caption'; readonly kind: 'figure' | 'table' | 'unknown'; readonly c: readonly Inline[]; readonly marks: readonly string[] };

interface Field {
  instr: string;
  phase: 'instr' | 'result';
  result: Inline[];
  /** Paragraph content inside the result is dropped (TOC, INDEX). */
  drop: boolean;
}

interface Fmt {
  role?: 'strong' | 'em' | 'code';
  script?: 'sup' | 'sub';
  cls: string[];
}

const AUTO_BOOKMARK = /^(_|Ref_[A-Za-z]+\d+_)/;
const SUPPORTED_CHOICES = new Set(['wps', 'wpg', 'wp14', 'w14', 'w15', 'w16se', 'a14', 'v', 'wpc', 'asvg']);
const FIGURE_SEQ = /^(abbildung|abb|figure|fig|bild|illustration|grafik|drawing|zeichnung)/i;
const TABLE_SEQ = /^(tabelle|tab|table)/i;

export async function readDocx(bytes: Uint8Array, options: DocxOptions = {}): Promise<AuthorSource> {
  const msg = new Messages();
  const inv: Record<string, number> = {};
  const seen = (k: string, n = 1) => (inv[k] = (inv[k] ?? 0) + n);
  let entries;
  try {
    entries = await readZip(bytes);
  } catch (err) {
    throw new DocxError(`kein ZIP-Archiv: ${(err as Error).message}`);
  }
  const files = new Map(entries.map((e) => [e.name, e.data]));
  const rootRels = parseXml(files.get('_rels/.rels'), '_rels/.rels');
  const officeRel = rootRels ? kids(rootRels).find((r) => (r.getAttribute('Type') ?? '').endsWith('/officeDocument')) : undefined;
  const mainPath = (officeRel?.getAttribute('Target') ?? 'word/document.xml').replace(/^\//, '');
  const main = parseXml(files.get(mainPath), mainPath);
  if (!main || !is(main, 'w', 'document')) throw new DocxError(`${mainPath} fehlt oder ist kein WordprocessingML-Dokument (w:document); Strict-OOXML und .doc werden nicht gelesen`);
  const dir = mainPath.includes('/') ? mainPath.slice(0, mainPath.lastIndexOf('/') + 1) : '';
  const relsPath = `${dir}_rels/${mainPath.slice(dir.length)}.rels`;
  const rels = new Map<string, { type: string; target: string; external: boolean }>();
  const relRoot = parseXml(files.get(relsPath), relsPath);
  for (const r of relRoot ? kids(relRoot) : []) {
    const target = r.getAttribute('Target') ?? '';
    const external = r.getAttribute('TargetMode') === 'External';
    rels.set(r.getAttribute('Id') ?? '', { type: (r.getAttribute('Type') ?? '').split('/').pop() ?? '', target: external ? target : resolvePart(dir, target), external });
  }
  const partOf = (type: string) => [...rels.values()].find((r) => r.type === type && !r.external)?.target;
  const styles = new Styles(parseXml(files.get(partOf('styles') ?? `${dir}styles.xml`), 'styles.xml'));
  const numbering = new Numbering(parseXml(files.get(partOf('numbering') ?? `${dir}numbering.xml`), 'numbering.xml'));
  const notes = new Map<string, XEl>();
  for (const [type, kind] of [['footnotes', 'footnote'], ['endnotes', 'endnote']] as const) {
    const root = parseXml(files.get(partOf(type) ?? ''), `${type}.xml`);
    for (const n of root ? kids(root).filter((c) => is(c, 'w', kind)) : []) {
      const t = wAttr(n, 'type');
      if (t && t !== 'normal') continue;
      notes.set(`${kind}:${wAttr(n, 'id')}`, n);
    }
  }
  const comments = parseXml(files.get(partOf('comments') ?? ''), 'comments.xml');
  const commentCount = comments ? kids(comments).filter((c) => is(c, 'w', 'comment')).length : 0;

  // ---------------------------------------------------------------- metadata
  const core = parseXml(files.get('docProps/core.xml'), 'docProps/core.xml');
  const coreText = (p: Prefix, local: string) => {
    const el = core ? descendants(core, p, local)[0] : undefined;
    const v = el?.textContent?.trim();
    return v ? v : undefined;
  };
  const custom = parseXml(files.get('docProps/custom.xml'), 'docProps/custom.xml');
  let customId: string | undefined;
  for (const p of custom ? kids(custom) : []) if (p.getAttribute('name') === 'hpro:id') customId = p.textContent?.trim() || undefined;
  const identifier = coreText('dc', 'identifier');
  const modifiedRaw = coreText('dcterms', 'modified');
  const modified = modifiedRaw ? normalizeDate(modifiedRaw) : undefined;
  if (modifiedRaw && !/[Zz]|[+-]\d\d:\d\d$/.test(modifiedRaw)) msg.add('datum-ohne-zone', 'metadaten', 'hinweis', `dcterms:modified „${modifiedRaw}“ ohne Zeitzone; als UTC gelesen.`);
  const creator = coreText('dc', 'creator');

  // ---------------------------------------------------------------- body
  const body = child(main, 'w', 'body');
  if (!body) throw new DocxError('w:body fehlt');
  const hasTitle = descendants(body, 'w', 'pStyle').some((s) => {
    const r = styles.paraRole(val(s));
    return r.role === 'title' && s.parentNode && (s.parentNode as XEl).parentNode && is((s.parentNode as XEl).parentNode as XNode, 'w', 'p');
  });
  const fields: Field[] = [];
  const counters = new Map<string, Array<number | undefined>>();
  const imageNames = new Set<string>();
  let noteDepth = 0;

  const resolveImage = (rid: string | null, name: string): { data: Uint8Array; mediaType: string; name: string } | { error: string } => {
    const rel = rid ? rels.get(rid) : undefined;
    if (!rel) return { error: 'Bildverweis ohne Beziehung' };
    if (rel.external) return { error: `nur verknüpft (${rel.target}), nicht eingebettet` };
    const data = files.get(rel.target);
    if (!data) return { error: `Bilddatei ${rel.target} fehlt im Archiv` };
    const sniff = sniffImage(data);
    if (!sniff.mediaType) return { error: `Format ${sniff.label} ist kein Kernmedientyp` };
    const n = name.replace(/[\\/]/g, '_') || rel.target.split('/').pop()!.replace(/\.[A-Za-z0-9]+$/, '');
    imageNames.add(n);
    return { data, mediaType: sniff.mediaType, name: n };
  };

  /** A picture from `w:drawing`; returns the block to place after the paragraph. */
  const drawing = (d: XEl, extra: Block[]): void => {
    const holder = kids(d).find((c) => is(c, 'wp', 'inline') || is(c, 'wp', 'anchor'));
    if (!holder) return;
    const docPr = child(holder, 'wp', 'docPr');
    const name = docPr?.getAttribute('name') ?? 'Bild';
    const descr = docPr?.getAttribute('descr')?.trim() || docPr?.getAttribute('title')?.trim() || '';
    const decorative = docPr ? descendants(docPr, 'adec', 'decorative').some((x) => ['1', 'true'].includes(x.getAttribute('val') ?? '')) : false;
    const graphicData = descendants(holder, 'a', 'graphicData')[0];
    const uri = graphicData?.getAttribute('uri') ?? '';
    const ext = child(holder, 'wp', 'extent');
    const px = (v: string | null | undefined) => (v ? Math.round(Number(v) / 9525) : undefined);
    if (is(holder, 'wp', 'anchor')) seen('bild-schwebend');
    if (uri.endsWith('/picture')) {
      seen('bild');
      const blip = descendants(graphicData!, 'a', 'blip')[0];
      const svg = blip ? descendants(blip, 'asvg', 'svgBlip')[0] : undefined;
      const rid = svg?.getAttributeNS(NS.r, 'embed') ?? blip?.getAttributeNS(NS.r, 'embed') ?? null;
      const img = resolveImage(rid, name);
      if ('error' in img) {
        if (!options.omitUnsupportedImages) throw new DocxError(`Bild „${name}“: ${img.error}; vor dem Import nach PNG oder SVG umwandeln oder mit --bild-auslassen ersetzen (HP-MIN-007)`);
        msg.add('bild-ausgelassen', 'bild', 'verlust', `Bild „${name}“: ${img.error}; durch einen Platzhalter ersetzt (--bild-auslassen).`);
        extra.push({ t: 'gap', text: `Bild „${name}“ nicht übernommen${descr ? `: ${descr}` : ''}` });
        return;
      }
      const w = px(ext?.getAttribute('cx'));
      const h = px(ext?.getAttribute('cy'));
      extra.push({ t: 'figure', image: img, alt: decorative ? '' : descr || null, ...(decorative ? { decorative: true } : {}), ...(w && h ? { width: w, height: h } : {}) });
      return;
    }
    if (uri.endsWith('/chart')) {
      seen('diagramm');
      msg.add('diagramm', 'objekt', 'verlust', `Diagramm „${name}“ nicht übernommen (nur der Name bleibt); Werte stehen in der Quelle.`);
      extra.push({ t: 'gap', text: `Diagramm „${name}“ nicht übernommen${descr ? `: ${descr}` : ''}` });
      return;
    }
    const txbx = descendants(holder, 'w', 'txbxContent')[0];
    if (txbx) {
      seen('textfeld');
      msg.add('textfeld', 'objekt', 'ersatz', 'Textfeld aufgelöst: sein Text steht als gewöhnlicher Absatz nach dem Absatz, an dem es verankert war; Lage und Rahmen gehen verloren.');
      extra.push(...blocks(kids(txbx)));
      return;
    }
    seen('zeichnung');
    msg.add('zeichnung', 'objekt', 'verlust', `Zeichnungsobjekt „${name}“ (${uri.split('/').pop() || 'unbekannt'}) nicht übernommen.`);
    extra.push({ t: 'gap', text: `Zeichnung „${name}“ nicht übernommen${descr ? `: ${descr}` : ''}` });
  };

  /** Legacy VML picture or text box (`w:pict`, `w:object`). */
  const vml = (el: XEl, extra: Block[]): void => {
    const txbx = descendants(el, 'w', 'txbxContent')[0];
    if (txbx) {
      seen('textfeld');
      msg.add('textfeld', 'objekt', 'ersatz', 'Textfeld aufgelöst: sein Text steht als gewöhnlicher Absatz nach dem Absatz, an dem es verankert war; Lage und Rahmen gehen verloren.');
      extra.push(...blocks(kids(txbx)));
      return;
    }
    if (is(el, 'w', 'object')) {
      seen('ole-objekt');
      msg.add('ole-objekt', 'objekt', 'verlust', 'Eingebettetes Objekt (OLE) nicht übernommen.');
      extra.push({ t: 'gap', text: 'Eingebettetes Objekt nicht übernommen' });
      return;
    }
    const imagedata = descendants(el, 'v', 'imagedata')[0];
    if (imagedata) {
      seen('bild');
      const name = descendants(el, 'v', 'shape')[0]?.getAttribute('alt') || 'Bild';
      const img = resolveImage(imagedata.getAttributeNS(NS.r, 'id'), name);
      if ('error' in img) {
        if (!options.omitUnsupportedImages) throw new DocxError(`Bild „${name}“: ${img.error} (HP-MIN-007)`);
        msg.add('bild-ausgelassen', 'bild', 'verlust', `Bild „${name}“: ${img.error}; durch einen Platzhalter ersetzt.`);
        extra.push({ t: 'gap', text: `Bild „${name}“ nicht übernommen` });
        return;
      }
      extra.push({ t: 'figure', image: img, alt: null });
    }
  };

  const fieldKind = (instr: string): { name: string; arg: string; drop: boolean } => {
    const m = /^\s*([A-Za-z]+)\s*(?:"([^"]*)"|(\S+))?/.exec(instr);
    const name = (m?.[1] ?? '').toUpperCase();
    return { name, arg: m?.[2] ?? m?.[3] ?? '', drop: ['TOC', 'INDEX', 'TOA', 'BIBLIOGRAPHY'].includes(name) };
  };

  /** Finishes a field: its result becomes plain text, a reference or a link. */
  const closeField = (f: Field, sink: Inline[], ctx: ParaCtx): void => {
    const { name, arg } = fieldKind(f.instr);
    seen(`feld-${name.toLowerCase() || 'leer'}`);
    const anchor = /\\l\s+"([^"]+)"/.exec(f.instr)?.[1];
    switch (name) {
      case 'REF':
      case 'NOTEREF':
        sink.push({ t: 'ref', target: arg, c: f.result.length > 0 ? f.result : [text(arg)] });
        return;
      case 'PAGEREF':
        sink.push({ t: 'ref', target: arg, c: f.result, page: true });
        return;
      case 'HYPERLINK':
        if (anchor && !arg) sink.push({ t: 'ref', target: anchor, c: f.result });
        else sink.push({ t: 'link', href: anchor ? `${arg}#${anchor}` : arg, c: f.result });
        return;
      case 'SEQ':
        ctx.seq = arg || ctx.seq || 'SEQ';
        sink.push(...f.result);
        return;
      case 'TOC':
      case 'INDEX':
      case 'TOA':
      case 'BIBLIOGRAPHY':
        msg.add('verzeichnis', 'feld', 'hinweis', `Verzeichnisfeld ${name} entfällt; das Navigationsdokument ersetzt das Inhaltsverzeichnis, Seitenzahlen gibt es nicht (HP-ADR-007).`);
        return;
      case 'PAGE':
      case 'NUMPAGES':
      case 'SECTIONPAGES':
        msg.add('feld-seite', 'feld', 'verlust', `Seitenzahlfeld ${name} im Text entfällt (hpro hat keine Seiten).`);
        return;
      case '':
        sink.push(...f.result);
        return;
      default:
        msg.add('feld-als-text', 'feld', 'ersatz', `Feld ${name} als zuletzt berechneter Text übernommen; die Feldfunktion entfällt.`);
        sink.push(...f.result);
    }
  };

  interface ParaCtx {
    marks: string[];
    seq?: string;
    hasDrawing: boolean;
  }

  /** Inline content of a run container (paragraph, hyperlink, ins, sdtContent …). */
  const inlines = (nodes: readonly XEl[], out: Inline[], extra: Block[], ctx: ParaCtx): void => {
    let segs: Array<{ text: string; fmt: Fmt }> = [];
    const target = (): Inline[] => {
      const top = fields[fields.length - 1];
      return top && top.phase === 'result' ? top.result : out;
    };
    const flush = () => {
      if (segs.length === 0) return;
      const sink = target();
      // Merge adjacent text with the same formatting.
      let i = 0;
      while (i < segs.length) {
        let j = i;
        let t = '';
        const key = JSON.stringify(segs[i]!.fmt);
        while (j < segs.length && JSON.stringify(segs[j]!.fmt) === key) t += segs[j++]!.text;
        const f = segs[i]!.fmt;
        let node: Inline = f.role === 'code' ? { t: 'code', v: t } : text(t);
        if (f.script) node = { t: f.script, c: [node] };
        if (f.role === 'strong' || f.role === 'em') node = { t: f.role, c: [node] };
        if (f.cls.length > 0) node = { t: 'span', cls: f.cls.join(' '), c: [node] };
        sink.push(node);
        i = j;
      }
      segs = [];
    };
    const push = (i: Inline) => {
      flush();
      target().push(i);
    };
    const inInstr = () => fields.length > 0 && fields[fields.length - 1]!.phase === 'instr';
    const dropping = () => fields.some((f) => f.drop && f.phase === 'result');

    for (const n of nodes) {
      if (is(n, 'w', 'r')) {
        const rPr = child(n, 'w', 'rPr');
        const cr = styles.charRole(rPr ? val(child(rPr, 'w', 'rStyle')) : null);
        const fmt: Fmt = { cls: [] };
        if (cr.role) fmt.role = cr.role;
        const va = rPr ? val(child(rPr, 'w', 'vertAlign')) : null;
        const script = va ?? cr.vertAlign;
        if (script === 'superscript') fmt.script = 'sup';
        else if (script === 'subscript') fmt.script = 'sub';
        if (rPr && !cr.role) {
          if (on(child(rPr, 'w', 'b'))) fmt.cls.push('hp-fett');
          if (on(child(rPr, 'w', 'i'))) fmt.cls.push('hp-kursiv');
        }
        if (rPr && on(child(rPr, 'w', 'u'))) fmt.cls.push('hp-unterstrichen');
        if (rPr && (on(child(rPr, 'w', 'strike')) || on(child(rPr, 'w', 'dstrike')))) fmt.cls.push('hp-durchgestrichen');
        if (rPr && on(child(rPr, 'w', 'vanish'))) {
          seen('versteckt');
          msg.add('versteckter-text', 'text', 'verlust', 'Ausgeblendeter Text (w:vanish) nicht übernommen.');
          continue;
        }
        for (const c of kids(n)) {
          if (is(c, 'w', 'fldChar')) {
            flush();
            const type = wAttr(c, 'fldCharType');
            if (type === 'begin') fields.push({ instr: '', phase: 'instr', result: [], drop: false });
            else if (type === 'separate' && fields.length > 0) {
              const f = fields[fields.length - 1]!;
              f.phase = 'result';
              f.drop = fieldKind(f.instr).drop;
            } else if (type === 'end' && fields.length > 0) {
              const f = fields.pop()!;
              if (f.phase === 'instr') f.phase = 'result';
              closeField(f, target(), ctx);
            }
          } else if (is(c, 'w', 'instrText')) {
            if (fields.length > 0) fields[fields.length - 1]!.instr += c.textContent ?? '';
          } else if (inInstr()) continue;
          else if (is(c, 'w', 't')) {
            if (dropping()) continue;
            const t = c.textContent ?? '';
            if (fmt.cls.length > 0 && t.trim()) seen('direktformat');
            segs.push({ text: t, fmt });
          } else if (is(c, 'w', 'tab') || is(c, 'w', 'ptab')) segs.push({ text: ' ', fmt });
          else if (is(c, 'w', 'noBreakHyphen')) segs.push({ text: '\u2011', fmt });
          else if (is(c, 'w', 'softHyphen')) continue;
          else if (is(c, 'w', 'sym')) {
            const code = Number.parseInt(wAttr(c, 'char') ?? '', 16);
            if (Number.isFinite(code)) segs.push({ text: String.fromCodePoint(code >= 0xf000 ? code - 0xf000 : code), fmt });
            if ((wAttr(c, 'font') ?? '').match(/symbol|wingdings/i)) msg.add('symbolzeichen', 'text', 'ersatz', `Zeichen aus der Schrift „${wAttr(c, 'font')}“ als Unicode-Zeichen ohne Gewähr übernommen.`);
          } else if (is(c, 'w', 'br') || is(c, 'w', 'cr')) {
            const type = wAttr(c, 'type');
            if (type === 'page' || type === 'column') {
              seen('seitenumbruch');
              msg.add('seitenumbruch', 'format', 'hinweis', 'Seiten- und Spaltenumbrüche entfallen (hpro ist fließend; der Druck setzt Umbrüche selbst, HP-PRINT-001).');
            } else push({ t: 'br' });
          } else if (is(c, 'w', 'footnoteReference') || is(c, 'w', 'endnoteReference')) {
            const kind = c.localName === 'footnoteReference' ? 'footnote' : 'endnote';
            const note = notes.get(`${kind}:${wAttr(c, 'id')}`);
            seen(kind === 'footnote' ? 'fussnote' : 'endnote');
            if (!note) {
              msg.add('notiz-fehlt', 'fussnote', 'verlust', `${kind === 'footnote' ? 'Fußnote' : 'Endnote'} ${wAttr(c, 'id')} verweist auf keinen Notentext.`);
              continue;
            }
            noteDepth++;
            const nb = blocks(kids(note));
            noteDepth--;
            push({ t: 'note', kind, blocks: nb });
          } else if (is(c, 'w', 'drawing')) {
            flush();
            ctx.hasDrawing = true;
            drawing(c, extra);
          } else if (is(c, 'w', 'pict') || is(c, 'w', 'object')) {
            flush();
            ctx.hasDrawing = true;
            vml(c, extra);
          } else if (is(c, 'mc', 'AlternateContent')) {
            flush();
            const choice = kids(c).find((x) => is(x, 'mc', 'Choice') && (x.getAttribute('Requires') ?? '').split(/\s+/).every((p) => SUPPORTED_CHOICES.has(p)));
            const branch = choice ?? kids(c).find((x) => is(x, 'mc', 'Fallback'));
            if (branch) {
              for (const b of kids(branch)) {
                if (is(b, 'w', 'drawing')) (ctx.hasDrawing = true), drawing(b, extra);
                else if (is(b, 'w', 'pict') || is(b, 'w', 'object')) (ctx.hasDrawing = true), vml(b, extra);
              }
            }
          } else if (is(c, 'w', 'footnoteRef') || is(c, 'w', 'endnoteRef') || is(c, 'w', 'separator') || is(c, 'w', 'continuationSeparator')) continue;
          else if (is(c, 'w', 'commentReference') || is(c, 'w', 'lastRenderedPageBreak') || is(c, 'w', 'rPr') || is(c, 'w', 'delText') || is(c, 'w', 'annotationRef')) continue;
          else if (is(c, 'w', 'fldData') || is(c, 'w', 'ruby')) continue;
          else {
            msg.add('lauf-unbekannt', 'text', 'verlust', `Element w:${c.localName} im Textlauf nicht übernommen.`);
          }
        }
      } else if (is(n, 'w', 'hyperlink')) {
        flush();
        const inner: Inline[] = [];
        inlines(kids(n), inner, extra, ctx);
        const rid = n.getAttributeNS(NS.r, 'id');
        const anchor = wAttr(n, 'anchor');
        const rel = rid ? rels.get(rid) : undefined;
        seen('hyperlink');
        if (rel?.external) push({ t: 'link', href: anchor ? `${rel.target}#${anchor}` : rel.target, c: inner });
        else if (anchor) push({ t: 'ref', target: anchor, c: inner });
        else for (const x of inner) push(x);
      } else if (is(n, 'w', 'fldSimple')) {
        flush();
        const f: Field = { instr: wAttr(n, 'instr') ?? '', phase: 'result', result: [], drop: false };
        f.drop = fieldKind(f.instr).drop;
        fields.push(f);
        inlines(kids(n), f.result, extra, ctx);
        fields.pop();
        closeField(f, target(), ctx);
      } else if (is(n, 'w', 'bookmarkStart')) {
        const name = wAttr(n, 'name');
        if (name && name !== '_GoBack') {
          seen('textmarke');
          // Automatic bookmarks of the program (Word `_Ref…`/`_Toc…`, LibreOffice `Ref_<Kategorie><n>_…`
          // for caption references) are targets, not names chosen by the author: alias only.
          ctx.marks.push(AUTO_BOOKMARK.test(name) ? `\u0001${name}` : name);
        }
      } else if (is(n, 'w', 'ins') || is(n, 'w', 'moveTo')) {
        seen('aenderung-eingefuegt');
        msg.add('aenderungen', 'text', 'hinweis', 'Änderungsverfolgung: Einfügungen und Löschungen gelten als angenommen; der Verlauf der Änderungen wird nicht übernommen.');
        flush();
        inlines(kids(n), out, extra, ctx);
      } else if (is(n, 'w', 'del') || is(n, 'w', 'moveFrom')) {
        seen('aenderung-geloescht');
        msg.add('aenderungen', 'text', 'hinweis', 'Änderungsverfolgung: Einfügungen und Löschungen gelten als angenommen; der Verlauf der Änderungen wird nicht übernommen.');
      } else if (is(n, 'w', 'sdt')) {
        seen('steuerelement');
        msg.add('steuerelement', 'feld', 'ersatz', 'Inhaltssteuerelement: sein Inhalt steht als Text im Dokument; das Steuerelement (Eingabefeld) entfällt.');
        const content = child(n, 'w', 'sdtContent');
        if (content) {
          flush();
          inlines(kids(content), out, extra, ctx);
        }
      } else if (is(n, 'w', 'smartTag') || is(n, 'w', 'customXml') || is(n, 'w', 'dir') || is(n, 'w', 'bdo')) {
        flush();
        inlines(kids(n), out, extra, ctx);
      } else if (is(n, 'm', 'oMath') || is(n, 'm', 'oMathPara')) {
        seen('formel');
        msg.add('formel', 'formel', 'ersatz', 'Formel (OMML) als linearer Text übernommen; Brüche, Hoch- und Tiefstellung der Formel gehen verloren.');
        push({ t: 'code', v: linearMath(n) });
      } else if (is(n, 'w', 'pPr') || is(n, 'w', 'bookmarkEnd') || is(n, 'w', 'proofErr') || is(n, 'w', 'commentRangeStart') || is(n, 'w', 'commentRangeEnd') || is(n, 'w', 'permStart') || is(n, 'w', 'permEnd')) continue;
      else msg.add('element-unbekannt', 'text', 'verlust', `Element w:${n.localName} im Absatz nicht übernommen.`);
    }
    flush();
  };

  const listInfo = (numId: string, ilvl: number): { ordered: boolean; fmt: string } | null => {
    if (numId === '0') return null;
    const lvl = numbering.level(numId, ilvl);
    if (!lvl || lvl.fmt === 'none') return null;
    return { ordered: lvl.fmt !== 'bullet', fmt: lvl.fmt };
  };

  /** One `w:p`. Returns raw blocks (paragraph or heading, list item, caption, figures). */
  const paragraph = (p: XEl): Raw[] => {
    const pPr = child(p, 'w', 'pPr');
    const styleId = pPr ? val(child(pPr, 'w', 'pStyle')) : null;
    let role = styles.paraRole(styleId);
    const directOutline = pPr ? val(child(pPr, 'w', 'outlineLvl')) : null;
    if (directOutline !== null && /^\d$/.test(directOutline) && Number(directOutline) < 9 && role.role === 'p') role = { role: 'heading', level: Number(directOutline) };
    const ctx: ParaCtx = { marks: [], hasDrawing: false };
    const content: Inline[] = [];
    const extra: Block[] = [];
    const wasDropping = fields.some((f) => f.drop && f.phase === 'result');
    inlines(kids(p), content, extra, ctx);
    if (wasDropping && fields.some((f) => f.drop && f.phase === 'result')) return [];
    // Leading and trailing spaces of the paragraph.
    trimInlines(content);
    const style = styleId ? styles.displayName(styleId) : undefined;
    const hasText = content.some((i) => !(i.t === 'text' && !i.v.trim()));
    const out: Raw[] = [];
    if (role.role === 'heading' || role.role === 'title') {
      if (noteDepth > 0) role = { role: 'p' };
    }
    if ((role.role === 'caption' || ctx.seq) && hasText && noteDepth === 0 && !ctx.hasDrawing) {
      const kind = ctx.seq ? (FIGURE_SEQ.test(ctx.seq) ? 'figure' : TABLE_SEQ.test(ctx.seq) ? 'table' : 'unknown') : 'unknown';
      return [{ t: 'caption', kind, c: content, marks: ctx.marks }];
    }
    if (role.role === 'title' && hasText) out.push({ t: 'block', block: { t: 'heading', level: 1, c: content, marks: ctx.marks, ...(style ? { style } : {}) } });
    else if (role.role === 'heading' && hasText) {
      const level = role.level + (hasTitle ? 2 : 1);
      if (level > 6) msg.add('ebene-zu-tief', 'abschnitt', 'ersatz', `Überschrift der Gliederungsebene ${role.level + 1} als h6 übernommen.`);
      out.push({ t: 'block', block: { t: 'heading', level: Math.min(6, level), c: content, marks: ctx.marks, ...(style ? { style } : {}) } });
    } else if (role.role === 'quote' && hasText) out.push({ t: 'block', block: { t: 'quote', blocks: [{ t: 'p', c: content }], marks: ctx.marks, ...(style ? { style } : {}) } });
    else if (role.role === 'pre' && hasText) {
      const t = content.map((i) => (i.t === 'br' ? '\n' : i.t === 'text' || i.t === 'code' ? i.v : '')).join('');
      out.push({ t: 'block', block: { t: 'pre', text: t, marks: ctx.marks, ...(style ? { style } : {}) } });
    } else if (hasText || ctx.marks.length > 0) {
      const direct = pPr ? child(pPr, 'w', 'numPr') : undefined;
      const num: { numId: string; ilvl: number; depth?: number } | null = direct ? { numId: val(child(direct, 'w', 'numId')) ?? '0', ilvl: Number(val(child(direct, 'w', 'ilvl')) ?? 0) } : styles.numbering(styleId);
      const li = num ? listInfo(num.numId, num.ilvl) : null;
      const pBlock = { t: 'p' as const, c: content, ...(ctx.marks.length > 0 ? { marks: ctx.marks } : {}), ...(style && !li ? { style } : {}) };
      if (li && hasText && noteDepth === 0) {
        if (!['bullet', 'decimal', 'none'].includes(li.fmt)) msg.add('nummerierungsart', 'liste', 'ersatz', `Nummerierungsart „${li.fmt}“ als 1, 2, 3 übernommen; das Mindestprofil kennt nur start (HP-MIN-005).`);
        out.push({ t: 'li', numId: num!.numId, ilvl: num!.depth ?? num!.ilvl, fmtLevel: num!.ilvl, ordered: li.ordered, p: pBlock });
      } else if (hasText) out.push({ t: 'block', block: pBlock });
      else if (ctx.marks.length > 0 && extra.length > 0) {
        // A bookmark on a paragraph that only holds a picture belongs to the picture.
        const f = extra[0]!;
        extra[0] = { ...f, marks: [...(f.marks ?? []), ...ctx.marks] } as Block;
      }
    }
    if (extra.length > 0 && hasText && extra.some((b) => b.t === 'figure')) msg.add('bild-im-text', 'bild', 'ersatz', 'Bild im Textabsatz als eigene Abbildung nach dem Absatz gesetzt (Bilder stehen im Mindestprofil in figure).');
    for (const b of extra) out.push({ t: 'block', block: b });
    return out;
  };

  const table = (tbl: XEl): Block => {
    seen('tabelle');
    const head: Cell[][] = [];
    const bodyRows: Cell[][] = [];
    const caption = val(descendants(tbl, 'w', 'tblCaption')[0]);
    // Grid positions of open vertical merges: column → cell to extend.
    const open = new Map<number, { cell: { rowspan: number }; row: number }>();
    let inHead = true;
    let rowNo = 0;
    for (const tr of kids(tbl).filter((c) => is(c, 'w', 'tr'))) {
      const trPr = child(tr, 'w', 'trPr');
      const isHeader = !!trPr && on(child(trPr, 'w', 'tblHeader'));
      if (!isHeader) inHead = false;
      let col = Number(val(trPr ? child(trPr, 'w', 'gridBefore') : undefined) ?? 0);
      const cells: Array<Cell & { rowspan: number }> = [];
      for (const tc of kids(tr).filter((c) => is(c, 'w', 'tc') || is(c, 'w', 'sdt'))) {
        const cellEl = is(tc, 'w', 'sdt') ? child(child(tc, 'w', 'sdtContent')!, 'w', 'tc') : tc;
        if (!cellEl) continue;
        const tcPr = child(cellEl, 'w', 'tcPr');
        const span = Number(val(tcPr ? child(tcPr, 'w', 'gridSpan') : undefined) ?? 1) || 1;
        const vm = tcPr ? child(tcPr, 'w', 'vMerge') : undefined;
        const vmVal = vm ? (val(vm) ?? 'continue') : null;
        if (vmVal === 'continue') {
          const o = open.get(col);
          if (o) o.cell.rowspan++;
          else msg.add('tabelle-verbund', 'tabelle', 'ersatz', 'Senkrecht verbundene Zelle ohne Anfang; als leere Zelle übernommen.');
          if (!o) cells.push({ c: [], rowspan: 1, ...(span > 1 ? { colspan: span } : {}) });
          col += span;
          continue;
        }
        seen('tabelle-zelle');
        const content = blocks(kids(cellEl));
        const cell: Cell & { rowspan: number } = { c: content, rowspan: 1, ...(span > 1 ? { colspan: span } : {}) };
        cells.push(cell);
        for (let k = col; k < col + span; k++) open.delete(k);
        if (vmVal === 'restart') open.set(col, { cell, row: rowNo });
        col += span;
      }
      if (inHead && isHeader) head.push(cells as Cell[]);
      else bodyRows.push(cells as Cell[]);
      rowNo++;
    }
    // Rowspans are counted in place; a header that spans into the body is cut at the header.
    const fix = (rows: Cell[][]) => rows.map((r) => r.map((c) => {
      const rs = (c as Cell & { rowspan: number }).rowspan;
      const { rowspan: _drop, ...rest } = c as Cell & { rowspan: number };
      return rs > 1 ? { ...rest, rowspan: rs } : rest;
    }));
    if (descendants(tbl, 'w', 'tbl').length > 0) seen('tabelle-verschachtelt');
    return { t: 'table', head: fix(head), body: fix(bodyRows), ...(caption ? { caption: [text(caption)] } : {}) };
  };

  /** Block-level children of body, cell, note or text box. */
  function blocks(nodes: readonly XEl[]): Block[] {
    const raw: Raw[] = [];
    for (const n of nodes) {
      if (is(n, 'w', 'p')) raw.push(...paragraph(n));
      else if (is(n, 'w', 'tbl')) raw.push({ t: 'block', block: table(n) });
      else if (is(n, 'w', 'sdt')) {
        seen('steuerelement');
        msg.add('steuerelement', 'feld', 'ersatz', 'Inhaltssteuerelement: sein Inhalt steht als Text im Dokument; das Steuerelement (Eingabefeld) entfällt.');
        const content = child(n, 'w', 'sdtContent');
        if (content) raw.push(...blocks(kids(content)).map((b): Raw => ({ t: 'block', block: b })));
      } else if (is(n, 'w', 'customXml')) raw.push(...blocks(kids(n)).map((b): Raw => ({ t: 'block', block: b })));
      else if (is(n, 'w', 'ins') || is(n, 'w', 'moveTo')) raw.push(...blocks(kids(n)).map((b): Raw => ({ t: 'block', block: b })));
      else if (is(n, 'w', 'del') || is(n, 'w', 'moveFrom')) seen('aenderung-geloescht');
      else if (is(n, 'w', 'sectPr') || is(n, 'w', 'tcPr') || is(n, 'w', 'tblPr') || is(n, 'w', 'tblGrid')) continue;
      else if (is(n, 'w', 'altChunk')) {
        seen('alt-chunk');
        msg.add('alt-chunk', 'objekt', 'verlust', 'Eingebetteter Fremdinhalt (altChunk) nicht übernommen.');
      } else if (is(n, 'w', 'bookmarkStart') || is(n, 'w', 'bookmarkEnd') || is(n, 'w', 'proofErr') || is(n, 'w', 'commentRangeStart') || is(n, 'w', 'commentRangeEnd') || is(n, 'w', 'permStart') || is(n, 'w', 'permEnd')) continue;
      else if (is(n, 'm', 'oMathPara')) {
        seen('formel');
        msg.add('formel', 'formel', 'ersatz', 'Formel (OMML) als linearer Text übernommen; Brüche, Hoch- und Tiefstellung der Formel gehen verloren.');
        raw.push({ t: 'block', block: { t: 'p', c: [{ t: 'code', v: linearMath(n) }] } });
      } else msg.add('element-unbekannt', 'text', 'verlust', `Element w:${n.localName} auf Blockebene nicht übernommen.`);
    }
    return group(raw);
  }

  /** Groups list items into nested lists and attaches captions to their table or picture. */
  function group(raw: readonly Raw[]): Block[] {
    const out: Array<Block | Extract<Raw, { t: 'caption' }>> = [];
    let i = 0;
    while (i < raw.length) {
      const r = raw[i]!;
      if (r.t !== 'li') {
        out.push(r.t === 'block' ? r.block : r);
        i++;
        continue;
      }
      type MList = { ordered: boolean; start: number; items: Block[][] };
      const roots: MList[] = [];
      const stack: Array<{ list: MList; level: number }> = [];
      while (i < raw.length && raw[i]!.t === 'li') {
        const it = raw[i] as Extract<Raw, { t: 'li' }>;
        const c = counters.get(it.numId) ?? [];
        counters.set(it.numId, c);
        if (c[it.ilvl] === undefined) c[it.ilvl] = (numbering.level(it.numId, it.fmtLevel)?.start ?? 1) - 1;
        c[it.ilvl] = c[it.ilvl]! + 1;
        for (let l = it.ilvl + 1; l < c.length; l++) c[l] = undefined;
        const value = c[it.ilvl]!;
        while (stack.length > 0 && stack[stack.length - 1]!.level > it.ilvl) stack.pop();
        const top = stack[stack.length - 1];
        if (!top || top.level < it.ilvl || top.list.ordered !== it.ordered) {
          if (top && top.level === it.ilvl) stack.pop();
          const list: MList = { ordered: it.ordered, start: value, items: [] };
          const parent = stack[stack.length - 1];
          if (parent) {
            if (parent.list.items.length === 0) parent.list.items.push([]);
            parent.list.items[parent.list.items.length - 1]!.push(list as unknown as Block);
          } else roots.push(list);
          stack.push({ list, level: it.ilvl });
        }
        stack[stack.length - 1]!.list.items.push([it.p]);
        seen('listeneintrag');
        i++;
      }
      const freeze = (l: MList): Block => ({
        t: 'list',
        ordered: l.ordered,
        ...(l.ordered ? { start: l.start } : {}),
        items: l.items.map((item) => item.map((b) => ((b as unknown as MList).items ? freeze(b as unknown as MList) : b))),
      });
      for (const l of roots) out.push(freeze(l));
    }
    // Captions: to the preceding picture/table without caption, else to the following one.
    const result: Block[] = [];
    for (let k = 0; k < out.length; k++) {
      const b = out[k]!;
      if (b.t !== 'caption') {
        result.push(b);
        continue;
      }
      const fits = (x: Block | undefined) => !!x && ((x.t === 'figure' && b.kind !== 'table' && !x.caption) || (x.t === 'table' && b.kind !== 'figure' && !x.caption));
      const prev = result[result.length - 1];
      const next = out[k + 1];
      const attach = (x: Block): Block => ({ ...x, caption: b.c, marks: [...(x.marks ?? []), ...b.marks] }) as Block;
      seen('beschriftung');
      if (fits(prev)) result[result.length - 1] = attach(prev!);
      else if (next && next.t !== 'caption' && fits(next)) {
        out[k + 1] = attach(next);
      } else {
        msg.add('beschriftung-allein', 'text', 'hinweis', 'Beschriftung ohne benachbarte Tabelle oder Abbildung als Absatz übernommen.');
        result.push({ t: 'p', c: b.c, ...(b.marks.length > 0 ? { marks: b.marks } : {}) });
      }
    }
    return result;
  }

  const content = blocks(kids(body));
  if (fields.length > 0) msg.add('feld-offen', 'feld', 'hinweis', `${fields.length} Feld(er) ohne Ende; Inhalt bis zum Dokumentende übernommen.`);

  // Headers and footers: text once at the end (part 5, chapter 4.7).
  const headerFooter: Block[] = [];
  const parts = [...rels.values()].filter((r) => !r.external && (r.type === 'header' || r.type === 'footer')).sort((a, b) => (a.type === b.type ? (a.target < b.target ? -1 : 1) : a.type === 'header' ? -1 : 1));
  for (const r of parts) {
    const root = parseXml(files.get(r.target), r.target);
    if (!root) continue;
    const before = fields.length;
    // Paragraphs with a page number field are page furniture („Seite 3 von 7“): left out.
    const pageField = (p: XEl) => [...descendants(p, 'w', 'instrText').map((x) => x.textContent ?? ''), ...descendants(p, 'w', 'fldSimple').map((x) => wAttr(x, 'instr') ?? '')].some((i) => /^\s*(PAGE|NUMPAGES|SECTIONPAGES)\b/i.test(i));
    const furniture = kids(root).filter((p) => is(p, 'w', 'p') && pageField(p)).length;
    if (furniture > 0) msg.add('seitenzahl', 'feld', 'hinweis', 'Seitenzahlen aus Kopf- oder Fußzeile entfallen (hpro hat keine Seiten; der Druck setzt sie neu, HP-PRINT-001).');
    const bl = blocks(kids(root).filter((p) => !(is(p, 'w', 'p') && pageField(p)))).filter((b) => b.t !== 'gap');
    fields.length = before;
    const t = bl.filter((b) => b.t === 'p' && b.c.some((x) => x.t === 'text' && x.v.trim()));
    if (t.length === 0) continue;
    seen(r.type === 'header' ? 'kopfzeile' : 'fusszeile');
    for (const b of t) headerFooter.push({ ...b, style: r.type === 'header' ? 'Kopfzeile' : 'Fußzeile' } as Block);
  }
  if (headerFooter.length > 0) {
    msg.add('kopf-fusszeile', 'format', 'ersatz', 'Kopf- und Fußzeilen: ihr Text steht einmal als Absatz am Ende; Seitenzahlen und Wiederholung je Seite entfallen (Teil 5, Kapitel 4.7).');
    content.push(...headerFooter);
  }
  if (commentCount > 0) {
    seen('kommentar', commentCount);
    msg.add('kommentare', 'kommentar', 'verlust', `${commentCount} Kommentar(e) nicht übernommen; Kommentare gehören als Anmerkungen (W3C Web Annotations) in einen eigenen Arbeitsschritt.`);
  }
  if (!styles.map.size) msg.add('ohne-vorlagen', 'abschnitt', 'hinweis', 'Das Dokument hat keine Formatvorlagen; Überschriften und Listen lassen sich nur aus Vorlagen ableiten (HP-MIN-003).');
  const titleText = coreText('dc', 'title');
  const meta: SourceMeta = {
    ...(titleText ? { title: titleText } : {}),
    ...(coreText('dc', 'language') || styles.language ? { language: (coreText('dc', 'language') ?? styles.language)! } : {}),
    ...(modified ? { modified } : {}),
    ...(customId ? { id: customId } : identifier && /^urn:uuid:/i.test(identifier) ? { id: identifier } : {}),
    ...(creator ? { creators: creator.split(/\s*;\s*/).filter(Boolean) } : {}),
    ...(coreText('dc', 'description') ? { description: coreText('dc', 'description')! } : {}),
  };
  return {
    meta,
    blocks: content,
    messages: msg.all,
    inventory: inv,
    format: { name: 'docx', mediaType: DOCX_MEDIA_TYPE, tool: DOCX_TOOL },
    ...(hasTitle ? {} : { untitled: true }),
  };
}

/** OMML as linear text: fractions `(a)/(b)`, powers `a^(b)`, indices `a_(b)`, roots `√(a)`. */
function linearMath(el: XEl): string {
  const part = (p: XEl | undefined) => (p ? linearMath(p) : '');
  const group = (s: string) => (s.length > 1 ? `(${s})` : s);
  let out = '';
  for (const c of kids(el)) {
    if (is(c, 'm', 't')) out += c.textContent ?? '';
    else if (is(c, 'm', 'f')) out += `${group(part(child(c, 'm', 'num')))}/${group(part(child(c, 'm', 'den')))}`;
    else if (is(c, 'm', 'sSup')) out += `${part(child(c, 'm', 'e'))}^${group(part(child(c, 'm', 'sup')))}`;
    else if (is(c, 'm', 'sSub')) out += `${part(child(c, 'm', 'e'))}_${group(part(child(c, 'm', 'sub')))}`;
    else if (is(c, 'm', 'sSubSup')) out += `${part(child(c, 'm', 'e'))}_${group(part(child(c, 'm', 'sub')))}^${group(part(child(c, 'm', 'sup')))}`;
    else if (is(c, 'm', 'rad')) out += `√${group(part(child(c, 'm', 'e')))}`;
    else if (is(c, 'm', 'nary')) {
      const chr = child(child(c, 'm', 'naryPr') ?? c, 'm', 'chr')?.getAttributeNS(NS.m, 'val') ?? '∫';
      out += `${chr}${part(child(c, 'm', 'sub')) ? `_${group(part(child(c, 'm', 'sub')))}` : ''}${part(child(c, 'm', 'sup')) ? `^${group(part(child(c, 'm', 'sup')))}` : ''} ${part(child(c, 'm', 'e'))}`;
    } else if (is(c, 'm', 'd')) out += `(${kids(c).filter((x) => is(x, 'm', 'e')).map(linearMath).join(', ')})`;
    else if (c.localName.endsWith('Pr')) continue;
    else out += linearMath(c);
  }
  return out;
}

function resolvePart(dir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (dir + target).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

function trimInlines(c: Inline[]): void {
  while (c.length > 0 && c[0]!.t === 'text' && !(c[0] as { v: string }).v.trim()) c.shift();
  while (c.length > 0 && c[c.length - 1]!.t === 'text' && !(c[c.length - 1] as { v: string }).v.trim()) c.pop();
  const f = c[0];
  if (f?.t === 'text') c[0] = text(f.v.replace(/^\s+/, ''));
  const l = c[c.length - 1];
  if (l?.t === 'text') c[c.length - 1] = text(l.v.replace(/\s+$/, ''));
}
