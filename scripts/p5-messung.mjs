#!/usr/bin/env node
/**
 * Measurements for P5: cost of the history journal and of the comparison.
 *
 *   Reihe A  the P5 example, 40 saves with one change each (text, inserted paragraph, cell)
 *   Reihe B  a long document (400 paragraphs, about 90 KB XHTML), 20 saves with one changed paragraph
 *   then:    listVersions, checkoutVersion(0) (byte comparison with the original), diffVersions,
 *            redaction over the whole history
 *
 * Times are wall-clock in this process (Node, one run, no warm-up beyond the first save), sizes are
 * bytes of the ZIP file and of the journal entry (uncompressed / stored in the ZIP).
 *
 *   node scripts/p5-messung.mjs <beispiel.hpro>
 */
import { readFileSync } from 'node:fs';
import { kern } from './s7-lib.mjs';

const k = await kern();
const { edit, lock, readZip, createContainer } = k;
const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/p5-messung.mjs <beispiel.hpro>');
  process.exit(2);
}
const I = 'content/index.xhtml';
const time = (base, n) => new Date(Date.parse(base) + n * 60_000).toISOString().slice(0, 19) + 'Z';

async function journalSize(bytes) {
  const e = (await readZip(bytes)).find((x) => x.name === edit.JOURNAL_PATH);
  return e ? { size: e.size, stored: e.compressedSize } : { size: 0, stored: 0 };
}

async function series(name, start, steps, opFor, at0) {
  console.log(`## ${name}`);
  console.log('Speichern  Datei (Bytes)  Journal (Bytes, entpackt/im ZIP)  Speichern inkl. Journal (ms)');
  let bytes = start;
  const rows = [];
  for (let i = 1; i <= steps; i++) {
    const t0 = performance.now();
    bytes = (await edit.editContainer(bytes, opFor(i), { at: time(at0, i) })).bytes;
    const ms = performance.now() - t0;
    const j = await journalSize(bytes);
    rows.push({ i, size: bytes.length, journal: j, ms });
    if (i <= 3 || i % 10 === 0 || i === steps) console.log(`${String(i).padStart(9)}  ${String(bytes.length).padStart(13)}  ${String(j.size).padStart(14)} / ${String(j.stored).padEnd(14)}  ${ms.toFixed(1).padStart(10)}`);
  }
  const growth = (rows[rows.length - 1].journal.stored - rows[0].journal.stored) / (rows.length - 1);
  console.log(`Ausgangsdatei ${start.length} Bytes; nach ${steps} Fassungen ${bytes.length} Bytes (+${(((bytes.length - start.length) / start.length) * 100).toFixed(0)} %).`);
  console.log(`Journal: im Mittel +${growth.toFixed(0)} Bytes im ZIP je Fassung; Speichern im Mittel ${(rows.reduce((a, r) => a + r.ms, 0) / rows.length).toFixed(1)} ms.`);
  let t0 = performance.now();
  const infos = await edit.listVersions(bytes);
  console.log(`listVersions: ${infos.length} Fassungen, Status ${[...new Set(infos.map((x) => x.status))].join('/')}, ${(performance.now() - t0).toFixed(1)} ms`);
  t0 = performance.now();
  const v0 = await edit.checkoutVersion(bytes, 0);
  const ms0 = performance.now() - t0;
  const a = new Map((await readZip(start)).map((e) => [e.name, e.data]));
  const b = new Map((await readZip(v0)).map((e) => [e.name, e.data]));
  const same = a.size === b.size && [...a].every(([n, d]) => b.has(n) && Buffer.from(d).equals(Buffer.from(b.get(n))));
  console.log(`checkoutVersion(0): ${ms0.toFixed(1)} ms; alle ${a.size} Einträge byte-gleich mit der Ausgangsdatei: ${same ? 'ja' : 'NEIN'}`);
  t0 = performance.now();
  const d = await edit.diffVersions(bytes, 0, steps);
  console.log(`diffVersions(0, ${steps}): ${d.changes.length} Änderungen (${Object.entries(d.counts).map(([x, n]) => `${x} ${n}`).join(', ')}), ${(performance.now() - t0).toFixed(1)} ms`);
  t0 = performance.now();
  const d1 = await edit.diffVersions(bytes, steps - 1, steps);
  console.log(`diffVersions(${steps - 1}, ${steps}): ${d1.changes.length} Änderung(en), ${(performance.now() - t0).toFixed(1)} ms`);
  console.log();
  return bytes;
}

const example = new Uint8Array(readFileSync(file));
const a = await series(
  'Reihe A: Beispiel p5-bearbeiten, 40 Fassungen',
  example,
  40,
  (i) =>
    i % 3 === 1
      ? [{ op: 'set-text', target: `${I}#termine-hinweis`, inline: `Änderungen der Termine gibt die Bauaufsicht bekannt (Stand ${i}); siehe auch <a href="anhang.xhtml#kontakte">Kontakte im Anhang</a>.` }]
      : i % 3 === 2
        ? [{ op: 'insert', ref: `${I}#termine-hinweis`, position: 'after', block: { type: 'paragraph', text: `Nachtrag ${i}: Abstimmung mit der Bauaufsicht erfolgt.` } }]
        : [{ op: 'set-text', target: `${I}#termin-tabelle.C2`, text: `Planung (${i})` }],
  '2026-10-12T08:00:00Z',
);

// Reihe B: a long document.
const paragraphs = Array.from({ length: 400 }, (_, i) => `<p id="p${i + 1}">Absatz ${i + 1}: Die Sanierung der Fassade umfasst Gerüst, Dämmung, Putz und Fenster; dieser Satz steht für einen durchschnittlich langen Absatz eines Berichts.</p>`).join('\n    ');
const xhtml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="de-AT" lang="de-AT">\n<head>\n  <meta charset="UTF-8"/>\n  <title>Langer Bericht</title>\n</head>\n<body>\n  <main id="inhalt">\n    <h1 id="titel">Langer Bericht</h1>\n    <section id="teil">\n    <h2 id="teil-h">Teil</h2>\n    ${paragraphs}\n    </section>\n  </main>\n</body>\n</html>\n`;
const long = (
  await createContainer({
    id: 'urn:uuid:9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
    title: 'Langer Bericht',
    language: 'de-AT',
    modified: '2026-10-12T07:00:00Z',
    readingOrder: [I],
    toc: { title: 'Inhalt', entries: [{ title: 'Teil', href: `${I}#teil` }] },
    resources: [{ path: I, mediaType: 'application/xhtml+xml', data: xhtml }],
  })
).bytes;
console.log(`Reihe B: Inhaltsdokument ${new TextEncoder().encode(xhtml).length} Bytes XHTML, Container ${long.length} Bytes.`);
await series('Reihe B: langer Bericht (400 Absätze), 20 Fassungen', long, 20, (i) => [{ op: 'set-text', target: `${I}#p${i * 17}`, text: `Absatz ${i * 17} geändert in Fassung ${i}: Der Putz wird erst nach Freigabe des Farbmusters aufgebracht.` }], '2026-10-12T08:00:00Z');

console.log('## Redaktion über 40 Fassungen (Reihe A, letzte Datei)');
const t0 = performance.now();
const r = await lock.redactContainer(a, { terms: ['Max Mustermann', '+43 512 123456'], at: '2026-10-12T20:00:00Z' });
const ms = performance.now() - t0;
const infos = await edit.listVersions(r.bytes);
let clean = 0;
for (const v of [0, 10, 20, 30, 40]) if ((await lock.searchContainer(await edit.checkoutVersion(r.bytes, v), ['Max Mustermann', '+43 512 123456'])).hits.length === 0) clean++;
console.log(`Dauer ${ms.toFixed(0)} ms (Verlauf aller 41 Fassungen neu geschrieben, Nachprüfung eingeschlossen); Datei ${a.length} → ${r.bytes.length} Bytes`);
console.log(`Nachprüfung: ${r.check.hits} Treffer in ${r.check.entries} Einträgen; Fassungen danach: ${infos.length}, wiederherstellbar ${infos.filter((x) => x.available).length}; Stichprobe Fassung 0/10/20/30/40 ohne Treffer: ${clean} von 5`);
