import { ProcessingEligibilitySchema } from '../../../src/contracts';
import type { GuestAdmissionService, ProcessingEligibility } from '../../../src/contracts';
import { createAdmissionCore } from './admissionCore';
import type { AdmissionStore, BotVerifier } from './admissionCore';
export type { AdmissionStore, BotVerifier } from './admissionCore';

export function approved(eligibility: ProcessingEligibility, now: string): eligibility is Extract<ProcessingEligibility, { status: 'approved' }> {
  const parsed = ProcessingEligibilitySchema.safeParse(eligibility);
  return parsed.success && parsed.data.status === 'approved' && Number.isFinite(Date.parse(now)) && Date.parse(parsed.data.approvedUntil) > Date.parse(now)
    && Number.isSafeInteger(parsed.data.dailyCostCeilingMicrousd) && Number.isSafeInteger(parsed.data.perRequestReservationMicrousd)
    && parsed.data.perRequestReservationMicrousd <= parsed.data.dailyCostCeilingMicrousd;
}
export function createGuestAdmission(options: { store: AdmissionStore; bot: BotVerifier; signingSecret: string; allowedOrigin: string; disclosureVersion: string; now?: () => string }): GuestAdmissionService {
  return createAdmissionCore({ ...options, allowDocument: () => true,
    limits: (eligibility: ProcessingEligibility, now) => approved(eligibility, now) ? eligibility : null });
}

/** Cloudflare Siteverify is performed once, at issuance. Its body is never logged. */
export function createTurnstileVerifier(options: { secret: string; hostname: string; audience: string; fetch?: typeof fetch }): BotVerifier {
  return { async verify(token, now) {
    if (!options.secret || !options.hostname || !options.audience || token.length > 2048) return false;
    try {
      const response = await (options.fetch ?? fetch)('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: options.secret, response: token }), signal: AbortSignal.timeout(10_000), redirect: 'error' });
      if (!response.ok) return false;
      const value = await response.json() as Record<string, unknown>;
      const age = typeof value.challenge_ts === 'string' ? Date.parse(now) - Date.parse(value.challenge_ts) : NaN;
      return value.success === true && value.hostname === options.hostname && value.action === 'extract-transcript' && value.cdata === options.audience && age >= 0 && age <= 300_000;
    } catch { return false; }
  } };
}
