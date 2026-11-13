// Bounded, deterministic beam search (search-v1 / lexicographic-v1).
// One layer per modeled term; each state expansion proposes a small fixed set of
// term-fill variants. Budgets are work counts (expansions, beam width, horizon), never
// wall time. Chunked stepping preserves expansion order, so results are identical.
import type { PlanPlacement, PlanningScenario, TypedFailure } from '../contracts';
import { computeAudit } from './audit';
import type { AuditDetail } from './audit';
import { dependencyInfo, outstandingDemands } from './dependency';
import type { Demand, DependencyInfo } from './dependency';
import { availabilityFor, isHard, validatePlacements } from './planCheck';
import { evaluatePrerequisite, gradeIndexOf } from './prerequisites';
import { compareStrings, compareTuples, courseCredits, uniqueSorted } from './util';

export type StopReason = 'qualifying_candidate' | 'expansion_limit' | 'beam_exhausted' | 'horizon_limit';
export type SearchOutcome =
  | { kind: 'found'; placements: PlanPlacement[]; assumptions: string[]; expansions: number; stopReason: 'qualifying_candidate'; unplannable: Demand[] }
  | { kind: 'none'; expansions: number; stopReason: Exclude<StopReason, 'qualifying_candidate'>; unplannable: Demand[] };
export interface DraftSearch {
  /** Run at most `maxExpansions` further expansions (chunking). */
  step(maxExpansions: number): { done: false; expansions: number } | { done: true; outcome: SearchOutcome };
  /** External watchdog/cancellation. Never an academic conclusion. */
  cancel(): TypedFailure;
}
interface Tracker { course: boolean[]; remCourses: number[]; remCredits: number[] }
interface State {
  added: PlanPlacement[]; cursor: number; load: number[]; tracker: Tracker; assumptions: string[]; key: string;
}

export interface SearchSetup { scenario: PlanningScenario; fixed: PlanPlacement[]; placementPrefix: string; origin: PlanPlacement['origin']; active: boolean }

export function createSearch(setup: SearchSetup): DraftSearch {
  const { scenario, fixed } = setup;
  const { catalog, record, plan } = scenario;
  const opts = scenario.searchOptions;
  const terms = scenario.assumptions.terms;
  const baseAudit: AuditDetail = computeAudit({ catalog, attempts: record.courseAttempts, placements: fixed, targetSort: plan.targetTerm.sortIndex });
  const info: DependencyInfo = dependencyInfo(scenario, baseAudit, fixed);
  const demands = info.demands.filter(d => d.plannable);
  const unplannable = info.demands.filter(d => !d.plannable);
  const lastIndex = Math.min(info.targetInHorizon ? info.targetIndex : terms.length - 1, opts.horizonTerms - 1, terms.length - 1);
  const gradeIndex = gradeIndexOf(catalog);
  const satisfied = new Set<string>();
  for (const u of baseAudit.units.values()) if (u.courseId && u.schedulingQuality <= 1) satisfied.add(u.courseId);
  const fixedCourses = new Set(fixed.map(p => p.courseId));
  const demandCount = new Map<string, number>();
  for (const d of demands) for (const c of d.options) demandCount.set(c, (demandCount.get(c) ?? 0) + 1);
  const candidatesAll = uniqueSorted([...demands.flatMap(d => d.options), ...info.mandatory]).filter(c => !satisfied.has(c) && !fixedCourses.has(c) && courseCredits(catalog, c) !== null);
  const pressure = (c: string) => info.pressure.get(c);
  const orders: string[][] = [
    [...candidatesAll].sort((a, b) => compareTuples([pressure(a)?.latest ?? 99, -(pressure(a)?.dependents.length ?? 0), -(demandCount.get(a) ?? 0), a], [pressure(b)?.latest ?? 99, -(pressure(b)?.dependents.length ?? 0), -(demandCount.get(b) ?? 0), b])),
    [...candidatesAll].sort((a, b) => compareTuples([-(demandCount.get(a) ?? 0), pressure(a)?.latest ?? 99, a], [-(demandCount.get(b) ?? 0), pressure(b)?.latest ?? 99, b])),
  ];
  const capOf = (i: number) => scenario.assumptions.creditCapacity.find(c => c.termId.sortIndex === terms[i]!.sortIndex)!.maximum;
  const initialLoad = terms.map(t => fixed.filter(p => p.termId.sortIndex === t.sortIndex).reduce((s, p) => s + (courseCredits(catalog, p.courseId) ?? 0), 0)
    + record.courseAttempts.filter(a => a.status === 'in_progress' && a.term?.sortIndex === t.sortIndex && !fixed.some(p => p.courseId === a.normalizedCourseId)).reduce((s, a) => s + (a.attemptedCredits ?? 0), 0));

  const cloneTracker = (t: Tracker): Tracker => ({ course: [...t.course], remCourses: [...t.remCourses], remCredits: [...t.remCredits] });
  const applyCourse = (t: Tracker, c: string) => {
    const credits = courseCredits(catalog, c) ?? 0; let consumed = false;
    demands.forEach((d, i) => {
      if (!d.options.includes(c)) return;
      const open = d.kind === 'course' ? !t.course[i] : t.remCourses[i]! > 0 || t.remCredits[i]! > 0;
      if (!open || (!d.constraintOnly && consumed)) return;
      if (d.kind === 'course') t.course[i] = true;
      else { t.remCourses[i] = Math.max(0, t.remCourses[i]! - 1); if (d.kind === 'credits') t.remCredits[i] = Math.max(0, t.remCredits[i]! - credits); }
      if (!d.constraintOnly) consumed = true;
    });
  };
  const helps = (t: Tracker, c: string) => demands.some((d, i) => d.options.includes(c) && (d.kind === 'course' ? !t.course[i] : t.remCourses[i]! > 0 || t.remCredits[i]! > 0));
  const need = (t: Tracker) => demands.reduce((s, d, i) => s + (d.kind === 'course' ? (t.course[i] ? 0 : 1) : Math.max(t.remCourses[i]!, Math.ceil(t.remCredits[i]! / 3))), 0);
  const placementsOf = (s: Pick<State, 'added'>) => [...fixed, ...s.added];
  const keyOf = (added: PlanPlacement[]) => added.map(p => `${p.termId.sortIndex}:${p.courseId}`).sort(compareStrings).join('|');

  const evalAt = (c: string, termIdx: number, ps: Pick<PlanPlacement, 'courseId' | 'termId'>[]) =>
    evaluatePrerequisite(catalog.courses[c]!.prerequisite, terms[termIdx]!.sortIndex, { catalog, attempts: record.courseAttempts, placements: ps, gradeIndex });
  const mkPlacement = (c: string, i: number): PlanPlacement => ({ placementId: `${setup.placementPrefix}-${c}-${terms[i]!.sortIndex}`, courseId: c, termId: terms[i]!, origin: setup.origin, active: setup.active });

  /** Try to add course (plus concurrently required corequisites) to term i. */
  const tryBundle = (state: State, chosen: PlanPlacement[], c: string, i: number, load: number): { bundle: string[]; assumptions: string[]; credits: number } | null => {
    const placedNow = new Set([...placementsOf(state), ...chosen].map(p => p.courseId));
    let bundle = [c];
    for (let round = 0; round < 3; round++) {
      const hypo = [...placementsOf(state), ...chosen, ...bundle.map(b => mkPlacement(b, i))];
      const extra: string[] = []; let blocked = false; const assumptions: string[] = [];
      for (const b of bundle) {
        const r = evalAt(b, i, hypo.filter(p => !(p.courseId === b && p.termId.sortIndex === terms[i]!.sortIndex)));
        if (r.status === 'unsatisfied') {
          const coreqs = r.missing.filter(m => !placedNow.has(m) && !bundle.includes(m) && candidatesAll.includes(m) && r.reasons.includes('corequisite_missing'));
          if (coreqs.length) extra.push(...coreqs); else blocked = true;
        } else { assumptions.push(...r.assumptions); if (r.status === 'unresolved') assumptions.push(`prerequisite_unresolved:${b}`); }
      }
      if (blocked) return null;
      if (!extra.length) {
        for (const b of bundle) {
          const ev = availabilityFor(plan.availabilityEvidence, b, terms[i]!.sortIndex);
          if (ev?.report === 'not_listed') return null;
          if (ev?.report !== 'listed') assumptions.push(`offering_unknown:${b}@${terms[i]!.sortIndex}`);
          else assumptions.push(`student_reported_listed:${b}@${terms[i]!.sortIndex}`);
        }
        const credits = bundle.reduce((s, b) => s + (courseCredits(catalog, b) ?? 0), 0);
        return load + credits <= capOf(i) ? { bundle, assumptions, credits } : null;
      }
      bundle = uniqueSorted([...bundle, ...extra]);
    }
    return null;
  };

  const fillTerm = (state: State, order: string[], limit: number, preferListed: boolean): { chosen: PlanPlacement[]; tracker: Tracker; load: number; assumptions: string[] } => {
    const i = state.cursor; const tracker = cloneTracker(state.tracker); const chosen: PlanPlacement[] = []; const assumptions: string[] = [];
    let load = state.load[i]!;
    const placed = new Set(placementsOf(state).map(p => p.courseId));
    const seq = preferListed ? [...order].sort((a, b) => (availabilityFor(plan.availabilityEvidence, a, terms[i]!.sortIndex)?.report === 'listed' ? 0 : 1) - (availabilityFor(plan.availabilityEvidence, b, terms[i]!.sortIndex)?.report === 'listed' ? 0 : 1)) : order;
    for (const c of seq) {
      if (load >= limit) break;
      if (placed.has(c) || chosen.some(p => p.courseId === c)) continue;
      if (!helps(tracker, c) && !(info.mandatory.has(c))) continue;
      const b = tryBundle(state, chosen, c, i, load);
      if (!b || load + b.credits > limit) continue;
      for (const x of b.bundle) { chosen.push(mkPlacement(x, i)); applyCourse(tracker, x); }
      load += b.credits; assumptions.push(...b.assumptions);
    }
    return { chosen, tracker, load, assumptions };
  };

  const score = (s: State): (number | string)[] => {
    const placed = new Set(placementsOf(s).map(p => p.courseId));
    const late = [...info.mandatory].filter(c => !placed.has(c) && !satisfied.has(c) && (pressure(c)?.latest ?? Infinity) < s.cursor).length;
    const loads = s.load.slice(0, lastIndex + 1);
    return [late, need(s.tracker), s.assumptions.length, Math.max(0, ...loads), loads.reduce((a, l) => a + l * l, 0), s.key];
  };
  const expand = (s: State): State[] => {
    const i = s.cursor; if (i > lastIndex) return [];
    const remainingTerms = lastIndex - i + 1;
    const remCredits = need(s.tracker) * 3;
    const balanced = Math.max(1, Math.ceil(remCredits / remainingTerms));
    const variants = [
      fillTerm(s, orders[0]!, capOf(i), false), fillTerm(s, orders[1]!, capOf(i), false),
      fillTerm(s, orders[0]!, capOf(i), true), fillTerm(s, orders[0]!, Math.min(capOf(i), s.load[i]! + balanced), false),
    ];
    const out: State[] = []; const seen = new Set<string>();
    for (const v of variants) {
      const added = [...s.added, ...v.chosen]; const key = `${keyOf(added)}#${i + 1}`;
      if (seen.has(key)) continue; seen.add(key);
      const load = [...s.load]; load[i] = v.load;
      out.push({ added, cursor: i + 1, load, tracker: v.tracker, assumptions: uniqueSorted([...s.assumptions, ...v.assumptions]), key });
    }
    return out;
  };
  const qualifies = (s: State): boolean => {
    if (need(s.tracker) > 0) return false;
    const ps = placementsOf(s);
    const audit = computeAudit({ catalog, attempts: record.courseAttempts, placements: ps, targetSort: plan.targetTerm.sortIndex });
    // Same full validator; pre-existing conflicts among fixed student placements are not attributed to the search.
    const addedIds = new Set(s.added.map(p => p.placementId)), addedCourses = new Set(s.added.map(p => p.courseId));
    if (validatePlacements(scenario, ps, audit).some(f => isHard(f) && (addedIds.has(String(f.explanationParams.placementId)) || (f.code === 'term_capacity_exceeded' && f.courseIds.some(c => addedCourses.has(c)))))) return false;
    return outstandingDemands(scenario, audit).every(d => !d.plannable);
  };

  const init: State = { added: [], cursor: 0, load: initialLoad, tracker: { course: demands.map(() => false), remCourses: demands.map(d => d.needCourses), remCredits: demands.map(d => d.needCredits) }, assumptions: [], key: '' };
  let beam: State[] = [init]; let next: State[] = []; let pos = 0; let expansions = 0; let finished: SearchOutcome | null = null; let cancelled = false;
  const found = (s: State): SearchOutcome => ({ kind: 'found', placements: s.added, assumptions: s.assumptions, expansions, stopReason: 'qualifying_candidate', unplannable });
  if (qualifies(init)) finished = found(init);

  return {
    step(chunk: number) {
      if (cancelled) throw new Error('search cancelled');
      let used = 0;
      while (!finished) {
        if (pos >= beam.length) {
          if (!next.length) { finished = { kind: 'none', expansions, stopReason: beam.some(s => s.cursor <= lastIndex) ? 'beam_exhausted' : 'horizon_limit', unplannable }; break; }
          const dedup = new Map<string, State>(); for (const s of next) if (!dedup.has(s.key)) dedup.set(s.key, s);
          beam = [...dedup.values()].sort((a, b) => compareTuples(score(a), score(b))).slice(0, opts.beamWidth);
          next = []; pos = 0;
          const q = beam.find(qualifies); if (q) { finished = found(q); break; }
          continue;
        }
        if (expansions >= opts.maxExpansions) { finished = { kind: 'none', expansions, stopReason: 'expansion_limit', unplannable }; break; }
        if (used >= chunk) return { done: false, expansions };
        const s = beam[pos++]!; expansions++; used++;
        next.push(...expand(s));
      }
      return { done: true, outcome: finished };
    },
    cancel() { cancelled = true; return { ok: false, code: 'search_interrupted', reasonCode: 'search_interrupted_not_evaluated' }; },
  };
}

export function runSearch(setup: SearchSetup): SearchOutcome {
  const s = createSearch(setup);
  for (;;) { const r = s.step(Number.MAX_SAFE_INTEGER); if (r.done) return r.outcome; }
}
