import { GuestDraftSchema, readGuestDraft, RECOVERY_CLEAR_EVENTS, TimestampSchema } from '../contracts';
import type { GuestDraft, GuestRecoveryService, Result } from '../contracts';
import { checkPersistableProjection } from './projection';

/** Subset of the Web Storage API used here (window.sessionStorage / window.localStorage). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const GUEST_DRAFT_KEY = 'pathcheck.guestDraft.v1';

type Slot = 'session' | 'local';
const modeFor: Record<Slot, GuestDraft['mode']> = { session: 'session', local: 'cross_tab_opt_in' };

/**
 * Structured, no-PDF guest draft recovery (ARCHITECTURE §5/§8).
 *  - `session` mode: same-tab refresh / OTP / failed sign-in → sessionStorage only.
 *  - `cross_tab_opt_in` mode: explicit opt-in (shared-device warning is U-owned) →
 *    same-origin localStorage only, lifetime ≤ 24h enforced by the contract schema.
 * Exactly one copy exists at a time. Recover validates the supplied clock and deletes
 * corrupt, wrong-version, future-dated, expired or mode/slot-mismatched entries.
 * Clear (save/cancel/expiry/sign_out) removes both slots. Never creates cloud records.
 */
export function createGuestRecoveryService(stores: { session: StorageLike | null; local: StorageLike | null }): GuestRecoveryService {
  const store = (slot: Slot) => (slot === 'session' ? stores.session : stores.local);
  const unavailable: Result<never> = { ok: false, code: 'unavailable', reasonCode: 'recovery_storage_unavailable' };
  const cleanupFailed: Result<never> = { ok: false, code: 'unavailable', reasonCode: 'recovery_cleanup_failed' };

  const remove = (slot: Slot): boolean => {
    const s = store(slot);
    if (!s) return true;
    try {
      s.removeItem(GUEST_DRAFT_KEY);
      return true;
    } catch {
      return false;
    }
  };

  const readSlot = (slot: Slot, now: string): Result<GuestDraft | null> => {
    const s = store(slot);
    if (!s) return { ok: true, value: null };
    let raw: string | null;
    try {
      raw = s.getItem(GUEST_DRAFT_KEY);
    } catch {
      return unavailable;
    }
    if (raw === null) return { ok: true, value: null };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    const draft = readGuestDraft(parsed, now);
    const valid = draft !== null && draft.mode === modeFor[slot] && checkPersistableProjection(draft.record, draft.plan).ok;
    if (!valid) {
      // corrupt / wrong version / future-dated / expired / misplaced. Never report
      // "nothing to recover" while the unusable (possibly expired, shared-device) copy
      // is still on disk: a failed deletion is a typed failure, not success/null.
      return remove(slot) ? { ok: true, value: null } : cleanupFailed;
    }
    return { ok: true, value: draft };
  };

  return {
    stash(draft) {
      const parsed = GuestDraftSchema.safeParse(draft);
      if (!parsed.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_guest_draft' };
      const projection = checkPersistableProjection(parsed.data.record, parsed.data.plan);
      if (!projection.ok) return projection;
      const target: Slot = parsed.data.mode === 'session' ? 'session' : 'local';
      const other: Slot = target === 'session' ? 'local' : 'session';
      const s = store(target);
      if (!s) return unavailable;
      try {
        s.setItem(GUEST_DRAFT_KEY, JSON.stringify(parsed.data));
      } catch {
        return unavailable; // quota / disabled storage: caller keeps in-memory plan
      }
      // Declining or revoking cross-tab opt-in must not leave a localStorage copy behind.
      if (!remove(other)) return cleanupFailed; // new copy written; stale other copy remains
      return { ok: true, value: null };
    },

    recover(now) {
      if (!TimestampSchema.safeParse(now).success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_clock' };
      const fromSession = readSlot('session', now);
      if (!fromSession.ok || fromSession.value) return fromSession;
      return readSlot('local', now);
    },

    clear(event) {
      if (!(RECOVERY_CLEAR_EVENTS as readonly string[]).includes(event)) return { ok: false, code: 'validation_error', reasonCode: 'invalid_clear_event' };
      const a = remove('session'), b = remove('local');
      return a && b ? { ok: true, value: null } : cleanupFailed;
    },
  };
}
