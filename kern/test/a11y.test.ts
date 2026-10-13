// Package P8: accessibility check with direct corrections.
//
// Acceptance criteria covered here (the reader side is app/e2e/pruefen.spec.ts):
//   1. the check finds at least five categories in the deliberately faulty test document
//      (docs/spezifikation/beispiele/p8-barrierefreiheit/) — it finds all seven, 19 findings
//   2. the proposals are applicable and the second run finds nothing; the corrected container
//      keeps its integrity, gets a history entry and passes epubcheck 5.4.0 without messages
// plus unit tests of the parts: colours, stylesheet editing, language tags, the new editing
// operations with their limits (locks, values), and no false alarms on a clean document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { a11y, createContainer, edit, readContainer, sampleDocument, type DocumentInput } from '../src/index.js';
import { REPO_ROOT } from './helpers.js';

const EXAMPLE = resolve(REPO_ROOT, 'docs/spezifikation/beispiele/p8-barrierefreiheit');
const TYPES: Record<string, string> = { xhtml: 'application/xhtml+xml', css: 'text/css', svg: 'image/svg+xml', png: 'image/png' };
const I = 'content/index.xhtml';
const PLAN = `alt-dateiname@${I}#plan/img[1]`;
const PLAN_ALT = 'Lageplan des Hallenbads mit dem neuen barrierefreien Zugang an der Ostseite';
const dec = new TextDecoder();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
}

function exampleInput(patch: (path: string, text: string) => string = (_p, t) => t): DocumentInput {
  const doc = JSON.parse(readFileSync(join(EXAMPLE, 'dokument.json'), 'utf8')) as Omit<DocumentInput, 'resources'>;
  const resources = walk(EXAMPLE)
    .map((f) => relative(EXAMPLE, f).split('\\').join('/'))
    .filter((p) => p !== 'dokument.json')
    .map((path) => {
      const data = readFileSync(join(EXAMPLE, path));
      return { path, mediaType: TYPES[path.split('.').pop()!]!, data: /\.(xhtml|css)$/.test(path) ? patch(path, data.toString('utf8')) : data };
    });
  return { ...doc, resources };
}

async function example(patch?: (path: string, text: string) => string): Promise<Uint8Array> {
  return (await createContainer(exampleInput(patch))).bytes;
}

test('Abnahme 1: der Prüflauf findet im Testdokument Befunde in allen sieben Kategorien', async () => {
  const r = await a11y.auditContainer(await example());
  assert.deepEqual(r.counts, { struktur: 3, lesereihenfolge: 1, alternativtexte: 3, kontrast: 3, sprache: 3, tabellenkoepfe: 2, fokus: 4 });
  assert.ok(a11y.CATEGORIES.filter((c) => r.counts[c] > 0).length >= 5);
  assert.equal(r.findings.length, 19);
  assert.deepEqual(
    r.findings.map((f) => f.rule).sort(),
    ['alt-dateiname', 'alt-fehlt', 'css-reihenfolge', 'fokus-ohne-zweck', 'fokus-unsichtbar', 'grafik-ohne-namen', 'kontrast-text', 'kontrast-text', 'kontrast-text', 'kopfzellen-fehlen', 'link-ohne-namen', 'pseudo-liste', 'pseudo-ueberschrift', 'sprache-fehlt', 'sprache-ungueltig', 'sprachwechsel', 'tabelle-ohne-beschriftung', 'tabindex-positiv', 'ueberschrift-sprung'],
  );
  // every finding has a WCAG criterion and a proposal; only the file-name alt text needs input
  for (const f of r.findings) {
    assert.ok(f.wcag.length > 0, f.id);
    assert.ok(f.fix, `${f.id} has a proposal`);
  }
  const needInput = r.findings.filter((f) => f.fix?.input && f.fix.input.proposal === undefined).map((f) => f.id);
  assert.deepEqual(needInput, [PLAN]);
  // the contrast numbers (WCAG formula) of the three rules, per scheme
  const k = r.findings.filter((f) => f.rule === 'kontrast-text').map((f) => f.message);
  assert.match(k[0]!, /hell: 2,81:1 \(#9a9a9a auf #ffffff\)/);
  assert.match(k[1]!, /hell: 1,29:1 \(#f5f5f5 auf #ffd54f\); dunkel: 1,29:1/);
  assert.match(k[2]!, /hell: 2,08:1 \(#111111 auf #1f4e5f\)/);
});

test('Abnahme 2: Vorschläge anwenden, zweiter Lauf fehlerfrei, Container intakt mit Verlauf', async () => {
  const bytes = await example();
  const out = await a11y.fixContainer(bytes, { select: 'all', values: new Map([[PLAN, PLAN_ALT]]), at: '2026-10-13T09:00:00Z' });
  assert.equal(out.applied.length, 19);
  assert.deepEqual(out.skipped, []);
  assert.equal(out.after.findings.length, 0);
  const second = await a11y.auditContainer(out.saved!.bytes);
  assert.deepEqual(second.findings, []);
  const c = await readContainer(out.saved!.bytes);
  assert.ok(c.integrity.ok);
  const manifest = JSON.parse(dec.decode(c.files.get('manifest.json')!)) as { history: Array<{ version: number; note: string }> };
  assert.equal(manifest.history.length, 1);
  assert.match(manifest.history[0]!.note, /^Barrierefreiheit: 19 Korrekturen/);
  // text stays text: the corrections stand in the XHTML and CSS of the container
  const x = dec.decode(c.files.get(I)!);
  assert.match(x, /<html [^>]*xml:lang="de-AT" lang="de-AT">/);
  assert.match(x, /<h2 id="ueberblick-h">Überblick<\/h2>/);
  assert.match(x, /<h3 id="was-sich-aendert"><strong>Was sich ändert<\/strong><\/h3>/);
  assert.match(x, /<ul><li>Neue Lüftungsanlage mit Wärmerückgewinnung<\/li><li>Austausch der Beckenfolie und der Überlaufrinne<\/li><li>Barrierefreier Zugang mit Hublift<\/li><\/ul>/);
  assert.match(x, /<caption>Die Kosten im Überblick<\/caption>\s*<thead><tr><th scope="col">Posten<\/th><th scope="col">Betrag<\/th><\/tr><\/thead>/);
  assert.match(x, /<tr><th scope="row">Lüftung<\/th><td>1\.240\.000 €<\/td><\/tr>/);
  assert.match(x, /<p lang="en" xml:lang="en">The new ventilation/);
  assert.match(x, /<a href="#kosten" aria-label="Kosten">/);
  assert.doesNotMatch(x, /<[a-z][^>]*\stabindex=/);
  const css = dec.decode(c.files.get('content/styles/document.css')!);
  assert.match(css, /\.hinweis \{ color: var\(--hp-foreground\); font-size: 0\.9em; \}/);
  assert.match(css, /\.box-dunkel \{ background-color: #1f4e5f; padding: 0\.5em 1em; color: #[0-9a-f]{6}; \}/);
  assert.doesNotMatch(css, /row-reverse|outline: none/);
  // the comments of the source survive (only the addressed declarations changed)
  assert.match(css, /\/\* Fokusführung: Fokusmarkierung der Verweise entfernt \*\//);
  // the history journal restores the faulty original byte for byte
  const versions = await edit.listVersions(out.saved!.bytes);
  assert.deepEqual(versions.map((v) => [v.version, v.status]), [[1, 'current'], [0, 'exact']]);
});

test('Abnahme 2: ohne Eingabe bleibt nur der Befund ohne Vorschlag übrig (nichts wird erfunden)', async () => {
  const out = await a11y.fixContainer(await example(), { select: 'all', at: '2026-10-13T09:00:00Z' });
  assert.equal(out.applied.length, 18);
  assert.deepEqual(out.skipped.map((s) => [s.finding.id, s.reason]), [[PLAN, 'Eingabe nötig: Alternativtext (kein Vorschlag)']]);
  assert.deepEqual(out.after.findings.map((f) => f.id), [PLAN]);
  // an empty value marks the image as decorative instead (alt="")
  const deco = await a11y.fixContainer(out.saved!.bytes, { select: [PLAN], values: new Map([[PLAN, '']]), at: '2026-10-13T09:01:00Z' });
  assert.equal(deco.after.findings.length, 0);
  assert.match(dec.decode((await readContainer(deco.saved!.bytes)).files.get(I)!), /<img src="media\/plan\.png" alt=""\/>/);
});

test('Abnahme 2: einzelne Befunde nach Kennung, Werte aus der Eingabe', async () => {
  const out = await a11y.fixContainer(await example(), {
    select: [`sprache-ungueltig@${I}`, `alt-fehlt@${I}#abb-becken/img[1]`],
    values: new Map([[`alt-fehlt@${I}#abb-becken/img[1]`, 'Leeres Sportbecken mit alter blauer Folie']]),
    at: '2026-10-13T09:00:00Z',
  });
  assert.deepEqual(out.applied.map((a) => a.value), ['Leeres Sportbecken mit alter blauer Folie', 'de-AT']);
  assert.equal(out.after.findings.length, 17);
  assert.match(dec.decode((await readContainer(out.saved!.bytes)).files.get(I)!), /alt="Leeres Sportbecken mit alter blauer Folie"/);
});

test('kein Fehlalarm: das Beispieldokument des Kerns', async () => {
  const sample = await createContainer(sampleDocument());
  const r = await a11y.auditContainer(sample.bytes);
  assert.deepEqual(r.findings.map((f) => f.id), []);
});

test('epubcheck 5.4.0: das korrigierte Testdokument hat 0 Fehler und 0 Warnungen', async (t) => {
  const java = resolve(REPO_ROOT, 'prototyp/tools/jdk-21.0.12.1+1/bin/java');
  const jar = resolve(REPO_ROOT, 'prototyp/tools/epubcheck-5.4.0/epubcheck.jar');
  if (!existsSync(java) || !existsSync(jar)) {
    t.skip('tools missing (run prototyp/setup-tools.sh)');
    return;
  }
  const out = await a11y.fixContainer(await example(), { select: 'all', values: new Map([[PLAN, PLAN_ALT]]), at: '2026-10-13T09:00:00Z' });
  const dir = await mkdtemp(join(tmpdir(), 'hpro-p8-'));
  try {
    const file = join(dir, 'korrigiert.epub');
    await writeFile(file, out.saved!.bytes);
    let output: string;
    try {
      const { stdout, stderr } = await promisify(execFile)(java, ['-jar', jar, file], { timeout: 420_000 });
      output = stdout + stderr;
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      output = (e.stdout ?? '') + (e.stderr ?? '');
    }
    assert.match(output, /Messages: 0 fatals \/ 0 errors \/ 0 warnings/, output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------
// Parts

test('Kontrast nach WCAG: bekannte Werte und nächstliegende Farbe', () => {
  const c = (s: string) => a11y.parseColor(s)!;
  assert.equal(a11y.contrastRatio(c('#000'), c('#fff')).toFixed(2), '21.00');
  assert.equal(a11y.contrastRatio(c('#777777'), c('white')).toFixed(2), '4.48');
  assert.equal(a11y.contrastRatio(c('rgb(118 118 118)'), c('#ffffff')).toFixed(2), '4.54');
  assert.deepEqual(c('hsl(0 100% 50%)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(c('rgba(0, 0, 0, 0.5)'), { r: 0, g: 0, b: 0, a: 0.5 });
  assert.equal(a11y.parseColor('var(--x)'), undefined);
  const fixed = a11y.nearestWithContrast(c('#9a9a9a'), [c('#ffffff')], 4.6);
  assert.ok(a11y.contrastRatio(fixed, c('#ffffff')) >= 4.6);
  assert.equal(a11y.toHex(fixed), '#747474');
});

test('Stylesheet: eine Deklaration ändern, der Rest bleibt Byte für Byte', () => {
  const css = '/* a */\n.x { color: red; }\n@media screen {\n  .x {\n    color: blue;\n    margin: 0;\n  }\n}\n.y{outline:none}\n';
  assert.equal(a11y.editRuleDeclaration(css, { selector: '.x', media: [], occurrence: 0 }, 'color', '#111'), css.replace('color: red', 'color: #111'));
  assert.equal(a11y.editRuleDeclaration(css, { selector: '.x', media: ['screen'], occurrence: 0 }, 'color', null), css.replace('    color: blue;\n', ''));
  assert.equal(a11y.editRuleDeclaration(css, { selector: '.x', media: ['screen'], occurrence: 0 }, 'background', '#fff'), css.replace('margin: 0;\n', 'margin: 0;\n    background: #fff;\n'));
  assert.equal(a11y.editRuleDeclaration(css, { selector: '.y', media: [], occurrence: 0 }, 'outline', null), css.replace('outline:none', ''));
  assert.equal(a11y.editRuleDeclaration(css, { selector: '.z', media: [], occurrence: 0 }, 'color', 'red'), undefined);
  assert.equal(a11y.editStyleAttribute('position: absolute; top: 0', 'position', null), 'top: 0');
  assert.equal(a11y.editStyleAttribute('', 'color', '#111'), 'color: #111;');
});

test('Sprache: BCP 47, Vorschläge, Erkennung fremdsprachiger Absätze', () => {
  assert.equal(a11y.langProblem('de-AT'), undefined);
  assert.equal(a11y.langProblem('sr-Latn-RS'), undefined);
  assert.match(a11y.langProblem('de_AT')!, /kein Sprachkennzeichen/);
  assert.match(a11y.langProblem('english')!, /kein registrierter Sprachcode/);
  assert.match(a11y.langProblem('qq')!, /ISO 639-1/);
  assert.equal(a11y.suggestLang('de_at'), 'de-AT');
  assert.equal(a11y.suggestLang('English'), 'en');
  assert.equal(a11y.foreignLanguage('The new ventilation system will reduce the energy demand of the building by about forty percent.', 'de-AT'), 'en');
  assert.equal(a11y.foreignLanguage('Die neue Lüftungsanlage senkt den Energiebedarf des Gebäudes um etwa vierzig Prozent.', 'de-AT'), undefined);
  assert.equal(a11y.foreignLanguage('Le nouveau système de ventilation réduit la consommation et les coûts pour la commune.', 'de'), 'fr');
  assert.equal(a11y.foreignLanguage('Kurz: OK.', 'de'), undefined);
});

test('Operationen: Grenzen der neuen Bearbeitungsoperationen', async () => {
  const s = await edit.EditSession.open(await example());
  assert.throws(() => s.apply({ op: 'set-attribute', target: `${I}#plan`, name: 'onclick', value: 'x()' }), /set-attribute ändert nur/);
  assert.throws(() => s.apply({ op: 'set-attribute', target: `${I}#kontakt/p[2]`, name: 'tabindex', value: '5' }), /tabindex nur "0" oder "-1"/);
  assert.throws(() => s.apply({ op: 'set-css', path: 'content/styles/document.css', selector: '.hinweis', property: 'background', value: 'url(x.png)' }), /nicht zulässig/);
  assert.throws(() => s.apply({ op: 'set-css', path: 'content/styles/document.css', selector: '.gibtsnicht', property: 'color', value: '#000' }), /nicht gefunden/);
  assert.throws(() => s.apply({ op: 'set-lang', target: I, lang: 'deutsch' }), /kein Sprachkennzeichen/);
  assert.throws(() => s.apply({ op: 'set-heading-levels', levels: [{ target: `${I}#ueberblick-h`, level: 4 }] }), /Struktur beschädigen: .*Überschriftensprung h1→h4/);
  // a refused operation leaves the session unchanged
  assert.deepEqual(s.changedDocuments(), []);
  assert.equal(s.changedSheets().size, 0);
});

test('Sperren gelten auch für Korrekturen: read-only-Abschnitt wird nicht geändert', async () => {
  const input = exampleInput();
  const bytes = (await createContainer({ ...input, access: [{ target: `${I}#kontakt`, rules: ['read-only'] }, { target: 'content/styles/document.css', rules: ['read-only'] }] })).bytes;
  const out = await a11y.fixContainer(bytes, { select: 'all', values: new Map([[PLAN, PLAN_ALT]]), at: '2026-10-13T09:00:00Z' });
  const skipped = new Map(out.skipped.map((x) => [x.finding.rule + '@' + (x.finding.target ?? x.finding.path), x.reason]));
  for (const [id, reason] of skipped) assert.match(reason, /gesperrt|read-only/, id);
  // everything in the locked section and in the locked stylesheet is left as it was
  assert.ok([...skipped.keys()].some((k) => k.startsWith('tabindex-positiv@')));
  assert.ok([...skipped.keys()].some((k) => k.startsWith('fokus-unsichtbar@')));
  assert.equal(out.after.counts.kontrast, 3);
  assert.equal(out.after.counts.struktur, 0);
});

test('alle Vorschläge in einem größeren Dokument (Hauptteil fünfmal): jeder Befund behoben, Adressen nie veraltet', async () => {
  const n = 5;
  const bytes = await example((path, text) => {
    if (path !== I) return text;
    const main = /<main id="inhalt">([\s\S]*)<\/main>/.exec(text)![1]!;
    const sections = main.slice(main.indexOf('<section'));
    let body = main.slice(0, main.indexOf('<section'));
    for (let k = 0; k < n; k++) body += k === 0 ? sections : sections.replace(/id="([^"]+)"/g, `id="$1-${k}"`).replace(/href="#([^"]+)"/g, `href="#$1-${k}"`);
    return text.replace(main, body);
  });
  const before = await a11y.auditContainer(bytes);
  assert.equal(before.findings.length, 63);
  const values = new Map(before.findings.filter((f) => f.rule === 'alt-dateiname').map((f) => [f.id, PLAN_ALT]));
  const out = await a11y.fixContainer(bytes, { select: 'all', values, at: '2026-10-13T09:00:00Z' });
  assert.deepEqual(out.skipped, []);
  assert.equal(out.applied.length, 63);
  assert.deepEqual((await a11y.auditContainer(out.saved!.bytes)).findings, []);
});

test('h1-fehlt fügt die Hauptüberschrift in <main> ein; <pre tabindex="0"> ist kein leerer Tabulatorhalt', async () => {
  const bytes = await example((path, text) => {
    if (path !== I) return text;
    return text
      .replace('<h1 id="titel">Hallenbad Mühlau: Sanierung 2027</h1>', '')
      .replace('<p id="einleitung">', '<pre id="code" tabindex="0">a = 1</pre>\n    <p id="einleitung">');
  });
  const r = await a11y.auditContainer(bytes);
  assert.ok(!r.findings.some((f) => f.rule === 'fokus-ohne-zweck' && f.target?.includes('#code')));
  const h1 = r.findings.find((f) => f.rule === 'h1-fehlt')!;
  assert.equal(h1.fix!.input!.proposal, 'Hallenbad Mühlau: Sanierung 2027');
  const out = await a11y.fixContainer(bytes, { select: [h1.id], at: '2026-10-13T09:00:00Z' });
  assert.equal(out.applied.length, 1);
  assert.match(dec.decode((await readContainer(out.saved!.bytes)).files.get(I)!), /<main id="inhalt">\s*<h1 id="[^"]+">Hallenbad Mühlau: Sanierung 2027<\/h1>/);
});
