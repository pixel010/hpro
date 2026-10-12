// Messung zur Bauentscheidung „Rahmenhalter“ (Paket P15, app/src/frame-host.ts) in Chromium:
//
//  A. Welche Rahmenarten erben die CSP der Hülle? Die Hülle erlaubt nur 'self'; jeder Rahmen
//     bringt eine eigene CSP mit, die genau das Testskript per Hash erlaubt. Läuft das Skript,
//     gilt nur die eigene Richtlinie; wird es blockiert, galt die der Hülle mit.
//     Rahmenarten: srcdoc, data:, blob:, navigierte Seite mit document.write.
//  B. Bedient der Service Worker eine Navigation eines Rahmens mit sandbox="allow-scripts"
//     (opake Origin) offline? Zum Vergleich ein Rahmen ohne sandbox.
//
// Ein lokaler HTTP-Server auf 127.0.0.1 (zufälliger Port) läuft nur während der Messung.
// Aufruf: PLAYWRIGHT_BROWSERS_PATH=app/.browsers node scripts/p15-rahmen-messung.mjs
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const script = "parent.postMessage({ lief: document.title }, '*');";
const hash = 'sha256-' + createHash('sha256').update(script).digest('base64');
const frameDoc = (title) =>
  `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src '${hash}'"><title>${title}</title></head><body><script>${script}</script></body></html>`;

const pages = {
  '/huelle.html': `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; frame-src 'self' blob: data:"></head><body><script src="huelle.js"></script></body></html>`,
  '/huelle.js': `
    window.ergebnis = [];
    addEventListener('message', (e) => { if (e.data && e.data.lief) ergebnis.push(e.data.lief); });
    function rahmen(setup) { const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts'); setup(f); document.body.append(f); return f; }
    const html = ${JSON.stringify(frameDoc('TITEL'))};
    rahmen((f) => (f.srcdoc = html.replace('TITEL', 'srcdoc')));
    rahmen((f) => (f.src = 'data:text/html;base64,' + btoa(html.replace('TITEL', 'data'))));
    rahmen((f) => (f.src = URL.createObjectURL(new Blob([html.replace('TITEL', 'blob')], { type: 'text/html' }))));
    const nav = rahmen((f) => (f.src = 'geschrieben.html'));
    addEventListener('message', (e) => { if (e.data === 'bereit' && e.source === nav.contentWindow) nav.contentWindow.postMessage(html.replace('TITEL', 'navigiert + document.write'), '*'); });`,
  '/geschrieben.html': `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline'"></head><body><script src="schreiben.js"></script></body></html>`,
  '/schreiben.js': `addEventListener('message', (e) => { if (e.source !== parent) return; document.open(); document.write(e.data); document.close(); }); parent.postMessage('bereit', '*');`,
  '/sw-huelle.html': `<!DOCTYPE html><html><body><script src="sw-huelle.js"></script></body></html>`,
  '/sw-huelle.js': `
    window.ergebnis = [];
    addEventListener('message', (e) => ergebnis.push(e.data));
    window.bereit = navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => 'Service Worker aktiv');
    window.laden = () => {
      const a = document.createElement('iframe'); a.setAttribute('sandbox', 'allow-scripts'); a.src = 'rahmen.html?mit-sandbox'; document.body.append(a);
      const b = document.createElement('iframe'); b.src = 'rahmen.html?ohne-sandbox'; document.body.append(b);
    };`,
  '/rahmen.html': `<!DOCTYPE html><title>vom Netz</title><script src="rahmen.js"></script>`,
  '/rahmen.js': `parent.postMessage(location.search + ': ' + document.title, '*');`,
  '/sw.js': `
    self.addEventListener('install', () => self.skipWaiting());
    self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
    self.addEventListener('fetch', (e) => {
      const u = new URL(e.request.url);
      if (u.pathname === '/rahmen.html') e.respondWith(new Response('<!DOCTYPE html><title>vom Service Worker</title><script src="rahmen.js"></script>', { headers: { 'content-type': 'text/html' } }));
      else if (u.pathname === '/rahmen.js') e.respondWith(new Response("parent.postMessage(location.search + ': ' + document.title, '*');", { headers: { 'content-type': 'text/javascript' } }));
    });`,
};

const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (!(path in pages)) {
    res.statusCode = 404;
    res.end();
    return;
  }
  res.setHeader('content-type', path.endsWith('.js') ? 'text/javascript' : 'text/html');
  res.end(pages[path]);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
console.log(`Chromium ${browser.version()}`);

const page = await browser.newPage();
await page.goto(`${base}/huelle.html`);
await page.waitForTimeout(2000);
const lief = await page.evaluate(() => window.ergebnis);
console.log('\nA. Testskript mit eigener CSP im Rahmen, Hülle erlaubt nur script-src \'self\':');
for (const art of ['srcdoc', 'data', 'blob', 'navigiert + document.write']) {
  console.log(`   ${art.padEnd(28)} ${lief.includes(art) ? 'läuft (erbt die Hüllen-CSP nicht)' : 'blockiert (erbt die Hüllen-CSP)'}`);
}

const context = await browser.newContext();
const swPage = await context.newPage();
await swPage.goto(`${base}/sw-huelle.html`);
console.log(`\nB. ${await swPage.evaluate(() => window.bereit)}; Seite neu geladen, dann offline:`);
await swPage.reload();
await swPage.evaluate(() => window.bereit);
await context.setOffline(true);
await swPage.evaluate(() => window.laden());
await swPage.waitForTimeout(2000);
const geladen = await swPage.evaluate(() => window.ergebnis);
for (const art of ['?mit-sandbox', '?ohne-sandbox']) {
  const hit = geladen.find((x) => x.startsWith(art));
  console.log(`   Rahmen ${art.slice(1).padEnd(13)} ${hit ? `geladen (${hit.split(': ')[1]})` : 'nicht geladen (offline, Service Worker bedient ihn nicht)'}`);
}
await browser.close();
server.close();
