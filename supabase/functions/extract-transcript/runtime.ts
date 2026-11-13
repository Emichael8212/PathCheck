import { createTranscriptHandler } from './handler';
import type { EndpointOptions } from './handler';
import { createGeminiProvider, maximumCost } from './provider';
import type { ProviderPolicy, ProviderTiming } from './provider';

export interface TranscriptRuntimeOptions {
  /** Deno.env.get or an equivalent server-only secret reader. Never passed to React. */
  readSecret: (name: 'GEMINI_API_KEY' | 'PATHCHECK_GEMINI_MODEL') => string | undefined;
  reviewedPolicy: Omit<ProviderPolicy, 'apiKey'>;
  endpoint: Omit<EndpointOptions, 'provider' | 'maximumProviderCostMicrousd'>;
  send?: typeof fetch;
  timing?: ProviderTiming;
}

/** Runnable Request→Response composition. The host owns the listener/gateway and
 * atomic admission adapter. No processing approval is manufactured from env flags. */
export function createTranscriptRuntime(options: TranscriptRuntimeOptions): (request: Request) => Promise<Response> {
  let apiKey = ''; let selectedModel = '';
  try { apiKey = options.readSecret('GEMINI_API_KEY') ?? ''; selectedModel = options.readSecret('PATHCHECK_GEMINI_MODEL') ?? ''; } catch { /* fail closed */ }
  const policy: ProviderPolicy = { ...options.reviewedPolicy, apiKey };
  const configured = selectedModel === options.reviewedPolicy.modelId && apiKey.length > 0;
  const maximum = configured ? maximumCost(policy) : null;
  return createTranscriptHandler({ ...options.endpoint,
    maximumProviderCostMicrousd: maximum,
    provider: createGeminiProvider(policy, options.send, options.timing),
    eligibility: () => maximum === null ? { status: 'disabled', reasonCode: 'server_provider_configuration_required' } : options.endpoint.eligibility(),
  });
}
