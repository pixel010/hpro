/**
 * Registers the service worker (src/sw.ts) in the production build. Once it is active the
 * whole reader shell is cached and starts without a network (HP-RS-001).
 */
export function registerServiceWorker(status: HTMLElement): void {
  if (!('serviceWorker' in navigator)) {
    status.textContent = 'Offline-Betrieb: Dieser Browser unterstützt keine Service Worker.';
    return;
  }
  if (!import.meta.env.PROD) {
    status.textContent = 'Offline-Betrieb ist im Entwicklungsmodus abgeschaltet.';
    return;
  }
  navigator.serviceWorker
    .register('./sw.js', { scope: './' })
    .then(() => navigator.serviceWorker.ready)
    .then(() => {
      document.documentElement.dataset['offline'] = 'ready';
      status.textContent = 'Offline bereit: Der Reader startet auch ohne Netzverbindung.';
    })
    .catch((err: unknown) => {
      status.textContent = `Offline-Betrieb nicht verfügbar: ${String(err)}`;
    });
}
