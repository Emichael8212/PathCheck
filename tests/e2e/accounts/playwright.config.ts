import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
// Pinned Playwright diagnostic guard is tested by guards.node.mjs. No DOM snapshots.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
export default defineConfig({
  testDir: '.', testMatch: process.env.PATHCHECK_ACCOUNT_PRIVACY_PROBE === '1' ? '**/privacy-guard.spec.ts' : '**/accounts.spec.ts', workers: 1, retries: 0, timeout: 120000,
  reporter: 'list', outputDir: fileURLToPath(new URL('../../../test-results/accounts', import.meta.url)),
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:5188', screenshot: 'off', trace: 'off', video: 'off' },
});
