// IPC isolation test of the Capacitor comparison shell (mobil/capacitor, P12): the same attack
// as mode `ipc` of android-probe.js, aimed at Capacitor's bridge instead of Tauri's. The debug
// build evaluates this file in the main frame once the page has loaded (E2e.java).
//
// Capacitor's ways in: `window.Capacitor` (native-bridge.js, injected by
// addDocumentStartJavaScript for the app origin), `window.androidBridge` (WebMessageListener for
// the allowed origins, or a JavascriptInterface on old WebViews) and the local server
// (https://localhost).
(async () => {
  const C = window.Capacitor;
  const call = (method, options) => C.nativePromise('E2e', method, options);
  const report = (step, data) => call('report', { value: { step, ...data } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (pred, ms) => {
    for (let t = 0; t < ms; t += 100) {
      const v = pred();
      if (v) return v;
      await sleep(100);
    }
    return null;
  };
  try {
    await report('driver-start', { href: location.href, userAgent: navigator.userAgent, capacitor: typeof C, androidBridge: typeof window.androidBridge });
    const n = await call('canary', { origin: 'shell' });
    await report('control-canary', { n });
    document.getElementById('btn-sample')?.click();
    const shown = await waitFor(() => document.querySelector('#viewer[data-state="ready"], [data-state="ready"]'), 60000);
    await report('launch-document', { ready: !!shown, title: document.getElementById('doc-title')?.textContent ?? '' });
    const host = document.getElementById('doc-host');
    let hostBridge;
    try {
      hostBridge = typeof host.contentWindow.Capacitor;
    } catch (e) {
      hostBridge = 'blocked: ' + e.name;
    }
    await report('frame-host', { src: host.getAttribute('src'), sandbox: host.getAttribute('sandbox'), capacitor: hostBridge });

    const attack = `<!doctype html><html><head><meta charset="utf-8"><title>Angriff</title></head><body><p>Angriffsseite im Dokumentrahmen</p><script>
(async () => {
  const out = {};
  const P = (k, v) => (out[k] = v);
  const guard = (k, f) => { try { P(k, f()); } catch (e) { P(k, 'blocked: ' + e.name); } };
  const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout ' + ms + ' ms')), ms))]);
  P('origin', String(self.origin));
  P('sandboxedFrame', String(window !== top));
  guard('capacitor', () => typeof window.Capacitor);
  guard('capacitorNativePromise', () => typeof (window.Capacitor && window.Capacitor.nativePromise));
  guard('androidBridge', () => typeof window.androidBridge);
  guard('androidBridgePostMessage', () => typeof (window.androidBridge && window.androidBridge.postMessage));
  guard('parentCapacitor', () => typeof parent.Capacitor);
  guard('topCapacitor', () => typeof top.Capacitor);
  guard('topDocument', () => typeof top.document.body);
  if (window.Capacitor && typeof window.Capacitor.nativePromise === 'function') {
    try {
      const r = await within(window.Capacitor.nativePromise('E2e', 'canary', { origin: 'frame-capacitor' }), 8000);
      P('nativePromise canary', 'ANSWER ' + JSON.stringify(r));
    } catch (e) { P('nativePromise canary', 'rejected: ' + String(e).slice(0, 160)); }
  }
  let posted = 0;
  if (window.androidBridge && typeof window.androidBridge.postMessage === 'function') {
    for (const id of ['1', '2', '3']) {
      try {
        window.androidBridge.postMessage(JSON.stringify({ callbackId: id, pluginId: 'E2e', methodName: 'canary', options: { origin: 'frame-bridge' }, type: 'message' }));
        posted++;
      } catch (e) { P('bridgePostError', e.name); }
    }
  }
  P('forgedBridgeMessages', posted);
  for (const url of ['https://localhost/index.html', 'https://localhost/_capacitor_file_/data/data/org.hpro.reader.capacitor/files/e2e/record.jsonl', 'https://example.org/']) {
    try {
      const r = await within(fetch(url), 8000);
      P('fetch ' + url, 'status ' + r.status);
    } catch (e) { P('fetch ' + url, 'blocked: ' + e.name); }
  }
  const f = document.createElement('iframe');
  f.src = 'https://localhost/index.html';
  document.body.append(f);
  await new Promise((r) => setTimeout(r, 1500));
  guard('nestedAppFrame', () => typeof f.contentWindow.Capacitor);
  guard('windowOpen', () => String(window.open('https://localhost/index.html')));
  guard('topNavigation', () => { top.location.href = 'https://localhost/index.html#angriff'; return 'no exception'; });
  parent.postMessage({ hpProbe: 'result', out }, '*');
})();
</script></body></html>`;

    let result;
    window.addEventListener('message', (e) => {
      if (e.data && e.data.hpProbe === 'result') result = e.data.out;
    });
    host.contentWindow.postMessage({ hp: 'host', type: 'load', html: attack, title: 'Angriff' }, location.origin);
    const got = await waitFor(() => result, 90000);
    await report('attack', { received: !!got, result: result ?? null });
    await sleep(3000);
    const after = await call('canary', { origin: 'shell-after' });
    await report('control-canary-after', { n: after });
    await report('top-location', { href: location.href });
  } catch (e) {
    try {
      await report('driver-error', { error: String((e && e.stack) || e) });
    } catch {
      console.error('hpro-e2e driver-error', e);
    }
  }
  await report('driver-end', {});
  await call('exit', {});
})();
