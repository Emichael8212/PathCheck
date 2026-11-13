import { z } from 'zod';
import type { AuthService, Result, TypedFailure } from '../contracts';
import type { PublicSupabaseConfig } from '../persistence/config';
import { requestJson } from '../persistence/http';
import type { FetchLike } from '../persistence/http';
import type { AccessSession, SessionProvider } from './session';

const EmailSchema = z.email().max(254);
const OtpSchema = z.string().regex(/^[0-9]{6,10}$/);
const UuidSchema = z.uuid();
const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  user: z.object({ id: UuidSchema }),
});

/** Refresh this many ms before expiry so a request never departs with a dying token. */
export const REFRESH_MARGIN_MS = 60_000;

/** `epoch` identifies one login; refreshes within that login keep it. */
interface StoredSession { accessToken: string; refreshToken: string; userId: string; expiresAtMs: number; epoch: number }
type Tokens = Omit<StoredSession, 'epoch'>;

/** Refresh outcome. `superseded`: the stored session changed while the request was in flight. */
type RefreshOutcome = Result<{ kind: 'rotated'; next: StoredSession } | { kind: 'revoked' } | { kind: 'superseded' }>;

const superseded: TypedFailure = { ok: false, code: 'conflict', reasonCode: 'auth_session_changed' };

export interface SupabaseAuth extends AuthService, SessionProvider {
  isCurrent(session: AccessSession): boolean;
}

/**
 * Supabase Auth (GoTrue) email-OTP client over the documented REST endpoints.
 *
 * Session handling is deliberately conservative: tokens live only in this closure's
 * memory (never localStorage/sessionStorage/cookies/logs), so a page reload requires a
 * fresh OTP while the structured guest draft survives via GuestRecoveryService.
 * Refreshes are single-flight per login to avoid refresh-token-rotation reuse revocation.
 * Client-side identity is display/routing state only; the database authorizes every
 * request from the server-verified JWT (RLS + grants).
 *
 * Async race rules (every awaited auth response is re-validated before it takes effect):
 *  - `op` increments on every verifyEmailOtp start and every signOut. A verify response
 *    commits only if no later verify/signOut began meanwhile, so a slow response can
 *    neither resurrect a signed-out login nor overwrite a newer one. Tokens from a
 *    superseded response are revoked server-side on a best-effort basis.
 *  - A refresh commits only if the stored session is still the one it refreshed. A failed
 *    refresh falls back to the still-unexpired old token only if that same session is
 *    still current; otherwise the caller receives `conflict/auth_session_changed`.
 */
export function createSupabaseAuth(config: PublicSupabaseConfig, deps: { fetch: FetchLike; now?: () => number }): SupabaseAuth {
  const now = deps.now ?? (() => Date.now());
  let session: StoredSession | null = null;
  let op = 0;
  let epochCounter = 0;
  let refreshing: { base: StoredSession; promise: Promise<RefreshOutcome> } | null = null;
  // Maps each AccessSession handed out to the login epoch that produced it.
  const issued = new WeakMap<AccessSession, number>();
  const baseHeaders = { apikey: config.publishableKey };

  const view = (s: StoredSession): AccessSession => {
    const v: AccessSession = Object.freeze({ accessToken: s.accessToken, userId: s.userId });
    issued.set(v, s.epoch);
    return v;
  };

  const parseTokens = (body: unknown): Tokens | null => {
    const parsed = TokenResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    return { accessToken: parsed.data.access_token, refreshToken: parsed.data.refresh_token, userId: parsed.data.user.id, expiresAtMs: now() + parsed.data.expires_in * 1000 };
  };

  // Best-effort server revocation of tokens this client will never use. Result ignored.
  const revokeDiscarded = async (accessToken: string): Promise<void> => {
    await requestJson(deps.fetch, `${config.url}/auth/v1/logout?scope=local`, { method: 'POST', headers: { ...baseHeaders, Authorization: `Bearer ${accessToken}` } });
  };

  const runRefresh = async (base: StoredSession): Promise<RefreshOutcome> => {
    const res = await requestJson(deps.fetch, `${config.url}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: baseHeaders, body: { refresh_token: base.refreshToken } });
    if (!res.ok) return res; // network failure: keep session, caller decides
    if (res.value.status >= 400 && res.value.status < 500 && res.value.status !== 429) {
      if (session !== base) return { ok: true, value: { kind: 'superseded' } };
      session = null; // revoked/expired refresh token
      return { ok: true, value: { kind: 'revoked' } };
    }
    if (res.value.status !== 200) return { ok: false, code: res.value.status === 429 ? 'rate_limited' : 'external_failure', reasonCode: 'session_refresh_failed' };
    const tokens = parseTokens(res.value.body);
    if (!tokens || tokens.userId !== base.userId) {
      if (tokens) await revokeDiscarded(tokens.accessToken);
      if (session !== base) return { ok: true, value: { kind: 'superseded' } };
      session = null;
      return { ok: false, code: 'external_failure', reasonCode: 'invalid_auth_response' };
    }
    if (session !== base) {
      await revokeDiscarded(tokens.accessToken); // signed out / switched while refreshing
      return { ok: true, value: { kind: 'superseded' } };
    }
    const next: StoredSession = { ...tokens, epoch: base.epoch };
    session = next;
    return { ok: true, value: { kind: 'rotated', next } };
  };

  const refresh = (base: StoredSession): Promise<RefreshOutcome> => {
    if (refreshing && refreshing.base === base) return refreshing.promise;
    const promise = runRefresh(base).finally(() => {
      if (refreshing?.promise === promise) refreshing = null;
    });
    refreshing = { base, promise };
    return promise;
  };

  const getSession = async (): Promise<Result<AccessSession | null>> => {
    const current = session;
    if (!current) return { ok: true, value: null };
    if (current.expiresAtMs - now() > REFRESH_MARGIN_MS) return { ok: true, value: view(current) };
    const refreshed = await refresh(current);
    if (!refreshed.ok) {
      if (refreshed.reasonCode === 'invalid_auth_response') return refreshed;
      // Fallback only to the SAME still-current login's unexpired token, never a captured
      // token from a session that was signed out or replaced during the refresh.
      if (session !== current) return superseded;
      return current.expiresAtMs > now() ? { ok: true, value: view(current) } : refreshed;
    }
    switch (refreshed.value.kind) {
      case 'rotated': return session === refreshed.value.next ? { ok: true, value: view(refreshed.value.next) } : superseded;
      case 'revoked': return session === null ? { ok: true, value: null } : superseded;
      case 'superseded': return superseded;
    }
  };

  return {
    getSession,

    isCurrent(s) {
      const epoch = issued.get(s);
      return epoch !== undefined && session !== null && session.epoch === epoch && session.userId === s.userId;
    },

    async currentUser() {
      const s = await getSession();
      return s.ok ? { ok: true, value: s.value ? { userId: s.value.userId } : null } : s;
    },

    async requestEmailOtp(email) {
      const parsed = EmailSchema.safeParse(email.trim());
      if (!parsed.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_email' };
      const res = await requestJson(deps.fetch, `${config.url}/auth/v1/otp`, { method: 'POST', headers: baseHeaders, body: { email: parsed.data, create_user: true } });
      if (!res.ok) return res;
      if (res.value.status === 429) return { ok: false, code: 'rate_limited', reasonCode: 'otp_rate_limited' };
      if (res.value.status !== 200) return { ok: false, code: 'external_failure', reasonCode: 'otp_request_failed' };
      return { ok: true, value: null };
    },

    async verifyEmailOtp(email, token) {
      const e = EmailSchema.safeParse(email.trim()), t = OtpSchema.safeParse(token.trim());
      if (!e.success || !t.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_otp_input' };
      const mine = ++op;
      const res = await requestJson(deps.fetch, `${config.url}/auth/v1/verify`, { method: 'POST', headers: baseHeaders, body: { type: 'email', email: e.data, token: t.data } });
      if (!res.ok) return res;
      if (res.value.status === 429) return { ok: false, code: 'rate_limited', reasonCode: 'otp_rate_limited' };
      if (res.value.status >= 400 && res.value.status < 500) return { ok: false, code: 'forbidden', reasonCode: 'otp_invalid_or_expired' };
      if (res.value.status !== 200) return { ok: false, code: 'external_failure', reasonCode: 'otp_verify_failed' };
      const tokens = parseTokens(res.value.body);
      if (!tokens) return { ok: false, code: 'external_failure', reasonCode: 'invalid_auth_response' };
      if (op !== mine) {
        // A signOut or a newer verify started while this one was in flight.
        await revokeDiscarded(tokens.accessToken);
        return { ok: false, code: 'conflict', reasonCode: 'auth_operation_superseded' };
      }
      session = { ...tokens, epoch: ++epochCounter };
      refreshing = null;
      return { ok: true, value: { userId: tokens.userId } };
    },

    async signOut() {
      op++; // invalidates any in-flight verify
      const current = session;
      session = null; // local credentials are always discarded first
      refreshing = null;
      if (!current) return { ok: true, value: null };
      const res = await requestJson(deps.fetch, `${config.url}/auth/v1/logout?scope=local`, { method: 'POST', headers: { ...baseHeaders, Authorization: `Bearer ${current.accessToken}` } });
      if (!res.ok) return { ok: false, code: 'external_failure', reasonCode: 'server_sign_out_unconfirmed' };
      if (res.value.status !== 204 && res.value.status !== 200 && res.value.status !== 401 && res.value.status !== 404) {
        return { ok: false, code: 'external_failure', reasonCode: 'server_sign_out_unconfirmed' };
      }
      return { ok: true, value: null };
    },
  };
}
