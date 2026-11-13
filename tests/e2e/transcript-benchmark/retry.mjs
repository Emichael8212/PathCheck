import { setTimeout as delay } from 'node:timers/promises';

export const RETRY_POLICY = Object.freeze({ maxAttempts: 4, maxElapsedMs: 120000,
  requestTimeoutMs: 50000, baseDelayMs: 2000, maxDelayMs: 16000 });
export const safeFailure = reason => Object.assign(new Error(reason), { safeReason: reason });

export function retryAfterMs(value, now) {
  if (typeof value !== 'string' || value.length > 128) return 0;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) return Number(value) * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : 0;
}

export function backoffMs(retryIndex, random = Math.random) {
  const cap = Math.min(RETRY_POLICY.maxDelayMs, RETRY_POLICY.baseDelayMs * 2 ** retryIndex);
  return Math.ceil(cap * (0.5 + Math.min(1, Math.max(0, random())) / 2));
}

// Exactly one sequential logical operation. Only a received HTTP503 permits
// another transport attempt. This does not issue/redeem application admission tickets.
export async function with503Retries({ perform, reserve, record, signal,
  now = Date.now, sleep = (ms, abortSignal) => delay(ms, undefined, { signal: abortSignal }), random = Math.random }) {
  const started = now();
  const deadline = started + RETRY_POLICY.maxElapsedMs;
  for (let attempt = 1; attempt <= RETRY_POLICY.maxAttempts; attempt++) {
    if (signal?.aborted) throw safeFailure('cancelled');
    if (now() >= deadline) throw safeFailure('temporary_unavailable_retry_budget_exhausted');
    await reserve({ deadline, signal });
    if (signal?.aborted) throw safeFailure('cancelled');
    if (now() >= deadline) throw safeFailure('temporary_unavailable_retry_budget_exhausted');
    const event = { attempt, startedAt: new Date(now()).toISOString(), outcome: 'pending', status: null };
    await record(event);
    let result;
    const attemptStarted = now();
    const timeout = AbortSignal.timeout(Math.max(1, Math.min(RETRY_POLICY.requestTimeoutMs, deadline - now())));
    try {
      result = await perform(AbortSignal.any(signal ? [signal, timeout] : [timeout]));
    } catch (error) {
      Object.assign(event, { outcome: signal?.aborted ? 'cancelled' : timeout.aborted ? 'timeout' : 'transport_or_response_failure', elapsedMs: now() - attemptStarted });
      await record(event);
      throw safeFailure(signal?.aborted ? 'cancelled' : timeout.aborted ? 'provider_request_timeout' : error.safeReason || 'provider_transport_or_response_failure');
    }
    Object.assign(event, { outcome: result.status >= 200 && result.status < 300 ? 'response' : 'http_failure',
      status: result.status, elapsedMs: now() - attemptStarted });
    if (result.providerError) event.providerError = result.providerError;
    await record(event);
    if (result.status >= 200 && result.status < 300) return { value: result.value, attempts: attempt, elapsedMs: now() - started };
    if (result.status !== 503) throw safeFailure(result.status === 429 ? 'rate_limited_manual_entry_available_no_retry' : `provider_http_${result.status}`);
    if (attempt === RETRY_POLICY.maxAttempts) throw safeFailure('temporary_unavailable_retry_budget_exhausted');
    const waitMs = Math.max(backoffMs(attempt - 1, random), retryAfterMs(result.retryAfter, now()));
    event.retryDelayMs = waitMs;
    event.retryScheduled = Number.isFinite(waitMs) && now() + waitMs < deadline;
    await record(event);
    if (!event.retryScheduled) throw safeFailure('temporary_unavailable_retry_budget_exhausted');
    try { await sleep(waitMs, signal); }
    catch { throw safeFailure(signal?.aborted ? 'cancelled' : 'provider_retry_wait_failed'); }
  }
  throw safeFailure('temporary_unavailable_retry_budget_exhausted');
}

// Reserve every outbound attempt, including503s, metadata and token counting.
// 24,576 conservatively covers the benchmark's16,384 input +8,192 output bounds.
export function quotaWaitMs(daily, now, limits, intervalMs, tokens = 24576) {
  const recent = (daily.recentAttempts || []).filter(a => a.at > now - 60000);
  let wait = Math.max(0, (daily.lastRequestAt || 0) + intervalMs - now);
  for (let i = 0; i <= recent.length; i++) {
    const remaining = recent.slice(i);
    if (remaining.length < limits.rpm && remaining.reduce((n, a) => n + a.tokens, 0) + tokens <= limits.tpm) {
      return Math.max(wait, i ? recent[i - 1].at + 60000 - now + 1 : 0);
    }
  }
  throw safeFailure('token_reservation_exceeds_limit');
}
