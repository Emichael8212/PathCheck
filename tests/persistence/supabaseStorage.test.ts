// Client-behaviour tests with a scripted fetch double. NOT RLS/grants evidence.
import { describe, expect, it } from 'vitest';
import { createSupabaseStorage } from '../../src/persistence/supabaseStorage';
import { createSupabaseAuth } from '../../src/auth/supabaseAuth';
import { CONFIG, PLAN_ID, PUBLISHABLE, USER_A, USER_B, deferredFetch, fakeFetch, fixture, flush, row, sessionFor } from './helpers';
import type { Responder } from './helpers';

const make = (responder: Responder, user: string | null = USER_A) => {
  const f = fakeFetch(responder);
  return { storage: createSupabaseStorage(CONFIG, { fetch: f.fetch, session: sessionFor(user) }), calls: f.calls };
};
const ok = (plan: unknown) => ({ status: 200, body: { status: 'ok', plan } });

describe('createPlan (Save as new)', () => {
  it('calls create_plan with publishable key + user JWT and adopts the server identity', async () => {
    const { record, plan } = fixture();
    const { storage, calls } = make(() => ok(row()));
    const r = await storage.createPlan(record, plan);
    expect(r.ok && r.value).toMatchObject({ id: PLAN_ID, ownerUserId: USER_A, revision: 0, createdAt: '2030-01-01T00:00:00.123Z' });
    expect(r.ok && r.value.plan.planId).toBe(PLAN_ID);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${CONFIG.url}/rest/v1/rpc/create_plan`);
    expect(calls[0]!.headers).toMatchObject({ apikey: PUBLISHABLE, Authorization: 'Bearer user-jwt-synthetic' });
    expect(calls[0]!.body).toEqual({ p_record: record, p_plan: plan }); // submitted unchanged
  });
  it('never calls the network for guests', async () => {
    const { record, plan } = fixture();
    const { storage, calls } = make(() => ok(row()), null);
    expect(await storage.createPlan(record, plan)).toEqual({ ok: false, code: 'forbidden', reasonCode: 'not_authenticated' });
    expect(calls).toHaveLength(0);
  });
  it('rejects contract-invalid, raw-PDF and extraction-only payloads before sending', async () => {
    const { record, plan } = fixture();
    const { storage, calls } = make(() => ok(row()));
    expect(await storage.createPlan({ ...record, rawPdf: 'x' } as never, plan)).toMatchObject({ ok: false, reasonCode: 'invalid_record' });
    expect(await storage.createPlan(record, { ...plan, availability_json: [] } as never)).toMatchObject({ ok: false, reasonCode: 'invalid_plan' });
    const withPdf = { ...plan, availabilityEvidence: plan.availabilityEvidence.map(e => ({ ...e, notes: 'JVBERi0xLjcK...' })) };
    expect(await storage.createPlan(record, withPdf)).toMatchObject({ ok: false, reasonCode: 'raw_document_content' });
    const quoteRecord = { ...record, courseAttempts: [{ attemptId: 'a1', rawCourseCode: 'X 1', normalizedCourseId: null, institution: null, origin: 'transcript_proposal', term: null, attemptedCredits: null, earnedCredits: null, grade: null, status: 'unknown', evidence: [], confidence: 'unresolved', provenance: [{ quote: 'raw line' }] }] };
    expect(await storage.createPlan(quoteRecord as never, plan)).toMatchObject({ ok: false, reasonCode: 'invalid_record' });
    expect(calls).toHaveLength(0);
  });
  it('rejects responses for another owner or with corrupt content', async () => {
    const { record, plan } = fixture();
    expect(await make(() => ok(row({ owner_user_id: USER_B }))).storage.createPlan(record, plan)).toMatchObject({ ok: false, reasonCode: 'unexpected_owner' });
    expect(await make(() => ok(row({ plan_json: { bogus: true } }))).storage.createPlan(record, plan)).toMatchObject({ ok: false, reasonCode: 'invalid_saved_plan' });
    expect(await make(() => ok(row({ plan_json: { ...fixture().plan, planId: 'other' } }))).storage.createPlan(record, plan)).toMatchObject({ ok: false, reasonCode: 'invalid_saved_plan' });
    expect(await make(() => ({ status: 200, raw: '<html>' })).storage.createPlan(record, plan)).toMatchObject({ ok: false, reasonCode: 'malformed_response' });
  });
  it('maps database errors to typed failures', async () => {
    const { record, plan } = fixture();
    const cases: Array<[number, unknown, string, string]> = [
      [401, { code: 'PGRST301' }, 'forbidden', 'session_expired'],
      [403, { code: '42501' }, 'forbidden', 'permission_denied'],
      [400, { code: 'PC001' }, 'rate_limited', 'plan_quota_exceeded'],
      [400, { code: '23514' }, 'validation_error', 'rejected_by_database'],
      [503, null, 'external_failure', 'database_request_failed'],
    ];
    for (const [status, body, code, reasonCode] of cases) {
      expect(await make(() => ({ status, body })).storage.createPlan(record, plan)).toEqual({ ok: false, code, reasonCode });
    }
    expect(await make(() => 'throw').storage.createPlan(record, plan)).toEqual({ ok: false, code: 'external_failure', reasonCode: 'network_error' });
  });
});

describe('savePlan (CAS)', () => {
  const owned = () => { const { record, plan } = fixture(); return { record, plan: { ...plan, planId: PLAN_ID } }; };
  it('sends expectedRevision and accepts exactly +1', async () => {
    const { record, plan } = owned();
    const { storage, calls } = make(() => ok(row({ revision: 4 })));
    const r = await storage.savePlan(PLAN_ID, 3, record, plan);
    expect(r.ok && r.value.revision).toBe(4);
    expect(r.ok && r.value.plan.planRevision).toBe(plan.planRevision); // local revision not rewritten
    expect(calls[0]!.body).toEqual({ p_id: PLAN_ID, p_expected_revision: 3, p_record: record, p_plan: plan });
  });
  it('returns conflict instead of overwriting', async () => {
    const { record, plan } = owned();
    expect(await make(() => ({ status: 200, body: { status: 'conflict' } })).storage.savePlan(PLAN_ID, 0, record, plan)).toEqual({ ok: false, code: 'conflict', reasonCode: 'revision_conflict' });
    expect(await make(() => ({ status: 400, body: { code: 'PC002' } })).storage.savePlan(PLAN_ID, 0, record, plan)).toEqual({ ok: false, code: 'conflict', reasonCode: 'revision_conflict' });
    expect(await make(() => ok(row({ revision: 9 }))).storage.savePlan(PLAN_ID, 3, record, plan)).toMatchObject({ ok: false, reasonCode: 'unexpected_revision' });
  });
  it('treats foreign/absent ids identically and validates identity locally', async () => {
    const { record, plan } = owned();
    expect(await make(() => ({ status: 200, body: { status: 'not_found' } })).storage.savePlan(PLAN_ID, 0, record, plan)).toEqual({ ok: false, code: 'forbidden', reasonCode: 'plan_not_found' });
    const { storage, calls } = make(() => ok(row()));
    expect(await storage.savePlan(PLAN_ID, 0, record, { ...plan, planId: 'different' })).toMatchObject({ ok: false, reasonCode: 'save_identity_mismatch' });
    expect(await storage.savePlan('x;drop', 0, record, plan)).toMatchObject({ ok: false, reasonCode: 'plan_not_found' });
    expect(await storage.savePlan(PLAN_ID, -1, record, plan)).toMatchObject({ ok: false, reasonCode: 'invalid_expected_revision' });
    expect(calls).toHaveLength(0);
  });
});

describe('list/get/delete', () => {
  it('lists only via authenticated owner-filtered query and normalizes timestamps', async () => {
    const { storage, calls } = make(() => ({ status: 200, body: [{ id: PLAN_ID, revision: 2, updated_at: '2030-01-02T03:04:05.678901+00:00' }] }));
    expect(await storage.listOwnedPlans()).toEqual({ ok: true, value: [{ id: PLAN_ID, revision: 2, updatedAt: '2030-01-02T03:04:05.678Z' }] });
    expect(calls[0]!.url).toContain(`owner_user_id=eq.${USER_A}`);
    expect(calls[0]!.method).toBe('GET');
  });
  it('opens an owned plan; empty result is not_found', async () => {
    expect((await make(() => ({ status: 200, body: [row()] })).storage.getOwnedPlan(PLAN_ID)).ok).toBe(true);
    expect(await make(() => ({ status: 200, body: [] })).storage.getOwnedPlan(PLAN_ID)).toEqual({ ok: false, code: 'forbidden', reasonCode: 'plan_not_found' });
    expect(await make(() => ({ status: 200, body: [row({ record_json: { schemaVersion: 2 } })] })).storage.getOwnedPlan(PLAN_ID)).toMatchObject({ ok: false, reasonCode: 'invalid_saved_plan' });
  });
  it('deletes with expected revision and surfaces conflicts', async () => {
    const { storage, calls } = make(() => ({ status: 200, body: { status: 'ok' } }));
    expect(await storage.deleteOwnedPlan(PLAN_ID, 2)).toEqual({ ok: true, value: null });
    expect(calls[0]!.body).toEqual({ p_id: PLAN_ID, p_expected_revision: 2 });
    expect(await make(() => ({ status: 200, body: { status: 'conflict' } })).storage.deleteOwnedPlan(PLAN_ID, 1)).toMatchObject({ ok: false, code: 'conflict' });
  });
  it('account deletion surfaces the server reauthentication requirement', async () => {
    const { storage, calls } = make(() => ({ status: 200, body: { status: 'reauthentication_required' } }));
    expect(await storage.deleteAccount()).toEqual({ ok: false, code: 'forbidden', reasonCode: 'reauthentication_required' });
    expect(calls[0]!.url).toBe(`${CONFIG.url}/rest/v1/rpc/delete_my_account`);
  });
});

// Wires the real S auth client (scripted Auth double) to storage to reproduce a sign-out
// or account switch while a database request is in flight. Not live/RLS evidence.
describe('session change during an in-flight request', () => {
  const tokens = (n: number, user: string) => ({ access_token: `access-${n}`, refresh_token: `refresh-${n}`, expires_in: 3600, user: { id: user } });
  const wired = async () => {
    const d = deferredFetch(c => (c.url.includes('/logout') ? { status: 204 } : null));
    const auth = createSupabaseAuth(CONFIG, { fetch: d.fetch });
    const login = async (n: number, user: string) => {
      const p = auth.verifyEmailOtp('student@pathcheck.test', '123456');
      await d.release('/verify', { status: 200, body: tokens(n, user) });
      return p;
    };
    await login(1, USER_A);
    return { d, auth, login, storage: createSupabaseStorage(CONFIG, { fetch: d.fetch, session: auth }) };
  };

  it('withholds account A plans from the UI after switching to account B', async () => {
    const w = await wired();
    const pending = w.storage.getOwnedPlan(PLAN_ID);
    await flush();
    await w.login(2, USER_B);
    await w.d.release('/rest/v1/plans', { status: 200, body: [row()] });
    expect(await pending).toEqual({ ok: false, code: 'conflict', reasonCode: 'auth_session_changed' });
  });
  it('does not hand a created identity to the guest after sign-out mid-save', async () => {
    const w = await wired();
    const { record, plan } = fixture();
    const pending = w.storage.createPlan(record, plan);
    await flush();
    await w.auth.signOut();
    await w.d.release('create_plan', { status: 200, body: { status: 'ok', plan: row() } });
    expect(await pending).toEqual({ ok: false, code: 'conflict', reasonCode: 'auth_session_changed' });
  });
  it('delivers normally when the same login is still current', async () => {
    const w = await wired();
    const pending = w.storage.listOwnedPlans();
    await flush();
    await w.d.release('/rest/v1/plans', { status: 200, body: [{ id: PLAN_ID, revision: 2, updated_at: '2030-01-01T00:00:00Z' }] });
    expect(await pending).toEqual({ ok: true, value: [{ id: PLAN_ID, revision: 2, updatedAt: '2030-01-01T00:00:00.000Z' }] });
  });
});
