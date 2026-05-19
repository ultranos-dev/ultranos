# Story 28.6: Search Encryption Strategy for Indexed Patient Names

Status: ready-for-dev

## Story

As a clinician,
I want to search for patients by name even though names are encrypted at rest,
so that clinical workflows are not degraded by encryption.

## Acceptance Criteria

1. **Given** `_ultranos.nameLocal` and `_ultranos.nameLatin` are encrypted in IndexedDB
   **When** a clinician types a patient name search query
   **Then** the search works with acceptable performance (<200ms for 1000 patients)

2. **Given** the chosen strategy (encrypted Fuse.js index, in-memory decrypt-and-search, or deterministic token hashing)
   **When** the search is executed
   **Then** results match against both `nameLocal` and `nameLatin` fields
   **And** the approach is documented in an ADR explaining the tradeoff between search quality and encryption strength

3. **Given** the encryption key is not available
   **When** a patient search is attempted
   **Then** the search returns an empty result set with a clear error message ("Session required for patient search")
   **And** no unencrypted name data is leaked to the UI or console

## Tasks / Subtasks

- [ ] **Task 1: Evaluate and select search strategy** (AC: 1, 2)
  - [ ] Analyze three candidate approaches:
    - **Option A: In-memory decrypt-and-search** — On search, load all patients, decrypt, fuzzy match in memory. Simple but O(n) decrypt cost.
    - **Option B: Deterministic blind index** — Store HMAC-SHA256 of name tokens as indexed fields. Supports exact-prefix matching, not fuzzy.
    - **Option C: Encrypted Fuse.js index** — Build Fuse.js index in memory on key availability, search against in-memory index. Fast fuzzy search, higher memory.
  - [ ] Benchmark each approach with 1000 patient records
  - [ ] **Recommendation: Option A (in-memory decrypt-and-search)** — Simplest, within performance budget given <1ms decrypt overhead (Story 7.1 benchmarks), and OPD-Lite already limits local cache to ~1000 records

- [ ] **Task 2: Implement chosen search strategy** (AC: 1, 2)
  - [ ] Update `apps/opd-lite/src/lib/use-patient-search.ts`
  - [ ] Current implementation: Dexie query on cleartext `nameLocal`/`nameLatin` indexed fields
  - [ ] New implementation: remove name fields from Dexie indexes, decrypt all patients in memory, apply `startsWithIgnoreCase` filter
  - [ ] Maintain the existing two-phase pattern: Phase 1 (local Dexie) + Phase 2 (Hub API revalidation)
  - [ ] Optionally cache the decrypted patient list in memory (invalidate on any patient table write)

- [ ] **Task 3: Remove name fields from Dexie indexed fields** (AC: 1)
  - [ ] Update `PHI_TABLE_CONFIGS` in `db.ts`: remove `_ultranos.nameLocal` and `_ultranos.nameLatin` from patients table `indexedFields`
  - [ ] These fields move into the encrypted `_enc` blob
  - [ ] Keep `_ultranos.nationalIdHash` as indexed (already a blind index, not PHI)
  - [ ] Increment Dexie version for schema change
  - [ ] Write Dexie upgrade handler to re-encrypt existing patient records (names move from cleartext index to `_enc` blob)

- [ ] **Task 4: Handle key unavailability** (AC: 3)
  - [ ] If `encryptionKeyStore.isReady()` returns false when search is attempted:
    - Return empty results
    - Set search error state: "Session required for patient search"
  - [ ] Ensure no cleartext name data is logged or rendered in error states
  - [ ] This behavior already exists partially — `use-patient-search.ts` checks `isReady()`

- [ ] **Task 5: Apply to Pharmacy-Lite** (AC: 1-3)
  - [ ] Pharmacy-Lite also searches patients for prescription fulfillment
  - [ ] Apply the same search strategy to Pharmacy-Lite's patient search
  - [ ] Lab-Lite does NOT need this — patient lookup is by scan/ID only (name + age displayed, not searched)

- [ ] **Task 6: Write ADR** (AC: 2)
  - [ ] Create `docs/adr/adr-NNN-search-encryption-strategy.md`
  - [ ] Document: problem statement, options evaluated, benchmarks, chosen approach, tradeoffs

- [ ] **Task 7: Tests** (AC: 1-3)
  - [ ] Performance test: search 1000 encrypted patients <200ms
  - [ ] Test search matches against both `nameLocal` and `nameLatin`
  - [ ] Test Arabic/RTL name search works correctly
  - [ ] Test key-unavailable returns empty results with error message
  - [ ] Test no PHI in console output during search errors
  - [ ] Regression test: existing search functionality still works end-to-end

## Dev Notes

### Current State

**Patient names are currently stored as cleartext indexed fields** in OPD-Lite's Dexie database. This was an explicit tradeoff documented in Story 7.1 review D1: "Patient names (nameLocal, nameLatin) stored in cleartext as indexed fields — Accepted tradeoff: names remain cleartext for search. Deferred to dedicated search-encryption story."

**This is that dedicated story.**

Current search implementation in `apps/opd-lite/src/lib/use-patient-search.ts`:
- Phase 1: Dexie query on indexed `_ultranos.nameLocal` and `_ultranos.nameLatin` using `startsWithIgnoreCase()`
- Phase 2: Background Hub API revalidation (non-blocking)
- 50-result limit per query
- Checks `encryptionKeyStore.isReady()` before any Dexie access

### Architecture Decision: Recommended Approach

**Option A: In-memory decrypt-and-search** is recommended because:
1. OPD-Lite caps local patient cache at ~1000 records (synced from Hub)
2. AES-256-GCM decrypt overhead is <1ms per record (Story 7.1 benchmarks)
3. 1000 records * 1ms = ~1 second worst case, but with batch `toArray()` + decrypt, actual is ~50-100ms
4. No additional indexing infrastructure needed
5. Simplest to implement and maintain

**If benchmarks show >200ms**, fall back to Option C (Fuse.js index built on key availability, held in memory, searched via fuzzy match).

### Key Files to UPDATE

| File | Change |
|------|--------|
| `apps/opd-lite/src/lib/db.ts` | Remove name fields from `indexedFields`, increment Dexie version, add upgrade handler |
| `apps/opd-lite/src/lib/use-patient-search.ts` | Replace indexed query with in-memory decrypt-and-filter |
| `apps/pharmacy-lite/src/lib/db.ts` | Same index changes |
| `apps/pharmacy-lite/src/lib/use-patient-search.ts` or equivalent | Same search changes |

### Key Files to CREATE

| File | Purpose |
|------|---------|
| `docs/adr/adr-NNN-search-encryption-strategy.md` | Architecture Decision Record |

### Key Files to READ (context)

| File | Purpose |
|------|---------|
| `apps/opd-lite/src/lib/use-patient-search.ts` | Current search implementation (Dexie indexed query) |
| `apps/opd-lite/src/lib/db.ts` | Current `PHI_TABLE_CONFIGS` with name fields as indexed |
| `apps/opd-lite/src/lib/dexie-encryption-middleware.ts` | How `toArray()` returns decrypted records |
| `packages/crypto/src/server-crypto.ts` | `generateBlindIndex()` for reference if Option B is chosen |

### Important Constraints

- **Performance budget: <200ms** for 1000 patients — this is the AC requirement
- **`nationalIdHash` remains indexed** — it's already a blind index (HMAC-SHA256), not cleartext PHI
- **Dexie version must increment** when indexed fields change — this triggers a schema migration
- **Arabic/RTL names**: Search must handle RTL Unicode correctly. `startsWithIgnoreCase()` uses `toLocaleLowerCase()` — verify this works for Arabic script.
- **No PHI in console**: `console.log` during search errors must not contain patient names or IDs. Only log search query metadata (length, result count).
- **Hub API search is unaffected** — this story is about LOCAL search only. Hub search uses server-side blind index.

### Dependency Note

This story depends on Story 28.1 (all tables encrypted) being complete, as it modifies the `PHI_TABLE_CONFIGS` and Dexie schema. It also benefits from Story 28.4 (deterministic key derivation) to ensure the key is available after page refresh, making the in-memory search cache more persistent.

### Testing Standards

- Vitest for PWA apps
- Performance benchmarks: use realistic record count (1000 synthetic patients)
- Include Arabic name test cases for RTL search verification
- No real patient names in test data — use generated strings

### References

- [Source: apps/opd-lite/src/lib/use-patient-search.ts] — Current indexed-field search
- [Source: apps/opd-lite/src/lib/db.ts] — PHI_TABLE_CONFIGS with name indexed fields
- [Source: _bmad-output/implementation-artifacts/7-1-pwa-dexie-encryption-key-in-memory.md] — Review D1: "Deferred to dedicated search-encryption story"
- [Source: packages/crypto/src/server-crypto.ts] — `generateBlindIndex()` (blind index reference)
- [Source: packages/crypto/src/__tests__/browser-crypto.test.ts] — Performance benchmarks

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
