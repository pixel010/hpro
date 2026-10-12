/** Shared helpers of the form tests (P6): the sample, a valid application, entering values. */
import { expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { docFrame, openFile } from './helpers.js';

export const FORM_SAMPLE = fileURLToPath(new URL('../dist/antrag.hpro', import.meta.url));

/** A complete, valid application as a user types it. */
export const VALID: ReadonlyArray<readonly [string, string]> = [
  ['vorname', 'Maria'],
  ['nachname', 'Muster'],
  ['geburtsdatum', '1988-03-14'],
  ['email', 'maria.muster@beispiel.at'],
  ['telefon', '+43 512 123456'],
  ['familienstand', 'verheiratet'],
  ['kinder', '1'],
  ['beschaeftigung', 'angestellt'],
  ['mitantrag', 'check'],
  ['mit_vorname', 'Thomas'],
  ['mit_nachname', 'Muster'],
  ['mit_einkommen', '2.480,50'],
  ['einkommen', '2.950,00'],
  ['sonstige_einnahmen', '138,30'],
  ['wohnkosten', '1.150,00'],
  ['lebenshaltung', '1.850,00'],
  ['kaufpreis', '420.000'],
  ['eigenmittel', '105.000'],
  ['laufzeit_jahre', '25'],
  ['kontoinhaber', 'Maria Muster'],
  ['iban', 'AT61 1904 3002 3457 3201'],
  ['antragsdatum', '2026-10-12'],
  ['ort', 'Innsbruck'],
  ['angaben_richtig', 'check'],
  ['datenschutz', 'check'],
];

export function field(page: Page, name: string) {
  return docFrame(page).locator(`[data-hp-field="antrag.${name}"]`);
}

/** Enters a value the way a user does: type and leave the field, pick, tick. */
export async function enter(page: Page, name: string, value: string): Promise<void> {
  const el = field(page, name);
  const tag = await el.first().evaluate((e) => `${e.localName}:${e.getAttribute('type') ?? ''}`);
  if (tag === 'select:') await el.selectOption(value);
  else if (tag === 'input:radio') await docFrame(page).locator(`input[data-hp-field="antrag.${name}"][value="${value}"]`).check();
  else if (tag === 'input:checkbox') await (value === 'check' ? el.check() : el.uncheck());
  else {
    await el.fill(value);
    await el.press('Tab');
  }
}

export async function openForm(page: Page): Promise<void> {
  await openFile(page, FORM_SAMPLE);
  await expect(page.locator('#doc-title')).toHaveText('Finanzierungsanfrage Wohnungskauf – Selbstauskunft');
  await expect(page.locator('#form-status')).toHaveText('Formular antrag: Entwurf');
}
