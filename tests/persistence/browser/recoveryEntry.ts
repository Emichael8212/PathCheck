// Browser bundle entry for recoveryTwoTab.test.ts: exposes the ACTUAL S recovery module
// (no test doubles for storage) to real Chromium tabs. Synthetic draft data only.
import { clearSavedGuestDraft, createGuestRecoveryService, GUEST_DRAFT_KEY, SHARED_DRAFT_PREFIX, sharedDraftKey } from '../../../src/persistence/guestRecovery';
import { draft } from '../helpers';

(window as unknown as Record<string, unknown>).PC = { clearSavedGuestDraft, createGuestRecoveryService, GUEST_DRAFT_KEY, SHARED_DRAFT_PREFIX, sharedDraftKey, draft };
