// Consumer of the evidence-backed `CatalogModel.repeatCreditPolicy` (ARCHITECTURE §Repeat-credit
// representation). Credit allocation ONLY: never GPA/grade replacement, transfer equivalency,
// prerequisite satisfaction or minimum-grade applicability.
//
// Supported rule (the only one the contract can express): for each EXPLICITLY scoped course,
// credit counts once, from the latest attempt whose grade is listed in `qualifyingGrades`
// (case-insensitive). Everything the rule does not determine stays unresolved:
//  - omitted/null policy, or a course outside `courseIds` (never catalog-wide by default);
//  - an attempt reached through a historical/equivalent code (scope lists catalog IDs only);
//  - an attempt that cannot be ordered or classified (unknown term, same-term duplicate,
//    unresolved confidence, unknown/incomplete/transfer status, unrecognized grade, contradictory
//    failure/credit evidence);
//  - recorded attempts with no qualifying grade and no pending retake.
import type { CatalogModel, CourseAttempt } from '../contracts';
import { canonicalCourseCode } from './normalize';
import { compareStrings, courseCredits } from './util';

export type RepeatResolution =
  | { kind: 'unresolved'; reasons: string[] }
  /** No credit-bearing evidence at all (e.g. only definite failures/withdrawals). */
  | { kind: 'none' }
  | {
    kind: 'resolved';
    /** 0 = credit from a recorded qualifying attempt; 1 = conditional on a pending qualifying retake. */
    quality: 0 | 1; credits: number | null;
    /** The single attempt whose credit counts (empty when only a planned placement is pending). */
    attemptIds: string[]; reasons: string[];
  };

export type RepeatScope = 'none' | 'out_of_scope' | 'in_scope';
export function repeatPolicyScope(catalog: CatalogModel, courseId: string): RepeatScope {
  const p = catalog.repeatCreditPolicy;
  if (!p) return 'none';
  return p.courseIds.includes(courseId) ? 'in_scope' : 'out_of_scope';
}

/**
 * Resolve a projected repeat of `courseId` under the sourced policy. `own` are every recorded
 * attempt normalized to the course; `plannedCount` counts placements up to the audit target.
 */
export function resolveRepeat(catalog: CatalogModel, courseId: string, own: readonly CourseAttempt[], plannedCount: number): RepeatResolution {
  const scope = repeatPolicyScope(catalog, courseId);
  if (scope !== 'in_scope') return { kind: 'unresolved', reasons: scope === 'out_of_scope' ? ['repeat_policy_out_of_scope'] : [] };
  const policy = catalog.repeatCreditPolicy!;
  const scale = catalog.gradeScale ? new Set(catalog.gradeScale.ordered.map(g => g.toUpperCase())) : null;
  if (!scale) return { kind: 'unresolved', reasons: ['repeat_grade_scale_missing'] };
  const qualifying = new Set(policy.qualifyingGrades.map(g => g.toUpperCase()));
  const catalogCredits = courseCredits(catalog, courseId);
  const zeroCreditCourse = catalogCredits === 0;
  const reasons = new Set<string>();

  // The scope names catalog course IDs; a row reaching this course through another code is a
  // cross-code repeat the policy does not address.
  if (own.some(a => canonicalCourseCode(a.rawCourseCode) !== courseId)) reasons.add('repeat_policy_equivalency_unresolved');
  // Equivalency-linked catalog courses with their own work are also outside the rule; the
  // caller checks those with `equivalentCourseActivity`.
  const terms = new Set<number>();
  for (const a of own) {
    if (a.term === null) { reasons.add('repeat_attempt_order_unknown'); continue; }
    if (terms.has(a.term.sortIndex)) reasons.add('repeat_attempt_order_ambiguous');
    terms.add(a.term.sortIndex);
    if (a.confidence === 'unresolved') { reasons.add('repeat_attempt_unresolved'); continue; }
    const grade = a.grade === null ? null : a.grade.toUpperCase();
    switch (a.status) {
      case 'completed':
        if (grade === null || !scale.has(grade)) reasons.add('repeat_grade_unrecognized');
        if (a.earnedCredits === null || (a.earnedCredits === 0 && !zeroCreditCourse)) reasons.add('repeat_attempt_credit_unresolved');
        break;
      case 'failed': case 'withdrawn':
        // A qualifying grade or positive earned credit contradicts a non-passing status.
        if ((grade !== null && qualifying.has(grade)) || (a.earnedCredits !== null && a.earnedCredits > 0)) reasons.add('repeat_attempt_contradictory');
        break;
      case 'in_progress': break;
      default: reasons.add('repeat_attempt_unresolved');
    }
  }
  if (reasons.size) return { kind: 'unresolved', reasons: [...reasons].sort(compareStrings) };

  const bySortDesc = (a: CourseAttempt, b: CourseAttempt) => b.term!.sortIndex - a.term!.sortIndex;
  const qualified = own.filter(a => a.status === 'completed' && qualifying.has(a.grade!.toUpperCase())).sort(bySortDesc);
  const inProgress = own.filter(a => a.status === 'in_progress').sort(bySortDesc);
  const pending = inProgress.length + plannedCount > 0;
  const selected = qualified[0];
  if (selected) {
    // Credit counts once whichever qualifying attempt is ultimately latest. With a pending retake
    // the counted amount is only definite when the retake cannot change it (known catalog credit
    // equal to the selected attempt's earned credit).
    if (pending && (catalogCredits === null || catalogCredits !== selected.earnedCredits)) return { kind: 'unresolved', reasons: ['repeat_pending_credit_unresolved'] };
    return { kind: 'resolved', quality: 0, credits: selected.earnedCredits, attemptIds: [selected.attemptId], reasons: ['repeat_policy_applied', ...(pending ? ['repeat_pending_attempt'] : [])] };
  }
  if (pending) {
    // Conditional on the pending retake earning a qualifying grade (future-pass assumption).
    const ip = inProgress[0];
    return { kind: 'resolved', quality: 1, credits: catalogCredits ?? ip?.attemptedCredits ?? null, attemptIds: ip ? [ip.attemptId] : [],
      reasons: ['repeat_policy_applied', 'repeat_requires_qualifying_grade', ip ? 'in_progress_not_earned' : 'planned_future_completion'] };
  }
  // Recorded credit-bearing completions without a qualifying grade: the rule selects nothing.
  if (own.some(a => a.status === 'completed')) return { kind: 'unresolved', reasons: ['repeat_no_qualifying_attempt'] };
  return { kind: 'none' };
}

/** True when another catalog course linked to `courseId` by any equivalency has recorded/planned work. */
export function equivalentCourseActivity(catalog: CatalogModel, courseId: string, hasActivity: (otherCourseId: string) => boolean): boolean {
  const linked = new Set<string>();
  for (const e of catalog.equivalencies) {
    if (e.toCourseId === courseId && e.fromCourseId !== courseId) linked.add(e.fromCourseId);
    if (e.fromCourseId === courseId && e.toCourseId !== courseId) linked.add(e.toCourseId);
  }
  return [...linked].some(id => catalog.courses[id] !== undefined && hasActivity(id));
}
