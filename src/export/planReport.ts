import type { AnalysisResult, PlanningScenario, RuleFinding } from '../contracts';
import {
  APPROVAL_LABEL, ORIGIN_LABEL, OUTLOOK_TEXT, REPORT_LABEL, RULESET_LABEL, SOURCE_KIND_LABEL, VERIFICATION_LABEL,
  catalogEdition, catalogYearLabel, constraintText, courseTitle, findingClass, humanizeCode, programLabel, sourceLookup,
} from '../ui/labels';
import { termLabel } from '../ui/terms';
import type { Block, PdfDocumentInput } from './pdfWriter';

export const REPORT_FOOTER = 'PathCheck advisory plan — not an official degree audit, registration record or graduation guarantee';

const AUDIT_STATUS: Record<AnalysisResult['degreeAudit']['totalStatus'], string> = {
  satisfied: 'Modeled requirements satisfied', unmet: 'Modeled requirements not yet met', unresolved: 'Unresolved — no conclusion',
};
const REQUIREMENT_STATUS: Record<AnalysisResult['degreeAudit']['requirements'][number]['status'], string> = {
  satisfied: 'satisfied', unmet: 'not yet met', unresolved: 'unresolved',
};

/**
 * Only the conditions that actually apply to this scenario, so the advisor sees the caveats
 * that matter instead of a fixed boilerplate list. Wording renders existing inputs only.
 */
export function reportConditions(scenario: PlanningScenario, analysis: AnalysisResult): string[] {
  const { catalog, plan, assumptions } = scenario;
  const ref = catalog.catalogRef;
  const out: string[] = [];
  if (ref.ruleSetStatus === 'synthetic') out.push('SYNTHETIC TEST DATA: the courses and rules in this document are synthetic test fixtures, not Alabama State University policy.');
  else if (ref.ruleSetStatus !== 'verified') out.push(`${RULESET_LABEL[ref.ruleSetStatus]}: requirements and prerequisites have not been formally verified against the governing catalog.`);
  if (ref.catalogYearId === null) out.push('The governing catalog year is unresolved, so no definitive graduation conclusion is made.');
  const blocking = catalog.policyGaps.filter(g => g.blocksConclusions).length;
  if (blocking > 0) out.push(`${blocking} unresolved academic ${blocking === 1 ? 'policy blocks' : 'policies block'} definitive conclusions (listed below).`);
  if (assumptions.assumeFuturePass && plan.activePlacements.length > 0) out.push('Planned future courses are assumed to be passed; a failed, withdrawn or repeated course changes this plan.');
  const lastModeled = assumptions.terms.at(-1);
  if (lastModeled && plan.targetTerm.sortIndex > lastModeled.sortIndex) out.push(`The target term is after the last modeled term (${termLabel(lastModeled)}), so no path through later terms is claimed.`);
  if (plan.activePlacements.some(p => p.origin === 'adopted_suggestion')) out.push('Courses labeled "PathCheck suggestion (adopted)" came from a generated draft the student adopted; they are not advisor-approved.');
  if (assumptions.creditCapacity.some(c => c.source === 'scenario_assumption')) out.push('Per-term credit load is a planning assumption, not a university limit.');
  if (plan.availabilityEvidence.some(e => e.sourceKind === 'student_report')) out.push('Course offerings marked student-reported are unverified and are not seat or enrollment confirmations.');
  if (analysis.degreeAudit.requirements.some(r => r.conditional)) out.push('Requirements marked conditional depend on completing planned courses.');
  return out;
}

/**
 * Builds the advisor-readable report strictly from the validated scenario and E's analysis.
 * Only Plan.activePlacements are exported as the plan: unadopted projections never appear
 * as selections.
 *
 * Minimum-data policy: the export carries the plan, its provenance and uncertainties — not
 * the transcript. It omits grades, per-attempt history (raw course codes, institutions,
 * terms, credits), extraction content, student notes, account/plan/draft identifiers,
 * engine-internal item IDs and the scenario fingerprint (a hash over the whole record).
 * The academic record appears only as aggregate counts that explain uncertainty.
 */
export function buildPlanReport(scenario: PlanningScenario, analysis: AnalysisResult, generatedAt: string): PdfDocumentInput {
  const { catalog, plan, record, assumptions } = scenario;
  const ref = catalog.catalogRef;
  const src = sourceLookup(catalog);
  const blocks: Block[] = [];
  const h = (text: string) => blocks.push({ kind: 'heading', text });
  const t = (text: string) => blocks.push({ kind: 'text', text });
  const b = (text: string) => blocks.push({ kind: 'bullet', text });
  const s = (text: string) => blocks.push({ kind: 'small', text });
  const findingLine = (f: RuleFinding) => {
    const cls = findingClass(f);
    const parts = [`${cls.label}: ${humanizeCode(f.code)} (${constraintText(f)})`];
    if (f.courseIds.length) parts.push(`Courses: ${f.courseIds.map(id => courseTitle(catalog, id)).join('; ')}`);
    if (f.termIds.length) parts.push(`Terms: ${f.termIds.map(termLabel).join(', ')}`);
    if (f.nextAction) parts.push(`Next action: ${humanizeCode(f.nextAction)}`);
    b(parts.join('. ') + '.');
    f.sourceRefs.forEach(r => s(`Source — ${src(r)}`));
    if (f.assumptions.length) s(`Assumptions: ${f.assumptions.map(humanizeCode).join(', ')}`);
  };

  blocks.push({ kind: 'title', text: 'PathCheck conditional graduation plan' });
  t('Advisory planning document generated by the student. It is not an official degree audit, registration record, seat confirmation or graduation guarantee. Conclusions are conditional on the assumptions and evidence listed below.');
  s(`Generated: ${generatedAt}. Analysis evaluated at: ${assumptions.evaluatedAt}. Engine: ${scenario.engineVersion}.`);
  s(`Plan revision ${plan.planRevision}; availability revision ${plan.availabilityRevision}; record revision ${record.recordRevision}. The analysis was checked against these exact inputs when the document was generated.`);

  const conditions = reportConditions(scenario, analysis);
  if (conditions.length > 0) {
    h('Important conditions');
    conditions.forEach(b);
  }

  h('Program and catalog');
  t(programLabel(ref));
  const edition = catalogEdition(ref);
  if (edition) b(`Curriculum: ${edition.name}. ${edition.detail}`);
  b(`Target term: ${termLabel(plan.targetTerm)} (student goal, not a promise)`);
  b(`Catalog year: ${catalogYearLabel(ref)}`);
  b(`Catalog version: ${ref.catalogVersion}`);
  b(`Rule-set status: ${RULESET_LABEL[ref.ruleSetStatus]}; approval: ${APPROVAL_LABEL[catalog.approval]}`);
  ref.sources.forEach(x => s(`Source — ${SOURCE_KIND_LABEL[x.kind]}: ${x.description} (${VERIFICATION_LABEL[x.verificationStatus]})${x.urlOrRef ? ` ${x.urlOrRef}` : ''}`));
  catalog.policyGaps.forEach(g => b(`Unresolved policy${g.blocksConclusions ? ' (blocks conclusions)' : ''}: ${g.description}`));

  h('Graduation outlook (conditional)');
  const outlook = OUTLOOK_TEXT[analysis.outlook.kind];
  t(`${outlook.title} for target ${termLabel(plan.targetTerm)}.`);
  s(outlook.detail);
  const conditionalAudit = analysis.degreeAudit.totalStatus === 'satisfied' && analysis.degreeAudit.requirements.some(r => r.conditional);
  t(`Degree audit status: ${AUDIT_STATUS[analysis.degreeAudit.totalStatus]}${conditionalAudit ? ' (conditional on completing planned courses)' : ''}. Earned credits: ${analysis.degreeAudit.earnedCredits ?? 'unknown'}. Applicable credits: ${analysis.degreeAudit.applicableCredits ?? 'unknown'}.`);
  analysis.degreeAudit.disputedRules.forEach(r => b(`Disputed rule: ${humanizeCode(r)}`));

  h('Planning assumptions');
  const caps = [...new Set(assumptions.creditCapacity.map(c => `${c.maximum} credits per term (${c.source === 'student' ? 'student-entered' : c.source === 'official' ? 'official' : 'scenario assumption, not a university limit'})`))];
  caps.forEach(b);
  b(`Modeled terms: ${assumptions.terms.map(termLabel).join(', ')}`);
  b(`Future planned courses ${assumptions.assumeFuturePass ? 'are assumed to be passed' : 'are not assumed to be passed'} in this evaluation.`);
  analysis.outlook.assumptionRefs.forEach(a => b(`Assumption: ${humanizeCode(a)}`));

  h('Active plan');
  if (plan.acceptedDraft) s(`Includes an adopted PathCheck draft, adopted ${plan.acceptedDraft.adoptedAt}.`);
  const terms = [...new Set(plan.activePlacements.map(p => p.termId.sortIndex))].sort((x, y) => x - y);
  if (terms.length === 0) t('No active course placements.');
  for (const idx of terms) {
    const inTerm = plan.activePlacements.filter(p => p.termId.sortIndex === idx);
    t(termLabel(inTerm[0]!.termId));
    inTerm.forEach(p => {
      const c = catalog.courses[p.courseId];
      b(`${courseTitle(catalog, p.courseId)} (${c && c.credits !== 'unknown' ? `${c.credits} cr` : 'credits unknown'}) — ${ORIGIN_LABEL[p.origin]}`);
    });
  }
  s('Unadopted PathCheck projections and previews are not included as selections.');

  h('Priority issues');
  if (analysis.topFindings.length === 0) t('No priority issues were reported by the engine for this scenario.');
  analysis.topFindings.forEach(findingLine);

  h('Evidence gaps and unresolved items');
  if (analysis.evidenceGaps.length === 0 && analysis.bottlenecks.length === 0) t('No evidence gaps were reported by the engine for this scenario.');
  analysis.evidenceGaps.forEach(findingLine);
  analysis.bottlenecks.forEach(findingLine);
  analysis.degreeAudit.requirements.filter(r => r.status === 'unresolved').forEach(r => b(`Requirement ${humanizeCode(r.requirementId)}: unresolved${r.conditional ? ' (conditional)' : ''}.`));

  h('Student-reported course offerings');
  if (plan.availabilityEvidence.length === 0) t('No offering reports. Future offerings remain unknown unless evidenced.');
  // Student notes are free text and are deliberately not exported.
  plan.availabilityEvidence.forEach(e => b(`${courseTitle(catalog, e.courseId)}, ${termLabel(e.termId)}: ${REPORT_LABEL[e.report]} — ${e.sourceKind === 'student_report' ? 'student-reported, unverified' : SOURCE_KIND_LABEL[e.sourceKind]}, observed ${e.observedAt}. Not a seat or enrollment confirmation.`));

  h('Degree requirements (engine audit)');
  analysis.degreeAudit.requirements.forEach(r => b(`${humanizeCode(r.requirementId)}: ${REQUIREMENT_STATUS[r.status]}${r.conditional ? ' (conditional on future completion)' : ''}${r.applicableCredits === null ? '' : `, ${r.applicableCredits} applicable credits`}`));

  h('Academic record (summary only)');
  const attempts = record.courseAttempts;
  if (attempts.length === 0) t('No course attempts entered.');
  else {
    const count = (pred: (a: (typeof attempts)[number]) => boolean) => attempts.filter(pred).length;
    t(`${attempts.length} course attempt${attempts.length === 1 ? '' : 's'} entered; ${count(a => a.normalizedCourseId !== null)} matched to the catalog.`);
    const unmatched = count(a => a.normalizedCourseId === null);
    const unresolved = count(a => a.confidence === 'unresolved');
    const transfer = count(a => a.origin === 'transfer' || a.status === 'transfer_pending');
    const inProgress = count(a => a.status === 'in_progress');
    if (unmatched) b(`${unmatched} not matched to the catalog; credit toward requirements is unresolved.`);
    if (unresolved) b(`${unresolved} with unresolved details that need review.`);
    if (transfer) b(`${transfer} transfer or equivalency-pending; applicability is not assumed.`);
    if (inProgress) b(`${inProgress} in progress; not counted as completed.`);
  }
  if (record.unresolvedItems.length) b(`${record.unresolvedItems.length} record item${record.unresolvedItems.length === 1 ? '' : 's'} flagged for review in PathCheck.`);
  s('Grades, course-by-course history and transcript contents are intentionally omitted from this export.');

  return { title: 'PathCheck conditional graduation plan', creationDate: generatedAt, blocks, footer: REPORT_FOOTER };
}
