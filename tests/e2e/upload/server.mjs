// Test-only HTTPS composition. Real browser/handler/G validator/E engine + local
// SQL admission. Google and bot transport are explicitly simulated, never live.
import { readFile, mkdir, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { PDFDocument, StandardFonts } from 'pdf-lib';
if (process.env.PATHCHECK_UPLOAD_TEST !== '1' || process.env.PATHCHECK_LOCAL_API_URL !== 'http://127.0.0.1:55431' || !process.env.PATHCHECK_LOCAL_ROLE_KEY) throw Error('isolated_test_environment_required');
const origin = 'https://127.0.0.1:5184';
const cert = '/private/tmp/pathcheck-upload-tls';
await mkdir(cert, { recursive: true, mode: 0o700 });
try { await readFile(`${cert}/cert.pem`); await readFile(`${cert}/key.pem`); }
catch { execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${cert}/key.pem`, '-out', `${cert}/cert.pem`, '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'], { stdio: 'ignore' }); }
await chmod(`${cert}/key.pem`, 0o600);
const pdf = await PDFDocument.create({ updateMetadata: false });
pdf.setCreationDate(new Date('2026-01-01T00:00:00Z')); pdf.setModificationDate(new Date('2026-01-01T00:00:00Z'));
const font = await pdf.embedFont(StandardFonts.Helvetica);
const page = pdf.addPage([612, 792]);
page.drawText('SYNTHETIC INTEGRATION FIXTURE - NOT A STUDENT TRANSCRIPT', { x: 30, y: 740, font, size: 10 });
page.drawText('SYN 101 | Fall 2026 | attempted 3 | earned 3 | B | completed', { x: 30, y: 710, font, size: 10 });
const pdfBytes = await pdf.save({ useObjectStreams: false });
let handler;
let metrics;
let mode = 'success';
let server;
async function reset(nextMode) {
  mode = nextMode;
  metrics = { providerCalls: 0, issue: 0, admit: 0, dispatch: 0, retry: 0, finish: 0, revoke: 0, simulatedProvider: true, liveDatabase: true };
  const { createTranscriptHandler } = await server.ssrLoadModule('/supabase/functions/extract-transcript/handler.ts');
  const { createGuestAdmission } = await server.ssrLoadModule('/supabase/functions/extract-transcript/admission.ts');
  const { createGeminiProvider, maximumCost } = await server.ssrLoadModule('/supabase/functions/extract-transcript/provider.ts');
  const { createAdmissionRpc, createTranscriptAdmissionStore } = await server.ssrLoadModule('/supabase/functions/_shared/transcriptAdmission.ts');
  const rpc = createAdmissionRpc({ url: process.env.PATHCHECK_LOCAL_API_URL, serviceRoleKey: process.env.PATHCHECK_LOCAL_ROLE_KEY });
  const key = randomBytes(32).toString('base64url');
  const store = createTranscriptAdmissionStore({ rpc: async (name, args) => {
    const metric = name === 'admission_retry_check' ? 'retry' : name.slice('admission_'.length);
    if (metric in metrics) metrics[metric]++;
    return rpc(name, args);
  }, networkKeys: async () => [key] });
  const secret = randomBytes(32).toString('hex');
  const admission = createGuestAdmission({ store, bot: { verify: async token => /^synthetic-browser-[a-f0-9-]{36}$/.test(token) }, signingSecret: secret, allowedOrigin: origin, disclosureVersion: 'synthetic-transport-test-v1' });
  const policy = { apiKey: 'synthetic-no-network-key', modelId: 'gemini-3.5-flash-lite', maxInputTokens: 16384, maxOutputTokens: 8192,
    inputMicrousdPerMillionTokens: 100, outputMicrousdPerMillionTokens: 100,
    retry: { maxAttempts: 3, maxElapsedMs: 30000, baseDelayMs: 6000 } };
  const provider = createGeminiProvider(policy, async () => {
    metrics.providerCalls++;
    if (mode === 'unavailable' || (mode === 'retry' && metrics.providerCalls < 3)) return new Response('{}', { status: 503 });
    const rows = mode === 'malformed' ? [{ invalid: true }] : [{ rowId: 'synthetic-1', rawCourseCode: 'SYN 101', rawTitle: 'Synthetic SYN-101', rawTerm: 'Fall 2026', rawAttemptedCredits: '3', rawEarnedCredits: '3', rawGrade: 'B', rawStatus: 'completed', rawInstitution: null, provisionalCourseId: null,
      provenance: [{ field: 'code', page: 1, row: 1, quote: null }], uncertainty: [] }];
    const raw = { documentPageCount: 1, detectedRowCount: 1, coveredPages: [1], unrecognizedRows: [], rows };
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(raw) }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200 } });
  });
  // This paid-eligibility fixture is ONLY for simulated provider transport. No
  // Google request can occur: injected send above never calls fetch.
  const eligibility = { status: 'approved', reviewId: 'synthetic-test-only', termsVersion: 'synthetic-test-only', paidProjectId: 'simulated-no-paid-project', approvedUntil: new Date(Date.now() + 3600000).toISOString(), dailyCostCeilingMicrousd: 1000000, perRequestReservationMicrousd: 100 };
  handler = createTranscriptHandler({ allowedOrigin: origin, disclosureVersion: 'synthetic-transport-test-v1', sessionSecret: secret,
    eligibility: () => eligibility, maximumProviderCostMicrousd: maximumCost(policy), admission, store, provider,
    resolveNetwork: async () => key, authorizeRetry: input => store.authorizeRetry(input) });
}
server = await createServer({ configFile: false, plugins: [react(), { name: 'isolated-upload-test', configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    const path = req.url?.split('?')[0];
    if (path === '/__test/fixture.pdf') { res.writeHead(200, { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' }); res.end(pdfBytes); return; }
    if (path === '/__test/metrics') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(metrics)); return; }
    if (path === '/__test/reset' && req.method === 'POST') {
      const selected = new URL(req.url, origin).searchParams.get('mode');
      if (!['success', 'retry', 'unavailable', 'malformed'].includes(selected)) { res.writeHead(400); res.end(); return; }
      await reset(selected); res.writeHead(204); res.end(); return;
    }
    if (!path?.startsWith('/api/transcript/')) return next();
    const abort = new AbortController();
    req.on('aborted', () => abort.abort());
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });
    try {
      // Vite's HTTPS server may speak HTTP/2; pseudo-headers are transport metadata,
      // not Fetch Headers. Preserve actual Origin/Cookie/ticket headers unchanged.
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([name]) => !name.startsWith(':')));
      const request = new Request(new URL(req.url, origin), { method: req.method, headers, signal: abort.signal,
        ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: Readable.toWeb(req), duplex: 'half' } : {}) });
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"ok":false,"code":"unavailable","reasonCode":"test_transport_unavailable"}'); }
  });
} }], server: { host: '127.0.0.1', port: 5184, strictPort: true, https: { cert: await readFile(`${cert}/cert.pem`), key: await readFile(`${cert}/key.pem`) } } });
await reset('success');
await server.listen();
console.log('Synthetic upload integration HTTPS ready; Google/bot simulated; database local.');
