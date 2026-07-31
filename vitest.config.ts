import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'cli/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // pure logic only — React components/pages need a DOM harness this
      // repo doesn't have, and would dilute the signal
      include: ['src/lib/**/*.ts', 'src/store/**/*.ts', 'cli/config.ts', 'cli/printer.ts'],
      exclude: ['**/*.test.ts', 'src/lib/types.ts', 'src/lib/swarm/types.ts'],
      // ratchet: set just below current coverage — raise as coverage grows,
      // never lower
      thresholds: {
        statements: 70,
        branches: 55,
        functions: 62,
        lines: 72,
      },
    },
  },
})
