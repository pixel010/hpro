#!/usr/bin/env node
/**
 * Measurements behind the design of the P18 page numbers (app/src/paginate.ts, print.css), in the
 * Chromium the reader tests use. Writes probe PDFs and the screen-side numbers to <dir>;
 * scripts/p18-messung-auswertung.py reads the PDFs and prints the comparison.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=app/.browsers node scripts/p18-messung.mjs app/.scratch/p18-messung
 *
 *  1 target-counter(): accepted by CSS.supports, but does it print a number?
 *  2 type area of a printed A4 page (margins 22/20/20/20 mm) in CSS px: width from a row of
 *    0.5 px boxes, height from 1/32 px blocks after a 963 px block; named destinations tell where
 *    each probe landed
 *  3 table head: repeated in the columns of a multi-column box, as on printed pages?
 *  4 top margin of a box after an unforced break: kept or truncated, in columns and in print
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(resolve('app/package.json'));
const { chromium } = require('playwright');
const out = resolve(process.argv[2] ?? 'app/.scratch/p18-messung');
mkdirSync(out, { recursive: true });
const PAGE = '@page{size:A4;margin:22mm 20mm 20mm 20mm}html,body{margin:0;padding:0}';
const COLS = 'html.m body{column-count:1;column-gap:0;column-fill:auto;width:643px;height:964px}';
const result = {};

const browser = await chromium.launch();
result.chromium = browser.version();
const page = await browser.newPage({ viewport: { width: 643, height: 964 } });
async function pdf(name, html) {
  await page.setContent(html);
  await page.emulateMedia({ media: 'print' });
  writeFileSync(join(out, `${name}.pdf`), await page.pdf({ preferCSSPageSize: true }));
  await page.emulateMedia({ media: 'screen' });
}

// 1
await page.setContent(`<!DOCTYPE html><html><head><style>${PAGE} a::after{content:"[S. " target-counter(attr(href url), page) "]"}</style></head><body><p><a href="#z">Verweis</a></p><p id="z" style="break-before:page">Ziel</p></body></html>`);
result.targetCounterSupported = await page.evaluate(() => CSS.supports('content', 'target-counter(attr(href url), page)'));
await pdf('1-target-counter', await page.content());

// 2
const boxes = Array.from({ length: 1400 }, (_, i) => `<span id="w${i}" style="display:inline-block;width:0.5px;height:2px;vertical-align:top"></span>`).join('');
const fine = Array.from({ length: 64 }, (_, i) => `<div id="f${i}" style="height:0.03125px;break-inside:avoid"></div>`).join('');
const links2 = [...Array.from({ length: 1400 }, (_, i) => `#w${i}`), ...Array.from({ length: 64 }, (_, i) => `#f${i}`)].map((h) => `<a href="${h}"></a>`).join('');
await pdf('2-satzspiegel', `<!DOCTYPE html><html><head><style>${PAGE}</style></head><body><nav style="height:0;overflow:hidden">${links2}</nav><div style="line-height:0;font-size:0">${boxes}</div><div style="height:959px"></div>${fine}</body></html>`);
result.typeArea = { mm: [170, 255], px: [(170 * 96) / 25.4, (255 * 96) / 25.4], probes: 'Zeile 1: 1400 Kästchen à 0,5 px (2 px hoch); danach 959 px; dann 64 Blöcke à 1/32 px' };

// 3
const rows = Array.from({ length: 120 }, (_, i) => `<tr id="r${i}"><td>${i + 1}</td><td>Zeile ${i + 1}</td></tr>`).join('');
const table = `<!DOCTYPE html><html><head><style>${PAGE}${COLS} td,th{height:20px;padding:0;border:0} tr{break-inside:avoid}</style></head><body><nav style="height:0;overflow:hidden"><a href="#r60"></a></nav><table><thead><tr><th>Nr</th><th>Text</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
await page.setContent(table);
result.tableColumns = await page.evaluate(() => {
  document.documentElement.classList.add('m');
  const box = document.body.getBoundingClientRect();
  const r = document.getElementById('r60').getClientRects()[0];
  const out = { theadFragments: document.querySelector('thead').getClientRects().length, r60: { column: Math.floor((r.left - box.left + 0.5) / 643) + 1, topPx: r.top - box.top } };
  document.documentElement.classList.remove('m');
  return out;
});
await pdf('3-tabellenkopf', table);

// 4
const margin = `<!DOCTYPE html><html><head><style>${PAGE}${COLS} h2{margin:30px 0 10px;font:20px/24px sans-serif;break-after:avoid} section{break-inside:avoid}</style></head><body><nav style="height:0;overflow:hidden"><a href="#s"></a></nav><div style="height:900px"></div><section id="s"><h2>Abschnitt</h2><p>Text</p><p>Text</p></section></body></html>`;
await page.setContent(margin);
result.marginColumns = await page.evaluate(() => {
  document.documentElement.classList.add('m');
  const box = document.body.getBoundingClientRect();
  const r = document.querySelector('h2').getClientRects()[0];
  const out = { column: Math.floor((r.left - box.left + 0.5) / 643) + 1, h2TopPx: r.top - box.top, marginTopPx: 30 };
  document.documentElement.classList.remove('m');
  return out;
});
await pdf('4-aussenabstand', margin);

await browser.close();
writeFileSync(join(out, 'bildschirm.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
