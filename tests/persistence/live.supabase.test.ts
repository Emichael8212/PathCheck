// LIVE two-principal authorization suite against a real local/test Supabase stack.
// Skipped (reported NOT RUN) unless explicitly configured. Never point at production.
//
//   supabase start && supabase db reset          # applies supabase/migrations
//   PATHCHECK_LIVE_SUPABASE_URL=http://127.0.0.1:54321 \
//   PATHCHECK_LIVE_SUPABASE_PUBLISHABLE_KEY=<local publishable/anon key> \
//   npx vitest run tests/persistence/live.supabase.test.ts
//
// Identities are created with password sign-up on the local stack (email confirmation
// disabled by local default) purely to mint two real user JWTs; the app itself uses OTP.
// Remote hosts are refused unless PATHCHECK_LIVE_ALLOW_REMOTE_TEST_PROJECT=1 is set for
// an authorized, disposable TEST project.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parsePublicSupabaseConfig } from '../../src/persistence/config';
import { createSupabaseStorage } from '../../src/persistence/supabaseStorage';
import type { FetchLike } from '../../src/persistence/http';
import { fixture } from './helpers';

const env = process.env;
const parsed = parsePublicSupabaseConfig({ url: env.PATHCHECK_LIVE_SUPABASE_URL, publishableKey: env.PATHCHECK_LIVE_SUPABASE_PUBLISHABLE_KEY });
const host = parsed.ok ? new URL(parsed.value.url).hostname : '';
const allowed = parsed.ok && (['127.0.0.1', 'localhost'].includes(host) || env.PATHCHECK_LIVE_ALLOW_REMOTE_TEST_PROJECT === '1');
const fetchImpl: FetchLike = (url, init) => fetch(url, init);

describe.skipIf(!allowed)('LIVE Supabase RLS/grants: User A, User B, anon', () => {
  const cfg = parsed.ok ? parsed.value : { url: '', publishableKey: '' };
  const signUp = async () => {
    const res = await fetch(`${cfg.url}/auth/v1/signup`, { method: 'POST', headers: { apikey: cfg.publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `s-live-${randomUUID()}@pathcheck.test`, password: randomUUID() }) });
    const body = await res.json() as { access_token?: string; user?: { id: string } };
    if (!body.access_token || !body.user) throw new Error(`sign-up failed with HTTP ${res.status}`);
    return { accessToken: body.access_token, userId: body.user.id };
  };
  const storageFor = (s: { accessToken: string; userId: string }) => createSupabaseStorage(cfg, { fetch: fetchImpl, session: { getSession: async () => ({ ok: true, value: s }) } });
  const anonRest = (path: string, init: RequestInit = {}) => fetch(`${cfg.url}/rest/v1/${path}`, { ...init, headers: { apikey: cfg.publishableKey, 'Content-Type': 'application/json', ...init.headers } });

  it('enforces owner isolation, CAS and Save-as-new end to end', async () => {
    const a = await signUp(), b = await signUp();
    const A = storageFor(a), B = storageFor(b);
    const { record, plan } = fixture();

    const created = await A.createPlan(record, plan);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.value.id;
    expect(id).not.toBe(plan.planId);
    expect(created.value).toMatchObject({ ownerUserId: a.userId, revision: 0 });
    const ownedPlan = created.value.plan;

    // B: read/list/update/delete denied (indistinguishable from absent).
    expect(await B.getOwnedPlan(id)).toMatchObject({ ok: false, reasonCode: 'plan_not_found' });
    expect(await B.listOwnedPlans()).toEqual({ ok: true, value: [] });
    expect(await B.savePlan(id, 0, record, ownedPlan)).toMatchObject({ ok: false, reasonCode: 'plan_not_found' });
    expect(await B.deleteOwnedPlan(id, 0)).toMatchObject({ ok: false, reasonCode: 'plan_not_found' });
    const bDirect = await fetch(`${cfg.url}/rest/v1/plans?id=eq.${id}`, { method: 'PATCH', headers: { apikey: cfg.publishableKey, Authorization: `Bearer ${b.accessToken}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ revision: 1 }) });
    expect(await bDirect.json()).toEqual([]);

    // B owner spoof on direct insert denied by column grant.
    const spoof = await fetch(`${cfg.url}/rest/v1/plans`, { method: 'POST', headers: { apikey: cfg.publishableKey, Authorization: `Bearer ${b.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ owner_user_id: a.userId, record_json: record, plan_json: plan }) });
    expect(spoof.status).toBeGreaterThanOrEqual(400);

    // anon: no table or RPC access.
    expect((await anonRest('plans?select=id')).status).toBeGreaterThanOrEqual(400);
    expect((await anonRest('rpc/create_plan', { method: 'POST', body: JSON.stringify({ p_record: record, p_plan: plan }) })).status).toBeGreaterThanOrEqual(400);

    // A: CAS save, stale conflict, no overwrite.
    const saved = await A.savePlan(id, 0, record, { ...ownedPlan, planRevision: ownedPlan.planRevision + 1 });
    expect(saved.ok && saved.value.revision).toBe(1);
    expect(await A.savePlan(id, 0, record, ownedPlan)).toMatchObject({ ok: false, code: 'conflict' });
    const reopened = await A.getOwnedPlan(id);
    expect(reopened.ok && reopened.value.plan.planRevision).toBe(ownedPlan.planRevision + 1);

    // Concurrent saves at the same expected revision: exactly one wins.
    const race = await Promise.all([A.savePlan(id, 1, record, ownedPlan), A.savePlan(id, 1, record, ownedPlan)]);
    expect(race.filter(r => r.ok)).toHaveLength(1);
    expect(race.filter(r => !r.ok && r.code === 'conflict')).toHaveLength(1);

    // Save as new from an owned plan yields a distinct identity.
    const copy = await A.createPlan(record, ownedPlan);
    expect(copy.ok && copy.value.id).not.toBe(id);
    expect((await A.listOwnedPlans()).ok && ((await A.listOwnedPlans()) as { value: unknown[] }).value).toHaveLength(2);

    // Delete with CAS.
    expect(await A.deleteOwnedPlan(id, 1)).toMatchObject({ ok: false, code: 'conflict' });
    expect(await A.deleteOwnedPlan(id, 2)).toEqual({ ok: true, value: null });
    expect(await A.getOwnedPlan(id)).toMatchObject({ ok: false, reasonCode: 'plan_not_found' });

    // Account deletion: fresh password sign-in carries a recent amr timestamp.
    expect(await A.deleteAccount()).toEqual({ ok: true, value: null });
    expect(await A.listOwnedPlans()).toEqual({ ok: true, value: [] });
  });
});
