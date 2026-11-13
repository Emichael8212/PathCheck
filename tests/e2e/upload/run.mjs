// Agent-run integration, not human acceptance. Local credentials stay in child
// server environment, never arguments/browser variables/logs or repository files.
import { execFileSync, spawnSync } from 'node:child_process';
try {
  const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { env: { ...process.env, DOCKER_CONTEXT: 'colima-pathcheck-test' }, stdio: ['ignore', 'pipe', 'pipe'] }).toString());
  if (status.API_URL !== 'http://127.0.0.1:55431' || !status.SERVICE_ROLE_KEY) throw Error('local_only');
  const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '-c', 'tests/e2e/upload/playwright.config.ts'], {
    env: { ...process.env, PATHCHECK_UPLOAD_TEST: '1', PATHCHECK_LOCAL_API_URL: status.API_URL, PATHCHECK_LOCAL_ROLE_KEY: status.SERVICE_ROLE_KEY }, encoding: 'utf8', maxBuffer: 4000000,
  });
  let output = (result.stdout ?? '') + (result.stderr ?? '');
  for (const [name, value] of Object.entries(status)) if (/KEY|SECRET/.test(name) && typeof value === 'string' && value) output = output.split(value).join('[REDACTED]');
  console.log(output.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED JWT]'));
  process.exitCode = result.status ?? 1;
} catch { console.log('BLOCKED: isolated local Supabase status or test runner unavailable. No credentials printed.'); process.exitCode = 1; }
