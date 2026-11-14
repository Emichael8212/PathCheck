// U tests for cancellable draft generation controls/lifecycle (SCH-18). REAL UI components;
// the generation port is a deferred TEST DOUBLE (tests/fixtures/ui/fakeServices.ts
// deferredGeneration) over the fake engine. They prove controls, abort and stale-result
// handling only — no academic conclusions; L owns the real Worker/watchdog tests.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open, startGuest, toPlanner } from './helpers';

type Call = { n: number; fingerprint: string; aborted: boolean; settled: string | null };
const calls = (page: Page) => page.evaluate(() => window.__pathcheckHarness!.generationCalls.map(c => ({ ...c }))) as Promise<Call[]>;
const release = (page: Page, n: number) => page.evaluate(k => window.__pathcheckHarness!.release(`gen:${k}`), n);
const panel = (page: Page) => page.getByTestId('draft-panel');
const activeRows = (page: Page) => page.locator('[data-testid="placement"]:not([data-origin="system_projection"])');

/** Guest on the planner choosing "Help me build a plan" with the deferred port: job 1 is pending. */
async function generating(page: Page, gen: string) {
  await open(page, `gen=${gen}`);
  await startGuest(page);
  await toPlanner(page, 'generated');
  await expect(panel(page).getByRole('heading', { name: 'Building a draft plan…' })).toBeVisible();
  await expect(panel(page).getByTestId('draft-generating')).toContainText('Your active plan is unchanged');
  await expect.poll(async () => (await calls(page)).length).toBe(1);
}

async function expectInterrupted(page: Page, reason: string | RegExp) {
  await expect(panel(page).getByRole('heading', { name: 'Search interrupted' })).toBeVisible();
  const text = panel(page).getByTestId('draft-interrupted');
  await expect(text).toContainText(reason);
  await expect(text).toContainText('No feasibility conclusion was drawn and your active plan is unchanged');
  await expect(page.getByText('No draft found within search limits')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Draft plan', exact: true })).toHaveCount(0);
}

test.describe('cancellable draft generation', () => {
  test('a completed job shows its draft; nothing is adopted', async ({ page }) => {
    await generating(page, 'deferred');
    await release(page, 1);
    await expect(panel(page).getByRole('heading', { name: 'Draft plan', exact: true })).toBeVisible();
    await expect(panel(page)).toContainText('Not adopted yet');
    await expect(activeRows(page)).toHaveCount(0);
    expect((await calls(page))[0]).toMatchObject({ aborted: false, settled: 'result' });
  });

  test('Cancel search aborts the job and reports an interruption, never "no draft"', async ({ page }) => {
    await generating(page, 'deferred');
    await panel(page).getByRole('button', { name: 'Cancel search' }).click();
    await expectInterrupted(page, 'You cancelled the search.');
    await expect(page.getByTestId('notice-status')).toContainText('Search cancelled');
    expect((await calls(page))[0]).toMatchObject({ aborted: true, settled: 'interrupted' });
    await expect(activeRows(page)).toHaveCount(0);
  });

  test('a cancelled job that still delivers its result later is ignored', async ({ page }) => {
    await generating(page, 'ignoreabort');
    await panel(page).getByRole('button', { name: 'Cancel search' }).click();
    await expectInterrupted(page, 'You cancelled the search.');
    await release(page, 1);
    await expect.poll(async () => (await calls(page))[0]!.settled).toBe('result');
    await expectInterrupted(page, 'You cancelled the search.');
  });

  test('changing inputs stops the job; a superseded result never replaces the newer search', async ({ page }) => {
    await generating(page, 'ignoreabort');
    const first = (await calls(page))[0]!.fingerprint;
    const assumptions = page.getByTestId('assumptions');
    await assumptions.locator('summary').click();
    await page.getByLabel('Maximum credits per term').fill('12');
    await page.getByRole('button', { name: 'Use this load' }).click();
    await expectInterrupted(page, 'Your plan inputs changed while it was running');
    expect((await calls(page))[0]!.aborted).toBe(true);

    await panel(page).getByRole('button', { name: 'Search again' }).click();
    await expect(panel(page).getByRole('heading', { name: 'Building a draft plan…' })).toBeVisible();
    await expect.poll(async () => (await calls(page)).length).toBe(2);
    expect((await calls(page))[1]!.fingerprint).not.toBe(first);
    await release(page, 1); // the stale job answers late
    await expect.poll(async () => (await calls(page))[0]!.settled).toBe('result');
    await expect(panel(page).getByRole('heading', { name: 'Building a draft plan…' })).toBeVisible();
    await release(page, 2);
    await expect(panel(page).getByRole('heading', { name: 'Draft plan', exact: true })).toBeVisible();
    expect((await calls(page))[1]).toMatchObject({ aborted: false, settled: 'result' });
  });

  test('a watchdog interruption from the service is reported as interrupted, not as exhaustion', async ({ page }) => {
    await generating(page, 'watchdog');
    await release(page, 1);
    await expectInterrupted(page, 'The search was stopped before it finished.');
  });

  test('a failed job is reported as a failure with retry, the plan unchanged', async ({ page }) => {
    await generating(page, 'failure');
    await release(page, 1);
    await expect(panel(page).getByRole('heading', { name: 'Draft plan not available' })).toBeVisible();
    await expect(panel(page).getByRole('alert')).toContainText('worker_failed');
    await expect(panel(page).getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(activeRows(page)).toHaveCount(0);
  });

  test('Start over aborts a running job', async ({ page }) => {
    await generating(page, 'ignoreabort');
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.getByRole('button', { name: 'Start over' }).click();
    await expect.poll(async () => (await calls(page))[0]!.aborted).toBe(true);
    await release(page, 1);
    await expect.poll(async () => (await calls(page))[0]!.settled).toBe('result');
    await expect(page.getByTestId('screen-start')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Graduation planner' })).toBeDisabled();
  });

  test('a draft built for other inputs is refused, not shown as current', async ({ page }) => {
    await generating(page, 'mismatch');
    await release(page, 1);
    await expect(panel(page).getByRole('heading', { name: 'Draft plan not available' })).toBeVisible();
    await expect(panel(page).getByRole('alert')).toContainText('draft_fingerprint_mismatch');
    await expect(page.getByRole('heading', { name: 'Draft plan', exact: true })).toHaveCount(0);
  });

  test('a result arriving while the student works elsewhere is announced without moving focus', async ({ page }) => {
    await generating(page, 'deferred');
    await page.getByTestId('assumptions').locator('summary').click();
    const input = page.getByLabel('Maximum credits per term');
    await input.focus();
    await release(page, 1);
    await expect(panel(page).getByRole('heading', { name: 'Draft plan', exact: true })).toBeVisible();
    await expect(page.getByTestId('notice-status')).toContainText('Draft plan ready');
    await expect(input).toBeFocused();
  });

  test('stopping for an input change keeps focus on the control the student used; cancel moves focus to the result', async ({ page }) => {
    await generating(page, 'deferred');
    await page.getByTestId('assumptions').locator('summary').click();
    await page.getByLabel('Maximum credits per term').fill('12');
    const apply = page.getByRole('button', { name: 'Use this load' });
    await apply.click();
    await expectInterrupted(page, 'Your plan inputs changed');
    await expect(page.getByRole('heading', { name: 'Search interrupted' })).not.toBeFocused();
    await expect(page.getByTestId('assumptions').locator(':focus')).toHaveCount(1);
    await panel(page).getByRole('button', { name: 'Search again' }).click();
    await panel(page).getByRole('button', { name: 'Cancel search' }).click();
    await expect(page.getByRole('heading', { name: 'Search interrupted' })).toBeFocused();
  });

  test('opening a saved plan or signing out aborts a running job', async ({ page }) => {
    await generating(page, 'deferred');
    await panel(page).getByRole('button', { name: 'Cancel search' }).click();
    const summary = page.getByTestId('account-summary');
    await summary.click();
    await page.getByLabel('Email').fill('student@example.test');
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await page.getByLabel('One-time code').fill('123456');
    await page.getByRole('button', { name: 'Verify code' }).click();
    await page.getByRole('button', { name: 'Save as new' }).click();
    await expect(summary).toContainText('Saved');
    await summary.click(); // close the sheet
    await panel(page).getByRole('button', { name: 'Search again' }).click();
    await expect.poll(async () => (await calls(page)).length).toBe(2);
    await summary.click();
    await page.getByRole('button', { name: 'My saved plans' }).click();
    await page.getByRole('list', { name: 'Saved plans' }).getByRole('button', { name: 'Open' }).click();
    await expect.poll(async () => (await calls(page))[1]!.aborted).toBe(true);
    await expect(panel(page)).toHaveCount(0);

    await summary.click(); // close the sheet; the opened plan is on the selected-courses path
    await page.getByRole('button', { name: 'Help me build a plan' }).click();
    await expect.poll(async () => (await calls(page)).length).toBe(3);
    await summary.click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect.poll(async () => (await calls(page))[2]!.aborted).toBe(true);
    await expect(page.getByTestId('screen-start')).toBeVisible();
  });

  test('unmounting the workflow aborts a running job', async ({ page }) => {
    await generating(page, 'deferred');
    await page.evaluate(() => window.__pathcheckHarness!.unmount());
    await expect.poll(async () => (await calls(page))[0]).toMatchObject({ aborted: true, settled: 'interrupted' });
  });
});
