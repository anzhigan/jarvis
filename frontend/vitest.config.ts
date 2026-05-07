import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/lib/**/*.{ts,tsx}',
        'src/api/client.ts',
        'src/components/tasks/helpers.ts',
      ],
      exclude: ['**/*.d.ts', 'src/api/types.ts'],
      // Threshold starts at the current floor — raise as features/* hooks
      // gain unit tests (the hooks themselves are pure and trivially testable).
      thresholds: {
        lines: 30,
        statements: 30,
        functions: 8,
        branches: 70,
      },
    },
  },
});
