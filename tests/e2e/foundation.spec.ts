import { expect, test } from '@playwright/test';
test('built application boots without external requests or academic claims', async ({ page }) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4173') externalRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'PathCheck' })).toBeVisible();
  await expect(page.getByText('No degree analysis has been performed.', { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
  await expect(page.locator('input[type=file]')).toHaveCount(0);
});
