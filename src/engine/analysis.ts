// Single composition point: every plan, preview, candidate and draft is judged by this.
import type { PlanPlacement, PlanningScenario, RuleFinding } from '../contracts';
import { computeAudit } from './audit';
import type { AuditDetail } from './audit';
import { dependencyInfo, pressureFindings } from './dependency';
import type { DependencyInfo } from './dependency';
import { isHard, recordAndCatalogGaps, validatePlacements } from './planCheck';

export interface PlanAnalysis {
  placements: PlanPlacement[]; audit: AuditDetail; info: DependencyInfo;
  planFindings: RuleFinding[]; gaps: RuleFinding[]; unselected: RuleFinding[]; bottlenecks: RuleFinding[]; hard: RuleFinding[];
}

export function analyzePlacements(scenario: PlanningScenario, placements: readonly PlanPlacement[]): PlanAnalysis {
  const { catalog, record, plan } = scenario;
  const ps = [...placements];
  const audit = computeAudit({ catalog, attempts: record.courseAttempts, placements: ps, targetSort: plan.targetTerm.sortIndex });
  const planFindings = validatePlacements(scenario, ps, audit);
  const gaps = recordAndCatalogGaps(scenario, audit);
  const info = dependencyInfo(scenario, audit, ps);
  const { unselected, bottlenecks } = pressureFindings(scenario, info, ps);
  return { placements: ps, audit, info, planFindings, gaps, unselected, bottlenecks, hard: planFindings.filter(isHard) };
}

/** Findings shown as before/after in previews: everything except catalog/record evidence gaps. */
export function issueFindings(a: PlanAnalysis): RuleFinding[] {
  return [...a.planFindings, ...a.unselected, ...a.bottlenecks];
}
export function satisfiedLeafCount(a: PlanAnalysis): number {
  let n = 0;
  for (const g of a.audit.outcomes.values()) if (g.active && g.status === 'satisfied') n++;
  return n;
}
