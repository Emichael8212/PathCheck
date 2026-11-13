import { describe, expect, it, vi } from 'vitest';
import { createAdmissionRpc, createTranscriptAdmissionStore } from '../../supabase/functions/_shared/transcriptAdmission';
import type { AdmissionRpc } from '../../supabase/functions/_shared/transcriptAdmission';
const now = '2026-11-13T12:00:00.000Z';
const sessionId = '11111111-1111-4111-8111-111111111111';
const reservationId = '22222222-2222-4222-8222-222222222222';
const consentReceiptId = '33333333-3333-4333-8333-333333333333';
const claims = { schemaVersion: 1 as const, ticketId: '44444444-4444-4444-8444-444444444444', sessionId, consentReceiptId,
  audience: 'extract-transcript' as const, documentDigest: 'd'.repeat(64), issuedAt: now, expiresAt: '2026-11-13T12:05:00.000Z' };
const keys = ['c'.repeat(32), 'p'.repeat(32)];
const admitInput = { claims, networkKey: keys[0]!, now, dailyCostCeilingMicrousd: 100, reservationMicrousd: 30, leaseExpiresAt: '2026-11-13T12:02:00.000Z' };
const make = (rpc: AdmissionRpc) => createTranscriptAdmissionStore({ rpc, networkKeys: async () => keys });
describe('server admission RPC composition (simulated transport, not live security)', () => {
  it('preserves rotating network keys and the 120-second lease without replaying admission', async () => {
    const rpc = vi.fn(async () => ({ status: 'ok', reservation_id: reservationId, lease_expires_at: admitInput.leaseExpiresAt }));
    expect(await make(rpc).admit(admitInput)).toEqual({ ok: true, value: { reservationId } });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admission_admit', expect.objectContaining({ p_network_keys: keys, p_lease_seconds: 120, p_reservation_microusd: 30 }));
  });
  it('refuses untrusted network binding, oversized cost and lease changes before any RPC', async () => {
    const rpc = vi.fn(async () => ({ status: 'ok' }));
    for (const input of [{ ...admitInput, networkKey: 'x'.repeat(32) }, { ...admitInput, reservationMicrousd: 101 }, { ...admitInput, leaseExpiresAt: '2026-11-13T12:03:00.000Z' }]) expect((await make(rpc).admit(input)).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('authorizes transport retry only by the dedicated existing-reservation check', async () => {
    const rpc = vi.fn(async () => ({ status: 'ok' }));
    expect((await make(rpc).authorizeRetry({ reservationId, sessionId, now })).ok).toBe(true);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admission_retry_check', { p_reservation_id: reservationId, p_session_id: sessionId, p_client_now: now });
  });
  it('withholds successful extraction after revoked or unverifiable settlement', async () => {
    for (const reply of [{ status: 'ok', consent_revoked: true }, { status: 'ok' }]) {
      const result = await make(async () => reply).finish({ reservationId, actualCostMicrousd: 10, outcome: 'success', now });
      expect(result.ok).toBe(false);
      if ('consent_revoked' in reply) expect(result).toEqual({ ok: false, code: 'forbidden', reasonCode: 'consent_revoked' });
    }
    expect(await make(async () => ({ status: 'ok', consent_revoked: false })).finish({ reservationId, actualCostMicrousd: 10, outcome: 'success', now })).toEqual({ ok: true, value: null });
  });
  it('does not expose arbitrary database reason text or retry rejected admissions', async () => {
    const rpc = vi.fn(async () => ({ status: 'denied', reason: 'sensitive_sentinel' }));
    const result = await make(rpc).admit(admitInput);
    expect(result).toEqual({ ok: false, code: 'forbidden', reasonCode: 'admission_denied' });
    expect(JSON.stringify(result)).not.toContain('sensitive');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('fails closed on malformed reservation replies and network failures', async () => {
    for (const rpc of [async () => ({ status: 'ok' }), async () => { throw Error('sensitive_sentinel'); }]) {
      expect(await make(rpc).admit(admitInput)).toEqual({ ok: false, code: 'unavailable', reasonCode: 'admission_store_unavailable' });
    }
  });
  it('rejects insecure remote RPC configuration', () => {
    expect(() => createAdmissionRpc({ url: 'http://example.com', serviceRoleKey: 'synthetic-only' })).toThrow('invalid_admission_configuration');
  });
  it('uses server credentials only in request headers and never retries HTTP failures', async () => {
    const send = vi.fn<typeof fetch>(async () => new Response('sensitive_sentinel', { status: 503 }));
    const rpc = createAdmissionRpc({ url: 'http://127.0.0.1:55431', serviceRoleKey: 'synthetic-only', send });
    await expect(rpc('admission_retry_check', {})).rejects.toThrow('admission_rpc_unavailable');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toBe('http://127.0.0.1:55431/rest/v1/rpc/admission_retry_check');
    expect(send.mock.calls[0]![1]!.body).not.toContain('synthetic-only');
    expect(send.mock.calls[0]![1]!.redirect).toBe('error');
  });
  it('bounds successful RPC response bodies and cancels overflow', async () => {
    let cancelled = false;
    const send = vi.fn<typeof fetch>(async () => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(16385)); }, cancel() { cancelled = true; } })));
    await expect(createAdmissionRpc({ url: 'http://127.0.0.1:55431', serviceRoleKey: 'synthetic-only', send })('admission_dispatch', {})).rejects.toThrow('admission_rpc_unavailable');
    expect(cancelled).toBe(true);
  });
});
