import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function start(page: Page, attempt = { status: 'Completed', grade: 'B', earned: '3' }, target = 'Fall 2027') {
  await page.goto('/tests/e2e/integration/index.html');
  await expect(page.getByTestId('screen-start')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await page.getByLabel('University and program').selectOption({ index: 1 });
  await expect(page.getByTestId('catalog-summary')).toContainText('synthetic');
  await page.getByLabel('Target graduation term').selectOption({ label: target });
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await page.getByRole('button', { name: 'Add course attempt' }).click();
  const row = page.getByTestId('record-row').last();
  await row.getByLabel('Course code').fill('SYN 101');
  await row.getByLabel('Term').selectOption({ label: 'Fall 2026' });
  await row.getByLabel('Status').selectOption({ label: attempt.status });
  await row.getByLabel('Attempted credits').fill('3');
  await row.getByLabel('Earned credits').fill(attempt.earned);
  await row.getByLabel('Grade (optional)', { exact: true }).fill(attempt.grade);
  await expect(page.getByTestId('record-summary')).toContainText('1 course checked');
  expect(await page.evaluate(() => window.__integration.acceptanceCalls)).toBe(0);
  await page.getByRole('button', { name: 'Accept and continue' }).click();
  await expect(page.getByTestId('notice-status')).toContainText('Record accepted');
  await expect(page.getByTestId('screen-planner')).toBeVisible();
  const accepted = await page.evaluate(() => window.__integration.scenario?.record);
  const acceptance = await page.evaluate(() => window.__integration);
  expect(acceptance.acceptanceCalls).toBe(1);
  expect(accepted?.recordRevision).toBe(acceptance.acceptedFromRevision! + 1);
  expect(accepted?.courseAttempts).toHaveLength(1);
  await page.getByRole('button', { name: /I already selected courses/ }).click();
}
async function add(page: Page, code: string, term: string) {
  const form = page.getByTestId('add-course');
  await form.getByLabel('Course', { exact: true }).selectOption(code);
  await form.getByLabel('Term', { exact: true }).selectOption({ label: term });
  await form.getByRole('button', { name: 'Add course', exact: true }).click();
  await expect(page.getByTestId('notice-status')).toContainText('Course added');
}
test('real normalization, prerequisite recommendation, preview, apply and undo', async ({ page }) => {
  await start(page);
  await add(page, 'SYN-201', 'Spring 2027');
  await add(page, 'SYN-301', 'Spring 2027');
  await expect(page.getByTestId('issues')).toContainText(/prerequisite/i);
  const initial = await page.evaluate(() => window.__integration);
  expect(initial.analysis?.topFindings.some(f => f.code === 'prerequisite_unsatisfied')).toBe(true);
  expect(initial.scenario?.record.courseAttempts[0]?.normalizedCourseId).toBe('SYN-101');
  expect(initial.analysis?.inputFingerprint).toBe(initial.fingerprint);
  await page.getByTestId('candidate').first().getByRole('button').click();
  const panel = page.getByTestId('preview-panel');
  await expect(panel).toContainText('Fall 2027');
  expect(await panel.getByRole('checkbox').count()).toBeGreaterThan(0);
  await expect(panel.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  for (const checkbox of await panel.getByRole('checkbox').all()) await checkbox.check();
  await panel.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByTestId('notice-status')).toContainText('Change applied');
  const applied = await page.evaluate(() => window.__integration);
  expect(applied.scenario?.plan.planRevision).toBe(initial.scenario!.plan.planRevision + 1);
  expect(applied.scenario?.plan.activePlacements.find(p => p.courseId === 'SYN-301')?.termId.season).toBe('fall');
  expect(applied.analysis?.topFindings.some(f => f.code === 'prerequisite_unsatisfied')).toBe(false);
  expect(applied.analysis?.inputFingerprint).toBe(applied.fingerprint);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('notice-status')).toContainText('Undone');
  const undone = await page.evaluate(() => window.__integration);
  expect(undone.scenario?.plan.activePlacements).toEqual(initial.scenario?.plan.activePlacements);
  expect(undone.scenario?.plan.planRevision).toBe(applied.scenario!.plan.planRevision + 1);
  await expect(page.getByTestId('issues')).toContainText(/prerequisite/i);
  expect(undone.analysis?.inputFingerprint).toBe(undone.fingerprint);
});

test('generated draft comes from real bounded search and adopts only after acknowledgement', async ({ page }) => {
  await start(page);
  const before = await page.evaluate(() => window.__integration);
  await page.getByRole('button', { name: 'Help me build a plan', exact: true }).click();
  const draft = page.getByTestId('draft-panel');
  await expect(draft).toContainText('2 courses');
  expect(await draft.getByRole('checkbox').count()).toBeGreaterThan(0);
  await expect(draft.getByRole('button', { name: 'Adopt draft', exact: true })).toBeDisabled();
  expect((await page.evaluate(() => window.__integration.scenario?.plan.activePlacements))).toEqual([]);
  for (const checkbox of await draft.getByRole('checkbox').all()) await checkbox.check();
  await draft.getByRole('button', { name: 'Adopt draft', exact: true }).click();
  await expect(page.getByTestId('notice-status')).toContainText('adopted');
  const after = await page.evaluate(() => window.__integration);
  expect(after.scenario?.plan.planRevision).toBe(before.scenario!.plan.planRevision + 1);
  expect(after.scenario?.plan.activePlacements.map(p => [p.courseId, p.termId.season, p.origin])).toEqual([
    ['SYN-201', 'spring', 'adopted_suggestion'], ['SYN-301', 'fall', 'adopted_suggestion'],
  ]);
  expect(after.analysis?.outlook.kind).toBe('conditional_path_found');
  expect(after.analysis?.inputFingerprint).toBe(after.fingerprint);
});

test('student offering report has one owner and invalidates the prior recommendation', async ({ page }) => {
  await start(page);
  await add(page, 'SYN-201', 'Spring 2027');
  await page.getByTestId('candidate').first().getByRole('button').click();
  const before = await page.evaluate(() => window.__integration);
  const course = page.getByTestId('placement').filter({ hasText: 'SYN 201' });
  await course.getByLabel('Edit SYN 201', { exact: true }).click();
  await course.getByRole('button', { name: 'Not listed', exact: true }).click();
  await expect(page.getByTestId('notice-status')).toContainText('unverified');
  const after = await page.evaluate(() => window.__integration);
  expect(after.scenario?.plan.availabilityRevision).toBe(before.scenario!.plan.availabilityRevision + 1);
  expect(after.scenario?.plan.availabilityEvidence).toHaveLength(1);
  expect(after.analysis?.topFindings.some(f => f.code === 'reported_not_listed')).toBe(true);
  expect(after.analysis?.inputFingerprint).toBe(after.fingerprint);
  expect(after.fingerprint).not.toBe(before.fingerprint);
  await expect(page.getByTestId('preview-block')).toContainText(/changed|stale/i);
  await expect(page.getByTestId('preview-panel').getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await course.getByRole('button', { name: 'Listed', exact: true }).click();
  const replaced = await page.evaluate(() => window.__integration);
  expect(replaced.scenario?.plan.availabilityEvidence).toHaveLength(1);
  expect(replaced.scenario?.plan.availabilityEvidence[0]?.report).toBe('listed');
  expect(replaced.scenario?.plan.availabilityRevision).toBe(after.scenario!.plan.availabilityRevision + 1);
});

test('overlooked prerequisite addition can be previewed, rejected, then freshly applied', async ({ page }) => {
  await start(page);
  await add(page, 'SYN-301', 'Fall 2027');
  const before = await page.evaluate(() => window.__integration);
  expect(before.analysis?.topFindings.some(f => f.code === 'prerequisite_unsatisfied')).toBe(true);
  const candidate = page.getByTestId('candidate').filter({ hasText: 'SYN 201' }).first();
  await candidate.getByRole('button').click();
  await page.getByTestId('preview-panel').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(candidate).toHaveCount(0);
  await expect(page.getByTestId('notice-status')).toContainText('Change cancelled');
  const rejected = await page.evaluate(() => window.__integration);
  expect(rejected.scenario?.plan).toEqual(before.scenario?.plan);
  expect(rejected.evaluations).toBe(before.evaluations);
  // Change a real scenario input: the newly generated recommendation is a new preview.
  await page.getByTestId('assumptions').locator('summary').click();
  await page.getByLabel('Maximum credits per term').fill('12');
  await page.getByRole('button', { name: 'Use this load' }).click();
  const refreshed = await page.evaluate(() => window.__integration);
  expect(refreshed.fingerprint).not.toBe(before.fingerprint);
  expect(refreshed.analysis?.candidates.every(c => c.baseFingerprint === refreshed.fingerprint)).toBe(true);
  await candidate.getByRole('button').click();
  const panel = page.getByTestId('preview-panel');
  expect(await panel.getByRole('checkbox').count()).toBeGreaterThan(0);
  await expect(panel.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  for (const checkbox of await panel.getByRole('checkbox').all()) await checkbox.check();
  await panel.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByTestId('notice-status')).toContainText('Change applied');
  const after = await page.evaluate(() => window.__integration);
  expect(after.scenario?.plan.activePlacements.map(p => p.courseId).sort()).toEqual(['SYN-201', 'SYN-301']);
  expect(after.analysis?.topFindings.some(f => f.code === 'prerequisite_unsatisfied')).toBe(false);
  expect(after.analysis?.inputFingerprint).toBe(after.fingerprint);
});

test('capacity changes invalidate an open preview and retain current analysis', async ({ page }) => {
  await start(page);
  await add(page, 'SYN-201', 'Spring 2027');
  await add(page, 'SYN-301', 'Spring 2027');
  await page.getByTestId('candidate').first().getByRole('button').click();
  const before = await page.evaluate(() => window.__integration);
  await page.getByTestId('assumptions').locator('summary').click();
  await page.getByLabel('Maximum credits per term').fill('12');
  await page.getByRole('button', { name: 'Use this load' }).click();
  await expect(page.getByTestId('preview-block')).toContainText(/changed|stale/i);
  await expect(page.getByTestId('preview-panel').getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  const after = await page.evaluate(() => window.__integration);
  expect(after.fingerprint).not.toBe(before.fingerprint);
  expect(after.scenario?.plan.activePlacements).toEqual(before.scenario?.plan.activePlacements);
  expect(after.analysis?.inputFingerprint).toBe(after.fingerprint);
});

for (const attempt of [{ status: 'Withdrawn', grade: 'W', earned: '3' }, { status: 'In progress', grade: '??', earned: '0' }]) test(`uncertain ${attempt.status} record remains unresolved through the actual UI and engine`, async ({ page }) => {
  await start(page, attempt);
  await add(page, 'SYN-201', 'Spring 2027');
  const current = await page.evaluate(() => window.__integration);
  expect(current.scenario?.record.courseAttempts[0]?.confidence).toBe('unresolved');
  expect(current.analysis?.topFindings.some(f => f.code === 'prerequisite_unsatisfied')).toBe(false);
  expect(current.analysis?.evidenceGaps.some(f => f.courseIds.includes('SYN-201') && f.status.status === 'unresolved')).toBe(true);
  expect(current.analysis?.outlook.kind).not.toBe('conditional_path_found');
  await expect(page.getByTestId('outlook')).toContainText(/unknown|insufficient|not enough/i);
});

for (const attempt of [{ status: 'Failed', grade: 'F', earned: '0' }, { status: 'Withdrawn', grade: 'W', earned: '0' }]) test(`completion search preserves unknown repeat credit after ${attempt.status}`, async ({ page }) => {
  await start(page, attempt, 'Fall 2028');
  const current = await page.evaluate(() => window.__integration);
  expect(current.scenario?.plan.activePlacements).toEqual([]);
  expect(current.scenario?.record.courseAttempts[0]?.confidence).not.toBe('unresolved');
  expect(current.analysis?.outlook.kind).toBe('insufficient_evidence');
  expect(JSON.stringify(current.analysis?.evidenceGaps)).toContain('repeat_policy_unresolved');
  expect(current.analysis?.inputFingerprint).toBe(current.fingerprint);
  await expect(page.getByTestId('outlook')).toContainText(/unknown|insufficient|not enough/i);
});


test('incomplete record blocks acceptance, focuses the error and preserves the active record', async ({ page }) => {
  await page.goto('/tests/e2e/integration/index.html');
  await page.getByLabel('University and program').selectOption({ index: 1 });
  await page.getByLabel('Target graduation term').selectOption({ label: 'Fall 2027' });
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await page.getByRole('button', { name: 'Add course attempt' }).click();
  await page.getByLabel('Course code').fill('SYN 101');
  await expect(page.getByTestId('record-summary')).toContainText('needs a status');
  const accept = page.getByRole('button', { name: 'Accept and continue' });
  await expect(accept).toHaveAttribute('aria-disabled', 'true');
  // aria-disabled remains focusable/clickable so the UI can reveal and focus the error.
  await accept.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('notice-alert')).toContainText('need corrections');
  await expect(page.getByLabel('Status', { exact: true })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Academic record', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__integration.acceptanceCalls)).toBe(0);
  await page.getByLabel('Status', { exact: true }).selectOption({ label: 'In progress' });
  await expect(page.getByTestId('record-summary')).toContainText('1 course checked');
  await accept.click();
  await expect(page.getByTestId('notice-status')).toContainText('Record accepted');
  await page.getByRole('button', { name: /I already selected courses/ }).click();
  const accepted = await page.evaluate(() => window.__integration);
  expect(accepted.acceptanceCalls).toBe(1);
  expect(accepted.scenario?.record.recordRevision).toBe(accepted.acceptedFromRevision! + 1);
  expect(accepted.scenario?.record.courseAttempts[0]?.status).toBe('in_progress');
  expect(accepted.analysis?.outlook.kind).not.toBe('conditional_path_found');
  expect(accepted.analysis?.inputFingerprint).toBe(accepted.fingerprint);
});


test('real engine outlook exports a readable conditional PDF without transcript details', async ({ page }) => {
  await start(page);
  await add(page, 'SYN-201', 'Spring 2027');
  const current = await page.evaluate(() => window.__integration);
  expect(current.analysis?.inputFingerprint).toBe(current.fingerprint);
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF', exact: true }).click(),
  ]);
  const bytes = new Uint8Array(await readFile((await download.path())!));
  // The U-owned independent byte inspector is available only in an assembled checkout.
  // Missing implementation fails this integration test rather than skipping it.
  const inspectorPath = '../../ui/pdfInspect.ts';
  const inspector = await import(inspectorPath) as {
    inspectPdf(bytes: Uint8Array): { text: string; visible: string; pageCount: number; pageTexts: string[] };
    libraryPageCount(bytes: Uint8Array): Promise<number>;
  };
  const pdf = inspector.inspectPdf(bytes);
  expect(await inspector.libraryPageCount(bytes)).toBe(pdf.pageCount);
  expect(pdf.text).toContain('SYN 201');
  expect(pdf.text).toContain('Student-selected');
  expect(pdf.text).toContain('Important conditions');
  for (const privateValue of ['Fall 2026', 'Grade:', current.fingerprint!]) expect(pdf.visible).not.toContain(privateValue);
  for (const [i, text] of pdf.pageTexts.entries()) expect(text).toContain(`Page ${i + 1} of ${pdf.pageCount}`);
  expect(await page.evaluate(() => window.__integration.fingerprint)).toBe(current.fingerprint);
});
