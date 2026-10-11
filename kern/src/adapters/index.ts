export type { Adapter, AdapterInfo, Availability, OperationOptions, PlatformExceptionId, ProcessingLocation } from './common.js';
export type { LibraryEntry, OpenRequest, OpenedFile, SaveRequest, Storage, StoredFileRef } from './storage.js';
export type { DigestAlgorithm, DigestSignRequest, SignatureAlgorithm, Signer, SigningKey } from './signer.js';
export type {
  Indication,
  SignatureLevel,
  SignatureReport,
  SubIndication,
  ValidationReport,
  ValidationRequest,
  Validator,
} from './validator.js';
export type {
  BoundingBox,
  ImageMediaType,
  Ocr,
  OcrLine,
  OcrRequest,
  OcrResult,
  OcrWord,
  RasterImage,
  ScanRequest,
  ScanResult,
  Scanner,
} from './capture.js';
export type {
  PdfConformance,
  PdfConformanceCheck,
  PdfExport,
  PdfExportRequest,
  PdfExportResult,
  PdfImport,
  PdfImportRequest,
  PdfImportResult,
  PdfImportWarning,
  PdfImportWarningCode,
} from './pdf.js';

import type { Ocr, Scanner } from './capture.js';
import type { PdfExport, PdfImport } from './pdf.js';
import type { Signer } from './signer.js';
import type { Storage } from './storage.js';
import type { Validator } from './validator.js';

/** The adapters a platform hands to the core. Missing entries are documented gaps. */
export interface PlatformAdapters {
  readonly storage: Storage;
  readonly signers: readonly Signer[];
  readonly validator?: Validator;
  readonly scanner?: Scanner;
  readonly ocr?: Ocr;
  readonly pdfImport?: PdfImport;
  readonly pdfExport?: PdfExport;
}
