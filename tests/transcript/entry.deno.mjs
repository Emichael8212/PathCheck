// Real local Deno listener/module-resolution check. No service credentials,
// .env access, external network, SQL, Google or hosted-isolation claim.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildFunctionEntry } from '../../supabase/functions/extract-transcript/build-entry.mjs';

const executable = process.argv[2];
if (!executable || process.argv.length !== 3) throw new Error('usage: node tests/transcript/entry.deno.mjs /absolute/path/to/deno');
const folder = await mkdtemp(join(tmpdir(), 'pathcheck-deno-entry-'));
try {
  for (const configured of [false, true]) {
    const fixture = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/transcripts/entryBindings.ts');
    const artifact = await buildFunctionEntry(undefined, configured ? fixture : undefined);
    assert.equal(artifact.code.includes('sourceMappingURL='), false);
    const modulePath = join(folder, configured ? 'synthetic.mjs' : 'default.mjs');
    await writeFile(modulePath, artifact.code, { mode: 0o600 });
    const runner = join(folder, 'run.mjs');
    await writeFile(runner, `
const nativeServe = Deno.serve.bind(Deno);
let server;
// Only the listener address is adapted: the bundled index, options, handler,
// crypto, signatures, admission and HTTP requests are actual implementations.
Deno.serve = (options, handler) => {
  server = nativeServe({ ...options, hostname: '127.0.0.1', port: 0, onListen() {} }, handler);
  return server;
};
function check(value, reason) { if (!value) throw new Error(reason); }
const runtimeGlobals = { window: typeof window, document: typeof document };
await import(${JSON.stringify(pathToFileURL(modulePath).href)});
let checks = 0;
try {
  const base = 'http://127.0.0.1:' + server.addr.port;
  const available = await fetch(base + '/availability');
  const status = await available.json();
  check(available.headers.get('cache-control') === 'no-store', 'cache'); checks++;
  if (${configured}) {
    check(status.ok && status.value.status === 'approved', 'synthetic_fixture_unavailable'); checks++;
    const headers = { origin: 'https://synthetic.pathcheck.test', 'content-type': 'application/json' };
    const denied = await fetch(base + '/session', { method: 'POST', headers, body: '{}' });
    check(denied.status === 403 && !denied.headers.has('set-cookie'), 'untrusted_ingress_admitted');
    check((await denied.json()).reasonCode === 'trusted_network_identity_required', 'network_denial'); checks++;
    headers['x-synthetic-test-proof'] = 'synthetic';
    const session = await fetch(base + '/session', { method: 'POST', headers, body: '{}' });
    await session.body.cancel();
    const cookie = session.headers.get('set-cookie');
    check(session.status === 200 && cookie?.includes('; Secure; HttpOnly; SameSite=Strict'), 'signed_session_missing'); checks++;
    const ticket = await fetch(base + '/ticket', { method: 'POST', headers: { ...headers, cookie: cookie.split(';')[0] },
      body: JSON.stringify({ botAttestation: 'synthetic-rejected', documentDigest: 'a'.repeat(64), disclosureVersion: 'v1', explicitConsent: true }) });
    check(ticket.status === 403 && !(await ticket.json()).ok, 'bot_denial'); checks++;
  } else {
    check(available.status === 503 && status.reasonCode === 'server_runtime_configuration_required', 'default_not_disabled'); checks++;
    const denied = await fetch(base + '/extract', { method: 'POST', body: '%PDF-synthetic-not-processed' });
    check(denied.status === 503 && !denied.headers.has('set-cookie'), 'default_extract_enabled');
    await denied.body.cancel(); checks++;
  }
  check((await Deno.permissions.query({ name: 'env' })).state === 'denied', 'env_permission'); checks++;
  check((await Deno.permissions.query({ name: 'net', host: 'generativelanguage.googleapis.com:443' })).state === 'denied', 'external_network_permission'); checks++;
  console.log(JSON.stringify({ status: 'PASS', checks, runtimeGlobals }));
} finally { await server.shutdown(); }
`, { mode: 0o600 });
    const output = execFileSync(resolve(executable), ['run', '--no-config', '--no-lock', '--no-npm', '--no-remote', '--no-prompt',
      '--deny-env', '--deny-write', '--deny-run', '--deny-ffi', '--deny-sys', '--allow-net=127.0.0.1',
      '--deny-net=generativelanguage.googleapis.com,challenges.cloudflare.com', `--allow-read=${folder}`, runner],
    { encoding: 'utf8', timeout: 20_000, maxBuffer: 8192, env: { DENO_DIR: join(folder, 'cache') } });
    const result = JSON.parse(output.trim());
    assert.equal(result.status, 'PASS');
    assert.equal(result.checks, configured ? 7 : 5);
    console.log(`${configured ? 'Synthetic binding' : 'Unconfigured default'} Deno HTTP: PASS (${result.checks} assertions); globals=${JSON.stringify(result.runtimeGlobals)}; bundle=${artifact.sha256}`);
  }
} finally { await rm(folder, { recursive: true, force: true }); }
