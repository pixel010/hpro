/** Locks, sealed sections, redaction and the frozen version as evidence (package P17, docs/10 promise 5). */
export { ACCESS_RULES, LockError, assertEditable, checkTargets, hiddenNotice, lockNotice, outputView, outputViewBytes, parseAccess, rulesAt, rulesForDocument, splitTarget, withRules } from './access.js';
export type { AccessEntry, AccessRule, ViewResult } from './access.js';
export { b64u, certificateThumbprint, decryptJwe, DEFAULT_ITERATIONS, encryptJwe, fromB64u, JweError, MAX_ITERATIONS, MIN_PASSWORD_LENGTH, parseJwe, protectedHeader } from './jwe.js';
export type { JweGeneral, KeyAlgorithm, Opener, Recipient } from './jwe.js';
export { DEFAULT_SEALED_NOTICE, ENVELOPE_TYPE, fragmentsOf, openEnvelope, openSealedSection, SEALED_DIR, sealedSections, sealSection, unsealSection } from './seal.js';
export type { SealedSection, SealOptions, SealResult } from './seal.js';
export { REDACTED_TEXT, REDACTION_LOG, RedactionNeedsConfirmation, redactContainer } from './redact.js';
export type { RedactionLogEntry, RedactOptions, RedactResult } from './redact.js';
export { normalize, readings, searchContainer, searchEntries, searchRaw } from './search.js';
export type { Hit, Reading } from './search.js';
export { checkFrozenVersion, freezeAndSign, lockEvidence } from './frozen.js';
export type { LockEvidence, FreezeAndSignOptions, FrozenCheck, FrozenSignatureCheck, FrozenSigned } from './frozen.js';
export { editText } from './edit.js';
export type { EditTextOptions } from './edit.js';
