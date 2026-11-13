// U mobile (375px) layout/interaction tests. REAL UI components + TEST DOUBLES; synthetic data.
// Tagged @mobile so only the mobile-375 project runs them.
import { expect, test } from '@playwright/test';
import { LONG_SYNTHETIC_TITLE } from '../../fixtures/ui/syntheticCatalog';
import { SHOTS, addCourse, enterCompletedAttempt, expectAccessibleNames, expectNoHorizontalOverflow, expectTouchTargets, open, startGuest, termCard, termSummary, toPlanner } from './helpers';

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
  await addCourse(page, /^SYN 201/, 'Spring 2027');
  await addCourse(page, /^SYN 301/, 'Spring 2027');
  await expect(page.getByTestId('placement').filter({ hasText: 'SYN 301' })).toContainText(LONG_SYNTHETIC_TITLE);
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page);
  await expectAccessibleNames(page);
  await page.screenshot({ path: `${SHOTS}/mobile-375-planner.png`, fullPage: true });

  await page.getByTestId('candidate').first().getByRole('button').click();
  await expect(page.getByTestId('preview-panel')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByTestId('preview-panel').screenshot({ path: `${SHOTS}/mobile-375-preview.png` });
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
