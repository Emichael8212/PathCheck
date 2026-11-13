import type { Result } from '../contracts';

/** Browser-safe Supabase configuration. Only the publishable (or legacy anon) key is accepted. */
export interface PublicSupabaseConfig {
  readonly url: string;
  readonly publishableKey: string;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function decodeJwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const payload: unknown = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return typeof payload === 'object' && payload !== null && typeof (payload as { role?: unknown }).role === 'string'
      ? (payload as { role: string }).role
      : null;
  } catch {
    return null;
  }
}

/**
 * Validates public configuration before any network use. Fails closed on secret keys:
 * `sb_secret_*` keys and legacy JWTs whose role is not `anon` (e.g. `service_role`).
 * HTTPS is required except for loopback development/test stacks.
 * The rejected value is never echoed in the failure.
 */
export function parsePublicSupabaseConfig(input: { url: unknown; publishableKey: unknown }): Result<PublicSupabaseConfig> {
  if (typeof input.url !== 'string' || typeof input.publishableKey !== 'string') {
    return { ok: false, code: 'unavailable', reasonCode: 'supabase_not_configured' };
  }
  const rawUrl = input.url.trim(), key = input.publishableKey.trim();
  if (rawUrl === '' || key === '') return { ok: false, code: 'unavailable', reasonCode: 'supabase_not_configured' };
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, code: 'validation_error', reasonCode: 'invalid_supabase_url' };
  }
  const loopback = LOOPBACK.has(url.hostname);
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
    return { ok: false, code: 'validation_error', reasonCode: 'insecure_supabase_url' };
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    return { ok: false, code: 'validation_error', reasonCode: 'invalid_supabase_url' };
  }
  if (/^sb_secret_/i.test(key)) return { ok: false, code: 'forbidden', reasonCode: 'secret_key_in_browser' };
  const jwtRole = decodeJwtRole(key);
  if (jwtRole !== null && jwtRole !== 'anon') return { ok: false, code: 'forbidden', reasonCode: 'secret_key_in_browser' };
  if (jwtRole === null && !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    return { ok: false, code: 'validation_error', reasonCode: 'unrecognized_publishable_key' };
  }
  return { ok: true, value: Object.freeze({ url: url.origin, publishableKey: key }) };
}
