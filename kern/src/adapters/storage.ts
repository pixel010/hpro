import type { Adapter, OperationOptions } from './common.js';

/**
 * Opaque reference to a stored file. Only the adapter that issued it can resolve it
 * (FS Access handle, OPFS path, Tauri path, iOS bookmark, Android SAF URI …).
 */
export interface StoredFileRef {
  readonly id: string;
  /** Display name including extension, e.g. `vertrag.hpro`. */
  readonly name: string;
  /** False where saving creates a new file instead of overwriting (docs/06, A4). */
  readonly writableInPlace: boolean;
}

export interface OpenedFile {
  readonly ref: StoredFileRef;
  readonly bytes: Uint8Array;
  /** Last modification as reported by the platform, ISO 8601, if known. */
  readonly modified?: string;
}

export interface OpenRequest extends OperationOptions {
  /** File extensions without dot, e.g. `['hpro', 'epub']`. */
  readonly extensions?: readonly string[];
  readonly multiple?: boolean;
}

export interface SaveRequest extends OperationOptions {
  readonly bytes: Uint8Array;
  /** Overwrite this file if possible; otherwise the adapter asks for a target or downloads. */
  readonly target?: StoredFileRef;
  readonly suggestedName: string;
}

export interface LibraryEntry {
  readonly ref: StoredFileRef;
  readonly size: number;
  readonly modified?: string;
}

/**
 * `Storage`: open, save and the app-internal library.
 * Web: FS Access (Chromium) or upload/download plus OPFS; Desktop: Tauri `fs` + `dialog`;
 * iOS: document picker; Android: SAF with persistent URI permissions.
 */
export interface Storage extends Adapter {
  /** Lets the user pick files. Resolves to an empty array when the user cancels. */
  open(request?: OpenRequest): Promise<readonly OpenedFile[]>;
  /** Re-reads a file the user opened earlier (needs a persisted permission where applicable). */
  read(ref: StoredFileRef, options?: OperationOptions): Promise<OpenedFile>;
  /** Saves; resolves to `null` when the user cancels the save dialog. */
  save(request: SaveRequest): Promise<StoredFileRef | null>;
  /** App-internal library (OPFS, app container). */
  listLibrary(options?: OperationOptions): Promise<readonly LibraryEntry[]>;
  removeFromLibrary(ref: StoredFileRef): Promise<void>;
}
