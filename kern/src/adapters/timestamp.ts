import type { Adapter, OperationOptions } from './common.js';

export interface TimestampRequest extends OperationOptions {
  /** Message imprint: hash of the data to be time-stamped. Only this leaves the device. */
  readonly digest: Uint8Array;
  readonly hashAlgorithm: 'SHA-256' | 'SHA-384' | 'SHA-512';
}

export interface TimestampResult {
  /** DER `ContentInfo` (CMS SignedData with TSTInfo), as embedded in `xades:EncapsulatedTimeStamp`. */
  readonly token: Uint8Array;
  /** Complete `TimeStampResp` as received, if the service returns one (kept for evidence). */
  readonly response?: Uint8Array;
  /** genTime of the token, ISO 8601. */
  readonly genTime: string;
  readonly serialNumber: string;
  readonly tsaSubject: string;
  readonly elapsedMs?: number;
  readonly contentType?: string;
}

/**
 * `TimestampAuthority`: obtains an RFC 3161 time-stamp token for a hash (docs/03, 5.1:
 * XAdES-BASELINE-T). Implementations: `HttpTimestampAuthority` (RFC 3161 over HTTP) and
 * `CscTimestampAuthority` (CSC API `signatures/timestamp`). A time-stamp needs the network;
 * reading and verifying it later does not.
 */
export interface TimestampAuthority extends Adapter {
  timestamp(request: TimestampRequest): Promise<TimestampResult>;
}
