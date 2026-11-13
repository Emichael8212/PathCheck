import { describe, expect, it } from 'vitest';
import { AcademicRecordSchema, CatalogModelSchema, CourseAttemptSchema, PrerequisiteExprSchema } from './academic';
import { term, TermIdSchema } from './common';
import { AnalysisResultSchema, CandidatePreviewSchema, GeneratedDraftSchema, PlanningScenarioSchema, PlanSchema } from './planning';
import { canonicalJson, fingerprint, validateAnalysisForScenario } from './fingerprint';
import { GuestDraftSchema, readGuestDraft, SavedPlanSchema, SaveIntentSchema } from './persistence';
import { AdmissionRequestSchema, ProcessingEligibilitySchema, TicketClaimsSchema, TranscriptExtractionSchema, ValidatedExtractedRowsSchema } from './transcript';
import { rawRows, syntheticScenario } from './synthetic.test-fixtures';
import type { PlanningScenario } from './planning';
const attempt = { attemptId: 'a1', rawCourseCode: 'TEST 101', normalizedCourseId: null, institution: null, origin: 'manual', term: null, attemptedCredits: 3, earnedCredits: null, grade: null, status: 'unknown', evidence: [], confidence: 'unresolved' };
describe('strict academic boundaries', () => {
  it('retains unknowns and distinct repeats through JSON round-trip', () => {
    const record = { schemaVersion: 1, recordRevision: 0, courseAttempts: [attempt, { ...attempt, attemptId: 'a2' }], unresolvedItems: ['grade'] };
    expect(AcademicRecordSchema.parse(JSON.parse(JSON.stringify(record)))).toEqual(record);
  });
  it.each(['completed', 'in_progress', 'failed', 'withdrawn', 'incomplete', 'transfer_pending', 'unknown'])('retains %s as an explicit status', status => {
    expect(CourseAttemptSchema.parse({ ...attempt, status }).status).toBe(status);
  });
  it.each([
    { ...attempt, attemptedCredits: -1 }, { ...attempt, earnedCredits: 4 }, { ...attempt, normalizedCourseId: 'BAD' },
    { ...attempt, status: 'passed' }, { ...attempt, degreeEligible: true }, { ...attempt, rawPdf: 'bytes' },
  ])('rejects invalid attempt fields', value => { expect(CourseAttemptSchema.safeParse(value).success).toBe(false); });
  it('rejects duplicate attempt IDs and schema migration by accident', () => {
    expect(AcademicRecordSchema.safeParse({ schemaVersion: 1, recordRevision: 0, courseAttempts: [attempt, attempt], unresolvedItems: [] }).success).toBe(false);
    expect(AcademicRecordSchema.safeParse({ ...syntheticScenario().record, schemaVersion: 2 }).success).toBe(false);
  });
  it('requires canonical chronological terms', () => {
    expect(term(2030, 'spring').sortIndex).toBeLessThan(term(2030, 'summer').sortIndex);
    expect(term(2030, 'fall').sortIndex).toBeLessThan(term(2031, 'spring').sortIndex);
    expect(TermIdSchema.safeParse({ ...term(2030, 'fall'), sortIndex: 0 }).success).toBe(false);
  });
  it('preserves nested OR and corequisite policy without evaluating them', () => {
    const expr = { kind: 'all', children: [{ kind: 'any', children: [{ kind: 'course', courseId: 'TEST-101', minGrade: 'C', timing: 'prior_term' }, { kind: 'unresolved', description: 'permission', sourceRefs: [] }] }, { kind: 'corequisite', courseId: 'TEST-102', policy: { concurrencyAllowed: true, priorCompletionAllowed: false } }] };
    expect(PrerequisiteExprSchema.parse(expr)).toEqual(expr);
    expect(PrerequisiteExprSchema.safeParse({ kind: 'any', children: [] }).success).toBe(false);
  });
  it('rejects missing catalog references and cyclic requirement groups', () => {
    const catalog = syntheticScenario().catalog;
    catalog.requirementGroups = [{ kind: 'all', requirementId: 'loop', requirementIds: ['loop'], sourceRefs: ['synthetic'], uncertainty: 'unresolved', overlap: { mode: 'forbidden' }, consumesCredits: true }];
    expect(CatalogModelSchema.safeParse(catalog).success).toBe(false);
    catalog.requirementGroups = [{ kind: 'course', requirementId: 'missing', courseId: 'TEST-999', sourceRefs: ['missing'], uncertainty: 'unresolved', overlap: { mode: 'forbidden' }, consumesCredits: true }];
    expect(CatalogModelSchema.safeParse(catalog).success).toBe(false);
  });
});
describe('plan and complete scenario identity', () => {
  it('has only one availability owner and rejects raw PDFs on persisted inputs', () => {
    const s = syntheticScenario();
    expect(PlanningScenarioSchema.safeParse({ ...s, availabilityEvidence: [] }).success).toBe(false);
    expect(PlanSchema.safeParse({ ...s.plan, availability_json: [] }).success).toBe(false);
    expect(PlanSchema.safeParse({ ...s.plan, rawPdf: 'bytes' }).success).toBe(false);
    expect(PlanSchema.parse(JSON.parse(JSON.stringify(s.plan))).availabilityEvidence).toEqual(s.plan.availabilityEvidence);
  });
  it('rejects duplicate availability and active projections', () => {
    const p = syntheticScenario().plan;
    expect(PlanSchema.safeParse({ ...p, availabilityEvidence: [...p.availabilityEvidence, ...p.availabilityEvidence] }).success).toBe(false);
    expect(PlanSchema.safeParse({ ...p, activePlacements: [{ ...p.activePlacements[0], origin: 'system_projection' }] }).success).toBe(false);
  });
  const edits: Array<[string, (s: PlanningScenario) => void]> = [
    ['catalog version', s => { s.catalog.catalogRef.catalogVersion = s.plan.catalogRef.catalogVersion = 'v2'; }],
    ['catalog content', s => { s.catalog.courses['TEST-101']!.credits = 4; }],
    ['catalog applicability', s => { s.catalog.catalogRef.catalogYearId = s.plan.catalogRef.catalogYearId = null; }],
    ['record revision', s => { s.record.recordRevision++; }],
    ['record content at same revision', s => { s.record.unresolvedItems.push('transfer'); }],
    ['plan revision', s => { s.plan.planRevision++; }],
    ['placement content', s => { s.plan.activePlacements[0]!.termId = term(2030, 'spring'); }],
    ['target', s => { s.plan.targetTerm = term(2031, 'fall'); }],
    ['availability revision', s => { s.plan.availabilityRevision++; }],
    ['availability report at same revision', s => { s.plan.availabilityEvidence[0]!.report = 'not_listed'; }],
    ['availability source', s => { s.plan.availabilityEvidence[0]!.sourceRef = 'different'; }],
    ['availability observation', s => { s.plan.availabilityEvidence[0]!.observedAt = '2030-01-02T00:00:00Z'; }],
    ['capacity', s => { s.assumptions.creditCapacity[0]!.maximum = 9; }],
    ['evaluation policy', s => { s.assumptions.evaluationPolicy = 'other'; }],
    ['future completion assumption', s => { s.assumptions.assumeFuturePass = true; }],
    ['engine version', s => { s.engineVersion = 'v2'; }],
    ['search options', s => { s.searchOptions.maxExpansions = 999; }],
    ['source provenance', s => { s.catalog.catalogRef.sources[0]!.description = s.plan.catalogRef.sources[0]!.description = 'different evidence'; }],
  ];
  it.each(edits)('invalidates %s', (_name, edit) => {
    const s = syntheticScenario(), before = fingerprint(s); edit(s); expect(fingerprint(s)).not.toBe(before);
  });
  it('canonicalizes object keys, rejects non-JSON values, and reproduces fingerprints', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
    expect(() => canonicalJson({ bad: undefined })).toThrow();
    expect(() => canonicalJson(NaN)).toThrow();
    const s = syntheticScenario(); expect(fingerprint(JSON.parse(JSON.stringify(s)))).toBe(fingerprint(s));
  });
  it('rejects mismatched preview bases and adopted drafts', () => {
    const s = syntheticScenario(), base = fingerprint(s);
    const preview = { previewId: 'preview', baseFingerprint: base, changeSet: { baseFingerprint: base, operations: [{ kind: 'remove', placementId: 'p1' }] }, proposedPlacements: [], before: [], after: [], assumptions: [], benefitClass: 'tradeoff', validabilityStatus: 'unresolved' };
    expect(CandidatePreviewSchema.safeParse(preview).success).toBe(true);
    s.plan.planRevision++;
    expect(CandidatePreviewSchema.safeParse({ ...preview, baseFingerprint: fingerprint(s) }).success).toBe(false);
    expect(GeneratedDraftSchema.safeParse({ draftId: 'd', baseFingerprint: base, placements: s.plan.activePlacements, assumptions: [], validation: [] }).success).toBe(false);
  });
  it('prevents unresolved policies from becoming a completion claim', () => {
    const s = syntheticScenario();
    const analysis = { inputFingerprint: fingerprint(s), degreeAudit: { requirements: [], earnedCredits: null, applicableCredits: null, disputedRules: [], totalStatus: 'unresolved' }, outlook: { kind: 'insufficient_evidence', targetTerm: s.plan.targetTerm, assumptionRefs: [], evidenceRefs: [] }, topFindings: [], evidenceGaps: [], bottlenecks: [], candidates: [], availabilityQuestions: [] };
    expect(validateAnalysisForScenario(s, analysis).ok).toBe(true);
    expect(validateAnalysisForScenario(s, { ...analysis, outlook: { ...analysis.outlook, kind: 'conditional_path_found' } })).toMatchObject({ ok: false, code: 'unresolved' });
    expect(AnalysisResultSchema.safeParse({ ...analysis, outlook: { ...analysis.outlook, kind: 'graduation_guaranteed' } }).success).toBe(false);
    s.record.recordRevision++;
    expect(validateAnalysisForScenario(s, analysis)).toMatchObject({ ok: false, reasonCode: 'stale_analysis' });
  });
});
describe('extraction boundary and admission shapes (not endpoint authorization)', () => {
  it('keeps malicious schema-valid proposed credits and matches provisional', () => {
    expect(ValidatedExtractedRowsSchema.parse(rawRows).extraction.rows[0]!.rawEarnedCredits).toBe('999');
    expect(ValidatedExtractedRowsSchema.safeParse({ ...rawRows, extraction: { ...rawRows.extraction, rows: [{ ...rawRows.extraction.rows[0], normalizedCourseId: 'TEST-101' }] } }).success).toBe(false);
  });
  it('rejects accepted output without all rows/pages accounted for', () => {
    const e = { schemaVersion: 1, documentPageCount: 2, detectedRowCount: 1, rows: rawRows.extraction.rows, coveredPages: [1, 2], unrecognizedRows: [], warnings: [], completeness: 'demonstrated', acceptanceStatus: 'accepted', modelId: 'synthetic', extractionSchemaVersion: 1 };
    expect(TranscriptExtractionSchema.safeParse(e).success).toBe(true);
    for (const change of [{ coveredPages: [1] }, { coveredPages: [1, 1] }, { detectedRowCount: null }, { detectedRowCount: 2 }, { completeness: 'unknown' }, { unrecognizedRows: ['r2'] }]) expect(TranscriptExtractionSchema.safeParse({ ...e, ...change }).success).toBe(false);
  });
  it('requires bounded ticket lifetime and denies browser consent-only shape', () => {
    const t = { schemaVersion: 1, ticketId: 't', sessionId: 's', consentReceiptId: 'c', audience: 'extract-transcript', documentDigest: 'a'.repeat(64), issuedAt: '2030-01-01T00:00:00Z', expiresAt: '2030-01-01T00:05:00Z' };
    expect(TicketClaimsSchema.safeParse(t).success).toBe(true);
    expect(TicketClaimsSchema.safeParse({ ...t, expiresAt: '2030-01-01T00:05:01Z' }).success).toBe(false);
    expect(AdmissionRequestSchema.safeParse({ consent: true }).success).toBe(false);
    expect(ProcessingEligibilitySchema.safeParse({ status: 'approved' }).success).toBe(false);
  });
});
describe('recovery and persistence', () => {
  const draft = () => { const s = syntheticScenario(); return { schemaVersion: 1, draftId: 'd', mode: 'cross_tab_opt_in', explicitRecoveryConsent: true, createdAt: '2030-01-01T00:00:00Z', expiresAt: '2030-01-02T00:00:00Z', record: s.record, plan: s.plan }; };
  it('requires opt-in and bounded expiry', () => {
    expect(GuestDraftSchema.safeParse(draft()).success).toBe(true);
    expect(GuestDraftSchema.safeParse({ ...draft(), explicitRecoveryConsent: false }).success).toBe(false);
    expect(GuestDraftSchema.safeParse({ ...draft(), expiresAt: '2030-01-02T00:00:01Z' }).success).toBe(false);
    expect(GuestDraftSchema.safeParse({ ...draft(), rawPdf: 'no' }).success).toBe(false);
  });
  it('rejects expired, future-dated, corrupt and wrong-version recovery', () => {
    expect(readGuestDraft(draft(), '2030-01-01T12:00:00Z')).not.toBeNull();
    expect(readGuestDraft(draft(), '2030-01-02T00:00:00Z')).toBeNull();
    expect(readGuestDraft(draft(), '2029-12-31T00:00:00Z')).toBeNull();
    expect(readGuestDraft({ ...draft(), schemaVersion: 2 }, '2030-01-01T12:00:00Z')).toBeNull();
    expect(readGuestDraft('corrupt', '2030-01-01T12:00:00Z')).toBeNull();
  });
  it('rejects persisted identity/revision mismatches and derived state', () => {
    const d = draft(), saved = { schemaVersion: 1, id: d.plan.planId, ownerUserId: 'synthetic-owner', revision: 0, record: d.record, plan: d.plan, createdAt: d.createdAt, updatedAt: d.createdAt };
    expect(SavedPlanSchema.safeParse(saved).success).toBe(true);
    expect(SavedPlanSchema.safeParse({ ...saved, revision: 7, plan: { ...saved.plan, planRevision: 3 } }).success).toBe(true);
    expect(SaveIntentSchema.safeParse({ kind: 'update_owned', id: 'different', expectedRevision: 0, record: d.record, plan: d.plan }).success).toBe(false);
    for (const change of [{ id: 'different' }, { analysis: {} }, { availability_json: [] }]) expect(SavedPlanSchema.safeParse({ ...saved, ...change }).success).toBe(false);
  });
});
