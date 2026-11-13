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
