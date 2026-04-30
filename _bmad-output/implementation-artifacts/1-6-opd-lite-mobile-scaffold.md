# Story 1.6: OPD-Lite Mobile Scaffold

Status: done

## Story

As a system architect,
I want to scaffold the `apps/opd-lite-mobile/` Expo application shell,
so that the mobile clinician spoke is acknowledged in the codebase and ready for future development when field GP support is prioritized.

## Context

The architecture specifies an Expo Android app for mobile clinicians (`opd-lite-mobile`) as one of the 6 core spoke nodes. This app is **not in scope for active development** in the current release, but the audit report (Finding 1.2) identified that its absence should be formally acknowledged. This story creates the minimal scaffold — no functional clinical code, just the app shell with correct dependencies and a clear README marking it as future work.

## Acceptance Criteria

1. [x] `apps/opd-lite-mobile/` exists as a valid Expo project with `package.json` (`@ultranos/opd-lite-mobile`).
2. [x] The app depends on shared packages: `@ultranos/shared-types`, `@ultranos/sync-engine`, `@ultranos/ui-kit`.
3. [x] A placeholder home screen renders with a "Coming Soon" message and the Ultranos branding.
4. [x] `README.md` in the app directory documents: purpose, target user (field GPs), architectural role (clinician spoke with SQLCipher), and deferred status with link to Story 1.4.
5. [x] The app is registered in `pnpm-workspace.yaml` and `turbo.json`.
6. [x] TypeScript compiles cleanly: `pnpm -F opd-lite-mobile typecheck` passes.

## Tasks / Subtasks

- [x] **Task 1: Initialize Expo Project** (AC: 1, 2, 5)
  - [x] Create `apps/opd-lite-mobile/` using Expo SDK with TypeScript template.
  - [x] Configure `package.json` with name `@ultranos/opd-lite-mobile`.
  - [x] Add workspace dependencies for `@ultranos/shared-types`, `@ultranos/sync-engine`, `@ultranos/ui-kit`.
  - [x] Register in `pnpm-workspace.yaml` and add to `turbo.json` pipelines.

- [x] **Task 2: Placeholder Screen** (AC: 3)
  - [x] Create a minimal home screen with Ultranos branding and "Coming Soon — Mobile Clinician App" text.
  - [x] Ensure the screen renders without errors on Android emulator or Expo Go.

- [x] **Task 3: Documentation** (AC: 4)
  - [x] Create `apps/opd-lite-mobile/README.md` documenting:
    - Purpose: Mobile clinician app for field GPs in rural/offline environments.
    - Target user: Field General Practitioners.
    - Architecture role: Clinician spoke with SQLCipher encrypted local storage, offline-first.
    - Status: Scaffolded only. Active development deferred. See Story 1.4 for mobile identity verification requirements.
    - Future dependencies: `expo-sqlite` with SQLCipher, `expo-secure-store`, biometric auth.

- [x] **Task 4: Verify Build** (AC: 6)
  - [x] Run `pnpm -F opd-lite-mobile typecheck` and confirm clean.
  - [x] Verify `pnpm install` resolves all workspace dependencies.

## Dev Notes

- **This is a scaffold only.** Do not implement any clinical functionality, local database, or sync integration.
- **Naming:** The directory is `opd-lite-mobile` (not `opd-android`) to leave room for potential iOS clinician use in the future.
- **Expo SDK:** Use the same Expo SDK version as `apps/health-passport/` for consistency.
- **No tests required** — there is no logic to test. A typecheck pass is sufficient.

### References

- Architecture: [architecture.md](../planning-artifacts/architecture.md) — line 169
- Audit Report: [audit-report-2026-04-30.md](audit-report-2026-04-30.md) — Finding 1.2
- Story 1.4: Mobile Identity Verification (BACKLOG — future activation)

## Dev Agent Record

### Implementation Plan

Scaffolded `apps/opd-lite-mobile/` as a minimal Expo project matching `health-passport` patterns:
- Used Expo SDK ~52.0.0 (same as health-passport) with React 19 + RN 0.76
- Structured project with the same tsconfig, babel, and entry point patterns
- Workspace already covers `apps/*` glob — no changes needed to `pnpm-workspace.yaml`
- Turbo.json uses task-level config (not per-app) — no changes needed

### Completion Notes

All 4 tasks completed successfully:
- **Task 1:** Created Expo project with `package.json` (`@ultranos/opd-lite-mobile`), workspace deps (`shared-types`, `sync-engine`, `ui-kit`), tsconfig, babel, app.json, and entry point. Workspace registration via existing `apps/*` glob.
- **Task 2:** Created `App.tsx` with Ultranos branding, "Coming Soon — Mobile Clinician App" text, and clean styling. No clinical logic.
- **Task 3:** Created `README.md` documenting purpose (field GP mobile app), target user, architecture role (clinician spoke, SQLCipher, offline-first), deferred status with Story 1.4 reference, and future dependencies.
- **Task 4:** `pnpm -F opd-lite-mobile typecheck` passes cleanly. `pnpm install` resolves all workspace dependencies correctly.

No tests required per story dev notes — no logic to test.

## File List

- `apps/opd-lite-mobile/package.json` (new)
- `apps/opd-lite-mobile/app.json` (new)
- `apps/opd-lite-mobile/tsconfig.json` (new)
- `apps/opd-lite-mobile/babel.config.js` (new)
- `apps/opd-lite-mobile/index.ts` (new)
- `apps/opd-lite-mobile/App.tsx` (new)
- `apps/opd-lite-mobile/README.md` (new)

### Review Findings

- [x] [Review][Decision] **DN1: No `test` script defined** — Resolved: added no-op `"test": "echo 'No tests — scaffold only'"` [package.json]
- [x] [Review][Decision] **DN2: Package name convention inconsistency** — Resolved: accepted inconsistency. Scoped `@ultranos/` is the better convention; health-passport is the outlier. [package.json]
- [x] [Review][Decision] **DN3: Workspace protocol mismatch** — Resolved: switched to `workspace:^` for consistency with health-passport. [package.json]
- [x] [Review][Patch] **P1: Lint script targets nonexistent `src/` directory** — Fixed: changed target from `src` to `.` [package.json]
- [x] [Review][Defer] W1: RTL support absent in scaffold UI — deferred, scaffold only with no clinical UI
- [x] [Review][Defer] W2: No SQLCipher configured — deferred, explicitly out of scope per story
- [x] [Review][Defer] W3: Hardcoded English strings — deferred, no i18n at scaffold stage
- [x] [Review][Defer] W4: No expo-status-bar usage — deferred, placeholder screen
- [x] [Review][Defer] W5: No app.json icon/splash/bundleId config — deferred, scaffold only

## Change Log

- 2026-04-30: Story implemented — scaffolded `apps/opd-lite-mobile/` Expo project with workspace dependencies, placeholder screen, and documentation. All ACs satisfied. Status → review.
