import type { CandidatePreview, PlanPlacement, RuleFinding, TermId } from '../contracts';

export interface TermColumn {
  term: TermId;
  active: PlanPlacement[];
  projected: PlanPlacement[];
}

/** Groups active placements and (separately) unadopted projections by modeled term. */
export function timelineColumns(terms: readonly TermId[], active: readonly PlanPlacement[], projected: readonly PlanPlacement[]): TermColumn[] {
  return terms.map(t => ({
    term: t,
    active: active.filter(p => p.termId.sortIndex === t.sortIndex),
    projected: projected.filter(p => p.termId.sortIndex === t.sortIndex),
  }));
}

const findingKey = (f: RuleFinding): string =>
  [f.code, f.courseIds.join(','), f.termIds.map(t => t.sortIndex).join(','), f.requirementIds.join(',')].join('|');

export interface FindingDelta { resolved: RuleFinding[]; introduced: RuleFinding[]; persisting: RuleFinding[] }

/** Presents the engine's before/after findings as a delta; it does not rescore them. */
export function findingDelta(preview: Pick<CandidatePreview, 'before' | 'after'>): FindingDelta {
  const before = new Map(preview.before.map(f => [findingKey(f), f]));
  const after = new Map(preview.after.map(f => [findingKey(f), f]));
  return {
    resolved: [...before].filter(([k]) => !after.has(k)).map(([, f]) => f),
    introduced: [...after].filter(([k]) => !before.has(k)).map(([, f]) => f),
    persisting: [...after].filter(([k]) => before.has(k)).map(([, f]) => f),
  };
}

export interface ChangeRow { verb: 'Add' | 'Move' | 'Remove' | 'Swap'; courseId: string; before: TermId | null; after: TermId | null }

/**
 * Exact course/term before -> after rows for a change set, read from the active plan and
 * the engine's proposed placements. Presentation only; never re-derives validity.
 */
export function describeChanges(preview: Pick<CandidatePreview, 'changeSet' | 'proposedPlacements'>, active: readonly PlanPlacement[]): ChangeRow[] {
  const now = (id: string) => active.find(p => p.placementId === id);
  const proposed = (id: string) => preview.proposedPlacements.find(p => p.placementId === id);
  const rows: ChangeRow[] = [];
  for (const op of preview.changeSet.operations) {
    if (op.kind === 'add') rows.push({ verb: 'Add', courseId: op.placement.courseId, before: null, after: op.placement.termId });
    else if (op.kind === 'move') {
      const p = now(op.placementId) ?? proposed(op.placementId);
      rows.push({ verb: 'Move', courseId: p?.courseId ?? op.placementId, before: now(op.placementId)?.termId ?? null, after: op.termId });
    } else if (op.kind === 'remove') {
      const p = now(op.placementId);
      rows.push({ verb: 'Remove', courseId: p?.courseId ?? op.placementId, before: p?.termId ?? null, after: null });
    } else {
      const a = now(op.firstPlacementId), b = now(op.secondPlacementId);
      rows.push({ verb: 'Swap', courseId: a?.courseId ?? op.firstPlacementId, before: a?.termId ?? null, after: b?.termId ?? null });
      rows.push({ verb: 'Swap', courseId: b?.courseId ?? op.secondPlacementId, before: b?.termId ?? null, after: a?.termId ?? null });
    }
  }
  return rows;
}

/** Sum of known credits for placements in one term; unknown credits are counted separately. */
export function termLoad(placements: readonly PlanPlacement[], creditsOf: (courseId: string) => number | null): { known: number; unknown: number } {
  let known = 0, unknown = 0;
  for (const p of placements) { const c = creditsOf(p.courseId); if (c === null) unknown++; else known += c; }
  return { known, unknown };
}

export function previewNeedsAcknowledgement(preview: Pick<CandidatePreview, 'assumptions' | 'validabilityStatus'>): boolean {
  return preview.assumptions.length > 0 || preview.validabilityStatus === 'conditional' || preview.validabilityStatus === 'unresolved';
}
