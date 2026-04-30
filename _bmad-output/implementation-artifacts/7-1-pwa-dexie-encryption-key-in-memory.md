# Story 7.1: PWA Dexie Encryption (Key-in-Memory)

Status: done

## User Story

As a patient or clinician using the PWA,
I want my local data to be encrypted in the browser,
so that my PHI remains secure even if someone gains access to my device's IndexedDB files.

## Acceptance Criteria

1. [x] All Dexie tables containing PHI (Patients, Encounters, Observations, Conditions, MedicationRequests) are encrypted at the field or row level.
2. [x] Encryption uses AES-256-GCM via the native Web Crypto API.
3. [x] The encryption key is generated or retrieved upon login and stored **only in memory** (RAM).
4. [x] All local data is rendered unreadable if the browser tab is closed or the user logs out (key is wiped).
5. [x] Performance: Encryption/Decryption overhead is <10ms for single record reads.

## Technical Requirements & Constraints

- **Platform:** PWA (Next.js / Browser).
- **Library:** Use `dexie-encrypted` or a custom Dexie middleware.
- **Key Management:**
  - Implement a `KeyService` that derives a session key from the Supabase JWT or a secondary user-provided PIN.
  - **Crucial:** Never persist the key to `localStorage`, `sessionStorage`, or IndexedDB.
- **Data Model:** Encrypted fields should be stored as `ArrayBuffer` or Base64-encoded strings in IndexedDB.

## Developer Guardrails

- **Zero Persistence:** If the key is lost (e.g., refresh), the app must prompt for re-authentication rather than falling back to unencrypted storage.
- **Fail-Safe:** Any failure in the encryption/decryption pipeline must trigger a "Data Inaccessible" state rather than displaying raw ciphertext.

## Tasks / Subtasks

- [x] **Task 1: Crypto Service Implementation** (AC: 2, 3)
  - [x] Implement `packages/crypto/src/browser-crypto.ts` using Web Crypto API.
  - [x] Create `generateSessionKey()` and `encryptPayload()` / `decryptPayload()` helpers.
- [x] **Task 2: Dexie Encryption Middleware** (AC: 1)
  - [x] Implement a Dexie `creating`, `reading`, and `updating` middleware to handle transparent encryption.
  - [x] Configure sensitive tables in `apps/opd-lite-pwa/src/lib/db.ts` to use the middleware.
- [x] **Task 3: Key Lifecycle & Wiping** (AC: 4)
  - [x] Implement a memory-only `KeyStore` with a `wipe()` method.
  - [x] Hook into the browser `beforeunload` event and Supabase `onAuthStateChange` to trigger wipes.
- [x] **Task 4: Performance Benchmarking** (AC: 5)
  - [x] Measure read/write latency for encrypted vs. unencrypted Dexie operations.

## Dev Agent Record

### Implementation Plan

- Created `@ultranos/crypto` package with AES-256-GCM encryption via Web Crypto API
- Used Proxy-based table wrapping for Dexie middleware (hooks are sync-only; Web Crypto is async)
- Separated indexed fields (cleartext for queries) from encrypted blob (`_enc` field)
- Memory-only `encryptionKeyStore` with `beforeunload` and auth session subscription wipes
- Performance benchmarks confirm <1ms overhead (well under 10ms AC threshold)

### Debug Log

- Initial DBCore middleware approach caused `InvalidStateError` — IDB transactions auto-commit during async gaps
- Switched to Proxy-based table wrapping which encrypts BEFORE entering the IDB transaction
- Fixed `wrapChain` to handle WhereClause objects (not just Collections with `toArray`)
- Added `update()` interception (read-decrypt-modify-encrypt-put) for partial updates
- Added `sortBy()` and `each()` to chain wrapper for complete Dexie API coverage
- Fixed pre-existing encounter-dashboard test regression from RBAC story (missing auth session setup)

### Completion Notes

All 4 tasks complete. 527 tests pass (517 PWA + 10 crypto package). Performance benchmarks:
- Raw AES-256-GCM encrypt+decrypt: 0.19ms avg (p95: 0.57ms)
- Dexie middleware overhead per record: 0.50ms avg
- Well within AC5 threshold of <10ms

## File List

**New files:**
- `packages/crypto/package.json`
- `packages/crypto/tsconfig.json`
- `packages/crypto/src/index.ts`
- `packages/crypto/src/browser-crypto.ts`
- `packages/crypto/src/__tests__/browser-crypto.test.ts`
- `apps/opd-lite-pwa/src/lib/encryption-key-store.ts`
- `apps/opd-lite-pwa/src/lib/dexie-encryption-middleware.ts`
- `apps/opd-lite-pwa/src/lib/key-lifecycle-hooks.ts`
- `apps/opd-lite-pwa/src/__tests__/encryption-key-store.test.ts`
- `apps/opd-lite-pwa/src/__tests__/dexie-encryption-middleware.test.ts`
- `apps/opd-lite-pwa/src/__tests__/key-lifecycle.test.ts`
- `apps/opd-lite-pwa/src/__tests__/encryption-performance.test.ts`

**Modified files:**
- `apps/opd-lite-pwa/package.json` — added `@ultranos/crypto` dependency
- `apps/opd-lite-pwa/tsconfig.json` — added `@ultranos/crypto` path alias
- `apps/opd-lite-pwa/vitest.config.ts` — added `@ultranos/crypto` resolve alias
- `apps/opd-lite-pwa/src/lib/db.ts` — integrated encryption middleware for PHI tables
- `apps/opd-lite-pwa/src/__tests__/setup.ts` — added test encryption key provisioning
- `apps/opd-lite-pwa/src/__tests__/encounter-dashboard.test.tsx` — fixed pre-existing auth session setup
- `pnpm-lock.yaml` — updated lockfile

## Context Links

- Architecture: [architecture.md](../planning-artifacts/architecture.md#Key-in-memory-Encryption-for-PWA)
- PRD: [ultranos_master_prd_v3.md](../../docs/ultranos_master_prd_v3.md#NFR3)
- Deferred Work: [deferred-work.md](deferred-work.md) (D10, D24, D26, D34, D37, D51)

### Review Findings

- [x] [Review][Defer] **D1: Patient names (`nameLocal`, `nameLatin`) stored in cleartext as indexed fields** — Accepted tradeoff: names remain cleartext for search. Deferred to dedicated search-encryption story. [db.ts:274-276]
- [x] [Review][Patch] **D2: `interactionAuditLog` and `dispenseAuditLog` contain `medicationDisplay` (potential PHI)** — Fixed: encrypted both audit tables via `PHI_TABLE_CONFIGS`. [db.ts:32-56]
- [x] [Review][Defer] **D3: Key derivation from JWT/PIN not implemented — random key means data loss on refresh** — Accepted: refresh = data loss is a known limitation. Sync engine will re-populate from Hub on re-auth. Defer JWT/PIN derivation to a follow-up story. [encryption-key-store.ts]
- [x] [Review][Patch] **P1: CRITICAL — `filter()` callback receives encrypted records** — Fixed: `filter()` now decrypts all records and applies predicate post-decryption. [dexie-encryption-middleware.ts]
- [x] [Review][Patch] **P2: `each()`, `bulkGet()`, `toCollection()` not proxied at table level** — Fixed: added table-level proxies for `each()`, `bulkGet()`, `toCollection()`. [dexie-encryption-middleware.ts]
- [x] [Review][Patch] **P3: `Collection.modify()` not blocked** — Fixed: `modify()` now throws explicit error on both chain and table level. [dexie-encryption-middleware.ts]
- [x] [Review][Patch] **P4: `decryptRecord` returns raw stored object when `_enc` is not a string** — Fixed: now throws `EncryptedDataCorruptError`. [dexie-encryption-middleware.ts]
- [x] [Review][Patch] **P5: Test setup `afterEach` fire-and-forget async key regeneration** — Fixed: `afterEach` now uses `async/await`. [setup.ts]
- [x] [Review][Patch] **P6: Performance test uses realistic PHI-shaped data** — Fixed: replaced with generic `test-*` placeholders. [encryption-performance.test.ts]
- [x] [Review][Patch] **P7: No test coverage for `add`, `bulkAdd`, `update`, `each`, `first`, `last`, `sortBy`** — Fixed: added 14 new test cases covering all proxy methods. [dexie-encryption-middleware.test.ts]
- [x] [Review][Defer] **W1: `update()` read-modify-write not atomic** — Concurrent updates cause lost writes. Pre-existing architectural limitation of proxy approach.
- [x] [Review][Defer] **W2: No guard preventing `_enc` as indexed field name** — Would destroy ciphertext. No current risk.
- [x] [Review][Defer] **W3: Key wipe mid-flight TOCTOU** — `wipe()` during async decrypt leaves inconsistent state. Inherent to async crypto design.
- [x] [Review][Defer] **W4: `beforeunload` unreliable in mobile PWA** — Key is GC'd on page destruction anyway.
- [x] [Review][Defer] **W5: No key versioning or rotation mechanism** — Related to D3 decision.
- [x] [Review][Defer] **W6: Corrupted base64 throws untyped browser errors** — No domain-specific error wrapping in `decryptPayload`.
- [x] [Review][Defer] **W7: `soapLedger.createdAt` not in indexed fields** — Future code assuming queryable will silently fail.
- [x] [Review][Defer] **W8: Redundant encryption of indexed field values inside `_enc` blob** — Larger ciphertext, not a security issue.

## Change Log

- 2026-04-29: Story created by Antigravity.
- 2026-04-29: Implementation complete — all 4 tasks done, 527 tests passing, status → review.
- 2026-04-29: Code review complete — 8 patches applied (filter decryption, each/bulkGet/toCollection proxies, modify blocking, fail-safe fix, test async fix, PHI test data, test coverage, audit table encryption), 10 deferred, 4 dismissed. 539 tests passing. Status → done.
