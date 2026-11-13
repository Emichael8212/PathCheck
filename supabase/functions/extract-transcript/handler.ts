import { z } from 'zod';
import { ADMISSION_LIMITS, AdmissionRequestSchema, RevokeConsentRequestSchema, TicketIssueRequestSchema } from '../../../src/contracts';
import type { GuestAdmissionService, ProcessingEligibility, Result, TypedFailure } from '../../../src/contracts';
import { approved } from './admission';
import type { AdmissionStore } from './admission';
import { sha256, sign, verify } from './crypto';
import type { PdfProvider } from './provider';
import { createPdfInspector } from './pdf';
import { abortable } from './lifecycle';

export interface PdfInspector { inspect(bytes: Uint8Array): Promise<Result<{ pageCount: number }>> }
export interface EndpointOptions {
  allowedOrigin: string;
  disclosureVersion: string;
  sessionSecret: string;
  eligibility: () => ProcessingEligibility;
  /** Deny unless reviewed maximum provider spend fits the reserved amount. */
  maximumProviderCostMicrousd: number | null;
  admission: GuestAdmissionService;
  store: AdmissionStore;
  provider: PdfProvider;
  /** Real structural parser by default; injectable only for isolated tests. */
  pdf?: PdfInspector;
  /** L's authenticated gateway must supply the keyed network ID. Null always denies. */
  resolveNetwork: (request: Request) => Promise<string | null>;
  now?: () => string;
  /** Same dispatched reservation only: recheck consent/lease without another admission. */
  authorizeRetry?: (input: { reservationId: string; sessionId: string; now: string }) => Promise<Result<null>>;
}
const fail = (code: TypedFailure['code'], reasonCode: string): TypedFailure => ({ ok: false, code, reasonCode });
function respond(value: Result<unknown>, extra: HeadersInit = {}): Response {
  const status = value.ok ? 200 : value.code === 'forbidden' ? 403 : value.code === 'rate_limited' ? 429 : value.code === 'validation_error' ? 400 : 503;
  return new Response(JSON.stringify(value), { status, headers: { ...extra, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
async function boundedBody(request: Request, max: number, signal: AbortSignal): Promise<Uint8Array> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > max)) throw new Error('body_limit');
  const reader = request.body?.getReader(); if (!reader) throw new Error('missing_body');
  const chunks: Uint8Array[] = []; let count = 0;
  try {
    while (true) { const part = await abortable(reader.read(), signal); if (part.done) break; count += part.value.length; if (count > max) throw new Error('body_limit'); chunks.push(part.value); }
  } catch { await reader.cancel(); throw new Error('invalid_body'); }
  const result = new Uint8Array(count); let at = 0; for (const chunk of chunks) { result.set(chunk, at); at += chunk.length; }
  return result;
}
/**
 * Admission leases last 120s (admission.ts) and the provider transport times out at 50s.
 * Inspection must finish within this budget so dispatch + provider + settlement complete
 * before lease recovery can release concurrency for a still-running provider call.
 */
export const INSPECTION_DEADLINE_MS = 30_000;
async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('deadline')), ms); })]);
  } finally { clearTimeout(timer); }
}
const Session = z.strictObject({ sessionId: z.uuid(), issuedAt: z.number().int(), expiresAt: z.number().int() });

/** Transport implementation; no global service key, listener or permissive dev mode. */
export function createTranscriptHandler(options: EndpointOptions): (request: Request) => Promise<Response> {
  const now = options.now ?? (() => new Date().toISOString());
  const pdf = options.pdf ?? createPdfInspector();
  const enabled = (eligibility: ProcessingEligibility, time: string) => approved(eligibility, time)
    && options.maximumProviderCostMicrousd !== null && Number.isSafeInteger(options.maximumProviderCostMicrousd)
    && options.maximumProviderCostMicrousd > 0 && eligibility.perRequestReservationMicrousd >= options.maximumProviderCostMicrousd;
  async function session(request: Request, time: string): Promise<string | null> {
    try {
      const cookies = (request.headers.get('cookie') ?? '').split(';').map(v => v.trim()).filter(v => v.startsWith('__Host-pathcheck_guest='));
      if (cookies.length !== 1) return null;
      const cookie = cookies[0]?.slice('__Host-pathcheck_guest='.length); if (!cookie) return null;
      const value = Session.parse(await verify(cookie, options.sessionSecret, 'session'));
      const instant = Date.parse(time);
      return value.issuedAt <= instant && value.expiresAt > instant && value.expiresAt - value.issuedAt <= 3_600_000 ? value.sessionId : null;
    } catch { return null; }
  }
  return async request => {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]);
    try {
      const path = new URL(request.url).pathname.split('/').at(-1);
      const time = now(); const eligibility = options.eligibility();
      if (path === 'availability' && request.method === 'GET') return respond({ ok: true, value: { status: enabled(eligibility, time) ? 'approved' : 'disabled', disclosureVersion: options.disclosureVersion, processingTier: 'reviewed_paid_processing_required', reasonCode: enabled(eligibility, time) ? null : 'processing_approval_required' } });
      if (request.method !== 'POST' || request.headers.get('origin') !== options.allowedOrigin || !options.allowedOrigin.startsWith('https://')) return respond(fail('forbidden', 'origin_or_method_denied'));
      if (!['session', 'ticket', 'revoke', 'extract'].includes(path ?? '')) return respond(fail('forbidden', 'unknown_operation'));
      const currentSession = await session(request, time);
      // Revocation remains possible when eligibility later expires or processing is disabled.
      if (path === 'revoke') {
        if (!currentSession) return respond(fail('forbidden', 'guest_session_required'));
        if (request.headers.get('content-type') !== 'application/json') return respond(fail('validation_error', 'invalid_content_type'));
        const body = RevokeConsentRequestSchema.parse(JSON.parse(new TextDecoder().decode(await boundedBody(request, 2048, signal))));
        return respond(await options.admission.revokeConsent(body, { serverSessionId: currentSession, now: now() }));
      }
      if (!enabled(eligibility, time)) return respond(fail('unavailable', 'processing_approval_required'));
      const network = await options.resolveNetwork(request);
      if (!network) return respond(fail('forbidden', 'trusted_network_identity_required'));
      if (path === 'session') {
        if (request.headers.get('content-type') !== 'application/json') return respond(fail('validation_error', 'invalid_content_type'));
        z.strictObject({}).parse(JSON.parse(new TextDecoder().decode(await boundedBody(request, 128, signal))));
        if (currentSession) return respond({ ok: true, value: null });
        const cookie = await sign({ sessionId: crypto.randomUUID(), issuedAt: Date.parse(time), expiresAt: Date.parse(time) + 3_600_000 }, options.sessionSecret, 'session');
        return respond({ ok: true, value: null }, { 'Set-Cookie': `__Host-pathcheck_guest=${cookie}; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Strict` });
      }
      if (!currentSession) return respond(fail('forbidden', 'guest_session_required'));
      if (path === 'ticket') {
        if (request.headers.get('content-type') !== 'application/json') return respond(fail('validation_error', 'invalid_content_type'));
        const input = TicketIssueRequestSchema.parse(JSON.parse(new TextDecoder().decode(await boundedBody(request, 12_000, signal))));
        return respond(await options.admission.issueTicket(input, { serverSessionId: currentSession, networkKey: network, origin: options.allowedOrigin, now: now(), eligibility: options.eligibility() }));
      }
      if (request.headers.get('content-type') !== 'application/pdf') return respond(fail('validation_error', 'pdf_required'));
      const input = AdmissionRequestSchema.parse({ signedTicket: request.headers.get('x-extraction-ticket'), consentReceiptId: request.headers.get('x-consent-receipt') });
      const bytes = await boundedBody(request, ADMISSION_LIMITS.maxPdfBytes, signal);
      if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') { bytes.fill(0); return respond(fail('validation_error', 'invalid_pdf_signature')); }
      const admission = await options.admission.admit(input, { sessionId: currentSession, networkKey: network, origin: options.allowedOrigin, documentDigest: await sha256(bytes), now: now(), eligibility });
      if (!admission.ok) { bytes.fill(0); return respond(admission); }
      const reservationId = admission.value.reservationId;
      const admittedAt = Date.parse(now());
      let dispatched = false;
      let cost = 0;
      let outcome: 'success' | 'failed' = 'failed';
      let result: Result<unknown> = fail('external_failure', 'extraction_failed_manual_entry');
      try {
        let inspected: Result<{ pageCount: number }> | null = null;
        try { inspected = await abortable(withDeadline(pdf.inspect(bytes), INSPECTION_DEADLINE_MS), signal); }
        catch (error) { if (!(error instanceof Error && error.message === 'deadline')) throw error; }
        // Also catches synchronous/CPU-bound inspection that a timer race cannot preempt.
        const elapsed = Date.parse(now()) - admittedAt;
        if (inspected === null || !Number.isFinite(elapsed) || elapsed < 0 || elapsed > INSPECTION_DEADLINE_MS) result = fail('external_failure', 'pdf_inspection_deadline_exceeded');
        else if (!inspected.ok) result = inspected;
        else if (!Number.isInteger(inspected.value.pageCount) || inspected.value.pageCount < 1 || inspected.value.pageCount > ADMISSION_LIMITS.maxPages) result = fail('validation_error', 'pdf_page_limit');
        else if (signal.aborted || !enabled(options.eligibility(), now())) result = fail('unavailable', 'processing_approval_expired_or_cancelled');
        else {
          const dispatch = await options.store.dispatch({ reservationId, sessionId: currentSession, now: now() });
          if (!dispatch.ok) result = dispatch;
          else {
            dispatched = true;
            // Unknown/failed provider cost consumes the full reservation conservatively.
            cost = eligibility.status === 'approved' ? eligibility.perRequestReservationMicrousd : 0;
            const extracted = await options.provider.extract(bytes, inspected.value.pageCount, { signal,
              ...(options.authorizeRetry ? { beforeRetry: async () => {
                if (!enabled(options.eligibility(), now())) return fail('unavailable', 'processing_approval_expired');
                const permitted = await options.authorizeRetry!({ reservationId, sessionId: currentSession, now: now() });
                if (!enabled(options.eligibility(), now())) return fail('unavailable', 'processing_approval_expired');
                return permitted;
              } } : {}) });
            if (!extracted.ok) result = extracted;
            else if (!Number.isSafeInteger(extracted.value.actualCostMicrousd) || extracted.value.actualCostMicrousd < 0 || extracted.value.actualCostMicrousd > cost) result = fail('external_failure', 'provider_cost_bound_violation');
            else { cost = extracted.value.actualCostMicrousd; outcome = 'success'; result = { ok: true, value: extracted.value.extraction }; }
          }
        }
      } catch { result = fail('external_failure', 'extraction_failed_manual_entry'); }
      finally { bytes.fill(0); }
      const settled = await options.admission.finish(reservationId, dispatched ? cost : 0, outcome);
      return respond(settled.ok ? result : settled.code === 'forbidden' ? settled : fail('unavailable', 'reservation_settlement_failed'));
    } catch { return respond(fail('validation_error', 'invalid_transcript_request')); }
  };
}
