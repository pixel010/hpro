/**
 * Signature validation of ASiC-E containers without Java (package P2, docs/06 open question 12).
 *
 * `validateContainer` reads the ZIP with the hardened reader of the core, finds the signature
 * files, applies the container constraints of the EU DSS default policy (mimetype content,
 * manifest present, data files present, all files signed) and verifies every signature
 * (XAdES and CAdES). The verdicts use the indications of ETSI EN 319 102-1 so that they can
 * be compared one-to-one with DSS (docs/belege/P2/).
 *
 * Scope: signature level B plus signature time-stamps (level T, RFC 3161, package P10).
 * Embedded validation data (LT), archive time-stamps (LTA), revocation data and EU trusted
 * lists are not evaluated; trust comes only from the anchors passed in.
 */
import type { Availability } from './adapters/common.js';
import type { SignatureReport, TimestampReport, ValidationReport, ValidationRequest, Validator } from './adapters/validator.js';
import { fromUtf8 } from './bytes.js';
import { verifyCadesSignature } from './cades.js';
import { parseCrls } from './crl.js';
import { MSG, newLog, type CheckLog } from './sigcommon.js';
import { SignatureFileError, parseSignatureFile, verifyXadesSignature, type TimestampCheck, type XadesResult } from './xades.js';
import { parseCertificate, type Certificate } from './x509.js';
import { readZip, type ZipReadOptions } from './zip.js';

export const VALIDATOR_NAME = 'hpro TsValidator';
export const VALIDATOR_VERSION = '0.1.0';

export type ValidationPolicy = NonNullable<ValidationRequest['policy']>;

export const ASIC_E_MIMETYPE = 'application/vnd.etsi.asic-e+zip';
export const ASIC_S_MIMETYPE = 'application/vnd.etsi.asic-s+zip';

/** Accepted mimetype contents and the level of the check per policy (docs/05, case V3). */
const MIMETYPE_RULES: Record<ValidationPolicy, { accepted: readonly string[]; level: 'WARN' | 'FAIL' }> = {
  'dss-default': { accepted: [ASIC_S_MIMETYPE, ASIC_E_MIMETYPE], level: 'WARN' },
  'hpro': { accepted: ['application/epub+zip', ASIC_S_MIMETYPE, ASIC_E_MIMETYPE], level: 'WARN' },
  strict: { accepted: [ASIC_S_MIMETYPE, ASIC_E_MIMETYPE], level: 'FAIL' },
};

const XADES_FILE = /^META-INF\/[^/]*signatures[^/]*\.xml$/;
const CADES_FILE = /^META-INF\/[^/]*signature[^/]*\.p7s$/;
const ODF_MANIFEST = 'META-INF/manifest.xml';

export interface ValidateOptions extends ZipReadOptions {
  readonly policy?: ValidationPolicy;
  /** Trust anchors, DER-encoded. */
  readonly trustAnchors?: readonly Uint8Array[];
  /** ISO 8601; default now. */
  readonly validationTime?: string;
  /** CRLs (DER or PEM) for certificate paths below the trust anchors (package P10). */
  readonly crls?: readonly Uint8Array[];
}

export interface ContainerInfo {
  readonly mimetype: string | undefined;
  readonly containerType: 'ASiC-E' | 'ASiC-S';
  /** Files outside META-INF (without `mimetype`), sorted. */
  readonly dataFiles: readonly string[];
  readonly signatureFiles: readonly string[];
}

export interface DetailedValidationReport extends ValidationReport {
  readonly container: ContainerInfo;
}

function certificateSummary(c: Certificate): NonNullable<SignatureReport['signingCertificate']> {
  return { subject: c.subject, issuer: c.issuer, serialNumber: c.serialHex, notBefore: c.notBefore.toISOString(), notAfter: c.notAfter.toISOString() };
}

function toReport(file: string, r: XadesResult): SignatureReport {
  return {
    signatureId: r.signatureId,
    file,
    level: r.level,
    indication: r.indication,
    ...(r.subIndication ? { subIndication: r.subIndication } : {}),
    signedPaths: [...r.signedPaths].sort(),
    ...(r.signingCertificate ? { signerSubject: r.signingCertificate.subject, signingCertificate: certificateSummary(r.signingCertificate) } : {}),
    ...(r.claimedSigningTime ? { claimedSigningTime: r.claimedSigningTime } : {}),
    errors: r.log.errors,
    warnings: r.log.warnings,
    infos: r.log.infos,
    references: r.references.map((x) => ({ uri: x.uri, kind: x.kind, status: x.status, ...(x.path ? { path: x.path } : {}), ...(x.detail ? { detail: x.detail } : {}) })),
    chain: r.chain.map((c) => c.subject),
    signatureAlgorithm: r.signatureAlgorithm,
    ...(r.canonicalization ? { canonicalization: r.canonicalization } : {}),
    ...(r.timestamps ? { timestamps: r.timestamps.map(timestampReport) } : {}),
  };
}

function timestampReport(t: TimestampCheck): TimestampReport {
  const v = t.verification;
  return {
    type: t.type,
    ...(t.id ? { id: t.id } : {}),
    indication: v.indication,
    ...(v.subIndication ? { subIndication: v.subIndication } : {}),
    ...(v.tstInfo ? { genTime: v.tstInfo.genTime.toISOString(), serialNumber: v.tstInfo.serialHex, policy: v.tstInfo.policy } : {}),
    ...(v.tsaCertificate ? { tsaSubject: v.tsaCertificate.subject } : {}),
    messageImprint: v.messageImprint,
    ...(v.signatureIntact !== undefined ? { signatureIntact: v.signatureIntact } : {}),
    chain: v.chain,
    errors: v.errors,
    warnings: v.warnings,
    infos: v.infos,
  };
}

/** Container constraints that apply to every signature (DSS: ContainerConstraints). */
function containerChecks(info: ContainerInfo, policy: ValidationPolicy, manifestPresent: boolean, signedPaths: readonly string[]): CheckLog {
  const fc = newLog();
  if (info.mimetype === undefined) fc.infos.push('The mimetype file is not present.');
  else {
    const rule = MIMETYPE_RULES[policy];
    if (!rule.accepted.includes(info.mimetype)) (rule.level === 'FAIL' ? fc.errors : fc.warnings).push(MSG.mimetype);
  }
  if (!manifestPresent) fc.errors.push(MSG.manifestAbsent);
  if (info.dataFiles.length === 0) fc.errors.push('No original data files are present outside META-INF!');
  const covered = new Set(signedPaths);
  if (info.dataFiles.some((p) => !covered.has(p))) fc.warnings.push(MSG.notAllSigned);
  return fc;
}

function failedFileReport(file: string, error: string): SignatureReport {
  return { signatureId: file, file, level: 'unknown', indication: 'TOTAL_FAILED', subIndication: 'FORMAT_FAILURE', signedPaths: [], errors: [error], warnings: [] };
}

export async function validateContainer(bytes: Uint8Array, options: ValidateOptions = {}): Promise<DetailedValidationReport> {
  const policy = options.policy ?? 'hpro';
  const validationTime = options.validationTime ? new Date(options.validationTime) : new Date();
  if (Number.isNaN(validationTime.getTime())) throw new RangeError(`invalid validationTime ${options.validationTime}`);
  const trustAnchors = (options.trustAnchors ?? []).map((der) => parseCertificate(der));
  const crls = options.crls ? parseCrls(options.crls) : undefined;

  const entries = await readZip(bytes, options);
  const files = new Map<string, Uint8Array>();
  for (const e of entries) if (!e.name.endsWith('/')) files.set(e.name, e.data);

  const first = entries[0];
  let mimetype: string | undefined;
  if (first?.name === 'mimetype') {
    try {
      mimetype = fromUtf8(first.data);
    } catch {
      mimetype = '(not UTF-8)';
    }
  }
  const dataFiles = [...files.keys()].filter((p) => p !== 'mimetype' && !p.startsWith('META-INF/')).sort();
  const signatureFiles = [...files.keys()].filter((p) => XADES_FILE.test(p) || CADES_FILE.test(p)).sort();
  const container: ContainerInfo = { mimetype, containerType: mimetype === ASIC_S_MIMETYPE ? 'ASiC-S' : 'ASiC-E', dataFiles, signatureFiles };

  const signatures: SignatureReport[] = [];
  const signedAnywhere = new Set<string>();
  for (const file of signatureFiles) {
    if (XADES_FILE.test(file)) {
      let parsed;
      try {
        parsed = parseSignatureFile(files.get(file)!);
      } catch (err) {
        if (!(err instanceof SignatureFileError)) throw err;
        signatures.push(failedFileReport(file, err.message));
        continue;
      }
      for (const sig of parsed.signatures) {
        const result = await verifyXadesSignature(sig, {
          files,
          trustAnchors,
          validationTime,
          containerChecks: (signed) => containerChecks(container, policy, files.has(ODF_MANIFEST), signed),
          ...(crls ? { crls } : {}),
        });
        result.signedPaths.forEach((p) => signedAnywhere.add(p));
        signatures.push(toReport(file, result));
      }
    } else {
      // For CAdES the ASiC manifest is the manifest file; its absence is reported by the verifier.
      const result = await verifyCadesSignature(files.get(file)!, {
        files,
        signaturePath: file,
        trustAnchors,
        validationTime,
        containerChecks: (signed) => containerChecks(container, policy, true, signed),
      });
      result.signedPaths.forEach((p) => signedAnywhere.add(p));
      signatures.push(toReport(file, result));
    }
  }

  return {
    signatures,
    unsignedPaths: dataFiles.filter((p) => !signedAnywhere.has(p)),
    validator: { name: VALIDATOR_NAME, version: VALIDATOR_VERSION, policy },
    validationTime: validationTime.toISOString(),
    container,
  };
}

/** `Validator` adapter that runs on the device, in every engine with WebCrypto (docs/06, 4.1). */
export class TsValidator implements Validator {
  readonly kind = 'typescript' as const;
  readonly info = { name: VALIDATOR_NAME, version: VALIDATOR_VERSION, location: 'device' as const };

  async availability(): Promise<Availability> {
    return typeof crypto !== 'undefined' && !!crypto.subtle
      ? { available: true }
      : { available: false, reason: 'WebCrypto (crypto.subtle) is not available; it requires a secure context.', fallback: 'DssSidecarValidator or RemoteDssValidator' };
  }

  async validate(request: ValidationRequest): Promise<ValidationReport> {
    request.signal?.throwIfAborted();
    const report = await validateContainer(request.container, {
      ...(request.policy ? { policy: request.policy } : {}),
      ...(request.trustAnchors ? { trustAnchors: request.trustAnchors } : {}),
      ...(request.validationTime ? { validationTime: request.validationTime } : {}),
      ...(request.crls ? { crls: request.crls } : {}),
    });
    request.onProgress?.(1);
    return report;
  }
}
