# Story 28.1: Encrypt All OPD-Lite Dexie Tables via Crypto Proxy

Status: ready-for-dev

## Story

As a clinic administrator,
I want all patient data stored locally in OPD-Lite to be encrypted at rest,
so that a stolen or compromised workstation does not expose PHI.

## Acceptance Criteria

1. **Given** OPD-Lite is running with a valid session key
   **When** any record is written to Dexie tables (patients, encounters, soapLedger, observations, conditions, medications, allergyIntolerances, medicationStatements, interactionAuditLog)
   **Then** the record body is encrypted via `@ultranos/crypto` AES-256-GCM before IndexedDB write
   **And** only fields listed in `indexedFields` remain in cleartext for query support

2. **Given** an encrypted record exists in any Dexie table
   **When** it is read back via Dexie query
   **Then** the record is transparently decrypted and returned as the original object

3. **Given** the session key has been wiped (tab close or logout)
   **When** any Dexie read is attempted
   **Then** a `DecryptionKeyMissingError` is thrown (not a silent placeholder)

4. **Given** OPD-Lite has existing unencrypted data from before this migration
   **When** the app opens with the new encryption proxy
   **Then** a one-time migration encrypts existing records in place
   **And** the Dexie version is incremented with the new schema

## Tasks / Subtasks

- [ ] **Task 1: Audit current encryption coverage** (AC: 1)
  - [ ] Compare `PHI_TABLE_CONFIGS` in `db.ts` against all Dexie tables; identify any PHI tables missing from encryption middleware
  - [ ] Verify `diagnosticReports` table is encrypted (added in Epic 20, may not be in original `PHI_TABLE_CONFIGS`)
  - [ ] Verify `practitionerKeys` table encryption status (contains practitioner identity data)
  - [ ] Document any tables added after Story 7.1 that lack encryption wiring

- [ ] **Task 2: Wire missing tables into encryption middleware** (AC: 1, 2)
  - [ ] Add missing PHI tables to `PHI_TABLE_CONFIGS` in `apps/opd-lite/src/lib/db.ts`
  - [ ] Define `indexedFields` for each new table (only fields needed for Dexie queries)
  - [ ] Ensure `dexie-encryption-middleware.ts` proxy wraps all added tables

- [ ] **Task 3: Implement one-time migration for existing unencrypted data** (AC: 4)
  - [ ] Increment Dexie version in `db.ts` for the schema change
  - [ ] Write upgrade handler that reads each unencrypted record, encrypts it, and writes back
  - [ ] Handle edge case: if session key is not yet available during upgrade, defer migration to first key availability
  - [ ] Add migration flag in non-PHI metadata table to track completion

- [ ] **Task 4: Verify DecryptionKeyMissingError behavior** (AC: 3)
  - [ ] Test that all proxied methods throw `DecryptionKeyMissingError` when key is wiped
  - [ ] Ensure error message does not contain any PHI or record identifiers

- [ ] **Task 5: Tests** (AC: 1-4)
  - [ ] Unit tests for each newly encrypted table (round-trip encrypt/decrypt)
  - [ ] Test migration path: create unencrypted records, run migration, verify encrypted
  - [ ] Test `DecryptionKeyMissingError` thrown when key is wiped
  - [ ] Verify indexed fields remain queryable post-encryption
  - [ ] Run existing test suite to confirm no regressions

## Dev Notes

### Current State

OPD-Lite **already has encryption middleware** from Story 7.1. The implementation uses a Proxy-based approach in `apps/opd-lite/src/lib/dexie-encryption-middleware.ts` that intercepts all table operations (put, add, bulkPut, get, toArray, where, filter, each, bulkGet, sortBy, etc.) for transparent encrypt-on-write / decrypt-on-read.

The encryption middleware is configured in `apps/opd-lite/src/lib/db.ts` via `PHI_TABLE_CONFIGS` which lists each table's indexed fields. Non-indexed fields are encrypted into a single `_enc` blob using AES-256-GCM.

**This story is about ensuring COMPLETENESS** — verifying that every PHI table added across Epics 1-27 is covered by the encryption middleware, and adding a migration path for any existing unencrypted data.

### Key Files to UPDATE

| File | Purpose |
|------|---------|
| `apps/opd-lite/src/lib/db.ts` | Dexie schema definition, `PHI_TABLE_CONFIGS`, version increment |
| `apps/opd-lite/src/lib/dexie-encryption-middleware.ts` | No changes expected (already wraps all tables in config) |
| `apps/opd-lite/src/lib/encryption-key-store.ts` | No changes expected |

### Key Files to READ (context)

| File | Purpose |
|------|---------|
| `packages/crypto/src/browser-crypto.ts` | AES-256-GCM encrypt/decrypt, key generation |
| `packages/crypto/src/index.ts` | Exports: `generateSessionKey`, `encryptPayload`, `decryptPayload` |
| `apps/opd-lite/src/lib/phi-cleanup.ts` | Lists all PHI tables that need cleanup — cross-reference for completeness |

### Architecture Compliance

- **Encryption**: AES-256-GCM via Web Crypto API (already implemented in `@ultranos/crypto`)
- **Key-in-memory**: Key resides in RAM only, wiped on `beforeunload` and logout
- **Indexed fields**: Names, IDs, timestamps stay cleartext for Dexie queries — accepted tradeoff documented in Story 7.1 review D1
- **No `localStorage`/`sessionStorage`** for key storage — CLAUDE.md rule

### Existing Patterns to Follow

The Proxy-based encryption middleware pattern from Story 7.1 is the canonical approach:
1. Each PHI table is configured with `{ tableName, indexedFields }` in `PHI_TABLE_CONFIGS`
2. The middleware intercepts all read/write operations
3. Non-indexed fields → encrypted into `_enc` field
4. Indexed fields → remain cleartext
5. Read operations → decrypt `_enc` and merge with indexed fields

### Testing Standards

- Use Vitest with the existing test setup at `apps/opd-lite/src/__tests__/setup.ts`
- Test setup calls `generateSessionKey()` in `beforeEach` — follow this pattern
- Existing test files to reference: `apps/opd-lite/src/__tests__/dexie-encryption-middleware.test.ts`
- No PHI in test data — use generic `test-*` placeholders per Story 7.1 P6 fix

### Previous Story Intelligence (Story 7.1)

Key learnings from Story 7.1 implementation:
- **Proxy approach chosen over DBCore middleware** because IDB transactions auto-commit during async gaps (Web Crypto is async)
- `filter()` callback must receive decrypted records (fixed in 7.1 P1)
- `modify()` is blocked with explicit error (no partial-update encryption support)
- `update()` uses read-modify-write pattern (not atomic — known limitation W1)
- Performance: encryption overhead <1ms per record (well within budget)

### References

- [Source: apps/opd-lite/src/lib/db.ts] — Dexie schema and PHI_TABLE_CONFIGS
- [Source: apps/opd-lite/src/lib/dexie-encryption-middleware.ts] — Proxy-based encryption middleware
- [Source: packages/crypto/src/browser-crypto.ts] — AES-256-GCM implementation
- [Source: _bmad-output/implementation-artifacts/7-1-pwa-dexie-encryption-key-in-memory.md] — Prior story with full implementation notes
- [Source: apps/opd-lite/src/lib/phi-cleanup.ts] — PHI table list for cross-reference

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
