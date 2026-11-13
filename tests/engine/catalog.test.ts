// T-CAT: executable catalogs built from the user-approved curriculum handoffs (CAT-001..003).
// Student records here are SYNTHETIC; assertions only check fidelity and fail-closed behavior,
// never a real graduation conclusion.
import { describe, expect, it } from 'vitest';
import historicalJson from '../../docs/curriculum/historical-2019-2021.json';
import provisionalJson from '../../docs/curriculum/provisional-current.json';
import { CatalogModelSchema, CurriculumBaselineSchema, PlanningScenarioSchema, SEARCH_POLICY, fingerprint, term, validateAnalysisForScenario } from '../../src/contracts';
import type { CatalogModel, CatalogRef } from '../../src/contracts';
import { curriculumToCatalog, listCatalogs, loadValidatedCatalog, requirementIds as R } from '../../src/catalog';
import { computeAudit } from '../../src/engine/audit';
import { ENGINE_VERSION, evaluate, generateDraft, normalizeAttempts, preview } from '../../src/engine';
import { attempt } from '../fixtures/engine/synthetic';

const refs = () => { const r = listCatalogs(); if (!r.ok) throw new Error(); return r.value; };
const load = (ref: CatalogRef) => { const r = loadValidatedCatalog(ref); if (!r.ok) throw new Error(r.reasonCode); return r.value; };
const provisional = () => load(refs().find(r => r.catalogVersion === 'asu-cis-department-provisional-v1')!);
const historical = () => load(refs().find(r => r.catalogVersion === 'asu-cis-guide-2019-2021-v1')!);
const sourceCourses = (json: unknown) => CurriculumBaselineSchema.parse(json).blocks.flatMap(b => [...b.required, ...b.choices.flatMap(c => c.courses)]);

describe('CAT-01 every source requirement represented, both approved configurations', () => {
  it.each([['provisional', provisionalJson], ['historical', historicalJson]] as const)('%s: schema-valid, 121 credits, every listed course mapped', (_, json) => {
    const cat = curriculumToCatalog(json);
    expect(CatalogModelSchema.parse(cat)).toEqual(cat);
    expect(cat.requirementGroups.find(g => g.requirementId === R.total)).toMatchObject({ kind: 'total_degree_credits', minimum: 121 });
    const referenced = new Set(cat.requirementGroups.flatMap(g => g.kind === 'course' ? [g.courseId] : 'courseIds' in g ? g.courseIds : []));
    for (const c of sourceCourses(json)) { expect(referenced.has(c.courseId)).toBe(true); expect(cat.courses[c.courseId]!.credits).toBe(c.credits); }
    // Required block credits + elective 9 reconcile to 121 exactly as transcribed.
    const blocks = CurriculumBaselineSchema.parse(json).blocks;
    expect(blocks.reduce((s, b) => s + b.credits, 0) + 9).toBe(121);
  });
  it('provisional replaces exactly CIS 304->300 and CIS 415->351; historical keeps the printed slots', () => {
    const p = provisional(), h = historical();
    expect(p.requirementGroups.some(g => g.requirementId === R.course('CIS-300'))).toBe(true);
    expect(p.requirementGroups.some(g => g.requirementId === R.course('CIS-351'))).toBe(true);
    expect(p.courses['CIS-304']).toBeUndefined(); expect(p.courses['CIS-415']).toBeUndefined();
    expect(h.courses['CIS-304']).toBeDefined(); expect(h.courses['CIS-300']).toBeUndefined();
    expect(p.equivalencies).toEqual([
      { fromCourseId: 'CIS-304', toCourseId: 'CIS-300', status: 'unresolved', sourceRefs: ['user-departmental-update'] },
      { fromCourseId: 'CIS-415', toCourseId: 'CIS-351', status: 'unresolved', sourceRefs: ['user-departmental-update'] },
    ]);
    expect(p.courses['CIS-300']!.sourceRefs).toContain('user-departmental-update');
  });
});

describe('CAT-02/CAT-06 uncertainty preserved; nothing invented', () => {
  it.each([['provisional', provisional], ['historical', historical]] as const)('%s keeps null year, unresolved prerequisites, no grade scale, blocking policy gaps', (_, get) => {
    const c = get();
    expect(c.catalogRef.catalogYearId).toBeNull(); expect(c.catalogRef.ruleSetStatus).toBe('provisional'); expect(c.approval).toBe('user_provisional');
    expect(c.gradeScale).toBeNull();
    expect(Object.values(c.courses).every(x => x.prerequisite.kind === 'unresolved' && x.status === 'pending')).toBe(true);
    for (const id of ['repeat-credit-policy', 'transfer-policy', 'minimum-grade-current-applicability', 'legacy-elective-eligibility', 'term-specific-offerings', 'formal-catalog-applicability'])
      expect(c.policyGaps.find(g => g.policyId === id)?.blocksConclusions).toBe(true);
    expect(c.policyGaps.filter(g => g.policyId.startsWith('reported:'))).toHaveLength(5);
    expect(c.courses['FIN-201']!.credits).toBe('unknown');
    expect(c.requirementGroups.find(g => g.requirementId === R.electives)).toMatchObject({ uncertainty: 'unresolved', overlap: { mode: 'forbidden' } });
  });
  it('no personal-record fields or excluded data appear in the executable catalog', () => {
    const text = JSON.stringify([provisional(), historical()]);
    expect(text).not.toMatch(/studentId|"grade":|"earnedCredits"|@|\.pdf/i);
  });
});

describe('CAT-05 wrong or unsupported catalog year/version is never silently migrated', () => {
  it('rejects unknown version, a claimed formal year, and altered source status', () => {
    const p = provisional().catalogRef;
    expect(loadValidatedCatalog({ ...p, catalogVersion: 'asu-2025-2027' })).toMatchObject({ ok: false, code: 'unavailable', reasonCode: 'catalog_version_unavailable' });
    expect(loadValidatedCatalog({ ...p, catalogYearId: '2025-2027' })).toMatchObject({ ok: false, code: 'unavailable', reasonCode: 'unsupported_catalog_year' });
    expect(loadValidatedCatalog({ ...p, ruleSetStatus: 'verified' })).toMatchObject({ ok: false, code: 'unavailable', reasonCode: 'catalog_ref_mismatch' });
    expect(loadValidatedCatalog({ ...p, institutionId: 'other' } as unknown as CatalogRef)).toMatchObject({ ok: false, code: 'validation_error' });
  });
  it('lists exactly the two approved configurations, provisional first', () => {
    expect(refs().map(r => r.catalogVersion)).toEqual(['asu-cis-department-provisional-v1', 'asu-cis-guide-2019-2021-v1']);
  });
});

// Synthetic complete-looking record: one completed attempt for every required/first-choice course.
function syntheticFullRecord(cat: CatalogModel) {
  const ids = cat.requirementGroups.flatMap(g => g.kind === 'course' && g.consumesCredits ? [g.courseId] : g.kind === 'choose_n' && g.courseIds.length ? [g.courseIds[0]!] : []);
  const extra = ['HIS-132', 'ENG-210'].filter(c => !ids.includes(c));
  const listed = [...new Set([...ids, ...extra])].map((c, i) => attempt(c, { attemptId: `syn-${i}`, attemptedCredits: cat.courses[c]!.credits as number, earnedCredits: cat.courses[c]!.credits as number, term: term(2022 + (i % 3), 'fall') }));
  // Synthetic upper-level codes absent from the dictionary: possible COBA electives, eligibility unsourced.
  const electives = ['SYN 401', 'SYN 402', 'SYN 403'].map((raw, i) => attempt(null, { attemptId: `syn-el-${i}`, rawCourseCode: raw, term: term(2024, 'spring') }));
  return [...listed, ...electives];
}
const scenarioFor = (cat: CatalogModel, attempts: ReturnType<typeof attempt>[]) => {
  const terms = [term(2026, 'spring'), term(2026, 'fall'), term(2027, 'spring'), term(2027, 'fall')];
  return PlanningScenarioSchema.parse({ schemaVersion: 1, catalog: cat, record: { schemaVersion: 1, recordRevision: 0, courseAttempts: attempts, unresolvedItems: [] },
    plan: { schemaVersion: 1, planId: 'syn', planRevision: 0, catalogRef: cat.catalogRef, targetTerm: terms[3], activePlacements: [], acceptedDraft: null, availabilityEvidence: [], availabilityRevision: 0, updatedAt: '2026-01-01T00:00:00Z' },
    engineVersion: ENGINE_VERSION, assumptions: { terms, creditCapacity: terms.map(t => ({ termId: t, maximum: 15, source: 'scenario_assumption' })), evaluationPolicy: 'syn', assumeFuturePass: true, evaluatedAt: '2026-01-01T00:00:00Z' }, searchOptions: SEARCH_POLICY });
};

describe('fail-closed audit on the real provisional configuration (synthetic record)', () => {
  it('even a record covering every listed course is never reported satisfied', () => {
    const cat = provisional(); const att = syntheticFullRecord(cat);
    const a = computeAudit({ catalog: cat, attempts: att, placements: [], targetSort: 99999 });
    expect(a.audit.totalStatus).toBe('unresolved');
    // Electives remain unresolved: COBA inventory and legacy eligibility are not sourced.
    expect(a.audit.requirements.find(r => r.requirementId === R.electives)!.status).not.toBe('satisfied');
    const r = evaluate(scenarioFor(cat, att)); if (!r.ok) throw new Error(r.reasonCode);
    expect(r.value.outlook.kind).toBe('insufficient_evidence');
    expect(validateAnalysisForScenario(scenarioFor(cat, att), r.value).ok).toBe(true);
  });
  it('CAT-04 CIS 300 / CIS 351 cannot double count as electives', () => {
    const cat = provisional();
    const att = [attempt('CIS-300', { attemptId: 'x300' }), attempt('CIS-351', { attemptId: 'x351' })];
    const a = computeAudit({ catalog: cat, attempts: att, placements: [], targetSort: 99999 });
    const el = a.audit.requirements.find(r => r.requirementId === R.electives)!;
    expect(el.attemptIds).toEqual([]);
    expect(a.audit.requirements.find(r => r.requirementId === R.course('CIS-300'))!.attemptIds).toEqual(['x300']);
    expect(a.audit.applicableCredits).toBe(6);
  });
  it('historical CIS 304 work stays an unresolved possibility for CIS 300, never automatic credit', () => {
    const cat = provisional();
    const n = normalizeAttempts({ kind: 'manual_rows', rows: [{ rowId: 'h1', rawCourseCode: 'CIS 304', rawTitle: null, rawTerm: 'Fall 2022', rawAttemptedCredits: '3', rawEarnedCredits: '3', rawGrade: 'B', rawStatus: 'completed', rawInstitution: null, provisionalCourseId: 'CIS-300', provenance: [], uncertainty: [] }] }, cat);
    if (!n.ok) throw new Error();
    expect(n.value.record.courseAttempts[0]!.normalizedCourseId).toBeNull();
    expect(n.value.warnings).toContain('equivalency_unresolved:h1');
    const a = computeAudit({ catalog: cat, attempts: n.value.record.courseAttempts, placements: [], targetSort: 99999 });
    expect(a.audit.requirements.find(r => r.requirementId === R.course('CIS-300'))!.status).toBe('unresolved');
  });
  it('generated drafts on the real configuration carry unresolved-prerequisite assumptions, never a verified path', () => {
    const cat = provisional();
    const s = scenarioFor(cat, syntheticFullRecord(cat).filter(a => !(a.normalizedCourseId ?? '').startsWith('CIS-4')));
    const r = generateDraft(s); if (!r.ok) throw new Error(r.reasonCode);
    if ('kind' in r.value) throw new Error('expected a draft');
    expect(r.value.baseFingerprint).toBe(fingerprint(s));
    expect(r.value.placements.every(p => p.origin === 'system_projection' && !p.active)).toBe(true);
    expect(r.value.assumptions.some(x => x.startsWith('prerequisite_unresolved:'))).toBe(true);
    expect(r.value.validation.some(f => f.code === 'requirement_policy_unmodeled')).toBe(true);
    // Integration consequence (reported to L): adopting it is NOT validatable while prerequisites are unsourced.
    const adoption = preview(s, { baseFingerprint: fingerprint(s), operations: r.value.placements.map(p => ({ kind: 'add' as const, placement: { ...p, active: true, origin: 'adopted_suggestion' as const } })) });
    expect(adoption.ok && adoption.value.validabilityStatus).toBe('unresolved');
  });
});
