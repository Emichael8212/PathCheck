import { describe, expect, it, vi } from 'vitest';
import { createGeminiProvider, maximumCost } from '../../supabase/functions/extract-transcript/provider';
import { row } from '../fixtures/transcripts/synthetic';
const policy = { apiKey: 'synthetic-not-a-key', modelId: 'synthetic-model', maxInputTokens: 10000, maxOutputTokens: 4000, inputMicrousdPerMillionTokens: 1000, outputMicrousdPerMillionTokens: 2000 };
const bytes = new TextEncoder().encode('%PDF-synthetic-unit-input');
const output = () => ({ documentPageCount: 1, detectedRowCount: 1, rows: [row()], coveredPages: [1], unrecognizedRows: [] });
const envelope = (text: string, finishReason = 'STOP') => ({ candidates: [{ finishReason, content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200, thoughtsTokenCount: 10 } });
describe('genuine Gemini REST adapter, synthetic HTTP responses only', () => {
  it('sends ephemeral inline PDF with strict schema and no files/tools/retries', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(envelope(JSON.stringify(output())))));
    const result = await createGeminiProvider(policy, send).extract(bytes, 1);
    expect(result).toMatchObject({ ok: true, value: { extraction: { completeness: 'unknown', acceptanceStatus: 'needs_review', modelId: 'synthetic-model' }, promptTokens: 100, outputTokens: 210, actualCostMicrousd: 1 } });
    expect(send).toHaveBeenCalledOnce(); expect(send.mock.calls[0]?.[0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/synthetic-model:generateContent');
    const init = send.mock.calls[0]?.[1]; expect(init).toMatchObject({ redirect: 'error', headers: { 'x-goog-api-key': 'synthetic-not-a-key' } });
    const body = JSON.parse(init?.body as string); expect(body.generationConfig.candidateCount).toBe(1); expect(body.generationConfig.responseJsonSchema).toBeTruthy(); expect(body.tools).toBeUndefined();
    expect(body.contents[0].parts[0].inlineData.mimeType).toBe('application/pdf');
  });
  it('scrubs provider quote and provisional course claims', async () => {
    const raw = output(); raw.rows[0] = row({ provisionalCourseId: 'SYN-101', provenance: [{ field: 'code', page: 1, row: 1, quote: 'synthetic-personal-quote' }] });
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(envelope(JSON.stringify(raw)))));
    const result = await createGeminiProvider(policy, send).extract(bytes, 1);
    expect(result).toMatchObject({ ok: true, value: { extraction: { rows: [{ provisionalCourseId: null, provenance: [{ quote: null }] }] } } });
  });
  it.each(['malformed-json', 'extra-field', 'wrong-pages', 'duplicate-row', 'truncated', '429', 'timeout', 'usage-bound'] as const)('fails safely on %s without retries', async kind => {
    const raw = output();
    if (kind === 'wrong-pages') raw.documentPageCount = 2;
    if (kind === 'duplicate-row') raw.rows.push(row());
    const body = envelope(kind === 'malformed-json' ? '{broken' : JSON.stringify(kind === 'extra-field' ? { ...raw, graduationApproved: true } : raw), kind === 'truncated' ? 'MAX_TOKENS' : 'STOP');
    if (kind === 'usage-bound') body.usageMetadata.promptTokenCount = 10001;
    const send = vi.fn<typeof fetch>();
    if (kind === 'timeout') send.mockRejectedValue(new Error('synthetic-provider-error'));
    else send.mockResolvedValue(new Response(JSON.stringify(body), { status: kind === '429' ? 429 : 200 }));
    expect((await createGeminiProvider(policy, send).extract(bytes, 1)).ok).toBe(false); expect(send).toHaveBeenCalledOnce();
  });
  it('rejects unknown policy without egress', async () => {
    const send = vi.fn<typeof fetch>(); expect(maximumCost({ ...policy, maxInputTokens: 0 })).toBeNull();
    expect((await createGeminiProvider({ ...policy, apiKey: '' }, send).extract(bytes, 1)).ok).toBe(false); expect(send).not.toHaveBeenCalled();
  });
});
