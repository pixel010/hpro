/**
 * Annotations as W3C Web Annotations (JSON-LD), stored one per file under `annotations/`
 * (HP-RS-011; package P7, change request HPC-0010).
 *
 * Kinds, all of them `Annotation` with `@context` `http://www.w3.org/ns/anno.jsonld`:
 *   comment    motivation `commenting`, `TextualBody`, target = address (`path#id`) with an
 *              optional `TextQuoteSelector` + `TextPositionSelector` for a text passage
 *   highlight  motivation `highlighting`, target with quote and `styleClass` `hp-<colour>`,
 *              optionally a `TextualBody` (a note on the highlight); the `stylesheet` of the
 *              annotation defines the classes for other clients
 *   ink        freehand: motivation `highlighting` (or `commenting` with a body), target with an
 *              `SvgSelector` whose drawing lies in the box of the addressed element, coordinates
 *              0–1000 on both axes (`viewBox="0 0 1000 1000"`, `preserveAspectRatio="none"`)
 *   reply      motivation `replying`, target = the `id` of the annotation answered (W3C 3.3.5,
 *              example 31); replies to replies are allowed, a thread is everything below a root
 *
 * Review status (open/resolved) is not part of the W3C model. It is recorded append-only: an
 * annotation (root or reply) may carry `hp:status` (`open` | `resolved`); the status of a thread
 * is the one of its latest annotation that carries one, by `created`, else `open`. "Erledigt"
 * therefore is a reply that says so — who and when stay visible, and nothing already written is
 * changed, which keeps signed annotation files valid and makes merging copies of reviewers a
 * union of files.
 *
 * Bodies are plain text (`format: text/plain`): no markup from a comment is ever rendered.
 */

export const ANNO_CONTEXT = 'http://www.w3.org/ns/anno.jsonld';
/** Term namespace of the extension terms (Teil 2, 5.1: `<basis>/ns/v<major>`). */
export const HP_TERMS = 'https://hpro.example/ns/v0#';
export const CONTEXT: readonly [string, { readonly hp: string }] = [ANNO_CONTEXT, { hp: HP_TERMS }];
export const ANNOTATIONS_DIR = 'annotations/';
export const ANNOTATION_MEDIA_TYPE = 'application/ld+json';
export const STATUS_KEY = 'hp:status';

export type AnnotationKind = 'comment' | 'highlight' | 'ink' | 'reply';
export type ReviewStatus = 'open' | 'resolved';

/** Colours of highlights and ink, as `styleClass` `hp-<name>`. */
export const COLORS = {
  gelb: '#fff176',
  gruen: '#a5d6a7',
  blau: '#90caf9',
  rosa: '#f48fb1',
  rot: '#d32f2f',
} as const;
export type ColorName = keyof typeof COLORS;
export const HIGHLIGHT_COLORS: readonly ColorName[] = ['gelb', 'gruen', 'blau', 'rosa'];
export const INK_COLORS: readonly ColorName[] = ['rot', 'blau'];

/** The stylesheet that defines the highlight classes (W3C 4.4, `CssStylesheet`). */
export const STYLESHEET = {
  type: 'CssStylesheet',
  value: HIGHLIGHT_COLORS.map((c) => `.hp-${c} { background-color: ${COLORS[c]}; }`).join(' '),
} as const;

export type Json = Record<string, unknown>;

export interface Agent {
  readonly type: 'Person' | 'Software';
  readonly name: string;
  readonly id?: string;
}

export interface TextualBody {
  readonly type: 'TextualBody';
  readonly value: string;
  readonly format: 'text/plain';
  readonly language?: string;
}

export interface TextQuoteSelector {
  readonly type: 'TextQuoteSelector';
  readonly exact: string;
  readonly prefix?: string;
  readonly suffix?: string;
}

export interface TextPositionSelector {
  readonly type: 'TextPositionSelector';
  readonly start: number;
  readonly end: number;
}

export interface SvgSelector {
  readonly type: 'SvgSelector';
  readonly value: string;
}

export type Selector = TextQuoteSelector | TextPositionSelector | SvgSelector;

export interface SpecificTarget {
  /** Address `path#id` relative to the container root (HP-ADR-003). */
  readonly source: string;
  readonly selector?: Selector | readonly Selector[];
  readonly styleClass?: string;
}

/** One annotation as stored (only the members this profile writes or reads are typed). */
export interface WebAnnotation {
  readonly '@context'?: unknown;
  readonly id: string;
  readonly type: 'Annotation';
  readonly motivation: string;
  readonly created: string;
  readonly modified?: string;
  readonly creator: Agent;
  readonly generator?: Agent;
  readonly body?: TextualBody;
  /** An address (string) for whole-element comments and replies (the id of the annotated annotation). */
  readonly target: string | SpecificTarget;
  readonly stylesheet?: { readonly type: 'CssStylesheet'; readonly value: string };
  readonly 'hp:status'?: ReviewStatus;
  readonly [key: string]: unknown;
}

/** Everything a client needs from an annotation, derived once. */
export interface AnnotationInfo {
  readonly id: string;
  readonly kind: AnnotationKind;
  readonly author: string;
  readonly created: string;
  readonly modified?: string;
  readonly text: string;
  /** Address of the annotated element; for replies the address of the thread root, if known. */
  readonly path?: string;
  readonly elementId?: string;
  readonly quote?: { readonly exact: string; readonly prefix: string; readonly suffix: string };
  readonly position?: { readonly start: number; readonly end: number };
  readonly color?: ColorName;
  readonly ink?: InkDrawing;
  /** Id of the annotation answered (replies). */
  readonly replyTo?: string;
  readonly status?: ReviewStatus;
}

export interface InkDrawing {
  readonly color: ColorName;
  /** Path data, coordinates 0–1000 relative to the element box. */
  readonly paths: readonly string[];
  readonly width: number;
}

export class AnnotationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnnotationError';
  }
}

const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
/** RFC 4122/9562 UUID in a URN; the file name is the UUID. */
export const ID_RE = /^urn:uuid:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const ADDRESS_RE = /^([^#\s]+)#([^\s#]+)$/;
/** Path data of ink: commands M, L, C, Q and numbers only (no arcs, no letters other than these). */
const PATH_DATA_RE = /^(?:[MLCQ](?:\s*-?\d+(?:\.\d+)?(?:[\s,]+-?\d+(?:\.\d+)?)*)\s*)+$/;
export const MAX_TEXT = 10000;
export const MAX_INK_PATHS = 200;
export const MAX_PATH_DATA = 20000;

export function isUtc(s: unknown): s is string {
  return typeof s === 'string' && UTC_RE.test(s) && !Number.isNaN(Date.parse(s));
}

/** File of an annotation: `annotations/<uuid>.jsonld`. */
export function fileOf(id: string): string {
  const m = ID_RE.exec(id);
  if (!m) throw new AnnotationError(`id must be urn:uuid:<uuid> in lower case, got ${id}`);
  return `${ANNOTATIONS_DIR}${m[1]}.jsonld`;
}

export function splitAddress(address: string): { path: string; id: string } | undefined {
  const m = ADDRESS_RE.exec(address);
  if (!m) return undefined;
  let id = m[2]!;
  try {
    id = decodeURIComponent(id);
  } catch {
    /* keep the raw fragment */
  }
  return { path: m[1]!, id };
}

/**
 * A deterministic UUID (RFC 9562 version 8, "custom") from a SHA-256 of `seed`, for producers
 * that must write reproducible files (tests, evidence). Clients use random UUIDs (version 4).
 */
export async function deterministicId(seed: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed)));
  h[6] = (h[6]! & 0x0f) | 0x80;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const hex = [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function randomId(): string {
  return `urn:uuid:${crypto.randomUUID()}`;
}

// ---------------------------------------------------------------------------------------------
// Ink

/** SVG of a freehand drawing (the value of the `SvgSelector`). */
export function inkSvg(paths: readonly string[], color: ColorName, width = 3): string {
  const p = paths.map((d) => `<path d="${d}" fill="none" stroke="${COLORS[color]}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" preserveAspectRatio="none">${p}</svg>`;
}

/**
 * Reads a drawing back. Only the exact form `inkSvg` writes is accepted — an `svg` with `path`
 * elements carrying path data of numbers and the commands M, L, C, Q, a colour of the palette and
 * a width — so that nothing else from a file ever reaches a renderer.
 */
export function parseInk(svg: string): InkDrawing {
  const m = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1000 1000" preserveAspectRatio="none">((?:<path [^<>]*\/>)*)<\/svg>$/.exec(svg);
  if (!m) throw new AnnotationError('ink: SvgSelector value is not an hpro drawing (svg with path elements, viewBox 0 0 1000 1000)');
  const paths: string[] = [];
  let color: ColorName | undefined;
  let width = 3;
  for (const pm of m[1]!.matchAll(/<path d="([^"]*)" fill="none" stroke="(#[0-9a-f]{6})" stroke-width="(\d+(?:\.\d+)?)" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"\/>/g)) {
    const d = pm[1]!;
    if (!PATH_DATA_RE.test(d) || d.length > MAX_PATH_DATA) throw new AnnotationError('ink: path data must use M, L, C, Q and numbers only');
    const c = (Object.keys(COLORS) as ColorName[]).find((k) => COLORS[k] === pm[2]);
    if (!c) throw new AnnotationError(`ink: colour ${pm[2]} is not in the palette`);
    if (color && c !== color) throw new AnnotationError('ink: all strokes of a drawing have one colour');
    color = c;
    width = Number(pm[3]);
    paths.push(d);
  }
  const count = (m[1]!.match(/<path /g) ?? []).length;
  if (count === 0 || count !== paths.length) throw new AnnotationError('ink: every path must have the attributes inkSvg writes');
  if (paths.length > MAX_INK_PATHS) throw new AnnotationError(`ink: at most ${MAX_INK_PATHS} strokes`);
  return { color: color!, paths, width };
}

/** Path data from points (0–1000), rounded to one decimal: `M x y L x y …`. */
export function pathFromPoints(points: ReadonlyArray<readonly [number, number]>): string {
  const r = (n: number) => String(Math.round(Math.min(1000, Math.max(0, n)) * 10) / 10);
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${r(x)} ${r(y)}`).join(' ');
}

// ---------------------------------------------------------------------------------------------
// Creating

export interface NewAnnotation {
  readonly kind: 'comment' | 'highlight' | 'ink';
  /** Address `path#id`. */
  readonly address: string;
  readonly quote?: { readonly exact: string; readonly prefix?: string; readonly suffix?: string; readonly start: number; readonly end: number };
  readonly text?: string;
  readonly color?: ColorName;
  readonly ink?: { readonly paths: readonly string[]; readonly color?: ColorName };
  readonly author: string;
  readonly created: string;
  readonly id?: string;
  readonly language?: string;
  readonly generator?: string;
}

export interface NewReply {
  /** Id of the annotation answered. */
  readonly to: string;
  readonly text?: string;
  readonly status?: ReviewStatus;
  readonly author: string;
  readonly created: string;
  readonly id?: string;
  readonly language?: string;
  readonly generator?: string;
}

function body(text: string | undefined, language: string | undefined): TextualBody | undefined {
  if (text === undefined || text.trim() === '') return undefined;
  return { type: 'TextualBody', value: text, format: 'text/plain', ...(language ? { language } : {}) };
}

function agents(author: string, generator: string | undefined): { creator: Agent; generator?: Agent } {
  return { creator: { type: 'Person', name: author }, ...(generator ? { generator: { type: 'Software', name: generator } } : {}) };
}

/** Builds a new comment, highlight or ink annotation; `validateAnnotation` must accept it. */
export function createAnnotation(spec: NewAnnotation): WebAnnotation {
  const id = spec.id ?? randomId();
  const selectors: Selector[] = [];
  if (spec.quote) {
    const q = spec.quote;
    selectors.push({ type: 'TextQuoteSelector', exact: q.exact, ...(q.prefix ? { prefix: q.prefix } : {}), ...(q.suffix ? { suffix: q.suffix } : {}) });
    selectors.push({ type: 'TextPositionSelector', start: q.start, end: q.end });
  }
  if (spec.kind === 'ink') {
    if (!spec.ink || spec.ink.paths.length === 0) throw new AnnotationError('ink needs at least one stroke');
    selectors.push({ type: 'SvgSelector', value: inkSvg(spec.ink.paths, spec.ink.color ?? 'rot') });
  }
  if (spec.kind === 'highlight' && !spec.quote) throw new AnnotationError('a highlight needs a text passage (quote)');
  const color = spec.kind === 'highlight' ? (spec.color ?? 'gelb') : undefined;
  const b = body(spec.text, spec.language);
  if (spec.kind === 'comment' && !b) throw new AnnotationError('a comment needs a text');
  const target: string | SpecificTarget =
    selectors.length === 0 && !color
      ? spec.address
      : { source: spec.address, ...(selectors.length > 0 ? { selector: selectors.length === 1 ? selectors[0]! : selectors } : {}), ...(color ? { styleClass: `hp-${color}` } : {}) };
  const a: WebAnnotation = {
    '@context': CONTEXT,
    id,
    type: 'Annotation',
    motivation: spec.kind === 'comment' || (spec.kind === 'ink' && b) ? 'commenting' : 'highlighting',
    created: spec.created,
    ...agents(spec.author, spec.generator),
    ...(b ? { body: b } : {}),
    target,
    ...(color ? { stylesheet: STYLESHEET } : {}),
  };
  const problems = validateAnnotation(a);
  if (problems.length > 0) throw new AnnotationError(problems.join('; '));
  return a;
}

/** Builds a reply; with `status` it also sets the review status of the thread. */
export function createReply(spec: NewReply): WebAnnotation {
  const text = spec.text ?? (spec.status === 'resolved' ? 'Als erledigt markiert.' : spec.status === 'open' ? 'Wieder geöffnet.' : undefined);
  const b = body(text, spec.language);
  if (!b) throw new AnnotationError('a reply needs a text or a status');
  const a: WebAnnotation = {
    '@context': CONTEXT,
    id: spec.id ?? randomId(),
    type: 'Annotation',
    motivation: 'replying',
    created: spec.created,
    ...agents(spec.author, spec.generator),
    body: b,
    target: spec.to,
    ...(spec.status ? { [STATUS_KEY]: spec.status } : {}),
  };
  const problems = validateAnnotation(a);
  if (problems.length > 0) throw new AnnotationError(problems.join('; '));
  return a;
}

// ---------------------------------------------------------------------------------------------
// Checking and reading

function selectorsOf(t: SpecificTarget): Selector[] {
  return t.selector === undefined ? [] : Array.isArray(t.selector) ? [...(t.selector as Selector[])] : [t.selector as Selector];
}

function contextOk(c: unknown): boolean {
  if (c === ANNO_CONTEXT) return true;
  return Array.isArray(c) && c.includes(ANNO_CONTEXT);
}

/**
 * Problems of an annotation against the W3C model (the MUSTs this profile relies on) and the
 * profile above. An empty list means it can be stored and shown.
 */
export function validateAnnotation(value: unknown): string[] {
  const p: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['annotation must be a JSON object'];
  const a = value as Json;
  if ('@context' in a && !contextOk(a['@context'])) p.push(`@context must be or contain ${ANNO_CONTEXT}`);
  if (typeof a.id !== 'string' || !ID_RE.test(a.id)) p.push('id must be urn:uuid:<uuid> (lower case)');
  if (a.type !== 'Annotation') p.push('type must be "Annotation"');
  if (typeof a.motivation !== 'string' || !['commenting', 'highlighting', 'replying'].includes(a.motivation)) p.push('motivation must be commenting, highlighting or replying');
  if (!isUtc(a.created)) p.push('created must be a UTC date-time YYYY-MM-DDThh:mm:ssZ');
  if ('modified' in a && !isUtc(a.modified)) p.push('modified must be a UTC date-time');
  const creator = a.creator as Json | undefined;
  if (!creator || typeof creator !== 'object' || (creator.type !== 'Person' && creator.type !== 'Software') || typeof creator.name !== 'string' || creator.name.trim() === '') p.push('creator must be {type: Person, name}');
  if ('bodyValue' in a) p.push('bodyValue is not used; the body is a TextualBody');
  if ('body' in a) {
    const b = a.body as Json | undefined;
    if (!b || typeof b !== 'object' || Array.isArray(b) || b.type !== 'TextualBody' || typeof b.value !== 'string' || b.format !== 'text/plain') p.push('body must be one TextualBody with format text/plain');
    else if (b.value.length > MAX_TEXT) p.push(`body is longer than ${MAX_TEXT} characters`);
  }
  if (STATUS_KEY in a && a[STATUS_KEY] !== 'open' && a[STATUS_KEY] !== 'resolved') p.push(`${STATUS_KEY} must be open or resolved`);
  const t = a.target;
  if (a.motivation === 'replying') {
    if (typeof t !== 'string' || !ID_RE.test(t)) p.push('target of a reply must be the id of an annotation');
    if (!('body' in a)) p.push('a reply needs a body');
    return p;
  }
  if (typeof t === 'string') {
    if (!splitAddress(t)) p.push('target must be an address path#id');
    if (a.motivation === 'commenting' && !('body' in a)) p.push('a comment needs a body');
    return p;
  }
  if (!t || typeof t !== 'object' || Array.isArray(t)) return [...p, 'target must be an address or one SpecificResource'];
  const st = t as Json;
  if (typeof st.source !== 'string' || !splitAddress(st.source)) p.push('target.source must be an address path#id');
  let quote = false;
  let position = false;
  let svg = false;
  for (const s of selectorsOf(st as unknown as SpecificTarget) as unknown as Json[]) {
    if (s.type === 'TextQuoteSelector') {
      quote = true;
      if (typeof s.exact !== 'string' || s.exact === '') p.push('TextQuoteSelector.exact must be a non-empty string');
      for (const k of ['prefix', 'suffix'] as const) if (k in s && typeof s[k] !== 'string') p.push(`TextQuoteSelector.${k} must be a string`);
    } else if (s.type === 'TextPositionSelector') {
      position = true;
      if (!Number.isInteger(s.start) || !Number.isInteger(s.end) || (s.start as number) < 0 || (s.end as number) < (s.start as number)) p.push('TextPositionSelector needs integers 0 <= start <= end');
    } else if (s.type === 'SvgSelector') {
      svg = true;
      try {
        parseInk(String(s.value));
      } catch (e) {
        p.push((e as Error).message);
      }
    } else p.push(`selector type ${String(s.type)} is not used by this profile`);
  }
  if (position && !quote) p.push('a TextPositionSelector needs a TextQuoteSelector next to it (the quote decides)');
  if ('styleClass' in st) {
    const c = String(st.styleClass);
    if (!HIGHLIGHT_COLORS.some((k) => `hp-${k}` === c)) p.push(`styleClass must be one of ${HIGHLIGHT_COLORS.map((k) => `hp-${k}`).join(', ')}`);
  }
  if (a.motivation === 'highlighting' && !quote && !svg) p.push('a highlight needs a TextQuoteSelector or a drawing');
  if (a.motivation === 'commenting' && !('body' in a)) p.push('a comment needs a body');
  return p;
}

/** Derived view of a valid annotation. */
export function describe(a: WebAnnotation): AnnotationInfo {
  const base = { id: a.id, author: a.creator.name, created: a.created, ...(a.modified ? { modified: a.modified } : {}), text: a.body?.value ?? '', ...(a[STATUS_KEY] ? { status: a[STATUS_KEY] } : {}) };
  if (a.motivation === 'replying') return { ...base, kind: 'reply', replyTo: a.target as string };
  const t: SpecificTarget = typeof a.target === 'string' ? { source: a.target } : a.target;
  const addr = splitAddress(t.source)!;
  const sels = selectorsOf(t);
  const q = sels.find((s): s is TextQuoteSelector => s.type === 'TextQuoteSelector');
  const pos = sels.find((s): s is TextPositionSelector => s.type === 'TextPositionSelector');
  const svg = sels.find((s): s is SvgSelector => s.type === 'SvgSelector');
  const color = t.styleClass ? (t.styleClass.slice(3) as ColorName) : undefined;
  const kind: AnnotationKind = svg ? 'ink' : a.motivation === 'highlighting' ? 'highlight' : 'comment';
  return {
    ...base,
    kind,
    path: addr.path,
    elementId: addr.id,
    ...(q ? { quote: { exact: q.exact, prefix: q.prefix ?? '', suffix: q.suffix ?? '' } } : {}),
    ...(pos ? { position: { start: pos.start, end: pos.end } } : {}),
    ...(color ? { color } : {}),
    ...(svg ? { ink: parseInk(svg.value) } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Threads

export interface Thread {
  readonly root: AnnotationInfo;
  /** All answers below the root (also answers to answers), by `created`, then id. */
  readonly replies: readonly AnnotationInfo[];
  readonly status: ReviewStatus;
  /** Who set the status last and when (absent: never set, i.e. open since creation). */
  readonly statusBy?: string;
  readonly statusAt?: string;
}

const byTime = (a: AnnotationInfo, b: AnnotationInfo) => (a.created < b.created ? -1 : a.created > b.created ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Groups annotations into threads. A reply whose target is missing (an orphan, e.g. after the
 * root was deleted in another copy) is reported in `orphans` and not shown as a thread.
 */
export function threadsOf(list: readonly AnnotationInfo[]): { threads: Thread[]; orphans: AnnotationInfo[] } {
  const byId = new Map(list.map((a) => [a.id, a]));
  const rootOf = (a: AnnotationInfo): AnnotationInfo | undefined => {
    const seen = new Set<string>();
    let cur: AnnotationInfo | undefined = a;
    while (cur && cur.kind === 'reply') {
      if (seen.has(cur.id)) return undefined; // a cycle cannot be a thread
      seen.add(cur.id);
      cur = byId.get(cur.replyTo!);
    }
    return cur;
  };
  const replies = new Map<string, AnnotationInfo[]>();
  const orphans: AnnotationInfo[] = [];
  for (const a of list) {
    if (a.kind !== 'reply') continue;
    const r = rootOf(a);
    if (!r) orphans.push(a);
    else (replies.get(r.id) ?? replies.set(r.id, []).get(r.id)!).push(a);
  }
  const threads: Thread[] = [];
  for (const root of list.filter((a) => a.kind !== 'reply').sort(byTime)) {
    const rs = (replies.get(root.id) ?? []).sort(byTime);
    const last = [root, ...rs].filter((x) => x.status !== undefined).sort(byTime).pop();
    threads.push({ root, replies: rs, status: last?.status ?? 'open', ...(last ? { statusBy: last.author, statusAt: last.created } : {}) });
  }
  return { threads, orphans: orphans.sort(byTime) };
}

export const KIND_LABEL: Readonly<Record<AnnotationKind, string>> = { comment: 'Kommentar', highlight: 'Hervorhebung', ink: 'Freihand', reply: 'Antwort' };
export const STATUS_LABEL: Readonly<Record<ReviewStatus, string>> = { open: 'offen', resolved: 'erledigt' };
