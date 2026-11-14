import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { createGuestRecoveryService, GUEST_DRAFT_KEY, SHARED_DRAFT_PREFIX } from '../../src/persistence/guestRecovery';
import { draft, memoryStorage } from './helpers';

/** Plants raw bytes as a correctly addressed cross-tab snapshot (content may still be unusable). */
const plantSnap = (local: ReturnType<typeof memoryStorage>, raw: string, id = 'draft-1') =>
  local.setItem(`${SHARED_DRAFT_PREFIX}${id}.${bytesToHex(sha256(new TextEncoder().encode(raw)))}`, raw);

const setup = (opts: Parameters<typeof memoryStorage>[0] = {}) => {
  const session = memoryStorage(opts), local = memoryStorage(opts);
  return { session, local, svc: createGuestRecoveryService({ session, local }) };
};
const NOW = '2030-01-01T06:00:00Z';
const crossTab = () => draft({ mode: 'cross_tab_opt_in', explicitRecoveryConsent: true });

describe('same-tab session recovery', () => {
  it('survives refresh / failed OTP in sessionStorage only', () => {
    const { session, local, svc } = setup();
    expect(svc.stash(draft())).toEqual({ ok: true, value: null });
    expect(session.map.has(GUEST_DRAFT_KEY)).toBe(true);
    expect(local.map.size).toBe(0);
    // simulate reload: a new service instance over the same storage
    const reloaded = createGuestRecoveryService({ session, local });
    expect(reloaded.recover(NOW)).toEqual({ ok: true, value: draft() });
  });
  it('stores structured data only (no PDF, quotes or extra fields)', () => {
    const { session, svc } = setup();
    expect(svc.stash({ ...draft(), rawPdf: 'x' } as never)).toMatchObject({ ok: false, reasonCode: 'invalid_guest_draft' });
    const d = draft();
    const pdfNote = { ...d, plan: { ...d.plan, availabilityEvidence: d.plan.availabilityEvidence.map(e => ({ ...e, notes: '%PDF-1.7 ...' })) } };
    expect(svc.stash(pdfNote)).toMatchObject({ ok: false, reasonCode: 'raw_document_content' });
    expect(session.map.size).toBe(0);
  });
});

describe('cross-tab opt-in recovery', () => {
  it('requires explicit opt-in; declined opt-in writes nothing to localStorage', () => {
    const { local, svc } = setup();
    expect(svc.stash(draft({ mode: 'cross_tab_opt_in', explicitRecoveryConsent: false }))).toMatchObject({ ok: false, reasonCode: 'invalid_guest_draft' });
    expect(local.map.size).toBe(0);
  });
  it('is readable from a second tab (shared localStorage, separate sessionStorage)', () => {
    const { local, svc } = setup();
    expect(svc.stash(crossTab()).ok).toBe(true);
    const otherTab = createGuestRecoveryService({ session: memoryStorage(), local });
    expect(otherTab.recover(NOW)).toEqual({ ok: true, value: crossTab() });
  });
  it('keeps exactly one copy: switching modes removes the other slot', () => {
    const { session, local, svc } = setup();
    svc.stash(crossTab());
    expect(local.map.size).toBe(1);
    svc.stash(draft()); // user revokes cross-tab opt-in
    expect(local.map.size).toBe(0);
    expect(session.map.size).toBe(1);
    svc.stash(crossTab());
    expect(session.map.size).toBe(0);
  });
  // G independent review #6: a routine session-mode stash in tab B (never opted in) must
  // not delete tab A's opted-in cross-tab draft. Stash is not an approved clear event.
  it("session stash in another tab preserves an unrelated tab's valid cross-tab draft", () => {
    const { local, svc: tabA } = setup();
    expect(tabA.stash({ ...crossTab(), draftId: 'tab-a' }).ok).toBe(true);
    const before = local.map.get(GUEST_DRAFT_KEY);
    const tabB = createGuestRecoveryService({ session: memoryStorage(), local });
    expect(tabB.stash(draft({ draftId: 'tab-b' }))).toEqual({ ok: true, value: null });
    expect(local.map.get(GUEST_DRAFT_KEY)).toBe(before);
    expect(createGuestRecoveryService({ session: memoryStorage(), local }).recover(NOW)).toEqual({ ok: true, value: { ...crossTab(), draftId: 'tab-a' } });
  });
  it('downgrade of the same draftId removes its own shared copy', () => {
    const { session, local, svc } = setup();
    svc.stash({ ...crossTab(), draftId: 'd' });
    expect(svc.stash(draft({ draftId: 'd' }))).toEqual({ ok: true, value: null });
    expect(local.map.size).toBe(0);
    expect(session.map.size).toBe(1);
  });
  it('session stash leaves a corrupt legacy entry; recover returns the session draft and never auto-deletes legacy', () => {
    const { local, svc } = setup();
    local.setItem(GUEST_DRAFT_KEY, '{not json');
    expect(svc.stash(draft()).ok).toBe(true);
    expect(svc.recover(NOW)).toEqual({ ok: true, value: draft() });
    expect(local.map.get(GUEST_DRAFT_KEY)).toBe('{not json');
  });
  it('session stash with an unrelated shared draft does not need removal (no failure when remove is blocked)', () => {
    const session = memoryStorage(), local = memoryStorage({ failRemove: true });
    local.setItem(GUEST_DRAFT_KEY, JSON.stringify({ ...crossTab(), draftId: 'tab-a' }));
    expect(createGuestRecoveryService({ session, local }).stash(draft({ draftId: 'tab-b' }))).toEqual({ ok: true, value: null });
    expect(local.map.size).toBe(1);
  });
  it('session stash needs no shared-slot read: an unreadable localStorage does not fail it', () => {
    const session = memoryStorage(), local = memoryStorage({ failGet: true });
    expect(createGuestRecoveryService({ session, local }).stash(draft())).toEqual({ ok: true, value: null });
    expect(session.map.size).toBe(1);
  });
  it('explicit clear still removes another tab\'s shared draft', () => {
    const { local, svc } = setup();
    local.setItem(GUEST_DRAFT_KEY, JSON.stringify({ ...crossTab(), draftId: 'tab-a' }));
    expect(svc.clear('cancel')).toEqual({ ok: true, value: null });
    expect(local.map.size).toBe(0);
  });
  // Cross-tab snapshot semantics: tests/persistence/guestRecoverySnapshots.test.ts
  it('rejects lifetimes over 24h', () => {
    const { svc } = setup();
    expect(svc.stash({ ...crossTab(), expiresAt: '2030-01-02T00:00:01Z' }).ok).toBe(false);
  });
});

describe('recover validation deletes unusable entries', () => {
  const cases: Array<[string, (s: ReturnType<typeof setup>) => void]> = [
    ['expired', s => s.session.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft({ expiresAt: '2030-01-01T05:00:00Z' })))],
    ['corrupt future-dated (invalid lifetime)', s => s.session.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft({ createdAt: '2030-01-01T08:00:00Z', expiresAt: '2030-01-01T07:00:00Z' })))],
    ['misplaced future-dated snapshot', s => plantSnap(s.local, JSON.stringify(draft({ createdAt: '2030-01-01T07:00:00Z', expiresAt: '2030-01-01T08:00:00Z' })))],
    ['corrupt JSON', s => s.session.setItem(GUEST_DRAFT_KEY, '{not json')],
    ['wrong version', s => s.session.setItem(GUEST_DRAFT_KEY, JSON.stringify({ ...draft(), schemaVersion: 2 }))],
    ['session-mode draft planted as a snapshot', s => plantSnap(s.local, JSON.stringify(draft()))],
    ['expired cross-tab snapshot', s => plantSnap(s.local, JSON.stringify({ ...crossTab(), expiresAt: '2030-01-01T05:00:00Z' }))],
    ['cross-tab draft planted in sessionStorage', s => s.session.setItem(GUEST_DRAFT_KEY, JSON.stringify(crossTab()))],
  ];
  for (const [name, plant] of cases) {
    it(name, () => {
      const s = setup();
      plant(s);
      expect(s.svc.recover(NOW)).toEqual({ ok: true, value: null });
      expect(s.session.map.size + s.local.map.size).toBe(0);
    });
  }
  // G review blocker: cleanup failure must never be reported as success/null.
  for (const [name, plant] of cases) {
    it(`${name}: failed deletion is a typed failure, not "nothing to recover"`, () => {
      const s = setup({ failRemove: true });
      plant(s);
      expect(s.svc.recover(NOW)).toEqual({ ok: false, code: 'unavailable', reasonCode: 'recovery_cleanup_failed' });
      expect(s.session.map.size + s.local.map.size).toBe(1); // still on disk, and we said so
    });
  }
  // Shared device: this tab has a valid session draft, while another tab's earlier
  // cross-tab opt-in left a snapshot that has since expired or is corrupt: it is purged
  // (exact content-addressed key) even though the session draft wins.
  const expiredCrossTab = () => JSON.stringify({ ...crossTab(), expiresAt: '2030-01-01T05:00:00Z' });
  it('purges an expired snapshot even when a valid session draft wins', () => {
    const s = setup();
    s.session.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft()));
    plantSnap(s.local, expiredCrossTab());
    expect(s.svc.recover(NOW)).toEqual({ ok: true, value: draft() });
    expect(s.local.map.size).toBe(0);
    expect(s.session.map.size).toBe(1);
  });
  it('purges a corrupt snapshot even when a valid session draft wins', () => {
    const s = setup();
    s.session.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft()));
    plantSnap(s.local, '{not json');
    expect(s.svc.recover(NOW)).toEqual({ ok: true, value: draft() });
    expect(s.local.map.size).toBe(0);
  });
  it('keeps a still-valid shared copy for other tabs when the session draft wins', () => {
    const s = setup();
    s.session.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft()));
    s.local.setItem(GUEST_DRAFT_KEY, JSON.stringify(crossTab()));
    plantSnap(s.local, JSON.stringify({ ...crossTab(), draftId: 'other' }), 'other');
    expect(s.svc.recover(NOW)).toEqual({ ok: true, value: draft() });
    expect(s.local.map.size).toBe(2);
  });
  it('reports failed purge of an expired snapshot instead of silently leaving it', () => {
    const session = memoryStorage(), local = memoryStorage({ failRemove: true });
    session.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft()));
    plantSnap(local, expiredCrossTab());
    const svc = createGuestRecoveryService({ session, local });
    expect(svc.recover(NOW)).toEqual({ ok: false, code: 'unavailable', reasonCode: 'recovery_cleanup_failed' });
    expect(session.map.size).toBe(1); // the valid session draft is not destroyed
  });
  it('still returns the session draft when localStorage cannot be read', () => {
    const session = memoryStorage(), local = memoryStorage({ failGet: true });
    session.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft()));
    expect(createGuestRecoveryService({ session, local }).recover(NOW)).toEqual({ ok: true, value: draft() });
  });
  // G independent review #7: a stale/skewed caller clock must not delete a valid draft
  // another tab just created. Kept on disk, typed unavailable (not null), no TTL grace.
  const future = { createdAt: '2030-01-01T07:00:00Z', expiresAt: '2030-01-01T08:00:00Z' };
  const behind = { ok: false, code: 'unavailable', reasonCode: 'recovery_clock_behind_draft' };
  it('keeps a future-dated otherwise-valid cross-tab draft and returns typed unavailable', () => {
    const s = setup();
    const fresh = JSON.stringify({ ...crossTab(), ...future });
    s.local.setItem(GUEST_DRAFT_KEY, fresh);
    expect(s.svc.recover(NOW)).toEqual(behind);
    expect(s.local.map.get(GUEST_DRAFT_KEY)).toBe(fresh);
    // once the clock catches up the same draft is recoverable
    expect(s.svc.recover('2030-01-01T07:30:00Z')).toEqual({ ok: true, value: { ...crossTab(), ...future } });
  });
  it('keeps a future-dated session draft and does not fall back to the shared draft', () => {
    const s = setup();
    const own = JSON.stringify(draft({ draftId: 'mine', ...future }));
    s.session.setItem(GUEST_DRAFT_KEY, own);
    s.local.setItem(GUEST_DRAFT_KEY, JSON.stringify(crossTab()));
    expect(s.svc.recover(NOW)).toEqual(behind);
    expect(s.session.map.get(GUEST_DRAFT_KEY)).toBe(own);
    expect(s.local.map.size).toBe(1);
  });
  it('a valid session draft still wins over a future-dated shared draft, which is kept', () => {
    const s = setup();
    s.session.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft()));
    s.local.setItem(GUEST_DRAFT_KEY, JSON.stringify({ ...crossTab(), draftId: 'other', ...future }));
    expect(s.svc.recover(NOW)).toEqual({ ok: true, value: draft() });
    expect(s.local.map.size).toBe(1);
  });
  it('expired snapshot is still deleted (no TTL grace): boundary at expiresAt', () => {
    const s = setup();
    plantSnap(s.local, JSON.stringify(crossTab()));
    expect(s.svc.recover('2030-01-01T12:00:00Z')).toEqual({ ok: true, value: null });
    expect(s.local.map.size).toBe(0);
  });
  it('rejects an invalid clock', () => {
    expect(setup().svc.recover('yesterday')).toMatchObject({ ok: false, reasonCode: 'invalid_clock' });
  });
});

// The legacy single local slot is mutable and may be rewritten by a pre-snapshot build in
// another tab, so automatic recover() never deletes it. Unusable legacy entries are
// retained and reported as typed cleanup failure (never "nothing to recover"); only an
// explicit whole-scope clear(event) removes them.
describe('legacy single-slot entries are never auto-deleted', () => {
  const unusable: Array<[string, string]> = [
    ['expired', JSON.stringify({ ...crossTab(), expiresAt: '2030-01-01T05:00:00Z' })],
    ['corrupt JSON', '{not json'],
    ['wrong version', JSON.stringify({ ...crossTab(), schemaVersion: 2 })],
    ['misplaced session-mode', JSON.stringify(draft())],
  ];
  for (const [name, raw] of unusable) {
    it(`${name}: retained byte-for-byte, typed cleanup failure; explicit clear removes it`, () => {
      const s = setup();
      s.local.setItem(GUEST_DRAFT_KEY, raw);
      expect(s.svc.recover(NOW)).toEqual({ ok: false, code: 'unavailable', reasonCode: 'recovery_cleanup_failed' });
      expect(s.local.map.get(GUEST_DRAFT_KEY)).toBe(raw);
      expect(s.svc.clear('cancel')).toEqual({ ok: true, value: null });
      expect(s.local.map.size).toBe(0);
    });
  }
  it('a single valid snapshot is still recovered while an unusable legacy entry is retained', () => {
    const s = setup();
    s.local.setItem(GUEST_DRAFT_KEY, '{not json');
    plantSnap(s.local, JSON.stringify({ ...crossTab(), draftId: 'snap' }), 'snap');
    expect(s.svc.recover(NOW)).toEqual({ ok: true, value: { ...crossTab(), draftId: 'snap' } });
    expect(s.local.map.get(GUEST_DRAFT_KEY)).toBe('{not json');
  });
  it('valid legacy at its expiry boundary is retained, not deleted', () => {
    const s = setup();
    const raw = JSON.stringify(crossTab());
    s.local.setItem(GUEST_DRAFT_KEY, raw);
    expect(s.svc.recover('2030-01-01T12:00:00Z')).toEqual({ ok: false, code: 'unavailable', reasonCode: 'recovery_cleanup_failed' });
    expect(s.local.map.get(GUEST_DRAFT_KEY)).toBe(raw);
  });
});

describe('clear events and storage failures', () => {
  it('clears both slots on save, cancel, expiry and sign_out', () => {
    for (const event of ['save', 'cancel', 'expiry', 'sign_out'] as const) {
      const { session, local, svc } = setup();
      session.setItem(GUEST_DRAFT_KEY, 'x');
      local.setItem(GUEST_DRAFT_KEY, 'y');
      expect(svc.clear(event)).toEqual({ ok: true, value: null });
      expect(session.map.size + local.map.size).toBe(0);
    }
    expect(setup().svc.clear('logout' as never)).toMatchObject({ ok: false, reasonCode: 'invalid_clear_event' });
  });
  it('returns typed unavailable when storage is blocked or full', () => {
    expect(setup({ failSet: true }).svc.stash(draft())).toEqual({ ok: false, code: 'unavailable', reasonCode: 'recovery_storage_unavailable' });
    expect(setup({ failGet: true }).svc.recover(NOW)).toEqual({ ok: false, code: 'unavailable', reasonCode: 'recovery_storage_unavailable' });
    expect(createGuestRecoveryService({ session: null, local: null }).stash(draft())).toMatchObject({ ok: false, code: 'unavailable' });
    expect(createGuestRecoveryService({ session: null, local: null }).recover(NOW)).toEqual({ ok: true, value: null });
  });
  it('clear reports a failed removal instead of claiming the draft was cleared', () => {
    const session = memoryStorage(), local = memoryStorage({ failRemove: true });
    const svc = createGuestRecoveryService({ session, local });
    local.map.set(GUEST_DRAFT_KEY, 'y');
    session.map.set(GUEST_DRAFT_KEY, 'x');
    expect(svc.clear('sign_out')).toEqual({ ok: false, code: 'unavailable', reasonCode: 'recovery_cleanup_failed' });
    expect(session.map.size).toBe(0); // the removable slot is still cleared
    expect(local.map.size).toBe(1);
  });
  it('stash reports failure when revoking cross-tab opt-in cannot delete the localStorage copy', () => {
    const session = memoryStorage(), local = memoryStorage({ failRemove: true });
    const svc = createGuestRecoveryService({ session, local });
    expect(svc.stash(crossTab()).ok).toBe(true);
    expect(svc.stash(draft())).toEqual({ ok: false, code: 'unavailable', reasonCode: 'recovery_cleanup_failed' });
  });
});
