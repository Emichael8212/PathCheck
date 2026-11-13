import { ADMISSION_LIMITS, AdmissionRequestSchema, ConsentReceiptSchema, ProcessingEligibilitySchema, RevokeConsentRequestSchema, TicketClaimsSchema, TicketIssueRequestSchema } from '../../../src/contracts';
import type { GuestAdmissionService, ProcessingEligibility, Result, TicketClaims } from '../../../src/contracts';
import type { z } from 'zod';
import { sha256, sign, verify } from './crypto';

/** Private transport port; SQL/RPC naming awaits L/S review. No process-local store exists. */
export interface AdmissionStore {
  issue(input: { claims: TicketClaims; consentReceipt: z.infer<typeof ConsentReceiptSchema>; attestationDigest: string; networkKey: string; now: string }): Promise<Result<null>>;
  admit(input: { claims: TicketClaims; networkKey: string; now: string; dailyCostCeilingMicrousd: number; reservationMicrousd: number; leaseExpiresAt: string }): Promise<Result<{ reservationId: string }>>;
  dispatch(input: { reservationId: string; sessionId: string; now: string }): Promise<Result<null>>;
  revoke(input: { consentReceiptId: string; sessionId: string; now: string }): Promise<Result<null>>;
  finish(input: { reservationId: string; actualCostMicrousd: number; outcome: 'success' | 'failed'; now: string }): Promise<Result<null>>;
}
export interface BotVerifier { verify(token: string, now: string): Promise<boolean> }
const denied = () => ({ ok: false, code: 'forbidden', reasonCode: 'admission_denied' } as const);
const unavailable = () => ({ ok: false, code: 'unavailable', reasonCode: 'admission_store_unavailable' } as const);
export function approved(eligibility: ProcessingEligibility, now: string): eligibility is Extract<ProcessingEligibility, { status: 'approved' }> {
  const parsed = ProcessingEligibilitySchema.safeParse(eligibility);
  return parsed.success && parsed.data.status === 'approved' && Number.isFinite(Date.parse(now)) && Date.parse(parsed.data.approvedUntil) > Date.parse(now)
    && Number.isSafeInteger(parsed.data.dailyCostCeilingMicrousd) && Number.isSafeInteger(parsed.data.perRequestReservationMicrousd)
    && parsed.data.perRequestReservationMicrousd <= parsed.data.dailyCostCeilingMicrousd;
}
export function createGuestAdmission(options: { store: AdmissionStore; bot: BotVerifier; signingSecret: string; allowedOrigin: string; disclosureVersion: string; now?: () => string }): GuestAdmissionService {
  const { store } = options;
  const validContext = (origin: string, session: string, network: string, eligibility: ProcessingEligibility, now: string) =>
    origin === options.allowedOrigin && /^https:\/\//.test(origin) && /^[a-f0-9-]{36}$/.test(session) && /^[A-Za-z0-9_-]{32,100}$/.test(network) && approved(eligibility, now);
  return {
    async issueTicket(input, context) {
      const request = TicketIssueRequestSchema.safeParse(input);
      if (!request.success || request.data.disclosureVersion !== options.disclosureVersion || !validContext(context.origin, context.serverSessionId, context.networkKey, context.eligibility, context.now)) return denied();
      try {
        if (!await options.bot.verify(request.data.botAttestation, context.now)) return denied();
        const claims: TicketClaims = { schemaVersion: 1, ticketId: crypto.randomUUID(), sessionId: context.serverSessionId, consentReceiptId: crypto.randomUUID(), audience: 'extract-transcript', documentDigest: request.data.documentDigest, issuedAt: context.now, expiresAt: new Date(Date.parse(context.now) + ADMISSION_LIMITS.ticketTtlSeconds * 1000).toISOString() };
        const consentReceipt = ConsentReceiptSchema.parse({ receiptId: claims.consentReceiptId, sessionId: claims.sessionId, disclosureVersion: options.disclosureVersion, processor: 'gemini', purpose: 'course_extraction', grantedAt: context.now, revokedAt: null });
        const signedTicket = await sign(claims, options.signingSecret, 'ticket');
        const result = await store.issue({ claims, consentReceipt, attestationDigest: await sha256(new TextEncoder().encode(request.data.botAttestation)), networkKey: context.networkKey, now: context.now });
        return result.ok ? { ok: true, value: { signedTicket, consentReceiptId: claims.consentReceiptId, expiresAt: claims.expiresAt } } : result;
      } catch { return unavailable(); }
    },
    async admit(input, context) {
      const request = AdmissionRequestSchema.safeParse(input);
      if (!request.success || !validContext(context.origin, context.sessionId, context.networkKey, context.eligibility, context.now) || !approved(context.eligibility, context.now)) return denied();
      let claims: TicketClaims;
      try { claims = TicketClaimsSchema.parse(await verify(request.data.signedTicket, options.signingSecret, 'ticket')); } catch { return denied(); }
      if (claims.sessionId !== context.sessionId || claims.consentReceiptId !== request.data.consentReceiptId || claims.documentDigest !== context.documentDigest || Date.parse(claims.issuedAt) > Date.parse(context.now) || Date.parse(claims.expiresAt) <= Date.parse(context.now)) return denied();
      try {
        return await store.admit({ claims, networkKey: context.networkKey, now: context.now, dailyCostCeilingMicrousd: context.eligibility.dailyCostCeilingMicrousd, reservationMicrousd: context.eligibility.perRequestReservationMicrousd, leaseExpiresAt: new Date(Date.parse(context.now) + 120_000).toISOString() });
      } catch { return unavailable(); }
    },
    async revokeConsent(input, context) {
      const parsed = RevokeConsentRequestSchema.safeParse(input);
      if (!parsed.success || !/^[a-f0-9-]{36}$/.test(context.serverSessionId) || !Number.isFinite(Date.parse(context.now))) return denied();
      try { return await store.revoke({ consentReceiptId: parsed.data.consentReceiptId, sessionId: context.serverSessionId, now: context.now }); } catch { return unavailable(); }
    },
    async finish(reservationId, actualCostMicrousd, outcome) {
      if (!Number.isSafeInteger(actualCostMicrousd) || actualCostMicrousd < 0) return denied();
      try { return await store.finish({ reservationId, actualCostMicrousd, outcome, now: (options.now ?? (() => new Date().toISOString()))() }); } catch { return unavailable(); }
    },
  };
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
