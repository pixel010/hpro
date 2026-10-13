/**
 * A small static cascade for the accessibility check: which declaration of which stylesheet rule
 * or `style` attribute decides a property of an element (resting state, screen media), and the
 * resulting text and background colour in each colour scheme of the reading system. It knows
 * specificity, `!important`, source order, inheritance of `color` and custom properties, `var()`
 * with fallbacks and alpha compositing of backgrounds. It does not know layout: positioned
 * elements, background images and opacity are reported as "not evaluable", not guessed.
 */
import type { Element } from '@xmldom/xmldom';
import { parseCss, parseStyleAttribute, type CssDeclaration } from '../check/css.js';
import { restingSpecificity } from '../check/selector.js';
import { pointerOf } from '../edit/dom.js';
import { childElements, descendants, resolveHref } from '../lock/xml.js';
import { composite, parseColor, type Rgba } from './color.js';
import type { Scheme } from './model.js';

export type DeclSource =
  | { readonly kind: 'sheet'; readonly path: string; readonly selector: string; readonly media: readonly string[]; readonly occurrence: number; readonly line: number }
  | { readonly kind: 'style'; readonly path: string; readonly pointer: string; readonly line?: number };

export interface SheetRule {
  readonly path: string;
  readonly selector: string;
  readonly media: readonly string[];
  readonly occurrence: number;
  readonly line: number;
  readonly declarations: readonly CssDeclaration[];
}

interface Winner {
  readonly value: string;
  readonly important: boolean;
  readonly spec: number;
  readonly order: number;
  readonly source: DeclSource;
}

/** Media conditions that apply to the reader on screen (print and colour-scheme queries do not). */
export function screenMedia(media: readonly string[]): boolean {
  return media.every((m) => {
    const q = m.toLowerCase();
    if (/\bprint\b/.test(q) && !/\b(screen|all)\b/.test(q)) return false;
    if (/\bnot\s+(screen|all)\b/.test(q)) return false;
    if (q.includes('prefers-color-scheme') || q.includes('forced-colors')) return false;
    return true;
  });
}

/** Key of a rule address for counting occurrences. */
const ruleKey = (path: string, selector: string, media: readonly string[]) => `${path}\u0000${selector}\u0000${media.join('\u0001')}`;

/** Stylesheets of a content document in cascade order: `<link rel="stylesheet">` and `<style>`. */
export function sheetsOf(doc: Element | { documentElement: Element | null }, docPath: string, files: ReadonlyMap<string, Uint8Array>): { rules: SheetRule[]; paths: string[] } {
  const root = 'documentElement' in doc ? doc.documentElement : doc;
  const rules: SheetRule[] = [];
  const paths: string[] = [];
  if (!root) return { rules, paths };
  const head = childElements(root).find((e) => e.localName === 'head');
  if (!head) return { rules, paths };
  const counts = new Map<string, number>();
  const add = (path: string, text: string, baseLine: number) => {
    for (const r of parseCss(text, baseLine).rules) {
      if (r.context !== 'style') continue;
      const key = ruleKey(path, r.selector, r.media);
      const occurrence = counts.get(key) ?? 0;
      counts.set(key, occurrence + 1);
      rules.push({ path, selector: r.selector, media: r.media, occurrence, line: r.line, declarations: r.declarations });
    }
  };
  const decoder = new TextDecoder();
  const seen = new Set<string>();
  const load = (path: string, depth: number) => {
    if (seen.has(path) || depth > 8) return;
    const data = files.get(path);
    if (!data) return;
    seen.add(path);
    const text = decoder.decode(data);
    // @import first, as the cascade does
    for (const m of text.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)) {
      const t = resolveHref(path, m[1]!);
      if (t) load(t.path, depth + 1);
    }
    paths.push(path);
    add(path, text, 1);
  };
  for (const el of childElements(head)) {
    if (el.localName === 'link' && /(^|\s)stylesheet(\s|$)/i.test(el.getAttribute('rel') ?? '') && !/(^|\s)alternate(\s|$)/i.test(el.getAttribute('rel') ?? '')) {
      const t = resolveHref(docPath, el.getAttribute('href') ?? '');
      if (t) load(t.path, 0);
    } else if (el.localName === 'style') {
      add(docPath, el.textContent ?? '', (el as unknown as { lineNumber?: number }).lineNumber ?? 1);
    }
  }
  return { rules, paths };
}

const INHERITED = new Set(['color']);

/** Declared values (after the cascade, before inheritance) of the properties asked for. */
export class Cascade {
  private readonly cache = new Map<Element, Map<string, Winner>>();
  private readonly screen: SheetRule[];

  constructor(
    private readonly docPath: string,
    rules: readonly SheetRule[],
  ) {
    this.screen = rules.filter((r) => screenMedia(r.media));
  }

  /** Own winning declarations of an element (custom properties included). */
  declared(el: Element): Map<string, Winner> {
    let out = this.cache.get(el);
    if (out) return out;
    out = new Map();
    const consider = (prop: string, w: Winner) => {
      const cur = out!.get(prop);
      if (!cur || (w.important !== cur.important ? w.important : w.spec !== cur.spec ? w.spec > cur.spec : w.order > cur.order)) out!.set(prop, w);
    };
    let order = 0;
    for (const r of this.screen) {
      order++;
      const spec = restingSpecificity(el, r.selector);
      if (spec === null) continue;
      const source: DeclSource = { kind: 'sheet', path: r.path, selector: r.selector, media: r.media, occurrence: r.occurrence, line: r.line };
      for (const d of r.declarations) {
        for (const [prop, value] of expand(d)) consider(prop, { value, important: d.important, spec, order, source: { ...source, line: d.line } });
      }
    }
    const style = el.getAttribute('style');
    if (style) {
      const line = (el as unknown as { lineNumber?: number }).lineNumber;
      const source: DeclSource = { kind: 'style', path: this.docPath, pointer: pointerOf(el, this.docPath), ...(line ? { line } : {}) };
      for (const d of parseStyleAttribute(style, line ?? 1).declarations) {
        for (const [prop, value] of expand(d)) consider(prop, { value, important: d.important, spec: 1_000_000, order: Number.MAX_SAFE_INTEGER, source });
      }
    }
    this.cache.set(el, out);
    return out;
  }

  /** The winning declaration of `prop` on the element itself, if any. */
  winner(el: Element, prop: string): Winner | undefined {
    return this.declared(el).get(prop);
  }

  /** Whether the element or an ancestor is not rendered (`display: none`, `hidden`). */
  isHidden(el: Element): boolean {
    for (let e: Element | null = el; e && e.nodeType === 1; e = e.parentNode as Element | null) {
      if (e.hasAttribute('hidden')) return true;
      if (this.declared(e).get('display')?.value.trim().toLowerCase() === 'none') return true;
    }
    return false;
  }

  static isInherited(prop: string): boolean {
    return INHERITED.has(prop) || prop.startsWith('--');
  }
}

/** Longhands of interest: `background` sets `background-color` (and may hide an image). */
function expand(d: CssDeclaration): Array<[string, string]> {
  if (d.property === 'background') {
    const v = d.value.trim();
    if (/url\(|gradient\(/i.test(v)) return [['background-color', v], ['background-image', 'yes']];
    const tokens = splitTopLevel(v);
    const colour = tokens.find((t) => parseColor(t) !== undefined || /^var\(/i.test(t) || /^(currentcolor|inherit|initial|unset)$/i.test(t));
    return [['background-color', colour ?? 'transparent'], ['background-image', 'none']];
  }
  return [[d.property, d.value]];
}

function splitTopLevel(v: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of v) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (/\s/.test(c) && depth === 0) {
      if (cur) out.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

export interface ColourOrigin {
  /** The reader decides the colour (scheme variable or default). */
  readonly reader: boolean;
  /** The deciding declaration, when the document decides it. */
  readonly source?: DeclSource;
  /** Depth of the element that carries the deciding declaration (0 = html, -1 = reader default). */
  readonly depth: number;
}

export interface ResolvedColours {
  readonly fg: Rgba;
  readonly bg: Rgba;
  readonly fgOrigin: ColourOrigin;
  readonly bgOrigin: ColourOrigin;
}

interface InheritedState {
  readonly color: { rgba: Rgba; origin: ColourOrigin };
  readonly vars: ReadonlyMap<string, { value: string; reader: boolean }>;
  readonly bg: { rgba: Rgba; origin: ColourOrigin };
}

/** `var()` substitution; `reader` is true when a reading-system variable supplied the value. */
function substitute(value: string, vars: ReadonlyMap<string, { value: string; reader: boolean }>, depth = 0): { value: string; reader: boolean } | undefined {
  if (depth > 8) return undefined;
  let reader = false;
  let failed = false;
  let out = '';
  let i = 0;
  const lower = value.toLowerCase();
  for (;;) {
    const at = lower.indexOf('var(', i);
    if (at < 0) {
      out += value.slice(i);
      break;
    }
    out += value.slice(i, at);
    let depthP = 0;
    let j = at + 3;
    for (; j < value.length; j++) {
      if (value[j] === '(') depthP++;
      else if (value[j] === ')' && --depthP === 0) break;
    }
    const inner = value.slice(at + 4, j);
    const comma = inner.indexOf(',');
    const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
    const fallback = comma < 0 ? undefined : inner.slice(comma + 1).trim();
    const v = vars.get(name);
    if (v) {
      const r = substitute(v.value, vars, depth + 1);
      if (!r) failed = true;
      else {
        out += r.value;
        reader ||= v.reader || r.reader;
      }
    } else if (fallback !== undefined) {
      const r = substitute(fallback, vars, depth + 1);
      if (!r) failed = true;
      else {
        out += r.value;
        reader ||= r.reader;
      }
    } else failed = true;
    i = j + 1;
  }
  return failed ? undefined : { value: out.trim(), reader };
}

/**
 * Text and background colour of an element in one scheme. Returns a reason string when the
 * colours cannot be determined statically (unknown value, background image).
 */
export function resolveColours(cascade: Cascade, el: Element, scheme: Scheme): ResolvedColours | string {
  const chain: Element[] = [];
  for (let e: Element | null = el; e && e.nodeType === 1; e = e.parentNode as Element | null) chain.unshift(e);
  const fg0 = parseColor(scheme.foreground)!;
  const bg0 = parseColor(scheme.background)!;
  let state: InheritedState = {
    color: { rgba: fg0, origin: { reader: true, depth: -1 } },
    vars: new Map(Object.entries(scheme.vars).map(([k, v]) => [k, { value: v, reader: true }])),
    bg: { rgba: bg0, origin: { reader: true, depth: -1 } },
  };
  for (const [depth, e] of chain.entries()) {
    const own = cascade.declared(e);
    const vars = new Map(state.vars);
    for (const [prop, w] of own) if (prop.startsWith('--')) vars.set(prop, { value: w.value, reader: false });
    // text colour
    let color = state.color;
    const cw = own.get('color');
    const isLink = e.localName === 'a' && e.hasAttribute('href');
    if (isLink && scheme.link) color = { rgba: parseColor(scheme.link)!, origin: { reader: true, depth } };
    else if (cw) {
      // an unset variable without fallback makes the declaration invalid at computed-value time: unset
      const r = substitute(cw.value, vars) ?? { value: 'unset', reader: true };
      const v = r.value.toLowerCase();
      if (v === 'inherit' || v === 'unset' || v === 'currentcolor') color = state.color;
      else if (v === 'initial') color = { rgba: fg0, origin: { reader: true, depth } };
      else {
        const c = parseColor(v);
        if (!c) return `Farbwert „${cw.value}“ nicht auswertbar`;
        color = { rgba: c.a < 1 ? composite(c, state.bg.rgba) : c, origin: r.reader ? { reader: true, depth } : { reader: false, source: cw.source, depth } };
      }
    }
    // background
    let bg = state.bg;
    if (own.get('background-image')?.value === 'yes' || (own.get('background-image') && own.get('background-image')!.value !== 'none' && /url\(|gradient\(/i.test(own.get('background-image')!.value))) {
      return 'Hintergrundbild oder Verlauf';
    }
    const bw = own.get('background-color');
    if (bw) {
      const r = substitute(bw.value, vars) ?? { value: 'unset', reader: true };
      const v = r.value.toLowerCase();
      if (v === 'inherit') bg = state.bg;
      else if (v === 'currentcolor') bg = { rgba: color.rgba, origin: color.origin };
      else if (v !== 'initial' && v !== 'unset' && v !== 'transparent') {
        const c = parseColor(v);
        if (!c) return `Hintergrundwert „${bw.value}“ nicht auswertbar`;
        if (c.a > 0) bg = { rgba: composite(c, state.bg.rgba), origin: r.reader ? { reader: true, depth } : { reader: false, source: bw.source, depth } };
      }
    }
    state = { color, vars, bg };
  }
  return { fg: state.color.rgba, bg: state.bg.rgba, fgOrigin: state.color.origin, bgOrigin: state.bg.origin };
}

/** All elements of a document (helper re-export for the rules). */
export { descendants };
