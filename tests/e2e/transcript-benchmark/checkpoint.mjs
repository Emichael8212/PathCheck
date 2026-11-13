import { readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { reusableCases } from './evidence.mjs';
import { safeFailure } from './retry.mjs';

const benchmark = 'tests/e2e/transcript-benchmark/';
const legacyCommit = '8262320ee2638e3619df5a583b24343aebdd7aaf';
export const legacyExecutionHash = '866917e1e1880ad7ae7f8f6557395ed14aa79c9d345f26fe3abcf79dd8697a90';
const digest = value => createHash('sha256').update(value).digest('hex');
const hashSources = sources => {
  const hash = createHash('sha256');
  for (const [path, bytes] of [...sources].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) hash.update(path).update(bytes);
  return hash.digest('hex');
};
function section(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
  if (a < 0 || b < 0 || text.indexOf(start, a + start.length) >= 0) throw safeFailure('extraction_fingerprint_boundary_changed');
  return text.slice(a, b);
}
export function extractionSections(source) {
  return [section(source, "const { ProposedRowSchema, TranscriptExtractionSchema }", 'const activeFixtures ='),
    section(source, 'const contents =', "report.apiAccess = 'PASS: actual generateContent response'"),
    section(source, "    try {\n      if (envelope.candidates", "    } catch { item.reason = 'schema_coverage_or_normalization_failure'; }")].join('\n');
}
export function extractionHash(sources) {
  const relevant = new Map([...sources].filter(([path]) => !path.startsWith(benchmark)
    || ['generate.py', 'score.mjs', 'wireSchema.mjs', 'evidence.mjs'].some(name => path === benchmark + name)));
  relevant.set(benchmark + 'extraction-sections', extractionSections(sources.get(benchmark + 'run.mjs').toString()));
  return hashSources(relevant);
}
export async function sourceFingerprints() {
  const paths = ['package-lock.json', 'src/app/normalizeExtraction.ts'];
  async function visit(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (item.isDirectory()) await visit(`${directory}/${item.name}`);
      else if (item.isFile() && /\.(ts|mjs|py)$/.test(item.name)) paths.push(`${directory}/${item.name}`);
    }
  }
  for (const directory of ['tests/e2e/transcript-benchmark', 'src/contracts', 'src/engine', 'src/catalog', 'src/transcript', 'supabase/functions/extract-transcript']) await visit(directory);
  const current = new Map(await Promise.all(paths.map(async path => [path, await readFile(path)])));
  const legacy = new Map([...current].filter(([path]) => !path.startsWith(benchmark)));
  const oldPaths = execFileSync('git', ['ls-tree', '-r', '--name-only', legacyCommit, '--', benchmark], { encoding: 'utf8' }).trim().split('\n').filter(path => /\.(ts|mjs|py)$/.test(path));
  for (const path of oldPaths) legacy.set(path, execFileSync('git', ['show', `${legacyCommit}:${path}`], { maxBuffer: 2_000_000 }));
  return { executionHash: hashSources(current), extractionHash: extractionHash(current),
    legacy: { commit: legacyCommit, reconstructedExecutionHash: hashSources(legacy), extractionHash: extractionHash(legacy) } };
}
export function resumeCheckpoint(saved, expected, fingerprints) {
  if (!Array.isArray(saved.cases)) throw safeFailure('invalid_checkpoint');
  const legacyVerified = saved.executionHash === legacyExecutionHash
    && fingerprints.legacy.reconstructedExecutionHash === legacyExecutionHash
    && fingerprints.extractionHash === fingerprints.legacy.extractionHash;
  const sameExtraction = saved.extractionHash === fingerprints.extractionHash;
  if (saved.executionHash !== expected.executionHash && !legacyVerified && !sameExtraction) throw safeFailure('checkpoint_incompatible_do_not_repeat_completed_cases');
  const cases = reusableCases({ ...saved, executionHash: expected.executionHash }, expected);
  if (cases.length !== saved.cases.length || saved.model !== expected.model || saved.corpusHash !== expected.corpusHash) throw safeFailure('checkpoint_incompatible_do_not_repeat_completed_cases');
  return { cases: cases.map(item => ({ ...item, measuredExecutionHash: item.measuredExecutionHash || saved.executionHash })),
    proof: { priorExecutionHash: saved.executionHash, currentExecutionHash: expected.executionHash,
      extractionHash: fingerprints.extractionHash, method: legacyVerified ? 'reconstructed_original_sources_and_identical_extraction_sections' : saved.executionHash === expected.executionHash ? 'exact_execution' : 'identical_extraction_fingerprint',
      ...(legacyVerified ? { originalSourceCommit: fingerprints.legacy.commit } : {}) } };
}
export async function atomicJson(path, data) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await rename(temporary, path);
}
// Legacy reports did not retain a complete attempt trace. Preserve their exact
// limited evidence; infer failed fixture only from same-corpus ordered completion.
export async function historicalEvidence(root, model, manifest) {
  const reports = [], failures = [];
  for (const name of (await readdir(root)).sort()) {
    if (!new RegExp(`^${model.replaceAll('.', '\\.')}\u002dattempt-\\d+\\.json$`).test(name)) continue;
    const bytes = await readFile(`${root}/${name}`);
    if (bytes.length > 2_000_000) throw safeFailure('oversized_historical_report');
    const saved = JSON.parse(bytes);
    if (saved.model !== model || saved.transportAttempts) continue;
    const status = ['PASS', 'FAIL', 'BLOCKED', 'NOT RUN'].includes(saved.status) ? saved.status : 'UNKNOWN';
    const httpMatch = /^provider_http_(\d{3})$/.exec(saved.reason || '');
    const operation = ['', ':generateContent', ':countTokens', 'model_metadata'].includes(saved.failedOperation) ? saved.failedOperation : null;
    reports.push({ file: name, sha256: digest(bytes), status, accessOnly: saved.accessOnly === true,
      completedCases: saved.cases?.length ?? 0, httpStatus: httpMatch ? Number(httpMatch[1]) : null,
      operation, completeTransportTrace: false });
    if (!httpMatch) continue;
    const completed = new Set((saved.cases || []).map(item => item.id));
    const corpusCase = saved.corpusHash === manifest.hash && saved.accessOnly === false
      ? manifest.cases.find(item => !completed.has(item.id))?.id ?? null : null;
    failures.push({ sourceReport: name, status: Number(httpMatch[1]), operation,
      fixtureId: corpusCase, fixtureAttribution: corpusCase ? 'inferred_from_ordered_completed_set' : 'not_recorded',
      scope: saved.accessOnly === true ? 'access_diagnostic' : 'corpus', retries: 'not_recorded', latencyMs: null, tokenUsage: null });
  }
  return { reports, failures };
}
