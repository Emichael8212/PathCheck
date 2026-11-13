import { expect, test } from '@playwright/test';

test('assembled application loads provisional curriculum without inventing catalog applicability', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('Integration test requires an explicit local baseURL');
  const expectedOrigin = new URL(baseURL).origin;
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (new URL(r.url()).origin !== expectedOrigin) external.push(r.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Plan your path to graduation' })).toBeVisible();
  await page.getByLabel('University and program').selectOption('asu-cis-department-provisional-v1');
  await expect(page.getByTestId('catalog-year')).toContainText(/unresolved|unverified|not established/i);
  await page.getByLabel('Target graduation term').selectOption({ index: 2 });
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await page.getByRole('button', { name: 'Continue to planner' }).click();
  await page.getByRole('button', { name: /I already selected courses/ }).click();
  await expect(page.getByTestId('outlook')).toContainText(/insufficient|unknown|not enough/i);
  await expect(page.getByTestId('analysis-failure')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
