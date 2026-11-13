import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: { include: ['src/**/*.test.ts', 'tests/**/*.test.ts'], exclude: ['tests/e2e/**'] },
});
