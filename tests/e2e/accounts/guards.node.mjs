import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  ['PATH', 'HOME', 'TMPDIR', 'USER', 'SHELL', 'LANG', 'CI', 'PLAYWRIGHT_BROWSERS_PATH'].includes(key)));

function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(f => f.isDirectory() ? files(join(dir, f.name)) : [join(dir, f.name)]);
}
for (const secret of ['sb_secret_synthetic_do_not_bundle', `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.syntheticSignature`]) {
  test(`reject ${secret.startsWith('sb_secret') ? 'secret' : 'service-role'} key before Vite emits output`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'pathcheck-config-guard-'));
    try {
      const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', join(dir, 'dist')], {
        env: { ...env, VITE_SUPABASE_URL: 'http://127.0.0.1:55431', VITE_SUPABASE_PUBLISHABLE_KEY: secret }, encoding: 'utf8', timeout: 30000 });
      const output = result.stdout + result.stderr;
      assert.equal(result.status, 1);
      assert.ok(output.includes('Invalid browser-public Supabase configuration'));
      assert.ok(!output.includes(secret), 'rejected value must not be logged');
      assert.equal(existsSync(join(dir, 'dist')), false, 'no emitted bundle');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

for (const dom of ['0', '1']) test(`forced OTP failure (${dom === '1' ? 'filled input' : 'missing input'}) exposes no code in terminal output or artifacts`, () => {
  const dir = mkdtempSync(join(tmpdir(), 'pathcheck-otp-guard-'));
  const sentinel = '981724'; // Synthetic only, never an actual credential.
  try {
    const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '-c', 'tests/e2e/accounts/playwright.config.ts', '--output', dir], {
      env: { ...env, PATHCHECK_ACCOUNT_PRIVACY_PROBE: '1', PATHCHECK_OTP_DOM_PROBE: dom, PATHCHECK_OTP_TEST_SENTINEL: sentinel }, encoding: 'utf8', timeout: 30000 });
    const output = result.stdout + result.stderr;
    assert.equal(result.status, 1, 'probe must actually fail');
    assert.ok(output.includes('Local OTP verification failed; sensitive diagnostics suppressed.'));
    assert.ok(!output.includes(sentinel), 'no OTP in terminal');
    for (const path of files(dir)) assert.ok(!readFileSync(path, 'utf8').includes(sentinel), 'no OTP in artifacts');
    assert.ok(files(dir).some(f => f.endsWith('error-context.md')), 'guard inspects actual failure artifact');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
