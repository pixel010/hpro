/** Structured editor, history journal and comparison of versions (package P5, proposal HPC-0008). */
export { columnLetters, EditError, IdAllocator, isInlineElement, parseInline, parsePointer, pointerOf, slug } from './dom.js';
export type { EditErrorCode, Pointer } from './dom.js';
export { extractBlocks, outline, TEXT_BLOCKS } from './model.js';
export type { BlockKind, BlockRecord } from './model.js';
export { EditSession, editContainer } from './session.js';
export type { BlockSpec, EditOp, ListItemSpec, MediaInput, OpResult, Position, SaveOptions, SaveResult } from './session.js';
export { BLOB_DIR, checkoutVersion, continueJournal, JOURNAL_FORMAT, JOURNAL_PATH, JournalError, installJournal, listVersions, manifestBase, parseJournal, reconstructAll, recordVersion, serializeJournal, snapshotAt, snapshotOf, blobStore } from './journal.js';
export type { FileChange, Journal, JournalEntry, Snapshot, VersionInfo } from './journal.js';
export { applyPatch, diffSequences, makePatch, patchTokens, wordTokens } from './sequence.js';
export type { DiffOp, Hunk } from './sequence.js';
export { CHANGE_LABEL, diffContainers, diffText, diffVersions, diffXhtml, viewOf } from './diff.js';
export type { Change, ChangeKind, DiffResult, VersionLabel, VersionView, WordOp } from './diff.js';
