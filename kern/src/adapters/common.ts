/**
 * Shared types for platform adapters (docs/06, section 4.1).
 *
 * The core talks to platforms only through these interfaces. Every platform supplies its
 * own implementations; where none exists, the UI shows the documented exception with its
 * fallback (docs/06, section 1.3, A1–A13).
 */

/** Identifiers of the documented platform exceptions in docs/06, section 1.3. */
export type PlatformExceptionId = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8' | 'A9' | 'A10' | 'A11' | 'A12' | 'A13';

/** Result of asking an adapter whether it can work on this device right now. */
export type Availability =
  | { readonly available: true }
  | {
      readonly available: false;
      /** Documented exception, if the gap is a platform limit rather than a missing setup. */
      readonly exception?: PlatformExceptionId;
      /** Human-readable reason and the fallback the UI should offer. */
      readonly reason: string;
      readonly fallback?: string;
    };

/** Where the work happens. Adapters that send data off the device must say so (docs/06, 1.1 rule 2). */
export type ProcessingLocation = 'device' | 'local-sidecar' | 'remote-service';

export interface AdapterInfo {
  /** Implementation name, e.g. `RemoteCscSigner`, `DssSidecarValidator`. */
  readonly name: string;
  readonly version?: string;
  readonly location: ProcessingLocation;
}

/** Common surface of all adapters. */
export interface Adapter {
  readonly info: AdapterInfo;
  availability(): Promise<Availability>;
}

/** Cancellation and progress for long-running adapter calls. */
export interface OperationOptions {
  readonly signal?: AbortSignal;
  /** Fraction between 0 and 1. */
  readonly onProgress?: (fraction: number) => void;
}
