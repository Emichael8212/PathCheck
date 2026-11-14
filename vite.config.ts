import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { parsePublicSupabaseConfig } from './src/persistence/config';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const url = env.VITE_SUPABASE_URL, publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  // Reject before Vite serves or embeds configuration. Never echo rejected values.
  if ((url || publishableKey) && !parsePublicSupabaseConfig({ url, publishableKey }).ok) {
    throw new Error('Invalid browser-public Supabase configuration; no bundle served.');
  }
  return {
  plugins: [react()],
  test: { include: ['src/**/*.test.ts', 'tests/**/*.test.ts'], exclude: ['tests/e2e/**'] },
  };
});
