/**
 * Desktop shell (P11, huelle/): the reader runs unchanged inside Tauri 2; this module is the only
 * place that talks to the shell. Outside the shell `desktop()` returns `null` and the web paths
 * (file input, downloads, service worker) stay as they are.
 *
 * The shell offers eight commands (huelle/src-tauri/build.rs) to this window only. Paths never
 * cross the bridge: files are opened and saved through native dialogs on the Rust side, the web
 * side sees opaque ids. The document frame below frame.html has no access to any of this
 * (docs/14, measured by huelle/scripts/e2e-ipc.sh).
 */
import type { DigestSignRequest, Signer, SigningKey } from '@hpro/kern';
import { algorithmForCertificate, parseCertificate } from '@hpro/kern';

interface TauriInternals {
  invoke<T>(cmd: string, args?: unknown, options?: { headers?: Record<string, string> }): Promise<T>;
}

/** A file the user handed to the shell (launch argument or open dialog). */
export interface DesktopFile {
  readonly id: string;
  readonly name: string;
  readonly size: number;
}

export interface SystemKey {
  readonly keyId: string;
  readonly label: string;
  readonly token: string;
  /** DER certificate, Base64. */
  readonly certificate: string;
}

export interface PdfExportResult {
  readonly report: Record<string, unknown>;
  readonly pdf: Uint8Array;
}

const enc = (s: string): string => encodeURIComponent(s);

function bytesOf(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  throw new Error('Antwort der Hülle ist kein Byteblock');
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class DesktopShell {
  readonly #ipc: TauriInternals;

  /**
   * `android` in the mobile shell (mobil/, P12): there `window.print()` does nothing (docs/06,
   * A10) and there is neither a PKCS#11 token nor the local service, so the shell prints through
   * `print_html` and offers no system signing or PDF export.
   */
  readonly platform: 'desktop' | 'android';

  constructor(ipc: TauriInternals) {
    this.#ipc = ipc;
    this.platform = /\bAndroid\b/.test(navigator.userAgent) ? 'android' : 'desktop';
  }

  takeLaunchFiles(): Promise<DesktopFile[]> {
    return this.#ipc.invoke('take_launch_files');
  }

  openDialog(): Promise<DesktopFile | null> {
    return this.#ipc.invoke('open_dialog');
  }

  async read(id: string): Promise<Uint8Array> {
    return bytesOf(await this.#ipc.invoke('read_document', { id }));
  }

  /** Native save dialog with `name` suggested; `null` when the user cancels. */
  saveAs(bytes: Uint8Array, name: string, nearId?: string): Promise<DesktopFile | null> {
    const headers: Record<string, string> = { 'x-hpro-name': enc(name) };
    if (nearId) headers['x-hpro-near'] = enc(nearId);
    return this.#ipc.invoke('save_as', new Uint8Array(bytes), { headers });
  }

  /** Mobile shell only: prints a finished print document (HTML, everything inline) natively. */
  printHtml(html: string, title: string): Promise<{ jobName: string; state: number }> {
    return this.#ipc.invoke('print_html', { html, title });
  }

  servicesStatus(): Promise<Record<string, unknown>> {
    return this.#ipc.invoke('services_status');
  }

  /** PDF through the local service (sidecar `hpro-dienst`, WeasyPrint + veraPDF). */
  async pdfExport(container: Uint8Array, conformance = 'PDF/A-2a,PDF/UA-1'): Promise<PdfExportResult> {
    const answer = bytesOf(await this.#ipc.invoke('pdf_export', new Uint8Array(container), { headers: { 'x-hpro-conformance': enc(conformance) } }));
    const n = new DataView(answer.buffer, answer.byteOffset, 4).getUint32(0);
    const report = JSON.parse(new TextDecoder().decode(answer.subarray(4, 4 + n))) as Record<string, unknown>;
    return { report, pdf: answer.slice(4 + n) };
  }

  systemKeys(): Promise<SystemKey[]> {
    return this.#ipc.invoke('system_keys');
  }

  async systemSign(key: string, algorithm: string, data: Uint8Array, pin: string, description: string): Promise<Uint8Array> {
    const headers = { 'x-hpro-key': enc(key), 'x-hpro-algorithm': enc(algorithm), 'x-hpro-pin': enc(pin), 'x-hpro-description': enc(description) };
    return bytesOf(await this.#ipc.invoke('system_sign', new Uint8Array(data), { headers }));
  }
}

let currentFile: string | undefined;

/** Remembers the id of the shown file: its folder is where "save as" starts. */
export function setDesktopFile(id: string | undefined): void {
  currentFile = id;
}

export function desktopFile(): string | undefined {
  return currentFile;
}

/** The shell, or `null` in a browser. Only the top window of the reader has the bridge. */
export function desktop(): DesktopShell | null {
  const ipc = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
  return ipc && typeof ipc.invoke === 'function' ? new DesktopShell(ipc) : null;
}

/**
 * `Pkcs11Signer` (docs/06, 4.1): signs with a key on a PKCS#11 token of the system. The core
 * builds the XAdES signature; the token only signs the canonical `SignedInfo`, after the shell
 * asked the user in a native dialog.
 */
export class Pkcs11Signer implements Signer {
  readonly kind = 'pkcs11' as const;
  readonly info = { name: 'Pkcs11Signer', version: '0.1.0', location: 'device' as const };
  readonly #shell: DesktopShell;
  readonly #pin: string;

  constructor(shell: DesktopShell, pin: string) {
    this.#shell = shell;
    this.#pin = pin;
  }

  async availability(): Promise<{ available: true } | { available: false; reason: string }> {
    try {
      await this.#shell.systemKeys();
      return { available: true };
    } catch (err) {
      return { available: false, reason: String(err) };
    }
  }

  async listKeys(): Promise<readonly SigningKey[]> {
    const keys = await this.#shell.systemKeys();
    return keys.map((k) => {
      const der = fromBase64(k.certificate);
      return {
        keyId: k.keyId,
        label: `${k.label} (${k.token})`,
        certificateChain: [der],
        algorithms: [algorithmForCertificate(parseCertificate(der))],
        qualified: false,
        requiresAuthorisationPerSignature: true,
      };
    });
  }

  signDigest(request: DigestSignRequest): Promise<Uint8Array> {
    return this.#shell.systemSign(request.keyId, request.algorithm, request.data, this.#pin, request.description ?? '');
  }
}
