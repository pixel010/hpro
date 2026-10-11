import { toBase64, toHex } from './bytes.js';

/** SHA-256 over WebCrypto, available in browsers, webviews and Node >= 19. */
export async function sha256(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(data));
  return new Uint8Array(digest);
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  return toHex(await sha256(data));
}

/** Integrity string in Subresource Integrity form: `sha256-<base64>`. */
export async function sriSha256(data: Uint8Array): Promise<string> {
  return 'sha256-' + toBase64(await sha256(data));
}

export const SRI_SHA256_PATTERN = /^sha256-[A-Za-z0-9+/]{43}=$/;
