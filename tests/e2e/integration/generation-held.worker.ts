// Test-only scheduling barrier AFTER real E work. No fabricated academic result.
import { startDraftGeneration } from '../../../src/engine';
import type { PlanningScenario } from '../../../src/contracts';
self.onmessage = (event: MessageEvent<PlanningScenario>) => {
  const job = startDraftGeneration(event.data);
  if (!job.ok) { self.postMessage(job); return; }
  const first = job.value.step(1);
  if (first.done) { self.postMessage(first.result); return; }
  self.postMessage({ kind: 'progress', expansions: first.expansions });
  // Intentionally await parent termination, simulating a stalled chunk continuation.
};
