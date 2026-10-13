/**
 * Remote signing over the Cloud Signature Consortium API (CSC API v2, checked against
 * version 2.2.0.0 of the specification; package P10).
 *
 * - `CscClient` speaks the JSON/HTTP methods hpro needs: `info`, `auth/login`,
 *   `credentials/list`, `credentials/info`, `credentials/authorize`, `credentials/getChallenge`,
 *   `signatures/signHash` and `signatures/timestamp` (sections 11.1–11.13 of the spec).
 * - `RemoteCscSigner` implements the core's `Signer` adapter: the XAdES structure is built
 *   on the device, only the hash of the canonical `SignedInfo` goes to the remote signing
 *   service (RSSP). The returned value is verified with the credential's certificate before
 *   it is used, so a wrong key, wrong algorithm or broken encoding never ends up in a document.
 * - `CscTimestampAuthority` uses `signatures/timestamp` as `TimestampAuthority`.
 *
 * How the user authorises the credential (PIN/OTP entered in hpro, or an OAuth 2.0 redirect
 * to the provider) is provider-specific and stays outside the core: the caller passes an
 * `authorize` callback. Provider specifics for A-Trust are open points (docs/13).
 */
import type { Availability, OperationOptions } from './adapters/common.js';
import type { DigestSignRequest, SignatureAlgorithm, Signer, SigningKey } from './adapters/signer.js';
import type { TimestampAuthority, TimestampRequest, TimestampResult } from './adapters/timestamp.js';
import { toBase64, toHex, utf8 } from './bytes.js';
import { ContainerError } from './errors.js';
import { HASH_OIDS, verifyTimeStampToken } from './tsp.js';
import { CURVES, OID, base64Decode, ecdsaDerToRaw, parseCertificate, verifyWithCertificate, type Certificate } from './x509.js';

export const CSC_CLIENT_VERSION = '0.1.0';

/** OIDs used in `key/algo`, `signAlgo` and `hashAlgorithmOID` (ETSI TS 119 312, ch. 10). */
export const CSC_OIDS = {
  rsaEncryption: '1.2.840.113549.1.1.1',
  sha256WithRSA: '1.2.840.113549.1.1.11',
  sha384WithRSA: '1.2.840.113549.1.1.12',
  rsassaPss: '1.2.840.113549.1.1.10',
  ecPublicKey: '1.2.840.10045.2.1',
  ecdsaWithSha256: '1.2.840.10045.4.3.2',
  ecdsaWithSha384: '1.2.840.10045.4.3.3',
  sha256: HASH_OIDS['SHA-256'],
  sha384: HASH_OIDS['SHA-384'],
  sha512: HASH_OIDS['SHA-512'],
} as const;

/** Error returned by the remote service (section 10.1: `error`, `error_description`). */
export class CscError extends ContainerError {
  readonly method: string;
  readonly status: number;
  readonly error: string;
  readonly errorDescription: string | undefined;

  constructor(method: string, status: number, error: string, errorDescription?: string) {
    super('remote-signer', `CSC ${method}: HTTP ${status} ${error}${errorDescription ? ' – ' + errorDescription : ''}`);
    this.name = 'CscError';
    this.method = method;
    this.status = status;
    this.error = error;
    this.errorDescription = errorDescription;
  }
}

// --- Wire types (subset of the spec, names as on the wire) ---------------------------

export interface CscInfo {
  readonly specs: string;
  readonly name: string;
  readonly logo?: string;
  readonly region: string;
  readonly lang: string;
  readonly description: string;
  readonly authType: readonly string[];
  readonly oauth2?: string;
  readonly oauth2Issuer?: string;
  readonly methods: readonly string[];
  readonly signAlgorithms?: { readonly algos: readonly string[]; readonly algoParams?: readonly string[] };
}

export interface CscAuthObject {
  readonly type: string;
  readonly id?: string;
  readonly format?: string;
  readonly label?: string;
  readonly description?: string;
  readonly generator?: string;
}

export interface CscCredentialInfo {
  readonly credentialID?: string;
  readonly description?: string;
  readonly signatureQualifier?: string;
  readonly key: { readonly status: 'enabled' | 'disabled'; readonly algo: readonly string[]; readonly len: number; readonly curve?: string };
  readonly cert?: {
    readonly status?: string;
    readonly certificates?: readonly string[];
    readonly issuerDN?: string;
    readonly serialNumber?: string;
    readonly subjectDN?: string;
    readonly validFrom?: string;
    readonly validTo?: string;
  };
  readonly auth?: { readonly mode: 'explicit' | 'oauth2code' | (string & {}); readonly expression?: string; readonly objects?: readonly CscAuthObject[] };
  readonly SCAL?: '1' | '2';
  readonly multisign: number;
  readonly lang?: string;
}

export interface CscAuthorizeRequest {
  readonly credentialID: string;
  readonly numSignatures: number;
  readonly hashes?: readonly string[];
  readonly hashAlgorithmOID?: string;
  readonly authData?: readonly { readonly id: string; readonly value: string }[];
  readonly description?: string;
  readonly clientData?: string;
}

export interface CscSignHashRequest {
  readonly credentialID: string;
  readonly SAD?: string;
  readonly hashes: readonly string[];
  readonly hashAlgorithmOID?: string;
  readonly signAlgo: string;
  readonly signAlgoParams?: string;
  readonly clientData?: string;
}

// --- Client ---------------------------------------------------------------------------

export interface CscClientOptions {
  /** Base URI of the remote service including `/csc/v2` (section 7.2), e.g. `https://rssp.example/csc/v2`. */
  readonly baseUrl: string;
  /** Default `globalThis.fetch`; tests pass the mock service's in-process fetch. */
  readonly fetch?: typeof fetch;
  /** Service access token (`Authorization: Bearer`), from OAuth 2.0 or `auth/login`. */
  readonly accessToken?: string;
  readonly lang?: string;
  /** Called for every request with method name and body, without secrets (for logs and evidence). */
  readonly onRequest?: (method: string, body: Readonly<Record<string, unknown>>) => void;
}

const SECRET_FIELDS = new Set(['authData', 'SAD', 'refresh_token', 'password']);

export class CscClient {
  readonly baseUrl: string;
  #accessToken: string | undefined;
  readonly #options: CscClientOptions;

  constructor(options: CscClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#accessToken = options.accessToken;
    this.#options = options;
  }

  get authenticated(): boolean {
    return this.#accessToken !== undefined;
  }

  /** Low-level call: POST JSON, parse JSON, map errors (section 10.1). */
  async call<T>(method: string, body: Record<string, unknown> = {}, init: { auth?: string; signal?: AbortSignal; allowEmpty?: boolean } = {}): Promise<{ status: number; body: T }> {
    const doFetch = this.#options.fetch ?? globalThis.fetch;
    if (typeof doFetch !== 'function') throw new ContainerError('remote-signer', 'fetch is not available');
    const payload = body;
    this.#options.onRequest?.(method, Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, SECRET_FIELDS.has(k) ? '(redacted)' : v])));
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const auth = init.auth ?? (this.#accessToken ? `Bearer ${this.#accessToken}` : undefined);
    if (auth) headers.Authorization = auth;
    let response: Response;
    try {
      response = await doFetch(`${this.baseUrl}/${method}`, { method: 'POST', headers, body: JSON.stringify(payload), ...(init.signal ? { signal: init.signal } : {}) });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      throw new ContainerError('remote-signer', `CSC ${method}: service not reachable (${err instanceof Error ? err.message : String(err)})`);
    }
    const text = await response.text();
    let json: unknown = undefined;
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        throw new CscError(method, response.status, 'invalid_response', `body is not JSON: ${text.slice(0, 80)}`);
      }
    }
    if (!response.ok) {
      const e = (json ?? {}) as { error?: unknown; error_description?: unknown };
      throw new CscError(method, response.status, typeof e.error === 'string' ? e.error : 'http_error', typeof e.error_description === 'string' ? e.error_description : undefined);
    }
    if (json === undefined && !init.allowEmpty) throw new CscError(method, response.status, 'invalid_response', 'empty body');
    return { status: response.status, body: json as T };
  }

  async info(signal?: AbortSignal): Promise<CscInfo> {
    const r = await this.call<CscInfo>('info', this.#options.lang ? { lang: this.#options.lang } : {}, { auth: '', ...(signal ? { signal } : {}) });
    const info = r.body;
    if (typeof info?.specs !== 'string' || !Array.isArray(info.methods)) throw new CscError('info', r.status, 'invalid_response', 'specs or methods missing');
    return info;
  }

  /** `auth/login` with HTTP Basic (section 11.2). The spec discourages it; OAuth 2.0 is preferred. */
  async login(userID: string, password: string, signal?: AbortSignal): Promise<{ expiresIn: number }> {
    const basic = 'Basic ' + toBase64(utf8(`${userID}:${password}`));
    const r = await this.call<{ access_token?: string; expires_in?: number }>('auth/login', {}, { auth: basic, ...(signal ? { signal } : {}) });
    if (typeof r.body.access_token !== 'string') throw new CscError('auth/login', r.status, 'invalid_response', 'access_token missing');
    this.#accessToken = r.body.access_token;
    return { expiresIn: r.body.expires_in ?? 3600 };
  }

  /** Sets the service access token obtained elsewhere (OAuth 2.0 authorization code flow). */
  useAccessToken(token: string): void {
    this.#accessToken = token;
  }

  async credentialsList(signal?: AbortSignal): Promise<{ credentialIDs: string[]; credentialInfos?: CscCredentialInfo[] }> {
    const r = await this.call<{ credentialIDs?: unknown; credentialInfos?: CscCredentialInfo[] }>(
      'credentials/list',
      { credentialInfo: true, certificates: 'chain', certInfo: true, authInfo: true },
      signal ? { signal } : {},
    );
    if (!Array.isArray(r.body.credentialIDs) || !r.body.credentialIDs.every((x) => typeof x === 'string')) throw new CscError('credentials/list', r.status, 'invalid_response', 'credentialIDs missing');
    return { credentialIDs: r.body.credentialIDs as string[], ...(r.body.credentialInfos ? { credentialInfos: r.body.credentialInfos } : {}) };
  }

  async credentialsInfo(credentialID: string, signal?: AbortSignal): Promise<CscCredentialInfo> {
    const r = await this.call<CscCredentialInfo>('credentials/info', { credentialID, certificates: 'chain', certInfo: true, authInfo: true }, signal ? { signal } : {});
    return { ...r.body, credentialID };
  }

  /** Sends an out-of-band challenge (e.g. OTP by SMS); returns the in-band challenge if any (section 11.8). */
  async getChallenge(credentialID: string, authObjectID: string, signal?: AbortSignal): Promise<string | undefined> {
    const r = await this.call<{ challenge?: string } | undefined>('credentials/getChallenge', { credentialID, authObjectID }, { allowEmpty: true, ...(signal ? { signal } : {}) });
    return r.body?.challenge;
  }

  /** `credentials/authorize` (explicit mode, section 11.6). Returns the SAD. HTTP 202 (asynchronous) is not supported. */
  async authorize(request: CscAuthorizeRequest, signal?: AbortSignal): Promise<{ SAD: string; expiresIn: number }> {
    const r = await this.call<{ SAD?: string; expiresIn?: number; handle?: string }>('credentials/authorize', { ...request }, signal ? { signal } : {});
    if (r.status === 202) throw new CscError('credentials/authorize', 202, 'unsupported', 'asynchronous authorisation (authorizeCheck) is not implemented');
    if (typeof r.body.SAD !== 'string') throw new CscError('credentials/authorize', r.status, 'invalid_response', 'SAD missing');
    return { SAD: r.body.SAD, expiresIn: r.body.expiresIn ?? 3600 };
  }

  async signHash(request: CscSignHashRequest, signal?: AbortSignal): Promise<string[]> {
    const r = await this.call<{ signatures?: unknown }>('signatures/signHash', { ...request }, signal ? { signal } : {});
    const sigs = r.body.signatures;
    if (!Array.isArray(sigs) || sigs.length !== request.hashes.length || !sigs.every((x) => typeof x === 'string')) {
      throw new CscError('signatures/signHash', r.status, 'invalid_response', `expected ${request.hashes.length} signature(s)`);
    }
    return sigs as string[];
  }

  async timestamp(hash: Uint8Array, hashAlgo: string, nonceHex?: string, signal?: AbortSignal): Promise<Uint8Array> {
    const r = await this.call<{ timestamp?: unknown }>('signatures/timestamp', { hash: toBase64(hash), hashAlgo, ...(nonceHex ? { nonce: nonceHex } : {}) }, signal ? { signal } : {});
    if (typeof r.body.timestamp !== 'string') throw new CscError('signatures/timestamp', r.status, 'invalid_response', 'timestamp missing');
    return base64Decode(r.body.timestamp);
  }
}

// --- Signer ---------------------------------------------------------------------------

/** What the authorisation callback learns about the pending signature. */
export interface CredentialAuthorizationRequest {
  readonly credentialID: string;
  readonly credential: CscCredentialInfo;
  /** Base64 hashes the SAD is bound to (SCAL 2). */
  readonly hashes: readonly string[];
  readonly hashAlgorithmOID: string;
  readonly numSignatures: number;
  readonly description?: string;
  /** The client, e.g. to call `getChallenge` for an OTP. */
  readonly client: CscClient;
}

/**
 * How the credential was authorised:
 * - `explicit`: authentication objects collected by hpro (PIN, OTP …) for `credentials/authorize`,
 * - `credential-token`: an OAuth 2.0 access token with scope `credential`, obtained by the app
 *   through the provider's redirect (section 8); sent as SAD (allowed for backward compatibility).
 */
export type CredentialAuthorization =
  | { readonly kind: 'explicit'; readonly authData: readonly { readonly id: string; readonly value: string }[] }
  | { readonly kind: 'credential-token'; readonly token: string };

export interface RemoteCscSignerOptions {
  /** Called once per signature; must ask the user (the remote key must not sign without consent). */
  readonly authorize: (request: CredentialAuthorizationRequest) => Promise<CredentialAuthorization>;
  /** Restrict to these credentials (default: all from `credentials/list`). */
  readonly credentialIDs?: readonly string[];
  /** Shown in reports; default: `info.name` of the service. */
  readonly name?: string;
}

/** Last exchange with the service, kept for evidence (no secrets). */
export interface RemoteSignatureTrace {
  readonly credentialID: string;
  readonly signAlgo: string;
  readonly hashAlgorithmOID: string | undefined;
  readonly hash: string;
  /** Encoding of an ECDSA value as returned by the service. */
  readonly valueEncoding: 'der' | 'raw' | 'rsa';
  readonly authorization: CredentialAuthorization['kind'];
}

/** The SAD is bound to this digest (SCAL 2); only SHA-256/384 digests are produced by the core. */
const HASH_OID_FOR: Record<'SHA-256' | 'SHA-384' | 'SHA-512', string> = HASH_OIDS;

interface AlgorithmChoice {
  readonly algorithm: SignatureAlgorithm;
  readonly signAlgo: string;
  /** Sent only where the signature algorithm does not imply the hash (section 11.10). */
  readonly hashAlgorithmOID?: string;
}

/** Signature algorithms the core can write, mapped from the credential's key and `key/algo`. */
export function algorithmsForCredential(info: CscCredentialInfo, cert: Certificate): AlgorithmChoice[] {
  const algos = new Set(info.key.algo);
  const out: AlgorithmChoice[] = [];
  if (cert.keyAlgorithm === OID.rsaEncryption) {
    if (algos.has(CSC_OIDS.sha256WithRSA)) out.push({ algorithm: 'RSASSA-PKCS1-v1_5-SHA256', signAlgo: CSC_OIDS.sha256WithRSA });
    else if (algos.has(CSC_OIDS.rsaEncryption)) out.push({ algorithm: 'RSASSA-PKCS1-v1_5-SHA256', signAlgo: CSC_OIDS.rsaEncryption, hashAlgorithmOID: CSC_OIDS.sha256 });
  } else if (cert.keyAlgorithm === OID.ecPublicKey) {
    const p256 = cert.curve === OID.p256;
    const p384 = cert.curve === OID.p384;
    if (p256 && algos.has(CSC_OIDS.ecdsaWithSha256)) out.push({ algorithm: 'ECDSA-P256-SHA256', signAlgo: CSC_OIDS.ecdsaWithSha256 });
    else if (p256 && algos.has(CSC_OIDS.ecPublicKey)) out.push({ algorithm: 'ECDSA-P256-SHA256', signAlgo: CSC_OIDS.ecPublicKey, hashAlgorithmOID: CSC_OIDS.sha256 });
    if (p384 && algos.has(CSC_OIDS.ecdsaWithSha384)) out.push({ algorithm: 'ECDSA-P384-SHA384', signAlgo: CSC_OIDS.ecdsaWithSha384 });
    else if (p384 && algos.has(CSC_OIDS.ecPublicKey)) out.push({ algorithm: 'ECDSA-P384-SHA384', signAlgo: CSC_OIDS.ecPublicKey, hashAlgorithmOID: CSC_OIDS.sha384 });
  }
  return out;
}

interface Credential {
  readonly info: CscCredentialInfo;
  readonly key: SigningKey;
  readonly certificate: Certificate;
  readonly choices: readonly AlgorithmChoice[];
}

/**
 * `Signer` backed by a CSC remote signing service (docs/06, 4.1 `RemoteCscSigner`). Works on
 * every platform with `fetch`; in a browser the service must allow CORS (open point per
 * provider, docs/06 note 13).
 */
export class RemoteCscSigner implements Signer {
  readonly kind = 'remote-csc' as const;
  readonly info;
  readonly client: CscClient;
  readonly #options: RemoteCscSignerOptions;
  #credentials: Map<string, Credential> | undefined;
  #lastTrace: RemoteSignatureTrace | undefined;

  constructor(client: CscClient, options: RemoteCscSignerOptions) {
    this.client = client;
    this.#options = options;
    this.info = { name: 'RemoteCscSigner', version: CSC_CLIENT_VERSION, location: 'remote-service' as const };
  }

  get lastTrace(): RemoteSignatureTrace | undefined {
    return this.#lastTrace;
  }

  async availability(): Promise<Availability> {
    if (typeof globalThis.fetch !== 'function') return { available: false, reason: 'fetch is not available', fallback: 'SoftwareKeySigner (AdES only)' };
    if (!this.client.authenticated) return { available: false, reason: 'not signed in at the remote signing service', fallback: 'sign in (OAuth 2.0 or auth/login), or SoftwareKeySigner (AdES only)' };
    return { available: true };
  }

  async listKeys(options?: OperationOptions): Promise<readonly SigningKey[]> {
    return [...(await this.#load(options?.signal)).values()].map((c) => c.key);
  }

  async #load(signal?: AbortSignal): Promise<Map<string, Credential>> {
    if (this.#credentials) return this.#credentials;
    const list = await this.client.credentialsList(signal);
    const wanted = this.#options.credentialIDs ? list.credentialIDs.filter((id) => this.#options.credentialIDs!.includes(id)) : list.credentialIDs;
    const map = new Map<string, Credential>();
    for (const id of wanted) {
      const fromList = list.credentialInfos?.find((c) => c.credentialID === id);
      const info = fromList?.cert?.certificates?.length ? fromList : await this.client.credentialsInfo(id, signal);
      if (info.key?.status !== 'enabled') continue;
      const chain = (info.cert?.certificates ?? []).map((b64) => base64Decode(b64));
      if (chain.length === 0) continue;
      const certificate = parseCertificate(chain[0]!);
      const choices = algorithmsForCredential(info, certificate);
      if (choices.length === 0) continue;
      map.set(id, {
        info,
        certificate,
        choices,
        key: {
          keyId: id,
          label: info.description ?? certificate.subject,
          certificateChain: chain,
          algorithms: choices.map((c) => c.algorithm),
          // The service's claim; the qualified status of the certificate (QC statements, trusted
          // list) is not checked by the core yet (docs/13, open points).
          qualified: info.signatureQualifier === 'eu_eidas_qes',
          requiresAuthorisationPerSignature: true,
        },
      });
    }
    this.#credentials = map;
    return map;
  }

  async signDigest(request: DigestSignRequest): Promise<Uint8Array> {
    request.signal?.throwIfAborted();
    const cred = (await this.#load(request.signal)).get(request.keyId);
    if (!cred) throw new ContainerError('remote-signer', `unknown credential ${request.keyId}`);
    const choice = cred.choices.find((c) => c.algorithm === request.algorithm);
    if (!choice) throw new ContainerError('remote-signer', `credential ${request.keyId} does not offer ${request.algorithm}`);
    const expectedLength = request.digestAlgorithm === 'SHA-384' ? 48 : request.digestAlgorithm === 'SHA-512' ? 64 : 32;
    if (request.digest.length !== expectedLength) throw new ContainerError('remote-signer', `digest has ${request.digest.length} octets, ${request.digestAlgorithm} needs ${expectedLength}`);
    const hash = toBase64(request.digest);
    const hashAlgorithmOID = HASH_OID_FOR[request.digestAlgorithm];

    const authorization = await this.#options.authorize({
      credentialID: request.keyId,
      credential: cred.info,
      hashes: [hash],
      hashAlgorithmOID,
      numSignatures: 1,
      ...(request.description ? { description: request.description } : {}),
      client: this.client,
    });
    let SAD: string;
    if (authorization.kind === 'explicit') {
      const r = await this.client.authorize(
        { credentialID: request.keyId, numSignatures: 1, hashes: [hash], hashAlgorithmOID, authData: authorization.authData, ...(request.description ? { description: request.description.slice(0, 500) } : {}) },
        request.signal,
      );
      SAD = r.SAD;
    } else {
      SAD = authorization.token;
    }
    request.onProgress?.(0.5);
    const [valueB64] = await this.client.signHash(
      { credentialID: request.keyId, SAD, hashes: [hash], signAlgo: choice.signAlgo, ...(choice.hashAlgorithmOID ? { hashAlgorithmOID: choice.hashAlgorithmOID } : {}) },
      request.signal,
    );
    let value = base64Decode(valueB64!);
    let valueEncoding: RemoteSignatureTrace['valueEncoding'] = 'rsa';
    if (cred.certificate.keyAlgorithm === OID.ecPublicKey) {
      // XML-DSig wants r‖s; the CSC spec leaves the encoding of "signed hashes" open, most
      // services return the DER ECDSA-Sig-Value known from CMS. Accept both, verify below.
      const size = CURVES[cred.certificate.curve ?? '']?.size ?? 0;
      const raw = ecdsaDerToRaw(value, size);
      if (raw) {
        value = new Uint8Array(raw);
        valueEncoding = 'der';
      } else if (value.length === 2 * size) valueEncoding = 'raw';
      else throw new ContainerError('remote-signer', `ECDSA value of ${value.length} octets is neither DER nor r‖s for this curve`);
    }
    // Never trust the service blindly: the value must verify with the credential's certificate.
    const spec = { key: cred.certificate.keyAlgorithm === OID.rsaEncryption ? ('RSA' as const) : ('EC' as const), hash: request.digestAlgorithm };
    const ok = await verifyWithCertificate(cred.certificate, spec, value, request.data, 'raw');
    if (!ok) throw new ContainerError('remote-signer', 'the remote signature does not verify with the credential certificate over the data to be signed');
    this.#lastTrace = { credentialID: request.keyId, signAlgo: choice.signAlgo, hashAlgorithmOID: choice.hashAlgorithmOID, hash, valueEncoding, authorization: authorization.kind };
    request.onProgress?.(1);
    return value;
  }
}

/** `TimestampAuthority` over the CSC method `signatures/timestamp` (section 11.13). */
export class CscTimestampAuthority implements TimestampAuthority {
  readonly info = { name: 'CscTimestampAuthority', version: CSC_CLIENT_VERSION, location: 'remote-service' as const };
  readonly #client: CscClient;

  constructor(client: CscClient) {
    this.#client = client;
  }

  async availability(): Promise<Availability> {
    return this.#client.authenticated ? { available: true } : { available: false, reason: 'not signed in at the remote signing service' };
  }

  async timestamp(request: TimestampRequest): Promise<TimestampResult> {
    const nonce = toHex(crypto.getRandomValues(new Uint8Array(8))).replace(/^0+(?=.)/, '');
    const started = Date.now();
    const token = await this.#client.timestamp(request.digest, HASH_OIDS[request.hashAlgorithm], nonce, request.signal);
    const check = await verifyTimeStampToken(token, { digest: request.digest, expectedNonceHex: nonce });
    if (check.messageImprint !== 'match' || check.signatureIntact !== true || check.indication === 'FAILED') {
      // Section 11.13: a token without the requested nonce SHALL be rejected.
      throw new ContainerError('timestamp', `time-stamp from CSC service rejected: ${check.indication}${check.subIndication ? '/' + check.subIndication : ''} ${check.errors.join('; ')}`);
    }
    return { token, genTime: check.tstInfo!.genTime.toISOString(), serialNumber: check.tstInfo!.serialHex, tsaSubject: check.tsaCertificate?.subject ?? '', elapsedMs: Date.now() - started };
  }
}
