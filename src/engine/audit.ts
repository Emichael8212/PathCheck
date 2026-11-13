// Deterministic degree audit with unique credit allocation.
// Allocation: tiered augmenting-path matching (definite > conditional > unresolved) for
// course/choose_n slots, then min_credits from remaining units with bounded repair swaps.
// A unit (one catalog course's best evidence) is allocated to at most one credit-consuming
// requirement unless BOTH sides explicitly list each other in overlap.shared_with.
import type { CatalogModel, CourseAttempt, DegreeAudit, PlanPlacement, RequirementGroup } from '../contracts';
import { canonicalCourseCode } from './normalize';
import { requirementPoliciesUnmodeled } from './policy';
import { catalogBlocksConclusions, compareStrings, definitelyNotPassed, compareTuples, courseCredits, courseLevel, coursePrefix, uniqueSorted } from './util';

/** 0 = definite earned, 1 = conditional (in progress / planned), 2 = unresolved. */
export type Quality = 0 | 1 | 2;
export interface Unit {
  unitId: string; courseId: string | null; rawCode: string | null; quality: Quality; credits: number | null;
  attemptIds: string[]; placementIds: string[]; reasons: string[]; orphan: boolean;
}
export type GroupStatus = { status: 'satisfied' | 'unmet' | 'unresolved'; conditional: boolean };
export interface RequirementOutcome extends GroupStatus {
  requirementId: string; active: boolean; unitIds: string[]; reasons: string[];
  /** Definite applicable credits allocated to this leaf (null when unknown/not a credit leaf). */
  applicableCredits: number | null;
  /** Outstanding need for unmet leaves. */
  need: { courses: number; credits: number } | null;
}
export interface AuditDetail {
  audit: DegreeAudit;
  outcomes: Map<string, RequirementOutcome>;
  units: Map<string, Unit>;
  allocation: Map<string, string>; // unitId -> requirementId
  rootStatus: GroupStatus;
  blocked: boolean;
}
export interface AuditInput {
  catalog: CatalogModel; attempts: readonly CourseAttempt[];
  placements: readonly PlanPlacement[]; targetSort: number;
}

const maxQ = (a: Quality, b: Quality): Quality => (a > b ? a : b);
/** Work bound for joint alternative-selection enumeration (not an academic rule). */
export const MAX_ALTERNATIVE_SELECTIONS = 256;

/** More than one finished/recorded attempt of the same catalog course (in-progress excluded). */
export function isRepeat(own: readonly CourseAttempt[]): boolean {
  return own.filter(a => a.status !== 'in_progress').length > 1;
}

export function buildUnits(input: AuditInput): Unit[] {
  const { catalog, attempts } = input;
  const units: Unit[] = [];
  for (const courseId of Object.keys(catalog.courses).sort(compareStrings)) {
    const own = attempts.filter(a => a.normalizedCourseId === courseId);
    const planned = input.placements.filter(p => p.courseId === courseId && p.termId.sortIndex <= input.targetSort);
    const reasons: string[] = []; let quality: Quality | null = null, credits: number | null = null; const attemptIds: string[] = [];
    const definite = own.filter(a => a.status === 'completed' && a.earnedCredits !== null && a.earnedCredits > 0 && a.confidence !== 'unresolved');
    // Untrusted failed/withdrawn rows (e.g. status contradicting earned credit) stay possible
    // evidence at unresolved quality, so the requirement is never reported as a definite gap.
    const unresolvedDone = own.filter(a => (a.status === 'completed' && (a.earnedCredits === null || a.confidence === 'unresolved')) || a.status === 'incomplete' || a.status === 'unknown' || a.status === 'transfer_pending'
      || ((a.status === 'failed' || a.status === 'withdrawn') && !definitelyNotPassed(a)));
    const inProgress = own.filter(a => a.status === 'in_progress');
    const pick = (list: CourseAttempt[]) => [...list].sort((a, b) => compareTuples([b.term?.sortIndex ?? -1, a.attemptId], [a.term?.sortIndex ?? -1, b.attemptId]))[0]!;
    if (definite.length) { const a = pick(definite); quality = 0; credits = a.earnedCredits; attemptIds.push(a.attemptId); }
    else if (inProgress.length) { const a = pick(inProgress); quality = 1; credits = courseCredits(catalog, courseId) ?? a.attemptedCredits; attemptIds.push(a.attemptId); reasons.push('in_progress_not_earned'); }
    else if (unresolvedDone.length) { const a = pick(unresolvedDone); quality = 2; credits = a.earnedCredits ?? courseCredits(catalog, courseId); attemptIds.push(a.attemptId); reasons.push(`attempt_${a.status}_unresolved`); }
    // contracts-v1 cannot express a SOURCED repeat-credit rule, and absence of a policy gap is
    // not evidence of one. Any repeated (non-in-progress) attempt therefore stays unresolved.
    if (quality !== null && isRepeat(own)) {
      quality = 2; reasons.push('repeat_policy_unresolved'); attemptIds.splice(0, attemptIds.length, ...own.map(a => a.attemptId).sort(compareStrings));
    }
    const placementIds = planned.map(p => p.placementId).sort(compareStrings);
    if (quality === null || quality === 2) {
      if (planned.length) { quality = 1; credits = courseCredits(catalog, courseId); reasons.push('planned_future_completion'); }
    }
    if (quality === null) continue;
    if (credits === null) reasons.push('credits_unknown');
    units.push({ unitId: `unit:${courseId}`, courseId, rawCode: null, quality, credits, attemptIds, placementIds: quality === 0 ? [] : placementIds, reasons: uniqueSorted(reasons), orphan: false });
  }
  for (const a of [...attempts].sort((x, y) => compareStrings(x.attemptId, y.attemptId))) {
    if (a.normalizedCourseId !== null || definitelyNotPassed(a)) continue;
    units.push({ unitId: `orphan:${a.attemptId}`, courseId: null, rawCode: canonicalCourseCode(a.rawCourseCode), quality: 2, credits: a.earnedCredits ?? a.attemptedCredits, attemptIds: [a.attemptId], placementIds: [], reasons: [a.origin === 'transfer' ? 'transfer_equivalency_unverified' : 'unmapped_attempt'], orphan: true });
  }
  return units;
}

/** Quality with which a unit may stand for catalog course `target` (null if it cannot). */
export function edgeQuality(catalog: CatalogModel, unit: Unit, target: string): Quality | null {
  // Unmapped/transfer work never counts definitively. A raw code that matches the target, or a
  // historical code with ANY catalog equivalency entry to it, stays a possible-but-unresolved match.
  if (unit.orphan) return unit.rawCode === target || catalog.equivalencies.some(e => e.fromCourseId === unit.rawCode && e.toCourseId === target) ? 2 : null;
  if (unit.courseId === target) return unit.quality;
  let best: Quality | null = null;
  for (const e of catalog.equivalencies) if (e.fromCourseId === unit.courseId && e.toCourseId === target) {
    const q = e.status === 'verified' ? unit.quality : maxQ(unit.quality, 2);
    if (best === null || q < best) best = q;
  }
  return best;
}

function collectCourses(groups: Map<string, RequirementGroup>, id: string, seen = new Set<string>()): string[] {
  if (seen.has(id)) return []; seen.add(id);
  const g = groups.get(id); if (!g) return [];
  if (g.kind === 'course') return [g.courseId];
  if (g.kind === 'all') return g.requirementIds.flatMap(c => collectCourses(groups, c, seen));
  if (g.kind === 'choose_n') return [...g.courseIds, ...g.requirementIds.flatMap(c => collectCourses(groups, c, seen))];
  if (g.kind === 'min_credits') return g.courseIds;
  return [];
}

export function excludedCourses(groups: Map<string, RequirementGroup>, g: Extract<RequirementGroup, { kind: 'min_credits' }>): Set<string> {
  return new Set(g.eligibility ? g.eligibility.excludeRequirementIds.flatMap(id => collectCourses(groups, id)) : []);
}

export function minCreditsEligibility(catalog: CatalogModel, groups: Map<string, RequirementGroup>, g: Extract<RequirementGroup, { kind: 'min_credits' }>, unit: Unit): Quality | null {
  const excluded = excludedCourses(groups, g);
  const code = unit.courseId ?? unit.rawCode;
  if (code !== null && excluded.has(code)) return null;
  let best: Quality | null = null;
  for (const c of g.courseIds) { const q = edgeQuality(catalog, unit, c); if (q !== null && (best === null || q < best)) best = q; }
  if (best !== null) return best;
  const el = g.eligibility; if (!el || code === null) return null;
  const level = courseLevel(code); if (level === null || level < el.minLevel || level > el.maxLevel) return null;
  if (unit.orphan) return 2;
  if (el.subjectPrefixes !== null) return el.subjectPrefixes.includes(coursePrefix(code)) ? unit.quality : null;
  // A college-scoped rule without an authoritative prefix list cannot be decided definitively.
  return el.collegeId !== null ? 2 : unit.quality;
}

function sharePermission(a: RequirementGroup, b: RequirementGroup): 'allowed' | 'forbidden' | 'unresolved' {
  if (a.overlap.mode === 'forbidden' || b.overlap.mode === 'forbidden') return 'forbidden';
  if (a.overlap.mode === 'shared_with' && b.overlap.mode === 'shared_with' && a.overlap.requirementIds.includes(b.requirementId) && b.overlap.requirementIds.includes(a.requirementId)) return 'allowed';
  return 'unresolved';
}

type MatchLeaf = Extract<RequirementGroup, { kind: 'course' }> | Extract<RequirementGroup, { kind: 'choose_n' }>;
interface Slot { leaf: MatchLeaf; index: number; key: string }

export function computeAudit(input: AuditInput): AuditDetail {
  const { catalog } = input;
  const groups = new Map(catalog.requirementGroups.map(g => [g.requirementId, g]));
  const order = new Map(catalog.requirementGroups.map((g, i) => [g.requirementId, i]));
  const units = buildUnits(input);
  const unitMap = new Map(units.map(u => [u.unitId, u]));
  const blocked = catalogBlocksConclusions(catalog) || requirementPoliciesUnmodeled(catalog);

  // `deactivated` holds parent>child edges of unchosen alternatives.
  const activeSet = (deactivated: Set<string>): Set<string> => {
    const out = new Set<string>();
    const visit = (id: string) => {
      if (out.has(id)) return; out.add(id);
      const g = groups.get(id);
      if (g?.kind === 'all' || g?.kind === 'choose_n') g.requirementIds.forEach(c => { if (!deactivated.has(`${id}>${c}`)) visit(c); });
    };
    visit(catalog.rootRequirementId); return out;
  };

  const run = (deactivated: Set<string>) => {
    const active = activeSet(deactivated);
    const leafEligible = (g: RequirementGroup, u: Unit): Quality | null => {
      if (g.kind === 'course') return edgeQuality(catalog, u, g.courseId);
      if (g.kind === 'choose_n') { let b: Quality | null = null; for (const c of g.courseIds) { const q = edgeQuality(catalog, u, c); if (q !== null && (b === null || q < b)) b = q; } return b; }
      if (g.kind === 'min_credits') return minCreditsEligibility(catalog, groups, g, u);
      return null;
    };
    const creditLeaves = catalog.requirementGroups.filter(g => active.has(g.requirementId) && g.consumesCredits && (g.kind === 'course' || (g.kind === 'choose_n' && g.courseIds.length > 0) || g.kind === 'min_credits'));
    const flexibility = new Map(units.map(u => [u.unitId, creditLeaves.filter(g => leafEligible(g, u) !== null).length]));
    const slots: Slot[] = [];
    for (const g of creditLeaves) {
      if (g.kind === 'course') slots.push({ leaf: g, index: 0, key: `${g.requirementId}#0` });
      else if (g.kind === 'choose_n') for (let i = 0; i < g.count; i++) slots.push({ leaf: g, index: i, key: `${g.requirementId}#${i}` });
    }
    const slotAssign = new Map<string, { unitId: string; q: Quality }>(), unitSlot = new Map<string, Slot>();
    const candidates = (s: Slot) => units.map(u => ({ u, q: leafEligible(s.leaf, u) })).filter((x): x is { u: Unit; q: Quality } => x.q !== null)
      .sort((a, b) => compareTuples([a.q, flexibility.get(a.u.unitId)!, a.u.unitId], [b.q, flexibility.get(b.u.unitId)!, b.u.unitId]));
    const tryAssign = (s: Slot, cap: Quality, visited: Set<string>): boolean => {
      for (const { u, q } of candidates(s)) {
        if (q > cap || visited.has(u.unitId)) continue;
        visited.add(u.unitId);
        const other = unitSlot.get(u.unitId);
        if (!other || tryAssign(other, slotAssign.get(other.key)!.q, visited)) {
          slotAssign.set(s.key, { unitId: u.unitId, q }); unitSlot.set(u.unitId, s); return true;
        }
      }
      return false;
    };
    for (const tier of [0, 1, 2] as Quality[]) for (const s of slots) if (!slotAssign.has(s.key)) tryAssign(s, tier, new Set());
    // Re-tighten qualities after re-routing (a re-routed unit carries its own edge quality).
    for (const s of slots) { const a = slotAssign.get(s.key); if (a) a.q = leafEligible(s.leaf, unitMap.get(a.unitId)!)!; }

    const allocation = new Map<string, string>(), allocQ = new Map<string, Quality>();
    for (const [unitId, s] of unitSlot) { allocation.set(unitId, s.leaf.requirementId); allocQ.set(unitId, slotAssign.get(s.key)!.q); }
    const minSel = new Map<string, string[]>();
    const minLeaves = creditLeaves.filter((g): g is Extract<RequirementGroup, { kind: 'min_credits' }> => g.kind === 'min_credits');
    const creditOf = (u: Unit) => u.credits ?? 0;
    const selectMin = (g: Extract<RequirementGroup, { kind: 'min_credits' }>) => {
      const pool = units.filter(u => !allocation.has(u.unitId) && minCreditsEligibility(catalog, groups, g, u) !== null)
        .map(u => ({ u, q: (u.credits === null ? 2 : minCreditsEligibility(catalog, groups, g, u)!) as Quality }))
        .sort((a, b) => compareTuples([a.q, -creditOf(a.u), a.u.unitId], [b.q, -creditOf(b.u), b.u.unitId]));
      const chosen: string[] = []; let credits = 0;
      for (const { u, q } of pool) { if (credits >= g.minimum && chosen.length >= g.minCourses) break; chosen.push(u.unitId); credits += creditOf(u); allocation.set(u.unitId, g.requirementId); allocQ.set(u.unitId, q); }
      minSel.set(g.requirementId, chosen); return credits >= g.minimum && chosen.length >= g.minCourses;
    };
    for (const g of minLeaves) {
      let ok = selectMin(g);
      // Bounded repair: free an eligible unit held by a matching slot when another unit can take that slot.
      for (let guard = 0; !ok && guard < units.length; guard++) {
        let swapped = false;
        for (const s of slots) {
          const a = slotAssign.get(s.key); if (!a) continue;
          const held = unitMap.get(a.unitId)!;
          if (minCreditsEligibility(catalog, groups, g, held) === null) continue;
          const repl = candidates(s).find(c => c.q <= a.q && !allocation.has(c.u.unitId));
          if (!repl) continue;
          for (const id of minSel.get(g.requirementId) ?? []) { allocation.delete(id); allocQ.delete(id); }
          allocation.delete(held.unitId); allocQ.delete(held.unitId); unitSlot.delete(held.unitId);
          slotAssign.set(s.key, { unitId: repl.u.unitId, q: repl.q }); unitSlot.set(repl.u.unitId, s); allocation.set(repl.u.unitId, s.leaf.requirementId); allocQ.set(repl.u.unitId, repl.q);
          swapped = true; ok = selectMin(g); break;
        }
        if (!swapped) break;
      }
    }

    const outcomes = new Map<string, RequirementOutcome>();
    const leafOutcome = (g: RequirementGroup): RequirementOutcome => {
      const base = { requirementId: g.requirementId, active: active.has(g.requirementId), reasons: [] as string[], need: null as RequirementOutcome['need'], applicableCredits: null as number | null };
      if (g.kind === 'course' || (g.kind === 'choose_n' && g.courseIds.length > 0)) {
        const needSlots = g.kind === 'course' ? 1 : g.count;
        let chosen: Array<{ unitId: string; q: Quality }>;
        if (g.consumesCredits && base.active) chosen = slots.filter(s => s.leaf.requirementId === g.requirementId).map(s => slotAssign.get(s.key)).filter((x): x is { unitId: string; q: Quality } => !!x);
        // Constraint-only checks may inspect any unit. An inactive credit-consuming leaf is a
        // what-if view and may only use units no active requirement holds (never feeds a parent).
        else chosen = units.filter(u => !g.consumesCredits || !allocation.has(u.unitId)).map(u => ({ unitId: u.unitId, q: leafEligible(g, u) })).filter((x): x is { unitId: string; q: Quality } => x.q !== null).sort((a, b) => compareTuples([a.q, a.unitId], [b.q, b.unitId])).slice(0, needSlots);
        let overlapUnresolved = false;
        if (chosen.length < needSlots && g.consumesCredits) {
          for (const u of units) {
            if (chosen.length >= needSlots) break;
            const holder = allocation.get(u.unitId); const q = leafEligible(g, u);
            if (!holder || holder === g.requirementId || q === null || chosen.some(c => c.unitId === u.unitId)) continue;
            const perm = sharePermission(g, groups.get(holder)!);
            if (perm === 'allowed') chosen.push({ unitId: u.unitId, q }); else if (perm === 'unresolved') overlapUnresolved = true;
          }
        }
        const worst = chosen.reduce<Quality>((w, c) => maxQ(w, c.q), 0);
        const st: GroupStatus = chosen.length >= needSlots ? { status: worst === 2 ? 'unresolved' : 'satisfied', conditional: worst === 1 } : { status: overlapUnresolved ? 'unresolved' : 'unmet', conditional: false };
        const definite = chosen.filter(c => c.q === 0).map(c => unitMap.get(c.unitId)!);
        return { ...base, ...st, unitIds: chosen.map(c => c.unitId).sort(compareStrings), reasons: uniqueSorted([...chosen.flatMap(c => unitMap.get(c.unitId)!.reasons), ...(overlapUnresolved ? ['overlap_permission_unresolved'] : [])]),
          applicableCredits: g.consumesCredits && definite.every(u => u.credits !== null) ? definite.reduce((s, u) => s + (u.credits ?? 0), 0) : null,
          need: chosen.length < needSlots ? { courses: needSlots - chosen.length, credits: 0 } : null };
      }
      if (g.kind === 'min_credits') {
        let chosenIds = g.consumesCredits && base.active ? (minSel.get(g.requirementId) ?? []) : units.filter(u => (!g.consumesCredits || !allocation.has(u.unitId)) && minCreditsEligibility(catalog, groups, g, u) !== null).map(u => u.unitId);
        let overlapUnresolved = false;
        const sum = (ids: string[], maxQual: Quality) => ids.map(id => unitMap.get(id)!).filter(u => u.credits !== null && minCreditsEligibility(catalog, groups, g, u)! <= maxQual);
        const totals = (ids: string[]) => ([0, 1, 2] as Quality[]).map(q => { const us = sum(ids, q); return { credits: us.reduce((s, u) => s + (u.credits ?? 0), 0), count: us.length }; });
        let t = totals(chosenIds);
        const meets = (x: { credits: number; count: number }) => x.credits >= g.minimum && x.count >= g.minCourses;
        if (!meets(t[2]!) && g.consumesCredits) {
          for (const u of units) {
            const holder = allocation.get(u.unitId);
            if (!holder || holder === g.requirementId || minCreditsEligibility(catalog, groups, g, u) === null) continue;
            const perm = sharePermission(g, groups.get(holder)!);
            if (perm === 'allowed') chosenIds = [...chosenIds, u.unitId]; else if (perm === 'unresolved') overlapUnresolved = true;
          }
          t = totals(chosenIds);
        }
        const nullCredit = chosenIds.some(id => unitMap.get(id)!.credits === null);
        // With an incomplete eligible-course inventory, a free course outside the known predicate
        // (and not a required/excluded course) might still count: unresolved, never automatically unmet.
        const excluded = excludedCourses(groups, g);
        const inventoryCandidate = g.eligibility?.inventoryStatus === 'unresolved' && units.some(u => !allocation.has(u.unitId) && !chosenIds.includes(u.unitId)
          && minCreditsEligibility(catalog, groups, g, u) === null && !excluded.has((u.courseId ?? u.rawCode) ?? ''));
        const st: GroupStatus = meets(t[0]!) ? { status: 'satisfied', conditional: false } : meets(t[1]!) ? { status: 'satisfied', conditional: true }
          : meets(t[2]!) || nullCredit || overlapUnresolved || inventoryCandidate ? { status: 'unresolved', conditional: false } : { status: 'unmet', conditional: false };
        const reasons = uniqueSorted([...chosenIds.flatMap(id => unitMap.get(id)!.reasons), ...(overlapUnresolved ? ['overlap_permission_unresolved'] : []), ...(g.eligibility?.inventoryStatus === 'unresolved' ? ['elective_inventory_unresolved'] : []), ...(inventoryCandidate ? ['elective_eligibility_unresolved_candidate'] : [])]);
        return { ...base, ...st, unitIds: [...chosenIds].sort(compareStrings), reasons, applicableCredits: g.consumesCredits ? t[0]!.credits : null,
          need: st.status === 'unmet' ? { credits: Math.max(0, g.minimum - t[2]!.credits), courses: Math.max(0, g.minCourses - t[2]!.count) } : null };
      }
      return { ...base, status: 'unmet', conditional: false, unitIds: [] };
    };
    const rankOf = (s: GroupStatus) => s.status === 'satisfied' ? (s.conditional ? 1 : 0) : s.status === 'unresolved' ? 2 : 3;
    const fromRank = (r: number): GroupStatus => r === 0 ? { status: 'satisfied', conditional: false } : r === 1 ? { status: 'satisfied', conditional: true } : r === 2 ? { status: 'unresolved', conditional: false } : { status: 'unmet', conditional: false };
    const evalGroup = (id: string): RequirementOutcome => {
      const cached = outcomes.get(id); if (cached) return cached;
      const g = groups.get(id)!;
      let out: RequirementOutcome;
      if (g.kind === 'all' || (g.kind === 'choose_n' && g.requirementIds.length > 0)) {
        // Parents aggregate ONLY the alternatives selected in this pass: an unchosen alternative's
        // what-if outcome must never satisfy its parent (forbidden credit-reuse regression).
        const kids = g.requirementIds.filter(c => !deactivated.has(`${id}>${c}`)).map(evalGroup);
        g.requirementIds.forEach(evalGroup);
        const ranks = kids.map(rankOf).sort((a, b) => a - b);
        const r = g.kind === 'all' ? (ranks.length ? ranks[ranks.length - 1]! : 0) : (ranks[g.count - 1] ?? 3);
        const unitIds = uniqueSorted(kids.flatMap(k => k.unitIds));
        out = { requirementId: id, active: active.has(id), ...fromRank(r), unitIds, reasons: [], applicableCredits: null, need: null };
      } else if (g.kind === 'total_degree_credits') {
        const allocated = [...allocation.keys()].map(k => unitMap.get(k)!);
        const by = (q: Quality) => allocated.filter(u => allocQ.get(u.unitId)! <= q && u.credits !== null).reduce((s, u) => s + u.credits!, 0);
        // Unallocated recorded/planned credit (unmapped work OR excess catalog courses) may count
        // toward the total only under an unsourced applicability rule: it can make the total
        // unresolved, never satisfied, and must never be silently dropped into a definite `unmet`.
        const free = units.filter(u => !allocation.has(u.unitId));
        const orphanPool = free.filter(u => u.orphan).reduce((s, u) => s + (u.credits ?? 0), 0);
        const catalogPool = free.filter(u => !u.orphan).reduce((s, u) => s + (u.credits ?? 0), 0);
        const pool = orphanPool + catalogPool;
        const unknownCredits = allocated.some(u => u.credits === null);
        const st: GroupStatus = by(0) >= g.minimum ? { status: 'satisfied', conditional: false } : by(1) >= g.minimum ? { status: 'satisfied', conditional: true }
          : by(2) + pool >= g.minimum || unknownCredits ? { status: 'unresolved', conditional: false } : { status: 'unmet', conditional: false };
        const reasons = [...(orphanPool > 0 ? ['unmapped_credits_applicability_unknown'] : []), ...(catalogPool > 0 ? ['unallocated_credits_applicability_unknown'] : [])];
        out = { requirementId: id, active: active.has(id), ...st, unitIds: [], reasons, applicableCredits: by(0),
          need: st.status === 'unmet' ? { credits: g.minimum - by(2) - pool, courses: 0 } : null };
      } else out = leafOutcome(g);
      if (g.uncertainty !== 'documented' && out.status === 'satisfied') out = { ...out, status: 'unresolved', conditional: false, reasons: uniqueSorted([...out.reasons, `requirement_${g.uncertainty}`]) };
      outcomes.set(id, out); return out;
    };
    for (const g of catalog.requirementGroups) evalGroup(g.requirementId);
    return { outcomes, allocation, allocQ, active };
  };

  // Alternative selection: every subgroup choose_n keeps exactly `count` children. Each joint
  // selection is allocated and evaluated independently (no unit can serve an unchosen branch);
  // the best root outcome wins under a deterministic tie-break. Enumeration is bounded; beyond
  // the bound a greedy selection is used and a definite `unmet` is downgraded to `unresolved`.
  const rankOf = (s: GroupStatus) => s.status === 'satisfied' ? (s.conditional ? 1 : 0) : s.status === 'unresolved' ? 2 : 3;
  const choosers = catalog.requirementGroups.filter((g): g is Extract<RequirementGroup, { kind: 'choose_n' }> => g.kind === 'choose_n' && g.requirementIds.length > 0)
    .sort((a, b) => order.get(a.requirementId)! - order.get(b.requirementId)!);
  const combos = (ids: string[], k: number): string[][] => {
    if (k === 0) return [[]]; if (ids.length < k) return [];
    const [head, ...rest] = ids as [string, ...string[]];
    return [...combos(rest, k - 1).map(c => [head, ...c]), ...combos(rest, k)];
  };
  const keepSets = choosers.map(g => combos(g.requirementIds, g.count));
  const totalSelections = keepSets.reduce((p, s) => p * Math.max(1, s.length), 1);
  type Pass = ReturnType<typeof run>;
  const progressOf = (pass: Pass, deactivated: Set<string>): number => {
    const leafProgress = (id: string): number => {
      const o = pass.outcomes.get(id)!; const g = groups.get(id)!;
      if (g.kind === 'all') return g.requirementIds.reduce((s, c) => s + leafProgress(c), 0) / Math.max(1, g.requirementIds.length);
      return o.status === 'satisfied' ? 1 : o.status === 'unresolved' ? 0.5 : 0;
    };
    let sum = 0;
    for (const g of choosers) if (pass.active.has(g.requirementId)) for (const c of g.requirementIds) if (!deactivated.has(`${g.requirementId}>${c}`)) sum += leafProgress(c);
    return sum;
  };
  const edgesFor = (choice: number[]): Set<string> => {
    const out = new Set<string>();
    choosers.forEach((g, i) => { const keep = new Set(keepSets[i]![choice[i]!] ?? g.requirementIds); g.requirementIds.forEach(c => { if (!keep.has(c)) out.add(`${g.requirementId}>${c}`); }); });
    return out;
  };
  let pass: Pass; let selectionBounded = false;
  if (choosers.length === 0) pass = run(new Set());
  else if (totalSelections <= MAX_ALTERNATIVE_SELECTIONS) {
    let best: { pass: Pass; rank: (number | string)[] } | null = null; const seen = new Set<string>();
    const choice = choosers.map(() => 0);
    for (let n = 0; n < totalSelections; n++) {
      let rem = n; for (let i = choosers.length - 1; i >= 0; i--) { const size = Math.max(1, keepSets[i]!.length); choice[i] = rem % size; rem = Math.floor(rem / size); }
      const deactivated = edgesFor(choice);
      // Selections differing only inside inactive branches are equivalent; evaluate once.
      const reach = activeSet(deactivated);
      const key = [...deactivated].filter(e => reach.has(e.split('>')[0]!)).sort(compareStrings).join('|');
      if (seen.has(key)) continue; seen.add(key);
      const p = run(deactivated);
      const rank = [rankOf(p.outcomes.get(catalog.rootRequirementId)!), -progressOf(p, deactivated), n];
      if (!best || compareTuples(rank, best.rank) < 0) best = { pass: p, rank };
    }
    pass = best!.pass;
  } else {
    // Greedy fallback: rank alternatives in an all-active pass, then evaluate that one selection.
    selectionBounded = true;
    const probe = run(new Set());
    const deactivated = new Set<string>();
    for (const g of choosers) {
      const ranked = g.requirementIds.map(id => ({ id, r: rankOf(probe.outcomes.get(id)!), o: order.get(id)! })).sort((a, b) => compareTuples([a.r, a.o], [b.r, b.o]));
      ranked.slice(g.count).forEach(x => deactivated.add(`${g.requirementId}>${x.id}`));
    }
    pass = run(deactivated);
  }

  let root = pass.outcomes.get(catalog.rootRequirementId)!;
  if (selectionBounded && root.status === 'unmet') {
    root = { ...root, status: 'unresolved', reasons: uniqueSorted([...root.reasons, 'alternative_selection_search_bounded']) };
    pass.outcomes.set(catalog.rootRequirementId, root);
  }
  const unitsOf = (o: RequirementOutcome) => o.unitIds.map(id => unitMap.get(id)!);
  const credLeafIds = new Set(catalog.requirementGroups.filter(g => g.consumesCredits && g.kind !== 'all' && g.kind !== 'total_degree_credits').map(g => g.requirementId));
  const applicable = [...pass.allocation.entries()].filter(([u, req]) => credLeafIds.has(req) && pass.allocQ.get(u) === 0).map(([u]) => unitMap.get(u)!);
  const completed = input.attempts.filter(a => a.status === 'completed');
  const completedKeys = completed.map(a => a.normalizedCourseId ?? canonicalCourseCode(a.rawCourseCode) ?? a.attemptId);
  const repeatedCompleted = new Set(completedKeys).size !== completedKeys.length;
  const audit: DegreeAudit = {
    requirements: catalog.requirementGroups.map(g => {
      const o = pass.outcomes.get(g.requirementId)!; const us = unitsOf(o);
      return { requirementId: g.requirementId, status: o.status, attemptIds: uniqueSorted(us.flatMap(u => u.attemptIds)), placementIds: uniqueSorted(us.flatMap(u => u.placementIds)),
        conditional: o.conditional, applicableCredits: o.applicableCredits, sourceRefs: [...g.sourceRefs] };
    }),
    // Raw earned credit; null when unknown or when repeats could double count without a sourced policy.
    earnedCredits: completed.some(a => a.earnedCredits === null) || repeatedCompleted ? null : completed.reduce((s, a) => s + (a.earnedCredits ?? 0), 0),
    applicableCredits: applicable.some(u => u.credits === null) ? null : applicable.reduce((s, u) => s + (u.credits ?? 0), 0),
    disputedRules: uniqueSorted([...catalog.requirementGroups.filter(g => g.uncertainty === 'disputed').map(g => g.requirementId), ...catalog.policyGaps.filter(g => g.blocksConclusions).map(g => g.policyId)]),
    // Satisfied only for definite, non-conditional completion under an unblocked catalog.
    totalStatus: root.status === 'unresolved' || (root.status === 'satisfied' && blocked && !root.conditional) ? 'unresolved'
      : root.status === 'satisfied' && !root.conditional ? 'satisfied' : 'unmet',
  };
  return { audit, outcomes: pass.outcomes, units: unitMap, allocation: pass.allocation, rootStatus: { status: root.status, conditional: root.conditional }, blocked };
}
