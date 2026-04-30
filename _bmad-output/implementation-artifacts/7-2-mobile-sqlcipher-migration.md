# Story 7.2: Mobile SQLCipher Migration

Status: done

## User Story

As a mobile clinician,
I want my local database to be encrypted with a hardware-backed key,
so that I can safely store PHI in high-risk field environments.

## Acceptance Criteria

1. [x] The local SQLite database in the Expo mobile app is replaced with or upgraded to SQLCipher.
2. [x] The entire database file is encrypted at rest using AES-256.
3. [x] The encryption key is stored in the device's secure enclave (iOS Keychain / Android Keystore).
4. [x] Unlocking the database requires successful biometric authentication (FaceID/TouchID/Fingerprint).
5. [x] Existing plain-text SecureStore data (if any) is migrated to the encrypted database on first run. (Note: no prior plain SQLite database existed in Health Passport; migration scope is SecureStore key-value entries only.)

## Technical Requirements & Constraints

- **Platform:** Mobile (Expo / React Native).
- **Library:** Use `expo-sqlite/next` with SQLCipher support or a custom development client with `react-native-sqlcipher`.
- **Key Management:**
  - Use `expo-local-authentication` for biometric prompts.
  - Use `expo-secure-store` to store the database passphrase (acknowledging the 2KB limit, which is sufficient for a 32-byte key).
- **Persistence:** Ensure the database is re-locked when the app moves to the background for more than 3 minutes.

## Developer Guardrails

- **Data Integrity:** Implement a backup/check mechanism before performing the SQLCipher migration to prevent data loss.
- **Fail-Safe:** If biometric authentication is disabled or unavailable, provide a fallback to the device passcode.

## Tasks / Subtasks

- [x] **Task 1: SQLCipher Integration** (AC: 1, 2)
  - [x] Update Expo project to include SQLCipher dependencies.
  - [x] Implement `getEncryptedDbConnection()` helper in `apps/health-passport`.
- [x] **Task 2: Biometric Key Unlocking** (AC: 3, 4)
  - [x] Create a `MobileKeyService` that wraps `expo-secure-store` and `expo-local-authentication`.
  - [x] Implement the "Unlock Database" flow on app startup.
- [x] **Task 3: Migration Logic** (AC: 5)
  - [x] Implement a migration script that detects an unencrypted SecureStore data and imports it into the new encrypted SQLCipher instance.
  - [x] Securely delete the old unencrypted SecureStore entries after successful migration.

## Context Links

- Architecture: [architecture.md](../planning-artifacts/architecture.md#Mobile-Security-SQLCipher)
- PRD: [ultranos_master_prd_v3.md](../../docs/ultranos_master_prd_v3.md#NFR3)
- Deferred Work: [deferred-work.md](deferred-work.md) (D69, D70, D73)

## Dev Agent Record

### Implementation Plan

- Target app: `apps/health-passport` (existing Expo/RN app) — not `apps/opd-mobile` (doesn't exist)
- D69/D73 deferred items drove this story: SecureStore 2KB limit for Health Passport
- SQLCipher via `expo-sqlite` with PRAGMA key for AES-256 encryption
- `MobileKeyService` wraps `expo-secure-store` (passphrase storage) + `expo-local-authentication` (biometric gate)
- Migration detects existing SecureStore data and imports into encrypted SQLCipher DB
- 3-minute background re-lock via AppState listener

### Debug Log

- jest.mock factory approach failed for hook tests due to module resolution mismatch — auto-mock pattern with `jest.mock('module')` (no factory) resolves correctly

### Completion Notes

**Task 1 — SQLCipher Integration:**
- Added `expo-sqlite ~14.0.0`, `expo-local-authentication ~15.0.0`, `expo-file-system ~18.0.0` to package.json
- Enabled SQLCipher via `app.json` config plugin `["expo-sqlite", { "useSQLCipher": true }]`
- `encrypted-db.ts`: singleton DB connection with `PRAGMA key` (hex-encoded 32-byte passphrase), `cipher_page_size = 4096`, WAL mode, schema creation (patient_profiles, medical_history, consents tables)
- 11 tests covering DB open, PRAGMA application, singleton behavior, schema creation, PHI-not-logged

**Task 2 — Biometric Key Unlocking:**
- `mobile-key-service.ts`: generates 32-byte random passphrase via `expo-crypto`, stores in SecureStore with `WHEN_PASSCODE_SET_THIS_DEVICE_ONLY` (hardware-backed), biometric gate via `expo-local-authentication` with passcode fallback
- `use-database-unlock.ts`: React hook managing unlock/lock lifecycle, AppState listener for 3-minute background re-lock
- 11 tests for key service (generation, storage, biometric auth, passcode fallback, no-security scenario)
- 9 tests for unlock hook (state management, error handling, AppState listener cleanup, background re-lock)

**Task 3 — Migration Logic:**
- `migration.ts`: detects existing SecureStore data, reads patient profile/medical history/consents, writes to SQLCipher DB, only deletes SecureStore entries after successful write (fail-safe)
- 7 tests covering migration detection, data transfer, secure deletion, no-op when empty, rollback on failure

**Total: 38 new tests, all passing. No regressions (3 pre-existing failures in consent-sync/useConsentSettings unrelated to this story).**

## File List

- `apps/health-passport/package.json` — modified (added expo-sqlite, expo-local-authentication, expo-file-system deps)
- `apps/health-passport/app.json` — modified (added expo-sqlite SQLCipher plugin, expo-local-authentication plugin)
- `apps/health-passport/jest.setup.js` — modified (added global mocks for expo-local-authentication, expo-file-system, expo-sqlite)
- `apps/health-passport/src/lib/encrypted-db.ts` — new (SQLCipher database connection singleton)
- `apps/health-passport/src/lib/mobile-key-service.ts` — new (biometric key management)
- `apps/health-passport/src/lib/migration.ts` — new (SecureStore → SQLCipher migration)
- `apps/health-passport/src/hooks/use-database-unlock.ts` — new (unlock lifecycle hook)
- `apps/health-passport/__tests__/encrypted-db.test.ts` — new (11 tests)
- `apps/health-passport/__tests__/mobile-key-service.test.ts` — new (11 tests)
- `apps/health-passport/__tests__/use-database-unlock.test.ts` — new (9 tests)
- `apps/health-passport/__tests__/migration.test.ts` — new (7 tests)

### Review Findings

- [x] [Review][Decision] **D1: getEncryptedDbConnection bypasses biometric auth at data layer** — Resolved: Option 1 (unlock token pattern). Added `markAuthenticated()` gate to `encrypted-db.ts`. [FIXED]
- [x] [Review][Defer] **D2: No `requireAuthentication: true` on SecureStore options** — Deferred: accept app-level biometric check for now. Revisit when auth architecture is finalized.
- [x] [Review][Decision] **D3: Migration targets SecureStore, not plain SQLite files** — Resolved: Option 2. Updated AC5 wording to clarify SecureStore-only scope (no prior SQLite DB existed). [FIXED]
- [x] [Review][Patch] **P1: No PRAGMA key verification** — Added `SELECT count(*) FROM sqlite_master` after PRAGMA key. [FIXED]
- [x] [Review][Patch] **P2: Migration not wrapped in transaction** — Added BEGIN/COMMIT/ROLLBACK wrapping all inserts. [FIXED]
- [x] [Review][Patch] **P3: JSON.parse in migration with no try/catch** — Added try/catch with descriptive error messages; migration aborts on corrupt data. [FIXED]
- [x] [Review][Patch] **P4: SecureStore.setItemAsync failure loses generated passphrase** — Added read-back verification after store write. [FIXED]
- [x] [Review][Patch] **P5: closeDatabase() doesn't cancel in-flight init** — closeDatabase() now awaits dbPromise before closing. Resets authenticated flag. [FIXED]
- [x] [Review][Patch] **P6: Singleton init failure leaks DB handle** — Added try/catch in initializeDatabase() that closes handle on failure. [FIXED]
- [x] [Review][Patch] **P7: Patient profile missing id aborts migration** — Changed from silent skip to explicit error throw. [FIXED]
- [x] [Review][Patch] **P8: Consent with missing fields tracked as skipped** — Added skippedRecords counter; consentsMigrated only set true if zero skipped. [FIXED]
- [x] [Review][Patch] **P9: PRAGMA key passphrase not validated as hex** — Added HEX_REGEX validation before SQL interpolation. [FIXED]
- [x] [Review][Patch] **P10: unlockWithBiometrics maps all auth failures to 'cancelled'** — Added mapAuthError() mapping lockout, system_cancel, etc. to distinct reasons. [FIXED]
- [x] [Review][Patch] **P11: Double-unlock race** — Added isUnlocking guard at start of unlock(). [FIXED]
- [x] [Review][Dismiss] **P12: expo-crypto not declared in package.json** — False positive; expo-crypto already listed in dependencies. [DISMISSED]
- [x] [Review][Patch] **P13: closeDatabase() called without await in test** — Added await to beforeEach. [FIXED]
- [x] [Review][Defer] **W1: deletePassphrase() leaves DB file encrypted with lost key** — Exported utility that deletes the key without re-keying the DB. Not called in current change; intended for future key rotation. — deferred, not in scope
- [x] [Review][Defer] **W2: isUnlocked hook state can diverge from actual DB singleton state** — External callers of closeDatabase() desync the hook. Architectural concern requiring context provider pattern. — deferred, pre-existing design

## Change Log

- 2026-04-29: Story created by Antigravity.
- 2026-04-29: Implementation started — target changed from `apps/opd-mobile` to `apps/health-passport` per user decision.
- 2026-04-29: Implementation complete — all 3 tasks done, 38 tests passing, status → review.
- 2026-04-29: Code review complete — 13 patches applied, 3 deferred, 8 dismissed. 42 tests passing. Status → done.
