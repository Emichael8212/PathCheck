// U mobile (375px) layout/interaction tests. REAL UI components + TEST DOUBLES; synthetic data.
// Tagged @mobile so only the mobile-375 project runs them.
import { expect, test } from '@playwright/test';
import { LONG_SYNTHETIC_TITLE } from '../../fixtures/ui/syntheticCatalog';
import { SHOTS, addCourse, addThreeConflicting, boxAtTop, enterCompletedAttempt, expectAccessibleNames, expectNoHorizontalOverflow, expectTouchTargets, open, startGuest, termCard, termSummary, toPlanner } from './helpers';

test('@mobile every screen fits 375px with long titles and 44px targets', async ({ page }) => {
  await open(page, 'long=1&transcript=approved');
  await page.getByLabel('University and program').selectOption({ index: 1 });
  await page.getByLabel('Target graduation term').selectOption({ label: 'Fall 2028' });
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page);
  await expectAccessibleNames(page);
  await page.screenshot({ path: `${SHOTS}/mobile-375-get-started.png`, fullPage: true });

  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await page.getByRole('button', { name: 'Check upload availability' }).click();
  await enterCompletedAttempt(page);
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page);
  await page.screenshot({ path: `${SHOTS}/mobile-375-record.png`, fullPage: true });

  await toPlanner(page, 'selected');
  await addThreeConflicting(page);
  await expect(page.getByTestId('placement').filter({ hasText: 'SYN 301' })).toContainText(LONG_SYNTHETIC_TITLE);
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page);
  await expectAccessibleNames(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SHOTS}/mobile-375-planner.png`, fullPage: true });
  await page.screenshot({ path: `${SHOTS}/mobile-375-planner-viewport.png` });

  await page.getByTestId('candidate').first().getByRole('button').click();
  await expect(page.getByTestId('preview-panel')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${SHOTS}/mobile-375-preview.png` });
});

test('@mobile with three issues the timeline and first course appear in the first 812px', async ({ page }) => {
  await open(page);
  await startGuest(page);
  await enterCompletedAttempt(page);
  await toPlanner(page, 'selected');
  await addThreeConflicting(page);
  const vh = page.viewportSize()!.height;
  const timeline = await boxAtTop(page, '#timeline-title');
  const firstCourse = await boxAtTop(page, '[data-testid="placement"] .placement-title');
  expect(timeline.top, 'timeline heading within first viewport').toBeLessThan(vh);
  expect(firstCourse.bottom, 'first course code within first viewport').toBeLessThanOrEqual(vh);
  // Contextual panels follow the timeline on narrow screens instead of preceding it.
  const offerings = await boxAtTop(page, '[data-testid="availability-questions"]');
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
  await card.getByText('Edit', { exact: true }).click();
  await card.getByLabel('Move SYN 301 to').selectOption({ label: 'Fall 2027' });
  const trigger = card.getByRole('button', { name: 'Preview move' });
  await trigger.click();
  const sheet = page.getByTestId('preview-panel');
  await expect(sheet.getByRole('heading', { name: 'Preview change' })).toBeFocused();
  expect(await sheet.evaluate(el => el.tagName === 'DIALOG' && el.matches(':modal'))).toBe(true);
  const box = (await sheet.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(box.y + box.height).toBeLessThanOrEqual(812 + 0.5);
  expect(box.height).toBeLessThanOrEqual(812 * 0.85 + 1);
  // Every detail is reachable inside the sheet, with Apply / Cancel pinned in view.
  await expect(sheet.getByTestId('change-table')).toContainText('Fall 2027');
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
  await expect(trigger).toBeFocused();
});

test('@mobile semesters are a vertical stack of keyboard-operable accordions', async ({ page }) => {
  await open(page);
  await startGuest(page);
  await enterCompletedAttempt(page);
  await toPlanner(page, 'selected');
  await addCourse(page, /^SYN 201/, 'Spring 2027');
  const boxes = await page.getByTestId('term').evaluateAll(els => els.slice(0, 3).map(e => e.getBoundingClientRect()));
  expect(boxes[1]!.top).toBeGreaterThan(boxes[0]!.bottom - 1);
  expect(Math.round(boxes[0]!.left)).toBe(Math.round(boxes[1]!.left));
  const spring = termCard(page, 'Spring 2027');
  await expect(spring).toHaveAttribute('open', '');
  await termSummary(page, 'Spring 2027').focus();
  await page.keyboard.press('Enter');
  await expect(spring).not.toHaveAttribute('open', '');
  await expect(spring.getByTestId('placement')).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(spring.getByTestId('placement')).toBeVisible();
});

test('@mobile account sheet stays inside the viewport', async ({ page }) => {
  await open(page);
  await page.getByTestId('account-summary').click();
  const box = await page.locator('.account-sheet').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await expectNoHorizontalOverflow(page);
});
