import { describe, expect, it } from 'vitest';
import { SEARCH_POLICY, fingerprint, term } from '../../src/contracts';
import type { AnalysisResult, RuleFinding } from '../../src/contracts';
import { findingClass, OUTLOOK_TEXT, catalogYearLabel } from '../../src/ui/labels';
import { findingDelta, previewApplyBlock, previewNeedsAcknowledgement, timelineColumns } from '../../src/ui/planView';
import { attemptToRow, emptyRow, toProposedRow, validateRow } from '../../src/ui/rows';
import { buildScenario, evaluateChecked, guard, makeAction } from '../../src/ui/scenario';
import { planningHorizon, termSequence, upcomingTerm, termLabel } from '../../src/ui/terms';
import { looksLikePdf } from '../../src/ui/upload';
import { CONFIG, TERMS, syntheticPlan, syntheticRecord, syntheticScenarioAndAnalysis } from '../fixtures/ui/scenarioFixtures';
import { fakeAcademic, fakeClock } from '../fixtures/ui/fakeServices';
import { syntheticCatalog, SYNTHETIC_REF } from '../fixtures/ui/syntheticCatalog';

describe('terms', () => {
  it('derives the upcoming term from the clock', () => {
    expect(termLabel(upcomingTerm('2026-11-12T00:00:00Z', false))).toBe('Spring 2027');
    expect(termLabel(upcomingTerm('2026-03-01T00:00:00Z', false))).toBe('Fall 2026');
    expect(termLabel(upcomingTerm('2026-03-01T00:00:00Z', true))).toBe('Summer 2026');
  });
  it('skips summer unless modeled and keeps contract sort order', () => {
    expect(termSequence(term(2027, 'spring'), 3, false).map(termLabel)).toEqual(['Spring 2027', 'Fall 2027', 'Spring 2028']);
    expect(termSequence(term(2027, 'spring'), 3, true).map(t => t.sortIndex)).toEqual([6081, 6082, 6083]);
  });
  it('bounds the horizon by search budget and flags truncation', () => {
    const h = planningHorizon(term(2027, 'spring'), term(2035, 'fall'), SEARCH_POLICY.horizonTerms, false);
    expect(h.terms).toHaveLength(8);
    expect(h.truncated).toBe(true);
    const inside = planningHorizon(term(2027, 'spring'), term(2028, 'spring'), 8, false, [term(2026, 'fall')]);
    expect(inside.terms.map(termLabel)).toEqual(['Fall 2026', 'Spring 2027', 'Fall 2027', 'Spring 2028']);
    expect(inside.truncated).toBe(false);
  });
});

describe('manual rows stay raw', () => {
  it('validates input hygiene only', () => {
    const row = { ...emptyRow('a'), courseCode: 'CIS 206', status: 'completed' as const, attemptedCredits: '3', earnedCredits: '4' };
    expect(validateRow(row).earnedCredits).toMatch(/cannot exceed/);
    expect(validateRow({ ...row, earnedCredits: '-1' }).earnedCredits).toMatch(/non-negative/);
    expect(validateRow({ ...row, courseCode: '' }).courseCode).toBeDefined();
    expect(validateRow({ ...row, status: '' }).status).toBeDefined();
    expect(validateRow({ ...row, earnedCredits: '3' })).toEqual({});
  });
  it('produces raw proposed rows with no provisional catalog mapping', () => {
    const p = toProposedRow({ ...emptyRow('a'), courseCode: ' cis 206 ', termKey: String(term(2025, 'fall').sortIndex), status: 'in_progress', attemptedCredits: '3', institution: 'Other U' });
    expect(p).toMatchObject({ rawCourseCode: 'cis 206', rawTerm: 'Fall 2025', rawStatus: 'in_progress', rawAttemptedCredits: '3', rawEarnedCredits: null, rawInstitution: 'Other U', provisionalCourseId: null, provenance: [] });
  });
  it('reopens accepted attempts without reinterpretation', () => {
    const a = syntheticRecord().courseAttempts[1]!;
    expect(attemptToRow(a)).toMatchObject({ courseCode: 'XFR 100', status: 'transfer_pending', earnedCredits: '', institution: 'Synthetic College', termKey: '' });
  });
});

describe('scenario composition and analysis gate', () => {
  const base = { catalog: syntheticCatalog(), record: syntheticRecord(), terms: TERMS, capacity: { maximum: 15, source: 'scenario_assumption' as const }, config: CONFIG, evaluatedAt: '2026-11-12T15:00:00.000Z' };
  it('builds a frozen, schema-valid scenario and reads availability only from the plan', () => {
    const r = buildScenario({ ...base, plan: syntheticPlan() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.isFrozen(r.value)).toBe(true);
    expect(r.value.assumptions.creditCapacity).toHaveLength(TERMS.length);
    expect(Object.keys(r.value)).not.toContain('availabilityEvidence');
  });
  it('rejects placements outside the modeled horizon as validation_error', () => {
    const plan = syntheticPlan({ activePlacements: [{ placementId: 'x', courseId: 'SYN-101', termId: term(2031, 'fall'), origin: 'student_selected', active: true }] });
    expect(buildScenario({ ...base, plan })).toMatchObject({ ok: false, code: 'validation_error' });
  });
  it('rejects engine output whose fingerprint does not match (stale) or overclaims under blocking gaps', () => {
    const { scenario, analysis } = syntheticScenarioAndAnalysis();
    const staleEngine = { evaluate: () => ({ ok: true as const, value: { ...analysis, inputFingerprint: syntheticScenarioAndAnalysis({ plan: syntheticPlan({ planRevision: 9 }) }).analysis.inputFingerprint } }) };
    expect(evaluateChecked(staleEngine, scenario)).toMatchObject({ ok: false, code: 'stale_preview' });
    const blocked = syntheticScenarioAndAnalysis({ blockingGap: true });
    const overclaim = { evaluate: () => ({ ok: true as const, value: { ...blocked.analysis, outlook: { ...blocked.analysis.outlook, kind: 'conditional_path_found' as const } } }) };
    expect(evaluateChecked(overclaim, blocked.scenario)).toMatchObject({ ok: false, code: 'unresolved' });
    expect(evaluateChecked({ evaluate: () => { throw new Error('boom'); } }, scenario)).toMatchObject({ ok: false, code: 'external_failure' });
    expect(evaluateChecked(fakeAcademic([syntheticCatalog()]), scenario).ok).toBe(true);
  });
  it('creates explicit user actions with acknowledgements and converts exceptions to typed failures', () => {
    const a = makeAction(fakeClock(), 'apply', ['x']);
    expect(a).toMatchObject({ kind: 'apply', acknowledgedAssumptions: ['x'] });
    expect(guard(() => { throw new Error('x'); }, 'r')).toEqual({ ok: false, code: 'external_failure', reasonCode: 'r' });
  });
});

describe('display helpers do not change meaning', () => {
  const f = (over: Partial<RuleFinding>): RuleFinding => ({ findingId: 'f', code: 'c', severity: 'error', status: { status: 'unsatisfied', conditional: false }, courseIds: [], termIds: [], requirementIds: [], sourceRefs: [], explanationParams: {}, assumptions: [], nextAction: null, ...over });
  it('uses "Known conflict" only for definite unsatisfied errors', () => {
    expect(findingClass(f({})).tone).toBe('conflict');
    expect(findingClass(f({ status: { status: 'unsatisfied', conditional: true } })).tone).toBe('potential');
    expect(findingClass(f({ status: { status: 'unresolved', conditional: false } })).tone).toBe('unresolved');
    expect(findingClass(f({ severity: 'warning' })).tone).toBe('potential');
  });
  it('outlook wording never claims a guarantee', () => {
    for (const o of Object.values(OUTLOOK_TEXT)) expect(`${o.title} ${o.detail}`).not.toMatch(/\bguaranteed\b|\bwill graduate\b/i);
    const kinds: AnalysisResult['outlook']['kind'][] = ['conditional_path_found', 'target_at_risk', 'insufficient_evidence', 'known_constraints_block_current_plan', 'not_evaluated'];
    expect(Object.keys(OUTLOOK_TEXT).sort()).toEqual([...kinds].sort());
    expect(catalogYearLabel({ ...SYNTHETIC_REF, catalogYearId: null })).toMatch(/Not confirmed/);
  });
  it('computes preview deltas from engine before/after findings', () => {
    const d = findingDelta({ before: [f({ findingId: 'a', code: 'x' }), f({ findingId: 'b', code: 'y' })], after: [f({ findingId: 'b2', code: 'y' }), f({ findingId: 'c', code: 'z' })] });
    expect(d.resolved.map(x => x.code)).toEqual(['x']);
    expect(d.introduced.map(x => x.code)).toEqual(['z']);
    expect(d.persisting.map(x => x.code)).toEqual(['y']);
    expect(previewNeedsAcknowledgement({ assumptions: [], validabilityStatus: 'valid' })).toBe(false);
    expect(previewNeedsAcknowledgement({ assumptions: [], validabilityStatus: 'conditional' })).toBe(true);
  });
  it('never lets a stale or engine-invalid preview look applicable', () => {
    expect(previewApplyBlock({ validabilityStatus: 'invalid' }, false)).toBe('invalid');
    expect(previewApplyBlock({ validabilityStatus: 'conditional' }, true)).toBe('stale');
    expect(previewApplyBlock({ validabilityStatus: 'conditional' }, false)).toBeNull();
    expect(previewApplyBlock({ validabilityStatus: 'unresolved' }, false)).toBeNull();
    expect(previewNeedsAcknowledgement({ assumptions: [], validabilityStatus: 'unresolved' })).toBe(true);
  });
  it('test-double preview labels are internally coherent (fixture hygiene, not engine logic)', () => {
    const catalog = syntheticCatalog();
    const academic = fakeAcademic([catalog]);
    const at = (id: string, courseId: string, t = TERMS[0]!) => ({ placementId: id, courseId, termId: t, origin: 'student_selected' as const, active: true });
    const scenarioWith = (placements: ReturnType<typeof at>[]) => {
      const built = buildScenario({ catalog, record: syntheticRecord(), plan: syntheticPlan({ activePlacements: placements, availabilityEvidence: [] }), terms: TERMS, capacity: { maximum: 15, source: 'scenario_assumption' }, config: CONFIG, evaluatedAt: '2026-11-12T15:00:00.000Z' });
      if (!built.ok) throw new Error('fixture scenario invalid');
      return built.value;
    };
    const move = (s: ReturnType<typeof scenarioWith>) => {
      const r = academic.preview(s, { baseFingerprint: fingerprint(s), operations: [{ kind: 'move', placementId: 'p301', termId: TERMS[1]! }] });
      if (!r.ok) throw new Error('preview failed');
      return r.value;
    };
    // Both prerequisites earlier after the move: improvement, nothing introduced, applicable.
    const good = move(scenarioWith([at('p201', 'SYN-201'), at('p202', 'SYN-202'), at('p301', 'SYN-301')]));
    expect(good.benefitClass).toBe('improved');
    expect(findingDelta(good).introduced).toHaveLength(0);
    expect(previewApplyBlock(good, false)).toBeNull();
    // SYN 202 never planned: the conflict follows SYN 301 into Fall, so it is a tradeoff that stays invalid.
    const mixed = move(scenarioWith([at('p201', 'SYN-201'), at('p301', 'SYN-301')]));
    expect(mixed.benefitClass).toBe('tradeoff');
    expect(mixed.validabilityStatus).toBe('invalid');
    expect(findingDelta(mixed).introduced.map(x => x.termIds.map(termLabel))).toEqual([['Fall 2027']]);
    expect(previewApplyBlock(mixed, false)).toBe('invalid');
    expect(academic.validateCandidate(scenarioWith([at('p201', 'SYN-201'), at('p301', 'SYN-301')]), mixed).ok).toBe(false);
    // Such a state is never offered as a suggestion.
    const analysis = academic.evaluate(scenarioWith([at('p201', 'SYN-201'), at('p301', 'SYN-301')]));
    expect(analysis.ok && analysis.value.candidates).toEqual([]);
  });
  it('keeps projections separate from active placements in the timeline', () => {
    const plan = syntheticPlan();
    const cols = timelineColumns(TERMS, plan.activePlacements, [{ placementId: 'd', courseId: 'SYN-202', termId: TERMS[1]!, origin: 'system_projection', active: false }]);
    expect(cols[0]!.active).toHaveLength(2);
    expect(cols[1]!.projected).toHaveLength(1);
    expect(cols[1]!.active).toHaveLength(0);
  });
  it('checks the PDF signature before upload', () => {
    expect(looksLikePdf(new TextEncoder().encode('%PDF-1.7 x'))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode('<html>'))).toBe(false);
  });
});
