import { GuestDraftSchema, SaveIntentSchema } from '../contracts';
import type { GuestDraft, GuestRecoveryService, Result, SavedPlan, StorageService } from '../contracts';

/**
 * Guest → account migration. Always Save as new (server-generated identity), even if
 * the account already owns plans; never merges or overwrites. Recovery is cleared only
 * after the cloud copy exists; on any failure the local draft is retained untouched.
 * The caller must adopt the returned identity (new planId, revision 0) and re-analyse.
 */
export async function saveGuestDraftAsNew(draft: GuestDraft, deps: { storage: StorageService; recovery: GuestRecoveryService; now?: () => string }): Promise<Result<{ saved: SavedPlan; recoveryCleared: boolean }>> {
  const parsed = GuestDraftSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_guest_draft' };
  const submitted = JSON.stringify(parsed.data);
  const created = await deps.storage.createPlan(parsed.data.record, parsed.data.plan);
  if (!created.ok) return created;
  // Race guard: while the request was in flight the student may have kept editing and a
  // newer draft was stashed. Clearing it would lose unsaved work on the next refresh, so
  // clear only if the stored draft is still exactly the one that was saved (or absent).
  const now = (deps.now ?? (() => new Date().toISOString()))();
  const stored = deps.recovery.recover(now);
  if (stored.ok && stored.value !== null && JSON.stringify(GuestDraftSchema.parse(stored.value)) !== submitted) {
    return { ok: true, value: { saved: created.value, recoveryCleared: false } };
  }
  const cleared = deps.recovery.clear('save');
  return { ok: true, value: { saved: created.value, recoveryCleared: cleared.ok } };
}

/**
 * Executes an explicit, user-chosen SaveIntent. `create_new` is the default; overwriting
 * requires `update_owned` with the stored CAS revision the user last saw. Conflicts are
 * returned, never retried blindly or downgraded to last-write-wins.
 */
export async function executeSaveIntent(intent: unknown, storage: StorageService): Promise<Result<SavedPlan>> {
  const parsed = SaveIntentSchema.safeParse(intent);
  if (!parsed.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_save_intent' };
  const i = parsed.data;
  return i.kind === 'create_new'
    ? storage.createPlan(i.record, i.plan)
    : storage.savePlan(i.id, i.expectedRevision, i.record, i.plan);
}
