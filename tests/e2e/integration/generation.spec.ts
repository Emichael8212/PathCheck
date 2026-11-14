import { expect, test } from '@playwright/test';

test('actual browser worker preserves deterministic engine output and active plan', async ({ page }) => {
  await page.goto('/');
  const evidence = await page.evaluate(async () => {
    const servicePath = '/src/app/createDraftGenerationService.ts';
    const fixturePath = '/tests/fixtures/engine/synthetic.ts';
    const enginePath = '/src/engine/index.ts';
    const { createDraftGenerationService } = await import(servicePath);
    const { catalog, course, reqCourse, scenario } = await import(fixturePath);
    const { generateDraft } = await import(enginePath);
    const input = scenario(catalog([course('SYN-101')], [reqCourse('degree', 'SYN-101')]));
    const before = JSON.stringify(input);
    const expected = generateDraft(input);
    const actual = await createDraftGenerationService().generate(input, new AbortController().signal);
    return { expected, actual, unchanged: before === JSON.stringify(input) };
  });
  expect(evidence.actual).toEqual(evidence.expected);
  expect(evidence.actual.ok).toBe(true);
  expect(evidence.unchanged).toBe(true);
});

test('actual worker watchdog and cancellation interrupt after engine work begins', async ({ page }) => {
  await page.goto('/');
  const evidence = await page.evaluate(async () => {
    const servicePath = '/src/app/createDraftGenerationService.ts';
    const fixturePath = '/tests/fixtures/engine/synthetic.ts';
    const { createDraftGenerationService } = await import(servicePath);
    const { catalog, course, reqCourse, reqAll, scenario, horizon } = await import(fixturePath);
    const ids = Array.from({ length: 8 }, (_, i) => `SYN-${i + 101}`);
    const input = scenario(catalog(ids.map((id, i) => course(id, 3, i === 0
      ? { kind: 'all', children: [] }
      : { kind: 'course', courseId: ids[i - 1], minGrade: null, timing: 'prior_term' })),
      [reqAll('degree', ids), ...ids.map(id => reqCourse(id, id))]), { terms: horizon(8) });
    const before = JSON.stringify(input);
    let watchdogStarted = false;
    const timed = await createDraftGenerationService({ watchdogMs: 5000, worker: () => {
      const worker = new Worker('/tests/e2e/integration/generation-held.worker.ts', { type: 'module' });
      worker.addEventListener('message', e => { if (e.data.kind === 'progress' && e.data.expansions > 0) watchdogStarted = true; });
      return worker;
    } }).generate(input, new AbortController().signal);
    const controller = new AbortController();
    let cancelStarted = false;
    const cancelled = await createDraftGenerationService({ worker: () => {
      const worker = new Worker('/src/app/generation.worker.ts', { type: 'module' });
      worker.addEventListener('message', e => { if (e.data.kind === 'progress' && e.data.expansions > 0) { cancelStarted = true; controller.abort(); } });
      return worker;
    } }).generate(input, controller.signal);
    return { timed, cancelled, watchdogStarted, cancelStarted, unchanged: before === JSON.stringify(input) };
  });
  expect(evidence.watchdogStarted).toBe(true);
  expect(evidence.cancelStarted).toBe(true);
  expect(evidence.timed).toEqual({ ok: false, code: 'search_interrupted', reasonCode: 'search_watchdog_not_evaluated' });
  expect(evidence.cancelled).toEqual({ ok: false, code: 'search_interrupted', reasonCode: 'search_cancelled_not_evaluated' });
  expect(evidence.unchanged).toBe(true);
});
