import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { createTranscriptRuntime } from '../../supabase/functions/extract-transcript/runtime';
import { createGuestAdmission } from '../../supabase/functions/extract-transcript/admission';
import { sha256 } from '../../supabase/functions/extract-transcript/crypto';
import { generatedPdf } from '../fixtures/transcripts/pdf';
import { row } from '../fixtures/transcripts/synthetic';
import { context, eligibility, issue, secret, storeDouble, time } from '../fixtures/transcripts/server';

const policy = { modelId: 'synthetic-model', maxInputTokens: 10000, maxOutputTokens: 4000,
  inputMicrousdPerMillionTokens: 1000, outputMicrousdPerMillionTokens: 2000,
  retry: { maxAttempts: 3 as const, maxElapsedMs: 50_000, baseDelayMs: 6000 } };
function fixture() {
  const store = storeDouble();
  const admission = createGuestAdmission({ store, bot: { verify: async () => true }, signingSecret: secret, allowedOrigin: context.origin, disclosureVersion: 'v1', now: () => time });
  return { store, endpoint: { allowedOrigin: context.origin, disclosureVersion: 'v1', sessionSecret: secret,
    eligibility: () => eligibility, store, admission, resolveNetwork: async () => context.networkKey, now: () => time,
    authorizeRetry: vi.fn().mockResolvedValue({ ok: true, value: null }) } };
}
describe('server runtime and actual localhost HTTP, simulated provider/store only', () => {
  it('loads only server key/model and fails closed for missing or mismatched configuration', async () => {
    for (const config of [{}, { GEMINI_API_KEY: 'synthetic', PATHCHECK_GEMINI_MODEL: 'other-model' }]) {
      const f = fixture(); const send = vi.fn<typeof fetch>();
      const readSecret = vi.fn((name: string) => (config as Record<string, string>)[name]);
      const handler = createTranscriptRuntime({ readSecret, reviewedPolicy: policy, endpoint: f.endpoint, send });
      const result = await handler(new Request(`${context.origin}/api/transcript/availability`));
      expect(await result.json()).toMatchObject({ ok: true, value: { status: 'disabled' } });
      expect(readSecret.mock.calls.map(c => c[0])).toEqual(['GEMINI_API_KEY', 'PATHCHECK_GEMINI_MODEL']);
      expect(send).not.toHaveBeenCalled();
    }
  });
  it('runs session→ticket→real PDF parser→503 retry→proposal over HTTP with one admission', async () => {
    const f = fixture(); let clock = 0;
    const raw = { documentPageCount: 1, detectedRowCount: 1, rows: [row()], coveredPages: [1], unrecognizedRows: [] };
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(raw) }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200 } })));
    const handler = createTranscriptRuntime({ readSecret: name => name === 'GEMINI_API_KEY' ? 'synthetic-not-a-key' : 'synthetic-model', reviewedPolicy: policy, endpoint: f.endpoint, send,
      timing: { now: () => clock, random: () => 0, sleep: async ms => { clock += ms; } } });
    const server = createServer(async (req, res) => {
      try {
        const chunks: Uint8Array[] = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 1_000_000) throw Error('test_body_limit'); chunks.push(chunk); }
        const headers = new Headers(); for (const [name, value] of Object.entries(req.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(',') : value);
        const request = new Request(`${context.origin}${req.url}`, { method: req.method ?? 'GET', headers,
          ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) });
        const response = await handler(request); res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
      } catch { res.writeHead(500); res.end('synthetic_test_adapter_failure'); }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/transcript`;
      const session = await fetch(`${base}/session`, { method: 'POST', headers: { origin: context.origin, 'content-type': 'application/json' }, body: '{}' });
      expect(session.status).toBe(200); const cookie = session.headers.get('set-cookie')!.split(';')[0]!;
      const pdf = await generatedPdf(1);
      const ticket = await fetch(`${base}/ticket`, { method: 'POST', headers: { origin: context.origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...issue, documentDigest: await sha256(pdf) }) });
      expect(ticket.status).toBe(200); const issued = (await ticket.json()).value;
      const extracted = await fetch(`${base}/extract`, { method: 'POST', headers: { origin: context.origin, cookie, 'content-type': 'application/pdf', 'x-extraction-ticket': issued.signedTicket, 'x-consent-receipt': issued.consentReceiptId }, body: Uint8Array.from(pdf) });
      expect(extracted.status).toBe(200); expect(await extracted.json()).toMatchObject({ ok: true, value: { acceptanceStatus: 'needs_review', completeness: 'unknown', rows: [{ rawCourseCode: row().rawCourseCode }] } });
      expect(send).toHaveBeenCalledTimes(2); expect(f.store.admit).toHaveBeenCalledOnce(); expect(f.store.dispatch).toHaveBeenCalledOnce(); expect(f.endpoint.authorizeRetry).toHaveBeenCalledOnce();
      expect(f.store.finish).toHaveBeenCalledWith(expect.objectContaining({ actualCostMicrousd: 19, outcome: 'success' }));
    } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
});
