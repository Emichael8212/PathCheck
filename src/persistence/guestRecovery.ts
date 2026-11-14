import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { GuestDraftSchema, readGuestDraft, RECOVERY_CLEAR_EVENTS, TimestampSchema } from '../contracts';
import type { GuestDraft, GuestRecoveryService, Result } from '../contracts';
import { checkPersistableProjection } from './projection';

/**
 * Subset of the Web Storage API used here (window.sessionStorage / window.localStorage).
 * `length`/`key` are optional: the session slot never needs them. Cross-tab recovery
 * needs them to enumerate snapshots; a local store without them is reported as
 * `recovery_cross_tab_unsupported` instead of being written blind.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length?: number;
  key?(index: number): string | null;
}

/** sessionStorage slot (one per tab). In localStorage it is the legacy pre-snapshot slot. */
export const GUEST_DRAFT_KEY = 'pathcheck.guestDraft.v1';
/** localStorage cross-tab snapshots: `<prefix><draftId>.<sha256 hex of the stored value>`. */
export const SHARED_DRAFT_PREFIX = 'pathcheck.guestDraft.v1.x.';

const sha256Hex = (text: string) => bytesToHex(sha256(new TextEncoder().encode(text)));
const serialize = (draft: GuestDraft) => JSON.stringify(draft);
const snapshotKey = (draftId: string, value: string) => `${SHARED_DRAFT_PREFIX}${draftId}.${sha256Hex(value)}`;
/** Storage key of the immutable cross-tab snapshot holding exactly `draft`. */
export function sharedDraftKey(draft: GuestDraft): string {
  return snapshotKey(draft.draftId, serialize(draft));
}

type Slot = 'session' | 'local';
const modeFor: Record<Slot, GuestDraft['mode']> = { session: 'session', local: 'cross_tab_opt_in' };

/**
 * Structured, no-PDF guest draft recovery (ARCHITECTURE §5/§8).
 *  - `session` mode: same-tab refresh / OTP / failed sign-in → this tab's sessionStorage slot.
 *  - `cross_tab_opt_in` mode: explicit opt-in (shared-device warning is U-owned) →
 *    same-origin localStorage only, lifetime ≤ 24h enforced by the contract schema.
 *
 * localStorage is shared by every tab without any cross-tab lock, so a read→write or
 * read→remove there is never atomic. Cross-tab drafts are therefore IMMUTABLE,
 * content-addressed snapshots: the key includes the SHA-256 of the exact stored value, so
 *  - a write can only ever (re)write identical bytes to its key — no tab overwrites another
 *    tab's draft or a different revision of the same draftId;
 *  - every removal names one exact snapshot. A stale decision (expired, corrupt, saved,
 *    superseded) can only delete the bytes it judged; a newer write lands on another key.
 * Superseded revisions are removed only when this service instance wrote or recovered them
 * (`owned`), never inferred from another tab's timestamps. Several valid cross-tab
 * candidates are a typed `conflict` (all copies preserved), never an arbitrary choice.
 * The session slot (tab-private) wins over shared snapshots.
 *
 * The legacy single localStorage slot (`GUEST_DRAFT_KEY`) is never written, and no automatic
 * path removes it: it is mutable and a pre-snapshot build in another tab may have rewritten
 * it. recover() reads a valid legacy draft as a candidate; an unusable legacy entry is
 * RETAINED and, when nothing else is recoverable, reported as `recovery_cleanup_failed`.
 * clearSavedGuestDraft never removes it (a legacy copy of the saved draftId → false), and
 * withdrawing or continuing a recovered legacy draft via stash() keeps it and reports
 * `recovery_cleanup_failed`. Only an explicit whole-scope clear(event) deletes it.
 */
export function createGuestRecoveryService(stores: { session: StorageLike | null; local: StorageLike | null }): GuestRecoveryService {
  const store = (slot: Slot) => (slot === 'session' ? stores.session : stores.local);
  const unavailable: Result<never> = { ok: false, code: 'unavailable', reasonCode: 'recovery_storage_unavailable' };
  const crossTabUnsupported: Result<never> = { ok: false, code: 'unavailable', reasonCode: 'recovery_cross_tab_unsupported' };
  const cleanupFailed: Result<never> = { ok: false, code: 'unavailable', reasonCode: 'recovery_cleanup_failed' };
  // A kept, otherwise-valid draft is newer than the supplied clock: not "nothing to recover".
  const clockBehind: Result<never> = { ok: false, code: 'unavailable', reasonCode: 'recovery_clock_behind_draft' };
  const ambiguous: Result<never> = { ok: false, code: 'conflict', reasonCode: 'recovery_multiple_shared_drafts' };

  /** Snapshot keys this instance wrote or returned from recover(), with their draftId. */
  const owned = new Map<string, string>();
  /** draftIds this instance returned from the legacy single local slot. */
  const adoptedLegacy = new Set<string>();

  const removeKey = (s: StorageLike, key: string): boolean => {
    try {
      s.removeItem(key);
      return true;
    } catch {
      return false;
    }
  };
  const remove = (slot: Slot, key = GUEST_DRAFT_KEY): boolean => {
    const s = store(slot);
    return s ? removeKey(s, key) : true;
  };

  /** Schema-valid, correctly placed, persistable draft — independent of any clock. */
  const wellFormedIn = (slot: Slot, parsed: unknown): GuestDraft | null => {
    const shape = GuestDraftSchema.safeParse(parsed);
    return shape.success && shape.data.mode === modeFor[slot] && checkPersistableProjection(shape.data.record, shape.data.plan).ok ? shape.data : null;
  };

  type Entry = { kind: 'unusable' } | { kind: 'future' | 'valid'; draft: GuestDraft };
  const parseJson = (raw: string): unknown => {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  };
  /** corrupt / wrong version / misplaced / expired → unusable; ahead of `now` → future (kept). */
  const classify = (slot: Slot, raw: string, now: string): Entry => {
    const parsed = parseJson(raw);
    const shape = wellFormedIn(slot, parsed);
    if (!shape) return { kind: 'unusable' };
    if (Date.parse(now) < Date.parse(shape.createdAt)) return { kind: 'future', draft: shape };
    return readGuestDraft(parsed, now) ? { kind: 'valid', draft: shape } : { kind: 'unusable' };
  };
  /** A snapshot is usable only if its key names exactly its own bytes and draftId. */
  const classifySnapshot = (key: string, raw: string, now: string): Entry => {
    const m = /^(.+)\.([0-9a-f]{64})$/s.exec(key.slice(SHARED_DRAFT_PREFIX.length));
    if (!m || sha256Hex(raw) !== m[2]) return { kind: 'unusable' };
    const entry = classify('local', raw, now);
    return entry.kind !== 'unusable' && entry.draft.draftId !== m[1] ? { kind: 'unusable' } : entry;
  };

  type Read = { ok: true; raw: string | null } | { ok: false };
  const read = (s: StorageLike, key: string): Read => {
    try {
      return { ok: true, raw: s.getItem(key) };
    } catch {
      return { ok: false };
    }
  };

  /** Snapshot keys present now; `unsupported` when the store cannot enumerate. */
  const listSnapshots = (): { ok: true; keys: string[] } | { ok: false; reason: 'unsupported' | 'unreadable' } => {
    const s = stores.local;
    if (!s) return { ok: true, keys: [] };
    if (typeof s.key !== 'function' || !('length' in s)) return { ok: false, reason: 'unsupported' };
    try {
      const keys: string[] = [];
      const n = Number(s.length);
      for (let i = 0; i < n; i++) {
        const k = s.key(i);
        if (k !== null && k.startsWith(SHARED_DRAFT_PREFIX)) keys.push(k);
      }
      return { ok: true, keys };
    } catch {
      return { ok: false, reason: 'unreadable' };
    }
  };

  type SlotRead = Result<GuestDraft | null> | { ok: 'deferred' } | { ok: 'retained' };
  /**
   * Session slot: unusable entries are removed (tab-private, no race), future ones kept.
   * Legacy local slot: mutable and shared with possible pre-snapshot builds in other tabs,
   * so automatic paths NEVER remove it; an unusable legacy entry is reported `retained`.
   * Only an explicit whole-scope clear(event) deletes it.
   */
  const readSlot = (slot: Slot, now: string): SlotRead => {
    const s = store(slot);
    if (!s) return { ok: true, value: null };
    const r = read(s, GUEST_DRAFT_KEY);
    if (!r.ok) return unavailable;
    if (r.raw === null) return { ok: true, value: null };
    const entry = classify(slot, r.raw, now);
    if (entry.kind === 'future') return { ok: 'deferred' };
    if (entry.kind === 'valid') return { ok: true, value: entry.draft };
    if (slot === 'local') return { ok: 'retained' };
    // Never report "nothing to recover" while an unusable (possibly expired, shared-device)
    // copy is still on disk: a failed deletion is a typed failure, not success/null.
    return remove(slot) ? { ok: true, value: null } : cleanupFailed;
  };

  type Scan = { cleanupFailed: boolean; unreadable: boolean; valid: Array<{ key: string; draft: GuestDraft }>; future: number };
  /** Validates every cross-tab snapshot; removes exactly the unusable ones it read. */
  const scanSnapshots = (now: string): Scan => {
    const scan: Scan = { cleanupFailed: false, unreadable: false, valid: [], future: 0 };
    const s = stores.local;
    const listed = listSnapshots();
    if (!s || !listed.ok) {
      if (!listed.ok && listed.reason === 'unreadable') scan.unreadable = true;
      return scan; // unsupported: this store never received snapshots from this module
    }
    for (const key of listed.keys) {
      const r = read(s, key);
      if (!r.ok) { scan.unreadable = true; continue; }
      if (r.raw === null) continue; // removed by another tab since enumeration
      const entry = classifySnapshot(key, r.raw, now);
      if (entry.kind === 'valid') scan.valid.push({ key, draft: entry.draft });
      else if (entry.kind === 'future') scan.future++;
      else if (!removeKey(s, key)) scan.cleanupFailed = true;
    }
    return scan;
  };

  /**
   * True while the legacy single slot may still hold a draft this instance recovered from it.
   * The legacy key is mutable (a pre-snapshot build in another tab could have rewritten it),
   * so it is never removed here: the copy is preserved and the caller gets a typed
   * cleanup failure instead of a false "withdrawn". Unreadable → cannot confirm → true.
   */
  const legacyRetained = (draftId: string): boolean => {
    if (!adoptedLegacy.has(draftId)) return false;
    const s = stores.local;
    const r = s ? read(s, GUEST_DRAFT_KEY) : { ok: true as const, raw: null };
    if (!r.ok) return true;
    const id = r.raw === null ? undefined : (parseJson(r.raw) as { draftId?: unknown } | undefined)?.draftId;
    if (id === draftId) return true;
    adoptedLegacy.delete(draftId); // gone (cleared/expired) or replaced by another draft
    return false;
  };

  /** True if this tab can still see any copy of `draftId`, or any session draft. */
  const anyCopyVisible = (draftId: string): boolean => {
    for (const slot of ['session', 'local'] as const) {
      const s = store(slot);
      if (!s) continue;
      const r = read(s, GUEST_DRAFT_KEY);
      if (!r.ok) return true;
      if (r.raw === null) continue;
      if (slot === 'session') return true;
      const id = (parseJson(r.raw) as { draftId?: unknown } | undefined)?.draftId;
      if (id === draftId) return true;
    }
    const listed = listSnapshots();
    if (!listed.ok) return listed.reason === 'unreadable';
    const mark = `${SHARED_DRAFT_PREFIX}${draftId}.`;
    return listed.keys.some(k => k.startsWith(mark) && /^[0-9a-f]{64}$/.test(k.slice(mark.length)));
  };

  /** Removes the snapshots of `draftId` this instance owns, except `keep`. */
  const removeOwned = (draftId: string, keep?: string): boolean => {
    const s = stores.local;
    let clean = true;
    for (const [key, id] of [...owned]) {
      if (id !== draftId || key === keep) continue;
      if (s && !removeKey(s, key)) { clean = false; continue; }
      owned.delete(key);
    }
    return clean;
  };

  /**
   * Save-triggered cleanup (A4). After a successful Save-as-new only stored copies
   * byte-identical to the saved draft are removed (the session slot by exact comparison,
   * shared snapshots by their content-addressed key). Unusable session/snapshot entries are
   * purged exactly as recover() would. The mutable legacy local slot is never removed here
   * (it may hold a newer write from a pre-snapshot tab): a legacy copy of this draftId
   * makes the result false. Valid but different entries (newer same-draftId edits, another
   * tab's draft, future-dated) are kept. Never throws.
   *
   * Returns true only when every removal succeeded, every slot was readable, and a
   * verification read AFTER the removals saw no copy of this draftId (any revision) and no
   * draft in this tab's session slot. Exact limit (no cross-tab lock exists in Web Storage):
   * a write by another tab that is not yet visible to this tab when the verification runs
   * cannot be excluded. Such a write is never deleted (removal names exact bytes) and the
   * next recover() finds it.
   */
  const clearSaved = (saved: GuestDraft, now: string): boolean => {
    const savedJson = serialize(saved);
    let clean = true;
    // This tab's own session slot (tab-private). The legacy local slot is only verified below.
    const ss = stores.session;
    const sr = ss ? read(ss, GUEST_DRAFT_KEY) : { ok: true as const, raw: null };
    if (!sr.ok) clean = false;
    else if (sr.raw !== null) {
      const entry = classify('session', sr.raw, now);
      if (entry.kind === 'unusable' || (entry.kind === 'valid' && serialize(entry.draft) === savedJson)) {
        if (!remove('session')) clean = false;
      } else clean = false; // kept, unsaved work
    }
    // Immutable shared snapshots.
    const s = stores.local;
    const listed = listSnapshots();
    if (!listed.ok) return listed.reason === 'unsupported' ? clean : false;
    const exact = sharedDraftKey(saved);
    for (const key of listed.keys) {
      const r = read(s!, key);
      if (!r.ok) { clean = false; continue; }
      if (r.raw === null) continue;
      const entry = classifySnapshot(key, r.raw, now);
      if (entry.kind === 'unusable' || (key === exact && entry.kind === 'valid' && r.raw === savedJson)) {
        if (removeKey(s!, key)) owned.delete(key);
        else clean = false;
        continue;
      }
      if (entry.draft.draftId === saved.draftId) clean = false; // newer/different revision kept
    }
    // Certify absence only from what this tab can see after its own removals.
    return clean && !anyCopyVisible(saved.draftId);
  };

  const service: GuestRecoveryService = {
    stash(draft) {
      const parsed = GuestDraftSchema.safeParse(draft);
      if (!parsed.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_guest_draft' };
      const projection = checkPersistableProjection(parsed.data.record, parsed.data.plan);
      if (!projection.ok) return projection;
      const value = serialize(parsed.data);
      if (parsed.data.mode === 'session') {
        const s = stores.session;
        if (!s) return unavailable;
        try {
          s.setItem(GUEST_DRAFT_KEY, value);
        } catch {
          return unavailable; // quota / disabled storage: caller keeps in-memory plan
        }
        // Declining/revoking opt-in withdraws this draft's own shared snapshots (exact keys
        // this instance wrote or recovered), never another tab's or an unseen revision. A
        // recovered legacy copy cannot be withdrawn safely: kept, reported as cleanup failure.
        const withdrawn = removeOwned(parsed.data.draftId);
        const legacyKept = legacyRetained(parsed.data.draftId);
        return withdrawn && !legacyKept ? { ok: true, value: null } : cleanupFailed;
      }
      const s = stores.local;
      if (!s) return unavailable;
      // A snapshot recover() could never enumerate is refused, never written blind.
      const probe = listSnapshots();
      if (!probe.ok) return probe.reason === 'unsupported' ? crossTabUnsupported : unavailable;
      const key = snapshotKey(parsed.data.draftId, value);
      try {
        s.setItem(key, value); // immutable: identical bytes or a fresh key, never a replacement
      } catch {
        return unavailable;
      }
      owned.set(key, parsed.data.draftId);
      // One tab keeps one copy: opting in moves this tab's session copy to the shared
      // snapshot and retires this instance's earlier snapshots of the same draft.
      // Each step is attempted independently; any leftover is a typed failure.
      const sessionMoved = remove('session');
      const retired = removeOwned(parsed.data.draftId, key);
      const legacyKept = legacyRetained(parsed.data.draftId); // continuing a legacy draft: old copy kept
      return sessionMoved && retired && !legacyKept ? { ok: true, value: null } : cleanupFailed; // new snapshot written
    },

    recover(now) {
      if (!TimestampSchema.safeParse(now).success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_clock' };
      const fromSession = readSlot('session', now);
      if (fromSession.ok === false) return fromSession;
      // Shared storage is always validated, even when this tab's session draft wins, so
      // expired/corrupt/misplaced snapshots are purged (exact keys). The mutable legacy slot
      // is only read; unusable legacy entries are retained until an explicit clear(event).
      const legacy = readSlot('local', now);
      const scan = scanSnapshots(now);
      if (scan.cleanupFailed) return cleanupFailed;
      // This tab's own session draft is ahead of the clock: do not fall back to a shared draft.
      if (fromSession.ok === 'deferred') return clockBehind;
      if (fromSession.ok === true && fromSession.value) return { ok: true, value: fromSession.value };
      if (legacy.ok === false || scan.unreadable) return unavailable;
      const legacyDraft = legacy.ok === true ? legacy.value : null;
      const candidates = scan.valid.length + scan.future + (legacy.ok === 'deferred' ? 1 : 0) + (legacyDraft ? 1 : 0);
      // An unusable legacy entry is retained (never auto-deleted): not "nothing to recover".
      if (candidates === 0) return legacy.ok === 'retained' ? cleanupFailed : { ok: true, value: null };
      if (candidates > 1) return ambiguous; // every copy preserved; no arbitrary "newest"
      if (scan.future === 1 || legacy.ok === 'deferred') return clockBehind;
      if (legacyDraft) {
        adoptedLegacy.add(legacyDraft.draftId); // later withdrawal/continuation must account for it
        return { ok: true, value: legacyDraft };
      }
      const only = scan.valid[0]!;
      owned.set(only.key, only.draft.draftId); // continuing this draft may retire this snapshot
      return { ok: true, value: only.draft };
    },

    clear(event) {
      if (!(RECOVERY_CLEAR_EVENTS as readonly string[]).includes(event)) return { ok: false, code: 'validation_error', reasonCode: 'invalid_clear_event' };
      // User-directed clear of the whole opted-in recovery scope on this device.
      // Every removal is attempted independently, even after an earlier one throws.
      const sessionCleared = remove('session');
      const legacyCleared = remove('local');
      let clean = sessionCleared && legacyCleared;
      const listed = listSnapshots();
      if (!listed.ok && listed.reason === 'unreadable') clean = false;
      if (listed.ok) for (const key of listed.keys) if (!remove('local', key)) clean = false;
      owned.clear();
      if (legacyCleared) adoptedLegacy.clear();
      return clean ? { ok: true, value: null } : cleanupFailed;
    },
  };
  const LEGACY_CHOICE = `${GUEST_DRAFT_KEY}#`;
  const failure = (code: 'conflict' | 'unresolved' | 'validation_error' | 'unavailable', reasonCode: string): Result<never> => ({ ok: false, code, reasonCode });

  /** Choices exist only for shared drafts; a session draft (valid or ahead of clock) has priority. */
  const sessionBlocks = (now: string): Result<never> | null => {
    const s = stores.session;
    if (!s) return null;
    const r = read(s, GUEST_DRAFT_KEY);
    if (!r.ok) return unavailable;
    if (r.raw === null) return null;
    return classify('session', r.raw, now).kind === 'unusable' ? null : failure('conflict', 'recovery_session_draft_present');
  };

  /** Read-only: every currently valid shared draft, each freshly validated. Deletes nothing. */
  const listChoices = (now: string): Result<GuestRecoveryChoice[]> => {
    const blocked = sessionBlocks(now);
    if (blocked) return blocked;
    const s = stores.local;
    if (!s) return { ok: true, value: [] };
    const choices: GuestRecoveryChoice[] = [];
    const listed = listSnapshots();
    if (!listed.ok && listed.reason === 'unreadable') return unavailable;
    for (const key of listed.ok ? listed.keys : []) {
      const r = read(s, key);
      if (!r.ok) return unavailable;
      if (r.raw === null) continue;
      const entry = classifySnapshot(key, r.raw, now);
      if (entry.kind === 'valid') choices.push({ selectionId: key, draft: entry.draft });
    }
    const lr = read(s, GUEST_DRAFT_KEY);
    if (!lr.ok) return unavailable;
    if (lr.raw !== null) {
      const entry = classify('local', lr.raw, now);
      if (entry.kind === 'valid') choices.push({ selectionId: `${LEGACY_CHOICE}${sha256Hex(lr.raw)}`, draft: entry.draft });
    }
    choices.sort((a, b) => (a.selectionId < b.selectionId ? -1 : a.selectionId > b.selectionId ? 1 : 0));
    return { ok: true, value: choices };
  };

  /**
   * Explicit user choice. Re-reads and re-validates the chosen entry now (never trusts a
   * stale list), deletes nothing, and records ownership so a later continuation/withdrawal
   * retires exactly the chosen snapshot (a chosen legacy draft stays under the legacy rules).
   */
  const selectChoice = (selectionId: string, now: string): Result<GuestDraft> => {
    const blocked = sessionBlocks(now);
    if (blocked) return blocked;
    const s = stores.local;
    const isLegacy = selectionId.startsWith(LEGACY_CHOICE) && /^[0-9a-f]{64}$/.test(selectionId.slice(LEGACY_CHOICE.length));
    if (!s || (!isLegacy && !selectionId.startsWith(SHARED_DRAFT_PREFIX))) return failure('validation_error', 'invalid_recovery_choice');
    const r = read(s, isLegacy ? GUEST_DRAFT_KEY : selectionId);
    if (!r.ok) return unavailable;
    if (r.raw === null) return failure('conflict', 'recovery_choice_missing');
    if (isLegacy && sha256Hex(r.raw) !== selectionId.slice(LEGACY_CHOICE.length)) return failure('conflict', 'recovery_choice_changed');
    const entry = isLegacy ? classify('local', r.raw, now) : classifySnapshot(selectionId, r.raw, now);
    if (entry.kind !== 'valid') return failure('unresolved', 'recovery_choice_unusable');
    if (isLegacy) adoptedLegacy.add(entry.draft.draftId);
    else owned.set(selectionId, entry.draft.draftId);
    return { ok: true, value: entry.draft };
  };

  internals.set(service, { clearSaved, listChoices, selectChoice });
  return service;
}

/** One shared draft the user may explicitly choose after recover() returned a multi-draft conflict. */
export interface GuestRecoveryChoice { selectionId: string; draft: GuestDraft }

/** S-internal capability registry; keeps the frozen GuestRecoveryService port unchanged. */
const internals = new WeakMap<GuestRecoveryService, {
  clearSaved: (saved: GuestDraft, now: string) => boolean;
  listChoices: (now: string) => Result<GuestRecoveryChoice[]>;
  selectChoice: (selectionId: string, now: string) => Result<GuestDraft>;
}>();
const choicesUnsupported: Result<never> = { ok: false, code: 'unavailable', reasonCode: 'recovery_choices_unsupported' };
const invalidClock: Result<never> = { ok: false, code: 'validation_error', reasonCode: 'invalid_clock' };

/**
 * After recover(now) returned `conflict` / `recovery_multiple_shared_drafts`: every currently
 * valid shared draft (schema, mode, TTL, privacy projection and snapshot hash checked on this
 * read), with an opaque `selectionId`. Read-only. A session draft has priority →
 * `recovery_session_draft_present`. Non-S services → `recovery_choices_unsupported`.
 */
export function listGuestRecoveryChoices(recovery: GuestRecoveryService, now: string): Result<GuestRecoveryChoice[]> {
  const i = internals.get(recovery);
  if (!i) return choicesUnsupported;
  if (!TimestampSchema.safeParse(now).success) return invalidClock;
  try {
    return i.listChoices(now);
  } catch {
    return { ok: false, code: 'unavailable', reasonCode: 'recovery_storage_unavailable' };
  }
}

/**
 * Explicit user selection of one listed choice. Freshly re-reads and re-validates it; never
 * falls back to another draft and deletes nothing. Missing → `conflict`/`recovery_choice_missing`;
 * changed legacy entry → `conflict`/`recovery_choice_changed`; now expired/invalid/future →
 * `unresolved`/`recovery_choice_unusable`; malformed id → `validation_error`/`invalid_recovery_choice`.
 */
export function selectGuestRecoveryChoice(recovery: GuestRecoveryService, selectionId: string, now: string): Result<GuestDraft> {
  const i = internals.get(recovery);
  if (!i) return choicesUnsupported;
  if (!TimestampSchema.safeParse(now).success) return invalidClock;
  if (typeof selectionId !== 'string') return { ok: false, code: 'validation_error', reasonCode: 'invalid_recovery_choice' };
  try {
    return i.selectChoice(selectionId, now);
  } catch {
    return { ok: false, code: 'unavailable', reasonCode: 'recovery_storage_unavailable' };
  }
}

/**
 * Removes only the stored copies of `saved` from a service created by
 * createGuestRecoveryService (see clearSaved). Returns `undefined` for any other
 * GuestRecoveryService implementation, which cannot be cleaned up safely through the
 * generic both-slot `clear('save')` port; callers must then leave recovery untouched.
 * An invalid clock removes nothing and returns false.
 */
export function clearSavedGuestDraft(recovery: GuestRecoveryService, saved: GuestDraft, now: string): boolean | undefined {
  const scoped = internals.get(recovery)?.clearSaved;
  if (!scoped) return undefined;
  if (!TimestampSchema.safeParse(now).success) return false;
  const parsed = GuestDraftSchema.safeParse(saved);
  if (!parsed.success) return false;
  try {
    return scoped(parsed.data, now);
  } catch {
    return false;
  }
}
