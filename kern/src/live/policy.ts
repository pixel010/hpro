/**
 * Rules for running live content (part 0, section 8; part 1, section 9.3), independent of any
 * user interface, so that every reading system built on the core enforces the same decisions:
 *
 * - `planComponents`: which declared components may run. A component runs only in a version with
 *   profile `interactive` (HPL-SBX-012), only with a valid manifest entry (HP-SBX-001) and only
 *   when the SHA-256 of its script equals `integrity` (HP-SBX-010); otherwise the static
 *   equivalent stays and the decision names the reason (HP-SBX-011).
 * - `frameCsp`: the Content Security Policy of the document frame (HP-SBX-006, HPL-SBX-002): no
 *   network source at all, scripts only by hash.
 * - `SANDBOX_TOKENS` / `checkSandbox`: the `sandbox` attribute of the document frame (HP-SBX-005).
 *
 * Components are delivered as inline scripts whose text is exactly the verified file (line ends
 * normalised to LF as the HTML parser would do), so the CSP hash and the integrity check refer to
 * the same code; nothing is fetched at run time (no `src`, no loading, HP-SBX-002).
 */
import { fromUtf8 } from '../bytes.js';
import { sriSha256 } from '../hash.js';

/** The only token the document frame may carry (HP-SBX-005). */
export const SANDBOX_TOKENS: readonly string[] = ['allow-scripts'];

/** Tokens HPL-SBX-001 names explicitly; each opens a way out of the sandbox. */
export const FORBIDDEN_SANDBOX_TOKENS: readonly string[] = [
  'allow-same-origin', 'allow-top-navigation', 'allow-top-navigation-by-user-activation', 'allow-top-navigation-to-custom-protocols',
  'allow-popups', 'allow-popups-to-escape-sandbox', 'allow-modals', 'allow-forms', 'allow-downloads', 'allow-pointer-lock',
  'allow-presentation', 'allow-orientation-lock', 'allow-storage-access-by-user-activation',
];

/** Problems of a `sandbox` attribute value; empty when it is allowed (absent attribute = not sandboxed). */
export function checkSandbox(value: string | null): string[] {
  if (value === null) return ['Attribut sandbox fehlt'];
  const tokens = value.split(/\s+/).filter(Boolean);
  return tokens.filter((t) => !SANDBOX_TOKENS.includes(t)).map((t) => `Token ${t} ist nicht erlaubt`);
}

export interface CspOptions {
  /** CSP hash sources (`sha256-…`) of every script allowed to run in the frame. */
  readonly scriptHashes: readonly string[];
}

/**
 * Content Security Policy of the document frame. Container resources reach the frame as `data:`
 * URLs and inline styles (the "container source" of HP-SBX-006); there is no network source in
 * any directive, nested frames, workers and form targets are blocked.
 */
export function frameCsp(options: CspOptions): string {
  const scripts = options.scriptHashes.length > 0 ? options.scriptHashes.map((h) => `'${h}'`).join(' ') : "'none'";
  return [
    "default-src 'none'",
    `script-src ${scripts}`,
    "style-src 'unsafe-inline'",
    'img-src data:',
    'media-src data:',
    'font-src data:',
    "connect-src 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
  ].join('; ');
}

export type ComponentState = 'run' | 'modified' | 'missing' | 'invalid' | 'not-inlinable' | 'not-interactive' | 'disabled' | 'stopped';

export interface ComponentDecision {
  readonly name: string;
  readonly version: string;
  readonly url: string;
  readonly state: ComponentState;
  /** German text for the reader's label and info dialog. */
  readonly reason: string;
  /** Script text to insert (state `run` only). */
  readonly script?: string;
  /** CSP hash source of `script` (state `run` only). */
  readonly cspHash?: string;
}

export interface ComponentPlan {
  /** Whether this version may run scripts at all (profile `interactive`, not frozen). */
  readonly live: boolean;
  readonly decisions: readonly ComponentDecision[];
}

export interface PlanOptions {
  /** True for a frozen rendition (HP-PROF-007): never any script. */
  readonly frozen?: boolean;
  /** False when the user switched live content off: static equivalents only. */
  readonly enabled?: boolean;
  /**
   * Set when the reading system stopped the components of this document, e.g. because one
   * left the document frame (HPL-SBX-009, "Komponente beendet"); the text is the reason.
   */
  readonly stopped?: string;
}

const NAME = /^(hp|x-[a-z0-9]+)-[a-z0-9-]+$/;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const SRI = /^sha256-[A-Za-z0-9+/]{43}=$/;
/** Sequences that would end or confuse an inline script in the HTML parser. */
const UNSAFE_INLINE = /<\/script|<!--|<script/i;

function profileOf(manifest: Record<string, unknown>): string {
  return typeof manifest['conformsTo'] === 'string' ? (manifest['conformsTo'].split('/').pop() ?? '') : '';
}

/** Decides for every entry of `manifest.json#components` whether it runs (see module comment). */
export async function planComponents(manifest: Record<string, unknown>, files: ReadonlyMap<string, Uint8Array>, options: PlanOptions = {}): Promise<ComponentPlan> {
  const profile = profileOf(manifest);
  const live = profile === 'interactive' && options.frozen !== true;
  const entries = Array.isArray(manifest['components']) ? (manifest['components'] as unknown[]) : [];
  const decisions: ComponentDecision[] = [];
  for (const raw of entries) {
    const e = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const name = typeof e['name'] === 'string' ? e['name'] : '?';
    const version = typeof e['version'] === 'string' ? e['version'] : '?';
    const url = typeof e['url'] === 'string' ? e['url'] : '';
    const integrity = typeof e['integrity'] === 'string' ? e['integrity'] : '';
    const decide = (state: ComponentState, reason: string, extra: { script?: string; cspHash?: string } = {}) => decisions.push({ name, version, url, state, reason, ...extra });
    if (!live) {
      decide('not-interactive', options.frozen ? 'eingefrorene Fassung: es wird kein Skript ausgeführt' : `Profil ${profile || 'unbekannt'}: es wird kein Skript ausgeführt`);
      continue;
    }
    if (!NAME.test(name) || !SEMVER.test(version) || !url.startsWith(`components/${name}@${version}/`) || !SRI.test(integrity)) {
      decide('invalid', 'Manifesteintrag unvollständig oder ungültig (Name, Version, Pfad oder integrity)');
      continue;
    }
    if (options.stopped !== undefined) {
      decide('stopped', `Komponente beendet: ${options.stopped}`);
      continue;
    }
    if (options.enabled === false) {
      decide('disabled', 'lebendige Inhalte sind im Reader abgeschaltet');
      continue;
    }
    const bytes = files.get(url);
    if (!bytes) {
      decide('missing', `Skriptdatei ${url} fehlt im Container`);
      continue;
    }
    if ((await sriSha256(bytes)) !== integrity) {
      decide('modified', 'Komponente verändert: SHA-256 der Skriptdatei weicht von integrity ab');
      continue;
    }
    let text: string;
    try {
      text = fromUtf8(bytes);
    } catch {
      decide('not-inlinable', 'Skriptdatei ist kein gültiges UTF-8');
      continue;
    }
    const script = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    if (UNSAFE_INLINE.test(script)) {
      decide('not-inlinable', 'Skript enthält „</script“, „<script“ oder „<!--“ und wird nicht eingebettet');
      continue;
    }
    decide('run', 'geprüft (SHA-256 wie im Manifest) und ausgeführt', { script, cspHash: await sriSha256(new TextEncoder().encode(script)) });
  }
  return { live, decisions };
}
