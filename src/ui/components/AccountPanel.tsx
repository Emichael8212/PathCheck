import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AcademicRecord, GuestDraft, Plan, Result, SavedPlan } from '../../contracts';
// Lead-approved consumption of S's existing public, draft-scoped cleanup. It removes only
// stored copies byte-identical to the given draft; the generic clear('save') port would
// delete both slots (another tab's draft, or a newer edit stashed while a save was pending).
import { clearSavedGuestDraft } from '../../persistence/guestRecovery';
import * as guestRecovery from '../../persistence/guestRecovery';
import { failureText, formatTimestamp } from '../labels';
import { termLabel } from '../terms';
import { guard, guardAsync } from '../scenario';
import type { AccountPorts, WorkflowClock } from '../services';

export type SyncState = 'local' | 'saving' | 'saved' | 'unsynced' | 'conflict' | 'failed';
const SYNC_TEXT: Record<SyncState, string> = {
  local: 'Guest work — stored only in this tab', saving: 'Saving…', saved: 'Saved to your account',
  unsynced: 'Changes not yet saved to your account', conflict: 'Save conflict — a newer cloud version exists', failed: 'Save failed — your local plan is unchanged and not synced',
};

const SYNC_SHORT: Record<SyncState, string> = { local: 'Signed in, not saved', saving: 'Saving…', saved: 'Saved', unsynced: 'Unsaved changes', conflict: 'Save conflict', failed: 'Save failed' };

const SESSION_DRAFT_HOURS = 6, CROSS_TAB_DRAFT_HOURS = 24;

/**
 * S-owned recovery choice helpers (lead-approved consumption, like clearSavedGuestDraft).
 * They ship with S's recovery snapshots; until that S module is present this is a capability
 * check only. U never reads recovery storage itself and never picks a draft automatically.
 */
type RecoveryChoice = { selectionId: string; draft: GuestDraft };
type ChoiceHelpers = {
  listGuestRecoveryChoices?: (recovery: AccountPorts['recovery'], now: string) => Result<RecoveryChoice[]>;
  selectGuestRecoveryChoice?: (recovery: AccountPorts['recovery'], selectionId: string, now: string) => Result<GuestDraft>;
};
const choiceHelpers = guestRecovery as unknown as ChoiceHelpers;

/** What the recovery banner shows when recover() did not return exactly one draft. */
type RecoveryProblem =
  | { kind: 'choices'; choices: RecoveryChoice[]; error: string | null }
  | { kind: 'notice'; text: string; canClearAll: boolean };

const MULTIPLE_NO_CHOICE = 'Several guest drafts were found on this device. This version cannot choose between them, so none was restored and all are kept.';

function problemFor(f: Extract<Result<never>, { ok: false }>): RecoveryProblem {
  switch (f.reasonCode) {
    case 'recovery_multiple_shared_drafts': return { kind: 'notice', text: MULTIPLE_NO_CHOICE, canClearAll: true };
    case 'recovery_cleanup_failed': return { kind: 'notice', text: 'A recovery draft on this device could not be removed and is still stored here. Nothing was restored.', canClearAll: true };
    case 'recovery_storage_unavailable': return { kind: 'notice', text: 'Recovery drafts on this device could not be read. Nothing was restored or removed.', canClearAll: false };
    case 'recovery_cross_tab_unsupported': return { kind: 'notice', text: 'This browser cannot read cross-tab recovery drafts. Nothing was restored.', canClearAll: false };
    case 'recovery_clock_behind_draft': return { kind: 'notice', text: 'A recovery draft here is dated later than this device’s clock, so it was not restored. It is kept.', canClearAll: true };
    default: return { kind: 'notice', text: `Recovery drafts could not be checked. Nothing was restored. ${failureText(f)}`, canClearAll: false };
  }
}

const CHOICE_ERROR: Record<string, string> = {
  recovery_choice_missing: 'That draft is no longer stored on this device.',
  recovery_choice_changed: 'That draft changed in another tab after this list was shown.',
  recovery_choice_unusable: 'That draft has expired or is no longer valid.',
  recovery_session_draft_present: 'This tab already keeps a draft of its own work, which takes priority. Another draft can be restored only when this tab has no work (for example after Start over).',
};

/** stash() wrote the new draft but could not remove an older copy of it (S `recovery_cleanup_failed`). */
const stashWritten = (r: Result<null>) => !r.ok && r.reasonCode === 'recovery_cleanup_failed';
const OLDER_COPY_REMAINS = 'Your latest changes are kept for refresh, but an older recovery copy on this device could not be removed.';

type Work = { record: AcademicRecord; plan: Plan };
type CloudRef = { id: string; revision: number };

/**
 * The workflow's current work at one instant. `epoch` changes whenever the work is replaced
 * (open, restore, start over, sign-out), so a late async result can be matched to the work
 * it was requested for. record/plan are compared by identity: every L command returns new objects.
 */
export interface WorkSnapshot extends Work { epoch: number; cloud: CloudRef | null; sync: SyncState }

/** Workspace identity at one instant, including unaccepted rows and planning assumptions. */
export interface WorkspaceMark { epoch: number; token: object }
const sameMark = (a: WorkspaceMark, b: WorkspaceMark) => a.epoch === b.epoch && a.token === b.token;

/**
 * How the workflow applied a finished save:
 * - adopted: work unchanged since submit; the saved identity/revision is now current ("Saved").
 * - newer_local_kept: update succeeded but newer local edits exist; only the CAS revision advanced.
 * - copy_only: a new cloud copy exists of the submitted snapshot; newer local work keeps its identity, unsaved.
 * - stale: the work was replaced (opened/started over/signed out); nothing was applied.
 */
export type SaveAdoption = 'adopted' | 'newer_local_kept' | 'copy_only' | 'stale';

export interface AccountPanelProps {
  ports: AccountPorts | null;
  clock: WorkflowClock;
  work: Work | null;
  cloud: CloudRef | null;
  sync: SyncState;
  /** Current work, read at call time (never a render-time closure). */
  currentWork(): WorkSnapshot | null;
  /** Current workspace mark, read at call time. */
  workspaceMark(): WorkspaceMark;
  onSaving(): void;
  onSaved(saved: SavedPlan, submitted: WorkSnapshot, kind: 'new' | 'update'): SaveAdoption;
  /** Returns false when the submitted work was replaced meanwhile (the failure is then not shown as the current state). */
  onSaveFailed(submitted: WorkSnapshot, state: 'conflict' | 'failed'): boolean;
  onOpen(saved: SavedPlan): void;
  onRestoreDraft(draft: GuestDraft): void;
  /** Local session ended: the workflow removes account and unsaved work from this tab. */
  onSignedOut(): void;
}

type Stashed = { draft: GuestDraft; record: AcademicRecord; plan: Plan };

export function AccountPanel({ ports, clock, work, cloud, sync, currentWork, workspaceMark, onSaving, onSaved, onSaveFailed, onOpen, onRestoreDraft, onSignedOut }: AccountPanelProps) {
  const emailId = useId(), otpId = useId(), optId = useId();
  const [user, setUser] = useState<{ userId: string } | null>(null);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState<'idle' | 'otp_sent'>('idle');
  const [crossTab, setCrossTab] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [recovered, setRecovered] = useState<GuestDraft | null>(null);
  const [problem, setProblem] = useState<RecoveryProblem | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  // Outcome of a banner action, shown outside the (possibly closed) account menu.
  const [recoveryStatus, setRecoveryStatus] = useState<string | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (recoveryStatus) statusRef.current?.focus(); }, [recoveryStatus]);
  const [plans, setPlans] = useState<Array<{ id: string; revision: number; updatedAt: string }> | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState<GuestDraft['mode']>('session');
  const [recoveryIssue, setRecoveryIssue] = useState<string | null>(null);
  // Latest draft this tab wrote to recovery storage, with the exact objects it was built from.
  const stashed = useRef<Stashed | null>(null);
  const draftId = useRef<string | null>(null);
  // Login identity for async results: a result requested under another login is never applied.
  const userRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  // Monotonic generations: only the latest auth operation (request/verify/cancel/sign-out)
  // and the latest explicit Open may change what this tab shows.
  const authGen = useRef(0);
  const openGen = useRef(0);

  useEffect(() => {
    if (!ports) return;
    let live = true;
    void guardAsync(() => ports.auth.currentUser(), 'auth_unavailable').then(r => {
      // A verify that finished first is authoritative; never replace it with the mount check.
      if (live && r.ok && userRef.current === null && r.value) { userRef.current = r.value.userId; setUser(r.value); }
    });
    const draft = guard(() => ports.recovery.recover(clock.now()), 'recovery_failed');
    if (draft.ok && draft.value) queueMicrotask(() => { if (live) setRecovered(draft.value); });
    // Failures are never silent: preserved drafts must stay reachable or at least disclosed.
    if (!draft.ok) { const next = recoveryProblem(draft); queueMicrotask(() => { if (live) setProblem(next); }); }
    return () => { live = false; };
  }, [ports, clock]); // eslint-disable-line react-hooks/exhaustive-deps -- mount-time recovery check only

  /** Writes a session (or opted-in cross-tab) recovery draft of exactly `w`. No PDF, no tokens: S validates the projection. */
  function stashWork(w: Work, mode: GuestDraft['mode']): Result<null> {
    if (!ports) return { ok: true, value: null };
    const now = clock.now();
    const hours = mode === 'cross_tab_opt_in' ? CROSS_TAB_DRAFT_HOURS : SESSION_DRAFT_HOURS;
    draftId.current ??= clock.newId('guest-draft');
    const draft: GuestDraft = { schemaVersion: 1, draftId: draftId.current, mode, explicitRecoveryConsent: mode === 'cross_tab_opt_in', createdAt: now, expiresAt: new Date(Date.parse(now) + hours * 3_600_000).toISOString(), record: w.record, plan: w.plan };
    const r = guard(() => ports.recovery.stash(draft), 'stash_failed');
    // S writes the new copy before reporting recovery_cleanup_failed (an older copy remains):
    // the draft IS kept, so record it for exact cleanup later.
    if (r.ok || stashWritten(r)) stashed.current = { draft, record: w.record, plan: w.plan };
    return r;
  }

  // Unsaved guest work (no cloud identity) is kept in this tab's recovery draft after every
  // accepted change, so a same-tab refresh, OTP round trip or failed sign-in loses nothing.
  // When the work is discarded (start over), only this tab's own exact draft is removed.
  useEffect(() => {
    if (!ports) return;
    if (!work) {
      const own = stashed.current;
      stashed.current = null; draftId.current = null;
      if (own) {
        const removed = clearSavedGuestDraft(ports.recovery, own.draft, clock.now());
        queueMicrotask(() => setRecoveryIssue(removed === true ? null : 'PathCheck could not confirm the recovery draft of your previous work was removed from this device.'));
      }
      return;
    }
    if (cloud) return;
    const s = stashed.current;
    if (s && s.record === work.record && s.plan === work.plan && s.draft.mode === recoveryMode) return;
    const r = stashWork(work, recoveryMode);
    queueMicrotask(() => setRecoveryIssue(r.ok ? null : stashWritten(r) ? OLDER_COPY_REMAINS : `Your latest changes could not be kept for refresh recovery: ${failureText(r)}`));
  }, [ports, work, cloud, recoveryMode]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Maps a failed recover() to the banner, listing S's explicit choices when several drafts exist. */
  function recoveryProblem(f: Extract<Result<never>, { ok: false }>, error: string | null = null): RecoveryProblem {
    if (!ports || f.reasonCode !== 'recovery_multiple_shared_drafts') return problemFor(f);
    const list = choiceHelpers.listGuestRecoveryChoices;
    if (!list) return problemFor(f);
    const r = guard(() => list(ports.recovery, clock.now()), 'recovery_choices_failed');
    if (!r.ok) return { kind: 'notice', text: `Several guest drafts were found on this device, but they could not be listed. None was restored and all are kept. ${failureText(r)}`, canClearAll: true };
    if (r.value.length === 0) return { kind: 'notice', text: error ? `${error} No other drafts are stored here.` : 'The recovery drafts on this device are no longer available. Nothing was restored.', canClearAll: false };
    return { kind: 'choices', choices: r.value, error };
  }

  /** Continue a recovered draft exactly like the single-draft banner: same draftId and mode. */
  function restore(d: GuestDraft) {
    draftId.current = d.draftId; stashed.current = { draft: d, record: d.record, plan: d.plan };
    setRecoveryMode(d.mode); setCrossTab(d.mode === 'cross_tab_opt_in');
    onRestoreDraft(d); setRecovered(null); setProblem(null); setConfirmClearAll(false);
    say('Draft restored. Planning assumptions use the defaults (15 credits per term, no summer terms) because drafts do not store them.');
  }

  function chooseDraft(selectionId: string) {
    if (!ports) return;
    const select = choiceHelpers.selectGuestRecoveryChoice;
    if (!select) { setProblem({ kind: 'notice', text: MULTIPLE_NO_CHOICE, canClearAll: true }); return; }
    const r = guard(() => select(ports.recovery, selectionId, clock.now()), 'recovery_choice_failed');
    if (r.ok) { restore(r.value); return; }
    // Nothing is deleted on a failed choice; show what remains now.
    const why = `${CHOICE_ERROR[r.reasonCode] ?? failureText(r)} Nothing was restored.`;
    setProblem(recoveryProblem({ ok: false, code: 'conflict', reasonCode: 'recovery_multiple_shared_drafts' }, why));
  }

  /** Explicit, confirmed deletion of every recovery draft in this browser (S's clear('cancel')). */
  function clearAllDrafts() {
    if (!ports) return;
    const r = guard(() => ports.recovery.clear('cancel'), 'recovery_clear_failed');
    stashed.current = null;
    setConfirmClearAll(false); setRecovered(null); setRecoveryMode('session'); setCrossTab(false);
    // clear() may have removed this tab's own draft even when a later removal failed: always
    // re-keep the work on screen for refresh, in this tab only (the student chose to delete
    // every shared copy), and say so.
    const kept = work && !cloud ? stashWork(work, 'session') : null;
    const workNote = !kept ? '' : kept.ok ? ' Your work on screen is unchanged and kept for refresh in this tab only.'
      : stashWritten(kept) ? ` Your work on screen is unchanged and kept for refresh in this tab only. ${OLDER_COPY_REMAINS}`
      : ` Your work on screen is unchanged but could not be kept for refresh: ${failureText(kept)}`;
    if (!r.ok) { setProblem({ kind: 'notice', text: `Some recovery drafts could not be deleted and may still be stored on this device. ${failureText(r)}${workNote}`, canClearAll: true }); return; }
    setProblem(null);
    setRecoveryStatus(`All recovery drafts on this device were deleted.${workNote}`);
  }

  if (!ports) {
    return (
      <AccountMenu label="Guest, not saved">
        <p className="muted">Sign-in and cloud save are unavailable in this build. Guest planning and PDF export still work.</p>
      </AccountMenu>
    );
  }

  const say = (text: string) => setMessage(text);

  /** Removes exactly `draft`'s stored copies after its contents reached the cloud. Truthful about leftovers. */
  function cleanupSaved(draft: GuestDraft | null, guestWork: boolean): string {
    if (!ports) return '';
    // Only unsaved guest work is stashed, so a remaining draft is newer only for guest saves.
    if (!draft) return guestWork && stashed.current ? ' A recovery draft with newer unsaved changes is kept on this device.' : '';
    const removed = clearSavedGuestDraft(ports.recovery, draft, clock.now());
    if (removed === true) { if (stashed.current?.draft === draft) stashed.current = null; return ''; }
    if (removed === undefined) return ' The recovery draft on this device was not removed (this build cannot remove only the saved draft).';
    return ' A recovery draft on this device was kept: it holds other unsaved work or could not be removed.';
  }

  async function requestOtp() {
    if (!ports) return;
    if (work) {
      const mode: GuestDraft['mode'] = crossTab ? 'cross_tab_opt_in' : 'session';
      const r = stashWork(work, mode);
      if (!r.ok && !stashWritten(r)) {
        say(r.code === 'conflict'
          ? 'Another tab already keeps a cross-tab recovery draft on this device, so this one was not stored there. Turn off the 24-hour option to keep your draft in this tab only.'
          : `Your draft could not be protected for sign-in: ${failureText(r)}`);
        return;
      }
      setRecoveryMode(mode); setRecoveryIssue(r.ok ? null : OLDER_COPY_REMAINS);
    }
    const gen = ++authGen.current;
    const r = await guardAsync(() => ports.auth.requestEmailOtp(email.trim()), 'otp_request_failed');
    if (gen !== authGen.current) return; // cancelled or superseded meanwhile
    if (!r.ok) { say(`${failureText(r)} Your guest draft is unchanged.`); return; }
    setStage('otp_sent'); say('Check your email for a one-time code. Your guest draft is kept in this tab.');
  }

  async function verify() {
    if (!ports) return;
    const gen = ++authGen.current;
    const r = await guardAsync(() => ports.auth.verifyEmailOtp(email.trim(), otp.trim()), 'otp_verify_failed');
    // Cancelled/superseded: never show a login. S also refuses to commit the session because
    // cancel calls auth.signOut(), which invalidates any verify still in flight.
    if (gen !== authGen.current) return;
    if (!r.ok) { say(`${failureText(r)} Your guest draft is unchanged.`); return; }
    userRef.current = r.value.userId;
    setUser(r.value); setStage('idle'); setOtp('');
    say('Signed in. Nothing has been saved yet — choose Save as new to create a cloud copy.');
  }

  async function cancelOtp() {
    if (!ports) return;
    const gen = ++authGen.current;
    setStage('idle'); setOtp('');
    let text = 'Sign-in cancelled. Your guest work is unchanged.';
    if (recoveryMode === 'cross_tab_opt_in') {
      // Cancelling withdraws the 24-hour shared-device copy. S moves only this draft back to
      // this tab (same draftId); another tab's draft is never touched.
      const r = work ? stashWork(work, 'session') : { ok: true as const, value: null };
      setRecoveryMode('session'); setCrossTab(false);
      text = r.ok ? 'Sign-in cancelled. Your guest work is unchanged and kept in this tab only.' : `Sign-in cancelled. Your guest work is unchanged. The 24-hour recovery draft could not be withdrawn: ${failureText(r)}`;
    }
    say(text);
    // A code verification may still be in flight. S's signOut immediately invalidates it, so
    // a late success cannot create a session. Recovery storage is not touched here.
    const out = await guardAsync(() => ports.auth.signOut(), 'sign_out_failed');
    if (gen !== authGen.current) return;
    const who = await guardAsync(() => ports.auth.currentUser(), 'auth_unavailable');
    if (gen !== authGen.current) return;
    if (!who.ok || who.value) say(`${text} PathCheck could not confirm that the pending sign-in was stopped${out.ok ? '' : ` (${out.reasonCode})`}. Reload this page before continuing.`);
  }

  async function save(kind: 'new' | 'update') {
    if (!ports || savingRef.current) return;
    const submitted = currentWork();
    if (!submitted || (kind === 'update' && !submitted.cloud)) return;
    const owner = userRef.current;
    // The exact draft whose contents are being submitted; only it may be cleaned up afterwards.
    const s = stashed.current;
    const matching = s && s.record === submitted.record && s.plan === submitted.plan ? s.draft : null;
    savingRef.current = true; setSaving(true); onSaving();
    const r = kind === 'new'
      ? await guardAsync(() => ports.storage.createPlan(submitted.record, submitted.plan), 'save_failed')
      : await guardAsync(() => ports.storage.savePlan(submitted.cloud!.id, submitted.cloud!.revision, submitted.record, submitted.plan), 'save_failed');
    savingRef.current = false; setSaving(false);
    if (owner !== userRef.current) {
      // Signed out or switched accounts meanwhile: nothing is applied to this tab.
      if (r.ok) cleanupSaved(matching, !submitted.cloud);
      return;
    }
    if (!r.ok) {
      const shown = onSaveFailed(submitted, r.code === 'conflict' ? 'conflict' : 'failed');
      say(shown ? failureText(r) : `An earlier save did not complete (${r.reasonCode}). Your current work was not changed.`);
      return;
    }
    const cleanup = cleanupSaved(matching, !submitted.cloud);
    const outcome = onSaved(r.value, submitted, kind);
    if (outcome === 'adopted') say(`${kind === 'new' ? 'Saved as a new plan.' : 'Changes saved.'}${cleanup}`);
    else if (outcome === 'newer_local_kept') say(`Saved the version from when you pressed Save. Your newer changes are not saved yet.${cleanup}`);
    else if (outcome === 'copy_only') say(`Saved a new cloud copy of the plan as it was when you pressed Save. Your newer changes are not saved — choose Save as new again to keep them.${cleanup}`);
    else say(`A save finished after you switched work, so it was not applied here. It is listed in My saved plans.${cleanup}`);
  }

  async function listPlans() {
    if (!ports) return;
    const owner = userRef.current;
    const r = await guardAsync(() => ports.storage.listOwnedPlans(), 'list_failed');
    if (owner !== userRef.current) return;
    if (!r.ok) { say(failureText(r)); return; }
    setPlans(r.value);
  }

  /**
   * Explicit Open discards the workspace as it was when the student clicked. The result is
   * applied only if it is the latest Open, the login is unchanged and the workspace was not
   * changed meanwhile (edits, start over, restore, another open or a save adoption).
   */
  async function open(id: string) {
    if (!ports) return;
    const gen = ++openGen.current;
    const owner = userRef.current;
    const mark = workspaceMark();
    const r = await guardAsync(() => ports.storage.getOwnedPlan(id), 'open_failed');
    if (gen !== openGen.current || owner !== userRef.current) return;
    if (!sameMark(mark, workspaceMark())) {
      say(r.ok ? 'The saved plan finished loading after your work changed, so it was not opened. Your current work is unchanged.' : failureText(r));
      return;
    }
    if (!r.ok) { say(failureText(r)); return; }
    onOpen(r.value);
    say('Opened saved plan. Analysis is recalculated from the saved inputs. Planning assumptions use the defaults (15 credits per term, no summer terms) because saved plans do not store them.');
  }

  async function remove(id: string, revision: number) {
    if (!ports) return;
    if (confirm !== `plan:${id}`) { setConfirm(`plan:${id}`); return; }
    setConfirm(null);
    const owner = userRef.current;
    const r = await guardAsync(() => ports.storage.deleteOwnedPlan(id, revision), 'delete_failed');
    if (owner !== userRef.current) return;
    say(r.ok ? 'Plan deleted from your account.' : failureText(r));
    await listPlans();
  }

  /**
   * Re-reads S's local session after sign-out/account deletion. S discards local credentials
   * before contacting the server, so the UI follows currentUser(), not the server reply.
   * Returns true when this tab is (or must be treated as) signed out.
   */
  async function endLocalSession(): Promise<{ signedOut: boolean; cleanup: string }> {
    if (!ports) return { signedOut: true, cleanup: '' };
    const who = await guardAsync(() => ports.auth.currentUser(), 'auth_unavailable');
    if (who.ok && who.value) return { signedOut: false, cleanup: '' };
    userRef.current = null; authGen.current += 1; openGen.current += 1;
    const cleared = guard(() => ports.recovery.clear('sign_out'), 'recovery_clear_failed');
    stashed.current = null; draftId.current = null;
    setUser(null); setPlans(null); setStage('idle'); setRecoveryMode('session'); setCrossTab(false); setRecovered(null); setProblem(null); setConfirmClearAll(false);
    onSignedOut();
    return { signedOut: true, cleanup: cleared.ok ? '' : ` The recovery draft on this device could not be removed: ${failureText(cleared)}` };
  }

  async function signOut() {
    if (!ports) return;
    if (sync !== 'saved' && work && confirm !== 'sign_out') { setConfirm('sign_out'); return; }
    setConfirm(null);
    const r = await guardAsync(() => ports.auth.signOut(), 'sign_out_failed');
    const end = await endLocalSession();
    if (!end.signedOut) { say(`Sign-out failed and you are still signed in. ${r.ok ? '' : failureText(r)}`.trim()); return; }
    const base = r.ok ? 'Signed out. This tab no longer shows account data.' : `Signed out on this device, but the server did not confirm ending the session (${r.reasonCode}). This tab no longer shows account data.`;
    say(end.cleanup ? `${base}${end.cleanup}` : `${base} Recovery drafts were cleared.`);
  }

  async function deleteAccount() {
    if (!ports) return;
    if (confirm !== 'account') { setConfirm('account'); return; }
    setConfirm(null);
    const r = await guardAsync(() => ports.storage.deleteAccount(), 'delete_account_failed');
    if (!r.ok) { say(failureText(r)); return; }
    // The account is gone; its local session must not stay usable in this tab.
    const out = await guardAsync(() => ports.auth.signOut(), 'sign_out_failed');
    const end = await endLocalSession();
    if (!end.signedOut) { say(`Account deletion requested, but this browser could not end the session${out.ok ? '' : ` (${out.reasonCode})`}. Close this browser window.`); return; }
    say(`Account deletion requested. You are signed out.${end.cleanup}`);
  }

  const busySave = saving || sync === 'saving';
  const menuLabel = user ? SYNC_SHORT[sync] : 'Guest, not saved';
  return (
    <>
      <AccountMenu label={menuLabel} tone={sync}>
      <p className={`sync sync-${sync}`} data-testid="sync-state">{SYNC_TEXT[sync]}</p>
      {recoveryIssue && <p className="warning" role="alert">{recoveryIssue}</p>}
      {!user && (
        <div className="sign-in">
          <h2 className="h3">Sign in to save (optional)</h2>
          {stage === 'idle' ? (
            <form onSubmit={e => { e.preventDefault(); if (email.includes('@')) void requestOtp(); }}>
              <div className="field">
                <label htmlFor={emailId}>Email</label>
                <input id={emailId} type="email" autoComplete="email" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <label className="check" htmlFor={optId}>
                <input id={optId} type="checkbox" checked={crossTab} onChange={e => setCrossTab(e.target.checked)} />
                <span>Also keep a recovery draft on this device for up to 24 hours (for sign-in links opened in another tab)</span>
              </label>
              {crossTab && <p className="warning" role="note">Shared-device warning: anyone using this browser profile could open this draft until it expires or you sign out. No transcript PDF is stored.</p>}
              <button type="submit" disabled={!email.includes('@')}>Email me a code</button>
            </form>
          ) : (
            <form onSubmit={e => { e.preventDefault(); if (otp.trim()) void verify(); }}>
              <div className="field">
                <label htmlFor={otpId}>One-time code</label>
                <input id={otpId} inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={e => setOtp(e.target.value)} />
              </div>
              <div className="button-row">
                <button type="submit" disabled={otp.trim().length === 0}>Verify code</button>
                <button type="button" className="secondary" onClick={() => void cancelOtp()}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}
      {user && (
        <div className="signed-in">
          <p>Signed in.</p>
          <div className="button-row">
            <button type="button" disabled={!work || busySave} onClick={() => void save('new')}>Save as new</button>
            {cloud && <button type="button" disabled={!work || busySave || sync === 'conflict'} onClick={() => void save('update')}>Save changes</button>}
            <button type="button" className="secondary" onClick={listPlans}>My saved plans</button>
            <button type="button" className="secondary" onClick={signOut}>{confirm === 'sign_out' ? 'Confirm sign out (unsaved work in this tab is cleared)' : 'Sign out'}</button>
          </div>
          {sync === 'conflict' && cloud && (
            <div className="conflict" role="alert">
              <p>The cloud copy changed elsewhere. Nothing was overwritten.</p>
              <div className="button-row">
                <button type="button" disabled={busySave} onClick={() => void save('new')}>Save my version as a new plan</button>
                <button type="button" className="secondary" onClick={() => open(cloud.id)}>Open the cloud version (discard local changes)</button>
              </div>
            </div>
          )}
          {plans && (
            <ul className="saved-plans" aria-label="Saved plans">
              {plans.length === 0 && <li className="muted">No saved plans.</li>}
              {plans.map(p => (
                <li key={p.id}>
                  <span>Updated <time dateTime={p.updatedAt}>{formatTimestamp(p.updatedAt)}</time>, revision <span className="tabular">{p.revision}</span></span>
                  <button type="button" onClick={() => open(p.id)}>Open</button>
                  <button type="button" className="danger" onClick={() => remove(p.id, p.revision)}>{confirm === `plan:${p.id}` ? 'Confirm delete' : 'Delete'}</button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="danger link" onClick={deleteAccount}>{confirm === 'account' ? 'Confirm: delete my account and saved plans' : 'Delete account'}</button>
        </div>
      )}
      <p className="account-message" role="status">{message}</p>
      </AccountMenu>
      {problem && !recovered && (
        <div className="recovery-banner" role="region" aria-label="Recovery drafts" data-testid="recovery-problem">
          {problem.kind === 'choices' ? (
            <>
              <p>{problem.choices.length === 1 ? 'A guest draft was found on this device. Restore it, or keep it for later.' : 'Several guest drafts were found on this device. Choose one to restore; the others are kept.'}</p>
              {problem.error && <p className="warning" role="alert">{problem.error}</p>}
              {/* S gives this tab's own draft priority, and a restore would replace the work on screen. */}
              {work && <p className="muted" data-testid="recovery-choices-locked">You have started work in this tab, so these drafts can’t be restored here now. They are kept; Start over to restore one.</p>}
              <ul className="recovery-choices" aria-label="Recovery drafts on this device">
                {problem.choices.map(c => (
                  <li key={c.selectionId} data-testid="recovery-choice">
                    <span>Target {termLabel(c.draft.plan.targetTerm)} · saved <time dateTime={c.draft.createdAt}>{formatTimestamp(c.draft.createdAt)}</time> · <span className="tabular">{c.draft.record.courseAttempts.length}</span> recorded, <span className="tabular">{c.draft.plan.activePlacements.length}</span> planned</span>
                    {!work && <button type="button" onClick={() => chooseDraft(c.selectionId)}>Restore this draft</button>}
                  </li>
                ))}
              </ul>
            </>
          ) : <p role="alert">{problem.text}</p>}
          <div className="button-row">
            {(problem.kind === 'choices' || problem.canClearAll) && (confirmClearAll ? (
              <>
                <p className="warning" role="note">This permanently deletes every PathCheck recovery draft in this browser, including drafts from other tabs. Your current on-screen work is not affected.</p>
                <button type="button" className="danger" onClick={clearAllDrafts}>Delete all recovery drafts</button>
                <button type="button" className="secondary" autoFocus onClick={() => setConfirmClearAll(false)}>Keep them</button>
              </>
            ) : <button type="button" className="secondary" onClick={() => setConfirmClearAll(true)}>Delete all recovery drafts…</button>)}
            <button type="button" className="secondary" onClick={() => { setProblem(null); setConfirmClearAll(false); }}>Dismiss</button>
          </div>
        </div>
      )}
      {recoveryStatus && !problem && (
        <p className="recovery-banner" role="status" tabIndex={-1} ref={statusRef} data-testid="recovery-status">
          {recoveryStatus} <button type="button" className="link" onClick={() => setRecoveryStatus(null)}>Dismiss</button>
        </p>
      )}
      {recovered && (
        <div className="recovery-banner" role="region" aria-label="Recovered draft" data-testid="recovery-banner">
          <p>A guest draft from <time dateTime={recovered.createdAt}>{formatTimestamp(recovered.createdAt)}</time> was recovered on this device.</p>
          <div className="button-row">
            {/* Continue the same draft: later edits re-stash under its draftId and mode. */}
            <button type="button" onClick={() => restore(recovered)}>Restore draft</button>
            <button type="button" className="secondary" onClick={() => {
              // Remove only this recovered draft; this tab's current work draft is kept.
              const removed = clearSavedGuestDraft(ports.recovery, recovered, clock.now());
              setRecovered(null);
              say(removed === true ? 'Recovered draft discarded.' : 'Recovered draft hidden. PathCheck could not confirm it was removed from this device.');
            }}>Discard</button>
          </div>
        </div>
      )}
    </>
  );
}

/** Header disclosure; Escape closes it and returns focus to its summary. */
function AccountMenu({ label, tone, children }: { label: string; tone?: SyncState; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <div className="account" data-testid="account-panel">
      <details className="account-menu" ref={ref}
        onKeyDown={e => { if (e.key === 'Escape' && ref.current?.open) { ref.current.open = false; ref.current.querySelector('summary')?.focus(); } }}>
        <summary className={tone ? `sync-${tone}` : undefined} data-testid="account-summary">{label}<span className="visually-hidden">: account and saving</span></summary>
        <div className="account-sheet" role="group" aria-label="Account and saving">{children}</div>
      </details>
    </div>
  );
}
