// Local orchestration only. Secret environment is supplied to the server child,
// stripped from the browser test child, never printed or included in command args.
import { execFileSync, spawn } from 'node:child_process';
import https from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';
const mode = process.argv[2];
if (!['--test', '--serve'].includes(mode) || process.argv.length !== 3) throw Error('use_--test_or_--serve');
let child;
const baseEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'CI', 'FORCE_COLOR', 'NO_COLOR', 'PLAYWRIGHT_BROWSERS_PATH'].includes(name)));
try {
  if (process.env.PATHCHECK_GEMINI_FREE_TIER_CONFIRMED !== '1' || !process.env.GEMINI_API_KEY
    || process.env.PATHCHECK_GEMINI_MODEL !== 'gemini-3.5-flash-lite') throw Error('server_configuration_required');
  const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], {
    env: { ...baseEnvironment, DOCKER_CONTEXT: 'colima-pathcheck-test' }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }).toString());
  if (status.API_URL !== 'http://127.0.0.1:55431' || !status.SERVICE_ROLE_KEY) throw Error('local_database_required');
  const secrets = [process.env.GEMINI_API_KEY, ...Object.entries(status).filter(([name]) => /KEY|SECRET/.test(name)).map(([, value]) => value)].filter(v => typeof v === 'string' && v);
  const redact = text => secrets.reduce((value, secret) => value.split(secret).join('[REDACTED]'), text).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED JWT]');
  child = spawn(process.execPath, ['tests/e2e/upload/liveServer.mjs'], { env: { ...baseEnvironment,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY, PATHCHECK_GEMINI_MODEL: 'gemini-3.5-flash-lite', PATHCHECK_GEMINI_FREE_TIER_CONFIRMED: '1',
    PATHCHECK_LIVE_SYNTHETIC: '1', PATHCHECK_LOCAL_API_URL: status.API_URL, PATHCHECK_LOCAL_ROLE_KEY: status.SERVICE_ROLE_KEY }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { if (logs.length < 100000) logs += bytes.toString(); });
  const closed = new Promise(resolve => child.once('exit', code => resolve(code)));
  async function stop() { if (child.exitCode === null) child.kill('SIGTERM'); await Promise.race([closed, delay(5000)]); if (child.exitCode === null) child.kill('SIGKILL'); }
  process.once('SIGINT', () => { void stop(); }); process.once('SIGTERM', () => { void stop(); });
  const probe = () => new Promise(resolve => {
    const request = https.get('https://127.0.0.1:5185/__live/evidence', { rejectUnauthorized: false, timeout: 1000 }, response => { response.resume(); resolve(response.statusCode === 200); });
    request.on('error', () => resolve(false)); request.on('timeout', () => { request.destroy(); resolve(false); });
  });
  let ready = false;
  for (let i = 0; i < 60 && child.exitCode === null; i++) { if (logs.includes('Local synthetic upload ready:') && await probe()) { ready = true; break; } await delay(500); }
  if (!ready) { await stop(); console.log(redact(logs)); throw Error('local_server_start_failed'); }
  console.log(redact(logs)); logs = '';
  if (mode === '--serve') {
    console.log('Keep this terminal open. Stop with Ctrl-C after the human test.');
    process.exitCode = (await closed) ?? 1;
  } else {
    const test = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '-c', 'tests/e2e/upload/live.playwright.config.ts'], { env: baseEnvironment, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    for (const stream of [test.stdout, test.stderr]) stream.on('data', bytes => { if (output.length < 1000000) output += bytes.toString(); });
    const code = await new Promise(resolve => test.once('exit', resolve));
    console.log(redact(output)); await stop(); process.exitCode = code ?? 1;
  }
} catch {
  if (child && child.exitCode === null) child.kill('SIGTERM');
  console.log('BLOCKED: local synthetic configuration/runtime unavailable. No credentials printed.'); process.exitCode = 1;
}
