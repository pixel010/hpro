/**
 * Frame host (P15): a same-origin page between the reader shell and the document frame.
 *
 * Why it exists: a `srcdoc` frame inherits the Content Security Policy of its parent, and the
 * policies of parent and frame both apply. The shell's policy is fixed at build time and cannot
 * name the hashes of the components of a document opened later; a frame loaded from `data:` or
 * `blob:` inherits it as well (measured, docs/belege/P15). A navigated page does not inherit, so
 * this page carries a policy without a script restriction of its own (it contains no document
 * content), and the document frame below it gets the strict per-document policy alone
 * (HP-SBX-006): no network source, scripts only by hash.
 *
 * The page is same-origin and not sandboxed so that the service worker serves it offline (a
 * sandboxed frame with opaque origin is not served by it). It only relays messages:
 *
 *   shell → host   { hp: 'host', type: 'load', html, title }   new document frame content
 *   shell → host   anything else                               forwarded to the document frame
 *   frame → host   anything (with transferred ports)           forwarded to the shell
 *   shell → host   { hp: 'host', type: 'hello' }              answered with `ready`
 *   host → shell   { hp: 'host', type: 'ready' }               after start and on `hello`
 *
 * Messages are accepted only from the shell (`window.parent`) and from the document frame's
 * own window (part 1, section 8.1).
 */
const frame = document.getElementById('doc-frame') as HTMLIFrameElement;

window.addEventListener('message', (event) => {
  if (event.source === window.parent) {
    const data = event.data as { hp?: unknown; type?: unknown; html?: unknown; title?: unknown } | null;
    if (data && data.hp === 'host' && data.type === 'hello') {
      window.parent.postMessage({ hp: 'host', type: 'ready' }, window.location.origin);
      return;
    }
    if (data && data.hp === 'host' && data.type === 'load' && typeof data.html === 'string') {
      frame.title = typeof data.title === 'string' ? data.title : 'Dokument';
      frame.srcdoc = data.html;
      return;
    }
    frame.contentWindow?.postMessage(event.data, '*', [...event.ports]);
  } else if (event.source === frame.contentWindow) {
    window.parent.postMessage(event.data, window.location.origin, [...event.ports]);
  }
});

window.parent.postMessage({ hp: 'host', type: 'ready' }, window.location.origin);
