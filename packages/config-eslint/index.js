import eslintJs from '@eslint/js'
import tseslint from 'typescript-eslint'
import { noWallclockHlc } from './rules/no-wallclock-hlc.js'
import { noHardcodedUiString } from './rules/no-hardcoded-ui-string.js'

/**
 * Local Ultranos ESLint plugin.
 * - no-wallclock-hlc (Story 60.1): forbids wall-clock values in `hlcTimestamp`.
 * - no-hardcoded-ui-string (Story 63.1): forbids new hardcoded user-facing JSX
 *   strings in the Next.js apps — they must be keyed for all four locales.
 */
const ultranosPlugin = {
  rules: {
    'no-wallclock-hlc': noWallclockHlc,
    'no-hardcoded-ui-string': noHardcodedUiString,
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
    // Story 63.1 (AC5): hardcoded-UI-string guard. Enforced (error) on the
    // safety-critical / high-traffic surfaces this story keyed, so a NEW literal
    // UI string reintroduced into any of them fails `pnpm lint` (and CI, which
    // runs lint). The four apps carry a large pre-existing un-keyed backlog
    // OUTSIDE this story's scope; enforcing repo-wide today would fail the build
    // on hundreds of untouched strings unrelated to 63.1. The guard therefore
    // ratchets: it is ON for the files below now, and future i18n stories widen
    // `files` as they key each surface until it covers `apps/*/src/**/*.tsx`.
    // NOTE: `[` `]` `(` `)` in Next.js route segments are glob metacharacters —
    // they MUST be escaped (`\\[locale\\]`, `\\(app\\)`) or the pattern silently
    // fails to match and the rule never runs on that file. A double-star fallback
    // (`**/<file>.tsx`) is also included per file so the rule matches regardless
    // of the cwd `eslint` is invoked from.
    files: [
      // Task 1 — pharmacy safety
      'apps/pharmacy-lite/src/components/pharmacy/PharmacyScannerView.tsx',
      'apps/pharmacy-lite/src/components/pharmacy/AllergyBanner.tsx',
      'apps/pharmacy-lite/src/components/pharmacy/FulfillmentChecklist.tsx',
      '**/pharmacy-lite/src/app/\\[locale\\]/\\(app\\)/layout.tsx',
      // Task 2 — OPD consent modal + layout
      'apps/opd-lite/src/components/patient/ConsentRenewalModal.tsx',
      '**/opd-lite/src/app/\\[locale\\]/\\(app\\)/layout.tsx',
      // Task 3 — admin sweep
      '**/admin-portal/src/app/\\[locale\\]/patients/merge/page.tsx',
      '**/admin-portal/src/app/\\[locale\\]/users/create/page.tsx',
      '**/admin-portal/src/app/\\[locale\\]/audit/page.tsx',
      '**/admin-portal/src/app/\\[locale\\]/users/_components/AllUsersTab.tsx',
      '**/admin-portal/src/app/\\[locale\\]/patients/\\[patientId\\]/page.tsx',
      'apps/admin-portal/src/components/audit/EventBrowser.tsx',
      'apps/admin-portal/src/components/AuthGuard.tsx',
      'apps/admin-portal/src/components/SessionTimer.tsx',
      'apps/admin-portal/src/components/ExportButton.tsx',
      'apps/admin-portal/src/components/patients/PatientComparisonTable.tsx',
      'apps/admin-portal/src/components/patients/MergePreview.tsx',
      // Task 4 — lab transport + stragglers
      'apps/lab-lite/src/components/transport/ActiveTransportCard.tsx',
      'apps/lab-lite/src/components/transport/CourierPickupScreen.tsx',
      'apps/lab-lite/src/components/transport/CourierDeliveryScreen.tsx',
      'apps/lab-lite/src/components/finance/PaymentForm.tsx',
      'apps/lab-lite/src/components/sidebar/LabHeader.tsx',
      'apps/lab-lite/src/components/reports/DonorReportReview.tsx',
    ],
    ignores: [
      '**/*.test.tsx',
      '**/*.spec.tsx',
      '**/__tests__/**',
      '**/__mocks__/**',
    ],
    rules: {
      'ultranos/no-hardcoded-ui-string': 'error',
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
