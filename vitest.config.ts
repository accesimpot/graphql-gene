import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  resolve: {
    alias: {
      /**
       * @see https://github.com/vitest-dev/vitest/issues/4605#issuecomment-1847658160
       */
      graphql: 'graphql/index.js',

      // Use the source files for test coverage
      'graphql-gene': path.resolve(__dirname, './packages/core/src/index.ts'),
    },
  },

  test: {
    globals: true,
    include: ['**/*.spec.ts'],
    globalSetup: 'vitest.setup.ts',

    coverage: {
      enabled: true,
      provider: 'istanbul',
      include: ['packages/core/src/**', 'packages/plugin-sequelize/src/**'],

      thresholds: {
        lines: 57,
        functions: 55,
        statements: 56,
        branches: 48,
      },
    },
  },
})
