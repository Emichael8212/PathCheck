// Container-only entry. Receives PDF bytes on stdin, never a path or credential.
import { createPdfInspector } from '../pdf';
import { ADMISSION_LIMITS } from '../../../../src/contracts';

// Third-party diagnostics must never copy input-derived text to the host.
for (const key of ['log', 'warn', 'error', 'info', 'debug', 'trace'] as const) console[key] = () => undefined;
async function run() {
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk as Uint8Array);
    length += bytes.length;
    if (length > ADMISSION_LIMITS.maxPdfBytes) throw new Error('input_limit');
    chunks.push(bytes);
  }
  const input = Buffer.concat(chunks);
  try { process.stdout.write(JSON.stringify(await createPdfInspector().inspect(input))); }
  finally { input.fill(0); for (const chunk of chunks) chunk.fill(0); }
}
try { await run(); }
catch { process.stdout.write(JSON.stringify({ ok: false, code: 'validation_error', reasonCode: 'pdf_malformed_or_encrypted' })); process.exitCode = 1; }
