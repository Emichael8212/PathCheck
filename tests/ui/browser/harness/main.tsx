// TEST HARNESS ONLY. Mounts the real PathCheckWorkflow with the TEST DOUBLES from
// tests/fixtures/ui/fakeServices.ts (synthetic catalog, fake engine/commands/account/transcript).
// It proves UI event/state/keyboard/layout behavior, NOT academic correctness or integration.
// Query flags select double behavior only; no academic content or tokens are put in URLs.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PathCheckWorkflow } from '../../../../src/screens';
import { fakeServices, transcriptGate } from '../../../fixtures/ui/fakeServices';

const q = new URLSearchParams(window.location.search);
// hold=ticket,extract,revoke keeps those transcript calls pending until the test releases them.
const gate = transcriptGate((q.get('hold') ?? '').split(',').filter(n => n === 'ticket' || n === 'extract' || n === 'revoke'));
// revokefail=receipt-1 makes revoking that synthetic receipt ID fail; validate=downgrade makes G's
// validation downgrade an optimistic raw envelope.
const revokeFails = new Set((q.get('revokefail') ?? '').split(',').filter(id => /^receipt-\d+$/.test(id)));
const pick = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
  const v = q.get(name);
  return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback;
};

const harness = fakeServices({
  draft: pick('draft', ['ok', 'none', 'interrupted'] as const, 'ok'),
  transcript: pick('transcript', ['disabled', 'approved', 'rejected', 'none'] as const, 'disabled'),
  transcriptGate: gate,
  transcriptOptions: { revokeFails, validate: pick('validate', ['identity', 'downgrade'] as const, 'identity') },
  account: q.get('account') !== 'off',
  longTitles: q.get('long') === '1',
  blockingGap: q.get('gap') === '1',
  clearFails: q.get('clear') === 'fail',
  exportFails: q.get('export') === 'fail',
  staleAnalysis: q.get('analysis') === 'stale',
});

declare global { interface Window { __pathcheckHarness?: { transcriptCalls: string[]; revokedIds: string[]; savedPlanCount: () => number; release: (name: string) => void } } }
window.__pathcheckHarness = { transcriptCalls: harness.transcriptCalls, revokedIds: harness.revokedIds, savedPlanCount: () => harness.account?.inspect.rows.size ?? 0, release: name => gate.release(name) };

createRoot(document.getElementById('root')!).render(<StrictMode><PathCheckWorkflow services={harness.services} /></StrictMode>);
