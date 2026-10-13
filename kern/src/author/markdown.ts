/**
 * Markdown reader of the author path (S5). It reads the subset documented in
 * `docs/12-autorenweg.md`, section 3 — CommonMark blocks and inlines, GFM pipe tables, Pandoc
 * footnotes, caption lines (`Table: …`) and attributes (`{#kennung}`), a YAML front matter with
 * simple values — and two fenced blocks for nested information:
 *
 *   ::: zusammenfassung [Titel]     overview (HP-NEST-005)
 *   ::: details Kurztext            collapsible section (HP-NEST-001)
 *
 * Everything else is reported, never silently dropped: raw HTML is not carried over (no script
 * can enter a document this way, HP-INH-012), remote images are not fetched (HP-CONT-010),
 * horizontal rules and formulas have no element in the minimum profile.
 */
import { Messages, plain, text, type AuthorSource, type Block, type Cell, type Inline, type SourceMeta } from './model.js';
import { normalizeDate } from './write.js';

export const MARKDOWN_TOOL = { name: 'hpro-author-md', version: '0.1.0' } as const;

export interface MarkdownOptions {
  /**
   * Loads an image referenced by a relative path (resolved by the caller against the directory of
   * the source). Returns undefined when the file does not exist. Without a loader no image is read.
   */
  readonly loadFile?: (relativePath: string) => Uint8Array | undefined;
}

// ------------------------------------------------------------------------------------ front matter

type FrontValue = string | string[];

/** YAML subset: `key: value`, quoted values, `key: |` blocks, `key:` with `- item` lines, comments. */
export function parseFrontMatter(lines: readonly string[]): { values: Record<string, FrontValue>; problems: string[] } {
  const values: Record<string, FrontValue> = {};
  const problems: string[] = [];
  const unquote = (v: string) => {
    const t = v.trim();
    if ((t.startsWith('"') && t.endsWith('"') && t.length >= 2) || (t.startsWith("'") && t.endsWith("'") && t.length >= 2)) {
      return t.startsWith('"') ? t.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n') : t.slice(1, -1).replace(/''/g, "'");
    }
    return t.replace(/\s+#.*$/, '');
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*(#.*)?$/.test(line)) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) {
      problems.push(`Kopfzeile ${i + 2} nicht verstanden: „${line.trim()}“`);
      continue;
    }
    const key = m[1]!.toLowerCase().replace(/-/g, '_');
    const rest = m[2]!.trim();
    if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-') {
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]!) || lines[i + 1]!.trim() === '')) block.push(lines[++i]!.trim());
      while (block.length > 0 && block[block.length - 1] === '') block.pop();
      values[key] = rest.startsWith('|') ? block.join('\n') : block.join(' ');
    } else if (rest === '') {
      const items: string[] = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1]!)) items.push(unquote(lines[++i]!.replace(/^\s*-\s+/, '')));
      values[key] = items;
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      values[key] = rest.slice(1, -1).split(',').map(unquote).filter(Boolean);
    } else values[key] = unquote(rest);
  }
  return { values, problems };
}

const KEY_ALIASES: Record<string, string> = {
  title: 'titel', lang: 'sprache', language: 'sprache', date: 'datum', id: 'kennung', identifier: 'kennung',
  author: 'autoren', authors: 'autoren', autor: 'autoren', description: 'beschreibung', template: 'vorlage', modified: 'geaendert',
};

// ------------------------------------------------------------------------------------ helpers

const BLANK = /^\s*$/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+|$)(.*)$/;
const FENCE = /^( {0,3})(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?/;
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)(.*)$/;
const DIV = /^ {0,3}(:{3,})\s*(.*)$/;
const HTML_BLOCK = /^ {0,3}<(!--|\/?[A-Za-z][A-Za-z0-9-]*(?:[\s/>]|$))/;
const DELIM_ROW = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const CAPTION = /^\s*(?:Table|Tabelle)?:\s+(.+)$/;
const ATTRS = /\s*\{([^{}]*)\}\s*$/;

interface Attrs {
  id?: string;
  classes: string[];
  kv: Record<string, string>;
}

function parseAttrs(s: string): Attrs {
  const a: Attrs = { classes: [], kv: {} };
  for (const tok of s.match(/[#.][^\s#.]+|[A-Za-z_-]+="[^"]*"|[A-Za-z_-]+=\S+/g) ?? []) {
    if (tok.startsWith('#')) a.id = tok.slice(1);
    else if (tok.startsWith('.')) a.classes.push(tok.slice(1));
    else {
      const [k, ...v] = tok.split('=');
      a.kv[k!] = v.join('=').replace(/^"|"$/g, '');
    }
  }
  return a;
}

const expandTabs = (line: string) => line.replace(/^[ \t]+/, (ws) => ws.replace(/\t/g, '    '));
const indentOf = (line: string) => /^ */.exec(line)![0].length;

function sniffImage(data: Uint8Array): string | undefined {
  const hex = [...data.subarray(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.startsWith('89504e47')) return 'image/png';
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('47494638')) return 'image/gif';
  if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return 'image/webp';
  const head = new TextDecoder().decode(data.subarray(0, 256));
  if (/<svg[\s>]/.test(head) || (head.startsWith('<?xml') && /<svg/.test(new TextDecoder().decode(data.subarray(0, 2048))))) return 'image/svg+xml';
  return undefined;
}

// ------------------------------------------------------------------------------------ reader

export function readMarkdown(source: string, options: MarkdownOptions = {}): AuthorSource {
  const msg = new Messages();
  const inv: Record<string, number> = {};
  const seen = (k: string, n = 1) => (inv[k] = (inv[k] ?? 0) + n);
  let lines = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').map(expandTabs);

  // Front matter.
  let front: Record<string, FrontValue> = {};
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && (l.trim() === '---' || l.trim() === '...'));
    if (end > 0) {
      const fm = parseFrontMatter(lines.slice(1, end));
      for (const [k, v] of Object.entries(fm.values)) front[KEY_ALIASES[k] ?? k] = v;
      for (const p of fm.problems) msg.add('kopf-unverstanden', 'metadaten', 'verlust', p);
      lines = lines.slice(end + 1);
    }
  }

  // Footnote and link reference definitions (top level).
  const noteDefs = new Map<string, string[]>();
  const linkDefs = new Map<string, string>();
  {
    const keep: string[] = [];
    let inFence: string | null = null;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      const f = FENCE.exec(l);
      if (inFence) {
        if (f && f[2]!.startsWith(inFence)) inFence = null;
        keep.push(l);
        continue;
      }
      if (f) {
        inFence = f[2]!;
        keep.push(l);
        continue;
      }
      const fn = /^ {0,3}\[\^([^\]\s]+)\]:[ \t]?(.*)$/.exec(l);
      if (fn) {
        const body = [fn[2]!];
        while (i + 1 < lines.length && (/^ {2,}\S/.test(lines[i + 1]!) || (BLANK.test(lines[i + 1]!) && /^ {2,}\S/.test(lines[i + 2] ?? '')))) {
          const next = lines[++i]!;
          body.push(next.replace(/^ {2,4}/, ''));
        }
        if (noteDefs.has(fn[1]!)) msg.add('fussnote-doppelt', 'fussnote', 'verlust', `Fußnote [^${fn[1]}] zweimal definiert; die erste gilt.`);
        else noteDefs.set(fn[1]!, body);
        continue;
      }
      const ld = /^ {0,3}\[([^\]^][^\]]*)\]:\s*<?(\S+?)>?(?:\s+["'(].*["')])?\s*$/.exec(l);
      if (ld) {
        linkDefs.set(ld[1]!.toLowerCase().replace(/\s+/g, ' '), ld[2]!);
        continue;
      }
      keep.push(l);
    }
    lines = keep;
  }
  if (noteDefs.size > 0) seen('fussnote-definition', noteDefs.size);
  const usedNotes = new Set<string>();

  // ---------------------------------------------------------------- inline
  type Pending = { figures: Block[] };

  const image = (alt: string, src: string, title: string | undefined, attrs: Attrs | undefined): Block => {
    seen('bild');
    const name = src.split(/[\\/]/).pop() || 'bild';
    const marks = attrs?.id ? [attrs.id] : undefined;
    const decorative = !!attrs && attrs.classes.some((c) => c === 'dekorativ' || c === 'decorative');
    const caption = title ? inlines(title, { figures: [] }) : undefined;
    const gap = (why: string, sev: 'verlust' | 'ersatz' = 'verlust'): Block => {
      msg.add('bild-nicht-geladen', 'bild', sev, `Bild „${src}“: ${why}`);
      return { t: 'gap', text: `Bild nicht übernommen: ${alt || name}` };
    };
    if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return gap('nur über das Netz erreichbar; nicht geladen, weil ein Dokument nichts von außen nachlädt (HP-CONT-010). Datei herunterladen und relativ einbinden.');
    if (src.startsWith('/') || src.split(/[\\/]/).includes('..')) return gap('Pfad liegt außerhalb des Quellverzeichnisses; nicht gelesen.');
    if (!options.loadFile) return gap('kein Zugriff auf Dateien (ohne Lader aufgerufen).');
    const data = options.loadFile(decodeURI(src));
    if (!data) return gap('Datei nicht gefunden.');
    const mediaType = sniffImage(data);
    if (!mediaType) return gap('Format ist keiner der Kernmedientypen PNG, JPEG, GIF, WebP, SVG (HP-MIN-007); vorher umwandeln.');
    const w = attrs?.kv.width ? Number.parseInt(attrs.kv.width, 10) : undefined;
    const h = attrs?.kv.height ? Number.parseInt(attrs.kv.height, 10) : undefined;
    return {
      t: 'figure',
      image: { data, mediaType, name },
      alt: decorative ? '' : alt.trim() ? alt.trim() : null,
      ...(decorative ? { decorative: true } : {}),
      ...(caption ? { caption } : {}),
      ...(marks ? { marks } : {}),
      ...(w && h ? { width: w, height: h } : {}),
    };
  };

  /** Finds the end of a bracket group starting at `start` (index of `[`), honouring nesting and code. */
  const closeBracket = (s: string, start: number): number => {
    let depth = 0;
    for (let j = start; j < s.length; j++) {
      const c = s[j];
      if (c === '\\') j++;
      else if (c === '`') {
        const run = /^`+/.exec(s.slice(j))![0];
        const end = s.indexOf(run, j + run.length);
        if (end > 0) j = end + run.length - 1;
      } else if (c === '[') depth++;
      else if (c === ']' && --depth === 0) return j;
    }
    return -1;
  };

  /** `(dest "title")` after a link or image; returns the parsed parts and the end index. */
  const destination = (s: string, open: number): { dest: string; title?: string; end: number } | null => {
    if (s[open] !== '(') return null;
    let depth = 0;
    for (let j = open; j < s.length; j++) {
      if (s[j] === '\\') j++;
      else if (s[j] === '(') depth++;
      else if (s[j] === ')' && --depth === 0) {
        const inner = s.slice(open + 1, j).trim();
        const m = /^<?([^\s>]*)>?(?:\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'))?$/.exec(inner);
        if (!m) return null;
        const title = m[2] ?? m[3];
        return { dest: m[1]!, ...(title !== undefined ? { title: title.replace(/\\(.)/g, '$1') } : {}), end: j };
      }
    }
    return null;
  };

  function inlines(s: string, pending: Pending): Inline[] {
    const out: Inline[] = [];
    let buf = '';
    const flush = () => {
      if (buf) out.push(text(buf)), (buf = '');
    };
    const push = (i: Inline) => {
      flush();
      out.push(i);
    };
    for (let i = 0; i < s.length; i++) {
      const c = s[i]!;
      const rest = s.slice(i);
      if (c === '\\') {
        const n = s[i + 1];
        if (n === '\n') push({ t: 'br' }), i++;
        else if (n !== undefined && /[!-\/:-@\[-`{-~]/.test(n)) (buf += n), i++;
        else buf += c;
        continue;
      }
      if (c === '\n') {
        if (/ {2,}$/.test(buf)) {
          buf = buf.replace(/ +$/, '');
          push({ t: 'br' });
        } else buf = buf.replace(/ +$/, '') + ' ';
        while (s[i + 1] === ' ') i++;
        continue;
      }
      if (c === '`') {
        const run = /^`+/.exec(rest)![0];
        const end = s.indexOf(run, i + run.length);
        if (end > 0 && s[end + run.length] !== '`') {
          let v = s.slice(i + run.length, end).replace(/\n/g, ' ');
          if (/^ .* $/.test(v) && v.trim()) v = v.slice(1, -1);
          push({ t: 'code', v });
          i = end + run.length - 1;
          continue;
        }
        buf += run;
        i += run.length - 1;
        continue;
      }
      if (c === '<') {
        const auto = /^<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\s<>]*)>/.exec(rest);
        if (auto) {
          push({ t: 'link', href: auto[1]!, c: [text(auto[1]!)] });
          seen('verweis');
          i += auto[0].length - 1;
          continue;
        }
        const br = /^<br\s*\/?>/i.exec(rest);
        if (br) {
          push({ t: 'br' });
          i += br[0].length - 1;
          continue;
        }
        const tag = /^<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>|^<!--[\s\S]*?-->/.exec(rest);
        if (tag) {
          seen('html-inline');
          msg.add('html-inline', 'format', 'verlust', `HTML im Text nicht übernommen (${tag[0].slice(0, 40)}); nur der Text dazwischen bleibt (HP-INH-012).`);
          i += tag[0].length - 1;
          continue;
        }
      }
      if (c === '!' && s[i + 1] === '[') {
        const close = closeBracket(s, i + 1);
        const d = close > 0 ? destination(s, close + 1) : null;
        if (d) {
          let end = d.end;
          let attrs: Attrs | undefined;
          const am = /^\{([^{}]*)\}/.exec(s.slice(end + 1));
          if (am) (attrs = parseAttrs(am[1]!)), (end += am[0].length);
          pending.figures.push(image(s.slice(i + 2, close), d.dest, d.title, attrs));
          i = end;
          continue;
        }
      }
      if (c === '^' && s[i + 1] === '[') {
        const close = closeBracket(s, i + 1);
        if (close > 0) {
          seen('fussnote');
          push({ t: 'note', kind: 'footnote', blocks: [{ t: 'p', c: inlines(s.slice(i + 2, close), pending) }] });
          i = close;
          continue;
        }
      }
      if (c === '[') {
        const fn = /^\[\^([^\]\s]+)\]/.exec(rest);
        if (fn) {
          seen('fussnote');
          const def = noteDefs.get(fn[1]!);
          if (!def) {
            msg.add('fussnote-ohne-text', 'fussnote', 'verlust', `Fußnotenverweis [^${fn[1]}] ohne Definition; als Text übernommen.`);
            buf += fn[0];
          } else if (usedNotes.has(fn[1]!)) {
            msg.add('fussnote-mehrfach', 'fussnote', 'ersatz', `Fußnote [^${fn[1]}] wird mehrfach verwendet; jeder Notentext steht nur einmal im Dokument (HP-MIN-008), weitere Verweise als Text.`);
            buf += `[${fn[1]}]`;
          } else {
            usedNotes.add(fn[1]!);
            push({ t: 'note', kind: 'footnote', name: fn[1]!, blocks: blocks(def) });
          }
          i += fn[0].length - 1;
          continue;
        }
        const close = closeBracket(s, i);
        if (close > 0) {
          const label = s.slice(i + 1, close);
          const d = destination(s, close + 1);
          const am = !d ? /^\{([^{}]*)\}/.exec(s.slice(close + 1)) : null;
          if (d) {
            seen('verweis');
            push({ t: 'link', href: d.dest, c: inlines(label, pending) });
            i = d.end;
            continue;
          }
          if (am) {
            // Bracketed span with attributes: `[Text]{#kennung}` marks a place in the text.
            const at = parseAttrs(am[1]!);
            if (at.id) push({ t: 'mark', name: at.id });
            for (const x of inlines(label, pending)) push(x);
            i = close + am[0].length;
            continue;
          }
          const refm = /^\[([^\]]*)\]/.exec(s.slice(close + 1));
          const key = (refm && refm[1] ? refm[1] : label).toLowerCase().replace(/\s+/g, ' ');
          const target = linkDefs.get(key);
          if (target) {
            seen('verweis');
            push({ t: 'link', href: target, c: inlines(label, pending) });
            i = close + (refm ? refm[0].length : 0);
            continue;
          }
        }
      }
      if (c === '*' || c === '_' || c === '~' || c === '^') {
        const run = new RegExp(`^\\${c}+`).exec(rest)![0];
        const prev = s[i - 1] ?? ' ';
        const next = s[i + run.length] ?? ' ';
        const intraword = c === '_' && /[\p{L}\p{N}]/u.test(prev);
        if (!intraword && next !== ' ' && next !== '\n') {
          const n = c === '~' ? Math.min(run.length, 2) : c === '^' ? 1 : Math.min(run.length, 3);
          const closer = c.repeat(n);
          let j = i + n;
          let found = -1;
          while (j < s.length) {
            if (s[j] === '\\') {
              j += 2;
              continue;
            }
            if (s[j] === '`') {
              const r = /^`+/.exec(s.slice(j))![0];
              const e = s.indexOf(r, j + r.length);
              j = e > 0 ? e + r.length : j + r.length;
              continue;
            }
            if (s[j] === c) {
              const r = new RegExp(`^\\${c}+`).exec(s.slice(j))![0];
              const after = s[j + r.length] ?? ' ';
              const okFlank = s[j - 1] !== ' ' && s[j - 1] !== '\n' && !(c === '_' && /[\p{L}\p{N}]/u.test(after));
              if (okFlank && (r.length === n || (n < 3 && r.length >= n && c !== '~'))) {
                found = j;
                break;
              }
              j += r.length;
              continue;
            }
            if ((c === '^' || (c === '~' && n === 1)) && /\s/.test(s[j]!)) break;
            j++;
          }
          if (found > 0) {
            const inner = inlines(s.slice(i + n, found), pending);
            if (c === '^') push({ t: 'sup', c: inner });
            else if (c === '~' && n === 1) push({ t: 'sub', c: inner });
            else if (c === '~') {
              msg.add('durchgestrichen', 'format', 'ersatz', 'Durchgestrichener Text als Formatierung (CSS-Klasse) übernommen; die Bedeutung „gestrichen“ hat im Mindestprofil kein Element.');
              push({ t: 'span', cls: 'hp-durchgestrichen', c: inner });
            } else if (n === 3) push({ t: 'strong', c: [{ t: 'em', c: inner }] });
            else push({ t: n === 2 ? 'strong' : 'em', c: inner });
            i = found + n - 1;
            continue;
          }
        }
        buf += run;
        i += run.length - 1;
        continue;
      }
      if (c === '$' && s[i + 1] !== ' ' && s[i + 1] !== '$') {
        const end = s.indexOf('$', i + 1);
        if (end > i + 1 && s[end - 1] !== ' ' && !/\d/.test(s[end + 1] ?? '')) {
          seen('formel');
          msg.add('formel', 'formel', 'ersatz', 'Formel ($…$) als Quelltext übernommen; Formelsatz gibt es im Mindestprofil nicht.');
          push({ t: 'code', v: s.slice(i + 1, end) });
          i = end;
          continue;
        }
      }
      buf += c;
    }
    flush();
    // Trim a trailing space left by a soft break.
    const last = out[out.length - 1];
    if (last?.t === 'text') out[out.length - 1] = text(last.v.replace(/\s+$/, ''));
    return out.filter((x) => !(x.t === 'text' && x.v === ''));
  }

  // ---------------------------------------------------------------- blocks
  const isBlockStart = (l: string, inParagraph: boolean): boolean => {
    if (ATX.test(l) || FENCE.test(l) || QUOTE.test(l) || HR.test(l) || DIV.test(l) || HTML_BLOCK.test(l)) return true;
    const m = ITEM.exec(l);
    if (!m) return false;
    if (!inParagraph) return true;
    // A list interrupts a paragraph only with content and, if ordered, starting at 1 (CommonMark 5.2).
    return m[4]!.trim() !== '' && (/^[-*+]$/.test(m[2]!) || /^1[.)]$/.test(m[2]!));
  };

  const headingAttrs = (raw: string): { content: string; marks?: string[] } => {
    let content = raw.replace(/[ \t]+#+[ \t]*$/, '').replace(/^#+[ \t]*$/, '').trim();
    const am = ATTRS.exec(content);
    if (am) {
      const a = parseAttrs(am[1]!);
      content = content.slice(0, am.index).trim();
      if (a.id) return { content, marks: [a.id] };
    }
    return { content };
  };

  const splitRow = (line: string): string[] => {
    let l = line.trim();
    if (l.startsWith('|')) l = l.slice(1);
    if (l.endsWith('|') && !l.endsWith('\\|')) l = l.slice(0, -1);
    const cells: string[] = [];
    let cur = '';
    let code = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i]!;
      if (ch === '\\' && l[i + 1] === '|') {
        cur += '|';
        i++;
      } else if (ch === '`') (code = !code), (cur += ch);
      else if (ch === '|' && !code) cells.push(cur.trim()), (cur = '');
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };

  function blocks(src: readonly string[]): Block[] {
    const out: Block[] = [];
    let para: string[] = [];
    const flushPara = () => {
      if (para.length === 0) return;
      const raw = para.join('\n').trim();
      para = [];
      if (!raw) return;
      // A paragraph that is only an image becomes a figure.
      const pending: Pending = { figures: [] };
      let marks: string[] | undefined;
      let content = raw;
      const am = /\s*\{(#[A-Za-z][^{}\s]*)\}\s*$/.exec(content);
      if (am && !/\)\{[^{}]*\}\s*$/.test(content)) (marks = [am[1]!.slice(1)]), (content = content.slice(0, am.index));
      const c = inlines(content, pending);
      if (c.length > 0) out.push({ t: 'p', c, ...(marks ? { marks } : {}) });
      if (pending.figures.length > 0 && c.length > 0) {
        msg.add('bild-im-text', 'bild', 'ersatz', 'Bild mitten im Absatz als eigene Abbildung nach dem Absatz gesetzt (Bilder stehen im Mindestprofil in figure).');
      }
      out.push(...pending.figures);
    };

    for (let i = 0; i < src.length; i++) {
      const line = src[i]!;
      if (BLANK.test(line)) {
        flushPara();
        continue;
      }
      // Setext heading underline.
      if (para.length > 0 && /^ {0,3}(=+|-+)[ \t]*$/.test(line)) {
        const level = line.trim().startsWith('=') ? 1 : 2;
        const h = headingAttrs(para.join(' '));
        para = [];
        seen('ueberschrift');
        out.push({ t: 'heading', level, c: inlines(h.content, { figures: [] }), ...(h.marks ? { marks: h.marks } : {}) });
        continue;
      }
      const atx = ATX.exec(line);
      if (atx) {
        flushPara();
        const h = headingAttrs(atx[2]!);
        const pending: Pending = { figures: [] };
        seen('ueberschrift');
        out.push({ t: 'heading', level: atx[1]!.length, c: inlines(h.content, pending), ...(h.marks ? { marks: h.marks } : {}) });
        out.push(...pending.figures);
        continue;
      }
      const fence = FENCE.exec(line);
      if (fence) {
        flushPara();
        const indent = fence[1]!.length;
        const marker = fence[2]!;
        const body: string[] = [];
        let j = i + 1;
        for (; j < src.length; j++) {
          if (new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`).test(src[j]!)) break;
          body.push(src[j]!.replace(new RegExp(`^ {0,${indent}}`), ''));
        }
        if (j >= src.length) msg.add('codeblock-offen', 'text', 'hinweis', 'Codeblock ohne schließende Zaunzeile; bis zum Ende übernommen.');
        i = j;
        seen('code');
        out.push({ t: 'pre', text: body.join('\n'), ...(fence[3] ? { lang: fence[3] } : {}) });
        continue;
      }
      const div = DIV.exec(line);
      if (div && div[2]!.trim() !== '') {
        flushPara();
        const colons = div[1]!.length;
        const head = div[2]!.trim();
        let depth = 1;
        const body: string[] = [];
        let j = i + 1;
        for (; j < src.length; j++) {
          const d = DIV.exec(src[j]!);
          if (d && d[1]!.length >= 3) {
            if (d[2]!.trim() === '') {
              if (--depth === 0 && d[1]!.length >= Math.min(colons, 3)) break;
            } else depth++;
          }
          body.push(src[j]!);
        }
        i = j;
        const m = /^\{?\s*\.?([A-Za-zÄÖÜäöüß-]+)\}?\s*(.*)$/.exec(head)!;
        const kind = m[1]!.toLowerCase();
        const restText = m[2]!.trim();
        if (['zusammenfassung', 'ueberblick', 'überblick', 'summary'].includes(kind)) {
          seen('ueberblick');
          out.push({ t: 'summary', title: restText, blocks: blocks(body) });
        } else if (kind === 'details') {
          seen('details');
          const a = ATTRS.exec(restText);
          const summaryText = a ? restText.slice(0, a.index).trim() : restText;
          const id = a ? parseAttrs(a[1]!).id : undefined;
          out.push({ t: 'details', summary: inlines(summaryText || 'Details', { figures: [] }), blocks: blocks(body), ...(id ? { marks: [id] } : {}) });
        } else {
          msg.add('block-unbekannt', 'format', 'ersatz', `Block „::: ${kind}“ ist nicht bekannt (bekannt: zusammenfassung, details); Inhalt als gewöhnlicher Text übernommen.`);
          out.push(...blocks(body));
        }
        continue;
      }
      if (para.length === 0 && HR.test(line)) {
        seen('trennlinie');
        msg.add('trennlinie', 'format', 'verlust', 'Trennlinie (---) ausgelassen; das Mindestprofil hat kein Element dafür. Abschnitte mit Überschriften gliedern.');
        continue;
      }
      if (QUOTE.test(line)) {
        flushPara();
        const body: string[] = [];
        let j = i;
        for (; j < src.length && QUOTE.test(src[j]!); j++) body.push(src[j]!.replace(QUOTE, ''));
        i = j - 1;
        seen('zitat');
        out.push({ t: 'quote', blocks: blocks(body) });
        continue;
      }
      if (HTML_BLOCK.test(line) && para.length === 0) {
        const body: string[] = [];
        let j = i;
        for (; j < src.length && !BLANK.test(src[j]!); j++) body.push(src[j]!);
        i = j - 1;
        const all = body.join('\n');
        if (/^\s*<!--[\s\S]*-->\s*$/.test(all)) {
          seen('kommentar');
          msg.add('html-kommentar', 'kommentar', 'hinweis', 'HTML-Kommentar (Notiz des Autors) nicht übernommen.');
          continue;
        }
        seen('html-block');
        msg.add('html-block', 'format', 'verlust', `HTML-Block nicht übernommen, nur sein Text (${all.slice(0, 50).replace(/\s+/g, ' ')}…); HTML kann Skripte enthalten (HP-INH-012).`);
        const t = all.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (t) out.push({ t: 'p', c: [text(t)] });
        continue;
      }
      const item = ITEM.exec(line);
      if (item && !HR.test(line) && (para.length === 0 || isBlockStart(line, true))) {
        flushPara();
        const ordered = /\d/.test(item[2]!);
        const kind = ordered ? item[2]!.slice(-1) : item[2]!;
        const items: Block[][] = [];
        const start = ordered ? Number.parseInt(item[2]!, 10) : undefined;
        let j = i;
        while (j < src.length) {
          const m = ITEM.exec(src[j]!);
          if (!m || HR.test(src[j]!)) break;
          const mo = /\d/.test(m[2]!);
          if (mo !== ordered || (mo ? m[2]!.slice(-1) : m[2]!) !== kind) break;
          const spaces = m[3]!.length;
          const contentIndent = m[1]!.length + m[2]!.length + (m[4] === '' ? 1 : spaces > 4 ? 1 : spaces);
          const body = [m[4] === '' ? '' : ' '.repeat(spaces > 4 ? spaces - 1 : 0) + m[4]!];
          j++;
          let lastBlank = false;
          for (; j < src.length; j++) {
            const l = src[j]!;
            if (BLANK.test(l)) {
              body.push('');
              lastBlank = true;
              continue;
            }
            if (indentOf(l) >= contentIndent) {
              body.push(l.slice(contentIndent));
              lastBlank = false;
              continue;
            }
            if (lastBlank || isBlockStart(l, true) || ITEM.test(l)) break;
            body.push(l.trimStart());
          }
          while (body.length > 0 && body[body.length - 1] === '') body.pop();
          items.push(blocks(body));
          // Blank lines between items keep the list open; anything else after a blank line closes it.
          let k = j;
          while (k < src.length && BLANK.test(src[k]!)) k++;
          if (k > j && !(k < src.length && ITEM.test(src[k]!) && indentOf(src[k]!) < contentIndent)) {
            j = k;
            break;
          }
          j = k;
        }
        i = j - 1;
        seen(ordered ? 'liste-nummeriert' : 'liste');
        out.push({ t: 'list', ordered, ...(ordered && start !== undefined ? { start } : {}), items });
        continue;
      }
      if (line.includes('|') && para.length === 0 && i + 1 < src.length && DELIM_ROW.test(src[i + 1]!) && src[i + 1]!.includes('-')) {
        const header = splitRow(line);
        const width = header.length;
        const rows: string[][] = [];
        let j = i + 2;
        for (; j < src.length && !BLANK.test(src[j]!) && src[j]!.includes('|'); j++) {
          const r = splitRow(src[j]!);
          if (r.length > width) msg.add('tabelle-zelle-zuviel', 'tabelle', 'verlust', `Tabellenzeile mit ${r.length} statt ${width} Zellen; überzählige Zellen ausgelassen (GFM).`);
          rows.push(r.slice(0, width));
        }
        // Caption line after the table (Pandoc: `Table: …` or `: …`), optionally after one blank line.
        let caption: Inline[] | undefined;
        let marks: string[] | undefined;
        let k = j;
        while (k < src.length && BLANK.test(src[k]!) && k < j + 2) k++;
        const cap = k < src.length ? CAPTION.exec(src[k]!) : null;
        if (cap) {
          let ct = cap[1]!;
          const am = ATTRS.exec(ct);
          if (am) {
            const a = parseAttrs(am[1]!);
            if (a.id) marks = [a.id];
            ct = ct.slice(0, am.index);
          }
          caption = inlines(ct.trim(), { figures: [] });
          j = k + 1;
        }
        i = j - 1;
        const cell = (t: string): Cell => {
          const pending: Pending = { figures: [] };
          const c = inlines(t, pending);
          if (pending.figures.length > 0) msg.add('bild-in-tabelle', 'bild', 'verlust', 'Bild in einer Tabellenzelle ausgelassen (Markdown-Tabellen tragen nur Text).');
          return { c: c.length > 0 ? [{ t: 'p', c }] : [] };
        };
        seen('tabelle');
        seen('tabelle-zelle', width * (rows.length + 1));
        out.push({
          t: 'table',
          head: [header.map(cell)],
          body: rows.map((r) => [...r.map(cell), ...Array.from({ length: width - r.length }, () => ({ c: [] }))]),
          ...(caption ? { caption } : {}),
          ...(marks ? { marks } : {}),
        });
        continue;
      }
      if (para.length === 0 && /^ {4,}\S/.test(line)) {
        const body: string[] = [];
        let j = i;
        for (; j < src.length && (/^ {4,}/.test(src[j]!) || BLANK.test(src[j]!)); j++) body.push(src[j]!.slice(4));
        while (body.length > 0 && body[body.length - 1]!.trim() === '') body.pop();
        i = j - 1;
        seen('code');
        out.push({ t: 'pre', text: body.join('\n') });
        continue;
      }
      if (para.length > 0 && isBlockStart(line, true)) {
        flushPara();
        i--;
        continue;
      }
      para.push(line.replace(/^ {0,3}/, ''));
    }
    flushPara();
    return out;
  }

  let body = blocks(lines);
  for (const label of noteDefs.keys()) if (!usedNotes.has(label)) msg.add('fussnote-unbenutzt', 'fussnote', 'verlust', `Fußnote [^${label}] wird nirgends verwendet; ausgelassen.`);

  // Heading levels: one `#` at the start is the title; otherwise `#` are sections (shifted by one).
  const h1 = body.filter((b) => b.t === 'heading' && b.level === 1).length;
  if (h1 > 1 || (h1 === 1 && !(body[0]?.t === 'heading' && body[0].level === 1))) {
    msg.add('ebenen-verschoben', 'abschnitt', 'hinweis', `${h1} Überschriften der Ebene 1: der Titel kommt aus dem Kopf (titel), alle Überschriften rücken eine Ebene tiefer.`);
    const shift = (list: readonly Block[]): Block[] =>
      list.map((b) =>
        b.t === 'heading'
          ? { ...b, level: Math.min(6, b.level + 1) }
          : b.t === 'details' || b.t === 'summary' || b.t === 'quote'
            ? { ...b, blocks: shift(b.blocks) }
            : b,
      );
    body = shift(body);
  }
  for (const b of body) if (b.t === 'heading' && b.level > 6) msg.add('ebene-zu-tief', 'abschnitt', 'ersatz', 'Überschrift tiefer als Ebene 6 als h6 übernommen.');

  const str = (k: string): string | undefined => {
    const v = front[k];
    return typeof v === 'string' && v.trim() ? v.trim() : Array.isArray(v) && v.length > 0 ? v.join(', ') : undefined;
  };
  let modified: string | undefined;
  for (const k of ['geaendert', 'datum']) {
    const v = str(k);
    if (!v) continue;
    const d = normalizeDate(v);
    if (d) {
      modified = d;
      break;
    }
    msg.add('datum-unlesbar', 'metadaten', 'hinweis', `Datum „${v}“ im Kopf nicht lesbar (erwartet JJJJ-MM-TT).`);
  }
  const creators = Array.isArray(front.autoren) ? front.autoren : typeof front.autoren === 'string' ? front.autoren.split(/\s*;\s*/).filter(Boolean) : [];
  const fields: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(front)) fields[k] = v;
  const meta: SourceMeta = {
    ...(str('titel') ? { title: str('titel')! } : {}),
    ...(str('sprache') ? { language: str('sprache')! } : {}),
    ...(modified ? { modified } : {}),
    ...(str('kennung') ? { id: str('kennung')! } : {}),
    ...(creators.length > 0 ? { creators } : {}),
    ...(str('beschreibung') ? { description: str('beschreibung')! } : {}),
    fields,
  };
  if (!meta.title && body[0]?.t === 'heading' && body[0].level === 1) seen('titel');
  return {
    meta,
    blocks: body,
    messages: msg.all,
    inventory: inv,
    format: { name: 'md', mediaType: 'text/markdown', tool: MARKDOWN_TOOL },
  };
}

/** Plain text of a block list (tests, measurements). */
export function blocksText(list: readonly Block[]): string {
  return list
    .map((b) => {
      switch (b.t) {
        case 'heading':
        case 'p':
          return plain(b.c);
        case 'pre':
          return b.text;
        case 'gap':
          return b.text;
        case 'list':
          return b.items.map(blocksText).join(' ');
        case 'quote':
        case 'summary':
        case 'details':
          return blocksText(b.blocks);
        case 'table':
          return [...b.head, ...b.body].map((r) => r.map((c) => blocksText(c.c)).join(' ')).join(' ');
        case 'figure':
          return b.caption ? plain(b.caption) : '';
      }
    })
    .join(' ');
}
