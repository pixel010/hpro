/**
 * Document data channel (part 1, section 8; HP-SBX-008, HPL-SBX-008): the only way for a
 * component to read or keep state. The reading system passes every message from the document
 * frame to `handle` and sends the answers back; this class enforces the rules of section 8.3:
 *
 *   1. `path` matches `^data/[A-Za-z0-9_][A-Za-z0-9_.-]*\.json$` (else `path-invalid`) and is
 *      listed in `manifest.json#data` (else `path-not-declared`); nothing outside `data/` is ever
 *      written;
 *   2. with a schema, `value` must be valid against it (`schema-invalid`, first deviation);
 *      `$ref` out of the container is not resolved;
 *   3. at most 1 MiB serialised (`too-large`);
 *   4. read-only versions answer `state.set` with `read-only`;
 *   5. a successful `state.set` is a document change (`changes()` for saving, see save.ts);
 *   6. after it, `state.changed` goes to every subscriber of the path including the sender;
 *   7. at most 100 messages per second (`rate-limited`);
 *   8. only the listed error codes.
 *
 * Messages must be JSON-like (objects, arrays, strings, finite numbers, booleans, null);
 * anything else is `bad-request`. Unknown `hp` values get `unknown-message`.
 */
import { fromUtf8, utf8 } from '../bytes.js';
import { inlineRelativeRefs, schemaProblems, validateInstance } from '../check/jsonschema.js';

export const DATA_PATH = /^data\/[A-Za-z0-9_][A-Za-z0-9_.-]*\.json$/;
export const MAX_VALUE_BYTES = 1024 * 1024;
export const MAX_MESSAGES_PER_SECOND = 100;
export const CHANNEL_SPEC = '0.1';

export type ChannelErrorCode = 'bad-request' | 'unknown-message' | 'path-invalid' | 'path-not-declared' | 'schema-invalid' | 'too-large' | 'read-only' | 'rate-limited';

export interface ChannelMessage {
  readonly hp: string;
  readonly [key: string]: unknown;
}

/** What the reading system sends: `reply` to the sender, `broadcast` to the frame (all components). */
export interface ChannelOutput {
  readonly reply?: ChannelMessage;
  readonly broadcast: readonly ChannelMessage[];
}

export interface ChannelOptions {
  /** `manifest.json` of the shown version. */
  readonly manifest: Record<string, unknown>;
  readonly files: ReadonlyMap<string, Uint8Array>;
  /** Frozen rendition, signed main version or `read-only` access rule (8.3 rule 4). */
  readonly readOnly: boolean;
  readonly reducedMotion: boolean;
  /** Clock in milliseconds, for the rate limit; default `Date.now`. */
  readonly now?: () => number;
}

const MESSAGES: Record<ChannelErrorCode, string> = {
  'bad-request': 'Nachricht ist kein JSON-fähiges Objekt oder Felder fehlen',
  'unknown-message': 'unbekannte Nachricht',
  'path-invalid': 'Pfad entspricht nicht data/<name>.json',
  'path-not-declared': 'Pfad ist nicht in manifest.json#data verzeichnet',
  'schema-invalid': 'Wert ist gegen das Schema ungültig',
  'too-large': 'Wert ist größer als 1 MiB',
  'read-only': 'diese Fassung ist schreibgeschützt',
  'rate-limited': 'mehr als 100 Nachrichten je Sekunde',
};

/** True for values that survive JSON unchanged (8.1). */
export function isJsonLike(value: unknown, depth = 0): boolean {
  if (depth > 256) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((v) => isJsonLike(v, depth + 1));
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value) as unknown;
    if (proto !== Object.prototype && proto !== null) return false;
    return Object.values(value as Record<string, unknown>).every((v) => isJsonLike(v, depth + 1));
  }
  return false;
}

interface DataEntry {
  readonly url: string;
  readonly schema?: unknown;
  /** Set when the schema cannot be used; every `state.set` is then `schema-invalid`. */
  readonly schemaError?: string;
}

export class DataChannel {
  private readonly entries = new Map<string, DataEntry>();
  private readonly values = new Map<string, unknown>();
  private readonly changed = new Set<string>();
  private readonly subscribed = new Set<string>();
  private readonly times: number[] = [];
  private readonly now: () => number;

  constructor(private readonly options: ChannelOptions) {
    this.now = options.now ?? (() => Date.now());
    const list = Array.isArray(options.manifest['data']) ? (options.manifest['data'] as unknown[]) : [];
    for (const raw of list) {
      const d = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
      if (typeof d['url'] !== 'string' || !DATA_PATH.test(d['url'])) continue;
      const url = d['url'];
      const schemaPath = typeof d['schema'] === 'string' ? d['schema'] : undefined;
      this.entries.set(url, schemaPath === undefined ? { url } : this.loadSchema(url, schemaPath));
      const bytes = options.files.get(url);
      if (bytes) {
        try {
          this.values.set(url, JSON.parse(fromUtf8(bytes)) as unknown);
        } catch {
          /* unreadable data file: state.get answers null */
        }
      }
    }
  }

  private loadJson(path: string): { ok: true; value: unknown } | { ok: false; grund: string } {
    const bytes = this.options.files.get(path);
    if (!bytes) return { ok: false, grund: `${path} fehlt im Container` };
    try {
      return { ok: true, value: JSON.parse(fromUtf8(bytes)) as unknown };
    } catch {
      return { ok: false, grund: `${path} ist kein JSON` };
    }
  }

  private loadSchema(url: string, schemaPath: string): DataEntry {
    const loaded = this.loadJson(schemaPath);
    if (!loaded.ok) return { url, schemaError: loaded.grund };
    const problems = schemaProblems(loaded.value);
    if (problems.length > 0) return { url, schemaError: `${schemaPath}${problems[0]!.path.slice(1)}: ${problems[0]!.message}` };
    const inlined = inlineRelativeRefs(loaded.value, schemaPath, (p) => this.loadJson(p));
    if (!inlined.ok) return { url, schemaError: inlined.grund };
    return { url, schema: inlined.value };
  }

  /** The `ready` message (8.2), sent once after the frame has loaded. */
  ready(): ChannelMessage {
    return { hp: 'ready', spec: CHANNEL_SPEC, readOnly: this.options.readOnly, reducedMotion: this.options.reducedMotion, data: [...this.entries.keys()] };
  }

  /** Data files changed by `state.set`, serialised as they will be stored (two-space JSON, final newline). */
  changes(): Map<string, Uint8Array> {
    return new Map([...this.changed].map((p) => [p, utf8(JSON.stringify(this.values.get(p), null, 2) + '\n')]));
  }

  get dirty(): boolean {
    return this.changed.size > 0;
  }

  /** Answers one message from the document frame. */
  handle(message: unknown): ChannelOutput {
    const t = this.now();
    while (this.times.length > 0 && t - this.times[0]! >= 1000) this.times.shift();
    const id = typeof message === 'object' && message !== null && typeof (message as Record<string, unknown>)['id'] === 'string' ? ((message as Record<string, unknown>)['id'] as string) : null;
    const fail = (code: ChannelErrorCode, detail?: string): ChannelOutput => ({
      reply: { hp: 'state.result', id, ok: false, error: { code, message: detail ? `${MESSAGES[code]}: ${detail}` : MESSAGES[code] } },
      broadcast: [],
    });
    if (this.times.length >= MAX_MESSAGES_PER_SECOND) return fail('rate-limited');
    this.times.push(t);
    if (typeof message !== 'object' || message === null || Array.isArray(message) || !isJsonLike(message)) return fail('bad-request');
    const m = message as Record<string, unknown>;
    const hp = m['hp'];
    if (hp !== 'state.get' && hp !== 'state.set' && hp !== 'state.subscribe') return fail('unknown-message', typeof hp === 'string' ? hp : undefined);
    if (id === null || typeof m['path'] !== 'string') return fail('bad-request', 'id und path müssen Strings sein');
    const path = m['path'];
    if (!DATA_PATH.test(path)) return fail('path-invalid', path);
    const entry = this.entries.get(path);
    if (!entry) return fail('path-not-declared', path);
    const ok = (extra: Record<string, unknown> = {}): ChannelMessage => ({ hp: 'state.result', id, ok: true, ...extra });
    if (hp === 'state.get') return { reply: ok({ value: this.values.has(path) ? this.values.get(path) : null }), broadcast: [] };
    if (hp === 'state.subscribe') {
      this.subscribed.add(path);
      return { reply: ok(), broadcast: [] };
    }
    if (!('value' in m)) return fail('bad-request', 'value fehlt');
    if (this.options.readOnly) return fail('read-only');
    const serialized = JSON.stringify(m['value']);
    if (utf8(serialized).length > MAX_VALUE_BYTES) return fail('too-large');
    if (entry.schemaError) return fail('schema-invalid', entry.schemaError);
    if (entry.schema !== undefined) {
      const problems = validateInstance(m['value'], entry.schema as boolean | Record<string, unknown>);
      if (problems.length > 0) return fail('schema-invalid', `${problems[0]!.path}: ${problems[0]!.message}`);
    }
    const value = JSON.parse(serialized) as unknown;
    this.values.set(path, value);
    this.changed.add(path);
    const broadcast: ChannelMessage[] = this.subscribed.has(path) ? [{ hp: 'state.changed', path, value, origin: 'component' }] : [];
    return { reply: ok(), broadcast };
  }
}
