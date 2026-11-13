// On-screen wording rules (UX-006 amendment). Every claim-bearing string must follow the
// engine's coded values; these tests pin that mapping. Synthetic data only.
import { describe, expect, it } from 'vitest';
import type { AnalysisResult, RuleFinding } from '../../src/contracts';
import { OUTLOOK_UI, assumptionText, catalogStatus, findingMark, findingTitle, withTarget } from '../../src/ui/labels';
import { affectedTerms, changeSummary, previewHeadline, previewValidity } from '../../src/ui/previewText';
import { termFromIndex } from '../../src/ui/terms';
import { SYNTHETIC_REF, syntheticCatalog } from '../fixtures/ui/syntheticCatalog';

const f = (over: Partial<RuleFinding>): RuleFinding => ({ findingId: 'f', code: 'c', severity: 'error', status: { status: 'unsatisfied', conditional: false }, courseIds: [], termIds: [], requirementIds: [], sourceRefs: [], explanationParams: {}, assumptions: [], nextAction: null, ...over });
const conflict = f({ findingId: 'x' });
const potential = f({ findingId: 'p', severity: 'warning' });

describe('preview headline follows the engine delta', () => {
  it('claims "No new conflicts" only when no introduced finding is a known conflict', () => {
    expect(previewHeadline({ benefitClass: 'improved' }, { resolved: [conflict, conflict], introduced: [], persisting: [] })).toBe('Resolves 2 issues. No new conflicts.');
    expect(previewHeadline({ benefitClass: 'improved' }, { resolved: [conflict], introduced: [potential], persisting: [] })).toBe('Resolves 1 issue. No new conflicts.');
    expect(previewHeadline({ benefitClass: 'improved' }, { resolved: [conflict], introduced: [conflict], persisting: [] })).toBe('Resolves 1 issue. Adds 1 conflict.');
    expect(previewHeadline({ benefitClass: 'improved' }, { resolved: [], introduced: [], persisting: [] })).toBe('No reported issue changes. No new conflicts.');
  });
  it('labels tradeoffs and exhausted searches without claiming improvement', () => {
    expect(previewHeadline({ benefitClass: 'tradeoff' }, { resolved: [conflict, conflict], introduced: [conflict], persisting: [] })).toBe('Tradeoff: resolves 2, adds 1.');
    const none = previewHeadline({ benefitClass: 'no_valid_alternative' }, { resolved: [conflict], introduced: [], persisting: [] });
    expect(none).toMatch(/couldn’t find a better option within its search limits/);
    expect(none).not.toMatch(/resolves/i);
  });
  it('renders every validability status', () => {
    expect(previewValidity({ validabilityStatus: 'valid', assumptions: [] })).toBe('Meets the modeled rules.');
    expect(previewValidity({ validabilityStatus: 'conditional', assumptions: ['a', 'b'] })).toBe('Depends on 2 assumptions. Confirm below.');
    expect(previewValidity({ validabilityStatus: 'conditional', assumptions: [] })).toBe('Depends on unverified evidence.');
    expect(previewValidity({ validabilityStatus: 'invalid', assumptions: [] })).toBe('Breaks a modeled rule.');
    expect(previewValidity({ validabilityStatus: 'unresolved', assumptions: [] })).toMatch(/can’t verify/);
  });
});

describe('change wording names every affected semester', () => {
  const catalog = syntheticCatalog();
  const spring = termFromIndex(2027 * 3), fall = termFromIndex(2027 * 3 + 2);
  it('summarizes moves, adds, removals and swaps exactly', () => {
    expect(changeSummary([{ verb: 'Move', courseId: 'SYN-301', before: spring, after: fall }], catalog)).toBe('Move SYN 301 to Fall 2027');
    expect(changeSummary([{ verb: 'Add', courseId: 'SYN-201', before: null, after: spring }], catalog)).toBe('Add SYN 201 to Spring 2027');
    expect(changeSummary([{ verb: 'Remove', courseId: 'SYN-201', before: spring, after: null }], catalog)).toBe('Remove SYN 201');
    expect(changeSummary([{ verb: 'Swap', courseId: 'SYN-201', before: spring, after: fall }, { verb: 'Swap', courseId: 'SYN-202', before: fall, after: spring }], catalog)).toBe('Swap SYN 201 and SYN 202');
  });
  it('lists source and destination terms in term order', () => {
    expect(affectedTerms([{ verb: 'Move', courseId: 'SYN-301', before: fall, after: spring }])).toEqual(['Spring 2027', 'Fall 2027']);
    expect(affectedTerms([{ verb: 'Remove', courseId: 'SYN-201', before: spring, after: null }])).toEqual(['Spring 2027']);
  });
});

describe('plain labels keep academic meaning', () => {
  it('never says "on track" or promises graduation; every outlook kind is covered', () => {
    const kinds: AnalysisResult['outlook']['kind'][] = ['conditional_path_found', 'target_at_risk', 'insufficient_evidence', 'known_constraints_block_current_plan', 'not_evaluated'];
    expect(Object.keys(OUTLOOK_UI).sort()).toEqual([...kinds].sort());
    for (const o of Object.values(OUTLOOK_UI)) {
      const text = withTarget(`${o.title} ${o.detail}`, 'Fall 2028');
      expect(text).not.toMatch(/\bon track\b|\bwill graduate\b|\bguaranteed\b/i);
      expect(text).not.toContain('{target}');
    }
    expect(OUTLOOK_UI.conditional_path_found.detail).toMatch(/Not a guarantee/);
    // Lead integration checks match this outlook with /unknown|insufficient|not enough/i.
    expect(OUTLOOK_UI.insufficient_evidence.title).toMatch(/not enough/i);
  });
  it('keeps conflicts, possible issues and unknowns distinct', () => {
    expect(findingMark(conflict).word).toBe('Conflict');
    expect(findingMark(potential).word).toBe('Check');
    expect(findingMark(f({ status: { status: 'unsatisfied', conditional: true } })).word).toBe('Check (conditional)');
    expect(findingMark(f({ status: { status: 'unresolved', conditional: false } })).word).toBe('Unknown');
    expect(findingTitle('prerequisite_unsatisfied')).toBe('Missing prerequisite');
    expect(findingTitle('some_new_engine_code')).toBe('Some new engine code');
  });
  it('maps engine assumption ids and never drops an unknown one', () => {
    const catalog = syntheticCatalog();
    expect(assumptionText('capacity:scenario_assumption', catalog, 15)).toBe('Semester credit limit is assumed (15 credits).');
    expect(assumptionText(`offering_unknown:SYN-301@${2027 * 3}`, catalog)).toBe('SYN 301 availability for Spring 2027 hasn’t been checked.');
    expect(assumptionText('future_pass:SYN-101', catalog)).toBe('Assumes you pass SYN 101.');
    expect(assumptionText('availability:student_report', catalog)).toMatch(/isn’t verified/);
    expect(assumptionText('mystery_rule', catalog)).toBe('Mystery rule.');
  });
  it('identifies synthetic and provisional catalogs persistently', () => {
    expect(catalogStatus(SYNTHETIC_REF, 'synthetic')).toMatchObject({ short: 'Test catalog', tone: 'warn' });
    expect(catalogStatus({ ...SYNTHETIC_REF, ruleSetStatus: 'provisional' }, 'user_provisional')).toMatchObject({ short: 'Provisional catalog', tone: 'warn' });
    expect(catalogStatus({ ...SYNTHETIC_REF, ruleSetStatus: 'verified' }, 'reviewed')).toMatchObject({ tone: 'ok' });
    expect(catalogStatus({ ...SYNTHETIC_REF, ruleSetStatus: 'verified' }, 'unreviewed').tone).toBe('warn');
  });
});

describe('finding grouping keeps every finding', () => {
  it('groups repeated non-conflict findings at the first position and never drops or merges conflicts', async () => {
    const { groupFindings } = await import('../../src/ui/planView');
    const unplaced = (id: string) => f({ findingId: id, code: 'required_course_unplaced', severity: 'warning', courseIds: [id] });
    const items = groupFindings([conflict, unplaced('a'), f({ findingId: 'y' }), unplaced('b'), unplaced('c')], x => findingMark(x).tone, x => findingMark(x).tone !== 'conflict');
    expect(items.map(i => (i.kind === 'single' ? i.finding.findingId : `group:${i.findings.map(x => x.findingId).join(',')}`))).toEqual(['x', 'group:a,b,c', 'y']);
    const single = groupFindings([unplaced('a'), potential], x => findingMark(x).tone, () => true);
    expect(single.every(i => i.kind === 'single')).toBe(true);
  });
});
