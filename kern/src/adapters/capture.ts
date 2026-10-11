import type { Adapter, OperationOptions } from './common.js';

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/tiff';

export interface RasterImage {
  readonly bytes: Uint8Array;
  readonly mediaType: ImageMediaType;
  readonly widthPx: number;
  readonly heightPx: number;
  /** Resolution if known (flatbed scans); camera images usually have none. */
  readonly dpi?: number;
}

export interface ScanRequest extends OperationOptions {
  readonly maxPages?: number;
  readonly colour?: 'colour' | 'greyscale' | 'black-white';
}

export interface ScanResult {
  /** Pages after cropping and perspective correction, in capture order. */
  readonly pages: readonly RasterImage[];
}

/**
 * `Scanner`: captures paper pages as images.
 * Implementations per docs/06, 4.1: `CameraCapture` (getUserMedia), image import,
 * `VisionKitScanner` (iOS), `MlKitScanner` (Android). Edge detection is only native (A8).
 */
export interface Scanner extends Adapter {
  /** Resolves to `null` when the user cancels. */
  scan(request?: ScanRequest): Promise<ScanResult | null>;
}

/** Axis-aligned box in image pixels. */
export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface OcrWord {
  readonly text: string;
  readonly box: BoundingBox;
  /** Engine confidence between 0 and 1; engines differ in calibration. */
  readonly confidence: number;
}

export interface OcrLine {
  readonly text: string;
  readonly box: BoundingBox;
  readonly words: readonly OcrWord[];
}

export interface OcrRequest extends OperationOptions {
  readonly image: RasterImage;
  /** BCP 47 tags in order of preference, e.g. `['de-AT', 'en']`. */
  readonly languages: readonly string[];
}

export interface OcrResult {
  readonly text: string;
  /** Lines in reading order as determined by the engine. */
  readonly lines: readonly OcrLine[];
  /** Mean word confidence between 0 and 1, if the engine reports one. */
  readonly meanConfidence?: number;
  readonly engine: { readonly name: string; readonly version?: string };
}

/**
 * `Ocr`: text recognition on a single page image.
 * Implementations per docs/06, 4.1: `TesseractWasmOcr`, `WindowsOcr`, `VisionOcr`,
 * `TesseractOcr`, `MlKitOcr`. Tesseract.js has no PDF input and no layout analysis.
 */
export interface Ocr extends Adapter {
  /** BCP 47 tags the engine can recognise on this device. */
  supportedLanguages(): Promise<readonly string[]>;
  recognize(request: OcrRequest): Promise<OcrResult>;
}
