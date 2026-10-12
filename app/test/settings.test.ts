import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, ZOOM_STEPS, frameVars, parseSettings, resolveScheme, zoomIn, zoomOut } from '../src/settings.js';
import { commandForKey } from '../src/shortcuts.js';

describe('settings (HP-RS-002)', () => {
  it('steps through the zoom levels and stops at both ends', () => {
    expect(zoomIn(1)).toBe(1.1);
    expect(zoomOut(1)).toBe(0.9);
    expect(zoomIn(3)).toBe(3);
    expect(zoomOut(0.5)).toBe(0.5);
    expect(ZOOM_STEPS).toContain(2);
  });

  it('scales text in the flowing view and keeps print size in the page view', () => {
    const s = { ...DEFAULT_SETTINGS, zoom: 2, lineHeight: '1.8', letterSpacing: '0.12em', wordSpacing: '0.16em', paragraphSpacing: '2em' };
    expect(frameVars(s, 'flow', 'light')).toEqual({
      'font-size': '200%',
      '--hp-font-size': '1rem',
      '--hp-line-height': '1.8',
      '--hp-letter-spacing': '0.12em',
      '--hp-word-spacing': '0.16em',
      '--hp-paragraph-spacing': '2em',
    });
    expect(frameVars(s, 'page', 'light')['font-size']).toBe('100%');
  });

  it('sets colours only for dark and high-contrast schemes', () => {
    expect(frameVars(DEFAULT_SETTINGS, 'flow', 'light')['--hp-background']).toBeUndefined();
    expect(frameVars(DEFAULT_SETTINGS, 'flow', 'contrast')).toMatchObject({ '--hp-foreground': '#ffffff', '--hp-background': '#000000' });
    expect(resolveScheme('system', true)).toBe('dark');
    expect(resolveScheme('system', false)).toBe('light');
    expect(resolveScheme('contrast', false)).toBe('contrast');
  });

  it('accepts stored settings only with known values', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('kein json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ zoom: 7, lineHeight: '9', scheme: 'neon', singleKeyShortcuts: 'ja' }))).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ zoom: 1.5, lineHeight: '2', scheme: 'dark', singleKeyShortcuts: false }))).toEqual({
      ...DEFAULT_SETTINGS,
      zoom: 1.5,
      lineHeight: '2',
      scheme: 'dark',
      singleKeyShortcuts: false,
    });
  });
});

describe('keyboard commands (HP-RS-004)', () => {
  const key = (k: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; metaKey: boolean }> = {}) => ({ key: k, ctrlKey: false, altKey: false, metaKey: false, ...mods });

  it('maps single keys to commands', () => {
    expect(commandForKey(key('/'), true)).toBe('search');
    expect(commandForKey(key('v'), true)).toBe('toggle-view');
    expect(commandForKey(key('+'), true)).toBe('zoom-in');
    expect(commandForKey(key('='), true)).toBe('zoom-in');
    expect(commandForKey(key('N'), true)).toBe('prev-hit');
    expect(commandForKey(key('x'), true)).toBeUndefined();
  });

  it('leaves modified keys to the browser and honours the switch-off (WCAG 2.1.4)', () => {
    expect(commandForKey(key('f', { ctrlKey: true }), true)).toBeUndefined();
    expect(commandForKey(key('+', { metaKey: true }), true)).toBeUndefined();
    expect(commandForKey(key('v'), false)).toBeUndefined();
    expect(commandForKey(key('Escape'), false)).toBe('escape');
  });
});
