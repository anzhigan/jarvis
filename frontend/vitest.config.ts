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
        // Pure helpers extracted from feature hooks. Components and
        // useEffect-driven hooks are intentionally excluded — they need a
        // RTL setup that we haven't taken on yet.
        'src/features/goals/hooks/useGos.ts',
        'src/features/goals/hooks/useSteps.ts',
        'src/features/goals/hooks/useGoalsFilters.ts',
        'src/features/routines/lib/heatmap.ts',
      ],
      exclude: ['**/*.d.ts', '**/*.test.{ts,tsx}', 'src/api/types.ts'],
      // Non-regressive baseline. Functions stay lower than lines because
      // included hook files also export mutation helpers (network calls)
      // that we don't unit-test — they live behind the mutation layer.
      thresholds: {
        lines: 50,
        statements: 50,
        functions: 25,
        branches: 75,
      },
    },
  },
});
