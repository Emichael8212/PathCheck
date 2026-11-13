import { vi } from 'vitest';
import type { AdmissionStore } from '../../../supabase/functions/extract-transcript/admission';
import type { ProcessingEligibility } from '../../../src/contracts';
export const time = '2026-11-12T12:00:00.000Z';
export const eligibility: ProcessingEligibility = { status: 'approved', reviewId: 'synthetic-review-only', termsVersion: 'synthetic-terms', paidProjectId: 'synthetic-project', approvedUntil: '2026-11-13T00:00:00Z', dailyCostCeilingMicrousd: 1000, perRequestReservationMicrousd: 100 };
export const context = { serverSessionId: '00000000-0000-4000-8000-000000000001', networkKey: 'n'.repeat(43), origin: 'https://pathcheck.test', now: time, eligibility };
export const issue = { botAttestation: 'synthetic-proof', disclosureVersion: 'v1', explicitConsent: true as const, documentDigest: 'a'.repeat(64) };
export const secret = 'synthetic-test-only-secret-key-000000000';
export function storeDouble() {
  return { issue: vi.fn<AdmissionStore['issue']>().mockResolvedValue({ ok: true, value: null }), admit: vi.fn<AdmissionStore['admit']>().mockResolvedValue({ ok: true, value: { reservationId: 'reservation-test' } }), dispatch: vi.fn<AdmissionStore['dispatch']>().mockResolvedValue({ ok: true, value: null }), revoke: vi.fn<AdmissionStore['revoke']>().mockResolvedValue({ ok: true, value: null }), finish: vi.fn<AdmissionStore['finish']>().mockResolvedValue({ ok: true, value: null }) };
}
