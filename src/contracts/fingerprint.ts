import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { AnalysisResultSchema, InputFingerprintSchema, PlanningScenarioSchema } from './planning';
import type { AnalysisResult, InputFingerprint, PlanningScenario } from './planning';
import type { Result } from './common';
// JSON objects sort by UTF-16 code unit. Arrays retain order: reordered arrays invalidate
// conservatively. No Unicode normalization, dropped keys or revision shortcuts; timestamps are included.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  throw new TypeError('Only finite JSON values may be fingerprinted');
}
export function fingerprint(input: PlanningScenario): InputFingerprint {
  const scenario = PlanningScenarioSchema.parse(input);
  return InputFingerprintSchema.parse(`scenario-v1:sha256:${bytesToHex(sha256(new TextEncoder().encode(canonicalJson(scenario))))}`);
}
export function validateAnalysisForScenario(scenario: PlanningScenario, value: unknown): Result<AnalysisResult> {
  const parsed = AnalysisResultSchema.safeParse(value);
  if (!parsed.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_analysis' };
  const analysis = parsed.data;
  if (analysis.inputFingerprint !== fingerprint(scenario)) return { ok: false, code: 'stale_preview', reasonCode: 'stale_analysis' };
  const blocked = scenario.catalog.catalogRef.catalogYearId === null || ['disputed', 'awaiting_document'].includes(scenario.catalog.catalogRef.ruleSetStatus) || scenario.catalog.policyGaps.some(g => g.blocksConclusions);
  if (blocked && (analysis.degreeAudit.totalStatus === 'satisfied' || !['insufficient_evidence', 'not_evaluated', 'known_constraints_block_current_plan'].includes(analysis.outlook.kind))) {
    return { ok: false, code: 'unresolved', reasonCode: 'unresolved_academic_policy' };
  }
  return { ok: true, value: analysis };
}
