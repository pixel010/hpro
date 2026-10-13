import type { DocumentInput } from '../container.js';
import type { Adapter, OperationOptions } from './common.js';

export type PdfImportWarningCode =
  | 'untagged-pdf'
  | 'ocr-used'
  | 'reading-order-guessed'
  | 'table-structure-guessed'
  | 'form-fields-not-converted'
  | 'javascript-dropped'
  | 'signature-not-transferable'
  | (string & {});

export interface PdfImportWarning {
  readonly code: PdfImportWarningCode;
  readonly message: string;
  /** 1-based page number in the source PDF, if the warning is page specific. */
  readonly page?: number;
}

export interface PdfImportRequest extends OperationOptions {
  readonly pdf: Uint8Array;
  readonly fileName: string;
  readonly ocr?: 'auto' | 'force' | 'off';
  /** BCP 47 tags for OCR. */
  readonly languages?: readonly string[];
}

export interface PdfImportResult {
  /**
   * Document ready for `createContainer`. Implementations keep the source PDF as resource
   * `original/<fileName>` (docs/03, 4.1, GoBD Rz. 135).
   */
  readonly document: DocumentInput;
  readonly warnings: readonly PdfImportWarning[];
  readonly engine: { readonly name: string; readonly version?: string };
}

/**
 * `PdfImport`: PDF to hpro document.
 * Implementations per docs/06, 4.1: `DoclingSidecar` (desktop), `RemoteDocling`.
 */
export interface PdfImport extends Adapter {
  import(request: PdfImportRequest): Promise<PdfImportResult>;
}

export type PdfConformance = 'PDF/A-2a' | 'PDF/A-2b' | 'PDF/A-2u' | 'PDF/A-3a' | 'PDF/A-3b' | 'PDF/A-3u' | 'PDF/UA-1' | 'PDF/UA-2';

export interface PdfExportRequest extends OperationOptions {
  /** The container to render; signed documents are exported from their frozen state. */
  readonly container: Uint8Array;
  /** Requested conformance levels; empty means plain PDF. */
  readonly conformance: readonly PdfConformance[];
  readonly pageSize?: 'A4' | 'A5' | 'Letter';
  /** Embed the container as attachment (PDF/A-3 hybrid, docs/03, 4.2). */
  readonly embedContainer?: boolean;
}

export interface PdfConformanceCheck {
  readonly conformance: PdfConformance;
  readonly passed: boolean;
  /** e.g. `veraPDF 1.28`. */
  readonly checker: string;
  readonly failures: readonly string[];
}

export interface PdfExportResult {
  readonly pdf: Uint8Array;
  /**
   * One entry per requested level that was actually checked. WeasyPrint does not guarantee
   * validity, so a level without a passed check must not be claimed in the UI.
   */
  readonly checks: readonly PdfConformanceCheck[];
  readonly engine: { readonly name: string; readonly version?: string };
}

/**
 * `PdfExport`: hpro document to PDF.
 * Implementations per docs/06, 4.1: `WeasyPrintSidecar`, `RemoteWeasyPrint`, `EnginePdf`,
 * `BrowserPrintPdf`, `WkCreatePdf`, `AndroidPrintPdf`. Only WeasyPrint plus veraPDF can
 * claim PDF/A or PDF/UA; engine print-to-PDF paths return no checks.
 */
export interface PdfExport extends Adapter {
  supportedConformance(): Promise<readonly PdfConformance[]>;
  export(request: PdfExportRequest): Promise<PdfExportResult>;
}
