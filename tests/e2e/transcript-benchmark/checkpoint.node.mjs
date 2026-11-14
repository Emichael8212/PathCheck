import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resumeCheckpoint, legacyExecutionHash, atomicJson, extractionHash, historicalEvidence } from './checkpoint.mjs';
const expected = { model: 'gemini-3.5-flash-lite', executionHash: 'current', corpusHash: 'corpus', fixtures: [{ id: 'one', sha256: 'fixture', expected: 'rows' }] };
const saved = { ...expected, executionHash: legacyExecutionHash, cases: [{ id: 'one', fixtureHash: 'fixture', status: 'PASS', stage: 'normalization_integration', actualGeneration: true }] };
const proof = { extractionHash: 'semantic-a', legacy: { reconstructedExecutionHash: legacyExecutionHash, extractionHash: 'semantic-a', commit: 'verified-original' } };
it('preserves completed cases and original execution provenance only after reconstructed legacy proof', () => {
  const result = resumeCheckpoint(saved, expected, proof);
  assert.equal(result.cases.length, 1);
  assert.equal(result.cases[0].measuredExecutionHash, legacyExecutionHash);
  assert.equal(result.proof.method, 'reconstructed_original_sources_and_identical_extraction_sections');
});
it('refuses migration after changed core sources or extraction semantics instead of rerunning completed cases', () => {
  for (const changed of [{ ...proof, extractionHash: 'changed' }, { ...proof, legacy: { ...proof.legacy, reconstructedExecutionHash: 'changed' } }]) {
    assert.throws(() => resumeCheckpoint(saved, expected, changed), /checkpoint_incompatible/);
  }
});
it('refuses duplicate, unknown, altered fixtures or wrong corpus even with valid source proof', () => {
  for (const changed of [{ ...saved, cases: [...saved.cases, ...saved.cases] }, { ...saved, corpusHash: 'other' },
    { ...saved, cases: [{ ...saved.cases[0], fixtureHash: 'altered' }] }]) assert.throws(() => resumeCheckpoint(changed, expected, proof), /checkpoint_incompatible/);
});
it('subsequent transport-only changes preserve exact per-case provenance', () => {
  const result = resumeCheckpoint({ ...saved, executionHash: 'prior', extractionHash: 'semantic-a', cases: [{ ...saved.cases[0], measuredExecutionHash: legacyExecutionHash }] }, expected, proof);
  assert.equal(result.cases[0].measuredExecutionHash, legacyExecutionHash);
  assert.equal(result.proof.method, 'identical_extraction_fingerprint');
});
it('writes a complete atomic checkpoint and replaces it without a partial JSON state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pathcheck-checkpoint-'));
  try {
    const path = join(directory, 'resume.json');
    await atomicJson(path, { cases: [1] });
    await atomicJson(path, { cases: [1, 2] });
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { cases: [1, 2] });
  } finally { await rm(directory, { recursive: true }); }
});
it('extraction fingerprint changes with actual prompt/schema/scorer/core code but not retry diagnostics', async () => {
  const runner = await readFile(new URL('./run.mjs', import.meta.url), 'utf8');
  const sources = new Map([['tests/e2e/transcript-benchmark/run.mjs', runner],
    ['tests/e2e/transcript-benchmark/score.mjs', 'score'], ['tests/e2e/transcript-benchmark/wireSchema.mjs', 'wire'],
    ['tests/e2e/transcript-benchmark/generate.py', 'fixtures'], ['src/engine/normalize.ts', 'normalization'],
    ['supabase/functions/extract-transcript/provider.ts', 'prompt']]);
  const baseline = extractionHash(sources);
  for (const field of [...sources.keys()].filter(k => !k.endsWith('run.mjs'))) {
    const changed = new Map(sources); changed.set(field, 'changed');
    assert.notEqual(extractionHash(changed), baseline);
  }
  const changedRunner = new Map(sources);
  changedRunner.set('tests/e2e/transcript-benchmark/run.mjs', runner.replace('maxOutputTokens: 8192', 'maxOutputTokens: 8193'));
  assert.notEqual(extractionHash(changedRunner), baseline);
  const transportOnly = new Map(sources);
  transportOnly.set('tests/e2e/transcript-benchmark/retry.mjs', 'new503retry');
  assert.equal(extractionHash(transportOnly), baseline);
});
it('keeps legacy503 and schema400 evidence separate without inventing unrecorded usage or exposing raw data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pathcheck-history-'));
  try {
    await writeFile(join(directory, 'gemini-3.5-flash-lite-attempt-1.json'), JSON.stringify({ model: expected.model,
      corpusHash: 'corpus', status: 'BLOCKED', accessOnly: false, reason: 'provider_http_503',
      failedOperation: ':generateContent', cases: [{ id: 'one' }], message: 'DO_NOT_LOG' }));
    await writeFile(join(directory, 'gemini-3.5-flash-lite-attempt-2.json'), JSON.stringify({ model: expected.model,
      status: 'BLOCKED', accessOnly: true, reason: 'provider_http_400', cases: [] }));
    const result = await historicalEvidence(directory, expected.model, { hash: 'corpus', cases: [{ id: 'one' }, { id: 'two' }] });
    assert.equal(result.failures[0].fixtureId, 'two');
    assert.equal(result.failures[0].fixtureAttribution, 'inferred_from_ordered_completed_set');
    assert.equal(result.failures[0].tokenUsage, null);
    assert.equal(result.failures[1].scope, 'access_diagnostic');
    assert.equal(JSON.stringify(result).includes('DO_NOT_LOG'), false);
  } finally { await rm(directory, { recursive: true }); }
});
