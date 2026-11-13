// Three-valued prerequisite/corequisite evaluator over the catalog Boolean expression tree.
// OR branches are never flattened into mandatory edges; unresolved nodes never pass through.
import type { CatalogModel, CourseAttempt, PlanPlacement, PrerequisiteExpr } from '../contracts';
import { canonicalCourseCode } from './normalize';
import { compareStrings, definitelyNotPassed, definitelyNotPassedUnmapped, uniqueSorted } from './util';

export type Status = 'satisfied' | 'unsatisfied' | 'unresolved';
export interface PrereqResult {
  status: Status; conditional: boolean;
  /** Reason codes explaining the outcome, sorted and unique. */
  reasons: string[];
  /** Assumption IDs (future passes, concurrent enrollment) this outcome depends on. */
  assumptions: string[];
  /** Courses whose absence/late placement causes an unsatisfied necessary branch. */
  missing: string[];
}
export interface PrereqContext {
  catalog: CatalogModel;
  attempts: readonly CourseAttempt[];
  /** Placements considered as planned future enrollment (active plan, preview or draft). */
  placements: readonly Pick<PlanPlacement, 'courseId' | 'termId'>[];
  gradeIndex: ReadonlyMap<string, number> | null;
}
export function gradeIndexOf(catalog: CatalogModel): Map<string, number> | null {
  return catalog.gradeScale ? new Map(catalog.gradeScale.ordered.map((g, i) => [g.toUpperCase(), i])) : null;
}

const rank = (r: PrereqResult) => r.status === 'satisfied' ? (r.conditional ? 1 : 0) : r.status === 'unresolved' ? 2 : 3;
const sat = (conditional: boolean, reasons: string[], assumptions: string[] = []): PrereqResult => ({ status: 'satisfied', conditional, reasons, assumptions, missing: [] });
const unres = (reasons: string[]): PrereqResult => ({ status: 'unresolved', conditional: false, reasons, assumptions: [], missing: [] });
const unsat = (reasons: string[], missing: string[]): PrereqResult => ({ status: 'unsatisfied', conditional: false, reasons, assumptions: [], missing });
function best(results: PrereqResult[], fallback: PrereqResult): PrereqResult {
  let out = fallback;
  for (const r of results) if (rank(r) < rank(out)) out = r;
  return out;
}

/** Catalog courses whose attempts may stand for `courseId`, with equivalency quality. */
export function satisfyingSources(catalog: CatalogModel, courseId: string): Array<{ courseId: string; verified: boolean }> {
  const out = [{ courseId, verified: true }];
  for (const e of catalog.equivalencies) {
    if (e.toCourseId !== courseId || e.fromCourseId === courseId || !catalog.courses[e.fromCourseId]) continue;
    out.push({ courseId: e.fromCourseId, verified: e.status === 'verified' });
  }
  return out.sort((a, b) => compareStrings(a.courseId, b.courseId));
}

function gradeCheck(ctx: PrereqContext, grade: string | null, minGrade: string | null): 'ok' | 'below' | 'unknown' {
  if (minGrade === null) return 'ok';
  if (ctx.gradeIndex === null || grade === null) return 'unknown';
  const g = ctx.gradeIndex.get(grade.toUpperCase()), m = ctx.gradeIndex.get(minGrade.toUpperCase());
  if (g === undefined || m === undefined) return 'unknown';
  return g <= m ? 'ok' : 'below';
}

function attemptResult(ctx: PrereqContext, a: CourseAttempt, termSort: number, minGrade: string | null, verified: boolean, allowPrior: boolean): PrereqResult | null {
  // A failed/withdrawn row is only a definite "not passed" when normalization trusted it; an
  // unresolved one (e.g. status contradicting earned credit) withholds certainty, never passes.
  const notPassed = a.status === 'failed' || a.status === 'withdrawn';
  if (definitelyNotPassed(a)) return unsat(['prerequisite_attempt_not_passed'], []);
  if (a.term === null) return unres(['prerequisite_attempt_term_unknown']);
  if (a.term.sortIndex >= termSort) return null;
  if (!allowPrior) return null;
  if (notPassed) return unres(['prerequisite_attempt_unresolved']);
  const tag = verified ? [] : ['equivalency_unresolved'];
  if (a.status === 'in_progress') {
    const r = sat(true, ['depends_on_in_progress_pass', ...tag], [`future_pass:${a.normalizedCourseId ?? a.attemptId}`]);
    return verified ? r : unres(r.reasons);
  }
  if (a.status !== 'completed') return unres([`prerequisite_attempt_${a.status}`]);
  if (a.earnedCredits === null) return unres(['prerequisite_earned_credit_unknown']);
  if (a.confidence === 'unresolved') return unres(['prerequisite_attempt_unresolved']);
  if (a.earnedCredits === 0) return unsat(['prerequisite_no_credit_earned'], []);
  const g = gradeCheck(ctx, a.grade, minGrade);
  if (g === 'below') return unsat(['grade_below_minimum'], []);
  if (g === 'unknown') return unres(['minimum_grade_unverifiable']);
  return verified ? sat(false, ['prerequisite_completed']) : unres(['equivalency_unresolved']);
}

function courseNode(ctx: PrereqContext, courseId: string, minGrade: string | null, termSort: number): PrereqResult {
  const results: PrereqResult[] = [];
  for (const src of satisfyingSources(ctx.catalog, courseId)) {
    for (const a of ctx.attempts) if (a.normalizedCourseId === src.courseId) {
      const r = attemptResult(ctx, a, termSort, minGrade, src.verified, true); if (r) results.push(r);
    }
    for (const p of ctx.placements) if (p.courseId === src.courseId) {
      if (p.termId.sortIndex < termSort) results.push(src.verified ? sat(true, ['depends_on_future_pass'], [`future_pass:${src.courseId}`]) : unres(['equivalency_unresolved']));
      else results.push(unsat([p.termId.sortIndex === termSort ? 'prerequisite_same_term' : 'prerequisite_later_term'], [courseId]));
    }
  }
  // Transfer work with a matching raw code is never assumed equivalent.
  for (const a of ctx.attempts) {
    if (a.normalizedCourseId === null && a.origin === 'transfer' && !definitelyNotPassedUnmapped(a) && canonicalCourseCode(a.rawCourseCode) === courseId) results.push(unres(['transfer_equivalency_unverified']));
  }
  const fallback = unsat(['prerequisite_missing'], [courseId]);
  const b = best(results, fallback);
  if (b.status === 'unsatisfied') return unsat(uniqueSorted(results.length ? results.flatMap(r => r.reasons) : fallback.reasons), [courseId]);
  return b;
}

function coreqNode(ctx: PrereqContext, courseId: string, policy: { concurrencyAllowed: boolean; priorCompletionAllowed: boolean }, termSort: number): PrereqResult {
  const results: PrereqResult[] = [];
  for (const src of satisfyingSources(ctx.catalog, courseId)) {
    for (const a of ctx.attempts) if (a.normalizedCourseId === src.courseId) {
      if (policy.priorCompletionAllowed) { const r = attemptResult(ctx, a, termSort, null, src.verified, true); if (r && r.status !== 'unsatisfied') results.push(r); }
      if (policy.concurrencyAllowed && a.status === 'in_progress' && a.term?.sortIndex === termSort) results.push(src.verified ? sat(true, ['concurrent_enrollment'], [`future_pass:${src.courseId}`]) : unres(['equivalency_unresolved']));
    }
    for (const p of ctx.placements) if (p.courseId === src.courseId) {
      const t = p.termId.sortIndex;
      if (t === termSort && policy.concurrencyAllowed) results.push(src.verified ? sat(true, ['concurrent_enrollment'], [`concurrent:${src.courseId}`]) : unres(['equivalency_unresolved']));
      else if (t < termSort && policy.priorCompletionAllowed) results.push(src.verified ? sat(true, ['depends_on_future_pass'], [`future_pass:${src.courseId}`]) : unres(['equivalency_unresolved']));
    }
  }
  return best(results, unsat([policy.concurrencyAllowed ? 'corequisite_missing' : 'corequisite_prior_completion_missing'], [courseId]));
}

export function evaluatePrerequisite(expr: PrerequisiteExpr, termSort: number, ctx: PrereqContext): PrereqResult {
  switch (expr.kind) {
    case 'course': return courseNode(ctx, expr.courseId, expr.minGrade, termSort);
    case 'corequisite': return coreqNode(ctx, expr.courseId, expr.policy, termSort);
    case 'unresolved': return unres(['prerequisite_rule_unresolved']);
    case 'all': {
      const rs = expr.children.map(c => evaluatePrerequisite(c, termSort, ctx));
      const failed = rs.filter(r => r.status === 'unsatisfied');
      if (failed.length) return unsat(uniqueSorted(failed.flatMap(r => r.reasons)), uniqueSorted(failed.flatMap(r => r.missing)));
      if (rs.some(r => r.status === 'unresolved')) return { ...unres(uniqueSorted(rs.filter(r => r.status === 'unresolved').flatMap(r => r.reasons))), assumptions: uniqueSorted(rs.flatMap(r => r.assumptions)) };
      return sat(rs.some(r => r.conditional), uniqueSorted(rs.flatMap(r => r.reasons)), uniqueSorted(rs.flatMap(r => r.assumptions)));
    }
    case 'any': {
      const rs = expr.children.map(c => evaluatePrerequisite(c, termSort, ctx));
      const b = best(rs, unsat(['no_alternative_satisfied'], []));
      if (b.status !== 'unsatisfied') return b;
      // Every branch definitively failed; report each branch's missing courses as alternatives.
      return unsat(uniqueSorted(rs.flatMap(r => r.reasons)), uniqueSorted(rs.flatMap(r => r.missing)));
    }
  }
}

/** Courses that are required on every satisfying branch (no OR flattening). */
export function necessaryCourses(expr: PrerequisiteExpr): { prior: Set<string>; coreq: Set<string> } {
  switch (expr.kind) {
    case 'course': return { prior: new Set([expr.courseId]), coreq: new Set() };
    case 'corequisite': return { prior: new Set(), coreq: new Set([expr.courseId]) };
    case 'unresolved': return { prior: new Set(), coreq: new Set() };
    case 'all': {
      const prior = new Set<string>(), coreq = new Set<string>();
      for (const c of expr.children) { const n = necessaryCourses(c); n.prior.forEach(x => prior.add(x)); n.coreq.forEach(x => coreq.add(x)); }
      return { prior, coreq };
    }
    case 'any': {
      const parts = expr.children.map(necessaryCourses);
      const inter = (sets: Set<string>[]) => new Set([...(sets[0] ?? [])].filter(x => sets.every(s => s.has(x))));
      return { prior: inter(parts.map(p => p.prior)), coreq: inter(parts.map(p => p.coreq)) };
    }
  }
}
export function mentionedCourses(expr: PrerequisiteExpr): string[] {
  switch (expr.kind) {
    case 'all': case 'any': return uniqueSorted(expr.children.flatMap(mentionedCourses));
    case 'unresolved': return [];
    case 'course': case 'corequisite': return [expr.courseId];
  }
}
export function containsUnresolved(expr: PrerequisiteExpr): boolean {
  return expr.kind === 'unresolved' || ((expr.kind === 'all' || expr.kind === 'any') && expr.children.some(containsUnresolved));
}

/**
 * Strongly connected components over necessary prior-term and corequisite edges.
 * A component is impossible only if it contains a prior-term edge; pure corequisite
 * loops (legitimate concurrent pairs) are not cycles.
 */
export function impossibleCycles(catalog: CatalogModel): string[][] {
  const ids = Object.keys(catalog.courses).sort(compareStrings);
  const edges = new Map<string, Array<{ to: string; prior: boolean }>>();
  for (const id of ids) {
    const n = necessaryCourses(catalog.courses[id]!.prerequisite);
    edges.set(id, [...[...n.prior].map(to => ({ to, prior: true })), ...[...n.coreq].map(to => ({ to, prior: false }))].sort((a, b) => compareStrings(a.to, b.to)));
  }
  let index = 0; const idx = new Map<string, number>(), low = new Map<string, number>(), stack: string[] = [], on = new Set<string>(); const comps: string[][] = [];
  const strong = (v: string): void => {
    idx.set(v, index); low.set(v, index); index++; stack.push(v); on.add(v);
    for (const { to } of edges.get(v) ?? []) {
      if (!idx.has(to)) { strong(to); low.set(v, Math.min(low.get(v)!, low.get(to)!)); }
      else if (on.has(to)) low.set(v, Math.min(low.get(v)!, idx.get(to)!));
    }
    if (low.get(v) === idx.get(v)) { const comp: string[] = []; let w: string; do { w = stack.pop()!; on.delete(w); comp.push(w); } while (w !== v); comps.push(comp.sort(compareStrings)); }
  };
  for (const id of ids) if (!idx.has(id)) strong(id);
  return comps.filter(comp => { const s = new Set(comp); return comp.some(v => (edges.get(v) ?? []).some(e => e.prior && s.has(e.to))); })
    .sort((a, b) => compareStrings(a[0]!, b[0]!));
}
