import { describe, expect, it, vi } from 'vitest';
import { createGuestAdmission, createTurnstileVerifier } from '../../supabase/functions/extract-transcript/admission';
import { sign, verify } from '../../supabase/functions/extract-transcript/crypto';
import type { ProcessingEligibility } from '../../src/contracts';
import { time, eligibility, context, issue, secret, storeDouble } from '../fixtures/transcripts/server';
function setup() {
  const store = storeDouble(), bot = { verify: vi.fn().mockResolvedValue(true) };
  return { store, bot, service: createGuestAdmission({ store, bot, signingSecret: secret, allowedOrigin: context.origin, disclosureVersion: 'v1', now: () => time }) };
}
describe('server ticket admission; store authorization is separately integrated', () => {
  it('verifies bot once, signs exact claims and requires private-store binding', async () => {
    const { service, store, bot } = setup(); const result = await service.issueTicket(issue, context);
    expect(result.ok).toBe(true); if (!result.ok) return;
    const claims = await verify(result.value.signedTicket, secret, 'ticket');
    expect(claims).toMatchObject({ sessionId: context.serverSessionId, audience: 'extract-transcript', documentDigest: issue.documentDigest, consentReceiptId: result.value.consentReceiptId });
    expect(store.issue).toHaveBeenCalledOnce();
    const admitted = await service.admit({ signedTicket: result.value.signedTicket, consentReceiptId: result.value.consentReceiptId }, { sessionId: context.serverSessionId, networkKey: context.networkKey, origin: context.origin, now: time, documentDigest: issue.documentDigest, eligibility });
    expect(admitted.ok).toBe(true); expect(bot.verify).toHaveBeenCalledTimes(1);
    expect(store.admit).toHaveBeenCalledWith(expect.objectContaining({ reservationMicrousd: 100, dailyCostCeilingMicrousd: 1000, leaseExpiresAt: '2026-11-12T12:02:00.000Z' }));
  });
  it.each(['disabled', 'expired', 'origin', 'disclosure', 'false-consent', 'bot'] as const)('rejects issuance %s before storage', async kind => {
    const { service, store, bot } = setup();
    if (kind === 'bot') bot.verify.mockResolvedValue(false);
    const input = kind === 'disclosure' ? { ...issue, disclosureVersion: 'old' } : kind === 'false-consent' ? { ...issue, explicitConsent: false } : issue;
    const ctx = kind === 'disabled' ? { ...context, eligibility: { status: 'disabled', reasonCode: 'unreviewed' } as ProcessingEligibility } : kind === 'expired' ? { ...context, now: '2026-11-14T00:00:00Z' } : kind === 'origin' ? { ...context, origin: 'https://evil.test' } : context;
    expect((await service.issueTicket(input as typeof issue, ctx)).ok).toBe(false); expect(store.issue).not.toHaveBeenCalled();
  });
  it.each(['signature', 'session', 'digest', 'receipt', 'expired', 'future', 'purpose'] as const)('rejects ticket %s before atomic admission', async kind => {
    const { service, store } = setup(); const result = await service.issueTicket(issue, context); if (!result.ok) throw new Error('fixture');
    let token = result.value.signedTicket;
    if (kind === 'signature') token += 'x';
    if (kind === 'purpose') token = await sign(await verify(token, secret, 'ticket'), secret, 'session');
    const request = { signedTicket: token, consentReceiptId: kind === 'receipt' ? 'forged' : result.value.consentReceiptId };
    const ctx = { sessionId: kind === 'session' ? '00000000-0000-4000-8000-000000000002' : context.serverSessionId, networkKey: context.networkKey, origin: context.origin, now: kind === 'expired' ? '2026-11-12T12:06:00Z' : kind === 'future' ? '2026-11-12T11:59:00Z' : time, documentDigest: kind === 'digest' ? 'b'.repeat(64) : issue.documentDigest, eligibility };
    expect((await service.admit(request, ctx)).ok).toBe(false); expect(store.admit).not.toHaveBeenCalled();
  });
  it('fails closed on store outage and propagates replay/quota denial', async () => {
    const { service, store } = setup(); store.issue.mockRejectedValue(new Error('sensitive internal details'));
    expect(await service.issueTicket(issue, context)).toEqual({ ok: false, code: 'unavailable', reasonCode: 'admission_store_unavailable' });
  });
  it('authenticates revocation through session context and retains store failure', async () => {
    const { service, store } = setup();
    await service.revokeConsent({ consentReceiptId: 'receipt' }, { serverSessionId: context.serverSessionId, now: time });
    expect(store.revoke).toHaveBeenCalledWith({ consentReceiptId: 'receipt', sessionId: context.serverSessionId, now: time });
    expect((await service.revokeConsent({ consentReceiptId: 'receipt' }, { serverSessionId: '', now: time })).ok).toBe(false);
  });
});
describe('real Turnstile HTTP adapter with synthetic transport', () => {
  it.each(['success', 'hostname', 'action', 'audience', 'expired', 'failed', 'timeout'] as const)('validates %s', async kind => {
    const body = { success: kind !== 'failed', hostname: kind === 'hostname' ? 'evil.test' : 'pathcheck.test', action: kind === 'action' ? 'other' : 'extract-transcript', cdata: kind === 'audience' ? 'other' : 'pathcheck', challenge_ts: kind === 'expired' ? '2026-11-12T11:00:00Z' : time };
    const send = vi.fn<typeof fetch>(); if (kind === 'timeout') send.mockRejectedValue(new Error('timeout')); else send.mockResolvedValue(new Response(JSON.stringify(body)));
    const verifier = createTurnstileVerifier({ secret: 'synthetic', hostname: 'pathcheck.test', audience: 'pathcheck', fetch: send });
    expect(await verifier.verify('synthetic-token', time)).toBe(kind === 'success');
    expect(send.mock.calls[0]?.[0]).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
  });
});
