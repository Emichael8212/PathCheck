import { describe, expect, it } from 'vitest';
import type { GuestDraft } from '../../src/contracts';
import { clearSavedGuestDraft, createGuestRecoveryService, GUEST_DRAFT_KEY, SHARED_DRAFT_PREFIX, sharedDraftKey } from '../../src/persistence/guestRecovery';
import type { StorageLike } from '../../src/persistence/guestRecovery';
import { draft, memoryStorage } from './helpers';

// Cross-tab recovery uses immutable, content-addressed localStorage snapshots. These tests
// use an in-memory Web Storage double; the real two-tab Chromium proof is
// tests/persistence/browser/recoveryRace.mjs.
const NOW = '2030-01-01T06:00:00Z';
const ct = (over: Partial<GuestDraft> = {}) => draft({ mode: 'cross_tab_opt_in', explicitRecoveryConsent: true, ...over });
const conflict = { ok: false, code: 'conflict', reasonCode: 'recovery_multiple_shared_drafts' };
const behind = { ok: false, code: 'unavailable', reasonCode: 'recovery_clock_behind_draft' };
const snapshots = (local: ReturnType<typeof memoryStorage>) => [...local.map.keys()].filter(k => k.startsWith(SHARED_DRAFT_PREFIX)).sort();
const tab = (local: StorageLike) => createGuestRecoveryService({ session: memoryStorage(), local });
const put = (local: ReturnType<typeof memoryStorage>, d: GuestDraft) => local.setItem(sharedDraftKey(d), JSON.stringify(d));

/** Delegating store that runs `hook` right after a getItem — models another tab acting between our read and our write/remove. */
function interleaved(local: ReturnType<typeof memoryStorage>) {
  // `on`: only a read of a snapshot key triggers the hook (the legacy-slot read does not).
  const state: { hook: ((key: string) => void) | null; on: (key: string) => boolean } = { hook: null, on: k => k.startsWith(SHARED_DRAFT_PREFIX) };
  const store: StorageLike = {
    getItem: k => { const v = local.getItem(k); const h = state.hook; if (h && state.on(k)) { state.hook = null; h(k); } return v; },
    setItem: (k, v) => local.setItem(k, v),
    removeItem: k => local.removeItem(k),
    get length() { return local.length!; },
    key: i => local.key!(i),
  };
  return { store, state };
}

describe('immutable content-addressed cross-tab snapshots', () => {
  it('stores under prefix + draftId + sha256 of the exact bytes; never writes the legacy slot', () => {
    const local = memoryStorage();
    const d = ct({ draftId: 'tab-a' });
    expect(tab(local).stash(d)).toEqual({ ok: true, value: null });
    expect([...local.map.keys()]).toEqual([sharedDraftKey(d)]);
    expect(sharedDraftKey(d)).toMatch(/^pathcheck\.guestDraft\.v1\.x\.tab-a\.[0-9a-f]{64}$/);
    expect(local.map.get(sharedDraftKey(d))).toBe(JSON.stringify(d));
    expect(local.map.has(GUEST_DRAFT_KEY)).toBe(false);
  });

  it('different draftIds from two tabs coexist; recover returns typed conflict and preserves both', () => {
    const local = memoryStorage();
    const a = ct({ draftId: 'tab-a' }), b = ct({ draftId: 'tab-b' });
    expect(tab(local).stash(a).ok).toBe(true);
    expect(tab(local).stash(b).ok).toBe(true);
    const before = new Map(local.map);
    expect(tab(local).recover(NOW)).toEqual(conflict);
    expect(local.map).toEqual(before);
  });

  it('a session draft in this tab still wins over conflicting shared snapshots (same-tab primary)', () => {
    const local = memoryStorage(), session = memoryStorage();
    put(local, ct({ draftId: 'tab-a' }));
    put(local, ct({ draftId: 'tab-b' }));
    const svc = createGuestRecoveryService({ session, local });
    expect(svc.stash(draft({ draftId: 'mine' })).ok).toBe(true);
    expect(svc.recover(NOW)).toEqual({ ok: true, value: draft({ draftId: 'mine' }) });
    expect(snapshots(local)).toHaveLength(2);
  });

  it('same draftId, changed payload in the same tab: the new snapshot is written, then only its own older snapshot retired', () => {
    const local = memoryStorage(), svc = tab(local);
    const v1 = ct({ draftId: 'd' }), v2 = ct({ draftId: 'd', expiresAt: '2030-01-01T18:00:00Z' });
    svc.stash(v1);
    expect(svc.stash(v2)).toEqual({ ok: true, value: null });
    expect(snapshots(local)).toEqual([sharedDraftKey(v2)]);
    expect(tab(local).recover(NOW)).toEqual({ ok: true, value: v2 });
  });

  it('same draftId, changed payloads from two tabs (forks): neither deletes the other; recover conflicts', () => {
    const local = memoryStorage(), a = tab(local), b = tab(local);
    const a1 = ct({ draftId: 'd' }), b1 = ct({ draftId: 'd', createdAt: '2030-01-01T01:00:00Z' });
    const a2 = ct({ draftId: 'd', createdAt: '2030-01-01T02:00:00Z', expiresAt: '2030-01-01T14:00:00Z' });
    a.stash(a1); b.stash(b1); a.stash(a2);
    expect(snapshots(local)).toEqual([sharedDraftKey(a2), sharedDraftKey(b1)].sort());
    expect(tab(local).recover(NOW)).toEqual(conflict);
  });

  it('identical re-stash is idempotent (same key, same bytes)', () => {
    const local = memoryStorage(), svc = tab(local);
    svc.stash(ct());
    svc.stash(ct());
    expect(snapshots(local)).toEqual([sharedDraftKey(ct())]);
  });

  it('a recovered snapshot continued under its draftId is retired by the continuation', () => {
    const local = memoryStorage();
    const orig = ct({ draftId: 'd' });
    tab(local).stash(orig);
    const b = tab(local);
    expect(b.recover(NOW)).toEqual({ ok: true, value: orig });
    const next = ct({ draftId: 'd', createdAt: '2030-01-01T05:00:00Z', expiresAt: '2030-01-01T17:00:00Z' });
    expect(b.stash(next).ok).toBe(true);
    expect(snapshots(local)).toEqual([sharedDraftKey(next)]);
  });

  it('downgrade to session mode removes only snapshots this tab wrote or recovered', () => {
    const local = memoryStorage(), session = memoryStorage();
    const mine = createGuestRecoveryService({ session, local });
    const foreign = ct({ draftId: 'd', createdAt: '2030-01-01T01:00:00Z' });
    mine.stash(ct({ draftId: 'd' }));
    put(local, foreign); // same draftId written by another tab, never seen here
    expect(mine.stash(draft({ draftId: 'd' }))).toEqual({ ok: true, value: null });
    expect(snapshots(local)).toEqual([sharedDraftKey(foreign)]);
    expect(session.map.size).toBe(1);
  });

  it('purges corrupt snapshots: hash mismatch, malformed key, draftId mismatch, misplaced mode, wrong version', () => {
    const local = memoryStorage();
    const good = ct({ draftId: 'ok' });
    const sneaky = ct({ draftId: 'other' });
    local.setItem(sharedDraftKey(good).replace(/.$/, c => (c === '0' ? '1' : '0')), JSON.stringify(good)); // hash mismatch
    local.setItem(`${SHARED_DRAFT_PREFIX}no-hash`, JSON.stringify(good));
    local.setItem(`${SHARED_DRAFT_PREFIX}claimed.${sharedDraftKey(sneaky).slice(-64)}`, JSON.stringify(sneaky));
    for (const bad of [draft({ draftId: 'sess' }), { ...ct({ draftId: 'v2' }), schemaVersion: 2 }]) {
      const raw = JSON.stringify(bad);
      local.setItem(`${SHARED_DRAFT_PREFIX}${(bad as GuestDraft).draftId}.${sharedDraftKey({ ...ct(), draftId: 'x' }).slice(-64)}`, raw);
    }
    expect(tab(local).recover(NOW)).toEqual({ ok: true, value: null });
    expect(local.map.size).toBe(0);
  });

  it('expired snapshots are purged (no TTL grace); a failed purge is a typed failure', () => {
    const local = memoryStorage();
    put(local, ct());
    expect(tab(local).recover('2030-01-01T12:00:00Z')).toEqual({ ok: true, value: null });
    expect(local.map.size).toBe(0);
    const stuck = memoryStorage({ failRemove: true });
    put(stuck, ct());
    expect(tab(stuck).recover('2030-01-01T12:00:00Z')).toEqual({ ok: false, code: 'unavailable', reasonCode: 'recovery_cleanup_failed' });
    expect(stuck.map.size).toBe(1);
  });

  it('future-dated snapshot alone → clock behind, kept; future + valid → conflict, both kept', () => {
    const local = memoryStorage();
    const future = ct({ draftId: 'f', createdAt: '2030-01-01T07:00:00Z', expiresAt: '2030-01-01T08:00:00Z' });
    put(local, future);
    expect(tab(local).recover(NOW)).toEqual(behind);
    put(local, ct({ draftId: 'v' }));
    expect(tab(local).recover(NOW)).toEqual(conflict);
    expect(snapshots(local)).toHaveLength(2);
  });

  it('valid legacy single-slot draft + a snapshot → conflict; legacy is never rewritten', () => {
    const local = memoryStorage();
    const legacy = JSON.stringify(ct({ draftId: 'legacy' }));
    local.setItem(GUEST_DRAFT_KEY, legacy);
    put(local, ct({ draftId: 'new' }));
    expect(tab(local).recover(NOW)).toEqual(conflict);
    expect(local.map.get(GUEST_DRAFT_KEY)).toBe(legacy);
  });

  it('clear(event) removes this device\'s whole recovery scope: session, legacy and every snapshot', () => {
    const local = memoryStorage(), session = memoryStorage();
    const svc = createGuestRecoveryService({ session, local });
    svc.stash(draft({ draftId: 's' }));
    put(local, ct({ draftId: 'a' }));
    put(local, ct({ draftId: 'b' }));
    local.setItem(GUEST_DRAFT_KEY, JSON.stringify(ct({ draftId: 'legacy' })));
    local.setItem('unrelated.app.key', 'kept');
    expect(svc.clear('sign_out')).toEqual({ ok: true, value: null });
    expect([...local.map.keys()]).toEqual(['unrelated.app.key']);
    expect(session.map.size).toBe(0);
  });

  it('unsupported (non-enumerable) local store: cross-tab stash refused, nothing written; session mode still works', () => {
    const local = memoryStorage({ enumerable: false }), session = memoryStorage();
    const svc = createGuestRecoveryService({ session, local });
    expect(svc.stash(draft()).ok).toBe(true);
    expect(svc.stash(ct())).toEqual({ ok: false, code: 'unavailable', reasonCode: 'recovery_cross_tab_unsupported' });
    expect(local.map.size).toBe(0);
    expect(session.map.size).toBe(1); // session copy kept on refusal
    expect(svc.recover(NOW)).toEqual({ ok: true, value: draft() });
    expect(svc.clear('cancel')).toEqual({ ok: true, value: null });
  });

  it('unreadable local store: cross-tab stash typed unavailable, nothing written, session copy kept', () => {
    const local = memoryStorage({ failGet: true }), session = memoryStorage();
    const svc = createGuestRecoveryService({ session, local });
    svc.stash(draft());
    expect(svc.stash(ct())).toEqual({ ok: false, code: 'unavailable', reasonCode: 'recovery_storage_unavailable' });
    expect(local.map.size).toBe(0);
    expect(session.map.size).toBe(1);
  });

  it('quota failure on the snapshot write: typed unavailable, session copy kept', () => {
    const local = memoryStorage({ failSet: true }), session = memoryStorage();
    const svc = createGuestRecoveryService({ session, local });
    svc.stash(draft());
    expect(svc.stash(ct())).toEqual({ ok: false, code: 'unavailable', reasonCode: 'recovery_storage_unavailable' });
    expect(session.map.size).toBe(1);
  });
});

describe('stale decisions never delete a newer or different write (read→remove interleavings)', () => {
  it('expired-snapshot purge vs a fresh write of the same draftId by another tab', () => {
    const local = memoryStorage();
    const expired = ct({ draftId: 'd', createdAt: '2029-12-31T00:00:00Z', expiresAt: '2029-12-31T12:00:00Z' });
    const fresh = ct({ draftId: 'd', createdAt: '2030-01-01T05:00:00Z', expiresAt: '2030-01-01T17:00:00Z' });
    put(local, expired);
    const { store, state } = interleaved(local);
    state.hook = () => { expect(tab(local).stash(fresh).ok).toBe(true); }; // lands between X's read and remove
    expect(createGuestRecoveryService({ session: memoryStorage(), local: store }).recover(NOW)).toEqual({ ok: true, value: null });
    expect(snapshots(local)).toEqual([sharedDraftKey(fresh)]);
    expect(tab(local).recover(NOW)).toEqual({ ok: true, value: fresh });
  });

  it('save cleanup with a newer same-draftId snapshot already stored: exact copy removed, newer kept, reported not cleared', () => {
    const local = memoryStorage();
    const saved = ct({ draftId: 'd' });
    const newer = ct({ draftId: 'd', createdAt: '2030-01-01T05:00:00Z', expiresAt: '2030-01-01T17:00:00Z' });
    const svc = tab(local);
    svc.stash(saved);
    tab(local).stash(newer);
    expect(clearSavedGuestDraft(svc, saved, NOW)).toBe(false);
    expect(snapshots(local)).toEqual([sharedDraftKey(newer)]);
  });

  // The newer write lands after cleanup enumerated: cleanup can only report what it saw,
  // but it can never delete what it did not read (it removes one content-addressed key).
  it('save cleanup vs a newer same-draftId write landing mid-cleanup: exact copy removed, newer kept', () => {
    const local = memoryStorage();
    const saved = ct({ draftId: 'd' });
    const newer = ct({ draftId: 'd', createdAt: '2030-01-01T05:00:00Z', expiresAt: '2030-01-01T17:00:00Z' });
    const { store, state } = interleaved(local);
    const svc = createGuestRecoveryService({ session: memoryStorage(), local: store });
    svc.stash(saved);
    state.hook = () => { tab(local).stash(newer); };
    clearSavedGuestDraft(svc, saved, NOW);
    expect(snapshots(local)).toEqual([sharedDraftKey(newer)]);
  });

  it('save cleanup vs a different tab opting in concurrently: the other draft survives, reported cleared', () => {
    const local = memoryStorage();
    const saved = ct({ draftId: 'a' }), other = ct({ draftId: 'b' });
    const { store, state } = interleaved(local);
    const svc = createGuestRecoveryService({ session: memoryStorage(), local: store });
    svc.stash(saved);
    state.hook = () => { tab(local).stash(other); };
    expect(clearSavedGuestDraft(svc, saved, NOW)).toBe(true);
    expect(snapshots(local)).toEqual([sharedDraftKey(other)]);
  });

  it('corrupt-entry purge vs a concurrent opt-in by another tab', () => {
    const local = memoryStorage();
    local.setItem(`${SHARED_DRAFT_PREFIX}junk`, '{corrupt');
    const other = ct({ draftId: 'b' });
    const { store, state } = interleaved(local);
    state.hook = () => { tab(local).stash(other); };
    createGuestRecoveryService({ session: memoryStorage(), local: store }).recover(NOW);
    expect(snapshots(local)).toEqual([sharedDraftKey(other)]);
  });

  it('a cross-tab stash never reads-then-overwrites: concurrent different-ID stashes both persist', () => {
    const local = memoryStorage();
    const { store, state } = interleaved(local);
    const b = ct({ draftId: 'b' });
    state.hook = () => { expect(tab(local).stash(b).ok).toBe(true); };
    state.on = () => true;
    store.getItem('probe'); // any read by A may interleave with B's write
    expect(createGuestRecoveryService({ session: memoryStorage(), local: store }).stash(ct({ draftId: 'a' })).ok).toBe(true);
    expect(snapshots(local)).toHaveLength(2);
  });
});
