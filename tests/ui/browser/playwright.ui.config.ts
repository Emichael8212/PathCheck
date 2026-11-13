// U-owned browser component/interaction config. Runs the real UI components in Chromium
// against the labeled test-double harness (tests/ui/browser/harness). It does not replace
// the lead-owned E2E suite and never exercises the real engine.
// Run: npx playwright test -c tests/ui/browser/playwright.ui.config.ts
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const PORT = 5179;

export default defineConfig({
  testDir: '.', testMatch: '**/*.spec.ts', fullyParallel: true, forbidOnly: Boolean(process.env.CI), retries: 0,
  outputDir: `${root}test-results/ui-browser`, reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'off', screenshot: 'off', video: 'off', locale: 'en-US', timezoneId: 'America/Chicago' },
  projects: [
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } }, grepInvert: /@mobile/ },
    { name: 'mobile-375', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: false }, grep: /@mobile/ },
  ],
  webServer: { command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`, cwd: root, url: `http://127.0.0.1:${PORT}/tests/ui/browser/harness/index.html`, reuseExistingServer: false, timeout: 60_000 },
});
