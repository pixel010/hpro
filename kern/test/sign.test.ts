// Package P3: signing in the core (XAdES-BASELINE-B, WebCrypto software key, own ZIP writer).
// The cross-checks with epubcheck 5.4.0 and EU DSS 6.5 run when prototyp/tools/ and the
// compiled DSS tool exist; otherwise they are skipped with the reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  SoftwareKeySigner,
  createContainer,
  createTestIdentity,
  parseCertificate,
  pkcs8FromPem,
  readContainer,
  readZip,
  sampleDocument,
  signContainer,
  toPem,
  validateContainer,
  writeZip,
  type DetailedValidationReport,
  type TestIdentity,
  type ZipEntry,
} from '../src/index.js';
import { isIssuedBy } from '../src/x509.js';
import { PROTOTYPE_CONTAINERS, REPO_ROOT, assertContainerError, text } from './helpers.js';

const SIGNED_PATHS = [
  'META-INF/container.xml',
  'content/anhang.xhtml',
  'content/index.xhtml',
  'content/media/lieferplan.svg',
  'content/nav.xhtml',
  'content/styles/document.css',
  'manifest.json',
  'package.opf',
];
const SIGNING_TIME = new Date('2026-10-11T12:00:00Z');
const NOT_BEFORE = new Date('2026-01-01T00:00:00Z');

const identities = new Map<string, Promise<TestIdentity>>();
function identity(algorithm: 'RSA-3072' | 'EC-P256', commonName = `Test ${algorithm}`): Promise<TestIdentity> {
  const key = `${algorithm}/${commonName}`;
  if (!identities.has(key)) identities.set(key, createTestIdentity({ algorithm, commonName, notBefore: NOT_BEFORE }));
  return identities.get(key)!;
}

async function signer(id: TestIdentity): Promise<SoftwareKeySigner> {
  return SoftwareKeySigner.fromPkcs8(id.pkcs8, { certificateChain: [id.certificate] });
}

let unsigned: Promise<Uint8Array> | undefined;
const unsignedSample = () => (unsigned ??= createContainer(sampleDocument()).then((c) => c.bytes));

async function signedSample(algorithm: 'RSA-3072' | 'EC-P256' = 'RSA-3072'): Promise<{ bytes: Uint8Array; id: TestIdentity; signatureId: string }> {
  const id = await identity(algorithm);
  const signed = await signContainer(await unsignedSample(), { signer: await signer(id), signingTime: SIGNING_TIME });
  return { bytes: signed.bytes, id, signatureId: signed.signatureId };
}

const verdicts = (r: DetailedValidationReport) => r.signatures.map((s) => `${s.indication}${s.subIndication ? '/' + s.subIndication : ''}`);

/** Rewrites a container with `edit` applied to its entries, like an attacker with a ZIP tool would. */
async function rewrite(bytes: Uint8Array, edit: (entries: ZipEntry[]) => { name: string; data: Uint8Array }[]): Promise<Uint8Array> {
  return writeZip(
    edit(await readZip(bytes)).map((e) => ({ name: e.name, data: e.data, compression: e.name === 'mimetype' ? 'store' : 'deflate' })),
    { modified: new Date('2026-10-11T00:00:00Z') },
  );
}

const replaceIn = (name: string, from: string, to: string) => (entries: ZipEntry[]) =>
  entries.map((e) => {
    if (e.name !== name) return e;
    assert.ok(text(e.data).includes(from), `"${from}" not in ${name}`);
    return { name: e.name, data: new TextEncoder().encode(text(e.data).replace(from, to)) };
  });

// --- test identities ---------------------------------------------------------------------

for (const algorithm of ['RSA-3072', 'EC-P256'] as const) {
  test(`createTestIdentity ${algorithm}: self-signed v3 certificate for signing, key matches`, async () => {
    const id = await identity(algorithm);
    const cert = parseCertificate(id.certificate);
    assert.equal(cert.subject, `CN=Test ${algorithm},O=hpro Test,C=AT`);
    assert.equal(cert.issuer, cert.subject);
    assert.deepEqual(cert.keyUsage, ['digitalSignature', 'nonRepudiation']);
    assert.equal(cert.isCa, false);
    assert.equal(cert.notBefore.toISOString(), NOT_BEFORE.toISOString());
    assert.ok(await isIssuedBy(cert, cert), 'self-signature verifies');
    const s = await signer(id);
    const [key] = await s.listKeys();
    assert.deepEqual(key!.algorithms, [algorithm === 'RSA-3072' ? 'RSASSA-PKCS1-v1_5-SHA256' : 'ECDSA-P256-SHA256']);
    assert.equal(key!.qualified, false);
  });
}

test('PEM round trip of the PKCS#8 key; PKCS#1 keys are refused with a conversion hint', async () => {
  const id = await identity('EC-P256');
  assert.deepEqual(pkcs8FromPem(toPem('PRIVATE KEY', id.pkcs8)), id.pkcs8);
  await assertContainerError(() => pkcs8FromPem('-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----\n'), 'signature', /openssl pkcs8 -topk8/);
});

test('SoftwareKeySigner refuses a key that does not belong to the certificate', async () => {
  const a = await identity('RSA-3072');
  const b = await identity('RSA-3072', 'Someone else');
  await assertContainerError(SoftwareKeySigner.fromPkcs8(a.pkcs8, { certificateChain: [b.certificate] }), 'signature', /does not belong/);
});

test('SoftwareKeySigner refuses a digest that is not the hash of the data', async () => {
  const s = await signer(await identity('RSA-3072'));
  const data = new TextEncoder().encode('<ds:SignedInfo/>');
  await assertContainerError(
    s.signDigest({ keyId: 'software-key', algorithm: 'RSASSA-PKCS1-v1_5-SHA256', digest: new Uint8Array(32), digestAlgorithm: 'SHA-256', data }),
    'signature',
    /does not match/,
  );
});

// --- signing ------------------------------------------------------------------------------

for (const algorithm of ['RSA-3072', 'EC-P256'] as const) {
  test(`signContainer ${algorithm}: XAdES-BASELINE-B over all files plus container.xml, own check TOTAL_PASSED`, async () => {
    const { bytes, id, signatureId } = await signedSample(algorithm);
    const report = await validateContainer(bytes, { trustAnchors: [id.certificate], validationTime: '2026-10-11T12:00:00Z' });
    assert.deepEqual(verdicts(report), ['TOTAL_PASSED']);
    const sig = report.signatures[0]!;
    assert.equal(sig.signatureId, signatureId);
    assert.equal(sig.file, 'META-INF/signatures.xml');
    assert.equal(sig.level, 'XAdES-BASELINE-B');
    assert.deepEqual(sig.signedPaths, SIGNED_PATHS);
    assert.equal(sig.claimedSigningTime, '2026-10-11T12:00:00Z');
    assert.deepEqual(sig.warnings, [], 'hpro policy accepts the EPUB mimetype without warning');
    assert.deepEqual(report.unsignedPaths, []);
    assert.equal(sig.canonicalization, 'http://www.w3.org/2001/10/xml-exc-c14n#');
  });
}

test('signed container: mimetype first, stored, no extra field; original entries unchanged; OCF root; ODF manifest', async () => {
  const before = await readZip(await unsignedSample());
  const { bytes } = await signedSample();
  const after = await readZip(bytes);
  assert.equal(after[0]!.name, 'mimetype');
  assert.equal(after[0]!.localHeaderOffset, 0);
  assert.equal(after[0]!.method, 'stored');
  assert.equal(after[0]!.localExtraLength, 0);
  assert.equal(text(after[0]!.data), 'application/epub+zip');
  assert.deepEqual(
    after.slice(0, before.length).map((e) => [e.name, e.method, Buffer.from(e.data).toString('base64')]),
    before.map((e) => [e.name, e.method, Buffer.from(e.data).toString('base64')]),
  );
  assert.deepEqual(after.slice(before.length).map((e) => e.name), ['META-INF/signatures.xml', 'META-INF/manifest.xml']);
  const sigXml = text(after.find((e) => e.name === 'META-INF/signatures.xml')!.data);
  assert.match(sigXml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<signatures xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><ds:Signature /);
  assert.match(sigXml, /<xades:MimeType>application\/xhtml\+xml<\/xades:MimeType>/, 'real media types, not octet-stream');
  const odf = text(after.find((e) => e.name === 'META-INF/manifest.xml')!.data);
  assert.match(odf, /manifest:full-path="\/" manifest:media-type="application\/epub\+zip"/);
  for (const p of SIGNED_PATHS) assert.ok(odf.includes(`manifest:full-path="${p}"`), p);
  const c = await readContainer(bytes);
  assert.equal(c.integrity.ok, true);
});

test('countersignature: appended as last child, first signature bytes untouched, both TOTAL_PASSED', async () => {
  const first = await signedSample('RSA-3072');
  const ec = await identity('EC-P256', 'Gegenzeichner');
  const second = await signContainer(first.bytes, { signer: await signer(ec), signingTime: new Date('2026-10-11T12:05:00Z') });
  const xml1 = text((await readZip(first.bytes)).find((e) => e.name === 'META-INF/signatures.xml')!.data);
  const xml2 = text((await readZip(second.bytes)).find((e) => e.name === 'META-INF/signatures.xml')!.data);
  const end = xml1.lastIndexOf('</signatures>');
  assert.equal(xml2.slice(0, end), xml1.slice(0, end), 'everything before the closing tag is kept byte for byte');
  assert.ok(xml2.slice(end).startsWith(`<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${second.signatureId}">`));
  const report = await validateContainer(second.bytes, { trustAnchors: [first.id.certificate, ec.certificate], validationTime: '2026-10-11T12:10:00Z' });
  assert.deepEqual(verdicts(report), ['TOTAL_PASSED', 'TOTAL_PASSED']);
  assert.deepEqual(report.signatures.map((s) => s.signatureId), [first.signatureId, second.signatureId]);
});

test('manipulation after signing: own validator reports TOTAL_FAILED/HASH_FAILURE on the changed file', async () => {
  const { bytes, id } = await signedSample();
  const changed = await rewrite(bytes, replaceIn('content/index.xhtml', '1.200,00 EUR</strong>', '9.200,00 EUR</strong>'));
  const report = await validateContainer(changed, { trustAnchors: [id.certificate], validationTime: '2026-10-11T12:00:00Z' });
  assert.deepEqual(verdicts(report), ['TOTAL_FAILED/HASH_FAILURE']);
  const failed = report.signatures[0]!.references!.filter((r) => r.status === 'hash-failure').map((r) => r.path);
  assert.deepEqual(failed, ['content/index.xhtml']);
});

test('manipulation of the signed properties (signing time) is detected', async () => {
  const { bytes, id } = await signedSample();
  const changed = await rewrite(bytes, replaceIn('META-INF/signatures.xml', '<xades:SigningTime>2026-10-11T12:00:00Z', '<xades:SigningTime>2026-01-02T12:00:00Z'));
  const report = await validateContainer(changed, { trustAnchors: [id.certificate], validationTime: '2026-10-11T12:00:00Z' });
  assert.deepEqual(verdicts(report), ['TOTAL_FAILED/HASH_FAILURE']);
});

test('partial signature (docs/10, promise 5): an unsigned living file may change, the signature stays valid', async () => {
  const id = await identity('RSA-3072');
  const frozen = SIGNED_PATHS.filter((p) => p !== 'content/anhang.xhtml' && p !== 'META-INF/container.xml');
  const signed = await signContainer(await unsignedSample(), { signer: await signer(id), signingTime: SIGNING_TIME, paths: frozen });
  assert.deepEqual(signed.signedPaths, ['META-INF/container.xml', ...frozen]);
  const odf = text((await readZip(signed.bytes)).find((e) => e.name === 'META-INF/manifest.xml')!.data);
  assert.ok(odf.includes('manifest:full-path="content/anhang.xhtml"'), 'ODF manifest still lists every file');
  const edited = await rewrite(signed.bytes, replaceIn('content/anhang.xhtml', '</body>', '<p>Notiz</p></body>'));
  const report = await validateContainer(edited, { trustAnchors: [id.certificate], validationTime: '2026-10-11T12:00:00Z' });
  assert.deepEqual(verdicts(report), ['TOTAL_PASSED']);
  assert.deepEqual(report.unsignedPaths, ['content/anhang.xhtml']);
  assert.ok(report.signatures[0]!.warnings.includes('Not all files are signed!'));
  await assertContainerError(signContainer(await unsignedSample(), { signer: await signer(id), paths: ['content/fehlt.xhtml'] }), 'signature', /does not exist/);
  await assertContainerError(signContainer(await unsignedSample(), { signer: await signer(id), paths: ['META-INF/manifest.xml'] }), 'signature', /cannot be selected/);
});

test('signContainer refuses a container whose manifest.json does not verify', async () => {
  const broken = await rewrite(await unsignedSample(), replaceIn('content/index.xhtml', '1.200,00', '9.200,00'));
  await assertContainerError(signContainer(broken, { signer: await signer(await identity('RSA-3072')) }), 'signature', /manifest\.json does not verify/);
});

test('signContainer refuses a signing time outside the certificate validity', async () => {
  await assertContainerError(
    signContainer(await unsignedSample(), { signer: await signer(await identity('RSA-3072')), signingTime: new Date('2025-06-01T00:00:00Z') }),
    'signature',
    /outside the certificate validity/,
  );
});

test('signContainer refuses to append to a signatures.xml with ASiC root (docs/05, V4)', async () => {
  const asicRoot = await readFile(resolve(PROTOTYPE_CONTAINERS, 'hybrid-sigxml-asicroot.epub'));
  await assertContainerError(signContainer(asicRoot, { signer: await signer(await identity('RSA-3072')) }), 'signature', /OCF root/);
});

test('signContainer adds a signature to the prototype container V11 without breaking its two DSS signatures', async () => {
  const v11 = await readFile(resolve(PROTOTYPE_CONTAINERS, 'zielformat-2sig.epub'));
  const proto = parseCertificate(
    Buffer.from((await readFile(resolve(PROTOTYPE_CONTAINERS, 'signer.pem'), 'utf8')).replace(/-----[^-]+-----|\s/g, ''), 'base64'),
  );
  const id = await identity('EC-P256');
  const signed = await signContainer(v11, { signer: await signer(id), signingTime: SIGNING_TIME });
  const report = await validateContainer(signed.bytes, { trustAnchors: [proto.der, id.certificate], validationTime: '2026-10-11T12:00:00Z' });
  assert.deepEqual(verdicts(report), ['TOTAL_PASSED', 'TOTAL_PASSED', 'TOTAL_PASSED']);
});

// --- cross-checks with the Java tools (acceptance criteria 1-3) ----------------------------

const JAVA = resolve(REPO_ROOT, 'prototyp/tools/jdk-21.0.12.1+1/bin/java');
const EPUBCHECK = resolve(REPO_ROOT, 'prototyp/tools/epubcheck-5.4.0/epubcheck.jar');
const DSS_CLASSES = resolve(REPO_ROOT, 'prototyp/dss/target/classes');
const DSS_LIB = resolve(REPO_ROOT, 'prototyp/dss/target/lib');
const missing = [JAVA, EPUBCHECK, DSS_CLASSES, DSS_LIB].filter((p) => !existsSync(p));
const skip = missing.length > 0 ? `tools missing (run prototyp/setup-tools.sh): ${missing.join(', ')}` : false;

async function run(args: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await promisify(execFile)(JAVA, args, { timeout: 420_000, maxBuffer: 16 * 1024 * 1024 });
    return stdout + stderr;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    return (e.stdout ?? '') + (e.stderr ?? '') + e.message;
  }
}

async function withFiles<T>(files: Record<string, Uint8Array | string>, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'hpro-p3-'));
  try {
    for (const [name, data] of Object.entries(files)) await writeFile(join(dir, name), data);
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const dss = (dir: string, file: string) =>
  run(['-Dorg.slf4j.simpleLogger.defaultLogLevel=warn', '-cp', `${DSS_CLASSES}:${DSS_LIB}/*`, 'example.hpro.HproDss', 'validate', join(dir, file), join(dir, 'signer.pem')]);

test('epubcheck 5.4.0: signed container has 0 fatals, 0 errors, 0 warnings', { skip, timeout: 480_000 }, async () => {
  const { bytes } = await signedSample();
  const out = await withFiles({ 'signed.epub': bytes }, (dir) => run(['-jar', EPUBCHECK, join(dir, 'signed.epub')]));
  assert.match(out, /Messages: 0 fatals \/ 0 errors \/ 0 warnings/, out);
});

for (const algorithm of ['RSA-3072', 'EC-P256'] as const) {
  test(`EU DSS 6.5 confirms the ${algorithm} signature (TOTAL_PASSED) and reports HASH_FAILURE after manipulation`, { skip, timeout: 480_000 }, async () => {
    const { bytes, id } = await signedSample(algorithm);
    const changed = await rewrite(bytes, replaceIn('content/index.xhtml', '1.200,00 EUR</strong>', '9.200,00 EUR</strong>'));
    const [ok, bad] = await withFiles({ 'signed.epub': bytes, 'changed.epub': changed, 'signer.pem': toPem('CERTIFICATE', id.certificate) }, async (dir) => [
      await dss(dir, 'signed.epub'),
      await dss(dir, 'changed.epub'),
    ]);
    assert.match(ok, /Anzahl Signaturen: 1 \(gültig: 1\)/, ok);
    assert.match(ok, /Format: XAdES-BASELINE-B\nIndication: TOTAL_PASSED\n/, ok);
    assert.match(ok, /Format-Prüfung \(FC\): PASSED/, ok);
    assert.ok(ok.includes(`Signierte Objekte: [${SIGNED_PATHS.join(', ')}]`), ok);
    assert.match(bad, /Indication: TOTAL_FAILED \/ HASH_FAILURE/, bad);
  });
}
