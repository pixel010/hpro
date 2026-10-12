/**
 * Keyboard commands of the reader (HP-RS-004). Single-character keys are only active while
 * no text field has focus and can be switched off in the settings (WCAG 2.1.4); Escape
 * always works. Combinations with Ctrl, Alt or Meta are left to the browser.
 */
export type Command =
  | 'search'
  | 'toc'
  | 'toggle-view'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'next-hit'
  | 'prev-hit'
  | 'open'
  | 'address'
  | 'help'
  | 'prev-doc'
  | 'next-doc'
  | 'escape';

export interface KeyInput {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

export const SHORTCUTS: ReadonlyArray<{ readonly keys: readonly string[]; readonly command: Command; readonly label: string }> = [
  { keys: ['/'], command: 'search', label: 'Suche öffnen' },
  { keys: ['n'], command: 'next-hit', label: 'Nächster Treffer' },
  { keys: ['N'], command: 'prev-hit', label: 'Vorheriger Treffer (Umschalt+N)' },
  { keys: ['t'], command: 'toc', label: 'Inhaltsverzeichnis ein- und ausblenden' },
  { keys: ['v'], command: 'toggle-view', label: 'Ansicht wechseln: fließend / Seiten' },
  { keys: ['+', '='], command: 'zoom-in', label: 'Vergrößern' },
  { keys: ['-'], command: 'zoom-out', label: 'Verkleinern' },
  { keys: ['0'], command: 'zoom-reset', label: 'Zoom 100 %' },
  { keys: ['['], command: 'prev-doc', label: 'Vorheriges Inhaltsdokument' },
  { keys: [']'], command: 'next-doc', label: 'Nächstes Inhaltsdokument' },
  { keys: ['a'], command: 'address', label: 'Adresse des Abschnitts kopieren oder anspringen' },
  { keys: ['o'], command: 'open', label: 'Datei öffnen' },
  { keys: ['?'], command: 'help', label: 'Tastenkürzel anzeigen' },
];

const BY_KEY = new Map<string, Command>(SHORTCUTS.flatMap((s) => s.keys.map((k) => [k, s.command] as const)));

export function commandForKey(input: KeyInput, singleKeys: boolean): Command | undefined {
  if (input.key === 'Escape') return 'escape';
  if (input.ctrlKey || input.altKey || input.metaKey) return undefined;
  if (!singleKeys) return undefined;
  return BY_KEY.get(input.key);
}

/** True when the key goes to a text field and must not trigger a command. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) return !['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range', 'color'].includes(target.type);
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}
