import { describe, expect, it } from 'vitest';
import { createGuestRecoveryService } from '../../src/persistence/guestRecovery';
import { createSupabaseStorage } from '../../src/persistence/supabaseStorage';
import { executeSaveIntent, saveGuestDraftAsNew } from '../../src/persistence/saveFlows';
import { CONFIG, PLAN_ID, USER_A, deferredFetch, draft, fakeFetch, fixture, flush, memoryStorage, row, sessionFor } from './helpers';
import type { Responder } from './helpers';

const deps = (responder: Responder) => {
  const f = fakeFetch(responder);
  const session = memoryStorage(), local = memoryStorage();
  return { calls: f.calls, session, storage: createSupabaseStorage(CONFIG, { fetch: f.fetch, session: sessionFor(USER_A) }), recovery: createGuestRecoveryService({ session, local }) };
};

describe('guest → account Save as new', () => {
  it('always creates a new plan, then clears recovery', async () => {
    const d = deps(() => ({ status: 200, body: { status: 'ok', plan: row() } }));
    d.recovery.stash(draft());
    const r = await saveGuestDraftAsNew(draft(), d);
    expect(r.ok && r.value.saved.id).toBe(PLAN_ID);
    expect(r.ok && r.value.recoveryCleared).toBe(true);
    expect(d.calls.map(c => c.url)).toEqual([`${CONFIG.url}/rest/v1/rpc/create_plan`]);
    expect(d.session.map.size).toBe(0);
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
  it('retains the guest draft when the cloud save fails', async () => {
    const d = deps(() => 'throw');
    d.recovery.stash(draft());
    expect(await saveGuestDraftAsNew(draft(), d)).toMatchObject({ ok: false, code: 'external_failure' });
    expect(d.recovery.recover('2030-01-01T06:00:00Z')).toEqual({ ok: true, value: draft() });
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
