// Driver of the Android tests of the mobile shell (mobil/scripts/e2e-android.sh). The e2e build
// evaluates this file in the main frame of the reader once the page has loaded. The scenario
// comes from the mode file the script writes (command `e2e_mode`):
//
// ipc     Criterion 1 of docs/06 4.4 (A7): positive control, rejected commands, then the worst
//         case for the document frame – an attack page with script in the sandboxed document
//         frame (same frame host, sandbox and frame policy as every document; unlike a real
//         document its inline script is allowed). It tries every way to the Tauri IPC known
//         from the desktop test (huelle/e2e/ipc-probe.js) plus the Android ones: the
//         JavascriptInterface `window.ipc` and Tauri's own `__TAURI_INTERNALS__`, which wry
//         injects with addDocumentStartJavaScript(…, ["*"]).
// launch  Criterion 2: reports every document the reader shows (cold start and onNewIntent)
//         until the mode becomes `exit`.
// read    Criterion 3 (no ANR): reads the launched document `a1` through the Kotlin plugin
//         and measures how long the page's frames stall meanwhile.
// print   A10 and criterion 3: first `window.print()` in the reader (Android documents that it
//         does nothing), then the reader's print button, which goes to the plugin.
(async () => {
  const T = window.__TAURI_INTERNALS__;
  const report = (step, data) => T.invoke('e2e_report', { value: { step, ...data } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (pred, ms) => {
    for (let t = 0; t < ms; t += 100) {
      const v = pred();
      if (v) return v;
      await sleep(100);
    }
    return null;
  };
  const mode = () => T.invoke('e2e_mode');
  const waitMode = async (want, ms) => {
    for (let t = 0; t < ms; t += 500) {
      if ((await mode()) === want) return true;
      await sleep(500);
    }
    return false;
  };
  const ready = () => document.querySelector('#viewer[data-state="ready"], [data-state="ready"]');
  const title = () => document.getElementById('doc-title')?.textContent ?? '';
  const errorText = () => document.querySelector('#error-message, .error, [role="alert"]')?.textContent?.trim() ?? '';
  let exitCode = 0;
  const start = await mode();
  try {
    await report('driver-start', { mode: start, href: location.href, userAgent: navigator.userAgent, desktop: document.documentElement.dataset.desktop ?? '' });

    if (start === 'ipc') {
      const n = await T.invoke('e2e_canary', { origin: 'shell' });
      await report('control-canary', { n });
      for (const cmd of ['plugin:dialog|open', 'plugin:event|listen', 'plugin:window|close', 'plugin:webview|print', 'plugin:app|version', 'plugin:fs|read_file', 'plugin:hpro-mobil|readDocument', 'plugin:hpro-mobil|printHtml', 'plugin:path|resolve_directory', 'not_a_command']) {
        try {
          const r = await T.invoke(cmd, {});
          await report('acl', { cmd, result: 'ALLOWED', answer: String(r) });
        } catch (e) {
          await report('acl', { cmd, result: 'rejected', error: String(e) });
        }
      }
      // Normally the script launches the app with a document (VIEW intent, id a1); without one
      // the sample document does.
      let shown = await waitFor(ready, 20000);
      if (!shown) {
        document.getElementById('btn-sample')?.click();
        shown = await waitFor(ready, 60000);
      }
      await report('launch-document', { ready: !!shown, title: title() });
      const host = document.getElementById('doc-host');
      let hostBridge;
      try {
        hostBridge = typeof host.contentWindow.__TAURI_INTERNALS__;
      } catch (e) {
        hostBridge = 'blocked: ' + e.name;
      }
      await report('frame-host', { src: host.getAttribute('src'), sandbox: host.getAttribute('sandbox'), tauriInternals: hostBridge });

      const attack = `<!doctype html><html><head><meta charset="utf-8"><title>Angriff</title></head><body><p>Angriffsseite im Dokumentrahmen</p><script>
(async () => {
  const out = {};
  const P = (k, v) => (out[k] = v);
  const guard = (k, f) => { try { P(k, f()); } catch (e) { P(k, 'blocked: ' + e.name); } };
  const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout ' + ms + ' ms')), ms))]);
  P('origin', String(self.origin));
  P('location', String(location.href).slice(0, 60));
  P('sandboxedFrame', String(window !== top));
  guard('tauriInternals', () => typeof window.__TAURI_INTERNALS__);
  guard('tauriInternalsInvoke', () => typeof (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke));
  guard('isTauri', () => String(window.isTauri));
  guard('tauriGlobal', () => typeof window.__TAURI__);
  guard('windowIpc', () => typeof window.ipc);
  guard('windowIpcPostMessage', () => typeof (window.ipc && window.ipc.postMessage));
  guard('webkitMessageHandlers', () => typeof (window.webkit && window.webkit.messageHandlers));
  guard('parentInternals', () => typeof parent.__TAURI_INTERNALS__);
  guard('topInternals', () => typeof top.__TAURI_INTERNALS__);
  guard('topDocument', () => typeof top.document.body);
  const I = window.__TAURI_INTERNALS__;
  if (I && typeof I.invoke === 'function') {
    for (const [cmd, args] of [['e2e_canary', { origin: 'frame-internals' }], ['take_launch_files', {}], ['read_document', { id: 'a1' }], ['e2e_mode', {}]]) {
      try {
        const r = await within(I.invoke(cmd, args), 8000);
        let shown;
        if (r instanceof ArrayBuffer) shown = 'ArrayBuffer ' + r.byteLength + ' bytes, starts ' + JSON.stringify(String.fromCharCode(...new Uint8Array(r.slice(0, 40))));
        else shown = JSON.stringify(r);
        P('invoke ' + cmd, 'ANSWER ' + String(shown).slice(0, 160));
      } catch (e) {
        P('invoke ' + cmd, 'rejected: ' + String(e).slice(0, 160));
      }
    }
  }
  let posted = 0;
  if (window.ipc && typeof window.ipc.postMessage === 'function') {
    for (const key of ['', 'guess', '0123456789abcdef0123456789abcdef']) {
      for (const cmd of ['e2e_canary', 'save_as', 'read_document', 'take_launch_files', 'print_html']) {
        try {
          window.ipc.postMessage(JSON.stringify({ cmd, callback: 1, error: 2, payload: { origin: 'frame-ipc', id: 'a1' }, options: {}, __TAURI_INVOKE_KEY__: key }));
          posted++;
        } catch (e) { P('ipcPostError', e.name); }
      }
    }
  }
  P('forgedIpcMessages', posted);
  for (const url of ['http://ipc.localhost/e2e_canary', 'https://ipc.localhost/e2e_canary', 'http://tauri.localhost/index.html', 'https://example.org/']) {
    try {
      const r = await within(fetch(url, { method: 'POST', body: JSON.stringify({ origin: 'frame-fetch' }), headers: { 'Content-Type': 'application/json', 'Tauri-Callback': '1', 'Tauri-Error': '2', 'Tauri-Invoke-Key': 'guess' } }), 8000);
      P('fetch ' + url, 'status ' + r.status);
    } catch (e) { P('fetch ' + url, 'blocked: ' + e.name); }
  }
  const f = document.createElement('iframe');
  f.src = 'http://tauri.localhost/index.html';
  document.body.append(f);
  await new Promise((r) => setTimeout(r, 1500));
  guard('nestedAppFrame', () => typeof f.contentWindow.__TAURI_INTERNALS__);
  guard('windowOpen', () => String(window.open('http://tauri.localhost/index.html')));
  guard('topNavigation', () => { top.location.href = 'http://tauri.localhost/index.html#angriff'; return 'no exception'; });
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
      const after = await T.invoke('e2e_canary', { origin: 'shell-after' });
      await report('control-canary-after', { n: after });
      await report('top-location', { href: location.href });
    } else if (start === 'launch') {
      let last = '';
      for (;;) {
        const t = ready() ? title() : '';
        const err = errorText();
        if (t && t !== last) {
          last = t;
          await report('shown', { title: t });
        } else if (err && err !== last) {
          last = err;
          await report('error-shown', { text: err.slice(0, 300) });
        }
        if ((await mode()) === 'exit') break;
        await sleep(500);
      }
    } else if (start === 'read') {
      let maxGap = 0;
      let frames = 0;
      let running = true;
      let last = performance.now();
      const tick = (t) => {
        maxGap = Math.max(maxGap, t - last);
        last = t;
        frames++;
        if (running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      await sleep(1000);
      const idleGap = maxGap;
      maxGap = 0;
      frames = 0;
      const t0 = performance.now();
      try {
        const bytes = await T.invoke('read_document', { id: 'a1' });
        const ms = performance.now() - t0;
        await sleep(500);
        running = false;
        const size = bytes instanceof ArrayBuffer ? bytes.byteLength : bytes && bytes.byteLength;
        await report('read', { bytes: size, ms: Math.round(ms), maxFrameGapMs: Math.round(maxGap), frames, idleMaxFrameGapMs: Math.round(idleGap) });
      } catch (e) {
        running = false;
        await report('read', { error: String(e), ms: Math.round(performance.now() - t0) });
      }
    } else if (start === 'print') {
      const shown = await waitFor(ready, 60000);
      await report('print-document', { ready: !!shown, title: title() });
      await report('window-print-call', {});
      window.print();
      await report('window-print-returned', {});
      // The script looks for a print dialog, then switches the mode.
      await waitMode('print-button', 120000);
      document.getElementById('btn-print').click();
      const status = await waitFor(() => /Druckfassung:/.test(document.getElementById('live-status')?.textContent ?? '') && document.getElementById('live-status').textContent, 120000);
      await report('print-button', { status: status || document.getElementById('live-status')?.textContent || '' });
      await waitMode('exit', 600000);
    }
  } catch (e) {
    exitCode = 1;
    await report('driver-error', { error: String((e && e.stack) || e) });
  }
  await report('driver-end', {});
  if (start !== 'launch' && start !== 'print') await waitMode('exit', 600000);
  await T.invoke('e2e_exit', { code: exitCode });
})();
