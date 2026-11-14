import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { verifyPrivateCode } from './privateOtp';
import { setTimeout as delay } from 'node:timers/promises';

async function enterRecord(page: Page) {
  await page.goto('/');
  const select = page.getByLabel('University and program');
  await select.selectOption({ label: await select.getByRole('option', { name: /Current departmental curriculum/ }).innerText() });
  await page.getByLabel('Target graduation term').selectOption({ label: 'Fall 2027' });
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await page.getByRole('button', { name: 'Add course attempt' }).click();
  const row = page.getByTestId('record-row');
  await row.getByLabel('Course code').fill('CIS 300');
  await row.getByLabel('Term').selectOption({ label: 'Fall 2026' });
  await row.getByLabel('Status').selectOption({ label: 'Completed' });
  await row.getByLabel('Attempted credits').fill('3');
  await row.getByLabel('Earned credits').fill('3');
  await row.getByLabel('Grade (optional)', { exact: true }).fill('B');
  await expect(row).toContainText('In catalog');
  await page.getByRole('button', { name: 'Accept and continue' }).click();
  await page.getByRole('button', { name: /^I already selected courses/ }).click();
  const form = page.getByTestId('add-course');
  await form.getByLabel('Course', { exact: true }).selectOption('CIS-351');
  await form.getByLabel('Term', { exact: true }).selectOption({ label: 'Spring 2027' });
  await form.getByRole('button', { name: 'Add course', exact: true }).click();
}
async function signIn(page: Page, mailbox: string, previousRequest = 0) {
  // Respect the real server's 60-second per-address resend guard. Never disable it.
  await delay(Math.max(0, previousRequest + 61000 - Date.now()));
  const before = await page.request.get('http://127.0.0.1:55434/api/v1/messages');
  const oldIds = new Set(((await before.json()) as { messages: Array<{ ID: string }> }).messages.map(m => m.ID));
  const summary = page.getByTestId('account-summary');
  if (!(await page.locator('details.account-menu').getAttribute('open'))) {
    // open="" is present for an open details element; use its DOM property.
    if (!(await page.locator('details.account-menu').evaluate(e => (e as HTMLDetailsElement).open))) await summary.click();
  }
  await page.getByLabel('Email', { exact: true }).fill(`${mailbox}@pathcheck.test`);
  const requestedAt = Date.now();
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByLabel('One-time code')).toBeVisible();
  let code = '';
  await expect.poll(async () => {
    const list = await page.request.get('http://127.0.0.1:55434/api/v1/messages');
    if (!list.ok()) return false;
    const inbox = await list.json() as { messages: Array<{ ID: string; To: Array<{ Address: string }> }> };
    for (const message of inbox.messages.filter(m => !oldIds.has(m.ID) && m.To.some(to => to.Address === `${mailbox}@pathcheck.test`))) {
      const response = await page.request.get(`http://127.0.0.1:55434/api/v1/message/${message.ID}`);
      if (!response.ok()) continue;
      const item = await response.json() as { Text?: string; HTML?: string };
      const found = `${item.Text ?? ''} ${item.HTML ?? ''}`.match(/(?:code|token)[^\d]{0,150}(\d{6,10})(?!\d)/i);
      if (found) { code = found[1]!; return true; }
    }
    return false;
  }, { message: 'A real local email must contain the OTP expected by the product', timeout: 10000 }).toBe(true);
  // Never log the OTP, email body or authorization headers.
  await verifyPrivateCode(page, code);
  return requestedAt;
}

test('real OTP preserves record, save/reopen and revision conflicts', async ({ page, browser }) => {
  const mailbox = `pc-${randomUUID()}`;
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await enterRecord(page);
  const firstRequest = await signIn(page, mailbox);
  await expect(page.getByText('Nothing has been saved yet', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Save as new', exact: true }).click();
  await expect(page.getByText('Saved as a new plan.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'My saved plans', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Saved plans' }).getByRole('listitem')).toHaveCount(1);
  const second = await browser.newContext({ baseURL: 'http://127.0.0.1:5188' });
  const other = await second.newPage();
  await other.goto('/');
  // Real second-device login, no token injection or mocked auth/storage.
  await signIn(other, mailbox, firstRequest);
  await other.getByRole('button', { name: 'My saved plans', exact: true }).click();
  await other.getByRole('list', { name: 'Saved plans' }).getByRole('button', { name: 'Open', exact: true }).click();
  await expect(other.getByTestId('screen-planner')).toBeVisible();
  await other.getByTestId('account-summary').press('Escape');
  await expect(other.getByTestId('outlook')).toContainText(/insufficient|unknown/i);
  await expect(other.getByTestId('screen-planner')).toContainText('CIS 351');
  await other.getByRole('button', { name: 'Academic record', exact: true }).click();
  const reopened = other.getByTestId('record-row');
  await expect(reopened).toHaveCount(1);
  await reopened.getByRole('button', { name: /^Edit / }).click();
  await expect(reopened.getByLabel('Course code')).toHaveValue('CIS 300');
  await expect(reopened.getByLabel('Grade (optional)', { exact: true })).toHaveValue('B');
  await expect(reopened.getByLabel('Attempted credits')).toHaveValue('3');
  await expect(reopened.getByLabel('Earned credits')).toHaveValue('3');
  await expect(reopened.getByLabel('Status')).toHaveValue('completed');
  await other.getByRole('button', { name: 'Graduation planner', exact: true }).click();
  const remoteForm = other.getByTestId('add-course');
  await remoteForm.getByLabel('Course', { exact: true }).selectOption('CIS-205');
  await remoteForm.getByLabel('Term', { exact: true }).selectOption({ label: 'Spring 2027' });
  await remoteForm.getByRole('button', { name: 'Add course', exact: true }).click();
  if (!(await other.locator('details.account-menu').evaluate(e => (e as HTMLDetailsElement).open))) await other.getByTestId('account-summary').click();
  await other.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(other.getByText('Changes saved.', { exact: false })).toBeVisible();
  const localForm = page.getByTestId('add-course');
  await localForm.getByLabel('Course', { exact: true }).selectOption('CIS-206');
  await localForm.getByLabel('Term', { exact: true }).selectOption({ label: 'Spring 2027' });
  await localForm.getByRole('button', { name: 'Add course', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByTestId('account-summary')).toContainText('Save conflict');
  await expect(page.getByTestId('screen-planner')).toContainText('CIS 206');
  await page.getByRole('button', { name: 'Open the cloud version (discard local changes)' }).click();
  await expect(page.getByText('Opened saved plan.', { exact: false })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Spring 2027', exact: true }).getByRole('listitem').filter({ hasText: 'CIS 205' })).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Spring 2027', exact: true }).getByRole('listitem').filter({ hasText: 'CIS 206' })).toHaveCount(0);
  await second.close();
  expect(errors).toEqual([]);
});
