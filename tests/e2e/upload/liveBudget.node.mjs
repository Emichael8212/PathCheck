import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createLiveBudget } from './liveBudget.mjs';
const key = 'synthetic-test-key';
const name = `usage-${createHash('sha256').update(key).digest('hex').slice(0, 24)}-gemini-3.5-flash-lite.json`;
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'pathcheck-budget-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
it('serializes concurrent reservations and persists failure usage without storing secrets', () => fixture(async root => {
  const budget = await createLiveBudget({ root, apiKey: key, now: () => 1794600000000 });
  const result = await Promise.all([budget.authorizeAttempt(24576), budget.authorizeAttempt(24576)]);
  assert.deepEqual(result.map(r => r.ok), [true, false]);
  const raw = await readFile(join(root, name), 'utf8');
  assert.equal(JSON.parse(raw).calls, 1); assert.equal(raw.includes(key), false);
  await budget.close();
}));
it('shares the benchmark lifetime lock and refuses concurrent runners', () => fixture(async root => {
  const budget = await createLiveBudget({ root, apiKey: key });
  await assert.rejects(createLiveBudget({ root, apiKey: key }), { code: 'EEXIST' });
  await budget.close(); assert.equal((await readdir(root)).includes('run.lock'), false);
}));
it('preserves prior daily usage and refuses exhausted or malformed ledgers', () => fixture(async root => {
  const now = 1794600000000;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(now));
  await writeFile(join(root, name), JSON.stringify({ day, calls: 500, recentAttempts: [] }), { mode: 0o600 });
  const budget = await createLiveBudget({ root, apiKey: key, now: () => now });
  assert.equal((await budget.authorizeAttempt(24576)).reasonCode, 'local_daily_budget_exhausted');
  await writeFile(join(root, name), '{invalid');
  assert.equal((await budget.authorizeAttempt(24576)).reasonCode, 'invalid_budget_ledger');
  await budget.close();
}));
it('caps one acceptance run even when project quota remains', () => fixture(async root => {
  let now = 1794556800000;
  const budget = await createLiveBudget({ root, apiKey: key, now: () => now });
  for (let i = 0; i < 10; i++) { assert.equal((await budget.authorizeAttempt(24576)).ok, true); now += 6100; }
  assert.equal((await budget.authorizeAttempt(24576)).reasonCode, 'local_acceptance_run_limit');
  await budget.close();
}));
it('retains rolling TPM reservations across Pacific midnight while resetting daily usage', () => fixture(async root => {
  let time = Date.parse('2026-11-14T08:00:01Z');
  await writeFile(join(root, name), JSON.stringify({ day: '2026-11-13', calls: 500,
    lastRequestAt: time - 10000, recentAttempts: Array.from({ length: 10 }, (_, i) => ({ at: time - 30000 + i * 2000, tokens: 24576 })) }), { mode: 0o600 });
  const budget = await createLiveBudget({ root, apiKey: key, now: () => time });
  assert.equal((await budget.authorizeAttempt(24576)).reasonCode, 'local_rate_limit_retry_later');
  time += 60001;
  assert.equal((await budget.authorizeAttempt(24576)).ok, true);
  assert.equal(JSON.parse(await readFile(join(root, name), 'utf8')).calls, 1);
  await budget.close();
}));
it('refuses unreviewed token bounds and reservations after shutdown', () => fixture(async root => {
  const budget = await createLiveBudget({ root, apiKey: key });
  assert.equal((await budget.authorizeAttempt(1)).reasonCode, 'unreviewed_token_reservation');
  await budget.close();
  assert.equal((await budget.authorizeAttempt(24576)).reasonCode, 'local_budget_closed');
}));
