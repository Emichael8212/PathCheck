import { z } from 'zod';
import { ADMISSION_LIMITS, AdmissionRequestSchema, IdSchema, RevokeConsentRequestSchema, TicketIssueRequestSchema, TimestampSchema, TranscriptExtractionSchema, TypedFailureSchema } from '../contracts';
import type { Result, TranscriptClient } from '../contracts';

const TicketResponse = z.strictObject({ signedTicket: z.string().min(1).max(4096), consentReceiptId: IdSchema, expiresAt: TimestampSchema });
const Availability = z.strictObject({ status: z.enum(['disabled', 'approved']), disclosureVersion: IdSchema, processingTier: z.string().min(1).max(160), reasonCode: IdSchema.nullable() });
const unavailable = () => ({ ok: false, code: 'unavailable', reasonCode: 'transcript_service_unavailable' } as const);

export async function documentDigest(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}

/** Same-origin browser port. Tickets/consent remain in memory, never URLs or storage. */
export function createTranscriptClient(options: { basePath?: string; fetch?: typeof fetch; now?: () => number } = {}): TranscriptClient {
  const base = options.basePath ?? '/api/transcript';
  if (!/^\/(?!\/)[a-zA-Z0-9/_-]+$/.test(base)) throw new Error('Transcript endpoint must be a same-origin path');
  const send = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const tickets = new Map<string, { receipt: string; digest: string; expiresAt: number }>();
  // In-flight uploads per consent receipt; revocation aborts them and discards any late result.
  const inflight = new Map<string, Set<AbortController>>();
  const revoked = new Set<string>();
  async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<Result<T>> {
    try {
      const timeout = AbortSignal.timeout(65_000);
      const response = await send(`${base}/${path}`, { ...init, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
      const reader = response.body?.getReader();
      if (!reader) return unavailable();
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.length;
        if (size > 2_000_000) { await reader.cancel(); return unavailable(); }
        chunks.push(chunk.value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const result: unknown = JSON.parse(new TextDecoder().decode(bytes));
      const parsed = z.union([z.strictObject({ ok: z.literal(true), value: schema }), TypedFailureSchema]).safeParse(result);
      if (!parsed.success || (!response.ok && parsed.data.ok)) return unavailable();
      return parsed.data;
    } catch { return unavailable(); }
  }
  const json = (value: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  return {
    getAvailability: () => request('availability', Availability),
    establishGuestSession: () => request('session', z.null(), json({})),
    async requestTicket(input) {
      const parsed = TicketIssueRequestSchema.safeParse(input);
      if (!parsed.success) return { ok: false, code: 'forbidden', reasonCode: 'explicit_consent_required' };
      const result = await request('ticket', TicketResponse, json(parsed.data));
      if (result.ok) tickets.set(result.value.signedTicket, { receipt: result.value.consentReceiptId, digest: parsed.data.documentDigest, expiresAt: Date.parse(result.value.expiresAt) });
      return result;
    },
    async extract(input, pdfBytes) {
      const parsed = AdmissionRequestSchema.safeParse(input);
      if (!parsed.success) return { ok: false, code: 'forbidden', reasonCode: 'ticket_required' };
      const key = parsed.data.signedTicket;
      const ticket = tickets.get(key);
      const usable = () => tickets.get(key) === ticket && ticket !== undefined && ticket.receipt === parsed.data.consentReceiptId && ticket.expiresAt > now() && !revoked.has(ticket.receipt);
      if (!ticket || !usable()) return { ok: false, code: 'forbidden', reasonCode: 'ticket_required' };
      if (!pdfBytes.length || pdfBytes.length > ADMISSION_LIMITS.maxPdfBytes || new TextDecoder().decode(pdfBytes.subarray(0, 5)) !== '%PDF-') return { ok: false, code: 'validation_error', reasonCode: 'invalid_pdf' };
      const digest = await documentDigest(pdfBytes);
      // Re-check after the await: a concurrent extract or revocation may have consumed the ticket.
      if (!usable()) return { ok: false, code: 'forbidden', reasonCode: 'ticket_required' };
      if (digest !== ticket.digest) return { ok: false, code: 'forbidden', reasonCode: 'document_mismatch' };
      tickets.delete(key); // synchronous claim: one attempt; failure requires fresh attestation/ticket
      const controller = new AbortController();
      const active = inflight.get(ticket.receipt) ?? new Set<AbortController>();
      active.add(controller); inflight.set(ticket.receipt, active);
      try {
        const result = await request('extract', TranscriptExtractionSchema, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/pdf', 'X-Extraction-Ticket': parsed.data.signedTicket, 'X-Consent-Receipt': parsed.data.consentReceiptId }, body: Uint8Array.from(pdfBytes) });
        // Already-transmitted data cannot be recalled, but a revoked proposal is never surfaced.
        return revoked.has(ticket.receipt) ? { ok: false, code: 'forbidden', reasonCode: 'consent_revoked' } : result;
      } finally {
        active.delete(controller); if (!active.size) inflight.delete(ticket.receipt);
      }
    },
    async revokeConsent(input) {
      const parsed = RevokeConsentRequestSchema.safeParse(input);
      if (!parsed.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_consent_receipt' };
      const receipt = parsed.data.consentReceiptId;
      revoked.add(receipt);
      for (const [key, ticket] of tickets) if (ticket.receipt === receipt) tickets.delete(key);
      for (const controller of inflight.get(receipt) ?? []) controller.abort();
      return request('revoke', z.null(), json(parsed.data));
    },
  };
}
