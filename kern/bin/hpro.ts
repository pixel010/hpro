#!/usr/bin/env node
/**
 * Command line for the container core (Node only).
 *
 *   hpro sample <out>          write the sample document as container
 *   hpro inspect <file>        list entries, check structure and hash manifest
 *   hpro compare <a> <b>       compare entries and per-entry SHA-256 of two containers
 *
 * Exit codes: 0 ok, 1 check failed (hash mismatch, containers differ), 2 format error or usage.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { ContainerError, createContainer, readContainer, readZip, sampleDocument } from '../src/index.js';

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

async function main(argv: string[]): Promise<number> {
  const [cmd, ...args] = argv;
  if (cmd === 'sample' && args.length === 1) return sample(args[0]!);
  if (cmd === 'inspect' && args.length === 1) return inspect(args[0]!);
  if (cmd === 'compare' && args.length === 2) return compare(args[0]!, args[1]!);
  console.error('usage: hpro sample <out> | hpro inspect <file> | hpro compare <a> <b>');
  return 2;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof ContainerError ? `format error [${err.code}]: ${err.message}` : err);
    process.exit(2);
  },
);
