import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  ContainerError,
  TsValidator,
  certificatesFromPem,
  readZip,
  validateContainer,
  writeZip,
  type DetailedValidationReport,
  type ValidateOptions,
  type ZipEntry,
} from '../src/index.js';
import { PROTOTYPE_CONTAINERS } from './helpers.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const MIMETYPE_WARNING = 'The mimetype file content does not correspond to the expected value(s)!';
const ALL_SIGNED_1 = ['META-INF/container.xml', 'content/index.xhtml', 'content/nav.xhtml', 'content/styles/document.css', 'manifest.json', 'package.opf'];
const ALL_SIGNED_2 = ALL_SIGNED_1.slice(1);

const load = (name: string) => readFile(resolve(PROTOTYPE_CONTAINERS, name));
const anchor = async () => certificatesFromPem(await readFile(resolve(PROTOTYPE_CONTAINERS, 'signer.pem'), 'utf8'));

async function check(bytes: Uint8Array, options: ValidateOptions = {}): Promise<DetailedValidationReport> {
  return validateContainer(bytes, { trustAnchors: await anchor(), policy: 'dss-default', validationTime: '2026-10-11T12:00:00Z', ...options });
}

const verdicts = (r: DetailedValidationReport) => r.signatures.map((s) => `${s.indication}${s.subIndication ? '/' + s.subIndication : ''}`);

/** Rewrites a container with `edit` applied to its entries (mimetype stays first and stored). */
async function rewrite(bytes: Uint8Array, edit: (entries: ZipEntry[]) => { name: string; data: Uint8Array }[]): Promise<Uint8Array> {
  const entries = edit(await readZip(bytes));
  return writeZip(
    entries.map((e) => ({ name: e.name, data: e.data, compression: e.name === 'mimetype' ? 'store' : 'deflate' })),
    { modified: new Date('2026-10-11T00:00:00Z') },
  );
}

function replaceIn(name: string, from: string, to: string) {
  return (entries: ZipEntry[]) =>
    entries.map((e) => {
      if (e.name !== name) return e;
      const text = dec.decode(e.data);
      assert.ok(text.includes(from), `"${from}" not in ${name}`);
      return { name: e.name, data: enc.encode(text.replace(from, to)) };
    });
}

// Expected verdicts: EU DSS 6.5 with its default policy and signer.pem as trust anchor,
// as logged in prototyp/ergebnisse/ (docs/05, table 4.1).
const PROTOTYPE_CASES: [file: string, verdicts: string[], mimetypeWarning: boolean][] = [
  ['basis.epub', [], false],
  ['umschlag.asice', ['TOTAL_PASSED'], false],
  ['dss-mimeparam.asice', ['TOTAL_PASSED'], true],
  ['asice-xades.asice', ['TOTAL_PASSED'], false],
  ['hybrid.epub', ['TOTAL_PASSED'], true],
  ['hybrid-sigxml-asicroot.epub', ['TOTAL_PASSED'], true],
  ['hybrid-sigxml-ocfroot.epub', ['TOTAL_PASSED'], true],
  ['asice-cades.asice', ['TOTAL_PASSED'], false],
  ['hybrid-cades.epub', ['TOTAL_PASSED'], true],
  ['hybrid.hpro', ['TOTAL_PASSED'], true],
  ['hybrid.asice', ['TOTAL_PASSED'], true],
  ['hybrid-eigenmime.hpro', ['TOTAL_PASSED'], true],
  ['hybrid-manipuliert.epub', ['TOTAL_FAILED/HASH_FAILURE'], true],
  ['hybrid-kommentar.epub', ['TOTAL_PASSED'], true],
  ['hybrid-2sig-direkt.epub', ['TOTAL_PASSED', 'TOTAL_PASSED'], true],
  ['hybrid-2sig.epub', ['TOTAL_PASSED', 'TOTAL_PASSED'], true],
  ['zielformat-2sig.epub', ['TOTAL_PASSED', 'TOTAL_PASSED'], true],
];

for (const [file, expected, mimetypeWarning] of PROTOTYPE_CASES) {
  test(`prototype container ${file}: same verdict as DSS (${expected.join(', ') || 'no signature'})`, async () => {
    const r = await check(await load(file));
    assert.deepEqual(verdicts(r), expected);
    for (const s of r.signatures) assert.equal(s.warnings.includes(MIMETYPE_WARNING), mimetypeWarning, s.warnings.join('; '));
  });
}

test('signed objects match DSS, including the second signature without container.xml (V10/V11)', async () => {
  const r = await check(await load('zielformat-2sig.epub'));
  assert.deepEqual(r.signatures.map((s) => s.signedPaths), [ALL_SIGNED_1, ALL_SIGNED_2]);
  assert.deepEqual(r.signatures.map((s) => s.file), ['META-INF/signatures.xml', 'META-INF/signatures.xml']);
  assert.ok(r.signatures.every((s) => s.level === 'XAdES-BASELINE-B'));
  assert.equal(r.signatures[0]!.signerSubject, 'CN=Testunterzeichner html-Pro,O=html-Pro Prototyp,C=AT');
  assert.deepEqual(r.unsignedPaths, []);
});

test('changing a signed file yields HASH_FAILURE for every signature covering it', async () => {
  const original = await load('zielformat-2sig.epub');
  const manipulated = await rewrite(original, replaceIn('content/index.xhtml', '1.200,00 EUR', '9.200,00 EUR'));
  const r = await check(manipulated);
  assert.deepEqual(verdicts(r), ['TOTAL_FAILED/HASH_FAILURE', 'TOTAL_FAILED/HASH_FAILURE']);
  for (const s of r.signatures) {
    const bad = s.references!.filter((x) => x.status !== 'intact').map((x) => `${x.status}:${x.path}`);
    assert.deepEqual(bad, ['hash-failure:content/index.xhtml']);
    assert.ok(s.errors.some((e) => e.startsWith('The reference data object is not intact!')));
  }
  // The rewrite itself is not the cause: the unchanged entries rewritten the same way still pass.
  const rewrittenOnly = await rewrite(original, (e) => e);
  assert.deepEqual(verdicts(await check(rewrittenOnly)), ['TOTAL_PASSED', 'TOTAL_PASSED']);
});

test('changing container.xml breaks only the signature that covers it (M02)', async () => {
  const bytes = await rewrite(await load('zielformat-2sig.epub'), replaceIn('META-INF/container.xml', '<rootfiles>', '<rootfiles> '));
  assert.deepEqual(verdicts(await check(bytes)), ['TOTAL_FAILED/HASH_FAILURE', 'TOTAL_PASSED']);
});

test('a missing signed file yields SIGNED_DATA_NOT_FOUND (M03)', async () => {
  const bytes = await rewrite(await load('zielformat-2sig.epub'), (e) => e.filter((x) => x.name !== 'content/styles/document.css'));
  assert.deepEqual(verdicts(await check(bytes)), ['INDETERMINATE/SIGNED_DATA_NOT_FOUND', 'INDETERMINATE/SIGNED_DATA_NOT_FOUND']);
});

test('a changed signature value yields SIG_CRYPTO_FAILURE (M04)', async () => {
  const bytes = await rewrite(await load('hybrid.epub'), (entries) =>
    entries.map((e) => {
      if (e.name !== 'META-INF/signatures001.xml') return e;
      const text = dec.decode(e.data);
      const at = text.indexOf('<ds:SignatureValue');
      const pos = text.indexOf('>', at) + 41;
      return { name: e.name, data: enc.encode(text.slice(0, pos) + (text[pos] === 'A' ? 'B' : 'A') + text.slice(pos + 1)) };
    }),
  );
  assert.deepEqual(verdicts(await check(bytes)), ['TOTAL_FAILED/SIG_CRYPTO_FAILURE']);
});

test('changing signed properties (signing time) yields HASH_FAILURE (M05)', async () => {
  const bytes = await rewrite(await load('hybrid.epub'), replaceIn('META-INF/signatures001.xml', '<xades:SigningTime>2026-10-11T10:30:27Z', '<xades:SigningTime>2025-01-01T00:00:00Z'));
  const r = await check(bytes);
  assert.deepEqual(verdicts(r), ['TOTAL_FAILED/HASH_FAILURE']);
  assert.deepEqual(r.signatures[0]!.references!.filter((x) => x.status !== 'intact').map((x) => x.kind), ['signed-properties']);
});

test('whitespace inside SignedInfo breaks the signature value, whitespace outside does not (M09, M14)', async () => {
  const inside = await rewrite(await load('hybrid.epub'), replaceIn('META-INF/signatures001.xml', '<ds:SignedInfo><ds:CanonicalizationMethod', '<ds:SignedInfo> <ds:CanonicalizationMethod'));
  assert.deepEqual(verdicts(await check(inside)), ['TOTAL_FAILED/SIG_CRYPTO_FAILURE']);
  const outside = await rewrite(
    await load('zielformat-2sig.epub'),
    replaceIn('META-INF/signatures.xml', '<signatures xmlns="urn:oasis:names:tc:opendocument:xmlns:container">', '<signatures xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:x="urn:example:noise">\n  '),
  );
  assert.deepEqual(verdicts(await check(outside)), ['TOTAL_PASSED', 'TOTAL_PASSED']);
});

test('trust: no anchor gives NO_CERTIFICATE_CHAIN_FOUND, but a hash failure still dominates (M07, M08)', async () => {
  assert.deepEqual(verdicts(await check(await load('hybrid.epub'), { trustAnchors: [] })), ['INDETERMINATE/NO_CERTIFICATE_CHAIN_FOUND']);
  assert.deepEqual(verdicts(await check(await load('hybrid-manipuliert.epub'), { trustAnchors: [] })), ['TOTAL_FAILED/HASH_FAILURE']);
});

test('the signing certificate is taken from the signature, not from the trust anchors (M13)', async () => {
  // KeyInfo removed: the right certificate is still available as trust anchor, but DSS does
  // not identify the signer from there either (docs/belege/P2, case M13).
  const bytes = await rewrite(await load('hybrid.epub'), (entries) =>
    entries.map((e) => (e.name === 'META-INF/signatures001.xml' ? { name: e.name, data: enc.encode(dec.decode(e.data).replace(/<ds:KeyInfo>[\s\S]*<\/ds:KeyInfo>/, '')) } : e)),
  );
  assert.deepEqual(verdicts(await check(bytes)), ['INDETERMINATE/NO_SIGNING_CERTIFICATE_FOUND']);
});

test('validation time after the certificate expiry gives OUT_OF_BOUNDS_NO_POE (not cross-checked with DSS)', async () => {
  assert.deepEqual(verdicts(await check(await load('hybrid.epub'), { validationTime: '2037-01-01T00:00:00Z' })), ['INDETERMINATE/OUT_OF_BOUNDS_NO_POE']);
});

test('policies: html-pro accepts the EPUB mimetype, strict fails it (V3)', async () => {
  const bytes = await load('hybrid.epub');
  const hp = await check(bytes, { policy: 'html-pro' });
  assert.deepEqual(verdicts(hp), ['TOTAL_PASSED']);
  assert.deepEqual(hp.signatures[0]!.warnings, []);
  const strict = await check(bytes, { policy: 'strict' });
  assert.deepEqual(verdicts(strict), ['TOTAL_FAILED/FORMAT_FAILURE']);
  assert.deepEqual(strict.signatures[0]!.errors, [MIMETYPE_WARNING]);
});

test('a file added after signing is named as unsigned (V9)', async () => {
  const r = await check(await load('hybrid-kommentar.epub'));
  assert.deepEqual(r.unsignedPaths, ['annotations/annotations.jsonld']);
  assert.ok(r.signatures[0]!.warnings.includes('Not all files are signed!'));
});

test('without META-INF/manifest.xml the XAdES container fails the format check (M10)', async () => {
  const bytes = await rewrite(await load('hybrid.epub'), (e) => e.filter((x) => x.name !== 'META-INF/manifest.xml'));
  const r = await check(bytes);
  assert.deepEqual(verdicts(r), ['TOTAL_FAILED/FORMAT_FAILURE']);
  assert.ok(r.signatures[0]!.errors.includes('The manifest file is absent!'));
});

test('CAdES: changed content and changed ASiC manifest both yield HASH_FAILURE (M11, M12)', async () => {
  const cades = await load('asice-cades.asice');
  const content = await rewrite(cades, replaceIn('content/index.xhtml', '1.200,00 EUR', '9.200,00 EUR'));
  assert.deepEqual(verdicts(await check(content)), ['TOTAL_FAILED/HASH_FAILURE']);
  const manifest = await rewrite(cades, replaceIn('META-INF/ASiCManifest001.xml', 'PSvL5/xvjRPOIwTmfzNAYNUjxpndJb', 'QSvL5/xvjRPOIwTmfzNAYNUjxpndJb'));
  const r = await check(manifest);
  assert.deepEqual(verdicts(r), ['TOTAL_FAILED/HASH_FAILURE']);
  assert.equal(r.signatures[0]!.references!.find((x) => x.kind === 'asic-manifest')!.status, 'hash-failure');
});

test('hardening: references must stay inside the container and inside the signature', async () => {
  const escape = await rewrite(await load('hybrid.epub'), replaceIn('META-INF/signatures001.xml', 'URI="content/index.xhtml"', 'URI="../content/index.xhtml"'));
  const r1 = await check(escape);
  assert.equal(r1.signatures[0]!.indication, 'TOTAL_FAILED'); // SignedInfo changed as well
  assert.ok(r1.signatures[0]!.references!.some((x) => x.status === 'unsupported' && x.uri === '../content/index.xhtml'));

  // A DOCTYPE in a signature file is refused before parsing.
  const doctype = await rewrite(await load('hybrid.epub'), replaceIn('META-INF/signatures001.xml', '<asic:XAdESSignatures', '<!DOCTYPE x [<!ENTITY e "x">]><asic:XAdESSignatures'));
  const r2 = await check(doctype);
  assert.deepEqual(verdicts(r2), ['TOTAL_FAILED/FORMAT_FAILURE']);
  assert.match(r2.signatures[0]!.errors[0]!, /DOCTYPE/);
});

test('input that is not a ZIP is rejected with ContainerError', async () => {
  await assert.rejects(validateContainer(enc.encode('no zip')), (err) => err instanceof ContainerError);
});

test('TsValidator implements the Validator adapter', async () => {
  const v = new TsValidator();
  assert.equal(v.kind, 'typescript');
  assert.equal(v.info.location, 'device');
  assert.deepEqual(await v.availability(), { available: true });
  let progress = 0;
  const report = await v.validate({
    container: await load('zielformat-2sig.epub'),
    trustAnchors: await anchor(),
    policy: 'html-pro',
    validationTime: '2026-10-11T12:00:00Z',
    onProgress: (f) => (progress = f),
  });
  assert.deepEqual(report.signatures.map((s) => s.indication), ['TOTAL_PASSED', 'TOTAL_PASSED']);
  assert.equal(report.validator.policy, 'html-pro');
  assert.equal(report.validationTime, '2026-10-11T12:00:00.000Z');
  assert.equal(progress, 1);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(v.validate({ container: await load('hybrid.epub'), signal: aborted.signal }));
});
