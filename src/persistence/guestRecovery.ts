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
 * draftId) shared copy. A cross-tab stash never replaces another draftId's well-formed
 * shared draft: it returns typed `conflict` and writes nothing (explicit clear remains
 * the user's way to discard it); an unreadable shared slot is never written blind. Recover validates the supplied clock and deletes corrupt,
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

  /** Schema-valid, correctly placed, persistable draft — independent of any clock. */
  const wellFormedIn = (slot: Slot, parsed: unknown): GuestDraft | null => {
    const shape = GuestDraftSchema.safeParse(parsed);
    return shape.success && shape.data.mode === modeFor[slot] && checkPersistableProjection(shape.data.record, shape.data.plan).ok ? shape.data : null;
  };

  /**
   * The shared slot holds one draft. Before a cross-tab write, refuse to replace another
   * draftId's well-formed draft (another tab's opted-in work). stash() has no clock, so it
   * does not judge expiry: an expired foreign draft is purged by recover(now) or an
   * explicit clear, never inferred from the writer's possibly skewed createdAt.
   * Corrupt / wrong-version / misplaced entries are not recoverable drafts and may be
   * replaced (recover() would delete them). Unreadable slot → do not write blind.
   */
  const sharedSlotWritableBy = (draftId: string): Result<null> => {
    const s = store('local');
    if (!s) return unavailable;
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
      return { ok: true, value: null };
    }
    const existing = wellFormedIn('local', parsed);
    return existing && existing.draftId !== draftId ? { ok: false, code: 'conflict', reasonCode: 'recovery_shared_draft_exists' } : { ok: true, value: null };
  };

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
    const shape = wellFormedIn(slot, parsed);
    if (shape && Date.parse(now) < Date.parse(shape.createdAt)) return { ok: 'deferred' };
    const draft = shape ? readGuestDraft(parsed, now) : null;
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
      if (target === 'local') {
        const writable = sharedSlotWritableBy(parsed.data.draftId);
        if (!writable.ok) return writable; // nothing written; this tab's session copy kept
      }
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
