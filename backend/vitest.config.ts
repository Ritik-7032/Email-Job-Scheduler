import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      exclude: [
        'src/__tests__/**',
        'src/scripts/**',
        'src/server.ts',
        'src/worker.ts',
        'src/types/**',
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
      ],
    },
  },
});

