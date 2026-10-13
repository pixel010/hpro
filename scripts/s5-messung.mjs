#!/usr/bin/env node
/**
 * S5: Verluste beim Import messen (Abnahme 3).
 *
 *   node scripts/s5-messung.mjs <erwartet.json> <bilder-verzeichnis> <name>=<container.hpro> … [--json ergebnis.json]
 *   node scripts/s5-messung.mjs --grenzfall <grenzfall-erwartet.json> <container.hpro> <bericht.json> [--json ergebnis.json]
 *
 * Vergleicht jeden Container mit der Grundwahrheit aus scripts/s5-quellen.py, getrennt nach den vier
 * Kategorien der Abnahme:
 *   Abschnitt  Überschrift mit gleichem Text vorhanden, gleiche Ebene, Reihenfolge, Kennung (Adresse)
 *   Tabelle    Tabelle gefunden, Zellen mit gleichem Text an gleicher Stelle (Zeile/Spalte im Raster),
 *              Kopfzellen als th in thead, Spannen (colspan/rowspan), Beschriftung als caption
 *   Bild       Bilddatei im Container, Bilddaten identisch mit der Quelle (SHA-256), Alternativtext,
 *              Beschriftung als figcaption, dekoratives Bild mit alt=""
 *   Fußnote    Notentext vorhanden (aside/Endnote), mit Verweis verknüpft (a role="doc-noteref")
 * dazu Listen, Verweise und die Textabdeckung (Anteil der verschiedenen Wörter mit mindestens vier
 * Buchstaben der Grundwahrheit, die im Container stehen; Maß wie in P9).
 * Textvergleich: Leerraum vereinheitlicht, NFC, sonst exakt.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { kern } from './s7-lib.mjs';

const XHTML = 'http://www.w3.org/1999/xhtml';
const EPUB = 'http://www.idpf.org/2007/ops';
const norm = (s) => (s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
const sha = (b) => createHash('sha256').update(b).digest('hex');

function elements(node, out = []) {
  for (const c of Array.from(node.childNodes ?? [])) {
    if (c.nodeType === 1) {
      out.push(c);
      elements(c, out);
    }
  }
  return out;
}
const local = (e) => e.localName;
const attr = (e, n) => (e.hasAttribute(n) ? e.getAttribute(n) : null);
/** Text of an element without footnote references (their numbers are not part of the text). */
function textOf(e) {
  let s = '';
  for (const c of Array.from(e.childNodes ?? [])) {
    if (c.nodeType === 3) s += c.nodeValue;
    else if (c.nodeType === 1) {
      if (local(c) === 'a' && attr(c, 'role') === 'doc-noteref') continue;
      if (local(c) === 'aside' && attr(c, 'role') === 'doc-footnote') continue;
      if (local(c) === 'br') s += ' ';
      else s += textOf(c);
    }
  }
  return s;
}

/** Inventory of the main version of a container. */
export async function inventory(bytes) {
  const { readContainer } = await kern();
  const c = await readContainer(bytes);
  const docs = c.manifest.readingOrder.map((r) => r.url);
  const all = [];
  const byId = new Map();
  let bodyText = '';
  for (const path of docs) {
    const xml = new TextDecoder().decode(c.files.get(path));
    const doc = new DOMParser().parseFromString(xml, 'application/xhtml+xml');
    const body = elements(doc).find((e) => local(e) === 'body');
    for (const e of elements(body)) {
      all.push({ e, path });
      const id = attr(e, 'id');
      if (id) byId.set(`${path}#${id}`, e);
    }
    bodyText += ' ' + body.textContent;
  }
  const dirOf = (p) => p.slice(0, p.lastIndexOf('/') + 1);
  const headings = all.filter(({ e }) => /^h[1-6]$/.test(local(e))).map(({ e }) => ({ level: Number(local(e)[1]), text: norm(textOf(e)), id: attr(e, 'id') ?? attr(e.parentNode, 'id') }));
  const tables = all.filter(({ e }) => local(e) === 'table' && !elements(e).some((x) => x === e)).map(({ e }) => tableModel(e));
  const figures = all
    .filter(({ e }) => local(e) === 'figure')
    .map(({ e, path }) => {
      const img = elements(e).find((x) => local(x) === 'img');
      const cap = elements(e).find((x) => local(x) === 'figcaption');
      const src = img ? attr(img, 'src') : null;
      const file = src ? dirOf(path) + src : null;
      const data = file ? c.files.get(file) : undefined;
      return { id: attr(e, 'id'), alt: img ? attr(img, 'alt') : null, caption: cap ? norm(textOf(cap)) : null, file, bytes: data ? data.length : 0, sha256: data ? sha(data) : null, type: c.manifest.resources.find((r) => r.url === file)?.type ?? null };
    });
  const notes = all
    .filter(({ e }) => (local(e) === 'aside' && attr(e, 'role') === 'doc-footnote') || (local(e) === 'li' && elements(e.parentNode?.parentNode ?? e).length >= 0 && attr(e.parentNode?.parentNode ?? e, 'role') === 'doc-endnotes'))
    .map(({ e, path }) => ({ id: attr(e, 'id'), path, text: norm(textOf(e)) }));
  const noterefs = all.filter(({ e }) => local(e) === 'a' && attr(e, 'role') === 'doc-noteref').map(({ e, path }) => ({ href: attr(e, 'href'), path, epubType: e.getAttributeNS(EPUB, 'type') }));
  const links = all.filter(({ e }) => local(e) === 'a' && attr(e, 'role') !== 'doc-noteref').map(({ e, path }) => {
    const href = attr(e, 'href') ?? '';
    const internal = href.startsWith('#') || !/^[a-z][a-z0-9+.-]*:/i.test(href);
    const target = internal ? (href.startsWith('#') ? `${path}${href}` : dirOf(path) + href) : null;
    return { href, text: norm(textOf(e)), internal, resolves: internal ? byId.has(target) : null };
  });
  const lists = all.filter(({ e }) => ['ul', 'ol'].includes(local(e)));
  const topLists = lists.filter(({ e }) => !['li'].includes(local(e.parentNode)));
  return {
    manifest: c.manifest,
    headings,
    tables,
    figures,
    notes,
    noterefs,
    links,
    lists: topLists.map(({ e }) => ({ ordered: local(e) === 'ol', items: Array.from(e.childNodes).filter((x) => x.nodeType === 1 && local(x) === 'li').length, nested: elements(e).filter((x) => ['ul', 'ol'].includes(local(x))).length })),
    text: norm(bodyText),
  };
}

/** Grid model of a table: top-left cells with row/column, spans and header flag. */
function tableModel(t) {
  const rows = elements(t).filter((e) => local(e) === 'tr' && nearestTable(e) === t);
  const occupied = rows.map(() => new Set());
  const cells = [];
  rows.forEach((tr, r) => {
    let col = 0;
    for (const cell of Array.from(tr.childNodes).filter((x) => x.nodeType === 1 && ['td', 'th'].includes(local(x)))) {
      while (occupied[r].has(col)) col++;
      const cs = Number(attr(cell, 'colspan') ?? 1);
      const rs = Number(attr(cell, 'rowspan') ?? 1);
      for (let dr = 0; dr < rs && r + dr < rows.length; dr++) for (let dc = 0; dc < cs; dc++) occupied[r + dr].add(col + dc);
      cells.push({ row: r, col, text: norm(textOf(cell)), colspan: cs, rowspan: rs, th: local(cell) === 'th', inHead: local(tr.parentNode) === 'thead' });
      col += cs;
    }
  });
  const cap = elements(t).find((e) => local(e) === 'caption' && nearestTable(e) === t);
  return { id: attr(t, 'id'), caption: cap ? norm(textOf(cap)) : null, rows: rows.length, cols: Math.max(0, ...occupied.map((s) => (s.size ? Math.max(...s) + 1 : 0))), cells };
}
function nearestTable(e) {
  let p = e.parentNode;
  while (p && !(p.nodeType === 1 && local(p) === 'table')) p = p.parentNode;
  return p;
}

const pct = (a, b) => (b === 0 ? '–' : `${a}/${b}`);

/** Compares one container with the ground truth. */
export function compare(expected, inv, images) {
  const r = {};
  // ------------------------------------------------------------ Abschnitt
  const exp = expected.abschnitte;
  const found = exp.map((x) => inv.headings.find((h) => h.text === norm(x.text)));
  const order = [];
  for (const f of found) if (f) order.push(inv.headings.indexOf(f));
  const sorted = order.every((v, i) => i === 0 || v > order[i - 1]);
  const titleOk = inv.headings[0]?.level === 1 && inv.headings[0]?.text === norm(expected.titel);
  const known = new Set([norm(expected.titel), ...exp.map((x) => norm(x.text))]);
  r.abschnitt = {
    erwartet: exp.length,
    gefunden: found.filter(Boolean).length,
    ebeneRichtig: found.filter((f, i) => f && f.level === exp[i].ebene).length,
    mitKennung: found.filter((f) => f && f.id).length,
    reihenfolge: sorted,
    titelH1: titleOk,
    zusaetzlich: inv.headings.filter((h) => !known.has(h.text)).map((h) => `h${h.level} „${h.text}“`),
    fehlend: exp.filter((_, i) => !found[i]).map((x) => x.text),
    falscheEbene: found.map((f, i) => (f && f.level !== exp[i].ebene ? `„${exp[i].text}“ h${f.level} statt h${exp[i].ebene}` : null)).filter(Boolean),
  };
  // ------------------------------------------------------------ Tabelle
  r.tabelle = expected.tabellen.map((et) => {
    const texts = new Set(et.zellen.map((z) => norm(z.text)));
    let best = null;
    let bestScore = 0;
    for (const t of inv.tables) {
      const hit = t.cells.filter((c) => texts.has(c.text) && c.text).length + (t.caption === norm(et.beschriftung) ? 5 : 0);
      if (hit > bestScore) (best = t), (bestScore = hit);
    }
    if (!best) return { beschriftung: et.beschriftung, gefunden: false, zellen: pct(0, et.zellen.length), zellenRichtig: 0, zellenErwartet: et.zellen.length };
    const at = (z) => best.cells.find((c) => c.row === z.zeile && c.col === z.spalte);
    const cellOk = et.zellen.filter((z) => at(z)?.text === norm(z.text));
    const headExp = et.zellen.filter((z) => z.kopf);
    const headOk = headExp.filter((z) => at(z)?.th && at(z)?.inHead && at(z)?.text === norm(z.text));
    const spanExp = et.zellen.filter((z) => (z.colspan ?? 1) > 1 || (z.rowspan ?? 1) > 1);
    const spanOk = spanExp.filter((z) => at(z)?.colspan === (z.colspan ?? 1) && at(z)?.rowspan === (z.rowspan ?? 1));
    const wrong = et.zellen.filter((z) => at(z)?.text !== norm(z.text)).map((z) => `(${z.zeile},${z.spalte}) „${z.text}“ → ${at(z) ? `„${at(z).text}“` : 'fehlt'}`);
    return {
      beschriftung: et.beschriftung,
      gefunden: true,
      kennung: best.id,
      raster: `${best.rows}×${best.cols} (erwartet ${et.zeilen}×${et.spalten})`,
      zellenRichtig: cellOk.length,
      zellenErwartet: et.zellen.length,
      kopfRichtig: headOk.length,
      kopfErwartet: headExp.length,
      spannenRichtig: spanOk.length,
      spannenErwartet: spanExp.length,
      beschriftungRichtig: best.caption === norm(et.beschriftung),
      beschriftungIst: best.caption,
      abweichungen: wrong,
    };
  });
  // ------------------------------------------------------------ Bild
  const used = new Set();
  r.bild = expected.bilder.map((eb) => {
    const src = images[eb.name];
    let f = inv.figures.find((x) => !used.has(x) && eb.beschriftung && x.caption === norm(eb.beschriftung));
    if (!f) f = inv.figures.find((x) => !used.has(x) && eb.alt && x.alt === eb.alt);
    if (!f && src) f = inv.figures.find((x) => !used.has(x) && x.sha256 === src.sha256);
    if (!f && eb.dekorativ) f = inv.figures.find((x) => !used.has(x) && !x.caption && (x.alt === '' || /zier/i.test(x.alt ?? '') || /zier/i.test(x.file ?? '')));
    // Without caption, alternative text or identical bytes (re-rendered from a page image): the next
    // unused figure in document order, so a lost description counts as such and not as a lost picture.
    if (!f && !eb.dekorativ) f = inv.figures.find((x) => !used.has(x) && !expected.bilder.some((o) => (o.beschriftung && x.caption === norm(o.beschriftung)) || (o.alt && x.alt === o.alt)));
    if (f) used.add(f);
    return {
      name: eb.name,
      gefunden: !!f,
      datei: f ? f.bytes > 0 : false,
      bilddatenIdentisch: f && src ? f.sha256 === src.sha256 : false,
      altRichtig: f ? (eb.dekorativ ? f.alt === '' : f.alt === eb.alt) : false,
      altIst: f ? f.alt : null,
      beschriftungRichtig: eb.dekorativ ? (f ? !f.caption : false) : f ? f.caption === norm(eb.beschriftung) : false,
      beschriftungIst: f ? f.caption : null,
    };
  });
  r.bildZusaetzlich = inv.figures.filter((x) => !used.has(x)).map((x) => `${x.file} alt=„${x.alt}“`);
  // ------------------------------------------------------------ Fußnote
  const stripMarker = (s) => s.replace(/^\d+\s*[.)]?\s*/, '');
  r.fussnote = expected.fussnoten.map((en) => {
    const n = inv.notes.find((x) => x.text === norm(en.text)) ?? inv.notes.find((x) => stripMarker(x.text) === norm(en.text));
    const linked = n ? inv.noterefs.some((ref) => ref.href === `#${n.id}` && ref.path === n.path) : false;
    // Text only somewhere in the body (e.g. as plain paragraph)?
    const anywhere = inv.text.includes(norm(en.text));
    return { text: en.text, notentext: !!n, notentextExakt: n ? n.text === norm(en.text) : false, verknuepft: linked, nurAlsText: !n && anywhere, verloren: !n && !anywhere };
  });
  // ------------------------------------------------------------ Listen, Verweise, Text
  r.listen = { erwartet: expected.listen.length, gefunden: inv.lists.length, details: inv.lists };
  const internal = inv.links.filter((l) => l.internal);
  r.verweise = {
    internErwartet: expected.verweise.intern.length,
    internGefunden: internal.filter((l) => l.resolves).length,
    internTexte: internal.map((l) => `${l.text} → ${l.href}${l.resolves ? '' : ' (ohne Ziel)'}`),
    externGefunden: expected.verweise.extern.filter((u) => inv.links.some((l) => l.href === u)).length,
    externErwartet: expected.verweise.extern.length,
  };
  const words = new Set();
  const source = [expected.fliesstext, expected.titel, ...exp.map((x) => x.text), ...expected.tabellen.flatMap((t) => [t.beschriftung, ...t.zellen.map((z) => z.text)]), ...expected.bilder.filter((b) => b.beschriftung).map((b) => b.beschriftung)].join(' ');
  for (const w of source.match(/[\p{L}]{4,}/gu) ?? []) words.add(w);
  const missing = [...words].filter((w) => !inv.text.includes(w));
  r.text = { woerter: words.size, gefunden: words.size - missing.length, abdeckung: Number(((words.size - missing.length) / words.size).toFixed(3)), fehlend: missing };
  return r;
}

function summaryRow(name, r) {
  const sum = (arr, k) => arr.reduce((a, x) => a + (typeof x[k] === 'number' ? x[k] : x[k] ? 1 : 0), 0);
  const t = r.tabelle;
  return {
    weg: name,
    abschnitt: `${r.abschnitt.gefunden}/${r.abschnitt.erwartet} gefunden, ${r.abschnitt.ebeneRichtig}/${r.abschnitt.erwartet} Ebene, ${r.abschnitt.zusaetzlich.length} zusätzlich`,
    tabelle: `${t.filter((x) => x.gefunden).length}/${t.length} Tabellen; Zellen ${sum(t, 'zellenRichtig')}/${sum(t, 'zellenErwartet')}; Kopf ${sum(t, 'kopfRichtig')}/${sum(t, 'kopfErwartet')}; Spannen ${sum(t, 'spannenRichtig')}/${sum(t, 'spannenErwartet')}; Beschriftung ${t.filter((x) => x.beschriftungRichtig).length}/${t.length}`,
    bild: `${r.bild.filter((b) => b.datei).length}/${r.bild.length} Datei; identisch ${r.bild.filter((b) => b.bilddatenIdentisch).length}/${r.bild.length}; alt ${r.bild.filter((b) => b.altRichtig).length}/${r.bild.length}; Beschriftung ${r.bild.filter((b) => b.beschriftungRichtig).length}/${r.bild.length}`,
    fussnote: `Text ${r.fussnote.filter((f) => f.notentext).length}/${r.fussnote.length}; verknüpft ${r.fussnote.filter((f) => f.verknuepft).length}/${r.fussnote.length}${r.fussnote.some((f) => f.nurAlsText) ? `; nur als Fließtext ${r.fussnote.filter((f) => f.nurAlsText).length}` : ''}`,
    text: `${r.text.abdeckung} (${r.text.gefunden}/${r.text.woerter})`,
  };
}

// ------------------------------------------------------------------------------- Grenzfall

function grenzfallChecks(xhtml, report) {
  const codes = new Set(report.meldungen.map((m) => m.code));
  const has = (re) => re.test(xhtml);
  const c = (merkmal, ok, ergebnis, gemeldet) => ({ merkmal, ok, ergebnis, gemeldet });
  return [
    c('Inhaltsverzeichnisfeld (TOC)', !has(/Text und Struktur\s+1</), has(/Text und Struktur\s+1</) ? 'Verzeichniszeile im Text' : 'entfällt', codes.has('verzeichnis') ? 'verzeichnis' : '–'),
    c('Überschrift mit Textmarke „Struktur“', has(/<h2 id="Struktur"/), has(/<h2 id="Struktur"/) ? 'h2 id="Struktur"' : 'fehlt', '–'),
    c('Zeichenvorlage „Strong“', has(/<strong>Strong-Zeichenvorlage<\/strong>/), 'strong', '–'),
    c('direkt fett / direkt kursiv', has(/<span class="hp-fett">direkt fett<\/span>/) && has(/<span class="hp-kursiv">direkt kursiv<\/span>/), 'span class="hp-fett"/"hp-kursiv" (keine Struktur aus dem Aussehen)', '–'),
    c('hochgestellt (w:vertAlign)', has(/m<sup>2<\/sup>/), 'sup', '–'),
    c('Fußnote', has(/role="doc-noteref"/) && has(/<aside id="[^"]+" role="doc-footnote" epub:type="footnote"><p>Text der Fußnote im Word-Dokument\.<\/p><\/aside>/), 'noteref + aside', '–'),
    c('direkt fett und groß formatierter Absatz', has(/<p><span class="hp-fett">Dieser Absatz ist nur direkt fett und groß formatiert\.<\/span><\/p>/), 'p (keine Überschrift)', '–'),
    c('getippter Spiegelstrich', has(/<p>- getippter Spiegelstrich, keine Liste<\/p>/), 'p mit Text „- …“ (keine Liste)', '–'),
    c('Aufzählung „List Bullet“ mit „List Bullet 2“', has(/<li>Echte Aufzählung, Eintrag zwei\s*<ul>\s*<li>Unterpunkt<\/li>/), 'ul mit verschachtelter ul', '–'),
    c('Nummerierung „List Number“', has(/<ol>\s*<li>Nummeriert eins<\/li>/), 'ol', '–'),
    c('Zitatvorlage „Quote“', has(/<blockquote[^>]*><p>Zitat aus dem Gutachten\.<\/p><\/blockquote>/), 'blockquote', '–'),
    c('REF-Feld auf Textmarke', has(/Querverweis auf <a href="#Struktur">Text und Struktur<\/a>/), 'a href="#Struktur"', '–'),
    c('PAGEREF-Feld', has(/auf Seite <a href="#Struktur">Text und Struktur<\/a>/), 'a href="#Struktur" mit Text des Ziels statt „1“', codes.has('seitenverweis') ? 'seitenverweis' : '–'),
    c('Hyperlink https', has(/<a href="https:\/\/example\.org\/normen">example\.org<\/a>/), 'a href', '–'),
    c('Hyperlink mailto', !has(/href="mailto:/) && has(/Mail buero@example\.org/), 'Text ohne Verknüpfung', codes.has('verweis-kein-http') ? 'verweis-kein-http' : '–'),
    c('DATE-Feld', has(/Datum als Feld: 13\. Oktober 2026/), 'letztes Ergebnis als Text', codes.has('feld-als-text') ? 'feld-als-text' : '–'),
    c('Inhaltssteuerelement', has(/Inhaltssteuerelement: Maria Beispiel/), 'Inhalt als Text', codes.has('steuerelement') ? 'steuerelement' : '–'),
    c('Änderungsverfolgung', has(/eingefügter Text bleibt/) && !has(/gelöschter Text/), 'Einfügung bleibt, Löschung entfällt', codes.has('aenderungen') ? 'aenderungen' : '–'),
    c('Kommentar', !has(/Bitte Messwert prüfen/), 'entfällt', codes.has('kommentare') ? 'kommentare' : '–'),
    c('Formel (OMML)', has(/<code>U=1\/R<\/code>/), '<code>U=1/R</code> (linear)', codes.has('formel') ? 'formel' : '–'),
    c('Textfeld (VML)', has(/<p>Inhalt des Textfelds<\/p>/), 'Absatz nach dem Ankerabsatz', codes.has('textfeld') ? 'textfeld' : '–'),
    c('Seitenumbruch', true, 'entfällt', codes.has('seitenumbruch') ? 'seitenumbruch' : '–'),
    c('Bild mit Alternativtext und SEQ-Beschriftung', has(/<figure id="[^"]+"><img src="media\/[^"]+" alt="Foto des Dachstuhls[^"]*"[^>]*\/><figcaption>Abbildung 1: Bild mit Alternativtext<\/figcaption><\/figure>/), 'figure mit alt und figcaption', '–'),
    c('Bild ohne Alternativtext', has(/alt="Picture 2"/), 'alt aus dem Namen „Picture 2“', codes.has('bild-ohne-alternativtext') ? 'bild-ohne-alternativtext' : '–'),
    c('als dekorativ markiertes Bild (adec:decorative)', has(/<img src="media\/[^"]+" alt=""[^>]*\/>/), 'img alt=""', '–'),
    c('BMP-Bild (mit --bild-auslassen)', has(/hp-import-luecke">\[Bild „Picture \d+“ nicht übernommen: Kleines Bild im BMP-Format/), 'Platzhalter', codes.has('bild-ausgelassen') ? 'bild-ausgelassen' : '–'),
    c('Tabelle mit tblHeader, gridSpan, vMerge, SEQ-Beschriftung', has(/<caption>Tabelle 1: Tabelle mit verbundenen Zellen<\/caption>/) && has(/<td rowspan="2">Spengler<\/td>/) && has(/<td colspan="2">Summe netto<\/td>/) && has(/<thead>\s*<tr><th scope="col">Gewerk<\/th>/), 'thead, rowspan, colspan, caption', '–'),
    c('verschachtelte Tabelle', has(/<td><table id="[^"]+" data-hp-table="scroll">/), 'table in td', '–'),
    c('Kopf- und Fußzeile', has(/data-hp-style="Kopfzeile">Büro Beispiel – Grenzfälle<\/p>/) && !has(/data-hp-style="Fußzeile">Seite/), 'Kopfzeilentext einmal am Ende, Seitenzahlzeile entfällt', codes.has('kopf-fusszeile') ? 'kopf-fusszeile, seitenzahl' : '–'),
  ];
}

// ------------------------------------------------------------------------------- main

const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonOut = jsonAt >= 0 ? args.splice(jsonAt, 2)[1] : null;
if (args[0] === '--grenzfall') {
  const [, , container, reportPath] = args;
  const { readContainer } = await kern();
  const c = await readContainer(readFileSync(container));
  const xhtml = new TextDecoder().decode(c.files.get('content/index.xhtml'));
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const rows = grenzfallChecks(xhtml, report);
  console.log('| Merkmal | Ergebnis im Container | wie erwartet | Meldung |');
  console.log('|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.merkmal} | ${r.ergebnis} | ${r.ok ? 'ja' : 'NEIN'} | ${r.gemeldet} |`);
  console.log(`\n${rows.filter((r) => r.ok).length} von ${rows.length} Merkmalen wie erwartet behandelt.`);
  console.log(`Meldungen des Imports: ${report.zusammenfassung.verlust} Verlust, ${report.zusammenfassung.ersatz} Ersatz, ${report.zusammenfassung.hinweis} Hinweis`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 2) + '\n');
  process.exit(rows.every((r) => r.ok) ? 0 : 1);
}

const [expectedPath, imageDir, ...pairs] = args;
const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
const images = {};
for (const b of expected.bilder) {
  const data = readFileSync(join(imageDir, `${b.name}.png`));
  images[b.name] = { sha256: sha(data), bytes: data.length };
}
const results = {};
for (const pair of pairs) {
  const eq = pair.indexOf('=');
  const name = pair.slice(0, eq);
  const file = pair.slice(eq + 1);
  const inv = await inventory(readFileSync(file));
  results[name] = { datei: file, ...compare(expected, inv, images) };
}

console.log('## Übersicht je Weg (Kategorie: erhalten / erwartet)\n');
console.log('| Weg | Abschnitt | Tabelle | Bild | Fußnote | Textabdeckung |');
console.log('|---|---|---|---|---|---|');
for (const [name, r] of Object.entries(results)) {
  const s = summaryRow(name, r);
  console.log(`| ${s.weg} | ${s.abschnitt} | ${s.tabelle} | ${s.bild} | ${s.fussnote} | ${s.text} |`);
}
for (const [name, r] of Object.entries(results)) {
  console.log(`\n## ${name} (${r.datei})\n`);
  console.log(`Abschnitt: ${r.abschnitt.gefunden}/${r.abschnitt.erwartet} Überschriften gefunden, ${r.abschnitt.ebeneRichtig} mit richtiger Ebene, ${r.abschnitt.mitKennung} mit Kennung, Reihenfolge ${r.abschnitt.reihenfolge ? 'richtig' : 'FALSCH'}, Titel als h1: ${r.abschnitt.titelH1 ? 'ja' : 'nein'}`);
  if (r.abschnitt.fehlend.length) console.log(`  fehlend: ${r.abschnitt.fehlend.join('; ')}`);
  if (r.abschnitt.falscheEbene.length) console.log(`  falsche Ebene: ${r.abschnitt.falscheEbene.join('; ')}`);
  if (r.abschnitt.zusaetzlich.length) console.log(`  zusätzliche Überschriften: ${r.abschnitt.zusaetzlich.join('; ')}`);
  for (const t of r.tabelle) {
    if (!t.gefunden) {
      console.log(`Tabelle „${t.beschriftung}“: NICHT gefunden (${t.zellen} Zellen)`);
      continue;
    }
    console.log(`Tabelle „${t.beschriftung}“ (${t.kennung}, Raster ${t.raster}): Zellen ${t.zellenRichtig}/${t.zellenErwartet}, Kopf ${t.kopfRichtig}/${t.kopfErwartet}, Spannen ${t.spannenRichtig}/${t.spannenErwartet}, Beschriftung ${t.beschriftungRichtig ? 'richtig' : `FALSCH (${t.beschriftungIst === null ? 'keine caption' : `„${t.beschriftungIst}“`})`}`);
    for (const a of t.abweichungen) console.log(`  Zelle ${a}`);
  }
  for (const b of r.bild) {
    console.log(`Bild ${b.name}: ${b.gefunden ? `Datei ${b.datei ? 'ja' : 'nein'}, Bilddaten identisch ${b.bilddatenIdentisch ? 'ja' : 'nein'}, alt ${b.altRichtig ? 'richtig' : `FALSCH („${b.altIst}“)`}, Beschriftung ${b.beschriftungRichtig ? 'richtig' : `FALSCH (${b.beschriftungIst === null ? 'keine' : `„${b.beschriftungIst}“`})`}` : 'NICHT gefunden'}`);
  }
  if (r.bildZusaetzlich.length) console.log(`  zusätzliche Abbildungen: ${r.bildZusaetzlich.join('; ')}`);
  for (const f of r.fussnote) console.log(`Fußnote „${f.text}“: ${f.notentext ? `Notentext ja${f.notentextExakt ? '' : ' (mit Nummer davor)'}, verknüpft ${f.verknuepft ? 'ja' : 'NEIN'}` : f.nurAlsText ? 'nur als Fließtext, keine Fußnote' : 'VERLOREN'}`);
  console.log(`Listen: ${r.listen.gefunden} (erwartet ${r.listen.erwartet}): ${r.listen.details.map((l) => `${l.ordered ? 'ol' : 'ul'} ${l.items} Einträge${l.nested ? `, ${l.nested} Unterliste` : ''}`).join('; ')}`);
  console.log(`Verweise: intern ${r.verweise.internGefunden}/${r.verweise.internErwartet} mit Ziel (${r.verweise.internTexte.join('; ') || '–'}), extern ${r.verweise.externGefunden}/${r.verweise.externErwartet}`);
  console.log(`Textabdeckung: ${r.text.abdeckung} (${r.text.gefunden}/${r.text.woerter} Wörter)${r.text.fehlend.length ? `; fehlend: ${r.text.fehlend.join(', ')}` : ''}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2) + '\n');
