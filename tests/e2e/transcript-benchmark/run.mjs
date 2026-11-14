// Lead-owned, local-only integration benchmark. No HTTP listener or arbitrary-file upload.
// Calls Google directly for measured raw extraction, then actual G validation + E normalization.
// Does not certify the production provider/guest admission pipeline.
import { readFile, open, unlink, mkdir, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'vite';
import { z } from 'zod';
import { scoreRows } from './score.mjs';
import { exactCaseSet, eligibleComparison, assessCase } from './evidence.mjs';
import { providerErrorSummary, readBoundedJson } from './providerErrors.mjs';
import { toProviderWireSchema } from './wireSchema.mjs';
import { with503Retries, quotaWaitMs, RETRY_POLICY } from './retry.mjs';
import { sourceFingerprints, resumeCheckpoint, atomicJson, historicalEvidence } from './checkpoint.mjs';

const root = '/private/tmp/pathcheck-gemini-benchmark-v1';
const live = process.argv.includes('--live');
const compare = process.argv.includes('--compare');
const accessOnly = process.argv.includes('--access-only');
const model = compare ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite';
const modelLimits = compare ? { rpm: 5, tpm: 250000, rpd: 20 } : { rpm: 15, tpm: 250000, rpd: 500 };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { model, modelLimits, quotaEvidence: 'user-verified AI Studio 2026-11-13; shared project usage unknown',
  status: 'NOT RUN', apiAccess: 'NOT RUN', syntheticOnly: true, productionPipelineTest: false, accessOnly, cases: [],
  reportVersion: 2, retryPolicy: RETRY_POLICY, transportAttempts: [], historicalFailures: [], historicalReports: [] };
const cancellation = new AbortController();
process.once('SIGINT', () => cancellation.abort());
process.once('SIGTERM', () => cancellation.abort());
const runId = randomUUID();
let operationSequence = 0;
let checkpointReady = false;
async function checkpoint() {
  if (live && !accessOnly && lock && checkpointReady) await atomicJson(`${root}/${model}-resume.json`, report);
}
let server;
let lock;
let key;
let usagePath;
let daily;
const secretSafeError = reason => Object.assign(new Error(reason), { safeReason: reason });
async function reserveAttempt({ deadline, signal }) {
  const currentDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  if (daily.day !== currentDay) daily = { ...daily, day: currentDay, calls: 0 };
  if (daily.calls >= modelLimits.rpd) throw secretSafeError('local_daily_call_budget_exhausted');
  const waitMs = Math.max(quotaWaitMs(daily, Date.now(), modelLimits, compare ? 14000 : 6000),
    (daily.legacyCooldownUntil || 0) - Date.now());
  if (Date.now() + waitMs >= deadline) throw secretSafeError('temporary_unavailable_retry_budget_exhausted');
  await delay(Math.max(0, waitMs), undefined, { signal });
  if (signal.aborted) throw secretSafeError('cancelled');
  const dispatchDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  if (daily.day !== dispatchDay) daily = { ...daily, day: dispatchDay, calls: 0 };
  daily.calls++;
  daily.lastRequestAt = Date.now();
  daily.recentAttempts = (daily.recentAttempts || []).filter(a => a.at > Date.now() - 60000);
  daily.recentAttempts.push({ at: daily.lastRequestAt, tokens: 24576 });
  // Persist quota before dispatch; unknown outcomes remain charged conservatively.
  await atomicJson(usagePath, daily);
}
async function request(suffix, body) {
  const operationId = `${runId}:${++operationSequence}`;
  try {
    const result = await with503Retries({ signal: cancellation.signal, reserve: reserveAttempt,
      record: async event => {
        const evidence = { ...event, id: `${operationId}:${event.attempt}`, operation: suffix || 'model_metadata',
          fixtureId: report.activeFixtureId || null, executionHash: report.executionHash };
        const index = report.transportAttempts.findIndex(item => item.id === evidence.id);
        if (index >= 0) report.transportAttempts[index] = evidence;
        else {
          if (report.transportAttempts.length >= 10000) throw secretSafeError('attempt_evidence_capacity_exceeded');
          report.transportAttempts.push(evidence);
        }
        await checkpoint();
      },
      perform: async signal => {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}${suffix}`, {
          method: body ? 'POST' : 'GET', headers: { 'x-goog-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal,
        });
        const value = await readBoundedJson(response).catch(error => {
          if (response.ok) throw error;
          return null; // HTTP status remains evidence even for bounded malformed error bodies.
        });
        return { status: response.status, value: response.ok ? value : null,
          retryAfter: response.headers.get('retry-after'), ...(response.ok ? {} : { providerError: providerErrorSummary(value) }) };
      },
    });
    return result.value;
  } catch (error) {
    report.failedOperation = suffix || 'model_metadata';
    throw error;
  }
}

try {
  if (process.argv.some(arg => arg.startsWith('--') && !['--live', '--compare', '--access-only'].includes(arg))) throw secretSafeError('unknown_argument');
  if (!compare && process.env.PATHCHECK_GEMINI_MODEL && process.env.PATHCHECK_GEMINI_MODEL !== model) throw secretSafeError('unapproved_primary_model');
  await mkdir(root, { recursive: true, mode: 0o700 });
  lock = await open(`${root}/run.lock`, 'wx', 0o600);
  execFileSync(process.env.PATHCHECK_PDF_PYTHON || '/private/tmp/pathcheck-pdf-benchmark-tools/bin/python',
    ['tests/e2e/transcript-benchmark/generate.py'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const manifestBytes = await readFile(`${root}/manifest.json`);
  const manifest = JSON.parse(manifestBytes);
  if (manifest.syntheticOnly !== true || manifest.cases.length !== 18) throw secretSafeError('invalid_generated_corpus');
  report.corpusHash = hash(manifestBytes);
  const fingerprints = await sourceFingerprints();
  report.executionHash = fingerprints.executionHash;
  report.extractionHash = fingerprints.extractionHash;
  const expected = { model, corpusHash: report.corpusHash, executionHash: report.executionHash, fixtures: manifest.cases };
  if (live) {
    key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) throw secretSafeError('server_api_key_unavailable');
    if (process.env.PATHCHECK_GEMINI_FREE_TIER_CONFIRMED !== '1') throw secretSafeError('free_project_confirmation_required');
    if (compare) {
      const primary = JSON.parse(await readFile(`${root}/gemini-3.5-flash-lite-report.json`));
      if (!eligibleComparison(primary, expected)) throw secretSafeError('comparison_requires_completed_primary_quality_failure_same_execution');
    }
    try {
      const previous = JSON.parse(await readFile(`${root}/${model}-resume.json`));
      if (!accessOnly) {
        const resumed = resumeCheckpoint(previous, expected, fingerprints);
        report.cases = resumed.cases;
        report.resumeProof = resumed.proof;
        report.transportAttempts = previous.transportAttempts || [];
        report.historicalFailures = previous.historicalFailures || [];
        report.historicalReports = previous.historicalReports || [];
      }
      report.resumedCases = report.cases.length;
    } catch (error) { if (error.code !== 'ENOENT') throw secretSafeError(error.safeReason || 'invalid_resume_report'); }
    if (!accessOnly && !report.historicalReports.length) {
      const historical = await historicalEvidence(root, model, { ...manifest, hash: report.corpusHash });
      report.historicalReports = historical.reports;
      report.historicalFailures = historical.failures;
    }
    checkpointReady = true;
    report.status = 'RUNNING';
    await checkpoint();
    // Local conservative cap counts metadata/countTokens too. No assertion about other project clients.
    usagePath = `${root}/usage-${hash(key).slice(0, 24)}-${model}.json`;
    try { daily = JSON.parse(await readFile(usagePath)); }
    catch (error) { if (error.code !== 'ENOENT') throw secretSafeError('invalid_usage_ledger'); daily = { day: '', calls: 0 }; }
    if (!Number.isSafeInteger(daily.calls) || daily.calls < 0 || (daily.lastRequestAt !== undefined && !Number.isFinite(daily.lastRequestAt))
      || (daily.recentAttempts !== undefined && (!Array.isArray(daily.recentAttempts) || daily.recentAttempts.some(a => !Number.isFinite(a.at) || a.tokens !== 24576)))) throw secretSafeError('invalid_usage_ledger');
    if (!daily.recentAttempts) {
      // Legacy ledger had only daily counts; wait out its last-write minute before
      // beginning a fresh rolling window, rather than inventing past token usage.
      daily.legacyCooldownUntil = (await stat(usagePath).catch(() => ({ mtimeMs: 0 }))).mtimeMs + 60000;
      daily.recentAttempts = [];
    }
    const info = await request('');
    if (info.name !== `models/${model}` || !info.supportedGenerationMethods?.includes('generateContent')) throw secretSafeError('model_generation_not_accessible');
    report.apiAccess = 'METADATA ONLY; generation pending';
  }
  server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom' });
  const { ProposedRowSchema, TranscriptExtractionSchema } = await server.ssrLoadModule('/src/contracts/index.ts');
  const { createPdfInspector } = await server.ssrLoadModule('/supabase/functions/extract-transcript/pdf.ts');
  const { EXTRACTION_PROMPT } = await server.ssrLoadModule('/supabase/functions/extract-transcript/provider.ts');
  const { validateExtraction } = await server.ssrLoadModule('/src/transcript/validation.ts');
  const { academicService } = await server.ssrLoadModule('/src/engine/index.ts');
  const { normalizeExtraction } = await server.ssrLoadModule('/src/app/normalizeExtraction.ts');
  const { syntheticScenario } = await server.ssrLoadModule('/src/contracts/synthetic.test-fixtures.ts');
  // Mirror the provider's wire shape; raw-row authority is the frozen shared schema.
  const shape = z.strictObject({ documentPageCount: z.number().int().min(1).max(20),
    detectedRowCount: z.number().int().min(0).max(1000).nullable(), rows: z.array(ProposedRowSchema).max(1000),
    coveredPages: z.array(z.number().int().min(1).max(20)).max(20), unrecognizedRows: z.array(z.string().min(1).max(160)).max(1000) });
  const wireSchema = toProviderWireSchema(z.toJSONSchema(shape));
  const activeFixtures = accessOnly ? manifest.cases.slice(0, 1) : manifest.cases;
  for (const fixture of activeFixtures) {
    if (report.cases.some(c => c.id === fixture.id)) continue;
    if (cancellation.signal.aborted) throw secretSafeError('cancelled');
    report.activeFixtureId = fixture.id;
    if (!/^\d{2}-[a-z-]+\.pdf$/.test(fixture.file)) throw secretSafeError('invalid_fixture_path');
    const bytes = await readFile(`${root}/${fixture.file}`);
    if (hash(bytes) !== fixture.sha256) throw secretSafeError('fixture_hash_changed');
    const inspected = await createPdfInspector().inspect(bytes);
    if (fixture.expected === 'reject_pdf' || !inspected.ok) {
      const pass = fixture.expected === 'reject_pdf' && !inspected.ok;
      report.cases.push({ id: fixture.id, fixtureHash: fixture.sha256, status: pass ? 'PASS' : 'FAIL', stage: 'actual_pdf_inspector', noProviderCall: true });
      bytes.fill(0); await checkpoint(); continue;
    }
    if (!live) {
      report.cases.push({ id: fixture.id, status: 'NOT RUN', preflight: inspected.value.pageCount === fixture.pages ? 'PASS' : 'FAIL' });
      bytes.fill(0); await checkpoint(); continue;
    }
    const started = Date.now();
    const contents = [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: bytes.toString('base64') } }] }];
    const generation = { systemInstruction: { parts: [{ text: EXTRACTION_PROMPT }] }, contents,
      generationConfig: { candidateCount: 1, maxOutputTokens: 8192, responseMimeType: 'application/json', responseJsonSchema: wireSchema } };
    bytes.fill(0);
    const tokenCount = await request(':countTokens', { generateContentRequest: { model: `models/${model}`, ...generation } });
    if (!Number.isSafeInteger(tokenCount.totalTokens) || tokenCount.totalTokens > 16384) throw secretSafeError('fixture_input_token_budget_exceeded');
    const envelope = await request(':generateContent', generation);
    report.apiAccess = 'PASS: actual generateContent response';
    const item = { id: fixture.id, fixtureHash: fixture.sha256, status: 'FAIL', stage: 'model_quality', actualGeneration: true,
      measuredAt: new Date().toISOString(), latencyMs: Date.now() - started,
      inputTokens: envelope.usageMetadata?.promptTokenCount ?? null,
      outputTokens: envelope.usageMetadata?.candidatesTokenCount ?? null,
      thinkingTokens: envelope.usageMetadata?.thoughtsTokenCount ?? null };
    try {
      if (envelope.candidates?.length !== 1 || envelope.candidates[0].finishReason !== 'STOP') throw secretSafeError('unfinished_output');
      if (![item.inputTokens, item.outputTokens, item.thinkingTokens ?? 0].every(t => Number.isSafeInteger(t) && t >= 0)
        || item.inputTokens > 16384 || item.outputTokens + (item.thinkingTokens ?? 0) > 8192) throw secretSafeError('provider_usage_outside_bound');
      const raw = shape.parse(JSON.parse(envelope.candidates[0].content.parts.filter(p => !p.thought).map(p => p.text).join('')));
      const extraction = TranscriptExtractionSchema.parse({ ...raw, schemaVersion: 1, extractionSchemaVersion: 1,
        modelId: model, warnings: [], completeness: 'unknown', acceptanceStatus: raw.rows.length ? 'needs_review' : 'rejected' });
      const score = scoreRows(fixture.rows, raw.rows);
      const coverage = raw.documentPageCount === fixture.pages && new Set(raw.coveredPages).size === fixture.pages
        && raw.detectedRowCount === fixture.rows.length && raw.unrecognizedRows.length === 0;
      assessCase(item, score, coverage, () => {
        const validated = validateExtraction(extraction, syntheticScenario().catalog);
        if (fixture.expected === 'reject_empty') return !validated.ok && raw.rows.length === 0;
        if (!validated.ok) return false;
        const normalized = normalizeExtraction(validated.value, syntheticScenario().catalog, academicService);
        return normalized.ok && normalized.value.requiresExplicitRecordAcceptance === true
          && normalized.value.extractionReviewStatus === 'needs_review' && normalized.value.record.courseAttempts.length === raw.rows.length;
      });
    } catch { item.reason = 'schema_coverage_or_normalization_failure'; }
    item.measuredExecutionHash = report.executionHash;
    item.transportRetries = report.transportAttempts.filter(a => a.fixtureId === fixture.id && a.attempt > 1).length;
    report.cases.push(item);
    await checkpoint();
    console.log(JSON.stringify(item)); // Counts only: no extracted text, secrets or document contents.
  }
  delete report.activeFixtureId;
  report.status = !exactCaseSet(report.cases, activeFixtures) ? 'BLOCKED'
    : report.cases.some(c => c.status === 'FAIL' || c.preflight === 'FAIL') ? 'FAIL' : live ? 'PASS' : 'NOT RUN';
} catch (error) {
  report.status = 'BLOCKED';
  report.reason = error.safeReason || 'dependency_transport_or_configuration_failure';
} finally {
  await server?.close();
  const output = `${root}/${model}-${live ? `attempt-${Date.now()}` : 'preflight'}.json`;
  await atomicJson(output, report);
  if (live && !accessOnly && lock && checkpointReady) {
    await checkpoint();
    if (report.cases.length === 18 && ['PASS', 'FAIL'].includes(report.status)) {
      await atomicJson(`${root}/${model}-report.json`, report);
    }
  }
  if (lock) { await lock.close(); await unlink(`${root}/run.lock`); }
  console.log(JSON.stringify({ status: report.status, apiAccess: report.apiAccess, cases: report.cases.length, reason: report.reason ?? null, report: output }));
  process.exitCode = report.status === 'PASS' || (!live && report.status === 'NOT RUN') ? 0 : 1;
}
