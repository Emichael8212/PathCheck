import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: '**/live.spec.ts', fullyParallel: false, workers: 1,
  retries: 0, reporter: 'list', timeout: 90000,
  use: { baseURL: 'https://127.0.0.1:5185', ignoreHTTPSErrors: true,
    screenshot: 'off', trace: 'off', video: 'off', ...devices['Desktop Chrome'] },
});
