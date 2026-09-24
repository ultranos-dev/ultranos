import eslintJs from '@eslint/js'
import tseslint from 'typescript-eslint'
import { noWallclockHlc } from './rules/no-wallclock-hlc.js'

/**
 * Local Ultranos ESLint plugin (Story 60.1). Houses the HLC-discipline rule that
 * forbids wall-clock values in `hlcTimestamp` fields platform-wide.
 */
const ultranosPlugin = {
  rules: {
    'no-wallclock-hlc': noWallclockHlc,
  },
}

/** Shared ESLint flat config for the Ultranos monorepo. */
export const baseConfig = tseslint.config(
  eslintJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      ultranos: ultranosPlugin,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Story 60.1: sync ordering depends on hlcTimestamp being a real HLC.
      'ultranos/no-wallclock-hlc': 'error',
    },
  },
  {
    // Story 60.1: test fixtures may use wall-clock hlcTimestamp values on
    // purpose (fabricated sync rows, and guards that assert a wall-clock stamp
    // is REJECTED). The HLC-discipline rule targets production sync paths, so
    // it is relaxed inside test files.
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/__tests__/**',
      '**/__mocks__/**',
    ],
    rules: {
      'ultranos/no-wallclock-hlc': 'off',
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'],
  },
)
