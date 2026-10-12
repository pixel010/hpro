// Renders the PNG app icons from public/icons/icon.svg with the local Chromium (Playwright).
// Run once after changing the SVG:  PLAYWRIGHT_BROWSERS_PATH=.browsers node scripts/make-icons.mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dir = fileURLToPath(new URL('../public/icons/', import.meta.url));
const svg = await readFile(`${dir}icon.svg`, 'utf8');
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const variants = [
    { file: 'icon-192.png', size: 192, html: `<img src="${dataUrl}" style="width:192px;height:192px;display:block">` },
    { file: 'icon-512.png', size: 512, html: `<img src="${dataUrl}" style="width:512px;height:512px;display:block">` },
    // Maskable: full-bleed background, artwork inside the 80 % safe zone.
    { file: 'icon-maskable-512.png', size: 512, html: `<div style="width:512px;height:512px;background:#1f4e5f;display:grid;place-items:center"><img src="${dataUrl}" style="width:360px;height:360px"></div>` },
  ];
  for (const v of variants) {
    await page.setViewportSize({ width: v.size, height: v.size });
    await page.setContent(`<!doctype html><body style="margin:0;background:transparent">${v.html}</body>`);
    await page.locator('body > *').first().screenshot({ path: `${dir}${v.file}`, omitBackground: true });
    console.log(`${v.file}: ${v.size}x${v.size}`);
  }
} finally {
  await browser.close();
}
