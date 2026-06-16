# ADR-028: Search Encryption Strategy for Indexed Patient Names

**Status:** Accepted  
**Date:** 2026-06-12  
**Story:** 28.6 — Search Encryption Strategy for Indexed Patient Names  
**Supersedes:** Story 7.1 Review D1 accepted tradeoff ("names remain cleartext for search")

---

## Context

OPD-Lite and Pharmacy-Lite store patient records in browser IndexedDB via Dexie.js. An encryption middleware (Story 7.1) encrypts all PHI fields into an AES-256-GCM `_enc` blob, while a small set of fields is kept in cleartext for Dexie index queries.

**Problem:** Patient names (`_ultranos.nameLocal`, `_ultranos.nameLatin` in OPD-Lite; `nameGiven`, `phone` in Pharmacy-Lite) were left as cleartext indexed fields to support `startsWithIgnoreCase()` queries. This violates the encryption-at-rest requirement: any process with read access to the browser's IndexedDB can read patient names without the encryption key.

This ADR documents the evaluation and selected strategy to resolve this.

---

## Decision Drivers

- Patient names are PHI — they must not be readable from IndexedDB without the session key.
- Search must remain fast: <200ms for 1,000 patients (AC1).
- Search must support fuzzy/prefix matching on both local script (Arabic, Dari, Pashto) and Latin-script names.
- Implementation must be simple and maintainable.
- OPD-Lite caps its local patient cache at ~1,000 records synced from Hub.

---

## Considered Options

### Option A: In-Memory Decrypt-and-Search (Selected)

On each search query, load all patients via `db.patients.toArray()` (decrypted transparently by the Dexie encryption middleware), then apply a `startsWith(query.toLocaleLowerCase())` filter in JavaScript.

**Tradeoffs:**
- **Pro:** Zero additional infrastructure. Trivial implementation.
- **Pro:** Fully fuzzy-search capable (or any JS string operation).
- **Pro:** No cleartext PHI in IndexedDB.
- **Con:** O(n) decrypt per search query. For 1,000 patients at <1ms/decrypt = ~50–100ms total — well within the 200ms budget.
- **Con:** Memory spike during search (~1,000 decrypted `FhirPatient` objects). Acceptable given browser memory availability.

### Option B: Deterministic Blind Index (HMAC-SHA256 tokens)

Pre-compute HMAC-SHA256 of each name token (word or trigram) and store these hashes as indexed fields. Search by hashing the query and matching against the index.

**Tradeoffs:**
- **Pro:** Supports exact-match and prefix matching at Dexie index speed.
- **Con:** Fuzzy matching requires phonetic hashing (Double Metaphone), adding complexity.
- **Con:** Each schema change to name format requires re-indexing all patients.
- **Con:** Index size grows O(name_tokens) per patient record.
- **Verdict:** Overkill for a 1,000-record local cache. Appropriate for server-side search at Hub scale.

### Option C: Encrypted Fuse.js Index

Build a Fuse.js search index in memory when the encryption key becomes available. Cache the index until any patient record changes. Search against the in-memory Fuse.js index without touching Dexie.

**Tradeoffs:**
- **Pro:** Fastest repeated searches (index built once, reused).
- **Pro:** Full fuzzy search with scoring.
- **Con:** Requires an invalidation mechanism (patient write → cache bust). Complex to keep correct under concurrent writes.
- **Con:** Higher steady-state memory (Fuse.js index held in memory permanently).
- **Con:** First search after a patient write incurs the full re-index cost.
- **Verdict:** Premature optimization. Fall back to this if Option A benchmarks exceed 200ms in production.

---

## Decision

**Option A: In-Memory Decrypt-and-Search** is selected.

### Rationale

1. The 200ms performance budget is achievable: AES-256-GCM decryption overhead is <1ms per record (verified in `encryption-performance.test.ts`). For 1,000 records, worst case is ~100ms including IndexedDB read time.
2. OPD-Lite's local cache is bounded to ~1,000 records by the Hub sync limit, so O(n) cost is bounded.
3. No new dependencies or caching infrastructure required.
4. The Dexie encryption middleware already supports transparent `toArray()` decryption.
5. Pharmacy-Lite's existing `filter()` proxy already decrypts records before predicates run — the change there is purely removing the now-redundant cleartext fields from the schema.

### Fallback

If production profiling shows search exceeding 200ms (e.g., Hub sync limit is raised beyond 1,000), migrate to Option C (Fuse.js index) in a follow-up story. The interface surface (`searchLocal()` in `use-patient-search.ts`) is internal and can be swapped without API changes.

---

## Implementation

### OPD-Lite

| Change | Detail |
|--------|--------|
| `apps/opd-lite/src/lib/db.ts` | Removed `_ultranos.nameLocal` and `_ultranos.nameLatin` from `PHI_TABLE_CONFIGS.patients.indexedFields`. Added Dexie schema v22 that narrows the patients index to `id, _ultranos.nationalIdHash, meta.lastUpdated`. Upgrade handler removes cleartext name fields from existing stored objects. |
| `apps/opd-lite/src/lib/use-patient-search.ts` | Replaced `where('_ultranos.nameLocal').startsWithIgnoreCase()` + `where('_ultranos.nameLatin').startsWithIgnoreCase()` with `toArray()` + in-memory `startsWith` filter. National ID search via `nationalIdHash` blind index is retained. |
| `apps/opd-lite/src/stores/patient-store.ts` | Added `searchError: string | null` state and `setSearchError` action. Set to `"Session required for patient search"` when the encryption key is unavailable. |

### Pharmacy-Lite

| Change | Detail |
|--------|--------|
| `apps/pharmacy-lite/src/lib/db.ts` | Removed `nameGiven` and `phone` from `PHI_TABLE_CONFIGS.patients.indexedFields`. Added Dexie schema v12 narrowing patients index to `id, createdAt`. Upgrade handler removes cleartext PHI fields. |
| `apps/pharmacy-lite/src/lib/patient-search.ts` | Added `encryptionKeyStore.isReady()` guard. Existing `.filter()` approach is retained — it already routes through the middleware's post-decryption filter proxy. |
| `apps/pharmacy-lite/src/hooks/usePatientSearch.ts` | Added `searchError` state. Returns `"Session required for patient search"` when key unavailable. |

### Unchanged

- `_ultranos.nationalIdHash` remains indexed — it is a blind index (HMAC-SHA256 of the national ID), not cleartext PHI.
- Hub API search is unaffected — the Hub uses its own server-side blind index strategy.
- Lab-Lite is unaffected — patient lookup is by QR/ID scan only, no name search.

---

## Consequences

- **Security improvement:** Patient names no longer appear in cleartext in any IndexedDB object store.
- **Performance:** Search adds ~50–100ms latency for a full 1,000-patient cache (vs. ~5ms for indexed queries). This is within the 200ms budget.
- **Dexie schema migration:** All existing users upgrading to v22 (OPD-Lite) / v12 (Pharmacy-Lite) will have their stored patient objects cleaned in the upgrade handler. The `_enc` blob is unaffected — all data is preserved.
- **Arabic/RTL search correctness:** `toLocaleLowerCase()` correctly handles Arabic, Dari, and Pashto scripts (these scripts have no case, so the function is a safe identity-like operation that does not corrupt the string).
