/**
 * `SoftwareKeySigner`: signs with a private key held in WebCrypto (docs/06, 4.1 and 2.3,
 * "Software-Zertifikat": AdES, available on every platform, weak key protection).
 *
 * Plus `createTestIdentity`: a fresh key pair and a self-signed test certificate, built with
 * WebCrypto and the core's DER writer, so that signing needs neither Java nor OpenSSL.
 * Test certificates are NOT qualified and carry no trust; validators must be given them as
 * trust anchor explicitly (as the prototype did with signer.pem, docs/05, section 2).
 *
 * Not supported: PKCS#12 import (WebCrypto has no PKCS#12 parser; a PKCS#8 key plus PEM
 * certificate is required), RSA-PSS (the core's validator does not check it yet).
 */
import type { Availability } from './adapters/common.js';
import type { DigestSignRequest, SignatureAlgorithm, Signer, SigningKey } from './adapters/signer.js';
import { equalBytes, toBase64, utf8 } from './bytes.js';
import { children, bitStringBytes, parseDer } from './der.js';
import * as w from './der-write.js';
import { ContainerError } from './errors.js';
import { OID, base64Decode, parseCertificate, verifyWithCertificate, type Certificate } from './x509.js';

export const SOFTWARE_SIGNER_VERSION = '0.1.0';

interface WebCryptoAlgorithm {
  readonly importParams: RsaHashedImportParams | EcKeyImportParams;
  readonly signParams: AlgorithmIdentifier | EcdsaParams;
  readonly hash: 'SHA-256' | 'SHA-384';
}

const WEBCRYPTO: Partial<Record<SignatureAlgorithm, WebCryptoAlgorithm>> = {
  'RSASSA-PKCS1-v1_5-SHA256': {
    importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    signParams: { name: 'RSASSA-PKCS1-v1_5' },
    hash: 'SHA-256',
  },
  'ECDSA-P256-SHA256': { importParams: { name: 'ECDSA', namedCurve: 'P-256' }, signParams: { name: 'ECDSA', hash: 'SHA-256' }, hash: 'SHA-256' },
  'ECDSA-P384-SHA384': { importParams: { name: 'ECDSA', namedCurve: 'P-384' }, signParams: { name: 'ECDSA', hash: 'SHA-384' }, hash: 'SHA-384' },
};

/** The one algorithm a certificate's key is used with by this signer. */
export function algorithmForCertificate(cert: Certificate): SignatureAlgorithm {
  if (cert.keyAlgorithm === OID.rsaEncryption) return 'RSASSA-PKCS1-v1_5-SHA256';
  if (cert.keyAlgorithm === OID.ecPublicKey && cert.curve === OID.p256) return 'ECDSA-P256-SHA256';
  if (cert.keyAlgorithm === OID.ecPublicKey && cert.curve === OID.p384) return 'ECDSA-P384-SHA384';
  throw new ContainerError('signature', `unsupported key in signing certificate (algorithm ${cert.keyAlgorithm}, curve ${cert.curve ?? '-'})`);
}

function specFor(algorithm: SignatureAlgorithm): WebCryptoAlgorithm {
  const spec = WEBCRYPTO[algorithm];
  if (!spec) throw new ContainerError('signature', `signature algorithm ${algorithm} is not supported by the software signer`);
  return spec;
}

export interface SoftwareKeyOptions {
  /** DER certificates, signing certificate first. */
  readonly certificateChain: readonly Uint8Array[];
  readonly label?: string;
  readonly keyId?: string;
}

export class SoftwareKeySigner implements Signer {
  readonly kind = 'software-key' as const;
  readonly info = { name: 'SoftwareKeySigner', version: SOFTWARE_SIGNER_VERSION, location: 'device' as const };
  readonly #key: CryptoKey;
  readonly #signingKey: SigningKey;

  private constructor(key: CryptoKey, signingKey: SigningKey) {
    this.#key = key;
    this.#signingKey = signingKey;
  }

  /**
   * Imports an unencrypted PKCS#8 private key (DER) as non-extractable WebCrypto key and checks
   * that it belongs to the signing certificate (probe signature verified with the certificate).
   */
  static async fromPkcs8(pkcs8: Uint8Array, options: SoftwareKeyOptions): Promise<SoftwareKeySigner> {
    const cert = SoftwareKeySigner.#leaf(options);
    const algorithm = algorithmForCertificate(cert);
    let key: CryptoKey;
    try {
      key = await crypto.subtle.importKey('pkcs8', new Uint8Array(pkcs8), specFor(algorithm).importParams, false, ['sign']);
    } catch (err) {
      throw new ContainerError('signature', `private key cannot be imported as ${algorithm}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return SoftwareKeySigner.fromCryptoKey(key, options);
  }

  /** Uses an existing WebCrypto private key (e.g. kept in IndexedDB, docs/06 `SecretStore`). */
  static async fromCryptoKey(key: CryptoKey, options: SoftwareKeyOptions): Promise<SoftwareKeySigner> {
    const cert = SoftwareKeySigner.#leaf(options);
    const algorithm = algorithmForCertificate(cert);
    if (key.type !== 'private' || !key.usages.includes('sign')) throw new ContainerError('signature', 'key must be a private key with usage "sign"');
    const spec = specFor(algorithm);
    const probe = utf8('html-Pro key/certificate check');
    let matches = false;
    try {
      const sig = new Uint8Array(await crypto.subtle.sign(spec.signParams, key, probe));
      matches = await verifyWithCertificate(cert, { key: algorithm.startsWith('RSA') ? 'RSA' : 'EC', hash: spec.hash }, sig, probe, 'raw');
    } catch {
      matches = false;
    }
    if (!matches) throw new ContainerError('signature', 'private key does not belong to the signing certificate');
    return new SoftwareKeySigner(key, {
      keyId: options.keyId ?? 'software-key',
      label: options.label ?? cert.subject,
      certificateChain: options.certificateChain.map((c) => new Uint8Array(c)),
      algorithms: [algorithm],
      qualified: false,
      requiresAuthorisationPerSignature: false,
    });
  }

  static #leaf(options: SoftwareKeyOptions): Certificate {
    const first = options.certificateChain[0];
    if (!first) throw new ContainerError('signature', 'certificate chain is empty');
    return parseCertificate(first);
  }

  async availability(): Promise<Availability> {
    return typeof crypto !== 'undefined' && !!crypto.subtle
      ? { available: true }
      : { available: false, reason: 'WebCrypto (crypto.subtle) is not available; it requires a secure context.', fallback: 'RemoteCscSigner' };
  }

  async listKeys(): Promise<readonly SigningKey[]> {
    return [this.#signingKey];
  }

  async signDigest(request: DigestSignRequest): Promise<Uint8Array> {
    request.signal?.throwIfAborted();
    if (request.keyId !== this.#signingKey.keyId) throw new ContainerError('signature', `unknown key ${request.keyId}`);
    if (!this.#signingKey.algorithms.includes(request.algorithm)) throw new ContainerError('signature', `key does not support ${request.algorithm}`);
    const spec = specFor(request.algorithm);
    // WebCrypto hashes internally and cannot sign a precomputed digest. It signs `data`;
    // the digest must match it, so that what the caller authorised is what gets signed.
    if (request.digestAlgorithm !== spec.hash) throw new ContainerError('signature', `${request.algorithm} needs digest ${spec.hash}, got ${request.digestAlgorithm}`);
    const actual = new Uint8Array(await crypto.subtle.digest(spec.hash, new Uint8Array(request.data)));
    if (!equalBytes(actual, request.digest)) throw new ContainerError('signature', 'digest does not match the data to be signed');
    const value = new Uint8Array(await crypto.subtle.sign(spec.signParams, this.#key, new Uint8Array(request.data)));
    request.onProgress?.(1);
    return value;
  }
}

// --- Test identities ------------------------------------------------------------------

export interface TestIdentityOptions {
  /** Default `RSA-3072` (as the prototype's signer.pem). */
  readonly algorithm?: 'RSA-3072' | 'EC-P256';
  readonly commonName?: string;
  readonly organization?: string;
  /** Two-letter country code. */
  readonly country?: string;
  /** Default: now minus one minute (seconds precision). */
  readonly notBefore?: Date;
  /** Default 3650. */
  readonly validDays?: number;
}

export interface TestIdentity {
  /** Self-signed X.509 v3 certificate, DER. */
  readonly certificate: Uint8Array;
  /** Unencrypted PKCS#8 private key, DER. Keep it out of repositories. */
  readonly pkcs8: Uint8Array;
}

const OID_SHA256_WITH_RSA = '1.2.840.113549.1.1.11';
const OID_ECDSA_WITH_SHA256 = '1.2.840.10045.4.3.2';
const OID_SUBJECT_KEY_ID = '2.5.29.14';

function name(country: string, organization: string, commonName: string): Uint8Array {
  const rdn = (oid: string, value: Uint8Array) => w.set(w.sequence(w.objectIdentifier(oid), value));
  return w.sequence(rdn('2.5.4.6', w.printableString(country)), rdn('2.5.4.10', w.utf8String(organization)), rdn('2.5.4.3', w.utf8String(commonName)));
}

function extension(oid: string, critical: boolean, value: Uint8Array): Uint8Array {
  return w.sequence(w.objectIdentifier(oid), ...(critical ? [w.boolean(true)] : []), w.octetString(value));
}

/**
 * Generates a key pair with WebCrypto and a self-signed certificate for it:
 * keyUsage digitalSignature + nonRepudiation (critical), basicConstraints CA:FALSE (critical),
 * subjectKeyIdentifier (RFC 5280 method 1). For tests and demonstrations only.
 */
export async function createTestIdentity(options: TestIdentityOptions = {}): Promise<TestIdentity> {
  const algorithm = options.algorithm ?? 'RSA-3072';
  const keyParams: RsaHashedKeyGenParams | EcKeyGenParams =
    algorithm === 'RSA-3072'
      ? { name: 'RSASSA-PKCS1-v1_5', modulusLength: 3072, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' }
      : { name: 'ECDSA', namedCurve: 'P-256' };
  const pair = (await crypto.subtle.generateKey(keyParams, true, ['sign', 'verify'])) as CryptoKeyPair;
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));

  const notBefore = options.notBefore ?? new Date(Math.floor(Date.now() / 1000) * 1000 - 60_000);
  const notAfter = new Date(notBefore.getTime() + (options.validDays ?? 3650) * 86_400_000);
  const subject = name(options.country ?? 'AT', options.organization ?? 'html-Pro Test', options.commonName ?? 'html-Pro Testunterzeichner');
  const serial = crypto.getRandomValues(new Uint8Array(16));
  serial[0] = (serial[0]! & 0x7f) | 0x40; // positive, 16 octets, never zero
  const sigAlg = algorithm === 'RSA-3072' ? w.sequence(w.objectIdentifier(OID_SHA256_WITH_RSA), w.nullValue()) : w.sequence(w.objectIdentifier(OID_ECDSA_WITH_SHA256));
  const publicKeyBits = bitStringBytes(children(parseDer(spki))[1]!);
  const keyId = new Uint8Array(await crypto.subtle.digest('SHA-1', new Uint8Array(publicKeyBits)));

  const tbs = w.sequence(
    w.explicit(0, w.smallInteger(2)),
    w.unsignedInteger(serial),
    sigAlg,
    subject,
    w.sequence(w.time(notBefore), w.time(notAfter)),
    subject,
    spki,
    w.explicit(
      3,
      w.sequence(
        extension(OID.basicConstraints, true, w.sequence()),
        extension(OID.keyUsage, true, w.bitString(Uint8Array.of(0xc0), 6)),
        extension(OID_SUBJECT_KEY_ID, false, w.octetString(keyId)),
      ),
    ),
  );
  const signParams = algorithm === 'RSA-3072' ? { name: 'RSASSA-PKCS1-v1_5' } : { name: 'ECDSA', hash: 'SHA-256' };
  const raw = new Uint8Array(await crypto.subtle.sign(signParams, pair.privateKey, tbs));
  const signature = algorithm === 'RSA-3072' ? raw : w.ecdsaRawToDer(raw);
  const certificate = w.sequence(tbs, sigAlg, w.bitString(signature));
  parseCertificate(certificate); // self-check with the core's own parser
  return { certificate, pkcs8 };
}

// --- PEM ------------------------------------------------------------------------------

export function toPem(label: string, der: Uint8Array): string {
  const b64 = toBase64(der);
  return `-----BEGIN ${label}-----\n${b64.replace(/.{1,64}/g, '$&\n')}-----END ${label}-----\n`;
}

/** Unencrypted PKCS#8 key from PEM (`BEGIN PRIVATE KEY`). PKCS#1/SEC1 and encrypted keys are refused with a hint. */
export function pkcs8FromPem(pem: string): Uint8Array {
  const m = pem.match(/-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/);
  if (!m) {
    const other = pem.match(/-----BEGIN ([A-Z0-9 ]+)-----/)?.[1];
    throw new ContainerError(
      'signature',
      other ? `"${other}" is not supported; convert with: openssl pkcs8 -topk8 -nocrypt -in key.pem -out key.pk8.pem` : 'no "BEGIN PRIVATE KEY" block found',
    );
  }
  return base64Decode(m[1]!);
}
