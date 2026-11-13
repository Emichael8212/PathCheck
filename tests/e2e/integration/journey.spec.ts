import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function start(page: Page, attempt = { status: 'Completed', grade: 'B', earned: '3' }) {
  await page.goto('/tests/e2e/integration/index.html');
  await expect(page.getByTestId('screen-start')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await page.getByLabel('University and program').selectOption({ index: 1 });
  await expect(page.getByTestId('catalog-summary')).toContainText('synthetic');
  await page.getByLabel('Target graduation term').selectOption({ label: 'Fall 2027' });
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await page.getByRole('button', { name: 'Add course attempt' }).click();
  const row = page.getByTestId('record-row').last();
  await row.getByLabel('Course code').fill('SYN 101');
  await row.getByLabel('Term').selectOption({ label: 'Fall 2026' });
  await row.getByLabel('Status').selectOption({ label: attempt.status });
  await row.getByLabel('Attempted credits').fill('3');
  await row.getByLabel('Earned credits').fill(attempt.earned);
  await row.getByLabel('Grade (optional)', { exact: true }).fill(attempt.grade);
  await page.getByRole('button', { name: 'Review record' }).click();
  await expect(page.getByTestId('proposed-record')).toBeVisible();
  await page.getByRole('button', { name: 'Accept this record' }).click();
  await expect(page.getByTestId('notice-status')).toContainText('Record accepted');
  await page.getByRole('button', { name: 'Continue to planner' }).click();
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
  await expect(page.getByTestId('issues')).toContainText('Prerequisite');
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
  await page.screenshot({ path: 'test-results/integration-desktop-planner.png', fullPage: true });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('notice-status')).toContainText('Undone');
  const undone = await page.evaluate(() => window.__integration);
  expect(undone.scenario?.plan.activePlacements).toEqual(initial.scenario?.plan.activePlacements);
  expect(undone.scenario?.plan.planRevision).toBe(applied.scenario!.plan.planRevision + 1);
  await expect(page.getByTestId('issues')).toContainText('Prerequisite');
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
