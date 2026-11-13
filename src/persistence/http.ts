import type { Result } from '../contracts';

export type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  status: number;
  ok: boolean;
  text(): Promise<string>;
}>;

export interface HttpResponse { status: number; body: unknown }

export const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Minimal JSON transport. Never logs URLs, headers or bodies (they may carry tokens or
 * academic data). Network errors/timeouts become typed `external_failure` results.
 */
export async function requestJson(fetchImpl: FetchLike, url: string, init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: unknown; timeoutMs?: number }): Promise<Result<HttpResponse>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: 'application/json', ...init.headers };
    const request: Parameters<FetchLike>[1] = { method: init.method, headers, signal: controller.signal };
    if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      request.body = JSON.stringify(init.body);
    }
    const response = await fetchImpl(url, request);
    const text = await response.text();
    let body: unknown = null;
    if (text !== '') {
      try {
        body = JSON.parse(text);
      } catch {
        return { ok: false, code: 'external_failure', reasonCode: 'malformed_response' };
      }
    }
    return { ok: true, value: { status: response.status, body } };
  } catch {
    return { ok: false, code: 'external_failure', reasonCode: controller.signal.aborted ? 'request_timeout' : 'network_error' };
  } finally {
    clearTimeout(timer);
  }
}

/** PostgREST / Postgres error code from an error body, if present. */
export function errorCode(body: unknown): string | null {
  return typeof body === 'object' && body !== null && typeof (body as { code?: unknown }).code === 'string' ? (body as { code: string }).code : null;
}
