// U browser interaction tests (desktop 1280). REAL UI components + TEST DOUBLES for E/L/S/G.
// They verify event/state/keyboard/focus behavior and provenance rendering; they make no
// academic-correctness claim and are not the lead's integrated E2E with the real engine.
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { inspectPdf, libraryPageCount } from '../pdfInspect';
import { capture, textContrast, addCourse, addThreeConflicting, boxAtTop, enterCompletedAttempt, expectAccessibleNames, expectNoHorizontalOverflow, expectTouchTargets, fillAttempt, open, startGuest, termCard, toPlanner } from './helpers';

const calls = (page: Page) => page.evaluate(() => [...window.__pathcheckHarness!.transcriptCalls]);

/** Consents, picks a synthetic PDF and sends; optionally waits for the summary. */
async function sendSynthetic(page: Page, waitForSummary = true) {
  await page.getByLabel(/I consent to sending this PDF/).check();
  await page.getByLabel(/Transcript PDF/).setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic test document') });
  await page.getByRole('button', { name: 'Send for extraction' }).click();
  if (waitForSummary) await expect(page.getByTestId('extraction-summary')).toBeVisible();
}

test.describe('shell and keyboard basics', () => {
  test('skip link is the first tab stop and moves focus to main content', async ({ page }) => {
    await open(page);
    // macOS headless Chromium tabs only to form controls (OS keyboard-access setting), so the
    // tab sequence is asserted from DOM order and the link is then operated by keyboard.
    const first = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), select, input, summary, [tabindex]:not([tabindex="-1"])')][0]?.className);
    expect(first).toBe('skip-link');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await skip.focus();
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('three-step navigation reflects reachability and the current step', async ({ page }) => {
    await open(page);
    const nav = page.getByRole('navigation', { name: 'PathCheck steps' });
    await expect(nav.getByRole('button', { name: 'Get started' })).toHaveAttribute('aria-current', 'step');
    await expect(nav.getByRole('button', { name: 'Academic record' })).toBeDisabled();
    await expect(nav.getByRole('button', { name: 'Graduation planner' })).toBeDisabled();
    await startGuest(page);
    await expect(nav.getByRole('button', { name: 'Academic record' })).toHaveAttribute('aria-current', 'step');
    await expect(nav.getByRole('button', { name: 'Graduation planner' })).toBeEnabled();
    await nav.getByRole('button', { name: 'Get started' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Plan your path to graduation' })).toBeFocused();
    await expect(page.getByLabel('University and program')).toBeDisabled();
  });

  test('focus is visible on keyboard focus and no element uses transition: all', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => { const s = getComputedStyle(document.activeElement!); return `${s.outlineStyle} ${s.outlineWidth}`; });
    expect(outline).toMatch(/^solid [1-9]/);
    const all = await page.evaluate(() => [...document.querySelectorAll('*')].filter(el => getComputedStyle(el).transitionProperty.split(',').some(p => p.trim() === 'all') && getComputedStyle(el).transitionDuration !== '0s').length);
    expect(all).toBe(0);
    await expectAccessibleNames(page);
  });

  test('reduced motion collapses transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    const d = await page.getByRole('button', { name: 'Continue as guest' }).evaluate(el => parseFloat(getComputedStyle(el).transitionDuration));
    expect(d).toBeLessThan(0.001);
  });

  test('synthetic catalog stays identified on every screen without exposing the version as primary content', async ({ page }) => {
    await open(page);
    const program = page.getByLabel('University and program');
    await expect(program.locator('option:checked')).toHaveText('Choose a supported program…');
    await program.selectOption({ index: 1 });
    await expect(program.locator('option:checked')).toHaveText('B.S. Computer Information Systems · Test catalog');
    await expect(page.getByTestId('catalog-banner')).toBeVisible();
    await expect(page.getByTestId('catalog-banner')).toHaveText(/Test catalog: synthetic data, not university policy/);
    await expect(page.getByText('syn-ui-v1')).toBeHidden();
    await expect(page.getByTestId('catalog-chip')).toHaveText(/^Test catalog/);
    await page.getByLabel('Target graduation term').selectOption({ label: 'Fall 2028' });
    await page.getByRole('button', { name: 'Continue as guest' }).click();
    await expect(page.getByTestId('catalog-chip')).toBeVisible();
    await toPlanner(page, 'selected');
    await expect(page.getByTestId('catalog-chip')).toBeVisible();
  });

  test('glass falls back to opaque surfaces for reduced transparency, increased contrast and forced colors', async ({ page }) => {
    await open(page);
    const header = page.locator('.app-header');
    expect(await header.evaluate(el => getComputedStyle(el).backdropFilter)).toContain('blur');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
    expect(await header.evaluate(el => [getComputedStyle(el).backdropFilter, getComputedStyle(el).backgroundColor])).toEqual(['none', 'rgb(255, 255, 255)']);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-contrast', value: 'more' }] });
    expect(await header.evaluate(el => getComputedStyle(el).backdropFilter)).toBe('none');
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    await page.emulateMedia({ forcedColors: 'active' });
    expect(await header.evaluate(el => getComputedStyle(el).backdropFilter)).toBe('none');
  });
});

test.describe('academic record screen', () => {
  test('a refused Accept shows inline errors, announces an alert and focuses the first invalid field', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await page.getByRole('button', { name: 'Add course attempt' }).click();
    // A new attempt opens with focus in the catalog search field.
    await expect(page.getByLabel('Course code')).toBeFocused();
    await expect(page.getByTestId('record-summary')).toHaveText('⚠ Complete 1 course to continue: Course 1 needs a course code and a status.');
    const accept = page.getByRole('button', { name: 'Accept and continue' });
    // Blocked, and visibly so: announced as unavailable but still focusable to reveal the fields.
    await expect(accept).toHaveAttribute('aria-disabled', 'true');
    await expect(accept).toHaveAccessibleDescription(/Course 1 needs a course code and a status/);
    await expect.poll(() => accept.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(238, 240, 243)');
    await expect(page.getByTestId('record-row').first()).toContainText('Needs code, status');
    // Playwright refuses to click aria-disabled controls, so use a real pointer click at its position.
    const at = (await accept.boundingBox())!;
    await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
    await expect(page.getByTestId('notice-status')).not.toContainText('Record accepted');
    await expect(page.getByTestId('notice-alert')).toContainText('need corrections');
    const code = page.getByLabel('Course code');
    await expect(code).toHaveAttribute('aria-invalid', 'true');
    await expect(code).toBeFocused();
    const describedBy = await code.getAttribute('aria-describedby');
    await expect(page.locator(`[id="${describedBy}"]`)).toContainText('Enter a course code');
    await expect(page.getByRole('heading', { level: 1, name: 'Academic record' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'PathCheck steps' }).getByRole('button', { name: 'Graduation planner' })).toBeDisabled();
    await capture(page, 'desktop-1280-record-errors', { fullPage: true });
  });

  test('matching runs automatically and one explicit Accept records it and continues', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await fillAttempt(page, 'SYN 101');
    await page.getByTestId('record-row').last().getByRole('button', { name: 'Done' }).click();
    await fillAttempt(page, 'XYZ 210');
    const summary = page.getByTestId('record-summary');
    await expect(summary).toHaveText('2 courses checked. 1 isn’t in this catalog and won’t count until resolved.');
    await expect(page.getByTestId('record-row').first()).toContainText('In catalog');
    await expect(page.getByTestId('record-row').last()).toContainText('Not in this catalog');
    // No separate review or confirmation step exists.
    await expect(page.getByRole('button', { name: 'Review record' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Accept this record' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Accept and continue' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Graduation planner' })).toBeFocused();
    await expect(page.getByTestId('notice-status')).toContainText('Record accepted');
    await page.getByRole('navigation', { name: 'PathCheck steps' }).getByRole('button', { name: 'Academic record' }).click();
    await expect(summary).toHaveText('2 courses in your record. 1 item unresolved and not counted.');
    await expect(page.getByRole('button', { name: 'Continue to planner' })).toBeVisible();
    await expect(page.getByTestId('record-row').last()).toContainText('Not in this catalog');
    await capture(page, 'desktop-1280-record-accepted', { fullPage: true });
  });

  test('course code search is a keyboard-operable combobox and free text stays allowed', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await page.getByRole('button', { name: 'Add course attempt' }).click();
    const code = page.getByRole('combobox', { name: 'Course code' });
    await code.pressSequentially('SYN 2');
    await expect(code).toHaveAttribute('aria-expanded', 'true');
    const list = page.getByRole('listbox', { name: 'Catalog courses' });
    await expect(list.getByRole('option')).toHaveCount(2);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(code).toHaveAttribute('aria-activedescendant', /.+/);
    await page.keyboard.press('Enter');
    await expect(code).toHaveValue('SYN 202');
    await expect(code).toHaveAttribute('aria-expanded', 'false');
    await code.fill('ABC 999');
    await expect(code).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Edit ABC 999' })).toBeFocused();
  });

  test('transcript availability is checked once on open and sends nothing before explicit consent (approved double)', async ({ page }) => {
    await open(page, 'transcript=approved');
    await startGuest(page);
    await expect(page.getByTestId('disclosure')).toContainText('Google Gemini');
    await expect(page.getByRole('button', { name: /Check upload availability/ })).toHaveCount(0);
    const file = page.getByLabel(/Transcript PDF/);
    await expect(file).toBeDisabled();
    expect(await page.evaluate(() => window.__pathcheckHarness!.transcriptCalls)).toEqual(['availability']);
    await page.getByLabel(/I consent to sending this PDF/).check();
    await file.setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic test document') });
    await page.getByRole('button', { name: 'Send for extraction' }).click();
    await expect(page.getByTestId('extraction-summary')).toContainText('2 proposed row(s)');
    expect(await page.evaluate(() => window.__pathcheckHarness!.transcriptCalls)).toEqual(['availability', 'session', 'ticket', 'extract']);
    await expect(page.getByTestId('extraction-included')).toContainText('2 extracted rows');
    await expect(page.getByTestId('record-summary')).toContainText('2 courses checked');
  });

  test('extraction summary is actionable: uncertain-row review is optional and rows enter the record only on Accept', async ({ page }) => {
    await open(page, 'transcript=approved');
    await startGuest(page);
    await sendSynthetic(page);
    const summary = page.getByTestId('extraction-summary');
    await expect(summary.getByTestId('uncertain-count')).toHaveText('1 row needs a look and won’t count until resolved');
    await expect(summary.getByTestId('extraction-next')).toContainText('Nothing is added yet');
    await expect(summary.getByRole('table')).toHaveCount(0);
    const review = summary.getByRole('button', { name: 'Review 1 uncertain row' });
    await expect(review).toHaveAttribute('aria-expanded', 'false');
    await review.click();
    const table = summary.getByRole('table', { name: /Rows that need a look/ });
    await expect(table.getByRole('row')).toHaveCount(2);
    await expect(table).toContainText('ZZZ 999');
    await expect(table).not.toContainText('SYN 101');
    await expect(table).toContainText('No catalog match');
    await summary.getByRole('button', { name: 'Show all proposed rows' }).click();
    await expect(summary.getByRole('table', { name: /Proposed rows/ }).getByRole('row')).toHaveCount(3);
    // Proposals only: the action bar still requires the explicit acceptance step.
    await expect(page.getByRole('button', { name: 'Accept and continue' })).toBeVisible();
    await page.getByRole('button', { name: 'Accept and continue' }).click();
    await expect(page.getByTestId('notice-status')).toContainText('Record accepted');
  });

  test('the summary shows G\'s downgraded validation, not the optimistic raw envelope', async ({ page }) => {
    // Raw extract claims accepted + completeness demonstrated with 1 flagged row; G downgrades to
    // needs_review + unknown and flags both rows.
    await open(page, 'transcript=approved&validate=downgrade');
    await startGuest(page);
    await sendSynthetic(page);
    const summary = page.getByTestId('extraction-summary');
    await expect(summary.getByRole('heading')).toHaveText('Extraction summary — Needs review');
    await expect(summary).toContainText('Completeness not demonstrated');
    await expect(summary).not.toContainText('Completeness demonstrated by row/page checks');
    await expect(summary).not.toContainText('Accepted');
    await expect(summary.getByTestId('uncertain-count')).toHaveText('2 rows need a look and won’t count until resolved');
    await expect(summary).toContainText('Warning: Row count unverified');
    await summary.getByRole('button', { name: 'Review 2 uncertain rows' }).click();
    await expect(summary.getByRole('table', { name: /Rows that need a look/ })).toContainText('Credits unverified');
  });

  for (const late of ['success', 'failure'] as const) {
    test(`a late revoke ${late} for upload A leaves the receipt of upload B untouched`, async ({ page }) => {
      await open(page, `transcript=approved&hold=revoke${late === 'failure' ? '&revokefail=receipt-1' : ''}`);
      await startGuest(page);
      const ids = () => page.evaluate(() => [...window.__pathcheckHarness!.revokedIds]);
      const withdraw = page.getByRole('button', { name: 'Withdraw consent', exact: true });
      // Upload A, then withdraw its consent; the server answer is held.
      await sendSynthetic(page);
      await withdraw.click();
      await expect.poll(() => calls(page)).toContain('revoke:held');
      expect(await ids()).toEqual(['receipt-1']);
      // Upload B while A's revoke is still pending.
      await page.getByTestId('extraction-summary').getByRole('button', { name: 'Discard extraction' }).click();
      await sendSynthetic(page);
      await expect(withdraw).toBeVisible();
      // A's answer arrives late. It must not mark B withdrawn, hide B's control, or swap in receipt A.
      await page.evaluate(() => window.__pathcheckHarness!.release('revoke'));
      await expect.poll(() => calls(page)).toContain('revoke:released');
      await page.waitForTimeout(150);
      await expect(page.getByTestId('consent-withdrawn')).toHaveCount(0);
      await expect(page.getByText('Consent could not be withdrawn')).toHaveCount(0);
      await expect(page.getByTestId('extraction-summary')).toBeVisible();
      await expect(withdraw).toBeVisible();
      // The visible control still withdraws B, and B's own answer does update the UI.
      await withdraw.click();
      await expect(page.getByTestId('consent-withdrawn')).toBeVisible();
      expect(await ids()).toEqual(['receipt-1', 'receipt-2']);
    });
  }

  test('a late revoke for a stopped upload A does not mark the later upload B withdrawn', async ({ page }) => {
    await open(page, 'transcript=approved&hold=extract,revoke');
    await startGuest(page);
    const ids = () => page.evaluate(() => [...window.__pathcheckHarness!.revokedIds]);
    await sendSynthetic(page, false);
    await expect.poll(() => calls(page)).toContain('extract:held');
    await page.getByRole('button', { name: 'Stop and withdraw consent' }).click();
    // A's known receipt is revoked at once, before its held extract is released.
    await expect.poll(() => calls(page)).toContain('revoke:held');
    expect(await calls(page)).not.toContain('extract:released');
    expect(await ids()).toEqual(['receipt-1']);
    // Releasing extract lets A's late rows settle (dropped) and lets B's extract through.
    await page.evaluate(() => window.__pathcheckHarness!.release('extract'));
    await sendSynthetic(page);
    await page.evaluate(() => window.__pathcheckHarness!.release('revoke'));
    await expect.poll(() => calls(page)).toContain('revoke:released');
    await page.waitForTimeout(150);
    await expect(page.getByTestId('consent-withdrawn')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Withdraw consent', exact: true })).toBeVisible();
    expect(await ids()).toEqual(['receipt-1']);
  });

  test('withdrawing consent while extraction is in flight drops late rows and revokes the receipt', async ({ page }) => {
    await open(page, 'transcript=approved&hold=extract');
    await startGuest(page);
    await sendSynthetic(page, false);
    await expect.poll(() => calls(page)).toContain('extract:held');
    await expect(page.getByLabel(/Transcript PDF/)).toBeDisabled();
    await page.getByRole('button', { name: 'Stop and withdraw consent' }).click();
    await expect(page.getByTestId('transcript-status')).toContainText('Nothing from this upload will be used');
    await expect(page.getByLabel(/I consent to sending this PDF/)).not.toBeChecked();
    // The receipt is already known, so withdrawal reaches the server while extract is still held.
    await expect.poll(() => calls(page)).toContain('revoke');
    await expect(page.getByTestId('consent-withdrawn')).toBeVisible();
    expect(await calls(page)).toEqual(['availability', 'session', 'ticket', 'extract', 'extract:held', 'revoke']);
    await page.evaluate(() => window.__pathcheckHarness!.release('extract'));
    await expect.poll(() => calls(page)).toContain('extract:released');
    await page.waitForTimeout(150); // let the late result settle before looking
    await expect(page.getByTestId('extraction-summary')).toHaveCount(0);
    await expect(page.getByTestId('extraction-included')).toHaveCount(0);
    await expect(page.getByTestId('record-summary')).toHaveText('Your record is empty.');
    // Revoked once, never re-sent after the late settle.
    expect(await calls(page)).toEqual(['availability', 'session', 'ticket', 'extract', 'extract:held', 'revoke', 'extract:released']);
    // Manual entry is unaffected.
    await enterCompletedAttempt(page);
  });

  test('unchecking consent while extraction is held revokes before the extract settles', async ({ page }) => {
    await open(page, 'transcript=approved&hold=extract');
    await startGuest(page);
    await sendSynthetic(page, false);
    await expect.poll(() => calls(page)).toContain('extract:held');
    await page.getByLabel(/I consent to sending this PDF/).uncheck();
    await expect.poll(() => calls(page)).toContain('revoke');
    expect(await calls(page)).not.toContain('extract:released');
    await page.evaluate(() => window.__pathcheckHarness!.release('extract'));
    await expect.poll(() => calls(page)).toContain('extract:released');
    await page.waitForTimeout(150);
    expect(await calls(page)).toEqual(['availability', 'session', 'ticket', 'extract', 'extract:held', 'revoke', 'extract:released']);
    await expect(page.getByTestId('extraction-summary')).toHaveCount(0);
    await expect(page.getByTestId('extraction-included')).toHaveCount(0);
    await expect(page.getByTestId('record-summary')).toHaveText('Your record is empty.');
  });

  test('unchecking consent while the ticket is pending stops before extract and revokes the late receipt', async ({ page }) => {
    await open(page, 'transcript=approved&hold=ticket');
    await startGuest(page);
    await sendSynthetic(page, false);
    await expect.poll(() => calls(page)).toContain('ticket:held');
    await page.getByLabel(/I consent to sending this PDF/).uncheck();
    await expect(page.getByRole('button', { name: 'Send for extraction' })).toBeDisabled();
    await page.evaluate(() => window.__pathcheckHarness!.release('ticket'));
    await expect.poll(() => calls(page)).toContain('revoke');
    await page.waitForTimeout(100);
    expect(await calls(page)).toEqual(['availability', 'session', 'ticket', 'ticket:held', 'ticket:released', 'revoke']);
    await expect(page.getByTestId('extraction-summary')).toHaveCount(0);
  });

  test('leaving the record screen mid-extraction never applies the late rows', async ({ page }) => {
    await open(page, 'transcript=approved&hold=extract');
    await startGuest(page);
    await sendSynthetic(page, false);
    await expect.poll(() => calls(page)).toContain('extract:held');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByTestId('screen-start')).toBeVisible();
    // Unmount revokes the known receipt at once, before the held extract settles.
    await expect.poll(() => calls(page)).toContain('revoke');
    expect(await calls(page)).not.toContain('extract:released');
    await page.evaluate(() => window.__pathcheckHarness!.release('extract'));
    await page.waitForTimeout(150); // let the late result settle before looking
    await page.getByRole('navigation', { name: 'PathCheck steps' }).getByRole('button', { name: 'Academic record' }).click();
    await expect(page.getByTestId('screen-record')).toBeVisible();
    await expect(page.getByTestId('extraction-included')).toHaveCount(0);
    await expect(page.getByTestId('extraction-summary')).toHaveCount(0);
    await expect(page.getByTestId('record-summary')).toHaveText('Your record is empty.');
    await expect.poll(() => calls(page)).toContain('revoke');
  });

  test('an unreadable file (arrayBuffer rejects) falls back to manual entry and sends nothing', async ({ page }) => {
    await page.addInitScript(() => { File.prototype.arrayBuffer = () => Promise.reject(new DOMException('synthetic read failure', 'NotReadableError')); });
    await open(page, 'transcript=approved');
    await startGuest(page);
    await sendSynthetic(page, false);
    await expect(page.getByRole('alert').filter({ hasText: 'could not be read' }).first()).toBeVisible();
    await expect(page.getByText('Choose the file again or enter your courses manually.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send for extraction' })).toBeDisabled();
    expect(await calls(page)).toEqual(['availability']);
    await enterCompletedAttempt(page);
  });

  test('a disabled transcript service shows a concise message and no upload control', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await expect(page.getByTestId('upload-unavailable')).toHaveText('Transcript import isn’t available yet. Add courses manually.');
    await expect(page.getByTestId('transcript-panel').locator('input[type="file"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__pathcheckHarness!.transcriptCalls)).toEqual(['availability']);
  });
});

test.describe('selected-courses journey', () => {
  test('issue, keyboard preview naming both semesters, acknowledgement, apply, undo', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'selected');
    await addThreeConflicting(page);
    await expect(page.getByTestId('outlook')).toContainText('Conflicts in your current plan');
    // Unknowns stay visible in the outlook and open the inspector's list.
    await expect(page.getByTestId('outlook-unknowns')).toHaveText(/^\? 3 unknowns affect this result\./);
    await page.getByTestId('outlook-unknowns').getByRole('button', { name: 'Review unknowns' }).click();
    await expect(page.getByTestId('evidence-gaps').locator(':scope > summary')).toBeFocused();
    await expect(page.getByTestId('evidence-gaps').getByTestId('finding')).toHaveCount(3);
    await page.getByTestId('evidence-gaps').locator(':scope > summary').click();
    await expect(page.getByTestId('issues').getByTestId('finding').first()).toContainText('Missing prerequisite');
    await expect(termCard(page, 'Spring 2027').getByTestId('term-load')).toHaveText('9 of 15 credits');
    await expect(page.getByText(/Plan revision/)).toHaveCount(0);

    // The suggested fix sits under the issue it resolves.
    const candidate = page.getByTestId('issues').getByTestId('finding').first().getByTestId('candidate');
    await expect(candidate).toContainText('Move SYN 301 to Fall 2027');
    await expect(candidate).toContainText('Resolves 2 issues. No new conflicts.');
    const previewBtn = candidate.getByRole('button', { name: /Preview: Move SYN 301 to Fall 2027/ });
    await previewBtn.focus();
    await page.keyboard.press('Enter');
    const panel = page.getByTestId('preview-panel');
    await expect(panel.getByRole('heading', { name: 'Move SYN 301 to Fall 2027' })).toBeFocused();
    await expect(panel.getByTestId('preview-terms')).toHaveText('Affects Spring 2027 and Fall 2027');
    const row = panel.getByTestId('change-table').locator('tbody tr').first();
    await expect(row.locator('th')).toContainText('SYN 301');
    await expect(row.locator('td').nth(0)).toHaveText('Spring 2027');
    await expect(row.locator('td').nth(1)).toHaveText('Fall 2027');
    await expect(panel.getByTestId('impact-resolved')).toContainText('Missing prerequisite: SYN 301, SYN 201 in Spring 2027');
    await expect(panel.getByTestId('impact-resolved')).toContainText('Missing prerequisite: SYN 301, SYN 202 in Spring 2027');
    await expect(panel.getByTestId('impact-introduced')).toHaveCount(0);
    await expect(panel.getByTestId('preview-status')).toHaveText('Resolves 2 issues. No new conflicts.Depends on 1 assumption. Confirm below.');
    await expect(panel).toContainText('Your outlook updates after you apply.');
    // Both affected semesters are marked in the plan; the preview never mutates it.
    await expect(termCard(page, 'Spring 2027').getByTestId('preview-leaving')).toHaveText('Moves to Fall 2027 in preview');
    await expect(termCard(page, 'Fall 2027').getByTestId('preview-arrival')).toContainText('Arrives from Spring 2027 in preview');
    await expect(termCard(page, 'Spring 2027').getByTestId('term-load')).toHaveText('9 → 6 of 15 credits');
    await expect(termCard(page, 'Spring 2027').getByTestId('placement')).toHaveCount(3);
    await expect(termCard(page, 'Fall 2027').getByTestId('placement')).toHaveCount(0);
    await capture(page, 'desktop-1280-planner-preview', { fullPage: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture(page, 'desktop-1280-planner-preview-viewport');

    const apply = panel.getByRole('button', { name: 'Apply' });
    await expect(apply).toBeDisabled();
    await panel.getByTestId('preview-ack').focus();
    await page.keyboard.press('Space');
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect(page.getByTestId('notice-status')).toContainText('Change applied');
    await expect(termCard(page, 'Fall 2027').getByTestId('placement')).toContainText('SYN 301');
    await expect(termCard(page, 'Spring 2027').getByTestId('placement')).toHaveCount(2);
    await expect(page.getByTestId('preview-arrival')).toHaveCount(0);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByTestId('notice-status')).toContainText('Undone');
    await expect(termCard(page, 'Spring 2027').getByTestId('placement')).toHaveCount(3);
  });

  test('a later direct edit withdraws the single-use Undo', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'selected');
    await addThreeConflicting(page);
    await page.getByTestId('candidate').first().getByRole('button', { name: /Preview:/ }).click();
    const panel = page.getByTestId('preview-panel');
    await panel.getByTestId('preview-ack').check();
    await panel.getByRole('button', { name: 'Apply' }).click();
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    await expect(undo).toBeVisible();
    // Direct move of another course: L clears its checkpoint, so the UI must not offer Undo.
    const card = termCard(page, 'Spring 2027').getByTestId('placement').first();
    await card.getByLabel(/^Edit /).click();
    await card.getByRole('button', { name: 'Move', exact: true }).click();
    await expect(page.getByTestId('notice-status')).toContainText('Course moved');
    await expect(undo).toHaveCount(0);
  });

  test('Cancel (Escape) dispatches reject, leaves the plan unchanged and returns focus', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'selected');
    await addCourse(page, /^SYN 201/, 'Spring 2027');
    // Preview from the timeline: focus must come back to the same control.
    const card = page.getByTestId('placement').filter({ hasText: 'SYN 201' });
    await card.getByLabel('Edit SYN 201', { exact: true }).click();
    await card.getByLabel('Move SYN 201 to').selectOption({ label: 'Fall 2027' });
    const previewMove = card.getByRole('button', { name: 'Preview move' });
    await previewMove.click();
    await expect(page.getByRole('heading', { name: 'Move SYN 201 to Fall 2027' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('preview-panel')).toHaveCount(0);
    await expect(page.getByTestId('notice-status')).toContainText('Change cancelled. Your plan is unchanged.');
    await expect(previewMove).toBeFocused();
    await expect(termCard(page, 'Spring 2027').getByTestId('placement')).toContainText('SYN 201');
  });

  test('a changed assumption makes an open preview stale and blocks Apply; the inspector stays usable', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'selected');
    await addThreeConflicting(page);
    await page.getByTestId('candidate').first().getByRole('button').click();
    await page.getByTestId('assumptions').locator('summary').click();
    await page.getByLabel('Maximum credits per term').fill('12');
    await page.getByRole('button', { name: 'Use this load' }).click();
    const panel = page.getByTestId('preview-panel');
    await expect(panel.getByRole('alert')).toContainText('can’t be applied');
    await panel.getByTestId('preview-ack').check();
    await expect(panel.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await expect(termCard(page, 'Spring 2027').getByTestId('term-load')).toContainText('of 12 credits');
  });

  test('student-reported availability: one question at a time, labeled unverified and timestamped', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'selected');
    await addCourse(page, /^SYN 201/, 'Spring 2027');
    await addCourse(page, /^SYN 202/, 'Spring 2027');
    const section = page.getByTestId('availability-questions');
    await expect(section.getByTestId('availability-control')).toHaveCount(1);
    await expect(section).toContainText('1 of 2');
    const card = page.getByTestId('placement').filter({ hasText: 'SYN 201' });
    await expect(card.getByTestId('availability-mark')).toHaveText('Not checked');
    await expect(section.getByTestId('availability-control')).toContainText('Is SYN 201 listed for Spring 2027?');
    await section.getByRole('button', { name: 'Listed', exact: true }).click();
    await expect(page.getByTestId('notice-status')).toContainText('student-reported, unverified');
    // Focus moves to the next question; the answered course now shows the student report.
    await expect(page.locator('#avail-q')).toBeFocused();
    await expect(section.getByTestId('availability-control')).toContainText('Is SYN 202 listed for Spring 2027?');
    await expect(card.getByTestId('availability-mark')).toContainText('You reported: Listed');
    await card.getByLabel('Edit SYN 201').click();
    await expect(card.getByTestId('availability-evidence')).toContainText('Student-reported, unverified');
    await expect(card.getByTestId('availability-evidence').locator('time')).toHaveAttribute('datetime', /2026-11-12T/);
    await expect(card.getByRole('button', { name: 'Listed', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('export downloads a real PDF of the active plan', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'selected');
    await addCourse(page, /^SYN 201/, 'Spring 2027');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^pathcheck-plan-\d{4}-\d{2}-\d{2}\.pdf$/);
    const bytes = await readFile((await download.path())!);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // Independent structural check + decompressed text/metadata of the actual downloaded bytes,
    // cross-checked by the pdf-lib parser.
    const pdf = inspectPdf(new Uint8Array(bytes));
    const text = pdf.text.replace(/\s+/g, ' ');
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
    expect(await libraryPageCount(new Uint8Array(bytes))).toBe(pdf.pageCount);
    expect(pdf.info.Producer).toBe('PathCheck');
    expect(text).toContain('SYN 201 Synthetic Systems (3 cr) — Student-selected');
    expect(text).toContain('Important conditions');
    expect(text).toContain('SYNTHETIC TEST DATA');
    expect(text).toContain('1 course attempt entered; 1 matched to the catalog.');
    pdf.pageTexts.forEach((t, i) => expect(t).toContain(`Page ${i + 1} of ${pdf.pageCount}`));
    // Minimum data: the entered attempt's term, any grade and the scenario hash are not exported.
    const visible = pdf.visible.replace(/\s+/g, ' ');
    for (const value of ['Fall 2026', 'Grade:', 'scenario-v1', 'sha256']) expect(visible, value).not.toContain(value);
    expect(bytes.toString('latin1')).not.toContain('scenario-v1:sha256');
    await expect(page.getByTestId('notice-status')).toContainText('PDF exported with your active plan only');
  });

  test('Export PDF is disabled before a path is chosen and when the analysis is stale', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await enterCompletedAttempt(page);
    await page.getByRole('button', { name: 'Accept and continue' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Graduation planner' })).toBeFocused();
    // No planning path yet -> no analysis -> no export control is offered at all.
    await expect(page.getByRole('button', { name: /I already selected courses/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export PDF' })).toHaveCount(0);
    await page.getByRole('button', { name: /I already selected courses/ }).click();
    await expect(page.getByRole('button', { name: 'Export PDF' })).toBeEnabled();

    // An analysis computed for different inputs is refused: no outlook and no export.
    await open(page, 'analysis=stale');
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'selected');
    await expect(page.getByTestId('analysis-failure')).toContainText('(stale_analysis)');
    await expect(page.getByRole('button', { name: 'Export PDF' })).toBeDisabled();
  });

  test('an export failure shows an alert and starts no download', async ({ page }) => {
    await open(page, 'export=fail');
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'selected');
    await addCourse(page, /^SYN 201/, 'Spring 2027');
    let downloads = 0;
    page.on('download', () => { downloads++; });
    await page.getByRole('button', { name: 'Export PDF' }).click();
    await expect(page.getByTestId('notice-alert')).toContainText('The PDF was not created and nothing was downloaded.');
    await expect(page.getByTestId('notice-alert')).toContainText('pdf_render_failed');
    await expect(page.getByTestId('notice-status')).not.toContainText('PDF exported');
    await page.waitForTimeout(300);
    expect(downloads).toBe(0);
    await expect(page.getByRole('button', { name: 'Export PDF' })).toBeEnabled(); // busy state released
  });

  test('a horizon change never leaves Move or Add course pointing at a vanished term', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'selected');
    await page.getByTestId('assumptions').locator('summary').click();
    await page.getByLabel(/Model summer terms/).check();
    await addCourse(page, /^SYN 201/, 'Spring 2027');
    const card = termCard(page, 'Spring 2027').getByTestId('placement').filter({ hasText: 'SYN 201' });
    await card.getByLabel('Edit SYN 201').click();
    const moveTo = card.getByLabel('Move SYN 201 to');
    await moveTo.selectOption({ label: 'Summer 2027' });
    const addTerm = page.getByTestId('add-course').getByLabel('Term');
    await addTerm.selectOption({ label: 'Summer 2027' });
    await page.getByLabel(/Model summer terms/).uncheck();
    // The selects fall back to their first remaining option, and the actions follow what is shown.
    await expect(moveTo).toHaveValue(await moveTo.locator('option').first().getAttribute('value') ?? '');
    await expect(addTerm).toHaveValue(await addTerm.locator('option').first().getAttribute('value') ?? '');
    const shown = (await moveTo.locator('option:checked').textContent())!;
    // The outside click closed the popover; reopen it to act on what it shows.
    await card.getByLabel('Edit SYN 201').click();
    const move = card.getByRole('button', { name: 'Move', exact: true });
    await expect(move).toBeEnabled();
    await move.click();
    await expect(page.getByTestId('notice-status')).toContainText('Course moved');
    await expect(termCard(page, shown).getByTestId('placement')).toContainText('SYN 201');
  });

  test('account menu: Save as new after OTP, Escape closes and restores focus', async ({ page }) => {
    await open(page);
    await startGuest(page);
    const summary = page.getByTestId('account-summary');
    await expect(summary).toContainText('Guest, not saved');
    await summary.click();
    await page.getByLabel('Email').fill('student@example.test');
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await page.getByLabel('One-time code').fill('123456');
    await page.getByRole('button', { name: 'Verify code' }).click();
    await expect(page.getByTestId('account-panel')).toContainText('Nothing has been saved yet');
    expect(await page.evaluate(() => window.__pathcheckHarness!.savedPlanCount())).toBe(0);
    await page.getByRole('button', { name: 'Save as new' }).click();
    await expect(summary).toContainText('Saved');
    expect(await page.evaluate(() => window.__pathcheckHarness!.savedPlanCount())).toBe(1);
    await page.getByRole('button', { name: 'My saved plans' }).focus();
    await page.keyboard.press('Escape');
    await expect(summary).toBeFocused();
    await expect(page.locator('.account-menu')).not.toHaveAttribute('open', '');
  });

  test('a failed recovery-draft removal is reported, never claimed as cleared', async ({ page }) => {
    await open(page, 'clear=fail');
    await startGuest(page);
    const summary = page.getByTestId('account-summary');
    await summary.click();
    await page.getByLabel('Email').fill('student@example.test');
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await page.getByLabel('One-time code').fill('123456');
    await page.getByRole('button', { name: 'Verify code' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    const message = page.getByTestId('account-panel').locator('.account-message');
    await expect(message).toContainText('Signed out. The recovery draft on this device could not be removed');
    await expect(message).not.toContainText('were cleared');
  });
});

test.describe('planner layout, keyboard paths and tradeoff previews (1280x900)', () => {
  test('with three issues and an open preview, the semester list leads and the preview stays in view', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'selected');
    await addThreeConflicting(page);
    await page.getByTestId('candidate').first().getByRole('button', { name: /^Preview:/ }).click();
    await expect(page.getByTestId('preview-panel')).toBeVisible();
    // Opening a preview brings Apply and Cancel into view without extra scrolling.
    await expect(page.getByTestId('preview-panel').getByRole('button', { name: 'Apply' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('preview-panel').getByRole('button', { name: 'Cancel' })).toBeInViewport({ ratio: 1 });
    const viewport = page.viewportSize()!;
    const timelineHead = await boxAtTop(page, '#timeline-title');
    const firstCourse = await boxAtTop(page, '[data-testid="placement"]');
    const preview = await boxAtTop(page, '[data-testid="preview-panel"]');
    expect(timelineHead.top, 'timeline heading within first viewport').toBeLessThan(viewport.height);
    expect(firstCourse.bottom, 'first course row fully within first viewport').toBeLessThanOrEqual(viewport.height);
    // The preview is beside the plan (inspector column, about 30%), not stacked above it.
    expect(preview.left).toBeGreaterThanOrEqual(timelineHead.right);
    expect(firstCourse.right - firstCourse.left, 'course rows use the wide main column').toBeGreaterThan(viewport.width * 0.55);
    // Sticky contextual panel: still on screen after scrolling down the plan.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByTestId('preview-panel').getByRole('button', { name: 'Apply' })).toBeInViewport();
  });

  test('issue rows expand to the sourced rationale by keyboard and locate the course', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'selected');
    await addThreeConflicting(page);
    const row = page.getByTestId('issues').getByTestId('finding').first();
    const why = row.getByTestId('finding-why');
    await expect(why).toBeHidden();
    await row.getByTestId('finding-summary').focus();
    await page.keyboard.press('Enter');
    await expect(why).toBeVisible();
    await expect(why).toContainText('Known conflict.');
    await expect(why).toContainText('Suggested next step: Move after prerequisite.');
    await expect(why).toContainText('Rule status: unsatisfied.');
    await expect(why.getByRole('list', { name: 'Sources' })).toContainText('Synthetic UI fixture; not ASU policy (synthetic, not ASU policy)');
    await row.getByRole('button', { name: 'Show in plan: SYN 301' }).click();
    await expect(page.locator('[data-testid="placement"][data-course="SYN-301"]')).toBeFocused();
    await expectTouchTargets(page, 40);
  });

  test('a row status marker moves focus to its issue; the term strip jumps to a semester', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'selected');
    await addThreeConflicting(page);
    const status = page.getByTestId('placement').filter({ hasText: 'SYN 301' }).getByRole('button', { name: '2 conflicts for SYN 301. Show details' });
    await status.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('issues').getByTestId('finding').first()).toBeFocused();
    const strip = page.getByRole('navigation', { name: 'Jump to semester' });
    await expect(strip.getByRole('button', { name: /Spring 2027/ })).toContainText('has conflicts');
    await strip.getByRole('button', { name: /Fall 2028/ }).click();
    await expect(page.getByRole('heading', { level: 3, name: /Fall 2028/ })).toBeFocused();
    await expect(page.getByRole('heading', { level: 3, name: /Fall 2028/ })).toBeInViewport();
  });

  test('the course Edit popover works from the keyboard: Enter opens, Escape closes and returns focus', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'selected');
    await addCourse(page, /^SYN 201/, 'Spring 2027');
    const card = page.getByTestId('placement').filter({ hasText: 'SYN 201' });
    const edit = card.getByLabel('Edit SYN 201');
    await edit.focus();
    await page.keyboard.press('Enter');
    const move = card.getByLabel('Move SYN 201 to');
    await expect(move).toBeVisible();
    await move.focus();
    await page.keyboard.press('Escape');
    await expect(move).toBeHidden();
    await expect(edit).toBeFocused();
  });

  test('a tradeoff that leaves a known conflict is labeled coherently and cannot be applied', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'selected');
    await addCourse(page, /^SYN 201/, 'Spring 2027');
    await addCourse(page, /^SYN 301/, 'Spring 2027');
    // The double never suggests a hard-invalid state; the student previews the move themselves.
    await expect(page.getByTestId('candidate')).toHaveCount(0);
    const card = page.getByTestId('placement').filter({ hasText: 'SYN 301' });
    await card.getByLabel('Edit SYN 301').click();
    await card.getByLabel('Move SYN 301 to').selectOption({ label: 'Fall 2027' });
    await card.getByRole('button', { name: 'Preview move' }).click();
    const panel = page.getByTestId('preview-panel');
    await expect(panel.getByTestId('preview-status')).toHaveText('Tradeoff: resolves 2, adds 1.Breaks a modeled rule.');
    await expect(panel).not.toContainText('No new conflicts');
    await expect(panel.getByTestId('impact-resolved')).toContainText('SYN 301, SYN 202 in Spring 2027');
    await expect(panel.getByTestId('impact-introduced')).toContainText('SYN 301, SYN 202 in Fall 2027');
    await expect(panel.getByTestId('preview-block')).toContainText('can’t be applied');
    await expect(panel.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await expect(panel.getByTestId('preview-ack')).toHaveCount(0);
    await capture(page, 'desktop-1280-planner-tradeoff', { fullPage: true });
    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('preview-panel')).toHaveCount(0);
    await expect(termCard(page, 'Spring 2027').getByTestId('placement')).toHaveCount(2);
  });

  test('Export PDF is a secondary action; solid blue is reserved for workflow steps', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'selected');
    await addCourse(page, /^SYN 201/, 'Spring 2027');
    const bg = (name: string) => page.getByRole('button', { name, exact: true }).evaluate(el => getComputedStyle(el).backgroundColor);
    expect(await bg('Export PDF')).toBe('rgb(255, 255, 255)');
    expect(await bg('Recheck plan')).toBe('rgb(255, 255, 255)');
    await page.getByTestId('add-course').getByLabel('Course').selectOption({ index: 1 });
    await page.mouse.move(0, 0);
    // Enabling the button runs a 120ms colour transition; wait for the settled value.
    await expect.poll(() => bg('Add course')).toBe('rgb(11, 99, 206)');
  });

  for (const width of [1440, 1280, 1024]) {
    test(`no horizontal overflow and 40px controls at ${width}px with long titles`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, 'long=1');
      await page.getByLabel('University and program').selectOption({ index: 1 });
      await page.getByLabel('Target graduation term').selectOption({ label: 'Fall 2028' });
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page, width < 1024 ? 44 : 40);
      await page.getByRole('button', { name: 'Continue as guest' }).click();
      await enterCompletedAttempt(page);
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page, 40);
      await toPlanner(page, 'selected');
      await addThreeConflicting(page);
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page, 40);
      await expectAccessibleNames(page);
    });
  }
});

test.describe('generated-draft journey', () => {
  test('one unadopted draft is shown as dashed Draft rows, adoption needs acknowledgement and keeps provenance', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await toPlanner(page, 'generated');
    const panel = page.getByTestId('draft-panel');
    await expect(panel.getByRole('heading', { name: 'Draft plan', exact: true })).toBeVisible();
    await expect(page.getByTestId('projected-placement')).toHaveCount(5);
    await expect(page.getByTestId('placement')).toHaveCount(0);
    await expect(page.getByTestId('projected-placement').first()).toContainText('Draft');
    // Repeated non-conflict findings are grouped; each one is retained with its own details.
    const group = page.getByTestId('issues').getByTestId('finding-group');
    await expect(group).toHaveCount(1);
    await expect(group).toContainText('3 required courses not planned');
    await expect(group.getByTestId('finding')).toHaveCount(3);
    // Unplaced-course issues offer no "Show in plan" control that would do nothing.
    await expect(page.getByTestId('issues').getByRole('button', { name: /^Show in plan/ })).toHaveCount(0);
    await capture(page, 'desktop-1280-planner-draft', { fullPage: true });
    const adopt = panel.getByRole('button', { name: 'Adopt draft' });
    await expect(adopt).toBeDisabled();
    for (const box of await panel.getByTestId('draft-ack').all()) await box.check();
    await adopt.click();
    await expect(page.getByTestId('notice-status')).toContainText('Draft adopted');
    await expect(page.getByTestId('projected-placement')).toHaveCount(0);
    await expect(page.locator('[data-testid="placement"][data-origin="adopted_suggestion"]')).toHaveCount(5);
    await expect(page.getByTestId('placement').first()).toContainText('Suggested');
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  });

  test('bounded-search exhaustion is not described as impossibility', async ({ page }) => {
    await open(page, 'draft=none');
    await startGuest(page);
    await toPlanner(page, 'generated');
    const panel = page.getByTestId('draft-panel');
    await expect(panel.getByRole('heading', { name: 'No draft found within search limits' })).toBeVisible();
    await expect(panel).toContainText('does not mean no university-approved path exists');
  });

  test('an interrupted search reports no feasibility conclusion', async ({ page }) => {
    await open(page, 'draft=interrupted');
    await startGuest(page);
    await toPlanner(page, 'generated');
    await expect(page.getByTestId('draft-panel').getByRole('alert')).toContainText('No feasibility conclusion was drawn');
  });
});

test.describe('text contrast (WCAG 1.4.3, computed from rendered styles)', () => {
  const expectContrast = async (page: Page, state: string) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    // Steady state: fades (e.g. the 160ms capsule fade-in) are not judged mid-transition.
    await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'));
    const { checked, glassChecked, failures } = await textContrast(page);
    expect(checked, `${state}: text elements checked`).toBeGreaterThan(5);
    expect(glassChecked, `${state}: glass (toolbar/capsule) text also judged over a busy backdrop`).toBeGreaterThan(0);
    expect(failures, `${state}: contrast failures`).toEqual([]);
  };

  test('the checker detects a low-contrast element (self-test)', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { const p = document.createElement('p'); p.textContent = 'low contrast probe'; p.style.color = '#BBBBBB'; document.querySelector('main')!.append(p); });
    const { failures } = await textContrast(page);
    expect(failures.map(f => f.text)).toContain('low contrast probe');
  });

  test('every screen and planner state meets 4.5:1 (3:1 large text)', async ({ page }) => {
    await open(page);
    await page.getByLabel('University and program').selectOption({ index: 1 });
    await expectContrast(page, 'get started');
    await page.getByLabel('Target graduation term').selectOption({ label: 'Fall 2028' });
    await page.getByRole('button', { name: 'Continue as guest' }).click();
    await page.getByRole('button', { name: 'Add course attempt' }).click();
    const accept = page.getByRole('button', { name: 'Accept and continue' });
    const at = (await accept.boundingBox())!;
    await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2); // aria-disabled: real pointer click
    await expect(page.getByTestId('notice-alert')).toContainText('need corrections');
    await expectContrast(page, 'record with errors');
    await open(page);
    await startGuest(page);
    await enterCompletedAttempt(page);
    await expectContrast(page, 'record matched');
    await toPlanner(page, 'selected');
    await addThreeConflicting(page);
    await expectContrast(page, 'planner with issues');
    await page.getByTestId('candidate').first().getByRole('button', { name: /Preview:/ }).click();
    await expectContrast(page, 'preview open');
    const panel = page.getByTestId('preview-panel');
    await panel.getByTestId('preview-ack').check();
    await panel.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
    await expectContrast(page, 'applied with Undo capsule');
  });

  test('stale preview, draft and export-failure states meet contrast', async ({ page }) => {
    await open(page, 'export=fail');
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'selected');
    await addThreeConflicting(page);
    await page.getByTestId('candidate').first().getByRole('button', { name: /Preview:/ }).click();
    await page.getByTestId('assumptions').locator('summary').click();
    await page.getByLabel('Maximum credits per term').fill('12');
    await page.getByRole('button', { name: 'Use this load' }).click();
    await expect(page.getByTestId('preview-panel').getByRole('alert')).toContainText('can’t be applied');
    await expectContrast(page, 'stale preview');
    await page.getByRole('button', { name: 'Export PDF' }).click();
    await expect(page.getByTestId('notice-alert')).toContainText('nothing was downloaded');
    await expectContrast(page, 'export failure');
    await open(page);
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'generated');
    await expect(page.getByTestId('draft-panel')).toBeVisible();
    await expectContrast(page, 'unadopted draft');
  });
});

// Long-title walk through all three screens; captures only with PATHCHECK_UI_SCREENSHOTS=1.
test('desktop walk of each screen with long titles (optional screenshots)', async ({ page }) => {
  await open(page, 'long=1');
  await page.getByLabel('University and program').selectOption({ index: 1 });
  await page.getByLabel('Target graduation term').selectOption({ label: 'Fall 2028' });
  await capture(page, 'desktop-1280-get-started', { fullPage: true });
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await enterCompletedAttempt(page);
  await capture(page, 'desktop-1280-record', { fullPage: true });
  await toPlanner(page, 'selected');
  await addThreeConflicting(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, 'desktop-1280-planner', { fullPage: true });
  await capture(page, 'desktop-1280-planner-viewport');
  await expectNoHorizontalOverflow(page);
});

test.describe('refinements: empty states, grouping, grade uncertainty', () => {
  test('an empty planner offers two clear starts and keeps the engine outlook and warnings', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await toPlanner(page, 'selected');
    const empty = page.getByTestId('empty-plan');
    await expect(empty.getByRole('heading', { name: 'No courses planned yet' })).toBeVisible();
    await expect(page.getByTestId('timeline')).toHaveCount(0);
    // The engine outlook and its warnings stay visible above and beside the empty state.
    await expect(page.getByTestId('outlook')).toBeVisible();
    await expect(page.getByTestId('outlook-unknowns').or(page.getByTestId('outlook'))).toBeVisible();
    const issues = page.getByTestId('issues');
    await expect(issues.getByTestId('finding-group')).toContainText('3 required courses not planned');
    await expect(issues.getByTestId('finding-group')).toContainText('SYN 101 · SYN 102 · SYN 201');
    await issues.getByTestId('group-summary').click();
    const each = issues.getByTestId('finding-group').getByTestId('finding');
    await expect(each).toHaveCount(3);
    await expect(each.first()).toHaveAttribute('data-tone', 'potential');
    await each.first().getByTestId('finding-summary').click();
    await expect(each.first().getByRole('list', { name: 'Sources' })).toContainText('Synthetic UI fixture');
    await capture(page, 'desktop-1280-planner-empty', { fullPage: true });
    await empty.getByRole('button', { name: 'Add a course' }).click();
    await expect(page.getByTestId('add-course').getByLabel('Course')).toBeFocused();
    await expect(page.getByRole('button', { name: 'Help me build a plan', exact: true })).toHaveCount(1);
    await empty.getByRole('button', { name: 'Help me build a plan' }).click();
    await expect(page.getByTestId('draft-panel')).toBeVisible();
    await expect(page.getByTestId('empty-plan')).toHaveCount(0);
    await expect(page.getByTestId('projected-placement')).toHaveCount(5);
  });

  test('known conflicts are never grouped', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'selected');
    await addThreeConflicting(page);
    await expect(page.getByTestId('issues').getByTestId('finding-group')).toHaveCount(0);
    await expect(page.getByTestId('issues').locator('[data-testid="finding"][data-tone="conflict"]')).toHaveCount(2);
  });

  test('the empty record has one clear action, and "In catalog" is never presented as a grade or requirement', async ({ page }) => {
    await open(page);
    await startGuest(page);
    const empty = page.getByTestId('record-empty');
    await expect(empty.getByRole('heading', { name: 'No courses entered' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add course attempt' })).toHaveCount(1);
    expect(await page.getByRole('button', { name: 'Continue to planner' }).evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
    await expect(page.getByTestId('record-summary')).toHaveText('Your record is empty.');
    await expect(page.getByTestId('upload-unavailable')).toHaveText('Transcript import isn’t available yet. Add courses manually.');
    await empty.getByRole('button', { name: 'Add course attempt' }).click();
    await expect(page.getByLabel('Course code')).toBeFocused();
    const row = page.getByTestId('record-row').first();
    await row.getByLabel('Course code').fill('SYN 102');
    await row.getByLabel('Status').selectOption({ label: 'Completed' });
    await expect(row).toContainText('In catalog');
    await expect(page.getByRole('button', { name: 'Add course attempt' })).toHaveCount(1);
    await expect(page.getByTestId('manual-entry')).not.toContainText('Matched');
    await expect(page.locator('.record-note')).toHaveText(/doesn’t confirm a passing grade, credit or degree requirement/);
  });

  test('an unreadable grade reported by normalization is flagged on the row and in the summary', async ({ page }) => {
    await open(page);
    await startGuest(page);
    const row = await fillAttempt(page, 'SYN 101');
    await row.getByLabel('Grade (optional)').fill('ZZ');
    await expect(page.getByTestId('record-summary')).toHaveText('1 course checked. All found in this catalog. 1 grade needs a look.');
    await expect(row.locator('.grade-warn')).toContainText('ZZ');
    await expect(row.locator('.grade-warn')).toContainText('Grade not recognized, so it isn’t used.');
    await expect(row.getByRole('list', { name: 'Notes from matching' })).toContainText('Grade not recognized');
    await row.getByLabel('Grade (optional)').fill('B');
    await expect(page.getByTestId('record-summary')).toHaveText('1 course checked. All found in this catalog.');
    await expect(row.locator('.grade-warn')).toHaveCount(0);
  });
});

test.describe('Liquid Glass during real scrolling and interaction', () => {
  test('toolbar, capsule, popover and preview stay usable while the planner scrolls', async ({ page }) => {
    await open(page, 'long=1');
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'selected');
    await addThreeConflicting(page);
    await addCourse(page, /^SYN 102/, 'Fall 2028');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // Sticky glass toolbar over scrolled content, still blurred and on top.
    const header = page.locator('.app-header');
    expect((await header.boundingBox())!.y).toBe(0);
    expect(await header.evaluate(el => getComputedStyle(el).backdropFilter)).toContain('blur');
    expect(await page.evaluate(() => document.elementFromPoint(window.innerWidth / 2, 20)?.closest('.app-header') !== null)).toBe(true);
    // Floating capsule stays in the viewport, above content.
    await expect(page.getByTestId('notice-status')).toBeInViewport();
    // The popover of the last course opens upward when there is no room below, fully visible.
    const last = page.getByTestId('placement').last();
    const edit = last.getByLabel(/^Edit /);
    await edit.evaluate(el => { const r = el.getBoundingClientRect(); window.scrollBy(0, r.bottom - window.innerHeight + 110); });
    await edit.click();
    await expect(last.locator('.row-menu')).toHaveClass(/opens-up/);
    await expect(last.locator('.row-menu-panel')).toBeInViewport({ ratio: 1 });
    // While a popover is open, the capsule steps aside (no glass on glass).
    expect(await page.locator('.capsule').evaluate(el => getComputedStyle(el).visibility)).toBe('hidden');
    await page.keyboard.press('Escape');
    await expect(edit).toBeFocused();
    // Preview: brought into view, stays visible while the plan scrolls.
    await page.getByTestId('candidate').first().getByRole('button').click();
    await expect(page.getByTestId('preview-panel').getByRole('button', { name: 'Apply' })).toBeInViewport({ ratio: 1 });
    await page.mouse.move(400, 500);
    await page.mouse.wheel(0, 2000);
    await expect(page.getByTestId('preview-panel').getByRole('button', { name: 'Cancel' })).toBeInViewport({ ratio: 1 });
  });

  test('keyboard focus is never hidden under the sticky toolbar or the floating capsule', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await enterCompletedAttempt(page);
    await toPlanner(page, 'selected');
    await addThreeConflicting(page);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom)).toBe('96px');
    const edit = page.getByTestId('placement').filter({ hasText: 'SYN 301' }).getByLabel('Edit SYN 301');
    // Park the control under the capsule, then move focus to it: it must scroll clear.
    await edit.evaluate(el => { const r = el.getBoundingClientRect(); window.scrollBy(0, r.bottom - window.innerHeight + 20); });
    await edit.evaluate(el => (el as HTMLElement).focus());
    const box = await edit.evaluate(el => el.getBoundingClientRect().bottom);
    expect(box, 'focused control clears the capsule').toBeLessThanOrEqual(page.viewportSize()!.height - 80);
  });

  test('the record action bar stays in view over a long list and glass never covers the course list surface', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await open(page);
    await startGuest(page);
    for (const code of ['SYN 101', 'SYN 102', 'SYN 201', 'SYN 202', 'SYN 301', 'SYN 310']) {
      await fillAttempt(page, code);
      await page.getByTestId('record-row').last().getByRole('button', { name: 'Done' }).click();
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByRole('region', { name: 'Record status' })).toBeInViewport({ ratio: 1 });
    expect(await page.getByTestId('manual-entry').evaluate(el => [getComputedStyle(el).backdropFilter, getComputedStyle(el).backgroundColor])).toEqual(['none', 'rgb(255, 255, 255)']);
    expect(await page.getByRole('region', { name: 'Record status' }).evaluate(el => getComputedStyle(el).backdropFilter)).toContain('blur');
  });
});

test.describe('blocked acceptance and empty-plan outlook', () => {
  test('grades and credits stay optional; only format problems block acceptance', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await page.getByRole('button', { name: 'Add course attempt' }).click();
    const row = page.getByTestId('record-row').last();
    await row.getByLabel('Course code').fill('SYN 101');
    await expect(page.getByTestId('record-summary')).toContainText('SYN 101 needs a status');
    await row.getByLabel('Status').selectOption({ label: 'In progress' });
    // No grade, no credits: still acceptable; the engine keeps such details unresolved.
    await expect(page.getByTestId('record-summary')).toHaveText('1 course checked. All found in this catalog.');
    await expect(page.getByRole('button', { name: 'Accept and continue' })).not.toHaveAttribute('aria-disabled', 'true');
    await row.getByLabel('Earned credits').fill('x');
    await expect(page.getByTestId('record-summary')).toContainText('SYN 101 needs valid earned credits');
    await row.getByLabel('Earned credits').fill('');
    await page.getByRole('button', { name: 'Accept and continue' }).click();
    await expect(page.getByTestId('notice-status')).toContainText('Record accepted');
  });

  test('an empty plan says so plainly and shows the engine outlook unchanged', async ({ page }) => {
    await open(page);
    await startGuest(page);
    await toPlanner(page, 'selected');
    await expect(page.getByTestId('outlook')).toHaveAttribute('data-kind', 'conditional_path_found');
    await expect(page.getByTestId('outlook-context')).toHaveText('No courses are planned yet. This outlook reflects PathCheck’s check of your remaining requirements, not a schedule you chose.');
    await expect(page.getByTestId('empty-plan')).toBeVisible();
    await addCourse(page, /^SYN 201/, 'Spring 2027');
    await expect(page.getByTestId('outlook-context')).toHaveCount(0);
  });

  test('an engine-reported risk on an empty plan is shown as a risk with its finding', async ({ page }) => {
    await open(page, 'draft=none');
    await startGuest(page);
    await toPlanner(page, 'selected');
    await expect(page.getByTestId('outlook')).toHaveAttribute('data-kind', 'target_at_risk');
    await expect(page.getByTestId('outlook')).toContainText('Fall 2028 is at risk');
    await expect(page.getByTestId('outlook-context')).toBeVisible();
    await expect(page.getByTestId('issues')).toContainText('No complete schedule found within search limits');
    await expect(page.getByTestId('empty-plan').getByRole('button', { name: 'Help me build a plan' })).toBeVisible();
  });
});
