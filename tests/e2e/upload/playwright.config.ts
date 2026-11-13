import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: '.', testMatch: '**/upload.spec.ts', fullyParallel: false, workers: 1, retries: 0, reporter: 'list', timeout: 40000,
  use: { baseURL: 'https://127.0.0.1:5184', ignoreHTTPSErrors: true, screenshot: 'off', trace: 'off', ...devices['Desktop Chrome'] },
  webServer: { command: 'node tests/e2e/upload/server.mjs', cwd: fileURLToPath(new URL('../../..', import.meta.url)), url: 'https://127.0.0.1:5184/tests/e2e/upload/index.html', ignoreHTTPSErrors: true, reuseExistingServer: false, timeout: 30000 },
});
