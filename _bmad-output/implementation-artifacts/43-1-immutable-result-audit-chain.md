# Story 43.1: Immutable Result Audit Chain

Status: pending

## Story

As a lab manager,
I want every result to have a complete, tamper-proof audit chain from sample receipt to report delivery,
So that I can defend any result with cryptographic evidence when questioned.

## Context

Lab-Lite already has a working audit infrastructure built on `@ultranos/audit-logger` (Story 17.5 / 29.3). The `audit-client.ts` module uses `emitClientAudit()` with a `DexieAuditAdapter`, SHA-256 hash chaining, and an `AuditDrainWorker` that syncs pending events to the Hub API. However, the current coverage is limited to two domains:

1. **Auth events** — `reportAuthEvent()` covers LOGIN_SUCCESS/FAILURE and MFA_VERIFY_SUCCESS/FAILURE.
2. **Queue events** — `reportQueueAuditEvent()` covers QUEUE_ENTRY_CREATED, QUEUE_DRAIN_SUCCESS, QUEUE_ITEM_EXPIRED, QUEUE_ITEM_DISCARDED.

This story extends that existing infrastructure to cover the **full sample-to-report lifecycle** — every touchpoint from the moment a sample is received until the result is delivered to the ordering physician (and amended, if necessary). This is the foundational audit layer for Epic 43 (Quality Assurance & Legal Shield) and must integrate with the chain-of-custody data model from Story 42.3.

The audit chain serves a dual purpose: (1) regulatory compliance (CLAUDE.md: "Audit every PHI access", "append-only with SHA-256 hash chaining", "never update or delete audit records"), and (2) Khalid's legal defense system — the ability to prove, with cryptographic evidence, exactly who did what to every sample and result.

**PRD Requirements:** FR17 (Cryptographic Audit Logging), FR43 (Immutable result audit chain)
**Dependencies:** Story 17.5 (Lab-Lite audit logger migration — done), Story 42.3 (Sample Accessioning & Chain of Custody — must be complete or in-progress for resource references)

## Acceptance Criteria

1. [ ] Seven new lab-lifecycle audit event types are emittable via `audit-client.ts`: SAMPLE_RECEIVED, SAMPLE_PROCESSED, RESULT_ENTERED, RESULT_AUTHORIZED, RESULT_RELEASED, RESULT_AMENDED, RESULT_DELIVERED.
2. [ ] Each audit event includes: action type, actor identity (userId + role), HLC timestamp, resource references (sampleId, orderId, diagnosticReportId as applicable), and a SHA-256 hash linking to the previous event in the chain.
3. [ ] The audit chain covers the full lifecycle: collection/receipt -> accessioning -> processing -> result entry -> authorization -> release -> delivery -> amendment (if any).
4. [ ] Audit events are append-only — the Dexie table and adapter enforce insert-only semantics (no update, no delete).
5. [ ] Audit events are stored locally in the existing `clientAuditLog` Dexie table and synced to Hub via the existing `AuditDrainWorker`.
6. [ ] A `verifyResultAuditChain(sampleId)` function re-computes SHA-256 hashes for all events in a sample's chain and returns `{ valid: boolean; checkedCount: number; brokenAt?: string }`.
7. [ ] The chain verification function works offline (operates on local Dexie data only).
8. [ ] New `AuditAction` enum values are added to `@ultranos/shared-types` for the seven lifecycle events.
9. [ ] New `AuditResourceType` enum value `LAB_SAMPLE` is added to `@ultranos/shared-types` for sample-scoped events.
10. [ ] All audit emission functions follow the existing pattern: never throw, never block clinical workflows, fire-and-forget via `void emitClientAudit(input)`.
11. [ ] Integration with Story 42.3: chain-of-custody handoff events in the sample status pipeline (Received -> In Processing -> Completed -> Reported) each emit the corresponding audit event.
12. [ ] Comprehensive tests cover: each event type emission, hash chain integrity verification, tamper detection (modified event breaks chain), offline chain verification, and PHI guard validation (no PHI in metadata).

## Tasks / Subtasks

- [ ] **Task 1: Extend Shared Types** (AC: 8, 9)
  - [ ] Add new `AuditAction` enum values to `packages/shared-types/src/enums.ts`:
    - `SAMPLE_RECEIVED = 'SAMPLE_RECEIVED'`
    - `SAMPLE_PROCESSED = 'SAMPLE_PROCESSED'`
    - `RESULT_ENTERED = 'RESULT_ENTERED'`
    - `RESULT_AUTHORIZED = 'RESULT_AUTHORIZED'`
    - `RESULT_RELEASED = 'RESULT_RELEASED'`
    - `RESULT_AMENDED = 'RESULT_AMENDED'`
    - `RESULT_DELIVERED = 'RESULT_DELIVERED'`
  - [ ] Add `LAB_SAMPLE = 'LAB_SAMPLE'` to the `AuditResourceType` enum.
  - [ ] Run `pnpm -F shared-types build` to ensure downstream consumers pick up the new values.

- [ ] **Task 2: Lab Result Audit Reporter Functions** (AC: 1, 2, 3, 10, 11)
  - [ ] In `apps/lab-lite/src/lib/audit-client.ts`, add a `reportLabLifecycleEvent()` function that accepts a discriminated payload:
    ```typescript
    interface LabLifecycleAuditPayload {
      event: 'SAMPLE_RECEIVED' | 'SAMPLE_PROCESSED' | 'RESULT_ENTERED' |
             'RESULT_AUTHORIZED' | 'RESULT_RELEASED' | 'RESULT_AMENDED' | 'RESULT_DELIVERED'
      sampleId: string
      orderId?: string
      diagnosticReportId?: string
      technicianId?: string
      custodyFrom?: string  // actorId of the person handing off the sample
      custodyTo?: string    // actorId of the person receiving the sample
      amendmentReason?: string  // reason code for RESULT_AMENDED (no free-text — opaque code only)
      deliveryMethod?: string   // 'push_notification' | 'opd_sync' | 'patient_portal'
    }
    ```
  - [ ] Map each event to the corresponding new `AuditAction` enum value.
  - [ ] Set `resourceType` to `AuditResourceType.LAB_SAMPLE` for sample-scoped events (SAMPLE_RECEIVED, SAMPLE_PROCESSED) and `AuditResourceType.LAB_RESULT` for result-scoped events (RESULT_ENTERED through RESULT_DELIVERED).
  - [ ] Set `resourceId` to `sampleId` (the canonical identifier linking the entire chain).
  - [ ] Include `orderId`, `diagnosticReportId`, custody references, and other context in `metadata` — no PHI, only opaque IDs and codes.
  - [ ] Follow the existing pattern: get session from `useAuthSessionStore`, stamp with `serializeHlc(hlc.now())`, call `void emitClientAudit(input)`.
  - [ ] The function must never throw — wrap in try/catch with `console.warn` fallback.

- [ ] **Task 3: Client-Side Hash Chain Verification** (AC: 6, 7)
  - [ ] Create `apps/lab-lite/src/lib/audit-chain-verifier.ts`.
  - [ ] Export `verifyResultAuditChain(sampleId: string): Promise<AuditChainVerificationResult>`.
  - [ ] The function queries the local `clientAuditLog` Dexie table for all events where `metadata.sampleId === sampleId`, ordered by `queuedAt` ascending (FIFO).
  - [ ] For each event, re-compute the SHA-256 hash using the same `computeChainHash()` algorithm from `packages/audit-logger/src/logger.ts` — but adapted for the browser using `crypto.subtle.digest('SHA-256', ...)` (Web Crypto API, not Node `crypto`).
  - [ ] Compare the computed hash against the stored hash. If any mismatch is found, return `{ valid: false, checkedCount, brokenAt: eventId }`.
  - [ ] If all hashes match, return `{ valid: true, checkedCount }`.
  - [ ] The function operates entirely offline — no Hub API calls. It works on whatever events are currently in Dexie.
  - [ ] Export the result type:
    ```typescript
    interface AuditChainVerificationResult {
      valid: boolean
      checkedCount: number
      brokenAt?: string  // event ID where the chain broke
    }
    ```

- [ ] **Task 4: Dexie Index for Sample-Scoped Queries** (AC: 5, 6)
  - [ ] The existing `clientAuditLog` table in Dexie already stores all audit events with the schema `'id, status, queuedAt, [status+queuedAt]'` (from `DexieAuditAdapter`).
  - [ ] Evaluate whether a compound index on `metadata.sampleId` is needed for efficient per-sample chain verification. If the volume of audit events is expected to be manageable (hundreds per lab per day, not millions), a full-table scan with `.filter()` is acceptable in v1 — add a `// TODO: add index if performance degrades` comment.
  - [ ] If an index is needed, add a new Dexie version upgrade in `db.ts` that adds the index. The `clientAuditLog` table is managed by the `DexieAuditAdapter` from the shared package, so coordinate the schema update carefully — the index should be added in the lab-lite Dexie version chain, not in the shared adapter.

- [ ] **Task 5: Integration Hooks for Story 42.3 Chain-of-Custody** (AC: 3, 11)
  - [ ] Identify the sample status transition points from Story 42.3 (Received -> In Processing -> Completed -> Reported).
  - [ ] At each transition point, call `reportLabLifecycleEvent()` with the appropriate event type:
    - "Receive Sample" action -> `SAMPLE_RECEIVED` (with `custodyFrom`/`custodyTo` if applicable)
    - Sample moves to processing -> `SAMPLE_PROCESSED`
    - Result entry saved -> `RESULT_ENTERED`
    - Supervisor authorizes result -> `RESULT_AUTHORIZED`
    - Result released to ordering physician -> `RESULT_RELEASED`
    - Result delivered via notification/sync -> `RESULT_DELIVERED`
    - Result amended -> `RESULT_AMENDED` (with `amendmentReason` code)
  - [ ] If Story 42.3 is not yet implemented, create placeholder integration comments (`// INTEGRATION: Story 42.3 — call reportLabLifecycleEvent('SAMPLE_RECEIVED', ...) here`) at the logical hook points so the wiring is straightforward when 42.3 lands.

- [ ] **Task 6: Tests** (AC: 12)
  - [ ] **Unit: Event emission** — For each of the 7 event types, verify that `reportLabLifecycleEvent()` calls `emitClientAudit()` with the correct `action`, `resourceType`, `resourceId`, and `metadata` shape. Mock `emitClientAudit`.
  - [ ] **Unit: PHI guard** — Verify that if a caller accidentally includes PHI fields (e.g., `firstName` in metadata), the existing PHI guard in `emitClientAudit()` strips them before storage.
  - [ ] **Unit: Never throws** — Verify that `reportLabLifecycleEvent()` does not throw even when the audit adapter is null or throws internally.
  - [ ] **Integration: Hash chain verification** — Insert a sequence of audit events into a fake-indexeddb Dexie instance, run `verifyResultAuditChain()`, assert `{ valid: true }`.
  - [ ] **Integration: Tamper detection** — Insert events, modify one event's metadata, run verification, assert `{ valid: false, brokenAt: modifiedEventId }`.
  - [ ] **Integration: Empty chain** — Run `verifyResultAuditChain()` for a non-existent sampleId, assert `{ valid: true, checkedCount: 0 }`.
  - [ ] **Integration: Offline verification** — Confirm `verifyResultAuditChain()` works without mocking any network calls (pure Dexie).

## Dev Notes

### Architecture: Building ON TOP of @ultranos/audit-logger

This story does NOT create a new audit system. It extends the existing one:

```
@ultranos/shared-types        <- new AuditAction + AuditResourceType enum values (Task 1)
        |
@ultranos/audit-logger         <- unchanged: client.ts, DexieAuditAdapter, AuditDrainWorker
        |
apps/lab-lite/src/lib/
  audit-client.ts              <- new reportLabLifecycleEvent() function (Task 2)
  audit-chain-verifier.ts      <- new verifyResultAuditChain() function (Task 3)
```

The existing `emitClientAudit()` in `@ultranos/audit-logger/client` handles all the heavy lifting: generating the event ID, setting `queuedAt`, persisting to Dexie via the adapter, and PHI field stripping. The new `reportLabLifecycleEvent()` is a thin domain-specific wrapper — exactly like the existing `reportAuthEvent()` and `reportQueueAuditEvent()`.

### Hash Chain: Client vs. Hub

There are two hash chains in the Ultranos audit system:

1. **Hub-side chain** (`packages/audit-logger/src/logger.ts`): Uses Node.js `crypto.createHash('sha256')`. Serialized via PostgreSQL advisory lock (`audit_emit_with_lock` RPC). The chain is global — all events across all apps form a single chain. This is the chain verified by Story 23.3 (daily integrity monitoring).

2. **Client-side chain** (this story): Uses Web Crypto API `crypto.subtle.digest('SHA-256', ...)`. The chain is per-device — each Lab-Lite instance maintains its own local chain in Dexie. The `verifyResultAuditChain()` function verifies a subset of this chain filtered by `sampleId`.

The client-side chain provides **immediate, offline tamper detection** for a specific sample's audit trail. The Hub-side chain provides **global tamper detection** across all events from all apps. Both are needed.

**Important:** The `DexieAuditAdapter.append()` method currently does NOT compute or store a chain hash — it stores the raw `ClientAuditEvent` as-is. To enable client-side chain verification, we need to either:
- **Option A (Recommended):** Compute and store a `chainHash` field on each `ClientAuditEvent` at append time. This requires extending the `ClientAuditEvent` type in `@ultranos/audit-logger/client.ts` to include an optional `chainHash?: string` field, and updating `DexieAuditAdapter.append()` to fetch the previous event's hash, compute the new hash, and store it. This is the cleanest approach because it keeps the chain computation at the storage layer.
- **Option B:** Compute hashes lazily during verification only. Simpler to implement but slower for large chains and cannot detect corruption until verification is explicitly requested.

**Recommendation: Option A.** The chain hash should be computed at write time, consistent with how the Hub-side `AuditLogger.emit()` works. This requires a small extension to the shared `@ultranos/audit-logger` package — adding `chainHash` to `ClientAuditEvent` and updating `DexieAuditAdapter.append()` to compute it. This is a backward-compatible change (the field is optional, existing events without it are treated as genesis-adjacent).

### Web Crypto API for SHA-256

The Hub-side logger uses Node.js `crypto.createHash('sha256')`. In the browser, use the Web Crypto API equivalent:

```typescript
async function sha256(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
```

The hash input payload must match the Hub-side `computeChainHash()` structure from `packages/audit-logger/src/logger.ts` — serialize the same fields in the same JSON shape (`{ prevHash, id, timestamp, actorId, actorRole, action, resourceType, resourceId, patientId, outcome }`). Use the `hlcTimestamp` as the `timestamp` field.

### New AuditAction Enum Values

Seven new values for `packages/shared-types/src/enums.ts`:

| Enum Value | When Emitted | resourceType |
|---|---|---|
| `SAMPLE_RECEIVED` | Tech taps "Receive Sample" on an order | `LAB_SAMPLE` |
| `SAMPLE_PROCESSED` | Sample moves to "In Processing" status | `LAB_SAMPLE` |
| `RESULT_ENTERED` | Tech saves result data into the template | `LAB_RESULT` |
| `RESULT_AUTHORIZED` | Supervisor (or senior tech) authorizes the result | `LAB_RESULT` |
| `RESULT_RELEASED` | Result is released to the ordering physician | `LAB_RESULT` |
| `RESULT_AMENDED` | A released result is corrected (Story 43.3) | `LAB_RESULT` |
| `RESULT_DELIVERED` | Delivery confirmed (push notification sent, OPD sync complete, patient portal updated) | `LAB_RESULT` |

### Integration with Story 42.3 (Chain of Custody)

Story 42.3 defines the sample status pipeline: `Received -> In Processing -> Completed -> Reported`. Each status transition is a chain-of-custody event that must also emit an audit event. The mapping:

| 42.3 Status Transition | 43.1 Audit Event | Additional Context |
|---|---|---|
| Order received, tech taps "Receive Sample" | `SAMPLE_RECEIVED` | `custodyFrom` (courier/physician), `custodyTo` (receiving tech), sample condition |
| Sample begins processing | `SAMPLE_PROCESSED` | Instrument/bench assignment if applicable |
| Result entered into template | `RESULT_ENTERED` | Template version, auto-flag status |
| Supervisor authorization | `RESULT_AUTHORIZED` | Authorizer identity (may differ from entering tech) |
| Result released | `RESULT_RELEASED` | Ordering physician reference |
| Result delivered to OPD/patient | `RESULT_DELIVERED` | Delivery channel |
| Result amended post-release | `RESULT_AMENDED` | Reason code, original result reference |

The chain-of-custody timeline from 42.3 and the audit chain from 43.1 are complementary views of the same events. The custody timeline is the user-facing display; the audit chain is the cryptographic proof. Both reference the same `sampleId`.

### Metadata Shape (No PHI)

All metadata fields must contain only opaque IDs and codes — never patient names, diagnoses, or result values. Example metadata for a `RESULT_ENTERED` event:

```json
{
  "sampleId": "LAB-20260530-0042",
  "orderId": "order-uuid-abc",
  "diagnosticReportId": "dr-uuid-xyz",
  "templateVersion": "CBC-v2.1",
  "autoFlagStatus": "HIGH",
  "source": "lab-lite"
}
```

The actual result values (e.g., WBC count, hemoglobin) are NOT included in the audit event. The audit event proves *that* a result was entered, *by whom*, and *when* — not *what* the result was. The result content lives in the DiagnosticReport resource, accessible via `diagnosticReportId`.

### Dexie Storage Considerations

The existing `clientAuditLog` table (managed by `DexieAuditAdapter`) stores all audit events in a single flat table. For v1, sample-scoped queries will use `.filter()` on `metadata.sampleId`. This is adequate for the expected volume (a busy lab processes ~100-200 samples/day, each generating ~5-7 audit events = ~1,000-1,400 events/day). The drain worker syncs and marks events as `'synced'`, so the pending backlog stays small.

If performance becomes an issue later, a compound index can be added in a future Dexie version upgrade.

### Testing Strategy

Use `fake-indexeddb` (already in lab-lite devDependencies) for Dexie-based integration tests. The hash chain verification tests should:
1. Create a Dexie instance with the `clientAuditLog` table.
2. Insert a sequence of events with correctly computed chain hashes.
3. Run `verifyResultAuditChain()` and assert validity.
4. Tamper with one event (change a metadata field).
5. Re-run verification and assert the chain breaks at the tampered event.

Mock `emitClientAudit` for unit tests of `reportLabLifecycleEvent()` — the goal is to verify the correct payload shape, not to test the audit logger internals.

### References

- `apps/lab-lite/src/lib/audit-client.ts` — existing audit infrastructure to extend
- `packages/audit-logger/src/client.ts` — `emitClientAudit()`, `ClientAuditEvent` type, PHI guard
- `packages/audit-logger/src/logger.ts` — Hub-side `computeChainHash()` algorithm (reference for hash computation)
- `packages/audit-logger/src/adapters/dexie-adapter.ts` — `DexieAuditAdapter`, `CLIENT_AUDIT_SCHEMA`
- `packages/audit-logger/src/drain.ts` — `AuditDrainWorker` (unchanged, syncs all events including new types)
- `packages/shared-types/src/enums.ts` — `AuditAction`, `AuditResourceType` enums to extend
- `apps/lab-lite/src/lib/hlc.ts` — HLC singleton for timestamp generation
- `apps/lab-lite/src/lib/db.ts` — Dexie database schema
- `apps/lab-lite/src/components/AuditDrainInit.tsx` — drain worker lifecycle (unchanged)
- Epic 42, Story 42.3 — chain-of-custody status pipeline (integration target)
- Epic 43, Story 43.3 — amendment & correction protocol (uses RESULT_AMENDED event from this story)
