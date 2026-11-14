// Local synthetic acceptance composition. Never import this test module from a
// public function entry, runtime.ts, browser bundle or production configuration.
import { createAdmissionCore } from '../../../supabase/functions/extract-transcript/admissionCore';
import type { AdmissionStore, BotVerifier } from '../../../supabase/functions/extract-transcript/admissionCore';
import { createTranscriptHandlerCore } from '../../../supabase/functions/extract-transcript/handlerCore';
import type { PdfInspector } from '../../../supabase/functions/extract-transcript/handlerCore';
import { createSyntheticGeminiProvider } from '../../../supabase/functions/extract-transcript/provider';
import type { ProviderTiming, SyntheticProviderPolicy } from '../../../supabase/functions/extract-transcript/provider';
import type { Result } from '../../../src/contracts';

export interface LocalSyntheticRuntimeOptions {
  allowedOrigin: string;
  disclosureVersion: string;
  sessionSecret: string;
  signingSecret: string;
  apiKey: string;
  modelId: 'gemini-3.5-flash-lite';
  freeTierConfirmed: true;
  expiresAt: string;
  fixtureDigests: readonly string[];
  /** Positive SQL reservation units, not a claim of paid processing or a fee. */
  accounting: { dailyLimitUnits: number; perRequestUnits: number };
  store: AdmissionStore;
  bot: BotVerifier;
  resolveNetwork: (request: Request) => Promise<string | null>;
  authorizeRetry: (input: { reservationId: string; sessionId: string; now: string }) => Promise<Result<null>>;
  /** Must durably reserve local project RPM/TPM/RPD for every transport attempt. */
  authorizeAttempt: SyntheticProviderPolicy['authorizeAttempt'];
  now?: () => string;
  send?: typeof fetch;
  timing?: ProviderTiming;
  /** Lead's local-only constrained parser; admission and digest checks precede it. */
  pdf?: PdfInspector;
}

export function createLocalSyntheticTranscriptRuntime(options: LocalSyntheticRuntimeOptions): (request: Request) => Promise<Response> {
  const now = options.now ?? (() => new Date().toISOString());
  const origin = new URL(options.allowedOrigin);
  const expires = Date.parse(options.expiresAt);
  const created = Date.parse(now());
  const { dailyLimitUnits, perRequestUnits } = options.accounting;
  const fixtureDigests = Object.freeze([...options.fixtureDigests]);
  if (origin.protocol !== 'https:' || origin.hostname !== '127.0.0.1' || origin.origin !== options.allowedOrigin
    || !origin.port || Number(origin.port) < 1024 || options.freeTierConfirmed !== true
    || options.modelId !== 'gemini-3.5-flash-lite' || !options.apiKey
    || !Number.isFinite(created) || !Number.isFinite(expires) || expires <= created || expires - created > 3_600_000
    || !fixtureDigests.length || fixtureDigests.length > 20 || !fixtureDigests.every(d => /^[a-f0-9]{64}$/.test(d))
    || ![dailyLimitUnits, perRequestUnits].every(n => Number.isSafeInteger(n) && n > 0) || perRequestUnits > dailyLimitUnits
    || options.sessionSecret.length < 32 || options.signingSecret.length < 32
    || !options.disclosureVersion || typeof options.authorizeAttempt !== 'function' || typeof options.authorizeRetry !== 'function') {
    throw new Error('invalid_local_synthetic_configuration');
  }
  const permit = Object.freeze({ kind: 'local_synthetic_fixture_only' as const, expiresAt: expires });
  const enabled = (value: typeof permit, time: string) => value === permit && Number.isFinite(Date.parse(time)) && Date.parse(time) < permit.expiresAt;
  const limits = (value: typeof permit, time: string) => enabled(value, time)
    ? { dailyCostCeilingMicrousd: dailyLimitUnits, perRequestReservationMicrousd: perRequestUnits } : null;
  const allowed = new Set(fixtureDigests);
  const admission = createAdmissionCore({ store: options.store, bot: options.bot, signingSecret: options.signingSecret,
    allowedOrigin: origin.origin, disclosureVersion: options.disclosureVersion, now, limits, allowDocument: digest => allowed.has(digest) });
  const provider = createSyntheticGeminiProvider({ apiKey: options.apiKey, modelId: options.modelId,
    freeTierConfirmed: true, fixtureDigests, maxInputTokens: 16384, maxOutputTokens: 8192,
    retry: { maxAttempts: 3, maxElapsedMs: 50_000, baseDelayMs: 6000 }, authorizeAttempt: options.authorizeAttempt }, options.send, options.timing);
  const handler = createTranscriptHandlerCore({ allowedOrigin: origin.origin, disclosureVersion: options.disclosureVersion,
    sessionSecret: options.sessionSecret, eligibility: () => permit, admission, store: options.store, provider,
    resolveNetwork: options.resolveNetwork, now, authorizeEgress: options.authorizeRetry,
    ...(options.pdf ? { pdf: options.pdf } : {}) }, {
    enabled, reservedCost: () => perRequestUnits, processingTier: 'free_tier_synthetic_fixtures_only',
  });
  return async request => {
    // The lead also binds the listener exclusively to127.0.0.1. Request checks are
    // defense in depth; fixture allowlisting remains enforced at ticket/admit/provider.
    if (new URL(request.url).origin !== origin.origin) return Response.json({ ok: false, code: 'forbidden', reasonCode: 'local_synthetic_origin_required' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    return handler(request);
  };
}
