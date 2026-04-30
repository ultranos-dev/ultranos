# Story 7.4: Practitioner Key Lifecycle Management

Status: ready-for-dev

## User Story

As a security officer,
I want practitioner public keys to have a manageable lifecycle,
so that revoked or compromised keys are quickly invalidated across the ecosystem.

## Acceptance Criteria

1. [ ] Cached practitioner public keys in local device storage have a Time-To-Live (TTL) of 24 hours.
2. [ ] Upon expiry, the client app (PWA/Mobile) must re-fetch the public key and status from the Hub API.
3. [ ] A "Key Revocation List" (KRL) is synchronized to all edge devices as a high-priority sync item.
4. [ ] All scanners (OPD/Pharmacy) immediately reject signatures from keys present in the local KRL.
5. [ ] The system logs all attempts to use an expired or revoked key.

## Technical Requirements & Constraints

- **Platform:** Hub API and Edge Client Apps.
- **Data Model:**
  - `practitioner_keys` table on Hub with `revoked_at` and `expires_at` fields.
  - Local `cachedAt` timestamp for each key entry in IndexedDB/SQLite.
- **Sync:** Use the `sync-engine` to push KRL updates to clients.
- **Verification:** Verification logic in `packages/crypto` must check the local KRL before calling `ed25519.verify()`.

## Developer Guardrails

- **Fail-Closed:** If a key's status cannot be verified (e.g., expired cache and offline), the app should treat it as "Untrusted" for critical actions like dispensing.
- **Efficiency:** The KRL should be stored as a compact Bloom filter or a sorted list of hashes to minimize sync bandwidth.

## Tasks / Subtasks

- [ ] **Task 1: Hub API Key Status Endpoints** (AC: 2)
  - [ ] Implement `practitioner.getKeyStatus` tRPC procedure.
  - [ ] Add `revoked_at` column to the database via a new migration.
- [ ] **Task 2: Local Cache TTL Logic** (AC: 1)
  - [ ] Update `db.practitionerKeys` schema to include `cachedAt`.
  - [ ] Implement stale-while-revalidate logic in the `usePractitionerKey` hook (D60, D61).
- [ ] **Task 3: Key Revocation List (KRL) Sync** (AC: 3)
  - [ ] Create a `KRLSyncService` in the `sync-engine`.
  - [ ] Configure the Hub to emit a "KRL Update" event on key revocation.
- [ ] **Task 4: Signature Verification Guard** (AC: 4)
  - [ ] Integrate KRL check into the `verifySignature` function in `packages/crypto`.

## Context Links

- Architecture: [architecture.md](../planning-artifacts/architecture.md#Security-Hardening)
- PRD: [ultranos_master_prd_v3.md](../../docs/ultranos_master_prd_v3.md#FR8)
- Deferred Work: [deferred-work.md](deferred-work.md) (D60, D61)

## Change Log

- 2026-04-29: Story created by Antigravity.
