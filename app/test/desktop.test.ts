/**
 * Desktop shell bridge (P11): absent in a browser, headers percent-encoded, binary bodies, and a
 * `Pkcs11Signer` that hands the canonical `SignedInfo` (not the digest) to the shell. The real
 * shell is tested in huelle/ (cargo test, scripts/e2e-*.sh).
 */
import { createContainer, createTestIdentity, signContainer, SoftwareKeySigner, validateContainer } from '@hpro/kern';
import { afterEach, describe, expect, it } from 'vitest';
import { desktop, DesktopShell, Pkcs11Signer } from '../src/desktop.js';

interface Call {
  cmd: string;
  args: unknown;
  headers: Record<string, string> | undefined;
}

function fakeShell(answers: Record<string, (args: unknown, headers?: Record<string, string>) => unknown>): { shell: DesktopShell; calls: Call[] } {
  const calls: Call[] = [];
  const shell = new DesktopShell({
    invoke: async <T,>(cmd: string, args?: unknown, options?: { headers?: Record<string, string> }): Promise<T> => {
      calls.push({ cmd, args, headers: options?.headers });
      const f = answers[cmd];
      if (!f) throw new Error(`command ${cmd} not allowed`);
      return (await f(args, options?.headers)) as T;
    },
  });
  return { shell, calls };
}

afterEach(() => {
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

describe('desktop shell bridge', () => {
  it('is absent in a browser and present with the Tauri internals', () => {
    expect(desktop()).toBeNull();
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = { invoke: async () => [] };
    expect(desktop()).toBeInstanceOf(DesktopShell);
  });

  it('sends bytes as body and names as percent-encoded headers', async () => {
    const { shell, calls } = fakeShell({ save_as: () => ({ id: 'd2', name: 'x.hpro', size: 3 }), read_document: () => new Uint8Array([1, 2, 3]).buffer });
    await shell.saveAs(new Uint8Array([7, 8, 9]), 'Bericht – geändert.hpro', 'd1');
    expect(calls[0]!.args).toEqual(new Uint8Array([7, 8, 9]));
    expect(calls[0]!.headers).toEqual({ 'x-hpro-name': encodeURIComponent('Bericht – geändert.hpro'), 'x-hpro-near': 'd1' });
    expect([...(await shell.read('d1'))]).toEqual([1, 2, 3]);
  });

  it('splits the PDF answer into report and PDF', async () => {
    const report = new TextEncoder().encode('{"ok":true}');
    const answer = new Uint8Array(4 + report.length + 4);
    new DataView(answer.buffer).setUint32(0, report.length);
    answer.set(report, 4);
    answer.set(new TextEncoder().encode('%PDF'), 4 + report.length);
    const { shell, calls } = fakeShell({ pdf_export: () => answer.buffer });
    const r = await shell.pdfExport(new Uint8Array([1]));
    expect(r.report).toEqual({ ok: true });
    expect(new TextDecoder().decode(r.pdf)).toBe('%PDF');
    expect(calls[0]!.headers).toEqual({ 'x-hpro-conformance': encodeURIComponent('PDF/A-2a,PDF/UA-1') });
  });

  it('signs through the shell: the core builds XAdES, the token signs SignedInfo', async () => {
    const id = await createTestIdentity({ algorithm: 'EC-P256', commonName: 'P11 Test' });
    // Stands in for the token: the software key of the test identity signs `data`.
    const token = await SoftwareKeySigner.fromPkcs8(id.pkcs8, { certificateChain: [id.certificate] });
    const tokenKey = (await token.listKeys())[0]!;
    const { shell, calls } = fakeShell({
      system_keys: () => [{ keyId: '5:02', label: 'EC', token: 'hpro-test', certificate: btoa(String.fromCharCode(...id.certificate)) }],
      system_sign: async (data) =>
        token.signDigest({ keyId: tokenKey.keyId, algorithm: 'ECDSA-P256-SHA256', data: data as Uint8Array, digest: new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(data as Uint8Array))), digestAlgorithm: 'SHA-256' }),
    });
    const signer = new Pkcs11Signer(shell, '1234');
    const [key] = await signer.listKeys();
    expect(key!.algorithms).toEqual(['ECDSA-P256-SHA256']);
    const xhtml = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="de" lang="de"><head><meta charset="UTF-8"/><title>Desktop</title></head><body><section id="s"><h1 id="s-h">Desktop</h1><p>Hallo</p></section></body></html>\n';
    const unsigned = await createContainer({
      id: 'urn:uuid:0b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b',
      title: 'Desktop',
      language: 'de',
      modified: '2026-10-13T09:00:00Z',
      readingOrder: ['content/index.xhtml'],
      toc: { title: 'Inhalt', entries: [{ title: 'Desktop', href: 'content/index.xhtml#s' }] },
      resources: [{ path: 'content/index.xhtml', mediaType: 'application/xhtml+xml', data: xhtml }],
    });
    const signed = await signContainer(unsigned.bytes, { signer, key: key! });
    const sign = calls.find((c) => c.cmd === 'system_sign')!;
    expect(sign.headers!['x-hpro-key']).toBe(encodeURIComponent('5:02'));
    expect(sign.headers!['x-hpro-pin']).toBe('1234');
    expect(new TextDecoder().decode(sign.args as Uint8Array)).toMatch(/^<ds:SignedInfo/);
    const report = await validateContainer(signed.bytes, { trustAnchors: [id.certificate] });
    expect(report.signatures[0]!.indication).toBe('TOTAL_PASSED');
  });
});
