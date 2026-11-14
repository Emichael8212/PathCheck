// LOCAL SERVER ONLY. Do not import into React or claim this runs in hosted Edge.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { ADMISSION_LIMITS } from '../../../../src/contracts';
import type { Result } from '../../../../src/contracts';
import type { PdfInspector } from '../handler';

export const ISOLATION_LIMITS = Object.freeze({ memoryBytes: 268435456, cpuSeconds: 3,
  cpus: '0.5', wallMs: 12000, innerWallSeconds: 10, maxOutputBytes: 1024, maxConcurrent: 2 });
const Parsed = z.union([
  z.strictObject({ ok: z.literal(true), value: z.strictObject({ pageCount: z.number().int().min(1).max(20) }) }),
  z.strictObject({ ok: z.literal(false), code: z.literal('validation_error'), reasonCode: z.enum([
    'pdf_size_limit', 'invalid_pdf_signature', 'pdf_incomplete_envelope', 'pdf_invalid_xref', 'pdf_encrypted',
    'pdf_invalid_catalog', 'pdf_invalid_page_tree', 'pdf_page_limit', 'pdf_malformed_or_encrypted',
  ]) }),
]);
const denied = (reasonCode: string): Result<never> => ({ ok: false, code: 'unavailable', reasonCode });
export interface IsolationEvidence {
  containerName: string; elapsedMs: number; exitCode: number | null; oomKilled: boolean;
  terminated: 'completed' | 'cancelled' | 'deadline' | 'output_limit' | 'runtime_failure'; cleanupConfirmed: boolean;
}
const environment = () => ({ PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '' });
function command(args: string[], options: { input?: Uint8Array; signal?: AbortSignal; timeout?: number; limit?: number } = {}) {
  return new Promise<{ code: number | null; output: string; stop: IsolationEvidence['terminated'] }>(resolve => {
    const child = spawn('docker', ['--context', 'colima-pathcheck-test', ...args], { env: environment(), stdio: ['pipe', 'pipe', 'ignore'] });
    let size = 0; let output = ''; let stop: IsolationEvidence['terminated'] = 'completed'; let done = false;
    const terminate = (reason: IsolationEvidence['terminated']) => { if (stop === 'completed') stop = reason; child.kill('SIGKILL'); };
    const abort = () => terminate('cancelled');
    const timer = setTimeout(() => terminate('deadline'), options.timeout ?? 5000);
    options.signal?.addEventListener('abort', abort, { once: true });
    const finish = (code: number | null) => {
      if (done) return; done = true; clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
      resolve({ code, output, stop });
    };
    child.on('error', () => { stop = 'runtime_failure'; finish(null); });
    child.on('close', finish);
    child.stdout.on('data', (part: Buffer) => { size += part.length; if (size > (options.limit ?? 4096)) terminate('output_limit'); else output += part.toString('utf8'); });
    child.stdin.on('error', () => undefined);
    if (options.signal?.aborted) abort();
    else child.stdin.end(options.input);
  });
}

/** One disposable constrained container per admitted PDF. Capacity is only local
 * resource admission, never a replacement for durable SQL tickets/quotas/leases. */
export function createDockerPdfInspector(options: { imageId: string; onEvidence?: (value: IsolationEvidence) => void }): PdfInspector {
  if (!/^sha256:[a-f0-9]{64}$/.test(options.imageId)) throw new Error('immutable_parser_image_required');
  const imageId = options.imageId; let active = 0; let quarantined = false;
  return { async inspect(bytes, execution = {}) {
    if (!bytes.length || bytes.length > ADMISSION_LIMITS.maxPdfBytes) return { ok: false, code: 'validation_error', reasonCode: 'pdf_size_limit' };
    if (execution.signal?.aborted) return denied('pdf_inspection_cancelled');
    if (quarantined) return denied('pdf_isolation_quarantined');
    if (active >= ISOLATION_LIMITS.maxConcurrent) return denied('pdf_local_capacity_exhausted');
    active++;
    const containerName = `pathcheck-pdf-${randomUUID()}`;
    const started = performance.now();
    let result: Result<{ pageCount: number }> = denied('pdf_isolation_unavailable');
    let exitCode: number | null = null; let oomKilled = false; let terminated: IsolationEvidence['terminated'] = 'runtime_failure';
    let cleanupConfirmed: boolean;
    try {
      const create = await command(['create', '--name', containerName, '--label', 'pathcheck.pdf-isolation=local-v1', '--interactive',
        '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
        `--memory=${ISOLATION_LIMITS.memoryBytes}`, `--memory-swap=${ISOLATION_LIMITS.memoryBytes}`, `--cpus=${ISOLATION_LIMITS.cpus}`,
        '--pids-limit=32', `--ulimit=cpu=${ISOLATION_LIMITS.cpuSeconds}:${ISOLATION_LIMITS.cpuSeconds}`, '--ulimit=core=0:0',
        '--log-driver=none', '--user=65534:65534', '--ipc=none', imageId]);
      if (create.code !== 0) return result;
      if (execution.signal?.aborted) { terminated = 'cancelled'; result = denied('pdf_inspection_cancelled'); }
      else {
        const run = await command(['start', '--attach', '--interactive', containerName], { input: bytes,
          ...(execution.signal ? { signal: execution.signal } : {}), timeout: ISOLATION_LIMITS.wallMs, limit: ISOLATION_LIMITS.maxOutputBytes });
        exitCode = run.code; terminated = run.stop;
        if (run.stop !== 'completed') result = denied(`pdf_inspection_${run.stop}`);
        else if (run.code === 0) {
          try { result = Parsed.parse(JSON.parse(run.output)); } catch { result = denied('pdf_inspection_invalid_result'); }
        } else result = denied('pdf_inspection_resource_or_runtime_failure');
      }
    } catch { result = denied('pdf_isolation_unavailable'); }
    finally {
      // Killing the Docker CLI does NOT kill its container. Always remove that exact
      // random container, including cancellation and partial-start failures.
      const state = await command(['inspect', containerName, '--format', '{{json .State}}']);
      if (state.code === 0) {
        try { const value = JSON.parse(state.output) as { OOMKilled?: boolean; ExitCode?: number }; oomKilled = value.OOMKilled === true; } catch { /* no diagnostics */ }
      }
      const removed = await command(['rm', '--force', containerName]);
      cleanupConfirmed = removed.code === 0;
      if (cleanupConfirmed) active--;
      else quarantined = true; // Unknown cleanup never releases capacity or authorizes more work.
      try { options.onEvidence?.({ containerName, elapsedMs: Math.round(performance.now() - started), exitCode, oomKilled, terminated, cleanupConfirmed }); } catch { /* no logging */ }
    }
    return cleanupConfirmed ? result : denied('pdf_cleanup_unconfirmed');
  } };
}
