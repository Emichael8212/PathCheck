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
 * One tab writes one copy at a time; a session-mode stash removes only its own (same
 * draftId) shared copy. Recover validates the supplied clock and deletes corrupt,
 * wrong-version, expired or mode/slot-mismatched entries in BOTH slots (session wins when
 * both are valid). Otherwise-valid future-dated entries are kept and reported as typed
 * `unavailable` (caller clock behind the draft), never deleted; no TTL grace is added.
 * Clear (save/cancel/expiry/sign_out) removes both slots. Never creates cloud records.
 */
export function createGuestRecoveryService(stores: { session: StorageLike | null; local: StorageLike | null }): GuestRecoveryService {
  const store = (slot: Slot) => (slot === 'session' ? stores.session : stores.local);
  const unavailable: Result<never> = { ok: false, code: 'unavailable', reasonCode: 'recovery_storage_unavailable' };
  const cleanupFailed: Result<never> = { ok: false, code: 'unavailable', reasonCode: 'recovery_cleanup_failed' };
  // A kept, otherwise-valid draft is newer than the supplied clock: not "nothing to recover".
  const clockBehind: Result<never> = { ok: false, code: 'unavailable', reasonCode: 'recovery_clock_behind_draft' };

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

  type SlotRead = Result<GuestDraft | null> | { ok: 'deferred' };

  /**
   * A structurally valid, correctly placed draft whose createdAt is after the caller's
   * clock is most likely a fresh write by another tab (stale/skewed `now`), not garbage:
   * it is kept on disk and reported as unusable-for-now, never deleted.
   */
  const readSlot = (slot: Slot, now: string): SlotRead => {
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
    const shape = GuestDraftSchema.safeParse(parsed);
    const wellFormed = shape.success && shape.data.mode === modeFor[slot] && checkPersistableProjection(shape.data.record, shape.data.plan).ok;
    if (wellFormed && Date.parse(now) < Date.parse(shape.data.createdAt)) return { ok: 'deferred' };
    const draft = wellFormed ? readGuestDraft(parsed, now) : null;
    if (!draft) {
      // corrupt / wrong version / expired / misplaced. Never report "nothing to recover"
      // while the unusable (possibly expired, shared-device) copy is still on disk: a
      // failed deletion is a typed failure, not success/null.
      return remove(slot) ? { ok: true, value: null } : cleanupFailed;
    }
    return { ok: true, value: draft };
  };

  /**
   * Downgrade to session mode removes the shared copy only when it is this draft's own
   * earlier cross-tab copy (same draftId). Another tab's opted-in draft is left intact;
   * expired/corrupt shared entries are purged by recover(), not by an unrelated stash.
   * If the shared slot cannot be read we cannot prove our own copy is gone → typed failure.
   */
  const removeOwnSharedCopy = (draftId: string): boolean => {
    const s = store('local');
    if (!s) return true;
    let raw: string | null;
    try {
      raw = s.getItem(GUEST_DRAFT_KEY);
    } catch {
      return false;
    }
    if (raw === null) return true;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return true; // not attributable to this draft; recover() purges corrupt entries
    }
    const id = typeof parsed === 'object' && parsed !== null ? (parsed as { draftId?: unknown }).draftId : undefined;
    return id === draftId ? remove('local') : true;
  };

  return {
    stash(draft) {
      const parsed = GuestDraftSchema.safeParse(draft);
      if (!parsed.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_guest_draft' };
      const projection = checkPersistableProjection(parsed.data.record, parsed.data.plan);
      if (!projection.ok) return projection;
      const target: Slot = parsed.data.mode === 'session' ? 'session' : 'local';
      const s = store(target);
      if (!s) return unavailable;
      try {
        s.setItem(GUEST_DRAFT_KEY, JSON.stringify(parsed.data));
      } catch {
        return unavailable; // quota / disabled storage: caller keeps in-memory plan
      }
      // One tab keeps one copy. Opting in moves this tab's own session copy to the shared
      // slot. Declining/revoking removes only this draft's own shared copy (same draftId),
      // never another tab's opted-in draft.
      const cleaned = target === 'local' ? remove('session') : removeOwnSharedCopy(parsed.data.draftId);
      if (!cleaned) return cleanupFailed; // new copy written; own stale copy may remain
      return { ok: true, value: null };
    },

    recover(now) {
      if (!TimestampSchema.safeParse(now).success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_clock' };
      const fromSession = readSlot('session', now);
      if (fromSession.ok === false) return fromSession;
      // The shared localStorage slot is always validated, even when this tab's session
      // draft wins, so an expired/corrupt/misplaced shared-device copy is purged rather
      // than left on disk unnoticed. A valid or future-dated cross-tab copy is kept.
      const fromLocal = readSlot('local', now);
      if (fromLocal.ok === false && fromLocal.reasonCode === 'recovery_cleanup_failed') return fromLocal;
      // This tab's own session draft is ahead of the clock: do not fall back to a shared
      // draft that a later stash would then overwrite the newer session draft with.
      if (fromSession.ok === 'deferred') return clockBehind;
      if (fromSession.value) return fromSession;
      if (fromLocal.ok === 'deferred') return clockBehind;
      return fromLocal;
    },

    clear(event) {
      if (!(RECOVERY_CLEAR_EVENTS as readonly string[]).includes(event)) return { ok: false, code: 'validation_error', reasonCode: 'invalid_clear_event' };
      const a = remove('session'), b = remove('local');
      return a && b ? { ok: true, value: null } : cleanupFailed;
    },
  };
}
