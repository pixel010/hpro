/**
 * Signing html-Pro containers in the core: XAdES-BASELINE-B in ASiC-E, without Java
 * (package P3).
 *
 * Format as fixed by the prototype (docs/05, 6.1; docs/03, Nachtrag N.2):
 *   - `mimetype` stays `application/epub+zip`, first entry, stored (own ZIP writer),
 *   - signatures live in `META-INF/signatures.xml` with the OCF root element; a new signature
 *     is appended as last child, existing signatures are left byte-for-byte untouched,
 *   - exclusive C14N for `SignedInfo` and `SignedProperties`,
 *   - every file outside `META-INF/` is signed, plus `META-INF/container.xml` explicitly,
 *   - `META-INF/manifest.xml` (ODF manifest) is written because the ASiC-E container
 *     constraints of the DSS default policy require it,
 *   - `DataObjectFormat` carries the real media types (DSS writes `application/octet-stream`).
 *
 * The private key never reaches this module: it builds the XAdES structure and asks a
 * `Signer` adapter for the signature value over the canonical `SignedInfo`.
 */
import { DOMParser, type Element } from '@xmldom/xmldom';
import type { SignatureAlgorithm, Signer, SigningKey } from './adapters/signer.js';
import { fromUtf8, hexToBytes, toBase64, utf8 } from './bytes.js';
import { C14N, canonicalize } from './c14n.js';
import * as w from './der-write.js';
import { ContainerError } from './errors.js';
import { readContainer, type ReadContainer } from './container.js';
import { CONTAINER_XML_PATH, EPUB_MIMETYPE, MANIFEST_PATH, MIMETYPE_PATH, OPF_MEDIA_TYPE, escapeXml, pathToHref } from './ocf.js';
import { validateContainer, type DetailedValidationReport } from './validate.js';
import { NS, SignatureFileError, parseSignatureFile } from './xades.js';
import { parseCertificate, type Certificate } from './x509.js';
import { writeZip, type ZipEntryInput } from './zip.js';

export const SIGNATURES_PATH = 'META-INF/signatures.xml';
export const ODF_MANIFEST_PATH = 'META-INF/manifest.xml';

const SHA256_URI = 'http://www.w3.org/2001/04/xmlenc#sha256';
const SIGNED_PROPERTIES_TYPE = 'http://uri.etsi.org/01903#SignedProperties';
const ODF_MANIFEST_NS = 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0';

const SIGNATURE_METHOD_URI: Record<SignatureAlgorithm, string | undefined> = {
  'RSASSA-PKCS1-v1_5-SHA256': 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  'ECDSA-P256-SHA256': 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256',
  'ECDSA-P384-SHA384': 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384',
  'RSASSA-PSS-SHA256': undefined,
};

const SIGNED_INFO_DIGEST: Record<SignatureAlgorithm, 'SHA-256' | 'SHA-384'> = {
  'RSASSA-PKCS1-v1_5-SHA256': 'SHA-256',
  'ECDSA-P256-SHA256': 'SHA-256',
  'ECDSA-P384-SHA384': 'SHA-384',
  'RSASSA-PSS-SHA256': 'SHA-256',
};

/** Media types of container files that `manifest.json` does not describe. */
const FIXED_MEDIA_TYPES: Record<string, string> = {
  [CONTAINER_XML_PATH]: 'text/xml',
  [MANIFEST_PATH]: 'application/json',
};

export interface SignOptions {
  readonly signer: Signer;
  /** Key from `signer.listKeys()`; default: the first one. */
  readonly key?: SigningKey;
  /** Default: the first algorithm of the key that the core can write. */
  readonly algorithm?: SignatureAlgorithm;
  /** Claimed signing time (`xades:SigningTime`), default now. Seconds precision. */
  readonly signingTime?: Date;
  /** `Id` of the new `ds:Signature`; default `id-` plus 32 random hex digits. */
  readonly signatureId?: string;
  /**
   * Files to sign instead of all files outside `META-INF/` (`META-INF/container.xml` is always
   * added). Meant for docs/10, promise 5: a frozen version is signed while the living version
   * stays editable; files left out are reported as unsigned by validators (docs/05, V9).
   * Which files belong to which version is not yet part of the format (open question).
   */
  readonly paths?: readonly string[];
  readonly signal?: AbortSignal;
}

export interface SignedContainer {
  readonly bytes: Uint8Array;
  readonly signatureId: string;
  /** Container paths covered by the new signature, in reference order. */
  readonly signedPaths: readonly string[];
  /**
   * Read-back check of the written container with the core's own validator (signing
   * certificate as trust anchor, policy `html-pro`). The new signature is TOTAL_PASSED and
   * every earlier signature has the verdict it had before, otherwise `signContainer` throws.
   */
  readonly readBack: DetailedValidationReport;
}

function fail(message: string): never {
  throw new ContainerError('signature', message);
}

function xmlDateTime(date: Date): string {
  if (Number.isNaN(date.getTime())) fail('invalid signing time');
  return date.toISOString().slice(0, 19) + 'Z';
}

async function sha(hash: 'SHA-256' | 'SHA-384', data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest(hash, new Uint8Array(data)));
}

/** `IssuerSerial ::= SEQUENCE { issuer GeneralNames, serialNumber CertificateSerialNumber }` (RFC 5035). */
function issuerSerialV2(cert: Certificate): Uint8Array {
  // serialHex is the content of the certificate's DER INTEGER, so this re-creates it exactly.
  return w.sequence(w.sequence(w.tlv(0xa4, cert.issuerDer)), w.tlv(0x02, hexToBytes(cert.serialHex)));
}

/** Media type per path: manifest.json first, then package.opf items, then fixed values. */
function mediaTypes(container: ReadContainer): Map<string, string> {
  const types = new Map<string, string>();
  for (const r of container.manifest.resources) types.set(r.url, r.type);
  types.set(container.packagePath, OPF_MEDIA_TYPE);
  for (const [path, type] of Object.entries(FIXED_MEDIA_TYPES)) types.set(path, type);
  // Frozen renditions (part 1, section 7.3) describe their files in their own manifest.
  for (const [path, data] of container.files) {
    if (!RENDITION_MANIFEST.test(path)) continue;
    types.set(path, 'application/json');
    try {
      const m = JSON.parse(fromUtf8(data)) as { resources?: Array<{ url?: unknown; type?: unknown }> };
      for (const r of m.resources ?? []) if (typeof r.url === 'string' && typeof r.type === 'string' && !types.has(r.url)) types.set(r.url, r.type);
    } catch {
      // an unreadable rendition manifest leaves its files at application/octet-stream
    }
  }
  return types;
}

const RENDITION_MANIFEST = /^renditions\/[^/]+\/manifest\.json$/;

const isDataFile = (p: string) => p !== MIMETYPE_PATH && !p.startsWith('META-INF/') && !p.endsWith('/');

/** Files the signature covers: everything outside META-INF plus container.xml (docs/03, N.2). */
export function filesToSign(paths: Iterable<string>): string[] {
  return [CONTAINER_XML_PATH, ...[...paths].filter(isDataFile).sort()];
}

function selectedFiles(container: ReadContainer, selection: readonly string[] | undefined): string[] {
  if (selection === undefined) return filesToSign(container.files.keys());
  if (selection.length === 0) fail('paths must name at least one file');
  if (new Set(selection).size !== selection.length) fail('paths lists a file twice');
  for (const p of selection) {
    if (p === CONTAINER_XML_PATH) continue;
    if (!isDataFile(p)) fail(`"${p}" cannot be selected; META-INF/container.xml is always signed, other META-INF files and mimetype never`);
    if (!container.files.has(p)) fail(`"${p}" does not exist in the container`);
  }
  return filesToSign(selection.filter((p) => p !== CONTAINER_XML_PATH));
}

function odfManifest(paths: readonly string[], types: ReadonlyMap<string, string>): string {
  const entry = (path: string, type: string) => `<manifest:file-entry manifest:full-path="${escapeXml(path)}" manifest:media-type="${escapeXml(type)}"/>`;
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<manifest:manifest xmlns:manifest="${ODF_MANIFEST_NS}" manifest:version="1.2">` +
    entry('/', EPUB_MIMETYPE) +
    paths.map((p) => entry(p, types.get(p) ?? 'application/octet-stream')).join('') +
    '</manifest:manifest>\n'
  );
}

const PLACEHOLDER_PROPS = '@@SIGNED-PROPERTIES-DIGEST@@';
const PLACEHOLDER_VALUE = '@@SIGNATURE-VALUE@@';

function findById(root: Element, id: string): Element {
  const stack: Element[] = [root];
  while (stack.length > 0) {
    const el = stack.pop()!;
    if (el.getAttribute('Id') === id) return el;
    for (let c = el.lastChild; c; c = c.previousSibling) if (c.nodeType === 1) stack.push(c as Element);
  }
  fail(`internal: element with Id ${id} not found`);
}

function parseFragment(signatureXml: string): Element {
  const errors: string[] = [];
  const doc = new DOMParser({ onError: (level, msg) => void (level !== 'warning' && errors.push(msg)) }).parseFromString(
    `<signatures xmlns="${NS.ocf}">${signatureXml}</signatures>`,
    'application/xml',
  );
  if (errors.length > 0 || !doc.documentElement) fail(`internal: generated signature is not well-formed: ${errors.join('; ')}`);
  return doc.documentElement;
}

interface BuildInput {
  readonly id: string;
  readonly signatureMethod: string;
  readonly references: ReadonlyArray<{ readonly path: string; readonly digest: Uint8Array; readonly mediaType: string }>;
  readonly chain: readonly Certificate[];
  readonly signingTime: string;
  readonly certDigest: Uint8Array;
}

/** The `ds:Signature` element as text, with placeholders for the two values computed afterwards. */
function signatureTemplate(b: BuildInput): string {
  const refId = (i: number) => `r-${b.id}-${i + 1}`;
  const refs = b.references
    .map(
      (r, i) =>
        `<ds:Reference Id="${refId(i)}" URI="${escapeXml(pathToHref(r.path))}"><ds:DigestMethod Algorithm="${SHA256_URI}"/>` +
        `<ds:DigestValue>${toBase64(r.digest)}</ds:DigestValue></ds:Reference>`,
    )
    .join('');
  const formats = b.references
    .map((r, i) => `<xades:DataObjectFormat ObjectReference="#${refId(i)}"><xades:MimeType>${escapeXml(r.mediaType)}</xades:MimeType></xades:DataObjectFormat>`)
    .join('');
  const certs = b.chain.map((c) => `<ds:X509Certificate>${toBase64(c.der)}</ds:X509Certificate>`).join('');
  return (
    `<ds:Signature xmlns:ds="${NS.ds}" Id="${b.id}">` +
    `<ds:SignedInfo>` +
    `<ds:CanonicalizationMethod Algorithm="${C14N.exclusive}"/>` +
    `<ds:SignatureMethod Algorithm="${b.signatureMethod}"/>` +
    refs +
    `<ds:Reference Type="${SIGNED_PROPERTIES_TYPE}" URI="#xades-${b.id}"><ds:Transforms><ds:Transform Algorithm="${C14N.exclusive}"/></ds:Transforms>` +
    `<ds:DigestMethod Algorithm="${SHA256_URI}"/><ds:DigestValue>${PLACEHOLDER_PROPS}</ds:DigestValue></ds:Reference>` +
    `</ds:SignedInfo>` +
    `<ds:SignatureValue Id="value-${b.id}">${PLACEHOLDER_VALUE}</ds:SignatureValue>` +
    `<ds:KeyInfo><ds:X509Data>${certs}</ds:X509Data></ds:KeyInfo>` +
    `<ds:Object><xades:QualifyingProperties xmlns:xades="${NS.xades}" Target="#${b.id}">` +
    `<xades:SignedProperties Id="xades-${b.id}">` +
    `<xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${b.signingTime}</xades:SigningTime>` +
    `<xades:SigningCertificateV2><xades:Cert><xades:CertDigest><ds:DigestMethod Algorithm="${SHA256_URI}"/><ds:DigestValue>${toBase64(b.certDigest)}</ds:DigestValue></xades:CertDigest>` +
    `<xades:IssuerSerialV2>${toBase64(issuerSerialV2(b.chain[0]!))}</xades:IssuerSerialV2></xades:Cert></xades:SigningCertificateV2>` +
    `</xades:SignedSignatureProperties>` +
    `<xades:SignedDataObjectProperties>${formats}</xades:SignedDataObjectProperties>` +
    `</xades:SignedProperties></xades:QualifyingProperties></ds:Object>` +
    `</ds:Signature>`
  );
}

/** Inserts `signature` as last child of an existing OCF `signatures` file, keeping its other bytes. */
function appendToSignatureFile(existing: Uint8Array, signature: string): string {
  let parsed;
  try {
    parsed = parseSignatureFile(existing);
  } catch (err) {
    if (err instanceof SignatureFileError) fail(`existing ${SIGNATURES_PATH} cannot be read: ${err.message}`);
    throw err;
  }
  if (parsed.rootNamespace !== NS.ocf || parsed.rootName !== 'signatures') {
    fail(`existing ${SIGNATURES_PATH} has root {${parsed.rootNamespace}}${parsed.rootName}; html-Pro appends only to the OCF root (docs/05, V4/V5)`);
  }
  const text = fromUtf8(existing);
  const close = /<\/(?:[A-Za-z_][\w.-]*:)?signatures\s*>\s*$/.exec(text);
  if (!close) fail(`closing tag of ${SIGNATURES_PATH} not found`);
  return text.slice(0, close.index) + signature + text.slice(close.index);
}

const verdict = (s: { indication: string; subIndication?: string }) => `${s.indication}${s.subIndication ? '/' + s.subIndication : ''}`;

/**
 * Adds one XAdES-BASELINE-B signature to an html-Pro container and writes the container
 * with the core's ZIP writer. Refuses containers whose hash manifest does not verify
 * (nobody should sign content that is already inconsistent).
 */
export async function signContainer(bytes: Uint8Array, options: SignOptions): Promise<SignedContainer> {
  options.signal?.throwIfAborted();
  const container = await readContainer(bytes);
  if (!container.integrity.ok) {
    const bad = container.integrity.resources.filter((r) => r.status !== 'ok').map((r) => `${r.path} (${r.status})`);
    fail(`manifest.json does not verify, refusing to sign: ${[...bad, ...container.integrity.problems].join(', ')}`);
  }

  const key = options.key ?? (await options.signer.listKeys({ ...(options.signal ? { signal: options.signal } : {}) }))[0];
  if (!key) fail('the signer offers no key');
  const algorithm = options.algorithm ?? key.algorithms.find((a) => SIGNATURE_METHOD_URI[a] !== undefined);
  if (!algorithm || !key.algorithms.includes(algorithm)) fail(`key ${key.keyId} offers no algorithm the core can write (${key.algorithms.join(', ')})`);
  const signatureMethod = SIGNATURE_METHOD_URI[algorithm];
  if (!signatureMethod) fail(`signature algorithm ${algorithm} cannot be written yet`);
  if (key.certificateChain.length === 0) fail('key has no certificate');
  const chain = key.certificateChain.map((der) => parseCertificate(der));
  const signingCert = chain[0]!;
  const signingTime = options.signingTime ?? new Date();
  if (signingTime < signingCert.notBefore || signingTime > signingCert.notAfter) {
    fail(`signing time ${xmlDateTime(signingTime)} lies outside the certificate validity ${signingCert.notBefore.toISOString()} – ${signingCert.notAfter.toISOString()}`);
  }

  const signedBefore = [...container.files.keys()].some((p) => /^META-INF\/[^/]*signature/.test(p));
  const before = signedBefore ? await validateContainer(bytes, { trustAnchors: [signingCert.der], validationTime: signingTime.toISOString() }) : undefined;

  const id = options.signatureId ?? `id-${[...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  if (!/^[A-Za-z_][\w.-]*$/.test(id)) fail(`signature id "${id}" is not an XML NCName`);
  if (before?.signatures.some((s) => s.signatureId === id)) fail(`signature id "${id}" exists already`);

  const types = mediaTypes(container);
  const paths = selectedFiles(container, options.paths);
  const references = await Promise.all(
    paths.map(async (path) => ({ path, digest: await sha('SHA-256', container.files.get(path)!), mediaType: types.get(path) ?? 'application/octet-stream' })),
  );
  let xml = signatureTemplate({
    id,
    signatureMethod,
    references,
    chain,
    signingTime: xmlDateTime(signingTime),
    certDigest: await sha('SHA-256', signingCert.der),
  });

  // 1. Digest over the canonical SignedProperties (independent of SignedInfo and the value).
  const props = findById(parseFragment(xml), `xades-${id}`);
  xml = xml.replace(PLACEHOLDER_PROPS, toBase64(await sha('SHA-256', utf8(canonicalize(props, C14N.exclusive)))));
  // 2. Signature value over the canonical SignedInfo. Exclusive C14N renders only the
  //    namespaces the subtree uses, so the result does not depend on the enclosing file.
  const signedInfo = parseFragment(xml).getElementsByTagNameNS(NS.ds, 'SignedInfo')[0];
  if (!signedInfo) fail('internal: SignedInfo missing');
  const data = utf8(canonicalize(signedInfo, C14N.exclusive));
  const digestAlgorithm = SIGNED_INFO_DIGEST[algorithm];
  const value = await options.signer.signDigest({
    keyId: key.keyId,
    algorithm,
    digest: await sha(digestAlgorithm, data),
    digestAlgorithm,
    data,
    description: `html-Pro: ${container.manifest.name}`,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  xml = xml.replace(PLACEHOLDER_VALUE, toBase64(value));

  const existing = container.files.get(SIGNATURES_PATH);
  const signaturesXml = existing
    ? appendToSignatureFile(existing, xml)
    : `<?xml version="1.0" encoding="UTF-8"?>\n<signatures xmlns="${NS.ocf}">${xml}</signatures>\n`;
  const manifestXml = odfManifest(filesToSign(container.files.keys()), types);

  // Entry order and compression as found; signature files are replaced in place or appended.
  const replaced = new Map<string, Uint8Array>([
    [SIGNATURES_PATH, utf8(signaturesXml)],
    [ODF_MANIFEST_PATH, utf8(manifestXml)],
  ]);
  const entries: ZipEntryInput[] = container.entries.map((e) => {
    const data = replaced.get(e.name);
    replaced.delete(e.name);
    if (e.name === MIMETYPE_PATH) return { name: e.name, data: e.data, compression: 'store' };
    return { name: e.name, data: data ?? e.data, compression: data ? 'auto' : e.method === 'stored' ? 'store' : 'deflate' };
  });
  for (const [name, data] of replaced) entries.push({ name, data, compression: 'auto' });
  const modified = new Date(container.manifest.dateModified);
  const out = await writeZip(entries, { modified: Number.isNaN(modified.getTime()) ? new Date('1980-01-01T00:00:00Z') : modified });

  // Read back like a foreign container: structure, hash manifest, all signatures.
  const check = await readContainer(out);
  if (check.mimetype !== EPUB_MIMETYPE || !check.integrity.ok) fail('written container failed the structural read-back check');
  const readBack = await validateContainer(out, { trustAnchors: [signingCert.der], validationTime: signingTime.toISOString() });
  const mine = readBack.signatures.find((s) => s.signatureId === id);
  if (!mine || mine.indication !== 'TOTAL_PASSED') {
    fail(`new signature does not verify after writing: ${mine ? verdict(mine) + ' ' + mine.errors.join('; ') : 'not found'}`);
  }
  for (const old of before?.signatures ?? []) {
    const now = readBack.signatures.find((s) => s.signatureId === old.signatureId && s.file === old.file);
    if (!now || verdict(now) !== verdict(old)) fail(`signing changed the verdict of existing signature ${old.signatureId}: ${verdict(old)} -> ${now ? verdict(now) : 'missing'}`);
  }
  return { bytes: out, signatureId: id, signedPaths: paths, readBack };
}
