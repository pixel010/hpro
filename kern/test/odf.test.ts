// Package S8: the ODF reader of the author path (export path of word processors) and the header
// rows of the spreadsheet import. The LibreOffice end-to-end run is einbau/libreoffice/pruefen.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { author, calc, checkConformance, createContainer, readContainer, writeZip, type Catalog } from '../src/index.js';
import { REPO_ROOT, text } from './helpers.js';

const utf8 = (s: string) => new TextEncoder().encode(s);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const NS = `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0"`;

const STYLES = `<office:styles>
  <style:default-style style:family="paragraph"><style:text-properties fo:language="de" fo:country="AT"/></style:default-style>
  <style:style style:name="Standard" style:family="paragraph"/>
  <style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph" style:parent-style-name="Standard"/>
  <style:style style:name="Title" style:family="paragraph" style:parent-style-name="Standard"/>
  <style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard"/>
  <style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:parent-style-name="Heading" style:default-outline-level="1"/>
  <style:style style:name="Heading_20_2" style:display-name="Heading 2" style:family="paragraph" style:parent-style-name="Heading" style:default-outline-level="2"/>
  <style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard"/>
  <style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard"/>
  <style:style style:name="Caption" style:family="paragraph" style:parent-style-name="Standard"/>
  <style:style style:name="Table" style:family="paragraph" style:parent-style-name="Caption"/>
  <style:style style:name="Figure" style:family="paragraph" style:parent-style-name="Caption"/>
  <style:style style:name="Emphasis" style:family="text"/>
  <style:style style:name="Strong_20_Emphasis" style:display-name="Strong Emphasis" style:family="text"/>
  <style:style style:name="Source_20_Text" style:display-name="Source Text" style:family="text"/>
  <text:list-style style:name="Numbering_20_123"><text:list-level-style-number text:level="1" style:num-format="1"/></text:list-style>
  <text:list-style style:name="List_20_1"><text:list-level-style-bullet text:level="1" text:bullet-char="•"/><text:list-level-style-bullet text:level="2" text:bullet-char="◦"/></text:list-style>
</office:styles>`;

const AUTO = `<office:automatic-styles>
  <style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
  <style:style style:name="T2" style:family="text"><style:text-properties style:text-position="super 58%"/></style:style>
  <style:style style:name="T3" style:family="text"><style:text-properties text:display="none"/></style:style>
  <style:style style:name="P1" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:break-before="page"/></style:style>
</office:automatic-styles>`;

const MASTER = `<office:master-styles>
  <style:master-page style:name="Standard"><style:header><text:p text:style-name="Standard">Kopf des Berichts</text:p></style:header><style:footer><text:p text:style-name="Standard">Seite <text:page-number>1</text:page-number></text:p></style:footer></style:master-page>
</office:master-styles>`;

const BODY = `<office:body><office:text>
  <text:sequence-decls><text:sequence-decl text:display-outline-level="0" text:name="Table"/></text:sequence-decls>
  <text:p text:style-name="Title">Bericht über die Prüfung</text:p>
  <text:table-of-content text:name="Inhalt"><text:index-body><text:p>Einleitung 2</text:p></text:index-body></text:table-of-content>
  <text:h text:style-name="Heading_20_1" text:outline-level="1"><text:bookmark-start text:name="einleitung"/>Einleitung<text:bookmark-end text:name="einleitung"/></text:h>
  <text:p text:style-name="Text_20_body">Ein <text:span text:style-name="Strong_20_Emphasis">wichtiger</text:span> und <text:span text:style-name="T1">fetter</text:span> Satz mit m<text:span text:style-name="T2">2</text:span><text:span text:style-name="T3">versteckt</text:span>.<text:note text:id="ftn1" text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body><text:p text:style-name="Standard">Fußnotentext.</text:p></text:note-body></text:note> Siehe <text:bookmark-ref text:reference-format="text" text:ref-name="einleitung">Einleitung</text:bookmark-ref> und <text:a xlink:type="simple" xlink:href="https://example.org/a">Quelle</text:a>.<office:annotation><dc:creator>A</dc:creator><text:p>Kommentar</text:p></office:annotation></text:p>
  <text:list text:style-name="List_20_1"><text:list-item><text:p>eins</text:p><text:list><text:list-item><text:p>eins.a</text:p></text:list-item></text:list></text:list-item><text:list-item><text:p>zwei</text:p></text:list-item></text:list>
  <text:list text:style-name="Numbering_20_123"><text:list-item><text:p>erstens</text:p></text:list-item></text:list>
  <text:list text:style-name="Numbering_20_123" text:continue-numbering="true"><text:list-item><text:p>zweitens</text:p></text:list-item></text:list>
  <text:h text:style-name="Heading_20_2" text:outline-level="2">Ergebnisse</text:h>
  <table:table table:name="Werte"><table:table-column table:number-columns-repeated="2"/>
    <table:table-header-rows><table:table-row><table:table-cell><text:p>Größe</text:p></table:table-cell><table:table-cell><text:p>Wert</text:p></table:table-cell></table:table-row></table:table-header-rows>
    <table:table-row><table:table-cell table:number-columns-spanned="2"><text:p>über beide</text:p></table:table-cell><table:covered-table-cell/></table:table-row>
  </table:table>
  <text:p text:style-name="Table">Tabelle <text:sequence text:ref-name="refTable0" text:name="Table" text:formula="ooow:Table+1" style:num-format="1">1</text:sequence>: Messwerte</text:p>
  <text:p text:style-name="P1">Nach dem Umbruch, Verweis auf <text:sequence-ref text:reference-format="category-and-value" text:ref-name="refTable0">Tabelle 1</text:sequence-ref>.</text:p>
  <text:p text:style-name="Standard"><draw:frame draw:name="Rahmen1" text:anchor-type="paragraph" svg:width="5cm"><draw:text-box><text:p text:style-name="Figure"><draw:frame draw:name="Plan" text:anchor-type="as-char" svg:width="2.54cm" svg:height="1.27cm"><draw:image><office:binary-data>${PNG.toString('base64')}</office:binary-data></draw:image><svg:title>Lageplan des Gebäudes</svg:title></draw:frame>Abbildung <text:sequence text:ref-name="refFigure0" text:name="Figure" text:formula="ooow:Figure+1" style:num-format="1">1</text:sequence>: Lageplan</text:p></draw:text-box></draw:frame></text:p>
  <text:p text:style-name="Quotations">Zitat eins.</text:p>
  <text:p text:style-name="Quotations">Zitat zwei.</text:p>
  <text:p text:style-name="Preformatted_20_Text">a<text:s text:c="3"/>b</text:p>
  <text:p text:style-name="Preformatted_20_Text">c</text:p>
  <text:section text:name="Anhang"><text:p text:style-name="Text_20_body">Im Bereich <text:span text:style-name="Source_20_Text">code()</text:span>.</text:p></text:section>
</office:text></office:body>`;

const META = `<office:meta><dc:title>Prüfbericht</dc:title><dc:language>de-AT</dc:language><dc:date>2026-10-01T08:00:00Z</dc:date><meta:initial-creator>Ingenieurbüro</meta:initial-creator><meta:user-defined meta:name="hpro:id">urn:uuid:0b6d2f4e-1c3a-4d5e-8f70-112233445566</meta:user-defined></office:meta>`;

const FODT = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document ${NS} office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.text">${META}${STYLES}${AUTO}${MASTER}${BODY}</office:document>`;

async function odt(): Promise<Uint8Array> {
  const content = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ${NS} office:version="1.3">${AUTO}${BODY.replace(/<office:binary-data>[^<]*<\/office:binary-data>/, '').replace('<draw:image>', '<draw:image xlink:href="Pictures/plan.png" xlink:type="simple"/>').replace('</draw:image>', '')}</office:document-content>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-styles ${NS} office:version="1.3">${STYLES}${MASTER}</office:document-styles>`;
  const meta = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-meta ${NS} office:version="1.3">${META}</office:document-meta>`;
  return writeZip(
    [
      { name: 'mimetype', data: utf8('application/vnd.oasis.opendocument.text'), compression: 'store' },
      { name: 'content.xml', data: utf8(content), compression: 'auto' },
      { name: 'styles.xml', data: utf8(styles), compression: 'auto' },
      { name: 'meta.xml', data: utf8(meta), compression: 'auto' },
      { name: 'Pictures/plan.png', data: new Uint8Array(PNG), compression: 'auto' },
      { name: 'META-INF/manifest.xml', data: utf8('<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>'), compression: 'auto' },
    ],
    { modified: new Date('2026-10-01T08:00:00Z') },
  );
}

async function write(source: author.AuthorSource) {
  return author.writeDocument(source, author.findTemplate('frei')!, {});
}

for (const [label, bytes] of [['flat XML (.fodt)', async () => utf8(FODT)], ['package (.odt)', odt]] as const) {
  test(`ODF ${label}: structure from styles, references, notes, picture with caption`, async () => {
    const source = await author.readOdf(await bytes());
    assert.equal(source.format.name, label.startsWith('flat') ? 'fodt' : 'odt');
    assert.equal(source.meta.title, 'Prüfbericht');
    assert.equal(source.meta.language, 'de-AT');
    assert.equal(source.meta.modified, '2026-10-01T08:00:00Z');
    assert.equal(source.meta.id, 'urn:uuid:0b6d2f4e-1c3a-4d5e-8f70-112233445566');
    assert.deepEqual(source.meta.creators, ['Ingenieurbüro']);
    assert.equal(source.untitled, undefined, 'the title style counts as title');
    const r = await write(source);
    const x = r.xhtml;
    assert.match(x, /<h1 id="[^"]+" data-hp-style="Title">Bericht über die Prüfung<\/h1>/);
    assert.match(x, /<h2 id="einleitung" data-hp-style="Heading 1">Einleitung<\/h2>/, 'bookmark name is the kennung, outline 1 → h2 under a title');
    assert.match(x, /<h3 id="ergebnisse" data-hp-style="Heading 2">Ergebnisse<\/h3>/);
    assert.match(x, /<strong>wichtiger<\/strong>/, 'named character style → strong');
    assert.match(x, /<span class="hp-fett">fetter<\/span>/, 'direct bold → class, not strong (HP-MIN-012)');
    assert.match(x, /m<sup>2<\/sup>/);
    assert.doesNotMatch(x, /versteckt/);
    assert.match(x, /role="doc-noteref"[^>]*>1<\/a>/);
    assert.match(x, /<aside id="[^"]+" role="doc-footnote"[^>]*><p[^>]*>Fußnotentext\.<\/p><\/aside>/);
    assert.match(x, /Siehe <a href="#einleitung">Einleitung<\/a>/);
    assert.match(x, /<a href="https:\/\/example.org\/a">Quelle<\/a>/);
    assert.match(x, /<ul>\s*<li>eins\s*<ul>\s*<li>eins\.a<\/li>\s*<\/ul>\s*<\/li>\s*<li>zwei<\/li>\s*<\/ul>/);
    assert.match(x, /<ol start="2">\s*<li>zweitens<\/li>/, 'continued numbering');
    assert.match(x, /<table id="Werte"[^>]*>\s*<caption>Tabelle 1: Messwerte<\/caption>\s*<thead>\s*<tr><th scope="col">Größe<\/th><th scope="col">Wert<\/th><\/tr>/);
    assert.match(x, /<td colspan="2">über beide<\/td>/);
    assert.match(x, /Verweis auf <a href="#Werte">Tabelle 1<\/a>/, 'sequence reference resolves to the table');
    assert.match(x, /<figure id="[^"]+"><img src="media\/plan\.png" alt="Lageplan des Gebäudes" width="96" height="48"\/><figcaption>Abbildung 1: Lageplan<\/figcaption><\/figure>/);
    assert.match(x, /<blockquote data-hp-style="Quotations"><p>Zitat eins\.<\/p><p>Zitat zwei\.<\/p><\/blockquote>/, 'consecutive quotation paragraphs form one quote');
    assert.match(x, /<pre id="[^"]+" data-hp-style="Preformatted Text">a {3}b\nc<\/pre>/, 'consecutive code paragraphs form one block, spaces kept');
    assert.match(x, /<code>code\(\)<\/code>/);
    assert.match(x, /data-hp-style="Kopfzeile">Kopf des Berichts<\/p>/);
    assert.doesNotMatch(x, /Seite 1/, 'page number paragraph of the footer left out');
    const codes = new Set(r.messages.map((m) => m.code));
    for (const c of ['kommentare', 'versteckter-text', 'verzeichnis', 'seitenumbruch', 'bereich', 'kopf-fusszeile', 'seitenzahl']) assert.ok(codes.has(c), `message ${c} expected`);
    assert.equal(r.officeMin, true);
    assert.equal(source.inventory.kommentar, 1);
    assert.equal(source.inventory.bild, 1);
    const created = await createContainer(r.document);
    assert.equal(created.readBack.integrity.ok, true);
  });
}

test('ODF documents pass the conformance checker without findings (static rules)', async () => {
  const catalog = JSON.parse(await readFile(resolve(REPO_ROOT, 'docs/spezifikation/01-regelkatalog.json'), 'utf8')) as Catalog;
  for (const bytes of [utf8(FODT), await odt()]) {
    const r = await write(await author.readOdf(bytes));
    const created = await createContainer(r.document);
    const report = await checkConformance(created.bytes, catalog, { fileName: 'odf.hpro' });
    assert.deepEqual({ fatal: report.summary.fatal, error: report.summary.error, warning: report.summary.warning }, { fatal: 0, error: 0, warning: 0 }, JSON.stringify(report.results.filter((x) => x.class !== 'INFO').map((x) => x.message)));
  }
});

test('ODF reader rejects what it cannot read, with a reason', async () => {
  await assert.rejects(author.readOdf(utf8('<html/>')), author.OdfError);
  await assert.rejects(author.readOdf(utf8('<office:document ' + NS + '><office:body><office:spreadsheet/></office:body></office:document>')), /kein Textdokument.*office:spreadsheet/);
  const sheet = await writeZip([{ name: 'mimetype', data: utf8('application/vnd.oasis.opendocument.spreadsheet'), compression: 'store' }], { modified: new Date('2026-10-01T00:00:00Z') });
  await assert.rejects(author.readOdf(sheet), /hpro calc import/);
  const emf = FODT.replace(PNG.toString('base64'), Buffer.from([1, 0, 0, 0, 0x6c, 0, 0, 0]).toString('base64'));
  await assert.rejects(author.readOdf(utf8(emf)), /Bild „Plan“.*kein Kernmedientyp.*HP-MIN-007/);
  const lenient = await author.readOdf(utf8(emf), { omitUnsupportedImages: true });
  assert.ok(lenient.messages.some((m) => m.code === 'bild-ausgelassen' && m.severity === 'verlust'));
});

test('spreadsheet import: declared header rows (Calc „Wiederholungszeilen“) become thead with th', async () => {
  const fods = `<?xml version="1.0" encoding="UTF-8"?>
<office:document ${NS} office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.spreadsheet"><office:body><office:spreadsheet>
<table:table table:name="Kosten">
 <table:table-header-rows><table:table-row><table:table-cell office:value-type="string"><text:p>Position</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Betrag</text:p></table:table-cell></table:table-row></table:table-header-rows>
 <table:table-row><table:table-cell office:value-type="string"><text:p>Tür</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="85"><text:p>85</text:p></table:table-cell></table:table-row>
 <table:table-row><table:table-cell office:value-type="string"><text:p>Summe</text:p></table:table-cell><table:table-cell table:formula="of:=SUM([.B2:.B2])" office:value-type="float" office:value="85"><text:p>85</text:p></table:table-cell></table:table-row>
</table:table></office:spreadsheet></office:body></office:document>`;
  const r = await calc.importSpreadsheet(utf8(fods), { sourceName: 'kosten.fods', importedAt: '2026-10-14T12:00:00Z' });
  assert.match(r.xhtml, /<thead>\n<tr><th scope="col">Position<\/th><th scope="col">Betrag<\/th><\/tr>\n<\/thead>\n<tbody>\n<tr><td>Tür<\/td>/);
  // The formula still addresses the cells as before (header row = row 1).
  assert.match(r.xhtml, /data-hp-formula="=SUM\(\[\.B2:\.B2\]\)"[^>]*data-hp-value="85"/);
  const c = await readContainer(r.bytes);
  assert.equal(c.integrity.ok, true);
  assert.match(text(c.files.get('content/index.xhtml')!), /<thead>/);
});
