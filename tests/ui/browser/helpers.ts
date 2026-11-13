// Helpers for U browser tests against the TEST-DOUBLE harness (synthetic data only).
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export const HARNESS = '/tests/ui/browser/harness/index.html';
export const SHOTS = 'test-results/ui-screenshots';

/**
 * Screenshot capture is opt-in (PATHCHECK_UI_SCREENSHOTS=1). By default nothing is
 * captured; the surrounding assertions still run, so tests stay behavioral.
 */
export async function capture(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
  if (process.env.PATHCHECK_UI_SCREENSHOTS !== '1') return;
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: opts.fullPage ?? false });
}

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
  await expect(page.getByTestId('record-summary')).toContainText('1 course checked. All found in this catalog.');
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

export interface ContrastFailure { text: string; ratio: number; required: number; fg: string; bg: string }

/**
 * WCAG 2.x text contrast for every visible, enabled element that directly contains text.
 * Background = the element's ancestors' background colors composited from the root down
 * (opacity included). Translucent glass (backdrop-filter) is additionally composited over
 * GLASS_BACKDROP, a conservative stand-in for blurred, text-dense content scrolling beneath.
 * Disabled controls are exempt per WCAG 1.4.3; visually hidden text is skipped.
 * Returns the number of text elements checked and the failures.
 */
export const GLASS_BACKDROP = [200, 204, 210] as const;
export async function textContrast(page: Page): Promise<{ checked: number; glassChecked: number; failures: ContrastFailure[] }> {
  return page.evaluate(glassBackdrop => {
    type RGBA = [number, number, number, number];
    const parse = (c: string): RGBA => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 0];
      const p = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
      return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
    };
    const over = (top: RGBA, under: [number, number, number]): [number, number, number] =>
      [0, 1, 2].map(i => top[i]! * top[3] + under[i]! * (1 - top[3])) as [number, number, number];
    const lum = (rgb: readonly number[]) => {
      const [r, g, b] = rgb.map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: readonly number[], b: readonly number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
    const failures: { text: string; ratio: number; required: number; fg: string; bg: string }[] = [];
    let checked = 0, glassChecked = 0;
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const own = [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent ?? '').join('').trim();
      if (!own) continue;
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (rect.width <= 1 || rect.height <= 1 || cs.visibility === 'hidden' || el.closest('[hidden], [aria-hidden="true"], .visually-hidden, script, style')) continue;
      if (el.closest(':disabled, [aria-disabled="true"]') || el.matches('option')) continue;
      const chain: HTMLElement[] = [];
      for (let a: HTMLElement | null = el; a; a = a.parentElement) chain.unshift(a);
      let opacity = 1, glass = false;
      for (const a of chain) {
        const s = getComputedStyle(a);
        opacity *= Number(s.opacity);
        if ((s.backdropFilter && s.backdropFilter !== 'none') || ((s as unknown as Record<string, string>).webkitBackdropFilter ?? 'none') !== 'none') glass = true;
      }
      const backdrops: [number, number, number][] = [[255, 255, 255]];
      if (glass) { backdrops.push([...glassBackdrop] as [number, number, number]); glassChecked++; }
      const fgColor = parse(cs.color);
      const size = parseFloat(cs.fontSize), weight = Number(cs.fontWeight) || 400;
      const required = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
      for (const start of backdrops) {
        let bg = start;
        for (const a of chain) bg = over(parse(getComputedStyle(a).backgroundColor), bg);
        const fg = over([fgColor[0], fgColor[1], fgColor[2], fgColor[3] * opacity], bg);
        const r = ratio(fg, bg);
        if (r < required) failures.push({ text: own.slice(0, 50), ratio: Math.round(r * 100) / 100, required, fg: `rgb(${fg.map(Math.round).join(',')})`, bg: `rgb(${bg.map(Math.round).join(',')})` });
      }
      checked++;
    }
    return { checked, glassChecked, failures };
  }, GLASS_BACKDROP);
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
