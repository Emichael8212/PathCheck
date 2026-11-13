import type { Result } from '../contracts';

/** Bearer credentials for one authenticated principal. Never persisted or logged by S. */
export interface AccessSession { readonly accessToken: string; readonly userId: string }

/**
 * Port consumed by persistence. Implemented by the Supabase auth service; tests may
 * supply a provider holding tokens issued by a real local/test Auth server.
 * `null` means no authenticated user (guest).
 *
 * `isCurrent` (optional) reports whether a session previously returned by `getSession`
 * still belongs to the same login (same principal, not signed out or replaced). Token
 * refreshes within one login keep it current. Persistence uses it to refuse delivering
 * a response that was requested under a login that has since ended.
 */
export interface SessionProvider {
  getSession(): Promise<Result<AccessSession | null>>;
  isCurrent?(session: AccessSession): boolean;
}
