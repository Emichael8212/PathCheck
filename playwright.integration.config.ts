import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e/integration', fullyParallel: false, forbidOnly: true, retries: 0, reporter: 'list',
  testMatch: process.env.PATHCHECK_TEST_BUILD === '1' ? '**/application.spec.ts' : '**/*.spec.ts',
  use: { baseURL: 'http://127.0.0.1:5181', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: { command: process.env.PATHCHECK_TEST_BUILD === '1' ? 'npm run build && npm run preview -- --port 5181 --strictPort' : 'npm run dev -- --port 5181 --strictPort', url: 'http://127.0.0.1:5181', reuseExistingServer: false },
});
