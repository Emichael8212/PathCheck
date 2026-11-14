import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDraftGenerationService } from './createDraftGenerationService';
import { generateDraft } from '../engine';
import { catalog, course, reqCourse, scenario } from '../../tests/fixtures/engine/synthetic';
const input = () => scenario(catalog([course('SYN-101')], [reqCourse('degree', 'SYN-101')]));
function stub() {
  return { onmessage: null as ((event: MessageEvent<unknown>) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null, onmessageerror: null as (() => void) | null,
    postMessage: vi.fn(), terminate: vi.fn() };
}
afterEach(() => vi.useRealTimers());
describe('runtime draft worker boundary', () => {
  it('returns the real engine result unchanged and disposes the worker', async () => {
    const worker = stub(), s = input(), result = generateDraft(s);
    expect(result.ok).toBe(true);
    const pending = createDraftGenerationService({ worker: () => worker as unknown as Worker }).generate(s, new AbortController().signal);
    worker.onmessage!(new MessageEvent('message', { data: result }));
    expect(await pending).toEqual(result); expect(worker.terminate).toHaveBeenCalledOnce();
    expect(s.plan.activePlacements).toEqual([]);
  });
  it('watchdog terminates execution without claiming no valid draft', async () => {
    vi.useFakeTimers(); const worker = stub(), s = input(), before = structuredClone(s);
    const pending = createDraftGenerationService({ watchdogMs: 5, worker: () => worker as unknown as Worker }).generate(s, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(5);
    expect(await pending).toEqual({ ok: false, code: 'search_interrupted', reasonCode: 'search_watchdog_not_evaluated' });
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(s).toEqual(before);
  });
  it('abort wins over a late completed result', async () => {
    const worker = stub(), controller = new AbortController(), s = input();
    const pending = createDraftGenerationService({ worker: () => worker as unknown as Worker }).generate(s, controller.signal);
    const late = worker.onmessage!; controller.abort();
    late(new MessageEvent('message', { data: generateDraft(s) }));
    expect(await pending).toMatchObject({ ok: false, code: 'search_interrupted' }); expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it('pre-aborted and invalid input do not start work', async () => {
    const factory = vi.fn(); const service = createDraftGenerationService({ worker: factory }), c = new AbortController(); c.abort();
    expect(await service.generate(input(), c.signal)).toMatchObject({ code: 'search_interrupted' });
    expect(await service.generate({} as ReturnType<typeof input>, new AbortController().signal)).toMatchObject({ code: 'validation_error' });
    expect(factory).not.toHaveBeenCalled();
  });
  it('malformed and wrong-fingerprint worker outputs cannot become academic conclusions', async () => {
    for (const data of [{ ok: true, value: { kind: 'graduation_guaranteed' } }, generateDraft({ ...input(), record: { ...input().record, recordRevision: 8 } })]) {
      const worker = stub(); const pending = createDraftGenerationService({ worker: () => worker as unknown as Worker }).generate(input(), new AbortController().signal);
      worker.onmessage!(new MessageEvent('message', { data }));
      expect(await pending).toMatchObject({ code: 'search_interrupted' }); expect(worker.terminate).toHaveBeenCalledOnce();
    }
  });
  it('constructor, dispatch, worker and decode failures remain not evaluated', async () => {
    const unavailable = await createDraftGenerationService({ worker: () => { throw new Error('constructor'); } }).generate(input(), new AbortController().signal);
    expect(unavailable).toMatchObject({ code: 'search_interrupted' });
    for (const kind of ['dispatch', 'worker', 'message']) {
      const worker = stub();
      if (kind === 'dispatch') worker.postMessage.mockImplementation(() => { throw new Error('clone'); });
      const pending = createDraftGenerationService({ worker: () => worker as unknown as Worker }).generate(input(), new AbortController().signal);
      if (kind === 'worker') worker.onerror!({ preventDefault: vi.fn() } as unknown as ErrorEvent);
      if (kind === 'message') worker.onmessageerror!();
      expect(await pending).toMatchObject({ code: 'search_interrupted' });
      expect(worker.terminate).toHaveBeenCalledOnce();
    }
  });

});
