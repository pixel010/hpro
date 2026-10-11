#!/usr/bin/env node
// Misst die Signierdauer des TypeScript-Kerns im laufenden Prozess (ohne Node-Start):
// signContainer auf den unsignierten Beispielcontainer, je Schlüsselart 20 Durchläufe nach
// 3 Aufwärmläufen. Eine Messung umfasst Lesen, Hashen, XAdES-Aufbau, C14N, WebCrypto-Signatur,
// ZIP-Schreiben und die Rückleseprüfung mit dem eigenen Validator.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SoftwareKeySigner, certificatesFromPem, pkcs8FromPem, signContainer, validateContainer } from '../kern/build/src/index.js';

const [unsignedPath, ...pairs] = process.argv.slice(2);
if (!unsignedPath || pairs.length === 0 || pairs.length % 2 !== 0) {
  console.error('usage: p3-messung.mjs <unsigned.epub> <key.pem> <cert.pem> [<key.pem> <cert.pem>]...');
  process.exit(2);
}
const RUNS = 20;
const unsigned = await readFile(resolve(unsignedPath));
console.log(`Node ${process.version}, ${RUNS} Durchläufe je Schlüssel nach 3 Aufwärmläufen, Angaben in ms`);
console.log(`Eingabe: ${unsignedPath} (${unsigned.length} Bytes)`);
console.log('Schlüssel'.padEnd(28), 'Ausgabe-Bytes'.padStart(13), 'Median'.padStart(8), 'Min'.padStart(8), 'Max'.padStart(8), ' Prüfen (Median)');
for (let i = 0; i < pairs.length; i += 2) {
  const chain = certificatesFromPem(await readFile(pairs[i + 1], 'utf8'));
  const signer = await SoftwareKeySigner.fromPkcs8(pkcs8FromPem(await readFile(pairs[i], 'utf8')), { certificateChain: chain });
  const [key] = await signer.listKeys();
  let out;
  for (let k = 0; k < 3; k++) out = await signContainer(unsigned, { signer });
  const t = [];
  const v = [];
  for (let k = 0; k < RUNS; k++) {
    const t0 = performance.now();
    out = await signContainer(unsigned, { signer });
    t.push(performance.now() - t0);
    const t1 = performance.now();
    await validateContainer(out.bytes, { trustAnchors: chain });
    v.push(performance.now() - t1);
  }
  t.sort((a, b) => a - b);
  v.sort((a, b) => a - b);
  const med = (x) => x[Math.floor(RUNS / 2)].toFixed(2);
  console.log(key.algorithms[0].padEnd(28), String(out.bytes.length).padStart(13), med(t).padStart(8), t[0].toFixed(2).padStart(8), t[RUNS - 1].toFixed(2).padStart(8), med(v).padStart(16));
}
