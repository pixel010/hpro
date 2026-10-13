/**
 * Adapters for the self-hosted service `dienst/` (P9; docs/06, 4.1: `RemoteWeasyPrint`,
 * `RemoteDocling`, OCR): PDF export with conformance check, PDF import, text recognition.
 *
 * The service is an addition, never a condition (docs/10, section 3, point 2). Its location is
 * declared (`remote-service` or `local-sidecar`), because data leaves the core (docs/06, 1.1
 * rule 2). Before a container leaves for export, the core removes what must not be exported
 * (`no-export`, HP-LOCK-004) — the service applies the same rules again, but the content is
 * already gone.
 */
import { fromUtf8, toBase64, utf8 } from '../bytes.js';
import { readContainer } from '../container.js';
import { outputViewBytes, parseAccess } from '../lock/access.js';
import { rewrite, updateIntegrity } from '../update.js';
import type { Availability, ProcessingLocation } from '../adapters/common.js';
import type { Ocr, OcrRequest, OcrResult } from '../adapters/capture.js';
import type { PdfConformance, PdfConformanceCheck, PdfExport, PdfExportRequest, PdfExportResult, PdfImport, PdfImportRequest, PdfImportResult } from '../adapters/pdf.js';
import { importToDocument, type DienstImportResult } from './import-map.js';

export interface DienstOptions {
  /** Base URL, e.g. `http://127.0.0.1:8790`. */
  readonly url: string;
  /** Default `remote-service`; a sidecar on the same device declares `local-sidecar`. */
  readonly location?: ProcessingLocation;
  /** Injected for tests and other runtimes; default: global `fetch`. */
  readonly fetch?: typeof fetch;
}

export class DienstError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DienstError';
  }
}

export interface DienstStatus {
  readonly name: string;
  readonly version: string;
  readonly conformance: readonly string[];
  readonly pageSizes: readonly string[];
  readonly ocrLanguages?: readonly string[];
  readonly engines: Readonly<Record<string, string>>;
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Thin HTTP client of the service; one JSON answer per request. */
export class DienstClient {
  readonly url: string;
  readonly location: ProcessingLocation;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DienstOptions) {
    this.url = options.url.replace(/\/+$/, '');
    this.location = options.location ?? 'remote-service';
    this.fetchImpl = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  }

  async status(signal?: AbortSignal): Promise<DienstStatus> {
    const res = await this.fetchImpl(`${this.url}/v1/status`, signal ? { signal } : {});
    if (!res.ok) throw new DienstError(`Dienst antwortet mit ${res.status}`, res.status);
    return (await res.json()) as DienstStatus;
  }

  async post<T>(path: string, query: Record<string, string | undefined>, body: Uint8Array, signal?: AbortSignal): Promise<T> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, v);
    const qs = params.toString();
    const res = await this.fetchImpl(`${this.url}${path}${qs ? `?${qs}` : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: body as Uint8Array<ArrayBuffer>,
      ...(signal ? { signal } : {}),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new DienstError(`Dienst lieferte kein JSON (${res.status}): ${text.slice(0, 200)}`, res.status);
    }
    if (!res.ok) throw new DienstError(`Dienst: ${(json as { error?: string }).error ?? res.statusText}`, res.status);
    return json as T;
  }

  async availability(): Promise<Availability> {
    try {
      await this.status();
      return { available: true };
    } catch (err) {
      return {
        available: false,
        reason: `hpro-Dienst unter ${this.url} nicht erreichbar: ${(err as Error).message}`,
        fallback: 'Drucken aus dem Reader (Druckweg P18) bzw. Original-PDF behalten; der Dienst ist eine Ergänzung, keine Bedingung.',
      };
    }
  }
}

// ------------------------------------------------------------------------------------------- export

/** What the core removed before sending, so the caller can show it. */
export interface ExportViewResult {
  readonly bytes: Uint8Array;
  readonly omitted: ReadonlyArray<{ readonly target: string; readonly notice: string }>;
}

/**
 * The container as it may leave the device for an export: every content document of the main
 * version and of every rendition with `no-export` sections replaced by the notice (HP-LOCK-004),
 * hashes updated so the copy is consistent. Signatures do not cover the copy (it is not the
 * signed document); the PDF names the version it was made from.
 */
export async function exportView(container: Uint8Array): Promise<ExportViewResult> {
  const c = await readContainer(container);
  const manifest = JSON.parse(fromUtf8(c.files.get('manifest.json')!)) as Record<string, unknown> & { renditions?: Array<{ url: string }> };
  const changed = new Map<string, Uint8Array>();
  const omitted: Array<{ target: string; notice: string }> = [];
  const apply = (m: Record<string, unknown>) => {
    const entries = parseAccess(m);
    if (entries.length === 0) return false;
    let any = false;
    for (const item of (m.readingOrder as Array<{ url: string }> | undefined) ?? []) {
      const data = c.files.get(item.url);
      if (!data) continue;
      const view = outputViewBytes(data, item.url, entries, 'export');
      if (view.omitted.length > 0) {
        changed.set(item.url, view.bytes);
        omitted.push(...view.omitted);
        any = true;
      }
    }
    return any;
  };
  const renditionManifests = new Map<string, Uint8Array>();
  for (const r of manifest.renditions ?? []) {
    const raw = c.files.get(r.url);
    if (!raw) continue;
    const rm = JSON.parse(fromUtf8(raw)) as Record<string, unknown>;
    if (apply(rm)) {
      const updated = await updateIntegrity(rm, changed);
      renditionManifests.set(r.url, utf8(JSON.stringify(updated, null, 2) + '\n'));
    }
  }
  apply(manifest);
  if (changed.size === 0) return { bytes: container, omitted };
  for (const [k, v] of renditionManifests) changed.set(k, v);
  const newManifest = await updateIntegrity(manifest, changed);
  return { bytes: await rewrite(c, changed, newManifest, String(manifest.dateModified)), omitted };
}

/** Answer of `POST /v1/export`. */
interface DienstExportAnswer {
  readonly pdf: string;
  readonly checks: ReadonlyArray<{ conformance: PdfConformance; passed: boolean; checker: string; failures: string[]; failedRules: number }>;
  readonly engine: { name: string; version: string; service: string };
  readonly variant: string | null;
  readonly pages: number;
  readonly omitted: ReadonlyArray<{ target: string; notice: string }>;
  readonly live: ReadonlyArray<{ kind: string; address: string; still: boolean }>;
  readonly warnings: readonly string[];
  readonly overflow: readonly string[];
}

export interface RemoteExportRequest extends PdfExportRequest {
  /** Export a frozen rendition (HP-PROF-006) instead of the main version. */
  readonly rendition?: string;
  readonly fileName?: string;
}

export interface RemoteExportResult extends PdfExportResult {
  readonly pages: number;
  readonly variant: string | null;
  /** Sections left out (by the core before sending, and by the service). */
  readonly omitted: ReadonlyArray<{ readonly target: string; readonly notice: string }>;
  readonly live: ReadonlyArray<{ readonly kind: string; readonly address: string; readonly still: boolean }>;
  readonly warnings: readonly string[];
}

/** `PdfExport` through the service: WeasyPrint renders, veraPDF checks every requested level. */
export class RemoteWeasyPrint implements PdfExport {
  readonly info;
  constructor(private readonly client: DienstClient) {
    this.info = { name: 'RemoteWeasyPrint', location: client.location } as const;
  }

  availability(): Promise<Availability> {
    return this.client.availability();
  }

  async supportedConformance(): Promise<readonly PdfConformance[]> {
    return (await this.client.status()).conformance as PdfConformance[];
  }

  async export(request: RemoteExportRequest): Promise<RemoteExportResult> {
    request.onProgress?.(0);
    const view = await exportView(request.container);
    const answer = await this.client.post<DienstExportAnswer>(
      '/v1/export',
      {
        conformance: request.conformance.join(','),
        pageSize: request.pageSize ?? 'A4',
        embedContainer: request.embedContainer ? '1' : undefined,
        rendition: request.rendition,
        fileName: request.fileName,
      },
      view.bytes,
      request.signal,
    );
    request.onProgress?.(1);
    const checks: PdfConformanceCheck[] = answer.checks.map((c) => ({ conformance: c.conformance, passed: c.passed, checker: c.checker, failures: c.failures }));
    const seen = new Set(view.omitted.map((o) => o.target));
    return {
      pdf: fromBase64(answer.pdf),
      checks,
      engine: { name: answer.engine.name, version: answer.engine.version },
      pages: answer.pages,
      variant: answer.variant,
      omitted: [...view.omitted, ...answer.omitted.filter((o) => !seen.has(o.target))],
      live: answer.live,
      warnings: [...answer.warnings, ...answer.overflow],
    };
  }
}

// ------------------------------------------------------------------------------------------- import

export interface RemoteImportRequest extends PdfImportRequest {
  readonly modified?: string;
  readonly id?: string;
  readonly keepOriginal?: boolean;
}

export interface RemoteImportResult extends PdfImportResult {
  /** The service's raw answer (blocks with page numbers), for reports and tests. */
  readonly raw: DienstImportResult;
  readonly counts: Readonly<Record<string, number>>;
}

/** `PdfImport` through the service: Docling recognises structure, the core writes the document. */
export class RemoteDocling implements PdfImport {
  readonly info;
  constructor(private readonly client: DienstClient) {
    this.info = { name: 'RemoteDocling', location: client.location } as const;
  }

  availability(): Promise<Availability> {
    return this.client.availability();
  }

  async import(request: RemoteImportRequest): Promise<RemoteImportResult> {
    request.onProgress?.(0);
    const raw = await this.client.post<DienstImportResult>(
      '/v1/import',
      { fileName: request.fileName, ocr: request.ocr ?? 'auto', languages: request.languages?.join(',') },
      request.pdf,
      request.signal,
    );
    const mapped = await importToDocument(raw, {
      pdf: request.pdf,
      fileName: request.fileName,
      ...(request.modified !== undefined ? { modified: request.modified } : {}),
      ...(request.id !== undefined ? { id: request.id } : {}),
      ...(request.languages?.[0] !== undefined ? { language: request.languages[0] } : {}),
      ...(request.keepOriginal !== undefined ? { keepOriginal: request.keepOriginal } : {}),
    });
    request.onProgress?.(1);
    return { document: mapped.document, warnings: mapped.warnings, engine: { name: raw.engine.name, version: raw.engine.version }, raw, counts: mapped.counts };
  }
}

// ------------------------------------------------------------------------------------------- OCR

/** `Ocr` through the service (Tesseract). */
export class RemoteTesseractOcr implements Ocr {
  readonly info;
  constructor(private readonly client: DienstClient) {
    this.info = { name: 'RemoteTesseractOcr', location: client.location } as const;
  }

  availability(): Promise<Availability> {
    return this.client.availability();
  }

  async supportedLanguages(): Promise<readonly string[]> {
    return (await this.client.status()).ocrLanguages ?? [];
  }

  async recognize(request: OcrRequest): Promise<OcrResult> {
    const answer = await this.client.post<OcrResult & { words: number }>(
      '/v1/ocr/image',
      { languages: request.languages.join(','), dpi: request.image.dpi !== undefined ? String(request.image.dpi) : undefined },
      request.image.bytes,
      request.signal,
    );
    return { text: answer.text, lines: answer.lines, ...(answer.meanConfidence != null ? { meanConfidence: answer.meanConfidence } : {}), engine: answer.engine };
  }

  /** Scanned PDF → searchable PDF: the pages stay, an invisible text layer is added. */
  async searchablePdf(pdf: Uint8Array, options: { languages: readonly string[]; mode?: 'auto' | 'force'; dpi?: number; signal?: AbortSignal }): Promise<SearchablePdfResult> {
    const answer = await this.client.post<{ pdf: string; pages: SearchablePdfPage[]; ocrPages: number; words: number; meanConfidence: number | null; engine: { name: string; version: string } }>(
      '/v1/ocr/pdf',
      { languages: options.languages.join(','), mode: options.mode ?? 'auto', dpi: options.dpi !== undefined ? String(options.dpi) : undefined },
      pdf,
      options.signal,
    );
    return { pdf: fromBase64(answer.pdf), pages: answer.pages, ocrPages: answer.ocrPages, words: answer.words, meanConfidence: answer.meanConfidence, engine: answer.engine };
  }
}

export interface SearchablePdfPage {
  readonly page: number;
  readonly ocr: boolean;
  readonly reason: string;
  readonly words: number;
  readonly meanConfidence: number | null;
  readonly text: string;
}

export interface SearchablePdfResult {
  readonly pdf: Uint8Array;
  readonly pages: readonly SearchablePdfPage[];
  readonly ocrPages: number;
  readonly words: number;
  readonly meanConfidence: number | null;
  readonly engine: { readonly name: string; readonly version: string };
}

/** Base64 helper shared with tests (the service answers with base64 PDFs). */
export const base64 = { encode: toBase64, decode: fromBase64 };
