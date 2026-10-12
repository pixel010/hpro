/// <reference lib="webworker" />
/**
 * Service worker of the reader: keeps the application shell available offline.
 *
 * Documents are never fetched over the network (they come from the file picker, drag and
 * drop or the bundled sample), so the worker only caches the shell. The precache list and
 * the version are written in at build time (vite.config.ts, plugin hpro-sw-precache).
 */
declare const self: ServiceWorkerGlobalScope;
export {};

const PRECACHE: string[] = ['__HPRO_PRECACHE__'];
const VERSION: string = '__HPRO_VERSION__';
const CACHE = `hpro-reader-${VERSION}`;
const SHELL = new URL('./', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE.map((path) => new Request(new URL(path, self.registration.scope), { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('hpro-reader-') && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Every navigation inside the scope gets the shell (the reader has no server routes),
      // except the frame host of the document frame (frame.html, P15). `ignoreVary`: servers answer with `Vary: Origin`, and module scripts carry an Origin
      // header that the precache requests did not have; all cached files are our own.
      const key = request.mode === 'navigate' && !url.pathname.endsWith('/frame.html') ? SHELL : request;
      const hit = await cache.match(key, { ignoreSearch: true, ignoreVary: true });
      if (hit) return hit;
      return fetch(request);
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'hpro:version') event.source?.postMessage({ hpro: 'version', version: VERSION, files: PRECACHE.length });
});
