// Pure helpers for the deterministic academic engine. No clock, network, randomness or I/O.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { canonicalJson } from '../contracts';
import type { CatalogModel, CourseAttempt, CourseDefinition, RuleFinding, TermId } from '../contracts';

export const ENGINE_VERSION = 'pathcheck-engine-v1';

export function digest(value: unknown): string {
  return bytesToHex(sha256(new TextEncoder().encode(canonicalJson(value))));
}
export function shortDigest(value: unknown, length = 16): string { return digest(value).slice(0, length); }

/** Stable identifier inside IdSchema's 160 character limit. */
export function stableId(prefix: string, parts: readonly (string | number)[]): string {
  const raw = [prefix, ...parts].join(':');
  return raw.length <= 160 ? raw : `${prefix}:${shortDigest(parts, 32)}`;
}

export function compareStrings(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
export function compareTuples(a: readonly (number | string)[], b: readonly (number | string)[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return compareStrings(String(x), String(y));
  }
  return 0;
}
export function uniqueSorted(values: Iterable<string>): string[] { return [...new Set(values)].sort(compareStrings); }

export function courseLevel(courseId: string): number | null {
  const match = /-([0-9]{3})[A-Z]?$/.exec(courseId);
  return match ? Math.floor(Number(match[1]) / 100) * 100 : null;
}
export function coursePrefix(courseId: string): string { return courseId.split('-')[0] ?? courseId; }
/**
 * Failed/withdrawn attempt that can be set aside as definitely not counting. Mapped attempts rely
 * on normalization's confidence. Unmapped/transfer attempts are always `unresolved` (mapping), so
 * only their own fields can show a status/credit contradiction (positive earned credit).
 */
export function definitelyNotPassed(a: Pick<CourseAttempt, 'status' | 'confidence' | 'earnedCredits' | 'normalizedCourseId'>): boolean {
  if (a.status !== 'failed' && a.status !== 'withdrawn') return false;
  return a.normalizedCourseId === null ? definitelyNotPassedUnmapped(a) : a.confidence !== 'unresolved';
}
export function definitelyNotPassedUnmapped(a: Pick<CourseAttempt, 'status' | 'earnedCredits'>): boolean {
  return (a.status === 'failed' || a.status === 'withdrawn') && !(a.earnedCredits !== null && a.earnedCredits > 0);
}
export function courseCredits(catalog: CatalogModel, courseId: string): number | null {
  const c: CourseDefinition | undefined = catalog.courses[courseId];
  return c && c.credits !== 'unknown' ? c.credits : null;
}
export function termKey(t: TermId): string { return `${t.academicYear}-${t.season}`; }

/** Catalog-level state that prevents authoritative completion conclusions (mirrors validateAnalysisForScenario). */
export function catalogBlocksConclusions(catalog: CatalogModel): boolean {
  return catalog.catalogRef.catalogYearId === null
    || catalog.catalogRef.ruleSetStatus === 'disputed'
    || catalog.catalogRef.ruleSetStatus === 'awaiting_document'
    || catalog.policyGaps.some(g => g.blocksConclusions);
}
export function hasPolicyGap(catalog: CatalogModel, policyId: string): boolean {
  return catalog.policyGaps.some(g => g.policyId === policyId);
}

type FindingInput = Omit<RuleFinding, 'findingId' | 'explanationParams' | 'assumptions' | 'nextAction' | 'sourceRefs' | 'courseIds' | 'termIds' | 'requirementIds'>
  & Partial<Pick<RuleFinding, 'explanationParams' | 'assumptions' | 'nextAction' | 'sourceRefs' | 'courseIds' | 'termIds' | 'requirementIds'>>
  & { /** Extra identity parts (policy/attempt/placement IDs) so distinct findings never share an ID. */ idParts?: readonly string[] };
export function finding(input: FindingInput): RuleFinding {
  const courseIds = input.courseIds ?? [], termIds = input.termIds ?? [], requirementIds = input.requirementIds ?? [];
  return {
    findingId: stableId(input.code, [...courseIds, ...termIds.map(t => t.sortIndex), ...requirementIds, ...(input.idParts ?? [])]),
    code: input.code, severity: input.severity, status: input.status, courseIds, termIds, requirementIds,
    sourceRefs: uniqueSorted(input.sourceRefs ?? []), explanationParams: input.explanationParams ?? {},
    assumptions: uniqueSorted(input.assumptions ?? []), nextAction: input.nextAction ?? null,
  };
}
/** Deduplicate by findingId keeping the first occurrence, preserving order. */
export function dedupeFindings(findings: readonly RuleFinding[]): RuleFinding[] {
  const seen = new Set<string>(), out: RuleFinding[] = [];
  for (const f of findings) if (!seen.has(f.findingId)) { seen.add(f.findingId); out.push(f); }
  return out;
}
