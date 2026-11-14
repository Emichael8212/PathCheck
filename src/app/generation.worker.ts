import { startDraftGeneration } from '../engine';
import type { PlanningScenario } from '../contracts';

// Runtime scheduling belongs to L; every academic decision remains E-owned.
self.onmessage = (event: MessageEvent<PlanningScenario>) => {
  const started = startDraftGeneration(event.data);
  if (!started.ok) { self.postMessage(started); return; }
  function advance() {
    const next = started.ok ? started.value.step(4) : null;
    if (!next) return;
    if (next.done) self.postMessage(next.result);
    else {
      self.postMessage({ kind: 'progress', expansions: next.expansions });
      setTimeout(advance, 0); // Yield without changing expansion order or work budgets.
    }
  }
  advance();
};
