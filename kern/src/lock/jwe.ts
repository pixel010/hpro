/**
 * JSON Web Encryption (RFC 7516) in the General JSON Serialization, with WebCrypto only.
 * Used for sealed sections (HPC-0007): one content key per section, wrapped for every
 * recipient.
 *
 * Supported algorithms (RFC 7518):
 *   enc  A256GCM                      content encryption, 96-bit IV, 128-bit tag (§5.3)
 *   alg  PBES2-HS512+A256KW           password: PBKDF2-HMAC-SHA-512, AES key wrap (§4.8)
 *        RSA-OAEP-256                 RSA public key, OAEP with SHA-256 (§4.3)
 *        ECDH-ES+A256KW               EC public key P-256/P-384/P-521, Concat KDF, AES key wrap (§4.6)
 *
 * The protected header is the additional authenticated data of AES-GCM (RFC 7516 §5.1, step 14),
 * so everything in it (including `hp-target`, the address the content belongs to) is bound to
 * the ciphertext. Recipient certificates are named by `x5t#S256` (RFC 7515 §4.1.8).
 */
import { concat, fromUtf8, toHex, utf8 } from '../bytes.js';
import { sha256 } from '../hash.js';
import { OID, parseCertificate } from '../x509.js';

export type KeyAlgorithm = 'PBES2-HS512+A256KW' | 'RSA-OAEP-256' | 'ECDH-ES+A256KW';

/** RFC 7516 §7.2.1. */
export interface JweGeneral {
  readonly protected: string;
  readonly unprotected?: Record<string, unknown>;
  readonly recipients: ReadonlyArray<{ readonly header: Record<string, unknown>; readonly encrypted_key: string }>;
  readonly iv: string;
  readonly ciphertext: string;
  readonly tag: string;
}

export type Recipient =
  /** Password recipient; `iterations` default 600 000 (OWASP 2023 for PBKDF2-HMAC-SHA-256 is 600 000, for SHA-512 210 000; the higher value is used). */
  | { readonly password: string; readonly iterations?: number }
  /** Certificate (DER) with an RSA key (RSA-OAEP-256) or an EC key P-256/P-384/P-521 (ECDH-ES+A256KW). */
  | { readonly certificate: Uint8Array };

/** What opens an envelope: a password, or a private key (PKCS#8) with its certificate. */
export type Opener = { readonly password: string } | { readonly pkcs8: Uint8Array; readonly certificate: Uint8Array };

export class JweError extends Error {
  constructor(
    readonly code: 'format' | 'no-recipient' | 'decrypt' | 'unsupported' | 'limits',
    message: string,
  ) {
    super(message);
    this.name = 'JweError';
  }
}

export const DEFAULT_ITERATIONS = 600_000;
/** Upper bound when opening, so that a hostile document cannot make the reader spin (RFC 7518 §8.8 asks for a limit). */
export const MAX_ITERATIONS = 2_000_000;
export const MIN_ITERATIONS = 100_000;
export const MIN_PASSWORD_LENGTH = 12;

// --- base64url (RFC 4648 §5, no padding) -----------------------------------------------

export function b64u(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64u(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new JweError('format', 'invalid base64url');
  const pad = text.length % 4 === 2 ? '==' : text.length % 4 === 3 ? '=' : '';
  if (text.length % 4 === 1) throw new JweError('format', 'invalid base64url length');
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

const u32 = (n: number) => Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
const buf = (b: Uint8Array) => new Uint8Array(b);

/** SHA-256 thumbprint of a certificate (`x5t#S256`). */
export async function certificateThumbprint(certificate: Uint8Array): Promise<string> {
  return b64u(await sha256(certificate));
}

// --- key derivation and wrapping ------------------------------------------------------

async function pbes2Kek(password: string, p2s: Uint8Array, p2c: number): Promise<CryptoKey> {
  const salt = concat([utf8('PBES2-HS512+A256KW'), Uint8Array.of(0), p2s]);
  const base = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-512', salt: buf(salt), iterations: p2c }, base, 256);
  return crypto.subtle.importKey('raw', bits, 'AES-KW', false, ['wrapKey', 'unwrapKey']);
}

/** Concat KDF of NIST SP 800-56A as profiled by RFC 7518 §4.6.2 (one round of SHA-256 for 256 bits). */
async function concatKdf(z: Uint8Array, algorithm: string, apu: Uint8Array, apv: Uint8Array): Promise<CryptoKey> {
  const alg = utf8(algorithm);
  const otherInfo = concat([u32(alg.length), alg, u32(apu.length), apu, u32(apv.length), apv, u32(256)]);
  const digest = await crypto.subtle.digest('SHA-256', buf(concat([u32(1), z, otherInfo])));
  return crypto.subtle.importKey('raw', digest, 'AES-KW', false, ['wrapKey', 'unwrapKey']);
}

const CURVES: Record<string, { bits: number; coord: number }> = { 'P-256': { bits: 256, coord: 32 }, 'P-384': { bits: 384, coord: 48 }, 'P-521': { bits: 528, coord: 66 } };

const CURVE_NAMES: Record<string, string> = { [OID.p256]: 'P-256', [OID.p384]: 'P-384', [OID.p521]: 'P-521' };

interface RecipientKey {
  readonly kind: 'rsa' | 'ec';
  readonly curve?: string;
  readonly spki: Uint8Array;
  readonly thumbprint: string;
}

async function recipientKey(certificate: Uint8Array): Promise<RecipientKey> {
  const cert = parseCertificate(certificate);
  const thumbprint = await certificateThumbprint(certificate);
  if (cert.keyUsage && !cert.keyUsage.includes('keyEncipherment') && !cert.keyUsage.includes('keyAgreement')) {
    throw new JweError('unsupported', `certificate ${cert.subject} is not meant for encryption (keyUsage ${cert.keyUsage.join(', ')})`);
  }
  if (cert.keyAlgorithm === OID.rsaEncryption) return { kind: 'rsa', spki: cert.spki, thumbprint };
  const curve = cert.curve ? CURVE_NAMES[cert.curve] : undefined;
  if (cert.keyAlgorithm === OID.ecPublicKey && curve) return { kind: 'ec', curve, spki: cert.spki, thumbprint };
  throw new JweError('unsupported', `certificate key ${cert.keyAlgorithm}${cert.curve ? ' ' + cert.curve : ''} is not supported (RSA, EC P-256/P-384/P-521)`);
}

async function wrapFor(recipient: Recipient, cek: CryptoKey): Promise<{ header: Record<string, unknown>; encrypted_key: string }> {
  if ('password' in recipient) {
    if (recipient.password.length < MIN_PASSWORD_LENGTH) throw new JweError('limits', `password must have at least ${MIN_PASSWORD_LENGTH} characters`);
    const p2c = recipient.iterations ?? DEFAULT_ITERATIONS;
    if (!Number.isInteger(p2c) || p2c < MIN_ITERATIONS || p2c > MAX_ITERATIONS) throw new JweError('limits', `iterations must be ${MIN_ITERATIONS}…${MAX_ITERATIONS}`);
    const p2s = crypto.getRandomValues(new Uint8Array(16));
    const kek = await pbes2Kek(recipient.password, p2s, p2c);
    const wrapped = new Uint8Array(await crypto.subtle.wrapKey('raw', cek, kek, 'AES-KW'));
    return { header: { alg: 'PBES2-HS512+A256KW', p2s: b64u(p2s), p2c }, encrypted_key: b64u(wrapped) };
  }
  const key = await recipientKey(recipient.certificate);
  if (key.kind === 'rsa') {
    const pub = await crypto.subtle.importKey('spki', buf(key.spki), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['wrapKey']);
    const wrapped = new Uint8Array(await crypto.subtle.wrapKey('raw', cek, pub, { name: 'RSA-OAEP' }));
    return { header: { alg: 'RSA-OAEP-256', 'x5t#S256': key.thumbprint }, encrypted_key: b64u(wrapped) };
  }
  const curve = key.curve!;
  const pub = await crypto.subtle.importKey('spki', buf(key.spki), { name: 'ECDH', namedCurve: curve }, false, []);
  const eph = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: curve }, true, ['deriveBits'])) as CryptoKeyPair;
  const z = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, eph.privateKey, CURVES[curve]!.bits));
  const kek = await concatKdf(z, 'ECDH-ES+A256KW', new Uint8Array(0), new Uint8Array(0));
  const wrapped = new Uint8Array(await crypto.subtle.wrapKey('raw', cek, kek, 'AES-KW'));
  const jwk = await crypto.subtle.exportKey('jwk', eph.publicKey);
  return { header: { alg: 'ECDH-ES+A256KW', epk: { kty: 'EC', crv: curve, x: jwk.x, y: jwk.y }, 'x5t#S256': key.thumbprint }, encrypted_key: b64u(wrapped) };
}

/**
 * Encrypts `plaintext` for all recipients. `header` goes into the protected header (with
 * `enc: "A256GCM"`), so it is authenticated together with the content.
 */
export async function encryptJwe(plaintext: Uint8Array, header: Record<string, unknown>, recipients: readonly Recipient[]): Promise<JweGeneral> {
  if (recipients.length === 0) throw new JweError('no-recipient', 'at least one recipient is required');
  const cek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const prot = b64u(utf8(JSON.stringify({ enc: 'A256GCM', ...header })));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8(prot), tagLength: 128 }, cek, buf(plaintext)));
  const list = [];
  for (const r of recipients) list.push(await wrapFor(r, cek));
  return { protected: prot, recipients: list, iv: b64u(iv), ciphertext: b64u(sealed.subarray(0, sealed.length - 16)), tag: b64u(sealed.subarray(sealed.length - 16)) };
}

export function parseJwe(bytes: Uint8Array): JweGeneral {
  let v: unknown;
  try {
    v = JSON.parse(fromUtf8(bytes));
  } catch (err) {
    throw new JweError('format', `envelope is not JSON: ${(err as Error).message}`);
  }
  const o = v as Record<string, unknown>;
  const str = (k: string) => typeof o[k] === 'string';
  if (!o || typeof o !== 'object' || !str('protected') || !str('iv') || !str('ciphertext') || !str('tag') || !Array.isArray(o.recipients)) {
    throw new JweError('format', 'envelope is not a JWE in General JSON Serialization (protected, recipients, iv, ciphertext, tag)');
  }
  for (const r of o.recipients as unknown[]) {
    const x = r as Record<string, unknown>;
    if (!x || typeof x !== 'object' || typeof x.encrypted_key !== 'string' || !x.header || typeof x.header !== 'object') throw new JweError('format', 'recipient without header or encrypted_key');
  }
  return o as unknown as JweGeneral;
}

/** The protected header, decoded (not authenticated until decryption succeeded). */
export function protectedHeader(jwe: JweGeneral): Record<string, unknown> {
  try {
    return JSON.parse(fromUtf8(fromB64u(jwe.protected))) as Record<string, unknown>;
  } catch {
    throw new JweError('format', 'protected header is not base64url JSON');
  }
}

async function unwrapWith(opener: Opener, jwe: JweGeneral): Promise<CryptoKey> {
  const candidates: Array<{ header: Record<string, unknown>; encrypted_key: string }> = [];
  let thumbprint: string | undefined;
  if ('password' in opener) candidates.push(...jwe.recipients.filter((r) => r.header.alg === 'PBES2-HS512+A256KW'));
  else {
    thumbprint = await certificateThumbprint(opener.certificate);
    candidates.push(...jwe.recipients.filter((r) => r.header['x5t#S256'] === thumbprint));
  }
  if (candidates.length === 0) throw new JweError('no-recipient', 'password' in opener ? 'the section is not sealed for a password' : 'the section is not sealed for this certificate');
  let lastError: unknown;
  for (const r of candidates) {
    try {
      const wrapped = fromB64u(r.encrypted_key);
      const alg = r.header.alg;
      if (alg === 'PBES2-HS512+A256KW' && 'password' in opener) {
        const p2c = r.header.p2c;
        if (typeof p2c !== 'number' || !Number.isInteger(p2c) || p2c < 1000 || p2c > MAX_ITERATIONS) throw new JweError('limits', `p2c ${String(p2c)} outside 1000…${MAX_ITERATIONS}`);
        const kek = await pbes2Kek(opener.password, fromB64u(String(r.header.p2s ?? '')), p2c);
        return await crypto.subtle.unwrapKey('raw', wrapped, kek, 'AES-KW', 'AES-GCM', false, ['decrypt']);
      }
      if (alg === 'RSA-OAEP-256' && 'pkcs8' in opener) {
        const priv = await crypto.subtle.importKey('pkcs8', buf(opener.pkcs8), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['unwrapKey']);
        return await crypto.subtle.unwrapKey('raw', wrapped, priv, { name: 'RSA-OAEP' }, 'AES-GCM', false, ['decrypt']);
      }
      if (alg === 'ECDH-ES+A256KW' && 'pkcs8' in opener) {
        const epk = r.header.epk as { kty?: string; crv?: string; x?: string; y?: string } | undefined;
        if (!epk || epk.kty !== 'EC' || !epk.crv || !CURVES[epk.crv] || !epk.x || !epk.y) throw new JweError('format', 'epk missing or not an EC key');
        const cert = parseCertificate(opener.certificate);
        if (CURVE_NAMES[cert.curve ?? ''] !== epk.crv) throw new JweError('format', `epk curve ${epk.crv} does not match the certificate (${cert.curve})`);
        const priv = await crypto.subtle.importKey('pkcs8', buf(opener.pkcs8), { name: 'ECDH', namedCurve: epk.crv }, false, ['deriveBits']);
        const pub = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: epk.crv, x: epk.x, y: epk.y, ext: true }, { name: 'ECDH', namedCurve: epk.crv }, false, []);
        const z = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, CURVES[epk.crv]!.bits));
        const apu = typeof r.header.apu === 'string' ? fromB64u(r.header.apu) : new Uint8Array(0);
        const apv = typeof r.header.apv === 'string' ? fromB64u(r.header.apv) : new Uint8Array(0);
        const kek = await concatKdf(z, 'ECDH-ES+A256KW', apu, apv);
        return await crypto.subtle.unwrapKey('raw', wrapped, kek, 'AES-KW', 'AES-GCM', false, ['decrypt']);
      }
      throw new JweError('unsupported', `key algorithm ${String(alg)} is not supported`);
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError instanceof JweError && lastError.code !== 'decrypt') throw lastError;
  throw new JweError('decrypt', 'password' in opener ? 'wrong password' : 'the key does not open this section');
}

/** Decrypts a JWE; throws `JweError` with code `decrypt` for a wrong key or any change to header, IV, ciphertext or tag. */
export async function decryptJwe(jwe: JweGeneral, opener: Opener): Promise<{ plaintext: Uint8Array; header: Record<string, unknown> }> {
  const header = protectedHeader(jwe);
  if (header.enc !== 'A256GCM') throw new JweError('unsupported', `content encryption ${String(header.enc)} is not supported (A256GCM)`);
  if (header.zip !== undefined) throw new JweError('unsupported', 'compressed JWE (zip) is not supported');
  if (Array.isArray(header.crit) && header.crit.length > 0) throw new JweError('unsupported', `critical header parameters ${header.crit.join(', ')} are not understood`);
  const cek = await unwrapWith(opener, jwe);
  const iv = fromB64u(jwe.iv);
  if (iv.length !== 12) throw new JweError('format', 'iv must have 96 bits');
  const tag = fromB64u(jwe.tag);
  if (tag.length !== 16) throw new JweError('format', 'tag must have 128 bits');
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: utf8(jwe.protected), tagLength: 128 }, cek, buf(concat([fromB64u(jwe.ciphertext), tag])));
    return { plaintext: new Uint8Array(plain), header };
  } catch {
    throw new JweError('decrypt', 'authentication failed: the envelope was changed or does not belong to this key');
  }
}

/** Hex SHA-256 of a certificate, for messages. */
export async function certificateId(certificate: Uint8Array): Promise<string> {
  return toHex(await sha256(certificate)).slice(0, 16);
}
