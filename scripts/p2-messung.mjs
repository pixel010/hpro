#!/usr/bin/env node
// Misst die Prüfdauer des TypeScript-Kerns im laufenden Prozess (ohne Node-Start), je Fall
// 20 Durchläufe nach 3 Aufwärmläufen. Zum Vergleich: laufzeiten.tsv enthält die Wanduhrzeit
// je Prozessaufruf für DSS (inkl. JVM-Start) und für die Kern-CLI (inkl. Node-Start).
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { certificatesFromPem, validateContainer } from '../kern/build/src/index.js';

const ROOT = resolve(import.meta.dirname, '..');
const faelle = JSON.parse(await readFile(resolve(ROOT, 'docs/belege/P2/faelle.json'), 'utf8'));
const RUNS = 20;
const medians = [];
console.log(`Node ${process.version}, ${RUNS} Durchläufe je Fall nach 3 Aufwärmläufen, Angaben in ms`);
console.log('Fall'.padEnd(40), 'Bytes'.padStart(6), 'Median'.padStart(8), 'Min'.padStart(8), 'Max'.padStart(8));
for (const f of faelle) {
  const bytes = await readFile(resolve(ROOT, f.container));
  const trustAnchors = certificatesFromPem(await readFile(resolve(ROOT, f.trust), 'utf8'));
  const opts = { trustAnchors, policy: f.policy };
  for (let i = 0; i < 3; i++) await validateContainer(bytes, opts);
  const t = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    await validateContainer(bytes, opts);
    t.push(performance.now() - t0);
  }
  t.sort((a, b) => a - b);
  const med = t[Math.floor(RUNS / 2)];
  medians.push(med);
  console.log(f.id.padEnd(40), String(bytes.length).padStart(6), med.toFixed(2).padStart(8), t[0].toFixed(2).padStart(8), t[RUNS - 1].toFixed(2).padStart(8));
}
medians.sort((a, b) => a - b);
console.log(`Median über alle Fälle: ${medians[Math.floor(medians.length / 2)].toFixed(2)} ms`);
