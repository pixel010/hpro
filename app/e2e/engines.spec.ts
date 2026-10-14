/**
 * Cross-engine comparison (P13): the same containers opened through the reader in Chromium,
 * Firefox and WebKit. The tests assert what the format promises regardless of the engine
 * (HPR-INH-004 reflow at 320/768/1280 px, HPR-INH-006 reading-system variables, sandbox origin)
 * and record what may differ: block geometry at each width, document height, the page breaks of
 * the fixed page view, the text width of the body font and the engine's feature support.
 *
 * Every engine writes test-results/engines/<engine>/{engine.json,messung/*.json,bilder/*.png};
 * scripts/p13-vergleich.mjs puts the three side by side (report, pixel differences).
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CALC_SAMPLE, SAMPLE, docFrame, frameOverflow, innerFrame, openFile } from './helpers.js';

const OUT = fileURLToPath(new URL('../test-results/engines/', import.meta.url));
const LIVE_SAMPLE = fileURLToPath(new URL('../dist/lebendig.hpro', import.meta.url));
const PRINT_SAMPLE = fileURLToPath(new URL('../dist/druck.hpro', import.meta.url));

const FILES = [
  { key: 'beispiel', path: SAMPLE },
  { key: 'lebendig', path: LIVE_SAMPLE },
  { key: 'kostenschaetzung', path: CALC_SAMPLE },
  { key: 'druck', path: PRINT_SAMPLE },
] as const;
/** The widths of HPR-INH-004. */
const WIDTHS = [320, 768, 1280] as const;

/** Elements whose position is recorded: everything with a stable address (id). */
const BLOCKS = 'h1[id], h2[id], h3[id], h4[id], p[id], li[id], table[id], figure[id], pre[id], details[id], section[id], hp-chart[id]';

type Measurement = Record<string, unknown>;

function engineDir(info: TestInfo): string {
  const dir = join(OUT, info.project.name.replace(/^engine-/, ''));
  mkdirSync(join(dir, 'bilder'), { recursive: true });
  mkdirSync(join(dir, 'messung'), { recursive: true });
  return dir;
}

/** One file per measurement, so a worker restarted after a failure loses nothing. */
function save(info: TestInfo, key: string, data: Measurement): void {
  writeFileSync(join(engineDir(info), 'messung', `${key}.json`), JSON.stringify(data, null, 2) + '\n');
}

/** Geometry of the document in the frame, relative to the top of the body. */
async function geometry(page: Page) {
  return innerFrame(page).evaluate((selector) => {
    const body = document.body.getBoundingClientRect();
    const el = document.scrollingElement ?? document.documentElement;
    const blocks: Record<string, [number, number, number]> = {};
    for (const node of Array.from(document.querySelectorAll(selector))) {
      if (node.closest('[data-hp-reader]')) continue;
      const r = node.getBoundingClientRect();
      if (r.height === 0) continue;
      blocks[`${node.localName}#${node.id}`] = [Math.round(r.top - body.top), Math.round(r.height), Math.round(r.width)];
    }
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, blocks };
  }, BLOCKS);
}

test.describe('Cross-engine: same file, three engines', () => {
  test.beforeAll(async ({ browser }, info) => {
    const blank = await browser.newPage();
    const ua = await blank.evaluate(() => navigator.userAgent);
    await blank.close();
    writeFileSync(join(engineDir(info), 'engine.json'), JSON.stringify({ engine: browser.browserType().name(), version: browser.version(), userAgent: ua, platform: process.platform }, null, 2) + '\n');
  });

  for (const file of FILES) {
    for (const width of WIDTHS) {
      test(`${file.key}.hpro at ${width} px: no horizontal scrolling (HPR-INH-004), geometry recorded`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 900 });
        await openFile(page, file.path);
        const geo = await geometry(page);
        await page.screenshot({ path: join(engineDir(info), 'bilder', `${file.key}-${width}.png`) });
        save(info, `${file.key}@${width}`, geo);
        expect(geo.scrollWidth, `${file.key} at ${width} px`).toBeLessThanOrEqual(geo.clientWidth);
        expect(Object.keys(geo.blocks).length).toBeGreaterThan(0);
      });
    }
  }

  test('beispiel.hpro: the frame follows the reading-system variables (HPR-INH-006)', async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFile(page, SAMPLE);
    const probe = await innerFrame(page).evaluate(async () => {
      const ps = Array.from(document.querySelectorAll('body p')) as HTMLElement[];
      const read = () => ps.map((p) => ({ fs: parseFloat(getComputedStyle(p).fontSize), lh: getComputedStyle(p).lineHeight }));
      const before = read();
      document.documentElement.style.setProperty('--hp-font-size', '200%');
      document.documentElement.style.setProperty('--hp-line-height', '2');
      const after = read();
      document.documentElement.style.removeProperty('--hp-font-size');
      document.documentElement.style.removeProperty('--hp-line-height');
      return {
        paragraphs: ps.length,
        fontSizeBefore: before[0]?.fs,
        lineHeightBefore: before[0]?.lh,
        fontSizeAfter: after[0]?.fs,
        lineHeightAfter: after[0]?.lh,
        fontFactors: after.map((a, i) => Math.round((a.fs / before[i]!.fs) * 1000) / 1000),
        lineToFont: after.map((a) => Math.round((parseFloat(a.lh) / a.fs) * 1000) / 1000),
      };
    });
    save(info, 'variablen', probe);
    expect(probe.paragraphs).toBeGreaterThan(0);
    for (const f of probe.fontFactors) expect(Math.abs(f - 2)).toBeLessThanOrEqual(0.02);
    for (const r of probe.lineToFont) expect(Math.abs(r - 2)).toBeLessThanOrEqual(0.02);
  });

  for (const file of [FILES[0], FILES[3]]) {
    test(`${file.key}.hpro: page breaks of the fixed page view`, async ({ page }, info) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openFile(page, file.path);
      await page.getByRole('button', { name: 'Seiten' }).click();
      const pages = docFrame(page).locator('[data-hp-reader="page"]');
      await expect.poll(() => pages.count()).toBeGreaterThanOrEqual(1);
      const result = await innerFrame(page).evaluate(() => ({
        pages: document.querySelectorAll('[data-hp-reader="page"]').length,
        breaks: Array.from(document.querySelectorAll('[data-hp-break]')).map((el) => `${el.localName}#${el.id}`),
        size: (() => {
          const p = document.querySelector('[data-hp-reader="page"]') as HTMLElement;
          return { w: p.offsetWidth, h: p.offsetHeight };
        })(),
      }));
      await page.screenshot({ path: join(engineDir(info), 'bilder', `${file.key}-seiten.png`) });
      save(info, `${file.key}@seiten`, result);
      // A4 at 96 dpi in every engine.
      expect(Math.abs(result.size.w - 793.7)).toBeLessThan(1.5);
      expect(Math.abs(result.size.h - 1122.5)).toBeLessThan(1.5);
    });
  }

  /**
   * The print prediction of the reader (src/paginate.ts) lays the body out as columns of the type
   * area and reads each element's column as its page. Whether a heading stays with what follows
   * then depends on the engine's column fragmentation: a heading with `break-after: avoid` placed
   * so that it would end column 1, and a box with `break-inside: avoid` that would straddle it.
   */
  test('column fragmentation: break-after and break-inside avoid', async ({ page }, info) => {
    await page.setContent(`<!DOCTYPE html><html lang="de"><body style="margin:0">
      <div id="cols" style="columns:2 200px;column-gap:0;width:400px;height:300px;column-fill:auto;font:16px/20px sans-serif">
        <div style="height:250px;background:#eee"></div>
        <h2 id="h" style="margin:0;height:40px;break-after:avoid">Überschrift</h2>
        <p id="p" style="margin:0;height:100px;background:#ddd">Absatz nach der Überschrift</p>
        <div id="box" style="height:220px;break-inside:avoid;background:#ccc">Kasten</div>
      </div></body></html>`);
    const result = await page.evaluate(() => {
      const col = (id: string, which: 'first' | 'last') => {
        const rects = document.getElementById(id)!.getClientRects();
        const r = which === 'first' ? rects[0]! : rects[rects.length - 1]!;
        return Math.floor(r.left / 200) + 1;
      };
      return {
        headingColumn: col('h', 'last'),
        paragraphColumn: col('p', 'first'),
        boxFirstColumn: col('box', 'first'),
        boxLastColumn: col('box', 'last'),
        supports: {
          'break-after: avoid': CSS.supports('break-after', 'avoid'),
          'break-inside: avoid': CSS.supports('break-inside', 'avoid'),
          'orphans: 2': CSS.supports('orphans', '2'),
          'widows: 2': CSS.supports('widows', '2'),
        },
      };
    });
    const measured = {
      ...result,
      breakAfterAvoidHonoured: result.headingColumn === result.paragraphColumn,
      breakInsideAvoidHonoured: result.boxFirstColumn === result.boxLastColumn,
    };
    await page.screenshot({ path: join(engineDir(info), 'bilder', 'fragmentierung.png'), clip: { x: 0, y: 0, width: 420, height: 320 } });
    save(info, 'fragmentierung', measured);
    // Recorded, not asserted: the outcome is the engine's (docs/16, Unterschied U1).
    expect(typeof measured.breakAfterAvoidHonoured).toBe('boolean');
  });

  /**
   * The frame host (frame.html, P15) reports a document frame that navigated away, because
   * a blocked navigation leaves an error page instead of the document. This drives the real frame
   * host with a document that navigates itself and records the `load` events and what stays shown.
   */
  test('frame host: a document frame that navigates itself', async ({ page }, info) => {
    // Counting server as navigation target (another port than the reader): did a request leave?
    const hits: string[] = [];
    const server = createServer((req, res) => {
      hits.push(`${req.method} ${req.url}`);
      res.end('<p>draussen</p>');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const target = `http://127.0.0.1:${(server.address() as AddressInfo).port}/weg`;
    await page.goto('./frame.html');
    const result = await page.evaluate(async (target) => {
      const messages: string[] = [];
      let loads = 0;
      const frame = document.getElementById('doc-frame') as HTMLIFrameElement;
      frame.addEventListener('load', () => loads++);
      window.addEventListener('message', (e) => {
        if (e.data && e.data.hp === 'host') messages.push(String(e.data.type));
      });
      const html = `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'"></head>
        <body><p id="text">Dokumentinhalt</p><script>setTimeout(function () { location.href = ${JSON.stringify(target)}; }, 400);<\/script></body></html>`;
      window.postMessage({ hp: 'host', type: 'load', html, title: 'Probe' }, window.location.origin);
      await new Promise((r) => setTimeout(r, 2500));
      return { loads, messages };
    }, target);
    const inner = page.frames().find((f) => f.parentFrame() === page.mainFrame());
    const shown = inner ? await inner.evaluate(() => document.body?.innerText ?? '').catch((e) => `nicht lesbar: ${String(e).split('\n')[0]}`) : 'kein Rahmen';
    server.close();
    const measured = {
      ...result,
      frameUrl: (inner?.url() ?? '').replace(/:\d+\//, ':<port>/'),
      shownText: shown.trim().slice(0, 120),
      hostReportedLeft: result.messages.includes('left'),
      requestsAtTarget: hits.length,
    };
    save(info, 'selbstnavigation', measured);
    // Engine-independent, the security contract (HP-SBX-006): no request reached the target and
    // nothing from outside is shown. Whether the host notices the attempt is recorded (U2).
    expect(hits).toEqual([]);
    expect(measured.shownText).not.toContain('draussen');
  });

  test('text metrics and feature support inside the sandboxed document frame', async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFile(page, SAMPLE);
    const overflow = await frameOverflow(page);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    const probe = await innerFrame(page).evaluate(() => {
      const p = document.querySelector('body p') as HTMLElement;
      const style = getComputedStyle(p);
      const canvas = document.createElement('canvas').getContext('2d')!;
      canvas.font = `${style.fontSize} ${style.fontFamily}`;
      const sample = 'Sanierung Schulhaus Mühlau – Kostenschätzung 1.234.567,89 € (Wärmerückgewinnung)';
      const css: Record<string, boolean> = {};
      for (const [name, decl] of Object.entries({
        'container-queries': 'container-type: inline-size',
        'text-wrap-balance': 'text-wrap: balance',
        'text-wrap-pretty': 'text-wrap: pretty',
        'hyphens-auto': 'hyphens: auto',
        'break-inside-avoid': 'break-inside: avoid',
        'zoom': 'zoom: 0.5',
        'field-sizing': 'field-sizing: content',
        'anchor-positioning': 'anchor-name: --a',
        'view-transition-name': 'view-transition-name: a',
        'color-mix': 'color: color-mix(in srgb, red, blue)',
        'light-dark': 'color: light-dark(black, white)',
        'interpolate-size': 'interpolate-size: allow-keywords',
      })) {
        const [prop, value] = decl.split(/:\s*/);
        css[name] = CSS.supports(prop!, value!);
      }
      css['selector-has'] = CSS.supports('selector(:has(a))');
      css['details-content'] = CSS.supports('selector(::details-content)');
      const api: Record<string, boolean> = {
        'CompressionStream deflate-raw': (() => { try { new CompressionStream('deflate-raw'); return true; } catch { return false; } })(),
        'Intl.Segmenter': typeof Intl.Segmenter === 'function',
        'crypto.subtle': typeof crypto !== 'undefined' && !!crypto.subtle,
        'fragmentDirective (text fragments)': 'fragmentDirective' in document,
        'speechSynthesis': 'speechSynthesis' in window,
        'showSaveFilePicker': 'showSaveFilePicker' in window,
        'Element.checkVisibility': typeof Element.prototype.checkVisibility === 'function',
        'Popover API': 'popover' in HTMLElement.prototype,
        'HTMLDialogElement': typeof HTMLDialogElement === 'function',
        'ResizeObserver': typeof ResizeObserver === 'function',
      };
      return {
        origin: String(window.origin),
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        sampleTextWidth: Math.round(canvas.measureText(sample).width * 10) / 10,
        hyphensComputed: style.hyphens || (style as unknown as Record<string, string>)['webkitHyphens'] || '',
        lang: document.documentElement.lang,
        css,
        api,
      };
    });
    save(info, 'merkmale', probe);
    expect(probe.origin).toBe('null');
  });
});
