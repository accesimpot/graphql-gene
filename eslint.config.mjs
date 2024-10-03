import path from 'node:path'
import { fileURLToPath } from 'node:url'
import eslint from '@eslint/js'
import { includeIgnoreFile } from '@eslint/compat'
import tseslint from 'typescript-eslint'
import unusedImports from 'eslint-plugin-unused-imports'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const gitignorePath = path.resolve(__dirname, '.gitignore')

export default tseslint.config(
  includeIgnoreFile(gitignorePath),

  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  {
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true }],
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'warn',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      // 'sort-imports': 'warn', // Autofix doesn't work

      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': 'allow-with-description',
          'ts-nocheck': true,
          'ts-check': false,
          minimumDescriptionLength: 5,
        },
      ],
    },
  }
)
