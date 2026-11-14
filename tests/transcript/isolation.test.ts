import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { createDockerPdfInspector } from '../../supabase/functions/extract-transcript/isolation/dockerInspector';
import { ADMISSION_LIMITS } from '../../src/contracts';
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

describe('local isolation preflight (no Docker required)', () => {
  it.each(['node:latest', '', 'sha256:bad'])('rejects mutable or invalid image identity %s', imageId => {
    expect(() => createDockerPdfInspector({ imageId })).toThrow('immutable_parser_image_required');
  });
  it('rejects oversize/empty input and already-cancelled work before Docker', async () => {
    const inspector = createDockerPdfInspector({ imageId: `sha256:${'a'.repeat(64)}` });
    expect(await inspector.inspect(new Uint8Array())).toMatchObject({ ok: false, reasonCode: 'pdf_size_limit' });
    expect(await inspector.inspect(new Uint8Array(ADMISSION_LIMITS.maxPdfBytes + 1))).toMatchObject({ ok: false, reasonCode: 'pdf_size_limit' });
    expect(await inspector.inspect(new Uint8Array([1]), { signal: AbortSignal.abort() })).toMatchObject({ ok: false, reasonCode: 'pdf_inspection_cancelled' });
  });
  it('quarantines uncertain cleanup instead of releasing local capacity (simulated Docker failure)', async () => {
    const mock = vi.mocked(spawn);
    mock.mockImplementation((_binary, args) => {
      const operation = args?.[2];
      const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), kill: () => true });
      queueMicrotask(() => {
        child.stdout.end(operation === 'inspect' ? '{"OOMKilled":false}' : operation === 'create' ? 'synthetic-container-id' : '');
        child.emit('close', operation === 'rm' ? 1 : operation === 'start' ? 137 : 0);
      });
      return child as unknown as ReturnType<typeof spawn>;
    });
    const inspector = createDockerPdfInspector({ imageId: `sha256:${'a'.repeat(64)}` });
    expect(await inspector.inspect(new Uint8Array([1]))).toMatchObject({ ok: false, reasonCode: 'pdf_cleanup_unconfirmed' });
    const calls = mock.mock.calls.length;
    expect(await inspector.inspect(new Uint8Array([1]))).toMatchObject({ ok: false, reasonCode: 'pdf_isolation_quarantined' });
    expect(mock).toHaveBeenCalledTimes(calls);
  });
});
