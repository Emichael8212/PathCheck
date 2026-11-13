// Client-behaviour tests against a scripted Auth double; not live Auth evidence.
import { describe, expect, it } from 'vitest';
import { createSupabaseAuth, REFRESH_MARGIN_MS } from '../../src/auth/supabaseAuth';
import { CONFIG, PUBLISHABLE, USER_A, USER_B, deferredFetch, fakeFetch } from '../persistence/helpers';
import type { Responder } from '../persistence/helpers';

const tokens = (n: number, user = USER_A) => ({ access_token: `access-${n}`, refresh_token: `refresh-${n}`, expires_in: 3600, token_type: 'bearer', user: { id: user, email: 'ignored@pathcheck.test' } });

const setup = (responder: Responder) => {
  let clock = 1_000_000;
  const f = fakeFetch(responder);
  return { auth: createSupabaseAuth(CONFIG, { fetch: f.fetch, now: () => clock }), calls: f.calls, advance: (ms: number) => { clock += ms; } };
};

describe('email OTP', () => {
  it('requests an OTP with the publishable key only', async () => {
    const { auth, calls } = setup(() => ({ status: 200, body: {} }));
    expect(await auth.requestEmailOtp(' student@pathcheck.test ')).toEqual({ ok: true, value: null });
    expect(calls[0]).toMatchObject({ url: `${CONFIG.url}/auth/v1/otp`, method: 'POST', body: { email: 'student@pathcheck.test', create_user: true } });
    expect(calls[0]!.headers.apikey).toBe(PUBLISHABLE);
    expect(calls[0]!.headers.Authorization).toBeUndefined();
  });
  it('validates input and maps rate limits', async () => {
    const { auth, calls } = setup(() => ({ status: 429, body: {} }));
    expect(await auth.requestEmailOtp('not-an-email')).toMatchObject({ ok: false, reasonCode: 'invalid_email' });
    expect(await auth.verifyEmailOtp('student@pathcheck.test', '12ab')).toMatchObject({ ok: false, reasonCode: 'invalid_otp_input' });
    expect(calls).toHaveLength(0);
    expect(await auth.requestEmailOtp('student@pathcheck.test')).toMatchObject({ ok: false, code: 'rate_limited' });
  });
  it('verifies, holds the session in memory and exposes currentUser', async () => {
    const { auth, calls } = setup(() => ({ status: 200, body: tokens(1) }));
    expect(await auth.currentUser()).toEqual({ ok: true, value: null });
    expect(await auth.verifyEmailOtp('student@pathcheck.test', '123456')).toEqual({ ok: true, value: { userId: USER_A } });
    expect(calls[0]!.body).toEqual({ type: 'email', email: 'student@pathcheck.test', token: '123456' });
    expect(await auth.currentUser()).toEqual({ ok: true, value: { userId: USER_A } });
    expect(await auth.getSession()).toEqual({ ok: true, value: { accessToken: 'access-1', userId: USER_A } });
  });
  it('wrong/expired OTP yields forbidden with no session', async () => {
    const { auth } = setup(() => ({ status: 403, body: { error_code: 'otp_expired' } }));
    expect(await auth.verifyEmailOtp('student@pathcheck.test', '123456')).toEqual({ ok: false, code: 'forbidden', reasonCode: 'otp_invalid_or_expired' });
    expect(await auth.currentUser()).toEqual({ ok: true, value: null });
  });
  it('rejects malformed token responses', async () => {
    const { auth } = setup(() => ({ status: 200, body: { access_token: 'x' } }));
    expect(await auth.verifyEmailOtp('student@pathcheck.test', '123456')).toMatchObject({ ok: false, reasonCode: 'invalid_auth_response' });
    expect(await auth.currentUser()).toEqual({ ok: true, value: null });
  });
});

describe('refresh', () => {
  it('refreshes near expiry exactly once for concurrent callers (rotation-safe)', async () => {
    let n = 1;
    const { auth, calls, advance } = setup(c => ({ status: 200, body: c.url.includes('grant_type=refresh_token') ? tokens(++n) : tokens(1) }));
    await auth.verifyEmailOtp('student@pathcheck.test', '123456');
    advance(3600_000 - REFRESH_MARGIN_MS + 1);
    const [a, b] = await Promise.all([auth.getSession(), auth.getSession()]);
    expect(a).toEqual({ ok: true, value: { accessToken: 'access-2', userId: USER_A } });
    expect(b).toEqual(a);
    const refreshCalls = calls.filter(c => c.url.includes('refresh_token'));
    expect(refreshCalls).toHaveLength(1);
    expect(refreshCalls[0]!.body).toEqual({ refresh_token: 'refresh-1' });
  });
  it('drops the session when the refresh token is rejected', async () => {
    const { auth, advance } = setup(c => (c.url.includes('refresh_token') ? { status: 400, body: { error: 'invalid_grant' } } : { status: 200, body: tokens(1) }));
    await auth.verifyEmailOtp('student@pathcheck.test', '123456');
    advance(3600_000);
    expect(await auth.currentUser()).toEqual({ ok: true, value: null });
  });
  it('refuses a refresh that switches identity', async () => {
    const { auth, advance } = setup(c => ({ status: 200, body: c.url.includes('refresh_token') ? tokens(2, USER_B) : tokens(1) }));
    await auth.verifyEmailOtp('student@pathcheck.test', '123456');
    advance(3600_000);
    expect(await auth.getSession()).toMatchObject({ ok: false, reasonCode: 'invalid_auth_response' });
    expect(await auth.currentUser()).toEqual({ ok: true, value: null });
  });
  it('keeps a still-valid token on a transient refresh network failure', async () => {
    let fail = false;
    const { auth, advance } = setup(() => (fail ? 'throw' : { status: 200, body: tokens(1) }));
    await auth.verifyEmailOtp('student@pathcheck.test', '123456');
    fail = true;
    advance(3600_000 - REFRESH_MARGIN_MS + 1);
    expect(await auth.getSession()).toEqual({ ok: true, value: { accessToken: 'access-1', userId: USER_A } });
    advance(REFRESH_MARGIN_MS);
    expect(await auth.getSession()).toMatchObject({ ok: false, code: 'external_failure' });
  });
});

describe('sign out', () => {
  it('discards local credentials even if server revocation fails', async () => {
    let fail = false;
    const { auth, calls } = setup(() => (fail ? 'throw' : { status: 200, body: tokens(1) }));
    await auth.verifyEmailOtp('student@pathcheck.test', '123456');
    fail = true;
    expect(await auth.signOut()).toEqual({ ok: false, code: 'external_failure', reasonCode: 'server_sign_out_unconfirmed' });
    expect(await auth.currentUser()).toEqual({ ok: true, value: null });
    expect(calls.at(-1)!.headers.Authorization).toBe('Bearer access-1');
  });
  it('confirms server sign-out', async () => {
    const { auth } = setup(c => (c.url.includes('logout') ? { status: 204 } : { status: 200, body: tokens(1) }));
    await auth.verifyEmailOtp('student@pathcheck.test', '123456');
    expect(await auth.signOut()).toEqual({ ok: true, value: null });
    expect(await auth.signOut()).toEqual({ ok: true, value: null });
  });
});

// Deferred-response regressions for async races (G review findings). Scripted Auth
// double; proves client state-machine behaviour only, not live GoTrue behaviour.
describe('async races: stale responses never resurrect or overwrite a login', () => {
  const EMAIL = 'student@pathcheck.test';
  const race = () => {
    let clock = 1_000_000;
    const d = deferredFetch(c => (c.url.includes('/logout') ? { status: 204 } : null));
    const auth = createSupabaseAuth(CONFIG, { fetch: d.fetch, now: () => clock });
    return { auth, d, advance: (ms: number) => { clock += ms; } };
  };
  type Race = ReturnType<typeof race>;
  const logouts = (r: Race) => r.d.calls.filter(c => c.url.includes('/logout')).map(c => c.headers.Authorization);
  const login = async (r: Race, n: number, user = USER_A) => {
    const p = r.auth.verifyEmailOtp(EMAIL, '123456');
    await r.d.release('/verify', { status: 200, body: tokens(n, user) });
    return p;
  };
  const nearExpiry = (r: Race) => r.advance(3600_000 - REFRESH_MARGIN_MS + 1); // token still unexpired

  it('verify resolving after signOut does not restore the session and revokes its tokens', async () => {
    const r = race();
    const pending = r.auth.verifyEmailOtp(EMAIL, '123456');
    expect(await r.auth.signOut()).toEqual({ ok: true, value: null });
    await r.d.release('/verify', { status: 200, body: tokens(1) });
    expect(await pending).toEqual({ ok: false, code: 'conflict', reasonCode: 'auth_operation_superseded' });
    expect(await r.auth.currentUser()).toEqual({ ok: true, value: null });
    expect(logouts(r)).toEqual(['Bearer access-1']);
  });

  it('an older verify resolving before a newer pending verify is superseded', async () => {
    const r = race();
    const older = r.auth.verifyEmailOtp(EMAIL, '111111');
    const newer = r.auth.verifyEmailOtp('other@pathcheck.test', '222222');
    await r.d.release('/verify', { status: 200, body: tokens(1, USER_A) }); // oldest pending = older
    expect(await older).toEqual({ ok: false, code: 'conflict', reasonCode: 'auth_operation_superseded' });
    expect(await r.auth.currentUser()).toEqual({ ok: true, value: null });
    await r.d.release('/verify', { status: 200, body: tokens(2, USER_B) });
    expect(await newer).toEqual({ ok: true, value: { userId: USER_B } });
    expect(await r.auth.currentUser()).toEqual({ ok: true, value: { userId: USER_B } });
  });

  it('an older verify resolving after the newer login committed cannot overwrite it', async () => {
    const r = race();
    const older = r.auth.verifyEmailOtp(EMAIL, '111111');
    const newer = r.auth.verifyEmailOtp('other@pathcheck.test', '222222');
    r.d.pending.splice(1, 1)[0]!.release({ status: 200, body: tokens(2, USER_B) });
    expect(await newer).toEqual({ ok: true, value: { userId: USER_B } });
    await r.d.release('/verify', { status: 200, body: tokens(1, USER_A) });
    expect(await older).toMatchObject({ ok: false, reasonCode: 'auth_operation_superseded' });
    expect(await r.auth.getSession()).toEqual({ ok: true, value: { accessToken: 'access-2', userId: USER_B } });
    expect(logouts(r)).toEqual(['Bearer access-1']);
  });

  it('failed refresh after signOut never falls back to the captured unexpired token', async () => {
    const r = race();
    await login(r, 1);
    nearExpiry(r);
    const pending = r.auth.getSession();
    await r.auth.signOut();
    await r.d.release('refresh_token', 'throw');
    expect(await pending).toEqual({ ok: false, code: 'conflict', reasonCode: 'auth_session_changed' });
    expect(await r.auth.currentUser()).toEqual({ ok: true, value: null });
  });

  it('failed refresh after an account switch never returns the previous account token', async () => {
    const r = race();
    await login(r, 1, USER_A);
    nearExpiry(r);
    const pending = r.auth.getSession();
    expect(await login(r, 2, USER_B)).toEqual({ ok: true, value: { userId: USER_B } });
    await r.d.release('refresh_token', { status: 503 });
    expect(await pending).toEqual({ ok: false, code: 'conflict', reasonCode: 'auth_session_changed' });
    expect(await r.auth.getSession()).toEqual({ ok: true, value: { accessToken: 'access-2', userId: USER_B } });
  });

  it('successful refresh after signOut is not committed and its new tokens are revoked', async () => {
    const r = race();
    await login(r, 1);
    nearExpiry(r);
    const pending = r.auth.getSession();
    await r.auth.signOut();
    await r.d.release('refresh_token', { status: 200, body: tokens(9) });
    expect(await pending).toEqual({ ok: false, code: 'conflict', reasonCode: 'auth_session_changed' });
    expect(await r.auth.currentUser()).toEqual({ ok: true, value: null });
    expect(logouts(r)).toEqual(['Bearer access-1', 'Bearer access-9']);
  });

  it('a rejected refresh for the old login does not clear a newer login', async () => {
    const r = race();
    await login(r, 1, USER_A);
    nearExpiry(r);
    const pending = r.auth.getSession();
    await login(r, 2, USER_B);
    await r.d.release('refresh_token', { status: 400, body: { error: 'invalid_grant' } });
    expect(await pending).toMatchObject({ ok: false, reasonCode: 'auth_session_changed' });
    expect(await r.auth.currentUser()).toEqual({ ok: true, value: { userId: USER_B } });
  });

  it("a new login near expiry does not join the previous login's in-flight refresh", async () => {
    const r = race();
    await login(r, 1, USER_A);
    nearExpiry(r);
    const oldRefresh = r.auth.getSession();
    await login(r, 2, USER_B);
    nearExpiry(r);
    const newRefresh = r.auth.getSession();
    expect(r.d.calls.filter(c => c.url.includes('refresh_token')).map(c => c.body)).toEqual([{ refresh_token: 'refresh-1' }, { refresh_token: 'refresh-2' }]);
    await r.d.release('refresh_token', { status: 200, body: tokens(3, USER_A) });
    await r.d.release('refresh_token', { status: 200, body: tokens(4, USER_B) });
    expect(await oldRefresh).toMatchObject({ ok: false, reasonCode: 'auth_session_changed' });
    expect(await newRefresh).toEqual({ ok: true, value: { accessToken: 'access-4', userId: USER_B } });
    expect(await r.auth.currentUser()).toEqual({ ok: true, value: { userId: USER_B } });
  });

  it('isCurrent tracks the login: survives token refresh, not switch or signOut', async () => {
    const r = race();
    await login(r, 1, USER_A);
    const s1 = await r.auth.getSession();
    if (!s1.ok || !s1.value) throw new Error('expected session');
    expect(r.auth.isCurrent(s1.value)).toBe(true);
    nearExpiry(r);
    const p = r.auth.getSession();
    await r.d.release('refresh_token', { status: 200, body: tokens(2, USER_A) });
    expect(await p).toEqual({ ok: true, value: { accessToken: 'access-2', userId: USER_A } });
    expect(r.auth.isCurrent(s1.value)).toBe(true);
    await login(r, 3, USER_B);
    expect(r.auth.isCurrent(s1.value)).toBe(false);
    const s3 = await r.auth.getSession();
    if (!s3.ok || !s3.value) throw new Error('expected session');
    await r.auth.signOut();
    expect(r.auth.isCurrent(s3.value)).toBe(false);
    expect(r.auth.isCurrent({ accessToken: 'access-3', userId: USER_B })).toBe(false); // forged/unissued view
  });
});
