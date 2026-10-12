/**
 * Minimal editor operation on the main version: replace the text of one element. It is the
 * enforcement point of HP-LOCK-002 in the core — a structured editor (package P5) builds on it:
 *   - `read-only` on the element, an ancestor or the file → refused with the lock named,
 *   - a sealed section or a frozen version → refused,
 *   - otherwise: new text (as text, never markup), hash, package.opf, `dateModified`, `history`.
 */
import { fromUtf8, utf8 } from '../bytes.js';
import { readContainer } from '../container.js';
import { sriSha256 } from '../hash.js';
import { assertEditable, LockError, parseAccess, splitTarget } from './access.js';
import { writeChangedContainer } from './seal.js';
import { ancestorIds, byId, parseXml, serializeXml, XHTML_TYPE } from './xml.js';

type Json = Record<string, unknown>;

export interface EditTextOptions {
  /** Address `path#id` of the element whose text is replaced. */
  readonly target: string;
  readonly text: string;
  readonly modified: string;
  readonly note?: string;
  /** Also replace inline markup (links, emphasis) inside the element; default false: refused. */
  readonly replaceMarkup?: boolean;
}

export async function editText(bytes: Uint8Array, options: EditTextOptions): Promise<Uint8Array> {
  const c = await readContainer(bytes);
  const { path, id } = splitTarget(options.target);
  if (!id) throw new LockError('invalid', 'target must be path#id');
  if (path.startsWith('renditions/')) throw new LockError('read-only', 'eine eingefrorene Fassung wird nicht bearbeitet (Teil 1, 7.2: das wäre eine Manipulation)');
  const manifest = JSON.parse(fromUtf8(c.files.get('manifest.json')!)) as Json;
  const types = new Map((manifest.resources as Array<{ url: string; type: string }>).map((r) => [r.url, r.type]));
  if (types.get(path) !== XHTML_TYPE) throw new LockError('invalid', `${path} is not an XHTML document of the main version`);
  const access = parseAccess(manifest);
  const text = fromUtf8(c.files.get(path)!);
  const doc = parseXml(text, path);
  const el = byId(doc, id);
  if (!el) throw new LockError('not-found', `no element with id "${id}" in ${path}`);
  assertEditable(access, path, el, `Abschnitt ${id}`);
  const ids = ancestorIds(el);
  for (let p = el.parentNode; p; p = p.parentNode) if ((p as { hasAttribute?: (n: string) => boolean }).hasAttribute?.('data-hp-sealed')) throw new LockError('sealed', `${options.target} liegt in einem versiegelten Abschnitt`);
  if (access.some((a) => a.rules.includes('sealed') && splitTarget(a.target).path === path && ids.includes(splitTarget(a.target).id ?? ''))) throw new LockError('sealed', `${options.target} ist versiegelt`);
  if (!options.replaceMarkup && Array.from({ length: el.childNodes.length }, (_, i) => el.childNodes.item(i)).some((n) => n?.nodeType === 1)) {
    throw new LockError('invalid', `${options.target} contains elements; only an element with plain text is replaced (structure stays structure; replaceMarkup to replace links and inline markup as well)`);
  }
  while (el.firstChild) el.removeChild(el.firstChild);
  el.appendChild(doc.createTextNode(options.text));
  const history = Array.isArray(manifest.history) ? [...(manifest.history as Json[])] : [];
  history.push({
    version: history.length > 0 ? Math.max(...history.map((h) => Number(h.version) || 0)) + 1 : 1,
    dateModified: options.modified,
    note: options.note ?? `Text von ${options.target} geändert`,
    manifestIntegrity: await sriSha256(c.files.get('manifest.json')!),
  });
  return writeChangedContainer(c, { ...manifest, dateModified: options.modified, history }, new Map([[path, utf8(serializeXml(doc, text))]]), new Map(), new Set(), options.modified);
}
