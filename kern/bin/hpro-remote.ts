/**
 * Command line for remote signing (CSC API v2) and RFC 3161 time-stamps (package P10).
 *
 *   hpro timestamp <in> <out> --tsa URL [--id SIGNATURE] [--trust cert.pem]...
 *       extend a XAdES-BASELINE-B signature to level T (time-stamp over ds:SignatureValue)
 *   hpro tsp request <data> <out.tsr> --tsa URL [--hash sha256|sha384|sha512]
 *       time-stamp the hash of a file (only the hash is sent), save the TimeStampResp
 *   hpro tsp verify <tsr|token> (--data FILE | --digest HEX) [--trust ca.pem]... [--crl FILE]... [--fetch-crls] [--time ISO]
 *       verify a time-stamp offline (CRLs only fetched with --fetch-crls)
 *   hpro csc info --url BASE
 *   hpro csc keys --url BASE --user ID [--password PW]
 *   hpro csc sign <in> <out> --url BASE --user ID [--password PW] [--credential ID] [--tsa URL] [--id ID]
 *       sign through a remote signing service; PIN and OTP are read from stdin
 *
 * Exit codes: 0 ok, 1 check failed (time-stamp not PASSED), 2 usage or format error.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import {
  CscClient,
  HttpTimestampAuthority,
  RemoteCscSigner,
  addSignatureTimestamp,
  certificatesFromPem,
  encodeTimeStampRequest,
  fetchCrls,
  parseCertificate,
  parseCrls,
  parseTimeStampResponse,
  parseTstInfo,
  signContainer,
  tokenFromFile,
  verifyTimeStampToken,
  type CredentialAuthorizationRequest,
  type ImprintHash,
  type TimestampVerification,
} from '../src/index.js';
import { parseSignedData } from '../src/cades.js';
import { hexToBytes, toHex } from '../src/bytes.js';

async function readCerts(file: string): Promise<Uint8Array[]> {
  const raw = await readFile(file);
  return raw[0] === 0x30 ? [new Uint8Array(raw)] : certificatesFromPem(raw.toString('utf8'));
}

function opt(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function opts(args: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) if (args[i] === name && args[i + 1] !== undefined) out.push(args[++i]!);
  return out;
}

function positional(args: string[], withValue: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (withValue.includes(args[i]!)) i++;
    else if (!args[i]!.startsWith('--')) out.push(args[i]!);
  }
  return out;
}

export function printTimestamp(v: TimestampVerification, indent = ''): void {
  const t = v.tstInfo;
  console.log(`${indent}result: ${v.indication}${v.subIndication ? ' / ' + v.subIndication : ''}`);
  if (t) {
    console.log(`${indent}genTime: ${t.genTimeText} (${t.genTime.toISOString()})${t.accuracy ? `, accuracy ${t.accuracy.seconds}s ${t.accuracy.millis}ms ${t.accuracy.micros}µs` : ''}`);
    console.log(`${indent}serial: ${t.serialHex}  policy: ${t.policy}${t.nonceHex ? '  nonce: ' + t.nonceHex : ''}`);
    console.log(`${indent}imprint: ${t.hashAlgorithm} ${toHex(t.hashedMessage)} -> ${v.messageImprint}`);
  }
  if (v.tsaCertificate) console.log(`${indent}TSA: ${v.tsaCertificate.subject} (EKU ${v.tsaCertificate.extendedKeyUsage?.join(',') ?? '-'}${v.tsaCertificate.extendedKeyUsageCritical ? ', critical' : ''})`);
  console.log(`${indent}signature: ${v.signatureAlgorithm} intact=${v.signatureIntact}`);
  if (v.chain.length) console.log(`${indent}chain: ${v.chain.join(' -> ')}`);
  for (const e of v.errors) console.log(`${indent}ERROR: ${e}`);
  for (const w of v.warnings) console.log(`${indent}WARNING: ${w}`);
  for (const n of v.infos) console.log(`${indent}INFO: ${n}`);
}

async function tspRequest(args: string[]): Promise<number> {
  const [data, out] = positional(args, ['--tsa', '--hash']);
  const tsa = opt(args, '--tsa');
  const hash = (opt(args, '--hash') ?? 'sha256').toUpperCase().replace('SHA', 'SHA-') as ImprintHash;
  if (!data || !out || !tsa || !['SHA-256', 'SHA-384', 'SHA-512'].includes(hash)) {
    console.error('usage: hpro tsp request <data> <out.tsr> --tsa URL [--hash sha256|sha384|sha512]');
    return 2;
  }
  const bytes = await readFile(data);
  const digest = new Uint8Array(await crypto.subtle.digest(hash, bytes));
  const req = encodeTimeStampRequest(digest, { hashAlgorithm: hash });
  const t0 = performance.now();
  const resp = await fetch(tsa, { method: 'POST', headers: { 'Content-Type': 'application/timestamp-query' }, body: new Uint8Array(req.der) });
  const body = new Uint8Array(await resp.arrayBuffer());
  const ms = performance.now() - t0;
  await writeFile(out, body);
  await writeFile(out.replace(/\.tsr$/, '') + '.tsq', req.der);
  console.log(`request: ${req.der.length} bytes, ${hash} ${toHex(digest)}, nonce ${req.nonceHex}, certReq true`);
  console.log(`HTTP ${resp.status} ${resp.headers.get('content-type') ?? ''}, ${body.length} bytes in ${ms.toFixed(0)} ms -> ${out}`);
  const parsed = parseTimeStampResponse(body);
  console.log(`status: ${parsed.status} ${parsed.statusName}${parsed.failInfo.length ? ' [' + parsed.failInfo.join(', ') + ']' : ''}${parsed.statusText.length ? ' ' + parsed.statusText.join('; ') : ''}`);
  if (!parsed.token) return 1;
  const tst = parseTstInfo(parseSignedData(parsed.token).eContent!);
  console.log(`genTime ${tst.genTimeText}, serial ${tst.serialHex}, nonce echoed: ${tst.nonceHex === req.nonceHex}`);
  return parsed.status <= 1 ? 0 : 1;
}

async function collectCrls(args: string[], certsForFetch: () => Promise<Uint8Array[]>): Promise<Uint8Array[]> {
  const crls: Uint8Array[] = [];
  for (const f of opts(args, '--crl')) crls.push(new Uint8Array(await readFile(f)));
  if (args.includes('--fetch-crls')) {
    const certs = (await certsForFetch()).map((d) => parseCertificate(d));
    const fetched = await fetchCrls(certs);
    for (const f of fetched) console.log(`CRL ${f.url}: ${f.status}${f.bytes !== undefined ? ', ' + f.bytes + ' bytes' : ''}${f.error ? ' ' + f.error : ''}`);
    for (const f of fetched) if (f.crl) crls.push(f.crl);
  }
  return crls;
}

async function tspVerify(args: string[]): Promise<number> {
  const [file] = positional(args, ['--data', '--digest', '--trust', '--crl', '--time']);
  const dataFile = opt(args, '--data');
  const digestHex = opt(args, '--digest');
  if (!file || (!dataFile && !digestHex)) {
    console.error('usage: hpro tsp verify <tsr|token> (--data FILE | --digest HEX) [--trust ca.pem]... [--crl FILE]... [--fetch-crls] [--time ISO]');
    return 2;
  }
  const token = tokenFromFile(new Uint8Array(await readFile(file)));
  const anchors: Uint8Array[] = [];
  for (const t of opts(args, '--trust')) anchors.push(...(await readCerts(t)));
  const crls = await collectCrls(args, async () => parseSignedData(token).certs.map((c) => c.der));
  const time = opt(args, '--time');
  const v = await verifyTimeStampToken(token, {
    ...(dataFile ? { data: new Uint8Array(await readFile(dataFile)) } : { digest: hexToBytes(digestHex!) }),
    trustAnchors: anchors.map((a) => parseCertificate(a)),
    crls: parseCrls(crls),
    ...(time ? { validationTime: new Date(time) } : {}),
  });
  console.log(`token: ${file} (${token.length} bytes), trust anchors: ${anchors.length}, CRLs: ${crls.length}`);
  printTimestamp(v);
  return v.indication === 'PASSED' ? 0 : 1;
}

async function timestampCommand(args: string[]): Promise<number> {
  const [input, output] = positional(args, ['--tsa', '--id', '--trust']);
  const tsa = opt(args, '--tsa');
  if (!input || !output || !tsa) {
    console.error('usage: hpro timestamp <in> <out> --tsa URL [--id SIGNATURE] [--trust cert.pem]...');
    return 2;
  }
  const anchors: Uint8Array[] = [];
  for (const t of opts(args, '--trust')) anchors.push(...(await readCerts(t)));
  const id = opt(args, '--id');
  const r = await addSignatureTimestamp(await readFile(input), { timestamp: new HttpTimestampAuthority(tsa), trustAnchors: anchors, ...(id ? { signatureId: id } : {}) });
  await writeFile(output, r.bytes);
  const sig = r.readBack.signatures.find((s) => s.signatureId === r.signatureId)!;
  console.log(`${output}  ${r.bytes.length} bytes`);
  console.log(`signature ${r.signatureId}: level ${sig.level}, verdict ${sig.indication}${sig.subIndication ? '/' + sig.subIndication : ''}`);
  console.log(`time-stamp: genTime ${r.timestamp.genTime}, serial ${r.timestamp.serialNumber}, TSA ${r.timestamp.tsaSubject}, ${r.timestamp.elapsedMs} ms`);
  return 0;
}

// --- CSC ------------------------------------------------------------------------------

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
  process.stderr.write(question);
  const line = await new Promise<string>((resolve) => rl.once('line', resolve));
  rl.close();
  return line.trim();
}

async function client(args: string[]): Promise<CscClient> {
  const url = opt(args, '--url');
  if (!url) throw new Error('--url BASE (…/csc/v2) is required');
  const c = new CscClient({ baseUrl: url, onRequest: (m, b) => console.log(`-> ${m} ${JSON.stringify(b)}`) });
  const user = opt(args, '--user');
  if (user) await c.login(user, opt(args, '--password') ?? (await prompt('password: ')));
  return c;
}

async function cscCommand(args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  if (sub === 'info') {
    const info = await (await client(rest)).info();
    console.log(JSON.stringify(info, null, 2));
    return 0;
  }
  if (sub === 'keys' || sub === 'sign') {
    const c = await client(rest);
    const signer = new RemoteCscSigner(c, {
      authorize: async (req: CredentialAuthorizationRequest) => {
        const objects = req.credential.auth?.objects ?? [];
        if (req.credential.auth?.mode !== 'explicit') throw new Error(`credential ${req.credentialID} needs auth mode ${req.credential.auth?.mode}; only explicit is supported on the command line`);
        const authData: { id: string; value: string }[] = [];
        for (const o of objects) {
          if (!o.id) continue;
          if (o.id === 'OTP' || o.generator) await req.client.getChallenge(req.credentialID, o.id);
          authData.push({ id: o.id, value: await prompt(`${o.label ?? o.id}: `) });
        }
        return { kind: 'explicit', authData };
      },
      ...(opt(rest, '--credential') ? { credentialIDs: [opt(rest, '--credential')!] } : {}),
    });
    const keys = await signer.listKeys();
    for (const k of keys) console.log(`key ${k.keyId}: ${k.label}; ${k.algorithms.join(', ')}; chain ${k.certificateChain.length}; qualified (service claim) ${k.qualified}`);
    if (sub === 'keys') return 0;
    const [input, output] = positional(rest, ['--url', '--user', '--password', '--credential', '--tsa', '--id']);
    if (!input || !output || keys.length === 0) {
      console.error('usage: hpro csc sign <in> <out> --url BASE --user ID [--password PW] [--credential ID] [--tsa URL] [--id ID]');
      return 2;
    }
    const tsa = opt(rest, '--tsa');
    const id = opt(rest, '--id');
    const signed = await signContainer(await readFile(input), { signer, key: keys[0]!, ...(tsa ? { timestamp: new HttpTimestampAuthority(tsa) } : {}), ...(id ? { signatureId: id } : {}) });
    await writeFile(output, signed.bytes);
    const s = signed.readBack.signatures.find((x) => x.signatureId === signed.signatureId)!;
    console.log(`${output}  ${signed.bytes.length} bytes; signature ${signed.signatureId}, level ${s.level}, read-back ${s.indication}${s.subIndication ? '/' + s.subIndication : ''}`);
    console.log(`remote: ${JSON.stringify(signer.lastTrace)}`);
    if (signed.timestamp) console.log(`time-stamp: genTime ${signed.timestamp.genTime}, TSA ${signed.timestamp.tsaSubject}`);
    return 0;
  }
  console.error('usage: hpro csc info|keys|sign …');
  return 2;
}

export async function remoteCommand(cmd: string, args: string[]): Promise<number> {
  if (cmd === 'timestamp') return timestampCommand(args);
  if (cmd === 'tsp' && args[0] === 'request') return tspRequest(args.slice(1));
  if (cmd === 'tsp' && args[0] === 'verify') return tspVerify(args.slice(1));
  if (cmd === 'csc') return cscCommand(args);
  console.error('usage: hpro timestamp … | hpro tsp request|verify … | hpro csc info|keys|sign …');
  return 2;
}

/** Certificates in a container's signatures (KeyInfo and time-stamp tokens), for `--fetch-crls`. */
export function certificatesInSignatures(xml: string): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const m of xml.matchAll(/<(?:[\w.-]+:)?X509Certificate>([^<]+)</g)) out.push(Uint8Array.from(atob(m[1]!.replace(/\s+/g, '')), (c) => c.charCodeAt(0)));
  for (const m of xml.matchAll(/<(?:[\w.-]+:)?EncapsulatedTimeStamp[^>]*>([^<]+)</g)) {
    try {
      out.push(...parseSignedData(Uint8Array.from(atob(m[1]!.replace(/\s+/g, '')), (c) => c.charCodeAt(0))).certs.map((c) => c.der));
    } catch {
      // unreadable token: reported by the validator
    }
  }
  return out;
}

export { collectCrls };
