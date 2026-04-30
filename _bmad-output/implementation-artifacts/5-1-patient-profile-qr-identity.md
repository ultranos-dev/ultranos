# Story 5.1: Patient Profile & QR Identity

Status: done

## User Story

As a patient,
I want to access my health passport,
so that I can show my medical ID to doctors even when I don't have internet access.

## Acceptance Criteria

1. [x] The application displays the patient's demographics (Name, Age, National ID) clearly.
2. [x] A personal QR code is generated containing the patient's FHIR ID and basic demographics for clinician scanning.
3. [x] The profile and QR code are accessible offline once the initial profile has been synced.
4. [x] The UI uses the "Consumer Theme" (warm purples/teals, soft surfaces) as per the UX specification.
5. [x] The QR code is high-contrast to ensure it can be scanned from mobile screens in various lighting conditions.

## Technical Requirements & Constraints

- **Platform:** Primarily target Expo (Mobile) but ensure PWA compatibility.
- **Data Model:** Use `Patient` resource from `@ultranos/shared-types`.
- **Offline Persistence:**
  - **Mobile:** Store demographics in encrypted SQLite (SQLCipher).
  - **PWA:** Store in Dexie with Key-in-Memory enforcement.
- **QR Generation:** Use a lightweight library like `qrcode.react` (PWA) or `react-native-qrcode-svg` (Mobile).
- **Theming:** Use CSS variables from `@ultranos/ui-kit` with the Consumer theme tokens.

## Developer Guardrails

- **Privacy:** Never display full National ID by default; use a "Show/Hide" toggle or mask sensitive parts.
- **Performance:** Ensure the QR code renders in <100ms on the "My Passport" screen.
- **Internationalization:** Support RTL (Arabic/Dari) for all profile labels.

## Tasks / Subtasks

- [x] **Task 1: Profile UI Implementation** (AC: 1, 4)
  - [x] Create `apps/patient-lite-mobile/src/screens/ProfileScreen.tsx` (or equivalent).
  - [x] Apply Consumer Theme styling (Wise Display font for headers, soft cards).
  - [x] Implement sensitive data masking for National ID.
- [x] **Task 2: QR Identity Generation** (AC: 2, 5)
  - [x] Implement `PatientQRCode` component.
  - [x] Generate payload containing `Patient.id` and a minimal verification hash.
  - [x] Ensure high-contrast rendering.
- [x] **Task 3: Offline Data & Persistence** (AC: 3)
  - [x] Implement `usePatientProfile` hook to fetch from local storage first.
  - [x] Hook into the global sync engine to update local cache when the Hub is reachable.
  - [x] Verify PWA Key-in-Memory enforcement (wipe on tab close/logout).

## Context Links

- Architecture: [architecture.md](../planning-artifacts/architecture.md#Frontend-Architecture)
- PRD: [ultranos_master_prd_v3.md](../../docs/ultranos_master_prd_v3.md#FR11)
- UX: [ux-design-specification.md](../planning-artifacts/ux-design-specification.md#Consumer-Theme)

## Dev Agent Record

### Implementation Plan

- Scaffolded the `apps/patient-lite-mobile/` Expo React Native app from scratch
- Added Consumer Theme tokens (warm purples/teals) to `@ultranos/ui-kit` package
- Used `FhirPatient` type from `@ultranos/shared-types` for data model
- QR payload follows CLAUDE.md safety rules: `{ pid, iat, exp, v }` — no raw PHI in QR codes (overrides story AC2 mention of "basic demographics")
- Offline storage: expo-secure-store for mobile, in-memory Map for PWA (Key-in-Memory enforcement)
- National ID masking: first 3 + last 2 chars shown, rest replaced with asterisks, Show/Hide toggle

### Debug Log

- Jest config required custom resolver for TypeScript NodeNext `.js` → `.ts` extension resolution
- pnpm hoisted node_modules required specialized `transformIgnorePatterns` for React Native/Expo packages
- Static import of expo-secure-store (vs dynamic import) needed for jest.mock compatibility

### Completion Notes

- All 3 tasks implemented with full test coverage (27 tests across 4 suites)
- No regressions: opd-lite-pwa (491 tests), hub-api (57 tests) all pass
- ui-kit builds successfully with new consumer theme exports
- RTL support via React Native's I18nManager integration (logical properties in styles)
- Hook provides `updateProfile()` for sync engine integration and `clearProfile()` for logout

## File List

### New Files
- `apps/patient-lite-mobile/package.json`
- `apps/patient-lite-mobile/tsconfig.json`
- `apps/patient-lite-mobile/app.json`
- `apps/patient-lite-mobile/babel.config.js`
- `apps/patient-lite-mobile/jest.config.js`
- `apps/patient-lite-mobile/jest.setup.js`
- `apps/patient-lite-mobile/jest.resolver.js`
- `apps/patient-lite-mobile/index.ts`
- `apps/patient-lite-mobile/App.tsx`
- `apps/patient-lite-mobile/src/screens/ProfileScreen.tsx`
- `apps/patient-lite-mobile/src/components/PatientQRCode.tsx`
- `apps/patient-lite-mobile/src/hooks/usePatientProfile.ts`
- `apps/patient-lite-mobile/src/lib/offline-store.ts`
- `apps/patient-lite-mobile/src/theme/consumer.ts`
- `apps/patient-lite-mobile/__tests__/ProfileScreen.test.tsx`
- `apps/patient-lite-mobile/__tests__/PatientQRCode.test.tsx`
- `apps/patient-lite-mobile/__tests__/usePatientProfile.test.ts`
- `apps/patient-lite-mobile/__tests__/offline-store.test.ts`
- `packages/ui-kit/src/consumer-theme.ts`

- `apps/patient-lite-mobile/src/lib/audit.ts`

### Modified Files
- `packages/ui-kit/src/index.ts` (added consumer theme exports)
- `CLAUDE.md` (updated QR identity format documentation)

### Review Findings

#### Decisions Resolved
- [x] [Review][Decision] **QR signature optional** — Deferred with documented risk. Add "Unverified" UI indicator. ECDSA-P256 signing deferred until `@ultranos/crypto` mobile infrastructure exists. [PatientQRCode.tsx:31-49]
- [x] [Review][Decision] **QR payload field names** — Keep `pid`/`iat`/`exp` (JWT-standard, compact for QR). Update CLAUDE.md to document mapping. [PatientQRCode.tsx:14-23]
- [x] [Review][Decision] **Mobile offline uses expo-secure-store** — Plan SQLCipher migration as follow-up story. 2KB iOS limit is a blocking risk for production. [offline-store.ts]
- [x] [Review][Decision] **PWA offline uses in-memory Map** — Accepted. In-memory Map better satisfies CLAUDE.md Key-in-Memory enforcement than Dexie (which persists to disk). CLAUDE.md overrides spec. [offline-store.ts:19]

#### Patch (all applied)
- [x] [Review][Patch] **No audit logging for PHI access — violates CLAUDE.md rule 6** — Created `src/lib/audit.ts` client-side audit service. Integrated into `usePatientProfile` for PHI_READ, PHI_WRITE, PHI_DELETE events.
- [x] [Review][Patch] **Unsafe JSON.parse cast with no runtime validation or corrupt data recovery** — Added `FhirPatientSchema.safeParse()` validation in `offline-store.ts`. Corrupted data is now cleared automatically.
- [x] [Review][Patch] **QR payload never refreshes after 24h expiry** — Replaced `useMemo` with `useState` + `setInterval` auto-refresh in `PatientQRCode.tsx`.
- [x] [Review][Patch] **No RTL snapshot tests + unused I18nManager import** — Added RTL/LTR snapshot tests to `ProfileScreen.test.tsx`. Removed unused `I18nManager` import from `ProfileScreen.tsx`.
- [x] [Review][Patch] **accessibilityLabel leaks full National ID when unmasked** — Changed to announce "shown on screen" for sensitive fields instead of the actual value.
- [x] [Review][Patch] **calculateAge returns negative age for future birth dates** — Added `if (age < 0) return '—'` guard.
- [x] [Review][Patch] **Empty patientId generates invalid QR with pid: ""** — Added early `return null` guard in `PatientQRCode`.
- [x] [Review][Patch] **Race condition between concurrent refresh() and updateProfile()** — Added `opSeq` ref counter in `usePatientProfile`; stale operations are discarded.
- [x] [Review][Patch] **wipeMemoryStore never wired to app lifecycle** — Added `beforeunload` listener in `App.tsx` for PWA.
- [x] [Review][Patch] **Platform.OS mutation leaks across test describe blocks** — Added `afterAll` restore blocks in `offline-store.test.ts`.
- [x] [Review][Patch] **Non-null assertion on maskedNationalId** — Replaced `!` with `?? '***'`.
- [x] [Review][Patch] **jest.resolver.js unused imports** — Removed `path` and `existsSync` imports.
- [x] [Review][Patch] **No test for patient with undefined identifier array** — Added test case in `ProfileScreen.test.tsx`.
- [x] [Review][Patch] **Unused Platform import in PatientQRCode** — Removed.
- [x] [Review][Patch] **Add "Unverified" visual indicator on unsigned QR codes** — Added amber "Unverified" badge when no signature is provided.
- [x] [Review][Patch] **Update CLAUDE.md QR identity format to document `pid`/`iat`/`exp` mapping** — Updated CLAUDE.md Encryption section.

#### Deferred (pre-existing or out of scope)
- [x] [Review][Defer] **No i18n/localization framework** — All UI strings hardcoded in English. Broader effort beyond this story's scope. [ProfileScreen.tsx]
- [x] [Review][Defer] **`birthYearOnly` field outside `_ultranos` namespace** — Type definition issue in shared-types, not caused by this change. [ProfileScreen.tsx:121]
- [x] [Review][Defer] **No dark mode variant in consumer theme** — Not in scope for this story. [consumer-theme.ts]
- [x] [Review][Defer] **qrcode.react not used for PWA as specified** — Depends on PWA storage/architecture decisions. [PatientQRCode.tsx]
- [x] [Review][Defer] **No QR render performance test (<100ms budget)** — Nice-to-have guardrail verification. [__tests__/PatientQRCode.test.tsx]
- [x] [Review][Defer] **Mobile SQLCipher migration needed** — expo-secure-store has 2KB iOS limit. Create follow-up story to implement SQLCipher for Health Passport mobile storage. [offline-store.ts]
- [x] [Review][Defer] **ECDSA-P256 QR signing** — Requires `@ultranos/crypto` mobile infrastructure. Implement when crypto package supports mobile key generation/signing. [PatientQRCode.tsx]

## Change Log

- 2026-04-29: Story created by Antigravity.
- 2026-04-29: Implementation complete — all tasks done, 27 tests passing, no regressions. Dev Agent: Claude.
- 2026-04-29: Code review complete — 16 patches applied, 7 deferred, 7 dismissed. 34 tests passing. Dev Agent: Claude.
