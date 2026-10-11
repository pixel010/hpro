/**
 * XAdES signatures in ASiC-E containers (ETSI EN 319 132-1, EN 319 162-1).
 *
 * Covers what docs/05 established for html-Pro: detached `ds:Reference`s to container files,
 * one same-document reference to `xades:SignedProperties`, signature files with ASiC, OCF or
 * ODF root element, several `ds:Signature` siblings in one file (case V11).
 *
 * Checks per signature: references found and intact (digest over the file bytes), signature
 * value over the canonicalized `ds:SignedInfo`, signing certificate identified through
 * `SigningCertificateV2`/`SigningCertificate`, certificate path to a trust anchor.
 */
import { DOMParser, type Document, type Element } from '@xmldom/xmldom';
import { equalBytes, fromUtf8, utf8 } from './bytes.js';
import { C14N, C14nError, SUPPORTED_C14N, canonicalize } from './c14n.js';
import { DerError, TAG, children, expect, integerHex, parseDer } from './der.js';
import {
  MSG,
  buildChain,
  decide,
  digest,
  newLog,
  referenceToPath,
  verdictMessages,
  type BuildingBlocks,
  type CheckLog,
  type ReferenceCheck,
  type Verdict,
} from './sigcommon.js';
import { UnsupportedAlgorithmError, base64Decode, parseCertificate, sameName, verifyWithCertificate, type Certificate, type HashName, type SignatureAlgorithmSpec } from './x509.js';

export const NS = {
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  xades: 'http://uri.etsi.org/01903/v1.3.2#',
  xades141: 'http://uri.etsi.org/01903/v1.4.1#',
  asic: 'http://uri.etsi.org/02918/v1.2.1#',
  ocf: 'urn:oasis:names:tc:opendocument:xmlns:container',
  odfSig: 'urn:oasis:names:tc:opendocument:xmlns:digitalsignature:1.0',
} as const;

const SIGNED_PROPERTIES_TYPE = 'http://uri.etsi.org/01903#SignedProperties';

export const DIGEST_METHODS: Record<string, HashName> = {
  'http://www.w3.org/2000/09/xmldsig#sha1': 'SHA-1',
  'http://www.w3.org/2001/04/xmlenc#sha256': 'SHA-256',
  'http://www.w3.org/2001/04/xmldsig-more#sha384': 'SHA-384',
  'http://www.w3.org/2001/04/xmlenc#sha512': 'SHA-512',
};

export const SIGNATURE_METHODS: Record<string, SignatureAlgorithmSpec> = {
  'http://www.w3.org/2000/09/xmldsig#rsa-sha1': { key: 'RSA', hash: 'SHA-1' },
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256': { key: 'RSA', hash: 'SHA-256' },
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha384': { key: 'RSA', hash: 'SHA-384' },
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha512': { key: 'RSA', hash: 'SHA-512' },
  'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha1': { key: 'EC', hash: 'SHA-1' },
  'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256': { key: 'EC', hash: 'SHA-256' },
  'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384': { key: 'EC', hash: 'SHA-384' },
  'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512': { key: 'EC', hash: 'SHA-512' },
};

/** Hash algorithms DSS's default policy no longer accepts for new signatures. */
const WEAK_HASHES: ReadonlySet<HashName> = new Set(['SHA-1']);

export class SignatureFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignatureFileError';
  }
}

export interface ParsedSignatureFile {
  readonly rootNamespace: string;
  readonly rootName: string;
  readonly signatures: readonly Element[];
  readonly document: Document;
}

/** Parses a signature file. DOCTYPEs are refused (no entity tricks in signed XML). */
export function parseSignatureFile(bytes: Uint8Array): ParsedSignatureFile {
  let text: string;
  try {
    text = fromUtf8(bytes);
  } catch {
    throw new SignatureFileError('signature file is not valid UTF-8');
  }
  if (/<!DOCTYPE/i.test(text)) throw new SignatureFileError('DOCTYPE is not allowed in signature files');
  const problems: string[] = [];
  const doc = new DOMParser({
    onError: (level, msg) => {
      if (level !== 'warning') problems.push(msg);
    },
  }).parseFromString(text, 'application/xml');
  if (problems.length > 0 || !doc.documentElement) throw new SignatureFileError(`XML not well-formed: ${problems.join('; ')}`);
  const root = doc.documentElement;
  const accepted =
    (root.namespaceURI === NS.asic && root.localName === 'XAdESSignatures') ||
    (root.namespaceURI === NS.ocf && root.localName === 'signatures') ||
    (root.namespaceURI === NS.odfSig && root.localName === 'document-signatures');
  if (!accepted) throw new SignatureFileError(`unexpected root element {${root.namespaceURI ?? ''}}${root.localName}`);
  const signatures = childElements(root).filter((e) => isDs(e, 'Signature'));
  return { rootNamespace: root.namespaceURI!, rootName: root.localName!, signatures, document: doc };
}

function childElements(el: Element): Element[] {
  const out: Element[] = [];
  for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) out.push(c as Element);
  return out;
}

function isDs(el: Element | undefined, local: string): el is Element {
  return !!el && el.namespaceURI === NS.ds && el.localName === local;
}

function isXades(el: Element | undefined, local: string): el is Element {
  return !!el && (el.namespaceURI === NS.xades || el.namespaceURI === NS.xades141) && el.localName === local;
}

function child(el: Element | undefined, test: (e: Element) => boolean): Element | undefined {
  return el ? childElements(el).find(test) : undefined;
}

function descendants(el: Element, test: (e: Element) => boolean, out: Element[] = []): Element[] {
  for (const c of childElements(el)) {
    if (test(c)) out.push(c);
    descendants(c, test, out);
  }
  return out;
}

function textOf(el: Element | undefined): string {
  return el?.textContent ?? '';
}

function idOf(el: Element): string | null {
  return el.getAttribute('Id') ?? el.getAttribute('ID') ?? el.getAttribute('id');
}

export interface XadesContext {
  /** Container files by path. */
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly trustAnchors: readonly Certificate[];
  readonly validationTime: Date;
  /** Container-level format checks (mimetype, manifest, all files signed) for the given signed paths. */
  readonly containerChecks?: (signedPaths: readonly string[]) => CheckLog;
}

/** Puts the container checks in front of the signature's own format findings. */
export function withContainerChecks(fc: CheckLog, ctx: { containerChecks?: (signedPaths: readonly string[]) => CheckLog }, signedPaths: readonly string[]): void {
  if (!ctx.containerChecks) return;
  const c = ctx.containerChecks(signedPaths);
  fc.errors.unshift(...c.errors);
  fc.warnings.unshift(...c.warnings);
  fc.infos.unshift(...c.infos);
}

export interface XadesResult extends Verdict {
  readonly signatureId: string;
  readonly level: string;
  readonly references: readonly ReferenceCheck[];
  readonly signedPaths: readonly string[];
  readonly signingCertificate?: Certificate;
  readonly chain: readonly Certificate[];
  readonly claimedSigningTime?: string;
  readonly signatureAlgorithm: string;
  readonly canonicalization: string;
  readonly log: CheckLog;
  readonly blocks: BuildingBlocks;
}

interface CanonParams {
  readonly algorithm: string;
  readonly prefixes: readonly string[];
}

function canonParams(methodEl: Element): CanonParams {
  const algorithm = methodEl.getAttribute('Algorithm') ?? '';
  const incl = childElements(methodEl).find((e) => e.localName === 'InclusiveNamespaces');
  const list = incl?.getAttribute('PrefixList')?.trim();
  return { algorithm, prefixes: list ? list.split(/\s+/) : [] };
}

/** Verifies one `ds:Signature` against the container files in `ctx`. */
export async function verifyXadesSignature(sig: Element, ctx: XadesContext): Promise<XadesResult> {
  const fc = newLog();
  const signatureId = idOf(sig) ?? '(ohne Id)';
  const unsupported: string[] = [];
  const weak: string[] = [];
  const references: ReferenceCheck[] = [];
  const signedPaths: string[] = [];

  const signedInfo = child(sig, (e) => isDs(e, 'SignedInfo'));
  const signatureValueEl = child(sig, (e) => isDs(e, 'SignatureValue'));
  if (!signedInfo || !signatureValueEl) fc.errors.push('ds:SignedInfo or ds:SignatureValue missing');

  const c14nEl = child(signedInfo, (e) => isDs(e, 'CanonicalizationMethod'));
  const canon = c14nEl ? canonParams(c14nEl) : { algorithm: '', prefixes: [] };
  if (!SUPPORTED_C14N.includes(canon.algorithm)) unsupported.push(`canonicalization ${canon.algorithm || '(none)'}`);
  const sigMethodUri = child(signedInfo, (e) => isDs(e, 'SignatureMethod'))?.getAttribute('Algorithm') ?? '';
  const sigMethod = SIGNATURE_METHODS[sigMethodUri];
  if (!sigMethod) unsupported.push(`signature method ${sigMethodUri || '(none)'}`);
  else if (WEAK_HASHES.has(sigMethod.hash)) weak.push(sigMethodUri);

  // Identifiers must be unique in the signature document; otherwise a reference could be
  // redirected to an element the signer never saw (signature wrapping).
  const doc = sig.ownerDocument!;
  const allWithId = descendants(doc.documentElement!, (e) => idOf(e) !== null);
  const idCounts = new Map<string, number>();
  for (const e of allWithId) idCounts.set(idOf(e)!, (idCounts.get(idOf(e)!) ?? 0) + 1);
  if ((idCounts.get(signatureId) ?? 0) > 1) fc.errors.push(MSG.duplicateSignature);
  const ambiguous = [...idCounts].filter(([id, n]) => n > 1 && id !== signatureId).map(([id]) => id);
  if (ambiguous.length > 0) fc.errors.push(`ambiguous identifiers in the signature file: ${ambiguous.join(', ')}`);

  const qualifying = child(
    child(sig, (e) => isDs(e, 'Object') && !!child(e, (q) => isXades(q, 'QualifyingProperties'))),
    (e) => isXades(e, 'QualifyingProperties'),
  );
  const signedProps = child(qualifying, (e) => isXades(e, 'SignedProperties'));
  if (qualifying && qualifying.getAttribute('Target') !== `#${signatureId}`) fc.errors.push('QualifyingProperties/@Target does not point to the signature');

  let signedPropsRefs = 0;
  for (const ref of childElements(signedInfo ?? sig).filter((e) => isDs(e, 'Reference'))) {
    const uri = ref.getAttribute('URI') ?? '';
    const type = ref.getAttribute('Type');
    const digestUri = child(ref, (e) => isDs(e, 'DigestMethod'))?.getAttribute('Algorithm') ?? '';
    const hash = DIGEST_METHODS[digestUri];
    let expected: Uint8Array | undefined;
    try {
      expected = base64Decode(textOf(child(ref, (e) => isDs(e, 'DigestValue'))));
    } catch {
      expected = undefined;
    }
    const transforms = childElements(child(ref, (e) => isDs(e, 'Transforms')) ?? ref).filter((e) => isDs(e, 'Transform'));
    const base = { uri, digestAlgorithm: digestUri };
    if (!hash || !expected) {
      references.push({ ...base, kind: uri.startsWith('#') ? 'signed-properties' : 'file', status: 'unsupported', detail: hash ? 'invalid DigestValue' : `digest method ${digestUri}` });
      continue;
    }
    if (WEAK_HASHES.has(hash)) weak.push(digestUri);

    if (uri.startsWith('#')) {
      // Same-document reference: only the SignedProperties of this very signature are accepted.
      const target = allWithId.filter((e) => idOf(e) === uri.slice(1));
      if (type !== SIGNED_PROPERTIES_TYPE || target.length !== 1 || target[0] !== signedProps) {
        references.push({ ...base, kind: 'signed-properties', status: target.length === 0 ? 'not-found' : 'unsupported', detail: 'same-document reference other than this signature\'s SignedProperties' });
        continue;
      }
      signedPropsRefs++;
      let data: Uint8Array;
      try {
        // A bare-name XPointer removes comments before the transforms (XML-DSig 4.4.3.3).
        const algs = transforms.map((t) => canonParams(t));
        const last = algs[algs.length - 1];
        if (algs.length > 1 || (last && !SUPPORTED_C14N.includes(last.algorithm))) throw new C14nError(`transforms ${algs.map((a) => a.algorithm).join(', ')}`);
        data = utf8(canonicalize(target[0]!, withoutComments(last?.algorithm ?? C14N.inclusive10), { inclusivePrefixes: last?.prefixes ?? [] }));
      } catch (err) {
        references.push({ ...base, kind: 'signed-properties', status: 'unsupported', detail: String(err instanceof Error ? err.message : err) });
        continue;
      }
      const actual = await digest(hash, data);
      references.push({ ...base, kind: 'signed-properties', status: equalBytes(actual, expected) ? 'intact' : 'hash-failure' });
      continue;
    }

    const path = referenceToPath(uri);
    if (path === undefined) {
      references.push({ ...base, kind: 'file', status: 'unsupported', detail: 'URI is not a relative container path' });
      continue;
    }
    if (transforms.length > 0) {
      references.push({ ...base, kind: 'file', path, status: 'unsupported', detail: 'transforms on detached file references are not supported' });
      continue;
    }
    signedPaths.push(path);
    const data = ctx.files.get(path);
    if (!data) {
      references.push({ ...base, kind: 'file', path, status: 'not-found' });
      continue;
    }
    const actual = await digest(hash, data);
    references.push({ ...base, kind: 'file', path, status: equalBytes(actual, expected) ? 'intact' : 'hash-failure' });
  }
  if (signedPropsRefs !== 1) fc.errors.push(`expected exactly one reference to SignedProperties, found ${signedPropsRefs}`);
  withContainerChecks(fc, ctx, signedPaths);

  // Signing certificate (ISC).
  const keyInfoCerts: Certificate[] = [];
  for (const c of descendants(child(sig, (e) => isDs(e, 'KeyInfo')) ?? sig, (e) => isDs(e, 'X509Certificate'))) {
    try {
      keyInfoCerts.push(parseCertificate(base64Decode(textOf(c))));
    } catch (err) {
      fc.warnings.push(`unreadable certificate in KeyInfo: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const signedSigProps = child(signedProps, (e) => isXades(e, 'SignedSignatureProperties'));
  const claimedSigningTime = textOf(child(signedSigProps, (e) => isXades(e, 'SigningTime'))).trim() || undefined;
  // Candidates come from the signature only; DSS does not take them from the trust anchors (case M13).
  const { cert: signingCertificate, error: iscError, warnings: iscWarnings } = await identifySigningCertificate(signedSigProps, keyInfoCerts);
  fc.warnings.push(...iscWarnings);

  // Signature value (CV).
  let signatureIntact: boolean | undefined;
  if (signedInfo && signatureValueEl && sigMethod && signingCertificate && SUPPORTED_C14N.includes(canon.algorithm)) {
    try {
      const canonical = utf8(canonicalize(signedInfo, canon.algorithm, { inclusivePrefixes: canon.prefixes }));
      signatureIntact = await verifyWithCertificate(signingCertificate, sigMethod, base64Decode(textOf(signatureValueEl)), canonical, 'raw');
    } catch (err) {
      if (err instanceof UnsupportedAlgorithmError || err instanceof C14nError) unsupported.push(err.message);
      else if (err instanceof DerError) signatureIntact = false;
      else throw err;
    }
  }

  const chain = signingCertificate ? await buildChain(signingCertificate, keyInfoCerts, ctx.trustAnchors) : undefined;
  const unsigned = child(qualifying, (e) => isXades(e, 'UnsignedProperties'));
  const level = xadesLevel(signedSigProps, unsigned);
  if (level !== 'XAdES-BASELINE-B' && level.startsWith('XAdES-BASELINE')) fc.warnings.push(`${level}: timestamps and validation data are not verified by this validator`);

  const blocks: BuildingBlocks = {
    fc,
    ...(iscError !== undefined ? { iscError } : {}),
    references,
    signatureIntact,
    ...(chain ? { chain } : {}),
    ...(signingCertificate ? { signingCertificate } : {}),
    validationTime: ctx.validationTime,
    weakAlgorithms: weak,
    unsupported,
  };
  const verdict = decide(blocks);
  const log = newLog();
  log.errors.push(...fc.errors);
  verdictMessages(blocks, log);
  log.warnings.push(...fc.warnings);
  log.infos.push(...fc.infos);
  return {
    ...verdict,
    signatureId,
    level,
    references,
    signedPaths,
    ...(signingCertificate ? { signingCertificate } : {}),
    chain: chain?.path ?? [],
    ...(claimedSigningTime ? { claimedSigningTime } : {}),
    signatureAlgorithm: sigMethodUri,
    canonicalization: canon.algorithm,
    log,
    blocks,
  };
}

function withoutComments(algorithm: string): string {
  switch (algorithm) {
    case C14N.exclusiveWithComments:
      return C14N.exclusive;
    case C14N.inclusive10WithComments:
      return C14N.inclusive10;
    case C14N.inclusive11WithComments:
      return C14N.inclusive11;
    default:
      return algorithm;
  }
}

function xadesLevel(signedSigProps: Element | undefined, unsigned: Element | undefined): string {
  const hasCert = !!child(signedSigProps, (e) => isXades(e, 'SigningCertificateV2') || isXades(e, 'SigningCertificate'));
  const hasTime = !!child(signedSigProps, (e) => isXades(e, 'SigningTime'));
  if (!hasCert || !hasTime) return 'XAdES-BES';
  const usp = child(unsigned, (e) => isXades(e, 'UnsignedSignatureProperties'));
  const has = (name: string) => !!usp && descendants(usp, (e) => e.localName === name).length > 0;
  if (has('ArchiveTimeStamp')) return 'XAdES-BASELINE-LTA';
  if (has('CertificateValues') || has('RevocationValues')) return 'XAdES-BASELINE-LT';
  if (has('SignatureTimeStamp')) return 'XAdES-BASELINE-T';
  return 'XAdES-BASELINE-B';
}

/**
 * Finds the certificate whose digest is given in `SigningCertificateV2` (or V1). IssuerSerial
 * is compared too; a mismatch there is a warning, as in DSS's default policy.
 */
async function identifySigningCertificate(
  signedSigProps: Element | undefined,
  candidates: readonly Certificate[],
): Promise<{ cert?: Certificate; error?: string; warnings: string[] }> {
  const warnings: string[] = [];
  const sc = child(signedSigProps, (e) => isXades(e, 'SigningCertificateV2')) ?? child(signedSigProps, (e) => isXades(e, 'SigningCertificate'));
  if (!sc) return { error: 'no SigningCertificate(V2) in SignedProperties', warnings };
  for (const certEl of childElements(sc).filter((e) => isXades(e, 'Cert'))) {
    const certDigest = child(certEl, (e) => isXades(e, 'CertDigest'));
    const hash = DIGEST_METHODS[child(certDigest, (e) => isDs(e, 'DigestMethod'))?.getAttribute('Algorithm') ?? ''];
    if (!hash) continue;
    let expected: Uint8Array;
    try {
      expected = base64Decode(textOf(child(certDigest, (e) => isDs(e, 'DigestValue'))));
    } catch {
      continue;
    }
    for (const cand of candidates) {
      if (!equalBytes(await digest(hash, cand.der), expected)) continue;
      const v2 = child(certEl, (e) => isXades(e, 'IssuerSerialV2'));
      const v1 = child(certEl, (e) => isXades(e, 'IssuerSerial'));
      if (v2 && !issuerSerialV2Matches(textOf(v2), cand)) warnings.push('IssuerSerialV2 does not match the signing certificate');
      if (v1 && integerHex(parseDer(derInteger(textOf(child(v1, (e) => isDs(e, 'X509SerialNumber'))).trim()))) !== cand.serialHex) {
        warnings.push('X509SerialNumber does not match the signing certificate');
      }
      return { cert: cand, warnings };
    }
  }
  return { error: 'no certificate matches the CertDigest in SigningCertificate(V2)', warnings };
}

function issuerSerialV2Matches(b64: string, cert: Certificate): boolean {
  try {
    // IssuerSerial ::= SEQUENCE { issuer GeneralNames, serialNumber INTEGER } (RFC 5035)
    const [generalNames, serial] = children(expect(parseDer(base64Decode(b64)), TAG.SEQUENCE, 'IssuerSerial'));
    const directoryName = children(expect(generalNames, TAG.SEQUENCE, 'GeneralNames')).find((g) => g.tag === 0xa4);
    if (!directoryName) return false;
    const [name] = children(directoryName);
    return sameName(name!.raw, cert.issuerDer) && integerHex(serial!) === cert.serialHex;
  } catch {
    return false;
  }
}

/** Decimal serial number (XML-DSig X509SerialNumber) to a DER INTEGER. */
function derInteger(decimal: string): Uint8Array {
  if (!/^\d+$/.test(decimal)) return Uint8Array.of(TAG.INTEGER, 1, 0);
  let n = BigInt(decimal);
  const bytes: number[] = [];
  do {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  } while (n > 0n);
  if (bytes[0]! & 0x80) bytes.unshift(0);
  return Uint8Array.of(TAG.INTEGER, bytes.length, ...bytes);
}

export { MSG };
