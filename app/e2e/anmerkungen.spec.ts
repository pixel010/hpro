/**
 * Annotations in the reader (package P7, HPC-0010):
 *
 * - Abnahme 2: a file with a review (comments, answers, a resolved thread, highlights, a drawing)
 *   is shown completely — every thread, text, author, status and answer of the file appears in the
 *   panel, every anchored passage is marked in the frame — and saving from the reader keeps every
 *   existing annotation file byte for byte;
 * - Abnahme 1 in the reader: comment on a selection, highlight, comment on a section, freehand,
 *   answer, resolve, reopen, delete, save, open again; export JSON-LD, CSV, XHTML; import;
 * - a signed document stays validly signed after annotating in the reader;
 * - comparison with another file (text changes plus annotation changes);
 * - axe-core: no serious violations with the panel open and marks in the document.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { annotate, createTestIdentity, edit, readContainer, readZip, signContainer, SoftwareKeySigner, validateContainer } from '../../kern/src/index.ts';
import { AXE_TAGS, SEVERE } from './a11y.js';
import { docFrame, innerFrame, openFile, waitForFrame } from './helpers.js';

const REVIEW_SAMPLE = fileURLToPath(new URL('../dist/anmerkungen.hpro', import.meta.url));
const SCRATCH = fileURLToPath(new URL('../test-results/p7/', import.meta.url));
const I = 'content/index.xhtml';
const dec = new TextDecoder();

async function openReview(page: Page, file = REVIEW_SAMPLE): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFile(page, file);
  await page.getByRole('button', { name: 'Anmerkungen', exact: true }).click();
  await expect(page.locator('#annot-panel')).toBeVisible();
  await expect(page.locator('#annot-count')).not.toHaveText('');
}

/** Selects `passage` inside element `id` of the document frame, like a user dragging over it. */
async function select(page: Page, id: string, passage: string): Promise<void> {
  await innerFrame(page).evaluate(
    ([id, passage]) => {
      const el = document.getElementById(id!)!;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n as Text;
        const i = t.data.indexOf(passage!);
        if (i < 0) continue;
        const r = document.createRange();
        r.setStart(t, i);
        r.setEnd(t, i + passage!.length);
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(r);
        return;
      }
      throw new Error(`${passage} not in #${id}`);
    },
    [id, passage],
  );
  await expect(page.locator('#annot-selection')).toContainText(passage);
}

async function savedFile(page: Page, click: () => Promise<void>): Promise<Uint8Array> {
  const [download] = await Promise.all([page.waitForEvent('download'), click()]);
  await waitForFrame(page);
  return new Uint8Array(readFileSync((await download.path())!));
}

async function downloaded(page: Page, click: () => Promise<void>): Promise<{ name: string; bytes: Uint8Array }> {
  const [download] = await Promise.all([page.waitForEvent('download'), click()]);
  return { name: download.suggestedFilename(), bytes: new Uint8Array(readFileSync((await download.path())!)) };
}

function thread(page: Page, n: number) {
  return page.locator('#annot-list > li.annot-thread').nth(n - 1);
}

async function rawEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  return new Map((await readZip(bytes)).map((e) => [e.name, e.data]));
}

test.describe('Anmerkungen, Review und Vergleich (P7)', () => {
  test('Abnahme 2: eine Datei mit Anmerkungen ist im Reader vollständig lesbar', async ({ page }) => {
    const bytes = new Uint8Array(readFileSync(REVIEW_SAMPLE));
    const set = await annotate.readAnnotations(bytes);
    expect(set.items.length).toBe(8);
    await openReview(page);
    await expect(page.locator('#annot-count')).toHaveText('5 Threads, 4 offen, 1 erledigt.');
    const threads = page.locator('#annot-list > li.annot-thread');
    await expect(threads).toHaveCount(5);
    // Every thread of the file, with author, quote, text, status and every answer.
    for (const [k, t] of set.threads.entries()) {
      const li = threads.nth(k);
      await expect(li).toHaveAttribute('data-thread', t.root.id);
      await expect(li.locator('.annot-meta').first()).toContainText(t.root.author);
      if (t.root.quote) await expect(li.locator('.annot-quote')).toHaveText(t.root.quote.exact);
      if (t.root.text) await expect(li.locator(':scope > .annot-body')).toHaveText(t.root.text);
      await expect(li.locator('.annot-status')).toContainText(t.status === 'resolved' ? 'erledigt' : 'offen');
      const replies = li.locator('.annot-replies > li');
      await expect(replies).toHaveCount(t.replies.length);
      for (const [j, r] of t.replies.entries()) {
        await expect(replies.nth(j).locator('.annot-meta')).toContainText(r.author);
        await expect(replies.nth(j).locator('.annot-body')).toHaveText(r.text);
      }
    }
    // The frame: passages marked, buttons numbered, the drawing over the table.
    const frame = docFrame(page);
    await expect(frame.locator('mark[data-hp-anno]')).toHaveCount(3);
    await expect(frame.locator('#anf-laerm mark[data-hp-anno]')).toHaveText('nach 13:00 Uhr');
    await expect(frame.locator('#umfang-lueftung mark.hp-anno-gelb')).toHaveText('Luftmenge 3000 m³/h');
    await expect(frame.locator('#umfang-zugang mark.hp-anno-gruen')).toHaveText('höchstens 6 Prozent');
    await expect(frame.locator('svg.hp-ink path')).toHaveCount(2);
    await expect(frame.locator('button.hp-anno-btn')).toHaveCount(4);
    await expect(frame.locator('#anf-laerm button.hp-anno-btn')).toHaveAttribute('aria-label', /^Anmerkung \d, Kommentar von Eva Berger \(Bauamt\), erledigt, 2 Antworten: Freitags endet/);
    // The text of the document is unchanged by the marks (the reader's buttons aside).
    const textWithoutReader = await innerFrame(page).evaluate(() => {
      const copy = document.getElementById('anf-laerm')!.cloneNode(true) as HTMLElement;
      for (const r of Array.from(copy.querySelectorAll('[data-hp-reader]'))) r.remove();
      return copy.textContent!.replace(/\s+/g, ' ').trim();
    });
    expect(textWithoutReader).toBe('Lärmintensive Arbeiten sind nur außerhalb der Unterrichtszeit zulässig, also werktags vor 7:30 Uhr und nach 13:00 Uhr.');
    // A click on a mark opens its thread in the panel.
    await frame.locator('#umfang-lueftung mark[data-hp-anno]').click();
    await expect(page.locator(`[data-thread="${set.threads.find((t) => t.root.color === 'gelb')!.root.id}"] .annot-thread-head`)).toBeFocused();
    // The comment on the annex shows in its own content document.
    await page.locator('#btn-next-doc').click();
    await waitForFrame(page);
    await expect(frame.locator('#bestand-text.hp-anno-block button.hp-anno-btn')).toHaveCount(1);
  });

  test('Abnahme 1 im Reader: anlegen, hervorheben, zeichnen, beantworten, erledigen, speichern – ohne Verlust', async ({ page }) => {
    const before = new Uint8Array(readFileSync(REVIEW_SAMPLE));
    const old = await annotate.readAnnotations(before);
    await openReview(page);
    // A short window, so that the document scrolls and "the current section" is well defined.
    await page.setViewportSize({ width: 1440, height: 520 });
    await page.locator('#annot-author').fill('Ida Prüferin');
    // Comment on a selection.
    await select(page, 'anf-staub', 'täglich zu prüfen');
    await page.locator('#annot-text').fill('Wer prüft am Wochenende?');
    await page.getByRole('button', { name: 'Kommentieren', exact: true }).click();
    await expect(page.locator('#annot-status')).toHaveText('Kommentar angelegt (nicht gespeichert).');
    await expect(docFrame(page).locator('#anf-staub mark[data-hp-anno]')).toHaveText('täglich zu prüfen');
    // Highlight in blue across an inline boundary-free passage.
    await select(page, 'gegenstand-text', 'Schulbetrieb läuft während der Arbeiten weiter');
    await page.locator('#annot-color').selectOption('blau');
    await page.getByRole('button', { name: 'Hervorheben', exact: true }).click();
    await expect(docFrame(page).locator('#gegenstand-text mark.hp-anno-blau')).toHaveText('Schulbetrieb läuft während der Arbeiten weiter');
    // Comment on the current section (keyboard way, no selection needed).
    await docFrame(page).locator('#anforderungen-h').evaluate((h) => h.scrollIntoView({ block: 'start' }));
    await expect(page.locator('#pos-section')).toHaveText('Anforderungen');
    await page.locator('#annot-text').fill('Abschnitt insgesamt mit dem Bauamt abstimmen.');
    await page.getByRole('button', { name: 'Kommentar zum Abschnitt' }).click();
    await expect(page.locator('#annot-list > li.annot-thread')).toHaveCount(8);
    // Freehand on the paragraph about the acceptance.
    await page.getByRole('button', { name: 'Freihand zeichnen' }).click();
    await expect(page.getByRole('button', { name: 'Freihand beenden' })).toHaveAttribute('aria-pressed', 'true');
    await docFrame(page).locator('#anf-abnahme').evaluate((p) => p.scrollIntoView({ block: 'center' }));
    const box = (await docFrame(page).locator('#anf-abnahme').boundingBox())!;
    await page.mouse.move(box.x + 10, box.y + box.height - 4);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 10 + (i * (box.width - 40)) / 10, box.y + box.height - 4 - (i % 2) * 3);
    await page.mouse.up();
    await expect(page.locator('#annot-ink-status')).toHaveText('1 Strich auf #anf-abnahme');
    await page.getByRole('button', { name: 'Zeichnung übernehmen' }).click();
    await page.getByRole('button', { name: 'Freihand beenden' }).click();
    await expect(page.locator('#annot-list > li.annot-thread')).toHaveCount(9);
    await expect(docFrame(page).locator('#anf-abnahme svg.hp-ink path')).toHaveCount(1);
    // Answer the open highlight, then resolve it; reopen the resolved comment.
    const hl = thread(page, 2);
    await hl.locator('textarea').fill('Nachweis liegt bei, danke.');
    await hl.getByRole('button', { name: /^Antwort auf Anmerkung 2 senden$/ }).click();
    await thread(page, 2).getByRole('button', { name: 'Anmerkung 2 als erledigt markieren' }).click();
    await expect(thread(page, 2).locator('.annot-status')).toHaveText('erledigt von Ida Prüferin');
    await thread(page, 1).getByRole('button', { name: 'Anmerkung 1 wieder öffnen' }).click();
    await expect(thread(page, 1).locator('.annot-status')).toHaveText('offen');
    await expect(page.locator('#annot-dirty')).toHaveText('Nicht gespeichert: 7 neu, 0 gelöscht.');
    // Save: a new file is downloaded and opened.
    const saved = await savedFile(page, () => page.getByRole('button', { name: 'Speichern', exact: true }).click());
    await expect(page.locator('#annot-status')).toContainText('Anmerkungen gespeichert (7 neu, 0 gelöscht; im Hash-Manifest verzeichnet');
    await expect(page.locator('#annot-count')).toHaveText('9 Threads, 8 offen, 1 erledigt.');
    // The saved file, read by the core: everything old byte-identical, the new ones there and verified.
    const c = await readContainer(saved);
    expect(c.integrity.ok).toBe(true);
    expect(c.integrity.unlisted).toEqual([]);
    const [a, b] = [await rawEntries(before), await rawEntries(saved)];
    for (const i of old.items) expect(b.get(i.path), i.path).toEqual(a.get(i.path));
    const set = await annotate.readAnnotations(saved);
    expect(set.problems).toEqual([]);
    expect(set.items.length).toBe(15);
    const mine = set.items.filter((i) => i.info.author === 'Ida Prüferin').map((i) => i.info);
    expect(mine.map((i) => i.kind).sort()).toEqual(['comment', 'comment', 'highlight', 'ink', 'reply', 'reply', 'reply']);
    expect(mine.find((i) => i.kind === 'comment' && i.quote)!.quote!.exact).toBe('täglich zu prüfen');
    expect(mine.find((i) => i.kind === 'highlight')!.color).toBe('blau');
    expect(mine.find((i) => i.kind === 'ink')!.elementId).toBe('anf-abnahme');
    expect(mine.find((i) => i.kind === 'comment' && !i.quote)!.elementId).toBe('anforderungen');
    for (const i of set.items) if (i.anchor) expect(i.anchor.state, i.info.id).toBe('exact');
    // History entry and journal-free main version: the manifest names the step.
    expect((c.manifest as unknown as { history: { note: string }[] }).history.at(-1)!.note).toBe('Anmerkungen: 4 neu, 1 Antwort, 1 erledigt, 1 wieder geöffnet');
    // Opened again from the file: the reader shows the same threads (no loss through the round trip).
    await expect(page.locator('#annot-list > li.annot-thread')).toHaveCount(9);
    await expect(docFrame(page).locator('#anf-staub mark[data-hp-anno]')).toHaveText('täglich zu prüfen');
    await expect(docFrame(page).locator('#anf-abnahme svg.hp-ink path')).toHaveCount(1);
    // Delete my section comment (two steps), save again: only that file is gone.
    const sectionThread = page.locator(`[data-thread="${mine.find((i) => i.kind === 'comment' && !i.quote)!.id}"]`);
    await sectionThread.getByRole('button', { name: /löschen$/ }).click();
    await sectionThread.getByRole('button', { name: /wirklich löschen\?$/ }).click();
    await expect(page.locator('#annot-list > li.annot-thread')).toHaveCount(8);
    const again = await savedFile(page, () => page.getByRole('button', { name: 'Speichern', exact: true }).click());
    const after = await annotate.readAnnotations(again);
    expect(after.items.length).toBe(14);
    expect((await readContainer(again)).integrity.ok).toBe(true);
  });

  test('Export JSON-LD, CSV und Bericht; Import in eine Kopie ohne Anmerkungen', async ({ page }) => {
    const bytes = new Uint8Array(readFileSync(REVIEW_SAMPLE));
    const set = await annotate.readAnnotations(bytes);
    await openReview(page);
    const jsonld = await downloaded(page, () => page.getByRole('button', { name: 'Export JSON-LD' }).click());
    expect(jsonld.name).toBe('anmerkungen-anmerkungen.jsonld');
    const parsed = annotate.fromCollection(JSON.parse(dec.decode(jsonld.bytes)));
    expect(parsed.problems).toEqual([]);
    const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id).sort();
    expect(ids(parsed.annotations)).toEqual(ids(set.items.map((i) => i.json)));
    for (const a of parsed.annotations) expect(annotate.canonicalJson(a)).toBe(annotate.canonicalJson(set.items.find((i) => i.info.id === a.id)!.json));
    const csv = await downloaded(page, () => page.getByRole('button', { name: 'Export CSV' }).click());
    expect([...csv.bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder('utf-8', { ignoreBOM: true }).decode(csv.bytes).trimEnd().split('\r\n');
    expect(lines[0]).toBe('\uFEFFThread,Nr,Kennung,Art,Status,Autor,Erstellt,Adresse,Zitat,Text,Antwort auf,Farbe,Verankerung,Schutz');
    expect(lines.length).toBe(1 + 8);
    const xhtml = await downloaded(page, () => page.getByRole('button', { name: 'Bericht (XHTML)' }).click());
    expect(dec.decode(xhtml.bytes)).toContain('5 Threads, davon 4 offen, 8 Anmerkungen insgesamt');
    // A copy of the same document without annotations (the clean draft), then import.
    const clean = await edit.checkoutVersion(bytes, 0).catch(() => undefined);
    const base = clean ?? (await annotate.saveAnnotations(bytes, { remove: set.threads.map((t) => t.root.id) }, { modified: '2026-10-12T10:00:00Z' })).bytes;
    mkdirSync(SCRATCH, { recursive: true });
    writeFileSync(`${SCRATCH}leer.hpro`, base);
    expect((await annotate.readAnnotations(base)).items.length).toBe(0);
    await openReview(page, `${SCRATCH}leer.hpro`);
    await expect(page.locator('#annot-count')).toHaveText('0 Threads, 0 offen, 0 erledigt.');
    writeFileSync(`${SCRATCH}export.jsonld`, jsonld.bytes);
    await page.locator('#annot-import-file').setInputFiles(`${SCRATCH}export.jsonld`);
    await expect(page.locator('#annot-status')).toHaveText('Import aus „export.jsonld“: 8 übernommen, 0 schon vorhanden (nicht gespeichert).');
    const merged = await savedFile(page, () => page.getByRole('button', { name: 'Speichern', exact: true }).click());
    const back = await annotate.readAnnotations(merged);
    for (const i of set.items) expect(annotate.canonicalJson(back.items.find((x) => x.info.id === i.info.id)!.json), i.info.id).toBe(annotate.canonicalJson(i.json));
    await expect(page.locator('#annot-count')).toHaveText('5 Threads, 4 offen, 1 erledigt.');
  });

  test('signiertes Dokument: Anmerkung im Reader, Signatur bleibt gültig, Datei als „nicht signiert“ ausgewiesen', async ({ page }) => {
    const id = await createTestIdentity({ algorithm: 'EC-P256', commonName: 'P7 Reader', notBefore: new Date('2026-01-01T00:00:00Z') });
    const signed = (await signContainer(new Uint8Array(readFileSync(REVIEW_SAMPLE)), { signer: await SoftwareKeySigner.fromPkcs8(id.pkcs8, { certificateChain: [id.certificate] }), signingTime: new Date('2026-10-12T09:30:00Z') })).bytes;
    mkdirSync(SCRATCH, { recursive: true });
    writeFileSync(`${SCRATCH}signiert.hpro`, signed);
    await openReview(page, `${SCRATCH}signiert.hpro`);
    await expect(page.locator('#annot-count')).toContainText('Dokument signiert');
    await page.locator('#annot-author').fill('Ida Prüferin');
    await thread(page, 2).getByRole('button', { name: 'Anmerkung 2 als erledigt markieren' }).click();
    await expect(thread(page, 2).getByRole('button', { name: /löschen$/ })).toBeDisabled();
    const saved = await savedFile(page, () => page.getByRole('button', { name: 'Speichern', exact: true }).click());
    await expect(page.locator('#annot-status')).toContainText('außerhalb der Signatur abgelegt, Signatur unverändert gültig');
    const report = await validateContainer(saved, { trustAnchors: [id.certificate], validationTime: '2026-10-12T12:00:00Z' });
    expect(report.signatures.map((s) => s.indication)).toEqual(['TOTAL_PASSED']);
    expect(report.unsignedPaths.length).toBe(1);
    expect(report.unsignedPaths[0]).toMatch(/^annotations\/[0-9a-f-]{36}\.jsonld$/);
    const [a, b] = [await rawEntries(signed), await rawEntries(saved)];
    expect(b.get('manifest.json')).toEqual(a.get('manifest.json'));
    await expect(thread(page, 2).locator('.annot-status')).toHaveText('erledigt von Ida Prüferin');
  });

  test('Vergleich mit einer anderen Datei: Textänderung und Anmerkungen an der geänderten Stelle', async ({ page }) => {
    const bytes = new Uint8Array(readFileSync(REVIEW_SAMPLE));
    const changed = await edit.editContainer(bytes, [{ op: 'set-text', target: `${I}#anf-laerm`, text: 'Lärmintensive Arbeiten sind werktags vor 7:30 Uhr und nach 13:00 Uhr zulässig, freitags ab 12:00 Uhr.' }], { at: '2026-10-12T12:00:00Z' });
    mkdirSync(SCRATCH, { recursive: true });
    writeFileSync(`${SCRATCH}neu.hpro`, changed.bytes);
    await openReview(page);
    await page.getByRole('button', { name: 'Verlauf' }).click();
    await page.locator('#diff-file-role').selectOption('newer');
    await page.locator('#diff-file').setInputFiles(`${SCRATCH}neu.hpro`);
    await expect(page.locator('#diff-status')).toHaveText('Vergleich anmerkungen.hpro → neu.hpro: 1 Änderung im Text, 0 neue und 0 entfernte Anmerkungen, 0 Statuswechsel, 1 Threads an geänderten Stellen.');
    await expect(page.locator('#diff-list li')).toHaveCount(1);
    await expect(page.locator('#diff-list ins')).toContainText('freitags ab 12');
    await expect(page.locator('#diff-annot li')).toHaveText([/^Betroffen \(erledigt\): Kommentar an #anf-laerm – Text verschoben „nach 13:00 Uhr“$/]);
    const txt = await downloaded(page, () => page.locator('#diff-review-download').click());
    expect(dec.decode(txt.bytes)).toContain('Betroffene Threads (Stelle geändert, verschoben oder verwaist): 1');
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).include('#dlg-history').analyze();
    expect(axe.violations.filter((v) => SEVERE.has(v.impact ?? '')).map((v) => v.id)).toEqual([]);
  });

  test('Barrierefreiheit: Leiste und markiertes Dokument ohne schwere Verstöße (axe-core)', async ({ page }) => {
    await openReview(page);
    const panel = await new AxeBuilder({ page }).withTags(AXE_TAGS).include('#annot-panel').analyze();
    expect(panel.violations.filter((v) => SEVERE.has(v.impact ?? '')).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    const frame = await new AxeBuilder({ page }).withTags(AXE_TAGS).include(['#doc-host', '#doc-frame']).analyze();
    expect(frame.violations.filter((v) => SEVERE.has(v.impact ?? '')).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    // Keyboard: the thread button in the text is reachable and opens the thread.
    const btn = docFrame(page).locator('#anf-laerm button.hp-anno-btn');
    await btn.focus();
    await btn.press('Enter');
    await expect(page.locator('#annot-list .annot-thread-head:focus')).toHaveCount(1);
  });
});
