#!/usr/bin/env node
/**
 * S5: Gegenprobe der Darstellungsregeln, die hpro-check ohne Browser als „nicht geprüft“ führt,
 * nach den Prüfverfahren des Regelkatalogs (Teil 1), in Chromium (Playwright der Reader-App):
 *
 *   HPR-INH-004  320, 768 und 1280 CSS-Pixel Breite: scrollWidth ≤ clientWidth (Bildschirm zuerst, Zusage 1)
 *   HPR-INH-006  --hp-font-size: 200 % und --hp-line-height: 2 auf dem Wurzelelement: Faktor je p
 *   HPR-INH-022  prefers-reduced-motion: reduce, 5 s warten: document.getAnimations() leer
 *
 *   PLAYWRIGHT_BROWSERS_PATH=$PWD/app/.browsers node scripts/s5-darstellung.mjs <arbeitsverzeichnis> <name>=<container.hpro> …
 *
 * Der Container wird entpackt und jedes Inhaltsdokument der Lesereihenfolge als Datei geöffnet
 * (file://, XHTML-Parser). Exit 1, wenn eine Breite waagrecht scrollt.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { kern } from './s7-lib.mjs';

const require = createRequire(resolve('app/package.json'));
const { chromium } = require('playwright');
const [work, ...pairs] = process.argv.slice(2);
const { readContainer } = await kern();
const browser = await chromium.launch();
console.log(`Chromium ${browser.version()}`);
let failed = false;
for (const pair of pairs) {
  const eq = pair.indexOf('=');
  const name = pair.slice(0, eq);
  const c = await readContainer(new Uint8Array((await import('node:fs')).readFileSync(pair.slice(eq + 1))));
  const dir = resolve(work, name);
  rmSync(dir, { recursive: true, force: true });
  for (const [p, data] of c.files) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), data);
  }
  for (const r of c.manifest.readingOrder) {
    const url = pathToFileURL(join(dir, r.url)).href;
    const widths = [];
    for (const w of [320, 768, 1280]) {
      const page = await browser.newPage({ viewport: { width: w, height: 900 } });
      await page.goto(url);
      const m = await page.evaluate(() => {
        const cw = document.scrollingElement.clientWidth;
        // Scroll areas of HP-INH-010 are exempt: the reading system puts them into their own scroll box.
        const exempt = (e) => !!e.closest('table[data-hp-table="scroll"], pre, figure');
        const over = [...document.body.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > cw + 0.5);
        const top = (list) => list.filter((e) => !list.includes(e.parentElement)).map((e) => `${e.localName}${e.id ? '#' + e.id : ''}`);
        return { scroll: document.scrollingElement.scrollWidth, client: cw, exempt: top(over.filter(exempt)), other: top(over.filter((e) => !exempt(e))) };
      });
      const verdict = m.scroll <= m.client ? 'ok' : m.other.length === 0 ? `ok, nur Scrollbereich nach HP-INH-010 (${m.exempt.join(', ')})` : `SCROLLT (${m.other.join(', ')})`;
      widths.push(`${w} px: scrollWidth ${m.scroll} / clientWidth ${m.client} ${verdict}`);
      if (m.other.length > 0) failed = true;
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 768, height: 900 } });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(url);
    const base = await page.evaluate(() => [...document.querySelectorAll('p')].map((p) => [parseFloat(getComputedStyle(p).fontSize), parseFloat(getComputedStyle(p).lineHeight)]));
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--hp-font-size', '200%');
      document.documentElement.style.setProperty('--hp-line-height', '2');
    });
    const big = await page.evaluate(() => [...document.querySelectorAll('p')].map((p) => [parseFloat(getComputedStyle(p).fontSize), parseFloat(getComputedStyle(p).lineHeight)]));
    const fs = big.map((b, i) => b[0] / base[i][0]);
    const lh = big.map((b, i) => b[1] / base[i][1]);
    const range = (a) => (a.length ? `${Math.min(...a).toFixed(3)}–${Math.max(...a).toFixed(3)}` : '–');
    await page.waitForTimeout(5000);
    const animations = await page.evaluate(() => document.getAnimations().length);
    const media = await page.evaluate(() => [...document.querySelectorAll('video,audio')].filter((m) => !m.paused).length);
    await page.close();
    console.log(`\n${name}: ${r.url}`);
    console.log(`  HPR-INH-004 ${widths.join('; ')}`);
    console.log(`  HPR-INH-006 ${base.length} Absätze: Schriftgröße Faktor ${range(fs)}, Zeilenhöhe Faktor ${range(lh)} (Zeilenhöhe: 1,5 → 2 bei doppelter Schrift ergibt 2,667)`);
    console.log(`  HPR-INH-022 reduzierte Bewegung, nach 5 s: ${animations} Animationen, ${media} laufende Medien`);
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
