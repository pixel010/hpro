/**
 * Redaction and sealing reach into the history journal (HP-LOCK-007 names the "Verlauf";
 * proposal HPC-0008): content that must vanish from the file must vanish from every earlier
 * version that the journal can rebuild, otherwise one `checkoutVersion` would bring it back.
 *
 * Earlier versions are rebuilt, the same removal is applied to each of them (an address is
 * emptied in every version where its id exists — ids are stable, HP-ADR-004 — and every needle
 * is replaced in text, markup, JSON and metadata; binary files with a hit are dropped), and the
 * journal is written anew from these versions. The rebuilt earlier versions are then no longer
 * byte-identical to what was saved; `listVersions` reports them as "redacted".
 */
import { fromUtf8, utf8 } from '../bytes.js';
import type { ReadContainer } from '../container.js';
import { installJournal, journalOf, reconstructAll, type Snapshot } from '../edit/journal.js';
import { placeholder, pattern, redactJson, redactMarkup, REDACTED_TEXT } from './redact.js';
import { fragmentsOf } from './seal.js';
import { searchEntries } from './search.js';
import { splitTarget } from './access.js';
import { byId, parseXml, serializeXml, XHTML_NS, XHTML_TYPE } from './xml.js';

type Json = Record<string, unknown>;
const TEXT_TYPES = /^(text\/|application\/(json|jose\+json|ld\+json|xml|xhtml\+xml|oebps-package\+xml|javascript|ecmascript)|image\/svg\+xml)/;
export const SEALED_TEXT = '[versiegelt]';

/** Text of the given addresses in every earlier version (fragments of at least `minFragment` characters). */
export async function historyNeedles(c: ReadContainer, targets: readonly string[], minFragment: number): Promise<string[]> {
  if (!journalOf(c) || targets.length === 0) return [];
  const { snapshots } = await reconstructAll(c);
  const out = new Set<string>();
  for (const s of snapshots.slice(1)) {
    for (const t of targets) {
      const { path, id } = splitTarget(t);
      const data = s.files.get(path);
      if (!data || !id) continue;
      const el = byId(parseXml(fromUtf8(data), path), id);
      if (el) for (const f of fragmentsOf(el, minFragment)) out.add(f);
    }
  }
  return [...out];
}

export interface ScrubOptions {
  readonly targets: readonly string[];
  readonly needles: readonly string[];
  readonly minFragment: number;
  /** `seal`: the earlier versions show "[versiegelt]" instead of the redaction placeholder. */
  readonly mode?: 'redact' | 'seal';
}

function scrubSnapshot(s: Snapshot, options: ScrubOptions, re: RegExp | null): Snapshot {
  const seal = options.mode === 'seal';
  const replacement = seal ? SEALED_TEXT : REDACTED_TEXT;
  const manifest = JSON.parse(s.manifest) as Json;
  const types = new Map((Array.isArray(manifest.resources) ? (manifest.resources as Array<{ url: string; type: string }>) : []).map((r) => [r.url, r.type]));
  const files = new Map<string, Uint8Array>();
  for (const [p, data] of s.files) {
    const type = types.get(p) ?? (p.endsWith('.opf') ? 'application/oebps-package+xml' : 'application/octet-stream');
    if (type === XHTML_TYPE || type === 'image/svg+xml') {
      const text = fromUtf8(data);
      const doc = parseXml(text, p, type);
      for (const t of options.targets) {
        const { path, id } = splitTarget(t);
        if (path !== p || !id) continue;
        const el = byId(doc, id);
        if (!el) continue;
        while (el.firstChild) el.removeChild(el.firstChild);
        if (seal) {
          const n = doc.createElementNS(XHTML_NS, 'p');
          n.appendChild(doc.createTextNode(SEALED_TEXT));
          el.appendChild(n);
        } else el.appendChild(placeholder(doc));
      }
      if (re) redactMarkup(doc, p, re, type === 'image/svg+xml', replacement);
      files.set(p, utf8(serializeXml(doc, text)));
      continue;
    }
    if (!re) {
      files.set(p, data);
      continue;
    }
    if (type === 'application/json' || type === 'application/ld+json' || p.endsWith('.json')) {
      const counter = { n: 0 };
      const value = redactJson(JSON.parse(fromUtf8(data)), re, counter, replacement);
      files.set(p, counter.n > 0 ? utf8(JSON.stringify(value, null, 2) + '\n') : data);
      continue;
    }
    if (TEXT_TYPES.test(type)) {
      re.lastIndex = 0;
      files.set(p, utf8(fromUtf8(data).replace(re, replacement)));
      continue;
    }
    if (searchEntries(new Map([[p, data]]), options.needles).length > 0) continue; // binary with a hit: dropped
    files.set(p, data);
  }
  let manifestText = s.manifest;
  if (re) {
    const counter = { n: 0 };
    const value = redactJson(manifest, re, counter, replacement);
    if (counter.n > 0) manifestText = JSON.stringify(value, null, 2) + '\n';
  }
  return { version: s.version, files, manifest: manifestText };
}

/**
 * `after` is the container written by the redaction (or sealing) of `before`. Returns `after` with
 * a journal rebuilt from the scrubbed earlier versions of `before` (unchanged if there is none).
 */
export async function scrubHistory(before: ReadContainer, after: Uint8Array, options: ScrubOptions): Promise<Uint8Array> {
  if (!journalOf(before)) return after;
  const { snapshots } = await reconstructAll(before);
  const re = pattern(options.needles);
  const scrubbed = snapshots.map((s) => scrubSnapshot(s, options, re));
  return installJournal(after, scrubbed, [], true);
}
