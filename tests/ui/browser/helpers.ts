// Helpers for U browser tests against the TEST-DOUBLE harness (synthetic data only).
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export const HARNESS = '/tests/ui/browser/harness/index.html';
export const SHOTS = 'test-results/ui-screenshots';

export async function open(page: Page, flags = '') {
  await page.goto(`${HARNESS}${flags ? `?${flags}` : ''}`);
  await expect(page.getByTestId('screen-start')).toBeVisible();
}

/** Screen 1 -> Screen 2 using only the keyboard-operable form controls. */
export async function startGuest(page: Page, target = 'Fall 2028') {
  await page.getByLabel('University and program').selectOption({ index: 1 });
  await expect(page.getByTestId('catalog-summary')).toBeVisible();
  await page.getByLabel('Target graduation term').selectOption({ label: target });
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Academic record' })).toBeFocused();
}

/** Enters one completed synthetic attempt, reviews and accepts it. */
export async function enterCompletedAttempt(page: Page, code = 'SYN 101') {
  await page.getByRole('button', { name: 'Add course attempt' }).click();
  const row = page.getByTestId('record-row').last();
  await row.getByLabel('Course code').fill(code);
  await row.getByLabel('Term').selectOption({ label: 'Fall 2026' });
  await row.getByLabel('Status').selectOption({ label: 'Completed' });
  await row.getByLabel('Attempted credits').fill('3');
  await row.getByLabel('Earned credits').fill('3');
  await page.getByRole('button', { name: 'Review record' }).click();
  await expect(page.getByTestId('proposed-record')).toBeVisible();
  await page.getByRole('button', { name: 'Accept this record' }).click();
  await expect(page.getByTestId('notice-status')).toContainText('Record accepted');
}

export async function toPlanner(page: Page, path: 'selected' | 'generated') {
  await page.getByRole('button', { name: 'Continue to planner' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Graduation planner' })).toBeFocused();
  await page.getByRole('button', { name: path === 'selected' ? /I already selected courses/ : /Help me build a plan/ }).click();
}

export async function addCourse(page: Page, courseLabel: RegExp, term: string) {
  const form = page.getByTestId('add-course');
  await form.getByLabel('Course').selectOption({ label: await optionLabel(page, form.getByLabel('Course'), courseLabel) });
  await form.getByLabel('Term').selectOption({ label: term });
  await form.getByRole('button', { name: 'Add course' }).click();
  await expect(page.getByTestId('notice-status')).toContainText('Course added');
}

async function optionLabel(_page: Page, select: ReturnType<Page['getByLabel']>, pattern: RegExp): Promise<string> {
  const labels = await select.locator('option').allTextContents();
  const hit = labels.find(l => pattern.test(l));
  if (!hit) throw new Error(`No option matching ${pattern}`);
  return hit;
}

export function termCard(page: Page, label: string) {
  return page.getByTestId('term').filter({ has: page.locator(':scope > summary .term-name', { hasText: label }) });
}

export function termSummary(page: Page, label: string) {
  return termCard(page, label).locator(':scope > summary');
}

/** Asserts that nothing on the page scrolls horizontally. */
export async function expectNoHorizontalOverflow(page: Page) {
  const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(scroll, 'document must not overflow horizontally').toBeLessThanOrEqual(width);
}

/** Every visible interactive control meets the 44px minimum touch height. */
export async function expectTouchTargets(page: Page) {
  const small = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('button, select, input:not([type="checkbox"]):not([type="file"]), summary, a[href]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || el.closest('[hidden]') || el.classList.contains('skip-link')) continue;
      if (r.height < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 40)}" ${Math.round(r.height)}px`);
    }
    return out;
  });
  expect(small, 'controls below 44px').toEqual([]);
}

/** Every visible control has an accessible name (label, text or aria-label). */
export async function expectAccessibleNames(page: Page) {
  const unnamed = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('button, select, input, summary')) {
      if (el.getClientRects().length === 0) continue;
      const labelled = el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? (el.labels?.length ?? 0) > 0 : false;
      const name = (el.getAttribute('aria-label') ?? '').trim() || (el.textContent ?? '').trim();
      if (!labelled && !name) out.push(el.outerHTML.slice(0, 80));
    }
    return out;
  });
  expect(unnamed, 'controls without accessible names').toEqual([]);
}
