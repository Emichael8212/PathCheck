import { PlanningScenarioSchema, validateAnalysisForScenario, fingerprint } from '../contracts';
import type { AcademicRecord, AcademicService, AnalysisResult, CatalogModel, ExplicitUserAction, InputFingerprint, Plan, PlanningScenario, Result, TermId } from '../contracts';
import type { ScenarioConfig, WorkflowClock } from './services';

export const EMPTY_RECORD: AcademicRecord = Object.freeze({ schemaVersion: 1, recordRevision: 0, courseAttempts: [], unresolvedItems: [] }) as AcademicRecord;

export interface CapacityAssumption { maximum: number; source: 'student' | 'scenario_assumption' }

export interface ScenarioInput {
  catalog: CatalogModel;
  record: AcademicRecord;
  plan: Plan;
  terms: TermId[];
  capacity: CapacityAssumption;
  config: ScenarioConfig;
  evaluatedAt: string;
}

/** Composes a frozen scenario from contract values; never adds academic content. */
export function buildScenario(input: ScenarioInput): Result<PlanningScenario> {
  const parsed = PlanningScenarioSchema.safeParse({
    schemaVersion: 1,
    catalog: input.catalog,
    record: input.record,
    plan: input.plan,
    engineVersion: input.config.engineVersion,
    assumptions: {
      terms: input.terms,
      creditCapacity: input.terms.map(termId => ({ termId, maximum: input.capacity.maximum, source: input.capacity.source })),
      evaluationPolicy: input.config.evaluationPolicy,
      assumeFuturePass: input.config.assumeFuturePass,
      evaluatedAt: input.evaluatedAt,
    },
    searchOptions: input.config.searchOptions,
  });
  if (!parsed.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_scenario' };
  return { ok: true, value: Object.freeze(parsed.data) as PlanningScenario };
}

/** E evaluates; the contract validator rejects stale or policy-overclaiming results. */
export function evaluateChecked(academic: Pick<AcademicService, 'evaluate'>, scenario: PlanningScenario): Result<AnalysisResult> {
  let result: Result<AnalysisResult>;
  try {
    result = academic.evaluate(scenario);
  } catch {
    return { ok: false, code: 'external_failure', reasonCode: 'engine_exception' };
  }
  if (!result.ok) return result;
  return validateAnalysisForScenario(scenario, result.value);
}

export function scenarioFingerprint(scenario: PlanningScenario): InputFingerprint {
  return fingerprint(scenario);
}

export function makeAction(clock: WorkflowClock, kind: ExplicitUserAction['kind'], acknowledgedAssumptions: string[] = []): ExplicitUserAction {
  return { actionId: clock.newId('action'), kind, acknowledgedAssumptions: [...acknowledgedAssumptions], occurredAt: clock.now() };
}

/** Wraps a synchronous port so a thrown exception becomes a typed failure, never success. */
export function guard<T>(run: () => Result<T>, reasonCode: string): Result<T> {
  try {
    return run();
  } catch {
    return { ok: false, code: 'external_failure', reasonCode };
  }
}

export async function guardAsync<T>(run: () => Promise<Result<T>>, reasonCode: string): Promise<Result<T>> {
  try {
    return await run();
  } catch {
    return { ok: false, code: 'external_failure', reasonCode };
  }
}
