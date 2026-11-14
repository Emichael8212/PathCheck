import { createSupabaseAuth } from '../auth';
import { createGuestRecoveryService, createSupabaseStorage, parsePublicSupabaseConfig } from '../persistence';
import type { FetchLike, StorageLike } from '../persistence';
import type { AccountPorts } from '../ui/services';

/** Compose the existing S services; database grants/RLS remain the authorization boundary. */
export function createAccountPorts(
  input: { url: unknown; publishableKey: unknown },
  stores: { session: StorageLike | null; local: StorageLike | null },
  send: FetchLike = (url, init) => fetch(url, init),
): AccountPorts | null {
  const config = parsePublicSupabaseConfig(input);
  if (!config.ok) return null; // No network request or secret-bearing error output.
  const auth = createSupabaseAuth(config.value, { fetch: send });
  const storage = createSupabaseStorage(config.value, { fetch: send, session: auth });
  const recovery = createGuestRecoveryService(stores);
  return Object.freeze({ auth, storage, recovery });
}

/** Storage getters can throw when browser storage is disabled. Guest planning still works. */
export function browserRecoveryStores(): { session: StorageLike | null; local: StorageLike | null } {
  let session: StorageLike | null = null, local: StorageLike | null = null;
  try { session = window.sessionStorage; } catch { /* recovery unavailable, not a sign-in bypass */ }
  try { local = window.localStorage; } catch { /* explicit opt-in remains required by S */ }
  return { session, local };
}
