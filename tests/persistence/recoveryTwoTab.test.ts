// Real two-tab proof for cross-tab guest recovery: the actual S module bundled into
// Playwright Chromium, several tabs of one origin/profile sharing REAL localStorage.
// Concurrency is genuine (separate renderer processes, synchronized start), or widened
// by a synchronous long task inside one tab's storage read to force the interleaving.
// Assertions are invariants that must hold for EVERY interleaving, so the suite is
// deterministic. Requires `npx playwright install chromium`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { build } from 'vite';

const ORIGIN = 'http://pathcheck-recovery.test/';
const NOW = '2030-01-01T06:00:00Z';
const TRIALS = 40;
let browser: Browser, ctx: BrowserContext, A: Page, B: Page;

async function bundle(): Promise<string> {
  const entry = fileURLToPath(new URL('./browser/recoveryEntry.ts', import.meta.url));
  const out = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, lib: { entry, formats: ['iife'], name: 'PathCheckRecoveryProof' } } });
  const first = (Array.isArray(out) ? out[0] : out) as { output: Array<{ code?: string }> };
  return first.output[0]!.code!;
}

/** In-page helpers. `svc(spin)` wraps window.localStorage; `spin` = { prefix, ms } makes the
 * first getItem of a matching key (or, with prefix '#enumerate', the first key(i) call)
 * block the tab (a long task) right after reading. */
async function install(p: Page) {
  await p.goto(ORIGIN);
  await p.evaluate(() => {
    type PCApi = { createGuestRecoveryService: (s: unknown) => unknown; draft: (o: unknown) => unknown; SHARED_DRAFT_PREFIX: string; GUEST_DRAFT_KEY: string };
    const w = window as unknown as Record<string, unknown> & { PC: PCApi };
    w.svc = (spin?: { prefix: string; ms: number }) => {
      let spun = false;
      const local = {
        getItem: (k: string) => {
          const v = localStorage.getItem(k);
          if (spin && !spun && k.startsWith(spin.prefix)) { spun = true; const end = performance.now() + spin.ms; while (performance.now() < end) { /* long task */ } }
          return v;
        },
        setItem: (k: string, v: string) => localStorage.setItem(k, v),
        removeItem: (k: string) => localStorage.removeItem(k),
        get length() { return localStorage.length; },
        key: (i: number) => {
          const v = localStorage.key(i);
          if (spin && !spun && spin.prefix === '#enumerate') { spun = true; const end = performance.now() + spin.ms; while (performance.now() < end) { /* long task */ } }
          return v;
        },
      };
      return w.PC.createGuestRecoveryService({ session: sessionStorage, local });
    };
    w.ct = (o: Record<string, unknown>) => w.PC.draft({ mode: 'cross_tab_opt_in', explicitRecoveryConsent: true, ...o });
    w.snaps = () => Object.keys(localStorage).filter(k => k.startsWith(w.PC.SHARED_DRAFT_PREFIX)).map(k => JSON.parse(localStorage.getItem(k)!) as { draftId: string; createdAt: string }).map(d => `${d.draftId}@${d.createdAt}`).sort();
  });
}

const settle = () => new Promise(r => setTimeout(r, 30));
async function reset() {
  await A.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await B.evaluate(() => sessionStorage.clear());
  await settle();
}
/** Fresh tab (new service, empty session) recovering from the shared storage. */
async function freshRecover(): Promise<unknown> {
  const C = await ctx.newPage();
  await install(C);
  const r = await C.evaluate(n => { const x = (window as never as { svc: () => { recover(n: string): { ok: unknown; value?: { draftId: string } | null; reasonCode?: string } } }).svc().recover(n); return x.ok === true ? { ok: true, draftId: x.value?.draftId ?? null } : x; }, NOW);
  await C.close();
  return r;
}

beforeAll(async () => {
  const code = await bundle();
  browser = await chromium.launch();
  ctx = await browser.newContext();
  await ctx.route('**/*', r => (r.request().url().endsWith('/proof.js')
    ? r.fulfill({ contentType: 'text/javascript', body: code })
    : r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>recovery proof</title><script src="/proof.js"></script>' })));
  A = await ctx.newPage(); B = await ctx.newPage();
  await install(A); await install(B);
}, 120_000);
afterAll(async () => { await browser?.close(); });

type W = { svc: (spin?: { prefix: string; ms: number }) => { stash(d: unknown): { ok: boolean }; recover(n: string): unknown }; ct: (o: Record<string, unknown>) => unknown; snaps: () => string[]; PC: { clearSavedGuestDraft: (s: unknown, d: unknown, n: string) => boolean | undefined; SHARED_DRAFT_PREFIX: string } };

/** Both tabs busy-wait to a shared wall-clock instant, then run `fn(id)` in the same ms. */
async function simultaneously(fnA: (w: W) => boolean, fnB: (w: W) => boolean): Promise<[boolean, boolean]> {
  const T = Date.now() + 60;
  const run = (p: Page, src: string) => p.evaluate(([t, s]) => { while (Date.now() < (t as number)) { /* sync start */ } return (new Function('w', `return (${s as string})(w)`))(window) as boolean; }, [T, src] as const);
  return Promise.all([run(A, fnA.toString()), run(B, fnB.toString())]) as Promise<[boolean, boolean]>;
}

/** Tracks whether tab A's blocked call is still running when tab B's write completes. */
function pending<T>(p: Promise<T>) {
  const t = { done: false, promise: p };
  void p.then(() => { t.done = true; }, () => { t.done = true; });
  return t;
}

describe('two real Chromium tabs sharing localStorage', () => {
  it(`simultaneous opt-in with different draftIds (${TRIALS} trials): both stored, neither lost, recover is typed conflict`, async () => {
    let bothOk = 0;
    for (let i = 0; i < TRIALS; i++) {
      await reset();
      await A.evaluate(() => (window as never as W).svc().stash((window as never as W).ct({ draftId: 'tab-a', explicitRecoveryConsent: false, mode: 'session' })));
      await B.evaluate(() => (window as never as W).svc().stash((window as never as W).ct({ draftId: 'tab-b', explicitRecoveryConsent: false, mode: 'session' })));
      const [a, b] = await simultaneously(w => w.svc().stash(w.ct({ draftId: 'tab-a' })).ok, w => w.svc().stash(w.ct({ draftId: 'tab-b' })).ok);
      if (a && b) bothOk++;
      await settle();
      expect(await A.evaluate(() => (window as never as W).snaps())).toEqual(['tab-a@2030-01-01T00:00:00Z', 'tab-b@2030-01-01T00:00:00Z']);
    }
    expect(bothOk).toBe(TRIALS);
    expect(await freshRecover()).toEqual({ ok: false, code: 'conflict', reasonCode: 'recovery_multiple_shared_drafts' });
  }, 120_000);

  it(`simultaneous same-draftId changed payloads from two tabs (${TRIALS} trials): both revisions kept, recover conflicts`, async () => {
    for (let i = 0; i < TRIALS; i++) {
      await reset();
      const [a, b] = await simultaneously(
        w => w.svc().stash(w.ct({ draftId: 'd', createdAt: '2030-01-01T01:00:00Z', expiresAt: '2030-01-01T13:00:00Z' })).ok,
        w => w.svc().stash(w.ct({ draftId: 'd', createdAt: '2030-01-01T02:00:00Z', expiresAt: '2030-01-01T14:00:00Z' })).ok);
      expect([a, b]).toEqual([true, true]);
      await settle();
      expect(await A.evaluate(() => (window as never as W).snaps())).toEqual(['d@2030-01-01T01:00:00Z', 'd@2030-01-01T02:00:00Z']);
    }
    expect(await freshRecover()).toEqual({ ok: false, code: 'conflict', reasonCode: 'recovery_multiple_shared_drafts' });
  }, 120_000);

  it('same tab, successive revisions of one draft: only the latest snapshot remains and is recovered', async () => {
    await reset();
    await A.evaluate(() => {
      const w = window as never as W; const s = w.svc();
      for (const h of ['01', '02', '03']) s.stash(w.ct({ draftId: 'd', createdAt: `2030-01-01T${h}:00:00Z`, expiresAt: `2030-01-01T${h}:30:00Z`.replace('T0', 'T1') }));
    });
    await settle();
    expect(await B.evaluate(() => (window as never as W).snaps())).toEqual(['d@2030-01-01T03:00:00Z']);
    expect(await freshRecover()).toEqual({ ok: true, draftId: 'd' });
  }, 60_000);

  it('expired-snapshot cleanup in tab A vs a fresh same-draftId write in tab B during A\'s read→remove window', async () => {
    await reset();
    await A.evaluate(() => { const w = window as never as W; w.svc().stash(w.ct({ draftId: 'd', createdAt: '2029-12-31T00:00:00Z', expiresAt: '2029-12-31T12:00:00Z' })); });
    await settle();
    const prefix = await A.evaluate(() => (window as never as W).PC.SHARED_DRAFT_PREFIX);
    const recovering = pending(A.evaluate(([n, p]) => (window as never as W).svc({ prefix: p, ms: 400 }).recover(n), [NOW, prefix] as const));
    await new Promise(r => setTimeout(r, 120)); // A is now blocked between reading the expired snapshot and removing it
    const wrote = await B.evaluate(() => { const w = window as never as W; return w.svc().stash(w.ct({ draftId: 'd', createdAt: '2030-01-01T05:00:00Z', expiresAt: '2030-01-01T17:00:00Z' })).ok; });
    expect(wrote).toBe(true);
    expect(recovering.done).toBe(false); // B's write landed inside A's read→remove window
    expect(await recovering.promise).toEqual({ ok: true, value: null }); // A removed exactly the expired bytes it judged
    await settle();
    expect(await B.evaluate(() => (window as never as W).snaps())).toEqual(['d@2030-01-01T05:00:00Z']);
    expect(await freshRecover()).toEqual({ ok: true, draftId: 'd' });
  }, 60_000);

  it('save cleanup in tab A vs a newer same-draftId write in tab B during A\'s read→remove window', async () => {
    await reset();
    const prefix = await A.evaluate(() => (window as never as W).PC.SHARED_DRAFT_PREFIX);
    const cleaning = pending(A.evaluate(([n, p]) => {
      const w = window as never as W & { saving?: unknown };
      const saved = w.ct({ draftId: 'd', createdAt: '2030-01-01T01:00:00Z', expiresAt: '2030-01-01T13:00:00Z' });
      const s = w.svc({ prefix: p, ms: 400 });
      s.stash(saved); // write does not read a snapshot key, so no spin yet
      return w.PC.clearSavedGuestDraft(s, saved, n); // spins after reading the saved snapshot
    }, [NOW, prefix] as const));
    await new Promise(r => setTimeout(r, 120));
    const wrote = await B.evaluate(() => { const w = window as never as W; return w.svc().stash(w.ct({ draftId: 'd', createdAt: '2030-01-01T05:00:00Z', expiresAt: '2030-01-01T17:00:00Z' })).ok; });
    expect(wrote).toBe(true);
    expect(cleaning.done).toBe(false);
    await cleaning.promise;
    await settle();
    expect(await B.evaluate(() => (window as never as W).snaps())).toEqual(['d@2030-01-01T05:00:00Z']); // saved copy gone, newer kept
    expect(await freshRecover()).toEqual({ ok: true, draftId: 'd' });
  }, 60_000);

  it('a slow opt-in in tab A cannot overwrite tab B\'s opt-in that lands inside A\'s stash', async () => {
    await reset();
    await A.evaluate(() => localStorage.setItem('unrelated.app.key', 'kept')); // gives the probe a key(i) call to block in
    await settle();
    const stashing = pending(A.evaluate(() => {
      const w = window as never as W;
      // A blocks inside its pre-write enumeration probe; B's opt-in lands before A's write
      return w.svc({ prefix: '#enumerate', ms: 400 }).stash(w.ct({ draftId: 'tab-a' })).ok;
    }));
    await new Promise(r => setTimeout(r, 120));
    expect(await B.evaluate(() => { const w = window as never as W; return w.svc().stash(w.ct({ draftId: 'tab-b' })).ok; })).toBe(true);
    expect(stashing.done).toBe(false); // B wrote between A's probe and A's write
    expect(await stashing.promise).toBe(true);
    await settle();
    expect(await B.evaluate(() => (window as never as W).snaps())).toEqual(['tab-a@2030-01-01T00:00:00Z', 'tab-b@2030-01-01T00:00:00Z']);
    expect(await B.evaluate(() => localStorage.getItem('unrelated.app.key'))).toBe('kept');
  }, 60_000);
});
