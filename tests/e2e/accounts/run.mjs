// Real local OTP/PostgREST browser tests. Only the public anon key reaches Vite.
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const mode = process.argv[2];
if (!['--test', '--serve'].includes(mode)) throw Error('use_--test_or_--serve');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  ['PATH', 'HOME', 'TMPDIR', 'USER', 'SHELL', 'LANG', 'CI', 'PLAYWRIGHT_BROWSERS_PATH'].includes(key)));
let child;
try {
  const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { env: { ...env, DOCKER_CONTEXT: 'colima-pathcheck-test' }, stdio: ['ignore', 'pipe', 'pipe'] }).toString());
  if (status.API_URL !== 'http://127.0.0.1:55431' || !status.ANON_KEY) throw Error('local_stack_required');
  const keys = Object.entries(status).filter(([k, v]) => /KEY|SECRET/.test(k) && typeof v === 'string').map(([, v]) => v);
  const redact = text => keys.reduce((s, key) => s.split(key).join('[REDACTED]'), text).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED JWT]');
  child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5188', '--strictPort'], {
    env: { ...env, VITE_SUPABASE_URL: status.API_URL, VITE_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { if (logs.length < 100000) logs += bytes.toString(); });
  const closed = new Promise(resolve => child.once('exit', resolve));
  async function stop() { if (child.exitCode === null) child.kill('SIGTERM'); await Promise.race([closed, delay(5000)]); if (child.exitCode === null) child.kill('SIGKILL'); }
  process.once('SIGINT', () => { void stop(); }); process.once('SIGTERM', () => { void stop(); });
  let ready = false;
  for (let n = 0; n < 60 && child.exitCode === null; n++) {
    if (logs.includes('http://127.0.0.1:5188/')) {
      try { if ((await fetch('http://127.0.0.1:5188/')).ok) { ready = true; break; } } catch { /* wait for listener */ }
    }
    await delay(250);
  }
  if (!ready) { await stop(); throw Error('local_preview_unavailable'); }
  console.log('Local account acceptance: http://127.0.0.1:5188/');
  console.log('Synthetic-only local inbox: http://127.0.0.1:55434/ — no real email delivery.');
  if (mode === '--serve') {
    console.log('Keep this terminal open; Ctrl-C stops the preview. No Gemini processing in this entry.');
    process.exitCode = (await closed) ?? 1;
  } else {
    const test = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '-c', 'tests/e2e/accounts/playwright.config.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    for (const stream of [test.stdout, test.stderr]) stream.on('data', b => { if (output.length < 1000000) output += b.toString(); });
    const code = await new Promise(resolve => test.once('exit', resolve));
    console.log(redact(output)); await stop(); process.exitCode = code ?? 1;
  }
} catch {
  if (child && child.exitCode === null) child.kill('SIGTERM');
  console.log('BLOCKED: local account test configuration/runtime unavailable; no credentials printed.'); process.exitCode = 1;
}
