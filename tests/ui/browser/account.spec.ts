// U account/recovery safety tests (desktop 1280). REAL UI components; account auth/storage
// are TEST DOUBLES, and with `recovery=real` guest recovery is S's actual
// createGuestRecoveryService over this tab's Web Storage. Saves can be held pending
// (`hold=save`) to exercise late completions. Synthetic data only; no real OTP/Supabase.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addCourse, enterCompletedAttempt, open, startGuest, termCard, toPlanner } from './helpers';

const KEY = 'pathcheck.guestDraft.v1';
type Saved = { id: string; revision: number; plan: { planId: string; activePlacements: Array<{ courseId: string }> } };
type Draft = { draftId: string; mode: string; plan: { activePlacements: Array<{ courseId: string }> } };

const slots = (page: Page) => page.evaluate(k => ({ session: sessionStorage.getItem(k), local: localStorage.getItem(k) }), KEY);
const draftIn = async (page: Page, slot: 'session' | 'local'): Promise<Draft | null> => { const raw = (await slots(page))[slot]; return raw ? JSON.parse(raw) as Draft : null; };
const courses = (d: { plan: { activePlacements: Array<{ courseId: string }> } } | null) => (d ? d.plan.activePlacements.map(p => p.courseId).sort() : null);
const savedPlans = (page: Page) => page.evaluate(() => window.__pathcheckHarness!.savedPlans() as unknown[]) as Promise<Saved[]>;
const release = (page: Page) => page.evaluate(() => window.__pathcheckHarness!.release('save'));
const rearm = (page: Page) => page.evaluate(() => window.__pathcheckHarness!.rearm('save'));
const summary = (page: Page) => page.getByTestId('account-summary');
const message = (page: Page) => page.getByTestId('account-panel').locator('.account-message');

/** Guest with one accepted completed attempt, on the planner (selected path). */
async function plannerWithRecord(page: Page, flags: string) {
  await open(page, flags);
  await startGuest(page);
  await enterCompletedAttempt(page);
  await toPlanner(page, 'selected');
}

async function signIn(page: Page, code = '123456', opts: { crossTab?: boolean } = {}) {
  if (await page.locator('.account-menu[open]').count() === 0) await summary(page).click();
  await page.getByLabel('Email').fill('student@example.test');
  if (opts.crossTab) await page.getByLabel(/Also keep a recovery draft/).check();
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await page.getByLabel('One-time code').fill(code);
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByTestId('account-panel')).toContainText('Signed in.');
}

/** A valid cross-tab draft owned by "another tab": same content as ours, different draftId. */
async function plantForeignSharedDraft(page: Page) {
  return page.evaluate(k => {
    const own = JSON.parse(sessionStorage.getItem(k)!) as Record<string, unknown>;
    const foreign = JSON.stringify({ ...own, draftId: 'guest-draft-other-tab', mode: 'cross_tab_opt_in', explicitRecoveryConsent: true });
    localStorage.setItem(k, foreign);
    return foreign;
  }, KEY);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/ui/browser/harness/index.html?account=off');
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
});

test.describe('guest recovery with the real S recovery service', () => {
  test('accepted work survives a same-tab refresh and is restored; storage holds only the structured draft', async ({ page }) => {
    await plannerWithRecord(page, 'recovery=real');
    await addCourse(page, /^SYN 201/, 'Spring 2027');
    const stored = await draftIn(page, 'session');
    expect(stored?.mode).toBe('session');
    expect(courses(stored)).toEqual(['SYN-201']);
    const raw = (await slots(page)).session!;
    expect(raw).not.toMatch(/%PDF-|JVBERi0|accessToken|refresh_token|signedTicket/);
    expect((await slots(page)).local).toBeNull();

    await page.reload();
    await expect(page.getByTestId('recovery-banner')).toBeVisible();
    await page.getByRole('button', { name: 'Restore draft' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Graduation planner' })).toBeVisible();
    await expect(termCard(page, 'Spring 2027').getByTestId('placement')).toContainText('SYN 201');

    // Continuing after restore keeps the same draft identity and records the new edit.
    await addCourse(page, /^SYN 202/, 'Spring 2027');
    const after = await draftIn(page, 'session');
    expect(after?.draftId).toBe(stored?.draftId);
    expect(courses(after)).toEqual(['SYN-201', 'SYN-202']);
  });

  test('a failed OTP keeps the draft; a refresh after it still restores the work', async ({ page }) => {
    await plannerWithRecord(page, 'recovery=real');
    await addCourse(page, /^SYN 201/, 'Spring 2027');
    await summary(page).click();
    await page.getByLabel('Email').fill('student@example.test');
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await page.getByLabel('One-time code').fill('000000');
    await page.getByRole('button', { name: 'Verify code' }).click();
    await expect(message(page)).toContainText('Your guest draft is unchanged');
    expect(courses(await draftIn(page, 'session'))).toEqual(['SYN-201']);
    await page.reload();
    await page.getByRole('button', { name: 'Restore draft' }).click();
    await expect(termCard(page, 'Spring 2027').getByTestId('placement')).toContainText('SYN 201');
  });

  test('cancelling sign-in withdraws only this tab\'s 24-hour shared copy', async ({ page }) => {
    await plannerWithRecord(page, 'recovery=real');
    await summary(page).click();
    await page.getByLabel('Email').fill('student@example.test');
    await page.getByLabel(/Also keep a recovery draft/).check();
    await page.getByRole('button', { name: 'Email me a code' }).click();
    const shared = await draftIn(page, 'local');
    expect(shared?.mode).toBe('cross_tab_opt_in');
    expect((await slots(page)).session).toBeNull();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(message(page)).toContainText('kept in this tab only');
    expect((await slots(page)).local).toBeNull();
    const session = await draftIn(page, 'session');
    expect(session?.mode).toBe('session');
    expect(session?.draftId).toBe(shared?.draftId);
  });

  test('Save as new removes only the exact saved draft; another tab\'s shared draft is preserved', async ({ page }) => {
    await plannerWithRecord(page, 'recovery=real');
    await addCourse(page, /^SYN 201/, 'Spring 2027');
    const foreign = await plantForeignSharedDraft(page);
    await signIn(page);
    await page.getByRole('button', { name: 'Save as new' }).click();
    await expect(summary(page)).toContainText('Saved');
    await expect(message(page)).toHaveText('Saved as a new plan.');
    expect((await slots(page)).session).toBeNull();
    expect((await slots(page)).local).toBe(foreign);
  });

  test('Start over removes this tab\'s own draft only', async ({ page }) => {
    await plannerWithRecord(page, 'recovery=real');
    const foreign = await plantForeignSharedDraft(page);
    expect((await draftIn(page, 'session'))?.mode).toBe('session');
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.getByRole('button', { name: 'Start over' }).click();
    await expect(page.getByTestId('notice-status')).toContainText('Started over');
    await expect.poll(async () => (await slots(page)).session).toBeNull();
    expect((await slots(page)).local).toBe(foreign);
  });
});

test.describe('pending saves never overwrite newer work', () => {
  test('edits made while Save as new is pending stay on screen, unsaved, and in the recovery draft', async ({ page }) => {
    await plannerWithRecord(page, 'recovery=real&hold=save');
    await addCourse(page, /^SYN 201/, 'Spring 2027');
    await signIn(page);
    await page.getByRole('button', { name: 'Save as new' }).click();
    await expect(summary(page)).toContainText('Saving');
    await addCourse(page, /^SYN 202/, 'Spring 2027');
    await release(page);
    await expect(message(page)).toContainText('Your newer changes are not saved');
    await expect(summary(page)).not.toContainText('Saved');
    await expect(termCard(page, 'Spring 2027').getByTestId('placement')).toHaveCount(2);
    const [cloud] = await savedPlans(page);
    expect(courses(cloud!)).toEqual(['SYN-201']);
    // The newer edit is still protected for refresh; the submitted snapshot's draft was superseded, not deleted blind.
    expect(courses(await draftIn(page, 'session'))).toEqual(['SYN-201', 'SYN-202']);
    await expect(message(page)).toContainText('recovery draft on this device was kept');

    await page.getByRole('button', { name: 'Save as new' }).click();
    await expect(summary(page)).toContainText('Saved');
    const all = await savedPlans(page);
    expect(all).toHaveLength(2);
    expect(courses(all[1]!)).toEqual(['SYN-201', 'SYN-202']);
    expect((await slots(page)).session).toBeNull();
  });

  test('edits made while Save changes is pending keep the new CAS revision and are saved next, without a false conflict', async ({ page }) => {
    await plannerWithRecord(page, 'hold=save');
    await signIn(page);
    await page.getByRole('button', { name: 'Save as new' }).click();
    await release(page);
    await expect(summary(page)).toContainText('Saved');
    await addCourse(page, /^SYN 201/, 'Spring 2027');
    await expect(summary(page)).toContainText('Unsaved changes');
    await rearm(page);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await addCourse(page, /^SYN 202/, 'Spring 2027');
    await release(page);
    await expect(message(page)).toContainText('Saved the version from when you pressed Save');
    await expect(summary(page)).toContainText('Unsaved changes');
    expect((await savedPlans(page))[0]!.revision).toBe(1);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(summary(page)).toContainText('Saved');
    const [cloud] = await savedPlans(page);
    expect(cloud!.revision).toBe(2);
    expect(courses(cloud!)).toEqual(['SYN-201', 'SYN-202']);
    await expect(termCard(page, 'Spring 2027').getByTestId('placement')).toHaveCount(2);
  });

  test('a save that finishes after another plan was opened is not applied to it', async ({ page }) => {
    await plannerWithRecord(page, 'hold=save');
    await signIn(page);
    await page.getByRole('button', { name: 'Save as new' }).click();
    await release(page);
    await expect(summary(page)).toContainText('Saved');
    await addCourse(page, /^SYN 201/, 'Spring 2027');
    await rearm(page);
    await page.getByRole('button', { name: 'Save as new' }).click();
    await page.getByRole('button', { name: 'My saved plans' }).click();
    await page.getByRole('list', { name: 'Saved plans' }).getByRole('button', { name: 'Open' }).first().click();
    await expect(message(page)).toContainText('Opened saved plan');
    await expect(termCard(page, 'Spring 2027').getByTestId('placement')).toHaveCount(0);
    await release(page);
    await expect(message(page)).toContainText('not applied here');
    await expect(summary(page)).toContainText('Saved');
    await expect(termCard(page, 'Spring 2027').getByTestId('placement')).toHaveCount(0);
    expect(await savedPlans(page)).toHaveLength(2);
  });

  test('a save pending at sign-out is not applied, and another account never sees it as current', async ({ page }) => {
    await plannerWithRecord(page, 'hold=save');
    await signIn(page);
    await page.getByRole('button', { name: 'Save as new' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('button', { name: /Confirm sign out/ }).click();
    await expect(summary(page)).toContainText('Guest, not saved');
    await expect(page.getByTestId('screen-start')).toBeVisible();
    await signIn(page, '654321');
    await release(page);
    await expect(summary(page)).toContainText('Signed in, not saved');
    await expect(page.getByTestId('screen-start')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save as new' })).toBeDisabled();
    expect(await savedPlans(page)).toHaveLength(0);
  });

  test('a conflict stays visible and nothing is overwritten', async ({ page }) => {
    await plannerWithRecord(page, '');
    await signIn(page);
    await page.getByRole('button', { name: 'Save as new' }).click();
    await expect(summary(page)).toContainText('Saved');
    // Another device advances the cloud revision.
    await page.evaluate(() => { const rows = window.__pathcheckHarness!.savedPlans() as Array<{ revision: number }>; rows[0]!.revision = 5; });
    await addCourse(page, /^SYN 201/, 'Spring 2027');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(summary(page)).toContainText('Save conflict');
    await expect(page.getByRole('alert').filter({ hasText: 'Nothing was overwritten' })).toBeVisible();
    expect(courses((await savedPlans(page))[0]!)).toEqual([]);
    await expect(termCard(page, 'Spring 2027').getByTestId('placement')).toHaveCount(1);
  });
});

test.describe('sign-out and account deletion end the local session in the UI', () => {
  test('server sign-out unconfirmed: S dropped local credentials, so the tab shows a signed-out guest and no account data', async ({ page }) => {
    await plannerWithRecord(page, 'signout=unconfirmed');
    await signIn(page);
    await page.getByRole('button', { name: 'Save as new' }).click();
    await expect(summary(page)).toContainText('Saved');
    await page.getByRole('button', { name: 'My saved plans' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(message(page)).toContainText('server did not confirm ending the session');
    await expect(message(page)).toContainText('no longer shows account data');
    await expect(summary(page)).toContainText('Guest, not saved');
    await expect(page.getByRole('list', { name: 'Saved plans' })).toHaveCount(0);
    await expect(page.getByTestId('screen-start')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
  });

  test('sign-out that leaves the session active is reported, never shown as signed out', async ({ page }) => {
    await plannerWithRecord(page, 'signout=stuck');
    await signIn(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('button', { name: /Confirm sign out/ }).click();
    await expect(message(page)).toContainText('Sign-out failed and you are still signed in');
    await expect(page.getByTestId('account-panel')).toContainText('Signed in.');
    await expect(page.getByRole('heading', { level: 1, name: 'Graduation planner' })).toBeVisible();
  });

  test('account deletion closes the local session', async ({ page }) => {
    await plannerWithRecord(page, '');
    await signIn(page);
    await page.getByRole('button', { name: 'Save as new' }).click();
    await expect(summary(page)).toContainText('Saved');
    await page.getByRole('button', { name: 'Delete account' }).click();
    await page.getByRole('button', { name: /Confirm: delete my account/ }).click();
    await expect(message(page)).toContainText('Account deletion requested. You are signed out.');
    await expect(summary(page)).toContainText('Guest, not saved');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByTestId('screen-start')).toBeVisible();
    expect(await savedPlans(page)).toHaveLength(0);
  });
});

/** Opens or closes the account sheet (it can cover page controls). */
async function menu(page: Page, wantOpen: boolean) {
  const isOpen = (await page.locator('.account-menu[open]').count()) > 0;
  if (isOpen !== wantOpen) await summary(page).click();
}
const releaseNamed = (page: Page, name: string) => page.evaluate(n => window.__pathcheckHarness!.release(n), name);
const savedList = (page: Page) => page.getByRole('list', { name: 'Saved plans' });

/** Signed in with two cloud plans: cloud-1 = [SYN-201], cloud-2 = [SYN-201, SYN-202] (current). */
async function twoSavedPlans(page: Page, flags: string) {
  await plannerWithRecord(page, flags);
  await addCourse(page, /^SYN 201/, 'Spring 2027');
  await signIn(page);
  await page.getByRole('button', { name: 'Save as new' }).click();
  await expect(summary(page)).toContainText('Saved');
  await addCourse(page, /^SYN 202/, 'Spring 2027');
  await page.getByRole('button', { name: 'Save as new' }).click();
  await expect(message(page)).toHaveText('Saved as a new plan.');
  await page.getByRole('button', { name: 'My saved plans' }).click();
  await expect(savedList(page).getByRole('button', { name: 'Open' })).toHaveCount(2);
}

test.describe('explicit Open applies only the latest request to unchanged work', () => {
  test('a slower earlier Open never overwrites a newer one', async ({ page }) => {
    await twoSavedPlans(page, 'hold=open&recovery=real');
    await addCourse(page, /^SYN 301/, 'Fall 2027'); // unsaved change the student chooses to discard
    await savedList(page).getByRole('button', { name: 'Open' }).nth(0).click(); // cloud-1 (slow)
    await savedList(page).getByRole('button', { name: 'Open' }).nth(1).click(); // cloud-2 (newer)
    await releaseNamed(page, 'open:cloud-2');
    await expect(message(page)).toContainText('Opened saved plan');
    await expect(termCard(page, 'Spring 2027').getByTestId('placement')).toHaveCount(2);
    await expect(termCard(page, 'Fall 2027').getByTestId('placement')).toHaveCount(0);
    await releaseNamed(page, 'open:cloud-1');
    await page.waitForTimeout(150);
    await expect(termCard(page, 'Spring 2027').getByTestId('placement')).toHaveCount(2);
    await expect(summary(page)).toContainText('Saved');
  });

  test('edits made while an Open is pending are kept and the late plan is not opened', async ({ page }) => {
    await twoSavedPlans(page, 'hold=open&recovery=real');
    await savedList(page).getByRole('button', { name: 'Open' }).nth(0).click();
    await addCourse(page, /^SYN 301/, 'Fall 2027');
    await releaseNamed(page, 'open:cloud-1');
    await expect(message(page)).toContainText('so it was not opened');
    await expect(termCard(page, 'Spring 2027').getByTestId('placement')).toHaveCount(2);
    await expect(termCard(page, 'Fall 2027').getByTestId('placement')).toContainText('SYN 301');
    await expect(summary(page)).toContainText('Unsaved changes');
  });

  test('Start over while an Open is pending stays started over', async ({ page }) => {
    await twoSavedPlans(page, 'hold=open&recovery=real');
    await savedList(page).getByRole('button', { name: 'Open' }).nth(0).click();
    await menu(page, false);
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.getByRole('button', { name: 'Start over' }).click();
    await expect(page.getByTestId('notice-status')).toContainText('Started over');
    await releaseNamed(page, 'open:cloud-1');
    await menu(page, true);
    await expect(message(page)).toContainText('so it was not opened');
    await expect(page.getByTestId('screen-start')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Graduation planner' })).toBeDisabled();
  });

  test('opening a saved plan resets capacity and summer to the disclosed defaults', async ({ page }) => {
    await twoSavedPlans(page, 'recovery=real');
    await menu(page, false);
    const assumptions = page.getByTestId('assumptions');
    await assumptions.locator('summary').click();
    await page.getByLabel('Maximum credits per term').fill('18');
    await page.getByRole('button', { name: 'Use this load' }).click();
    await page.getByLabel(/Model summer terms/).check();
    await expect(assumptions.locator('summary')).toContainText('18 cr/term (yours), with summer');
    await menu(page, true);
    await savedList(page).getByRole('button', { name: 'Open' }).nth(0).click();
    await expect(message(page)).toContainText('Planning assumptions use the defaults (15 credits per term, no summer terms)');
    await menu(page, false);
    await expect(assumptions.locator('summary')).toContainText('15 cr/term, no summer');
    await assumptions.locator('summary').click();
    await expect(page.getByLabel('Maximum credits per term')).toHaveValue('15');
    await expect(page.getByLabel(/Model summer terms/)).not.toBeChecked();
  });
});

test.describe('cancelling sign-in with the real S auth service', () => {
  const authCalls = (page: Page) => page.evaluate(() => [...window.__pathcheckHarness!.authCalls]);
  const currentUser = (page: Page) => page.evaluate(() => window.__pathcheckHarness!.currentUser());

  async function verifyPending(page: Page) {
    await plannerWithRecord(page, 'auth=real&hold=verify&recovery=real');
    await addCourse(page, /^SYN 201/, 'Spring 2027');
    await summary(page).click();
    await page.getByLabel('Email').fill('student@example.test');
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await page.getByLabel('One-time code').fill('123456');
    await page.getByRole('button', { name: 'Verify code' }).click();
    await expect.poll(() => authCalls(page)).toContain('verify:held');
  }

  test('control: an uncancelled verification signs in', async ({ page }) => {
    await verifyPending(page);
    await releaseNamed(page, 'verify');
    await expect(page.getByTestId('account-panel')).toContainText('Signed in.');
    expect(await currentUser(page)).toEqual({ ok: true, value: { userId: '00000000-0000-4000-8000-00000000000a' } });
  });

  test('cancel during a pending verification: no session, no login shown, guest work and drafts kept', async ({ page }) => {
    await verifyPending(page);
    const foreign = await plantForeignSharedDraft(page);
    const ownBefore = (await slots(page)).session;
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(message(page)).toContainText('Sign-in cancelled. Your guest work is unchanged.');
    await releaseNamed(page, 'verify');
    await expect.poll(() => authCalls(page)).toContain('verify:released');
    // S discarded the superseded tokens and revoked them server-side (best effort).
    await expect.poll(() => authCalls(page)).toContain('logout');
    expect(await currentUser(page)).toEqual({ ok: true, value: null });
    await page.waitForTimeout(150);
    await expect(page.getByTestId('account-panel')).not.toContainText('Signed in.');
    await expect(summary(page)).toContainText('Guest, not saved');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(message(page)).not.toContainText('could not confirm');
    await expect(termCard(page, 'Spring 2027').getByTestId('placement')).toContainText('SYN 201');
    expect((await slots(page)).session).toBe(ownBefore);
    expect((await slots(page)).local).toBe(foreign);
  });
});
