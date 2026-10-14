#!/usr/bin/env node
/**
 * Smoke test of the release (P14): serves the unpacked reader archive with a static file server
 * (in this process, 127.0.0.1, closed at the end), opens each demo document through the file
 * input like a user, and records per width (telephone, tablet, desktop) whether the document is
 * shown, its title, the integrity state and horizontal overflow (promise 1). The form demo is
 * also filled in the reader to see the calculated fields change. Screenshots go to <bilder>.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=$PWD/app/.browsers node scripts/p14-rauchtest.mjs <reader-dir> <bilder-dir>
 *
 * Exit 1 when a document does not open, has the wrong title or scrolls horizontally.
 */
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright';
import { DEMOS, fileName } from './demo-bauen.mjs';

const [readerDir, shotsDir] = process.argv.slice(2).map((p) => resolve(p));
if (!readerDir || !shotsDir) {
  console.error('usage: node scripts/p14-rauchtest.mjs <reader-dir> <bilder-dir>');
  process.exit(2);
}
const ROOT = resolve(import.meta.dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.hpro': 'application/epub+zip', '.txt': 'text/plain; charset=utf-8' };
const WIDTHS = { telefon: { width: 390, height: 844 }, tablet: { width: 820, height: 1180 }, desktop: { width: 1440, height: 900 } };
const TITLES = {
  bericht: 'Jahresbericht 2026 – Trinkwasser Beispieldorf',
  formular: 'Reisekostenabrechnung – Inlandsdienstreise',
  nachweis: 'Prüfnachweis Trinkwasser-Hausinstallation Kirchgasse 5',
};

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(readerDir, path);
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
    const body = readFileSync(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
mkdirSync(shotsDir, { recursive: true });

const browser = await chromium.launch();
let failures = 0;
const results = [];
try {
  for (const name of DEMOS) {
    for (const [label, viewport] of Object.entries(WIDTHS)) {
      const page = await browser.newPage({ viewport });
      const t0 = Date.now();
      await page.goto(base);
      await page.locator('#file-input').setInputFiles(join(ROOT, 'demo', fileName(name)));
      await page.locator('#viewer[data-state="ready"]').waitFor({ timeout: 30000 });
      const ms = Date.now() - t0;
      const title = (await page.locator('#doc-title').textContent())?.trim();
      const frame = page.frames().find((f) => f.parentFrame() && f.parentFrame() !== page.mainFrame());
      const overflow = frame ? await frame.evaluate(() => { const el = document.scrollingElement ?? document.documentElement; return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }; }) : null;
      const shell = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      const status = (await page.locator('#status, .status, [role="status"]').first().textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim();
      const ok = title === TITLES[name] && overflow !== null && overflow.scrollWidth <= overflow.clientWidth && shell.scrollWidth <= shell.clientWidth;
      if (!ok) failures++;
      await page.screenshot({ path: join(shotsDir, `${name}-${label}.png`) });
      const row = { dokument: fileName(name), breite: `${label} ${viewport.width}px`, titel: title, oeffnenMs: ms, dokumentrahmen: overflow, huelle: shell, status, ergebnis: ok ? 'ok' : 'FEHLER' };
      results.push(row);
      console.log(`${ok ? 'ok    ' : 'FEHLER'} ${fileName(name).padEnd(24)} ${label.padEnd(8)} ${String(viewport.width).padStart(4)}px  Titel „${title}“  Rahmen ${overflow?.scrollWidth}/${overflow?.clientWidth}  Hülle ${shell.scrollWidth}/${shell.clientWidth}  ${ms} ms`);
      if (name === 'formular' && label === 'desktop' && frame) {
        const fill = async (sel, value) => { await frame.locator(sel).fill(value); await frame.locator(sel).blur(); };
        await fill('#f-dauer', '9');
        await frame.locator('#f-anreise-pkw').check();
        await fill('#f-km', '86');
        await fill('#f-parken', '7,50');
        await fill('#f-vorschuss', '20');
        await page.waitForTimeout(500);
        const out = {};
        for (const id of ['f-tagesgeld', 'f-kmgeld', 'f-summe', 'f-auszahlung']) out[id] = (await frame.locator(`#${id}`).textContent())?.trim();
        const pkwVisible = await frame.locator('#pkw').isVisible();
        const expected = { 'f-tagesgeld': '22,50 €', 'f-kmgeld': '43,00 €', 'f-summe': '73,00 €', 'f-auszahlung': '53,00 €' };
        const calcOk = pkwVisible && Object.entries(expected).every(([k, v]) => out[k] === v);
        if (!calcOk) failures++;
        console.log(`${calcOk ? 'ok    ' : 'FEHLER'} Formular im Reader ausgefüllt (9 h, PKW 86 km, Parken 7,50, Vorschuss 20): Abschnitt PKW sichtbar=${pkwVisible}, ${JSON.stringify(out)}`);
        results.push({ dokument: fileName(name), formularImReader: out, abschnittPkwSichtbar: pkwVisible, ergebnis: calcOk ? 'ok' : 'FEHLER' });
        await page.screenshot({ path: join(shotsDir, 'formular-ausgefuellt-desktop.png'), fullPage: false });
      }
      await page.close();
    }
  }
  console.log(`Browser: chromium ${browser.version()}`);
} finally {
  await browser.close();
  server.close();
}
console.log(failures === 0 ? 'Rauchtest: alle Demo-Dokumente im Reader des Release-Archivs geöffnet, ohne waagrechtes Scrollen.' : `Rauchtest: ${failures} Fehler`);
process.exitCode = failures === 0 ? 0 : 1;
