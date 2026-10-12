/**
 * Builds the HTML of the document frame (`srcdoc`) from one content document.
 *
 * The frame is sandboxed with `allow-scripts` only and has an opaque origin (HP-SBX-005), so
 * everything it needs travels inside the HTML string:
 *
 * - its own Content Security Policy without any network source (HP-SBX-006, HP-RS-001):
 *   images, media and fonts as `data:` URLs from the container, styles inline, scripts only
 *   the reader's frame agent by hash;
 * - the document's stylesheets inlined, with `url()` and `@import` resolved inside the
 *   container;
 * - no document scripts, event handler attributes, `javascript:` URLs, `base` or refresh;
 * - search hits wrapped in `<mark data-hp-hit="n">`, numbered like `searchDocuments`;
 * - tables in a scroll region (HP-INH-010), with cell labels for the strategy `stack`;
 * - table cells with formulas, inputs and checks marked for the calculator (calcview.ts);
 * - form fields, messages, summary and actions marked for the form logic (formview.ts, P6);
 * - verified components of live content as inline scripts after the agent, their hashes in the
 *   CSP (P15, kern `live.planComponents`); components that do not run keep their static
 *   equivalent and get a visible note (HP-SBX-011);
 * - locks of the manifest (P17, locks.ts): hidden sections out of the flow with a note, no-print
 *   sections replaced by the notice in print, read-only cells without input;
 * - `autoplay` only for muted media, and only started by the agent when motion is allowed
 *   (HP-INH-013, HP-INH-014).
 */
import { live } from '@hpro/kern';
import { annotateTables, type CalcMode } from './calcview.js';
import { annotateForms, type FormMode } from './formview.js';
import type { ContentDocument, LoadedDocument } from './document.js';
import { applyLocks, type LockState } from './locks.js';
import { isAbsoluteUrl, resolvePath } from './paths.js';
import { buildTextModel, findMatches, foldQuery, matchPieces } from './search.js';

export type ViewMode = 'flow' | 'page';

/** State handed to the frame agent at start (`data-hp-init`) and later by message. */
export interface FrameState {
  readonly mode: ViewMode;
  readonly zoom: number;
  readonly title: string;
  /** CSS custom properties `--hp-*`, plus `font-size` for the root element. */
  readonly vars: Readonly<Record<string, string>>;
  readonly scheme: string;
  /** `system`: follow prefers-reduced-motion; `reduce`: reader setting, always reduced. */
  readonly motion: 'system' | 'reduce';
  /** The user stopped all motion (WCAG 2.2.2, HP-INH-014). */
  readonly paused: boolean;
}

/** Components of the shown version, decided by the core (`live.planComponents`). */
export interface FrameComponents {
  readonly decisions: readonly live.ComponentDecision[];
  /** Profile of the shown version is not `interactive` or it is frozen. */
  readonly live: boolean;
}

export interface FrameOptions {
  /** Source of the frame agent, inserted verbatim. */
  readonly agent: string;
  /** CSP hash source of the agent, e.g. `sha256-…`. */
  readonly agentHash: string;
  /** Reader stylesheet for the frame. */
  readonly css: string;
  readonly query?: string;
  readonly state: FrameState;
  /** Tables: `live` with input controls, `frozen` stored values only, `none` untouched. */
  readonly calc?: CalcMode | 'none';
  /** Live content; absent = no component runs. */
  readonly components?: FrameComponents;
  /** Load token: the agent returns it with its message port, so the shell knows the port is its own. */
  readonly token?: string;
  /** Locks of the shown version (P17); absent = none applied. */
  readonly locks?: LockState;
  /** Forms (P6): `live` with messages and actions, `readonly` disabled; sections that do not apply. */
  readonly forms?: { readonly mode: FormMode | 'none'; readonly hidden: ReadonlySet<string> };
}

export interface FrameBuild {
  readonly html: string;
  /** Number of marked search hits. */
  readonly hits: number;
}

/** Policy of the document frame: the agent and the verified components by hash, no network (HP-SBX-006). */
export function frameCsp(agentHash: string, componentHashes: readonly string[] = []): string {
  return live.frameCsp({ scriptHashes: [agentHash, ...componentHashes] });
}

const EXTENSION_TYPES: Record<string, string> = {
  css: 'text/css',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  woff2: 'font/woff2',
  woff: 'font/woff',
  otf: 'font/otf',
  ttf: 'font/ttf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  vtt: 'text/vtt',
};

const REMOVED_ELEMENTS = ['script', 'base', 'link', 'embed', 'applet', 'frame', 'frameset', 'portal'];
const URL_ATTRIBUTES = ['href', 'src', 'action', 'formaction', 'poster', 'data', 'xlink:href'];
const DROPPED_ATTRIBUTES = new Set(['srcdoc', 'target', 'ping', 'autofocus', 'formtarget']);
const XLINK_NS = 'http://www.w3.org/1999/xlink';

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function mediaTypeOf(doc: LoadedDocument, path: string): string {
  const listed = doc.mediaTypes.get(path);
  if (listed) return listed;
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return EXTENSION_TYPES[ext] ?? 'application/octet-stream';
}

export class ResourceResolver {
  private readonly cache = new Map<string, string>();
  constructor(private readonly doc: LoadedDocument) {}

  /** `data:` URL for a container reference, or undefined when it leaves the container or is missing. */
  dataUrl(basePath: string, href: string): string | undefined {
    const trimmed = href.trim();
    if (trimmed.startsWith('data:')) return trimmed;
    const resolved = resolvePath(basePath, trimmed);
    if (!resolved) return undefined;
    const bytes = this.doc.files.get(resolved.path);
    if (!bytes) return undefined;
    let url = this.cache.get(resolved.path);
    if (!url) {
      url = `data:${mediaTypeOf(this.doc, resolved.path)};base64,${base64(bytes)}`;
      this.cache.set(resolved.path, url);
    }
    return resolved.fragment ? `${url}#${resolved.fragment}` : url;
  }

  text(basePath: string, href: string): { path: string; text: string } | undefined {
    const resolved = resolvePath(basePath, href);
    const bytes = resolved ? this.doc.files.get(resolved.path) : undefined;
    if (!resolved || !bytes) return undefined;
    return { path: resolved.path, text: new TextDecoder().decode(bytes) };
  }
}

/** Inlines a stylesheet: `@import` recursively, `url()` as `data:` URLs from the container. */
export function inlineCss(cssPath: string, text: string, resolver: { dataUrl(b: string, h: string): string | undefined; text(b: string, h: string): { path: string; text: string } | undefined }, depth = 0): string {
  const withImports = text.replace(/@import\s+(?:url\(\s*)?(["']?)([^"')\s;]+)\1\s*\)?\s*([^;]*);/g, (_m, _q: string, href: string, media: string) => {
    const target = depth < 8 && !isAbsoluteUrl(href) ? resolver.text(cssPath, href) : undefined;
    if (!target) return '';
    const inner = inlineCss(target.path, target.text, resolver, depth + 1);
    return media.trim() ? `@media ${media.trim()} {\n${inner}\n}` : inner;
  });
  return withImports.replace(/url\(\s*(["']?)([^"')]*?)\1\s*\)/g, (match, _q: string, href: string) => {
    if (href.startsWith('#') || href.startsWith('data:')) return match;
    const url = resolver.dataUrl(cssPath, href);
    return `url("${url ?? 'data:,'}")`;
  });
}

/** Wraps every search hit in `<mark data-hp-hit="n">`; numbering matches `searchDocuments`. */
export function markHits(body: Element, query: string): number {
  const folded = foldQuery(query);
  if (folded === '') return 0;
  const model = buildTextModel(body);
  const matches = findMatches(model, folded, 100_000);
  const pieces = matches.map((m) => matchPieces(model, m));
  const doc = body.ownerDocument;
  // Back to front, so earlier offsets in a split text node stay valid.
  for (let i = pieces.length - 1; i >= 0; i--) {
    const list = pieces[i] ?? [];
    for (let j = list.length - 1; j >= 0; j--) {
      const piece = list[j];
      if (!piece || piece.end <= piece.start) continue;
      const node = piece.node;
      if (piece.end < node.data.length) node.splitText(piece.end);
      const middle = piece.start > 0 ? node.splitText(piece.start) : node;
      const mark = doc.createElement('mark');
      mark.setAttribute('data-hp-hit', String(i));
      middle.replaceWith(mark);
      mark.append(middle);
    }
  }
  return matches.length;
}

/** Removes scripts, event handlers, `javascript:` URLs and frames from a rendered copy (shared with print.ts). */
export function sanitize(body: Element): void {
  for (const el of Array.from(body.querySelectorAll(REMOVED_ELEMENTS.join(', ')))) el.remove();
  for (const el of Array.from(body.querySelectorAll('meta'))) el.remove();
  // Embedded objects show their fallback content; frames become a link (HP-NEST-004 targets
  // are content documents of the same container, which the reader opens itself).
  for (const el of Array.from(body.querySelectorAll('object'))) el.replaceWith(...Array.from(el.childNodes).filter((n) => !(n instanceof Element && n.localName === 'param')));
  for (const el of Array.from(body.querySelectorAll('iframe'))) {
    const a = body.ownerDocument.createElement('a');
    a.setAttribute('href', el.getAttribute('src') ?? '#');
    a.textContent = el.getAttribute('title') || 'Eingebettetes Dokument öffnen';
    el.replaceWith(a);
  }
  for (const el of [body, ...Array.from(body.querySelectorAll('*'))]) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || DROPPED_ATTRIBUTES.has(name)) el.removeAttributeNode(attr);
      else if (URL_ATTRIBUTES.includes(name) && /^\s*(javascript|vbscript):/i.test(attr.value)) el.removeAttributeNode(attr);
    }
  }
}

/**
 * Media: no autoplay with sound (HP-INH-013); muted autoplay becomes `data-hp-autoplay`, which
 * the agent starts only when motion is allowed (HP-INH-014, HP-SBX-014).
 */
function controlMedia(body: Element): void {
  for (const el of Array.from(body.querySelectorAll('video[autoplay], audio[autoplay]'))) {
    if (el.hasAttribute('muted')) el.setAttribute('data-hp-autoplay', '');
    el.removeAttribute('autoplay');
  }
}

const NS_XHTML = 'http://www.w3.org/1999/xhtml';

/** Component scripts the content document includes (`<script src>` under components/). */
function referencedScripts(source: Document, basePath: string): Set<string> {
  const out = new Set<string>();
  for (const el of Array.from(source.getElementsByTagName('script'))) {
    const src = el.getAttribute('src');
    const resolved = src && !isAbsoluteUrl(src) ? resolvePath(basePath, src) : undefined;
    if (resolved) out.add(resolved.path);
  }
  return out;
}

function note(doc: Document, text: string): HTMLElement {
  const p = doc.createElement('p');
  p.className = 'hp-component-note';
  p.setAttribute('data-hp-reader', 'component');
  p.setAttribute('role', 'note');
  p.textContent = text;
  return p;
}

/**
 * Which component scripts go into the frame, and notes before every component element that
 * stays static (HP-SBX-011, HPL-SBX-006): changed, missing, undeclared, switched off.
 */
function placeComponents(out: Document, body: Element, source: Document, basePath: string, components: FrameComponents | undefined): live.ComponentDecision[] {
  const decisions = components?.decisions ?? [];
  const included = referencedScripts(source, basePath);
  const run = decisions.filter((d) => d.state === 'run' && included.has(d.url));
  const running = new Set(run.map((d) => d.name));
  const byName = new Map(decisions.map((d) => [d.name, d]));
  for (const el of Array.from(body.getElementsByTagName('*'))) {
    if (!el.localName.includes('-') || (el.namespaceURI !== null && el.namespaceURI !== NS_XHTML)) continue;
    if (running.has(el.localName)) continue;
    const d = byName.get(el.localName);
    let reason: string;
    if (!components?.live) reason = d?.reason ?? 'diese Fassung führt keine Komponenten aus';
    else if (!d) reason = 'nicht in manifest.json#components deklariert';
    else if (d.state === 'run') reason = 'das Inhaltsdokument bindet ihr Skript nicht ein';
    else reason = d.reason;
    el.before(note(out, `Komponente ${el.localName} nicht ausgeführt (${reason}). Angezeigt wird die statische Fassung.`));
  }
  return run;
}

/** Container references as `data:` URLs; anything outside the container is not loaded (shared with print.ts). */
export function rewriteResources(body: Element, basePath: string, resolver: ResourceResolver): void {
  const set = (el: Element, attr: string, ns?: string) => {
    const value = ns ? el.getAttributeNS(ns, 'href') : el.getAttribute(attr);
    if (value === null || value.startsWith('#')) return;
    const url = resolver.dataUrl(basePath, value);
    if (ns) {
      if (url) el.setAttributeNS(ns, 'xlink:href', url);
      else el.removeAttributeNS(ns, 'href');
    } else if (url) {
      el.setAttribute(attr, url);
    } else {
      // Outside the container or missing: nothing is loaded (HP-RS-001); keep the reference visible.
      el.setAttribute('data-hp-missing', value);
      el.removeAttribute(attr);
    }
  };
  for (const el of Array.from(body.querySelectorAll('img, source, video, audio, track, input[type="image"]'))) {
    if (el.hasAttribute('src')) set(el, 'src');
    if (el.hasAttribute('poster')) set(el, 'poster');
    const srcset = el.getAttribute('srcset');
    if (srcset !== null) {
      const rewritten = srcset
        .split(',')
        .map((candidate) => {
          const [url, ...descriptor] = candidate.trim().split(/\s+/);
          const data = url ? resolver.dataUrl(basePath, url) : undefined;
          return data ? [data, ...descriptor].join(' ') : '';
        })
        .filter(Boolean)
        .join(', ');
      if (rewritten) el.setAttribute('srcset', rewritten);
      else el.removeAttribute('srcset');
    }
  }
  for (const el of Array.from(body.querySelectorAll('image, feImage'))) {
    if (el.hasAttribute('href')) set(el, 'href');
    if (el.hasAttributeNS(XLINK_NS, 'href')) set(el, 'href', XLINK_NS);
  }
  for (const el of Array.from(body.querySelectorAll('[style]'))) {
    const style = el.getAttribute('style') ?? '';
    if (style.includes('url(')) el.setAttribute('style', inlineCss(basePath, style, resolver));
  }
}

function cellLabels(table: HTMLTableElement): void {
  const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
  if (!headRow) return;
  const labels: string[] = [];
  for (const cell of Array.from(headRow.cells)) {
    const text = (cell.textContent ?? '').replace(/\s+/g, ' ').trim();
    for (let i = 0; i < Math.max(1, cell.colSpan); i++) labels.push(text);
  }
  const rows = [...Array.from(table.tBodies).flatMap((b) => Array.from(b.rows)), ...(table.tFoot ? Array.from(table.tFoot.rows) : [])];
  for (const row of rows) {
    let column = 0;
    for (const cell of Array.from(row.cells)) {
      const label = labels[column];
      if (label) cell.setAttribute('data-hp-label', label);
      column += Math.max(1, cell.colSpan);
    }
  }
}

function wrapTables(body: Element): void {
  const doc = body.ownerDocument;
  for (const table of Array.from(body.querySelectorAll('table'))) {
    if (table.parentElement?.closest('table')) continue;
    if ((table.getAttribute('data-hp-table') ?? 'scroll') === 'stack') cellLabels(table as HTMLTableElement);
    const caption = (table.querySelector('caption')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const wrap = doc.createElement('div');
    wrap.setAttribute('data-hp-wrap', 'table');
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', caption ? `Tabelle: ${caption}` : 'Tabelle');
    table.replaceWith(wrap);
    wrap.append(table);
  }
}

function rootStyle(state: FrameState): string {
  return Object.entries(state.vars)
    .map(([name, value]) => `${name}: ${value}`)
    .join('; ');
}

export function buildFrameHtml(doc: LoadedDocument, content: ContentDocument, options: FrameOptions): FrameBuild {
  const source = content.dom;
  const out = document.implementation.createHTMLDocument('');
  const resolver = new ResourceResolver(doc);
  const html = out.documentElement;
  const srcRoot = source.documentElement;
  html.setAttribute('lang', srcRoot.getAttribute('lang') || srcRoot.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang') || doc.language);
  const dir = srcRoot.getAttribute('dir');
  if (dir) html.setAttribute('dir', dir);
  html.setAttribute('data-hp-init', JSON.stringify({ ...options.state, token: options.token ?? '' }));
  html.setAttribute('data-hp-scheme', options.state.scheme);
  const style = rootStyle(options.state);
  if (style) html.setAttribute('style', style);

  const head = out.head;
  head.replaceChildren();
  const charset = out.createElement('meta');
  charset.setAttribute('charset', 'utf-8');
  const csp = out.createElement('meta');
  csp.setAttribute('http-equiv', 'Content-Security-Policy');
  const viewport = out.createElement('meta');
  viewport.setAttribute('name', 'viewport');
  viewport.setAttribute('content', 'width=device-width, initial-scale=1');
  const title = out.createElement('title');
  title.textContent = content.title;
  const readerStyle = out.createElement('style');
  readerStyle.setAttribute('data-hp-reader', 'style');
  readerStyle.textContent = options.css;
  head.append(charset, csp, viewport, title, readerStyle);

  // Document styles in source order: <link rel="stylesheet"> and <style>.
  for (const el of Array.from(source.querySelectorAll('head > link, head > style'))) {
    let css: string | undefined;
    if (el.localName === 'style') {
      css = inlineCss(content.path, el.textContent ?? '', resolver);
    } else if (/(^|\s)stylesheet(\s|$)/i.test(el.getAttribute('rel') ?? '') && !/(^|\s)alternate(\s|$)/i.test(el.getAttribute('rel') ?? '')) {
      const href = el.getAttribute('href');
      const target = href && !isAbsoluteUrl(href) ? resolver.text(content.path, href) : undefined;
      if (target) css = inlineCss(target.path, target.text, resolver);
    }
    if (css === undefined) continue;
    const node = out.createElement('style');
    const media = el.getAttribute('media');
    if (media) node.setAttribute('media', media);
    node.textContent = css;
    head.append(node);
  }

  const srcBody = source.body ?? source.documentElement;
  const body = out.importNode(srcBody, true) as HTMLElement;
  if (body.localName !== 'body') {
    const wrapper = out.createElement('body');
    wrapper.append(...Array.from(body.childNodes));
    out.body.replaceWith(wrapper);
  } else {
    out.body.replaceWith(body);
  }
  const outBody = out.body;
  // Mark first, on the untouched copy, so hit numbers equal those of the source search.
  const hits = options.query ? markHits(outBody, options.query) : 0;
  sanitize(outBody);
  for (const el of Array.from(outBody.querySelectorAll('style'))) el.textContent = inlineCss(content.path, el.textContent ?? '', resolver);
  rewriteResources(outBody, content.path, resolver);
  // Locks before the calculator, so that read-only cells are not offered for entry.
  if (options.locks) applyLocks(outBody, content.path, options.locks);
  annotateTables(out, options.calc ?? 'none');
  annotateForms(out, options.forms?.mode ?? 'none', options.forms?.hidden);
  wrapTables(outBody);
  controlMedia(outBody);
  const run = placeComponents(out, outBody, source, content.path, options.components);
  const scriptless = options.components ? !options.components.live : doc.profile !== 'interactive';
  if (scriptless && source.getElementsByTagName('script').length > 0) {
    const where = doc.version.id === null ? `Profil ${doc.profile}` : `eingefrorener Fassung ${doc.version.id}`;
    outBody.prepend(note(out, `Nicht konform: Skript in ${where}. Es wird nicht ausgeführt (HPL-SBX-012).`));
  }
  csp.setAttribute('content', frameCsp(options.agentHash, run.map((d) => d.cspHash!)));

  // The agent first: it opens the private channel to the reader and watches motion before any
  // component code runs; then the components, whose text is exactly the verified file.
  const agent = out.createElement('script');
  agent.textContent = options.agent;
  outBody.append(agent);
  for (const d of run) {
    const script = out.createElement('script');
    script.setAttribute('data-hp-component', `${d.name}@${d.version}`);
    script.textContent = d.script!;
    outBody.append(script);
  }
  return { html: `<!DOCTYPE html>\n${html.outerHTML}`, hits };
}
