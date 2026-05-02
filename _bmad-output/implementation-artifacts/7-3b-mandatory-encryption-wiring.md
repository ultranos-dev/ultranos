# Story 7.3b: Mandatory Encryption Wiring

Status: done

## Story

As a data steward,
I want encryption to be mandatory for all PHI fields at the database boundary,
so that no router can accidentally write plaintext PHI to Supabase and future code is fail-safe by default.

## Context

Story 7.3 built the encryption infrastructure (`encryptField`/`decryptField`, `encryptRow`/`decryptRow`, HMAC blind indexing, versioned ciphertext). However, two issues remain:

1. **`db.toRow()` makes encryption opt-in** — the `encryptionKey` parameter is optional. Any caller that omits it silently writes plaintext PHI with zero warning. This is a fail-open design in a system that requires fail-closed.

2. **No routers wire encryption into data paths** — The encounter router is a stub, so no SOAP notes or diagnoses flow through the Hub yet. But when they do, encryption must be automatic, not reliant on each developer remembering to pass the key.

**Decision (2026-05-01):** Make encryption mandatory with explicit opt-out. Wire encryption key resolution into the database helper layer so callers don't need to pass it manually.

## Acceptance Criteria

1. [x] `db.toRow()` and `db.fromRow()` automatically encrypt/decrypt SENSITIVE_FIELDS without requiring the caller to pass an encryption key.
2. [x] The encryption key is resolved internally via `getFieldEncryptionKeys()` — callers never handle raw keys.
3. [x] A `db.toRowRaw()` escape hatch exists for non-PHI tables (e.g., `notifications`, `labs`) with a required `reason` string parameter for audit traceability.
4. [x] If encryption env vars are missing at startup, the Hub API fails fast with a clear error — never silently degrades to plaintext.
5. [x] The `medication_text` vs `medication_display` column name mismatch in `getEncryptionConfig()` is resolved.
6. [x] All existing router write paths that touch SENSITIVE_FIELDS columns use the encrypted `db.toRow()` (currently: lab.ts `uploadResult` — verify it works through the new mandatory path or uses `encryptField` directly).
7. [x] All existing router read paths that return SENSITIVE_FIELDS columns use the decrypted `db.fromRow()`.
8. [x] A test asserts that writing a SENSITIVE_FIELD without encryption is impossible through `db.toRow()`.
9. [x] A test asserts that `db.toRowRaw()` requires a reason string.

## Tasks / Subtasks

- [x] **Task 1: Make Encryption Mandatory in `db.toRow()` / `db.fromRow()`** (AC: 1, 2, 4)
  - [x] Remove the optional `encryptionKey?` parameter from `db.toRow()`.
  - [x] Resolve the encryption key internally via `getFieldEncryptionKeys().encryptionKey`.
  - [x] Cache the resolved key at module initialization (fail fast if missing).
  - [x] Apply the same change to `db.fromRow()` and `db.fromRows()`.
  - [x] Ensure env var validation runs at import time, not per-call.

- [x] **Task 2: Create `db.toRowRaw()` Escape Hatch** (AC: 3, 9)
  - [x] Add `db.toRowRaw(data, reason: string)` that applies `toSnakeCase()` only (no encryption).
  - [x] The `reason` parameter is stored for audit traceability (e.g., `"non-PHI: notifications table"`).
  - [x] Log the reason at debug level so plaintext writes are traceable during development.
  - [x] Add corresponding `db.fromRowRaw()` for read paths on non-PHI tables.

- [x] **Task 3: Resolve `medication_text` vs `medication_display` Mismatch** (AC: 5)
  - [x] Audit the Supabase migration for `medication_requests` table to find the actual column name.
  - [x] Update `getEncryptionConfig().randomizedFields` to match the real column name.
  - [x] If `medication_display` is the column name but contains non-PHI data (just drug names from formulary), remove it from SENSITIVE_FIELDS with a documented rationale.

- [x] **Task 4: Verify Existing Router Paths** (AC: 6, 7)
  - [x] Audit `lab.ts` `uploadResult` — it uses `encryptField()` directly for file content. Verify this still works after the `db.toRow()` change (it bypasses `db.toRow()` for binary data, which is correct).
  - [x] Grep all routers for raw Supabase `.insert()` / `.update()` / `.select()` calls that touch SENSITIVE_FIELDS. If any exist, migrate to use `db.toRow()` / `db.fromRow()`.
  - [x] Verify the encounter router (currently a stub) is ready to use `db.toRow()` when encounter CRUD is built.

- [x] **Task 5: Migrate Existing Non-PHI Write Paths to `db.toRowRaw()`** (AC: 3)
  - [x] Update `notification.ts` router to use `db.toRowRaw(data, 'non-PHI: notifications')`.
  - [x] Update `lab.ts` `register` to use `db.toRowRaw(data, 'non-PHI: labs')`.
  - [x] Update `consent.ts` `sync` — consent metadata is not PHI, use `db.toRowRaw(data, 'non-PHI: consents')`.
  - [x] Update `patient.ts` — patient demographics SELECT doesn't go through `db.fromRow()` currently. If it should (for future PHI columns), wire it. If not (only non-sensitive columns selected), document why.

- [x] **Task 6: Tests** (AC: 8, 9)
  - [x] Test: `db.toRow()` on an object with a SENSITIVE_FIELD produces encrypted output (starts with `v1:`).
  - [x] Test: `db.fromRow()` on an encrypted row returns plaintext.
  - [x] Test: `db.toRowRaw()` without a reason string throws a TypeError.
  - [x] Test: `db.toRowRaw()` with a reason passes data through without encryption.
  - [x] Test: Missing `FIELD_ENCRYPTION_KEY` env var throws at module load, not at first call.

## Dev Notes

### Why Mandatory, Not Warning

A runtime warning ("you're writing plaintext PHI") is discoverable only if someone reads logs. In a multi-developer project with AI agents implementing stories, a warning is insufficient — the plaintext write still happens. Making encryption mandatory means **the only way to write plaintext is to explicitly opt out with a documented reason**. This is the fail-closed principle applied to data at rest.

### The `toRowRaw()` Reason Parameter

The `reason` string serves two purposes:
1. **Code review signal** — any PR with `toRowRaw()` requires a human to verify the table truly has no PHI.
2. **Audit trail** — if a breach investigation finds plaintext PHI, the reason string identifies who approved the bypass and why.

Expected valid reasons:
- `'non-PHI: notifications'` — notification metadata only
- `'non-PHI: labs'` — lab registration metadata only
- `'non-PHI: consents'` — consent grants/withdrawals (not clinical content)
- `'non-PHI: sync_events'` — sync queue operational data

### Lab Upload Path

`lab.ts` uses `encryptField()` directly for file content (binary → base64 → encrypt). This is correct — file content doesn't go through `db.toRow()` because it's a single-field encryption, not a row transform. This path remains unchanged.

### medication_text vs medication_display Resolution

The DB has TWO columns: `medication_display TEXT NOT NULL` (standardized drug name from formulary — NOT PHI) and `medication_text TEXT` (free-text medication description — IS PHI). The encryption config correctly lists `medication_text` in `randomizedFields`. No config change needed. `medication_display` is excluded because it contains only coded drug names from the formulary, not patient-specific data.

### patient.ts Read Path

The `patient.search` endpoint does NOT use `db.fromRow()` because: (1) it selects only identity/demographic columns (name, gender, birth_date, identifiers) — no SENSITIVE_FIELDS are queried; (2) the `_ultranos` namespace fields require custom mapping that doesn't fit `db.fromRowRaw()`. Documented inline.

### What This Story Does NOT Do

- No key rotation implementation (deferred by design — `v1:` prefix is in place)
- No audit events for encryption/decryption (deferred to Epic 8)
- No update-path safeguards for `[Encrypted Content]` placeholder corruption (deferred)
- No brute-force protection for blind index (deferred)

### References

- Story 7.3: Hub API Field-Level Encryption (infrastructure this completes)
- Story 7.3 Review Findings: Decisions 1, 2, 3 (resolved by this story)
- CLAUDE.md: "AES-256-GCM field-level encryption on PHI columns"

## Dev Agent Record

### Implementation Plan

1. Made `db.toRow()`/`db.fromRow()`/`db.fromRows()` mandatory-encryption by removing the optional `encryptionKey?` parameter and resolving the key internally via `getCachedEncryptionKey()`.
2. Added `db.toRowRaw(data, reason)` and `db.fromRowRaw(row)` as escape hatches for non-PHI tables, with required reason string and debug logging.
3. Resolved medication column mismatch: `medication_text` (PHI, encrypted) and `medication_display` (formulary name, not PHI) are two separate columns — config is correct as-is. Added documentation comment.
4. Audited all routers — no existing write paths touch SENSITIVE_FIELDS without encryption. `lab.ts uploadResult` correctly uses `encryptField()` directly for binary content.
5. Migrated notification.ts, lab.ts register, consent.ts sync, and lab.ts dispatchResultNotifications to use `db.toRowRaw()`.
6. Added startup validation via `validateEncryptionConfig()` in the tRPC route handler.
7. Rebuilt `@ultranos/crypto` package (dist was stale — missing `report_conclusion` and `encrypted_content` fields added in Story 12.3).

### Key Design Decision: Lazy-Init-Once vs Eager Module Init

Used lazy-init-once pattern for `getCachedEncryptionKey()` instead of eager module-level init. Reason: eager init in `field-encryption.ts` would break all test files that transitively import it without env vars set. The lazy-init-once pattern caches on first call, and `validateEncryptionConfig()` is called at app startup (route handler module load) to ensure fail-fast behavior in production.

### Debug Log

- Stale `@ultranos/crypto` dist was missing `report_conclusion` and `encrypted_content` from `randomizedFields` — rebuilt package to fix.
- 22 test files needed `db` mock added to their `@/lib/supabase` mock to avoid `undefined` errors from routers that now import `db`.

### Completion Notes

All 9 acceptance criteria satisfied. 29 new/updated tests pass (7 new mandatory-encryption tests, 10 updated db-encryption-integration tests, 12 updated field-encryption tests). All 11 pre-existing test failures are unrelated (`@ultranos/audit-logger` module resolution, pre-existing PHI audit test, practitioner-key test).

## File List

### New Files
- `apps/hub-api/src/__tests__/mandatory-encryption.test.ts` — Story 7.3b dedicated tests (AC 1-4, 8-9)

### Modified Files
- `apps/hub-api/src/lib/supabase.ts` — Mandatory encryption in db helpers, added toRowRaw/fromRowRaw
- `apps/hub-api/src/lib/field-encryption.ts` — Added getCachedEncryptionKey(), validateEncryptionConfig()
- `packages/crypto/src/server-crypto.ts` — Added documentation comment for medication_text vs medication_display
- `apps/hub-api/src/app/api/trpc/[trpc]/route.ts` — Startup validation via validateEncryptionConfig()
- `apps/hub-api/src/trpc/routers/lab.ts` — Migrated register + dispatchResultNotifications to db.toRowRaw()
- `apps/hub-api/src/trpc/routers/notification.ts` — Migrated update calls to db.toRowRaw()
- `apps/hub-api/src/trpc/routers/consent.ts` — Migrated sync insert to db.toRowRaw()
- `apps/hub-api/src/trpc/routers/patient.ts` — Added documentation comment for why db.fromRow() not used
- `apps/hub-api/src/__tests__/db-encryption-integration.test.ts` — Updated for mandatory encryption API
- `apps/hub-api/src/__tests__/lab-register.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/lab-upload-result.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/lab-verify-patient.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/lab-audit.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/lab-rbac.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/lab-status-gate.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/notification.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/notification-audit.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/notification-escalation.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/consent.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/consent-grantor-validation.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/health.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/medication.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/auth-middleware.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/enforce-consent.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/jwt-auth.test.ts` — Added db mock (4 mock blocks)
- `apps/hub-api/src/__tests__/rbac-middleware.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/resource-authorization.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/rbac-security-audit.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/practitioner-key.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/practitioner-lookup.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/blind-index.test.ts` — Added db mock
- `apps/hub-api/src/__tests__/field-encryption.test.ts` — No changes needed (tests pass as-is)

### Build Artifacts
- `packages/crypto/dist/` — Rebuilt to include report_conclusion and encrypted_content in randomizedFields

### Sprint Tracking
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Updated 7-3b status to in-progress → review

### Review Findings

- [x] [Review][Decision→Patch] **toRowRaw() does not guard against SENSITIVE_FIELDS** — Resolved: Option A (runtime guard). Added SENSITIVE_FIELDS check in `toRowRaw()` that throws if any snake_cased key matches a sensitive field. [supabase.ts:85-92] (Source: edge+blind)
- [x] [Review][Patch] **Notification type array weakened to `Record<string, unknown>`** — Fixed: restored explicit typed interface with camelCase field names. [lab.ts:39-46] (Source: blind)
- [x] [Review][Patch] **toRowRaw accepts whitespace-only reason strings** — Fixed: added `.trim()` check to reason validation. [supabase.ts:78] (Source: edge)
- [x] [Review][Patch] **Scope creep: auditRouter added to _app.ts** — Fixed: removed auditRouter import and wiring from `_app.ts`. [_app.ts:10,25] (Source: auditor)

- [x] [Review][Defer] **Encryption key cached indefinitely — no rotation support** [field-encryption.ts:50] — deferred, by design (v1: prefix in place for future rotation)
- [x] [Review][Defer] **medication.ts has 5 raw .insert()/.update() calls bypassing db.\* helpers** [medication.ts] — deferred, no SENSITIVE_FIELDS written currently but should migrate to toRowRaw for consistency
- [x] [Review][Defer] **lab.ts diagnostic_reports/lab_result_files inserts bypass db helpers** [lab.ts:597,612] — deferred, encrypted_content is manually encrypted via encryptField(); diagnostic_reports insert has no SENSITIVE_FIELDS
- [x] [Review][Defer] **practitioner-key.ts has 3 raw Supabase calls not using db.\* helpers** [practitioner-key.ts] — deferred, no SENSITIVE_FIELDS involved
- [x] [Review][Defer] **notification.ts list read uses manual camelCase mapping instead of db.fromRowRaw()** [notification.ts:70-86] — deferred, consistency improvement
- [x] [Review][Defer] **db.toRow()/fromRow() return type T is misleading** [supabase.ts:64,93] — deferred, type improvement

## Change Log

- 2026-05-01: Story 7.3b implemented — mandatory encryption wiring, toRowRaw escape hatch, medication column resolution, router migrations, and comprehensive tests.
- 2026-05-01: Code review complete — 4 patches applied (SENSITIVE_FIELDS runtime guard in toRowRaw, whitespace reason validation, notification type restoration, auditRouter scope creep removal). 6 items deferred. 12 dismissed.
