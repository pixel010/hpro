/**
 * Shared parts of XAdES and CAdES validation: certificate path, checks per building block
 * and the final indication.
 *
 * The order follows the basic validation process of ETSI EN 319 102-1 (5.3) as EU DSS
 * applies it with its default policy: format checks (FC), identification of the signing
 * certificate (ISC), X.509 certificate validation (XCV), cryptographic verification (CV),
 * signature acceptance (SAV). A failed CV (HASH_FAILURE, SIG_CRYPTO_FAILURE) dominates an
 * INDETERMINATE certificate result, as in DSS.
 */
import type { Indication, SubIndication } from './adapters/validator.js';
import { isIssuedBy, sameName, type Certificate, type HashName } from './x509.js';
import { equalBytes } from './bytes.js';

export async function digest(hash: HashName, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest(hash, new Uint8Array(data)));
}

export type ReferenceStatus = 'intact' | 'hash-failure' | 'not-found' | 'unsupported';

export interface ReferenceCheck {
  /** URI or name as written in the signature. */
  readonly uri: string;
  /** Container path for file references; undefined for same-document references. */
  readonly path?: string;
  readonly kind: 'file' | 'signed-properties' | 'asic-manifest';
  readonly digestAlgorithm: string;
  readonly status: ReferenceStatus;
  readonly detail?: string;
}

export interface CheckLog {
  readonly errors: string[];
  readonly warnings: string[];
  readonly infos: string[];
}

export function newLog(): CheckLog {
  return { errors: [], warnings: [], infos: [] };
}

export type ChainStatus = 'trusted' | 'no-chain' | 'no-revocation-data';

export interface ChainResult {
  readonly status: ChainStatus;
  /** Signing certificate first, trust anchor last (if found). */
  readonly path: readonly Certificate[];
}

/**
 * Builds a path from `leaf` to one of `anchors` using `pool` as intermediates.
 * Only the cryptographic link and names are checked; revocation is not (B level, offline).
 * A signing certificate that is itself a trust anchor needs no revocation data (as in DSS).
 */
export async function buildChain(leaf: Certificate, pool: readonly Certificate[], anchors: readonly Certificate[]): Promise<ChainResult> {
  const isAnchor = (c: Certificate) => anchors.some((a) => equalBytes(a.der, c.der));
  if (isAnchor(leaf)) return { status: 'trusted', path: [leaf] };
  const path: Certificate[] = [leaf];
  let current = leaf;
  for (let depth = 0; depth < 10; depth++) {
    const candidates = [...anchors, ...pool].filter((c) => !path.some((p) => equalBytes(p.der, c.der)) && sameName(current.issuerDer, c.subjectDer));
    let next: Certificate | undefined;
    for (const c of candidates) {
      if (await isIssuedBy(current, c)) {
        next = c;
        break;
      }
    }
    if (!next) return { status: 'no-chain', path };
    path.push(next);
    // Certificates below the anchor would need CRL/OCSP data, which a B-level check without
    // network access does not have.
    if (isAnchor(next)) return { status: 'no-revocation-data', path };
    current = next;
  }
  return { status: 'no-chain', path };
}

export interface BuildingBlocks {
  readonly fc: CheckLog;
  /** Set when the signing certificate could not be identified. */
  readonly iscError?: string;
  readonly references: readonly ReferenceCheck[];
  /** `undefined` if the signature value could not be checked (e.g. unsupported algorithm). */
  readonly signatureIntact: boolean | undefined;
  readonly chain?: ChainResult;
  readonly signingCertificate?: Certificate;
  readonly validationTime: Date;
  /** Algorithms below the accepted strength (e.g. SHA-1). */
  readonly weakAlgorithms: readonly string[];
  readonly unsupported: readonly string[];
}

export interface Verdict {
  readonly indication: Indication;
  readonly subIndication?: SubIndication;
}

/** Messages as worded by DSS where a DSS counterpart exists, so reports can be compared. */
export const MSG = {
  hashFailure: 'The reference data object is not intact!',
  notFound: 'The reference data object has not been found!',
  sigCrypto: 'The signature is not intact!',
  mimetype: 'The mimetype file content does not correspond to the expected value(s)!',
  notAllSigned: 'Not all files are signed!',
  noSigningCert: 'There is no candidate for the signing certificate!',
  noChain: 'The certificate chain for signature is not trusted, it does not contain a trust anchor.',
  noRevocation: 'No revocation data found for the certificate!',
  notConclusive: 'The certificate validation is not conclusive!',
  manifestAbsent: 'The manifest file is absent!',
  duplicateSignature: 'The signed file contains duplicate occurrences of the signature!',
  expired: 'The signing certificate has expired.',
  notYetValid: 'The signing certificate is not yet valid.',
} as const;

export function decide(b: BuildingBlocks): Verdict {
  if (b.fc.errors.length > 0) return { indication: 'TOTAL_FAILED', subIndication: 'FORMAT_FAILURE' };
  if (b.iscError !== undefined || !b.signingCertificate) return { indication: 'INDETERMINATE', subIndication: 'NO_SIGNING_CERTIFICATE_FOUND' };
  if (b.references.some((r) => r.status === 'not-found')) return { indication: 'INDETERMINATE', subIndication: 'SIGNED_DATA_NOT_FOUND' };
  if (b.references.some((r) => r.status === 'hash-failure')) return { indication: 'TOTAL_FAILED', subIndication: 'HASH_FAILURE' };
  if (b.signatureIntact === false) return { indication: 'TOTAL_FAILED', subIndication: 'SIG_CRYPTO_FAILURE' };
  if (b.unsupported.length > 0 || b.signatureIntact === undefined) return { indication: 'INDETERMINATE' };
  const cert = b.signingCertificate;
  if (b.chain?.status === 'no-chain') return { indication: 'INDETERMINATE', subIndication: 'NO_CERTIFICATE_CHAIN_FOUND' };
  if (b.validationTime > cert.notAfter) return { indication: 'INDETERMINATE', subIndication: 'OUT_OF_BOUNDS_NO_POE' };
  if (b.validationTime < cert.notBefore) return { indication: 'INDETERMINATE', subIndication: 'NOT_YET_VALID' };
  // DSS 6.5 reports a missing CRL/OCSP for a certificate below the anchor this way (case N2).
  if (b.chain?.status === 'no-revocation-data') return { indication: 'INDETERMINATE', subIndication: 'CERTIFICATE_CHAIN_GENERAL_FAILURE' };
  if (b.weakAlgorithms.length > 0) return { indication: 'INDETERMINATE', subIndication: 'CRYPTO_CONSTRAINTS_FAILURE_NO_POE' };
  return { indication: 'TOTAL_PASSED' };
}

/** Collects the human-readable errors that belong to a verdict. */
export function verdictMessages(b: BuildingBlocks, log: CheckLog): void {
  if (b.iscError !== undefined) log.errors.push(`${MSG.noSigningCert} (${b.iscError})`);
  for (const r of b.references) {
    if (r.status === 'hash-failure') log.errors.push(`${MSG.hashFailure} [${r.path ?? r.uri}]`);
    if (r.status === 'not-found') log.errors.push(`${MSG.notFound} [${r.path ?? r.uri}]`);
    if (r.status === 'unsupported') log.errors.push(`unsupported reference [${r.uri}]: ${r.detail ?? ''}`);
  }
  if (b.signatureIntact === false) log.errors.push(MSG.sigCrypto);
  for (const u of b.unsupported) log.errors.push(`unsupported: ${u}`);
  if (b.chain?.status === 'no-chain') log.errors.push(MSG.noChain);
  if (b.chain?.status === 'no-revocation-data') log.errors.push(MSG.notConclusive, MSG.noRevocation);
  if (b.signingCertificate && b.validationTime > b.signingCertificate.notAfter) log.errors.push(MSG.expired);
  if (b.signingCertificate && b.validationTime < b.signingCertificate.notBefore) log.errors.push(MSG.notYetValid);
  for (const w of b.weakAlgorithms) log.errors.push(`algorithm not accepted by policy: ${w}`);
}

/** Paths are stored percent-encoded in signatures; anything that could escape the container is rejected. */
export function referenceToPath(uri: string): string | undefined {
  let path: string;
  try {
    path = decodeURIComponent(uri);
  } catch {
    return undefined;
  }
  if (path.startsWith('./')) path = path.slice(2);
  if (path === '' || path.startsWith('/') || path.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(path)) return undefined;
  if (path.split('/').some((s) => s === '..' || s === '.')) return undefined;
  return path;
}
