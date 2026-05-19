# Story 11.8: RTL CI Pipeline & Snapshot Tests

Status: done

## Story

As a developer,
I want automated RTL layout validation in the CI pipeline that blocks merges if RTL rendering breaks,
so that every UI PR is verified for correct bidirectional layout before reaching production.

## Acceptance Criteria

1. RTL layout snapshot tests exist for every patient-facing component in `packages/ui-kit` — rendered in both LTR and RTL modes
2. RTL snapshot tests exist for key pages in each app: login, dashboard/home, primary workflow page (SOAP editor, fulfillment, upload, passport)
3. Snapshot tests use Playwright (PWA) or React Native Testing Library (mobile) to capture component screenshots in RTL mode
4. The CI pipeline (GitHub Actions) runs RTL snapshot tests on every PR that modifies `.tsx`, `.css`, or Tailwind config files
5. Any RTL snapshot diff above a configurable threshold (default: 0.1% pixel difference for unintentional changes) fails the PR and blocks merge
6. A visual diff report is generated and attached to the PR as a comment or artifact for easy review
7. Snapshot baselines are committed to the repository and updated intentionally (via a dedicated "update snapshots" command) — never auto-updated
8. The test suite validates that no physical CSS properties (`margin-left`, `padding-right`, etc.) are introduced in changed files — a lint rule enforced in CI
9. Tests verify that navigation icons mirror in RTL and medical icons do NOT mirror
10. The full RTL test suite completes in under 5 minutes to avoid CI bottleneck

## Dependencies

- Story 11.2 (RTL Layout Mirroring — RTL layouts must exist to create meaningful snapshots)

## Tasks / Subtasks

- [x] Task 1: Configure Playwright for RTL screenshot testing (AC: #1, #2, #3)
  - [x] Install `@playwright/test` in the monorepo root (or per-app if not already present)
  - [x] Create `tests/rtl/` directory structure for RTL-specific tests
  - [x] Create a Playwright config that launches each app in both `dir="ltr"` and `dir="rtl"` modes
  - [x] Write helper: `renderInRTL(page, url)` that sets locale cookie to `ar` before navigating
- [x] Task 2: Create ui-kit component RTL snapshots (AC: #1)
  - [x] Create a Storybook or test harness that renders each ui-kit component in isolation
  - [x] For each component: capture LTR screenshot + RTL screenshot as baseline
  - [x] Components to cover: AppShell, DirectionalIcon, LanguageSelector, ClinicalTerm, SessionWarningToast, StaleDataBanner, ReAuthModal
  - [x] Store baselines in `tests/rtl/__snapshots__/` (centralized snapshot directory)
- [x] Task 3: Create app-level page RTL snapshots (AC: #2)
  - [x] OPD Lite pages: `/login`, `/` (dashboard)
  - [x] Pharmacy Lite pages: `/login`, `/` (fulfillment dashboard)
  - [x] Lab Lite pages: `/login`, `/` (upload dashboard), `/upload`
  - [x] Uses locale cookie-based direction switching for consistent screenshots
  - [x] Store baselines in centralized `tests/rtl/__snapshots__/` directory
- [x] Task 4: CI pipeline integration (AC: #4, #5, #6, #10)
  - [x] Create `.github/workflows/rtl-validation.yml`
  - [x] Trigger on PR when: `**/*.tsx`, `**/*.css`, `**/tailwind.config.*` files are modified
  - [x] Run Playwright RTL tests with `--reporter=html` for visual diff output
  - [x] Configure pixel diff threshold: 0.1% tolerance (handles anti-aliasing differences)
  - [x] On failure: upload visual diff report as GitHub Actions artifact
  - [x] On failure: post a PR comment with "RTL validation failed — see artifacts for visual diff"
  - [x] Target: full suite runs in <5 minutes (4 parallel workers)
- [x] Task 5: Physical CSS property lint rule (AC: #8)
  - [x] Enhanced existing `@ultranos/rtl/no-physical-css` ESLint rule to also flag:
    - Inline style properties: `marginLeft`, `marginRight`, `paddingLeft`, `paddingRight`, `left`, `right`, `borderLeft`, `borderRight`
    - Physical `textAlign` values: `'left'` → `'start'`, `'right'` → `'end'`
    - Tailwind classes: `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right` (already existed)
  - [x] Configured as `error` severity in `packages/config-eslint/index.js` (already was)
  - [x] Included in CI workflow via `pnpm lint` step
- [x] Task 6: Icon mirroring validation (AC: #9)
  - [x] Playwright tests verify computed transform: navigation icon gets `matrix(-1, 0, 0, 1, 0, 0)` in RTL
  - [x] Playwright tests verify medical icon gets `none` in both LTR and RTL
  - [x] Existing Vitest tests in `packages/ui-kit/src/__tests__/DirectionalIcon.test.tsx` cover CSS variable mechanism
  - [x] Visual comparison screenshots for both icon categories in both directions
- [x] Task 7: Snapshot update workflow (AC: #7)
  - [x] Documented snapshot update process in `CONTRIBUTING.md`
  - [x] Created script: `pnpm rtl:update-snapshots` that regenerates all baselines
  - [x] CI check enforces `[rtl-snapshots]` tag in commit messages that modify snapshot files
  - [x] `snapshot-commit-check` job in `rtl-validation.yml` validates commit messages
- [x] Task 8: Patient Lite Mobile RTL tests (AC: #1, #2)
  - [x] Installed `jest-image-snapshot` for mobile component RTL testing
  - [x] Created RTL test wrapper (`forceRTL()`) that sets `I18nManager.forceRTL(true)`
  - [x] Snapshot tests for: BottomTabBar (tab navigator), PatientHealthCard (3 variants), VisualLanguageGateway
  - [x] Included in CI pipeline via `rtl-mobile` job (runs on Node, no emulator needed)

## Technical Notes

- CLAUDE.md: "RTL: snapshot tests for every patient-facing component in both LTR and RTL"
- CLAUDE.md: "The CI pipeline runs RTL layout snapshots — don't skip them"
- PRD CL-18: "RTL layout validation checklist 100% passed for Arabic and Dari on both iOS and Android"
- PRD Section 4.2: "RTL layout validation must be a required gate in the CI/CD pipeline for every UI PR"
- Playwright screenshot comparison uses `toHaveScreenshot()` with configurable `maxDiffPixelRatio`
- For mobile snapshots: consider using Detox for E2E screenshot testing if jest-image-snapshot is insufficient
- The 5-minute target is achievable with Playwright's parallelism (sharding across 3-4 workers)

## Dev Agent Record

### Implementation Plan
- Task 5 (Physical CSS lint rule) already exists: `packages/config-eslint/rules/no-physical-css.js` configured as `error` in `packages/config-eslint/index.js`
- Task 6 (Icon mirroring) partially covered by existing `packages/ui-kit/src/__tests__/rtl-layout.test.tsx`
- Playwright to be installed at monorepo root for PWA screenshot testing
- jest-image-snapshot for Patient Lite Mobile RTL tests

### Debug Log
- ESLint rule enhanced to cover inline style properties in addition to Tailwind classes
- Existing ui-kit tests all pass (212/212) after changes
- ESLint rule tests verified via node --input-type=module (config-eslint has no vitest setup)
- Pre-existing lint errors in ui-kit are unrelated (unused imports in test files)

### Completion Notes
All 8 tasks completed. The RTL CI pipeline now provides:
1. **Playwright visual regression** for PWA apps and ui-kit components (LTR + RTL)
2. **ESLint enforcement** of logical CSS properties (Tailwind classes + inline styles)
3. **Icon mirroring validation** via both Vitest unit tests and Playwright computed style checks
4. **Mobile RTL snapshots** via Jest + React Native Testing Library
5. **CI pipeline** with 3 parallel jobs: lint, PWA snapshots, mobile snapshots
6. **Snapshot governance** via commit message tag enforcement and documented update workflow

## File List

### New Files
- `playwright.config.ts` — Playwright config with 8 projects (LTR/RTL x 4 apps)
- `tests/rtl/helpers/rtl-helpers.ts` — Shared helpers (renderInRTL, renderInLTR, takeRTLScreenshot)
- `tests/rtl/ui-kit/components.spec.ts` — UI Kit component screenshot tests
- `tests/rtl/ui-kit/icon-mirroring.spec.ts` — Icon mirroring validation (computed styles + visual)
- `tests/rtl/apps/opd-lite.spec.ts` — OPD Lite page screenshots (login, dashboard)
- `tests/rtl/apps/pharmacy-lite.spec.ts` — Pharmacy Lite page screenshots (login, dashboard)
- `tests/rtl/apps/lab-lite.spec.ts` — Lab Lite page screenshots (login, dashboard, upload)
- `packages/ui-kit/test-harness/vite.config.ts` — Vite config for component test harness
- `packages/ui-kit/test-harness/index.html` — Test harness HTML entry
- `packages/ui-kit/test-harness/main.tsx` — Test harness React app rendering all components
- `.github/workflows/rtl-validation.yml` — CI pipeline (lint + PWA snapshots + mobile snapshots + commit check)
- `CONTRIBUTING.md` — RTL snapshot testing documentation
- `apps/patient-lite-mobile/src/__tests__/rtl-helpers.ts` — Mobile RTL test helper (forceRTL)
- `apps/patient-lite-mobile/src/__tests__/rtl-snapshots.test.tsx` — Mobile RTL snapshot tests

### Modified Files
- `package.json` — Added rtl:test, rtl:update-snapshots, rtl:report scripts; added @playwright/test
- `packages/ui-kit/package.json` — Added vite, @vitejs/plugin-react devDeps; added harness script
- `packages/config-eslint/rules/no-physical-css.js` — Enhanced to flag inline style properties
- `packages/config-eslint/rules/__tests__/no-physical-css.test.js` — Added inline style test cases
- `apps/patient-lite-mobile/package.json` — Added jest-image-snapshot devDep

### Review Findings

- [x] [Review][Decision→Defer] Missing OPD Lite SOAP editor page snapshot (AC #2) — deferred: requires authenticated encounter context and test fixtures; better suited for a dedicated e2e story
- [x] [Review][Decision→Defer] Missing Patient Lite Mobile passport/QR page test (AC #2) — deferred: Epic 18 still in-progress, passport screen will likely change; test when screens stabilize
- [x] [Review][Decision→Exclude] Admin Portal excluded from RTL page tests (AC #2) — accepted: Admin Portal is provider-facing, not patient-facing per AC wording; exclusion documented
- [x] [Review][Patch] `renderInRTL` cookie domain resolves to `'null'` on first page — fixed: hardcoded `localhost` domain [tests/rtl/helpers/rtl-helpers.ts]
- [x] [Review][Patch] No `timeout-minutes` on CI jobs to enforce 5-minute target (AC #10) — fixed: added timeout-minutes to all 4 jobs [.github/workflows/rtl-validation.yml]
- [x] [Review][Patch] CI workers (4) + 4 web servers may OOM on ubuntu-latest — fixed: reduced to 2 workers [playwright.config.ts]
- [x] [Review][Patch] `rtl-mobile` job runs `pnpm build` for all workspaces — fixed: scoped to shared packages only [.github/workflows/rtl-validation.yml]
- [x] [Review][Patch] CI path triggers miss `.ts` files — fixed: added `**/*.ts` to path triggers [.github/workflows/rtl-validation.yml]
- [x] [Review][Patch] Icon mirroring tests hardcode direction — fixed: derive from project name, reduced from 6 to 4 tests [tests/rtl/ui-kit/icon-mirroring.spec.ts]
- [x] [Review][Patch] `takeRTLScreenshot` helper is dead code — fixed: removed along with unused helpers [tests/rtl/helpers/rtl-helpers.ts]
- [x] [Review][Patch] Snapshot commit tag check bypassable via merge commits — fixed: added `-m` flag to `git diff-tree` [.github/workflows/rtl-validation.yml]
- [x] [Review][Defer] ESLint rule misses physical classes inside `cn()`/`clsx()` utility function arguments — only string literals and template literals are checked [packages/config-eslint/rules/no-physical-css.js] — deferred, pre-existing limitation
- [x] [Review][Defer] ESLint rule does not catch physical CSS properties in `.css` files — rule operates on JSX AST only [packages/config-eslint/rules/no-physical-css.js] — deferred, pre-existing limitation
- [x] [Review][Defer] No Dari (`prs`) locale Playwright project — only Arabic (`ar`) is configured for RTL testing [playwright.config.ts] — deferred, future enhancement

## Change Log
- 2026-05-18: Code review completed and patches applied — 3 decisions resolved, 8 patches fixed, 3 deferred (W59-W63), 4 dismissed
- 2026-05-17: Implemented Story 11.8 — RTL CI Pipeline & Snapshot Tests (all 8 tasks)
