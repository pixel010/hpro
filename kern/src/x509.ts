/**
 * X.509 certificates: parsing and signature verification with WebCrypto.
 *
 * Supported keys: RSA (PKCS#1 v1.5) and EC on P-256/P-384/P-521. RSA-PSS and EdDSA are
 * reported as unsupported rather than guessed.
 */
import { concat, equalBytes } from './bytes.js';
import { DerError, TAG, bitStringBytes, children, contextTag, expect, integerHex, oid, parseDer, string, time, type Der } from './der.js';

export type HashName = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

export interface SignatureAlgorithmSpec {
  readonly key: 'RSA' | 'EC';
  readonly hash: HashName;
}

export const OID = {
  rsaEncryption: '1.2.840.113549.1.1.1',
  ecPublicKey: '1.2.840.10045.2.1',
  p256: '1.2.840.10045.3.1.7',
  p384: '1.3.132.0.34',
  p521: '1.3.132.0.35',
  keyUsage: '2.5.29.15',
  basicConstraints: '2.5.29.19',
} as const;

/** Certificate signature algorithms (RFC 4055, RFC 5758). */
const CERT_SIGNATURE_ALGORITHMS: Record<string, SignatureAlgorithmSpec> = {
  '1.2.840.113549.1.1.5': { key: 'RSA', hash: 'SHA-1' },
  '1.2.840.113549.1.1.11': { key: 'RSA', hash: 'SHA-256' },
  '1.2.840.113549.1.1.12': { key: 'RSA', hash: 'SHA-384' },
  '1.2.840.113549.1.1.13': { key: 'RSA', hash: 'SHA-512' },
  '1.2.840.10045.4.1': { key: 'EC', hash: 'SHA-1' },
  '1.2.840.10045.4.3.2': { key: 'EC', hash: 'SHA-256' },
  '1.2.840.10045.4.3.3': { key: 'EC', hash: 'SHA-384' },
  '1.2.840.10045.4.3.4': { key: 'EC', hash: 'SHA-512' },
};

export function certSignatureAlgorithm(algOid: string): SignatureAlgorithmSpec | undefined {
  return CERT_SIGNATURE_ALGORITHMS[algOid];
}

const NAME_ATTRIBUTES: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.4': 'SN',
  '2.5.4.42': 'GN',
  '2.5.4.5': 'SERIALNUMBER',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '2.5.4.97': 'organizationIdentifier',
  '1.2.840.113549.1.9.1': 'E',
};

export interface Certificate {
  /** Complete DER encoding. */
  readonly der: Uint8Array;
  readonly tbs: Uint8Array;
  /** Serial number as hex of the DER INTEGER content. */
  readonly serialHex: string;
  /** DER of the issuer and subject Name, for exact comparisons. */
  readonly issuerDer: Uint8Array;
  readonly subjectDer: Uint8Array;
  /** RFC 4514-like rendering, most significant RDN last (e.g. `CN=…,O=…,C=AT`). */
  readonly issuer: string;
  readonly subject: string;
  readonly notBefore: Date;
  readonly notAfter: Date;
  readonly spki: Uint8Array;
  readonly keyAlgorithm: string;
  readonly curve: string | undefined;
  readonly signatureAlgorithm: string;
  readonly signature: Uint8Array;
  readonly keyUsage: readonly string[] | undefined;
  readonly isCa: boolean;
}

function renderName(name: Der): string {
  const parts: string[] = [];
  for (const rdn of children(expect(name, TAG.SEQUENCE, 'Name'))) {
    const atvs = children(expect(rdn, TAG.SET, 'RDN')).map((atv) => {
      const [type, value] = children(atv);
      const key = NAME_ATTRIBUTES[oid(type!)] ?? oid(type!);
      const text = string(value!).replace(/([,+"\\<>;])/g, '\\$1');
      return `${key}=${text}`;
    });
    parts.push(atvs.join('+'));
  }
  return parts.reverse().join(',');
}

const KEY_USAGE_BITS = ['digitalSignature', 'nonRepudiation', 'keyEncipherment', 'dataEncipherment', 'keyAgreement', 'keyCertSign', 'cRLSign', 'encipherOnly', 'decipherOnly'];

export function parseCertificate(der: Uint8Array): Certificate {
  const cert = parseDer(der);
  const [tbsNode, sigAlgNode, sigNode] = children(expect(cert, TAG.SEQUENCE, 'Certificate'));
  const tbsParts = children(expect(tbsNode, TAG.SEQUENCE, 'TBSCertificate'));
  let i = 0;
  if (tbsParts[0] && contextTag(tbsParts[0]) === 0) i++;
  const serial = expect(tbsParts[i++], TAG.INTEGER, 'serialNumber');
  const innerAlg = expect(tbsParts[i++], TAG.SEQUENCE, 'signature'); // must equal the outer one
  const issuer = expect(tbsParts[i++], TAG.SEQUENCE, 'issuer');
  const [notBefore, notAfter] = children(expect(tbsParts[i++], TAG.SEQUENCE, 'validity'));
  const subject = expect(tbsParts[i++], TAG.SEQUENCE, 'subject');
  const spki = expect(tbsParts[i++], TAG.SEQUENCE, 'subjectPublicKeyInfo');
  const [keyAlg] = children(spki);
  const [keyAlgOid, keyParams] = children(expect(keyAlg, TAG.SEQUENCE, 'AlgorithmIdentifier'));

  let keyUsage: string[] | undefined;
  let isCa = false;
  for (const part of tbsParts.slice(i)) {
    if (contextTag(part) !== 3) continue;
    const [extensions] = children(part);
    for (const ext of children(expect(extensions, TAG.SEQUENCE, 'Extensions'))) {
      const fields = children(ext);
      const extOid = oid(fields[0]!);
      const valueNode = fields[fields.length - 1]!;
      const inner = parseDer(expect(valueNode, TAG.OCTET_STRING, 'extnValue').value);
      if (extOid === OID.keyUsage) {
        const bits = inner.value;
        keyUsage = [];
        for (let b = 0; b < KEY_USAGE_BITS.length; b++) {
          const byte = bits[1 + (b >> 3)];
          if (byte !== undefined && byte & (0x80 >> (b & 7))) keyUsage.push(KEY_USAGE_BITS[b]!);
        }
      } else if (extOid === OID.basicConstraints) {
        const bc = children(inner);
        isCa = bc[0]?.tag === TAG.BOOLEAN && bc[0].value[0] !== 0;
      }
    }
  }

  const outerAlg = expect(sigAlgNode, TAG.SEQUENCE, 'signatureAlgorithm');
  if (!equalBytes(innerAlg.raw, outerAlg.raw)) throw new DerError('signature algorithm in TBSCertificate differs from outer one');

  return {
    der,
    tbs: tbsNode!.raw,
    serialHex: integerHex(serial),
    issuerDer: issuer.raw,
    subjectDer: subject.raw,
    issuer: renderName(issuer),
    subject: renderName(subject),
    notBefore: time(notBefore!),
    notAfter: time(notAfter!),
    spki: spki.raw,
    keyAlgorithm: oid(keyAlgOid!),
    curve: keyParams?.tag === TAG.OID ? oid(keyParams) : undefined,
    signatureAlgorithm: oid(children(outerAlg)[0]!),
    signature: bitStringBytes(expect(sigNode, TAG.BIT_STRING, 'signatureValue')),
    keyUsage,
    isCa,
  };
}


export function sameName(a: Uint8Array, b: Uint8Array): boolean {
  return equalBytes(a, b);
}

const CURVES: Record<string, { name: string; size: number }> = {
  [OID.p256]: { name: 'P-256', size: 32 },
  [OID.p384]: { name: 'P-384', size: 48 },
  [OID.p521]: { name: 'P-521', size: 66 },
};

export class UnsupportedAlgorithmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedAlgorithmError';
  }
}

/**
 * Verifies `signature` over `data` with the certificate's public key.
 * `signatureFormat` `raw` is r‖s for ECDSA (XML-DSig, RFC 4050), `der` is the
 * ASN.1 SEQUENCE used in X.509 and CMS.
 */
export async function verifyWithCertificate(
  cert: Certificate,
  alg: SignatureAlgorithmSpec,
  signature: Uint8Array,
  data: Uint8Array,
  signatureFormat: 'raw' | 'der',
): Promise<boolean> {
  const spki = new Uint8Array(cert.spki);
  const payload = new Uint8Array(data);
  if (alg.key === 'RSA') {
    if (cert.keyAlgorithm !== OID.rsaEncryption) throw new UnsupportedAlgorithmError(`RSA signature but key algorithm ${cert.keyAlgorithm}`);
    const key = await crypto.subtle.importKey('spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: alg.hash }, false, ['verify']);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, new Uint8Array(signature), payload);
  }
  if (cert.keyAlgorithm !== OID.ecPublicKey) throw new UnsupportedAlgorithmError(`ECDSA signature but key algorithm ${cert.keyAlgorithm}`);
  const curve = cert.curve ? CURVES[cert.curve] : undefined;
  if (!curve) throw new UnsupportedAlgorithmError(`unsupported EC curve ${cert.curve ?? '(none)'}`);
  const key = await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: curve.name }, false, ['verify']);
  const raw = signatureFormat === 'der' ? ecdsaDerToRaw(signature, curve.size) : signature;
  if (raw === undefined || raw.length !== 2 * curve.size) return false;
  return crypto.subtle.verify({ name: 'ECDSA', hash: alg.hash }, key, new Uint8Array(raw), payload);
}

function ecdsaDerToRaw(sig: Uint8Array, size: number): Uint8Array | undefined {
  try {
    const [r, s] = children(expect(parseDer(sig), TAG.SEQUENCE, 'ECDSA-Sig-Value'));
    const fit = (n: Der | undefined): Uint8Array | undefined => {
      let v = expect(n, TAG.INTEGER, 'ECDSA integer').value;
      while (v.length > size && v[0] === 0) v = v.subarray(1);
      if (v.length > size) return undefined;
      const out = new Uint8Array(size);
      out.set(v, size - v.length);
      return out;
    };
    const rr = fit(r);
    const ss = fit(s);
    return rr && ss ? concat([rr, ss]) : undefined;
  } catch {
    return undefined;
  }
}

/** Checks that `cert` was signed by `issuer` (name match and signature). */
export async function isIssuedBy(cert: Certificate, issuer: Certificate): Promise<boolean> {
  if (!sameName(cert.issuerDer, issuer.subjectDer)) return false;
  const alg = certSignatureAlgorithm(cert.signatureAlgorithm);
  if (!alg) return false;
  try {
    return await verifyWithCertificate(issuer, alg, cert.signature, cert.tbs, 'der');
  } catch {
    return false;
  }
}

/** PEM (one or more CERTIFICATE blocks) or DER to a list of DER certificates. */
export function certificatesFromPem(pem: string): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const m of pem.matchAll(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g)) {
    out.push(base64Decode(m[1]!));
  }
  return out;
}

/** Strict base64 decoding that ignores XML whitespace. Throws on invalid characters. */
export function base64Decode(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.replace(/[\s]+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) throw new DerError('invalid base64');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
