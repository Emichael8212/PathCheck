// Explicitly synthetic boot fixture, never used by the default function entry.
// The test does not exercise SQL, a real gateway, bot service or hosted isolation.
import { createGuestAdmission } from '../../../supabase/functions/extract-transcript/admission';
import type { TranscriptHostBindings } from '../../../supabase/functions/extract-transcript/entry';
const origin = 'https://synthetic.pathcheck.test';
const secret = 'synthetic-entry-secret-not-for-real-use-00000';
const denied = async () => ({ ok: false as const, code: 'forbidden' as const, reasonCode: 'synthetic_store_denied' });
const store = { issue: denied, admit: denied, dispatch: denied, revoke: denied, finish: denied };
export const hostBindings: TranscriptHostBindings = {
  readSecret: name => name === 'GEMINI_API_KEY' ? 'synthetic-never-a-real-key' : 'synthetic-model',
  reviewedPolicy: { modelId: 'synthetic-model', maxInputTokens: 1000, maxOutputTokens: 1000,
    inputMicrousdPerMillionTokens: 1000, outputMicrousdPerMillionTokens: 1000 },
  send: async () => { throw new Error('provider_must_not_run'); },
  endpoint: { allowedOrigin: origin, disclosureVersion: 'v1', sessionSecret: secret,
    eligibility: () => ({ status: 'approved', reviewId: 'synthetic-only', termsVersion: 'synthetic-only',
      paidProjectId: 'synthetic-only-not-a-real-project', approvedUntil: '2026-11-13T00:00:00Z',
      dailyCostCeilingMicrousd: 1000, perRequestReservationMicrousd: 100 }),
    now: () => '2026-11-12T12:00:00Z', store,
    admission: createGuestAdmission({ store, bot: { verify: async () => false }, signingSecret: secret,
      allowedOrigin: origin, disclosureVersion: 'v1' }),
    resolveNetwork: async request => request.headers.get('x-synthetic-test-proof') === 'synthetic' ? 'n'.repeat(43) : null,
    pdf: { inspect: async () => { throw new Error('parser_must_not_run'); } },
    authorizeRetry: denied, authorizeEgress: denied,
  },
};
