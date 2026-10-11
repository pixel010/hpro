import type { Adapter, OperationOptions } from './common.js';

/**
 * Signature algorithms with their XML-DSig encodings of the signature value.
 * ECDSA values are raw `r || s` (IEEE P1363), as XML-DSig requires, not DER.
 */
export type SignatureAlgorithm = 'RSASSA-PKCS1-v1_5-SHA256' | 'RSASSA-PSS-SHA256' | 'ECDSA-P256-SHA256' | 'ECDSA-P384-SHA384';

export type DigestAlgorithm = 'SHA-256' | 'SHA-384' | 'SHA-512';

export interface SigningKey {
  /** Adapter-specific key identifier (CSC credentialID, PKCS#11 object id, keychain label …). */
  readonly keyId: string;
  readonly label: string;
  /** DER-encoded X.509 certificates, signing certificate first. */
  readonly certificateChain: readonly Uint8Array[];
  readonly algorithms: readonly SignatureAlgorithm[];
  /** True only for keys on a qualified signature creation device (QSCD) with a qualified certificate. */
  readonly qualified: boolean;
  /** True when every signature requires a fresh user authorisation (PIN, SCA, biometrics). */
  readonly requiresAuthorisationPerSignature: boolean;
}

export interface DigestSignRequest extends OperationOptions {
  readonly keyId: string;
  readonly algorithm: SignatureAlgorithm;
  /** Digest of the canonicalised XAdES `SignedInfo`. Remote signers (CSC) only receive this. */
  readonly digest: Uint8Array;
  /**
   * The canonicalised `SignedInfo` itself. Local WebCrypto keys need it because WebCrypto
   * hashes internally and cannot sign a precomputed digest; such signers must check that
   * `digest` is the hash of `data` before signing.
   */
  readonly data: Uint8Array;
  readonly digestAlgorithm: DigestAlgorithm;
  /** Shown by remote signing services during authorisation (CSC `description`). */
  readonly description?: string;
}

/**
 * `Signer`: creates a raw signature value with a key the platform controls.
 *
 * Deliberately low-level: building the XAdES signature, placing it in
 * `META-INF/signatures.xml` (OCF root) and writing the container is the core's job
 * (docs/05, section 6.1: own ZIP writer, the signing library only supplies the signature).
 * Implementations per docs/06, 4.1: `SoftwareKeySigner`, `RemoteCscSigner`, `Pkcs11Signer`,
 * `PcscSigner`, `PlatformKeySigner`, `NfcCardSigner`.
 */
export interface Signer extends Adapter {
  readonly kind: 'software-key' | 'remote-csc' | 'pkcs11' | 'pcsc' | 'platform-key' | 'nfc-card';
  listKeys(options?: OperationOptions): Promise<readonly SigningKey[]>;
  /** Returns the signature value in XML-DSig encoding for `request.algorithm`. */
  signDigest(request: DigestSignRequest): Promise<Uint8Array>;
}
