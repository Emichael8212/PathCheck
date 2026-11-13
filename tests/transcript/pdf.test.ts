import { describe, expect, it, vi } from 'vitest';
import { ADMISSION_LIMITS } from '../../src/contracts';
import { createPdfInspector } from '../../supabase/functions/extract-transcript/pdf';
import { createTranscriptHandler } from '../../supabase/functions/extract-transcript/handler';
import { createGuestAdmission } from '../../supabase/functions/extract-transcript/admission';
import { sha256, sign } from '../../supabase/functions/extract-transcript/crypto';
import { basicObjects, encryptedTrailerPdf, generatedPdf, objectPdf } from '../fixtures/transcripts/pdf';
import { context, eligibility, issue, secret, storeDouble, time } from '../fixtures/transcripts/server';
import { extraction } from '../fixtures/transcripts/synthetic';

const inspector = createPdfInspector();
describe('real PDF structural inspector (no provider benchmark claim)', () => {
  it.each([1, 2, 20])('counts %i pages in compressed object-stream PDFs without modifying bytes', async count => {
    const bytes = await generatedPdf(count);
    const original = bytes.slice();
    expect(await inspector.inspect(bytes)).toEqual({ ok: true, value: { pageCount: count } });
    expect(bytes).toEqual(original);
  });
  it('accepts both ordinary xref tables and an independently authored page tree', async () => {
    expect(await inspector.inspect(await generatedPdf(2, false))).toEqual({ ok: true, value: { pageCount: 2 } });
    expect(await inspector.inspect(objectPdf(basicObjects()))).toEqual({ ok: true, value: { pageCount: 1 } });
  });
  it.each([0, 21])('rejects %i actual pages', async count => {
    expect(await inspector.inspect(await generatedPdf(count))).toMatchObject({ ok: false, reasonCode: 'pdf_page_limit' });
  });
  it('rejects the encrypted trailer without ignoring encryption', async () => {
    expect(await inspector.inspect(encryptedTrailerPdf())).toMatchObject({ ok: false, reasonCode: 'pdf_malformed_or_encrypted' });
  });
  it('rejects empty and oversized bytes before parsing', async () => {
    for (const bytes of [new Uint8Array(), new Uint8Array(ADMISSION_LIMITS.maxPdfBytes + 1)]) {
      expect(await inspector.inspect(bytes)).toMatchObject({ ok: false, reasonCode: 'pdf_size_limit' });
    }
  });
  it('rejects false magic, truncation, appended data and invalid xref offsets', async () => {
    const bytes = objectPdf(basicObjects());
    const text = new TextDecoder().decode(bytes);
    for (const bad of [text.replace('%PDF-', '%PNG-'), text.slice(0, -12), text + 'unexpected', text.replace(/startxref\n\d+/, 'startxref\n0')]) {
      expect((await inspector.inspect(new TextEncoder().encode(bad))).ok).toBe(false);
    }
  });
  it.each([
    ['false count', '<< /Type /Pages /Kids [3 0 R] /Count 0 >>'],
    ['negative count', '<< /Type /Pages /Kids [3 0 R] /Count -1 >>'],
    ['fractional count', '<< /Type /Pages /Kids [3 0 R] /Count 1.5 >>'],
    ['missing count', '<< /Type /Pages /Kids [3 0 R] >>'],
    ['missing child', '<< /Type /Pages /Kids [99 0 R] /Count 1 >>'],
    ['duplicate page', '<< /Type /Pages /Kids [3 0 R 3 0 R] /Count 2 >>'],
    ['cycle', '<< /Type /Pages /Kids [2 0 R] /Count 1 >>'],
  ])('rejects malformed page tree: %s', async (_label, tree) => {
    const objects = basicObjects(); objects[1] = tree;
    expect(await inspector.inspect(objectPdf(objects))).toMatchObject({ ok: false, reasonCode: 'pdf_invalid_page_tree' });
  });
  it('rejects broken parent links and a catalog with no pages root', async () => {
    const objects = basicObjects(); objects[2] = '<< /Type /Page /Parent 99 0 R /MediaBox [0 0 612 792] >>';
    expect((await inspector.inspect(objectPdf(objects))).ok).toBe(false);
    objects[0] = '<< /Type /Catalog >>';
    expect((await inspector.inspect(objectPdf(objects))).ok).toBe(false);
  });
  it('does not copy input-derived parser errors into failures or logs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const bytes = objectPdf([...basicObjects(), 'sensitive-fixture-marker-invalid-object']);
      const result = await inspector.inspect(bytes);
      expect(result).toEqual({ ok: false, code: 'validation_error', reasonCode: 'pdf_malformed_or_encrypted' });
      expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    } finally { warn.mockRestore(); error.mockRestore(); }
  });
});

describe('handler uses the real inspector by default (atomic store/provider are explicit test doubles)', () => {
  async function upload(bytes: Uint8Array) {
    const store = storeDouble();
    const admission = createGuestAdmission({ store, bot: { verify: async () => true }, signingSecret: secret, allowedOrigin: context.origin, disclosureVersion: 'v1', now: () => time });
    const ticket = await admission.issueTicket({ ...issue, documentDigest: await sha256(bytes) }, { ...context, now: time, eligibility });
    if (!ticket.ok) throw new Error('synthetic ticket setup failed');
    const cookie = await sign({ sessionId: context.serverSessionId, issuedAt: Date.parse(time), expiresAt: Date.parse(time) + 3600000 }, secret, 'session');
    const provider = { extract: vi.fn().mockResolvedValue({ ok: true, value: { extraction: extraction(), actualCostMicrousd: 1, promptTokens: 10, outputTokens: 10 } }) };
    const handler = createTranscriptHandler({ allowedOrigin: context.origin, disclosureVersion: 'v1', sessionSecret: secret, eligibility: () => eligibility, maximumProviderCostMicrousd: 20, admission, store, provider, resolveNetwork: async () => context.networkKey, now: () => time });
    const response = await handler(new Request(`${context.origin}/api/transcript/extract`, {
      method: 'POST', headers: { origin: context.origin, 'Content-Type': 'application/pdf', cookie: `__Host-pathcheck_guest=${cookie}`, 'X-Extraction-Ticket': ticket.value.signedTicket, 'X-Consent-Receipt': ticket.value.consentReceiptId }, body: bytes.slice(),
    }));
    return { response, store, provider };
  }
  it.each(['encrypted', 'malformed', 'truncated', 'excessive'] as const)('rejects real %s fixture with zero provider calls', async kind => {
    const valid = await generatedPdf(1);
    const bytes = kind === 'encrypted' ? encryptedTrailerPdf() : kind === 'excessive' ? await generatedPdf(21) : kind === 'truncated' ? valid.slice(0, -20) : objectPdf(['<< /Type /Catalog >>']);
    const { response, store, provider } = await upload(bytes);
    expect(response.status).toBe(400); expect(provider.extract).not.toHaveBeenCalled(); expect(store.dispatch).not.toHaveBeenCalled();
    expect(store.finish).toHaveBeenCalledWith(expect.objectContaining({ actualCostMicrousd: 0, outcome: 'failed' }));
  });
  it('dispatches a valid real PDF with the independently counted pages', async () => {
    const { response, store, provider } = await upload(await generatedPdf(2));
    expect(response.status).toBe(200); expect(provider.extract).toHaveBeenCalledOnce();
    expect(provider.extract.mock.calls[0]?.[1]).toBe(2);
    expect(store.finish).toHaveBeenCalledWith(expect.objectContaining({ actualCostMicrousd: 1, outcome: 'success' }));
  });
});
