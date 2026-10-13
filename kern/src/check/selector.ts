/**
 * Matching of CSS selectors against parsed XHTML elements, for the static rules that ask
 * which elements a stylesheet rule reaches (HPR-INH-015, HPR-NEST-001, HPR-INH-021,
 * HPR-PRINT-001). Supported: type, universal, `#id`, `.class`, attribute selectors
 * (`[a]`, `=`, `~=`, `|=`, `^=`, `$=`, `*=`, flag `i`), the combinators descendant, `>`, `+`, `~`,
 * and the pseudo-classes `:root`, `:first-child`, `:last-child`, `:only-child`, `:empty`,
 * `:not()`, `:is()`, `:where()`. Other pseudo-classes (`:hover`, `:nth-child()`, …) are treated
 * as matching, so the result errs towards reporting; a selector with a pseudo-element never
 * matches the element itself.
 */
import { attr, localName, type XmlElement } from './markup.js';

interface AttrTest {
  readonly name: string;
  readonly op?: string;
  readonly value?: string;
  readonly ci: boolean;
}

interface Compound {
  type?: string;
  ids: string[];
  classes: string[];
  attrs: AttrTest[];
  pseudo: Array<{ name: string; arg?: string }>;
  pseudoElement: boolean;
}

interface Complex {
  readonly compounds: Compound[];
  /** combinators[i] joins compounds[i] and compounds[i + 1]. */
  readonly combinators: string[];
}

const cache = new Map<string, Complex[] | null>();

function readIdent(s: string, i: number): [string, number] {
  let j = i;
  while (j < s.length && /[\w -￿\\-]/.test(s[j]!)) j += s[j] === '\\' ? 2 : 1;
  return [s.slice(i, j).replace(/\\(.)/g, '$1'), j];
}

function readBalanced(s: string, i: number, open: string, close: string): [string, number] {
  let depth = 0;
  let j = i;
  for (; j < s.length; j++) {
    if (s[j] === open) depth++;
    else if (s[j] === close) {
      depth--;
      if (depth === 0) break;
    }
  }
  return [s.slice(i + 1, j), j + 1];
}

function parseComplex(text: string): Complex | null {
  const compounds: Compound[] = [];
  const combinators: string[] = [];
  let cur: Compound = { ids: [], classes: [], attrs: [], pseudo: [], pseudoElement: false };
  let started = false;
  let i = 0;
  const s = text.trim();
  const push = () => {
    compounds.push(cur);
    cur = { ids: [], classes: [], attrs: [], pseudo: [], pseudoElement: false };
    started = false;
  };
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c) || c === '>' || c === '+' || c === '~') {
      let comb = ' ';
      while (i < s.length && /[\s>+~]/.test(s[i]!)) {
        if (s[i] !== ' ' && !/\s/.test(s[i]!)) comb = s[i]!;
        i++;
      }
      if (started) {
        push();
        combinators.push(comb);
      }
      continue;
    }
    started = true;
    if (c === '*') {
      cur.type = '*';
      i++;
    } else if (c === '#') {
      const [id, j] = readIdent(s, i + 1);
      cur.ids.push(id);
      i = j;
    } else if (c === '.') {
      const [cls, j] = readIdent(s, i + 1);
      cur.classes.push(cls);
      i = j;
    } else if (c === '[') {
      const [inner, j] = readBalanced(s, i, '[', ']');
      i = j;
      const m = /^\s*([\w:|-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))\s*(i|s)?)?\s*$/.exec(inner);
      if (!m) return null;
      cur.attrs.push({ name: m[1]!.replace(/^\w*\|/, '').toLowerCase(), ...(m[2] ? { op: m[2], value: m[3] ?? m[4] ?? m[5] ?? '' } : {}), ci: m[6] === 'i' });
    } else if (c === ':') {
      if (s[i + 1] === ':') {
        cur.pseudoElement = true;
        const [, j] = readIdent(s, i + 2);
        i = j;
        if (s[i] === '(') i = readBalanced(s, i, '(', ')')[1];
        continue;
      }
      const [name, j] = readIdent(s, i + 1);
      i = j;
      let arg: string | undefined;
      if (s[i] === '(') {
        const [inner, k] = readBalanced(s, i, '(', ')');
        arg = inner;
        i = k;
      }
      const lower = name.toLowerCase();
      if (['before', 'after', 'first-line', 'first-letter', 'marker', 'placeholder', 'selection'].includes(lower)) cur.pseudoElement = true;
      else cur.pseudo.push({ name: lower, ...(arg !== undefined ? { arg } : {}) });
    } else if (/[\w\\-]/.test(c)) {
      const [name, j] = readIdent(s, i);
      cur.type = name.toLowerCase();
      i = j;
    } else {
      return null;
    }
  }
  if (started) compounds.push(cur);
  if (compounds.length === 0) return null;
  return { compounds, combinators };
}

/** Parses a selector list; `null` when it is not understood. */
export function parseSelectorList(text: string): Complex[] | null {
  if (cache.has(text)) return cache.get(text)!;
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  const out: Complex[] = [];
  for (const p of parts) {
    if (p.trim() === '') continue;
    const c = parseComplex(p);
    if (!c) {
      cache.set(text, null);
      return null;
    }
    out.push(c);
  }
  cache.set(text, out);
  return out;
}

function parentElement(el: XmlElement): XmlElement | null {
  const p = el.parentNode;
  return p && p.nodeType === 1 ? (p as unknown as XmlElement) : null;
}

function prevElement(el: XmlElement): XmlElement | null {
  for (let s = el.previousSibling; s; s = s.previousSibling) if (s.nodeType === 1) return s as unknown as XmlElement;
  return null;
}

function nextElement(el: XmlElement): XmlElement | null {
  for (let s = el.nextSibling; s; s = s.nextSibling) if (s.nodeType === 1) return s as unknown as XmlElement;
  return null;
}

function matchCompound(el: XmlElement, c: Compound): boolean {
  if (c.pseudoElement) return false;
  if (c.type && c.type !== '*' && localName(el).toLowerCase() !== c.type) return false;
  const id = attr(el, 'id');
  if (c.ids.some((x) => x !== id)) return false;
  const classes = (attr(el, 'class') ?? '').split(/\s+/);
  if (c.classes.some((x) => !classes.includes(x))) return false;
  for (const a of c.attrs) {
    const raw = a.name === 'xml:lang' ? el.getAttribute('xml:lang') : el.hasAttribute(a.name) ? el.getAttribute(a.name) : null;
    if (raw === null) return false;
    if (!a.op) continue;
    const v = a.ci ? raw.toLowerCase() : raw;
    const want = a.ci ? (a.value ?? '').toLowerCase() : (a.value ?? '');
    const ok =
      a.op === '=' ? v === want
      : a.op === '~=' ? v.split(/\s+/).includes(want)
      : a.op === '|=' ? v === want || v.startsWith(want + '-')
      : a.op === '^=' ? want !== '' && v.startsWith(want)
      : a.op === '$=' ? want !== '' && v.endsWith(want)
      : a.op === '*=' ? want !== '' && v.includes(want)
      : false;
    if (!ok) return false;
  }
  for (const p of c.pseudo) {
    switch (p.name) {
      case 'root':
        if (parentElement(el) !== null) return false;
        break;
      case 'first-child':
        if (prevElement(el)) return false;
        break;
      case 'last-child':
        if (nextElement(el)) return false;
        break;
      case 'only-child':
        if (prevElement(el) || nextElement(el)) return false;
        break;
      case 'empty':
        if (el.firstChild) return false;
        break;
      case 'not': {
        const inner = parseSelectorList(p.arg ?? '');
        if (inner && inner.some((x) => matchComplex(el, x))) return false;
        break;
      }
      case 'is':
      case 'where':
      case 'matches': {
        const inner = parseSelectorList(p.arg ?? '');
        if (inner && !inner.some((x) => matchComplex(el, x))) return false;
        break;
      }
      default:
        // State pseudo-classes in the resting state (contrast, P8) do not match; otherwise
        // state and structural pseudo-classes: assume match.
        if (resting && STATE_PSEUDO.has(p.name)) return false;
        break;
    }
  }
  return true;
}

/** Pseudo-classes that depend on user interaction or history, not on the document. */
const STATE_PSEUDO = new Set(['hover', 'focus', 'focus-visible', 'focus-within', 'active', 'visited', 'target', 'target-within', 'checked', 'indeterminate', 'invalid', 'valid', 'user-invalid', 'user-valid', 'placeholder-shown', 'autofill']);
let resting = false;

function specificityOf(cx: Complex): number {
  let a = 0;
  let b = 0;
  let c = 0;
  for (const k of cx.compounds) {
    a += k.ids.length;
    b += k.classes.length + k.attrs.length;
    if (k.type && k.type !== '*') c++;
    for (const p of k.pseudo) {
      if (p.name === 'where') continue;
      if (p.name === 'is' || p.name === 'not' || p.name === 'matches') {
        const inner = parseSelectorList(p.arg ?? '') ?? [];
        const max = Math.max(0, ...inner.map(specificityOf));
        a += Math.floor(max / 10000);
        b += Math.floor(max / 100) % 100;
        c += max % 100;
      } else b++;
    }
  }
  return a * 10000 + b * 100 + c;
}

/**
 * Specificity (a·10000 + b·100 + c) of the most specific selector of the list that matches the
 * element in its resting state (no hover, focus, …), or null when none matches (P8, contrast).
 */
export function restingSpecificity(el: XmlElement, selectorList: string): number | null {
  const list = parseSelectorList(selectorList);
  if (!list) return null;
  let best: number | null = null;
  resting = true;
  try {
    for (const cx of list) {
      if (!matchComplex(el, cx)) continue;
      const s = specificityOf(cx);
      if (best === null || s > best) best = s;
    }
  } finally {
    resting = false;
  }
  return best;
}

function matchFrom(el: XmlElement, cx: Complex, index: number): boolean {
  if (!matchCompound(el, cx.compounds[index]!)) return false;
  if (index === 0) return true;
  const comb = cx.combinators[index - 1]!;
  if (comb === '>') {
    const p = parentElement(el);
    return !!p && matchFrom(p, cx, index - 1);
  }
  if (comb === ' ') {
    for (let p = parentElement(el); p; p = parentElement(p)) if (matchFrom(p, cx, index - 1)) return true;
    return false;
  }
  if (comb === '+') {
    const p = prevElement(el);
    return !!p && matchFrom(p, cx, index - 1);
  }
  for (let p = prevElement(el); p; p = prevElement(p)) if (matchFrom(p, cx, index - 1)) return true;
  return false;
}

function matchComplex(el: XmlElement, cx: Complex): boolean {
  return matchFrom(el, cx, cx.compounds.length - 1);
}

/** True when any selector of the list matches the element; unparsable selectors never match. */
export function matches(el: XmlElement, selectorList: string): boolean {
  const list = parseSelectorList(selectorList);
  return !!list && list.some((cx) => matchComplex(el, cx));
}
