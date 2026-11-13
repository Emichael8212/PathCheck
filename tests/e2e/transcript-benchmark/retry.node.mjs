import { it } from 'node:test';
import assert from 'node:assert/strict';
import { with503Retries, RETRY_POLICY, backoffMs, retryAfterMs, quotaWaitMs } from './retry.mjs';
function harness(statuses) {
  let time = 100000, calls = 0, reserves = 0;
  const events = [], waits = [];
  return { events, waits, calls: () => calls, reserves: () => reserves,
    options: { now: () => time, random: () => 1, reserve: async () => { reserves++; },
      sleep: async ms => { waits.push(ms); time += ms; }, record: async e => { events.push(structuredClone(e)); },
      perform: async () => { calls++; return { status: statuses.shift(), value: { synthetic: true } }; } } };
}
it('retries only503 sequentially, reserves each attempt and retains failure history', async () => {
  const h = harness([503, 503, 200]);
  assert.equal((await with503Retries(h.options)).attempts, 3);
  assert.equal(h.reserves(), 3);
  assert.deepEqual(h.waits, [2000, 4000]);
  assert.equal(h.events.filter(e => e.status === 503 && e.retryScheduled).length, 2);
});
it('stops at four attempts without converting unavailable responses into accuracy failures', async () => {
  const h = harness([503, 503, 503, 503, 200]);
  await assert.rejects(with503Retries(h.options), { safeReason: 'temporary_unavailable_retry_budget_exhausted' });
  assert.equal(h.calls(), RETRY_POLICY.maxAttempts);
});
it('does not retry invalid credentials, malformed requests, forbidden admission or429', async () => {
  for (const status of [400, 401, 403, 409, 429, 500]) {
    const h = harness([status, 200]);
    await assert.rejects(with503Retries(h.options));
    assert.equal(h.calls(), 1);
  }
});
it('honors Retry-After seconds/date and refuses waits beyond elapsed budget', async () => {
  assert.equal(retryAfterMs('4', 100000), 4000);
  assert.equal(retryAfterMs(new Date(105000).toUTCString(), 100000), 5000);
  assert.equal(retryAfterMs('untrusted text', 100000), 0);
  const h = harness([]);
  h.options.perform = async () => ({ status: 503, retryAfter: '121' });
  await assert.rejects(with503Retries(h.options), { safeReason: 'temporary_unavailable_retry_budget_exhausted' });
  assert.equal(h.waits.length, 0);
});
it('honors Retry-After before the second attempt and bounds jitter', async () => {
  const h = harness([200]); let first = true;
  const actual = h.options.perform;
  h.options.perform = async () => first ? (first = false, { status: 503, retryAfter: '9' }) : actual();
  await with503Retries(h.options);
  assert.deepEqual(h.waits, [9000]);
  assert.equal(backoffMs(0, () => 0), 1000);
  assert.equal(backoffMs(100, () => 1), 16000);
});
it('cancellation during backoff never starts another request', async () => {
  const h = harness([503, 200]); const controller = new AbortController();
  h.options.signal = controller.signal;
  h.options.sleep = async () => { controller.abort(); throw Error('cancelled'); };
  await assert.rejects(with503Retries(h.options), { safeReason: 'cancelled' });
  assert.equal(h.calls(), 1);
});
it('propagates cancellation to an in-flight request and preserves the cancellation outcome', async () => {
  const h = harness([]); const controller = new AbortController();
  h.options.signal = controller.signal;
  h.options.perform = async signal => { controller.abort(); assert.equal(signal.aborted, true); throw Error('cancelled'); };
  await assert.rejects(with503Retries(h.options), { safeReason: 'cancelled' });
  assert.equal(h.reserves(), 1);
  assert.equal(h.events.at(-1).outcome, 'cancelled');
});
it('does not retry network failures and records the uncertain transport outcome', async () => {
  const h = harness([]);
  h.options.perform = async () => { throw Error('DO_NOT_LOG'); };
  await assert.rejects(with503Retries(h.options), { safeReason: 'provider_transport_or_response_failure' });
  assert.equal(h.events.at(-1).outcome, 'transport_or_response_failure');
  assert.equal(JSON.stringify(h.events).includes('DO_NOT_LOG'), false);
});
it('respects elapsed deadline even when quota pacing consumes the remaining budget', async () => {
  const h = harness([200]); let time = 0;
  h.options.now = () => time;
  h.options.reserve = async () => { time = 120000; };
  await assert.rejects(with503Retries(h.options), { safeReason: 'temporary_unavailable_retry_budget_exhausted' });
  assert.equal(h.calls(), 0);
});
it('preserves RPM/TPM windows and spacing across retry/resume boundaries', () => {
  const limits = { rpm: 15, tpm: 250000 };
  const daily = { lastRequestAt: 100000, recentAttempts: Array.from({ length: 10 }, (_, i) => ({ at: 46000 + i * 6000, tokens: 24576 })) };
  assert.equal(quotaWaitMs(daily, 100001, limits, 6000), 6000);
  assert.equal(quotaWaitMs(daily, 106001, limits, 6000), 0);
  assert.equal(quotaWaitMs({ lastRequestAt: 100000 }, 100001, limits, 6000), 5999);
});
