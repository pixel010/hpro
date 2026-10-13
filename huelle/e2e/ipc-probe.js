// Driver of the IPC isolation test (huelle/scripts/e2e-ipc.sh). The e2e build of the shell
// evaluates this file in the main frame of the reader once the page has loaded.
//
// 1. Positive control: the reader window calls the canary command; it must work.
// 2. Restriction: commands no capability grants (core, plugins, unknown) must be rejected.
// 3. The document given on the command line must render (normal launch path).
// 4. Worst case for the document frame: an attack page whose script runs in the sandboxed
//    document frame (same frame host, same sandbox and frame policy as every document; unlike a
//    real document its inline script is allowed). It tries every known way to the Tauri IPC
//    and reports what it saw. Afterwards the canary count must still be 1.
(async () => {
  const T = window.__TAURI_INTERNALS__;
  const report = (step, data) => T.invoke('e2e_report', { value: { step, ...data } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (pred, ms) => {
    for (let t = 0; t < ms; t += 100) {
      if (pred()) return true;
      await sleep(100);
    }
    return false;
  };
  try {
    await report('driver-start', { href: location.href, userAgent: navigator.userAgent });

    const n = await T.invoke('e2e_canary', { origin: 'shell' });
    await report('control-canary', { n });

    for (const cmd of ['plugin:dialog|open', 'plugin:dialog|save', 'plugin:event|listen', 'plugin:window|close', 'plugin:webview|print', 'plugin:app|version', 'plugin:fs|read_file', 'plugin:shell|execute', 'plugin:single-instance|x', 'not_a_command']) {
      try {
        const r = await T.invoke(cmd, {});
        await report('acl', { cmd, result: 'ALLOWED', answer: String(r) });
      } catch (e) {
        await report('acl', { cmd, result: 'rejected', error: String(e) });
      }
    }

    const ready = await waitFor(() => document.querySelector('#viewer[data-state="ready"], [data-state="ready"]'), 30000);
    const title = document.getElementById('doc-title')?.textContent ?? '';
    await report('launch-document', { ready, title, desktop: document.documentElement.dataset.desktop ?? '' });

    const host = document.getElementById('doc-host');
    let hostBridge;
    try {
      hostBridge = typeof host.contentWindow.__TAURI_INTERNALS__;
    } catch (e) {
      hostBridge = 'blocked: ' + e.name;
    }
    await report('frame-host', { src: host.getAttribute('src'), tauriInternals: hostBridge });

    const attack = `<!doctype html><html><head><meta charset="utf-8"><title>Angriff</title></head><body><p>Angriffsseite im Dokumentrahmen</p><script>
(async () => {
  const out = {};
  const P = (k, v) => (out[k] = v);
  const guard = (k, f) => { try { P(k, f()); } catch (e) { P(k, 'blocked: ' + e.name); } };
  P('origin', String(self.origin));
  P('sandboxedFrame', String(window !== top));
  guard('tauriInternals', () => typeof window.__TAURI_INTERNALS__);
  guard('tauriGlobal', () => typeof window.__TAURI__);
  guard('windowIpc', () => typeof window.ipc);
  guard('webkitMessageHandlers', () => typeof (window.webkit && window.webkit.messageHandlers));
  guard('webkitIpcHandler', () => typeof (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ipc));
  guard('parentInternals', () => typeof parent.__TAURI_INTERNALS__);
  guard('topInternals', () => typeof top.__TAURI_INTERNALS__);
  guard('topDocument', () => typeof top.document.body);
  let posted = 0;
  const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ipc;
  if (handler) {
    for (const key of ['', 'guess', '0123456789abcdef0123456789abcdef']) {
      for (const cmd of ['e2e_canary', 'save_as', 'system_sign', 'read_document', 'take_launch_files']) {
        try {
          handler.postMessage(JSON.stringify({ cmd, callback: 1, error: 2, payload: { origin: 'frame-webkit', id: 'd1', value: {} }, options: {}, __TAURI_INVOKE_KEY__: key }));
          posted++;
        } catch (e) { P('webkitPostError', e.name); }
      }
    }
  }
  P('webkitForgedMessages', posted);
  for (const url of ['ipc://localhost/e2e_canary', 'http://ipc.localhost/e2e_canary', 'tauri://localhost/index.html', 'https://example.org/']) {
    try {
      const r = await fetch(url, { method: 'POST', body: JSON.stringify({ origin: 'frame-fetch' }), headers: { 'Content-Type': 'application/json', 'Tauri-Callback': '1', 'Tauri-Error': '2', 'Tauri-Invoke-Key': 'guess' } });
      P('fetch ' + url, 'status ' + r.status);
    } catch (e) { P('fetch ' + url, 'blocked: ' + e.name); }
  }
  await new Promise((res) => {
    const x = new XMLHttpRequest();
    try {
      x.open('POST', 'ipc://localhost/e2e_canary');
      x.onload = () => { P('xhr', 'status ' + x.status); res(); };
      x.onerror = () => { P('xhr', 'error'); res(); };
      x.send('{}');
    } catch (e) { P('xhr', 'blocked: ' + e.name); res(); }
  });
  const f = document.createElement('iframe');
  f.src = 'tauri://localhost/index.html';
  document.body.append(f);
  await new Promise((r) => setTimeout(r, 1000));
  guard('nestedAppFrame', () => typeof f.contentWindow.__TAURI_INTERNALS__);
  guard('windowOpen', () => String(window.open('tauri://localhost/index.html')));
  guard('topNavigation', () => { top.location.href = 'tauri://localhost/index.html#angriff'; return 'no exception'; });
  parent.postMessage({ hp: 'host', type: 'load', html: '<p>übernommen</p>' }, '*');
  parent.postMessage({ hpProbe: 'result', out }, '*');
})();
</script></body></html>`;

    let result;
    window.addEventListener('message', (e) => {
      if (e.data && e.data.hpProbe === 'result') result = e.data.out;
    });
    host.contentWindow.postMessage({ hp: 'host', type: 'load', html: attack, title: 'Angriff' }, location.origin);
    const got = await waitFor(() => result, 20000);
    await report('attack', { received: got, result: result ?? null });
    await sleep(3000);
    const after = await T.invoke('e2e_canary', { origin: 'shell-after' });
    await report('control-canary-after', { n: after });
    await report('top-location', { href: location.href });
  } catch (e) {
    await report('driver-error', { error: String(e && e.stack || e) });
  }
  await T.invoke('e2e_exit', { code: 0 });
})();
