// Evaluates a JavaScript expression in the reader's WebView over the Chrome DevTools protocol
// (debug builds only; the socket is forwarded with
// `adb forward tcp:PORT localabstract:webview_devtools_remote_PID`).
// Used by criterion 4 (docs/15, 2.4) to change the reader's markup at run time and repeat
// TalkBack's navigation, without a rebuild.
// Usage: node cdp-eval.mjs PORT 'expression'   -> prints the page URL and the result as JSON
const [port, expression] = process.argv.slice(2);
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === "page" && t.url.startsWith("http://tauri.localhost"));
if (!page) {
  console.error("no reader page among", targets.map((t) => `${t.type} ${t.url}`));
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
const reply = await new Promise((resolve) => {
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id === 1) resolve(msg);
  };
});
ws.close();
console.log(page.url);
console.log(JSON.stringify(reply.result?.result?.value ?? reply.result ?? reply.error));
