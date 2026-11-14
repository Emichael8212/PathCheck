import { describe, expect, it, vi } from 'vitest';
import { createFunctionEntry, startTranscriptFunction } from '../../supabase/functions/extract-transcript/entry';
import type { TranscriptHostBindings, TranscriptRequestHandler } from '../../supabase/functions/extract-transcript/entry';
import { createGuestAdmission } from '../../supabase/functions/extract-transcript/admission';
import { context, eligibility, secret, storeDouble, time } from '../fixtures/transcripts/server';

function fixture(): TranscriptHostBindings {
  const store = storeDouble();
  return {
    readSecret: vi.fn(name => name === 'GEMINI_API_KEY' ? 'synthetic-never-a-key' : 'synthetic-model'),
    reviewedPolicy: { modelId: 'synthetic-model', maxInputTokens: 1000, maxOutputTokens: 1000,
      inputMicrousdPerMillionTokens: 1000, outputMicrousdPerMillionTokens: 1000 },
    send: vi.fn<typeof fetch>(),
    endpoint: { allowedOrigin: context.origin, disclosureVersion: 'v1', sessionSecret: secret,
      eligibility: () => eligibility, now: () => time, store,
      admission: createGuestAdmission({ store, bot: { verify: async () => false }, signingSecret: secret,
        allowedOrigin: context.origin, disclosureVersion: 'v1', now: () => time }),
      pdf: { inspect: vi.fn() }, resolveNetwork: vi.fn(async () => null),
      authorizeRetry: vi.fn(), authorizeEgress: vi.fn(),
    },
  };
}
const availability = () => new Request(`${context.origin}/api/transcript/availability`);
describe('function boot and mandatory host bindings (synthetic ports, no external services)', () => {
  it('serves a redacted unavailable response with no bindings and no body read', async () => {
    const request = new Request(`${context.origin}/extract`, { method: 'POST', body: 'sensitive-test-marker' });
    const response = await createFunctionEntry(null)(request);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"ok":false,"code":"unavailable","reasonCode":"server_runtime_configuration_required"}');
    expect(request.bodyUsed).toBe(false);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('set-cookie')).toBe(false);
  });
  it.each(['pdf', 'authorizeRetry', 'authorizeEgress', 'resolveNetwork', 'admission', 'store'] as const)(
    'rejects missing %s before reading secrets', async name => {
      const bindings = fixture();
      Reflect.deleteProperty(bindings.endpoint, name);
      expect((await createFunctionEntry(bindings)(availability())).status).toBe(503);
      expect(bindings.readSecret).not.toHaveBeenCalled();
      expect(bindings.send).not.toHaveBeenCalled();
    });
  it.each(['http://pathcheck.test', 'https://pathcheck.test/', 'https://user:password@pathcheck.test', 'invalid'])('rejects non-exact HTTPS origin %s', async origin => {
    const bindings = fixture(); bindings.endpoint.allowedOrigin = origin;
    expect((await createFunctionEntry(bindings)(availability())).status).toBe(503);
    expect(bindings.readSecret).not.toHaveBeenCalled();
  });
  it('rejects malformed disclosure and session configuration before secret access', async () => {
    for (const field of ['disclosureVersion', 'sessionSecret'] as const) {
      const bindings = fixture(); bindings.endpoint[field] = '';
      expect((await createFunctionEntry(bindings)(availability())).status).toBe(503);
      expect(bindings.readSecret).not.toHaveBeenCalled();
    }
  });
  it('boots the actual paid handler; an unsigned network identity cannot issue a guest cookie', async () => {
    const bindings = fixture(); const handler = createFunctionEntry(bindings);
    expect(await (await handler(availability())).json()).toMatchObject({ ok: true, value: { status: 'approved' } });
    const response = await handler(new Request(`${context.origin}/session`, { method: 'POST', headers: { origin: context.origin, 'content-type': 'application/json' }, body: '{}' }));
    expect(response.status).toBe(403);
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(await response.json()).toMatchObject({ reasonCode: 'trusted_network_identity_required' });
    expect(bindings.send).not.toHaveBeenCalled();
    expect(bindings.endpoint.pdf.inspect).not.toHaveBeenCalled();
  });
  it('missing provider secrets preserve the existing disabled availability and zero dispatch', async () => {
    const bindings = fixture(); bindings.readSecret = vi.fn(() => undefined);
    const response = await createFunctionEntry(bindings)(availability());
    expect(await response.json()).toMatchObject({ ok: true, value: { status: 'disabled' } });
    expect(bindings.send).not.toHaveBeenCalled();
  });
  it('supplies a redacted runtime onError without logging exception messages', async () => {
    let capture: { onError: () => Response; handler: TranscriptRequestHandler } | undefined;
    const serve = vi.fn((options, handler) => { capture = { ...options, handler }; return 'server'; });
    expect(startTranscriptFunction({ serve }, null)).toBe('server');
    expect(serve).toHaveBeenCalledOnce();
    expect(capture?.onError().status).toBe(503);
    expect((await capture?.handler(availability()))?.status).toBe(503);
  });
  it('browser document presence denies secret-bearing composition', async () => {
    vi.stubGlobal('document', {});
    try {
      const bindings = fixture(); expect((await createFunctionEntry(bindings)(availability())).status).toBe(503);
      expect(bindings.readSecret).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it('a Deno-compatible window alias alone does not reject server composition', async () => {
    vi.stubGlobal('window', globalThis);
    try {
      const response = await createFunctionEntry(fixture())(availability());
      expect(await response.json()).toMatchObject({ ok: true, value: { status: 'approved' } });
    } finally { vi.unstubAllGlobals(); }
  });
  it('isolates per-request bindings across concurrent requests without a global network identity', async () => {
    const calls: string[] = [];
    const entry = createFunctionEntry(async request => {
      const bindings = fixture(); const id = request.headers.get('x-synthetic-id')!;
      bindings.endpoint.resolveNetwork = async () => { await Promise.resolve(); calls.push(id); return null; };
      return bindings;
    });
    const responses = await Promise.all(['a', 'b'].map(id => entry(new Request(`${context.origin}/session`, {
      method: 'POST', headers: { origin: context.origin, 'content-type': 'application/json', 'x-synthetic-id': id }, body: '{}',
    }))));
    expect(responses.map(response => response.status)).toEqual([403, 403]);
    expect(calls.sort()).toEqual(['a', 'b']);
  });
  it('rejects an already-cancelled request without starting the factory and redacts binding errors', async () => {
    const controller = new AbortController(); controller.abort();
    const source = vi.fn(() => new Promise<TranscriptHostBindings | null>(() => {}));
    expect((await createFunctionEntry(source)(new Request(`${context.origin}/availability`, { signal: controller.signal }))).status).toBe(503);
    expect(source).not.toHaveBeenCalled();
    const failed = createFunctionEntry(() => { throw new Error('secret-error-marker'); });
    expect(await (await failed(availability())).text()).not.toContain('secret-error-marker');
  });
  it('aborts a genuinely pending factory without constructing a runtime after it resolves', async () => {
    const bindings = fixture();
    let resolve: ((value: TranscriptHostBindings) => void) | undefined;
    const source = vi.fn(() => new Promise<TranscriptHostBindings>(done => { resolve = done; }));
    const controller = new AbortController();
    const response = createFunctionEntry(source)(new Request(`${context.origin}/availability`, { signal: controller.signal }));
    expect(source).toHaveBeenCalledOnce();
    controller.abort();
    expect((await response).status).toBe(503);
    resolve?.(bindings); await Promise.resolve(); await Promise.resolve();
    expect(bindings.readSecret).not.toHaveBeenCalled();
    expect(bindings.send).not.toHaveBeenCalled();
    expect(bindings.endpoint.pdf.inspect).not.toHaveBeenCalled();
    expect(bindings.endpoint.store.issue).not.toHaveBeenCalled();
    expect(bindings.endpoint.store.admit).not.toHaveBeenCalled();
  });
  it('bounds a nonresolving host binding factory before runtime or secret access', async () => {
    const bindings = fixture();
    let resolve: ((value: TranscriptHostBindings) => void) | undefined;
    const response = await createFunctionEntry(() => new Promise<TranscriptHostBindings>(done => { resolve = done; }))(availability());
    expect(response.status).toBe(503);
    resolve?.(bindings); await Promise.resolve(); await Promise.resolve();
    expect(bindings.readSecret).not.toHaveBeenCalled();
    expect(bindings.send).not.toHaveBeenCalled();
    expect(bindings.endpoint.pdf.inspect).not.toHaveBeenCalled();
    expect(bindings.endpoint.store.admit).not.toHaveBeenCalled();
  });
});
