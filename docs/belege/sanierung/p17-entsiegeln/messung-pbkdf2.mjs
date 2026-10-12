// Measures PBKDF2-HMAC-SHA-512/-256 in Node and in the Chromium of the e2e tests (app/.browsers).
// Run from app/: PLAYWRIGHT_BROWSERS_PATH=.browsers node ../docs/belege/sanierung/p17-entsiegeln/messung-pbkdf2.mjs
import { createRequire } from 'node:module';

const require = createRequire(`${process.cwd()}/`);
const { chromium } = require('@playwright/test');

const bench = async (hash, iterations) => {
  const t0 = performance.now();
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode('x'.repeat(12)), 'PBKDF2', false, ['deriveBits']);
  await crypto.subtle.deriveBits({ name: 'PBKDF2', hash, salt: new Uint8Array(16), iterations }, base, 256);
  return Math.round(performance.now() - t0);
};
const CASES = [['SHA-512', 100_000], ['SHA-256', 100_000], ['SHA-512', 600_000]];

console.log(`Node ${process.version}`);
for (const [h, i] of CASES) console.log(`node      PBKDF2-${h} ${i} Iterationen: ${await bench(h, i)} ms`);
const browser = await chromium.launch();
console.log(`Chromium ${browser.version()}`);
const page = await browser.newPage();
// WebCrypto needs a secure context; http://localhost counts as one.
await page.route('http://localhost/blank', (r) => r.fulfill({ body: '<!doctype html><title>x</title>', contentType: 'text/html' }));
await page.goto('http://localhost/blank');
for (const [h, i] of CASES) console.log(`chromium  PBKDF2-${h} ${i} Iterationen: ${await page.evaluate(`(${bench})(${JSON.stringify(h)}, ${i})`)} ms`);
await browser.close();
