// TEST HARNESS ONLY. Mounts the real PathCheckWorkflow with the TEST DOUBLES from
// tests/fixtures/ui/fakeServices.ts (synthetic catalog, fake engine/commands/account/transcript).
// It proves UI event/state/keyboard/layout behavior, NOT academic correctness or integration.
// Query flags select double behavior only; no academic content or tokens are put in URLs.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PathCheckWorkflow } from '../../../../src/screens';
import { createSupabaseAuth } from '../../../../src/auth/supabaseAuth';
import { parsePublicSupabaseConfig } from '../../../../src/persistence/config';
import * as guestRecovery from '../../../../src/persistence/guestRecovery';
import { createGuestRecoveryService } from '../../../../src/persistence/guestRecovery';
import { fakeServices, syntheticAuthFetch, transcriptGate } from '../../../fixtures/ui/fakeServices';

const q = new URLSearchParams(window.location.search);
// hold=ticket,extract,revoke keeps those transcript calls pending until the test releases them.
// hold=save keeps the account double's createPlan/savePlan pending until released; hold=open
// holds each getOwnedPlan(id) until release(`open:${id}`); hold=verify holds the synthetic /verify.
const gate = transcriptGate((q.get('hold') ?? '').split(',').filter(n => ['ticket', 'extract', 'revoke', 'save', 'open', 'verify'].includes(n)));
// auth=real uses S's actual createSupabaseAuth against a synthetic in-page Auth endpoint.
const authCalls: string[] = [];
const realAuth = (() => {
  if (q.get('auth') !== 'real') return undefined;
  const config = parsePublicSupabaseConfig({ url: 'http://127.0.0.1:54321', publishableKey: 'sb_publishable_synthetic_test' });
  if (!config.ok) throw new Error(`harness auth config: ${config.reasonCode}`);
  return createSupabaseAuth(config.value, { fetch: syntheticAuthFetch(authCalls, gate) });
})();
// recovery=real uses S's actual guest recovery service over this tab's Web Storage.
const realRecovery = q.get('recovery') === 'real';
// revokefail=receipt-1 makes revoking that synthetic receipt ID fail; validate=downgrade makes G's
// validation downgrade an optimistic raw envelope; validate=fail makes G refuse that envelope.
const revokeFails = new Set((q.get('revokefail') ?? '').split(',').filter(id => /^receipt-\d+$/.test(id)));
const pick = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
  const v = q.get(name);
  return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback;
};

const harness = fakeServices({
  draft: pick('draft', ['ok', 'none', 'interrupted'] as const, 'ok'),
  transcript: pick('transcript', ['disabled', 'approved', 'rejected', 'none'] as const, 'disabled'),
  transcriptGate: gate,
  transcriptOptions: { revokeFails, validate: pick('validate', ['identity', 'downgrade', 'fail'] as const, 'identity') },
  account: q.get('account') !== 'off',
  accountOptions: {
    gate,
    ...(realAuth ? { auth: realAuth } : {}),
    signOut: pick('signout', ['ok', 'unconfirmed', 'stuck'] as const, 'ok'),
    ...(realRecovery ? { recovery: createGuestRecoveryService({ session: window.sessionStorage, local: window.localStorage }) } : {}),
  },
  ...(realRecovery ? { clockStore: window.sessionStorage } : {}),
  longTitles: q.get('long') === '1',
  blockingGap: q.get('gap') === '1',
  clearFails: q.get('clear') === 'fail',
  exportFails: q.get('export') === 'fail',
  staleAnalysis: q.get('analysis') === 'stale',
  // catalogs=pair|pair-synthetic lists two catalogs that differ only by version (identity labels).
  ...(q.get('catalogs') === 'pair' ? { catalogPair: 'provisional' as const } : q.get('catalogs') === 'pair-synthetic' ? { catalogPair: 'synthetic' as const } : {}),
});

declare global { interface Window { __pathcheckHarness?: { transcriptCalls: string[]; revokedIds: string[]; savedPlanCount: () => number; savedPlans: () => unknown[]; authCalls: string[]; currentUser: () => Promise<unknown>; recoveryCapabilities: { snapshots: boolean; choices: boolean }; release: (name: string) => void; rearm: (name: string) => void } } }
window.__pathcheckHarness = { transcriptCalls: harness.transcriptCalls, revokedIds: harness.revokedIds, savedPlanCount: () => harness.account?.inspect.rows.size ?? 0, savedPlans: () => [...(harness.account?.inspect.rows.values() ?? [])], authCalls,
  // Which S recovery module is composed (snapshots/choices arrive with S PR13); tests needing them report BLOCKED otherwise.
  recoveryCapabilities: { snapshots: 'SHARED_DRAFT_PREFIX' in guestRecovery, choices: typeof (guestRecovery as Record<string, unknown>).listGuestRecoveryChoices === 'function' },
  currentUser: async () => (await harness.services.account!.auth.currentUser()), release: name => gate.release(name), rearm: name => gate.rearm(name) };

createRoot(document.getElementById('root')!).render(<StrictMode><PathCheckWorkflow services={harness.services} /></StrictMode>);
