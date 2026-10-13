#!/usr/bin/env node
// Package P10: runs `hpro csc keys|sign` (kern/build/bin/hpro.js) against the mock RSSP on
// 127.0.0.1. The script plays the user: it answers the PIN prompt and reads the OTP from the
// double's "SMS" outbox, both through the CLI's stdin. The server stops at the end.
//   node scripts/p10-csc-cli.mjs <in.epub> <out.epub>
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node scripts/p10-csc-cli.mjs <in.epub> <out.epub>');
  process.exit(2);
}
const { createTestPki, issueCrl } = await import(resolve(ROOT, 'kern/build/test/pki.js'));
const { createMockRssp } = await import(resolve(ROOT, 'kern/build/test/remote-mock.js'));
const { toPem } = await import(resolve(ROOT, 'kern/build/src/index.js'));

const pki = await createTestPki();
const service = await createMockRssp(pki);
const server = await service.listen();
const base = output.replace(/\.epub$/, '');
await writeFile(`${base}-root.pem`, toPem('CERTIFICATE', pki.root.der));
await writeFile(`${base}-root.crl`, await issueCrl(pki.root));
await writeFile(`${base}-tsa.pem`, toPem('CERTIFICATE', pki.tsa.der));
console.log(`mock RSSP: ${server.url}, mock TSA: ${server.tsaUrl}`);

function run(args) {
  return new Promise((resolveRun) => {
    console.log(`$ hpro ${args.join(' ')}`);
    const child = spawn(process.execPath, [resolve(ROOT, 'kern/build/bin/hpro.js'), ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => process.stdout.write(d));
    child.stderr.on('data', (d) => {
      const s = d.toString();
      process.stdout.write(`[stderr] ${s}${s.endsWith('\n') ? '' : '\n'}`);
      if (/PIN: $/.test(s)) {
        console.log('[user] types PIN 123456');
        child.stdin.write('123456\n');
      } else if (/OTP: $/.test(s)) {
        const otp = service.outbox.at(-1).otp;
        console.log(`[user] reads SMS from outbox and types OTP ${otp}`);
        child.stdin.write(`${otp}\n`);
      }
    });
    child.on('close', (code) => {
      console.log(`[exit ${code}]`);
      resolveRun(code);
    });
  });
}

let code = 1;
try {
  const auth = ['--url', server.url, '--user', 'max.mustermann', '--password', 'testpasswort'];
  await run(['csc', 'info', '--url', server.url]);
  await run(['csc', 'keys', ...auth]);
  code = await run(['csc', 'sign', input, output, ...auth, '--credential', 'hpro-ec-01', '--tsa', server.tsaUrl]);
} finally {
  await server.close();
  console.log('mock RSSP stopped');
}
process.exit(code);
