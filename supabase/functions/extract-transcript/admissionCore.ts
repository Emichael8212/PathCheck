import { ADMISSION_LIMITS, AdmissionRequestSchema, ConsentReceiptSchema, RevokeConsentRequestSchema, TicketClaimsSchema, TicketIssueRequestSchema } from '../../../src/contracts';
import type { GuestAdmissionService, Result, TicketClaims } from '../../../src/contracts';
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
type Context<E, M extends 'issueTicket' | 'admit'> = Omit<Parameters<GuestAdmissionService[M]>[1], 'eligibility'> & { eligibility: E };
export interface AdmissionService<E> {
  issueTicket(input: Parameters<GuestAdmissionService['issueTicket']>[0], context: Context<E, 'issueTicket'>): ReturnType<GuestAdmissionService['issueTicket']>;
  admit(input: Parameters<GuestAdmissionService['admit']>[0], context: Context<E, 'admit'>): ReturnType<GuestAdmissionService['admit']>;
  revokeConsent: GuestAdmissionService['revokeConsent'];
  finish: GuestAdmissionService['finish'];
}
export interface AdmissionCoreOptions<E> {
  store: AdmissionStore; bot: BotVerifier; signingSecret: string; allowedOrigin: string; disclosureVersion: string; now?: () => string;
  limits: (eligibility: E, now: string) => { dailyCostCeilingMicrousd: number; perRequestReservationMicrousd: number } | null;
  allowDocument: (digest: string) => boolean;
}
const denied = () => ({ ok: false, code: 'forbidden', reasonCode: 'admission_denied' } as const);
const unavailable = () => ({ ok: false, code: 'unavailable', reasonCode: 'admission_store_unavailable' } as const);
// Internal reusable mechanics. The public adapter is always paid-policy-bound;
// the separate local fixture composition lives under tests/, never in runtime.ts.
export function createAdmissionCore<E>(options: AdmissionCoreOptions<E>): AdmissionService<E> {
  const { store } = options;
  const validContext = (origin: string, session: string, network: string, eligibility: E, now: string) =>
    origin === options.allowedOrigin && /^https:\/\//.test(origin) && /^[a-f0-9-]{36}$/.test(session) && /^[A-Za-z0-9_-]{32,100}$/.test(network) && options.limits(eligibility, now) !== null;
  return {
    async issueTicket(input, context) {
      const request = TicketIssueRequestSchema.safeParse(input);
      if (!request.success || !options.allowDocument(request.data.documentDigest) || request.data.disclosureVersion !== options.disclosureVersion || !validContext(context.origin, context.serverSessionId, context.networkKey, context.eligibility, context.now)) return denied();
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
      if (!request.success || !validContext(context.origin, context.sessionId, context.networkKey, context.eligibility, context.now) || !options.allowDocument(context.documentDigest)) return denied();
      const limits = options.limits(context.eligibility, context.now);
      if (!limits) return denied();
      let claims: TicketClaims;
      try { claims = TicketClaimsSchema.parse(await verify(request.data.signedTicket, options.signingSecret, 'ticket')); } catch { return denied(); }
      if (claims.sessionId !== context.sessionId || claims.consentReceiptId !== request.data.consentReceiptId || claims.documentDigest !== context.documentDigest || Date.parse(claims.issuedAt) > Date.parse(context.now) || Date.parse(claims.expiresAt) <= Date.parse(context.now)) return denied();
      try {
        return await store.admit({ claims, networkKey: context.networkKey, now: context.now, dailyCostCeilingMicrousd: limits.dailyCostCeilingMicrousd, reservationMicrousd: limits.perRequestReservationMicrousd, leaseExpiresAt: new Date(Date.parse(context.now) + 120_000).toISOString() });
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

