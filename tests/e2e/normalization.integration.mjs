// Run from an assembled L/E/G checkout: node tests/e2e/normalization.integration.mjs
// Synthetic records only. No provider/network/database calls.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom' });
try {
  const { validateExtraction } = await server.ssrLoadModule('/src/transcript/validation.ts');
  const { normalizeExtraction } = await server.ssrLoadModule('/src/app/normalizeExtraction.ts');
  const { academicService } = await server.ssrLoadModule('/src/engine/index.ts');
  const { syntheticScenario, rawRows } = await server.ssrLoadModule('/src/contracts/synthetic.test-fixtures.ts');
  const scenario = syntheticScenario();
  const input = structuredClone(rawRows.extraction);
  const original = structuredClone(input);
  const validated = validateExtraction(input, scenario.catalog);
  assert.equal(validated.ok, true);
  assert.equal(validated.value.extraction.rows[0].provisionalCourseId, null);
  const normalized = normalizeExtraction(validated.value, scenario.catalog, academicService);
  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.extractionReviewStatus, 'needs_review');
  assert.equal(normalized.value.requiresExplicitRecordAcceptance, true);
  assert.equal(normalized.value.record.courseAttempts.length, 1);
  const attempt = normalized.value.record.courseAttempts[0];
  assert.equal(attempt.normalizedCourseId, null);
  assert.equal(attempt.earnedCredits, null);
  assert.equal(attempt.status, 'unknown');
  assert.deepEqual(input, original);
  assert.deepEqual(scenario.record.courseAttempts, []);
  assert.equal(validateExtraction({ ...input, acceptanceStatus: 'rejected' }, scenario.catalog).ok, false);
  assert.equal(normalizeExtraction({ ...validated.value, extraction: { ...input, schemaVersion: 99 } }, scenario.catalog, academicService).ok, false);
  console.log('PASS: actual extraction validation → lead routing → engine normalization; forged mapping and credit rejected, review-required proposal returned.');
} finally { await server.close(); }
