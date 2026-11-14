import { z } from 'zod';
import { GeneratedDraftSchema, PlanningScenarioSchema, TypedFailureSchema, fingerprint } from '../contracts';
import type { AcademicService, PlanningScenario, TypedFailure } from '../contracts';

type DraftResult = ReturnType<AcademicService['generateDraft']>;
const progress = z.strictObject({ kind: z.literal('progress'), expansions: z.number().int().nonnegative().max(1500) });
const response = z.union([TypedFailureSchema, z.strictObject({ ok: z.literal(true), value: z.union([
  GeneratedDraftSchema,
  z.strictObject({ kind: z.literal('no_valid_draft_under_search_bounds'), expansions: z.number().int().nonnegative().max(1500) }),
]) })]);
const interrupted = (reasonCode: string): TypedFailure => ({ ok: false, code: 'search_interrupted', reasonCode });

/** One disposable worker per search. Wall time may interrupt, never decide feasibility. */
export function createDraftGenerationService(options: { watchdogMs?: number; worker?: () => Worker } = {}) {
  const watchdogMs = options.watchdogMs ?? 30000;
  if (!Number.isFinite(watchdogMs) || watchdogMs < 1 || watchdogMs > 60000) throw new Error('invalid_search_watchdog');
  return Object.freeze({
    generate(scenario: PlanningScenario, signal: AbortSignal): Promise<DraftResult> {
      if (signal.aborted) return Promise.resolve(interrupted('search_cancelled_not_evaluated'));
      const input = PlanningScenarioSchema.safeParse(scenario);
      if (!input.success) return Promise.resolve({ ok: false, code: 'validation_error', reasonCode: 'invalid_search_scenario' });
      const base = fingerprint(input.data);
      return new Promise(resolve => {
        let worker: Worker;
        try { worker = options.worker?.() ?? new Worker(new URL('./generation.worker.ts', import.meta.url), { type: 'module' }); }
        catch { resolve(interrupted('search_worker_unavailable_not_evaluated')); return; }
        let settled = false;
        const finish = (result: DraftResult) => {
          if (settled) return;
          settled = true; clearTimeout(timer); signal.removeEventListener('abort', cancel);
          worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null;
          worker.terminate(); resolve(result);
        };
        const cancel = () => finish(interrupted('search_cancelled_not_evaluated'));
        const timer = setTimeout(() => finish(interrupted('search_watchdog_not_evaluated')), watchdogMs);
        signal.addEventListener('abort', cancel, { once: true });
        worker.onerror = event => { event.preventDefault(); finish(interrupted('search_worker_failed_not_evaluated')); };
        worker.onmessageerror = () => finish(interrupted('search_worker_message_not_evaluated'));
        worker.onmessage = (event: MessageEvent<unknown>) => {
          if (progress.safeParse(event.data).success) return; // Does not extend the watchdog.
          const parsed = response.safeParse(event.data);
          if (!parsed.success || (parsed.data.ok && 'baseFingerprint' in parsed.data.value && parsed.data.value.baseFingerprint !== base)) {
            finish(interrupted('search_worker_invalid_not_evaluated')); return;
          }
          finish(parsed.data);
        };
        if (signal.aborted) { cancel(); return; }
        try { worker.postMessage(input.data); }
        catch { finish(interrupted('search_worker_dispatch_not_evaluated')); }
      });
    },
  });
}
