import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AcademicRecord, GuestDraft, Plan, SavedPlan } from '../../contracts';
import { failureText, formatTimestamp } from '../labels';
import { guard, guardAsync } from '../scenario';
import type { AccountPorts, WorkflowClock } from '../services';

export type SyncState = 'local' | 'saving' | 'saved' | 'unsynced' | 'conflict' | 'failed';
const SYNC_TEXT: Record<SyncState, string> = {
  local: 'Guest work — stored only in this tab', saving: 'Saving…', saved: 'Saved to your account',
  unsynced: 'Changes not yet saved to your account', conflict: 'Save conflict — a newer cloud version exists', failed: 'Save failed — your local plan is unchanged and not synced',
};

const SYNC_SHORT: Record<SyncState, string> = { local: 'Signed in, not saved', saving: 'Saving…', saved: 'Saved', unsynced: 'Unsaved changes', conflict: 'Save conflict', failed: 'Save failed' };

const SESSION_DRAFT_HOURS = 6, CROSS_TAB_DRAFT_HOURS = 24;

export interface AccountPanelProps {
  ports: AccountPorts | null;
  clock: WorkflowClock;
  work: { record: AcademicRecord; plan: Plan } | null;
  cloud: { id: string; revision: number } | null;
  sync: SyncState;
  onSync(state: SyncState): void;
  onSaved(saved: SavedPlan): void;
  onOpen(saved: SavedPlan): void;
  onRestoreDraft(draft: GuestDraft): void;
  onSignedOut(): void;
}

export function AccountPanel({ ports, clock, work, cloud, sync, onSync, onSaved, onOpen, onRestoreDraft, onSignedOut }: AccountPanelProps) {
  const emailId = useId(), otpId = useId(), optId = useId();
  const [user, setUser] = useState<{ userId: string } | null>(null);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState<'idle' | 'otp_sent'>('idle');
  const [crossTab, setCrossTab] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [recovered, setRecovered] = useState<GuestDraft | null>(null);
  const [plans, setPlans] = useState<Array<{ id: string; revision: number; updatedAt: string }> | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!ports) return;
    let live = true;
    void guardAsync(() => ports.auth.currentUser(), 'auth_unavailable').then(r => { if (live && r.ok) setUser(r.value); });
    const draft = guard(() => ports.recovery.recover(clock.now()), 'recovery_failed');
    if (draft.ok && draft.value) queueMicrotask(() => { if (live) setRecovered(draft.value); });
    return () => { live = false; };
  }, [ports, clock]);

  if (!ports) {
    return (
      <AccountMenu label="Guest, not saved">
        <p className="muted">Sign-in and cloud save are unavailable in this build. Guest planning and PDF export still work.</p>
      </AccountMenu>
    );
  }

  const say = (text: string) => setMessage(text);
  // S reports failed device cleanup as a typed result; never claim a draft was removed when it was not.
  const clearRecovery = (event: 'save' | 'sign_out' | 'cancel'): string => {
    const r = guard(() => ports.recovery.clear(event), 'recovery_clear_failed');
    return r.ok ? '' : ` The recovery draft on this device could not be removed: ${failureText(r)}`;
  };

  async function requestOtp() {
    if (!ports) return;
    if (work) {
      const now = clock.now();
      const hours = crossTab ? CROSS_TAB_DRAFT_HOURS : SESSION_DRAFT_HOURS;
      const draft: GuestDraft = { schemaVersion: 1, draftId: clock.newId('guest-draft'), mode: crossTab ? 'cross_tab_opt_in' : 'session', explicitRecoveryConsent: crossTab, createdAt: now, expiresAt: new Date(Date.parse(now) + hours * 3_600_000).toISOString(), record: work.record, plan: work.plan };
      const stashed = guard(() => ports.recovery.stash(draft), 'stash_failed');
      if (!stashed.ok) { say(`Your draft could not be protected for sign-in: ${failureText(stashed)}`); return; }
    }
    const r = await guardAsync(() => ports.auth.requestEmailOtp(email.trim()), 'otp_request_failed');
    if (!r.ok) { say(failureText(r)); return; }
    setStage('otp_sent'); say('Check your email for a one-time code. Your guest draft is kept in this tab.');
  }

  async function verify() {
    if (!ports) return;
    const r = await guardAsync(() => ports.auth.verifyEmailOtp(email.trim(), otp.trim()), 'otp_verify_failed');
    if (!r.ok) { say(`${failureText(r)} Your guest draft is unchanged.`); return; }
    setUser(r.value); setStage('idle'); setOtp('');
    say('Signed in. Nothing has been saved yet — choose Save as new to create a cloud copy.');
  }

  async function saveNew() {
    if (!ports || !work) return;
    onSync('saving');
    const r = await guardAsync(() => ports.storage.createPlan(work.record, work.plan), 'save_failed');
    if (!r.ok) { onSync(r.code === 'conflict' ? 'conflict' : 'failed'); say(failureText(r)); return; }
    const cleanup = clearRecovery('save');
    onSaved(r.value); say(`Saved as a new plan.${cleanup}`);
  }

  async function saveUpdate() {
    if (!ports || !work || !cloud) return;
    onSync('saving');
    const r = await guardAsync(() => ports.storage.savePlan(cloud.id, cloud.revision, work.record, work.plan), 'save_failed');
    if (!r.ok) { onSync(r.code === 'conflict' ? 'conflict' : 'failed'); say(failureText(r)); return; }
    const cleanup = clearRecovery('save');
    onSaved(r.value); say(`Changes saved.${cleanup}`);
  }

  async function listPlans() {
    if (!ports) return;
    const r = await guardAsync(() => ports.storage.listOwnedPlans(), 'list_failed');
    if (!r.ok) { say(failureText(r)); return; }
    setPlans(r.value);
  }

  async function open(id: string) {
    if (!ports) return;
    const r = await guardAsync(() => ports.storage.getOwnedPlan(id), 'open_failed');
    if (!r.ok) { say(failureText(r)); return; }
    onOpen(r.value); say('Opened saved plan. Analysis is recalculated from the saved inputs.');
  }

  async function remove(id: string, revision: number) {
    if (!ports) return;
    if (confirm !== `plan:${id}`) { setConfirm(`plan:${id}`); return; }
    setConfirm(null);
    const r = await guardAsync(() => ports.storage.deleteOwnedPlan(id, revision), 'delete_failed');
    say(r.ok ? 'Plan deleted from your account.' : failureText(r));
    await listPlans();
  }

  async function signOut() {
    if (!ports) return;
    const r = await guardAsync(() => ports.auth.signOut(), 'sign_out_failed');
    if (!r.ok) { say(failureText(r)); return; }
    const cleanup = clearRecovery('sign_out');
    setUser(null); setPlans(null); onSignedOut(); say(cleanup ? `Signed out.${cleanup}` : 'Signed out. Recovery drafts were cleared.');
  }

  async function deleteAccount() {
    if (!ports) return;
    if (confirm !== 'account') { setConfirm('account'); return; }
    setConfirm(null);
    const r = await guardAsync(() => ports.storage.deleteAccount(), 'delete_account_failed');
    if (!r.ok) { say(failureText(r)); return; }
    const cleanup = clearRecovery('sign_out');
    setUser(null); setPlans(null); onSignedOut(); say(`Account deletion requested.${cleanup}`);
  }

  const menuLabel = user ? SYNC_SHORT[sync] : 'Guest, not saved';
  return (
    <>
      <AccountMenu label={menuLabel} tone={sync}>
      <p className={`sync sync-${sync}`} data-testid="sync-state">{SYNC_TEXT[sync]}</p>
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
                <button type="button" className="secondary" onClick={() => { setStage('idle'); say(`Sign-in cancelled. Your guest work is unchanged.${clearRecovery('cancel')}`); }}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}
      {user && (
        <div className="signed-in">
          <p>Signed in.</p>
          <div className="button-row">
            <button type="button" disabled={!work || sync === 'saving'} onClick={saveNew}>Save as new</button>
            {cloud && <button type="button" disabled={!work || sync === 'saving' || sync === 'conflict'} onClick={saveUpdate}>Save changes</button>}
            <button type="button" className="secondary" onClick={listPlans}>My saved plans</button>
            <button type="button" className="secondary" onClick={signOut}>Sign out</button>
          </div>
          {sync === 'conflict' && cloud && (
            <div className="conflict" role="alert">
              <p>The cloud copy changed elsewhere. Nothing was overwritten.</p>
              <div className="button-row">
                <button type="button" onClick={saveNew}>Save my version as a new plan</button>
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
      {recovered && (
        <div className="recovery-banner" role="region" aria-label="Recovered draft" data-testid="recovery-banner">
          <p>A guest draft from <time dateTime={recovered.createdAt}>{formatTimestamp(recovered.createdAt)}</time> was recovered on this device.</p>
          <div className="button-row">
            <button type="button" onClick={() => { onRestoreDraft(recovered); setRecovered(null); say('Draft restored.'); }}>Restore draft</button>
            <button type="button" className="secondary" onClick={() => { const cleanup = clearRecovery('cancel'); setRecovered(null); say(cleanup ? `Recovered draft hidden.${cleanup}` : 'Recovered draft discarded.'); }}>Discard</button>
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
