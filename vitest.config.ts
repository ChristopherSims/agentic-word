import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  // tsx renderer tests use the automatic JSX runtime (no global React)
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    environment: 'node',
    // .tsx = renderer DOM tests (each opts into jsdom via a
    // @vitest-environment docblock, per memory.md §14 test tooling)
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/main/**/*.ts'],
      exclude: ['src/main/index.ts'], // covered by integration tests
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
