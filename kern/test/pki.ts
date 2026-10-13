// Test PKI for package P10: a root CA that issues signing and TSA certificates, built with
// WebCrypto and the core's DER writer. Nothing here is qualified or trusted outside tests.
import * as w from '../src/der-write.js';
import { bitStringBytes, children, parseDer } from '../src/der.js';
import { hexToBytes } from '../src/bytes.js';
import { OID, parseCertificate, type Certificate } from '../src/x509.js';

export type KeyKind = 'RSA-3072' | 'EC-P256';

export interface KeyPair {
  readonly kind: KeyKind;
  readonly privateKey: CryptoKey;
  readonly publicKey: CryptoKey;
  readonly spki: Uint8Array;
  readonly pkcs8: Uint8Array;
  /** JWK of the private key (the mock RSSP needs `d` for ECDSA over a precomputed hash). */
  readonly jwk: JsonWebKey;
}

export async function generateKeyPair(kind: KeyKind): Promise<KeyPair> {
  const params: RsaHashedKeyGenParams | EcKeyGenParams =
    kind === 'RSA-3072' ? { name: 'RSASSA-PKCS1-v1_5', modulusLength: 3072, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' } : { name: 'ECDSA', namedCurve: 'P-256' };
  const pair = (await crypto.subtle.generateKey(params, true, ['sign', 'verify'])) as CryptoKeyPair;
  return {
    kind,
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    spki: new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)),
    pkcs8: new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
    jwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
  };
}

const OID_SHA256_RSA = '1.2.840.113549.1.1.11';
const OID_ECDSA_SHA256 = '1.2.840.10045.4.3.2';
const OID_SKI = '2.5.29.14';
const OID_AKI = '2.5.29.35';

export function signatureAlgorithmId(kind: KeyKind): Uint8Array {
  return kind === 'RSA-3072' ? w.sequence(w.objectIdentifier(OID_SHA256_RSA), w.nullValue()) : w.sequence(w.objectIdentifier(OID_ECDSA_SHA256));
}

/** Signs `data` with SHA-256; returns the DER form used in X.509 and CMS. */
export async function signDer(key: KeyPair, data: Uint8Array): Promise<Uint8Array> {
  const params = key.kind === 'RSA-3072' ? { name: 'RSASSA-PKCS1-v1_5' } : { name: 'ECDSA', hash: 'SHA-256' };
  const raw = new Uint8Array(await crypto.subtle.sign(params, key.privateKey, new Uint8Array(data)));
  return key.kind === 'RSA-3072' ? raw : w.ecdsaRawToDer(raw);
}

export interface NameSpec {
  readonly cn: string;
  readonly o?: string;
  readonly ou?: string;
  readonly c?: string;
}

export function encodeName(n: NameSpec): Uint8Array {
  const rdn = (oid: string, value: Uint8Array) => w.set(w.sequence(w.objectIdentifier(oid), value));
  return w.sequence(
    rdn('2.5.4.6', w.printableString(n.c ?? 'AT')),
    rdn('2.5.4.10', w.utf8String(n.o ?? 'hpro Test')),
    ...(n.ou ? [rdn('2.5.4.11', w.utf8String(n.ou))] : []),
    rdn('2.5.4.3', w.utf8String(n.cn)),
  );
}

function extension(oid: string, critical: boolean, value: Uint8Array): Uint8Array {
  return w.sequence(w.objectIdentifier(oid), ...(critical ? [w.boolean(true)] : []), w.octetString(value));
}

async function keyId(spki: Uint8Array): Promise<Uint8Array> {
  const bits = bitStringBytes(children(parseDer(spki))[1]!);
  return new Uint8Array(await crypto.subtle.digest('SHA-1', new Uint8Array(bits)));
}

export interface Issued {
  readonly der: Uint8Array;
  readonly cert: Certificate;
  readonly key: KeyPair;
  readonly name: Uint8Array;
}

export interface IssueOptions {
  readonly subject: NameSpec;
  readonly key: KeyPair;
  /** Issuer; self-signed when absent. */
  readonly issuer?: Issued;
  readonly ca?: boolean;
  /** keyUsage as first octet and number of unused bits. */
  readonly keyUsage: { readonly bits: number; readonly unused: number };
  readonly extendedKeyUsage?: readonly string[];
  readonly ekuCritical?: boolean;
  readonly notBefore?: Date;
  readonly validDays?: number;
}

export async function issueCertificate(o: IssueOptions): Promise<Issued> {
  const notBefore = o.notBefore ?? new Date(Math.floor(Date.now() / 1000) * 1000 - 3_600_000);
  const notAfter = new Date(notBefore.getTime() + (o.validDays ?? 3650) * 86_400_000);
  const subject = encodeName(o.subject);
  const issuerName = o.issuer?.name ?? subject;
  const signingKey = o.issuer?.key ?? o.key;
  const serial = crypto.getRandomValues(new Uint8Array(16));
  serial[0] = (serial[0]! & 0x7f) | 0x40;
  const exts = [
    extension(OID.basicConstraints, true, o.ca ? w.sequence(w.boolean(true)) : w.sequence()),
    extension(OID.keyUsage, true, w.bitString(Uint8Array.of(o.keyUsage.bits), o.keyUsage.unused)),
    extension(OID_SKI, false, w.octetString(await keyId(o.key.spki))),
    extension(OID_AKI, false, w.sequence(w.implicit(0, await keyId(signingKey.spki)))),
  ];
  if (o.extendedKeyUsage) exts.push(extension(OID.extendedKeyUsage, o.ekuCritical ?? true, w.sequence(...o.extendedKeyUsage.map((e) => w.objectIdentifier(e)))));
  const sigAlg = signatureAlgorithmId(signingKey.kind);
  const tbs = w.sequence(
    w.explicit(0, w.smallInteger(2)),
    w.unsignedInteger(serial),
    sigAlg,
    issuerName,
    w.sequence(w.time(notBefore), w.time(notAfter)),
    subject,
    o.key.spki,
    w.explicit(3, w.sequence(...exts)),
  );
  const der = w.sequence(tbs, sigAlg, w.bitString(await signDer(signingKey, tbs)));
  return { der, cert: parseCertificate(der), key: o.key, name: subject };
}

/** keyUsage presets (RFC 5280 §4.2.1.3). */
export const KU = {
  signature: { bits: 0xc0, unused: 6 }, // digitalSignature, nonRepudiation
  digitalSignature: { bits: 0x80, unused: 7 },
  ca: { bits: 0x06, unused: 1 }, // keyCertSign, cRLSign
} as const;

export interface TestPki {
  readonly root: Issued;
  readonly signerRsa: Issued;
  readonly signerEc: Issued;
  readonly tsa: Issued;
}

/**
 * Root CA (EC P-256) issuing two signing certificates (RSA 3072, EC P-256) and one TSA
 * certificate with critical extended key usage `timeStamping` (RFC 3161 §2.3).
 */
export async function createTestPki(): Promise<TestPki> {
  const root = await issueCertificate({ subject: { cn: 'hpro Mock-RSSP Test-Wurzel-CA', o: 'hpro Testdoppel' }, key: await generateKeyPair('EC-P256'), ca: true, keyUsage: KU.ca });
  const signerRsa = await issueCertificate({ subject: { cn: 'Max Mustermann (Testdoppel RSA)', o: 'hpro Testdoppel' }, key: await generateKeyPair('RSA-3072'), issuer: root, keyUsage: KU.signature, validDays: 730 });
  const signerEc = await issueCertificate({ subject: { cn: 'Max Mustermann (Testdoppel EC)', o: 'hpro Testdoppel' }, key: await generateKeyPair('EC-P256'), issuer: root, keyUsage: KU.signature, validDays: 730 });
  const tsa = await issueCertificate({
    subject: { cn: 'hpro Mock-TSA', o: 'hpro Testdoppel' },
    key: await generateKeyPair('EC-P256'),
    issuer: root,
    keyUsage: KU.digitalSignature,
    extendedKeyUsage: [OID.kpTimeStamping],
    validDays: 730,
  });
  return { root, signerRsa, signerEc, tsa };
}

/** CRL v2 signed by `issuer` (RFC 5280 §5), listing `revoked` serial numbers. */
export async function issueCrl(issuer: Issued, revoked: readonly { serialHex: string; at: Date }[] = [], options: { thisUpdate?: Date; nextUpdate?: Date } = {}): Promise<Uint8Array> {
  const thisUpdate = options.thisUpdate ?? new Date(Math.floor(Date.now() / 1000) * 1000 - 60_000);
  const nextUpdate = options.nextUpdate ?? new Date(thisUpdate.getTime() + 7 * 86_400_000);
  const sigAlg = signatureAlgorithmId(issuer.key.kind);
  const entries = revoked.map((r) => w.sequence(w.tlv(0x02, hexToBytes(r.serialHex)), w.time(r.at)));
  const tbs = w.sequence(w.smallInteger(1), sigAlg, issuer.name, w.time(thisUpdate), w.time(nextUpdate), ...(entries.length ? [w.sequence(...entries)] : []));
  return w.sequence(tbs, sigAlg, w.bitString(await signDer(issuer.key, tbs)));
}
