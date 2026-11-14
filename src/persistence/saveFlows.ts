import { GuestDraftSchema, SaveIntentSchema } from '../contracts';
import type { GuestDraft, GuestRecoveryService, Result, SavedPlan, StorageService } from '../contracts';
import { clearSavedGuestDraft } from './guestRecovery';

/**
 * Guest → account migration. Always Save as new (server-generated identity), even if
 * the account already owns plans; never merges or overwrites. Recovery is cleared only
 * after the cloud copy exists; on any failure the local draft is retained untouched.
 * The caller must adopt the returned identity (new planId, revision 0) and re-analyse.
 */
export async function saveGuestDraftAsNew(draft: GuestDraft, deps: { storage: StorageService; recovery: GuestRecoveryService; now?: () => string }): Promise<Result<{ saved: SavedPlan; recoveryCleared: boolean }>> {
  const parsed = GuestDraftSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_guest_draft' };
  const created = await deps.storage.createPlan(parsed.data.record, parsed.data.plan);
  if (!created.ok) return created;
  // Cleanup is scoped to the saved draft (A4). The generic clear('save') removes BOTH
  // slots and would delete another tab's unrelated opted-in draft, or a newer edit stashed
  // while the request was in flight. Only stored copies byte-identical to the submitted
  // draft are removed; unrelated/newer drafts are preserved. The cloud copy already exists,
  // so any read/remove failure or a non-S recovery port still reports a successful save,
  // with recoveryCleared:false. recoveryCleared:true means this tab's post-removal check saw
  // no copy of the draft; another tab's write not yet visible to this tab cannot be excluded
  // (it is never deleted, and the next recover() finds it). See clearSavedGuestDraft.
  let cleared: boolean | undefined;
  try {
    const now = (deps.now ?? (() => new Date().toISOString()))();
    cleared = clearSavedGuestDraft(deps.recovery, parsed.data, now);
  } catch {
    cleared = false;
  }
  return { ok: true, value: { saved: created.value, recoveryCleared: cleared === true } };
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
