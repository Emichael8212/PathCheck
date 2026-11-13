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
  const { checkPersistableProjection } = await server.ssrLoadModule('/src/persistence/projection.ts');
  const baseRow = { ...input.rows[0], rawCourseCode: 'TEST 101', rawAttemptedCredits: '3', rawEarnedCredits: '3', rawGrade: 'B', rawStatus: 'completed', rawInstitution: 'Alabama State University', rawTerm: 'Fall 2025', provenance: [{ field: 'code', page: 1, row: 1, quote: 'SYNTHETIC_PRIVATE_QUOTE' }] };
  const mixed = { ...input, rows: [baseRow,
    { ...baseRow, rowId: 'repeat', rawTerm: 'Spring 2026' },
    { ...baseRow, rowId: 'transfer', rawInstitution: 'Synthetic Other University' },
    { ...baseRow, rowId: 'incomplete', rawTerm: null, rawEarnedCredits: null, rawGrade: null, rawStatus: null }], unrecognizedRows: ['unreadable-row'], detectedRowCount: null };
  const proposal = validateExtraction(mixed, scenario.catalog);
  assert.equal(proposal.ok, true);
  const recordResult = normalizeExtraction(proposal.value, scenario.catalog, academicService);
  assert.equal(recordResult.ok, true);
  const record = recordResult.value.record;
  assert.equal(record.courseAttempts.length, 4);
  assert.equal(new Set(record.courseAttempts.map(row => row.attemptId)).size, 4);
  assert.equal(record.courseAttempts[2].status, 'transfer_pending');
  assert.equal(record.courseAttempts[2].normalizedCourseId, null);
  assert.equal(record.courseAttempts[3].earnedCredits, null);
  assert.equal(record.courseAttempts[3].status, 'unknown');
  assert.equal(record.courseAttempts[3].confidence, 'unresolved');
  assert.equal(record.courseAttempts[3].term, null);
  assert.equal(recordResult.value.extractionReviewStatus, 'needs_review');
  assert.equal(record.courseAttempts[0].normalizedCourseId, 'TEST-101');
  assert.equal(record.courseAttempts[1].normalizedCourseId, 'TEST-101');
  assert.equal(record.courseAttempts[0].term.academicYear, 2025);
  assert.equal(record.courseAttempts[0].term.season, 'fall');
  assert.equal(record.courseAttempts[1].term.academicYear, 2026);
  assert.equal(record.courseAttempts[1].term.season, 'spring');
  assert.equal(recordResult.value.requiresExplicitRecordAcceptance, true);
  assert.ok(record.unresolvedItems.length > 0);
  const projection = checkPersistableProjection(record, scenario.plan);
  assert.equal(projection.ok, true);
  assert.equal(JSON.stringify(projection.value).includes('SYNTHETIC_PRIVATE_QUOTE'), false);
  assert.equal(checkPersistableProjection({ ...record, rawPdf: '%PDF-synthetic' }, scenario.plan).ok, false);
  console.log('PASS: real normalization/projection preserves distinct repeats, unresolved transfer/incomplete rows and review; excludes original PDF and provenance quote.');
  console.log('PASS: actual extraction validation → lead routing → engine normalization; forged mapping and credit rejected, review-required proposal returned.');
} finally { await server.close(); }
