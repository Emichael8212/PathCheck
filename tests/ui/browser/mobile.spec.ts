// U small-screen (375px) layout/interaction tests. REAL UI components + TEST DOUBLES; synthetic data.
// Tagged @mobile so only the mobile-375 project runs them. UX-006: desktop first; these keep
// the existing basic responsive regressions.
import { expect, test } from '@playwright/test';
import { LONG_SYNTHETIC_TITLE } from '../../fixtures/ui/syntheticCatalog';
import { capture, addCourse, addThreeConflicting, boxAtTop, enterCompletedAttempt, expectAccessibleNames, expectNoHorizontalOverflow, expectTouchTargets, open, startGuest, termCard, toPlanner } from './helpers';

test('@mobile every screen fits 375px with long titles and 44px targets', async ({ page }) => {
  await open(page, 'long=1&transcript=approved');
  await page.getByLabel('University and program').selectOption({ index: 1 });
  await page.getByLabel('Target graduation term').selectOption({ label: 'Fall 2028' });
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page);
  await expectAccessibleNames(page);
  await capture(page, 'mobile-375-get-started', { fullPage: true });

  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await expect(page.getByTestId('disclosure')).toBeVisible();
  await enterCompletedAttempt(page);
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page);
  await capture(page, 'mobile-375-record', { fullPage: true });

  await toPlanner(page, 'selected');
  await addThreeConflicting(page);
  await expect(page.getByTestId('placement').filter({ hasText: 'SYN 301' })).toContainText(LONG_SYNTHETIC_TITLE);
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page);
  await expectAccessibleNames(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, 'mobile-375-planner', { fullPage: true });
  await capture(page, 'mobile-375-planner-viewport');

  await page.getByTestId('candidate').first().getByRole('button').click();
  await expect(page.getByTestId('preview-panel')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, 'mobile-375-preview');
});

test('@mobile with three issues the semester list precedes the inspector', async ({ page }) => {
  await open(page);
  await startGuest(page);
  await enterCompletedAttempt(page);
  await toPlanner(page, 'selected');
  await addThreeConflicting(page);
  const timeline = await boxAtTop(page, '#timeline-title');
  const firstCourse = await boxAtTop(page, '[data-testid="placement"] .c-code');
  expect(firstCourse.top, 'first course follows the semester heading').toBeGreaterThan(timeline.top);
  // Contextual panels follow the semester list on narrow screens instead of preceding it.
  const issues = await boxAtTop(page, '[data-testid="issues"]');
  const offerings = await boxAtTop(page, '[data-testid="availability-questions"]');
  expect(issues.top).toBeGreaterThan(firstCourse.top);
  expect(offerings.top).toBeGreaterThan(timeline.top);
});

test('@mobile preview opens as a modal sheet: focus, scroll, Escape and Cancel', async ({ page }) => {
  await open(page);
  await startGuest(page);
  await enterCompletedAttempt(page);
  await toPlanner(page, 'selected');
  await addThreeConflicting(page);
  // Triggered from the course itself, so the same control persists for focus-return checks.
  const card = page.getByTestId('placement').filter({ hasText: 'SYN 301' });
  await card.getByLabel('Edit SYN 301').click();
  await card.getByLabel('Move SYN 301 to').selectOption({ label: 'Fall 2027' });
  const trigger = card.getByRole('button', { name: 'Preview move' });
  await trigger.click();
  const sheet = page.getByTestId('preview-panel');
  await expect(sheet.getByRole('heading', { name: 'Move SYN 301 to Fall 2027' })).toBeFocused();
  expect(await sheet.evaluate(el => el.tagName === 'DIALOG' && el.matches(':modal'))).toBe(true);
  const box = (await sheet.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(box.y + box.height).toBeLessThanOrEqual(812 + 0.5);
  expect(box.height).toBeLessThanOrEqual(812 * 0.85 + 1);
  // Every detail is reachable inside the sheet, with Apply / Cancel pinned in view.
  await expect(sheet.getByTestId('change-table')).toContainText('Fall 2027');
  await expect(sheet.getByTestId('preview-terms')).toHaveText('Affects Spring 2027 and Fall 2027');
  await expect(sheet.getByTestId('impact-resolved')).toContainText('SYN 301, SYN 202 in Spring 2027');
  await expect(sheet.getByTestId('preview-ack')).toHaveCount(1);
  await expect(sheet.getByRole('button', { name: 'Cancel' })).toBeInViewport();
  await expectTouchTargets(page);
  // The page behind is inert: the timeline cannot take focus while the sheet is open.
  expect(await page.evaluate(() => { const el = document.querySelector<HTMLElement>('#timeline-title'); el?.focus(); return document.activeElement === el; })).toBe(false);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('notice-status')).toContainText('Change cancelled. Your plan is unchanged.');
  await expect(trigger).toBeFocused();
  await expect(termCard(page, 'Spring 2027').getByTestId('placement')).toHaveCount(3);

  await trigger.click();
  await page.getByTestId('preview-panel').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('preview-panel')).toHaveCount(0);
  // Tapping Cancel is a click outside the row popover, which closes it; focus goes to its Edit control.
  await expect(card.getByLabel('Edit SYN 301')).toBeFocused();
});

test('@mobile semesters stack vertically and the term strip jumps to a semester', async ({ page }) => {
  await open(page);
  await startGuest(page);
  await enterCompletedAttempt(page);
  await toPlanner(page, 'selected');
  await addCourse(page, /^SYN 201/, 'Spring 2027');
  const boxes = await page.getByTestId('term').evaluateAll(els => els.slice(0, 3).map(e => e.getBoundingClientRect()));
  expect(boxes[1]!.top).toBeGreaterThan(boxes[0]!.bottom - 1);
  expect(Math.round(boxes[0]!.left)).toBe(Math.round(boxes[1]!.left));
  await page.getByRole('navigation', { name: 'Jump to semester' }).getByRole('button', { name: /Fall 2028/ }).click();
  await expect(page.getByRole('heading', { level: 3, name: /Fall 2028/ })).toBeFocused();
  await expectNoHorizontalOverflow(page);
});

test('@mobile account sheet stays inside the viewport', async ({ page }) => {
  await open(page);
  await page.getByTestId('account-summary').click();
  const box = await page.locator('.account-sheet').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await expectNoHorizontalOverflow(page);
});
