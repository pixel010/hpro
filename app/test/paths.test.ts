import { describe, expect, it } from 'vitest';
import { isAbsoluteUrl, longAddress, parseAddress, resolvePath, shortAddress, splitFragment } from '../src/paths.js';

describe('paths', () => {
  it('recognises absolute and protocol-relative URLs', () => {
    expect(isAbsoluteUrl('https://example.org/')).toBe(true);
    expect(isAbsoluteUrl('mailto:a@example.org')).toBe(true);
    expect(isAbsoluteUrl('//example.org/x')).toBe(true);
    expect(isAbsoluteUrl('content/index.xhtml')).toBe(false);
    expect(isAbsoluteUrl('#leistung')).toBe(false);
  });

  it('splits the fragment from a reference', () => {
    expect(splitFragment('a.xhtml#b')).toEqual({ path: 'a.xhtml', fragment: 'b' });
    expect(splitFragment('a.xhtml')).toEqual({ path: 'a.xhtml', fragment: undefined });
  });

  it('resolves relative references inside the container', () => {
    expect(resolvePath('content/nav.xhtml', 'index.xhtml#leistung')).toEqual({ path: 'content/index.xhtml', fragment: 'leistung' });
    expect(resolvePath('content/a/b.xhtml', '../c.xhtml')).toEqual({ path: 'content/c.xhtml', fragment: undefined });
    expect(resolvePath('content/a.xhtml', './bild%20eins.png?x=1')).toEqual({ path: 'content/bild eins.png', fragment: undefined });
    expect(resolvePath('content/a.xhtml', '#teil%202')).toEqual({ path: 'content/a.xhtml', fragment: 'teil 2' });
  });

  it('refuses absolute URLs, root paths and references leaving the container', () => {
    expect(resolvePath('content/a.xhtml', 'https://example.org/')).toBeUndefined();
    expect(resolvePath('content/a.xhtml', '/etc/passwd')).toBeUndefined();
    expect(resolvePath('content/a.xhtml', '../../x.xhtml')).toBeUndefined();
    expect(resolvePath('content/a.xhtml', '   ')).toBeUndefined();
  });

  it('formats short and long addresses (HP-ADR-003)', () => {
    const a = { path: 'content/index.xhtml', id: 'leistung' };
    expect(shortAddress(a)).toBe('content/index.xhtml#leistung');
    expect(shortAddress({ path: 'content/index.xhtml', id: undefined })).toBe('content/index.xhtml');
    expect(longAddress('urn:uuid:1', a)).toBe('urn:uuid:1!/content/index.xhtml#leistung');
  });

  it('parses short and long addresses of the open document only', () => {
    expect(parseAddress('content/index.xhtml#leistung', 'urn:uuid:1')).toEqual({ path: 'content/index.xhtml', id: 'leistung' });
    expect(parseAddress(' urn:uuid:1!/content/index.xhtml ', 'urn:uuid:1')).toEqual({ path: 'content/index.xhtml', id: undefined });
    expect(parseAddress('urn:uuid:2!/content/index.xhtml', 'urn:uuid:1')).toBeUndefined();
    expect(parseAddress('content/bild.png', 'urn:uuid:1')).toBeUndefined();
    expect(parseAddress('content/index.xhtml#1abc', 'urn:uuid:1')).toBeUndefined();
  });
});
