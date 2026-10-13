/** PDF export, PDF import and OCR through the self-hosted service `dienst/` (P9). */
export { IMPORT_CSS, IMPORT_TOOL, importToDocument, safeFileName, slugify } from './import-map.js';
export type { DienstBlock, DienstImportResult, DienstList, DienstListItem, DienstSpan, DienstTableCell, ImportedDocument, ImportToDocumentOptions } from './import-map.js';
export { base64, DienstClient, DienstError, exportView, RemoteDocling, RemoteTesseractOcr, RemoteWeasyPrint } from './remote.js';
export type { DienstOptions, DienstStatus, ExportViewResult, RemoteExportRequest, RemoteExportResult, RemoteImportRequest, RemoteImportResult, SearchablePdfPage, SearchablePdfResult } from './remote.js';
