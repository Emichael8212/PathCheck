import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
async function start(page: Page, mode: string, catalogLabel?: RegExp) {
  const reset = await page.request.post(`/__test/reset?mode=${mode}`); expect(reset.status()).toBe(204);
  await page.goto(`/tests/e2e/upload/index.html${catalogLabel ? '?catalog=actual' : ''}`);
  const select = page.getByLabel('University and program');
  if (catalogLabel) {
    const label = await select.getByRole('option', { name: catalogLabel }).innerText();
    await select.selectOption({ label });
  } else await select.selectOption({ index: 1 });
  await page.getByLabel('Target graduation term').selectOption({ label: 'Fall 2027' });
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await expect(page.getByTestId('disclosure')).toBeVisible();
  await expect(page.getByLabel('Transcript PDF (max 10 MiB, 20 pages)')).toBeDisabled();
  expect((await (await page.request.get('/__test/metrics')).json()).providerCalls).toBe(0);
  await page.getByLabel('I consent to sending this PDF to Google Gemini for course extraction.').check();
  const fixture = await page.request.get('/__test/fixture.pdf'); expect(fixture.ok()).toBe(true);
  await page.getByLabel('Transcript PDF (max 10 MiB, 20 pages)').setInputFiles({ name: 'synthetic-upload.pdf', mimeType: 'application/pdf', buffer: await fixture.body() });
  await page.getByRole('button', { name: 'Send for extraction' }).click();
}
test('real upload HTTP and local SQL admission reach deterministic normalization and explicit acceptance (Gemini simulated)', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await start(page, 'success');
  await expect(page.getByTestId('extraction-summary')).toContainText('1 proposed row(s) of 1 detected');
  expect(await page.evaluate(() => window.__integration.acceptanceCalls)).toBe(0);
  await page.getByRole('button', { name: 'Show all proposed rows' }).click();
  await expect(page.getByRole('table', { name: 'Proposed rows (raw values, not yet interpreted)' })).toContainText('SYN 101');
  await page.getByRole('button', { name: 'Accept and continue' }).click();
  await expect(page.getByTestId('screen-planner')).toBeVisible();
  const result = await page.evaluate(() => window.__integration);
  expect(result.acceptanceCalls).toBe(1);
  expect(result.scenario?.record.courseAttempts[0]?.normalizedCourseId).toBe('SYN-101');
  expect(result.analysis?.inputFingerprint).toBe(result.fingerprint);
  expect(await (await page.request.get('/__test/metrics')).json()).toMatchObject({ providerCalls: 1, issue: 1, admit: 1, dispatch: 1, finish: 1, retry: 0, liveDatabase: true, simulatedProvider: true });
  expect(errors).toEqual([]);
});
test('two simulated503s reuse one real admission and require live consent rechecks', async ({ page }) => {
  await start(page, 'retry');
  await expect(page.getByTestId('extraction-summary')).toBeVisible({ timeout: 35000 });
  expect(await (await page.request.get('/__test/metrics')).json()).toMatchObject({ providerCalls: 3, issue: 1, admit: 1, dispatch: 1, retry: 2, finish: 1 });
});
test('bounded temporary failure leaves manual entry usable with no fabricated rows', async ({ page }) => {
  await start(page, 'unavailable');
  await expect(page.getByRole('alert')).toContainText('manually', { timeout: 35000 });
  await expect(page.getByTestId('extraction-summary')).toHaveCount(0);
  expect(await page.evaluate(() => window.__integration.acceptanceCalls)).toBe(0);
  await page.getByRole('button', { name: 'Add course attempt' }).click();
  const row = page.getByTestId('record-row').last();
  await row.getByLabel('Course code').fill('SYN 101');
  await row.getByLabel('Term').selectOption({ label: 'Fall 2026' });
  await row.getByLabel('Status').selectOption({ label: 'Completed' });
  await row.getByLabel('Attempted credits').fill('3'); await row.getByLabel('Earned credits').fill('3');
  await row.getByLabel('Grade (optional)', { exact: true }).fill('B');
  await page.getByRole('button', { name: 'Accept and continue' }).click();
  await expect(page.getByTestId('screen-planner')).toBeVisible();
  expect(await (await page.request.get('/__test/metrics')).json()).toMatchObject({ providerCalls: 3, admit: 1, dispatch: 1, retry: 2, finish: 1 });
});
test('malformed simulated extraction is withheld and never retried', async ({ page }) => {
  await start(page, 'malformed');
  await expect(page.getByRole('alert')).toContainText('manually');
  await expect(page.getByTestId('extraction-summary')).toHaveCount(0);
  expect(await (await page.request.get('/__test/metrics')).json()).toMatchObject({ providerCalls: 1, admit: 1, retry: 0, finish: 1 });
});
test('withdrawal during backoff cancels further egress and preserves the academic record', async ({ page }) => {
  await start(page, 'unavailable');
  await expect.poll(async () => (await (await page.request.get('/__test/metrics')).json()).providerCalls).toBe(1);
  const revoked = page.waitForResponse(response => new URL(response.url()).pathname === '/api/transcript/revoke');
  await page.getByRole('button', { name: 'Stop and withdraw consent' }).click();
  const revokeResponse = await revoked;
  expect(revokeResponse.status()).toBe(200);
  expect(await revokeResponse.json()).toEqual({ ok: true, value: null });
  await expect(page.getByTestId('transcript-status')).toContainText('Nothing from this upload will be used');
  await expect.poll(async () => (await (await page.request.get('/__test/metrics')).json()).revoke).toBe(1);
  // Cross the minimum retry delay to prove that the cancelled transport stays stopped.
  await page.waitForTimeout(8000);
  expect(await (await page.request.get('/__test/metrics')).json()).toMatchObject({ providerCalls: 1, admit: 1, dispatch: 1, retry: 0, finish: 1, revoke: 1 });
  await expect(page.getByTestId('extraction-summary')).toHaveCount(0);
  expect(await page.evaluate(() => window.__integration.acceptanceCalls)).toBe(0);
});

for (const current of [true, false]) {
  test(`fictional CIS300 upload uses ${current ? 'current' : 'historical'} catalog without inventing equivalency (Gemini simulated)`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await start(page, 'cis300', current ? /Current departmental curriculum/ : /Historical 2019–2021 curriculum guide/);
    await expect(page.getByTestId('extraction-summary')).toContainText('1 proposed row(s) of 1 detected');
    expect(await page.evaluate(() => window.__integration.acceptanceCalls)).toBe(0);
    await page.getByRole('button', { name: 'Show all proposed rows' }).click();
    await expect(page.getByRole('table', { name: 'Proposed rows (raw values, not yet interpreted)' })).toContainText('CIS 300');
    await page.getByRole('button', { name: 'Accept and continue' }).click();
    await expect(page.getByTestId('screen-planner')).toBeVisible();
    const result = await page.evaluate(() => window.__integration);
    expect(result.acceptanceCalls).toBe(1);
    expect(result.scenario?.record.courseAttempts).toHaveLength(1);
    expect(result.scenario?.record.courseAttempts[0]?.normalizedCourseId).toBe(current ? 'CIS-300' : null);
    expect(result.scenario?.record.courseAttempts.some(a => a.normalizedCourseId === 'CIS-304')).toBe(false);
    expect(result.scenario?.catalog.catalogRef.catalogYearId).toBeNull();
    expect(result.analysis?.inputFingerprint).toBe(result.fingerprint);
    expect(result.analysis?.outlook.kind).toBe('insufficient_evidence');
    expect(await (await page.request.get('/__test/metrics')).json()).toMatchObject({ providerCalls: 1, issue: 1, admit: 1, dispatch: 1, finish: 1, simulatedProvider: true, liveDatabase: true });
    expect(errors).toEqual([]);
  });
}
