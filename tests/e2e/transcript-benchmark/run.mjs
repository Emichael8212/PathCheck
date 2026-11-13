// Lead-owned, local-only integration benchmark. No HTTP listener or arbitrary-file upload.
// Calls Google directly for measured raw extraction, then actual G validation + E normalization.
// Does not certify the production provider/guest admission pipeline.
import { readFile, writeFile, open, unlink, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'vite';
import { z } from 'zod';
import { scoreRows } from './score.mjs';
import { reusableCases, exactCaseSet, eligibleComparison, assessCase } from './evidence.mjs';

const root = '/private/tmp/pathcheck-gemini-benchmark-v1';
const live = process.argv.includes('--live');
const compare = process.argv.includes('--compare');
const accessOnly = process.argv.includes('--access-only');
const model = compare ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite';
const modelLimits = compare ? { rpm: 5, tpm: 250000, rpd: 20 } : { rpm: 15, tpm: 250000, rpd: 500 };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { model, modelLimits, quotaEvidence: 'user-verified AI Studio 2026-11-13; shared project usage unknown',
  status: 'NOT RUN', apiAccess: 'NOT RUN', syntheticOnly: true, productionPipelineTest: false, accessOnly, cases: [] };
let server;
let lock;
let lastRequest = 0;
let key;
let usagePath;
let daily;
const secretSafeError = reason => Object.assign(new Error(reason), { safeReason: reason });
async function executionHash() {
  const paths = ['package-lock.json', 'src/app/normalizeExtraction.ts'];
  async function visit(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (item.isDirectory()) await visit(`${directory}/${item.name}`);
      else if (item.isFile() && /\.(ts|mjs|py)$/.test(item.name)) paths.push(`${directory}/${item.name}`);
    }
  }
  for (const directory of ['tests/e2e/transcript-benchmark', 'src/contracts', 'src/engine', 'src/catalog', 'src/transcript', 'supabase/functions/extract-transcript']) await visit(directory);
  const digest = createHash('sha256');
  for (const path of paths.sort()) digest.update(path).update(await readFile(path));
  return digest.digest('hex');
}

async function request(suffix, body) {
  // Pace ALL API calls, including metadata/countTokens, below the displayed RPM.
  await delay(Math.max(0, (compare ? 14000 : 6000) - (Date.now() - lastRequest)));
  const currentDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  if (daily.day !== currentDay) daily = { day: currentDay, calls: 0 };
  if (daily.calls >= modelLimits.rpd) throw secretSafeError('local_daily_call_budget_exhausted');
  daily.calls++;
  await writeFile(usagePath, JSON.stringify(daily), { mode: 0o600 });
  lastRequest = Date.now();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}${suffix}`, {
    method: body ? 'POST' : 'GET', headers: { 'x-goog-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.timeout(50000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw secretSafeError(response.status === 429 ? 'rate_limited_manual_entry_available_no_retry' : `provider_http_${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw secretSafeError('empty_provider_response');
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 2000000) { await reader.cancel(); throw secretSafeError('provider_response_size_limit'); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
  report.executionHash = await executionHash();
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
      report.cases = accessOnly ? [] : reusableCases(previous, expected);
      report.resumedCases = report.cases.length;
    } catch (error) { if (error.code !== 'ENOENT') throw secretSafeError('invalid_resume_report'); }
    // Local conservative cap counts metadata/countTokens too. No assertion about other project clients.
    usagePath = `${root}/usage-${hash(key).slice(0, 24)}-${model}.json`;
    try { daily = JSON.parse(await readFile(usagePath)); }
    catch (error) { if (error.code !== 'ENOENT') throw secretSafeError('invalid_usage_ledger'); daily = { day: '', calls: 0 }; }
    if (!Number.isSafeInteger(daily.calls) || daily.calls < 0) throw secretSafeError('invalid_usage_ledger');
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
  const activeFixtures = accessOnly ? manifest.cases.slice(0, 1) : manifest.cases;
  for (const fixture of activeFixtures) {
    if (report.cases.some(c => c.id === fixture.id)) continue;
    if (!/^\d{2}-[a-z-]+\.pdf$/.test(fixture.file)) throw secretSafeError('invalid_fixture_path');
    const bytes = await readFile(`${root}/${fixture.file}`);
    if (hash(bytes) !== fixture.sha256) throw secretSafeError('fixture_hash_changed');
    const inspected = await createPdfInspector().inspect(bytes);
    if (fixture.expected === 'reject_pdf' || !inspected.ok) {
      const pass = fixture.expected === 'reject_pdf' && !inspected.ok;
      report.cases.push({ id: fixture.id, fixtureHash: fixture.sha256, status: pass ? 'PASS' : 'FAIL', stage: 'actual_pdf_inspector', noProviderCall: true });
      bytes.fill(0); continue;
    }
    if (!live) {
      report.cases.push({ id: fixture.id, status: 'NOT RUN', preflight: inspected.value.pageCount === fixture.pages ? 'PASS' : 'FAIL' });
      bytes.fill(0); continue;
    }
    const started = Date.now();
    const contents = [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: bytes.toString('base64') } }] }];
    const generation = { model: `models/${model}`, systemInstruction: { parts: [{ text: EXTRACTION_PROMPT }] }, contents,
      generationConfig: { candidateCount: 1, maxOutputTokens: 8192, responseMimeType: 'application/json', responseJsonSchema: z.toJSONSchema(shape) } };
    bytes.fill(0);
    const tokenCount = await request(':countTokens', { generateContentRequest: generation });
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
    report.cases.push(item);
    console.log(JSON.stringify(item)); // Counts only: no extracted text, secrets or document contents.
  }
  report.status = !exactCaseSet(report.cases, activeFixtures) ? 'BLOCKED'
    : report.cases.some(c => c.status === 'FAIL' || c.preflight === 'FAIL') ? 'FAIL' : live ? 'PASS' : 'NOT RUN';
} catch (error) {
  report.status = 'BLOCKED';
  report.reason = error.safeReason || 'dependency_transport_or_configuration_failure';
} finally {
  await server?.close();
  const output = `${root}/${model}-${live ? `attempt-${Date.now()}` : 'preflight'}.json`;
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  if (live && !accessOnly && lock && report.cases.length) {
    await writeFile(`${root}/${model}-resume.json`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    if (report.cases.length === 18 && ['PASS', 'FAIL'].includes(report.status)) {
      await writeFile(`${root}/${model}-report.json`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    }
  }
  if (lock) { await lock.close(); await unlink(`${root}/run.lock`); }
  console.log(JSON.stringify({ status: report.status, apiAccess: report.apiAccess, cases: report.cases.length, reason: report.reason ?? null, report: output }));
  process.exitCode = report.status === 'PASS' || (!live && report.status === 'NOT RUN') ? 0 : 1;
}
