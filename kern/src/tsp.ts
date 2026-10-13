/**
 * RFC 3161 time-stamps (Time-Stamp Protocol, updated by RFC 5816) in the core (package P10).
 *
 * - `encodeTimeStampRequest` builds a `TimeStampReq` over a message imprint (hash only; the
 *   document never leaves the device),
 * - `parseTimeStampResponse` reads a `TimeStampResp` and its status,
 * - `verifyTimeStampToken` checks a token offline: CMS signature over the signed attributes,
 *   `messageDigest` over the `TSTInfo`, signing certificate (ESS v1/v2), extended key usage
 *   `timeStamping` (RFC 3161 §2.3), `genTime` within the TSA certificate, message imprint and
 *   nonce, and the certificate path to the given trust anchors,
 * - `HttpTimestampAuthority` is the `TimestampAuthority` adapter for any RFC 3161 service over
 *   HTTP (`application/timestamp-query`, RFC 3161 §3.4) using the web-standard `fetch`.
 *
 * Revocation of the TSA chain is checked with CRLs passed in (`crl.ts`); without them, or
 * with OCSP only, a chain that ends below a trust anchor is INDETERMINATE, as EU DSS reports
 * it without revocation data.
 */
import type { Availability } from './adapters/common.js';
import type { TimestampAuthority, TimestampRequest, TimestampResult } from './adapters/timestamp.js';
import { equalBytes, toHex } from './bytes.js';
import { DIGEST_OIDS, OIDS as CMS_OIDS, attributes, parseSignedData, signatureSpec } from './cades.js';
import { DerError, TAG, children, contextTag, expect, integerHex, oid, parseDer, time, type Der } from './der.js';
import * as w from './der-write.js';
import { ContainerError } from './errors.js';
import type { Crl } from './crl.js';
import { buildChain, digest } from './sigcommon.js';
import { OID, UnsupportedAlgorithmError, renderName, sameName, verifyWithCertificate, type Certificate, type HashName } from './x509.js';

export const TSP_OIDS = {
  tstInfo: '1.2.840.113549.1.9.16.1.4',
  timeStamping: OID.kpTimeStamping,
} as const;

/** Hash algorithms accepted for message imprints (RFC 5754 OIDs). */
export const HASH_OIDS: Record<'SHA-256' | 'SHA-384' | 'SHA-512', string> = {
  'SHA-256': '2.16.840.1.101.3.4.2.1',
  'SHA-384': '2.16.840.1.101.3.4.2.2',
  'SHA-512': '2.16.840.1.101.3.4.2.3',
};

export type ImprintHash = keyof typeof HASH_OIDS;

const HASH_LENGTH: Record<ImprintHash, number> = { 'SHA-256': 32, 'SHA-384': 48, 'SHA-512': 64 };

/** PKIStatus values (RFC 3161 §2.4.2). */
export const PKI_STATUS = ['granted', 'grantedWithMods', 'rejection', 'waiting', 'revocationWarning', 'revocationNotification'] as const;

/** PKIFailureInfo bit names (RFC 3161 §2.4.2). */
const FAILURE_BITS: Record<number, string> = {
  0: 'badAlg',
  2: 'badRequest',
  5: 'badDataFormat',
  14: 'timeNotAvailable',
  15: 'unacceptedPolicy',
  16: 'unacceptedExtension',
  17: 'addInfoNotAvailable',
  25: 'systemFailure',
};

function fail(message: string): never {
  throw new ContainerError('timestamp', message);
}

// --- Request --------------------------------------------------------------------------

export interface TimeStampRequestOptions {
  readonly hashAlgorithm: ImprintHash;
  /** Default: 8 random octets. Pass `null` to send no nonce. */
  readonly nonce?: Uint8Array | null;
  /** Ask the TSA to include its certificate in the token (default true). */
  readonly certReq?: boolean;
  /** `reqPolicy` OID, if the TSA offers several policies. */
  readonly policy?: string;
}

export interface EncodedTimeStampRequest {
  readonly der: Uint8Array;
  /** Nonce as unsigned big-endian hex without leading zeros, if sent. */
  readonly nonceHex?: string;
}

const algorithmIdentifier = (hash: ImprintHash) => w.sequence(w.objectIdentifier(HASH_OIDS[hash]));

/** `TimeStampReq` (RFC 3161 §2.4.1) for the given message imprint. */
export function encodeTimeStampRequest(hashedMessage: Uint8Array, options: TimeStampRequestOptions): EncodedTimeStampRequest {
  if (hashedMessage.length !== HASH_LENGTH[options.hashAlgorithm]) fail(`message imprint has ${hashedMessage.length} octets, ${options.hashAlgorithm} needs ${HASH_LENGTH[options.hashAlgorithm]}`);
  const nonce = options.nonce === null ? undefined : (options.nonce ?? crypto.getRandomValues(new Uint8Array(8)));
  const parts: Uint8Array[] = [w.smallInteger(1), w.sequence(algorithmIdentifier(options.hashAlgorithm), w.octetString(hashedMessage))];
  if (options.policy) parts.push(w.objectIdentifier(options.policy));
  if (nonce) parts.push(w.unsignedInteger(nonce));
  if (options.certReq ?? true) parts.push(w.boolean(true));
  return { der: w.sequence(...parts), ...(nonce ? { nonceHex: normalizeHex(toHex(nonce)) } : {}) };
}

const normalizeHex = (hex: string) => hex.replace(/^0+(?=.)/, '').toLowerCase();

// --- Response -------------------------------------------------------------------------

export interface ParsedTimeStampResponse {
  readonly status: number;
  readonly statusName: string;
  readonly statusText: readonly string[];
  readonly failInfo: readonly string[];
  /** DER `ContentInfo` of the token, present for granted / grantedWithMods. */
  readonly token?: Uint8Array;
}

/** `TimeStampResp` (RFC 3161 §2.4.2). Throws ContainerError('timestamp') on malformed input. */
export function parseTimeStampResponse(bytes: Uint8Array): ParsedTimeStampResponse {
  try {
    const [statusInfo, token] = children(expect(parseDer(bytes), TAG.SEQUENCE, 'TimeStampResp'));
    const parts = children(expect(statusInfo, TAG.SEQUENCE, 'PKIStatusInfo'));
    const statusValue = expect(parts[0], TAG.INTEGER, 'PKIStatus').value;
    const status = statusValue.length === 1 ? statusValue[0]! : -1;
    const statusText: string[] = [];
    const failInfo: string[] = [];
    for (const p of parts.slice(1)) {
      if (p.tag === TAG.SEQUENCE) for (const s of children(p)) statusText.push(new TextDecoder().decode(s.value));
      else if (p.tag === TAG.BIT_STRING) {
        const bits = p.value.subarray(1);
        for (let b = 0; b < bits.length * 8; b++) if (bits[b >> 3]! & (0x80 >> (b & 7))) failInfo.push(FAILURE_BITS[b] ?? `bit${b}`);
      }
    }
    return { status, statusName: PKI_STATUS[status] ?? `unknown(${status})`, statusText, failInfo, ...(token ? { token: token.raw } : {}) };
  } catch (err) {
    if (err instanceof DerError) fail(`TimeStampResp is not valid DER: ${err.message}`);
    throw err;
  }
}

// --- Token ----------------------------------------------------------------------------

export interface TstInfo {
  readonly version: number;
  readonly policy: string;
  readonly hashAlgorithm: string;
  readonly hashName: HashName | undefined;
  readonly hashedMessage: Uint8Array;
  readonly serialHex: string;
  readonly genTime: Date;
  /** genTime exactly as encoded. */
  readonly genTimeText: string;
  readonly accuracy?: { readonly seconds: number; readonly millis: number; readonly micros: number };
  readonly ordering: boolean;
  readonly nonceHex?: string;
  /** TSA name from the `tsa` field, if present. */
  readonly tsaName?: string;
}

function smallInt(node: Der): number {
  let n = 0;
  for (const b of node.value) n = n * 256 + b;
  return n;
}

/** `TSTInfo` (RFC 3161 §2.4.2). */
export function parseTstInfo(der: Uint8Array): TstInfo {
  const f = children(expect(parseDer(der), TAG.SEQUENCE, 'TSTInfo'));
  let i = 0;
  const version = smallInt(expect(f[i++], TAG.INTEGER, 'version'));
  const policy = oid(expect(f[i++], TAG.OID, 'policy'));
  const [algId, hashed] = children(expect(f[i++], TAG.SEQUENCE, 'messageImprint'));
  const hashAlgorithm = oid(children(expect(algId, TAG.SEQUENCE, 'hashAlgorithm'))[0]!);
  const hashedMessage = expect(hashed, TAG.OCTET_STRING, 'hashedMessage').value;
  const serialHex = integerHex(expect(f[i++], TAG.INTEGER, 'serialNumber'));
  const genTimeNode = expect(f[i++], TAG.GENERALIZED_TIME, 'genTime');
  const genTime = time(genTimeNode);
  let accuracy: TstInfo['accuracy'];
  let ordering = false;
  let nonceHex: string | undefined;
  let tsaName: string | undefined;
  for (const node of f.slice(i)) {
    if (node.tag === TAG.SEQUENCE) {
      const acc = { seconds: 0, millis: 0, micros: 0 };
      for (const a of children(node)) {
        if (a.tag === TAG.INTEGER) acc.seconds = smallInt(a);
        else if (a.tag === 0x80) acc.millis = smallInt(a);
        else if (a.tag === 0x81) acc.micros = smallInt(a);
      }
      accuracy = acc;
    } else if (node.tag === TAG.BOOLEAN) ordering = node.value[0] !== 0;
    else if (node.tag === TAG.INTEGER) nonceHex = normalizeHex(integerHex(node));
    else if (contextTag(node) === 0) {
      const gn = children(node)[0];
      tsaName = gn && gn.tag === 0xa4 ? renderName(children(gn)[0]!) : gn ? `[${gn.tag & 0x1f}] ${new TextDecoder().decode(gn.value)}` : undefined;
    }
  }
  return {
    version,
    policy,
    hashAlgorithm,
    hashName: DIGEST_OIDS[hashAlgorithm],
    hashedMessage,
    serialHex,
    genTime,
    genTimeText: new TextDecoder().decode(genTimeNode.value),
    ...(accuracy ? { accuracy } : {}),
    ordering,
    ...(nonceHex ? { nonceHex } : {}),
    ...(tsaName ? { tsaName } : {}),
  };
}

export type TimestampIndication = 'PASSED' | 'FAILED' | 'INDETERMINATE';

export interface TimestampVerification {
  readonly indication: TimestampIndication;
  readonly subIndication?: string;
  readonly tstInfo?: TstInfo;
  readonly tsaCertificate?: Certificate;
  /** Subjects from the TSA certificate up to the trust anchor. */
  readonly chain: readonly string[];
  readonly messageImprint: 'match' | 'mismatch' | 'not-checked';
  readonly signatureIntact: boolean | undefined;
  readonly signatureAlgorithm: string;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly infos: readonly string[];
}

export interface VerifyTimeStampOptions {
  /** Expected message imprint (hash of the time-stamped data, with the token's algorithm). */
  readonly digest?: Uint8Array;
  /** Alternatively the data itself; it is hashed with the token's imprint algorithm. */
  readonly data?: Uint8Array;
  readonly trustAnchors?: readonly Certificate[];
  /** Certificates to look for the TSA certificate when the token carries none (certReq false). */
  readonly extraCertificates?: readonly Certificate[];
  /** Nonce sent in the request (hex), checked when given. */
  readonly expectedNonceHex?: string;
  /** CRLs for the TSA chain (parsed); without them a chain below the anchor stays INDETERMINATE. */
  readonly crls?: readonly Crl[];
  /** Time of the revocation check, default now. */
  readonly validationTime?: Date;
}

/**
 * Verifies an RFC 3161 time-stamp token (DER `ContentInfo`) offline. The verdict uses the
 * ETSI EN 319 102-1 vocabulary for time-stamps (PASSED / FAILED / INDETERMINATE).
 */
export async function verifyTimeStampToken(token: Uint8Array, options: VerifyTimeStampOptions = {}): Promise<TimestampVerification> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const infos: string[] = [];
  const unsupported: string[] = [];
  const result = (indication: TimestampIndication, subIndication: string | undefined, extra: Partial<TimestampVerification>): TimestampVerification => ({
    indication,
    ...(subIndication ? { subIndication } : {}),
    chain: [],
    messageImprint: 'not-checked',
    signatureIntact: undefined,
    signatureAlgorithm: '',
    errors,
    warnings,
    infos,
    ...extra,
  });

  let sd;
  let tst: TstInfo;
  try {
    sd = parseSignedData(token);
    if (sd.eContentType !== TSP_OIDS.tstInfo) throw new DerError(`eContentType ${sd.eContentType} is not id-ct-TSTInfo`);
    if (!sd.eContent) throw new DerError('TSTInfo missing (no eContent)');
    tst = parseTstInfo(sd.eContent);
  } catch (err) {
    if (!(err instanceof DerError)) throw err;
    errors.push(`time-stamp token structure: ${err.message}`);
    return result('FAILED', 'FORMAT_FAILURE', {});
  }
  if (sd.signers.length !== 1) errors.push(`expected one SignerInfo, found ${sd.signers.length}`);
  if (tst.version !== 1) errors.push(`TSTInfo version ${tst.version}, expected 1`);
  const si = sd.signers[0];
  if (!si || errors.length > 0) return result('FAILED', 'FORMAT_FAILURE', { tstInfo: tst });
  const signatureAlgorithm = si.signatureAlgOid;

  // Message imprint against the time-stamped data.
  let messageImprint: TimestampVerification['messageImprint'] = 'not-checked';
  if (!tst.hashName) unsupported.push(`message imprint algorithm ${tst.hashAlgorithm}`);
  else if (options.digest || options.data) {
    const expected = options.digest ?? (await digest(tst.hashName, options.data!));
    messageImprint = equalBytes(expected, tst.hashedMessage) ? 'match' : 'mismatch';
    if (messageImprint === 'mismatch') errors.push('The message imprint of the time-stamp does not match the time-stamped data.');
  }
  if (tst.hashName === 'SHA-1') warnings.push('message imprint uses SHA-1');
  if (options.expectedNonceHex !== undefined && normalizeHex(options.expectedNonceHex) !== tst.nonceHex) errors.push(`nonce in TSTInfo (${tst.nonceHex ?? 'none'}) differs from the request (${options.expectedNonceHex})`);

  // Signed attributes: content type and message digest over the TSTInfo.
  const attrs = attributes(si.signedAttrs);
  if (!si.signedAttrs) errors.push('signed attributes missing');
  const ct = attrs.get(CMS_OIDS.contentType)?.[0];
  if (!ct || oid(ct) !== TSP_OIDS.tstInfo) errors.push('content-type attribute is not id-ct-TSTInfo');
  const md = attrs.get(CMS_OIDS.messageDigest)?.[0];
  let contentIntact = false;
  if (!si.digestHash) unsupported.push(`digest algorithm ${si.digestOid}`);
  else if (md) contentIntact = equalBytes(await digest(si.digestHash, sd.eContent!), expect(md, TAG.OCTET_STRING, 'messageDigest').value);
  if (si.digestHash && !contentIntact) errors.push('messageDigest does not match the TSTInfo');

  // TSA certificate: ESS signing-certificate(-v2), cross-checked with the sid.
  const pool = [...sd.certs, ...(options.extraCertificates ?? [])];
  let tsaCertificate: Certificate | undefined;
  const essV2 = attrs.get(CMS_OIDS.signingCertificateV2)?.[0];
  const essV1 = attrs.get(CMS_OIDS.signingCertificate)?.[0];
  const ess = essV2 ?? essV1;
  if (ess) {
    const [first] = children(children(ess)[0]!);
    const fields = children(first!);
    let hash: HashName | undefined = essV2 ? 'SHA-256' : 'SHA-1';
    let k = 0;
    if (essV2 && fields[0]?.tag === TAG.SEQUENCE) hash = DIGEST_OIDS[oid(children(fields[k++]!)[0]!)];
    const certHash = expect(fields[k], TAG.OCTET_STRING, 'certHash').value;
    for (const cand of pool) if (hash && equalBytes(await digest(hash, cand.der), certHash)) tsaCertificate ??= cand;
  } else {
    // RFC 3161 §2.4.1 / RFC 5816 require ESSCertID(v2); fall back to the sid only to report it.
    errors.push('ESS signing-certificate attribute missing (RFC 3161 §2.4.1, RFC 5816)');
  }
  if (tsaCertificate && si.issuerDer && (!sameName(si.issuerDer, tsaCertificate.issuerDer) || si.serialHex !== tsaCertificate.serialHex)) warnings.push('SignerInfo sid does not match the ESS certificate');
  if (!tsaCertificate) {
    return result(errors.length > 0 ? 'FAILED' : 'INDETERMINATE', errors.length > 0 ? 'FORMAT_FAILURE' : 'NO_SIGNING_CERTIFICATE_FOUND', { tstInfo: tst, messageImprint, signatureAlgorithm });
  }

  // Signature over the DER of the signed attributes with explicit SET OF tag (RFC 5652, 5.4).
  let signatureIntact: boolean | undefined;
  const spec = signatureSpec(si);
  if (!spec) unsupported.push(`signature algorithm ${si.signatureAlgOid}`);
  else if (si.signedAttrs) {
    const tbs = new Uint8Array(si.signedAttrs.raw);
    tbs[0] = TAG.SET;
    try {
      signatureIntact = await verifyWithCertificate(tsaCertificate, spec, si.signature, tbs, 'der');
    } catch (err) {
      if (err instanceof UnsupportedAlgorithmError) unsupported.push(err.message);
      else throw err;
    }
  }
  if (signatureIntact === false) errors.push('The time-stamp signature is not intact.');
  if (spec?.hash === 'SHA-1' || si.digestHash === 'SHA-1') warnings.push('time-stamp signature uses SHA-1');

  // TSA certificate constraints (RFC 3161 §2.3).
  const eku = tsaCertificate.extendedKeyUsage;
  const constraintErrors: string[] = [];
  if (!eku || !eku.includes(TSP_OIDS.timeStamping)) constraintErrors.push('TSA certificate lacks extended key usage id-kp-timeStamping (RFC 3161 §2.3)');
  else {
    if (eku.length !== 1) warnings.push(`TSA certificate has further extended key usages: ${eku.filter((e) => e !== TSP_OIDS.timeStamping).join(', ')}`);
    if (!tsaCertificate.extendedKeyUsageCritical) warnings.push('extended key usage of the TSA certificate is not marked critical (RFC 3161 §2.3)');
  }
  const outOfBounds = tst.genTime < tsaCertificate.notBefore || tst.genTime > tsaCertificate.notAfter;
  if (outOfBounds) constraintErrors.push(`genTime ${tst.genTime.toISOString()} lies outside the TSA certificate validity`);
  errors.push(...constraintErrors);
  for (const u of unsupported) errors.push(`unsupported: ${u}`);

  const chain = await buildChain(tsaCertificate, pool, options.trustAnchors ?? [], options.crls ? { crls: options.crls, time: options.validationTime ?? new Date() } : undefined);
  const extra = { tstInfo: tst, tsaCertificate, chain: chain.path.map((c) => c.subject), messageImprint, signatureIntact, signatureAlgorithm };

  if (messageImprint === 'mismatch' || (!contentIntact && si.digestHash)) return result('FAILED', 'HASH_FAILURE', extra);
  if (signatureIntact === false) return result('FAILED', 'SIG_CRYPTO_FAILURE', extra);
  if (errors.length > constraintErrors.length + unsupported.length) return result('FAILED', 'FORMAT_FAILURE', extra);
  if (unsupported.length > 0 || signatureIntact === undefined) return result('INDETERMINATE', undefined, extra);
  if (constraintErrors.length > 0) return result('INDETERMINATE', outOfBounds ? 'OUT_OF_BOUNDS_NO_POE' : 'CHAIN_CONSTRAINTS_FAILURE', extra);
  if (chain.status === 'no-chain') {
    errors.push('The certificate chain of the time-stamp is not trusted, it does not contain a trust anchor.');
    return result('INDETERMINATE', 'NO_CERTIFICATE_CHAIN_FOUND', extra);
  }
  if (chain.status === 'revoked') {
    errors.push(...(chain.revocation ?? []).filter((r) => r.status === 'revoked').map((r) => `certificate revoked: ${r.subject} (${r.revokedAt})`));
    return result('INDETERMINATE', 'REVOKED_NO_POE', extra);
  }
  if (chain.status === 'no-revocation-data') {
    const missing = (chain.revocation ?? []).filter((r) => r.status === 'unknown').map((r) => `${r.subject}: ${r.detail}`);
    errors.push(`No revocation data for the TSA chain${missing.length ? ': ' + missing.join('; ') : ' (no CRLs given; OCSP is not supported)'}.`);
    return result('INDETERMINATE', 'CERTIFICATE_CHAIN_GENERAL_FAILURE', extra);
  }
  for (const r of chain.revocation ?? []) infos.push(`revocation: ${r.subject} not revoked (${r.source})`);
  if (messageImprint === 'not-checked') warnings.push('message imprint not checked (no data given)');
  return result('PASSED', undefined, extra);
}

// --- HTTP adapter ---------------------------------------------------------------------

export interface HttpTimestampAuthorityOptions {
  /** Default `globalThis.fetch`. */
  readonly fetch?: typeof fetch;
  readonly headers?: Readonly<Record<string, string>>;
  readonly policy?: string;
  /** Default true: the token carries the TSA certificate, so it verifies offline later. */
  readonly certReq?: boolean;
  /** Shown in reports; default: the URL host. */
  readonly name?: string;
}

/**
 * `TimestampAuthority` for RFC 3161 over HTTP (§3.4). Sends only the message imprint and a
 * nonce; checks status, nonce and imprint of the answer and the token's signature before
 * returning it, so a broken or foreign token never ends up in a document.
 */
export class HttpTimestampAuthority implements TimestampAuthority {
  readonly info;
  readonly url: string;
  readonly #options: HttpTimestampAuthorityOptions;

  constructor(url: string, options: HttpTimestampAuthorityOptions = {}) {
    this.url = url;
    this.#options = options;
    this.info = { name: `HttpTimestampAuthority (${options.name ?? safeHost(url)})`, version: '0.1.0', location: 'remote-service' as const };
  }

  async availability(): Promise<Availability> {
    return typeof (this.#options.fetch ?? globalThis.fetch) === 'function'
      ? { available: true }
      : { available: false, reason: 'fetch is not available in this environment', fallback: 'time-stamp later with `hpro timestamp`' };
  }

  async timestamp(request: TimestampRequest): Promise<TimestampResult> {
    request.signal?.throwIfAborted();
    const req = encodeTimeStampRequest(request.digest, { hashAlgorithm: request.hashAlgorithm, ...(this.#options.policy ? { policy: this.#options.policy } : {}), certReq: this.#options.certReq ?? true });
    const doFetch = this.#options.fetch ?? globalThis.fetch;
    const started = Date.now();
    let response: Response;
    try {
      response = await doFetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/timestamp-query', Accept: 'application/timestamp-reply', ...this.#options.headers },
        body: new Uint8Array(req.der),
        ...(request.signal ? { signal: request.signal } : {}),
      });
    } catch (err) {
      fail(`TSA ${this.url} not reachable: ${err instanceof Error ? err.message : String(err)}`);
    }
    const body = new Uint8Array(await response.arrayBuffer());
    if (!response.ok) fail(`TSA ${this.url} answered HTTP ${response.status}`);
    const type = response.headers.get('content-type') ?? '';
    const parsed = parseTimeStampResponse(body);
    if (parsed.status !== 0 && parsed.status !== 1) fail(`TSA refused: ${parsed.statusName}${parsed.failInfo.length ? ' [' + parsed.failInfo.join(', ') + ']' : ''}${parsed.statusText.length ? ' ' + parsed.statusText.join('; ') : ''}`);
    if (!parsed.token) fail('TSA granted the request but sent no token');
    const check = await verifyTimeStampToken(parsed.token, { digest: request.digest, ...(req.nonceHex ? { expectedNonceHex: req.nonceHex } : {}) });
    if (check.messageImprint !== 'match' || check.signatureIntact !== true || check.indication === 'FAILED') {
      fail(`TSA token rejected: ${check.indication}${check.subIndication ? '/' + check.subIndication : ''} ${check.errors.join('; ')}`);
    }
    return {
      token: parsed.token,
      response: body,
      genTime: check.tstInfo!.genTime.toISOString(),
      serialNumber: check.tstInfo!.serialHex,
      tsaSubject: check.tsaCertificate?.subject ?? check.tstInfo!.tsaName ?? '',
      elapsedMs: Date.now() - started,
      ...(type ? { contentType: type } : {}),
    };
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Token or response from a file: accepts a DER `TimeStampResp` as well as a bare token. */
export function tokenFromFile(bytes: Uint8Array): Uint8Array {
  try {
    const parsed = parseTimeStampResponse(bytes);
    if (parsed.token) return parsed.token;
  } catch {
    // not a TimeStampResp; try as token
  }
  parseSignedData(bytes);
  return bytes;
}
