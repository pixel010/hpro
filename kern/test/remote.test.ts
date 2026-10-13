// Package P10: remote signing over the CSC API v2 against the test double, RFC 3161
// time-stamps (mock TSA and recorded answers of four public services), XAdES-BASELINE-T and
// CRL-based revocation for certificate paths. No test needs the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  CscClient,
  CscError,
  CscTimestampAuthority,
  HttpTimestampAuthority,
  RemoteCscSigner,
  addSignatureTimestamp,
  certificatesFromPem,
  createContainer,
  encodeTimeStampRequest,
  parseCertificate,
  parseCrls,
  parseTimeStampResponse,
  readZip,
  sampleDocument,
  signContainer,
  tokenFromFile,
  validateContainer,
  verifyTimeStampToken,
  writeZip,
  type Certificate,
} from '../src/index.js';
import { parseSignedData } from '../src/cades.js';
import { parseDer, children, oid } from '../src/der.js';
import { CURVES, verifyWithCertificate } from '../src/x509.js';
import { REPO_ROOT, assertContainerError, text } from './helpers.js';
import { KU, createTestPki, generateKeyPair, issueCertificate, issueCrl, type TestPki } from './pki.js';
import { MockTsa, createMockRssp, ecdsaSignDigest, explicitUser, type MockCscService } from './remote-mock.js';

const FIXTURES = resolve(REPO_ROOT, 'kern/test/fixtures/tsp');
let pkiPromise: Promise<TestPki> | undefined;
const pki = () => (pkiPromise ??= createTestPki());

async function unsigned(): Promise<Uint8Array> {
  return (await createContainer(sampleDocument())).bytes;
}

async function setup(options: Parameters<typeof createMockRssp>[1] = {}) {
  const p = await pki();
  const service = await createMockRssp(p, options);
  const client = new CscClient({ baseUrl: service.baseUrl, fetch: service.fetch });
  await client.login('max.mustermann', 'testpasswort');
  const signer = new RemoteCscSigner(client, { authorize: explicitUser(service) });
  return { p, service, client, signer };
}

/** HttpTimestampAuthority bound to the mock TSA without a socket. */
function mockTsaFetch(tsa: MockTsa): typeof fetch {
  return async (_url, init) => {
    const body = new Uint8Array(init!.body as Uint8Array);
    return new Response(new Uint8Array(await tsa.respond(body)), { status: 200, headers: { 'Content-Type': 'application/timestamp-reply' } });
  };
}

const verdict = (s: { indication: string; subIndication?: string }) => `${s.indication}${s.subIndication ? '/' + s.subIndication : ''}`;

// --- test double sanity --------------------------------------------------------------

test('mock RSSP: ECDSA over a precomputed hash verifies with WebCrypto (the double signs correctly)', async () => {
  const key = await generateKeyPair('EC-P256');
  const data = new TextEncoder().encode('hpro P10');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  const sig = ecdsaSignDigest(key.jwk.d!, digest);
  assert.equal(sig.length, 64);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key.publicKey, new Uint8Array(sig), data));
  assert.equal(CURVES['1.2.840.10045.3.1.7']!.size, 32);
});

// --- CSC client -----------------------------------------------------------------------

test('CSC: info without token, login with HTTP Basic, wrong password is a CscError', async () => {
  const p = await pki();
  const service = await createMockRssp(p);
  const client = new CscClient({ baseUrl: service.baseUrl, fetch: service.fetch });
  const info = await client.info();
  assert.equal(info.specs, '2.2.0.0');
  assert.ok(info.methods.includes('signatures/signHash'));
  await assert.rejects(client.credentialsList(), (e: unknown) => e instanceof CscError && e.status === 400 && /Malformed authorization header/.test(e.message));
  await assert.rejects(client.login('max.mustermann', 'falsch'), (e: unknown) => e instanceof CscError && e.status === 401 && e.error === 'invalid_grant');
  await client.login('max.mustermann', 'testpasswort');
  assert.equal(client.authenticated, true);
});

test('RemoteCscSigner: credentials map to signing keys (chain, algorithms, not qualified, consent per signature)', async () => {
  const { signer, p } = await setup();
  const keys = await signer.listKeys();
  assert.deepEqual(keys.map((k) => [k.keyId, k.algorithms.join(','), k.certificateChain.length, k.qualified, k.requiresAuthorisationPerSignature]), [
    ['hpro-rsa-01', 'RSASSA-PKCS1-v1_5-SHA256', 2, false, true],
    ['hpro-ec-01', 'ECDSA-P256-SHA256', 2, false, true],
  ]);
  assert.deepEqual(keys[0]!.certificateChain[1], p.root.der);
  assert.equal(signer.info.location, 'remote-service');
});

for (const keyId of ['hpro-rsa-01', 'hpro-ec-01']) {
  test(`criterion 1: signature over the mock service (${keyId}) verifies in the core; only the hash leaves the device`, async () => {
    const { signer, service, p } = await setup();
    const key = (await signer.listKeys()).find((k) => k.keyId === keyId)!;
    const input = await unsigned();
    const signed = await signContainer(input, { signer, key, signatureId: 'remote-1' });
    assert.equal(signed.readBack.signatures[0]!.indication, 'TOTAL_PASSED');

    // Signing certificate as anchor: passed. Root CA as anchor without CRL: inconclusive (as DSS).
    const leaf = await validateContainer(signed.bytes, { trustAnchors: [key.certificateChain[0]!] });
    assert.equal(verdict(leaf.signatures[0]!), 'TOTAL_PASSED');
    const root = await validateContainer(signed.bytes, { trustAnchors: [p.root.der] });
    assert.equal(verdict(root.signatures[0]!), 'INDETERMINATE/CERTIFICATE_CHAIN_GENERAL_FAILURE');
    assert.equal(root.signatures[0]!.chain!.length, 2);
    // Root CA plus a CRL of the CA: passed with revocation checked.
    const crl = await issueCrl(p.root);
    const withCrl = await validateContainer(signed.bytes, { trustAnchors: [p.root.der], crls: [crl] });
    assert.equal(verdict(withCrl.signatures[0]!), 'TOTAL_PASSED');
    assert.ok(withCrl.signatures[0]!.infos!.some((i) => /not revoked/.test(i)));
    // No anchor: no chain.
    const none = await validateContainer(signed.bytes);
    assert.equal(verdict(none.signatures[0]!), 'INDETERMINATE/NO_CERTIFICATE_CHAIN_FOUND');

    // What went over the wire: method names, a 32-byte hash, no document content.
    assert.deepEqual(service.log.map((l) => `${l.method} ${l.status}`), [
      'auth/login 200',
      'credentials/list 200',
      'credentials/getChallenge 204',
      'credentials/authorize 200',
      'signatures/signHash 200',
    ]);
    const sent = JSON.stringify(service.log);
    assert.ok(!sent.includes('Lieferung') && !sent.includes('9.200') && !sent.includes('1.200'), 'document text must not reach the service');
    const signHash = service.log.find((l) => l.method === 'signatures/signHash')!.body;
    assert.equal((signHash.hashes as string[]).length, 1);
    assert.equal(Buffer.from((signHash.hashes as string[])[0]!, 'base64').length, 32);
    assert.equal(signHash.SAD, '(redacted)');
    assert.equal(signer.lastTrace!.valueEncoding, keyId === 'hpro-ec-01' ? 'der' : 'rsa');
  });
}

test('remote signature: manipulation after signing is HASH_FAILURE; revoked signer certificate is REVOKED_NO_POE', async () => {
  const { signer, p } = await setup();
  const signed = await signContainer(await unsigned(), { signer });
  const entries = await readZip(signed.bytes);
  const changed = await writeZip(
    entries.map((e) => ({ name: e.name, data: e.name === 'content/index.xhtml' ? new TextEncoder().encode(text(e.data).replace('1.200,00', '9.200,00')) : e.data, compression: e.name === 'mimetype' ? ('store' as const) : ('deflate' as const) })),
    { modified: new Date('2026-10-13T00:00:00Z') },
  );
  const report = await validateContainer(changed, { trustAnchors: [p.root.der], crls: [await issueCrl(p.root)] });
  assert.equal(verdict(report.signatures[0]!), 'TOTAL_FAILED/HASH_FAILURE');

  const crl = await issueCrl(p.root, [{ serialHex: p.signerRsa.cert.serialHex, at: new Date(Date.now() - 1000) }]);
  const revoked = await validateContainer(signed.bytes, { trustAnchors: [p.root.der], crls: [crl] });
  assert.equal(verdict(revoked.signatures[0]!), 'INDETERMINATE/REVOKED_NO_POE');
  // A CRL that is not signed by the CA is ignored.
  const foreign = await issueCrl(p.signerEc, []);
  const ignored = await validateContainer(signed.bytes, { trustAnchors: [p.root.der], crls: [foreign] });
  assert.equal(verdict(ignored.signatures[0]!), 'INDETERMINATE/CERTIFICATE_CHAIN_GENERAL_FAILURE');
});

test('CSC authorisation: wrong PIN is invalid_authentication_data, the third failure locks the credential', async () => {
  const { service, client } = await setup();
  const signer = new RemoteCscSigner(client, { authorize: explicitUser(service, '000000') });
  const sign = async () => signContainer(await unsigned(), { signer });
  for (let i = 0; i < 3; i++) await assert.rejects(sign(), (e: unknown) => e instanceof CscError && e.error === 'invalid_authentication_data');
  await assert.rejects(sign(), (e: unknown) => e instanceof CscError && /Credential locked/.test(e.message));
});

test('CSC SCAL 2: the SAD is bound to the authorised hash and used once', async () => {
  const { service, client } = await setup();
  const hashA = Buffer.alloc(32, 1).toString('base64');
  const hashB = Buffer.alloc(32, 2).toString('base64');
  await client.getChallenge('hpro-ec-01', 'OTP');
  const { SAD } = await client.authorize({ credentialID: 'hpro-ec-01', numSignatures: 1, hashes: [hashA], hashAlgorithmOID: '2.16.840.1.101.3.4.2.1', authData: [{ id: 'PIN', value: '123456' }, { id: 'OTP', value: service.outbox.at(-1)!.otp }] });
  await assert.rejects(client.signHash({ credentialID: 'hpro-ec-01', SAD, hashes: [hashB], signAlgo: '1.2.840.10045.4.3.2' }), /Hash is not authorized by the SAD/);
  await assert.rejects(client.signHash({ credentialID: 'hpro-ec-01', SAD, hashes: [hashA], signAlgo: '1.2.840.113549.1.1.11' }), /Invalid parameter signAlgo/);
  const [sig] = await client.signHash({ credentialID: 'hpro-ec-01', SAD, hashes: [hashA], signAlgo: '1.2.840.10045.4.3.2' });
  assert.ok(sig);
  await assert.rejects(client.signHash({ credentialID: 'hpro-ec-01', SAD, hashes: [hashA], signAlgo: '1.2.840.10045.4.3.2' }), /Invalid parameter SAD/);
  // An expired SAD is refused as well.
  await client.getChallenge('hpro-ec-01', 'OTP');
  const second = await client.authorize({ credentialID: 'hpro-ec-01', numSignatures: 1, hashes: [hashA], hashAlgorithmOID: '2.16.840.1.101.3.4.2.1', authData: [{ id: 'PIN', value: '123456' }, { id: 'OTP', value: service.outbox.at(-1)!.otp }] });
  const now = Date.now();
  service.clock = () => now + 301_000; // SAD lifetime of the double: 300 s; access token: 1 h
  await assert.rejects(client.signHash({ credentialID: 'hpro-ec-01', SAD: second.SAD, hashes: [hashA], signAlgo: '1.2.840.10045.4.3.2' }), /HTTP 400 invalid_request – SAD expired/);
  service.clock = () => now + 3_700_000;
  await assert.rejects(client.credentialsList(), (e: unknown) => e instanceof CscError && e.status === 401 && e.error === 'invalid_token');
});

test('RemoteCscSigner accepts raw r‖s from the service and refuses a value that does not verify', async () => {
  const raw = await setup({ ecdsaEncoding: 'raw' });
  const key = (await raw.signer.listKeys()).find((k) => k.keyId === 'hpro-ec-01')!;
  const signed = await signContainer(await unsigned(), { signer: raw.signer, key });
  assert.equal(raw.signer.lastTrace!.valueEncoding, 'raw');
  assert.equal(signed.readBack.signatures[0]!.indication, 'TOTAL_PASSED');

  const bad = await setup({ tamper: 'sign-other-hash' });
  await assertContainerError(signContainer(await unsigned(), { signer: bad.signer }), 'remote-signer', /does not verify with the credential certificate/);
});

test('RemoteCscSigner over real HTTP on 127.0.0.1 (server closed afterwards)', async () => {
  const p = await pki();
  const service = await createMockRssp(p);
  const server = await service.listen();
  try {
    const client = new CscClient({ baseUrl: server.url });
    await client.login('max.mustermann', 'testpasswort');
    const signer = new RemoteCscSigner(client, { authorize: explicitUser(service) });
    const tsa = new HttpTimestampAuthority(server.tsaUrl);
    const signed = await signContainer(await unsigned(), { signer, timestamp: tsa });
    const report = await validateContainer(signed.bytes, { trustAnchors: [p.root.der], crls: [await issueCrl(p.root)] });
    assert.equal(verdict(report.signatures[0]!), 'TOTAL_PASSED');
    assert.equal(report.signatures[0]!.level, 'XAdES-BASELINE-T');
    assert.equal(report.signatures[0]!.timestamps![0]!.indication, 'PASSED');
  } finally {
    await server.close();
  }
});

// --- RFC 3161 -------------------------------------------------------------------------

test('RFC 3161 request: version 1, SHA-256 imprint, nonce and certReq', () => {
  const digest = new Uint8Array(32).fill(7);
  const req = encodeTimeStampRequest(digest, { hashAlgorithm: 'SHA-256', nonce: Uint8Array.of(0, 0x80, 1) });
  const f = children(parseDer(req.der));
  assert.deepEqual(f[0]!.value, Uint8Array.of(1));
  assert.equal(oid(children(children(f[1]!)[0]!)[0]!), '2.16.840.1.101.3.4.2.1');
  assert.equal(req.nonceHex, '8001');
  assert.equal(f[3]!.value[0], 0xff);
  assert.throws(() => encodeTimeStampRequest(new Uint8Array(20), { hashAlgorithm: 'SHA-256' }), /needs 32/);
});

test('mock TSA: token verifies; chain to the root needs a CRL; tampering is detected', async () => {
  const p = await pki();
  const tsa = new MockTsa(p.tsa);
  const authority = new HttpTimestampAuthority('https://tsa.test.invalid/', { fetch: mockTsaFetch(tsa) });
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('x')));
  const r = await authority.timestamp({ digest, hashAlgorithm: 'SHA-256' });
  assert.equal(tsa.requests.at(-1)!.certReq, true);
  const noCrl = await verifyTimeStampToken(r.token, { digest, trustAnchors: [p.root.cert] });
  assert.equal(verdict(noCrl), 'INDETERMINATE/CERTIFICATE_CHAIN_GENERAL_FAILURE');
  const ok = await verifyTimeStampToken(r.token, { digest, trustAnchors: [p.root.cert], crls: parseCrls([await issueCrl(p.root)]) });
  assert.equal(verdict(ok), 'PASSED');
  assert.equal(ok.tstInfo!.policy, '2.999.3161.1');
  const other = await verifyTimeStampToken(r.token, { digest: new Uint8Array(32), trustAnchors: [p.root.cert] });
  assert.equal(verdict(other), 'FAILED/HASH_FAILURE');
  // One flipped bit in the TSTInfo breaks messageDigest.
  const sd = parseSignedData(r.token);
  const at = indexOf(r.token, sd.eContent!) + sd.eContent!.length - 3;
  const broken = new Uint8Array(r.token);
  broken[at]! ^= 1;
  const b = await verifyTimeStampToken(broken, { trustAnchors: [p.root.cert] });
  assert.equal(b.indication, 'FAILED');
});

test('HttpTimestampAuthority rejects refusals, wrong nonces and tokens without the TSA certificate is still verifiable with it', async () => {
  const p = await pki();
  const digest = new Uint8Array(32).fill(1);
  const refused = new HttpTimestampAuthority('https://tsa.test.invalid/', { fetch: mockTsaFetch(new MockTsa(p.tsa, { status: 2 })) });
  await assertContainerError(refused.timestamp({ digest, hashAlgorithm: 'SHA-256' }), 'timestamp', /rejection \[badRequest\] mock refusal/);
  const nonce = new HttpTimestampAuthority('https://tsa.test.invalid/', { fetch: mockTsaFetch(new MockTsa(p.tsa, { wrongNonce: true })) });
  await assertContainerError(nonce.timestamp({ digest, hashAlgorithm: 'SHA-256' }), 'timestamp', /nonce/);
  const bare = new MockTsa(p.tsa, { omitCertificate: true });
  const resp = await bare.respond(encodeTimeStampRequest(digest, { hashAlgorithm: 'SHA-256' }).der);
  const token = parseTimeStampResponse(resp).token!;
  assert.equal(verdict(await verifyTimeStampToken(token, { digest })), 'INDETERMINATE/NO_SIGNING_CERTIFICATE_FOUND');
  assert.equal(verdict(await verifyTimeStampToken(token, { digest, extraCertificates: [p.tsa.cert], trustAnchors: [p.tsa.cert] })), 'PASSED');
});

test('TSA certificate without extended key usage timeStamping is not accepted (RFC 3161 §2.3)', async () => {
  const p = await pki();
  const noEku = await issueCertificate({ subject: { cn: 'keine TSA' }, key: await generateKeyPair('EC-P256'), issuer: p.root, keyUsage: KU.digitalSignature });
  const tsa = new MockTsa(noEku);
  const digest = new Uint8Array(32).fill(3);
  const token = parseTimeStampResponse(await tsa.respond(encodeTimeStampRequest(digest, { hashAlgorithm: 'SHA-256' }).der)).token!;
  const v = await verifyTimeStampToken(token, { digest, trustAnchors: [noEku.cert] });
  assert.equal(verdict(v), 'INDETERMINATE/CHAIN_CONSTRAINTS_FAILURE');
});

const PUBLIC = [
  { name: 'freetsa', root: 'freetsa-root.pem', crls: 1, sig: '1.2.840.10045.4.3.4' },
  { name: 'digicert', root: 'digicert-root.der', crls: 3, sig: '1.2.840.113549.1.1.1' },
  { name: 'dfn', root: 'dfn-root.der', crls: 2, sig: '1.2.840.113549.1.1.11' },
  { name: 'sectigo-q', root: 'sectigo-root.der', crls: 2, sig: '1.2.840.113549.1.1.1' },
];

async function anchor(file: string): Promise<Certificate> {
  const raw = await readFile(resolve(FIXTURES, file));
  return parseCertificate(raw[0] === 0x30 ? new Uint8Array(raw) : certificatesFromPem(raw.toString('utf8'))[0]!);
}

for (const svc of PUBLIC) {
  test(`criterion 2 (offline part): recorded token of ${svc.name} verifies – imprint, signature, EKU, chain to the published root, CRLs`, async () => {
    const token = tokenFromFile(new Uint8Array(await readFile(resolve(FIXTURES, `${svc.name}.tsr`))));
    const data = new Uint8Array(await readFile(resolve(FIXTURES, 'data.txt')));
    const crls = parseCrls(await Promise.all(Array.from({ length: svc.crls }, (_, i) => readFile(resolve(FIXTURES, `${svc.name}-${i + 1}.crl`)).then((b) => new Uint8Array(b)))));
    const first = await verifyTimeStampToken(token, { data });
    const at = first.tstInfo!.genTime;
    const v = await verifyTimeStampToken(token, { data, trustAnchors: [await anchor(svc.root)], crls, validationTime: at });
    assert.equal(verdict(v), 'PASSED', v.errors.join('; '));
    assert.equal(v.messageImprint, 'match');
    assert.equal(v.signatureIntact, true);
    assert.equal(v.signatureAlgorithm, svc.sig);
    assert.ok(v.tsaCertificate!.extendedKeyUsage!.includes('1.3.6.1.5.5.7.3.8'));
    assert.ok(v.infos.filter((i) => /not revoked/.test(i)).length >= 1);
    const wrong = await verifyTimeStampToken(token, { data: new TextEncoder().encode('anderer Inhalt'), trustAnchors: [await anchor(svc.root)], crls, validationTime: at });
    assert.equal(verdict(wrong), 'FAILED/HASH_FAILURE');
  });
}

// --- XAdES-BASELINE-T -----------------------------------------------------------------

test('B-T: time-stamp over ds:SignatureValue, level T, signature still byte-identical in its signed part', async () => {
  const { signer, p, service } = await setup();
  const authority = new HttpTimestampAuthority('https://tsa.test.invalid/', { fetch: mockTsaFetch(service.tsa) });
  const signed = await signContainer(await unsigned(), { signer, timestamp: authority, signatureId: 'bt-1' });
  assert.ok(signed.timestamp);
  const report = await validateContainer(signed.bytes, { trustAnchors: [p.root.der], crls: [await issueCrl(p.root)] });
  const s = report.signatures[0]!;
  assert.equal(verdict(s), 'TOTAL_PASSED');
  assert.equal(s.level, 'XAdES-BASELINE-T');
  assert.equal(s.timestamps![0]!.indication, 'PASSED');
  assert.equal(s.timestamps![0]!.genTime, signed.timestamp.genTime);

  // A time-stamp that covers another signature value: the signature stays valid, the time-stamp fails.
  const entries = await readZip(signed.bytes);
  const sigXml = text(entries.find((e) => e.name === 'META-INF/signatures.xml')!.data);
  const other = await authority.timestamp({ digest: new Uint8Array(32).fill(9), hashAlgorithm: 'SHA-256' });
  const swapped = sigXml.replace(/<xades:EncapsulatedTimeStamp>[^<]+</, `<xades:EncapsulatedTimeStamp>${Buffer.from(other.token).toString('base64')}<`);
  const tampered = await writeZip(entries.map((e) => ({ name: e.name, data: e.name === 'META-INF/signatures.xml' ? new TextEncoder().encode(swapped) : e.data, compression: e.name === 'mimetype' ? ('store' as const) : ('deflate' as const) })), { modified: new Date('2026-10-13T00:00:00Z') });
  const t = (await validateContainer(tampered, { trustAnchors: [p.root.der], crls: [await issueCrl(p.root)] })).signatures[0]!;
  assert.equal(t.timestamps![0]!.indication, 'FAILED');
  assert.equal(t.timestamps![0]!.subIndication, 'HASH_FAILURE');
  assert.ok(t.warnings.some((x) => /signature time-stamp ts-bt-1: FAILED\/HASH_FAILURE/.test(x)));
});

test('B-T: addSignatureTimestamp extends a B signature; signed bytes stay, second call is refused', async () => {
  const { signer, p, service } = await setup();
  const authority = new HttpTimestampAuthority('https://tsa.test.invalid/', { fetch: mockTsaFetch(service.tsa) });
  const b = await signContainer(await unsigned(), { signer, signatureId: 'late-1' });
  const t = await addSignatureTimestamp(b.bytes, { timestamp: authority, trustAnchors: [p.signerRsa.der] });
  assert.equal(t.signatureId, 'late-1');
  const before = text((await readZip(b.bytes)).find((e) => e.name === 'META-INF/signatures.xml')!.data);
  const after = text((await readZip(t.bytes)).find((e) => e.name === 'META-INF/signatures.xml')!.data);
  const cut = before.indexOf('</xades:QualifyingProperties>');
  assert.equal(after.slice(0, cut), before.slice(0, cut), 'everything before the insertion point is unchanged');
  assert.equal(after.slice(after.indexOf('</xades:QualifyingProperties>')), before.slice(cut));
  // All other entries byte-identical.
  const eb = await readZip(b.bytes);
  const ea = await readZip(t.bytes);
  for (const e of eb) if (e.name !== 'META-INF/signatures.xml') assert.deepEqual(ea.find((x) => x.name === e.name)!.data, e.data, e.name);
  assert.equal(t.readBack.signatures[0]!.level, 'XAdES-BASELINE-T');
  await assertContainerError(addSignatureTimestamp(t.bytes, { timestamp: authority }), 'signature', /already has unsigned properties/);
});

test('B-T via the CSC method signatures/timestamp (CscTimestampAuthority)', async () => {
  const { signer, client, p } = await setup();
  const signed = await signContainer(await unsigned(), { signer, timestamp: new CscTimestampAuthority(client) });
  const report = await validateContainer(signed.bytes, { trustAnchors: [p.root.der], crls: [await issueCrl(p.root)] });
  assert.equal(report.signatures[0]!.timestamps![0]!.indication, 'PASSED');
});

test('B-T with a recorded public token: wrong data is FAILED, the signature verdict is unchanged', async () => {
  // A real FreeTSA token embedded over a different signature value must not pass.
  const { signer, p } = await setup();
  const token = tokenFromFile(new Uint8Array(await readFile(resolve(FIXTURES, 'freetsa.tsr'))));
  const fixed: import('../src/index.js').TimestampAuthority = {
    info: { name: 'recorded', location: 'device' },
    availability: async () => ({ available: true }),
    timestamp: async () => ({ token, genTime: '', serialNumber: '', tsaSubject: '' }),
  };
  await assertContainerError(signContainer(await unsigned(), { signer, timestamp: fixed }), 'signature', /time-stamp does not verify after writing: FAILED\/HASH_FAILURE/);
  void p;
});

test('RemoteCscSigner: a value from the service is checked against the certificate before use', async () => {
  // Direct check of the guard that protects documents from a misbehaving service.
  const { p } = await setup();
  const data = new TextEncoder().encode('SignedInfo');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  const sig = ecdsaSignDigest(p.signerEc.key.jwk.d!, digest);
  assert.ok(await verifyWithCertificate(p.signerEc.cert, { key: 'EC', hash: 'SHA-256' }, sig, data, 'raw'));
  assert.ok(!(await verifyWithCertificate(p.signerEc.cert, { key: 'EC', hash: 'SHA-256' }, sig, new TextEncoder().encode('other'), 'raw')));
});

function indexOf(hay: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

export type { MockCscService };
