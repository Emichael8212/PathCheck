import type { AcademicService, ExportService, PlanningScenario } from '../contracts';
import { createPlannerCommands } from './plannerCommands';
import { createDraftGenerationService } from './createDraftGenerationService';

/** Composition only. Academic decisions remain in E; plan mutations remain in L. */
export function createGuestWorkflow(
  academic: AcademicService,
  exporter: ExportService,
  config: Pick<PlanningScenario, 'engineVersion' | 'searchOptions'> & { evaluationPolicy: string; assumeFuturePass: boolean },
  clock = { now: () => new Date().toISOString(), newId: (prefix: string) => `${prefix}-${crypto.randomUUID()}` },
) {
  return Object.freeze({ academic, commands: createPlannerCommands(academic, () => clock.newId('plan')), exporter, config, clock, generation: createDraftGenerationService(), transcript: null, account: null });
}
