import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { ContainerError, type ContainerErrorCode } from '../src/index.js';

/** Repository root, resolved from build/test/ after compilation. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const PROTOTYPE_CONTAINERS = resolve(REPO_ROOT, 'prototyp/ergebnisse/container');

/** SRI value computed with node:crypto, independent of the core's WebCrypto path. */
export function nodeSri(data: Uint8Array): string {
  return 'sha256-' + createHash('sha256').update(data).digest('base64');
}

export function nodeSha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export async function assertContainerError(promise: Promise<unknown> | (() => unknown), code: ContainerErrorCode, pattern?: RegExp): Promise<void> {
  try {
    await (typeof promise === 'function' ? promise() : promise);
  } catch (err) {
    assert.ok(err instanceof ContainerError, `expected ContainerError, got ${String(err)}`);
    assert.equal(err.code, code, `wrong error code, message: ${err.message}`);
    if (pattern) assert.match(err.message, pattern);
    return;
  }
  assert.fail(`expected ContainerError with code ${code}, but nothing was thrown`);
}

export const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
