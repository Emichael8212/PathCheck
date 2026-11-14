import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { inspectPdf, libraryPageCount } from '../../ui/pdfInspect';

test('current and historical ASU curriculum choices have distinct visible labels', async ({ page }) => {
  await page.goto('/');
  const select = page.getByLabel('University and program');
  const current = await select.locator('option[value="asu-cis-department-provisional-v1"]').innerText();
  const historical = await select.locator('option[value="asu-cis-guide-2019-2021-v1"]').innerText();
  expect(current).not.toBe(historical);
  // Select by the label a student sees, not an internal version identifier.
  await select.selectOption({ label: current });
  await expect(select).toHaveValue('asu-cis-department-provisional-v1');
  await expect(page.getByTestId('catalog-year')).toContainText(/unresolved|unverified|not established/i);
  await select.selectOption({ label: historical });
  await expect(select).toHaveValue('asu-cis-guide-2019-2021-v1');
  await expect(page.getByTestId('catalog-year')).toContainText(/unresolved|unverified|not established/i);
  await page.getByLabel('Target graduation term').selectOption({ label: 'Fall 2027' });
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await page.getByRole('button', { name: 'Add course attempt' }).click();
  const row = page.getByTestId('record-row').last();
  await row.getByLabel('Course code').fill('CIS 304');
  await row.getByLabel('Status').selectOption({ label: 'Completed' });
  await expect(row).toContainText('In catalog');
  await row.getByLabel('Course code').fill('CIS 300');
  await expect(row).toContainText('Not in this catalog');
});

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
  await expect(page.getByTestId('upload-unavailable')).toBeVisible();
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await page.getByTestId('account-summary').click();
  await expect(page.getByText('Sign-in and cloud save are unavailable in this build.', { exact: false })).toBeVisible();
  await page.getByTestId('account-summary').press('Escape');
  await page.getByRole('button', { name: 'Continue to planner' }).click();
  await page.getByRole('button', { name: /I already selected courses/ }).click();
  await expect(page.getByTestId('outlook')).toContainText(/insufficient|unknown|not enough/i);
  await expect(page.getByTestId('analysis-failure')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('ordinary application accepts a manual record and exports an uncertainty-preserving plan', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('Application test requires an explicit local baseURL');
  const expectedOrigin = new URL(baseURL).origin;
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (new URL(r.url()).origin !== expectedOrigin) external.push(r.url()); });
  await page.goto('/');
  await page.getByLabel('University and program').selectOption('asu-cis-department-provisional-v1');
  await page.getByLabel('Target graduation term').selectOption({ label: 'Fall 2027' });
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  // Fictional attempt, not a statement about any student's academic record.
  await page.getByRole('button', { name: 'Add course attempt' }).click();
  const row = page.getByTestId('record-row').last();
  await row.getByLabel('Course code').fill('CIS 300');
  await row.getByLabel('Term').selectOption({ label: 'Fall 2026' });
  await row.getByLabel('Status').selectOption({ label: 'Completed' });
  await row.getByLabel('Attempted credits').fill('3');
  await row.getByLabel('Earned credits').fill('3');
  await row.getByLabel('Grade (optional)', { exact: true }).fill('B');
  await expect(page.getByTestId('record-summary')).toContainText('1 course checked');
  await expect(page.getByTestId('record-summary')).toContainText('All found in this catalog.');
  await expect(row).toContainText('In catalog');
  await expect(page.getByTestId('screen-planner')).toHaveCount(0);
  await page.getByRole('button', { name: 'Accept and continue' }).click();
  await expect(page.getByTestId('notice-status')).toContainText('Record accepted');
  await page.getByRole('button', { name: /I already selected courses/ }).click();
  const form = page.getByTestId('add-course');
  await form.getByLabel('Course', { exact: true }).selectOption('CIS-351');
  await form.getByLabel('Term', { exact: true }).selectOption({ label: 'Spring 2027' });
  await form.getByRole('button', { name: 'Add course', exact: true }).click();
  await expect(page.getByTestId('notice-status')).toContainText('Course added');
  await expect(page.getByTestId('outlook')).toContainText(/insufficient|unknown|not enough/i);
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF', exact: true }).click(),
  ]);
  const bytes = new Uint8Array(await readFile((await download.path())!));
  const pdf = inspectPdf(bytes);
  expect(await libraryPageCount(bytes)).toBe(pdf.pageCount);
  expect(pdf.text).toContain('CIS 351');
  expect(pdf.text).toContain('Important conditions');
  expect(pdf.text).toMatch(/unresolved|unverified|unknown|insufficient/i);
  expect(pdf.visible).not.toContain('Fall 2026');
  expect(pdf.visible).not.toContain('Grade:');
  await expect(page.getByTestId('analysis-failure')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
