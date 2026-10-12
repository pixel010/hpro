#!/usr/bin/env node
/**
 * s7-fodt2hpro: reference converter from a Flat-XML ODF text document (.fodt, ODF 1.3) to an
 * hpro document of the office minimum profile (part 0, section 15; subset `office-min`).
 *
 * It implements the mapping table 15.2 for the ODF column: structure is derived only from
 * paragraph styles (resolved through `style:parent-style-name`), outline levels, list and table
 * definitions, never from appearance (HP-MIN-003). The author's guide (05-autorenleitfaden.md,
 * chapter 4) walks through this file.
 *
 *   node scripts/s7-fodt2hpro.mjs <quelle.fodt> <ausgabe.hpro> [--id urn:uuid:…] [--modified ISO]
 *
 * Exit 0: written (messages on stdout); 2: input not convertible (reason on stderr).
 * Standard library plus @xmldom/xmldom (dependency of the core) and the core itself.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { SUBSET_OFFICE_MIN, kern, rewriteContainer, sha256Hex, utf8 } from './s7-lib.mjs';

const NS = {
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
  xlink: 'http://www.w3.org/1999/xlink',
  dc: 'http://purl.org/dc/elements/1.1/',
  meta: 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
};
const ID_RE = /^[A-Za-z][A-Za-z0-9_.-]*$/;
const TOOL = { name: 's7-fodt2hpro', version: '0.1.0' };

/** Stylesheet of the minimum profile: HP-INH-004 (reading-system variables), HP-INH-016 (keep together). */
export const OFFICE_CSS = `/* hpro Mindestprofil (office-min): Darstellung kommt aus den Lesesystem-Variablen --hp-* (HP-INH-004). */
body {
  font-family: serif;
  font-size: var(--hp-font-size, 1rem);
  line-height: var(--hp-line-height, 1.5);
  letter-spacing: var(--hp-letter-spacing, normal);
  word-spacing: var(--hp-word-spacing, normal);
  color: var(--hp-foreground, #111);
  background: var(--hp-background, #fff);
  margin: 0 auto;
  max-width: 40em;
  padding: 1em;
}
p, ul, ol, table, pre, blockquote, figure, aside {
  margin-top: var(--hp-paragraph-spacing, 1em);
  margin-bottom: var(--hp-paragraph-spacing, 1em);
}
h1, h2, h3, h4, h5, h6 { break-after: avoid; line-height: 1.25; }
table, figure, pre { break-inside: avoid; }
table { border-collapse: collapse; }
th, td { border: 1px solid currentColor; padding: 0.25em 0.5em; text-align: left; vertical-align: top; }
figure img { max-width: 100%; height: auto; }
pre { white-space: pre-wrap; }
blockquote { margin-left: 2em; }
aside[role="doc-footnote"] { font-size: 0.9em; border-top: 1px solid currentColor; }
`;

// --------------------------------------------------------------------------------------------- helpers

function slugify(s, fallback = 'abschnitt') {
  let t = s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  t = t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!t) t = fallback;
  if (!/^[a-z]/.test(t)) t = 's-' + t;
  return t.slice(0, 48).replace(/[-.]+$/, '');
}

function uuidV5(name) {
  // RFC 9562 UUIDv5 with the URL namespace; makes `id` deterministic for the same source (HP-CONT-014).
  const ns = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');
  const h = createHash('sha1').update(ns).update(name).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `urn:uuid:${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const is = (n, ns, local) => n.nodeType === 1 && n.namespaceURI === NS[ns] && n.localName === local;
const attr = (el, ns, name) => (el.hasAttributeNS(NS[ns], name) ? el.getAttributeNS(NS[ns], name) : null);
const children = (el) => Array.from(el.childNodes ?? []);
const elementChildren = (el) => children(el).filter((n) => n.nodeType === 1);
const textOf = (el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

// --------------------------------------------------------------------------------------------- styles

/** Paragraph style roles of table 15.2 (ODF column), keyed by the internal style name. */
const PARAGRAPH_ROLES = {
  Title: 'title',
  Quotations: 'quote',
  Preformatted_20_Text: 'pre',
  Table: 'caption-table',
  Illustration: 'caption-illustration',
};
/** Text style roles of table 15.2. */
const TEXT_ROLES = { Emphasis: 'em', Strong_20_Emphasis: 'strong', Source_20_Text: 'code' };

class Styles {
  constructor(doc) {
    this.map = new Map();
    this.lists = new Map();
    for (const section of ['styles', 'automatic-styles']) {
      const root = doc.getElementsByTagNameNS(NS.office, section)[0];
      if (!root) continue;
      for (const el of elementChildren(root)) {
        if (is(el, 'style', 'style')) {
          const props = elementChildren(el).find((c) => is(c, 'style', 'text-properties'));
          this.map.set(attr(el, 'style', 'name'), {
            family: attr(el, 'style', 'family'),
            parent: attr(el, 'style', 'parent-style-name'),
            display: attr(el, 'style', 'display-name') ?? attr(el, 'style', 'name'),
            outline: attr(el, 'style', 'default-outline-level'),
            automatic: section === 'automatic-styles',
            textPosition: props ? attr(props, 'style', 'text-position') : null,
          });
        } else if (is(el, 'text', 'list-style')) {
          const levels = new Map();
          for (const l of elementChildren(el)) {
            const lv = Number(attr(l, 'text', 'level'));
            levels.set(lv, l.localName === 'list-level-style-number' ? 'ol' : 'ul');
          }
          this.lists.set(attr(el, 'style', 'name'), levels);
        }
      }
    }
  }
  /** Walks the parent chain until a row of table 15.2 applies. */
  chain(name) {
    const out = [];
    let n = name;
    for (let i = 0; n && i < 20; i++) {
      const s = this.map.get(n);
      if (!s) break;
      out.push({ name: n, ...s });
      n = s.parent;
    }
    return out;
  }
  paragraphRole(name) {
    for (const s of this.chain(name)) {
      if (PARAGRAPH_ROLES[s.name]) return { role: PARAGRAPH_ROLES[s.name], level: null, style: this.named(name) };
      if (s.outline) return { role: 'heading', level: Number(s.outline), style: this.named(name) };
    }
    return { role: 'p', level: null, style: this.named(name) };
  }
  /** Display name of the first non-automatic style in the chain (for data-hp-style, HP-MIN-012). */
  named(name) {
    for (const s of this.chain(name)) if (!s.automatic) return s.display;
    return null;
  }
  textRole(name) {
    for (const s of this.chain(name)) {
      if (TEXT_ROLES[s.name]) return TEXT_ROLES[s.name];
      if (s.textPosition?.startsWith('super')) return 'sup';
      if (s.textPosition?.startsWith('sub')) return 'sub';
    }
    return null;
  }
  listKind(styleName, level) {
    const lv = this.lists.get(styleName);
    if (!lv) return 'ul';
    return lv.get(level) ?? lv.get(1) ?? 'ul';
  }
}

// --------------------------------------------------------------------------------------------- converter

export function convertFodt(sourceBytes, options = {}) {
  const messages = [];
  const say = (m) => messages.push(m);
  const dom = new DOMParser().parseFromString(new TextDecoder().decode(sourceBytes), 'text/xml');
  const root = dom.documentElement;
  if (!root || !is(root, 'office', 'document')) throw new Error('Eingabe ist kein Flat-XML-ODF-Dokument (office:document)');
  const body = dom.getElementsByTagNameNS(NS.office, 'text')[0];
  if (!body) throw new Error('office:text fehlt');
  const styles = new Styles(dom);

  // Metadata (HP-META-001): title, language, date, id.
  const metaEl = dom.getElementsByTagNameNS(NS.office, 'meta')[0];
  const metaText = (ns, local) => (metaEl ? Array.from(metaEl.getElementsByTagNameNS(NS[ns], local)).map(textOf)[0] : undefined);
  let title = metaText('dc', 'title');
  const language = metaText('dc', 'language') ?? 'de';
  let modified = options.modified ?? metaText('dc', 'date');
  if (modified && !/[Zz]|[+-]\d\d:\d\d$/.test(modified)) {
    say(`dc:date "${modified}" hat keine Zeitzone; als UTC gelesen`);
    modified += 'Z';
  }
  if (modified) modified = new Date(modified).toISOString().slice(0, 19) + 'Z';
  else {
    modified = new Date().toISOString().slice(0, 19) + 'Z';
    say('dc:date fehlt; Systemzeit verwendet (nicht deterministisch, HP-CONT-014)');
  }
  let id = options.id;
  if (!id && metaEl) {
    for (const u of Array.from(metaEl.getElementsByTagNameNS(NS.meta, 'user-defined'))) if (attr(u, 'meta', 'name') === 'hpro:id') id = textOf(u);
  }
  if (!id) {
    id = uuidV5(sha256Hex(sourceBytes));
    say(`kein hpro:id in den Metadaten; id als UUIDv5 aus der Quelldatei abgeleitet: ${id}`);
  }

  // Output state.
  const ids = new Set();
  const uniqueId = (base) => {
    let c = base;
    for (let n = 2; ids.has(c); n++) c = `${base}-${n}`;
    if (!ID_RE.test(c) || c.length > 64) throw new Error(`Kennung verletzt HP-ADR-002: ${c}`);
    ids.add(c);
    return c;
  };
  const media = new Map(); // path -> bytes
  const out = []; // XHTML fragments of body
  const sections = []; // { id, title } for nav (HP-ADR-007)
  const endnotes = []; // { id, html }
  const refTargets = new Map(); // bookmark / sequence ref-name -> { id, text }
  const pendingRefs = []; // { placeholder, refName, format }
  let sectionOpen = false;
  let hasTitle = false;
  let lastTable = null; // last emitted table: { index in out, id }
  let listCounters = new Map(); // list style -> last number (for continue-numbering)
  let imageCounter = 0;

  const openSection = (sid, heading) => {
    if (sectionOpen) out.push('  </section>\n');
    out.push(`  <section id="${sid}">\n`);
    sectionOpen = true;
    sections.push({ id: sid, title: heading });
  };

  /** Inline content of a paragraph-like element. Returns { html, notesAfter, bookmarks, frames }. */
  function inline(el, ctx) {
    let html = '';
    const bookmarks = [];
    const frames = [];
    for (const n of children(el)) {
      if (n.nodeType === 3) html += esc(n.nodeValue);
      else if (n.nodeType !== 1) continue;
      else if (is(n, 'text', 'span')) {
        const role = styles.textRole(attr(n, 'text', 'style-name'));
        const inner = inline(n, ctx);
        bookmarks.push(...inner.bookmarks);
        frames.push(...inner.frames);
        if (role) html += `<${role}>${inner.html}</${role}>`;
        else {
          const named = styles.named(attr(n, 'text', 'style-name'));
          html += named && named !== attr(n, 'text', 'style-name') ? `<span data-hp-style="${esc(named)}">${inner.html}</span>` : inner.html;
        }
      } else if (is(n, 'text', 's')) html += ' '.repeat(Number(attr(n, 'text', 'c') ?? 1));
      else if (is(n, 'text', 'tab')) html += ' ';
      else if (is(n, 'text', 'line-break')) html += ctx.pre ? '\n' : '<br/>';
      else if (is(n, 'text', 'soft-page-break')) continue;
      else if (is(n, 'text', 'bookmark') || is(n, 'text', 'bookmark-start') || is(n, 'text', 'reference-mark') || is(n, 'text', 'reference-mark-start')) bookmarks.push(attr(n, 'text', 'name'));
      else if (is(n, 'text', 'bookmark-end') || is(n, 'text', 'reference-mark-end')) continue;
      else if (is(n, 'text', 'a')) {
        const href = attr(n, 'xlink', 'href') ?? '';
        const inner = inline(n, ctx);
        if (/^https?:\/\//.test(href)) html += `<a href="${esc(href)}">${inner.html}</a>`;
        else if (href.startsWith('#')) {
          const ph = `\u0000REF${pendingRefs.length}\u0000`;
          pendingRefs.push({ placeholder: ph, refName: href.slice(1).split('|')[0], format: 'text', text: inner.html });
          html += ph;
        } else {
          say(`Hyperlink "${href}" ist weder http(s) noch Textmarke; als Text übernommen (HP-MIN-009)`);
          html += inner.html;
        }
      } else if (is(n, 'text', 'bookmark-ref') || is(n, 'text', 'reference-ref') || is(n, 'text', 'sequence-ref')) {
        const ph = `\u0000REF${pendingRefs.length}\u0000`;
        pendingRefs.push({ placeholder: ph, refName: attr(n, 'text', 'ref-name'), format: attr(n, 'text', 'reference-format') ?? 'text', text: esc(textOf(n)) });
        html += ph;
      } else if (is(n, 'text', 'sequence')) {
        const ref = attr(n, 'text', 'ref-name');
        if (ref) ctx.sequences.push(ref);
        html += esc(textOf(n));
      } else if (is(n, 'text', 'note')) {
        const cls = attr(n, 'text', 'note-class') ?? 'footnote';
        const noteId = uniqueId(attr(n, 'text', 'id') && ID_RE.test(attr(n, 'text', 'id')) ? attr(n, 'text', 'id') : `${cls === 'endnote' ? 'edn' : 'ftn'}${ctx.notes.length + endnotes.length + 1}`);
        const citation = esc(textOf(elementChildren(n).find((c) => is(c, 'text', 'note-citation')) ?? n) || '*');
        const bodyEl = elementChildren(n).find((c) => is(c, 'text', 'note-body'));
        const paras = bodyEl ? elementChildren(bodyEl).filter((c) => is(c, 'text', 'p')).map((p) => inline(p, { ...ctx, notes: [] }).html) : [];
        html += `<a href="#${noteId}" role="doc-noteref" epub:type="noteref" id="${noteId}-ref">${citation}</a>`;
        if (cls === 'endnote') endnotes.push({ id: noteId, html: paras.map((p) => `<p>${p}</p>`).join('') });
        else ctx.notes.push(`<aside id="${noteId}" role="doc-footnote" epub:type="footnote">${paras.map((p) => `<p>${p}</p>`).join('')}</aside>`);
      } else if (is(n, 'draw', 'frame')) frames.push(n);
      else if (is(n, 'text', 'change-start') || is(n, 'text', 'change-end') || is(n, 'text', 'change')) say(`Änderungsverfolgung (${n.localName}) ignoriert; Änderungen gelten als angenommen`);
      else {
        say(`Element ${n.prefix}:${n.localName} ohne Entsprechung im Mindestprofil; Textinhalt übernommen`);
        html += esc(textOf(n));
      }
    }
    return { html, bookmarks, frames };
  }

  /** A draw:frame: image (figure) or text box with an illustration caption. */
  function frame(fr, ctx) {
    const image = elementChildren(fr).find((c) => is(c, 'draw', 'image'));
    const textBox = elementChildren(fr).find((c) => is(c, 'draw', 'text-box'));
    if (textBox) {
      for (const p of elementChildren(textBox)) {
        if (!is(p, 'text', 'p')) continue;
        const role = styles.paragraphRole(attr(p, 'text', 'style-name'));
        const inner = inline(p, ctx);
        if (role.role === 'caption-illustration' && inner.frames.length > 0) {
          for (const f of inner.frames) frame(f, { ...ctx, caption: inner.html.trim(), sequences: ctx.sequences });
        } else for (const f of inner.frames) frame(f, ctx);
      }
      return;
    }
    if (!image) {
      say(`Rahmen "${attr(fr, 'draw', 'name') ?? '?'}" ohne Bild ignoriert`);
      return;
    }
    const name = attr(fr, 'draw', 'name') ?? `bild${++imageCounter}`;
    const bin = elementChildren(image).find((c) => is(c, 'office', 'binary-data'));
    if (!bin) {
      say(`Bild "${name}": nur verknüpft (xlink:href), keine eingebetteten Daten; ausgelassen (HP-CONT-010)`);
      return;
    }
    const bytes = Buffer.from(textOf(bin).replace(/\s+/g, ''), 'base64');
    const sig = bytes.subarray(0, 8).toString('hex');
    let ext;
    let type;
    if (sig.startsWith('89504e47')) [ext, type] = ['png', 'image/png'];
    else if (sig.startsWith('ffd8ff')) [ext, type] = ['jpg', 'image/jpeg'];
    else if (sig.startsWith('47494638')) [ext, type] = ['gif', 'image/gif'];
    else if (bytes.subarray(0, 64).toString('latin1').includes('<svg') || bytes.subarray(0, 5).toString('latin1') === '<?xml') [ext, type] = ['svg', 'image/svg+xml'];
    else if (sig.startsWith('52494646')) [ext, type] = ['webp', 'image/webp'];
    else throw new Error(`Bild "${name}" (${attr(image, 'draw', 'mime-type') ?? 'unbekannter Typ'}) liegt in keinem Kernmedientyp vor und muss vor der Umwandlung nach PNG oder SVG konvertiert werden (HP-MIN-007)`);
    const path = `content/media/${slugify(name, 'bild')}.${ext}`;
    media.set(path, { bytes, type });
    const decorative = attr(fr, 'draw', 'decorative') === 'true';
    const titleEl = elementChildren(fr).find((c) => is(c, 'svg', 'title'));
    const descEl = elementChildren(fr).find((c) => is(c, 'svg', 'desc'));
    let alt;
    if (decorative) alt = '';
    else if (titleEl && textOf(titleEl)) alt = textOf(titleEl);
    else if (descEl && textOf(descEl)) alt = textOf(descEl);
    else {
      alt = ctx.caption ? ctx.caption.replace(/<[^>]+>/g, '') : name;
      say(`Bild "${name}" hat keinen Alternativtext und ist nicht als dekorativ markiert; alt="${alt}" aus ${ctx.caption ? 'der Beschriftung' : 'dem Rahmennamen'} gesetzt – bitte nachtragen (HP-MIN-007)`);
    }
    const fid = uniqueId(slugify(name, 'abbildung'));
    for (const s of ctx.sequences.splice(0)) refTargets.set(s, { id: fid, text: ctx.caption?.replace(/<[^>]+>/g, '') ?? name });
    out.push(`  <figure id="${fid}"><img src="${path.slice('content/'.length)}" alt="${esc(alt)}"/>${ctx.caption ? `<figcaption>${ctx.caption}</figcaption>` : ''}</figure>\n`);
  }

  /** Emits a text:p / text:h block. */
  function block(el) {
    const styleName = attr(el, 'text', 'style-name');
    const role = styles.paragraphRole(styleName);
    const ctx = { notes: [], sequences: [], pre: role.role === 'pre' };
    const inner = inline(el, ctx);
    const styleAttr = role.style ? ` data-hp-style="${esc(role.style)}"` : '';
    const bookmarkId = inner.bookmarks.find((b) => b && ID_RE.test(b));
    const textPlain = inner.html.replace(/<[^>]+>/g, '').replace(/\u0000REF\d+\u0000/g, '').trim();
    const extraMarks = inner.bookmarks.filter((b) => b && b !== bookmarkId).map((b) => `<span id="${uniqueId(ID_RE.test(b) ? b : slugify(b))}"></span>`).join('');

    if (is(el, 'text', 'h') || role.role === 'heading' || role.role === 'title') {
      const isTitle = role.role === 'title';
      const srcLevel = isTitle ? 0 : Number(attr(el, 'text', 'outline-level') ?? role.level ?? 1);
      if (isTitle) hasTitle = true;
      let level = isTitle ? 1 : hasTitle ? srcLevel + 1 : srcLevel;
      if (level > 6) level = 6;
      const hid = uniqueId(bookmarkId ?? slugify(textPlain, isTitle ? 'titel' : 'abschnitt'));
      for (const b of inner.bookmarks) if (b) refTargets.set(b, { id: hid, text: textPlain });
      if (isTitle && !title) title = textPlain;
      if (level === (hasTitle ? 2 : 1) && !isTitle) openSection(uniqueId(`s-${hid}`), textPlain);
      out.push(`  <h${level} id="${hid}"${styleAttr}>${extraMarks}${inner.html}</h${level}>\n`);
      out.push(...ctx.notes.map((n) => `  ${n}\n`));
      for (const f of inner.frames) frame(f, { notes: ctx.notes, sequences: ctx.sequences });
      return;
    }
    if (role.role === 'caption-table' && lastTable) {
      out[lastTable.index] = out[lastTable.index].replace('<caption/>', `<caption>${inner.html}</caption>`);
      for (const s of ctx.sequences) refTargets.set(s, { id: lastTable.id, text: textPlain });
      lastTable = null;
      return;
    }
    // Frames inside a paragraph become figures before the paragraph text.
    for (const f of inner.frames) frame(f, { notes: ctx.notes, sequences: ctx.sequences });
    if (!textPlain && !inner.html.includes('<a ') && inner.html.replace(/<br\/>/g, '').trim() === '') {
      out.push(...ctx.notes.map((n) => `  ${n}\n`));
      return; // paragraph that only carried frames
    }
    const idAttr = bookmarkId ? ` id="${uniqueId(bookmarkId)}"` : '';
    if (bookmarkId) refTargets.set(bookmarkId, { id: bookmarkId, text: textPlain });
    if (role.role === 'quote') out.push(`  <blockquote${styleAttr}><p${idAttr}>${extraMarks}${inner.html}</p></blockquote>\n`);
    // `pre` is addressable (HP-ADR-001): it always gets a stable id derived from its first line.
    else if (role.role === 'pre') out.push(`  <pre${idAttr || ` id="${uniqueId(slugify(textPlain.split('\n')[0].slice(0, 40), 'block'))}"`}${styleAttr}>${extraMarks}${inner.html}</pre>\n`);
    else out.push(`  <p${idAttr}${styleAttr}>${extraMarks}${inner.html}</p>\n`);
    out.push(...ctx.notes.map((n) => `  ${n}\n`));
  }

  /** text:list → ul/ol; nested lists sit inside the li of the parent level (HP-MIN-005). */
  function list(el, inheritedStyle, level, indent) {
    const styleName = attr(el, 'text', 'style-name') ?? inheritedStyle;
    const kind = styles.listKind(styleName, level);
    const items = elementChildren(el).filter((c) => is(c, 'text', 'list-item') || is(c, 'text', 'list-header'));
    let start = null;
    const key = `${styleName}@${level}`;
    if (kind === 'ol') {
      const first = items[0] ? attr(items[0], 'text', 'start-value') : null;
      if (first) start = Number(first);
      else if (attr(el, 'text', 'continue-numbering') === 'true' && listCounters.has(key)) start = listCounters.get(key) + 1;
      listCounters.set(key, (start ?? 1) + items.length - 1);
    }
    let html = `${indent}<${kind}${start && start !== 1 ? ` start="${start}"` : ''}>\n`;
    for (const item of items) {
      const paras = elementChildren(item).filter((c) => is(c, 'text', 'p') || is(c, 'text', 'h'));
      const sub = elementChildren(item).filter((c) => is(c, 'text', 'list'));
      const notes = [];
      const parts = paras.map((p) => {
        const ctx = { notes, sequences: [] };
        const r = inline(p, ctx);
        return r.html.replace(/^\s*([•◦▪\-–*·]|\d+[.)]|[a-zA-Z][.)])\s+/, '');
      });
      html += `${indent}  <li>${parts.length <= 1 ? parts[0] ?? '' : parts.map((p) => `<p>${p}</p>`).join('')}`;
      if (sub.length > 0) html += `\n${sub.map((s) => list(s, styleName, level + 1, indent + '    ')).join('')}${indent}  `;
      html += `</li>\n`;
      for (const n of notes) html += `${indent}  ${n}\n`;
    }
    html += `${indent}</${kind}>\n`;
    return html;
  }

  /** table:table → table with thead (header rows), colspan/rowspan, caption placeholder (HP-MIN-006). */
  function table(el) {
    const name = attr(el, 'table', 'name') ?? 'tabelle';
    const tid = uniqueId(ID_RE.test(name) ? name : slugify(name, 'tabelle'));
    let html = `  <table id="${tid}" data-hp-table="scroll"><caption/>\n`;
    const rows = (container, cellTag) => {
      let h = '';
      for (const row of elementChildren(container).filter((r) => is(r, 'table', 'table-row'))) {
        h += '      <tr>';
        for (const cell of elementChildren(row)) {
          if (is(cell, 'table', 'covered-table-cell')) continue;
          if (!is(cell, 'table', 'table-cell')) continue;
          const cs = attr(cell, 'table', 'number-columns-spanned');
          const rs = attr(cell, 'table', 'number-rows-spanned');
          const paras = elementChildren(cell).filter((c) => is(c, 'text', 'p') || is(c, 'text', 'h'));
          const notes = [];
          const parts = paras.map((p) => inline(p, { notes, sequences: [] }).html);
          if (notes.length) say(`Fußnote in Tabelle ${name} nicht unterstützt; Notentext ausgelassen`);
          const content = parts.length <= 1 ? parts[0] ?? '' : parts.map((p) => `<p>${p}</p>`).join('');
          h += `<${cellTag}${cellTag === 'th' ? ' scope="col"' : ''}${cs && cs !== '1' ? ` colspan="${cs}"` : ''}${rs && rs !== '1' ? ` rowspan="${rs}"` : ''}>${content}</${cellTag}>`;
        }
        h += '</tr>\n';
      }
      return h;
    };
    const header = elementChildren(el).find((c) => is(c, 'table', 'table-header-rows'));
    if (header) html += `    <thead>\n${rows(header, 'th')}    </thead>\n`;
    html += `    <tbody>\n${rows(el, 'td')}    </tbody>\n  </table>\n`;
    lastTable = { index: out.length, id: tid };
    out.push(html);
  }

  for (const el of elementChildren(body)) {
    if (is(el, 'text', 'p') || is(el, 'text', 'h')) block(el);
    else if (is(el, 'text', 'list')) out.push(list(el, null, 1, '  '));
    else if (is(el, 'table', 'table')) table(el);
    else if (is(el, 'text', 'sequence-decls') || is(el, 'office', 'forms') || is(el, 'text', 'variable-decls') || is(el, 'text', 'user-field-decls') || is(el, 'text', 'soft-page-break')) continue;
    else if (is(el, 'text', 'tracked-changes')) say('Änderungsverfolgung vorhanden; nur der angenommene Text wird übernommen');
    else if (is(el, 'text', 'section')) say(`text:section "${attr(el, 'text', 'name') ?? ''}" ohne Entsprechung; Inhalt wird wie Fließtext behandelt`), elementChildren(el).forEach((c) => (is(c, 'text', 'p') || is(c, 'text', 'h') ? block(c) : is(c, 'text', 'list') ? out.push(list(c, null, 1, '  ')) : is(c, 'table', 'table') ? table(c) : say(`Element ${c.prefix}:${c.localName} ignoriert`)));
    else say(`Element ${el.prefix}:${el.localName} auf Dokumentebene ohne Entsprechung im Mindestprofil; ignoriert`);
  }
  if (lastTable) out[lastTable.index] = out[lastTable.index].replace('<caption/>', `<caption>${esc(lastTable.id)}</caption>`), say(`Tabelle ${lastTable.id} ohne Beschriftung; Name als caption gesetzt`);
  if (sectionOpen) out.push('  </section>\n');
  if (endnotes.length > 0) {
    const eid = uniqueId('endnoten');
    sections.push({ id: eid, title: 'Endnoten' });
    out.push(`  <section id="${eid}" role="doc-endnotes" epub:type="endnotes">\n    <ol>\n${endnotes.map((n) => `      <li id="${n.id}">${n.html}</li>\n`).join('')}    </ol>\n  </section>\n`);
  }
  if (!title) throw new Error('kein Dokumenttitel (dc:title oder Absatz mit Vorlage „Titel“)');

  // Resolve cross references (HP-MIN-009): address = #id of the target; page references show the target text.
  let bodyHtml = out.join('');
  for (const r of pendingRefs) {
    const t = refTargets.get(r.refName);
    let repl;
    if (!t) {
      say(`Verweis auf "${r.refName}" ohne Ziel; als Text übernommen`);
      repl = r.text;
    } else repl = `<a href="#${t.id}">${r.format === 'page' ? esc(t.text) : r.text}</a>`;
    bodyHtml = bodyHtml.split(r.placeholder).join(repl);
  }

  const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(language)}" lang="${esc(language)}">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles/office.css"/>
</head>
<body>
${bodyHtml}</body>
</html>
`;
  const resources = [
    { path: 'content/index.xhtml', mediaType: 'application/xhtml+xml', data: utf8(xhtml) },
    { path: 'content/styles/office.css', mediaType: 'text/css', data: utf8(OFFICE_CSS) },
    ...[...media].map(([path, m]) => ({ path, mediaType: m.type, data: m.bytes })),
  ];
  const sourceName = options.sourceName ?? 'quelle.fodt';
  resources.push({ path: `original/${sourceName}`, mediaType: 'application/vnd.oasis.opendocument.text-flat-xml', data: sourceBytes });
  return {
    input: {
      id,
      title,
      language,
      modified,
      profile: 'static',
      creators: [],
      readingOrder: ['content/index.xhtml'],
      toc: { title: 'Inhalt', entries: sections.map((s) => ({ title: s.title, href: `content/index.xhtml#${s.id}` })) },
      resources,
      // Descriptive accessibility metadata (HP-META-004, Soll). No `conformsTo`: that needs an audit report.
      accessibility: {
        accessMode: media.size > 0 ? ['textual', 'visual'] : ['textual'],
        accessModeSufficient: ['textual'],
        accessibilityFeature: ['structuralNavigation', 'tableOfContents', ...(media.size > 0 ? ['alternativeText'] : [])],
        accessibilityHazard: ['none'],
        accessibilitySummary: `Aus einer Textverarbeitung umgewandelt (${TOOL.name} ${TOOL.version}): Überschriften, Listen und Tabellen mit Kopfzeilen aus den Formatvorlagen der Quelle${media.size > 0 ? ', Bilder mit Alternativtext' : ''}.`,
      },
    },
    manifestAddition: {
      subset: SUBSET_OFFICE_MIN,
      source: { url: `original/${sourceName}`, type: 'application/vnd.oasis.opendocument.text-flat-xml', tool: TOOL, date: modified },
    },
    messages,
    xhtml,
  };
}

/** Converts and writes the container; returns { bytes, messages, manifest }. */
export async function fodtToHpro(sourceBytes, options = {}) {
  const { createContainer, readContainer } = await kern();
  const c = convertFodt(sourceBytes, options);
  const created = await createContainer(c.input);
  const manifest = { ...created.manifest, ...c.manifestAddition };
  const bytes = await rewriteContainer(created.bytes, { manifest, modified: c.input.modified });
  const back = await readContainer(bytes);
  if (!back.integrity.ok) throw new Error('Rücklesen: Hash-Manifest stimmt nicht');
  return { bytes, messages: c.messages, manifest, xhtml: c.xhtml };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opts = {};
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--id') opts.id = args[++i];
    else if (args[i] === '--modified') opts.modified = args[++i];
    else files.push(args[i]);
  }
  if (files.length !== 2) {
    console.error('usage: s7-fodt2hpro <quelle.fodt> <ausgabe.hpro> [--id urn:uuid:...] [--modified YYYY-MM-DDThh:mm:ssZ]');
    process.exit(2);
  }
  try {
    const source = readFileSync(files[0]);
    const r = await fodtToHpro(source, { ...opts, sourceName: basename(files[0]) });
    writeFileSync(files[1], r.bytes);
    for (const m of r.messages) console.log(`Meldung: ${m}`);
    console.log(`${files[1]}  ${r.bytes.length} bytes  sha256=${sha256Hex(r.bytes)}`);
    console.log(`manifest: name="${r.manifest.name}" subset=${r.manifest.subset} resources=${r.manifest.resources.length}`);
  } catch (err) {
    console.error(`s7-fodt2hpro: ${err.message}`);
    process.exit(2);
  }
}
