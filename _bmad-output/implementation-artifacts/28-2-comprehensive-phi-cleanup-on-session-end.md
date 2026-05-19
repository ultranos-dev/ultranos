# Story 28.2: Comprehensive PHI Cleanup on Session End

Status: ready-for-dev

## Story

As a clinician,
I want all locally stored PHI to be wiped when I close the browser tab or log out,
so that the next user of the workstation cannot access my patients' data.

## Acceptance Criteria

1. **Given** a clinician is logged into OPD-Lite, Pharmacy-Lite, or Lab-Lite
   **When** the user clicks "Logout"
   **Then** all Dexie tables containing PHI are cleared (`db.table.clear()` for each table)
   **And** the in-memory encryption key is wiped
   **And** Zustand stores are reset

2. **Given** a clinician has an active session
   **When** the browser tab is closed (`beforeunload` event)
   **Then** the encryption key is wiped from memory
   **And** IndexedDB data remains encrypted but unreadable without the key

3. **Given** `clearPhiState()` is called from any trigger (logout, session expiry, tab close)
   **When** the function completes
   **Then** every Dexie table that stores PHI has been cleared — not just Zustand state
   **And** the sync queue is either cleared or its PHI payloads are purged

## Tasks / Subtasks

- [ ] **Task 1: Create `phi-cleanup.ts` for Pharmacy-Lite** (AC: 1, 3)
  - [ ] Create `apps/pharmacy-lite/src/lib/phi-cleanup.ts` following OPD-Lite's pattern
  - [ ] Implement `clearPhiTables()` — clear all PHI Dexie tables (patients, prescriptions, medications, dispensingQueue, etc.)
  - [ ] Implement `verifyPhiCleanup()` — check all PHI tables are empty, return boolean
  - [ ] Use compile-time safety: type-check against Dexie table list to prevent drift

- [ ] **Task 2: Create `phi-cleanup.ts` for Lab-Lite** (AC: 1, 3)
  - [ ] Create `apps/lab-lite/src/lib/phi-cleanup.ts` following same pattern
  - [ ] Clear PHI tables: uploadQueue entries containing patient data, any cached patient verification data
  - [ ] Lab-Lite has minimal PHI (patient name + age only per CLAUDE.md rule #7) — but still must be cleaned

- [ ] **Task 3: Create `key-lifecycle-hooks.ts` for Pharmacy-Lite** (AC: 1, 2)
  - [ ] Create `apps/pharmacy-lite/src/lib/key-lifecycle-hooks.ts` mirroring OPD-Lite's implementation
  - [ ] Subscribe to Supabase `onAuthStateChange` — on `SIGNED_OUT` event: wipe key + clear PHI tables
  - [ ] Register `beforeunload` listener to wipe encryption key

- [ ] **Task 4: Create `key-lifecycle-hooks.ts` for Lab-Lite** (AC: 1, 2)
  - [ ] Create `apps/lab-lite/src/lib/key-lifecycle-hooks.ts`
  - [ ] Subscribe to auth state changes for cleanup trigger
  - [ ] Register `beforeunload` for key wipe

- [ ] **Task 5: Create `PhiCleanupGuard` component for Pharmacy-Lite** (AC: 2, 3)
  - [ ] Create `apps/pharmacy-lite/src/components/PhiCleanupGuard.tsx` mirroring OPD-Lite's implementation
  - [ ] Register `beforeunload` and `visibilitychange` listeners
  - [ ] Fire `clearPhiTables()` fire-and-forget on beforeunload (async ops limited in this event)
  - [ ] Mount in app layout

- [ ] **Task 6: Create `PhiCleanupGuard` component for Lab-Lite** (AC: 2, 3)
  - [ ] Create `apps/lab-lite/src/components/PhiCleanupGuard.tsx`
  - [ ] Same pattern as pharmacy-lite

- [ ] **Task 7: Wire logout flow in Pharmacy-Lite** (AC: 1)
  - [ ] Update `UserDropdown.tsx` (or equivalent logout trigger) to call: clear Zustand stores → `clearPhiTables()` → `encryptionKeyStore.wipe()` → Supabase signOut → redirect
  - [ ] Update `SessionTimeoutWrapper.tsx` expired handler to include PHI cleanup

- [ ] **Task 8: Wire logout flow in Lab-Lite** (AC: 1)
  - [ ] Same as Task 7 for Lab-Lite

- [ ] **Task 9: Sync queue PHI purge on cleanup** (AC: 3)
  - [ ] In each app's `clearPhiState()`, handle sync queue entries:
    - Delete entries with status `'synced'`
    - Retain entries with status `'pending'`/`'failed'` (encrypted, unreadable without key — data loss prevention)
  - [ ] This task is a basic stub; full sync queue encryption is Story 28.3

- [ ] **Task 10: Verify OPD-Lite cleanup completeness** (AC: 1-3)
  - [ ] Audit OPD-Lite's existing `phi-cleanup.ts` against current Dexie tables (tables may have been added in later epics)
  - [ ] Add any missing tables to `clearPhiTables()`

- [ ] **Task 11: Tests** (AC: 1-3)
  - [ ] Test `clearPhiTables()` clears all PHI tables (each app)
  - [ ] Test `verifyPhiCleanup()` returns true after cleanup, false with stale data
  - [ ] Test logout flow triggers full cleanup chain
  - [ ] Test `beforeunload` triggers key wipe
  - [ ] Test session expiry triggers cleanup

## Dev Notes

### Current State

**OPD-Lite: COMPLETE** — Story 7.1 and Story 20.7 implemented full PHI cleanup:
- `apps/opd-lite/src/lib/phi-cleanup.ts` — `clearPhiTables()` and `verifyPhiCleanup()`
- `apps/opd-lite/src/lib/key-lifecycle-hooks.ts` — auth state → cleanup subscription
- `apps/opd-lite/src/components/PhiCleanupGuard.tsx` — beforeunload + visibilitychange
- `apps/opd-lite/src/components/UserDropdown.tsx` — full logout chain

**Pharmacy-Lite: INCOMPLETE** — Has `encryption-key-store.ts` and `dexie-encryption-middleware.ts` (identical to OPD-Lite) but **NO** `phi-cleanup.ts`, `key-lifecycle-hooks.ts`, or `PhiCleanupGuard.tsx`. Logout only wipes auth session, not Dexie tables.

**Lab-Lite: INCOMPLETE** — Has no encryption infrastructure. Simple Dexie schema for upload queue. No PHI table cleanup on session end. Lab-Lite stores minimal PHI (patient name + age for verification per CLAUDE.md rule #7).

### Key Files to CREATE

| File | Source Pattern |
|------|---------------|
| `apps/pharmacy-lite/src/lib/phi-cleanup.ts` | Mirror `apps/opd-lite/src/lib/phi-cleanup.ts` |
| `apps/pharmacy-lite/src/lib/key-lifecycle-hooks.ts` | Mirror `apps/opd-lite/src/lib/key-lifecycle-hooks.ts` |
| `apps/pharmacy-lite/src/components/PhiCleanupGuard.tsx` | Mirror `apps/opd-lite/src/components/PhiCleanupGuard.tsx` |
| `apps/lab-lite/src/lib/phi-cleanup.ts` | Adapted for Lab-Lite's minimal tables |
| `apps/lab-lite/src/lib/key-lifecycle-hooks.ts` | Adapted for Lab-Lite |
| `apps/lab-lite/src/components/PhiCleanupGuard.tsx` | Adapted for Lab-Lite |

### Key Files to UPDATE

| File | Change |
|------|--------|
| `apps/pharmacy-lite/src/components/UserDropdown.tsx` | Add PHI cleanup to logout flow |
| `apps/pharmacy-lite/src/components/SessionTimeoutWrapper.tsx` | Add PHI cleanup to expired handler |
| `apps/pharmacy-lite/src/app/layout.tsx` | Mount `PhiCleanupGuard` |
| `apps/lab-lite/src/components/UserDropdown.tsx` | Add PHI cleanup to logout flow |
| `apps/lab-lite/src/components/SessionTimeoutWrapper.tsx` | Add PHI cleanup to expired handler |
| `apps/lab-lite/src/app/layout.tsx` | Mount `PhiCleanupGuard` |
| `apps/opd-lite/src/lib/phi-cleanup.ts` | Audit for completeness against current tables |

### Key Files to READ (reference patterns)

| File | Purpose |
|------|---------|
| `apps/opd-lite/src/lib/phi-cleanup.ts` | Canonical pattern — `clearPhiTables()`, `verifyPhiCleanup()` |
| `apps/opd-lite/src/lib/key-lifecycle-hooks.ts` | Auth state subscription pattern |
| `apps/opd-lite/src/components/PhiCleanupGuard.tsx` | beforeunload/visibilitychange pattern |
| `apps/opd-lite/src/components/UserDropdown.tsx` | Full logout cleanup chain |

### Architecture Compliance

- **CLAUDE.md**: "Encryption key lives in memory only — cleared on tab/browser close. Never use localStorage or sessionStorage for PHI."
- **CLAUDE.md**: "Desktop PWA: 30-min inactivity → re-auth required on clinical views. Tab close → encrypted cache cleared."
- **Lab-Lite data minimization**: CLAUDE.md rule #7 — Lab Portal can only see patient name + age. Even this minimal PHI must be cleaned.

### Important Constraints

- `beforeunload` is **fire-and-forget** — async Dexie operations may not complete before tab closes. Defense-in-depth: key wipe ensures data is unreadable even if table clear fails.
- Pharmacy-Lite and Lab-Lite's Dexie schemas differ from OPD-Lite — do NOT blindly copy table names. Read each app's `db.ts` to identify PHI tables.
- Sync queue entries with status `'pending'`/`'failed'` must NOT be deleted — they contain unsynced clinical data. Only `'synced'` entries can be purged.
- OPD-Lite Zustand stores use an "epoch" counter in `clearPhiState()` to invalidate in-flight writes — replicate this pattern if Pharmacy-Lite/Lab-Lite stores need it.

### Testing Standards

- Vitest for all PWA apps
- Test setup must provision encryption key via `generateSessionKey()` in `beforeEach`
- Verify cleanup functions against actual Dexie table definitions (compile-time type safety)
- No PHI in test data

### References

- [Source: apps/opd-lite/src/lib/phi-cleanup.ts] — Canonical PHI cleanup implementation
- [Source: apps/opd-lite/src/components/PhiCleanupGuard.tsx] — beforeunload/visibilitychange guard
- [Source: apps/opd-lite/src/lib/key-lifecycle-hooks.ts] — Auth→cleanup subscription
- [Source: _bmad-output/implementation-artifacts/7-1-pwa-dexie-encryption-key-in-memory.md] — Original encryption story
- [Source: CLAUDE.md#Encryption] — Key-in-memory mandate

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
