import { test, expect } from '@playwright/test';
// @ts-expect-error The independent fixture generator is a Node-only ES module.
import { expectedAttempt } from './liveFixture.mjs';

test('LIVE synthetic PDF through real Google, SQL, normalization, acceptance and planning', async ({ page }) => {
  const errors: string[] = [], externalBrowserRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('https://127.0.0.1:5185/')) externalBrowserRequests.push(new URL(request.url()).hostname); });
  await page.goto('/tests/e2e/upload/live.html');
  await expect(page.getByText('Local synthetic acceptance only.', { exact: false })).toBeVisible();
  await page.getByLabel('University and program').selectOption({ index: 1 });
  await page.getByLabel('Target graduation term').selectOption({ label: 'Fall 2027' });
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  const fileInput = page.getByLabel('Transcript PDF (max 10 MiB, 20 pages)');
  await expect(fileInput).toBeDisabled();
  expect((await (await page.request.get('/__live/evidence')).json()).providerAttempts).toHaveLength(0);
  // The browser must not be able to retrieve private server files.
  for (const path of ['/supabase/functions/.env', '/supabase/functions/.env?raw', '/supabase/functions/.env?import',
    '/@fs/private/tmp/pathcheck-upload-tls/key.pem', '/@fs/private/tmp/pathcheck-gemini-benchmark-v1/run.lock']) {
    expect((await page.request.get(path)).status()).toBe(403);
  }
  const denied = await page.request.post('/__live/attestation', { headers: { Origin: 'https://untrusted.invalid', 'sec-fetch-site': 'same-origin' } });
  expect(denied.status()).toBe(403);
  expect((await page.request.post('/__live/attestation', { headers: { Origin: 'https://127.0.0.1:5185', Host: 'untrusted.invalid', 'sec-fetch-site': 'same-origin' } })).status()).toBe(403);
  await page.getByLabel('I consent to sending this PDF to Google Gemini for course extraction.').check();
  const fixture = await page.request.get('/__live/fixture.pdf'); expect(fixture.status()).toBe(200);
  const extracted = page.waitForResponse(response => new URL(response.url()).pathname === '/api/transcript/extract', { timeout: 65000 });
  await fileInput.setInputFiles({ name: 'live-upload-syn101-v1.pdf', mimeType: 'application/pdf', buffer: await fixture.body() });
  await page.getByRole('button', { name: 'Send for extraction' }).click();
  const response = await extracted;
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.ok).toBe(true);
  expect(payload.value.modelId).toBe('gemini-3.5-flash-lite');
  expect(payload.value.rows).toHaveLength(1);
  expect(payload.value.rows[0]).toMatchObject({ ...expectedAttempt, rawInstitution: null });
  await expect(page.getByTestId('extraction-summary')).toContainText('1 proposed row(s) of 1 detected');
  expect(await page.evaluate(() => window.__integration.acceptanceCalls)).toBe(0);
  await page.getByRole('button', { name: 'Show all proposed rows' }).click();
  await expect(page.getByRole('table', { name: 'Proposed rows (raw values, not yet interpreted)' })).toContainText('SYN 101');
  await page.getByRole('button', { name: 'Accept and continue' }).click();
  await expect(page.getByTestId('screen-planner')).toBeVisible();
  const accepted = await page.evaluate(() => window.__integration);
  expect(accepted.acceptanceCalls).toBe(1);
  expect(accepted.scenario?.record.courseAttempts).toHaveLength(1);
  expect(accepted.scenario?.record.courseAttempts[0]?.normalizedCourseId).toBe('SYN-101');
  expect(accepted.analysis?.inputFingerprint).toBe(accepted.fingerprint);
  await page.getByRole('button', { name: /^I already selected courses/ }).click();
  for (const course of ['SYN-201', 'SYN-301']) {
    const form = page.getByTestId('add-course');
    await form.getByLabel('Course', { exact: true }).selectOption(course);
    await form.getByLabel('Term', { exact: true }).selectOption({ label: 'Spring 2027' });
    await form.getByRole('button', { name: 'Add course', exact: true }).click();
  }
  await expect(page.getByTestId('issues')).toContainText(/prerequisite/i);
  const initial = await page.evaluate(() => window.__integration);
  await page.getByTestId('candidate').first().getByRole('button').click();
  const panel = page.getByTestId('preview-panel');
  await expect(panel).toContainText('Fall 2027');
  expect((await page.evaluate(() => window.__integration.scenario?.plan))).toEqual(initial.scenario?.plan);
  for (const box of await panel.getByRole('checkbox').all()) await box.check();
  await panel.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByTestId('notice-status')).toContainText('Change applied');
  const applied = await page.evaluate(() => window.__integration);
  expect(applied.scenario?.plan.activePlacements.find(p => p.courseId === 'SYN-301')?.termId.season).toBe('fall');
  expect(applied.analysis?.inputFingerprint).toBe(applied.fingerprint);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('notice-status')).toContainText('Undone');
  const undone = await page.evaluate(() => window.__integration);
  expect(undone.scenario?.plan.activePlacements).toEqual(initial.scenario?.plan.activePlacements);
  expect(undone.analysis?.inputFingerprint).toBe(undone.fingerprint);
  const evidence = await (await page.request.get('/__live/evidence')).json();
  expect(evidence).toMatchObject({ liveGoogle: true, liveDatabase: true, rpc: { issue: 1, admit: 1, dispatch: 1, finish: 1 } });
  expect(evidence.providerAttempts.length).toBeGreaterThan(0);
  expect(evidence.providerAttempts.length).toBeLessThanOrEqual(3);
  expect(evidence.rpc.retry).toBe(evidence.providerAttempts.length);
  expect(evidence.quotaReservations).toBe(evidence.providerAttempts.length);
  expect(evidence.rpc.revoke).toBe(0);
  expect(evidence.evidenceWriteFailed).toBe(false);
  expect(evidence.providerAttempts.at(-1).status).toBe(200);
  expect(externalBrowserRequests).toEqual([]);
  expect(errors).toEqual([]);
  console.log(`LIVE PASS: 1/1 actual course attempt; real Google HTTP200; ${evidence.providerAttempts.length} provider attempt(s); explicit acceptance and deterministic preview/apply/undo passed.`);
});
