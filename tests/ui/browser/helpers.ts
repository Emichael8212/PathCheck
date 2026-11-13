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

/** Fills one attempt row (the newly added, open row). */
export async function fillAttempt(page: Page, code: string, opts: { term?: string; status?: string; attempted?: string; earned?: string } = {}) {
  await page.getByRole('button', { name: 'Add course attempt' }).click();
  const row = page.getByTestId('record-row').last();
  await row.getByLabel('Course code').fill(code);
  if (opts.term !== null) await row.getByLabel('Term').selectOption({ label: opts.term ?? 'Fall 2026' });
  await row.getByLabel('Status').selectOption({ label: opts.status ?? 'Completed' });
  await row.getByLabel('Attempted credits').fill(opts.attempted ?? '3');
  await row.getByLabel('Earned credits').fill(opts.earned ?? '3');
  return row;
}

/** Enters one completed synthetic attempt; automatic matching reports it before acceptance. */
export async function enterCompletedAttempt(page: Page, code = 'SYN 101') {
  await fillAttempt(page, code);
  await expect(page.getByTestId('record-summary')).toContainText('1 course checked. All match this catalog.');
}

/** Accepts the record if it has unaccepted changes (one explicit step), else continues; then picks a path. */
export async function toPlanner(page: Page, path: 'selected' | 'generated') {
  const accept = page.getByRole('button', { name: 'Accept and continue' });
  if (await accept.count()) {
    await accept.click();
    await expect(page.getByTestId('notice-status')).toContainText('Record accepted');
  } else {
    await page.getByRole('button', { name: 'Continue to planner' }).click();
  }
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

/**
 * Synthetic "normal" planner state: SYN 201, 202 and 301 all in Spring 2027, giving the
 * test double's three priority issues (two prerequisite conflicts, one unplaced course).
 */
export async function addThreeConflicting(page: Page) {
  await addCourse(page, /^SYN 201/, 'Spring 2027');
  await addCourse(page, /^SYN 202/, 'Spring 2027');
  await addCourse(page, /^SYN 301/, 'Spring 2027');
  await expect(page.getByTestId('issues').getByTestId('finding')).toHaveCount(3);
}

/** Viewport-relative box at the top of the page (scroll position reset first). */
export async function boxAtTop(page: Page, selector: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = await page.locator(selector).first().evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
  return box;
}

/** A semester section by its label, e.g. "Spring 2027". */
export function termCard(page: Page, label: string) {
  return page.getByTestId('term').filter({ has: page.locator(':scope > .term-head .term-name', { hasText: label }) });
}

/** Asserts that nothing on the page scrolls horizontally. */
export async function expectNoHorizontalOverflow(page: Page) {
  const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(scroll, 'document must not overflow horizontally').toBeLessThanOrEqual(width);
}

/** Every visible interactive control meets the minimum target height (40px desktop, 44px narrow). */
export async function expectTouchTargets(page: Page, min = 44) {
  const small = await page.evaluate(limit => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('button, select, input:not([type="checkbox"]):not([type="file"]), summary, a[href]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || el.closest('[hidden]') || el.classList.contains('skip-link') || getComputedStyle(el).visibility === 'hidden') continue;
      if (r.height < limit - 0.5) out.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 40)}" ${Math.round(r.height)}px`);
    }
    return out;
  }, min);
  expect(small, `controls below ${min}px`).toEqual([]);
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
