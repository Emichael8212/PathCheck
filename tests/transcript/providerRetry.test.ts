import { describe, expect, it, vi } from 'vitest';
import { createGeminiProvider, createSyntheticGeminiProvider, maximumCost, providerWireSchema } from '../../supabase/functions/extract-transcript/provider';
import type { ProviderTiming } from '../../supabase/functions/extract-transcript/provider';
import { sha256 } from '../../supabase/functions/extract-transcript/crypto';
import { row } from '../fixtures/transcripts/synthetic';
const policy = { apiKey: 'synthetic-not-a-key', modelId: 'synthetic-model', maxInputTokens: 10000, maxOutputTokens: 4000,
  inputMicrousdPerMillionTokens: 1000, outputMicrousdPerMillionTokens: 2000,
  retry: { maxAttempts: 3 as const, maxElapsedMs: 50_000, baseDelayMs: 6000 } };
const bytes = new TextEncoder().encode('%PDF-synthetic-unit-input');
const success = (rows = [row()]) => new Response(JSON.stringify({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ documentPageCount: 1, detectedRowCount: rows.length, rows, coveredPages: [1], unrecognizedRows: [] }) }] } }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200 },
}));
function timing() {
  let clock = 0;
  const waits: number[] = [];
  const value: ProviderTiming = { now: () => clock, random: () => 0.5, sleep: async (ms, signal) => { if (signal.aborted) throw Error('cancelled'); waits.push(ms); clock += ms; } };
  return { value, waits, advance: (ms: number) => { clock += ms; } };
}
describe('bounded provider503 transport retry, synthetic responses only', () => {
  it('rechecks the same reservation and charges conservative prior-attempt cost on success', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(success());
    const beforeRetry = vi.fn().mockResolvedValue({ ok: true, value: null });
    const clock = timing();
    const result = await createGeminiProvider(policy, send, clock.value).extract(bytes, 1, { beforeRetry });
    expect(result).toMatchObject({ ok: true, value: { actualCostMicrousd: 19 } });
    expect(maximumCost(policy)).toBe(54); expect(send).toHaveBeenCalledTimes(2); expect(beforeRetry).toHaveBeenCalledOnce();
    expect(clock.waits).toEqual([6500]);
  });
  it('returns temporary unavailable after three attempts with exponential backoff/jitter', async () => {
    const send = vi.fn<typeof fetch>().mockImplementation(async () => new Response(null, { status: 503 }));
    const beforeRetry = vi.fn().mockResolvedValue({ ok: true, value: null }); const clock = timing();
    expect(await createGeminiProvider(policy, send, clock.value).extract(bytes, 1, { beforeRetry })).toEqual({ ok: false, code: 'unavailable', reasonCode: 'provider_temporarily_unavailable_manual_entry' });
    expect(send).toHaveBeenCalledTimes(3); expect(beforeRetry).toHaveBeenCalledTimes(2); expect(clock.waits).toEqual([6500, 12500]);
  });
  it.each([400, 401, 403, 429])('does not retry status%s or call retry authorization', async status => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status })); const beforeRetry = vi.fn();
    expect((await createGeminiProvider(policy, send, timing().value).extract(bytes, 1, { beforeRetry })).ok).toBe(false);
    expect(send).toHaveBeenCalledOnce(); expect(beforeRetry).not.toHaveBeenCalled();
  });
  it('requires fresh retry authorization; denial never resubmits a PDF', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    const denial = { ok: false, code: 'forbidden', reasonCode: 'consent_revoked' } as const;
    expect(await createGeminiProvider(policy, send, timing().value).extract(bytes, 1, { beforeRetry: async () => denial })).toEqual(denial);
    expect(send).toHaveBeenCalledOnce();
    const missing = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    expect((await createGeminiProvider(policy, missing, timing().value).extract(bytes, 1)).ok).toBe(false); expect(missing).toHaveBeenCalledOnce();
  });
  it('honors Retry-After seconds/date and refuses delay beyond total deadline', async () => {
    for (const header of ['10', 'Thu, 01 Jan 1970 00:00:10 GMT']) {
      const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 503, headers: { 'Retry-After': header } })).mockResolvedValueOnce(success());
      const clock = timing(); await createGeminiProvider(policy, send, clock.value).extract(bytes, 1, { beforeRetry: async () => ({ ok: true, value: null }) });
      expect(clock.waits).toEqual([10_000]); expect(send).toHaveBeenCalledTimes(2);
    }
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503, headers: { 'Retry-After': '60' } }));
    const clock = timing(); await createGeminiProvider(policy, send, clock.value).extract(bytes, 1, { beforeRetry: async () => ({ ok: true, value: null }) });
    expect(send).toHaveBeenCalledOnce(); expect(clock.waits).toEqual([]);
  });
  it('preserves cancellation before egress and during backoff', async () => {
    const controller = new AbortController(); controller.abort(); const send = vi.fn<typeof fetch>();
    expect((await createGeminiProvider(policy, send, timing().value).extract(bytes, 1, { signal: controller.signal })).ok).toBe(false); expect(send).not.toHaveBeenCalled();
    const abort = new AbortController(); const clock = timing();
    clock.value.sleep = async () => { abort.abort(); };
    const retrySend = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })); const beforeRetry = vi.fn();
    await createGeminiProvider(policy, retrySend, clock.value).extract(bytes, 1, { signal: abort.signal, beforeRetry });
    expect(retrySend).toHaveBeenCalledOnce(); expect(beforeRetry).not.toHaveBeenCalled();
  });
  it('omits only large wire array bounds and still rejects1001 rows locally', async () => {
    const schema = providerWireSchema(); expect(schema).toMatchObject({ properties: { coveredPages: { maxItems: 20 } }, additionalProperties: false });
    expect(schema.properties?.rows).not.toHaveProperty('maxItems'); expect(schema.properties?.unrecognizedRows).not.toHaveProperty('maxItems');
    const send = vi.fn<typeof fetch>().mockResolvedValue(success(Array.from({ length: 1001 }, (_, i) => row({ rowId: `row-${i}` }))));
    expect((await createGeminiProvider(policy, send, timing().value).extract(bytes, 1)).ok).toBe(false);
  });
  it('aborts a hung retry authorization without another provider request', async () => {
    const controller = new AbortController(); const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    const beforeRetry = vi.fn(() => new Promise<never>(() => undefined));
    const pending = createGeminiProvider(policy, send, timing().value).extract(bytes, 1, { signal: controller.signal, beforeRetry });
    await vi.waitFor(() => expect(beforeRetry).toHaveBeenCalledOnce()); controller.abort();
    expect((await pending).ok).toBe(false); expect(send).toHaveBeenCalledOnce();
  });
  it('rejects retry budgets exceeding the50s provider lifetime without egress', async () => {
    const send = vi.fn<typeof fetch>();
    expect(maximumCost({ ...policy, retry: { ...policy.retry, maxElapsedMs: 50_001 } })).toBeNull();
    expect((await createGeminiProvider({ ...policy, retry: { ...policy.retry, maxElapsedMs: 50_001 } }, send).extract(bytes, 1)).ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it('permits only allowlisted synthetic bytes and budgets EVERY transport attempt without monetary charges', async () => {
    const authorizeAttempt = vi.fn().mockResolvedValue({ ok: true, value: null });
    const synthetic = { apiKey: 'synthetic-not-a-key', modelId: 'gemini-3.5-flash-lite' as const, freeTierConfirmed: true as const,
      fixtureDigests: [await sha256(bytes)], maxInputTokens: 16384, maxOutputTokens: 8192, retry: policy.retry, authorizeAttempt };
    const deniedSend = vi.fn<typeof fetch>();
    expect(await createSyntheticGeminiProvider(synthetic, deniedSend).extract(new TextEncoder().encode('%PDF-not-allowlisted'), 1)).toMatchObject({ ok: false, code: 'forbidden' });
    expect(deniedSend).not.toHaveBeenCalled(); expect(authorizeAttempt).not.toHaveBeenCalled();
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(success());
    const result = await createSyntheticGeminiProvider(synthetic, send, timing().value).extract(bytes, 1, { beforeRetry: async () => ({ ok: true, value: null }) });
    expect(result).toMatchObject({ ok: true, value: { actualCostMicrousd: 0 } });
    expect(authorizeAttempt).toHaveBeenCalledTimes(2); expect(authorizeAttempt).toHaveBeenNthCalledWith(1, 24576); expect(send).toHaveBeenCalledTimes(2);
  });
  it('does not turn free confirmation into paid eligibility or bypass a project quota denial', async () => {
    expect(maximumCost({ ...policy, inputMicrousdPerMillionTokens: 0, outputMicrousdPerMillionTokens: 0 })).toBeNull();
    const send = vi.fn<typeof fetch>(); const denied = { ok: false, code: 'rate_limited', reasonCode: 'project_daily_budget' } as const;
    const synthetic = { apiKey: 'synthetic-not-a-key', modelId: 'gemini-3.5-flash-lite' as const, freeTierConfirmed: true as const,
      fixtureDigests: [await sha256(bytes)], maxInputTokens: 16384, maxOutputTokens: 8192, authorizeAttempt: async () => denied };
    expect(await createSyntheticGeminiProvider(synthetic, send).extract(bytes, 1)).toEqual(denied); expect(send).not.toHaveBeenCalled();
  });
});
