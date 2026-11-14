import { test } from '@playwright/test';
import { verifyPrivateCode } from './privateOtp';

test('forced sensitive failure is sanitized', async ({ page }) => {
  // Deliberately absent control, no email/API request. Sentinel is synthetic.
  await page.setContent(process.env.PATHCHECK_OTP_DOM_PROBE === '1'
    ? '<label>One-time code<input></label><button>Verify code</button>'
    : '<h1>Privacy probe</h1>');
  await verifyPrivateCode(page, process.env.PATHCHECK_OTP_TEST_SENTINEL!);
});
