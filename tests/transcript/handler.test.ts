import { describe, expect, it, vi } from 'vitest';
import { createTranscriptHandler, INSPECTION_DEADLINE_MS } from '../../supabase/functions/extract-transcript/handler';
import type { EndpointOptions } from '../../supabase/functions/extract-transcript/handler';
import { createGuestAdmission } from '../../supabase/functions/extract-transcript/admission';
import { createGeminiProvider } from '../../supabase/functions/extract-transcript/provider';
import { sign } from '../../supabase/functions/extract-transcript/crypto';
import { extraction } from '../fixtures/transcripts/synthetic';
import { time, eligibility, context, issue, secret, storeDouble } from '../fixtures/transcripts/server';
const bytes = new TextEncoder().encode('%PDF-synthetic-unit-input');
async function fixture() {
  const store = storeDouble();
  const admission = createGuestAdmission({ store, bot: { verify: async () => true }, signingSecret: secret, allowedOrigin: context.origin, disclosureVersion: 'v1', now: () => time });
  const provider = { extract: vi.fn().mockResolvedValue({ ok: true, value: { extraction: extraction(), actualCostMicrousd: 1, promptTokens: 10, outputTokens: 10 } }) };
  const pdf = { inspect: vi.fn().mockResolvedValue({ ok: true, value: { pageCount: 1 } }) };
  const options: EndpointOptions = { allowedOrigin: context.origin, disclosureVersion: 'v1', sessionSecret: secret, eligibility: () => eligibility, maximumProviderCostMicrousd: 20, admission, store, provider, pdf, resolveNetwork: async () => context.networkKey, now: () => time };
  const cookie = await sign({ sessionId: context.serverSessionId, issuedAt: Date.parse(time), expiresAt: Date.parse(time) + 3600000 }, secret, 'session');
  const request = (path: string, body: BodyInit | null = '{}', headers: Record<string, string> = {}, method = 'POST') => new Request(`${context.origin}/api/transcript/${path}`, { method, headers: { origin: context.origin, 'Content-Type': 'application/json', cookie: `__Host-pathcheck_guest=${cookie}`, ...headers }, body: method === 'GET' ? null : body });
  const ticketResponse = await createTranscriptHandler(options)(request('ticket', JSON.stringify({ ...issue, documentDigest: await crypto.subtle.digest('SHA-256', bytes).then(hash => Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('')) })));
  const ticket = (await ticketResponse.json()).value as { signedTicket: string; consentReceiptId: string };
  const upload = (headers: Record<string, string> = {}) => request('extract', bytes, { 'Content-Type': 'application/pdf', 'X-Extraction-Ticket': ticket.signedTicket, 'X-Consent-Receipt': ticket.consentReceiptId, ...headers });
  return { options, store, provider, pdf, request, upload };
}
describe('endpoint fail-closed controls (private SQL + PDF parser integration pending)', () => {
  it('issues secure HttpOnly same-origin guest cookie', async () => {
    const { options, request } = await fixture(); const response = await createTranscriptHandler(options)(request('session', '{}', { cookie: '' }));
    expect(response.status).toBe(200); expect(response.headers.get('set-cookie')).toMatch(/__Host-pathcheck_guest=.*Secure; HttpOnly; SameSite=Strict/);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it.each(['disabled', 'expired', 'unpriced', 'network', 'origin', 'cookie', 'mime', 'ticket'] as const)('denies %s with zero provider calls', async kind => {
    const f = await fixture();
    if (kind === 'disabled') f.options.eligibility = () => ({ status: 'disabled', reasonCode: 'unreviewed' });
    if (kind === 'expired') f.options.now = () => '2026-11-14T00:00:00Z';
    if (kind === 'unpriced') f.options.maximumProviderCostMicrousd = null;
    if (kind === 'network') f.options.resolveNetwork = async () => null;
    const headers = kind === 'origin' ? { origin: 'https://evil.test' } : kind === 'cookie' ? { cookie: '' } : kind === 'mime' ? { 'Content-Type': 'text/plain' } : kind === 'ticket' ? { 'X-Extraction-Ticket': 'forged' } : {};
    const result = await createTranscriptHandler(f.options)(f.upload(headers)); expect(result.status).not.toBe(200); expect(f.provider.extract).not.toHaveBeenCalled();
  });
  it('rechecks revocation before dispatch and settles zero cost', async () => {
    const f = await fixture(); f.store.dispatch.mockResolvedValue({ ok: false, code: 'forbidden', reasonCode: 'consent_revoked' });
    const result = await createTranscriptHandler(f.options)(f.upload()); expect(result.status).toBe(403); expect(f.provider.extract).not.toHaveBeenCalled();
    expect(f.store.finish).toHaveBeenCalledWith(expect.objectContaining({ actualCostMicrousd: 0, outcome: 'failed' }));
  });
  it('releases concurrency with full reservation charged on unknown provider failure', async () => {
    const f = await fixture(); f.provider.extract.mockRejectedValue(new Error('synthetic timeout'));
    expect((await createTranscriptHandler(f.options)(f.upload())).status).toBe(503);
    expect(f.store.finish).toHaveBeenCalledWith(expect.objectContaining({ actualCostMicrousd: 100, outcome: 'failed' }));
  });
  it('rejects excessive parser pages before dispatch', async () => {
    const f = await fixture(); f.pdf.inspect.mockResolvedValue({ ok: true, value: { pageCount: 21 } });
    expect((await createTranscriptHandler(f.options)(f.upload())).status).toBe(400); expect(f.provider.extract).not.toHaveBeenCalled(); expect(f.store.dispatch).not.toHaveBeenCalled();
  });
  it('times out a hung PDF inspection before dispatch, freeing the lease with zero cost', async () => {
    const f = await fixture();
    let called: () => void = () => undefined; const reached = new Promise<void>(resolve => { called = resolve; });
    f.pdf.inspect.mockImplementation(() => { called(); return new Promise(() => undefined); });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pending = createTranscriptHandler(f.options)(f.upload());
      await reached; vi.advanceTimersByTime(INSPECTION_DEADLINE_MS);
      const response = await pending;
      expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ reasonCode: 'pdf_inspection_deadline_exceeded' });
    } finally { vi.useRealTimers(); }
    expect(f.store.dispatch).not.toHaveBeenCalled(); expect(f.provider.extract).not.toHaveBeenCalled();
    expect(f.store.finish).toHaveBeenCalledWith(expect.objectContaining({ actualCostMicrousd: 0, outcome: 'failed' }));
  });
  it('refuses dispatch when slow inspection would let the provider outlive the lease', async () => {
    const f = await fixture(); let clock = Date.parse(time);
    f.options.now = () => new Date(clock).toISOString();
    f.pdf.inspect.mockImplementation(async () => { clock += INSPECTION_DEADLINE_MS + 1; return { ok: true, value: { pageCount: 1 } }; });
    const response = await createTranscriptHandler(f.options)(f.upload());
    expect(response.status).toBe(503); expect(f.store.dispatch).not.toHaveBeenCalled(); expect(f.provider.extract).not.toHaveBeenCalled();
    expect(f.store.finish).toHaveBeenCalledWith(expect.objectContaining({ actualCostMicrousd: 0 }));
  });
  it('maps a throwing inspector to a manual-entry failure without dispatch', async () => {
    const f = await fixture(); f.pdf.inspect.mockRejectedValue(new Error('synthetic parser crash'));
    const response = await createTranscriptHandler(f.options)(f.upload());
    expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ reasonCode: 'extraction_failed_manual_entry' });
    expect(f.store.dispatch).not.toHaveBeenCalled(); expect(f.store.finish).toHaveBeenCalledWith(expect.objectContaining({ actualCostMicrousd: 0, outcome: 'failed' }));
  });
  it('returns raw proposal only after dispatch and successful settlement', async () => {
    const f = await fixture(); const response = await createTranscriptHandler(f.options)(f.upload());
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ ok: true, value: { acceptanceStatus: 'needs_review', completeness: 'unknown' } });
    expect(f.provider.extract).toHaveBeenCalledOnce(); expect(f.store.finish).toHaveBeenCalledWith(expect.objectContaining({ actualCostMicrousd: 1, outcome: 'success' }));
  });
  it('fails closed when settlement store is unavailable', async () => {
    const f = await fixture(); f.store.finish.mockResolvedValue({ ok: false, code: 'unavailable', reasonCode: 'store_down' });
    expect((await createTranscriptHandler(f.options)(f.upload())).status).toBe(503);
  });
  it('withholds extracted rows when settlement reports consent revoked after dispatch', async () => {
    const f = await fixture(); f.store.finish.mockResolvedValue({ ok: false, code: 'forbidden', reasonCode: 'consent_revoked' });
    const response = await createTranscriptHandler(f.options)(f.upload());
    expect(response.status).toBe(403); expect(await response.json()).toEqual({ ok: false, code: 'forbidden', reasonCode: 'consent_revoked' });
    expect(f.provider.extract).toHaveBeenCalledOnce(); expect(f.store.finish).toHaveBeenCalledOnce();
  });
  it('takes a fresh admission timestamp after reading the upload', async () => {
    const f = await fixture(); let calls = 0;
    f.options.now = () => new Date(Date.parse(time) + calls++ * 1000).toISOString();
    expect((await createTranscriptHandler(f.options)(f.upload())).status).toBe(200);
    expect(f.store.admit).toHaveBeenCalledWith(expect.objectContaining({ now: new Date(Date.parse(time) + 1000).toISOString() }));
  });
  it.each(['ticket', 'revoke'] as const)('uses fresh%s context after a40second body read', async operation => {
    const f = await fixture(); let clock = Date.parse(time); f.options.now = () => new Date(clock).toISOString();
    f.store.issue.mockClear(); f.store.revoke.mockClear();
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      clock += 40_000; controller.enqueue(new TextEncoder().encode(JSON.stringify(operation === 'ticket' ? issue : { consentReceiptId: 'receipt-test' }))); controller.close();
    } });
    // Delay the body clock advance until its reader pulls, after the request-start timestamp.
    clock = Date.parse(time);
    const delayed = new ReadableStream<Uint8Array>({ async pull(controller) { clock += 40_000; const reader = body.getReader(); const next = await reader.read(); controller.enqueue(next.value!); controller.close(); } });
    const base = f.request(operation);
    const request = new Request(base.url, { method: 'POST', headers: base.headers, body: delayed, duplex: 'half' } as RequestInit & { duplex: 'half' });
    expect((await createTranscriptHandler(f.options)(request)).status).toBe(200);
    const expected = new Date(Date.parse(time) + 40_000).toISOString();
    if (operation === 'ticket') expect(f.store.issue).toHaveBeenCalledWith(expect.objectContaining({ now: expected, claims: expect.objectContaining({ issuedAt: expected }) }));
    else expect(f.store.revoke).toHaveBeenCalledWith(expect.objectContaining({ now: expected }));
  });
  it.each(['backoff', 'authorization'] as const)('denies retry after processing approval expires during%s', async stage => {
    const f = await fixture(); let enabled = true; let clock = 0;
    f.options.eligibility = () => enabled ? eligibility : { status: 'disabled', reasonCode: 'approval_expired' };
    const send = vi.fn<typeof fetch>().mockImplementation(async () => new Response(null, { status: 503 }));
    const authorizeRetry = vi.fn(async () => { if (stage === 'authorization') enabled = false; return { ok: true as const, value: null }; });
    f.options.authorizeRetry = authorizeRetry;
    f.options.maximumProviderCostMicrousd = 54;
    f.options.provider = createGeminiProvider({ apiKey: 'synthetic-not-a-key', modelId: 'synthetic-model', maxInputTokens: 10000, maxOutputTokens: 4000,
      inputMicrousdPerMillionTokens: 1000, outputMicrousdPerMillionTokens: 2000, retry: { maxAttempts: 3, maxElapsedMs: 50_000, baseDelayMs: 6000 } }, send,
    { now: () => clock, random: () => 0, sleep: async ms => { clock += ms; if (stage === 'backoff') enabled = false; } });
    const response = await createTranscriptHandler(f.options)(f.upload());
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ ok: false, code: 'unavailable', reasonCode: 'processing_approval_expired' });
    expect(send).toHaveBeenCalledOnce(); expect(f.store.admit).toHaveBeenCalledOnce(); expect(f.store.dispatch).toHaveBeenCalledOnce();
    expect(authorizeRetry).toHaveBeenCalledTimes(stage === 'backoff' ? 0 : 1);
    expect(f.store.finish).toHaveBeenCalledWith(expect.objectContaining({ actualCostMicrousd: 100, outcome: 'failed' }));
  });
  it.each(['mime', 'magic', 'size', 'malformed', 'encrypted', 'missing-pages'] as const)('blocks file %s before provider egress', async kind => {
    const f = await fixture();
    if (kind === 'malformed' || kind === 'encrypted') f.pdf.inspect.mockResolvedValue({ ok: false, code: 'validation_error', reasonCode: `pdf_${kind}` });
    if (kind === 'missing-pages') f.pdf.inspect.mockResolvedValue({ ok: true, value: { pageCount: 0 } });
    const request = kind === 'magic' ? f.request('extract', 'not a pdf', { 'Content-Type': 'application/pdf', 'X-Extraction-Ticket': 'ticket', 'X-Consent-Receipt': 'receipt' })
      : f.upload(kind === 'mime' ? { 'Content-Type': 'image/png' } : kind === 'size' ? { 'Content-Length': '10485761' } : {});
    expect((await createTranscriptHandler(f.options)(request)).status).toBe(400);
    expect(f.provider.extract).not.toHaveBeenCalled(); expect(f.store.dispatch).not.toHaveBeenCalled();
  });
  it('propagates atomic replay/quota denial without provider calls', async () => {
    const f = await fixture(); f.store.admit.mockResolvedValue({ ok: false, code: 'rate_limited', reasonCode: 'quota_exhausted' });
    expect((await createTranscriptHandler(f.options)(f.upload())).status).toBe(429);
    expect(f.provider.extract).not.toHaveBeenCalled(); expect(f.store.dispatch).not.toHaveBeenCalled();
  });
  it('has no public synthetic bypass operation', async () => {
    const f = await fixture();
    for (const path of ['synthetic', 'test', 'bypass']) expect((await createTranscriptHandler(f.options)(f.request(path))).status).toBe(403);
    expect(f.provider.extract).not.toHaveBeenCalled();
  });
  it('allows authenticated revocation after processing disabled', async () => {
    const f = await fixture(); f.options.eligibility = () => ({ status: 'disabled', reasonCode: 'disabled' });
    const response = await createTranscriptHandler(f.options)(f.request('revoke', JSON.stringify({ consentReceiptId: 'receipt' })));
    expect(response.status).toBe(200); expect(f.store.revoke).toHaveBeenCalledOnce(); expect(f.provider.extract).not.toHaveBeenCalled();
  });
});
