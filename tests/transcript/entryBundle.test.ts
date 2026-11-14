import { execFileSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

describe('self-contained server function bundle', () => {
  it('bundles actual runtime exports without env values, external imports, local parser or synthetic bypass', async () => {
    const marker = 'SYNTHETIC_SECRET_MUST_NEVER_ENTER_ARTIFACT_719';
    const output = execFileSync(process.execPath, ['supabase/functions/extract-transcript/build-entry.mjs'], {
      encoding: 'utf8', timeout: 20_000, maxBuffer: 4096,
      env: { PATH: process.env.PATH ?? '', TMPDIR: tmpdir(), GEMINI_API_KEY: marker, VITE_GEMINI_API_KEY: marker },
    });
    const result = JSON.parse(output) as { artifact: string; sha256: string; processing: string };
    expect(result.artifact.startsWith(join(tmpdir(), 'pathcheck-function-entry-'))).toBe(true);
    try {
      const code = await readFile(result.artifact, 'utf8');
      expect(createHash('sha256').update(code).digest('hex')).toBe(result.sha256);
      expect(code).toContain('createTranscriptRuntime');
      expect(code).toContain('createFunctionEntry');
      expect(code).toContain('Deno');
      expect(code).not.toContain(marker);
      expect(code).not.toContain('createDockerPdfInspector');
      expect(code).not.toContain('createSyntheticGeminiProvider');
      expect(code).not.toContain('sourceMappingURL=');
      expect(result.processing).toBe('disabled_pending_reviewed_host_bindings');
    } finally { await rm(dirname(result.artifact), { recursive: true, force: true }); }
  });
});
