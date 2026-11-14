// Local synthetic acceptance only. Shares the existing benchmark lock and ledger;
// no key, document, output text or credential is written to the ledger.
import { mkdir, open, readFile, lstat, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { atomicJson } from '../transcript-benchmark/checkpoint.mjs';
import { quotaWaitMs } from '../transcript-benchmark/retry.mjs';

const failure = reasonCode => ({ ok: false, code: 'rate_limited', reasonCode });
const dayAt = time => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(time));
export async function createLiveBudget({ apiKey, root = '/private/tmp/pathcheck-gemini-benchmark-v1', now = Date.now }) {
  if (!apiKey) throw Error('server_key_required');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const directory = await lstat(root);
  if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077)) throw Error('private_budget_directory_required');
  const lockPath = `${root}/run.lock`;
  // Same lifetime lock used by the benchmark. Do not steal a lock after a crash.
  const lock = await open(lockPath, 'wx', 0o600);
  const keyId = createHash('sha256').update(apiKey).digest('hex').slice(0, 24);
  const path = `${root}/usage-${keyId}-gemini-3.5-flash-lite.json`;
  let callsThisRun = 0, closed = false, serial = Promise.resolve();
  async function reserve(maximumTokens) {
    if (closed) return failure('local_budget_closed');
    if (maximumTokens !== 24576) return failure('unreviewed_token_reservation');
    if (callsThisRun >= 10) return failure('local_acceptance_run_limit');
    let previous = { day: dayAt(now()), calls: 0, recentAttempts: [] };
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 1000000 || (info.mode & 0o077)) return failure('private_budget_ledger_required');
      previous = JSON.parse(await readFile(path, 'utf8'));
      if (!previous.recentAttempts) previous.legacyCooldownUntil = info.mtimeMs + 60000;
    } catch (error) { if (error.code !== 'ENOENT') return failure('invalid_budget_ledger'); }
    const time = now(), today = dayAt(time);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(previous.day) || previous.day > today
      || !Number.isSafeInteger(previous.calls) || previous.calls < 0
      || (previous.lastRequestAt !== undefined && (!Number.isFinite(previous.lastRequestAt) || previous.lastRequestAt > time))
      || (previous.legacyCooldownUntil !== undefined && !Number.isFinite(previous.legacyCooldownUntil))
      || (previous.recentAttempts !== undefined && (!Array.isArray(previous.recentAttempts)
        || previous.recentAttempts.some(a => !Number.isFinite(a.at) || a.at > time || a.tokens !== 24576)))) return failure('invalid_budget_ledger');
    if (previous.day !== today) previous = { ...previous, day: today, calls: 0 };
    if (previous.calls >= 500) return failure('local_daily_budget_exhausted');
    // Fail quickly instead of sleeping past the endpoint's lease/cancellation.
    // Google503 retries have >=6s backoff; no overlapping provider calls allowed.
    if ((previous.legacyCooldownUntil ?? 0) > time
      || quotaWaitMs(previous, time, { rpm: 15, tpm: 250000 }, 6000) > 0) return failure('local_rate_limit_retry_later');
    const next = { ...previous, day: today, calls: previous.calls + 1, lastRequestAt: time,
      recentAttempts: [...(previous.recentAttempts ?? []).filter(a => a.at > time - 60000), { at: time, tokens: 24576 }] };
    try { await atomicJson(path, next); } catch { return failure('budget_persistence_unavailable'); }
    callsThisRun++;
    return { ok: true, value: null };
  }
  return {
    authorizeAttempt(maximumTokens) {
      const result = serial.then(() => reserve(maximumTokens));
      serial = result.catch(() => undefined);
      return result;
    },
    async close() {
      closed = true;
      await serial;
      await lock.close();
      await unlink(lockPath);
    },
  };
}
