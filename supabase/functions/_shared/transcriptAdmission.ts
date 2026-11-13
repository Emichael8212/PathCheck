// Server-only composition port. Never import from a browser entry point.
import { z } from 'zod';
import { ConsentReceiptSchema, TicketClaimsSchema, TimestampSchema } from '../../../src/contracts';
import type { Result, TicketClaims } from '../../../src/contracts';

const rpcNames = ['admission_issue', 'admission_admit', 'admission_dispatch', 'admission_retry_check', 'admission_revoke', 'admission_finish'] as const;
type RpcName = typeof rpcNames[number];
export type AdmissionRpc = (name: RpcName, args: Record<string, unknown>) => Promise<unknown>;
const Key = z.string().regex(/^[A-Za-z0-9_-]{32,100}$/);
const NetworkKeys = z.array(Key).min(1).max(2).refine(keys => new Set(keys).size === keys.length);
const Money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const Reply = z.object({ status: z.enum(['ok', 'denied', 'rate_limited', 'conflict']), reason: z.string().optional() });
const unavailable = (): Result<never> => ({ ok: false, code: 'unavailable', reasonCode: 'admission_store_unavailable' });
function denial(value: unknown): Result<null> {
  const parsed = Reply.safeParse(value);
  if (!parsed.success) return unavailable();
  const { status, reason } = parsed.data;
  if (status === 'ok') return { ok: true, value: null };
  if (reason === 'consent_revoked') return { ok: false, code: 'forbidden', reasonCode: 'consent_revoked' };
  if (status === 'rate_limited') return { ok: false, code: 'rate_limited', reasonCode: 'admission_rate_limited' };
  if (status === 'conflict') return { ok: false, code: 'conflict', reasonCode: 'admission_conflict' };
  return { ok: false, code: 'forbidden', reasonCode: 'admission_denied' };
}

/** No automatic RPC retries: an ambiguous response must never replay admission. */
export function createAdmissionRpc(options: { url: string; serviceRoleKey: string; send?: typeof fetch }): AdmissionRpc {
  if (typeof window !== 'undefined') throw new Error('server_only');
  const url = new URL(options.url);
  const local = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || url.pathname !== '/' || !options.serviceRoleKey) throw new Error('invalid_admission_configuration');
  return async (name, args) => {
    if (!rpcNames.includes(name)) throw new Error('invalid_admission_operation');
    try {
      const response = await (options.send ?? fetch)(`${url.origin}/rest/v1/rpc/${name}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { apikey: options.serviceRoleKey, Authorization: `Bearer ${options.serviceRoleKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error('rpc_unavailable'); }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('rpc_unavailable');
      const parts: Uint8Array[] = []; let length = 0;
      try {
        for (;;) {
          const part = await reader.read(); if (part.done) break;
          length += part.value.length;
          if (length > 16384) { await reader.cancel(); throw new Error('rpc_unavailable'); }
          parts.push(part.value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.length; }
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch { throw new Error('admission_rpc_unavailable'); }
  };
}

/** Instantiate for a trusted request context. Both rotating keys come from the
 * authenticated gateway, never JSON, cookie or caller-controlled forwarding headers. */
export function createTranscriptAdmissionStore(options: { rpc: AdmissionRpc; networkKeys: () => Promise<string[]> }) {
  const simple = async (name: RpcName, args: Record<string, unknown>): Promise<Result<null>> => {
    try { return denial(await options.rpc(name, args)); } catch { return unavailable(); }
  };
  const reservationContext = z.object({ reservationId: z.uuid(), sessionId: z.uuid(), now: TimestampSchema });
  return {
    async issue(input: { claims: TicketClaims; consentReceipt: z.infer<typeof ConsentReceiptSchema>; attestationDigest: string; networkKey: string; now: string }): Promise<Result<null>> {
      try {
        const claims = TicketClaimsSchema.parse(input.claims);
        const receipt = ConsentReceiptSchema.parse(input.consentReceipt);
        const keys = NetworkKeys.parse(await options.networkKeys());
        if (input.networkKey !== keys[0] || receipt.receiptId !== claims.consentReceiptId || receipt.sessionId !== claims.sessionId || receipt.revokedAt !== null) return { ok: false, code: 'forbidden', reasonCode: 'admission_binding_mismatch' };
        return simple('admission_issue', { p_ticket_id: claims.ticketId, p_session_id: claims.sessionId,
          p_consent_receipt_id: claims.consentReceiptId, p_document_digest: claims.documentDigest,
          p_disclosure_version: receipt.disclosureVersion, p_claims_issued_at: claims.issuedAt,
          p_claims_expires_at: claims.expiresAt, p_attestation_digest: z.string().regex(/^[a-f0-9]{64}$/).parse(input.attestationDigest),
          p_network_key: keys[0], p_client_now: TimestampSchema.parse(input.now) });
      } catch { return unavailable(); }
    },
    async admit(input: { claims: TicketClaims; networkKey: string; now: string; dailyCostCeilingMicrousd: number; reservationMicrousd: number; leaseExpiresAt: string }): Promise<Result<{ reservationId: string }>> {
      try {
        const claims = TicketClaimsSchema.parse(input.claims);
        const keys = NetworkKeys.parse(await options.networkKeys());
        const now = TimestampSchema.parse(input.now);
        if (input.networkKey !== keys[0] || Date.parse(TimestampSchema.parse(input.leaseExpiresAt)) - Date.parse(now) !== 120000) return { ok: false, code: 'forbidden', reasonCode: 'admission_binding_mismatch' };
        const ceiling = Money.positive().parse(input.dailyCostCeilingMicrousd);
        const reservation = Money.positive().max(ceiling).parse(input.reservationMicrousd);
        const raw = await options.rpc('admission_admit', { p_ticket_id: claims.ticketId, p_session_id: claims.sessionId,
          p_consent_receipt_id: claims.consentReceiptId, p_document_digest: claims.documentDigest,
          p_claims_issued_at: claims.issuedAt, p_claims_expires_at: claims.expiresAt, p_network_keys: keys,
          p_daily_ceiling_microusd: ceiling, p_reservation_microusd: reservation, p_lease_seconds: 120, p_client_now: now });
        const result = denial(raw); if (!result.ok) return result;
        const value = z.object({ reservation_id: z.uuid(), lease_expires_at: TimestampSchema }).parse(raw);
        if (Date.parse(value.lease_expires_at) <= Date.parse(now)) return unavailable();
        return { ok: true, value: { reservationId: value.reservation_id } };
      } catch { return unavailable(); }
    },
    async dispatch(input: { reservationId: string; sessionId: string; now: string }): Promise<Result<null>> {
      const parsed = reservationContext.safeParse(input); if (!parsed.success) return unavailable();
      return simple('admission_dispatch', { p_reservation_id: input.reservationId, p_session_id: input.sessionId, p_client_now: input.now });
    },
    async authorizeRetry(input: { reservationId: string; sessionId: string; now: string }): Promise<Result<null>> {
      const parsed = reservationContext.safeParse(input); if (!parsed.success) return unavailable();
      return simple('admission_retry_check', { p_reservation_id: input.reservationId, p_session_id: input.sessionId, p_client_now: input.now });
    },
    async revoke(input: { consentReceiptId: string; sessionId: string; now: string }): Promise<Result<null>> {
      if (!z.object({ consentReceiptId: z.uuid(), sessionId: z.uuid(), now: TimestampSchema }).safeParse(input).success) return unavailable();
      return simple('admission_revoke', { p_consent_receipt_id: input.consentReceiptId, p_session_id: input.sessionId, p_client_now: input.now });
    },
    async finish(input: { reservationId: string; actualCostMicrousd: number; outcome: 'success' | 'failed'; now: string }): Promise<Result<null>> {
      try {
        const value = z.object({ reservationId: z.uuid(), actualCostMicrousd: Money, outcome: z.enum(['success', 'failed']), now: TimestampSchema }).parse(input);
        const raw = await options.rpc('admission_finish', { p_reservation_id: value.reservationId, p_actual_microusd: value.actualCostMicrousd, p_outcome: value.outcome, p_client_now: value.now });
        const result = denial(raw); if (!result.ok) return result;
        const settled = z.object({ consent_revoked: z.boolean() }).parse(raw);
        return settled.consent_revoked ? { ok: false, code: 'forbidden', reasonCode: 'consent_revoked' } : { ok: true, value: null };
      } catch { return unavailable(); }
    },
  };
}
