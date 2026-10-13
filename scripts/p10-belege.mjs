#!/usr/bin/env node
// Evidence run for package P10 (remote signing over CSC, RFC 3161 time-stamps).
// Uses kern/build (CLI build incl. the test doubles in kern/build/test). Writes containers,
// certificates, CRLs and tokens to prototyp/out/p10/run/ and prints every step verbatim.
//
//   node scripts/p10-belege.mjs mock       criterion 1: mock RSSP over HTTP on 127.0.0.1
//   node scripts/p10-belege.mjs public     criterion 2: four public RFC 3161 services
//   node scripts/p10-belege.mjs measure    timings (mock RSSP over loopback HTTP, public TSAs)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'prototyp/out/p10/run');
const k = await import(resolve(ROOT, 'kern/build/src/index.js'));
const { parseSignedData } = await import(resolve(ROOT, 'kern/build/src/cades.js'));
const { createTestPki, issueCrl } = await import(resolve(ROOT, 'kern/build/test/pki.js'));
const { createMockRssp, explicitUser } = await import(resolve(ROOT, 'kern/build/test/remote-mock.js'));

const PUBLIC_TSA = [
  { name: 'freetsa', url: 'https://freetsa.org/tsr', root: 'https://freetsa.org/files/cacert.pem' },
  { name: 'digicert', url: 'http://timestamp.digicert.com', root: 'https://cacerts.digicert.com/DigiCertTrustedRootG4.crt' },
  { name: 'dfn', url: 'http://zeitstempel.dfn.de', root: 'https://pki.pca.dfn.de/dfn-verein-community-root-ca/pub/cacert/cacert.crt' },
  { name: 'sectigo-q', url: 'http://timestamp.sectigo.com/qualified', root: 'http://crt.sectigo.com/SectigoQualifiedTimeStampingRootR45.crt' },
];

const sha = (b) => createHash('sha256').update(b).digest('hex');
const v = (s) => `${s.indication}${s.subIndication ? '/' + s.subIndication : ''}`;
const log = (...a) => console.log(...a);
const pem = (der) => k.toPem('CERTIFICATE', der);

async function sample() {
  return (await k.createContainer(k.sampleDocument())).bytes;
}

async function save(name, bytes) {
  await writeFile(resolve(OUT, name), bytes);
  log(`  -> ${name} (${bytes.length} bytes, sha256 ${sha(bytes).slice(0, 16)}…)`);
}

function printReport(label, report) {
  for (const s of report.signatures) {
    log(`  [${label}] ${s.signatureId}: ${s.level} ${v(s)}${s.chain?.length ? '  chain ' + s.chain.length : ''}`);
    for (const e of s.errors) log(`      ERROR: ${e}`);
    for (const n of s.infos ?? []) if (/revocation/.test(n)) log(`      INFO: ${n}`);
    for (const t of s.timestamps ?? []) {
      log(`      time-stamp ${t.id ?? ''}: ${t.indication}${t.subIndication ? '/' + t.subIndication : ''} genTime ${t.genTime} imprint ${t.messageImprint} tsaSignatureIntact ${t.signatureIntact}`);
      log(`        TSA ${t.tsaSubject}`);
      for (const e of t.errors) log(`        ERROR: ${e}`);
      for (const n of t.infos ?? []) log(`        INFO: ${n}`);
    }
  }
}

async function loadAnchor(url) {
  const r = await fetch(url);
  const raw = new Uint8Array(await r.arrayBuffer());
  return raw[0] === 0x30 ? raw : k.certificatesFromPem(new TextDecoder().decode(raw))[0];
}

async function crlsFor(token, label) {
  const fetched = await k.fetchCrls(parseSignedData(token).certs);
  const out = [];
  let i = 0;
  for (const f of fetched) {
    log(`  CRL ${f.url}: HTTP ${f.status}${f.bytes !== undefined ? ', ' + f.bytes + ' bytes' : ''}${f.error ? ' ' + f.error : ''}`);
    if (!f.crl) continue;
    out.push(f.crl);
    await writeFile(resolve(OUT, `crl/${label}-${++i}.crl`), f.crl);
  }
  return out;
}

// --- criterion 1 ------------------------------------------------------------------------

async function mock() {
  const pki = await createTestPki();
  await writeFile(resolve(OUT, 'mock-root.pem'), pem(pki.root.der));
  await writeFile(resolve(OUT, 'mock-signer-rsa.pem'), pem(pki.signerRsa.der));
  await writeFile(resolve(OUT, 'mock-signer-ec.pem'), pem(pki.signerEc.der));
  await writeFile(resolve(OUT, 'mock-tsa.pem'), pem(pki.tsa.der));
  const crl = await issueCrl(pki.root);
  await writeFile(resolve(OUT, 'crl/mock-root.crl'), crl);
  const revokedCrl = await issueCrl(pki.root, [{ serialHex: pki.signerEc.cert.serialHex, at: new Date(Date.now() - 60_000) }]);
  await writeFile(resolve(OUT, 'crl-revoked/mock-root-ec-gesperrt.crl'), revokedCrl);
  log('Test-PKI (Testdoppel, nicht qualifiziert):');
  for (const [n, c] of [['root', pki.root], ['signer RSA', pki.signerRsa], ['signer EC', pki.signerEc], ['TSA', pki.tsa]]) {
    log(`  ${n}: ${c.cert.subject}  issuer ${c.cert.issuer}  serial ${c.cert.serialHex}  EKU ${c.cert.extendedKeyUsage?.join(',') ?? '-'}`);
  }

  const service = await createMockRssp(pki);
  const server = await service.listen();
  log(`\nMock-RSSP lauscht auf ${server.url} (TSA: ${server.tsaUrl}); Zugang: Benutzer max.mustermann, PIN 123456, OTP per „SMS“ (outbox des Testdoppels)`);
  try {
    const client = new k.CscClient({ baseUrl: server.url, onRequest: (m, b) => log(`  -> POST ${m} ${JSON.stringify(b)}`) });
    log('\n$ info');
    const info = await client.info();
    log(`  specs ${info.specs}, name "${info.name}", region ${info.region}, authType ${info.authType.join(',')}, methods ${info.methods.join(', ')}`);
    log('\n$ auth/login (HTTP Basic)');
    log(`  ${JSON.stringify(await client.login('max.mustermann', 'testpasswort'))}`);
    const signer = new k.RemoteCscSigner(client, { authorize: explicitUser(service) });
    log('\n$ credentials/list -> listKeys()');
    const keys = await signer.listKeys();
    for (const key of keys) log(`  ${key.keyId}: ${key.label}; ${key.algorithms.join(',')}; chain ${key.certificateChain.length}; qualified ${key.qualified}; consent per signature ${key.requiresAuthorisationPerSignature}`);

    const input = await sample();
    await save('unsigniert.epub', input);
    const results = {};
    for (const [file, keyId, tsa] of [
      ['csc-rsa.epub', 'hpro-rsa-01', undefined],
      ['csc-ec.epub', 'hpro-ec-01', undefined],
      ['csc-ec-bt-mocktsa.epub', 'hpro-ec-01', new k.HttpTimestampAuthority(server.tsaUrl, { name: 'Mock-TSA' })],
    ]) {
      log(`\n$ signContainer(unsigniert.epub, RemoteCscSigner ${keyId}${tsa ? ', timestamp ' + server.tsaUrl : ''})`);
      const key = keys.find((x) => x.keyId === keyId);
      const t0 = performance.now();
      const signed = await k.signContainer(input, { signer, key, ...(tsa ? { timestamp: tsa } : {}) });
      log(`  ${(performance.now() - t0).toFixed(1)} ms; signature ${signed.signatureId}; trace ${JSON.stringify(signer.lastTrace)}`);
      if (signed.timestamp) log(`  time-stamp genTime ${signed.timestamp.genTime} serial ${signed.timestamp.serialNumber}`);
      await save(file, signed.bytes);
      results[file] = signed.bytes;
    }

    log('\nPrüfung im Kern (validateContainer):');
    for (const file of Object.keys(results)) {
      const leaf = file.includes('rsa') ? pki.signerRsa.der : pki.signerEc.der;
      printReport(`${file}, Anker Signaturzertifikat`, await k.validateContainer(results[file], { trustAnchors: [leaf] }));
      printReport(`${file}, Anker Test-Wurzel ohne CRL`, await k.validateContainer(results[file], { trustAnchors: [pki.root.der] }));
      printReport(`${file}, Anker Test-Wurzel + CRL`, await k.validateContainer(results[file], { trustAnchors: [pki.root.der], crls: [crl] }));
    }
    printReport('csc-ec.epub, Anker Test-Wurzel + CRL mit gesperrtem EC-Zertifikat', await k.validateContainer(results['csc-ec.epub'], { trustAnchors: [pki.root.der], crls: [revokedCrl] }));

    log('\nManipulation nach dem Signieren (content/index.xhtml, 1.200,00 -> 9.200,00 EUR):');
    const entries = await k.readZip(results['csc-ec.epub']);
    const changed = await k.writeZip(
      entries.map((e) => ({
        name: e.name,
        data: e.name === 'content/index.xhtml' ? new TextEncoder().encode(new TextDecoder().decode(e.data).replace('1.200,00', '9.200,00')) : e.data,
        compression: e.name === 'mimetype' ? 'store' : 'deflate',
      })),
      { modified: new Date('2026-10-13T00:00:00Z') },
    );
    await save('csc-ec-manipuliert.epub', changed);
    printReport('csc-ec-manipuliert.epub, Anker Test-Wurzel + CRL', await k.validateContainer(changed, { trustAnchors: [pki.root.der], crls: [crl] }));

    log('\nNegativfälle gegen den Dienst:');
    const wrong = new k.RemoteCscSigner(client, { authorize: explicitUser(service, '000000') });
    try {
      await k.signContainer(input, { signer: wrong });
    } catch (e) {
      log(`  falsche PIN: ${e.name}: ${e.message}`);
    }
    const hashA = Buffer.alloc(32, 1).toString('base64');
    await client.getChallenge('hpro-ec-01', 'OTP');
    const { SAD } = await client.authorize({ credentialID: 'hpro-ec-01', numSignatures: 1, hashes: [hashA], hashAlgorithmOID: '2.16.840.1.101.3.4.2.1', authData: [{ id: 'PIN', value: '123456' }, { id: 'OTP', value: service.outbox.at(-1).otp }] });
    for (const [label, req] of [
      ['anderer Hash mit derselben SAD', { hashes: [Buffer.alloc(32, 2).toString('base64')], signAlgo: '1.2.840.10045.4.3.2' }],
      ['fremder Algorithmus', { hashes: [hashA], signAlgo: '1.2.840.113549.1.1.11' }],
      ['erste gültige Verwendung', { hashes: [hashA], signAlgo: '1.2.840.10045.4.3.2' }],
      ['zweite Verwendung derselben SAD', { hashes: [hashA], signAlgo: '1.2.840.10045.4.3.2' }],
    ]) {
      try {
        const r = await client.signHash({ credentialID: 'hpro-ec-01', SAD, ...req });
        log(`  ${label}: OK, ${r.length} Signaturwert(e)`);
      } catch (e) {
        log(`  ${label}: ${e.message}`);
      }
    }
    const bad = await createMockRssp(pki, { tamper: 'sign-other-hash' });
    const badClient = new k.CscClient({ baseUrl: bad.baseUrl, fetch: bad.fetch });
    await badClient.login('max.mustermann', 'testpasswort');
    try {
      await k.signContainer(input, { signer: new k.RemoteCscSigner(badClient, { authorize: explicitUser(bad) }) });
    } catch (e) {
      log(`  Dienst signiert einen anderen Hash: ${e.message}`);
    }

    log('\nWas der Dienst gesehen hat (Protokoll des Testdoppels, Geheimnisse geschwärzt):');
    for (const l of service.log) log(`  ${l.status} ${l.method} ${JSON.stringify(l.body)}`);
    const wire = JSON.stringify(service.log);
    log(`  Dokumenttext im Protokoll: ${['Lieferung', '1.200,00', '<html', 'Prüfdokument'].map((t) => `${t}=${wire.includes(t)}`).join(', ')}`);
  } finally {
    await server.close();
    log('\nMock-RSSP beendet (server.close).');
  }
  return pki;
}

// --- criterion 2 ------------------------------------------------------------------------

async function publicTsa() {
  const pkiFile = resolve(OUT, 'mock-root.pem');
  const data = await readFile(resolve(OUT, 'unsigniert.epub'));
  const digest = new Uint8Array(createHash('sha256').update(data).digest());
  log(`Daten: unsigniert.epub, SHA-256 ${Buffer.from(digest).toString('hex')} (nur dieser Hash geht an die Dienste)`);
  const anchors = {};
  const crls = {};
  for (const t of PUBLIC_TSA) {
    log(`\n=== ${t.name}: ${t.url}`);
    const req = k.encodeTimeStampRequest(digest, { hashAlgorithm: 'SHA-256' });
    const t0 = performance.now();
    const r = await fetch(t.url, { method: 'POST', headers: { 'Content-Type': 'application/timestamp-query' }, body: req.der });
    const body = new Uint8Array(await r.arrayBuffer());
    log(`  HTTP ${r.status} ${r.headers.get('content-type')}, ${body.length} bytes, ${(performance.now() - t0).toFixed(0)} ms`);
    await writeFile(resolve(OUT, `tsa/${t.name}.tsq`), req.der);
    await writeFile(resolve(OUT, `tsa/${t.name}.tsr`), body);
    const parsed = k.parseTimeStampResponse(body);
    log(`  PKIStatus ${parsed.status} ${parsed.statusName}`);
    const token = parsed.token;
    anchors[t.name] = await loadAnchor(t.root);
    await writeFile(resolve(OUT, `tsa/${t.name}-root.pem`), pem(anchors[t.name]));
    log(`  Vertrauensanker von ${t.root}: ${k.parseCertificate(anchors[t.name]).subject}, SHA-256 ${sha(anchors[t.name])}`);
    crls[t.name] = await crlsFor(token, t.name);
    const res = await k.verifyTimeStampToken(token, { digest, trustAnchors: [k.parseCertificate(anchors[t.name])], crls: k.parseCrls(crls[t.name]), expectedNonceHex: req.nonceHex });
    log(`  Kern: ${res.indication}${res.subIndication ? '/' + res.subIndication : ''}; genTime ${res.tstInfo.genTimeText}; serial ${res.tstInfo.serialHex}; policy ${res.tstInfo.policy}; nonce ${res.tstInfo.nonceHex === req.nonceHex ? 'gleich' : 'ABWEICHEND'}`);
    log(`        imprint ${res.messageImprint}; TSA-Signatur ${res.signatureAlgorithm} intakt ${res.signatureIntact}; EKU ${res.tsaCertificate.extendedKeyUsage.join(',')} kritisch ${res.tsaCertificate.extendedKeyUsageCritical}`);
    log(`        Kette: ${res.chain.join(' -> ')}`);
    for (const e of res.errors) log(`        ERROR: ${e}`);
    for (const n of res.infos) log(`        INFO: ${n}`);
    const other = await k.verifyTimeStampToken(token, { data: new TextEncoder().encode('anderes Dokument'), trustAnchors: [k.parseCertificate(anchors[t.name])], crls: k.parseCrls(crls[t.name]) });
    log(`  Gegenprobe mit anderen Daten: ${other.indication}/${other.subIndication}`);
  }

  // B-T: remote signature (mock RSSP, in process) plus a public time-stamp.
  log('\n=== Signatur über den Mock-RSSP mit Zeitstempel öffentlicher Dienste (XAdES-BASELINE-T)');
  const pki = await createTestPki();
  await writeFile(resolve(OUT, 'bt-mock-root.pem'), pem(pki.root.der));
  const crl = await issueCrl(pki.root);
  await writeFile(resolve(OUT, 'crl/bt-mock-root.crl'), crl);
  const service = await createMockRssp(pki);
  const client = new k.CscClient({ baseUrl: service.baseUrl, fetch: service.fetch });
  await client.login('max.mustermann', 'testpasswort');
  const signer = new k.RemoteCscSigner(client, { authorize: explicitUser(service) });
  const ec = (await signer.listKeys()).find((x) => x.keyId === 'hpro-ec-01');
  const containers = {};
  for (const t of PUBLIC_TSA.filter((x) => x.name === 'freetsa' || x.name === 'sectigo-q')) {
    const signed = await k.signContainer(data, { signer, key: ec, timestamp: new k.HttpTimestampAuthority(t.url) });
    log(`  ${t.name}: signature ${signed.signatureId}, time-stamp genTime ${signed.timestamp.genTime}, ${signed.timestamp.elapsedMs} ms`);
    const file = `csc-ec-bt-${t.name}.epub`;
    await save(file, signed.bytes);
    containers[t.name] = signed.bytes;
    // CRLs for the signature's time-stamp chain (fetched again: one per token is enough)
    printReport(`${file}, Anker Test-Wurzel + ${t.name}-Wurzel, CRLs`, await k.validateContainer(signed.bytes, { trustAnchors: [pki.root.der, anchors[t.name]], crls: [crl, ...crls[t.name]] }));
    printReport(`${file}, ohne TSA-Anker`, await k.validateContainer(signed.bytes, { trustAnchors: [pki.root.der], crls: [crl] }));
  }

  log('\n=== Zeitstempel einer anderen Signatur eingesetzt (FreeTSA-Token über fremde Daten)');
  const entries = await k.readZip(containers.freetsa);
  const sigXml = new TextDecoder().decode(entries.find((e) => e.name === 'META-INF/signatures.xml').data);
  const otherToken = k.tokenFromFile(await readFile(resolve(OUT, 'tsa/freetsa.tsr')));
  const swapped = sigXml.replace(/<xades:EncapsulatedTimeStamp>[^<]+</, `<xades:EncapsulatedTimeStamp>${Buffer.from(otherToken).toString('base64')}<`);
  const tampered = await k.writeZip(
    entries.map((e) => ({ name: e.name, data: e.name === 'META-INF/signatures.xml' ? new TextEncoder().encode(swapped) : e.data, compression: e.name === 'mimetype' ? 'store' : 'deflate' })),
    { modified: new Date('2026-10-13T00:00:00Z') },
  );
  await save('csc-ec-bt-freetsa-zeitstempel-getauscht.epub', tampered);
  printReport('getauscht, Anker Test-Wurzel + FreeTSA-Wurzel, CRLs', await k.validateContainer(tampered, { trustAnchors: [pki.root.der, anchors.freetsa], crls: [crl, ...crls.freetsa] }));
  void pkiFile;
}

// --- measurements ---------------------------------------------------------------------

function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return `median ${med.toFixed(1)} ms, min ${s[0].toFixed(1)}, max ${s.at(-1).toFixed(1)} (n=${s.length})`;
}

async function measure() {
  const pki = await createTestPki();
  const service = await createMockRssp(pki, { maxPinAttempts: 1000 });
  const server = await service.listen();
  try {
    const client = new k.CscClient({ baseUrl: server.url });
    await client.login('max.mustermann', 'testpasswort');
    const signer = new k.RemoteCscSigner(client, { authorize: explicitUser(service) });
    const keys = await signer.listKeys();
    const input = await sample();
    log(`Beispielcontainer ${input.length} bytes; Mock-RSSP über HTTP auf 127.0.0.1; je 3 Aufwärmläufe, dann 20 Messungen`);
    log('Eine Messung = signContainer komplett: Lesen, Hashen, XAdES, C14N, getChallenge + authorize + signHash (3 HTTP-Aufrufe), Prüfung des Werts mit dem Zertifikat, ZIP schreiben, Rückleseprüfung');
    for (const key of keys) {
      const times = [];
      for (let i = 0; i < 23; i++) {
        const t0 = performance.now();
        await k.signContainer(input, { signer, key });
        if (i >= 3) times.push(performance.now() - t0);
      }
      log(`  ${key.keyId} (${key.algorithms[0]}): ${stats(times)}`);
    }
    const tsaTimes = [];
    const tsa = new k.HttpTimestampAuthority(server.tsaUrl);
    const d = new Uint8Array(32).fill(5);
    for (let i = 0; i < 23; i++) {
      const t0 = performance.now();
      await tsa.timestamp({ digest: d, hashAlgorithm: 'SHA-256' });
      if (i >= 3) tsaTimes.push(performance.now() - t0);
    }
    log(`  Mock-TSA über HTTP (Anfrage, Antwort, Prüfung des Tokens): ${stats(tsaTimes)}`);
  } finally {
    await server.close();
  }
  log('\nÖffentliche Dienste: je 5 Anfragen im Abstand von 1 s (Rundreise inkl. Prüfung des Tokens im Kern, ohne CRL-Abruf)');
  for (const t of PUBLIC_TSA) {
    const times = [];
    const tsa = new k.HttpTimestampAuthority(t.url);
    for (let i = 0; i < 5; i++) {
      const d = new Uint8Array(createHash('sha256').update(`hpro P10 Messung ${i}`).digest());
      const t0 = performance.now();
      try {
        await tsa.timestamp({ digest: d, hashAlgorithm: 'SHA-256' });
        times.push(performance.now() - t0);
      } catch (e) {
        log(`  ${t.name}: Fehler ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (times.length) log(`  ${t.name}: ${stats(times)}`);
  }
  const token = k.tokenFromFile(await readFile(resolve(OUT, 'tsa/freetsa.tsr')));
  const data = await readFile(resolve(OUT, 'unsigniert.epub'));
  const anchor = k.parseCertificate(k.certificatesFromPem(await readFile(resolve(OUT, 'tsa/freetsa-root.pem'), 'utf8'))[0]);
  const crls = k.parseCrls([await readFile(resolve(OUT, 'crl/freetsa-1.crl'))]);
  const vt = [];
  for (let i = 0; i < 53; i++) {
    const t0 = performance.now();
    await k.verifyTimeStampToken(token, { data, trustAnchors: [anchor], crls });
    if (i >= 3) vt.push(performance.now() - t0);
  }
  log(`\nOffline-Prüfung eines FreeTSA-Tokens im Kern (Hash, CMS-Signatur ECDSA-SHA512, Kette, CRL): ${stats(vt)}`);
}

await mkdir(resolve(OUT, 'crl'), { recursive: true });
await mkdir(resolve(OUT, 'crl-revoked'), { recursive: true });
await mkdir(resolve(OUT, 'tsa'), { recursive: true });
const step = process.argv[2];
if (step === 'mock') await mock();
else if (step === 'public') await publicTsa();
else if (step === 'measure') await measure();
else {
  console.error('usage: node scripts/p10-belege.mjs mock|public|measure');
  process.exit(2);
}
