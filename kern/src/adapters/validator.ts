import type { Adapter, OperationOptions } from './common.js';

/** Main indications per ETSI EN 319 102-1, as reported by EU DSS. */
export type Indication = 'TOTAL_PASSED' | 'TOTAL_FAILED' | 'INDETERMINATE';

/**
 * Sub-indications per ETSI EN 319 102-1 (selection used in docs/05), open for others.
 * `HASH_FAILURE`: a signed file was changed; `FORMAT_FAILURE`: e.g. mimetype rejected by policy.
 */
export type SubIndication =
  | 'HASH_FAILURE'
  | 'SIG_CRYPTO_FAILURE'
  | 'FORMAT_FAILURE'
  | 'NO_CERTIFICATE_CHAIN_FOUND'
  | 'OUT_OF_BOUNDS_NO_POE'
  | 'REVOKED_NO_POE'
  | 'SIG_CONSTRAINTS_FAILURE'
  | 'SIGNED_DATA_NOT_FOUND'
  | 'NO_SIGNING_CERTIFICATE_FOUND'
  | 'CERTIFICATE_CHAIN_GENERAL_FAILURE'
  | 'NOT_YET_VALID'
  | 'CRYPTO_CONSTRAINTS_FAILURE_NO_POE'
  | (string & {});

export type SignatureLevel = 'XAdES-BASELINE-B' | 'XAdES-BASELINE-T' | 'XAdES-BASELINE-LT' | 'XAdES-BASELINE-LTA';

export interface SignatureReport {
  readonly signatureId: string;
  /** Container path of the signature file, e.g. `META-INF/signatures.xml`. */
  readonly file: string;
  readonly level: SignatureLevel | (string & {});
  readonly indication: Indication;
  readonly subIndication?: SubIndication;
  /** Container paths covered by this signature. */
  readonly signedPaths: readonly string[];
  readonly signerSubject?: string;
  /** Claimed signing time from the signature, ISO 8601. Not proven without a timestamp. */
  readonly claimedSigningTime?: string;
  readonly qualified?: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly infos?: readonly string[];
  /** Details filled by `TsValidator`; other implementations may omit them. */
  readonly signingCertificate?: {
    readonly subject: string;
    readonly issuer: string;
    readonly serialNumber: string;
    readonly notBefore: string;
    readonly notAfter: string;
  };
  /** Per reference: what was checked and with which result. */
  readonly references?: readonly {
    readonly uri: string;
    readonly path?: string;
    readonly kind: 'file' | 'signed-properties' | 'asic-manifest';
    readonly status: 'intact' | 'hash-failure' | 'not-found' | 'unsupported';
    readonly detail?: string;
  }[];
  /** Subjects from the signing certificate up to the trust anchor. */
  readonly chain?: readonly string[];
  readonly signatureAlgorithm?: string;
  readonly canonicalization?: string;
}

export interface ValidationReport {
  readonly signatures: readonly SignatureReport[];
  /** Files outside META-INF that no signature covers; the reader must name them (docs/05, V9). */
  readonly unsignedPaths: readonly string[];
  readonly validator: { readonly name: string; readonly version?: string; readonly policy: string };
  /** Validation time, ISO 8601. */
  readonly validationTime: string;
}

export interface ValidationRequest extends OperationOptions {
  readonly container: Uint8Array;
  /**
   * `html-pro` accepts `application/epub+zip` as mimetype (docs/05, 6.1);
   * `dss-default` warns about it; `strict` fails (docs/05, case V3).
   */
  readonly policy?: 'html-pro' | 'dss-default' | 'strict';
  /** Additional trust anchors (DER), e.g. a test certificate. */
  readonly trustAnchors?: readonly Uint8Array[];
  /** Use only cached trust lists and revocation data. */
  readonly offline?: boolean;
  /** Validate as of this time (ISO 8601) instead of now. */
  readonly validationTime?: string;
}

/**
 * `Validator`: checks the signatures of a container.
 * Implementations per docs/06, 4.1: `TsValidator` (package P2), `DssSidecarValidator`,
 * `RemoteDssValidator`.
 */
export interface Validator extends Adapter {
  readonly kind: 'typescript' | 'dss-sidecar' | 'remote-dss';
  validate(request: ValidationRequest): Promise<ValidationReport>;
}
