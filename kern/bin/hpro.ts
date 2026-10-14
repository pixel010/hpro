#!/usr/bin/env node
/**
 * Command line of hpro (Node only).
 *
 * Stable interface (S8, interface version 1, docs/spezifikation/06-einbau.md): these commands,
 * their options and exit codes only grow; nothing is removed or changes meaning within version 1.
 *
 *   hpro create <quelle> <ziel.hpro> [...]    write a document from Markdown, Word, ODF, a spreadsheet or PDF
 *   hpro check <datei> [...]                  conformance check (part 1), same as hpro-check
 *   hpro sign <in> <out> --key key.pem --cert cert.pem [--chain ca.pem]... [--time ISO] [--id ID] [--only path]... [--tsa URL] [--json FILE]
 *                                             add a XAdES-BASELINE-B signature (META-INF/signatures.xml), without Java;
 *                                             with --tsa a RFC 3161 time-stamp makes it XAdES-BASELINE-T
 *   hpro pdf export <in.hpro> <out.pdf> --dienst URL|--lokal [...]   PDF/A and PDF/UA through the hpro service
 *   hpro validate <file> [--trust cert.pem]... [--policy hpro|dss-default|strict] [--time ISO] [--json] [--crl FILE]... [--fetch-crls]
 *                                             check the signatures (XAdES/CAdES in ASiC-E) without Java
 *   hpro version [--json]                     versions of package, command line interface, specification, rule catalogue
 *   hpro help                                 this overview
 *
 * Exit codes of the stable commands: 0 ok / passed; 1 negative result (check failed, signature not
 * TOTAL_PASSED, PDF level failed, template not met); 2 usage or input error; 3 undetermined
 * (check); 4 required helper not available (PDF service).
 *
 * Further commands (working tools of the packages, not part of the stable interface):
 *   hpro sample <out>          write the sample document as container
 *   hpro inspect <file>        list entries, check structure and hash manifest
 *   hpro compare <a> <b>       compare entries and per-entry SHA-256 of two containers
 *   hpro keygen <key.pem> <cert.pem> [--alg rsa|ec] [--cn NAME] [--days N] [--usage signature|encryption]
 *                              new key pair and self-signed TEST certificate (WebCrypto, no OpenSSL)
 *   hpro timestamp | tsp | csc …   time-stamps and remote signing (CSC API), see hpro-remote.ts
 *   hpro calc <subcommand> …   calculator: show, recalc, check, freeze, export, import (see hpro-calc.ts)
 *   hpro form <subcommand> …   forms: show, fill, submit, check, export (see hpro-form.ts)
 *   hpro lock <subcommand> …   locks, sealed sections, redaction, signed frozen version (see hpro-lock.ts)
 *   hpro edit <subcommand> …   structured editing (see hpro-edit.ts)
 *   hpro history <file> | hpro history checkout <file> <n> <out>   versions from the history journal
 *   hpro diff <older> <newer> | hpro diff <file> --from N --to M    comparison of two versions
 *   hpro annotate <subcommand> …   annotations, review threads, export, import, comparison (see hpro-annotate.ts)
 *   hpro a11y check|fix …      accessibility check with corrections (see hpro-a11y.ts)
 *   hpro pdf import|ocr|status …   PDF import and OCR through the hpro service (see hpro-pdf.ts)
 *   hpro author vorlagen|neu|md|docx|odt|pdf …   author path: Markdown with template, Word, ODF and PDF import (see hpro-author.ts)
 *   hpro machine <file> | hpro machine write <in> <out>   machine view and the envelope for language models (see hpro-machine.ts)
 */
import { createHash } from 'node:crypto';
import { calcCommand } from './hpro-calc.js';
import { formCommand } from './hpro-form.js';
import { annotateCommand } from './hpro-annotate.js';
import { a11yCommand } from './hpro-a11y.js';
import { pdfCommand } from './hpro-pdf.js';
import { authorCommand } from './hpro-author.js';
import { certificatesInSignatures, collectCrls, remoteCommand } from './hpro-remote.js';
import { lockCommand } from './hpro-lock.js';
import { diffCommand, editCommand, historyCommand } from './hpro-edit.js';
import { checkCommand } from './hpro-check.js';
import { createCommand } from './hpro-create.js';
import { machineCommand } from './hpro-machine.js';
import { versionInfo } from './cli-common.js';
import { readFile, writeFile } from 'node:fs/promises';
import {
  ContainerError,
  HttpTimestampAuthority,
  SoftwareKeySigner,
  certificatesFromPem,
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
  type ValidationPolicy,
} from '../src/index.js';

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

async function sample(out: string): Promise<number> {
  const created = await createContainer(sampleDocument());
  await writeFile(out, created.bytes);
  console.log(`${out}  ${created.bytes.length} bytes  sha256=${sha256(created.bytes)}`);
  console.log(`read-back: integrity ok=${created.readBack.integrity.ok}, ${created.readBack.integrity.resources.length} resources checked, unlisted=${created.readBack.integrity.unlisted.length}`);
  return 0;
}

async function inspect(file: string): Promise<number> {
  const bytes = await readFile(file);
  const c = await readContainer(bytes);
  console.log(`file: ${file} (${bytes.length} bytes, sha256=${sha256(bytes)})`);
  console.log(`mimetype: ${c.mimetype}`);
  console.log(`rootfile: ${c.packagePath}`);
  console.log('entries:');
  console.log('  offset  method    stored    size  extra  crc32     name');
  for (const e of c.entries) {
    console.log(
      `  ${String(e.localHeaderOffset).padStart(6)}  ${e.method.padEnd(8)} ${String(e.compressedSize).padStart(7)} ${String(e.size).padStart(7)}  ${String(e.localExtraLength).padStart(5)}  ${e.crc32.toString(16).padStart(8, '0')}  ${e.name}`,
    );
  }
  console.log('manifest.json integrity:');
  for (const r of c.integrity.resources) console.log(`  ${r.status.padEnd(13)} ${r.path}  ${r.expected}${r.status === 'hash-mismatch' ? `  actual ${r.actual}` : ''}`);
  for (const p of c.integrity.unlisted) console.log(`  unlisted      ${p}`);
  for (const p of c.integrity.problems) console.log(`  problem       ${p}`);
  console.log(`result: ${c.integrity.ok ? 'OK' : 'FAILED'}`);
  return c.integrity.ok ? 0 : 1;
}

async function compare(a: string, b: string): Promise<number> {
  const [ba, bb] = await Promise.all([readFile(a), readFile(b)]);
  const [ea, eb] = await Promise.all([readZip(ba), readZip(bb)]);
  let same = ea.length === eb.length;
  console.log(`A: ${a}  ${ba.length} bytes  sha256=${sha256(ba)}`);
  console.log(`B: ${b}  ${bb.length} bytes  sha256=${sha256(bb)}`);
  console.log('  #  same  method    sha256 (A)                                                        name');
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) {
    const x = ea[i];
    const y = eb[i];
    const equal = !!x && !!y && x.name === y.name && x.method === y.method && sha256(x.data) === sha256(y.data);
    same &&= equal;
    console.log(`  ${String(i).padStart(1)}  ${equal ? 'yes ' : 'NO  '}  ${(x?.method ?? '-').padEnd(8)}  ${x ? sha256(x.data) : '-'.padEnd(64)}  ${x?.name ?? '-'}${!equal && y ? `  (B: ${y.name} ${sha256(y.data)})` : ''}`);
  }
  console.log(`entries and hashes identical: ${same ? 'yes' : 'NO'}`);
  console.log(`byte-identical: ${Buffer.compare(ba, bb) === 0 ? 'yes' : 'no'}`);
  return same ? 0 : 1;
}

async function validate(args: string[]): Promise<number> {
  let file: string | undefined;
  const trust: Uint8Array[] = [];
  let policy: ValidationPolicy = 'hpro';
  let time: string | undefined;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--trust') {
      const raw = await readFile(args[++i]!);
      trust.push(...(raw[0] === 0x30 ? [new Uint8Array(raw)] : certificatesFromPem(raw.toString('utf8'))));
    } else if (a === '--policy') policy = args[++i] as ValidationPolicy;
    else if (a === '--time') time = args[++i];
    else if (a === '--json') json = true;
    else if (a === '--crl') i++;
    else if (a === '--fetch-crls') continue;
    else if (!file) file = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  if (!file || !['hpro', 'dss-default', 'strict'].includes(policy)) {
    console.error('usage: hpro validate <file> [--trust cert.pem]... [--policy hpro|dss-default|strict] [--time ISO] [--json] [--crl FILE]... [--fetch-crls]');
    return 2;
  }
  const bytes = await readFile(file);
  const crls = await collectCrls(args, async () => {
    const sig = (await readZip(bytes)).find((e) => e.name === 'META-INF/signatures.xml');
    return sig ? certificatesInSignatures(new TextDecoder().decode(sig.data)) : [];
  });
  const report = await validateContainer(bytes, { policy, trustAnchors: trust, ...(time ? { validationTime: time } : {}), ...(crls.length ? { crls } : {}) });
  const ok = report.signatures.length > 0 && report.signatures.every((s) => s.indication === 'TOTAL_PASSED');
  if (json) {
    console.log(JSON.stringify({ file, ...report }, null, 2));
    return ok ? 0 : 1;
  }
  const c = report.container;
  console.log(`file: ${file} (${bytes.length} bytes)`);
  console.log(`validator: ${report.validator.name} ${report.validator.version ?? ''}, policy ${report.validator.policy}, time ${report.validationTime}`);
  console.log(`mimetype: ${c.mimetype ?? '(none)'}  container: ${c.containerType}`);
  console.log(`data files: [${c.dataFiles.join(', ')}]`);
  console.log(`signatures: ${report.signatures.length} (passed: ${report.signatures.filter((s) => s.indication === 'TOTAL_PASSED').length})`);
  for (const s of report.signatures) {
    console.log(`--- signature ${s.signatureId}`);
    console.log(`file: ${s.file}`);
    console.log(`level: ${s.level}`);
    console.log(`indication: ${s.indication}${s.subIndication ? ' / ' + s.subIndication : ''}`);
    console.log(`signed objects: [${s.signedPaths.join(', ')}]`);
    if (s.signerSubject) console.log(`signer: ${s.signerSubject}`);
    if (s.claimedSigningTime) console.log(`claimed signing time: ${s.claimedSigningTime}`);
    for (const r of s.references ?? []) console.log(`  reference ${r.status.padEnd(12)} ${r.kind.padEnd(17)} ${r.path ?? r.uri}${r.detail ? ' (' + r.detail + ')' : ''}`);
    for (const t of s.timestamps ?? []) {
      console.log(`  ${t.type} ${t.id ?? ''}: ${t.indication}${t.subIndication ? ' / ' + t.subIndication : ''}, genTime ${t.genTime ?? '?'}, imprint ${t.messageImprint}, TSA signature intact ${t.signatureIntact}`);
      console.log(`    TSA: ${t.tsaSubject ?? '?'}; chain: ${t.chain.join(' -> ')}`);
      for (const e of t.errors) console.log(`    ERROR: ${e}`);
      for (const n of t.infos ?? []) console.log(`    INFO: ${n}`);
    }
    for (const e of s.errors) console.log(`ERROR: ${e}`);
    for (const w of s.warnings) console.log(`WARNING: ${w}`);
    for (const n of s.infos ?? []) console.log(`INFO: ${n}`);
  }
  if (report.unsignedPaths.length > 0) console.log(`unsigned files: [${report.unsignedPaths.join(', ')}]`);
  console.log(`result: ${ok ? 'OK' : 'NOT OK'}`);
  return ok ? 0 : 1;
}

async function keygen(args: string[]): Promise<number> {
  const [keyFile, certFile, ...rest] = args;
  let alg: 'rsa' | 'ec' = 'rsa';
  let cn: string | undefined;
  let days: number | undefined;
  let usage: 'signature' | 'encryption' = 'signature';
  let notBefore: Date | undefined;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === '--not-before') notBefore = new Date(rest[++i]!);
    else if (a === '--usage') usage = rest[++i] as 'signature' | 'encryption';
    else if (a === '--alg') alg = rest[++i] as 'rsa' | 'ec';
    else if (a === '--cn') cn = rest[++i];
    else if (a === '--days') days = Number(rest[++i]);
    else throw new Error(`unexpected argument ${a}`);
  }
  if (!keyFile || !certFile || !['rsa', 'ec'].includes(alg)) {
    console.error('usage: hpro keygen <key.pem> <cert.pem> [--alg rsa|ec] [--cn NAME] [--days N] [--usage signature|encryption] [--not-before ISO]');
    return 2;
  }
  const id = await createTestIdentity({ algorithm: alg === 'rsa' ? 'RSA-3072' : 'EC-P256', usage, ...(notBefore ? { notBefore } : {}), ...(cn ? { commonName: cn } : {}), ...(days ? { validDays: days } : {}) });
  await writeFile(keyFile, toPem('PRIVATE KEY', id.pkcs8), { mode: 0o600 });
  await writeFile(certFile, toPem('CERTIFICATE', id.certificate));
  const cert = parseCertificate(id.certificate);
  console.log(`key: ${keyFile} (PKCS#8, ${alg === 'rsa' ? 'RSA 3072' : 'EC P-256'}, not encrypted, mode 600)`);
  console.log(`certificate: ${certFile}`);
  console.log(`  subject: ${cert.subject}`);
  console.log(`  serial: ${cert.serialHex}`);
  console.log(`  valid: ${cert.notBefore.toISOString()} - ${cert.notAfter.toISOString()}`);
  console.log(`  key usage: ${cert.keyUsage?.join(', ')}; CA: ${cert.isCa}`);
  console.log(`  sha256: ${sha256(id.certificate)}`);
  console.log('TEST certificate: self-signed, not qualified, trusted only where given as trust anchor.');
  return 0;
}

async function sign(args: string[]): Promise<number> {
  const [input, output, ...rest] = args;
  let keyFile: string | undefined;
  const chain: Uint8Array[] = [];
  let time: string | undefined;
  let id: string | undefined;
  const only: string[] = [];
  let tsa: string | undefined;
  let json: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === '--json') json = rest[++i];
    else if (a === '--only') only.push(rest[++i]!);
    else if (a === '--key') keyFile = rest[++i];
    else if (a === '--cert' || a === '--chain') chain.push(...certificatesFromPem(await readFile(rest[++i]!, 'utf8')));
    else if (a === '--time') time = rest[++i];
    else if (a === '--id') id = rest[++i];
    else if (a === '--tsa') tsa = rest[++i];
    else throw new Error(`unexpected argument ${a}`);
  }
  if (!input || !output || !keyFile || chain.length === 0) {
    console.error('usage: hpro sign <in> <out> --key key.pem --cert cert.pem [--chain ca.pem]... [--time ISO] [--id ID] [--only path]... [--tsa URL] [--json FILE]');
    return 2;
  }
  const signer = await SoftwareKeySigner.fromPkcs8(pkcs8FromPem(await readFile(keyFile, 'utf8')), { certificateChain: chain });
  const bytes = await readFile(input);
  const t0 = performance.now();
  const signed = await signContainer(bytes, { signer, ...(time ? { signingTime: new Date(time) } : {}), ...(id ? { signatureId: id } : {}), ...(only.length > 0 ? { paths: only } : {}), ...(tsa ? { timestamp: new HttpTimestampAuthority(tsa) } : {}) });
  const ms = performance.now() - t0;
  await writeFile(output, signed.bytes);
  const [key] = await signer.listKeys();
  console.log(`${output}  ${signed.bytes.length} bytes  sha256=${sha256(signed.bytes)}`);
  console.log(`signature: ${signed.signatureId}  algorithm ${key!.algorithms[0]}  signer ${key!.label}`);
  console.log(`signed objects (${signed.signedPaths.length}): [${signed.signedPaths.join(', ')}]`);
  console.log(`read-back (trust anchor: only the new signer's certificate): ${signed.readBack.signatures.map((s) => `${s.signatureId}=${s.indication}${s.subIndication ? '/' + s.subIndication : ''}`).join(', ')}`);
  if (signed.timestamp) console.log(`time-stamp: genTime ${signed.timestamp.genTime}, serial ${signed.timestamp.serialNumber}, TSA ${signed.timestamp.tsaSubject}, ${signed.timestamp.elapsedMs} ms`);
  console.log(`signing took ${ms.toFixed(1)} ms (in process, incl. read-back validation${signed.timestamp ? ' and the TSA round trip' : ''})`);
  if (json) {
    const report = {
      file: output,
      bytes: signed.bytes.length,
      sha256: sha256(signed.bytes),
      signatureId: signed.signatureId,
      level: signed.timestamp ? 'XAdES-BASELINE-T' : 'XAdES-BASELINE-B',
      signer: key!.label,
      signedPaths: signed.signedPaths,
      readBack: signed.readBack.signatures.map((x) => ({ signatureId: x.signatureId, indication: x.indication, ...(x.subIndication ? { subIndication: x.subIndication } : {}) })),
      ...(signed.timestamp ? { timestamp: { genTime: signed.timestamp.genTime, serialNumber: signed.timestamp.serialNumber, tsa: signed.timestamp.tsaSubject } } : {}),
    };
    await writeFile(json, JSON.stringify(report, null, 2) + '\n');
  }
  return 0;
}

const HELP = `hpro – Kommandozeile (Schnittstelle 1, siehe docs/spezifikation/06-einbau.md)

  hpro create <quelle> <ziel.hpro> [Optionen]   erzeugen aus .md, .docx, .odt/.fodt, .ods/.fods/.xlsx, .pdf
  hpro check <datei> [Optionen]                 prüfen (Konformitätsprüfer, Teil 1)
  hpro sign <ein> <aus> --key K --cert Z [...]  signieren (XAdES-BASELINE-B, mit --tsa B-T)
  hpro pdf export <ein> <aus.pdf> --dienst URL|--lokal [...]   nach PDF ausgeben (PDF/A-2a, PDF/UA-1)
  hpro validate <datei> --trust Z [...]         Signaturen prüfen
  hpro version [--json]                         Versionen

Rückgabe: 0 erfolgreich, 1 Ergebnis negativ, 2 Aufruf- oder Eingabefehler, 3 unbestimmt (check),
4 Hilfsmittel fehlt (PDF-Dienst).`;

async function main(argv: string[]): Promise<number> {
  const [cmd, ...args] = argv;
  if (cmd === 'create') return createCommand(args);
  if (cmd === 'check') return checkCommand(args);
  if (cmd === 'version' || cmd === '--version') {
    const v = versionInfo();
    if (args.includes('--json')) console.log(JSON.stringify(v, null, 2));
    else console.log(`hpro ${v.version} (${v.package}) · Kommandozeile Schnittstelle ${v.cliInterface} · Spezifikation hpro ${v.specification} · Regelkatalog ${v.ruleCatalog} · Node ${v.node}`);
    return 0;
  }
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    return 0;
  }
  if (cmd === 'sample' && args.length === 1) return sample(args[0]!);
  if (cmd === 'inspect' && args.length === 1) return inspect(args[0]!);
  if (cmd === 'compare' && args.length === 2) return compare(args[0]!, args[1]!);
  if (cmd === 'validate') return validate(args);
  if (cmd === 'keygen') return keygen(args);
  if (cmd === 'sign') return sign(args);
  if (cmd === 'calc') return calcCommand(args);
  if (cmd === 'form') return formCommand(args);
  if (cmd === 'lock') return lockCommand(args);
  if (cmd === 'edit') return editCommand(args);
  if (cmd === 'history') return historyCommand(args);
  if (cmd === 'diff') return diffCommand(args);
  if (cmd === 'annotate') return annotateCommand(args);
  if (cmd === 'a11y') return a11yCommand(args);
  if (cmd === 'pdf') return pdfCommand(args);
  if (cmd === 'author') return authorCommand(args);
  if (cmd === 'machine') return machineCommand(args);
  if (cmd === 'timestamp' || cmd === 'tsp' || cmd === 'csc') return remoteCommand(cmd, args);
  console.error(HELP);
  console.error('further commands: hpro sample <out> | hpro inspect <file> | hpro compare <a> <b> | hpro validate <file> [options] | hpro keygen <key> <cert> [options] | hpro sign <in> <out> [options] | hpro calc <subcommand> … | hpro form <subcommand> … | hpro lock <subcommand> … | hpro edit <subcommand> … | hpro history <file> | hpro diff <a> <b> | hpro annotate <subcommand> … | hpro a11y check|fix … | hpro pdf … | hpro author vorlagen|neu|md|docx|pdf … | hpro machine <file> | hpro machine write <in> <out> | hpro timestamp … | hpro tsp request|verify … | hpro csc info|keys|sign …');
  return 2;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof ContainerError ? `format error [${err.code}]: ${err.message}` : err);
    process.exit(2);
  },
);
