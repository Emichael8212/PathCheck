// Private synthetic acceptance server: real Google and local SQL, no real documents.
// This is NOT a public endpoint or production bot-attestation implementation.
import { readFile, mkdir, chmod, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createLiveFixture } from './liveFixture.mjs';
import { createLiveBudget } from './liveBudget.mjs';
import { guardLiveEgress } from './liveEgress.mjs';
import { atomicJson } from '../transcript-benchmark/checkpoint.mjs';

const origin = 'https://127.0.0.1:5185';
if (process.env.PATHCHECK_LIVE_SYNTHETIC !== '1' || process.env.PATHCHECK_GEMINI_FREE_TIER_CONFIRMED !== '1'
  || process.env.PATHCHECK_GEMINI_MODEL !== 'gemini-3.5-flash-lite' || !process.env.GEMINI_API_KEY
  || process.env.PATHCHECK_LOCAL_API_URL !== 'http://127.0.0.1:55431' || !process.env.PATHCHECK_LOCAL_ROLE_KEY) throw Error('private_synthetic_configuration_required');
const budget = await createLiveBudget({ apiKey: process.env.GEMINI_API_KEY });
let handler, server, stopping = false, extractBusy = false;
async function stop(code = 0) {
  if (stopping) return; stopping = true;
  try { await server?.close(); } finally { await budget.close(); process.exit(code); }
}
process.once('SIGINT', () => { void stop(); }); process.once('SIGTERM', () => { void stop(); });
process.once('uncaughtException', () => { console.error('Local synthetic runtime failed; processing stopped.'); void stop(1); });
process.once('unhandledRejection', () => { console.error('Local synthetic runtime failed; processing stopped.'); void stop(1); });
const fixture = await createLiveFixture();
const privateRoot = '/private/tmp/pathcheck-live-upload';
await mkdir(privateRoot, { recursive: true, mode: 0o700 });
await writeFile(`${privateRoot}/${fixture.fixtureId}.pdf`, fixture.bytes, { mode: 0o600 });
const cert = '/private/tmp/pathcheck-upload-tls';
await mkdir(cert, { recursive: true, mode: 0o700 });
try { await readFile(`${cert}/cert.pem`); await readFile(`${cert}/key.pem`); }
catch { execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${cert}/key.pem`, '-out', `${cert}/cert.pem`, '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'], { stdio: 'ignore' }); }
await chmod(`${cert}/key.pem`, 0o600);
const report = { fixtureId: fixture.fixtureId, fixtureDigest: fixture.digest, liveGoogle: true, liveDatabase: true,
  model: 'gemini-3.5-flash-lite', botMode: 'local_one_use_capability_not_public_attestation', startedAt: new Date().toISOString(),
  evidenceWriteFailed: false, quotaReservations: 0, providerAttempts: [], rpc: { issue: 0, admit: 0, dispatch: 0, retry: 0, finish: 0, revoke: 0 } };
const reportPath = `${privateRoot}/run-${Date.now()}.json`;
const attestationTokens = new Map();
const issuanceTimes = [];
const localPeer = req => ['127.0.0.1', '::ffff:127.0.0.1', '::1'].includes(req.socket.remoteAddress);
const trustedHost = req => req.headers[':authority'] === '127.0.0.1:5185' || req.headers.host === '127.0.0.1:5185';
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
const deny = res => json(res, 403, { ok: false, code: 'forbidden', reasonCode: 'local_synthetic_only' });
server = await createServer({ configFile: false, logLevel: 'silent', plugins: [react(), { name: 'private-live-synthetic', configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (!localPeer(req) || !trustedHost(req)) return deny(res);
    const path = req.url?.split('?')[0];
    let decoded;
    try { decoded = decodeURIComponent(path ?? ''); } catch { return deny(res); }
    if (decoded.startsWith('/@fs/') || decoded.includes('/supabase/functions/') || /\.(pem|crt)$/.test(decoded)
      || decoded.split('/').some(part => part === '.git' || part === '.env' || part.startsWith('.env.'))) return deny(res);
    if (path?.startsWith('/__live/')) {
      if (path === '/__live/attestation') {
        if (req.method !== 'POST' || req.headers.origin !== origin || req.headers['sec-fetch-site'] !== 'same-origin') return deny(res);
        const time = Date.now();
        for (const [token, expiry] of attestationTokens) if (expiry <= time) attestationTokens.delete(token);
        while (issuanceTimes.length && issuanceTimes[0] <= time - 60000) issuanceTimes.shift();
        if (issuanceTimes.length >= 3 || attestationTokens.size >= 10) return json(res, 429, { ok: false, code: 'rate_limited', reasonCode: 'local_capability_limit' });
        const token = randomBytes(32).toString('base64url');
        attestationTokens.set(token, time + 60000); issuanceTimes.push(time);
        return json(res, 200, { ok: true, value: token });
      }
      if (req.method !== 'GET') return deny(res);
      if (path === '/__live/fixture.pdf') {
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fixture.fixtureId}.pdf"`, 'Cache-Control': 'no-store' }); res.end(fixture.bytes); return;
      }
      if (path === '/__live/evidence') return json(res, 200, report);
      return deny(res);
    }
    if (!path?.startsWith('/api/transcript/')) return next();
    const extraction = path === '/api/transcript/extract';
    if (extraction && extractBusy) return json(res, 429, { ok: false, code: 'rate_limited', reasonCode: 'local_extraction_busy' });
    if (extraction) extractBusy = true;
    const abort = new AbortController();
    req.on('aborted', () => abort.abort());
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });
    try {
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([name]) => !name.startsWith(':')));
      const request = new Request(new URL(req.url, origin), { method: req.method, headers, signal: abort.signal,
        ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: Readable.toWeb(req), duplex: 'half' } : {}) });
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
      await atomicJson(reportPath, report);
    } catch { if (!res.headersSent) json(res, 503, { ok: false, code: 'unavailable', reasonCode: 'local_runtime_unavailable' }); else res.end(); }
    finally { if (extraction) extractBusy = false; }
  });
} }], server: { host: '127.0.0.1', port: 5185, strictPort: true,
  https: { cert: await readFile(`${cert}/cert.pem`), key: await readFile(`${cert}/key.pem`) },
  fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/supabase/functions/**'] } } });
const { createLocalSyntheticTranscriptRuntime } = await server.ssrLoadModule('/tests/fixtures/transcripts/localRuntime.ts');
const { createAdmissionRpc, createTranscriptAdmissionStore } = await server.ssrLoadModule('/supabase/functions/_shared/transcriptAdmission.ts');
const rpc = createAdmissionRpc({ url: process.env.PATHCHECK_LOCAL_API_URL, serviceRoleKey: process.env.PATHCHECK_LOCAL_ROLE_KEY });
const networkKey = randomBytes(32).toString('base64url');
const store = createTranscriptAdmissionStore({ networkKeys: async () => [networkKey], rpc: async (name, args) => {
  const metric = name === 'admission_retry_check' ? 'retry' : name.slice('admission_'.length);
  if (metric in report.rpc) report.rpc[metric]++;
  return rpc(name, args);
} });
handler = createLocalSyntheticTranscriptRuntime({ allowedOrigin: origin, disclosureVersion: 'local-synthetic-free-v1',
  sessionSecret: randomBytes(32).toString('hex'), signingSecret: randomBytes(32).toString('hex'),
  apiKey: process.env.GEMINI_API_KEY, modelId: 'gemini-3.5-flash-lite', freeTierConfirmed: true,
  expiresAt: new Date(Date.now() + 3500000).toISOString(), fixtureDigests: [fixture.digest],
  accounting: { dailyLimitUnits: 100, perRequestUnits: 1 }, store,
  bot: { verify: async token => { const expiry = attestationTokens.get(token); attestationTokens.delete(token); return expiry !== undefined && expiry > Date.now(); } },
  resolveNetwork: async () => networkKey, authorizeRetry: input => store.authorizeRetry(input),
  authorizeAttempt: async tokens => {
    const reserved = await budget.authorizeAttempt(tokens);
    if (!reserved.ok) return reserved;
    report.quotaReservations++;
    try { await atomicJson(reportPath, report); }
    catch { report.evidenceWriteFailed = true; return { ok: false, code: 'unavailable', reasonCode: 'local_evidence_unavailable' }; }
    return reserved;
  },
  send: async (url, init) => {
    const guarded = guardLiveEgress(url, init, fixture.digest);
    if (report.evidenceWriteFailed) throw Error('evidence_unavailable');
    const event = { attempt: report.providerAttempts.length + 1, status: null, elapsedMs: null };
    // No await between G's final consent/lease check and fetch. Reservation
    // evidence was persisted above, BEFORE that final authorization.
    report.providerAttempts.push(event);
    const started = Date.now();
    try { const response = await fetch(url, guarded); event.status = response.status; return response; }
    finally {
      event.elapsedMs = Date.now() - started;
      try { await atomicJson(reportPath, report); } catch { report.evidenceWriteFailed = true; }
    }
  },
});
await server.listen();
await atomicJson(reportPath, report);
console.log(`Local synthetic upload ready: ${origin}/tests/e2e/upload/live.html`);
console.log(`Only generated fixture accepted: ${privateRoot}/${fixture.fixtureId}.pdf`);
console.log('Real Gemini 3.5 Flash-Lite / local SQL; free synthetic only. No public bot or real-data approval.');
