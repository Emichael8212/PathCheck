import { describe, expect, it } from 'vitest';
import { createGuestRecoveryService } from '../../src/persistence/guestRecovery';
import { createSupabaseStorage } from '../../src/persistence/supabaseStorage';
import { executeSaveIntent, saveGuestDraftAsNew } from '../../src/persistence/saveFlows';
import { CONFIG, PLAN_ID, USER_A, deferredFetch, draft, fakeFetch, fixture, flush, memoryStorage, row, sessionFor } from './helpers';
import type { Responder } from './helpers';
import type { GuestDraft, GuestRecoveryService } from '../../src/contracts';

const deps = (responder: Responder) => {
  const f = fakeFetch(responder);
  const session = memoryStorage(), local = memoryStorage();
  return { calls: f.calls, session, storage: createSupabaseStorage(CONFIG, { fetch: f.fetch, session: sessionFor(USER_A) }), recovery: createGuestRecoveryService({ session, local }) };
};

describe('guest → account Save as new', () => {
  it('always creates a new plan, then clears recovery', async () => {
    const d = deps(() => ({ status: 200, body: { status: 'ok', plan: row() } }));
    d.recovery.stash(draft());
    // Clock pinned inside the fixture's lifetime. (Previously this used the real clock, so
    // the 2030 fixture was "future-dated" and deleted — the bug fixed by G review #7.)
    const r = await saveGuestDraftAsNew(draft(), { ...d, now: () => '2030-01-01T06:00:00Z' });
    expect(r.ok && r.value.saved.id).toBe(PLAN_ID);
    expect(r.ok && r.value.recoveryCleared).toBe(true);
    expect(d.calls.map(c => c.url)).toEqual([`${CONFIG.url}/rest/v1/rpc/create_plan`]);
    expect(d.session.map.size).toBe(0);
  });
  it('does not clear a draft that is ahead of the caller clock after a save', async () => {
    const d = deps(() => ({ status: 200, body: { status: 'ok', plan: row() } }));
    d.recovery.stash(draft());
    const r = await saveGuestDraftAsNew(draft(), { ...d, now: () => '2029-12-31T23:00:00Z' });
    expect(r).toMatchObject({ ok: true, value: { saved: { id: PLAN_ID }, recoveryCleared: false } });
    expect(d.session.map.size).toBe(1);
  });
  it('does not clear a newer draft stashed while the save was in flight', async () => {
    const f = deferredFetch();
    const session = memoryStorage(), local = memoryStorage();
    const recovery = createGuestRecoveryService({ session, local });
    const storage = createSupabaseStorage(CONFIG, { fetch: f.fetch, session: sessionFor(USER_A) });
    recovery.stash(draft());
    const saving = saveGuestDraftAsNew(draft(), { storage, recovery, now: () => '2030-01-01T06:00:00Z' });
    await flush();
    const edited = draft({ draftId: 'draft-2' });
    expect(recovery.stash(edited).ok).toBe(true);
    await f.release('create_plan', { status: 200, body: { status: 'ok', plan: row() } });
    const r = await saving;
    expect(r.ok && r.value.recoveryCleared).toBe(false);
    expect(recovery.recover('2030-01-01T06:00:00Z')).toEqual({ ok: true, value: edited });
  });
  it('reports recoveryCleared=false when deletion fails after a successful save', async () => {
    const f = fakeFetch(() => ({ status: 200, body: { status: 'ok', plan: row() } }));
    const session = memoryStorage({ failRemove: true });
    const recovery = createGuestRecoveryService({ session, local: memoryStorage() });
    recovery.stash(draft());
    const storage = createSupabaseStorage(CONFIG, { fetch: f.fetch, session: sessionFor(USER_A) });
    const r = await saveGuestDraftAsNew(draft(), { storage, recovery, now: () => '2030-01-01T06:00:00Z' });
    expect(r.ok && r.value.recoveryCleared).toBe(false);
  });
  it('preserves recovery (never clears) when it cannot be read after a successful save', async () => {
    const f = fakeFetch(() => ({ status: 200, body: { status: 'ok', plan: row() } }));
    const storage = createSupabaseStorage(CONFIG, { fetch: f.fetch, session: sessionFor(USER_A) });
    let clearCalls = 0;
    const recovery: GuestRecoveryService = {
      stash: () => ({ ok: true, value: null }),
      recover: () => ({ ok: false, code: 'unavailable', reasonCode: 'recovery_storage_unavailable' }),
      clear: () => { clearCalls++; return { ok: true, value: null }; },
    };
    const r = await saveGuestDraftAsNew(draft(), { storage, recovery, now: () => '2030-01-01T06:00:00Z' });
    expect(r).toMatchObject({ ok: true, value: { saved: { id: PLAN_ID }, recoveryCleared: false } });
    expect(clearCalls).toBe(0);
  });
  it('keeps saved success and does not clear when the recovery port throws or returns an invalid draft', async () => {
    const f = fakeFetch(() => ({ status: 200, body: { status: 'ok', plan: row() } }));
    const storage = createSupabaseStorage(CONFIG, { fetch: f.fetch, session: sessionFor(USER_A) });
    let clearCalls = 0;
    const clear = () => { clearCalls++; return { ok: true as const, value: null }; };
    const stash = () => ({ ok: true as const, value: null });
    const throwing: GuestRecoveryService = { stash, clear, recover: () => { throw new Error('storage blew up'); } };
    const invalid: GuestRecoveryService = { stash, clear, recover: () => ({ ok: true, value: { not: 'a draft' } as unknown as GuestDraft }) };
    for (const recovery of [throwing, invalid]) {
      const r = await saveGuestDraftAsNew(draft(), { storage, recovery, now: () => '2030-01-01T06:00:00Z' });
      expect(r).toMatchObject({ ok: true, value: { saved: { id: PLAN_ID }, recoveryCleared: false } });
    }
    const throwingClear: GuestRecoveryService = { stash, recover: () => ({ ok: true, value: null }), clear: () => { throw new Error('remove blew up'); } };
    expect(await saveGuestDraftAsNew(draft(), { storage, recovery: throwingClear, now: () => '2030-01-01T06:00:00Z' }))
      .toMatchObject({ ok: true, value: { saved: { id: PLAN_ID }, recoveryCleared: false } });
    expect(clearCalls).toBe(0);
  });
  it('retains the guest draft when the cloud save fails', async () => {
    const d = deps(() => 'throw');
    d.recovery.stash(draft());
    expect(await saveGuestDraftAsNew(draft(), d)).toMatchObject({ ok: false, code: 'external_failure' });
    expect(d.recovery.recover('2030-01-01T06:00:00Z')).toEqual({ ok: true, value: draft() });
  });
});

// A4 regression: actual saveGuestDraftAsNew + actual createGuestRecoveryService. Only the
// cloud create is a fake HTTP double. A save may remove only stored copies byte-identical
// to the saved draft; unrelated (other draftId) and newer (same draftId, other content)
// drafts must survive, and cleanup failures must be reported, never claimed cleared.
describe('save-triggered recovery cleanup is scoped to the saved draft (A4)', () => {
  const NOW = '2030-01-01T06:00:00Z';
  const KEY = 'pathcheck.guestDraft.v1';
  const ok = () => ({ status: 200, body: { status: 'ok', plan: row() } });
  const crossTab = (over: Partial<GuestDraft> = {}) => draft({ mode: 'cross_tab_opt_in', explicitRecoveryConsent: true, ...over });
  const setup = (opts: { session?: Parameters<typeof memoryStorage>[0]; local?: Parameters<typeof memoryStorage>[0] } = {}) => {
    const f = fakeFetch(ok);
    const session = memoryStorage(opts.session), local = memoryStorage(opts.local);
    return { f, session, local, storage: createSupabaseStorage(CONFIG, { fetch: f.fetch, session: sessionFor(USER_A) }), recovery: createGuestRecoveryService({ session, local }) };
  };
  const put = (s: ReturnType<typeof memoryStorage>, d: unknown) => s.map.set(KEY, typeof d === 'string' ? d : JSON.stringify(d));

  it('session draft A + unrelated valid cross-tab draft B: saves A, removes only A, keeps B byte-for-byte', async () => {
    const t = setup();
    const a = draft({ draftId: 'tab-a' }), b = crossTab({ draftId: 'tab-b' });
    expect(t.recovery.stash(a).ok).toBe(true);
    put(t.local, b);
    const bBytes = t.local.map.get(KEY);
    const r = await saveGuestDraftAsNew(a, { storage: t.storage, recovery: t.recovery, now: () => NOW });
    expect(r).toMatchObject({ ok: true, value: { saved: { id: PLAN_ID }, recoveryCleared: true } });
    expect(t.f.calls.map(c => c.url.split('/').pop())).toEqual(['create_plan']);
    expect(t.session.map.size).toBe(0);
    expect(t.local.map.get(KEY)).toBe(bBytes);
    expect(createGuestRecoveryService({ session: memoryStorage(), local: t.local }).recover(NOW)).toEqual({ ok: true, value: b });
  });

  it('never attempts to remove an unrelated draft (removal would throw if attempted)', async () => {
    const t = setup({ local: { failRemove: true } });
    const a = draft({ draftId: 'tab-a' });
    t.recovery.stash(a);
    put(t.local, crossTab({ draftId: 'tab-b' }));
    const r = await saveGuestDraftAsNew(a, { storage: t.storage, recovery: t.recovery, now: () => NOW });
    expect(r).toMatchObject({ ok: true, value: { recoveryCleared: true } });
    expect(t.local.map.has(KEY)).toBe(true);
  });

  it('saved cross-tab draft A with no session copy: removes the shared copy', async () => {
    const t = setup();
    const a = crossTab({ draftId: 'tab-a' });
    expect(t.recovery.stash(a).ok).toBe(true);
    const r = await saveGuestDraftAsNew(a, { storage: t.storage, recovery: t.recovery, now: () => NOW });
    expect(r).toMatchObject({ ok: true, value: { recoveryCleared: true } });
    expect(t.local.map.size + t.session.map.size).toBe(0);
  });

  it('saved cross-tab draft A + unrelated session draft in this storage: keeps the session draft and reports not cleared', async () => {
    const t = setup();
    const a = crossTab({ draftId: 'tab-a' }), other = draft({ draftId: 'tab-s' });
    put(t.local, a);
    put(t.session, other);
    const r = await saveGuestDraftAsNew(a, { storage: t.storage, recovery: t.recovery, now: () => NOW });
    expect(r).toMatchObject({ ok: true, value: { recoveryCleared: false } });
    expect(t.local.map.size).toBe(0);
    expect(JSON.parse(t.session.map.get(KEY)!)).toEqual(other);
  });

  it('same draftId, newer content in the shared slot (edited in another tab) is preserved', async () => {
    const t = setup();
    const a = draft({ draftId: 'tab-a' });
    const newer = crossTab({ draftId: 'tab-a', expiresAt: '2030-01-01T18:00:00Z' });
    put(t.session, a);
    put(t.local, newer);
    const r = await saveGuestDraftAsNew(a, { storage: t.storage, recovery: t.recovery, now: () => NOW });
    expect(r).toMatchObject({ ok: true, value: { recoveryCleared: false } });
    expect(t.session.map.size).toBe(0);
    expect(JSON.parse(t.local.map.get(KEY)!)).toEqual(newer);
  });

  it('same draftId, newer session edit stashed in flight + unrelated shared B: both preserved', async () => {
    const f = deferredFetch();
    const session = memoryStorage(), local = memoryStorage();
    const recovery = createGuestRecoveryService({ session, local });
    const storage = createSupabaseStorage(CONFIG, { fetch: f.fetch, session: sessionFor(USER_A) });
    const a = draft({ draftId: 'tab-a' }), b = crossTab({ draftId: 'tab-b' });
    recovery.stash(a);
    put(local, b);
    const saving = saveGuestDraftAsNew(a, { storage, recovery, now: () => NOW });
    await flush();
    const edited = draft({ draftId: 'tab-a', expiresAt: '2030-01-01T11:00:00Z' });
    expect(recovery.stash(edited).ok).toBe(true);
    await f.release('create_plan', ok());
    expect(await saving).toMatchObject({ ok: true, value: { recoveryCleared: false } });
    expect(JSON.parse(session.map.get(KEY)!)).toEqual(edited);
    expect(JSON.parse(local.map.get(KEY)!)).toEqual(b);
  });

  it('nothing stored, or only an unrelated shared draft: nothing removed, reported cleared', async () => {
    const empty = setup();
    expect(await saveGuestDraftAsNew(draft(), { storage: empty.storage, recovery: empty.recovery, now: () => NOW })).toMatchObject({ ok: true, value: { recoveryCleared: true } });
    const t = setup();
    const b = crossTab({ draftId: 'tab-b' });
    put(t.local, b);
    expect(await saveGuestDraftAsNew(draft({ draftId: 'tab-a' }), { storage: t.storage, recovery: t.recovery, now: () => NOW })).toMatchObject({ ok: true, value: { recoveryCleared: true } });
    expect(JSON.parse(t.local.map.get(KEY)!)).toEqual(b);
  });

  it('keeps a future-dated unrelated shared draft and an expired saved copy is still removed', async () => {
    const t = setup();
    const a = draft({ draftId: 'tab-a', createdAt: '2029-12-31T00:00:00Z', expiresAt: '2029-12-31T12:00:00Z' }); // expired at NOW
    const future = crossTab({ draftId: 'tab-b', createdAt: '2030-01-01T07:00:00Z', expiresAt: '2030-01-01T19:00:00Z' });
    put(t.session, a);
    put(t.local, future);
    const r = await saveGuestDraftAsNew(a, { storage: t.storage, recovery: t.recovery, now: () => NOW });
    expect(r).toMatchObject({ ok: true, value: { recoveryCleared: true } });
    expect(t.session.map.size).toBe(0);
    expect(JSON.parse(t.local.map.get(KEY)!)).toEqual(future);
  });

  it('purges an expired or corrupt unrelated shared entry (privacy), keeping saved success', async () => {
    for (const stale of [crossTab({ draftId: 'tab-b', createdAt: '2029-12-31T00:00:00Z', expiresAt: '2029-12-31T12:00:00Z' }), '{corrupt', { schemaVersion: 2 }]) {
      const t = setup();
      const a = draft({ draftId: 'tab-a' });
      t.recovery.stash(a);
      put(t.local, stale);
      const r = await saveGuestDraftAsNew(a, { storage: t.storage, recovery: t.recovery, now: () => NOW });
      expect(r).toMatchObject({ ok: true, value: { recoveryCleared: true } });
      expect(t.local.map.size + t.session.map.size).toBe(0);
    }
  });

  it('reports truthful failure: saved copy removal fails, shared slot unreadable, or expired purge fails', async () => {
    const a = draft({ draftId: 'tab-a' });
    const failRemove = setup({ session: { failRemove: true } });
    put(failRemove.session, a);
    expect(await saveGuestDraftAsNew(a, { storage: failRemove.storage, recovery: failRemove.recovery, now: () => NOW })).toMatchObject({ ok: true, value: { recoveryCleared: false } });
    expect(failRemove.session.map.size).toBe(1);

    const unreadable = setup({ local: { failGet: true } });
    put(unreadable.session, a);
    expect(await saveGuestDraftAsNew(a, { storage: unreadable.storage, recovery: unreadable.recovery, now: () => NOW })).toMatchObject({ ok: true, value: { recoveryCleared: false } });
    expect(unreadable.session.map.size).toBe(0); // verified own copy still removed

    const stuck = setup({ local: { failRemove: true } });
    put(stuck.session, a);
    put(stuck.local, crossTab({ draftId: 'tab-b', createdAt: '2029-12-31T00:00:00Z', expiresAt: '2029-12-31T12:00:00Z' }));
    expect(await saveGuestDraftAsNew(a, { storage: stuck.storage, recovery: stuck.recovery, now: () => NOW })).toMatchObject({ ok: true, value: { recoveryCleared: false } });
  });

  it('invalid clock: saves but removes nothing', async () => {
    const t = setup();
    const a = draft({ draftId: 'tab-a' });
    t.recovery.stash(a);
    const r = await saveGuestDraftAsNew(a, { storage: t.storage, recovery: t.recovery, now: () => 'not-a-time' });
    expect(r).toMatchObject({ ok: true, value: { recoveryCleared: false } });
    expect(t.session.map.size).toBe(1);
  });

  it('a recovery port not created by createGuestRecoveryService is never generically cleared on save', async () => {
    const t = setup();
    let clearCalls = 0;
    const foreign: GuestRecoveryService = { stash: () => ({ ok: true, value: null }), recover: () => ({ ok: true, value: null }), clear: () => { clearCalls++; return { ok: true, value: null }; } };
    expect(await saveGuestDraftAsNew(draft(), { storage: t.storage, recovery: foreign, now: () => NOW })).toMatchObject({ ok: true, value: { saved: { id: PLAN_ID }, recoveryCleared: false } });
    expect(clearCalls).toBe(0);
  });

  it('user-directed cancel/sign_out still clears both slots (separate contract, unchanged)', () => {
    for (const event of ['cancel', 'sign_out'] as const) {
      const t = setup();
      t.recovery.stash(draft({ draftId: 'tab-a' }));
      put(t.local, crossTab({ draftId: 'tab-b' }));
      expect(t.recovery.clear(event)).toEqual({ ok: true, value: null });
      expect(t.local.map.size + t.session.map.size).toBe(0);
    }
  });
});

describe('explicit SaveIntent', () => {
  it('create_new uses create_plan; update_owned uses CAS save_plan', async () => {
    const { record, plan } = fixture();
    const d = deps(c => ({ status: 200, body: { status: 'ok', plan: c.url.endsWith('save_plan') ? row({ revision: 1 }) : row() } }));
    expect((await executeSaveIntent({ kind: 'create_new', record, plan }, d.storage)).ok).toBe(true);
    expect((await executeSaveIntent({ kind: 'update_owned', id: PLAN_ID, expectedRevision: 0, record, plan: { ...plan, planId: PLAN_ID } }, d.storage)).ok).toBe(true);
    expect(d.calls.map(c => c.url.split('/').pop())).toEqual(['create_plan', 'save_plan']);
  });
  it('rejects malformed intents and identity mismatches without network', async () => {
    const { record, plan } = fixture();
    const d = deps(() => ({ status: 500 }));
    expect(await executeSaveIntent({ kind: 'overwrite_silently', record, plan }, d.storage)).toMatchObject({ ok: false, reasonCode: 'invalid_save_intent' });
    expect(await executeSaveIntent({ kind: 'update_owned', id: PLAN_ID, expectedRevision: 0, record, plan }, d.storage)).toMatchObject({ ok: false, reasonCode: 'invalid_save_intent' });
    expect(d.calls).toHaveLength(0);
  });
});
