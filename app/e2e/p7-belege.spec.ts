/**
 * Evidence run for docs/belege/P7 (npm run belege:p7 -w app), after scripts/belege-p7.sh has
 * written docs/belege/P7/container/review.hpro with the command line:
 *
 * - Abnahme 2: that file in the reader — the panel content as the user sees it is written to
 *   reader-anzeige.json (checked independently against the raw JSON-LD files in 08), screenshots
 *   at desktop and telephone width;
 * - the reader answers, resolves and highlights and saves review-reader.hpro (checked in 08);
 * - time from opening to the complete panel (the review and a file with 300 annotations),
 *   horizontal overflow at three widths with the panel open, network requests of the run.
 *
 * Not part of npm test (writes into the repository).
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { annotate, readContainer } from '../../kern/src/index.ts';
import { WIDTHS, docFrame, frameOverflow, innerFrame, openFile, shellOverflow, waitForFrame } from './helpers.js';

const OUT = fileURLToPath(new URL('../../docs/belege/P7/', import.meta.url));
const SHOTS = `${OUT}screenshots/`;
const CONTAINER = `${OUT}container/`;
const REVIEW = `${CONTAINER}review.hpro`;
const LARGE = fileURLToPath(new URL('../test-results/p7-gross.hpro', import.meta.url));
const I = 'content/index.xhtml';

const measurements: Record<string, unknown> = { oeffnen: {}, waagrechtesScrollen: {} };
const requests: string[] = [];

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}${name}.png` });
}

async function openReview(page: Page, file = REVIEW): Promise<number> {
  const t0 = Date.now();
  await openFile(page, file);
  await page.locator('#btn-annot').click();
  await expect(page.locator('#annot-panel')).toBeVisible();
  await expect(page.locator('#annot-count')).not.toHaveText('');
  return Date.now() - t0;
}

function track(page: Page): void {
  page.on('request', (r) => {
    if (!/^(http:\/\/127\.0\.0\.1|data:|blob:|about:)/.test(r.url())) requests.push(r.url());
  });
}

test.describe.configure({ mode: 'serial' });

test('Abnahme 2: die Datei der Kommandozeile im Reader – Anzeige festhalten, Bildschirmfotos', async ({ page }) => {
  track(page);
  const set = await annotate.readAnnotations(new Uint8Array(readFileSync(REVIEW)));
  await page.setViewportSize(WIDTHS.desktop);
  await openReview(page);
  const threads = page.locator('#annot-list > li.annot-thread');
  await expect(threads).toHaveCount(set.threads.length);
  // What the panel shows, read from its DOM (not from the reader's model).
  const shown = await threads.evaluateAll((lis) =>
    lis.map((li) => {
      const meta = (el: Element | null) => {
        const parts = (el?.textContent ?? '').split(' · ');
        return { author: parts[0], created: parts[1]?.replace(' UTC', 'Z').replace(' ', 'T') };
      };
      const head = li.querySelector('.annot-thread-head strong')!.textContent!;
      const quote = li.querySelector('.annot-quote');
      return {
        id: (li as HTMLElement).dataset['thread'],
        kind: head,
        ...meta(li.querySelector(':scope > .annot-meta')),
        quote: quote?.textContent ?? null,
        color: quote ? (['gelb', 'gruen', 'blau', 'rosa'].find((c) => quote.classList.contains(c)) ?? null) : null,
        text: li.querySelector(':scope > .annot-body')?.textContent ?? null,
        status: li.classList.contains('resolved') ? 'resolved' : 'open',
        statusLabel: li.querySelector('.annot-status')!.textContent,
        replies: Array.from(li.querySelectorAll('.annot-replies > li')).map((r) => ({ ...meta(r.querySelector('.annot-meta')), text: r.querySelector('.annot-body')!.textContent })),
      };
    }),
  );
  const marks = await docFrame(page).locator('mark[data-hp-anno]').count();
  const inkPaths = await docFrame(page).locator('svg.hp-ink path').count();
  const buttons = await docFrame(page).locator('button.hp-anno-btn').count();
  writeFileSync(`${CONTAINER}reader-anzeige.json`, `${JSON.stringify({ datei: 'review.hpro', count: await page.locator('#annot-count').textContent(), threads: shown, marks, inkPaths, buttons }, null, 2)}\n`);
  // The document text is unchanged by the marks.
  const text = await innerFrame(page).evaluate(() => {
    const copy = document.getElementById('anf-laerm')!.cloneNode(true) as HTMLElement;
    for (const r of Array.from(copy.querySelectorAll('[data-hp-reader]'))) r.remove();
    return copy.textContent!.replace(/\s+/g, ' ').trim();
  });
  expect(text).toBe('Lärmintensive Arbeiten sind nur außerhalb der Unterrichtszeit zulässig, also werktags vor 7:30 Uhr und nach 13:00 Uhr.');
  await docFrame(page).locator('#umfang').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.locator('#annot-list').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await shot(page, 'desktop-01-pruefrunde');
  await threads.nth(3).evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await shot(page, 'desktop-02-threads-freihand');
  await page.locator('#btn-next-doc').click();
  await waitForFrame(page);
  await shot(page, 'desktop-03-anhang-kommentar');

  for (const [name, size] of Object.entries(WIDTHS)) {
    await page.setViewportSize(size);
    await openReview(page);
    (measurements['waagrechtesScrollen'] as Record<string, unknown>)[name] = { breite: size.width, rahmen: await frameOverflow(page), huelle: await shellOverflow(page) };
    if (name === 'telefon') {
      await shot(page, 'telefon-01-leiste');
      await page.locator('[data-close="annot"]').click();
      await docFrame(page).locator('#anforderungen').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await shot(page, 'telefon-02-markierungen');
    }
  }
});

test('Speichern aus dem Reader: beantworten, erledigen, hervorheben', async ({ page }) => {
  track(page);
  await page.setViewportSize(WIDTHS.desktop);
  await openReview(page);
  await page.locator('#annot-author').fill('Ida Prüferin (Schulleitung)');
  // A highlight on a selection in the paragraph about dust.
  await waitForFrame(page);
  await expect(docFrame(page).locator('#anf-staub')).toBeVisible();
  await innerFrame(page).evaluate(() => {
    const t = Array.from(document.getElementById('anf-staub')!.childNodes).find((n) => n.nodeType === 3 && n.textContent!.includes('Bautagebuch')) as Text;
    const i = t.data.indexOf('Bautagebuch');
    const r = document.createRange();
    r.setStart(t, i);
    r.setEnd(t, i + 'Bautagebuch'.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  await expect(page.locator('#annot-selection')).toContainText('Bautagebuch');
  await page.locator('#annot-color').selectOption('rosa');
  await page.locator('#annot-text').fill('Digitales Bautagebuch genügt?');
  await page.getByRole('button', { name: 'Hervorheben', exact: true }).click();
  await expect(docFrame(page).locator('#anf-staub mark.hp-anno-rosa')).toHaveText('Bautagebuch');
  const luft = page.locator('#annot-list > li.annot-thread', { hasText: 'Luftmenge 3000' });
  await luft.locator('textarea').fill('Nachweis für 60 Personen liegt bei – erledigt.');
  await luft.getByRole('button', { name: /^Antwort auf Anmerkung \d senden$/ }).click();
  await luft.getByRole('button', { name: /als erledigt markieren$/ }).click();
  await expect(luft.locator('.annot-status')).toHaveText('erledigt von Ida Prüferin (Schulleitung)');
  await shot(page, 'desktop-04-reader-geaendert');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Speichern', exact: true }).click()]);
  await waitForFrame(page);
  const saved = new Uint8Array(readFileSync((await download.path())!));
  writeFileSync(`${CONTAINER}review-reader.hpro`, saved);
  await expect(page.locator('#annot-status')).toContainText('Anmerkungen gespeichert');
  expect((await readContainer(saved)).integrity.ok).toBe(true);
  const after = await annotate.readAnnotations(saved);
  expect(after.problems).toEqual([]);
  await shot(page, 'desktop-05-reader-gespeichert');
});

test('Messung: Öffnen bis zur vollständigen Leiste', async ({ page }) => {
  track(page);
  await page.setViewportSize(WIDTHS.desktop);
  // A file with 300 annotations (150 threads with one answer each) built on the review.
  const base = new Uint8Array(readFileSync(REVIEW));
  const index = new annotate.DocumentIndex((await readContainer(base)).files);
  const ids = ['gegenstand-text', 'gegenstand-ziel', 'anf-laerm', 'anf-staub', 'anf-abnahme', 'umfang-boden', 'umfang-lueftung'];
  const add = [];
  for (let i = 0; i < 150; i++) {
    const el = ids[i % ids.length]!;
    const words = index.text(I, el)!.text.split(' ');
    const quote = annotate.quoteOfText(index, `${I}#${el}`, words[(i * 7) % words.length]!, 1);
    const root = annotate.createAnnotation({ kind: i % 2 ? 'highlight' : 'comment', address: `${I}#${el}`, quote, color: i % 2 ? 'gelb' : undefined, text: `Anmerkung ${i}`, author: 'Messung', created: '2026-10-12T08:00:00Z', id: annotate.randomId() });
    add.push(root, annotate.createReply({ to: root.id, text: `Antwort ${i}`, author: 'Messung', created: '2026-10-12T08:05:00Z', id: annotate.randomId() }));
  }
  const large = (await annotate.saveAnnotations(base, { add }, { modified: '2026-10-12T12:00:00Z' })).bytes;
  writeFileSync(LARGE, large);
  const total = (await annotate.readAnnotations(large)).threads.length;
  for (const [name, file, threads] of [[`review.hpro, ${(await annotate.readAnnotations(base)).items.length} Anmerkungen`, REVIEW, undefined], [`300 zusätzliche Anmerkungen (${total} Threads)`, LARGE, total]] as const) {
    const t: number[] = [];
    for (let i = 0; i < 5; i++) {
      const ms = await openReview(page, file);
      if (threads) await expect(page.locator('#annot-list > li.annot-thread')).toHaveCount(threads);
      t.push(ms);
    }
    t.sort((a, b) => a - b);
    (measurements['oeffnen'] as Record<string, unknown>)[name] = { medianMs: t[2], maxMs: t[4], laeufe: t.length };
  }
  measurements['netzwerkAnfragenAusserhalbDesReaders'] = requests;
  writeFileSync(`${OUT}messungen-reader.json`, `${JSON.stringify(measurements, null, 2)}\n`);
});
