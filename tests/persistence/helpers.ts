// Test-only doubles. These verify CLIENT behaviour (request shape, validation, error
// mapping). They are NOT evidence of database authorization; RLS/grants proof lives in
// supabase/tests/database and the env-gated live suite.
import { syntheticScenario } from '../../src/contracts/synthetic.test-fixtures';
import type { GuestDraft } from '../../src/contracts';
import type { FetchLike } from '../../src/persistence/http';
import type { StorageLike } from '../../src/persistence/guestRecovery';

export const USER_A = '00000000-0000-4000-8000-00000000000a';
export const USER_B = '00000000-0000-4000-8000-00000000000b';
export const PLAN_ID = '11111111-1111-4111-8111-111111111111';
export const PUBLISHABLE = 'sb_publishable_synthetic_test_key';
export const CONFIG = Object.freeze({ url: 'https://synthetic-project.supabase.test', publishableKey: PUBLISHABLE });

export function fixture() {
  const s = syntheticScenario();
  return { record: s.record, plan: s.plan };
}

export function draft(over: Partial<GuestDraft> = {}): GuestDraft {
  const { record, plan } = fixture();
  return { schemaVersion: 1, draftId: 'draft-1', mode: 'session', explicitRecoveryConsent: false, createdAt: '2030-01-01T00:00:00Z', expiresAt: '2030-01-01T12:00:00Z', record, plan, ...over };
}

export function row(over: Record<string, unknown> = {}) {
  const { record, plan } = fixture();
  return { id: PLAN_ID, owner_user_id: USER_A, schema_version: 1, revision: 0, record_json: record, plan_json: { ...plan, planId: PLAN_ID }, created_at: '2030-01-01T00:00:00.123456+00:00', updated_at: '2030-01-01T00:00:00.123456+00:00', ...over };
}

export interface Call { url: string; method: string; headers: Record<string, string>; body: unknown }
export type Responder = (call: Call) => { status: number; body?: unknown; raw?: string } | 'throw';

export function fakeFetch(responder: Responder): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    const call: Call = { url, method: init.method, headers: init.headers, body: init.body === undefined ? undefined : JSON.parse(init.body) };
    calls.push(call);
    const r = responder(call);
    if (r === 'throw') throw new TypeError('network down');
    const text = r.raw ?? (r.body === undefined ? '' : JSON.stringify(r.body));
    return { status: r.status, ok: r.status >= 200 && r.status < 300, text: async () => text };
  };
  return { fetch, calls };
}

/**
 * Web Storage double. Enumerable (`length`/`key`) like window.localStorage unless
 * `enumerable: false`, which models a basic getItem/setItem/removeItem-only store.
 */
export function memoryStorage(opts: { failSet?: boolean; failGet?: boolean; failRemove?: boolean; enumerable?: boolean } = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  const base = {
    map,
    getItem: (k: string) => { if (opts.failGet) throw new Error('SecurityError'); return map.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (opts.failSet) throw new Error('QuotaExceededError'); map.set(k, v); },
    removeItem: (k: string) => { if (opts.failRemove) throw new Error('SecurityError'); map.delete(k); },
  };
  if (opts.enumerable === false) return base;
  return Object.defineProperties(base, {
    length: { get: () => { if (opts.failGet) throw new Error('SecurityError'); return map.size; } },
    key: { value: (i: number) => { if (opts.failGet) throw new Error('SecurityError'); return [...map.keys()][i] ?? null; } },
  }) as typeof base & { readonly length: number; key(i: number): string | null };
}

/**
 * Fetch double whose responses are released manually, to reproduce interleavings of
 * in-flight requests with sign-out / account switches. Test-only.
 */
export function deferredFetch(auto: (call: Call) => { status: number; body?: unknown } | null = () => null) {
  const pending: Array<{ call: Call; release: (r: { status: number; body?: unknown } | 'throw') => void }> = [];
  const calls: Call[] = [];
  const fetch: FetchLike = (url, init) => {
    const call: Call = { url, method: init.method, headers: init.headers, body: init.body === undefined ? undefined : JSON.parse(init.body) };
    calls.push(call);
    const immediate = auto(call);
    if (immediate) {
      const text = immediate.body === undefined ? '' : JSON.stringify(immediate.body);
      return Promise.resolve({ status: immediate.status, ok: immediate.status >= 200 && immediate.status < 300, text: async () => text });
    }
    return new Promise((resolve, reject) => {
      pending.push({ call, release: r => {
        if (r === 'throw') { reject(new TypeError('network down')); return; }
        const text = r.body === undefined ? '' : JSON.stringify(r.body);
        resolve({ status: r.status, ok: r.status >= 200 && r.status < 300, text: async () => text });
      } });
    });
  };
  /** Releases the oldest pending request whose URL contains `fragment`. */
  const release = async (fragment: string, r: { status: number; body?: unknown } | 'throw') => {
    const i = pending.findIndex(p => p.call.url.includes(fragment));
    if (i < 0) throw new Error(`no pending request matching ${fragment}`);
    const [p] = pending.splice(i, 1);
    p!.release(r);
    await flush();
  };
  return { fetch, calls, pending, release };
}

/** Lets queued promise continuations run (several microtask/macrotask turns). */
export const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };

export const sessionFor = (userId: string | null, accessToken = 'user-jwt-synthetic') => ({
  getSession: async () => ({ ok: true as const, value: userId ? { accessToken, userId } : null }),
});
