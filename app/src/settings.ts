/**
 * Reader settings (HP-RS-002): zoom, line height, letter, word and paragraph spacing, colour
 * scheme, whether single-key shortcuts are active, motion (follow the system or always reduce,
 * HP-INH-014) and whether live content (components) runs at all (P15). They belong to the reader, not to a
 * document, and are kept in localStorage of the reader's own origin.
 */
import type { ViewMode } from './render.js';

export type Scheme = 'system' | 'light' | 'dark' | 'contrast';
export type ResolvedScheme = 'light' | 'dark' | 'contrast';

export interface Settings {
  readonly zoom: number;
  /** '' = value of the document. */
  readonly lineHeight: string;
  readonly letterSpacing: string;
  readonly wordSpacing: string;
  readonly paragraphSpacing: string;
  readonly scheme: Scheme;
  /** WCAG 2.1.4: single-character shortcuts can be switched off. */
  readonly singleKeyShortcuts: boolean;
  /** `system`: follow prefers-reduced-motion; `reduce`: always reduce, whatever the system says. */
  readonly motion: Motion;
  /** False: components never run, documents show their static equivalents. */
  readonly liveContent: boolean;
}

export type Motion = 'system' | 'reduce';

export const DEFAULT_SETTINGS: Settings = {
  zoom: 1,
  lineHeight: '',
  letterSpacing: '',
  wordSpacing: '',
  paragraphSpacing: '',
  scheme: 'system',
  singleKeyShortcuts: true,
  motion: 'system',
  liveContent: true,
};

/** Zoom levels; the flowing view scales the text (100–300 %), the page view the page. */
export const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

/** Choices offered in the settings dialog; the first entry is "as in the document". */
export const CHOICES = {
  lineHeight: ['', '1.2', '1.5', '1.8', '2'],
  letterSpacing: ['', '0.05em', '0.12em'],
  wordSpacing: ['', '0.16em', '0.32em'],
  paragraphSpacing: ['', '1.5em', '2em'],
  scheme: ['system', 'light', 'dark', 'contrast'],
  motion: ['system', 'reduce'],
} as const;

const COLOURS: Record<ResolvedScheme, { foreground: string; background: string } | undefined> = {
  light: undefined,
  dark: { foreground: '#e6e4e0', background: '#1b1c1e' },
  contrast: { foreground: '#ffffff', background: '#000000' },
};

export function zoomIn(zoom: number): number {
  return ZOOM_STEPS.find((z) => z > zoom + 1e-6) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]!;
}

export function zoomOut(zoom: number): number {
  return [...ZOOM_STEPS].reverse().find((z) => z < zoom - 1e-6) ?? ZOOM_STEPS[0]!;
}

export function resolveScheme(scheme: Scheme, prefersDark: boolean): ResolvedScheme {
  if (scheme === 'system') return prefersDark ? 'dark' : 'light';
  return scheme;
}

/**
 * Root style of the document frame. Font size: the root gets the zoom as percentage and
 * `--hp-font-size` points at it (`1rem`), so documents that use the variable (HP-INH-004)
 * and documents that size their text in `rem`/`em` both follow the zoom. In the page view
 * the text keeps its print size and the whole page is scaled instead.
 */
export function frameVars(settings: Settings, mode: ViewMode, scheme: ResolvedScheme): Record<string, string> {
  const vars: Record<string, string> = {
    'font-size': mode === 'flow' ? `${Math.round(settings.zoom * 100)}%` : '100%',
    '--hp-font-size': '1rem',
  };
  if (settings.lineHeight) vars['--hp-line-height'] = settings.lineHeight;
  if (settings.letterSpacing) vars['--hp-letter-spacing'] = settings.letterSpacing;
  if (settings.wordSpacing) vars['--hp-word-spacing'] = settings.wordSpacing;
  if (settings.paragraphSpacing) vars['--hp-paragraph-spacing'] = settings.paragraphSpacing;
  const colours = COLOURS[scheme];
  if (colours) {
    vars['--hp-foreground'] = colours.foreground;
    vars['--hp-background'] = colours.background;
  }
  return vars;
}

const KEY = 'hpro-reader-settings';

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Reads stored settings; unknown or broken values fall back to the defaults. */
export function parseSettings(text: string | null): Settings {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = text ? JSON.parse(text) : {};
    if (parsed && typeof parsed === 'object') raw = parsed as Record<string, unknown>;
  } catch {
    raw = {};
  }
  const zoom = typeof raw['zoom'] === 'number' && (ZOOM_STEPS as readonly number[]).includes(raw['zoom']) ? raw['zoom'] : DEFAULT_SETTINGS.zoom;
  return {
    zoom,
    lineHeight: pick(raw['lineHeight'], CHOICES.lineHeight, ''),
    letterSpacing: pick(raw['letterSpacing'], CHOICES.letterSpacing, ''),
    wordSpacing: pick(raw['wordSpacing'], CHOICES.wordSpacing, ''),
    paragraphSpacing: pick(raw['paragraphSpacing'], CHOICES.paragraphSpacing, ''),
    scheme: pick(raw['scheme'], CHOICES.scheme, 'system'),
    singleKeyShortcuts: typeof raw['singleKeyShortcuts'] === 'boolean' ? raw['singleKeyShortcuts'] : true,
    motion: pick(raw['motion'], CHOICES.motion, 'system'),
    liveContent: typeof raw['liveContent'] === 'boolean' ? raw['liveContent'] : true,
  };
}

export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined): Settings {
  try {
    return parseSettings(storage?.getItem(KEY) ?? null);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(storage: Pick<Storage, 'setItem'> | undefined, settings: Settings): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private mode or full storage: settings then last for this session only.
  }
}
