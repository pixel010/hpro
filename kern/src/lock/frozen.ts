/**
 * The frozen version as evidence (docs/10, promise 5; part 0, HP-PROF-006…010; part 1, 7.1–7.6):
 * freeze, sign exactly the files of the frozen version, and check it later.
 *
 * `checkFrozenVersion` combines what a reading system must show for a frozen version:
 *   - hashes of the version manifest (a changed file is visible even without signature),
 *   - signatures assigned to the version (part 1, 7.1) with their indication,
 *   - coverage: a signature must reference exactly the files under `renditions/<id>/` plus
 *     `META-INF/container.xml` (HPR-PROF-013), never a file of the main version (HP-PROF-009),
 *   - a verdict in words (part 1, 7.5).
 */
import type { Signer, SigningKey } from '../adapters/signer.js';
import { fromUtf8 } from '../bytes.js';
import { freezeContainer, type FreezeOptions } from '../calc/container.js';
import { readContainer } from '../container.js';
import { verifyIntegrity, type HproManifest, type IntegrityReport } from '../manifest.js';
import { signContainer } from '../sign.js';
import { validateContainer, type ValidateOptions } from '../validate.js';
import { LockError, parseAccess } from './access.js';

export interface FreezeAndSignOptions extends FreezeOptions {
  readonly signer: Signer;
  readonly key?: SigningKey;
  /** Default: `createdAt`. */
  readonly signingTime?: Date;
  readonly signatureId?: string;
}

export interface FrozenSigned {
  readonly bytes: Uint8Array;
  readonly rendition: string;
  /** Files of the frozen version (all signed, plus `META-INF/container.xml`). */
  readonly files: readonly string[];
  readonly signatureId: string;
}

/** Freezes the main version as `renditions/<id>/` (profile `signed`) and signs exactly its files. */
export async function freezeAndSign(bytes: Uint8Array, options: FreezeAndSignOptions): Promise<FrozenSigned> {
  const frozen = await freezeContainer(bytes, { id: options.id, createdAt: options.createdAt, profile: options.profile ?? 'signed', ...(options.notice ? { notice: options.notice } : {}) });
  const signed = await signContainer(frozen.bytes, {
    signer: options.signer,
    ...(options.key ? { key: options.key } : {}),
    signingTime: options.signingTime ?? new Date(options.createdAt),
    ...(options.signatureId ? { signatureId: options.signatureId } : {}),
    paths: [...frozen.files],
  });
  return { bytes: signed.bytes, rendition: options.id, files: frozen.files, signatureId: signed.signatureId };
}

export interface FrozenSignatureCheck {
  readonly signatureId: string;
  readonly indication: string;
  readonly subIndication?: string;
  readonly signer?: string;
  readonly signingTime?: string;
  /** Files of the version the signature does not reference. */
  readonly missing: readonly string[];
  /** References outside the version (other than META-INF/container.xml). */
  readonly outside: readonly string[];
  /** References whose hash no longer matches. */
  readonly changed: readonly string[];
}

export interface FrozenCheck {
  readonly rendition: string;
  readonly files: readonly string[];
  readonly integrity: IntegrityReport;
  readonly signatures: readonly FrozenSignatureCheck[];
  /** `gültig signiert` only with TOTAL_PASSED and exact coverage. */
  readonly verdict: 'gültig signiert' | 'kryptografisch intakt, Vertrauen nicht geprüft' | 'verändert nach der Signatur' | 'Signatur ungültig' | 'nicht signiert' | 'verändert (nicht signiert)';
  /** Changed files (from the version manifest and from the signatures). */
  readonly changed: readonly string[];
}

export async function checkFrozenVersion(bytes: Uint8Array, rendition: string, options: ValidateOptions = {}): Promise<FrozenCheck> {
  const c = await readContainer(bytes);
  const prefix = `renditions/${rendition}/`;
  const manifestPath = `${prefix}manifest.json`;
  const mBytes = c.files.get(manifestPath);
  if (!mBytes) throw new Error(`frozen version ${rendition} not found`);
  const manifest = JSON.parse(fromUtf8(mBytes)) as HproManifest;
  const files = [...c.files.keys()].filter((p) => p.startsWith(prefix)).sort();
  const integrity = await verifyIntegrity(manifest, new Map([...c.files].filter(([p]) => p.startsWith(prefix) && p !== manifestPath)));
  const report = await validateContainer(bytes, options);
  const signatures: FrozenSignatureCheck[] = [];
  for (const s of report.signatures) {
    const refs = s.signedPaths.filter((p) => p !== 'META-INF/container.xml');
    if (refs.length === 0 || !refs.every((p) => p.startsWith(prefix))) continue; // belongs to another version (7.1)
    signatures.push({
      signatureId: s.signatureId,
      indication: s.indication,
      ...(s.subIndication ? { subIndication: s.subIndication } : {}),
      ...(s.signerSubject ? { signer: s.signerSubject } : {}),
      ...(s.claimedSigningTime ? { signingTime: s.claimedSigningTime } : {}),
      missing: files.filter((p) => !s.signedPaths.includes(p)),
      outside: s.signedPaths.filter((p) => p !== 'META-INF/container.xml' && !p.startsWith(prefix)),
      changed: (s.references ?? []).filter((r) => r.status === 'hash-failure').map((r) => r.path ?? r.uri),
    });
  }
  const changed = [...new Set([...integrity.resources.filter((r) => r.status !== 'ok').map((r) => r.path), ...signatures.flatMap((s) => s.changed)])].sort();
  let verdict: FrozenCheck['verdict'];
  if (signatures.length === 0) verdict = changed.length > 0 ? 'verändert (nicht signiert)' : 'nicht signiert';
  else if (signatures.some((s) => s.indication === 'TOTAL_FAILED' && s.subIndication === 'HASH_FAILURE') || changed.length > 0) verdict = 'verändert nach der Signatur';
  else if (signatures.some((s) => s.indication === 'TOTAL_FAILED')) verdict = 'Signatur ungültig';
  else if (signatures.some((s) => s.indication === 'TOTAL_PASSED' && s.missing.length === 0 && s.outside.length === 0)) verdict = 'gültig signiert';
  else if (signatures.some((s) => s.indication === 'INDETERMINATE' && s.missing.length === 0)) verdict = 'kryptografisch intakt, Vertrauen nicht geprüft';
  else verdict = 'Signatur ungültig';
  return { rendition, files, integrity, signatures, verdict, changed };
}

export interface LockEvidence {
  /** `nachweisbar`: a TOTAL_PASSED signature covers the manifest with `access`. */
  readonly status: 'nachweisbar' | 'kryptografisch intakt, Vertrauen nicht geprüft' | 'Sperre nicht signiert' | 'Signatur ungültig' | 'keine Sperren';
  readonly manifestPath: string;
  readonly signatureIds: readonly string[];
}

/**
 * HP-LOCK-006: are the locks of a version covered by a valid signature? The rules live in the
 * version's manifest, so the manifest must be a signed reference of a signature of that version.
 */
export async function lockEvidence(bytes: Uint8Array, rendition: string | null = null, options: ValidateOptions = {}): Promise<LockEvidence> {
  const c = await readContainer(bytes);
  const manifestPath = rendition === null ? 'manifest.json' : `renditions/${rendition}/manifest.json`;
  const manifestBytes = c.files.get(manifestPath);
  if (!manifestBytes) throw new LockError('not-found', `${manifestPath} not found`);
  const entries = parseAccess(JSON.parse(fromUtf8(manifestBytes)));
  if (entries.length === 0) return { status: 'keine Sperren', manifestPath, signatureIds: [] };
  const report = await validateContainer(bytes, options);
  const covering = report.signatures.filter((s) => s.signedPaths.includes(manifestPath));
  const ids = covering.map((s) => s.signatureId);
  if (covering.length === 0) return { status: 'Sperre nicht signiert', manifestPath, signatureIds: [] };
  if (covering.some((s) => s.indication === 'TOTAL_PASSED')) return { status: 'nachweisbar', manifestPath, signatureIds: ids };
  const intact = covering.some((s) => s.indication === 'INDETERMINATE' && (s.references ?? []).every((r) => r.status === 'intact'));
  return { status: intact ? 'kryptografisch intakt, Vertrauen nicht geprüft' : 'Signatur ungültig', manifestPath, signatureIds: ids };
}

