#!/usr/bin/env node
/**
 * P13: puts the measurements of the cross-engine suite (app/e2e/engines.spec.ts) side by side.
 *
 *   node scripts/p13-vergleich.mjs [--in app/test-results/engines] [--out DIR]
 *
 * Reads <in>/<engine>/{engine.json,messung/*.json,bilder/*.png} for chromium, firefox and webkit
 * and writes to <out> (default <in>/vergleich):
 *   vergleich.md    tables: versions, geometry, page breaks, variables, features, pixel differences
 *   vergleich.json  the same as data, plus the list of differences
 *   vergleich.html  screenshots side by side with difference images
 *   bilder/         copies of the screenshots and the difference images (red = differs)
 * Pixel differences are computed in Chromium with a canvas (no extra dependency): a pixel counts
 * as different when one channel differs by more than 32.
 *
 * Exit code 0 when all three engines delivered measurements, 1 otherwise.
 */
import { chromium } from 'playwright';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const IN = resolve(flag('--in', join(ROOT, 'app/test-results/engines')));
const OUT = resolve(flag('--out', join(IN, 'vergleich')));
const ENGINES = ['chromium', 'firefox', 'webkit'];
/** Geometry tolerance in CSS px: below this, a block counts as at the same place. */
const TOL = 2;

const data = {};
for (const engine of ENGINES) {
  const dir = join(IN, engine);
  if (!existsSync(join(dir, 'engine.json'))) continue;
  const m = {};
  for (const f of readdirSync(join(dir, 'messung')).filter((f) => f.endsWith('.json')).sort()) {
    m[basename(f, '.json')] = JSON.parse(readFileSync(join(dir, 'messung', f), 'utf8'));
  }
  data[engine] = { info: JSON.parse(readFileSync(join(dir, 'engine.json'), 'utf8')), m, bilder: join(dir, 'bilder') };
}
const present = ENGINES.filter((e) => data[e]);
const missing = ENGINES.filter((e) => !data[e]);
mkdirSync(join(OUT, 'bilder'), { recursive: true });

const md = [];
const differences = [];
const summary = { engines: {}, geometry: {}, pages: {}, variables: {}, features: {}, pixels: {} };
const cell = (v) => (v === undefined ? '–' : typeof v === 'boolean' ? (v ? 'ja' : '**nein**') : String(v));

md.push('# Engine-Vergleich (P13)', '');
md.push(`Erzeugt von \`scripts/p13-vergleich.mjs\` aus \`${relative(ROOT, IN) || IN}\`. Toleranz für Lage und Höhe: ${TOL} px.`, '');
md.push('## Engines', '', '| Engine | Version | User-Agent |', '|---|---|---|');
for (const e of present) {
  summary.engines[e] = data[e].info;
  md.push(`| ${e} | ${data[e].info.version} | \`${data[e].info.userAgent}\` |`);
}
for (const e of missing) md.push(`| ${e} | **keine Messung** | – |`);
md.push('');

// ------------------------------------------------------------------ geometry (flowing view)
const keys = [...new Set(present.flatMap((e) => Object.keys(data[e].m)))].sort();
const geoKeys = keys.filter((k) => /@\d+$/.test(k));
md.push('## Fließende Ansicht: Geometrie je Datei und Breite', '');
md.push('Bezug ist Chromium. „Blöcke verschoben“ zählt adressierte Blöcke (Elemente mit `id`), deren Oberkante oder Höhe um mehr als die Toleranz abweicht; „größte Abweichung“ nennt den Block mit dem größten Höhenunterschied.', '');
md.push('| Datei@Breite | Engine | Überlauf (scrollWidth/clientWidth) | Dokumenthöhe px | Blöcke | Blöcke verschoben | größte Abweichung |', '|---|---|---|---|---|---|---|');
for (const k of geoKeys) {
  const ref = data.chromium?.m[k];
  summary.geometry[k] = {};
  for (const e of present) {
    const g = data[e].m[k];
    if (!g) { md.push(`| ${k} | ${e} | – | – | – | – | – |`); continue; }
    let moved = 0;
    let worst = null;
    if (ref && e !== 'chromium') {
      for (const [id, [top, h]] of Object.entries(g.blocks)) {
        const r = ref.blocks[id];
        if (!r) continue;
        if (Math.abs(top - r[0]) > TOL || Math.abs(h - r[1]) > TOL) moved++;
        const dh = h - r[1];
        if (!worst || Math.abs(dh) > Math.abs(worst.dh)) worst = { id, dh, h, ref: r[1] };
      }
    }
    const overflow = g.scrollWidth > g.clientWidth;
    summary.geometry[k][e] = { scrollHeight: g.scrollHeight, overflow, blocks: Object.keys(g.blocks).length, moved, worst };
    const worstText = worst && worst.dh !== 0 ? `\`${worst.id}\` ${worst.ref} → ${worst.h} px (${worst.dh > 0 ? '+' : ''}${worst.dh})` : '–';
    const dh = ref && e !== 'chromium' ? ` (${g.scrollHeight - ref.scrollHeight >= 0 ? '+' : ''}${g.scrollHeight - ref.scrollHeight})` : '';
    md.push(`| ${k} | ${e} | ${g.scrollWidth}/${g.clientWidth}${overflow ? ' **Überlauf**' : ''} | ${g.scrollHeight}${dh} | ${Object.keys(g.blocks).length} | ${e === 'chromium' ? 'Bezug' : moved} | ${worstText} |`);
    if (overflow) differences.push({ art: 'Überlauf', schluessel: k, engine: e, wert: `${g.scrollWidth}/${g.clientWidth}` });
    if (e !== 'chromium' && ref && moved > 0) differences.push({ art: 'Geometrie', schluessel: k, engine: e, wert: `${moved} von ${Object.keys(g.blocks).length} Blöcken, Höhe ${g.scrollHeight} statt ${ref.scrollHeight} px` });
  }
}
md.push('');

// ------------------------------------------------------------------ page view
const pageKeys = keys.filter((k) => k.endsWith('@seiten'));
md.push('## Seitenansicht (A4): Seitenzahl und Umbrüche', '');
md.push('| Datei | Engine | Seiten | Seitengröße px | Umbrüche vor | gleich wie Chromium |', '|---|---|---|---|---|---|');
for (const k of pageKeys) {
  const ref = data.chromium?.m[k];
  summary.pages[k] = {};
  for (const e of present) {
    const p = data[e].m[k];
    if (!p) { md.push(`| ${k} | ${e} | – | – | – | – |`); continue; }
    const same = ref ? JSON.stringify(p.breaks) === JSON.stringify(ref.breaks) && p.pages === ref.pages : undefined;
    summary.pages[k][e] = { ...p, sameAsChromium: same };
    md.push(`| ${k} | ${e} | ${p.pages} | ${p.size.w} × ${p.size.h} | ${p.breaks.map((b) => `\`${b}\``).join(', ') || '–'} | ${e === 'chromium' ? 'Bezug' : cell(same)} |`);
    if (e !== 'chromium' && same === false) {
      const only = (a, b) => a.filter((x) => !b.includes(x));
      differences.push({ art: 'Seitenumbruch', schluessel: k, engine: e, wert: `${p.pages} statt ${ref.pages} Seiten; nur hier: ${only(p.breaks, ref.breaks).join(', ') || '–'}; nur in Chromium: ${only(ref.breaks, p.breaks).join(', ') || '–'}` });
    }
  }
}
md.push('');

// ------------------------------------------------------------------ reading-system variables
md.push('## Lesesystem-Variablen (HPR-INH-006)', '');
md.push('| Engine | Absätze | Schrift vorher → nachher | Zeilenhöhe vorher → nachher | Faktor Schrift (min–max) | Zeilenhöhe/Schrift (min–max) |', '|---|---|---|---|---|---|');
for (const e of present) {
  const v = data[e].m.variablen;
  if (!v) { md.push(`| ${e} | – | – | – | – | – |`); continue; }
  summary.variables[e] = v;
  const range = (a) => `${Math.min(...a)}–${Math.max(...a)}`;
  md.push(`| ${e} | ${v.paragraphs} | ${v.fontSizeBefore} → ${v.fontSizeAfter} px | ${v.lineHeightBefore} → ${v.lineHeightAfter} | ${range(v.fontFactors)} | ${range(v.lineToFont)} |`);
}
md.push('');

// ------------------------------------------------------------------ features
md.push('## Schrift und Merkmale im Dokumentrahmen (Sandbox)', '');
const feat = Object.fromEntries(present.map((e) => [e, data[e].m.merkmale]).filter(([, v]) => v));
const fe = Object.keys(feat);
md.push(`| Merkmal | ${fe.join(' | ')} | Unterschied |`, `|---|${fe.map(() => '---|').join('')}---|`);
const rows = [
  ['Origin des Rahmens', (v) => v.origin],
  ['Schriftfamilie (berechnet)', (v) => `\`${v.fontFamily}\``],
  ['Schriftgröße / Zeilenhöhe', (v) => `${v.fontSize} / ${v.lineHeight}`],
  ['Breite des Mustersatzes px', (v) => v.sampleTextWidth],
  ['hyphens (berechnet)', (v) => v.hyphensComputed],
];
for (const name of Object.keys(feat[fe[0]]?.css ?? {})) rows.push([`CSS ${name}`, (v) => v.css[name]]);
for (const name of Object.keys(feat[fe[0]]?.api ?? {})) rows.push([`API ${name}`, (v) => v.api[name]]);
for (const [label, get] of rows) {
  const vals = fe.map((e) => get(feat[e]));
  const differs = new Set(vals.map(String)).size > 1;
  summary.features[label] = Object.fromEntries(fe.map((e, i) => [e, vals[i]]));
  md.push(`| ${label} | ${vals.map(cell).join(' | ')} | ${differs ? '**ja**' : ''} |`);
  if (differs) differences.push({ art: 'Merkmal', schluessel: label, engine: fe.filter((_, i) => String(vals[i]) !== String(vals[0])).join(', ') || fe.join(', '), wert: fe.map((e, i) => `${e}=${vals[i]}`).join('; ') });
}
md.push('');

// ------------------------------------------------------------------ probes (flattened)
const probeKeys = keys.filter((k) => !/@/.test(k) && !['variablen', 'merkmale'].includes(k));
const flatten = (o, prefix = '') => Object.entries(o ?? {}).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, Array.isArray(v) ? v.join(', ') : v]]));
summary.probes = {};
for (const k of probeKeys) {
  const per = Object.fromEntries(present.map((e) => [e, Object.fromEntries(flatten(data[e].m[k]))]));
  const fields = [...new Set(present.flatMap((e) => Object.keys(per[e])))];
  summary.probes[k] = per;
  md.push(`## Sonde \`${k}\``, '', `| Wert | ${present.join(' | ')} | Unterschied |`, `|---|${present.map(() => '---|').join('')}---|`);
  for (const f of fields) {
    const vals = present.map((e) => per[e][f]);
    const differs = new Set(vals.map(String)).size > 1;
    md.push(`| ${f} | ${vals.map((v) => cell(v).replace(/\|/g, '\\|')).join(' | ')} | ${differs ? '**ja**' : ''} |`);
    if (differs) differences.push({ art: `Sonde ${k}`, schluessel: f, engine: present.join(', '), wert: present.map((e, i) => `${e}=${vals[i]}`).join('; ') });
  }
  md.push('');
}

// ------------------------------------------------------------------ pixel differences
const shots = [...new Set(present.flatMap((e) => (existsSync(data[e].bilder) ? readdirSync(data[e].bilder) : [])))].filter((f) => f.endsWith('.png')).sort();
for (const e of present) for (const f of shots) if (existsSync(join(data[e].bilder, f))) copyFileSync(join(data[e].bilder, f), join(OUT, 'bilder', `${basename(f, '.png')}-${e}.png`));
if (data.chromium && shots.length) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<canvas id="c"></canvas>');
  md.push('## Pixelvergleich der Bildschirmfotos (Bezug Chromium)', '');
  md.push('Anteil der Pixel, die sich in mindestens einem Farbkanal um mehr als 32 unterscheiden. Die Differenzbilder liegen in `bilder/*-diff-<engine>.png` (rot = verschieden).', '');
  md.push(`| Bild | ${present.filter((e) => e !== 'chromium').join(' | ')} |`, `|---|${present.filter((e) => e !== 'chromium').map(() => '---|').join('')}`);
  for (const f of shots) {
    const key = basename(f, '.png');
    const refPath = join(data.chromium.bilder, f);
    if (!existsSync(refPath)) continue;
    summary.pixels[key] = {};
    const cells = [];
    for (const e of present.filter((x) => x !== 'chromium')) {
      const p = join(data[e].bilder, f);
      if (!existsSync(p)) { cells.push('–'); continue; }
      const res = await page.evaluate(async ([a, b]) => {
        const load = (src) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
        const read = (img) => { const c = new OffscreenCanvas(w, h); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
        const da = read(ia), db = read(ib);
        const c = document.getElementById('c'); c.width = w; c.height = h;
        const x = c.getContext('2d'); const out = x.createImageData(w, h);
        let diff = 0;
        for (let i = 0; i < da.length; i += 4) {
          const d = Math.abs(da[i] - db[i]) > 32 || Math.abs(da[i + 1] - db[i + 1]) > 32 || Math.abs(da[i + 2] - db[i + 2]) > 32;
          if (d) { diff++; out.data[i] = 220; out.data[i + 1] = 0; out.data[i + 2] = 0; out.data[i + 3] = 255; }
          else { const g = 255 - (255 - (da[i] + da[i + 1] + da[i + 2]) / 3) * 0.25; out.data[i] = out.data[i + 1] = out.data[i + 2] = g; out.data[i + 3] = 255; }
        }
        x.putImageData(out, 0, 0);
        return { share: diff / (w * h), w, h, png: c.toDataURL('image/png') };
      }, [`data:image/png;base64,${readFileSync(refPath).toString('base64')}`, `data:image/png;base64,${readFileSync(p).toString('base64')}`]);
      writeFileSync(join(OUT, 'bilder', `${key}-diff-${e}.png`), Buffer.from(res.png.split(',')[1], 'base64'));
      summary.pixels[key][e] = Math.round(res.share * 10000) / 100;
      cells.push(`${(res.share * 100).toFixed(2)} %`);
    }
    md.push(`| ${key} | ${cells.join(' | ')} |`);
  }
  md.push('');
  await browser.close();
}

// ------------------------------------------------------------------ list of differences
md.push('## Gefundene Unterschiede', '');
if (missing.length) md.push(`- **Keine Messung von:** ${missing.join(', ')}`);
if (!differences.length) md.push('- keine');
for (const d of differences) md.push(`- **${d.art}** · ${d.schluessel} · ${d.engine}: ${d.wert}`);
md.push('');
writeFileSync(join(OUT, 'vergleich.md'), md.join('\n'));
writeFileSync(join(OUT, 'vergleich.json'), JSON.stringify({ engines: present, missing, tolerancePx: TOL, summary, differences }, null, 2) + '\n');

// ------------------------------------------------------------------ side-by-side HTML
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = [`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Engine-Vergleich P13</title><style>
body{font:14px/1.4 system-ui,sans-serif;margin:1rem}figure{margin:0}img{max-width:100%;border:1px solid #ccc}
.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:.5rem;margin-bottom:2rem}
figcaption{font-weight:600}</style></head><body><h1>Engine-Vergleich (P13)</h1>
<p>${present.map((e) => esc(`${e} ${data[e].info.version}`)).join(' · ')}. Tabellen: <a href="vergleich.md">vergleich.md</a>.</p>`];
for (const f of shots) {
  const key = basename(f, '.png');
  html.push(`<h2>${esc(key)}</h2><div class="row">`);
  for (const e of present) html.push(`<figure><figcaption>${e}</figcaption><img loading="lazy" src="bilder/${key}-${e}.png" alt="${esc(key)} in ${e}"></figure>`);
  for (const e of present.filter((x) => x !== 'chromium')) {
    if (summary.pixels[key]?.[e] !== undefined) html.push(`<figure><figcaption>Differenz ${e} – chromium: ${summary.pixels[key][e]} %</figcaption><img loading="lazy" src="bilder/${key}-diff-${e}.png" alt="Differenzbild"></figure>`);
  }
  html.push('</div>');
}
html.push('</body></html>');
writeFileSync(join(OUT, 'vergleich.html'), html.join('\n'));

console.log(`Engines: ${present.join(', ')}${missing.length ? ` (fehlt: ${missing.join(', ')})` : ''}`);
console.log(`Messungen: ${keys.length}, Bildschirmfotos: ${shots.length}, Unterschiede: ${differences.length}`);
for (const d of differences) console.log(`  ${d.art} · ${d.schluessel} · ${d.engine}: ${d.wert}`);
console.log(`Bericht: ${relative(ROOT, join(OUT, 'vergleich.md'))}`);
process.exit(missing.length ? 1 : 0);
