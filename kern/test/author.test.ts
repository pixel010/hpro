/**
 * S5 author path: Markdown with templates, Word import, template rules, losses as messages,
 * conformance of the results and determinism. The Word documents are built here with the core's
 * ZIP writer, so the tests need neither Word nor LibreOffice.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { author, checkConformance, createContainer, readContainer, writeZip, type Catalog, type ConformanceReport } from '../src/index.js';
import { REPO_ROOT, text } from './helpers.js';

const catalog = JSON.parse(await readFile(resolve(REPO_ROOT, 'docs/spezifikation/01-regelkatalog.json'), 'utf8')) as Catalog;
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const BMP = Uint8Array.from([0x42, 0x4d, 0x3a, 0, 0, 0, 0, 0, 0, 0, 0x36, 0, 0, 0, 0x28, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0x18, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0x13, 0x0b, 0, 0, 0x13, 0x0b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0]);

const template = (name: string) => {
  const t = author.findTemplate(name);
  assert.ok(t, `template ${name}`);
  return t;
};

async function md(source: string, tpl = 'frei', files: Record<string, Uint8Array> = {}) {
  const src = author.readMarkdown(source, { loadFile: (p) => files[p] });
  const r = await author.writeDocument(src, template(tpl), { sourceBytes: new TextEncoder().encode(source), sourceName: 'quelle.md' });
  return { src, r };
}

async function check(input: Parameters<typeof createContainer>[0]): Promise<ConformanceReport> {
  const c = await createContainer(input);
  return checkConformance(c.bytes, catalog, { fileName: 'test.hpro', checkedAt: '2026-10-13T00:00:00Z' });
}

const errors = (r: ConformanceReport) => r.results.filter((f) => f.class === 'ERROR' || f.class === 'FATAL' || f.class === 'WARNING').map((f) => `${f.rule}: ${f.message}`);
const codes = (messages: readonly author.Message[]) => messages.map((m) => m.code);

const REPORT = `---
titel: Prüfbericht Test
kennung: urn:uuid:11111111-2222-4333-8444-555555555555
datum: 2026-10-13
autoren:
  - Maria Beispiel
---

# Prüfbericht Test

::: zusammenfassung
Kurz: alles **gut**[^a].
:::

## Befund {#befund}

Text mit *Betonung*, \`code\`, H~2~O und m^2^, Link <https://example.org> und [intern](#messwerte).

- eins
- zwei
  - zwei a
- drei

3. drei
4. vier

### Messwerte {#messwerte}

| Punkt | Wert |
|-------|-----:|
| M1 | 12 |
| M2 | 14[^b] |

Table: Messwerte im Überblick {#tab-mess}

![Foto der Messstelle](bild.png "Abbildung 1: Messstelle")

![](linie.png){.dekorativ}

::: details Herleitung
Versteckter Text.
:::

[^a]: Fußnote A.
[^b]: Fußnote B in der Tabelle.
`;

test('markdown: structure, kennungen, footnotes, figures and template header', async () => {
  const { r } = await md(REPORT, 'bericht', { 'bild.png': PNG, 'linie.png': PNG });
  const x = r.xhtml;
  assert.match(x, /<h1 id="pruefbericht-test">Prüfbericht Test<\/h1>/);
  assert.match(x, /<p class="hp-kopf">Stand: 13\. Oktober 2026<\/p>/);
  assert.match(x, /<p class="hp-kopf">Verfasst von: Maria Beispiel<\/p>/);
  assert.match(x, /<section id="zusammenfassung" data-hp-role="summary">/);
  assert.match(x, /<section id="s-befund">\s*<h2 id="befund">Befund<\/h2>/);
  assert.match(x, /<em>Betonung<\/em>, <code>code<\/code>, H<sub>2<\/sub>O und m<sup>2<\/sup>/);
  assert.match(x, /<a href="https:\/\/example\.org">https:\/\/example\.org<\/a> und <a href="#messwerte">intern<\/a>/);
  assert.match(x, /<li>zwei\s*<ul>\s*<li>zwei a<\/li>\s*<\/ul>\s*<\/li>/);
  assert.match(x, /<ol start="3">/);
  assert.match(x, /<table id="tab-mess" data-hp-table="scroll">\s*<caption>Messwerte im Überblick<\/caption>\s*<thead>\s*<tr><th scope="col">Punkt<\/th><th scope="col">Wert<\/th><\/tr>/);
  assert.match(x, /<td>14<a href="#b" role="doc-noteref" epub:type="noteref" id="b-ref">2<\/a><\/td>/);
  assert.match(x, /<\/table>\s*<aside id="b" role="doc-footnote" epub:type="footnote"><p>Fußnote B in der Tabelle\.<\/p><\/aside>/);
  assert.match(x, /<figure id="abbildung-1"><img src="media\/bild\.png" alt="Foto der Messstelle"\/><figcaption>Abbildung 1: Messstelle<\/figcaption><\/figure>/);
  assert.match(x, /<img src="media\/linie\.png" alt=""\/>/);
  assert.match(x, /<details id="herleitung"><summary>Herleitung<\/summary>/);
  assert.equal(r.officeMin, false);
  assert.deepEqual(codes(r.messages), []);
  const report = await check(r.document);
  assert.deepEqual(errors(report), []);
});

test('markdown: what cannot be carried over is reported, never passed through', async () => {
  const { r } = await md(`---
titel: Verluste
---

# Verluste

<div onclick="alert(1)">roh <script>alert(2)</script></div>

---

Text mit <b>fett</b> und $x^2$ und ~~gestrichen~~ und [^fehlt].

![Fernbild](https://example.org/bild.png)
`);
  assert.doesNotMatch(r.xhtml, /<div|<script|onclick|<b>/);
  assert.match(r.xhtml, /<p>roh<\/p>/);
  assert.match(r.xhtml, /<p class="hp-import-luecke">\[Bild nicht übernommen: Fernbild\]<\/p>/);
  assert.match(r.xhtml, /<code>x\^2<\/code>/);
  assert.match(r.xhtml, /<span class="hp-durchgestrichen">gestrichen<\/span>/);
  const c = codes(r.messages);
  for (const code of ['html-block', 'trennlinie', 'html-inline', 'formel', 'durchgestrichen', 'fussnote-ohne-text', 'bild-nicht-geladen', 'datum-fehlt', 'kennung-abgeleitet']) assert.ok(c.includes(code), `${code} in ${c.join(', ')}`);
  assert.ok(r.messages.find((m) => m.code === 'html-block')!.severity === 'verlust');
});

test('markdown: images outside the source directory are not read', async () => {
  const read: string[] = [];
  const src = author.readMarkdown('# T\n\n![a](../geheim.png)\n\n![b](/etc/passwd)\n', { loadFile: (p) => (read.push(p), PNG) });
  assert.deepEqual(read, []);
  assert.equal(src.blocks.filter((b) => b.t === 'gap').length, 2);
});

test('templates: required fields, overview and sections are enforced', async () => {
  const noSummary = await md('---\ntitel: T\ndatum: 2026-10-13\nautoren: [A]\n---\n\n# T\n\n## Abschnitt\n\nText.\n', 'bericht');
  assert.ok(author.hasErrors(noSummary.r.messages));
  assert.ok(codes(noSummary.r.messages).includes('ueberblick-fehlt'));
  const offer = await md('---\ntitel: A\nangebotsnummer: 1\ndatum: 2026-10-13\nanbieter: B\nkunde: K\n---\n\n# A\n\n## Leistung\n\nX.\n', 'angebot');
  assert.deepEqual(offer.r.messages.filter((m) => m.code === 'abschnitt-fehlt').map((m) => m.text.match(/„(\w+)“\.$/)![1]), ['Positionen', 'Bedingungen']);
  const letter = await md('---\nabsender: |\n  Büro\n  Straße 1\nempfaenger: Frau B\nort: Innsbruck\ndatum: 2026-10-13\nbetreff: Ihr Angebot\ngruss: Mit freundlichen Grüßen\n---\n\nSehr geehrte Frau B,\n\nText.\n', 'brief');
  assert.equal(author.hasErrors(letter.r.messages), false);
  assert.equal(letter.r.document.title, 'Ihr Angebot');
  assert.match(letter.r.xhtml, /<p class="hp-kopf">Büro<br\/>Straße 1<\/p>/);
  assert.match(letter.r.xhtml, /<p class="hp-kopf">Innsbruck, 13\. Oktober 2026<\/p>/);
  assert.match(letter.r.xhtml, /<p class="hp-schluss">Mit freundlichen Grüßen<\/p>/);
  assert.equal(letter.r.officeMin, true);
  assert.equal(letter.r.document.subset, 'https://hpro.example/spec/0.1/subset/office-min');
  const report = await check(letter.r.document);
  assert.deepEqual(errors(report), []);
  assert.ok(report.results.every((f) => !f.rule.startsWith('HPR-MIN')));
});

test('templates from a file are checked', () => {
  const t = author.parseTemplate({ name: 'protokoll', label: 'Protokoll', fields: [{ key: 'titel', required: true }], sections: ['Beschlüsse'], officeMin: true }, 'body { color: var(--hp-foreground, #000); }');
  assert.equal(t.name, 'protokoll');
  assert.deepEqual(t.sections, ['Beschlüsse']);
  assert.throws(() => author.parseTemplate({ name: 'x' }, ':root { --hp-font-size: 20px; }'), /HP-INH-004/);
  assert.throws(() => author.parseTemplate({ name: 'x' }, '@import url(https://example.org/a.css);'), /HP-CONT-010/);
  assert.throws(() => author.parseTemplate({ name: 'X Y' }, ''), /name/);
});

test('markdown: two runs give the same bytes', async () => {
  const a = await createContainer((await md(REPORT, 'bericht', { 'bild.png': PNG, 'linie.png': PNG })).r.document);
  const b = await createContainer((await md(REPORT, 'bericht', { 'bild.png': PNG, 'linie.png': PNG })).r.document);
  assert.deepEqual(a.bytes, b.bytes);
});

// --------------------------------------------------------------------------------------------- Word

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
const para = (style: string | null, inner: string, extra = '') => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>${inner}</w:p>`;
const run = (t: string, rPr = '') => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`;
const field = (instr: string, result: string) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run(result)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
const picture = (rid: string, name: string, descr: string, decorative = false) =>
  `<w:r><w:drawing><wp:inline><wp:extent cx="952500" cy="476250"/><wp:docPr id="1" name="${name}" descr="${descr}">${decorative ? '<a:extLst><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst>' : ''}</wp:docPr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="${rid}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

async function docx(bodyXml: string, opts: { title?: boolean; extraRels?: string; media?: Record<string, Uint8Array> } = {}): Promise<Uint8Array> {
  const styles = `<w:styles ${W}>
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
    <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/></w:style>
    <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
    <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
    <w:style w:type="paragraph" w:styleId="MeineUeberschrift"><w:name w:val="Meine Überschrift"/><w:basedOn w:val="Heading1"/></w:style>
    <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/></w:style>
    <w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/></w:style>
    <w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style>
    <w:style w:type="character" w:styleId="Strong"><w:name w:val="Strong"/></w:style>
  </w:styles>`;
  const numbering = `<w:numbering ${W}>
    <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
    <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
    <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
  </w:numbering>`;
  const footnotes = `<w:footnotes ${W}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:id="1"><w:p><w:r><w:footnoteRef/></w:r>${run(' Fußnotentext.')}</w:p></w:footnote></w:footnotes>`;
  const rels = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
    <Relationship Id="rN" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
    <Relationship Id="rF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>
    <Relationship Id="rC" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>
    <Relationship Id="rL" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.org/" TargetMode="External"/>
    <Relationship Id="rI" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/bild.png"/>
    <Relationship Id="rB" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/alt.bmp"/>
    ${opts.extraRels ?? ''}
  </Relationships>`;
  const core = `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:title>Testdokument</dc:title><dc:language>de-AT</dc:language><dc:creator>Büro Test</dc:creator><dcterms:modified>2026-10-13T08:00:00Z</dcterms:modified><dc:identifier>urn:uuid:22222222-3333-4444-8555-666666666666</dc:identifier></cp:coreProperties>`;
  const document = `<w:document ${W}><w:body>${opts.title === false ? '' : para('Title', run('Testdokument'))}${bodyXml}<w:sectPr/></w:body></w:document>`;
  const enc = (s: string) => new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>\n${s}`);
  return writeZip(
    [
      { name: '[Content_Types].xml', data: enc('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'), compression: 'deflate' },
      { name: '_rels/.rels', data: enc('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'), compression: 'deflate' },
      { name: 'docProps/core.xml', data: enc(core), compression: 'deflate' },
      { name: 'word/document.xml', data: enc(document), compression: 'deflate' },
      { name: 'word/_rels/document.xml.rels', data: enc(rels), compression: 'deflate' },
      { name: 'word/styles.xml', data: enc(styles), compression: 'deflate' },
      { name: 'word/numbering.xml', data: enc(numbering), compression: 'deflate' },
      { name: 'word/footnotes.xml', data: enc(footnotes), compression: 'deflate' },
      { name: 'word/comments.xml', data: enc(`<w:comments ${W}><w:comment w:id="0"><w:p>${run('Kommentar')}</w:p></w:comment></w:comments>`), compression: 'deflate' },
      { name: 'word/media/bild.png', data: PNG, compression: 'store' },
      { name: 'word/media/alt.bmp', data: BMP, compression: 'store' },
    ],
    { modified: new Date('2026-10-13T08:00:00Z') },
  );
}

const WORD_BODY = [
  para('Heading1', `<w:bookmarkStart w:id="1" w:name="Kostenstand"/>${run('Kostenstand')}<w:bookmarkEnd w:id="1"/>`),
  para(null, `${run('Absatz mit ')}${run('Strong', '<w:rStyle w:val="Strong"/>')}${run(', ')}${run('fett', '<w:b/>')}${run(', m')}${run('2', '<w:vertAlign w:val="superscript"/>')}${run(' und Fußnote')}<w:r><w:footnoteReference w:id="1"/></w:r>${run('.')}`),
  para('MeineUeberschrift', run('Eigene Vorlage auf Basis Überschrift 1')),
  para('Heading2', run('Unterabschnitt')),
  para('ListBullet', run('Punkt eins')),
  para('ListBullet', run('Unterpunkt'), '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>'),
  para(null, run('Nummer eins'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>'),
  para(null, run('Nummer zwei'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>'),
  para(null, run('Zwischenabsatz')),
  para(null, run('Nummer drei'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>'),
  para('Quote', run('Zitat.')),
  para(null, `${run('Siehe ')}${field('REF Kostenstand \\h', 'Kostenstand')}${run(' auf Seite ')}${field('PAGEREF Kostenstand \\h', '3')}${run(', ')}<w:hyperlink r:id="rL">${run('Web')}</w:hyperlink>${run(' und ')}<w:ins w:id="5" w:author="A">${run('neu ')}</w:ins><w:del w:id="6" w:author="A"><w:r><w:delText>alt </w:delText></w:r></w:del><w:commentRangeStart w:id="0"/>${run('Ende')}<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r><m:oMath><m:f><m:num><m:r><m:t>a</m:t></m:r></m:num><m:den><m:r><m:t>b</m:t></m:r></m:den></m:f></m:oMath>`),
  `<w:tbl><w:tblGrid><w:gridCol/><w:gridCol/><w:gridCol/></w:tblGrid>
    <w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc>${para(null, run('A'))}</w:tc><w:tc>${para(null, run('B'))}</w:tc><w:tc>${para(null, run('C'))}</w:tc></w:tr>
    <w:tr><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr>${para(null, run('senkrecht'))}</w:tc><w:tc>${para(null, run('1'))}</w:tc><w:tc>${para(null, run('2'))}</w:tc></w:tr>
    <w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr>${para(null, '')}</w:tc><w:tc>${para(null, run('3'))}</w:tc><w:tc>${para(null, run('4'))}</w:tc></w:tr>
    <w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>${para(null, run('waagrecht'))}</w:tc><w:tc>${para(null, run('5'))}</w:tc></w:tr>
  </w:tbl>`,
  para('Caption', `${run('Tabelle ')}${field('SEQ Tabelle \\* ARABIC', '1')}${run(': Beschriftung')}`),
  para(null, picture('rI', 'Foto', 'Beschreibung des Fotos')),
  para('Caption', `${run('Abbildung ')}${field('SEQ Abbildung \\* ARABIC', '1')}${run(': Ein Foto')}`),
  para(null, picture('rI', 'Linie', '', true)),
].join('');

test('word: structure from styles, numbering, tables, captions, pictures, notes and fields', async () => {
  const bytes = await docx(WORD_BODY);
  const src = await author.readDocx(bytes);
  const r = await author.writeDocument(src, template('frei'), { sourceBytes: bytes, sourceName: 'test.docx' });
  const x = r.xhtml;
  assert.match(x, /<h1 id="testdokument" data-hp-style="Title">Testdokument<\/h1>/);
  assert.match(x, /<section id="s-Kostenstand">\s*<h2 id="Kostenstand" data-hp-style="Heading 1">Kostenstand<\/h2>/, 'bookmark name becomes the kennung (HP-MIN-004)');
  assert.match(x, /<strong>Strong<\/strong>, <span class="hp-fett">fett<\/span>, m<sup>2<\/sup>/, 'character style → strong, direct bold → class only (HP-MIN-003, HP-MIN-012)');
  assert.match(x, /<a href="#fn-1" role="doc-noteref" epub:type="noteref" id="fn-1-ref">1<\/a>/);
  assert.match(x, /<aside id="fn-1" role="doc-footnote" epub:type="footnote"><p>Fußnotentext\.<\/p><\/aside>/);
  assert.match(x, /<h2 id="eigene-vorlage-auf-basis-ueberschrift-1" data-hp-style="Meine Überschrift">/, 'own style resolved through basedOn');
  assert.match(x, /<h3 id="unterabschnitt"/);
  assert.match(x, /<li>Punkt eins\s*<ul>\s*<li>Unterpunkt<\/li>/);
  assert.match(x, /<ol>\s*<li>Nummer eins<\/li>\s*<li>Nummer zwei<\/li>\s*<\/ol>\s*<p>Zwischenabsatz<\/p>\s*<ol start="3">\s*<li>Nummer drei<\/li>/, 'continued numbering gets start (HP-MIN-005)');
  assert.match(x, /<blockquote data-hp-style="Quote"><p>Zitat\.<\/p><\/blockquote>/);
  assert.match(x, /Siehe <a href="#Kostenstand">Kostenstand<\/a> auf Seite <a href="#Kostenstand">Kostenstand<\/a>, <a href="https:\/\/example\.org\/">Web<\/a> und neu Ende<code>\(a\)\/\(b\)<\/code>|Siehe <a href="#Kostenstand">Kostenstand<\/a> auf Seite <a href="#Kostenstand">Kostenstand<\/a>, <a href="https:\/\/example\.org\/">Web<\/a> und neu Ende<code>a\/b<\/code>/);
  assert.doesNotMatch(x, /alt |Kommentar/);
  assert.match(x, /<caption>Tabelle 1: Beschriftung<\/caption>/);
  assert.match(x, /<thead>\s*<tr><th scope="col">A<\/th><th scope="col">B<\/th><th scope="col">C<\/th><\/tr>/);
  assert.match(x, /<td rowspan="2">senkrecht<\/td><td>1<\/td><td>2<\/td><\/tr>\s*<tr><td>3<\/td><td>4<\/td><\/tr>\s*<tr><td colspan="2">waagrecht<\/td><td>5<\/td>/);
  assert.match(x, /<figure id="abbildung-1"><img src="media\/foto\.png" alt="Beschreibung des Fotos" width="100" height="50"\/><figcaption>Abbildung 1: Ein Foto<\/figcaption><\/figure>/);
  assert.match(x, /<img src="media\/linie\.png" alt="" width="100" height="50"\/>/, 'decorative flag → alt=""');
  const c = codes(r.messages);
  for (const code of ['seitenverweis', 'aenderungen', 'kommentare', 'formel']) assert.ok(c.includes(code), `${code} in ${c.join(', ')}`);
  assert.equal(r.document.id, 'urn:uuid:22222222-3333-4444-8555-666666666666');
  assert.equal(r.document.modified, '2026-10-13T08:00:00Z');
  assert.deepEqual([...(r.document.creators ?? [])], ['Büro Test']);
  assert.equal(r.officeMin, true);
  const report = await check(r.document);
  assert.deepEqual(errors(report), []);
});

test('word: pictures outside the core media types stop the import unless omitted', async () => {
  const bytes = await docx(para(null, picture('rB', 'Altbild', 'BMP-Bild')));
  await assert.rejects(author.readDocx(bytes), (e: Error) => e instanceof author.DocxError && /Altbild.*BMP.*HP-MIN-007/.test(e.message));
  const src = await author.readDocx(bytes, { omitUnsupportedImages: true });
  const r = await author.writeDocument(src, template('frei'), {});
  assert.match(r.xhtml, /<p class="hp-import-luecke">\[Bild „Altbild“ nicht übernommen: BMP-Bild\]<\/p>/);
  assert.equal(r.messages.find((m) => m.code === 'bild-ausgelassen')?.severity, 'verlust');
});

test('word: without a title style, heading 1 stays h1 and opens the sections (table 15.2)', async () => {
  const bytes = await docx(`${para('Heading1', run('Erstens'))}${para(null, run('Text.'))}${para('Heading1', run('Zweitens'))}${para('Heading2', run('Unter'))}`, { title: false });
  const src = await author.readDocx(bytes);
  const r = await author.writeDocument(src, template('frei'), {});
  assert.equal(r.document.title, 'Testdokument');
  assert.doesNotMatch(r.xhtml, /<h1 id="testdokument"/);
  assert.match(r.xhtml, /<section id="s-erstens">\s*<h1 id="erstens" data-hp-style="Heading 1">Erstens<\/h1>/);
  assert.match(r.xhtml, /<section id="s-zweitens">\s*<h1 id="zweitens"[^>]*>Zweitens<\/h1>\s*<h2 id="unter"/);
  // Table 15.2 (Muss, HP-MIN-003) gives two h1 here; HP-INH-007 (Soll) wants one: the checker warns.
  // Reported as a contradiction of the specification (docs/12, section 7).
  const report = await check(r.document);
  assert.deepEqual(errors(report).map((e) => e.split(':')[0]), ['HPR-INH-010']);
});

test('word: not a Word document', async () => {
  await assert.rejects(author.readDocx(new TextEncoder().encode('kein zip')), author.DocxError);
  const zip = await writeZip([{ name: 'a.txt', data: new TextEncoder().encode('x'), compression: 'store' }], { modified: new Date('2026-10-13T00:00:00Z') });
  await assert.rejects(author.readDocx(zip), /w:document/);
});

test('word: same source, same bytes; the source is kept under original/', async () => {
  const bytes = await docx(WORD_BODY);
  const one = await createContainer((await author.writeDocument(await author.readDocx(bytes), template('frei'), { sourceBytes: bytes, sourceName: 'test.docx' })).document);
  const two = await createContainer((await author.writeDocument(await author.readDocx(bytes), template('frei'), { sourceBytes: bytes, sourceName: 'test.docx' })).document);
  assert.deepEqual(one.bytes, two.bytes);
  const back = await readContainer(one.bytes);
  assert.deepEqual(back.files.get('original/test.docx'), bytes);
  assert.equal(back.manifest.source?.type, author.DOCX_MEDIA_TYPE);
  assert.equal(back.manifest.subset, 'https://hpro.example/spec/0.1/subset/office-min');
  assert.match(text(back.files.get('content/nav.xhtml')!), /href="index\.xhtml#s-Kostenstand"/);
});
