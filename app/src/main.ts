/**
 * hpro Reader (package P4): open a container, read it flowing or as fixed A4 pages,
 * navigate by table of contents and addresses, search the text, zoom, keyboard, offline.
 *
 * The document itself runs in a sandboxed frame (render.ts, frame-agent.js) inside the frame
 * host (frame.html, frame-host.ts); this module is the reader shell around it and talks to the
 * frame only by messages: to the agent over its private port, to components over the document
 * data channel of the core (P15, part 1 section 8).
 */
import agentSource from './frame-agent.js?raw';
import frameCss from './frame.css?raw';
import { calc as kernCalc, form, live, lock, validateContainer } from '@hpro/kern';
import { CalcSession, download, errorDescription, type CalcUpdate } from './calcview.js';
import { FormSession, type FormUpdate } from './formview.js';
import { OpenError, openContainer, type ContentDocument, type LoadedDocument } from './document.js';
import { longAddress, parseAddress, resolvePath, shortAddress, type Address } from './paths.js';
import { buildFrameHtml, type FrameState, type ViewMode } from './render.js';
import { paginate, type PaginationReport } from './paginate.js';
import { buildPrintHtml, TYPE_AREA_PX, type PrintBuild } from './print.js';
import { searchDocuments, type SearchResult } from './search.js';
import { AnnotationPanel } from './annotations.js';
import { Editor } from './editor.js';
import { isHidden, unsealAll } from './locks.js';
import { CHOICES, DEFAULT_SETTINGS, frameVars, loadSettings, resolveScheme, saveSettings, zoomIn, zoomOut, type Settings } from './settings.js';
import { SHORTCUTS, commandForKey, isTyping, type Command } from './shortcuts.js';
import { registerServiceWorker } from './sw-register.js';
import { flattenToc, type TocItem } from './toc.js';

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
}

interface GotoTarget {
  readonly id?: string | undefined;
  readonly hit?: number;
  readonly focus?: boolean;
  /** An annotation (P7): its passage, drawing or button. */
  readonly anno?: string;
}

interface Position {
  readonly ids: readonly string[];
  readonly address: string;
  readonly label: string;
  readonly page: number;
  readonly pages: number;
}

const WIDE = window.matchMedia('(min-width: 64rem)');
const DARK = window.matchMedia('(prefers-color-scheme: dark)');
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
const EXTERNAL_SCHEMES = /^(https?|mailto):/i;

async function sha256Source(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  let binary = '';
  for (const b of new Uint8Array(digest)) binary += String.fromCharCode(b);
  return `sha256-${btoa(binary)}`;
}

type PanelName = 'toc' | 'search' | 'edit' | 'annot';
const PANEL_BUTTON: Record<PanelName, string> = { toc: 'btn-toc', search: 'btn-search', edit: 'btn-edit', annot: 'btn-annot' };

class Reader {
  private doc: LoadedDocument | undefined;
  private index = 0;
  private mode: ViewMode = 'flow';
  private settings: Settings = loadSettings(window.localStorage);
  private result: SearchResult | undefined;
  private activeHit = -1;
  private renderedQuery = '';
  private frameReady = false;
  private pendingGoto: GotoTarget | undefined;
  private position: Position = { ids: [], address: '', label: '', page: 0, pages: 0 };
  private tocLinks: { item: TocItem; link: HTMLAnchorElement }[] = [];
  private readonly agentHash = sha256Source(agentSource);
  /** Frame host (frame.html); the sandboxed document frame lives inside it. */
  private readonly host = $<HTMLIFrameElement>('doc-host');
  // Order matters: the resolver field must exist before the promise initialiser assigns it.
  private resolveHost: () => void = () => undefined;
  private readonly hostReady: Promise<void> = new Promise((resolve) => (this.resolveHost = resolve));
  /** Load token of the current frame content and the agent's private port (frame-agent.js). */
  private token = '';
  private agentPort: MessagePort | undefined;
  /** Live content of the shown version (P15): decisions of the core and the data channel. */
  private plan: Promise<live.ComponentPlan> | undefined;
  private channel: live.DataChannel | undefined;
  private motion = { moving: 0, paused: false, reduced: false };
  private readonly viewer = $('viewer');
  private pendingExternal = '';
  /** Calculator of the shown version (P19). */
  private calc: CalcSession | undefined;
  /** Forms of the shown version (P6). */
  private forms: FormSession | undefined;
  /** Result of the signature check of the shown frozen version, once known. */
  private versionSignature = '';
  /** Locks (P17): show `hidden` sections; whether a valid signature covers the rules. */
  private showHidden = false;
  private lockStatus = '';
  /** Print frame of the last print (P18); kept until the next print or document. */
  private printFrame: HTMLIFrameElement | undefined;
  /** Structured editing, history and redaction (P5). */
  private editor: Editor | undefined;
  /** Annotations, threads, export and comparison with another file (P7). */
  private annotations: AnnotationPanel | undefined;

  start(): void {
    this.editor = new Editor({
      current: () => (this.doc && this.current ? { doc: this.savedDoc ?? this.doc, path: this.current.path } : undefined),
      preview: (doc, path, id) => this.showPreview(doc, path, id),
      saved: async (bytes, name, message) => {
        await this.open(bytes, name);
        this.setPanel('edit', true);
        void this.editor?.show();
        this.announce(message);
        $('edit-status').textContent = message;
      },
      openOther: (bytes, name) => this.open(bytes, name),
      download: (bytes, name, type) => download(bytes, name, type),
      announce: (text) => this.announce(text),
    });
    this.annotations = new AnnotationPanel({
      current: () => {
        const doc = this.doc;
        const content = this.current;
        return doc && content ? { doc: this.savedDoc ?? doc, path: content.path, address: this.position.address, label: this.position.label, mode: this.mode } : undefined;
      },
      refresh: (focus) => this.render(this.index, focus ? { anno: focus } : this.position.address ? { id: this.position.address } : {}),
      post: (message) => this.post(message),
      gotoAnnotation: (path, id) => {
        const index = this.doc?.content.findIndex((c) => c.path === path) ?? -1;
        if (index < 0) return;
        if (index === this.index) this.goto({ anno: id, focus: true });
        else this.render(index, { anno: id, focus: true });
      },
      saved: async (bytes, name, message) => {
        await this.open(bytes, name);
        this.setPanel('annot', true);
        await this.annotations?.ready();
        this.announce(message);
        $('annot-status').textContent = message;
      },
      download: (bytes, name, type) => download(bytes, name, type),
      announce: (text) => this.announce(text),
      openPanel: () => {
        if (!this.panelOpen('annot')) this.setPanel('annot', true);
      },
    });
    this.bindToolbar();
    this.bindPanels();
    this.bindSearch();
    this.bindDialogs();
    this.bindOpening();
    window.addEventListener('message', (e) => this.onWindowMessage(e));
    // The frame host may have started before this listener existed: ask it again.
    const hello = () => this.host.contentWindow?.postMessage({ hp: 'host', type: 'hello' }, window.location.origin);
    this.host.addEventListener('load', hello);
    hello();
    document.addEventListener('keydown', (e) => this.onKey(e, e.target));
    DARK.addEventListener('change', () => this.applyAppearance());
    REDUCED_MOTION.addEventListener('change', () => this.updateLiveStatus());
    WIDE.addEventListener('change', () => this.syncPanelLayout());
    this.applyAppearance();
    this.updateZoomLabel();
    this.fillHelp();
    registerServiceWorker($('offline-status'));
  }

  // ------------------------------------------------------------------ opening

  private bindOpening(): void {
    const input = $<HTMLInputElement>('file-input');
    const pick = () => input.click();
    $('btn-open').addEventListener('click', pick);
    $('btn-open-welcome').addEventListener('click', pick);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void this.openFile(file);
      input.value = '';
    });
    $('btn-sample').addEventListener('click', () => void this.openSample());
    $('btn-sample-calc').addEventListener('click', () => void this.openSample('kostenschaetzung.hpro'));
    $('btn-sample-live').addEventListener('click', () => void this.openSample('lebendig.hpro'));
    $('btn-sample-lock').addEventListener('click', () => void this.openSample('sperren.hpro'));
    $('btn-sample-print').addEventListener('click', () => void this.openSample('druck.hpro'));
    $('btn-sample-edit').addEventListener('click', () => void this.openSample('bearbeiten.hpro'));
    $('btn-sample-form').addEventListener('click', () => void this.openSample('antrag.hpro'));
    $('btn-sample-annot').addEventListener('click', () => void this.openSample('anmerkungen.hpro'));
    document.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    document.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      e.preventDefault();
      void this.openFile(file);
    });
    // Installed PWA in Chrome/Edge: files opened from the operating system (manifest file_handlers).
    const launchQueue = (window as unknown as { launchQueue?: { setConsumer(cb: (p: { files: FileSystemFileHandle[] }) => void): void } }).launchQueue;
    launchQueue?.setConsumer(async (params) => {
      const handle = params.files[0];
      if (handle) await this.openFile(await handle.getFile());
    });
  }

  private async openSample(name = 'beispiel.hpro'): Promise<void> {
    try {
      const response = await fetch(`./${name}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await this.open(new Uint8Array(await response.arrayBuffer()), name);
    } catch (err) {
      this.showError('Das Beispieldokument konnte nicht geladen werden.', String(err));
    }
  }

  private async openFile(file: File): Promise<void> {
    await this.open(new Uint8Array(await file.arrayBuffer()), file.name);
  }

  async open(bytes: Uint8Array, name: string, versionId: string | null = null): Promise<void> {
    this.clearError();
    let doc: LoadedDocument;
    try {
      doc = await openContainer(bytes, name, versionId);
    } catch (err) {
      if (err instanceof OpenError) this.showError(`„${name}“ lässt sich nicht öffnen: ${err.message}`, err.detail);
      else this.showError(`„${name}“ lässt sich nicht öffnen.`, String(err));
      return;
    }
    this.doc = doc;
    this.savedDoc = undefined;
    this.editor?.reset(doc);
    this.annotations?.reset(doc);
    this.preparelive(doc);
    // Tables: the main version calculates, a frozen rendition shows stored values (P19).
    this.calc = new CalcSession(doc, doc.version.id === null ? 'live' : 'frozen');
    // Forms: the main version can be filled in; a frozen rendition has none left (P6).
    this.forms = new FormSession(doc, doc.version.id === null ? 'live' : 'readonly');
    this.updateFormStatus();
    this.versionSignature = '';
    this.showHidden = false;
    this.lockStatus = '';
    this.updateLockBanner();
    if (doc.access.length > 0) void this.checkLockStatus(doc);
    $<HTMLButtonElement>('btn-calc').disabled = !this.calc.hasTables && doc.versions.length < 2;
    this.updateVersionBanner();
    this.updateCalcStatus();
    if (doc.version.id !== null) void this.checkVersionSignature(doc);
    // The flowing view is the default whenever a document is opened (HP-PRINT-014).
    this.mode = 'flow';
    this.result = undefined;
    this.activeHit = -1;
    $<HTMLInputElement>('search-input').value = '';
    $('search-status').textContent = '';
    $('search-results').replaceChildren();
    this.updateHitButtons();
    document.title = `${doc.title} – hpro Reader`;
    $('doc-title').textContent = doc.title;
    $('welcome').hidden = true;
    this.viewer.hidden = false;
    $('status-bar').hidden = false;
    for (const id of ['btn-toc', 'btn-info', 'btn-search', 'btn-flow', 'btn-page', 'btn-print', 'btn-annot']) $<HTMLButtonElement>(id).disabled = false;
    this.printFrame?.remove();
    this.printFrame = undefined;
    if (doc.version.id !== null) document.title = `${doc.title} (${doc.version.label}) – hpro Reader`;
    this.buildToc();
    this.updateViewButtons();
    this.setPanel('toc', WIDE.matches);
    this.render(0, {});
    document.documentElement.dataset['document'] = doc.id;
  }

  // ------------------------------------------------------------------ frame

  private state(): FrameState {
    return {
      mode: this.mode,
      zoom: this.settings.zoom,
      title: this.doc?.title ?? '',
      vars: frameVars(this.settings, this.mode, this.scheme()),
      scheme: this.scheme(),
      motion: this.settings.motion,
      paused: this.motion.paused,
    };
  }

  private scheme() {
    return resolveScheme(this.settings.scheme, DARK.matches);
  }

  /** The opened file while the editor shows unsaved changes as `doc` (P5). */
  private savedDoc: LoadedDocument | undefined;

  /** Shows the unsaved state of the editor in the frame, keeping the opened file for saving. */
  private showPreview(doc: LoadedDocument, path: string, id?: string): void {
    this.savedDoc ??= this.doc;
    this.doc = doc;
    this.buildToc();
    const index = doc.content.findIndex((c) => c.path === path);
    this.render(index >= 0 ? index : this.index, id ? { id } : this.position.address ? { id: this.position.address } : {});
  }

  private get current(): ContentDocument | undefined {
    return this.doc?.content[this.index];
  }

  private render(index: number, target: GotoTarget): void {
    const doc = this.doc;
    const content = doc?.content[index];
    if (!doc || !content) return;
    this.index = index;
    this.frameReady = false;
    this.pendingGoto = target;
    this.viewer.dataset['state'] = 'loading';
    const query = this.result?.query ?? '';
    void Promise.all([this.agentHash, this.plan, this.hostReady, this.annotations?.ready().catch(() => undefined)]).then(([agentHash, plan]) => {
      if (this.doc !== doc || this.index !== index) return;
      const calcMode = this.calc?.hasTables ? this.calc.mode : 'none';
      this.token = crypto.randomUUID();
      this.agentPort?.close();
      this.agentPort = undefined;
      const built = buildFrameHtml(doc, content, {
        agent: agentSource,
        agentHash,
        css: frameCss,
        query,
        state: this.state(),
        calc: calcMode,
        token: this.token,
        locks: { access: doc.access, sealed: doc.sealed, showHidden: this.showHidden },
        ...(plan ? { components: { decisions: plan.decisions, live: plan.live } } : {}),
        ...(this.forms?.hasForms ? { forms: { mode: this.forms.mode, hidden: this.forms.hiddenSections(content.path) } } : {}),
        annotations: this.annotations?.marks(content.path) ?? [],
      });
      this.renderedQuery = query;
      this.host.contentWindow?.postMessage({ hp: 'host', type: 'load', html: built.html, title: `Dokument: ${content.title}` }, window.location.origin);
    });
    this.updateDocButtons();
  }

  private post(message: Record<string, unknown>): void {
    this.agentPort?.postMessage({ hp: 'reader', ...message });
  }

  /** Message to the document frame's window, i.e. to its components (data channel). */
  private postToComponents(message: live.ChannelMessage): void {
    this.host.contentWindow?.postMessage(message, window.location.origin);
  }

  /** Decisions of the core on the components of the shown version, and the data channel. */
  private preparelive(doc: LoadedDocument): void {
    const manifest = doc.manifest as unknown as Record<string, unknown>;
    this.plan = live.planComponents(manifest, doc.files, { frozen: doc.version.id !== null, enabled: this.settings.liveContent });
    // Read-only: frozen rendition, signed document, or a version that is not live (8.3 rule 4).
    const readOnly = doc.version.id !== null || doc.profile !== 'interactive' || doc.signatureFiles.length > 0;
    this.channel = new live.DataChannel({ manifest, files: doc.files, readOnly, reducedMotion: this.reducedMotion() });
    this.motion = { moving: 0, paused: false, reduced: this.reducedMotion() };
    void this.plan.then(() => this.updateLiveStatus());
  }

  /**
   * A component broke a rule the policies cannot prevent (it left the document frame): every
   * component of this document stops, the document is shown again with its static equivalents.
   */
  private stopComponents(reason: string): void {
    const doc = this.doc;
    if (!doc) return;
    this.plan = live.planComponents(doc.manifest as unknown as Record<string, unknown>, doc.files, { frozen: doc.version.id !== null, enabled: this.settings.liveContent, stopped: reason });
    this.render(this.index, this.position.address ? { id: this.position.address } : {});
    this.updateLiveStatus();
    this.announce(`Komponente beendet: ${reason}. Angezeigt wird die statische Fassung.`);
  }

  private reducedMotion(): boolean {
    return this.settings.motion === 'reduce' || REDUCED_MOTION.matches;
  }

  /** Status bar: what live content does, whether data changed, the motion button. */
  /** Last resolved plan, for synchronous use in dialogs. */
  private planSnapshot: live.ComponentPlan | undefined;

  private updateLiveStatus(): void {
    const status = $('live-status');
    const save = $<HTMLButtonElement>('btn-live-save');
    const button = $<HTMLButtonElement>('btn-motion');
    void this.plan?.then((plan) => {
      this.planSnapshot = plan;
      const running = plan.decisions.filter((d) => d.state === 'run').length;
      const stopped = plan.decisions.length - running;
      const parts: string[] = [];
      const stoppedByReader = plan.decisions.some((d) => d.state === 'stopped');
      if (plan.decisions.length > 0) parts.push(running > 0 ? `Lebendig: ${running} ${running === 1 ? 'Komponente' : 'Komponenten'} in der Sandbox` : stoppedByReader ? 'Komponente beendet, statische Fassung' : 'Statische Fassung');
      if (stopped > 0 && running > 0) parts.push(`${stopped} nicht ausgeführt`);
      if (this.channel?.dirty) parts.push('Daten geändert');
      status.textContent = parts.join(' · ');
    });
    save.hidden = !this.channel?.dirty;
    button.hidden = !this.motion.paused && (this.motion.moving === 0 || this.motion.reduced);
    button.setAttribute('aria-pressed', String(this.motion.paused));
    button.querySelector('.label')!.textContent = this.motion.paused ? 'Bewegung fortsetzen' : 'Bewegung anhalten';
  }

  private toggleMotion(): void {
    this.motion = { ...this.motion, paused: !this.motion.paused };
    this.sendState();
    this.updateLiveStatus();
    this.announce(this.motion.paused ? 'Bewegung angehalten' : 'Bewegung fortgesetzt');
  }

  private async saveData(): Promise<void> {
    const doc = this.doc;
    const channel = this.channel;
    if (!doc || !channel?.dirty) return;
    try {
      const modified = new Date().toISOString().slice(0, 19) + 'Z';
      const bytes = await live.saveDataChanges(doc.bytes, channel.changes(), { modified });
      download(bytes, `${doc.fileName.replace(/\.[^.]+$/, '')}-geaendert.hpro`, 'application/epub+zip');
      $('live-status').textContent = `Gespeichert: ${[...channel.changes().keys()].join(', ')}`;
    } catch (err) {
      this.showError('Die geänderten Daten konnten nicht gespeichert werden.', String(err));
    }
  }

  private sendState(): void {
    if (this.frameReady) this.post({ type: 'state', ...this.state() });
  }

  private goto(target: GotoTarget): void {
    if (this.frameReady) this.post({ type: 'goto', ...target });
    else this.pendingGoto = target;
  }

  /**
   * Messages from the frame host: its start, the agent's port (with the load token), and
   * everything else from the document frame, which is the data channel of its components.
   */
  private onWindowMessage(event: MessageEvent): void {
    if (event.source !== this.host.contentWindow || event.origin !== window.location.origin) return;
    const data = event.data as Record<string, unknown> | null;
    if (data && data['hp'] === 'host' && data['type'] === 'ready') {
      this.resolveHost();
      return;
    }
    if (data && data['hp'] === 'host' && data['type'] === 'left') {
      this.stopComponents('hat versucht, den Dokumentrahmen zu verlassen');
      return;
    }
    if (data && data['hp'] === 'frame' && data['type'] === 'port') {
      const port = event.ports[0];
      if (!port || this.agentPort || data['token'] !== this.token || this.token === '') return;
      this.agentPort = port;
      port.onmessage = (e) => this.onAgentMessage(e.data as Record<string, unknown> | null);
      return;
    }
    if (!this.channel) return;
    const out = this.channel.handle(data);
    if (out.reply) this.postToComponents(out.reply);
    for (const m of out.broadcast) this.postToComponents(m);
    if (data && data['hp'] === 'state.set' && out.reply?.['ok'] === true) this.updateLiveStatus();
  }

  private onAgentMessage(data: Record<string, unknown> | null): void {
    if (!data || data['hp'] !== 'frame') return;
    switch (data['type']) {
      case 'motion':
        this.motion = { moving: typeof data['moving'] === 'number' ? data['moving'] : 0, paused: this.motion.paused, reduced: data['reduced'] === true };
        this.viewer.dataset['motion'] = data['reduced'] === true ? 'reduce' : this.motion.paused ? 'paused' : 'run';
        this.updateLiveStatus();
        break;
      case 'ready': {
        this.frameReady = true;
        // Components learn the version's rules once the frame has loaded (part 1, 8.2).
        if (this.channel) this.postToComponents({ ...this.channel.ready(), reducedMotion: this.reducedMotion() });
        this.viewer.dataset['state'] = 'ready';
        const path = this.current?.path;
        if (path && this.calc?.mode === 'live') this.postCalc(this.calc.snapshot(path));
        if (path && this.forms?.hasForms) this.post({ type: 'form', ...this.forms.snapshot(path) });
        this.annotations?.frameLoaded();
        const target = this.pendingGoto;
        this.pendingGoto = undefined;
        if (target && (target.id !== undefined || target.hit !== undefined || target.anno !== undefined)) this.goto(target);
        break;
      }
      case 'position':
        this.onPosition({
          ids: Array.isArray(data['ids']) ? data['ids'].filter((x): x is string => typeof x === 'string') : [],
          address: typeof data['address'] === 'string' ? data['address'] : '',
          label: typeof data['label'] === 'string' ? data['label'] : '',
          page: typeof data['page'] === 'number' ? data['page'] : 0,
          pages: typeof data['pages'] === 'number' ? data['pages'] : 0,
        });
        break;
      case 'link':
        if (typeof data['href'] === 'string') this.onLink(data['href']);
        break;
      case 'key':
        this.onKey(
          {
            key: String(data['key'] ?? ''),
            ctrlKey: data['ctrlKey'] === true,
            altKey: data['altKey'] === true,
            metaKey: data['metaKey'] === true,
            shiftKey: data['shiftKey'] === true,
            preventDefault: () => undefined,
          },
          null,
        );
        break;
      case 'goto':
        if (data['found'] === false) this.announce('Abschnitt nicht gefunden.');
        break;
      case 'cell-input':
        if (typeof data['address'] === 'string' && typeof data['value'] === 'string') this.onCellInput(data['address'], data['value'], data['final'] === true);
        break;
      case 'form-input':
        if (typeof data['field'] === 'string' && typeof data['value'] === 'string') this.onFormInput(data['field'], data['value'], data['final'] === true);
        break;
      case 'form-action':
        if (typeof data['form'] === 'string' && typeof data['action'] === 'string') void this.onFormAction(data['form'], data['action']);
        break;
      case 'selection':
        this.annotations?.onSelection(
          typeof data['id'] === 'string' && typeof data['start'] === 'number' && typeof data['end'] === 'number' && typeof data['text'] === 'string'
            ? { id: data['id'], start: data['start'], end: data['end'], text: data['text'] }
            : undefined,
        );
        break;
      case 'anno-open':
        if (typeof data['id'] === 'string') this.annotations?.focusThread(data['id']);
        break;
      case 'ink-stroke':
        if (typeof data['id'] === 'string' && typeof data['d'] === 'string') this.annotations?.onInkStroke(data['id'], data['d']);
        break;
    }
  }

  // ------------------------------------------------------------------ forms (P6)

  private postForm(update: FormUpdate): void {
    this.post({ type: 'form', ...update });
  }

  /** An entry in a form field: calculate, evaluate conditions and validate in the shell. */
  private onFormInput(field: string, value: string, final: boolean): void {
    const path = this.current?.path;
    if (!path || !this.forms) return;
    const update = this.forms.input(path, field, value, final);
    this.postForm(update);
    const f = update.forms[0];
    if (!f) return;
    const open = this.forms.problems(path, f.id).length;
    $('form-status').textContent = `Formular ${f.id}: neu berechnet in ${(update.ms ?? 0).toFixed(1).replace('.', ',')} ms · ${open === 0 ? 'alle Angaben gültig, Absenden möglich' : `${open} ${open === 1 ? 'Angabe fehlt oder stimmt nicht' : 'Angaben fehlen oder stimmen nicht'}`}`;
  }

  private updateFormStatus(): void {
    const status = $('form-status');
    const forms = this.forms;
    if (!forms?.hasForms) {
      status.textContent = '';
      return;
    }
    status.textContent = forms
      .allForms()
      .map((f) => `Formular ${f.id}: ${forms.statusText(f.dataPath)}${forms.mode === 'readonly' ? ' (schreibgeschützt)' : ''}`)
      .join(' · ');
  }

  /**
   * Buttons of a form (formview.ts): "Eingaben prüfen", "Entwurf speichern", "Daten exportieren",
   * "Absenden". Absenden validates in the shell first and the core validates again; only a valid
   * form gives the submitted container and its data export (Abnahme 3).
   */
  private async onFormAction(formId: string, action: string): Promise<void> {
    const path = this.current?.path;
    const forms = this.forms;
    const doc = this.doc;
    if (!path || !forms || !doc || forms.mode !== 'live') return;
    const base = doc.fileName.replace(/\.[^.]+$/, '').replace(/-(entwurf|abgesendet)$/, '');
    const status = $('form-status');
    const refused = (problems: readonly { message: string }[], what: string) => {
      this.postForm(forms.check(path, formId));
      status.textContent = `${what}: ${problems.length} ${problems.length === 1 ? 'Angabe fehlt oder stimmt nicht' : 'Angaben fehlen oder stimmen nicht'}.`;
      this.announce(status.textContent);
    };
    try {
      switch (action) {
        case 'check': {
          const update = forms.check(path, formId);
          this.postForm(update);
          const n = update.forms[0]?.summary?.length ?? 0;
          status.textContent = n === 0 ? `Formular ${formId}: alle Angaben vollständig und gültig.` : `Formular ${formId}: ${n} ${n === 1 ? 'Angabe fehlt oder stimmt nicht' : 'Angaben fehlen oder stimmen nicht'}.`;
          break;
        }
        case 'save': {
          const r = await forms.save(new Date());
          download(r.bytes, `${base}-entwurf.hpro`, 'application/epub+zip');
          status.textContent = `Entwurf gespeichert: ${base}-entwurf.hpro (${forms.entryCount} Eingaben; ungültige Angaben stehen nur im Formular, nicht in den Daten).`;
          break;
        }
        case 'export': {
          const e = await forms.exportData(formId, new Date());
          download(new TextEncoder().encode(e.json), `${base}-${formId}.json`, 'application/json');
          status.textContent = `Daten exportiert: ${base}-${formId}.json, Status ${e.data.status === 'submitted' ? 'abgesendet' : 'Entwurf'}, geprüft gegen ${e.schemaPath}.`;
          break;
        }
        case 'submit': {
          const problems = forms.attempt(path, formId);
          if (problems.length > 0) {
            refused(problems, 'Nicht abgesendet');
            return;
          }
          const { result, exported } = await forms.submit(formId, new Date());
          const name = `${base}-abgesendet.hpro`;
          download(result.bytes, name, 'application/epub+zip');
          download(new TextEncoder().encode(exported.json), `${base}-${formId}.json`, 'application/json');
          // The submitted file is now the document: print gives the filled-in version.
          await this.open(result.bytes, name);
          const s = $('form-status');
          s.textContent = `Abgesendet: ${name} und ${base}-${formId}.json gespeichert; Daten geprüft gegen ${exported.schemaPath}. Drucken ergibt die ausgefüllte Fassung.`;
          this.announce(s.textContent);
          break;
        }
      }
    } catch (err) {
      if (err instanceof form.FormRejected) refused(err.problems, action === 'export' ? 'Export abgelehnt' : 'Nicht abgesendet');
      else this.showError('Das Formular konnte nicht verarbeitet werden.', String(err));
    }
  }

  // ------------------------------------------------------------------ tables (P19)

  private postCalc(update: CalcUpdate): void {
    const cells = update.cells.map((c) => (c.type === 'error' ? { ...c, description: errorDescription(c.value) } : c));
    this.post({ type: 'calc', ...update, cells });
  }

  /** An entry in an input cell: calculate in the shell, send the changed values to the frame. */
  private onCellInput(address: string, value: string, final: boolean): void {
    const path = this.current?.path;
    if (!path || !this.calc) return;
    const update = this.calc.input(path, address, value);
    // While typing, an incomplete entry is not an error yet; it is reported when the field is left.
    if (update.entry && !update.entry.ok && !final) return;
    this.postCalc(update);
    const status = $('calc-status');
    status.classList.remove('changed');
    if (update.entry?.ok) {
      const changed = update.cells.filter((c) => c.address !== address).length;
      // Leaving the field after typing: the entry was calculated already, keep its message.
      if (final && changed === 0 && status.textContent?.startsWith('Neu berechnet')) return;
      const failed = update.checks.filter((c) => !c.ok).length;
      status.textContent = `Neu berechnet in ${update.ms.toFixed(1).replace('.', ',')} ms: ${changed} ${changed === 1 ? 'Zelle' : 'Zellen'} aktualisiert${failed ? `, ${failed} ${failed === 1 ? 'Prüfung' : 'Prüfungen'} nicht erfüllt` : ''}.`;
    } else if (update.entry) {
      status.textContent = `${address}: ${update.entry.message ?? 'Eingabe ungültig'}`;
    }
  }

  private updateCalcStatus(): void {
    const status = $('calc-status');
    const doc = this.doc;
    const calc = this.calc;
    status.classList.remove('changed');
    if (!doc || !calc || !calc.hasTables) {
      status.textContent = '';
      return;
    }
    const states = calc.allStates();
    const deviations = states.reduce((n, x) => n + x.deviations.length, 0);
    if (calc.mode === 'live' && calc.formulaCount === 0) {
      // Tables without formulas (e.g. the data table of a chart): nothing is calculated.
      status.textContent = '';
    } else if (calc.mode === 'live') {
      status.textContent = `Rechnet: ${calc.formulaCount} Formeln${deviations ? ` · ${deviations} gespeicherte Werte neu berechnet` : ''}`;
    } else {
      const changed = !doc.integrity.ok || deviations > 0;
      status.classList.toggle('changed', changed);
      status.textContent = changed ? 'Eingefrorene Fassung VERÄNDERT' : 'Eingefroren: gespeicherte Werte, kein Rechner';
    }
  }

  /** Banner above a frozen version: what it is, and whether it was changed (HPF-FRZ-003/005). */
  private updateVersionBanner(): void {
    const banner = $('version-banner');
    const doc = this.doc;
    banner.replaceChildren();
    banner.classList.remove('changed');
    banner.removeAttribute('role');
    if (!doc || doc.version.id === null) {
      banner.hidden = true;
      return;
    }
    const v = doc.version;
    const states = this.calc?.allStates() ?? [];
    const deviations = states.flatMap((x) => x.deviations);
    const bad = doc.integrity.resources.filter((r) => r.status !== 'ok');
    const changed = !doc.integrity.ok || deviations.length > 0 || this.versionSignature.startsWith('ungültig');
    const p1 = document.createElement('p');
    p1.textContent = `${v.label} (Profil ${v.profile}): Werte wie berechnet${v.computedAt ? ` am ${v.computedAt}` : ''}${v.calculator ? ` mit ${v.calculator}` : ''}; in dieser Fassung wird nicht gerechnet.`;
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = 'Hauptfassung anzeigen';
    back.addEventListener('click', () => void this.switchVersion(null));
    p1.append(back);
    const p2 = document.createElement('p');
    const parts = [
      doc.integrity.ok ? 'Dateien unverändert (SHA-256 wie im Fassungsmanifest)' : `Dateien VERÄNDERT: ${bad.map((r) => `${r.path} (${r.status === 'missing' ? 'fehlt' : 'Prüfsumme weicht ab'})`).join(', ')}`,
      `Signatur: ${this.versionSignature || 'wird geprüft …'}`,
      deviations.length === 0 ? 'Nachrechnung: keine Abweichung' : `Nachrechnung: ${deviations.length} Abweichung(en) zwischen gespeichertem und nachgerechnetem Wert (${deviations.map((d) => `${d.address}: gespeichert ${d.stored}, nachgerechnet ${d.computed}`).join('; ')})`,
    ];
    p2.textContent = `${changed ? 'Achtung, diese eingefrorene Fassung wurde verändert. ' : ''}Prüfung: ${parts.join(' · ')}.`;
    banner.append(p1, p2);
    banner.classList.toggle('changed', changed);
    if (changed) banner.setAttribute('role', 'alert');
    banner.hidden = false;
  }

  /**
   * Bar "Sperren" above the document (P17): which rules the shown version has, whether a valid
   * signature covers them (HP-LOCK-006), and the actions "Einblenden" (HP-LOCK-005) and
   * "Entsiegeln" (HPC-0007). It says plainly that rules are no protection against reading.
   */
  private updateLockBanner(): void {
    const banner = $('lock-banner');
    const doc = this.doc;
    banner.replaceChildren();
    if (!doc || doc.access.length === 0) {
      banner.hidden = true;
      return;
    }
    const count = (rule: string) => doc.access.filter((a) => a.rules.includes(rule)).length;
    const stillSealed = doc.sealed.filter((s) => doc.content.find((c) => c.path === s.path)?.dom.getElementById(s.id)?.hasAttribute('data-hp-sealed'));
    const parts: string[] = [];
    if (count('hidden')) parts.push(`${count('hidden')} ${count('hidden') === 1 ? 'ausgeblendeter Abschnitt' : 'ausgeblendete Abschnitte'}`);
    if (doc.sealed.length) parts.push(`${doc.sealed.length} versiegelt${stillSealed.length < doc.sealed.length ? ` (${doc.sealed.length - stillSealed.length} hier entsiegelt)` : ''}`);
    if (count('read-only')) parts.push(`${count('read-only')} nur lesen`);
    if (count('no-print')) parts.push(`${count('no-print')} nicht drucken`);
    if (count('no-export')) parts.push(`${count('no-export')} nicht exportieren`);
    const p1 = document.createElement('p');
    p1.textContent = `Sperren: ${parts.join(', ')}. Nachweis: ${this.lockStatus || 'wird geprüft …'}.`;
    if (count('hidden')) {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'btn-show-hidden';
      b.textContent = this.showHidden ? 'Ausgeblendete wieder ausblenden' : 'Ausgeblendete einblenden';
      b.setAttribute('aria-pressed', String(this.showHidden));
      b.addEventListener('click', () => {
        this.showHidden = !this.showHidden;
        this.updateLockBanner();
        this.render(this.index, this.position.address ? { id: this.position.address } : {});
        this.announce(this.showHidden ? 'Ausgeblendete Abschnitte eingeblendet' : 'Ausgeblendete Abschnitte ausgeblendet');
      });
      p1.append(b);
    }
    if (stillSealed.length > 0) {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'btn-unseal';
      b.textContent = 'Entsiegeln …';
      b.addEventListener('click', () => this.openUnsealDialog());
      p1.append(b);
    }
    const p2 = document.createElement('p');
    p2.className = 'hint';
    p2.textContent = 'Nur lesen, nicht drucken, nicht exportieren und ausgeblendet sind Regeln, die hpro-Programme befolgen – der Text liegt trotzdem in der Datei. Nicht lesbar ist nur ein versiegelter Abschnitt, und auch der nur bis zur Eingabe des Schlüssels.';
    banner.append(p1, p2);
    banner.hidden = false;
  }

  private async checkLockStatus(doc: LoadedDocument): Promise<void> {
    let text: string;
    try {
      const r = await lock.lockEvidence(doc.bytes, doc.version.id, {});
      text = r.status === 'nachweisbar' ? 'nachweisbar (gültige Signatur deckt die Sperren)' : r.status === 'Sperre nicht signiert' ? 'Sperre nicht signiert' : r.status === 'kryptografisch intakt, Vertrauen nicht geprüft' ? 'Sperren signiert, Signatur rechnerisch intakt, Unterzeichner nicht über einen Vertrauensanker geprüft' : r.status;
    } catch (err) {
      text = `nicht prüfbar (${String(err)})`;
    }
    if (this.doc !== doc) return;
    this.lockStatus = text;
    this.updateLockBanner();
  }

  private openUnsealDialog(): void {
    const dialog = $<HTMLDialogElement>('dlg-unseal');
    $<HTMLInputElement>('unseal-password').value = '';
    $('unseal-status').textContent = '';
    dialog.showModal();
    $<HTMLInputElement>('unseal-password').focus();
  }

  private async unseal(password: string): Promise<void> {
    const doc = this.doc;
    if (!doc) return;
    const status = $('unseal-status');
    status.textContent = 'Wird entschlüsselt …';
    const r = await unsealAll(doc.sealed, doc.files, doc.content, password);
    if (this.doc !== doc) return;
    if (r.opened.length === 0) {
      status.textContent = `Nicht geöffnet: ${r.failed.map((f) => f.reason).join('; ') || 'kein versiegelter Abschnitt mehr'}.`;
      return;
    }
    $<HTMLDialogElement>('dlg-unseal').close();
    $<HTMLInputElement>('unseal-password').value = '';
    this.updateLockBanner();
    const first = r.opened[0]!.split('#')[1];
    this.render(this.index, first ? { id: first } : {});
    this.announce(`${r.opened.length} versiegelter Abschnitt entsiegelt${r.failed.length ? `, ${r.failed.length} nicht` : ''}`);
  }

  /** Signature of the shown rendition, checked with the core (no trust anchors in the reader). */
  private async checkVersionSignature(doc: LoadedDocument): Promise<void> {
    const prefix = `renditions/${doc.version.id}/`;
    let text: string;
    try {
      const report = await validateContainer(doc.bytes, {});
      const sigs = report.signatures.filter((s) => s.signedPaths.some((p) => p.startsWith(prefix)));
      if (sigs.length === 0) text = 'nicht signiert';
      else if (sigs.some((s) => s.indication === 'TOTAL_FAILED')) {
        const s = sigs.find((x) => x.indication === 'TOTAL_FAILED')!;
        text = `ungültig – ${s.subIndication === 'HASH_FAILURE' ? 'Inhalt nach dem Signieren verändert' : 'Signatur fehlerhaft'} (${s.indication}/${s.subIndication ?? ''})`;
      } else if (sigs.every((s) => s.indication === 'TOTAL_PASSED')) text = 'gültig';
      else {
        const s = sigs[0]!;
        text = `rechnerisch intakt, Unterzeichner ${s.signerSubject ?? 'unbekannt'} nicht über einen Vertrauensanker geprüft (${s.indication}${s.subIndication ? '/' + s.subIndication : ''})`;
      }
    } catch (err) {
      text = `nicht prüfbar (${String(err)})`;
    }
    if (this.doc !== doc) return;
    this.versionSignature = text;
    this.updateVersionBanner();
  }

  private async switchVersion(id: string | null): Promise<void> {
    const doc = this.doc;
    if (!doc || doc.version.id === id) return;
    await this.open(doc.bytes, doc.fileName, id);
    this.announce(id === null ? 'Hauptfassung' : `Eingefrorene Fassung ${id}`);
  }

  private openCalcDialog(): void {
    const doc = this.doc;
    const calc = this.calc;
    if (!doc || !calc) return;
    const field = $('calc-version-field');
    const select = $<HTMLSelectElement>('calc-version');
    select.replaceChildren();
    for (const v of doc.versions) {
      const o = document.createElement('option');
      o.value = v.id ?? '';
      o.textContent = `${v.label}${v.id === null ? ' (lebendig, rechnet)' : ` (Profil ${v.profile})`}`;
      o.selected = v.id === doc.version.id;
      select.append(o);
    }
    field.hidden = doc.versions.length < 2;
    const facts = $('calc-facts');
    facts.replaceChildren();
    const row = (term: string, value: string) => {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = value;
      facts.append(dt, dd);
    };
    const states = calc.allStates();
    row('Fassung', `${doc.version.label}, Profil ${doc.version.profile}`);
    const calculator = kernCalc.CALCULATOR;
    row('Rechner', calc.mode === 'live' ? `${calculator.name} ${calculator.version} (Teil 3 v${calculator.spec}), rechnet in diesem Reader` : 'kein Rechner: es werden die gespeicherten Werte gezeigt');
    if (doc.version.computedAt || doc.version.calculator) row('Zuletzt berechnet', `${doc.version.computedAt ?? '–'}${doc.version.calculator ? ` mit ${doc.version.calculator}` : ''}`);
    row('Formeln', String(calc.formulaCount));
    row('Prüfregeln', String(states.reduce((n, x) => n + x.checks, 0)));
    row('Eingabezellen', calc.mode === 'live' ? `${states.reduce((n, x) => n + x.inputs, 0)} (ausgefüllt: ${calc.entryCount})` : 'keine (eingefroren)');
    const deviations = states.flatMap((x) => x.deviations);
    row(
      calc.mode === 'live' ? 'Gespeicherte Werte' : 'Nachrechnung',
      deviations.length === 0
        ? calc.mode === 'live' ? 'stimmen mit der Berechnung überein' : 'keine Abweichung'
        : calc.mode === 'live'
          ? `${deviations.length} wichen von der Berechnung ab; angezeigt werden die berechneten Werte, die Datei bleibt unverändert, bis Sie speichern`
          : `${deviations.length} Abweichung(en) zwischen gespeichertem und nachgerechnetem Wert; angezeigt bleibt der gespeicherte Wert`,
    );
    if (doc.version.id !== null) {
      row('Dateien der Fassung', doc.integrity.ok ? 'unverändert' : `VERÄNDERT: ${doc.integrity.resources.filter((r) => r.status !== 'ok').map((r) => r.path).join(', ')}`);
      row('Signatur', this.versionSignature || 'wird geprüft …');
    }
    const notes = $('calc-notes');
    notes.replaceChildren();
    const list = (title: string, items: string[]) => {
      if (items.length === 0) return;
      const p = document.createElement('p');
      p.textContent = title;
      const ul = document.createElement('ul');
      ul.className = 'calc-list';
      for (const i of items) {
        const li = document.createElement('li');
        li.textContent = i;
        ul.append(li);
      }
      notes.append(p, ul);
    };
    list('Abweichungen:', deviations.map((d) => `${d.address} ${d.formula}: gespeichert ${d.stored}, berechnet ${d.computed}`));
    list('Zirkelbezüge (#CIRC!):', states.flatMap((x) => x.circular));
    list('Nicht berechnet (Formel ohne gespeicherten Wert):', calc.mode === 'live' ? [] : states.flatMap((x) => x.notComputed));
    list('Möglicherweise veraltete Tabellen:', calc.mode === 'live' ? [] : states.flatMap((x) => x.stale));
    const tables = $('calc-tables');
    tables.replaceChildren();
    const base = doc.fileName.replace(/\.[^.]+$/, '');
    for (const st of states) {
      for (const t of st.tables) {
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.textContent = `${t.caption || 'Tabelle'} (${t.key}, ${t.rows} × ${t.cols})`;
        li.append(label);
        for (const format of ['csv', 'json'] as const) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = format.toUpperCase();
          b.setAttribute('aria-label', `${t.caption || t.key} als ${format.toUpperCase()} exportieren`);
          b.addEventListener('click', () => void calc.export(st.path, t.key, format).then((bytes) => download(bytes, `${base}-${t.key.replace(/[^A-Za-z0-9_-]/g, '')}.${format}`, format === 'csv' ? 'text/csv' : 'application/json')));
          li.append(b);
        }
        tables.append(li);
      }
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = `Alle Tabellen von ${st.path} als OpenDocument-Tabelle`;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'ODS';
      b.setAttribute('aria-label', `Alle Tabellen von ${st.path} als OpenDocument-Tabelle exportieren`);
      b.addEventListener('click', () => void calc.export(st.path, '', 'ods').then((bytes) => download(bytes, `${base}.ods`, 'application/vnd.oasis.opendocument.spreadsheet')));
      li.append(label, b);
      tables.append(li);
    }
    if (!calc.hasTables) tables.textContent = 'Diese Fassung enthält keine Tabellen.';
    $<HTMLButtonElement>('calc-save').hidden = calc.mode !== 'live' || calc.entryCount === 0;
    $<HTMLDialogElement>('dlg-calc').showModal();
  }

  private onPosition(position: Position): void {
    this.position = position;
    this.viewer.dataset['pages'] = String(position.pages);
    $('pos-section').textContent = position.label;
    $('pos-page').textContent = this.mode === 'page' && position.pages > 0 ? `· Seite ${position.page} von ${position.pages}` : '';
    const path = this.current?.path;
    let marked: HTMLAnchorElement | undefined;
    for (const id of position.ids) {
      marked = this.tocLinks.find((t) => t.item.target.path === path && t.item.target.id === id)?.link;
      if (marked) break;
    }
    marked ??= this.tocLinks.find((t) => t.item.target.path === path && t.item.target.id === undefined)?.link;
    for (const { link } of this.tocLinks) {
      if (link === marked) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }

  private onLink(href: string): void {
    const content = this.current;
    const doc = this.doc;
    if (!content || !doc) return;
    if (EXTERNAL_SCHEMES.test(href.trim()) || /^[a-z][a-z0-9+.-]*:/i.test(href.trim())) {
      this.showExternal(href.trim());
      return;
    }
    const resolved = resolvePath(content.path, href);
    if (!resolved) {
      this.announce('Verweis ungültig oder außerhalb des Containers.');
      return;
    }
    if (doc.content.some((c) => c.path === resolved.path)) {
      this.navigate({ path: resolved.path, id: resolved.fragment }, true);
      return;
    }
    const bytes = doc.files.get(resolved.path);
    if (!bytes) {
      this.announce(`Verweisziel ${resolved.path} fehlt im Container.`);
      return;
    }
    // A file of the container that is not a content document: hand it out for saving.
    const blob = new Blob([new Uint8Array(bytes)], { type: doc.mediaTypes.get(resolved.path) ?? 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = resolved.path.split('/').pop() ?? 'datei';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  navigate(address: Address, focus: boolean): boolean {
    const doc = this.doc;
    if (!doc) return false;
    const index = doc.content.findIndex((c) => c.path === address.path);
    if (index < 0) return false;
    const target: GotoTarget = { id: address.id, focus };
    if (index !== this.index || this.renderedQuery !== (this.result?.query ?? '')) this.render(index, target);
    else this.goto(address.id === undefined ? { focus } : target);
    if (focus) this.focusFrame();
    return true;
  }

  private focusFrame(): void {
    this.host.focus();
    this.post({ type: 'focus' });
  }

  // ------------------------------------------------------------------ table of contents

  private buildToc(): void {
    const doc = this.doc;
    const tree = $('toc-tree');
    this.tocLinks = [];
    if (!doc) return;
    const build = (items: readonly TocItem[]): HTMLOListElement => {
      const ol = document.createElement('ol');
      for (const item of items) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#${encodeURIComponent(shortAddress(item.target))}`;
        a.textContent = item.label;
        a.addEventListener('click', (e) => {
          e.preventDefault();
          this.navigate(item.target, true);
          if (!WIDE.matches) this.setPanel('toc', false);
        });
        this.tocLinks.push({ item, link: a });
        li.append(a);
        if (item.children.length > 0) li.append(build(item.children));
        ol.append(li);
      }
      return ol;
    };
    tree.replaceChildren(build(doc.toc));
    if (flattenToc(doc.toc).length === 0) tree.textContent = 'Dieses Dokument hat kein Inhaltsverzeichnis.';
  }

  // ------------------------------------------------------------------ panels

  private bindPanels(): void {
    $('btn-toc').addEventListener('click', () => this.togglePanel('toc'));
    $('btn-search').addEventListener('click', () => this.togglePanel('search'));
    $('btn-edit').addEventListener('click', () => this.togglePanel('edit'));
    $('btn-annot').addEventListener('click', () => this.togglePanel('annot'));
    for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-close]'))) {
      button.addEventListener('click', () => this.setPanel(button.dataset['close'] as PanelName, false, true));
    }
  }

  private panelOpen(which: PanelName): boolean {
    return !$(`${which}-panel`).hidden;
  }

  private togglePanel(which: PanelName): void {
    const open = !this.panelOpen(which);
    this.setPanel(which, open, !open);
    if (open) {
      if (which === 'search') $<HTMLInputElement>('search-input').focus();
      else if (which === 'edit') void this.editor?.show().then(() => (document.querySelector<HTMLElement>('#edit-blocks .edit-block') ?? $('edit-heading')).focus());
      else if (which === 'annot') void this.annotations?.ready().then(() => {
        this.annotations?.render();
        $('annot-heading').setAttribute('tabindex', '-1');
        $('annot-heading').focus();
      });
      else (document.querySelector<HTMLElement>('#toc-tree a[aria-current]') ?? document.querySelector<HTMLElement>('#toc-tree a'))?.focus();
    }
  }

  /**
   * Opens or closes a panel; on narrow screens only one panel is open at a time, on wide screens
   * search and editing share the right column.
   */
  private setPanel(which: PanelName, open: boolean, returnFocus = false): void {
    const panel = $(`${which}-panel`);
    const button = $(PANEL_BUTTON[which]);
    const hadFocus = panel.contains(document.activeElement);
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      for (const other of ['toc', 'search', 'edit', 'annot'] as const) {
        if (other === which) continue;
        if (!WIDE.matches || (other !== 'toc' && which !== 'toc')) this.setPanel(other, false);
      }
    }
    this.syncPanelLayout();
    if (!open && returnFocus && hadFocus) button.focus();
  }

  private syncPanelLayout(): void {
    const layout = $('layout');
    layout.dataset['toc'] = String(this.panelOpen('toc'));
    layout.dataset['search'] = String(this.panelOpen('search'));
    layout.dataset['edit'] = String(this.panelOpen('edit'));
    layout.dataset['annot'] = String(this.panelOpen('annot'));
    if (!WIDE.matches && this.panelOpen('toc') && (this.panelOpen('search') || this.panelOpen('edit') || this.panelOpen('annot'))) this.setPanel('toc', false);
  }

  // ------------------------------------------------------------------ search

  private bindSearch(): void {
    $('search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.search($<HTMLInputElement>('search-input').value);
    });
    $('hit-next').addEventListener('click', () => this.stepHit(1));
    $('hit-prev').addEventListener('click', () => this.stepHit(-1));
  }

  search(query: string): void {
    const doc = this.doc;
    if (!doc) return;
    const trimmed = query.trim();
    const list = $('search-results');
    list.replaceChildren();
    this.activeHit = -1;
    if (trimmed === '') {
      this.result = undefined;
      $('search-status').textContent = 'Suche gelöscht.';
    } else {
      const result = searchDocuments(doc.content, trimmed);
      this.result = result;
      const docs = new Set(result.hits.map((h) => h.path)).size;
      $('search-status').textContent =
        result.hits.length === 0
          ? `Keine Treffer für „${trimmed}“.`
          : `${result.hits.length}${result.truncated ? '+' : ''} Treffer für „${trimmed}“ in ${docs} ${docs === 1 ? 'Dokumentteil' : 'Dokumentteilen'}.`;
      for (const [i, hit] of result.hits.entries()) {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'hit';
        button.dataset['hit'] = String(i);
        const where = document.createElement('span');
        where.className = 'hit-where';
        const content = doc.content.find((c) => c.path === hit.path);
        const hidden = !!content && isHidden({ access: doc.access, sealed: doc.sealed, showHidden: this.showHidden }, hit.path, content.dom, hit.id);
        where.textContent = `${hit.documentTitle} · ${shortAddress({ path: hit.path, id: hit.id })}${hidden ? ' · in ausgeblendetem Abschnitt' : ''}`;
        const text = document.createElement('span');
        text.className = 'hit-text';
        const mark = document.createElement('mark');
        mark.textContent = hit.snippet.hit;
        text.append(hit.snippet.before, mark, hit.snippet.after);
        button.append(text, where);
        button.addEventListener('click', () => {
          this.showHit(i, false);
          // On narrow screens the panel covers the document; show the hit instead.
          if (!WIDE.matches) this.setPanel('search', false);
        });
        li.append(button);
        list.append(li);
      }
    }
    this.updateHitButtons();
    // Re-render the shown part with (or without) marks, keeping the reading position.
    const keep = this.position.address ? { id: this.position.address } : {};
    this.render(this.index, keep);
  }

  private showHit(i: number, fromKeyboardStep: boolean): void {
    const hit = this.result?.hits[i];
    const doc = this.doc;
    if (!hit || !doc) return;
    this.activeHit = i;
    for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('#search-results .hit'))) {
      if (b.dataset['hit'] === String(i)) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    }
    const index = doc.content.findIndex((c) => c.path === hit.path);
    const target: GotoTarget = { hit: hit.ordinal };
    if (index !== this.index || this.renderedQuery !== this.result?.query) this.render(index, target);
    else this.goto(target);
    this.updateHitButtons();
    if (fromKeyboardStep) this.announce(`Treffer ${i + 1} von ${this.result?.hits.length ?? 0}: ${hit.snippet.before}${hit.snippet.hit}${hit.snippet.after}`);
  }

  private stepHit(delta: number): void {
    const count = this.result?.hits.length ?? 0;
    if (count === 0) return;
    const next = this.activeHit < 0 ? (delta > 0 ? 0 : count - 1) : (this.activeHit + delta + count) % count;
    this.showHit(next, true);
  }

  private updateHitButtons(): void {
    const has = (this.result?.hits.length ?? 0) > 0;
    $<HTMLButtonElement>('hit-prev').disabled = !has;
    $<HTMLButtonElement>('hit-next').disabled = !has;
  }

  // ------------------------------------------------------------------ view, zoom, appearance

  private bindToolbar(): void {
    $('btn-flow').addEventListener('click', () => this.setMode('flow'));
    $('btn-page').addEventListener('click', () => this.setMode('page'));
    $('btn-print').addEventListener('click', () => void this.print());
    $('btn-zoom-in').addEventListener('click', () => this.setZoom(zoomIn(this.settings.zoom)));
    $('btn-zoom-out').addEventListener('click', () => this.setZoom(zoomOut(this.settings.zoom)));
    $('btn-zoom-reset').addEventListener('click', () => this.setZoom(1));
    $('btn-prev-doc').addEventListener('click', () => this.stepDoc(-1));
    $('btn-next-doc').addEventListener('click', () => this.stepDoc(1));
  }

  setMode(mode: ViewMode): void {
    if (!this.doc || mode === this.mode) return;
    this.mode = mode;
    this.updateViewButtons();
    this.sendState();
    this.announce(mode === 'page' ? 'Seitenansicht (A4)' : 'Fließende Ansicht');
  }

  private updateViewButtons(): void {
    $('btn-flow').setAttribute('aria-pressed', String(this.mode === 'flow'));
    $('btn-page').setAttribute('aria-pressed', String(this.mode === 'page'));
    this.viewer.dataset['mode'] = this.mode;
    if (this.mode === 'flow') $('pos-page').textContent = '';
  }

  private setZoom(zoom: number): void {
    this.settings = { ...this.settings, zoom };
    saveSettings(window.localStorage, this.settings);
    this.updateZoomLabel();
    this.sendState();
  }

  private updateZoomLabel(): void {
    const percent = `${Math.round(this.settings.zoom * 100)} %`;
    const reset = $('btn-zoom-reset');
    reset.textContent = percent;
    reset.setAttribute('aria-label', `Zoom ${percent}, auf 100 % zurücksetzen`);
  }

  private stepDoc(delta: number): void {
    const doc = this.doc;
    if (!doc) return;
    const next = this.index + delta;
    if (next < 0 || next >= doc.content.length) return;
    this.render(next, { focus: false });
    this.announce(doc.content[next]?.title ?? '');
  }

  private updateDocButtons(): void {
    const count = this.doc?.content.length ?? 0;
    const prev = $<HTMLButtonElement>('btn-prev-doc');
    const next = $<HTMLButtonElement>('btn-next-doc');
    prev.disabled = this.index <= 0;
    next.disabled = this.index >= count - 1;
    const before = this.doc?.content[this.index - 1];
    const after = this.doc?.content[this.index + 1];
    prev.setAttribute('aria-label', before ? `Vorheriger Teil: ${before.title}` : 'Kein vorheriger Teil');
    next.setAttribute('aria-label', after ? `Nächster Teil: ${after.title}` : 'Kein nächster Teil');
  }

  private applyAppearance(): void {
    document.documentElement.dataset['scheme'] = this.scheme();
    this.sendState();
  }

  // ------------------------------------------------------------------ dialogs

  private bindDialogs(): void {
    $('unseal-form').addEventListener('submit', (e) => {
      e.preventDefault();
      void this.unseal($<HTMLInputElement>('unseal-password').value);
    });
    const settingsDialog = $<HTMLDialogElement>('dlg-settings');
    const selects: [string, keyof typeof CHOICES][] = [
      ['set-scheme', 'scheme'],
      ['set-line-height', 'lineHeight'],
      ['set-letter-spacing', 'letterSpacing'],
      ['set-word-spacing', 'wordSpacing'],
      ['set-paragraph-spacing', 'paragraphSpacing'],
      ['set-motion', 'motion'],
    ];
    const fill = () => {
      for (const [id, key] of selects) $<HTMLSelectElement>(id).value = String(this.settings[key]);
      $<HTMLInputElement>('set-single-keys').checked = this.settings.singleKeyShortcuts;
      $<HTMLInputElement>('set-live').checked = this.settings.liveContent;
    };
    $('btn-settings').addEventListener('click', () => {
      fill();
      settingsDialog.showModal();
    });
    for (const [id, key] of selects) {
      $<HTMLSelectElement>(id).addEventListener('change', (e) => {
        this.updateSettings({ [key]: (e.target as HTMLSelectElement).value } as Partial<Settings>);
      });
    }
    $<HTMLInputElement>('set-single-keys').addEventListener('change', (e) => {
      this.updateSettings({ singleKeyShortcuts: (e.target as HTMLInputElement).checked });
    });
    $<HTMLInputElement>('set-live').addEventListener('change', (e) => {
      this.updateSettings({ liveContent: (e.target as HTMLInputElement).checked });
    });
    $('btn-motion').addEventListener('click', () => this.toggleMotion());
    $('btn-live-save').addEventListener('click', () => void this.saveData());
    $('set-reset').addEventListener('click', () => {
      this.updateSettings({ ...DEFAULT_SETTINGS, zoom: this.settings.zoom });
      fill();
    });

    $('btn-address').addEventListener('click', () => this.openAddressDialog());
    for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-copy]'))) {
      button.addEventListener('click', () => void this.copy($<HTMLInputElement>(button.dataset['copy'] ?? '')));
    }
    $('addr-go-btn').addEventListener('click', () => this.gotoTyped());
    $('addr-go').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.gotoTyped();
      }
    });

    const linkDialog = $<HTMLDialogElement>('dlg-link');
    linkDialog.addEventListener('close', () => {
      if (linkDialog.returnValue === 'open' && this.pendingExternal) window.open(this.pendingExternal, '_blank', 'noopener,noreferrer');
      this.pendingExternal = '';
    });

    $('btn-info').addEventListener('click', () => this.openInfo());
    $('btn-calc').addEventListener('click', () => this.openCalcDialog());
    $<HTMLSelectElement>('calc-version').addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value;
      $<HTMLDialogElement>('dlg-calc').close();
      void this.switchVersion(value === '' ? null : value);
    });
    $('calc-save').addEventListener('click', () => {
      const doc = this.doc;
      const calc = this.calc;
      if (!doc || !calc) return;
      void calc.save(new Date()).then(
        (bytes) => {
          download(bytes, `${doc.fileName.replace(/\.[^.]+$/, '')}-ausgefuellt.hpro`, 'application/epub+zip');
          $('calc-status').textContent = `Gespeichert: ${calc.entryCount} Eingaben, Werte neu berechnet.`;
        },
        (err: unknown) => this.showError('Das Dokument konnte nicht gespeichert werden.', String(err)),
      );
    });
    $('btn-help').addEventListener('click', () => $<HTMLDialogElement>('dlg-help').showModal());
  }

  private updateSettings(change: Partial<Settings>): void {
    const before = this.settings;
    this.settings = { ...this.settings, ...change };
    saveSettings(window.localStorage, this.settings);
    this.updateZoomLabel();
    this.applyAppearance();
    // Live content switched on or off: the core decides anew and the frame is rebuilt; the
    // motion setting reaches components only with `ready`, so they start anew as well.
    const doc = this.doc;
    if (doc && (before.liveContent !== this.settings.liveContent || before.motion !== this.settings.motion)) {
      if (before.liveContent !== this.settings.liveContent) {
        this.plan = live.planComponents(doc.manifest as unknown as Record<string, unknown>, doc.files, { frozen: doc.version.id !== null, enabled: this.settings.liveContent });
      }
      this.render(this.index, this.position.address ? { id: this.position.address } : {});
      this.updateLiveStatus();
    }
  }

  private openAddressDialog(): void {
    const doc = this.doc;
    const content = this.current;
    if (!doc || !content) return;
    const address: Address = { path: content.path, id: this.position.address || undefined };
    $('addr-label').textContent = this.position.label ? `Aktueller Abschnitt: ${this.position.label}` : `Dokumentteil: ${content.title}`;
    $<HTMLInputElement>('addr-short').value = shortAddress(address);
    $<HTMLInputElement>('addr-long').value = longAddress(doc.id, address);
    $<HTMLInputElement>('addr-go').value = '';
    $('addr-status').textContent = '';
    $<HTMLDialogElement>('dlg-address').showModal();
  }

  private gotoTyped(): void {
    const doc = this.doc;
    if (!doc) return;
    const text = $<HTMLInputElement>('addr-go').value;
    const address = parseAddress(text, doc.id);
    if (!address || !this.navigate(address, true)) {
      $('addr-status').textContent = 'Diese Adresse gehört nicht zu diesem Dokument oder ist ungültig.';
      return;
    }
    $<HTMLDialogElement>('dlg-address').close();
  }

  private async copy(input: HTMLInputElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(input.value);
    } catch {
      input.select();
      document.execCommand('copy');
    }
    $('addr-status').textContent = `Kopiert: ${input.value}`;
  }

  private showExternal(url: string): void {
    this.pendingExternal = EXTERNAL_SCHEMES.test(url) ? url : '';
    $('link-url').textContent = url;
    $('link-note').textContent = this.pendingExternal ? '' : 'Verweise dieser Art öffnet der Reader nicht.';
    $<HTMLButtonElement>('link-open').hidden = !this.pendingExternal;
    $<HTMLDialogElement>('dlg-link').showModal();
  }

  private openInfo(): void {
    const doc = this.doc;
    if (!doc) return;
    const list = $('info-list');
    list.replaceChildren();
    const row = (term: string, value: string) => {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = value;
      list.append(dt, dd);
    };
    row('Titel', doc.title);
    if (doc.authors.length > 0) row('Autor', doc.authors.join(', '));
    row('Kennung', doc.id);
    row('Sprache', doc.language);
    row('Geändert', doc.modified);
    row('Profil', doc.profile);
    row('Datei', `${doc.fileName} (${new Intl.NumberFormat('de-AT').format(doc.byteLength)} Byte)`);
    row('Inhaltsdokumente', doc.content.map((c) => c.path).join(', '));
    row('Inhaltsverzeichnis', doc.tocSource === 'nav' ? 'aus dem Navigationsdokument' : 'aus den Überschriften erzeugt (kein Navigationsdokument)');
    const bad = doc.integrity.resources.filter((r) => r.status !== 'ok');
    row(
      'Integrität',
      doc.integrity.ok
        ? `alle ${doc.integrity.resources.length} Ressourcen stimmen mit den SHA-256-Werten in manifest.json überein`
        : `${bad.length} Ressource(n) weichen ab oder fehlen: ${bad.map((r) => `${r.path} (${r.status})`).join(', ')}${doc.integrity.problems.length ? `; ${doc.integrity.problems.join('; ')}` : ''}`,
    );
    const plan = this.planSnapshot;
    if (plan && plan.decisions.length > 0) {
      row('Lebendige Inhalte', plan.decisions.map((d) => `${d.name}@${d.version}: ${d.reason}`).join('; '));
    }
    row('Signaturdateien', doc.signatureFiles.length > 0 ? `${doc.signatureFiles.join(', ')} – die Signaturprüfung ist in diesem Reader noch nicht eingebaut` : 'keine');
    const notes = $('info-notes');
    notes.replaceChildren();
    for (const warning of doc.content.flatMap((c) => (c.parseWarning ? [c.parseWarning] : []))) {
      const p = document.createElement('p');
      p.className = 'warning';
      p.textContent = warning;
      notes.append(p);
    }
    $<HTMLDialogElement>('dlg-info').showModal();
  }

  private fillHelp(): void {
    const body = $('help-keys');
    for (const s of SHORTCUTS) {
      const tr = document.createElement('tr');
      const keys = document.createElement('td');
      for (const [i, k] of s.keys.entries()) {
        if (i > 0) keys.append(' oder ');
        const kbd = document.createElement('kbd');
        kbd.textContent = k;
        keys.append(kbd);
      }
      const what = document.createElement('td');
      what.textContent = s.label;
      tr.append(keys, what);
      body.append(tr);
    }
  }

  // ------------------------------------------------------------------ print (P18)

  /**
   * Prints the derived copy (Zusage 6): print.ts builds the print document of all content
   * documents, a hidden frame lays it out at the width of the type area, paginate.ts fills in
   * page numbers and code breaks, then the frame prints itself. The frame is sandboxed without
   * scripts (`allow-same-origin` lets the shell measure, `allow-modals` lets it print).
   */
  async print(): Promise<PaginationReport | undefined> {
    const doc = this.doc;
    if (!doc) return undefined;
    const status = $('live-status');
    status.textContent = 'Druckfassung wird erstellt …';
    let built: PrintBuild;
    try {
      built = buildPrintHtml(doc, {
        locks: { access: doc.access, sealed: doc.sealed, showHidden: false },
        unsavedEntries: this.calc?.mode === 'live' ? this.calc.entryCount : 0,
        ...(this.forms?.hasForms ? { forms: { data: (p: string) => this.forms?.dataFor(p), schema: (p: string) => this.forms?.schemaFor(p) } } : {}),
      });
    } catch (err) {
      status.textContent = '';
      this.showError('Die Druckfassung ließ sich nicht erstellen.', String(err));
      return undefined;
    }
    this.printFrame?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'print-frame';
    frame.className = 'print-frame';
    frame.title = 'Druckfassung';
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
    frame.dataset['state'] = 'loading';
    // Width of the printed type area, so that lines break as on paper.
    frame.style.width = `${TYPE_AREA_PX.width}px`;
    frame.style.height = `${TYPE_AREA_PX.height}px`;
    this.printFrame = frame;
    const loaded = new Promise<void>((resolve) => frame.addEventListener('load', () => resolve(), { once: true }));
    frame.srcdoc = built.html;
    document.body.append(frame);
    await loaded;
    const fdoc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!fdoc || !win || this.printFrame !== frame) return undefined;
    await Promise.all(Array.from(fdoc.images).map((img) => img.decode().catch(() => undefined)));
    await fdoc.fonts.ready;
    const report = paginate(fdoc);
    frame.dataset['state'] = 'ready';
    frame.dataset['report'] = JSON.stringify({ ...report, live: built.live, omitted: built.omitted, headings: built.headings, tocEntries: built.tocEntries });
    const problems = report.overflow.length + report.unmarkedWraps;
    status.textContent = `Druckfassung: ${report.pages} Seiten A4${report.toc ? ', mit Verzeichnis' : ''}, ${built.live.length} lebendige Elemente als Standbild${problems ? `, ${problems} Auffälligkeiten (Info)` : ''}`;
    this.announce(`Druckfassung mit ${report.pages} Seiten erstellt, Druckdialog wird geöffnet.`);
    win.print();
    return report;
  }

  // ------------------------------------------------------------------ keyboard

  onKey(event: { key: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean; shiftKey: boolean; preventDefault(): void }, target: EventTarget | null): void {
    if (document.querySelector('dialog[open]')) return;
    const command = commandForKey(event, this.settings.singleKeyShortcuts);
    if (!command) return;
    if (command !== 'escape' && isTyping(target)) return;
    if (command !== 'escape' && command !== 'open' && command !== 'help' && !this.doc) return;
    event.preventDefault();
    this.run(command);
  }

  private run(command: Command): void {
    switch (command) {
      case 'search':
        this.setPanel('search', true);
        $<HTMLInputElement>('search-input').focus();
        $<HTMLInputElement>('search-input').select();
        break;
      case 'toc':
        this.togglePanel('toc');
        break;
      case 'toggle-view':
        this.setMode(this.mode === 'flow' ? 'page' : 'flow');
        break;
      case 'zoom-in':
        this.setZoom(zoomIn(this.settings.zoom));
        break;
      case 'zoom-out':
        this.setZoom(zoomOut(this.settings.zoom));
        break;
      case 'zoom-reset':
        this.setZoom(1);
        break;
      case 'next-hit':
        this.stepHit(1);
        break;
      case 'prev-hit':
        this.stepHit(-1);
        break;
      case 'open':
        $<HTMLInputElement>('file-input').click();
        break;
      case 'address':
        this.openAddressDialog();
        break;
      case 'help':
        $<HTMLDialogElement>('dlg-help').showModal();
        break;
      case 'prev-doc':
        this.stepDoc(-1);
        break;
      case 'next-doc':
        this.stepDoc(1);
        break;
      case 'print':
        void this.print();
        break;
      case 'escape':
        if (this.panelOpen('search')) this.setPanel('search', false, true);
        else if (this.panelOpen('toc') && !WIDE.matches) this.setPanel('toc', false, true);
        if (document.activeElement === document.body || document.activeElement === null) this.focusFrame();
        break;
    }
  }

  // ------------------------------------------------------------------ messages

  private announce(text: string): void {
    const status = $('search-status');
    if (!$('search-panel').hidden && text.startsWith('Treffer')) {
      status.textContent = text;
      return;
    }
    let live = document.getElementById('live');
    if (!live) {
      live = document.createElement('p');
      live.id = 'live';
      live.className = 'visually-hidden';
      live.setAttribute('role', 'status');
      document.body.append(live);
    }
    live.textContent = text;
  }

  private showError(message: string, detail: string): void {
    const box = $('error');
    box.replaceChildren();
    const p = document.createElement('p');
    p.textContent = message;
    const small = document.createElement('p');
    small.className = 'detail';
    small.textContent = `Technische Angabe: ${detail}`;
    box.append(p, small);
  }

  private clearError(): void {
    $('error').replaceChildren();
  }
}

new Reader().start();
