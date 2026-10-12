/**
 * Live content (package P15, Zusage 2 of docs/10): components run in the sandbox, reach no
 * network and store nothing outside the document; the sample with video and animation renders,
 * and without scripts its static equivalent stays fully readable; reduced motion is respected.
 *
 * With P15_BELEGE=1 the tests write their measurements to docs/belege/P15/messungen/ and
 * screenshots to docs/belege/P15/bilder/ (scripts/belege-p15.sh). P15_BEOBACHTUNG_S sets how
 * long the network is watched (default 5 s; the evidence run uses 60 s as HPL-SBX-003 asks).
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContainer, readContainer, readZip, writeZip } from '../../kern/src/index.ts';
import { docFrame, innerFrame, openFile, waitForFrame } from './helpers.js';

const LIVE_SAMPLE = fileURLToPath(new URL('../dist/lebendig.hpro', import.meta.url));
const BELEGE = fileURLToPath(new URL('../../docs/belege/P15/', import.meta.url));
const TMP = fileURLToPath(new URL('../test-results/p15/', import.meta.url));
const WATCH_MS = Number(process.env['P15_BEOBACHTUNG_S'] ?? '5') * 1000;
const RECORD = process.env['P15_BELEGE'] === '1';

function record(name: string, data: unknown): void {
  if (!RECORD) return;
  mkdirSync(join(BELEGE, 'messungen'), { recursive: true });
  writeFileSync(join(BELEGE, 'messungen', `${name}.json`), JSON.stringify(data, null, 2) + '\n');
}

async function shot(page: Page, name: string): Promise<void> {
  if (!RECORD) return;
  mkdirSync(join(BELEGE, 'bilder'), { recursive: true });
  await page.screenshot({ path: join(BELEGE, 'bilder', `${name}.png`) });
}

function tmpFile(name: string, bytes: Uint8Array): string {
  mkdirSync(TMP, { recursive: true });
  const path = join(TMP, name);
  writeFileSync(path, bytes);
  return path;
}

/** Motion state of the document frame: running animations, media, what the component learned. */
async function motionState(page: Page) {
  return innerFrame(page).evaluate(() => {
    const media = Array.from(document.querySelectorAll('video, audio')) as HTMLMediaElement[];
    return {
      prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      rootMotion: document.documentElement.getAttribute('data-hp-motion'),
      componentMotion: document.querySelector('hp-chart')?.getAttribute('motion') ?? null,
      animations: document.getAnimations().length,
      runningAnimations: document.getAnimations().filter((a) => a.playState === 'running').length,
      media: media.map((m) => ({ id: m.id, paused: m.paused, currentTime: Math.round(m.currentTime * 100) / 100, muted: m.muted })),
    };
  });
}

// ---------------------------------------------------------------- the sample document

test.describe('Beispiel lebendig.hpro (P15)', () => {
  test('rendert mit Video, Animation, Ton und ausgeführter Komponente', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFile(page, LIVE_SAMPLE);
    await expect(page.locator('#doc-title')).toHaveText('Dachsanierung Haus Nr. 12 – Bauablauf in Bild, Ton und Zahlen');
    const frame = docFrame(page);
    await expect(frame.locator('hp-chart')).toHaveAttribute('status', 'bereit');
    await expect(page.locator('#live-status')).toHaveText('Lebendig: 1 Komponente in der Sandbox');
    await expect(frame.locator('.hp-component-note')).toHaveCount(0);
    // The video plays (muted autoplay started by the agent) and advances.
    await expect.poll(async () => (await motionState(page)).media.find((m) => m.id === 'zeitraffer-video')?.currentTime ?? 0, { timeout: 10_000 }).toBeGreaterThan(0.5);
    const state = await motionState(page);
    expect(state.rootMotion).toBe('run');
    expect(state.runningAnimations).toBeGreaterThanOrEqual(5);
    expect(state.media.find((m) => m.id === 'zeitraffer-video')).toMatchObject({ paused: false, muted: true });
    expect(state.media.find((m) => m.id === 'signal-ton')).toMatchObject({ paused: true, currentTime: 0 });
    // The chart in the shadow root shows the values of the table.
    const bars = frame.locator('hp-chart svg text.value');
    await expect(bars).toHaveText(['3.200,00 €', '2.900,00 €', '6.850,00 €', '14.400,00 €', '5.100,00 €', '1.250,00 €']);
    const csp = await innerFrame(page).evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '');
    const sandbox = await page.frameLocator('#doc-host').locator('#doc-frame').getAttribute('sandbox');
    record('01-darstellung', { sandbox, csp, ...state, chartValues: await bars.allTextContents() });
    await shot(page, '01-lebendig-1280');
    // Poster frame of the video and the chart, scrolled into view.
    await frame.locator('#aufwand').scrollIntoViewIfNeeded();
    await shot(page, '02-diagramm-1280');
  });

  test('ohne Skripte bleibt das statische Äquivalent vollständig lesbar (HP-SBX-004, HP-INH-013)', async ({ page, browser }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFile(page, LIVE_SAMPLE);
    const frame = docFrame(page);
    await expect(frame.locator('hp-chart')).toHaveAttribute('status', 'bereit');
    // What the live version shows: chart values (both columns) and all text of the document.
    const liveValues = new Set<string>(await frame.locator('hp-chart svg text.value').allTextContents());
    await frame.getByRole('button', { name: 'Stunden' }).click();
    for (const v of await frame.locator('hp-chart svg text.value').allTextContents()) liveValues.add(v);
    for (const v of await frame.locator('hp-chart svg text.label').allTextContents()) liveValues.add(v);
    const liveText = await innerFrame(page).evaluate(() => Array.from(document.querySelectorAll('main h1, main h2, main p, main figcaption')).map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));

    // The same container, unpacked and opened directly in a browser with JavaScript off: no
    // reader, no agent, no component (as an EPUB reading system without scripting would).
    const container = await readContainer(new Uint8Array(readFileSync(LIVE_SAMPLE)));
    const dir = join(TMP, 'entpackt');
    rmSync(dir, { recursive: true, force: true });
    for (const [path, bytes] of container.files) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), bytes);
    }
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
    const plain = await context.newPage();
    await plain.goto(`file://${join(dir, 'content/index.xhtml')}`);
    const result = await plain.evaluate(async () => {
      const chart = document.querySelector('hp-chart')!;
      const video = document.querySelector('video')!;
      const poster = new Image();
      poster.src = video.getAttribute('poster') ?? '';
      const imgs = Array.from(document.querySelectorAll('img')).filter((i) => !i.closest('video'));
      return {
        scriptsRan: chart.shadowRoot !== null || customElements.get('hp-chart') !== undefined,
        chartText: (chart.textContent ?? '').replace(/\s+/g, ' ').trim(),
        images: imgs.map((i) => ({ src: i.getAttribute('src'), complete: i.complete, width: i.naturalWidth })),
        videoPoster: video.getAttribute('poster'),
        videoPaused: video.paused,
        videoBox: { w: Math.round(video.getBoundingClientRect().width), h: Math.round(video.getBoundingClientRect().height) },
        text: Array.from(document.querySelectorAll('main h1, main h2, main p, main figcaption')).map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()),
        animations: document.getAnimations().length,
      };
    });
    await plain.screenshot({ path: join(TMP, 'ohne-skript.png'), fullPage: true });
    if (RECORD) {
      mkdirSync(join(BELEGE, 'bilder'), { recursive: true });
      await plain.screenshot({ path: join(BELEGE, 'bilder', '03-ohne-skript-ganzseite.png'), fullPage: true });
    }
    await context.close();

    expect(result.scriptsRan).toBe(false);
    expect(result.images.every((i) => i.complete && i.width > 0)).toBe(true);
    expect(result.videoPoster).toBe('media/zeitraffer-standbild.png');
    expect(result.videoBox.w).toBeGreaterThan(300);
    // Every value the live chart shows is in the static equivalent (HP-SBX-004).
    const missing = [...liveValues].filter((v) => !result.chartText.includes(v));
    expect(missing).toEqual([]);
    // Every heading, paragraph and caption of the live version is there without scripts.
    const lost = liveText.filter((t) => !result.text.includes(t));
    expect(lost).toEqual([]);
    record('02-ohne-skript', { liveValues: [...liveValues], missingInStatic: missing, textBlocksLive: liveText.length, textBlocksStatic: result.text.length, textBlocksLost: lost, ...result, chartText: result.chartText });
  });

  test('im Reader abgeschaltet: statisches Äquivalent mit Kennzeichnung', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFile(page, LIVE_SAMPLE);
    await page.getByRole('button', { name: 'Darstellung' }).click();
    await page.getByLabel(/Lebendige Inhalte ausführen/).uncheck();
    await page.getByRole('button', { name: 'Schließen' }).click();
    await waitForFrame(page);
    const frame = docFrame(page);
    await expect(frame.locator('.hp-component-note')).toHaveText('Komponente hp-chart nicht ausgeführt (lebendige Inhalte sind im Reader abgeschaltet). Angezeigt wird die statische Fassung.');
    await expect(frame.locator('#aufwand-tabelle')).toBeVisible();
    await expect(frame.locator('#aufwand-bild img')).toBeVisible();
    expect(await innerFrame(page).evaluate(() => customElements.get('hp-chart') === undefined && document.querySelectorAll('script').length)).toBe(1);
    await expect(page.locator('#live-status')).toHaveText('Statische Fassung');
    await frame.locator('#aufwand').scrollIntoViewIfNeeded();
    await shot(page, '04-reader-statisch');
  });
});

// ---------------------------------------------------------------- reduced motion

test.describe('Reduzierte Bewegung (HP-INH-014, HP-SBX-014, HPL-SBX-011)', () => {
  const WAIT_MS = 10_000;

  test('Systemeinstellung „Bewegung reduzieren“: nach 10 s keine Animation, kein Medium', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await openFile(page, LIVE_SAMPLE);
    await expect(docFrame(page).locator('hp-chart')).toHaveAttribute('status', 'bereit');
    await page.waitForTimeout(WAIT_MS);
    const state = await motionState(page);
    expect(state.prefersReducedMotion).toBe(true);
    expect(state.rootMotion).toBe('reduce');
    expect(state.componentMotion).toBe('reduziert');
    expect(state.animations).toBe(0);
    expect(state.media.every((m) => m.paused && m.currentTime === 0)).toBe(true);
    await expect(page.locator('#btn-motion')).toBeHidden();
    record('03-reduziert-system', { waitedMs: WAIT_MS, ...state });
    await shot(page, '05-reduziert-system');
    // Switching the chart does not animate either.
    await docFrame(page).getByRole('button', { name: 'Stunden' }).click();
    expect((await motionState(page)).animations).toBe(0);
    await context.close();
  });

  test('Kontrolle ohne Einstellung: Bewegung läuft, und der Nutzer kann sie anhalten (WCAG 2.2.2)', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'no-preference', viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await openFile(page, LIVE_SAMPLE);
    await expect(docFrame(page).locator('hp-chart')).toHaveAttribute('status', 'bereit');
    await page.waitForTimeout(WAIT_MS);
    const running = await motionState(page);
    expect(running.prefersReducedMotion).toBe(false);
    expect(running.componentMotion).toBe('erlaubt');
    expect(running.runningAnimations).toBeGreaterThanOrEqual(5);
    expect(running.media.find((m) => m.id === 'zeitraffer-video')?.paused).toBe(false);
    await page.getByRole('button', { name: 'Bewegung anhalten' }).click();
    await expect(page.getByRole('button', { name: 'Bewegung fortsetzen' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await motionState(page)).runningAnimations).toBe(0);
    const paused = await motionState(page);
    expect(paused.rootMotion).toBe('paused');
    expect(paused.media.every((m) => m.paused)).toBe(true);
    await page.getByRole('button', { name: 'Bewegung fortsetzen' }).click();
    await expect.poll(async () => (await motionState(page)).runningAnimations).toBeGreaterThanOrEqual(5);
    record('04-kontrolle-und-anhalten', { waitedMs: WAIT_MS, running, paused, resumed: await motionState(page) });
    await context.close();
  });

  test('Reader-Einstellung „immer reduzieren“ wirkt auch ohne Systemeinstellung', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'no-preference', viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await openFile(page, LIVE_SAMPLE);
    await page.getByRole('button', { name: 'Darstellung' }).click();
    await page.getByLabel('Bewegung (Animation, Video)').selectOption('reduce');
    await page.getByRole('button', { name: 'Schließen' }).click();
    await waitForFrame(page);
    await expect(docFrame(page).locator('hp-chart')).toHaveAttribute('status', 'bereit');
    await page.waitForTimeout(WAIT_MS);
    const state = await motionState(page);
    expect(state.prefersReducedMotion).toBe(false);
    expect(state.rootMotion).toBe('reduce');
    expect(state.componentMotion).toBe('reduziert');
    expect(state.animations).toBe(0);
    expect(state.media.every((m) => m.paused)).toBe(true);
    record('05-reduziert-reader', { waitedMs: WAIT_MS, ...state });
    await context.close();
  });
});

// ---------------------------------------------------------------- data channel

test('Datenkanal: Ansicht wird nur im Dokument gespeichert (HP-SBX-007, HP-SBX-008)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openFile(page, LIVE_SAMPLE);
  const frame = docFrame(page);
  await expect(frame.locator('hp-chart')).toHaveAttribute('status', 'bereit');
  await expect(page.locator('#btn-live-save')).toBeHidden();
  await frame.getByRole('button', { name: 'Stunden' }).click();
  await frame.getByRole('button', { name: 'Absteigend sortieren' }).click();
  await expect(frame.locator('hp-chart').locator('p.hint')).toHaveText('Ansicht im Dokument vermerkt (wird mit dem Dokument gespeichert).');
  await expect(frame.locator('hp-chart svg text.value')).toHaveText(['96', '56', '40', '32', '24', '8']);
  await expect(page.locator('#live-status')).toHaveText('Lebendig: 1 Komponente in der Sandbox · Daten geändert');
  const storage = await innerFrame(page).evaluate(() => {
    const out: Record<string, string> = {};
    for (const [name, f] of [
      ['localStorage', () => localStorage.length],
      ['sessionStorage', () => sessionStorage.length],
      ['indexedDB', () => indexedDB.open('x')],
      ['cookie', () => document.cookie],
    ] as const) {
      try {
        f();
        out[name] = 'erreichbar';
      } catch (e) {
        out[name] = `blockiert (${(e as Error).name})`;
      }
    }
    return out;
  });
  expect(Object.values(storage).every((v) => v.startsWith('blockiert'))).toBe(true);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Daten speichern' }).click();
  const saved = await (await download).path();
  const back = await readContainer(new Uint8Array(readFileSync(saved)));
  expect(back.integrity.ok).toBe(true);
  const data = JSON.parse(new TextDecoder().decode(back.files.get('data/diagramm.json')!)) as unknown;
  expect(data).toEqual({ ansicht: 'stunden', sortierung: 'absteigend' });
  // Reopened, the component shows the stored view.
  await openFile(page, tmpFile('lebendig-gespeichert.hpro', new Uint8Array(readFileSync(saved))));
  await expect(docFrame(page).locator('hp-chart')).toHaveAttribute('status', 'bereit');
  await expect(docFrame(page).locator('hp-chart svg text.value')).toHaveText(['96', '56', '40', '32', '24', '8']);
  record('06-datenkanal', { storage, savedData: data, integrityOk: back.integrity.ok, changedFiles: ['data/diagramm.json'] });
});

test('veränderte Komponente läuft nicht; statisches Äquivalent mit Kennzeichnung (HP-SBX-010, HPL-SBX-006)', async ({ page }) => {
  const entries = await readZip(new Uint8Array(readFileSync(LIVE_SAMPLE)));
  const changed = entries.map((e) => {
    let data = e.data;
    if (e.name === 'components/hp-chart@0.1.0/hp-chart.js') data = new TextEncoder().encode(new TextDecoder().decode(e.data).replace("'use strict';", "'use strict'; /* verändert */"));
    return { name: e.name, data, compression: e.name === 'mimetype' ? ('store' as const) : ('auto' as const) };
  });
  const file = tmpFile('lebendig-veraendert.hpro', await writeZip(changed, { modified: new Date('2026-10-12T11:00:00Z') }));
  await openFile(page, file);
  const frame = docFrame(page);
  await expect(frame.locator('.hp-component-note')).toHaveText('Komponente hp-chart nicht ausgeführt (Komponente verändert: SHA-256 der Skriptdatei weicht von integrity ab). Angezeigt wird die statische Fassung.');
  await expect(frame.locator('#aufwand-tabelle')).toBeVisible();
  expect(await innerFrame(page).evaluate(() => customElements.get('hp-chart') === undefined)).toBe(true);
  record('07-komponente-veraendert', { note: await frame.locator('.hp-component-note').textContent(), executed: false });
});

// ---------------------------------------------------------------- no network from the sandbox

/**
 * A test component that tries the usual ways out of a document: fetch, XMLHttpRequest,
 * WebSocket, EventSource, sendBeacon, image, script, stylesheet, @import, font, prefetch link,
 * nested frame, form submission, new window and navigation of the frame or the shell. Every
 * target is a counting server on 127.0.0.1 (another port than the reader). The same code run in
 * an ordinary page reaches the server (positive control), so the measurement can see requests.
 */
function attempts(target: string): string {
  return `(function () {
  'use strict';
  var T = ${JSON.stringify(target)};
  var log = [];
  function note(name, outcome) { log.push(name + ': ' + outcome); }
  function attempt(name, fn) {
    try { var r = fn(); note(name, 'aufgerufen'); return r; } catch (e) { note(name, 'Ausnahme ' + e.name); }
  }
  function settle(name, p) {
    if (p && typeof p.then === 'function') p.then(function () { note(name + ' (Antwort)', 'erhalten'); }, function (e) { note(name + ' (Antwort)', 'abgelehnt ' + e.name); });
  }
  settle('fetch', attempt('fetch', function () { return fetch(T + '/fetch'); }));
  attempt('XMLHttpRequest', function () { var x = new XMLHttpRequest(); x.open('GET', T + '/xhr'); x.send(); });
  attempt('WebSocket', function () { new WebSocket(T.replace('http', 'ws') + '/ws'); });
  attempt('EventSource', function () { new EventSource(T + '/sse'); });
  attempt('sendBeacon', function () { return navigator.sendBeacon(T + '/beacon', 'x'); });
  attempt('Image', function () { new Image().src = T + '/bild.png'; });
  attempt('script', function () { var s = document.createElement('script'); s.src = T + '/skript.js'; document.head.append(s); });
  attempt('link stylesheet', function () { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = T + '/stil.css'; document.head.append(l); });
  attempt('link prefetch', function () { var l = document.createElement('link'); l.rel = 'prefetch'; l.href = T + '/prefetch'; document.head.append(l); });
  attempt('@import und font-face', function () { var s = document.createElement('style'); s.textContent = '@import url(' + T + '/import.css); @font-face { font-family: x; src: url(' + T + '/font.woff2); } body { font-family: x; }'; document.head.append(s); });
  attempt('iframe', function () { var f = document.createElement('iframe'); f.src = T + '/rahmen'; document.body.append(f); });
  attempt('form submit', function () { var f = document.createElement('form'); f.action = T + '/formular'; f.method = 'post'; document.body.append(f); f.submit(); });
  attempt('window.open', function () { return window.open(T + '/fenster'); });
  attempt('Navigation der Hülle', function () { top.location.href = T + '/oben'; });
  attempt('localStorage', function () { return localStorage.length; });
  attempt('indexedDB', function () { return indexedDB.open('x'); });
  setTimeout(function () {
    var out = document.getElementById('ergebnis');
    if (out) out.textContent = log.join('\\n');
    document.documentElement.setAttribute('data-test-fertig', 'ja');
  }, 1500);
  // Last, after the log is written: the frame tries to navigate itself away from the document.
  setTimeout(function () { location.href = T + '/navigation'; }, 3000);
})();
`;
}

async function attackContainer(target: string): Promise<Uint8Array> {
  const page = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="de-AT" xml:lang="de-AT"><head><meta charset="UTF-8"/><title>Netzprobe</title>
<script src="../components/x-pruef-netz@1.0.0/x-pruef-netz.js"></script></head>
<body><h1 id="t">Netzprobe</h1><x-pruef-netz id="probe"><p>Statische Fassung: die Komponente versucht Netzzugriffe.</p></x-pruef-netz>
<pre id="ergebnis">noch nicht gelaufen</pre></body></html>
`;
  const created = await createContainer({
    id: 'urn:uuid:00000000-0000-4000-8000-0000000015a1',
    title: 'Netzprobe',
    language: 'de-AT',
    modified: '2026-10-12T11:00:00Z',
    profile: 'interactive',
    readingOrder: ['content/index.xhtml'],
    toc: { title: 'Inhalt', entries: [{ title: 'Netzprobe', href: 'content/index.xhtml#t' }] },
    resources: [
      { path: 'content/index.xhtml', mediaType: 'application/xhtml+xml', data: page },
      { path: 'components/x-pruef-netz@1.0.0/x-pruef-netz.js', mediaType: 'text/javascript', data: attempts(target) },
    ],
    components: [{ name: 'x-pruef-netz', version: '1.0.0', url: 'components/x-pruef-netz@1.0.0/x-pruef-netz.js' }],
  });
  return created.bytes;
}

test.describe('Kein Netz aus der Sandbox (HP-SBX-006, HPL-SBX-003)', () => {
  let server: Server;
  let target = '';
  const hits: string[] = [];
  let connections = 0;

  test.beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push(`${req.method} ${req.url}`);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end('ok');
    });
    server.on('connection', () => connections++);
    server.on('upgrade', (req, socket) => {
      hits.push(`UPGRADE ${req.url}`);
      socket.destroy();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    target = `http://127.0.0.1:${address.port}`;
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('Komponente in der Sandbox erreicht kein Netz; dieselben Aufrufe ohne Sandbox schon', async ({ page, browser }) => {
    test.setTimeout(WATCH_MS * 2 + 60_000);
    // Positive control: the same code in an ordinary page of another origin reaches the server.
    hits.length = 0;
    connections = 0;
    const control = await browser.newContext();
    const plain = await control.newPage();
    await plain.goto(`${target}/kontrolle`);
    await plain.setContent(`<!DOCTYPE html><html><body><pre id="ergebnis"></pre></body></html>`);
    await plain.addScriptTag({ content: attempts(target).replace("top.location.href = T + '/oben';", "void 0;").replace("location.href = T + '/navigation';", 'void 0;') });
    await plain.waitForTimeout(3000);
    const controlHits = [...hits].filter((h) => h !== 'GET /kontrolle');
    const controlConnections = connections;
    await control.close();
    expect(controlHits.length).toBeGreaterThanOrEqual(8);

    // The reader: the component is declared, verified and runs in the document frame.
    hits.length = 0;
    connections = 0;
    // Chromium creates request objects for blocked loads too; what counts is that none completed
    // (requestfinished) and that the server saw nothing. Failed ones are kept with their reason.
    const outside = (u: string) => !u.startsWith('http://127.0.0.1:4317/') && !u.startsWith('data:') && !u.startsWith('blob:') && u !== 'about:srcdoc';
    const finished: string[] = [];
    const failed: string[] = [];
    page.on('requestfinished', (r) => {
      if (outside(r.url())) finished.push(r.url());
    });
    page.on('requestfailed', (r) => {
      if (outside(r.url())) failed.push(`${r.url().replace(/:\d+\//, ':<port>/')} → ${r.failure()?.errorText ?? '?'}`);
    });
    const popups: string[] = [];
    page.on('popup', (p) => popups.push(p.url()));
    const csp: string[] = [];
    page.on('console', (m) => {
      if (/Content Security Policy|sandbox|Blocked/i.test(m.text())) csp.push(m.text().replace(/:\d+\/[^ ]*/g, ':<port>/…').slice(0, 220));
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFile(page, tmpFile('netzprobe.hpro', await attackContainer(target)));
    await expect(docFrame(page).locator('html')).toHaveAttribute('data-test-fertig', 'ja', { timeout: 15_000 });
    const log = (await docFrame(page).locator('#ergebnis').textContent()) ?? '';
    // The self-navigation is blocked; the reader stops the component and shows the document
    // again with its static equivalent.
    await expect(docFrame(page).locator('.hp-component-note')).toHaveText('Komponente x-pruef-netz nicht ausgeführt (Komponente beendet: hat versucht, den Dokumentrahmen zu verlassen). Angezeigt wird die statische Fassung.', { timeout: 15_000 });
    await expect(page.locator('#live-status')).toHaveText('Komponente beendet, statische Fassung');
    await page.waitForTimeout(WATCH_MS);
    // The reader is still there and usable.
    await expect(page.locator('#doc-title')).toHaveText('Netzprobe');
    await expect(page).toHaveURL('http://127.0.0.1:4317/');
    expect(page.frames().some((f) => f.url().startsWith(target))).toBe(false);
    await page.getByRole('button', { name: 'Info' }).click();
    await expect(page.getByRole('dialog', { name: 'Über dieses Dokument' })).toBeVisible();

    const result = {
      ziel: target.replace(/:\d+$/, ':<port>'),
      beobachtetMs: WATCH_MS,
      kontrolle: { anfragen: controlHits.length, verbindungen: controlConnections, liste: controlHits },
      sandbox: { anfragenAmZiel: hits.length, verbindungenAmZiel: connections, abgeschlosseneAnfragenDesBrowsers: finished, abgebrocheneAnfragenDesBrowsers: failed, popups, protokollDerKomponente: log.split('\n'), danach: await page.locator('#live-status').textContent() },
      cspMeldungen: [...new Set(csp)].slice(0, 30),
    };
    record('08-netz', result);
    expect(log).toContain('fetch: aufgerufen');
    expect(hits).toEqual([]);
    expect(connections).toBe(0);
    expect(finished).toEqual([]);
    expect(popups).toEqual([]);
  });
});
