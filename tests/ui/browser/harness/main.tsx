// TEST HARNESS ONLY. Mounts the real PathCheckWorkflow with the TEST DOUBLES from
// tests/fixtures/ui/fakeServices.ts (synthetic catalog, fake engine/commands/account/transcript).
// It proves UI event/state/keyboard/layout behavior, NOT academic correctness or integration.
// Query flags select double behavior only; no academic content or tokens are put in URLs.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PathCheckWorkflow } from '../../../../src/screens';
import { fakeServices } from '../../../fixtures/ui/fakeServices';

const q = new URLSearchParams(window.location.search);
const pick = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
  const v = q.get(name);
  return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback;
};

const harness = fakeServices({
  draft: pick('draft', ['ok', 'none', 'interrupted'] as const, 'ok'),
  transcript: pick('transcript', ['disabled', 'approved', 'rejected', 'none'] as const, 'disabled'),
  account: q.get('account') !== 'off',
  longTitles: q.get('long') === '1',
  blockingGap: q.get('gap') === '1',
  clearFails: q.get('clear') === 'fail',
});

declare global { interface Window { __pathcheckHarness?: { transcriptCalls: string[]; savedPlanCount: () => number } } }
window.__pathcheckHarness = { transcriptCalls: harness.transcriptCalls, savedPlanCount: () => harness.account?.inspect.rows.size ?? 0 };

createRoot(document.getElementById('root')!).render(<StrictMode><PathCheckWorkflow services={harness.services} /></StrictMode>);
