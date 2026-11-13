import { describe, expect, it, vi } from 'vitest';
import { createLocalSyntheticTranscriptRuntime } from '../fixtures/transcripts/localRuntime';
import type { LocalSyntheticRuntimeOptions } from '../fixtures/transcripts/localRuntime';
import { generatedPdf } from '../fixtures/transcripts/pdf';
import { row } from '../fixtures/transcripts/synthetic';
import { secret, storeDouble, time } from '../fixtures/transcripts/server';
import { sha256 } from '../../supabase/functions/extract-transcript/crypto';
import { createGuestAdmission } from '../../supabase/functions/extract-transcript/admission';
import { createTranscriptRuntime } from '../../supabase/functions/extract-transcript/runtime';
import type { ProcessingEligibility } from '../../src/contracts';

const origin = 'https://127.0.0.1:5185';
const network = 'n'.repeat(43);
async function fixture(lifetimeMs = 3_600_000) {
  const bytes = await generatedPdf(1, false);
  const digest = await sha256(bytes);
  const digests = [digest];
  let clock = Date.parse(time);
  const store = storeDouble();
  const consumed = new Set<string>(); const revoked = new Set<string>();
  let activeReceipt = '';
  // Explicit test-only atomic-store simulation. Real SQL concurrency is a separate lead gate.
  store.admit.mockImplementation(async input => {
    if (revoked.has(input.claims.consentReceiptId) || consumed.has(input.claims.ticketId)) return { ok: false, code: 'forbidden', reasonCode: 'consumed_or_revoked' };
    consumed.add(input.claims.ticketId); activeReceipt = input.claims.consentReceiptId; return { ok: true, value: { reservationId: 'reservation-test' } };
  });
  store.revoke.mockImplementation(async input => { revoked.add(input.consentReceiptId); return { ok: true, value: null }; });
  const raw = { documentPageCount: 1, detectedRowCount: 1, rows: [row()], coveredPages: [1], unrecognizedRows: [] };
  const send = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(raw) }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200 } }));
  const bot = { verify: vi.fn().mockResolvedValue(true) };
  const authorizeAttempt = vi.fn().mockResolvedValue({ ok: true, value: null });
  const options: LocalSyntheticRuntimeOptions = { allowedOrigin: origin, disclosureVersion: 'local-synthetic-live-v1', sessionSecret: secret, signingSecret: secret,
    apiKey: 'synthetic-not-a-key', modelId: 'gemini-3.5-flash-lite', freeTierConfirmed: true,
    expiresAt: new Date(clock + lifetimeMs).toISOString(), fixtureDigests: digests, accounting: { dailyLimitUnits: 100, perRequestUnits: 1 },
    store, bot, resolveNetwork: async () => network,
    authorizeRetry: async () => revoked.has(activeReceipt) ? { ok: false, code: 'forbidden', reasonCode: 'consent_revoked' } : { ok: true, value: null },
    authorizeAttempt, now: () => new Date(clock).toISOString(), send,
    timing: { now: () => clock, random: () => 0, sleep: async ms => { clock += ms; } } };
  const handler = createLocalSyntheticTranscriptRuntime(options);
  const request = (operation: string, body: BodyInit | null = '{}', cookie = '', headers: Record<string, string> = {}) => new Request(`${origin}/api/transcript/${operation}`, {
    method: operation === 'availability' ? 'GET' : 'POST', headers: { origin, 'content-type': 'application/json', cookie, ...headers }, body: operation === 'availability' ? null : body,
  });
  const session = async () => {
    const result = await handler(request('session')); expect(result.status).toBe(200);
    return result.headers.get('set-cookie')!.split(';')[0]!;
  };
  const cookie = await session();
  const ticket = async (documentDigest = digest, explicitConsent = true) => handler(request('ticket', JSON.stringify({ botAttestation: 'synthetic-local-capability', disclosureVersion: options.disclosureVersion, explicitConsent, documentDigest }), cookie));
  const upload = (issued: { signedTicket: string; consentReceiptId: string }, input = bytes, sessionCookie = cookie) => handler(request('extract', Uint8Array.from(input), sessionCookie,
    { 'content-type': 'application/pdf', 'x-extraction-ticket': issued.signedTicket, 'x-consent-receipt': issued.consentReceiptId }));
  return { options, handler, request, ticket, upload, session, cookie, bytes, digest, digests, store, send, bot, authorizeAttempt,
    advance: (ms: number) => { clock += ms; } };
}

describe('local synthetic factory using real handler/admission/provider, simulated Google/store', () => {
  it('extracts only the allowlisted fixture with explicit consent and zero API monetary cost', async () => {
    const f = await fixture();
    const availability = await f.handler(f.request('availability'));
    expect(await availability.json()).toMatchObject({ value: { status: 'approved', processingTier: 'free_tier_synthetic_fixtures_only' } });
    const issued = (await (await f.ticket()).json()).value;
    const response = await f.upload(issued); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, value: { modelId: 'gemini-3.5-flash-lite', acceptanceStatus: 'needs_review', completeness: 'unknown' } });
    expect(f.send).toHaveBeenCalledOnce(); expect(f.authorizeAttempt).toHaveBeenCalledWith(24576);
    expect(f.store.admit).toHaveBeenCalledWith(expect.objectContaining({ reservationMicrousd: 1, dailyCostCeilingMicrousd: 100 }));
    expect(f.store.finish).toHaveBeenCalledWith(expect.objectContaining({ actualCostMicrousd: 0, outcome: 'success' }));
  });
  it('rejects missing consent before bot, ticket persistence or provider calls', async () => {
    const f = await fixture(); expect((await f.ticket(f.digest, false)).status).not.toBe(200);
    expect(f.bot.verify).not.toHaveBeenCalled(); expect(f.store.issue).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled();
  });
  it('rejects unknown digests before bot/store and keeps the allowlist immutable', async () => {
    const f = await fixture(); const other = await sha256(new TextEncoder().encode('%PDF-not-a-fixture'));
    f.digests.push(other);
    expect((await f.ticket(other)).status).toBe(403); expect(f.bot.verify).not.toHaveBeenCalled(); expect(f.store.issue).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled();
  });
  it('rejects substituted unknown PDF bytes before admission, parsing or dispatch', async () => {
    const f = await fixture(); const issued = (await (await f.ticket()).json()).value;
    const response = await f.upload(issued, new TextEncoder().encode('%PDF-deliberately-not-parseable-unapproved-document'));
    expect(response.status).toBe(403); expect(await response.json()).toMatchObject({ reasonCode: 'admission_denied' });
    expect(f.store.admit).not.toHaveBeenCalled(); expect(f.store.dispatch).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled();
  });
  it('preserves replay rejection and does not create a second provider call', async () => {
    const f = await fixture(); const issued = (await (await f.ticket()).json()).value;
    expect((await f.upload(issued)).status).toBe(200); expect((await f.upload(issued)).status).toBe(403);
    expect(f.send).toHaveBeenCalledOnce(); expect(f.store.dispatch).toHaveBeenCalledOnce();
  });
  it('binds signed tickets to the consenting session and permits revocation', async () => {
    const f = await fixture(); const issued = (await (await f.ticket()).json()).value;
    const otherSession = await f.session(); expect((await f.upload(issued, f.bytes, otherSession)).status).toBe(403);
    expect(f.store.admit).not.toHaveBeenCalled();
    expect((await f.handler(f.request('revoke', JSON.stringify({ consentReceiptId: issued.consentReceiptId }), f.cookie))).status).toBe(200);
    expect((await f.upload(issued)).status).toBe(403); expect(f.send).not.toHaveBeenCalled();
  });
  it('expires the local permit and still permits consent revocation', async () => {
    const f = await fixture(); const issued = (await (await f.ticket()).json()).value; f.advance(3_599_000);
    // Session remains valid while the permit expires1second earlier through a separately built factory.
    const shortened = createLocalSyntheticTranscriptRuntime({ ...f.options, expiresAt: new Date(Date.parse(f.options.now!()) + 500).toISOString() });
    f.advance(501);
    expect((await shortened(f.request('extract', Uint8Array.from(f.bytes), f.cookie, { 'content-type': 'application/pdf', 'x-extraction-ticket': issued.signedTicket, 'x-consent-receipt': issued.consentReceiptId }))).status).toBe(503);
    expect((await shortened(f.request('revoke', JSON.stringify({ consentReceiptId: issued.consentReceiptId }), f.cookie))).status).toBe(200);
    expect(f.send).not.toHaveBeenCalled();
  });
  it.each(['origin', 'http', 'model', 'free', 'expiry', 'empty-list', 'budget'] as const)('fails closed for invalid%s configuration', async kind => {
    const f = await fixture(); const config = { ...f.options };
    if (kind === 'origin') config.allowedOrigin = 'https://public.example:5185';
    if (kind === 'http') config.allowedOrigin = 'http://127.0.0.1:5185';
    if (kind === 'model') Object.assign(config, { modelId: 'gemini-3.8-flash' });
    if (kind === 'free') Object.assign(config, { freeTierConfirmed: false });
    if (kind === 'expiry') config.expiresAt = new Date(Date.parse(time) + 3_600_001).toISOString();
    if (kind === 'empty-list') config.fixtureDigests = [];
    if (kind === 'budget') config.accounting = { dailyLimitUnits: 0, perRequestUnits: 1 };
    expect(() => createLocalSyntheticTranscriptRuntime(config)).toThrow('invalid_local_synthetic_configuration');
    expect(f.send).not.toHaveBeenCalled();
  });
  it('rejects requests addressed outside the exact loopback origin', async () => {
    const f = await fixture(); expect((await f.handler(new Request('https://public.example/api/transcript/availability'))).status).toBe(403);
    expect(f.send).not.toHaveBeenCalled();
  });
  it.each([['revocation', false], ['permit expiry', false], ['revocation', true], ['permit expiry', true]] as const)('rechecks%s AFTER quota wait (retry=%s)', async (kind, retry) => {
    const f = await fixture(kind === 'permit expiry' ? 20_000 : 3_600_000); const issued = (await (await f.ticket()).json()).value;
    let release: () => void = () => undefined;
    const waiting = new Promise<{ ok: true; value: null }>(resolve => { release = () => resolve({ ok: true, value: null }); });
    if (retry) {
      f.send.mockResolvedValueOnce(new Response(null, { status: 503 }));
      f.authorizeAttempt.mockResolvedValueOnce({ ok: true, value: null });
    }
    f.authorizeAttempt.mockReturnValueOnce(waiting);
    const pending = f.upload(issued);
    await vi.waitFor(() => expect(f.authorizeAttempt).toHaveBeenCalledTimes(retry ? 2 : 1));
    if (kind === 'revocation') expect((await f.handler(f.request('revoke', JSON.stringify({ consentReceiptId: issued.consentReceiptId }), f.cookie))).status).toBe(200);
    else f.advance(20_001); // Even after6s retry backoff, still below the provider's50s deadline.
    release(); const result = await pending;
    expect(result.status).toBe(kind === 'revocation' ? 403 : 503);
    expect(await result.json()).toMatchObject({ reasonCode: kind === 'revocation' ? 'consent_revoked' : 'processing_approval_expired' });
    expect(f.send).toHaveBeenCalledTimes(retry ? 1 : 0); expect(f.store.admit).toHaveBeenCalledOnce(); expect(f.store.dispatch).toHaveBeenCalledOnce(); expect(f.store.finish).toHaveBeenCalledOnce();
  });
  it('leaves public paid eligibility unchanged despite free-tier environment configuration', async () => {
    const f = await fixture(); const localPermit = { kind: 'local_synthetic_fixture_only', expiresAt: Date.parse(time) + 1000 };
    const admission = createGuestAdmission({ store: f.store, bot: f.bot, signingSecret: secret, allowedOrigin: origin, disclosureVersion: f.options.disclosureVersion });
    const response = await admission.issueTicket({ botAttestation: 'synthetic-local-capability', disclosureVersion: f.options.disclosureVersion, explicitConsent: true, documentDigest: f.digest },
      { serverSessionId: '00000000-0000-4000-8000-000000000001', networkKey: network, origin, now: time, eligibility: localPermit as unknown as ProcessingEligibility });
    expect(response.ok).toBe(false); expect(f.store.issue).not.toHaveBeenCalled();
    const publicHandler = createTranscriptRuntime({ readSecret: name => name === 'GEMINI_API_KEY' ? 'synthetic-not-a-key' : 'gemini-3.5-flash-lite',
      reviewedPolicy: { modelId: 'gemini-3.5-flash-lite', maxInputTokens: 16384, maxOutputTokens: 8192, inputMicrousdPerMillionTokens: 1, outputMicrousdPerMillionTokens: 1 },
      endpoint: { allowedOrigin: origin, disclosureVersion: f.options.disclosureVersion, sessionSecret: secret, eligibility: () => ({ status: 'disabled', reasonCode: 'real_processing_unapproved' }),
        admission, store: f.store, resolveNetwork: async () => network }, send: f.send });
    expect(await (await publicHandler(f.request('availability'))).json()).toMatchObject({ value: { status: 'disabled', processingTier: 'reviewed_paid_processing_required' } });
    expect(f.send).not.toHaveBeenCalled();
  });
});
