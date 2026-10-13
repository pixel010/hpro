// Test doubles for package P10: a remote signing service speaking the CSC API v2 (2.2.0.0)
// and an RFC 3161 time-stamping authority. They enforce what a real provider enforces
// (bearer token, PIN and OTP, SAD bound to the hash and used once, algorithm of the key),
// so that the client is tested against the contract and not against a friendly stub.
// No provider credentials exist (docs/13); everything here is a test double.
import { createPrivateKey, constants, privateEncrypt, createHash, randomBytes, randomInt } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { concat, hexToBytes, toBase64, toHex } from '../src/bytes.js';
import { OIDS as CMS_OIDS } from '../src/cades.js';
import { CSC_OIDS } from '../src/csc.js';
import * as w from '../src/der-write.js';
import { TAG, children, expect, oid, parseDer } from '../src/der.js';
import { TSP_OIDS } from '../src/tsp.js';
import { base64Decode } from '../src/x509.js';
import { signDer, signatureAlgorithmId, type Issued, type KeyPair } from './pki.js';

const SHA = { [CSC_OIDS.sha256]: { name: 'SHA-256', len: 32 }, [CSC_OIDS.sha384]: { name: 'SHA-384', len: 48 }, [CSC_OIDS.sha512]: { name: 'SHA-512', len: 64 } } as Record<string, { name: string; len: number }>;

// --- ECDSA P-256 over a precomputed hash ------------------------------------------------
// WebCrypto and node:crypto only sign messages, not digests; a remote signing service signs
// digests. This small BigInt implementation is for the test double only.

const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const GX = 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n;
const GY = 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n;
const mod = (a: bigint, m: bigint) => ((a % m) + m) % m;
function powMod(b: bigint, e: bigint, m: bigint): bigint {
  let r = 1n;
  b = mod(b, m);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}
const inv = (a: bigint, m: bigint) => powMod(a, m - 2n, m);
type Jac = [bigint, bigint, bigint];
function jDouble([x, y, z]: Jac): Jac {
  if (y === 0n) return [0n, 1n, 0n];
  const ysq = (y * y) % P;
  const s = (4n * x * ysq) % P;
  const zsq = (z * z) % P;
  const m = mod(3n * (x - zsq) * (x + zsq), P); // a = -3
  const nx = mod(m * m - 2n * s, P);
  const ny = mod(m * (s - nx) - 8n * ysq * ysq, P);
  return [nx, ny, (2n * y * z) % P];
}
function jAdd(p: Jac, q: Jac): Jac {
  if (p[2] === 0n) return q;
  if (q[2] === 0n) return p;
  const z1z1 = (p[2] * p[2]) % P;
  const z2z2 = (q[2] * q[2]) % P;
  const u1 = (p[0] * z2z2) % P;
  const u2 = (q[0] * z1z1) % P;
  const s1 = (p[1] * q[2] * z2z2) % P;
  const s2 = (q[1] * p[2] * z1z1) % P;
  if (u1 === u2) return s1 === s2 ? jDouble(p) : [0n, 1n, 0n];
  const h = mod(u2 - u1, P);
  const r = mod(s2 - s1, P);
  const h2 = (h * h) % P;
  const h3 = (h2 * h) % P;
  const nx = mod(r * r - h3 - 2n * u1 * h2, P);
  const ny = mod(r * (u1 * h2 - nx) - s1 * h3, P);
  return [nx, ny, (h * p[2] * q[2]) % P];
}
function mulG(k: bigint): bigint {
  let acc: Jac = [0n, 1n, 0n];
  let add: Jac = [GX, GY, 1n];
  while (k > 0n) {
    if (k & 1n) acc = jAdd(acc, add);
    add = jDouble(add);
    k >>= 1n;
  }
  const zi = inv(acc[2], P);
  return (acc[0] * zi * zi) % P;
}
const big = (b: Uint8Array) => BigInt('0x' + (toHex(b) || '0'));
const bytes32 = (v: bigint) => hexToBytes(v.toString(16).padStart(64, '0'));
const b64url = (s: string) => Buffer.from(s, 'base64url');

/** ECDSA P-256 signature over a 32-octet digest; returns r‖s. */
export function ecdsaSignDigest(dJwk: string, digest: Uint8Array): Uint8Array {
  const d = big(b64url(dJwk));
  const z = big(digest.subarray(0, 32));
  for (;;) {
    const k = mod(big(randomBytes(40)), N - 1n) + 1n;
    const r = mod(mulG(k), N);
    if (r === 0n) continue;
    const s = mod(inv(k, N) * (z + r * d), N);
    if (s === 0n) continue;
    return concat([bytes32(r), bytes32(s)]);
  }
}

const DIGEST_INFO_PREFIX: Record<string, string> = {
  [CSC_OIDS.sha256]: '3031300d060960864801650304020105000420',
  [CSC_OIDS.sha384]: '3041300d060960864801650304020205000430',
  [CSC_OIDS.sha512]: '3051300d060960864801650304020305000440',
};

/** RSA PKCS#1 v1.5 over a precomputed digest (DigestInfo, RFC 8017 §9.2). */
export function rsaSignDigest(pkcs8: Uint8Array, hashOid: string, digest: Uint8Array): Uint8Array {
  const key = createPrivateKey({ key: Buffer.from(pkcs8), format: 'der', type: 'pkcs8' });
  return new Uint8Array(privateEncrypt({ key, padding: constants.RSA_PKCS1_PADDING }, Buffer.concat([Buffer.from(DIGEST_INFO_PREFIX[hashOid]!, 'hex'), digest])));
}

// --- RFC 3161 TSA ---------------------------------------------------------------------

export const MOCK_TSA_POLICY = '2.999.3161.1'; // OID arc 2.999 is reserved for examples (ITU-T X.660)

export interface MockTsaOptions {
  /** Leave the TSA certificate out even when certReq is set. */
  readonly omitCertificate?: boolean;
  /** Answer with this PKIStatus instead of granted. */
  readonly status?: number;
  /** Put a different nonce into the token (test for the client's nonce check). */
  readonly wrongNonce?: boolean;
  /** Fixed clock for genTime. */
  readonly now?: () => Date;
}

export class MockTsa {
  readonly tsa: Issued;
  readonly options: MockTsaOptions;
  #serial = 1;
  readonly requests: { hashAlgorithm: string; nonce?: string; certReq: boolean }[] = [];

  constructor(tsa: Issued, options: MockTsaOptions = {}) {
    this.tsa = tsa;
    this.options = options;
  }

  /** Answers a DER `TimeStampReq` with a DER `TimeStampResp`. */
  async respond(request: Uint8Array): Promise<Uint8Array> {
    const f = children(expect(parseDer(request), TAG.SEQUENCE, 'TimeStampReq'));
    const imprint = expect(f[1], TAG.SEQUENCE, 'messageImprint');
    let nonce: Uint8Array | undefined;
    let certReq = false;
    for (const n of f.slice(2)) {
      if (n.tag === TAG.INTEGER) nonce = n.value;
      if (n.tag === TAG.BOOLEAN) certReq = n.value[0] !== 0;
    }
    this.requests.push({ hashAlgorithm: oid(children(children(imprint)[0]!)[0]!), ...(nonce ? { nonce: toHex(nonce) } : {}), certReq });
    if (this.options.status !== undefined && this.options.status > 1) {
      return w.sequence(w.sequence(w.smallInteger(this.options.status), w.sequence(w.utf8String('mock refusal')), w.bitString(Uint8Array.of(0x20), 5)));
    }
    if (this.options.wrongNonce && nonce) nonce = Uint8Array.of(0x01, ...nonce);
    const token = await this.token(imprint.raw, nonce, certReq && !this.options.omitCertificate);
    return w.sequence(w.sequence(w.smallInteger(0)), token);
  }

  /** Token over a hash, as used by the CSC method `signatures/timestamp`. */
  async tokenFor(hashAlgorithmOid: string, hash: Uint8Array, nonceHex?: string): Promise<Uint8Array> {
    const imprint = w.sequence(w.sequence(w.objectIdentifier(hashAlgorithmOid)), w.octetString(hash));
    return this.token(imprint, nonceHex ? hexToBytes(nonceHex.length % 2 ? '0' + nonceHex : nonceHex) : undefined, true);
  }

  async token(imprintDer: Uint8Array, nonce: Uint8Array | undefined, includeCert: boolean): Promise<Uint8Array> {
    const genTime = this.options.now?.() ?? new Date();
    const tst = w.sequence(
      w.smallInteger(1),
      w.objectIdentifier(MOCK_TSA_POLICY),
      imprintDer,
      w.smallInteger(this.#serial++),
      w.generalizedTime(genTime, true),
      w.sequence(w.smallInteger(1)),
      ...(nonce ? [w.unsignedInteger(nonce)] : []),
      w.explicit(0, w.tlv(0xa4, this.tsa.name)),
    );
    return signedData(TSP_OIDS.tstInfo, tst, this.tsa, includeCert);
  }
}

/** CMS SignedData with signed attributes (RFC 5652) and ESS signing-certificate-v2 (RFC 5035). */
export async function signedData(contentType: string, content: Uint8Array, signer: Issued, includeCert: boolean, essValue?: Uint8Array): Promise<Uint8Array> {
  const sha256Id = w.sequence(w.objectIdentifier(CSC_OIDS.sha256));
  const attr = (type: string, value: Uint8Array) => w.sequence(w.objectIdentifier(type), w.set(value));
  const certHash = createHash('sha256').update(signer.der).digest();
  const attrs = [
    attr(CMS_OIDS.contentType, w.objectIdentifier(contentType)),
    attr(CMS_OIDS.messageDigest, w.octetString(createHash('sha256').update(content).digest())),
    attr(CMS_OIDS.signingCertificateV2, essValue ?? w.sequence(w.sequence(w.sequence(w.octetString(certHash))))),
  ].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))); // DER SET OF order
  const signedAttrsSet = w.set(...attrs);
  const signature = await signDer(signer.key, signedAttrsSet);
  const signedAttrs = new Uint8Array(signedAttrsSet);
  signedAttrs[0] = 0xa0; // [0] IMPLICIT
  const sid = w.sequence(signer.cert.issuerDer, w.tlv(TAG.INTEGER, hexToBytes(signer.cert.serialHex)));
  const signerInfo = w.sequence(w.smallInteger(1), sid, sha256Id, signedAttrs, signatureAlgorithmId(signer.key.kind), w.octetString(signature));
  const sd = w.sequence(
    w.smallInteger(3),
    w.set(sha256Id),
    w.sequence(w.objectIdentifier(contentType), w.explicit(0, w.octetString(content))),
    ...(includeCert ? [w.tlv(0xa0, signer.der)] : []),
    w.set(signerInfo),
  );
  return w.sequence(w.objectIdentifier('1.2.840.113549.1.7.2'), w.explicit(0, sd));
}

/** Time-stamp token with a given ESS signing-certificate-v2 value (for malformed-token tests). */
export async function signedDataWithAttrs(tsa: Issued, essValue: Uint8Array): Promise<Uint8Array> {
  const imprint = w.sequence(w.sequence(w.objectIdentifier(CSC_OIDS.sha256)), w.octetString(new Uint8Array(32)));
  const tst = w.sequence(w.smallInteger(1), w.objectIdentifier(MOCK_TSA_POLICY), imprint, w.smallInteger(1), w.generalizedTime(new Date()));
  return signedData(TSP_OIDS.tstInfo, tst, tsa, true, essValue);
}

// --- CSC remote signing service ---------------------------------------------------------

export interface MockCredential {
  readonly id: string;
  readonly issued: Issued;
  readonly chain: readonly Issued[];
  readonly description: string;
  readonly algo: readonly string[];
  readonly pin: string;
  readonly signatureQualifier?: string;
}

export interface MockCscOptions {
  readonly baseUrl?: string;
  readonly userID?: string;
  readonly password?: string;
  /** ECDSA values as DER `ECDSA-Sig-Value` (default) or r‖s. */
  readonly ecdsaEncoding?: 'der' | 'raw';
  /** Misbehaviour for negative tests. */
  readonly tamper?: 'sign-other-hash';
  readonly sadLifetimeSeconds?: number;
  readonly maxPinAttempts?: number;
}

interface SadEntry {
  readonly credentialID: string;
  readonly hashes: Set<string>;
  remaining: number;
  readonly expires: number;
}

interface Reply {
  readonly status: number;
  readonly body?: unknown;
}

const error = (status: number, err: string, description: string): Reply => ({ status, body: { error: err, error_description: description } });

/** Log entry per request: method and body with secrets removed (what leaves the device). */
export interface MockLogEntry {
  readonly method: string;
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export class MockCscService {
  readonly baseUrl: string;
  readonly credentials: ReadonlyMap<string, MockCredential>;
  readonly tsa: MockTsa;
  readonly log: MockLogEntry[] = [];
  /** OTPs "sent by SMS" (out-of-band channel of the test double). */
  readonly outbox: { credentialID: string; otp: string }[] = [];
  readonly #options: MockCscOptions;
  readonly #tokens = new Map<string, number>();
  readonly #sads = new Map<string, SadEntry>();
  readonly #otps = new Map<string, string>();
  readonly #failures = new Map<string, number>();
  clock: () => number = () => Date.now();

  constructor(credentials: readonly MockCredential[], tsa: MockTsa, options: MockCscOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://rssp.test.invalid/csc/v2').replace(/\/+$/, '');
    this.credentials = new Map(credentials.map((c) => [c.id, c]));
    this.tsa = tsa;
    this.#options = options;
  }

  /** In-process `fetch` for the client: same JSON and HTTP semantics, no socket. */
  readonly fetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(this.baseUrl + '/')) return new Response('not found', { status: 404 });
    const method = url.slice(this.baseUrl.length + 1);
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? init.body : '';
    const reply = await this.handle(method, headers.get('authorization') ?? undefined, body);
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status, headers: reply.body === undefined ? {} : { 'Content-Type': 'application/json;charset=UTF-8' } });
  };

  async handle(method: string, authorization: string | undefined, rawBody: string): Promise<Reply> {
    let body: Record<string, unknown> = {};
    if (rawBody.trim()) {
      try {
        body = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        return this.#logged(method, body, error(400, 'invalid_request', 'body is not JSON'));
      }
    }
    return this.#logged(method, body, await this.#dispatch(method, authorization, body));
  }

  #logged(method: string, body: Record<string, unknown>, reply: Reply): Reply {
    const clean = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, k === 'authData' || k === 'SAD' ? '(redacted)' : v]));
    this.log.push({ method, status: reply.status, body: clean });
    return reply;
  }

  #bearer(authorization: string | undefined): Reply | undefined {
    const m = /^Bearer (\S+)$/.exec(authorization ?? '');
    if (!m) return error(400, 'invalid_request', 'Malformed authorization header.');
    const exp = this.#tokens.get(m[1]!);
    if (exp === undefined || exp < this.clock()) return error(401, 'invalid_token', 'The access token is not valid');
    return undefined;
  }

  #credentialInfo(c: MockCredential): Record<string, unknown> {
    const cert = c.issued.cert;
    const gt = (d: Date) => d.toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z';
    const ec = cert.curve !== undefined;
    return {
      credentialID: c.id,
      description: c.description,
      ...(c.signatureQualifier ? { signatureQualifier: c.signatureQualifier } : {}),
      key: { status: 'enabled', algo: [...c.algo], len: ec ? 256 : 3072, ...(ec ? { curve: cert.curve } : {}) },
      cert: {
        status: 'valid',
        certificates: [c.issued, ...c.chain].map((i) => toBase64(i.der)),
        issuerDN: cert.issuer,
        serialNumber: cert.serialHex,
        subjectDN: cert.subject,
        validFrom: gt(cert.notBefore),
        validTo: gt(cert.notAfter),
      },
      auth: {
        mode: 'explicit',
        expression: 'PIN AND OTP',
        objects: [
          { type: 'Password', id: 'PIN', format: 'N', label: 'PIN', description: 'Signatur-PIN (Testdoppel)' },
          { type: 'Password', id: 'OTP', format: 'N', generator: 'totp', label: 'Mobile OTP', description: 'Code aus der SMS (Testdoppel: outbox)' },
        ],
      },
      SCAL: '2',
      multisign: 1,
      lang: 'de-AT',
    };
  }

  async #dispatch(method: string, authorization: string | undefined, body: Record<string, unknown>): Promise<Reply> {
    if (method === 'info') {
      return {
        status: 200,
        body: {
          specs: '2.2.0.0',
          name: 'hpro Mock-RSSP (Testdoppel)',
          logo: 'https://rssp.test.invalid/logo.png',
          region: 'AT',
          lang: 'de-AT',
          description: 'Testdoppel eines Fernsignaturdienstes nach CSC API v2; kein qualifizierter Dienst',
          authType: ['basic'],
          methods: ['auth/login', 'credentials/list', 'credentials/info', 'credentials/authorize', 'credentials/getChallenge', 'signatures/signHash', 'signatures/timestamp'],
          signAlgorithms: { algos: [CSC_OIDS.sha256WithRSA, CSC_OIDS.rsaEncryption, CSC_OIDS.ecdsaWithSha256] },
        },
      };
    }
    if (method === 'auth/login') {
      const m = /^Basic (\S+)$/.exec(authorization ?? '');
      const [user, pw] = m ? Buffer.from(m[1]!, 'base64').toString('utf8').split(':') : [];
      if (user !== (this.#options.userID ?? 'max.mustermann') || pw !== (this.#options.password ?? 'testpasswort')) return error(401, 'invalid_grant', 'Invalid user credentials');
      const token = randomBytes(24).toString('base64url');
      this.#tokens.set(token, this.clock() + 3_600_000);
      return { status: 200, body: { access_token: token, expires_in: 3600 } };
    }
    const denied = this.#bearer(authorization);
    if (denied) return denied;
    const credential = (): MockCredential | Reply => {
      const id = body.credentialID;
      if (typeof id !== 'string') return error(400, 'invalid_request', 'Missing (or invalid type) string parameter credentialID');
      return this.credentials.get(id) ?? error(400, 'invalid_request', 'Invalid parameter credentialID');
    };
    const isReply = (x: unknown): x is Reply => typeof x === 'object' && x !== null && 'status' in x;

    switch (method) {
      case 'credentials/list': {
        if (body.userID !== undefined) return error(400, 'invalid_request', 'userID parameter MUST be null');
        const ids = [...this.credentials.keys()];
        return { status: 200, body: { credentialIDs: ids, ...(body.credentialInfo === true ? { credentialInfos: [...this.credentials.values()].map((c) => this.#credentialInfo(c)) } : {}) } };
      }
      case 'credentials/info': {
        const c = credential();
        if (isReply(c)) return c;
        const { credentialID: _id, ...info } = this.#credentialInfo(c);
        return { status: 200, body: info };
      }
      case 'credentials/getChallenge': {
        const c = credential();
        if (isReply(c)) return c;
        if (body.authObjectID !== 'OTP') return error(400, 'invalid_request', 'Invalid parameter authObjectID');
        const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
        this.#otps.set(c.id, otp);
        this.outbox.push({ credentialID: c.id, otp });
        return { status: 204 };
      }
      case 'credentials/authorize': {
        const c = credential();
        if (isReply(c)) return c;
        if ((this.#failures.get(c.id) ?? 0) >= (this.#options.maxPinAttempts ?? 3)) return error(400, 'invalid_request', 'Credential locked');
        const num = body.numSignatures;
        if (typeof num !== 'number' || !Number.isInteger(num)) return error(400, 'invalid_request', 'Missing (or invalid type) integer parameter numSignatures');
        if (num < 1) return error(400, 'invalid_request', 'Invalid value for parameter numSignatures');
        if (num > 1) return error(400, 'invalid_request', 'Numbers of signatures is too high');
        const hashes = body.hashes;
        // SCAL 2: the SAD is bound to the hashes.
        if (!Array.isArray(hashes) || hashes.length !== num || !hashes.every((h) => typeof h === 'string')) return error(400, 'invalid_request', 'SCAL 2: hashes must be given, one per signature');
        const alg = SHA[String(body.hashAlgorithmOID)];
        if (!alg) return error(400, 'invalid_request', 'Invalid parameter hashAlgorithmOID');
        const auth = Array.isArray(body.authData) ? (body.authData as { id?: unknown; value?: unknown }[]) : [];
        const pin = auth.find((a) => a.id === 'PIN')?.value;
        const otp = auth.find((a) => a.id === 'OTP')?.value;
        const expected = this.#otps.get(c.id);
        if (pin !== c.pin || expected === undefined || otp !== expected) {
          this.#failures.set(c.id, (this.#failures.get(c.id) ?? 0) + 1);
          this.#otps.delete(c.id);
          return error(400, 'invalid_authentication_data', 'The authentication data is invalid');
        }
        this.#otps.delete(c.id); // an OTP is used once
        this.#failures.delete(c.id);
        const sad = randomBytes(24).toString('base64url');
        const lifetime = this.#options.sadLifetimeSeconds ?? 300;
        this.#sads.set(sad, { credentialID: c.id, hashes: new Set(hashes as string[]), remaining: num, expires: this.clock() + lifetime * 1000 });
        return { status: 200, body: { SAD: sad, expiresIn: lifetime } };
      }
      case 'signatures/signHash': {
        const c = credential();
        if (isReply(c)) return c;
        if (typeof body.SAD !== 'string') return error(400, 'invalid_request', 'Missing (or invalid type) string parameter SAD');
        const sad = this.#sads.get(body.SAD);
        if (!sad || sad.credentialID !== c.id) return error(400, 'invalid_request', 'Invalid parameter SAD');
        if (sad.expires < this.clock()) {
          this.#sads.delete(body.SAD);
          return error(400, 'invalid_request', 'SAD expired');
        }
        const hashes = body.hashes;
        if (!Array.isArray(hashes) || !hashes.every((h) => typeof h === 'string')) return error(400, 'invalid_request', 'Missing (or invalid type) array parameter hash');
        if (hashes.length === 0) return error(400, 'invalid_request', 'Empty hash array');
        if (hashes.length > sad.remaining) return error(400, 'invalid_request', 'Numbers of signatures is too high');
        const signAlgo = body.signAlgo;
        if (typeof signAlgo !== 'string') return error(400, 'invalid_request', 'Missing (or invalid type) string parameter signAlgo');
        if (!c.algo.includes(signAlgo)) return error(400, 'invalid_request', 'Invalid parameter signAlgo');
        const implicit: Record<string, string> = { [CSC_OIDS.sha256WithRSA]: CSC_OIDS.sha256, [CSC_OIDS.ecdsaWithSha256]: CSC_OIDS.sha256 };
        const hashOid = implicit[signAlgo] ?? (typeof body.hashAlgorithmOID === 'string' ? body.hashAlgorithmOID : undefined);
        if (!hashOid || !SHA[hashOid]) return error(400, 'invalid_request', 'Missing (or invalid type) string parameter hashAlgorithmOID');
        const out: string[] = [];
        for (const h of hashes as string[]) {
          if (!sad.hashes.has(h)) return error(400, 'invalid_request', 'Hash is not authorized by the SAD.');
          let digest: Uint8Array;
          try {
            digest = base64Decode(h);
          } catch {
            return error(400, 'invalid_request', 'Invalid Base64 hash string parameter');
          }
          if (digest.length !== SHA[hashOid]!.len) return error(400, 'invalid_request', 'Invalid digest value length');
          if (this.#options.tamper === 'sign-other-hash') digest = createHash('sha256').update(digest).digest();
          out.push(toBase64(this.#sign(c, hashOid, digest)));
        }
        sad.remaining -= hashes.length;
        if (sad.remaining <= 0) this.#sads.delete(body.SAD);
        return { status: 200, body: { signatures: out } };
      }
      case 'signatures/timestamp': {
        if (typeof body.hash !== 'string' || body.hash === '') return error(400, 'invalid_request', 'Missing (or invalid type) string parameter hash');
        const alg = SHA[String(body.hashAlgo)];
        if (!alg) return error(400, 'invalid_request', 'Invalid parameter hashAlgo');
        const hash = base64Decode(body.hash);
        if (hash.length !== alg.len) return error(400, 'invalid_request', 'Invalid digest value length');
        const token = await this.tsa.tokenFor(String(body.hashAlgo), hash, typeof body.nonce === 'string' ? body.nonce : undefined);
        return { status: 200, body: { timestamp: toBase64(token) } };
      }
      default:
        return error(404, 'invalid_request', `unknown method ${method}`);
    }
  }

  #sign(c: MockCredential, hashOid: string, digest: Uint8Array): Uint8Array {
    const key: KeyPair = c.issued.key;
    if (key.kind === 'RSA-3072') return rsaSignDigest(key.pkcs8, hashOid, digest);
    const raw = ecdsaSignDigest(key.jwk.d!, digest);
    return this.#options.ecdsaEncoding === 'raw' ? raw : w.ecdsaRawToDer(raw);
  }

  /** Runs the service on 127.0.0.1 with a random port until `close` (tests and evidence only). */
  async listen(): Promise<{ url: string; tsaUrl: string; close: () => Promise<void> }> {
    const server: Server = createServer((req: IncomingMessage, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        void (async () => {
          const path = new URL(req.url ?? '/', 'http://x').pathname;
          const raw = Buffer.concat(chunks);
          if (path === '/tsa') {
            if (req.headers['content-type'] !== 'application/timestamp-query') {
              res.writeHead(415).end();
              return;
            }
            const resp = await this.tsa.respond(new Uint8Array(raw));
            res.writeHead(200, { 'Content-Type': 'application/timestamp-reply' }).end(Buffer.from(resp));
            return;
          }
          if (!path.startsWith('/csc/v2/') || req.method !== 'POST') {
            res.writeHead(404).end();
            return;
          }
          const reply = await this.handle(path.slice('/csc/v2/'.length), req.headers.authorization, raw.toString('utf8'));
          if (reply.body === undefined) res.writeHead(reply.status).end();
          else res.writeHead(reply.status, { 'Content-Type': 'application/json;charset=UTF-8' }).end(JSON.stringify(reply.body));
        })().catch((err) => res.writeHead(500).end(String(err)));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    return {
      url: `http://127.0.0.1:${port}/csc/v2`,
      tsaUrl: `http://127.0.0.1:${port}/tsa`,
      close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
    };
  }
}

/** Standard setup: test PKI, mock TSA, mock RSSP with one RSA and one EC credential. */
export async function createMockRssp(pki: import('./pki.js').TestPki, options: MockCscOptions & { tsa?: MockTsaOptions } = {}): Promise<MockCscService> {
  const tsa = new MockTsa(pki.tsa, options.tsa);
  return new MockCscService(
    [
      { id: 'hpro-rsa-01', issued: pki.signerRsa, chain: [pki.root], description: 'Testdoppel RSA 3072', algo: [CSC_OIDS.sha256WithRSA, CSC_OIDS.rsaEncryption], pin: '123456' },
      { id: 'hpro-ec-01', issued: pki.signerEc, chain: [pki.root], description: 'Testdoppel ECDSA P-256', algo: [CSC_OIDS.ecdsaWithSha256], pin: '123456' },
    ],
    tsa,
    options,
  );
}

/** Authorisation callback that plays the user: requests the OTP, reads it from the outbox, sends PIN and OTP. */
export function explicitUser(service: MockCscService, pin = '123456') {
  return async (req: import('../src/csc.js').CredentialAuthorizationRequest): Promise<import('../src/csc.js').CredentialAuthorization> => {
    await req.client.getChallenge(req.credentialID, 'OTP');
    const otp = service.outbox.at(-1)!.otp;
    return { kind: 'explicit', authData: [{ id: 'PIN', value: pin }, { id: 'OTP', value: otp }] };
  };
}
