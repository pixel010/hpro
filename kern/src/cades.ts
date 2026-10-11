/**
 * CAdES signatures in ASiC-E containers (ETSI EN 319 162-1, 4.4.4).
 *
 * html-Pro itself writes XAdES only (docs/05, 6.1: CAdES requires the ASiC mimetype), but the
 * reader must judge foreign ASiC-E containers and the prototype cases V6 correctly. Each
 * `META-INF/*signature*.p7s` is a detached CMS SignedData over an ASiC manifest
 * (`META-INF/ASiCManifest*.xml`) whose `SigReference` names the signature; the manifest lists
 * the digests of the data files.
 */
import { DOMParser, type Document, type Element } from '@xmldom/xmldom';
import { equalBytes, fromUtf8 } from './bytes.js';
import { DerError, TAG, children, contextTag, expect, integerHex, oid, parseDer, time, type Der } from './der.js';
import {
  buildChain,
  decide,
  digest,
  newLog,
  referenceToPath,
  verdictMessages,
  type BuildingBlocks,
  type CheckLog,
  type ReferenceCheck,
} from './sigcommon.js';
import { DIGEST_METHODS, NS, withContainerChecks } from './xades.js';
import { UnsupportedAlgorithmError, base64Decode, certSignatureAlgorithm, parseCertificate, sameName, verifyWithCertificate, type Certificate, type HashName, type SignatureAlgorithmSpec } from './x509.js';
import type { XadesResult } from './xades.js';

const OIDS = {
  signedData: '1.2.840.113549.1.7.2',
  contentType: '1.2.840.113549.1.9.3',
  messageDigest: '1.2.840.113549.1.9.4',
  signingTime: '1.2.840.113549.1.9.5',
  signingCertificate: '1.2.840.113549.1.9.16.2.12',
  signingCertificateV2: '1.2.840.113549.1.9.16.2.47',
  signatureTimeStamp: '1.2.840.113549.1.9.16.2.14',
  rsaEncryption: '1.2.840.113549.1.1.1',
  ecdsaWithSha: '1.2.840.10045.4.3',
} as const;

const DIGEST_OIDS: Record<string, HashName> = {
  '1.3.14.3.2.26': 'SHA-1',
  '2.16.840.1.101.3.4.2.1': 'SHA-256',
  '2.16.840.1.101.3.4.2.2': 'SHA-384',
  '2.16.840.1.101.3.4.2.3': 'SHA-512',
};

export interface CadesContext {
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly signaturePath: string;
  readonly trustAnchors: readonly Certificate[];
  readonly validationTime: Date;
  readonly containerChecks?: (signedPaths: readonly string[]) => CheckLog;
}

/** Same result shape as XAdES so that the container validator treats both alike. */
export type CadesResult = XadesResult;

interface AsicManifest {
  readonly path: string;
  readonly references: readonly { uri: string; digestUri: string; digest: Uint8Array | undefined }[];
}

/** Finds the ASiC manifest whose `SigReference/@URI` is `signaturePath`. */
function findAsicManifest(files: ReadonlyMap<string, Uint8Array>, signaturePath: string, fc: CheckLog): AsicManifest | undefined {
  const matches: AsicManifest[] = [];
  for (const [path, bytes] of files) {
    if (!/^META-INF\/[^/]*ASiCManifest[^/]*\.xml$/i.test(path)) continue;
    let doc: Document;
    try {
      const text = fromUtf8(bytes);
      if (/<!DOCTYPE/i.test(text)) throw new Error('DOCTYPE');
      doc = new DOMParser().parseFromString(text, 'application/xml');
    } catch {
      fc.warnings.push(`unreadable ASiC manifest ${path}`);
      continue;
    }
    const root = doc.documentElement;
    if (!root || root.namespaceURI !== NS.asic || root.localName !== 'ASiCManifest') continue;
    const els = Array.from(root.childNodes).filter((n): n is Element => n.nodeType === 1);
    const sigRef = els.find((e) => e.localName === 'SigReference');
    if (sigRef?.getAttribute('URI') !== signaturePath) continue;
    matches.push({
      path,
      references: els
        .filter((e) => e.localName === 'DataObjectReference')
        .map((e) => {
          const kids = Array.from(e.childNodes).filter((n): n is Element => n.nodeType === 1 && n.namespaceURI === NS.ds);
          let value: Uint8Array | undefined;
          try {
            value = base64Decode(kids.find((k) => k.localName === 'DigestValue')?.textContent ?? '');
          } catch {
            value = undefined;
          }
          return { uri: e.getAttribute('URI') ?? '', digestUri: kids.find((k) => k.localName === 'DigestMethod')?.getAttribute('Algorithm') ?? '', digest: value };
        }),
    });
  }
  if (matches.length > 1) fc.errors.push(`more than one ASiC manifest refers to ${signaturePath}`);
  return matches[0];
}

interface SignerInfo {
  readonly issuerDer: Uint8Array | undefined;
  readonly serialHex: string | undefined;
  readonly digestHash: HashName | undefined;
  readonly digestOid: string;
  readonly signedAttrs: Der | undefined;
  readonly signatureAlgOid: string;
  readonly signature: Uint8Array;
  readonly unsignedAttrs: Der | undefined;
}

function parseSignedData(bytes: Uint8Array): { certs: Certificate[]; signers: SignerInfo[]; eContentPresent: boolean } {
  const [typeNode, content] = children(expect(parseDer(bytes), TAG.SEQUENCE, 'ContentInfo'));
  if (oid(typeNode!) !== OIDS.signedData) throw new DerError('not a CMS SignedData');
  const [signedData] = children(content!);
  const parts = children(expect(signedData, TAG.SEQUENCE, 'SignedData'));
  const encap = children(expect(parts[2], TAG.SEQUENCE, 'EncapsulatedContentInfo'));
  const certs: Certificate[] = [];
  let signerSet: Der | undefined;
  for (const p of parts.slice(3)) {
    if (contextTag(p) === 0) for (const c of children(p)) if (c.tag === TAG.SEQUENCE) certs.push(parseCertificate(c.raw));
    if (p.tag === TAG.SET) signerSet = p;
  }
  const signers = children(expect(signerSet, TAG.SET, 'SignerInfos')).map((si): SignerInfo => {
    const f = children(expect(si, TAG.SEQUENCE, 'SignerInfo'));
    let i = 1;
    const sid = f[i++]!;
    let issuerDer: Uint8Array | undefined;
    let serialHex: string | undefined;
    if (sid.tag === TAG.SEQUENCE) {
      const [issuer, serial] = children(sid);
      issuerDer = issuer!.raw;
      serialHex = integerHex(serial!);
    }
    const digestOid = oid(children(expect(f[i++], TAG.SEQUENCE, 'digestAlgorithm'))[0]!);
    let signedAttrs: Der | undefined;
    if (f[i] && contextTag(f[i]!) === 0) signedAttrs = f[i++];
    const signatureAlgOid = oid(children(expect(f[i++], TAG.SEQUENCE, 'signatureAlgorithm'))[0]!);
    const signature = expect(f[i++], TAG.OCTET_STRING, 'signature').value;
    const unsignedAttrs = f[i] && contextTag(f[i]!) === 1 ? f[i] : undefined;
    return { issuerDer, serialHex, digestHash: DIGEST_OIDS[digestOid], digestOid, signedAttrs, signatureAlgOid, signature, unsignedAttrs };
  });
  return { certs, signers, eContentPresent: encap.length > 1 };
}

function attributes(set: Der | undefined): Map<string, Der[]> {
  const out = new Map<string, Der[]>();
  if (!set) return out;
  for (const attr of children(set)) {
    const [type, values] = children(attr);
    out.set(oid(type!), children(values!));
  }
  return out;
}

function signatureSpec(si: SignerInfo): SignatureAlgorithmSpec | undefined {
  if (si.signatureAlgOid === OIDS.rsaEncryption) return si.digestHash ? { key: 'RSA', hash: si.digestHash } : undefined;
  return certSignatureAlgorithm(si.signatureAlgOid);
}

export async function verifyCadesSignature(bytes: Uint8Array, ctx: CadesContext): Promise<CadesResult> {
  const fc = newLog();
  const unsupported: string[] = [];
  const weak: string[] = [];
  const references: ReferenceCheck[] = [];
  const signedPaths: string[] = [];
  let signatureIntact: boolean | undefined;
  let signingCertificate: Certificate | undefined;
  let iscError: string | undefined;
  let claimedSigningTime: string | undefined;
  let level = 'CAdES-BES';
  let pool: Certificate[] = [];
  let signatureAlgorithm = '';
  let signatureId = ctx.signaturePath;

  try {
    const sd = parseSignedData(bytes);
    pool = sd.certs;
    if (sd.signers.length !== 1) fc.errors.push(`expected one SignerInfo, found ${sd.signers.length}`);
    if (sd.eContentPresent) fc.errors.push('ASiC-E CAdES signatures must be detached');
    const si = sd.signers[0]!;
    signatureId = `${ctx.signaturePath}#${si.serialHex ?? 'ski'}`;
    signatureAlgorithm = si.signatureAlgOid;
    const attrs = attributes(si.signedAttrs);
    const spec = signatureSpec(si);
    if (!si.digestHash) unsupported.push(`digest algorithm ${si.digestOid}`);
    if (!spec) unsupported.push(`signature algorithm ${si.signatureAlgOid}`);
    if (si.digestHash === 'SHA-1' || spec?.hash === 'SHA-1') weak.push('SHA-1');
    if (!si.signedAttrs) fc.errors.push('signed attributes missing');

    const st = attrs.get(OIDS.signingTime)?.[0];
    if (st) claimedSigningTime = time(st).toISOString().replace('.000Z', 'Z');

    // Signing certificate: ESS signing-certificate(-v2) digest, cross-checked with the sid.
    const scv2 = attrs.get(OIDS.signingCertificateV2)?.[0];
    const scv1 = attrs.get(OIDS.signingCertificate)?.[0];
    const essCertIds = scv2 ?? scv1;
    if (!essCertIds) iscError = 'no signing-certificate attribute';
    else {
      const [first] = children(children(essCertIds)[0]!);
      const fields = children(first!);
      let hash: HashName | undefined = scv2 ? 'SHA-256' : 'SHA-1';
      let k = 0;
      if (scv2 && fields[0]?.tag === TAG.SEQUENCE) hash = DIGEST_OIDS[oid(children(fields[k++]!)[0]!)];
      const certHash = expect(fields[k], TAG.OCTET_STRING, 'certHash').value;
      for (const cand of pool) {
        if (hash && equalBytes(await digest(hash, cand.der), certHash)) {
          signingCertificate = cand;
          break;
        }
      }
      if (!signingCertificate) iscError = 'no certificate matches the ESS certHash';
      else if (si.issuerDer && (!sameName(si.issuerDer, signingCertificate.issuerDer) || si.serialHex !== signingCertificate.serialHex)) {
        fc.warnings.push('SignerInfo sid does not match the signing certificate');
      }
    }
    if (essCertIds && st) level = 'CAdES-BASELINE-B';
    if (si.unsignedAttrs && attributes(si.unsignedAttrs).has(OIDS.signatureTimeStamp)) {
      level = 'CAdES-BASELINE-T';
      fc.warnings.push(`${level}: timestamps are not verified by this validator`);
    }

    // Detached content: the ASiC manifest.
    const manifest = findAsicManifest(ctx.files, ctx.signaturePath, fc);
    if (!manifest) {
      fc.errors.push('no ASiC manifest refers to this signature');
    } else {
      signedPaths.push(manifest.path);
      const md = attrs.get(OIDS.messageDigest)?.[0];
      const manifestBytes = ctx.files.get(manifest.path)!;
      const intact = !!md && !!si.digestHash && equalBytes(await digest(si.digestHash, manifestBytes), expect(md, TAG.OCTET_STRING, 'messageDigest').value);
      references.push({ uri: manifest.path, path: manifest.path, kind: 'asic-manifest', digestAlgorithm: si.digestOid, status: intact ? 'intact' : 'hash-failure' });
      if (manifest.references.length === 0) fc.errors.push('The signature does not cover any file of the container.');
      for (const ref of manifest.references) {
        const path = referenceToPath(ref.uri);
        const hash = DIGEST_METHODS[ref.digestUri];
        const base = { uri: ref.uri, digestAlgorithm: ref.digestUri, kind: 'file' as const };
        if (path === undefined || !hash || !ref.digest) {
          references.push({ ...base, status: 'unsupported', detail: path === undefined ? 'URI is not a relative container path' : 'digest' });
          continue;
        }
        if (hash === 'SHA-1') weak.push(ref.digestUri);
        signedPaths.push(path);
        const data = ctx.files.get(path);
        if (!data) references.push({ ...base, path, status: 'not-found' });
        else references.push({ ...base, path, status: equalBytes(await digest(hash, data), ref.digest) ? 'intact' : 'hash-failure' });
      }
    }

    if (spec && signingCertificate && si.signedAttrs) {
      // The signature covers the DER of the signed attributes with an explicit SET OF tag (RFC 5652, 5.4).
      const tbs = new Uint8Array(si.signedAttrs.raw);
      tbs[0] = TAG.SET;
      try {
        signatureIntact = await verifyWithCertificate(signingCertificate, spec, si.signature, tbs, 'der');
      } catch (err) {
        if (err instanceof UnsupportedAlgorithmError) unsupported.push(err.message);
        else throw err;
      }
    }
  } catch (err) {
    if (!(err instanceof DerError)) throw err;
    fc.errors.push(`CMS structure: ${err.message}`);
  }

  withContainerChecks(fc, ctx, signedPaths);
  const chain = signingCertificate ? await buildChain(signingCertificate, pool, ctx.trustAnchors) : undefined;
  const blocks: BuildingBlocks = {
    fc,
    ...(iscError !== undefined ? { iscError } : {}),
    references,
    signatureIntact,
    ...(chain ? { chain } : {}),
    ...(signingCertificate ? { signingCertificate } : {}),
    validationTime: ctx.validationTime,
    weakAlgorithms: weak,
    unsupported,
  };
  const verdict = decide(blocks);
  const log = newLog();
  log.errors.push(...fc.errors);
  verdictMessages(blocks, log);
  log.warnings.push(...fc.warnings);
  log.infos.push(...fc.infos);
  return {
    ...verdict,
    signatureId,
    level,
    references,
    signedPaths,
    ...(signingCertificate ? { signingCertificate } : {}),
    chain: chain?.path ?? [],
    ...(claimedSigningTime ? { claimedSigningTime } : {}),
    signatureAlgorithm,
    canonicalization: '',
    log,
    blocks,
  };
}
