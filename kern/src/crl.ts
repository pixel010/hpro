/**
 * Certificate revocation lists (RFC 5280 §5) for the core's chain check (package P10).
 *
 * Validation stays offline: CRLs are inputs (embedded later in `xades:RevocationValues`, or
 * fetched beforehand with `fetchCrls`). A CRL is used for a certificate when its issuer name
 * equals the certificate's issuer, its signature verifies with the issuing certificate, and it
 * is not outdated at the validation time (`nextUpdate` not before it). Delta CRLs, indirect
 * CRLs, distribution-point scoping and OCSP are not supported (docs/13, open points).
 */
import { DerError, TAG, children, contextTag, expect, integerHex, oid, parseDer, time, type Der } from './der.js';
import { ContainerError } from './errors.js';
import { certSignatureAlgorithm, renderName, sameName, verifyWithCertificate, type Certificate } from './x509.js';

export interface Crl {
  readonly der: Uint8Array;
  readonly tbs: Uint8Array;
  readonly issuerDer: Uint8Array;
  readonly issuer: string;
  readonly thisUpdate: Date;
  readonly nextUpdate?: Date;
  /** Revoked serial numbers (hex of the DER INTEGER content) with revocation date. */
  readonly revoked: ReadonlyMap<string, Date>;
  readonly signatureAlgorithm: string;
  readonly signature: Uint8Array;
}

const isTime = (n: Der | undefined) => n !== undefined && (n.tag === TAG.UTC_TIME || n.tag === TAG.GENERALIZED_TIME);

export function parseCrl(der: Uint8Array): Crl {
  const [tbsNode, algNode, sigNode] = children(expect(parseDer(der), TAG.SEQUENCE, 'CertificateList'));
  const f = children(expect(tbsNode, TAG.SEQUENCE, 'TBSCertList'));
  let i = 0;
  if (f[i]?.tag === TAG.INTEGER) i++; // version v2
  i++; // signature AlgorithmIdentifier
  const issuer = expect(f[i++], TAG.SEQUENCE, 'issuer');
  const thisUpdate = time(f[i++]!);
  let nextUpdate: Date | undefined;
  if (isTime(f[i])) nextUpdate = time(f[i++]!);
  const revoked = new Map<string, Date>();
  if (f[i]?.tag === TAG.SEQUENCE) {
    for (const entry of children(f[i++]!)) {
      const [serial, date] = children(entry);
      revoked.set(integerHex(serial!), time(date!));
    }
  }
  for (const rest of f.slice(i)) if (contextTag(rest) !== 0) throw new DerError('unexpected field in TBSCertList');
  const bits = expect(sigNode, TAG.BIT_STRING, 'signatureValue').value;
  if (bits[0] !== 0) throw new DerError('CRL signature with unused bits');
  return {
    der,
    tbs: tbsNode!.raw,
    issuerDer: issuer.raw,
    issuer: renderName(issuer),
    thisUpdate,
    ...(nextUpdate ? { nextUpdate } : {}),
    revoked,
    signatureAlgorithm: oid(children(expect(algNode, TAG.SEQUENCE, 'signatureAlgorithm'))[0]!),
    signature: bits.subarray(1),
  };
}

/** True when `issuer` issued and signed this CRL. */
export async function crlIssuedBy(crl: Crl, issuer: Certificate): Promise<boolean> {
  if (!sameName(crl.issuerDer, issuer.subjectDer)) return false;
  const alg = certSignatureAlgorithm(crl.signatureAlgorithm);
  if (!alg) return false;
  try {
    return await verifyWithCertificate(issuer, alg, crl.signature, crl.tbs, 'der');
  } catch {
    return false;
  }
}

export type RevocationStatus = 'good' | 'revoked' | 'unknown';

export interface RevocationCheck {
  readonly subject: string;
  readonly status: RevocationStatus;
  readonly source?: string;
  readonly revokedAt?: string;
  readonly detail?: string;
}

/** Revocation status of `cert` (issued by `issuer`) at `at`, from the given CRLs. */
export async function revocationStatus(cert: Certificate, issuer: Certificate, crls: readonly Crl[], at: Date): Promise<RevocationCheck> {
  let outdated = false;
  for (const crl of crls) {
    if (!sameName(crl.issuerDer, cert.issuerDer)) continue;
    if (!(await crlIssuedBy(crl, issuer))) continue;
    if (crl.nextUpdate && crl.nextUpdate < at) {
      outdated = true;
      continue;
    }
    const source = `CRL ${crl.issuer}, thisUpdate ${crl.thisUpdate.toISOString()}`;
    const revokedAt = crl.revoked.get(cert.serialHex);
    if (revokedAt && revokedAt <= at) return { subject: cert.subject, status: 'revoked', source, revokedAt: revokedAt.toISOString() };
    return { subject: cert.subject, status: 'good', source };
  }
  return { subject: cert.subject, status: 'unknown', detail: outdated ? 'only outdated CRLs (nextUpdate before the validation time)' : 'no CRL from the issuer' };
}

export interface FetchedCrl {
  readonly url: string;
  readonly status: number | 'error';
  readonly bytes?: number;
  readonly crl?: Uint8Array;
  readonly error?: string;
}

/**
 * Downloads the CRLs named in the distribution points of `certs` (HTTP/HTTPS only). Network
 * access happens only here, never during validation. Accepts DER and PEM CRLs.
 */
export async function fetchCrls(certs: readonly Certificate[], options: { fetch?: typeof fetch; signal?: AbortSignal } = {}): Promise<FetchedCrl[]> {
  const doFetch = options.fetch ?? globalThis.fetch;
  if (typeof doFetch !== 'function') throw new ContainerError('signature', 'fetch is not available');
  const urls = [...new Set(certs.flatMap((c) => (c.crlDistributionPoints ?? []).filter((u) => /^https?:\/\//i.test(u))))];
  const out: FetchedCrl[] = [];
  for (const url of urls) {
    try {
      const r = await doFetch(url, options.signal ? { signal: options.signal } : {});
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (!r.ok) {
        out.push({ url, status: r.status, bytes: bytes.length });
        continue;
      }
      const der = pemOrDer(bytes);
      parseCrl(der);
      out.push({ url, status: r.status, bytes: bytes.length, crl: der });
    } catch (err) {
      out.push({ url, status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}

function pemOrDer(bytes: Uint8Array): Uint8Array {
  if (bytes[0] === 0x30) return bytes;
  const m = new TextDecoder().decode(bytes).match(/-----BEGIN X509 CRL-----([\s\S]*?)-----END X509 CRL-----/);
  if (!m) throw new DerError('neither DER nor PEM CRL');
  const bin = atob(m[1]!.replace(/\s+/g, ''));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Parses CRLs, skipping unreadable ones (reported by the caller if needed). */
export function parseCrls(ders: readonly Uint8Array[]): Crl[] {
  const out: Crl[] = [];
  for (const d of ders) {
    try {
      out.push(parseCrl(pemOrDer(d)));
    } catch {
      // ignored: an unreadable CRL is the same as a missing one
    }
  }
  return out;
}
