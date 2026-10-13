// Driver of the signing and sidecar test (huelle/scripts/e2e-signatur.sh). Uses the reader's
// own controls: "Signieren" (PKCS#11 key of the system, here SoftHSM) and "PDF" (sidecar
// hpro-dienst). The native confirmation and save dialogs are answered by xdotool from outside.
(async () => {
  const T = window.__TAURI_INTERNALS__;
  const report = (step, data) => T.invoke('e2e_report', { value: { step, ...data } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (pred, ms) => {
    for (let t = 0; t < ms; t += 200) {
      const v = pred();
      if (v) return v;
      await sleep(200);
    }
    return null;
  };
  const $ = (id) => document.getElementById(id);
  try {
    await report('driver-start', { href: location.href });
    await waitFor(() => document.querySelector('#viewer[data-state="ready"]'), 30000);
    await report('launch-document', { title: $('doc-title').textContent });
    for (const want of (window.__HPRO_E2E_KEYS__ || ['RSA', 'EC'])) {
      $('btn-sign').click();
      const opt = await waitFor(() => [...$('sign-key').options].find((o) => o.text.includes(want)), 20000);
      await report('keys', { want, options: [...$('sign-key').options].map((o) => `${o.value} ${o.text}`), status: $('sign-status').textContent });
      if (!opt) throw new Error('kein Schlüssel ' + want);
      $('sign-key').value = opt.value;
      $('sign-pin').value = '1234';
      $('sign-form').requestSubmit();
      const done = await waitFor(() => /Gespeichert|Nicht /.test($('sign-status').textContent) || !$('dlg-sign').open, 120000);
      await report('signed', { want, status: $('sign-status').textContent, open: $('dlg-sign').open, title: $('doc-title').textContent, done: !!done });
      if ($('dlg-sign').open) $('dlg-sign').close();
      await waitFor(() => document.querySelector('#viewer[data-state="ready"]'), 30000);
      await sleep(1500);
    }
    $('btn-pdf').click();
    await sleep(500);
    const finished = await waitFor(() => !$('btn-pdf').disabled, 900000);
    await report('pdf', { finished: !!finished, error: $('error')?.textContent ?? '' });
  } catch (e) {
    await report('driver-error', { error: String((e && e.stack) || e) });
  }
  await sleep(1000);
  await T.invoke('e2e_exit', { code: 0 });
})();
