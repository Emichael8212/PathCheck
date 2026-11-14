import { createTranscriptRuntime } from './runtime';
import type { TranscriptRuntimeOptions } from './runtime';
import type { PdfInspector } from './handler';
import { abortable } from './lifecycle';

/** Host code supplies these ports after its security review. Their presence is
 * necessary for boot, not evidence that ingress or hosted isolation is approved. */
export type TranscriptHostBindings = Omit<TranscriptRuntimeOptions, 'endpoint'> & {
  endpoint: TranscriptRuntimeOptions['endpoint'] & {
    pdf: PdfInspector;
    authorizeRetry: NonNullable<TranscriptRuntimeOptions['endpoint']['authorizeRetry']>;
    authorizeEgress: NonNullable<TranscriptRuntimeOptions['endpoint']['authorizeEgress']>;
  };
};
export type TranscriptRequestHandler = (request: Request) => Promise<Response>;
/** Static code can create an isolated store/network context for each request.
 * Never place a mutable current-request identity in a process-global binding. */
export type TranscriptBindingSource = TranscriptHostBindings | ((request: Request) => TranscriptHostBindings | null | Promise<TranscriptHostBindings | null>) | null;
export interface FunctionServer {
  serve(options: { onError: () => Response }, handler: TranscriptRequestHandler): unknown;
}

function unavailable(): Response {
  return new Response(JSON.stringify({ ok: false, code: 'unavailable', reasonCode: 'server_runtime_configuration_required' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function validBindings(bindings: TranscriptHostBindings | null): bindings is TranscriptHostBindings {
  if (!bindings || typeof document !== 'undefined') return false;
  const { endpoint, reviewedPolicy, readSecret } = bindings;
  if (!endpoint || !reviewedPolicy || typeof readSecret !== 'function') return false;
  const origin = new URL(endpoint.allowedOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== endpoint.allowedOrigin || origin.username || origin.password) return false;
  if (!/^[A-Za-z0-9_.:-]{1,100}$/.test(endpoint.disclosureVersion)
    || typeof endpoint.sessionSecret !== 'string' || endpoint.sessionSecret.length < 32 || endpoint.sessionSecret.length > 4096) return false;
  const ports = [endpoint.eligibility, endpoint.resolveNetwork, endpoint.pdf?.inspect,
    endpoint.authorizeRetry, endpoint.authorizeEgress,
    endpoint.admission?.issueTicket, endpoint.admission?.admit, endpoint.admission?.revokeConsent, endpoint.admission?.finish,
    endpoint.store?.issue, endpoint.store?.admit, endpoint.store?.dispatch, endpoint.store?.revoke, endpoint.store?.finish];
  return ports.every(port => typeof port === 'function');
}

/** No environment switch enables processing. No body, secret or external port is
 * touched unless the complete server binding is present. Runtime eligibility is
 * still checked by the existing paid-only handler on every request and egress. */
export function createFunctionEntry(source: TranscriptBindingSource): TranscriptRequestHandler {
  if (typeof document !== 'undefined') return async () => unavailable();
  if (typeof source === 'function') {
    return async request => {
      try {
        if (request.signal.aborted) return unavailable();
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(1000)]);
        const bindings = await abortable(Promise.resolve(source(request)), signal);
        return await createFunctionEntry(bindings)(request);
      } catch { return unavailable(); }
    };
  }
  try {
    const bindings = source;
    if (!validBindings(bindings)) return async () => unavailable();
    const handler = createTranscriptRuntime(bindings);
    return async request => {
      try { return await handler(request); } catch { return unavailable(); }
    };
  } catch { return async () => unavailable(); }
}

/** Deno.serve-compatible listener; redacts unexpected exceptions instead of
 * allowing the default runtime logger to print request or credential details. */
export function startTranscriptFunction(server: FunctionServer, bindings: TranscriptBindingSource): unknown {
  return server.serve({ onError: unavailable }, createFunctionEntry(bindings));
}
