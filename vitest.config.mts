import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const here = import.meta.dirname;

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integratietests praten met een echte Supabase-instantie en mogen elkaar
    // niet in de weg zitten; unit-tests zijn puur en mogen parallel.
    sequence: { concurrent: false },
    setupFiles: ['src/lib/test-env.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(here, './src'),
    },
  },
});
