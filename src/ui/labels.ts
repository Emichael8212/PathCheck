import type { AnalysisResult, AvailabilityEvidence, CatalogModel, CatalogRef, PlanPlacement, RuleFinding, SourceEvidence, TypedFailure } from '../contracts';
import { termLabel } from './terms';

// Deterministic, coded wording only. No generated prose and no academic conclusions:
// every label below renders a value that the engine or commands already produced.

export const OUTLOOK_TEXT: Record<AnalysisResult['outlook']['kind'], { title: string; detail: string }> = {
  conditional_path_found: { title: 'Conditional path found', detail: 'Under the stated assumptions, the modeled plan reaches the modeled requirements by the target term. This is not a guarantee of offerings, seats, grades or graduation.' },
  target_at_risk: { title: 'Target at risk', detail: 'The modeled sequence is tight or contradicted for the target term. A different path may still exist.' },
  insufficient_evidence: { title: 'Insufficient evidence', detail: 'Critical catalog, credit, transfer or offering information is missing or unresolved, so no defensible conclusion is shown.' },
  known_constraints_block_current_plan: { title: 'Current plan conflicts with known rules', detail: 'Specific current selections violate sourced constraints. This is not a statement that no path exists.' },
  not_evaluated: { title: 'Not evaluated', detail: 'Required validated inputs are missing, the catalog is unsupported, or evaluation did not complete.' },
};

export const ORIGIN_LABEL: Record<PlanPlacement['origin'], string> = {
  student_selected: 'Student-selected',
  adopted_suggestion: 'PathCheck suggestion (adopted)',
  system_projection: 'Unadopted projection',
};

export const REPORT_LABEL: Record<AvailabilityEvidence['report'], string> = {
  listed: 'Listed', not_listed: 'Not listed', unknown: "Unknown / can't check",
};

export const SOURCE_KIND_LABEL: Record<SourceEvidence['kind'], string> = {
  official_catalog: 'Official catalog', departmental_guide: 'Departmental guide', department_confirmation: 'Department confirmation',
  user_attestation: 'User attestation', student_report: 'Student report', derived: 'Derived', synthetic: 'Synthetic (test only)',
};

export const VERIFICATION_LABEL: Record<SourceEvidence['verificationStatus'], string> = {
  documented: 'documented', verified: 'verified', user_attested: 'user-attested, not independently verified',
  disputed: 'disputed', unverified: 'unverified', synthetic: 'synthetic, not ASU policy',
};

export const RULESET_LABEL: Record<CatalogRef['ruleSetStatus'], string> = {
  verified: 'Verified rule set', provisional: 'Provisional rule set (not formally verified)', disputed: 'Disputed rule set',
  awaiting_document: 'Awaiting authoritative document', synthetic: 'Synthetic test rule set',
};

export const APPROVAL_LABEL: Record<CatalogModel['approval'], string> = {
  reviewed: 'Reviewed', user_provisional: 'User-approved provisional interpretation', unreviewed: 'Unreviewed', synthetic: 'Synthetic',
};

export function catalogYearLabel(ref: CatalogRef): string {
  return ref.catalogYearId ?? 'Not confirmed — governing catalog year unresolved';
}

export function programLabel(ref: CatalogRef): string {
  const institution = ref.institutionId === 'asu' ? 'Alabama State University' : ref.institutionId;
  const program = ref.programId === 'bs-cis' ? 'B.S. Computer Information Systems' : ref.programId;
  return `${institution} — ${program}`;
}

export function humanizeCode(code: string): string {
  const text = code.replace(/[_-]+/g, ' ').trim();
  return text.length === 0 ? code : text.charAt(0).toUpperCase() + text.slice(1);
}

/** Classifies a finding for display without changing its meaning. */
export function findingClass(f: RuleFinding): { label: string; tone: 'conflict' | 'potential' | 'unresolved' | 'info' } {
  if (f.status.status === 'unresolved') return { label: 'Unresolved', tone: 'unresolved' };
  if (f.severity === 'error' && f.status.status === 'unsatisfied' && !f.status.conditional) return { label: 'Known conflict', tone: 'conflict' };
  if (f.severity === 'info') return { label: 'Note', tone: 'info' };
  return { label: f.status.conditional ? 'Potential bottleneck (conditional)' : 'Potential issue', tone: 'potential' };
}

export function constraintText(f: RuleFinding): string {
  return `${f.status.status}${f.status.conditional ? ', conditional on future completion' : ''}`;
}

const FAILURE_TEXT: Partial<Record<TypedFailure['code'], string>> = {
  unavailable: 'This service is unavailable right now.',
  unresolved: 'This depends on unresolved academic policy, so no conclusion is shown.',
  validation_error: 'The input did not pass validation.',
  forbidden: 'You are not authorized to do that.',
  conflict: 'A newer version exists. Nothing was overwritten.',
  rate_limited: 'Too many requests. Try again later.',
  external_failure: 'An external service failed. Your local work is unchanged.',
  stale_preview: 'Something changed since this was calculated. Nothing was applied; review the refreshed analysis.',
  stale_undo: 'The plan changed after that step, so undo was refused to protect later edits.',
  known_hard_conflict: 'The engine found a known hard conflict, so the change was not applied.',
  search_interrupted: 'The search was interrupted. No feasibility conclusion was drawn and the active plan is unchanged.',
};

export function failureText(f: TypedFailure): string {
  return `${FAILURE_TEXT[f.code] ?? 'The request failed.'} (${f.reasonCode})`;
}

export function sourceLookup(catalog: CatalogModel | null) {
  const map = new Map((catalog?.catalogRef.sources ?? []).map(s => [s.sourceId, s]));
  return (ref: string): string => {
    const s = map.get(ref);
    return s ? `${SOURCE_KIND_LABEL[s.kind]}: ${s.description} (${VERIFICATION_LABEL[s.verificationStatus]})` : `Reference ${ref}`;
  };
}

export function courseTitle(catalog: CatalogModel | null, courseId: string): string {
  const c = catalog?.courses[courseId];
  return c ? `${c.displayCode} ${c.title}` : courseId;
}

/** Short code used where space is tight; the full title stays available nearby. */
export function courseCode(catalog: CatalogModel | null, courseId: string): string {
  return catalog?.courses[courseId]?.displayCode ?? courseId;
}

// Engine-internal references that mean nothing to a student; the summary already names the course/term.
const HIDDEN_PARAMS = new Set(['placementId', 'attemptId']);

/**
 * Finding explanation parameters for display: internal IDs are omitted, comma-joined course
 * IDs become display codes and coded values are humanized. Values are never reinterpreted.
 */
export function findingParams(finding: RuleFinding, catalog: CatalogModel | null): Array<[string, string]> {
  return Object.entries(finding.explanationParams)
    .filter(([k]) => !HIDDEN_PARAMS.has(k))
    .map(([k, v]): [string, string] => {
      if (typeof v !== 'string') return [humanizeCode(k), String(v)];
      const parts = v.split(',').filter(Boolean);
      if (parts.length > 0 && parts.every(id => catalog?.courses[id])) return [humanizeCode(k), parts.map(id => courseCode(catalog, id)).join(', ')];
      if (parts.length > 0 && parts.every(p => /^[a-z][a-z0-9_]*$/.test(p))) return [humanizeCode(k), parts.map(humanizeCode).join(', ')];
      return [humanizeCode(k), v];
    });
}

/** Where a finding applies, e.g. "SYN 301, SYN 201 in Spring 2027". */
export function findingScope(finding: RuleFinding, catalog: CatalogModel | null): string {
  const courses = finding.courseIds.map(id => courseCode(catalog, id)).join(', ');
  const terms = finding.termIds.map(termLabel).join(', ');
  return `${courses}${courses && terms ? ' in ' : ''}${terms}`;
}

export function courseCredits(catalog: CatalogModel | null, courseId: string): number | null {
  const c = catalog?.courses[courseId];
  return c && c.credits !== 'unknown' ? c.credits : null;
}

/** Locale-aware display of a contract timestamp; the ISO value stays in a time element. */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

// ---------------------------------------------------------------------------
// On-screen wording (UX-006 amendment). Plain-language renderings of the same coded
// values. The PDF export keeps the formal maps above, so these never change exported text.
// Every claim-bearing string is selected only from engine data; nothing is generated.
// ---------------------------------------------------------------------------

/** Outlook headline and one-line detail; `{target}` is replaced with the target term label. */
export const OUTLOOK_UI: Record<AnalysisResult['outlook']['kind'], { title: string; detail: string; tone: 'ok' | 'warn' | 'conflict' | 'neutral' }> = {
  conditional_path_found: { title: 'Reachable under current assumptions', detail: 'Your plan meets the modeled requirements by {target} if the assumptions below hold. Not a guarantee of offerings, seats or grades.', tone: 'ok' },
  target_at_risk: { title: '{target} is at risk', detail: 'The plan is tight or conflicts for this target. Another path may still exist.', tone: 'warn' },
  insufficient_evidence: { title: 'Not enough information to judge {target} yet', detail: 'Missing or unresolved catalog, credit, transfer or availability details prevent a conclusion.', tone: 'warn' },
  known_constraints_block_current_plan: { title: 'Conflicts in your current plan', detail: 'Some selected courses break modeled rules. This doesn’t mean {target} is out of reach.', tone: 'conflict' },
  not_evaluated: { title: 'PathCheck couldn’t check this plan yet', detail: 'Required inputs are missing, the catalog is unsupported, or the check didn’t finish.', tone: 'neutral' },
};

export function withTarget(text: string, target: string): string {
  return text.replaceAll('{target}', target);
}

/** Short issue titles for engine finding codes; unknown codes fall back to the humanized code. */
const FINDING_TITLE: Record<string, string> = {
  prerequisite_unsatisfied: 'Missing prerequisite',
  prerequisite_not_met: 'Missing prerequisite',
  prerequisite_unresolved: 'Prerequisite rule unknown',
  prerequisite_policy_unresolved: 'Prerequisite rule unknown',
  prerequisite_conditional: 'Prerequisite depends on a planned course',
  prerequisite_cycle: 'Prerequisite rules form a loop',
  offering_unknown: 'Availability not checked',
  reported_not_listed: 'You reported: not listed',
  reported_listed: 'You reported: listed',
  required_course_unplaced: 'Required course not planned',
  term_capacity_exceeded: 'Over the semester credit limit',
  term_capacity_unresolved: 'Semester credit limit unknown',
  capacity_is_assumption: 'Semester credit limit is assumed',
  course_credits_unknown: 'Course credits unknown',
  course_already_completed: 'Course already completed',
  duplicate_placement: 'Course planned twice',
  placement_after_target: 'Planned after your target term',
  repeat_policy_unresolved: 'Repeat policy unknown',
  attempt_status_unresolved: 'Course result unknown',
  record_items_unresolved: 'Unresolved record items',
  catalog_applicability_unverified: 'Catalog year not confirmed',
  potential_bottleneck: 'Possible bottleneck',
};

export function findingTitle(code: string): string {
  return FINDING_TITLE[code] ?? humanizeCode(code);
}

/** Display tone and word for a finding; same classification as findingClass, plainer words. */
export function findingMark(f: RuleFinding): { word: string; icon: string; tone: 'conflict' | 'potential' | 'unresolved' | 'info' } {
  const cls = findingClass(f);
  if (cls.tone === 'conflict') return { word: 'Conflict', icon: '⛔', tone: 'conflict' };
  if (cls.tone === 'unresolved') return { word: 'Unknown', icon: '?', tone: 'unresolved' };
  if (cls.tone === 'info') return { word: 'Note', icon: 'i', tone: 'info' };
  return { word: f.status.conditional ? 'Check (conditional)' : 'Check', icon: '⚠', tone: 'potential' };
}

/** Plain wording for engine and scenario assumption ids; unknown ids are humanized, never dropped. */
export function assumptionText(id: string, catalog: CatalogModel | null, capacity?: number): string {
  if (id === 'capacity:scenario_assumption' || id === 'capacity_scenario_assumption') return `Semester credit limit is assumed${capacity ? ` (${capacity} credits)` : ''}.`;
  if (id === 'capacity:student') return `Uses your semester credit limit${capacity ? ` (${capacity} credits)` : ''}.`;
  if (id.startsWith('availability:')) return 'Relies on availability you reported, which isn’t verified.';
  if (id === 'future_offerings_unknown') return 'Assumes future course offerings, which aren’t confirmed.';
  if (id === 'future_pass_assumed') return 'Assumes you pass the planned courses.';
  const pass = /^future_pass:(.+)$/.exec(id);
  if (pass) return `Assumes you pass ${courseCode(catalog, pass[1]!)}.`;
  const offering = /^offering_unknown:(.+)@(-?\d+)$/.exec(id);
  if (offering) {
    const idx = Number(offering[2]);
    const season = (['spring', 'summer', 'fall'] as const)[((idx % 3) + 3) % 3]!;
    return `${courseCode(catalog, offering[1]!)} availability for ${termLabel({ academicYear: Math.floor(idx / 3), season, sortIndex: idx })} hasn’t been checked.`;
  }
  return `${humanizeCode(id)}.`;
}

export type CatalogStatus = { short: string; message: string; tone: 'warn' | 'ok' };

/** Persistent catalog identification shown on every screen; derived only from the catalog's own status. */
export function catalogStatus(ref: CatalogRef, approval: CatalogModel['approval'] | null): CatalogStatus {
  if (ref.ruleSetStatus === 'synthetic' || approval === 'synthetic') return { short: 'Test catalog', message: 'Test catalog: synthetic data, not university policy.', tone: 'warn' };
  if (ref.ruleSetStatus === 'disputed') return { short: 'Disputed rules', message: 'Some catalog rules are disputed. Conclusions may change.', tone: 'warn' };
  if (ref.ruleSetStatus === 'awaiting_document') return { short: 'Catalog not confirmed', message: 'Waiting for the authoritative catalog document. Rules are not confirmed.', tone: 'warn' };
  if (ref.ruleSetStatus === 'provisional' || approval === 'user_provisional' || approval === 'unreviewed') return { short: 'Provisional catalog', message: 'Provisional interpretation. Not formally verified by the university.', tone: 'warn' };
  return { short: 'Verified catalog', message: 'Verified rule set.', tone: 'ok' };
}

export const ORIGIN_UI: Record<PlanPlacement['origin'], { tag: string | null; sr: string }> = {
  student_selected: { tag: null, sr: 'Your selection' },
  adopted_suggestion: { tag: 'Suggested', sr: 'Suggested by PathCheck, adopted' },
  system_projection: { tag: 'Draft', sr: 'Draft, not adopted' },
};

export const REPORT_UI: Record<AvailabilityEvidence['report'], { icon: string; text: string }> = {
  listed: { icon: '✓', text: 'You reported: Listed' },
  not_listed: { icon: '✕', text: 'You reported: Not listed' },
  unknown: { icon: '?', text: 'You reported: Can’t check' },
};

/** Plain text for E's per-row normalization warnings (`code:rowId`); unknown codes are humanized. */
const RECORD_NOTE: Record<string, string> = {
  unrecognized_grade: 'Grade not recognized, so it isn’t used.',
  status_grade_contradiction: 'Grade conflicts with the status.',
  status_inferred_from_earned_credits: 'Status was inferred from earned credits.',
  course_not_in_catalog: 'Course code isn’t in this catalog.',
  unparseable_course_code: 'Course code couldn’t be read.',
  transfer_equivalency_unverified: 'Transfer equivalency isn’t verified.',
  equivalency_unresolved: 'Equivalency is unresolved.',
  ambiguous_equivalency: 'More than one equivalency could apply.',
  credit_mismatch_with_catalog: 'Credits differ from the catalog.',
  earned_exceeds_attempted: 'Earned credits exceed attempted credits.',
  completed_without_earned_credits: 'Completed, but earned credits are missing.',
  status_credit_contradiction: 'Credits conflict with the status.',
  missing_term: 'Term is missing.',
  missing_status: 'Status is missing.',
  status_reported_unknown: 'Status is unknown.',
  institution_unknown: 'Institution is unknown.',
};
export function recordNote(code: string): string {
  return RECORD_NOTE[code] ?? `${humanizeCode(code)}.`;
}
/** Warnings that make a row's grade uncertain for the analysis. */
export const GRADE_NOTE_CODES = new Set(['unrecognized_grade', 'status_grade_contradiction', 'status_inferred_from_earned_credits']);

/** Concise titles for a group of same-kind findings; others fall back to "Title (n)". */
const GROUP_TITLE: Record<string, (n: number) => string> = {
  required_course_unplaced: n => `${n} required courses not planned`,
  offering_unknown: n => `${n} courses with availability not checked`,
  prerequisite_unresolved: n => `${n} prerequisite rules unknown`,
  prerequisite_policy_unresolved: n => `${n} prerequisite rules unknown`,
  course_credits_unknown: n => `${n} courses with unknown credits`,
};
export function groupTitle(code: string, n: number): string {
  return GROUP_TITLE[code]?.(n) ?? `${findingTitle(code)} (${n})`;
}
