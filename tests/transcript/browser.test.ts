import { describe, expect, it, vi } from 'vitest';
import { createTranscriptClient, documentDigest } from '../../src/transcript';
import { extraction } from '../fixtures/transcripts/synthetic';
const bytes = new TextEncoder().encode('%PDF-synthetic-unit-input');
const now = Date.parse('2026-11-12T12:00:00Z');
const ticket = { signedTicket: 'test-signed-ticket', consentReceiptId: 'test-consent', expiresAt: '2026-11-12T12:05:00Z' };
const admission = { signedTicket: ticket.signedTicket, consentReceiptId: ticket.consentReceiptId };
const response = (value: unknown, status = 200) => new Response(JSON.stringify({ ok: true, value }), { status });
async function granted() {
  const send = vi.fn<typeof fetch>().mockResolvedValueOnce(response(ticket)).mockResolvedValueOnce(response(extraction()));
  const client = createTranscriptClient({ fetch: send, now: () => now });
  await client.requestTicket({ botAttestation: 'synthetic-attestation', disclosureVersion: 'v1', explicitConsent: true, documentDigest: await documentDigest(bytes) });
  return { client, send };
}
describe('browser consent and memory-only tickets', () => {
  it('makes no request when explicit consent is absent', async () => {
    const send = vi.fn<typeof fetch>(); const client = createTranscriptClient({ fetch: send });
    const result = await client.requestTicket({ botAttestation: 'x', disclosureVersion: 'v1', explicitConsent: false, documentDigest: 'a'.repeat(64) } as never);
    expect(result.ok).toBe(false); expect(send).not.toHaveBeenCalled();
  });
  it('makes no upload without a ticket obtained by this client', async () => {
    const send = vi.fn<typeof fetch>();
    expect((await createTranscriptClient({ fetch: send }).extract(admission, bytes)).ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it('uploads once with credentials, no token URL and matching digest', async () => {
    const { client, send } = await granted();
    expect((await client.extract({ signedTicket: ticket.signedTicket, consentReceiptId: ticket.consentReceiptId }, bytes)).ok).toBe(true);
    expect(send.mock.calls[1]?.[0]).toBe('/api/transcript/extract');
    expect(send.mock.calls[1]?.[1]).toMatchObject({ credentials: 'same-origin', redirect: 'error', cache: 'no-store' });
    expect((await client.extract(admission, bytes)).ok).toBe(false); expect(send).toHaveBeenCalledTimes(2);
  });
  it('blocks changed PDF without upload', async () => {
    const { client, send } = await granted();
    expect((await client.extract(admission, new TextEncoder().encode('%PDF-different'))).ok).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('revocation clears local ticket even when server fails', async () => {
    const { client, send } = await granted(); send.mockReset().mockRejectedValue(new Error('synthetic failure'));
    expect((await client.revokeConsent({ consentReceiptId: ticket.consentReceiptId })).ok).toBe(false);
    expect((await client.extract(admission, bytes)).ok).toBe(false); expect(send).toHaveBeenCalledTimes(1);
  });
  it.each(['https://external.invalid', '//external.invalid', '/api?token=x'])('rejects off-origin/config injection %s', basePath => {
    expect(() => createTranscriptClient({ basePath })).toThrow();
  });
  it('turns malformed server data into a typed fallback', async () => {
    const client = createTranscriptClient({ fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ secret: 'synthetic-unexpected-field' })) });
    expect(await client.getAvailability()).toEqual({ ok: false, code: 'unavailable', reasonCode: 'transcript_service_unavailable' });
  });
});
