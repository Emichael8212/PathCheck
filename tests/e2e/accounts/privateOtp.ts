import { expect, type Page } from '@playwright/test';

/** Never propagate Playwright's fill argument or OTP-bearing page diagnostics. */
export async function verifyPrivateCode(page: Page, code: string) {
  try {
    await page.getByLabel('One-time code').fill(code, { timeout: 5000 });
    await page.getByRole('button', { name: 'Verify code', exact: true }).click();
    await expect(page.getByText('Signed in.', { exact: true })).toBeVisible();
  } catch {
    throw new Error('Local OTP verification failed; sensitive diagnostics suppressed.');
  } finally {
    const input = page.getByLabel('One-time code');
    if (await input.count()) await input.fill('', { timeout: 1000 }).catch(() => {});
  }
}
