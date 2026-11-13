import { describe, expect, it } from 'vitest';
import { createGuestRecoveryService, GUEST_DRAFT_KEY } from '../../src/persistence/guestRecovery';
import { draft, memoryStorage } from './helpers';

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
  it('session stash leaves a corrupt shared entry for recover() to purge', () => {
    const { local, svc } = setup();
    local.setItem(GUEST_DRAFT_KEY, '{not json');
    expect(svc.stash(draft()).ok).toBe(true);
    expect(local.map.size).toBe(1);
    expect(svc.recover(NOW)).toEqual({ ok: true, value: draft() });
    expect(local.map.size).toBe(0);
  });
  it('session stash with an unrelated shared draft does not need removal (no failure when remove is blocked)', () => {
    const session = memoryStorage(), local = memoryStorage({ failRemove: true });
    local.setItem(GUEST_DRAFT_KEY, JSON.stringify({ ...crossTab(), draftId: 'tab-a' }));
    expect(createGuestRecoveryService({ session, local }).stash(draft({ draftId: 'tab-b' }))).toEqual({ ok: true, value: null });
    expect(local.map.size).toBe(1);
  });
  it('session stash reports cleanup failure when the shared slot cannot be read to verify ownership', () => {
    const session = memoryStorage(), local = memoryStorage({ failGet: true });
    expect(createGuestRecoveryService({ session, local }).stash(draft())).toEqual({ ok: false, code: 'unavailable', reasonCode: 'recovery_cleanup_failed' });
    expect(session.map.size).toBe(1);
  });
  it('explicit clear still removes another tab\'s shared draft', () => {
    const { local, svc } = setup();
    local.setItem(GUEST_DRAFT_KEY, JSON.stringify({ ...crossTab(), draftId: 'tab-a' }));
    expect(svc.clear('cancel')).toEqual({ ok: true, value: null });
    expect(local.map.size).toBe(0);
  });
  // Single shared slot: tab B opting in must not silently replace tab A's opted-in draft.
  describe('cross-tab stash never overwrites another draftId', () => {
    const tabA = () => ({ ...crossTab(), draftId: 'tab-a' });
    const tabBWith = (local: ReturnType<typeof memoryStorage>, session = memoryStorage()) => ({ session, svc: createGuestRecoveryService({ session, local }) });
    const conflict = { ok: false, code: 'conflict', reasonCode: 'recovery_shared_draft_exists' };

    it("returns typed conflict and preserves tab A's draft byte-for-byte and tab B's session copy", () => {
      const { local, svc } = setup();
      expect(svc.stash(tabA()).ok).toBe(true);
      const before = local.map.get(GUEST_DRAFT_KEY);
      const { session, svc: tabB } = tabBWith(local);
      expect(tabB.stash(draft({ draftId: 'tab-b' })).ok).toBe(true); // B's same-tab copy
      const bSession = session.map.get(GUEST_DRAFT_KEY);
      expect(tabB.stash({ ...crossTab(), draftId: 'tab-b' })).toEqual(conflict);
      expect(local.map.get(GUEST_DRAFT_KEY)).toBe(before);
      expect(session.map.get(GUEST_DRAFT_KEY)).toBe(bSession); // not moved/deleted on refusal
      expect(createGuestRecoveryService({ session: memoryStorage(), local }).recover(NOW)).toEqual({ ok: true, value: tabA() });
    });
    it('conflicts on an expired or future-dated foreign draft too (stash has no clock; recover/clear decide)', () => {
      for (const over of [{ createdAt: '2029-12-30T00:00:00Z', expiresAt: '2029-12-30T01:00:00Z' }, { createdAt: '2031-01-01T00:00:00Z', expiresAt: '2031-01-01T01:00:00Z' }]) {
        const local = memoryStorage();
        const foreign = JSON.stringify({ ...tabA(), ...over });
        local.setItem(GUEST_DRAFT_KEY, foreign);
        expect(tabBWith(local).svc.stash({ ...crossTab(), draftId: 'tab-b' })).toEqual(conflict);
        expect(local.map.get(GUEST_DRAFT_KEY)).toBe(foreign);
      }
    });
    it('after recover(now) purges an expired foreign draft, opt-in succeeds', () => {
      const local = memoryStorage();
      local.setItem(GUEST_DRAFT_KEY, JSON.stringify({ ...tabA(), createdAt: '2029-12-30T00:00:00Z', expiresAt: '2029-12-30T01:00:00Z' }));
      const { svc } = tabBWith(local);
      expect(svc.recover(NOW)).toEqual({ ok: true, value: null });
      expect(svc.stash({ ...crossTab(), draftId: 'tab-b' })).toEqual({ ok: true, value: null });
    });
    it('explicit clear then opt-in replaces it (user-chosen discard, not silent)', () => {
      const { local, svc } = setup();
      local.setItem(GUEST_DRAFT_KEY, JSON.stringify(tabA()));
      expect(svc.stash({ ...crossTab(), draftId: 'tab-b' })).toEqual(conflict);
      expect(svc.clear('cancel').ok).toBe(true);
      expect(svc.stash({ ...crossTab(), draftId: 'tab-b' })).toEqual({ ok: true, value: null });
      expect(JSON.parse(local.map.get(GUEST_DRAFT_KEY)!).draftId).toBe('tab-b');
    });
    it('same draftId updates the shared copy', () => {
      const { local, svc } = setup();
      expect(svc.stash(tabA()).ok).toBe(true);
      const updated = { ...tabA(), expiresAt: '2030-01-01T18:00:00Z' };
      expect(svc.stash(updated)).toEqual({ ok: true, value: null });
      expect(JSON.parse(local.map.get(GUEST_DRAFT_KEY)!)).toEqual(updated);
    });
    it('same draftId with an invalid update is rejected and the stored copy kept', () => {
      const { local, svc } = setup();
      svc.stash(tabA());
      const before = local.map.get(GUEST_DRAFT_KEY);
      expect(svc.stash({ ...tabA(), expiresAt: '2030-01-02T00:00:01Z' })).toMatchObject({ ok: false, code: 'validation_error' });
      expect(local.map.get(GUEST_DRAFT_KEY)).toBe(before);
    });
    it('replaces corrupt, wrong-version or misplaced (session-mode) shared entries', () => {
      for (const raw of ['{not json', JSON.stringify({ ...tabA(), schemaVersion: 2 }), JSON.stringify({ ...draft(), draftId: 'tab-a' })]) {
        const local = memoryStorage();
        local.setItem(GUEST_DRAFT_KEY, raw);
        expect(tabBWith(local).svc.stash({ ...crossTab(), draftId: 'tab-b' })).toEqual({ ok: true, value: null });
        expect(JSON.parse(local.map.get(GUEST_DRAFT_KEY)!).draftId).toBe('tab-b');
      }
    });
    it('unreadable shared slot: typed unavailable, nothing written, session copy kept', () => {
      const session = memoryStorage(), local = memoryStorage({ failGet: true });
      const svc = createGuestRecoveryService({ session, local });
      session.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft()));
      expect(svc.stash(crossTab())).toEqual({ ok: false, code: 'unavailable', reasonCode: 'recovery_storage_unavailable' });
      expect(local.map.size).toBe(0);
      expect(session.map.size).toBe(1);
    });
  });
  it('rejects lifetimes over 24h', () => {
    const { svc } = setup();
    expect(svc.stash({ ...crossTab(), expiresAt: '2030-01-02T00:00:01Z' }).ok).toBe(false);
  });
});

describe('recover validation deletes unusable entries', () => {
  const cases: Array<[string, (s: ReturnType<typeof setup>) => void]> = [
    ['expired', s => s.session.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft({ expiresAt: '2030-01-01T05:00:00Z' })))],
    ['corrupt future-dated (invalid lifetime)', s => s.session.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft({ createdAt: '2030-01-01T08:00:00Z', expiresAt: '2030-01-01T07:00:00Z' })))],
    ['misplaced future-dated', s => s.local.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft({ createdAt: '2030-01-01T07:00:00Z', expiresAt: '2030-01-01T08:00:00Z' })))],
    ['corrupt JSON', s => s.session.setItem(GUEST_DRAFT_KEY, '{not json')],
    ['wrong version', s => s.session.setItem(GUEST_DRAFT_KEY, JSON.stringify({ ...draft(), schemaVersion: 2 }))],
    ['session-mode draft planted in localStorage', s => s.local.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft()))],
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
  // cross-tab opt-in left a localStorage copy that has since expired. Returning the session
  // draft must not leave the expired shared copy on disk.
  const expiredCrossTab = () => JSON.stringify({ ...crossTab(), expiresAt: '2030-01-01T05:00:00Z' });
  it('purges an expired cross-tab copy even when a valid session draft wins', () => {
    const s = setup();
    s.session.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft()));
    s.local.setItem(GUEST_DRAFT_KEY, expiredCrossTab());
    expect(s.svc.recover(NOW)).toEqual({ ok: true, value: draft() });
    expect(s.local.map.size).toBe(0);
    expect(s.session.map.size).toBe(1);
  });
  it('purges a corrupt cross-tab copy even when a valid session draft wins', () => {
    const s = setup();
    s.session.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft()));
    s.local.setItem(GUEST_DRAFT_KEY, '{not json');
    expect(s.svc.recover(NOW)).toEqual({ ok: true, value: draft() });
    expect(s.local.map.size).toBe(0);
  });
  it('keeps a still-valid cross-tab copy for other tabs when the session draft wins', () => {
    const s = setup();
    s.session.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft()));
    s.local.setItem(GUEST_DRAFT_KEY, JSON.stringify(crossTab()));
    expect(s.svc.recover(NOW)).toEqual({ ok: true, value: draft() });
    expect(s.local.map.size).toBe(1);
  });
  it('reports failed purge of the expired shared copy instead of silently leaving it', () => {
    const session = memoryStorage(), local = memoryStorage({ failRemove: true });
    session.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft()));
    local.setItem(GUEST_DRAFT_KEY, expiredCrossTab());
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
  it('expired is still deleted (no TTL grace): boundary at expiresAt', () => {
    const s = setup();
    s.local.setItem(GUEST_DRAFT_KEY, JSON.stringify(crossTab()));
    expect(s.svc.recover('2030-01-01T12:00:00Z')).toEqual({ ok: true, value: null });
    expect(s.local.map.size).toBe(0);
  });
  it('rejects an invalid clock', () => {
    expect(setup().svc.recover('yesterday')).toMatchObject({ ok: false, reasonCode: 'invalid_clock' });
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
